import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildMain } from './build-main.mjs';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}`;
console.log(`[adiutor] renderer: ${url}`);

const contexts = await buildMain({ watch: true });

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    ADIUTOR_DEV_SERVER_URL: url,
    ADIUTOR_DEBUG: '1',
  },
});

let closing = false;
const shutdown = async (code = 0) => {
  if (closing) return;
  closing = true;
  if (contexts) await Promise.all(contexts.map((ctx) => ctx.dispose()));
  await server.close();
  process.exit(code);
};

child.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => {
  child.kill();
  void shutdown(0);
});
