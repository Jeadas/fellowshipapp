# Fellowship S3 — BiS Gear Planner

A static, browser-based planner for **Best-in-Slot gear in Fellowship Season 3
(Loot 2.0 itemization)**. Define your dream build, enter the unfinished items in
your stash, and the app works out whether a crafting path to your BiS exists —
and exactly what to do with which item to get there, with the expected
**Mark of Fellowship** cost and **Legendary Souldust** usage.

> Runs entirely in your browser. No install, no backend, no data leaves your
> machine (everything is saved to `localStorage`). Hostable on GitHub Pages.

## What it does

1. **Setup** — assign each of the 14 worn slots a role (1 Legendary, 8 Set
   pieces, 2 Free items; Weapon + 2 Relics are fixed), define your sets, and
   configure the weapon trait tree. All modeling assumptions are shown here.
2. **BiS Target** — click together your desired modifiers: blessings, major /
   heroic / defensive traits, gem essence (×100 power) and bonus stats, each
   with a rank count. A live budget meter tracks the **27 modifier slots**.
3. **Inventory** — add the unfinished items in your stash (slot, rarity, and the
   *customizable* modifiers they currently have).
4. **Plan** — get a feasibility verdict, the full slot-by-slot allocation,
   **progress-aware crafting steps** for every item you own (re-enter a
   half-built item and the path shrinks), the **free-item decision trees**
   (branch on the random rolls, fall back to souldust), and a **farm-priority**
   list of the bases you still need.

## The model (short version)

* Each non-legendary item is a **host**. Items whose 1st slot is locked (set
  bonus / weapon / relic ability) plus the two free items provide **12 pairs**
  (2 copies of one modifier, built by flooding a duplicate on rarity upgrade).
  The set necklace + the two free-item 3rd slots provide **3 singles** →
  **27 modifier slots** total, matching the in-game budget.
* An item can hold at most **2 modifiers of the same category**, so a pair is
  always "2× the same mod".
* The **weapon trait tree** grants +1 free rank to 1 major / 2 heroic / 2
  defensive traits (off-budget), auto-chosen to cancel odd ranks.
* Costs: upgrade rarity **15**, randomize a category **5**, choose-1-of-2 **10**
  Marks. Hitting one specific mod in a slot of the right category costs about
  `5 × pool size` on average. The random 3rd mod on a free item may need a
  scarce **Legendary Souldust** (Reroll Slot 3).

See the in-app **Help** tab for the full explanation.

## Running locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8099   # then open http://localhost:8099
```

## Deploying to GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`. One-time setup:

1. Push this repository to GitHub.
2. Go to **Settings → Pages → Build and deployment** and set **Source** to
   **GitHub Actions**.
3. Every push to `main` (or the development branch) redeploys the site.

## Project layout

```
index.html        app shell + tabs
css/app.css       styling
js/data.js        game data (blessings, traits, gems, slots, costs) — easy to patch
js/engine.js      capacity model, feasibility solver, crafting-path generator
js/ui.js          rendering + interactions + localStorage persistence
```
