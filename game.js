import * as THREE from './vendor/three.module.min.js';
import { buildWorld, streetNetwork, atmosphere, skies } from './world.js';
import { makeVehicle } from './models.js';
import { makeAtlas, places } from './atlas.js';
import { makeTraffic } from './traffic.js';
import { icons } from './icons.js';

const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp;
const player={x:-292,z:216.6,y:0,heading:Math.PI/2,speed:0,mode:'car'};
const modes=['walk','car','bike','fly'],camNames=['Chase cam','First person','Overhead'];
let toastTimer;
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('show');toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600);}
function makeSound() {
  let context,osc,gain,active=false;
  $('sound').onclick=async()=>{try{
    if(!context){context=new AudioContext();osc=context.createOscillator();gain=context.createGain();const lp=context.createBiquadFilter();lp.type='lowpass';lp.frequency.value=235;osc.type='sawtooth';gain.gain.value=0;osc.connect(lp).connect(gain).connect(context.destination);osc.start();}
    await context.resume();active=!active;$('sound').setAttribute('aria-pressed',active);$('sound').setAttribute('aria-label',active?'Mute sound':'Turn sound on');$('sound').querySelector('i').dataset.icon=active?'sound':'muted';icons();
  }catch{toast('Audio is unavailable in this browser');}};
  return (paused)=>{if(!context)return;const motor=['car','fly'].includes(player.mode);const rpm=player.mode==='fly'?27:35+(Math.abs(player.speed)%8)*4;
    osc.frequency.setTargetAtTime(rpm,context.currentTime,.1);gain.gain.setTargetAtTime(active&&motor&&!paused?.024:0,context.currentTime,.06);};
}
async function run(){
  icons();const canvas=$('view');const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(56,1,.16,9000);
  const lights=atmosphere(scene);const res=await fetch('data/city.json');if(!res.ok)throw Error(`Map download returned ${res.status}`);
  const city=await res.json();$('load-text').textContent='Building downtown and the Capitol…';await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  const blocked=buildWorld(city,scene),network=streetNetwork(city),traffic=makeTraffic(city.roads,scene);const sound=makeSound();
  const vehicles=new Map(modes.map(m=>[m,makeVehicle(m)]));const actor=new THREE.Group();scene.add(actor);
  for(const [m,obj] of vehicles){obj.visible=m===player.mode;actor.add(obj);}
  const blobCanvas=document.createElement('canvas');blobCanvas.width=blobCanvas.height=64;const bc=blobCanvas.getContext('2d');const grad=bc.createRadialGradient(32,32,7,32,32,31);grad.addColorStop(0,'rgba(15,24,26,.57)');grad.addColorStop(.65,'rgba(15,24,26,.35)');grad.addColorStop(1,'rgba(15,24,26,0)');bc.fillStyle=grad;bc.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(blobCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  let cam=0,orbit=0,pitch=0,drag=null,camSnap=true,skyIndex=0,gait=0,wheelAngle=0,hudTime=0,trafficTime=0;
  const keys=new Set(),menu=$('menu'),atlasDialog=$('atlas'),dayNames=Object.keys(skies);
  const isPaused=()=>menu.open||atlasDialog.open||document.hidden;
  function focusGame(){keys.clear();if(!menu.open&&!atlasDialog.open)canvas.focus({preventScroll:true});}
  function streetSpawn(x,z,heading) {
    const road=network.nearest(x,z,r=>r.w>=8);if(!road)return;
    let dx=road.dx/road.length,dz=road.dz/road.length;
    if(heading!==undefined && dx*Math.sin(heading)-dz*Math.cos(heading)<0){dx=-dx;dz=-dz;}
    const offset=road.road.w*.23;player.x=road.px-dz*offset;player.z=road.pz+dx*offset;player.heading=Math.atan2(dx,-dz);player.speed=0;player.y=player.mode==='fly'?55:0;camSnap=true;orbit=0;pitch=0;
  }
  function setMode(mode){if(mode===player.mode)return;
    const landing=player.mode==='fly'&&mode!=='fly';player.mode=mode;
    if(landing)streetSpawn(player.x,player.z,player.heading);
    else if(mode==='fly')player.y=58;
    player.speed=0;camSnap=true;orbit=0;pitch=0;
    for(const [name,obj] of vehicles)obj.visible=name===mode;
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));document.body.classList.toggle('flying',mode==='fly');
    toast({walk:'On foot · Shift to run',car:'Driving · Space to brake',bike:'Cycling',fly:'Flying · E to climb, Q to descend'}[mode]);focusGame();
  }
  function selectCam(){cam=(cam+1)%camNames.length;orbit=0;pitch=0;camSnap=true;$('camera-name').textContent=camNames[cam];}
  function pause(){if(!menu.open&&!atlasDialog.open){keys.clear();menu.showModal();sound(true);}}
  function resume(){menu.close();focusGame();}
  const atlas=makeAtlas(city,player,p=>{streetSpawn(p.x,p.z);toast(p.name);},focusGame,toast);
  $('pause').onclick=$('hint').onclick=pause;$('resume').onclick=menu.querySelector('.close').onclick=resume;menu.addEventListener('close',focusGame);
  $('reset').onclick=()=>{streetSpawn(-292,213.5,Math.PI/2);resume();toast('Lincoln Mall');};
  $('camera').onclick=()=>{selectCam();focusGame();};$('light').onclick=()=>{skyIndex=(skyIndex+1)%dayNames.length;const n=dayNames[skyIndex];lights.set(n);$('time-label').textContent=n;toast(n);focusGame();};
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  const motionKeys=['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' ','shift','q','e'];
  window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey)return;const k=e.key.toLowerCase();
    if((menu.open||atlasDialog.open)){if(k==='m'&&atlasDialog.open){e.preventDefault();atlasDialog.close();}return;}
    if(motionKeys.includes(k)){e.preventDefault();keys.add(k);return;}
    if(e.repeat)return;
    if(k==='m'){e.preventDefault();atlas.open();}else if(k==='escape'||k==='?'){e.preventDefault();pause();}else if(k==='v')selectCam();else if('1234'.includes(k)&&k.length===1)setMode(modes[Number(k)-1]);
  });window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden)sound(true);});
  for(const b of document.querySelectorAll('[data-key]')){const k=b.dataset.key;b.onpointerdown=e=>{e.preventDefault();if(isPaused())return;b.setPointerCapture(e.pointerId);keys.add(k);b.classList.add('active');};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{keys.delete(k);b.classList.remove('active');};}
  canvas.onpointerdown=e=>{if(isPaused())return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});};
  canvas.onpointermove=e=>{if(!drag)return;orbit-=(e.clientX-drag[0])*.007;pitch=clamp(pitch+(e.clientY-drag[1])*.035,-1.7,7);drag=[e.clientX,e.clientY];};canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
  const pressed=(...options)=>options.some(key=>keys.has(key));
  function simulate(dt){
    const up=pressed('w','arrowup'),down=pressed('s','arrowdown'),turn=Number(pressed('d','arrowright'))-Number(pressed('a','arrowleft'));
    const car=player.mode==='car',bike=player.mode==='bike',fly=player.mode==='fly',walk=player.mode==='walk';
    const max=car?38:fly?68:bike?12:pressed('shift')?5.3:2.5,reverse=car?7:fly?25:bike?2:2;
    const accel=car?8.8:fly?16:bike?4.1:9,brake=car?17:fly?20:8;
    const desired=up?max:down?-reverse:0;
    const rate=pressed(' ')&&!walk?brake*1.8:up||down?(player.speed*desired<0?brake:accel):car?2.4:fly?6:bike?1.9:10;
    const delta=(pressed(' ')&&!walk?0:desired)-player.speed;
    player.speed+=Math.sign(delta)*Math.min(Math.abs(delta),rate*dt);
    const steering=car||bike?Math.sign(player.speed)*Math.min(1,Math.abs(player.speed)/3)*(car?1.75/(1+Math.abs(player.speed)*.039):1.8):fly?1.1:2.45;
    player.heading+=turn*steering*dt;wheelAngle=THREE.MathUtils.lerp(wheelAngle,turn*(bike?-.09:car?-.018:fly?-.11:0)*Math.min(1,Math.abs(player.speed)/5),1-Math.exp(-6*dt));
    const vx=Math.sin(player.heading),vz=-Math.cos(player.heading),nx=player.x+vx*player.speed*dt,nz=player.z+vz*player.speed*dt;
    const margin=4,b=city.bounds,boundary=nx<b[0]+margin||nx>b[2]-margin||nz<b[1]+margin||nz>b[3]-margin;
    const reach=car?1.75:bike?.65:.25,sign=Math.sign(player.speed),side=car?.8:bike?.27:.18;
    const hit=!fly&&sign&&[-side,0,side].some(s=>blocked(nx+vx*reach*sign-vz*s,nz+vz*reach*sign+vx*s));
    if(boundary||hit){if(boundary&&Math.abs(player.speed)>1)toast('Edge of the mapped area');player.speed=0;}else{player.x=nx;player.z=nz;}
    if(fly){const climb=Number(pressed('e'))-Number(pressed('q'));player.y=clamp(player.y+climb*dt*28,Math.max(8,blocked.heightAt(player.x,player.z)+4),295);}
    gait+=Math.abs(player.speed)*dt*(walk?2.8:1.15);
  }
  const rotor=vehicles.get('fly').getObjectByName('rotor'),tail=vehicles.get('fly').getObjectByName('tailRotor');
  const walker=vehicles.get('walk'),limbs=['legL','legR','armL','armR'].map(n=>walker.getObjectByName(n));
  const target=new THREE.Vector3(),eye=new THREE.Vector3(),look=new THREE.Vector3(),eyeLook=new THREE.Vector3();
  function updateCamera(dt){
    const fly=player.mode==='fly',car=player.mode==='car',walk=player.mode==='walk',angle=player.heading+orbit;
    const dx=Math.sin(angle),dz=-Math.cos(angle),y=player.y+.16;
    const ahead=car?5:fly?9:2.5,back=car?8.8:fly?17:walk?4.7:5.6;
    if(cam===0){target.set(player.x+dx*ahead,y+(car?1.32:fly?2.2:1.4),player.z+dz*ahead);eye.set(player.x-dx*back,y+(car?3.7:fly?6.5:3)+pitch,player.z-dz*back);}
    else if(cam===1){eye.set(player.x,y+(car?1.25:fly?2.5:1.72),player.z);target.set(eye.x+dx*20,eye.y+pitch,eye.z+dz*20);}
    else{eye.set(player.x-dx*15,y+52+pitch,player.z-dz*15);target.set(player.x,y,player.z);}
    const blend=camSnap?1:1-Math.exp(-8*dt);camera.position.lerp(eye,blend);eyeLook.lerp(target,blend);camera.lookAt(eyeLook);camSnap=false;lights.sky.position.copy(camera.position);
    actor.visible=cam!==1;actor.position.set(player.x,y+((walk&&player.speed)?Math.abs(Math.sin(gait))*.045:0),player.z);actor.rotation.set(0,-player.heading,wheelAngle,'YXZ');
    shadow.position.set(player.x,.17,player.z);shadow.rotation.z=player.heading;shadow.scale.set(car?3.6:fly?7:1.4,car?6.3:fly?10:2.5,1);
    if(fly){if(rotor)rotor.rotation.y+=dt*32;if(tail)tail.rotation.x+=dt*48;}
    if(walk)limbs.forEach((l,i)=>{if(l)l.rotation.x=Math.abs(player.speed)>.1?Math.sin(gait)*(i===0||i===3?1:-1)*.48:0;});
  }
  function updateHUD(){const mph=Math.round(Math.abs(player.speed)*2.23694);$('speed').textContent=mph;$('speed-fill').style.width=`${Math.min(100,mph/90*100)}%`;
    $('gear').textContent=player.mode==='fly'?`${Math.round(player.y*3.281)} FT`:player.mode==='car'?(player.speed<-.1?'R':mph===0?'N':`D${Math.min(6,1+Math.floor(mph/15))}`):player.mode==='bike'?'BIKE':'WALK';
    const nearest=network.nearest(player.x,player.z);$('street').textContent=nearest&&nearest.distance<50?nearest.road.n:'Central Lincoln';$('heading').textContent=['N','NE','E','SE','S','SW','W','NW'][(Math.round(player.heading/(Math.PI/4))%8+8)%8];atlas.update();}
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();atlas.drawMini();}window.addEventListener('resize',resize);resize();
  streetSpawn(-292,213.5,Math.PI/2);traffic(0,player);updateCamera(0);updateHUD();renderer.render(scene,camera);$('loading').hidden=true;focusGame();
  let last=performance.now();
  function frame(now){requestAnimationFrame(frame);const dt=Math.min(.075,(now-last)/1000);last=now;const paused=isPaused();sound(paused);if(paused)return;
    const steps=Math.max(1,Math.ceil(dt/.017));for(let i=0;i<steps;i++)simulate(dt/steps);
    updateCamera(dt);trafficTime+=dt;if(trafficTime>.065){traffic(trafficTime,player);trafficTime=0;}hudTime+=dt;if(hudTime>.12){updateHUD();hudTime=0;}renderer.render(scene,camera);
  }requestAnimationFrame(frame);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('loading').hidden=false;$('load-text').textContent='Graphics paused. Reload the page to restart.';});
}
run().catch(err=>{console.error(err);$('load-text').textContent='The 3D city could not start. Enable hardware acceleration in your browser, then reload.';document.querySelector('.load-line').hidden=true;});
