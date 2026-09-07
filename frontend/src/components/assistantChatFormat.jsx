import React from 'react';

/** Знімає хвости типу крапки/дужки з кінця URL після вирізання з тексту. */
export function trimTrailingPunctFromUrl(u) {
  return String(u || '').replace(/[),.;:!?'"\]}]+$/g, '');
}

function splitUrls(line) {
  const re = /\b(https?:\/\/[^\s<>"']+)/gi;
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ type: 'text', s: line.slice(last, m.index) });
    const raw = m[0];
    out.push({ type: 'link', url: trimTrailingPunctFromUrl(raw) });
    last = m.index + raw.length;
  }
  if (last < line.length) out.push({ type: 'text', s: line.slice(last) });
  return out.length ? out : [{ type: 'text', s: line }];
}

function BoldSegments({ text, keyPref }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/);
  return (
    <span className="assistant-chat-msg-plain">
      {parts.map((chunk, i) =>
        /^\*\*[^*]+\*\*$/.test(chunk) ? (
          <strong key={`${keyPref}-b-${i}`}>{chunk.slice(2, -2)}</strong>
        ) : (
          <span key={`${keyPref}-t-${i}`}>{chunk}</span>
        ),
      )}
    </span>
  );
}

function CodeBoldInline({ text, keyPref }) {
  const chunks = String(text).split(/(`[^`]+`)/);
  return (
    <>
      {chunks.map((chunk, i) =>
        /^`[^`]+`$/.test(chunk) ? (
          <code key={`${keyPref}-c-${i}`} className="assistant-chat-msg-code">
            {chunk.slice(1, -1)}
          </code>
        ) : (
          <BoldSegments key={`${keyPref}-cb-${i}`} text={chunk} keyPref={`${keyPref}-cb-${i}`} />
        ),
      )}
    </>
  );
}

function LineFormatted({ line, lineKey }) {
  const segs = splitUrls(line);
  return (
    <>
      {segs.map((seg, si) => {
        const k = `${lineKey}-s${si}`;
        if (seg.type === 'link') {
          const href = seg.url;
          return (
            <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="assistant-chat-msg-link">
              {href}
            </a>
          );
        }
        return <CodeBoldInline key={k} text={seg.s} keyPref={k} />;
      })}
    </>
  );
}

function isBullet(line) {
  return /^\s*[-•*]\s+\S/.test(line);
}

function isOrdered(line) {
  return /^\s*\d+[.)]\s+\S/.test(line);
}

function isHeading(line) {
  return /^#{1,3}\s+\S/.test(line);
}

function stripBullet(line) {
  return String(line).replace(/^\s*[-•*]\s+/, '');
}

function stripOrdered(line) {
  return String(line).replace(/^\s*\d+[.)]\s+/, '');
}

function parseBlocks(text) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (raw.trim() === '') {
      i += 1;
      continue;
    }
    if (isHeading(raw)) {
      const level = raw.match(/^#{1,3}/)[0].length;
      blocks.push({ type: 'h', level, text: raw.replace(/^#{1,3}\s+/, '') });
      i += 1;
      continue;
    }
    if (isBullet(raw)) {
      const items = [];
      while (i < lines.length && isBullet(lines[i])) {
        items.push(stripBullet(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (isOrdered(raw)) {
      const items = [];
      while (i < lines.length && isOrdered(lines[i])) {
        items.push(stripOrdered(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isBullet(lines[i]) &&
      !isOrdered(lines[i]) &&
      !isHeading(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'p', lines: para });
  }
  return blocks;
}

/**
 * Безпечне відображення відповіді асистента: абзаци, списки, заголовки,
 * http(s) посилання, **жирний**, `код`. Без HTML від LLM — лише React-вузли.
 */
export function AssistantMessageContent({ text }) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) return null;

  return blocks.map((block, bi) => {
    const key = `blk${bi}`;
    if (block.type === 'h') {
      const Tag = block.level >= 3 ? 'h4' : block.level === 2 ? 'h3' : 'h2';
      return (
        <Tag key={key} className={`assistant-md-h assistant-md-h-${block.level}`}>
          <LineFormatted line={block.text} lineKey={`${key}-h`} />
        </Tag>
      );
    }
    if (block.type === 'ul' || block.type === 'ol') {
      const List = block.type === 'ul' ? 'ul' : 'ol';
      return (
        <List key={key} className={`assistant-md-list assistant-md-${block.type}`}>
          {block.items.map((item, ii) => (
            <li key={`${key}-i${ii}`}>
              <LineFormatted line={item} lineKey={`${key}-i${ii}`} />
            </li>
          ))}
        </List>
      );
    }
    return (
      <p key={key} className="assistant-md-p">
        {block.lines.map((line, li) => (
          <React.Fragment key={`${key}-l${li}`}>
            {li > 0 ? <br /> : null}
            <LineFormatted line={line} lineKey={`${key}-l${li}`} />
          </React.Fragment>
        ))}
      </p>
    );
  });
}
