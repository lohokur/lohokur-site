#!/usr/bin/env node
/* Prints the email list as CSV — the hand-off to Resend.

   Usage: node tools/list-subscribers.mjs [> list.csv]
   Reads DATABASE_URL from .env.local. Unsubscribed addresses are left out. */

import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url =
  process.env.DATABASE_URL ||
  (readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .match(/^DATABASE_URL="?(.+?)"?$/m) || [])[1];

if (!url) {
  console.error('DATABASE_URL not found (env or .env.local)');
  process.exit(1);
}

const sql = neon(url);
const rows = await sql`
  select email, source, created_at
  from email_signups
  where unsubscribed_at is null
  order by created_at`;

console.log('email,source,signed_up_at');
for (const r of rows) console.log(`${r.email},${r.source},${r.created_at.toISOString()}`);
console.error(`${rows.length} subscriber${rows.length === 1 ? '' : 's'}`);
