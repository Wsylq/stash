import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();

const app = await buildApp(config);

app.listen({ port: config.port, host: config.host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`[stash] API listening on ${address}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[stash] ${signal} — shutting down`);
    app.close(() => process.exit(0));
  });
}