/* =====================================================================
 * Fellowship S3 BiS Gear Planner — Planning Engine (v2, owned-item driven)
 * ---------------------------------------------------------------------
 * Model (confirmed with the user):
 *  - A modifier slot's CATEGORY comes from the drop and cannot be changed
 *    cheaply. Cheap reforges only re-roll the exact mod WITHIN its category.
 *  - Legendary Souldust is used ONLY on the 3rd slot of a fully-free item
 *    (no fixed mod). Anywhere else a category mismatch = "no usable item,
 *    drop & re-farm". Never souldust on set/weapon/relic/necklace, never on
 *    a free item's 1st slot.
 *  - DUPLICATABLE ("pair") slots — 12: slots 2-3 of every non-necklace set
 *    piece + weapon + relics, and slots 1-2 of the 2 free items. Each holds
 *    2x the SAME mod (roll one, flood the duplicate on rarity upgrade).
 *    => use a pair for every mod you need an EVEN number of times.
 *  - SOLO slots — 8: 3 on gear (the set necklace's one free slot + each free
 *    item's random 3rd slot) and 5 on the weapon tree (1 major, 2 distinct
 *    heroic, 2 distinct defensive — free to roll, traits only).
 *  - If you need more solos than fit, you CANNOT build "two different mod
 *    types on one fixed-first item" by upgrading (upgrade always duplicates
 *    the type) — you must DROP a naturally-Regal set/weapon/relic that already
 *    carries 2 different mod-types. Each such drop covers 2 solos of 2
 *    different categories and consumes one pair slot.
 *  - Planning is slot-agnostic: owned items are matched to needs BY CATEGORY,
 *    steered to a useful end state at the cheapest Mark cost, then subtracted
 *    from the desired list to reveal what is left to farm.
 * ===================================================================== */
