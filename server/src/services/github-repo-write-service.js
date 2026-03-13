import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import {
  buildToolTarget,
  pathExists,
  resolveRepoTarget,
  resolveWithinRepo,
} from './github-repo-files-shared.js';

export async function writeRepoFileForUser({
  userId,
  username,
  owner,
  repo,
  filePath,
  content,
  createDirectories = true,
}) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });

  if (typeof content !== 'string') {
    throw new Error('Text content is required.');
  }

  if (content.includes('\u0000')) {
    throw new Error('Binary file content is not supported for repository writes.');
  }

  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });
  const parentDir = path.dirname(absolutePath);

  if (!await pathExists(parentDir)) {
    if (!createDirectories) {
      throw new Error(`Parent directory does not exist for file path: ${normalizedPath}`);
    }

    await fsPromises.mkdir(parentDir, { recursive: true });
  }

  const existed = await pathExists(absolutePath);
  if (existed && !(await fsPromises.stat(absolutePath)).isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  await fsPromises.writeFile(absolutePath, content, 'utf8');

  return {
    ...buildToolTarget(target),
    path: normalizedPath,
    bytesWritten: Buffer.byteLength(content, 'utf8'),
    created: !existed,
    message: existed ? 'Repository file updated successfully.' : 'Repository file created successfully.',
  };
}

export async function moveRepoFileForUser({
  userId,
  username,
  owner,
  repo,
  fromPath,
  toPath,
  createDirectories = true,
}) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const source = resolveWithinRepo(target.repoPath, fromPath, 'Source path', { allowEmpty: false });
  const destination = resolveWithinRepo(target.repoPath, toPath, 'Destination path', { allowEmpty: false });

  if (source.normalizedPath === destination.normalizedPath) {
    throw new Error('Destination path must be different from the source path.');
  }

  if (!await pathExists(source.absolutePath)) {
    throw new Error(`Source path does not exist: ${source.normalizedPath}`);
  }

  const sourceStat = await fsPromises.stat(source.absolutePath);
  if (!sourceStat.isFile()) {
    throw new Error(`Source path is not a regular file: ${source.normalizedPath}`);
  }

  const parentDir = path.dirname(destination.absolutePath);
  if (!await pathExists(parentDir)) {
    if (!createDirectories) {
      throw new Error(`Parent directory does not exist for destination path: ${destination.normalizedPath}`);
    }

    await fsPromises.mkdir(parentDir, { recursive: true });
  }

  const existed = await pathExists(destination.absolutePath);
  if (existed && !(await fsPromises.stat(destination.absolutePath)).isFile()) {
    throw new Error(`Destination path is not a regular file: ${destination.normalizedPath}`);
  }

  await fsPromises.rename(source.absolutePath, destination.absolutePath);

  return {
    ...buildToolTarget(target),
    fromPath: source.normalizedPath,
    path: destination.normalizedPath,
    overwritten: existed,
    message: 'Repository file moved successfully.',
  };
}

export async function deleteRepoFileForUser({ userId, username, owner, repo, filePath }) {
  const target = await resolveRepoTarget({ userId, username, owner, repo });
  const { absolutePath, normalizedPath } = resolveWithinRepo(target.repoPath, filePath, 'File path', { allowEmpty: false });
  if (!await pathExists(absolutePath)) {
    throw new Error(`File path does not exist: ${normalizedPath}`);
  }

  const stat = await fsPromises.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`File path is not a regular file: ${normalizedPath}`);
  }

  await fsPromises.unlink(absolutePath);

  return {
    ...buildToolTarget(target),
    path: normalizedPath,
    deleted: true,
    message: 'Repository file deleted successfully.',
  };
}
