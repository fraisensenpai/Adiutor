import { useState } from 'react';
import { useStore } from '@/state/store';
import { Badge, SectionTitle } from './ui/primitives';
import { InfoIcon, ShieldIcon } from './ui/Icons';
import { roleLabel } from '@/lib/format';
import type { AgentRole } from '@shared/types';

const CONTEXT_OPTIONS = [2000, 4000, 6000, 10000, 16000];

export function SettingsView() {
  const settings = useStore((state) => state.settings);
  const providerStatus = useStore((state) => state.providerStatus);
  const appInfo = useStore((state) => state.appInfo);
  const index = useStore((state) => state.index);
  const setProvider = useStore((state) => state.setProvider);
  const saveSettings = useStore((state) => state.saveSettings);
  const setAgentModel = useStore((state) => state.setAgentModel);
  const setApiKey = useStore((state) => state.setApiKey);
  const clearApiKey = useStore((state) => state.clearApiKey);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const provider = providerStatus?.providers.find((item) => item.id === settings.provider);
  const hasKey = providerStatus?.apiKeys[settings.provider] === true;

  const submitKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    const ok = await setApiKey(settings.provider, apiKeyInput.trim());
    setSavingKey(false);
    if (ok) setApiKeyInput('');
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Ayarlar</h1>
          <p className="view-desc">Sağlayıcı, model ve güvenlik tercihleri.</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="stack">
          <section className="panel panel-pad" aria-labelledby="provider-title">
            <div id="provider-title">
              <SectionTitle hint="anahtar işletim sistemi kasasında">Sağlayıcı</SectionTitle>
            </div>
            <div className="provider-options" role="radiogroup" aria-label="AI sağlayıcı">
              {(providerStatus?.providers ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.provider === item.id}
                  className="provider-option"
                  onClick={() => {
                    setApiKeyInput('');
                    void setProvider(item.id);
                  }}
                >
                  <strong>{item.label}</strong>
                  <span className="provider-model">{item.defaultModel}</span>
                  <span className="provider-key-state">
                    <span
                      className={`status-dot ${
                        providerStatus?.apiKeys[item.id] ? 'status-dot-done' : 'status-dot-idle'
                      }`}
                      aria-hidden="true"
                    />
                    {providerStatus?.apiKeys[item.id] ? 'anahtar kayıtlı' : 'anahtar yok'}
                  </span>
                </button>
              ))}
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label className="field-label" htmlFor="provider-model">
                Varsayılan model
              </label>
              <input
                id="provider-model"
                className="input"
                list="provider-models"
                value={settings.model}
                onChange={(event) => void saveSettings({ model: event.target.value })}
                spellCheck={false}
              />
              <datalist id="provider-models">
                {(provider?.models ?? []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <span className="field-hint">Model kimliğini elle de yazabilirsiniz.</span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="api-key">
                {provider?.label ?? 'Sağlayıcı'} API anahtarı
              </label>
              <div className="field-row">
                <input
                  id="api-key"
                  className="input"
                  type="password"
                  autoComplete="off"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitKey();
                  }}
                  placeholder={provider?.keyHint ?? 'API anahtarı'}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void submitKey()}
                  disabled={savingKey || !apiKeyInput.trim()}
                >
                  {savingKey ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
                {hasKey ? (
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void clearApiKey(settings.provider)}
                  >
                    Sil
                  </button>
                ) : null}
              </div>
              <span className="field-hint">
                Anahtar işletim sisteminin güvenli kasasında şifreli tutulur ve yalnızca ana süreçte okunur.
              </span>
            </div>

            <div className="key-status">
              <ShieldIcon size={14} />
              <span className="grow">
                {providerStatus?.encryptionAvailable
                  ? `Güvenli kasa: ${providerStatus.keyStorage}`
                  : 'Güvenli kasa kullanılamıyor; anahtar kaydedilmez.'}
              </span>
              <Badge tone={hasKey ? 'success' : 'neutral'}>{hasKey ? 'hazır' : 'anahtar yok'}</Badge>
            </div>
          </section>

          <section className="panel panel-pad" aria-labelledby="agents-title">
            <div id="agents-title">
              <SectionTitle hint="görev grafiğinde de düzenlenebilir">Ajanlar</SectionTitle>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Model</th>
                  <th className="num">Etkin</th>
                </tr>
              </thead>
              <tbody>
                {(['planner', 'coder', 'reviewer'] as AgentRole[]).map((role) => (
                  <tr key={role}>
                    <td>
                      <strong>{roleLabel(role)}</strong>
                    </td>
                    <td>
                      <input
                        className="input"
                        list="provider-models"
                        value={settings.agents[role].model}
                        onChange={(event) => setAgentModel(role, event.target.value)}
                        aria-label={`${roleLabel(role)} modeli`}
                        spellCheck={false}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="checkbox"
                        checked={settings.agents[role].enabled}
                        onChange={(event) =>
                          void saveSettings({
                            agents: {
                              ...settings.agents,
                              [role]: { ...settings.agents[role], enabled: event.target.checked },
                            },
                          })
                        }
                        aria-label={`${roleLabel(role)} ajanı etkin`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel panel-pad" aria-labelledby="context-title">
            <div id="context-title">
              <SectionTitle>Bağlam</SectionTitle>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="context-budget">
                İstek başına bağlam bütçesi
              </label>
              <select
                id="context-budget"
                className="select"
                style={{ maxWidth: 220 }}
                value={settings.maxContextTokens}
                onChange={(event) => void saveSettings({ maxContextTokens: Number(event.target.value) })}
              >
                {CONTEXT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value.toLocaleString('tr-TR')} token
                  </option>
                ))}
              </select>
              <span className="field-hint">
                Bütçe aşılırsa parçalar sırayla atlanır ve kaç parçanın eklenmediği bildirilir.
              </span>
            </div>

            <div className="note">
              <InfoIcon size={14} />
              <span>
                Gizli dosyalar, .env, anahtarlar, sertifikalar, ikili dosyalar ve 512 KB üzeri dosyalar ne indekslenir
                ne de AI bağlamına eklenir.
              </span>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel panel-pad" aria-labelledby="security-title">
            <div id="security-title">
              <SectionTitle>Güvenlik</SectionTitle>
            </div>
            <div className="toggle-row">
              <input type="checkbox" checked readOnly aria-label="Görev onayı her zaman açık" />
              <div>
                <strong>Ajan görevleri için onay</strong>
                <span>Bir ajanın ürettiği yeni görev otomatik yürütülmez.</span>
              </div>
            </div>
            <div className="toggle-row">
              <input
                type="checkbox"
                checked
                disabled
                readOnly
                aria-label="Komut çalıştırma onayı her zaman açık"
              />
              <div>
                <strong>Komut çalıştırma onayı</strong>
                <span>Terminal komutları ve testler onay olmadan çalışmaz.</span>
              </div>
            </div>
            <div className="note" style={{ marginTop: 10 }}>
              <InfoIcon size={14} />
              <span>
                Değişiklikler sessizce yazılmaz; diff incelemesinde kabul ettiğiniz dosyalar diske yazılır ve “Geri
                al” ile eski içerik geri yüklenir.
              </span>
            </div>
          </section>

          <section className="panel panel-pad">
            <SectionTitle>Uygulama</SectionTitle>
            <table className="data-table">
              <tbody>
                <tr>
                  <td>Ad</td>
                  <td className="dim">{appInfo ? `${appInfo.name} ${appInfo.version}` : 'Adiutor'}</td>
                </tr>
                <tr>
                  <td>Electron</td>
                  <td className="dim">{appInfo?.electron ?? '—'}</td>
                </tr>
                <tr>
                  <td>Chrome / Node</td>
                  <td className="dim">
                    {appInfo?.chrome ?? '—'} / {appInfo?.node ?? '—'}
                  </td>
                </tr>
                <tr>
                  <td>Platform</td>
                  <td className="dim">{appInfo?.platform ?? '—'}</td>
                </tr>
                <tr>
                  <td>Ayrıştırıcı</td>
                  <td className="dim">{index?.parserNote ?? 'Henüz indekslenmedi.'}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
