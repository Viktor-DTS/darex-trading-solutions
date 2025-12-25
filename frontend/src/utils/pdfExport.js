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
  const htmlContent = `
    <h1>Звіт про рух товарів</h1>
    ${dateFrom && dateTo ? `<p><strong>Період:</strong> ${dateFrom} - ${dateTo}</p>` : ''}
    <p><strong>Дата формування:</strong> ${new Date().toLocaleDateString('uk-UA')}</p>
    <table>
      <thead>
        <tr>
          <th>Номер</th>
          <th>Дата</th>
          <th>Зі складу</th>
          <th>На склад</th>
          <th>Позицій</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${documents.map(docItem => `
          <tr>
            <td>${docItem.documentNumber || '—'}</td>
            <td>${new Date(docItem.documentDate).toLocaleDateString('uk-UA')}</td>
            <td>${docItem.fromWarehouseName || '—'}</td>
            <td>${docItem.toWarehouseName || '—'}</td>
            <td>${docItem.items?.length || 0}</td>
            <td>${docItem.status || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align: right; font-weight: bold;">Всього документів:</td>
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

