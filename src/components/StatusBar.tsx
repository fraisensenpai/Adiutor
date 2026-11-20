import { useStore } from '@/state/store';
import { formatTokens } from '@shared/tokens';
import { taskStatusLabel } from '@/lib/format';

export function StatusBar() {
  const workspace = useStore((state) => state.workspace);
  const index = useStore((state) => state.index);
  const indexProgress = useStore((state) => state.indexProgress);
  const settings = useStore((state) => state.settings);
  const task = useStore((state) => state.task);
  const usageSummaryData = useStore((state) => state.usageSummaryData);
  const activePath = useStore((state) => state.activePath);

  const statusText =
    indexProgress.state === 'scanning'
      ? `İndeksleniyor ${indexProgress.scanned}/${indexProgress.total || '?'}`
      : indexProgress.state === 'ready'
        ? `İndeks hazır · ${index?.files.length ?? 0} dosya · ${index?.symbols.length ?? 0} sembol`
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
        {index ? (
          <span className="status-item" title={index.parserNote}>
            ayrıştırıcı: <strong>{index.parser === 'tree-sitter' ? 'tree-sitter' : 'yedek (regex)'}</strong>
          </span>
        ) : null}
        <span className="status-item" title={index?.lsp.message ?? 'LSP durumu bilinmiyor'}>
          LSP: <strong>{index?.lsp.running ? 'bağlı' : 'kullanılamıyor'}</strong>
        </span>
        <span className="status-item">
          görev: <strong>{taskStatusLabel(task.status)}</strong>
        </span>
        <span className="status-item" title="Bu uygulamanın kaydettiği token kullanımı (tahmini + ölçülen)">
          {formatTokens(usageSummaryData?.totalTokens ?? 0)} token
        </span>
        <span className="status-item">{settings.provider === 'demo' ? 'demo' : settings.model}</span>
      </div>
    </footer>
  );
}
