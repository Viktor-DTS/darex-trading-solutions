import API_BASE_URL from '../config.js';

export const tasksAPI = {
  async getAll() {
    const res = await fetch(`${API_BASE_URL}/tasks`);
    if (!res.ok) throw new Error('Помилка завантаження заявок');
    return await res.json();
  },
  async add(task) {
    const res = await fetch(`${API_BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    if (!res.ok) throw new Error('Помилка додавання заявки');
    return (await res.json()).task;
  },
  async update(id, task) {
    console.log('[DEBUG] tasksAPI.update called with:', { id, taskId: task?.id });
    if (!id || id === undefined || id === null) {
      console.error('[ERROR] ID заявки не може бути порожнім:', { id, taskId: task?.id });
      throw new Error('ID заявки не може бути порожнім');
    }
    const res = await fetch(`${API_BASE_URL}/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    if (!res.ok) throw new Error('Помилка оновлення заявки');
    return (await res.json()).task;
  },
  async remove(id) {
    if (!id || id === undefined || id === null) {
      throw new Error('ID заявки не може бути порожнім');
    }
    const res = await fetch(`${API_BASE_URL}/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Помилка видалення заявки');
    return (await res.json()).removed;
  }
}; 