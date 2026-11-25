import * as THREE from 'three';

// ================= 工具 =================
const $ = id => document.getElementById(id);
const rng = (a,b) => a + Math.random()*(b-a);
const rint = (a,b) => Math.floor(rng(a,b+1));
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const easeOutBack = x => { const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2); };

// ================= 渲染 =================
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fd8ff);
scene.fog = new THREE.Fog(0x8fd8ff, 45, 120);
const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);
const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30,50,20); sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera, {left:-60,right:60,top:60,bottom:-60,near:1,far:160});
scene.add(sun);

const grad = (()=>{ const d=new Uint8Array([90,170,255]); const t=new THREE.DataTexture(d,3,1,THREE.RedFormat); t.minFilter=t.magFilter=THREE.NearestFilter; t.needsUpdate=true; return t; })();
const matCache = new Map(), basicCache = new Map(), geoCache = new Map();
function toon(c){ let m=matCache.get(c); if(!m){ m=new THREE.MeshToonMaterial({color:c,gradientMap:grad}); matCache.set(c,m);} return m; }
function toonU(c){ return new THREE.MeshToonMaterial({color:c,gradientMap:grad}); }
function basic(c){ let m=basicCache.get(c); if(!m){ m=new THREE.MeshBasicMaterial({color:c}); basicCache.set(c,m);} return m; }
const outlineMat = new THREE.MeshBasicMaterial({color:0x000000, side:THREE.BackSide});
function G(key, fn){ let g=geoCache.get(key); if(!g){ g=fn(); geoCache.set(key,g);} return g; }
const f2 = v => Math.round(v*100)/100;
const sphereG = (r,w=16,h=12) => G(`s${f2(r)}_${w}`, ()=>new THREE.SphereGeometry(f2(r),w,h));
const boxG = (w,h,d) => G(`b${f2(w)}_${f2(h)}_${f2(d)}`, ()=>new THREE.BoxGeometry(f2(w),f2(h),f2(d)));
const cylG = (rt,rb,h,s=12) => G(`c${f2(rt)}_${f2(rb)}_${f2(h)}_${s}`, ()=>new THREE.CylinderGeometry(f2(rt),f2(rb),f2(h),s));
const coneG = (r,h,s=12) => G(`k${f2(r)}_${f2(h)}_${s}`, ()=>new THREE.ConeGeometry(f2(r),f2(h),s));
const torusG = (r,t,rs=8,ts=20,arc=Math.PI*2) => G(`t${f2(r)}_${f2(t)}_${rs}_${ts}_${f2(arc)}`, ()=>new THREE.TorusGeometry(f2(r),f2(t),rs,ts,arc));

function outlined(geo, mat, thick=0.04){
  if(typeof mat === 'number') mat = toon(mat);
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
  const o = new THREE.Mesh(geo, outlineMat); o.scale.setScalar(1+thick);
  g.add(m, o); g.userData.body = m; return g;
}
function part(parent, geo, mat, pos, rot, thick){
  const p = outlined(geo, mat, thick);
  if(pos) p.position.set(pos[0],pos[1],pos[2]);
  if(rot) p.rotation.set(rot[0],rot[1],rot[2]);
  parent.add(p); return p;
}

// ================= 存档 =================
const SAVE_KEY = 'toonblaster_v2';
let save = {coins:0, skins:['classic'], skin:'classic', maxLevel:0, best:0};
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)||'{}')); } catch(e){}
function persist(){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(save)); }catch(e){} }

