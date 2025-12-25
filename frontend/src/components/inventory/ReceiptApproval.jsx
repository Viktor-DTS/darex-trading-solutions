import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './ReceiptApproval.css';

function ReceiptApproval({ user, warehouses }) {
  const [equipmentInTransit, setEquipmentInTransit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadEquipmentInTransit();
  }, []);

  const loadEquipmentInTransit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment?status=in_transit`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG] Завантажено товарів в дорозі:', data.length, data);
        setEquipmentInTransit(data);
      } else {
        const error = await response.json();
        console.error('[ERROR] Помилка завантаження:', error);
        alert(`Помилка завантаження: ${error.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      console.error('Помилка завантаження товарів в дорозі:', error);
      alert('Помилка завантаження товарів в дорозі');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (equipmentId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(equipmentId)) {
        newSet.delete(equipmentId);
      } else {
        newSet.add(equipmentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === equipmentInTransit.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(equipmentInTransit.map(eq => eq._id)));
    }
  };

  const handleApproveReceipt = async () => {
    if (selectedItems.size === 0) {
      alert('Виберіть хоча б один товар для затвердження отримання');
      return;
    }

    if (!confirm(`Затвердити отримання ${selectedItems.size} товарів?`)) {
      return;
    }

    setApproving(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/equipment/approve-receipt`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          equipmentIds: Array.from(selectedItems)
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Успішно затверджено отримання ${result.approvedCount} товарів`);
        setSelectedItems(new Set());
        loadEquipmentInTransit();
        // Оновлюємо лічильник в батьківському компоненті (якщо потрібно)
        if (window.location.reload) {
          // Можна викликати callback для оновлення лічильника
        }
      } else {
        const error = await response.json();
        alert(`Помилка: ${error.error || 'Не вдалося затвердити отримання'}`);
      }
    } catch (error) {
      console.error('Помилка затвердження отримання:', error);
      alert('Помилка затвердження отримання товарів');
    } finally {
      setApproving(false);
    }
  };

  const getWarehouseName = (warehouseId) => {
    if (!warehouseId) return 'Не вказано';
    const warehouse = warehouses.find(w => w._id === warehouseId);
    return warehouse ? warehouse.name : warehouseId;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Не вказано';
    try {
      return new Date(dateString).toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getLastMovement = (equipment) => {
    if (!equipment.movementHistory || equipment.movementHistory.length === 0) {
      return null;
    }
    return equipment.movementHistory[equipment.movementHistory.length - 1];
  };

  // Групуємо товари за складом призначення
  const groupedByWarehouse = equipmentInTransit.reduce((acc, eq) => {
    if (!eq || !eq._id) {
      console.warn('[WARN] Пропущено обладнання без ID:', eq);
      return acc;
    }
    const warehouseId = eq.currentWarehouse || 'unknown';
    const warehouseName = eq.currentWarehouseName || getWarehouseName(warehouseId);
    
    if (!acc[warehouseId]) {
      acc[warehouseId] = {
        warehouseId,
        warehouseName,
        items: []
      };
    }
    acc[warehouseId].items.push(eq);
    return acc;
  }, {});

  console.log('[DEBUG] Згруповано по складах:', groupedByWarehouse);

  if (loading) {
    return <div className="loading-indicator">Завантаження...</div>;
  }

  return (
    <div className="receipt-approval">
      <div className="receipt-approval-header">
        <h2>Затвердження отримання товару</h2>
        <p className="receipt-approval-description">
          Оберіть товари, які отримані на склад. Вибрані товари будуть переведені в статус "На складі".
        </p>
      </div>

      {equipmentInTransit.length === 0 ? (
        <div className="empty-state">
          <p>Немає товарів в дорозі</p>
        </div>
      ) : (
        <>
          <div className="receipt-approval-toolbar">
            <div className="toolbar-left">
              <button
                className="btn-select-all"
                onClick={handleSelectAll}
              >
                {selectedItems.size === equipmentInTransit.length ? 'Скасувати вибір' : 'Вибрати всі'}
              </button>
              <span className="selected-count">
                Вибрано: {selectedItems.size} з {equipmentInTransit.length}
              </span>
            </div>
            <div className="toolbar-right">
              <button
                className="btn-approve-receipt"
                onClick={handleApproveReceipt}
                disabled={selectedItems.size === 0 || approving}
              >
                {approving ? 'Затвердження...' : `✅ Затвердити отримання (${selectedItems.size})`}
              </button>
            </div>
          </div>

          <div className="receipt-approval-content">
            {Object.values(groupedByWarehouse).map(group => (
              <div key={group.warehouseId} className="warehouse-group">
                <div className="warehouse-group-header">
                  <h3>📦 Склад: {group.warehouseName}</h3>
                  <span className="warehouse-count">
                    {group.items.length} {group.items.length === 1 ? 'товар' : 'товарів'}
                  </span>
                </div>
                <div className="equipment-table-wrapper">
                  <table className="equipment-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>
                          <input
                            type="checkbox"
                            checked={group.items.every(item => selectedItems.has(item._id))}
                            onChange={() => {
                              const allSelected = group.items.every(item => selectedItems.has(item._id));
                              if (allSelected) {
                                setSelectedItems(prev => {
                                  const newSet = new Set(prev);
                                  group.items.forEach(item => newSet.delete(item._id));
                                  return newSet;
                                });
                              } else {
                                setSelectedItems(prev => {
                                  const newSet = new Set(prev);
                                  group.items.forEach(item => newSet.add(item._id));
                                  return newSet;
                                });
                              }
                            }}
                          />
                        </th>
                        <th>Тип обладнання</th>
                        <th>Серійний номер</th>
                        <th>Зі складу</th>
                        <th>Дата переміщення</th>
                        <th>Примітки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(item => {
                        const lastMovement = getLastMovement(item);
                        return (
                          <tr key={item._id} className={selectedItems.has(item._id) ? 'selected' : ''}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item._id)}
                                onChange={() => handleToggleSelect(item._id)}
                              />
                            </td>
                            <td>{item.type || '—'}</td>
                            <td>
                              {item.batchId ? (
                                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                  Партія: {item.batchId}
                                </span>
                              ) : (
                                item.serialNumber || '—'
                              )}
                            </td>
                            <td>
                              {lastMovement ? (
                                <div>
                                  <div>{lastMovement.fromWarehouseName || lastMovement.fromWarehouse || '—'}</div>
                                  {lastMovement.movedByName && (
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                      {lastMovement.movedByName}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td>
                              {lastMovement ? formatDate(lastMovement.date) : '—'}
                            </td>
                            <td>
                              {lastMovement?.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ReceiptApproval;

