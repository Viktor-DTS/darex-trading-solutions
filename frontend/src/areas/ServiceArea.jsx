const filtered = tasks.filter(t =>
  (!filters.dateFrom || t.date >= filters.dateFrom) &&
  (!filters.dateTo || t.date <= filters.dateTo) &&
  (!filters.requestDateFrom || t.requestDate >= filters.requestDateFrom) &&
  (!filters.requestDateTo || t.requestDate <= filters.requestDateTo)
); 