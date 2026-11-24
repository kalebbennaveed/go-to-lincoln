const east=111320*Math.cos(40.81*Math.PI/180);
const locations=[
  ['Nebraska State Capitol','Capitol District',-96.69965,40.80808],
  ['Historic Haymarket','Haymarket',-96.71005,40.81493],
  ['Memorial Stadium','University of Nebraska',-96.70564,40.82066],
  ['Pinnacle Bank Arena','West Haymarket',-96.71250,40.81797],
  ['Sunken Gardens','Near South',-96.68347,40.80224]
];
export const places=locations.map(([name,district,lon,lat],i)=>({id:i,name,district,x:(lon+96.7)*east,z:(40.81-lat)*111320}));
export const distanceText=m=>m<160?`${Math.round(m*3.28084/10)*10} ft`:`${(m/1609.344).toFixed(1)} mi`;
const $=id=>document.getElementById(id);
function trace(ctx,ring) {ring.forEach(([x,z],i)=>i?ctx.lineTo(x,z):ctx.moveTo(x,z));}
function prepareBase(city) {
  const [left,top,right,bottom]=city.bounds,scale=.57;
  const base=document.createElement('canvas');base.width=Math.ceil((right-left)*scale);base.height=Math.ceil((bottom-top)*scale);
  const ctx=base.getContext('2d');ctx.setTransform(scale,0,0,scale,-left*scale,-top*scale);
  ctx.fillStyle='#cdd0b7';ctx.fillRect(left,top,right-left,bottom-top);
  for(const [features,color] of [[city.parks,'#a4bd8d'],[city.water,'#8fb7b7'],[city.buildings,'#b2b49f']]) {
    ctx.fillStyle=color;for(const f of features||[]){ctx.beginPath();trace(ctx,f.p);ctx.closePath();for(const hole of f.holes||[]){trace(ctx,hole);ctx.closePath();}ctx.fill('evenodd');}
  }
  ctx.lineJoin='round';ctx.lineCap='round';
  for(const outline of [true,false])for(const r of city.roads){ctx.lineWidth=r.w+(outline?3:0);ctx.strokeStyle=outline?'#aaa998':r.w>=15?'#f8dfa5':'#f7f3db';ctx.beginPath();trace(ctx,r.p);ctx.stroke();}
  return {base,left,top,right,bottom};
}
function pin(ctx,x,y,n,selected,done) {
  ctx.beginPath();ctx.arc(x,y,selected?10:8,0,Math.PI*2);ctx.fillStyle=selected?'#ac482e':done?'#417553':'#2d5147';ctx.fill();ctx.strokeStyle='#fef8dc';ctx.lineWidth=1.6;ctx.stroke();ctx.fillStyle='#fff9e5';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(n+1),x,y+.5);
}
function playerArrow(ctx,x,y,heading) {
  ctx.save();ctx.translate(x,y);ctx.rotate(heading);ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6.8,7);ctx.lineTo(0,4);ctx.lineTo(-6.8,7);ctx.closePath();ctx.fillStyle='#bb462c';ctx.strokeStyle='#fff8dc';ctx.lineWidth=2;ctx.stroke();ctx.fill();ctx.restore();
}
export function makeAtlas(city,player,onTravel,onResume,toast) {
  const map=prepareBase(city),mini=$('mini'),large=$('large-map'),dialog=$('atlas');
  let selected=0,target=null,transform=null,visited=new Set();
  try{const saved=JSON.parse(localStorage.getItem('lincoln.drive.visited')||'[]');if(Array.isArray(saved))visited=new Set(saved.filter(i=>Number.isInteger(i)&&i>=0&&i<places.length));}catch{}
  const buttons=places.map(p=>{const b=document.createElement('button');b.className='place';b.innerHTML=`<span>${p.id+1}</span>${p.name}<em></em>`;b.onclick=()=>choose(p.id);$('places').append(b);return b;});
  function choose(id){selected=id;buttons.forEach((b,i)=>{b.setAttribute('aria-pressed',i===selected);b.lastElementChild.textContent=visited.has(i)?'✓':'';});$('progress').textContent=`${visited.size} / ${places.length}`;if(dialog.open)draw(large,true);}
  function setTarget(p){target=p;document.querySelector('.waypoint').hidden=!p;if(p){$('target-label').textContent=p.name;$('remaining').textContent=distanceText(Math.hypot(p.x-player.x,p.z-player.z));}}
  function draw(canvas,isFull) {
    const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2),pw=Math.round(w*dpr),ph=Math.round(h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#cbd0b7';ctx.fillRect(0,0,w,h);
    const cx=isFull?(Math.min(player.x,-1138)+Math.max(player.x,1440))/2:player.x,cz=isFull?(Math.min(player.z,-1190)+Math.max(player.z,930))/2:player.z;
    const scale=isFull?Math.min(w/(Math.max(player.x,1440)-Math.min(player.x,-1138)+420),h/(Math.max(player.z,930)-Math.min(player.z,-1190)+400)):w/570;
    const x=v=>(v-cx)*scale+w/2,z=v=>(v-cz)*scale+h/2;
    ctx.drawImage(map.base,x(map.left),z(map.top),(map.right-map.left)*scale,(map.bottom-map.top)*scale);
    if(target){ctx.strokeStyle='#ba4f34';ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(x(player.x),z(player.z));ctx.lineTo(x(target.x),z(target.z));ctx.stroke();ctx.setLineDash([]);}
    for(const p of places)pin(ctx,x(p.x),z(p.z),p.id,isFull?selected===p.id:target===p,visited.has(p.id));
    playerArrow(ctx,x(player.x),z(player.z),player.heading);
    if(isFull)transform=places.map(p=>[x(p.x),z(p.z)]);
  }
  large.addEventListener('click',e=>{const box=large.getBoundingClientRect();const i=transform?.findIndex(([x,y])=>Math.hypot(x-e.clientX+box.left,y-e.clientY+box.top)<20);if(i>=0)choose(i);});
  function open(){if(!dialog.open)dialog.showModal();choose(target?.id??selected);}
  function close(){dialog.close();onResume();}
  function visit(p){if(visited.has(p.id))return;visited.add(p.id);try{localStorage.setItem('lincoln.drive.visited',JSON.stringify([...visited]));}catch{}toast(visited.size===places.length?'Tour complete · All five landmarks visited':`${p.name} · ${visited.size}/${places.length} visited`);choose(selected);}
  $('set-target').onclick=()=>{setTarget(places[selected]);close();};$('travel').onclick=()=>{const p=places[selected];onTravel(p);setTarget(null);visit(p);close();};$('clear-target').onclick=()=>setTarget(null);dialog.querySelector('.close').onclick=close;
  dialog.addEventListener('close',onResume);$('map-button').onclick=open;
  function update(){
    draw(mini,false);if(dialog.open){draw(large,true);return;}
    if(target)$('remaining').textContent=distanceText(Math.hypot(target.x-player.x,target.z-player.z));
    for(const p of places){const distance=Math.hypot(p.x-player.x,p.z-player.z);const r=[155,53,177,150,88][p.id];if(distance<=r&&player.y<160){visit(p);if(target===p){setTarget(null);toast(`Arrived · ${p.name}`);}}}
  }
  choose(0);return {open,update,drawMini:()=>draw(mini,false)};
}
