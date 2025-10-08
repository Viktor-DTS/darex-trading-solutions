import React, { useState, useEffect } from 'react';
import './ImageGallery.css';

const ImageGalleryWindow = ({ files, initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // Фільтруємо тільки зображення
  const imageFiles = files.filter(file => 
    file.mimetype && file.mimetype.startsWith('image/')
  );

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e) => {
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
  }, [currentIndex]);

  const goToPrevious = () => {
    if (imageFiles.length === 0) return;
    setCurrentIndex((prevIndex) => 
      prevIndex === 0 ? imageFiles.length - 1 : prevIndex - 1
    );
    resetZoom();
  };

  const goToNext = () => {
    if (imageFiles.length === 0) return;
    setCurrentIndex((prevIndex) => 
      prevIndex === imageFiles.length - 1 ? 0 : prevIndex + 1
    );
    resetZoom();
  };

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
  };

  // Функції для масштабування
  const zoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  };

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Функції для переміщення зображення
  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Обробка колеса миші для масштабування
  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      zoomIn();
    } else {
      zoomOut();
    }
  };

  if (imageFiles.length === 0) {
    return (
      <div className="image-gallery-overlay">
        <div className="image-gallery-container">
          <div className="gallery-header">
            <div className="gallery-title">
              <span className="gallery-filename">Немає зображень для перегляду</span>
            </div>
            <button 
              type="button"
              className="gallery-close-btn" 
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentFile = imageFiles[currentIndex];

  return (
    <div className="image-gallery-overlay">
      <div className="image-gallery-container">
        {/* Заголовок */}
        <div className="gallery-header">
          <div className="gallery-title">
            <span className="gallery-counter">
              {currentIndex + 1} з {imageFiles.length}
            </span>
            <span className="gallery-filename">{currentFile.originalName}</span>
          </div>
          <div className="gallery-controls">
            <div className="zoom-controls">
              <button 
                type="button"
                className="zoom-btn" 
                onClick={zoomOut}
                title="Зменшити (колесо миші вниз)"
              >
                −
              </button>
              <span className="zoom-level">{Math.round(scale * 100)}%</span>
              <button 
                type="button"
                className="zoom-btn" 
                onClick={zoomIn}
                title="Збільшити (колесо миші вгору)"
              >
                +
              </button>
              <button 
                type="button"
                className="zoom-reset-btn" 
                onClick={resetZoom}
                title="Скинути масштаб"
              >
                🔍
              </button>
            </div>
            <button 
              type="button"
              className="gallery-close-btn" 
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Навігація */}
        {imageFiles.length > 1 && (
          <>
            <button 
              type="button"
              className="gallery-nav-btn gallery-prev-btn" 
              onClick={goToPrevious}
              title="Попереднє зображення (←)"
            >
              ‹
            </button>
            <button 
              type="button"
              className="gallery-nav-btn gallery-next-btn" 
              onClick={goToNext}
              title="Наступне зображення (→)"
            >
              ›
            </button>
          </>
        )}

        {/* Зображення */}
        <div 
          className="gallery-image-container"
          onWheel={handleWheel}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
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
            onMouseDown={handleMouseDown}
            style={{ 
              display: isLoading ? 'none' : 'block',
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.2s ease'
            }}
            draggable={false}
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
                onClick={() => {
                  setCurrentIndex(index);
                  setIsLoading(true);
                  resetZoom();
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

export default ImageGalleryWindow;
