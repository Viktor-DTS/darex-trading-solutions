const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

const UNICODE_FS_UNSAFE = /[\uFF1A\uFE55\uFE56\uFE57\u2236\u204F\u034F\u2028\u2029\u0000]/g;

export function extensionFromMimetype(mimetype) {
  if (!mimetype) return '';
  const m = String(mimetype).toLowerCase();
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt',
  };
  if (map[m]) return map[m];
  if (m.startsWith('image/')) {
    const sub = m.split('/')[1];
    if (sub === 'jpeg') return '.jpg';
    return sub ? `.${sub.replace(/[^a-z0-9]/gi, '')}` : '';
  }
  return '';
}

function isGetFileHandleNameRejected(err) {
  const msg = String(err?.message || '');
  return err instanceof TypeError && /Name is not allowed|getFileHandle/i.test(msg);
}

/** Імена для FileSystemDirectoryHandle — сумісність з Windows / Chromium. */
export function sanitizeNameForLocalSave(name, { isFolder = false } = {}) {
  if (name == null || typeof name !== 'string') return isFolder ? 'папка' : 'file';
  let base = name.replace(/^.*[/\\]/, '');
  base = base.replace(/[\u0000-\u001F\\/:*?"<>|]/g, '_');
  base = base.replace(UNICODE_FS_UNSAFE, '_');
  base = base.replace(/[\u200B-\u200D\uFEFF]/g, '');

  if (isFolder) {
    base = base.trim().replace(/^[\s.]+/, '');
    while (/[.\s\u00A0\u202F]$/.test(base)) base = base.slice(0, -1);
    base = base.replace(/\s{2,}/g, ' ').trim();
    if (!base || base === '.' || base === '..') base = 'папка';
  } else {
    const lastDot = base.lastIndexOf('.');
    const extCandidate = lastDot > 0 ? base.slice(lastDot + 1) : '';
    const hasReasonableExt =
      lastDot > 0 &&
      lastDot < base.length - 1 &&
      /^[\w-]{1,24}$/i.test(extCandidate);

    let stem;
    let ext;
    if (hasReasonableExt) {
      stem = base.slice(0, lastDot);
      ext = base.slice(lastDot);
    } else {
      stem = base;
      ext = '';
    }

    stem = stem.trim().replace(/^\.+/, '');
    while (/[.\s\u00A0\u202F]$/.test(stem)) stem = stem.slice(0, -1);

    if (stem) base = stem + ext;
    else if (ext && hasReasonableExt) base = `file${ext}`;
    else base = stem + ext || 'file';

    base = base.replace(/[\s.]+$/g, '').trim();
    if (/^\./.test(base)) base = `file${base}`;
    if (!base) base = 'file';
  }

  if (base.length > 200) base = base.slice(0, 200);

  const stemForReserve = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  if (stemForReserve && WINDOWS_RESERVED_NAMES.has(stemForReserve.toUpperCase())) {
    base = `_${base}`;
  }
  return base || (isFolder ? 'папка' : 'file');
}

function isGetDirectoryHandleNameRejected(err) {
  const msg = String(err?.message || '');
  return err instanceof TypeError && /Name is not allowed|getDirectoryHandle|getFileHandle/i.test(msg);
}

/** Додаткова очистка імен папок для Windows / File System Access API. */
export function sanitizeFolderNameForLocalSave(name) {
  let base = sanitizeNameForLocalSave(name, { isFolder: true });
  base = base.replace(/[\u0000-\u001F]/g, '_').replace(UNICODE_FS_UNSAFE, '_');
  base = base.trim().replace(/^[\s.]+/, '');
  while (/[.\s\u00A0\u202F]$/.test(base)) base = base.slice(0, -1);
  base = base.replace(/\s{2,}/g, ' ').trim();
  if (!base || base === '.' || base === '..') base = 'папка';
  if (base.length > 180) {
    base = base.slice(0, 180).trim().replace(/[.\s\u00A0\u202F]+$/g, '');
  }
  const headToken = base.split(/[\s._-]/)[0]?.toUpperCase();
  if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase()) || (headToken && WINDOWS_RESERVED_NAMES.has(headToken))) {
    base = `_${base}`;
  }
  return base || 'папка';
}

