
// ================= 特效 =================
const UP = new THREE.Vector3(0,1,0);
const particles=[], pPool=[], beams=[], splats=[], fxs=[], timers=[];
let hitstop=0, slowmo=0, shake=0;
function addShake(v){ shake=Math.max(shake,v); }
function later(t,fn){ timers.push({t,fn}); }
function burst(pos,color,n=10,speed=6,size=1,grav=15){
  for(let i=0;i<n;i++){
    if(particles.length>600) break;
    const m=pPool.pop()||new THREE.Mesh(sphereG(.12,6,6));
    m.material=basic(color); m.position.copy(pos);
    const v=new THREE.Vector3(rng(-1,1),rng(-.2,1.5),rng(-1,1)).normalize().multiplyScalar(rng(.4,1)*speed);
    scene.add(m); particles.push({m,v,life:rng(.4,.8),size:size*rng(.7,1.3),grav});
  }
}
const splatMats=new Map();
function splatMat(c){ let m=splatMats.get(c); if(!m){ m=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.95,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4}); splatMats.set(c,m);} return m; }
function splat(point,normal,color,size=rng(.15,.3)){
  const m=new THREE.Mesh(G('splat',()=>new THREE.CircleGeometry(1,12)),splatMat(color));
  m.scale.setScalar(size); m.position.copy(point).addScaledVector(normal,.015); m.lookAt(point.clone().add(normal));
  scene.add(m); splats.push(m); if(splats.length>160) scene.remove(splats.shift());
}
function beam(from,to,color,thick=.04,life=.07){
  const len=from.distanceTo(to); if(len<.01) return;
  const m=new THREE.Mesh(boxG(1,1,1),new THREE.MeshBasicMaterial({color,transparent:true}));
  m.scale.set(thick,thick,len); m.position.lerpVectors(from,to,.5); m.lookAt(to);
  scene.add(m); beams.push({m,life,max:life,thick});
}
function fx(obj,life,upd){ scene.add(obj); fxs.push({obj,life,max:life,upd}); upd(0,obj); }
const dnums=[];
function dnum(pos,text,color='#fff',size=22){
  if(dnums.length>50){ const o=dnums.shift(); o.el.remove(); }
  const el=document.createElement('div'); el.textContent=text; el.style.color=color; el.style.fontSize=size+'px';
  $('dnums').appendChild(el); dnums.push({el,pos:pos.clone(),life:.85,vx:rng(-.8,.8)});
}
let hitmT=0, hitmMax=.12;
function hitMarker(kind){ const el=$('hitm'); el.style.setProperty('--hc', kind==='kill'?'#ff3b3b':kind==='crit'?'#ffe14d':'#ffffff'); hitmT=hitmMax=kind==='kill'?.3:.12; el.dataset.k=kind; }
const tmpP=new THREE.Vector3();
function updateFx(dt){
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life-=dt; p.v.y-=p.grav*dt; p.m.position.addScaledVector(p.v,dt);
    if(p.m.position.y<.05){ p.m.position.y=.05; p.v.multiplyScalar(.5); p.v.y*=-.5; }
    p.m.scale.setScalar(Math.max(.01,p.size*Math.min(1,p.life*2)));
    if(p.life<=0){ scene.remove(p.m); pPool.push(p.m); particles.splice(i,1); } }
  for(let i=beams.length-1;i>=0;i--){ const b=beams[i]; b.life-=dt; const k=Math.max(0,b.life/b.max); b.m.material.opacity=k; b.m.scale.x=b.m.scale.y=b.thick*(.3+.7*k);
    if(b.life<=0){ scene.remove(b.m); b.m.material.dispose(); beams.splice(i,1); } }
  for(let i=fxs.length-1;i>=0;i--){ const f=fxs[i]; f.life-=dt; f.upd(clamp(1-f.life/f.max,0,1),f.obj);
    if(f.life<=0){ scene.remove(f.obj); f.obj.traverse(o=>{ if(o.material && o.material.userData.own) o.material.dispose(); }); fxs.splice(i,1); } }
  for(let i=timers.length-1;i>=0;i--){ const t=timers[i]; t.t-=dt; if(t.t<=0){ timers.splice(i,1); t.fn(); } }
  for(let i=dnums.length-1;i>=0;i--){ const d=dnums[i]; d.life-=dt; d.pos.y+=dt*1.8; d.pos.x+=d.vx*dt;
    tmpP.copy(d.pos).project(camera);
    if(d.life<=0){ d.el.remove(); dnums.splice(i,1); continue; }
    if(tmpP.z>1){ d.el.style.display='none'; continue; } d.el.style.display='';
    d.el.style.left=((tmpP.x*.5+.5)*innerWidth)+'px'; d.el.style.top=((-tmpP.y*.5+.5)*innerHeight)+'px';
    d.el.style.opacity=Math.min(1,d.life*3); d.el.style.transform=`translate(-50%,-50%) scale(${1+Math.max(0,d.life-.65)*4})`; }
  hitmT-=dt; const hm=$('hitm'); hm.style.opacity=hitmT>0?1:0;
  hm.style.transform=`translate(-50%,-50%) rotate(45deg) scale(${hitmT>0?(hm.dataset.k==='kill'?1.3:1)+(hitmT/hitmMax)*.4:1})`;
}
function clearFx(){
  for(const p of particles){ scene.remove(p.m); pPool.push(p.m); } particles.length=0;
  for(const b of beams){ scene.remove(b.m); b.m.material.dispose(); } beams.length=0;
  for(const f of fxs) scene.remove(f.obj); fxs.length=0;
  for(const s of splats) scene.remove(s); splats.length=0;
  for(const d of dnums) d.el.remove(); dnums.length=0;
  timers.length=0;
}
function ownBasic(c,o={}){ const m=new THREE.MeshBasicMaterial(Object.assign({color:c,transparent:true},o)); m.userData.own=true; return m; }

