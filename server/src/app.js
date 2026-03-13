import express from 'express';
import aiRoutes from './routes/ai-routes.js';
import authRoutes from './routes/auth-routes.js';
import debugRoutes from './routes/debug-routes.js';
import githubRoutes from './routes/github-routes.js';
import storageRoutes from './routes/storage-routes.js';
import { enforceSecureTransport } from './middleware/transport.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', enforceSecureTransport);

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/debug', debugRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/github', githubRoutes);

  app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
