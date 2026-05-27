export const STUCK_APPROVAL_DAYS = 7;
export const STUCK_ACTIVE_DAYS = 14;

export const getDaysSince = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
};

export const isApprovalConfirmed = (value) => value === 'Підтверджено';
export const isApprovalRejected = (value) => value === 'Відмова';

/** Єдина дата затвердження складом: нове поле з часом або legacy date-only. */
export const getWarehouseApprovedAt = (task) =>
  task?.autoWarehouseApprovedAt || task?.warehouseApprovalDate || null;

export const isAccountantStuck = (task) => {
  if (task.status !== 'Виконано') return false;
  if (!isApprovalConfirmed(task.approvedByWarehouse)) return false;
  if (isApprovalConfirmed(task.approvedByAccountant) || isApprovalRejected(task.approvedByAccountant)) {
    return false;
  }
  const approvedAt = getWarehouseApprovedAt(task);
  if (!approvedAt) return false;
  const days = getDaysSince(approvedAt);
  return days !== null && days > STUCK_APPROVAL_DAYS;
};

export const getAccountantStuckDays = (task) => {
  const approvedAt = getWarehouseApprovedAt(task);
  if (!approvedAt) return null;
  return getDaysSince(approvedAt);
};
