import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import { XIcon, PlusIcon } from './ui/Icons';
import { basename } from '@/lib/format';

/**
 * AI'a gönderilecek bağlamı göndermeden önce gösterir.
 * Proje özeti (dosya listesi + semboller) her istekte eklenir; dosya içerikleri
 * yalnızca kullanıcı bağlama eklediğinde ya da ajan hedef dosya olarak seçtiğinde gider.
 */
export function ContextPreview() {
  const close = useStore((state) => state.setContextPreviewOpen);
  const items = useStore((state) => state.contextItems);
  const settings = useStore((state) => state.settings);
  const index = useStore((state) => state.index);
  const workspace = useStore((state) => state.workspace);
  const addFilesToContext = useStore((state) => state.addFilesToContext);
  const totalTokens = items.reduce((sum, item) => sum + item.tokens, 0);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="AI bağlamı önizlemesi">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">AI’a gönderilecek bağlam</div>
            <div className="modal-sub">
              ~{formatTokens(totalTokens)} token · bütçe {formatTokens(settings.maxContextTokens)} · {items.length} parça
            </div>
          </div>
          <div className="modal-header-right">
            <button type="button" className="button button-small" onClick={() => void addFilesToContext((index?.files ?? []).slice(0, 2).map((file) => file.path))} disabled={!index}>
              <PlusIcon size={12} />
              Öne çıkan dosyaları ekle
            </button>
            <button type="button" className="icon-button" onClick={() => close(false)} aria-label="Kapat">
              <XIcon size={15} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 16px' }}>
          <div className="note" style={{ marginBottom: 12 }}>
            <div>
              <strong>Proje özeti</strong> (her istekte gönderilir): {workspace?.name ?? 'proje yok'} ·{' '}
              {(index?.files.length ?? 0) > 0
                ? `${index?.files.length} dosya listesi ve en zengin ${Math.min(24, index?.files.length ?? 0)} dosyanın sembol sayısı. Dosya içerikleri dahil değildir.`
                : 'İndeks henüz hazır değil.'}
              <div className="dim" style={{ fontSize: 10.5, marginTop: 4 }}>
                Gizli dosyalar, .env, anahtarlar ve 512 KB üzeri dosyalar hiçbir zaman gönderilmez.
              </div>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 8px' }}>
              <h2>Bağlama henüz parça eklenmedi</h2>
              <p>
                Dosya ağacından bir dosyanın yanındaki + düğmesine, Proje Haritası’ndan bir sembole veya editörde
                seçtiğiniz kod parçasına tıklayarak bağlam ekleyebilirsiniz. Bağlam eklemeseniz bile proje özeti
                gönderilir.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item) => (
                <div className="panel" key={item.id}>
                  <div className="panel-pad" style={{ paddingBottom: 8 }}>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <span className="badge badge-neutral">{item.kind === 'symbol' ? 'sembol' : item.kind === 'selection' ? 'seçim' : 'dosya'}</span>
                      <strong style={{ fontSize: 12 }}>{basename(item.path)}</strong>
                      <span className="dim" style={{ fontSize: 10.5 }}>
                        {item.startLine ? `${item.startLine}${item.endLine ? `–${item.endLine}` : ''}` : ''}
                      </span>
                      <span className="dim" style={{ fontSize: 10.5, marginLeft: 'auto' }}>
                        ~{formatTokens(item.tokens)} token · {Math.min(settings.maxContextTokens, item.tokens)} bütçe
                      </span>
                    </div>
                    <div className="dim" style={{ fontSize: 10.5, marginBottom: 6 }}>
                      {item.reason}
                      {item.truncated ? ' · kırpıldı' : ''}
                    </div>
                    <pre
                      className="mono"
                      style={{
                        margin: 0,
                        maxHeight: 160,
                        overflow: 'auto',
                        background: '#0a0c10',
                        border: '1px solid var(--border)',
                        borderRadius: 4,
                        padding: '8px 10px',
                        fontSize: 11,
                        lineHeight: 1.5,
                      }}
                    >
                      {item.content.slice(0, 2000)}
                      {item.content.length > 2000 ? '\n…' : ''}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span>
            Bu bağlam yalnızca siz istek gönderdiğinizde okunur. Demo modunda ağ bağlantısı kurulmaz.
          </span>
          <button type="button" className="button button-primary button-small" style={{ marginLeft: 'auto' }} onClick={() => close(false)}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
