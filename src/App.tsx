import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useStore } from '@/state/store';
import { TitleBar } from '@/components/TitleBar';
import { StatusBar } from '@/components/StatusBar';
import { Sidebar } from '@/components/Sidebar';
import { EditorPane } from '@/components/EditorPane';
import { ChatPanel } from '@/components/ChatPanel';
import { BottomPanel } from '@/components/BottomPanel';
import { GraphView } from '@/components/GraphView';
import { MapView } from '@/components/MapView';
import { UsageView } from '@/components/UsageView';
import { SettingsView } from '@/components/SettingsView';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { ContextPreview } from '@/components/ContextPreview';
import { Toast } from '@/components/ui/primitives';
import { resolveTheme, useSystemTheme } from '@/lib/theme';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[adiutor] arayüz hatası:', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell">
          <div className="empty-full">
            <div className="empty-state">
              <h2>Arayüz beklenmeyen bir hata ile karşılaştı</h2>
              <p>{this.state.error.message}</p>
              <div className="empty-state-actions">
                <button type="button" className="button" onClick={() => this.setState({ error: null })}>
                  Tekrar dene
                </button>
                <button type="button" className="button" onClick={() => window.location.reload()}>
                  Uygulamayı yenile
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface LayoutState {
  sidebarOpen: boolean;
  chatOpen: boolean;
  sidebarWidth: number;
  chatWidth: number;
  bottomHeight: number;
}

const LAYOUT_KEY = 'adiutor.layout.v1';
const DEFAULT_LAYOUT: LayoutState = {
  sidebarOpen: true,
  chatOpen: true,
  sidebarWidth: 244,
  chatWidth: 420,
  bottomHeight: 220,
};

