import API_BASE_URL from '../config';

/**
 * Генератор нарядів на виконання робіт
 * Повні шаблони з оригінального проекту
 */

const WO_TEMPLATE_IDS = {
  travelCity: 'wo_template_travel_city_uah',
  travelPerKm: 'wo_template_travel_per_km_uah',
  perDiem: 'wo_template_per_diem_uah',
  condComfort: 'wo_template_cond_comfort',
  condOutdoor: 'wo_template_cond_outdoor',
  condPrecip: 'wo_template_cond_precipitation',
  condBasement: 'wo_template_cond_basement',
  condAggressive: 'wo_template_cond_aggressive',
  condNight: 'wo_template_cond_night',
  condWeekend: 'wo_template_cond_weekend',
  condUrgent: 'wo_template_cond_urgent'
};

function roundH(n) {
  const x = typeof n === 'number' ? n : parseFloat(String(n).replace(',', '.'));
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function moneyDot2(n) {
  return roundH(n).toFixed(2);
}

function moneyComma2(n) {
  return moneyDot2(n).replace('.', ',');
}

function multStr(n) {
  return roundH(n).toFixed(1);
}

function defaultWorkOrderCoeffs() {
  return {
    travelCity: '650.00',
    travelPerKm: '15,00',
    perDiem: '600.00',
    mComfort: '1.0',
    mOutdoor: '1.1',
    mPrecip: '1.2',
    mBasement: '1.3',
    mAggressive: '1.4',
    mNight: '1.5',
    mWeekend: '1.6',
    mUrgent: '2.0'
  };
}

function workOrderCoeffsFromRows(rows) {
  const m = {};
  for (const r of rows || []) {
    if (r && r.id != null) m[r.id] = r.value;
  }
  const num = (id, fallback) => {
    const raw = m[id];
    const v = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
    if (Number.isFinite(v)) return v;
    return fallback;
  };
  return {
    travelCity: moneyDot2(num(WO_TEMPLATE_IDS.travelCity, 650)),
    travelPerKm: moneyComma2(num(WO_TEMPLATE_IDS.travelPerKm, 15)),
    perDiem: moneyDot2(num(WO_TEMPLATE_IDS.perDiem, 600)),
    mComfort: multStr(num(WO_TEMPLATE_IDS.condComfort, 1.0)),
    mOutdoor: multStr(num(WO_TEMPLATE_IDS.condOutdoor, 1.1)),
    mPrecip: multStr(num(WO_TEMPLATE_IDS.condPrecip, 1.2)),
    mBasement: multStr(num(WO_TEMPLATE_IDS.condBasement, 1.3)),
    mAggressive: multStr(num(WO_TEMPLATE_IDS.condAggressive, 1.4)),
    mNight: multStr(num(WO_TEMPLATE_IDS.condNight, 1.5)),
    mWeekend: multStr(num(WO_TEMPLATE_IDS.condWeekend, 1.6)),
    mUrgent: multStr(num(WO_TEMPLATE_IDS.condUrgent, 2.0))
  };
}

async function fetchWorkOrderCoeffsForTemplate() {
  try {
    const token =
      typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    const res = await fetch(`${API_BASE_URL}/global-calculation-coefficients`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) return defaultWorkOrderCoeffs();
    const data = await res.json();
    const list = data?.service?.rows;
    return workOrderCoeffsFromRows(Array.isArray(list) ? list : []);
  } catch (e) {
    console.warn('[workOrder] коефіцієнти шаблону: fallback', e);
    return defaultWorkOrderCoeffs();
  }
}

// Функція для генерації наряду
export const generateWorkOrder = async (task) => {
  // Формуємо дані для наряду
  const workOrderData = {
    client: task.client || '',
    address: task.address || '',
    equipment: task.equipment || task.equipmentType || '',
    serialNumber: task.equipmentSerial || task.serialNumber || '',
    engineer1: task.engineer1 || '',
    engineer2: task.engineer2 || '',
    engineer3: task.engineer3 || '',
    engineer4: task.engineer4 || '',
    engineer5: task.engineer5 || '',
    engineer6: task.engineer6 || '',
    requestDate: task.requestDate || '',
    workDescription: task.requestDesc || task.work || '',
    workType: task.workType || 'ремонт',
    technicalCondition: task.technicalCondition || '',
    operatingHours: task.operatingHours || '',
    performedWork: task.performedWork || '',
    testResults: task.testResults || '',
    materialsCost: task.materialsCost || '',
    defectCost: task.defectCost || '',
    repairCost: task.repairCost || '',
    travelCost: task.travelCost || '',
    totalCost: task.totalCost || '',
    paymentMethod: task.paymentType || '',
    recommendations: task.recommendations || '',
    requestNumber: task.requestNumber || '',
    workDate: task.date || '',
    engineModel: task.engineModel || '',
    engineSerial: task.engineSerial || '',
    edrpou: task.edrpou || '',
    requestDesc: task.requestDesc || '',
    contactPerson: task.contactPerson || '',
    contactPhone: task.contactPhone || '',
    // Матеріали для автозаповнення п. 6.1 (перелік матеріалів)
    oilType: (task.oilType || '').toString().trim(),
    filterName: (task.filterName || '').toString().trim(),
    fuelFilterName: (task.fuelFilterName || '').toString().trim(),
    airFilterName: (task.airFilterName || '').toString().trim(),
    antifreezeType: (task.antifreezeType || '').toString().trim()
  };

  // Перевіряємо умову для номера наряду
  const hasRequestNumber = task.requestNumber && task.requestNumber.trim() !== '';
  const hasWorkDate = task.date && task.date.trim() !== '';
  const workOrderNumber = hasRequestNumber ? task.requestNumber : '____';
  
  // Форматуємо дату для шаблону
  let formattedDate = { day: '___', month: '________', year: '202____' };
  if (hasWorkDate) {
    try {
      let dateObj;
      const dateStr = task.date.trim();
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        dateObj = new Date(year, month - 1, day);
      } else {
        dateObj = new Date(dateStr);
      }
      
      if (!isNaN(dateObj.getTime())) {
        const day = dateObj.getDate().toString().padStart(2, '0');
        const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 
                       'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
        const month = months[dateObj.getMonth()];
        const year = dateObj.getFullYear();
        formattedDate = { day, month, year };
      }
    } catch (e) {
      console.error('Помилка форматування дати:', e);
    }
  }

  // Формуємо список інженерів
  const engineers = [
    workOrderData.engineer1,
    workOrderData.engineer2,
    workOrderData.engineer3,
    workOrderData.engineer4,
    workOrderData.engineer5,
    workOrderData.engineer6
  ].filter(eng => eng && eng.trim() !== '').join(', ');

  // Визначаємо компанію та вибираємо відповідний шаблон
  const company = task.company || '';
  const woCoeffs = await fetchWorkOrderCoeffsForTemplate();

  if (company === 'ДТС' || company === 'Дарекс Трейдінг Солюшнс') {
    const htmlContent = generateDTSTemplate(
      workOrderData,
      workOrderNumber,
      formattedDate,
      engineers,
      woCoeffs
    );
    openWorkOrderInNewWindow(htmlContent);
  } else {
    const htmlContent = generateDarexEnergyTemplate(
      workOrderData,
      workOrderNumber,
      formattedDate,
      engineers,
      woCoeffs
    );
    openWorkOrderInNewWindow(htmlContent);
  }
};

