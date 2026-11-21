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
  SparkIcon,
  SplitIcon,
} from './ui/Icons';
import { IconButton } from './ui/primitives';
import { basename } from '@/lib/format';
import logo from '@/assets/logo-mark.png';

const VIEWS: Array<{ id: ViewId; label: string; icon: typeof CodeIcon }> = [
  { id: 'editor', label: 'Editör', icon: CodeIcon },
  { id: 'graph', label: 'Görev Grafiği', icon: GraphIcon },
  { id: 'map', label: 'Proje Haritası', icon: MapIcon },
  { id: 'usage', label: 'Kullanım', icon: ChartIcon },
];

export function TitleBar({
  sidebarOpen,
  chatOpen,
  onToggleSidebar,
  onToggleChat,
}: {
  sidebarOpen: boolean;
  chatOpen: boolean;
  onToggleSidebar: () => void;
  onToggleChat: () => void;
}) {
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const workspace = useStore((state) => state.workspace);
  const approvals = useStore((state) => state.approvals);
  const changes = useStore((state) => state.changes);
  const openReview = useStore((state) => state.openReview);
  const openFolderDialog = useStore((state) => state.openFolderDialog);
  const toggleBottom = useStore((state) => state.toggleBottom);

  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const pendingChanges = changes.filter((change) => change.status === 'pending').length;

  return (
    <header className="titlebar">
      <div className="brand">
        <img className="brand-mark" src={logo} alt="" width={22} height={22} aria-hidden="true" />
        <span className="brand-name">Adiutor</span>
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

        <IconButton
          label={sidebarOpen ? 'Kenar çubuğunu gizle' : 'Kenar çubuğunu göster'}
          aria-pressed={sidebarOpen}
          onClick={onToggleSidebar}
        >
          <SplitIcon size={15} />
        </IconButton>
        <IconButton
          label={chatOpen ? 'Sohbeti gizle' : 'Sohbeti göster'}
          aria-pressed={chatOpen}
          onClick={onToggleChat}
        >
          <SparkIcon size={15} />
        </IconButton>
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
