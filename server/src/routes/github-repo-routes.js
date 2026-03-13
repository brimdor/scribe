import { Router } from 'express';
import {
  deleteRepoFileForUser,
  findRepoNotesByTagForUser,
  getRepoGitDiffForUser,
  getRepoGitLogForUser,
  getRepoGitStatusForUser,
  listRepoNotesForUser,
  listRepoTreeForUser,
  listRepoNoteTagsForUser,
  moveRepoFileForUser,
  readRepoNoteFrontmatterForUser,
  readRepoFileForUser,
  searchRepoFilesForUser,
  writeRepoFileForUser,
} from '../services/github-repo-files.js';
import { sendError } from './github-route-helpers.js';

const router = Router();
const repoBadRequestPattern = /required|invalid path segment|resolves outside|no repository assignment/i;
const repoNotFoundPattern = /does not exist|not available|not a folder|not a regular file|checkout is invalid/i;

router.get('/repo/tree', async (req, res) => {
  try {
    const tree = await listRepoTreeForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      dir: req.query.dir,
      limit: req.query.limit,
    });

    res.status(200).json({ tree });
  } catch (error) {
    sendError(res, error, 'Unable to list repository files.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: repoNotFoundPattern });
  }
});

router.get('/repo/file', async (req, res) => {
  try {
    const file = await readRepoFileForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
      maxBytes: req.query.maxBytes,
      maxLines: req.query.maxLines,
    });

    res.status(200).json({ file });
  } catch (error) {
    sendError(res, error, 'Unable to read repository file.', {
      badRequestPattern: /required|invalid path segment|resolves outside|no repository assignment|binary file/i,
      notFoundPattern: repoNotFoundPattern,
    });
  }
});

router.put('/repo/file', async (req, res) => {
  try {
    const file = await writeRepoFileForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.body?.owner,
      repo: req.body?.repo,
      filePath: req.body?.path,
      content: req.body?.content,
      createDirectories: req.body?.createDirectories,
    });

    res.status(200).json({ file });
  } catch (error) {
    sendError(res, error, 'Unable to write repository file.', {
      badRequestPattern: /required|invalid path segment|resolves outside|no repository assignment|binary file|parent directory/i,
      notFoundPattern: repoNotFoundPattern,
    });
  }
});

router.patch('/repo/file', async (req, res) => {
  try {
    const file = await moveRepoFileForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.body?.owner,
      repo: req.body?.repo,
      fromPath: req.body?.fromPath,
      toPath: req.body?.toPath,
      createDirectories: req.body?.createDirectories,
    });

    res.status(200).json({ file });
  } catch (error) {
    sendError(res, error, 'Unable to move repository file.', {
      badRequestPattern: /required|invalid path segment|resolves outside|no repository assignment|parent directory|destination path must/i,
      notFoundPattern: /does not exist|not available|not a regular file|checkout is invalid/i,
    });
  }
});

router.delete('/repo/file', async (req, res) => {
  try {
    const file = await deleteRepoFileForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
    });

    res.status(200).json({ file });
  } catch (error) {
    sendError(res, error, 'Unable to delete repository file.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: repoNotFoundPattern });
  }
});

router.get('/repo/search', async (req, res) => {
  try {
    const search = await searchRepoFilesForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      query: req.query.q,
      dir: req.query.dir,
      limit: req.query.limit,
    });

    res.status(200).json({ search });
  } catch (error) {
    sendError(res, error, 'Unable to search repository.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: /does not exist|not available|not a folder|checkout is invalid/i });
  }
});

router.get('/repo/note-tags', async (req, res) => {
  try {
    const noteTags = await listRepoNoteTagsForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
    });

    res.status(200).json({ noteTags });
  } catch (error) {
    sendError(res, error, 'Unable to inspect repository note tags.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: /does not exist|not available|checkout is invalid/i });
  }
});

router.get('/repo/notes', async (req, res) => {
  try {
    const notes = await listRepoNotesForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      dir: req.query.dir,
      limit: req.query.limit,
    });

    res.status(200).json({ notes });
  } catch (error) {
    sendError(res, error, 'Unable to list repository notes.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: /does not exist|not available|checkout is invalid|not a folder/i });
  }
});

router.get('/repo/note/frontmatter', async (req, res) => {
  try {
    const note = await readRepoNoteFrontmatterForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
    });

    res.status(200).json({ note });
  } catch (error) {
    sendError(res, error, 'Unable to read note frontmatter.', {
      badRequestPattern: /required|invalid path segment|resolves outside|no repository assignment|markdown files/i,
      notFoundPattern: /does not exist|not available|checkout is invalid|not a regular file/i,
    });
  }
});

router.get('/repo/notes/by-tag', async (req, res) => {
  try {
    const notes = await findRepoNotesByTagForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      tag: req.query.tag,
      limit: req.query.limit,
    });

    res.status(200).json({ notes });
  } catch (error) {
    sendError(res, error, 'Unable to find notes by tag.', {
      badRequestPattern: /required|invalid path segment|resolves outside|no repository assignment|tag is required/i,
      notFoundPattern: /does not exist|not available|checkout is invalid|not a folder/i,
    });
  }
});

router.get('/repo/git/status', async (req, res) => {
  try {
    const status = await getRepoGitStatusForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
    });

    res.status(200).json({ status });
  } catch (error) {
    sendError(res, error, 'Unable to inspect repository status.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: /does not exist|not available|checkout is invalid/i });
  }
});

router.get('/repo/git/diff', async (req, res) => {
  try {
    const diff = await getRepoGitDiffForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      filePath: req.query.path,
    });

    res.status(200).json({ diff });
  } catch (error) {
    sendError(res, error, 'Unable to inspect repository diff.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: /does not exist|not available|checkout is invalid/i });
  }
});

router.get('/repo/git/log', async (req, res) => {
  try {
    const log = await getRepoGitLogForUser({
      userId: req.auth.userId,
      username: req.auth.user.login,
      owner: req.query.owner,
      repo: req.query.repo,
      limit: req.query.limit,
    });

    res.status(200).json({ log });
  } catch (error) {
    sendError(res, error, 'Unable to inspect repository history.', { badRequestPattern: repoBadRequestPattern, notFoundPattern: /does not exist|not available|checkout is invalid/i });
  }
});

export default router;
