'use strict';

/* ===================================================================
   FOG WAR — Phase 1.5/2.0 (Radar, Landscape Lock, SMG, Multiplayer Connection)
   =================================================================== */

const CV = document.getElementById('game');
const CTX = CV.getContext('2d');
let W = 0, H = 0, DPR = 1;

/* ===== REDE (MULTIPLAYER) ===== */
const colyseusClient = new Colyseus.Client('ws://localhost:2567');
let colyseusRoom = null; 

/* ===== Screens ===== */
// Movido para o TOPO para evitar o erro de 'Cannot access before initialization'
const SCREENS = { menu:'screenMenu', howTo:'screenHowTo', about:'screenAbout',
  charSelect:'screenChar', lobby:'screenLobby' };

function goto(name){
  Object.values(SCREENS).forEach(id => document.getElementById(id).classList.remove('active'));
  if(SCREENS[name]) document.getElementById(SCREENS[name]).classList.add('active');
  document.getElementById('hud').classList.remove('active');
  document.getElementById('mobileControls').classList.remove('active');
  GAME.state = 'menu';
}

/* ===== ASSETS (IMAGES) ===== */
const SPRITES = {
  soldier: new Image(),
  demoIdle: new Image(),
  demoFire: new Image(),
  medic: new Image(),
  sargento: new Image(),
  maquina: new Image(),
  legs: [] 
};

SPRITES.soldier.src = 'Imagem/Franco atirado_soldado.png';
SPRITES.demoIdle.src = 'Imagem/Demolidor1.png';
SPRITES.demoFire.src = 'Imagem/Demolidor2.png';
SPRITES.medic.src = 'Imagem/Medico.png';
SPRITES.sargento.src = 'Imagem/sargento.png';
SPRITES.maquina.src = 'Imagem/Maquina.png';

for(let i=1; i<=7; i++) {
  let img = new Image();
  img.src = `Imagem/Movimento/${i}.png`;
  SPRITES.legs.push(img);
}

function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  CV.width  = Math.floor(W * DPR);
  CV.height = Math.floor(H * DPR);
  CV.style.width  = W + 'px';
  CV.style.height = H + 'px';
  CTX.setTransform(DPR,0,0,DPR,0,0);
  CTX.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

/* ===== Detect mobile ===== */
const IS_MOBILE = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/* ===== Sound — procedural via Web Audio ===== */
let AC = null;
function audioInit(){
  if(AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
}
function playTone(freq, dur, type='square', volume=0.15){
  if(!AC || !OPT.sfx) return;
  const osc = AC.createOscillator();
  const gain = AC.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, AC.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  osc.connect(gain).connect(AC.destination);
  osc.start();
  osc.stop(AC.currentTime + dur);
}
function playNoise(dur, volume=0.2, filterFreq=1000){
  if(!AC || !OPT.sfx) return;
  const buf = AC.createBuffer(1, AC.sampleRate*dur, AC.sampleRate);
  const data = buf.getChannelData(0);
  for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1);
  const src = AC.createBufferSource();
  src.buffer = buf;
  const filter = AC.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = AC.createGain();
  gain.gain.setValueAtTime(volume, AC.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  src.connect(filter).connect(gain).connect(AC.destination);
  src.start();
  src.stop(AC.currentTime + dur);
}
const SFX = {
  shoot: ()=>{ playTone(700,0.05,'square',0.08); playNoise(0.05,0.08,2000); },
  smg: ()=>{ playTone(800,0.03,'square',0.05); playNoise(0.03,0.05,3000); },
  bigShoot: ()=>{ playTone(180,0.15,'square',0.15); playNoise(0.15,0.18,800); },
  laser: ()=>{ playTone(1200,0.1,'sawtooth',0.07); },
  hit: ()=>{ playTone(220,0.08,'square',0.12); playNoise(0.08,0.15,500); },
  death: ()=>{ playTone(110,0.4,'sawtooth',0.18); playNoise(0.4,0.12,300); },
  wallBreak: ()=>{ playNoise(0.3,0.3,400); playTone(80,0.1,'square',0.1); },
  wallHit: ()=>{ playNoise(0.05,0.1,1500); },
  chest: ()=>{ playTone(523,0.1,'triangle',0.1); setTimeout(()=>playTone(659,0.1,'triangle',0.1),80); setTimeout(()=>playTone(784,0.15,'triangle',0.12),160); },
  pickup: ()=>{ playTone(880,0.08,'triangle',0.1); },
  heal: ()=>{ playTone(523,0.1,'sine',0.12); setTimeout(()=>playTone(784,0.12,'sine',0.12),60); },
  dash: ()=>{ playNoise(0.1,0.1,2500); playTone(440,0.08,'sine',0.06); },
  win: ()=>{ [523,659,784,1046].forEach((f,i)=>setTimeout(()=>playTone(f,0.2,'triangle',0.15),i*100)); },
  lose: ()=>{ [440,392,349,294].forEach((f,i)=>setTimeout(()=>playTone(f,0.25,'sawtooth',0.15),i*120)); }
};

/* ===== Music ===== */
let MUSIC = { osc:null, gain:null, lfo:null, level:0, target:0, beatId:null };
function musicStart(){
  if(!AC || !OPT.music || MUSIC.osc) return;
  MUSIC.gain = AC.createGain();
  MUSIC.gain.gain.value = 0;
  MUSIC.gain.connect(AC.destination);

  MUSIC.osc = AC.createOscillator();
  MUSIC.osc.type = 'sawtooth';
  MUSIC.osc.frequency.value = 55;
  const filter = AC.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 200;
  MUSIC.osc.connect(filter).connect(MUSIC.gain);
  MUSIC.osc.start();

  let beat = 0;
  MUSIC.beatId = setInterval(()=>{
    if(!AC || !MUSIC.gain) return;
    const intensity = MUSIC.level;
    if(intensity > 0.1){
      const k = AC.createOscillator(); k.type='sine'; k.frequency.value = 60 + intensity*40;
      const kg = AC.createGain(); kg.gain.setValueAtTime(0.08*intensity, AC.currentTime);
      kg.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + 0.15);
      k.connect(kg).connect(AC.destination);
      k.start(); k.stop(AC.currentTime+0.15);
      if(beat%2===1 && intensity>0.4){
        playNoise(0.04, 0.04*intensity, 5000);
      }
    }
    beat++;
  }, 350);

  function tick(){
    if(!MUSIC.gain) return;
    MUSIC.level += (MUSIC.target - MUSIC.level) * 0.04;
    MUSIC.gain.gain.setTargetAtTime(MUSIC.level * 0.18, AC.currentTime, 0.2);
    requestAnimationFrame(tick);
  }
  tick();
}
function musicStop(){
  if(MUSIC.osc){ try{ MUSIC.osc.stop(); }catch(e){} }
  if(MUSIC.beatId) clearInterval(MUSIC.beatId);
  MUSIC = { osc:null, gain:null, lfo:null, level:0, target:0, beatId:null };
}
function musicTension(v){ MUSIC.target = Math.max(0, Math.min(1, v)); }

const OPT = { music:true, sfx:true };

/* ===== Characters ===== */
const CHARS = [
  { id:'soldier', name:'SOLDADO', emoji:'🪖', color:'#4ade80',
    role:'Versátil', hp:100, speed:160, dashCd:1.8,
    weapon:{ type:'rifle', dmg:18, range:520, speed:680, cd:0.22, spread:0.04, wallDmg:18, maxAmmo:30, reloadTime:1.5 },
    desc:'Rifle automático balanceado', imgKey: 'soldier' },
  { id:'demo', name:'DEMOLIDOR', emoji:'💣', color:'#f97316',
    role:'Destruidor', hp:130, speed:130, dashCd:2.5,
    weapon:{ type:'rocket', dmg:35, range:420, speed:380, cd:0.85, spread:0, wallDmg:80, splash:60, maxAmmo:10, reloadTime:2.5 },
    desc:'Bazuca, dano em área, quebra parede', imgKey: 'demoIdle' },
  { id:'sargento', name:'SARGENTO', emoji:'🎖️', color:'#a78bfa',
    role:'Assassino', hp:80, speed:200, dashCd:1.1,
    weapon:{ type:'smg', dmg:10, range:380, speed:800, cd:0.1, spread:0.08, wallDmg:5, maxAmmo:40, reloadTime:1.2 },
    desc:'SMG rápida, dash longo, baixa vida', imgKey: 'sargento' },
  { id:'medic', name:'MÉDICO', emoji:'⚕️', color:'#22d3ee',
    role:'Suporte', hp:90, speed:155, dashCd:2.0,
    weapon:{ type:'pistol', dmg:14, range:440, speed:640, cd:0.35, spread:0.06, wallDmg:12, maxAmmo:15, reloadTime:1.0 },
    desc:'Pistola, cura aliado, regenera HP', imgKey: 'medic' },
  { id:'maquina', name:'MÁQUINA', emoji:'⚙️', color:'#fbbf24',
    role:'Tanque', hp:140, speed:120, dashCd:3.0,
    weapon:{ type:'laser', dmg:22, range:600, speed:1100, cd:0.55, spread:0, wallDmg:14, maxAmmo:20, reloadTime:2.0 },
    desc:'Laser longo alcance, vida alta', imgKey: 'maquina' }
];

/* ===== Items ===== */
const ITEMS = {
  bomb:   { active:true, name:'BOMBA',   emoji:'💣', desc:'Explosão em área (dmg 60)', use:(p)=>placeBomb(p) },
  mine:   { active:true, name:'MINA',    emoji:'⚡', desc:'Mina de proximidade (dmg 70)', use:(p)=>placeMine(p) },
  heal:   { active:true, name:'KIT MÉDICO', emoji:'❤️', desc:'+50 HP', use:(p)=>{ p.hp = Math.min(p.maxHp, p.hp+50); SFX.heal(); spawnFloat(p,'+50 HP','#4ade80'); }},
  healBig:{ active:true, name:'CURA TOTAL', emoji:'💖', desc:'Vida cheia', use:(p)=>{ p.hp = p.maxHp; SFX.heal(); spawnFloat(p,'HP MAX','#4ade80'); }},
  shield: { active:true, name:'ESCUDO',  emoji:'🛡️', desc:'Invul. 4s', use:(p)=>{ p.shieldT = 4; SFX.pickup(); spawnFloat(p,'ESCUDO','#3b82f6'); }},
  radar:  { active:true, name:'RADAR',   emoji:'📡', desc:'Visão tática 10s', use:(p)=>{ p.radarT = 10; SFX.pickup(); spawnFloat(p,'RADAR ATIVO','#ef4444'); }},
  pSpeed: { active:false, name:'BOTA RÁPIDA',    emoji:'👟', desc:'+25% velocidade' },
  pHp:    { active:false, name:'COLETE',         emoji:'🧥', desc:'+40 HP máximo' },
  pDmg:   { active:false, name:'MIRA TÁTICA',    emoji:'🎯', desc:'+25% dano' },
  pVis:   { active:false, name:'VISÃO ÁGUIA',    emoji:'👁', desc:'+40% alcance de visão' },
  pCd:    { active:false, name:'GATILHO RÁPIDO', emoji:'⚡', desc:'-25% cooldown de ataque' }
};
const ACTIVE_KEYS  = ['bomb','mine','heal','healBig','shield','radar'];
const PASSIVE_KEYS = ['pSpeed','pHp','pDmg','pVis','pCd'];

