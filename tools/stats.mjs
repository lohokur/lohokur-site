#!/usr/bin/env node
/* Who signed up, who opened, who clicked.

   Usage: node tools/stats.mjs [campaign]   (default: welcome)
   Opens are counted per address, not per load — one person opening five times
   is one open. Reads DATABASE_URL from .env.local. */

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const campaign = process.argv[2] || 'welcome';
const url =
  process.env.DATABASE_URL ||
  (readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .match(/^DATABASE_URL="?(.+?)"?$/m) || [])[1];

if (!url) {
  console.error('DATABASE_URL not found (env or .env.local)');
  process.exit(1);
}

const sql = neon(url);

const [{ subs }] = await sql`select count(*)::int as subs from email_signups where unsubscribed_at is null`;
const [{ opens }] = await sql`
  select count(distinct email)::int as opens from email_events where kind = 'open' and campaign = ${campaign}`;
const [{ clicks }] = await sql`
  select count(distinct email)::int as clicks from email_events where kind = 'click' and campaign = ${campaign}`;

const pct = (n) => (subs ? `${Math.round((n / subs) * 100)}%` : '—');

console.log(`campaign: ${campaign}`);
console.log(`subscribers  ${subs}`);
console.log(`opened       ${opens}  (${pct(opens)})`);
console.log(`clicked      ${clicks}  (${pct(clicks)})`);
