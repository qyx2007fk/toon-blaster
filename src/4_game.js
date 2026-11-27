
// ================= 玩家 =================
const player={pos:new THREE.Vector3(),vel:new THREE.Vector3(),yaw:0,pitch:0,onGround:true,height:1.7,radius:.45};
const pu={rage:0,haste:0,inf:0};
function resetPlayer(){
  Object.assign(player,{hp:100,maxHp:100,shield:0,maxShield:0,inv:0,dashCd:0,dashT:0,dashCdMax:2.2,jumpsLeft:0,maxJumps:1,boost:0,
    dmgMul:1,speedMul:1,reloadMul:1,lifesteal:0,ammoMul:1,critChance:.05,critMul:1.75,explosiveKills:false,regen:0,magnet:4,coinMul:1,
    weapon:0,owned:WEAPONS.map((w,i)=>i===0),clip:WEAPONS.map(w=>w.clip),reserve:WEAPONS.map(w=>w.reserve),reloading:0,reloadMax:1,cd:0,switchT:0,
    bloom:0,recoil:0,recoilPitch:0,flashT:0,roll:0,lean:0,land:0,dead:false,deathT:0,moving:false,teleLock:null,lastHurt:9,perks:{},heartT:0,onIce:false,swayX:0,swayY:0,lastDot:0});
  player.vel.set(0,0,0); for(const k in pu) pu[k]=0;
}
resetPlayer();
const capOf=i=>WEAPONS[i].reserve*2*player.ammoMul;
function refillAll(){ WEAPONS.forEach((w,i)=>{ if(player.owned[i]){ player.clip[i]=w.clip; player.reserve[i]=Math.max(player.reserve[i],w.reserve*player.ammoMul); } }); }
function addAmmo(){ WEAPONS.forEach((w,i)=>{ if(player.owned[i] && w.reserve!==Infinity) player.reserve[i]=Math.min(capOf(i),player.reserve[i]+Math.ceil(w.clip*1.5)); }); }
function giveWeapon(id,announce=true){
  const i=WEAPONS.findIndex(w=>w.id===id), w=WEAPONS[i];
  if(player.owned[i]) player.reserve[i]=Math.min(capOf(i),player.reserve[i]+w.clip*2);
  else { player.owned[i]=true; player.clip[i]=w.clip; player.reserve[i]=w.reserve*player.ammoMul; }
  if(announce){ switchWeapon(i); showMsg('获得 '+w.name+'！',1.6,'按 '+(i+1)+' 键切换'); sfx('weapon'); }
}

let state='menu', score=0, runCoins=0, levelIdx=0, waveIdx=-1, queue=[], spawnT=0, breakT=0, inBreak=true, bossSpawned=false, levelDone=false;
let combo=0, comboT=0, startChoice=0, gameT=0, bob=0, vigOp=0, flashOp=0, coinFrac=0;
const loopN=()=>Math.floor(levelIdx/LEVELS.length);

