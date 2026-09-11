import { next } from '@vercel/edge';

/* Gate the portfolio — pages *and* their media — behind a password plus a
   recorded confidentiality acknowledgement. Everything else on lohokur.com
   stays public.

   Access is granted only by /api/accept, which records who accepted before it
   issues the cookie. The cookie is an HMAC signed with GATE_SECRET, so knowing
   the password is not enough to forge one and skip the tick-box. */
export const config = {
  matcher: ['/portfolio', '/portfolio/:path*'],
};

const COOKIE = 'lk_pf';
const TERMS_VERSION = 'v1.3 · 31 August 2026';

function cookieValue(req) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
}

const enc = new TextEncoder();

async function valid(value, secret) {
  const [payload, sig] = String(value).split('.');
  if (!payload || !sig) return false;
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const want = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export default async function middleware(req) {
  const secret = process.env.GATE_SECRET;
  // Fail closed: without a secret nothing can be verified, so nothing is served.
  if (!secret) return gate();

  const value = cookieValue(req);
  if (value && (await valid(value, secret))) return next();
  return gate();
}

function gate() {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Portfolio — Loho Kur</title>
<meta name="robots" content="noindex, nofollow">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  :root{--ink:#07080a;--panel:#0e0f12;--fg:#eef1ee;--muted:#9aa39c;--dim:#6d746e;
    --line:rgba(255,255,255,.12);--line2:rgba(255,255,255,.18);--mint:#a9f0d0;
    --sans:'Helvetica Neue',Helvetica,Arial,sans-serif;--mono:ui-monospace,'SF Mono',Menlo,'Roboto Mono',monospace}
  html,body{background:var(--ink);color:var(--fg);font-family:var(--sans);-webkit-font-smoothing:antialiased}
  body{min-height:100%;display:flex;align-items:center;justify-content:center;padding:36px 20px}
  a{color:var(--mint);text-decoration:none}
  .glow{position:fixed;top:-320px;left:50%;transform:translateX(-50%);width:900px;height:640px;
    background:radial-gradient(ellipse at center,rgba(169,240,208,.14),transparent 62%);pointer-events:none}
  .card{position:relative;width:min(96vw,560px);border:1px solid var(--line);border-radius:20px;
    background:var(--panel);padding:38px 36px 32px;
    box-shadow:0 40px 100px -30px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06)}
  .brandmark{display:flex;align-items:flex-start;gap:4px}
  .brandmark img{height:21px;width:auto;display:block;
    filter:invert(1) drop-shadow(0 1px 8px rgba(0,0,0,.55))}
  .brandmark sup{font-size:9px;line-height:1;color:var(--fg);opacity:.7}
  .fl{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;
    color:var(--mint);margin-bottom:9px}
  .blk{margin-top:22px}
  .sep{margin-top:24px;padding-top:22px;border-top:1px solid var(--line)}
  .hint{font-size:11.5px;line-height:1.55;color:var(--dim);margin-top:9px}
  h1{font-size:26px;font-weight:500;letter-spacing:-.02em;margin:22px 0 10px;line-height:1.15}
  .sub{color:var(--muted);font-size:13.5px;line-height:1.6}
  .terms{margin-top:22px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.02);
    padding:18px 20px;font-size:12.5px;line-height:1.65;color:var(--muted)}
  .terms details{margin-top:13px;border-top:1px solid var(--line);padding-top:12px}
  .terms summary{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--mint);cursor:pointer;list-style:none;user-select:none}
  .terms summary::-webkit-details-marker{display:none}
  .terms summary:after{content:'  +'}
  .terms details[open] summary:after{content:'  −'}
  .terms details ol{margin-top:12px}
  .terms h2{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--mint);font-weight:400;margin-bottom:10px}
  .terms ol{margin:10px 0 0 16px;display:flex;flex-direction:column;gap:8px}
  .terms b{color:var(--fg);font-weight:600}
  .terms .ver{margin-top:14px;font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;
    text-transform:uppercase;color:var(--dim)}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  form{margin-top:6px}
  input[type=text],input[type=email],input[type=password]{width:100%;padding:12px 14px;border-radius:11px;
    border:1px solid var(--line2);background:rgba(255,255,255,.03);color:var(--fg);
    font-family:var(--sans);font-size:13.5px}
  input::placeholder{color:var(--dim)}
  input:focus{outline:none;border-color:var(--mint)}
  #email{margin-top:10px}
  .agree{display:flex;gap:11px;align-items:flex-start;margin-top:16px;
    font-size:12.5px;line-height:1.55;color:var(--muted);cursor:pointer}
  .agree input{margin-top:2px;width:15px;height:15px;accent-color:var(--mint);flex:none;cursor:pointer}
  button{width:100%;padding:13px;border-radius:11px;border:none;background:var(--mint);color:var(--ink);
    font-family:var(--sans);font-size:13.5px;font-weight:600;cursor:pointer;transition:background .2s;margin-top:14px}
  button:hover:not(:disabled){background:#c4f5da}
  button:disabled{opacity:.4;cursor:not-allowed}
  .err{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;
    color:#ff8f8f;line-height:1.5;display:none}
  .err.on{display:block;margin-top:12px}
  .ft{margin-top:24px;padding-top:18px;border-top:1px solid var(--line);
    font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);
    display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .ft a{color:inherit}.ft a:hover{color:var(--fg)}
  @media(max-width:520px){.row{grid-template-columns:1fr}.card{padding:30px 22px 26px}}
</style></head>
<body>
<div class="glow"></div>
<div class="card">
  <div class="brandmark"><img src="/lk-logo.png" alt="LOHO KUR"><sup>&reg;</sup></div>
  <h1>Private portfolio.</h1>
  <p class="sub">These pages include unreleased product, generative workflows and production documents. Enter the portfolio password you were given, say who is viewing for the access record, and accept the terms below.</p>


  <form id="f">
    <div class="blk">
      <div class="fl">Portfolio password</div>
      <input type="password" id="pw" placeholder="Enter portfolio password" required
             autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
    </div>

    <div class="blk sep">
      <div class="fl">Who is viewing</div>
      <div class="row">
        <input type="text" id="name" placeholder="Full name" autocomplete="name" required>
        <input type="text" id="company" placeholder="Organisation" autocomplete="organization" required>
      </div>
      <input type="email" id="email" placeholder="Work email" autocomplete="email" required>
      <p class="hint">Recorded against the acknowledgement below — name, organisation, email, IP address and time.</p>
    </div>
  <div class="terms">
    <h2>Confidentiality acknowledgement</h2>
    <p>The material on these pages belongs to <b>By Loho Studios Limited</b> (company 15741481, England &amp; Wales) and, in places, to its clients. These terms are accepted personally and do not commit your employer. By ticking the box you agree:</p>
    <ol>
      <li><b>Purpose.</b> Access is provided for the assessment of this work — recruitment, commissioning or comparable professional evaluation.</li>
      <li><b>Confidentiality.</b> The material is confidential, and is not for publication, posting or circulation outside your organisation.</li>
      <li><b>Scope of access.</b> Access is personal to you and extends to the individuals directly involved in that assessment. It is not intended for wider circulation within your organisation, and the link and password are not transferable.</li>
      <li><b>Work and method.</b> Rights in this material, and in the workflows, pipelines and methods it describes, remain with By Loho Studios Limited and its clients. It is shared for evaluation, not for reproduction, adaptation, model training or implementation elsewhere.</li>
    </ol>
    <details>
      <summary>Full terms — four more clauses</summary>
      <ol start="5">
        <li><b>No licence.</b> Nothing here transfers any intellectual property or grants any licence, express or implied.</li>
        <li><b>Deletion.</b> Copies will be deleted on request.</li>
        <li><b>Term.</b> These obligations run for three years, or until the material is made public, whichever is sooner.</li>
        <li><b>Record.</b> Name, organisation, email, IP address and time are recorded as evidence of acceptance.</li>
      </ol>
      <p style="margin-top:10px">Governed by the law of England &amp; Wales.</p>
    </details>
    <div class="ver">Terms ${TERMS_VERSION}</div>
  </div>
    <label class="agree">
      <input type="checkbox" id="agree">
      <span>I have read the confidentiality acknowledgement above and accept it for myself.</span>
    </label>
    <div class="err" id="err"></div>
    <button type="submit" id="go">View portfolio</button>
  </form>

  <div class="ft">
    <a href="https://lohokur.com">lohokur.com</a>
    <a href="mailto:loho@lohokur.com">loho@lohokur.com</a>
  </div>
</div>
<script>
(function () {
  var f = document.getElementById('f'), err = document.getElementById('err'), go = document.getElementById('go');
  var MSG = {
    fields:   'Please complete every field',
    email:    'That email address does not look valid',
    agree:    'Please tick the box to accept the terms',
    password: 'Incorrect password — try again',
    record:   'We could not record your acceptance, so access was not granted. Please try again, or email loho@lohokur.com',
    server:   'Something went wrong. Please email loho@lohokur.com',
    network:  'Network error — please try again'
  };
  function fail(k, m) { err.textContent = m || MSG[k] || MSG.server; err.className = 'err on'; }

  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    err.className = 'err';
    if (!document.getElementById('agree').checked) return fail('agree');
    go.disabled = true; go.textContent = 'Recording…';
    try {
      var r = await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name').value,
          company: document.getElementById('company').value,
          email: document.getElementById('email').value,
          password: document.getElementById('pw').value,
          agreed: true
        })
      });
      var d = await r.json().catch(function () { return {}; });
      if (r.ok && d.ok) { location.reload(); return; }
      fail(d.error, d.message);
    } catch (_) {
      fail('network');
    }
    go.disabled = false; go.textContent = 'View portfolio';
  });
})();
</script>
</body></html>`;

  return new Response(html, {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
