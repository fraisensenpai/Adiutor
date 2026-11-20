/**
 * Küçük, bağımlılıksız satır bazlı diff.
 * Not: Büyük dosyalarda LCS tablosu sınırlanır; sınır aşılırsa tüm dosya
 * "değişti" olarak gösterilir (yanlış eşleştirme yapmaktansa dürüst davranır).
 */

export type DiffRowType = 'equal' | 'add' | 'del';

export interface DiffRow {
  type: DiffRowType;
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  rows: DiffRow[];
}

export interface DiffResult {
  rows: DiffRow[];
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  truncated: boolean;
}

const MAX_CELLS = 4_000_000;

function splitLines(text: string): string[] {
  if (text === '') return [];
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function diffLines(oldText: string, newText: string): DiffResult {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  let truncated = false;
  let rows: DiffRow[] = [];

  if (a.length * b.length > MAX_CELLS) {
    truncated = true;
    rows = [
      ...a.map((text, i) => ({ type: 'del' as const, oldLine: i + 1, text })),
      ...b.map((text, i) => ({ type: 'add' as const, newLine: i + 1, text })),
    ];
  } else {
    // LCS uzunluk tablosu
    const n = a.length;
    const m = b.length;
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i * width + j] =
          a[i] === b[j]
            ? table[(i + 1) * width + (j + 1)] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + (j + 1)]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        rows.push({ type: 'equal', oldLine: i + 1, newLine: j + 1, text: a[i] });
        i++;
        j++;
      } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
        rows.push({ type: 'del', oldLine: i + 1, text: a[i] });
        i++;
      } else {
        rows.push({ type: 'add', newLine: j + 1, text: b[j] });
        j++;
      }
    }
    while (i < n) {
      rows.push({ type: 'del', oldLine: i + 1, text: a[i] });
      i++;
    }
    while (j < m) {
      rows.push({ type: 'add', newLine: j + 1, text: b[j] });
      j++;
    }
  }

  const additions = rows.filter((r) => r.type === 'add').length;
  const deletions = rows.filter((r) => r.type === 'del').length;
  return { rows, hunks: buildHunks(rows), additions, deletions, truncated };
}

export function buildHunks(rows: DiffRow[], context = 3): DiffHunk[] {
  const changed = rows.map((r) => r.type !== 'equal');
  const hunks: DiffHunk[] = [];
  let index = 0;
  while (index < rows.length) {
    if (!changed[index]) {
      index++;
      continue;
    }
    const start = Math.max(0, index - context);
    let end = index;
    // Değişiklikler arası boşluk context*2'den küçükse tek hunks içinde birleştir.
    while (end < rows.length) {
      if (changed[end]) {
        end++;
        continue;
      }
      let next = end;
      while (next < rows.length && !changed[next]) next++;
      if (next < rows.length && next - end <= context * 2) {
        end = next;
        continue;
      }
      break;
    }
    const slice = rows.slice(start, Math.min(rows.length, end + context));
    const firstOld = slice.find((r) => r.oldLine !== undefined)?.oldLine ?? 1;
    const firstNew = slice.find((r) => r.newLine !== undefined)?.newLine ?? 1;
    hunks.push({
      oldStart: firstOld,
      oldLines: slice.filter((r) => r.oldLine !== undefined).length,
      newStart: firstNew,
      newLines: slice.filter((r) => r.newLine !== undefined).length,
      rows: slice,
    });
    index = end + context;
  }
  return hunks;
}

export function unifiedDiff(filePath: string, oldText: string, newText: string): string {
  const result = diffLines(oldText, newText);
  const head = `--- a/${filePath}\n+++ b/${filePath}`;
  const body = result.hunks
    .map((hunk) => {
      const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
      const lines = hunk.rows.map((row) => {
        const prefix = row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ';
        return `${prefix}${row.text}`;
      });
      return [header, ...lines].join('\n');
    })
    .join('\n');
  return `${head}\n${body}`;
}