// ================= 武器模型 =================
function limb(parent,from,dir,len,r,mat){
  const d=new THREE.Vector3(...dir).normalize();
  const g=outlined(cylG(r,r*1.1,len,10),mat,.06);
  g.quaternion.setFromUnitVectors(UP,d); g.position.set(from[0]+d.x*len/2,from[1]+d.y*len/2,from[2]+d.z*len/2);
  parent.add(g); return g;
}
const PI2=Math.PI/2;
const WMODEL = {
  blaster(m){ const g=new THREE.Group();
    part(g,boxG(.18,.22,.6),m.p); part(g,cylG(.06,.08,.45,12),m.s,[0,.04,-.45],[PI2,0,0],.08);
    part(g,torusG(.08,.03,8,16),m.a,[0,.04,-.68],null,.1); part(g,sphereG(.12,12,10),m.s,[0,.2,.05],null,.08);
    part(g,boxG(.12,.25,.14),m.s,[0,-.18,.15],[.3,0,0],.06);
    return {g,muzzle:[0,.04,-.75],grip:[0,-.25,.2]}; },
  shotgun(m){ const g=new THREE.Group();
    part(g,boxG(.2,.2,.55),m.p,[0,0,.05]); for(const s of [-1,1]) part(g,cylG(.05,.05,.8,10),m.s,[s*.055,.06,-.55],[PI2,0,0],.08);
    part(g,boxG(.18,.12,.3),m.a,[0,-.07,-.45]); part(g,boxG(.16,.2,.4),m.s,[0,-.06,.45],[-.15,0,0]);
    part(g,boxG(.11,.22,.13),m.p,[0,-.17,.15],[.3,0,0],.06); part(g,torusG(.11,.025,6,16),m.a,[0,.06,-.93],null,.1);
    return {g,muzzle:[0,.06,-1],grip:[0,-.25,.2],fore:[0,-.14,-.45],base:[.27,-.26,-.5]}; },
  smg(m){ const g=new THREE.Group();
    part(g,boxG(.16,.2,.5),m.p); part(g,cylG(.04,.04,.3,10),m.s,[0,.03,-.38],[PI2,0,0],.1);
    part(g,torusG(.06,.025,6,14),m.a,[0,.03,-.53],null,.12); part(g,boxG(.08,.3,.1),m.a,[0,-.22,-.08],[.15,0,0]);
    part(g,sphereG(.09,10,8),m.s,[0,.17,.08],null,.1); part(g,sphereG(.07,10,8),m.s,[0,.16,-.1],null,.1);
    part(g,boxG(.1,.22,.12),m.p,[0,-.17,.18],[.3,0,0]); part(g,boxG(.07,.16,.07),m.s,[0,-.15,-.24]);
    return {g,muzzle:[0,.03,-.58],grip:[0,-.25,.22],fore:[0,-.24,-.24]}; },
  rocket(m){ const g=new THREE.Group();
    part(g,cylG(.14,.14,.95,16),m.p,[0,.05,-.1],[PI2,0,0],.05); part(g,torusG(.15,.04,8,18),m.a,[0,.05,-.58],null,.08);
    part(g,coneG(.19,.25,14),m.s,[0,.05,.45],[-PI2,0,0],.06); part(g,sphereG(.1,10,8),m.a,[0,.05,-.55],null,.08);
    part(g,boxG(.07,.09,.28),m.s,[.13,.21,-.05]); part(g,cylG(.035,.035,.06,8),m.a,[.13,.21,-.2],[PI2,0,0]);
    part(g,boxG(.11,.22,.13),m.s,[0,-.18,.1],[.3,0,0]);
    return {g,muzzle:[0,.05,-.66],grip:[0,-.27,.14],fore:[0,-.1,-.32],base:[.3,-.28,-.5]}; },
  rail(m){ const g=new THREE.Group();
    part(g,boxG(.16,.18,.7),m.p); const core=new THREE.Mesh(cylG(.035,.035,.9,8),m.glow); core.rotation.x=PI2; core.position.set(0,.02,-.45); g.add(core);
    for(const z of [-.25,-.45,-.65]) part(g,torusG(.09,.025,6,16),m.a,[0,.02,z],null,.1);
    for(const s of [-1,1]) part(g,boxG(.03,.05,.42),m.s,[s*.075,.02,-.85]);
    part(g,boxG(.06,.08,.3),m.s,[0,.14,0]); part(g,boxG(.11,.22,.13),m.s,[0,-.17,.15],[.3,0,0]);
    return {g,muzzle:[0,.02,-1.05],grip:[0,-.25,.2],fore:[0,-.12,-.32],base:[.27,-.25,-.5]}; },
};
function skinMats(sk){ return {p:toonU(sk.p),s:toonU(sk.s),a:toonU(sk.a),glove:toonU(sk.glove),sleeve:toonU(sk.sleeve),glow:new THREE.MeshBasicMaterial({color:sk.a})}; }
let defMats=null;
const vmRoot=new THREE.Group(); camera.add(vmRoot);
let vm=null, skinM=null;
function buildViewmodel(){
  vmRoot.clear();
  const sk=skinById(save.skin); skinM=skinMats(sk);
  const w=WEAPONS[player.weapon]; const md=WMODEL[w.id](skinM); const g=md.g;
  const hand=new THREE.Group(); hand.position.set(...md.grip); g.add(hand);
  part(hand,sphereG(.1,12,10),skinM.glove,[0,0,0],null,.08);
  limb(hand,[0,0,0],[.25,-.55,.8],.9,.08,skinM.sleeve);
  if(md.fore){ const h2=new THREE.Group(); h2.position.set(...md.fore); g.add(h2);
    part(h2,sphereG(.1,12,10),skinM.glove,[0,0,0],null,.08); limb(h2,[0,0,0],[-.6,-.6,.55],1.1,.08,skinM.sleeve); }
  g.traverse(o=>{ if(o.isMesh) o.castShadow=false; });
  const muzzle=new THREE.Object3D(); muzzle.position.set(...md.muzzle); g.add(muzzle);
  const flash=new THREE.Mesh(sphereG(.13,8,8),new THREE.MeshBasicMaterial({color:sk.trace})); flash.visible=false; muzzle.add(flash);
  const fl=new THREE.PointLight(sk.trace,0,7); muzzle.add(fl);
  g.scale.setScalar(.5); vmRoot.add(g);
  vm={g,muzzle,flash,fl,base:new THREE.Vector3(...(md.base||[.26,-.24,-.55])).multiply(new THREE.Vector3(1.05,1.05,.9)),sk};
}

