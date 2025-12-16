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
  let standbyMatch = text.match(/STANDBY\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)/i);
  if (standbyMatch) {
    data.standbyPower = standbyMatch[1].trim().replace(/\s+/g, ' ');
  } else {
    // Альтернативний формат: STANDBY: 50/40
    standbyMatch = text.match(/STANDBY[:\s]+([\d\/]+)/i);
    if (standbyMatch) {
      data.standbyPower = standbyMatch[1].trim();
    } else {
      // Якщо OCR розпізнав неточно, шукаємо патерн "число/число" після "пе" або перед "45/36"
      // Шукаємо формат типу "150/40" або "50/40" перед "45/36"
      const powerPattern = text.match(/(\d{2,3}\/\d{2,3})\s+(\d{2,3}\/\d{2,3})/);
      if (powerPattern) {
        // Перший - це standby, другий - prime
        data.standbyPower = powerPattern[1].trim();
        data.primePower = powerPattern[2].trim();
      } else {
        // Спробуємо знайти просто "50/40" або "150/40"
        const simpleStandby = text.match(/(\d{2,3}\/\d{2,3})/);
        if (simpleStandby && !data.standbyPower) {
          data.standbyPower = simpleStandby[1].trim();
        }
      }
    }
  }

  // PRIME POWER: 45/36 KVA/KW (різні формати)
  let primeMatch = text.match(/PRIME\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)/i);
  if (primeMatch) {
    data.primePower = primeMatch[1].trim().replace(/\s+/g, ' ');
  } else {
    // Альтернативний формат: PRIME: 45/36
    primeMatch = text.match(/PRIME[:\s]+([\d\/]+)/i);
    if (primeMatch) {
      data.primePower = primeMatch[1].trim();
    } else if (!data.primePower) {
      // Якщо не знайдено через OCR помилки, спробуємо знайти другий патерн "число/число"
      const powerPattern = text.match(/(\d{2,3}\/\d{2,3})\s+(\d{2,3}\/\d{2,3})/);
      if (powerPattern && powerPattern[2]) {
        data.primePower = powerPattern[2].trim();
      }
    }
  }

  // PHASE: 3
  const phaseMatch = text.match(/PHASE[:\s]+(\d+)/i);
  if (phaseMatch) data.phase = parseInt(phaseMatch[1]);

  // V: 400/230 (різні формати)
  let voltageMatch = text.match(/V[:\s]+([\d\/]+)/i);
  if (voltageMatch) {
    data.voltage = voltageMatch[1].trim();
  } else {
    // Якщо OCR розпізнав неточно, шукаємо патерн "400/230" після чисел
    // Шукаємо формат типу "400/230" після потужностей
    voltageMatch = text.match(/(\d{3}\/\d{3})/);
    if (voltageMatch) {
      // Перевіряємо, чи це не потужність (потужності зазвичай менші)
      const voltage = voltageMatch[1];
      if (voltage.startsWith('400') || voltage.startsWith('380') || voltage.startsWith('230')) {
        data.voltage = voltage.trim();
      }
    }
  }

  // A: 72 (різні формати)
  let amperageMatch = text.match(/A[:\s]+(\d+)/i);
  if (amperageMatch) {
    data.amperage = parseInt(amperageMatch[1]);
  } else {
    // Якщо OCR розпізнав неточно, шукаємо число після напруги
    // Шукаємо число в діапазоні 10-200 (типові значення струму)
    const amperagePattern = text.match(/(?:[^\d]|^)(\d{2,3})(?:\s|$)/);
    if (amperagePattern) {
      const value = parseInt(amperagePattern[1]);
      // Перевіряємо, чи це не рік, не розміри, не вага
      if (value >= 10 && value <= 200 && value !== 50 && value !== 1500) {
        data.amperage = value;
      }
    }
  }

  // COSφ: 0.8 (різні формати)
  let cosPhiMatch = text.match(/COS[φΦ]?[:\s]+([\d.]+)/i);
  if (cosPhiMatch) {
    data.cosPhi = parseFloat(cosPhiMatch[1]);
  } else {
    // Якщо OCR розпізнав неточно, шукаємо число 0.8 або 0,8
    cosPhiMatch = text.match(/(?:^|\s)(0[.,]\d{1,2})(?:\s|$)/);
    if (cosPhiMatch) {
      data.cosPhi = parseFloat(cosPhiMatch[1].replace(',', '.'));
    }
  }

  // RPM: 1500 (різні формати)
  let rpmMatch = text.match(/RPM[:\s]+(\d+)/i);
  if (rpmMatch) {
    data.rpm = parseInt(rpmMatch[1]);
  } else {
    // Якщо OCR розпізнав неточно, шукаємо число 1500 (типове значення RPM)
    rpmMatch = text.match(/(?:^|\s)(1500|3000)(?:\s|$)/);
    if (rpmMatch) {
      data.rpm = parseInt(rpmMatch[1]);
    }
  }

  // Hz: 50 (різні формати)
  let freqMatch = text.match(/HZ[:\s]+(\d+)/i);
  if (freqMatch) {
    data.frequency = parseInt(freqMatch[1]);
  } else {
    // Якщо OCR розпізнав неточно, шукаємо число 50 або 60 (типові частоти)
    freqMatch = text.match(/(?:^|\s|°)(50|60)(?:\s|$|°)/);
    if (freqMatch) {
      data.frequency = parseInt(freqMatch[1]);
    }
  }

  // DIMENSION: 2280 x 950 x 1250 (різні формати)
  let dimMatch = text.match(/DIMENSION[:\s]+([\d\sxX×]+)/i);
  if (dimMatch) {
    data.dimensions = dimMatch[1].trim().replace(/\s+/g, ' ');
  } else {
    // Альтернативний формат: LxWxH: 2280x950x1250
    dimMatch = text.match(/(?:LxWxH|SIZE)[:\s]+([\d\sxX×]+)/i);
    if (dimMatch) {
      data.dimensions = dimMatch[1].trim();
    } else {
      // Якщо OCR розпізнав неточно, шукаємо три великі числа (розміри зазвичай 1000+)
      const dimPattern = text.match(/(\d{4})\s+(\d{3,4})\s+[""]?(\d{4})/);
      if (dimPattern) {
        data.dimensions = `${dimPattern[1]} x ${dimPattern[2]} x ${dimPattern[3]}`;
      } else {
        // Спробуємо знайти три числа підряд
        const threeNumbers = text.match(/(\d{3,4})\s+(\d{3,4})\s+(\d{3,4})/);
        if (threeNumbers) {
          const n1 = parseInt(threeNumbers[1]);
          const n2 = parseInt(threeNumbers[2]);
          const n3 = parseInt(threeNumbers[3]);
          // Розміри зазвичай більші за 500
          if (n1 > 500 && n2 > 500 && n3 > 500) {
            data.dimensions = `${n1} x ${n2} x ${n3}`;
          }
        }
      }
    }
  }

  // WEIGHT: 940 (різні формати)
  let weightMatch = text.match(/WEIGHT[:\s]+(\d+)/i);
  if (weightMatch) {
    data.weight = parseInt(weightMatch[1]);
  } else {
    // Якщо OCR розпізнав неточно, шукаємо число після розмірів (вага зазвичай 100-10000)
    // Шукаємо число, яке не є роком (не 2024) і не є частиною розмірів
    weightMatch = text.match(/(?:^|\s)(\d{3,4})(?:\s|$)/);
    if (weightMatch) {
      const value = parseInt(weightMatch[1]);
      // Вага зазвичай в діапазоні 100-10000, і не є роком
      if (value >= 100 && value <= 10000 && value !== 2024 && value !== 1500 && value !== 50) {
        data.weight = value;
      }
    }
  }

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

