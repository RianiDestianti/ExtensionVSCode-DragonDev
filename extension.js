const vscode = require("vscode");

const STATE_KEY = "petDragon.state";
const XP_BASE = 100;

/** @type {vscode.WebviewView | undefined} */
let view;
/** @type {vscode.StatusBarItem | undefined} */
let statusBar;
let decayTimer;
/** @type {vscode.ExtensionContext} */
let ctx;

function defaultState() {
  return {
    name: "Ember",
    level: 1,
    xp: 0,
    hunger: 80,
    happiness: 80,
    energy: 90,
    lastTick: Date.now(),
  };
}

function getState() {
  const raw = ctx.globalState.get(STATE_KEY);
  return raw ? { ...defaultState(), ...raw } : defaultState();
}
function saveState(s) {
  return ctx.globalState.update(STATE_KEY, s);
}
function xpForLevel(level) {
  return Math.round(XP_BASE * Math.pow(level, 1.35));
}
function clamp(n) {
  return Math.max(0, Math.min(100, n));
}

function applyDecay(s) {
  const now = Date.now();
  const minutes = (now - s.lastTick) / 60000;
  if (minutes <= 0) return s;
  s.hunger = clamp(s.hunger - minutes * 0.6);
  s.happiness = clamp(s.happiness - minutes * 0.4);
  s.energy = clamp(s.energy + minutes * 0.9);
  s.lastTick = now;
  return s;
}

function mood(s) {
  const avg = (s.hunger + s.happiness) / 2;
  if (s.energy < 20) return { label: "sleepy", emoji: "😴" };
  if (avg > 75) return { label: "joyful", emoji: "😄" };
  if (s.hunger < 25) return { label: "hungry", emoji: "🍖" };
  if (s.happiness < 30) return { label: "lonely", emoji: "🥺" };
  if (avg > 45) return { label: "content", emoji: "🙂" };
  return { label: "grumpy", emoji: "😾" };
}

function addXp(s, amount) {
  s.xp += amount;
  let leveled = false;
  while (s.xp >= xpForLevel(s.level)) {
    s.xp -= xpForLevel(s.level);
    s.level += 1;
    leveled = true;
  }
  return leveled;
}

function pushState(s) {
  if (view) {
    view.webview.postMessage({
      type: "state",
      state: s,
      mood: mood(s),
      xpNeeded: xpForLevel(s.level),
      color: vscode.workspace.getConfiguration("petDragon").get("color", "emerald"),
    });
  }
}

function updateStatusBar(s) {
  const cfg = vscode.workspace.getConfiguration("petDragon");
  if (!cfg.get("showInStatusBar", true)) {
    if (statusBar) statusBar.hide();
    return;
  }
  if (!statusBar) {
    statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBar.command = "petDragon.focus";
    ctx.subscriptions.push(statusBar);
  }
  const m = mood(s);
  statusBar.text = `🐉 ${s.name} Lv.${s.level} ${m.emoji}`;
  statusBar.tooltip = new vscode.MarkdownString(
    `**${s.name}** — level ${s.level} (${m.label})\n\n` +
      `🍖 Hunger ${Math.round(s.hunger)}%  \n` +
      `💛 Happiness ${Math.round(s.happiness)}%  \n` +
      `⚡ Energy ${Math.round(s.energy)}%`
  );
  statusBar.show();
}

function refresh(s) {
  saveState(s);
  updateStatusBar(s);
  pushState(s);
}

function action(name) {
  if (view) view.webview.postMessage({ type: "action", action: name });
}

function doFeed(s) {
  s.hunger = clamp(s.hunger + 25);
  s.happiness = clamp(s.happiness + 5);
  addXp(s, 3);
  action("eat");
  refresh(s);
}
function doPlay(s) {
  if (s.energy < 15) {
    vscode.window.setStatusBarMessage(`😴 ${s.name} is too tired to play.`, 2500);
    action("sleep");
    refresh(s);
    return;
  }
  s.happiness = clamp(s.happiness + 20);
  s.energy = clamp(s.energy - 12);
  s.hunger = clamp(s.hunger - 4);
  addXp(s, 5);
  action("play");
  refresh(s);
}
function doFire(s) {
  if (s.energy < 20) {
    vscode.window.setStatusBarMessage(`😮‍💨 ${s.name} is out of breath.`, 2500);
    return;
  }
  s.energy = clamp(s.energy - 8);
  s.happiness = clamp(s.happiness + 6);
  addXp(s, 2);
  action("fire");
  refresh(s);
}

