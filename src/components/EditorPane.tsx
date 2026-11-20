import { useStore } from '@/state/store';
import { MonacoEditor } from './MonacoEditor';
import { EmptyState, IconButton } from './ui/primitives';
import { FolderIcon, PlusIcon, UploadIcon, XIcon, AlertIcon } from './ui/Icons';
import { basename, dirname, languageLabel, relativeTo } from '@/lib/format';
import logo from '@/assets/logo-mark.png';

function TabStrip() {
  const tabs = useStore((state) => state.tabs);
  const activePath = useStore((state) => state.activePath);
  const setActiveTab = useStore((state) => state.setActiveTab);
  const closeTab = useStore((state) => state.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="tabstrip" role="tablist" aria-label="Açık dosyalar">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`editor-tab ${tab.path === activePath ? 'is-active' : ''}`}
          role="tab"
          aria-selected={tab.path === activePath}
          tabIndex={0}
          onClick={() => setActiveTab(tab.path)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setActiveTab(tab.path);
            }
          }}
          title={tab.path}
        >
          <span className="dim" style={{ fontSize: 9.5, fontWeight: 700 }}>
            {languageLabel(tab.language)}
          </span>
          <span className="tab-label">{tab.name}</span>
          {tab.dirty ? <span className="dirty-dot" aria-label="kaydedilmedi" /> : null}
          <button
            type="button"
            className="tab-close"
            aria-label={`${tab.name} sekmesini kapat`}
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.path);
            }}
          >
            <XIcon size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function EditorPane() {
  const workspace = useStore((state) => state.workspace);
  const tabs = useStore((state) => state.tabs);
  const activePath = useStore((state) => state.activePath);
  const pendingReveal = useStore((state) => state.pendingReveal);
  const clearPendingReveal = useStore((state) => state.clearPendingReveal);
  const updateTabContent = useStore((state) => state.updateTabContent);
  const setSelection = useStore((state) => state.setSelection);
  const selection = useStore((state) => state.selection);
  const addSelectionToContext = useStore((state) => state.addSelectionToContext);
  const addFilesToContext = useStore((state) => state.addFilesToContext);
  const saveActive = useStore((state) => state.saveActive);
  const openFolderDialog = useStore((state) => state.openFolderDialog);
  const openSample = useStore((state) => state.openSample);
  const setView = useStore((state) => state.setView);
  const problems = useStore((state) => state.problems);
  const setBottomTab = useStore((state) => state.setBottomTab);

  const activeTab = tabs.find((tab) => tab.path === activePath) ?? null;
  const problemCount = problems.filter((problem) => problem.severity === 'error').length;

  return (
    <>
      <TabStrip />
      {workspace ? (
        <div className="editor-toolbar">
          {activeTab ? (
            <>
              <span className="breadcrumb" title={activeTab.path}>
                <span>{basename(workspace.root)}</span>
                <span className="dim">/</span>
                <span>{dirname(relativeTo(workspace.root, activeTab.path))}</span>
                <span className="dim">/</span>
                <strong>{activeTab.name}</strong>
              </span>
              {activeTab.dirty ? <span className="dim">· kaydedilmedi</span> : null}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                {problemCount > 0 ? (
                  <button type="button" className="button button-ghost button-small" onClick={() => setBottomTab('problems')}>
                    <AlertIcon size={12} />
                    {problemCount} hata
                  </button>
                ) : null}
                {selection ? (
                  <button type="button" className="button button-ghost button-small" onClick={() => void addSelectionToContext()}>
                    <PlusIcon size={12} />
                    Seçimi bağlama ekle ({selection.endLine - selection.startLine + 1} satır)
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={() => void addFilesToContext([activeTab.path])}
                >
                  <PlusIcon size={12} />
                  Dosyayı bağlama ekle
                </button>
                <IconButton label="Dosyayı kaydet (Ctrl+S)" onClick={() => void saveActive()} disabled={!activeTab.dirty}>
                  <UploadIcon size={13} />
                </IconButton>
              </div>
            </>
          ) : (
            <span className="dim">Dosya seçilmedi</span>
          )}
        </div>
      ) : null}

      <div className="editor-host">
        {activeTab ? (
          <MonacoEditor
            path={activeTab.path}
            language={activeTab.language}
            content={activeTab.content}
            onChange={(content) => updateTabContent(activeTab.path, content)}
            onSelection={setSelection}
            revealLine={pendingReveal?.path === activeTab.path ? pendingReveal.line : null}
            onRevealDone={clearPendingReveal}
          />
        ) : (
          <div className="empty-full">
            <EmptyState
              icon={<img className="empty-logo" src={logo} alt="" aria-hidden="true" />}
              title={workspace ? 'Bir dosya seçin' : 'Adiutor ile kod yazmaya başlayın'}
              description={
                workspace
                  ? 'Soldaki dosya ağacından bir dosya açın. Açtığınız dosyalar sekmelerde görünür; AI önerileri diff olarak açılır ve onayınız olmadan yazılmaz.'
                  : 'Bir proje klasörü açın veya ajan akışını gerçek dosyalarla denemek için örnek projeyi oluşturun. AI istekleri için Ayarlar bölümünden sağlayıcı anahtarınızı ekleyin.'
              }
              actions={
                <>
                  <button type="button" className="button button-primary" onClick={() => void openFolderDialog()}>
                    <FolderIcon size={13} />
                    Proje klasörü aç
                  </button>
                  <button type="button" className="button" onClick={() => void openSample()}>
                    Örnek projeyi aç
                  </button>
                  <button type="button" className="button button-ghost" onClick={() => setView('graph')}>
                    Görev grafiğini gör
                  </button>
                </>
              }
            />
          </div>
        )}
      </div>
    </>
  );
}
