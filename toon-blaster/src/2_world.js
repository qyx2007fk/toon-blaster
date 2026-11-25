
// ================= 世界 / 碰撞 =================
const ARENA = 48, STEP = .55;
const world = { group:new THREE.Group(), colliders:[], ramps:[], zones:[], traps:[], barrels:[], solids:[], anims:[], weather:null, level:null, spawn:new THREE.Vector3(0,0,34) };
scene.add(world.group);
let groundMesh = null;

function clearWorld(){
  scene.remove(world.group);
  world.group.traverse(o=>{ if(o.isMesh && o.material && o.material.userData.own) o.material.dispose(); });
  world.group = new THREE.Group(); scene.add(world.group);
  for(const k of ['colliders','ramps','zones','traps','barrels','solids','anims']) world[k].length = 0;
  world.weather = null;
}
function overlapRect(c,x,z,r){ return x+r>c.minX && x-r<c.maxX && z+r>c.minZ && z-r<c.maxZ; }
function rampH(rp,x,z){
  const tx=(x-rp.minX)/(rp.maxX-rp.minX), tz=(z-rp.minZ)/(rp.maxZ-rp.minZ);
  const t = rp.dir==='x+'?tx: rp.dir==='x-'?1-tx: rp.dir==='z+'?tz:1-tz;
  return rp.y0 + clamp(t,0,1)*rp.h;
}
function groundHeightAt(x,z,r,y){
  let h = 0;
  for(const c of world.colliders) if(!c.dead && c.top<=y+STEP && overlapRect(c,x,z,r)) h=Math.max(h,c.top);
  for(const rp of world.ramps) if(overlapRect(rp,x,z,0)){ const rh=rampH(rp,x,z); if(rh<=y+STEP) h=Math.max(h,rh); }
  return h;
}
function blocked(x,z,r,y){
  if(Math.abs(x)>ARENA-1-r || Math.abs(z)>ARENA-1-r) return true;
  for(const c of world.colliders) if(!c.dead && c.top>y+STEP && c.bottom<y+1.7 && overlapRect(c,x,z,r)) return true;
  for(const rp of world.ramps) if(overlapRect(rp,x,z,0) && rampH(rp,x,z)>y+STEP) return true;
  return false;
}
function pointInSolid(x,y,z){
  if(y<0) return true;
  for(const c of world.colliders) if(!c.dead && y<c.top && y>c.bottom && x>c.minX && x<c.maxX && z>c.minZ && z<c.maxZ) return true;
  for(const rp of world.ramps) if(overlapRect(rp,x,z,0) && y<rampH(rp,x,z)) return true;
  return false;
}
function inZone(zn,x,z,r=0){
  if(zn.shape==='circle') return Math.hypot(x-zn.x,z-zn.z) < zn.r + r;
  return Math.abs(x-zn.x) < zn.w/2 + r && Math.abs(z-zn.z) < zn.d/2 + r;
}
function isFree(x,z,r){
  if(Math.abs(x)>ARENA-2-r || Math.abs(z)>ARENA-2-r) return false;
  for(const c of world.colliders) if(overlapRect(c,x,z,r+.5)) return false;
  for(const rp of world.ramps) if(overlapRect(rp,x,z,r+.5)) return false;
  for(const zn of world.zones) if(inZone(zn,x,z,r+.5)) return false;
  if(Math.hypot(x-world.spawn.x, z-world.spawn.z) < 6) return false;
  return true;
}

