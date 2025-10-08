import React, { useState, useEffect } from 'react';
import './ImageGallery.css';

const ImageGallery = ({ files, isOpen, onClose, initialIndex = 0 }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(false);

  // Фільтруємо тільки зображення
  const imageFiles = files.filter(file => 
    file.mimetype && file.mimetype.startsWith('image/')
  );

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goToPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          goToNext();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex]);

  const goToPrevious = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (imageFiles.length === 0) return;
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? imageFiles.length - 1 : prevIndex - 1
    );
  };

  const goToNext = (event) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (imageFiles.length === 0) return;
    setCurrentIndex((prevIndex) => 
      prevIndex === imageFiles.length - 1 ? 0 : prevIndex + 1
    );
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
  };

  if (!isOpen || imageFiles.length === 0) {
    return null;
  }

  const currentFile = imageFiles[currentIndex];

  return (
    <div className="image-gallery-overlay" onClick={onClose}>
      <div className="image-gallery-container" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="gallery-header">
          <div className="gallery-title">
            <span className="gallery-counter">
              {currentIndex + 1} з {imageFiles.length}
            </span>
            <span className="gallery-filename">{currentFile.originalName}</span>
          </div>
          <button 
            type="button"
            className="gallery-close-btn" 
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
          >
            ✕
          </button>
        </div>

        {/* Навігація */}
        {imageFiles.length > 1 && (
          <>
            <button 
              type="button"
              className="gallery-nav-btn gallery-prev-btn" 
              onClick={(event) => goToPrevious(event)}
              title="Попереднє зображення (←)"
            >
              ‹
            </button>
            <button 
              type="button"
              className="gallery-nav-btn gallery-next-btn" 
              onClick={(event) => goToNext(event)}
              title="Наступне зображення (→)"
            >
              ›
            </button>
          </>
        )}

        {/* Зображення */}
        <div className="gallery-image-container">
          {isLoading && (
            <div className="gallery-loading">
              <div className="loading-spinner"></div>
              <span>Завантаження...</span>
            </div>
          )}
          <img
            src={currentFile.cloudinaryUrl}
            alt={currentFile.originalName}
            className="gallery-image"
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: isLoading ? 'none' : 'block' }}
          />
        </div>

        {/* Мініатюри */}
        {imageFiles.length > 1 && (
          <div className="gallery-thumbnails">
            {imageFiles.map((file, index) => (
              <img
                key={file.id}
                src={file.cloudinaryUrl}
                alt={file.originalName}
                className={`gallery-thumbnail ${index === currentIndex ? 'active' : ''}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setCurrentIndex(index);
                  setIsLoading(true);
                }}
                title={file.originalName}
              />
            ))}
          </div>
        )}

        {/* Інформація про файл */}
        <div className="gallery-info">
          <div className="gallery-file-info">
            <span className="file-size">
              {formatFileSize(currentFile.size)}
            </span>
            <span className="file-date">
              {formatDate(currentFile.uploadDate)}
            </span>
            {currentFile.description && (
              <span className="file-description">
                {currentFile.description}
              </span>
            )}
          </div>
        </div>

        {/* Клавіатурні підказки */}
        <div className="gallery-hints">
          <span>← → навігація</span>
          <span>ESC закрити</span>
        </div>
      </div>
    </div>
  );
};

// Допоміжні функції
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString('uk-UA');
};

export default ImageGallery;
