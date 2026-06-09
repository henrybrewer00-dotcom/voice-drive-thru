// Drive-thru frontend: live menu, order state, mic button, and the
// glue that registers client tools so the agent can mutate the order.

import { Conversation } from 'https://esm.sh/@elevenlabs/client@0.5.0';

// Tax rate is sourced from the server (single source of truth in menu.js).
// Fallback to 0.0875 if the menu fetch fails — matches the constant in menu.js.
let TAX_RATE = 0.0875;

// ------- DOM refs
const menuEl = document.getElementById('menu');
const orderLinesEl = document.getElementById('orderLines');
const orderStateEl = document.getElementById('orderState');
const orderNumEl = document.getElementById('orderNum');
const subtotalEl = document.getElementById('subtotal');
const discountRowEl = document.getElementById('discountRow');
const discountLabelEl = document.getElementById('discountLabel');
const discountAmountEl = document.getElementById('discountAmount');
const taxEl = document.getElementById('tax');
const totalEl = document.getElementById('total');
const micBtn = document.getElementById('micBtn');
const micLabel = micBtn.querySelector('.mic-label');
const micHint = document.getElementById('micHint');
const voiceBars = document.getElementById('voiceBars');
const voiceBarsSpans = voiceBars.querySelectorAll('span');
const transcriptEl = document.getElementById('transcript');
const statusEl = document.getElementById('status');
const splashEl = document.getElementById('confirmedSplash');
const splashTotalEl = document.getElementById('splashTotal');
const splashCloseBtn = document.getElementById('splashClose');

// ------- state
let menu = [];
let menuById = {};
let coupons = {};
let order = [];
let appliedCoupon = null; // coupon object or null
let confirmed = false;
let pendingHangup = false; // set true by finalize_order; client hangs up on next speaking→listening
let customerName = null;
let orderNumber = Math.floor(Math.random() * 900) + 100;
let conversation = null;
let convStatus = 'idle';
let voiceMode = 'listening';
let transcriptTimeout = null;
let volumeAnimFrame = null;

// ------- helpers
const fmt = (n) => `$${n.toFixed(2)}`;

function lineUnitPrice(line) {
  const item = menuById[line.item_id];
  if (!item) return 0;
  let price = item.basePrice;
  if (line.size && item.sizes && item.sizes[line.size] != null) price += item.sizes[line.size];
  for (const c of line.customizations || []) {
    const cust = item.customizations?.[c];
    if (cust != null) price += cust;
  }
  return price;
}
const lineTotal = (l) => lineUnitPrice(l) * (l.quantity || 1);
const orderSubtotal = () => order.reduce((s, l) => s + lineTotal(l), 0);
const newLineId = () => 'L' + Math.random().toString(36).slice(2, 8);

function computeTotals() {
  const subtotal = orderSubtotal();
  let discount = 0;
  let coupon_warning = null;
  if (appliedCoupon) {
    if (subtotal < appliedCoupon.min_order) {
      // Below min — keep coupon attached but warn
      coupon_warning = `Subtotal ${fmt(subtotal)} is below ${appliedCoupon.code}'s ${fmt(appliedCoupon.min_order)} minimum.`;
      discount = 0;
    } else if (appliedCoupon.type === 'percent') {
      discount = subtotal * appliedCoupon.value;
    } else if (appliedCoupon.type === 'flat') {
      discount = Math.min(appliedCoupon.value, subtotal);
    }
  }
  const discounted = Math.max(0, subtotal - discount);
  const tax = discounted * TAX_RATE;
  const total = discounted + tax;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total: Number(total.toFixed(2)),
    coupon: appliedCoupon ? appliedCoupon.code : null,
    coupon_warning,
  };
}

function showError(msg) {
  statusEl.textContent = msg;
  statusEl.classList.remove('hidden');
  setTimeout(() => statusEl.classList.add('hidden'), 6000);
}