function startRun(lv){
  resetPlayer(); score=0; runCoins=0; startChoice=lv; combo=0;
  for(let k=0;k<lv;k++){ const wid=LEVEL_WEAPON[k]; if(wid) giveWeapon(wid,false); }
  startLevel(lv);
}
function startLevel(idx){
  levelIdx=idx; clearEnemies(); clearFx(); clearPickups();
  const L=buildLevel(idx); const li=idx%LEVELS.length, lp=loopN();
  diff={hp:1+li*.15+lp*.8, dmg:1+li*.08+lp*.35, count:1+lp*.35};
  player.pos.copy(world.spawn); player.vel.set(0,0,0); player.yaw=0; player.pitch=0; player.teleLock=null;
  waveIdx=-1; queue=[]; breakT=3; inBreak=true; bossSpawned=false; levelDone=false;
  const wid=LEVEL_WEAPON[li], wp=world.weaponPos;
  if(wid) spawnPickup(player.owned[WEAPONS.findIndex(w=>w.id===wid)]?'ammo':'weapon',new THREE.Vector3(wp[0],wp[1]+1.1,wp[2]),{weapon:wid});
  if(!player.owned[player.weapon]) player.weapon=0;
  buildViewmodel(); vmRoot.visible=true;
  showMsg(L.name,2.4,(lp?`无尽模式 第 ${lp} 轮 · `:'')+`第 ${li+1} 关`);
  if(idx===0) later(2.6,()=>tip('找到发光的武器拾取它！跳板、加速带都可以利用',4));
}
function startWave(){
  const L=world.level; waveIdx++; inBreak=false;
  queue=[]; for(const [t,n] of L.waves[waveIdx]) for(let k=0;k<Math.round(n*diff.count);k++) queue.push(t);
  shuffle(queue); spawnT=.3;
  showMsg(`第 ${waveIdx+1} 波`,1.6,`共 ${L.waves.length} 波 · 然后是 Boss`); sfx('wave');
}
function spawnBossWave(){
  inBreak=false; bossSpawned=true;
  let best=null,bd=0; for(let k=0;k<30;k++){ const p=findSpawn(3); const d=Math.hypot(p.x-player.pos.x,p.z-player.pos.z); if(d>bd){bd=d;best=p;} }
  const b=spawnEnemy('boss',best); b.hp=b.maxHp=ETYPES.boss.hp*diff.hp*(1+(levelIdx%LEVELS.length)*.08);
  queue=['jelly','jelly','runner']; spawnT=3;
  showMsg('BOSS 来袭！',2.2,world.level.boss); sfx('boss'); addShake(.4);
}
function onWaveCleared(){
  inBreak=true; breakT=4;
  if(waveIdx>=0){ showMsg('清除！',1.2,'补给已投放'); sfx('win');
    const near=()=>{ for(let k=0;k<40;k++){ const a=rng(0,6.28), d=rng(4,11); const x=player.pos.x+Math.cos(a)*d, z=player.pos.z+Math.sin(a)*d; if(!blocked(x,z,.6,0)) return new THREE.Vector3(x,3,z); } return player.pos.clone().setY(3); };
    spawnPickup('ammo',near(),{pop:true});
    if(player.hp<player.maxHp*.75) spawnPickup('health',near(),{pop:true});
    if(Math.random()<.6) spawnPickup(pick(Object.keys(POWERUPS)),near(),{pop:true});
  }
}
function updateGame(dt){
  comboT-=dt; if(comboT<=0) combo=0;
  if(levelDone||player.dead) return;
  const alive=enemies.filter(e=>!e.demo).length;
  if(queue.length){ spawnT-=dt; if(spawnT<=0 && alive<10+(levelIdx%LEVELS.length)){ spawnEnemy(queue.shift()); spawnT=rng(.4,1.1); } }
  else if(alive===0 && !bossSpawned){
    if(!inBreak) onWaveCleared();
    breakT-=dt;
    if(breakT<=0){ if(waveIdx<world.level.waves.length-1) startWave(); else spawnBossWave(); }
  }
}
function comboMult(){ return 1+Math.min(3,Math.floor(combo/5)*.5); }
const STREAK={5:'五连击！',10:'势不可挡！',20:'超神了！',35:'果冻终结者！',50:'传说！'};
function onEnemyKilled(e,o){
  if(e.demo) return;
  if(!o.noScore){ combo++; comboT=3; const s=Math.round(e.def.score*comboMult()); score+=s;
    dnum(enemyCenter(e).setY(e.y+e.r*2.6),'+'+s,'#7dff6a',20);
    if(STREAK[combo]) tip(STREAK[combo]+` 分数 x${comboMult()}`,1.5);
    const c=$('combo'); c.style.transform='scale(1.35)'; setTimeout(()=>c.style.transform='scale(1)',90); }
  if(player.lifesteal) player.hp=Math.min(player.maxHp,player.hp+player.lifesteal);
}
function onBossKilled(e){
  levelDone=true; slowmo=1.3; flashOp=.8; addShake(.8); sfx('win');
  showMsg('Boss 被击败！',2.5,'+'+Math.round(e.def.score*comboMult())+' 分');
  for(let k=0;k<5;k++) later(k*.15,()=>explode(enemyCenter(e).add(new THREE.Vector3(rng(-3,3),rng(-1,2),rng(-3,3))),2.5,0,{playerFactor:0,small:true}));
  for(const o of enemies.slice()) if(!o.dead && !o.demo) killEnemy(o,null,{noScore:true});
  queue=[];
  later(1.2,()=>pickups.forEach(p=>{ if(p.type==='coin') p.magnet=true; }));
  later(3.2,levelComplete);
}
function levelComplete(){
  if(state!=='play') return;
  const bonus=20+(levelIdx%LEVELS.length)*10+loopN()*20; save.coins+=bonus; runCoins+=bonus;
  save.maxLevel=Math.max(save.maxLevel,Math.min(LEVELS.length-1,levelIdx+1)); save.best=Math.max(save.best,score); persist();
  state='perk'; mouseDown=false; document.exitPointerLock();
  $('perkTitle').textContent=`${world.level.name} 完成！ +${bonus} 金币`;
  renderPerks(); showPanel('pPerk');
}
function renderPerks(){
  const pool=shuffle(PERKS.filter(p=>(player.perks[p.id]||0)<p.max)).slice(0,3);
  const box=$('perkCards'); box.innerHTML='';
  for(const p of pool){ const c=document.createElement('div'); c.className='card';
    c.innerHTML=`<div class="ic">${p.icon}</div><div class="nm">${p.name}</div><div class="ds">${p.desc}</div><div class="ds">Lv ${(player.perks[p.id]||0)+1}/${p.max}</div>`;
    c.onclick=()=>{ p.apply(); player.perks[p.id]=(player.perks[p.id]||0)+1; sfx('power'); afterPerk(); }; box.appendChild(c); }
  if(!pool.length){ const c=document.createElement('div'); c.className='card'; c.innerHTML='<div class="ic">🎁</div><div class="nm">满级奖励</div><div class="ds">回满生命和弹药</div>';
    c.onclick=()=>{ player.hp=player.maxHp; refillAll(); afterPerk(); }; box.appendChild(c); }
}
function afterPerk(){
  if(levelIdx%LEVELS.length===LEVELS.length-1){ state='win'; $('winTxt').innerHTML=`总得分 ${score} · 本局金币 ${runCoins}<br>无尽模式下敌人会更强，你能坚持多久？`; showPanel('pWin'); sfx('win'); return; }
  startLevel(levelIdx+1); lockAndPlay();
}
function gameOver(){
  if(player.dead) return;
  player.dead=true; player.deathT=1.4; slowmo=.8; mouseDown=false; sfx('lose');
}
function finishGameOver(){
  state='over'; document.exitPointerLock();
  save.best=Math.max(save.best,score); persist();
  const L=world.level; $('overTxt').innerHTML=`倒在了：${L.name} ${bossSpawned?'Boss 战':'第 '+Math.max(1,waveIdx+1)+' 波'}<br>得分 ${score}　本局金币 ${runCoins}　最高分 ${save.best}`;
  showPanel('pOver');
}

