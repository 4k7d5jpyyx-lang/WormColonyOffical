// Worm Colony Simulation (split-file build)
// Includes: boss worm, auras, shockwaves, DNA badges, tap select, pan/zoom,
// mutation log cap + merge spam, limb growth, irregular shapes, diverse colors,
// new colonies each $50k MC (cap 8), growth from buyers+vol+mc.

const $ = (id)=>document.getElementById(id);

const canvas = $("c");
const ctx = canvas.getContext("2d", { alpha:true });

// UI refs
const uiBuyers = $("buyers"), uiVol = $("vol"), uiMcap = $("mcap"),
      uiCols = $("cols"), uiWorms = $("worms"),
      logEl = $("log"), toastEl = $("toast"),
      fp = $("focusPanel"), fpSelected=$("fpSelected"), fpDNA=$("fpDNA"), fpBiome=$("fpBiome"), fpStyle=$("fpStyle");

// Buttons
const feedBtn=$("feedBtn"), smallFeed=$("smallFeed"), bigFeed=$("bigFeed"),
      sellBtn=$("sellBtn"), stormBtn=$("stormBtn"), mutateBtn=$("mutateBtn"),
      focusBtn=$("focusBtn"), zoomInBtn=$("zoomInBtn"), zoomOutBtn=$("zoomOutBtn"),
      captureBtn=$("captureBtn"), resetBtn=$("resetBtn");

// helpers
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b=null)=> b===null ? Math.random()*a : a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const pick=(arr)=>arr[Math.floor(Math.random()*arr.length)];
const now=()=>performance.now();

function fmtMoney(n){
  if (n>=1e9) return `$${(n/1e9).toFixed(2)}B`;
  if (n>=1e6) return `$${(n/1e6).toFixed(2)}M`;
  if (n>=1e3) return `$${Math.round(n).toLocaleString()}`;
  return `$${Math.round(n)}`;
}

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("on");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>toastEl.classList.remove("on"), 1200);
}

// log: cap + merge spam
const LOG_MAX = 36;
const MERGE_WINDOW_MS = 1800;
let logItems = []; // {key, pt, type, stamp, body, count}

function addLog(type, body, key=null){
  const t = new Date();
  const stamp = t.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const mergeKey = key || `${type}:${body}`;
  const last = logItems[0];

  if (last && last.key===mergeKey && (performance.now()-last.pt) < MERGE_WINDOW_MS){
    last.count++;
    last.pt = performance.now();
    renderLog();
    return;
  }

  logItems.unshift({ key: mergeKey, pt: performance.now(), type, stamp, body, count: 1 });
  if (logItems.length > LOG_MAX) logItems.length = LOG_MAX;
  renderLog();
}

function renderLog(){
  if (!logEl) return;
  logEl.innerHTML = logItems.map(item=>{
    const cls = item.type==="MUTATION" ? "mut"
              : item.type==="SPLIT" ? "split"
              : item.type==="BOSS" ? "boss"
              : item.type==="MILESTONE" ? "mil" : "mil";
    const countBadge = item.count>1 ? `<div class="count">×${item.count}</div>` : "";
    return `
      <div class="logItem">
        <div class="logTop">
          <div>${item.stamp}</div>
          <div class="pill ${cls}">${item.type}</div>
        </div>
        ${countBadge}
        <div class="logBody">${item.body}</div>
      </div>
    `;
  }).join("");
}

// view (pan/zoom)
let view = { cx:0, cy:0, scale:1.0, targetScale:1.0 };

function screenToWorld(x,y){
  const r = canvas.getBoundingClientRect();
  const sx = (x - r.left);
  const sy = (y - r.top);
  const wx = (sx - r.width/2)/view.scale + view.cx;
  const wy = (sy - r.height/2)/view.scale + view.cy;
  return {x:wx,y:wy};
}
function worldToScreen(x,y){
  const r = canvas.getBoundingClientRect();
  const sx = (x - view.cx)*view.scale + r.width/2;
  const sy = (y - view.cy)*view.scale + r.height/2;
  return {x:sx,y:sy};
}

