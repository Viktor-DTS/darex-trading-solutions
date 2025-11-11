import API_BASE_URL from '../config.js';
import authenticatedFetch from './api.js';

export const tasksAPI = {
  async getAll() {
    try {
      const res = await authenticatedFetch(`${API_BASE_URL}/tasks`);
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