/* ===== MAP / TILES ===== */
const TILE = 40;
const T = { FLOOR:0, WALL:1, DWALL:2, CRATE:3 };
let MAP_W = 60, MAP_H = 40;

const GAME = {
  state:'menu', 
  map:[], wallHp:{}, explored:[], floorDetails:[],
  players:[],
  bullets:[], particles:[], floats:[], explosions:[], mines:[], chests:[],
  camera:{x:0,y:0},
  round:1,
  mode:'ffa4',
  difficulty:'normal',
  selectedChar:'soldier',
  myTeam:0,
  pendingPassive:null,
  lastTime:0,
  shakeT:0, shakeMag:0,
  msg:null, msgT:0,
  hitByEnemyT:0
};

/* ===== Procedural map generator ===== */
function generateMap(){
  const M = GAME.map = new Array(MAP_W*MAP_H);
  GAME.floorDetails = new Uint8Array(MAP_W*MAP_H);
  for(let i=0;i<M.length;i++) {
    M[i] = T.DWALL;
    GAME.floorDetails[i] = Math.floor(Math.random()*255); 
  }

  for(let x=0;x<MAP_W;x++){ M[x] = T.WALL; M[(MAP_H-1)*MAP_W + x] = T.WALL; }
  for(let y=0;y<MAP_H;y++){ M[y*MAP_W] = T.WALL; M[y*MAP_W + MAP_W-1] = T.WALL; }

  const rooms = [];
  const targetRooms = Math.floor(MAP_W*MAP_H / 110);
  let tries = 0;
  while(rooms.length < targetRooms && tries < 200){
    tries++;
    const rw = 4 + Math.floor(Math.random()*5);
    const rh = 4 + Math.floor(Math.random()*5);
    const rx = 2 + Math.floor(Math.random()*(MAP_W-rw-4));
    const ry = 2 + Math.floor(Math.random()*(MAP_H-rh-4));
    let ok = true;
    for(const r of rooms){
      if(rx < r.x+r.w+1 && rx+rw+1 > r.x && ry < r.y+r.h+1 && ry+rh+1 > r.y){ ok=false; break; }
    }
    if(!ok) continue;
    for(let y=ry;y<ry+rh;y++) for(let x=rx;x<rx+rw;x++) M[y*MAP_W+x] = T.FLOOR;
    rooms.push({x:rx,y:ry,w:rw,h:rh,cx:rx+rw/2|0, cy:ry+rh/2|0});
  }
  for(let i=1;i<rooms.length;i++){
    const a = rooms[i-1], b = rooms[i];
    let x = a.cx, y = a.cy;
    while(x !== b.cx){ M[y*MAP_W+x] = T.FLOOR; x += (b.cx>x?1:-1); }
    while(y !== b.cy){ M[y*MAP_W+x] = T.FLOOR; y += (b.cy>y?1:-1); }
  }
  for(let i=0;i<rooms.length;i++){
    if(Math.random()<0.5){
      const a = rooms[i], b = rooms[(i+2)%rooms.length];
      let x=a.cx, y=a.cy;
      while(x!==b.cx){ M[y*MAP_W+x]=T.FLOOR; x += (b.cx>x?1:-1); }
      while(y!==b.cy){ M[y*MAP_W+x]=T.FLOOR; y += (b.cy>y?1:-1); }
    }
  }
  for(const r of rooms){
    const n = 1 + Math.floor(Math.random()*3);
    for(let i=0;i<n;i++){
      const cx = r.x + Math.floor(Math.random()*r.w);
      const cy = r.y + Math.floor(Math.random()*r.h);
      if(M[cy*MAP_W+cx] === T.FLOOR && Math.random()<0.7) M[cy*MAP_W+cx] = T.CRATE;
    }
  }
  GAME.wallHp = {};
  for(let i=0;i<M.length;i++){
    if(M[i]===T.DWALL) GAME.wallHp[i] = 30;
    else if(M[i]===T.CRATE) GAME.wallHp[i] = 15;
  }
  return rooms;
}

function tileAt(tx,ty){ if(tx<0||ty<0||tx>=MAP_W||ty>=MAP_H) return T.WALL; return GAME.map[ty*MAP_W+tx]; }
function isBlocking(tx,ty){ const t = tileAt(tx,ty); return t===T.WALL || t===T.DWALL || t===T.CRATE; }
function isOpaque(tx,ty){ return isBlocking(tx,ty); }

function damageWall(tx,ty,dmg){
  const i = ty*MAP_W+tx;
  const t = GAME.map[i];
  if(t!==T.DWALL && t!==T.CRATE) return false;
  GAME.wallHp[i] -= dmg;
  if(GAME.wallHp[i] <= 0){
    GAME.map[i] = T.FLOOR;
    delete GAME.wallHp[i];
    SFX.wallBreak();
    spawnRubble(tx*TILE+TILE/2, ty*TILE+TILE/2);
    spawnDust(tx*TILE+TILE/2, ty*TILE+TILE/2); 
    return true;
  } else {
    if(Math.random()<0.5) SFX.wallHit();
    spawnDust(tx*TILE+TILE/2, ty*TILE+TILE/2, 3);
    return true;
  }
}

/* ===== Player creation ===== */
function makePlayer(charId, isBot, name, team, color){
  const def = CHARS.find(c=>c.id===charId);
  return {
    id: Math.random().toString(36).slice(2,8),
    name, team, color: color || def.color,
    char: charId, def,
    x:0, y:0, vx:0, vy:0, r:14,
    hp: def.hp, maxHp: def.hp,
    speed: def.speed,
    angle: 0, moveAngle: 0,
    attackCd: 0, dashCd: 0, dashT: 0,
    animTime: 0, animFrame: 0, 
    // AMMO SYSTEM
    ammo: def.weapon.maxAmmo,
    maxAmmo: def.weapon.maxAmmo,
    reloadTime: def.weapon.reloadTime,
    isReloading: false,
    reloadTimer: 0,
    inventory: [null,null,null,null,null],
    invCounts: [0,0,0,0,0],
    passives: [null,null],
    isBot, alive:true,
    deathT:0, respawnT:0,
    shieldT:0, radarT:0,
    botMode:'wander', botMemX:0, botMemY:0, botMemT:0, botActT:0, botDashT:0,
    flashT:0,
    roundsWon:0,
    kills:0
  };
}
function placePlayerAt(p, tx, ty){ p.x = tx*TILE + TILE/2; p.y = ty*TILE + TILE/2; }

function findSpawns(n){
  const candidates = [];
  for(let y=2;y<MAP_H-2;y++) for(let x=2;x<MAP_W-2;x++){
    if(tileAt(x,y)===T.FLOOR && tileAt(x+1,y)===T.FLOOR && tileAt(x,y+1)===T.FLOOR) candidates.push([x,y]);
  }
  const spawns = [];
  if(candidates.length===0) return spawns;
  spawns.push(candidates[Math.floor(Math.random()*candidates.length)]);
  while(spawns.length < n){
    let best = null, bestDist = -1;
    for(const c of candidates){
      let minD = 1e9;
      for(const s of spawns){
        const d = (c[0]-s[0])*(c[0]-s[0]) + (c[1]-s[1])*(c[1]-s[1]);
        if(d<minD) minD = d;
      }
      if(minD>bestDist){ bestDist = minD; best = c; }
    }
    if(!best) break;
    spawns.push(best);
  }
  return spawns;
}

function placeChests(count){
  GAME.chests = [];
  const spots = [];
  for(let y=3;y<MAP_H-3;y++) for(let x=3;x<MAP_W-3;x++){
    if(tileAt(x,y)===T.FLOOR) spots.push([x,y]);
  }
  const players = GAME.players;
  for(let i=0;i<count && spots.length;i++){
    let best = null, bestDist = -1;
    for(let k=0;k<200 && spots.length;k++){
      const idx = Math.floor(Math.random()*spots.length);
      const c = spots[idx];
      let minD = 1e9;
      for(const p of players){
        const px = p.x/TILE, py = p.y/TILE;
        const d = (c[0]-px)*(c[0]-px) + (c[1]-py)*(c[1]-py);
        if(d<minD) minD = d;
      }
      for(const ch of GAME.chests){
        const d = (c[0]-ch.tx)*(c[0]-ch.tx) + (c[1]-ch.ty)*(c[1]-ch.ty);
        if(d<minD) minD = d;
      }
      if(minD > bestDist){ bestDist = minD; best = idx; }
    }
    if(best===null) break;
    const c = spots.splice(best,1)[0];
    GAME.chests.push({ tx:c[0], ty:c[1], x:c[0]*TILE+TILE/2, y:c[1]*TILE+TILE/2, opened:false, glow:0 });
  }
}

async function startMatch(){
  audioInit();
  if(AC && AC.state === 'suspended') AC.resume();
  OPT.music = document.getElementById('optMusic').checked;
  OPT.sfx   = document.getElementById('optSfx').checked;

  if (IS_MOBILE) {
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
            if (screen.orientation && screen.orientation.lock) {
                await screen.orientation.lock('landscape');
            }
        }
    } catch (e) { console.log("Erro fullscreen:", e); }
  }

  // TENTA CONECTAR NO SERVIDOR COLYSEUS
  try {
    console.log("Tentando conectar ao servidor...");
    
    // Pegamos o personagem selecionado antes de enviar
    const selectedCharId = GAME.selectedChar || 'soldier';

    // Conecta na sala 'battle'
    colyseusRoom = await colyseusClient.joinOrCreate("battle", {
        char: selectedCharId,
        name: "Mendes" 
    });
    
    console.log("Conectado com sucesso! ID da Sessão:", colyseusRoom.sessionId);
    
    // Se chegou aqui, a conexão funcionou!
    goto('hud');
    GAME.state = 'playing';
    document.getElementById('hud').classList.add('active');
    if(IS_MOBILE) document.getElementById('mobileControls').classList.add('active');
    
    showMsg('CONECTADO!', 1500);
    musicStart();
    musicTension(0.15);

    // Inicializa a lógica local apenas após confirmar a conexão
    setupLocalMatch();

  } catch (e) {
    console.error("Erro ao conectar no servidor:", e);
    // Se o servidor cair, ainda deixamos jogar offline para não travar o dev
    showTip("Servidor Offline - Rodando modo Local");
    setupLocalMatch(); 
  }
}

