import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { completeManualChat, listManualModels, streamManualChat } from '../services/manual-openai.js';

const router = Router();

function respondWithAiError(res, error) {
  const message = error?.message || 'Manual provider request failed.';
  const status = /base url is required/i.test(message) ? 400 : 502;
  res.status(status).json({ error: message });
}

function sendSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.use(requireAuth);

router.get('/manual/models', async (req, res) => {
  try {
    const models = await listManualModels(req.auth.userId);
    res.status(200).json({ models });
  } catch (error) {
    respondWithAiError(res, error);
  }
});

router.post('/manual/chat', async (req, res) => {
  const payload = req.body || {};
  const options = {
    messages: payload.messages,
    model: payload.model,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens,
  };

  if (!payload.stream) {
    try {
      const response = await completeManualChat(req.auth.userId, options);
      res.status(200).json(response);
    } catch (error) {
      respondWithAiError(res, error);
    }
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const controller = new AbortController();
  let clientDisconnected = false;
  const handleClose = () => {
    clientDisconnected = true;
    controller.abort();
  };
  res.on('close', handleClose);

  try {
    const response = await streamManualChat(req.auth.userId, {
      ...options,
      signal: controller.signal,
      onMeta: (meta) => sendSseEvent(res, 'meta', meta),
      onChunk: ({ delta }) => sendSseEvent(res, 'chunk', { delta }),
    });
    if (!clientDisconnected) {
      sendSseEvent(res, 'done', response);
      res.end();
    }
  } catch (error) {
    if (!clientDisconnected) {
      sendSseEvent(res, 'error', { error: error.message || 'Manual provider request failed.' });
      res.end();
    }
  } finally {
    res.off('close', handleClose);
    if (!res.writableEnded && !clientDisconnected) {
      res.end();
    }
  }
});

export default router;
