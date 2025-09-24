// Повний список полів для завдань на основі аналізу коду
export const completeTaskFields = [
  // Основні поля
  { name: 'status', label: 'Статус заявки', type: 'select', options: ['', 'Заявка', 'В роботі', 'Виконано', 'Заблоковано'] },
  { name: 'requestDate', label: 'Дата заявки', type: 'date' },
  { name: 'date', label: 'Дата проведення робіт', type: 'date' },
  { name: 'paymentDate', label: 'Дата оплати', type: 'date' },
  { name: 'company', label: 'Компанія виконавець', type: 'select', options: ['', 'ДТС', 'Дарекс Енерго', 'інша'] },
  { name: 'edrpou', label: 'ЄДРПОУ', type: 'text' },
  { name: 'requestDesc', label: 'Опис заявки', type: 'textarea' },
  { name: 'serviceRegion', label: 'Регіон сервісного відділу', type: 'select' },
  { name: 'client', label: 'Замовник', type: 'text' },
  { name: 'requestNumber', label: 'Номер заявки/наряду', type: 'text' },
  { name: 'invoice', label: 'Номер рахунку', type: 'text' },
  { name: 'paymentType', label: 'Вид оплати', type: 'select', options: ['не вибрано', 'Безготівка', 'Готівка', 'На карту', 'Інше'] },
  { name: 'address', label: 'Адреса', type: 'textarea' },
  { name: 'equipmentSerial', label: 'Заводський номер обладнання', type: 'text' },
  { name: 'equipment', label: 'Тип обладнання', type: 'text' },
  { name: 'work', label: 'Найменування робіт', type: 'text' },
  { name: 'engineer1', label: 'Сервісний інженер №1', type: 'text' },
  { name: 'engineer2', label: 'Сервісний інженер №2', type: 'text' },
  { name: 'serviceTotal', label: 'Загальна сума послуги', type: 'text' },
  
  // Матеріали - олива
  { name: 'oilType', label: 'Тип оливи', type: 'text' },
  { name: 'oilUsed', label: 'Використано оливи, л', type: 'text' },
  { name: 'oilPrice', label: 'Ціна оливи за 1 л, грн', type: 'text' },
  { name: 'oilTotal', label: 'Загальна сума за оливу, грн', type: 'text', calc: true },
  
  // Матеріали - масляний фільтр
  { name: 'filterName', label: 'Фільтр масл. назва', type: 'text' },
  { name: 'filterCount', label: 'Фільтр масл. штук', type: 'text' },
  { name: 'filterPrice', label: 'Ціна одного масляного фільтра', type: 'text' },
  { name: 'filterSum', label: 'Загальна сума за фільтри масляні', type: 'text', calc: true },
  
  // Матеріали - паливний фільтр
  { name: 'fuelFilterName', label: 'Фільтр палив. назва', type: 'text' },
  { name: 'fuelFilterCount', label: 'Фільтр палив. штук', type: 'text' },
  { name: 'fuelFilterPrice', label: 'Ціна одного паливного фільтра', type: 'text' },
  { name: 'fuelFilterSum', label: 'Загальна сума за паливні фільтри', type: 'text', calc: true },
  
  // Матеріали - повітряний фільтр
  { name: 'airFilterName', label: 'Фільтр повітряний назва', type: 'text' },
  { name: 'airFilterCount', label: 'Фільтр повітряний штук', type: 'text' },
  { name: 'airFilterPrice', label: 'Ціна одного повітряного фільтра', type: 'text' },
  { name: 'airFilterSum', label: 'Загальна сума за повітряні фільтри', type: 'text', calc: true },
  
  // Матеріали - антифриз
  { name: 'antifreezeType', label: 'Антифриз тип', type: 'text' },
  { name: 'antifreezeL', label: 'Антифриз, л', type: 'text' },
  { name: 'antifreezePrice', label: 'Ціна антифризу', type: 'text' },
  { name: 'antifreezeSum', label: 'Загальна сума за антифриз', type: 'text', calc: true },
  
  // Інші матеріали
  { name: 'otherMaterials', label: 'Опис інших матеріалів', type: 'text' },
  { name: 'otherSum', label: 'Загальна ціна інших матеріалів', type: 'text' },
  
  // Роботи та витрати
  { name: 'workPrice', label: 'Вартість робіт, грн', type: 'text', calc: true },
  { name: 'perDiem', label: 'Добові, грн', type: 'text' },
  { name: 'living', label: 'Проживання, грн', type: 'text' },
  { name: 'otherExp', label: 'Інші витрати, грн', type: 'text' },
  
  // Транспорт
  { name: 'carNumber', label: 'Держномер автотранспорту', type: 'text' },
  { name: 'transportKm', label: 'Транспортні витрати, км', type: 'text' },
  { name: 'transportSum', label: 'Загальна вартість тр. витрат', type: 'text' },
  
  // Підтвердження складу
  { name: 'approvedByWarehouse', label: 'Підтвердження зав. складу', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'warehouse' },
  { name: 'warehouseComment', label: 'Опис відмови (зав. склад)', type: 'textarea', role: 'warehouse' },
  
  // Підтвердження бухгалтера
  { name: 'approvedByAccountant', label: 'Підтвердження бухгалтера', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'accountant' },
  { name: 'accountantComment', label: 'Опис відмови (бухгалтер)', type: 'textarea', role: 'accountant' },
  { name: 'accountantComments', label: 'Коментарії бухгалтера', type: 'textarea', role: 'accountant' },
  
  // Підтвердження регіонального керівника
  { name: 'approvedByRegionalManager', label: 'Підтвердження регіонального керівника', type: 'select', options: ['На розгляді', 'Підтверджено', 'Відмова'], role: 'regionalManager' },
  { name: 'regionalManagerComment', label: 'Опис відмови (регіональний керівник)', type: 'textarea', role: 'regionalManager' },
  
  // Додаткові поля
  { name: 'comments', label: 'Коментарі', type: 'textarea' },
  { name: 'approvalDate', label: 'Дата затвердження', type: 'date' },
  { name: 'bonusApprovalDate', label: 'Дата затвердження премії', type: 'date' },
  { name: 'serviceBonus', label: 'Премія за виконання сервісних робіт, грн', type: 'text' },
  
  // Додаткові поля, які можуть бути в базі (виявлені з аналізу коду)
  { name: 'blockDetail', label: 'Детальний опис блокування заявки', type: 'textarea' },
  { name: 'reportMonthYear', label: 'Місяць/рік для звіту', type: 'text', readOnly: true },
  { name: 'taskNumber', label: 'Номер завдання', type: 'text' },
  { name: 'id', label: 'ID завдання', type: 'text', readOnly: true },
  { name: '_id', label: 'MongoDB ID', type: 'text', readOnly: true },
  
  // Поля для запасних частин (можуть бути в базі)
  { name: 'spareParts', label: 'Запасні частини', type: 'text' },
  { name: 'sparePartsPrice', label: 'Ціна запасних частин', type: 'text' },
  { name: 'sparePartsTotal', label: 'Загальна сума запасних частин', type: 'text' },
  
  // Поля для загальної суми (можуть бути в базі)
  { name: 'totalAmount', label: 'Загальна сума', type: 'text' },
  
  // Поля для дат створення/оновлення (можуть бути в базі)
  { name: 'createdAt', label: 'Дата створення', type: 'date', readOnly: true },
  { name: 'updatedAt', label: 'Дата оновлення', type: 'date', readOnly: true },
  
  // Поля для користувача, який створив/оновив
  { name: 'createdBy', label: 'Створено користувачем', type: 'text', readOnly: true },
  { name: 'updatedBy', label: 'Оновлено користувачем', type: 'text', readOnly: true },
  
  // Поля для статусу обробки
  { name: 'processingStatus', label: 'Статус обробки', type: 'text' },
  { name: 'priority', label: 'Пріоритет', type: 'select', options: ['', 'Низький', 'Середній', 'Високий', 'Критичний'] },
  
  // Поля для зв'язків
  { name: 'parentTaskId', label: 'ID батьківського завдання', type: 'text' },
  { name: 'relatedTasks', label: 'Пов\'язані завдання', type: 'text' },
  
  // Поля для документів
  { name: 'attachments', label: 'Вкладення', type: 'text' },
  { name: 'documents', label: 'Документи', type: 'text' },
  
  // Поля для часу
  { name: 'estimatedTime', label: 'Орієнтовний час виконання', type: 'text' },
  { name: 'actualTime', label: 'Фактичний час виконання', type: 'text' },
  
  // Поля для локації
  { name: 'latitude', label: 'Широта', type: 'text' },
  { name: 'longitude', label: 'Довгота', type: 'text' },
  { name: 'location', label: 'Локація', type: 'text' },
  
  // Поля для клієнта
  { name: 'clientContact', label: 'Контакт клієнта', type: 'text' },
  { name: 'clientPhone', label: 'Телефон клієнта', type: 'text' },
  { name: 'clientEmail', label: 'Email клієнта', type: 'text' },
  
  // Поля для обладнання
  { name: 'equipmentModel', label: 'Модель обладнання', type: 'text' },
  { name: 'equipmentYear', label: 'Рік випуску обладнання', type: 'text' },
  { name: 'equipmentWarranty', label: 'Гарантія обладнання', type: 'text' },
  
  // Поля для сервісу
  { name: 'serviceType', label: 'Тип сервісу', type: 'text' },
  { name: 'serviceCategory', label: 'Категорія сервісу', type: 'text' },
  { name: 'serviceLevel', label: 'Рівень сервісу', type: 'text' },
  
  // Поля для якості
  { name: 'qualityRating', label: 'Оцінка якості', type: 'text' },
  { name: 'customerSatisfaction', label: 'Задоволеність клієнта', type: 'text' },
  
  // Поля для фінансів
  { name: 'costCenter', label: 'Центр витрат', type: 'text' },
  { name: 'profitMargin', label: 'Маржа прибутку', type: 'text' },
  { name: 'discount', label: 'Знижка', type: 'text' },
  { name: 'tax', label: 'Податок', type: 'text' },
  
  // Поля для планування
  { name: 'plannedDate', label: 'Запланована дата', type: 'date' },
  { name: 'deadline', label: 'Термін виконання', type: 'date' },
  { name: 'completionDate', label: 'Дата завершення', type: 'date' },
  
  // Поля для ресурсів
  { name: 'requiredSkills', label: 'Необхідні навички', type: 'text' },
  { name: 'requiredTools', label: 'Необхідні інструменти', type: 'text' },
  { name: 'requiredMaterials', label: 'Необхідні матеріали', type: 'text' },
  
  // Поля для ризиків
  { name: 'riskLevel', label: 'Рівень ризику', type: 'text' },
  { name: 'riskDescription', label: 'Опис ризику', type: 'textarea' },
  { name: 'mitigationPlan', label: 'План зменшення ризику', type: 'textarea' },
  
  // Поля для комунікації
  { name: 'communicationLog', label: 'Журнал комунікації', type: 'textarea' },
  { name: 'stakeholders', label: 'Зацікавлені сторони', type: 'text' },
  
  // Поля для аналітики
  { name: 'performanceMetrics', label: 'Метрики продуктивності', type: 'text' },
  { name: 'efficiency', label: 'Ефективність', type: 'text' },
  { name: 'productivity', label: 'Продуктивність', type: 'text' }
];

