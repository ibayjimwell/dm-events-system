/**
 * Run locally: node scripts/diagnose-backup-storage.mjs
 * Optional:    node scripts/diagnose-backup-storage.mjs --initialize
 *
 * Reads Next.js local env files without ever printing secret values.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Node.js 20.12+ supports the same dotenv syntax used in .env.local.
for (const file of ['.env.local', '.env']) {
  if (existsSync(resolve(file))) process.loadEnvFile(resolve(file));
}
const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serverKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const archiveKey = process.env.BACKUP_ARCHIVE_KEY || '';
const issues = [];

try {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || /^project\./i.test(parsed.hostname)) throw Error();
} catch { issues.push('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) must contain your project URL.'); }

function validServerKey(value) {
  if (value.startsWith('sb_secret_')) return value.length > 'sb_secret_'.length + 15;
  if (!value || value.startsWith('sb_publishable_')) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role'; }
  catch { return false; }
}
if (!validServerKey(serverKey)) issues.push('SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) must be a server secret, not the anon/public key.');
if (!/^[0-9a-f]{64}$/i.test(archiveKey)) issues.push('BACKUP_ARCHIVE_KEY must be exactly 64 hexadecimal characters.');

if (issues.length) {
  console.error('Database Backup configuration is incomplete:');
  for (const issue of issues) console.error(`  - ${issue}`);
  console.error('\nCreate an encryption key with: openssl rand -hex 32');
  console.error('Set the values in .env.local and in the production deployment settings.');
  process.exitCode = 1;
} else {
  console.log('Database Backup environment configuration: OK');
  const { createClient } = await import('@supabase/supabase-js');
  const storage = createClient(url, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).storage;
  const bucketName = 'dm-events-database-backups';
  try {
    const { data, error } = await storage.getBucket(bucketName);
    if (data?.public) {
      console.error('The backup bucket exists but is PUBLIC. Make it private in Supabase Storage before continuing.');
      process.exitCode = 1;
    } else if (data) {
      console.log('Private backup storage: ready');
    } else if (error && (Number(error.status ?? error.statusCode) === 404 || /not found/i.test(error.message ?? ''))) {
      if (!process.argv.includes('--initialize')) {
        console.log('The backup bucket does not exist yet. It will be created on the first backup.');
        console.log('To create it now, rerun with --initialize.');
      } else {
        const { error: createdError } = await storage.createBucket(bucketName, {
          public: false,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ['application/octet-stream'],
        });
        if (createdError) {
          console.error(`Could not create the private backup bucket (${createdError.statusCode || 'storage error'}). Check the Supabase server key and Storage limits.`);
          process.exitCode = 1;
        } else {
          console.log('Private backup bucket created successfully.');
        }
      }
    } else {
      console.error(`Supabase Storage check failed (${error?.statusCode ?? 'connection error'}). Confirm the project URL and server secret in .env.local.`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Cannot connect to Supabase Storage. Check network connectivity and the configured project URL.');
    process.exitCode = 1;
  }
}