// ================= 音效 =================
let actx=null, master=null, noiseBuf=null;
function initAudio(){
  if(actx) { if(actx.state==='suspended') actx.resume(); return; }
  try{
    actx = new (window.AudioContext||window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = .45; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  }catch(e){ actx=null; }
}
function tone(f, dur=.1, type='square', vol=.12, slide=0, delay=0){
  if(!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f+slide), t+dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t+dur);
  o.connect(g).connect(master); o.start(t); o.stop(t+dur+.02);
}
function noise(dur=.3, vol=.3, freq=1200, delay=0){
  if(!actx) return;
  const t = actx.currentTime + delay;
  const s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type='lowpass';
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq*.2), t+dur);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t+dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t+dur+.02);
}
const SFX = {
  hit(){ tone(rng(550,700),.06,'square',.07,400); },
  crit(){ tone(1100,.08,'square',.08,600); tone(1600,.06,'sine',.07,0,.03); },
  kill(){ tone(300,.22,'square',.1,600); tone(200,.25,'triangle',.1,-150); },
  hurt(){ tone(160,.25,'sawtooth',.16,-80); tone(520,.12,'square',.06,-300); },
  shieldHit(){ tone(1400,.12,'sine',.09,-800); tone(900,.1,'triangle',.06,-400); },
  burn(){ noise(.15,.12,2500); },
  jump(){ tone(300,.12,'sine',.08,300); },
  djump(){ tone(500,.12,'sine',.08,400); },
  dash(){ noise(.2,.18,3000); tone(700,.15,'sine',.05,-400); },
  boing(){ tone(180,.4,'sine',.18,520); },
  pickup(){ tone(800,.08,'square',.07); tone(1200,.1,'square',.07,0,.06); },
  coin(){ tone(1300,.05,'square',.04); tone(1900,.08,'square',.04,0,.04); },
  power(){ [500,700,900,1200].forEach((f,i)=>tone(f,.1,'square',.07,0,i*.06)); },
  weapon(){ [400,600,800,1000].forEach((f,i)=>tone(f,.12,'triangle',.11,0,i*.07)); },
  reload(){ tone(300,.06,'triangle',.1); tone(500,.06,'triangle',.1,0,.35); },
  empty(){ tone(200,.04,'square',.05); },
  boom(){ noise(.7,.5,1500); tone(90,.45,'sine',.3,-50); },
  spit(){ tone(320,.14,'sawtooth',.05,-200); },
  fuse(){ tone(900,.5,'square',.04,600); },
  wave(){ tone(520,.15,'square',.1,300); tone(780,.2,'square',.1,300,.15); },
  boss(){ [200,150,100].forEach((f,i)=>tone(f,.4,'sawtooth',.13,-30,i*.3)); },
  tele(){ tone(400,.35,'sine',.12,1200); noise(.3,.08,4000); },
  heal(){ tone(700,.08,'sine',.04,200); },
  heart(){ tone(60,.12,'sine',.28); tone(55,.12,'sine',.22,0,.16); },
  click(){ tone(600,.05,'square',.06); },
  slam(){ noise(.6,.45,600); tone(60,.5,'sine',.35,-30); },
  saw(){ noise(.1,.05,5000); },
  win(){ [523,659,784,1046].forEach((f,i)=>tone(f,.22,'square',.09,0,i*.12)); },
  lose(){ [400,300,200,120].forEach((f,i)=>tone(f,.3,'square',.1,-50,i*.2)); },
  swap(){ tone(450,.05,'triangle',.08); tone(650,.05,'triangle',.08,0,.06); },
};
const lastSfx = {};
function sfx(name, minGap=30){ const now=performance.now(); if(lastSfx[name] && now-lastSfx[name]<minGap) return; lastSfx[name]=now; SFX[name]?.(); }

