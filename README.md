# Blobination 🫧⚡ (DOM Arena)

A premium, **DOM-only** browser game inspired by the vibe of **agar.io / hole.io / slither.io** —  
built **without canvas**, **without libraries**, using **pure vanilla JavaScript + DOM events**.

> ✅ Everything is created dynamically via JS  
> ✅ Interactive entities + mouse selection + drag & drop  
> ✅ Keyboard movement + real-time gameplay  
> ✅ 8+ event types  
> ✅ Smooth + optimized rendering using transform-based motion

---

## 🎮 Gameplay

You control **YOU**, a blob inside a neon arena.

**Goal:**  
Eat food → grow bigger → hunt bots → climb the leaderboard → survive until the end.

Bots also grow and can become threats, so the game stays challenging.

---

## 🕹️ Controls

### Movement
- **Mouse** → aim your direction (constant speed)
- **W / A / S / D** → optional fine movement control

### Abilities
- **Shift** → Dash  
- **E** → Shield  
- **Q** → Bomb  
- **Hold Space** → Burst (smooth + linear boost)

### UI
- **Esc** → Open/Close menu
- **H** → Help
- **R** → Instant restart

---

## 🧩 Powerups (Drag & Drop)

Powerups spawn in the arena and can be activated by:
✅ **Dragging them onto your player**

Types:
- ⚡ **Dash** — reduces dash cooldown
- 🛡️ **Shield** — reduces shield cooldown
- 💣 **Bomb** — +1 bomb charge
- 🧲 **Magnet** — pulls nearby food toward you

---

## 🧪 Developer Tools

Click the ⚙️ button (bottom-right) to open Dev Tools.

You can:
- Toggle **Auto Spawn** (food/bots/powerups)
- Toggle **Variable Mouse Speed** (classic “cursor distance = speed”)
- Change **World Size Preset**
  - Small / Medium / Large
- Change live limits:
  - Food / Bots / Powerups

---

## ⚡ Performance Notes (still DOM-only)

Blobination is optimized **without breaking the DOM requirements**:

✅ Transform-based movement (`translate3d`)  
✅ Cached style updates (only when needed)  
✅ FX pooling (reuses DOM nodes instead of recreating)  
✅ Spatial hash grid for near-collision checks  

This keeps the game smooth even with higher entity counts.

---

## 📁 Project Structure

```

Blobination/
├─ index.html
├─ styles.css
└─ src/
├─ main.js
├─ game.js
└─ config.js

```

---

## 🚀 Run It

Just open `index.html` in a browser.  
(Works perfectly with GitHub Pages too.)

---

## ✅ Requirements Checklist

- ✅ Vanilla JS only (no libraries)
- ✅ All elements created dynamically in JS
- ✅ 8+ event types used
- ✅ Mouse selection + visible active state
- ✅ Drag & drop movement / interaction
- ✅ Keyboard movement
- ✅ Click action on active element (powerups / actions)
- ✅ Clean premium UI

---

## 🧠 Credits

Created by **Homophobia**