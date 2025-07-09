import API_BASE_URL from '../config.js';

export const filesAPI = {
  // Завантаження файлу
  async uploadFile(taskId, file, description = '') {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('taskId', taskId);
      formData.append('description', description);

      const response = await fetch(`${API_BASE_URL}/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Помилка завантаження файлу:', error);
      throw error;
    }
  },

  // Отримання списку файлів для завдання
  async getTaskFiles(taskId) {
    try {
      const response = await fetch(`${API_BASE_URL}/files/task/${taskId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Помилка отримання файлів:', error);
      throw error;
    }
  },

  // Перегляд файлу
  getFileViewUrl(fileId) {
    return `${API_BASE_URL}/files/view/${fileId}`;
  },

  // Завантаження файлу
  getFileDownloadUrl(fileId) {
    return `${API_BASE_URL}/files/download/${fileId}`;
  },

  // Видалення файлу
  async deleteFile(fileId) {
    try {
      const response = await fetch(`${API_BASE_URL}/files/${fileId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Помилка видалення файлу:', error);
      throw error;
    }
  },

  // Функція для завантаження файлу на локальний комп'ютер
  downloadFile(fileId, originalName) {
    const link = document.createElement('a');
    link.href = this.getFileDownloadUrl(fileId);
    link.download = originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  // Функція для перегляду файлу в новому вікні
  viewFile(fileId) {
    window.open(this.getFileViewUrl(fileId), '_blank');
  }
}; 