// noise helpers
function hash2(x,y){
  let n = x*374761393 + y*668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n >>> 0) / 4294967295;
}
function vnoise(x,y){
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi+1, yi);
  const c = hash2(xi, yi+1);
  const d = hash2(xi+1, yi+1);
  const u = xf*xf*(3-2*xf);
  const v = yf*yf*(3-2*yf);
  return lerp(lerp(a,b,u), lerp(c,d,u), v);
}
function flowAngle(x,y,seed){
  let n = 0, amp=1, freq=0.008;
  for(let i=0;i<3;i++){
    n += amp * vnoise((x+seed*97)*freq, (y-seed*53)*freq);
    amp *= 0.55;
    freq *= 2.1;
  }
  return n * Math.PI * 2.2;
}

// sim state
const MAX_COLONIES = 8;
const COLONY_STEP_MC = 50000;

const DNA_POOL = [
  "CALM • TOXIC","CHAOTIC • SWEET","AGGRESSIVE • PRISM","NEON • GLIDER","ORBITAL • SERRATED",
  "PHASE • WISP","CROWN • SPIRAL","GHOST • BLOOM","COMET • ARC","SHARD • VEIL"
];
const BIOMES = ["NEON GARDEN","DEEP SEA","AURORA PIT","GLASS CAVERN","ECLIPSE SOIL","ION FIELDS","STAR SAND","VOID REEF"];
const STYLES = ["COMET / ARC","CROWN / SPIRAL","VEIL / DRIFT","SHARD / SNAP","BLOOM / WAVE","GLIDER / SINE"];

const PALETTES = [
  ["#6dffb5","#61f2ff","#b55cff","#ff4dff","#ffd456"],
  ["#00ffd1","#00aaff","#ff57f5","#8cff00","#f8ff8a"],
  ["#5bffd7","#7b6cff","#ff3b7a","#38ff9a","#62c6ff"],
  ["#42ffb2","#9b6cff","#ff4df0","#ffcc33","#4dd7ff"],
  ["#7cfffc","#85ff6d","#ff62c2","#7b88ff","#ffd16a"]
];

let metrics = { buyers:0, volume:0, mcap:25000 };
let selectedColony = 0;
let focusOn = false;

let shockwaves = []; // {x,y,r,vr,a,va,color,th}
let stars = [];
function seedStars(){
  stars = [];
  for(let i=0;i<260;i++){
    stars.push({ x: rand(-1400,1400), y: rand(-900,900), r: rand(0.6,1.8), a: rand(0.2,0.9), tw: rand(0.002,0.01) });
  }
}

