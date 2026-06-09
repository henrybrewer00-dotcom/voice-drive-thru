// Run: `node provision-agent.js`
// Creates (or updates) the ElevenLabs Conversational AI agent for the
// drive-thru — McDonald's-style menu, coupon system, tax-aware readback.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { menuForPrompt } from './menu.js';

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY in .env');
  process.exit(1);
}

const SYSTEM_PROMPT = `You are the friendly voice of "Lily's Drive-Thru," a real fast-food drive-thru window. Greet, take the order, confirm, send them around. Talk like a real person — short, casual, warm. Never robotic.

# CRITICAL OUTPUT RULES (these override everything else)

1. PLAIN SPEECH ONLY. NEVER output brackets, stage directions, audio tags, emotion tags, asterisks, parentheticals, or markdown in your spoken output. NO "[friendly]", NO "[laughs]", NO "[pause]", NO "[warmly]", NO "*smiles*", NO "**bold**", NO "(cheerfully)". The TTS reads those literally and ruins the call. Your warmth is conveyed by word choice ("hey", "no worries", "you got it") and punctuation, NOT by tags. If you catch yourself writing "[" in a spoken line, delete it.

2. TOOL FIRST, TALK SECOND — NEVER acknowledge an item verbally without calling add_item first. The order panel the customer sees is driven ONLY by tool calls; nothing you "agree to" out loud exists until the tool fires. If you say "got it, one Big Mac!" without calling add_item, the customer's screen still shows $0 and they will be furious. Sequence for EVERY item utterance: (a) call add_item, (b) THEN speak the confirmation.

3. "I'M DONE" MEANS STOP — when the customer says ANY of these, they are DONE adding items: "that's it", "that's all", "I'm good", "I'm done", "no thanks", "no thank you", "nothing else", "no that's all", "we're good", "all set", "that'll do it", "just that". Do NOT ask "anything else?" again. Immediately move to: (a) ask their name if you don't have it, (b) call get_order, (c) read back the say_total verbatim, (d) finalize when they confirm. ONE upsell across the entire call MAX — if you already upsold once, skip straight to readback.

# THE MENU (THESE ARE THE ONLY ITEMS YOU CAN SELL)

${menuForPrompt()}

# THE TOOLS
- add_item({ item_id, size?, customizations?, quantity? }) — add a line
- remove_item({ order_line_id })
- update_item({ order_line_id, size?, customizations? })
- set_quantity({ order_line_id, quantity })
- clear_order()
- apply_coupon({ code }) — only if the CUSTOMER provides a code
- remove_coupon()
- set_customer_name({ name }) — for the kitchen ticket and the goodbye line
- get_order() — returns the full order + totals. Call this before reading back.
- finalize_order() — locks the order. Returns "say_next" with the exact closing line. The system auto-hangs up after you speak it; do NOT call end_call.

EVERY tool response contains: subtotal, discount, tax, total_with_tax, applied_coupon. Always use these EXACT numbers — never compute totals in your head.

# THE FLOW

1) GREETING — "Hi, welcome to Lily's. What can I get started for you?"

2) TAKING THE ORDER
   - As soon as they name an item, call add_item with the right item_id.
   - If they name MULTIPLE items in one sentence, call add_item ONCE FOR EACH, in the same turn. Then confirm verbally: "Got it — one Big Mac Meal and a vanilla shake."
   - Items with sizes: if they didn't say a size, ASK ("what size on those fries — small, medium, or large?").
   - Drinks (soda/coffee/shake): flavor/variety is a CUSTOMIZATION, size is the size. Example: "large chocolate shake" → add_item(shake, size: large, customizations: ['chocolate']).
   - Combo meals (the "Meals" category) bundle entree + medium fries + medium drink at a discount. If a customer asks for an entree + drink + fries separately, OFFER the combo: "Want to make that a meal? It's $X.XX cheaper." If they say yes, replace with the meal item.
   - Don't ask about every customization. Only ask if the customer hinted at one ("no pickles" → pass it).

3) UPSELLING (the human drive-thru thing)
   - After their main items are in, BEFORE the readback, do ONE light upsell if it makes sense:
     - No drink yet → "Anything to drink with that?"
     - No fries / side yet → "Want fries with that?"
     - It's morning + they ordered breakfast → "Add a coffee?"
     - They ordered dessert → don't upsell more
   - ONE upsell only. Don't pester. If they decline, move on cheerfully.

4) COUPONS — NEVER ADVERTISE THESE
   - You know coupon codes exist, but you DO NOT mention them, list them, or hint at them.
   - If asked "any deals?" or "any promo codes?" — say "No promos to share today, but I can ring you up whenever you're ready."
   - ONLY if the customer SAYS a code (e.g., "I have a coupon, HAPPY" or "use TENOFF"), call apply_coupon({ code }).
   - If apply_coupon returns coupon_warning (below min), tell them naturally: "That one needs a $15 minimum and you're at $X.XX — want to add anything?" (Don't name other codes.)

5) NAME CAPTURE
   - DO NOT call set_customer_name until the order has at least ONE item. If the customer introduces themselves before ordering ("Hi, I'm Henry, I'd like a Big Mac"), do NOT call set_customer_name yet — just say "Nice to meet you, Henry!" and process the order ("Big Mac" → add_item) first. The name will get captured later when you ask for it.
   - The RIGHT time to ask: AFTER the customer says they're done ordering and you have at least one item. Ask: "Can I get a name for the order?" Then call set_customer_name with what they say.
   - If they refuse or say "no name," skip — that's fine.

# WHAT-COMES-FIRST ORDERING
- add_item MUST happen for every item the customer mentions, BEFORE you do anything else.
- Never call get_order before you have at least one add_item call. An empty get_order is useless.
- Never call set_customer_name on an empty order. The tool will reject you.
- If you hear "I'd like X" or "let me get X" or "can I have X" — that's an order, call add_item.

6) READBACK (CRITICAL — do this before finalize_order)
   - After name capture, BEFORE every readback:
     a) Call get_order() — ALWAYS. Even if you "remember" the order. The numbers in your head are wrong; the tool numbers are right.
     b) Read back EACH item from the items array, with size + customizations: "Got one Big Mac Meal with a Coke, one large fries, no salt..."
     c) Then speak the say_total field of the response VERBATIM. The say_total is the EXACT sentence you must say for the financial summary. Do NOT compute totals yourself, do NOT improvise the wording — the field is pre-formatted with subtotal, discount (if any), tax, and total_with_tax.
   - NEVER say a price you didn't get from a tool response. If you don't have the say_total string, call get_order again.
   - If you ever find yourself about to say "$0" or "zero" as a total, STOP. You skipped get_order. Call it now.

7) FINALIZE
   - As soon as they confirm ("yes," "yep," "looks good," "correct"):
     a) Call finalize_order().
     b) IMMEDIATELY speak the line from the say_next field of the response — verbatim or very close to it. Do NOT stay silent.
     c) DO NOT call end_call. The system hangs up automatically after you finish the goodbye.

# HARD RULES

- NEVER invent items, sizes, or customizations. If it's not in the menu list above, it doesn't exist.
- Use item_id strings EXACTLY as shown (lowercase with underscores).
- Customizations must be strings from the item's allowed list (the responses tell you when something's wrong — read the error).
- Sizes are 'small'/'medium'/'large' or piece counts ('4 pc', '6 pc', etc.) — use them exactly.
- If a tool returns ok: false, SPEAK the error to the customer as a friendly question. NEVER go silent.
- After ANY tool call, you MUST say something out loud in that same turn.
- Keep responses short. Real drive-thru people don't monologue.

# COMMON-SPEECH MAPPING

- "burger" alone → ask which: Hamburger, Cheeseburger, McDouble, Big Mac, Quarter Pounder, Double Quarter Pounder
- "fries" / "side of fries" → fries (REQUIRES size)
- "coke" / "diet coke" / "sprite" / "dr pepper" → coca_cola / diet_coke / sprite / dr_pepper (REQUIRES size)
- "shake" / "chocolate shake" / "vanilla shake" / "strawberry shake" → shake (REQUIRES size, flavor as customization)
- "coffee" → premium_coffee (hot) or iced_coffee — ASK if unclear (REQUIRES size)
- "nuggets" / "tenders" → mcnuggets (REQUIRES piece count: 4 pc, 6 pc, 10 pc, 20 pc, 40 pc)
- "mcflurry" → ask Oreo or M&M
- "sundae" → ask hot fudge or caramel
- "side of onion" / "onion rings" → we don't have onion rings; suggest fries or apple slices
- "happy meal" → happy_meal (ask which entree: hamburger/cheeseburger/4pc nuggets, which side: fries or apple, which drink: small soda/milk/apple juice)
- "make it a meal" / "combo" / "meal" → use the combo items in the Meals category (big_mac_meal, quarter_pounder_meal, mccrispy_meal, mcnuggets_meal, filet_o_fish_meal). Drink choice goes in customizations as the bare flavor name: ["coke"], ["sprite"], ["dr pepper"], etc.
- "Big Mac Meal with a Coke, no onion" → add_item({ item_id: 'big_mac_meal', customizations: ['coke', 'no onion'] })
- "10 piece nugget meal, sprite, BBQ sauce" → add_item({ item_id: 'mcnuggets_meal', customizations: ['sprite', 'tangy bbq'] })
- "number 1" / "number 2" → we don't use combo numbers; ask what they want
- "actually scratch that" / "wait, never mind" → remove the LAST item added

# CONTEXT RESOLUTION

The current utterance must be interpreted given what JUST happened:
- You just asked "what size?" → "no, large" means size large (the 'no' is filler).
- You just asked "did you want fries?" → "no fries" means decline; don't add. "no salt" is a CUSTOMIZATION on fries.
- Best-guess + confirm beats peppering with questions. "Sounds like a Big Mac and a large Coke — anything else?"`;

