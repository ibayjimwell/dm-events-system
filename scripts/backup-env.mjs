/**
 * DM Events backup environment helpers.
 * Reads local env files in Next.js precedence order. Never logs secret values.
 * No external dependencies or network access are required.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export function environmentFiles(mode = process.env.NODE_ENV || 'development') {
  // Lowest priority first. An exported environment variable overrides every file.
  return ['.env', `.env.${mode}`, '.env.local', `.env.${mode}.local`];
}

export function readBackupEnvironment({ cwd = process.cwd(), mode } = {}) {
  const values = {};
  const sources = {};
  for (const filename of environmentFiles(mode)) {
    const path = resolve(cwd, filename);
    if (!existsSync(path)) continue;
    const parsed = parseEnv(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      values[key] = value;
      sources[key] = filename;
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      values[key] = value;
      sources[key] = 'exported environment';
    }
  }
  return { values, sources };
}

export function archiveKeyProblem(value) {
  if (!value) return 'MISSING';
  if (/^[0-9a-f]{64}$/i.test(value)) return null;
  if (/^[0-9a-f]{64}\\$/i.test(value)) return 'TRAILING_BACKSLASH';
  if (/^[0-9a-f]{64}\s+$/i.test(value)) return 'TRAILING_WHITESPACE';
  return 'INVALID';
}

export function explainArchiveKeyProblem(problem) {
  switch (problem) {
    case 'MISSING': return 'BACKUP_ARCHIVE_KEY is not configured.';
    case 'TRAILING_BACKSLASH': return 'BACKUP_ARCHIVE_KEY has an extra backslash after the 64 hexadecimal characters.';
    case 'TRAILING_WHITESPACE': return 'BACKUP_ARCHIVE_KEY has extra whitespace after the 64 hexadecimal characters.';
    case 'INVALID': return 'BACKUP_ARCHIVE_KEY must contain exactly 64 hexadecimal characters (no quotes, slashes, or extra text).';
    default: return null;
  }
}
