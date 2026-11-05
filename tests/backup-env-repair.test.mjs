import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { archiveKeyProblem, readBackupEnvironment } from '../scripts/backup-env.mjs';

const script = resolve('scripts/configure-backup-environment.mjs');
const sanitized = { ...process.env };
delete sanitized.BACKUP_ARCHIVE_KEY;
delete sanitized.CRON_SECRET;

function workspace(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dm-events-backup-test-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function run(dir, env = sanitized) {
  return spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env });
}

test('recognizes missing and a single trailing backslash, without accepting malformed keys', () => {
  assert.equal(archiveKeyProblem(''), 'MISSING');
  assert.equal(archiveKeyProblem('ab'.repeat(32)), null);
  assert.equal(archiveKeyProblem('ab'.repeat(32) + '\\'), 'TRAILING_BACKSLASH');
  assert.equal(archiveKeyProblem('ab'.repeat(32) + 'x'), 'INVALID');
});

test('generates missing secrets and keeps unrelated .env contents intact', () => workspace(dir => {
  writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgresql://private:private@localhost/test\nBACKUP_ENCRYPTION_KEY=' + 'cd'.repeat(32) + '\n');
  const result = run(dir);
  assert.equal(result.status, 0, result.stderr);
  const output = readFileSync(join(dir, '.env.local'), 'utf8');
  const vars = parseEnv(output);
  assert.match(vars.BACKUP_ARCHIVE_KEY, /^[0-9a-f]{64}$/);
  assert.match(vars.CRON_SECRET, /^[0-9a-f]{64}$/);
  assert.notEqual(vars.BACKUP_ARCHIVE_KEY, 'cd'.repeat(32));
  assert.equal(statSync(join(dir, '.env.local')).mode & 0o777, 0o600);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(vars.BACKUP_ARCHIVE_KEY));
  const repeated = run(dir);
  assert.equal(repeated.status, 0);
  assert.equal(parseEnv(readFileSync(join(dir, '.env.local'), 'utf8')).BACKUP_ARCHIVE_KEY, vars.BACKUP_ARCHIVE_KEY);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8').includes('DATABASE_URL='), true);
}));

test('repairs one stray slash without regenerating a saved archive key', () => workspace(dir => {
  const wanted = 'fa'.repeat(32);
  writeFileSync(join(dir, '.env'), `BACKUP_ARCHIVE_KEY=${wanted}\\\nCRON_SECRET=${'ab'.repeat(32)}\n`);
  const runResult = run(dir);
  assert.equal(runResult.status, 0, runResult.stderr);
  const vars = parseEnv(readFileSync(join(dir, '.env.local'), 'utf8'));
  assert.equal(vars.BACKUP_ARCHIVE_KEY, wanted);
  assert.equal(vars.CRON_SECRET, 'ab'.repeat(32));
  assert.match(runResult.stdout, /Removed an accidental trailing character/);
}));

test('does not silently replace an arbitrary malformed key', () => workspace(dir => {
  writeFileSync(join(dir, '.env'), 'BACKUP_ARCHIVE_KEY=not-a-valid-key\n');
  const result = run(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must contain exactly 64 hexadecimal/);
}));

test('warns when an exported environment variable would override the repair', () => workspace(dir => {
  const result = run(dir, { ...sanitized, BACKUP_ARCHIVE_KEY: 'bad' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /overrides .env.local/);
}));

test('reports local environment sources in Next.js file priority', () => workspace(dir => {
  writeFileSync(join(dir, '.env'), 'BACKUP_ARCHIVE_KEY=' + 'aa'.repeat(32) + '\n');
  writeFileSync(join(dir, '.env.local'), 'BACKUP_ARCHIVE_KEY=' + 'bb'.repeat(32) + '\n');
  const { values, sources } = readBackupEnvironment({ cwd: dir });
  assert.equal(values.BACKUP_ARCHIVE_KEY, 'bb'.repeat(32));
  assert.equal(sources.BACKUP_ARCHIVE_KEY, '.env.local');
}));
