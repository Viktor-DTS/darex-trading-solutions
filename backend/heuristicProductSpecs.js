/**
 * Евристичний розбір технічних ознак з вільного тексту (назва, артикул, опис).
 * Універсальний у сенсі «типові шаблони з каталогів», без гарантії — завжди перевіряти за паспортом.
 */

const FASTENER_RE =
  /дюбел|анкер|dowel|wall\s*plug|болт|bolt|гвинт|винт|screw|шуруп|заклепк|саморіз|заклеп|шпильк|гайк|nut|шайб|washer|кріплен/i;
const PIPE_RE = /труб|pipe|rør|шланг|hose|фітинг|fitting|муфт/i;
const ELECTRIC_RE =
  /генератор|двигун|електро|motor|pump|насос|інвертор|inverter|трансформат|transformer|кабел|cable|автомат|breaker|пускач|контактор/i;

function dedupeSpecs(specs) {
  const seen = new Set();
  const out = [];
  for (const s of specs) {
    if (!s || !s.name || s.value == null) continue;
    const key = `${String(s.name).toLowerCase()}|${String(s.value).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseNum(s) {
  return parseFloat(String(s).replace(',', '.'));
}

/**
 * @param {string} raw
 * @returns {Array<{ id: string, name: string, value: string }>}
 */
function extractHeuristicSpecs(raw) {
  const text = String(raw || '').trim();
  if (text.length < 2) return [];

  const lower = text.toLowerCase();
  let seq = 0;
  const nextId = (tag) => `heur-${tag}-${++seq}`;

  const specs = [];

  // —— Електроживлення / потужність ——
  const kwM = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kW|кВт|kw)\b/i);
  if (kwM) {
    specs.push({
      id: nextId('kw'),
      name: 'Потужність (з назви), кВт',
      value: String(parseNum(kwM[1])).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'),
    });
  }
  const kvaM = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kVA|кВА|kva|ква)\b/i);
  if (kvaM) {
    specs.push({
      id: nextId('kva'),
      name: 'Потужність (з назви), кВА',
      value: String(parseNum(kvaM[1])).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'),
    });
  }
  const volt = text.match(/\b(\d{2,3})\s*(?:V|В)(?:\b|[\s,])/gi);
  if (volt && ELECTRIC_RE.test(lower)) {
    const m = text.match(/\b(\d{2,3})\s*(?:V|В)(?:\b|[\s,])/i);
    if (m) {
      specs.push({
        id: nextId('volt'),
        name: 'Напруга (з назви), В',
        value: m[1],
      });
    }
  } else {
    const m380 = /\b(380|400|220|230|24|12)\b/.exec(text);
    if (m380 && ELECTRIC_RE.test(lower)) {
      specs.push({
        id: nextId('volt'),
        name: 'Напруга (з назви, типова позначка), В',
        value: m380[1],
      });
    }
  }

  const hz = text.match(/\b(\d{1,2})\s*(?:Hz|Гц|гц|hz)\b/i);
  if (hz) {
    specs.push({
      id: nextId('hz'),
      name: 'Частота (з назви), Гц',
      value: hz[1],
    });
  }

  const ip = text.match(/\bIP\s*(\d{2})\b/i);
  if (ip) {
    specs.push({
      id: nextId('ip'),
      name: 'Ступінь захисту (з назви)',
      value: `IP${ip[1]}`,
    });
  }

  // —— Різьба, діаметр позначенням ——
  const metricThread = text.match(/\bM(\d{1,3}(?:[.,]\d+)?(?:\s*[x×хХ]\s*\d+(?:[.,]\d+)?)?)\b/i);
  if (metricThread) {
    specs.push({
      id: nextId('thread'),
      name: 'Метрична різьба / позначення (з назви)',
      value: `M${metricThread[1].replace(/\s+/g, '')}`,
    });
  }

  const dia = text.match(/[⌀Øø]\s*(\d+(?:[.,]\d+)?)\s*(?:мм|mm)?/i);
  if (dia) {
    specs.push({
      id: nextId('dia'),
      name: 'Діаметр (з назви), мм',
      value: String(parseNum(dia[1])),
    });
  }

  // —— DN / дюйми (труби) ——
  const dn = text.match(/\bDN\s*(\d+)\b/i);
  if (dn && PIPE_RE.test(lower)) {
    specs.push({
      id: nextId('dn'),
      name: 'Умовний прохід DN (з назви)',
      value: dn[1],
    });
  }

  // —— Тиск ——
  const bar = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:bar|бар)\b/i);
  if (bar) {
    specs.push({
      id: nextId('bar'),
      name: 'Тиск (з назви), бар',
      value: String(parseNum(bar[1])),
    });
  }
  const mpa = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:MPa|МПа|mpa)\b/i);
  if (mpa) {
    specs.push({
      id: nextId('mpa'),
      name: 'Тиск (з назви), МПа',
      value: String(parseNum(mpa[1])),
    });
  }

  // —— Витрата ——
  const flow = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:l\/min|л\/хв|л\/мін|l\s*min)\b/i);
  if (flow) {
    specs.push({
      id: nextId('flow'),
      name: 'Витрата (з назви)',
      value: `${parseNum(flow[1])} л/хв`,
    });
  }

  // —— Оберти ——
  const rpm = text.match(/\b(\d{3,6})\s*(?:rpm|об\/хв|об\.?\s*хв|min-1)\b/i);
  if (rpm) {
    specs.push({
      id: nextId('rpm'),
      name: 'Оберти (з назви), об/хв',
      value: rpm[1],
    });
  }

  // —— Маса ——
  const kg = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|кг)\b/i);
  if (kg) {
    specs.push({
      id: nextId('kg'),
      name: 'Маса (з назви), кг',
      value: String(parseNum(kg[1])),
    });
  }

  // —— Габарити L×W×H або L×W ——
  const dim3 = text.match(
    /\b(\d+(?:[.,]\d+)?)\s*[x×*хХ]\s*(\d+(?:[.,]\d+)?)\s*[x×*хХ]\s*(\d+(?:[.,]\d+)?)\s*(мм|mm|см|cm|m|м)?\b/i,
  );
  if (dim3) {
    const u = dim3[4] ? dim3[4].toLowerCase() : 'мм';
    const unit = u === 'm' || u === 'м' ? 'м' : u === 'cm' || u === 'см' ? 'см' : 'мм';
    specs.push({
      id: nextId('lwh'),
      name: `Габарити Д×Ш×В (з назви), ${unit}`,
      value: `${parseNum(dim3[1])} × ${parseNum(dim3[2])} × ${parseNum(dim3[3])}`,
    });
  }

  // —— Плоскі габарити Д×Ш (лист, плитка тощо), якщо немає трьох чисел ——
  if (!dim3) {
    const dim2 = text.match(
      /\b(\d{2,5}(?:[.,]\d+)?)\s*[x×*хХ]\s*(\d{2,5}(?:[.,]\d+)?)\s*(мм|mm|см|cm|m|м)?\b/i,
    );
    if (dim2) {
      const n1 = parseNum(dim2[1]);
      const n2 = parseNum(dim2[2]);
      const isSmallFastenerPair =
        FASTENER_RE.test(lower) && Math.min(n1, n2) <= 50 && Math.max(n1, n2) <= 500 && Math.max(n1, n2) >= Math.min(n1, n2) * 3;
      if (!isSmallFastenerPair) {
        const u = dim2[3] ? dim2[3].toLowerCase() : 'мм';
        const unit = u === 'm' || u === 'м' ? 'м' : u === 'cm' || u === 'см' ? 'см' : 'мм';
        specs.push({
          id: nextId('lw'),
          name: `Габарити Д×Ш (з назви), ${unit}`,
          value: `${n1} × ${n2}`,
        });
      }
    }
  }

  // —— Пара чисел: кріплення (діаметр × довжина в мм) ——
  let fastenerPairDone = false;
  const pairRe = /\b(\d{1,4})\s*[-–/x×*хХ]\s*(\d{1,4})\b/g;
  let pm;
  while ((pm = pairRe.exec(text)) !== null) {
    const a = parseInt(pm[1], 10);
    const b = parseInt(pm[2], 10);
    if (a < 2 || b < 2 || a > 2000 || b > 2000) continue;

    const isFastener = FASTENER_RE.test(lower);
    if (!isFastener) continue;

    let dMm;
    let lMm;
    const sep = /[x×*хХ]/.test(pm[0]);
    if (sep) {
      const small = Math.min(a, b);
      const big = Math.max(a, b);
      if (big >= small * 3 && small <= 50 && big <= 500) {
        dMm = small;
        lMm = big;
      }
    } else {
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      if (hi >= lo * 3 && lo <= 50 && hi <= 800) {
        lMm = hi;
        dMm = lo;
      } else if (lo >= hi * 3 && hi <= 50 && lo <= 800) {
        lMm = lo;
        dMm = hi;
      }
    }

    if (dMm != null && lMm != null) {
      specs.push(
        {
          id: nextId('fd'),
          name: 'Діаметр (евристика з назви), мм',
          value: String(dMm),
        },
        {
          id: nextId('fl'),
          name: 'Довжина (евристика з назви), мм',
          value: String(lMm),
        },
      );
      fastenerPairDone = true;
      break;
    }
  }

  // —— Загальна пара через дефіс без інтерпретації (якщо кріплення не розпізнали) ——
  if (!fastenerPairDone) {
    const simple = text.match(/\b(\d{1,4})\s*[-–]\s*(\d{1,4})\b/);
    if (simple) {
      const a = parseInt(simple[1], 10);
      const b = parseInt(simple[2], 10);
      if (a >= 2 && b >= 2 && a <= 2000 && b <= 2000) {
        specs.push({
          id: nextId('pair'),
          name: 'Числові параметри з назви (уточніть призначення)',
          value: `${a} — ${b} (можливо розміри в мм або код; перевірте за каталогом)`,
        });
      }
    }
  }

  return dedupeSpecs(specs);
}

module.exports = {
  extractHeuristicSpecs,
};