// ================= 数据：皮肤 =================
const SKINS = [
  {id:'classic', name:'泡泡糖', cost:0,    p:0xff6bb5, s:0x54a0ff, a:0xffe66d, glove:0xffffff, sleeve:0x4ecdc4, trace:0xfff27a},
  {id:'ocean',   name:'深海蓝', cost:80,   p:0x2e86de, s:0x48dbfb, a:0xffffff, glove:0x0a3d62, sleeve:0x1dd1a1, trace:0x48dbfb},
  {id:'panda',   name:'熊猫',   cost:150,  p:0xffffff, s:0x222222, a:0x7bd66b, glove:0x222222, sleeve:0xf5f5f5, trace:0xffffff},
  {id:'lava',    name:'熔岩',   cost:250,  p:0xff4d00, s:0x2d2d2d, a:0xffc300, glove:0x2d2d2d, sleeve:0xff7b00, trace:0xff9f1a},
  {id:'toxic',   name:'剧毒',   cost:400,  p:0x7bed9f, s:0x2f3542, a:0xa4ff00, glove:0x2f3542, sleeve:0x7bed9f, trace:0xa4ff00},
  {id:'gold',    name:'土豪金', cost:700,  p:0xffc312, s:0xfff3c4, a:0xff3f6c, glove:0xffd32a, sleeve:0x8e44ad, trace:0xffd32a},
  {id:'rainbow', name:'彩虹独角兽', cost:1200, p:0xff6b6b, s:0xffffff, a:0xfeca57, glove:0xffffff, sleeve:0xc8a2ff, trace:0xff9ff3, rainbow:true},
];
const skinById = id => SKINS.find(s=>s.id===id) || SKINS[0];

// ================= 数据：武器 =================
const WEAPONS = [
  {id:'blaster', name:'泡泡手枪', short:'手枪', dmg:24, rate:.2,  clip:12, reserve:Infinity, reload:1.0, spread:.006, pellets:1, kick:.6, shake:.04, type:'hit', range:150, knock:3,
    snd(){ tone(900,.1,'square',.08,-650); tone(140,.08,'sawtooth',.06,-80); }},
  {id:'shotgun', name:'散弹喷子', short:'散弹', dmg:13, rate:.8,  clip:6,  reserve:24, reload:1.4, spread:.075, pellets:9, kick:1.8, shake:.16, type:'hit', range:40, knock:3.5,
    snd(){ noise(.3,.35,2500); tone(120,.2,'square',.12,-70); }},
  {id:'smg',     name:'冲锋水枪', short:'冲锋', dmg:11, rate:.075,clip:40, reserve:160, reload:1.3, spread:.018, bloom:.012, pellets:1, kick:.3, shake:.03, type:'hit', range:120, knock:1.2,
    snd(){ tone(rng(1100,1300),.05,'square',.05,-700); }},
  {id:'rocket',  name:'火箭泡泡', short:'火箭', dmg:95, rate:.95, clip:4,  reserve:12, reload:1.8, spread:0, pellets:1, kick:2.2, shake:.2, type:'rocket', speed:30, splash:4.8, knock:10,
    snd(){ noise(.4,.25,900); tone(220,.3,'sawtooth',.08,-120); }},
  {id:'rail',    name:'激光炮',   short:'激光', dmg:120,rate:1.1, clip:3,  reserve:12, reload:1.6, spread:0, pellets:1, kick:2.4, shake:.18, type:'rail', range:150, knock:6,
    snd(){ tone(1800,.35,'sawtooth',.08,-1500); tone(300,.3,'sine',.12,600); }},
];
const LEVEL_WEAPON = ['shotgun','smg','rocket','rail',null];

