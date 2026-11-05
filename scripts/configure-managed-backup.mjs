#!/usr/bin/env node
/** Merge the daily backup cron into vercel.json without destroying other cron jobs. */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vercelFile = path.join(root, 'vercel.json');
const ignoreFile = path.join(root, '.gitignore');
const cron = { path: '/api/cron/daily-backup', schedule: '0 18 * * *' }; // 02:00 next day Asia/Manila

let config = {};
if (fs.existsSync(vercelFile)) {
  try {
    config = JSON.parse(fs.readFileSync(vercelFile, 'utf8'));
  } catch {
    console.error('ERROR: vercel.json is not valid JSON. Fix it before running the installer.');
    process.exit(1);
  }
}
if (!config || Array.isArray(config) || typeof config !== 'object') {
  console.error('ERROR: vercel.json should contain a JSON object.');
  process.exit(1);
}
const crons = Array.isArray(config.crons) ? config.crons : [];
const filtered = crons.filter(c => c.path !== cron.path);
config.crons = [...filtered, cron];
fs.writeFileSync(vercelFile, JSON.stringify(config, null, 2) + '\n');
console.log('Daily Vercel backup cron registered in vercel.json (18:00 UTC = 02:00 Manila).');

if (fs.existsSync(ignoreFile)) {
  const original = fs.readFileSync(ignoreFile, 'utf8');
  const updated = original.split(/\r?\n/).map(line => {
    if (/^\s*backups\/\s*(?:#.*)?$/.test(line)) return '/backups/';
    return line;
  }).join('\n');
  if (updated !== original) {
    fs.writeFileSync(ignoreFile, updated);
    console.log('Changed global backups/ ignore rule to /backups/ so API routes are committed.');
  }
}
console.log('Remember to git add vercel.json app/api/backups app/api/cron/daily-backup src/lib/managedBackup*');