function hurtPlayer(dmg,src,o={}){
  if(state!=='play'||player.dead||dmg<=0) return;
  if(!o.dot){ if(player.inv>0||player.dashT>0) return; player.inv=.45; }
  player.lastHurt=0;
  let rest=dmg, sh=0;
  if(player.shield>0){ sh=Math.min(player.shield,rest); player.shield-=sh; rest-=sh; }
  player.hp-=rest;
  if(!o.dot){
    const blue = sh>0 && rest<=0;
    $('vig').style.setProperty('--vc',blue?'rgba(80,170,255,.85)':'rgba(255,0,0,.8)'); vigOp=Math.min(1,.5+dmg/35);
    addShake(.15+dmg/90); player.roll+=(Math.random()<.5?-1:1)*(.05+dmg/350); player.recoil=Math.max(player.recoil,.8);
    if(src){ dirIndicator(src);
      if(o.kb){ const away=new THREE.Vector3(player.pos.x-src.x,0,player.pos.z-src.z); if(away.lengthSq()<.001) away.set(0,0,1); away.normalize();
        player.vel.addScaledVector(away,o.kb); if(o.up){ player.vel.y=Math.max(player.vel.y,o.up); player.onGround=false; } } }
    sfx(blue?'shieldHit':'hurt',60);
    const bl=$('bl'); bl.classList.remove('shake'); void bl.offsetWidth; bl.classList.add('shake');
    combo=Math.floor(combo/2);
  } else if(performance.now()-player.lastDot>260){ player.lastDot=performance.now(); $('vig').style.setProperty('--vc','rgba(255,130,0,.85)'); vigOp=Math.max(vigOp,.65); addShake(.06); sfx('burn',200); }
  if(player.hp<=0){ player.hp=0; gameOver(); }
}
const dinds=[];
function dirIndicator(src){
  const el=document.createElement('div'); el.className='dind'; el.innerHTML='<div></div>'; $('dinds').appendChild(el);
  dinds.push({el,x:src.x,z:src.z,life:1.1}); if(dinds.length>6){ const o=dinds.shift(); o.el.remove(); }
}
function collectPickup(p){
  const P=player;
  switch(p.type){
    case 'coin': { coinFrac+=P.coinMul; const v=Math.floor(coinFrac); coinFrac-=v; save.coins+=v; runCoins+=v; sfx('coin',40); persistSoon(); break; }
    case 'health': if(P.hp>=P.maxHp) return false; P.hp=Math.min(P.maxHp,P.hp+30); sfx('pickup'); tip('+30 生命',1); $('vig').style.setProperty('--vc','rgba(60,255,120,.6)'); vigOp=.5; break;
    case 'ammo': addAmmo(); sfx('pickup'); tip('弹药补给',1); break;
    case 'weapon': giveWeapon(p.weapon); break;
    default: { const U=POWERUPS[p.type]; pu[p.type]=U.dur; sfx('power'); showMsg(U.name+'！',1.2,U.label); }
  }
}
let persistT=null; function persistSoon(){ if(!persistT) persistT=setTimeout(()=>{ persistT=null; persist(); },1000); }

