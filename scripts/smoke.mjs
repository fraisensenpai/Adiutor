/**
 * Uygulamayı ayrı bir test profilinde başlatır, arayüzün hatasız yüklendiğini
 * doğrular ve uygulama içi ekran görüntülerini `.smoke/` klasörüne yazar.
 *
 * Test profili ayrıdır: gerçek sohbet/kullanım verisine dokunmaz ve pencere
 * görünmez olduğu için normal kullanımı etkilemez.
 *
 * Kullanım: npm run smoke            (temel: uygulama açılışı)
 *          npm run smoke -- deep     (örnek proje + indeks + demo ajan + grafik)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const depth = process.argv.includes('--basic') ? 'basic' : 'deep';
const profileDir = path.resolve('.smoke', 'profile');

const child = spawn(electronPath, ['.', `--user-data-dir=${profileDir}`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ADIUTOR_SMOKE: depth,
    ADIUTOR_DEBUG: '1',
    NODE_ENV: 'production',
  },
});

const timeout = setTimeout(() => {
  console.error('[smoke] zaman aşımı');
  child.kill();
  process.exit(1);
}, 90_000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  process.exit(code ?? 1);
});
