import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { formatUkDate } from './localFsUtils';

const FIELD_LABELS = {
  requestNumber: 'Номер заявки/наряду',
  requestAuthor: 'Автор заявки',
  status: 'Статус заявки',
  requestDate: 'Дата заявки',
  company: 'Компанія виконавець',
  serviceRegion: 'Регіон сервісного відділу',
  plannedDate: 'Запланована дата робіт',
  contactPerson: 'Контактна особа',
  contactPhone: 'Тел. контактної особи',
  requestDesc: 'Опис заявки',
  urgentRequest: 'Термінова заявка',
  internalWork: 'Внутрішні роботи',
  client: 'Замовник',
  edrpou: 'ЄДРПОУ',
  address: 'Адреса',
  contractNumber: 'Номер договору',
  contractDate: 'Дата договору',
  worksWithoutContract: 'Працює без договору',
  equipment: 'Тип обладнання',
  equipmentSerial: 'Заводський номер обладнання',
  engineModel: 'Модель двигуна',
  engineSerial: 'Зав. № двигуна',
  customerEquipmentNumber: 'Інв. № обладнання від замовника',
  equipmentOperatingHours: 'Напрацювання мотогодин',
  work: 'Виконані роботи',
  date: 'Дата проведення робіт',
  engineer1: 'Сервісний інженер №1',
  engineer2: 'Сервісний інженер №2',
  engineer3: 'Сервісний інженер №3',
  engineer4: 'Сервісний інженер №4',
  engineer5: 'Сервісний інженер №5',
  engineer6: 'Сервісний інженер №6',
  paymentType: 'Вид оплати',
  paymentDate: 'Дата оплати',
  invoice: 'Номер рахунку',
  invoiceRecipientDetails: 'Реквізити отримувача рахунку',
  serviceTotal: 'Загальна сума послуги',
  workPrice: 'Вартість робіт, грн',
  oilType: 'Тип оливи',
  oilUsed: 'Використано оливи, л',
  oilPrice: 'Ціна оливи за 1 л, грн',
  oilTotal: 'Загальна сума за оливу, грн',
  filterName: 'Фільтр масляний назва',
  filterCount: 'Фільтр масляний штук',
  filterPrice: 'Ціна масляного фільтра',
  filterSum: 'Сума за фільтри масляні',
  fuelFilterName: 'Фільтр паливний назва',
  fuelFilterCount: 'Фільтр паливний штук',
  fuelFilterPrice: 'Ціна паливного фільтра',
  fuelFilterSum: 'Сума за фільтри паливні',
  airFilterName: 'Фільтр повітряний назва',
  airFilterCount: 'Фільтр повітряний штук',
  airFilterPrice: 'Ціна повітряного фільтра',
  airFilterSum: 'Сума за фільтри повітряні',
  antifreezeType: 'Антифриз тип',
  antifreezeL: 'Антифриз, л',
  antifreezePrice: 'Ціна антифризу',
  antifreezeSum: 'Сума за антифриз',
  otherMaterials: 'Опис інших матеріалів',
  otherSum: 'Ціна інших матеріалів',
  carNumber: 'Держномер авто',
  transportKm: 'Кілометраж',
  transportSum: 'Вартість транспорту',
  perDiem: 'Добові, грн',
  living: 'Проживання, грн',
  otherExp: 'Інші витрати, грн',
  comments: 'Коментарі',
  approvedByWarehouse: 'Підтвердження зав. складу',
  warehouseComment: 'Опис відмови (зав. склад)',
  approvedByAccountant: 'Підтвердження бухгалтера',
  accountantComment: 'Опис відмови (бухгалтер)',
  approvedByRegionalManager: 'Підтвердження рег. керівника',
  regionalManagerComment: 'Опис відмови (рег. керівник)',
  needInvoice: 'Потрібен рахунок',
  needAct: 'Потрібен акт виконаних робіт',
  debtStatus: 'Заборгованість по актах',
  blockDetail: 'Детальний опис блокування',
  autoCreatedAt: 'Авт. створення заявки',
  autoCompletedAt: 'Авт. виконано',
  autoWarehouseApprovedAt: 'Авт. затвердження завскладом',
  autoAccountantApprovedAt: 'Авт. затвердження бухгалтером',
  invoiceRequestDate: 'Дата заявки на рахунок',
  invoiceUploadDate: 'Дата завантаження рахунку',
};

const SECTIONS = [
  {
    title: 'Основна інформація',
    color: '#7b1fa2',
    fields: [
      'status', 'requestDate', 'company', 'serviceRegion', 'plannedDate',
      'contactPerson', 'contactPhone', 'requestDesc', 'urgentRequest', 'internalWork',
    ],
  },
  {
    title: 'Клієнт та адреса',
    color: '#1565c0',
    fields: ['client', 'edrpou', 'address', 'contractNumber', 'contractDate', 'worksWithoutContract'],
  },
  {
    title: 'Обладнання',
    color: '#00838f',
    fields: [
      'equipment', 'equipmentSerial', 'engineModel', 'engineSerial',
      'customerEquipmentNumber', 'equipmentOperatingHours',
    ],
  },
  {
    title: 'Звіт про виконані роботи',
    color: '#2e7d32',
    fields: ['work', 'date', 'engineer1', 'engineer2', 'engineer3', 'engineer4', 'engineer5', 'engineer6'],
  },
  {
    title: 'Фінанси та матеріали',
    color: '#ef6c00',
    fields: [
      'paymentType', 'paymentDate', 'invoice', 'invoiceRecipientDetails',
      'serviceTotal', 'workPrice', 'oilType', 'oilUsed', 'oilPrice', 'oilTotal',
      'filterName', 'filterCount', 'filterPrice', 'filterSum',
      'fuelFilterName', 'fuelFilterCount', 'fuelFilterPrice', 'fuelFilterSum',
      'airFilterName', 'airFilterCount', 'airFilterPrice', 'airFilterSum',
      'antifreezeType', 'antifreezeL', 'antifreezePrice', 'antifreezeSum',
      'otherMaterials', 'otherSum', 'carNumber', 'transportKm', 'transportSum',
      'perDiem', 'living', 'otherExp',
    ],
  },
  {
    title: 'Підтвердження та інше',
    color: '#455a64',
    fields: [
      'approvedByWarehouse', 'warehouseComment', 'approvedByAccountant', 'accountantComment',
      'approvedByRegionalManager', 'regionalManagerComment', 'comments',
      'needInvoice', 'needAct', 'debtStatus', 'blockDetail',
      'autoCreatedAt', 'autoCompletedAt', 'autoWarehouseApprovedAt', 'autoAccountantApprovedAt',
      'invoiceRequestDate', 'invoiceUploadDate',
    ],
  },
];