// Criamos essa função separada para organizar melhor
function setupLocalMatch() {
  const mode = document.getElementById('optMode').value;
  const mapSize = document.getElementById('optMapSize').value;
  const chests = parseInt(document.getElementById('optChests').value);

  if(mapSize==='small'){ MAP_W=40; MAP_H=28; }
  else if(mapSize==='large'){ MAP_W=72; MAP_H=48; }
  else { MAP_W=56; MAP_H=38; }

  GAME.mode = mode;
  GAME.round = 1;
  GAME.players = [];

  const me = makePlayer(GAME.selectedChar, false, 'VOCÊ', 0, '#4ade80');
  GAME.players.push(me);

  // Criar 1 bot apenas para teste inicial
  GAME.players.push(makePlayer('soldier', true, 'BOT_TESTE', 1, '#ef4444'));

  initRound(chests);
  updateHUD();
}

function initRound(chestCount){
  if(chestCount===undefined){
    chestCount = parseInt(document.getElementById('optChests').value);
  }
  GAME.bullets = [];
  GAME.particles = [];
  GAME.floats = [];
  GAME.explosions = [];
  GAME.mines = [];
  GAME.shakeT = 0;
  GAME.hitByEnemyT = 0;
  generateMap();
  
  GAME.explored = new Uint8Array(MAP_W * MAP_H);

  const spawns = findSpawns(GAME.players.length);
  GAME.players.forEach((p,i)=>{
    p.hp = p.def.hp + (p.passives.includes('pHp') ? 40 : 0);
    p.maxHp = p.hp;
    p.alive = true;
    p.deathT = 0;
    p.attackCd = 0;
    p.dashCd = 0;
    p.dashT = 0;
    p.shieldT = 1.5;
    p.radarT = 0;
    p.flashT = 0;
    p.botMode = 'wander';
    p.botActT = 0.5 + Math.random()*1.5;
    p.botMemT = 0;
    p.vx = p.vy = 0;
    p.animTime = 0; p.animFrame = 0;
    
    p.ammo = p.maxAmmo;
    p.isReloading = false;
    p.reloadTimer = 0;

    const sp = spawns[i] || spawns[0];
    placePlayerAt(p, sp[0], sp[1]);
  });
  placeChests(chestCount);
}

function showMsg(text, dur){
  GAME.msg = text;
  GAME.msgT = dur/1000;
}

function showTip(txt, dur=2500){
  const el = document.getElementById('tipToast');
  el.textContent = txt;
  el.style.display = 'block';
  clearTimeout(showTip._t);
  showTip._t = setTimeout(()=>el.style.display='none', dur);
}

function tryReload(p){
  if(!p.alive || p.isReloading || p.ammo === p.maxAmmo) return;
  p.isReloading = true;
  p.reloadTimer = p.reloadTime * (p.passives.includes('pCd') ? 0.8 : 1);
  spawnFloat(p, 'RECARREGANDO...', '#3b82f6');
}

function spawnBullet(p, angle, override){
  const w = p.def.weapon;
  const dmgMul = p.passives.includes('pDmg') ? 1.25 : 1;
  const spread = w.spread || 0;
  const ang = angle + (Math.random()-0.5)*spread*2;
  GAME.bullets.push({
    x: p.x + Math.cos(ang)*p.r,
    y: p.y + Math.sin(ang)*p.r,
    vx: Math.cos(ang)*w.speed,
    vy: Math.sin(ang)*w.speed,
    owner: p.id, team: p.team,
    dmg: w.dmg * dmgMul,
    wallDmg: w.wallDmg,
    range: w.range,
    travelled: 0,
    type: w.type,
    splash: w.splash || 0,
    color: p.color
  });
  
  if(w.type==='smg') SFX.smg();
  else if(w.type==='rifle') SFX.shoot();
  else if(w.type==='rocket') SFX.bigShoot();
  else if(w.type==='pistol') SFX.shoot();
  else if(w.type==='laser') SFX.laser();
}

function spawnPart(x,y,color,n=6,spd=120,life=0.4){
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2;
    const s = spd*(0.4+Math.random()*0.8);
    GAME.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,maxLife:life,color,size:2+Math.random()*2});
  }
}
function spawnRubble(x,y){
  for(let i=0;i<14;i++){
    const a = Math.random()*Math.PI*2;
    const s = 80+Math.random()*180;
    GAME.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.7,maxLife:0.7,color:'#7a5c3e',size:3+Math.random()*4,gravity:0});
  }
}
function spawnDust(x,y, n=10){
  for(let i=0;i<n;i++){
    const a = Math.random()*Math.PI*2;
    const s = 10+Math.random()*30;
    GAME.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.9,maxLife:0.9,color:'rgba(150,135,115,0.4)',size:10+Math.random()*15,isDust:true});
  }
}

function spawnFloat(p, text, color){
  GAME.floats.push({x:p.x,y:p.y-20,text,color,life:1.2,maxLife:1.2});
}

function placeBomb(p){
  GAME.explosions.push({x:p.x,y:p.y,r:0,maxR:80,life:0.5,owner:p.id,team:p.team,dmg:60,armed:0,fuse:1.2});
  spawnFloat(p,'BOMBA','#f97316');
}
function placeMine(p){
  GAME.mines.push({x:p.x,y:p.y,team:p.team,owner:p.id,armed:0.6,dmg:70,life:30,r:10});
  spawnFloat(p,'MINA','#f5c518');
}

function openChest(p, c){
  c.opened = true;
  SFX.chest();
  let reward;
  if(Math.random()<0.6){
    const key = ACTIVE_KEYS[Math.floor(Math.random()*ACTIVE_KEYS.length)];
    reward = { type:'active', key };
  } else {
    const key = PASSIVE_KEYS[Math.floor(Math.random()*PASSIVE_KEYS.length)];
    reward = { type:'passive', key };
  }
  if(reward.type==='active'){
    const empty = p.inventory.indexOf(null);
    if(empty>=0){ p.inventory[empty] = reward.key; p.invCounts[empty] = 1; }
    else {
      const same = p.inventory.indexOf(reward.key);
      if(same>=0) p.invCounts[same]++;
      else spawnFloat(p,'INVENTÁRIO CHEIO','#ef4444');
    }
    if(!p.isBot) showTip('Item recebido: ' + ITEMS[reward.key].name + ' — pressione ' + (p.inventory.indexOf(reward.key)+1) + ' para usar');
    spawnFloat(p, ITEMS[reward.key].name, '#f5c518');
  } else {
    if(p.passives.includes(reward.key)){
      spawnFloat(p,'JÁ TEM','#7a8694');
    } else if(p.passives[0]===null){
      p.passives[0] = reward.key; applyPassives(p);
      spawnFloat(p, ITEMS[reward.key].name,'#a78bfa');
    } else if(p.passives[1]===null){
      p.passives[1] = reward.key; applyPassives(p);
      spawnFloat(p, ITEMS[reward.key].name,'#a78bfa');
    } else {
      if(!p.isBot){
        GAME.pendingPassive = reward.key;
        showPassiveModal(reward.key);
      } else {
        p.passives[Math.floor(Math.random()*2)] = reward.key;
        applyPassives(p);
      }
    }
  }
  updateHUD();
}

function applyPassives(p){
  const hadHp = p.passives.includes('pHp');
  p.maxHp = p.def.hp + (hadHp ? 40 : 0);
  p.hp = Math.min(p.hp, p.maxHp);
}

function showPassiveModal(newKey){
  const me = GAME.players[0];
  const wrap = document.getElementById('passiveChoice');
  document.getElementById('passiveNewLabel').textContent = 'Nova: ' + ITEMS[newKey].emoji + ' ' + ITEMS[newKey].name + ' — ' + ITEMS[newKey].desc;
  wrap.innerHTML = '';
  me.passives.forEach((k,i)=>{
    const div = document.createElement('div');
    div.className = 'passive-option';
    div.innerHTML = '<div style="font-size:32px">'+ITEMS[k].emoji+'</div><div style="margin-top:6px;color:var(--accent2)">'+ITEMS[k].name+'</div><div style="font-size:10px;color:var(--muted);margin-top:4px">'+ITEMS[k].desc+'</div><div style="margin-top:8px;color:var(--danger);font-size:11px">SUBSTITUIR</div>';
    div.onclick = ()=>{
      me.passives[i] = newKey;
      applyPassives(me);
      GAME.pendingPassive = null;
      document.getElementById('passiveModal').classList.remove('active');
      updateHUD();
    };
    wrap.appendChild(div);
  });
  document.getElementById('passiveModal').classList.add('active');
}
function cancelPassive(){
  GAME.pendingPassive = null;
  document.getElementById('passiveModal').classList.remove('active');
}

/* ===== Input ===== */
const KEYS = {};
const INPUT = { mx:0, my:0, mouseDown:false, attackHeld:false, attackQueued:false };

document.addEventListener('keydown', e=>{
  if(GAME.pendingPassive) return;
  const k = e.key.toLowerCase();
  KEYS[k] = true;
  if(GAME.state !== 'playing') return;
  if(k===' '){ INPUT.attackHeld = true; e.preventDefault(); }
  if(k==='shift'){ tryDash(GAME.players[0]); }
  if(k==='r'){ tryReload(GAME.players[0]); }
  if(['1','2','3','4','5'].includes(k)){
    useInventoryItem(GAME.players[0], parseInt(k)-1);
  }
});
document.addEventListener('keyup', e=>{
  const k = e.key.toLowerCase();
  KEYS[k] = false;
  if(k===' ') INPUT.attackHeld = false;
});
window.addEventListener('blur', ()=>{ for(const k in KEYS) KEYS[k]=false; INPUT.attackHeld=false; INPUT.mouseDown=false; });
CV.addEventListener('mousemove', e=>{ const r=CV.getBoundingClientRect(); INPUT.mx = e.clientX - r.left; INPUT.my = e.clientY - r.top; });
CV.addEventListener('mousedown', e=>{ INPUT.mouseDown = true; INPUT.attackHeld = true; audioInit(); if(AC && AC.state==='suspended') AC.resume(); });
CV.addEventListener('mouseup', e=>{ INPUT.mouseDown = false; INPUT.attackHeld = false; });
CV.addEventListener('contextmenu', e=>e.preventDefault());

document.querySelectorAll('.inv-slot').forEach(el=>{
  el.addEventListener('click', ()=>{
    const slot = parseInt(el.dataset.slot);
    useInventoryItem(GAME.players[0], slot);
  });
});

function useInventoryItem(p, slot){
  const key = p.inventory[slot];
  if(!key) return;
  ITEMS[key].use(p);
  p.invCounts[slot]--;
  if(p.invCounts[slot]<=0){ p.inventory[slot] = null; p.invCounts[slot]=0; }
  updateHUD();
}

function tryDash(p){
  if(p.dashCd>0 || !p.alive) return;
  const ang = (Math.abs(p.vx)+Math.abs(p.vy) > 1) ? p.moveAngle : p.angle;
  p.dashT = 0.18;
  p.dashAngle = ang;
  p.dashCd = p.def.dashCd * (p.passives.includes('pCd') ? 0.75 : 1);
  SFX.dash();
  for(let i=0;i<8;i++){
    GAME.particles.push({x:p.x,y:p.y,vx:(Math.random()-0.5)*60,vy:(Math.random()-0.5)*60,life:0.3,maxLife:0.3,color:p.color,size:3});
  }
}

