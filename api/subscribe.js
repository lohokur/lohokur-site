import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

/* Captures an email for the LOHO KUR list.

   The list lives in the house Postgres (Neon), deliberately outside Shopify:
   Shopify owns customers, this owns readers. Sending is done from Resend,
   which reads this table — nothing is sent from here. */

const SOURCES = new Set(['lohokur.com', 'join', 'footer', 'studio']);

// Quoted because of the asterisk — an unquoted display name with punctuation
// is not a valid address header.
const SEND_FROM = '"LOHO KUR CRACKED*" <hello@lohokur.com>';
const REPLY_TO = 'loho@lohokur.com';

const SITE = 'https://lohokur.com';

// Two versions of the same words. The HTML one sets only a typeface and size —
// no background or colour — so a dark inbox stays dark and nothing paints a box
// behind the text. Text-only clients get the plain version untouched.
function welcome(token) {
  const px = `${SITE}/api/px?t=${token}&c=welcome`;
  const go = `${SITE}/api/go?t=${token}&c=welcome&u=${encodeURIComponent(SITE)}`;

  const lines = [
    'welcome team',
    '',
    'every sunday I drop new software. homemade, non-corporate, built by us, the people, against corporate greed.',
    '',
    "you're a hacker. everyone is \u2014 most people just haven't been shown yet. these emails will carry hacker tips, and updates on getting popular software in a new way*.",
    '',
    'first drop lands sunday.',
    '',
    '* cracked \u2014 insanely good at something. homemade, non-corporate, dope.',
    '',
    'love,',
    'loho kur',
    '',
    'lohokur.com',
  ];

  return {
    subject: "you're in, hacker",
    text: lines.join('\n'),
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">
         <p style="margin:0 0 14px">welcome team</p>
         <p style="margin:0 0 14px">every sunday I drop new software. homemade, non-corporate, built by us, the people, against corporate greed.</p>
         <p style="margin:0 0 14px">you&rsquo;re a hacker. everyone is &mdash; most people just haven&rsquo;t been shown yet. these emails will carry hacker tips, and updates on getting popular software in a new way*.</p>
         <p style="margin:0 0 14px">first drop lands sunday.</p>
         <p style="margin:0 0 14px">* cracked &mdash; insanely good at something. homemade, non-corporate, dope.</p>
         <p style="margin:0 0 14px">love,<br>loho kur</p>
         <p style="margin:0"><a href="${go}" style="color:inherit">lohokur.com</a></p>
         <img src="${px}" width="1" height="1" alt="" style="display:block;border:0">
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
      insert into email_signups (email, source, ip, user_agent, referrer, token)
      values (${email}, ${source}, ${ip}, ${ua}, ${referrer}, ${crypto.randomBytes(12).toString('hex')})
      on conflict (lower(email)) do update
        set unsubscribed_at = null
      returning token, (xmax = 0) as inserted`;

    const isNew = rows[0]?.inserted === true;

    // Only first-time signups get the welcome, and a failed send never costs
    // the signup — the address is already saved by this point.
    if (isNew && process.env.RESEND_API_KEY) {
      const note = welcome(rows[0].token);
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
