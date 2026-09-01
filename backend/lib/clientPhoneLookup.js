/**
 * Пошук клієнта менеджерської бази за номером телефону з нормалізацією форматів.
 */

const { normalizePhone } = require('./marketingLeads');

/** Останні 9 цифр UA-мобільного (без 380/0). */
function phoneMatchKey(value) {
  const digits = normalizePhone(value);
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('380')) return digits.slice(-9);
  if (digits.length === 10 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 9) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

/** Regex: +38 (097) 145-77-73, 380971457773, 0971457773 тощо. */
function phoneSearchRegex(last9) {
  if (!last9 || last9.length < 9) return null;
  const body = last9.split('').map((d) => `${d}\\D*`).join('');
  return new RegExp(`(?:\\+?3?8?\\D*)?0?\\D*${body}`, 'i');
}

function collectClientPhones(client) {
  const out = [];
  if (client?.contactPhone) out.push(client.contactPhone);
  for (const c of client?.contacts || []) {
    if (c?.phone) out.push(c.phone);
  }
  return out;
}

function phonesEquivalent(a, b) {
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
  return ka && kb && ka === kb;
}

async function findClientByPhone(Client, phone) {
  const last9 = phoneMatchKey(phone);
  if (!last9) return null;
  const re = phoneSearchRegex(last9);
  if (!re) return null;

  const candidates = await Client.find({
    $or: [{ contactPhone: re }, { 'contacts.phone': re }],
  })
    .select('name contactPhone contacts assignedManagerLogin assignedManagerLogin2 edrpou email address region notes')
    .limit(20)
    .lean();

  return candidates.find((c) => collectClientPhones(c).some((p) => phonesEquivalent(p, phone))) || null;
}

function isClientOwnedByManager(client, managerLogin) {
  if (!client || !managerLogin) return false;
  return client.assignedManagerLogin === managerLogin || client.assignedManagerLogin2 === managerLogin;
}

async function findClientByPhoneForManager(Client, phone, managerLogin) {
  const client = await findClientByPhone(Client, phone);
  if (!client || !isClientOwnedByManager(client, managerLogin)) return null;
  return client;
}

async function resolveManagerDisplayName(User, login) {
  if (!login) return null;
  const user = await User.findOne({ login }).select('name login').lean();
  return user?.name || login;
}

async function findClientOwnerByPhone(Client, User, phone) {
  const client = await findClientByPhone(Client, phone);
  if (!client) return { clientOwnerName: null, clientOwnerLogin: null, clientName: null };

  const login = client.assignedManagerLogin || client.assignedManagerLogin2 || null;
  const clientOwnerName = login ? await resolveManagerDisplayName(User, login) : null;
  return {
    clientOwnerName,
    clientOwnerLogin: login,
    clientName: client.name || null,
  };
}

async function enrichLeadsWithClientOwners(leads, Client, User) {
  if (!Array.isArray(leads) || leads.length === 0) return leads;

  const ownerCache = new Map();
  const managerCache = new Map();

  const getOwner = async (phone) => {
    const key = phoneMatchKey(phone);
    if (!key) return null;
    if (ownerCache.has(key)) return ownerCache.get(key);

    const client = await findClientByPhone(Client, phone);
    if (!client) {
      ownerCache.set(key, null);
      return null;
    }

    const login = client.assignedManagerLogin || client.assignedManagerLogin2 || null;
    let name = null;
    if (login) {
      if (managerCache.has(login)) {
        name = managerCache.get(login);
      } else {
        name = await resolveManagerDisplayName(User, login);
        managerCache.set(login, name);
      }
    }

    const info = { clientOwnerName: name, clientOwnerLogin: login, clientName: client.name || null };
    ownerCache.set(key, info);
    return info;
  };

  await Promise.all(
    leads.map(async (lead) => {
      const info = await getOwner(lead.contactPhone);
      if (info) {
        lead.clientOwnerName = info.clientOwnerName;
        lead.clientOwnerLogin = info.clientOwnerLogin;
        lead.clientOwnerClientName = info.clientName;
      } else {
        lead.clientOwnerName = null;
        lead.clientOwnerLogin = null;
        lead.clientOwnerClientName = null;
      }
    })
  );

  return leads;
}

module.exports = {
  phoneMatchKey,
  phoneSearchRegex,
  phonesEquivalent,
  findClientByPhone,
  findClientByPhoneForManager,
  isClientOwnedByManager,
  findClientOwnerByPhone,
  enrichLeadsWithClientOwners,
};
