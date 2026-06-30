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
  function defaultState() {
    const slotRoles = {};
    G.ASSIGNABLE_SLOTS.forEach(s => (slotRoles[s] = 'set'));
    slotRoles['Cloak'] = 'free';
    slotRoles['Ring1'] = 'free';
    slotRoles['Ring2'] = 'legendary';
    const setOfSlot = {};   // you tag which slots belong to which set (cosmetic)
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
        slotRoles, setOfSlot,
        sets: G.SEED_SETS.map(s => ({ name: s.name })),
        weaponTree: null   // null => auto
      },
      inventory: [],
      settings: { souldustOwned: 0 }
    };
  }

  let state = load() || defaultState();

  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  /* ---------- tabs ---------------------------------------------- */
  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    document.querySelectorAll('nav.tabs button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.remove('active'));
    $('#page-' + b.dataset.tab).classList.add('active');
    if (b.dataset.tab === 'plan') renderPlan();
  });

  /* ================= SETUP TAB ================= */
  function renderSetup() {
    // roles table
    const t = $('#rolesTable'); clear(t);
    t.appendChild(el('tr', {}, [th('Slot'), th('Role'), th('Set / note')]));
    G.SLOTS.forEach(slot => {
      const fixed = G.FIXED_ROLE[slot];
      const tr = el('tr');
      tr.appendChild(el('td', {}, [el('b', {}, [slot])]));
      if (fixed) {
        tr.appendChild(el('td', {}, [el('span', { class: 'tag role' },
          [fixed === 'weapon' ? 'Weapon (ability)' : 'Relic (ability)'])]));
        tr.appendChild(el('td', {}, [el('span', { class: 'mini' }, ['1st mod fixed · 2 free mods + tree'])]));
      } else {
        const sel = el('select', { onchange: e => { state.bis.slotRoles[slot] = e.target.value; save(); renderSetup(); renderPlanBudgetHints(); } });
        ['set', 'free', 'legendary'].forEach(r => sel.appendChild(opt(r,
          r === 'set' ? 'Set piece' : r === 'free' ? 'Free item' : 'Legendary',
          state.bis.slotRoles[slot] === r)));
        tr.appendChild(el('td', {}, [sel]));
        // set assignment
        let cell;
        if (state.bis.slotRoles[slot] === 'set') {
          const ss = el('select', { onchange: e => { state.bis.setOfSlot[slot] = e.target.value; save(); } });
          ss.appendChild(opt('', '— set —', !state.bis.setOfSlot[slot]));
          state.bis.sets.forEach(s => ss.appendChild(opt(s.name, s.name, state.bis.setOfSlot[slot] === s.name)));
          cell = ss;
        } else {
          cell = el('span', { class: 'mini' }, [state.bis.slotRoles[slot] === 'free'
            ? (slot === 'Necklace' ? '2 free mods + attunement' : '3 free mods (slot-3 = souldust target)')
            : 'No modifier slots']);
        }
        tr.appendChild(el('td', {}, [cell]));
      }
      t.appendChild(tr);
    });
    // validity
    const counts = { set: 0, free: 0, legendary: 0 };
    G.ASSIGNABLE_SLOTS.forEach(s => counts[state.bis.slotRoles[s]]++);
    const ok = counts.legendary === 1 && counts.free === 2 && counts.set === 8;
    const v = $('#roleValidity'); clear(v);
    v.appendChild(el('div', { class: 'banner ' + (ok ? 'ok' : 'bad') }, [
      ok ? '✔ Valid: 1 Legendary · 8 Set · 2 Free (+ Weapon & 2 Relics).'
        : `⚠ You have ${counts.legendary} Legendary, ${counts.set} Set, ${counts.free} Free. Need 1 / 8 / 2.`
    ]));

    // sets list
    const sl = $('#setsList'); clear(sl);
    state.bis.sets.forEach((s, i) => {
      const slots = G.SLOTS.filter(x => state.bis.setOfSlot[x] === s.name);
      sl.appendChild(el('span', { class: 'pill' }, [
        el('b', {}, [s.name]),
        el('span', { class: 'mini' }, [' ' + (slots.length ? slots.join(', ') : 'no slots')]),
        el('button', { class: 'x', title: 'remove', onclick: () => {
          state.bis.sets.splice(i, 1);
          G.SLOTS.forEach(x => { if (state.bis.setOfSlot[x] === s.name) delete state.bis.setOfSlot[x]; });
          save(); renderSetup();
        } }, ['×'])
      ]));
    });
    const dl = $('#knownSets'); clear(dl);
    G.KNOWN_SET_NAMES.forEach(n => dl.appendChild(opt(n)));

    // weapon tree
    $('#wtAuto').checked = !state.bis.weaponTree;
    renderWeaponTree();

    // assumptions
    const a = $('#assumeBox'); clear(a);
    a.appendChild(el('div', { html:
      `Weapon tree = <b>+1 rank each</b> (1 major / 2 heroic / 2 defensive), off-budget &nbsp;·&nbsp; ` +
      `Mark cost = <b>expected average</b> from roll odds &nbsp;·&nbsp; ` +
      `Set necklace = <b>1 free mod</b> (set + attunement fixed) &nbsp;·&nbsp; ` +
      `Total budget = <b>27 modifier slots</b>.` }));
  }
  function th(x) { return el('th', {}, [x]); }

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
    if (!state.bis.sets.some(s => s.name === n)) state.bis.sets.push({ name: n });
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
    const r = Engine.solve(state);
    const m = $('#budgetMeter'); m.classList.toggle('over', !r.feasible);
    m.firstChild.style.width = Math.min(100, r.pairSlotsNeeded / Math.max(1, r.capacity.pairSlots) * 100) + '%';
    const ds = r.soloPlacement.doubleSoloItems;
    $('#budgetLabel').textContent =
      `${r.pairSlotsNeeded} / ${r.capacity.pairSlots} duplicatable items · ${r.demand.soloTotal} solo mod(s)` +
      (ds ? ` · ${ds} natural 2-type drop(s) needed` : '') +
      (r.feasible ? '' : ' — OVER capacity!');
  }
  function renderPlanBudgetHints() { renderBudget(); }

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
    const r = Engine.solve(state);
    const doneCount = r.ownedPlans.filter(p => p.done).length;

    // banner
    out.appendChild(el('div', { class: 'banner ' + (r.feasible ? 'ok' : 'bad') }, [
      el('div', {}, [r.feasible
        ? '✔ This BiS fits your gear capacity. Below: what to do with each item you own, then what is left to farm.'
        : '⚠ This BiS does not fit your gear capacity yet — see below.']),
      el('small', {}, [
        `${r.pairSlotsNeeded}/${r.capacity.pairSlots} duplicatable items used · ${r.demand.soloTotal} solo mods · ` +
        (r.soloPlacement.doubleSoloItems ? `${r.soloPlacement.doubleSoloItems} natural 2-type drop(s) · ` : '') +
        `${r.ownedPlans.length} of your items usable`])
    ]));
    r.issues.forEach(i => out.appendChild(el('div', { class: 'banner bad' }, [i])));

    // stat cards
    out.appendChild(el('div', { class: 'stat-cards' }, [
      card('≈' + r.totals.marks, 'Marks to finish owned'),
      card(r.totals.souldust, 'Souldust (owned)'),
      card(doneCount + '/' + r.ownedPlans.length, 'Owned items done'),
      card(r.remaining.pairs.reduce((s, p) => s + p.count, 0) + r.remaining.solos.length, 'Mods left to farm')
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

    // owned item advice
    const ownBox = el('div', { class: 'panel' }, [
      el('h2', {}, ['What to do with each item you own']),
      el('p', { class: 'hint' }, ['Slot-agnostic: items are matched to your needs by category and steered the cheapest way. Re-add a re-crafted item and the plan updates; bricked items show as “drop & re-attempt”.'])]);
    if (!r.ownedPlans.length && !r.drops.length) ownBox.appendChild(el('p', { class: 'mini' }, ['No owned items yet — add them on the Inventory tab.']));
    r.ownedPlans.forEach(p => ownBox.appendChild(ownedDetails(p)));
    r.drops.forEach(d => ownBox.appendChild(el('div', { class: 'assume', style: 'margin-top:8px' }, [
      el('b', {}, [d.slot + ' (' + d.role + '): ']), d.dropReason])));
    out.appendChild(ownBox);

    // free-item decision trees (generic, for what's left to build)
    const trees = Engine.freeItemTrees(state, Engine.buildDemand(state));
    if (trees.length) {
      const box = el('div', { class: 'panel' }, [el('h2', {}, ['Free-item decision trees']),
        el('p', { class: 'hint' }, ['The free items are the puzzle pieces — their 3rd mod is the only legal souldust target. Branch on the random rolls:'])]);
      trees.forEach(tr => box.appendChild(renderTree(tr)));
      out.appendChild(box);
    }

    // remaining to farm
    const farmBox = el('div', { class: 'panel' }, [el('h2', {}, ['Remaining — what to farm']),
      el('p', { class: 'hint' }, ['After subtracting everything your owned items can become. Pairs first (highest-impact, 2 ranks each), then solos, then any natural 2-type drops.'])]);
    if (!r.remaining.pairs.length && !r.remaining.solos.length && !r.remaining.doubleSoloItems) {
      farmBox.appendChild(el('div', { class: 'banner ok' }, ['✔ Your owned items cover the whole build — just finish the crafting steps above.']));
    } else {
      const tb = el('table');
      tb.appendChild(el('tr', {}, ['Need', 'Modifier', 'How', 'Marks ea.'].map(th)));
      r.remaining.pairs.forEach(p => tb.appendChild(el('tr', {}, [
        el('td', {}, [el('span', { class: 'tag', style: 'background:rgba(122,162,247,.16);color:var(--accent2)' }, ['pair ×' + p.count])]),
        el('td', {}, [catTag(p.category, p.name)]),
        el('td', { class: 'mini' }, ['Drop a duplicatable item whose free slot is a ' + G.CATEGORIES[p.category].label + ', roll to ' + p.name + ', flood the dup.']),
        el('td', { class: 'mini' }, ['≈' + (G.POOL_SIZE[p.category] * 5) + ' + 15'])
      ])));
      r.remaining.solos.forEach(s => tb.appendChild(el('tr', {}, [
        el('td', {}, [el('span', { class: 'tag', style: 'background:rgba(212,175,55,.16);color:var(--accent)' }, ['solo'])]),
        el('td', {}, [catTag(s.category, s.name)]),
        el('td', { class: 'mini' }, [G.CATEGORY_ORDER.indexOf(s.category) < 4 && ['major', 'heroic', 'defensive'].includes(s.category)
          ? 'Weapon tree, or a gear solo (necklace / free-item 3rd slot).'
          : 'A gear solo slot — necklace (farm the category) or a free-item 3rd slot (souldust to fix).']),
        el('td', { class: 'mini' }, ['≈' + (G.POOL_SIZE[s.category] * 5)])
      ])));
      farmBox.appendChild(tb);
      if (r.remaining.doubleSoloItems) {
        farmBox.appendChild(el('div', { class: 'assume', style: 'margin-top:10px' }, [
          el('b', {}, ['⚑ ' + r.remaining.doubleSoloItems + ' natural 2-type drop(s) needed. ']),
          'You have more solo mods than solo slots. You cannot build two different mod-types on one fixed-first item (upgrading always duplicates the type), so drop a naturally-Regal set/weapon/relic that already carries two different types: ',
          ...r.remaining.doubleSoloPairs.map(pr => el('span', { class: 'pill' }, [
            pr[0] ? catTag(pr[0].category) : el('span', {}, ['?']), ' + ',
            pr[1] ? catTag(pr[1].category) : el('span', { class: 'mini' }, ['any other'])]))
        ]));
      }
    }
    out.appendChild(farmBox);
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