const JOY = { active:false, baseX:0, baseY:0, dx:0, dy:0 };
const joyBase = document.getElementById('joystickBase');
const joyStick = document.getElementById('joystickStick');
function handleJoyStart(e){
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  const r = joyBase.getBoundingClientRect();
  JOY.active = true;
  JOY.baseX = r.left + r.width/2;
  JOY.baseY = r.top + r.height/2;
  JOY.dx = (t.clientX - JOY.baseX)/(r.width/2);
  JOY.dy = (t.clientY - JOY.baseY)/(r.height/2);
  const mag = Math.hypot(JOY.dx, JOY.dy);
  if(mag>1){ JOY.dx/=mag; JOY.dy/=mag; }
  joyStick.style.transform = `translate(calc(-50% + ${JOY.dx*40}px), calc(-50% + ${JOY.dy*40}px))`;
}
function handleJoyMove(e){
  if(!JOY.active) return;
  e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  JOY.dx = (t.clientX - JOY.baseX)/(joyBase.getBoundingClientRect().width/2);
  JOY.dy = (t.clientY - JOY.baseY)/(joyBase.getBoundingClientRect().height/2);
  const mag = Math.hypot(JOY.dx, JOY.dy);
  if(mag>1){ JOY.dx/=mag; JOY.dy/=mag; }
  joyStick.style.transform = `translate(calc(-50% + ${JOY.dx*40}px), calc(-50% + ${JOY.dy*40}px))`;
}
function handleJoyEnd(e){
  JOY.active = false;
  JOY.dx = JOY.dy = 0;
  joyStick.style.transform = 'translate(-50%,-50%)';
}
joyBase.addEventListener('touchstart', handleJoyStart, {passive:false});
joyBase.addEventListener('touchmove', handleJoyMove, {passive:false});
joyBase.addEventListener('touchend', handleJoyEnd);
joyBase.addEventListener('touchcancel', handleJoyEnd);

const btnAttack = document.getElementById('btnAttack');
btnAttack.addEventListener('touchstart', e=>{ e.preventDefault(); INPUT.attackHeld = true; audioInit(); if(AC&&AC.state==='suspended') AC.resume(); }, {passive:false});
btnAttack.addEventListener('touchend', e=>{ INPUT.attackHeld = false; });
const btnDash = document.getElementById('btnDash');
btnDash.addEventListener('touchstart', e=>{ e.preventDefault(); tryDash(GAME.players[0]); }, {passive:false});
const btnReload = document.getElementById('btnReload');
if (btnReload) {
  btnReload.addEventListener('touchstart', e=>{ e.preventDefault(); tryReload(GAME.players[0]); }, {passive:false});
}

function tryMove(p, nx, ny){
  const r = p.r;
  let testX = nx;
  for(const corner of [[-r,-r],[r,-r],[-r,r],[r,r]]){
    const tx = Math.floor((testX + corner[0]) / TILE);
    const ty = Math.floor((p.y + corner[1]) / TILE);
    if(isBlocking(tx,ty)){
      if(testX > p.x) testX = tx*TILE - r - 0.01;
      else            testX = (tx+1)*TILE + r + 0.01;
      break;
    }
  }
  p.x = testX;
  let testY = ny;
  for(const corner of [[-r,-r],[r,-r],[-r,r],[r,r]]){
    const tx = Math.floor((p.x + corner[0]) / TILE);
    const ty = Math.floor((testY + corner[1]) / TILE);
    if(isBlocking(tx,ty)){
      if(testY > p.y) testY = ty*TILE - r - 0.01;
      else            testY = (ty+1)*TILE + r + 0.01;
      break;
    }
  }
  p.y = testY;
}

function lineOfSight(x0,y0,x1,y1){
  let tx0 = x0/TILE, ty0 = y0/TILE;
  let tx1 = x1/TILE, ty1 = y1/TILE;
  let dx = Math.abs(tx1-tx0), dy = Math.abs(ty1-ty0);
  let x = Math.floor(tx0), y = Math.floor(ty0);
  let n = 1;
  let xInc, yInc, err;
  if(dx===0){ xInc = 0; err = Infinity; }
  else if(tx1>tx0){ xInc = 1; n += Math.floor(tx1) - x; err = (Math.floor(tx0)+1 - tx0)*dy; }
  else { xInc = -1; n += x - Math.floor(tx1); err = (tx0 - Math.floor(tx0))*dy; }
  if(dy===0){ yInc = 0; err -= Infinity; }
  else if(ty1>ty0){ yInc = 1; err -= (Math.floor(ty0)+1 - ty0)*dx; }
  else { yInc = -1; err -= (ty0 - Math.floor(ty0))*dx; }

  for(;n>0;n--){
    if(isOpaque(x,y)) return false;
    if(err > 0){ y += yInc; err -= dx; }
    else { x += xInc; err += dy; }
  }
  return true;
}

const RAY_COUNT = 180;
let VIS_POLY = [];
function computeVisibility(p, maxDist){
  VIS_POLY.length = 0;
  for(let i=0;i<RAY_COUNT;i++){
    const a = (i/RAY_COUNT)*Math.PI*2;
    const dx = Math.cos(a), dy = Math.sin(a);
    let x = p.x, y = p.y;
    const step = 6;
    let dist = 0;
    while(dist < maxDist){
      x += dx*step; y += dy*step; dist += step;
      const tx = Math.floor(x/TILE), ty = Math.floor(y/TILE);
      if(isOpaque(tx,ty)){
        break;
      }
    }
    VIS_POLY.push({x,y});
  }
}
function isVisibleTo(p, x, y, maxDist){
  const d = Math.hypot(x-p.x, y-p.y);
  if(d > maxDist) return false;
  return lineOfSight(p.x, p.y, x, y);
}

function damagePlayer(p, dmg, byTeam, attackerId){
  if(!p.alive) return;
  if(p.shieldT > 0) return;
  p.hp -= dmg;
  p.flashT = 0.12;
  spawnFloat(p, '-'+Math.round(dmg), '#ef4444');
  spawnPart(p.x, p.y, '#ef4444', 6, 200, 0.4);
  SFX.hit();
  if(p === GAME.players[0]){
    GAME.shakeT = 0.2; GAME.shakeMag = 6;
    GAME.hitByEnemyT = 1.2;
  }
  if(p.hp <= 0){
    p.alive = false;
    p.hp = 0;
    p.deathT = 0;
    SFX.death();
    spawnPart(p.x, p.y, p.color, 24, 250, 0.8);
    const attacker = GAME.players.find(x=>x.id===attackerId);
    if(attacker) attacker.kills++;
    if(p === GAME.players[0]){ GAME.shakeT = 0.6; GAME.shakeMag = 14; }
    checkRoundEnd();
  }
}

let roundEndT = 0, matchOver = false;
function checkRoundEnd(){
  const alive = GAME.players.filter(p=>p.alive);
  let winnerTeam = null;
  if(GAME.mode==='2v2'){
    const t0 = alive.filter(p=>p.team===0).length;
    const t1 = alive.filter(p=>p.team===1).length;
    if(t0===0 && t1>0) winnerTeam = 1;
    else if(t1===0 && t0>0) winnerTeam = 0;
    else if(t0===0 && t1===0) winnerTeam = -1;
  } else {
    if(alive.length===0){ winnerTeam = -1; }
    else if(alive.length===1){ winnerTeam = alive[0].id; }
  }
  if(winnerTeam !== null && GAME.state==='playing'){
    GAME.state = 'roundEnd';
    roundEndT = 2.6;
    if(GAME.mode==='2v2'){
      if(winnerTeam>=0){
        GAME.players.forEach(p=>{ if(p.team===winnerTeam) p.roundsWon = (p.roundsWon||0)+1; });
      }
    } else if(typeof winnerTeam==='string'){
      const w = GAME.players.find(p=>p.id===winnerTeam);
      if(w) w.roundsWon = (w.roundsWon||0)+1;
    }
    const me = GAME.players[0];
    if(GAME.mode==='2v2'){
      if(winnerTeam === me.team){ showMsg('ROUND VENCIDO!', 2200); SFX.win(); }
      else if(winnerTeam===-1) showMsg('EMPATE', 2200);
      else { showMsg('ROUND PERDIDO', 2200); SFX.lose(); }
    } else {
      if(winnerTeam===me.id){ showMsg('ROUND VENCIDO!', 2200); SFX.win(); }
      else if(winnerTeam===-1) showMsg('EMPATE', 2200);
      else { showMsg('VOCÊ MORREU', 2200); SFX.lose(); }
    }
    musicTension(0.05);
    updateHUD();
  }
}

function checkMatchEnd(){
  if(GAME.mode==='2v2'){
    const t0w = Math.max(...GAME.players.filter(p=>p.team===0).map(p=>p.roundsWon||0), 0);
    const t1w = Math.max(...GAME.players.filter(p=>p.team===1).map(p=>p.roundsWon||0), 0);
    if(t0w>=3) return 0;
    if(t1w>=3) return 1;
  } else {
    for(const p of GAME.players){
      if((p.roundsWon||0) >= 3) return p.id;
    }
  }
  return null;
}

function showMatchEndScreen(winnerKey){
  const me = GAME.players[0];
  const won = (GAME.mode==='2v2') ? (winnerKey===me.team) : (winnerKey===me.id);
  let html = '<div class="logo" style="font-size:64px;color:'+(won?'#4ade80':'#ef4444')+'">'+(won?'VITÓRIA':'DERROTA')+'</div>';
  html += '<div style="color:var(--muted);letter-spacing:3px;margin-bottom:20px">RESULTADO FINAL</div>';
  html += '<div class="panel" style="max-width:520px"><div class="panel-title">📊 PLACAR</div>';
  const sorted = [...GAME.players].sort((a,b)=>(b.roundsWon||0)-(a.roundsWon||0));
  for(const p of sorted){
    html += '<div class="form-row"><span style="color:'+p.color+';font-weight:bold">'+p.name+'</span><span style="color:var(--muted)">'+(p.roundsWon||0)+' rounds · '+(p.kills||0)+' kills</span></div>';
  }
  html += '</div>';
  html += '<div class="row"><button class="btn primary" onclick="rematch()">↻ JOGAR DE NOVO</button><button class="btn" onclick="goto(\'menu\')">MENU</button></div>';
  let overlay = document.getElementById('matchEndOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'matchEndOverlay';
    overlay.className = 'screen';
    document.getElementById('gameContainer').appendChild(overlay);
  }
  overlay.innerHTML = html;
  overlay.classList.add('active');
  document.getElementById('hud').classList.remove('active');
  document.getElementById('mobileControls').classList.remove('active');
  musicTension(0);
  setTimeout(musicStop, 1500);
  matchOver = true;
}

function rematch(){
  document.getElementById('matchEndOverlay').classList.remove('active');
  matchOver = false;
  GAME.players.forEach(p=>{ p.roundsWon = 0; p.kills = 0; p.passives=[null,null]; p.inventory=[null,null,null,null,null]; p.invCounts=[0,0,0,0,0]; applyPassives(p); });
  GAME.round = 1;
  initRound();
  GAME.state = 'playing';
  document.getElementById('hud').classList.add('active');
  if(IS_MOBILE) document.getElementById('mobileControls').classList.add('active');
  showMsg('ROUND 1', 1500);
  musicStart(); musicTension(0.15);
  updateHUD();
}

