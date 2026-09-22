#!/usr/bin/env node
/* Moderate the mugshot wall.

     node tools/mugshots.mjs            list the latest 50 (id, bytes, when, hidden)
     node tools/mugshots.mjs hide 12    take one off the wall
     node tools/mugshots.mjs show 12    put it back
     node tools/mugshots.mjs save 12    write it to ./mugshot-12.jpg to look at

   Needs DATABASE_URL — `vercel env pull .env.local --environment=production`. */

import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^DATABASE_URL="?([^"]+)"?$/);
      if (m) process.env.DATABASE_URL = m[1];
    }
  } catch {}
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL missing. Run: vercel env pull .env.local --environment=production');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const [cmd, arg] = process.argv.slice(2);
const id = Number.parseInt(arg || '', 10);

if (!cmd) {
  const rows = await sql`SELECT id, bytes, hidden, created_at, alias FROM mugshots ORDER BY id DESC LIMIT 50`;
  for (const r of rows) {
    console.log(`${String(r.id).padStart(5)}  ${String(r.bytes).padStart(7)} B  ${r.created_at.toISOString().slice(0, 16)}  ${r.hidden ? 'HIDDEN' : '      '}  ${r.alias || ''}`);
  }
  console.log(`${rows.length} shown`);
} else if ((cmd === 'hide' || cmd === 'show') && id) {
  const hidden = cmd === 'hide';
  const rows = await sql`UPDATE mugshots SET hidden = ${hidden} WHERE id = ${id} RETURNING id`;
  console.log(rows.length ? `${cmd} ${id}: done` : `no mugshot ${id}`);
} else if (cmd === 'save' && id) {
  const rows = await sql`SELECT image FROM mugshots WHERE id = ${id}`;
  if (!rows.length) { console.log(`no mugshot ${id}`); process.exit(1); }
  const out = new URL(`../mugshot-${id}.jpg`, import.meta.url);
  writeFileSync(out, Buffer.from(rows[0].image));
  console.log(`saved ${out.pathname}`);
} else {
  console.log('usage: mugshots.mjs [hide N | show N | save N]');
  process.exit(1);
}