// ================= 关卡构建器 =================
const B = {
  add(o){ world.group.add(o); return o; },
  box(x,z,w,h,d,color,y0=0,solid=true){
    const g = outlined(boxG(w,h,d), color, Math.min(.05, .08/Math.max(w,h,d)+.008));
    g.position.set(x,y0+h/2,z); this.add(g); world.solids.push(g.userData.body);
    const c = {minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,top:y0+h,bottom:y0};
    if(solid) world.colliders.push(c);
    return {g,c};
  },
  ramp(x,z,w,d,h,dir,color,y0=0){
    const len = dir[0]==='x'?w:d, wid = dir[0]==='x'?d:w;
    const sh = new THREE.Shape(); sh.moveTo(0,0); sh.lineTo(len,0); sh.lineTo(len,h); sh.lineTo(0,0);
    const geo = new THREE.ExtrudeGeometry(sh,{depth:wid,bevelEnabled:false}); geo.translate(-len/2,-h/2,-wid/2);
    const g = outlined(geo, color, .02);
    g.rotation.y = {'x+':0,'x-':Math.PI,'z+':-Math.PI/2,'z-':Math.PI/2}[dir];
    g.position.set(x,y0+h/2,z); this.add(g); world.solids.push(g.userData.body);
    world.ramps.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,h,dir,y0});
  },
  // 平台 + 坡道 sides: 'n','s','e','w'
  platform(x,z,w,d,h,color,sides=[],rampColor,y0=0){
    const r = this.box(x,z,w,d===undefined?w:d,h,color,y0);
    // fix: box(x,z,w,h,d)
    return r;
  },
  plat(x,z,w,d,h,color,sides=[],rampColor=null,y0=0){
    this.box(x,z,w,h,d,color,y0);
    const top = this.box(x,z,w+.3,.25,d+.3,rampColor??shade(color,1.25),y0+h-.12,false);
    top.c.top = y0+h; 
    const L = Math.max(3,(h)*2.6), rc = rampColor??shade(color,.85);
    for(const s of sides){
      const rw = Math.min(4, (s==='n'||s==='s')?w:d);
      if(s==='s') this.ramp(x, z+d/2+L/2, rw, L, h, 'z-', rc, y0);
      if(s==='n') this.ramp(x, z-d/2-L/2, rw, L, h, 'z+', rc, y0);
      if(s==='e') this.ramp(x+w/2+L/2, z, L, rw, h, 'x-', rc, y0);
      if(s==='w') this.ramp(x-w/2-L/2, z, L, rw, h, 'x+', rc, y0);
    }
  },
  collider(x,z,hw,hd,top){ world.colliders.push({minX:x-hw,maxX:x+hw,minZ:z-hd,maxZ:z+hd,top,bottom:0}); },
  solid(g){ g.traverse(o=>{ if(o.isMesh && o.material!==outlineMat) world.solids.push(o); }); },
  scatter(n, r, fn, tries=40){
    for(let i=0;i<n;i++) for(let k=0;k<tries;k++){
      const x=rng(-ARENA+4,ARENA-4), z=rng(-ARENA+4,ARENA-4);
      if(isFree(x,z,r)){ fn(x,z); break; }
    }
  },
  // ---------- 道具/装饰 ----------
  tree(x,z,s=1){
    const t=new THREE.Group();
    part(t,cylG(.35*s,.45*s,2.4*s,10),0x8b5a2b,[0,1.2*s,0]);
    part(t,sphereG(1.6*s,14,12),0x3ec43e,[0,3.3*s,0]);
    part(t,sphereG(1.1*s,14,12),0x5ee05e,[.6*s,4.4*s,.2*s]);
    t.position.set(x,0,z); t.rotation.y=rng(0,6); this.add(t); this.solid(t); this.collider(x,z,.5*s,.5*s,6*s);
  },
  pine(x,z,s=1,snow=false){
    const t=new THREE.Group();
    part(t,cylG(.3*s,.4*s,1.6*s,8),0x7a4a26,[0,.8*s,0]);
    for(let i=0;i<3;i++){ part(t,coneG((1.8-i*.45)*s,(1.9-i*.3)*s,9),i%2?0x1e8449:0x239b56,[0,(2.1+i*1.15)*s,0]);
      if(snow) part(t,coneG((.9-i*.2)*s,(.7)*s,9),0xffffff,[0,(2.75+i*1.15)*s,0]); }
    t.position.set(x,0,z); this.add(t); this.solid(t); this.collider(x,z,.6*s,.6*s,6*s);
  },
  cactus(x,z,s=1){
    const t=new THREE.Group(), c=0x2fa84f;
    part(t,cylG(.4*s,.45*s,3*s,10),c,[0,1.5*s,0]); part(t,sphereG(.4*s,10,8),c,[0,3*s,0]);
    part(t,cylG(.22*s,.22*s,1.1*s,8),c,[.75*s,1.7*s,0]); part(t,cylG(.22*s,.22*s,.6*s,8),c,[.45*s,1.4*s,0],[0,0,Math.PI/2]);
    part(t,cylG(.2*s,.2*s,.9*s,8),c,[-.7*s,2.1*s,0]); part(t,cylG(.2*s,.2*s,.5*s,8),c,[-.42*s,1.8*s,0],[0,0,Math.PI/2]);
    part(t,sphereG(.2*s,8,6),0xff6bb5,[0,3.35*s,0]);
    t.position.set(x,0,z); t.rotation.y=rng(0,6); this.add(t); this.solid(t); this.collider(x,z,.5*s,.5*s,3.4*s);
  },
  rock(x,z,s=1,color=0x9a8c7a){
    const g=outlined(G('dod'+f2(s),()=>new THREE.DodecahedronGeometry(s,0)),color,.04);
    g.position.set(x,s*.6,z); g.rotation.set(rng(0,3),rng(0,3),0); g.scale.y=.75; this.add(g); world.solids.push(g.userData.body);
    this.collider(x,z,s*.75,s*.75,s*1.2);
  },
  snowman(x,z){
    const t=new THREE.Group();
    part(t,sphereG(1,14,12),0xffffff,[0,.9,0]); part(t,sphereG(.72,14,12),0xffffff,[0,2.2,0]); part(t,sphereG(.5,14,12),0xffffff,[0,3.2,0]);
    part(t,coneG(.1,.6,8),0xff8c1a,[0,3.2,-.75],[-Math.PI/2,0,0]);
    for(const s of [-1,1]){ part(t,sphereG(.07,6,6),0x111111,[s*.18,3.35,-.44]); part(t,cylG(.04,.04,1.2,5),0x7a4a26,[s*1.1,2.4,0],[0,0,s*1.0]); }
    part(t,cylG(.38,.38,.45,12),0x222222,[0,3.75,0]); part(t,cylG(.55,.55,.06,12),0x222222,[0,3.55,0]);
    part(t,torusG(.52,.1,6,14),0xe74c3c,[0,2.75,0],[Math.PI/2,0,0]);
    t.position.set(x,0,z); t.rotation.y=rng(-.8,.8)+Math.PI; this.add(t); this.solid(t); this.collider(x,z,.9,.9,4);
  },
  lollipop(x,z,s=1){
    const t=new THREE.Group(); const cols=[[0xff6b81,0xffffff],[0x54a0ff,0xfeca57],[0x1dd1a1,0xff9ff3]][rint(0,2)];
    part(t,cylG(.12*s,.12*s,4*s,8),0xffffff,[0,2*s,0]);
    const head=new THREE.Group(); head.position.y=4.6*s; t.add(head);
    part(head,cylG(1.3*s,1.3*s,.3*s,20),cols[0],[0,0,0],[Math.PI/2,0,0]);
    for(let i=1;i<=3;i++) part(head,torusG(i*.32*s,.08*s,6,20),cols[1],[0,0,-.16*s]);
    t.position.set(x,0,z); t.rotation.y=rng(0,6); this.add(t); this.solid(t); this.collider(x,z,.4*s,.4*s,6*s);
    world.anims.push(dt=>{ head.rotation.z+=dt*.5; });
  },
  donut(x,z){
    const t=new THREE.Group(), rot=rng(0,Math.PI);
    part(t,torusG(1.6,.75,12,24),0xe0a96d,[0,2.35,0]);
    const fr=part(t,torusG(1.6,.62,10,24,Math.PI),pick([0xff6bb5,0x8e5cff,0x5ce1ff]),[0,2.45,-.18]); fr.scale.z=.9;
    for(let i=0;i<10;i++){ const a=rng(0,Math.PI); part(t,boxG(.25,.07,.07),pick([0xffffff,0xfeca57,0x1dd1a1,0xff4757]),[Math.cos(a)*1.6,2.35+Math.sin(a)*1.6,-.75],[0,0,rng(0,3)]); }
    t.position.set(x,0,z); t.rotation.y=rot; this.add(t); this.solid(t);
    const hw=Math.abs(Math.cos(rot))*2.3+.5, hd=Math.abs(Math.sin(rot))*2.3+.5; this.collider(x,z,hw,hd,4.6);
  },
  gumdrop(x,z){
    const s=rng(.7,1.3), g=outlined(sphereG(1*s,14,10),pick([0xff4757,0x2ed573,0xffa502,0x70a1ff,0xeccc68]),.05);
    g.scale.y=1.2; g.position.set(x,.5*s,z); this.add(g); world.solids.push(g.userData.body); this.collider(x,z,.8*s,.8*s,1.6*s);
  },
  crate(x,z,s,color){
    const h = Math.random()<.3? s*2 : s;
    const {g} = this.box(x,z,s,h,s,color);
    g.rotation.y = 0;
  },
  crystal(x,z){
    const t=new THREE.Group(); const c=pick([0xff4d4d,0xff9f1a,0xff3f6c]);
    for(let i=0;i<4;i++){ const m=new THREE.Mesh(G('oct',()=>new THREE.OctahedronGeometry(1,0)),new THREE.MeshBasicMaterial({color:c}));
      const o=new THREE.Mesh(m.geometry,outlineMat); o.scale.setScalar(1.08); const g=new THREE.Group(); g.add(m,o);
      g.scale.set(.4,rng(1,2.2),.4); g.position.set(rng(-.6,.6),g.scale.y*.8,rng(-.6,.6)); g.rotation.set(rng(-.3,.3),0,rng(-.3,.3)); t.add(g); world.solids.push(m); }
    t.position.set(x,0,z); this.add(t); this.collider(x,z,.9,.9,3);
  },
  barrel(x,z){
    const t=new THREE.Group();
    const body=part(t,cylG(.55,.55,1.25,14),0xe23b3b,[0,.625,0]);
    part(t,torusG(.56,.06,6,18),0xffd93d,[0,.35,0],[Math.PI/2,0,0]); part(t,torusG(.56,.06,6,18),0xffd93d,[0,.9,0],[Math.PI/2,0,0]);
    part(t,boxG(.5,.08,.1),0xffffff,[0,.62,-.56]); part(t,boxG(.1,.4,.1),0xffffff,[0,.62,-.56]);
    t.position.set(x,0,z); this.add(t);
    const c={minX:x-.55,maxX:x+.55,minZ:z-.55,maxZ:z+.55,top:1.25,bottom:0}; world.colliders.push(c);
    const b={g:t,c,x,z,alive:true}; body.userData.body.userData.barrel=b; world.solids.push(body.userData.body); world.barrels.push(b);
  },
  // ---------- 机关 ----------
  jump(x,z,y=0){
    const t=new THREE.Group();
    part(t,cylG(1.2,1.3,.3,18),0x555577,[0,.15,0]);
    const top=part(t,cylG(1,1,.15,18),0x5cff8a,[0,.35,0]);
    part(t,coneG(.4,.35,4),0xffffff,[0,.5,0]);
    t.position.set(x,y,z); this.add(t);
    const zn={type:'jump',shape:'circle',x,z,r:1.1,y:y+.4,anim:0,top}; world.zones.push(zn);
    world.colliders.push({minX:x-1.1,maxX:x+1.1,minZ:z-1.1,maxZ:z+1.1,top:y+.4,bottom:y});
  },
  speed(x,z,ang){
    const t=new THREE.Group();
    part(t,boxG(2.6,.08,4.4),0x34495e,[0,.04,0]);
    const ch=[]; for(let i=0;i<3;i++){ const c=new THREE.Group(); for(const s of [-1,1]){ const b=new THREE.Mesh(boxG(1.1,.05,.3),new THREE.MeshBasicMaterial({color:0x00e5ff})); b.position.set(s*.42,0,0); b.rotation.y=-s*.6; c.add(b);} c.position.set(0,.1,1.2-i*1.2); t.add(c); ch.push(c); }
    t.position.set(x,0,z); t.rotation.y=ang; this.add(t);
    const dx=-Math.sin(ang), dz=-Math.cos(ang);
    const zn={type:'speed',shape:'rect',x,z,w:Math.abs(Math.cos(ang))*2.6+Math.abs(Math.sin(ang))*4.4,d:Math.abs(Math.sin(ang))*2.6+Math.abs(Math.cos(ang))*4.4,y:0,dx,dz,cd:0,ch}; world.zones.push(zn);
  },
  spikes(x,z){
    const t=new THREE.Group();
    part(t,boxG(3,.12,3),0x7f8c8d,[0,.06,0]);
    const sp=new THREE.Group(); t.add(sp);
    for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++) part(sp,coneG(.3,.9,6),0xdfe6e9,[i*.95,.45,j*.95]);
    sp.position.y=-.8; t.position.set(x,0,z); this.add(t);
    world.zones.push({type:'spikes',shape:'rect',x,z,w:3,d:3,y:0,sp,off:rng(0,3),up:false,t:0});
  },
  saw(ax,az,bx,bz,speed=1){
    const t=new THREE.Group();
    const disc=new THREE.Group(); t.add(disc);
    part(disc,cylG(1.1,1.1,.12,20),0xbdc3c7,[0,0,0],[Math.PI/2,0,0]);
    for(let i=0;i<10;i++){ const a=i/10*Math.PI*2; part(disc,coneG(.18,.4,4),0xecf0f1,[Math.cos(a)*1.2,Math.sin(a)*1.2,0],[0,0,a-Math.PI/2]); }
    part(disc,cylG(.3,.3,.2,10),0xe74c3c,[0,0,0],[Math.PI/2,0,0]);
    const rail=part(t,boxG(.2,.1,1),0x2d3436,[0,-.8,0]); 
    this.add(t);
    const len=Math.hypot(bx-ax,bz-az), ang=Math.atan2(bx-ax,bz-az);
    const track=outlined(boxG(.35,.06,len+2.4),0x2d3436,.02); track.position.set((ax+bx)/2,.03,(az+bz)/2); track.rotation.y=ang; this.add(track);
    t.rotation.y=ang+Math.PI/2; rail.visible=false;
    world.traps.push({type:'saw',g:t,disc,a:new THREE.Vector3(ax,1,az),b:new THREE.Vector3(bx,1,bz),speed,t:rng(0,6),pos:new THREE.Vector3()});
  },
  lava(x,z,r){
    const mat=new THREE.MeshBasicMaterial({color:0xff5a1f}); mat.userData.own=true;
    const m=new THREE.Mesh(new THREE.CircleGeometry(r,28),mat); m.rotation.x=-Math.PI/2; m.position.set(x,.04,z); this.add(m);
    const rim=new THREE.Mesh(new THREE.RingGeometry(r,r+.35,28),basic(0x1a1016)); rim.rotation.x=-Math.PI/2; rim.position.set(x,.05,z); this.add(rim);
    const inner=new THREE.Mesh(new THREE.CircleGeometry(r*.55,20),basic(0xffc83d)); inner.rotation.x=-Math.PI/2; inner.position.set(x,.045,z); this.add(inner);
    world.zones.push({type:'lava',shape:'circle',x,z,r,y:0,mat,inner,t:rng(0,6)});
  },
  lavaRect(x,z,w,d){
    const mat=new THREE.MeshBasicMaterial({color:0xff5a1f}); mat.userData.own=true;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat); m.rotation.x=-Math.PI/2; m.position.set(x,.04,z); this.add(m);
    world.zones.push({type:'lava',shape:'rect',x,z,w,d,y:0,mat,t:0});
  },
  ice(x,z,r){
    const m=new THREE.Mesh(new THREE.CircleGeometry(r,32),new THREE.MeshToonMaterial({color:0xa8e6ff,gradientMap:grad,emissive:0x2266aa,emissiveIntensity:.25}));
    m.material.userData.own=true; m.rotation.x=-Math.PI/2; m.position.set(x,.03,z); m.receiveShadow=true; this.add(m);
    for(let i=0;i<5;i++){ const s=new THREE.Mesh(boxG(rng(1,r*.8),.01,.12),basic(0xffffff)); s.position.set(x+rng(-r*.6,r*.6),.04,z+rng(-r*.6,r*.6)); s.rotation.y=rng(0,3); this.add(s); }
    world.zones.push({type:'ice',shape:'circle',x,z,r,y:0});
  },
  heal(x,z,y=0){
    const t=new THREE.Group();
    part(t,cylG(1.5,1.6,.2,20),0xffffff,[0,.1,0]);
    const glow=new THREE.Mesh(cylG(1.25,1.25,.05,20),new THREE.MeshBasicMaterial({color:0x2ecc71,transparent:true,opacity:.9})); glow.position.y=.23; t.add(glow);
    const cross=new THREE.Group(); cross.position.y=1.4; t.add(cross);
    part(cross,boxG(.9,.3,.3),0x2ecc71); part(cross,boxG(.3,.9,.3),0x2ecc71);
    t.position.set(x,y,z); this.add(t);
    world.zones.push({type:'heal',shape:'circle',x,z,r:1.4,y,charge:60,max:60,glow,cross});
  },
  tele(ax,az,bx,bz,color=0xb26bff){
    const mk=(x,z)=>{ const t=new THREE.Group(); part(t,cylG(1.3,1.4,.2,20),0x2d3436,[0,.1,0]);
      const disc=new THREE.Mesh(cylG(1.1,1.1,.05,20),new THREE.MeshBasicMaterial({color})); disc.position.y=.23; t.add(disc);
      const ring=part(t,torusG(1.1,.1,8,24),color,[0,1.6,0],[Math.PI/2,0,0]); t.position.set(x,0,z); this.add(t);
      const zn={type:'tele',shape:'circle',x,z,r:.9,y:0,ring,color}; world.zones.push(zn); return zn; };
    const a=mk(ax,az), b=mk(bx,bz); a.pair=b; b.pair=a;
  },
  fire(x,z){
    const t=new THREE.Group();
    part(t,cylG(.9,1.1,.35,12),0x3d3d3d,[0,.17,0]);
    part(t,cylG(.5,.5,.38,12),0x111111,[0,.2,0]);
    const fl=new THREE.Group(); t.add(fl);
    [[.7,2.2,0xff5a1f],[.5,3.2,0xff9f1a],[.3,3.8,0xffe14d]].forEach(([r,h,c])=>{ const m=new THREE.Mesh(coneG(r,h,10),new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.92})); m.position.y=h/2; fl.add(m); });
    fl.visible=false; t.position.set(x,0,z); this.add(t);
    world.colliders.push({minX:x-.9,maxX:x+.9,minZ:z-.9,maxZ:z+.9,top:.35,bottom:0});
    world.zones.push({type:'fire',shape:'circle',x,z,r:1.1,y:0,fl,off:rng(0,4),active:false,t:0});
  },
  far(n, fn){ for(let i=0;i<n;i++){ const a=i/n*Math.PI*2+rng(-.15,.15), d=rng(68,95); fn(Math.cos(a)*d, Math.sin(a)*d, i); } },
  clouds(n,color=0xffffff,y=[28,40]){
    for(let i=0;i<n;i++){ const c=new THREE.Group(); const m=toon(color);
      for(let j=0;j<4;j++){ const s=new THREE.Mesh(sphereG(rng(2,3.5),12,10),m); s.position.set(j*2.5-4,rng(-.5,.5),rng(-1,1)); c.add(s); }
      c.position.set(rng(-100,100),rng(y[0],y[1]),rng(-100,100)); this.add(c);
      const sp=rng(1,2); world.anims.push(dt=>{ c.position.x+=dt*sp; if(c.position.x>110) c.position.x=-110; });
    }
  },
  weather(kind){
    const N = kind==='snow'?1500: kind==='embers'?600: 500;
    const pos=new Float32Array(N*3), spd=new Float32Array(N);
    for(let i=0;i<N;i++){ pos[i*3]=rng(-60,60); pos[i*3+1]=rng(0,40); pos[i*3+2]=rng(-60,60); spd[i]=rng(.6,1.4); }
    const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const col = kind==='snow'?0xffffff: kind==='embers'?0xff8a2a: 0xff9ff3;
    const mat=new THREE.PointsMaterial({color:col,size:kind==='snow'?.22:.18,transparent:true,opacity:.9}); mat.userData.own=true;
    const pts=new THREE.Points(geo,mat); this.add(pts);
    world.weather={kind,pts,spd,N};
  },
};
function shade(c,k){ const col=new THREE.Color(c); col.multiplyScalar(k); return col.getHex(); }