function shockwave(x,y,color="rgba(120,255,210,.55)", thickness=1.8){
  shockwaves.push({ x,y, r:0, vr: rand(220,360), a:0.55, va: rand(0.65,0.85), color, th: thickness });
  if (shockwaves.length>18) shockwaves.shift();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Worm entity
class Worm{
  constructor(colony, isBoss=false){
    this.colony = colony;
    this.isBoss = isBoss;
    this.id = Math.random().toString(16).slice(2,6);

    const p = colony.spawnPoint();
    this.x = p.x; this.y = p.y;

    this.vx = rand(-0.6,0.6);
    this.vy = rand(-0.6,0.6);

    this.len = isBoss ? randi(42,58) : randi(18,32);
    this.th  = isBoss ? rand(10,14) : rand(5,9);
    this.speed = isBoss ? rand(1.1,1.45) : rand(0.85,1.25);

    this.colorA = pick(colony.palette);
    this.colorB = pick(colony.palette);
    this.phase = rand(0,Math.PI*2);

    this.segs = [];
    for(let i=0;i<this.len;i++) this.segs.push({x:this.x, y:this.y});

    this.limbs = []; // {i, ang, len, life, col}
  }

  maybeGrowLimb(){
    const chance = this.isBoss ? 0.03 : 0.012;
    if (Math.random() < chance){
      const i = randi(Math.floor(this.len*0.25), Math.floor(this.len*0.7));
      this.limbs.push({
        i,
        ang: rand(-Math.PI, Math.PI),
        len: rand(this.isBoss?28:18, this.isBoss?52:32),
        life: rand(140, 260),
        col: pick(this.colony.palette)
      });
      if (this.limbs.length > (this.isBoss?14:10)) this.limbs.shift();
    }
  }

  mutate(tag){
    this.th = clamp(this.th + rand(-1.2,1.8), this.isBoss?9:4.2, this.isBoss?16:11);
    this.speed = clamp(this.speed + rand(-0.12,0.18), this.isBoss?0.9:0.6, this.isBoss?1.8:1.55);
    this.colorA = pick(this.colony.palette);
    if (Math.random()<0.55) this.colorB = pick(this.colony.palette);
    if (Math.random()<0.55) this.maybeGrowLimb();
    addLog("MUTATION", `${tag} • Worm ${this.id} (Colony #${this.colony.idx})`, `mut:${tag}:${this.id}:${this.colony.idx}`);
  }

  step(dt){
    const c = this.colony;

    const ang = flowAngle(this.x, this.y, c.seed) + c.driftAng + Math.sin(this.phase + now()*0.0006)*0.35;
    const fx = Math.cos(ang), fy = Math.sin(ang);

    const dx = c.x - this.x, dy = c.y - this.y;
    const dist = Math.hypot(dx,dy) + 0.0001;
    const pull = c.gravity * (1 / (1 + dist*0.004));
    const px = (dx/dist)*pull;
    const py = (dy/dist)*pull;

    this.vx = this.vx*0.92 + (fx*0.55 + px)*0.36;
    this.vy = this.vy*0.92 + (fy*0.55 + py)*0.36;

    this.vx += c.driftX*0.04;
    this.vy += c.driftY*0.04;

    const sp = this.speed * (this.isBoss?1.15:1.0);
    this.x += this.vx * sp;
    this.y += this.vy * sp;

    const bd = c.boundaryDist(this.x, this.y);
    if (bd > 1){
      this.x = lerp(this.x, c.x, 0.012*bd);
      this.y = lerp(this.y, c.y, 0.012*bd);
      this.vx *= 0.85;
      this.vy *= 0.85;
    }

    this.segs[0].x = this.x;
    this.segs[0].y = this.y;

    for(let i=1;i<this.segs.length;i++){
      const prev = this.segs[i-1];
      const cur = this.segs[i];
      const ddx = prev.x-cur.x, ddy = prev.y-cur.y;
      const d = Math.hypot(ddx,ddy)+0.0001;
      const desired = 6.2 - i*0.02;
      const t = (d-desired) / d;
      cur.x += ddx * t * 0.56;
      cur.y += ddy * t * 0.56;
    }

    for (let L of this.limbs) L.life -= dt*60;
    this.limbs = this.limbs.filter(L=>L.life>0);

    this.maybeGrowLimb();
  }

  draw(){
    // boss glow aura
    if (this.isBoss){
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 60 + Math.sin(now()*0.001)*6, 0, Math.PI*2);
      ctx.fillStyle = "rgba(255,212,86,.55)";
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = this.isBoss ? 18 : 12;
    ctx.shadowColor = this.colorA;

    for(let i=this.segs.length-1;i>1;i--){
      const p0 = this.segs[i];
      const p1 = this.segs[i-1];
      const t = i/(this.segs.length-1);
      const w = (1-t) * this.th + 1.4;
      const col = (i%2===0) ? this.colorA : this.colorB;

      ctx.globalAlpha = this.isBoss ? (0.82 - t*0.25) : (0.78 - t*0.18);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(p0.x,p0.y);
      ctx.lineTo(p1.x,p1.y);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = this.isBoss ? 0.22 : 0.18;
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = Math.max(1.4, this.th*0.18);
    ctx.beginPath();
    for(let i=this.segs.length-1;i>2;i-=2){
      const p = this.segs[i];
      if (i===this.segs.length-1) ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    }
    ctx.stroke();

    // limbs
    for (let L of this.limbs){
      const p = this.segs[L.i];
      if (!p) continue;
      const lifeT = clamp(L.life/260, 0, 1);
      const ang = L.ang + Math.sin(now()*0.001 + L.i)*0.25;
      const lx = Math.cos(ang)*L.len*lifeT;
      const ly = Math.sin(ang)*L.len*lifeT;

      ctx.globalAlpha = 0.22 + lifeT*0.28;
      ctx.strokeStyle = L.col;
      ctx.lineWidth = Math.max(1.2, this.th*0.22);
      ctx.beginPath();
      ctx.moveTo(p.x,p.y);
      ctx.quadraticCurveTo(p.x+lx*0.45, p.y+ly*0.45, p.x+lx, p.y+ly);
      ctx.stroke();
    }

    // boss crown spikes near head
    if (this.isBoss){
      const head = this.segs[0];
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "rgba(255,212,86,.95)";
      ctx.lineWidth = 2.2;
      for(let k=0;k<8;k++){
        const a = k*(Math.PI*2/8) + now()*0.0012;
        const sx = head.x + Math.cos(a)*10;
        const sy = head.y + Math.sin(a)*10;
        const ex = head.x + Math.cos(a)*22;
        const ey = head.y + Math.sin(a)*22;
        ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
      }
    }

    ctx.restore();
  }
}

// Colony entity
class Colony{
  constructor(idx, x, y){
    this.idx = idx;
    this.x = x; this.y = y;
    this.seed = rand(0,9999);

    this.dna = pick(DNA_POOL);
    this.biome = pick(BIOMES);
    this.style = pick(STYLES);
    this.palette = pick(PALETTES);

    this.driftAng = rand(0,Math.PI*2);
    this.driftX = Math.cos(this.driftAng);
    this.driftY = Math.sin(this.driftAng);

    this.size = rand(220, 330);
    this.gravity = rand(0.9, 1.35);

    this.worms = [];
    this.boss = null;

    this.auraPhase = rand(0,Math.PI*2);
    this.auraHue = pick(this.palette);

    const initial = randi(10, 16);
    for(let i=0;i<initial;i++) this.worms.push(new Worm(this, false));
  }

  spawnPoint(){
    const ang = rand(0,Math.PI*2);
    const rr = this.size * rand(0.10,0.35);
    const jx = Math.cos(ang)*rr + rand(-20,20);
    const jy = Math.sin(ang)*rr + rand(-20,20);
    return {x:this.x + jx, y:this.y + jy};
  }

  boundaryDist(px,py){
    const dx=px-this.x, dy=py-this.y;
    const d = Math.hypot(dx,dy) + 0.0001;
    const ang = Math.atan2(dy,dx);
    const n = vnoise((this.seed*3 + Math.cos(ang)*50)*0.03, (this.seed*7 + Math.sin(ang)*50)*0.03);
    const wob = (n-0.5) * 0.55;
    const base = this.size * (0.85 + wob);
    return d / base;
  }

  ensureBoss(){
    if (this.boss) return;
    this.boss = new Worm(this, true);
    this.boss.colorA = "#ffd456";
    this.boss.colorB = pick(this.palette);
    this.worms.unshift(this.boss);
    addLog("BOSS", `Boss Worm awakened in Colony #${this.idx}`, `boss:${this.idx}`);
    shockwave(this.x, this.y, "rgba(255,212,86,.65)", 2.3);
    toast("BOSS WORM AWAKENED");
  }

  step(dt){
    this.auraPhase += dt*0.015;
    for (let w of this.worms) w.step(dt);

    if (Math.random() < 0.013){
      const w = pick(this.worms);
      if (w) w.mutate(pick(["Color shift","Body growth","Aggression spike","Limb sprout","Phase drift"]));
    }

    const bossChance = clamp((metrics.mcap-120000)/900000, 0, 1) * 0.01 + clamp(metrics.volume/200000,0,1)*0.005;
    if (!this.boss && Math.random() < bossChance){
      this.ensureBoss();
    }
  }

  drawAura(){
    ctx.save();
    const pulse = 1 + Math.sin(now()*0.001 + this.auraPhase)*0.06;
    const r = this.size * 0.62 * pulse;

    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI*2);
    ctx.fillStyle = this.auraHue;
    ctx.fill();

    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = this.auraHue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r*1.08, 0, Math.PI*2);
    ctx.stroke();

    ctx.globalAlpha = 0.10;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r*1.18, 0, Math.PI*2);
    ctx.stroke();

    ctx.restore();
  }

  drawBadge(){
    const p = worldToScreen(this.x, this.y - this.size*0.55);
    const text = `Colony #${this.idx} • ${this.dna.split("•")[0].trim()}`;

    ctx.save();
    ctx.resetTransform();
    ctx.globalAlpha = 0.92;

    const padX = 12;
    ctx.font = "900 12px system-ui,-apple-system";
    const w = ctx.measureText(text).width + padX*2;
    const h = 30;

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.lineWidth = 1;

    const maxW = canvas.width/(devicePixelRatio||1);
    const maxH = canvas.height/(devicePixelRatio||1);
    const x = clamp(p.x - w/2, 10, maxW - w - 10);
    const y = clamp(p.y, 10, maxH - h - 10);

    roundRect(ctx, x, y, w, h, 14, true, true);

    ctx.beginPath();
    ctx.fillStyle = this.auraHue;
    ctx.globalAlpha = 0.95;
    ctx.arc(x+14, y+h/2, 4, 0, Math.PI*2);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(233,238,247,.92)";
    ctx.fillText(text, x+24, y+20);

    ctx.restore();
  }
}

