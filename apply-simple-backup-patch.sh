#!/usr/bin/env bash
set -euo pipefail

# Run from the DM Events project root AFTER extracting the patch ZIP.
if [[ ! -f package.json || ! -f app/api/backups/route.ts || ! -f src/lib/manualBackup.ts ]]; then
  echo 'ERROR: Run this script in the DM Events project root after extracting the patch.' >&2
  exit 1
fi

# Retire all old Cloudflare/GitHub backup runners and scheduled HTTP routes.
# The message-retention scheduler is intentionally NOT touched.
rm -f '.github/workflows/dm-events-r2-backup.yml'
rm -f 'src/lib/backup.ts' 'src/lib/backup-dispatch.ts'
rm -f 'app/api/cron/backup/route.ts'
rmdir 'app/api/cron/backup' 2>/dev/null || true
rm -f 'docs/CLOUDFLARE_R2_SETUP.md'

printf '\nSimple backup patch applied. Old R2/GitHub backup runner files removed.\n'
printf 'No database migration or new backup environment variables are needed.\n'
printf 'Next: npm ci && npm run typecheck && npm run build\n'
printf 'Important: commit these deletions before deploying to deactivate the old GitHub backup schedule.\n'