function updateBot(b, dt){
  if(!b.alive) return;
  
  if (b.isReloading) {
      const sp = b.speed * (b.passives.includes('pSpeed') ? 1.25 : 1) * 0.8;
      const mvx = Math.cos(b.moveAngle)*sp;
      const mvy = Math.sin(b.moveAngle)*sp;
      tryMove(b, b.x + mvx*dt, b.y + mvy*dt);
      return;
  }

  let nearestEnemy = null, nearestDist = 1e9;
  for(const p of GAME.players){
    if(p===b || !p.alive) continue;
    if(GAME.mode==='2v2' && p.team===b.team) continue;
    const d = Math.hypot(p.x-b.x, p.y-b.y);
    if(d < nearestDist){
      if(lineOfSight(b.x,b.y,p.x,p.y) && d < b.def.weapon.range*1.2){
        nearestEnemy = p; nearestDist = d;
      }
    }
  }
  if(nearestEnemy){
    b.botMemX = nearestEnemy.x; b.botMemY = nearestEnemy.y; b.botMemT = 4;
    const ang = Math.atan2(nearestEnemy.y-b.y, nearestEnemy.x-b.x);
    b.angle = ang;
    if(b.attackCd<=0){
      if (b.ammo > 0) {
          const diffMul = GAME.difficulty==='hard' ? 1 : GAME.difficulty==='easy' ? 0.5 : 0.85;
          if(Math.random() < diffMul){
            spawnBullet(b, ang);
            b.attackCd = b.def.weapon.cd * (b.passives.includes('pCd') ? 0.75 : 1);
            b.ammo--;
            if (b.ammo <= 0) tryReload(b);
          }
      } else {
          tryReload(b);
      }
    }
    const desiredDist = b.def.weapon.range * 0.6;
    let mvAng;
    if(nearestDist < desiredDist*0.7) mvAng = ang + Math.PI; 
    else if(nearestDist > desiredDist) mvAng = ang; 
    else mvAng = ang + (Math.random()<0.5 ? Math.PI/2 : -Math.PI/2);
    const sp = b.speed * (b.passives.includes('pSpeed') ? 1.25 : 1);
    const mvx = Math.cos(mvAng)*sp;
    const mvy = Math.sin(mvAng)*sp;
    const nx = b.x + mvx*dt;
    const ny = b.y + mvy*dt;
    tryMove(b, nx, ny);
    b.vx = mvx; b.vy = mvy; b.moveAngle = mvAng;
    if(b.hp < b.maxHp*0.4 && b.dashCd<=0 && Math.random()<0.5*dt*5){
      tryDash(b);
    }
    return;
  }

  if(b.botMemT>0){
    b.botMemT -= dt;
    const dx = b.botMemX - b.x, dy = b.botMemY - b.y;
    const d = Math.hypot(dx,dy);
    if(d > 30){
      const mvAng = Math.atan2(dy,dx);
      const tx = Math.floor(b.x/TILE + Math.cos(mvAng));
      const ty = Math.floor(b.y/TILE + Math.sin(mvAng));
      if(isBlocking(tx,ty) && tileAt(tx,ty)!==T.WALL){
        b.angle = mvAng;
        if(b.attackCd<=0){
            if (b.ammo > 0) {
              spawnBullet(b, mvAng);
              b.attackCd = b.def.weapon.cd;
              b.ammo--;
              if (b.ammo <= 0) tryReload(b);
            } else {
              tryReload(b);
            }
        }
      } else {
        const sp = b.speed * (b.passives.includes('pSpeed') ? 1.25 : 1);
        const mvx = Math.cos(mvAng)*sp, mvy = Math.sin(mvAng)*sp;
        tryMove(b, b.x+mvx*dt, b.y+mvy*dt);
        b.vx=mvx; b.vy=mvy; b.moveAngle=mvAng; b.angle = mvAng;
      }
      return;
    } else {
      b.botMemT = 0;
    }
  }

  if (b.ammo < b.maxAmmo && Math.random() < dt) {
      tryReload(b);
  }

  b.botActT -= dt;
  if(b.botActT<=0 || !b.botTargetX){
    let tgt = null;
    let bestC = null, bestCD = 1e9;
    for(const c of GAME.chests){
      if(c.opened) continue;
      const d = Math.hypot(c.x-b.x, c.y-b.y);
      if(d < bestCD){ bestCD = d; bestC = c; }
    }
    if(bestC && bestCD < 400){
      b.botTargetX = bestC.x; b.botTargetY = bestC.y;
    } else {
      for(let i=0;i<20;i++){
        const tx = 2 + Math.floor(Math.random()*(MAP_W-4));
        const ty = 2 + Math.floor(Math.random()*(MAP_H-4));
        if(tileAt(tx,ty)===T.FLOOR){ b.botTargetX = tx*TILE+TILE/2; b.botTargetY = ty*TILE+TILE/2; break; }
      }
    }
    b.botActT = 1.5 + Math.random()*2;
  }
  if(b.botTargetX){
    const dx = b.botTargetX - b.x, dy = b.botTargetY - b.y;
    const d = Math.hypot(dx,dy);
    if(d < 30){ b.botActT = 0; b.botTargetX = null; }
    else {
      const mvAng = Math.atan2(dy,dx);
      const ahead = 25;
      const tx = Math.floor((b.x + Math.cos(mvAng)*ahead)/TILE);
      const ty = Math.floor((b.y + Math.sin(mvAng)*ahead)/TILE);
      if(isBlocking(tx,ty)){
        if(tileAt(tx,ty)===T.WALL){
          const altAng = mvAng + (Math.random()<0.5 ? Math.PI/2 : -Math.PI/2);
          const sp = b.speed * (b.passives.includes('pSpeed') ? 1.25 : 1);
          tryMove(b, b.x+Math.cos(altAng)*sp*dt, b.y+Math.sin(altAng)*sp*dt);
          b.angle = altAng;
        } else {
          b.angle = mvAng;
          if(b.attackCd<=0){
              if (b.ammo > 0) {
                spawnBullet(b, mvAng);
                b.attackCd = b.def.weapon.cd;
                b.ammo--;
                if (b.ammo <= 0) tryReload(b);
              } else {
                tryReload(b);
              }
          }
        }
      } else {
        const sp = b.speed * (b.passives.includes('pSpeed') ? 1.25 : 1);
        const mvx = Math.cos(mvAng)*sp, mvy = Math.sin(mvAng)*sp;
        tryMove(b, b.x+mvx*dt, b.y+mvy*dt);
        b.vx=mvx; b.vy=mvy; b.moveAngle=mvAng; b.angle=mvAng;
      }
    }
  }
}

