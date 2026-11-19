import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {OrbitControls} from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const scene=new THREE.Scene(); scene.background=new THREE.Color("#080d16");
const camera=new THREE.PerspectiveCamera(50,1,0.1,5000); camera.position.set(0,450,900);
const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); document.getElementById("scene").appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.target.set(0,0,0);
scene.add(new THREE.AmbientLight(0xffffff,1.1)); const light=new THREE.DirectionalLight(0xffffff,1.4);light.position.set(300,500,500);scene.add(light);
const grid=new THREE.GridHelper(900,18,0x26394e,0x182536);grid.position.y=-5;scene.add(grid);
const axes=new THREE.AxesHelper(250);scene.add(axes);
let rows=[], points, geometry, material, filtered=[];
const bounds={latMin:24,latMax:46,lonMin:122,lonMax:150};
function mapPoint(r){const x=(r.longitude-136)*30;const z=-(r.latitude-36)*30;const y=-Math.min(r.depth,700)*0.65;return [x,y,z]}
function depthColor(d){const t=Math.max(0,Math.min(1,d/700));return new THREE.Color().setHSL(0.52-t*0.52,1,0.52)}
function loadPoints(){if(points){scene.remove(points);geometry.dispose();material.dispose()}const mag=+document.querySelector("#mag").value,dep=+document.querySelector("#depth").value,year=+document.querySelector("#year").value;filtered=rows.filter(r=>r.mag>=mag&&r.depth<=dep&&new Date(r.time).getUTCFullYear()>=year);const pos=[],col=[],size=[];
for(const r of filtered){const [x,y,z]=mapPoint(r);pos.push(x,y,z);const c=depthColor(r.depth);col.push(c.r,c.g,c.b)}
geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geometry.setAttribute("color",new THREE.Float32BufferAttribute(col,3));
material=new THREE.PointsMaterial({size:2.5,vertexColors:true,sizeAttenuation:true});points=new THREE.Points(geometry,material);scene.add(points);
document.querySelector("#status").textContent=`Showing ${filtered.length.toLocaleString()} / ${rows.length.toLocaleString()} earthquakes`;
}
function resize(){const el=document.getElementById("scene");camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight)}
window.addEventListener("resize",resize);resize();
fetch("./earthquakes.csv").then(r=>r.text()).then(text=>{const lines=text.trim().split(/\r?\n/);
function parseCSVLine(line){const out=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(ch===","&&!quoted){out.push(value);value=""}else value+=ch}out.push(value);return out}
const headers=parseCSVLine(lines[0]);
rows=lines.slice(1).map(line=>{const a=parseCSVLine(line);const o={};headers.forEach((h,i)=>o[h]=a[i]);return {time:o.time,latitude:+o.latitude,longitude:+o.longitude,depth:+o.depth,mag:+o.mag,place:o.place,id:o.id,magType:o.magType}}).filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&Number.isFinite(r.depth)&&Number.isFinite(r.mag));
loadPoints();});
["mag","depth","year"].forEach(id=>document.getElementById(id).addEventListener("input",()=>{document.getElementById(id+"Label").textContent=id==="mag"?(+document.getElementById(id).value).toFixed(1):id==="depth"?document.getElementById(id).value+" km":document.getElementById(id).value;loadPoints()}));
document.getElementById("reset").onclick=()=>{document.querySelector("#mag").value=3;document.querySelector("#depth").value=700;document.querySelector("#year").value=1970;document.querySelector("#magLabel").textContent="3.0";document.querySelector("#depthLabel").textContent="700 km";document.querySelector("#yearLabel").textContent="1970";camera.position.set(0,450,900);controls.target.set(0,0,0);loadPoints()};
const raycaster=new THREE.Raycaster();raycaster.params.Points.threshold=8;const mouse=new THREE.Vector2();
renderer.domElement.addEventListener("click",e=>{const rect=renderer.domElement.getBoundingClientRect();mouse.x=(e.clientX-rect.left)/rect.width*2-1;mouse.y=-(e.clientY-rect.top)/rect.height*2+1;raycaster.setFromCamera(mouse,camera);if(points){const hits=raycaster.intersectObject(points);if(hits.length){const r=filtered[hits[0].index];document.querySelector("#info").innerHTML=`<b>${r.place||"Earthquake"}</b><p>${new Date(r.time).toLocaleString()} · Magnitude ${r.mag} (${r.magType||"unknown"}) · Depth ${r.depth.toFixed(1)} km</p><p>Lat ${r.latitude.toFixed(4)} · Lon ${r.longitude.toFixed(4)} · ID ${r.id}</p>`}}});
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
