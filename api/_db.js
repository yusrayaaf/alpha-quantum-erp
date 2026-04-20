// api/_db.js — Alpha Quantum ERP v20 — NeonDB + Safe Migration
import { neon } from '@neondatabase/serverless';
import { hashPassword } from './_auth.js';

let _sql = null;
let _migrated = false;

export function getSql() {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL not set. Add it to Vercel Environment Variables.');
  _sql = neon(url);
  return _sql;
}

export async function getDb() {
  const sql = getSql();
  if (!_migrated) {
    _migrated = true;
    await migrate(sql).catch(e => { _migrated = false; throw e; });
  }
  return sql;
}

async function addCol(sql, table, col, definition) {
  try {
    await sql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${definition}`);
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (!msg.includes('already exists') && !msg.includes('duplicate column')) {
      console.warn('[migrate] ALTER', table, col, e.message);
    }
  }
}

async function migrate(sql) {
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`.catch(() => {});

  await sql`CREATE TABLE IF NOT EXISTS cubes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT UNIQUE NOT NULL,
    company_name TEXT NOT NULL,
    plan         TEXT NOT NULL DEFAULT 'starter',
    features     JSONB NOT NULL DEFAULT '{}',
    admin_email  TEXT,
    admin_name   TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    settings     JSONB NOT NULL DEFAULT '{"theme":"dark","language":"en","currency":"SAR","timezone":"Asia/Riyadh"}',
    logo_url     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'cubes', 'logo_url', 'TEXT');
  await addCol(sql, 'cubes', 'settings', "JSONB NOT NULL DEFAULT '{}'");

  await sql`CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT UNIQUE NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'staff',
    cube_id         UUID,
    department      TEXT DEFAULT '',
    phone           TEXT DEFAULT '',
    whatsapp_number TEXT DEFAULT '',
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    permissions     JSONB NOT NULL DEFAULT '{}',
    last_login      TIMESTAMPTZ,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'users', 'cube_id',         'UUID');
  await addCol(sql, 'users', 'department',       "TEXT DEFAULT ''");
  await addCol(sql, 'users', 'phone',            "TEXT DEFAULT ''");
  await addCol(sql, 'users', 'whatsapp_number',  "TEXT DEFAULT ''");
  await addCol(sql, 'users', 'avatar_url',       'TEXT');
  await addCol(sql, 'users', 'is_active',        'BOOLEAN NOT NULL DEFAULT TRUE');
  await addCol(sql, 'users', 'permissions',      "JSONB NOT NULL DEFAULT '{}'");
  await addCol(sql, 'users', 'last_login',       'TIMESTAMPTZ');
  await addCol(sql, 'users', 'created_by',       'UUID');
  await addCol(sql, 'users', 'updated_at',       'TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  try { await sql`UPDATE users SET permissions = '{}' WHERE permissions IS NULL`; } catch {}

  await sql`CREATE TABLE IF NOT EXISTS cube_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name     TEXT NOT NULL,
    admin_name       TEXT NOT NULL,
    admin_email      TEXT NOT NULL,
    admin_phone      TEXT DEFAULT '',
    plan             TEXT DEFAULT 'starter',
    message          TEXT DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'pending',
    cube_id          UUID,
    approved_at      TIMESTAMPTZ,
    approved_by      UUID,
    rejection_reason TEXT,
    rejected_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'cube_requests', 'admin_phone',      "TEXT DEFAULT ''");
  await addCol(sql, 'cube_requests', 'plan',             "TEXT DEFAULT 'starter'");
  await addCol(sql, 'cube_requests', 'message',          "TEXT DEFAULT ''");
  await addCol(sql, 'cube_requests', 'cube_id',          'UUID');
  await addCol(sql, 'cube_requests', 'approved_at',      'TIMESTAMPTZ');
  await addCol(sql, 'cube_requests', 'approved_by',      'UUID');
  await addCol(sql, 'cube_requests', 'rejection_reason', 'TEXT');
  await addCol(sql, 'cube_requests', 'rejected_at',      'TIMESTAMPTZ');

  await sql`CREATE TABLE IF NOT EXISTS expenses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref               TEXT,
    cube_id           UUID,
    title             TEXT,
    amount            NUMERIC(18,2) DEFAULT 0,
    total_amount      NUMERIC(18,2) DEFAULT 0,
    grand_total       NUMERIC(18,2) DEFAULT 0,
    vat_amount        NUMERIC(18,2) DEFAULT 0,
    vat_rate          NUMERIC(5,2)  DEFAULT 15,
    category          TEXT,
    vendor            TEXT,
    description       TEXT,
    receipt_url       TEXT,
    status            TEXT NOT NULL DEFAULT 'pending',
    submitted_by      UUID,
    submitted_by_name TEXT,
    approved_by       UUID,
    approved_by_name  TEXT,
    approval_note     TEXT,
    approved_at       TIMESTAMPTZ,
    expense_date      DATE,
    items             JSONB DEFAULT '[]',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'expenses', 'ref',               'TEXT');
  await addCol(sql, 'expenses', 'title',             'TEXT');
  await addCol(sql, 'expenses', 'grand_total',       'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'expenses', 'vat_amount',        'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'expenses', 'vat_rate',          'NUMERIC(5,2) DEFAULT 15');
  await addCol(sql, 'expenses', 'vendor',            'TEXT');
  await addCol(sql, 'expenses', 'submitted_by_name', 'TEXT');
  await addCol(sql, 'expenses', 'approved_by',       'UUID');
  await addCol(sql, 'expenses', 'approved_by_name',  'TEXT');
  await addCol(sql, 'expenses', 'approval_note',     'TEXT');
  await addCol(sql, 'expenses', 'approved_at',       'TIMESTAMPTZ');
  await addCol(sql, 'expenses', 'expense_date',      'DATE');
  await addCol(sql, 'expenses', 'items',             "JSONB DEFAULT '[]'");
  await addCol(sql, 'expenses', 'updated_at',        'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS invoices (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref              TEXT,
    cube_id          UUID,
    customer_name    TEXT,
    customer_email   TEXT,
    customer_address TEXT,
    items            JSONB DEFAULT '[]',
    subtotal         NUMERIC(18,2) DEFAULT 0,
    vat_rate         NUMERIC(5,2)  DEFAULT 15,
    vat_amount       NUMERIC(18,2) DEFAULT 0,
    grand_total      NUMERIC(18,2) DEFAULT 0,
    total_amount     NUMERIC(18,2) DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'draft',
    due_date         DATE,
    notes            TEXT,
    created_by       UUID,
    created_by_name  TEXT,
    approved_by      UUID,
    approved_by_name TEXT,
    approval_note    TEXT,
    approved_at      TIMESTAMPTZ,
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'invoices', 'ref',               'TEXT');
  await addCol(sql, 'invoices', 'customer_address',  'TEXT');
  await addCol(sql, 'invoices', 'subtotal',          'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'invoices', 'vat_rate',          'NUMERIC(5,2) DEFAULT 15');
  await addCol(sql, 'invoices', 'vat_amount',        'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'invoices', 'total_amount',      'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'invoices', 'created_by_name',   'TEXT');
  await addCol(sql, 'invoices', 'approved_by',       'UUID');
  await addCol(sql, 'invoices', 'approved_by_name',  'TEXT');
  await addCol(sql, 'invoices', 'approval_note',     'TEXT');
  await addCol(sql, 'invoices', 'approved_at',       'TIMESTAMPTZ');
  await addCol(sql, 'invoices', 'paid_at',           'TIMESTAMPTZ');
  await addCol(sql, 'invoices', 'updated_at',        'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS assets (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref            TEXT,
    cube_id        UUID,
    name           TEXT NOT NULL,
    category       TEXT,
    purchase_price NUMERIC(18,2) DEFAULT 0,
    current_value  NUMERIC(18,2) DEFAULT 0,
    purchase_date  DATE,
    location       TEXT,
    serial_number  TEXT,
    status         TEXT DEFAULT 'active',
    notes          TEXT,
    image_url      TEXT,
    created_by     UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'assets', 'ref',           'TEXT');
  await addCol(sql, 'assets', 'current_value', 'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'assets', 'purchase_date', 'DATE');
  await addCol(sql, 'assets', 'serial_number', 'TEXT');
  await addCol(sql, 'assets', 'image_url',     'TEXT');
  await addCol(sql, 'assets', 'updated_at',    'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS workers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref             TEXT,
    cube_id         UUID,
    full_name       TEXT NOT NULL,
    position        TEXT,
    department      TEXT,
    phone           TEXT,
    email           TEXT,
    iqama_number    TEXT,
    nationality     TEXT,
    hire_date       DATE,
    salary          NUMERIC(18,2) DEFAULT 0,
    status          TEXT DEFAULT 'active',
    bank_account    TEXT,
    notes           TEXT,
    photo_url       TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'workers', 'ref',          'TEXT');
  await addCol(sql, 'workers', 'iqama_number', 'TEXT');
  await addCol(sql, 'workers', 'nationality',  'TEXT');
  await addCol(sql, 'workers', 'hire_date',    'DATE');
  await addCol(sql, 'workers', 'bank_account', 'TEXT');
  await addCol(sql, 'workers', 'photo_url',    'TEXT');
  await addCol(sql, 'workers', 'updated_at',   'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS salary (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cube_id    UUID,
    worker_id  UUID,
    amount     NUMERIC(18,2) DEFAULT 0,
    month      INTEGER,
    year       INTEGER,
    notes      TEXT,
    paid_by    UUID,
    paid_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'salary', 'paid_by', 'UUID');
  await addCol(sql, 'salary', 'paid_at', 'TIMESTAMPTZ');

  await sql`CREATE TABLE IF NOT EXISTS attendance (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cube_id    UUID,
    worker_id  UUID,
    date       DATE,
    check_in   TIME,
    check_out  TIME,
    hours      NUMERIC(5,2),
    status     TEXT DEFAULT 'present',
    notes      TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS budgets (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref        TEXT,
    cube_id    UUID,
    title      TEXT NOT NULL,
    category   TEXT,
    amount     NUMERIC(18,2) DEFAULT 0,
    spent      NUMERIC(18,2) DEFAULT 0,
    period     TEXT,
    year       INTEGER,
    month      INTEGER,
    status     TEXT DEFAULT 'active',
    notes      TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'budgets', 'ref',        'TEXT');
  await addCol(sql, 'budgets', 'spent',      'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'budgets', 'updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS investments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref           TEXT,
    cube_id       UUID,
    title         TEXT NOT NULL,
    type          TEXT,
    amount        NUMERIC(18,2) DEFAULT 0,
    current_value NUMERIC(18,2) DEFAULT 0,
    return_rate   NUMERIC(8,4)  DEFAULT 0,
    start_date    DATE,
    maturity_date DATE,
    status        TEXT DEFAULT 'active',
    notes         TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'investments', 'ref',           'TEXT');
  await addCol(sql, 'investments', 'current_value', 'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'investments', 'return_rate',   'NUMERIC(8,4) DEFAULT 0');
  await addCol(sql, 'investments', 'maturity_date', 'DATE');
  await addCol(sql, 'investments', 'updated_at',    'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS liabilities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref         TEXT,
    cube_id     UUID,
    title       TEXT NOT NULL,
    type        TEXT,
    amount      NUMERIC(18,2) DEFAULT 0,
    paid_amount NUMERIC(18,2) DEFAULT 0,
    due_date    DATE,
    creditor    TEXT,
    status      TEXT DEFAULT 'active',
    notes       TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'liabilities', 'ref',         'TEXT');
  await addCol(sql, 'liabilities', 'paid_amount', 'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'liabilities', 'creditor',    'TEXT');
  await addCol(sql, 'liabilities', 'updated_at',  'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref         TEXT,
    cube_id     UUID,
    title       TEXT NOT NULL,
    description TEXT,
    status      TEXT DEFAULT 'planning',
    priority    TEXT DEFAULT 'medium',
    budget      NUMERIC(18,2) DEFAULT 0,
    start_date  DATE,
    end_date    DATE,
    manager_id  UUID,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'projects', 'ref',        'TEXT');
  await addCol(sql, 'projects', 'priority',   "TEXT DEFAULT 'medium'");
  await addCol(sql, 'projects', 'budget',     'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'projects', 'manager_id', 'UUID');
  await addCol(sql, 'projects', 'updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cube_id      UUID,
    project_id   UUID,
    title        TEXT NOT NULL,
    description  TEXT,
    status       TEXT DEFAULT 'todo',
    priority     TEXT DEFAULT 'medium',
    assigned_to  UUID,
    due_date     DATE,
    completed_at TIMESTAMPTZ,
    created_by   UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'tasks', 'project_id',   'UUID');
  await addCol(sql, 'tasks', 'priority',     "TEXT DEFAULT 'medium'");
  await addCol(sql, 'tasks', 'assigned_to',  'UUID');
  await addCol(sql, 'tasks', 'completed_at', 'TIMESTAMPTZ');
  await addCol(sql, 'tasks', 'updated_at',   'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref           TEXT,
    cube_id       UUID,
    name          TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    company       TEXT,
    address       TEXT,
    country       TEXT,
    type          TEXT DEFAULT 'customer',
    status        TEXT DEFAULT 'active',
    notes         TEXT,
    total_revenue NUMERIC(18,2) DEFAULT 0,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'customers', 'ref',           'TEXT');
  await addCol(sql, 'customers', 'total_revenue', 'NUMERIC(18,2) DEFAULT 0');
  await addCol(sql, 'customers', 'updated_at',    'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS leads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref         TEXT,
    cube_id     UUID,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    company     TEXT,
    source      TEXT,
    status      TEXT DEFAULT 'new',
    value       NUMERIC(18,2) DEFAULT 0,
    notes       TEXT,
    assigned_to UUID,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'leads', 'ref',         'TEXT');
  await addCol(sql, 'leads', 'assigned_to', 'UUID');
  await addCol(sql, 'leads', 'updated_at',  'TIMESTAMPTZ NOT NULL DEFAULT NOW()');

  await sql`CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,
    cube_id     UUID,
    title       TEXT,
    body        TEXT,
    entity_type TEXT,
    entity_id   TEXT,
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cube_id     UUID,
    user_id     TEXT,
    user_name   TEXT,
    action      TEXT,
    entity_type TEXT,
    entity_id   TEXT,
    details     JSONB DEFAULT '{}',
    ip_address  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await addCol(sql, 'audit_log', 'details', "JSONB DEFAULT '{}'");

  await sql`CREATE TABLE IF NOT EXISTS settings (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cube_id    UUID,
    key        TEXT NOT NULL,
    value      JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS settings_cube_key_idx ON settings (COALESCE(cube_id::TEXT, ''), key)`;
  } catch {}

  await sql`CREATE TABLE IF NOT EXISTS forms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cube_id    UUID,
    title      TEXT NOT NULL,
    fields     JSONB DEFAULT '[]',
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS counters (
    id  TEXT PRIMARY KEY,
    seq INTEGER NOT NULL DEFAULT 0
  )`;

  await seedCreator(sql);
  console.log('✅ Alpha Quantum ERP v20 migration complete');
}

// Always upserts creator — syncs password from env on every cold start
async function seedCreator(sql) {
  try {
    const username = (process.env.VITE_CREATOR_USERNAME || 'maynulshaon').toLowerCase();
    const password = process.env.CREATOR_PASSWORD || 'Creator@2025!';
    const email    = (process.env.CREATOR_EMAIL    || 'erp@alpha-01.info').toLowerCase();
    const fullName = process.env.CREATOR_FULL_NAME || 'Mohammad Maynul Hasan Shaon';
    const hash     = hashPassword(password);
    await sql`
      INSERT INTO users (username, email, password_hash, full_name, role, is_active, permissions)
      VALUES (${username}, ${email}, ${hash}, ${fullName}, 'creator', TRUE, '{}')
      ON CONFLICT (username) DO UPDATE SET
        password_hash = ${hash},
        role          = 'creator',
        email         = ${email},
        full_name     = ${fullName},
        is_active     = TRUE`;
    console.log('✅ Creator account ready: ' + username);
  } catch (e) {
    console.warn('[seedCreator]', e.message);
  }
}

export async function nextSeq(sql, name) {
  const r = await sql`
    INSERT INTO counters (id, seq) VALUES (${name}, 1)
    ON CONFLICT (id) DO UPDATE SET seq = counters.seq + 1 RETURNING seq`;
  return r[0].seq;
}

export async function auditLog(sql, user, action, entityType, entityId, details, ip) {
  try {
    await sql`
      INSERT INTO audit_log (cube_id, user_id, user_name, action, entity_type, entity_id, details, ip_address)
      VALUES (${user.cube_id || null}, ${String(user.sub)}, ${user.full_name || ''},
              ${action}, ${entityType}, ${String(entityId)}, ${details || {}}, ${ip || ''})`;
  } catch (e) { console.warn('[audit]', e.message); }
}

export async function notify(sql, userId, cubeId, title, body, entityType, entityId) {
  try {
    await sql`
      INSERT INTO notifications (user_id, cube_id, title, body, entity_type, entity_id)
      VALUES (${userId}, ${cubeId || null}, ${title}, ${body || ''},
              ${entityType || null}, ${entityId ? String(entityId) : null})`;
  } catch (e) { console.warn('[notify]', e.message); }
}

export function defaultFeatures(plan) {
  const base = { finance: true, expenses: true, invoices: true };
  if (plan === 'free')       return { ...base, users_limit: 3,   storage_gb: 1   };
  if (plan === 'starter')    return { ...base, hr: true, crm: true, users_limit: 10,  storage_gb: 10  };
  if (plan === 'business')   return { ...base, hr: true, crm: true, projects: true, reports: true, users_limit: 50,  storage_gb: 50  };
  if (plan === 'enterprise') return { ...base, hr: true, crm: true, projects: true, reports: true, custom_forms: true, api_access: true, users_limit: -1, storage_gb: -1 };
  return base;
}