// colonies
let colonies = [];

function totalWorms(){
  return colonies.reduce((n,c)=>n + c.worms.length, 0);
}

// draw helpers
function resize(){
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function drawBackground(){
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.9)";
  for(let s of stars){
    const tw = 0.55 + Math.sin(now()*s.tw + s.x*0.02)*0.45;
    ctx.globalAlpha = s.a * tw;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 1;

  const step = 180;
  const w = canvas.width/(devicePixelRatio||1);
  const h = canvas.height/(devicePixelRatio||1);
  const minX = view.cx - w/view.scale/2 - 500;
  const maxX = view.cx + w/view.scale/2 + 500;
  const minY = view.cy - h/view.scale/2 - 500;
  const maxY = view.cy + h/view.scale/2 + 500;

  const startX = Math.floor(minX/step)*step;
  const startY = Math.floor(minY/step)*step;

  for(let x=startX; x<maxX; x+=step){
    ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x, maxY); ctx.stroke();
  }
  for(let y=startY; y<maxY; y+=step){
    ctx.beginPath(); ctx.moveTo(minX, y); ctx.lineTo(maxX, y); ctx.stroke();
  }

  ctx.restore();
}

function drawShockwaves(dt){
  for (let sw of shockwaves){
    sw.r += sw.vr * (dt/60);
    sw.a -= sw.va * (dt/60);
  }
  shockwaves = shockwaves.filter(sw=>sw.a>0);

  ctx.save();
  for (let sw of shockwaves){
    ctx.globalAlpha = Math.max(0, sw.a);
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = sw.th;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  view.scale = lerp(view.scale, view.targetScale, 0.12);

  ctx.save();
  const w = canvas.width/(devicePixelRatio||1);
  const h = canvas.height/(devicePixelRatio||1);
  ctx.translate(w/2, h/2);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.cx, -view.cy);

  drawBackground();

  for (let c of colonies) c.drawAura();
  drawShockwaves(16.6);

  for (let c of colonies){
    for (let w of c.worms) w.draw();
  }

  const sc = colonies[selectedColony];
  if (sc){
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = sc.auraHue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, sc.size*0.68, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  for (let c of colonies){
    const p = worldToScreen(c.x,c.y);
    const r = canvas.getBoundingClientRect();
    if (p.x>-200 && p.x<r.width+200 && p.y>-200 && p.y<r.height+200){
      c.drawBadge();
    }
  }
}

// colony spawning at $50k increments
function updateColonySpawns(){
  const should = clamp(Math.floor(metrics.mcap / COLONY_STEP_MC), 0, MAX_COLONIES-1) + 1;
  while (colonies.length < should && colonies.length < MAX_COLONIES){
    const idx = colonies.length + 1;
    const base = pick(colonies);
    const ang = rand(0, Math.PI*2);
    const dist = rand(520, 720);
    const x = base.x + Math.cos(ang)*dist;
    const y = base.y + Math.sin(ang)*dist;

    const c = new Colony(idx, x, y);
    colonies.push(c);

    addLog("SPLIT", `New colony founded • Colony #${idx} (MC milestone)`, `split:${idx}`);
    shockwave(x,y, "rgba(109,255,181,.6)", 2.1);
    toast(`NEW COLONY #${idx}`);
    syncUI();
  }
}

// growth model
function applyGrowthImpulse(kind){
  const c = colonies[selectedColony];

  if (kind==="feed"){
    metrics.buyers += randi(0,1);
    metrics.volume += rand(120, 480);
    metrics.mcap += rand(280, 900);
    addLog("MILESTONE", `Feed • +nutrients`, "act:feed");
    shockwave(c.x, c.y, "rgba(120,255,210,.55)", 2.0);
  }
  if (kind==="small"){
    const b = randi(1,2), v = rand(250, 900), m = rand(450, 1400);
    metrics.buyers += b; metrics.volume += v; metrics.mcap += m;
    addLog("MILESTONE", `Buy • +${b} buyers • +$${Math.round(v)} vol • +$${Math.round(m)} MC`, "act:small");
    shockwave(c.x, c.y, "rgba(120,255,210,.55)", 2.2);
  }
  if (kind==="big"){
    const b = randi(2,5), v = rand(1200, 5200), m = rand(2500, 9200);
    metrics.buyers += b; metrics.volume += v; metrics.mcap += m;
    addLog("MILESTONE", `Whale • +${b} buyers • +$${Math.round(v)} vol • +$${Math.round(m)} MC`, "act:big");
    shockwave(c.x, c.y, "rgba(255,212,86,.6)", 2.6);
  }
  if (kind==="sell"){
    const drop = rand(900, 4200);
    metrics.mcap = Math.max(0, metrics.mcap - drop);
    metrics.volume += rand(120, 500);
    addLog("MILESTONE", `Sell-off • -$${Math.round(drop)} MC`, "act:sell");
    shockwave(c.x, c.y, "rgba(255,90,110,.55)", 2.6);
  }
  if (kind==="storm"){
    const v = rand(8000, 24000);
    metrics.volume += v;
    metrics.mcap += rand(1200, 4200);
    addLog("MILESTONE", `Volume Storm • +$${Math.round(v)} vol`, "act:storm");
    shockwave(c.x, c.y, "rgba(80,160,255,.55)", 2.6);
    for(let i=0;i<2;i++){
      const w = pick(c.worms);
      if (w) w.mutate("Storm surge");
    }
  }

  updateColonySpawns();
  syncUI();
}

function naturalTick(dt){
  metrics.volume += dt*0.10;
  metrics.mcap += dt*0.05;

  const nutrients =
    metrics.buyers * 0.010 +
    (metrics.volume/12000) * 0.010 +
    (metrics.mcap/60000) * 0.010;

  if (Math.random() < nutrients){
    const c = pick(colonies);
    if (c && totalWorms() < 280){
      c.worms.push(new Worm(c,false));
    }
  }

  if (Math.random() < clamp(metrics.volume/250000,0,1)*0.01){
    const c = pick(colonies);
    const w = c ? pick(c.worms) : null;
    if (w) w.mutate("Volume bloom");
  }

  updateColonySpawns();
}

// selection / focus
function setSelected(idx){
  selectedColony = clamp(idx, 0, colonies.length-1);
  const c = colonies[selectedColony];

  fpSelected.textContent = `#${c.idx}`;
  fpDNA.textContent = c.dna;
  fpBiome.textContent = c.biome;
  fpStyle.textContent = c.style;

  if (focusOn) fp.classList.add("on");

  shockwave(c.x, c.y, "rgba(180,90,255,.55)", 2.0);
  addLog("MILESTONE", `Selected Colony #${c.idx} (${c.dna.split("•")[0].trim()})`, `sel:${c.idx}`);
  syncUI();
}

// UI sync
function syncUI(){
  uiBuyers.textContent = `${Math.round(metrics.buyers)}`;
  uiVol.textContent = fmtMoney(metrics.volume);
  uiMcap.textContent = fmtMoney(metrics.mcap);
  uiCols.textContent = `${colonies.length}`;
  uiWorms.textContent = `${totalWorms()}`;

  const c = colonies[selectedColony];
  if (c){
    fpSelected.textContent = `#${c.idx}`;
    fpDNA.textContent = c.dna;
    fpBiome.textContent = c.biome;
    fpStyle.textContent = c.style;
  }
}

// interactions: tap select, drag pan, pinch zoom, double tap center
let pointers = new Map();
let lastTapTime = 0;
let lastTapPos = null;

function onPointerDown(e){
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
}
function onPointerMove(e){
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId);
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;

  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

  if (pointers.size === 1){
    view.cx -= dx / view.scale;
    view.cy -= dy / view.scale;
  } else if (pointers.size === 2){
    const pts = Array.from(pointers.values());
    const a = pts[0], b = pts[1];
    const dist = Math.hypot(a.x-b.x, a.y-b.y);
    if (!onPointerMove._dist) onPointerMove._dist = dist;
    const ratio = dist / onPointerMove._dist;
    view.targetScale = clamp(view.targetScale * ratio, 0.55, 2.35);
    onPointerMove._dist = dist;
  }
}
function onPointerUp(e){
  pointers.delete(e.pointerId);
  if (pointers.size < 2) onPointerMove._dist = null;

  const t = performance.now();
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;

  const isDouble = (t - lastTapTime) < 320 && lastTapPos && Math.hypot(sx-lastTapPos.x, sy-lastTapPos.y) < 24;
  if (isDouble){
    view.cx = 0; view.cy = 0;
    view.targetScale = 1.0;
    toast("CENTERED");
    lastTapTime = 0;
    lastTapPos = null;
    return;
  }

  const w = screenToWorld(e.clientX, e.clientY);
  let best = -1, bestD = 1e9;
  for(let i=0;i<colonies.length;i++){
    const c = colonies[i];
    const d = Math.hypot(c.x-w.x, c.y-w.y);
    if (d < bestD){ bestD=d; best=i; }
  }
  if (best>=0 && bestD < 260){
    setSelected(best);
    shockwave(w.x, w.y, "rgba(180,90,255,.55)", 2.0);
  } else {
    shockwave(w.x, w.y, "rgba(80,160,255,.45)", 1.8);
  }

  lastTapTime = t;
  lastTapPos = {x:sx,y:sy};
}

