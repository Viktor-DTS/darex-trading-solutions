import React, { useEffect, useState, useRef } from 'react';
import API_BASE_URL from '../../config';
import { getDocumentKind, documentKindLabel } from '../../utils/tenderDocumentUtils';
import './TenderDepartment.css';

async function fetchDocumentBlob(docUrl) {
  const token = localStorage.getItem('token');
  const proxyUrl = `${API_BASE_URL}/tenders/documents/preview?url=${encodeURIComponent(docUrl)}`;
  const res = await fetch(proxyUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.blob();
}

function TenderDocumentPreview({ doc, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [html, setHtml] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const blobUrlRef = useRef('');
  const kind = getDocumentKind(doc);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!doc?.url) {
        setError('Посилання на документ відсутнє');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      setHtml('');
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }
      setBlobUrl('');

      try {
        const blob = await fetchDocumentBlob(doc.url);
        if (cancelled) return;

        if (kind === 'pdf' || kind === 'image') {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setBlobUrl(url);
        } else if (kind === 'docx' || kind === 'doc') {
          const mammoth = await import('mammoth');
          const arrayBuffer = await blob.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (!cancelled) {
            setHtml(result.value || '<p>Документ порожній</p>');
          }
        } else if (!cancelled) {
          setError('Перегляд цього типу файлу недоступний — завантажте файл.');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Не вдалося відкрити документ');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }
    };
  }, [doc, kind]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tender-doc-preview-overlay" onClick={onClose} role="presentation">
      <div
        className="tender-doc-preview-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={doc?.title || 'Перегляд документа'}
      >
        <div className="tender-doc-preview-header">
          <div>
            <span className="tender-doc-preview-kind">{documentKindLabel(kind)}</span>
            <h4 className="tender-doc-preview-title">{doc?.title || 'Документ'}</h4>
          </div>
          <div className="tender-doc-preview-actions">
            <a
              href={doc?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tender-btn tender-btn-secondary tender-btn-sm"
            >
              Завантажити
            </a>
            <button type="button" className="tender-doc-preview-close" onClick={onClose} aria-label="Закрити">
              ×
            </button>
          </div>
        </div>

        <div className="tender-doc-preview-body">
          {loading && <div className="tender-doc-preview-loading">Завантаження документа…</div>}
          {!loading && error && (
            <div className="tender-doc-preview-error">
              <p>{error}</p>
              <a href={doc?.url} target="_blank" rel="noopener noreferrer" className="tender-btn tender-btn-primary">
                Відкрити / завантажити файл ↗
              </a>
            </div>
          )}
          {!loading && !error && kind === 'pdf' && blobUrl && (
            <iframe title={doc?.title || 'PDF'} src={blobUrl} className="tender-doc-preview-iframe" />
          )}
          {!loading && !error && kind === 'image' && blobUrl && (
            <img src={blobUrl} alt={doc?.title || 'Документ'} className="tender-doc-preview-image" />
          )}
          {!loading && !error && (kind === 'docx' || kind === 'doc') && html && (
            <div className="tender-doc-preview-html" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </div>
    </div>
  );
}

export default TenderDocumentPreview;
