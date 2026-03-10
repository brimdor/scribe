import { createApp } from './src/app.js';
import { getConfig } from './src/config/env.js';
import { getDatabase } from './src/db/database.js';

const app = createApp();
const { port } = getConfig();

getDatabase();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Scribe API listening on http://localhost:${port}`);
});
