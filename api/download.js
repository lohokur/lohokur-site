/* lohokur.com/api/download?p=mac|intel|win → the current Blackglass installer, straight from the release.
   Reads the portal's live release so links in emails never go stale. */
export default async function handler(req, res) {
  const p = String(req.query.p || 'mac'); let target = 'https://lohokur.com';
  // On a phone there is nothing to install: send them to the homepage instead.
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(String(req.headers['user-agent'] || ''))) { res.setHeader('Cache-Control', 'no-store'); return res.redirect(302, 'https://lohokur.com'); }
  try {
    const j = await (await fetch('https://cracked-portal.vercel.app/api/apps')).json();
    const app = (j.apps || []).find(a => a.slug === 'blackglass'); const rels = (app && app.releases) || [];
    const pick = plat => { const xs = rels.filter(r => (r.platform || 'mac') === plat); return xs.find(r => r.live) || xs[0]; };
    const a = ((p === 'win' ? pick('win') : pick('mac')) || {}).assets || {};
    target = (p === 'win' ? a.exe_x64 : p === 'intel' ? a.dmg_x64 : a.dmg_arm64) || target;
  } catch (e) { console.error('download lookup failed', e); }
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, target);
}
