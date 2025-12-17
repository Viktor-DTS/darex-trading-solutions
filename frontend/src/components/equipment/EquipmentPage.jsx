import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API_BASE_URL from '../../config';
import EquipmentDetailsModal from './EquipmentDetailsModal';
import './EquipmentPage.css';

function EquipmentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadEquipment = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          // Якщо немає токену, перенаправляємо на логін
          navigate('/');
          return;
        }

        const response = await fetch(`${API_BASE_URL}/equipment/${id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setEquipment(data);
        } else if (response.status === 404) {
          setError('Обладнання не знайдено');
        } else if (response.status === 401) {
          // Неавторизований - перенаправляємо на логін
          navigate('/');
        } else {
          setError('Помилка завантаження обладнання');
        }
      } catch (err) {
        console.error('Помилка завантаження обладнання:', err);
        setError('Помилка з\'єднання з сервером');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadEquipment();
    }
  }, [id, navigate]);

  const handleClose = () => {
    // Повертаємося назад або на головну сторінку
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="equipment-page">
        <div className="equipment-page-loading">
          <div className="loading-spinner"></div>
          <p>Завантаження інформації про обладнання...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="equipment-page">
        <div className="equipment-page-error">
          <h2>Помилка</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={handleClose}>
            Повернутися назад
          </button>
        </div>
      </div>
    );
  }

  if (!equipment) {
    return (
      <div className="equipment-page">
        <div className="equipment-page-error">
          <h2>Обладнання не знайдено</h2>
          <p>Обладнання з вказаним ID не існує або було видалено.</p>
          <button className="btn-primary" onClick={handleClose}>
            Повернутися назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="equipment-page">
      <EquipmentDetailsModal 
        equipment={equipment} 
        onClose={handleClose}
        isPage={true}
      />
    </div>
  );
}

export default EquipmentPage;

