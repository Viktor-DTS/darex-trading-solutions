import API_BASE_URL from '../config.js';

export const tasksAPI = {
  async getAll() {
    console.log('[DEBUG] tasksAPI.getAll called');
    try {
      const res = await fetch(`${API_BASE_URL}/tasks`);
      console.log('[DEBUG] tasksAPI.getAll - відповідь сервера:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.getAll - помилка сервера:', errorText);
        throw new Error('Помилка завантаження заявок');
      }
      
      const data = await res.json();
      console.log('[DEBUG] tasksAPI.getAll - отримані дані:', data);
      return data;
    } catch (error) {
      console.error('[ERROR] tasksAPI.getAll - виняток:', error);
      throw error;
    }
  },
  async add(task) {
    console.log('[DEBUG] tasksAPI.add called with:', task);
    
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
      
      console.log('[DEBUG] tasksAPI.add - відповідь сервера:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.add - помилка сервера:', errorText);
        throw new Error(`Помилка додавання заявки: ${res.status} ${res.statusText}`);
      }
      
      const result = await res.json();
      console.log('[DEBUG] tasksAPI.add - успішний результат:', result);
      return result.task;
    } catch (error) {
      console.error('[ERROR] tasksAPI.add - виняток:', error);
      throw error;
    }
  },
  async update(id, task) {
    console.log('[DEBUG] tasksAPI.update called with:', { id, taskId: task?.id });
    console.log('[DEBUG] tasksAPI.update - дані для оновлення:', JSON.stringify(task, null, 2));
    
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
      
      console.log('[DEBUG] tasksAPI.update - відповідь сервера:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.update - помилка сервера:', errorText);
        throw new Error(`Помилка оновлення заявки: ${res.status} ${res.statusText}`);
      }
      
      const result = await res.json();
      console.log('[DEBUG] tasksAPI.update - успішний результат:', result);
      return result.task;
    } catch (error) {
      console.error('[ERROR] tasksAPI.update - виняток:', error);
      throw error;
    }
  },
  async remove(id) {
    console.log('[DEBUG] tasksAPI.remove called with id:', id);
    
    if (!id || id === undefined || id === null) {
      console.error('[ERROR] tasksAPI.remove - ID заявки не може бути порожнім:', { id });
      throw new Error('ID заявки не може бути порожнім');
    }
    
    try {
      const res = await fetch(`${API_BASE_URL}/tasks/${id}`, { method: 'DELETE' });
      
      console.log('[DEBUG] tasksAPI.remove - відповідь сервера:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ERROR] tasksAPI.remove - помилка сервера:', errorText);
        throw new Error(`Помилка видалення заявки: ${res.status} ${res.statusText}`);
      }
      
      const result = await res.json();
      console.log('[DEBUG] tasksAPI.remove - успішний результат:', result);
      return result.removed;
    } catch (error) {
      console.error('[ERROR] tasksAPI.remove - виняток:', error);
      throw error;
    }
  }
}; 