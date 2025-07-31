import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

const ExcelImportModal = ({ open, onClose, onImport }) => {
  const [excelData, setExcelData] = useState(null);
  const [excelColumns, setExcelColumns] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [isMappingComplete, setIsMappingComplete] = useState(false);
  const fileInputRef = useRef(null);

  // Поля форми завдання
  const taskFields = [
    { name: 'requestDate', label: 'Дата заявки' },
    { name: 'requestDesc', label: 'Опис заявки' },
    { name: 'serviceRegion', label: 'Сервісний регіон' },
    { name: 'address', label: 'Адреса' },
    { name: 'equipmentSerial', label: 'Серійний номер обладнання' },
    { name: 'equipment', label: 'Обладнання' },
    { name: 'work', label: 'Робота' },
    { name: 'date', label: 'Дата виконання' },
    { name: 'engineer1', label: 'Інженер 1' },
    { name: 'engineer2', label: 'Інженер 2' },
    { name: 'client', label: 'Клієнт' },
    { name: 'company', label: 'Компанія виконавець' },
    { name: 'invoice', label: 'Рахунок' },
    { name: 'paymentType', label: 'Тип оплати' },
    { name: 'serviceTotal', label: 'Загальна сума сервісу' },
    { name: 'oilType', label: 'Тип масла' },
    { name: 'oilUsed', label: 'Використано масла' },
    { name: 'oilPrice', label: 'Ціна масла' },
    { name: 'oilTotal', label: 'Загальна сума масла' },
    { name: 'filterName', label: 'Назва фільтра' },
    { name: 'filterCount', label: 'Кількість фільтрів' },
    { name: 'filterPrice', label: 'Ціна фільтра' },
    { name: 'filterSum', label: 'Сума фільтрів' },
    { name: 'fuelFilterName', label: 'Назва паливного фільтра' },
    { name: 'fuelFilterCount', label: 'Кількість паливних фільтрів' },
    { name: 'fuelFilterPrice', label: 'Ціна паливного фільтра' },
    { name: 'fuelFilterSum', label: 'Сума паливних фільтрів' },
    { name: 'antifreezeType', label: 'Тип антифризу' },
    { name: 'antifreezeL', label: 'Літри антифризу' },
    { name: 'antifreezePrice', label: 'Ціна антифризу' },
    { name: 'antifreezeSum', label: 'Сума антифризу' },
    { name: 'otherMaterials', label: 'Інші матеріали' },
    { name: 'otherSum', label: 'Сума інших матеріалів' },
    { name: 'workPrice', label: 'Ціна роботи' },
    { name: 'perDiem', label: 'Добові' },
    { name: 'living', label: 'Проживання' },
    { name: 'otherExp', label: 'Інші витрати' },
    { name: 'carNumber', label: 'Номер автомобіля' },
    { name: 'transportKm', label: 'Кілометри транспорту' },
    { name: 'transportSum', label: 'Сума транспорту' }
  ];

  // Додаю функцію для конвертації дат з Excel-формату у ISO-формат
  function excelDateToISO(excelDate) {
    if (!excelDate) return '';
    if (typeof excelDate === 'number') {
      const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
      return date.toISOString().split('T')[0];
    }
    if (typeof excelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(excelDate)) return excelDate;
    if (typeof excelDate === 'string' && /^\d{2}\.\d{2}\.\d{4}$/.test(excelDate)) {
      const [d, m, y] = excelDate.split('.');
      return `${y}-${m}-${d}`;
    }
    return excelDate;
  }

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          alert('Файл порожній або не містить даних');
          return;
        }

        const headers = jsonData[0];
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ''));

        setExcelColumns(headers);
        setExcelData(rows);
        
        // Автоматичне мапінгування на основі схожих назв
        const autoMapping = {};
        headers.forEach((header, index) => {
          const headerLower = header.toLowerCase();
          const matchedField = taskFields.find(field => 
            field.label.toLowerCase().includes(headerLower) || 
            headerLower.includes(field.name.toLowerCase()) ||
            field.name.toLowerCase().includes(headerLower)
          );
          if (matchedField) {
            autoMapping[matchedField.name] = index;
          }
        });
        
        setFieldMapping(autoMapping);
        checkMappingComplete(autoMapping);
      } catch (error) {
        console.error('Помилка читання файлу:', error);
        alert('Помилка читання Excel файлу. Перевірте формат файлу.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleMappingChange = (taskField, excelColumnIndex) => {
    const newMapping = { ...fieldMapping };
    if (excelColumnIndex === '') {
      delete newMapping[taskField];
    } else {
      newMapping[taskField] = parseInt(excelColumnIndex);
    }
    setFieldMapping(newMapping);
    checkMappingComplete(newMapping);
  };

  const checkMappingComplete = (mapping) => {
    // Перевіряємо, чи є хоча б основні поля
    const requiredFields = ['requestDesc', 'serviceRegion', 'address', 'equipment'];
    const hasRequiredFields = requiredFields.some(field => mapping[field] !== undefined);
    setIsMappingComplete(hasRequiredFields);
  };

  const handleImport = () => {
    if (!excelData || !isMappingComplete) {
      alert('Будь ласка, налаштуйте мапінг полів');
      return;
    }

    const importedTasks = excelData.map((row, index) => {
      const task = {
        id: Date.now() + index,
        status: (fieldMapping.status !== undefined && row[fieldMapping.status]) ? String(row[fieldMapping.status]) : 'Виконано',
        requestDate: new Date().toISOString().split('T')[0],
        approvedByWarehouse: null,
        warehouseComment: '',
        approvedByAccountant: null,
        accountantComment: '',
        accountantComments: '',
        approvedByRegionalManager: null,
        regionalComment: ''
      };

      // Заповнюємо поля на основі мапінгу
      Object.entries(fieldMapping).forEach(([taskField, excelIndex]) => {
        let value = row[excelIndex];
        // Якщо поле є датою, конвертуємо у ISO-формат
        if ([
          'requestDate', 'date', 'Дата заявки', 'Дата виконання', 'Дата проведення робіт', 'Дата затвердження премії'
        ].includes(taskField)) {
          value = excelDateToISO(value);
        }
        if (value !== undefined && value !== null) {
          task[taskField] = String(value);
        }
      });

      // Якщо після мапінгу статус все ще порожній, ставимо 'Виконано'
      if (!task.status) task.status = 'Виконано';

      return task;
    });

    onImport(importedTasks);
    onClose();
  };

  const resetForm = () => {
    setExcelData(null);
    setExcelColumns([]);
    setFieldMapping({});
    setIsMappingComplete(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.7)',
      zIndex: 3000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: '8px',
        padding: '32px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        minWidth: '800px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, color: '#22334a' }}>Імпорт завдань з Excel</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
        </div>

        {/* Завантаження файлу */}
        <div style={{ marginBottom: '24px' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            style={{ marginBottom: '12px' }}
          />
          {excelData && (
            <div style={{ color: '#666', fontSize: '14px' }}>
              Завантажено {excelData.length} рядків з {excelColumns.length} колонками
            </div>
          )}
        </div>

        {/* Таблиця мапінгу */}
        {excelData && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: '#22334a' }}>Налаштування залежності полів</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: '1fr 1fr', 
              gap: '24px',
              maxHeight: '400px',
              overflow: 'auto'
            }}>
              <div>
                <h4 style={{ marginBottom: '12px', color: '#22334a' }}>Поля форми завдання</h4>
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '8px' }}>
                  {taskFields.map((field) => (
                    <div key={field.name} style={{ 
                      padding: '8px', 
                      borderBottom: '1px solid #eee',
                      backgroundColor: fieldMapping[field.name] !== undefined ? '#e8f5e8' : '#fff',
                      color: '#111'
                    }}>
                      <strong style={{color:'#111'}}>{field.label}</strong>
                      <br />
                      <small style={{ color: '#666' }}>{field.name}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 style={{ marginBottom: '12px', color: '#22334a' }}>Колонки Excel файлу</h4>
                <div style={{ border: '1px solid #ddd', borderRadius: '4px', padding: '8px' }}>
                  {excelColumns.map((column, index) => {
                    const field = taskFields.find(f => f.name === column || f.label === column);
                    return (
                      <div key={index} style={{ 
                        padding: '8px', 
                        borderBottom: '1px solid #eee',
                        backgroundColor: Object.values(fieldMapping).includes(index) ? '#e8f5e8' : '#fff',
                        color: '#111'
                      }}>
                        <strong style={{color:'#111'}}>{field ? field.label : (column || `Колонка ${index + 1}`)}</strong>
                        <br />
                        <small style={{ color: '#666' }}>{column ? '' : `Колонка ${index + 1}`}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Таблиця мапінгу */}
            <div style={{ marginTop: '16px' }}>
              <h4 style={{ marginBottom: '12px', color: '#22334a' }}>Залежність полів</h4>
              <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                maxHeight: '300px', 
                overflow: 'auto' 
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                        Поле форми
                      </th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                        Колонка Excel
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskFields.map((field) => (
                      <tr key={field.name}>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: '#111' }}>
                          <strong style={{color:'#111'}}>{field.label}</strong>
                          <br />
                          <small style={{ color: '#666' }}>{field.name}</small>
                        </td>
                        <td style={{ padding: '12px', borderBottom: '1px solid #eee', color: '#111' }}>
                          <select
                            value={fieldMapping[field.name] || ''}
                            onChange={(e) => handleMappingChange(field.name, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              color: '#111',
                              background: '#fff'
                            }}
                          >
                            <option value="">Не вибрано</option>
                            {excelColumns.map((column, index) => {
                              const field = taskFields.find(f => f.name === column || f.label === column);
                              return (
                                <option key={index} value={index} style={{color:'#111',background:'#fff'}}>
                                  {field ? field.label : (column || `Колонка ${index + 1}`)}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Кнопки */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={resetForm}
            style={{
              background: '#888',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '12px 24px',
              cursor: 'pointer'
            }}
          >
            Скинути
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '12px 24px',
              cursor: 'pointer'
            }}
          >
            Скасувати
          </button>
          <button
            onClick={handleImport}
            disabled={!isMappingComplete}
            style={{
              background: isMappingComplete ? '#00bfff' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '12px 24px',
              cursor: isMappingComplete ? 'pointer' : 'not-allowed',
              fontWeight: '600'
            }}
          >
            Завантажити дані
          </button>
        </div>

        {!isMappingComplete && excelData && (
          <div style={{ 
            marginTop: '12px', 
            padding: '12px', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            color: '#856404'
          }}>
            ⚠️ Для продовження потрібно налаштувати залежність хоча б основних полів (Опис заявки, Сервісний регіон, Адреса, Обладнання)
          </div>
        )}
      </div>
    </div>
  );
};

export default ExcelImportModal; 