function readLayout(): LayoutState {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      sidebarOpen: parsed.sidebarOpen ?? DEFAULT_LAYOUT.sidebarOpen,
      chatOpen: parsed.chatOpen ?? DEFAULT_LAYOUT.chatOpen,
      sidebarWidth:
        typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
      chatWidth: typeof parsed.chatWidth === 'number' ? parsed.chatWidth : DEFAULT_LAYOUT.chatWidth,
      bottomHeight:
        typeof parsed.bottomHeight === 'number' ? parsed.bottomHeight : DEFAULT_LAYOUT.bottomHeight,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** Sürükleme sırasında imleci ve seçimi yöneten küçük yardımcı. */
function trackDrag(onMove: (event: PointerEvent) => void, axis: 'x' | 'y'): void {
  const className = axis === 'x' ? 'is-resizing' : 'is-resizing is-resizing-y';
  document.body.classList.add(...className.split(' '));

  const move = (event: PointerEvent) => onMove(event);
  const stop = () => {
    document.body.classList.remove(...className.split(' '));
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function Workspace() {
  const init = useStore((state) => state.init);
  const view = useStore((state) => state.view);
  const reviewOpen = useStore((state) => state.reviewOpen);
  const contextPreviewOpen = useStore((state) => state.contextPreviewOpen);

  const themeMode = useStore((state) => state.settings.theme);
  const systemTheme = useSystemTheme();

  const [layout, setLayout] = useState<LayoutState>(readLayout);
  const [compact, setCompact] = useState(() => window.innerWidth < 1000);
  const autoChat = useRef(false);
  const autoSidebar = useRef(false);
  const previousChatWidth = useRef(DEFAULT_LAYOUT.chatWidth);

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(themeMode, systemTheme);
  }, [themeMode, systemTheme]);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  const update = useCallback((patch: Partial<LayoutState>) => {
    setLayout((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth;
      setCompact(width < 1000);
      setLayout((current) => {
        let next = current;
        const narrowChat = width < 1180;
        if (narrowChat && !autoChat.current && current.chatOpen) {
          autoChat.current = true;
          next = { ...next, chatOpen: false };
        } else if (!narrowChat && autoChat.current) {
          autoChat.current = false;
          next = { ...next, chatOpen: true };
        }
        const narrowSidebar = width < 1000;
        if (narrowSidebar && !autoSidebar.current && current.sidebarOpen) {
          autoSidebar.current = true;
          next = { ...next, sidebarOpen: false };
        } else if (!narrowSidebar && autoSidebar.current) {
          autoSidebar.current = false;
          next = { ...next, sidebarOpen: true };
        }
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (compact) return;
    setLayout((current) => ({
      ...current,
      chatWidth: Math.min(current.chatWidth, Math.max(340, Math.round(window.innerWidth * 0.5))),
    }));
  }, [compact]);

  const startChatDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    trackDrag((move) => {
      const width = Math.round(window.innerWidth - move.clientX);
      update({ chatWidth: Math.min(Math.max(width, 320), Math.min(900, window.innerWidth - 480)) });
    }, 'x');
  };

  const wideChat = layout.chatWidth >= 600;
  const toggleWideChat = () => {
    setLayout((current) => {
      if (current.chatWidth >= 600) {
        return { ...current, chatWidth: previousChatWidth.current || DEFAULT_LAYOUT.chatWidth };
      }
      previousChatWidth.current = current.chatWidth;
      return {
        ...current,
        chatWidth: Math.min(860, Math.max(600, Math.round(window.innerWidth * 0.52))),
      };
    });
  };

  const startSidebarDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    trackDrag((move) => {
      update({ sidebarWidth: Math.min(Math.max(Math.round(move.clientX), 200), 380) });
    }, 'x');
  };

  const startBottomDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    trackDrag((move) => {
      const height = Math.round(window.innerHeight - move.clientY - 24);
      update({ bottomHeight: Math.min(Math.max(height, 120), Math.max(220, window.innerHeight - 260)) });
    }, 'y');
  };

  return (
    <div
      className={`app-shell ${layout.sidebarOpen ? '' : 'sidebar-closed'} ${
        layout.chatOpen ? '' : 'chat-closed'
      } ${compact ? 'is-compact' : ''}`}
      style={
        {
          '--sidebar-w': layout.sidebarOpen ? `${layout.sidebarWidth}px` : '0px',
          '--chat-w': layout.chatOpen ? `${layout.chatWidth}px` : '0px',
          '--bottom-h': `${layout.bottomHeight}px`,
        } as CSSProperties
      }
    >
      <TitleBar
        sidebarOpen={layout.sidebarOpen}
        chatOpen={layout.chatOpen}
        onToggleSidebar={() => update({ sidebarOpen: !layout.sidebarOpen })}
        onToggleChat={() => update({ chatOpen: !layout.chatOpen })}
      />
      {view === 'editor' ? (
        <div className="workspace-grid">
          <Sidebar open={layout.sidebarOpen} />
          <div
            className="splitter splitter-sidebar"
            role="separator"
            aria-orientation="vertical"
            aria-label="Kenar çubuğu genişliği"
            aria-hidden={!layout.sidebarOpen}
            onPointerDown={startSidebarDrag}
          />
          <main className="center-pane" aria-label="Editör">
            <EditorPane />
            <BottomPanel onResizeStart={startBottomDrag} />
          </main>
          <div
            className="splitter splitter-chat"
            role="separator"
            aria-orientation="vertical"
            aria-label="Sohbet paneli genişliği"
            aria-hidden={!layout.chatOpen}
            onPointerDown={startChatDrag}
          />
          <ChatPanel
            open={layout.chatOpen}
            onClose={() => update({ chatOpen: false })}
            wide={wideChat}
            onToggleWide={toggleWideChat}
          />
        </div>
      ) : (
        <main className="view-scroll" aria-label="Adiutor görünümü">
          {view === 'graph' ? <GraphView /> : null}
          {view === 'map' ? <MapView /> : null}
          {view === 'usage' ? <UsageView /> : null}
          {view === 'settings' ? <SettingsView /> : null}
        </main>
      )}
      <StatusBar />
      {reviewOpen ? <ReviewDrawer /> : null}
      {contextPreviewOpen ? <ContextPreview /> : null}
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Workspace />
    </ErrorBoundary>
  );
}
