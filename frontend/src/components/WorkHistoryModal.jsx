import React from 'react';
import './WorkHistoryModal.css';

function WorkHistoryModal({ tasks, onClose }) {
  const formatDate = (dateValue) => {
    if (!dateValue) return '';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  const formatDateTime = (dateValue) => {
    if (!dateValue) return '';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const formatNumber = (num) => {
    if (!num && num !== 0) return '';
    return parseFloat(num).toFixed(2);
  };

  // Переконуємося, що tasks - це масив
  const tasksArray = Array.isArray(tasks) ? tasks : [tasks];
  
  // Сортуємо від новіших до старіших (якщо ще не відсортовано)
  const sortedTasks = [...tasksArray].sort((a, b) => {
    const dateA = new Date(a.requestDate || a.date || 0);
    const dateB = new Date(b.requestDate || b.date || 0);
    return dateB - dateA; // Від новіших до старіших
  });

  const renderTaskDetails = (task, index) => {
    return (
      <div key={task.id || task._id || index} className="task-history-item">
        <div className="task-history-header">
          <h4>Заявка #{index + 1} - {task.requestNumber || 'Без номера'}</h4>
          <div className="task-history-dates">
            <span>Дата заявки: {formatDate(task.requestDate)}</span>
            {task.date && <span>Дата проведення робіт: {formatDate(task.date)}</span>}
          </div>
        </div>

        {/* Основна інформація */}
        <div className="history-section">
          <h3>Основна інформація</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Номер заявки/наряду:</label>
              <span>{task.requestNumber || ''}</span>
            </div>
            <div className="history-field">
              <label>Статус заявки:</label>
              <span>{task.status || ''}</span>
            </div>
            <div className="history-field">
              <label>Дата заявки:</label>
              <span>{formatDate(task.requestDate)}</span>
            </div>
            <div className="history-field">
              <label>Компанія виконавець:</label>
              <span>{task.company || ''}</span>
            </div>
            <div className="history-field">
              <label>Регіон сервісного відділу:</label>
              <span>{task.serviceRegion || ''}</span>
            </div>
            <div className="history-field">
              <label>Загальна сума послуги, грн:</label>
              <span>{formatNumber(task.serviceTotal)}</span>
            </div>
            <div className="history-field">
              <label>Дата проведення робіт:</label>
              <span>{formatDate(task.date)}</span>
            </div>
            <div className="history-field">
              <label>Найменування робіт:</label>
              <span>{task.work || ''}</span>
            </div>
          </div>
        </div>

        {/* Обладнання */}
        <div className="history-section">
          <h3>Обладнання</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Тип обладнання:</label>
              <span>{task.equipment || ''}</span>
            </div>
            <div className="history-field">
              <label>Заводський номер обладнання:</label>
              <span>{task.equipmentSerial || ''}</span>
            </div>
            <div className="history-field">
              <label>Модель двигуна:</label>
              <span>{task.engineModel || ''}</span>
            </div>
            <div className="history-field">
              <label>Зав. № двигуна:</label>
              <span>{task.engineSerial || ''}</span>
            </div>
            <div className="history-field">
              <label>Інвент. № обладнання від замовника:</label>
              <span>{task.customerEquipmentNumber || ''}</span>
            </div>
          </div>
        </div>

        {/* Оливи */}
        <div className="history-section">
          <h3>Оливи</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Тип оливи:</label>
              <span>{task.oilType || ''}</span>
            </div>
            <div className="history-field">
              <label>Використано, л:</label>
              <span>{formatNumber(task.oilUsed || task.oilL)}</span>
            </div>
            <div className="history-field">
              <label>Ціна за 1 л, грн:</label>
              <span>{formatNumber(task.oilPrice)}</span>
            </div>
            <div className="history-field">
              <label>Сума, грн:</label>
              <span>{formatNumber(task.oilTotal)}</span>
            </div>
          </div>
        </div>

        {/* Масляний фільтр */}
        <div className="history-section">
          <h3>Масляний фільтр</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Назва:</label>
              <span>{task.filterName || task.oilFilterName || ''}</span>
            </div>
            <div className="history-field">
              <label>Штук:</label>
              <span>{formatNumber(task.filterCount || task.oilFilterCount)}</span>
            </div>
            <div className="history-field">
              <label>Ціна одного, грн:</label>
              <span>{formatNumber(task.filterPrice || task.oilFilterPrice)}</span>
            </div>
            <div className="history-field">
              <label>Сума, грн:</label>
              <span>{formatNumber(task.filterSum || task.oilFilterSum)}</span>
            </div>
          </div>
        </div>

        {/* Паливний фільтр */}
        <div className="history-section">
          <h3>Паливний фільтр</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Назва:</label>
              <span>{task.fuelFilterName || ''}</span>
            </div>
            <div className="history-field">
              <label>Штук:</label>
              <span>{formatNumber(task.fuelFilterCount)}</span>
            </div>
            <div className="history-field">
              <label>Ціна одного, грн:</label>
              <span>{formatNumber(task.fuelFilterPrice)}</span>
            </div>
            <div className="history-field">
              <label>Сума, грн:</label>
              <span>{formatNumber(task.fuelFilterSum)}</span>
            </div>
          </div>
        </div>

        {/* Повітряний фільтр */}
        <div className="history-section">
          <h3>Повітряний фільтр</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Назва:</label>
              <span>{task.airFilterName || ''}</span>
            </div>
            <div className="history-field">
              <label>Штук:</label>
              <span>{formatNumber(task.airFilterCount)}</span>
            </div>
            <div className="history-field">
              <label>Ціна одного, грн:</label>
              <span>{formatNumber(task.airFilterPrice)}</span>
            </div>
            <div className="history-field">
              <label>Сума, грн:</label>
              <span>{formatNumber(task.airFilterSum)}</span>
            </div>
          </div>
        </div>

        {/* Антифриз */}
        <div className="history-section">
          <h3>Антифриз</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Тип:</label>
              <span>{task.antifreezeType || ''}</span>
            </div>
            <div className="history-field">
              <label>Літри:</label>
              <span>{formatNumber(task.antifreezeL)}</span>
            </div>
            <div className="history-field">
              <label>Ціна, грн:</label>
              <span>{formatNumber(task.antifreezePrice)}</span>
            </div>
            <div className="history-field">
              <label>Сума, грн:</label>
              <span>{formatNumber(task.antifreezeSum)}</span>
            </div>
          </div>
        </div>

        {/* Інші матеріали */}
        <div className="history-section">
          <h3>Інші матеріали</h3>
          <div className="history-grid">
            <div className="history-field full-width">
              <label>Опис інших матеріалів:</label>
              <span>{task.otherMaterials || ''}</span>
            </div>
            <div className="history-field">
              <label>Загальна ціна, грн:</label>
              <span>{formatNumber(task.otherSum)}</span>
            </div>
          </div>
        </div>

        {/* Вартість робіт */}
        <div className="history-section">
          <h3>Вартість робіт</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Вартість робіт, грн (авторозрахунок):</label>
              <span>{formatNumber(task.workPrice)}</span>
            </div>
          </div>
        </div>

        {/* Сервісні інженери */}
        <div className="history-section">
          <h3>Сервісні інженери</h3>
          <div className="history-grid">
            {[1, 2, 3, 4, 5, 6].map(num => {
              const engineer = task[`engineer${num}`];
              if (!engineer) return null;
              return (
                <div key={num} className="history-field">
                  <label>Сервісний інженер №{num}:</label>
                  <span>{engineer}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Витрати */}
        <div className="history-section">
          <h3>Витрати</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Добові, грн:</label>
              <span>{formatNumber(task.perDiem)}</span>
            </div>
            <div className="history-field">
              <label>Проживання, грн:</label>
              <span>{formatNumber(task.living)}</span>
            </div>
            <div className="history-field">
              <label>Інші витрати, грн:</label>
              <span>{formatNumber(task.otherExp)}</span>
            </div>
            <div className="history-field">
              <label>Держномер автотранспорту:</label>
              <span>{task.carNumber || ''}</span>
            </div>
            <div className="history-field">
              <label>Транспортні витрати, км:</label>
              <span>{formatNumber(task.transportKm)}</span>
            </div>
            <div className="history-field">
              <label>Загальна вартість тр. витрат, грн:</label>
              <span>{formatNumber(task.transportSum)}</span>
            </div>
          </div>
        </div>

        {/* Клієнт та контакти */}
        <div className="history-section">
          <h3>Клієнт та контакти</h3>
          <div className="history-grid">
            <div className="history-field">
              <label>Регіон сервісного відділу:</label>
              <span>{task.serviceRegion || ''}</span>
            </div>
            <div className="history-field">
              <label>Запланована дата робіт:</label>
              <span>{formatDate(task.plannedDate)}</span>
            </div>
            <div className="history-field">
              <label>Контактна особа:</label>
              <span>{task.contactPerson || ''}</span>
            </div>
            <div className="history-field">
              <label>ПІБ контактної особи:</label>
              <span>{task.contactPerson || ''}</span>
            </div>
            <div className="history-field">
              <label>Тел. контактної особи:</label>
              <span>{task.contactPhone || ''}</span>
            </div>
            <div className="history-field full-width">
              <label>Опис заявки:</label>
              <span>{task.requestDesc || ''}</span>
            </div>
            <div className="history-field">
              <label>🔥 Термінова заявка:</label>
              <span>{task.urgentRequest ? 'Так' : 'Ні'}</span>
            </div>
            <div className="history-field">
              <label>Внутрішні роботи:</label>
              <span>{task.internalWork ? 'Так' : 'Ні'}</span>
            </div>
            <div className="history-field">
              <label>Замовник:</label>
              <span>{task.client || ''}</span>
            </div>
            <div className="history-field">
              <label>ЄДРПОУ:</label>
              <span>{task.edrpou || ''}</span>
            </div>
            <div className="history-field full-width">
              <label>Адреса:</label>
              <span>{task.address || ''}</span>
            </div>
            <div className="history-field">
              <label>Номер рахунку:</label>
              <span>{task.invoice || ''}</span>
            </div>
            <div className="history-field">
              <label>Дата оплати:</label>
              <span>{formatDate(task.paymentDate)}</span>
            </div>
            <div className="history-field">
              <label>Вид оплати:</label>
              <span>{task.paymentType || ''}</span>
            </div>
            <div className="history-field full-width">
              <label>Реквізити отримувача рахунку в паперовому вигляді:</label>
              <span>{task.invoiceRecipientDetails || ''}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="work-history-modal-overlay" onClick={onClose}>
      <div className="work-history-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="work-history-modal-header">
          <h2>📋 Історія проведення робіт ({sortedTasks.length} заявок)</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="work-history-modal-body">
          {sortedTasks.map((task, index) => (
            <React.Fragment key={task.id || task._id || index}>
              {renderTaskDetails(task, index)}
              {index < sortedTasks.length - 1 && (
                <div className="task-history-divider"></div>
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="work-history-modal-footer">
          <button className="btn-close" onClick={onClose}>Закрити</button>
        </div>
      </div>
    </div>
  );
}

export default WorkHistoryModal;
