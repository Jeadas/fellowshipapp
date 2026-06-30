/* =====================================================================
 * Fellowship S3 BiS Gear Planner — Game Data
 * ---------------------------------------------------------------------
 * All values are sourced from the Season 3 "Loot 2.0" itemization notes.
 * This file is intentionally pure data so it is easy to patch when the
 * game changes. Nothing here knows about the UI.
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ---- Modifier categories ---------------------------------------- */
  // A "category" is the TYPE of a modifier slot. The cheap reforges
  // ("Randomize <X>") only ever re-roll WITHIN a category. Changing the
  // category of a slot needs a Legendary Souldust (Reroll Slot N).
  const CATEGORIES = {
    blessing:  { key: 'blessing',  label: 'Blessing',        maxRanks: 4, unit: 'rank'  },
    major:     { key: 'major',     label: 'Major Trait',     maxRanks: 4, unit: 'rank'  },
    heroic:    { key: 'heroic',    label: 'Heroic Trait',    maxRanks: 4, unit: 'rank'  },
    defensive: { key: 'defensive', label: 'Defensive Trait', maxRanks: 4, unit: 'rank'  },
    gem:       { key: 'gem',       label: 'Gem Essence',     maxRanks: 4, unit: 'x100 power' },
    stat:      { key: 'stat',      label: 'Bonus Stat',      maxRanks: 4, unit: 'roll'  }
  };

  // Order used for menus.
  const CATEGORY_ORDER = ['blessing', 'major', 'heroic', 'defensive', 'gem', 'stat'];

  /* ---- The actual modifiers in each category ---------------------- */
  const POOLS = {
    blessing: [
      'The Herald', 'The Sinister', 'The Wayfarer', 'The Celestial',
      'The Trickster', 'The Mystic', 'The Heretic', 'The Philosopher',
      'The Subduer', 'The Intrepid', 'The Usurper', 'The Vainglorious',
      'The Monarch', 'The Vehement'
    ],
    major: [
      'Brave Machinations', 'Martial Initiative', 'Amethyst Splinters',
      'Diamond Strike', 'Emerald Judgement', 'Heroic Brand', 'Ruby Storm',
      'Sapphire Aurastone', 'Visions of Grandeur'
    ],
    heroic: [
      "Hunter's Focus", 'Inspired Allegiance', 'Willful Momentum',
      'Hidden Power', 'Kindling', "Navigator's Intuition", 'Patient Soul',
      'Seized Opportunity', 'Vengeful Soul'
    ],
    defensive: [
      'Divine Mediation', 'Iron Spikes', 'Stalwart Readiness',
      'Heart of Stone', 'First Man Standing', 'Grounded Spirit',
      'King of the Hill', 'Latent Resurgence', "Treasure Hunter's Delight"
    ],
    gem: ['Sapphire', 'Diamond', 'Amethyst', 'Ruby', 'Topaz', 'Emerald'],
    stat: ['Stamina', 'Main Stat', 'Critical Strike', 'Haste', 'Expertise', 'Spirit']
  };

  // Pool sizes drive the reforge odds (1-of-N uniform per slot, per roll).
  const POOL_SIZE = {};
  CATEGORY_ORDER.forEach(c => (POOL_SIZE[c] = POOLS[c].length));

  /* ---- Equipment slots ------------------------------------------- */
  const SLOTS = [
    'Head', 'Shoulders', 'Cloak', 'Chest', 'Hands', 'Legs', 'Feet',
    'Necklace', 'Wrists', 'Ring1', 'Ring2', 'Relic1', 'Relic2', 'Weapon'
  ];

  // Slots whose role is fixed by the item type.
  const FIXED_ROLE = { Weapon: 'weapon', Relic1: 'relic', Relic2: 'relic' };

  // The 11 slots whose role the player assigns (legendary / set / free).
  const ASSIGNABLE_SLOTS = SLOTS.filter(s => !FIXED_ROLE[s]);

  /* ---- Rarities -------------------------------------------------- */
  // index used for "how many modifier slots exist" maths.
  const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Heroic', 'Regal', 'Legendary'];
  const RARITY_INDEX = {};
  RARITIES.forEach((r, i) => (RARITY_INDEX[r] = i));

  // How many of the 1/2/3 modifier slots physically EXIST at a rarity.
  // Rare = slot1, Epic = slot1+2, Regal/Legendary = slot1+2+3.
  function modifierSlotsAt(rarity) {
    const i = RARITY_INDEX[rarity];
    if (i >= RARITY_INDEX.Regal) return 3;
    if (i >= RARITY_INDEX.Epic) return 2;
    if (i >= RARITY_INDEX.Rare) return 1;
    return 0;
  }

  /* ---- Crafting costs (Marks of Fellowship) ---------------------- */
  const COST = {
    upgradeRarity: 15,   // Item Transmutation: +1 rarity
    randomize: 5,        // Randomize <category> (rerolls all of that type)
    chooseOneOfTwo: 10   // Randomize <category>, choose 1 of 2
  };

  /* ---- Default / seed sets (editable in-app) --------------------- */
  // Names pulled from the user's planning sheet. Slots are a sensible
  // default the user can re-assign freely in the Setup tab.
  const SEED_SETS = [
    { name: 'Draconic Might', dungeons: ['Grove'] },          // a set can span several dungeons
    { name: 'Seal of Heskyr', dungeons: ['Sands', 'Ruins'] }  // small sets are spread over 2
  ];
  const KNOWN_SET_NAMES = [
    'Draconic Might', 'Seal of Heskyr', 'Dark Prophecy', "Death's Grasp",
    'Drakheim', 'Scryer', 'Ruins', 'Sailor', 'Sands'
  ];
  // Dungeons (where bases drop). User-editable; seeded from the planning sheet.
  const SEED_DUNGEONS = ['Grove', 'Sands', 'Ruins', 'Urrak', 'Scryer', 'Sailors', 'Peak', 'Ransack'];

  /* ---- Modeling assumptions (surfaced in the UI) ----------------- */
  const ASSUMPTIONS = {
    weaponTree: '+1 rank each',     // '+1 rank each' | 'full 4/4' | 'ignore'
    markBasis: 'expected',          // 'expected' | 'both'
    necklaceFreeMods: 1,            // set necklace: slot1=set, slot2=attunement, slot3=free
    budget: 27                      // total free modifier slots at full Regal
  };

  global.GAME = {
    CATEGORIES, CATEGORY_ORDER, POOLS, POOL_SIZE,
    SLOTS, FIXED_ROLE, ASSIGNABLE_SLOTS,
    RARITIES, RARITY_INDEX, modifierSlotsAt,
    COST, SEED_SETS, KNOWN_SET_NAMES, SEED_DUNGEONS, ASSUMPTIONS,
    categoryOf(name) {
      for (const c of CATEGORY_ORDER) if (POOLS[c].includes(name)) return c;
      return null;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
