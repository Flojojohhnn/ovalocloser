async function kvGet(key) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['GET', key])
  });
  const data = await res.json();
  if (data.error) throw new Error('KV GET error: ' + data.error);
  if (data.result === null || data.result === undefined) return null;
  if (typeof data.result === 'string') {
    try { return JSON.parse(data.result); } catch (e) { return data.result; }
  }
  return data.result;
}

async function kvSet(key, value) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value)])
  });
  const data = await res.json();
  if (data.error) throw new Error('KV SET error: ' + data.error);
  return data;
}

module.exports = { kvGet, kvSet };
