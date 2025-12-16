// Парсер для розпізнавання даних з шильдика DAREX ENERGY

export const parseEquipmentData = (ocrText) => {
  const data = {
    manufacturer: 'DAREX ENERGY',
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

  // TYPE: DE-50BDS
  const typeMatch = text.match(/TYPE[:\s]+([A-Z0-9\-]+)/i);
  if (typeMatch) data.type = typeMatch[1].trim();

  // №: 20241007015
  const serialMatch = text.match(/[№#N][:\s]+(\d+)/i);
  if (serialMatch) data.serialNumber = serialMatch[1].trim();

  // STANDBY POWER: 50/40 KVA/KW
  const standbyMatch = text.match(/STANDBY\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW)?)/i);
  if (standbyMatch) data.standbyPower = standbyMatch[1].trim();

  // PRIME POWER: 45/36 KVA/KW
  const primeMatch = text.match(/PRIME\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW)?)/i);
  if (primeMatch) data.primePower = primeMatch[1].trim();

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

  // DIMENSION: 2280 x 950 x 1250
  const dimMatch = text.match(/DIMENSION[:\s]+([\d\sxX]+)/i);
  if (dimMatch) data.dimensions = dimMatch[1].trim();

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

