import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { diffLines } from '@shared/diff';
import { DiffView } from './DiffView';
import { CheckIcon, UndoIcon, XIcon } from './ui/Icons';
import { Badge } from './ui/primitives';
import { basename, relativeTo } from '@/lib/format';

export function ReviewDrawer() {
  const changes = useStore((state) => state.changes);
  const closeReview = useStore((state) => state.closeReview);
  const acceptChange = useStore((state) => state.acceptChange);
  const rejectChange = useStore((state) => state.rejectChange);
  const undoChange = useStore((state) => state.undoChange);
  const acceptAllChanges = useStore((state) => state.acceptAllChanges);
  const rejectAllChanges = useStore((state) => state.rejectAllChanges);
  const workspace = useStore((state) => state.workspace);

  const [selected, setSelected] = useState<string | null>(null);

  const stats = useMemo(() => {
    const map = new Map<string, { additions: number; deletions: number }>();
    for (const change of changes) {
      const diff = diffLines(change.original, change.proposed);
      map.set(change.id, { additions: diff.additions, deletions: diff.deletions });
    }
    return map;
  }, [changes]);

  useEffect(() => {
    const current = changes.find((change) => change.id === selected);
    if (current) return;
    const next = changes.find((change) => change.status === 'pending') ?? changes[0];
    setSelected(next?.id ?? null);
  }, [changes, selected]);

  const active = changes.find((change) => change.id === selected) ?? null;
  const pending = changes.filter((change) => change.status === 'pending').length;
  const accepted = changes.filter((change) => change.status === 'accepted' && !change.undoneAt).length;
  const rejected = changes.filter((change) => change.status === 'rejected').length;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Değişiklikleri incele">
      <div className="modal">
        <div className="modal-header">
          <div>
            <div className="modal-title">Değişiklikleri incele</div>
            <div className="modal-sub">
              {pending} bekliyor · {accepted} kabul edildi · {rejected} reddedildi · dosyalar onayınız olmadan
              yazılmadı
            </div>
          </div>
          <div className="modal-header-right">
            <button
              type="button"
              className="button button-small"
              onClick={() => void acceptAllChanges()}
              disabled={pending === 0}
            >
              <CheckIcon size={12} />
              Tümünü kabul et
            </button>
            <button type="button" className="button button-ghost button-small" onClick={rejectAllChanges} disabled={pending === 0}>
              Tümünü reddet
            </button>
            <button type="button" className="icon-button" onClick={closeReview} aria-label="İncelemeyi kapat">
              <XIcon size={15} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="review-sidebar">
            {changes.length === 0 ? (
              <div className="dim" style={{ padding: 12, fontSize: 11.5 }}>
                Henüz önerilen değişiklik yok. Bir görev çalıştırın; kodlayıcı ajanın önerileri burada listelenir.
              </div>
            ) : (
              changes.map((change) => {
                const stat = stats.get(change.id);
                return (
                  <button
                    key={change.id}
                    type="button"
                    className={`review-file ${change.id === selected ? 'is-active' : ''}`}
                    onClick={() => setSelected(change.id)}
                  >
                    <div className="review-file-head">
                      <span className="name">{basename(change.filePath)}</span>
                      {change.status === 'pending' ? <Badge tone="warn">bekliyor</Badge> : null}
                      {change.status === 'accepted' && !change.undoneAt ? <Badge tone="success">kabul</Badge> : null}
                      {change.status === 'rejected' ? <Badge tone="danger">red</Badge> : null}
                      {change.undoneAt ? <Badge tone="neutral">geri alındı</Badge> : null}
                    </div>
                    <div className="review-file-meta">
                      {workspace ? relativeTo(workspace.root, change.filePath) : change.filePath}
                    </div>
                    <div className="review-file-meta">
                      <span className="diff-stat-add">+{stat?.additions ?? 0}</span>{' '}
                      <span className="diff-stat-del">−{stat?.deletions ?? 0}</span>
                      {change.isNewFile ? ' · yeni dosya' : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="review-main">
            {active ? (
              <>
                <div className="review-toolbar">
                  <span className="mono" style={{ fontSize: 11 }}>
                    {workspace ? relativeTo(workspace.root, active.filePath) : active.filePath}
                  </span>
                  <span className="dim">·</span>
                  <span>{active.summary}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {active.status === 'pending' ? (
                      <>
                        <button type="button" className="button button-primary button-small" onClick={() => void acceptChange(active.id)}>
                          <CheckIcon size={12} />
                          Kabul et ve yaz
                        </button>
                        <button type="button" className="button button-ghost button-small" onClick={() => rejectChange(active.id)}>
                          <XIcon size={12} />
                          Reddet
                        </button>
                      </>
                    ) : null}
                    {active.status === 'accepted' && !active.undoneAt ? (
                      <button type="button" className="button button-small" onClick={() => void undoChange(active.id)}>
                        <UndoIcon size={12} />
                        Geri al
                      </button>
                    ) : null}
                  </div>
                </div>
                {active.error ? (
                  <div className="note note-warn" style={{ margin: '8px 12px' }}>
                    <XIcon size={13} />
                    <span>Yazma hatası: {active.error}</span>
                  </div>
                ) : null}
                <DiffView original={active.original} proposed={active.proposed} />
              </>
            ) : (
              <div className="diff-scroll">
                <div className="diff-empty">İncelenecek değişiklik seçin.</div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <span>
            Dosyalar yalnızca “Kabul et ve yaz” dediğinizde güncellenir. Geri al, orijinal içeriği geri yazar.
          </span>
          <button type="button" className="button button-small" style={{ marginLeft: 'auto' }} onClick={closeReview}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
