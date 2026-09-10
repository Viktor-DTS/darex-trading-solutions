/** URL для перегляду: вмістити великі фото з APP у вікно, без 1:1 пікселів. */
export function cloudinaryFitUrl(url, max = 1920) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/image/upload/';
  const index = url.indexOf(marker);
  if (index === -1) return url;
  const after = url.slice(index + marker.length);
  if (/(^|\/)(c_limit|c_fit|c_fill|w_\d+)/.test(after)) return url;
  return `${url.slice(0, index + marker.length)}c_limit,w_${max},h_${max},q_auto,f_auto/${after}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * Галерея у новому вікні: фото завжди вміщається в область перегляду.
 * @param {{ url: string, name?: string, description?: string }[]} images
 */
export function openImageGalleryWindow(images, startIndex = 0) {
  const list = (images || []).filter((img) => img && img.url);
  if (!list.length) return;

  const galleryWindow = window.open('', '_blank', 'width=1200,height=800');
  if (!galleryWindow) return;

  const safeIndex = Math.min(Math.max(0, startIndex), list.length - 1);
  const imagesData = list.map((img) => ({
    url: cloudinaryFitUrl(img.url),
    originalUrl: img.url,
    name: img.name || 'Фото',
    description: img.description || '',
  }));

  galleryWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Галерея зображень</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          height: 100%;
          overflow: hidden;
          background: #1a1a2e;
          color: white;
          font-family: Arial, sans-serif;
        }
        body { display: flex; flex-direction: column; }
        .header {
          flex: 0 0 auto;
          background: #16213e;
          padding: 15px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header h2 { font-size: 18px; }
        .nav-buttons { display: flex; gap: 10px; align-items: center; }
        .nav-btn {
          background: #0f3460;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        }
        .nav-btn:hover { background: #1a4f7a; }
        .main-image {
          flex: 1 1 auto;
          min-height: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          position: relative;
        }
        .main-image img {
          display: block;
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          image-orientation: from-image;
        }
        .image-info {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(0,0,0,0.7);
          padding: 10px 20px;
          border-radius: 5px;
          text-align: center;
          max-width: 90%;
        }
        .thumbnails {
          flex: 0 0 auto;
          background: #16213e;
          padding: 10px;
          display: flex;
          gap: 10px;
          overflow-x: auto;
          justify-content: center;
        }
        .thumb {
          width: 80px;
          height: 60px;
          object-fit: cover;
          border-radius: 5px;
          cursor: pointer;
          border: 2px solid transparent;
        }
        .thumb:hover { border-color: #4CAF50; }
        .thumb.active { border-color: #4CAF50; }
        .counter { font-size: 14px; color: #aaa; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>🖼️ Галерея зображень</h2>
        <div class="nav-buttons">
          <button class="nav-btn" onclick="prevImage()">⬅️ Попереднє</button>
          <span class="counter" id="counter">${safeIndex + 1} / ${imagesData.length}</span>
          <button class="nav-btn" onclick="nextImage()">Наступне ➡️</button>
          <button class="nav-btn" onclick="downloadImage()">⬇️ Завантажити</button>
          <button class="nav-btn" onclick="window.close()">✕ Закрити</button>
        </div>
      </div>
      <div class="main-image">
        <img id="mainImg" src="${escapeHtml(imagesData[safeIndex].url)}" alt="${escapeHtml(imagesData[safeIndex].name)}" />
        <div class="image-info">
          <div id="imgName">${escapeHtml(imagesData[safeIndex].name)}</div>
          <div id="imgDesc">${escapeHtml(imagesData[safeIndex].description)}</div>
        </div>
      </div>
      <div class="thumbnails">
        ${imagesData.map((img, i) => `
          <img class="thumb ${i === safeIndex ? 'active' : ''}"
               src="${escapeHtml(cloudinaryFitUrl(img.originalUrl, 240))}"
               onclick="showImage(${i})"
               alt="${escapeHtml(img.name)}" />
        `).join('')}
      </div>
      <script>
        const images = ${JSON.stringify(imagesData)};
        let currentIndex = ${safeIndex};

        function showImage(index) {
          currentIndex = index;
          document.getElementById('mainImg').src = images[index].url;
          document.getElementById('mainImg').alt = images[index].name;
          document.getElementById('imgName').textContent = images[index].name;
          document.getElementById('imgDesc').textContent = images[index].description || '';
          document.getElementById('counter').textContent = (index + 1) + ' / ' + images.length;
          document.querySelectorAll('.thumb').forEach((t, i) => {
            t.classList.toggle('active', i === index);
          });
        }

        function prevImage() {
          showImage((currentIndex - 1 + images.length) % images.length);
        }

        function nextImage() {
          showImage((currentIndex + 1) % images.length);
        }

        function downloadImage() {
          const link = document.createElement('a');
          link.href = images[currentIndex].originalUrl || images[currentIndex].url;
          link.download = images[currentIndex].name;
          link.click();
        }

        document.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft') prevImage();
          if (e.key === 'ArrowRight') nextImage();
          if (e.key === 'Escape') window.close();
        });
      </script>
    </body>
    </html>
  `);
  galleryWindow.document.close();
}
