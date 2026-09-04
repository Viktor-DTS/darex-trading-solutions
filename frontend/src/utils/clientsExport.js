const ACTION_LABELS = {
  call: 'Дзвінок',
  meeting: 'Зустріч',
  email: 'Email',
  quote: 'Комерційна пропозиція',
  other: 'Інше',
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('uk-UA') : '');

export const exportClientsToExcel = async (clients, filename = 'clients') => {
  // Лінива загрузка ExcelJS — важка бібліотека вантажиться лише при експорті
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Клієнти');

  worksheet.columns = [
    { header: 'Назва', key: 'name', width: 34 },
    { header: 'ЄДРПОУ', key: 'edrpou', width: 14 },
    { header: 'Контактна особа', key: 'contactPerson', width: 22 },
    { header: 'Телефон', key: 'contactPhone', width: 18 },
    { header: 'Email', key: 'email', width: 24 },
    { header: 'Регіон', key: 'region', width: 18 },
    { header: 'Адреса', key: 'address', width: 34 },
    { header: 'Менеджер', key: 'manager', width: 22 },
    { header: 'Другий менеджер', key: 'manager2', width: 22 },
    { header: 'Угод усього', key: 'dealsTotal', width: 13 },
    { header: 'В роботі', key: 'dealsOpen', width: 11 },
    { header: 'Успішних', key: 'dealsWon', width: 11 },
    { header: 'Остання взаємодія', key: 'lastInteractionAt', width: 19 },
    { header: 'Наступний крок', key: 'nextActionAt', width: 17 },
    { header: 'Тип кроку', key: 'nextActionType', width: 20 },
    { header: 'Нотатка до кроку', key: 'nextActionNote', width: 34 },
    { header: 'Заповненість, %', key: 'completeness', width: 16 },
    { header: 'Створено', key: 'createdAt', width: 14 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  clients.forEach((c, index) => {
    const s = c.stats || {};
    const row = worksheet.addRow({
      name: c.name || '',
      edrpou: c.edrpou || '',
      contactPerson: c.contactPerson || '',
      contactPhone: c.contactPhone || '',
      email: c.email || '',
      region: c.region || '',
      address: c.address || '',
      manager: c.assignedManagerName || c.assignedManagerLogin || '',
      manager2: c.assignedManagerName2 || c.assignedManagerLogin2 || '',
      dealsTotal: s.dealsTotal ?? 0,
      dealsOpen: s.dealsOpen ?? 0,
      dealsWon: s.dealsWon ?? 0,
      lastInteractionAt: formatDate(s.lastInteractionAt),
      nextActionAt: formatDate(c.nextActionAt),
      nextActionType: c.nextActionAt ? (ACTION_LABELS[c.nextActionType] || '') : '',
      nextActionNote: c.nextActionNote || '',
      completeness: s.completeness ?? '',
      createdAt: formatDate(c.createdAt),
    });
    if (index % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    }
  });

  worksheet.autoFilter = { from: 'A1', to: { row: 1, column: worksheet.columns.length } };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
