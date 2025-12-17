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

  // TYPE: DE-50BDS або GENSET MODEL: DE 55 BDS (різні формати)
  let typeMatch = text.match(/TYPE[:\s]+([A-Z0-9\-\s]+)/i);
  if (typeMatch) {
    data.type = typeMatch[1].trim().replace(/\s+/g, '-');
  } else {
    // GENSET MODEL формат
    typeMatch = text.match(/GENSET\s+MODEL[:\s]+([A-Z0-9\-\s]+)/i);
    if (typeMatch) {
      data.type = typeMatch[1].trim().replace(/\s+/g, '-');
    } else {
      // Альтернативний формат: просто DE-XX, DE-XXBDS, тощо
      typeMatch = text.match(/([A-Z]{2,3}[-]\d+[A-Z]*)/);
      if (typeMatch) {
        data.type = typeMatch[1].trim();
      } else {
        // Формат з пробілами: DE 55 BDS
        typeMatch = text.match(/([A-Z]{2,3})\s+(\d+)\s+([A-Z]+)/);
        if (typeMatch) {
          data.type = `${typeMatch[1]}-${typeMatch[2]}${typeMatch[3]}`;
        } else {
          // Спробуємо знайти будь-який код типу (букви-цифри-букви)
          typeMatch = text.match(/([A-Z]{2,}[-]?\d+[A-Z]*)/);
          if (typeMatch) {
            data.type = typeMatch[1].trim();
          }
        }
      }
    }
  }

  // №: 20241007015 (різні формати та мови)
  // Підтримка: №, Nº, N, SERIAL, S/N, SN, СЕРИЙНЫЙ НОМЕР, СЕРІЙНИЙ НОМЕР, ЗАВ.№, ЗАВ. НОМЕР, GENSET SERIAL NUMBER
  let serialMatch = text.match(/(?:[№#N]|N[º°]|SERIAL|S\/N|SN|СЕРИЙНЫЙ|СЕРІЙНИЙ|ЗАВ[\.]?[№N]?)[:\s]+(\d{7,})/i);
  if (serialMatch) {
    data.serialNumber = serialMatch[1].trim();
  } else {
    // GENSET SERIAL NUMBER формат
    serialMatch = text.match(/GENSET\s+SERIAL\s+NUMBER[:\s]+(\d{7,})/i);
    if (serialMatch) {
      data.serialNumber = serialMatch[1].trim();
    } else {
      // Спробуємо знайти довгий номер (7+ цифр) після різних міток
      const serialPatterns = [
        /(?:НОМЕР|НОМЕРА|NUMBER)[:\s]+(\d{7,})/i,
        /(\d{7,})/ // Якщо є довгий номер (мінімум 7 цифр)
      ];
      
      for (const pattern of serialPatterns) {
        const match = text.match(pattern);
        if (match) {
          data.serialNumber = match[1];
          break;
        }
      }
    }
  }

  // STANDBY POWER / РЕЗЕРВНА ПОТУЖНІСТЬ / РЕЗЕРВНА МОЩНОСТЬ / ESP: 50/40 KVA/KW (різні формати та мови)
  const standbyPatterns = [
    /STANDBY\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)/i,
    /РЕЗЕРВНА\s+(?:ПОТУЖНІСТЬ|МОЩНОСТЬ|ПОТУЖНІСТЬ)[:\s]+([\d\/\s]+(?:КВА|КВТ|KVA|KW)?)/i,
    /РЕЗЕРВНА[:\s]+([\d\/]+)/i,
    /STANDBY[:\s]+([\d\/]+)/i,
    /ESP\s*\(?KVA\)?[:\s]+(\d+)/i  // ESP (kVA): 55
  ];
  
  let standbyMatch = null;
  for (const pattern of standbyPatterns) {
    standbyMatch = text.match(pattern);
    if (standbyMatch) {
      const powerValue = standbyMatch[1].trim().replace(/\s+/g, ' ');
      // Обробка ESP якщо знайдено (ESP може бути просто числом без "/")
      if (powerValue && !powerValue.includes('/')) {
        // Якщо ESP - це просто число (наприклад, 55), зберігаємо як є
        const espNum = parseInt(powerValue);
        if (espNum) {
          data.standbyPower = String(espNum);
        }
      } else {
        data.standbyPower = powerValue;
      }
      break;
    }
  }
  
  if (!standbyMatch) {
    // Якщо OCR розпізнав неточно, шукаємо патерн "число/число"
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

  // PRIME POWER / ОСНОВНА ПОТУЖНІСТЬ / ОСНОВНА МОЩНОСТЬ / PRP: 45/36 KVA/KW (різні формати та мови)
  const primePatterns = [
    /PRIME\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)/i,
    /ОСНОВНА\s+(?:ПОТУЖНІСТЬ|МОЩНОСТЬ|ПОТУЖНІСТЬ)[:\s]+([\d\/\s]+(?:КВА|КВТ|KVA|KW)?)/i,
    /ОСНОВНА[:\s]+([\d\/]+)/i,
    /PRIME[:\s]+([\d\/]+)/i,
    /PRP\s*\(?KVA\)?[:\s]+(\d+)/i  // PRP (kVA): 50
  ];
  
  let primeMatch = null;
  for (const pattern of primePatterns) {
    primeMatch = text.match(pattern);
    if (primeMatch) {
      const powerValue = primeMatch[1].trim().replace(/\s+/g, ' ');
      // Обробка PRP якщо знайдено (PRP може бути просто числом без "/")
      if (powerValue && !powerValue.includes('/')) {
        // Якщо PRP - це просто число (наприклад, 50), зберігаємо як є
        const prpNum = parseInt(powerValue);
        if (prpNum) {
          data.primePower = String(prpNum);
        }
      } else {
        data.primePower = powerValue;
      }
      break;
    }
  }
  
  if (!primeMatch && !data.primePower) {
    // Якщо не знайдено через OCR помилки, спробуємо знайти другий патерн "число/число"
    const powerPattern = text.match(/(\d{2,3}\/\d{2,3})\s+(\d{2,3}\/\d{2,3})/);
    if (powerPattern && powerPattern[2]) {
      data.primePower = powerPattern[2].trim();
    }
  }

  // PHASE / ФАЗЫ / ФАЗИ: 3 (різні формати та мови)
  const phasePatterns = [
    /PHASE[:\s]+(\d+)/i,
    /ФАЗЫ[:\s]+(\d+)/i,
    /ФАЗИ[:\s]+(\d+)/i,
    /ФАЗ[:\s]+(\d+)/i
  ];
  
  let phaseMatch = null;
  for (const pattern of phasePatterns) {
    phaseMatch = text.match(pattern);
    if (phaseMatch) {
      data.phase = parseInt(phaseMatch[1]);
      break;
    }
  }
  
  if (!phaseMatch) {
    // Якщо OCR розпізнав неточно, шукаємо число 3 після напруги або перед RPM
    phaseMatch = text.match(/(?:^|\s|V|В|ВОЛЬТ)(3)(?:\s|$|RPM|Гц|HZ|ОБОРОТ)/i);
    if (phaseMatch) {
      data.phase = 3;
    } else {
      // Спробуємо знайти будь-яке число 1-3 після напруги
      const phaseAfterVoltage = text.match(/(?:400[\/\s]?230|380[\/\s]?220|230\s+400|400\s+230)(?:\s|°|°C)?\s*(\d{1})(?:\s|$|A|А|RPM)/i);
      if (phaseAfterVoltage) {
        const phaseValue = parseInt(phaseAfterVoltage[1]);
        if (phaseValue >= 1 && phaseValue <= 3) {
          data.phase = phaseValue;
        }
      }
    }
  }

  // V / В / ВОЛЬТ: 400/230 або 230 400 або просто 400 (різні формати та мови)
  const voltagePatterns = [
    /VOLTAGE\s*\(?V\)?[:\s]+([\d\/\s]+)/i,  // VOLTAGE (V): 400
    /V[:\s]+([\d\/\s]+)/i,
    /В[:\s]+([\d\/\s]+)/i,
    /ВОЛЬТ[:\s]+([\d\/\s]+)/i,
    /НАПРУГА[:\s]+([\d\/\s]+)/i,
    /НАПРЯЖЕНИЕ[:\s]+([\d\/\s]+)/i
  ];
  
  let voltageMatch = null;
  for (const pattern of voltagePatterns) {
    voltageMatch = text.match(pattern);
    if (voltageMatch) {
      // Нормалізуємо формат: "230 400" -> "400/230", "400/230" залишаємо як є, "400" -> "400"
      let voltage = voltageMatch[1].trim().replace(/\s+/g, ' ');
      const parts = voltage.split(/[\s\/]+/);
      if (parts.length === 2) {
        // Якщо два числа, перевіряємо порядок
        const v1 = parseInt(parts[0]);
        const v2 = parseInt(parts[1]);
        if (v1 < v2 && (v1 === 230 || v1 === 380) && (v2 === 400 || v2 === 230)) {
          // Якщо перше менше (230 400), переставляємо (400/230)
          voltage = `${v2}/${v1}`;
        } else {
          voltage = `${parts[0]}/${parts[1]}`;
        }
      } else if (parts.length === 1) {
        // Якщо одне число (наприклад, 400), залишаємо як є
        voltage = parts[0];
      }
      data.voltage = voltage;
      break;
    }
  }
  
  if (!voltageMatch) {
    // Шукаємо патерн "400/230" або "230 400" після потужностей
    voltageMatch = text.match(/(\d{3}[\/\s]\d{3})/);
    if (voltageMatch) {
      let voltage = voltageMatch[1].trim();
      const parts = voltage.split(/[\s\/]+/);
      if (parts.length === 2) {
        const v1 = parseInt(parts[0]);
        const v2 = parseInt(parts[1]);
        // Перевіряємо, чи це напруга (400, 380, 230)
        if ((v1 === 400 || v1 === 380 || v1 === 230) && (v2 === 400 || v2 === 230)) {
          if (v1 < v2 && (v1 === 230 || v1 === 380)) {
            voltage = `${v2}/${v1}`;
          } else {
            voltage = `${parts[0]}/${parts[1]}`;
          }
          data.voltage = voltage;
        }
      }
    }
  }

  // A / А / СТРУМ / ТОК / ESP CURRENT / PRP CURRENT: 72 (різні формати та мови)
  const amperagePatterns = [
    /A[:\s]+(\d+)/i,
    /А[:\s]+(\d+)/i,
    /СТРУМ[:\s]+(\d+)/i,
    /ТОК[:\s]+(\d+)/i,
    /AMPERAGE[:\s]+(\d+)/i,
    /(?:ESP|PRP)\s+CURRENT\s*\(?A\)?[:\s]+(\d+)/i  // ESP CURRENT (A): 72 або PRP CURRENT (A): 72
  ];
  
  let amperageMatch = null;
  for (const pattern of amperagePatterns) {
    amperageMatch = text.match(pattern);
    if (amperageMatch) {
      data.amperage = parseInt(amperageMatch[1]);
      break;
    }
  }
  
  // Якщо знайдено ESP CURRENT або PRP CURRENT, але не оброблено вище
  if (!amperageMatch) {
    const espCurrentMatch = text.match(/ESP\s+CURRENT\s*\(?A\)?[:\s]+(\d+)/i);
    if (espCurrentMatch) {
      data.amperage = parseInt(espCurrentMatch[1]);
    } else {
      const prpCurrentMatch = text.match(/PRP\s+CURRENT\s*\(?A\)?[:\s]+(\d+)/i);
      if (prpCurrentMatch) {
        data.amperage = parseInt(prpCurrentMatch[1]);
      }
    }
  }
  
  if (!amperageMatch && !data.amperage) {
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

  // COSφ / КОС φ / КОЭФФИЦИЕНТ / POWER FACTOR: 0.8 (різні формати та мови)
  const cosPhiPatterns = [
    /POWER\s+FACTOR[:\s]+([\d.,]+)/i,  // POWER FACTOR: 0.8
    /COS[φΦ]?[:\s]+([\d.,]+)/i,
    /КОС[φΦ]?[:\s]+([\d.,]+)/i,
    /КОЭФФИЦИЕНТ[:\s]+([\d.,]+)/i,
    /КОЕФІЦІЄНТ[:\s]+([\d.,]+)/i
  ];
  
  let cosPhiMatch = null;
  for (const pattern of cosPhiPatterns) {
    cosPhiMatch = text.match(pattern);
    if (cosPhiMatch) {
      data.cosPhi = parseFloat(cosPhiMatch[1].replace(',', '.'));
      break;
    }
  }
  
  if (!cosPhiMatch) {
    // Якщо OCR розпізнав неточно, шукаємо число 0.8 або 0,8
    cosPhiMatch = text.match(/(?:^|\s)(0[.,]\d{1,2})(?:\s|$)/);
    if (cosPhiMatch) {
      data.cosPhi = parseFloat(cosPhiMatch[1].replace(',', '.'));
    }
  }

  // RPM / ОБОРОТЫ / ОБОРОТИ / SPEED: 1500 (різні формати та мови)
  const rpmPatterns = [
    /SPEED\s*\(?RPM\)?[:\s]+(\d+)/i,  // SPEED (rpm): 1500
    /RPM[:\s]+(\d+)/i,
    /ОБОРОТЫ[:\s]+(\d+)/i,
    /ОБОРОТИ[:\s]+(\d+)/i,
    /ОБ[\.]?[:\s]+(\d+)/i
  ];
  
  let rpmMatch = null;
  for (const pattern of rpmPatterns) {
    rpmMatch = text.match(pattern);
    if (rpmMatch) {
      data.rpm = parseInt(rpmMatch[1]);
      break;
    }
  }
  
  if (!rpmMatch) {
    // Якщо OCR розпізнав неточно, шукаємо число 1500 або 3000 (типові значення RPM)
    rpmMatch = text.match(/(?:^|\s)(1500|3000)(?:\s|$)/);
    if (rpmMatch) {
      data.rpm = parseInt(rpmMatch[1]);
    }
  }

  // Hz / ГЦ / ЧАСТОТА: 50 (різні формати та мови)
  const freqPatterns = [
    /HZ[:\s]+(\d+)/i,
    /ГЦ[:\s]+(\d+)/i,
    /ЧАСТОТА[:\s]+(\d+)/i,
    /FREQUENCY[:\s]+(\d+)/i
  ];
  
  let freqMatch = null;
  for (const pattern of freqPatterns) {
    freqMatch = text.match(pattern);
    if (freqMatch) {
      data.frequency = parseInt(freqMatch[1]);
      break;
    }
  }
  
  if (!freqMatch) {
    // Якщо OCR розпізнав неточно, шукаємо число 50 або 60 (типові частоти)
    freqMatch = text.match(/(?:^|\s|°)(50|60)(?:\s|$|°)/);
    if (freqMatch) {
      data.frequency = parseInt(freqMatch[1]);
    }
  }

  // DIMENSION / РАЗМЕРЫ / РОЗМІРИ: 2280 x 950 x 1250 (різні формати та мови)
  const dimPatterns = [
    /DIMENSION[:\s]+([\d\sxX×]+)/i,
    /РАЗМЕРЫ[:\s]+([\d\sxX×]+)/i,
    /РОЗМІРИ[:\s]+([\d\sxX×]+)/i,
    /(?:LxWxH|SIZE)[:\s]+([\d\sxX×]+)/i,
    /РАЗМЕР[:\s]+([\d\sxX×]+)/i
  ];
  
  let dimMatch = null;
  for (const pattern of dimPatterns) {
    dimMatch = text.match(pattern);
    if (dimMatch) {
      data.dimensions = dimMatch[1].trim().replace(/\s+/g, ' ').replace(/[xX×]/g, ' x ');
      break;
    }
  }
  
  if (!dimMatch) {
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

  // WEIGHT / ВЕС / ВАГА: 940 (різні формати та мови, включаючи WEIGHT.kg)
  const weightPatterns = [
    /WEIGHT[\.]?(?:\.kg|кг)?[:\s]+(\d+)/i,
    /ВЕС[\.]?(?:\.кг|kg)?[:\s]+(\d+)/i,
    /ВАГА[\.]?(?:\.кг|kg)?[:\s]+(\d+)/i
  ];
  
  let weightMatch = null;
  for (const pattern of weightPatterns) {
    weightMatch = text.match(pattern);
    if (weightMatch) {
      data.weight = parseInt(weightMatch[1]);
      break;
    }
  }
  
  if (!weightMatch) {
    // Якщо OCR розпізнав неточно, шукаємо число після розмірів (вага зазвичай 100-10000)
    weightMatch = text.match(/(?:^|\s|кг|KG)(\d{3,4})(?:\s|$|кг|KG|202[0-9])/i);
    if (weightMatch) {
      const value = parseInt(weightMatch[1]);
      // Вага зазвичай в діапазоні 100-10000, і не є роком, RPM, частотою
      if (value >= 100 && value <= 10000 && value !== 2024 && value !== 2025 && value !== 1500 && value !== 50 && value !== 72 && value !== 40) {
        data.weight = value;
      }
    } else {
      // Спробуємо знайти число перед датою виробництва
      const weightBeforeDate = text.match(/(\d{3,4})\s+(?:202[0-9]|DATE|ДАТА)/i);
      if (weightBeforeDate) {
        const value = parseInt(weightBeforeDate[1]);
        if (value >= 100 && value <= 10000) {
          data.weight = value;
        }
      }
    }
  }

  // DATE / ДАТА: 2024 або 2023.09.15 (різні формати та мови)
  const datePatterns = [
    /DATE\s+OF\s+MANUFACTURE[:\s]+(\d{4}\.\d{2}\.\d{2})/i,  // DATE OF MANUFACTURE: 2023.09.15
    /DATE\s+OF\s+MANUFACTURE[:\s]+(\d{4})/i,  // DATE OF MANUFACTURE: 2023
    /DATE[:\s]+(\d{4}\.\d{2}\.\d{2})/i,  // DATE: 2023.09.15
    /DATE[:\s]+(\d{4})/i,  // DATE: 2024
    /ДАТА[:\s]+(\d{4})/i,
    /ГОД[:\s]+(\d{4})/i,
    /YEAR[:\s]+(\d{4})/i
  ];
  
  let dateMatch = null;
  for (const pattern of datePatterns) {
    dateMatch = text.match(pattern);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      // Якщо формат з днем та місяцем (2023.09.15)
      if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 3) {
          const year = parseInt(parts[0]);
          if (year >= 2000 && year <= 2099) {
            data.manufactureDate = dateStr; // Зберігаємо повну дату
            break;
          }
        }
      } else {
        // Просто рік
        const year = parseInt(dateStr);
        if (year >= 2000 && year <= 2099) {
          data.manufactureDate = dateStr;
          break;
        }
      }
    }
  }
  
  if (!dateMatch || !data.manufactureDate) {
    // Якщо OCR розпізнав неточно, шукаємо формат дати з днем та місяцем
    dateMatch = text.match(/(20\d{2}\.\d{2}\.\d{2})/);
    if (dateMatch) {
      data.manufactureDate = dateMatch[1];
    } else {
      // Шукаємо рік (2024, 2023, тощо)
      dateMatch = text.match(/(20\d{2})/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        if (year >= 2000 && year <= 2099) {
          data.manufactureDate = dateMatch[1];
        }
      }
    }
  }

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

