/// Парсер тексту з шильдика обладнання (DAREX ENERGY та інші формати).
/// Відповідає логіці веб ocrParser.js.
Map<String, dynamic> parseEquipmentData(String ocrText) {
  final data = <String, dynamic>{
    'manufacturer': '',
    'type': '',
    'serialNumber': '',
    'standbyPower': '',
    'primePower': '',
    'phase': null,
    'voltage': '',
    'amperage': null,
    'rpm': null,
    'dimensions': '',
    'weight': null,
    'manufactureDate': '',
  };

  final text = ocrText.toUpperCase();

  // Виробник
  if (text.contains('DAREX ENERGY')) {
    data['manufacturer'] = 'DAREX ENERGY';
  } else if (text.contains('DAREX')) {
    data['manufacturer'] = 'DAREX ENERGY';
  } else if (text.contains('BAUDOUIN') || text.contains('BAUDO')) {
    data['manufacturer'] = 'BAUDOUIN';
  } else if (text.contains('CUMMINS')) {
    data['manufacturer'] = 'CUMMINS';
  } else if (text.contains('PERKINS')) {
    data['manufacturer'] = 'PERKINS';
  }

  // TYPE: DE-50BDS, GENSET MODEL, тощо
  RegExpMatch? typeMatch = RegExp(r'TYPE[:\s]+([A-Z0-9\-\s]+)', caseSensitive: false).firstMatch(text);
  if (typeMatch != null) {
    data['type'] = typeMatch.group(1)!.trim().replaceAll(RegExp(r'\s+'), '-');
  } else {
    typeMatch = RegExp(r'GENSET\s+MODEL[:\s]+([A-Z0-9\-\s]+)', caseSensitive: false).firstMatch(text);
    if (typeMatch != null) {
      data['type'] = typeMatch.group(1)!.trim().replaceAll(RegExp(r'\s+'), '-');
    } else {
      typeMatch = RegExp(r'([A-Z]{2,3}[-]\d+[A-Z]*)').firstMatch(text);
      if (typeMatch != null) {
        data['type'] = typeMatch.group(1)!.trim();
      } else {
        typeMatch = RegExp(r'([A-Z]{2,3})\s+(\d+)\s+([A-Z]+)').firstMatch(text);
        if (typeMatch != null) {
          data['type'] = '${typeMatch.group(1)}-${typeMatch.group(2)}${typeMatch.group(3)}';
        }
      }
    }
  }

  // Серійний номер: №, SERIAL, S/N, 7+ цифр
  RegExpMatch? serialMatch = RegExp(
    r'(?:[№#N]|N[º°]|SERIAL|S\/N|SN|СЕРИЙНЫЙ|СЕРІЙНИЙ|ЗАВ[\.]?[№N]?)[:\s]+(\d{7,})',
    caseSensitive: false,
  ).firstMatch(text);
  if (serialMatch != null) {
    data['serialNumber'] = serialMatch.group(1)!.trim();
  } else {
    serialMatch = RegExp(r'GENSET\s+SERIAL\s+NUMBER[:\s]+(\d{7,})', caseSensitive: false).firstMatch(text);
    if (serialMatch != null) {
      data['serialNumber'] = serialMatch.group(1)!.trim();
    } else {
      serialMatch = RegExp(r'(\d{7,})').firstMatch(text);
      if (serialMatch != null) {
        data['serialNumber'] = serialMatch.group(1)!.trim();
      }
    }
  }

  // STANDBY POWER
  RegExpMatch? standbyMatch = RegExp(r'STANDBY\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)', caseSensitive: false).firstMatch(text);
  if (standbyMatch != null) {
    data['standbyPower'] = standbyMatch.group(1)!.trim().replaceAll(RegExp(r'\s+'), ' ');
  } else {
    standbyMatch = RegExp(r'(\d{2,3}\/\d{2,3})').firstMatch(text);
    if (standbyMatch != null) {
      data['standbyPower'] = standbyMatch.group(1)!.trim();
    }
  }

  // PRIME POWER
  RegExpMatch? primeMatch = RegExp(r'PRIME\s+POWER[:\s]+([\d\/\s]+(?:KVA|KW|kW)?)', caseSensitive: false).firstMatch(text);
  if (primeMatch != null) {
    data['primePower'] = primeMatch.group(1)!.trim().replaceAll(RegExp(r'\s+'), ' ');
  } else {
    final powerPattern = RegExp(r'(\d{2,3}\/\d{2,3})\s+(\d{2,3}\/\d{2,3})').firstMatch(text);
    if (powerPattern != null) {
      data['primePower'] = powerPattern.group(2)!.trim();
    }
  }

  // PHASE
  RegExpMatch? phaseMatch = RegExp(r'PHASE[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
  if (phaseMatch != null) {
    data['phase'] = int.tryParse(phaseMatch.group(1)!);
  } else {
    phaseMatch = RegExp(r'ФАЗ[ИЫ]?[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
    if (phaseMatch != null) {
      data['phase'] = int.tryParse(phaseMatch.group(1)!);
    }
  }

  // VOLTAGE
  RegExpMatch? voltageMatch = RegExp(r'VOLTAGE\s*\(?V\)?[:\s]+([\d\/\s]+)', caseSensitive: false).firstMatch(text);
  if (voltageMatch != null) {
    data['voltage'] = voltageMatch.group(1)!.trim().replaceAll(RegExp(r'\s+'), ' ');
  } else {
    voltageMatch = RegExp(r'V[:\s]+([\d\/\s]+)', caseSensitive: false).firstMatch(text);
    if (voltageMatch != null) {
      data['voltage'] = voltageMatch.group(1)!.trim();
    } else {
      voltageMatch = RegExp(r'(\d{3}[\/\s]\d{3})').firstMatch(text);
      if (voltageMatch != null) {
        data['voltage'] = voltageMatch.group(1)!.trim();
      }
    }
  }

  // AMPERAGE
  RegExpMatch? amperageMatch = RegExp(r'(?:ESP|PRP)\s+CURRENT\s*\(?A\)?[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
  if (amperageMatch != null) {
    data['amperage'] = int.tryParse(amperageMatch.group(1)!);
  } else {
    amperageMatch = RegExp(r'A[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
    if (amperageMatch != null) {
      data['amperage'] = int.tryParse(amperageMatch.group(1)!);
    }
  }

  // RPM
  RegExpMatch? rpmMatch = RegExp(r'SPEED\s*\(?RPM\)?[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
  if (rpmMatch != null) {
    data['rpm'] = int.tryParse(rpmMatch.group(1)!);
  } else {
    rpmMatch = RegExp(r'RPM[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
    if (rpmMatch != null) {
      data['rpm'] = int.tryParse(rpmMatch.group(1)!);
    } else {
      rpmMatch = RegExp(r'(1500|3000)').firstMatch(text);
      if (rpmMatch != null) {
        data['rpm'] = int.tryParse(rpmMatch.group(1)!);
      }
    }
  }

  // DIMENSIONS
  RegExpMatch? dimMatch = RegExp(r'DIMENSION[:\s]+([\d\sxX×]+)', caseSensitive: false).firstMatch(text);
  if (dimMatch != null) {
    data['dimensions'] = dimMatch.group(1)!.trim().replaceAll(RegExp(r'\s+'), ' ').replaceAll(RegExp(r'[xX×]'), ' x ');
  }

  // WEIGHT
  RegExpMatch? weightMatch = RegExp(r'WEIGHT[\.]?(?:\.kg|кг)?[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
  if (weightMatch != null) {
    data['weight'] = int.tryParse(weightMatch.group(1)!);
  } else {
    weightMatch = RegExp(r'ВАГА[\.]?(?:\.кг|kg)?[:\s]+(\d+)', caseSensitive: false).firstMatch(text);
    if (weightMatch != null) {
      data['weight'] = int.tryParse(weightMatch.group(1)!);
    }
  }

  // MANUFACTURE DATE
  RegExpMatch? dateMatch = RegExp(r'DATE\s+OF\s+MANUFACTURE[:\s]+(\d{4}(?:\.\d{2}\.\d{2})?)', caseSensitive: false).firstMatch(text);
  if (dateMatch != null) {
    data['manufactureDate'] = dateMatch.group(1)!.trim();
  } else {
    dateMatch = RegExp(r'DATE[:\s]+(\d{4})', caseSensitive: false).firstMatch(text);
    if (dateMatch != null) {
      data['manufactureDate'] = dateMatch.group(1)!.trim();
    } else {
      dateMatch = RegExp(r'(20\d{2})').firstMatch(text);
      if (dateMatch != null) {
        final year = int.tryParse(dateMatch.group(1)!);
        if (year != null && year >= 2000 && year <= 2099) {
          data['manufactureDate'] = dateMatch.group(1)!.trim();
        }
      }
    }
  }

  return data;
}
