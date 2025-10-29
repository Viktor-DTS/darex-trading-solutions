import React from 'react';
const roles = [
  { value: 'service', label: 'Сервісна служба' },
  { value: 'operator', label: 'Оператор' },
  { value: 'warehouse', label: 'Зав. склад' },
  { value: 'accountant', label: 'Бух. рахунки' },
  { value: 'accountant-approval', label: 'Бух. на Затвердженні' },
  { value: 'regional', label: 'Регіональний керівник' },
  { value: 'admin', label: 'Адміністратор' },
  { value: 'reports', label: 'Звіти' },
  { value: 'materials', label: 'Аналіз ціни матеріалів' },
  { value: 'analytics', label: 'Аналітика' },
];
export default function Sidebar({ role, onSelect, current, accessRules }) {
  return (
    <nav style={{
      width: '100vw',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 2000,
      background: '#1a2636',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      padding: '0 32px',
      height: 56,
      boxShadow: '0 2px 12px #0006',
      borderBottom: '1px solid #22334a',
    }}>
      {roles.map(r => {
        let access = 'none'; // За замовчуванням немає доступу
        // Перевіряємо права доступу для поточної ролі користувача
        if (accessRules && accessRules[role] && accessRules[role][r.value]) {
          access = accessRules[role][r.value];
        }
        const isDisabled = (access === 'none');
        return (
          <button
            key={r.value}
            onClick={() => onSelect(r.value)}
            disabled={isDisabled}
            style={{
              background: current === r.value ? '#00bfff' : 'transparent',
              color: current === r.value ? '#fff' : '#bcd',
              border: 'none',
              borderBottom: current === r.value ? '3px solid #fff' : '3px solid transparent',
              fontWeight: 500,
              fontSize: 16,
              padding: '0 24px',
              height: 56,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
              transition: 'background 0.2s, color 0.2s',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </nav>
  );
} 