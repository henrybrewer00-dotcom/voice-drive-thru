// McDonald's-style menu. Prices are realistic (2026 USA averages, not
// official — varies by location). Item IDs are short and stable so the
// agent can pass them verbatim to tools.
//
// Sizes use canonical names: 'small' | 'medium' | 'large'. McNuggets use
// piece counts ('4 pc', '6 pc', '10 pc', '20 pc', '40 pc').

export const TAX_RATE = 0.0875;

export const COUPONS = {
  HAPPY: {
    code: 'HAPPY',
    name: 'Happy 10% Off',
    type: 'percent',
    value: 0.10,
    min_order: 0,
    description: '10% off your entire order. No minimum.',
  },
  TENOFF: {
    code: 'TENOFF',
    name: '$10 Off',
    type: 'flat',
    value: 10,
    min_order: 15,
    description: '$10 off your order — minimum $15 purchase.',
  },
};

// ===== Common customizations shared by many items =====
const BURGER_CUSTS = {
  'no onion': 0,
  'no pickles': 0,
  'no ketchup': 0,
  'no mustard': 0,
  'no cheese': 0,
  'no lettuce': 0,
  'no tomato': 0,
  'no big mac sauce': 0,
  'extra cheese': 1.0,
  'add bacon': 1.5,
  'plain': 0,
};

const CHICKEN_CUSTS = {
  'no mayo': 0,
  'no lettuce': 0,
  'no pickles': 0,
  'add bacon': 1.5,
  'add cheese': 1.0,
};

const NUGGET_SAUCES = {
  'tangy bbq': 0,
  'spicy buffalo': 0,
  'honey mustard': 0,
  'sweet & sour': 0,
  'creamy ranch': 0,
  'sweet chili': 0,
  'mighty hot': 0,
};

const SODA_SIZES = { small: 0, medium: 0.50, large: 1.00 };
const FRIES_SIZES = { small: 0, medium: 1.40, large: 1.90 };
const COFFEE_SIZES = { small: 0, medium: 0.50, large: 1.00 };
const SHAKE_SIZES = { small: 0, medium: 1.00, large: 1.50 };

// ===== Combo drink customizations (each combo's drink choice) =====
// Bare flavor names — no conflict with sides since combos don't allow side
// customizations beyond burger mods + the drink choice.
const COMBO_DRINKS = {
  'coke': 0, 'diet coke': 0, 'sprite': 0, 'dr pepper': 0,
  'hi-c': 0, 'sweet tea': 0, 'unsweet tea': 0, 'water': 0,
};

// Combo burger mods — pass-through to the underlying entree
const COMBO_BURGER_MODS = {
  'no onion': 0, 'no pickles': 0, 'no cheese': 0, 'no lettuce': 0,
  'extra cheese': 1.0, 'add bacon': 1.5,
};

