/**
 * Збагачення списку клієнтів: остання взаємодія, follow-up, відкриті угоди.
 */

const ACTIVE_SALE_STATUSES = [
  'draft',
  'primary_contact',
  'quote_sent',
  'in_negotiation',
  'in_progress',
  'in_realization',
  'pnr',
];

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toObjectIds(ids, mongoose) {
  return ids
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(String(id));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * @returns {Promise<Map<string, { lastInteractionAt, nextFollowUpAt, openDealsCount }>>}
 */
async function enrichClientsActivity(clientDocs, { Interaction, Sale, mongoose }) {
  const map = new Map();
  if (!clientDocs?.length) return map;

  const ids = clientDocs.map((c) => c._id);
  const oidList = toObjectIds(ids, mongoose);

  const [lastRows, followRows, dealRows] = await Promise.all([
    Interaction.aggregate([
      { $match: { entityType: 'client', entityId: { $in: oidList } } },
      { $group: { _id: '$entityId', lastInteractionAt: { $max: '$date' } } },
    ]),
    Interaction.aggregate([
      {
        $match: {
          entityType: 'client',
          entityId: { $in: oidList },
          nextFollowUpAt: { $ne: null },
        },
      },
      { $group: { _id: '$entityId', nextFollowUpAt: { $min: '$nextFollowUpAt' } } },
    ]),
    Sale.aggregate([
      {
        $match: {
          clientId: { $in: oidList },
          status: { $in: ACTIVE_SALE_STATUSES },
        },
      },
      { $group: { _id: '$clientId', openDealsCount: { $sum: 1 } } },
    ]),
  ]);

  lastRows.forEach((row) => {
    const key = String(row._id);
    map.set(key, {
      lastInteractionAt: row.lastInteractionAt || null,
      nextFollowUpAt: null,
      openDealsCount: 0,
    });
  });
  followRows.forEach((row) => {
    const key = String(row._id);
    const prev = map.get(key) || {
      lastInteractionAt: null,
      nextFollowUpAt: null,
      openDealsCount: 0,
    };
    prev.nextFollowUpAt = row.nextFollowUpAt || null;
    map.set(key, prev);
  });
  dealRows.forEach((row) => {
    const key = String(row._id);
    const prev = map.get(key) || {
      lastInteractionAt: null,
      nextFollowUpAt: null,
      openDealsCount: 0,
    };
    prev.openDealsCount = row.openDealsCount || 0;
    map.set(key, prev);
  });

  return map;
}

function applyActivityToClients(clients, activityMap) {
  return (clients || []).map((c) => {
    const a = activityMap.get(String(c._id)) || {};
    return {
      ...c,
      lastInteractionAt: a.lastInteractionAt || null,
      nextFollowUpAt: a.nextFollowUpAt || null,
      openDealsCount: a.openDealsCount || 0,
    };
  });
}

/** Client IDs that match followUp queue filter. */
async function findClientIdsByFollowUp(followUp, { Interaction }) {
  const mode = String(followUp || '').trim().toLowerCase();
  if (!mode || mode === 'all') return null;

  const start = startOfLocalDay();
  const end = endOfLocalDay();
  const staleSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  if (mode === 'overdue') {
    return {
      mode,
      ids: await Interaction.distinct('entityId', {
        entityType: 'client',
        nextFollowUpAt: { $lt: start, $ne: null },
      }),
    };
  }
  if (mode === 'today') {
    return {
      mode,
      ids: await Interaction.distinct('entityId', {
        entityType: 'client',
        nextFollowUpAt: { $gte: start, $lte: end },
      }),
    };
  }
  if (mode === 'upcoming') {
    return {
      mode,
      ids: await Interaction.distinct('entityId', {
        entityType: 'client',
        nextFollowUpAt: { $gt: end },
      }),
    };
  }
  if (mode === 'stale') {
    const recent = await Interaction.distinct('entityId', {
      entityType: 'client',
      date: { $gte: staleSince },
    });
    return { mode: 'stale', excludeIds: recent };
  }
  return null;
}

async function computeClientListStats(baseQuery, { Client, Interaction, Sale, mongoose }) {
  const start = startOfLocalDay();
  const end = endOfLocalDay();
  const staleSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const total = await Client.countDocuments(baseQuery);
  const clientIds = await Client.find(baseQuery).select('_id').lean();
  const ids = clientIds.map((c) => c._id);
  if (!ids.length) {
    return {
      total: 0,
      overdueFollowUp: 0,
      todayFollowUp: 0,
      openDealsClients: 0,
      staleNoContact: 0,
      newThisWeek: 0,
    };
  }

  const oidList = toObjectIds(ids, mongoose);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [overdue, today, withOpenDeals, recentContact, newThisWeek] = await Promise.all([
    Interaction.distinct('entityId', {
      entityType: 'client',
      entityId: { $in: oidList },
      nextFollowUpAt: { $lt: start, $ne: null },
    }),
    Interaction.distinct('entityId', {
      entityType: 'client',
      entityId: { $in: oidList },
      nextFollowUpAt: { $gte: start, $lte: end },
    }),
    Sale.distinct('clientId', {
      clientId: { $in: oidList },
      status: { $in: ACTIVE_SALE_STATUSES },
    }),
    Interaction.distinct('entityId', {
      entityType: 'client',
      entityId: { $in: oidList },
      date: { $gte: staleSince },
    }),
    Client.countDocuments({ ...baseQuery, createdAt: { $gte: weekAgo } }),
  ]);

  const recentSet = new Set(recentContact.map(String));
  const staleNoContact = ids.filter((id) => !recentSet.has(String(id))).length;

  return {
    total,
    overdueFollowUp: overdue.length,
    todayFollowUp: today.length,
    openDealsClients: withOpenDeals.length,
    staleNoContact,
    newThisWeek,
  };
}

module.exports = {
  ACTIVE_SALE_STATUSES,
  enrichClientsActivity,
  applyActivityToClients,
  findClientIdsByFollowUp,
  computeClientListStats,
  startOfLocalDay,
  endOfLocalDay,
};
