// Утиліта для аналізу розміру бандлу
export function analyzeBundleSize() {
  if (process.env.NODE_ENV === 'development') {
    console.log('Bundle Analysis:');
    
    // Аналізуємо розмір localStorage
    const localStorageSize = JSON.stringify(localStorage).length;
    console.log(`LocalStorage size: ${(localStorageSize / 1024).toFixed(2)} KB`);
    
    // Аналізуємо кількість DOM елементів
    const domElements = document.querySelectorAll('*').length;
    console.log(`DOM elements count: ${domElements}`);
    
    // Аналізуємо розмір window об'єкта
    const windowSize = JSON.stringify(window).length;
    console.log(`Window object size: ${(windowSize / 1024).toFixed(2)} KB`);
    
    // Аналізуємо використання пам'яті (якщо доступно)
    if (performance.memory) {
      console.log('Memory usage:', {
        used: `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        total: `${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        limit: `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`
      });
    }
  }
}

// Функція для очищення кешу
export function clearCaches() {
  // Очищаємо localStorage
  localStorage.clear();
  
  // Очищаємо sessionStorage
  sessionStorage.clear();
  
  // Очищаємо кеш Service Worker (якщо доступно)
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => {
        caches.delete(name);
      });
    });
  }
  
  console.log('All caches cleared');
}

// Функція для моніторингу продуктивності
export function monitorPerformance() {
  if (process.env.NODE_ENV === 'development') {
    // Моніторимо FPS
    let lastTime = performance.now();
    let frameCount = 0;
    
    function measureFPS() {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime - lastTime >= 1000) {
        console.log(`FPS: ${frameCount}`);
        frameCount = 0;
        lastTime = currentTime;
      }
      
      requestAnimationFrame(measureFPS);
    }
    
    measureFPS();
    
    // Моніторимо розмір DOM
    const observer = new MutationObserver(() => {
      const domSize = document.querySelectorAll('*').length;
      if (domSize > 1000) {
        console.warn(`Large DOM detected: ${domSize} elements`);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}
