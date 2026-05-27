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

export const isAccountantStuck = (task) => {
  if (task.status !== 'Виконано') return false;
  if (!isApprovalConfirmed(task.approvedByWarehouse)) return false;
  if (isApprovalConfirmed(task.approvedByAccountant) || isApprovalRejected(task.approvedByAccountant)) {
    return false;
  }
  if (!task.autoWarehouseApprovedAt) return false;
  const days = getDaysSince(task.autoWarehouseApprovedAt);
  return days !== null && days > STUCK_APPROVAL_DAYS;
};

export const getAccountantStuckDays = (task) => {
  if (!task.autoWarehouseApprovedAt) return null;
  return getDaysSince(task.autoWarehouseApprovedAt);
};
