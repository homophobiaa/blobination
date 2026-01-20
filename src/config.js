// src/config.js
export const GAME_NAME = "Blobination";

// World presets (small / medium(current) / large)
export const WORLD_PRESETS = {
  small:  { w: 3800, h: 2600 },
  medium: { w: 5000, h: 3400 }, // current
  large:  { w: 7200, h: 4800 }
};

// These objects are intentionally mutable via Dev Tools
export const LIMITS = { food: 360, bots: 28, powerups: 12 };

export const SPAWN = {
  foodEvery: 85,
  botEvery: 900,
  powerEvery: 2600,
  threatCheckEvery: 900
};

export const GROW = {
  playerFoodGainMult: 0.16,
  botFoodGainMult: 0.78,
  diminishK: 70,
  diminishMassFactor: 0.62,
  botEatBotEnabled: true,
};

export const SCORE = {
  food: 1,
  power: 6,
  eatBot: 28,
};

export const COLORS = {
  player: ["#45caff", "#9b6bff", "#57ff8a", "#ffd36b"],
  food: ["#57ff8a", "#45caff", "#ffd36b"],
  bot: ["#ff4b6e", "#ff7a4b", "#ff4bd6"],
  power: ["#ffd36b", "#45caff"],
};

export const POWER_TYPES = ["DASH", "SHIELD", "BOMB", "MAGNET"];

export const BOT_NAMES = [
  "NeonRift","ByteWarden","GlitchFox","NovaPulse","ZenithViper","CryoWisp",
  "TurboMint","AstraJolt","NightCircuit","PixelFang","QuantumSnail","EchoSaber",
  "FrostLynx","ChromeKoi","LunarDrift","HyperMoss","VantaBloom","IonBrawler",
  "HoloRaven","WiredWolf","SynthCobra","OrbitalBite","SkyPhantom","StaticGolem",
  "KarmaKite","ArcTide","DuskRunner","GhostKernel","PrismNomad","RogueLambda"
];

export const DEV_AUTHOR = "Homophobia";
