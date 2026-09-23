#!/usr/bin/env node
/* A campaign to the join list, through Resend, one personal copy per reader (tracking pixel, tracked link, unsubscribe).
     node tools/send.mjs --count                  how many would get it
     node tools/send.mjs --test you@example.com   one copy to you
     node tools/send.mjs --live                   everyone not unsubscribed who has not had this campaign yet
   Every copy sent is logged as email_events kind='sent', so a re-run after a failure only picks up who was missed. */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL || (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^DATABASE_URL="?(.+?)"?$/m) || [])[1];
const KEY = process.env.RESEND_API_KEY || (readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/^RESEND_API_KEY="?(.+?)"?$/m) || [])[1];
if (!url || !KEY) { console.error('DATABASE_URL / RESEND_API_KEY missing'); process.exit(1); }
const sql = neon(url);
const args = process.argv.slice(2); const flag = k => args.includes('--' + k); const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };

const CAMPAIGN = 'blackglass-out';
const FROM = '"LOHO KUR CRACKED*" <hello@lohokur.com>'; // quoted: the asterisk is not allowed in a bare display name
const REPLY_TO = 'loho@lohokur.com';
const SITE = 'https://lohokur.com';

function email(token) {
  const px = `${SITE}/api/px?t=${token}&c=${CAMPAIGN}`;
  const go = `${SITE}/api/go?t=${token}&c=${CAMPAIGN}&u=${encodeURIComponent(SITE)}`;
  const dl = p => `${SITE}/api/go?t=${token}&c=${CAMPAIGN}&u=${encodeURIComponent(`${SITE}/api/download?p=${p}`)}`; // straight to the installer
  const unsub = `${SITE}/api/unsub?t=${token}&c=${CAMPAIGN}`;
  const paras = [
    'cracked* hackers,',
    'blackglass is out.',
    'a free full image editor, and the first piece of the cracked* creative suite. layers, masks, adjustment layers, filters, psd export. homemade designer software, anti-corporate, yours for good.',
    'we will never act like adobe. they made removing your payment card off their system so hard that the USA government took them to court over it. they even charge crazy cancellation fees if you simply don\'t want to use them anymore. i think that\'s disgusting, so i built a solution.',
    'creativity shouldn\'t depend on the cash in your pocket. everyone deserves the chance to create freely.',
    'GIF',
    'make something, then share it on the gallery. anyone can open a copy of your work and build on it, and you see who did.',
    'DOWNLOAD',
    'you sign in the first time you open it, then it\'s yours.',
    'one rule: blackglass only ever comes from lohokur.com or this email. if you see it anywhere else, it isn\'t ours. don\'t download it.',
    'we improve blackglass every day, and what comes next comes from you. hit reply and tell me what\'s broken, what\'s missing, what you love. or tap send us feedback inside the app. i read every one.',
    'cracked* is a family. you\'re in it now.',
    'love,\nL',
  ];
  const text = paras.filter(p => p !== 'GIF').map(p => p === 'DOWNLOAD' ? `download it:\nmac (apple silicon): ${dl('mac')}\nmac (intel): ${dl('intel')}\nwindows: ${dl('win')}` : p).join('\n\n') + `\n\n${SITE}\n\nno more emails: ${unsub}`;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">`
    + paras.map(p => p === 'GIF'
        ? `<p style="margin:0 0 14px"><a href="${go}"><img src="${SITE}/email/blackglass.gif" width="560" alt="blackglass, working on a photo" style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:8px"></a></p>`
        : p === 'DOWNLOAD'
        ? `<p style="margin:0 0 8px">download it:</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px"><tr>`
          + [['mac', 'apple', 'mac', 90], ['win', 'windows', 'windows', 125]].map(([p, icon, label, w]) => `<td style="padding:0 8px 8px 0"><a href="${dl(p)}" style="text-decoration:none"><img src="${SITE}/email/btn-${icon}.png" width="${w}" height="44" alt="download for ${label}" style="display:block;border:0;width:${w}px;height:44px"></a></td>`).join('') // images, so dark mode can't recolour them
          + `</tr></table><p style="margin:0 0 14px;font-size:12px;opacity:.7">older intel mac? <a href="${dl('intel')}" style="color:inherit">this one</a>. or everything at <a href="${go}" style="color:inherit">lohokur.com</a></p>`

        : `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>').replace('a free full image editor', '<b>a free full image editor</b>')}</p>`).join('')
    + `<p style="margin:24px 0 0;font-size:12px;opacity:.6"><a href="${unsub}" style="color:inherit">no more emails</a></p>`
    + `<img src="${px}" width="1" height="1" alt="" style="display:block;border:0"><span style="display:none;font-size:0;color:transparent">${token}-${Date.now()}</span></div>`; // unique per copy, so Gmail never folds the ending into "..."
  return { subject: 'Your cracked* copy is ready, hacker', text, html, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

const audience = () => sql`select email, token from email_signups s where unsubscribed_at is null and token is not null
  and not exists (select 1 from email_events e where e.email = s.email and e.kind = 'sent' and e.campaign = ${CAMPAIGN}) order by created_at`;

async function batch(rows) { // Resend's batch endpoint: up to 100 distinct emails per call
  const r = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(rows.map(({ email: to, token }) => ({ from: FROM, reply_to: REPLY_TO, to: [to], ...email(token) }))) });
  if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`);
  return r.json();
}

async function sendOne(to, m) { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: [to], ...m }) }); if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text()}`); }

if (flag('count')) { console.log(`${(await audience()).length} would get "${email('x').subject}"`); process.exit(0); }
if (opt('test')) {
  const to = opt('test'); const [row] = await sql`select token from email_signups where email = ${to}`; const token = row ? row.token : 'test';
  const m = email(token); m.subject += ` [test ${new Date().toTimeString().slice(0, 5)}]`; await sendOne(to, m); console.log(`test sent to ${to}${row ? '' : ' (not on the list, so its links will not track)'}\n\nFrom: ${FROM}\nSubject: ${m.subject}\n\n${m.text}`); process.exit(0);
}
if (flag('live')) {
  const all = await audience(); console.log(`sending "${email('x').subject}" to ${all.length}`); let sent = 0;
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    try { await batch(chunk); for (const r of chunk) await sql`insert into email_events (email, kind, campaign) values (${r.email}, 'sent', ${CAMPAIGN})`; sent += chunk.length; console.log(`  ${sent}/${all.length}`); }
    catch (e) { console.error(`  batch at ${i} failed: ${e.message} (re-run --live to pick these up)`); }
    await new Promise(r => setTimeout(r, 1200));
  }
  console.log(`done: ${sent} sent`); process.exit(0);
}
console.log('use --count, --test <email> or --live');