function updateWeather(dt,t){
  const w=world.weather; if(!w) return;
  const p=w.pts.geometry.attributes.position.array;
  for(let i=0;i<w.N;i++){
    if(w.kind==='embers'){ p[i*3+1]+=dt*2*w.spd[i]; p[i*3]+=Math.sin(t+i)*dt*.5; if(p[i*3+1]>40) p[i*3+1]=0; }
    else { p[i*3+1]-=dt*(w.kind==='snow'?2.5:1.8)*w.spd[i]; p[i*3]+=Math.sin(t*.8+i)*dt*.6; if(p[i*3+1]<0) p[i*3+1]=40; }
  }
  w.pts.geometry.attributes.position.needsUpdate=true;
  w.pts.position.set(Math.round(camera.position.x/10)*10*0, 0, 0);
}

// ================= 关卡数据 =================
const CRATE_COLORS = [0xff6b6b,0x4ecdc4,0xffe66d,0xa66cff,0xff9ff3,0x54a0ff];
const LEVELS = [
  { name:'青青草原', boss:'果冻大王', bossColor:0xff3f6c, sky:0x8fd8ff, fog:[45,120], ground:0x7ed957, patch:0x6cc94a, wall:0xffb347,
    hemi:[0xffffff,0x88aa66,.9], sunC:0xffffff, sunI:1.6,
    waves:[ [['jelly',6]], [['jelly',6],['runner',4]], [['jelly',5],['runner',4],['splitter',3]] ],
    build(){
      B.plat(0,0,10,10,2.2,0xc8a26b,['s','n'],0x9b7a4b);
      B.plat(-26,-16,7,7,1.6,0xc8a26b,['e']); B.plat(26,-16,7,7,1.6,0xc8a26b,['w']);
      B.jump(-12,10); B.jump(12,10); B.jump(0,-26);
      B.heal(-32,28);
      [[-16,-4],[16,-4],[-6,22],[8,-36],[-30,6],[34,10]].forEach(([x,z])=>{ B.barrel(x,z); if(Math.random()<.6) B.barrel(x+1.3,z+.4); });
      B.scatter(14,2,(x,z)=>B.crate(x,z,rng(1.5,3.2),pick(CRATE_COLORS)));
      B.scatter(14,1.5,(x,z)=>B.tree(x,z,rng(.8,1.2)));
      B.far(16,(x,z)=>{ const s=rng(10,20); const h=outlined(sphereG(s,16,12),pick([0x5ec24a,0x4fb33d,0x6fd35b]),.01); h.position.set(x,-s*.35,z); B.add(h); });
      B.clouds(14);
      return {weaponPos:[0,2.2,0]};
    }},
  { name:'沙漠峡谷', boss:'仙人掌霸王', bossColor:0x27ae60, sky:0xffd59e, fog:[40,115], ground:0xf6c87a, patch:0xe8b35e, wall:0xc96f3b,
    hemi:[0xfff2dd,0xc98a4a,.95], sunC:0xfff0d0, sunI:1.8,
    waves:[ [['jelly',5],['spitter',3]], [['runner',5],['bomber',4],['spitter',3]], [['jelly',4],['bomber',5],['spitter',4],['splitter',2]] ],
    build(){
      B.plat(-20,-10,8,12,3,0xd9824b,['e','s'],0xc0703d);
      B.plat(22,-6,10,8,3.4,0xd9824b,['w','s'],0xc0703d);
      B.plat(0,-30,14,6,2.4,0xd9824b,['s'],0xc0703d);
      [[0,4],[-8,14],[10,14],[-30,20],[30,22],[0,-16]].forEach(([x,z])=>B.spikes(x,z));
      B.speed(-36,0,0); B.speed(36,0,Math.PI); B.speed(0,20,Math.PI/2); B.speed(-14,-36,-Math.PI/2);
      B.heal(34,34);
      [[-10,-20],[12,-20],[28,8],[-30,-30],[18,36]].forEach(([x,z])=>B.barrel(x,z));
      B.scatter(16,1,(x,z)=>B.cactus(x,z,rng(.8,1.3)));
      B.scatter(10,2,(x,z)=>B.rock(x,z,rng(1,2.2),pick([0xc98a4a,0xb5793d,0xd99a5b])));
      B.far(14,(x,z)=>{ const w=rng(14,26),h=rng(12,26); const m=outlined(boxG(w,h,w*.8),pick([0xc0603b,0xd9824b,0xb5532f]),.01); m.position.set(x,h/2-2,z); m.rotation.y=rng(0,3); B.add(m);
        const cap=outlined(boxG(w*1.05,2,w*.85),0xe8a26b,.01); cap.position.set(x,h-2,z); cap.rotation.y=m.rotation.y; B.add(cap); });
      B.clouds(6,0xfff6e8,[35,45]);
      return {weaponPos:[22,3.4,-6]};
    }},
  { name:'冰雪王国', boss:'冰霜巨怪', bossColor:0x74b9ff, sky:0xcfe9ff, fog:[35,105], ground:0xf2f8ff, patch:0xdbeeff, wall:0x8fb8e8,
    hemi:[0xffffff,0x9ec9ff,1.0], sunC:0xeaf4ff, sunI:1.4,
    waves:[ [['jelly',5],['bat',4]], [['bat',5],['runner',4],['tank',1]], [['bat',4],['spitter',3],['tank',2],['splitter',2]] ],
    build(){
      B.ice(0,8,10); B.ice(-28,24,7); B.ice(28,26,6); B.ice(-24,-34,6); B.ice(30,-34,5);
      B.plat(-18,-16,8,8,3,0xdfe9f5,['s'],0xc5d6ea); B.plat(18,-16,8,8,3,0xdfe9f5,['s'],0xc5d6ea);
      B.box(0,-16,28,.6,3,0xa0c4ff,2.4); 
      B.saw(-10,-4,10,-4,.9); B.saw(-36,8,-36,-20,.7); B.saw(36,8,36,-20,.8);
      B.jump(-8,30); B.jump(14,36);
      B.heal(0,-34);
      [[-6,-26],[6,-26],[-38,34]].forEach(([x,z])=>B.barrel(x,z));
      B.scatter(18,1.2,(x,z)=>B.pine(x,z,rng(.8,1.3),true));
      B.scatter(6,1.2,(x,z)=>B.snowman(x,z));
      B.far(16,(x,z)=>{ const r=rng(10,18),h=rng(22,40); const m=outlined(coneG(r,h,7),0x9bb7d9,.01); m.position.set(x,h/2-2,z); B.add(m);
        const cap=outlined(coneG(r*.42,h*.42,7),0xffffff,.01); cap.position.set(x,h-2-h*.21+.2,z); B.add(cap); });
      B.weather('snow');
      return {weaponPos:[18,3,-16]};
    }},
  { name:'糖果乐园', boss:'糖果魔王', bossColor:0xff6bb5, sky:0xffd0f0, fog:[40,115], ground:0xffb8dc, patch:0xff9fcf, wall:0xff6fa8,
    hemi:[0xffffff,0xff9ccc,1.0], sunC:0xfff0f8, sunI:1.5,
    waves:[ [['jelly',6],['runner',4],['bat',2]], [['splitter',3],['spitter',3],['bomber',4]], [['tank',2],['bat',4],['runner',5],['bomber',3]] ],
    build(){
      B.plat(0,0,12,12,2,0x8b5a3c,['s','n','e','w'],0xffe0f0);
      B.plat(0,0,6,6,2,0xff8fc7,[],0xfff0f8,2);
      B.ramp(0,4.5,2.4,3,2,'z-',0xfff0f8,2);
      part(world.group,sphereG(.8,14,12),0xe3002b,[0,4.6,0]);
      B.tele(-36,-36,36,36,0xb26bff); B.tele(36,-36,-36,36,0x2ed6ff);
      B.saw(-20,-10,-20,14,1); B.saw(20,-14,20,10,1.1); B.saw(-8,26,10,26,.9); B.saw(-10,-26,12,-26,.8);
      B.jump(-30,0); B.jump(30,0); B.jump(0,-38); B.jump(0,24);
      B.heal(-40,0);
      [[14,16],[-14,-16],[26,-30]].forEach(([x,z])=>B.barrel(x,z));
      B.scatter(10,1,(x,z)=>B.lollipop(x,z,rng(.8,1.2)));
      B.scatter(5,2.5,(x,z)=>B.donut(x,z));
      B.scatter(12,1.2,(x,z)=>B.gumdrop(x,z));
      B.far(14,(x,z)=>{ const s=rng(1.5,3); const t=new THREE.Group();
        part(t,coneG(3*s,9*s,12),0xe0a96d,[0,4.5*s,0],[Math.PI,0,0],.01); part(t,sphereG(3.3*s,14,12),pick([0xff9ff3,0xfeca57,0x7bed9f,0xffffff]),[0,9.5*s,0],null,.01);
        t.position.set(x,0,z); B.add(t); });
      B.clouds(12,0xffe3f6);
      B.weather('petals');
      return {weaponPos:[0,4,0]};
    }},
  { name:'熔岩火山', boss:'熔岩领主', bossColor:0xff7a00, sky:0x4a2233, fog:[30,95], ground:0x4a3f4f, patch:0x3c3242, wall:0x2d2433,
    hemi:[0xffb38a,0x402030,.85], sunC:0xffa070, sunI:1.3,
    waves:[ [['jelly',5],['bomber',4],['bat',3]], [['tank',2],['spitter',4],['runner',5]], [['splitter',3],['bomber',4],['bat',4],['tank',2],['spitter',2]] ],
    build(){
      B.lavaRect(0,-6,96,5);
      B.box(-24,-6,4,.4,7,0x5d5163); B.box(0,-6,4,.4,7,0x5d5163); B.box(24,-6,4,.4,7,0x5d5163);
      B.lava(-28,18,4.5); B.lava(26,22,5); B.lava(0,30,3.5); B.lava(-30,-30,5); B.lava(28,-28,4);
      [[-14,14],[14,14],[-10,-22],[12,-22],[0,-38],[-38,4]].forEach(([x,z])=>B.fire(x,z));
      B.plat(-12,-34,8,6,2.6,0x5d5163,['s'],0x6d6173); B.plat(36,-14,6,10,2.2,0x5d5163,['w'],0x6d6173); B.plat(0,16,8,8,2,0x5d5163,['s','n'],0x6d6173);
      B.heal(-40,36); B.heal(40,38);
      [[-6,8],[8,8],[-20,-16],[20,-16],[30,4],[-34,-14],[10,38],[-16,38]].forEach(([x,z])=>B.barrel(x,z));
      B.scatter(10,2,(x,z)=>B.rock(x,z,rng(1.2,2.4),pick([0x2b2230,0x3a2f3f,0x4b3f52])));
      B.scatter(6,1,(x,z)=>B.crystal(x,z));
      B.far(8,(x,z)=>{ const r=rng(18,26),h=rng(26,40); const m=outlined(cylG(r*.25,r,h,10),0x2b1f2b,.01); m.position.set(x,h/2-2,z); B.add(m);
        const top=new THREE.Mesh(cylG(r*.22,r*.22,.5,10),basic(0xff6a1f)); top.position.set(x,h-1.7,z); B.add(top); });
      B.clouds(8,0x3a2a33,[30,40]);
      B.weather('embers');
      return {weaponPos:[0,2,16]};
    }},
];

