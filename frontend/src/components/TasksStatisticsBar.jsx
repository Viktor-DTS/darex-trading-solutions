import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';
import './TasksStatisticsBar.css';

function TasksStatisticsBar({ user }) {
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatistics = async () => {
      try {
        const token = localStorage.getItem('token');
        const region = user?.region && user.region !== 'Україна' ? user.region : '';
        
        const response = await fetch(`${API_BASE_URL}/tasks/statistics?region=${encodeURIComponent(region)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          setStatistics(data);
        }
      } catch (error) {
        console.error('Помилка завантаження статистики заявок:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStatistics();
    // Оновлюємо статистику кожні 30 секунд
    const interval = setInterval(loadStatistics, 30000);
    return () => clearInterval(interval);
  }, [user?.region]);

  return (
    <div className="tasks-statistics-bar">
      {loading ? '...' : statistics ? (
        `Заявки:   Не взято: ${statistics.notInWork || 0}   |   В роботі: ${statistics.inWork || 0}   |   Завсклад: ${statistics.pendingWarehouse || 0}   |   Бухгалтер: ${statistics.pendingAccountant || 0}   |   Рахунки: ${statistics.pendingInvoiceRequests || 0}`
      ) : null}
    </div>
  );
}

export default TasksStatisticsBar;
