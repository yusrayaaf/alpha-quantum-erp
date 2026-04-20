// api/_auth.js — Alpha Quantum ERP v16
import crypto from 'crypto';

const SECRET = process.env.JWT_SECRET || 'alpha-quantum-erp-secret-v16-change-in-production-please';

function b64url(s) {
  return Buffer.from(s).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64dec(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

export function signJWT(payload, expiresIn = 86400 * 30) {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const b = b64url(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    iat: Math.floor(Date.now() / 1000),
  }));
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${s}`;
}

export function verifyJWT(token) {
  try {
    const [h, b, s] = token.split('.');
    if (!h || !b || !s) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url');
    if (expected !== s) return null;
    const p = JSON.parse(b64dec(b));
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

export function hashPassword(pw) {
  return crypto.createHash('sha256').update(String(pw)).digest('hex');
}

export const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function requireAuth(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) throw new Error('Authentication required');
  const p = verifyJWT(auth.slice(7));
  if (!p) throw new Error('Invalid or expired token — please sign in again');
  return p;
}

export function isCreator(user)   { return user?.role === 'creator'; }
export function isCubeAdmin(user) { return user?.role === 'cube_admin' || user?.role === 'creator'; }
export function isSuperUser(user) { return ['creator','cube_admin','superuser'].includes(user?.role); }