function update(dt){
  if(GAME.state!=='playing' && GAME.state!=='roundEnd') return;

  if(GAME.state==='roundEnd'){
    roundEndT -= dt;
    if(roundEndT<=0 && !matchOver){
      const winnerKey = checkMatchEnd();
      if(winnerKey !== null){
        showMatchEndScreen(winnerKey);
        return;
      } else {
        GAME.round++;
        initRound();
        GAME.state = 'playing';
        showMsg('ROUND '+GAME.round, 1500);
        musicTension(0.15);
        updateHUD();
      }
    }
    return;
  }

  const me = GAME.players[0];

  if(me.alive && !GAME.pendingPassive){
    let mx=0, my=0;
    if(IS_MOBILE){
      mx = JOY.dx; my = JOY.dy;
    } else {
      if(KEYS['w']||KEYS['arrowup']) my -= 1;
      if(KEYS['s']||KEYS['arrowdown']) my += 1;
      if(KEYS['a']||KEYS['arrowleft']) mx -= 1;
      if(KEYS['d']||KEYS['arrowright']) mx += 1;
      const mag = Math.hypot(mx,my);
      if(mag>0){ mx/=mag; my/=mag; }
    }
    if(IS_MOBILE){
      if(Math.abs(mx)+Math.abs(my) > 0.1){ me.angle = Math.atan2(my,mx); me.moveAngle = me.angle; }
    } else {
      const sx = CV.width/DPR/2 + me.x - GAME.camera.x;
      const sy = CV.height/DPR/2 + me.y - GAME.camera.y;
      const aimX = INPUT.mx - W/2;
      const aimY = INPUT.my - H/2;
      me.angle = Math.atan2(aimY, aimX);
      if(Math.abs(mx)+Math.abs(my) > 0.1) me.moveAngle = Math.atan2(my,mx);
    }
    if(me.dashT > 0){
      const dashSpd = 540;
      tryMove(me, me.x + Math.cos(me.dashAngle)*dashSpd*dt, me.y + Math.sin(me.dashAngle)*dashSpd*dt);
      me.vx = Math.cos(me.dashAngle)*dashSpd; me.vy = Math.sin(me.dashAngle)*dashSpd;
      me.dashT -= dt;
    } else {
      const sp = me.speed * (me.passives.includes('pSpeed') ? 1.25 : 1);
      const nx = me.x + mx*sp*dt;
      const ny = me.y + my*sp*dt;
      tryMove(me, nx, ny);
      me.vx = mx*sp; me.vy = my*sp;
    }
    if(INPUT.attackHeld && me.attackCd<=0 && !me.isReloading){
      if(me.ammo > 0) {
          spawnBullet(me, me.angle);
          me.attackCd = me.def.weapon.cd * (me.passives.includes('pCd') ? 0.75 : 1);
          me.ammo--;
          if(me.ammo === 0) tryReload(me);
      } else {
          tryReload(me);
      }
    }
  }

  for(const p of GAME.players){
    if(p.attackCd>0) p.attackCd -= dt;
    if(p.dashCd>0) p.dashCd -= dt;
    if(p.shieldT>0) p.shieldT -= dt;
    if(p.radarT>0) p.radarT -= dt;
    if(p.flashT>0) p.flashT -= dt;
    
    if (p.isReloading) {
        p.reloadTimer -= dt;
        if (p.reloadTimer <= 0) {
            p.ammo = p.maxAmmo;
            p.isReloading = false;
            if (p === me) spawnFloat(p, 'PRONTO!', '#4ade80');
        }
    }

    if(p.isBot) updateBot(p, dt);
    
    if(p.alive) {
      const speedSq = p.vx*p.vx + p.vy*p.vy;
      if(speedSq > 5) { 
          p.animTime += dt * 12; 
          p.animFrame = Math.floor(p.animTime) % 7; 
      } else {
          p.animFrame = 0; 
          p.animTime = 0;
      }
    }
  }

  for(let i=GAME.bullets.length-1;i>=0;i--){
    const b = GAME.bullets[i];
    const stepDist = Math.hypot(b.vx,b.vy)*dt;
    b.x += b.vx*dt; b.y += b.vy*dt;
    b.travelled += stepDist;
    let kill = false;

    const tx = Math.floor(b.x/TILE), ty = Math.floor(b.y/TILE);
    if(isBlocking(tx,ty)){
      if(tileAt(tx,ty)===T.WALL){
        kill = true;
        spawnPart(b.x,b.y,'#888',3,80,0.2);
      } else {
        if(damageWall(tx,ty,b.wallDmg)){
          spawnPart(b.x,b.y,'#aa7755',3,80,0.2);
        }
        if(b.type==='rocket'){
          spawnExplosion(b.x,b.y,b.splash,b.dmg,b.team,b.owner);
        }
        kill = true;
      }
    }

    if(!kill){
      for(const p of GAME.players){
        if(!p.alive || p.id===b.owner) continue;
        if(GAME.mode==='2v2' && p.team===b.team) continue;
        const d = Math.hypot(p.x-b.x, p.y-b.y);
        if(d < p.r + 4){
          if(b.type==='rocket'){
            spawnExplosion(b.x,b.y,b.splash,b.dmg,b.team,b.owner);
          } else {
            damagePlayer(p, b.dmg, b.team, b.owner);
          }
          kill = true;
          break;
        }
      }
    }

    if(b.travelled > b.range) kill = true;
    if(kill) GAME.bullets.splice(i,1);
  }

  for(let i=GAME.mines.length-1;i>=0;i--){
    const m = GAME.mines[i];
    m.armed -= dt; m.life -= dt;
    if(m.life<=0){ GAME.mines.splice(i,1); continue; }
    if(m.armed<=0){
      for(const p of GAME.players){
        if(!p.alive) continue;
        if(p.team===m.team) continue;
        if(Math.hypot(p.x-m.x, p.y-m.y) < 24){
          spawnExplosion(m.x,m.y,70,m.dmg,m.team,m.owner);
          GAME.mines.splice(i,1);
          break;
        }
      }
    }
  }

  for(let i=GAME.explosions.length-1;i>=0;i--){
    const e = GAME.explosions[i];
    if(e.fuse !== undefined){
      e.fuse -= dt;
      if(e.fuse > 0) continue;
      e.fuse = undefined;
      spawnExplosion(e.x, e.y, e.maxR, e.dmg, e.team, e.owner);
      GAME.explosions.splice(i,1);
      continue;
    }
    e.r += (e.maxR - e.r)*Math.min(1, dt*15);
    e.life -= dt;
    if(e.life<=0) GAME.explosions.splice(i,1);
  }

  if(me.alive){
    for(const c of GAME.chests){
      if(c.opened) continue;
      if(Math.hypot(c.x-me.x, c.y-me.y) < 28){ openChest(me, c); }
    }
  }
  for(const p of GAME.players){
    if(!p.isBot || !p.alive) continue;
    for(const c of GAME.chests){
      if(c.opened) continue;
      if(Math.hypot(c.x-p.x, c.y-p.y) < 24){ openChest(p, c); }
    }
  }
  for(const c of GAME.chests){ c.glow = (c.glow + dt) % (Math.PI*2); }

  for(let i=GAME.particles.length-1;i>=0;i--){
    const pt = GAME.particles[i];
    pt.x += pt.vx*dt; pt.y += pt.vy*dt;
    if(pt.isDust){
      pt.vx *= 0.85; pt.vy *= 0.85;
      pt.size += dt*5; 
    } else {
      pt.vx *= 0.92; pt.vy *= 0.92;
    }
    pt.life -= dt;
    if(pt.life<=0) GAME.particles.splice(i,1);
  }
  for(let i=GAME.floats.length-1;i>=0;i--){
    const f = GAME.floats[i];
    f.y -= 30*dt; f.life -= dt;
    if(f.life<=0) GAME.floats.splice(i,1);
  }

  const camTargetX = me.x;
  const camTargetY = me.y;
  GAME.camera.x += (camTargetX - GAME.camera.x) * Math.min(1, dt*6);
  GAME.camera.y += (camTargetY - GAME.camera.y) * Math.min(1, dt*6);
  if(GAME.shakeT > 0){ GAME.shakeT -= dt; }
  else { GAME.shakeMag = 0; }
  if(GAME.hitByEnemyT > 0) GAME.hitByEnemyT -= dt;

  let tension = 0.1;
  if(me.alive){
    if(me.hp < me.maxHp*0.4) tension += 0.3;
    if(GAME.hitByEnemyT>0) tension += 0.4;
    const visRange = 380 * (me.passives.includes('pVis') ? 1.4 : 1);
    for(const p of GAME.players){
      if(!p.alive || p===me) continue;
      if(GAME.mode==='2v2' && p.team===me.team) continue;
      if(isVisibleTo(me, p.x, p.y, visRange)){ tension += 0.5; break; }
    }
    if(GAME.bullets.length>5) tension += 0.2;
  }
  musicTension(Math.min(1, tension));

  if(((GAME.lastTime*10)|0) % 3 === 0) updateHUDLight();
}

function spawnExplosion(x,y,r,dmg,team,ownerId){
  GAME.explosions.push({x,y,r:0,maxR:r,life:0.5});
  spawnPart(x,y,'#ffaa44',24,300,0.5);
  spawnPart(x,y,'#ff6b35',16,200,0.7);
  spawnDust(x,y,20); 
  SFX.bigShoot();
  GAME.shakeT = Math.max(GAME.shakeT, 0.25); GAME.shakeMag = Math.max(GAME.shakeMag, 8);
  const tx0 = Math.floor((x-r)/TILE), tx1 = Math.floor((x+r)/TILE);
  const ty0 = Math.floor((y-r)/TILE), ty1 = Math.floor((y+r)/TILE);
  for(let ty=ty0;ty<=ty1;ty++) for(let tx=tx0;tx<=tx1;tx++){
    const cx = tx*TILE+TILE/2, cy = ty*TILE+TILE/2;
    if(Math.hypot(cx-x,cy-y) < r && tileAt(tx,ty)!==T.WALL) damageWall(tx,ty,80);
  }
  for(const p of GAME.players){
    if(!p.alive) continue;
    if(GAME.mode==='2v2' && p.team===team && p.id!==ownerId) continue;
    const d = Math.hypot(p.x-x, p.y-y);
    if(d < r){
      const dmgFalloff = dmg * (1 - d/r*0.5);
      damagePlayer(p, dmgFalloff, team, ownerId);
    }
  }
}