// Відкриваємо наряд в новому вікні
const openWorkOrderInNewWindow = (htmlContent) => {
  try {
    const newWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes,resizable=yes');
    if (newWindow) {
      newWindow.document.open();
      newWindow.document.write(htmlContent);
      newWindow.document.close();
    }
  } catch (error) {
    console.error('Помилка створення документа:', error);
    alert('Помилка створення документа. Перевірте консоль для деталей.');
  }
};

// Рядки таблиці 6.1 (перелік матеріалів): автозаповнення Найменування у форматі "назва поля - значення поля"
const buildMaterialsTableRows = (data) => {
  const items = [
    { label: 'Тип оливи', value: (data.oilType || '').toString().trim() },
    { label: 'Масляний фільтр: Назва', value: (data.filterName || '').toString().trim() },
    { label: 'Паливний фільтр: Назва', value: (data.fuelFilterName || '').toString().trim() },
    { label: 'Повітряний фільтр: Назва', value: (data.airFilterName || '').toString().trim() },
    { label: 'Антифриз: Тип', value: (data.antifreezeType || '').toString().trim() }
  ].filter(it => it.value);
  const names = items.map(it => `${it.label} - ${it.value}`);
  return Array.from({ length: 8 }, (_, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${names[i] || ''}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            `).join('');
};

// Повний шаблон ДТС (як в оригінальному проекті)
const generateDTSTemplate = (data, workOrderNumber, formattedDate, engineers, wo) => {
  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40" lang="uk">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="ProgId" content="Word.Document">
      <meta name="Generator" content="Microsoft Word">
      <meta name="Originator" content="Microsoft Word">
      <title>Наряд ДТС-2</title>
      <style>
        @page {
          size: A4;
          margin: 1.27cm 1.27cm 1.27cm 1.27cm;
          mso-page-orientation: portrait;
        }
        
        body {
          font-family: 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.2;
          margin: 0;
          padding: 20px;
          color: #000;
          background: #f5f5f5;
        }
        
        .page {
          width: 21cm;
          min-height: 29.7cm;
          margin: 0 auto 20px auto;
          padding: 1.27cm;
          box-sizing: border-box;
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        
        .header {
          margin-bottom: 15px;
          text-align: center;
        }
        
        .header-company {
          font-size: 14pt;
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .header-service {
          font-size: 12pt;
          color: green;
          font-weight: bold;
        }
        
        .header-contacts {
          font-size: 9pt;
          margin-top: 10px;
        }
        
        .title {
          text-align: center;
          font-size: 14pt;
          font-weight: bold;
          margin: 15px 0;
          text-transform: uppercase;
        }
        
        .field {
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          font-size: 11pt;
        }
        
        .field-label {
          font-weight: normal;
          min-width: 200px;
          margin-right: 8px;
        }
        
        .field-value {
          flex: 1;
          border-bottom: 1px solid #000;
          min-height: 18px;
          padding: 1px 3px;
        }
        
        .checkbox-group-inline {
          display: inline;
          font-size: 10pt;
          margin-left: 10px;
        }
        
        .checkbox-unicode {
          font-size: 12pt;
          margin-right: 3px;
          margin-left: 8px;
        }
        
        .section-title {
          font-weight: bold;
          font-size: 11pt;
          margin: 15px 0 8px 0;
        }
        
        .materials-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 9pt;
        }
        
        .materials-table th,
        .materials-table td {
          border: 1px solid #000;
          padding: 3px;
          text-align: center;
          height: 20px;
        }
        
        .materials-table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        
        .materials-table td:nth-child(2) {
          text-align: left;
          padding-left: 5px;
        }
        
        .cost-item {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
          font-size: 10pt;
        }
        
        .total-cost {
          font-weight: bold;
          font-size: 11pt;
          text-align: center;
          margin: 15px 0;
          padding: 8px;
          border: 1px solid #000;
        }
        
        .two-column {
          display: flex;
          gap: 20px;
        }
        
        .column {
          flex: 1;
        }
        
        .checkbox-section {
          margin: 10px 0;
          font-size: 10pt;
        }
        
        .checkbox-row {
          display: flex;
          align-items: center;
          margin: 3px 0;
        }
        
        .checkbox-label {
          margin-left: 5px;
        }
        
        .coefficient-note {
          font-style: italic;
          font-size: 9pt;
          margin: 8px 0;
        }
        
        .signature-section {
          margin-top: 25px;
          display: flex;
          justify-content: space-between;
        }
        
        .signature-block {
          width: 45%;
          text-align: center;
        }
        
        .signature-line {
          border-bottom: 1px solid #000;
          margin: 15px 0 5px 0;
          min-height: 20px;
        }
        
        .recommendation-line {
          border-bottom: 1px solid #000;
          min-height: 18px;
          margin: 5px 0;
        }
        
        .no-print {
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 1000;
          background: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 15px rgba(0,0,0,0.2);
        }
        
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          margin: 0 5px;
        }
        
        .btn-print { background: #4CAF50; color: white; }
        .btn-save { background: #2196F3; color: white; }
        .btn-close { background: #f44336; color: white; }
        
        @media print {
          .no-print { display: none !important; }
          body { background: white; padding: 0; }
          .page { box-shadow: none; margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="no-print">
        <button class="btn btn-print" onclick="window.print()">🖨️ Друкувати</button>
        <button class="btn btn-save" onclick="saveDocument()">💾 Зберегти</button>
        <button class="btn btn-close" onclick="window.close()">✕ Закрити</button>
      </div>
      
      <div class="page">
        <div class="header">
          <img src="/images/header-dts.png" alt="ТОВ ДАРЕКС ТРЕЙДІНГ СОЛЮШНС" style="width: 100%; max-width: 100%; height: auto; margin-bottom: 10px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <div style="display: none; text-align: center;">
            <div class="header-company">ТОВ "ДАРЕКС ТРЕЙДІНГ СОЛЮШНС"</div>
            <div class="header-service">СЕРВІСНА СЛУЖБА</div>
            <div class="header-contacts">+38 (067) 7000 235 | service@darex.energy | www.darex.energy</div>
          </div>
        </div>
        
        <div class="title">НАРЯД НА ВИКОНАННЯ РОБІТ</div>
        
        <div class="field">
          <span class="field-label">№ наряду:</span>
          <span class="field-value">${workOrderNumber}</span>
        </div>
        
        <div class="field">
          <span class="field-label">від «${formattedDate.day}» ${formattedDate.month} ${formattedDate.year} р.</span>
        </div>
        
        ${data.requestDesc ? `
        <div class="field">
          <span class="field-label">Опис заявки:</span>
          <span class="field-value">${data.requestDesc}</span>
        </div>
        ` : ''}
        
        ${data.contactPerson ? `
        <div class="field">
          <span class="field-label">Контактна особа:</span>
          <span class="field-value">${data.contactPerson}</span>
        </div>
        ` : ''}
        
        ${data.contactPhone ? `
        <div class="field">
          <span class="field-label">Тел. контактної особи:</span>
          <span class="field-value">${data.contactPhone}</span>
        </div>
        ` : ''}
        
        <div class="field">
          <span class="field-label">1. Роботи виконує:</span>
          <span class="field-value">${engineers}</span>
        </div>
        
        <div class="field">
          <span class="field-label">2. Замовник:</span>
          <span class="field-value">${data.client}</span>
        </div>
        
        ${data.edrpou ? `
        <div class="field">
          <span class="field-label">ЄДРПОУ:</span>
          <span class="field-value">${data.edrpou}</span>
        </div>
        ` : ''}
        
        <div class="field">
          <span class="field-label">3. Адреса об'єкта:</span>
          <span class="field-value">${data.address}</span>
        </div>
        
        <div class="field">
          <span class="field-label">4. Найменування обладнання:</span>
          <span class="field-value">${data.equipment}</span>
        </div>
        
        <div class="field">
          <span class="field-label">Зав. №:</span>
          <span class="field-value">${data.serialNumber}</span>
        </div>
        
        <div class="field">
          <span class="field-label">5. Тип двигуна:</span>
          <span class="field-value">${data.engineModel}</span>
        </div>
        
        <div class="field">
          <span class="field-label">Зав. №:</span>
          <span class="field-value">${data.engineSerial}</span>
        </div>
        
        <div class="field">
          <span class="field-label">6. Тип панелі керування:</span>
          <span class="field-value"></span>
        </div>
        
        <div class="field">
          <span class="field-label">7. Вид робіт:</span>
          <span class="checkbox-group-inline">
            <span class="checkbox-unicode">☐</span> гарантійний ремонт
            <span class="checkbox-unicode">☐</span> ремонт
            <span class="checkbox-unicode">☐</span> технічне обслуговування
            <span class="checkbox-unicode">☐</span> інше
            <span class="checkbox-unicode">☐</span> ПНР
          </span>
        </div>
        
        <div class="field">
          <span class="field-label">8. Технічний стан обладнання перед проведенням робіт:</span>
          <span class="checkbox-group-inline">
            <span class="checkbox-unicode">☐</span> працездатне
            <span class="checkbox-unicode">☐</span> непрацездатне
          </span>
        </div>
        
        <div class="field">
          <span class="field-label">9. Перелік виконаних робіт/послуг:</span>
          <span class="field-value"></span>
        </div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        
        <div class="field" style="font-size: 10pt;">
          <span>10. Після проведення робіт та випробувань, ДГУ знаходиться в робочому / неробочому стані, в режимі ручне авто, напрацювання становить ____ мотогодин.</span>
        </div>
        
        <div class="field" style="font-size: 10pt;">
          <span>11. Навантаження: L1 ____, L2 ____, L3 ____, U1 ____, U2 ____, U3 ____, V.</span>
        </div>
        
        <div class="section-title">6.1. ПЕРЕЛІК МАТЕРІАЛІВ ТА ЗАПЧАСТИН, ВИКОРИСТАНИХ ПІД ЧАС РОБІТ:</div>
        
        <table class="materials-table">
          <thead>
            <tr>
              <th style="width: 5%;">№</th>
              <th style="width: 50%;">Найменування</th>
              <th style="width: 8%;">Один. виміру</th>
              <th style="width: 7%;">Кільк.</th>
              <th style="width: 15%;">Ціна з ПДВ, грн</th>
              <th style="width: 15%;">Вартість з ПДВ, грн</th>
            </tr>
          </thead>
          <tbody>
            ${buildMaterialsTableRows(data)}
          </tbody>
        </table>
        
        <div class="field">
          <span class="field-label">Загальна вартість матеріалів та запчастин:</span>
          <span class="field-value">____ грн.</span>
        </div>
        
        <div class="section-title">6.2. Вартість ремонту/робіт:</div>
        
        <div class="cost-item"><span>Коефіцієнт складності</span><span>_____</span></div>
        <div class="cost-item"><span>Діагностика</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Вартість технічного обслуговування</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Вартість ремонту (1людино-година*1200 грн.)</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Вартість пусконалагоджувальних робіт</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Загальна вартість з урахуванням коефіцієнта складності</span><span>_____ грн.</span></div>
        
        <div class="section-title">6.3. Виїзд на об'єкт Замовника: тариф: по місту ${wo.travelCity} грн.</div>
        <div class="field" style="font-size: 10pt;">
          <span>Виїзд за місто ____ км * ${wo.travelPerKm} грн/км; разом ____ грн.</span>
        </div>
        
        <div class="section-title">6.4. Добові у відрядженні: ${wo.perDiem} грн. ____ діб ____ люд. разом ____ грн.</div>
        
        <div class="section-title">6.5. Проживання: ____ грн. разом ____ грн.</div>
        
        <div class="total-cost">
          ЗАГАЛЬНА ВАРТІСТЬ РОБІТ з ПДВ (усього по пп.6.1-6.5) ____ грн.
        </div>
        
        <div class="title" style="font-size: 11pt; margin: 15px 0;">
          НАСТУПНЕ ТЕХНІЧНЕ ОБСЛУГОВУВАННЯ ПРОВЕСТИ ПРИ НАПРАЦЮВАННІ
        </div>
        
        <div class="field">
          <span>МОТОГОДИН, АБО «___» ___ 20___ РОКУ.</span>
        </div>
        
        <div class="two-column">
          <div class="column">
            <div class="field">
              <span class="field-label">Дата та час початку робіт:</span>
              <span class="field-value"></span>
            </div>
          </div>
          <div class="column">
            <div class="field">
              <span class="field-label">Дата та час закінчення робіт:</span>
              <span class="field-value"></span>
            </div>
          </div>
        </div>
        
        <div class="two-column">
          <div class="column">
            <div class="field">
              <span class="field-label">Авто №:</span>
              <span class="field-value"></span>
            </div>
          </div>
          <div class="column">
            <div class="field">
              <span class="field-label">Переробка, год.:</span>
              <span class="field-value"></span>
            </div>
          </div>
        </div>
        
        <div class="field">
          <span class="field-label">Фото зроблені, не зроблені:</span>
          <span class="field-value"></span>
        </div>
        
        <div class="field">
          <span class="field-label">Рекомендації виконувача робіт:</span>
        </div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        
        <div class="field">
          <span class="field-label">Коефіцієнт складності робіт:</span>
        </div>
        
        <div class="checkbox-section">
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота за комфортних умов, доброзичливість замовника - ${wo.mComfort}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота на відкритому повітрі, при температурі нижче 0 град, (вище 27) сухо - ${wo.mOutdoor}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в дощ, сніг, сильний вітер - ${wo.mPrecip}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в підвальних приміщеннях, на дахах - ${wo.mBasement}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в агресивному середовищі - ${wo.mAggressive}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в нічний час (з 22:00 до 06:00) - ${wo.mNight}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота у вихідні та святкові дні - ${wo.mWeekend}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Терміновий виклик - ${wo.mUrgent}</span>
          </div>
        </div>
        
        <div class="coefficient-note">
          *Коефіцієнт складності робіт це величина, що збільшує вартість робіт через специфічні, що не залежать від виконавця умов і не дозволяють якісно провести роботи без спеціальних навичок, обладнання через погодні умови, і т.д.
        </div>
        
        <div class="coefficient-note">
          *коефіцієнт може бути сумований.
        </div>
        
        <div class="signature-section">
          <div class="signature-block">
            <div><strong>РОБОТУ ПРИЙНЯВ</strong></div>
            <div class="signature-line"></div>
            <div class="signature-line"></div>
          </div>
          
          <div class="signature-block">
            <div><strong>РОБОТУ ЗДАВ</strong></div>
            <div class="signature-line">${engineers}</div>
            <div class="signature-line"></div>
          </div>
        </div>
      </div>
      
      <script>
        function saveDocument() {
          let htmlContent = document.documentElement.outerHTML;
          htmlContent = htmlContent.replace(/<div class="no-print">[\\s\\S]*?<\\/div>/gi, '');
          const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'Наряд_ДТС_${workOrderNumber}_' + new Date().toISOString().slice(0,10) + '.doc';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      </script>
    </body>
    </html>
  `;
};

// Повний шаблон Дарекс Енерго
const generateDarexEnergyTemplate = (data, workOrderNumber, formattedDate, engineers, wo) => {
  return `
    <!DOCTYPE html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40" lang="uk">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Наряд Дарекс Енерго</title>
      <style>
        @page {
          size: A4;
          margin: 1.27cm;
        }
        
        body {
          font-family: 'Times New Roman', serif;
          font-size: 11pt;
          line-height: 1.2;
          margin: 0;
          padding: 20px;
          color: #000;
          background: #f5f5f5;
        }
        
        .page {
          width: 21cm;
          min-height: 29.7cm;
          margin: 0 auto 20px auto;
          padding: 1.27cm;
          box-sizing: border-box;
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        
        .header {
          margin-bottom: 15px;
          text-align: center;
        }
        
        .header-company {
          font-size: 14pt;
          font-weight: bold;
          margin-bottom: 5px;
        }
        
        .header-service {
          font-size: 12pt;
          color: #1565C0;
          font-weight: bold;
        }
        
        .header-contacts {
          font-size: 9pt;
          margin-top: 10px;
        }
        
        .title {
          text-align: center;
          font-size: 14pt;
          font-weight: bold;
          margin: 15px 0;
          text-transform: uppercase;
        }
        
        .field {
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          font-size: 11pt;
        }
        
        .field-label {
          font-weight: normal;
          min-width: 200px;
          margin-right: 8px;
        }
        
        .field-value {
          flex: 1;
          border-bottom: 1px solid #000;
          min-height: 18px;
          padding: 1px 3px;
        }
        
        .checkbox-group-inline {
          display: inline;
          font-size: 10pt;
          margin-left: 10px;
        }
        
        .checkbox-unicode {
          font-size: 12pt;
          margin-right: 3px;
          margin-left: 8px;
        }
        
        .section-title {
          font-weight: bold;
          font-size: 11pt;
          margin: 15px 0 8px 0;
        }
        
        .materials-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
          font-size: 9pt;
        }
        
        .materials-table th,
        .materials-table td {
          border: 1px solid #000;
          padding: 3px;
          text-align: center;
          height: 20px;
        }
        
        .materials-table th {
          background: #f0f0f0;
          font-weight: bold;
        }
        
        .materials-table td:nth-child(2) {
          text-align: left;
          padding-left: 5px;
        }
        
        .cost-item {
          display: flex;
          justify-content: space-between;
          margin: 3px 0;
          font-size: 10pt;
        }
        
        .total-cost {
          font-weight: bold;
          font-size: 11pt;
          text-align: center;
          margin: 15px 0;
          padding: 8px;
          border: 1px solid #000;
        }
        
        .two-column {
          display: flex;
          gap: 20px;
        }
        
        .column {
          flex: 1;
        }
        
        .checkbox-section {
          margin: 10px 0;
          font-size: 10pt;
        }
        
        .checkbox-row {
          display: flex;
          align-items: center;
          margin: 3px 0;
        }
        
        .checkbox-label {
          margin-left: 5px;
        }
        
        .coefficient-note {
          font-style: italic;
          font-size: 9pt;
          margin: 8px 0;
        }
        
        .signature-section {
          margin-top: 25px;
          display: flex;
          justify-content: space-between;
        }
        
        .signature-block {
          width: 45%;
          text-align: center;
        }
        
        .signature-line {
          border-bottom: 1px solid #000;
          margin: 15px 0 5px 0;
          min-height: 20px;
        }
        
        .recommendation-line {
          border-bottom: 1px solid #000;
          min-height: 18px;
          margin: 5px 0;
        }
        
        .no-print {
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 1000;
          background: white;
          padding: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 15px rgba(0,0,0,0.2);
        }
        
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          margin: 0 5px;
        }
        
        .btn-print { background: #4CAF50; color: white; }
        .btn-save { background: #2196F3; color: white; }
        .btn-close { background: #f44336; color: white; }
        
        @media print {
          .no-print { display: none !important; }
          body { background: white; padding: 0; }
          .page { box-shadow: none; margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="no-print">
        <button class="btn btn-print" onclick="window.print()">🖨️ Друкувати</button>
        <button class="btn btn-save" onclick="saveDocument()">💾 Зберегти</button>
        <button class="btn btn-close" onclick="window.close()">✕ Закрити</button>
      </div>
      
      <div class="page">
        <div class="header">
          <img src="/images/header-darex.png" alt="ТОВ ДАРЕКС ЕНЕРГО" style="width: 100%; max-width: 100%; height: auto; margin-bottom: 10px;" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <div style="display: none; text-align: center;">
            <div class="header-company">ТОВ "ДАРЕКС ЕНЕРГО"</div>
            <div class="header-service">НАДІЙНЕ ЕЛЕКТРОПОСТАЧАННЯ</div>
            <div class="header-contacts">0 800 00 00 00 | info@darex.com.ua</div>
          </div>
        </div>
        
        <div class="title">НАРЯД НА ВИКОНАННЯ РОБІТ</div>
        
        <div class="field">
          <span class="field-label">№ наряду:</span>
          <span class="field-value">${workOrderNumber}</span>
        </div>
        
        <div class="field">
          <span class="field-label">від «${formattedDate.day}» ${formattedDate.month} ${formattedDate.year} р.</span>
        </div>
        
        ${data.requestDesc ? `
        <div class="field">
          <span class="field-label">Опис заявки:</span>
          <span class="field-value">${data.requestDesc}</span>
        </div>
        ` : ''}
        
        ${data.contactPerson ? `
        <div class="field">
          <span class="field-label">Контактна особа:</span>
          <span class="field-value">${data.contactPerson}</span>
        </div>
        ` : ''}
        
        ${data.contactPhone ? `
        <div class="field">
          <span class="field-label">Тел. контактної особи:</span>
          <span class="field-value">${data.contactPhone}</span>
        </div>
        ` : ''}
        
        <div class="field">
          <span class="field-label">1. Роботи виконує:</span>
          <span class="field-value">${engineers}</span>
        </div>
        
        <div class="field">
          <span class="field-label">2. Замовник:</span>
          <span class="field-value">${data.client}</span>
        </div>
        
        ${data.edrpou ? `
        <div class="field">
          <span class="field-label">ЄДРПОУ:</span>
          <span class="field-value">${data.edrpou}</span>
        </div>
        ` : ''}
        
        <div class="field">
          <span class="field-label">3. Адреса об'єкта:</span>
          <span class="field-value">${data.address}</span>
        </div>
        
        <div class="field">
          <span class="field-label">4. Найменування обладнання:</span>
          <span class="field-value">${data.equipment}</span>
        </div>
        
        <div class="field">
          <span class="field-label">Зав. №:</span>
          <span class="field-value">${data.serialNumber}</span>
        </div>
        
        <div class="field">
          <span class="field-label">5. Тип двигуна:</span>
          <span class="field-value">${data.engineModel}</span>
        </div>
        
        <div class="field">
          <span class="field-label">Зав. №:</span>
          <span class="field-value">${data.engineSerial}</span>
        </div>
        
        <div class="field">
          <span class="field-label">6. Тип панелі керування:</span>
          <span class="field-value"></span>
        </div>
        
        <div class="field">
          <span class="field-label">7. Вид робіт:</span>
          <span class="checkbox-group-inline">
            <span class="checkbox-unicode">☐</span> гарантійний ремонт
            <span class="checkbox-unicode">☐</span> ремонт
            <span class="checkbox-unicode">☐</span> технічне обслуговування
            <span class="checkbox-unicode">☐</span> інше
            <span class="checkbox-unicode">☐</span> ПНР
          </span>
        </div>
        
        <div class="field">
          <span class="field-label">8. Технічний стан обладнання перед проведенням робіт:</span>
          <span class="checkbox-group-inline">
            <span class="checkbox-unicode">☐</span> працездатне
            <span class="checkbox-unicode">☐</span> непрацездатне
          </span>
        </div>
        
        <div class="field">
          <span class="field-label">9. Перелік виконаних робіт/послуг:</span>
          <span class="field-value"></span>
        </div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        
        <div class="field" style="font-size: 10pt;">
          <span>10. Після проведення робіт та випробувань, ДГУ знаходиться в робочому / неробочому стані, в режимі ручне авто, напрацювання становить ____ мотогодин.</span>
        </div>
        
        <div class="field" style="font-size: 10pt;">
          <span>11. Навантаження: L1 ____, L2 ____, L3 ____, U1 ____, U2 ____, U3 ____, V.</span>
        </div>
        
        <div class="section-title">6.1. ПЕРЕЛІК МАТЕРІАЛІВ ТА ЗАПЧАСТИН, ВИКОРИСТАНИХ ПІД ЧАС РОБІТ:</div>
        
        <table class="materials-table">
          <thead>
            <tr>
              <th style="width: 5%;">№</th>
              <th style="width: 50%;">Найменування</th>
              <th style="width: 8%;">Один. виміру</th>
              <th style="width: 7%;">Кільк.</th>
              <th style="width: 15%;">Ціна з ПДВ, грн</th>
              <th style="width: 15%;">Вартість з ПДВ, грн</th>
            </tr>
          </thead>
          <tbody>
            ${buildMaterialsTableRows(data)}
          </tbody>
        </table>
        
        <div class="field">
          <span class="field-label">Загальна вартість матеріалів та запчастин:</span>
          <span class="field-value">____ грн.</span>
        </div>
        
        <div class="section-title">6.2. Вартість ремонту/робіт:</div>
        
        <div class="cost-item"><span>Коефіцієнт складності</span><span>_____</span></div>
        <div class="cost-item"><span>Діагностика</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Вартість технічного обслуговування</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Вартість ремонту (1людино-година*1200 грн.)</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Вартість пусконалагоджувальних робіт</span><span>_____ грн.</span></div>
        <div class="cost-item"><span>Загальна вартість з урахуванням коефіцієнта складності</span><span>_____ грн.</span></div>
        
        <div class="section-title">6.3. Виїзд на об'єкт Замовника: тариф: по місту ${wo.travelCity} грн.</div>
        <div class="field" style="font-size: 10pt;">
          <span>Виїзд за місто ____ км * ${wo.travelPerKm} грн/км; разом ____ грн.</span>
        </div>
        
        <div class="section-title">6.4. Добові у відрядженні: ${wo.perDiem} грн. ____ діб ____ люд. разом ____ грн.</div>
        
        <div class="section-title">6.5. Проживання: ____ грн. разом ____ грн.</div>
        
        <div class="total-cost">
          ЗАГАЛЬНА ВАРТІСТЬ РОБІТ з ПДВ (усього по пп.6.1-6.5) ____ грн.
        </div>
        
        <div class="title" style="font-size: 11pt; margin: 15px 0;">
          НАСТУПНЕ ТЕХНІЧНЕ ОБСЛУГОВУВАННЯ ПРОВЕСТИ ПРИ НАПРАЦЮВАННІ
        </div>
        
        <div class="field">
          <span>МОТОГОДИН, АБО «___» ___ 20___ РОКУ.</span>
        </div>
        
        <div class="two-column">
          <div class="column">
            <div class="field">
              <span class="field-label">Дата та час початку робіт:</span>
              <span class="field-value"></span>
            </div>
          </div>
          <div class="column">
            <div class="field">
              <span class="field-label">Дата та час закінчення робіт:</span>
              <span class="field-value"></span>
            </div>
          </div>
        </div>
        
        <div class="two-column">
          <div class="column">
            <div class="field">
              <span class="field-label">Авто №:</span>
              <span class="field-value"></span>
            </div>
          </div>
          <div class="column">
            <div class="field">
              <span class="field-label">Переробка, год.:</span>
              <span class="field-value"></span>
            </div>
          </div>
        </div>
        
        <div class="field">
          <span class="field-label">Фото зроблені, не зроблені:</span>
          <span class="field-value"></span>
        </div>
        
        <div class="field">
          <span class="field-label">Рекомендації виконувача робіт:</span>
        </div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        <div class="recommendation-line"></div>
        
        <div class="field">
          <span class="field-label">Коефіцієнт складності робіт:</span>
        </div>
        
        <div class="checkbox-section">
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота за комфортних умов, доброзичливість замовника - ${wo.mComfort}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота на відкритому повітрі, при температурі нижче 0 град, (вище 27) сухо - ${wo.mOutdoor}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в дощ, сніг, сильний вітер - ${wo.mPrecip}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в підвальних приміщеннях, на дахах - ${wo.mBasement}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в агресивному середовищі - ${wo.mAggressive}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота в нічний час (з 22:00 до 06:00) - ${wo.mNight}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Робота у вихідні та святкові дні - ${wo.mWeekend}</span>
          </div>
          <div class="checkbox-row">
            <span class="checkbox-unicode">☐</span>
            <span class="checkbox-label">Терміновий виклик - ${wo.mUrgent}</span>
          </div>
        </div>
        
        <div class="coefficient-note">
          *Коефіцієнт складності робіт це величина, що збільшує вартість робіт через специфічні, що не залежать від виконавця умов і не дозволяють якісно провести роботи без спеціальних навичок, обладнання через погодні умови, і т.д.
        </div>
        
        <div class="coefficient-note">
          *коефіцієнт може бути сумований.
        </div>
        
        <div class="signature-section">
          <div class="signature-block">
            <div><strong>РОБОТУ ПРИЙНЯВ</strong></div>
            <div class="signature-line"></div>
            <div class="signature-line"></div>
          </div>
          
          <div class="signature-block">
            <div><strong>РОБОТУ ЗДАВ</strong></div>
            <div class="signature-line">${engineers}</div>
            <div class="signature-line"></div>
          </div>
        </div>
      </div>
      
      <script>
        function saveDocument() {
          let htmlContent = document.documentElement.outerHTML;
          htmlContent = htmlContent.replace(/<div class="no-print">[\\s\\S]*?<\\/div>/gi, '');
          const blob = new Blob([htmlContent], { type: 'application/msword;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'Наряд_Дарекс_Енерго_${workOrderNumber}_' + new Date().toISOString().slice(0,10) + '.doc';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      </script>
    </body>
    </html>
  `;
};

export default generateWorkOrder;
