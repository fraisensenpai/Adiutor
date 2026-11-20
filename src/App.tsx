import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
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

function Workspace() {
  const init = useStore((state) => state.init);
  const view = useStore((state) => state.view);
  const reviewOpen = useStore((state) => state.reviewOpen);
  const contextPreviewOpen = useStore((state) => state.contextPreviewOpen);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app-shell">
      <TitleBar />
      {view === 'editor' ? (
        <div className="workspace-grid">
          <Sidebar />
          <main className="center-pane" aria-label="Editör">
            <EditorPane />
            <BottomPanel />
          </main>
          <ChatPanel />
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
