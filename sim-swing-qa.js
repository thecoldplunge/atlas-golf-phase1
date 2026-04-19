#!/usr/bin/env node
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

function computeTempoMult({forwardMs, accelPxPerMs, powerPct}) {
  const overpowerPct = Math.max(0, powerPct - 100);
  let tempoMult = 1.0;
  let tempoTag = 'Normal';
  if (forwardMs < 85) {
    tempoMult = 1.55; tempoTag = 'Rushed';
  } else if (forwardMs <= 165) {
    tempoMult = 0.86; tempoTag = 'Perfect';
  } else if (forwardMs <= 240) {
    tempoMult = 1.0; tempoTag = 'Smooth';
  } else if (forwardMs <= 320) {
    tempoMult = 1.18; tempoTag = 'Slow';
  } else {
    tempoMult = 1.45; tempoTag = 'Frozen';
  }
  if (accelPxPerMs < 0.32) {
    tempoMult *= 1.24;
    tempoTag = tempoTag === 'Perfect' ? 'Decel' : tempoTag;
  } else if (accelPxPerMs > 1.05) {
    tempoMult *= 1.16;
    if (tempoTag === 'Normal' || tempoTag === 'Smooth') tempoTag = 'Snappy';
  }
  if (overpowerPct >= 20) tempoMult *= 1.42;
  else if (overpowerPct >= 10) tempoMult *= 1.22;
  return {tempoMult, tempoTag};
}

const cases = [
  {name:'Perfect stock', forwardMs:130, accelPxPerMs:0.55, powerPct:100},
  {name:'No pause / rushed', forwardMs:55, accelPxPerMs:0.95, powerPct:100},
  {name:'Long pause', forwardMs:380, accelPxPerMs:0.42, powerPct:100},
  {name:'Decelerated hit', forwardMs:150, accelPxPerMs:0.22, powerPct:100},
  {name:'Snappy yank', forwardMs:145, accelPxPerMs:1.2, powerPct:100},
  {name:'110% decent', forwardMs:145, accelPxPerMs:0.55, powerPct:110},
  {name:'110% rushed', forwardMs:75, accelPxPerMs:1.1, powerPct:110},
  {name:'120% decent', forwardMs:150, accelPxPerMs:0.56, powerPct:120},
  {name:'120% rushed', forwardMs:70, accelPxPerMs:1.15, powerPct:120},
  {name:'120% frozen', forwardMs:360, accelPxPerMs:0.28, powerPct:120},
];

console.log('Swing QA: stricter tempo + acceleration + overpower risk\n');
console.log('Case'.padEnd(18),'ms'.padStart(5),'accel'.padStart(7),'pwr'.padStart(5),'tag'.padStart(10),'mult'.padStart(8));
console.log('-'.repeat(60));
for (const c of cases) {
  const r = computeTempoMult(c);
  console.log(c.name.padEnd(18), String(c.forwardMs).padStart(5), String(c.accelPxPerMs.toFixed(2)).padStart(7), String(c.powerPct).padStart(5), r.tempoTag.padStart(10), r.tempoMult.toFixed(2).padStart(8));
}

console.log('\nChecks:');
const perfect = computeTempoMult(cases[0]).tempoMult;
const rushed = computeTempoMult(cases[1]).tempoMult;
const longPause = computeTempoMult(cases[2]).tempoMult;
const p110 = computeTempoMult(cases[5]).tempoMult;
const p120 = computeTempoMult(cases[7]).tempoMult;
const p120bad = computeTempoMult(cases[8]).tempoMult;
console.log('Perfect rewarded:', perfect < 1 ? 'PASS' : 'FAIL', perfect.toFixed(2));
console.log('Rushed penalized:', rushed > 1.3 ? 'PASS' : 'FAIL', rushed.toFixed(2));
console.log('Long pause penalized:', longPause > 1.3 ? 'PASS' : 'FAIL', longPause.toFixed(2));
console.log('110% stricter than stock:', p110 > perfect ? 'PASS' : 'FAIL', p110.toFixed(2));
console.log('120% stricter than 110%:', p120 > p110 ? 'PASS' : 'FAIL', p120.toFixed(2));
console.log('120% bad swing very high risk:', p120bad > 2.0 ? 'PASS' : 'FAIL', p120bad.toFixed(2));
