// End-to-end test for the Lily voice agent. Drives the ElevenLabs
// Conversational AI agent with scripted text turns, simulates the
// client tools in-process (no browser), and asserts on tool args,
// totals math, and the kitchen state.
//
// Usage:
//   node tests/voice-test.js
//   node tests/voice-test.js --script=happy_path
//
// Exit code 0 = all assertions passed, 1 = any failed.

import 'dotenv/config';
import WebSocket from 'ws';
import { MENU, COUPONS, TAX_RATE } from '../menu.js';

const SERVER = process.env.RALPH_SERVER || 'http://localhost:3010';
const TURN_QUIET_MS = 4000;       // wait this long after the last message before next user line
const SCRIPT_TIMEOUT_MS = 90_000; // hard cap per script

const menuById = Object.fromEntries(MENU.map((m) => [m.id, m]));

// ===== Order sim (mirrors public/app.js) =====
function lineUnitPrice(line) {
  const item = menuById[line.item_id];
  if (!item) return 0;
  let p = item.basePrice;
  if (line.size && item.sizes && item.sizes[line.size] != null) p += item.sizes[line.size];
  for (const c of line.customizations || []) {
    const v = item.customizations?.[c];
    if (v != null) p += v;
  }
  return p;
}
const lineTotal = (l) => lineUnitPrice(l) * (l.quantity || 1);

function computeTotals(sim) {
  const subtotal = sim.lines.reduce((s, l) => s + lineTotal(l), 0);
  let discount = 0;
  if (sim.appliedCoupon) {
    if (subtotal >= sim.appliedCoupon.min_order) {
      if (sim.appliedCoupon.type === 'percent') discount = subtotal * sim.appliedCoupon.value;
      else if (sim.appliedCoupon.type === 'flat') discount = Math.min(sim.appliedCoupon.value, subtotal);
    }
  }
  const discounted = Math.max(0, subtotal - discount);
  const tax = discounted * TAX_RATE;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    total_with_tax: Number((discounted + tax).toFixed(2)),
    applied_coupon: sim.appliedCoupon?.code || null,
  };
}

function matchCust(input, allowed) {
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
}

function newSim() {
  return {
    lines: [],
    appliedCoupon: null,
    customerName: null,
    orderNumber: Math.floor(Math.random() * 900) + 100,
    finalizedOrderId: null,
    toolCalls: [],
    agentLines: [], // every agent_response we receive — for stage-direction leak checks
  };
}

// Patterns that should NEVER appear in spoken agent output. The TTS reads
// stage directions / audio tags literally (e.g. you hear "friendly" the word),
// which ruins the call. gpt-4.x sometimes emits these — the prompt forbids it
// and this guard catches regressions.
const STAGE_DIRECTION_RE = /\[[a-z][a-z\s_-]{2,20}\]|\*[^*\n]{2,40}\*|\(\s*(friendly|warmly|cheerfully|laughs|pause|smiles|softly|whispers)\s*\)/i;
function findStageDirection(lines) {
  for (const l of lines) {
    const m = l.match(STAGE_DIRECTION_RE);
    if (m) return { line: l, match: m[0] };
  }
  return null;
}

