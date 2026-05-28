/**
 * Маскування конфіденційних даних перед відправкою в GPT.
 * ЄДРПОУ — не маскується. Закрито: фінанси, складські кількості, дані користувачів DTS (login, ПІБ).
 */
const FAKE_PERSON_NAMES = [
  'Іванов Іван Іванович',
  'Петренко Олена Сергіївна',
  'Коваленко Андрій Петрович',
  'Шевченко Марія Василівна',
  'Бондаренко Сергій Олегович',
];

function hashStable(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicFakeAmount(raw) {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    const h = hashStable(raw);
    return ((h % 90000) + 1000) / 100;
  }
  const h = hashStable(cleaned);
  const fake = Math.round(((n * 0.61 + (h % 500)) % 500000) * 100) / 100;
  return fake > 0 ? fake : 1000 + (h % 5000);
}

function deterministicFakeQty(raw) {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '').replace(',', '.');
  const n = parseInt(cleaned, 10);
  if (Number.isFinite(n) && n > 0) {
    const h = hashStable(String(n));
    return Math.max(1, (n + (h % 17)) % 500);
  }
  return (hashStable(raw) % 120) + 1;
}

function pickFakePersonName(real) {
  const idx = hashStable(String(real || '')) % FAKE_PERSON_NAMES.length;
  return FAKE_PERSON_NAMES[idx];
}

class PrivacyMaskSession {
  constructor() {
    /** @type {Map<string, string>} placeholder -> original */
    this.replacements = new Map();
    /** @type {Map<string, string>} kind\0real -> placeholder */
    this.realToPlaceholder = new Map();
  }

  /**
   * @param {'user_login'|'user_name'|'staff_name'|'fin'|'qty'} kind
   * @param {string} real
   */
  placeholder(kind, real) {
    const original = String(real || '').trim();
    if (!original || original === '—') return original;
    const key = `${kind}\0${original}`;
    if (this.realToPlaceholder.has(key)) {
      return this.realToPlaceholder.get(key);
    }

    let ph;
    if (kind === 'user_login') {
      const id = this.realToPlaceholder.size + 1;
      ph = `user_${String(id).padStart(3, '0')}`;
    } else if (kind === 'user_name' || kind === 'staff_name') {
      ph = pickFakePersonName(original);
    } else if (kind === 'fin') {
      ph = `${deterministicFakeAmount(original).toFixed(2)} грн`;
    } else if (kind === 'qty') {
      ph = String(deterministicFakeQty(original));
    } else {
      ph = `[${kind}_${this.realToPlaceholder.size + 1}]`;
    }

    this.realToPlaceholder.set(key, ph);
    this.replacements.set(ph, original);
    return ph;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  mask(text) {
    let out = String(text || '');

    out = out.replace(/\bpassword\s*[:=]\s*\S+/gi, (m) => m.replace(/(\S+)$/, '[REDACTED_PASSWORD]'));
    out = out.replace(/\bпарол\w*\s*[:=]\s*\S+/giu, (m) => m.replace(/(\S+)$/, '[REDACTED_PASSWORD]'));

    out = out.replace(/•\s*login:\s*(\S+)/gi, (_, login) => `• login: ${this.placeholder('user_login', login)}`);
    out = out.replace(
      /•\s*ПІБ у БД:\s*(.+)/gi,
      (_, name) => {
        const n = String(name || '').trim();
        if (!n || n === '—') return '• ПІБ у БД: —';
        return `• ПІБ у БД: ${this.placeholder('user_name', n)}`;
      },
    );
    out = out.replace(
      /Передано з клієнта: роль «[^»]*», ім['']я «([^»]+)»/giu,
      (full, name) => full.replace(name, this.placeholder('user_name', name.trim())),
    );

    out = out.replace(/Сума робіт \(ориєнтовно\):\s*([^\s·\n]+)/giu, (_, amt) =>
      `Сума робіт (ориєнтовно): ${this.placeholder('fin', amt)}`,
    );
    out = out.replace(/Заборгованість \(статус\):\s*([^\s·\n]+)/giu, (_, v) =>
      `Заборгованість (статус): ${this.placeholder('fin', v)}`,
    );

    out = out.replace(
      /(\d[\d\s,.]{0,14})\s*(грн\.?|uah|UAH|USD|usd|\$|€)/giu,
      (match, num, cur) => `${this.placeholder('fin', num)} ${cur}`,
    );

    out = out.replace(
      /(кількість|залишок|qty|quantity|на\s+склад\w*|залиш\w*)\s*[:=]?\s*(\d[\d\s,.]*)/giu,
      (_, label, num) => `${label}: ${this.placeholder('qty', num.trim())}`,
    );
    out = out.replace(
      /(filterCount|oilFilterCount|fuelFilterCount|airFilterCount|antifreezeL)\s*[:=]?\s*(\d[\d\s,.]*)/gi,
      (_, field, num) => `${field}: ${this.placeholder('qty', num.trim())}`,
    );

    out = out.replace(/Інженери:\s*([^\n]+)/giu, (_, names) => {
      const parts = String(names)
        .split('·')
        .map((p) => {
          const t = p.trim();
          if (!t) return t;
          return this.placeholder('staff_name', t);
        });
      return `Інженери: ${parts.join(' · ')}`;
    });

    out = out.replace(/Контактна особа:\s*([^\n]+)/giu, (_, n) =>
      `Контактна особа: ${this.placeholder('user_name', n.trim())}`,
    );

    out = out.replace(/contacts\.person|contactPerson|assignedManagerLogin/gi, (m) => m);

    return out;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  unmask(text) {
    let out = String(text || '');
    const entries = [...this.replacements.entries()].sort((a, b) => b[0].length - a[0].length);
    for (const [ph, real] of entries) {
      if (ph && out.includes(ph)) {
        out = out.split(ph).join(real);
      }
    }
    return out;
  }

  /** @returns {{ replacements: number }} */
  stats() {
    return { replacements: this.replacements.size };
  }
}

function createPrivacyMaskSession() {
  return new PrivacyMaskSession();
}

/** Коротка примітка для LLM про плейсхолдери. */
function privacyNoteForLlmUk() {
  return (
    '[DTS-privacy] Частина числових сум, складських кількостей і ПІБ/логінів користувачів DTS у контексті замінена на умовні значення для зовнішньої моделі. ' +
    'ЄДРПОУ передається без приховування. У відповіді користувачу DTS орієнтуйся на зміст, не цитуй технічні плейсхолдери; реальні цифри в системі — у таблицях DTS.'
  );
}

module.exports = {
  PrivacyMaskSession,
  createPrivacyMaskSession,
  privacyNoteForLlmUk,
  hashStable,
};
