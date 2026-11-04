#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# The old runner cron path used Cloudflare/GitHub and is obsolete.
rm -f app/api/cron/backup/route.ts
rm -f src/lib/backup.ts src/lib/backup-dispatch.ts
rm -f .github/workflows/dm-events-r2-backup.yml
# Clear stale Next.js generated route types to avoid errors referencing deleted cron files.
rm -rf .next
printf '%s\n' 'Backup history patch applied. Next steps: npm run db:migrate && npm run typecheck && npm run build'
