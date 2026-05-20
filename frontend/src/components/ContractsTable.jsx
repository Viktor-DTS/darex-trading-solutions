import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { API_BASE_URL } from '../config';
import { analyzeContractPdfByUrl } from '../utils/pdfUtils';
import './ContractsTable.css';

/** v1 — лише pdfKey рядком; v2 — об'єкт { pdfKey, contractNumber, contractDate } */
const PDF_LEGACY_KEYS_PREFIX = 'darex-contracts-pdf-keys-v1:';
const PDF_ANALYSIS_STORAGE_PREFIX = 'darex-contracts-pdf-analysis-v1:';

function storageSuffixForUser(user) {
  const id = user?.login || user?.username || user?.email || 'default';
  return encodeURIComponent(String(id));
}

/** Дата поля заявки → YYYY-MM-DD */
function taskContractDateToIso(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') {
    const t = raw.trim();
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  return '';
}

function formatUkDotsFromIso(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function normalizeAnalysisEntry(raw) {
  if (raw && typeof raw === 'object' && raw.pdfKey != null) {
    return {
      pdfKey: String(raw.pdfKey || ''),
      contractNumber: String(raw.contractNumber || ''),
      contractDate: String(raw.contractDate || ''),
      legacyKeyOnly: !!raw.legacyKeyOnly,
    };
  }
  if (typeof raw === 'string') return { pdfKey: raw, contractNumber: '', contractDate: '', legacyKeyOnly: false };
  return { pdfKey: '', contractNumber: '', contractDate: '', legacyKeyOnly: false };
}

function readPersistedPdfAnalysisMap(user) {
  try {
    const suf = storageSuffixForUser(user);
    const v2Raw = localStorage.getItem(`${PDF_ANALYSIS_STORAGE_PREFIX}${suf}`);
    if (v2Raw) {
      const o = JSON.parse(v2Raw);
      if (!o || !Array.isArray(o.entries)) return null;
      const map = new Map();
      for (const [url, payload] of o.entries) map.set(url, normalizeAnalysisEntry(payload));
      return map;
    }
    const v1Raw = localStorage.getItem(`${PDF_LEGACY_KEYS_PREFIX}${suf}`);
    if (!v1Raw) return null;
    const o = JSON.parse(v1Raw);
    if (!o || !Array.isArray(o.entries)) return null;
    const map = new Map();
    for (const [url, key] of o.entries)
      map.set(url, {
        pdfKey: String(key || ''),
        contractNumber: '',
        contractDate: '',
        legacyKeyOnly: true,
      });
    return map;
  } catch {
    return null;
  }
}

function writePersistedPdfAnalysisMap(user, map) {
  try {
    const suf = storageSuffixForUser(user);
    localStorage.setItem(
      `${PDF_ANALYSIS_STORAGE_PREFIX}${suf}`,
      JSON.stringify({
        entries: Array.from(map.entries()).map(([u, row]) => [
        u,
        {
          pdfKey: row.pdfKey,
          contractNumber: row.contractNumber,
          contractDate: row.contractDate,
        },
      ]),
      }),
    );
  } catch (e) {
    console.warn('[Contracts] Не вдалося зберегти кеш аналізу PDF:', e);
  }
}

/** Підпис рядка: заявки в групі та з кешованого парсера PDF */
function resolveContractRowPresentation(contractFileData, pdfByUrl) {
  const tasksRef = contractFileData.tasks || [];
  const dbNum =
    tasksRef.map((t) => (t.contractNumber || '').trim()).find((s) => s) || '';
  const isoDb =
    tasksRef.map((t) => taskContractDateToIso(t.contractDate)).find((s) => s) || '';

  const repUrl = contractFileData.representativeUrl || contractFileData.urls?.[0];
  const analyzed = repUrl ? pdfByUrl.get(repUrl) : null;

  const number = dbNum || (analyzed?.contractNumber || '').trim() || '';
  const iso =
    isoDb ||
    ((analyzed?.contractDate || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[0] ?? '');
  const isoSortKey = iso || '';
  const fileLabel =
    typeof contractFileData.fileName === 'string' ? contractFileData.fileName : 'contract.pdf';

  return {
    numberLabel: number || '—',
    dateUkLabel: iso ? formatUkDotsFromIso(iso) : '—',
    fileShortName: fileLabel,
    /** Для сортування списку: новіші дати вище */
    isoForSort: isoSortKey || '1900-01-01',
    numberPlain: number,
  };
}

function collectContractFileUrls(tasks, getContractFileUrl) {
  const urls = new Set();
  tasks.forEach((t) => {
    const u = getContractFileUrl(t.contractFile);
    if (u) urls.add(u);
  });
  return urls;
}

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
  
  // Кеш: URL → ключ унікальності PDF + номер/дата з першої сторінки
  const [pdfAnalysisByUrl, setPdfAnalysisByUrl] = useState(new Map());
  const [pdfAnalysisLoadingUrls, setPdfAnalysisLoadingUrls] = useState(new Set());

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

  const getDedupePdfKeyForUrl = useCallback(
    (url) => pdfAnalysisByUrl.get(url)?.pdfKey || url,
    [pdfAnalysisByUrl],
  );

  const loadPdfAnalysisForUrl = useCallback(
    async (url) => {
      if (
        !url ||
        pdfAnalysisByUrl.has(url) ||
        pdfAnalysisLoadingUrls.has(url)
      ) {
        return;
      }

      setPdfAnalysisLoadingUrls((prev) => new Set(prev).add(url));

      try {
        const { pdfKey, meta } = await analyzeContractPdfByUrl(url);
        const row = {
          pdfKey: pdfKey || url,
          contractNumber: meta?.contractNumber || '',
          contractDate: meta?.contractDate || '',
        };
        setPdfAnalysisByUrl((prev) => {
          const next = new Map(prev);
          next.set(url, row);
          return next;
        });
      } catch (error) {
        console.error('[PDF] Помилка аналізу договору:', error);
        setPdfAnalysisByUrl((prev) => {
          const next = new Map(prev);
          next.set(url, { pdfKey: url, contractNumber: '', contractDate: '' });
          return next;
        });
      } finally {
        setPdfAnalysisLoadingUrls((prev) => {
          const next = new Set(prev);
          next.delete(url);
          return next;
        });
      }
    },
    [pdfAnalysisByUrl, pdfAnalysisLoadingUrls],
  );

  // Відновлення з localStorage (v2 або міграція з v1-лише-ключі)
  useLayoutEffect(() => {
    if (loading || tasks.length === 0) return;

    const urlsNow = collectContractFileUrls(tasks, getContractFileUrl);
    if (urlsNow.size === 0) return;

    const stored = readPersistedPdfAnalysisMap(user);
    if (!stored || stored.size === 0) return;

    setPdfAnalysisByUrl((prev) => {
      const next = new Map(prev);
      let restored = 0;
      for (const u of urlsNow) {
        if (!next.has(u) && stored.has(u)) {
          const row = normalizeAnalysisEntry(stored.get(u));
          if (row.legacyKeyOnly) {
            continue;
          }
          const { legacyKeyOnly: _drop, ...rest } = row;
          next.set(u, rest);
          restored++;
        }
      }
      if (restored === 0) return prev;
      console.log('[PDF] З кешу відновлено аналізів PDF:', restored, '/', urlsNow.size);
      return next;
    });
  }, [loading, tasks, getContractFileUrl, user]);

  // Аналіз PDF для URL, яких ще немає в кеші
  useEffect(() => {
    if (loading || tasks.length === 0) return;

    const uniqueUrls = new Set();
    tasks.forEach((task) => {
      const url = getContractFileUrl(task.contractFile);
      if (url && !pdfAnalysisByUrl.has(url)) uniqueUrls.add(url);
    });

    if (uniqueUrls.size > 0) {
      console.log('[PDF] Аналіз договорів (ключ + номер/дата):', uniqueUrls.size);
      uniqueUrls.forEach((url) => {
        loadPdfAnalysisForUrl(url);
      });
    }
  }, [tasks, loading, getContractFileUrl, loadPdfAnalysisForUrl, pdfAnalysisByUrl]);

  // Прогрес стабілізації таблиці
  const pdfKeyProgress = useMemo(() => {
    if (loading || !tasks.length) return { total: 0, done: 0 };
    const urls = new Set();
    tasks.forEach((t) => {
      const u = getContractFileUrl(t.contractFile);
      if (u) urls.add(u);
    });
    let done = 0;
    urls.forEach((u) => {
      if (pdfAnalysisByUrl.has(u)) done++;
    });
    return { total: urls.size, done };
  }, [tasks, loading, pdfAnalysisByUrl, getContractFileUrl]);

  const isAnalyzingPdfKeys =
    !loading &&
    pdfKeyProgress.total > 0 &&
    pdfKeyProgress.done < pdfKeyProgress.total;

  // Збереження повного аналізу після завершення
  useEffect(() => {
    if (loading || pdfKeyProgress.total === 0) return;
    if (pdfKeyProgress.done < pdfKeyProgress.total) return;

    const urlsNow = collectContractFileUrls(tasks, getContractFileUrl);
    if (urlsNow.size === 0) return;

    const toSave = new Map();
    for (const u of urlsNow) {
      if (pdfAnalysisByUrl.has(u)) toSave.set(u, { ...pdfAnalysisByUrl.get(u) });
    }
    if (toSave.size !== urlsNow.size) return;

    writePersistedPdfAnalysisMap(user, toSave);
  }, [
    loading,
    tasks,
    user,
    pdfKeyProgress.total,
    pdfKeyProgress.done,
    pdfAnalysisByUrl,
    getContractFileUrl,
  ]);

  /** Номер/дата: спочатку з полів заявок, потім з PDF */
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
      const dedupeKey = getDedupePdfKeyForUrl(contractFileUrl);

      if (!contract.contractFiles.has(dedupeKey)) {
        const fileName = typeof task.contractFile === 'string' 
          ? task.contractFile.split('/').pop() 
          : (task.contractFile?.name || 'contract.pdf');
        contract.contractFiles.set(dedupeKey, {
          fileName: fileName,
          urls: new Set([contractFileUrl]),
          tasks: [],
          pdfKey: dedupeKey,
          representativeUrl: contractFileUrl
        });
      } else {
        // Додаємо URL до існуючого ключа
        contract.contractFiles.get(dedupeKey).urls.add(contractFileUrl);
      }
      contract.contractFiles.get(dedupeKey).tasks.push(task);
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
  }, [tasks, getContractFileUrl, getDedupePdfKeyForUrl]);

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
                    <p className="contracts-analyzing-title">Аналіз договорів (унікальність PDF, номер і дата)</p>
                    <p className="contracts-analyzing-hint">Це один раз завантажує кожний PDF: групування за вмістом і зчитування реквізитів із першої сторінки. Таблиця з’являється після завершення.</p>
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
              
              <h3>Унікальні договори за вмістом PDF:</h3>
              {selectedContract.contractFiles && selectedContract.contractFiles.length > 0 ? (
                <div className="contract-files-list">
                  {[...selectedContract.contractFiles]
                    .map((cf) => ({
                      cf,
                      pres: resolveContractRowPresentation(cf, pdfAnalysisByUrl),
                    }))
                    .sort((a, b) => {
                      const d = b.pres.isoForSort.localeCompare(a.pres.isoForSort);
                      if (d !== 0) return d;
                      return (b.pres.numberPlain || '').localeCompare(a.pres.numberPlain || '', 'uk');
                    })
                    .map(({ cf: contractFileData, pres }, index) => {
                      const activeTasks = contractFileData.tasks.filter((t) => t.status === 'Заявка' || t.status === 'В роботі');
                      const { numberLabel, dateUkLabel, fileShortName } = pres;

                      return (
                        <div key={`${contractFileData.pdfKey}-${index}`} className="contract-file-item contract-file-item--optimized">
                          <div className="contract-file-main">
                            <div className="contract-file-meta-row">
                              <span className="contract-meta-pill contract-meta-num">
                                <span className="contract-meta-label">Номер</span>
                                <span className="contract-meta-value">{numberLabel}</span>
                              </span>
                              <span className="contract-meta-pill contract-meta-date">
                                <span className="contract-meta-label">Дата</span>
                                <span className="contract-meta-value">{dateUkLabel}</span>
                              </span>
                              {contractFileData.urls.length > 1 && (
                                <span className="contract-files-chip">
                                  {contractFileData.urls.length} однакових PDF
                                </span>
                              )}
                            </div>
                            <div className="contract-file-name contract-file-name--muted">
                              <span className="contract-file-slot">#{index + 1}</span>
                              <span title={fileShortName}>{fileShortName}</span>
                            </div>
                            <div className="contract-file-stats contract-file-stats--compact">
                              <span>
                                Заявок: <strong>{contractFileData.tasks.length}</strong>
                              </span>
                              <span className="contract-stats-div">|</span>
                              <span>
                                Активних:&nbsp;
                                {activeTasks.length > 0 ? (
                                  <strong className="active-count">{activeTasks.length}</strong>
                                ) : (
                                  <strong className="active-count-none">0</strong>
                                )}
                              </span>
                            </div>
                            {activeTasks.length > 0 && (
                              <div className="active-tasks-numbers active-tasks-numbers--clamp">
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
                            type="button"
                            className="btn-open-file"
                            onClick={() => openContractFile(contractFileData.urls[0])}
                          >
                            📄 Відкрити
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
