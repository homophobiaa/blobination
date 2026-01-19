(() => {
  "use strict";

  /**********************
   * CONFIG
   **********************/
  const WORLD_W = 3000;
  const WORLD_H = 2000;

  const LIMITS = {
    food: 240,
    bots: 22,
    powerups: 8,
  };

  const SPAWN = {
    foodEvery: 110,      // ms
    botEvery: 950,       // ms
    powerEvery: 2600,    // ms
  };

  const COLORS = {
    player: ["#45caff", "#9b6bff", "#57ff8a", "#ffd36b"],
    food: ["#57ff8a", "#45caff", "#ffd36b"],
    bot: ["#ff4b6e", "#ff7a4b", "#ff4bd6"],
    power: ["#ffd36b", "#45caff"],
  };

  const POWER_TYPES = ["DASH", "SHIELD", "BOMB", "MAGNET"];

  /**********************
   * STATE
   **********************/
  const state = {
    entities: [],
    idSeq: 1,

    playerId: null,
    selectedId: null,

    score: 0,
    combo: 0,
    comboTimer: 0,

    timeLeft: 120,
    running: true,

    keys: new Set(),
    mouse: { x: 0, y: 0, inside: false },

    camera: {
      x: 0, y: 0,
      tx: 0, ty: 0,
      zoom: 1,
      wheelZoom: 0,
    },

    // Drag is now ONLY for powerups (not player, not bots)
    drag: {
      active: false,
      id: null,
      offsetX: 0,
      offsetY: 0
    },

    abilities: {
      dashCd: 0,
      shieldCd: 0,
      shieldTime: 0,

      bombCd: 0,
      bombCharges: 0,

      magnetTime: 0,
      magnetCd: 0,

      burstCd: 0,
      burstTime: 0
    },

    stats: {
      fps: 0,
      frameCount: 0,
      fpsTimer: 0
    }
  };

  /**********************
   * DOM
   **********************/
  const dom = {
    app: null,
    leftPanel: null,
    center: null,
    rightPanel: null,

    viewport: null,
    world: null,
    miniHud: null,

    hudScore: null,
    hudMass: null,
    hudTime: null,
    hudCombo: null,

    selType: null,
    selSize: null,
    selMass: null,
    selPos: null,

    overlayHelp: null,

    btnFood: null,
    btnBot: null,
    btnPower: null,
    btnReset: null,
  };

  /**********************
   * UTILS
   **********************/
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function getEntityById(id) {
    return state.entities.find(e => e.id === id) || null;
  }

  function removeEntity(id) {
    const idx = state.entities.findIndex(e => e.id === id);
    if (idx === -1) return;

    const e = state.entities[idx];
    e.el?.remove();
    state.entities.splice(idx, 1);

    if (state.selectedId === id) {
      state.selectedId = state.playerId;
      syncSelection();
    }
  }

  function getPlayer() {
    return getEntityById(state.playerId);
  }

  /**********************
   * UI BUILD (DYNAMIC)
   **********************/
  function buildUI() {
    dom.app = document.createElement("div");
    dom.app.id = "app";
    document.body.appendChild(dom.app);

    dom.leftPanel = document.createElement("div");
    dom.leftPanel.id = "leftPanel";
    dom.leftPanel.className = "panel";
    dom.app.appendChild(dom.leftPanel);

    dom.center = document.createElement("div");
    dom.center.id = "center";
    dom.center.className = "panel";
    dom.app.appendChild(dom.center);

    dom.rightPanel = document.createElement("div");
    dom.rightPanel.id = "rightPanel";
    dom.rightPanel.className = "panel";
    dom.app.appendChild(dom.rightPanel);

    // Left title
    const leftTitle = document.createElement("div");
    leftTitle.className = "title";
    leftTitle.innerHTML = `<h1>DOM.IO ARENA</h1><span class="badge">FUN BUILD</span>`;
    dom.leftPanel.appendChild(leftTitle);

    // KPIs
    const kpiGrid = document.createElement("div");
    kpiGrid.className = "kpiGrid";
    dom.leftPanel.appendChild(kpiGrid);

    const kScore = mkKPI("Score");
    const kMass = mkKPI("Mass");
    const kTime = mkKPI("Time");
    const kCombo = mkKPI("Combo");
    kpiGrid.appendChild(kScore.box);
    kpiGrid.appendChild(kMass.box);
    kpiGrid.appendChild(kTime.box);
    kpiGrid.appendChild(kCombo.box);

    dom.hudScore = kScore.value;
    dom.hudMass = kMass.value;
    dom.hudTime = kTime.value;
    dom.hudCombo = kCombo.value;

    dom.leftPanel.appendChild(mkDivider());

    // Buttons
    const row = document.createElement("div");
    row.className = "btnRow";
    dom.leftPanel.appendChild(row);

    dom.btnFood = mkButton("Food +25", "uiBtn primary");
    dom.btnBot = mkButton("Bots +3", "uiBtn");
    dom.btnPower = mkButton("Power +2", "uiBtn");
    dom.btnReset = mkButton("Reset", "uiBtn danger");

    row.appendChild(dom.btnFood);
    row.appendChild(dom.btnBot);
    row.appendChild(dom.btnPower);
    row.appendChild(dom.btnReset);

    dom.leftPanel.appendChild(mkDivider());

    const help = document.createElement("div");
    help.className = "helpBox";
    help.innerHTML = `
      <div style="color: rgba(255,255,255,0.88); font-weight: 750; margin-bottom: 6px;">Controls</div>
      <div><code>Mouse</code> aim (distance = speed)</div>
      <div><code>WASD / Arrows</code> move</div>
      <div><code>Shift</code> Dash • <code>E</code> Shield • <code>Q</code> Bomb</div>
      <div><code>Space</code> Burst (costs tiny mass)</div>
      <div><code>Drag</code> ONLY powerups onto YOU (press → move → release)</div>
      <div><code>Click</code> selects • click selected again = action</div>
      <div><code>H</code> help • Right click deletes selected (not player)</div>
    `;
    dom.leftPanel.appendChild(help);

    // Center: viewport + world
    dom.viewport = document.createElement("div");
    dom.viewport.id = "viewport";
    dom.center.appendChild(dom.viewport);

    dom.world = document.createElement("div");
    dom.world.id = "world";
    dom.viewport.appendChild(dom.world);

    // Mini HUD
    dom.miniHud = document.createElement("div");
    dom.miniHud.id = "miniHud";
    dom.miniHud.innerHTML = `
      <div class="row">
        <span class="chip">FPS <b id="mhFps">0</b></span>
        <span class="chip">Bots <b id="mhBots">0</b></span>
        <span class="chip">Bomb <b id="mhBomb">0</b></span>
      </div>
      <div class="row" style="margin-top:8px;">
        <span class="chip">Dash <b id="mhDash">READY</b></span>
        <span class="chip">Shield <b id="mhShield">READY</b></span>
      </div>
      <div class="row" style="margin-top:8px;">
        <span class="chip">Magnet <b id="mhMag">OFF</b></span>
      </div>
    `;
    dom.center.appendChild(dom.miniHud);

    // Overlay help
    dom.overlayHelp = document.createElement("div");
    dom.overlayHelp.id = "overlayHelp";
    dom.overlayHelp.innerHTML = `
      <div class="card">
        <h2>DOM Events Used (8+)</h2>
        <p>Pure DOM + DOM Events. No canvas, no libraries. All elements are created dynamically via JS.</p>
        <ul>
          <li><b>pointermove</b> — aiming</li>
          <li><b>click</b> — select / action</li>
          <li><b>dblclick</b> — quick style change</li>
          <li><b>pointerdown</b> — drag start</li>
          <li><b>pointerup</b> — drag stop</li>
          <li><b>keydown</b> — movement / abilities</li>
          <li><b>keyup</b> — stop keys</li>
          <li><b>wheel</b> — zoom tuning</li>
          <li><b>contextmenu</b> — remove selected</li>
          <li><b>resize</b> — viewport recalibration</li>
        </ul>
        <p style="margin-top: 12px;"><code>H</code> to close.</p>
      </div>
    `;
    dom.center.appendChild(dom.overlayHelp);

    // Right panel
    const rightTitle = document.createElement("div");
    rightTitle.className = "title";
    rightTitle.innerHTML = `<h1>ACTIVE</h1><span class="badge">Inspector</span>`;
    dom.rightPanel.appendChild(rightTitle);

    dom.selType = mkInfoRow("Type");
    dom.selSize = mkInfoRow("Radius");
    dom.selMass = mkInfoRow("Mass");
    dom.selPos  = mkInfoRow("Pos");
    dom.rightPanel.appendChild(dom.selType.row);
    dom.rightPanel.appendChild(dom.selSize.row);
    dom.rightPanel.appendChild(dom.selMass.row);
    dom.rightPanel.appendChild(dom.selPos.row);

    dom.rightPanel.appendChild(mkDivider());

    const note = document.createElement("div");
    note.className = "smallNote";
    note.innerHTML = `
      <b>Gameplay Fixes</b><br/>
      • Dragging player removed (was OP)<br/>
      • Dragging is now for powerups only<br/>
      • Bots eat food and grow → pressure stays
    `;
    dom.rightPanel.appendChild(note);

    // Button actions
    dom.btnFood.addEventListener("click", () => {
      spawnFood(25);
      ping("Food +25", getPlayer()?.x ?? WORLD_W/2, getPlayer()?.y ?? WORLD_H/2, "#57ff8a");
    });
    dom.btnBot.addEventListener("click", () => {
      spawnBots(3);
      ping("Bots +3", getPlayer()?.x ?? WORLD_W/2, getPlayer()?.y ?? WORLD_H/2, "#ff7a4b");
    });
    dom.btnPower.addEventListener("click", () => {
      spawnPowerups(2);
      ping("Power +2", getPlayer()?.x ?? WORLD_W/2, getPlayer()?.y ?? WORLD_H/2, "#ffd36b");
    });
    dom.btnReset.addEventListener("click", () => resetGame());
  }

  function mkDivider() {
    const d = document.createElement("div");
    d.className = "hr";
    return d;
  }

  function mkButton(text, cls) {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = text;
    return b;
  }

  function mkKPI(label) {
    const box = document.createElement("div");
    box.className = "kpi";
    const l = document.createElement("div");
    l.className = "label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "value";
    v.textContent = "0";
    box.appendChild(l);
    box.appendChild(v);
    return { box, value: v };
  }

  function mkInfoRow(name) {
    const row = document.createElement("div");
    row.className = "infoRow";
    const a = document.createElement("span");
    a.textContent = name;
    const b = document.createElement("span");
    b.textContent = "-";
    row.appendChild(a);
    row.appendChild(b);
    return { row, value: b };
  }

  /**********************
   * ENTITIES
   **********************/
  function createEntity(type, x, y, opts = {}) {
    const id = state.idSeq++;
    const e = {
      id,
      type,
      x,
      y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      mass: opts.mass ?? 10,
      r: opts.r ?? 16,
      color: opts.color ?? "#fff",
      label: opts.label ?? "",
      powerType: opts.powerType ?? null,
      isSelected: false,
      el: null
    };

    const el = document.createElement("div");
    el.className = `entity ${type}`;
    el.dataset.id = String(id);
    el.style.background = e.color;
    el.textContent = e.label;

    el.style.setProperty("--tx", "0px");
    el.style.setProperty("--ty", "0px");
    el.style.setProperty("--s", "1");

    // click = select or action
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const ent = getEntityById(id);
      if (!ent) return;
      if (state.selectedId === id) activateSelected(ent);
      else selectEntity(id);
    });

    // dblclick = quick color
    el.addEventListener("dblclick", (ev) => {
      ev.stopPropagation();
      const ent = getEntityById(id);
      if (!ent) return;
      selectEntity(id);
      cycleColor(ent);
    });

    // ✅ DRAG RULE: only powerups are draggable (NOT player, NOT bots)
    el.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      const ent = getEntityById(id);
      if (!ent) return;

      selectEntity(id);

      if (ent.type !== "powerup") return; // <- main fix

      state.drag.active = true;
      state.drag.id = id;
      el.setPointerCapture(ev.pointerId);

      const wp = screenToWorld(ev.clientX, ev.clientY);
      state.drag.offsetX = ent.x - wp.x;
      state.drag.offsetY = ent.y - wp.y;
    });

    el.addEventListener("pointerup", (ev) => {
      ev.stopPropagation();
      if (state.drag.id === id) {
        state.drag.active = false;
        state.drag.id = null;
      }
    });

    el.addEventListener("mouseenter", () => { el.style.filter = "brightness(1.08)"; });
    el.addEventListener("mouseleave", () => { el.style.filter = ""; });

    e.el = el;
    state.entities.push(e);
    dom.world.appendChild(el);
    return e;
  }

  /**********************
   * SPAWNERS
   **********************/
  function massToRadius(mass) {
    return 10 + Math.sqrt(mass) * 2.35;
  }

  function spawnPlayer() {
    const p = createEntity("player", WORLD_W / 2, WORLD_H / 2, {
      mass: 24,
      r: massToRadius(24),
      color: COLORS.player[0],
      label: "YOU"
    });
    state.playerId = p.id;
    state.selectedId = p.id;
    syncSelection();
  }

  function spawnFood(count = 1) {
    const existing = state.entities.filter(e => e.type === "food").length;
    const can = Math.max(0, LIMITS.food - existing);
    const n = Math.min(count, can);

    for (let i = 0; i < n; i++) {
      const x = rand(40, WORLD_W - 40);
      const y = rand(40, WORLD_H - 40);
      const r = randInt(6, 10);
      createEntity("food", x, y, {
        mass: r * 0.7,
        r,
        color: pick(COLORS.food),
      });
    }
  }

  function spawnBot() {
    const existing = state.entities.filter(e => e.type === "bot").length;
    if (existing >= LIMITS.bots) return;

    const player = getPlayer();
    const pm = player ? player.mass : 30;

    // bots scale around player mass AND some spawn bigger always
    const bias = Math.random();
    let mult = bias < 0.50 ? rand(0.55, 0.95)
            : bias < 0.80 ? rand(0.90, 1.15)
            : rand(1.15, 1.65);

    let mass = clamp(pm * mult + rand(-6, 14), 12, 300);
    const r = massToRadius(mass);

    const x = rand(80, WORLD_W - 80);
    const y = rand(80, WORLD_H - 80);

    const b = createEntity("bot", x, y, {
      mass,
      r,
      color: pick(COLORS.bot),
    });

    const ang = rand(0, Math.PI * 2);
    b.vx = Math.cos(ang) * rand(70, 170);
    b.vy = Math.sin(ang) * rand(70, 170);
  }

  function spawnBots(n) {
    for (let i = 0; i < n; i++) spawnBot();
  }

  function spawnPowerup() {
    const existing = state.entities.filter(e => e.type === "powerup").length;
    if (existing >= LIMITS.powerups) return;

    const x = rand(120, WORLD_W - 120);
    const y = rand(120, WORLD_H - 120);
    const ptype = pick(POWER_TYPES);

    const label = ptype === "DASH" ? "⚡"
                : ptype === "SHIELD" ? "🛡️"
                : ptype === "BOMB" ? "💣"
                : "🧲";

    createEntity("powerup", x, y, {
      mass: 6,
      r: 16,
      color: pick(COLORS.power),
      label,
      powerType: ptype
    });
  }

  function spawnPowerups(n) {
    for (let i = 0; i < n; i++) spawnPowerup();
  }

  /**********************
   * SELECTION + ACTION
   **********************/
  function selectEntity(id) {
    state.selectedId = id;
    syncSelection();
  }

  function syncSelection() {
    for (const e of state.entities) {
      e.isSelected = (e.id === state.selectedId);
      e.el?.classList.toggle("selected", e.isSelected);
    }
    updateInspector();
  }

  function cycleColor(ent) {
    if (!ent) return;
    if (ent.type === "player") {
      const idx = COLORS.player.indexOf(ent.color);
      const next = COLORS.player[(idx + 1) % COLORS.player.length];
      ent.color = next;
      ent.el.style.background = next;
      ping("COLOR", ent.x, ent.y, "#45caff");
    } else {
      ent.color = pick(["#45caff", "#57ff8a", "#ffd36b", "#ff4b6e", "#9b6bff"]);
      ent.el.style.background = ent.color;
    }
  }

  // ✅ NO FREE DELETE ANYMORE
  function activateSelected(ent) {
    if (!ent) return;

    if (ent.type === "player") {
      // player click = shield if ready, else cosmetic
      if (state.abilities.shieldCd <= 0 && state.abilities.shieldTime <= 0) {
        activateShield();
      } else {
        cycleColor(ent);
      }
      return;
    }

    if (ent.type === "powerup") {
      applyPowerup(ent);
      popRemove(ent, true);
      return;
    }

    // bots/food: action is a "ping" only (still counts as action)
    ping("LOCKED", ent.x, ent.y, "#ffd36b");
  }

  /**********************
   * SCORE + EFFECTS
   **********************/
  function addScore(amount, x, y, color = "#45caff") {
    state.score += amount;
    if (amount > 0) {
      state.combo++;
      state.comboTimer = 1.0;
    } else {
      state.combo = 0;
      state.comboTimer = 0;
    }
    spawnFloatText(amount > 0 ? `+${amount}` : `${amount}`, x, y, color);
  }

  function ping(text, x, y, color) {
    spawnFloatText(text, x, y, color);
  }

  function spawnFloatText(text, x, y, color) {
    const el = document.createElement("div");
    el.className = "floatText";
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    dom.world.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }

  function burstParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.background = color;

      p.style.setProperty("--tx", "-3px");
      p.style.setProperty("--ty", "-3px");
      p.style.setProperty("--dx", `${rand(-70, 70).toFixed(1)}px`);
      p.style.setProperty("--dy", `${rand(-70, 70).toFixed(1)}px`);

      dom.world.appendChild(p);
      p.addEventListener("animationend", () => p.remove());
    }
  }

  function popRemove(ent, withParticles = false) {
    if (!ent?.el) return;
    if (withParticles) burstParticles(ent.x, ent.y, ent.color);

    const tx = `${(ent.x - ent.r).toFixed(2)}px`;
    const ty = `${(ent.y - ent.r).toFixed(2)}px`;
    ent.el.style.setProperty("--tx", tx);
    ent.el.style.setProperty("--ty", ty);
    ent.el.style.setProperty("--s", "1");

    ent.el.classList.add("pop");
    ent.el.addEventListener("animationend", () => removeEntity(ent.id), { once: true });
  }

  /**********************
   * POWERUPS / ABILITIES
   **********************/
  function applyPowerup(power) {
    const p = getPlayer();
    if (!p) return;

    if (power.powerType === "DASH") {
      state.abilities.dashCd = Math.max(0, state.abilities.dashCd - 1.0);
      ping("DASH+", power.x, power.y, "#ffd36b");
    }

    if (power.powerType === "SHIELD") {
      state.abilities.shieldCd = Math.max(0, state.abilities.shieldCd - 2.0);
      ping("SHIELD+", power.x, power.y, "#57ff8a");
    }

    if (power.powerType === "BOMB") {
      state.abilities.bombCharges = clamp(state.abilities.bombCharges + 1, 0, 5);
      ping("BOMB+1", power.x, power.y, "#ff4b6e");
    }

    if (power.powerType === "MAGNET") {
      state.abilities.magnetTime = 4.0;
      state.abilities.magnetCd = 8.0;
      ping("MAGNET", power.x, power.y, "#45caff");
    }

    burstParticles(power.x, power.y, power.color);
    addScore(4, power.x, power.y, "#ffd36b"); // small reward only
  }

  function activateShield() {
    const p = getPlayer();
    if (!p) return;
    if (state.abilities.shieldCd > 0) return;

    state.abilities.shieldTime = 2.2;
    state.abilities.shieldCd = 6.0;
    p.el.classList.add("shielded");
    burstParticles(p.x, p.y, "#57ff8a");
  }

  function activateBomb() {
    const p = getPlayer();
    if (!p) return;
    if (state.abilities.bombCd > 0) return;
    if (state.abilities.bombCharges <= 0) return;

    state.abilities.bombCharges--;
    state.abilities.bombCd = 2.2;

    const R = 190;
    const r2 = R * R;

    for (const e of [...state.entities]) {
      if (e.id === p.id) continue;
      if (e.type !== "food" && e.type !== "bot") continue;

      if (dist2(p.x, p.y, e.x, e.y) <= r2) {
        if (e.type === "food") {
          addScore(1, e.x, e.y, "#ffd36b");
          popRemove(e, true);
        } else if (e.type === "bot") {
          if (p.mass >= e.mass * 0.9) {
            addScore(12, e.x, e.y, "#ffd36b");
            popRemove(e, true);
          }
        }
      }
    }

    burstParticles(p.x, p.y, "#ffd36b");
    ping("BOMB", p.x, p.y, "#ffd36b");
  }

  /**********************
   * MOVEMENT + CAMERA
   **********************/
  function playerSpeed(mass) {
    return clamp(320 - Math.sqrt(mass) * 13.0, 150, 320);
  }

  function computeZoom(mass) {
    const z = 1.20 - Math.sqrt(mass) * 0.015;
    return clamp(z, 0.68, 1.22);
  }

  function clampEntity(e) {
    e.x = clamp(e.x, e.r, WORLD_W - e.r);
    e.y = clamp(e.y, e.r, WORLD_H - e.r);
  }

  function updatePlayer(dt) {
    const p = getPlayer();
    if (!p) return;

    state.abilities.dashCd = Math.max(0, state.abilities.dashCd - dt);
    state.abilities.shieldCd = Math.max(0, state.abilities.shieldCd - dt);
    state.abilities.bombCd = Math.max(0, state.abilities.bombCd - dt);
    state.abilities.burstCd = Math.max(0, state.abilities.burstCd - dt);
    state.abilities.magnetCd = Math.max(0, state.abilities.magnetCd - dt);

    if (state.abilities.shieldTime > 0) {
      state.abilities.shieldTime -= dt;
      if (state.abilities.shieldTime <= 0) p.el.classList.remove("shielded");
    }

    if (state.abilities.magnetTime > 0) {
      state.abilities.magnetTime -= dt;
    }

    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // mouse aim + keyboard
    let dirX = 0, dirY = 0;

    const up = state.keys.has("ArrowUp") || state.keys.has("KeyW");
    const down = state.keys.has("ArrowDown") || state.keys.has("KeyS");
    const left = state.keys.has("ArrowLeft") || state.keys.has("KeyA");
    const right = state.keys.has("ArrowRight") || state.keys.has("KeyD");

    if (up) dirY -= 1;
    if (down) dirY += 1;
    if (left) dirX -= 1;
    if (right) dirX += 1;

    let mouseFactor = 1;

    if (state.mouse.inside) {
      const rect = getViewportRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const mx = state.mouse.x;
      const my = state.mouse.y;

      const mdx = mx - cx;
      const mdy = my - cy;
      const dist = Math.hypot(mdx, mdy);

      const maxDist = Math.min(rect.width, rect.height) * 0.48;
      mouseFactor = clamp(dist / maxDist, 0.18, 1.0);

      if (dirX === 0 && dirY === 0) {
        const mag = dist || 1;
        dirX = mdx / mag;
        dirY = mdy / mag;
      } else {
        const kmag = Math.hypot(dirX, dirY) || 1;
        dirX = (dirX / kmag) * 0.85 + (mdx / (dist || 1)) * 0.15;
        dirY = (dirY / kmag) * 0.85 + (mdy / (dist || 1)) * 0.15;
      }
    }

    const mag = Math.hypot(dirX, dirY);
    if (mag > 0.0001) {
      dirX /= mag;
      dirY /= mag;
    }

    let speed = playerSpeed(p.mass) * mouseFactor;

    // Dash
    if (state.keys.has("ShiftLeft") || state.keys.has("ShiftRight")) {
      if (state.abilities.dashCd <= 0) {
        state.abilities.dashCd = 1.0;
        speed *= 2.6;
        burstParticles(p.x, p.y, p.color);
        ping("DASH", p.x, p.y, "#45caff");
      }
    }

    // Space burst
    if (state.abilities.burstTime > 0) {
      state.abilities.burstTime -= dt;
      speed *= 1.7;
    }

    p.x += dirX * speed * dt;
    p.y += dirY * speed * dt;

    clampEntity(p);
  }

  function updateBots(dt) {
    const player = getPlayer();
    if (!player) return;

    for (const b of state.entities) {
      if (b.type !== "bot") continue;

      const chase = player.mass < b.mass * 0.92;
      const flee  = player.mass > b.mass * 1.18;

      let dx = 0, dy = 0;

      if (chase) {
        dx = player.x - b.x;
        dy = player.y - b.y;
      } else if (flee) {
        dx = b.x - player.x;
        dy = b.y - player.y;
      } else {
        // wander
        if (Math.random() < 0.03) {
          const ang = rand(0, Math.PI * 2);
          b.vx = Math.cos(ang) * rand(70, 190);
          b.vy = Math.sin(ang) * rand(70, 190);
        }
        dx = b.vx;
        dy = b.vy;
      }

      const mag = Math.hypot(dx, dy) || 1;
      dx /= mag; dy /= mag;

      const speed = clamp(270 - Math.sqrt(b.mass) * 11.0, 110, 270);
      b.x += dx * speed * dt;
      b.y += dy * speed * dt;

      // bots eat food too (THIS makes the game not die after 5 seconds)
      if (Math.random() < 0.35) botEatNearbyFood(b);

      // mild passive growth keeps pressure
      if (Math.random() < 0.01) {
        b.mass += 0.12;
        b.r = massToRadius(b.mass);
      }

      // edge bounce
      if (b.x < b.r || b.x > WORLD_W - b.r) b.vx *= -1;
      if (b.y < b.r || b.y > WORLD_H - b.r) b.vy *= -1;

      clampEntity(b);
    }
  }

  function botEatNearbyFood(bot) {
    for (const f of state.entities) {
      if (f.type !== "food") continue;
      const rSum = bot.r + f.r;
      if (dist2(bot.x, bot.y, f.x, f.y) <= rSum * rSum) {
        bot.mass += f.mass * 0.35;
        bot.r = massToRadius(bot.mass);
        removeEntity(f.id);
        return;
      }
    }
  }

  function updateCamera() {
    const p = getPlayer();
    if (!p) return;

    const rect = getViewportRect();
    const baseZoom = computeZoom(p.mass);

    state.camera.zoom = clamp(baseZoom + state.camera.wheelZoom, 0.62, 1.25);
    const z = state.camera.zoom;

    const targetX = p.x - (rect.width / 2) / z;
    const targetY = p.y - (rect.height / 2) / z;

    state.camera.tx = lerp(state.camera.tx, targetX, 0.12);
    state.camera.ty = lerp(state.camera.ty, targetY, 0.12);

    state.camera.x = state.camera.tx;
    state.camera.y = state.camera.ty;

    const moveX = -state.camera.x * z;
    const moveY = -state.camera.y * z;
    dom.world.style.transform = `translate(${moveX}px, ${moveY}px) scale(${z})`;
  }

  function renderEntities() {
    for (const e of state.entities) {
      if (!e.el) continue;
      const tx = `${(e.x - e.r).toFixed(2)}px`;
      const ty = `${(e.y - e.r).toFixed(2)}px`;

      e.el.style.setProperty("--tx", tx);
      e.el.style.setProperty("--ty", ty);
      e.el.style.setProperty("--s", "1");

      e.el.style.width = `${(e.r * 2).toFixed(1)}px`;
      e.el.style.height = `${(e.r * 2).toFixed(1)}px`;

      e.el.style.transform = `translate(${tx}, ${ty})`;

      if (e.type === "player") e.el.textContent = "YOU";
      else if (e.type === "powerup") e.el.textContent = e.label;
      else e.el.textContent = "";
    }
  }

  /**********************
   * COLLISIONS
   **********************/
  function growEntity(ent, addMass) {
    ent.mass = clamp(ent.mass + addMass, 8, 999999);
    ent.r = massToRadius(ent.mass);
  }

  function handleCollisions() {
    const p = getPlayer();
    if (!p) return;

    // magnet pulls food a bit towards player
    if (state.abilities.magnetTime > 0) {
      for (const f of state.entities) {
        if (f.type !== "food") continue;
        const dx = p.x - f.x;
        const dy = p.y - f.y;
        const d = Math.hypot(dx, dy);
        if (d < 240 && d > 1) {
          f.x += (dx / d) * 120 * (1 / (d / 40)) * 0.016; // small pull
          f.y += (dy / d) * 120 * (1 / (d / 40)) * 0.016;
        }
      }
    }

    for (const e of [...state.entities]) {
      if (e.id === p.id) continue;

      const rSum = p.r + e.r;
      const hit = dist2(p.x, p.y, e.x, e.y) <= rSum * rSum;
      if (!hit) continue;

      if (e.type === "food") {
        addScore(1, e.x, e.y, "#57ff8a");
        growEntity(p, e.mass);
        popRemove(e, true);
      }

      if (e.type === "powerup") {
        applyPowerup(e);
        popRemove(e, true);
      }

      if (e.type === "bot") {
        const shielded = state.abilities.shieldTime > 0;
        if (shielded) {
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const mag = Math.hypot(dx, dy) || 1;
          e.x += (dx / mag) * 38;
          e.y += (dy / mag) * 38;
          clampEntity(e);
          continue;
        }

        if (p.mass > e.mass * 1.10) {
          addScore(18, e.x, e.y, "#ffd36b");
          growEntity(p, e.mass * 0.55);
          popRemove(e, true);
        } else if (e.mass > p.mass * 1.10) {
          playerDeath();
          return;
        }
      }
    }
  }

  function playerDeath() {
    if (!state.running) return;
    state.running = false;

    const p = getPlayer();
    if (!p) return;

    burstParticles(p.x, p.y, "#ff4b6e");
    popRemove(p, true);

    dom.overlayHelp.classList.add("show");
    dom.overlayHelp.querySelector("h2").textContent = "YOU GOT EATEN 💀";
    dom.overlayHelp.querySelector("p").textContent =
      `Final Score: ${Math.floor(state.score)} — Press RESET to play again.`;
  }

  /**********************
   * COORDS
   **********************/
  function getViewportRect() {
    return dom.viewport.getBoundingClientRect();
  }

  function screenToWorld(clientX, clientY) {
    const rect = getViewportRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const z = state.camera.zoom;
    return {
      x: px / z + state.camera.x,
      y: py / z + state.camera.y
    };
  }

  /**********************
   * AUTO SPAWN
   **********************/
  let tFood = 0, tBot = 0, tPower = 0;

  function autoSpawn(dt) {
    if (!state.running) return;

    tFood += dt * 1000;
    tBot += dt * 1000;
    tPower += dt * 1000;

    if (tFood >= SPAWN.foodEvery) {
      tFood = 0;
      spawnFood(2);
    }

    if (tBot >= SPAWN.botEvery) {
      tBot = 0;
      const bots = state.entities.filter(e => e.type === "bot").length;
      if (bots < LIMITS.bots) spawnBot();
    }

    if (tPower >= SPAWN.powerEvery) {
      tPower = 0;
      const pw = state.entities.filter(e => e.type === "powerup").length;
      if (pw < LIMITS.powerups && Math.random() < 0.75) spawnPowerup();
    }
  }

  /**********************
   * HUD
   **********************/
  function updateHUD(dt) {
    const p = getPlayer();

    dom.hudScore.textContent = String(Math.max(0, Math.floor(state.score)));
    dom.hudMass.textContent = p ? String(Math.floor(p.mass)) : "0";
    dom.hudTime.textContent = formatTime(state.timeLeft);
    dom.hudCombo.textContent = state.combo > 0 ? `x${state.combo}` : "-";

    if (state.running) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.running = false;
        dom.overlayHelp.classList.add("show");
        dom.overlayHelp.querySelector("h2").textContent = "TIME UP ✅";
        dom.overlayHelp.querySelector("p").textContent =
          `Final Score: ${Math.floor(state.score)} — Press RESET to play again.`;
      }
    }

    // FPS
    state.stats.frameCount++;
    state.stats.fpsTimer += dt;
    if (state.stats.fpsTimer >= 0.5) {
      state.stats.fps = Math.round(state.stats.frameCount / state.stats.fpsTimer);
      state.stats.frameCount = 0;
      state.stats.fpsTimer = 0;
    }

    // miniHud
    const fpsEl = dom.miniHud.querySelector("#mhFps");
    const botsEl = dom.miniHud.querySelector("#mhBots");
    const bombEl = dom.miniHud.querySelector("#mhBomb");
    const dashEl = dom.miniHud.querySelector("#mhDash");
    const shieldEl = dom.miniHud.querySelector("#mhShield");
    const magEl = dom.miniHud.querySelector("#mhMag");

    fpsEl.textContent = String(state.stats.fps);
    botsEl.textContent = String(state.entities.filter(e => e.type === "bot").length);
    bombEl.textContent = String(state.abilities.bombCharges);

    dashEl.textContent = state.abilities.dashCd <= 0 ? "READY" : `${state.abilities.dashCd.toFixed(1)}s`;
    shieldEl.textContent = state.abilities.shieldCd <= 0 ? "READY" : `${state.abilities.shieldCd.toFixed(1)}s`;
    magEl.textContent = state.abilities.magnetTime > 0 ? `${state.abilities.magnetTime.toFixed(1)}s` : "OFF";
  }

  function updateInspector() {
    const sel = getEntityById(state.selectedId);
    if (!sel) {
      dom.selType.value.textContent = "-";
      dom.selSize.value.textContent = "-";
      dom.selMass.value.textContent = "-";
      dom.selPos.value.textContent = "-";
      return;
    }
    dom.selType.value.textContent = sel.type.toUpperCase();
    dom.selSize.value.textContent = `${Math.floor(sel.r)}px`;
    dom.selMass.value.textContent = `${Math.floor(sel.mass)}`;
    dom.selPos.value.textContent = `${Math.floor(sel.x)}, ${Math.floor(sel.y)}`;
  }

  /**********************
   * LOOP
   **********************/
  let last = performance.now();

  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (state.running) {
      // cooldowns
      state.abilities.magnetCd = Math.max(0, state.abilities.magnetCd - dt);

      updatePlayer(dt);
      updateBots(dt);
      autoSpawn(dt);
      handleCollisions();
    }

    updateCamera();
    renderEntities();
    updateHUD(dt);

    requestAnimationFrame(tick);
  }

  /**********************
   * EVENTS (8+)
   **********************/
  function wireEvents() {
    // pointermove
    window.addEventListener("pointermove", (ev) => {
      state.mouse.x = ev.clientX;
      state.mouse.y = ev.clientY;

      const rect = getViewportRect();
      state.mouse.inside =
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top && ev.clientY <= rect.bottom;

      // drag only powerup
      if (state.drag.active && state.drag.id != null) {
        const ent = getEntityById(state.drag.id);
        if (!ent) return;
        if (ent.type !== "powerup") return;

        const wp = screenToWorld(ev.clientX, ev.clientY);
        ent.x = wp.x + state.drag.offsetX;
        ent.y = wp.y + state.drag.offsetY;
        clampEntity(ent);

        // drop-on-touch auto activation feeling
        const p = getPlayer();
        if (p) {
          const rSum = p.r + ent.r;
          if (dist2(p.x, p.y, ent.x, ent.y) <= rSum * rSum) {
            applyPowerup(ent);
            popRemove(ent, true);
            state.drag.active = false;
            state.drag.id = null;
          }
        }
      }
    });

    // click empty space selects player
    dom.viewport.addEventListener("click", () => {
      if (state.playerId != null) selectEntity(state.playerId);
    });

    // contextmenu delete selected (except player)
    window.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const sel = getEntityById(state.selectedId);
      if (!sel) return;
      if (sel.type === "player") return;
      popRemove(sel, true);
    });

    // keydown
    window.addEventListener("keydown", (ev) => {
      state.keys.add(ev.code);

      if (ev.code === "KeyH") dom.overlayHelp.classList.toggle("show");
      if (ev.code === "KeyR") resetGame();

      if (ev.code === "KeyE" && state.running) activateShield();
      if (ev.code === "KeyQ" && state.running) activateBomb();

      if (ev.code === "Space") {
        if (!state.running) return;
        const p = getPlayer();
        if (!p) return;
        if (state.abilities.burstCd > 0) return;
        if (p.mass < 18) return;

        state.abilities.burstCd = 1.2;
        state.abilities.burstTime = 0.25;

        p.mass *= 0.97;
        p.r = massToRadius(p.mass);

        burstParticles(p.x, p.y, p.color);
        ping("BURST", p.x, p.y, "#45caff");
      }
    });

    // keyup
    window.addEventListener("keyup", (ev) => {
      state.keys.delete(ev.code);
    });

    // wheel
    window.addEventListener("wheel", (ev) => {
      const delta = Math.sign(ev.deltaY) * -0.03;
      state.camera.wheelZoom = clamp(state.camera.wheelZoom + delta, -0.18, 0.18);
    }, { passive: true });

    // resize
    window.addEventListener("resize", () => {
      updateCamera();
    });

    // pointerup ends drag
    window.addEventListener("pointerup", () => {
      state.drag.active = false;
      state.drag.id = null;
    });
  }

  /**********************
   * RESET
   **********************/
  function resetGame() {
    for (const e of [...state.entities]) e.el?.remove();
    state.entities = [];
    state.idSeq = 1;

    state.playerId = null;
    state.selectedId = null;

    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;

    state.timeLeft = 120;
    state.running = true;

    state.keys.clear();
    state.drag.active = false;
    state.drag.id = null;

    state.camera.x = 0;
    state.camera.y = 0;
    state.camera.tx = 0;
    state.camera.ty = 0;
    state.camera.zoom = 1;
    state.camera.wheelZoom = 0;

    state.abilities.dashCd = 0;
    state.abilities.shieldCd = 0;
    state.abilities.shieldTime = 0;
    state.abilities.bombCd = 0;
    state.abilities.bombCharges = 0;
    state.abilities.burstCd = 0;
    state.abilities.burstTime = 0;
    state.abilities.magnetTime = 0;
    state.abilities.magnetCd = 0;

    dom.overlayHelp.classList.remove("show");
    dom.overlayHelp.querySelector("h2").textContent = "DOM Events Used (8+)";
    dom.overlayHelp.querySelector("p").textContent =
      "Pure DOM + DOM Events. No canvas, no libraries. All elements are created dynamically via JS.";

    spawnPlayer();
    spawnFood(140);
    spawnBots(14);
    spawnPowerups(4);

    syncSelection();
  }

  /**********************
   * INIT
   **********************/
  function init() {
    buildUI();

    spawnPlayer();
    spawnFood(140);
    spawnBots(14);
    spawnPowerups(4);

    wireEvents();
    syncSelection();

    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(tick);
    });
  }

  init();
})();
