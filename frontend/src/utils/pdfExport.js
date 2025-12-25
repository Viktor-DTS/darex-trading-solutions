import jsPDF from 'jspdf';

// Експорт звіту про залишки на складах в PDF
export const exportStockReportToPDF = (equipment, warehouseName = 'Всі склади') => {
  const doc = new jsPDF();
  
  // Заголовок
  doc.setFontSize(18);
  doc.text('Звіт про залишки на складах', 14, 20);
  
  doc.setFontSize(12);
  doc.text(`Склад: ${warehouseName}`, 14, 30);
  doc.text(`Дата формування: ${new Date().toLocaleDateString('uk-UA')}`, 14, 36);
  
  // Таблиця
  let y = 50;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const rowHeight = 8;
  
  // Заголовки таблиці
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Тип', margin, y);
  doc.text('Серійний номер', margin + 40, y);
  doc.text('Склад', margin + 90, y);
  doc.text('Кількість', margin + 130, y);
  doc.text('Статус', margin + 160, y);
  
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
    doc.text(item.currentWarehouseName || '—', margin + 90, y);
    doc.text(String(item.quantity || 1), margin + 130, y);
    doc.text(item.status || '—', margin + 160, y);
    
    y += rowHeight;
  });
  
  // Підсумок
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Всього позицій: ${equipment.length}`, margin, y);
  
  doc.save(`Залишки_на_складах_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Експорт звіту про рух товарів в PDF
export const exportMovementReportToPDF = (documents, dateFrom, dateTo) => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('Звіт про рух товарів', 14, 20);
  
  doc.setFontSize(12);
  if (dateFrom && dateTo) {
    doc.text(`Період: ${dateFrom} - ${dateTo}`, 14, 30);
  }
  doc.text(`Дата формування: ${new Date().toLocaleDateString('uk-UA')}`, 14, 36);
  
  let y = 50;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const rowHeight = 8;
  
  // Заголовки
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Номер', margin, y);
  doc.text('Дата', margin + 30, y);
  doc.text('Зі складу', margin + 60, y);
  doc.text('На склад', margin + 110, y);
  doc.text('Позицій', margin + 150, y);
  doc.text('Статус', margin + 170, y);
  
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
    doc.text(docItem.fromWarehouseName || '—', margin + 60, y);
    doc.text(docItem.toWarehouseName || '—', margin + 110, y);
    doc.text(String(docItem.items?.length || 0), margin + 150, y);
    doc.text(docItem.status || '—', margin + 170, y);
    
    y += rowHeight;
  });
  
  // Підсумок
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Всього документів: ${documents.length}`, margin, y);
  
  doc.save(`Рух_товарів_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Експорт вартісного звіту в PDF
export const exportCostReportToPDF = (costData) => {
  const doc = new jsPDF();
  
  doc.setFontSize(18);
  doc.text('Вартісний звіт', 14, 20);
  
  doc.setFontSize(12);
  doc.text(`Метод: ${costData.method === 'average' ? 'Середня собівартість' : costData.method === 'fifo' ? 'FIFO' : 'LIFO'}`, 14, 30);
  doc.text(`Склад: ${costData.warehouse}`, 14, 36);
  doc.text(`Дата формування: ${new Date().toLocaleDateString('uk-UA')}`, 14, 42);
  
  let y = 55;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 14;
  const rowHeight = 8;
  
  // Заголовки
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Тип обладнання', margin, y);
  doc.text('Кількість', margin + 80, y);
  doc.text('Вартість', margin + 120, y);
  
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
    doc.text(`${(group.totalCost || 0).toFixed(2)} ${costData.summary?.currency || 'грн.'}`, margin + 120, y);
    
    y += rowHeight;
  });
  
  // Підсумок
  y += 5;
  doc.setLineWidth(0.5);
  doc.line(margin, y, 200 - margin, y);
  y += 8;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Всього типів: ${costData.summary?.totalTypes || 0}`, margin, y);
  y += 6;
  doc.text(`Всього одиниць: ${costData.summary?.totalQuantity || 0}`, margin, y);
  y += 6;
  doc.text(`Загальна вартість: ${(costData.summary?.totalCost || 0).toFixed(2)} ${costData.summary?.currency || 'грн.'}`, margin, y);
  
  doc.save(`Вартісний_звіт_${costData.method}_${new Date().toISOString().split('T')[0]}.pdf`);
};