const TOOLS = {
  add_item(sim, { item_id, size, customizations, quantity }) {
    const item = menuById[item_id];
    if (!item) return { ok: false, error: `Unknown item_id "${item_id}".` };
    let validatedSize = size;
    if (item.sizes) {
      if (!size) return { ok: false, error: `"${item.name}" needs a size. Options: ${Object.keys(item.sizes).join(', ')}.` };
      const k = Object.keys(item.sizes).find((x) => x.toLowerCase() === String(size).toLowerCase());
      if (!k) return { ok: false, error: `Size "${size}" not available.` };
      validatedSize = k;
    } else if (size) validatedSize = null;
    const allowed = Object.keys(item.customizations || {});
    const cleanCusts = [];
    for (const c of customizations || []) {
      const hit = matchCust(c, allowed);
      if (hit) cleanCusts.push(hit);
      else return { ok: false, error: `"${c}" isn't valid for ${item.name}.` };
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const lineId = 'L' + Math.random().toString(36).slice(2, 8);
    const line = { order_line_id: lineId, item_id, size: validatedSize, customizations: cleanCusts, quantity: qty };
    sim.lines.push(line);
    return { ok: true, order_line_id: lineId, line_total: Number(lineTotal(line).toFixed(2)), ...computeTotals(sim) };
  },
  remove_item(sim, { order_line_id }) {
    const i = sim.lines.findIndex((l) => l.order_line_id === order_line_id);
    if (i === -1) return { ok: false, error: 'no such line' };
    sim.lines.splice(i, 1);
    return { ok: true, ...computeTotals(sim) };
  },
  update_item(sim, args) {
    const line = sim.lines.find((l) => l.order_line_id === args.order_line_id);
    if (!line) return { ok: false, error: 'no such line' };
    const item = menuById[line.item_id];
    if (args.size != null) {
      const k = Object.keys(item.sizes || {}).find((x) => x.toLowerCase() === String(args.size).toLowerCase());
      if (!k) return { ok: false, error: `bad size ${args.size}` };
      line.size = k;
    }
    if (args.customizations !== undefined) {
      const allowed = Object.keys(item.customizations || {});
      const clean = [];
      for (const c of args.customizations) {
        const hit = matchCust(c, allowed);
        if (hit) clean.push(hit);
        else return { ok: false, error: `bad cust ${c}` };
      }
      line.customizations = clean;
    }
    return { ok: true, ...computeTotals(sim) };
  },
  set_quantity(sim, { order_line_id, quantity }) {
    const line = sim.lines.find((l) => l.order_line_id === order_line_id);
    if (!line) return { ok: false, error: 'no such line' };
    const q = parseInt(quantity, 10);
    if (!q || q < 1) return { ok: false, error: 'bad quantity' };
    line.quantity = q;
    return { ok: true, ...computeTotals(sim) };
  },
  clear_order(sim) {
    sim.lines = [];
    sim.appliedCoupon = null;
    return { ok: true, ...computeTotals(sim) };
  },
  apply_coupon(sim, { code }) {
    const norm = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
    const c = COUPONS[norm];
    if (!c) return { ok: false, error: `unknown code "${code}"` };
    sim.appliedCoupon = c;
    return { ok: true, summary: `Applied ${c.code}`, ...computeTotals(sim) };
  },
  remove_coupon(sim) {
    if (!sim.appliedCoupon) return { ok: false, error: 'no coupon' };
    sim.appliedCoupon = null;
    return { ok: true, ...computeTotals(sim) };
  },
  set_customer_name(sim, { name }) {
    if (!name || !String(name).trim()) return { ok: false, error: 'no name' };
    sim.customerName = String(name).trim().slice(0, 60);
    return { ok: true, customer_name: sim.customerName };
  },
  get_order(sim) {
    const t = computeTotals(sim);
    const items = sim.lines.map((l) => ({
      order_line_id: l.order_line_id,
      item_id: l.item_id,
      name: menuById[l.item_id]?.name,
      size: l.size,
      customizations: l.customizations,
      quantity: l.quantity,
      line_total: Number(lineTotal(l).toFixed(2)),
    }));
    const f = (n) => n.toFixed(2);
    const say_total = t.discount > 0
      ? `Your subtotal's $${f(t.subtotal)}. With your coupon that's $${f(t.discount)} off. Plus tax of $${f(t.tax)}. Your total comes to $${f(t.total_with_tax)}. Does that all look right?`
      : `Your subtotal's $${f(t.subtotal)}. Plus tax of $${f(t.tax)}. Your total comes to $${f(t.total_with_tax)}. Does that all look right?`;
    return { ok: true, items, customer_name: sim.customerName, ...t, say_total };
  },
  async finalize_order(sim) {
    if (sim.lines.length === 0) return { ok: false, error: 'empty order' };
    const t = computeTotals(sim);
    if (t.total_with_tax <= 0) return { ok: false, error: 'total is $0' };
    // POST to kitchen — the real /api/orders endpoint
    const items = sim.lines.map((l) => {
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
    try {
      const r = await fetch(`${SERVER}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          order_number: sim.orderNumber,
          customer_name: sim.customerName,
          items,
          totals: t,
        }),
      });
      const data = await r.json();
      sim.finalizedOrderId = data.order?.id || null;
    } catch (e) {
      console.warn('POST /api/orders failed:', e.message);
    }
    const namePart = sim.customerName ? `, ${sim.customerName}` : '';
    return {
      ok: true,
      ...t,
      order_number: sim.orderNumber,
      say_next: `Alright${namePart}, pull on around to the front window — your total comes to $${t.total_with_tax.toFixed(2)}. Order number ${sim.orderNumber}. Thanks for stopping by Lily's!`,
    };
  },
};

// ===== Driver =====
async function runScript(script) {
  const sim = newSim();
  const r = await fetch(`${SERVER}/api/signed-url`);
  if (!r.ok) throw new Error(`signed-url ${r.status}`);
  const { signed_url } = await r.json();

  console.log(`\n=== ${script.name} ===`);
  console.log(`agent_id: ${signed_url.match(/agent_id=([^&]+)/)?.[1]}`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(signed_url);
    let scriptIdx = 0;
    let quietTimer = null;
    let done = false;
    let initStarted = false;

    const hardTimeout = setTimeout(() => {
      if (!done) { done = true; ws.close(); reject(new Error(`Script "${script.name}" hard timeout after ${SCRIPT_TIMEOUT_MS}ms`)); }
    }, SCRIPT_TIMEOUT_MS);

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(hardTimeout);
      clearTimeout(quietTimer);
      try { ws.close(); } catch {}
      resolve({ sim, ...result });
    };

    const armQuiet = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        if (scriptIdx >= script.lines.length) {
          finish({ ok: true });
        } else {
          const text = script.lines[scriptIdx++];
          console.log(`USER → ${text}`);
          ws.send(JSON.stringify({ type: 'user_message', text }));
          armQuiet();
        }
      }, TURN_QUIET_MS);
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'conversation_initiation_client_data' }));
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === 'conversation_initiation_metadata') {
        if (!initStarted) { initStarted = true; armQuiet(); }
      } else if (msg.type === 'agent_response') {
        const text = msg.agent_response_event?.agent_response;
        if (text) { console.log(`AGENT ← ${text}`); sim.agentLines.push(text); }
        armQuiet();
      } else if (msg.type === 'client_tool_call') {
        const call = msg.client_tool_call;
        const fn = TOOLS[call.tool_name];
        const resPromise = fn
          ? Promise.resolve(fn(sim, call.parameters || {}))
          : Promise.resolve({ ok: false, error: `unknown tool ${call.tool_name}` });
        resPromise.then((res) => {
          sim.toolCalls.push({ name: call.tool_name, params: call.parameters || {}, result: res });
          const summary = res.ok ? 'ok' : `ERR: ${res.error}`;
          console.log(`TOOL ↺ ${call.tool_name}(${JSON.stringify(call.parameters || {})}) → ${summary}`);
          ws.send(JSON.stringify({
            type: 'client_tool_result',
            tool_call_id: call.tool_call_id,
            result: JSON.stringify(res),
            is_error: !res.ok,
          }));
          armQuiet();
        });
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }));
      }
      // Ignore: audio, user_transcript, interruption, internal_tentative_agent_response, etc.
    });

    ws.on('error', (e) => { if (!done) { done = true; clearTimeout(hardTimeout); reject(e); } });
    ws.on('close', () => { /* finish-on-quiet handles success */ });
  });
}