// ================= 玩家更新 =================
const keys={}; let mouseDown=false, jumpQ=false, dashQ=false;
const _f=new THREE.Vector3(), _r=new THREE.Vector3(), _w=new THREE.Vector3();
function updatePlayer(dt,t){
  const P=player;
  if(P.dead){ P.deathT-=dt; P.roll+=(.6-P.roll)*Math.min(1,dt*3); P.height+=(.4-P.height)*Math.min(1,dt*3);
    camera.position.set(P.pos.x,P.pos.y+P.height,P.pos.z); camera.rotation.set(P.pitch*.5-.2,P.yaw,P.roll); vmRoot.position.y-=dt*.8;
    if(P.deathT<=0) finishGameOver(); return; }
  P.inv-=dt; P.dashCd-=dt; P.boost-=dt; P.lastHurt+=dt; P.cd-=dt; P.switchT-=dt; P.flashT-=dt;
  if(P.flashT<=0 && vm){ vm.flash.visible=false; vm.fl.intensity=0; }
  for(const k in pu) pu[k]=Math.max(0,pu[k]-dt);
  if(P.regen) P.hp=Math.min(P.maxHp,P.hp+P.regen*dt);
  if(P.maxShield>0 && P.lastHurt>4) P.shield=Math.min(P.maxShield,P.shield+12*dt);
  _f.set(-Math.sin(P.yaw),0,-Math.cos(P.yaw)); _r.set(Math.cos(P.yaw),0,-Math.sin(P.yaw));
  _w.set(0,0,0);
  if(keys.KeyW||keys.ArrowUp) _w.add(_f); if(keys.KeyS||keys.ArrowDown) _w.sub(_f);
  if(keys.KeyD||keys.ArrowRight) _w.add(_r); if(keys.KeyA||keys.ArrowLeft) _w.sub(_r);
  if(tm.x||tm.y){ _w.addScaledVector(_r,tm.x).addScaledVector(_f,-tm.y); }
  const wl=Math.min(1,_w.length()); P.moving=wl>.05; if(P.moving) _w.normalize().multiplyScalar(wl); else _w.set(0,0,0);
  const sprint=keys.ShiftLeft||keys.ShiftRight||Math.hypot(tm.x,tm.y)>.92;
  const spd=5.5*(sprint?1.55:1)*P.speedMul*(pu.haste>0?1.3:1)*(P.boost>0?1.6:1);
  if(P.dashT>0) P.dashT-=dt;
  else { const acc=P.onIce?(P.onGround?1.4:1):(P.onGround?14:4);
    P.vel.x+=(_w.x*spd-P.vel.x)*Math.min(1,acc*dt); P.vel.z+=(_w.z*spd-P.vel.z)*Math.min(1,acc*dt); }
  if(dashQ){ dashQ=false; if(P.dashCd<=0){ const d=P.moving?_w.clone().normalize():_f.clone(); P.vel.x=d.x*24; P.vel.z=d.z*24; P.dashT=.18; P.inv=Math.max(P.inv,.3); P.dashCd=P.dashCdMax; sfx('dash');
      for(let k=0;k<8;k++) burst(P.pos.clone().add(new THREE.Vector3(rng(-.5,.5),rng(.3,1.5),rng(-.5,.5))),0xffffff,1,2,.8,0); } }
  if(jumpQ){ jumpQ=false;
    if(P.onGround){ P.vel.y=8; P.onGround=false; P.jumpsLeft=P.maxJumps-1; sfx('jump'); }
    else if(P.jumpsLeft>0){ P.vel.y=7.5; P.jumpsLeft--; sfx('djump'); burst(P.pos.clone(),0xffffff,10,3,.8); } }
  P.vel.y-=22*dt;
  const nx=P.pos.x+P.vel.x*dt; if(blocked(nx,P.pos.z,P.radius,P.pos.y)) P.vel.x=0; else P.pos.x=nx;
  const nz=P.pos.z+P.vel.z*dt; if(blocked(P.pos.x,nz,P.radius,P.pos.y)) P.vel.z=0; else P.pos.z=nz;
  const prevY=P.pos.y, wasGround=P.onGround; P.pos.y+=P.vel.y*dt;
  const gh=groundHeightAt(P.pos.x,P.pos.z,P.radius*.6,Math.max(prevY,P.pos.y));
  if(P.pos.y<=gh){ if(!wasGround && P.vel.y<-10){ addShake(.06); P.land=Math.min(.25,-P.vel.y*.012); } P.pos.y=gh; P.vel.y=0; P.onGround=true; P.jumpsLeft=P.maxJumps-1; }
  else if(wasGround && P.vel.y<=0 && P.pos.y-gh<.35){ P.pos.y=gh; P.vel.y=0; P.onGround=true; }
  else P.onGround=false;
  // 机关
  P.onIce=false;
  for(const zn of world.zones){
    if(!inZone(zn,P.pos.x,P.pos.z,.2)){ if(P.teleLock===zn) P.teleLock=null; continue; }
    const on=Math.abs(P.pos.y-zn.y)<.4;
    switch(zn.type){
      case 'lava': if(on) hurtPlayer(28*dt,null,{dot:true}); break;
      case 'ice': if(on) P.onIce=true; break;
      case 'jump': if(on && P.vel.y<=.1){ P.vel.y=17; P.onGround=false; zn.anim=1; sfx('boing'); P.jumpsLeft=P.maxJumps-1; burst(new THREE.Vector3(zn.x,zn.y+.2,zn.z),0x5cff8a,12,5); } break;
      case 'speed': if(on){ P.boost=1.6; P.vel.x=zn.dx*21; P.vel.z=zn.dz*21; P.dashT=.2; if(zn.cd<=0){ sfx('dash'); zn.cd=.6; } } break;
      case 'heal': if(on && P.hp<P.maxHp && zn.charge>1){ const h=Math.min(20*dt,zn.charge,P.maxHp-P.hp); P.hp+=h; zn.charge-=h; zn.using=true; sfx('heal',160);
        if(Math.random()<.35) burst(P.pos.clone().add(new THREE.Vector3(rng(-.6,.6),rng(.2,1.5),rng(-.6,.6))),0x2ecc71,1,2,.8,-3); } break;
      case 'tele': if(on && P.teleLock!==zn){ const o=zn.pair; burst(new THREE.Vector3(zn.x,1,zn.z),zn.color,20,6); P.pos.set(o.x,o.y,o.z); P.teleLock=o; P.vel.multiplyScalar(.3);
        sfx('tele'); flashOp=.6; burst(new THREE.Vector3(o.x,1,o.z),o.color,20,6); } break;
      case 'spikes': if(on && zn.up) hurtPlayer(20,new THREE.Vector3(zn.x,0,zn.z),{kb:3,up:9}); break;
      case 'fire': if(zn.active && P.pos.y<zn.y+4) hurtPlayer(35*dt,null,{dot:true}); break;
    }
  }
  for(const tr of world.traps) if(tr.type==='saw' && P.pos.y<2.1 && Math.hypot(P.pos.x-tr.pos.x,P.pos.z-tr.pos.z)<1.45){ if(P.inv<=0){ sfx('saw'); burst(P.pos.clone().setY(P.pos.y+1),0xffffff,10,7); } hurtPlayer(25,tr.pos,{kb:12,up:5}); }
  // 武器
  if(P.reloading>0){ P.reloading-=dt; if(P.reloading<=0){ const i=P.weapon, w=WEAPONS[i]; const take=Math.min(w.clip-P.clip[i],P.reserve[i]); P.clip[i]+=take; if(P.reserve[i]!==Infinity) P.reserve[i]-=take; } }
  P.bloom*=Math.exp(-5*dt);
  if(mouseDown) fire();
  // 低血
  if(P.hp/P.maxHp<.3){ P.heartT-=dt; if(P.heartT<=0){ sfx('heart'); P.heartT=.85; } }
  // 相机
  shake*=Math.pow(.002,dt); P.roll*=Math.exp(-6*dt); P.land*=Math.exp(-10*dt); P.recoilPitch*=Math.exp(-7*dt); P.recoil*=Math.exp(-14*dt);
  const hs=Math.hypot(P.vel.x,P.vel.z); if(P.onGround&&hs>.5) bob+=dt*hs*1.6;
  const lr=P.vel.x*_r.x+P.vel.z*_r.z; P.lean+=(-lr*.0045-P.lean)*Math.min(1,dt*8);
  camera.position.set(P.pos.x+rng(-shake,shake),P.pos.y+P.height+Math.sin(bob*2)*.05*Math.min(1,hs/5)-P.land+rng(-shake,shake),P.pos.z+rng(-shake,shake));
  camera.rotation.set(P.pitch+P.recoilPitch,P.yaw,P.roll+P.lean+rng(-shake,shake)*.3);
  const fovT=75+(P.dashT>0?12:0)+(P.boost>0?8:0)+(sprint&&P.moving?4:0);
  if(Math.abs(camera.fov-fovT)>.05){ camera.fov+=(fovT-camera.fov)*Math.min(1,dt*8); camera.updateProjectionMatrix(); }
  // 枪模动画
  if(vm){ P.swayX*=Math.exp(-8*dt); P.swayY*=Math.exp(-8*dt);
    const sw=P.switchT>0?P.switchT/.3:0, rl=P.reloading>0?Math.sin(clamp(1-P.reloading/P.reloadMax,0,1)*Math.PI):0;
    vm.g.position.set(vm.base.x+Math.sin(bob)*.02-P.swayX,vm.base.y+Math.abs(Math.cos(bob))*.02-sw*.4-rl*.18+P.swayY,vm.base.z+P.recoil*.12);
    vm.g.rotation.set(P.recoil*.25-rl*.6,P.swayX*1.5,rl*.5+P.lean*2);
    vmRoot.position.set(0,0,0);
    if(vm.sk.rainbow){ skinM.p.color.setHSL((t*.15)%1,.85,.62); skinM.sleeve.color.setHSL((t*.15+.33)%1,.7,.7); skinM.a.color.setHSL((t*.15+.66)%1,.9,.6); skinM.glow.color.copy(skinM.a.color); }
  }
}

