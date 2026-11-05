import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/clean-obsolete-backup-files.mjs');
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), 'dm-managed-backup-migration-'));
  const put = (name, content) => { const path = join(dir, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); };
  put('app/api/backups/route.ts', "export const PATCH = () => saveStoredBackupSchedule('daily');");
  put('app/api/backups/file/route.ts', 'export const GET = () => readStoredBackup(); export const DELETE = () => deleteStoredBackup();');
  put('app/api/cron/daily-backup/route.ts', "const secret=process.env.CRON_SECRET; createStoredBackup('automatic');");
  put('src/lib/managedBackupStore.ts', 'export async function saveStoredBackupSchedule(frequency) { return {frequency}; }');
  put('src/lib/backupSchedule.ts', 'export function backupRunWindow() { return {}; }');
  put('app/api/backups/schedule/route.ts', 'legacy route');
  put('src/lib/backupManager.ts', 'legacy manager');
  put('app/api/cron/database-backup/route.ts', "import {runBackup} from '@/lib/backupManager';");
  put('app/api/backups/[id]/route.ts', "import { deleteStoredBackup } from '@/lib/backupManager';");
  put('app/api/backups/[id]/download/route.ts', "import { getStoredBackup } from '@/lib/backupManager';");
  put('.next/dev/types/validator.ts', "import('../../../app/api/backups/schedule/route.js');");
  put('.next/types/validator.ts', "import('../../app/api/cron/database-backup/route.js');");
  put('tsconfig.tsbuildinfo', '{}');
  put('.gitignore', 'node_modules\nbackups/\n');
  put('vercel.json', JSON.stringify({ framework: 'nextjs', crons: [
    { path: '/api/cron/database-backup', schedule: '0 0 * * *' },
    { path: '/api/cron/notifications', schedule: '0 0 * * *' },
  ] }));
  return { dir, put, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};
const run = dir => spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });

test('removes five obsolete sources and generated Next.js types, preserves managed API and unrelated crons', () => {
  const p = make();
  try {
    p.put('tests/backup-archive-history.test.cjs', "// fixture mentions /api/backups/schedule and '@/lib/backupManager'");
    p.put('tests/clean-obsolete-backup-files.test.mjs', "// fixture mentions '/api/backups/schedule'");
    const result = run(p.dir);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ['app/api/backups/schedule/route.ts', 'src/lib/backupManager.ts', 'app/api/cron/database-backup/route.ts', 'app/api/backups/[id]/route.ts', 'app/api/backups/[id]/download/route.ts', '.next', 'tsconfig.tsbuildinfo']) {
      assert.equal(existsSync(join(p.dir, name)), false);
    }
    assert.ok(existsSync(join(p.dir, 'app/api/backups/file/route.ts')));
    const vercel = JSON.parse(readFileSync(join(p.dir, 'vercel.json'), 'utf8'));
    assert.equal(vercel.framework, 'nextjs');
    assert.deepEqual(vercel.crons, [
      { path: '/api/cron/notifications', schedule: '0 0 * * *' },
      { path: '/api/cron/daily-backup', schedule: '0 18 * * *' },
    ]);
    assert.match(readFileSync(join(p.dir, '.gitignore'), 'utf8'), /^\/backups\/$/m);
    assert.equal(run(p.dir).status, 0); // idempotent
  } finally { p.cleanup(); }
});

test('refuses to modify anything if active application code imports the legacy manager', () => {
  const p = make();
  try {
    p.put('app/api/events/route.ts', "import { runBackup } from '@/lib/backupManager';");
    const before = readFileSync(join(p.dir, 'vercel.json'), 'utf8');
    const result = run(p.dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /app\/api\/events\/route\.ts/);
    assert.equal(existsSync(join(p.dir, 'src/lib/backupManager.ts')), true);
    assert.equal(readFileSync(join(p.dir, 'vercel.json'), 'utf8'), before);
  } finally { p.cleanup(); }
});

test('refuses to modify anything if modern cron is missing', () => {
  const p = make();
  try {
    rmSync(join(p.dir, 'app/api/cron/daily-backup/route.ts'));
    const result = run(p.dir);
    assert.equal(result.status, 1);
    assert.equal(existsSync(join(p.dir, 'src/lib/backupManager.ts')), true);
  } finally { p.cleanup(); }
});

test('refuses to overwrite invalid Vercel configuration', () => {
  const p = make();
  try {
    p.put('vercel.json', '{not json');
    const result = run(p.dir);
    assert.equal(result.status, 1);
    assert.equal(existsSync(join(p.dir, 'app/api/cron/database-backup/route.ts')), true);
  } finally { p.cleanup(); }
});

test('does not remove legacy routes when another active component imports backupManager', () => {
  const p = make();
  try {
    p.put('src/components/LegacyBackup.tsx', 'import { getStoredBackup } from "@/lib/backupManager";');
    const result = run(p.dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /LegacyBackup\.tsx/);
    assert.equal(existsSync(join(p.dir, 'app/api/backups/[id]/download/route.ts')), true);
    assert.equal(existsSync(join(p.dir, '.next')), true);
  } finally { p.cleanup(); }
});

test('does not silently delete a custom backup-id route that no longer uses legacy manager', () => {
  const p = make();
  try {
    p.put('app/api/backups/[id]/route.ts', 'export const GET = async () => Response.json({ ok: true });');
    const result = run(p.dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no longer imports backupManager/);
    assert.equal(existsSync(join(p.dir, 'app/api/backups/[id]/route.ts')), true);
  } finally { p.cleanup(); }
});
