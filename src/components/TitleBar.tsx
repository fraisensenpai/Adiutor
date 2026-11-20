import { useStore } from '@/state/store';
import type { ViewId } from '@shared/types';
import {
  ChartIcon,
  CodeIcon,
  FolderIcon,
  GearIcon,
  GraphIcon,
  MapIcon,
  PanelIcon,
} from './ui/Icons';
import { Badge, IconButton } from './ui/primitives';
import { basename } from '@/lib/format';

const VIEWS: Array<{ id: ViewId; label: string; icon: typeof CodeIcon }> = [
  { id: 'editor', label: 'Editör', icon: CodeIcon },
  { id: 'graph', label: 'Görev Grafiği', icon: GraphIcon },
  { id: 'map', label: 'Proje Haritası', icon: MapIcon },
  { id: 'usage', label: 'Kullanım', icon: ChartIcon },
];

export function TitleBar() {
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const workspace = useStore((state) => state.workspace);
  const providerStatus = useStore((state) => state.providerStatus);
  const settings = useStore((state) => state.settings);
  const approvals = useStore((state) => state.approvals);
  const changes = useStore((state) => state.changes);
  const openReview = useStore((state) => state.openReview);
  const openFolderDialog = useStore((state) => state.openFolderDialog);
  const openSample = useStore((state) => state.openSample);
  const toggleBottom = useStore((state) => state.toggleBottom);

  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const pendingChanges = changes.filter((change) => change.status === 'pending').length;
  const provider = providerStatus?.providers.find((item) => item.id === settings.provider);
  const isDemo = settings.provider === 'demo';

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          A
        </span>
        <div>
          <div className="brand-name">Adiutor</div>
          <span className="brand-sub">AI kod editörü</span>
        </div>
      </div>

      <button
        type="button"
        className="workspace-chip"
        onClick={() => void openFolderDialog()}
        title="Proje klasörü aç (Ctrl+O)"
      >
        <FolderIcon size={14} />
        {workspace ? (
          <span className="workspace-name">{basename(workspace.root)}</span>
        ) : (
          <span>Proje klasörü aç</span>
        )}
      </button>

      {!workspace ? (
        <button type="button" className="button button-ghost button-small" onClick={() => void openSample()}>
          Örnek projeyi aç
        </button>
      ) : null}

      <nav className="view-tabs" aria-label="Ana görünümler">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className="view-tab"
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
              title={`${item.label} (Ctrl+${item.id === 'editor' ? '1' : item.id === 'graph' ? '2' : item.id === 'map' ? '3' : '4'})`}
            >
              <Icon size={14} />
              {item.label}
              {item.id === 'graph' && pendingApprovals > 0 ? (
                <span className="tab-count" aria-label={`${pendingApprovals} onay bekliyor`}>
                  {pendingApprovals}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="titlebar-right">
        {pendingChanges > 0 ? (
          <button type="button" className="button button-primary button-small" onClick={openReview}>
            Değişiklikleri incele
            <span className="tab-count">{pendingChanges}</span>
          </button>
        ) : null}

        <span
          className={`provider-pill ${isDemo ? 'is-demo' : 'is-live'}`}
          title={
            isDemo
              ? 'Demo modu: ağ bağlantısı yok, yanıtlar kurallı üretilir.'
              : `Sağlayıcı: ${provider?.label ?? 'OpenAI'} — model: ${settings.model}`
          }
        >
          <span className={`status-dot ${isDemo ? 'status-dot-waiting' : 'status-dot-done'}`} aria-hidden="true" />
          {isDemo ? 'Demo modu' : provider?.label ?? 'OpenAI'}
        </span>

        {providerStatus && settings.provider === 'openai' && !providerStatus.hasApiKey ? (
          <Badge tone="danger" title="API anahtarı ayarlanmadı">
            anahtar yok
          </Badge>
        ) : null}

        <IconButton label="Alt paneli aç/kapat" onClick={toggleBottom}>
          <PanelIcon size={15} />
        </IconButton>
        <IconButton label="Ayarlar" onClick={() => setView('settings')}>
          <GearIcon size={15} />
        </IconButton>
      </div>
    </header>
  );
}
