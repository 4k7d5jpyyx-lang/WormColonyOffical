// ================================
// WORM COLONY — FULL LIVE MODE
// ================================

const STATS_URL =
  "https://heliuswebhook.nf5w8v8d4k.workers.dev/stats?mint=6jKn8hRBvdHZ3AnVNECnKgnLn655AwyNF3EvH9uRpump";

let lastTotalBuys = 0;
let liveInitialized = false;

// ---- HARD DISABLE SIMULATION ----
window.SIMULATION_ENABLED = false;
window.forceSimulation = false;

// ---- GAME STATE ----
const gameState = {
  worms: 0,
  colonies: 1,
  bosses: 0,
};

// ---- UI HELPERS (safe no-ops if missing) ----
function setLiveMode() {
  const el = document.querySelector(".simulation-status");
  if (el) {
    el.textContent = "Live Mode";
    el.classList.add("live");
  }
}

function updateCounters() {
  const buyersEl = document.querySelector("#buyers");
  const wormsEl = document.querySelector("#worms");
  const coloniesEl = document.querySelector("#colonies");

  if (buyersEl) buyersEl.textContent = gameState.worms;
  if (wormsEl) wormsEl.textContent = gameState.worms;
  if (coloniesEl) coloniesEl.textContent = gameState.colonies;
}

// ---- CORE LIVE LOGIC ----
async function pollLiveStats() {
  try {
    const res = await fetch(STATS_URL, { cache: "no-store" });
    const stats = await res.json();

    if (!stats || typeof stats.totalBuys !== "number") {
      console.warn("Invalid stats payload, skipping tick");
      return;
    }

    setLiveMode();

    const totalBuys = stats.totalBuys;

    // First successful load
    if (!liveInitialized) {
      lastTotalBuys = totalBuys;
      liveInitialized = true;
    }

    const newBuys = totalBuys - lastTotalBuys;
    if (newBuys > 0) {
      spawnFromBuys(newBuys);
      lastTotalBuys = totalBuys;
    }

    updateCounters();
  } catch (err) {
    console.error("Live stats error:", err);
  }
}

// ---- SPAWN RULES ----
function spawnFromBuys(count) {
  for (let i = 0; i < count; i++) {
    gameState.worms += 1;

    // Colony every 10 worms
    if (gameState.worms % 10 === 0) {
      gameState.colonies += 1;
      spawnColony();
    }

    // Boss every 100 worms
    if (gameState.worms % 100 === 0) {
      gameState.bosses += 1;
      spawnBoss();
    }

    spawnWorm();
  }
}

// ---- VISUAL HOOKS (tie into your existing engine) ----
function spawnWorm() {
  if (window.spawnLiveWorm) {
    window.spawnLiveWorm();
  }
}

function spawnColony() {
  if (window.spawnLiveColony) {
    window.spawnLiveColony();
  }
}

function spawnBoss() {
  if (window.spawnLiveBoss) {
    window.spawnLiveBoss();
  }
}

// ---- START LIVE POLLING ----
setLiveMode();
pollLiveStats();
setInterval(pollLiveStats, 8000);
