import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  ua: {
    translation: {
      'company_name': 'ДАРЕКС ТРЕЙДІНГ СОЛЮШНС',
      'welcome': 'Ласкаво просимо до сучасного клієнтського інтерфейсу!',
      'ping': 'Перевірка звʼязку з сервером',
      'server_ok': 'Сервер працює!'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'ua',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n; 