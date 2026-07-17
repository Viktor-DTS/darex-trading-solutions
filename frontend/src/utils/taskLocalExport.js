import API_BASE_URL from '../config';
import { generateTaskPdfBlob } from './taskPdfExport';
import {
  downloadUrlAsBlob,
  formatUkDate,
  getOrCreateSubdir,
  parseFilterDateInput,
  parseTaskDate,
  sanitizeNameForLocalSave,
  writeBlobToDir,
} from './localFsUtils';

function getContractFileUrl(contractFile) {
  if (contractFile == null) return '';
  if (typeof contractFile === 'string') return contractFile.trim();
  const u =
    contractFile.url ||
    contractFile.href ||
    contractFile.secure_url ||
    contractFile.publicUrl ||
    '';
  return String(u).trim();
}

function getContractorFolderName(task) {
  const edrpou = String(task.edrpou || '').trim();
  if (edrpou) return edrpou;
  const client = String(task.client || '').trim();
  return client || 'Без замовника';
}

function getTaskFolderName(task) {
  const num = String(task.requestNumber || task._id || 'заявка').trim();
  const datePart = formatUkDate(task.requestDate) || 'без_дати';
  return `${num} ${datePart}`;
}

export function filterTasksForExport(tasks, { dateFrom, dateTo, region, status }) {
  const fromDate = parseFilterDateInput(dateFrom);
  const toDate = parseFilterDateInput(dateTo, true);
  const hasDateFilter = Boolean(dateFrom || dateTo);

  return tasks.filter((task) => {
    if (status && status !== '__ALL__' && task.status !== status) return false;
    if (region && region !== '__ALL__' && task.serviceRegion !== region) return false;

    if (!hasDateFilter) return true;

    const rawDate = task.requestDate;
    if (!rawDate || String(rawDate).trim() === '') return true;

    const taskDate = parseTaskDate(rawDate);
    if (!taskDate) return true;
    if (fromDate && taskDate < fromDate) return false;
    if (toDate && taskDate > toDate) return false;
    return true;
  });
}

function collectAttachments(task, workFiles) {
  const items = [];

  const contractUrl = getContractFileUrl(task.contractFile);
  if (contractUrl) {
    const name = task.contractNumber
      ? `договір_${task.contractNumber}${contractUrl.includes('.doc') ? '' : ''}`
      : 'договір';
    items.push({ url: contractUrl, name, prefix: 'договір' });
  }

  if (task.invoiceFile) {
    items.push({
      url: task.invoiceFile,
      name: task.invoiceFileName || 'рахунок',
      prefix: 'рахунок',
    });
  }

  if (task.actFile) {
    items.push({
      url: task.actFile,
      name: task.actFileName || 'акт_виконаних_робіт',
      prefix: 'акт',
    });
  }

  for (const f of workFiles || []) {
    if (f?.cloudinaryUrl) {
      items.push({
        url: f.cloudinaryUrl,
        name: f.originalName || 'файл_робіт',
        prefix: 'роботи',
      });
    }
  }

  return items;
}

