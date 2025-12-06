import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import './ColumnSettings.css';

// Всі можливі колонки (синхронізовано з TaskTable.jsx)
const ALL_COLUMNS = [
  // Основна інформація
  { key: 'requestNumber', label: '№ Заявки' },
  { key: 'requestDate', label: 'Дата заявки' },
  { key: 'status', label: 'Статус заявки' },
  { key: 'company', label: 'Компанія виконавець' },
  { key: 'serviceRegion', label: 'Регіон сервісного відділу' },
  
  // Клієнт та адреса
  { key: 'edrpou', label: 'ЄДРПОУ' },
  { key: 'client', label: 'Замовник' },
  { key: 'address', label: 'Адреса' },
  { key: 'requestDesc', label: 'Опис заявки' },
  
  // Обладнання
  { key: 'equipment', label: 'Тип обладнання' },
  { key: 'equipmentSerial', label: 'Заводський номер обладнання' },
  { key: 'engineModel', label: 'Модель двигуна' },
  { key: 'engineSerial', label: 'Зав. № двигуна' },
  { key: 'customerEquipmentNumber', label: 'інвент. № обладнання від замовника' },
  
  // Роботи та інженери
  { key: 'work', label: 'Найменування робіт' },
  { key: 'date', label: 'Дата проведення робіт' },
  { key: 'engineer1', label: 'Сервісний інженер №1' },
  { key: 'engineer2', label: 'Сервісний інженер №2' },
  { key: 'engineer3', label: 'Сервісний інженер №3' },
  { key: 'engineer4', label: 'Сервісний інженер №4' },
  { key: 'engineer5', label: 'Сервісний інженер №5' },
  { key: 'engineer6', label: 'Сервісний інженер №6' },
  
  // Фінанси
  { key: 'serviceTotal', label: 'Загальна сума послуги' },
  { key: 'workPrice', label: 'Вартість робіт, грн' },
  { key: 'paymentType', label: 'Вид оплати' },
  { key: 'paymentDate', label: 'Дата оплати' },
  { key: 'invoice', label: 'Номер рахунку' },
  { key: 'invoiceRecipientDetails', label: 'Реквізити отримувача рахунку' },
  
  // Оливи
  { key: 'oilType', label: 'Тип оливи' },
  { key: 'oilUsed', label: 'Використано оливи, л' },
  { key: 'oilPrice', label: 'Ціна оливи за 1 л, грн' },
  { key: 'oilTotal', label: 'Загальна сума за оливу, грн' },
  
  // Фільтри масляні
  { key: 'filterName', label: 'Фільтр масл. назва' },
  { key: 'filterCount', label: 'Фільтр масл. штук' },
  { key: 'filterPrice', label: 'Ціна одного масляного фільтра' },
  { key: 'filterSum', label: 'Загальна сума за фільтри масляні' },
  
  // Фільтри паливні
  { key: 'fuelFilterName', label: 'Фільтр палив. назва' },
  { key: 'fuelFilterCount', label: 'Фільтр палив. штук' },
  { key: 'fuelFilterPrice', label: 'Ціна одного паливного фільтра' },
  { key: 'fuelFilterSum', label: 'Загальна сума за паливні фільтри' },
  
  // Фільтри повітряні
  { key: 'airFilterName', label: 'Фільтр повітряний назва' },
  { key: 'airFilterCount', label: 'Фільтр повітряний штук' },
  { key: 'airFilterPrice', label: 'Ціна одного повітряного фільтра' },
  { key: 'airFilterSum', label: 'Загальна сума за повітряні фільтри' },
  
  // Антифриз
  { key: 'antifreezeType', label: 'Антифриз тип' },
  { key: 'antifreezeL', label: 'Антифриз, л' },
  { key: 'antifreezePrice', label: 'Ціна антифризу' },
  { key: 'antifreezeSum', label: 'Загальна сума за антифриз' },
  
  // Інші матеріали
  { key: 'otherMaterials', label: 'Опис інших матеріалів' },
  { key: 'otherSum', label: 'Загальна ціна інших матеріалів' },
  
  // Транспорт
  { key: 'carNumber', label: 'Держномер автотранспорту' },
  { key: 'transportKm', label: 'Транспортні витрати, км' },
  { key: 'transportSum', label: 'Загальна вартість тр. витрат' },
  
  // Витрати
  { key: 'perDiem', label: 'Добові, грн' },
  { key: 'living', label: 'Проживання, грн' },
  { key: 'otherExp', label: 'Інші витрати, грн' },
  { key: 'serviceBonus', label: 'Премія за виконання сервісних робіт, грн' },
  
  // Підтвердження зав. складу
  { key: 'approvedByWarehouse', label: 'Підтвердження зав. складу' },
  { key: 'warehouseApprovalDate', label: 'Дата підтвердження зав. складу' },
  { key: 'warehouseComment', label: 'Опис відмови (зав. склад)' },
  
  // Підтвердження бухгалтера
  { key: 'approvedByAccountant', label: 'Підтвердження бухгалтера' },
  { key: 'accountantComment', label: 'Опис відмови (бухгалтер)' },
  { key: 'accountantComments', label: 'Коментарії бухгалтера' },
  
  // Підтвердження регіонального керівника
  { key: 'approvedByRegionalManager', label: 'Підтвердження регіонального керівника' },
  { key: 'regionalManagerComment', label: 'Опис відмови (регіональний керівник)' },
  
  // Інші поля
  { key: 'comments', label: 'Коментарі' },
  { key: 'approvalDate', label: 'Дата затвердження' },
  { key: 'bonusApprovalDate', label: 'Дата затвердження премії' },
  { key: 'reportMonthYear', label: 'Місяць/рік для звіту' },
  { key: 'blockDetail', label: 'Детальний опис блокування заявки' },
  
  // Чекбокси
  { key: 'needInvoice', label: 'Потрібен рахунок' },
  { key: 'needAct', label: 'Потрібен акт виконаних робіт' },
  { key: 'debtStatus', label: 'Заборгованість по Акти виконаних робіт' },
  { key: 'debtStatusCheckbox', label: 'Документи в наявності' },
  
  // Автоматичні дати
  { key: 'autoCreatedAt', label: 'Авт. створення заявки' },
  { key: 'autoCompletedAt', label: 'Авт. виконанно' },
  { key: 'autoWarehouseApprovedAt', label: 'Авт. затвердження завскладом' },
  { key: 'autoAccountantApprovedAt', label: 'Авт. затвердження бухгалтером' },
  { key: 'invoiceRequestDate', label: 'Дата заявки на рахунок' },
  { key: 'invoiceUploadDate', label: 'Дата завантаження рахунку' },
  
  // Файли
  { key: 'contractFile', label: 'Файл договору' },
];

