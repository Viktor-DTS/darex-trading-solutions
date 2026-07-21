import { parseNumber, roundMoney, sumLines } from './estimatePrefill';

export function buildValidation(task, workLines, lowerLines, calculations = {}) {
  const worksTotal = sumLines(workLines);
  const lowerTotal = sumLines(lowerLines);
  const grandTotal = roundMoney(worksTotal + lowerTotal);

  const expectedWorkPrice = roundMoney(parseNumber(calculations.workPrice ?? task.workPrice));
  const expectedServiceTotal = roundMoney(parseNumber(task.serviceTotal));

  const workDiff = roundMoney(worksTotal - expectedWorkPrice);
  const totalDiff = roundMoney(grandTotal - expectedServiceTotal);

  const workOk = Math.abs(workDiff) < 0.01;
  const totalOk = Math.abs(totalDiff) < 0.01;

  return {
    worksTotal,
    lowerTotal,
    grandTotal,
    expectedWorkPrice,
    expectedServiceTotal,
    workDiff,
    totalDiff,
    workOk,
    totalOk,
    ok: workOk && totalOk,
  };
}

export function buildTaskPatchFromEstimate(workLines, lowerLines, validation) {
  const patch = {
    workPrice: validation.worksTotal,
    serviceTotal: validation.grandTotal,
  };

  lowerLines.forEach((line) => {
    if (line.id === 'transport' || line.source === 'task-transport') {
      patch.transportKm = parseNumber(line.quantity);
      patch.transportSum = roundMoney(line.total);
    }
    if (line.source === 'task-per-diem') patch.perDiem = roundMoney(line.total);
    if (line.source === 'task-living') patch.living = roundMoney(line.total);
    if (line.source === 'task-other-exp') patch.otherExp = roundMoney(line.total);
  });

  return patch;
}
