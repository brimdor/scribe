import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import githubApiRoutes from './github-api-routes.js';
import githubRepoRoutes from './github-repo-routes.js';
import githubSyncRoutes from './github-sync-routes.js';

const router = Router();

router.use(requireAuth);
router.use(githubSyncRoutes);
router.use(githubRepoRoutes);
router.use(githubApiRoutes);

export default router;