const DATE_FIELDS = new Set([
  'requestDate', 'plannedDate', 'contractDate', 'date', 'paymentDate',
  'autoCreatedAt', 'autoCompletedAt', 'autoWarehouseApprovedAt', 'autoAccountantApprovedAt',
  'invoiceRequestDate', 'invoiceUploadDate',
]);

const BOOL_FIELDS = new Set(['urgentRequest', 'internalWork', 'worksWithoutContract', 'needInvoice', 'needAct']);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFieldValue(key, value, task) {
  if (key === 'urgentRequest') {
    const v = value ?? task?.urgent;
    if (v === null || v === undefined || v === '') return null;
    return v ? 'Так' : 'Ні';
  }
  if (value === null || value === undefined || value === '') return null;
  if (BOOL_FIELDS.has(key)) return value ? 'Так' : 'Ні';
  if (DATE_FIELDS.has(key)) return formatUkDate(value) || String(value);
  if (typeof value === 'boolean') return value ? 'Так' : 'Ні';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim() || null;
}

function buildSectionHtml(section, task) {
  const rows = section.fields
    .map((key) => {
      const val = formatFieldValue(key, task[key], task);
      if (val == null) return '';
      const label = FIELD_LABELS[key] || key;
      const isDesc = key === 'requestDesc' || key === 'work' || key === 'comments';
      if (isDesc) {
        return `
          <div class="field field-full">
            <div class="field-label">${escapeHtml(label)}</div>
            <div class="field-value textarea">${escapeHtml(val)}</div>
          </div>`;
      }
      return `
        <div class="field">
          <div class="field-label">${escapeHtml(label)}</div>
          <div class="field-value">${escapeHtml(val)}</div>
        </div>`;
    })
    .filter(Boolean)
    .join('');

  if (!rows) return '';
  return `
    <div class="section">
      <div class="section-header" style="background:${section.color}">${escapeHtml(section.title)}</div>
      <div class="section-body">${rows}</div>
    </div>`;
}

export function buildTaskExportHtml(task) {
  const requestNumber = task.requestNumber || '—';
  const requestAuthor = task.requestAuthor || '—';
  const sectionsHtml = SECTIONS.map((s) => buildSectionHtml(s, task)).filter(Boolean).join('');

  return `
    <style>
      .task-export { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; padding: 24px; width: 760px; box-sizing: border-box; }
      .task-export .header-row { display: flex; gap: 16px; margin-bottom: 20px; }
      .task-export .header-box { flex: 1; text-align: center; border: 1px solid #ccc; border-radius: 8px; padding: 12px; background: #f5f5f5; }
      .task-export .header-box .label { font-size: 13px; font-weight: 600; color: #555; margin-bottom: 6px; }
      .task-export .header-box .value { font-size: 16px; font-weight: 700; color: #d32f2f; }
      .task-export .header-box .value.author { color: #333; font-weight: 600; }
      .task-export .section { margin-bottom: 16px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }
      .task-export .section-header { color: #fff; font-size: 14px; font-weight: 700; padding: 10px 14px; }
      .task-export .section-body { padding: 14px; display: flex; flex-wrap: wrap; gap: 12px; background: #fafafa; }
      .task-export .field { flex: 1 1 calc(33% - 12px); min-width: 200px; }
      .task-export .field-full { flex: 1 1 100%; }
      .task-export .field-label { font-size: 11px; color: #666; font-weight: 600; margin-bottom: 4px; }
      .task-export .field-value { font-size: 13px; color: #111; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; min-height: 18px; }
      .task-export .field-value.textarea { min-height: 48px; white-space: pre-wrap; }
    </style>
    <div class="task-export">
      <div class="header-row">
        <div class="header-box">
          <div class="label">Номер заявки/наряду</div>
          <div class="value">${escapeHtml(requestNumber)}</div>
        </div>
        <div class="header-box">
          <div class="label">Автор заявки</div>
          <div class="value author">${escapeHtml(requestAuthor)}</div>
        </div>
      </div>
      ${sectionsHtml || '<p>Немає заповнених полів</p>'}
    </div>`;
}

export async function generateTaskPdfBlob(task) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  container.innerHTML = buildTaskExportHtml(task);
  document.body.appendChild(container);

  try {
    const target = container.querySelector('.task-export') || container;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;

    const imgWidth = contentWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/png');

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      pdf.addPage();
      position = margin - (imgHeight - heightLeft);
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}
