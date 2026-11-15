'use strict';

const { createApp } = require('./app');
const { createDb, init } = require('./db');
const { shouldSeed, seedDemoData } = require('./seed');

async function main() {
  const env = process.env;
  const db = createDb(env);
  await init(db);
  if (shouldSeed(env)) {
    await seedDemoData(db);
  }
  const app = createApp({ env, db });
  const port = Number(env.PORT || 8000);
  const host = '0.0.0.0';
  app.listen(port, host, () => {
    console.log(`Listening on http://${host}:${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
