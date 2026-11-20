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
  const openSample = useStore((state) => state.openSample);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const provider = providerStatus?.providers.find((item) => item.id === settings.provider);
  const isDemo = settings.provider === 'demo';

  const submitKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    const ok = await setApiKey(apiKeyInput.trim());
    setSavingKey(false);
    if (ok) setApiKeyInput('');
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Ayarlar</h1>
          <p className="view-desc">
            Sağlayıcı, model ve güvenlik tercihleri. Anahtarlar düz metin olarak hiçbir zaman diske veya tarayıcı
            deposuna yazılmaz.
          </p>
        </div>
        <div className="view-header-actions">
          <button type="button" className="button" onClick={() => void openSample()}>
            Örnek projeyi aç
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <div className="stack">
          <section className="panel panel-pad" aria-labelledby="provider-title">
            <div id="provider-title">
              <SectionTitle hint="adaptör tabanlı">Sağlayıcı</SectionTitle>
            </div>
            <div className="provider-options" role="radiogroup" aria-label="AI sağlayıcı">
              {(providerStatus?.providers ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.provider === item.id}
                  className="provider-option"
                  onClick={() => void setProvider(item.id === 'openai' ? 'openai' : 'demo')}
                >
                  <strong>
                    {item.label}{' '}
                    {item.kind === 'demo' ? <Badge tone="demo">ağ yok</Badge> : <Badge tone="live">API</Badge>}
                  </strong>
                  <span>{item.note}</span>
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
                value={isDemo ? 'demo-planner' : settings.model}
                onChange={(event) => void saveSettings({ model: event.target.value })}
                disabled={isDemo}
                spellCheck={false}
              />
              <datalist id="provider-models">
                {(provider?.models ?? []).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
              <span className="field-hint">
                Model kimliğini elle de yazabilirsiniz. Demo modunda gerçek model çağrılmaz.
              </span>
            </div>

            {!isDemo ? (
              <div className="field">
                <label className="field-label" htmlFor="api-key">
                  OpenAI API anahtarı
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
                    placeholder="sk-…"
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
                  {providerStatus?.hasApiKey ? (
                    <button type="button" className="button button-danger" onClick={() => void clearApiKey()}>
                      Sil
                    </button>
                  ) : null}
                </div>
                <span className="field-hint">
                  Anahtar, işletim sisteminin güvenli kasası ({providerStatus?.keyStorage ?? 'safeStorage'}) ile
                  şifrelenir. Anahtar yalnızca ana süreçte okunur; arayüze, sohbete veya günlüklere yazılmaz.
                </span>
              </div>
            ) : null}

            <div className="key-status" style={{ marginTop: 10 }}>
              <ShieldIcon size={14} />
              <span className="grow">
                {providerStatus?.encryptionAvailable
                  ? `Güvenli kasa kullanılabilir: ${providerStatus.keyStorage}`
                  : 'Güvenli kasa kullanılamıyor; bu durumda anahtar kaydedilmez.'}
              </span>
              <Badge tone={providerStatus?.hasApiKey ? 'success' : 'neutral'}>
                {providerStatus?.hasApiKey ? 'anahtar kayıtlı' : 'anahtar yok'}
              </Badge>
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
                  <th>Ajan</th>
                  <th>Model</th>
                  <th>Etkin</th>
                </tr>
              </thead>
              <tbody>
                {(['planner', 'coder', 'reviewer'] as AgentRole[]).map((role) => (
                  <tr key={role}>
                    <td>{roleLabel(role)}</td>
                    <td className="dim">{role === 'planner' ? 'görevi böler' : role === 'coder' ? 'diff önerir' : 'diff’i inceler'}</td>
                    <td>
                      <input
                        className="input"
                        list="provider-models"
                        value={isDemo ? 'demo-planner' : settings.agents[role].model}
                        onChange={(event) => setAgentModel(role, event.target.value)}
                        disabled={isDemo}
                        aria-label={`${roleLabel(role)} modeli`}
                        spellCheck={false}
                      />
                    </td>
                    <td>
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
            <span className="field-hint" style={{ display: 'block', marginTop: 8 }}>
              Rol değişikliği görev grafiğindeki ajan kartlarından yapılır; roller arasında yer değiştirme uygulanır.
            </span>
          </section>

          <section className="panel panel-pad" aria-labelledby="context-title">
            <div id="context-title">
              <SectionTitle>Bağlam</SectionTitle>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="context-budget">
                İstek başına bağlam bütçesi (yaklaşık token)
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
                Bütçe aşılırsa eklenen parçalar sırayla atlanır ve arayüz kaç parçanın eklenmediğini bildirir.
              </span>
            </div>

            <div className="note">
              <InfoIcon size={14} />
              <span>
                Gizli dosyalar (nokta ile başlayanlar), .env dosyaları, anahtarlar, sertifikalar, ikili dosyalar ve
                512 KB üzeri dosyalar ne indekslenir ne de AI bağlamına eklenir. Bu kural sabittir ve ayarla
                kapatılamaz.
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
                <span>Her zaman açık: bir ajanın ürettiği yeni görev otomatik yürütülmez.</span>
              </div>
            </div>
            <div className="toggle-row">
              <input
                id="command-approval"
                type="checkbox"
                checked
                disabled
                readOnly
                aria-label="Komut çalıştırma onayı her zaman açık"
              />
              <div>
                <strong>Komut çalıştırma onayı</strong>
                <span>Terminal komutları ve testler kullanıcı onayı olmadan çalışmaz; bu sürümde sabittir.</span>
              </div>
            </div>
            <div className="note" style={{ marginTop: 10 }}>
              <InfoIcon size={14} />
              <span>
                Değişiklikler hiçbir zaman sessizce yazılmaz; diff incelemesinde kabul ettiğiniz dosyalar diske
                yazılır ve “Geri al” ile orijinal içerik geri yüklenir.
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

          <div className="note">
            <ShieldIcon size={14} />
            <span>
              API anahtarı sohbete, günlüklere veya hata mesajlarına yazılmaz. Gizli dosyalar, .env, sertifikalar ve
              512 KB üzeri dosyalar indekslenmez ve AI bağlamına gönderilmez.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
