import { db, ensure } from './_mugshots.js';

/* One mugshot as a JPEG: /api/mugshot?id=N. Images never change once stored,
   so the CDN may keep them for a year. Hiding one makes it a 404 on the next
   uncached fetch; the wall stops listing it immediately either way. */

export default async function handler(req, res) {
  const id = Number.parseInt(String(req.query.id || ''), 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).end();

  let sql;
  try {
    sql = db();
    await ensure(sql);
  } catch (e) {
    console.error('mugshot misconfigured', e);
    return res.status(500).end();
  }

  const rows = await sql`SELECT image FROM mugshots WHERE id = ${id} AND NOT hidden`;
  if (!rows.length) return res.status(404).end();

  const image = rows[0].image;
  const buf = Buffer.isBuffer(image) ? image : Buffer.from(image);
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.status(200).send(buf);
}
