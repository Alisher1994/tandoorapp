const clients = new Map(); // restaurantId -> Set of Response objects

function addClient(restaurantId, res) {
  const rId = Number(restaurantId);
  if (!rId) return;
  if (!clients.has(rId)) {
    clients.set(rId, new Set());
  }
  clients.get(rId).add(res);
}

function removeClient(restaurantId, res) {
  const rId = Number(restaurantId);
  if (!rId) return;
  const set = clients.get(rId);
  if (set) {
    set.delete(res);
    if (set.size === 0) {
      clients.delete(rId);
    }
  }
}

function broadcast(restaurantId, event, data) {
  const rId = Number(restaurantId);
  if (!rId) return;
  const set = clients.get(rId);
  if (!set || set.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch (err) {
      console.error('SSE write error:', err.message);
    }
  }
}

module.exports = {
  addClient,
  removeClient,
  broadcast
};