function ColumnSettings({ user, area, onClose }) {
  const [visibleColumns, setVisibleColumns] = useState([]);
  const [columnOrder, setColumnOrder] = useState([]);
  const [columnWidths, setColumnWidths] = useState({});
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [loading, setLoading] = useState(true);

  // Завантаження налаштувань
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(
          `${API_BASE_URL}/users/${user.login}/columns-settings/${area}`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (response.ok) {
          const settings = await response.json();
          // Якщо налаштування порожні, використовуємо основні колонки
          if (!settings.visible || settings.visible.length === 0) {
            const defaultColumns = [
              'requestNumber', 'requestDate', 'client', 'address', 'equipment',
              'equipmentSerial', 'work', 'date', 'engineer1', 'engineer2',
              'serviceRegion', 'status', 'serviceTotal', 'paymentDate', 'invoice',
              'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager'
            ];
            setVisibleColumns(defaultColumns);
            setColumnOrder(defaultColumns);
          } else {
            setVisibleColumns(settings.visible);
            setColumnOrder(settings.order || settings.visible);
            setColumnWidths(settings.widths || {});
          }
        } else {
          // За замовчуванням - основні колонки
          const defaultColumns = [
            'requestNumber', 'requestDate', 'client', 'address', 'equipment',
            'equipmentSerial', 'work', 'date', 'engineer1', 'engineer2',
            'serviceRegion', 'status', 'serviceTotal', 'paymentDate', 'invoice',
            'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager'
          ];
          setVisibleColumns(defaultColumns);
          setColumnOrder(defaultColumns);
        }
      } catch (err) {
        console.error('Помилка завантаження налаштувань:', err);
        // За замовчуванням - основні колонки
        const defaultColumns = [
          'requestNumber', 'requestDate', 'client', 'address', 'equipment',
          'equipmentSerial', 'work', 'date', 'engineer1', 'engineer2',
          'serviceRegion', 'status', 'serviceTotal', 'paymentDate', 'invoice',
          'approvedByWarehouse', 'approvedByAccountant', 'approvedByRegionalManager'
        ];
        setVisibleColumns(defaultColumns);
        setColumnOrder(defaultColumns);
      } finally {
        setLoading(false);
      }
    };

    if (user?.login) {
      loadSettings();
    }
  }, [user, area]);

  // Збереження налаштувань
  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Перевірка, що всі дані присутні
      if (!visibleColumns || visibleColumns.length === 0) {
        alert('Помилка: не вибрано жодної колонки');
        return;
      }
      
      if (!columnOrder || columnOrder.length === 0) {
        alert('Помилка: не встановлено порядок колонок');
        return;
      }
      
      const payload = {
        area,
        visible: visibleColumns,
        order: columnOrder,
        widths: columnWidths || {}
      };
      
      console.log('[DEBUG] Збереження налаштувань:', payload);
      
      const response = await fetch(
        `${API_BASE_URL}/users/${user.login}/columns-settings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      console.log('[DEBUG] Статус відповіді:', response.status, response.statusText);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[DEBUG] Відповідь від сервера:', result);
        alert('Налаштування збережено!');
        onClose();
        // Використовуємо setTimeout для забезпечення збереження перед перезавантаженням
        setTimeout(() => {
          window.location.reload();
        }, 100);
      } else {
        const errorText = await response.text();
        console.error('[ERROR] Помилка збереження:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          errorData = { error: errorText || 'Невідома помилка' };
        }
        
        alert(`Помилка збереження налаштувань: ${errorData.error || response.statusText}`);
        throw new Error(errorData.error || 'Помилка збереження');
      }
    } catch (err) {
      console.error('Помилка збереження налаштувань:', err);
      alert(`Помилка збереження налаштувань: ${err.message}`);
    }
  };

  // Перемикання видимості колонки
  const toggleColumn = (key) => {
    if (visibleColumns.includes(key)) {
      // Видаляємо колонку
      const newVisible = visibleColumns.filter(k => k !== key);
      const newOrder = columnOrder.filter(k => k !== key);
      setVisibleColumns(newVisible);
      setColumnOrder(newOrder);
      console.log('[DEBUG] Колонка видалена:', key);
    } else {
      // Додаємо колонку в кінець
      const newVisible = [...visibleColumns, key];
      const newOrder = [...columnOrder, key];
      setVisibleColumns(newVisible);
      setColumnOrder(newOrder);
      console.log('[DEBUG] Колонка додана:', key);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (draggedItem === null || draggedItem === dropIndex) {
      setDragOverIndex(null);
      return;
    }

    // Отримуємо тільки видимі колонки в правильному порядку
    const visibleOrder = columnOrder.filter(key => visibleColumns.includes(key));
    
    // Переміщуємо елемент
    const [removed] = visibleOrder.splice(draggedItem, 1);
    visibleOrder.splice(dropIndex, 0, removed);

    // Створюємо новий порядок: спочатку видимі в новому порядку, потім невидимі
    const invisibleOrder = columnOrder.filter(key => !visibleColumns.includes(key));
    const newOrder = [...visibleOrder, ...invisibleOrder];

    setColumnOrder(newOrder);
    setDraggedItem(null);
    setDragOverIndex(null);
    console.log('[DEBUG] Порядок колонок змінено:', {
      draggedIndex: draggedItem,
      dropIndex,
      newOrder: newOrder.slice(0, visibleOrder.length) // Показуємо тільки видимі
    });
  };

  // Зміна ширини колонки
  const handleWidthChange = (key, width) => {
    const newWidth = parseInt(width);
    if (isNaN(newWidth) || newWidth < 50) {
      return; // Не зберігаємо невалідні значення
    }
    const newWidths = {
      ...columnWidths,
      [key]: newWidth // Зберігаємо як число
    };
    setColumnWidths(newWidths);
    console.log('[DEBUG] Ширина колонки змінена:', key, newWidth, typeof newWidth);
  };

  if (loading) {
    return (
      <div className="column-settings-overlay" onClick={onClose}>
        <div className="column-settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Завантаження...</div>
        </div>
      </div>
    );
  }

  // Відображаємо тільки видимі колонки в правильному порядку
  const displayedColumns = columnOrder
    .filter(key => visibleColumns.includes(key))
    .map(key => ALL_COLUMNS.find(col => col.key === key))
    .filter(Boolean);

  return (
    <div className="column-settings-overlay" onClick={onClose}>
      <div className="column-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Налаштування колонок</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-content">
          <div className="settings-section">
            <h3>Видимі колонки ({visibleColumns.length} з {ALL_COLUMNS.length})</h3>
            <div className="columns-list">
              {ALL_COLUMNS.map(col => (
                <label key={col.key} className="column-checkbox">
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <h3>Порядок колонок (перетягніть для зміни)</h3>
            <div className="drag-drop-header">
              <span className="header-drag"></span>
              <span className="header-label">Назва колонки</span>
              <span className="header-width">Ширина (px)</span>
            </div>
            <div className="drag-drop-list">
              {displayedColumns.map((col, index) => (
                <div
                  key={col.key}
                  className={`drag-item ${draggedItem === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <span className="drag-handle">☰</span>
                  <span className="drag-label">{col.label}</span>
                  <input
                    type="number"
                    className="width-input"
                    value={columnWidths[col.key] || ALL_COLUMNS.find(c => c.key === col.key)?.width || 150}
                    onChange={(e) => handleWidthChange(col.key, e.target.value)}
                    onBlur={(e) => {
                      // Перевіряємо значення при втраті фокусу
                      const value = parseInt(e.target.value);
                      if (isNaN(value) || value < 50) {
                        e.target.value = columnWidths[col.key] || ALL_COLUMNS.find(c => c.key === col.key)?.width || 150;
                      }
                    }}
                    min="50"
                    max="1000"
                    placeholder="Ширина"
                  />
                  <span className="width-unit">px</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Скасувати
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

export default ColumnSettings;
