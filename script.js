(() => {
  "use strict";

  // ---------------------------
  // DOM
  // ---------------------------
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: true });

  const $buyers = document.getElementById("buyers");
  const $vol = document.getElementById("vol");
  const $mcap = document.getElementById("mcap");
  const $cols = document.getElementById("cols");
  const $worms = document.getElementById("worms");

  const $signature = document.getElementById("signature");
  const $dnaBadge = document.getElementById("dnaBadge");
  const $logList = document.getElementById("logList");
  const $toast = document.getElementById("toast");

  const feedBtn = document.getElementById("feedBtn");
  const smallBtn = document.getElementById("smallBtn");
  const whaleBtn = document.getElementById("whaleBtn");
  const sellBtn = document.getElementById("sellBtn");
  const stormBtn = document.getElementById("stormBtn");
  const mutateBtn = document.getElementById("mutateBtn");
  const focusBtn = document.getElementById("focusBtn");
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const captureBtn = document.getElementById("captureBtn");
  const resetBtn = document.getElementById("resetBtn");

  // ---------------------------
  // Helpers
  // ---------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const now = () => performance.now();
  const fmtMoney = (n) => {
    const x = Math.max(0, Math.round(n));
    return "$" + x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  const hash4 = () => Math.random().toString(16).slice(2, 6).toUpperCase();

  function toast(msg){
    $toast.textContent = msg;
    $toast.classList.add("on");
    setTimeout(() => $toast.classList.remove("on"), 1100);
  }

  // ---------------------------
  // Resize
  // ---------------------------
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", () => { dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); resize(); });
  resize();

  // ---------------------------
  // Camera (pan/zoom)
  // ---------------------------
  const cam = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    zoom: 1,
    targetZoom: 1,
    focusing: false
  };

  function worldToScreen(wx, wy){
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    const cx = w * 0.5, cy = h * 0.5;
    return {
      x: cx + (wx - cam.x) * cam.zoom,
      y: cy + (wy - cam.y) * cam.zoom
    };
  }
  function screenToWorld(sx, sy){
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    const cx = w * 0.5, cy = h * 0.5;
    return {
      x: cam.x + (sx - cx) / cam.zoom,
      y: cam.y + (sy - cy) / cam.zoom
    };
  }

  // ---------------------------
  // Economy (mock inputs for now)
  // ---------------------------
  const econ = {
    buyers: 0,
    volume: 0,
    mcap: 25000,
    nextColonyMc: 50000,
  };

  // ---------------------------
  // Logging (cap + merge spam)
  // ---------------------------
  const LOG_CAP = 40;
  const MERGE_WINDOW = 1800; // ms
  const logState = { items: [] }; // newest first

  function addLog(kind, msg){
    const t = new Date();
    const ts = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const headKey = kind + "::" + msg;
    const top = logState.items[0];

    if (top && top.key === headKey && (now() - top.t0) < MERGE_WINDOW){
      top.count++;
      top.time = ts;
      renderLog();
      return;
    }

    logState.items.unshift({
      key: headKey,
      kind,
      msg,
      time: ts,
      count: 1,
      t0: now()
    });

    if (logState.items.length > LOG_CAP) logState.items.length = LOG_CAP;
    renderLog();
  }

  function renderLog(){
    const frag = document.createDocumentFragment();
    for (const it of logState.items){
      const div = document.createElement("div");
      div.className = "logItem";
      const badgeClass = it.kind === "MUTATION" ? "badge mut" : "badge info";
      const countStr = it.count > 1 ? ` ×${it.count}` : "";
      div.innerHTML = `
        <div class="logTop">
          <div>${it.time}</div>
          <div class="${badgeClass}">${it.kind}${countStr}</div>
        </div>
        <div class="logMsg">${it.msg}</div>
      `;
      frag.appendChild(div);
    }
    $logList.innerHTML = "";
    $logList.appendChild(frag);
  }

  // ---------------------------
  // Colony + Worm simulation
  // ---------------------------
  const MAX_COLONIES = 8;

  const palettes = [
    ["#7affc8","#66f2ff","#b96bff","#ff5aa0","#ffd36a"],
    ["#66f2ff","#7affc8","#7dff6a","#b96bff","#ff7bd6"],
    ["#b96bff","#66f2ff","#7affc8","#ffd36a","#ff5aa0"],
    ["#ff5aa0","#ffd36a","#66f2ff","#7affc8","#b96bff"]
  ];

  const DNAs = [
    { name:"CALM",   drift:0.55, curl:0.70, limb:0.35, aura:0.55 },
    { name:"CHAOTIC",drift:1.05, curl:1.25, limb:0.55, aura:0.70 },
    { name:"AGGRESSIVE", drift:0.95, curl:0.90, limb:0.75, aura:0.85 },
    { name:"TOXIC",  drift:0.80, curl:1.10, limb:0.65, aura:0.95 },
    { name:"GLIDER", drift:0.75, curl:0.55, limb:0.45, aura:0.65 }
  ];
  const Biomes = ["NEON GARDEN","DEEP SEA","VOID ORCHID","ARC LAB","SYNTH SWAMP"];
  const Styles = ["COMET / ARC","CROWN / SPIRAL","RIBBON / DRIFT","JELLY / LIMBS","GLITCH / ORBIT"];

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  function newColony(id, x, y){
    const dna = pick(DNAs);
    const pal = pick(palettes);
    return {
      id,
      x, y,
      r: rnd(70, 120),
      aura: 1,
      auraPulse: rnd(0.7, 1.3),
      pal,
      dna,
      biome: pick(Biomes),
      style: pick(Styles),
      signature: `WORM-${hash4()}-${hash4()}`,
      worms: [],
      limbs: [], // branch strokes
      boss: null,
      t: rnd(1000)
    };
  }

  function makeWorm(colony, boss=false){
    const segs = boss ? irnd(30, 46) : irnd(14, 28);
    const base = boss ? rnd(7.5, 10.5) : rnd(4.0, 7.0);
    const c = pick(colony.pal);
    const a0 = rnd(0, Math.PI*2);

    const pts = [];
    const ox = colony.x + rnd(-colony.r*0.15, colony.r*0.15);
    const oy = colony.y + rnd(-colony.r*0.15, colony.r*0.15);
    for (let i=0;i<segs;i++){
      pts.push({ x: ox + Math.cos(a0)*i*2, y: oy + Math.sin(a0)*i*2 });
    }

    return {
      id: hash4().toLowerCase(),
      boss,
      color: c,
      base,
      segs,
      pts,
      ang: a0,
      angVel: rnd(-0.012, 0.012),
      speed: rnd(0.45, 1.1) * (boss ? 1.1 : 1.0),
      curl: rnd(0.6, 1.25) * colony.dna.curl,
      drift: rnd(0.6, 1.25) * colony.dna.drift,
      jitter: rnd(0.02, 0.06),
      life: 1,
      limbChance: rnd(0.006, 0.02) * colony.dna.limb
    };
  }

  const sim = {
    colonies: [],
    selectedId: 1,
    focusOn: false
  };

  // initial colony
  sim.colonies.push(newColony(1, 0, 0));
  // initial worms
  for (let i=0;i<10;i++) sim.colonies[0].worms.push(makeWorm(sim.colonies[0], false));
  // boss worm
  sim.colonies[0].boss = makeWorm(sim.colonies[0], true);
  sim.colonies[0].worms.push(sim.colonies[0].boss);

  function selectedColony(){
    return sim.colonies.find(c => c.id === sim.selectedId) || sim.colonies[0];
  }

  function updateHeaderBadges(){
    const c = selectedColony();
    $signature.textContent = c.signature;
    $dnaBadge.textContent = `${c.dna.name} • ${c.biome}`;
  }
  updateHeaderBadges();

  // ---------------------------
  // Colony growth + spawning
  // ---------------------------
  function ensureColonyByMcap(){
    while (econ.mcap >= econ.nextColonyMc && sim.colonies.length < MAX_COLONIES){
      const id = sim.colonies.length + 1;
      const angle = rnd(0, Math.PI*2);
      const dist = rnd(240, 420) + (id * 26);
      const nx = Math.cos(angle) * dist;
      const ny = Math.sin(angle) * dist;

      const c = newColony(id, nx, ny);
      // initial worms in new colony
      const count = irnd(6, 12);
      for (let i=0;i<count;i++) c.worms.push(makeWorm(c, false));
      c.boss = makeWorm(c, true);
      c.worms.push(c.boss);

      sim.colonies.push(c);
      econ.nextColonyMc += 50000;

      addLog("INFO", `New colony spawned • Colony #${id} (MC milestone)`);
      toast(`Colony #${id} spawned`);
    }
  }

  // ---------------------------
  // Inputs (simulated buys)
  // ---------------------------
  function applyBuy(kind){
    const buyersAdd = kind === "small" ? irnd(0,1) : kind === "whale" ? irnd(1,3) : irnd(0,2);
    const volAdd = kind === "small" ? rnd(60, 220) : kind === "whale" ? rnd(650, 2200) : rnd(120, 520);
    const mcAdd  = kind === "small" ? rnd(120, 700) : kind === "whale" ? rnd(1800, 6500) : rnd(450, 2200);

    econ.buyers += buyersAdd;
    econ.volume += volAdd;
    econ.mcap = Math.max(0, econ.mcap + mcAdd);

    addLog("INFO", `Buy • +${buyersAdd} buyers • +$${Math.round(volAdd)} vol • +$${Math.round(mcAdd)} MC`);
    growFromEcon( (buyersAdd*2) + (volAdd/320) + (mcAdd/1800) );

    ensureColonyByMcap();
  }

  function applySelloff(){
    const mcDrop = rnd(1200, 5200);
    econ.mcap = Math.max(0, econ.mcap - mcDrop);
    addLog("INFO", `Sell-off • −$${Math.round(mcDrop)} MC`);
    toast("Sell-off shock");
    shockwave( selectedColony(), 1.4, "hot" );
  }

  function applyStorm(){
    const volAdd = rnd(1200, 4800);
    econ.volume += volAdd;
    addLog("INFO", `Volume storm • +$${Math.round(volAdd)} volume`);
    toast("Volume storm");
    shockwave( selectedColony(), 1.25, "vio" );
    growFromEcon( volAdd / 220 );
  }

  function growFromEcon(amount){
    // distribute growth to selected colony (and slightly to all)
    const sel = selectedColony();
    for (const c of sim.colonies){
      const weight = (c === sel) ? 1.0 : 0.20;
      const add = amount * weight;

      // add worms occasionally
      if (Math.random() < 0.30 * clamp(add/3, 0.3, 1.1) && c.worms.length < 90){
        const w = makeWorm(c, false);
        c.worms.push(w);
        addLog("MUTATION", `New worm • Worm ${w.id} (Colony #${c.id})`);
      }

      // aura pulse
      c.aura = clamp(c.aura + add*0.02, 0.7, 2.1);

      // sometimes grow a limb stroke
      if (Math.random() < 0.25 * clamp(add/3, 0.15, 1.0)){
        growLimb(c);
      }
    }
  }

  // ---------------------------
  // Limb growth (branch strokes)
  // ---------------------------
  function growLimb(colony){
    // limb: polyline starting near colony center, heading outward with noise
    const steps = irnd(10, 18);
    const startA = rnd(0, Math.PI*2);
    const startR = rnd(10, colony.r*0.55);
    let x = colony.x + Math.cos(startA)*startR;
    let y = colony.y + Math.sin(startA)*startR;
    let a = startA + rnd(-0.8, 0.8);
    const pts = [{x,y}];

    for (let i=0;i<steps;i++){
      a += rnd(-0.45, 0.45) * colony.dna.curl;
      const step = rnd(6, 14) * colony.dna.drift;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push({x,y});
      // chance to fork once
      if (i === irnd(4, 10) && Math.random() < 0.35){
        // fork as separate limb
        const fork = pts.slice(0, i+1).map(p => ({...p}));
        colony.limbs.push({ pts: fork, life: 1, color: pick(colony.pal), w: rnd(2.0, 4.5) });
      }
    }

    colony.limbs.push({ pts, life: 1, color: pick(colony.pal), w: rnd(2.5, 6.0) });
    addLog("MUTATION", `Limb growth • Colony #${colony.id}`);
    shockwave(colony, 1.05, "teal");
  }

  // ---------------------------
  // Mutations
  // ---------------------------
  function mutate(){
    const c = selectedColony();
    if (!c) return;

    const roll = Math.random();
    if (roll < 0.33 && c.worms.length){
      const w = c.worms[irnd(0, c.worms.length-1)];
      w.base = clamp(w.base + rnd(-0.8, 1.2), 3.5, 12);
      w.speed = clamp(w.speed + rnd(-0.12, 0.22), 0.25, 1.8);
      w.curl = clamp(w.curl + rnd(-0.20, 0.35), 0.35, 2.2);
      w.color = pick(c.pal);
      addLog("MUTATION", `Color/behavior shift • Worm ${w.id} (Colony #${c.id})`);
    } else if (roll < 0.66){
      // dna nudge
      const d = pick(DNAs);
      c.dna = d;
      c.style = pick(Styles);
      addLog("MUTATION", `DNA shift • Colony #${c.id} → ${d.name}`);
      updateHeaderBadges();
      shockwave(c, 1.2, "vio");
    } else {
      // grow multiple limbs
      growLimb(c);
      if (Math.random() < 0.6) growLimb(c);
    }
    toast("Mutation");
  }

  // ---------------------------
  // Shockwaves
  // ---------------------------
  const waves = [];
  function shockwave(colony, strength=1, tone="teal"){
    waves.push({
      x: colony.x, y: colony.y,
      r: 0,
      a: 0.55 * strength,
      tone,
      life: 1
    });
  }

  // ---------------------------
  // Drawing
  // ---------------------------
  function drawBackground(w, h){
    // subtle grid
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,255,255,.10)";
    ctx.lineWidth = 1;

    const step = 44;
    for (let x=0; x<w; x+=step){
      ctx.beginPath();
      ctx.moveTo(x,0); ctx.lineTo(x,h);
      ctx.stroke();
    }
    for (let y=0; y<h; y+=step){
      ctx.beginPath();
      ctx.moveTo(0,y); ctx.lineTo(w,y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAura(c){
    const s = worldToScreen(c.x, c.y);
    const r = c.r * cam.zoom * (0.95 + 0.08*Math.sin(c.t*0.02*c.auraPulse)) * c.aura;

    const g = ctx.createRadialGradient(s.x, s.y, r*0.15, s.x, s.y, r);
    g.addColorStop(0, "rgba(120,255,210,.00)");
    g.addColorStop(0.55, "rgba(120,255,210,.10)");
    g.addColorStop(1, "rgba(185,105,255,.00)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawLimbs(c){
    if (!c.limbs.length) return;
    for (const L of c.limbs){
      const pts = L.pts;
      if (pts.length < 2) continue;
      ctx.save();
      ctx.globalAlpha = 0.55 * L.life;
      ctx.lineWidth = L.w * cam.zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = L.color;

      ctx.beginPath();
      const p0 = worldToScreen(pts[0].x, pts[0].y);
      ctx.moveTo(p0.x, p0.y);
      for (let i=1;i<pts.length;i++){
        const p = worldToScreen(pts[i].x, pts[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // glow
      ctx.globalAlpha = 0.18 * L.life;
      ctx.lineWidth = (L.w*2.2) * cam.zoom;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawWorm(w){
    const pts = w.pts;
    if (pts.length < 2) return;

    // body stroke
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = w.color;

    // glow pass
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = (w.base * 2.4) * cam.zoom;
    ctx.beginPath();
    let p = worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(p.x, p.y);
    for (let i=1;i<pts.length;i++){
      p = worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // main pass
    ctx.globalAlpha = w.boss ? 0.95 : 0.85;
    ctx.lineWidth = (w.base) * cam.zoom;
    ctx.beginPath();
    p = worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(p.x, p.y);
    for (let i=1;i<pts.length;i++){
      p = worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // head bead
    const head = worldToScreen(pts[0].x, pts[0].y);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(head.x, head.y, (w.base*0.35)*cam.zoom, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawColonyLabel(c){
    const s = worldToScreen(c.x, c.y);
    const r = c.r * cam.zoom;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = "900 12px system-ui,-apple-system";
    ctx.fillStyle = "rgba(240,245,255,.86)";
    ctx.textAlign = "center";
    ctx.fillText(`Colony #${c.id}`, s.x, s.y - r - 14);
    ctx.restore();
  }

  function drawWaves(){
    if (!waves.length) return;
    for (const wv of waves){
      const s = worldToScreen(wv.x, wv.y);
      const rr = wv.r * cam.zoom;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = wv.a * wv.life;
      ctx.lineWidth = 2;
      let col = "rgba(120,255,210,.55)";
      if (wv.tone === "vio") col = "rgba(185,105,255,.55)";
      if (wv.tone === "hot") col = "rgba(255,90,160,.55)";
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------------------
  // Simulation step
  // ---------------------------
  function stepWorm(colony, w){
    // wobble direction for irregular paths
    w.angVel += rnd(-0.0015, 0.0015) * w.jitter;
    w.angVel = clamp(w.angVel, -0.04, 0.04);

    // add sporadic “spikes” so they don’t circle neatly
    if (Math.random() < 0.02 * colony.dna.drift){
      w.angVel += rnd(-0.02, 0.02);
    }

    w.ang += w.angVel * (0.8 + 0.4*Math.sin(colony.t*0.015));

    // head movement
    const head = w.pts[0];
    const targetR = colony.r * (0.45 + 0.35*Math.sin((colony.t*0.004) + (w.boss?2:0)));
    const orbitA = w.ang + Math.sin(colony.t*0.01) * 0.25 * w.curl;
    const tx = colony.x + Math.cos(orbitA) * targetR;
    const ty = colony.y + Math.sin(orbitA) * targetR;

    // move head toward target with drift and noise
    const dx = (tx - head.x);
    const dy = (ty - head.y);
    head.x += dx * 0.02 * w.drift + Math.cos(w.ang) * w.speed * 0.55;
    head.y += dy * 0.02 * w.drift + Math.sin(w.ang) * w.speed * 0.55;

    // slight pull to colony
    head.x = lerp(head.x, colony.x, 0.0025);
    head.y = lerp(head.y, colony.y, 0.0025);

    // segments follow with spring, creating organic motion
    for (let i=1;i<w.pts.length;i++){
      const p = w.pts[i];
      const prev = w.pts[i-1];
      const ddx = prev.x - p.x;
      const ddy = prev.y - p.y;
      p.x += ddx * 0.26;
      p.y += ddy * 0.26;

      // micro wobble
      const jitter = (w.boss ? 0.65 : 1.0) * w.jitter;
      p.x += rnd(-1,1) * jitter;
      p.y += rnd(-1,1) * jitter;
    }

    // limb chance from worms (rare)
    if (Math.random() < w.limbChance){
      growLimb(colony);
    }
  }

  function tick(){
    // smooth camera
    cam.zoom = lerp(cam.zoom, cam.targetZoom, 0.10);
    cam.x += cam.vx; cam.y += cam.vy;
    cam.vx *= 0.86; cam.vy *= 0.86;

    // focus camera on selected
    if (sim.focusOn){
      const c = selectedColony();
      cam.x = lerp(cam.x, c.x, 0.08);
      cam.y = lerp(cam.y, c.y, 0.08);
    }

    // step simulation
    for (const c of sim.colonies){
      c.t += 1;
      // fade limbs slowly
      for (const L of c.limbs) L.life = clamp(L.life - 0.0009, 0, 1);
      c.limbs = c.limbs.filter(L => L.life > 0.02);

      for (const w of c.worms){
        stepWorm(c, w);
      }
    }

    // waves
    for (const wv of waves){
      wv.r += 9;
      wv.life -= 0.02;
    }
    while (waves.length && waves[0].life <= 0) waves.shift();

    // render
    draw();
    requestAnimationFrame(tick);
  }

  function draw(){
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    ctx.clearRect(0,0,w,h);

    drawBackground(w,h);

    // auras
    for (const c of sim.colonies) drawAura(c);

    // shockwaves
    drawWaves();

    // limbs + worms
    for (const c of sim.colonies){
      drawLimbs(c);
      for (const w0 of c.worms) drawWorm(w0);
    }

    // labels (only when zoomed in enough)
    if (cam.zoom > 0.8){
      for (const c of sim.colonies) drawColonyLabel(c);
    }
  }

  // ---------------------------
  // UI update loop
  // ---------------------------
  function refreshUI(){
    $buyers.textContent = String(econ.buyers);
    $vol.textContent = fmtMoney(econ.volume);
    $mcap.textContent = fmtMoney(econ.mcap);
    $cols.textContent = String(sim.colonies.length);

    let totalW = 0;
    for (const c of sim.colonies) totalW += c.worms.length;
    $worms.textContent = String(totalW);

    // keep top pills fresh
    updateHeaderBadges();

    setTimeout(refreshUI, 220);
  }
  refreshUI();

  // ---------------------------
  // Input: Tap select colony
  // ---------------------------
  function nearestColony(wx, wy){
    let best = null;
    let bestD = Infinity;
    for (const c of sim.colonies){
      const dx = c.x - wx;
      const dy = c.y - wy;
      const d = dx*dx + dy*dy;
      if (d < bestD){
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  function selectColony(id){
    sim.selectedId = id;
    const c = selectedColony();
    updateHeaderBadges();
    addLog("INFO", `Selected colony • Colony #${c.id} (${c.dna.name})`);
    toast(`Colony #${c.id}`);
    shockwave(c, 1.05, "teal");
  }

  // ---------------------------
  // Touch + mouse pan/zoom + double tap
  // ---------------------------
  let dragging = false;
  let lastX = 0, lastY = 0;
  let lastTapAt = 0;

  // pinch state
  let pinch = null;

  function getTouches(e){
    const rect = canvas.getBoundingClientRect();
    const pts = [];
    for (let i=0;i<e.touches.length;i++){
      const t = e.touches[i];
      pts.push({ x: t.clientX - rect.left, y: t.clientY - rect.top, id: t.identifier });
    }
    return pts;
  }

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const pts = getTouches(e);

    if (pts.length === 1){
      const p = pts[0];
      dragging = true;
      lastX = p.x; lastY = p.y;

      // double tap center
      const t = now();
      if (t - lastTapAt < 280){
        cam.x = 0; cam.y = 0;
        cam.targetZoom = 1;
        toast("Centered");
      }
      lastTapAt = t;

    } else if (pts.length >= 2){
      const a = pts[0], b = pts[1];
      pinch = {
        startDist: Math.hypot(b.x - a.x, b.y - a.y),
        startZoom: cam.targetZoom
      };
    }
  }, { passive:false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const pts = getTouches(e);

    if (pts.length === 1 && dragging && !pinch){
      const p = pts[0];
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      lastX = p.x; lastY = p.y;
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;

    } else if (pts.length >= 2 && pinch){
      const a = pts[0], b = pts[1];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const z = pinch.startZoom * (d / pinch.startDist);
      cam.targetZoom = clamp(z, 0.5, 2.6);
    }
  }, { passive:false });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();

    // if it was a tap (not much move), select colony
    // (use lastX/lastY as the release point)
    if (!pinch){
      const wx = screenToWorld(lastX, lastY).x;
      const wy = screenToWorld(lastX, lastY).y;
      const c = nearestColony(wx, wy);
      if (c){
        // tap threshold: must be near
        const dx = c.x - wx, dy = c.y - wy;
        if ((dx*dx + dy*dy) < (c.r * c.r * 1.6)){
          selectColony(c.id);
        }
      }
    }

    dragging = false;
    pinch = null;
  }, { passive:false });

  // mouse support (desktop)
  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    dragging = true;
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - lastX, dy = y - lastY;
    lastX = x; lastY = y;
    cam.x -= dx / cam.zoom;
    cam.y -= dy / cam.zoom;
  });
  window.addEventListener("mouseup", () => dragging = false);
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wxy = screenToWorld(sx, sy);
    const c = nearestColony(wxy.x, wxy.y);
    if (c){
      const dx = c.x - wxy.x, dy = c.y - wxy.y;
      if ((dx*dx + dy*dy) < (c.r * c.r * 1.6)){
        selectColony(c.id);
      }
    }
  });

  // wheel zoom (desktop)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.targetZoom = clamp(cam.targetZoom + (e.deltaY > 0 ? -0.08 : 0.08), 0.5, 2.6);
  }, { passive:false });

  // ---------------------------
  // Buttons
  // ---------------------------
  feedBtn.addEventListener("click", () => { applyBuy("feed"); toast("Fed"); shockwave(selectedColony(), 1.05, "teal"); });
  smallBtn.addEventListener("click", () => applyBuy("small"));
  whaleBtn.addEventListener("click", () => applyBuy("whale"));
  sellBtn.addEventListener("click", () => applySelloff());
  stormBtn.addEventListener("click", () => applyStorm());
  mutateBtn.addEventListener("click", () => mutate());

  focusBtn.addEventListener("click", () => {
    sim.focusOn = !sim.focusOn;
    focusBtn.textContent = sim.focusOn ? "FOCUS: ON" : "FOCUS: OFF";
    toast(sim.focusOn ? "Focus on" : "Focus off");
  });

  zoomInBtn.addEventListener("click", () => { cam.targetZoom = clamp(cam.targetZoom + 0.18, 0.5, 2.6); });
  zoomOutBtn.addEventListener("click", () => { cam.targetZoom = clamp(cam.targetZoom - 0.18, 0.5, 2.6); });

  captureBtn.addEventListener("click", () => {
    try{
      const a = document.createElement("a");
      a.download = `worm-colony-${Date.now()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
      toast("Captured");
    }catch(err){
      toast("Capture blocked");
    }
  });

  resetBtn.addEventListener("click", () => {
    // reset sim cleanly
    econ.buyers = 0;
    econ.volume = 0;
    econ.mcap = 25000;
    econ.nextColonyMc = 50000;

    sim.colonies = [ newColony(1, 0, 0) ];
    sim.selectedId = 1;
    sim.focusOn = false;
    focusBtn.textContent = "FOCUS: OFF";

    for (let i=0;i<10;i++) sim.colonies[0].worms.push(makeWorm(sim.colonies[0], false));
    sim.colonies[0].boss = makeWorm(sim.colonies[0], true);
    sim.colonies[0].worms.push(sim.colonies[0].boss);

    cam.x = 0; cam.y = 0; cam.targetZoom = 1;

    logState.items = [];
    renderLog();

    updateHeaderBadges();
    addLog("INFO", "Simulation reset");
    toast("Reset");
  });

  // ---------------------------
  // Kick off
  // ---------------------------
  addLog("INFO", "Worm Colony ready");
  ensureColonyByMcap();
  tick();

})();