function showTranscript(speaker, text) {
  transcriptEl.innerHTML = `<div class="speaker">${speaker}</div><div>${text}</div>`;
  transcriptEl.classList.toggle('user', speaker.toLowerCase() === 'you');
  transcriptEl.classList.add('visible');
  clearTimeout(transcriptTimeout);
  transcriptTimeout = setTimeout(() => transcriptEl.classList.remove('visible'), 5000);
}

// ------- rendering
function renderMenu() {
  const byCat = {};
  for (const it of menu) {
    if (!byCat[it.category]) byCat[it.category] = [];
    byCat[it.category].push(it);
  }
  // Category nav chips — click scrolls the matching section into view
  const catNav = document.getElementById('catNav');
  catNav.innerHTML = Object.keys(byCat).map((cat) => `<button class="cat-chip" data-cat="${cat}">${cat}</button>`).join('');
  catNav.querySelectorAll('.cat-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = menuEl.querySelector(`.menu-category[data-cat="${btn.dataset.cat}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  menuEl.innerHTML = Object.entries(byCat).map(([cat, items]) => `
    <div class="menu-category" data-cat="${cat}">
      <h3>${cat}</h3>
      <div class="menu-grid">
        ${items.map((it) => `
          <div class="menu-item" data-item-id="${it.id}">
            <div class="menu-item-head">
              <span class="menu-item-emoji">${it.emoji || '🍽'}</span>
              <span class="menu-item-price">${fmt(it.basePrice)}</span>
            </div>
            <div class="menu-item-name">${it.name}</div>
            ${it.description ? `<div class="menu-item-desc">${it.description}</div>` : ''}
            ${it.sizes ? `<div class="menu-item-meta">${Object.keys(it.sizes).map((s) => `<span class="chip">${s}</span>`).join('')}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function flashMenuItem(item_id) {
  const el = menuEl.querySelector(`.menu-item[data-item-id="${item_id}"]`);
  if (!el) return;
  el.classList.remove('recently-added');
  void el.offsetWidth;
  el.classList.add('recently-added');
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderOrder() {
  if (order.length === 0) {
    orderLinesEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎙</div>
        <p class="empty-title">Ready to order?</p>
        <p class="small">Tap the mic and tell Lily what you want.</p>
      </div>`;
    orderStateEl.textContent = 'Empty';
    orderStateEl.className = 'state-pill state-empty';
    orderNumEl.textContent = 'Order #—';
  } else {
    orderLinesEl.innerHTML = order.map((line) => {
      const item = menuById[line.item_id];
      const emoji = item?.emoji || '🍽';
      const name = item?.name || line.item_id;
      const tags = [];
      if (line.size) tags.push(`<span class="size-tag">${line.size}</span>`);
      for (const c of line.customizations || []) tags.push(`<span class="cust-tag">${c}</span>`);
      return `
        <div class="order-line" data-line-id="${line.order_line_id}">
          <div class="line-emoji">${emoji}</div>
          <div class="line-body">
            <div class="line-top">
              <div class="line-qty-name"><span class="line-qty">${line.quantity}×</span>${name}</div>
              <div class="line-price">${fmt(lineTotal(line))}</div>
            </div>
            ${tags.length ? `<div class="line-customizations">${tags.join('')}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    orderStateEl.textContent = confirmed ? '✓ Confirmed' : 'Building';
    orderStateEl.className = `state-pill ${confirmed ? 'state-confirmed' : 'state-building'}`;
    orderNumEl.textContent = `Order #${orderNumber}`;
  }

  const t = computeTotals();
  subtotalEl.textContent = fmt(t.subtotal);
  if (t.coupon && t.discount > 0) {
    discountRowEl.style.display = 'flex';
    discountLabelEl.textContent = `Discount (${t.coupon})`;
    discountAmountEl.textContent = `-${fmt(t.discount)}`;
  } else {
    discountRowEl.style.display = 'none';
  }
  taxEl.textContent = fmt(t.tax);
  totalEl.textContent = fmt(t.total);
}

function showConfirmedSplash() {
  const t = computeTotals();
  splashTotalEl.textContent = fmt(t.total);
  splashEl.classList.remove('hidden');
}

splashCloseBtn.addEventListener('click', () => {
  splashEl.classList.add('hidden');
  order = [];
  appliedCoupon = null;
  confirmed = false;
  pendingHangup = false;
  customerName = null;
  orderNumber = Math.floor(Math.random() * 900) + 100;
  renderOrder();
});

// ------- voice activity bars
function setVoiceMode(mode) {
  voiceMode = mode;
  if (convStatus !== 'connected') {
    voiceBars.classList.remove('active', 'listening', 'speaking');
    return;
  }
  voiceBars.classList.add('active');
  voiceBars.classList.toggle('listening', mode === 'listening');
  voiceBars.classList.toggle('speaking', mode === 'speaking');
  micHint.textContent = mode === 'speaking' ? 'Lily is speaking' : 'Lily is listening';
}

function startVolumeLoop() {
  cancelAnimationFrame(volumeAnimFrame);
  const loop = () => {
    if (convStatus !== 'connected' || !conversation) return;
    if (voiceMode === 'speaking') {
      const vol = typeof conversation.getOutputVolume === 'function' ? conversation.getOutputVolume() : 0.5;
      for (let i = 0; i < voiceBarsSpans.length; i++) {
        const phase = (Date.now() / 100 + i * 0.7) % (Math.PI * 2);
        const wave = (Math.sin(phase) + 1) / 2;
        const h = 6 + wave * vol * 60;
        voiceBarsSpans[i].style.height = `${Math.max(6, Math.min(28, h))}px`;
      }
    }
    volumeAnimFrame = requestAnimationFrame(loop);
  };
  volumeAnimFrame = requestAnimationFrame(loop);
}

// ------- helpers exposed to tool responses
// Every tool returns a complete totals snapshot so the agent always has
// accurate subtotal/discount/tax/total to read back.
function totalsSnapshot() {
  const t = computeTotals();
  return {
    subtotal: t.subtotal,
    discount: t.discount,
    tax: t.tax,
    total_with_tax: t.total,
    applied_coupon: t.coupon,
  };
}

// ------- client tools
function logged(name, fn) {
  return async (args) => {
    console.log(`%c[tool] ${name}`, 'color: #ffb547; font-weight: bold', args);
    try {
      const result = await fn(args || {});
      console.log(`%c[tool] ${name} ->`, result.ok ? 'color: #4ade80' : 'color: #ef4444', result);
      return result;
    } catch (e) {
      console.error(`[tool] ${name} threw`, e);
      return { ok: false, error: String(e?.message || e) };
    }
  };
}

const clientToolsRaw = {
  add_item: async ({ item_id, size, customizations, quantity }) => {
    const item = menuById[item_id];
    if (!item) {
      const ids = Object.keys(menuById).slice(0, 10).join(', ');
      return { ok: false, error: `Unknown item_id "${item_id}". Sample valid IDs: ${ids}... Ask the customer to clarify which menu item they want.` };
    }
    let validatedSize = size;
    if (item.sizes) {
      if (!size) return { ok: false, error: `"${item.name}" needs a size. Ask the customer which: ${Object.keys(item.sizes).join(', ')}.` };
      const sizeKey = Object.keys(item.sizes).find((k) => k.toLowerCase() === String(size).toLowerCase());
      if (!sizeKey) return { ok: false, error: `Size "${size}" not available for ${item.name}. Options: ${Object.keys(item.sizes).join(', ')}.` };
      validatedSize = sizeKey;
    } else if (size) {
      validatedSize = null;
    }
    const cleanCusts = [];
    const allowed = Object.keys(item.customizations || {});
    const matchCust = (input) => {
      const s = String(input).toLowerCase().trim();
      // Exact (case-insensitive)
      let hit = allowed.find((a) => a.toLowerCase() === s);
      if (hit) return hit;
      // Try with " drink" suffix
      hit = allowed.find((a) => a.toLowerCase() === s + ' drink');
      if (hit) return hit;
      // Try stripping " drink" suffix
      hit = allowed.find((a) => a.toLowerCase() === s.replace(/\s+drink$/, ''));
      if (hit) return hit;
      // Substring match (use cautiously — only if exactly one hit)
      const subs = allowed.filter((a) => a.toLowerCase().includes(s) || s.includes(a.toLowerCase()));
      if (subs.length === 1) return subs[0];
      return null;
    };
    for (const c of customizations || []) {
      const hit = matchCust(c);
      if (hit) cleanCusts.push(hit);
      else return { ok: false, error: `"${c}" isn't a valid customization for ${item.name}. Allowed: ${allowed.join(', ') || 'none'}. Ask the customer for a clarification or pick the closest match.` };
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const newLine = { order_line_id: newLineId(), item_id, size: validatedSize, customizations: cleanCusts, quantity: qty };
    order.push(newLine);
    confirmed = false;
    renderOrder();
    flashMenuItem(item_id);
    return {
      ok: true,
      order_line_id: newLine.order_line_id,
      line_total: Number(lineTotal(newLine).toFixed(2)),
      summary: `Added ${qty}× ${item.name}${validatedSize ? ` (${validatedSize})` : ''}${cleanCusts.length ? ` — ${cleanCusts.join(', ')}` : ''}.`,
      ...totalsSnapshot(),
    };
  },

  remove_item: async ({ order_line_id }) => {
    const idx = order.findIndex((l) => l.order_line_id === order_line_id);
    if (idx === -1) return { ok: false, error: 'No order line with that id.' };
    const removed = order[idx];
    const el = orderLinesEl.querySelector(`.order-line[data-line-id="${order_line_id}"]`);
    if (el) el.classList.add('removing');
    setTimeout(() => {
      order.splice(idx, 1);
      confirmed = false;
      renderOrder();
    }, 240);
    return { ok: true, summary: `Removed ${menuById[removed.item_id]?.name || removed.item_id}.`, ...totalsSnapshot() };
  },

  update_item: async ({ order_line_id, size, customizations }) => {
    const line = order.find((l) => l.order_line_id === order_line_id);
    if (!line) return { ok: false, error: 'No order line with that id.' };
    const item = menuById[line.item_id];
    if (size !== undefined && size !== null) {
      if (!item.sizes) return { ok: false, error: `${item.name} doesn't have sizes.` };
      const sizeKey = Object.keys(item.sizes).find((k) => k.toLowerCase() === String(size).toLowerCase());
      if (!sizeKey) return { ok: false, error: `Size "${size}" not available.` };
      line.size = sizeKey;
    }
    if (customizations !== undefined) {
      const allowed = Object.keys(item.customizations || {});
      const matchCust = (input) => {
        const s = String(input).toLowerCase().trim();
        let hit = allowed.find((a) => a.toLowerCase() === s);
        if (hit) return hit;
        hit = allowed.find((a) => a.toLowerCase() === s + ' drink');
        if (hit) return hit;
        hit = allowed.find((a) => a.toLowerCase() === s.replace(/\s+drink$/, ''));
        if (hit) return hit;
        const subs = allowed.filter((a) => a.toLowerCase().includes(s) || s.includes(a.toLowerCase()));
        if (subs.length === 1) return subs[0];
        return null;
      };
      const clean = [];
      for (const c of customizations) {
        const hit = matchCust(c);
        if (hit) clean.push(hit);
        else return { ok: false, error: `"${c}" isn't a valid customization for ${item.name}. Allowed: ${allowed.join(', ') || 'none'}.` };
      }
      line.customizations = clean;
    }
    confirmed = false;
    renderOrder();
    return { ok: true, line_total: Number(lineTotal(line).toFixed(2)), summary: `Updated ${item.name}.`, ...totalsSnapshot() };
  },

  set_quantity: async ({ order_line_id, quantity }) => {
    const line = order.find((l) => l.order_line_id === order_line_id);
    if (!line) return { ok: false, error: 'No order line with that id.' };
    const q = parseInt(quantity, 10);
    if (!q || q < 1) return { ok: false, error: 'Quantity must be at least 1.' };
    line.quantity = q;
    confirmed = false;
    renderOrder();
    return { ok: true, line_total: Number(lineTotal(line).toFixed(2)), ...totalsSnapshot() };
  },

  clear_order: async () => {
    order = [];
    appliedCoupon = null;
    confirmed = false;
    renderOrder();
    return { ok: true, summary: 'Order cleared.', ...totalsSnapshot() };
  },

  apply_coupon: async ({ code }) => {
    if (!code) return { ok: false, error: 'No code provided.' };
    const normalized = String(code).trim().toUpperCase().replace(/\s+/g, '');
    const c = coupons[normalized];
    if (!c) return { ok: false, error: `No coupon with code "${code}". Valid codes are: HAPPY (10% off), TENOFF ($10 off, $15 minimum).` };
    appliedCoupon = c;
    confirmed = false;
    renderOrder();
    const snap = totalsSnapshot();
    let summary = `Applied ${c.code} — ${c.description}`;
    if (snap.coupon_warning) summary += ` (${snap.coupon_warning})`;
    return { ok: true, summary, ...snap, coupon_min_order: c.min_order };
  },

  remove_coupon: async () => {
    if (!appliedCoupon) return { ok: false, error: 'No coupon applied.' };
    const code = appliedCoupon.code;
    appliedCoupon = null;
    renderOrder();
    return { ok: true, summary: `Removed coupon ${code}.`, ...totalsSnapshot() };
  },

  get_order: async () => {
    const items = order.map((l) => {
      const it = menuById[l.item_id];
      return {
        order_line_id: l.order_line_id,
        item_id: l.item_id,
        name: it?.name,
        size: l.size,
        customizations: l.customizations,
        quantity: l.quantity,
        line_total: Number(lineTotal(l).toFixed(2)),
      };
    });
    const snap = totalsSnapshot();
    // Pre-built readback line. The agent MUST speak this verbatim during
    // the financial summary — eliminates hallucinated totals.
    const fmt2 = (n) => n.toFixed(2);
    let say_total;
    if (snap.discount > 0) {
      say_total = `Your subtotal's $${fmt2(snap.subtotal)}. With your coupon that's $${fmt2(snap.discount)} off. Plus tax of $${fmt2(snap.tax)}. Your total comes to $${fmt2(snap.total_with_tax)}. Does that all look right?`;
    } else {
      say_total = `Your subtotal's $${fmt2(snap.subtotal)}. Plus tax of $${fmt2(snap.tax)}. Your total comes to $${fmt2(snap.total_with_tax)}. Does that all look right?`;
    }
    return { ok: true, items, customer_name: customerName, ...snap, say_total };
  },

  set_customer_name: async ({ name }) => {
    if (!name || !String(name).trim()) return { ok: false, error: 'No name provided.' };
    if (order.length === 0) {
      // Defensive: don't let the agent jump to name capture before taking the order.
      return { ok: false, error: `Order is empty — don't capture a name yet. Acknowledge them ("Nice to meet you, ${String(name).trim()}!") and ask what they'd like to order.` };
    }
    customerName = String(name).trim().slice(0, 60);
    return { ok: true, customer_name: customerName, summary: `Got it, ${customerName}.` };
  },

  finalize_order: async () => {
    if (order.length === 0) return { ok: false, error: 'Cannot finalize an empty order. Ask the customer what they want.' };
    const snap = totalsSnapshot();
    if (!snap.total_with_tax || snap.total_with_tax <= 0) {
      console.error('[finalize_order] refusing $0 total', snap, order);
      return { ok: false, error: `Order total computed to $${snap.total_with_tax}. That's a bug — call get_order to see the line items and ask the customer to confirm what they want.` };
    }
    confirmed = true;
    pendingHangup = true; // client will hang up after goodbye finishes speaking
    renderOrder();
    setTimeout(showConfirmedSplash, 400);

    // Push the finalized order to the kitchen display tab.
    const items = order.map((l) => {
      const it = menuById[l.item_id];
      return {
        name: it?.name || l.item_id,
        emoji: it?.emoji || '🍽',
        size: l.size,
        customizations: l.customizations,
        quantity: l.quantity,
        line_total: Number(lineTotal(l).toFixed(2)),
      };
    });
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        order_number: orderNumber,
        customer_name: customerName,
        items,
        totals: snap,
      }),
    }).catch((e) => console.error('post order failed', e));

    const namePart = customerName ? `, ${customerName}` : '';
    return {
      ok: true,
      ...snap,
      order_number: orderNumber,
      say_next: `Alright${namePart}, pull on around to the front window — your total comes to $${snap.total_with_tax.toFixed(2)}. Order number ${orderNumber}. Thanks for stopping by Lily's!`,
      then: 'After speaking that line, do NOT call end_call — the system hangs up automatically.',
    };
  },
};

const clientTools = Object.fromEntries(
  Object.entries(clientToolsRaw).map(([k, v]) => [k, logged(k, v)]),
);

// ------- conversation lifecycle
async function startConversation() {
  if (convStatus !== 'idle') return;
  convStatus = 'connecting';
  micBtn.classList.add('connecting');
  micLabel.textContent = 'Connecting…';
  micHint.textContent = 'Hooking up Lily…';
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = await fetch('/api/signed-url');
    if (!r.ok) throw new Error(`signed-url ${r.status}`);
    const { signed_url } = await r.json();
    conversation = await Conversation.startSession({
      signedUrl: signed_url,
      clientTools,
      onConnect: () => {
        convStatus = 'connected';
        micBtn.classList.remove('connecting');
        micBtn.classList.add('live');
        micLabel.textContent = 'End call';
        setVoiceMode('listening');
        startVolumeLoop();
      },
      onDisconnect: () => {
        convStatus = 'idle';
        micBtn.classList.remove('live', 'connecting');
        micLabel.textContent = 'Tap to order';
        micHint.textContent = 'Lily greets you when you tap';
        voiceBars.classList.remove('active', 'listening', 'speaking');
        cancelAnimationFrame(volumeAnimFrame);
      },
      onError: (e) => {
        console.error('conversation error', e);
        showError(e?.message || String(e));
      },
      onMessage: ({ source, message }) => {
        if (!message) return;
        const speaker = source === 'user' ? 'You' : 'Lily';
        const color = source === 'user' ? '#4ade80' : '#ffb547';
        console.log(`%c${speaker}: %c${message}`, `color: ${color}; font-weight: bold`, 'color: inherit');
        showTranscript(speaker, message);
      },
      onModeChange: ({ mode }) => {
        setVoiceMode(mode === 'speaking' ? 'speaking' : 'listening');
        // Once finalize_order has fired, the FIRST speaking→listening
        // transition means the goodbye line just finished. Hang up
        // immediately instead of waiting for the agent to call end_call.
        if (mode === 'listening' && pendingHangup) {
          pendingHangup = false;
          setTimeout(() => {
            if (conversation && convStatus === 'connected') endConversation();
          }, 600);
        }
      },
    });
  } catch (e) {
    console.error(e);
    showError(e?.message || String(e));
    convStatus = 'idle';
    micBtn.classList.remove('live', 'connecting');
    micLabel.textContent = 'Tap to order';
    micHint.textContent = 'Lily greets you when you tap';
  }
}

async function endConversation() {
  if (conversation) {
    await conversation.endSession();
    conversation = null;
  }
  convStatus = 'idle';
  micBtn.classList.remove('live', 'connecting');
  micLabel.textContent = 'Tap to order';
  micHint.textContent = 'Lily greets you when you tap';
  voiceBars.classList.remove('active', 'listening', 'speaking');
  cancelAnimationFrame(volumeAnimFrame);
}

micBtn.addEventListener('click', () => {
  if (convStatus === 'idle') startConversation();
  else if (convStatus === 'connected') endConversation();
});

// ------- bootstrap
async function init() {
  const r = await fetch('/api/menu');
  const data = await r.json();
  menu = data.menu;
  coupons = data.coupons;
  if (typeof data.tax_rate === 'number') TAX_RATE = data.tax_rate;
  menuById = Object.fromEntries(menu.map((m) => [m.id, m]));
  renderMenu();
  renderOrder();
}
init().catch((e) => {
  console.error(e);
  showError('Failed to load menu: ' + e.message);
});