// Функція для отримання полів за категоріями
export const getFieldsByCategory = () => {
  return {
    basic: completeTaskFields.filter(f => 
      ['status', 'requestDate', 'date', 'paymentDate', 'company', 'edrpou', 'requestDesc', 'serviceRegion', 'client', 'requestNumber', 'invoice', 'paymentType', 'address'].includes(f.name)
    ),
    equipment: completeTaskFields.filter(f => 
      ['equipmentSerial', 'equipment', 'equipmentModel', 'equipmentYear', 'equipmentWarranty'].includes(f.name)
    ),
    work: completeTaskFields.filter(f => 
      ['work', 'engineer1', 'engineer2', 'serviceTotal', 'workPrice', 'serviceType', 'serviceCategory', 'serviceLevel'].includes(f.name)
    ),
    materials: completeTaskFields.filter(f => 
      f.name.includes('oil') || f.name.includes('filter') || f.name.includes('antifreeze') || f.name.includes('otherMaterials') || f.name.includes('spareParts')
    ),
    transport: completeTaskFields.filter(f => 
      ['carNumber', 'transportKm', 'transportSum'].includes(f.name)
    ),
    expenses: completeTaskFields.filter(f => 
      ['perDiem', 'living', 'otherExp'].includes(f.name)
    ),
    approval: completeTaskFields.filter(f => 
      f.name.includes('approved') || f.name.includes('Comment')
    ),
    additional: completeTaskFields.filter(f => 
      ['comments', 'approvalDate', 'bonusApprovalDate', 'serviceBonus', 'blockDetail', 'reportMonthYear'].includes(f.name)
    ),
    system: completeTaskFields.filter(f => 
      ['id', '_id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(f.name)
    )
  };
};

// Функція для отримання полів для експорту (без системних полів)
export const getExportFields = () => {
  return completeTaskFields.filter(f => 
    !['id', '_id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].includes(f.name)
  );
};

// Функція для отримання полів для форми (без readOnly полів)
export const getFormFields = () => {
  return completeTaskFields.filter(f => !f.readOnly);
};
