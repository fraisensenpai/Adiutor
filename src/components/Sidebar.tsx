import { useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { FileTree } from './FileTree';
import { FolderIcon, PlusIcon, RefreshIcon, SearchIcon, SplitIcon } from './ui/Icons';
import { IconButton } from './ui/primitives';
import { basename } from '@/lib/format';

export function Sidebar() {
  const sidebarTab = useStore((state) => state.sidebarTab);
  const setSidebarTab = useStore((state) => state.setSidebarTab);
  const tree = useStore((state) => state.tree);
  const treeLoading = useStore((state) => state.treeLoading);
  const activePath = useStore((state) => state.activePath);
  const workspace = useStore((state) => state.workspace);
  const index = useStore((state) => state.index);
  const indexProgress = useStore((state) => state.indexProgress);
  const indexBusy = useStore((state) => state.indexBusy);
  const refreshTree = useStore((state) => state.refreshTree);
  const refreshIndex = useStore((state) => state.refreshIndex);
  const openFolderDialog = useStore((state) => state.openFolderDialog);
  const setView = useStore((state) => state.setView);
  const openFile = useStore((state) => state.openFile);
  const addSymbolToContext = useStore((state) => state.addSymbolToContext);
  const addFilesToContext = useStore((state) => state.addFilesToContext);

  const [query, setQuery] = useState('');

  const filteredSymbols = useMemo(() => {
    if (!index) return [];
    const search = query.trim().toLocaleLowerCase('tr-TR');
    return index.symbols
      .filter((symbol) => {
        if (!search) return symbol.kind === 'function' || symbol.kind === 'class';
        return (
          symbol.name.toLocaleLowerCase('tr-TR').includes(search) ||
          symbol.file.toLocaleLowerCase('tr-TR').includes(search)
        );
      })
      .slice(0, 40);
  }, [index, query]);

  const progressPercent =
    indexProgress.total > 0 ? Math.round((indexProgress.scanned / indexProgress.total) * 100) : 0;

  return (
    <aside className="sidebar" aria-label="Proje paneli">
      <div className="sidebar-header">
        <div className="segmented" role="tablist" aria-label="Kenar çubuğu sekmeleri">
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'files'}
            onClick={() => setSidebarTab('files')}
          >
            Dosyalar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'map'}
            onClick={() => setSidebarTab('map')}
          >
            Proje Haritası
          </button>
        </div>
      </div>

      <div className="sidebar-toolbar">
        {sidebarTab === 'files' ? (
          <>
            <span className="grow" title={workspace?.root}>
              {workspace ? basename(workspace.root) : 'Proje yok'}
            </span>
            <IconButton label="Dosya ağacını yenile" onClick={() => void refreshTree()} disabled={!workspace}>
              <RefreshIcon size={13} />
            </IconButton>
            <IconButton label="Proje klasörü aç" onClick={() => void openFolderDialog()}>
              <FolderIcon size={13} />
            </IconButton>
          </>
        ) : (
          <>
            <span className="grow">Semboller</span>
            <IconButton label="İndeksi yeniden tara" onClick={() => void refreshIndex()} disabled={!workspace || indexBusy}>
              <RefreshIcon size={13} />
            </IconButton>
            <IconButton label="Tam harita görünümü" onClick={() => setView('map')}>
              <SplitIcon size={13} />
            </IconButton>
          </>
        )}
      </div>

      <div className="sidebar-body">
        {!workspace ? (
          <div className="tree-empty">Proje açılmadı.</div>
        ) : sidebarTab === 'files' ? (
          treeLoading ? (
            <div className="tree-empty">Dosya ağacı okunuyor…</div>
          ) : tree ? (
            <FileTree node={tree} activePath={activePath} />
          ) : (
            <div className="tree-empty">Ağaç okunamadı.</div>
          )
        ) : (
          <div style={{ padding: '6px 8px' }}>
            <div className="search-field" style={{ marginBottom: 8 }}>
              <SearchIcon size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Sembol veya dosya ara"
                aria-label="Sembol veya dosya ara"
              />
            </div>
            {!index || index.symbols.length === 0 ? (
              <div className="tree-empty" style={{ padding: '10px 4px' }}>
                {indexProgress.state === 'scanning'
                  ? 'İndeks oluşturuluyor…'
                  : 'Sembol bulunamadı. Desteklenen dosyalar: TypeScript, JavaScript, Python.'}
              </div>
            ) : (
              filteredSymbols.map((symbol) => (
                <div key={symbol.id} className="symbol-row" style={{ padding: '3px 4px' }}>
                  <button
                    type="button"
                    className="grow"
                    style={{ textAlign: 'left', overflow: 'hidden' }}
                    onClick={() => void openFile(symbol.file, symbol.line)}
                    title={`${symbol.file}:${symbol.line}`}
                  >
                    <span className="symbol-name">{symbol.name}</span>
                    <span className="dim" style={{ fontSize: 10, marginLeft: 6 }}>
                      {basename(symbol.file)}:{symbol.line}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: 20, height: 20 }}
                    aria-label={`${symbol.name} sembolünü bağlama ekle`}
                    title="Bağlama ekle"
                    onClick={() => void addSymbolToContext(symbol.id)}
                  >
                    <PlusIcon size={12} />
                  </button>
                </div>
              ))
            )}
            {index && index.files.length > 0 ? (
              <button
                type="button"
                className="button button-ghost button-small"
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => void addFilesToContext(index.files.slice(0, 2).map((file) => file.path))}
              >
                En zengin 2 dosyayı bağlama ekle
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="index-line">
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
          <span className="grow">
            {indexProgress.state === 'scanning'
              ? `İndeksleniyor ${indexProgress.scanned}/${indexProgress.total || '?'}`
              : indexProgress.state === 'ready'
                ? `${index?.files.length ?? 0} dosya · ${index?.symbols.length ?? 0} sembol`
                : 'İndeks hazır değil'}
          </span>
          {indexProgress.state === 'scanning' ? <span>{progressPercent}%</span> : null}
        </div>
        {indexProgress.state === 'scanning' ? (
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        ) : null}
        <div className="index-line" title={index?.parserNote}>
          <span className="dim">
            {index ? (index.parser === 'tree-sitter' ? 'Tree-sitter (WASM)' : 'Yedek çıkarım') : 'ayrıştırıcı yok'}
            {index && index.skippedFiles > 0 ? ` · ${index.skippedFiles} atlandı` : ''}
          </span>
        </div>
        <div className="index-line" title={index?.lsp.message ?? 'LSP durumu bilinmiyor'}>
          <span className="dim">LSP: {index?.lsp.running ? index.lsp.server ?? 'bağlı' : 'kullanılamıyor'}</span>
        </div>
      </div>
    </aside>
  );
}
