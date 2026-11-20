import { useMemo, useState } from 'react';
import type { FileTreeNode } from '@shared/types';
import { useStore } from '@/state/store';
import { ChevronDown, ChevronRight, FileIcon, FolderIcon, PlusIcon } from './ui/Icons';
import { basename } from '@/lib/format';

interface FileTreeProps {
  node: FileTreeNode;
  depth?: number;
  activePath: string | null;
}

export function FileTree({ node, depth = 0, activePath }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const openFile = useStore((state) => state.openFile);
  const addFilesToContext = useStore((state) => state.addFilesToContext);
  const symbolCounts = useStore((state) => state.index?.files);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const file of symbolCounts ?? []) map.set(file.path, file.symbolCount);
    return map;
  }, [symbolCounts]);

  const toggle = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const children = node.children ?? [];
  if (children.length === 0) {
    if (depth === 0) {
      return <div className="tree-empty">Klasör boş veya yok sayılan dosyalardan oluşuyor.</div>;
    }
    return null;
  }

  return (
    <div className="tree" role={depth === 0 ? 'tree' : 'group'} aria-label={depth === 0 ? 'Proje dosyaları' : undefined}>
      {children.map((child) => {
        const isDir = child.type === 'directory';
        const isOpen = expanded.has(child.name === node.name ? child.path : child.path);
        const isActive = !isDir && child.path === activePath;
        return (
          <div key={child.path}>
            <div
              className={`tree-row ${isActive ? 'is-active' : ''}`}
              style={{ paddingLeft: 8 + depth * 13 }}
              role="treeitem"
              aria-expanded={isDir ? isOpen : undefined}
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => {
                if (isDir) toggle(child.path);
                else void openFile(child.path);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  if (isDir) toggle(child.path);
                  else void openFile(child.path);
                }
                if (event.key === 'ArrowRight' && isDir && !isOpen) toggle(child.path);
                if (event.key === 'ArrowLeft' && isDir && isOpen) toggle(child.path);
              }}
              title={child.path}
            >
              <span className="tree-caret">
                {isDir ? isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}
              </span>
              <span className="tree-icon">
                {isDir ? <FolderIcon size={14} /> : <FileIcon size={13} />}
              </span>
              <span className="tree-name">{isDir ? child.name : basename(child.name)}</span>
              {!isDir && counts.get(child.path) ? (
                <span className="dim" style={{ fontSize: 10, marginLeft: 4 }}>
                  {counts.get(child.path)}
                </span>
              ) : null}
              {!isDir ? (
                <span className="tree-actions">
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: 20, height: 20 }}
                    title={`${child.name} dosyasını AI bağlamına ekle`}
                    aria-label={`${child.name} dosyasını AI bağlamına ekle`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void addFilesToContext([child.path]);
                    }}
                  >
                    <PlusIcon size={12} />
                  </button>
                </span>
              ) : null}
            </div>
            {isDir && isOpen ? (
              <FileTree node={child} depth={depth + 1} activePath={activePath} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
