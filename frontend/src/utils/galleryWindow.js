import React from 'react';
import { createRoot } from 'react-dom/client';
import ImageGalleryWindow from '../components/ImageGalleryWindow';

// Функція для відкриття галереї в новій вкладці
export const openGalleryInNewWindow = (files, initialIndex = 0) => {
  // Фільтруємо тільки зображення
  const imageFiles = files.filter(file => 
    file.mimetype && file.mimetype.startsWith('image/')
  );

  if (imageFiles.length === 0) {
    alert('Немає зображень для перегляду');
    return;
  }

  // Створюємо нову вкладку
  const newTab = window.open('', '_blank');

  if (!newTab) {
    alert('Не вдалося відкрити нову вкладку. Перевірте налаштування блокувальника спливаючих вікон.');
    return;
  }

  // Налаштовуємо HTML структуру нової вкладки
  newTab.document.write(`
    <!DOCTYPE html>
    <html lang="uk">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Галерея зображень - Darex Trading Solutions</title>
      <link rel="icon" type="image/x-icon" href="/favicon.ico">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
          background: #000;
          color: #fff;
          overflow: hidden;
        }
        
        #root {
          width: 100vw;
          height: 100vh;
        }
        
        /* Базові стилі для галереї */
        .image-gallery-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.95);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(5px);
        }

        .image-gallery-container {
          position: relative;
          width: 100vw;
          height: 100vh;
          background: #1a1a1a;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        /* Заголовок */
        .gallery-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #2a2a2a;
          border-bottom: 1px solid #444;
        }

        .gallery-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .gallery-counter {
          font-size: 14px;
          color: #888;
          font-weight: 500;
        }

        .gallery-filename {
          font-size: 16px;
          color: #fff;
          font-weight: 600;
          max-width: 400px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .gallery-close-btn {
          background: #ff4444;
          color: white;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .gallery-close-btn:hover {
          background: #ff6666;
        }

        /* Контроли масштабування */
        .gallery-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .zoom-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.7);
          padding: 8px 12px;
          border-radius: 6px;
          backdrop-filter: blur(10px);
        }

        .zoom-btn {
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          width: 32px;
          height: 32px;
          font-size: 18px;
          font-weight: bold;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .zoom-btn:hover {
          background: #0056b3;
        }

        .zoom-level {
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          min-width: 45px;
          text-align: center;
        }

        .zoom-reset-btn {
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 4px;
          width: 32px;
          height: 32px;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .zoom-reset-btn:hover {
          background: #545b62;
        }

        /* Навігація */
        .gallery-nav-btn {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(0, 0, 0, 0.7);
          color: white;
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          font-size: 24px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          z-index: 10;
        }

        .gallery-nav-btn:hover {
          background: rgba(0, 0, 0, 0.9);
          transform: translateY(-50%) scale(1.1);
        }

        .gallery-prev-btn {
          left: 20px;
        }

        .gallery-next-btn {
          right: 20px;
        }

        /* Контейнер зображення */
        .gallery-image-container {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: #1a1a1a;
          overflow: hidden;
        }

        .gallery-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          user-select: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
        }

        .gallery-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #888;
          gap: 16px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #333;
          border-top: 3px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Мініатюри */
        .gallery-thumbnails {
          display: flex;
          gap: 8px;
          padding: 16px 20px;
          background: #2a2a2a;
          border-top: 1px solid #444;
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: #555 #2a2a2a;
        }

        .gallery-thumbnails::-webkit-scrollbar {
          height: 6px;
        }

        .gallery-thumbnails::-webkit-scrollbar-track {
          background: #2a2a2a;
        }

        .gallery-thumbnails::-webkit-scrollbar-thumb {
          background: #555;
          border-radius: 3px;
        }

        .gallery-thumbnail {
          width: 60px;
          height: 60px;
          object-fit: cover;
          border-radius: 6px;
          cursor: pointer;
          border: 2px solid transparent;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .gallery-thumbnail:hover {
          border-color: #007bff;
          transform: scale(1.05);
        }

        .gallery-thumbnail.active {
          border-color: #007bff;
          box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.3);
        }

        /* Інформація про файл */
        .gallery-info {
          padding: 12px 20px;
          background: #2a2a2a;
          border-top: 1px solid #444;
        }

        .gallery-file-info {
          display: flex;
          gap: 16px;
          font-size: 14px;
          color: #888;
          flex-wrap: wrap;
        }

        .gallery-file-info span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* Підказки */
        .gallery-hints {
          position: absolute;
          bottom: 20px;
          right: 20px;
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #666;
          background: rgba(0, 0, 0, 0.7);
          padding: 8px 12px;
          border-radius: 6px;
          backdrop-filter: blur(10px);
        }

        /* Адаптивність */
        @media (max-width: 768px) {
          .gallery-header {
            padding: 12px 16px;
          }
          
          .gallery-controls {
            gap: 8px;
          }
          
          .zoom-controls {
            padding: 6px 8px;
            gap: 6px;
          }
          
          .zoom-btn, .zoom-reset-btn {
            width: 28px;
            height: 28px;
            font-size: 14px;
          }
          
          .zoom-level {
            font-size: 12px;
            min-width: 35px;
          }
          
          .gallery-nav-btn {
            width: 50px;
            height: 50px;
            font-size: 20px;
          }
          
          .gallery-prev-btn {
            left: 10px;
          }
          
          .gallery-next-btn {
            right: 10px;
          }
          
          .gallery-thumbnails {
            padding: 12px 16px;
          }
          
          .gallery-thumbnail {
            width: 50px;
            height: 50px;
          }
          
          .gallery-hints {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
    </body>
    </html>
  `);

  newTab.document.close();

  // Очікуємо завантаження DOM
  newTab.addEventListener('load', () => {
    const rootElement = newTab.document.getElementById('root');
    const root = createRoot(rootElement);

    const handleClose = () => {
      newTab.close();
    };

    root.render(
      React.createElement(ImageGalleryWindow, {
        files: imageFiles,
        initialIndex: initialIndex,
        onClose: handleClose
      })
    );
  });

  // Фокусуємося на новій вкладці
  newTab.focus();

  return newTab;
};
