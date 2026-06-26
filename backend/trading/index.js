const { registerTradingRoutes } = require('./tradingRoutes');
const { scheduleTradingScanJob, runTradingScan } = require('./tradingScan');

module.exports = {
  registerTradingRoutes,
  scheduleTradingScanJob,
  runTradingScan,
};
