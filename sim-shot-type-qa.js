#!/usr/bin/env node
// QA for the shot-type system added in v3.40. Mirrors the profiles and
// eligibility rules in App.js so we can lock the expected behavior.

const SHOT_TYPE_PROFILES = {
  normal:  { carry: 1.0,  apex: 1.0,  spinBonus: 0,    label: 'Normal' },
  chip:    { carry: 0.5,  apex: 0.7,  spinBonus: 0,    label: 'Chip' },
  flop:    { carry: 0.33, apex: 2.0,  spinBonus: 0.25, label: 'Flop' },
  stinger: { carry: 1.0,  apex: 0.5,  spinBonus: -0.25, label: 'Stinger' },
  bump:    { carry: 0.75, apex: 0.4,  spinBonus: -0.15, label: 'Bump & Run' },
};

const WEDGE_KEYS = new Set(['LW', 'SW', 'GW', 'PW']);
const clubIsWedge = (club) => !!club && WEDGE_KEYS.has(club.key);
const clubIsIronOrWood = (club) => !!club && club.key !== 'PT' && !WEDGE_KEYS.has(club.key);
const GOOD_LIES_FOR_STINGER = new Set(['tee', 'fairway', 'secondCut']);

function shotTypeEligible(type, club, lie) {
  if (!club || club.key === 'PT') return type === 'normal';
  if (type === 'normal') return true;
  if (type === 'chip')   return true;
  if (type === 'flop')   return clubIsWedge(club);
  if (type === 'bump')   return clubIsWedge(club);
  if (type === 'stinger') return clubIsIronOrWood(club) && GOOD_LIES_FOR_STINGER.has(lie);
  return false;
}

const clubs = {
  PT: { key: 'PT' }, LW: { key: 'LW' }, SW: { key: 'SW' },
  GW: { key: 'GW' }, PW: { key: 'PW' }, '7I': { key: '7I' },
  DR: { key: 'DR' }, '3W': { key: '3W' },
};

const assert = (ok, msg, actual) =>
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}  (${actual})`);

console.log('=== Eligibility matrix ===\n');
for (const [cname, club] of Object.entries(clubs)) {
  const lies = ['tee', 'fairway', 'rough', 'sand', 'green'];
  console.log(`  ${cname.padEnd(3)} | ` + ['normal','chip','flop','stinger','bump']
    .map((t) => `${t}=${lies.map((l) => shotTypeEligible(t, club, l) ? 'Y' : '.').join('')}`)
    .join('  '));
}

console.log('\n=== Profile multipliers ===\n');
for (const [key, prof] of Object.entries(SHOT_TYPE_PROFILES)) {
  const carryOf250 = Math.round(250 * prof.carry);
  const apexPct = Math.round(prof.apex * 100);
  console.log(`  ${key.padEnd(8)} label="${prof.label}"  250yd club → ${carryOf250}yd carry, ${apexPct}% apex`);
}

console.log('\n=== Assertions ===');

// User requirements:
assert(SHOT_TYPE_PROFILES.chip.carry === 0.5, 'Chip halves carry', SHOT_TYPE_PROFILES.chip.carry);
assert(SHOT_TYPE_PROFILES.flop.carry === 0.33, 'Flop = 33% carry', SHOT_TYPE_PROFILES.flop.carry);
assert(SHOT_TYPE_PROFILES.flop.apex === 2.0, 'Flop = 200% apex', SHOT_TYPE_PROFILES.flop.apex);
assert(SHOT_TYPE_PROFILES.stinger.apex === 0.5, 'Stinger = 50% apex', SHOT_TYPE_PROFILES.stinger.apex);
assert(SHOT_TYPE_PROFILES.bump.apex === 0.4, 'Bump & Run = 40% apex', SHOT_TYPE_PROFILES.bump.apex);

// Eligibility user requirements:
assert(shotTypeEligible('stinger', clubs['7I'], 'fairway'), 'Stinger allowed: iron + fairway', 'yes');
assert(shotTypeEligible('stinger', clubs['7I'], 'tee'), 'Stinger allowed: iron + tee', 'yes');
assert(!shotTypeEligible('stinger', clubs['7I'], 'rough'), 'Stinger blocked: iron + rough', 'blocked');
assert(!shotTypeEligible('stinger', clubs.PW, 'fairway'), 'Stinger blocked: wedge', 'blocked');
assert(shotTypeEligible('stinger', clubs.DR, 'fairway'), 'Stinger allowed: driver + fairway', 'yes');

assert(shotTypeEligible('bump', clubs.PW, 'rough'), 'Bump & Run allowed: wedge, any lie', 'yes');
assert(!shotTypeEligible('bump', clubs['7I'], 'fairway'), 'Bump & Run blocked: iron', 'blocked');

assert(shotTypeEligible('flop', clubs.LW, 'rough'), 'Flop allowed: wedge, any lie', 'yes');
assert(!shotTypeEligible('flop', clubs.DR, 'tee'), 'Flop blocked: driver', 'blocked');

assert(shotTypeEligible('chip', clubs['7I'], 'rough'), 'Chip allowed: iron anywhere', 'yes');
assert(shotTypeEligible('chip', clubs.PW, 'sand'), 'Chip allowed: wedge anywhere', 'yes');
assert(!shotTypeEligible('chip', clubs.PT, 'green'), 'Chip blocked on putter', 'blocked');