// ================= 数据：敌人 =================
const ETYPES = {
  jelly:   {name:'果冻',   hp:60,  speed:3.4, r:.9,  dmg:12, score:100, coin:[1,2], behavior:'melee', colors:[0xff5e7e,0x3dd6ff,0x6bff8e,0xffd93d]},
  runner:  {name:'兔兔',   hp:30,  speed:6.6, r:.6,  dmg:8,  score:120, coin:[1,2], behavior:'melee', colors:[0xffa63d]},
  tank:    {name:'大块头', hp:280, speed:2.2, r:1.5, dmg:28, score:300, coin:[3,5], behavior:'melee', colors:[0x9b59ff], knock:14},
  spitter: {name:'吐吐',   hp:55,  speed:3,   r:.85, dmg:10, score:150, coin:[1,3], behavior:'ranged', colors:[0x2ecc71], range:[9,18], fireRate:2.2},
  bomber:  {name:'炸弹君', hp:25,  speed:5.2, r:.7,  dmg:38, score:130, coin:[1,2], behavior:'bomber', colors:[0x3a3a4a]},
  bat:     {name:'蝙蝠',   hp:35,  speed:5.5, r:.6,  dmg:10, score:160, coin:[1,2], behavior:'flyer', colors:[0xa55eea]},
  splitter:{name:'分裂果冻',hp:95, speed:3,   r:1.1, dmg:14, score:180, coin:[2,3], behavior:'melee', colors:[0xe84393], split:'mini'},
  mini:    {name:'小果冻', hp:20,  speed:5.5, r:.5,  dmg:6,  score:40,  coin:[0,1], behavior:'melee', colors:[0xfd79a8]},
  boss:    {name:'Boss',   hp:2000,speed:2.6, r:3,   dmg:30, score:3000,coin:[30,40], behavior:'boss', colors:[0xff3f6c], knock:16},
};

// ================= 数据：天赋 =================
const PERKS = [
  {id:'hp',    icon:'❤️', name:'强壮体魄', desc:'最大生命 +25，并回满血', max:4, apply(){ player.maxHp+=25; player.hp=player.maxHp; }},
  {id:'dmg',   icon:'💥', name:'火力全开', desc:'所有伤害 +20%', max:5, apply(){ player.dmgMul*=1.2; }},
  {id:'spd',   icon:'👟', name:'飞毛腿',   desc:'移动速度 +15%', max:3, apply(){ player.speedMul*=1.15; }},
  {id:'jump',  icon:'🦘', name:'二段跳',   desc:'空中可以再跳一次', max:2, apply(){ player.maxJumps++; }},
  {id:'steal', icon:'🧛', name:'吸血果冻', desc:'每次击杀回复 4 点生命', max:3, apply(){ player.lifesteal+=4; }},
  {id:'reload',icon:'⚡', name:'快手',     desc:'换弹速度 +30%', max:2, apply(){ player.reloadMul*=.7; }},
  {id:'ammo',  icon:'📦', name:'弹药专家', desc:'备弹上限 +50%，并补满所有弹药', max:3, apply(){ player.ammoMul*=1.5; refillAll(); }},
  {id:'dash',  icon:'💨', name:'疾风冲刺', desc:'冲刺冷却 -40%', max:2, apply(){ player.dashCdMax*=.6; }},
  {id:'crit',  icon:'🎯', name:'神射手',   desc:'暴击率 +15%，暴击伤害 +25%', max:3, apply(){ player.critChance+=.15; player.critMul+=.25; }},
  {id:'boom',  icon:'🎆', name:'连锁爆破', desc:'敌人被消灭时会爆炸，伤害周围敌人', max:1, apply(){ player.explosiveKills=true; }},
  {id:'shield',icon:'🫧', name:'泡泡护盾', desc:'获得 40 点护盾，脱战后自动回复', max:3, apply(){ player.maxShield+=40; player.shield=player.maxShield; }},
  {id:'magnet',icon:'🧲', name:'金币磁铁', desc:'拾取范围翻倍，金币收益 +50%', max:2, apply(){ player.magnet*=2; player.coinMul*=1.5; }},
  {id:'regen', icon:'🌿', name:'自愈',     desc:'每秒回复 1.5 点生命', max:2, apply(){ player.regen+=1.5; }},
];

// ================= 数据：道具 =================
const POWERUPS = {
  rage:  {name:'狂暴', color:0xff3b3b, dur:10, tint:'rgba(255,40,40,.35)', label:'双倍伤害'},
  haste: {name:'急速', color:0x3dd6ff, dur:10, tint:'rgba(60,200,255,.35)', label:'射速/移速提升'},
  inf:   {name:'无限弹药', color:0xffd93d, dur:10, tint:'rgba(255,220,60,.35)', label:'不消耗弹药'},
};
