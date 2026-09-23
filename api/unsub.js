import { neon } from '@neondatabase/serverless';

/* One-click unsubscribe. The token identifies the reader without an address in the URL.
   GET is the link in the email; POST is the mail client's own one-click (List-Unsubscribe-Post). */

export default async function handler(req, res) {
  let ok = false;
  try {
    const token = String(req.query.t || '').trim();
    if (token && process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`update email_signups set unsubscribed_at = coalesce(unsubscribed_at, now()) where token = ${token} returning email`;
      if (rows[0]) { ok = true; await sql`insert into email_events (email, kind, campaign) values (${rows[0].email}, 'unsub', ${String(req.query.c || '').slice(0, 60) || null})`; }
    }
  } catch (err) { console.error('unsub failed', err); }
  if (req.method === 'POST') return res.status(200).end();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LOHO KUR</title>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;padding:40px;max-width:520px">${ok ? 'done. no more emails from us.<br><br>changed your mind? <a href="https://lohokur.com/join" style="color:inherit">lohokur.com/join</a>' : 'that link did not match anyone on the list.'}</body>`);
}
