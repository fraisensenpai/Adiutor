import { useEffect } from 'react';
import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import { Badge, EmptyState, SectionTitle } from './ui/primitives';
import { ChartIcon, InfoIcon, RefreshIcon } from './ui/Icons';
import { formatDateTime } from '@/lib/format';

export function UsageView() {
  const usage = useStore((state) => state.usage);
  const summary = useStore((state) => state.usageSummaryData);
  const refreshUsage = useStore((state) => state.refreshUsage);
  const settings = useStore((state) => state.settings);
  const providerStatus = useStore((state) => state.providerStatus);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const maxProvider = Math.max(1, ...(summary?.byProvider.map((item) => item.tokens) ?? [1]));
  const maxAgent = Math.max(1, ...(summary?.byAgent.map((item) => item.tokens) ?? [1]));

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Kullanım</h1>
          <p className="view-desc">
            Bu uygulamanın yaptığı her AI isteği için sağlayıcının döndürdüğü token kullanımı kaydedilir. Sağlayıcı
            gerçek kullanım döndürmezse değer “tahmini” olarak işaretlenir.
          </p>
        </div>
        <div className="view-header-actions">
          <button type="button" className="button" onClick={() => void refreshUsage()}>
            <RefreshIcon size={13} />
            Yenile
          </button>
        </div>
      </div>

      <div className="note" style={{ marginBottom: 14 }}>
        <InfoIcon size={15} />
        <span>
          Kalan kota gösterilmez: sağlayıcı planındaki kalan hak resmi bir API ile alınmadıkça bilinemez. Yalnızca bu
          uygulamanın kaydettiği istekler ve token sayıları gösterilir.
        </span>
      </div>

      {summary && summary.requestCount > 0 ? (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-label">Toplam token</div>
              <div className="stat-value">{formatTokens(summary.totalTokens)}</div>
              <div className="stat-hint">{summary.requestCount} istek</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Ölçülen</div>
              <div className="stat-value">{formatTokens(summary.measuredTokens)}</div>
              <div className="stat-hint">sağlayıcı kullanım alanından</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Tahmini</div>
              <div className="stat-value">{formatTokens(summary.estimatedTokens)}</div>
              <div className="stat-hint">sağlayıcı kullanım alanı yoksa tahmin</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Etkin sağlayıcı</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {providerStatus?.providers.find((item) => item.id === settings.provider)?.label ?? settings.provider}
              </div>
              <div className="stat-hint">{settings.model}</div>
            </div>
          </div>

          <div className="settings-grid">
            <div className="stack">
              <div className="panel panel-pad">
                <SectionTitle hint="görev bazında">Görevler</SectionTitle>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Görev</th>
                      <th className="num">İstek</th>
                      <th className="num">Token</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byTask.map((task) => (
                      <tr key={task.taskId}>
                        <td>{task.label}</td>
                        <td className="num">{task.requests}</td>
                        <td className="num">{formatTokens(task.tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="panel panel-pad">
                <SectionTitle hint="son 200 istek">Son istekler</SectionTitle>
                <div style={{ maxHeight: 340, overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Zaman</th>
                        <th>Ajan</th>
                        <th>Sağlayıcı / model</th>
                        <th className="num">Token</th>
                        <th>Tür</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.slice(0, 40).map((record) => (
                        <tr key={record.id}>
                          <td className="num" style={{ textAlign: 'left' }}>
                            {formatDateTime(record.createdAt)}
                          </td>
                          <td>{record.agentRole}</td>
                          <td>
                            {record.provider} · {record.model}
                          </td>
                          <td className="num">{formatTokens(record.totalTokens)}</td>
                          <td>
                            {record.estimated ? <Badge tone="neutral">tahmini</Badge> : <Badge tone="success">ölçüldü</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="panel panel-pad">
                <SectionTitle>Sağlayıcıya göre</SectionTitle>
                <div className="bar-list">
                  {summary.byProvider.map((item) => (
                    <div className="bar-row" key={item.provider}>
                      <span>{item.provider}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${(item.tokens / maxProvider) * 100}%` }} />
                      </div>
                      <span className="bar-value">{formatTokens(item.tokens)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel panel-pad">
                <SectionTitle>Ajana göre</SectionTitle>
                <div className="bar-list">
                  {summary.byAgent.map((item) => (
                    <div className="bar-row" key={item.agent}>
                      <span>{item.agent}</span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${(item.tokens / maxAgent) * 100}%`,
                            background:
                              item.agent === 'planner'
                                ? 'var(--accent)'
                                : item.agent === 'coder'
                                  ? 'var(--ok)'
                                  : item.agent === 'reviewer'
                                    ? 'var(--warn)'
                                    : 'var(--purple)',
                          }}
                        />
                      </div>
                      <span className="bar-value">{formatTokens(item.tokens)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="note">
                <InfoIcon size={14} />
                <span>
                  Sağlayıcı gerçek kullanım döndürmezse token değerleri karakter uzunluğundan tahmin edilir ve
                  “tahmini” etiketiyle ayrı sayılır.
                </span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<ChartIcon size={20} />}
          title="Henüz kayıtlı kullanım yok"
          description="Bir sohbet mesajı gönderdiğinizde veya görev çalıştırdığınızda, sağlayıcının döndürdüğü token kullanımı burada görev, ajan ve sağlayıcı bazında listelenir."
        />
      )}
    </div>
  );
}
