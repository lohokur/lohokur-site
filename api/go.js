import { neon } from '@neondatabase/serverless';

/* Click tracking: record, then send them on. Only our own pages are valid
   destinations, so this cannot be turned into an open redirect. */

const ALLOWED = new Set(['https://lohokur.com', 'https://lohokur.com/join', 'https://deviantbyloho.com', 'https://lohokur.com/api/download?p=mac', 'https://lohokur.com/api/download?p=intel', 'https://lohokur.com/api/download?p=win']);
const FALLBACK = 'https://lohokur.com';

export default async function handler(req, res) {
  const target = ALLOWED.has(String(req.query.u || '')) ? String(req.query.u) : FALLBACK;

  try {
    const token = String(req.query.t || '').trim();
    const campaign = String(req.query.c || 'welcome').slice(0, 60);
    if (token && process.env.DATABASE_URL) {
      const sql = neon(process.env.DATABASE_URL);
      const rows = await sql`select email from email_signups where token = ${token}`;
      if (rows[0]) {
        await sql`insert into email_events (email, kind, campaign, url, ip, user_agent)
                  values (${rows[0].email}, 'click', ${campaign}, ${target},
                          ${(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null},
                          ${(req.headers['user-agent'] || '').slice(0, 500) || null})`;
      }
    }
  } catch (err) {
    console.error('click tracking failed', err);
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, target);
}
