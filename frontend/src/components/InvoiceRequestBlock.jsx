import React, { useState, useEffect } from 'react';
import API_BASE_URL from '../config';
import './InvoiceRequestBlock.css';

function getContractFileUrlString(contractFile) {
  if (contractFile == null) return '';
  if (typeof contractFile === 'string') return contractFile.trim();
  const u =
    contractFile.url || contractFile.href || contractFile.secure_url || contractFile.publicUrl || '';
  return String(u).trim();
}

function hasContractFile(task) {
  return !!getContractFileUrlString(task?.contractFile);
}

const WITHOUT_CONTRACT_COMMENT = 'рахунок виставляти без договору';

function buildComments(userComments, worksWithoutContract) {
  const trimmed = (userComments || '').trim();
  if (!worksWithoutContract) return trimmed;
  if (!trimmed) return WITHOUT_CONTRACT_COMMENT;
  if (trimmed.toLowerCase().includes(WITHOUT_CONTRACT_COMMENT.toLowerCase())) return trimmed;
  return `${trimmed}\n${WITHOUT_CONTRACT_COMMENT}`;
}

const InvoiceRequestBlock = ({ task, user, onRequest, onFileUploaded, readOnly = false, onBeforeOpenModal = null }) => {
  const [showModal, setShowModal] = useState(false);
  const [invoiceRequest, setInvoiceRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needInvoice, setNeedInvoice] = useState(true);
  const [needAct, setNeedAct] = useState(false);
  const [worksWithoutContract, setWorksWithoutContract] = useState(false);

  const closeModal = () => {
    setShowModal(false);
    setWorksWithoutContract(false);
  };

  // Завантаження запиту на рахунок
  const loadInvoiceRequest = async () => {
    const taskId = task.id || task._id;
    if (!taskId) return;
    
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/invoice-requests?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data.length > 0) {
          setInvoiceRequest(data.data[0]);
        } else {
          setInvoiceRequest(null);
        }
      }
    } catch (error) {
      console.error('Помилка завантаження запиту на рахунок:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const taskId = task.id || task._id;
    if (taskId) {
      loadInvoiceRequest();
    }
  }, [task.id, task._id]);

  // Перевірка чи можна показувати блок
  const canShowBlock = () => {
    const allowedRoles = [
      'admin', 'administrator', 'operator', 'operatorbuh', 'service',
      'buhgalteria', 'accountant', 'regkerivn', 'regional',
    ];
    const role = (user?.role || '').toLowerCase();
    return (
      (task.status === 'Виконано' || task.status === 'Заявка' || task.status === 'В роботі') &&
      allowedRoles.includes(role)
    );
  };

  // Подати запит на рахунок
  const handleRequest = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      const taskId = task.id || task._id;
      
      const requestData = {
        taskId,
        requesterId: user.login,
        requesterName: user.name || user.login,
        companyDetails: {
          companyName: formData.get('companyName'),
          edrpou: formData.get('edrpou'),
          address: formData.get('address'),
          bankDetails: formData.get('bankDetails'),
          comments: formData.get('comments')
        },
        needInvoice,
        needAct
      };
      
      const response = await fetch(`${API_BASE_URL}/invoice-requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });
      
      if (response.ok) {
        alert('✅ Запит на рахунок успішно створено!');
        closeModal();
        loadInvoiceRequest();
        if (onRequest) onRequest();
      } else {
        const error = await response.json();
        alert(`❌ Помилка: ${error.message}`);
      }
    } catch (error) {
      console.error('Помилка створення запиту:', error);
      alert('❌ Помилка створення запиту на рахунок');
    }
  };

  // Перегляд файлу (відкриває в новій вкладці)
  const viewFile = (fileUrl) => {
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  // Завантаження файлу
  const downloadFile = async (fileUrl, fileName) => {
    if (!fileUrl) return;
    
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // Fallback - відкриваємо в новій вкладці
      window.open(fileUrl, '_blank');
    }
  };

  if (!canShowBlock()) {
    return null;
  }

  const invoiceFile = task.invoiceFile || invoiceRequest?.invoiceFile;
  const invoiceFileName = task.invoiceFileName || invoiceRequest?.invoiceFileName;
  const actFile = task.actFile || invoiceRequest?.actFile;
  const actFileName = task.actFileName || invoiceRequest?.actFileName;

  return (
    <>
      <div className="invoice-request-block">
        <h4 className="invoice-request-title">📄 Запит на рахунок</h4>
        
        {loading ? (
          <div className="invoice-loading">Завантаження інформації...</div>
        ) : invoiceRequest ? (
          <div className="invoice-request-content">
            {/* Статус запиту */}
            <div className={`invoice-status invoice-status-${invoiceRequest.status}`}>
              {invoiceRequest.status === 'pending' ? '⏳ Очікує обробки' :
               invoiceRequest.status === 'processing' ? '🔄 В обробці' :
               invoiceRequest.status === 'completed' ? '✅ Виконано' :
               '❌ Відхилено'}
            </div>

            {/* Інформація */}
            <div className="invoice-info">
              {invoiceRequest.requesterName && (
                <div><strong>Подав запит:</strong> {invoiceRequest.requesterName}</div>
              )}
              <div><strong>Створено:</strong> {new Date(invoiceRequest.createdAt).toLocaleDateString('uk-UA')}</div>
              {invoiceRequest.comments && (
                <div><strong>Коментарі:</strong> {invoiceRequest.comments}</div>
              )}
            </div>


            {/* Файл рахунку */}
            {invoiceFile && (
              <div className="invoice-file-block">
                <div className="invoice-file-info">
                  <strong>📄 Файл рахунку:</strong> {invoiceFileName}
                </div>
                <div className="invoice-file-actions">
                  <button 
                    type="button"
                    className="btn-view"
                    onClick={() => viewFile(invoiceFile)}
                  >
                    👁️ Переглянути
                  </button>
                  <button 
                    type="button"
                    className="btn-download"
                    onClick={() => downloadFile(invoiceFile, invoiceFileName)}
                  >
                    📥 Завантажити
                  </button>
                </div>
              </div>
            )}

            {/* Файл акту */}
            {actFile && (
              <div className="invoice-file-block act-file">
                <div className="invoice-file-info">
                  <strong>📋 Файл акту:</strong> {actFileName}
                </div>
                <div className="invoice-file-actions">
                  <button 
                    type="button"
                    className="btn-view"
                    onClick={() => viewFile(actFile)}
                  >
                    👁️ Переглянути
                  </button>
                  <button 
                    type="button"
                    className="btn-download"
                    onClick={() => downloadFile(actFile, actFileName)}
                  >
                    📥 Завантажити
                  </button>
                </div>
              </div>
            )}

            {/* Кнопка повторного запиту при відмові */}
            {invoiceRequest.status === 'rejected' && !readOnly && (
              <button 
                type="button"
                className="btn-request-again"
                onClick={() => {
                  setWorksWithoutContract(false);
                  setShowModal(true);
                }}
              >
                🔄 Подати запит знову
              </button>
            )}
          </div>
        ) : (
          <div className="invoice-request-empty">
            {/* Блок відхилення - якщо запит був відхилений */}
            {task.invoiceRejectionReason && (
              <div className="invoice-rejection-block">
                <div className="rejection-header">⚠️ Попередній запит на рахунок відхилено</div>
                <div className="rejection-details">
                  <div className="rejection-reason">
                    <strong>Причина відмови:</strong> {task.invoiceRejectionReason}
                  </div>
                  {task.invoiceRejectionUser && (
                    <div className="rejection-by">
                      <strong>Відхилив:</strong> {task.invoiceRejectionUser}
                    </div>
                  )}
                  {task.invoiceRejectionDate && (
                    <div className="rejection-date">
                      <strong>Дата:</strong> {new Date(task.invoiceRejectionDate).toLocaleDateString('uk-UA')} {new Date(task.invoiceRejectionDate).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <p className="rejection-hint">
                  Виправте зауваження та подайте запит повторно.
                </p>
              </div>
            )}

            {/* Показуємо файли якщо є */}
            {invoiceFile && (
              <div className="invoice-file-block">
                <div className="invoice-file-info">
                  <strong>📄 Файл рахунку:</strong> {invoiceFileName}
                </div>
                <div className="invoice-file-actions">
                  <button type="button" className="btn-view" onClick={() => viewFile(invoiceFile)}>
                    👁️ Переглянути
                  </button>
                  <button type="button" className="btn-download" onClick={() => downloadFile(invoiceFile, invoiceFileName)}>
                    📥 Завантажити
                  </button>
                </div>
              </div>
            )}
            
            {actFile && (
              <div className="invoice-file-block act-file">
                <div className="invoice-file-info">
                  <strong>📋 Файл акту:</strong> {actFileName}
                </div>
                <div className="invoice-file-actions">
                  <button type="button" className="btn-view" onClick={() => viewFile(actFile)}>
                    👁️ Переглянути
                  </button>
                  <button type="button" className="btn-download" onClick={() => downloadFile(actFile, actFileName)}>
                    📥 Завантажити
                  </button>
                </div>
              </div>
            )}
            
            {/* Текст та кнопка запиту */}
            {!task.invoiceRejectionReason && (
              <p className="invoice-request-desc">
                Заявка виконана. Ви можете подати запит на отримання рахунку від бухгалтера 
                для клієнта <strong>{task.client || 'не вказано'}</strong> (ЄДРПОУ: {task.edrpou || 'не вказано'}).
              </p>
            )}
            
            {!readOnly && (
              <button 
                type="button"
                className={task.invoiceRejectionReason ? 'btn-request-again' : 'btn-request'}
                onClick={async () => {
                  if (onBeforeOpenModal) {
                    const ok = await onBeforeOpenModal();
                    if (!ok) return;
                  }
                  setWorksWithoutContract(false);
                  setShowModal(true);
                }}
              >
                {task.invoiceRejectionReason ? '🔄 Подати запит знову' : '📋 Запросити рахунок'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Модальне вікно */}
      {showModal && (
        <div className="invoice-modal-overlay" onClick={closeModal}>
          <div className="invoice-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Запит на рахунок для заявки №{task.requestNumber}</h3>
            
            <div className="invoice-form">
              <div className="form-group">
                <label>Назва компанії *</label>
                <input type="text" id="inv-companyName" defaultValue={task.client || ''} />
              </div>

              <div className="form-group">
                <label>ЄДРПОУ *</label>
                <input type="text" id="inv-edrpou" defaultValue={task.edrpou || ''} />
              </div>

              <div className="form-group">
                <label>Юридична адреса компанії</label>
                <textarea id="inv-address" rows="2" placeholder="Введіть повну юридичну адресу" />
              </div>

              <div className="form-group">
                <label>Реквізити отримувача рахунку *</label>
                <textarea 
                  id="inv-bankDetails" 
                  rows="2"
                  defaultValue={task.invoiceRecipientDetails || ''}
                  placeholder="ПІБ, контактний телефон, місто, номер відділення НП"
                />
              </div>

              {/* Чекбокси */}
              <div className="invoice-checkboxes">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={needInvoice}
                    onChange={(e) => setNeedInvoice(e.target.checked)}
                  />
                  <span>📄 Потрібен рахунок</span>
                </label>
                
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={needAct}
                    onChange={(e) => setNeedAct(e.target.checked)}
                  />
                  <span>📋 Потрібен акт виконаних робіт</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={worksWithoutContract}
                    onChange={(e) => setWorksWithoutContract(e.target.checked)}
                    disabled={hasContractFile(task)}
                  />
                  <span>Даний контрагент працює без договору</span>
                </label>
              </div>

              <div className="form-group">
                <label>Коментарі</label>
                <textarea id="inv-comments" rows="2" />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={closeModal}>
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className="btn-submit"
                  onClick={() => {
                    const companyName = document.getElementById('inv-companyName')?.value;
                    const edrpou = document.getElementById('inv-edrpou')?.value;
                    const bankDetails = (document.getElementById('inv-bankDetails')?.value || '').trim();
                    
                    if (!companyName || !edrpou) {
                      alert('Заповніть обов\'язкові поля: Назва компанії та ЄДРПОУ');
                      return;
                    }

                    if (!bankDetails) {
                      alert('Поле Реквізити отримувача рахунку обов\'язкове для заповнення');
                      return;
                    }

                    if (!worksWithoutContract && !hasContractFile(task)) {
                      alert('Просимо підвантажити договір згідно якого договору працює даний контрагент');
                      return;
                    }
                    
                    const formData = new FormData();
                    formData.set('companyName', companyName);
                    formData.set('edrpou', edrpou);
                    formData.set('address', document.getElementById('inv-address')?.value || '');
                    formData.set('bankDetails', bankDetails);
                    formData.set(
                      'comments',
                      buildComments(document.getElementById('inv-comments')?.value, worksWithoutContract)
                    );
                    
                    handleRequest(formData);
                  }}
                >
                  Відправити запит
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InvoiceRequestBlock;
