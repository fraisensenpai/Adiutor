import * as esbuild from 'esbuild';
import path from 'node:path';

const root = process.cwd();

/** Ana süreç ve preload paketlerini derler. Bağımlılıklar node_modules'tan çalışır. */
export async function buildMain({ watch = false } = {}) {
  const shared = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    packages: 'external',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'info',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
  };

  const configs = [
    {
      ...shared,
      entryPoints: [path.join(root, 'electron/main.ts')],
      outfile: path.join(root, 'dist-electron/main.cjs'),
    },
    {
      ...shared,
      entryPoints: [path.join(root, 'electron/preload.ts')],
      outfile: path.join(root, 'dist-electron/preload.cjs'),
    },
  ];

  if (!watch) {
    await Promise.all(configs.map((config) => esbuild.build(config)));
    return null;
  }

  const contexts = await Promise.all(configs.map((config) => esbuild.context(config)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  return contexts;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-main.mjs')) {
  await buildMain();
}