canvas.addEventListener("pointerdown", onPointerDown, {passive:false});
canvas.addEventListener("pointermove", onPointerMove, {passive:false});
canvas.addEventListener("pointerup", onPointerUp, {passive:false});
canvas.addEventListener("pointercancel", onPointerUp, {passive:false});

// buttons
feedBtn.onclick = ()=>applyGrowthImpulse("feed");
smallFeed.onclick = ()=>applyGrowthImpulse("small");
bigFeed.onclick = ()=>applyGrowthImpulse("big");
sellBtn.onclick = ()=>applyGrowthImpulse("sell");
stormBtn.onclick = ()=>applyGrowthImpulse("storm");

mutateBtn.onclick = ()=>{
  const c = colonies[selectedColony];
  const w = c ? pick(c.worms) : null;
  if (w) w.mutate("Forced mutation");
  addLog("MUTATION", `Forced mutation on Colony #${c.idx}`, `force:${c.idx}`);
  shockwave(c.x, c.y, "rgba(255,77,255,.55)", 2.4);
  toast("MUTATION");
};

focusBtn.onclick = ()=>{
  focusOn = !focusOn;
  focusBtn.textContent = focusOn ? "Focus: On" : "Focus: Off";
  if (focusOn){
    fp.classList.add("on");
    addLog("MILESTONE", `Focus enabled`, "ui:focus:on");
  } else {
    fp.classList.remove("on");
    addLog("MILESTONE", `Focus disabled`, "ui:focus:off");
  }
};

