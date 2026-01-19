# DOM.IO Arena ⚡ (Blob Domination)

A premium **.io-style browser arena game** built entirely with **Vanilla JavaScript + DOM + DOM Events**.  
No canvas. No WebGL. No libraries. Everything is generated dynamically via JS.

✅ **School project focus:** DOM manipulation, events, interaction, and smooth UI.

---

## 🎮 Gameplay
You control a blob in a scrolling arena:
- Eat food to grow
- Collect powerups
- Avoid bigger bots
- Become massive and dominate the map

The game uses a **camera + zoom** system to simulate real .io gameplay, while staying fully DOM-based.

---

## ✨ Features
- ✅ Fully dynamic UI and game entities (created with JavaScript)
- ✅ Mouse steering + keyboard movement (WASD / Arrow keys)
- ✅ Drag & drop movement (press → drag → release)
- ✅ Selection system (active object glow + inspector panel)
- ✅ Actions on active element (click active = ability / explode / score)
- ✅ Powerups (Dash / Shield / Bomb pulse)
- ✅ Smooth camera tracking + mass-based zoom
- ✅ Score system + combo system + timer
- ✅ Premium UI (HUD, glow effects, particles, animations)

---

## 🧠 DOM Events Used (8+)
This project intentionally uses many different DOM Events to cover the assignment requirements:

- `pointermove` → aiming / tracking mouse position  
- `click` → select objects + activate actions  
- `dblclick` → quick color switch  
- `pointerdown` → start drag  
- `pointerup` → stop drag  
- `keydown` → movement + abilities  
- `keyup` → release movement keys  
- `wheel` → zoom adjust  
- `contextmenu` → right-click to remove selected entity (except player)  
- `resize` → viewport recalculation  

---

## 🕹 Controls
**Movement**
- Mouse → movement direction
- WASD / Arrow keys → movement

**Abilities**
- Shift → Dash (cooldown)
- E → Shield
- Space → Burst (mini split-style move)
- H → Help overlay
- R → Reset

**Interaction**
- Click → select entity  
- Click selected again → action  
- Drag player → move it directly  
- Right click → delete selected (except player)

---

## 📁 Project Structure
