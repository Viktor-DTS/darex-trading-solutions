import API_BASE_URL from '../config.js';
export const tasksAPI = {
  async getAll() {
    try {
      const res = await fetch(`${API_BASE_URL}/tasks`);
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
      const res = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE_URL}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE_URL}/tasks/${id}`, { method: 'DELETE' });
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
      const res = await fetch(`${API_BASE_URL}/tasks/${id}`);
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
  }
}; 