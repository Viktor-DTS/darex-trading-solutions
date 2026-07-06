const { readState, DATA_DIR } = require('./state');

const { mergePreferRich } = require('./stateMerge');

const fs = require('fs');

const path = require('path');



const lockPath = path.join(DATA_DIR, 'worker.lock');



let cache = {

  data: null,

  readAt: 0,

};



function isProcessAlive(pid) {

  if (!pid || !Number.isFinite(pid)) return false;

  try {

    process.kill(pid, 0);

    return true;

  } catch (_) {

    return false;

  }

}



function getWorkerState() {

  const now = Date.now();

  const fresh = readState();



  if (fresh?.updatedAt) {

    cache.data = mergePreferRich(cache.data, fresh);

    cache.readAt = now;

    return cache.data;

  }



  if (cache.data && now - cache.readAt < 45000) {

    return cache.data;

  }



  return null;

}



function claimWorkerLock() {

  try {

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

    fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });

    return true;

  } catch (_) {

    try {

      const owner = Number(fs.readFileSync(lockPath, 'utf8').trim());

      if (isProcessAlive(owner) && owner !== process.pid) return false;

    } catch (_) { /* stale lock */ }

    try {

      fs.unlinkSync(lockPath);

      fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });

      return true;

    } catch (_) {

      return false;

    }

  }

}



function releaseWorkerLock() {

  try {

    const owner = Number(fs.readFileSync(lockPath, 'utf8').trim());

    if (owner === process.pid) fs.unlinkSync(lockPath);

  } catch (_) { /* ignore */ }

}



module.exports = {

  getWorkerState,

  claimWorkerLock,

  releaseWorkerLock,

  isProcessAlive,

};

