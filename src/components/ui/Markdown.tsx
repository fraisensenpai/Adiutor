import type { ReactNode } from 'react';

/**
 * Küçük, güvenli bir Markdown alt kümesi: başlık, liste, kod bloğu, satır içi kod,
 * kalın ve italik. HTML enjekte edilmez; her şey React öğesi olarak üretilir.
 */

let keyCounter = 0;
function nextKey(prefix: string): string {
  keyCounter += 1;
  return `${prefix}-${keyCounter}`;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={nextKey('b')}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={nextKey('c')} className="inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(<em key={nextKey('i')}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre className="md-code" key={nextKey('pre')}>
          {language ? <span className="md-code-lang">{language}</span> : null}
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, '');
      blocks.push(
        <div className={`md-heading md-heading-${level}`} key={nextKey('h')}>
          {renderInline(text)}
        </div>,
      );
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ul className="md-list" key={nextKey('ul')}>
          {items.map((item) => (
            <li key={nextKey('li')}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push(
        <ol className="md-list md-list-ordered" key={nextKey('ol')}>
          {items.map((item) => (
            <li key={nextKey('li')}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[index]) &&
      !/^\s*\d+\.\s+/.test(lines[index]) &&
      !lines[index].startsWith('#')
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p className="md-paragraph" key={nextKey('p')}>
        {renderInline(paragraph.join(' '))}
      </p>,
    );
  }

  return <div className="markdown">{blocks}</div>;
}
