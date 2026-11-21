import { useStore } from '@/state/store';
import { taskStatusLabel } from '@/lib/format';

export function StatusBar() {
  const workspace = useStore((state) => state.workspace);
  const index = useStore((state) => state.index);
  const indexProgress = useStore((state) => state.indexProgress);
  const task = useStore((state) => state.task);
  const activePath = useStore((state) => state.activePath);

  const statusText =
    indexProgress.state === 'scanning'
      ? `İndeksleniyor ${indexProgress.scanned}/${indexProgress.total || '?'}`
      : indexProgress.state === 'ready'
        ? `İndeks hazır · ${index?.files.length ?? 0} dosya`
        : indexProgress.state === 'error'
          ? 'İndeks hatası'
          : 'İndeks bekliyor';

  return (
    <footer className="statusbar">
      <span className="status-item" title={workspace?.root ?? 'Proje açılmadı'}>
        {workspace ? workspace.root : 'Proje açılmadı'}
      </span>
      <span className="status-item">
        <span
          className={`status-dot ${
            indexProgress.state === 'ready'
              ? 'status-dot-done'
              : indexProgress.state === 'scanning'
                ? 'status-dot-running'
                : indexProgress.state === 'error'
                  ? 'status-dot-error'
                  : ''
          }`}
          aria-hidden="true"
        />
        {statusText}
      </span>
      {activePath ? (
        <span className="status-item" title={activePath}>
          {activePath.split(/[\\/]/).slice(-2).join('/')}
        </span>
      ) : null}

      <div className="statusbar-right">
        <span className="status-item" title={index?.lsp.message ?? 'LSP durumu bilinmiyor'}>
          LSP: <strong>{index?.lsp.running ? 'bağlı' : 'yok'}</strong>
        </span>
        {task.id ? (
          <span className="status-item">
            görev: <strong>{taskStatusLabel(task.status)}</strong>
          </span>
        ) : null}
      </div>
    </footer>
  );
}