// ===== Assertions =====
function assert(cond, msg, results) {
  const ok = !!cond;
  results.push({ ok, msg });
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
}

// ===== Scripts =====
const SCRIPTS = {
  happy_path: {
    name: 'happy path: burger + fries + coke + finalize → kitchen',
    lines: [
      "Yeah, let me get a Big Mac, a large fries, and a medium Coke.",
      "That's it. My name is Ralph.",
      "Yes that's right.",
    ],
    validate(sim, results) {
      const ids = sim.toolCalls.map((t) => t.name);
      const adds = sim.toolCalls.filter((t) => t.name === 'add_item' && t.result.ok);
      const itemIds = adds.map((a) => a.params?.item_id);

      assert(adds.length >= 3, `at least 3 successful add_item calls (got ${adds.length})`, results);
      assert(itemIds.includes('big_mac'), 'big_mac added', results);
      assert(itemIds.includes('fries'), 'fries added', results);
      assert(itemIds.includes('coca_cola'), 'coca_cola added', results);

      const fries = adds.find((a) => a.params?.item_id === 'fries');
      assert(String(fries?.params?.size || '').toLowerCase() === 'large', `fries size = large (got "${fries?.params?.size}")`, results);
      const coke = adds.find((a) => a.params?.item_id === 'coca_cola');
      assert(String(coke?.params?.size || '').toLowerCase() === 'medium', `coke size = medium (got "${coke?.params?.size}")`, results);

      const name = sim.toolCalls.find((t) => t.name === 'set_customer_name');
      assert(name && /ralph/i.test(name.params?.name || ''), `customer name captured as Ralph (got "${name?.params?.name}")`, results);

      const lastGetOrder = ids.lastIndexOf('get_order');
      const lastFinal = ids.lastIndexOf('finalize_order');
      assert(lastGetOrder !== -1 && lastFinal > lastGetOrder, `get_order called before finalize_order`, results);

      const fin = sim.toolCalls.find((t) => t.name === 'finalize_order');
      assert(fin?.result?.ok, `finalize succeeded`, results);
      // Math: 6.39 + (2.39+1.90) + (1.69+0.50) = 12.87. Tax = 12.87 * 0.0875 = 1.126 → 1.13. Total = 14.00.
      assert(Math.abs((fin?.result?.subtotal ?? 0) - 12.87) < 0.02, `subtotal ≈ $12.87 (got $${fin?.result?.subtotal})`, results);
      assert(Math.abs((fin?.result?.total_with_tax ?? 0) - 14.00) < 0.05, `total ≈ $14.00 (got $${fin?.result?.total_with_tax})`, results);

      assert(sim.finalizedOrderId, `order POSTed to /api/orders (id: ${sim.finalizedOrderId})`, results);

      const leak = findStageDirection(sim.agentLines);
      assert(!leak, leak ? `no stage directions in speech (leaked "${leak.match}" in "${leak.line.slice(0, 80)}")` : 'no stage directions in speech', results);
    },
  },

  coupon_under_min: {
    name: 'coupon: TENOFF rejected below $15 minimum',
    lines: [
      "Hi, just a cheeseburger and a small fries please.",
      "Can I use the code TENOFF?",
      "Okay. That's all. My name is Lou.",
      "Yep that's right.",
    ],
    validate(sim, results) {
      const couponCall = sim.toolCalls.find((t) => t.name === 'apply_coupon');
      assert(couponCall, 'apply_coupon was called', results);
      // The apply succeeds attaching the coupon, but discount should be 0 because subtotal < $15
      const fin = sim.toolCalls.find((t) => t.name === 'finalize_order');
      assert(fin?.result?.ok, 'finalize succeeded', results);
      assert((fin?.result?.discount ?? -1) === 0, `discount = 0 below min (got $${fin?.result?.discount})`, results);

      const leak = findStageDirection(sim.agentLines);
      assert(!leak, leak ? `no stage directions in speech (leaked "${leak.match}" in "${leak.line.slice(0, 80)}")` : 'no stage directions in speech', results);
    },
  },
};