function onSave() {
  const s = applyDecay(getState());
  const gain = vscode.workspace.getConfiguration("petDragon").get("xpPerSave", 8);
  const leveled = addXp(s, gain);
  s.happiness = clamp(s.happiness + 2);
  if (leveled) {
    vscode.window.showInformationMessage(`🎉 ${s.name} reached level ${s.level}!`);
    action("levelup");
  } else {
    action("xp");
  }
  refresh(s);
}

// ---------------------------------------------------------------------------
// Webview view
// ---------------------------------------------------------------------------
class DragonViewProvider {
  constructor(extUri) {
    this.extUri = extUri;
  }
  resolveWebviewView(webviewView) {
    view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extUri, "media")],
    };
    webviewView.webview.html = this.html(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg) => {
      const s = applyDecay(getState());
      if (msg.type === "ready") refresh(s);
      else if (msg.type === "feed") doFeed(s);
      else if (msg.type === "play") doPlay(s);
      else if (msg.type === "fire") doFire(s);
    });
    webviewView.onDidDispose(() => {
      view = undefined;
    });
  }
  html(webview) {
    const nonce = getNonce();
    const dragonUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extUri, "media", "dragon.js")
    );
    const csp =
      `default-src 'none'; img-src ${webview.cspSource} data:; ` +
      `style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return /* html */ `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="${csp}"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>${STYLES}</style>
</head><body>
  <canvas id="scene"></canvas>
  <div class="hud">
    <div class="line">
      <span class="name" id="name">Ember</span>
      <span class="mood" id="mood">🙂</span>
    </div>
    <div class="xprow">
      <span class="lvl" id="lvl">Lv.1</span>
      <div class="xpbar"><div class="xpfill" id="xpFill"></div></div>
    </div>
    <div class="mini">
      <span class="chip" id="chipHunger">🍖 80%</span>
      <span class="chip" id="chipHappy">💛 80%</span>
      <span class="chip" id="chipEnergy">⚡ 90%</span>
    </div>
  </div>
  <div class="controls">
    <button id="btnFeed" title="Feed">🍖</button>
    <button id="btnPlay" title="Play">🎾</button>
    <button id="btnFire" title="Breathe fire">🔥</button>
  </div>
