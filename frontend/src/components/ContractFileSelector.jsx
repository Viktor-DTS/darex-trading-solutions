import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getContractFiles } from '../utils/edrpouAPI';
import { getPdfFirstThreeLines } from '../utils/pdfConverter';

const ContractFileSelector = ({ 
  open, 
  onClose, 
  onSelect, 
  currentContractFile = null,
  currentEdrpou = null
}) => {
  const [contractFiles, setContractFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [contractKeysCache, setContractKeysCache] = useState(new Map());
  const [contractKeysLoading, setContractKeysLoading] = useState(new Set());

  // Завантаження файлів договорів при відкритті модального вікна
  useEffect(() => {
    if (open) {
      loadContractFiles();
    }
  }, [open]);

  // Синхронна функція для отримання ключа з кешу
  const getContractKeyFromCache = useCallback((contractFileUrl) => {
    if (!contractFileUrl) return contractFileUrl;
    // Якщо ключ вже в кеші, повертаємо його
    return contractKeysCache.get(contractFileUrl) || contractFileUrl;
  }, [contractKeysCache]);

  // Асинхронна функція для завантаження ключа PDF
  const loadContractKey = useCallback(async (contractFileUrl) => {
    if (!contractFileUrl) return;
    
    // Якщо ключ вже в кеші, не завантажуємо повторно
    if (contractKeysCache.has(contractFileUrl)) {
      return contractKeysCache.get(contractFileUrl);
    }
    
    // Якщо вже завантажується, не починаємо повторне завантаження
    if (contractKeysLoading.has(contractFileUrl)) {
      return;
    }
    
    // Позначаємо, що завантажуємо
    setContractKeysLoading(prev => new Set(prev).add(contractFileUrl));
    
    try {
      console.log('[DEBUG] ContractFileSelector loadContractKey - початок читання PDF для:', contractFileUrl.substring(0, 80) + '...');
      const pdfKey = await getPdfFirstThreeLines(contractFileUrl);
      console.log('[DEBUG] ContractFileSelector loadContractKey - отримано ключ:', pdfKey.substring(0, 100) + '...', 'для URL:', contractFileUrl.substring(0, 80) + '...');
      
      // Зберігаємо в кеш
      setContractKeysCache(prev => {
        const newMap = new Map(prev);
        newMap.set(contractFileUrl, pdfKey || contractFileUrl);
        return newMap;
      });
      
      return pdfKey || contractFileUrl;
    } catch (error) {
      console.error('[ERROR] ContractFileSelector loadContractKey - помилка:', error, 'url:', contractFileUrl);
      // У разі помилки зберігаємо URL як ключ
      setContractKeysCache(prev => {
        const newMap = new Map(prev);
        newMap.set(contractFileUrl, contractFileUrl);
        return newMap;
      });
      return contractFileUrl;
    } finally {
      // Прибираємо зі списку завантажуваних
      setContractKeysLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(contractFileUrl);
        return newSet;
      });
    }
  }, [contractKeysCache, contractKeysLoading]);

  // Завантаження ключів для всіх унікальних URL
  useEffect(() => {
    if (!open || contractFiles.length === 0) return;
    
    const uniqueUrls = new Set();
    contractFiles.forEach(file => {
      if (file.url && !contractKeysCache.has(file.url) && !contractKeysLoading.has(file.url)) {
        uniqueUrls.add(file.url);
      }
    });
    
    // Завантажуємо ключі для всіх унікальних URL
    uniqueUrls.forEach(url => {
      loadContractKey(url);
    });
  }, [open, contractFiles, contractKeysCache, contractKeysLoading, loadContractKey]);

  const loadContractFiles = async () => {
    setLoading(true);
    try {
      console.log('[DEBUG] ContractFileSelector - завантаження файлів договорів...');
      const files = await getContractFiles();
      console.log('[DEBUG] ContractFileSelector - отримано файлів:', files.length);
      console.log('[DEBUG] ContractFileSelector - файли:', files);
      setContractFiles(files);
    } catch (error) {
      console.error('Помилка завантаження файлів договорів:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (contractFile) => {
    onSelect(contractFile);
    onClose();
  };

  // Групуємо файли за унікальним PDF контентом
  const uniqueContracts = useMemo(() => {
    if (contractFiles.length === 0) return [];
    
    // Спочатку фільтруємо по ЄДРПОУ, якщо він вказаний
    let filteredFiles = contractFiles;
    if (currentEdrpou && currentEdrpou.trim()) {
      filteredFiles = contractFiles.filter(file => 
        file.edrpou === currentEdrpou
      );
      console.log('[DEBUG] ContractFileSelector - фільтрація по ЄДРПОУ:', currentEdrpou, 'знайдено файлів:', filteredFiles.length);
    }
    
    // Потім фільтруємо по пошуковому терміну
    if (searchTerm && searchTerm.trim()) {
      filteredFiles = filteredFiles.filter(file => 
        file.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.edrpou.toLowerCase().includes(searchTerm.toLowerCase()) ||
        file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log('[DEBUG] ContractFileSelector - фільтрація по пошуку:', searchTerm, 'знайдено файлів:', filteredFiles.length);
    }
    
    // Групуємо файли за унікальним PDF контентом
    const contractsMap = new Map();
    
    filteredFiles.forEach(file => {
      if (!file.url) return;
      
      const contractKey = getContractKeyFromCache(file.url);
      
      if (!contractsMap.has(contractKey)) {
        contractsMap.set(contractKey, {
          key: contractKey,
          fileName: file.fileName,
          url: file.url, // Перший знайдений URL
          urls: new Set([file.url]), // Всі URL для цього ключа
          client: file.client,
          edrpou: file.edrpou,
          createdAt: file.createdAt,
          files: [file] // Всі файли з цим ключем
        });
      } else {
        const existing = contractsMap.get(contractKey);
        existing.urls.add(file.url);
        existing.files.push(file);
        // Оновлюємо дату, якщо поточний файл новіший
        if (new Date(file.createdAt) > new Date(existing.createdAt)) {
          existing.createdAt = file.createdAt;
        }
      }
    });
    
    // Конвертуємо Map в масив унікальних договорів
    const uniqueContractsArray = Array.from(contractsMap.values()).map(contract => ({
      ...contract,
      urls: Array.from(contract.urls) // Конвертуємо Set в масив для відображення
    }));
    
    console.log('[DEBUG] ContractFileSelector - унікальних договорів:', uniqueContractsArray.length, 'з', filteredFiles.length, 'файлів');
    
    return uniqueContractsArray;
  }, [contractFiles, currentEdrpou, searchTerm, getContractKeyFromCache]);

  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content contract-file-selector">
        <div className="modal-header">
          <h3>Вибір файлу договору</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading">Завантаження файлів договорів...</div>
          ) : (
            <div className="contract-files-list">
              {/* Пошук */}
              <div className="search-section">
                <input
                  type="text"
                  placeholder={currentEdrpou ? `Файли для ЄДРПОУ ${currentEdrpou}. Пошук по клієнту або назві файлу...` : "Пошук по клієнту, ЄДРПОУ або назві файлу..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              {/* Список унікальних договорів */}
              <div className="files-list">
                {uniqueContracts.length === 0 ? (
                  <div className="no-files">
                    {currentEdrpou ? 
                      (searchTerm ? `Файли для ЄДРПОУ ${currentEdrpou} не знайдено за пошуком "${searchTerm}"` : `Немає файлів договорів для ЄДРПОУ ${currentEdrpou}`) :
                      (searchTerm ? 'Файли не знайдено' : 'Немає доступних файлів договорів')
                    }
                  </div>
                ) : (
                  uniqueContracts.map((contract, index) => {
                    const isSelected = currentContractFile === contract.url || 
                      (contract.urls && contract.urls.includes(currentContractFile));
                    const isLoading = contractKeysLoading.has(contract.url);
                    
                    return (
                      <div 
                        key={contract.key || index} 
                        className={`file-item ${isSelected ? 'selected' : ''} ${isLoading ? 'loading' : ''}`}
                        onClick={() => handleSelect({ ...contract.files[0], url: contract.url })}
                      >
                        <div className="file-info">
                          <div className="file-name">
                            📄 {contract.fileName}
                            {contract.urls && contract.urls.length > 1 && (
                              <span style={{ 
                                marginLeft: '8px', 
                                fontSize: '11px', 
                                color: '#666',
                                fontWeight: 'normal'
                              }}>
                                ({contract.urls.length} файлів)
                              </span>
                            )}
                          </div>
                          <div className="client-info">
                            <strong>{contract.client}</strong>
                            {contract.edrpou && <span className="edrpou">ЄДРПОУ: {contract.edrpou}</span>}
                          </div>
                          <div className="file-date">
                            Завантажено: {new Date(contract.createdAt).toLocaleDateString('uk-UA')}
                          </div>
                          {contract.urls && contract.urls.length > 1 && (
                            <div style={{ 
                              fontSize: '11px', 
                              color: '#999', 
                              marginTop: '4px',
                              fontStyle: 'italic'
                            }}>
                              Унікальний договір (об'єднано {contract.urls.length} файлів з однаковим контентом)
                            </div>
                          )}
                        </div>
                        <div className="file-actions">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(contract.url, '_blank');
                            }}
                            className="btn-preview"
                            title="Переглянути файл"
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = document.createElement('a');
                              link.href = contract.url;
                              link.download = contract.fileName;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="btn-download"
                            title="Завантажити файл"
                          >
                            ⬇️
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Скасувати
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContractFileSelector;
