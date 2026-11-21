import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ProviderId } from '../../src/shared/types';

/**
 * Gizli anahtar saklama.
 *
 * Anahtarlar işletim sisteminin güvenli kasası (Windows DPAPI / macOS Keychain /
 * Linux secret service) üzerinden `safeStorage` ile şifrelenir. Diske yalnızca
 * şifreli blob yazılır. Şifreleme kullanılamıyorsa anahtar SAKLANMAZ.
 */

type SecretStore = Partial<Record<ProviderId, string>>;

function secretsFile(): string {
  return path.join(app.getPath('userData'), 'secrets.enc.json');
}

function readStore(): SecretStore {
  try {
    const raw = fs.readFileSync(secretsFile(), 'utf8');
    const parsed = JSON.parse(raw) as SecretStore;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: SecretStore): void {
  const file = secretsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store), { encoding: 'utf8', mode: 0o600 });
}

let availability: boolean | null = null;
let priming: Promise<boolean> | null = null;

/** Güvenli kasa durumunu bir kez (asenkron) denetler; sonuç önbelleğe alınır. */
export function initEncryption(): Promise<boolean> {
  if (availability !== null) return Promise.resolve(availability);
  if (!priming) {
    priming = safeStorage
      .isAsyncEncryptionAvailable()
      .then((value) => {
        availability = value;
        return value;
      })
      .catch(() => {
        availability = false;
        return false;
      });
  }
  return priming;
}

export function encryptionAvailable(): boolean {
  return availability === true;
}

export function keyStorageLabel(): string {
  if (!encryptionAvailable()) return 'kullanılamıyor';
  if (process.platform === 'win32') return 'Windows DPAPI (safeStorage)';
  if (process.platform === 'darwin') return 'macOS Keychain (safeStorage)';
  return 'Linux gizli servis (safeStorage)';
}

export function hasApiKey(provider: ProviderId): boolean {
  return Boolean(readStore()[provider]);
}

export async function setApiKey(
  provider: ProviderId,
  apiKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = apiKey.trim();
  if (!trimmed) return { ok: false, error: 'Anahtar boş olamaz.' };
  if (!(await initEncryption())) {
    return {
      ok: false,
      error:
        'İşletim sistemi güvenli kasası kullanılamıyor. Anahtar düz metin olarak saklanmaz; bu nedenle kayıt yapılmadı.',
    };
  }
  try {
    const encrypted = safeStorage.encryptString(trimmed);
    const store = readStore();
    store[provider] = encrypted.toString('base64');
    writeStore(store);
    return { ok: true };
  } catch {
    // Hata mesajında anahtarın kendisi asla yer almaz.
    return { ok: false, error: 'Anahtar şifrelenemedi. Güvenli kasa erişimi başarısız.' };
  }
}

export function getApiKey(provider: ProviderId): string | null {
  const encoded = readStore()[provider];
  if (!encoded) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'));
  } catch (error) {
    // Anahtarın kendisi loglanmaz; yalnızca çözme hatası bildirilir.
    console.error(
      `[secrets] ${provider} anahtarı çözülemedi:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export function clearApiKey(provider: ProviderId): void {
  const store = readStore();
  delete store[provider];
  writeStore(store);
}
