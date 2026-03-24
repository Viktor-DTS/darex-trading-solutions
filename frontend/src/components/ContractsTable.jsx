import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { getPdfUniqueKey } from '../utils/pdfUtils';
import './ContractsTable.css';

function ContractsTable({ user }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    edrpou: '',
    client: '',
    activeTasksCount: ''
  });
  const [selectedContract, setSelectedContract] = useState(null);
  const [showActiveTasksModal, setShowActiveTasksModal] = useState(null);
  
  // Кеш для ключів PDF
  const [pdfKeysCache, setPdfKeysCache] = useState(new Map());
  const [pdfKeysLoading, setPdfKeysLoading] = useState(new Set());

  // Завантаження всіх заявок для договорів
  useEffect(() => {
    const loadTasks = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/tasks?limit=10000`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          throw new Error('Помилка завантаження заявок');
        }
        
        const data = await response.json();
        setTasks(data);
      } catch (err) {
        console.error('Помилка:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  // Отримати URL з contractFile (може бути рядком або об'єктом)
  const getContractFileUrl = useCallback((contractFile) => {
    if (!contractFile) return null;
    if (typeof contractFile === 'string') return contractFile.trim() || null;
    return contractFile.url || contractFile.name || null;
  }, []);

  // Отримати ключ з кешу
  const getPdfKeyFromCache = useCallback((url) => {
    return pdfKeysCache.get(url) || url;
  }, [pdfKeysCache]);

  // Завантажити ключ PDF
  const loadPdfKey = useCallback(async (url) => {
    if (!url || pdfKeysCache.has(url) || pdfKeysLoading.has(url)) {
      return;
    }

    setPdfKeysLoading(prev => new Set(prev).add(url));

    try {
      const key = await getPdfUniqueKey(url);
      setPdfKeysCache(prev => {
        const newMap = new Map(prev);
        newMap.set(url, key);
        return newMap;
      });
    } catch (error) {
      console.error('[PDF] Помилка завантаження ключа:', error);
      setPdfKeysCache(prev => {
        const newMap = new Map(prev);
        newMap.set(url, url);
        return newMap;
      });
    } finally {
      setPdfKeysLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(url);
        return newSet;
      });
    }
  }, [pdfKeysCache, pdfKeysLoading]);

  // Завантажуємо ключі PDF для всіх договорів
  useEffect(() => {
    if (loading || tasks.length === 0) return;

    const uniqueUrls = new Set();
    tasks.forEach(task => {
      const url = getContractFileUrl(task.contractFile);
      if (url && !pdfKeysCache.has(url)) {
        uniqueUrls.add(url);
      }
    });

    if (uniqueUrls.size > 0) {
      console.log('[PDF] Завантажуємо ключі для', uniqueUrls.size, 'файлів договорів');
      uniqueUrls.forEach(url => {
        loadPdfKey(url);
      });
    }
  }, [tasks, loading, getContractFileUrl, loadPdfKey, pdfKeysCache]);

  // Прогрес і стан «стабілізації» таблиці (поки не пораховані ключі PDF — рядки не показуємо, щоб не стрибала верстка)
  const pdfKeyProgress = useMemo(() => {
    if (loading || !tasks.length) return { total: 0, done: 0 };
    const urls = new Set();
    tasks.forEach(t => {
      const u = getContractFileUrl(t.contractFile);
      if (u) urls.add(u);
    });
    let done = 0;
    urls.forEach(u => {
      if (pdfKeysCache.has(u)) done++;
    });
    return { total: urls.size, done };
  }, [tasks, loading, pdfKeysCache, getContractFileUrl]);

  const isAnalyzingPdfKeys =
    !loading &&
    pdfKeyProgress.total > 0 &&
    pdfKeyProgress.done < pdfKeyProgress.total;

  // Групування заявок по ЄДРПОУ з унікальними договорами
  const contractsData = useMemo(() => {
    const contractsMap = new Map();
    
    tasks.forEach(task => {
      const hasEdrpou = task.edrpou && task.edrpou.trim() !== '';
      const contractFileUrl = getContractFileUrl(task.contractFile);
      const hasContractFile = !!contractFileUrl;
      
      // Пропускаємо, якщо немає файлу договору або ЄДРПОУ
      // (як в оригінальному проекті)
      if (!hasEdrpou || !hasContractFile) return;
      
      const edrpou = task.edrpou.trim();
      const client = task.client || 'Невідомий';
      
      if (!contractsMap.has(edrpou)) {
        contractsMap.set(edrpou, {
          edrpou: edrpou,
          client: client,
          contractFiles: new Map(), // Map: pdfKey -> { fileName, urls, tasks }
          allTasks: [],
          activeTasksCount: 0,
          completedSum: 0 // Сума виконаних послуг
        });
      }
      
      const contract = contractsMap.get(edrpou);
      contract.allTasks.push(task);
      
      // Підраховуємо активні заявки (тільки серед заявок з файлом договору)
      if (task.status === 'Заявка' || task.status === 'В роботі') {
        contract.activeTasksCount++;
      }
      
      // Додаємо суму для виконаних заявок
      if (task.status === 'Виконано' && task.serviceTotal) {
        const sum = parseFloat(task.serviceTotal) || 0;
        contract.completedSum += sum;
      }
      
      // Додаємо файл договору
      // Отримуємо унікальний ключ з кешу (або використовуємо URL)
      const pdfKey = getPdfKeyFromCache(contractFileUrl);
      
      if (!contract.contractFiles.has(pdfKey)) {
        const fileName = typeof task.contractFile === 'string' 
          ? task.contractFile.split('/').pop() 
          : (task.contractFile?.name || 'contract.pdf');
        contract.contractFiles.set(pdfKey, {
          fileName: fileName,
          urls: new Set([contractFileUrl]),
          tasks: [],
          pdfKey: pdfKey
        });
      } else {
        // Додаємо URL до існуючого ключа
        contract.contractFiles.get(pdfKey).urls.add(contractFileUrl);
      }
      contract.contractFiles.get(pdfKey).tasks.push(task);
    });
    
    // Конвертуємо Map в масив
    return Array.from(contractsMap.values()).map(contract => ({
      ...contract,
      contractFiles: Array.from(contract.contractFiles.values()).map(cf => ({
        ...cf,
        urls: Array.from(cf.urls)
      })),
      contractsCount: contract.contractFiles.size
    }));
  }, [tasks, getContractFileUrl, getPdfKeyFromCache]);

  // Фільтрація договорів
  const filteredContracts = useMemo(() => {
    return contractsData
      .filter(contract => {
        if (filters.edrpou && !contract.edrpou.toLowerCase().includes(filters.edrpou.toLowerCase())) {
          return false;
        }
        if (filters.client && !contract.client.toLowerCase().includes(filters.client.toLowerCase())) {
          return false;
        }
        if (filters.activeTasksCount) {
          const filterCount = parseInt(filters.activeTasksCount);
          if (!isNaN(filterCount) && contract.activeTasksCount !== filterCount) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (a.activeTasksCount > 0 && b.activeTasksCount === 0) return -1;
        if (a.activeTasksCount === 0 && b.activeTasksCount > 0) return 1;
        return b.activeTasksCount - a.activeTasksCount;
      });
  }, [contractsData, filters]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const openContractFile = (url) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="contracts-loading">
        <div className="spinner"></div>
        <p>Завантаження договорів...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="contracts-error">
        <p>Помилка: {error}</p>
      </div>
    );
  }

  return (
    <div className="contracts-container">
      {/* Таблиця договорів */}
      <div className={`contracts-table-wrapper${isAnalyzingPdfKeys ? ' contracts-table-wrapper--analyzing' : ''}`}>
        <table className="contracts-table">
          <thead>
            <tr>
              <th>
                <input
                  type="text"
                  placeholder="Фільтр ЄДРПОУ"
                  value={filters.edrpou}
                  onChange={(e) => handleFilterChange('edrpou', e.target.value)}
                  className="th-filter"
                />
                <div className="th-label">ЄДРПОУ</div>
              </th>
              <th>
                <input
                  type="text"
                  placeholder="Фільтр контрагента"
                  value={filters.client}
                  onChange={(e) => handleFilterChange('client', e.target.value)}
                  className="th-filter"
                />
                <div className="th-label">Назва контрагента</div>
              </th>
              <th className="center">
                <div className="th-label" style={{marginTop: '28px'}}>Кількість договорів</div>
              </th>
              <th className="center">
                <input
                  type="text"
                  placeholder="Фільтр кількості"
                  value={filters.activeTasksCount}
                  onChange={(e) => handleFilterChange('activeTasksCount', e.target.value)}
                  className="th-filter"
                />
                <div className="th-label">Активні заявки</div>
              </th>
              <th className="center">
                <div className="th-label" style={{marginTop: '28px'}}>Сума виконаних послуг за договором</div>
              </th>
              <th>
                <div className="th-label" style={{marginTop: '28px'}}>Переглянути договора</div>
              </th>
              <th>
                <div className="th-label" style={{marginTop: '28px'}}>Дії</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {isAnalyzingPdfKeys ? (
              <tr>
                <td colSpan="7" className="contracts-analyzing-cell">
                  <div className="contracts-analyzing-inner" role="status" aria-live="polite">
                    <div className="contracts-analyzing-spinner" aria-hidden />
                    <p className="contracts-analyzing-title">Аналіз унікальності договорів за вмістом PDF</p>
                    <p className="contracts-analyzing-hint">Таблиця з’явиться після завершення — так уникаємо стрибків верстки</p>
                    <div className="contracts-analyzing-progress">
                      <span>
                        Оброблено файлів: {pdfKeyProgress.done} / {pdfKeyProgress.total}
                      </span>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width:
                              pdfKeyProgress.total > 0
                                ? `${(pdfKeyProgress.done / pdfKeyProgress.total) * 100}%`
                                : '0%'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            ) : filteredContracts.length === 0 ? (
              <tr>
                <td colSpan="7" className="empty-state">
                  Договори не знайдено
                </td>
              </tr>
            ) : (
              filteredContracts.map((contract) => (
                <tr key={contract.edrpou} className={contract.activeTasksCount > 0 ? 'has-active' : ''}>
                  <td>{contract.edrpou}</td>
                  <td>{contract.client}</td>
                  <td className="center">
                    <span className="contracts-count-badge">{contract.contractsCount || 0}</span>
                  </td>
                  <td className="center">
                    {contract.activeTasksCount > 0 ? (
                      <span className="badge badge-active">{contract.activeTasksCount}</span>
                    ) : (
                      <span className="badge badge-empty">0</span>
                    )}
                  </td>
                  <td className="center">
                    <span className="sum-badge">
                      {contract.completedSum.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-view-contracts"
                      onClick={() => setSelectedContract(contract)}
                      disabled={contract.contractsCount === 0}
                    >
                      Переглянути договора
                    </button>
                  </td>
                  <td>
                    <button
                      className="btn-active-tasks"
                      onClick={() => setShowActiveTasksModal(contract)}
                      disabled={contract.activeTasksCount === 0}
                    >
                      Активні заявки ({contract.activeTasksCount})
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Модальне вікно для перегляду договорів */}
      {selectedContract && (
        <div className="modal-overlay" onClick={() => setSelectedContract(null)}>
          <div className="modal-content contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Договори по ЄДРПОУ: {selectedContract.edrpou}</h2>
              <button className="modal-close" onClick={() => setSelectedContract(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="contract-info-row">
                <strong>Контрагент:</strong> {selectedContract.client}
              </div>
              
              <h3>Унікальні договори (групуються по вмісту PDF):</h3>
              {selectedContract.contractFiles && selectedContract.contractFiles.length > 0 ? (
                <div className="contract-files-list">
                  {selectedContract.contractFiles.map((contractFileData, index) => {
                    const activeTasks = contractFileData.tasks.filter(t => 
                      t.status === 'Заявка' || t.status === 'В роботі'
                    );
                    
                    return (
                      <div key={index} className="contract-file-item">
                        <div className="contract-file-info">
                          <div className="contract-file-name">
                            Договір #{index + 1}: {contractFileData.fileName}
                            {contractFileData.urls.length > 1 && (
                              <span className="files-count">
                                ({contractFileData.urls.length} однакових файлів)
                              </span>
                            )}
                          </div>
                          <div className="contract-file-stats">
                            Заявок: {contractFileData.tasks.length} | 
                            Активних: {activeTasks.length > 0 ? (
                              <span className="active-count">{activeTasks.length}</span>
                            ) : '0'}
                          </div>
                          {activeTasks.length > 0 && (
                            <div className="active-tasks-numbers">
                              <strong>Номери активних заявок:</strong>{' '}
                              <span className="numbers-list">
                                {activeTasks.map((task, idx) => (
                                  <span key={task._id || idx}>
                                    {task.requestNumber || task.taskNumber || 'N/A'}
                                    {idx < activeTasks.length - 1 ? ', ' : ''}
                                  </span>
                                ))}
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          className="btn-open-file"
                          onClick={() => openContractFile(contractFileData.urls[0])}
                        >
                          📄 Відкрити договір
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="no-contracts">
                  Файли договору не знайдено
                </div>
              )}
              
              <div className="contract-summary">
                <div><strong>Всього унікальних договорів:</strong> {selectedContract.contractsCount}</div>
                <div><strong>Всього заявок:</strong> {selectedContract.allTasks.length}</div>
                <div>
                  <strong>Активні заявки:</strong>{' '}
                  {selectedContract.activeTasksCount > 0 ? (
                    <span className="badge badge-active">{selectedContract.activeTasksCount}</span>
                  ) : '0'}
                </div>
                <div>
                  <strong>Сума виконаних послуг:</strong>{' '}
                  <span className="sum-badge">
                    {selectedContract.completedSum.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} грн
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно для активних заявок */}
      {showActiveTasksModal && (
        <div className="modal-overlay" onClick={() => setShowActiveTasksModal(null)}>
          <div className="modal-content contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Активні заявки: {showActiveTasksModal.edrpou}</h2>
              <button className="modal-close" onClick={() => setShowActiveTasksModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="contract-info-row">
                <strong>Контрагент:</strong> {showActiveTasksModal.client}
              </div>
              
              {(() => {
                const activeTasks = showActiveTasksModal.allTasks.filter(t => 
                  t.status === 'Заявка' || t.status === 'В роботі'
                );
                
                return activeTasks.length > 0 ? (
                  <table className="mini-table">
                    <thead>
                      <tr>
                        <th>№ заявки</th>
                        <th>Дата</th>
                        <th>Статус</th>
                        <th>Роботи</th>
                        <th>Адреса</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTasks.map((task, idx) => (
                        <tr key={task._id || idx} className="active-task">
                          <td>{task.requestNumber || '—'}</td>
                          <td>{task.requestDate ? new Date(task.requestDate).toLocaleDateString('uk-UA') : '—'}</td>
                          <td>
                            <span className={`status-badge status-${task.status?.toLowerCase().replace(/\s/g, '-')}`}>
                              {task.status || '—'}
                            </span>
                          </td>
                          <td>{task.work || '—'}</td>
                          <td>{task.address || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="no-contracts">
                    Немає активних заявок для даного договору
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContractsTable;
