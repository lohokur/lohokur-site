import crypto from 'node:crypto';

/* Records a confidentiality acknowledgement, then issues the portfolio cookie.

   Access is granted ONLY through this endpoint, so the tick-box cannot be
   skipped: the cookie is an HMAC signed with GATE_SECRET, which a visitor who
   merely knows the password has no way to forge. */

// SHA-256 of each accepted password, lowercased and trimmed. Any one of them opens the gate.
const DIGESTS  = [
  '584cab77390ab5a63a48ace505dedd145dfc5f964ff19a65b5d096a432214523', // the long one
  'cbd3cfb9b9f51bbbfbf08759e243f5b3519cbf6ecc219ee95fe7c667e32c0a8d'  // the short one
];
const TERMS    = 'v1.3-2026-08-31';
const COOKIE   = 'lk_pf';
const MAX_AGE  = 60 * 60 * 24 * 30; // 30 days
const RECORD_TO = 'loho@lohokur.com';
const SEND_FROM = 'LOHO KUR Portfolio <portfolio@lohokur.com>';

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method' });
  }

  const secret = process.env.GATE_SECRET;
  const resendKey = process.env.RESEND_API_KEY;
  if (!secret || !resendKey) {
    console.error('gate misconfigured: GATE_SECRET or RESEND_API_KEY missing');
    return res.status(500).json({ error: 'server', message: 'The gate is misconfigured. Please email loho@lohokur.com.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || '').trim();
  const password = String(body.password || '').trim().toLowerCase();
  const agreed = body.agreed === true;

  if (!name || !email || !company) return res.status(400).json({ error: 'fields' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'email' });
  if (!agreed) return res.status(400).json({ error: 'agree' });

  const given = crypto.createHash('sha256').update(password).digest('hex');
  const match = DIGESTS.some((d) => given.length === d.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(d)));
  if (!match) {
    return res.status(401).json({ error: 'password' });
  }

  const at = new Date();
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';

  // The acceptance record has to be captured before access is granted — that is
  // the whole point of the gate — so a failed send denies entry rather than
  // letting someone through unrecorded.
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: SEND_FROM,
        to: [RECORD_TO],
        reply_to: email,
        subject: `Portfolio NDA accepted — ${name} (${company})`,
        html:
          `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">
             <p style="margin:0 0 14px"><b>Confidentiality acknowledgement accepted.</b></p>
             <table cellpadding="6" style="border-collapse:collapse;font-size:13px">
               <tr><td><b>Name</b></td><td>${esc(name)}</td></tr>
               <tr><td><b>Organisation</b></td><td>${esc(company)}</td></tr>
               <tr><td><b>Email</b></td><td>${esc(email)}</td></tr>
               <tr><td><b>Accepted at</b></td><td>${at.toISOString()}</td></tr>
               <tr><td><b>Terms version</b></td><td>${TERMS}</td></tr>
               <tr><td><b>IP address</b></td><td>${esc(ip)}</td></tr>
               <tr><td><b>User agent</b></td><td>${esc(ua)}</td></tr>
             </table>
             <p style="margin:16px 0 0;color:#666;font-size:12px">
               Recorded automatically by lohokur.com/portfolio. Keep this email as the record of acceptance.
             </p>
           </div>`,
      }),
    });
    if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
  } catch (err) {
    console.error('acceptance record failed', err);
    return res.status(502).json({
      error: 'record',
      message: 'We could not record your acceptance, so access was not granted. Please try again, or email loho@lohokur.com.',
    });
  }

  const payload = b64url(JSON.stringify({ n: name, c: company, e: email, t: at.toISOString(), v: TERMS }));
  const value = `${payload}.${sign(payload, secret)}`;

  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  );
  return res.status(200).json({ ok: true });
}
