import React, { useEffect, useState } from 'react';
import {
  dismissTaskExportNotice,
  getLastTaskExportSession,
  getTaskExportState,
  stopTaskExport,
  subscribeTaskExport,
} from '../utils/taskExportRunner';
import LastExportSessionCard from './LastExportSessionCard';
import './TaskExportOverlay.css';

function TaskExportOverlay() {
  const [state, setState] = useState(getTaskExportState);

  useEffect(() => {
    return subscribeTaskExport(setState);
  }, []);

  if (!state || state.status === 'idle') return null;

  const { status, progress, message, result, error, session } = state;
  const isRunning = status === 'running';
  const displaySession = session || getLastTaskExportSession();

  return (
    <div className={`task-export-overlay task-export-overlay--${status}`}>
      <div className="task-export-overlay-header">
        <span className="task-export-overlay-title">
          {isRunning && '📤 Експорт заявок'}
          {status === 'completed' && '✅ Експорт завершено'}
          {status === 'cancelled' && '⏹ Експорт зупинено'}
          {status === 'error' && '❌ Помилка експорту'}
          {status === 'interrupted' && '⚠️ Експорт перервано'}
        </span>
        {!isRunning && (
          <button
            type="button"
            className="task-export-overlay-close"
            onClick={dismissTaskExportNotice}
            title="Закрити"
          >
            ✕
          </button>
        )}
      </div>

      {isRunning && (
        <p className="task-export-overlay-hint">
          Експорт триває у фоні. Можна вийти з системи — не закривайте вкладку браузера.
        </p>
      )}

      {progress && (
        <div className="task-export-overlay-progress">
          {progress.processed} / {progress.total}
          {message ? ` — ${message}` : ''}
        </div>
      )}

      {status === 'completed' && result && (
        <div className="task-export-overlay-detail">
          Папка: <strong>{result.exportFolderName}</strong> · Заявок: <strong>{result.count}</strong>
        </div>
      )}

      {status === 'cancelled' && result && (
        <div className="task-export-overlay-detail">
          Збережено заявок: <strong>{result.count}</strong>
          {result.exportFolderName ? ` · ${result.exportFolderName}` : ''}
        </div>
      )}

      {error && <div className="task-export-overlay-error">{error}</div>}

      {!isRunning && displaySession && (
        <LastExportSessionCard session={displaySession} compact />
      )}

      {isRunning && (
        <button
          type="button"
          className="task-export-overlay-stop"
          onClick={stopTaskExport}
        >
          ⏹ Зупинити експорт
        </button>
      )}
    </div>
  );
}

export default TaskExportOverlay;
