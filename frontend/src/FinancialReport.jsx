import React, { useState, useEffect } from 'react';
import API_BASE_URL from './config.js';
const initial = {
  status: '',
  requestDesc: '',
  serviceRegion: '',
  date: '',
  engineer1: '',
  engineer2: '',
  work: '',
  client: '',
  paymentType: '',
  invoice: '',
  serviceTotal: '',
  address: '',
  equipmentSerial: '',
  equipment: '',
  oilType: '',
  oilUsed: '',
  oilPrice: '',
  oilTotal: '',
  filterName: '',
  filterCount: '',
  filterPrice: '',
  filterSum: '',
  fuelFilterName: '',
  fuelFilterCount: '',
  fuelFilterPrice: '',
  fuelFilterSum: '',
  antifreezeType: '',
  antifreezeL: '',
  antifreezePrice: '',
  antifreezeSum: '',
  otherMaterials: '',
  otherSum: '',
  workPrice: '',
  perDiem: '',
  living: '',
  otherExp: '',
  carNumber: '',
  transportKm: '',
  transportSum: '',
};
export default function FinancialReport() {
  const [data, setData] = useState(initial);
  const [success, setSuccess] = useState(null);
  // Функція для правильного парсингу чисел з комою як роздільником
  const parseNumber = (value) => {
    if (!value) return 0;
    // Замінюємо кому на крапку для правильного парсингу
    const normalizedValue = String(value).replace(',', '.');
    return parseFloat(normalizedValue) || 0;
  };

  // Функція для форматування чисел з двома знаками після коми
  const formatNumber = (value) => {
    if (value === 0 || value === '0') return '0,00';
    return Number(value).toFixed(2).replace('.', ',');
  };

  // Авторозрахунок
  const calcOilTotal = () => {
    const used = parseNumber(data.oilUsed);
    const price = parseNumber(data.oilPrice);
    return used * price;
  };
  const calcFilterSum = () => {
    const count = parseNumber(data.filterCount);
    const price = parseNumber(data.filterPrice);
    return count * price;
  };
  const calcFuelFilterSum = () => {
    const count = parseNumber(data.fuelFilterCount);
    const price = parseNumber(data.fuelFilterPrice);
    return count * price;
  };
  const calcAntifreezeSum = () => {
    const l = parseNumber(data.antifreezeL);
    const price = parseNumber(data.antifreezePrice);
    return l * price;
  };
  const calcServiceTotal = () => {
    return (
      calcOilTotal() +
      calcFilterSum() +
      calcFuelFilterSum() +
      calcAntifreezeSum() +
      parseNumber(data.otherSum) +
      parseNumber(data.workPrice) +
      parseNumber(data.perDiem) +
      parseNumber(data.living) +
      parseNumber(data.otherExp) +
      parseNumber(data.transportSum)
    );
  };
  // Автозаповнення (приклад)
  const handleEquipmentChange = (e) => {
    const value = e.target.value;
    setData({
      ...data,
      equipment: value,
      oilType: value === 'EMSA BD EM 0022' ? '10W40' : '',
    });
  };
  // Оновлення полів
  const handleChange = (e) => {
    const { name, value } = e.target;
    setData({ ...data, [name]: value });
  };
  // Оновлення розрахункових полів
  const handleBlur = () => {
    setData((prev) => ({
      ...prev,
      oilTotal: calcOilTotal(),
      filterSum: calcFilterSum(),
      fuelFilterSum: calcFuelFilterSum(),
      antifreezeSum: calcAntifreezeSum(),
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(null);
    const payload = {
      ...data,
      oilTotal: calcOilTotal(),
      filterSum: calcFilterSum(),
      fuelFilterSum: calcFuelFilterSum(),
      antifreezeSum: calcAntifreezeSum(),
      serviceTotal: calcServiceTotal(),
    };
    try {
      const res = await fetch(`${API_BASE_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        setSuccess('Звіт успішно збережено!');
        setData(initial);
      } else {
        setSuccess('Помилка при збереженні!');
      }
    } catch {
      setSuccess('Помилка при збереженні!');
    }
  };
  return (
    <form className="fin-report" onBlur={handleBlur} onSubmit={handleSubmit}>
      <h2>Фінансовий звіт по сервісу</h2>
      {success && <div style={{marginBottom:16, color: success.includes('успішно') ? '#0f0' : '#f66'}}>{success}</div>}
      <div className="fin-row">
        <label>Статус заявки <input name="status" value={data.status} onChange={handleChange} /></label>
      </div>
      <div className="fin-row">
        <label>Дата заявки <input name="requestDate" type="date" value={data.requestDate || ''} onChange={handleChange} /></label>
      </div>
      <div className="fin-row">
        <label>Опис заявки <textarea name="requestDesc" value={data.requestDesc} onChange={handleChange} rows={3} style={{resize: 'vertical', minHeight: 40}} /></label>
      </div>
      <div className="fin-row">
        <label>Регіон сервісного відділу <input name="serviceRegion" value={data.serviceRegion} onChange={handleChange} /></label>
      </div>
      <div style={{height: '72px'}}></div>
      <div className="fin-row">
        <label>Адреса <input name="address" value={data.address} onChange={handleChange} /></label>
        <label>Заводський номер обладнання <input name="equipmentSerial" value={data.equipmentSerial} onChange={handleChange} /></label>
        <label>Тип обладнання <input name="equipment" value={data.equipment} onChange={handleEquipmentChange} /></label>
      </div>
      <div className="fin-row">
        <label>Найменування робіт <input name="work" value={data.work} onChange={handleChange} /></label>
      </div>
      <div className="fin-row">
        <label>Дата проведення робіт <input name="date" type="date" value={data.date} onChange={handleChange} /></label>
        <label>Сервісний інженер №1 <input name="engineer1" value={data.engineer1} onChange={handleChange} /></label>
        <label>Сервісний інженер №2 <input name="engineer2" value={data.engineer2} onChange={handleChange} /></label>
      </div>
      <div className="fin-row">
        <label>Замовник <input name="client" value={data.client} onChange={handleChange} /></label>
        <label>Номер рахунку <input name="invoice" value={data.invoice} onChange={handleChange} /></label>
        <label>Вид оплати <input name="paymentType" value={data.paymentType} onChange={handleChange} /></label>
        <label>Загальна сума послуги <input name="serviceTotal" value={calcServiceTotal()} readOnly /></label>
      </div>
      <div className="fin-row">
        <label>Тип оливи <input name="oilType" value={data.oilType} onChange={handleChange} /></label>
        <label>Використано оливи, л <input name="oilUsed" value={data.oilUsed} onChange={handleChange} /></label>
        <label>Ціна оливи за 1 л, грн <input name="oilPrice" value={data.oilPrice} onChange={handleChange} /></label>
        <label>Загальна сума за оливу, грн <input name="oilTotal" value={formatNumber(calcOilTotal())} readOnly /></label>
      </div>
      <div className="fin-row">
        <label>Фільтр масл. назва <input name="filterName" value={data.filterName} onChange={handleChange} /></label>
        <label>Фільтр масл. штук <input name="filterCount" value={data.filterCount} onChange={handleChange} /></label>
        <label>Ціна одного масляного фільтра <input name="filterPrice" value={data.filterPrice} onChange={handleChange} /></label>
        <label>Загальна сума за фільтри масляні <input name="filterSum" value={calcFilterSum()} readOnly /></label>
      </div>
      <div className="fin-row">
        <label>Фільтр палив. назва <input name="fuelFilterName" value={data.fuelFilterName} onChange={handleChange} /></label>
        <label>Фільтр палив. штук <input name="fuelFilterCount" value={data.fuelFilterCount} onChange={handleChange} /></label>
        <label>Ціна одного паливного фільтра <input name="fuelFilterPrice" value={data.fuelFilterPrice} onChange={handleChange} /></label>
        <label>Загальна сума за паливні фільтри <input name="fuelFilterSum" value={calcFuelFilterSum()} readOnly /></label>
      </div>
      <div className="fin-row">
        <label>Антифриз тип <input name="antifreezeType" value={data.antifreezeType} onChange={handleChange} /></label>
        <label>Антифриз, л <input name="antifreezeL" value={data.antifreezeL} onChange={handleChange} /></label>
        <label>Ціна антифризу <input name="antifreezePrice" value={data.antifreezePrice} onChange={handleChange} /></label>
        <label>Загальна сума за антифриз <input name="antifreezeSum" value={calcAntifreezeSum()} readOnly /></label>
      </div>
      <div className="fin-row">
        <label>Опис інших матеріалів <input name="otherMaterials" value={data.otherMaterials} onChange={handleChange} /></label>
        <label>Загальна ціна інших матеріалів <input name="otherSum" value={data.otherSum} onChange={handleChange} /></label>
        <label>Вартість робіт, грн <input name="workPrice" value={data.workPrice} onChange={handleChange} /></label>
        <label>Добові, грн <input name="perDiem" value={data.perDiem} onChange={handleChange} /></label>
        <label>Проживання, грн <input name="living" value={data.living} onChange={handleChange} /></label>
        <label>Інші витрати, грн <input name="otherExp" value={data.otherExp} onChange={handleChange} /></label>
      </div>
      <div className="fin-row">
        <label>Держномер автотранспорту <input name="carNumber" value={data.carNumber} onChange={handleChange} /></label>
        <label>Транспортні витрати, км <input name="transportKm" value={data.transportKm} onChange={handleChange} /></label>
        <label>Загальна вартість тр. витрат <input name="transportSum" value={data.transportSum} onChange={handleChange} /></label>
      </div>
      <button type="submit" style={{marginTop: 24}}>Зберегти</button>
    </form>
  );
} 