function buildFolderNameFallback(rawName, bump = 0) {
  const slug = String(rawName || 'folder')
    .replace(/[\u0000-\u001F\\/:*?"<>|]/g, '_')
    .replace(/[^\w\u0400-\u04FF.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  const edrpou = String(rawName || '').match(/\d{8,10}/)?.[0];
  if (edrpou) return bump ? `${edrpou}_${bump}` : edrpou;
  const base = slug || 'folder';
  return bump ? `${base}_${bump}` : base;
}

export async function getOrCreateSubdir(parentHandle, folderName, usedNames = new Map()) {
  const primary = sanitizeFolderNameForLocalSave(folderName);
  const candidates = [primary];
  const edrpouOnly = String(folderName || '').trim().match(/^(\d{8,10})\b/)?.[1];
  if (edrpouOnly && edrpouOnly !== primary) candidates.push(edrpouOnly);
  const asciiFallback = buildFolderNameFallback(folderName);
  if (!candidates.includes(asciiFallback)) candidates.push(asciiFallback);

  let lastError = null;
  for (const candidate of candidates) {
    let name = candidate;
    const seen = usedNames.get(name) || 0;
    if (seen > 0) name = `${name}_${seen + 1}`;
    try {
      const handle = await parentHandle.getDirectoryHandle(name, { create: true });
      usedNames.set(candidate, seen + 1);
      return handle;
    } catch (err) {
      lastError = err;
      if (!isGetDirectoryHandleNameRejected(err)) throw err;
    }
  }

  for (let bump = 1; bump <= 5; bump += 1) {
    const name = buildFolderNameFallback(folderName, bump);
    try {
      return await parentHandle.getDirectoryHandle(name, { create: true });
    } catch (err) {
      lastError = err;
      if (!isGetDirectoryHandleNameRejected(err)) throw err;
    }
  }

  const lastResort = `folder_${Date.now()}`;
  try {
    return await parentHandle.getDirectoryHandle(lastResort, { create: true });
  } catch (err) {
    throw lastError || err;
  }
}

export async function writeBlobToDir(dirHandle, fileName, blob, usedNames = new Map()) {
  let name = sanitizeNameForLocalSave(fileName);
  const count = (usedNames.get(name) || 0) + 1;
  usedNames.set(name, count);
  if (count > 1) {
    const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    const base = ext ? name.slice(0, -ext.length) : name;
    name = ext ? `${base}_${count}${ext}` : `${base}_${count}`;
  }

  const writeWithName = async (n) => {
    const fileHandle = await dirHandle.getFileHandle(n, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
  };

  try {
    await writeWithName(name);
  } catch (e) {
    if (!isGetFileHandleNameRejected(e)) throw e;
    const extFallback = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
    let fallback = `file_${Date.now()}${extFallback || ''}`;
    let bump = 0;
    while (usedNames.has(fallback)) {
      bump += 1;
      fallback = `file_${Date.now()}_${bump}${extFallback || ''}`;
    }
    usedNames.set(fallback, 1);
    await writeWithName(fallback);
  }
}

export async function downloadUrlAsBlob(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

export function formatUkDateForFolder(value) {
  const formatted = formatUkDate(value);
  return formatted ? formatted.replace(/\./g, '-') : 'без_дати';
}

export function formatUkDate(value) {
  if (!value) return '';
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}.${m}.${y}`;
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

export function parseTaskDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return new Date(y, m - 1, d);
  }
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy.map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toDateOnlyMs(value) {
  const d = parseTaskDate(value);
  if (!d) return null;
  return d.getTime();
}

export function parseFilterDateInput(value, endOfDay = false) {
  if (!value) return null;
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    const date = new Date(y, m - 1, d);
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return date;
  }
  return null;
}
