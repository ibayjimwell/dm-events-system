#!/usr/bin/env node
/**
 * Safely configures the server-only backup secrets in .env.local.
 *   npm run backup:configure
 * Existing valid keys are preserved to keep previous archives decryptable.
 * No secret values are printed or uploaded.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { archiveKeyProblem, explainArchiveKeyProblem, readBackupEnvironment } from './backup-env.mjs';

const cwd = process.cwd();
const destination = resolve(cwd, '.env.local');
const { values, sources } = readBackupEnvironment({ cwd });
const archiveSource = sources.BACKUP_ARCHIVE_KEY;
const cronSource = sources.CRON_SECRET;
let archive = values.BACKUP_ARCHIVE_KEY ?? '';
let cron = values.CRON_SECRET ?? '';
let generatedArchive = false;
let generatedCron = false;
let repaired = false;

// An exported variable has priority over any .env file, so editing .env.local
// alone cannot correct an invalid exported value.
const exportedArchive = archiveSource === 'exported environment';
const exportedCron = cronSource === 'exported environment';
if (exportedArchive && archiveKeyProblem(archive)) {
  console.error(`Cannot repair BACKUP_ARCHIVE_KEY: ${explainArchiveKeyProblem(archiveKeyProblem(archive))}`);
  console.error('It is set in the terminal or hosting environment and overrides .env.local. Fix it there, or run "unset BACKUP_ARCHIVE_KEY" before retrying.');
  process.exit(1);
}
if (exportedCron && cron.length < 32) {
  console.error('CRON_SECRET is set in the terminal or hosting environment but is too short. Correct it there, or run "unset CRON_SECRET" before retrying.');
  process.exit(1);
}

const problem = archiveKeyProblem(archive);
if (problem === 'TRAILING_BACKSLASH') {
  archive = archive.slice(0, -1);
  repaired = true;
} else if (problem === 'TRAILING_WHITESPACE') {
  archive = archive.trimEnd();
  repaired = true;
} else if (problem === 'MISSING') {
  console.log('No active archive encryption key was found.');
  console.log('If older stored backups exist, restore their original BACKUP_ARCHIVE_KEY before using this command; a new key cannot decrypt old archives.');
  archive = randomBytes(32).toString('hex');
  generatedArchive = true;
} else if (problem === 'INVALID') {
  console.error(explainArchiveKeyProblem(problem));
  console.error(`Correct the value in ${archiveSource ?? 'your environment'}. The tool will not replace an unrecognized key because that could make existing archives unreadable.`);
  process.exit(1);
}
if (cron.length < 32) {
  cron = randomBytes(32).toString('hex');
  generatedCron = true;
}

// Next.js gives .env.development.local and .env.production.local higher
// priority than .env.local, so do not report a misleading success if they
// contain an invalid conflicting key.
for (const mode of ['development', 'production']) {
  const path = resolve(cwd, `.env.${mode}.local`);
  if (!existsSync(path)) continue;
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  if (parsed.BACKUP_ARCHIVE_KEY !== undefined && archiveKeyProblem(parsed.BACKUP_ARCHIVE_KEY)) {
    console.error(`The higher-priority .env.${mode}.local has an invalid BACKUP_ARCHIVE_KEY. Correct that file before using Next.js in ${mode} mode.`);
    process.exit(1);
  }
  if (parsed.CRON_SECRET !== undefined && parsed.CRON_SECRET.length < 32) {
    console.error(`The higher-priority .env.${mode}.local contains an invalid CRON_SECRET. Correct that file before using Next.js in ${mode} mode.`);
    process.exit(1);
  }
}

const original = existsSync(destination) ? readFileSync(destination, 'utf8') : '';
// Preserve every other variable and comment; remove only these two keys.
const lines = original.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?(?:BACKUP_ARCHIVE_KEY|CRON_SECRET)\s*=/.test(line));
while (lines.length && lines.at(-1) === '') lines.pop();
lines.push('', '# Database backup: server-only secrets (keep private and stable).');
lines.push(`BACKUP_ARCHIVE_KEY=${archive}`);
lines.push(`CRON_SECRET=${cron}`);
const output = lines.join('\n') + '\n';
const temp = `${destination}.${process.pid}.tmp`;
try {
  writeFileSync(temp, output, { mode: 0o600, flag: 'wx' });
  chmodSync(temp, 0o600);
  renameSync(temp, destination);
} catch (error) {
  if (existsSync(temp)) unlinkSync(temp);
  throw error;
}
console.log('Updated .env.local with valid server-only backup settings (values hidden).');
if (repaired) console.log('Removed an accidental trailing character from the existing archive encryption key.');
if (generatedArchive) console.log('Generated a new archive encryption key. Previous archives, if any, will require their original key.');
if (generatedCron) console.log('Generated a new scheduled-backup authorization secret.');
console.log('Keep this file private; .env.local must not be committed or uploaded.');
console.log('Restart Next.js. For Vercel, separately update the same two environment variables and redeploy.');