zoomInBtn.onclick = ()=>{ view.targetScale = clamp(view.targetScale*1.12, 0.55, 2.35); toast("ZOOM +"); };
zoomOutBtn.onclick = ()=>{ view.targetScale = clamp(view.targetScale/1.12, 0.55, 2.35); toast("ZOOM −"); };

captureBtn.onclick = ()=>{
  const a = document.createElement("a");
  a.download = "worm-colony.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
  addLog("MILESTONE", `Captured screenshot`, "ui:capture");
  toast("CAPTURED");
};

resetBtn.onclick = resetSim;

// loop
let last = performance.now();

function drawShockwavesStep(dt){
  drawShockwaves(dt);
}

function drawFrame(){
  draw();
}

function tick(){
  const t = performance.now();
  const dt = Math.min(36, t-last);
  last = t;

  naturalTick(dt);

  for (let c of colonies) c.step(dt);

  if (focusOn){
    const c = colonies[selectedColony];
    if (c){
      view.cx = lerp(view.cx, c.x, 0.03);
      view.cy = lerp(view.cy, c.y, 0.03);
    }
  }

  syncUI();
  drawFrame();

  requestAnimationFrame(tick);
}

function resetSim(){
  metrics = { buyers:0, volume:0, mcap:25000 };
  selectedColony = 0;
  focusOn = false;
  fp.classList.remove("on");
  focusBtn.textContent = "Focus: Off";

  view.cx = 0; view.cy = 0;
  view.scale = 1.0; view.targetScale = 1.0;

  shockwaves = [];
  logItems = [];
  renderLog();

  seedStars();
  colonies = [ new Colony(1, 0, 0) ];
  addLog("MILESTONE", "Simulation reset.", "sys:reset");
  toast("RESET");
  syncUI();
}

function boot(){
  resize();
  window.addEventListener("resize", resize, {passive:true});

  resetSim();
  setSelected(0);

  addLog("MILESTONE", "Worm Colony ready.", "sys:ready");
  requestAnimationFrame(tick);
}

boot();
