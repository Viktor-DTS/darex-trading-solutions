function getEquipmentStatusLabel(status) {
  const labels = {
    in_stock: 'На складі',
    reserved: 'Зарезервовано',
    pending_shipment: 'На відвантаженні',
    shipped: 'Відвантажено',
    in_transit: 'В дорозі',
    written_off: 'Списано',
    sold: 'Продано',
  };
  return labels[status] || status || '';
}

function getEquipmentBatchUnit(item) {
  if (item?.batchUnit && String(item.batchUnit).trim()) return String(item.batchUnit).trim();
  if (item?.unitOfMeasure && String(item.unitOfMeasure).trim()) return String(item.unitOfMeasure).trim();
  if (item?.batchItems?.length) {
    const row = item.batchItems.find(
      (b) => (b?.batchUnit && String(b.batchUnit).trim()) || (b?.unitOfMeasure && String(b.unitOfMeasure).trim())
    );
    if (row?.batchUnit && String(row.batchUnit).trim()) return String(row.batchUnit).trim();
    if (row?.unitOfMeasure && String(row.unitOfMeasure).trim()) return String(row.unitOfMeasure).trim();
  }
  return 'шт.';
}

function getEquipmentQuantityNumber(item) {
  if (item?.isGrouped && item.batchItems?.length) {
    const sum = item.batchItems.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
    if (sum > 0) return sum;
  }
  const q = Number(item?.quantity);
  if (Number.isFinite(q)) return Math.max(0, q);
  const st = item?.warehouseDisplayStatus || item?.status;
  if (st === 'written_off' || st === 'shipped' || st === 'sold') return 0;
  return 1;
}