/* ===== RENDERING ===== */
function render(){
  const camX = GAME.camera.x;
  const camY = GAME.camera.y;
  let shakeX = 0, shakeY = 0;
  if(GAME.shakeT > 0){
    shakeX = (Math.random()-0.5)*GAME.shakeMag*2;
    shakeY = (Math.random()-0.5)*GAME.shakeMag*2;
  }

  CTX.fillStyle = '#05070a';
  CTX.fillRect(0,0,W,H);

  if(GAME.state==='menu'){
    drawMenuBg();
    return;
  }

  CTX.save();
  CTX.translate(W/2 - camX + shakeX, H/2 - camY + shakeY);
  
  CTX.imageSmoothingEnabled = false;

  const me = GAME.players[0];
  const visRange = 380 * (me.passives.includes('pVis') ? 1.4 : 1);

  const tx0 = Math.max(0, Math.floor((camX - W/2 - 60)/TILE));
  const tx1 = Math.min(MAP_W-1, Math.floor((camX + W/2 + 60)/TILE));
  const ty0 = Math.max(0, Math.floor((camY - H/2 - 60)/TILE));
  const ty1 = Math.min(MAP_H-1, Math.floor((camY + H/2 + 60)/TILE));

  if(me.alive){
    computeVisibility(me, visRange);
    
    for(let y=ty0; y<=ty1; y++){
      for(let x=tx0; x<=tx1; x++){
        if(!GAME.explored[y*MAP_W+x]){
          if(isVisibleTo(me, x*TILE+TILE/2, y*TILE+TILE/2, visRange)){
            GAME.explored[y*MAP_W+x] = 1;
          }
        }
      }
    }
  }

  for(let y=ty0;y<=ty1;y++){
    for(let x=tx0;x<=tx1;x++){
      if(!GAME.explored[y*MAP_W+x] && me.alive) continue; 

      const t = tileAt(x,y);
      const sx = x*TILE, sy = y*TILE;

      if(t===T.FLOOR){
        const detail = GAME.floorDetails[y*MAP_W+x];
        CTX.fillStyle = detail%2 === 0 ? '#1e262e' : '#192027'; 
        CTX.fillRect(sx, sy, TILE, TILE);
        
        if(detail > 200){
          CTX.fillStyle = 'rgba(0,0,0,0.3)';
          CTX.fillRect(sx+10, sy+10, 4, 4);
          CTX.fillRect(sx+28, sy+24, 3, 3);
        }
        
        CTX.strokeStyle = 'rgba(255,255,255,0.03)';
        CTX.lineWidth = 1;
        CTX.strokeRect(sx, sy, TILE, TILE);
        
      } else if(t===T.WALL){
        CTX.fillStyle = '#334155';
        CTX.fillRect(sx,sy,TILE,TILE);
        CTX.fillStyle = '#475569';
        CTX.fillRect(sx+2,sy+2,TILE-4,TILE-4);
        CTX.fillStyle = '#1e293b';
        CTX.fillRect(sx,sy+TILE-3,TILE,3);
        CTX.fillRect(sx+TILE-3,sy,3,TILE);
      } else if(t===T.DWALL){
        const hp = GAME.wallHp[y*MAP_W+x] || 30;
        const dmgFrac = 1 - hp/30;
        
        CTX.fillStyle = '#927b5e';
        CTX.fillRect(sx,sy,TILE,TILE);
        CTX.fillStyle = '#a68f72';
        CTX.fillRect(sx+1,sy+1,TILE-2,TILE-2);
        
        CTX.fillStyle = '#786044';
        CTX.fillRect(sx, sy+TILE/2-1, TILE, 2);
        CTX.fillRect(sx+TILE/2-1, sy, 2, TILE/2);
        CTX.fillRect(sx+TILE/4-1, sy+TILE/2, 2, TILE/2);
        CTX.fillRect(sx+3*TILE/4-1, sy+TILE/2, 2, TILE/2);
        
        CTX.strokeStyle = '#3e2d1c';
        CTX.lineWidth = 1;
        CTX.beginPath();
        if(dmgFrac > 0){
           CTX.lineWidth = 2;
           CTX.moveTo(sx+5,sy+5); CTX.lineTo(sx+TILE-5, sy+TILE-5);
           CTX.moveTo(sx+TILE-5,sy+5); CTX.lineTo(sx+5, sy+TILE-7);
        } else {
           CTX.moveTo(sx+8,sy+2); CTX.lineTo(sx+4, sy+12);
        }
        CTX.stroke();
        
        if(dmgFrac>0.5){
          CTX.fillStyle = '#261b11';
          CTX.fillRect(sx+TILE/2-3, sy+TILE/3, 6, 8);
        }
      } else if(t===T.CRATE){
        CTX.fillStyle = '#685038';
        CTX.fillRect(sx+3,sy+3,TILE-6,TILE-6);
        CTX.fillStyle = '#8a6e4d';
        CTX.fillRect(sx+4,sy+4,TILE-8,TILE-8);
        CTX.strokeStyle = '#42311e';
        CTX.lineWidth = 2;
        CTX.strokeRect(sx+3,sy+3,TILE-6,TILE-6);
        CTX.beginPath();
        CTX.moveTo(sx+4, sy+4); CTX.lineTo(sx+TILE-4, sy+TILE-4);
        CTX.moveTo(sx+TILE-4, sy+4); CTX.lineTo(sx+4, sy+TILE-4);
        CTX.stroke();
      }
    }
  }

  CTX.save();
  if(me.alive && VIS_POLY.length){
    CTX.beginPath();
    CTX.moveTo(VIS_POLY[0].x, VIS_POLY[0].y);
    for(let i=1;i<VIS_POLY.length;i++) CTX.lineTo(VIS_POLY[i].x, VIS_POLY[i].y);
    CTX.closePath();
    CTX.clip();
  }

  for(const c of GAME.chests){
    if(c.opened) continue;
    if(!isVisibleTo(me, c.x, c.y, visRange)) continue;
    const pulse = 0.5 + Math.sin(c.glow*4)*0.5; 
    const g = CTX.createRadialGradient(c.x, c.y, 4, c.x, c.y, 45);
    g.addColorStop(0, 'rgba(245,197,24,'+(0.6+pulse*0.4)+')');
    g.addColorStop(1, 'rgba(245,197,24,0)');
    CTX.fillStyle = g;
    CTX.fillRect(c.x-45, c.y-45, 90, 90);
    CTX.fillStyle = '#7a5122';
    CTX.fillRect(c.x-14, c.y-10, 28, 20);
    CTX.fillStyle = '#c8954a';
    CTX.fillRect(c.x-12, c.y-8, 24, 8);
    CTX.fillStyle = '#4a2f0e';
    CTX.fillRect(c.x-14, c.y-2, 28, 3);
    CTX.fillStyle = '#ffde3b';
    CTX.fillRect(c.x-3, c.y-2, 6, 7);
  }

  for(const m of GAME.mines){
    const ownerP = GAME.players.find(p=>p.id===m.owner);
    const sameTeam = ownerP && ownerP.team===me.team;
    if(sameTeam || (me.radarT>0 && isVisibleTo(me, m.x, m.y, visRange))){
      const blink = (Math.floor(Date.now()/300) % 2);
      CTX.fillStyle = blink ? '#ef4444' : '#7a1a1a';
      CTX.beginPath(); CTX.arc(m.x, m.y, 6, 0, Math.PI*2); CTX.fill();
      CTX.strokeStyle = '#000'; CTX.lineWidth=1; CTX.stroke();
    }
  }

  for(const b of GAME.bullets){
    if(!isVisibleTo(me, b.x, b.y, visRange+100)) continue;
    if(b.type==='rocket'){
      CTX.fillStyle = '#888';
      CTX.beginPath(); CTX.arc(b.x, b.y, 4, 0, Math.PI*2); CTX.fill();
      CTX.fillStyle = '#ff6b35';
      CTX.beginPath(); CTX.arc(b.x - Math.cos(Math.atan2(b.vy,b.vx))*5, b.y - Math.sin(Math.atan2(b.vy,b.vx))*5, 3, 0, Math.PI*2); CTX.fill();
    } else if(b.type==='laser'){
      CTX.strokeStyle = b.color || '#fbbf24';
      CTX.lineWidth = 3;
      CTX.beginPath();
      const ang = Math.atan2(b.vy,b.vx);
      CTX.moveTo(b.x - Math.cos(ang)*10, b.y - Math.sin(ang)*10);
      CTX.lineTo(b.x, b.y);
      CTX.stroke();
      CTX.lineWidth = 1;
    } else if(b.type==='smg'){ 
      CTX.save();
      CTX.translate(b.x, b.y);
      CTX.rotate(Math.atan2(b.vy, b.vx));
      CTX.fillStyle = '#fde047'; 
      CTX.fillRect(-6, -1, 12, 2);
      CTX.restore();
    } else {
      CTX.fillStyle = b.color || '#ffaa44';
      CTX.beginPath(); CTX.arc(b.x, b.y, 2.5, 0, Math.PI*2); CTX.fill();
      CTX.fillStyle = 'rgba(255,255,255,0.6)';
      const ang = Math.atan2(b.vy,b.vx);
      CTX.beginPath(); CTX.arc(b.x - Math.cos(ang)*4, b.y - Math.sin(ang)*4, 1.5, 0, Math.PI*2); CTX.fill();
    }
  }

  for(const e of GAME.explosions){
    if(e.fuse !== undefined){
      if(!isVisibleTo(me, e.x, e.y, visRange)) continue;
      const f = 1 - e.fuse/1.2;
      CTX.fillStyle = (Math.floor(Date.now()/100)%2) ? '#ef4444' : '#222';
      CTX.beginPath(); CTX.arc(e.x, e.y, 8, 0, Math.PI*2); CTX.fill();
      CTX.strokeStyle = '#000'; CTX.stroke();
    } else {
      const fade = e.life/0.5;
      CTX.fillStyle = 'rgba(255,170,68,'+(fade*0.8)+')';
      CTX.beginPath(); CTX.arc(e.x, e.y, e.r, 0, Math.PI*2); CTX.fill();
      CTX.strokeStyle = 'rgba(255,255,255,'+fade+')';
      CTX.lineWidth = 3;
      CTX.beginPath(); CTX.arc(e.x, e.y, e.r, 0, Math.PI*2); CTX.stroke();
      CTX.lineWidth = 1;
    }
  }

  for(const pt of GAME.particles){
    const a = pt.life/pt.maxLife;
    CTX.fillStyle = pt.color;
    CTX.globalAlpha = a;
    if(pt.isDust){
      CTX.beginPath(); CTX.arc(pt.x, pt.y, pt.size, 0, Math.PI*2); CTX.fill();
    } else {
      CTX.fillRect(pt.x - pt.size/2, pt.y - pt.size/2, pt.size, pt.size);
    }
  }
  CTX.globalAlpha = 1;

  for(const p of GAME.players){
    if(!p.alive) continue;
    if(p !== me){
      const visible = isVisibleTo(me, p.x, p.y, visRange) || (me.radarT>0 && Math.hypot(p.x-me.x, p.y-me.y) < 1200);
      if(!visible) continue;
    }
    
    if(p.shieldT>0){
      CTX.strokeStyle = '#3b82f6';
      CTX.lineWidth = 2;
      CTX.beginPath(); CTX.arc(p.x, p.y, p.r+4, 0, Math.PI*2); CTX.stroke();
    }
    
    CTX.fillStyle = 'rgba(0,0,0,0.3)';
    CTX.beginPath(); 
    CTX.ellipse(p.x, p.y + 12, p.r*0.6, p.r*0.25, 0, 0, Math.PI*2); 
    CTX.fill();
    
    CTX.save();
    CTX.translate(p.x, p.y);
    
    if (p.flashT > 0) {
      CTX.globalCompositeOperation = 'lighter';
      CTX.globalAlpha = 0.5;
    }

    const spriteSize = 52; 

    if (p.char !== 'maquina') {
        CTX.save();
        let legAngle = p.angle; 
        const speedSq = p.vx*p.vx + p.vy*p.vy;
        if(speedSq > 5) legAngle = p.moveAngle; 
        
        CTX.rotate(legAngle - Math.PI/2);
        
        const legSprite = SPRITES.legs[p.animFrame];
        if (legSprite && legSprite.complete) {
            CTX.drawImage(legSprite, -spriteSize/2, -spriteSize/2, spriteSize, spriteSize);
        }
        CTX.restore();
    }

    CTX.save();
    CTX.rotate(p.angle - Math.PI/2); 

    let sprite;
    if (p.char === 'soldier') sprite = SPRITES.soldier;
    else if (p.char === 'medic') sprite = SPRITES.medic;
    else if (p.char === 'sargento') sprite = SPRITES.sargento;
    else if (p.char === 'maquina') sprite = SPRITES.maquina;
    else if (p.char === 'demo') {
      const isFiring = p.attackCd > (p.def.weapon.cd * (p.passives.includes('pCd') ? 0.75 : 1)) - 0.15;
      sprite = isFiring ? SPRITES.demoFire : SPRITES.demoIdle;
    }

    if (sprite && sprite.complete) {
      CTX.drawImage(sprite, -spriteSize/2, -spriteSize/2, spriteSize, spriteSize);
    } else {
      CTX.fillStyle = p.color;
      CTX.beginPath(); CTX.arc(0, 0, p.r, 0, Math.PI*2); CTX.fill();
    }
    CTX.restore();
    CTX.restore();
    
    const hpw = 32, hph = 4;
    CTX.fillStyle = '#1a0a0a';
    CTX.fillRect(p.x-hpw/2, p.y-p.r-10, hpw, hph);
    CTX.fillStyle = '#22c55e';
    CTX.fillRect(p.x-hpw/2, p.y-p.r-10, hpw*(p.hp/p.maxHp), hph);
    CTX.strokeStyle = '#000';
    CTX.strokeRect(p.x-hpw/2, p.y-p.r-10, hpw, hph);
    
    if(p !== me){
      CTX.fillStyle = '#fff';
      CTX.font = 'bold 10px Courier New';
      CTX.textAlign = 'center';
      CTX.fillText(p.name, p.x, p.y-p.r-14);
    }
    if(GAME.mode==='2v2' && p.team===me.team && p!==me){
      CTX.fillStyle = '#4ade80';
      CTX.font = '10px Courier New';
      CTX.fillText('ALIADO', p.x, p.y+p.r+12);
    }
  }

  for(const f of GAME.floats){
    CTX.fillStyle = f.color;
    CTX.font = 'bold 14px Courier New';
    CTX.textAlign = 'center';
    CTX.globalAlpha = Math.min(1, f.life/f.maxLife*2);
    CTX.fillText(f.text, f.x, f.y);
    CTX.globalAlpha = 1;
  }

  CTX.restore(); // FECHA CLIP ENTIDADES

  // === 3. NÉVOA DE SOMBRA (FOG OVERLAY) ===
  if(me.alive && VIS_POLY.length){
    CTX.save();
    CTX.fillStyle = 'rgba(10, 15, 25, 0.88)'; 
    
    CTX.beginPath();
    const ox = camX - W/2 - 50, oy = camY - H/2 - 50;
    const ow = W + 100, oh = H + 100;
    CTX.rect(ox, oy, ow, oh);
    CTX.moveTo(VIS_POLY[0].x, VIS_POLY[0].y);
    for(let i=VIS_POLY.length-1;i>=0;i--) CTX.lineTo(VIS_POLY[i].x, VIS_POLY[i].y);
    CTX.closePath();
    CTX.fill('evenodd');
    CTX.restore();

    const grad = CTX.createRadialGradient(me.x, me.y, visRange*0.5, me.x, me.y, visRange);
    grad.addColorStop(0, 'rgba(10,15,25,0)');
    grad.addColorStop(1, 'rgba(10,15,25,0.65)');
    CTX.fillStyle = grad;
    CTX.beginPath();
    if(VIS_POLY.length){
      CTX.moveTo(VIS_POLY[0].x, VIS_POLY[0].y);
      for(let i=1;i<VIS_POLY.length;i++) CTX.lineTo(VIS_POLY[i].x, VIS_POLY[i].y);
    }
    CTX.closePath();
    CTX.fill();
  }

  // === 4. SISTEMA DE RADAR (FURA A NÉVOA!) ===
  if (me.alive && me.radarT > 0) {
      for (const p of GAME.players) {
          if (!p.alive || p === me) continue;
          if (GAME.mode === '2v2' && p.team === me.team) continue; // não foca aliados
          
          // Efeito pulsante de infravermelho/radar
          const pulse = 0.5 + Math.sin(Date.now() / 100) * 0.5;
          CTX.fillStyle = `rgba(239, 68, 68, ${pulse * 0.6})`;
          CTX.beginPath();
          CTX.arc(p.x, p.y, 20, 0, Math.PI * 2);
          CTX.fill();
          
          // Mira quadrada do Radar
          CTX.strokeStyle = '#ef4444';
          CTX.lineWidth = 2;
          CTX.strokeRect(p.x - 12, p.y - 12, 24, 24);
          
          // Texto alvo
          CTX.fillStyle = '#ef4444';
          CTX.font = 'bold 10px Courier New';
          CTX.textAlign = 'center';
          CTX.fillText('ALVO', p.x, p.y - 20);
      }
  }

  CTX.restore(); // FECHA TRANSFORMAÇÃO DA CÂMERA

  // === SCREEN OVERLAYS (Mira, Dano, Textos) ===
  if(!IS_MOBILE && me.alive && GAME.state==='playing'){
    CTX.strokeStyle = 'rgba(255,107,53,0.8)';
    CTX.lineWidth = 2;
    CTX.beginPath();
    CTX.arc(INPUT.mx, INPUT.my, 10, 0, Math.PI*2);
    CTX.moveTo(INPUT.mx - 14, INPUT.my); CTX.lineTo(INPUT.mx - 6, INPUT.my);
    CTX.moveTo(INPUT.mx + 6, INPUT.my); CTX.lineTo(INPUT.mx + 14, INPUT.my);
    CTX.moveTo(INPUT.mx, INPUT.my - 14); CTX.lineTo(INPUT.mx, INPUT.my - 6);
    CTX.moveTo(INPUT.mx, INPUT.my + 6); CTX.lineTo(INPUT.mx, INPUT.my + 14);
    CTX.stroke();
    CTX.lineWidth = 1;
  }
  if(GAME.hitByEnemyT > 0){
    CTX.fillStyle = 'rgba(239,68,68,'+(GAME.hitByEnemyT*0.35)+')';
    CTX.fillRect(0,0,W,H);
  }
  if(!me.alive && GAME.state!=='roundEnd'){
    CTX.fillStyle = 'rgba(0,0,0,0.6)';
    CTX.fillRect(0,0,W,H);
    CTX.fillStyle = '#ef4444';
    CTX.font = 'bold 36px Impact';
    CTX.textAlign = 'center';
    CTX.fillText('VOCÊ MORREU', W/2, H/2 - 10);
    CTX.fillStyle = '#7a8694';
    CTX.font = '14px Courier New';
    CTX.fillText('aguarde o fim do round...', W/2, H/2 + 20);
  }
  if(GAME.msgT > 0){
    GAME.msgT -= 1/60;
    const a = GAME.msgT > 0.3 ? 1 : GAME.msgT/0.3;
    CTX.fillStyle = 'rgba(0,0,0,0.7)';
    CTX.fillRect(0, H/2 - 40, W, 80);
    CTX.fillStyle = 'rgba(255,107,53,'+a+')';
    CTX.font = 'bold 42px Impact';
    CTX.textAlign = 'center';
    CTX.fillText(GAME.msg, W/2, H/2 + 14);
  }
}