async function fetchWorkFiles(taskId, token) {
  try {
    const res = await fetch(`${API_BASE_URL}/files/task/${taskId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function getServerDateFromResponse(response) {
  const dateHeader = response.headers.get('Date');
  if (dateHeader) {
    const d = new Date(dateHeader);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function fetchAllTasks(token) {
  const response = await fetch(`${API_BASE_URL}/tasks/filter?filter=all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Помилка завантаження заявок');
  const data = await response.json();
  const serverDate = getServerDateFromResponse(response);
  const tasks = Array.isArray(data) ? data : (data.tasks || []);
  return { tasks, serverDate };
}

const STATUS_LABELS = {
  __ALL__: 'Усі статуси',
  'Заявка': 'Заявка',
  'В роботі': 'В роботі',
  'Виконано': 'Виконано',
  'Заблоковано': 'Заблоковано',
};

function formatFilterDateLabel(value) {
  if (!value) return 'не обрано';
  return formatUkDate(value) || value;
}

export function buildExportCriteriaText({ filters, serverDate, count, exportedBy }) {
  const { dateFrom, dateTo, region, status } = filters;
  const exportTime = serverDate.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const lines = [
    '═══════════════════════════════════════════',
    '         КРИТЕРІЇ ЕКСПОРТУ ЗАЯВОК',
    '═══════════════════════════════════════════',
    '',
    `Дата та час експорту (сервер): ${exportTime}`,
    exportedBy ? `Виконав: ${exportedBy}` : null,
    '',
    '─── Фільтри ───',
    '',
    `Дата заявки від:     ${formatFilterDateLabel(dateFrom)}`,
    `Дата заявки до:      ${formatFilterDateLabel(dateTo)}`,
    `Регіон:              ${region && region !== '__ALL__' ? region : 'Усі регіони'}`,
    `Статус заявки:       ${STATUS_LABELS[status] || status || 'Усі статуси'}`,
    '',
    '─── Примітки ───',
    '',
    '• Заявки з порожньою датою заявки включаються в експорт,',
    '  якщо обрано фільтр за датою.',
    '',
    `• Експортовано заявок: ${count ?? 0}`,
    '',
    '═══════════════════════════════════════════',
  ];

  return lines.filter((line) => line !== null).join('\r\n');
}

export async function exportTasksToLocalFolder({
  tasks,
  rootDirHandle,
  serverDate,
  onProgress,
  token,
  filters,
  exportedBy,
}) {
  const exportFolderName = sanitizeNameForLocalSave(
    `Експорт ${formatUkDate(serverDate.toISOString())}`,
    { isFolder: true }
  );
  const exportDir = await rootDirHandle.getDirectoryHandle(exportFolderName, { create: true });

  const criteriaText = buildExportCriteriaText({
    filters: filters || {},
    serverDate,
    count: tasks.length,
    exportedBy,
  });
  const criteriaBlob = new Blob([criteriaText], { type: 'text/plain;charset=utf-8' });
  await writeBlobToDir(exportDir, 'критерії_експорту.txt', criteriaBlob, new Map());

  const regionDirs = new Map();
  const contractorDirs = new Map();

  let processed = 0;
  const total = tasks.length;

  for (const task of tasks) {
    processed += 1;
    onProgress?.({ processed, total, task: task.requestNumber || task._id });

    const regionName = String(task.serviceRegion || 'Без регіону').trim() || 'Без регіону';
    let regionDir = regionDirs.get(regionName);
    if (!regionDir) {
      regionDir = await getOrCreateSubdir(exportDir, regionName);
      regionDirs.set(regionName, regionDir);
    }

    const contractorKey = `${regionName}::${String(task.edrpou || '').trim() || String(task.client || '').trim()}`;
    let contractorDir = contractorDirs.get(contractorKey);
    if (!contractorDir) {
      contractorDir = await getOrCreateSubdir(regionDir, getContractorFolderName(task));
      contractorDirs.set(contractorKey, contractorDir);
    }

    const taskDir = await getOrCreateSubdir(contractorDir, getTaskFolderName(task));
    const usedNames = new Map();

    const pdfBlob = await generateTaskPdfBlob(task);
    await writeBlobToDir(taskDir, `заявка_${task.requestNumber || 'без_номера'}.pdf`, pdfBlob, usedNames);

    const taskId = task._id || task.id;
    const workFiles = taskId ? await fetchWorkFiles(taskId, token) : [];
    const attachments = collectAttachments(task, workFiles);

    for (const att of attachments) {
      try {
        const blob = await downloadUrlAsBlob(att.url);
        await writeBlobToDir(taskDir, att.name, blob, usedNames);
      } catch (err) {
        console.warn('[export] attachment failed:', att.url, err);
      }
    }
  }

  return { exportFolderName, count: tasks.length };
}
