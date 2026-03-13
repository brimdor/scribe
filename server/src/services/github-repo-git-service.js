import { runGitCommand } from './github-repo-sync.js';
import {
  DEFAULT_GIT_LOG_LIMIT,
  MAX_GIT_LOG_LIMIT,
  buildToolTarget,
  clamp,
  normalizeRelativePath,
  resolveRepoTarget,
  trimOutput,
} from './github-repo-files-shared.js';

export async function getRepoGitStatusForUser({ userId, username, owner, repo }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const { stdout } = await runGitCommand(['-C', target.repoPath, 'status', '--short', '--branch']);
  const lines = stdout.split(/\r?\n/).filter(Boolean);

  return {
    ...buildToolTarget(target),
    clean: lines.length <= 1,
    branch: lines[0] || '',
    entries: lines.slice(1),
    output: trimOutput(stdout),
  };
}

export async function getRepoGitDiffForUser({ userId, username, owner, repo, filePath = '' }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const args = ['-C', target.repoPath, 'diff'];
  let normalizedPath = '';
  if (String(filePath || '').trim()) {
    normalizedPath = normalizeRelativePath(filePath, 'File path', { allowEmpty: false });
    args.push('--', normalizedPath);
  }

  const { stdout } = await runGitCommand(args);

  return {
    ...buildToolTarget(target),
    path: normalizedPath,
    output: trimOutput(stdout),
    hasChanges: !!stdout.trim(),
  };
}

export async function getRepoGitLogForUser({ userId, username, owner, repo, limit = DEFAULT_GIT_LOG_LIMIT }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const safeLimit = clamp(limit, DEFAULT_GIT_LOG_LIMIT, MAX_GIT_LOG_LIMIT);
  const { stdout } = await runGitCommand([
    '-C',
    target.repoPath,
    'log',
    `--max-count=${safeLimit}`,
    '--date=short',
    '--pretty=format:%H%x1f%h%x1f%an%x1f%ad%x1f%s',
  ]);

  const entries = stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, author, date, subject] = line.split('\u001f');
      return {
        sha,
        shortSha,
        author,
        date,
        subject,
      };
    });

  return {
    ...buildToolTarget(target),
    entries,
    output: trimOutput(entries.map((entry) => `${entry.shortSha} ${entry.subject} (${entry.date}, ${entry.author})`).join('\n')),
  };
}
