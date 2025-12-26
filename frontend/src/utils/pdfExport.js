// Функція для створення PDF з підтримкою кирилиці через HTML та window.print()
// Це забезпечує коректне відображення кирилиці, оскільки браузер нативно підтримує UTF-8
const createPDFFromHTML = (htmlContent, filename) => {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${filename}</title>
      <style>
        @media print {
          @page {
            size: A4;
            margin: 1cm;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
        body {
          font-family: 'Arial', 'Helvetica', sans-serif;
          font-size: 12px;
          color: #000;
          padding: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f2f2f2;
          font-weight: bold;
        }
        h1 {
          font-size: 18px;
          margin-bottom: 10px;
        }
        h2 {
          font-size: 14px;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        tfoot td {
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `);
  printWindow.document.close();
  
  // Затримка перед друком для завантаження стилів
  setTimeout(() => {
    printWindow.print();
  }, 250);
};

// Експорт звіту про залишки на складах в PDF
export const exportStockReportToPDF = async (equipment, warehouseName = 'Всі склади') => {
  const htmlContent = `
    <h1>Звіт про залишки на складах</h1>
    <p><strong>Склад:</strong> ${warehouseName}</p>
    <p><strong>Дата формування:</strong> ${new Date().toLocaleDateString('uk-UA')}</p>
    <table>
      <thead>
        <tr>
          <th>Тип</th>
          <th>Серійний номер</th>
          <th>Склад</th>
          <th>Кількість</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${equipment.map(item => `
          <tr>
            <td>${item.type || '—'}</td>
            <td>${item.serialNumber || '—'}</td>
            <td>${item.currentWarehouseName || '—'}</td>
            <td>${item.quantity || 1}</td>
            <td>${item.status || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align: right; font-weight: bold;">Всього позицій:</td>
          <td style="font-weight: bold;">${equipment.length}</td>
        </tr>
      </tfoot>
    </table>
  `;
  
  createPDFFromHTML(htmlContent, `Залишки_на_складах_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Експорт звіту про рух товарів в PDF
export const exportMovementReportToPDF = async (documents, dateFrom, dateTo) => {
  const getStatusLabel = (status) => {
    const labels = {
      'in_stock': 'На складі',
      'in_transit': 'В дорозі',
      'shipped': 'Відвантажено замовнику',
      'written_off': 'Списано',
      'deleted': 'Видалено',
      'reserved': 'Зарезервовано'
    };
    return labels[status] || status || '—';
  };

  const formatDateTime = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleString('uk-UA', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Створюємо рядки для таблиці - по одному на кожен item
  const tableRows = [];
  documents.forEach(docItem => {
    if (docItem.items && docItem.items.length > 0) {
      docItem.items.forEach((item, itemIndex) => {
        tableRows.push(`
          <tr>
            <td>${itemIndex === 0 ? (docItem.documentNumber || '—') : ''}</td>
            <td>${itemIndex === 0 ? formatDateTime(docItem.documentDate) : ''}</td>
            <td>${itemIndex === 0 ? (docItem.fromWarehouseName || '—') : ''}</td>
            <td>${itemIndex === 0 ? (docItem.toWarehouseName || '—') : ''}</td>
            <td>${item.type || '—'}</td>
            <td>${item.quantity || 1}</td>
            <td>${itemIndex === 0 ? (docItem.createdByName || '—') : ''}</td>
            <td>${itemIndex === 0 ? (docItem.receivedByName || '—') : ''}</td>
            <td>${getStatusLabel(item.equipmentStatus || docItem.status)}</td>
          </tr>
        `);
      });
    } else {
      // Якщо немає items, показуємо хоча б основну інформацію
      tableRows.push(`
        <tr>
          <td>${docItem.documentNumber || '—'}</td>
          <td>${formatDateTime(docItem.documentDate)}</td>
          <td>${docItem.fromWarehouseName || '—'}</td>
          <td>${docItem.toWarehouseName || '—'}</td>
          <td>—</td>
          <td>0</td>
          <td>${docItem.createdByName || '—'}</td>
          <td>${docItem.receivedByName || '—'}</td>
          <td>${getStatusLabel(docItem.status)}</td>
        </tr>
      `);
    }
  });

  const htmlContent = `
    <style>
      table { border-collapse: collapse; width: 100%; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; font-weight: bold; }
      tr:nth-child(even) { background-color: #f9f9f9; }
    </style>
    <h1>Звіт про рух товарів</h1>
    ${dateFrom && dateTo ? `<p><strong>Період:</strong> ${dateFrom} - ${dateTo}</p>` : ''}
    <p><strong>Дата формування:</strong> ${new Date().toLocaleString('uk-UA')}</p>
    <table>
      <thead>
        <tr>
          <th>Номер</th>
          <th>Дата та час</th>
          <th>Зі складу</th>
          <th>На склад</th>
          <th>Обладнання</th>
          <th>Кількість</th>
          <th>Відправив</th>
          <th>Прийняв</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows.join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="8" style="text-align: right; font-weight: bold;">Всього документів:</td>
          <td style="font-weight: bold;">${documents.length}</td>
        </tr>
      </tfoot>
    </table>
  `;
  
  createPDFFromHTML(htmlContent, `Рух_товарів_${new Date().toISOString().split('T')[0]}.pdf`);
};

// Експорт вартісного звіту в PDF
export const exportCostReportToPDF = async (costData) => {
  const methodText = costData.method === 'average' ? 'Середня собівартість' : 
                     costData.method === 'fifo' ? 'FIFO (Перший прийшов - перший пішов)' : 
                     'LIFO (Останній прийшов - перший пішов)';
  const currency = costData.summary?.currency || 'грн.';
  
  const htmlContent = `
    <h1>Вартісний звіт</h1>
    <p><strong>Метод:</strong> ${methodText}</p>
    <p><strong>Склад:</strong> ${costData.warehouse || 'Всі склади'}</p>
    <p><strong>Дата формування:</strong> ${new Date().toLocaleDateString('uk-UA')}</p>
    <table>
      <thead>
        <tr>
          <th>Тип обладнання</th>
          <th>Кількість</th>
          <th>Вартість</th>
        </tr>
      </thead>
      <tbody>
        ${costData.groups.map(group => `
          <tr>
            <td>${group.type || '—'}</td>
            <td>${group.totalQuantity || 0}</td>
            <td>${(group.totalCost || 0).toFixed(2)} ${currency}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td style="font-weight: bold;">Всього типів: ${costData.summary?.totalTypes || 0}</td>
          <td style="font-weight: bold;">Всього одиниць: ${costData.summary?.totalQuantity || 0}</td>
          <td style="font-weight: bold;">Загальна вартість: ${(costData.summary?.totalCost || 0).toFixed(2)} ${currency}</td>
        </tr>
      </tfoot>
    </table>
  `;
  
  createPDFFromHTML(htmlContent, `Вартісний_звіт_${costData.method}_${new Date().toISOString().split('T')[0]}.pdf`);
};

