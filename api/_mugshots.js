import { neon } from '@neondatabase/serverless';

/* Shared bits for the mugshot wall. Files starting with an underscore are not
   deployed as functions. */

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL missing');
  return neon(url);
}

let ensured = false;
export async function ensure(sql) {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS mugshots (
    id         serial PRIMARY KEY,
    image      bytea NOT NULL,
    bytes      integer NOT NULL,
    ip_hash    text NOT NULL,
    hidden     boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS mugshots_ip_recent ON mugshots (ip_hash, created_at)`;
  ensured = true;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (Array.isArray(fwd) ? fwd[0] : String(fwd || '')).split(',')[0].trim() || 'unknown';
}