export function printEquipmentStock(equipmentList, title = 'Залишки на складах') {
  const rows = (equipmentList || []).map((item) => ({
    type: item.type || '',
    serialNumber: item.serialNumber || '',
    manufacturer: item.manufacturer || '',
    warehouse: item.currentWarehouseName || item.currentWarehouse || '',
    quantity: getEquipmentQuantityNumber(item),
    unit: getEquipmentBatchUnit(item),
    status: getEquipmentStatusLabel(item.warehouseDisplayStatus || item.status),
  }));
  const escapeHtml = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html lang="uk"><head><meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .meta { font-size: 12px; margin-bottom: 12px; color: #444; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  @media print { body { margin: 8px; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">Дата друку: ${new Date().toLocaleString('uk-UA')} · Рядків: ${rows.length}</p>
<table>
  <thead><tr>
    <th>Тип</th><th>Кількість</th><th>Одиниця виміру</th><th>Серійний номер</th><th>Виробник</th><th>Склад</th><th>Статус</th>
  </tr></thead>
  <tbody>
    ${rows
      .map(
        (r) => `<tr>
      <td>${escapeHtml(r.type)}</td>
      <td>${escapeHtml(r.quantity)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td>${escapeHtml(r.serialNumber)}</td>
      <td>${escapeHtml(r.manufacturer)}</td>
      <td>${escapeHtml(r.warehouse)}</td>
      <td>${escapeHtml(r.status)}</td>
    </tr>`
      )
      .join('')}
  </tbody>
</table>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) {
    alert('Дозвольте спливаючі вікна для друку');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export const exportEquipmentToExcel = async (equipmentList, filename = 'equipment') => {
  // Лінива загрузка ExcelJS — важка бібліотека вантажиться лише при експорті
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Обладнання');

  // Заголовки
  worksheet.columns = [
    { header: 'Тип', key: 'type', width: 40 },
    { header: 'Кількість', key: 'quantity', width: 14 },
    { header: 'Одиниця виміру', key: 'unit', width: 18 },
    { header: 'Серійний номер', key: 'serialNumber', width: 20 },
    { header: 'Виробник', key: 'manufacturer', width: 15 },
    { header: 'Склад', key: 'warehouse', width: 32 },
    { header: 'Регіон', key: 'region', width: 15 },
    { header: 'Статус', key: 'status', width: 15 },
    { header: 'Резервна потужність', key: 'standbyPower', width: 20 },
    { header: 'Основна потужність', key: 'primePower', width: 20 },
    { header: 'Фази', key: 'phase', width: 10 },
    { header: 'Напруга', key: 'voltage', width: 15 },
    { header: 'Струм (A)', key: 'amperage', width: 12 },
    { header: 'RPM', key: 'rpm', width: 10 },
    { header: 'Частота (Hz)', key: 'frequency', width: 15 },
    { header: 'Розміри (мм)', key: 'dimensions', width: 20 },
    { header: 'Вага (кг)', key: 'weight', width: 12 },
    { header: 'Дата виробництва', key: 'manufactureDate', width: 18 },
    { header: 'Додано', key: 'addedAt', width: 20 },
    { header: 'Додав', key: 'addedBy', width: 20 }
  ];

  // Стилі для заголовків
  worksheet.getRow(1).font = { bold: true, size: 12 };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  worksheet.getRow(1).font = { ...worksheet.getRow(1).font, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  const getStatusLabel = getEquipmentStatusLabel;

  // Додаємо дані
  equipmentList.forEach((item, index) => {
    const row = worksheet.addRow({
      type: item.type || '',
      quantity: getEquipmentQuantityNumber(item),
      unit: getEquipmentBatchUnit(item),
      serialNumber: item.serialNumber || '',
      manufacturer: item.manufacturer || '',
      warehouse: item.currentWarehouseName || item.currentWarehouse || '',
      region: item.region || '',
      status: getStatusLabel(item.warehouseDisplayStatus || item.status),
      standbyPower: item.standbyPower || '',
      primePower: item.primePower || '',
      phase: item.phase || '',
      voltage: item.voltage || '',
      amperage: item.amperage || '',
      rpm: item.rpm || '',
      frequency: item.frequency || '',
      dimensions: item.dimensions || '',
      weight: item.weight || '',
      manufactureDate: item.manufactureDate || '',
      addedAt: item.addedAt ? new Date(item.addedAt).toLocaleString('uk-UA') : '',
      addedBy: item.addedByName || item.addedBy || ''
    });

    // Альтернативні кольори для рядків
    if (index % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
      };
    }
  });

  // Автоматичне налаштування ширини колонок
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeHeader: true }, (cell) => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = maxLength < 10 ? 10 : maxLength + 2;
  });

  // Заморожуємо перший рядок
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Генеруємо файл
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const exportEquipmentHistoryToExcel = async (equipment, filename = 'equipment_history') => {
  // Лінива загрузка ExcelJS — важка бібліотека вантажиться лише при експорті
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  
  // Аркуш з інформацією про обладнання
  const infoSheet = workbook.addWorksheet('Інформація');
  infoSheet.columns = [
    { header: 'Параметр', key: 'param', width: 25 },
    { header: 'Значення', key: 'value', width: 40 }
  ];
  
  infoSheet.getRow(1).font = { bold: true };
  infoSheet.addRow({ param: 'Тип', value: equipment.type || '' });
  infoSheet.addRow({ param: 'Серійний номер', value: equipment.serialNumber || '' });
  infoSheet.addRow({ param: 'Виробник', value: equipment.manufacturer || '' });
  infoSheet.addRow({ param: 'Поточний склад', value: equipment.currentWarehouseName || '' });
  infoSheet.addRow({ param: 'Статус', value: equipment.status || '' });
  
  // Аркуш з історією переміщень
  if (equipment.movementHistory && equipment.movementHistory.length > 0) {
    const movementsSheet = workbook.addWorksheet('Переміщення');
    movementsSheet.columns = [
      { header: 'Дата', key: 'date', width: 20 },
      { header: 'Зі складу', key: 'from', width: 25 },
      { header: 'На склад', key: 'to', width: 25 },
      { header: 'Перемістив', key: 'movedBy', width: 20 },
      { header: 'Причина', key: 'reason', width: 30 }
    ];
    
    movementsSheet.getRow(1).font = { bold: true };
    equipment.movementHistory.forEach(move => {
      movementsSheet.addRow({
        date: move.date ? new Date(move.date).toLocaleString('uk-UA') : '',
        from: move.fromWarehouseName || move.fromWarehouse || '',
        to: move.toWarehouseName || move.toWarehouse || '',
        movedBy: move.movedByName || move.movedBy || '',
        reason: move.reason || ''
      });
    });
  }
  
  // Аркуш з історією відвантажень
  if (equipment.shipmentHistory && equipment.shipmentHistory.length > 0) {
    const shipmentsSheet = workbook.addWorksheet('Відвантаження');
    shipmentsSheet.columns = [
      { header: 'Дата', key: 'date', width: 20 },
      { header: 'Замовник', key: 'shippedTo', width: 30 },
      { header: 'ЄДРПОУ', key: 'edrpou', width: 15 },
      { header: 'Номер замовлення', key: 'orderNumber', width: 20 },
      { header: 'Номер рахунку', key: 'invoiceNumber', width: 20 },
      { header: 'Відвантажив', key: 'shippedBy', width: 20 }
    ];
    
    shipmentsSheet.getRow(1).font = { bold: true };
    equipment.shipmentHistory.forEach(ship => {
      shipmentsSheet.addRow({
        date: ship.shippedDate ? new Date(ship.shippedDate).toLocaleString('uk-UA') : '',
        shippedTo: ship.shippedTo || '',
        edrpou: ship.clientEdrpou || '',
        orderNumber: ship.orderNumber || '',
        invoiceNumber: ship.invoiceNumber || '',
        shippedBy: ship.shippedByName || ship.shippedBy || ''
      });
    });
  }
  
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${equipment.serialNumber || 'unknown'}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

