import API_BASE_URL from '../config';
import {
  exportTasksToLocalFolder,
  fetchAllTasks,
  filterTasksForExport,
} from './taskLocalExport';

const STORAGE_KEY = 'taskExportLastSession';

const listeners = new Set();

let exportState = {
  status: 'idle',
  progress: null,
  message: '',
  result: null,
  error: null,
  totalLoaded: null,
  filteredCount: null,
  session: null,
};

let abortController = null;

function buildSessionSnapshot(state) {
  const progress = state.progress || {};
  return {
    sessionId: state.session?.sessionId || null,
    status: state.status,
    startedAt: state.session?.startedAt || null,
    finishedAt: state.session?.finishedAt || null,
    exportedBy: state.session?.exportedBy || null,
    filters: state.session?.filters || null,
    filteredCount: state.filteredCount ?? progress.total ?? null,
    totalLoaded: state.totalLoaded ?? null,
    processed: progress.processed ?? 0,
    total: progress.total ?? 0,
    lastTask: progress.task || state.message || null,
    exportFolderName: state.result?.exportFolderName || state.session?.exportFolderName || null,
    error: state.error || null,
  };
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredSession(session) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function sessionToExportState(session) {
  if (!session) return null;
  return {
    status: session.status,
    progress: {
      processed: session.processed ?? 0,
      total: session.total ?? 0,
      task: session.lastTask || '',
    },
    message: session.lastTask || '',
    result: session.exportFolderName
      ? { exportFolderName: session.exportFolderName, count: session.processed ?? 0, cancelled: session.status !== 'completed' }
      : session.processed != null
        ? { count: session.processed, cancelled: session.status !== 'completed' }
        : null,
    error: session.error || null,
    totalLoaded: session.totalLoaded ?? null,
    filteredCount: session.filteredCount ?? session.total ?? null,
    session,
  };
}

function persistCurrentState() {
  if (exportState.status === 'idle') return;
  const session = {
    ...buildSessionSnapshot(exportState),
    sessionId: exportState.session?.sessionId || buildSessionSnapshot(exportState).sessionId,
    startedAt: exportState.session?.startedAt || new Date().toISOString(),
    finishedAt: exportState.status === 'running' ? null : (exportState.session?.finishedAt || new Date().toISOString()),
    exportedBy: exportState.session?.exportedBy || null,
    filters: exportState.session?.filters || null,
  };
  exportState.session = session;
  writeStoredSession(session);
}

function emit() {
  persistCurrentState();
  const snapshot = { ...exportState };
  listeners.forEach((fn) => fn(snapshot));
}

function initFromStorage() {
  const stored = readStoredSession();
  if (!stored) return;

  if (stored.status === 'running') {
    stored.status = 'interrupted';
    stored.error = stored.error || 'Експорт перервано (закрито вкладку або перезавантажено браузер)';
    stored.finishedAt = new Date().toISOString();
    writeStoredSession(stored);
  }

  if (['interrupted', 'completed', 'cancelled', 'error'].includes(stored.status)) {
    exportState = {
      ...sessionToExportState(stored),
      session: stored,
    };
  }
}

initFromStorage();

export function getLastTaskExportSession() {
  return readStoredSession();
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

export function getTaskExportStatusLabel(status) {
  const labels = {
    running: 'Виконується',
    completed: 'Успішно завершено',
    cancelled: 'Зупинено вручну',
    error: 'Помилка',
    interrupted: 'Перервано (закрито браузер)',
  };
  return labels[status] || status;
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

  const sessionId = `export_${Date.now()}`;
  exportState = {
    status: 'running',
    progress: { processed: 0, total: 0, task: '...' },
    message: 'Завантаження заявок...',
    result: null,
    error: null,
    totalLoaded: null,
    filteredCount: null,
    session: {
      sessionId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      exportedBy: exportedBy || userSnapshot?.name || '',
      filters,
      exportFolderName: null,
    },
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
        progress: { processed: 0, total: 0, task: '' },
        message: '',
        result: null,
        error: 'За обраними фільтрами заявок не знайдено',
        totalLoaded: tasks.length,
        filteredCount: 0,
        session: {
          ...exportState.session,
          finishedAt: new Date().toISOString(),
        },
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
        if (exportState.session && progress.exportFolderName) {
          exportState.session.exportFolderName = progress.exportFolderName;
        }
        emit();
      },
    });

    if (exportState.session) {
      exportState.session.exportFolderName = result.exportFolderName || null;
      exportState.session.finishedAt = new Date().toISOString();
    }

    if (result.cancelled) {
      exportState = {
        status: 'cancelled',
        progress: exportState.progress,
        message: 'Експорт зупинено',
        result,
        error: null,
        totalLoaded: tasks.length,
        filteredCount: filtered.length,
        session: exportState.session,
      };
      emit();
      return;
    }

    await logExportEvent(token, userSnapshot, filters, result.count);

    exportState = {
      status: 'completed',
      progress: { processed: result.count, total: filtered.length, task: '' },
      message: 'Експорт завершено',
      result,
      error: null,
      totalLoaded: tasks.length,
      filteredCount: filtered.length,
      session: exportState.session,
    };
    emit();
  } catch (err) {
    if (exportState.session) {
      exportState.session.finishedAt = new Date().toISOString();
    }
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
    session: exportState.session || readStoredSession(),
  };
  emit();
}

export function isTaskExportRunning() {
  return exportState.status === 'running';
}
