import React from 'react';
import './TenderDepartment.css';

function TenderDetailPanel({ tender, analysis, onSave, saving, mode = 'search' }) {
  const a = analysis || tender?.analysis || {};
  const docs = a.requiredDocs || [];
  const platformUrl = tender.platformUrl || tender.prozorroUrl || (tender.tenderNumber ? `https://prozorro.gov.ua/tender/${tender.tenderNumber}` : '');
  const prozorroUrl = tender.prozorroUrl || (tender.tenderNumber ? `https://prozorro.gov.ua/tender/${tender.tenderNumber}` : '');
  const dzoUrl = tender.source === 'dzo' ? platformUrl : '';

  return (
    <div className="tender-detail-panel">
      <div className="tender-detail-header">
        <div>
          <span className="tender-detail-badge">{tender.sourceLabel || 'Prozorro'}</span>
          <span className="tender-detail-badge">{a.categoryLabel || '—'}</span>
          {a.powerKw && <span className="tender-detail-badge">~{a.powerKw} кВт</span>}
          {a.daysLeft != null && (
            <span className={`tender-detail-badge ${a.daysLeft < 0 ? 'tender-detail-badge--expired' : a.daysLeft < 5 ? 'tender-detail-badge--warn' : ''}`}>
              {a.daysLeft < 0 ? 'Дедлайн минув' : `${a.daysLeft} дн. до дедлайну`}
            </span>
          )}
        </div>
        <div className={`tender-recommendation tender-recommendation--${a.recommendation || 'review'}`}>
          {a.recommendationLabel || '—'}
          {a.score != null && <span className="tender-recommendation-score">{a.score}/100</span>}
        </div>
      </div>

      <h3 className="tender-detail-title">{tender.title || 'Без назви'}</h3>
      {tender.tenderNumber && (
        <p className="tender-detail-number">№ {tender.tenderNumber}</p>
      )}

      <div className="tender-info-grid">
        <div className="tender-info-item">
          <span className="tender-info-label">Бюджет</span>
          <strong>{tender.budgetFormatted || '—'}</strong>
        </div>
        <div className="tender-info-item">
          <span className="tender-info-label">Дедлайн подачі</span>
          <strong>{tender.deadlineFormatted || (tender.deadline ? new Date(tender.deadline).toLocaleString('uk-UA') : '—')}</strong>
        </div>
        <div className="tender-info-item">
          <span className="tender-info-label">Замовник</span>
          <strong>{tender.customer || '—'}</strong>
        </div>
        <div className="tender-info-item">
          <span className="tender-info-label">Регіон</span>
          <strong>{tender.region || '—'}</strong>
        </div>
        <div className="tender-info-item tender-info-item--wide">
          <span className="tender-info-label">Адреса поставки / монтажу</span>
          <strong>{tender.deliveryAddress || '—'}</strong>
        </div>
        <div className="tender-info-item">
          <span className="tender-info-label">Статус Prozorro</span>
          <strong>{tender.statusLabel || tender.status || '—'}</strong>
        </div>
        {tender.numberOfTenderers != null && (
          <div className="tender-info-item">
            <span className="tender-info-label">Учасників</span>
            <strong>{tender.numberOfTenderers}</strong>
          </div>
        )}
      </div>

      {tender.description && (
        <section className="tender-detail-section">
          <h4>Предмет закупівлі</h4>
          <p className="tender-detail-desc">{tender.description}</p>
        </section>
      )}

      {docs.length > 0 && (
        <section className="tender-detail-section">
          <h4>Ймовірні документи для участі</h4>
          <ul className="tender-doc-list">
            {docs.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {(a.competitiveNotes || []).length > 0 && (
        <section className="tender-detail-section">
          <h4>Конкурентний аналіз</h4>
          <ul className="tender-notes-list">
            {a.competitiveNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="tender-pros-cons">
        {(a.strengths || []).length > 0 && (
          <section className="tender-detail-section tender-pros">
            <h4>Переваги</h4>
            <ul>{a.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        )}
        {(a.risks || []).length > 0 && (
          <section className="tender-detail-section tender-cons">
            <h4>Ризики</h4>
            <ul>{a.risks.map((r) => <li key={r}>{r}</li>)}</ul>
          </section>
        )}
      </div>

      {(tender.documents || []).length > 0 && (
        <section className="tender-detail-section">
          <h4>Документи тендера</h4>
          <ul className="tender-doc-links">
            {tender.documents.slice(0, 12).map((d, i) => (
              <li key={d.url || i}>
                <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title || 'Документ'}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="tender-detail-actions">
        {dzoUrl && (
          <a href={dzoUrl} target="_blank" rel="noopener noreferrer" className="tender-btn tender-btn-secondary">
            Відкрити на DZO ↗
          </a>
        )}
        {prozorroUrl && (
          <a href={prozorroUrl} target="_blank" rel="noopener noreferrer" className="tender-btn tender-btn-secondary">
            Відкрити на Prozorro ↗
          </a>
        )}
        {mode === 'search' && onSave && (
          <button type="button" className="tender-btn tender-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Збереження...' : '+ Додати до робочого списку'}
          </button>
        )}
      </div>
    </div>
  );
}

export default TenderDetailPanel;
