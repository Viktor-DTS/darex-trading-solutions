/**
 * Ті самі правила, що клік по рядку заявки на дашборді: глобальний read-only режим модалки.
 * Детальне блокування окремих полів залишається всередині AddTaskModal за роллю.
 * @param {{ role?: string } | null | undefined} user
 * @param {{ status?: string, approvedByAccountant?: string } | null | undefined} task
 */
export function computeTaskModalReadOnly(user, task) {
  if (!task) return true;
  const isApprovedByAccountant =
    task.status === 'Виконано' && String(task.approvedByAccountant || '') === 'Підтверджено';
  const isAdmin = user?.role === 'admin' || user?.role === 'administrator';
  if (isApprovedByAccountant && !isAdmin) return true;
  return false;
}