// ================= 敌人 =================
const enemies=[], eProj=[], pProj=[], shocks=[];
let diff={hp:1,dmg:1,count:1}, boss=null;
function makeEnemyModel(type,color){
  const d=ETYPES[type], r=d.r;
  const g=new THREE.Group(), vis=new THREE.Group(); g.add(vis);
  const mat=toonU(color); mat.userData.own=true;
  const body=outlined(sphereG(r,20,16),mat,.05); body.position.y=r; body.scale.y= type==='bat'?1:.9; vis.add(body);
  const parts={};
  const eyeW=basic(0xffffff), eyeB=basic(0x111111);
  const face=new THREE.Group(); face.position.y=r*1.1; vis.add(face);
  for(const s of [-1,1]){
    const w=new THREE.Mesh(sphereG(r*.26,12,10),eyeW); w.position.set(s*r*.35,0,-r*.8);
    const o=new THREE.Mesh(sphereG(r*.3,12,10),outlineMat); o.position.copy(w.position);
    const p=new THREE.Mesh(sphereG(r*.12,10,8),eyeB); p.position.set(s*r*.35,0,-r*1.02);
    face.add(o,w,p);
    if(type!=='mini'){ const brow=new THREE.Mesh(boxG(r*.42,r*.09,r*.09),eyeB); brow.position.set(s*r*.35,r*.3,-r*.88); brow.rotation.z=s*(type==='boss'||type==='tank'||type==='bomber'?.55:.35); face.add(brow); }
  }
  if(type!=='spitter'){ const mouth=new THREE.Mesh(torusG(r*.22,r*.055,6,12,Math.PI),eyeB); mouth.position.set(0,-r*.36,-r*.93); mouth.rotation.z=Math.PI; face.add(mouth); }
  if(type==='runner'){ parts.ears=[]; for(const s of [-1,1]){ const ear=new THREE.Group(); ear.position.set(s*r*.4,r*1.65,0); ear.rotation.z=-s*.25; vis.add(ear);
      part(ear,cylG(r*.15,r*.18,r*1.1,8),mat,[0,r*.5,0]); part(ear,cylG(r*.08,r*.1,r*.8,8),0xffc0cb,[0,r*.5,-r*.1],null,.02); parts.ears.push(ear); } }
  if(type==='tank'||type==='boss'){ const crown=new THREE.Group(); crown.position.y=r*1.72; vis.add(crown);
    part(crown,cylG(r*.45,r*.5,r*.3,10),0xffe14d);
    for(let i=0;i<5;i++){ const a=i/5*Math.PI*2; part(crown,coneG(r*.1,r*.35,5),0xffe14d,[Math.cos(a)*r*.42,r*.3,Math.sin(a)*r*.42]); part(crown,sphereG(r*.07,6,6),0xff3f6c,[Math.cos(a)*r*.48,0,Math.sin(a)*r*.48]); }
    parts.crown=crown; }
  if(type==='tank') part(vis,torusG(r*.93,r*.12,8,24),0x636e72,[0,r*.6,0],[PI2,0,0]);
  if(type==='boss') for(let i=-2;i<=2;i++){ const t=new THREE.Mesh(coneG(r*.06,r*.16,4),eyeW); t.position.set(i*r*.09,-r*.4,-r*.94); t.rotation.x=Math.PI; face.add(t); }
  if(type==='spitter'){ part(vis,cylG(r*.24,r*.3,r*.6,10),mat,[0,r*.8,-r*.98],[PI2,0,0]);
    const hole=new THREE.Mesh(cylG(r*.17,r*.17,.02,10),eyeB); hole.rotation.x=PI2; hole.position.set(0,r*.8,-r*1.29); vis.add(hole);
    part(vis,coneG(r*.2,r*.5,6),0x1e8449,[0,r*1.95,0]); part(vis,coneG(r*.15,r*.4,6),0x1e8449,[r*.25,r*1.85,0],[0,0,-.5]); }
  if(type==='bomber'){ part(vis,cylG(r*.08,r*.08,r*.55,6),0x8b5a2b,[r*.05,r*2,0],[0,0,-.3]);
    const spark=new THREE.Mesh(sphereG(r*.16,8,6),basic(0xffd93d)); spark.position.set(r*.15,r*2.3,0); vis.add(spark); parts.spark=spark;
    part(vis,boxG(r*.5,r*.15,r*.15),0xffffff,[0,r*1.55,-r*.6],[-.6,0,0]); }
  if(type==='bat'){ parts.wings=[]; for(const s of [-1,1]){ const wing=new THREE.Group(); wing.position.set(s*r*.75,r*1.05,0); vis.add(wing);
      part(wing,boxG(r*1.7,r*.08,r*.9),0x5f27cd,[s*r*.85,0,0]); part(wing,coneG(r*.25,r*.5,4),0x5f27cd,[s*r*1.7,0,r*.3],[PI2,0,0]); parts.wings.push(wing); }
    for(const s of [-1,1]){ const f=new THREE.Mesh(coneG(r*.07,r*.2,4),eyeW); f.position.set(s*r*.12,-r*.5,-r*.9); f.rotation.x=Math.PI; face.add(f); }
    for(const s of [-1,1]) part(vis,coneG(r*.22,r*.5,4),mat,[s*r*.45,r*1.95,0],[0,0,-s*.3]); }
  if(type==='splitter'){ for(let i=0;i<3;i++) part(vis,sphereG(r*.25,10,8),mat,[(i-1)*r*.4,r*1.78,(i%2)*r*.2]); part(vis,torusG(r*.97,r*.06,6,28),0xffffff,[0,r*.95,0],[PI2,0,0]); }
  // 血条
  const W=Math.max(1,r*1.3), bar=new THREE.Group();
  const pg=G('pl'+f2(W),()=>new THREE.PlaneGeometry(W,.12)), pgb=G('plb'+f2(W),()=>new THREE.PlaneGeometry(W+.12,.22));
  const barMat=new THREE.MeshBasicMaterial({color:0x5cff5c}); barMat.userData.own=true;
  const bg=new THREE.Mesh(pgb,basic(0x000000)), tr=new THREE.Mesh(pg,basic(0xffffff)), fg=new THREE.Mesh(pg,barMat);
  tr.position.z=.002; fg.position.z=.004; bar.add(bg,tr,fg); bar.position.y=r*2.3+.45; bar.visible=false; g.add(bar);
  if(type==='boss') bar.scale.setScalar(0);
  return {g,vis,body,mesh:body.userData.body,mat,parts,face,bar,barFg:fg,barTr:tr,barMat,barW:W};
}
function enemyCenter(e){ return new THREE.Vector3(e.g.position.x, e.y+e.vis.position.y+e.r*e.vis.scale.y, e.g.position.z); }
function findSpawn(r){
  for(let k=0;k<100;k++){
    const a=rng(0,Math.PI*2), d=rng(15,34); const x=player.pos.x+Math.cos(a)*d, z=player.pos.z+Math.sin(a)*d;
    if(Math.abs(x)>ARENA-3||Math.abs(z)>ARENA-3||blocked(x,z,r,0)) continue;
    let bad=false; for(const zn of world.zones) if((zn.type==='lava'||zn.type==='spikes'||zn.type==='fire'||zn.type==='tele') && inZone(zn,x,z,r+.5)) bad=true;
    if(!bad) return {x,z};
  }
  return {x:rng(-20,20),z:rng(-30,-10)};
}
function spawnEnemy(type,pos,o={}){
  const d=ETYPES[type]; const color= type==='boss'? (world.level?.bossColor??0xff3f6c) : pick(d.colors);
  const M=makeEnemyModel(type,color);
  const e=Object.assign({type,def:d,r:d.r,hp:d.hp*(o.demo?1:diff.hp),kb:new THREE.Vector3(),vy:0,y:0,phase:rng(0,6),atkCd:rng(.8,1.6),flash:0,squash:0,trapCd:0,numCd:0,dotAcc:0,
    spawnT:0,avoidT:0,avx:0,avz:0,strafe:pick([-1,1]),fuse:-1,swoop:0,dead:false,dying:0,color,demo:!!o.demo},M);
  e.maxHp=e.hp; e.mesh.userData.enemy=e;
  if(!pos) pos=findSpawn(d.r);
  e.g.position.set(pos.x,0,pos.z);
  e.y = type==='bat'? 3.5 : groundHeightAt(pos.x,pos.z,d.r*.4,o.y??0);
  e.g.position.y=e.y;
  if(o.instant) e.spawnT=1;
  scene.add(e.g); enemies.push(e);
  if(!o.quiet && !o.demo){
    const ring=new THREE.Mesh(G('portal',()=>new THREE.CylinderGeometry(1,1,.3,32,1,true)),ownBasic(0xb26bff,{side:THREE.DoubleSide}));
    ring.position.set(pos.x,e.y+.15,pos.z);
    fx(ring,.6,(k,o)=>{ o.scale.set(d.r*1.6*(1-k*.3),1+k*6,d.r*1.6*(1-k*.3)); o.material.opacity=1-k; });
    burst(new THREE.Vector3(pos.x,e.y+.5,pos.z),0xb26bff,12,5);
  }
  if(type==='boss'){ boss=e; e.slamCd=4; e.ringCd=3; e.sumCd=7; e.bphase=1; e.jump=null; }
  return e;
}
function enemyShoot(from,dir,speed,dmg,color=0x7bed9f,size=.3,grav=0){
  const m=outlined(sphereG(size,10,8),toon(color),.15); m.position.copy(from); scene.add(m);
  eProj.push({m,pos:from.clone(),vel:dir.clone().normalize().multiplyScalar(speed),dmg,life:5,r:size,color,grav});
}
function shockwave(x,z,y,maxR,dmg,color){
  const m=new THREE.Mesh(G('shock',()=>new THREE.CylinderGeometry(1,1,.7,48,1,true)),ownBasic(color,{side:THREE.DoubleSide,opacity:.85}));
  m.position.set(x,y+.35,z); scene.add(m); shocks.push({m,x,z,y,r:.5,maxR,dmg,hit:false,speed:13});
}
function damageEnemy(e,dmg,point,dir,o={}){
  if(e.dead||e.demo) return 0;
  let crit=false;
  if(!o.raw){
    dmg*=player.dmgMul*(pu.rage>0?2:1);
    if(o.canCrit){ const head = point && (point.y-(e.y+e.vis.position.y)) > e.r*1.3*e.vis.scale.y;
      if(head || Math.random()<player.critChance){ crit=true; dmg*=player.critMul; } }
  }
  if(e.type==='boss' && o.explosive) dmg*=.7;
  e.hp-=dmg; e.flash=.09;
  if(!o.dot){ e.squash=Math.min(1,e.squash+.7); }
  if(dir && !o.dot){ const res = e.type==='boss'?10: e.type==='tank'?3:1; e.kb.addScaledVector(dir,(o.knock??3)*3/res/Math.max(.6,e.r)); }
  if(e.type!=='boss') e.bar.visible=true;
  const c = point || enemyCenter(e);
  if(o.dot){ e.dotAcc+=dmg; if(e.numCd<=0){ e.numCd=.35; dnum(enemyCenter(e).setY(e.y+e.r*2.2),Math.round(e.dotAcc),'#ff9f43',18); e.dotAcc=0; } }
  else if(!o.noNum) dnum(c, Math.round(dmg)+(crit?'!':''), crit?'#ffe14d':'#ffffff', crit?34:22);
  if(!o.dot){ burst(c,e.color,crit?10:5,5,.9); if(o.byPlayer){ hitMarker(crit?'crit':'hit'); sfx(crit?'crit':'hit',40); } }
  if(e.hp<=0) killEnemy(e,dir,o);
  return {dmg,crit};
}
function killEnemy(e,dir,o={}){
  if(e.dead) return;
  e.dead=true; e.dying=.14; e.bar.visible=false;
  if(o.byPlayer||o.explosive) hitMarker('kill');
  sfx('kill',40);
  if(e.type!=='boss') hitstop=Math.max(hitstop,.045);
  onEnemyKilled(e,o);
}
function finalizeKill(e){
  const c=enemyCenter(e); const d=e.def;
  burst(c,e.color,e.type==='boss'?60:24,e.type==='boss'?14:9,e.type==='boss'?2:1.2); burst(c,0xffffff,8,6);
  for(let i=0;i<(e.type==='boss'?20:6);i++){ const a=rng(0,6.28), r=rng(0,e.r*1.8); splat(new THREE.Vector3(c.x+Math.cos(a)*r,e.y+.02,c.z+Math.sin(a)*r),UP,e.color,rng(.3,.8)*(e.type==='boss'?2:1)); }
  if(!e.noLoot){
    const n=rint(d.coin[0],d.coin[1]); for(let i=0;i<n;i++) spawnPickup('coin',c,{pop:true});
    const r=Math.random();
    if(e.type==='boss'){ spawnPickup('health',c,{pop:true}); spawnPickup('ammo',c,{pop:true}); }
    else if(r<.07) spawnPickup('health',c,{pop:true});
    else if(r<.17) spawnPickup('ammo',c,{pop:true});
    else if(r<.2) spawnPickup(pick(Object.keys(POWERUPS)),c,{pop:true});
  }
  if(d.split) for(const s of [-1,1]){ const m=spawnEnemy(d.split,{x:c.x+s*.8,z:c.z},{quiet:true,y:e.y}); m.spawnT=.5; m.kb.set(s*6,0,rng(-2,2)); m.vy=6; }
  if(e.type==='bomber') explode(c,4.2,60,{playerFactor:.6,raw:true});
  else if(player.explosiveKills && e.type!=='mini' && e.type!=='boss') explode(c,3,35,{playerFactor:0,small:true});
  scene.remove(e.g); e.mat.dispose(); e.barMat.dispose();
  const idx=enemies.indexOf(e); if(idx>=0) enemies.splice(idx,1);
  if(e.type==='boss') onBossKilled(e);
}
function explode(pos,radius,dmg,o={}){
  sfx('boom',60);
  const s1=new THREE.Mesh(sphereG(1,16,12),ownBasic(0xff8a1f));
  s1.position.copy(pos); fx(s1,.35,(k,ob)=>{ ob.scale.setScalar(.3+radius*(1-Math.pow(1-k,3))); ob.material.opacity=1-k; });
  const s2=new THREE.Mesh(sphereG(1,16,12),ownBasic(0xffe14d));
  s2.position.copy(pos); fx(s2,.22,(k,ob)=>{ ob.scale.setScalar(.2+radius*.6*(1-Math.pow(1-k,3))); ob.material.opacity=1-k; });
  burst(pos,0xff9f1a,o.small?8:18,10); burst(pos,0xffe14d,o.small?5:10,8); burst(pos,0x555555,o.small?3:8,5);
  if(pos.y<2) splat(new THREE.Vector3(pos.x,groundHeightAt(pos.x,pos.z,0,pos.y)+.02,pos.z),UP,0x2b2b2b,radius*.45);
  addShake(clamp(.6-pos.distanceTo(camera.position)/40,0,.6)*(o.small?.4:1));
  for(const e of enemies.slice()){ if(e.dead||e.demo) continue; const c=enemyCenter(e); const dd=c.distanceTo(pos);
    if(dd<radius+e.r){ const f=1-clamp(dd/(radius+e.r),0,1)*.6; const dir=c.clone().sub(pos).setY(0).normalize(); e.vy=Math.max(e.vy,5);
      damageEnemy(e,dmg*f,c,dir,{knock:o.knock??10,raw:o.raw,explosive:true,byPlayer:o.byPlayer}); } }
  for(const b of world.barrels) if(b.alive && Math.hypot(b.x-pos.x,b.z-pos.z)<radius+.5) later(.12,()=>explodeBarrel(b));
  if(o.playerFactor>0){ const pc=player.pos.clone(); pc.y+=.9; const dd=pc.distanceTo(pos);
    if(dd<radius+.4){ const f=1-dd/(radius+.4)*.5; hurtPlayer(dmg*o.playerFactor*f,pos,{kb:12,up:6}); } }
}
function explodeBarrel(b){
  if(!b.alive) return; b.alive=false; b.c.dead=true; world.group.remove(b.g);
  const i=world.solids.findIndex(m=>m.userData.barrel===b); if(i>=0) world.solids.splice(i,1);
  explode(new THREE.Vector3(b.x,.7,b.z),5,90,{playerFactor:.35,knock:14});
}

