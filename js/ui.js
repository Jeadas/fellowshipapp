/* =====================================================================
 * Fellowship S3 BiS Gear Planner — UI / wiring
 * ===================================================================== */
(function () {
  'use strict';
  const G = window.GAME, Engine = window.Engine;
  const KEY = 'fellowship-bis-v1';

  /* ---------- tiny DOM helper ------------------------------------ */
  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(c => n.appendChild(typeof c === 'string'
      ? document.createTextNode(c) : c));
    return n;
  }
  const $ = s => document.querySelector(s);
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function opt(v, label, sel) { const o = el('option', { value: v }, [label || v]); if (sel) o.selected = true; return o; }
  function catTag(cat, text) { return el('span', { class: 'tag ' + cat }, [text || G.CATEGORIES[cat].label]); }

  /* ---------- state --------------------------------------------- */
  function defaultRoles() {
    const r = {}; G.ASSIGNABLE_SLOTS.forEach(s => (r[s] = 'set'));
    r['Cloak'] = 'free'; r['Ring1'] = 'free'; r['Ring2'] = 'legendary';
    return r;
  }
  function defaultState() {
    return {
      bis: {
        requirements: [
          { category: 'blessing', name: 'The Wayfarer', ranks: 4 },
          { category: 'blessing', name: 'The Trickster', ranks: 4 },
          { category: 'blessing', name: 'The Subduer', ranks: 3 },
          { category: 'blessing', name: 'The Monarch', ranks: 1 },
          { category: 'major', name: 'Brave Machinations', ranks: 4 },
          { category: 'major', name: 'Emerald Judgement', ranks: 2 },
          { category: 'major', name: 'Visions of Grandeur', ranks: 1 },
          { category: 'heroic', name: "Hunter's Focus", ranks: 4 },
          { category: 'gem', name: 'Amethyst', ranks: 2 },
          { category: 'stat', name: 'Haste', ranks: 2 }
        ],
        weaponTree: null   // null => auto
      },
      loadouts: [{ name: 'Loadout 1', slotRoles: defaultRoles(),
        setOfSlot: { Head: 'Draconic Might', Shoulders: 'Draconic Might', Hands: 'Draconic Might', Legs: 'Draconic Might', Chest: 'Seal of Heskyr', Feet: 'Seal of Heskyr', Necklace: 'Seal of Heskyr', Wrists: 'Seal of Heskyr' },
        slotDungeons: { Head: ['Grove'], Shoulders: ['Grove'], Hands: ['Grove'], Legs: ['Grove'], Chest: ['Sands'], Feet: ['Sands'], Necklace: ['Ruins'], Wrists: ['Ruins'], Cloak: ['Grove', 'Urrak'], Ring1: ['Grove'] } }],
      activeLoadout: 0,
      sets: G.SEED_SETS.map(s => ({ name: s.name })),
      dungeons: G.SEED_DUNGEONS.slice(),
      inventory: [],
      settings: { souldustOwned: 0 }
    };
  }

  // upgrade older saved states (single config -> loadouts, sets -> dungeons)
  function migrate(s) {
    if (!s || !s.bis) return defaultState();
    if (!Array.isArray(s.loadouts) || !s.loadouts.length) {
      s.loadouts = [{ name: 'Loadout 1', slotRoles: (s.bis.slotRoles) || defaultRoles(), setOfSlot: s.bis.setOfSlot || {} }];
    }
    s.loadouts.forEach(L => { L.slotRoles = L.slotRoles || defaultRoles(); L.setOfSlot = L.setOfSlot || {}; });
    if (s.activeLoadout == null || s.activeLoadout >= s.loadouts.length) s.activeLoadout = 0;
    if (!Array.isArray(s.sets)) s.sets = (s.bis.sets || G.SEED_SETS).map(x => ({ name: x.name }));
    if (!Array.isArray(s.dungeons) || !s.dungeons.length) s.dungeons = G.SEED_DUNGEONS.slice();
    // dungeon sources now live per-slot IN each loadout; seed from old set/global data
    const oldSetDungeons = {}; (s.sets || []).forEach(x => { const d = x.dungeons || (x.dungeon ? [x.dungeon] : []); if (d.length) oldSetDungeons[x.name] = d; });
    s.loadouts.forEach(L => {
      L.slotDungeons = L.slotDungeons || {};
      G.SLOTS.forEach(slot => {
        if (L.slotDungeons[slot]) return;
        const role = G.FIXED_ROLE[slot] || L.slotRoles[slot] || 'set';
        if (role === 'free' && s.slotDungeons && s.slotDungeons[slot]) L.slotDungeons[slot] = s.slotDungeons[slot].slice();
        else if (role === 'set' && oldSetDungeons[L.setOfSlot[slot]]) L.slotDungeons[slot] = oldSetDungeons[L.setOfSlot[slot]].slice();
      });
    });
    s.sets.forEach(x => { delete x.dungeons; delete x.dungeon; });
    delete s.slotDungeons;
    if (!s.settings) s.settings = { souldustOwned: 0 };
    delete s.bis.slotRoles; delete s.bis.setOfSlot; delete s.bis.sets;
    return s;
  }

  let state = migrate(load() || defaultState());
  const lo = () => state.loadouts[state.activeLoadout] || state.loadouts[0];

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { /* private mode / quota — keep working in-memory this session */
      const n = document.getElementById('saveWarn'); if (n) n.style.display = 'inline';
    }
  }

  /* ---------- tabs ---------------------------------------------- */
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    document.querySelectorAll('nav.tabs button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.remove('active'));
    $('#page-' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'plan') renderPlan();
  });

  /* ================= SETUP TAB ================= */
  // Multi-select dungeon chips bound to an array; click toggles membership.
  function dungeonToggleRow(selected, toggle) {
    const wrap = el('div', { class: 'kv' });
    if (!(state.dungeons || []).length) { wrap.appendChild(el('span', { class: 'mini' }, ['add dungeons first'])); return wrap; }
    state.dungeons.forEach(d => {
      const on = selected.includes(d);
      wrap.appendChild(el('span', {
        class: 'tag', style: 'cursor:pointer;' + (on ? 'background:rgba(122,162,247,.22);color:var(--accent2)' : 'background:var(--panel);color:var(--muted);border:1px solid var(--edge)'),
        onclick: () => { toggle(d); save(); renderSetup(); }
      }, [d]));
    });
    return wrap;
  }
  function dungeonChips(slot) {
    const L = lo(); L.slotDungeons = L.slotDungeons || {};
    return dungeonToggleRow(L.slotDungeons[slot] || [], d => {
      const arr = L.slotDungeons[slot] = L.slotDungeons[slot] || [];
      const i = arr.indexOf(d); if (i >= 0) arr.splice(i, 1); else arr.push(d);
    });
  }

  function renderLoadoutBar() {
    const bar = $('#loadoutBar'); clear(bar);
    state.loadouts.forEach((L, i) => {
      bar.appendChild(el('span', {
        class: 'tag', style: 'cursor:pointer;margin-right:6px;padding:5px 12px;' +
          (i === state.activeLoadout ? 'background:var(--accent);color:#1a1206' : 'background:var(--panel2);color:var(--txt);border:1px solid var(--edge)'),
        onclick: () => { state.activeLoadout = i; save(); renderSetup(); }
      }, [L.name || ('Loadout ' + (i + 1))]));
    });
    $('#activeLoadoutName').textContent = '· ' + (lo().name || '');
  }

  function renderSetup() {
    renderLoadoutBar();
    const L = lo();
    // roles table
    const t = $('#rolesTable'); clear(t);
    t.appendChild(el('tr', {}, [th('Slot'), th('Role'), th('Set'), th('Drops from')]));
    G.SLOTS.forEach(slot => {
      const fixed = G.FIXED_ROLE[slot];
      const tr = el('tr');
      tr.appendChild(el('td', {}, [el('b', {}, [slot])]));
      if (fixed) {
        tr.appendChild(el('td', {}, [el('span', { class: 'tag role' }, [fixed === 'weapon' ? 'Weapon' : 'Relic'])]));
        tr.appendChild(el('td', { class: 'mini' }, ['ability slot']));
        tr.appendChild(el('td', { class: 'mini' }, ['anywhere']));
      } else {
        const role = L.slotRoles[slot] || 'set';
        const sel = el('select', { onchange: e => { L.slotRoles[slot] = e.target.value; save(); renderSetup(); } });
        ['set', 'free', 'legendary'].forEach(r => sel.appendChild(opt(r, r === 'set' ? 'Set piece' : r === 'free' ? 'Free item' : 'Legendary', role === r)));
        tr.appendChild(el('td', {}, [sel]));
        // set column
        if (role === 'set') {
          const ss = el('select', { onchange: e => { L.setOfSlot[slot] = e.target.value; save(); renderSetup(); } });
          ss.appendChild(opt('', '— set —', !L.setOfSlot[slot]));
          state.sets.forEach(s => ss.appendChild(opt(s.name, s.name, L.setOfSlot[slot] === s.name)));
          tr.appendChild(el('td', {}, [ss]));
        } else tr.appendChild(el('td', { class: 'mini' }, ['—']));
        // dungeon column — set & free pieces both pick their dungeon(s) here
        if (role === 'set' || role === 'free') tr.appendChild(el('td', {}, [dungeonChips(slot)]));
        else tr.appendChild(el('td', { class: 'mini' }, ['not worn']));
      }
      t.appendChild(tr);
    });
    // validity (active loadout)
    const counts = { set: 0, free: 0, legendary: 0 };
    G.ASSIGNABLE_SLOTS.forEach(s => counts[L.slotRoles[s] || 'set']++);
    const ok = counts.legendary === 1 && counts.free === 2 && counts.set === 8;
    const v = $('#roleValidity'); clear(v);
    v.appendChild(el('div', { class: 'banner ' + (ok ? 'ok' : 'bad') }, [
      ok ? '✔ Valid: 1 Legendary · 8 Set · 2 Free (+ Weapon & 2 Relics).'
        : `⚠ You have ${counts.legendary} Legendary, ${counts.set} Set, ${counts.free} Free. Need 1 / 8 / 2.`]));

    // sets list (just names — dungeon source is per-slot in the loadout)
    const sl = $('#setsList'); clear(sl);
    state.sets.forEach((s, i) => {
      sl.appendChild(el('div', { class: 'row', style: 'align-items:center;margin-bottom:6px' }, [
        el('span', { class: 'pill', style: 'margin:0' }, [el('b', {}, [s.name])]),
        el('button', { class: 'danger sm', onclick: () => {
          state.sets.splice(i, 1);
          state.loadouts.forEach(L2 => G.SLOTS.forEach(x => { if (L2.setOfSlot[x] === s.name) delete L2.setOfSlot[x]; }));
          save(); renderSetup();
        } }, ['remove'])
      ]));
    });
    const knownDl = $('#knownSets'); clear(knownDl); G.KNOWN_SET_NAMES.forEach(n => knownDl.appendChild(opt(n)));

    // dungeons list
    const dlb = $('#dungeonsList'); clear(dlb);
    (state.dungeons || []).forEach((d, i) => dlb.appendChild(el('span', { class: 'pill' }, [
      el('b', {}, [d]),
      el('button', { class: 'x', title: 'remove', onclick: () => {
        state.dungeons.splice(i, 1);
        state.loadouts.forEach(L2 => Object.keys(L2.slotDungeons || {}).forEach(k => { L2.slotDungeons[k] = (L2.slotDungeons[k] || []).filter(x => x !== d); }));
        save(); renderSetup();
      } }, ['×'])
    ])));

    // weapon tree + assumptions
    $('#wtAuto').checked = !state.bis.weaponTree;
    renderWeaponTree();
    const a = $('#assumeBox'); clear(a);
    a.appendChild(el('div', { html:
      `Weapon tree = <b>+1 rank each</b> (1 major / 2 heroic / 2 defensive), off-budget &nbsp;·&nbsp; ` +
      `Mark cost = <b>expected average</b> &nbsp;·&nbsp; Souldust only on a free item's 3rd slot &nbsp;·&nbsp; ` +
      `12 pair slots + 8 solo slots (3 gear + 5 weapon).` }));
  }
  function th(x) { return el('th', {}, [x]); }

  /* ---- loadout & dungeon controls ---- */
  $('#btnAddLoadout').addEventListener('click', () => {
    state.loadouts.push({ name: 'Loadout ' + (state.loadouts.length + 1), slotRoles: defaultRoles(), setOfSlot: {} });
    state.activeLoadout = state.loadouts.length - 1; save(); renderSetup();
  });
  $('#btnDupLoadout').addEventListener('click', () => {
    const c = JSON.parse(JSON.stringify(lo())); c.name = (c.name || 'Loadout') + ' copy';
    state.loadouts.push(c); state.activeLoadout = state.loadouts.length - 1; save(); renderSetup();
  });
  $('#btnRenameLoadout').addEventListener('click', () => {
    const n = prompt('Loadout name:', lo().name || ''); if (n != null) { lo().name = n.trim() || lo().name; save(); renderSetup(); }
  });
  $('#btnDelLoadout').addEventListener('click', () => {
    if (state.loadouts.length <= 1) { alert('Keep at least one loadout.'); return; }
    if (!confirm('Delete loadout "' + (lo().name || '') + '"?')) return;
    state.loadouts.splice(state.activeLoadout, 1); state.activeLoadout = 0; save(); renderSetup();
  });
  $('#btnAddDungeon').addEventListener('click', () => {
    const n = $('#dungeonName').value.trim(); if (!n) return;
    if (!state.dungeons.includes(n)) state.dungeons.push(n);
    $('#dungeonName').value = ''; save(); renderSetup();
  });

  function renderWeaponTree() {
    const box = $('#wtManual'); clear(box);
    if ($('#wtAuto').checked) {
      const auto = Engine.weaponTree(state.bis.requirements.filter(r => r.name && r.ranks > 0), null);
      box.appendChild(el('div', { class: 'mini' }, [
        'Auto (absorbs odd trait ranks): major = ' + (auto.major || '—') +
        ' · heroic = ' + (auto.heroic.join(', ') || '—') +
        ' · defensive = ' + (auto.defensive.join(', ') || '—')]));
      return;
    }
    const wt = state.bis.weaponTree || { major: null, heroic: [], defensive: [] };
    const mk = (label, cat, current, idx) => {
      const f = el('div', { class: 'field' });
      f.appendChild(el('label', {}, [label]));
      const s = el('select', { onchange: e => {
        const v = e.target.value || null;
        if (cat === 'major') wt.major = v;
        else { wt[cat] = wt[cat] || []; if (v) wt[cat][idx] = v; else wt[cat].splice(idx, 1); wt[cat] = wt[cat].filter(Boolean); }
        state.bis.weaponTree = wt; save();
      } });
      s.appendChild(opt('', '—', !current));
      G.POOLS[cat].forEach(n => s.appendChild(opt(n, n, current === n)));
      f.appendChild(s); return f;
    };
    const r = el('div', { class: 'row' });
    r.appendChild(mk('Major', 'major', wt.major));
    r.appendChild(mk('Heroic 1', 'heroic', (wt.heroic || [])[0], 0));
    r.appendChild(mk('Heroic 2', 'heroic', (wt.heroic || [])[1], 1));
    r.appendChild(mk('Defensive 1', 'defensive', (wt.defensive || [])[0], 0));
    r.appendChild(mk('Defensive 2', 'defensive', (wt.defensive || [])[1], 1));
    box.appendChild(r);
  }

  $('#wtAuto').addEventListener('change', e => {
    state.bis.weaponTree = e.target.checked ? null
      : { major: null, heroic: [], defensive: [] };
    save(); renderWeaponTree();
  });
  $('#btnAddSet').addEventListener('click', () => {
    const n = $('#setName').value.trim(); if (!n) return;
    if (!state.sets.some(s => s.name === n)) state.sets.push({ name: n, dungeon: null });
    $('#setName').value = ''; save(); renderSetup();
  });

  /* ================= BIS TAB ================= */
  function fillCatSelect(sel) { clear(sel); G.CATEGORY_ORDER.forEach(c => sel.appendChild(opt(c, G.CATEGORIES[c].label))); }
  function fillNameSelect(sel, cat) { clear(sel); G.POOLS[cat].forEach(n => sel.appendChild(opt(n))); }

  function renderBis() {
    fillCatSelect($('#reqCat'));
    fillNameSelect($('#reqName'), $('#reqCat').value || 'blessing');
    renderReqList();
    renderBudget();
  }
  $('#reqCat').addEventListener('change', e => {
    fillNameSelect($('#reqName'), e.target.value);
    $('#reqRanks').value = e.target.value === 'gem' ? 2 : e.target.value === 'stat' ? 2 : 4;
  });
  $('#btnAddReq').addEventListener('click', () => {
    const category = $('#reqCat').value, name = $('#reqName').value;
    const ranks = Math.max(1, parseInt($('#reqRanks').value) || 1);
    const ex = state.bis.requirements.find(r => r.category === category && r.name === name);
    if (ex) ex.ranks = ranks; else state.bis.requirements.push({ category, name, ranks });
    save(); renderReqList(); renderBudget(); if ($('#wtAuto').checked) renderWeaponTree();
  });

  function renderReqList() {
    const box = $('#reqList'); clear(box);
    if (!state.bis.requirements.length) { box.appendChild(el('p', { class: 'mini' }, ['Nothing yet — add modifiers above.'])); return; }
    G.CATEGORY_ORDER.forEach(cat => {
      const items = state.bis.requirements.filter(r => r.category === cat);
      if (!items.length) return;
      const grp = el('div', { style: 'margin-bottom:8px' });
      grp.appendChild(catTag(cat));
      items.forEach(r => {
        grp.appendChild(el('span', { class: 'pill' }, [
          el('b', {}, [r.name]),
          ' ×' + r.ranks + (cat === 'gem' ? ' (' + r.ranks * 100 + ' power)' : ''),
          el('button', { class: 'x', onclick: () => {
            state.bis.requirements = state.bis.requirements.filter(x => x !== r);
            save(); renderReqList(); renderBudget(); if ($('#wtAuto').checked) renderWeaponTree();
          } }, ['×'])
        ]));
      });
      box.appendChild(grp);
    });
  }

  function renderBudget() {
    const r = Engine.solve(state, lo());
    const m = $('#budgetMeter'); m.classList.toggle('over', !r.feasible);
    m.firstChild.style.width = Math.min(100, r.pairSlotsNeeded / Math.max(1, r.capacity.pairSlots) * 100) + '%';
    const nd = (r.naturalDrops || []).length, ex = (r.expensivePairs || []).length;
    $('#budgetLabel').textContent =
      `${r.pairSlotsNeeded} / ${r.capacity.pairSlots} duplicatable items · ${r.demand.soloTotal} solo mod(s)` +
      (nd ? ` · ${nd} natural drop(s)` : '') +
      (ex ? ` · ${ex} low-odds same-type craft(s)` : '') +
      (r.feasible ? '' : ' — OVER capacity!');
    renderCapacity(r);
  }
  function renderPlanBudgetHints() { renderBudget(); }

  function renderCapacity(r) {
    const box = $('#capacityReadout'); clear(box);
    const fc = r.freeCapacity;
    const wtFree = [];
    if (fc.weaponTree.major > 0) wtFree.push('1 major');
    if (fc.weaponTree.heroic > 0) wtFree.push(fc.weaponTree.heroic + ' heroic');
    if (fc.weaponTree.defensive > 0) wtFree.push(fc.weaponTree.defensive + ' defensive');
    const bits = [];
    if (fc.fullPairs > 0) bits.push(`${fc.fullPairs} duplicatable slot(s) — 2× one mod of any type`);
    if (fc.anyTypeSingles > 0) bits.push(`${fc.anyTypeSingles} gear solo slot(s) — 1 mod of any type`);
    if (fc.constrainedSingles > 0) bits.push(`${fc.constrainedSingles} filler slot(s) on natural 2-type drops / free 3rd slots — 1 mod each, of a type that item doesn't already carry`);
    box.appendChild(el('div', { class: 'assume' }, [
      el('b', {}, [fc.spareGearMods > 0 ? `Spare capacity — room for ${fc.spareGearMods} more gear mod(s): ` : 'Spare capacity: ']),
      bits.length ? bits.join(' · ') + '. ' : 'every gear slot is assigned. ',
      wtFree.length ? `Weapon-tree room for: ${wtFree.join(', ')} (trait solos only).` : 'Weapon tree full.'
    ]));
    box.appendChild(el('div', { class: 'kv', style: 'margin-top:8px' }, [
      el('span', { class: 'mini' }, ['Weapon tree currently: ']),
      catTag('major', 'Major: ' + (r.weaponTree.major || '—')),
      ...r.weaponTree.heroic.map(n => catTag('heroic', n)),
      ...r.weaponTree.defensive.map(n => catTag('defensive', n)),
      ...(r.weaponTree.heroic.length || r.weaponTree.defensive.length ? [] : [el('span', { class: 'mini' }, ['(no trait solos needed yet)'])])
    ]));
  }

  /* ================= INVENTORY TAB ================= */
  function renderInvForm() {
    const ss = $('#invSlot'); clear(ss); G.SLOTS.forEach(s => ss.appendChild(opt(s)));
    const rr = $('#invRarity'); clear(rr);
    ['Uncommon', 'Rare', 'Epic', 'Heroic', 'Regal'].forEach(r => rr.appendChild(opt(r, r, r === 'Rare')));
    renderInvModRows();
  }
  function renderInvModRows() {
    const box = $('#invMods'); clear(box);
    box.appendChild(el('div', { class: 'mini', style: 'margin-bottom:6px' }, ['Current modifiers (in slot order):']));
    for (let i = 0; i < 3; i++) {
      const cs = el('select', { class: 'imc', 'data-i': i });
      cs.appendChild(opt('', '(empty)'));
      G.CATEGORY_ORDER.forEach(c => cs.appendChild(opt(c, G.CATEGORIES[c].label)));
      const ns = el('select', { class: 'imn', 'data-i': i }); ns.appendChild(opt('', '—'));
      cs.addEventListener('change', () => { clear(ns); ns.appendChild(opt('', '—'));
        if (cs.value) G.POOLS[cs.value].forEach(n => ns.appendChild(opt(n))); });
      box.appendChild(el('div', { class: 'row', style: 'margin-bottom:6px' }, [
        el('div', { class: 'field' }, [el('label', {}, ['Slot ' + (i + 1)]), cs]),
        el('div', { class: 'field' }, [el('label', {}, ['Modifier']), ns])]));
    }
  }
  $('#btnAddItem').addEventListener('click', () => {
    const mods = [];
    $('#invMods').querySelectorAll('.imc').forEach(cs => {
      const i = cs.dataset.i; const ns = $('#invMods').querySelector('.imn[data-i="' + i + '"]');
      if (cs.value && ns.value) mods.push({ category: cs.value, name: ns.value });
    });
    state.inventory.push({
      id: 'it' + Date.now(), slot: $('#invSlot').value,
      rarity: $('#invRarity').value, mods, note: $('#invNote').value.trim()
    });
    $('#invNote').value = ''; renderInvModRows(); save(); renderInvTable();
  });
  $('#souldustOwned').addEventListener('change', e => { state.settings.souldustOwned = parseInt(e.target.value) || 0; save(); });

  function renderInvTable() {
    $('#souldustOwned').value = state.settings.souldustOwned || 0;
    $('#invCount').textContent = '(' + state.inventory.length + ' items)';
    const t = $('#invTable'); clear(t);
    t.appendChild(el('tr', {}, ['Slot', 'Rarity', 'Modifiers', 'Note', ''].map(th)));
    state.inventory.forEach(it => {
      t.appendChild(el('tr', {}, [
        el('td', {}, [el('b', {}, [it.slot])]),
        el('td', {}, [it.rarity]),
        el('td', {}, it.mods.length ? it.mods.map(m => catTag(m.category, m.name)) : [el('span', { class: 'mini' }, ['—'])]),
        el('td', { class: 'mini' }, [it.note || '']),
        el('td', {}, [el('button', { class: 'danger sm', onclick: () => {
          state.inventory = state.inventory.filter(x => x !== it); save(); renderInvTable();
        } }, ['remove'])])
      ]));
    });
  }

  /* ================= PLAN TAB ================= */
  function card(big, lbl) { return el('div', { class: 'card' }, [el('div', { class: 'big' }, ['' + big]), el('div', { class: 'lbl' }, [lbl])]); }

  function renderPlan() {
    const out = $('#planOut'); clear(out);
    if (!state.loadouts.length) { out.appendChild(el('p', { class: 'mini' }, ['No loadouts — add one on the Setup tab.'])); return; }
    out.appendChild(el('p', { class: 'hint' }, ['One plan per loadout — closest-to-finished on top. Each shows the 13-item loadout, your owned crafting steps, and which dungeons to farm for the missing bases.']));
    const results = state.loadouts.map((L, idx) => { const r = Engine.solve(state, L); return { L, idx, r, dp: Engine.dungeonPlan(state, L, r) }; });
    results.sort((a, b) => (b.r.feasible ? 1 : 0) - (a.r.feasible ? 1 : 0) || a.r.farmRows - b.r.farmRows || a.r.totals.marks - b.r.totals.marks);
    results.forEach((x, rank) => {
      const det = el('details', { class: 'panel', open: rank === 0 });
      const sum = el('summary', { style: 'cursor:pointer' });
      sum.appendChild(el('b', { style: 'font-size:16px' }, [x.L.name || ('Loadout ' + (x.idx + 1))]));
      if (rank === 0 && results.length > 1) sum.appendChild(el('span', { class: 'tag', style: 'background:var(--accent);color:#1a1206;margin-left:8px' }, ['closest']));
      sum.appendChild(el('span', { class: 'tag', style: 'margin-left:8px;' + (x.r.feasible ? 'background:rgba(63,185,80,.16);color:#7ee787' : 'background:rgba(248,81,73,.16);color:#ffa198') }, [x.r.feasible ? 'fits' : 'over capacity']));
      sum.appendChild(el('span', { class: 'mini', style: 'margin-left:8px' }, [x.r.ownedRows + '/13 owned · ' + x.r.farmRows + ' to farm · ≈' + x.r.totals.marks + 'm' + (x.r.souldustNeed ? ' · ' + x.r.souldustOwned + '/' + x.r.souldustNeed + ' SD' : '')]));
      det.appendChild(sum);
      const body = el('div', { style: 'margin-top:12px' });
      planSections(body, x.r);
      dungeonSection(body, x.dp);
      det.appendChild(body);
      out.appendChild(det);
    });
  }

  function dungeonSection(out, dp) {
    const box = el('div', { class: 'panel', style: 'background:var(--panel2)' }, [el('h2', {}, ['Dungeons to farm'])]);
    if (!dp.missingCount) { box.appendChild(el('div', { class: 'banner ok' }, ['✔ You own a base for every slot in this loadout.'])); out.appendChild(box); return; }
    box.appendChild(el('p', { class: 'hint' }, ['Sorted by how many missing pieces each dungeon can supply — farm the top one first.']));
    if (dp.ranked.length) {
      const tb = el('table'); tb.appendChild(el('tr', {}, ['Dungeon', 'Pieces', 'Missing slots'].map(th)));
      dp.ranked.forEach(d => tb.appendChild(el('tr', {}, [
        el('td', {}, [el('b', {}, [d.dungeon])]),
        el('td', {}, [String(d.slots.length)]),
        el('td', { class: 'mini' }, [d.slots.join(', ')])])));
      box.appendChild(tb);
    }
    if (dp.anywhere.length) box.appendChild(el('div', { class: 'assume', style: 'margin-top:8px' }, [el('b', {}, ['Anywhere: ']), 'Weapon/Relic bases (' + dp.anywhere.join(', ') + ') drop in any dungeon — grab while farming.']));
    if (dp.unknown.length) box.appendChild(el('div', { class: 'assume', style: 'margin-top:8px' }, [el('b', {}, ['No dungeon set: ']), dp.unknown.join(', ') + ' — assign their set a dungeon, or list dungeons for the free slot, on the Setup tab.']));
    out.appendChild(box);
  }

  function planSections(out, r) {
    const doneCount = r.ownedPlans.filter(p => p.done).length;
    r.issues.forEach(i => out.appendChild(el('div', { class: 'banner bad' }, [i])));

    // stat cards
    const ownedRows = r.sheet.filter(x => x.source === 'owned').length;
    const farmRows = r.sheet.filter(x => x.source === 'farm').length;
    const fillerRows = r.sheet.filter(x => x.source === 'filler').length;
    const sdCard = card(r.souldustOwned + ' / ' + r.souldustNeed, 'Souldust have / may need');
    if (r.souldustOwned < r.souldustNeed) { sdCard.style.outline = '1px solid var(--warn)'; }
    out.appendChild(el('div', { class: 'stat-cards' }, [
      card('≈' + r.totals.marks, 'Marks to finish owned'),
      sdCard,
      card(ownedRows + '/' + r.sheet.length, 'Loadout owned'),
      card(farmRows, 'Items to farm')
    ]));

    // weapon tree
    out.appendChild(el('div', { class: 'panel' }, [
      el('h2', {}, ['Weapon trait tree — 5 free solo slots']),
      el('div', { class: 'kv' }, [
        catTag('major', 'Major: ' + (r.weaponTree.major || '—')),
        ...(r.weaponTree.heroic.length ? r.weaponTree.heroic.map(n => catTag('heroic', n)) : [el('span', { class: 'mini' }, ['no heroic'])]),
        ...(r.weaponTree.defensive.length ? r.weaponTree.defensive.map(n => catTag('defensive', n)) : [el('span', { class: 'mini' }, ['no defensive'])])
      ]),
      el('p', { class: 'note', style: 'margin-top:8px' }, ['Roll the weapon tree to these — 1 major, 2 distinct heroic, 2 distinct defensive. Each is +1 free rank that soaks up an odd trait count.'])
    ]));

    // 13-item loadout sheet
    const sheetTbl = el('table');
    sheetTbl.appendChild(el('tr', {}, ['#', 'Worn item', 'Carries', 'Source'].map(th)));
    r.sheet.forEach((row, i) => {
      const tr = el('tr');
      tr.appendChild(el('td', { class: 'mini' }, [String(i + 1)]));
      tr.appendChild(el('td', {}, [el('b', {}, [row.type]), row.isFree ? el('span', { class: 'mini' }, [' · 3 slots']) : '']));
      tr.appendChild(carriesCell(row));
      tr.appendChild(sourceCell(row));
      sheetTbl.appendChild(tr);
    });
    out.appendChild(el('div', { class: 'panel' }, [
      el('h2', {}, ['Your ' + r.sheet.length + '-item loadout (everything but the legendary)']),
      el('p', { class: 'hint' }, ['Slot-agnostic — “carries” is the modifier content; you choose which physical slot. ' +
        ownedRows + ' filled from your stash · ' + farmRows + ' to farm' + (fillerRows ? ' · ' + fillerRows + ' free-choice (filler)' : '') + '.']),
      sheetTbl
    ]));

    // crafting steps for owned items
    if (r.ownedPlans.length) {
      const ownBox = el('div', { class: 'panel' }, [el('h2', {}, ['Crafting steps for items you own'])]);
      r.ownedPlans.forEach(p => ownBox.appendChild(ownedDetails(p)));
      out.appendChild(ownBox);
    }

    // free-item decision trees
    const trees = Engine.freeItemTrees(state, Engine.buildDemand(state));
    if (trees.length) {
      const box = el('div', { class: 'panel' }, [el('h2', {}, ['Free-item decision trees']),
        el('p', { class: 'hint' }, ['The free items are the puzzle pieces — their 3rd mod is the only legal souldust target. Branch on the random rolls:'])]);
      trees.forEach(tr => box.appendChild(renderTree(tr)));
      out.appendChild(box);
    }

    // notes: natural drops, low-odds same-type crafts, souldust shortage
    const notes = [];
    if ((r.naturalDrops || []).length) {
      const note = el('div', { class: 'assume', style: 'margin-bottom:8px' }, [
        el('b', {}, ['⚑ ' + r.naturalDrops.length + ' natural drop(s) needed. ']),
        'Out of slots — and two DIFFERENT categories can’t be crafted onto one fixed-first item (slot 3 always duplicates slot 2’s category, and souldust only works on free items). So farm a naturally-Regal set/weapon/relic that already dropped carrying: ']);
      r.naturalDrops.forEach(p => note.appendChild(el('span', { class: 'pill', style: 'border-color:var(--warn)' }, [
        catTag(p[0].category, p[0].name), ' + ', catTag(p[1].category, p[1].name)])));
      notes.push(note);
    }
    if ((r.expensivePairs || []).length) {
      const note = el('div', { class: 'assume', style: 'margin-bottom:8px' }, [
        el('b', {}, [r.expensivePairs.length + ' low-odds same-type craft(s). ']),
        'Two different mods of the SAME category on one item IS craftable — flood to two slots of that category, then re-roll the category until both land (each roll re-rolls both slots). Possible, just low odds: ']);
      r.expensivePairs.forEach(p => {
        const N = G.POOL_SIZE[p[0].category];
        note.appendChild(el('span', { class: 'pill' }, [catTag(p[0].category, p[0].name), ' + ', catTag(p[1].category, p[1].name),
          el('span', { class: 'mini' }, [' ≈' + Math.round(5 * N * N / 2) + 'm']) ]));
      });
      notes.push(note);
    }
    if (r.souldustOwned < r.souldustNeed) notes.push(el('div', { class: 'assume' }, [
      el('b', {}, ['Souldust: ']), `this plan may need up to ${r.souldustNeed} Legendary Souldust for free-item 3rd mods, but you have ${r.souldustOwned}. ` +
      'Farm more, or rely on lucky 3rd-mod rolls and re-attempts.']));
    if (notes.length) out.appendChild(el('div', { class: 'panel' }, [el('h2', {}, ['Heads-up']), ...notes]));

    // spares / unusable owned items (grouped)
    const groups = {};
    r.drops.forEach(d => { const k = d.slot + '|' + d.role + '|' + d.dropReason; (groups[k] = groups[k] || { d, count: 0 }).count++; });
    if (Object.keys(groups).length || (r.spares && r.spares.length)) {
      const box = el('div', { class: 'panel' }, [el('h2', {}, ['Spare / unusable items in your stash']),
        el('p', { class: 'hint' }, ['Owned items that don’t fit the current build. Drop & re-attempt, or keep for another build. (Two of a type = you entered two; you only wear one.)'])]);
      Object.values(groups).forEach(g => box.appendChild(el('div', { class: 'assume', style: 'margin-top:8px' }, [
        el('b', {}, [g.d.slot + ' (' + g.d.role + ')' + (g.count > 1 ? ' ×' + g.count : '') + ': ']), g.d.dropReason])));
      (r.spares || []).forEach(p => box.appendChild(el('div', { class: 'assume', style: 'margin-top:8px' }, [
        el('b', {}, [p.slot + ' (spare): ']), 'You already have enough usable ' + p.role + ' items for the loadout — keep this for re-attempts.'])));
      out.appendChild(box);
    }
  }

  function carriesCell(row) {
    const cell = el('td');
    if (!row.carries || !row.carries.length) { cell.appendChild(el('span', { class: 'mini' }, ['free choice (filler)'])); return cell; }
    if (row.source === 'owned') {
      const cnt = {}; row.carries.forEach(c => (cnt[c.category + '::' + c.name] = (cnt[c.category + '::' + c.name] || 0) + 1));
      Object.keys(cnt).forEach(k => { const [cat, name] = k.split('::'); cell.appendChild(catTag(cat, (cnt[k] > 1 ? '2× ' : '') + name)); });
    } else {
      row.carries.forEach(c => cell.appendChild(catTag(c.category, (c.kind === 'pair' ? '2× ' : '') + c.name + (c.kind === 'solo' ? ' ·solo' : ''))));
      if (row.soloKind === 'expensive') cell.appendChild(el('span', { class: 'mini', style: 'color:var(--accent)' }, [' low-odds craft']));
      else if (row.soloKind === 'natural') cell.appendChild(el('span', { class: 'mini', style: 'color:var(--warn)' }, [' ⚑ natural drop']));
    }
    return cell;
  }
  function sourceCell(row) {
    const cell = el('td');
    if (row.source === 'owned') {
      const p = row.plan;
      cell.appendChild(el('span', { class: 'tag', style: 'background:rgba(63,185,80,.16);color:#7ee787' }, ['your ' + p.item.slot]));
      cell.appendChild(el('span', { class: 'mini' }, [p.done ? ' ✓ done' : ' ≈' + p.marks + 'm' + (p.souldust ? ' · ' + p.souldust + ' SD' : '')]));
    } else if (row.source === 'farm') {
      cell.appendChild(el('span', { class: 'tag', style: 'background:rgba(227,179,65,.16);color:#e3b341' }, ['farm']));
    } else {
      cell.appendChild(el('span', { class: 'mini' }, ['—']));
    }
    return cell;
  }

  function ownedDetails(p) {
    const sum = el('summary');
    sum.appendChild(el('span', { class: 'chev' }, ['▸ ']));
    sum.appendChild(el('b', {}, [p.slot]));
    sum.appendChild(el('span', { class: 'tag role' }, [p.role + (p.use !== p.role ? ' · ' + p.use : '')]));
    p.contributes.forEach(c => sum.appendChild(catTag(c.category, c.name)));
    sum.appendChild(el('span', { class: 'right' }));
    if (p.done) sum.appendChild(el('span', { class: 'tag', style: 'background:rgba(63,185,80,.18);color:#7ee787' }, ['✓ DONE']));
    else {
      sum.appendChild(el('span', { class: 'tag', style: 'background:rgba(212,175,55,.16);color:var(--accent)' }, ['≈' + p.marks + ' marks']));
      if (p.souldust) sum.appendChild(el('span', { class: 'tag', style: 'background:rgba(227,179,65,.16);color:var(--warn)' }, [p.souldust + ' souldust']));
    }
    const ol = el('ol', { class: 'steps' });
    ol.appendChild(el('li', { class: 'mini' }, ['Your ' + p.item.rarity + ' ' + p.item.slot +
      (p.item.mods.length ? ' [' + p.item.mods.map(m => m.name).join(', ') + ']' : ' (no mods entered)') + ' →']));
    p.steps.forEach(s => {
      const li = el('li', { class: s.text.startsWith('⚠') ? 'warnstep' : '' });
      if (s.marks) li.appendChild(el('span', { class: 'cost' }, ['≈' + Math.round(s.marks) + 'm']));
      if (s.souldust) li.appendChild(el('span', { class: 'sd' }, [s.souldust + ' SD']));
      li.appendChild(document.createTextNode(s.text));
      ol.appendChild(li);
    });
    const d = el('details', { class: 'item' }, [sum, ol]);
    if (!p.done) d.open = true;
    return d;
  }

  function renderTree(tr) {
    const wrap = el('div', { style: 'margin-bottom:14px' }, [el('b', {}, [tr.title])]);
    const root = el('div', { class: 'tree' });
    const draw = (nodes, parent) => nodes.forEach(n => {
      const node = el('div', { class: 'node' + (n.ok ? ' ok' : n.warn ? ' warn' : '') }, [n.t]);
      parent.appendChild(node);
      if (n.children) { const ch = el('div', { class: 'children' }); node.appendChild(ch); draw(n.children, ch); }
    });
    draw(tr.nodes, root);
    wrap.appendChild(root);
    return wrap;
  }

  /* ================= HELP TAB ================= */
  function renderHelp() {
    $('#helpBox').innerHTML = `
      <h2>How the planner thinks</h2>
      <h3>Categories are fixed by the drop</h3>
      <p>A modifier slot's <b>category</b> (blessing / major / heroic / defensive / gem / stat) comes from the drop.
      Cheap reforges only re-roll the exact mod <i>within</i> its category. So the planner matches your <b>owned</b>
      items to your needs <b>by category</b> — it never tells a slot to become a category it didn't roll. A category
      mismatch means "no usable item — drop &amp; re-attempt".</p>

      <h3>Souldust is for one thing only</h3>
      <p><b>Legendary Souldust</b> (Reroll Slot) is only ever spent on the <b>3rd slot of a fully-free item</b> (an item
      with no fixed mod). Never on set / weapon / relic / necklace, never on a free item's 1st slot.</p>

      <h3>Pairs vs solos</h3>
      <ul>
        <li><b>Duplicatable (pair) slots — 12:</b> slots 2–3 of every non-necklace set piece, the weapon and 2 relics,
        plus slots 1–2 of the 2 free items. Each holds <b>2× the same mod</b> — roll one, then upgrade rarity to
        <i>flood</i> the duplicate. Use a pair for every mod you need an <b>even</b> number of times.</li>
        <li><b>Solo slots — 8:</b> 3 on gear (the set necklace's one free slot + each free item's random 3rd slot) and
        5 on the <b>weapon tree</b> (1 major, 2 distinct heroic, 2 distinct defensive — free to roll, traits only).
        Use these for the odd / leftover single ranks.</li>
      </ul>

      <h3>When you need a natural 2-type drop</h3>
      <p>An item can hold at most <b>2 of the same category</b>, and upgrading always <i>duplicates the type</i> — so you
      cannot build two <i>different</i> mod-types onto one fixed-first item. If you need more solos than fit in the 8
      solo slots, you must <b>drop a naturally-Regal set / weapon / relic that already carries two different mod-types</b>
      in slots 2–3. The planner tells you how many such drops you need and which two categories each must have.</p>

      <h3>Cost model</h3>
      <p>Upgrade rarity = <code>15</code> · Randomize a category = <code>5</code> · Choose-1-of-2 = <code>10</code> marks.
      Hitting one specific mod in a slot already of the right category costs about <code>5 × (pool size)</code> on
      average (9 major/heroic/defensive, 14 blessings, 6 gems, 6 stats). Pairs are built by flooding, so a "2×" never
      costs the square of the rolls.</p>

      <h3>What it gives you</h3>
      <ul>
        <li>A feasibility verdict against your 12 pair slots + 8 solo slots.</li>
        <li>For every item you own: the cheapest steering steps (marks + souldust), and a <b>DONE</b> badge when finished.</li>
        <li>Your owned contributions <b>subtracted</b> from the build, leaving a clear farm list.</li>
        <li>The free-item decision tree and any natural 2-type drops you still need.</li>
      </ul>
      <p class="note">It's slot-agnostic: re-add a re-crafted item and the plan re-solves; bricked items show as "drop &amp; re-attempt".</p>`;
  }

  /* ---------- export / import / reset --------------------------- */
  $('#btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'fellowship-bis.json' });
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { state = JSON.parse(rd.result); save(); renderAll(); alert('Imported.'); }
      catch (err) { alert('Invalid file.'); } };
    rd.readAsText(f);
  });
  $('#btnReset').addEventListener('click', () => {
    if (confirm('Reset to the example build and clear your stash?')) { state = defaultState(); save(); renderAll(); }
  });

  /* ---------- boot ---------------------------------------------- */
  function renderAll() { renderSetup(); renderBis(); renderInvForm(); renderInvTable(); renderHelp(); }
  renderAll();
})();
