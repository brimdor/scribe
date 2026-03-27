import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import agentRoutes from './routes/agent-routes.js';
import authRoutes from './routes/auth-routes.js';
import debugRoutes from './routes/debug-routes.js';
import githubRoutes from './routes/github-routes.js';
import storageRoutes from './routes/storage-routes.js';
import { enforceSecureTransport } from './middleware/transport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, '../../dist');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', enforceSecureTransport);

  // Serve static frontend files
  app.use(express.static(distPath));

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/agent', agentRoutes);
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