// ================= HUD =================
const tc=new Map(); function setT(id,v){ v=String(v); if(tc.get(id)!==v){ tc.set(id,v); $(id).textContent=v; } }
const sc=new Map(); function setS(el,prop,v){ const k=el.id+prop; if(sc.get(k)!==v){ sc.set(k,v); el.style[prop]=v; } }
let lastGap=-1, slotsKey='';
let msgTO=null, tipTO=null;
function showMsg(text,dur=1.8,sub=''){
  const m=$('msg'), s=$('sub2'); m.textContent=text; s.textContent=sub;
  m.style.transition='none'; m.style.transform='translate(-50%,-50%) scale(1.5)'; m.style.opacity=1; s.style.opacity=sub?1:0;
  void m.offsetWidth; m.style.transition='opacity .3s, transform .3s'; m.style.transform='translate(-50%,-50%) scale(1)';
  clearTimeout(msgTO); msgTO=setTimeout(()=>{ m.style.opacity=0; s.style.opacity=0; },dur*1000);
}
function tip(text,dur=2){ const el=$('tip'); el.textContent=text; el.style.opacity=1; clearTimeout(tipTO); tipTO=setTimeout(()=>el.style.opacity=0,dur*1000); }
const rctx=$('radar').getContext('2d');
function drawRadar(){
  const R=72, range=42, c=rctx; c.clearRect(0,0,150,150); c.save(); c.translate(75,75);
  c.strokeStyle='rgba(255,255,255,.25)'; c.lineWidth=2; for(const r of [R*.33,R*.66]){ c.beginPath(); c.arc(0,0,r,0,7); c.stroke(); }
  const sy=Math.sin(player.yaw), cy=Math.cos(player.yaw);
  const toR=(x,z)=>{ const dx=x-player.pos.x, dz=z-player.pos.z; const fl=-dx*sy-dz*cy, rl=dx*cy-dz*sy; return [rl/range*R,-fl/range*R]; };
  for(const p of pickups){ if(p.type==='coin') continue; const [x,y]=toR(p.pos.x,p.pos.z); if(Math.hypot(x,y)>R) continue;
    c.fillStyle=p.type==='weapon'?'#ffe14d':p.type==='health'?'#ff6b81':p.type==='ammo'?'#2ecc71':'#7ad7ff'; c.fillRect(x-3,y-3,6,6); }
  for(const e of enemies){ if(e.dead||e.demo) continue; let [x,y]=toR(e.g.position.x,e.g.position.z); const d=Math.hypot(x,y);
    if(d>R-4){ if(e.type!=='boss') continue; x*=(R-6)/d; y*=(R-6)/d; }
    c.fillStyle=e.type==='boss'?'#ff2d55':'#ff7a3d'; c.strokeStyle='#000'; c.lineWidth=1.5; c.beginPath(); c.arc(x,y,e.type==='boss'?7:e.r>1?5:3.5,0,7); c.fill(); c.stroke(); }
  c.fillStyle='#fff'; c.strokeStyle='#000'; c.lineWidth=2; c.beginPath(); c.moveTo(0,-8); c.lineTo(6,6); c.lineTo(-6,6); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
function updateHUD(dt,t){
  const P=player, L=world.level, w=WEAPONS[P.weapon];
  setT('score',score); setT('coins',save.coins);
  const wt = bossSpawned?'Boss 战': waveIdx<0?'准备':`第 ${waveIdx+1}/${L.waves.length} 波`;
  setT('lvl',(loopN()?`无尽${loopN()} · `:'')+`${L.name} · ${wt}`);
  setT('left',enemies.filter(e=>!e.dead&&!e.demo).length+queue.length);
  setT('hp',Math.ceil(P.hp)); setT('hpmax',P.maxHp);
  const hk=clamp(P.hp/P.maxHp,0,1);
  setS($('hpFill'),'width',(hk*100).toFixed(1)+'%'); setS($('hpTrail'),'width',(hk*100).toFixed(1)+'%');
  setS($('hpFill'),'background',hk>.5?'linear-gradient(#7dff6a,#2fbf2a)':hk>.25?'linear-gradient(#ffe66d,#f0a020)':'linear-gradient(#ff7a7a,#d02020)');
  setS($('shFill'),'width',(P.maxShield?P.shield/P.maxHp*100:0).toFixed(1)+'%');
  setS($('dashFill'),'width',((1-clamp(P.dashCd/P.dashCdMax,0,1))*100).toFixed(0)+'%');
  setS($('dashFill'),'background',P.dashCd<=0?'#7ad7ff':'#557');
  setT('clip',P.clip[P.weapon]); setT('reserve',P.reserve[P.weapon]===Infinity?'∞':P.reserve[P.weapon]); setT('wname',w.name+(pu.inf>0?' · 无限弹药':''));
  setS($('reload'),'display',P.reloading>0?'block':'none');
  setS($('clip'),'color',P.clip[P.weapon]===0?'#ff5050':P.clip[P.weapon]<=w.clip*.25?'#ffd93d':'#ffffff');
  const sk=P.owned.join()+P.weapon;
  if(sk!==slotsKey){ slotsKey=sk; $('slots').innerHTML=WEAPONS.map((x,i)=>`<div class="${P.owned[i]?'own':''} ${i===P.weapon?'cur':''}"><span style="font-size:16px">${i+1}</span>${P.owned[i]?x.short:'？'}</div>`).join(''); }
  const pus=Object.keys(pu).filter(k=>pu[k]>0);
  const ph=pus.map(k=>`<div style="color:#${POWERUPS[k].color.toString(16).padStart(6,'0')}">${POWERUPS[k].name} ${Math.ceil(pu[k])}s</div>`).join('');
  if($('pus').dataset.h!==ph){ $('pus').dataset.h=ph; $('pus').innerHTML=ph; }
  const pt=$('puTint'); if(pus.length){ pt.style.setProperty('--pc',POWERUPS[pus[0]].tint); pt.style.opacity=.7+Math.sin(t*6)*.3; } else pt.style.opacity=0;
  setT('combo',combo>=2?`连击 x${combo}${comboMult()>1?'  分数x'+comboMult():''}`:'');
  // Boss
  const bw=$('bossWrap');
  if(boss && !boss.dead && enemies.includes(boss)){ setS(bw,'display','block'); setT('bossName',L.boss+(loopN()?' +'+loopN():'')+' · 阶段 '+boss.bphase);
    const k=(clamp(boss.hp/boss.maxHp,0,1)*100).toFixed(1)+'%'; setS($('bossFill'),'width',k); setS($('bossTrail'),'width',k); }
  else setS(bw,'display','none');
  // 准星
  const spread=w.spread+P.bloom+(P.moving?w.spread*.6:0);
  const gap=Math.round(clamp(5+spread*innerHeight*.75+P.recoil*8,5,70));
  if(gap!==lastGap){ lastGap=gap; const [a,b,c,d]=$('cross').children;
    a.style.cssText=`left:-3px;top:${-gap-14}px;width:6px;height:14px`; b.style.cssText=`left:-3px;top:${gap}px;width:6px;height:14px`;
    c.style.cssText=`left:${-gap-14}px;top:-3px;width:14px;height:6px`; d.style.cssText=`left:${gap}px;top:-3px;width:14px;height:6px`; }
  // 屏幕效果
  vigOp*=Math.exp(-3.5*dt); $('vig').style.opacity=vigOp.toFixed(3);
  flashOp*=Math.exp(-5*dt); $('flashW').style.opacity=flashOp.toFixed(3);
  $('lowhp').style.opacity = hk<.3 ? (.45+Math.sin(t*7)*.3).toFixed(3) : 0;
  for(let i=dinds.length-1;i>=0;i--){ const d=dinds[i]; d.life-=dt; if(d.life<=0){ d.el.remove(); dinds.splice(i,1); continue; }
    const dx=d.x-P.pos.x, dz=d.z-P.pos.z; const f=dx*-Math.sin(P.yaw)+dz*-Math.cos(P.yaw), r=dx*Math.cos(P.yaw)-dz*Math.sin(P.yaw);
    d.el.style.transform=`rotate(${Math.atan2(r,f)}rad)`; d.el.style.opacity=Math.min(1,d.life*1.5); }
  // 箭头
  let near=null, nd=1e9; for(const e of enemies){ if(e.dead||e.demo) continue; const dd=e.g.position.distanceTo(P.pos); if(dd<nd){ nd=dd; near=e; } }
  const ar=$('arrow');
  if(near){ const v=enemyCenter(near).project(camera); const on=v.z<1&&Math.abs(v.x)<.9&&Math.abs(v.y)<.9;
    if(on) ar.style.display='none'; else { const dx=near.g.position.x-P.pos.x, dz=near.g.position.z-P.pos.z;
      const f=dx*-Math.sin(P.yaw)+dz*-Math.cos(P.yaw), r=dx*Math.cos(P.yaw)-dz*Math.sin(P.yaw); ar.style.display='block'; ar.style.transform=`rotate(${Math.atan2(r,f)}rad)`; } }
  else ar.style.display='none';
  drawRadar();
}

// ================= 菜单 / 面板 =================
const PANELS=['pMenu','pLevels','pSkins','pHelp','pPause','pPerk','pOver','pWin'];
function showPanel(id){ for(const p of PANELS) $(p).classList.toggle('show',p===id); }
function refreshMenu(){ document.querySelectorAll('.cTotal').forEach(e=>e.textContent=save.coins); $('bestTxt').textContent=save.best?`最高分 ${save.best}`:''; }
let lastUnlock=-1e9, lockRetry=0, lockTimer=null;
function lockFail(){
  if(state!=='locking') return;
  if(lockRetry<4){ lockRetry++; clearTimeout(lockTimer); lockTimer=setTimeout(tryLock,350); return; }
  state='paused'; $('lockTip').style.display='none'; $('pauseHint').textContent='鼠标锁定失败，请再点一次屏幕'; showPanel('pPause');
}
function tryLock(){
  if(state!=='locking') return;
  try{ const r=renderer.domElement.requestPointerLock(); if(r&&r.catch) r.catch(lockFail); }catch(e){ lockFail(); }
}
function pauseGame(hint='点击任意位置继续'){
  if(state!=='play') return;
  state='paused'; mouseDown=false; resetTouch(); for(const k in keys) keys[k]=false; pausedAt=performance.now();
  $('pauseHint').textContent=hint; showPanel('pPause');
}
let pausedAt=0;
function lockAndPlay(){
  if(TOUCH){ initAudio(); showPanel(null); $('hud').style.display='block'; resetTouch(); state='play'; clock.getDelta();
    try{ const fe=document.documentElement; if(!document.fullscreenElement && fe.requestFullscreen) fe.requestFullscreen({navigationUI:'hide'}).then(()=>screen.orientation?.lock?.('landscape').catch(()=>{})).catch(()=>{}); }catch(e){}
    return; }
  initAudio(); showPanel(null); $('hud').style.display='block'; state='locking'; lockRetry=0;
  const wait=Math.max(0,1250-(performance.now()-lastUnlock));
  clearTimeout(lockTimer);
  if(wait>0){ $('lockTip').style.display='block'; lockTimer=setTimeout(tryLock,wait); } else tryLock();
}
document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===renderer.domElement){ clearTimeout(lockTimer); $('lockTip').style.display='none';
    if(state==='locking'||state==='paused'){ state='play'; showPanel(null); clock.getDelta(); } }
  else { lastUnlock=performance.now();
    if(state==='play'){ state='paused'; mouseDown=false; for(const k in keys) keys[k]=false; $('pauseHint').textContent='点击任意位置继续'; showPanel('pPause'); } }
});
document.addEventListener('pointerlockerror',lockFail);
renderer.domElement.addEventListener('click',()=>{ if(state==='locking'){ lockRetry=0; tryLock(); } });
$('lockTip').style.pointerEvents='none';
$('pPause').addEventListener('click',e=>{ if(e.target.closest('#bQuit')) return; if(performance.now()-pausedAt<450) return; lockAndPlay(); });
document.addEventListener('visibilitychange',()=>{ if(document.hidden && TOUCH) pauseGame(); });

