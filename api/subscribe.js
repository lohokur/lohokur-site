import { neon } from '@neondatabase/serverless';

/* Captures an email for the LOHO KUR list.

   The list lives in the house Postgres (Neon), deliberately outside Shopify:
   Shopify owns customers, this owns readers. Sending is done from Resend,
   which reads this table — nothing is sent from here. */

const SOURCES = new Set(['lohokur.com', 'join', 'footer', 'studio']);

const SEND_FROM = 'LOHO KUR <hello@lohokur.com>';
const REPLY_TO = 'loho@lohokur.com';

// Plain text on white — the same voice as the page, nothing dressed up.
function welcome() {
  return {
    subject: "you're in.",
    text: [
      'you signed up at lohokur.com.',
      '',
      'cracked* — insanely good at something. homemade software, non-corporate, dope.',
      '',
      "that's what lands here: the things I build, before anyone else sees them.",
      'no noise, and you can leave whenever you like.',
      '',
      '— loho',
    ].join('\n'),
    html:
      `<div style="background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#000">
         <p style="margin:0 0 14px">you signed up at lohokur.com.</p>
         <p style="margin:0 0 14px">cracked* &mdash; insanely good at something. homemade software, non-corporate, dope.</p>
         <p style="margin:0 0 14px">that&rsquo;s what lands here: the things I build, before anyone else sees them.<br>no noise, and you can leave whenever you like.</p>
         <p style="margin:0">&mdash; loho</p>
       </div>`,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('subscribe misconfigured: DATABASE_URL missing');
    return res.status(500).json({ error: 'server', message: 'The list is offline. Try again shortly.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // Honeypot: real people never fill a field they cannot see. Answer 200 so the
  // bot has nothing to learn from the difference.
  if (String(body.website || '').trim()) return res.status(200).json({ ok: true });

  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'email', message: 'That address does not look right.' });
  }

  const source = SOURCES.has(String(body.source || '')) ? String(body.source) : 'lohokur.com';
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
  const ua = (req.headers['user-agent'] || '').slice(0, 500) || null;
  const referrer = (req.headers.referer || '').slice(0, 500) || null;

  try {
    const sql = neon(url);
    // An address already on the list is not an error — it just comes back, and a
    // previous unsubscribe is cleared because this is a fresh opt-in.
    const rows = await sql`
      insert into email_signups (email, source, ip, user_agent, referrer)
      values (${email}, ${source}, ${ip}, ${ua}, ${referrer})
      on conflict (lower(email)) do update
        set unsubscribed_at = null
      returning (xmax = 0) as inserted`;

    const isNew = rows[0]?.inserted === true;

    // Only first-time signups get the welcome, and a failed send never costs
    // the signup — the address is already saved by this point.
    if (isNew && process.env.RESEND_API_KEY) {
      const note = welcome();
      try {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: SEND_FROM, to: [email], reply_to: REPLY_TO, subject: note.subject, text: note.text, html: note.html }),
        });
        if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
      } catch (err) {
        console.error('welcome email failed for', email, err);
      }
    }

    return res.status(200).json({ ok: true, new: isNew });
  } catch (err) {
    console.error('subscribe failed', err);
    return res.status(502).json({ error: 'store', message: 'We could not save that. Try again, or email loho@lohokur.com.' });
  }
}