// ===== MENU =====
export const MENU = [
  // -------------------- COMBO MEALS (entree + medium fries + medium drink) --------------------
  { id: 'big_mac_meal',          name: 'Big Mac Meal',                emoji: '🍔', category: 'Meals',     basePrice: 11.99,
    description: 'Big Mac + medium World Famous Fries + medium drink. Saves $0.58 vs à la carte.',
    customizations: { ...COMBO_DRINKS, ...COMBO_BURGER_MODS, 'no big mac sauce': 0, 'extra big mac sauce': 0 } },
  { id: 'quarter_pounder_meal',  name: 'Quarter Pounder Meal',        emoji: '🍔', category: 'Meals',     basePrice: 12.49,
    description: 'Quarter Pounder w/ Cheese + medium fries + medium drink.',
    customizations: { ...COMBO_DRINKS, ...COMBO_BURGER_MODS } },
  { id: 'mccrispy_meal',         name: 'McCrispy Meal',               emoji: '🥪', category: 'Meals',     basePrice: 10.99,
    description: 'McCrispy chicken sandwich + medium fries + medium drink.',
    customizations: { ...COMBO_DRINKS, 'no pickles': 0, 'no butter': 0, 'spicy': 0.20 } },
  { id: 'mcnuggets_meal',        name: '10pc McNuggets Meal',         emoji: '🍗', category: 'Meals',     basePrice: 11.99,
    description: '10 McNuggets + medium fries + medium drink + sauce.',
    customizations: { ...COMBO_DRINKS, ...NUGGET_SAUCES } },
  { id: 'filet_o_fish_meal',     name: 'Filet-O-Fish Meal',           emoji: '🐟', category: 'Meals',     basePrice: 10.99,
    description: 'Filet-O-Fish + medium fries + medium drink.',
    customizations: { ...COMBO_DRINKS, 'no cheese': 0, 'extra tartar': 0 } },

  // -------------------- BREAKFAST (until 10:30) --------------------
  { id: 'egg_mcmuffin',          name: 'Egg McMuffin',                emoji: '🥚', category: 'Breakfast', basePrice: 4.39,
    description: 'English muffin, Canadian bacon, egg, American cheese.',
    customizations: { 'no cheese': 0, 'no bacon': 0, 'add bacon': 1.5, 'no egg': 0 } },
  { id: 'sausage_mcmuffin',      name: 'Sausage McMuffin',            emoji: '🌭', category: 'Breakfast', basePrice: 2.79,
    description: 'English muffin with a sausage patty.',
    customizations: { 'add egg': 1.5, 'add cheese': 1.0 } },
  { id: 'sausage_mcmuffin_egg',  name: 'Sausage McMuffin w/ Egg',     emoji: '🍳', category: 'Breakfast', basePrice: 4.09,
    description: 'Sausage McMuffin with a folded egg.',
    customizations: { 'no cheese': 0, 'add bacon': 1.5 } },
  { id: 'sausage_biscuit',       name: 'Sausage Biscuit',             emoji: '🥯', category: 'Breakfast', basePrice: 2.79,
    description: 'Warm, buttery biscuit with a sausage patty.',
    customizations: { 'add egg': 1.5, 'add cheese': 1.0 } },
  { id: 'bacon_egg_cheese_biscuit', name: 'Bacon Egg & Cheese Biscuit', emoji: '🥓', category: 'Breakfast', basePrice: 4.99,
    description: 'Bacon, folded egg, American cheese on a biscuit.',
    customizations: { 'no cheese': 0, 'no bacon': 0 } },
  { id: 'mcgriddles_sausage',    name: 'Sausage McGriddles',          emoji: '🥞', category: 'Breakfast', basePrice: 3.89,
    description: 'Sausage between two maple-syrup griddle cakes.',
    customizations: { 'add egg': 1.5, 'add cheese': 1.0, 'add bacon': 1.5 } },
  { id: 'mcgriddles_bec',        name: 'Bacon Egg & Cheese McGriddles', emoji: '🥞', category: 'Breakfast', basePrice: 5.39,
    description: 'Bacon, egg, cheese between two maple griddle cakes.',
    customizations: { 'no cheese': 0, 'add sausage': 1.5 } },
  { id: 'hotcakes',              name: 'Hotcakes',                    emoji: '🥞', category: 'Breakfast', basePrice: 4.59,
    description: '3 fluffy hotcakes with syrup and butter.',
    customizations: { 'add sausage': 2.0, 'extra syrup': 0 } },
  { id: 'big_breakfast',         name: 'Big Breakfast',               emoji: '🍳', category: 'Breakfast', basePrice: 7.49,
    description: 'Sausage, scrambled eggs, hash brown, biscuit.',
    customizations: { 'add hotcakes': 2.0 } },
  { id: 'sausage_burrito',       name: 'Sausage Burrito',             emoji: '🌯', category: 'Breakfast', basePrice: 1.99,
    description: 'Tortilla wrap with sausage, eggs, cheese, peppers, onions.',
    customizations: { 'no onion': 0, 'no peppers': 0, 'add salsa': 0 } },
  { id: 'hash_brown',            name: 'Hash Brown',                  emoji: '🥔', category: 'Breakfast', basePrice: 1.99,
    description: 'Golden crispy hash brown patty.', customizations: {} },
  { id: 'oatmeal',               name: 'Fruit & Maple Oatmeal',       emoji: '🥣', category: 'Breakfast', basePrice: 4.49,
    description: 'Oatmeal with diced apples, cranberries, raisins.',
    customizations: { 'no fruit': 0, 'no raisins': 0 } },

  // -------------------- BURGERS --------------------
  { id: 'big_mac',               name: 'Big Mac',                     emoji: '🍔', category: 'Burgers',   basePrice: 6.39,
    description: 'Two beef patties, special sauce, lettuce, cheese, pickles, onions on a sesame bun.',
    customizations: { ...BURGER_CUSTS, 'extra big mac sauce': 0 } },
  { id: 'quarter_pounder',       name: 'Quarter Pounder w/ Cheese',   emoji: '🍔', category: 'Burgers',   basePrice: 6.89,
    description: 'Quarter-pound beef patty with cheese, slivered onions, pickles, ketchup, mustard.',
    customizations: BURGER_CUSTS },
  { id: 'double_quarter_pounder',name: 'Double Quarter Pounder',      emoji: '🍔', category: 'Burgers',   basePrice: 8.49,
    description: 'Two quarter-pound patties with cheese.',
    customizations: BURGER_CUSTS },
  { id: 'mcdouble',              name: 'McDouble',                    emoji: '🍔', category: 'Burgers',   basePrice: 4.19,
    description: 'Two beef patties with cheese, pickles, onion, ketchup, mustard.',
    customizations: BURGER_CUSTS },
  { id: 'cheeseburger',          name: 'Cheeseburger',                emoji: '🍔', category: 'Burgers',   basePrice: 2.89,
    description: 'Beef patty, cheese, pickles, onion, ketchup, mustard.',
    customizations: BURGER_CUSTS },
  { id: 'hamburger',             name: 'Hamburger',                   emoji: '🍔', category: 'Burgers',   basePrice: 2.49,
    description: 'Beef patty, pickles, onion, ketchup, mustard.',
    customizations: BURGER_CUSTS },

  // -------------------- CHICKEN & FISH --------------------
  { id: 'mccrispy',              name: 'McCrispy',                    emoji: '🥪', category: 'Chicken',   basePrice: 5.79,
    description: 'Crispy chicken filet, pickles, butter on a potato roll.',
    customizations: CHICKEN_CUSTS },
  { id: 'spicy_mccrispy',        name: 'Spicy McCrispy',              emoji: '🌶️', category: 'Chicken',   basePrice: 5.99,
    description: 'Spicy crispy chicken filet, pickles on a potato roll.',
    customizations: CHICKEN_CUSTS },
  { id: 'mcchicken',             name: 'McChicken',                   emoji: '🥪', category: 'Chicken',   basePrice: 3.39,
    description: 'Crispy chicken patty, mayo, lettuce on a toasted bun.',
    customizations: CHICKEN_CUSTS },
  { id: 'spicy_mcchicken',       name: 'Spicy McChicken',             emoji: '🌶️', category: 'Chicken',   basePrice: 3.39,
    description: 'Spicy crispy chicken patty, mayo, lettuce on a toasted bun.',
    customizations: CHICKEN_CUSTS },
  { id: 'filet_o_fish',          name: 'Filet-O-Fish',                emoji: '🐟', category: 'Chicken',   basePrice: 5.49,
    description: 'Fish filet, tartar sauce, melted cheese on a steamed bun.',
    customizations: { 'no cheese': 0, 'no tartar': 0, 'extra tartar': 0 } },
  { id: 'mcnuggets',             name: 'Chicken McNuggets',           emoji: '🍗', category: 'Chicken',   basePrice: 3.49,
    description: 'Tender chicken nuggets with your choice of sauce.',
    sizes: { '4 pc': 0, '6 pc': 1.50, '10 pc': 3.40, '20 pc': 8.50, '40 pc': 19.50 },
    customizations: NUGGET_SAUCES },

  // -------------------- SIDES --------------------
  { id: 'fries',                 name: 'World Famous Fries',          emoji: '🍟', category: 'Sides',     basePrice: 2.39,
    description: 'Golden, crispy, salted.',
    sizes: FRIES_SIZES, customizations: { 'no salt': 0, 'extra salt': 0 } },
  { id: 'apple_slices',          name: 'Apple Slices',                emoji: '🍎', category: 'Sides',     basePrice: 1.69,
    description: 'Crisp sliced apples.', customizations: {} },
  { id: 'side_salad',            name: 'Side Salad',                  emoji: '🥗', category: 'Sides',     basePrice: 3.49,
    description: 'Mixed greens with carrots.',
    customizations: { 'ranch dressing': 0, 'italian dressing': 0, 'no dressing': 0 } },

  // -------------------- HAPPY MEAL --------------------
  { id: 'happy_meal',            name: 'Happy Meal',                  emoji: '🎁', category: 'Happy Meal', basePrice: 5.99,
    description: 'Kid entree + small fries (or apple slices) + small drink + toy.',
    customizations: {
      'hamburger entree': 0, 'cheeseburger entree': 0, '4pc nuggets entree': 0, '6pc nuggets entree': 1.50,
      'apple slices side': 0, 'fries side': 0,
      'apple juice drink': 0, 'milk drink': 0, 'small soda drink': 0,
    } },

  // -------------------- SODA / SOFT DRINKS --------------------
  { id: 'coca_cola',             name: 'Coca-Cola',                   emoji: '🥤', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: 'Classic Coca-Cola.',
    customizations: { 'no ice': 0, 'light ice': 0, 'extra ice': 0 } },
  { id: 'diet_coke',             name: 'Diet Coke',                   emoji: '🥤', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: 'Diet Coca-Cola.',
    customizations: { 'no ice': 0, 'light ice': 0 } },
  { id: 'sprite',                name: 'Sprite',                      emoji: '🥤', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: 'Lemon-lime soda.',
    customizations: { 'no ice': 0, 'light ice': 0 } },
  { id: 'dr_pepper',             name: 'Dr Pepper',                   emoji: '🥤', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: '23 flavors.',
    customizations: { 'no ice': 0, 'light ice': 0 } },
  { id: 'hi_c',                  name: 'Hi-C Orange Lavaburst',       emoji: '🍊', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: 'Orange fruit drink.',
    customizations: { 'no ice': 0 } },
  { id: 'sweet_tea',             name: 'Sweet Tea',                   emoji: '🧋', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: 'Brewed sweet tea.',
    customizations: { 'no ice': 0 } },
  { id: 'iced_tea',              name: 'Unsweetened Iced Tea',        emoji: '🧋', category: 'Drinks',    basePrice: 1.69,
    sizes: SODA_SIZES, description: 'Freshly brewed, unsweetened.',
    customizations: { 'no ice': 0, 'add lemon': 0 } },
  { id: 'milk',                  name: 'Low-Fat Milk',                emoji: '🥛', category: 'Drinks',    basePrice: 1.99,
    description: '1% low-fat milk.', customizations: {} },
  { id: 'apple_juice',           name: 'Honest Kids Apple Juice',     emoji: '🧃', category: 'Drinks',    basePrice: 1.49,
    description: 'Organic apple juice pouch.', customizations: {} },
  { id: 'water',                 name: 'Dasani Water',                emoji: '💧', category: 'Drinks',    basePrice: 1.99,
    description: 'Bottled water.', customizations: {} },

  // -------------------- McCAFÉ --------------------
  { id: 'premium_coffee',        name: 'Premium Roast Coffee',        emoji: '☕', category: 'McCafé',     basePrice: 1.79,
    sizes: COFFEE_SIZES, description: 'Hot brewed coffee.',
    customizations: { 'cream': 0, 'sugar': 0, 'no cream': 0, 'no sugar': 0, 'sweetener': 0, 'decaf': 0 } },
  { id: 'iced_coffee',           name: 'Iced Coffee',                 emoji: '🧊', category: 'McCafé',     basePrice: 2.49,
    sizes: COFFEE_SIZES, description: 'Iced coffee, lightly sweetened.',
    customizations: { 'vanilla': 0, 'caramel': 0, 'hazelnut': 0, 'sugar-free vanilla': 0, 'cream': 0, 'no sugar': 0 } },
  { id: 'hot_chocolate',         name: 'Hot Chocolate',               emoji: '🍫', category: 'McCafé',     basePrice: 2.79,
    sizes: COFFEE_SIZES, description: 'Hot chocolate with whipped topping.',
    customizations: { 'no whipped': 0, 'extra whipped': 0 } },
  { id: 'caramel_latte',         name: 'Caramel Latte',               emoji: '☕', category: 'McCafé',     basePrice: 3.99,
    sizes: COFFEE_SIZES, description: 'Espresso, steamed milk, caramel.',
    customizations: { 'no whipped': 0, 'decaf': 0, 'extra shot': 1.0, 'oat milk': 0.75, 'almond milk': 0.75 } },
  { id: 'mocha',                 name: 'Mocha',                       emoji: '☕', category: 'McCafé',     basePrice: 3.99,
    sizes: COFFEE_SIZES, description: 'Espresso, chocolate, steamed milk, whipped.',
    customizations: { 'no whipped': 0, 'decaf': 0, 'extra shot': 1.0, 'oat milk': 0.75 } },
  { id: 'cappuccino',            name: 'Cappuccino',                  emoji: '☕', category: 'McCafé',     basePrice: 3.59,
    sizes: COFFEE_SIZES, description: 'Espresso, steamed milk, foam.',
    customizations: { 'decaf': 0, 'extra shot': 1.0, 'oat milk': 0.75 } },
  { id: 'americano',             name: 'Americano',                   emoji: '☕', category: 'McCafé',     basePrice: 2.99,
    sizes: COFFEE_SIZES, description: 'Espresso shots with hot water.',
    customizations: { 'decaf': 0, 'extra shot': 1.0 } },
  { id: 'frappe_caramel',        name: 'Caramel Frappé',              emoji: '🥤', category: 'McCafé',     basePrice: 3.99,
    sizes: SHAKE_SIZES, description: 'Blended caramel coffee with whipped cream.',
    customizations: { 'no whipped': 0, 'extra caramel': 0 } },
  { id: 'frappe_mocha',          name: 'Mocha Frappé',                emoji: '🥤', category: 'McCafé',     basePrice: 3.99,
    sizes: SHAKE_SIZES, description: 'Blended mocha coffee with whipped cream.',
    customizations: { 'no whipped': 0, 'extra chocolate': 0 } },
  { id: 'smoothie',              name: 'Real Fruit Smoothie',         emoji: '🍓', category: 'McCafé',     basePrice: 3.49,
    sizes: SHAKE_SIZES,
    description: 'Strawberry-banana or mango-pineapple.',
    customizations: { 'strawberry banana': 0, 'mango pineapple': 0 } },

  // -------------------- DESSERTS / SHAKES --------------------
  { id: 'shake',                 name: 'Shake',                       emoji: '🥤', category: 'Desserts',  basePrice: 3.99,
    sizes: SHAKE_SIZES, description: 'Hand-spun shake with whipped topping and a cherry.',
    customizations: { 'vanilla': 0, 'chocolate': 0, 'strawberry': 0, 'no whipped': 0, 'no cherry': 0 } },
  { id: 'mcflurry_oreo',         name: 'Oreo McFlurry',               emoji: '🍦', category: 'Desserts',  basePrice: 4.49,
    sizes: { snack: 0, regular: 0.80 }, description: 'Vanilla soft serve blended with Oreo cookies.',
    customizations: { 'extra oreo': 0.50 } },
  { id: 'mcflurry_mm',           name: 'M&M McFlurry',                emoji: '🍦', category: 'Desserts',  basePrice: 4.49,
    sizes: { snack: 0, regular: 0.80 }, description: 'Vanilla soft serve blended with M&Ms.',
    customizations: { 'extra m&ms': 0.50 } },
  { id: 'sundae_hot_fudge',      name: 'Hot Fudge Sundae',            emoji: '🍨', category: 'Desserts',  basePrice: 2.99,
    description: 'Vanilla soft serve with hot fudge and nuts.',
    customizations: { 'no nuts': 0, 'no whipped': 0 } },
  { id: 'sundae_caramel',        name: 'Hot Caramel Sundae',          emoji: '🍨', category: 'Desserts',  basePrice: 2.99,
    description: 'Vanilla soft serve with hot caramel and nuts.',
    customizations: { 'no nuts': 0 } },
  { id: 'cone',                  name: 'Vanilla Cone',                emoji: '🍦', category: 'Desserts',  basePrice: 1.49,
    description: 'Soft serve vanilla cone.', customizations: {} },
  { id: 'apple_pie',             name: 'Baked Apple Pie',             emoji: '🥧', category: 'Desserts',  basePrice: 1.79,
    description: 'Warm cinnamon-spiced apple pie.', customizations: {} },
  { id: 'cookie',                name: 'Chocolate Chip Cookie',       emoji: '🍪', category: 'Desserts',  basePrice: 0.99,
    description: 'Soft-baked chocolate chip cookie.',
    customizations: { '3-pack': 2.00 } },
];