// ================= 触屏操作 =================
const tm={x:0,y:0}; let joyId=null, joyO={x:0,y:0}; const lookIds=new Map();
const LOOK_SENS=.0055;
function resetTouch(){ tm.x=tm.y=0; joyId=null; lookIds.clear(); $('joyBase').style.display='none'; mouseDown=false; document.querySelectorAll('.tbtn.on').forEach(b=>b.classList.remove('on')); }
function lookMove(e){ const l=lookIds.get(e.pointerId); if(!l||state!=='play'||player.dead) return;
  player.yaw-=(e.clientX-l.x)*LOOK_SENS; player.pitch=clamp(player.pitch-(e.clientY-l.y)*LOOK_SENS,-1.4,1.4);
  player.swayX=clamp(player.swayX+(e.clientX-l.x)*.0006,-.05,.05); l.x=e.clientX; l.y=e.clientY; }
function lookStart(e){ lookIds.set(e.pointerId,{x:e.clientX,y:e.clientY}); try{ e.target.setPointerCapture(e.pointerId); }catch(_){} }
function lookEnd(e){ lookIds.delete(e.pointerId); }
const tMove=$('tMove'), tLook=$('tLook');
tMove.addEventListener('pointerdown',e=>{ e.preventDefault(); if(joyId!==null) return; joyId=e.pointerId; joyO={x:e.clientX,y:e.clientY};
  const jb=$('joyBase'); jb.style.left=e.clientX+'px'; jb.style.top=e.clientY+'px'; jb.style.display='block'; $('joyKnob').style.transform='translate(0,0)';
  try{ tMove.setPointerCapture(e.pointerId); }catch(_){} });
