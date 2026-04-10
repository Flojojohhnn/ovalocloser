const https = require('https');

function kvRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(process.env.KV_REST_API_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${process.env.KV_REST_API_TOKEN}`,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve({ result: null });
        }
      });
    });

    req.on('error', reject);

    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function kvGet(key) {
  const res = await kvRequest('GET', `/get/${encodeURIComponent(key)}`);
  if (!res.result) return null;
  try {
    return JSON.parse(res.result);
  } catch(e) {
    return res.result;
  }
}

async function kvSet(key, value) {
  const encoded = JSON.stringify(value);
  await kvRequest('POST', `/set/${encodeURIComponent(key)}`, [encoded]);
  return true;
}

module.exports = { kvGet, kvSet };
