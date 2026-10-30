import { HttpError } from '@/lib/http';

const identifier = /^[a-zA-Z0-9_.-]+$/;
export function backupDispatchConfigured() {
  return Boolean(process.env.BACKUP_GITHUB_TOKEN && process.env.BACKUP_GITHUB_OWNER && process.env.BACKUP_GITHUB_REPO && process.env.BACKUP_GITHUB_REF);
}

/** Initiates a private GitHub Actions runner. 204 means queued, NOT that a backup succeeded. */
export async function dispatchBackup(logId?: string) {
  const { BACKUP_GITHUB_TOKEN: token, BACKUP_GITHUB_OWNER: owner, BACKUP_GITHUB_REPO: repo, BACKUP_GITHUB_REF: ref } = process.env;
  if (!token || !owner || !repo || !ref || !identifier.test(owner) || !identifier.test(repo) || !identifier.test(ref.replaceAll('/', ''))) {
    throw new HttpError(503, 'Backup runner is not configured. Set BACKUP_GITHUB_* environment variables.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/dm-events-r2-backup.yml/dispatches`, {
      method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: { backup_id: logId || '' } }),
    });
    if (response.status !== 204) throw new HttpError(502, `Backup runner rejected the request (HTTP ${response.status}). Check GitHub Actions permission, repository and workflow.`);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not contact the backup runner. Check GitHub Actions configuration.');
  } finally { clearTimeout(timeout); }
}
