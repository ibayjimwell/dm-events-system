#!/usr/bin/env node
/**
 * Remove obsolete database-backup version files left behind by ZIP patches.
 *
 * Modern implementation:
 *   PATCH /api/backups
 *   GET   /api/cron/daily-backup (Vercel cron)
 *   src/lib/managedBackupStore.ts + src/lib/backupSchedule.ts
 *
 * Safety:
 *  - never edits the database, stored backup objects or env files
 *  - checks modern implementation is present before changing anything
 *  - removes stale Next.js 16 generated route-type validators
 *  - refuses to remove files if active application code still imports them
 *  - preserves unrelated Vercel settings and cron jobs
 *  - does not mistake test fixture strings for application dependencies
 */
import {
  existsSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const modernFiles = [
  'app/api/backups/route.ts',
  'app/api/backups/file/route.ts',
  'app/api/cron/daily-backup/route.ts',
  'src/lib/managedBackupStore.ts',
  'src/lib/backupSchedule.ts',
];
const legacyFiles = [
  'app/api/backups/schedule/route.ts',
  'src/lib/backupManager.ts',
  'app/api/cron/database-backup/route.ts',
  'app/api/backups/[id]/route.ts',
  'app/api/backups/[id]/download/route.ts',
];
const obsoleteCronPaths = new Set([
  '/api/cron/database-backup',
  '/api/cron/backup', // old GitHub Actions/Cloudflare scheduler, not the managed daily endpoint
]);
const desiredCron = { path: '/api/cron/daily-backup', schedule: '0 18 * * *' };

const abs = (name) => join(root, name);
const source = (name) => readFileSync(abs(name), 'utf8');
function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

// PRE-FLIGHT: no deletion or writes until all checks succeed.
for (const name of modernFiles) {
  if (!existsSync(abs(name))) {
    fail(`Modern backup file missing: ${name}. No files were changed.`);
    process.exit();
  }
}
if (!/export const PATCH\s*=/.test(source(modernFiles[0])) ||
    !/saveStoredBackupSchedule/.test(source(modernFiles[0])) ||
    !/readStoredBackup/.test(source(modernFiles[1])) ||
    !/deleteStoredBackup/.test(source(modernFiles[1])) ||
    !/createStoredBackup\('automatic'\)/.test(source(modernFiles[2])) ||
    !/process\.env\.CRON_SECRET/.test(source(modernFiles[2])) ||
    !/export\s+async\s+function\s+saveStoredBackupSchedule/.test(source(modernFiles[3])) ||
    !/export\s+function\s+backupRunWindow/.test(source(modernFiles[4]))) {
  fail('Expected managed-backup implementation was not found. No files were changed.');
  process.exit();
}

const vercelFile = abs('vercel.json');
let vercel = {};
if (existsSync(vercelFile)) {
  try {
    vercel = JSON.parse(readFileSync(vercelFile, 'utf8'));
  } catch {
    fail('vercel.json is invalid JSON. Fix it first; no files were changed.');
    process.exit();
  }
}
if (!vercel || typeof vercel !== 'object' || Array.isArray(vercel) ||
    (vercel.crons !== undefined && !Array.isArray(vercel.crons))) {
  fail('vercel.json must be an object with an optional crons array. No files were changed.');
  process.exit();
}

// Test files are NOT runtime code. Older tests mentioning the old route must
// be replaced separately; they must not block the safe removal of old routes.
const extensions = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const ignored = new Set(['.git', '.next', 'node_modules', 'dist', 'build', '.vercel', 'coverage', 'backups']);
const sources = [];
function walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) walk(path);
    } else if (entry.isFile() && extensions.test(entry.name)) {
      const name = relative(root, path).replaceAll('\\', '/');
      if (!legacyFiles.includes(name) && name !== 'scripts/clean-obsolete-backup-files.mjs') {
        sources.push(name);
      }
    }
  }
}
for (const directory of ['app', 'src', 'scripts']) walk(abs(directory));