(function (global) {
  'use strict';
  const G = global.GAME;
  const NEXT = { Common: 'Uncommon', Uncommon: 'Rare', Rare: 'Epic', Epic: 'Heroic', Heroic: 'Regal', Regal: 'Legendary' };
  const Rx = r => G.RARITY_INDEX[r];
  const step = (text, marks, souldust) => ({ text, marks: marks || 0, souldust: souldust || 0 });
  const marksToHitName = cat => G.POOL_SIZE[cat] * G.COST.randomize;
  const lbl = c => G.CATEGORIES[c].label;
  const TRAIT_CATS = ['major', 'heroic', 'defensive'];

  /* ---------- capacity from slot roles --------------------------- */
  function capacity(loadout) {
    let nonNeckSets = 0, freeItems = 0, relics = 0, weapon = 0, legendary = 0, necklace = false;
    G.SLOTS.forEach(slot => {
      const role = roleOf(loadout, slot);
      if (slot === 'Weapon') weapon = 1;
      else if (role === 'relic') relics++;
      else if (role === 'legendary') legendary++;
      else if (role === 'free') freeItems++;
      else if (slot === 'Necklace') necklace = true;
      else nonNeckSets++;
    });
    const pairSlots = nonNeckSets + weapon + relics + freeItems;   // duplicatable slots
    const gearSolos = (necklace ? 1 : 0) + freeItems;              // necklace + free slot3
    return { pairSlots, gearSolos, freeItems, relics, weapon, nonNeckSets, necklace, legendary };
  }

  /* ---------- weapon trait tree (absorbs odd trait solos) -------- */
  // The tree gives +1 free rank to 1 major / 2 distinct heroic / 2 distinct
  // defensive. Auto: spend those ranks on ODD-count traits so their leftover
  // single is satisfied for free (turning e.g. 3 -> 1 clean pair).
  function weaponTree(req, explicit) {
    const cap = { major: 1, heroic: 2, defensive: 2 };
    const chosen = { major: [], heroic: [], defensive: [] };
    if (explicit) {
      chosen.major = explicit.major ? [explicit.major] : [];
      chosen.heroic = (explicit.heroic || []).filter(Boolean).slice(0, 2);
      chosen.defensive = (explicit.defensive || []).filter(Boolean).slice(0, 2);
    } else {
      TRAIT_CATS.forEach(cat => {
        req.filter(r => r.category === cat && r.ranks > 0 && r.ranks % 2 === 1)
          .sort((a, b) => b.ranks - a.ranks)
          .forEach(r => { if (chosen[cat].length < cap[cat]) chosen[cat].push(r.name); });
      });
    }
    const absorb = {};
    chosen.major.forEach(n => (absorb['major::' + n] = 1));
    chosen.heroic.forEach(n => (absorb['heroic::' + n] = 1));
    chosen.defensive.forEach(n => (absorb['defensive::' + n] = 1));
    return { major: chosen.major[0] || null, heroic: chosen.heroic, defensive: chosen.defensive, absorb };
  }

  /* ---------- demand: pairs + solos (after weapon tree) ---------- */
  function buildDemand(state) {
    const req = (state.bis.requirements || []).filter(r => r.name && r.ranks > 0);
    const wt = weaponTree(req, state.bis.weaponTree);
    const pairs = {}, solos = {};
    req.forEach(r => {
      const key = r.category + '::' + r.name;
      const k = r.ranks - (wt.absorb[key] || 0);
      if (k <= 0) return;
      if (Math.floor(k / 2) > 0) pairs[key] = Math.floor(k / 2);
      if (k % 2) solos[key] = 1;
    });
    return { wt, pairs, solos, req };
  }

  const split = key => { const i = key.indexOf('::'); return [key.slice(0, i), key.slice(i + 2)]; };

  /* ---------- abstract solo placement & double-solo overflow ----- */
  function placeSolos(soloKeys, cap) {
    // soloKeys: array of "cat::name" (already excludes weapon-tree ones)
    const solos = soloKeys.map(k => { const [category, name] = split(k); return { category, name }; });
    const gear = solos.slice(0, cap.gearSolos);                 // up to 3 on gear, any category
    const overflow = solos.slice(cap.gearSolos);                // must use natural double-solo drops
    // pair overflow solos across DIFFERENT categories to minimise drops
    const byCat = {};
    overflow.forEach(s => (byCat[s.category] = byCat[s.category] || []).push(s));
    const cats = Object.keys(byCat);
    const pairsOut = []; let guard = 0;
    while (cats.some(c => byCat[c].length) && guard++ < 100) {
      const avail = cats.filter(c => byCat[c].length).sort((a, b) => byCat[b].length - byCat[a].length);
      if (avail.length >= 2) pairsOut.push([byCat[avail[0]].pop(), byCat[avail[1]].pop()]);
      else pairsOut.push([byCat[avail[0]].pop(), null]);        // lone solo: 2nd type is filler
    }
    return { gear, overflow, doubleSoloItems: pairsOut.length, doubleSoloPairs: pairsOut };
  }

  /* ---------- per-item step generation (progress aware) ---------- */
  function upgradeSteps(fromRarity, toRarity, push) {
    let r = fromRarity, marks = 0;
    while (Rx(r) < Rx(toRarity)) { const nx = NEXT[r]; push(step(`Upgrade ${r} → ${nx}`, G.COST.upgradeRarity)); marks += G.COST.upgradeRarity; r = nx; }
    return marks;
  }

  // Build a PAIR (2x `name` of `category`) on item with first customizable
  // slot already of `category`. floodAt = rarity whose upgrade duplicates it.
  function pairSteps(item, role, category, name, floodAt) {
    const steps = []; let marks = 0;
    const push = s => steps.push(s);
    let cur = item ? item.rarity : null;
    const slotLabel = role === 'free' ? '1st mod' : '2nd slot';
    if (!item) { push(step(`Farm a ${role === 'free' ? 'free ' + 'item' : role} whose ${slotLabel} is a ${lbl(category)}`)); cur = role === 'free' ? 'Rare' : 'Epic'; }
    const baseR = role === 'free' ? 'Rare' : 'Epic';
    if (Rx(cur) < Rx(baseR)) marks += upgradeSteps(cur, baseR, push), cur = baseR;
    const have = item && item.mods[0];
    if (have && have.name === name) push(step(`✓ ${slotLabel} already ${name}`));
    else { push(step(`Reroll ${lbl(category)} until ${slotLabel} = ${name} (≈${G.POOL_SIZE[category]} rolls)`, marksToHitName(category))); marks += marksToHitName(category); }
    // duplicate via flood
    const dupIdx = role === 'free' ? 1 : 1;          // free: mods[1]; set/wpn/relic: mods[1] (slot3)
    if (Rx(cur) < Rx(floodAt)) { marks += upgradeSteps(cur, floodAt, push); cur = floodAt; push(step(`${floodAt} upgrade floods the duplicate → 2× ${name}`)); }
    else if (item && item.mods[dupIdx] && item.mods[dupIdx].name === name) push(step(`✓ duplicate already present`));
    else push(step(`Make the duplicate slot ${name} (flooded on the ${floodAt} upgrade)`));
    return { steps, marks, done: steps.every(s => s.text.startsWith('✓')) };
  }

  // Free item's 3rd slot solo (souldust-able).
  function freeSoloSteps(item, category, name, alreadyRegal) {
    const steps = []; let marks = 0, souldust = 0;
    if (!alreadyRegal) {
      marks += upgradeSteps(item ? maxR(item.rarity, 'Epic') : 'Epic', 'Regal', s => steps.push(s));
      steps.push(step(`3rd mod is RANDOM. If it is ${lbl(category)}: reroll to ${name}. ` +
        `Else Reroll-Slot-3 (Legendary Souldust) until ${lbl(category)}, then reroll to ${name}.`, marksToHitName(category), 1));
      marks += marksToHitName(category); souldust += 1;
    } else {
      const c2 = item.mods[2];
      if (c2 && c2.name === name) steps.push(step(`✓ 3rd mod already ${name}`));
      else if (c2 && c2.category === category) { steps.push(step(`Reroll ${lbl(category)} until 3rd mod = ${name} (≈${G.POOL_SIZE[category]} rolls)`, marksToHitName(category))); marks += marksToHitName(category); }
      else { steps.push(step(`3rd mod is ${c2 ? lbl(c2.category) : 'empty'}, need ${lbl(category)} — Reroll-Slot-3 (Legendary Souldust) to ${lbl(category)}, then reroll to ${name}`, marksToHitName(category), 1)); marks += marksToHitName(category); souldust += 1; }
    }
    return { steps, marks, souldust };
  }
  const maxR = (a, b) => (Rx(a) >= Rx(b) ? a : b);

  // Necklace solo (slot 3, no souldust — category farmed).
  function necklaceSoloSteps(item, category, name) {
    const steps = []; let marks = 0;
    let cur = item ? item.rarity : 'Rare';
    if (!item) steps.push(step(`Farm a set Necklace whose free (3rd) mod is a ${lbl(category)}`));
    if (Rx(cur) < Rx('Regal')) { marks += upgradeSteps(cur, 'Regal', s => steps.push(s)); cur = 'Regal'; }
    const have = item && item.mods[0];
    if (have && have.name === name) steps.push(step(`✓ 3rd mod already ${name}`));
    else { steps.push(step(`Reroll ${lbl(category)} until 3rd mod = ${name} (≈${G.POOL_SIZE[category]} rolls)`, marksToHitName(category))); marks += marksToHitName(category); }
    return { steps, marks, done: steps.every(s => s.text.startsWith('✓')) };
  }

  /* ---------- owned-item matching (greedy cheapest) -------------- */
  function roleOf(loadout, slot) { return G.FIXED_ROLE[slot] || ((loadout && loadout.slotRoles) || {})[slot] || 'set'; }

  function assess(state, loadout, demand, cap) {
    // mutable demand pools
    const pairPool = {};  Object.keys(demand.pairs).forEach(k => (pairPool[k] = demand.pairs[k]));
    const soloPool = {};  Object.keys(demand.solos).forEach(k => (soloPool[k] = demand.solos[k]));
    const catPairKeys = c => Object.keys(pairPool).filter(k => split(k)[0] === c && pairPool[k] > 0);
    const catSoloKeys = c => Object.keys(soloPool).filter(k => split(k)[0] === c && soloPool[k] > 0);

    // candidate matches: {item, kind, key(s), cost}
    const cands = [];
    (state.inventory || []).forEach((item, idx) => {
      const role = roleOf(loadout, item.slot);
      const m0 = item.mods[0], m1 = item.mods[1];
      if (role === 'free') {
        if (!m0) return;                              // need 1st mod to know its category
        catPairKeys(m0.category).forEach(key => {
          const [, name] = split(key);
          const cost = (m0.name === name ? 0 : marksToHitName(m0.category)) + (Rx(item.rarity) < Rx('Epic') ? G.COST.upgradeRarity * (Rx('Epic') - Rx(item.rarity)) : 0);
          cands.push({ idx, item, role, kind: 'free-pair', key, cost });
        });
      } else if (role === 'set' && item.slot === 'Necklace') {
        if (!m0) return;
        catSoloKeys(m0.category).forEach(key => {
          const [, name] = split(key);
          const cost = (m0.name === name ? 0 : marksToHitName(m0.category)) + Math.max(0, Rx('Regal') - Rx(item.rarity)) * G.COST.upgradeRarity;
          cands.push({ idx, item, role, kind: 'neck-solo', key, cost });
        });
      } else { // set (non-neck) / weapon / relic
        if (m0 && m1 && m0.category !== m1.category && Rx(item.rarity) >= Rx('Regal')) {
          // natural double-solo: two solos of two different categories
          const k2 = catSoloKeys(m0.category)[0], k3 = catSoloKeys(m1.category)[0];
          if (k2 && k3) {
            const cost = (m0.name === split(k2)[1] ? 0 : marksToHitName(m0.category)) + (m1.name === split(k3)[1] ? 0 : marksToHitName(m1.category));
            cands.push({ idx, item, role, kind: 'double-solo', key: k2, key2: k3, cost });
          }
        }
        if (m0) catPairKeys(m0.category).forEach(key => {
          const [, name] = split(key);
          const cost = (m0.name === name ? 0 : marksToHitName(m0.category)) + Math.max(0, Rx('Regal') - Rx(item.rarity)) * G.COST.upgradeRarity;
          cands.push({ idx, item, role, kind: 'pair', key, cost });
        });
      }
    });

    cands.sort((a, b) => a.cost - b.cost);
    const usedItem = new Set();
    const plans = [];
    cands.forEach(c => {
      if (usedItem.has(c.idx)) return;
      if (c.kind === 'double-solo') {
        if (!(soloPool[c.key] > 0 && soloPool[c.key2] > 0)) return;
        soloPool[c.key]--; soloPool[c.key2]--; usedItem.add(c.idx);
        const [cat2, n2] = split(c.key), [cat3, n3] = split(c.key2);
        const steps = [];
        const a0 = c.item.mods[0], a1 = c.item.mods[1];
        if (a0.name === n2) steps.push(step(`✓ slot 2 already ${n2}`)); else steps.push(step(`Reroll ${lbl(cat2)} → ${n2} (≈${G.POOL_SIZE[cat2]} rolls)`, marksToHitName(cat2)));
        if (a1.name === n3) steps.push(step(`✓ slot 3 already ${n3}`)); else steps.push(step(`Reroll ${lbl(cat3)} → ${n3} (≈${G.POOL_SIZE[cat3]} rolls)`, marksToHitName(cat3)));
        const marks = steps.reduce((s, x) => s + x.marks, 0);
        plans.push({ slot: c.item.slot, role: c.role, use: 'double-solo', item: c.item, contributes: [{ category: cat2, name: n2 }, { category: cat3, name: n3 }], steps, marks, souldust: 0, done: steps.every(s => s.text.startsWith('✓')) });
        return;
      }
      if (!(pairPool[c.key] > 0 || soloPool[c.key] > 0)) return;
      const [cat, name] = split(c.key);
      if (c.kind === 'free-pair') {
        if (!(pairPool[c.key] > 0)) return;
        pairPool[c.key]--; usedItem.add(c.idx);
        const r = pairSteps(c.item, 'free', cat, name, 'Epic');
        const contributes = [{ category: cat, name }, { category: cat, name }];
        // This free item's 3rd slot may host a remaining solo — but only if it
        // is already Regal (so we don't force a souldust gamble on an Epic one)
        // and we prefer the solo that matches what's already in slot 3.
        let souldust = 0, marks = r.marks; const steps = r.steps.slice();
        let soloKey = null;
        if (Rx(c.item.rarity) >= Rx('Regal') && c.item.mods[2]) {
          const s3 = c.item.mods[2];
          soloKey = (soloPool[s3.category + '::' + s3.name] > 0 && s3.category + '::' + s3.name)
            || Object.keys(soloPool).find(k => soloPool[k] > 0 && split(k)[0] === s3.category) || null;
        }
        if (soloKey) {
          soloPool[soloKey]--; const [sc, sn] = split(soloKey);
          const fs = freeSoloSteps(c.item, sc, sn, true);
          fs.steps.forEach(s => steps.push(s)); marks += fs.marks; souldust += fs.souldust;
          contributes.push({ category: sc, name: sn });
        }
        plans.push({ slot: c.item.slot, role: 'free', use: soloKey ? 'pair+solo' : 'pair', item: c.item, contributes, steps, marks, souldust, done: steps.every(s => s.text.startsWith('✓')) });
        return;
      }
      if (c.kind === 'pair') {
        if (!(pairPool[c.key] > 0)) return;
        pairPool[c.key]--; usedItem.add(c.idx);
        const r = pairSteps(c.item, c.role, cat, name, 'Regal');
        plans.push({ slot: c.item.slot, role: c.role, use: 'pair', item: c.item, contributes: [{ category: cat, name }, { category: cat, name }], steps: r.steps, marks: r.marks, souldust: 0, done: r.done });
        return;
      }
      if (c.kind === 'neck-solo') {
        if (!(soloPool[c.key] > 0)) return;
        soloPool[c.key]--; usedItem.add(c.idx);
        const r = necklaceSoloSteps(c.item, cat, name);
        plans.push({ slot: c.item.slot, role: c.role, use: 'solo', item: c.item, contributes: [{ category: cat, name }], steps: r.steps, marks: r.marks, souldust: 0, done: r.done });
        return;
      }
    });

    // owned items that matched nothing -> drop / re-attempt
    (state.inventory || []).forEach((item, idx) => {
      if (usedItem.has(idx)) return;
      const role = roleOf(loadout, item.slot);
      const m0 = item.mods[0];
      const where = role === 'free' ? '1st mod' : (item.slot === 'Necklace' ? '3rd mod' : '2nd slot');
      const revealAt = role === 'free' ? 'Rare' : (item.slot === 'Necklace' ? 'Regal' : 'Epic');
      const dropReason = !m0
        ? `No customizable mod yet — upgrade to ${revealAt} to reveal its ${where} category, then re-check.`
        : `Its ${lbl(m0.category)} (${where}) doesn't match anything still needed — drop & re-attempt, or keep for another build.`;
      plans.push({ slot: item.slot, role, use: 'drop', item, contributes: [], steps: [], marks: 0, souldust: 0, dropReason });
    });

    return { plans, pairPool, soloPool };
  }

  /* ---------- top-level solve ------------------------------------ */
  function solve(state, loadout) {
    loadout = loadout || { slotRoles: (state.bis && state.bis.slotRoles) || {}, setOfSlot: (state.bis && state.bis.setOfSlot) || {} };
    const cap = capacity(loadout);
    const demand = buildDemand(state);
    const pairTotal = Object.values(demand.pairs).reduce((a, b) => a + b, 0);
    const soloKeysAll = []; Object.keys(demand.solos).forEach(k => { for (let i = 0; i < demand.solos[k]; i++) soloKeysAll.push(k); });
    const soloPlacement = placeSolos(soloKeysAll, cap);

    const pairSlotsNeeded = pairTotal + soloPlacement.doubleSoloItems;
    const issues = [];
    if (pairSlotsNeeded > cap.pairSlots) issues.push(`Needs ${pairSlotsNeeded} duplicatable/­double-solo items but only ${cap.pairSlots} exist (over budget by ${pairSlotsNeeded - cap.pairSlots}).`);

    const { plans, pairPool, soloPool } = assess(state, loadout, demand, cap);

    // remaining demand after owned items
    const remPairs = Object.keys(pairPool).filter(k => pairPool[k] > 0).map(k => { const [category, name] = split(k); return { category, name, count: pairPool[k] }; });
    const remSolos = []; Object.keys(soloPool).forEach(k => { for (let i = 0; i < soloPool[k]; i++) { const [category, name] = split(k); remSolos.push({ category, name }); } });
    const remSoloPlacement = placeSolos(remSolos.map(s => s.category + '::' + s.name), cap);

    const ownedPlans = plans.filter(p => p.use !== 'drop');
    const drops = plans.filter(p => p.use === 'drop');
    const totals = ownedPlans.reduce((t, p) => ({ marks: t.marks + p.marks, souldust: t.souldust + p.souldust }), { marks: 0, souldust: 0 });

    // ---- souldust accounting (only free-item 3rd slots ever use it) ----
    const necklaceSolo = cap.necklace ? 1 : 0;
    const souldustNeed = Math.max(0, Math.min(soloKeysAll.length, cap.gearSolos) - necklaceSolo);
    const souldustOwned = (state.settings && state.settings.souldustOwned) || 0;

    // ---- the full worn loadout: 13 gear items (everything but the legendary) ----
    const remPairsList = []; remPairs.forEach(p => { for (let i = 0; i < p.count; i++) remPairsList.push({ category: p.category, name: p.name }); });
    const remSolosList = remSolos.slice();
    const ownedByRole = { necklace: [], free: [], weapon: [], relic: [], set: [] };
    ownedPlans.forEach(p => { const k = (p.role === 'set' && p.slot === 'Necklace') ? 'necklace' : p.role; (ownedByRole[k] = ownedByRole[k] || []).push(p); });
    const sheet = [], spares = [];
    function fillRows(typeLabel, role, n, isFree, isNeck) {
      const arr = ownedByRole[role] || [];
      for (let i = 0; i < n; i++) {
        if (arr[i]) { sheet.push({ type: typeLabel, role, source: 'owned', plan: arr[i], carries: arr[i].contributes, isFree, isNeck }); continue; }
        const carries = [];
        if (isNeck) { if (remSolosList.length) carries.push({ ...remSolosList.shift(), kind: 'solo' }); }
        else {
          if (remPairsList.length) { const p = remPairsList.shift(); carries.push({ category: p.category, name: p.name, kind: 'pair' }); }
          if (isFree && remSolosList.length) carries.push({ ...remSolosList.shift(), kind: 'solo' });
        }
        sheet.push({ type: typeLabel, role, source: carries.length ? 'farm' : 'filler', carries, isFree, isNeck });
      }
      for (let i = n; i < arr.length; i++) spares.push(arr[i]);   // owned beyond wearable count
    }
    fillRows('Necklace', 'necklace', necklaceSolo, false, true);
    fillRows('Free item', 'free', cap.freeItems, true, false);
    fillRows('Weapon', 'weapon', cap.weapon, false, false);
    fillRows('Relic', 'relic', cap.relics, false, false);
    fillRows('Set piece', 'set', cap.nonNeckSets, false, false);

    const feasible = issues.length === 0;
    const wt = demand.wt;
    const gearSolosUsed = Math.min(soloKeysAll.length, cap.gearSolos);
    const freeCapacity = {
      pairs: Math.max(0, cap.pairSlots - pairSlotsNeeded),
      gearSolos: Math.max(0, cap.gearSolos - gearSolosUsed),
      weaponTree: { major: 1 - (wt.major ? 1 : 0), heroic: 2 - wt.heroic.length, defensive: 2 - wt.defensive.length }
    };
    return {
      feasible, issues, weaponTree: wt, capacity: cap, loadout, freeCapacity,
      demand: { pairs: demand.pairs, solos: demand.solos, pairTotal, soloTotal: soloKeysAll.length },
      soloPlacement, pairSlotsNeeded, souldustOwned, souldustNeed,
      ownedPlans, drops, spares, totals, sheet,
      farmRows: sheet.filter(x => x.source === 'farm').length,
      ownedRows: sheet.filter(x => x.source === 'owned').length,
      remaining: { pairs: remPairs, solos: remSolos, doubleSoloItems: remSoloPlacement.doubleSoloItems, doubleSoloPairs: remSoloPlacement.doubleSoloPairs }
    };
  }

  /* ---------- dungeon farming plan (per loadout) ----------------- */
  // Which physical gear slots still need a base, and from which dungeons,
  // ranked by how many missing pieces a dungeon can supply.
  function dungeonPlan(state, loadout, result) {
    const setOfSlot = (loadout && loadout.setOfSlot) || {};
    const setDungeon = {}; (state.sets || []).forEach(s => (setDungeon[s.name] = s.dungeon || null));
    const slotDungeons = state.slotDungeons || {};
    const covered = new Set(result.ownedPlans.map(p => p.slot));
    const missing = [];                // {slot, role, dungeons:[...]|'anywhere'}
    G.SLOTS.forEach(slot => {
      const role = roleOf(loadout, slot);
      if (role === 'legendary') return;            // always worn, not farmed
      if (covered.has(slot)) return;
      let dungeons;
      if (role === 'weapon' || role === 'relic') dungeons = 'anywhere';
      else if (role === 'set') { const d = setDungeon[setOfSlot[slot]]; dungeons = d ? [d] : []; }
      else dungeons = (slotDungeons[slot] || []).slice();      // free / off-piece
      missing.push({ slot, role, dungeons });
    });
    // rank dungeons by how many missing pieces they can supply
    const counts = {};
    missing.forEach(m => { if (Array.isArray(m.dungeons)) m.dungeons.forEach(d => (counts[d] = counts[d] || []).push(m.slot)); });
    const ranked = Object.keys(counts).map(d => ({ dungeon: d, slots: counts[d] }))
      .sort((a, b) => b.slots.length - a.slots.length || a.dungeon.localeCompare(b.dungeon));
    const anywhere = missing.filter(m => m.dungeons === 'anywhere').map(m => m.slot);
    const unknown = missing.filter(m => Array.isArray(m.dungeons) && !m.dungeons.length).map(m => m.slot);
    return { missing, ranked, anywhere, unknown, missingCount: missing.length };
  }

  // Decision trees for free items that still need building (or owned ones).
  function freeItemTrees(state, demand) {
    // illustrate a generic free-item pair+solo build for each distinct
    // (pairCategory, soloCategory) still in demand — capped at 2.
    const pairCats = [...new Set(Object.keys(demand.pairs).map(k => split(k)[0]))];
    const soloCats = [...new Set(Object.keys(demand.solos).map(k => split(k)[0]))];
    const out = [];
    for (let i = 0; i < Math.min(2, pairCats.length); i++) {
      const A = pairCats[i];
      const aName = split(Object.keys(demand.pairs).find(k => split(k)[0] === A))[1];
      const B = soloCats[i] || null;
      const bName = B ? split(Object.keys(demand.solos).find(k => split(k)[0] === B))[1] : null;
      out.push({
        title: `Free item · 2× ${aName}` + (bName ? ` + ${bName}` : ''),
        nodes: [
          { t: `Drop/keep a Rare free item whose 1st mod is a ${lbl(A)}` },
          { t: `Reroll ${lbl(A)} → ${aName}  (≈${G.POOL_SIZE[A] * G.COST.randomize} marks)` },
          { t: `Upgrade → Epic : floods 2× ${aName}` },
          ...(B ? [
            { t: `Upgrade → Heroic → Regal : 3rd mod is RANDOM category` },
            { t: `3rd mod = ${lbl(B)}`, ok: true, children: [{ t: `Reroll → ${bName}.  ✔ DONE` }] },
            { t: `3rd mod ≠ ${lbl(B)}`, warn: true, children: [{ t: `Reroll-Slot-3 (Legendary Souldust) → ${lbl(B)}, then reroll → ${bName}` }, { t: `(no souldust? drop & re-attempt)` }] }
          ] : [{ t: `✔ DONE (pair only)` }])
        ]
      });
    }
    return out;
  }

  global.Engine = { solve, buildDemand, freeItemTrees, capacity, weaponTree, marksToHitName, dungeonPlan, roleOf };
})(typeof window !== 'undefined' ? window : globalThis);
