import React, { useState, useEffect } from 'react';
import { getContractFiles } from '../utils/edrpouAPI';

const ContractFileSelector = ({ 
  open, 
  onClose, 
  onSelect, 
  currentContractFile = null 
}) => {
  const [contractFiles, setContractFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Завантаження файлів договорів при відкритті модального вікна
  useEffect(() => {
    if (open) {
      loadContractFiles();
    }
  }, [open]);

  const loadContractFiles = async () => {
    setLoading(true);
    try {
      const files = await getContractFiles();
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

  const filteredFiles = contractFiles.filter(file => 
    file.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.edrpou.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                  placeholder="Пошук по клієнту, ЄДРПОУ або назві файлу..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              {/* Список файлів */}
              <div className="files-list">
                {filteredFiles.length === 0 ? (
                  <div className="no-files">
                    {searchTerm ? 'Файли не знайдено' : 'Немає доступних файлів договорів'}
                  </div>
                ) : (
                  filteredFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className={`file-item ${currentContractFile === file.url ? 'selected' : ''}`}
                      onClick={() => handleSelect(file)}
                    >
                      <div className="file-info">
                        <div className="file-name">
                          📄 {file.fileName}
                        </div>
                        <div className="client-info">
                          <strong>{file.client}</strong>
                          {file.edrpou && <span className="edrpou">ЄДРПОУ: {file.edrpou}</span>}
                        </div>
                        <div className="file-date">
                          Завантажено: {new Date(file.createdAt).toLocaleDateString('uk-UA')}
                        </div>
                      </div>
                      <div className="file-actions">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(file.url, '_blank');
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
                            link.href = file.url;
                            link.download = file.fileName;
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
                  ))
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
