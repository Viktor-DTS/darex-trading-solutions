/** Ім'я для <a download> / диску: без шляхів, інакше браузер відкриває файл замість збереження. */
export function sanitizeDownloadName(name, fallback = 'file') {
  let base = String(name || fallback).replace(/^.*[/\\]/, '');
  base = base.replace(/[\u0000-\u001F\\/:*?"<>|]/g, '_').trim();
  if (!base || base === '.' || base === '..') base = fallback;
  if (base.length > 180) {
    const dot = base.lastIndexOf('.');
    if (dot > 0) {
      const ext = base.slice(dot);
      base = base.slice(0, Math.max(1, 180 - ext.length)) + ext;
    } else {
      base = base.slice(0, 180);
    }
  }
  return base;
}

export function ensureDownloadExtension(name, url = '', mime = '') {
  const base = sanitizeDownloadName(name);
  if (/\.[a-z0-9]{1,8}$/i.test(base)) return base;
  const mt = String(mime || '').toLowerCase();
  if (mt === 'image/jpeg' || mt === 'image/jpg') return `${base}.jpg`;
  if (mt.startsWith('image/')) {
    const sub = mt.split('/')[1].replace(/[^a-z0-9]/gi, '') || 'jpg';
    return `${base}.${sub === 'jpeg' ? 'jpg' : sub}`;
  }
  if (mt.includes('pdf')) return `${base}.pdf`;
  const fromUrl = String(url || '').split('?')[0].match(/\.(jpe?g|png|gif|webp|pdf|docx?|xlsx?)$/i);
  if (fromUrl) {
    const ext = fromUrl[1].toLowerCase() === 'jpeg' ? 'jpg' : fromUrl[1].toLowerCase();
    return `${base}.${ext}`;
  }
  return `${base}.jpg`;
}

export function cloudinaryAttachmentUrl(url, filename) {
  if (!url || typeof url !== 'string') return url;
  const marker = '/image/upload/';
  const index = url.indexOf(marker);
  if (index === -1) return url;
  if (url.indexOf('fl_attachment') !== -1) return url;
  const safe = sanitizeDownloadName(filename || 'file').replace(/[^\w.\-]+/g, '_');
  return `${url.slice(0, index + marker.length)}fl_attachment:${safe}/${url.slice(index + marker.length)}`;
}

function triggerBlobDownload(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = sanitizeDownloadName(filename);
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

export async function fetchRemoteBlob(url, filename = 'file') {
  const name = sanitizeDownloadName(filename);
  const candidates = [url, cloudinaryAttachmentUrl(url, name)].filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
  let lastError;
  for (const source of candidates) {
    try {
      const res = await fetch(source, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob || blob.size === 0) throw new Error('empty blob');
      return blob;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('download failed');
}

/** Зберегти файл без переходу по вкладці / відкриття перегляду Cloudinary. */
export async function downloadRemoteFile(url, filename = 'file', mime = '') {
  if (!url) throw new Error('empty url');
  const name = ensureDownloadExtension(filename, url, mime);
  const blob = await fetchRemoteBlob(url, name);
  triggerBlobDownload(blob, name);
}

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
        <img id="mainImg" crossorigin="anonymous" src="${escapeHtml(imagesData[safeIndex].url)}" alt="${escapeHtml(imagesData[safeIndex].name)}" />
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
          const mainImg = document.getElementById('mainImg');
          mainImg.crossOrigin = 'anonymous';
          mainImg.src = images[index].url;
          mainImg.alt = images[index].name;
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

        function safeName(name) {
          let base = String(name || 'photo.jpg').replace(/^.*[/\\\\]/, '');
          base = base.replace(/[\\\\/:*?"<>|]/g, '_').trim() || 'photo.jpg';
          if (!/\\.[a-z0-9]{1,8}$/i.test(base)) base += '.jpg';
          return base;
        }

        function triggerBlobDownload(blob, name) {
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = name;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
        }

        async function downloadFromCanvas(name) {
          const imgEl = document.getElementById('mainImg');
          if (!imgEl || !imgEl.naturalWidth) throw new Error('no image');
          const canvas = document.createElement('canvas');
          canvas.width = imgEl.naturalWidth;
          canvas.height = imgEl.naturalHeight;
          canvas.getContext('2d').drawImage(imgEl, 0, 0);
          const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/jpeg', 0.92);
          });
          triggerBlobDownload(blob, name);
        }

        async function downloadImage() {
          const img = images[currentIndex];
          const name = safeName(img.name || 'photo.jpg');
          const source = img.originalUrl || img.url;
          try {
            if (typeof window.__dtsDownload === 'function') {
              await window.__dtsDownload(source, name);
              return;
            }
          } catch (e) {}
          try {
            const res = await fetch(source, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
            if (!res.ok) throw new Error('fetch failed');
            const blob = await res.blob();
            if (!blob || !blob.size) throw new Error('empty');
            triggerBlobDownload(blob, name);
          } catch (e) {
            try {
              await downloadFromCanvas(name);
            } catch (canvasError) {
              alert('Не вдалося зберегти фото. Спробуйте ще раз.');
            }
          }
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
  galleryWindow.__dtsDownload = downloadRemoteFile;
}