function buildLevel(idx){
  clearWorld();
  const L = LEVELS[idx % LEVELS.length]; world.level = L; world.levelIdx = idx;
  scene.background = new THREE.Color(L.sky); scene.fog.color.set(L.sky); scene.fog.near=L.fog[0]; scene.fog.far=L.fog[1];
  hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity=L.hemi[2];
  sun.color.set(L.sunC); sun.intensity=L.sunI;
  world.spawn.set(0,0,36);
  groundMesh = new THREE.Mesh(new THREE.CircleGeometry(140,64), toon(L.ground));
  groundMesh.rotation.x = -Math.PI/2; groundMesh.receiveShadow = true; B.add(groundMesh);
  for(let i=0;i<50;i++){ const p=new THREE.Mesh(G('patch'+(i%6),()=>new THREE.CircleGeometry(1+(i%6)*.45,16)), toon(L.patch)); p.rotation.x=-Math.PI/2; p.position.set(rng(-ARENA,ARENA),.012,rng(-ARENA,ARENA)); p.receiveShadow=true; B.add(p); }
  const wc=L.wall;
  B.box(0,-ARENA,ARENA*2+2,4,2,wc); B.box(0,ARENA,ARENA*2+2,4,2,wc); B.box(-ARENA,0,2,4,ARENA*2,wc); B.box(ARENA,0,2,4,ARENA*2,wc);
  for(let i=-ARENA;i<=ARENA;i+=8){ for(const [x,z] of [[i,-ARENA],[i,ARENA],[-ARENA,i],[ARENA,i]]){ const p=outlined(sphereG(.7,10,8),shade(wc,1.2),.06); p.position.set(x,4.2,z); B.add(p);} }
  const info = L.build() || {};
  world.weaponPos = info.weaponPos || [0,0,0];
  return L;
}

