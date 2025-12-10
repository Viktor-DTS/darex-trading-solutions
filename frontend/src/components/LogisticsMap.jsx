import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import API_BASE_URL from '../config.js';
import './LogisticsMap.css';

// Виправлення іконок для Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Компонент для центрування карти
function MapCenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

// Створення кастомних іконок для різних статусів
const createCustomIcon = (color) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const statusColors = {
  'Заявка': '#2196F3',      // Синій
  'В роботі': '#FF9800',    // Помаранчевий
};

// Функції для роботи з кешем координат (fallback)
const getGeocodeCache = () => {
  try {
    const cached = localStorage.getItem('geocodeCache');
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
};

const setCachedCoordinates = (address, lat, lng) => {
  try {
    const cache = getGeocodeCache();
    cache[address] = { lat, lng, timestamp: Date.now() };
    localStorage.setItem('geocodeCache', JSON.stringify(cache));
  } catch (err) {
    console.error('Помилка збереження кешу:', err);
  }
};

// Збереження координат в базу даних
const saveCoordinatesToDatabase = async (taskId, lat, lng, isApproximate = false) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/coordinates`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lat, lng, isApproximate })
    });
    
    if (!response.ok) {
      console.error('Помилка збереження координат в базу');
      return false;
    }
    return true;
  } catch (err) {
    console.error('Помилка збереження координат:', err);
    return false;
  }
};

// Функція для нормалізації адреси (додавання пробілів після крапок)
const normalizeAddress = (address) => {
  // Додаємо пробіли після крапок перед скороченнями (м., вул., просп., бул., пл., пров., пер., шосе тощо)
  // Замінюємо "м.Дніпро" на "м. Дніпро", "вул.Свердлова" на "вул. Свердлова" тощо
  return address
    .replace(/([а-яА-ЯіІїЇєЄ]\.)([А-Яа-ЯіІїЇєЄ])/g, '$1 $2') // Після крапки перед великою літерою
    .replace(/([а-яА-ЯіІїЇєЄ]\.)([а-яіїє])/g, '$1 $2') // Після крапки перед малою літерою
    .replace(/\s+/g, ' ') // Замінюємо множинні пробіли на один
    .trim();
};

// Функція для видалення номера будинку з адреси
const removeHouseNumber = (address) => {
  // Видаляємо останній номер будинку (наприклад, "25", "2Б", "34-А")
  // Регулярний вираз для пошуку номерів будинків в кінці адреси
  return address.replace(/,\s*[0-9]+[А-Яа-яA-Za-z]?(-[0-9]+[А-Яа-яA-Za-z]?)?\s*$/, '').trim();
};

// Функція геокодування з fallback
const geocodeAddress = async (address) => {
  try {
    // Нормалізуємо адресу (додаємо пробіли після крапок)
    const normalizedAddress = normalizeAddress(address);
    
    // Спочатку шукаємо повну адресу
    const fullAddress = `${normalizedAddress}, Україна`;
    const encodedFullAddress = encodeURIComponent(fullAddress);
    
    let response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedFullAddress}&limit=1`,
      {
        headers: {
          'User-Agent': 'DTS-Service-App'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      if (data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
          isApproximate: false,
          found: true
        };
      }
    }

    // Якщо не знайдено повну адресу, спробуємо без номера будинку
    const addressWithoutNumber = removeHouseNumber(normalizedAddress);
    if (addressWithoutNumber !== normalizedAddress && addressWithoutNumber.length > 0) {
      // Затримка перед другим запитом
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const simplifiedAddress = `${addressWithoutNumber}, Україна`;
      const encodedSimplified = encodeURIComponent(simplifiedAddress);
      
      response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedSimplified}&limit=1`,
        {
          headers: {
            'User-Agent': 'DTS-Service-App'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.length > 0) {
          return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
            isApproximate: true, // Позначаємо як приблизне
            found: true
          };
        }
      }
    }

    return { found: false };
  } catch (err) {
    console.error(`Помилка геокодування адреси "${address}":`, err);
    return { found: false, error: err.message };
  }
};

function LogisticsMap({ user, onTaskClick }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [geocodedTasks, setGeocodedTasks] = useState([]);
  const [failedGeocodingTasks, setFailedGeocodingTasks] = useState([]);
  const [geocodingProgress, setGeocodingProgress] = useState({ current: 0, total: 0 });
  const [showFailedTasks, setShowFailedTasks] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isRegeocoding, setIsRegeocoding] = useState(false);
  
  // Перевірка, чи користувач є адміністратором
  const isAdmin = user?.role === 'admin' || user?.role === 'administrator';

  // Завантаження заявок
  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        // Використовуємо filter endpoint з параметром notDone (який включає 'Заявка' та 'В роботі')
        const url = `${API_BASE_URL}/tasks/filter?statuses=notDone&region=${user?.region || ''}`;
        
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
          // Якщо filter не працює, використовуємо звичайний endpoint
          const fallbackUrl = `${API_BASE_URL}/tasks?region=${user?.region || ''}`;
          const fallbackResponse = await fetch(fallbackUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (!fallbackResponse.ok) throw new Error('Помилка завантаження заявок');
          
          let data = await fallbackResponse.json();
          // Фільтруємо на клієнті
          data = data.filter(task => 
            task.status === 'Заявка' || task.status === 'В роботі'
          );
          
          // Фільтруємо тільки заявки з адресами
          const tasksWithAddresses = data.filter(task => 
            task.address && 
            task.address.trim() !== '' && 
            (task.status === 'Заявка' || task.status === 'В роботі')
          );
          setTasks(tasksWithAddresses);
          return;
        }
        
        const data = await response.json();
        
        // Фільтруємо тільки заявки з адресами
        const tasksWithAddresses = data.filter(task => 
          task.address && 
          task.address.trim() !== '' && 
          (task.status === 'Заявка' || task.status === 'В роботі')
        );
        setTasks(tasksWithAddresses);
      } catch (err) {
        setError(err.message);
        console.error('Помилка завантаження заявок:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadTasks();
    }
  }, [user]);

  // Геокодування адрес через Nominatim API з перевіркою бази даних
  useEffect(() => {
    const geocodeAddresses = async () => {
      if (tasks.length === 0) return;

      const geocoded = [];
      const failed = [];
      const toGeocode = [];
      
      // Розділяємо заявки на ті, що мають координати в базі, і ті, що потребують геокодування
      tasks.forEach(task => {
        // Перевіряємо, чи є координати в базі даних
        if (task.lat && task.lng && !isNaN(parseFloat(task.lat)) && !isNaN(parseFloat(task.lng))) {
          geocoded.push({
            ...task,
            lat: parseFloat(task.lat),
            lng: parseFloat(task.lng),
            isApproximate: task.isApproximate || false, // Зберігаємо прапорець приблизності з бази
            geocoded: true,
            fromDatabase: true
          });
        } else {
          // Якщо координат немає в базі, перевіряємо localStorage як fallback
          const cache = getGeocodeCache();
          const cached = cache[task.address];
          if (cached && cached.lat && cached.lng) {
            geocoded.push({
              ...task,
              lat: cached.lat,
              lng: cached.lng,
              geocoded: true,
              fromCache: true
            });
            // Синхронізуємо з базою даних (якщо є task._id)
            if (task._id) {
              saveCoordinatesToDatabase(task._id, cached.lat, cached.lng);
            }
          } else {
            // Потрібно геокодувати
            toGeocode.push(task);
          }
        }
      });

      // Оновлюємо стан з координатами з бази одразу
      if (geocoded.length > 0) {
        setGeocodedTasks(geocoded);
      }

      // Якщо немає адрес для геокодування, завершуємо
      if (toGeocode.length === 0) {
        setGeocodingProgress({ current: 0, total: 0 });
        setIsGeocoding(false);
        return;
      }

      setIsGeocoding(true);
      setGeocodingProgress({ current: 0, total: toGeocode.length });

      // Геокодуємо тільки ті, що не мають координат
      for (let i = 0; i < toGeocode.length; i++) {
        const task = toGeocode[i];
        try {
          // Використовуємо функцію з fallback логікою
          const result = await geocodeAddress(task.address);

          if (result.found) {
            const { lat, lng, isApproximate } = result;
            
            // Зберігаємо в базу даних
            if (task._id) {
              await saveCoordinatesToDatabase(task._id, lat, lng, isApproximate);
            }
            
            // Також зберігаємо в localStorage як fallback
            setCachedCoordinates(task.address, lat, lng);
            
            geocoded.push({
              ...task,
              lat,
              lng,
              isApproximate: isApproximate || false,
              geocoded: true,
              fromDatabase: false
            });
          } else {
            // Якщо не знайдено навіть приблизно, додаємо до списку невдалих
            failed.push({
              ...task,
              reason: result.error || 'Адресу не знайдено на карті'
            });
          }

          setGeocodingProgress({ current: i + 1, total: toGeocode.length });
          
          // Оновлюємо стан після кожного успішного геокодування
          setGeocodedTasks([...geocoded]);
          
          // Затримка між запитами (Nominatim має обмеження: 1 запит/сек)
          if (i < toGeocode.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1100));
          }
        } catch (err) {
          console.error(`Помилка геокодування адреси "${task.address}":`, err);
          failed.push({
            ...task,
            reason: `Помилка: ${err.message}`
          });
        }
      }

      // Фінальне оновлення стану
      setGeocodedTasks(geocoded);
      setFailedGeocodingTasks(failed);
      setIsGeocoding(false);
    };

    if (tasks.length > 0) {
      geocodeAddresses();
    }
  }, [tasks]);

  // Функція для перегеокодування всіх заявок
  const handleRegeocodeAll = async () => {
    if (!isAdmin) return;
    
    if (!confirm('Ви впевнені, що хочете перепровірити геокодування для всіх заявок? Це може зайняти деякий час.')) {
      return;
    }

    setIsRegeocoding(true);
    setGeocodingProgress({ current: 0, total: tasks.length });
    
    const geocoded = [];
    const failed = [];

    // Геокодуємо всі заявки, навіть ті, що вже мають координати
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      try {
        const result = await geocodeAddress(task.address);

        if (result.found) {
          const { lat, lng, isApproximate } = result;
          
          // Зберігаємо в базу даних (оновлюємо координати)
          if (task._id) {
            await saveCoordinatesToDatabase(task._id, lat, lng, isApproximate);
          }
          
          // Оновлюємо localStorage
          setCachedCoordinates(task.address, lat, lng);
          
          geocoded.push({
            ...task,
            lat,
            lng,
            isApproximate: isApproximate || false,
            geocoded: true,
            fromDatabase: false
          });
        } else {
          failed.push({
            ...task,
            reason: result.error || 'Адресу не знайдено на карті'
          });
        }

        setGeocodingProgress({ current: i + 1, total: tasks.length });
        setGeocodedTasks([...geocoded]);
        
        // Затримка між запитами
        if (i < tasks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1100));
        }
      } catch (err) {
        console.error(`Помилка перегеокодування адреси "${task.address}":`, err);
        failed.push({
          ...task,
          reason: `Помилка: ${err.message}`
        });
      }
    }

    setGeocodedTasks(geocoded);
    setFailedGeocodingTasks(failed);
    setIsRegeocoding(false);
    
    alert(`Перегеокодування завершено. Успішно: ${geocoded.length}, Невдало: ${failed.length}`);
  };

  // Обчислення центру карти
  const mapCenter = useMemo(() => {
    if (geocodedTasks.length === 0) {
      return [50.4501, 30.5234]; // Київ за замовчуванням
    }

    const lats = geocodedTasks.map(t => t.lat);
    const lngs = geocodedTasks.map(t => t.lng);
    
    const avgLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const avgLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
    
    return [avgLat, avgLng];
  }, [geocodedTasks]);

  // Обробник кліку на рядок таблиці
  const handleRowClick = (task) => {
    if (onTaskClick) {
      onTaskClick(task);
    }
  };

  if (loading) {
    return (
      <div className="logistics-map-loading">
        <div className="loading-spinner">⏳</div>
        <p>Завантаження заявок...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="logistics-map-error">
        <p>❌ Помилка: {error}</p>
      </div>
    );
  }

  return (
    <div className="logistics-map-container">
      <div className="logistics-map-header">
        <h2>🗺️ Логістика</h2>
        <div className="map-stats">
          <span className="stat-item">
            <span className="stat-dot" style={{ backgroundColor: statusColors['Заявка'] }}></span>
            Заявка: {geocodedTasks.filter(t => t.status === 'Заявка').length}
          </span>
          <span className="stat-item">
            <span className="stat-dot" style={{ backgroundColor: statusColors['В роботі'] }}></span>
            В роботі: {geocodedTasks.filter(t => t.status === 'В роботі').length}
          </span>
          {(isGeocoding || isRegeocoding) && geocodingProgress.total > 0 && (
            <span className="geocoding-progress">
              {isRegeocoding ? 'Перегеокодування' : 'Геокодування'}: {geocodingProgress.current} / {geocodingProgress.total}
            </span>
          )}
          {isAdmin && (
            <button 
              className="regeocode-btn"
              onClick={handleRegeocodeAll}
              disabled={isRegeocoding || isGeocoding}
              title="Перепровірити геокодування для всіх заявок"
            >
              🔄 Перепровірити геоточки
            </button>
          )}
        </div>
      </div>

      {/* Інформаційне поле про невдалі геокодування */}
      {failedGeocodingTasks.length > 0 && (
        <div className="failed-geocoding-alert">
          <div className="alert-header" onClick={() => setShowFailedTasks(!showFailedTasks)}>
            <span className="alert-icon">⚠️</span>
            <span className="alert-text">
              Не вдалося знайти на карті {failedGeocodingTasks.length} заявок
            </span>
            <span className="alert-toggle">{showFailedTasks ? '▲' : '▼'}</span>
          </div>
          {showFailedTasks && (
            <div className="failed-tasks-list">
              <table className="failed-tasks-table">
                <thead>
                  <tr>
                    <th>№ заявки</th>
                    <th>Клієнт</th>
                    <th>Адреса</th>
                    <th>Статус</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {failedGeocodingTasks.map((task, index) => (
                    <tr 
                      key={task._id || index}
                      className="failed-task-row"
                      onClick={() => handleRowClick(task)}
                    >
                      <td>{task.requestNumber || '—'}</td>
                      <td>{task.client || '—'}</td>
                      <td className="address-cell">{task.address}</td>
                      <td>
                        <span className={`status-badge status-${task.status?.toLowerCase().replace(' ', '-') || ''}`}>
                          {task.status || '—'}
                        </span>
                      </td>
                      <td className="reason-cell">{task.reason || 'Невідома помилка'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {geocodedTasks.length === 0 && failedGeocodingTasks.length === 0 ? (
        <div className="logistics-map-empty">
          <p>Немає заявок з адресами для відображення на карті</p>
        </div>
      ) : geocodedTasks.length === 0 ? (
        <div className="logistics-map-empty">
          <p>Не вдалося геокодувати жодну заявку. Перевірте список вище.</p>
        </div>
      ) : (
        <div className="logistics-map-wrapper">
          <MapContainer
            center={mapCenter}
            zoom={8}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapCenter center={mapCenter} zoom={8} />
            
            {geocodedTasks.map((task, index) => (
              <Marker
                key={task._id || index}
                position={[task.lat, task.lng]}
                icon={createCustomIcon(statusColors[task.status] || '#666')}
              >
                <Popup>
                  <div className="map-popup">
                    <h4>{task.client || 'Без назви'}</h4>
                    {task.isApproximate && (
                      <div className="approximate-warning">
                        <span className="warning-icon">⚠️</span>
                        <span className="warning-text">
                          Місце розташування приблизне. Дивіться точну адресу в заявці.
                        </span>
                      </div>
                    )}
                    <p><strong>Адреса:</strong> {task.address}</p>
                    <p><strong>Статус:</strong> 
                      <span className={`status-badge status-${task.status.toLowerCase().replace(' ', '-')}`}>
                        {task.status}
                      </span>
                    </p>
                    {task.requestNumber && (
                      <p><strong>№ заявки:</strong> {task.requestNumber}</p>
                    )}
                    {task.date && (
                      <p><strong>Дата:</strong> {new Date(task.date).toLocaleDateString('uk-UA')}</p>
                    )}
                    {task.equipment && (
                      <p><strong>Обладнання:</strong> {task.equipment}</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}

export default LogisticsMap;