// ===== helpers =====

export function findItem(id) {
  return MENU.find((m) => m.id === id);
}

// Compact menu reference for the system prompt — name, id, price.
// Customizations + sizes are listed once per category to save tokens.
export function menuForPrompt() {
  const byCat = {};
  for (const item of MENU) {
    if (!byCat[item.category]) byCat[item.category] = [];
    byCat[item.category].push(item);
  }
  let out = '';
  for (const [cat, items] of Object.entries(byCat)) {
    out += `\n${cat.toUpperCase()}\n`;
    for (const it of items) {
      let line = `  ${it.name} [${it.id}] — $${it.basePrice.toFixed(2)}`;
      if (it.sizes) {
        const sizes = Object.entries(it.sizes).map(([k, v]) => v > 0 ? `${k}+$${v.toFixed(2)}` : k).join('/');
        line += ` (sizes: ${sizes})`;
      }
      const custKeys = Object.keys(it.customizations || {});
      if (custKeys.length && custKeys.length <= 5) {
        line += `  custs: ${custKeys.join(', ')}`;
      } else if (custKeys.length > 5) {
        line += `  custs: ${custKeys.slice(0, 5).join(', ')}, +${custKeys.length - 5} more`;
      }
      out += line + '\n';
    }
  }
  return out.trim();
}

// Returns the full list of allowed customization strings for an item id
// (case-insensitive lookup).
export function allowedCustomizations(item_id) {
  const it = findItem(item_id);
  return it ? Object.keys(it.customizations || {}) : [];
}