// Detect import statements AND direct calls to the legacy route. Ignore
// comments/documentation because they are not runtime dependencies.
const activeReferences = [];
const oldImport = /(?:from\s*|import\s*\(|require\s*\()\s*['"`]([^'"`]*?(?:\/backupManager|\/cron\/database-backup|\/backups\/schedule)(?:\.[a-z]+)?)['"`]/;
const oldRequest = /(?:fetch|axios\.(?:get|post|patch)|request)\s*\(\s*['"`]\/api\/backups\/schedule(?:\/|\?|['"`])/;
// Direct use of the obsolete /api/backups/[id] endpoints must be migrated
// to /api/backups/file?path=... before removing those handlers.
const oldItemRequest = /(?:fetch|axios\.(?:get|post|patch|delete)|request)\s*\(\s*`\/api\/backups\/\$\{|(?:fetch|axios\.(?:get|post|patch|delete)|request)\s*\(\s*['"`]\/api\/backups\/(?!file(?:\?|\/|['"`]))(?!schedule(?:\/|\?|['"`]))[^'"`]+/;
for (const name of sources) {
  const content = source(name);
  if (oldImport.test(content) || oldRequest.test(content) || oldItemRequest.test(content)) activeReferences.push(name);
}
if (activeReferences.length) {
  fail(`Active application files still depend on the old scheduler: ${activeReferences.join(', ')}. No files were changed.`);
  process.exit();
}

// The old item routes are safe to delete only when they really are the stale
// backupManager-powered versions. Keep any customized replacements intact.
for (const name of ['app/api/backups/[id]/route.ts', 'app/api/backups/[id]/download/route.ts']) {
  if (existsSync(abs(name)) && !source(name).includes('backupManager')) {
    fail(`${name} no longer imports backupManager. Inspect this route manually; no files were changed.`);
    process.exit();
  }
}

// Migrate the scheduled route without discarding unrelated crons, redirects,
// headers, builds or other vercel.json settings. Deduplicate the modern path.
const kept = (vercel.crons || []).filter(
  (job) => job && typeof job.path === 'string' &&
    !obsoleteCronPaths.has(job.path) && job.path !== desiredCron.path,
);
vercel.crons = [...kept, desiredCron];

// Filesystem edits happen only after the above checks passed.
for (const name of legacyFiles) {
  if (!existsSync(abs(name))) {
    console.log(`Already absent: ${name}`);
  } else {
    rmSync(abs(name));
    console.log(`Removed obsolete file: ${name}`);
  }
}
// Next.js 16 keeps generated route imports in these caches even after the
// backing route has been removed. Regeneration is automatic on next dev/build.
// Stop `next dev` before running this script to prevent cache re-creation.
for (const name of ['.next', 'tsconfig.tsbuildinfo']) {
  if (existsSync(abs(name))) {
    rmSync(abs(name), { recursive: true, force: true });
    console.log(`Cleared generated build cache: ${name}`);
  }
}
writeFileSync(vercelFile, JSON.stringify(vercel, null, 2) + '\n');
console.log('Vercel cron: /api/cron/daily-backup at 18:00 UTC (02:00 Asia/Manila).');
console.log(`Preserved ${kept.length} unrelated cron job(s).`);

// Prevent the previously observed Vercel 404: Git must track nested route files.
const gitignore = abs('.gitignore');
if (existsSync(gitignore)) {
  const original = readFileSync(gitignore, 'utf8');
  const updated = original.split(/\r?\n/).map((line) =>
    /^\s*backups\/\s*(?:#.*)?$/.test(line) ? '/backups/' : line,
  ).join('\n');
  if (updated !== original) {
    writeFileSync(gitignore, updated);
    console.log('Updated .gitignore: backups/ → /backups/');
  }
}
console.log('SUCCESS: legacy backup sources cleaned up; managed backups remain installed.');
console.log('Next: npm run build (regenerates Next.js route types), then npm run typecheck');
console.log('Review deleted routes and new files with git status, then stage with: git add -A');
