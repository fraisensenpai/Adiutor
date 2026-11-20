import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { bridge } from '@/lib/bridge';
import type { SymbolRelations } from '@shared/types';
import { FolderIcon, PlusIcon, RefreshIcon, SearchIcon } from './ui/Icons';
import { Badge, EmptyState, SectionTitle } from './ui/primitives';
import { basename, languageLabel, relativeTo } from '@/lib/format';

export function MapView() {
  const workspace = useStore((state) => state.workspace);
  const index = useStore((state) => state.index);
  const indexProgress = useStore((state) => state.indexProgress);
  const indexBusy = useStore((state) => state.indexBusy);
  const refreshIndex = useStore((state) => state.refreshIndex);
  const openFile = useStore((state) => state.openFile);
  const addFilesToContext = useStore((state) => state.addFilesToContext);
  const addSymbolToContext = useStore((state) => state.addSymbolToContext);
  const openFolderDialog = useStore((state) => state.openFolderDialog);
  const openSample = useStore((state) => state.openSample);
  const contextItems = useStore((state) => state.contextItems);
  const removeContext = useStore((state) => state.removeContext);

  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const [relations, setRelations] = useState<SymbolRelations | null>(null);
  const [relationsLoading, setRelationsLoading] = useState(false);

  const files = index?.files ?? [];
  const symbols = index?.symbols ?? [];

  const filteredFiles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('tr-TR');
    if (!search) return files;
    return files.filter((file) => file.path.toLocaleLowerCase('tr-TR').includes(search));
  }, [files, query]);

  const matchingSymbols = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('tr-TR');
    if (!search) return [];
    return symbols
      .filter((symbol) => symbol.name.toLocaleLowerCase('tr-TR').includes(search))
      .slice(0, 60);
  }, [symbols, query]);

  const fileSymbols = useMemo(
    () => (selectedPath ? symbols.filter((symbol) => symbol.file === selectedPath) : []),
    [symbols, selectedPath],
  );

  const selectedSymbol = useMemo(
    () => symbols.find((symbol) => symbol.id === selectedSymbolId) ?? null,
    [symbols, selectedSymbolId],
  );

  useEffect(() => {
    if (!workspace || !selectedSymbolId) {
      setRelations(null);
      return;
    }
    let cancelled = false;
    setRelationsLoading(true);
    bridge.index
      .relations(workspace.root, selectedSymbolId)
      .then((result) => {
        if (!cancelled) setRelations(result);
      })
      .catch(() => {
        if (!cancelled) setRelations(null);
      })
      .finally(() => {
        if (!cancelled) setRelationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, selectedSymbolId]);

  if (!workspace) {
    return (
      <EmptyState
        icon={<FolderIcon size={20} />}
        title="Proje Haritası için bir proje açın"
        description="Yerel indeks; dosyaları, fonksiyon/sınıf/değişken tanımlarını, import ilişkilerini ve tanım–kullanım bağlantılarını çıkarır. TypeScript/JavaScript ve Python önceliklidir; desteklenmeyen dosyalar sessizce atlanır."
        actions={
          <>
            <button type="button" className="button button-primary" onClick={() => void openFolderDialog()}>
              Proje klasörü aç
            </button>
            <button type="button" className="button" onClick={() => void openSample()}>
              Örnek projeyi aç
            </button>
          </>
        }
      />
    );
  }

  const languages = files.reduce<Record<string, number>>((acc, file) => {
    acc[file.language] = (acc[file.language] ?? 0) + 1;
    return acc;
  }, {});

  const contextCounts = {
    files: contextItems.filter((item) => item.kind === 'file').length,
    symbols: contextItems.filter((item) => item.kind === 'symbol').length,
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Proje Haritası</h1>
          <p className="view-desc">
            Yerel indeks, AI’a her istekte tüm projeyi göndermek yerine ilgili sembol ve dosyaları seçmenizi sağlar.
            Dosya değişiklikleri izlenir ve indeks artımlı güncellenir.
          </p>
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="button"
            onClick={() => void refreshIndex()}
            disabled={indexBusy}
            title="Tüm projeyi yeniden tara"
          >
            <RefreshIcon size={13} />
            {indexBusy ? 'Taranıyor…' : 'Yeniden indeksle'}
          </button>
          <button type="button" className="button button-ghost" onClick={() => void openFolderDialog()}>
            Klasör değiştir
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">İndekslenen dosya</div>
          <div className="stat-value">{files.length}</div>
          <div className="stat-hint">
            {Object.entries(languages)
              .map(([language, count]) => `${languageLabel(language as never)}:${count}`)
              .join(' · ') || 'desteklenen dosya yok'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sembol</div>
          <div className="stat-value">{symbols.length}</div>
          <div className="stat-hint">fonksiyon, sınıf, metot, değişken, tür</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Atlanan dosya</div>
          <div className="stat-value">{index?.skippedFiles ?? 0}</div>
          <div className="stat-hint">
            {index
              ? Object.entries(index.skippedReasons)
                  .slice(0, 2)
                  .map(([reason, count]) => `${reason}: ${count}`)
                  .join(' · ')
              : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Bağlamdaki parça</div>
          <div className="stat-value">{contextItems.length}</div>
          <div className="stat-hint">
            {contextCounts.files} dosya · {contextCounts.symbols} sembol
          </div>
        </div>
      </div>

      <div className="panel panel-pad" style={{ marginBottom: 14 }}>
        <div className="row" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
          <Badge tone={index?.parser === 'tree-sitter' ? 'success' : 'warn'}>
            {index?.parser === 'tree-sitter' ? 'tree-sitter' : 'yedek çıkarım'}
          </Badge>
          <span className="grow">{index?.parserNote ?? 'İndeks bekleniyor.'}</span>
          <span className="dim">
            {indexProgress.state === 'scanning'
              ? `${indexProgress.scanned}/${indexProgress.total} taranıyor`
              : index?.watcherActive
                ? 'dosya izleme etkin (artımlı)'
                : 'dosya izleme devre dışı'}
          </span>
        </div>
      </div>

      <div className="search-field" style={{ marginBottom: 12, maxWidth: 460 }}>
        <SearchIcon size={14} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Dosya veya sembol ara (örn. TaskStore)"
          aria-label="Proje haritasında ara"
        />
        {query ? (
          <button type="button" className="link-button" style={{ fontSize: 10.5 }} onClick={() => setQuery('')}>
            temizle
          </button>
        ) : null}
      </div>

      <div className="map-layout">
        <div className="panel">
          <div className="panel-pad" style={{ paddingBottom: 4 }}>
            <SectionTitle hint={`${filteredFiles.length} dosya`}>Dosyalar</SectionTitle>
          </div>
          <div className="map-list">
            {filteredFiles.length === 0 ? (
              <div className="dim" style={{ padding: 12, fontSize: 11.5 }}>
                {indexProgress.state === 'scanning' ? 'İndeks oluşturuluyor…' : 'Eşleşen dosya yok.'}
              </div>
            ) : (
              filteredFiles.slice(0, 200).map((file) => (
                <div
                  key={file.path}
                  className={`map-row ${selectedPath === file.path ? 'is-active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setSelectedPath(file.path);
                    setSelectedSymbolId(null);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setSelectedPath(file.path);
                      setSelectedSymbolId(null);
                    }
                  }}
                  title={relativeTo(workspace.root, file.path)}
                >
                  <span className="dim" style={{ fontSize: 9.5, fontWeight: 700, width: 26 }}>
                    {languageLabel(file.language)}
                  </span>
                  <span className="path">{relativeTo(workspace.root, file.path)}</span>
                  <span className="meta">{file.symbolCount} sembol</span>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: 20, height: 20 }}
                    aria-label={`${basename(file.path)} dosyasını bağlama ekle`}
                    title="Bağlama ekle"
                    onClick={(event) => {
                      event.stopPropagation();
                      void addFilesToContext([file.path]);
                    }}
                  >
                    <PlusIcon size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="stack">
          {query && matchingSymbols.length > 0 ? (
            <div className="panel panel-pad">
              <SectionTitle hint={`${matchingSymbols.length} sonuç`}>Sembol araması</SectionTitle>
              {matchingSymbols.map((symbol) => (
                <div className="symbol-row" key={symbol.id}>
                  <span className="symbol-kind">{symbol.kind}</span>
                  <button
                    type="button"
                    className="grow"
                    style={{ textAlign: 'left', overflow: 'hidden' }}
                    onClick={() => {
                      setSelectedPath(symbol.file);
                      setSelectedSymbolId(symbol.id);
                    }}
                  >
                    <span className="symbol-name">{symbol.name}</span>
                    <span className="dim" style={{ fontSize: 10, marginLeft: 8 }}>
                      {relativeTo(workspace.root, symbol.file)}:{symbol.line}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`${symbol.name} sembolünü bağlama ekle`}
                    onClick={() => void addSymbolToContext(symbol.id)}
                  >
                    <PlusIcon size={12} />
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => void openFile(symbol.file, symbol.line)}
                  >
                    Aç
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {selectedSymbol ? (
            <div className="panel panel-pad">
              <SectionTitle hint={relationsLoading ? 'ilişkiler yükleniyor…' : undefined}>Sembol detayı</SectionTitle>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 650 }}>
                  {selectedSymbol.name}
                </span>
                <Badge tone="accent">{selectedSymbol.kind}</Badge>
                {selectedSymbol.exported ? <Badge tone="neutral">dışa açık</Badge> : null}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    onClick={() => void openFile(selectedSymbol.file, selectedSymbol.line)}
                  >
                    Tanıma git
                  </button>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => void addSymbolToContext(selectedSymbol.id)}
                  >
                    <PlusIcon size={12} />
                    Bağlama ekle
                  </button>
                </div>
              </div>
              <div className="dim" style={{ fontSize: 11, marginBottom: 10 }}>
                {relativeTo(workspace.root, selectedSymbol.file)}:{selectedSymbol.line}–
                {selectedSymbol.endLine}
                {selectedSymbol.container ? ` · ${selectedSymbol.container} içinde` : ''}
              </div>
              <SectionTitle hint={relations ? `${relations.references.length} kullanım` : undefined}>
                Tanım ve kullanımlar
              </SectionTitle>
              {relations && relations.references.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflow: 'auto' }}>
                  {relations.references.map((reference, index) => (
                    <button
                      type="button"
                      className="reference-row"
                      key={`${reference.file}-${reference.line}-${reference.column}-${index}`}
                      onClick={() => void openFile(reference.file, reference.line)}
                      title={reference.file}
                    >
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', minWidth: 42 }}>
                        {reference.line}:{reference.column}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {relativeTo(workspace.root, reference.file)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dim" style={{ fontSize: 11.5 }}>
                  {relationsLoading
                    ? 'Kullanımlar aranıyor…'
                    : 'Bu sembol için başka dosyada kullanım bulunamadı (veya dosyalar desteklenmiyor).'}
                </div>
              )}
            </div>
          ) : selectedPath ? (
            <div className="panel panel-pad">
              <SectionTitle
                hint={
                  <button type="button" className="link-button" onClick={() => void openFile(selectedPath)}>
                    dosyayı editörde aç
                  </button>
                }
              >
                {relativeTo(workspace.root, selectedPath)}
              </SectionTitle>
              {fileSymbols.length === 0 ? (
                <div className="dim" style={{ fontSize: 11.5 }}>
                  Bu dosyada çıkarılan sembol yok veya dosya ayrıştırılamadı.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 480, overflow: 'auto' }}>
                  {fileSymbols.map((symbol) => (
                    <div className="symbol-row" key={symbol.id}>
                      <span className="symbol-kind">{symbol.kind}</span>
                      <button
                        type="button"
                        className="grow"
                        style={{ textAlign: 'left', overflow: 'hidden' }}
                        onClick={() => setSelectedSymbolId(symbol.id)}
                      >
                        <span className="symbol-name">{symbol.name}</span>
                        <span className="dim" style={{ fontSize: 10, marginLeft: 8 }}>
                          satır {symbol.line}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`${symbol.name} bağlama ekle`}
                        onClick={() => void addSymbolToContext(symbol.id)}
                      >
                        <PlusIcon size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="panel panel-pad">
              <SectionTitle hint="bağlama eklemek için + düğmesi">Sembol listesi</SectionTitle>
              <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                Soldan bir dosya seçin ya da yukarıdaki arama alanıyla sembol arayın. Bir sembol seçtiğinizde tanımı
                ve proje içindeki kullanımları listelenir; bunları tek tıkla AI bağlamına ekleyebilirsiniz.
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {symbols.slice(0, 12).map((symbol) => (
                  <button
                    type="button"
                    key={symbol.id}
                    className="button button-ghost button-small"
                    onClick={() => {
                      setSelectedPath(symbol.file);
                      setSelectedSymbolId(symbol.id);
                    }}
                  >
                    {symbol.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {contextItems.length > 0 ? (
            <div className="panel panel-pad">
              <SectionTitle hint="AI’a gönderilecek parçalar">Bağlamdaki kod</SectionTitle>
              <div className="context-chips">
                {contextItems.map((item) => (
                  <span className="chip" key={item.id}>
                    <span className="chip-label">{item.label}</span>
                    <button type="button" onClick={() => removeContext(item.id)} aria-label={`${item.label} çıkar`}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
