import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import './TasksStatisticsBar.css';

const STATS_CACHE_KEY = 'tasksStatisticsCache';

// Регіон для запиту: для «Україна»/без регіону — глобальна статистика (порожній рядок).
function effectiveRegion(user) {
  return user?.region && user.region !== 'Україна' ? user.region : '';
}

// Останні успішно отримані числа зберігаємо в localStorage (з прив'язкою до регіону),
// щоб панель не «зникала» при тимчасовому збої бекенду чи мережі (зокрема одразу після
// перезавантаження сторінки). Чужі числа з іншого регіону не показуємо.
function readCachedStatistics(region) {
  try {
    const raw = localStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.region === region && parsed.data) return parsed.data;
    return null;
  } catch {
    return null;
  }
}

function TasksStatisticsBar({ user }) {
  const [statistics, setStatistics] = useState(() => readCachedStatistics(effectiveRegion(user)));
  const [loading, setLoading] = useState(() => readCachedStatistics(effectiveRegion(user)) === null);

  useEffect(() => {
    let cancelled = false;
    let pollId = null;
    let retryId = null;
    const region = effectiveRegion(user);

    // При зміні регіону показуємо кеш саме цього регіону (або нічого, якщо його немає)
    setStatistics(readCachedStatistics(region));

    const scheduleNext = (delayMs) => {
      if (cancelled) return;
      clearTimeout(retryId);
      retryId = setTimeout(loadStatistics, delayMs);
    };

    const loadStatistics = async () => {
      try {
        const token = localStorage.getItem('token');

        const response = await fetch(`${API_BASE_URL}/tasks/statistics?region=${encodeURIComponent(region)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;
          setStatistics(data);
          try {
            localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ region, data }));
          } catch { /* ignore */ }
        } else {
          // 401 обробляє глобальний перехоплювач fetch (розлогін). Інші статуси (500/таймаут):
          // НЕ гасимо панель — лишаємо останні відомі числа і пробуємо ще раз швидше.
          console.warn(`[TasksStatisticsBar] /tasks/statistics повернув ${response.status}; показуємо попередні числа`);
          if (!cancelled) scheduleNext(8000);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Помилка завантаження статистики заявок:', error);
        // Мережевий збій — зберігаємо попередні числа, повторюємо швидше
        scheduleNext(8000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStatistics();
    // Регулярне оновлення статистики кожні 30 секунд
    pollId = setInterval(loadStatistics, 30000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearTimeout(retryId);
    };
  }, [user?.region]);

  // Показуємо «...» лише доти, доки немає жодних чисел (ні з кешу, ні з мережі)
  if (statistics) {
    return (
      <div className="tasks-statistics-bar">
        {`Заявки:   Не взято: ${statistics.notInWork || 0}   |   В роботі: ${statistics.inWork || 0}   |   Завсклад: ${statistics.pendingWarehouse || 0}   |   Бухгалтер: ${statistics.pendingAccountant || 0}   |   Рахунки: ${statistics.pendingInvoiceRequests || 0}`}
      </div>
    );
  }

  return (
    <div className="tasks-statistics-bar">
      {loading ? '...' : null}
    </div>
  );
}

export default TasksStatisticsBar;