tMove.addEventListener('pointermove',e=>{ if(e.pointerId!==joyId) return; let dx=e.clientX-joyO.x, dy=e.clientY-joyO.y; const d=Math.hypot(dx,dy), R=55;
  if(d>R){ dx*=R/d; dy*=R/d; } tm.x=dx/R; tm.y=dy/R; $('joyKnob').style.transform=`translate(${dx}px,${dy}px)`; });
const joyEnd=e=>{ if(e.pointerId!==joyId) return; joyId=null; tm.x=tm.y=0; $('joyBase').style.display='none'; };
tMove.addEventListener('pointerup',joyEnd); tMove.addEventListener('pointercancel',joyEnd);
tLook.addEventListener('pointerdown',e=>{ e.preventDefault(); lookStart(e); });
tLook.addEventListener('pointermove',lookMove); tLook.addEventListener('pointerup',lookEnd); tLook.addEventListener('pointercancel',lookEnd);
function tbtn(id,down,up,look){
  const b=$(id);
  b.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); if(state!=='play') return; b.classList.add('on'); if(look) lookStart(e); else { try{ b.setPointerCapture(e.pointerId); }catch(_){} } initAudio(); down(); });
  const end=e=>{ b.classList.remove('on'); if(look) lookEnd(e); if(up) up(); };
  b.addEventListener('pointerup',end); b.addEventListener('pointercancel',end);
  if(look) b.addEventListener('pointermove',lookMove);
}
tbtn('tFire',()=>{ mouseDown=true; },()=>{ mouseDown=false; },true);
tbtn('tJump',()=>{ jumpQ=true; });
tbtn('tDash',()=>{ dashQ=true; });
tbtn('tReload',()=>startReload());
tbtn('tSwap',()=>cycleWeapon(1));
tbtn('tPause',()=>pauseGame());
document.addEventListener('touchmove',e=>{ if(state==='play') e.preventDefault(); },{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault());
const LEVEL_ICONS=['🌳','🌵','❄️','🍭','🌋'];
function renderLevels(){
  const box=$('levelCards'); box.innerHTML='';
  LEVELS.forEach((L,i)=>{ const locked=i>save.maxLevel; const c=document.createElement('div'); c.className='card'+(locked?' locked':'');
    c.style.background='#'+L.sky.toString(16).padStart(6,'0');
    c.innerHTML=`<div class="ic">${locked?'🔒':LEVEL_ICONS[i]}</div><div class="nm">${i+1}. ${L.name}</div><div class="ds">Boss：${L.boss}</div><div class="ds">${locked?'通关上一关解锁':'点击开始'}</div>`;
    c.onclick=()=>{ if(locked){ c.classList.remove('nope'); void c.offsetWidth; c.classList.add('nope'); sfx('empty'); return; } sfx('click'); startRun(i); lockAndPlay(); };
    box.appendChild(c); });
}
const hex=c=>'#'+c.toString(16).padStart(6,'0');
function renderSkins(){
  refreshMenu(); const box=$('skinCards'); box.innerHTML='';
  for(const s of SKINS){ const own=save.skins.includes(s.id), eq=save.skin===s.id;
    const c=document.createElement('div'); c.className='card'+(eq?' sel':'')+(!own&&save.coins<s.cost?' locked':'');
    const sw=s.rainbow?`<span style="background:linear-gradient(135deg,#ff6b6b,#feca57,#1dd1a1,#54a0ff,#c8a2ff)"></span><span style="background:#fff"></span><span style="background:linear-gradient(45deg,#ff9ff3,#feca57)"></span>`
      :[s.p,s.s,s.a,s.sleeve].map(x=>`<span style="background:${hex(x)}"></span>`).join('');
    c.innerHTML=`<div class="sw">${sw}</div><div class="nm">${s.name}</div><div class="ds">${eq?'✅ 已装备':own?'点击装备':'金币 '+s.cost}</div>`;
    c.onclick=()=>{ if(own){ save.skin=s.id; sfx('click'); }
      else if(save.coins>=s.cost){ save.coins-=s.cost; save.skins.push(s.id); save.skin=s.id; sfx('power'); }
      else { c.classList.remove('nope'); void c.offsetWidth; c.classList.add('nope'); sfx('empty'); return; }
      persist(); renderSkins(); };
    box.appendChild(c); }
}
function toMenu(){
  state='menu'; if(document.pointerLockElement) document.exitPointerLock();
  clearEnemies(); clearFx(); clearPickups(); resetPlayer(); player.height=1.7;
  buildLevel(rint(0,save.maxLevel)); vmRoot.visible=false; $('hud').style.display='none';
  const types=['jelly','runner','tank','spitter','bomber','bat','splitter'];
  types.forEach((ty,i)=>{ const a=i/types.length*Math.PI*2; const e=spawnEnemy(ty,{x:Math.cos(a)*9,z:Math.sin(a)*9},{demo:true,instant:true,y:5}); });
  showPanel('pMenu'); refreshMenu();
}
document.addEventListener('click',e=>{ if(e.target.closest('button')) initAudio(); });
$('bStart').onclick=()=>{ sfx('click'); startRun(0); lockAndPlay(); };
$('bLevels').onclick=()=>{ sfx('click'); renderLevels(); showPanel('pLevels'); };
$('bSkins').onclick=()=>{ sfx('click'); renderSkins(); showPanel('pSkins'); };
$('bHelp').onclick=()=>{ sfx('click'); showPanel('pHelp'); };
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=()=>{ sfx('click'); refreshMenu(); showPanel('pMenu'); });
$('bQuit').onclick=()=>{ save.best=Math.max(save.best,score); persist(); toMenu(); };
$('bRetry').onclick=()=>{ startRun(startChoice); lockAndPlay(); };
$('bOverMenu').onclick=()=>toMenu();
$('bWinMenu').onclick=()=>toMenu();
$('bEndless').onclick=()=>{ startLevel(levelIdx+1); lockAndPlay(); };