// ===== Main =====
async function cleanup(orderId) {
  if (!orderId) return;
  try {
    await fetch(`${SERVER}/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    });
  } catch {}
}

async function main() {
  const args = process.argv.slice(2);
  const wantScript = args.find((a) => a.startsWith('--script='))?.split('=')[1];
  const toRun = wantScript ? [SCRIPTS[wantScript]].filter(Boolean) : Object.values(SCRIPTS);
  if (toRun.length === 0) {
    console.error(`No matching script. Available: ${Object.keys(SCRIPTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Voice agent end-to-end test — ${toRun.length} script(s)`);

  let passed = 0, failed = 0;
  for (const script of toRun) {
    const startMs = Date.now();
    let sim, validateResults = [];
    try {
      ({ sim } = await runScript(script));
      console.log(`\nAssertions:`);
      script.validate(sim, validateResults);
      await cleanup(sim.finalizedOrderId);
    } catch (e) {
      console.error(`\n✗ Script "${script.name}" threw: ${e.message}`);
      validateResults.push({ ok: false, msg: `script threw: ${e.message}` });
    }
    for (const r of validateResults) (r.ok ? passed : failed, r.ok ? passed++ : failed++);
    console.log(`(${Math.round((Date.now() - startMs) / 1000)}s)`);
  }

  console.log(`\n========================================`);
  console.log(`Total: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
