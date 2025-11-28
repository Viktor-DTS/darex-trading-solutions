import API_BASE_URL from '../config.js';
import authenticatedFetch from './api.js';

export const tasksAPI = {
  async getAll(limit = null) {
    try {
      let url = `${API_BASE_URL}/tasks`;
      if (limit) {
        url += `?limit=${limit}`;
      }
      const res = await authenticatedFetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.getAll - помилка сервера:', errorText);
        throw new Error('Помилка завантаження заявок');
      }
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('[ERROR] tasksAPI.getAll - виняток:', error);
      throw error;
    }
  },
  // Метод для завантаження всіх завдань для звітів (без обмеження)
  async getAllForReport() {
    try {
      // Завантажуємо з великим лімітом (10000) для звітів
      const url = `${API_BASE_URL}/tasks?limit=10000`;
      console.log('[DEBUG] tasksAPI.getAllForReport - відправляємо запит:', url);
      const res = await authenticatedFetch(url);
      console.log('[DEBUG] tasksAPI.getAllForReport - отримано відповідь, status:', res.status, 'ok:', res.ok);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.getAllForReport - помилка сервера:', errorText);
        throw new Error('Помилка завантаження заявок для звіту');
      }
      let data = await res.json();
      console.log(`[tasksAPI] Завантажено ${data.length} завдань для звіту (очікувалось до 10000)`);
      
      // Якщо отримано рівно 1000 заявок, можливо є обмеження - завантажуємо решту частинами
      if (data.length === 1000) {
        console.warn('[WARNING] tasksAPI.getAllForReport - отримано рівно 1000 заявок, завантажуємо решту частинами...');
        let allTasks = [...data];
        let skip = 1000;
        let batchSize = 1000;
        let hasMore = true;
        
        while (hasMore) {
          try {
            const batchUrl = `${API_BASE_URL}/tasks?limit=${batchSize}&skip=${skip}`;
            console.log(`[DEBUG] tasksAPI.getAllForReport - завантажуємо наступну партію: skip=${skip}, limit=${batchSize}`);
            const batchRes = await authenticatedFetch(batchUrl);
            
            if (!batchRes.ok) {
              console.warn(`[WARNING] tasksAPI.getAllForReport - помилка завантаження партії skip=${skip}, зупиняємо`);
              break;
            }
            
            const batchData = await batchRes.json();
            console.log(`[tasksAPI] Завантажено партію: ${batchData.length} завдань (skip=${skip})`);
            
            if (batchData.length === 0) {
              hasMore = false;
            } else {
              allTasks = [...allTasks, ...batchData];
              skip += batchSize;
              
              // Якщо отримано менше ніж batchSize, це остання партія
              if (batchData.length < batchSize) {
                hasMore = false;
              }
            }
          } catch (batchError) {
            console.error(`[ERROR] tasksAPI.getAllForReport - помилка завантаження партії skip=${skip}:`, batchError);
            hasMore = false;
          }
        }
        
        console.log(`[tasksAPI] Всього завантажено ${allTasks.length} завдань для звіту (з пагінацією)`);
        return allTasks;
      }
      
      return data;
    } catch (error) {
      console.error('[ERROR] tasksAPI.getAllForReport - виняток:', error);
      throw error;
    }
  },
  async add(task) {
    if (!task) {
      console.error('[ERROR] tasksAPI.add - відсутні дані заявки');
      throw new Error('Відсутні дані заявки');
    }
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        body: JSON.stringify(task)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.add - помилка сервера:', errorText);
        throw new Error(`Помилка додавання заявки: ${res.status} ${res.statusText}`);
      }
      const result = await res.json();
      return result.task;
    } catch (error) {
      console.error('[ERROR] tasksAPI.add - виняток:', error);
      throw error;
    }
  },
  async update(id, task) {
    if (!id || id === undefined || id === null) {
      console.error('[ERROR] ID заявки не може бути порожнім:', { id, taskId: task?.id });
      throw new Error('ID заявки не може бути порожнім');
    }
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(task)
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.update - помилка сервера:', errorText);
        throw new Error(`Помилка оновлення заявки: ${res.status} ${res.statusText}`);
      }
      const result = await res.json();
      return result.task;
    } catch (error) {
      console.error('[ERROR] tasksAPI.update - виняток:', error);
      throw error;
    }
  },
  async remove(id) {
    if (!id || id === undefined || id === null) {
      console.error('[ERROR] tasksAPI.remove - ID заявки не може бути порожнім:', { id });
      throw new Error('ID заявки не може бути порожнім');
    }
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.remove - помилка сервера:', errorText);
        throw new Error(`Помилка видалення заявки: ${res.status} ${res.statusText}`);
      }
      const result = await res.json();
      return result.removed;
    } catch (error) {
      console.error('[ERROR] tasksAPI.remove - виняток:', error);
      throw error;
    }
  },
  async getById(id) {
    if (!id || id === undefined || id === null) {
      console.error('[ERROR] tasksAPI.getById - ID заявки не може бути порожнім:', { id });
      throw new Error('ID заявки не може бути порожнім');
    }
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks/${id}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.getById - помилка сервера:', errorText);
        throw new Error(`Помилка завантаження заявки: ${res.status} ${res.statusText}`);
      }
      const result = await res.json();
      return result;
    } catch (error) {
      console.error('[ERROR] tasksAPI.getById - виняток:', error);
      throw error;
    }
  },
  // НОВІ МЕТОДИ ДЛЯ ОПТИМІЗАЦІЇ - завантаження тільки потрібних заявок
  async getByStatus(status, region = null) {
    try {
      let url = `${API_BASE_URL}/tasks/filter?status=${encodeURIComponent(status)}`;
      if (region && region !== 'Україна') {
        url += `&region=${encodeURIComponent(region)}`;
      }
      
      console.log(`[tasksAPI] Fetching tasks with status: ${status}, region: ${region}`);
      const res = await authenticatedFetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.getByStatus - помилка сервера:', errorText);
        throw new Error('Помилка завантаження заявок по статусу');
      }
      const data = await res.json();
      console.log(`[tasksAPI] Fetched ${data.length} tasks for status: ${status}`);
      return data;
    } catch (error) {
      console.error('[ERROR] tasksAPI.getByStatus - виняток:', error);
      throw error;
    }
  },
  async getNotDone(region = null) {
    return this.getByStatus('notDone', region);
  },
  async getPending(region = null) {
    return this.getByStatus('pending', region);
  },
  async getDone(region = null) {
    return this.getByStatus('done', region);
  },
  async getBlocked(region = null) {
    return this.getByStatus('blocked', region);
  }
}; 