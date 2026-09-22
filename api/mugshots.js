import crypto from 'node:crypto';
import { db, ensure, clientIp } from './_mugshots.js';

/* The mugshot wall.

   GET  → ids of every visible mugshot, newest first. The page turns each id
          into <img src="/api/mugshot?id=N">.
   POST → adds one. The browser has already cropped it to 3:4, turned it
          grayscale and shrunk it to 590×770, so what arrives is a small JPEG
          as base64. Stored as bytes in Postgres — no blob store to run.

   Guards: JPEG magic bytes, a hard byte cap, five uploads per IP per day, and
   MUGSHOTS_CLOSED=1 shuts the door without a deploy. Hide a bad one with
   tools/mugshots.mjs. */

const MAX_BYTES = 250 * 1024;
const PER_IP_PER_DAY = 5;

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  let sql;
  try {
    sql = db();
    await ensure(sql);
  } catch (e) {
    console.error('mugshots misconfigured', e);
    return res.status(500).json({ error: 'server' });
  }

  if (req.method === 'GET') {
    const rows = await sql`SELECT id FROM mugshots WHERE NOT hidden ORDER BY id DESC LIMIT 500`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ids: rows.map((r) => r.id) });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method' });
  }

  if (process.env.MUGSHOTS_CLOSED === '1') {
    return res.status(503).json({ error: 'closed', message: 'The wall is closed for now.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const b64 = String(body.data || '').replace(/^data:image\/jpeg;base64,/, '');
  if (!b64) return res.status(400).json({ error: 'data', message: 'No image.' });

  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 1024 || buf.length > MAX_BYTES) {
    return res.status(400).json({ error: 'size', message: 'Image is the wrong size.' });
  }
  // JPEG starts FF D8 FF and ends FF D9.
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) {
    return res.status(400).json({ error: 'type', message: 'Only JPEG.' });
  }

  const ipHash = crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32);
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM mugshots WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= PER_IP_PER_DAY) {
    return res.status(429).json({ error: 'rate', message: 'That is enough for today.' });
  }

  const [{ id }] = await sql`INSERT INTO mugshots (image, bytes, ip_hash) VALUES (${buf}, ${buf.length}, ${ipHash}) RETURNING id`;
  return res.status(200).json({ ok: true, id });
}
