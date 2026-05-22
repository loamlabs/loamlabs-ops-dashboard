require('dotenv').config({ path: '.env.local' });
const syncHandler = require('./pages/api/sync').default;

const req = {
  method: 'POST',
  headers: {
    'x-loam-secret': process.env.CRON_SECRET
  },
  body: {}
};

const res = {
  status: (code) => {
    console.log('Status:', code);
    return res;
  },
  json: (data) => {
    console.log('Response JSON:', JSON.stringify(data, null, 2));
    return res;
  }
};

(async () => {
  console.log('Starting local sync...');
  await syncHandler(req, res);
  console.log('Local sync finished.');
})();