function updateWorld(dt,t){
  for(const a of world.anims) a(dt,t);
  for(const zn of world.zones){
    switch(zn.type){
      case 'jump': zn.anim=Math.max(0,zn.anim-dt*4); zn.top.scale.y=1+zn.anim*2; zn.top.position.y=.35+zn.anim*.3; break;
      case 'speed': zn.cd-=dt; zn.ch.forEach((c,i)=>c.children.forEach(b=>b.material.color.setHex(((t*4-i)%3+3)%3<1?0xffffff:0x00e5ff))); break;
      case 'spikes': { zn.t+=dt; const c=(zn.t+zn.off)%3.2; zn.up = c>2.2 && c<3.0; const warn = c>1.7&&c<=2.2;
        const ty = zn.up?0: warn? -.55+Math.sin(t*60)*.05 : -.8; zn.sp.position.y += (ty-zn.sp.position.y)*Math.min(1,dt*(zn.up?30:8)); break; }
      case 'fire': { zn.t+=dt; const c=(zn.t+zn.off)%4.5; zn.active = c>3; zn.fl.visible=zn.active;
        if(zn.active){ zn.fl.scale.set(1+Math.sin(t*30)*.1,1+Math.sin(t*23)*.15,1+Math.cos(t*30)*.1); if(Math.random()<dt*20) burst(new THREE.Vector3(zn.x+rng(-.3,.3),rng(1,4),zn.z+rng(-.3,.3)),pick([0xff9f1a,0xffe14d]),1,3); }
        else if(c>2.2 && Math.random()<dt*15) burst(new THREE.Vector3(zn.x,.5,zn.z),0x555555,1,2.5); break; }
      case 'lava': { zn.t+=dt; zn.mat.color.setHSL(.04+Math.sin(zn.t*2)*.015,1,.52+Math.sin(zn.t*3)*.05); if(zn.inner) zn.inner.scale.setScalar(1+Math.sin(zn.t*1.7)*.1);
        if(Math.random()<dt*(zn.shape==='circle'?2:6)){ const p= zn.shape==='circle'? [zn.x+rng(-zn.r,zn.r)*.7,zn.z+rng(-zn.r,zn.r)*.7] : [zn.x+rng(-zn.w/2,zn.w/2),zn.z+rng(-zn.d/2,zn.d/2)];
          burst(new THREE.Vector3(p[0],.1,p[1]),pick([0xff9f1a,0xffe14d,0xff5a1f]),3,3); } break; }
      case 'heal': { if(!zn.using) zn.charge=Math.min(zn.max,zn.charge+dt*3); zn.using=false; const k=zn.charge/zn.max;
        zn.glow.material.opacity=.25+k*.7; zn.cross.rotation.y+=dt*2; zn.cross.position.y=1.4+Math.sin(t*3)*.15; zn.cross.scale.setScalar(.4+k*.6); break; }
      case 'tele': zn.ring.rotation.z+=dt*2; zn.ring.position.y=1.6+Math.sin(t*2+zn.x)*.2; if(Math.random()<dt*6) burst(new THREE.Vector3(zn.x+rng(-1,1),.3,zn.z+rng(-1,1)),zn.color,1,2); break;
    }
  }
  for(const tr of world.traps){
    if(tr.type==='saw'){ tr.t+=dt*tr.speed; const k=(Math.sin(tr.t)+1)/2; tr.pos.lerpVectors(tr.a,tr.b,k); tr.g.position.copy(tr.pos).setY(1.15); tr.disc.rotation.z-=dt*18; }
  }
  updateWeather(dt,t);
}
