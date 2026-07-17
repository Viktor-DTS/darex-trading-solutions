import API_BASE_URL from '../config';
import {
  exportTasksToLocalFolder,
  fetchAllTasks,
  filterTasksForExport,
} from './taskLocalExport';

const listeners = new Set();

let exportState = {
  status: 'idle',
  progress: null,
  message: '',
  result: null,
  error: null,
  totalLoaded: null,
  filteredCount: null,
};

let abortController = null;

function emit() {
  const snapshot = { ...exportState };
  listeners.forEach((fn) => fn(snapshot));
}

export function getTaskExportState() {
  return { ...exportState };
}

export function subscribeTaskExport(listener) {
  listener({ ...exportState });
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function stopTaskExport() {
  abortController?.abort();
}

async function logExportEvent(token, userSnapshot, filters, count) {
  if (!token || !userSnapshot) return;
  try {
    await fetch(`${API_BASE_URL}/event-log`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userSnapshot.id,
        userName: userSnapshot.name,
        userRole: userSnapshot.role,
        action: 'export',
        entityType: 'tasks',
        entityId: 'local',
        description: `Експорт заявок на локальне місце (${count} шт.)`,
        details: { ...filters, count },
      }),
    });
  } catch (err) {
    console.error('Помилка логування експорту:', err);
  }
}

export async function startTaskExport({
  rootDirHandle,
  token,
  filters,
  exportedBy,
  userSnapshot,
}) {
  if (exportState.status === 'running') {
    throw new Error('Експорт уже виконується');
  }

  abortController = new AbortController();
  const { signal } = abortController;

  exportState = {
    status: 'running',
    progress: null,
    message: 'Завантаження заявок...',
    result: null,
    error: null,
    totalLoaded: null,
    filteredCount: null,
  };
  emit();

  try {
    const { tasks, serverDate } = await fetchAllTasks(token);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    exportState.totalLoaded = tasks.length;
    exportState.message = 'Фільтрація заявок...';
    emit();

    const filtered = filterTasksForExport(tasks, filters);
    exportState.filteredCount = filtered.length;
    emit();

    if (filtered.length === 0) {
      exportState = {
        status: 'error',
        progress: null,
        message: '',
        result: null,
        error: 'За обраними фільтрами заявок не знайдено',
        totalLoaded: tasks.length,
        filteredCount: 0,
      };
      emit();
      return;
    }

    exportState.message = 'Експорт файлів...';
    exportState.progress = { processed: 0, total: filtered.length, task: '...' };
    emit();

    const result = await exportTasksToLocalFolder({
      tasks: filtered,
      rootDirHandle,
      serverDate,
      token,
      signal,
      filters,
      exportedBy,
      onProgress: (progress) => {
        exportState.progress = progress;
        exportState.message = progress.task ? String(progress.task) : 'Експорт файлів...';
        emit();
      },
    });

    if (result.cancelled) {
      exportState = {
        status: 'cancelled',
        progress: exportState.progress,
        message: 'Експорт зупинено',
        result,
        error: null,
        totalLoaded: tasks.length,
        filteredCount: filtered.length,
      };
      emit();
      return;
    }

    await logExportEvent(token, userSnapshot, filters, result.count);

    exportState = {
      status: 'completed',
      progress: { processed: result.count, total: result.count, task: '' },
      message: 'Експорт завершено',
      result,
      error: null,
      totalLoaded: tasks.length,
      filteredCount: filtered.length,
    };
    emit();
  } catch (err) {
    if (err?.name === 'AbortError') {
      exportState = {
        ...exportState,
        status: 'cancelled',
        message: 'Експорт зупинено',
        error: null,
      };
    } else {
      exportState = {
        ...exportState,
        status: 'error',
        message: '',
        error: err?.message || 'Помилка експорту',
      };
    }
    emit();
  } finally {
    abortController = null;
  }
}

export function dismissTaskExportNotice() {
  if (exportState.status === 'running') return;
  exportState = {
    status: 'idle',
    progress: null,
    message: '',
    result: null,
    error: null,
    totalLoaded: null,
    filteredCount: null,
  };
  emit();
}

export function isTaskExportRunning() {
  return exportState.status === 'running';
}