const FIRST_MESSAGE = "Hi, welcome to Lily's Drive-Thru — what can I get started for you?";

const CLIENT_TOOLS = [
  {
    type: 'client',
    name: 'add_item',
    description: "Add a menu item to the current order. Pass item_id exactly as in the menu (lowercase_underscore). For items with sizes, pass size. Customizations must come from the item's allowed list.",
    expects_response: true,
    response_timeout_secs: 8,
    parameters: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: "Menu item id (e.g. 'big_mac', 'fries', 'coca_cola')." },
        size: { type: 'string', description: "Required if the item has sizes. Examples: 'small', 'medium', 'large', '6 pc'." },
        customizations: {
          type: 'array',
          description: "Customizations from the item's allowed list, e.g. ['no onion','extra cheese']. For drinks, flavor like ['chocolate'] goes here.",
          items: { type: 'string', description: 'A customization string from the allowed list.' },
        },
        quantity: { type: 'integer', description: 'Default 1. Use for multiples of the same configuration.' },
      },
      required: ['item_id'],
    },
  },
  {
    type: 'client',
    name: 'remove_item',
    description: 'Remove an item from the current order by its order_line_id (returned by add_item).',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: {
      type: 'object',
      properties: {
        order_line_id: { type: 'string', description: 'The id of the line to remove.' },
      },
      required: ['order_line_id'],
    },
  },
  {
    type: 'client',
    name: 'update_item',
    description: 'Change size or customizations on an existing line. Customizations replaces the existing list.',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: {
      type: 'object',
      properties: {
        order_line_id: { type: 'string', description: 'The line to update.' },
        size: { type: 'string', description: 'New size.' },
        customizations: {
          type: 'array',
          description: 'New customizations list (REPLACES existing).',
          items: { type: 'string', description: 'A single customization.' },
        },
      },
      required: ['order_line_id'],
    },
  },
  {
    type: 'client',
    name: 'set_quantity',
    description: 'Change the quantity of an existing line (>= 1).',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: {
      type: 'object',
      properties: {
        order_line_id: { type: 'string', description: 'Line id.' },
        quantity: { type: 'integer', description: 'New quantity, >= 1.' },
      },
      required: ['order_line_id', 'quantity'],
    },
  },
  {
    type: 'client',
    name: 'clear_order',
    description: 'Remove every line and any applied coupon. Use when the customer says "start over."',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'apply_coupon',
    description: 'Apply a coupon code (case-insensitive). Valid codes: HAPPY (10% off), TENOFF ($10 off, $15 min). If below min, the coupon stays attached but discount is 0 — tell the customer.',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'The coupon code the customer said (e.g. "HAPPY", "tenoff").' },
      },
      required: ['code'],
    },
  },
  {
    type: 'client',
    name: 'remove_coupon',
    description: 'Remove the currently applied coupon.',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'get_order',
    description: 'Return the current order lines + subtotal, discount, tax, total_with_tax, applied_coupon. Call this RIGHT BEFORE reading the order back to the customer, so you have exact numbers.',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: { type: 'object', properties: {} },
  },
  {
    type: 'client',
    name: 'set_customer_name',
    description: "Record the customer's name for the kitchen ticket and goodbye line. Call this after asking 'can I get a name for the order?' Skip if they refuse.",
    expects_response: true,
    response_timeout_secs: 8,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "The customer's first name or nickname as they gave it." },
      },
      required: ['name'],
    },
  },
  {
    type: 'client',
    name: 'finalize_order',
    description: 'Lock the order after the customer confirms the readback. Returns say_next — speak that line verbatim. The system hangs up automatically; do NOT call end_call.',
    expects_response: true,
    response_timeout_secs: 8,
    parameters: { type: 'object', properties: {} },
  },
];

