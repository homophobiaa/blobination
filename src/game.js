// src/game.js
import { GAME_NAME, WORLD_PRESETS, LIMITS, SPAWN, GROW, SCORE, COLORS, POWER_TYPES, BOT_NAMES, DEV_AUTHOR } from "./config.js";

export function init(){
  "use strict";

  /**********************
   * STATE
   **********************/
  const dev = {
    autoSpawnEnabled: true,
    variableMouseSpeedEnabled: false,
    worldPreset: "medium"
  };

  const world = { w: WORLD_PRESETS.medium.w, h: WORLD_PRESETS.medium.h };

  const state = {
    entities: [],
    byType: { player: null, bot: [], food: [], powerup: [] },
    idSeq: 1,

    selectedId: null,

    score: 0,
    combo: 0,
    comboTimer: 0,

    timeLeft: 120,
    running: false,
    started: false,

    keys: new Set(),
    mouse: { x: 0, y: 0, inside: false },

    camera: { x: 0, y: 0, tx: 0, ty: 0, zoom: 1, wheelZoom: 0 },

    drag: { active: false, id: null, offsetX: 0, offsetY: 0 },

    abilities: {
      dashCd: 0,
      shieldCd: 0,
      shieldTime: 0,

      bombCd: 0,
      bombCharges: 0,

      magnetTime: 0,
      magnetCd: 0,

      burstActive: false,
      burstEnergy: 1.0,
      burstDrainPerSec: 0.55,
      burstRegenPerSec: 0.28,
      burstMinMass: 16,
      burstMassCostPerSec: 0.52,
    },

    stats: { fps: 0, frameCount: 0, fpsTimer: 0 },

    timers: { food: 0, bot: 0, power: 0, threat: 0 }
  };

  const dom = {
    app:null, center:null, viewport:null, world:null, entitiesLayer:null, fxLayer:null,
    leftPanel:null, rightPanel:null, miniHud:null, credit:null,
    hudScore:null, hudMass:null, hudTime:null, hudCombo:null,
    selType:null, selSize:null, selMass:null, selPos:null,
    leaderboardBody:null,
    overlayStart:null, overlayHelp:null, overlayEnd:null, devModal:null,
    btnFood:null, btnBot:null, btnPower:null, btnReset:null, btnStart:null,
    devDot:null
  };

  const pools = { floatText: [], particle: [] };

  /**********************
   * UTIL
   **********************/
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const lerp = (a, b, t) => a + (b - a) * t;

  function dist2(ax, ay, bx, by){ const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }
  function formatTime(sec){ sec=Math.max(0,Math.floor(sec)); const m=(sec/60)|0, s=sec%60; return `${m}:${String(s).padStart(2,"0")}`; }
  function massToRadius(mass){ return 10 + Math.sqrt(mass) * 2.25; }

  function diminishGain(currentMass){
    const k = GROW.diminishK;
    const m = currentMass * GROW.diminishMassFactor;
    return clamp(k / (k + m), 0.10, 1.0);
  }

  function playerBaseSpeed(mass){ return clamp(330 - Math.sqrt(mass) * 12.2, 160, 330); }
  function botMaxSpeed(mass){ return clamp(305 - Math.sqrt(mass) * 10.6, 120, 305); }
  function computeZoom(mass){ const z = 1.18 - Math.sqrt(mass) * 0.0138; return clamp(z, 0.66, 1.20); }

  function clampEntity(e){
    e.x = clamp(e.x, e.r, world.w - e.r);
    e.y = clamp(e.y, e.r, world.h - e.r);
  }

  function getViewportRect(){ return dom.viewport.getBoundingClientRect(); }

  function screenToWorld(clientX, clientY){
    const rect = getViewportRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const z = state.camera.zoom;
    return { x: px / z + state.camera.x, y: py / z + state.camera.y };
  }

  function scaleForZoom(base, min, max){ return clamp(base / (state.camera.zoom || 1), min, max); }

  /**********************
   * SPATIAL GRID (perf)
   **********************/
  const grid = makeGrid(160);

  function makeGrid(cellSize){
    return {
      cell: cellSize,
      cols: 1,
      rows: 1,
      cells: [],
      used: [],
      buildForWorld(){
        this.cols = Math.max(1, Math.ceil(world.w / this.cell));
        this.rows = Math.max(1, Math.ceil(world.h / this.cell));
        const n = this.cols * this.rows;
        this.cells = Array.from({ length: n }, () => []);
        this.used.length = 0;
      },
      begin(){
        for (let i = 0; i < this.used.length; i++){
          this.cells[this.used[i]].length = 0;
        }
        this.used.length = 0;
      },
      idxFor(x, y){
        const cx = clamp((x / this.cell) | 0, 0, this.cols - 1);
        const cy = clamp((y / this.cell) | 0, 0, this.rows - 1);
        return cy * this.cols + cx;
      },
      add(e){
        const idx = this.idxFor(e.x, e.y);
        const bucket = this.cells[idx];
        if (bucket.length === 0) this.used.push(idx);
        bucket.push(e);
      },
      neighbors(x, y){
        const cx = clamp((x / this.cell) | 0, 0, this.cols - 1);
        const cy = clamp((y / this.cell) | 0, 0, this.rows - 1);
        const out = [];
        for (let oy=-1; oy<=1; oy++){
          const yy = cy + oy;
          if (yy < 0 || yy >= this.rows) continue;
          for (let ox=-1; ox<=1; ox++){
            const xx = cx + ox;
            if (xx < 0 || xx >= this.cols) continue;
            out.push(this.cells[yy * this.cols + xx]);
          }
        }
        return out;
      }
    };
  }

  /**********************
   * UI BUILD
   **********************/
  function mkDivider(){ const d=document.createElement("div"); d.className="hr"; return d; }
  function mkButton(text, cls){ const b=document.createElement("button"); b.className=cls; b.textContent=text; return b; }
  function mkKPI(label){
    const box=document.createElement("div"); box.className="kpi";
    const l=document.createElement("div"); l.className="label"; l.textContent=label;
    const v=document.createElement("div"); v.className="value"; v.textContent="0";
    box.append(l,v);
    return { box, value:v };
  }
  function mkInfoRow(name){
    const row=document.createElement("div"); row.className="infoRow";
    const a=document.createElement("span"); a.textContent=name;
    const b=document.createElement("span"); b.textContent="-";
    row.append(a,b);
    return { row, value:b };
  }
  function mkOverlay(id){
    const ov=document.createElement("div");
    ov.id=id; ov.className="overlay";
    ov.innerHTML=`<div class="card"></div>`;
    return ov;
  }

  function applyWorldSize(){
    dom.world.style.width = `${world.w}px`;
    dom.world.style.height = `${world.h}px`;
    grid.buildForWorld();
  }

  function setWorldPreset(preset){
    if (!WORLD_PRESETS[preset]) return;
    dev.worldPreset = preset;
    world.w = WORLD_PRESETS[preset].w;
    world.h = WORLD_PRESETS[preset].h;
    applyWorldSize();

    for (const e of state.entities) clampEntity(e);

    const p = getPlayer();
    if (p){
      state.camera.tx = state.camera.x = clamp(p.x - 400, 0, Math.max(0, world.w - 800));
      state.camera.ty = state.camera.y = clamp(p.y - 300, 0, Math.max(0, world.h - 600));
      ping(`WORLD: ${preset.toUpperCase()}`, p.x, p.y, "#ffd36b");
    }
    syncDevUI();
  }

  function buildUI(){
    dom.app = document.createElement("div"); dom.app.id="app"; document.body.appendChild(dom.app);

    dom.center = document.createElement("div"); dom.center.id="center"; dom.app.appendChild(dom.center);
    dom.viewport = document.createElement("div"); dom.viewport.id="viewport"; dom.center.appendChild(dom.viewport);

    dom.world = document.createElement("div"); dom.world.id="world"; dom.viewport.appendChild(dom.world);
    dom.entitiesLayer = document.createElement("div"); dom.entitiesLayer.id="entitiesLayer"; dom.world.appendChild(dom.entitiesLayer);
    dom.fxLayer = document.createElement("div"); dom.fxLayer.id="fxLayer"; dom.world.appendChild(dom.fxLayer);

    applyWorldSize();

    dom.leftPanel = document.createElement("div");
    dom.leftPanel.id="leftPanel"; dom.leftPanel.className="panel";
    dom.leftPanel.innerHTML = `<div class="panelInner"></div>`;
    dom.app.appendChild(dom.leftPanel);

    dom.rightPanel = document.createElement("div");
    dom.rightPanel.id="rightPanel"; dom.rightPanel.className="panel";
    dom.rightPanel.innerHTML = `<div class="panelInner"></div>`;
    dom.app.appendChild(dom.rightPanel);

    dom.credit = document.createElement("div");
    dom.credit.id = "credit";
    dom.credit.innerHTML = `Created by <b>${DEV_AUTHOR}</b>`;
    dom.app.appendChild(dom.credit);

    const leftInner = dom.leftPanel.querySelector(".panelInner");
    const rightInner = dom.rightPanel.querySelector(".panelInner");

    const leftTitle = document.createElement("div");
    leftTitle.className="title";
    leftTitle.innerHTML = `<h1>${GAME_NAME.toUpperCase()}</h1><span class="badge">DOM</span>`;
    leftInner.appendChild(leftTitle);

    const kpiGrid = document.createElement("div"); kpiGrid.className="kpiGrid"; leftInner.appendChild(kpiGrid);
    const kScore = mkKPI("Score");
    const kMass = mkKPI("Mass");
    const kTime = mkKPI("Time");
    const kCombo = mkKPI("Combo");
    kpiGrid.append(kScore.box,kMass.box,kTime.box,kCombo.box);
    dom.hudScore=kScore.value; dom.hudMass=kMass.value; dom.hudTime=kTime.value; dom.hudCombo=kCombo.value;

    leftInner.appendChild(mkDivider());
    const row = document.createElement("div"); row.className="btnRow"; leftInner.appendChild(row);

    dom.btnFood = mkButton("Food +25", "uiBtn primary");
    dom.btnBot = mkButton("Bots +3", "uiBtn");
    dom.btnPower = mkButton("Power +2", "uiBtn");
    dom.btnReset = mkButton("Reset (R)", "uiBtn danger");
    row.append(dom.btnFood, dom.btnBot, dom.btnPower, dom.btnReset);

    leftInner.appendChild(mkDivider());

    const help = document.createElement("div");
    help.className="helpBox";
    help.innerHTML = `
      <div style="color:rgba(255,255,255,.88);font-weight:900;margin-bottom:6px;">Controls</div>
      <div><code>Mouse</code> aim (constant speed) • <code>WASD</code> optional</div>
      <div><code>Shift</code> Dash • <code>E</code> Shield • <code>Q</code> Bomb</div>
      <div><code>Hold Space</code> Burst (linear)</div>
      <div><code>Drag</code> powerups onto YOU to activate</div>
      <div><code>Click</code> selects • click selected again = action</div>
      <div><code>Esc</code> Menu • <code>H</code> Help • <code>R</code> Reset</div>
    `;
    leftInner.appendChild(help);

    dom.miniHud = document.createElement("div");
    dom.miniHud.id="miniHud";
    dom.miniHud.innerHTML = `
      <div class="row">
        <span class="chip">FPS <b id="mhFps">0</b></span>
        <span class="chip">Bots <b id="mhBots">0</b></span>
        <span class="chip">Threats <b id="mhThreats">0</b></span>
      </div>
      <div class="row" style="margin-top:8px;">
        <span class="chip">Dash <b id="mhDash">READY</b></span>
        <span class="chip">Shield <b id="mhShield">READY</b></span>
        <span class="chip">Bomb <b id="mhBomb">0</b></span>
      </div>
      <div class="row" style="margin-top:8px;">
        <span class="chip">Magnet <b id="mhMag">OFF</b></span>
        <span class="chip">Burst <b id="mhBurst">100%</b></span>
      </div>
    `;
    dom.center.appendChild(dom.miniHud);

    const rightTitle = document.createElement("div");
    rightTitle.className="title";
    rightTitle.innerHTML = `<h1>ACTIVE</h1><span class="badge">Live</span>`;
    rightInner.appendChild(rightTitle);

    dom.selType = mkInfoRow("Type");
    dom.selSize = mkInfoRow("Radius");
    dom.selMass = mkInfoRow("Mass");
    dom.selPos  = mkInfoRow("Pos");
    rightInner.append(dom.selType.row, dom.selSize.row, dom.selMass.row, dom.selPos.row, mkDivider());

    const lb = document.createElement("div");
    lb.id="leaderboard";
    lb.innerHTML = `<div class="lbTitle">Leaderboard</div>`;
    dom.leaderboardBody = document.createElement("div");
    lb.appendChild(dom.leaderboardBody);
    rightInner.appendChild(lb);

    dom.overlayStart = mkOverlay("overlayStart");
    dom.overlayHelp  = mkOverlay("overlayHelp");
    dom.overlayEnd   = mkOverlay("overlayEnd");
    dom.devModal     = mkOverlay("devModal");
    dom.center.append(dom.overlayStart, dom.overlayHelp, dom.overlayEnd, dom.devModal);

    // START MENU (styled)
    dom.overlayStart.classList.add("show");
    dom.overlayStart.querySelector(".card").innerHTML = `
      <div class="heroRow">
        <div class="logoBlock">
          <div class="logoName">${GAME_NAME}</div>
          <div class="logoSub">
            Pure <b>DOM + Events</b> arena. No canvas. No libraries.<br/>
            Survive, grow, and reach <b>#1</b>… but bots grow too.
          </div>
        </div>
        <div class="pillRow">
          <div class="pill">Drag Powerups</div>
          <div class="pill">Mouse Control</div>
          <div class="pill">.io vibes</div>
        </div>
      </div>

      <div class="kbdRow">
        <div class="kbd"><b>Esc</b> menu</div>
        <div class="kbd"><b>R</b> restart</div>
        <div class="kbd"><b>Shift</b> dash</div>
        <div class="kbd"><b>Space</b> burst</div>
        <div class="kbd"><b>E</b> shield</div>
        <div class="kbd"><b>Q</b> bomb</div>
      </div>

      <p>
        <b>Powerups:</b> ⚡ Dash boost • 🛡️ Shield • 💣 Bomb charge • 🧲 Magnet (pulls nearby food).
        <br/><span style="opacity:.85">Tip: Magnet + Burst farms fast, but threats still exist.</span>
      </p>

      <div class="ctaRow" id="startCtas"></div>
    `;

    const startCtas = dom.overlayStart.querySelector("#startCtas");
    dom.btnStart = mkButton("Start", "uiBtn primary");
    const btnHelp = mkButton("Help (H)", "uiBtn");
    const btnDev  = mkButton("Developer", "uiBtn");
    startCtas.append(dom.btnStart, btnHelp, btnDev);

    dom.btnStart.addEventListener("click", () => startGame());
    btnHelp.addEventListener("click", () => toggleHelp(true));
    btnDev.addEventListener("click", () => toggleDevModal(true));

    dom.overlayHelp.querySelector(".card").innerHTML = `
      <div class="heroRow">
        <div class="logoBlock">
          <div class="logoName">Help</div>
          <div class="logoSub">Quick guide so it’s actually playable.</div>
        </div>
        <div class="pillRow">
          <div class="pill">H close</div>
          <div class="pill">R reset</div>
          <div class="pill">Esc menu</div>
        </div>
      </div>

      <p>
        <b>Movement:</b> aim with the mouse (constant speed). Optional WASD nudges.
        <br/><b>Burst:</b> hold <b>Space</b> for smooth speed boost (drains energy + slightly costs mass).
        <br/><b>Drag & Drop:</b> drag powerups onto yourself to activate instantly.
      </p>

      <p><b>Difficulty stays real:</b> bots eat food + can eat each other → threats keep existing.</p>

      <div class="ctaRow">
        <button class="uiBtn primary" id="helpClose">Close</button>
      </div>
    `;
    dom.overlayHelp.querySelector("#helpClose").addEventListener("click", () => toggleHelp(false));

    dom.overlayEnd.querySelector(".card").innerHTML = `
      <div class="heroRow">
        <div class="logoBlock">
          <div class="logoName" id="endTitle">Game Over</div>
          <div class="logoSub" id="endSub">Press R to restart instantly.</div>
        </div>
        <div class="pillRow">
          <div class="pill">R restart</div>
          <div class="pill">Esc menu</div>
        </div>
      </div>

      <p id="endStats"></p>

      <div class="ctaRow">
        <button class="uiBtn danger" id="endRestart">Restart (R)</button>
        <button class="uiBtn" id="endMenu">Menu (Esc)</button>
      </div>
    `;
    dom.overlayEnd.querySelector("#endRestart").addEventListener("click", () => restartGame());
    dom.overlayEnd.querySelector("#endMenu").addEventListener("click", () => showStartMenu());

    // DEV MODAL (world size presets + perf toggles)
    dom.devModal.querySelector(".card").innerHTML = `
      <div class="heroRow">
        <div class="logoBlock">
          <div class="logoName">Developer Tools</div>
          <div class="logoSub">For demos + debugging. Doesn’t affect requirements.</div>
        </div>
        <div class="pillRow">
          <div class="pill">Esc close</div>
          <div class="pill">Perf-friendly</div>
        </div>
      </div>

      <div class="devGrid">
        <div class="devItem">
          <div class="dTitle">Auto Spawning</div>
          <div class="dDesc">Turn OFF auto food/bot/power spawning so manual spawn buttons matter.</div>
          <button class="uiBtn primary" id="devAutoSpawnBtn">Toggle Auto Spawn</button>
          <div class="dState" id="devAutoSpawnState">State: ON</div>
        </div>

        <div class="devItem">
          <div class="dTitle">Mouse Speed Mode</div>
          <div class="dDesc">Default is constant speed. Toggle classic “cursor distance = speed”.</div>
          <button class="uiBtn primary" id="devMouseSpeedBtn">Toggle Variable Speed</button>
          <div class="dState" id="devMouseSpeedState">State: OFF</div>
        </div>

        <div class="devItem">
          <div class="dTitle">World Size</div>
          <div class="dDesc">Switch arena size: Small / Medium (default) / Large.</div>
          <div class="sizePills">
            <button id="wsSmall">Small</button>
            <button id="wsMedium" class="active">Medium</button>
            <button id="wsLarge">Large</button>
          </div>
          <div class="dState" id="devWorldState">Current: Medium</div>
        </div>

        <div class="devItem">
          <div class="dTitle">Entity Limits</div>
          <div class="dDesc">Change caps live. Auto-spawn respects these immediately.</div>

          <div class="devControls">
            <label>Food</label>
            <input type="number" id="limFood" min="0" max="2000" step="10" />
            <label>Bots</label>
            <input type="number" id="limBots" min="0" max="200" step="1" />
            <label>Powers</label>
            <input type="number" id="limPowers" min="0" max="200" step="1" />
          </div>

          <div class="ctaRow" style="margin-top:10px;">
            <button class="uiBtn primary" id="devApplyLimitsBtn">Apply</button>
          </div>
          <div class="dState" id="devLimitsState">Applied: Food ${LIMITS.food}, Bots ${LIMITS.bots}, Powers ${LIMITS.powerups}</div>
        </div>
      </div>

      <div class="ctaRow" style="margin-top:14px;">
        <button class="uiBtn" id="devCloseBtn">Close</button>
      </div>
    `;

    dom.devModal.querySelector("#devCloseBtn").addEventListener("click", () => toggleDevModal(false));
    dom.devModal.querySelector("#devAutoSpawnBtn").addEventListener("click", () => { dev.autoSpawnEnabled = !dev.autoSpawnEnabled; syncDevUI(); });
    dom.devModal.querySelector("#devMouseSpeedBtn").addEventListener("click", () => { dev.variableMouseSpeedEnabled = !dev.variableMouseSpeedEnabled; syncDevUI(); });

    dom.devModal.querySelector("#wsSmall").addEventListener("click", () => setWorldPreset("small"));
    dom.devModal.querySelector("#wsMedium").addEventListener("click", () => setWorldPreset("medium"));
    dom.devModal.querySelector("#wsLarge").addEventListener("click", () => setWorldPreset("large"));

    const limFood = dom.devModal.querySelector("#limFood");
    const limBots = dom.devModal.querySelector("#limBots");
    const limPowers = dom.devModal.querySelector("#limPowers");
    limFood.value = String(LIMITS.food);
    limBots.value = String(LIMITS.bots);
    limPowers.value = String(LIMITS.powerups);

    dom.devModal.querySelector("#devApplyLimitsBtn").addEventListener("click", () => {
      const f = clamp(parseInt(limFood.value || "0", 10), 0, 2000);
      const b = clamp(parseInt(limBots.value || "0", 10), 0, 200);
      const p = clamp(parseInt(limPowers.value || "0", 10), 0, 200);
      LIMITS.food = f; LIMITS.bots = b; LIMITS.powerups = p;
      syncDevUI();
      const pl = getPlayer();
      if (pl) ping("LIMITS APPLIED", pl.x, pl.y, "#45caff");
    });

    // Dev dot
    dom.devDot = document.createElement("div");
    dom.devDot.id="devDot";
    dom.devDot.innerHTML = `<span>⚙️</span>`;
    dom.app.appendChild(dom.devDot);
    dom.devDot.addEventListener("click", () => toggleDevModal(true));

    // Buttons
    dom.btnFood.addEventListener("click", () => { spawnFood(25); const p=getPlayer(); if(p) ping("Food +25", p.x, p.y, "#57ff8a"); });
    dom.btnBot.addEventListener("click", () => { spawnBots(3); const p=getPlayer(); if(p) ping("Bots +3", p.x, p.y, "#ff7a4b"); });
    dom.btnPower.addEventListener("click", () => { spawnPowerups(2); const p=getPlayer(); if(p) ping("Power +2", p.x, p.y, "#ffd36b"); });
    dom.btnReset.addEventListener("click", () => restartGame());

    syncDevUI();
  }

  function syncDevUI(){
    const a = dom.devModal.querySelector("#devAutoSpawnState");
    const m = dom.devModal.querySelector("#devMouseSpeedState");
    const l = dom.devModal.querySelector("#devLimitsState");
    const w = dom.devModal.querySelector("#devWorldState");

    if (a) a.textContent = `State: ${dev.autoSpawnEnabled ? "ON" : "OFF"}`;
    if (m) m.textContent = `State: ${dev.variableMouseSpeedEnabled ? "ON" : "OFF"}`;
    if (l) l.textContent = `Applied: Food ${LIMITS.food}, Bots ${LIMITS.bots}, Powers ${LIMITS.powerups}`;
    if (w) w.textContent = `Current: ${dev.worldPreset[0].toUpperCase() + dev.worldPreset.slice(1)}`;

    const s = dom.devModal.querySelector("#wsSmall");
    const md = dom.devModal.querySelector("#wsMedium");
    const lg = dom.devModal.querySelector("#wsLarge");
    if (s && md && lg){
      s.classList.toggle("active", dev.worldPreset === "small");
      md.classList.toggle("active", dev.worldPreset === "medium");
      lg.classList.toggle("active", dev.worldPreset === "large");
    }
  }

  /**********************
   * ENTITIES
   **********************/
  function getPlayer(){ return state.byType.player; }

  function addToType(e){
    if (e.type === "player") state.byType.player = e;
    else state.byType[e.type].push(e);
  }
  function removeFromType(e){
    if (e.type === "player") state.byType.player = null;
    else {
      const arr = state.byType[e.type];
      const idx = arr.indexOf(e);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  function createEntity(type, x, y, opts={}){
    const id = state.idSeq++;
    const e = {
      id, type, x, y,
      vx: opts.vx ?? 0,
      vy: opts.vy ?? 0,
      mass: opts.mass ?? 10,
      r: opts.r ?? 16,
      color: opts.color ?? "#fff",
      label: opts.label ?? "",
      powerType: opts.powerType ?? null,
      name: opts.name ?? null,
      isSelected: false,
      ai: { targetId: null, retargetT: rand(0.2, 1.0), personality: Math.random() },

      el:null, nameEl:null,

      _lr:-1, _lx:1e9, _ly:1e9
    };

    const el = document.createElement("div");
    el.className = `entity ${type}`;
    el.dataset.id = String(id);
    el.style.setProperty("--c", e.color);
    el.style.setProperty("--x", "0px");
    el.style.setProperty("--y", "0px");

    // (1) click
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (state.selectedId === id) activateSelected(e);
      else selectEntity(id);
    });

    // (2) dblclick
    el.addEventListener("dblclick", (ev) => {
      ev.stopPropagation();
      selectEntity(id);
      cycleColor(e);
    });

    // (3) pointerdown
    el.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      selectEntity(id);
      if (type !== "powerup") return;

      state.drag.active = true;
      state.drag.id = id;
      el.setPointerCapture(ev.pointerId);

      const wp = screenToWorld(ev.clientX, ev.clientY);
      state.drag.offsetX = e.x - wp.x;
      state.drag.offsetY = e.y - wp.y;
    });

    // (4) pointerup
    el.addEventListener("pointerup", (ev) => {
      ev.stopPropagation();
      if (state.drag.id === id){
        state.drag.active = false;
        state.drag.id = null;
      }
    });

    // (5) mouseenter / (6) mouseleave
    el.addEventListener("mouseenter", () => { el.style.filter = "brightness(1.08)"; });
    el.addEventListener("mouseleave", () => { el.style.filter = ""; });

    if (type === "player"){
      el.textContent = "YOU";
    } else if (type === "powerup"){
      el.textContent = e.label;
    } else if (type === "bot"){
      const nameEl = document.createElement("div");
      nameEl.className = "nameTag";
      nameEl.textContent = e.name || "Bot";
      el.appendChild(nameEl);
      e.nameEl = nameEl;
    }

    e.el = el;

    state.entities.push(e);
    addToType(e);
    dom.entitiesLayer.appendChild(el);

    return e;
  }

  function removeEntity(e){
    if (!e) return;
    const idx = state.entities.indexOf(e);
    if (idx !== -1) state.entities.splice(idx, 1);
    removeFromType(e);
    e.el?.remove();

    if (state.selectedId === e.id){
      state.selectedId = getPlayer()?.id ?? null;
      syncSelection();
    }
  }

  function spawnPlayer(){
    const p = createEntity("player", world.w/2, world.h/2, {
      mass: 24, r: massToRadius(24),
      color: COLORS.player[0], label: "YOU"
    });
    state.selectedId = p.id;
    syncSelection();
  }

  function spawnFood(count=1){
    const existing = state.byType.food.length;
    const can = Math.max(0, LIMITS.food - existing);
    const n = Math.min(count, can);

    for (let i=0;i<n;i++){
      const x = rand(36, world.w - 36);
      const y = rand(36, world.h - 36);
      const r = randInt(5, 9);
      createEntity("food", x, y, {
        mass: r * 0.55,
        r,
        color: pick(COLORS.food),
      });
    }
  }

  function spawnBot(opts={}){
    if (state.byType.bot.length >= LIMITS.bots) return null;

    const player = getPlayer();
    const pm = player ? player.mass : 30;

    let mass;
    if (opts.threat) mass = clamp(pm * rand(1.18, 1.55) + rand(8, 22), 18, 520);
    else {
      const bias = Math.random();
      const mult = bias < 0.45 ? rand(0.70, 0.98)
                 : bias < 0.80 ? rand(0.95, 1.18)
                 : rand(1.18, 1.40);
      mass = clamp(pm * mult + rand(-6, 16), 14, 480);
    }

    const r = massToRadius(mass);

    let x = rand(80, world.w - 80);
    let y = rand(80, world.h - 80);

    if (player){
      for (let tries=0; tries<10; tries++){
        x = rand(80, world.w - 80);
        y = rand(80, world.h - 80);
        if (dist2(x, y, player.x, player.y) > 560*560) break;
      }
    }

    const name = BOT_NAMES[(state.idSeq + randInt(0, BOT_NAMES.length - 1)) % BOT_NAMES.length];

    const b = createEntity("bot", x, y, { mass, r, color: pick(COLORS.bot), name });
    const ang = rand(0, Math.PI*2);
    b.vx = Math.cos(ang) * rand(50, 140);
    b.vy = Math.sin(ang) * rand(50, 140);
    return b;
  }

  function spawnBots(n){ for (let i=0;i<n;i++) spawnBot(); }

  function spawnPowerup(){
    if (state.byType.powerup.length >= LIMITS.powerups) return;

    const x = rand(120, world.w - 120);
    const y = rand(120, world.h - 120);
    const ptype = pick(POWER_TYPES);

    const label = ptype === "DASH" ? "⚡"
                : ptype === "SHIELD" ? "🛡️"
                : ptype === "BOMB" ? "💣"
                : "🧲";

    createEntity("powerup", x, y, {
      mass: 6, r: 16,
      color: pick(COLORS.power),
      label, powerType: ptype
    });
  }
  function spawnPowerups(n){ for (let i=0;i<n;i++) spawnPowerup(); }

  function selectEntity(id){ state.selectedId = id; syncSelection(); }

  function syncSelection(){
    for (const e of state.entities){
      const sel = e.id === state.selectedId;
      if (e.isSelected !== sel){
        e.isSelected = sel;
        e.el?.classList.toggle("selected", sel);
      }
    }
    updateInspector();
  }

  function cycleColor(ent){
    if (!ent) return;
    if (ent.type === "player"){
      const idx = COLORS.player.indexOf(ent.color);
      const next = COLORS.player[(idx + 1) % COLORS.player.length];
      ent.color = next;
      ent.el.style.setProperty("--c", next);
      ping("COLOR", ent.x, ent.y, "#45caff");
    } else {
      ent.color = pick(["#45caff","#57ff8a","#ffd36b","#ff4b6e","#9b6bff"]);
      ent.el.style.setProperty("--c", ent.color);
    }
  }

  function activateSelected(ent){
    if (!ent) return;
    if (ent.type === "player"){
      if (state.abilities.shieldCd <= 0 && state.abilities.shieldTime <= 0) activateShield();
      else cycleColor(ent);
      return;
    }
    if (ent.type === "powerup"){
      applyPowerup(ent);
      popRemove(ent, true);
      return;
    }
    ping("SCAN", ent.x, ent.y, "#ffd36b");
  }

  /**********************
   * FX (pooled)
   **********************/
  function getFloatTextEl(){
    return pools.floatText.pop() || (() => {
      const el=document.createElement("div");
      el.className="floatText";
      el.addEventListener("animationend", () => {
        el.style.display="none";
        pools.floatText.push(el);
      });
      return el;
    })();
  }

  function spawnFloatText(text, x, y, color){
    const el = getFloatTextEl();
    el.textContent = text;
    el.style.setProperty("--fx", `${x}px`);
    el.style.setProperty("--fy", `${y}px`);
    el.style.setProperty("--tc", color || "#45caff");

    const p = getPlayer();
    const massBoost = p ? clamp(Math.sqrt(p.mass) * 0.06, 0, 6) : 0;
    const size = scaleForZoom(14 + massBoost, 14, 30);
    el.style.fontSize = `${size.toFixed(1)}px`;

    el.style.display="block";
    dom.fxLayer.appendChild(el);
  }

  function ping(text, x, y, color){ spawnFloatText(text, x, y, color); }

  function getParticleEl(){
    return pools.particle.pop() || (() => {
      const p=document.createElement("div");
      p.className="particle";
      p.addEventListener("animationend", () => {
        p.style.display="none";
        pools.particle.push(p);
      });
      return p;
    })();
  }

  function burstParticles(x, y, color){
    for (let i=0;i<10;i++){
      const p = getParticleEl();
      p.style.setProperty("--px", `${x}px`);
      p.style.setProperty("--py", `${y}px`);
      p.style.setProperty("--dx", `${rand(-70,70).toFixed(1)}px`);
      p.style.setProperty("--dy", `${rand(-70,70).toFixed(1)}px`);
      p.style.setProperty("--pc", color || "#fff");
      p.style.display="block";
      dom.fxLayer.appendChild(p);
    }
  }

  function popRemove(ent, withParticles=false){
    if (!ent?.el) return;
    if (withParticles) burstParticles(ent.x, ent.y, ent.color);
    ent.el.classList.add("pop");
    ent.el.addEventListener("animationend", () => removeEntity(ent), { once:true });
  }

  function addScore(amount, x, y, color){
    state.score += amount;
    if (amount > 0){
      state.combo++;
      state.comboTimer = 0.95;
    } else {
      state.combo = 0;
      state.comboTimer = 0;
    }
    spawnFloatText(amount > 0 ? `+${amount}` : `${amount}`, x, y, color || "#45caff");
  }

  function growEntity(ent, addMassRaw, mult=1.0){
    const factor = diminishGain(ent.mass);
    const add = addMassRaw * mult * factor;
    ent.mass = clamp(ent.mass + add, 8, 999999);
    ent.r = massToRadius(ent.mass);
  }

  function applyPowerup(power){
    if (!power) return;

    if (power.powerType === "DASH"){
      state.abilities.dashCd = Math.max(0, state.abilities.dashCd - 1.0);
      ping("DASH+", power.x, power.y, "#ffd36b");
    }
    if (power.powerType === "SHIELD"){
      state.abilities.shieldCd = Math.max(0, state.abilities.shieldCd - 2.0);
      ping("SHIELD+", power.x, power.y, "#57ff8a");
    }
    if (power.powerType === "BOMB"){
      state.abilities.bombCharges = clamp(state.abilities.bombCharges + 1, 0, 6);
      ping("BOMB+1", power.x, power.y, "#ff4b6e");
    }
    if (power.powerType === "MAGNET"){
      state.abilities.magnetTime = Math.max(state.abilities.magnetTime, 4.8);
      state.abilities.magnetCd = Math.max(state.abilities.magnetCd, 7.5);
      ping("MAGNET", power.x, power.y, "#45caff");
    }

    burstParticles(power.x, power.y, power.color);
    addScore(SCORE.power, power.x, power.y, "#ffd36b");
  }

  function activateShield(){
    const p = getPlayer();
    if (!p) return;
    if (state.abilities.shieldCd > 0) return;

    state.abilities.shieldTime = 2.2;
    state.abilities.shieldCd = 6.2;
    p.el.classList.add("shielded");
    burstParticles(p.x, p.y, "#57ff8a");
    ping("SHIELD", p.x, p.y, "#57ff8a");
  }

  function activateBomb(){
    const p = getPlayer();
    if (!p) return;
    if (state.abilities.bombCd > 0) return;
    if (state.abilities.bombCharges <= 0) return;

    state.abilities.bombCharges--;
    state.abilities.bombCd = 2.2;

    const R = 190, r2 = R*R;
    const buckets = grid.neighbors(p.x, p.y);

    for (const bucket of buckets){
      for (let i=bucket.length-1;i>=0;i--){
        const e = bucket[i];
        if (e === p) continue;
        if (e.type !== "food" && e.type !== "bot") continue;
        if (dist2(p.x,p.y,e.x,e.y) > r2) continue;

        if (e.type === "food"){
          addScore(1, e.x, e.y, "#ffd36b");
          popRemove(e, true);
        } else {
          if (p.mass >= e.mass * 0.92){
            addScore(10, e.x, e.y, "#ffd36b");
            popRemove(e, true);
          }
        }
      }
    }

    burstParticles(p.x, p.y, "#ffd36b");
    ping("BOMB", p.x, p.y, "#ffd36b");
  }

  /**********************
   * AI
   **********************/
  function wallAvoidance(x, y){
    const pad = 180;
    let ax = 0, ay = 0;
    if (x < pad) ax += (pad - x) / pad;
    if (x > world.w - pad) ax -= (x - (world.w - pad)) / pad;
    if (y < pad) ay += (pad - y) / pad;
    if (y > world.h - pad) ay -= (y - (world.h - pad)) / pad;
    return { ax, ay };
  }

  function nearestFood(bot){
    const foods = state.byType.food;
    if (!foods.length) return null;
    let best=null, bestD=Infinity;
    const samples = Math.min(18, foods.length);
    for (let i=0;i<samples;i++){
      const f = foods[(Math.random() * foods.length) | 0];
      const d = dist2(bot.x, bot.y, f.x, f.y);
      if (d < bestD){ bestD = d; best = f; }
    }
    return best;
  }

  function rebuildGrid(){
    grid.begin();
    const p = getPlayer();
    if (p) grid.add(p);

    const bots = state.byType.bot;
    for (let i=0;i<bots.length;i++) grid.add(bots[i]);

    const foods = state.byType.food;
    for (let i=0;i<foods.length;i++) grid.add(foods[i]);

    const pw = state.byType.powerup;
    for (let i=0;i<pw.length;i++) grid.add(pw[i]);
  }

  function botEatFood(bot){
    const buckets = grid.neighbors(bot.x, bot.y);
    for (const bucket of buckets){
      for (let i=bucket.length-1;i>=0;i--){
        const f = bucket[i];
        if (f.type !== "food") continue;
        const rSum = bot.r + f.r;
        if (dist2(bot.x, bot.y, f.x, f.y) <= rSum*rSum){
          growEntity(bot, f.mass, GROW.botFoodGainMult);
          popRemove(f, true);
          return;
        }
      }
    }
  }

  function botEatBots(bot){
    const buckets = grid.neighbors(bot.x, bot.y);
    for (const bucket of buckets){
      for (let i=bucket.length-1;i>=0;i--){
        const other = bucket[i];
        if (other.type !== "bot") continue;
        if (other === bot) continue;
        if (bot.mass <= other.mass * 1.18) continue;
        const rSum = bot.r + other.r;
        if (dist2(bot.x, bot.y, other.x, other.y) <= rSum*rSum){
          growEntity(bot, other.mass * 0.55, 1.0);
          popRemove(other, true);
          return;
        }
      }
    }
  }

  function findById(id){
    const p = getPlayer();
    if (p && p.id === id) return p;

    const bots = state.byType.bot;
    for (let i=0;i<bots.length;i++) if (bots[i].id === id) return bots[i];

    const foods = state.byType.food;
    for (let i=0;i<foods.length;i++) if (foods[i].id === id) return foods[i];

    const pw = state.byType.powerup;
    for (let i=0;i<pw.length;i++) if (pw[i].id === id) return pw[i];

    return null;
  }

  function updateBots(dt){
    const player = getPlayer();
    if (!player) return;
    const bots = state.byType.bot;

    for (let bi=0; bi<bots.length; bi++){
      const b = bots[bi];

      b.mass += 0.12 * dt;
      b.r = massToRadius(b.mass);

      const biggerThanPlayer = b.mass > player.mass * 1.08;
      const muchSmallerThanPlayer = b.mass < player.mass * 0.86;

      b.ai.retargetT -= dt;
      if (b.ai.retargetT <= 0){
        b.ai.retargetT = rand(0.35, 0.9);
        b.ai.targetId = null;

        if (muchSmallerThanPlayer){
          const f = nearestFood(b);
          if (f) b.ai.targetId = f.id;
        } else {
          if (biggerThanPlayer && Math.random() < 0.55) b.ai.targetId = player.id;
          else {
            const f = nearestFood(b);
            if (f) b.ai.targetId = f.id;
          }
        }
      }

      let tx = b.x, ty = b.y;
      const target = b.ai.targetId ? findById(b.ai.targetId) : null;
      if (target && target !== b){ tx = target.x; ty = target.y; }
      else {
        if (Math.random() < 0.02){
          const ang = rand(0, Math.PI*2);
          b.vx = Math.cos(ang) * rand(40, 120);
          b.vy = Math.sin(ang) * rand(40, 120);
        }
        tx = b.x + b.vx;
        ty = b.y + b.vy;
      }

      let steerX = tx - b.x, steerY = ty - b.y;

      if (player.mass > b.mass * 1.18){
        steerX = b.x - player.x;
        steerY = b.y - player.y;

        const f = nearestFood(b);
        if (f){
          steerX = steerX * 0.75 + (f.x - b.x) * 0.25;
          steerY = steerY * 0.75 + (f.y - b.y) * 0.25;
        }
      }

      const mag = Math.hypot(steerX, steerY) || 1;
      steerX /= mag; steerY /= mag;

      const wa = wallAvoidance(b.x, b.y);
      steerX += wa.ax * 0.95;
      steerY += wa.ay * 0.95;

      const sm = Math.hypot(steerX, steerY) || 1;
      steerX /= sm; steerY /= sm;

      let spd = botMaxSpeed(b.mass);
      const aggro = b.ai.personality;
      if (biggerThanPlayer && b.ai.targetId === player.id) spd *= lerp(1.06, 1.24, aggro);

      const desiredVx = steerX * spd;
      const desiredVy = steerY * spd;

      b.vx = lerp(b.vx, desiredVx, 0.10);
      b.vy = lerp(b.vy, desiredVy, 0.10);

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      clampEntity(b);

      botEatFood(b);
      if (GROW.botEatBotEnabled) botEatBots(b);
    }
  }

  /**********************
   * PLAYER
   **********************/
  function updatePlayer(dt){
    const p = getPlayer();
    if (!p) return;

    state.abilities.dashCd = Math.max(0, state.abilities.dashCd - dt);
    state.abilities.shieldCd = Math.max(0, state.abilities.shieldCd - dt);
    state.abilities.bombCd = Math.max(0, state.abilities.bombCd - dt);
    state.abilities.magnetCd = Math.max(0, state.abilities.magnetCd - dt);

    if (state.abilities.shieldTime > 0){
      state.abilities.shieldTime -= dt;
      if (state.abilities.shieldTime <= 0) p.el.classList.remove("shielded");
    }
    if (state.abilities.magnetTime > 0) state.abilities.magnetTime -= dt;

    if (state.comboTimer > 0){
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // Burst: linear + stable (no teleport)
    const holdingSpace = state.keys.has("Space");
    if (holdingSpace && state.abilities.burstEnergy > 0 && p.mass > state.abilities.burstMinMass){
      state.abilities.burstActive = true;
      state.abilities.burstEnergy = clamp(state.abilities.burstEnergy - 0.55 * dt, 0, 1);

      const cost = state.abilities.burstMassCostPerSec * dt;
      p.mass = Math.max(state.abilities.burstMinMass, p.mass - cost);
      p.r = massToRadius(p.mass);
    } else {
      state.abilities.burstActive = false;
      state.abilities.burstEnergy = clamp(state.abilities.burstEnergy + 0.28 * dt, 0, 1);
    }

    let dirX = 0, dirY = 0;

    const up = state.keys.has("ArrowUp") || state.keys.has("KeyW");
    const down = state.keys.has("ArrowDown") || state.keys.has("KeyS");
    const left = state.keys.has("ArrowLeft") || state.keys.has("KeyA");
    const right = state.keys.has("ArrowRight") || state.keys.has("KeyD");

    if (up) dirY -= 1;
    if (down) dirY += 1;
    if (left) dirX -= 1;
    if (right) dirX += 1;

    let mouseFactor = 1.0;

    if (state.mouse.inside){
      const rect = getViewportRect();
      const cx = rect.left + rect.width/2;
      const cy = rect.top + rect.height/2;

      const mdx = state.mouse.x - cx;
      const mdy = state.mouse.y - cy;
      const dist = Math.hypot(mdx, mdy);

      if (dev.variableMouseSpeedEnabled){
        const maxDist = Math.min(rect.width, rect.height) * 0.48;
        mouseFactor = clamp(dist / maxDist, 0.16, 1.0);
      }

      if (dirX === 0 && dirY === 0){
        const mag = dist || 1;
        dirX = mdx / mag;
        dirY = mdy / mag;
      } else {
        const km = Math.hypot(dirX, dirY) || 1;
        dirX = (dirX / km) * 0.85 + (mdx / (dist || 1)) * 0.15;
        dirY = (dirY / km) * 0.85 + (mdy / (dist || 1)) * 0.15;
      }
    }

    const mag = Math.hypot(dirX, dirY);
    if (mag > 0.0001){ dirX /= mag; dirY /= mag; }

    let speed = playerBaseSpeed(p.mass) * mouseFactor;

    const holdingShift = state.keys.has("ShiftLeft") || state.keys.has("ShiftRight");
    if (holdingShift && state.abilities.dashCd <= 0){
      state.abilities.dashCd = 1.0;
      speed *= 2.55;
      burstParticles(p.x, p.y, p.color);
      ping("DASH", p.x, p.y, "#45caff");
    }
    if (state.abilities.burstActive) speed *= 1.75;

    const desiredVx = dirX * speed;
    const desiredVy = dirY * speed;
    p.vx = lerp(p.vx, desiredVx, 0.18);
    p.vy = lerp(p.vy, desiredVy, 0.18);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    clampEntity(p);
  }

  /**********************
   * CAMERA
   **********************/
  function updateCamera(){
    const p = getPlayer();
    if (!p) return;

    const rect = getViewportRect();
    const baseZoom = computeZoom(p.mass);
    state.camera.zoom = clamp(baseZoom + state.camera.wheelZoom, 0.62, 1.23);

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

  /**********************
   * RENDER (cached writes)
   **********************/
  function renderEntities(){
    const labelSize = scaleForZoom(12, 12, 26);
    const botNameSize = scaleForZoom(12, 12, 24);

    const ents = state.entities;
    for (let i=0;i<ents.length;i++){
      const e = ents[i];
      const el = e.el;
      if (!el) continue;

      if (e._lr !== e.r){
        const wh = (e.r * 2).toFixed(1) + "px";
        el.style.width = wh;
        el.style.height = wh;
        e._lr = e.r;
      }

      const nx = (e.x - e.r);
      const ny = (e.y - e.r);

      if (Math.abs(nx - e._lx) > 0.05 || Math.abs(ny - e._ly) > 0.05){
        el.style.setProperty("--x", `${nx.toFixed(2)}px`);
        el.style.setProperty("--y", `${ny.toFixed(2)}px`);
        e._lx = nx; e._ly = ny;
      }

      el.style.fontSize = `${labelSize.toFixed(1)}px`;
      if (e.type === "bot" && e.nameEl) e.nameEl.style.fontSize = `${botNameSize.toFixed(1)}px`;
    }
  }

  /**********************
   * COLLISIONS
   **********************/
  function handlePlayerCollisions(dt){
    const p = getPlayer();
    if (!p) return;

    // Magnet pulls nearby food
    if (state.abilities.magnetTime > 0){
      const pullR = 270, pull2 = pullR*pullR, pullStrength = 590;
      const buckets = grid.neighbors(p.x, p.y);
      for (const bucket of buckets){
        for (let i=bucket.length-1;i>=0;i--){
          const f = bucket[i];
          if (f.type !== "food") continue;
          const d2 = dist2(p.x,p.y,f.x,f.y);
          if (d2 >= pull2) continue;
          const dx = p.x - f.x, dy = p.y - f.y;
          const d = Math.hypot(dx,dy) || 1;
          const t = clamp(1 - (d / pullR), 0, 1);
          f.x += (dx / d) * pullStrength * t * dt * 0.55;
          f.y += (dy / d) * pullStrength * t * dt * 0.55;
          clampEntity(f);
        }
      }
    }

    const shielded = state.abilities.shieldTime > 0;
    const buckets = grid.neighbors(p.x, p.y);

    for (const bucket of buckets){
      for (let i=bucket.length-1;i>=0;i--){
        const e = bucket[i];
        if (e === p) continue;

        const rSum = p.r + e.r;
        if (dist2(p.x,p.y,e.x,e.y) > rSum*rSum) continue;

        if (e.type === "food"){
          addScore(SCORE.food, e.x, e.y, "#57ff8a");
          growEntity(p, e.mass, GROW.playerFoodGainMult);
          popRemove(e, true);
        }
        else if (e.type === "powerup"){
          applyPowerup(e);
          popRemove(e, true);
        }
        else if (e.type === "bot"){
          if (shielded){
            const dx = e.x - p.x, dy = e.y - p.y;
            const mag = Math.hypot(dx,dy) || 1;
            e.x += (dx / mag) * 60;
            e.y += (dy / mag) * 60;
            clampEntity(e);
            continue;
          }

          if (p.mass > e.mass * 1.12){
            addScore(SCORE.eatBot, e.x, e.y, "#ffd36b");
            growEntity(p, e.mass * 0.38, 1.0);
            popRemove(e, true);
          } else if (e.mass > p.mass * 1.10){
            playerDeath();
            return;
          } else {
            ping("CLASH", p.x, p.y, "#ff4b6e");
          }
        }
      }
    }
  }

  function ensureThreats(){
    const p = getPlayer();
    if (!p) return;
    const bots = state.byType.bot;
    let threats = 0;
    for (let i=0;i<bots.length;i++){
      if (bots[i].mass > p.mass * 1.12) threats++;
    }
    const need = Math.max(0, 3 - threats);
    for (let i=0;i<need;i++) spawnBot({ threat:true });
  }

  function autoSpawn(dt){
    if (!state.running || !dev.autoSpawnEnabled) return;

    const t = state.timers;
    t.food += dt * 1000;
    t.bot += dt * 1000;
    t.power += dt * 1000;
    t.threat += dt * 1000;

    if (t.food >= SPAWN.foodEvery){ t.food = 0; spawnFood(3); }
    if (t.bot >= SPAWN.botEvery){
      t.bot = 0;
      if (state.byType.bot.length < LIMITS.bots) spawnBot();
    }
    if (t.power >= SPAWN.powerEvery){
      t.power = 0;
      if (state.byType.powerup.length < LIMITS.powerups && Math.random() < 0.75) spawnPowerup();
    }
    if (t.threat >= SPAWN.threatCheckEvery){ t.threat = 0; ensureThreats(); }
  }

  function playerDeath(){
    if (!state.running) return;
    state.running = false;

    const p = getPlayer();
    if (p){
      burstParticles(p.x, p.y, "#ff4b6e");
      popRemove(p, true);
    }

    dom.overlayEnd.classList.add("show");
    dom.overlayEnd.querySelector("#endTitle").textContent = "You got eaten 💀";
    dom.overlayEnd.querySelector("#endSub").textContent = "Press R to restart instantly.";
    dom.overlayEnd.querySelector("#endStats").innerHTML =
      `Final Score: <b>${Math.floor(state.score)}</b> • Time Left: <b>${formatTime(state.timeLeft)}</b>`;
  }

  /**********************
   * HUD
   **********************/
  function updateLeaderboard(){
    const p = getPlayer();
    const list = [];
    if (p) list.push(p);
    for (let i=0;i<state.byType.bot.length;i++) list.push(state.byType.bot[i]);

    list.sort((a,b)=>b.mass-a.mass);
    const top = list.slice(0,6);

    dom.leaderboardBody.innerHTML = "";
    for (let i=0;i<top.length;i++){
      const e = top[i];
      const row = document.createElement("div");
      row.className="lbRow";
      const left = document.createElement("span");
      const right = document.createElement("span");
      const isYou = (p && e === p);
      left.innerHTML = isYou ? `<b class="you">${i+1}. YOU</b>` : `<b>${i+1}. ${e.name || "BOT"}</b>`;
      right.textContent = `${Math.floor(e.mass)}`;
      row.append(left,right);
      dom.leaderboardBody.appendChild(row);
    }
  }

  function updateInspector(){
    const sel = state.selectedId ? findById(state.selectedId) : null;
    if (!sel){
      dom.selType.value.textContent="-";
      dom.selSize.value.textContent="-";
      dom.selMass.value.textContent="-";
      dom.selPos.value.textContent="-";
      return;
    }
    dom.selType.value.textContent = sel.type.toUpperCase();
    dom.selSize.value.textContent = `${Math.floor(sel.r)}px`;
    dom.selMass.value.textContent = `${Math.floor(sel.mass)}`;
    dom.selPos.value.textContent = `${Math.floor(sel.x)}, ${Math.floor(sel.y)}`;
  }

  function updateHUD(dt){
    const p = getPlayer();
    dom.hudScore.textContent = String(Math.max(0, Math.floor(state.score)));
    dom.hudMass.textContent = p ? String(Math.floor(p.mass)) : "0";
    dom.hudTime.textContent = formatTime(state.timeLeft);
    dom.hudCombo.textContent = state.combo > 0 ? `x${state.combo}` : "-";

    if (state.running){
      state.timeLeft -= dt;
      if (state.timeLeft <= 0){
        state.timeLeft = 0;
        state.running = false;
        dom.overlayEnd.classList.add("show");
        dom.overlayEnd.querySelector("#endTitle").textContent = "Time up ✅";
        dom.overlayEnd.querySelector("#endSub").textContent = "Press R to restart instantly.";
        dom.overlayEnd.querySelector("#endStats").innerHTML = `Final Score: <b>${Math.floor(state.score)}</b>`;
      }
    }

    state.stats.frameCount++;
    state.stats.fpsTimer += dt;
    if (state.stats.fpsTimer >= 0.5){
      state.stats.fps = Math.round(state.stats.frameCount / state.stats.fpsTimer);
      state.stats.frameCount = 0;
      state.stats.fpsTimer = 0;
    }

    const fpsEl = dom.miniHud.querySelector("#mhFps");
    const botsEl = dom.miniHud.querySelector("#mhBots");
    const thrEl = dom.miniHud.querySelector("#mhThreats");
    const bombEl = dom.miniHud.querySelector("#mhBomb");
    const dashEl = dom.miniHud.querySelector("#mhDash");
    const shieldEl = dom.miniHud.querySelector("#mhShield");
    const magEl = dom.miniHud.querySelector("#mhMag");
    const burstEl = dom.miniHud.querySelector("#mhBurst");

    const bots = state.byType.bot;
    let threats = 0;
    if (p){
      for (let i=0;i<bots.length;i++) if (bots[i].mass > p.mass * 1.12) threats++;
    }

    fpsEl.textContent = String(state.stats.fps);
    botsEl.textContent = String(bots.length);
    thrEl.textContent = String(threats);

    bombEl.textContent = String(state.abilities.bombCharges);
    dashEl.textContent = state.abilities.dashCd <= 0 ? "READY" : `${state.abilities.dashCd.toFixed(1)}s`;
    shieldEl.textContent = state.abilities.shieldCd <= 0 ? "READY" : `${state.abilities.shieldCd.toFixed(1)}s`;
    magEl.textContent = state.abilities.magnetTime > 0 ? `${state.abilities.magnetTime.toFixed(1)}s` : "OFF";
    burstEl.textContent = `${Math.round(state.abilities.burstEnergy * 100)}%`;

    updateInspector();
    updateLeaderboard();
  }

  /**********************
   * FLOW
   **********************/
  function showStartMenu(){
    state.running = false;
    state.started = false;
    dom.overlayEnd.classList.remove("show");
    dom.overlayHelp.classList.remove("show");
    dom.overlayStart.classList.add("show");
  }

  function startGame(){
    state.started = true;
    state.running = true;
    dom.overlayStart.classList.remove("show");
    dom.overlayEnd.classList.remove("show");
    dom.overlayHelp.classList.remove("show");
  }

  function restartGame(){
    for (const e of state.entities) e.el?.remove();
    state.entities.length = 0;
    state.byType.player = null;
    state.byType.bot.length = 0;
    state.byType.food.length = 0;
    state.byType.powerup.length = 0;

    state.idSeq = 1;
    state.selectedId = null;

    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;

    state.timeLeft = 120;
    state.keys.clear();
    state.drag.active = false;
    state.drag.id = null;

    state.camera.x = 0; state.camera.y = 0;
    state.camera.tx = 0; state.camera.ty = 0;
    state.camera.zoom = 1;
    state.camera.wheelZoom = 0;

    state.abilities.dashCd = 0;
    state.abilities.shieldCd = 0;
    state.abilities.shieldTime = 0;
    state.abilities.bombCd = 0;
    state.abilities.bombCharges = 0;
    state.abilities.magnetTime = 0;
    state.abilities.magnetCd = 0;
    state.abilities.burstActive = false;
    state.abilities.burstEnergy = 1.0;

    state.timers.food = 0;
    state.timers.bot = 0;
    state.timers.power = 0;
    state.timers.threat = 0;

    spawnPlayer();
    spawnFood(240);
    spawnBots(Math.min(18, LIMITS.bots));
    spawnPowerups(Math.min(4, LIMITS.powerups));
    ensureThreats();
    syncSelection();

    state.started = true;
    state.running = true;

    dom.overlayStart.classList.remove("show");
    dom.overlayEnd.classList.remove("show");
    dom.overlayHelp.classList.remove("show");
  }

  function toggleHelp(force=null){
    if (force === true) dom.overlayHelp.classList.add("show");
    else if (force === false) dom.overlayHelp.classList.remove("show");
    else dom.overlayHelp.classList.toggle("show");
  }

  function toggleDevModal(force=null){
    if (force === true) dom.devModal.classList.add("show");
    else if (force === false) dom.devModal.classList.remove("show");
    else dom.devModal.classList.toggle("show");
    syncDevUI();
  }

  /**********************
   * EVENTS
   **********************/
  function wireEvents(){
    // (7) pointermove
    window.addEventListener("pointermove", (ev) => {
      state.mouse.x = ev.clientX;
      state.mouse.y = ev.clientY;

      const rect = getViewportRect();
      state.mouse.inside = (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom);

      if (state.drag.active && state.drag.id != null){
        const ent = findById(state.drag.id);
        if (!ent || ent.type !== "powerup") return;

        const wp = screenToWorld(ev.clientX, ev.clientY);
        ent.x = wp.x + state.drag.offsetX;
        ent.y = wp.y + state.drag.offsetY;
        clampEntity(ent);

        const p = getPlayer();
        if (p){
          const rSum = p.r + ent.r;
          if (dist2(p.x,p.y,ent.x,ent.y) <= rSum*rSum){
            applyPowerup(ent);
            popRemove(ent, true);
            state.drag.active = false;
            state.drag.id = null;
          }
        }
      }
    });

    // (8) click on world
    dom.viewport.addEventListener("click", () => {
      const p = getPlayer();
      if (p) selectEntity(p.id);
    });

    // (9) contextmenu
    window.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      const sel = state.selectedId ? findById(state.selectedId) : null;
      if (!sel) return;
      if (sel.type === "player") return;
      popRemove(sel, true);
    });

    // (10) keydown
    window.addEventListener("keydown", (ev) => {
      if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(ev.code)) ev.preventDefault();
      state.keys.add(ev.code);

      if (ev.code === "KeyH") toggleHelp();
      if (ev.code === "KeyR") restartGame();
      if (ev.code === "KeyE") { if (state.running) activateShield(); }
      if (ev.code === "KeyQ") { if (state.running) activateBomb(); }

      // Requested: ESC opens menu (or resumes from menu)
      if (ev.code === "Escape"){
        if (dom.devModal.classList.contains("show")) { toggleDevModal(false); return; }
        if (dom.overlayHelp.classList.contains("show")) { toggleHelp(false); return; }

        if (dom.overlayStart.classList.contains("show")) startGame();
        else showStartMenu();
      }
    });

    // (11) keyup
    window.addEventListener("keyup", (ev) => state.keys.delete(ev.code));

    // (12) wheel
    window.addEventListener("wheel", (ev) => {
      const delta = Math.sign(ev.deltaY) * -0.03;
      state.camera.wheelZoom = clamp(state.camera.wheelZoom + delta, -0.18, 0.18);
    }, { passive:true });

    // (13) resize
    window.addEventListener("resize", () => updateCamera());

    // (14) pointerup global
    window.addEventListener("pointerup", () => {
      state.drag.active = false;
      state.drag.id = null;
    });
  }

  /**********************
   * POWERUP: MAGNET
   **********************/
  function handleMagnet(dt){
    const p = getPlayer();
    if (!p) return;
    if (state.abilities.magnetTime <= 0) return;

    const pullR = 270, pull2 = pullR*pullR, pullStrength = 590;
    const buckets = grid.neighbors(p.x, p.y);
    for (const bucket of buckets){
      for (let i=bucket.length-1;i>=0;i--){
        const f = bucket[i];
        if (f.type !== "food") continue;
        const d2 = dist2(p.x,p.y,f.x,f.y);
        if (d2 >= pull2) continue;
        const dx = p.x - f.x, dy = p.y - f.y;
        const d = Math.hypot(dx,dy) || 1;
        const t = clamp(1 - (d / pullR), 0, 1);
        f.x += (dx / d) * pullStrength * t * dt * 0.55;
        f.y += (dy / d) * pullStrength * t * dt * 0.55;
        clampEntity(f);
      }
    }
  }

  /**********************
   * LOOP
   **********************/
  function ensureStartingWorld(){
    spawnPlayer();
    spawnFood(240);
    spawnBots(Math.min(18, LIMITS.bots));
    spawnPowerups(Math.min(4, LIMITS.powerups));
    ensureThreats();
    syncSelection();
  }

  let last = performance.now();
  function tick(now){
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    if (state.running){
      updatePlayer(dt);
      updateBots(dt);
      autoSpawn(dt);
    }

    rebuildGrid();
    if (state.running){
      handleMagnet(dt);
      handlePlayerCollisions(dt);
    }

    updateCamera();
    renderEntities();
    updateHUD(dt);

    requestAnimationFrame(tick);
  }

  /**********************
   * INIT
   **********************/
  buildUI();
  ensureStartingWorld();
  wireEvents();

  requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
}
