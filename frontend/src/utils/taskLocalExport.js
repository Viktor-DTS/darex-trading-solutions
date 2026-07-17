import API_BASE_URL from '../config';
import { generateTaskPdfBlob } from './taskPdfExport';
import {
  downloadUrlAsBlob,
  formatUkDate,
  formatUkDateForFolder,
  getOrCreateSubdirResolved,
  sanitizeFolderNameForLocalSave,
  toDateOnlyMs,
  walkDirectoryPath,
  withFsRetry,
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
  const client = String(task.client || '').trim();
  if (edrpou) {
    return client ? `${edrpou} ${client}` : edrpou;
  }
  return client || 'Без замовника';
}

function getTaskFolderName(task) {
  const num = String(task.requestNumber || task._id || 'заявка').trim();
  const datePart = formatUkDateForFolder(task.requestDate);
  return `${num} ${datePart}`;
}

export function filterTasksForExport(tasks, { dateFrom, dateTo, regions, statuses }) {
  const fromMs = dateFrom ? toDateOnlyMs(dateFrom) : null;
  const toMs = dateTo ? toDateOnlyMs(dateTo) : null;
  const hasDateFilter = fromMs != null || toMs != null;
  const regionList = (Array.isArray(regions) ? regions : (regions ? [regions] : []))
    .map((r) => String(r).trim())
    .filter(Boolean);
  const statusList = (Array.isArray(statuses) ? statuses : (statuses ? [statuses] : []))
    .map((s) => String(s).trim())
    .filter(Boolean);

  return tasks.filter((task) => {
    const taskStatus = String(task.status || '').trim();
    if (statusList.length > 0 && !statusList.includes(taskStatus)) return false;

    const taskRegion = String(task.serviceRegion || '').trim();
    if (regionList.length > 0 && !regionList.includes(taskRegion)) return false;

    if (!hasDateFilter) return true;

    const rawDate = task.requestDate;
    if (!rawDate || String(rawDate).trim() === '') return true;

    const taskMs = toDateOnlyMs(rawDate);
    if (taskMs == null) return true;
    if (fromMs != null && taskMs < fromMs) return false;
    if (toMs != null && taskMs > toMs) return false;
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
  const response = await fetch(`${API_BASE_URL}/tasks`, {
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

function formatMultiFilterLabel(values, allLabel, labelMap = {}) {
  if (!Array.isArray(values) || values.length === 0) return allLabel;
  return values.map((v) => labelMap[v] || v).join(', ');
}

export function buildExportCriteriaText({ filters, serverDate, count, exportedBy }) {
  const { dateFrom, dateTo, regions, statuses } = filters;
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
    `Регіон:              ${formatMultiFilterLabel(regions, 'Усі регіони')}`,
    `Статус заявки:       ${formatMultiFilterLabel(statuses, 'Усі статуси', STATUS_LABELS)}`,
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
  signal,
}) {
  const exportFolderName = sanitizeFolderNameForLocalSave(
    `Експорт ${formatUkDateForFolder(serverDate.toISOString())}`
  );

  await withFsRetry(async () => {
    const exportDir = await rootDirHandle.getDirectoryHandle(exportFolderName, { create: true });
    const criteriaText = buildExportCriteriaText({
      filters: filters || {},
      serverDate,
      count: tasks.length,
      exportedBy,
    });
    const criteriaBlob = new Blob([criteriaText], { type: 'text/plain;charset=utf-8' });
    await writeBlobToDir(exportDir, 'критерії_експорту.txt', criteriaBlob, new Map());
  });

  if (signal?.aborted) {
    return { exportFolderName, count: 0, cancelled: true };
  }

  const regionSegmentNames = new Map();
  const contractorSegmentNames = new Map();

  let processed = 0;
  const total = tasks.length;

  const ensureRegionSegment = async (regionName) => {
    if (regionSegmentNames.has(regionName)) return regionSegmentNames.get(regionName);
    const exportDir = await rootDirHandle.getDirectoryHandle(exportFolderName, { create: true });
    const { resolvedName } = await getOrCreateSubdirResolved(exportDir, regionName);
    regionSegmentNames.set(regionName, resolvedName);
    return resolvedName;
  };

  const ensureContractorSegment = async (regionName, contractorKey, task) => {
    if (contractorSegmentNames.has(contractorKey)) return contractorSegmentNames.get(contractorKey);
    const regionSeg = await ensureRegionSegment(regionName);
    const exportDir = await rootDirHandle.getDirectoryHandle(exportFolderName, { create: true });
    const regionDir = await walkDirectoryPath(exportDir, [regionSeg]);
    const { resolvedName } = await getOrCreateSubdirResolved(
      regionDir,
      getContractorFolderName(task)
    );
    contractorSegmentNames.set(contractorKey, resolvedName);
    return resolvedName;
  };

  for (const task of tasks) {
    if (signal?.aborted) {
      return { exportFolderName, count: processed, cancelled: true };
    }

    processed += 1;
    onProgress?.({ processed, total, task: task.requestNumber || task._id });

    const regionName = String(task.serviceRegion || 'Без регіону').trim() || 'Без регіону';
    const contractorKey = `${regionName}::${String(task.edrpou || '').trim() || String(task.client || '').trim()}`;

    await withFsRetry(async () => {
      const regionSeg = await ensureRegionSegment(regionName);
      const contractorSeg = await ensureContractorSegment(regionName, contractorKey, task);
      const exportDir = await rootDirHandle.getDirectoryHandle(exportFolderName, { create: true });
      const taskDir = await walkDirectoryPath(
        exportDir,
        [regionSeg, contractorSeg, getTaskFolderName(task)]
      );

      const usedNames = new Map();
      const pdfBlob = await generateTaskPdfBlob(task);
      if (signal?.aborted) return;
      await writeBlobToDir(taskDir, `заявка_${task.requestNumber || 'без_номера'}.pdf`, pdfBlob, usedNames);

      const taskId = task._id || task.id;
      const workFiles = taskId ? await fetchWorkFiles(taskId, token) : [];
      const attachments = collectAttachments(task, workFiles);

      for (const att of attachments) {
        if (signal?.aborted) return;
        try {
          const blob = await downloadUrlAsBlob(att.url);
          await writeBlobToDir(taskDir, att.name, blob, usedNames);
        } catch (err) {
          console.warn('[export] attachment failed:', att.url, err);
        }
      }
    });

    if (signal?.aborted) {
      return { exportFolderName, count: processed - 1, cancelled: true };
    }
  }

  return { exportFolderName, count: tasks.length, cancelled: false };
}