function drawMenuBg(){
  const t = Date.now()/1000;
  CTX.fillStyle = '#05070a';
  CTX.fillRect(0,0,W,H);
  CTX.strokeStyle = 'rgba(255,107,53,0.05)';
  CTX.lineWidth = 1;
  const gs = 40;
  const ox = (t*15) % gs;
  for(let x=-gs+ox;x<W;x+=gs){ CTX.beginPath(); CTX.moveTo(x,0); CTX.lineTo(x,H); CTX.stroke(); }
  for(let y=-gs;y<H;y+=gs){ CTX.beginPath(); CTX.moveTo(0,y); CTX.lineTo(W,y); CTX.stroke(); }
}

function updateHUD(){
  const me = GAME.players[0];
  if(!me) return;
  document.getElementById('hudName').textContent = me.def.name;
  const pct = (me.hp/me.maxHp)*100;
  document.getElementById('hpFill').style.width = pct + '%';
  document.getElementById('hpText').textContent = 'HP ' + Math.max(0, Math.round(me.hp)) + '/' + Math.round(me.maxHp);
  for(let i=0;i<2;i++){
    const el = document.getElementById('passive'+i);
    if(me.passives[i]){
      el.textContent = ITEMS[me.passives[i]].emoji;
      el.classList.add('filled');
      el.title = ITEMS[me.passives[i]].name + ' — ' + ITEMS[me.passives[i]].desc;
    } else {
      el.textContent = '';
      el.classList.remove('filled');
      el.title = '';
    }
  }
  document.querySelectorAll('.inv-slot').forEach(el=>{
    const slot = parseInt(el.dataset.slot);
    const key = me.inventory[slot];
    while(el.children.length>1) el.removeChild(el.lastChild);
    if(key){
      el.classList.add('has-item');
      const em = document.createElement('span');
      em.textContent = ITEMS[key].emoji;
      em.style.fontSize = '24px';
      el.appendChild(em);
      if(me.invCounts[slot]>1){
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = 'x'+me.invCounts[slot];
        el.appendChild(c);
      }
      el.title = ITEMS[key].name + ' — ' + ITEMS[key].desc;
    } else {
      el.classList.remove('has-item');
      el.title = '';
    }
  });
  const me_team = me.team;
  let rc;
  if(GAME.mode==='2v2'){
    const t0w = Math.max(...GAME.players.filter(p=>p.team===0).map(p=>p.roundsWon||0), 0);
    const t1w = Math.max(...GAME.players.filter(p=>p.team===1).map(p=>p.roundsWon||0), 0);
    rc = 'RD '+GAME.round+' · ALIADOS '+t0w+'-'+t1w+' RIVAIS';
  } else {
    rc = 'RD '+GAME.round+' · VOCÊ '+(me.roundsWon||0)+'/3';
  }
  document.getElementById('roundCounter').textContent = rc;
  const hudR = document.getElementById('hudRight');
  hudR.innerHTML = '';
  for(const p of GAME.players){
    const row = document.createElement('div');
    row.className = 'player-row' + (p.alive ? '' : ' dead');
    row.innerHTML = '<span><span class="dot" style="background:'+p.color+'"></span>'+p.name+'</span><span>'+(p.roundsWon||0)+'/3</span>';
    hudR.appendChild(row);
  }
}

function updateHUDLight(){
  const me = GAME.players[0];
  if(!me) return;
  const pct = (me.hp/me.maxHp)*100;
  document.getElementById('hpFill').style.width = pct + '%';
  document.getElementById('hpText').textContent = 'HP ' + Math.max(0, Math.round(me.hp)) + '/' + Math.round(me.maxHp);
  const dashFrac = 1 - Math.min(1, me.dashCd / (me.def.dashCd * (me.passives.includes('pCd')?0.75:1)));
  document.getElementById('dashCd').style.width = (dashFrac*100) + '%';
  
  // Atualiza Barra de Munição Dinâmica
  if (me.isReloading) {
      document.getElementById('ammoFill').style.width = ((1 - me.reloadTimer/(me.def.weapon.reloadTime * (me.passives.includes('pCd') ? 0.8 : 1)))*100) + '%';
      document.getElementById('ammoFill').style.background = '#3b82f6';
      document.getElementById('ammoText').textContent = 'RECARREGANDO...';
      document.getElementById('ammoText').style.color = '#3b82f6';
  } else {
      document.getElementById('ammoFill').style.width = ((me.ammo/me.maxAmmo)*100) + '%';
      document.getElementById('ammoFill').style.background = 'var(--gold)';
      document.getElementById('ammoText').textContent = me.ammo + '/' + me.maxAmmo;
      document.getElementById('ammoText').style.color = 'var(--gold)';
  }
}

function buildCharSelect(){
  const grid = document.getElementById('charGrid');
  grid.innerHTML = '';
  CHARS.forEach(c=>{
    const card = document.createElement('div');
    card.className = 'char-card' + (GAME.selectedChar===c.id ? ' selected' : '');
    card.innerHTML = `
      <div class="char-portrait" style="border-color:${c.color}">
        ${SPRITES[c.imgKey] && SPRITES[c.imgKey].complete ? `<img src="${SPRITES[c.imgKey].src}" />` : c.emoji}
      </div>
      <div class="char-name" style="color:${c.color}">${c.name}</div>
      <div class="char-role">${c.role}</div>
      <div style="font-size:10px;color:var(--muted);min-height:26px;margin:6px 0">${c.desc}</div>
      <div class="stat-row"><span>HP</span><span class="stat-bar" style="--v:${(c.hp/140)*100}%"></span></div>
      <div class="stat-row"><span>VEL</span><span class="stat-bar" style="--v:${(c.speed/220)*100}%"></span></div>
      <div class="stat-row"><span>DANO</span><span class="stat-bar" style="--v:${(c.weapon.dmg/40)*100}%"></span></div>
      <div class="stat-row"><span>MUN/REC</span><span class="stat-bar" style="--v:${(c.weapon.maxAmmo/50)*100}%"></span></div>
    `;
    card.onclick = ()=>{
      GAME.selectedChar = c.id;
      buildCharSelect();
    };
    grid.appendChild(card);
  });
}

const _goto = goto;
function _gotoOverride(name){
  Object.values(SCREENS).forEach(id => document.getElementById(id).classList.remove('active'));
  if(name==='hud'){ return; } 
  if(SCREENS[name]) document.getElementById(SCREENS[name]).classList.add('active');
  document.getElementById('hud').classList.remove('active');
  document.getElementById('mobileControls').classList.remove('active');
  GAME.state = 'menu';
  if(name==='charSelect') buildCharSelect();
  if(name==='menu') { musicStop(); }
  const me = document.getElementById('matchEndOverlay');
  if(me) me.classList.remove('active');
}
window.goto = _gotoOverride;

function loop(t){
  const now = t/1000;
  const dt = Math.min(0.05, now - (GAME.lastTime||now));
  GAME.lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Esperar um pouco para os sprites carregarem e depois construir o menu
setTimeout(buildCharSelect, 150);
