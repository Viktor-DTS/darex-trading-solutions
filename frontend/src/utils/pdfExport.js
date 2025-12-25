// Функція для конвертації кирилиці в латиницю для jsPDF
const transliterate = (text) => {
  if (!text) return '';
  const cyrillicToLatin = {
    'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Є': 'Ye', 'Ж': 'Zh',
    'З': 'Z', 'И': 'Y', 'І': 'I', 'Ї': 'Yi', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
    'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F',
    'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch', 'Ь': '', 'Ю': 'Yu', 'Я': 'Ya',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh',
    'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
    'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'yu', 'я': 'ya'
  };
  
  return text.split('').map(char => cyrillicToLatin[char] || char).join('');
};

// Експорт звіту про залишки на складах в PDF
export const exportStockReportToPDF = async (equipment, warehouseName = 'Всі склади') => {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  
  // Заголовок
  doc.setFontSize(18);
  doc.text(transliterate('Звіт про залишки на складах'), 14, 20);
  
  doc.setFontSize(12);
  doc.text(transliterate(`Склад: ${warehouseName}`), 14, 30);
  doc.text(`Data formuvannya: ${new Date().toLocaleDateString('uk-UA')}`, 14, 36);
  
  // Таблиця
  let y = 50;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const rowHeight = 8;
  
  // Заголовки таблиці
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(transliterate('Тип'), margin, y);
  doc.text(transliterate('Серійний номер'), margin + 40, y);
  doc.text(transliterate('Склад'), margin + 90, y);
  doc.text(transliterate('Кількість'), margin + 130, y);
  doc.text(transliterate('Статус'), margin + 160, y);
  
  y += rowHeight;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 5;
  
  // Дані
  doc.setFont(undefined, 'normal');
  equipment.forEach((item, index) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(9);
    doc.text(item.type || '—', margin, y);
    doc.text(item.serialNumber || '—', margin + 40, y);
    doc.text(transliterate(item.currentWarehouseName || '—'), margin + 90, y);
    doc.text(String(item.quantity || 1), margin + 130, y);
    doc.text(transliterate(item.status || '—'), margin + 160, y);
    
    y += rowHeight;
  });
  
  // Підсумок
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(transliterate(`Всього позицій: ${equipment.length}`), margin, y);
  
  doc.save(`Zalyshky_na_skladakh_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Експорт звіту про рух товарів в PDF
export const exportMovementReportToPDF = async (documents, dateFrom, dateTo) => {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  
  // Використовуємо transliterate для кирилиці
  doc.setFontSize(18);
  doc.text(transliterate('Звіт про рух товарів'), 14, 20);
  
  doc.setFontSize(12);
  if (dateFrom && dateTo) {
    doc.text(`Period: ${dateFrom} - ${dateTo}`, 14, 30);
  }
  doc.text(`Data formuvannya: ${new Date().toLocaleDateString('uk-UA')}`, 14, 36);
  
  let y = 50;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const rowHeight = 8;
  
  // Заголовки
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(transliterate('Номер'), margin, y);
  doc.text(transliterate('Дата'), margin + 30, y);
  doc.text(transliterate('Зі складу'), margin + 60, y);
  doc.text(transliterate('На склад'), margin + 110, y);
  doc.text(transliterate('Позицій'), margin + 150, y);
  doc.text(transliterate('Статус'), margin + 170, y);
  
  y += rowHeight;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 5;
  
  // Дані
  doc.setFont(undefined, 'normal');
  documents.forEach((docItem) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(9);
    doc.text(docItem.documentNumber || '—', margin, y);
    doc.text(new Date(docItem.documentDate).toLocaleDateString('uk-UA'), margin + 30, y);
    doc.text(transliterate(docItem.fromWarehouseName || '—'), margin + 60, y);
    doc.text(transliterate(docItem.toWarehouseName || '—'), margin + 110, y);
    doc.text(String(docItem.items?.length || 0), margin + 150, y);
    doc.text(transliterate(docItem.status || '—'), margin + 170, y);
    
    y += rowHeight;
  });
  
  // Підсумок
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(transliterate(`Всього документів: ${documents.length}`), margin, y);
  
  doc.save(`Rukh_tovariv_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Експорт вартісного звіту в PDF
export const exportCostReportToPDF = async (costData) => {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text(transliterate('Вартісний звіт'), 14, 20);
  
  doc.setFontSize(12);
  const methodText = costData.method === 'average' ? 'Serednya sobivartist' : costData.method === 'fifo' ? 'FIFO' : 'LIFO';
  doc.text(`Method: ${methodText}`, 14, 30);
  doc.text(transliterate(`Склад: ${costData.warehouse || 'Vsi sklady'}`), 14, 36);
  doc.text(`Data formuvannya: ${new Date().toLocaleDateString('uk-UA')}`, 14, 42);
  
  let y = 55;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const rowHeight = 8;
  
  // Заголовки
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(transliterate('Тип обладнання'), margin, y);
  doc.text(transliterate('Кількість'), margin + 80, y);
  doc.text(transliterate('Вартість'), margin + 120, y);
  
  y += rowHeight;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 5;
  
  // Дані
  doc.setFont(undefined, 'normal');
  costData.groups.forEach((group) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFontSize(9);
    doc.text(group.type || '—', margin, y);
    doc.text(String(group.totalQuantity || 0), margin + 80, y);
    const currency = costData.summary?.currency || 'hrn.';
    doc.text(`${(group.totalCost || 0).toFixed(2)} ${transliterate(currency)}`, margin + 120, y);
    
    y += rowHeight;
  });
  
  // Підсумок
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(transliterate(`Всього типів: ${costData.summary?.totalTypes || 0}`), margin, y);
  y += 6;
  doc.text(transliterate(`Всього одиниць: ${costData.summary?.totalQuantity || 0}`), margin, y);
  y += 6;
  doc.text(transliterate(`Загальна вартість: ${(costData.summary?.totalCost || 0).toFixed(2)} ${currency}`), margin, y);
  
  doc.save(`Vartistnyi_zvit_${costData.method}_${new Date().toISOString().split('T')[0]}.pdf`);
};