<script nonce="${nonce}" src="${dragonUri}"></script>
<script nonce="${nonce}">${SCRIPT}</script>
</body></html>`;
  }
}

function activate(context) {
  ctx = context;
  refresh(applyDecay(getState()));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "petDragon.view",
      new DragonViewProvider(context.extensionUri),
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand("petDragon.focus", () =>
      vscode.commands.executeCommand("petDragon.view.focus")
    ),
    vscode.commands.registerCommand("petDragon.feed", () =>
      doFeed(applyDecay(getState()))
    ),
    vscode.commands.registerCommand("petDragon.play", () =>
      doPlay(applyDecay(getState()))
    ),
    vscode.commands.registerCommand("petDragon.breatheFire", () =>
      doFire(applyDecay(getState()))
    ),
    vscode.commands.registerCommand("petDragon.rename", async () => {
      const s = getState();
      const name = await vscode.window.showInputBox({
        prompt: "Name your dragon",
        value: s.name,
        validateInput: (v) =>
          v && v.trim().length > 0 && v.length <= 20 ? undefined : "1–20 characters.",
      });
      if (name) {
        s.name = name.trim();
        refresh(s);
      }
    }),
    vscode.commands.registerCommand("petDragon.reset", async () => {
      const yes = await vscode.window.showWarningMessage(
        "Reset your dragon to a fresh hatchling?",
        { modal: true },
        "Reset"
      );
      if (yes === "Reset") {
        refresh(defaultState());
        vscode.window.showInformationMessage("🥚 A new dragon has hatched!");
      }
    }),
    vscode.workspace.onDidSaveTextDocument(onSave),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("petDragon")) refresh(applyDecay(getState()));
    })
  );

  decayTimer = setInterval(() => refresh(applyDecay(getState())), 60000);
  updateStatusBar(getState());
}

function deactivate() {
  if (decayTimer) clearInterval(decayTimer);
}

function getNonce() {
  let t = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) t += c.charAt(Math.floor(Math.random() * c.length));
  return t;
}

module.exports = { activate, deactivate };

// ---------------------------------------------------------------------------
const STYLES = `
*{ box-sizing:border-box; margin:0; padding:0; }
html,body{ height:100%; overflow:hidden; font-family:var(--vscode-font-family); color:#fff; }
#scene{ position:absolute; inset:0; width:100%; height:100%; display:block; image-rendering:pixelated; }
.hud{ position:absolute; top:6px; left:8px; right:8px; pointer-events:none;
  text-shadow:0 1px 2px rgba(0,0,0,.6); }
.line{ display:flex; align-items:center; gap:6px; }
.name{ font-size:13px; font-weight:700; }
.mood{ font-size:13px; }
.xprow{ display:flex; align-items:center; gap:6px; margin-top:3px; }
.lvl{ font-size:11px; font-weight:600; }
.xpbar{ flex:1; height:5px; border-radius:4px; background:rgba(0,0,0,.35); overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.15); }
.xpfill{ height:100%; width:0%; background:linear-gradient(90deg,#c084fc,#f0abfc); transition:width .5s ease; }
.mini{ display:flex; gap:5px; margin-top:5px; }
.chip{ font-size:10px; font-weight:600; padding:1px 6px; border-radius:10px;
  background:rgba(0,0,0,.35); box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
.controls{ position:absolute; bottom:8px; left:0; right:0; display:flex; justify-content:center; gap:8px; }
button{ width:34px; height:34px; font-size:16px; cursor:pointer; border:none; border-radius:9px;
  background:rgba(20,30,25,.55); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);
  transition:transform .08s ease, background .15s ease; }
button:hover{ background:rgba(30,45,35,.8); }
button:active{ transform:translateY(1px) scale(.94); }
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
const cv = document.getElementById("scene");
const g2 = cv.getContext("2d");
const DW = Dragon.W, DH = Dragon.H;
let PAL = Dragon.PAL.slice();

// scale color themes: [body, shade, highlight, wing, wingLight]
const THEMES = {
  emerald:  ["#4fbf72","#37985a","#86e6a0","#3aa564","#59c985"],
  crimson:  ["#e0574a","#b23a30","#ff8377","#b5392f","#e2685c"],
  sapphire: ["#4a7bd6","#3055a6","#78a4f5","#3a5fb0","#6f93e6"],
  amethyst: ["#9b5fd6","#743fae","#c08cf5","#6f3fb0","#a86fe0"],
  gold:     ["#e6b23f","#bd8a20","#ffd870","#c8951f","#ecc45a"],
};
function applyColor(name){
  const c = THEMES[name] || THEMES.emerald;
  PAL = Dragon.PAL.slice();
  PAL[2]=c[0]; PAL[3]=c[1]; PAL[4]=c[2]; PAL[11]=c[3]; PAL[12]=c[4];
}

let dpr = window.devicePixelRatio || 1;
let Wd = 0, Hd = 0;
function resize(){
  Wd = cv.clientWidth; Hd = cv.clientHeight;
  cv.width = Wd * dpr; cv.height = Hd * dpr;
  g2.setTransform(dpr,0,0,dpr,0,0);
  g2.imageSmoothingEnabled = false;
}
window.addEventListener("resize", resize); resize();

// ---- persistent scene decorations (seeded so they don't jump) ----
let rng = 987654321;
function rand(){ rng = (rng*1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; }
const tufts = [];
for (let i=0;i<26;i++) tufts.push({ x:rand(), y:0.5+rand()*0.5, s:0.6+rand()*0.8, sw:rand() });
const clouds = [];
for (let i=0;i<3;i++) clouds.push({ x:rand(), y:0.08+rand()*0.18, s:0.7+rand()*0.6, v:0.004+rand()*0.006 });

// ---- pet state ----
let energyLow = false;
let happy = false;
let bx = 0.5;              // 0..1 horizontal position
let targetX = 0.5;
let hopT = -1;             // hop timer
let nextMove = 2000;
let moveClock = 0;
let blinkClock = 0, blinking = 0;
let flash = { eat:0, fire:0, play:0, level:0, sleep:0 };
let particles = [];

function grassColor(y){ // vertical gradient
  const top = [122,182,96], bot = [74,138,72];
  const t = y;
  return "rgb(" + Math.round(top[0]+(bot[0]-top[0])*t) + "," +
    Math.round(top[1]+(bot[1]-top[1])*t) + "," +
    Math.round(top[2]+(bot[2]-top[2])*t) + ")";
}

function drawScene(ts, dt){
  // sky strip + grass
  const grad = g2.createLinearGradient(0,0,0,Hd);
  grad.addColorStop(0, "#bfe3a6");
  grad.addColorStop(0.28, "#8fce74");
  grad.addColorStop(1, "#4a8a48");
  g2.fillStyle = grad; g2.fillRect(0,0,Wd,Hd);

  // clouds
  g2.fillStyle = "rgba(255,255,255,.75)";
  for (const c of clouds){
    c.x += c.v * (dt/16);
    if (c.x > 1.2) c.x = -0.2;
    const cx = c.x*Wd, cy = c.y*Hd, s = 10*c.s;
    g2.beginPath();
    g2.arc(cx,cy,s,0,7); g2.arc(cx+s,cy+2,s*0.8,0,7); g2.arc(cx-s,cy+2,s*0.7,0,7);
    g2.fill();
  }

  // grass tufts
  const horizon = Hd*0.32;
  for (const t of tufts){
    const gx = t.x*Wd, gy = horizon + t.y*(Hd-horizon);
    const sway = Math.sin(ts/600 + t.sw*6) * 1.5;
    const h = 7*t.s, w = 2.2*t.s;
    g2.strokeStyle = "rgba(40,90,45,.55)"; g2.lineWidth = w;
    g2.beginPath();
    g2.moveTo(gx, gy); g2.quadraticCurveTo(gx+sway, gy-h*0.6, gx+sway*1.6, gy-h);
    g2.moveTo(gx, gy); g2.quadraticCurveTo(gx-2, gy-h*0.5, gx-3, gy-h*0.9);
    g2.stroke();
  }
}

function drawDragon(ts){
  // scale sprite to view
  const S = Math.max(3, Math.floor(Math.min(Wd/(DW+8), (Hd*0.62)/DH)));
  const groundY = Hd*0.80;
  const bob = Math.sin(ts/650) * S * 0.6;
  let hopY = 0, extraWing = 0;
  if (hopT >= 0){
    const k = hopT; // 0..1
    hopY = -Math.sin(k*Math.PI) * S * 7;
    extraWing = Math.sin(k*Math.PI);
  }
  const px0 = bx*(Wd - DW*S) ;
  const py0 = groundY - DH*S + bob + hopY;

  // shadow
  const shW = DW*S*0.42, shrink = hopT>=0 ? (1 - Math.sin(hopT*Math.PI)*0.4) : 1;
  g2.fillStyle = "rgba(0,0,0,.28)";
  g2.beginPath();
  g2.ellipse(px0 + DW*S/2, groundY - S, shW*shrink, S*2.4*shrink, 0, 0, 7);
  g2.fill();

  // sprite params
  const wing = Math.min(1, (Math.sin(ts/220)*0.5+0.5) + extraWing);
  let blink = false;
  if (blinking > 0) blink = true;
  const look = Math.sin(ts/2200);
  const mouth = flash.fire>0 ? 1 : (flash.eat>0 ? (Math.sin(ts/90)*0.5+0.5) : 0);
  const blush = happy || flash.play>0 || flash.level>0;
  const sleeping = energyLow;

  const fr = Dragon.draw({
    wing: sleeping ? 0 : wing,
    blink: sleeping ? true : blink,
    look: look,
    blush: blush,
    mouth: sleeping ? 0 : mouth,
  });

  for (let y=0;y<DH;y++){
    for (let x=0;x<DW;x++){
      const ci = fr.g[y*DW+x];
      if (!ci) continue;
      g2.fillStyle = PAL[ci];
      g2.fillRect(Math.round(px0 + x*S), Math.round(py0 + y*S), S, S);
    }
  }

  if (sleeping){
    g2.font = (S*4)+"px var(--vscode-font-family)";
    g2.fillStyle = "rgba(255,255,255,.85)";
    const zz = Math.sin(ts/500);
    g2.fillText("z", px0+DW*S*0.8, py0 - S*2 + zz*3);
    g2.fillText("Z", px0+DW*S*0.95, py0 - S*5 - zz*3);
  }

  // mouth anchor for particles
  return { mx: px0 + DW*S*0.5, my: py0 + DH*S*0.5, S };
}

function spawnHearts(x,y,S){
  for (let i=0;i<5;i++)
    particles.push({ x, y, vx:(Math.random()-0.5)*0.5, vy:-0.6-Math.random()*0.6,
      life:1, kind:"heart", s:S });
}
function spawnFire(x,y,S){
  for (let i=0;i<14;i++)
    particles.push({ x, y:y+2, vx:1.2+Math.random()*1.4, vy:(Math.random()-0.5)*0.8,
      life:1, kind:"fire", s:S });
}
function spawnStars(x,y,S){
  for (let i=0;i<7;i++)
    particles.push({ x, y, vx:(Math.random()-0.5)*1.2, vy:-0.8-Math.random()*0.8,
      life:1, kind:"star", s:S });
}
function drawParticles(dt){
  for (const p of particles){
    p.x += p.vx*(dt/16); p.y += p.vy*(dt/16); p.vy += 0.03*(dt/16); p.life -= 0.02*(dt/16);
    g2.globalAlpha = Math.max(0, p.life);
    if (p.kind==="fire"){
      g2.fillStyle = p.life>0.6 ? "#ffe066" : (p.life>0.3 ? "#ff9a3a" : "#e2431a");
      const r = 2 + p.life*p.s*0.8;
      g2.beginPath(); g2.arc(p.x,p.y,r,0,7); g2.fill();
    } else {
      g2.font = (p.s*3.5)+"px serif";
      g2.fillText(p.kind==="heart"?"💛":"⭐", p.x, p.y);
    }
  }
  g2.globalAlpha = 1;
  particles = particles.filter(p => p.life > 0);
}

let last = performance.now();
function loop(now){
  const dt = Math.min(50, now - last); last = now;

  // movement AI
  moveClock += dt;
  if (hopT < 0 && moveClock > nextMove && !energyLow){
    targetX = 0.15 + Math.random()*0.7;
    hopT = 0; moveClock = 0; nextMove = 2500 + Math.random()*3500;
  }
  if (hopT >= 0){
    hopT += dt/520;
    bx += (targetX - bx) * 0.08;
    if (hopT >= 1) hopT = -1;
  }
  // blink
  blinkClock += dt;
  if (blinking > 0){ blinking -= dt; }
  else if (blinkClock > 2600 + Math.random()*2600){ blinking = 160; blinkClock = 0; }

  for (const k in flash) if (flash[k] > 0) flash[k] -= dt;

  drawScene(now, dt);
  const info = drawDragon(now);

  // trigger particle bursts once per action
  if (flash.eat > 900 && !info._e){ }
  drawParticles(dt);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---- messages from extension ----
window.addEventListener("message", (ev) => {
  const m = ev.data;
  if (m.type === "state"){
    const s = m.state;
    document.getElementById("name").textContent = s.name;
    document.getElementById("mood").textContent = m.mood.emoji;
    document.getElementById("lvl").textContent = "Lv." + s.level;
    document.getElementById("xpFill").style.width =
      Math.min(100, (s.xp/m.xpNeeded)*100) + "%";
    document.getElementById("chipHunger").textContent = "🍖 " + Math.round(s.hunger) + "%";
    document.getElementById("chipHappy").textContent = "💛 " + Math.round(s.happiness) + "%";
    document.getElementById("chipEnergy").textContent = "⚡ " + Math.round(s.energy) + "%";
    energyLow = s.energy < 20;
    happy = ((s.hunger + s.happiness)/2) > 72;
    applyColor(m.color);
  } else if (m.type === "action"){
    const S = Math.max(3, Math.floor(Math.min(Wd/(DW+8), (Hd*0.62)/DH)));
    const cx = bx*(Wd-DW*S) + DW*S*0.5;
    const cy = Hd*0.80 - DH*S*0.5;
    if (m.action === "eat"){ flash.eat = 1000; spawnHearts(cx, cy, S); }
    else if (m.action === "play"){ flash.play = 1000; hopT = 0; targetX = 0.2 + Math.random()*0.6; spawnHearts(cx, cy, S); }
    else if (m.action === "fire"){ flash.fire = 900; spawnFire(cx + DW*S*0.2, cy, S); }
    else if (m.action === "levelup"){ flash.level = 1400; spawnStars(cx, cy, S); }
    else if (m.action === "xp"){ spawnStars(cx, cy - 4, S*0.7); }
    else if (m.action === "sleep"){ }
  }
});

document.getElementById("btnFeed").addEventListener("click", () => vscode.postMessage({type:"feed"}));
document.getElementById("btnPlay").addEventListener("click", () => vscode.postMessage({type:"play"}));
document.getElementById("btnFire").addEventListener("click", () => vscode.postMessage({type:"fire"}));
cv.addEventListener("click", (e) => {
  const S = Math.max(3, Math.floor(Math.min(Wd/(DW+8), (Hd*0.62)/DH)));
  const px0 = bx*(Wd-DW*S), py0 = Hd*0.80 - DH*S;
  if (e.offsetX >= px0 && e.offsetX <= px0+DW*S && e.offsetY >= py0)
    vscode.postMessage({type:"play"});
});

vscode.postMessage({ type:"ready" });
`;
