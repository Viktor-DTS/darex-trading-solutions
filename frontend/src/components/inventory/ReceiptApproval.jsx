import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../../config';
import './ReceiptApproval.css';

function ReceiptApproval({ user, warehouses }) {
  const [movementDocuments, setMovementDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentItems, setDocumentItems] = useState([]);

  useEffect(() => {
    loadMovementDocuments();
  }, []);

  const loadMovementDocuments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // Завантажуємо документи переміщення зі статусом in_transit
      const response = await fetch(`${API_BASE_URL}/documents/movement?status=in_transit`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const documents = await response.json();
        console.log('[DEBUG] Завантажено документів переміщення:', documents.length);
        
        // Збираємо всі ID товарів з усіх документів
        const allEquipmentIds = new Set(
          documents.flatMap(doc => 
            (doc.items || []).map(item => item.equipmentId).filter(Boolean)
          )
        );
        
        // Завантажуємо всі товари в дорозі одним запитом
        let allEquipment = [];
        if (allEquipmentIds.size > 0) {
          try {
            const allInTransitResponse = await fetch(`${API_BASE_URL}/equipment?status=in_transit`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (allInTransitResponse.ok) {
              const allInTransit = await allInTransitResponse.json();
              // Фільтруємо тільки ті товари, які є в документах
              allEquipment = allInTransit.filter(eq => allEquipmentIds.has(eq._id));
            }
          } catch (err) {
            console.error('Помилка завантаження товарів:', err);
          }
        }
        
        // Створюємо мапу для швидкого пошуку
        const equipmentMap = new Map(allEquipment.map(eq => [eq._id, eq]));
        
        // Для кожного документа додаємо товари
        const documentsWithItems = documents.map((doc) => {
          const items = [];
          if (doc.items && doc.items.length > 0) {
            for (const item of doc.items) {
              if (item.equipmentId) {
                const equipment = equipmentMap.get(item.equipmentId);
                // Перевіряємо, чи товар дійсно в дорозі
                if (equipment && equipment.status === 'in_transit') {
                  items.push({
                    ...equipment,
                    quantity: item.quantity || 1,
                    notes: item.notes || ''
                  });
                }
              }
            }
          }
          return {
            ...doc,
            items,
            totalItems: items.length
          };
        });
        
        setMovementDocuments(documentsWithItems);
      } else {
        const error = await response.json();
        console.error('[ERROR] Помилка завантаження:', error);
        alert(`Помилка завантаження: ${error.error || 'Невідома помилка'}`);
      }
    } catch (error) {
      console.error('Помилка завантаження документів переміщення:', error);
      alert('Помилка завантаження документів переміщення');
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
    // Збираємо всі ID товарів з усіх документів
    const allItemIds = movementDocuments.flatMap(doc => 
      doc.items.map(item => item._id).filter(Boolean)
    );
    
    if (selectedItems.size === allItemIds.length && allItemIds.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(allItemIds));
    }
  };

  const handleDocumentClick = (document) => {
    setSelectedDocument(document);
    setDocumentItems(document.items || []);
    setShowDocumentModal(true);
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
        loadMovementDocuments(); // Оновлюємо список документів
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

  // Групуємо документи переміщення за складом призначення
  const groupedByWarehouse = movementDocuments.reduce((acc, doc) => {
    if (!doc || !doc._id) {
      console.warn('[WARN] Пропущено документ без ID:', doc);
      return acc;
    }
    const warehouseId = doc.toWarehouse || 'unknown';
    const warehouseName = doc.toWarehouseName || getWarehouseName(warehouseId);
    
    if (!acc[warehouseId]) {
      acc[warehouseId] = {
        warehouseId,
        warehouseName,
        documents: []
      };
    }
    acc[warehouseId].documents.push(doc);
    return acc;
  }, {});

  // Підраховуємо загальну кількість товарів
  const totalItemsCount = movementDocuments.reduce((sum, doc) => sum + (doc.totalItems || 0), 0);

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

      {movementDocuments.length === 0 ? (
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
                {selectedItems.size === totalItemsCount && totalItemsCount > 0 ? 'Скасувати вибір' : 'Вибрати всі'}
              </button>
              <span className="selected-count">
                Вибрано: {selectedItems.size} з {totalItemsCount}
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
            {Object.values(groupedByWarehouse).map(group => {
              return (
                <div key={group.warehouseId} className="warehouse-group">
                  <div className="warehouse-group-header">
                    <h3>📦 Склад: {group.warehouseName}</h3>
                    <span className="warehouse-count">
                      {group.documents.length} {group.documents.length === 1 ? 'переміщення' : 'переміщень'}
                    </span>
                  </div>
                  {group.documents && group.documents.length > 0 ? (
                    <div className="equipment-table-wrapper">
                      <table className="equipment-table">
                        <thead>
                          <tr>
                            <th>Документ</th>
                            <th>Тип обладнання</th>
                            <th>Кількість</th>
                            <th>Зі складу</th>
                            <th>Дата переміщення</th>
                            <th>Хто перемістив</th>
                            <th>Примітки</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.documents.map(doc => {
                            const allItemsSelected = doc.items.length > 0 && 
                              doc.items.every(item => item._id && selectedItems.has(item._id));
                            const someItemsSelected = doc.items.some(item => item._id && selectedItems.has(item._id));
                            
                            return (
                              <tr 
                                key={doc._id} 
                                className={`movement-document-row ${someItemsSelected ? 'partially-selected' : ''} ${allItemsSelected ? 'fully-selected' : ''}`}
                                onClick={() => handleDocumentClick(doc)}
                                style={{ cursor: 'pointer' }}
                              >
                                <td>
                                  <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                    {doc.documentNumber || '—'}
                                  </div>
                                </td>
                                <td>
                                  {doc.items.length > 0 ? (
                                    <div>
                                      {doc.items[0].type || '—'}
                                      {doc.items.length > 1 && (
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '11px', marginLeft: '8px' }}>
                                          та ще {doc.items.length - 1}
                                        </span>
                                      )}
                                    </div>
                                  ) : '—'}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                    {doc.totalItems || doc.items.length} {doc.totalItems === 1 ? 'одиниця' : 'одиниць'}
                                  </span>
                                </td>
                                <td>
                                  <div>
                                    <div>{doc.fromWarehouseName || doc.fromWarehouse || '—'}</div>
                                  </div>
                                </td>
                                <td>
                                  {formatDate(doc.documentDate)}
                                </td>
                                <td>
                                  {doc.createdByName || '—'}
                                </td>
                                <td>
                                  {doc.notes || doc.reason || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                      Немає переміщень для відображення
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Модальне вікно для вибору одиниць документа */}
      {showDocumentModal && selectedDocument && (
        <div className="modal-overlay" onClick={() => setShowDocumentModal(false)}>
          <div className="modal-content receipt-document-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📦 Переміщення: {selectedDocument.documentNumber}</h3>
              <button className="btn-close" onClick={() => setShowDocumentModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="document-info">
                <div className="info-row">
                  <span className="label">Зі складу:</span>
                  <span className="value">{selectedDocument.fromWarehouseName || selectedDocument.fromWarehouse || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">На склад:</span>
                  <span className="value">{selectedDocument.toWarehouseName || selectedDocument.toWarehouse || '—'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Дата переміщення:</span>
                  <span className="value">{formatDate(selectedDocument.documentDate)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Хто перемістив:</span>
                  <span className="value">{selectedDocument.createdByName || '—'}</span>
                </div>
                {selectedDocument.notes && (
                  <div className="info-row">
                    <span className="label">Примітки:</span>
                    <span className="value">{selectedDocument.notes}</span>
                  </div>
                )}
              </div>

              <div className="document-items-section">
                <h4>Оберіть отримані одиниці:</h4>
                <div className="items-table-wrapper">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>
                          <input
                            type="checkbox"
                            checked={documentItems.length > 0 && documentItems.every(item => item._id && selectedItems.has(item._id))}
                            onChange={() => {
                              const allSelected = documentItems.every(item => item._id && selectedItems.has(item._id));
                              if (allSelected) {
                                setSelectedItems(prev => {
                                  const newSet = new Set(prev);
                                  documentItems.forEach(item => {
                                    if (item._id) newSet.delete(item._id);
                                  });
                                  return newSet;
                                });
                              } else {
                                setSelectedItems(prev => {
                                  const newSet = new Set(prev);
                                  documentItems.forEach(item => {
                                    if (item._id) newSet.add(item._id);
                                  });
                                  return newSet;
                                });
                              }
                            }}
                          />
                        </th>
                        <th>Тип обладнання</th>
                        <th>Серійний номер</th>
                        <th>Виробник</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentItems.map(item => (
                        <tr 
                          key={item._id} 
                          className={selectedItems.has(item._id) ? 'selected' : ''}
                          onClick={(e) => {
                            if (e.target.type !== 'checkbox') {
                              handleToggleSelect(item._id);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
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
                          <td>{item.manufacturer || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-cancel"
                onClick={() => setShowDocumentModal(false)}
              >
                Закрити
              </button>
              <button 
                className="btn-approve"
                onClick={() => {
                  setShowDocumentModal(false);
                }}
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReceiptApproval;

