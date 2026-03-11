import fs from 'node:fs';
import path from 'node:path';

const LOG_DIR = path.resolve(process.cwd(), 'server', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'agent-events.log');

export function appendEventLog(entry = {}) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(LOG_FILE, `${JSON.stringify(payload)}\n`, 'utf8');
}

export function getEventLogPath() {
  return LOG_FILE;
}