function enemyHazards(e,dt){
  if(e.type==='bat'||e.spawnT<1) return;
  const x=e.g.position.x, z=e.g.position.z;
  for(const zn of world.zones){ if(!inZone(zn,x,z,e.r*.3)) continue; const on=Math.abs(e.y-zn.y)<.45;
    if(zn.type==='lava'&&on) damageEnemy(e,40*dt,null,null,{raw:true,dot:true});
    else if(zn.type==='fire'&&zn.active&&e.y<zn.y+4) damageEnemy(e,60*dt,null,null,{raw:true,dot:true});
    else if(zn.type==='spikes'&&zn.up&&on&&e.trapCd<=0){ e.trapCd=.7; e.vy=6; damageEnemy(e,35,null,null,{raw:true}); }
    else if(zn.type==='jump'&&on&&e.vy<=0&&e.type!=='boss'){ e.vy=14; zn.anim=1; }
  }
  for(const tr of world.traps) if(tr.type==='saw' && e.trapCd<=0 && e.y<2.2 && Math.hypot(x-tr.pos.x,z-tr.pos.z)<e.r+1.1){
    e.trapCd=.5; const dir=new THREE.Vector3(x-tr.pos.x,0,z-tr.pos.z).normalize(); damageEnemy(e,50,null,dir,{raw:true,knock:10}); sfx('saw',80); burst(enemyCenter(e),0xffffff,6,7); }
}
function moveEnemy(e,ddx,ddz,fly){
  const p=e.g.position, r=e.r*.7; let hit=false;
  if(fly){ p.x=clamp(p.x+ddx,-ARENA+2,ARENA-2); p.z=clamp(p.z+ddz,-ARENA+2,ARENA-2); return false; }
  if(ddx){ if(!blocked(p.x+ddx,p.z,r,e.y)) p.x+=ddx; else hit=true; }
  if(ddz){ if(!blocked(p.x,p.z+ddz,r,e.y)) p.z+=ddz; else hit=true; }
  return hit;
}
function updateBoss(e,dt,dist,dx,dz){
  const k=e.hp/e.maxHp, ph=k>.66?1:k>.33?2:3;
  if(ph!==e.bphase){ e.bphase=ph; showMsg(ph===2?'Boss 发怒了！':'Boss 狂暴了！',1.5); sfx('boss'); e.squash=1; addShake(.3); e.mat.color.offsetHSL(0,0,-.08); }
  e.mx=dx; e.mz=dz; e.spd=e.def.speed*(ph===3?1.45:1);
  if(e.jump){
    const j=e.jump; j.t+=dt; const kk=Math.min(1,j.t/j.dur);
    e.g.position.x=j.sx+(j.tx-j.sx)*kk; e.g.position.z=j.sz+(j.tz-j.sz)*kk;
    e.y=j.sy+Math.sin(Math.PI*kk)*7; e.mx=e.mz=0;
    if(kk>=1){ e.jump=null; e.y=groundHeightAt(e.g.position.x,e.g.position.z,1,j.sy+1); e.squash=1; sfx('slam'); addShake(.5);
      shockwave(e.g.position.x,e.g.position.z,e.y,18,20*diff.dmg,e.color); if(ph>=2) later(.35,()=>shockwave(e.g.position.x,e.g.position.z,e.y,18,15*diff.dmg,0xffffff));
      burst(new THREE.Vector3(e.g.position.x,e.y+.3,e.g.position.z),e.color,30,10); }
    return true;
  }
  e.slamCd-=dt; e.ringCd-=dt; e.sumCd-=dt;
  if(e.slamCd<=0 && dist<28){ e.slamCd=ph===3?4:6.5;
    const tx=clamp(player.pos.x,-ARENA+5,ARENA-5), tz=clamp(player.pos.z,-ARENA+5,ARENA-5);
    e.jump={t:0,dur:1.1,sx:e.g.position.x,sz:e.g.position.z,sy:e.y,tx,tz}; sfx('jump'); return true; }
  if(ph>=2 && e.ringCd<=0){ e.ringCd=ph===3?2.6:4; const n=ph===3?18:12, off=rng(0,6);
    for(let i=0;i<n;i++){ const a=off+i/n*Math.PI*2; enemyShoot(new THREE.Vector3(e.g.position.x+Math.cos(a)*e.r,e.y+.6,e.g.position.z+Math.sin(a)*e.r),new THREE.Vector3(Math.cos(a),0,Math.sin(a)),10,12*diff.dmg,e.color,.38); }
    sfx('spit'); e.squash=.8; }
  if(ph>=3 && e.sumCd<=0){ e.sumCd=9; for(let i=0;i<3;i++){ const a=rng(0,6.28); spawnEnemy(pick(['mini','runner','jelly']),{x:clamp(e.g.position.x+Math.cos(a)*5,-44,44),z:clamp(e.g.position.z+Math.sin(a)*5,-44,44)}); } }
  return false;
}
function updateEnemies(dt,t){
  for(let i=enemies.length-1;i>=0;i--){
    const e=enemies[i]; if(!e) continue; const d=e.def;
    if(e.demo){ animateEnemy(e,dt,t); continue; }
    if(e.dying>0){ e.dying-=dt; const k=1-Math.max(0,e.dying)/.14; e.vis.scale.set(1+k*.6,1-k*.75,1+k*.6); e.mat.emissive.setHex(0xffffff); if(e.dying<=0) finalizeKill(e); continue; }
    e.spawnT=Math.min(1,e.spawnT+dt*2.5); e.atkCd-=dt; e.flash-=dt; e.trapCd-=dt; e.numCd-=dt;
    const p=e.g.position; const px=player.pos.x-p.x, pz=player.pos.z-p.z; const dist=Math.hypot(px,pz)||.001; const dx=px/dist, dz=pz/dist;
    const fly=d.behavior==='flyer';
    let mx=0,mz=0,spd=d.speed, airborne=false;
    if(e.spawnT>=1){
      switch(d.behavior){
        case 'melee': if(dist>e.r+.6){ mx=dx; mz=dz; } break;
        case 'ranged': { const [a,b]=d.range;
          if(dist>b){ mx=dx; mz=dz; } else if(dist<a){ mx=-dx; mz=-dz; } else { mx=-dz*e.strafe; mz=dx*e.strafe; spd*=.6; if(Math.random()<dt*.4) e.strafe*=-1; }
          if(e.atkCd<=0 && dist<b+8){ e.atkCd=d.fireRate*rng(.8,1.2); e.squash=.6;
            const from=new THREE.Vector3(p.x+dx*e.r*1.2,e.y+e.r*.85,p.z+dz*e.r*1.2);
            const to=new THREE.Vector3(player.pos.x+player.vel.x*.3,player.pos.y+1.1,player.pos.z+player.vel.z*.3);
            enemyShoot(from,to.sub(from),14,d.dmg*diff.dmg,0x7bed9f,.3); sfx('spit',80); }
          break; }
        case 'bomber': mx=dx; mz=dz;
          if(e.fuse<0 && dist<2.8){ e.fuse=.75; sfx('fuse'); }
          if(e.fuse>=0){ spd*=.35; e.fuse-=dt; if(e.fuse<=0){ e.noLoot=true; killEnemy(e,null,{noScore:true}); continue; } }
          break;
        case 'flyer': {
          if(e.swoop>0){ e.swoop-=dt; mx=dx; mz=dz; spd*=1.7; e.ty=player.pos.y+1.1; }
          else { e.ty=Math.max(3.5,player.pos.y+3)+Math.sin(t*2+e.phase)*.6;
            if(dist>6){ mx=dx; mz=dz; } else { mx=-dz*e.strafe; mz=dx*e.strafe; }
            if(dist<9 && e.atkCd<=0){ e.swoop=1.4; e.atkCd=3; } }
          e.y+=(e.ty-e.y)*Math.min(1,dt*(e.swoop>0?4:2)); break; }
        case 'boss': airborne=updateBoss(e,dt,dist,dx,dz); mx=e.mx; mz=e.mz; spd=e.spd; break;
      }
    }
    if(e.avoidT>0){ e.avoidT-=dt; mx=e.avx; mz=e.avz; }
    for(const o of enemies){ if(o===e||o.dead||o.demo) continue; const sx=p.x-o.g.position.x, sz=p.z-o.g.position.z, dd=Math.hypot(sx,sz), m=e.r+o.r;
      if(dd<m && dd>.001 && Math.abs(e.y-o.y)<2){ const push=(m-dd)*.5; moveEnemy(e,sx/dd*push,sz/dd*push,fly); } }
    const step=spd*dt;
    const hitWall=moveEnemy(e,mx*step+e.kb.x*dt,mz*step+e.kb.z*dt,fly);
    if(hitWall && e.avoidT<=0 && (mx||mz)){ const s=Math.random()<.5?1:-1; e.avx=-mz*s; e.avz=mx*s; e.avoidT=rng(.4,.9); }
    e.kb.multiplyScalar(Math.exp(-7*dt));
    { const qx=p.x-player.pos.x, qz=p.z-player.pos.z, qd=Math.hypot(qx,qz), mn=e.r+player.radius;
      if(qd<mn && qd>.001 && e.y<player.pos.y+1.7 && e.y+e.r*2>player.pos.y) moveEnemy(e,qx/qd*(mn-qd),qz/qd*(mn-qd),fly); }
    if(!fly && !airborne){ const gh=groundHeightAt(p.x,p.z,e.r*.4,e.y); e.vy-=25*dt; e.y+=e.vy*dt; if(e.y<=gh){ e.y=gh; e.vy=0; } }
    p.y=e.y;
    enemyHazards(e,dt);
    if(e.dead) continue;
    // 攻击
    if(e.spawnT>=1 && e.atkCd<=0 && d.behavior!=='ranged' && d.behavior!=='bomber'){
      const vd = fly? Math.hypot(dist,(player.pos.y+1)-(e.y+e.r)) : dist;
      const vOk = fly? true : (player.pos.y-e.y) < e.r*1.8+.3 && (player.pos.y-e.y) > -1.5;
      if(vd<e.r+.9 && vOk && !airborne){
        e.atkCd= fly?2.5:1; e.squash=1; if(fly){ e.swoop=0; e.kb.set(-dx*6,0,-dz*6); }
        hurtPlayer(d.dmg*diff.dmg,p,{kb:d.knock||7,up:d.knock?6:3});
      }
    }
    animateEnemy(e,dt,t);
  }
}
function animateEnemy(e,dt,t){
  const d=e.def, fly=d.behavior==='flyer';
  const hopSp=d.speed*1.5;
  const hop = fly||e.jump ? 0 : Math.abs(Math.sin(t*hopSp+e.phase));
  e.squash*=Math.exp(-9*dt);
  const sp = e.spawnT<1 ? Math.max(.01,easeOutBack(e.spawnT)) : 1;
  const sq=e.squash;
  const sx=(1+(1-hop)*.12+sq*.3)*sp, sy=(1-(1-hop)*.12+hop*.06-sq*.32)*sp;
  e.vis.scale.set(sx,sy,sx);
  e.vis.position.y = fly? Math.sin(t*4+e.phase)*.15 : hop*e.r*.45;
  if(!e.jump || e.type!=='boss'){ const tx=player.pos.x-e.g.position.x, tz=player.pos.z-e.g.position.z; const target=Math.atan2(-tx,-tz);
    let da=target-e.g.rotation.y; da=Math.atan2(Math.sin(da),Math.cos(da)); e.g.rotation.y+=da*Math.min(1,dt*(e.type==='boss'?3:10)); }
  let em=0;
  if(e.flash>0) em=0xffffff; else if(e.fuse>=0 && Math.sin(t*(30+ (0.75-e.fuse)*40))>0) em=0xff2020;
  e.mat.emissive.setHex(em);
  if(e.parts.wings) e.parts.wings.forEach((w,i)=>w.rotation.z=(i?-1:1)*Math.sin(t*22+e.phase)*.7);
  if(e.parts.ears) e.parts.ears.forEach((w,i)=>w.rotation.x=Math.sin(t*hopSp*2+e.phase)*.25);
  if(e.parts.spark){ e.parts.spark.scale.setScalar(rng(.7,1.4)*(e.fuse>=0?1.8:1)); if(Math.random()<.3) burst(e.parts.spark.getWorldPosition(tmpP),0xffd93d,1,2,.4,0); }
  if(e.bar.visible){ const k=Math.max(0,e.hp/e.maxHp);
    e.barFg.scale.x=Math.max(.001,k); e.barFg.position.x=-(1-k)*e.barW/2;
    const tk=e.barTr.scale.x+(k-e.barTr.scale.x)*Math.min(1,dt*3); e.barTr.scale.x=Math.max(.001,tk); e.barTr.position.x=-(1-tk)*e.barW/2;
    e.barMat.color.setHex(k>.5?0x5cff5c:k>.25?0xffd93d:0xff4d4d);
    e.bar.position.y=e.r*2.3+.45+e.vis.position.y; e.bar.quaternion.copy(camera.quaternion);
    e.bar.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-e.g.rotation.y,0))); }
}
function updateProjectiles(dt){
  for(let i=eProj.length-1;i>=0;i--){ const p=eProj[i]; p.life-=dt; p.vel.y-=p.grav*dt; p.pos.addScaledVector(p.vel,dt); p.m.position.copy(p.pos);
    const ddx=p.pos.x-player.pos.x, ddz=p.pos.z-player.pos.z;
    if(Math.hypot(ddx,ddz)<.45+p.r && p.pos.y>player.pos.y-.1 && p.pos.y<player.pos.y+1.85){
      hurtPlayer(p.dmg,p.pos,{kb:5}); burst(p.pos,p.color,10,5); scene.remove(p.m); eProj.splice(i,1); continue; }
    if(p.life<=0 || pointInSolid(p.pos.x,p.pos.y,p.pos.z)){ burst(p.pos,p.color,6,4);
      if(p.pos.y<.5) splat(new THREE.Vector3(p.pos.x,.02,p.pos.z),UP,p.color,.5); scene.remove(p.m); eProj.splice(i,1); } }
  for(let i=pProj.length-1;i>=0;i--){ const p=pProj[i]; p.life-=dt; p.pos.addScaledVector(p.vel,dt); p.m.position.copy(p.pos); p.m.rotation.x+=dt*10;
    if(Math.random()<.8) burst(p.pos,pick([0xffffff,p.tcol,0xdddddd]),1,1.5,.8,-2);
    let boom = p.life<=0 || pointInSolid(p.pos.x,p.pos.y,p.pos.z);
    if(!boom) for(const e of enemies){ if(e.dead||e.demo) continue; if(enemyCenter(e).distanceTo(p.pos)<e.r+.4){ boom=true; break; } }
    if(boom){ explode(p.pos.clone().addScaledVector(p.vel,-.02),p.w.splash,p.w.dmg,{playerFactor:.25,knock:p.w.knock,byPlayer:true}); scene.remove(p.m); pProj.splice(i,1); } }
  for(let i=shocks.length-1;i>=0;i--){ const s=shocks[i]; s.r+=s.speed*dt; s.m.scale.set(s.r,1,s.r); s.m.material.opacity=.85*(1-s.r/s.maxR);
    if(Math.random()<.6){ const a=rng(0,6.28); burst(new THREE.Vector3(s.x+Math.cos(a)*s.r,s.y+.2,s.z+Math.sin(a)*s.r),0xffffff,1,3,.8); }
    const pd=Math.hypot(player.pos.x-s.x,player.pos.z-s.z);
    if(!s.hit && Math.abs(pd-s.r)<.7 && player.pos.y-s.y<.6){ s.hit=true; hurtPlayer(s.dmg,new THREE.Vector3(s.x,0,s.z),{kb:10,up:7}); }
    if(s.r>=s.maxR){ scene.remove(s.m); s.m.material.dispose(); shocks.splice(i,1); } }
}
function clearEnemies(){
  for(const e of enemies){ scene.remove(e.g); e.mat.dispose(); e.barMat.dispose(); } enemies.length=0;
  for(const p of eProj) scene.remove(p.m); eProj.length=0;
  for(const p of pProj) scene.remove(p.m); pProj.length=0;
  for(const s of shocks){ scene.remove(s.m); s.m.material.dispose(); } shocks.length=0;
  boss=null;
}