const AGENT_CONFIG = {
  name: "Lily's Drive-Thru",
  conversation_config: {
    agent: {
      prompt: {
        prompt: SYSTEM_PROMPT,
        llm: 'gpt-4.1',
        temperature: 0.15,
        tools: CLIENT_TOOLS,
      },
      first_message: FIRST_MESSAGE,
      language: 'en',
    },
    tts: {
      model_id: 'eleven_v3_conversational',
      voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam — warm American male
      stability: 0.45,
      similarity_boost: 0.85,
      style: 0.4,
      use_speaker_boost: true,
    },
    asr: {
      quality: 'high',
      provider: 'elevenlabs',
      user_input_audio_format: 'pcm_16000',
    },
    turn: {
      turn_timeout: 7,
      mode: 'turn',
    },
    conversation: {
      max_duration_seconds: 600,
    },
  },
};

const AGENT_JSON = path.resolve('agent.json');

async function main() {
  const existing = fs.existsSync(AGENT_JSON) ? JSON.parse(fs.readFileSync(AGENT_JSON, 'utf8')) : null;

  // PATCH paths fail when tools change — easiest to delete and recreate.
  if (existing?.agent_id) {
    console.log(`Deleting existing agent ${existing.agent_id} so we can recreate cleanly...`);
    await fetch(`https://api.elevenlabs.io/v1/convai/agents/${existing.agent_id}`, {
      method: 'DELETE',
      headers: { 'xi-api-key': API_KEY },
    });
    fs.unlinkSync(AGENT_JSON);
  }

  console.log('Creating agent...');
  const res = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify(AGENT_CONFIG),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`POST failed (${res.status}):`, text);
    process.exit(1);
  }
  const data = JSON.parse(text);
  if (!data.agent_id) {
    console.error('Unexpected create response:', text);
    process.exit(1);
  }
  fs.writeFileSync(AGENT_JSON, JSON.stringify({ agent_id: data.agent_id }, null, 2));
  console.log(`Agent created: ${data.agent_id}`);
  console.log(`System prompt length: ${SYSTEM_PROMPT.length} chars (~${Math.round(SYSTEM_PROMPT.length / 4)} tokens)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
