// Kitchen Display — subscribes to /api/orders/stream (SSE) and renders
// each order as a ticket. Click status buttons to advance:
//   new → in_progress → ready → done

const board = document.getElementById('board');
const statNew = document.getElementById('statNew').querySelector('.stat-num');
const statProgress = document.getElementById('statProgress').querySelector('.stat-num');
const statReady = document.getElementById('statReady').querySelector('.stat-num');
const statConn = document.getElementById('statConn');

let orders = []; // newest first

// Web Audio "ding" — the inline <audio> data-URI was non-functional. This
// generates a real two-tone bell on every new order, no asset needed.
let bellCtx = null;
function playBell() {
  try {
    bellCtx = bellCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (bellCtx.state === 'suspended') bellCtx.resume();
    const t = bellCtx.currentTime;
    const tone = (freq, start, dur) => {
      const o = bellCtx.createOscillator();
      const g = bellCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g); g.connect(bellCtx.destination);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(0.22, t + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
      o.start(t + start);
      o.stop(t + start + dur + 0.02);
    };
    tone(880, 0, 0.18);   // higher ding
    tone(660, 0.12, 0.32); // lower follow-up
  } catch (_) { /* audio context likely blocked until first user gesture */ }
}

function fmt(n) { return '$' + Number(n).toFixed(2); }

function elapsedLabel(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}
function elapsedClass(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds > 300) return 'crit';
  if (seconds > 120) return 'warn';
  return '';
}

function statusActions(o) {
  if (o.status === 'new') {
    return `<button class="ticket-action start" data-id="${o.id}" data-next="in_progress">Start</button>`;
  }
  if (o.status === 'in_progress') {
    return `<button class="ticket-action ready" data-id="${o.id}" data-next="ready">Ready</button>`;
  }
  if (o.status === 'ready') {
    return `<button class="ticket-action complete" data-id="${o.id}" data-next="done">Handed Off</button>`;
  }
  return `<button class="ticket-action bump" data-id="${o.id}" data-next="bump">Bump</button>`;
}

function renderTicket(o) {
  const items = o.items.map((it) => {
    const mods = [];
    if (it.size) mods.push(`<span class="mod size">${it.size}</span>`);
    for (const c of it.customizations || []) mods.push(`<span class="mod cust">${c}</span>`);
    return `
      <div class="ticket-item">
        <div class="ticket-item-emoji">${it.emoji || '🍽'}</div>
        <div class="ticket-item-body">
          <div class="ticket-item-name"><span class="ticket-item-qty">${it.quantity}×</span>${it.name}</div>
          ${mods.length ? `<div class="ticket-item-mods">${mods.join('')}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  const total = o.totals?.total_with_tax ?? 0;
  const ec = elapsedClass(o.created_at);
  const nameRow = o.customer_name
    ? `<div class="ticket-name has-name">${o.customer_name}</div>`
    : `<div class="ticket-name">No name</div>`;

  return `
    <article class="ticket status-${o.status}" data-id="${o.id}" data-created="${o.created_at}">
      <span class="status-stripe ${o.status}">${o.status.replace('_', ' ')}</span>
      <div class="ticket-head">
        <div>
          <div class="ticket-num">#${o.order_number}</div>
          ${nameRow}
        </div>
        <div class="ticket-time">
          <div class="ticket-elapsed ${ec}" data-elapsed-for="${o.created_at}">${elapsedLabel(o.created_at)}</div>
          <div class="ticket-clock">elapsed</div>
        </div>
      </div>
      <div class="ticket-items">${items}</div>
      <div class="ticket-foot">
        <div class="ticket-total"><span class="label">Total</span>${fmt(total)}</div>
        ${statusActions(o)}
      </div>
    </article>`;
}

function renderBoard() {
  if (orders.length === 0) {
    board.innerHTML = `
      <div class="kds-empty">
        <div class="kds-empty-icon">🍳</div>
        <h2>No orders yet</h2>
        <p>New orders from the drive-thru will appear here in real-time.</p>
      </div>`;
  } else {
    // Show new + in_progress + ready first, done at the end
    const sorted = [...orders].sort((a, b) => {
      const rank = { new: 0, in_progress: 1, ready: 2, done: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return new Date(b.created_at) - new Date(a.created_at);
    });
    board.innerHTML = sorted.map(renderTicket).join('');
  }

  // Stats
  const counts = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status] || 0) + 1; return acc; }, {});
  statNew.textContent = counts.new || 0;
  statProgress.textContent = counts.in_progress || 0;
  statReady.textContent = counts.ready || 0;
}

// Click handler for action buttons (delegated)
board.addEventListener('click', async (e) => {
  const btn = e.target.closest('.ticket-action');
  if (!btn) return;
  const id = btn.dataset.id;
  const next = btn.dataset.next;
  if (next === 'bump') {
    // Actually delete from the server so it doesn't come back on refresh
    btn.disabled = true;
    try {
      await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    } catch (err) { console.error(err); }
    // SSE order.delete handler will update local state; remove eagerly too
    orders = orders.filter((o) => o.id !== id);
    renderBoard();
    return;
  }
  btn.disabled = true;
  try {
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
  } catch (err) { console.error(err); }
});

// Live elapsed timer (every second)
setInterval(() => {
  document.querySelectorAll('[data-elapsed-for]').forEach((el) => {
    const iso = el.dataset.elapsedFor;
    el.textContent = elapsedLabel(iso);
    el.classList.remove('warn', 'crit');
    const c = elapsedClass(iso);
    if (c) el.classList.add(c);
  });
}, 1000);

// ---- SSE connection ----
function connect() {
  const es = new EventSource('/api/orders/stream');

  es.addEventListener('hello', (e) => {
    const data = JSON.parse(e.data);
    orders = data.orders || [];
    statConn.classList.add('live');
    statConn.querySelector('span:last-child').textContent = 'Live';
    renderBoard();
  });

  es.addEventListener('order.new', (e) => {
    const o = JSON.parse(e.data);
    orders = [o, ...orders.filter((x) => x.id !== o.id)];
    renderBoard();
    playBell();
    if (navigator.vibrate) navigator.vibrate(80);
  });

  es.addEventListener('order.update', (e) => {
    const updated = JSON.parse(e.data);
    orders = orders.map((o) => o.id === updated.id ? updated : o);
    renderBoard();
  });

  es.addEventListener('order.delete', (e) => {
    const { id } = JSON.parse(e.data);
    orders = orders.filter((o) => o.id !== id);
    renderBoard();
  });

  es.onerror = () => {
    statConn.classList.remove('live');
    statConn.querySelector('span:last-child').textContent = 'Reconnecting…';
    // EventSource auto-reconnects; nothing else to do
  };
}
connect();