// ================= 拾取物 =================
const pickups=[];
function spawnPickup(type,pos,o={}){
  const g=new THREE.Group();
  if(type==='coin'){ part(g,cylG(.28,.28,.08,14),0xffd32a,[0,0,0],[PI2,0,0],.12); part(g,boxG(.08,.2,.1),0xffa502,[0,0,0]); }
  else if(type==='health'){ part(g,cylG(.42,.42,.12,16),0xffffff,[0,0,0],[PI2,0,0],.08); part(g,boxG(.5,.16,.2),0xff3b5c); part(g,boxG(.16,.5,.2),0xff3b5c); }
  else if(type==='ammo'){ part(g,boxG(.6,.4,.4),0x2ecc71); part(g,boxG(.62,.12,.42),0xffd93d); for(let i=-1;i<=1;i++) part(g,cylG(.05,.05,.25,6),0xffa502,[i*.15,.3,0]); }
  else if(type==='weapon'){ if(!defMats) defMats=skinMats(SKINS[0]); const md=WMODEL[o.weapon](defMats); md.g.scale.setScalar(1.5); md.g.rotation.z=.2; g.add(md.g);
    const beamM=new THREE.Mesh(cylG(.6,.6,8,16,),new THREE.MeshBasicMaterial({color:0xffe14d,transparent:true,opacity:.25,depthWrite:false})); beamM.position.y=3; g.add(beamM);
    const ring=new THREE.Mesh(torusG(1,.06,6,24),basic(0xffe14d)); ring.rotation.x=PI2; ring.position.y=-.6; g.add(ring); g.userData.noSpin=[beamM,ring]; }
  else { const P=POWERUPS[type]; part(g,sphereG(.35,14,12),P.color,[0,0,0],null,.08); const ring=part(g,torusG(.55,.06,6,20),0xffffff,[0,0,0],[PI2,0,0],.1); g.userData.ring=ring;
    part(g,sphereG(.12,8,6),0xffffff,[-.12,.12,-.25],null,0); }
  g.position.copy(pos); scene.add(g);
  const p={type,g,pos:g.position,vel:o.pop?new THREE.Vector3(rng(-3,3),rng(5,8),rng(-3,3)):new THREE.Vector3(),t:rng(0,6),
    life:type==='weapon'?1e9:type==='coin'?25:30,weapon:o.weapon,baseY:pos.y,grounded:!o.pop,magnet:false};
  pickups.push(p); return p;
}
function updatePickups(dt){
  for(let i=pickups.length-1;i>=0;i--){ const p=pickups[i]; p.t+=dt; p.life-=dt;
    const dx=player.pos.x-p.pos.x, dz=player.pos.z-p.pos.z, dy=(player.pos.y+.9)-p.pos.y, d=Math.hypot(dx,dz);
    if(p.type==='coin' && (p.magnet || (d<player.magnet && p.t>.4))){ p.magnet=true; const l=Math.hypot(dx,dy,dz)||1; const s=Math.min(l,(10+p.t*4)*dt);
      p.pos.x+=dx/l*s; p.pos.y+=dy/l*s; p.pos.z+=dz/l*s; p.grounded=true; p.baseY=p.pos.y; }
    else if(!p.grounded){ p.vel.y-=20*dt; p.pos.addScaledVector(p.vel,dt); p.pos.x=clamp(p.pos.x,-ARENA+2,ARENA-2); p.pos.z=clamp(p.pos.z,-ARENA+2,ARENA-2);
      const gh=groundHeightAt(p.pos.x,p.pos.z,.2,p.pos.y); if(p.pos.y<gh+.5 && p.vel.y<0){ p.pos.y=gh+.5; p.vel.set(0,0,0); p.grounded=true; p.baseY=p.pos.y; } }
    else p.pos.y=p.baseY+Math.sin(p.t*3)*.15;
    p.g.rotation.y+=dt*2.5; if(p.g.userData.ring) p.g.userData.ring.rotation.y+=dt*4;
    p.g.visible = p.life>3 || Math.sin(p.t*20)>0;
    if(d<1.4 && Math.abs(dy)<1.7){ if(collectPickup(p)!==false){ scene.remove(p.g); pickups.splice(i,1); continue; } }
    if(p.life<=0){ scene.remove(p.g); pickups.splice(i,1); }
  }
}
function clearPickups(){ for(const p of pickups) scene.remove(p.g); pickups.length=0; }

