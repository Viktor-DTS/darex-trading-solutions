export function getDocumentKind(doc) {
  const title = String(doc?.title || '').toLowerCase();
  const format = String(doc?.format || '').toLowerCase();

  if (format.includes('pdf') || title.endsWith('.pdf')) return 'pdf';
  if (format.includes('wordprocessing') || title.endsWith('.docx')) return 'docx';
  if (format.includes('msword') || title.endsWith('.doc')) return 'doc';
  if (title.endsWith('.p7s') || title.endsWith('.sig')) return 'signature';
  if (format.includes('image') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(title)) return 'image';
  if (format.includes('spreadsheet') || title.endsWith('.xlsx') || title.endsWith('.xls')) return 'excel';
  return 'other';
}

export function canPreviewDocument(doc) {
  const kind = getDocumentKind(doc);
  return ['pdf', 'docx', 'doc', 'image'].includes(kind);
}

export function documentKindLabel(kind) {
  const map = {
    pdf: 'PDF',
    docx: 'Word',
    doc: 'Word',
    image: 'Зображення',
    excel: 'Excel',
    signature: 'Підпис',
    other: 'Файл',
  };
  return map[kind] || 'Файл';
}
