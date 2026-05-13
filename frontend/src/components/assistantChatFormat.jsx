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

/**
 * Безпечне відображення відповіді асистента: переноси рядків, http(s) посилання, **жирний**, `код`.
 * Без HTML від LLM — лише React-вузли.
 */
export function AssistantMessageContent({ text }) {
  const lines = String(text || '').split('\n');
  return lines.map((line, li) => (
    <React.Fragment key={li}>
      {li > 0 ? <br /> : null}
      <LineFormatted line={line} lineKey={`ln${li}`} />
    </React.Fragment>
  ));
}
