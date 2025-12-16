// Парсер для розпізнавання даних з шильдика DAREX ENERGY та інших форматів

export const parseEquipmentData = (ocrText) => {
  const data = {
    manufacturer: '',
    type: '',
    serialNumber: '',
    standbyPower: '',
    primePower: '',
    phase: null,
    voltage: '',
    amperage: null,
    cosPhi: null,
    rpm: null,
    frequency: null,
    dimensions: '',
    weight: null,
    manufactureDate: ''
  };

  const text = ocrText.toUpperCase();
  
  // Визначаємо виробника
  if (text.includes('DAREX') || text.includes('DAREX ENERGY')) {
    data.manufacturer = 'DAREX ENERGY';
  } else if (text.includes('BAUDOUIN') || text.includes('BAUDO')) {
    data.manufacturer = 'BAUDOUIN';
  } else if (text.includes('CUMMINS')) {
    data.manufacturer = 'CUMMINS';
  } else if (text.includes('PERKINS')) {
    data.manufacturer = 'PERKINS';
  } else {
    // Спробуємо знайти виробника в тексті
    const manufacturerMatch = text.match(/([A-Z]{3,})\s+(ENERGY|GENERATOR|DIESEL|ENGINE)/i);
    if (manufacturerMatch) {
      data.manufacturer = manufacturerMatch[1];
    }
  }

  // TYPE: DE-50BDS (різні формати)
  let typeMatch = text.match(/TYPE[:\s]+([A-Z0-9\-]+)/i);
  if (typeMatch) {
    data.type = typeMatch[1].trim();
  } else {
    // Альтернативний формат: просто DE-50BDS (без слова TYPE)
    // Шукаємо патерн типу DE-XX, DE-XXBDS, тощо
    typeMatch = text.match(/([A-Z]{2,3}[-]\d+[A-Z]*)/);
    if (typeMatch) {
      data.type = typeMatch[1].trim();
    } else {
      // Спробуємо знайти будь-який код типу (букви-цифри-букви)
      typeMatch = text.match(/([A-Z]{2,}[-]?\d+[A-Z]*)/);
      if (typeMatch) {
        data.type = typeMatch[1].trim();
      }
    }
  }

  // №: 20241007015 (різні формати)
  const serialMatch = text.match(/(?:[№#N]|SERIAL|S\/N|SN)[:\s]+(\d+)/i);
  if (serialMatch) {
    data.serialNumber = serialMatch[1].trim();
  } else {
    // Спробуємо знайти довгий номер (10+ цифр)
    const longNumberMatch = text.match(/(\d{10,})/);
    if (longNumberMatch) {
      data.serialNumber = longNumberMatch[1];
    }
  }

  // STANDBY POWER: 50/40 KVA/KW (різні формати)
  const standbyMatch = text.match(/STANDBY\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)/i);
  if (standbyMatch) {
    data.standbyPower = standbyMatch[1].trim().replace(/\s+/g, ' ');
  } else {
    // Альтернативний формат: STANDBY: 50/40
    const standbyAlt = text.match(/STANDBY[:\s]+([\d\/]+)/i);
    if (standbyAlt) data.standbyPower = standbyAlt[1].trim();
  }

  // PRIME POWER: 45/36 KVA/KW (різні формати)
  const primeMatch = text.match(/PRIME\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)/i);
  if (primeMatch) {
    data.primePower = primeMatch[1].trim().replace(/\s+/g, ' ');
  } else {
    // Альтернативний формат: PRIME: 45/36
    const primeAlt = text.match(/PRIME[:\s]+([\d\/]+)/i);
    if (primeAlt) data.primePower = primeAlt[1].trim();
  }

  // PHASE: 3
  const phaseMatch = text.match(/PHASE[:\s]+(\d+)/i);
  if (phaseMatch) data.phase = parseInt(phaseMatch[1]);

  // V: 400/230
  const voltageMatch = text.match(/V[:\s]+([\d\/]+)/i);
  if (voltageMatch) data.voltage = voltageMatch[1].trim();

  // A: 72
  const amperageMatch = text.match(/A[:\s]+(\d+)/i);
  if (amperageMatch) data.amperage = parseInt(amperageMatch[1]);

  // COSφ: 0.8
  const cosPhiMatch = text.match(/COS[φΦ]?[:\s]+([\d.]+)/i);
  if (cosPhiMatch) data.cosPhi = parseFloat(cosPhiMatch[1]);

  // RPM: 1500
  const rpmMatch = text.match(/RPM[:\s]+(\d+)/i);
  if (rpmMatch) data.rpm = parseInt(rpmMatch[1]);

  // Hz: 50
  const freqMatch = text.match(/HZ[:\s]+(\d+)/i);
  if (freqMatch) data.frequency = parseInt(freqMatch[1]);

  // DIMENSION: 2280 x 950 x 1250 (різні формати)
  const dimMatch = text.match(/DIMENSION[:\s]+([\d\sxX×]+)/i);
  if (dimMatch) {
    data.dimensions = dimMatch[1].trim().replace(/\s+/g, ' ');
  } else {
    // Альтернативний формат: LxWxH: 2280x950x1250
    const dimAlt = text.match(/(?:LxWxH|SIZE)[:\s]+([\d\sxX×]+)/i);
    if (dimAlt) data.dimensions = dimAlt[1].trim();
  }

  // WEIGHT: 940
  const weightMatch = text.match(/WEIGHT[:\s]+(\d+)/i);
  if (weightMatch) data.weight = parseInt(weightMatch[1]);

  // DATE: 2024
  const dateMatch = text.match(/DATE[:\s]+(\d{4})/i);
  if (dateMatch) data.manufactureDate = dateMatch[1];

  return data;
};

export const validateEquipmentData = (data) => {
  const errors = [];
  
  if (!data.type) errors.push('Тип обладнання обов\'язковий');
  if (!data.serialNumber) errors.push('Серійний номер обов\'язковий');
  if (!data.currentWarehouse) errors.push('Склад обов\'язковий');
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

