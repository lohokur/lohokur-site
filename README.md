# lohokur-site

The marketing site for LOHO KUR — "the OS of fashion". Static HTML on Vercel with
one edge middleware and one serverless function. No framework.

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | Homepage: bare white page, the mugshot and a download button. Software releases land here |
| `canvas.html` | The Canvas at `/canvas` — the former homepage, an orbital carousel of the 17 identities plus the OS view |
| `mugshot.jpg` | The homepage photo |
| `identities.html`, `identities/` | The identity set |
| `studio.html`, `pricing.html` | Studio and pricing pages |
| `middleware.js` | Vercel edge middleware gating the private portfolio |
| `api/accept.js` | Records acceptance of the portfolio terms |
| `vercel.json` | Clean URLs and redirects |

## The gate

`middleware.js` protects `/portfolio` and everything under it, media included. A
password plus a stated viewer name issues an HMAC-signed cookie, so holding the
cookie is not enough — it has to verify against `GATE_SECRET`. Knowing the
password alone doesn't let you forge one.

The portfolio pages themselves are deliberately **not in this repo**. They hold
unreleased product and production documents, and publishing them here would make
the gate pointless. `portfolio/` is gitignored.

Environment: `GATE_SECRET`, `GATE_PASSWORD`.

## Running it

```sh
npm install
vercel dev
```

Deploys with `vercel --prod`.
