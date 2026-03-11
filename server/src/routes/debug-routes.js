import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { appendEventLog, getEventLogPath } from '../services/event-log.js';

const router = Router();

router.use(requireAuth);

router.post('/events', (req, res) => {
  appendEventLog({
    source: 'client',
    userId: req.auth.userId,
    user: req.auth.user?.login || '',
    category: String(req.body?.category || '').trim() || 'general',
    event: String(req.body?.event || '').trim() || 'unknown',
    details: req.body?.details || {},
  });

  res.status(204).end();
});

router.get('/events/meta', (_req, res) => {
  res.status(200).json({ logPath: getEventLogPath() });
});

export default router;