// ================= 射击 =================
const ray=new THREE.Raycaster();
const gauss=()=>(Math.random()+Math.random()+Math.random()-1.5)/1.5;
function hitTargets(){ const a=world.solids.slice(); for(const e of enemies) if(!e.dead&&!e.demo&&e.spawnT>.3) a.push(e.mesh); a.push(groundMesh); return a; }
function aimDir(spread){ return new THREE.Vector3(gauss()*spread,gauss()*spread,-1).normalize().applyQuaternion(camera.quaternion); }
function traceColor(){ return vm.sk.rainbow? new THREE.Color().setHSL(Math.random(),1,.6).getHex() : vm.sk.trace; }
function fire(){
  const i=player.weapon, w=WEAPONS[i];
  if(player.cd>0||player.reloading>0||player.switchT>0) return;
  if(player.clip[i]<=0){ if(player.reserve[i]>0) startReload(); else { sfx('empty',200); player.cd=.25; tip('没有弹药了！按 1-5 切换武器'); } return; }
  if(!(pu.inf>0)) player.clip[i]--;
  player.cd=w.rate*(pu.haste>0?.65:1);
  w.snd(); player.recoil=1; player.recoilPitch+=w.kick*.012; addShake(w.shake);
  vm.flash.visible=true; vm.flash.scale.setScalar(rng(.8,1.4)*(w.pellets>1||w.type==='rocket'?1.7:1)); vm.fl.intensity=4; player.flashT=.05;
  const from=new THREE.Vector3(); vm.muzzle.getWorldPosition(from);
  const tcol=traceColor(); const targets=hitTargets();
  if(w.type==='rocket'){
    ray.set(camera.position,aimDir(0)); ray.far=200; const h=ray.intersectObjects(targets,false)[0];
    const tgt=h?h.point:camera.position.clone().addScaledVector(ray.ray.direction,100);
    const dir=tgt.sub(from).normalize();
    const m=new THREE.Group(); part(m,sphereG(.22,12,10),toon(vm.sk.a),[0,0,0],null,.12); part(m,coneG(.15,.3,8),toon(vm.sk.p),[0,0,.25],[-PI2,0,0]);
    m.position.copy(from); m.lookAt(from.clone().add(dir)); scene.add(m);
    pProj.push({m,pos:from.clone(),vel:dir.multiplyScalar(w.speed),life:4,w,tcol});
  } else if(w.type==='rail'){
    ray.set(camera.position,aimDir(0)); ray.far=w.range; const hits=ray.intersectObjects(targets,false);
    let end=camera.position.clone().addScaledVector(ray.ray.direction,w.range); const seen=new Set(); const dir=ray.ray.direction.clone().setY(0).normalize();
    for(const h of hits){ const e=h.object.userData.enemy;
      if(e){ if(!seen.has(e)){ seen.add(e); damageEnemy(e,w.dmg,h.point,dir,{byPlayer:true,canCrit:true,knock:w.knock}); burst(h.point,tcol,8,6); } continue; }
      if(h.object.userData.barrel) explodeBarrel(h.object.userData.barrel);
      end=h.point; const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):UP; splat(h.point,n,tcol,.5); burst(h.point,tcol,10,6); break; }
    beam(from,end,tcol,.14,.3); beam(from,end,0xffffff,.05,.22);
    for(let k=0;k<12;k++) burst(from.clone().lerp(end,Math.random()),tcol,1,1.5,.7,0);
  } else {
    const spread=w.spread+player.bloom+(player.moving?w.spread*.6:0);
    const agg=new Map();
    for(let k=0;k<w.pellets;k++){
      ray.set(camera.position,aimDir(spread)); ray.far=w.range;
      const h=ray.intersectObjects(targets,false)[0];
      const end=h?h.point:camera.position.clone().addScaledVector(ray.ray.direction,w.range);
      beam(from,end,tcol,w.pellets>1?.025:.045,.06);
      if(!h) continue;
      const e=h.object.userData.enemy;
      if(e){ if(e.dead) continue; const r=damageEnemy(e,w.dmg,h.point,ray.ray.direction.clone().setY(0).normalize(),{byPlayer:true,canCrit:true,knock:w.knock,noNum:w.pellets>1});
        if(w.pellets>1 && r){ const a=agg.get(e)||{sum:0,crit:false,pt:h.point.clone()}; a.sum+=r.dmg; a.crit=a.crit||r.crit; agg.set(e,a); } }
      else if(h.object.userData.barrel) explodeBarrel(h.object.userData.barrel);
      else { const n=h.face?h.face.normal.clone().transformDirection(h.object.matrixWorld):UP; splat(h.point,n,pick(CRATE_COLORS),rng(.12,.25)); burst(h.point,0xffffff,2,3,.6); }
    }
    for(const [e,a] of agg) dnum(a.pt,Math.round(a.sum)+(a.crit?'!':''),a.crit?'#ffe14d':'#ffffff',a.crit?36:28);
    if(w.bloom) player.bloom=Math.min(.05,player.bloom+w.bloom);
    if(w.pellets>1){ const back=new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion).setY(0).normalize(); player.vel.addScaledVector(back,player.onGround?3:6); }
  }
  if(player.clip[i]===0 && player.reserve[i]>0) later(.18,startReload);
}
function startReload(){
  const i=player.weapon, w=WEAPONS[i];
  if(player.reloading>0||player.clip[i]>=w.clip||player.reserve[i]<=0||player.switchT>0) return;
  player.reloading=player.reloadMax=w.reload*player.reloadMul; sfx('reload');
}
function switchWeapon(i){
  if(i<0||i>=WEAPONS.length||!player.owned[i]||i===player.weapon) return;
  player.weapon=i; player.reloading=0; player.switchT=.3; player.bloom=0; buildViewmodel(); sfx('swap'); tip(WEAPONS[i].name,1);
}
function cycleWeapon(dir){ for(let k=1;k<=WEAPONS.length;k++){ const j=(player.weapon+dir*k+WEAPONS.length*2)%WEAPONS.length; if(player.owned[j]){ switchWeapon(j); return; } } }
