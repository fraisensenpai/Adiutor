import { useMemo } from 'react';
import { diffLines } from '@shared/diff';

export function DiffView({ original, proposed }: { original: string; proposed: string }) {
  const diff = useMemo(() => diffLines(original, proposed), [original, proposed]);

  if (diff.hunks.length === 0) {
    return (
      <div className="diff-scroll">
        <div className="diff-empty">Bu dosya için içerik değişikliği yok.</div>
      </div>
    );
  }

  return (
    <div className="diff-scroll" role="region" aria-label="Diff görünümü">
      {diff.truncated ? (
        <div className="diff-hunk-header">
          Dosya karşılaştırma sınırı aşıldı; tüm içerik değiştirilmiş olarak gösteriliyor.
        </div>
      ) : null}
      {diff.hunks.map((hunk, index) => (
        <div key={`${hunk.oldStart}-${hunk.newStart}-${index}`}>
          <div className="diff-hunk-header">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          {hunk.rows.map((row, rowIndex) => (
            <div
              key={`${row.type}-${row.oldLine ?? 0}-${row.newLine ?? 0}-${rowIndex}`}
              className={`diff-row ${row.type === 'add' ? 'diff-add' : row.type === 'del' ? 'diff-del' : ''}`}
            >
              <span className="diff-gutter">{row.oldLine ?? ''}</span>
              <span className="diff-gutter">{row.newLine ?? ''}</span>
              <span className="diff-marker">{row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}</span>
              <span className="diff-text">{row.text || ' '}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