// ================= 输入 =================
document.addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(state!=='play'||player.dead) return;
  if(e.code==='Space'){ e.preventDefault(); if(!e.repeat) jumpQ=true; }
  if(e.code==='KeyQ'||e.code==='KeyE') dashQ=true;
  if(e.code==='KeyR') startReload();
  if(/^Digit[1-5]$/.test(e.code)) switchWeapon(+e.code.slice(5)-1);
});
document.addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; mouseDown=false; });
document.addEventListener('mousedown',e=>{ if(TOUCH||state!=='play'||player.dead) return; if(e.button===0) mouseDown=true; if(e.button===2) dashQ=true; });
document.addEventListener('mouseup',e=>{ if(e.button===0) mouseDown=false; });
document.addEventListener('contextmenu',e=>e.preventDefault());
let wheelT=0; document.addEventListener('wheel',e=>{ if(state!=='play') return; const now=performance.now(); if(now-wheelT<120) return; wheelT=now; cycleWeapon(e.deltaY>0?1:-1); },{passive:true});
document.addEventListener('mousemove',e=>{
  if(state!=='play'||player.dead) return;
  player.yaw-=e.movementX*.0022; player.pitch=clamp(player.pitch-e.movementY*.0022,-1.5,1.5);
  player.swayX=clamp(player.swayX+e.movementX*.00025,-.05,.05); player.swayY=clamp(player.swayY+e.movementY*.00025,-.04,.04);
});
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

// ================= 主循环 =================
const clock=new THREE.Clock(); let menuT=0;
let perfAcc=0, perfN=0, quality=TOUCH?1:2;
function checkPerf(real){
  perfAcc+=real; perfN++;
  if(perfAcc<3) return;
  const fps=perfN/perfAcc; perfAcc=0; perfN=0;
  if(fps<40 && quality>0){
    quality--;
    if(quality===1){ renderer.setPixelRatio(1); renderer.setSize(innerWidth,innerHeight); sun.shadow.mapSize.set(1024,1024); sun.shadow.map?.dispose(); sun.shadow.map=null; }
    else { sun.castShadow=false; if(world.weather) world.weather.pts.visible=false; }
    tip('检测到卡顿，已自动降低画质',2);
  }
}
function loop(){
  requestAnimationFrame(loop);
  const raw=clock.getDelta(); const real=Math.min(raw,.05); let dt=real;
  if(state==='play' && raw<.5) checkPerf(raw);
  if(hitstop>0){ hitstop-=real; dt*=.08; }
  if(slowmo>0){ slowmo-=real; dt*=.3; }
  if(state==='play'){
    gameT+=dt; updatePlayer(dt,gameT); updateEnemies(dt,gameT); updateProjectiles(dt); updatePickups(dt);
    updateWorld(dt,gameT); if(state==='play') updateGame(dt); updateFx(dt); if(state==='play'||state==='over') updateHUD(dt,gameT);
  } else if(state==='menu'){
    menuT+=real; camera.position.set(Math.sin(menuT*.1)*24,13,Math.cos(menuT*.1)*24); camera.lookAt(0,1.5,0);
    player.pos.copy(camera.position); updateEnemies(real,menuT); updateWorld(real,menuT); updateFx(real);
  }
  const tv=(TOUCH&&state==='play')?'block':'none'; if($('touchUI').style.display!==tv) $('touchUI').style.display=tv;
  renderer.render(scene,camera);
}
toMenu();
loop();
window.__tb={get state(){return state;},player,enemies,pickups,world,startRun,startLevel,spawnEnemy,giveWeapon,switchWeapon,lockAndPlay,levelComplete,pu,save,
  get boss(){return boss;}, get waveIdx(){return waveIdx;}, killAll(){ for(const e of enemies.slice()) if(!e.dead&&!e.demo) killEnemy(e,null,{}); }, skipToBoss(){ waveIdx=world.level.waves.length-1; queue=[]; this.killAll(); }};
