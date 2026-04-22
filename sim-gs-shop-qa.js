#!/usr/bin/env node
// QA for v0.77 pro shop: catalog shape + buy/equip/wallet flow +
// club v-mult application + hex-shade helpers.

const TILE = 16;

// Inline copy of the hex helpers to QA them directly.
function _hexParse(hex) {
  const s = (hex || '').replace('#', '');
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return [isFinite(r) ? r : 0, isFinite(g) ? g : 0, isFinite(b) ? b : 0];
}
function _hexFmt(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function darkenHex(hex, amt) { const [r, g, b] = _hexParse(hex); return _hexFmt(r * (1 - amt), g * (1 - amt), b * (1 - amt)); }
function lightenHex(hex, amt) { const [r, g, b] = _hexParse(hex); return _hexFmt(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt); }

// Simulated buy/equip handlers mirroring the React state transitions.
function buy(state, it) {
  if (state.wallet < it.price) return state;
  const wallet = state.wallet - it.price;
  const ownedItems = state.ownedItems.includes(it.id) ? state.ownedItems : [...state.ownedItems, it.id];
  const equipped = state.equipped[it.kind] ? state.equipped : { ...state.equipped, [it.kind]: it.id };
  return { wallet, ownedItems, equipped };
}
function equip(state, it) {
  return { ...state, equipped: { ...state.equipped, [it.kind]: it.id } };
}

// Mirror of the CLUBS-upgrade effect.
function applyClubUpgrade(baseline, equipped, catalog) {
  const out = baseline.map((c) => ({ ...c }));
  const id = equipped && equipped.clubs;
  if (!id) return out;
  const item = catalog.find((x) => x.id === id);
  const upg = item && item.upgrade;
  if (!upg) return out;
  const idx = out.findIndex((c) => c.key === upg.key);
  if (idx < 0) return out;
  out[idx].v = baseline[idx].v * (upg.vMul || 1);
  return out;
}

const CATALOG = [
  { id: 'shirt_white', kind: 'shirts', name: 'White Polo', price: 5,  color: '#f0ece0' },
  { id: 'shirt_blue',  kind: 'shirts', name: 'Blue Polo',  price: 8,  color: '#3f76c1' },
  { id: 'hat_white',   kind: 'hats',   name: 'White Cap',  price: 3,  color: '#e8e2d4' },
  { id: 'club_pro_dr', kind: 'clubs',  name: 'Pro Driver', price: 40, upgrade: { key: 'DR', vMul: 1.08 } },
];

const assert = (ok, msg, actual) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);
  if (!ok) process.exitCode = 1;
};

console.log('v0.77 pro shop QA\n');

// --- Starting state -----------------------------------------------------
let state = { wallet: 10, ownedItems: [], equipped: { shirts: null, pants: null, hats: null, clubs: null } };
assert(state.wallet === 10, `starting wallet is $10`, state.wallet);
assert(state.ownedItems.length === 0, `no owned items on start`, state.ownedItems.length);
assert(state.equipped.shirts === null, `no equipped shirt on start`, state.equipped.shirts);

// --- Buy a white polo ($5) ---------------------------------------------
state = buy(state, CATALOG[0]);
assert(state.wallet === 5, `wallet deducted after buy`, state.wallet);
assert(state.ownedItems.includes('shirt_white'), `item added to owned list`, state.ownedItems.join(','));
assert(state.equipped.shirts === 'shirt_white', `newly-bought shirt auto-equips`, state.equipped.shirts);

// --- Buy a blue polo with only $5 (price $8) → rejected ---------------
state = buy(state, CATALOG[1]);
assert(state.wallet === 5, `insufficient funds blocks purchase`, state.wallet);
assert(!state.ownedItems.includes('shirt_blue'), `blue polo NOT owned when unaffordable`, state.ownedItems.join(','));

// --- Buy a hat ($3) ----------------------------------------------------
state = buy(state, CATALOG[2]);
assert(state.wallet === 2, `hat purchase deducts $3`, state.wallet);
assert(state.equipped.hats === 'hat_white', `hat auto-equips`, state.equipped.hats);

// --- Try to buy a $40 driver with only $2 → rejected -----------------
state = buy(state, CATALOG[3]);
assert(state.wallet === 2, `driver unaffordable`, state.wallet);
assert(state.equipped.clubs === null, `clubs remain unequipped`, String(state.equipped.clubs));

// --- Give the wallet enough and buy the driver ------------------------
state.wallet = 100;
state = buy(state, CATALOG[3]);
assert(state.wallet === 60, `wallet=$60 after $40 driver`, state.wallet);
assert(state.equipped.clubs === 'club_pro_dr', `driver auto-equipped`, state.equipped.clubs);

// --- Club v-mult applies to matching CLUBS key ------------------------
const BASELINE_CLUBS = [
  { key: 'DR', v: 209 },
  { key: '5W', v: 176 },
  { key: '7I', v: 137 },
  { key: 'PT', v: 110 },
];
let clubs = applyClubUpgrade(BASELINE_CLUBS, state.equipped, CATALOG);
const dr = clubs.find((c) => c.key === 'DR');
assert(Math.abs(dr.v - 209 * 1.08) < 1e-6, `DR v scaled by 1.08 when pro driver equipped`, dr.v.toFixed(2));
// Other clubs untouched.
const p5w = clubs.find((c) => c.key === '5W');
assert(p5w.v === 176, `5W v unchanged when only DR set equipped`, p5w.v);

// --- Unequip restores baseline ----------------------------------------
state.equipped.clubs = null;
clubs = applyClubUpgrade(BASELINE_CLUBS, state.equipped, CATALOG);
const drRestored = clubs.find((c) => c.key === 'DR');
assert(drRestored.v === 209, `unequipping restores DR baseline`, drRestored.v);

// --- Equip something already owned doesn't cost money -----------------
const beforeEquipWallet = state.wallet;
state = equip(state, CATALOG[0]);
assert(state.wallet === beforeEquipWallet, `equip doesn't charge`, state.wallet);

// --- Hex shade helpers --------------------------------------------------
assert(darkenHex('#ffffff', 0.5) === '#808080', `darken white 50%`, darkenHex('#ffffff', 0.5));
assert(lightenHex('#000000', 0.5) === '#808080', `lighten black 50%`, lightenHex('#000000', 0.5));
assert(darkenHex('#3f76c1', 0.3) === _hexFmt(63 * 0.7, 118 * 0.7, 193 * 0.7),
  `darken arbitrary colour`, darkenHex('#3f76c1', 0.3));
