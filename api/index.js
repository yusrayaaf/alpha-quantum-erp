// api/index.js — Alpha Quantum ERP v20 — Unified Serverless Router
// Domain: erp.alpha-01.info | Landing: alpha-01.info
import { getDb, nextSeq, auditLog } from './_db.js';
import {
  requireAuth, corsHeaders, hashPassword, signJWT,
  isCreator, isCubeAdmin, isSuperUser
} from './_auth.js';
import { uploadFile, parseBase64Upload } from './_storage.js';
import { sendEmail, expenseApprovedTemplate } from './_email.js';

// ── HELPERS ────────────────────────────────────────────────────────────────────
const toDoc  = r  => r ? { ...r } : null;
const toDocs = rs => (rs || []).map(toDoc);

function getPerm(user, mod) {
  if (['creator','cube_admin','superuser'].includes(user.role)) return 'full_control';
  return user.permissions?.[mod] ?? 'none';
}
const canView        = (u, m) => getPerm(u, m) !== 'none';
const canFullControl = (u, m) =>
  ['creator','cube_admin','superuser'].includes(u.role) || getPerm(u, m) === 'full_control';

function defaultFeatures(plan) {
  const b = { finance: true, expenses: true, invoices: true };
  if (plan === 'free')       return { ...b, users_limit: 3  };
  if (plan === 'starter')    return { ...b, hr: true, crm: true, users_limit: 10  };
  if (plan === 'business')   return { ...b, hr: true, crm: true, projects: true, reports: true, users_limit: 50  };
  if (plan === 'enterprise') return { ...b, hr: true, crm: true, projects: true, reports: true, custom_forms: true, api_access: true, users_limit: -1 };
  return b;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? 'unknown';

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Safe body parsing — Vercel may send raw string in some edge cases
  if (req.body && typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  }
  if (!req.body || typeof req.body !== 'object') req.body = {};

  // Route is passed as ?r=route/path
  const route = ((req.query?.r ?? req.query?.route) || '').replace(/^\/+/, '');

  // ── DB INIT ─────────────────────────────────────────────────────────────────
  let sql;
  try { sql = await getDb(); }
  catch (e) {
    console.error('[DB]', e.message);
    return res.status(500).json({ error: 'Database error: ' + e.message });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PUBLIC ROUTES (no auth required)
  // ════════════════════════════════════════════════════════════════════════════

  // ── HEALTH ──────────────────────────────────────────────────────────────────
  if (route === 'health') {
    try {
      const [t] = await sql`SELECT NOW()::text as ts`;
      const [u] = await sql`SELECT COUNT(*)::int cnt FROM users`.catch(() => [{ cnt: -1 }]);
      const cr  = await sql`SELECT username, is_active FROM users WHERE role='creator' LIMIT 1`.catch(() => []);
      return res.json({
        status: 'ok', version: '20', db: 'connected', time: t.ts,
        users: u.cnt, creator_exists: cr.length > 0,
        creator_username: cr[0]?.username ?? null,
        env_creator: (process.env.VITE_CREATOR_USERNAME || 'maynulshaon').toLowerCase(),
        env_db: !!process.env.DATABASE_URL,
      });
    } catch (e) {
      return res.status(500).json({ status: 'error', error: e.message, env_db: !!process.env.DATABASE_URL });
    }
  }

  // ── DEBUG LOGIN (diagnose hash mismatch) ────────────────────────────────────
  if (route === 'debug-login') {
    try {
      const envUser = (process.env.VITE_CREATOR_USERNAME || 'maynulshaon').toLowerCase();
      const envPass = process.env.CREATOR_PASSWORD || 'Creator@2025!';
      const envHash = hashPassword(envPass);
      const dbRows  = await sql`SELECT username, LEFT(password_hash,12) h FROM users WHERE role='creator' LIMIT 1`.catch(() => []);
      return res.json({
        env_username:   envUser,
        env_pass_set:   !!process.env.CREATOR_PASSWORD,
        env_hash_start: envHash.slice(0, 12),
        db_row:         dbRows[0] ?? null,
        match:          dbRows[0] ? dbRows[0].h === envHash.slice(0, 12) : false,
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── AUTH / LOGIN ────────────────────────────────────────────────────────────
  if (route === 'auth/login' && req.method === 'POST') {
    try {
      const body     = req.body || {};
      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      if (!username || !password)
        return res.status(400).json({ error: 'Username and password are required.' });

      const hash = hashPassword(password);

      // Fetch user with safe explicit column list
      let rows = [];
      try {
        rows = await sql`
          SELECT
            id, username, email, full_name, role,
            cube_id, password_hash, is_active,
            COALESCE(permissions, '{}')::jsonb AS permissions,
            COALESCE(department, '')  AS department,
            COALESCE(phone, '')       AS phone,
            avatar_url, last_login, created_at
          FROM users
          WHERE LOWER(username) = ${username} AND is_active = TRUE
          LIMIT 1`;
      } catch {
        // Fallback for old schema without all columns
        rows = await sql`
          SELECT id, username, email, full_name, role,
                 cube_id, password_hash, is_active
          FROM users
          WHERE LOWER(username) = ${username} AND is_active = TRUE
          LIMIT 1`.catch(() => []);
        if (rows.length) { rows[0].permissions = {}; rows[0].department = ''; }
      }

      // If no user at all — try auto-seed creator on completely empty DB
      if (!rows.length) {
        const [cnt] = await sql`SELECT COUNT(*)::int c FROM users`.catch(() => [{ c: 0 }]);
        if (cnt.c === 0) {
          const cu = (process.env.VITE_CREATOR_USERNAME || 'maynulshaon').toLowerCase();
          const cp = process.env.CREATOR_PASSWORD || 'Creator@2025!';
          if (username === cu && password === cp) {
            await sql`
              INSERT INTO users (username, email, password_hash, full_name, role, is_active, permissions)
              VALUES (${cu}, ${process.env.CREATOR_EMAIL || 'erp@alpha-01.info'},
                      ${hashPassword(cp)}, ${process.env.CREATOR_FULL_NAME || 'System Creator'},
                      'creator', TRUE, '{}')
              ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash, role = 'creator', is_active = TRUE`.catch(() => {});
            rows = await sql`SELECT id,username,email,full_name,role,cube_id,password_hash,is_active FROM users WHERE LOWER(username)=${cu} LIMIT 1`.catch(() => []);
            if (rows.length) { rows[0].permissions = {}; rows[0].department = ''; }
          }
        }
        if (!rows.length)
          return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const user = rows[0];

      // Password check
      if (user.password_hash !== hash)
        return res.status(401).json({ error: 'Invalid username or password.' });

      // Update last login (non-blocking)
      sql`UPDATE users SET last_login=NOW() WHERE id=${user.id}`.catch(() => {});

      const token = signJWT({
        sub:         user.id,
        username:    user.username,
        full_name:   user.full_name,
        email:       user.email,
        role:        user.role,
        cube_id:     user.cube_id  ?? null,
        permissions: user.permissions ?? {},
      });

      const { password_hash, ...safe } = user;
      return res.status(200).json({ token, user: safe });

    } catch (e) {
      console.error('[login]', e.message);
      return res.status(500).json({ error: 'Login failed: ' + e.message });
    }
  }

  // ── AUTH / ME ───────────────────────────────────────────────────────────────
  if (route === 'auth/me' && req.method === 'GET') {
    try {
      const p    = requireAuth(req);
      const rows = await sql`
        SELECT id,username,email,full_name,role,cube_id,
               COALESCE(permissions,'{}')::jsonb AS permissions,
               department,phone,avatar_url,last_login
        FROM users WHERE id=${p.sub} LIMIT 1`;
      if (!rows.length) return res.status(404).json({ error: 'User not found' });
      return res.json({ user: rows[0] });
    } catch (e) { return res.status(401).json({ error: e.message }); }
  }

  // ── CUBE REQUEST (public signup) ─────────────────────────────────────────────
  if (route === 'cube/request' && req.method === 'POST') {
    try {
      const { company_name, admin_name, admin_email, admin_phone, plan, message } = req.body;
      if (!company_name || !admin_name || !admin_email)
        return res.status(400).json({ error: 'company_name, admin_name, admin_email required' });
      const ex = await sql`SELECT id, status FROM cube_requests WHERE LOWER(admin_email)=LOWER(${admin_email}) LIMIT 1`;
      if (ex.length) return res.status(409).json({ error: 'Request already exists', status: ex[0].status });
      const r = await sql`
        INSERT INTO cube_requests (company_name, admin_name, admin_email, admin_phone, plan, message)
        VALUES (${company_name}, ${admin_name}, ${admin_email.toLowerCase()}, ${admin_phone||''}, ${plan||'starter'}, ${message||''})
        RETURNING id`;
      return res.status(201).json({ ok: true, request_id: r[0].id });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AUTH GUARD — all routes below require valid JWT
  // ════════════════════════════════════════════════════════════════════════════
  let authUser;
  try { authUser = requireAuth(req); }
  catch (e) { return res.status(401).json({ error: e.message }); }
  const cubeId = authUser.cube_id ?? null;

  // ════════════════════════════════════════════════════════════════════════════
  // CREATOR-ONLY ROUTES
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'creator/cube-requests' && req.method === 'GET') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      return res.json({ requests: toDocs(await sql`SELECT * FROM cube_requests ORDER BY created_at DESC`) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/cube-requests/approve' && req.method === 'POST') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      const { request_id, admin_username, admin_password, cube_slug, plan } = req.body;
      if (!request_id || !admin_username || !admin_password || !cube_slug)
        return res.status(400).json({ error: 'request_id, admin_username, admin_password, cube_slug required' });
      const [reqDoc] = await sql`SELECT * FROM cube_requests WHERE id=${request_id} LIMIT 1`;
      if (!reqDoc) return res.status(404).json({ error: 'Request not found' });
      if (reqDoc.status !== 'pending') return res.status(409).json({ error: 'Already processed' });
      const slugOk = await sql`SELECT id FROM cubes WHERE slug=${cube_slug.toLowerCase()} LIMIT 1`;
      if (slugOk.length) return res.status(409).json({ error: 'Slug already taken' });
      const [cube] = await sql`
        INSERT INTO cubes (slug, company_name, plan, features, admin_email, admin_name)
        VALUES (${cube_slug.toLowerCase()}, ${reqDoc.company_name}, ${plan||reqDoc.plan||'starter'},
                ${defaultFeatures(plan||'starter')}, ${reqDoc.admin_email}, ${reqDoc.admin_name})
        RETURNING id`;
      await sql`
        INSERT INTO users (username, email, password_hash, full_name, role, cube_id, is_active, permissions)
        VALUES (${admin_username.toLowerCase()}, ${reqDoc.admin_email}, ${hashPassword(admin_password)},
                ${reqDoc.admin_name}, 'cube_admin', ${cube.id}, TRUE, '{}')`;
      await sql`UPDATE cube_requests SET status='approved', cube_id=${cube.id}, approved_at=NOW(), approved_by=${authUser.sub} WHERE id=${request_id}`;
      await auditLog(sql, authUser, 'CUBE_CREATED', 'cube', cube.id, { cube_slug }, ip);
      return res.status(201).json({ ok: true, cube_id: cube.id, cube_slug, admin_username });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/cube-requests/reject' && req.method === 'POST') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      const { request_id, reason } = req.body;
      await sql`UPDATE cube_requests SET status='rejected', rejection_reason=${reason||''}, rejected_at=NOW() WHERE id=${request_id}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/cubes' && req.method === 'GET') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try { return res.json({ cubes: toDocs(await sql`SELECT * FROM cubes ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/cubes/update' && req.method === 'PATCH') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      const { cube_id, plan, is_active, features } = req.body;
      if (plan !== undefined)      await sql`UPDATE cubes SET plan=${plan}, updated_at=NOW() WHERE id=${cube_id}`;
      if (features !== undefined)  await sql`UPDATE cubes SET features=${features}, updated_at=NOW() WHERE id=${cube_id}`;
      if (is_active !== undefined) await sql`UPDATE cubes SET is_active=${is_active}, updated_at=NOW() WHERE id=${cube_id}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/stats' && req.method === 'GET') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      const [u,c,p,e,i] = await Promise.all([
        sql`SELECT COUNT(*)::int cnt FROM users`,
        sql`SELECT COUNT(*)::int cnt FROM cubes`,
        sql`SELECT COUNT(*)::int cnt FROM cube_requests WHERE status='pending'`,
        sql`SELECT COUNT(*)::int cnt FROM expenses`,
        sql`SELECT COUNT(*)::int cnt FROM invoices`,
      ]);
      return res.json({ stats: { users_total:u[0].cnt, cubes_total:c[0].cnt, pending_requests:p[0].cnt, expenses_total:e[0].cnt, invoices_total:i[0].cnt } });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/all-users' && req.method === 'GET') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      return res.json({ users: toDocs(await sql`SELECT id,username,email,full_name,role,cube_id,department,is_active,created_at FROM users ORDER BY created_at DESC`) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/reset-password' && req.method === 'POST') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try {
      const { user_id, new_password } = req.body;
      await sql`UPDATE users SET password_hash=${hashPassword(new_password)}, updated_at=NOW() WHERE id=${user_id}`;
      await auditLog(sql, authUser, 'PASSWORD_RESET', 'user', user_id, {}, ip);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'creator/audit-log' && req.method === 'GET') {
    if (!isCreator(authUser)) return res.status(403).json({ error: 'Creator only' });
    try { return res.json({ logs: toDocs(await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 500`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CUBE SETTINGS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'cube/me' && req.method === 'GET') {
    try {
      if (!cubeId) return res.json({ cube: null });
      const [cube] = await sql`SELECT * FROM cubes WHERE id=${cubeId} LIMIT 1`;
      return res.json({ cube: cube ?? null });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'cube/settings' && req.method === 'PATCH') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { company_name, logo_url } = req.body;
      if (company_name) await sql`UPDATE cubes SET company_name=${company_name}, updated_at=NOW() WHERE id=${cubeId}`;
      if (logo_url)     await sql`UPDATE cubes SET logo_url=${logo_url}, updated_at=NOW() WHERE id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // USERS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'users' && req.method === 'GET') {
    try {
      const rows = isCreator(authUser)
        ? await sql`SELECT id,username,email,full_name,role,cube_id,department,is_active,COALESCE(permissions,'{}')::jsonb AS permissions,created_at FROM users ORDER BY created_at DESC`
        : await sql`SELECT id,username,email,full_name,role,cube_id,department,is_active,COALESCE(permissions,'{}')::jsonb AS permissions,created_at FROM users WHERE cube_id=${cubeId} ORDER BY created_at DESC`;
      return res.json({ users: toDocs(rows) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'users' && req.method === 'POST') {
    if (!canFullControl(authUser, 'users')) return res.status(403).json({ error: 'Insufficient permissions' });
    try {
      const { username, email, full_name, role, department, phone, whatsapp_number, password, permissions } = req.body;
      if (!username || !email || !full_name || !password)
        return res.status(400).json({ error: 'username, email, full_name, password required' });
      const [row] = await sql`
        INSERT INTO users (username, email, password_hash, full_name, role, cube_id, department, phone, whatsapp_number, is_active, permissions, created_by)
        VALUES (${username.toLowerCase()}, ${email.toLowerCase()}, ${hashPassword(password)}, ${full_name},
                ${role||'staff'}, ${cubeId}, ${department||''}, ${phone||''}, ${whatsapp_number||''}, TRUE,
                ${permissions||{}}, ${authUser.sub})
        RETURNING id,username,email,full_name,role,cube_id,department,is_active,created_at`;
      await auditLog(sql, authUser, 'USER_CREATED', 'user', row.id, { username }, ip);
      return res.status(201).json({ user: row });
    } catch (e) {
      if (e.message.includes('unique')) return res.status(409).json({ error: 'Username or email already exists' });
      return res.status(500).json({ error: e.message });
    }
  }

  if (route.match(/^users\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    if (!canFullControl(authUser, 'users')) return res.status(403).json({ error: 'Insufficient permissions' });
    try {
      const uid = route.split('/')[1];
      const { password, full_name, department, phone, role, is_active, email, whatsapp_number } = req.body;
      if (password         !== undefined) await sql`UPDATE users SET password_hash=${hashPassword(password)}, updated_at=NOW() WHERE id=${uid}`;
      if (full_name        !== undefined) await sql`UPDATE users SET full_name=${full_name}, updated_at=NOW() WHERE id=${uid}`;
      if (email            !== undefined) await sql`UPDATE users SET email=${email}, updated_at=NOW() WHERE id=${uid}`;
      if (department       !== undefined) await sql`UPDATE users SET department=${department}, updated_at=NOW() WHERE id=${uid}`;
      if (phone            !== undefined) await sql`UPDATE users SET phone=${phone}, updated_at=NOW() WHERE id=${uid}`;
      if (whatsapp_number  !== undefined) await sql`UPDATE users SET whatsapp_number=${whatsapp_number}, updated_at=NOW() WHERE id=${uid}`;
      if (role             !== undefined) await sql`UPDATE users SET role=${role}, updated_at=NOW() WHERE id=${uid}`;
      if (is_active        !== undefined) await sql`UPDATE users SET is_active=${is_active}, updated_at=NOW() WHERE id=${uid}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'users/delete' && req.method === 'POST') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { user_id } = req.body;
      await sql`UPDATE users SET is_active=FALSE, updated_at=NOW() WHERE id=${user_id} AND cube_id=${cubeId}`;
      await auditLog(sql, authUser, 'USER_DEACTIVATED', 'user', user_id, {}, ip);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'users/change-password' && req.method === 'POST') {
    try {
      const { current_password, new_password } = req.body;
      const [row] = await sql`SELECT password_hash FROM users WHERE id=${authUser.sub} LIMIT 1`;
      if (!row) return res.status(404).json({ error: 'User not found' });
      if (row.password_hash !== hashPassword(current_password))
        return res.status(400).json({ error: 'Current password incorrect' });
      await sql`UPDATE users SET password_hash=${hashPassword(new_password)}, updated_at=NOW() WHERE id=${authUser.sub}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PERMISSIONS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'permissions' && req.method === 'GET') {
    try {
      const rows = cubeId
        ? await sql`SELECT id,username,email,full_name,role,COALESCE(permissions,'{}')::jsonb AS permissions FROM users WHERE cube_id=${cubeId}`
        : await sql`SELECT id,username,email,full_name,role,COALESCE(permissions,'{}')::jsonb AS permissions FROM users`;
      return res.json({ users: toDocs(rows) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'permissions' && req.method === 'POST') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { user_id, module, level } = req.body;
      await sql`
        UPDATE users
        SET permissions = jsonb_set(COALESCE(permissions,'{}'), ${[module]}, ${JSON.stringify(level)}::jsonb),
            updated_at  = NOW()
        WHERE id=${user_id}`;
      await auditLog(sql, authUser, 'PERM_CHANGED', 'user', user_id, { module, level }, ip);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FILE UPLOAD
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'uploads/file' && req.method === 'POST') {
    try {
      const { buffer, filename, mimetype } = parseBase64Upload(req.body);
      const result = await uploadFile(buffer, filename, mimetype, `cubes/${cubeId||'global'}`);
      return res.json({ url: result.url, key: result.key });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPENSES
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'expenses' && req.method === 'GET') {
    try {
      const perm = getPerm(authUser, 'finance');
      const rows = (isSuperUser(authUser) || !['submit_only','view_own','none'].includes(perm))
        ? await sql`SELECT * FROM expenses WHERE cube_id=${cubeId} ORDER BY created_at DESC LIMIT 500`
        : await sql`SELECT * FROM expenses WHERE cube_id=${cubeId} AND submitted_by=${authUser.sub} ORDER BY created_at DESC LIMIT 500`;
      return res.json({ expenses: toDocs(rows) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'expenses' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `exp_${cubeId}`);
      const ref = `EXP-${String(n).padStart(5,'0')}`;
      const { title, amount, total_amount, grand_total, vat_amount, vat_rate, category, vendor, description, receipt_url, expense_date, items } = req.body;
      const ta = parseFloat(total_amount || amount || 0);
      const gt = parseFloat(grand_total  || ta);
      const [row] = await sql`
        INSERT INTO expenses (ref, cube_id, title, amount, total_amount, grand_total, vat_amount, vat_rate,
          category, vendor, description, receipt_url, expense_date, items, submitted_by, submitted_by_name, status)
        VALUES (${ref}, ${cubeId}, ${title||''}, ${parseFloat(amount||0)}, ${ta}, ${gt},
          ${parseFloat(vat_amount||0)}, ${parseFloat(vat_rate||15)}, ${category||''}, ${vendor||''},
          ${description||''}, ${receipt_url||null}, ${expense_date||null},
          ${JSON.stringify(items||[])}, ${authUser.sub}, ${authUser.full_name}, 'pending')
        RETURNING *`;
      await auditLog(sql, authUser, 'EXPENSE_CREATED', 'expense', row.id, { ref }, ip);
      return res.status(201).json({ expense: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^expenses\/[0-9a-f-]{36}$/) && req.method === 'GET') {
    try {
      const [row] = await sql`SELECT * FROM expenses WHERE id=${route.split('/')[1]} AND cube_id=${cubeId} LIMIT 1`;
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json({ expense: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^expenses\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    try {
      const id = route.split('/')[1];
      const { title, amount, total_amount, category, vendor, description } = req.body;
      await sql`UPDATE expenses SET
        title       = COALESCE(${title||null},       title),
        amount      = COALESCE(${amount      ? parseFloat(amount)       : null}, amount),
        total_amount= COALESCE(${total_amount? parseFloat(total_amount): null}, total_amount),
        category    = COALESCE(${category||null},    category),
        vendor      = COALESCE(${vendor||null},      vendor),
        description = COALESCE(${description||null}, description),
        updated_at  = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^expenses\/[0-9a-f-]{36}$/) && req.method === 'DELETE') {
    try {
      await sql`DELETE FROM expenses WHERE id=${route.split('/')[1]} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'expenses/approve' && req.method === 'POST') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { expense_id, action, note } = req.body;
      const status = action === 'approve' ? 'approved' : 'rejected';
      await sql`
        UPDATE expenses SET status=${status}, approved_by=${authUser.sub}, approved_by_name=${authUser.full_name},
          approval_note=${note||''}, approved_at=NOW(), updated_at=NOW()
        WHERE id=${expense_id} AND cube_id=${cubeId}`;
      await auditLog(sql, authUser, `EXPENSE_${status.toUpperCase()}`, 'expense', expense_id, {}, ip);
      // Email notification (non-blocking)
      sql`SELECT e.*, u.email, u.full_name AS uname FROM expenses e JOIN users u ON u.id=e.submitted_by WHERE e.id=${expense_id} LIMIT 1`
        .then(([row]) => { if (row?.email) sendEmail({ to: row.email, ...expenseApprovedTemplate(row.uname, row.ref, row.grand_total||0, status) }).catch(()=>{}); })
        .catch(() => {});
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // INVOICES
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'invoices' && req.method === 'GET') {
    if (!canView(authUser, 'finance')) return res.status(403).json({ error: 'No access' });
    try {
      return res.json({ invoices: toDocs(await sql`SELECT * FROM invoices WHERE cube_id=${cubeId} ORDER BY created_at DESC LIMIT 500`) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'invoices' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `inv_${cubeId}`);
      const ref = `INV-${String(n).padStart(5,'0')}`;
      const { customer_name, customer_email, customer_address, items, subtotal, vat_rate, vat_amount, grand_total, due_date, notes } = req.body;
      const [row] = await sql`
        INSERT INTO invoices (ref, cube_id, customer_name, customer_email, customer_address, items, subtotal, vat_rate, vat_amount, grand_total, total_amount, due_date, notes, created_by, created_by_name, status)
        VALUES (${ref}, ${cubeId}, ${customer_name||''}, ${customer_email||''}, ${customer_address||''},
          ${JSON.stringify(items||[])}, ${parseFloat(subtotal||0)}, ${parseFloat(vat_rate||15)},
          ${parseFloat(vat_amount||0)}, ${parseFloat(grand_total||0)}, ${parseFloat(grand_total||0)},
          ${due_date||null}, ${notes||''}, ${authUser.sub}, ${authUser.full_name}, 'draft')
        RETURNING *`;
      return res.status(201).json({ invoice: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^invoices\/[0-9a-f-]{36}$/) && req.method === 'GET') {
    try {
      const [row] = await sql`SELECT * FROM invoices WHERE id=${route.split('/')[1]} AND cube_id=${cubeId} LIMIT 1`;
      if (!row) return res.status(404).json({ error: 'Not found' });
      return res.json({ invoice: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^invoices\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    try {
      const id = route.split('/')[1];
      const { status, customer_name, notes } = req.body;
      if (status)        await sql`UPDATE invoices SET status=${status}, updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      if (customer_name) await sql`UPDATE invoices SET customer_name=${customer_name}, updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      if (notes !== undefined) await sql`UPDATE invoices SET notes=${notes}, updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'invoices/approve' && req.method === 'POST') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { invoice_id, action, note } = req.body;
      const status = action === 'approve' ? 'approved' : 'rejected';
      await sql`UPDATE invoices SET status=${status}, approved_by=${authUser.sub}, approved_by_name=${authUser.full_name}, approval_note=${note||''}, approved_at=NOW(), updated_at=NOW() WHERE id=${invoice_id} AND cube_id=${cubeId}`;
      await auditLog(sql, authUser, `INVOICE_${status.toUpperCase()}`, 'invoice', invoice_id, {}, ip);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // APPROVALS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'approvals' && req.method === 'GET') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const [exps, invs] = await Promise.all([
        sql`SELECT * FROM expenses WHERE cube_id=${cubeId} AND status='pending' ORDER BY created_at DESC`,
        sql`SELECT * FROM invoices WHERE cube_id=${cubeId} AND status='pending' ORDER BY created_at DESC`,
      ]);
      return res.json({ expenses: toDocs(exps), invoices: toDocs(invs), total: exps.length + invs.length });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ASSETS / WORKERS / SALARY / ATTENDANCE / BUDGETS / INVESTMENTS / LIABILITIES
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'assets' && req.method === 'GET') {
    if (!canView(authUser, 'assets')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ assets: toDocs(await sql`SELECT * FROM assets WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'assets' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `ast_${cubeId}`);
      const ref = `AST-${String(n).padStart(5,'0')}`;
      const { name, category, purchase_price, current_value, purchase_date, location, serial_number, status, notes } = req.body;
      const [row] = await sql`
        INSERT INTO assets (ref, cube_id, name, category, purchase_price, current_value, purchase_date, location, serial_number, status, notes, created_by)
        VALUES (${ref}, ${cubeId}, ${name}, ${category||''}, ${parseFloat(purchase_price||0)},
          ${parseFloat(current_value||purchase_price||0)}, ${purchase_date||null},
          ${location||''}, ${serial_number||''}, ${status||'active'}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ asset: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'assets/update' && req.method === 'PATCH') {
    try {
      const { id, name, category, current_value, location, status, notes, serial_number } = req.body;
      await sql`UPDATE assets SET
        name          = COALESCE(${name||null},          name),
        category      = COALESCE(${category||null},      category),
        current_value = COALESCE(${current_value!=null ? parseFloat(current_value) : null}, current_value),
        location      = COALESCE(${location||null},      location),
        status        = COALESCE(${status||null},        status),
        notes         = COALESCE(${notes||null},         notes),
        serial_number = COALESCE(${serial_number||null}, serial_number),
        updated_at    = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'workers' && req.method === 'GET') {
    if (!canView(authUser, 'workers')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ workers: toDocs(await sql`SELECT * FROM workers WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'workers' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `wrk_${cubeId}`);
      const ref = `WRK-${String(n).padStart(5,'0')}`;
      const { full_name, position, department, phone, email, iqama_number, nationality, hire_date, salary, status, bank_account, notes, photo_url } = req.body;
      const [row] = await sql`
        INSERT INTO workers (ref, cube_id, full_name, position, department, phone, email, iqama_number, nationality, hire_date, salary, status, bank_account, notes, photo_url, created_by)
        VALUES (${ref}, ${cubeId}, ${full_name}, ${position||''}, ${department||''}, ${phone||''}, ${email||''},
          ${iqama_number||''}, ${nationality||''}, ${hire_date||null}, ${parseFloat(salary||0)},
          ${status||'active'}, ${bank_account||''}, ${notes||''}, ${photo_url||null}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ worker: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'workers/update' && req.method === 'POST') {
    try {
      const { id, full_name, position, department, phone, status, salary, notes } = req.body;
      await sql`UPDATE workers SET
        full_name  = COALESCE(${full_name||null},  full_name),
        position   = COALESCE(${position||null},   position),
        department = COALESCE(${department||null}, department),
        phone      = COALESCE(${phone||null},      phone),
        status     = COALESCE(${status||null},     status),
        salary     = COALESCE(${salary ? parseFloat(salary) : null}, salary),
        notes      = COALESCE(${notes||null},      notes),
        updated_at = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'salary' && req.method === 'GET') {
    if (!canView(authUser, 'salary')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ records: toDocs(await sql`SELECT * FROM salary WHERE cube_id=${cubeId} ORDER BY created_at DESC LIMIT 300`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'salary' && req.method === 'POST') {
    try {
      const { worker_id, amount, month, year, notes } = req.body;
      const [row] = await sql`
        INSERT INTO salary (cube_id, worker_id, amount, month, year, notes, paid_by, paid_at)
        VALUES (${cubeId}, ${worker_id||null}, ${parseFloat(amount||0)}, ${month||null}, ${year||null}, ${notes||''}, ${authUser.sub}, NOW())
        RETURNING *`;
      await auditLog(sql, authUser, 'SALARY_PAID', 'salary', row.id, { worker_id, amount }, ip);
      return res.status(201).json({ record: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'salary/pay' && req.method === 'POST') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { worker_id, amount, month, year, notes } = req.body;
      const [row] = await sql`
        INSERT INTO salary (cube_id, worker_id, amount, month, year, notes, paid_by, paid_at)
        VALUES (${cubeId}, ${worker_id}, ${parseFloat(amount||0)}, ${month||null}, ${year||null}, ${notes||''}, ${authUser.sub}, NOW())
        RETURNING *`;
      await auditLog(sql, authUser, 'SALARY_PAID', 'salary', row.id, { worker_id, amount }, ip);
      return res.status(201).json({ record: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'attendance' && req.method === 'GET') {
    try {
      const rows = req.query.worker_id
        ? await sql`SELECT * FROM attendance WHERE cube_id=${cubeId} AND worker_id=${req.query.worker_id} ORDER BY date DESC LIMIT 300`
        : await sql`SELECT * FROM attendance WHERE cube_id=${cubeId} ORDER BY date DESC LIMIT 300`;
      return res.json({ records: toDocs(rows) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'attendance' && req.method === 'POST') {
    try {
      const { worker_id, date, check_in, check_out, hours, status, notes } = req.body;
      const [row] = await sql`
        INSERT INTO attendance (cube_id, worker_id, date, check_in, check_out, hours, status, notes, created_by)
        VALUES (${cubeId}, ${worker_id}, ${date||null}, ${check_in||null}, ${check_out||null},
          ${parseFloat(hours||0)||null}, ${status||'present'}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ record: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'budgets' && req.method === 'GET') {
    if (!canView(authUser, 'budget')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ budgets: toDocs(await sql`SELECT * FROM budgets WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'budgets' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `bdg_${cubeId}`);
      const ref = `BDG-${String(n).padStart(5,'0')}`;
      const { title, category, amount, period, year, month, notes } = req.body;
      const [row] = await sql`
        INSERT INTO budgets (ref, cube_id, title, category, amount, period, year, month, notes, created_by)
        VALUES (${ref}, ${cubeId}, ${title}, ${category||''}, ${parseFloat(amount||0)}, ${period||''}, ${year||null}, ${month||null}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ budget: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'budgets/update' && req.method === 'PATCH') {
    try {
      const { id, title, amount, spent, status } = req.body;
      await sql`UPDATE budgets SET
        title  = COALESCE(${title||null},  title),
        amount = COALESCE(${amount ? parseFloat(amount) : null}, amount),
        spent  = COALESCE(${spent  ? parseFloat(spent)  : null}, spent),
        status = COALESCE(${status||null}, status),
        updated_at = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'investments' && req.method === 'GET') {
    if (!canView(authUser, 'investments')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ investments: toDocs(await sql`SELECT * FROM investments WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'investments' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `invt_${cubeId}`);
      const ref = `INVT-${String(n).padStart(5,'0')}`;
      const { title, type, amount, current_value, return_rate, start_date, maturity_date, notes } = req.body;
      const [row] = await sql`
        INSERT INTO investments (ref, cube_id, title, type, amount, current_value, return_rate, start_date, maturity_date, notes, created_by)
        VALUES (${ref}, ${cubeId}, ${title}, ${type||''}, ${parseFloat(amount||0)}, ${parseFloat(current_value||amount||0)}, ${parseFloat(return_rate||0)}, ${start_date||null}, ${maturity_date||null}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ investment: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'investments/update' && req.method === 'PATCH') {
    try {
      const { id, current_value, status, notes } = req.body;
      await sql`UPDATE investments SET
        current_value = COALESCE(${current_value ? parseFloat(current_value) : null}, current_value),
        status = COALESCE(${status||null}, status),
        notes  = COALESCE(${notes||null},  notes),
        updated_at = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'liabilities' && req.method === 'GET') {
    if (!canView(authUser, 'liabilities')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ liabilities: toDocs(await sql`SELECT * FROM liabilities WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'liabilities' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `lia_${cubeId}`);
      const ref = `LIA-${String(n).padStart(5,'0')}`;
      const { title, type, amount, paid_amount, due_date, creditor, notes } = req.body;
      const [row] = await sql`
        INSERT INTO liabilities (ref, cube_id, title, type, amount, paid_amount, due_date, creditor, notes, created_by)
        VALUES (${ref}, ${cubeId}, ${title}, ${type||''}, ${parseFloat(amount||0)}, ${parseFloat(paid_amount||0)}, ${due_date||null}, ${creditor||''}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ liability: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'liabilities/update' && req.method === 'PATCH') {
    try {
      const { id, paid_amount, status, notes } = req.body;
      await sql`UPDATE liabilities SET
        paid_amount = COALESCE(${paid_amount ? parseFloat(paid_amount) : null}, paid_amount),
        status = COALESCE(${status||null}, status),
        notes  = COALESCE(${notes||null},  notes),
        updated_at = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECTS & TASKS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'projects' && req.method === 'GET') {
    if (!canView(authUser, 'projects')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ projects: toDocs(await sql`SELECT * FROM projects WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'projects' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `prj_${cubeId}`);
      const ref = `PRJ-${String(n).padStart(5,'0')}`;
      const { title, description, status, priority, budget, start_date, end_date } = req.body;
      const [row] = await sql`
        INSERT INTO projects (ref, cube_id, title, description, status, priority, budget, start_date, end_date, created_by)
        VALUES (${ref}, ${cubeId}, ${title}, ${description||''}, ${status||'planning'}, ${priority||'medium'}, ${parseFloat(budget||0)}, ${start_date||null}, ${end_date||null}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ project: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^projects\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    try {
      const id = route.split('/')[1];
      const { title, status, priority, description } = req.body;
      await sql`UPDATE projects SET
        title       = COALESCE(${title||null},       title),
        status      = COALESCE(${status||null},      status),
        priority    = COALESCE(${priority||null},    priority),
        description = COALESCE(${description||null}, description),
        updated_at  = NOW()
        WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'tasks' && req.method === 'GET') {
    if (!canView(authUser, 'projects')) return res.status(403).json({ error: 'No access' });
    try {
      const rows = req.query.project_id
        ? await sql`SELECT * FROM tasks WHERE cube_id=${cubeId} AND project_id=${req.query.project_id} ORDER BY created_at DESC`
        : await sql`SELECT * FROM tasks WHERE cube_id=${cubeId} ORDER BY created_at DESC`;
      return res.json({ tasks: toDocs(rows) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'tasks' && req.method === 'POST') {
    try {
      const { title, description, status, priority, project_id, assigned_to, due_date } = req.body;
      const [row] = await sql`
        INSERT INTO tasks (cube_id, project_id, title, description, status, priority, assigned_to, due_date, created_by)
        VALUES (${cubeId}, ${project_id||null}, ${title}, ${description||''}, ${status||'todo'}, ${priority||'medium'}, ${assigned_to||null}, ${due_date||null}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ task: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^tasks\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    try {
      const id = route.split('/')[1];
      const { title, status, priority } = req.body;
      if (status === 'done') {
        await sql`UPDATE tasks SET title=COALESCE(${title||null},title), status=COALESCE(${status||null},status), priority=COALESCE(${priority||null},priority), completed_at=NOW(), updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      } else {
        await sql`UPDATE tasks SET title=COALESCE(${title||null},title), status=COALESCE(${status||null},status), priority=COALESCE(${priority||null},priority), updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      }
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CRM
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'customers' && req.method === 'GET') {
    if (!canView(authUser, 'crm')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ customers: toDocs(await sql`SELECT * FROM customers WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'customers' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `cus_${cubeId}`);
      const ref = `CUS-${String(n).padStart(5,'0')}`;
      const { name, email, phone, company, address, country, type, status, notes } = req.body;
      const [row] = await sql`
        INSERT INTO customers (ref, cube_id, name, email, phone, company, address, country, type, status, notes, created_by)
        VALUES (${ref}, ${cubeId}, ${name}, ${email||''}, ${phone||''}, ${company||''}, ${address||''}, ${country||''}, ${type||'customer'}, ${status||'active'}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ customer: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^customers\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    try {
      const id = route.split('/')[1];
      const { name, email, phone, status, notes } = req.body;
      await sql`UPDATE customers SET name=COALESCE(${name||null},name), email=COALESCE(${email||null},email), phone=COALESCE(${phone||null},phone), status=COALESCE(${status||null},status), notes=COALESCE(${notes||null},notes), updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'leads' && req.method === 'GET') {
    if (!canView(authUser, 'crm')) return res.status(403).json({ error: 'No access' });
    try { return res.json({ leads: toDocs(await sql`SELECT * FROM leads WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'leads' && req.method === 'POST') {
    try {
      const n   = await nextSeq(sql, `led_${cubeId}`);
      const ref = `LED-${String(n).padStart(5,'0')}`;
      const { name, email, phone, company, source, status, value, notes } = req.body;
      const [row] = await sql`
        INSERT INTO leads (ref, cube_id, name, email, phone, company, source, status, value, notes, created_by)
        VALUES (${ref}, ${cubeId}, ${name}, ${email||''}, ${phone||''}, ${company||''}, ${source||''}, ${status||'new'}, ${parseFloat(value||0)}, ${notes||''}, ${authUser.sub})
        RETURNING *`;
      return res.status(201).json({ lead: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route.match(/^leads\/[0-9a-f-]{36}$/) && req.method === 'PATCH') {
    try {
      const id = route.split('/')[1];
      const { name, status, value, notes } = req.body;
      await sql`UPDATE leads SET name=COALESCE(${name||null},name), status=COALESCE(${status||null},status), value=COALESCE(${value ? parseFloat(value) : null},value), notes=COALESCE(${notes||null},notes), updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'notifications' && req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM notifications WHERE user_id=${authUser.sub} ORDER BY created_at DESC LIMIT 50`;
      return res.json({ notifications: toDocs(rows), unread: rows.filter(n => !n.is_read).length });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'notifications/read' && req.method === 'POST') {
    try {
      await sql`UPDATE notifications SET is_read=TRUE WHERE user_id=${authUser.sub}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'notifications/templates') return res.json({ templates: [] });

  // ════════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'settings' && req.method === 'GET') {
    try {
      const rows = cubeId
        ? await sql`SELECT key, value FROM settings WHERE cube_id=${cubeId}`
        : await sql`SELECT key, value FROM settings WHERE cube_id IS NULL`;
      return res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'settings' && req.method === 'POST') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const { key, value } = req.body;
      await sql`
        INSERT INTO settings (cube_id, key, value) VALUES (${cubeId||null}, ${key}, ${value})
        ON CONFLICT (COALESCE(cube_id::TEXT,''), key)
        DO UPDATE SET value=${value}, updated_at=NOW()`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // WALLET / AUDIT / SUBSCRIPTION / CATEGORIES / FORMS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'wallet' && req.method === 'GET') {
    try {
      const [exps] = await sql`SELECT COALESCE(SUM(COALESCE(total_amount,grand_total,amount,0)),0) AS total FROM expenses WHERE cube_id=${cubeId} AND status='approved'`;
      const [invs] = await sql`SELECT COALESCE(SUM(COALESCE(grand_total,total_amount,0)),0) AS total FROM invoices WHERE cube_id=${cubeId} AND status IN ('paid','approved')`;
      const te = parseFloat(exps.total), tr = parseFloat(invs.total);
      return res.json({ wallet: { total_expenses: te, total_revenue: tr, balance: tr - te } });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'audit-log' && req.method === 'GET') {
    if (!isCubeAdmin(authUser)) return res.status(403).json({ error: 'Admin only' });
    try {
      const rows = isCreator(authUser)
        ? await sql`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`
        : await sql`SELECT * FROM audit_log WHERE cube_id=${cubeId} ORDER BY created_at DESC LIMIT 200`;
      return res.json({ logs: toDocs(rows) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'subscription' && req.method === 'GET') {
    try {
      let plan = 'free', features = {};
      if (cubeId) {
        const [row] = await sql`SELECT plan, features FROM cubes WHERE id=${cubeId} LIMIT 1`;
        if (row) { plan = row.plan; features = row.features; }
      }
      return res.json({ subscription: { plan, features } });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'categories' && req.method === 'GET') {
    const cats = ['Travel','Office Supplies','Marketing','Utilities','Maintenance','Food & Beverages','Equipment','Professional Services','IT & Technology','Other'];
    return res.json({ categories: cats.map((name, i) => ({ id: String(i+1), name })) });
  }

  if (route === 'forms' && req.method === 'GET') {
    try { return res.json({ forms: toDocs(await sql`SELECT * FROM forms WHERE cube_id=${cubeId} ORDER BY created_at DESC`) }); }
    catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'forms' && req.method === 'POST') {
    try {
      const { title, fields } = req.body;
      const [row] = await sql`INSERT INTO forms (cube_id, title, fields, created_by) VALUES (${cubeId}, ${title||'Untitled'}, ${JSON.stringify(fields||[])}, ${authUser.sub}) RETURNING *`;
      return res.status(201).json({ form: row });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'forms/update' && req.method === 'POST') {
    try {
      const { id, title, fields } = req.body;
      await sql`UPDATE forms SET title=COALESCE(${title||null},title), fields=COALESCE(${fields ? JSON.stringify(fields) : null}::jsonb, fields), updated_at=NOW() WHERE id=${id} AND cube_id=${cubeId}`;
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // REPORTS
  // ════════════════════════════════════════════════════════════════════════════

  if (route === 'reports/dashboard' && req.method === 'GET') {
    try {
      const [expS, invS, wrk, ast, cust, leads, proj] = await Promise.all([
        sql`SELECT COUNT(*)::int total, COALESCE(SUM(CASE WHEN status='approved' THEN COALESCE(total_amount,amount,0) ELSE 0 END),0) approved_total, COUNT(CASE WHEN status='pending' THEN 1 END)::int pending_count, COUNT(CASE WHEN status='approved' THEN 1 END)::int approved_count, COUNT(CASE WHEN status='rejected' THEN 1 END)::int rejected_count FROM expenses WHERE cube_id=${cubeId}`,
        sql`SELECT COUNT(*)::int total, COALESCE(SUM(CASE WHEN status IN ('paid','approved') THEN COALESCE(grand_total,total_amount,0) ELSE 0 END),0) approved_total, COUNT(CASE WHEN status='pending' THEN 1 END)::int pending_count FROM invoices WHERE cube_id=${cubeId}`,
        sql`SELECT COUNT(*)::int cnt FROM workers WHERE cube_id=${cubeId}`,
        sql`SELECT COUNT(*)::int cnt, COALESCE(SUM(COALESCE(current_value,purchase_price,0)),0) tv FROM assets WHERE cube_id=${cubeId}`,
        sql`SELECT COUNT(*)::int cnt FROM customers WHERE cube_id=${cubeId}`,
        sql`SELECT status, value FROM leads WHERE cube_id=${cubeId}`,
        sql`SELECT status FROM projects WHERE cube_id=${cubeId}`,
      ]);
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const [m] = await sql`SELECT COALESCE(SUM(COALESCE(total_amount,amount,0)),0) total FROM expenses WHERE cube_id=${cubeId} AND EXTRACT(YEAR FROM created_at)=${d.getFullYear()} AND EXTRACT(MONTH FROM created_at)=${d.getMonth()+1}`;
        months.push({ month: d.toLocaleString('default', { month: 'short' }), total: parseFloat(m.total) });
      }
      const te = parseFloat(expS[0].approved_total), tr = parseFloat(invS[0].approved_total);
      return res.json({
        expenses: { total_count: expS[0].total, approved_total: te, pending_count: expS[0].pending_count, approved_count: expS[0].approved_count, rejected_count: expS[0].rejected_count },
        invoices: { total_count: invS[0].total, approved_total: tr, pending_count: invS[0].pending_count },
        pending_approvals: expS[0].pending_count + invS[0].pending_count,
        monthly_trend: months,
        wallet: { total_invoiced: tr, total_expenses: te, balance: tr - te },
        assets:  { total: ast[0].cnt, total_value: parseFloat(ast[0].tv) },
        workers: { total: wrk[0].cnt },
        crm:     { customers: cust[0].cnt, leads: leads.length, leads_won: leads.filter(l=>l.status==='won').length },
        projects:{ total: proj.length, active: proj.filter(p=>p.status==='active').length, tasks_total: 0, tasks_done: 0 },
      });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'reports/wallet' && req.method === 'GET') {
    try {
      const users = await sql`SELECT id, full_name FROM users WHERE cube_id=${cubeId}`;
      const wallets = await Promise.all(users.map(async u => {
        const [[te],[ti]] = await Promise.all([
          sql`SELECT COALESCE(SUM(COALESCE(total_amount,amount,0)),0) t FROM expenses WHERE cube_id=${cubeId} AND submitted_by=${u.id} AND status='approved'`,
          sql`SELECT COALESCE(SUM(COALESCE(grand_total,total_amount,0)),0) t FROM invoices WHERE cube_id=${cubeId} AND created_by=${u.id} AND status IN ('paid','approved')`,
        ]);
        const e = parseFloat(te.t), r = parseFloat(ti.t);
        return { user_id: u.id, full_name: u.full_name, total_expenses: e, total_invoiced: r, balance: r - e };
      }));
      return res.json({ wallets });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'reports/workers' && req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM workers WHERE cube_id=${cubeId} ORDER BY created_at DESC`;
      return res.json({ workers: toDocs(rows), total: rows.length, active: rows.filter(w=>w.status==='active').length });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'reports/salary-summary' && req.method === 'GET') {
    try {
      const rows = await sql`SELECT * FROM salary WHERE cube_id=${cubeId} ORDER BY created_at DESC`;
      return res.json({ records: toDocs(rows), total_paid: rows.reduce((s,r)=>s+parseFloat(r.amount||0),0) });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  if (route === 'reports/projects' && req.method === 'GET') {
    try {
      const [projs, [tt], [td]] = await Promise.all([
        sql`SELECT status FROM projects WHERE cube_id=${cubeId}`,
        sql`SELECT COUNT(*)::int cnt FROM tasks WHERE cube_id=${cubeId}`,
        sql`SELECT COUNT(*)::int cnt FROM tasks WHERE cube_id=${cubeId} AND status='done'`,
      ]);
      return res.json({ total: projs.length, active: projs.filter(p=>p.status==='active').length, tasks_total: tt.cnt, tasks_done: td.cnt });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── 404 ────────────────────────────────────────────────────────────────────
  return res.status(404).json({ error: `Route not found: "${route}"` });
}
