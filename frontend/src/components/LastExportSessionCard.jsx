import React from 'react';
import { getTaskExportStatusLabel } from '../utils/taskExportRunner';

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function LastExportSessionCard({ session, compact = false }) {
  if (!session || session.status === 'running') return null;

  const statusClass = `task-export-last--${session.status}`;
  const processed = session.processed ?? 0;
  const total = session.total ?? 0;

  return (
    <div className={`task-export-last ${statusClass}${compact ? ' task-export-last--compact' : ''}`}>
      <div className="task-export-last-title">📋 Останній експорт</div>
      <div className="task-export-last-row">
        <span className="task-export-last-label">Статус:</span>
        <strong>{getTaskExportStatusLabel(session.status)}</strong>
      </div>
      <div className="task-export-last-row">
        <span className="task-export-last-label">Експортовано:</span>
        <strong>{processed} / {total || '?'}</strong>
      </div>
      {session.lastTask && (
        <div className="task-export-last-row">
          <span className="task-export-last-label">Остання заявка:</span>
          <span>{session.lastTask}</span>
        </div>
      )}
      {session.exportFolderName && (
        <div className="task-export-last-row">
          <span className="task-export-last-label">Папка:</span>
          <span>{session.exportFolderName}</span>
        </div>
      )}
      <div className="task-export-last-row">
        <span className="task-export-last-label">Початок:</span>
        <span>{formatDateTime(session.startedAt)}</span>
      </div>
      {session.finishedAt && (
        <div className="task-export-last-row">
          <span className="task-export-last-label">Завершення:</span>
          <span>{formatDateTime(session.finishedAt)}</span>
        </div>
      )}
      {session.error && (
        <div className="task-export-last-error">{session.error}</div>
      )}
      {session.status === 'interrupted' && total > processed && (
        <div className="task-export-last-hint">
          Експорт обірвався на {processed}-й заявці з {total}. Запустіть новий експорт — уже збережені файли залишаться в папці.
        </div>
      )}
    </div>
  );
}

export default LastExportSessionCard;
