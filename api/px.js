import { neon } from '@neondatabase/serverless';

/* 1x1 open pixel. The token identifies the subscriber without ever putting an
   address in a URL, and a failure here must never break the image. */

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  try {
    const token = String(req.query.t || '').trim();
    const campaign = String(req.query.c || 'welcome').slice(0, 60);
    if (token && process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`select email from email_signups where token = ${token}`;
      if (rows[0]) {
        await sql`insert into email_events (email, kind, campaign, ip, user_agent)
                  values (${rows[0].email}, 'open', ${campaign},
                          ${(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null},
                          ${(req.headers['user-agent'] || '').slice(0, 500) || null})`;
      }
    }
  } catch (err) {
    console.error('open pixel failed', err);
  }

  return res.status(200).send(GIF);
}
