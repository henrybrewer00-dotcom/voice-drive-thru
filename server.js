// Minimal local server. Serves the frontend, exposes the menu, and
// hands the browser a short-lived signed URL for the ElevenLabs
// conversation so the API key never leaves this machine.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { MENU, COUPONS, TAX_RATE } from './menu.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = process.env.ELEVENLABS_API_KEY;
const PORT = Number(process.env.PORT || 3010);

if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY in .env');
  process.exit(1);
}

const agentJsonPath = path.join(__dirname, 'agent.json');
if (!fs.existsSync(agentJsonPath)) {
  console.error('agent.json not found. Run `node provision-agent.js` first.');
  process.exit(1);
}
const { agent_id: AGENT_ID } = JSON.parse(fs.readFileSync(agentJsonPath, 'utf8'));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/menu', (_req, res) => {
  res.json({ menu: MENU, coupons: COUPONS, tax_rate: TAX_RATE });
});

// ===== Kitchen orders =====
// In-memory store. Newest first. Each order:
// { id, order_number, customer_name, items: [...], totals: {...}, status, created_at }
const orders = [];
const kitchenClients = new Set(); // SSE response objects

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of kitchenClients) {
    try { res.write(payload); } catch (_) {}
  }
}

app.post('/api/orders', (req, res) => {
  const { order_number, customer_name, items, totals } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items[] required' });
  }
  const order = {
    id: 'O' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    order_number: order_number || Math.floor(Math.random() * 900 + 100),
    customer_name: customer_name || null,
    items,
    totals: totals || {},
    status: 'new',
    created_at: new Date().toISOString(),
  };
  orders.unshift(order);
  if (orders.length > 50) orders.length = 50; // cap memory
  broadcast('order.new', order);
  console.log(`Order #${order.order_number} received: ${items.length} item(s), total ${totals?.total_with_tax ?? '?'}`);
  res.json({ ok: true, order });
});

app.get('/api/orders', (_req, res) => {
  res.json({ orders });
});

app.patch('/api/orders/:id', (req, res) => {
  const order = orders.find((o) => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  const { status } = req.body || {};
  if (status && !['new', 'in_progress', 'ready', 'done'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  if (status) order.status = status;
  broadcast('order.update', order);
  res.json({ ok: true, order });
});

app.delete('/api/orders/:id', (req, res) => {
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [removed] = orders.splice(idx, 1);
  broadcast('order.delete', { id: removed.id });
  res.json({ ok: true });
});

app.get('/api/orders/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(`event: hello\ndata: ${JSON.stringify({ orders })}\n\n`);
  kitchenClients.add(res);
  req.on('close', () => kitchenClients.delete(res));
});

app.get('/api/signed-url', async (_req, res) => {
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(AGENT_ID)}`,
      { headers: { 'xi-api-key': API_KEY } },
    );
    const text = await r.text();
    if (!r.ok) {
      console.error('signed-url failed:', r.status, text);
      return res.status(500).json({ error: text });
    }
    const data = JSON.parse(text);
    res.json({ signed_url: data.signed_url, agent_id: AGENT_ID });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log(`Drive-thru running at http://localhost:${PORT}`);
  console.log(`Agent: ${AGENT_ID}`);
});
