// The 3D campus: renders the world, moves your student, runs the buses and the crowds, and plays
// journeys back. React owns everything on top (HUD, menus); this class only draws.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makePerson, randomLook, setQuality } from "./characters";
import { buildGraph, Mover, pointsFor, route } from "./traffic";
import { makeBus, makeCab, makeKeke, makeTownBus, makeVehicle } from "./vehicles";
import { buildWorld, stopPlacement } from "./world";

const WALK_SPEED = 7.5; // world units per real second: the same as trekking on the server
const RUN_FACTOR = 1.5; // the server allows a little faster than trekking pace
const ACCEL = 9; // how quickly you speed up and slow down
const DOOR_TRIGGER = 7;
const BOUNDS = { x0: -230, x1: 470, z0: -40, z1: 360 };

function seeded(n) {
  let s = n;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const lerp = (a, b, t) => a + (b - a) * t;

// Sky colours through the day (minute of day -> colour)
const SKY = [
  [0, "#0b1530"], [300, "#0e1a38"], [360, "#e9a46a"], [420, "#9fc9e8"], [720, "#8cc4ec"],
  [1050, "#9cc6e2"], [1110, "#f0a060"], [1170, "#3a3560"], [1230, "#0d1630"], [1440, "#0b1530"],
];

function skyAt(minute) {
  for (let i = 1; i < SKY.length; i++) {
    if (minute <= SKY[i][0]) {
      const [m0, c0] = SKY[i - 1];
      const [m1, c1] = SKY[i];
      return new THREE.Color(c0).lerp(new THREE.Color(c1), (minute - m0) / (m1 - m0));
    }
  }
  return new THREE.Color(SKY[0][1]);
}

export default class CampusEngine {
  constructor(container, map, { look, pos, onNearDoor, lowPower = false } = {}) {
    this.container = container;
    this.map = map;
    this.onNearDoor = onNearDoor || (() => {});
    this.graph = buildGraph(map);
    this.input = { x: 0, y: 0 };
    this.vel = new THREE.Vector2(0, 0);
    this.running = false;
    this.autoPath = null; // waypoints when you tap somewhere to walk there
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.lowPower = lowPower;
    this.keys = new Set();
    this.inside = null;
    this.journey = null;
    this.minute = 480;
    this.nearDoor = null;
    this.clock = new THREE.Clock();
    this.disposed = false;

    const dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.6);
    this.renderer = new THREE.WebGLRenderer({ antialias: dpr < 1.5, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.shadows = !lowPower;
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog("#9fc9e8", 160, 520);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1400);
    this.camYaw = Math.PI; // looking towards -z... adjusted on first frame
    this.camDist = 24;
    this.camHeight = 13;

    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#5a4a30", 1.2);
    this.sun = new THREE.DirectionalLight("#fff1d6", 1.6);
    this.ambient = new THREE.AmbientLight("#ffffff", 0.25);
    this.scene.add(this.hemi, this.sun, this.ambient, this.sun.target);
    if (this.shadows) {
      // Real shadows near you: the shadow camera follows the player so it stays sharp and cheap.
      this.sun.castShadow = true;
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      this.sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
      const sc = this.sun.shadow.camera;
      sc.left = -75;
      sc.right = 75;
      sc.top = 75;
      sc.bottom = -75;
      sc.near = 1;
      sc.far = 600;
      sc.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.6;
    }
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.clouds = makeClouds();
    this.scene.add(this.clouds);
    if (!lowPower) {
      // soft light bouncing from all around, so materials look real rather than flat
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }

    setQuality(!lowPower);
    this.world = buildWorld(map);
    this.scene.add(this.world.group);
    if (this.shadows) {
      this.world.group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.userData.ground) o.receiveShadow = true;
        else if (!o.isInstancedMesh || o.userData.trees) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
    }
    // where you tapped to walk to
    this.marker = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.7, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }));
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.player = makePerson(look || {}, { bag: true });
    this._shadowPerson(this.player);
    const start = pos || map.nodes.gate;
    this.player.position.set(start[0], 0, start[1]);
    this.scene.add(this.player);
    this.target = new THREE.Vector3().copy(this.player.position);

    this._makeCrowds();
    this._makeTraffic();
    this._bindInput();
    this.resize();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.setMinute(this.minute);
    this.renderer.setAnimationLoop(() => this._frame());
    if (import.meta.env.DEV || window.__campusDebug) window.__campus = this;
  }

  _shadowPerson(person) {
    if (!this.shadows) return;
    person.traverse((o) => {
      if (o.isMesh && !o.userData.blob) o.castShadow = true;
      if (o.userData.blob) o.visible = false; // real shadows replace the blob
    });
  }

  // --- People and vehicles -----------------------------------------------------------------------

  _makeCrowds() {
    const rand = seeded(1234);
    const nodes = Object.keys(this.map.nodes).filter((n) => n !== "town");
    this.walkers = [];
    for (let i = 0; i < 42; i++) {
      const person = makePerson(randomLook(rand), { bag: rand() < 0.7 });
      const from = nodes[Math.floor(rand() * nodes.length)];
      const w = { person, mover: null, node: from, speed: 3.6 + rand() * 2.4, side: rand() < 0.5 ? 1 : -1 };
      this._newWalk(w, rand);
      w.mover.s = rand() * w.mover.total;
      this.scene.add(person);
      this.walkers.push(w);
    }
    this.rand = rand;
    // little queues at the bus stops
    this.queues = [];
    for (const stop of this.map.bus_stops) {
      const at = stopPlacement(this.map, stop);
      for (let i = 0; i < 5; i++) {
        const p = makePerson(randomLook(rand), { bag: rand() < 0.6 });
        const along = (i - 2) * 1.5;
        p.position.set(at.x + at.dir[0] * along - at.right[0] * 2.2, 0, at.z + at.dir[1] * along - at.right[1] * 2.2);
        p.rotation.y = Math.atan2(-at.right[0], -at.right[1]);
        this.scene.add(p);
        this.queues.push({ person: p, rank: i });
      }
    }
  }

  _newWalk(w, rand = this.rand) {
    const nodes = Object.keys(this.map.nodes).filter((n) => n !== "town" && n !== w.node);
    const to = nodes[Math.floor(rand() * nodes.length)];
    const path = route(this.graph, w.node, to);
    w.to = to;
    w.mover = new Mover(pointsFor(this.map, path), { speed: w.speed, offset: w.side * 5.6 });
  }

  _makeTraffic() {
    this.vehicles = [];
    const loop = pointsFor(this.map, this.map.bus_route);
    const stops = new Set(this.map.bus_stops);
    for (let i = 0; i < 3; i++) {
      const mesh = makeBus();
      const mover = new Mover(loop, { speed: 16, offset: 2, loop: true });
      mover.s = (mover.total * i) / 3;
      this.scene.add(mesh);
      this.vehicles.push({ mesh, mover, kind: "bus", stops, lastStop: null });
    }
    const nodes = Object.keys(this.map.nodes).filter((n) => n !== "town");
    for (let i = 0; i < 5; i++) {
      const mesh = makeKeke(["#e9c227", "#7fb03a", "#e9c227", "#7fb03a", "#e9c227"][i]);
      const v = { mesh, kind: "keke", node: nodes[(i * 5) % nodes.length], speed: 14 };
      this._newDrive(v);
      v.mover.s = this.rand() * v.mover.total;
      this.scene.add(mesh);
      this.vehicles.push(v);
    }
    // night cabs: only between the Main Gate and the bus stops, only after 9 PM
    for (let i = 0; i < 2; i++) {
      const mesh = makeCab(i ? "#2f6fae" : "#f0b72f");
      const v = { mesh, kind: "cab", node: "gate", speed: 18 };
      this._newCabRun(v);
      v.mover.s = this.rand() * v.mover.total;
      this.scene.add(mesh);
      this.vehicles.push(v);
    }
    // kekes waiting at the parks
    for (const park of this.map.keke_parks || []) {
      const [x, z] = this.map.nodes[park];
      for (let i = 0; i < 2; i++) {
        const k = makeKeke(i ? "#7fb03a" : "#e9c227");
        k.position.set(x - 7 - i * 4, 0, z - 7);
        k.rotation.y = Math.PI / 2;
        this.scene.add(k);
        this.vehicles.push({ mesh: k, kind: "parked_keke" });
      }
    }
    const tb = makeTownBus();
    this.scene.add(tb);
    this.vehicles.push({ mesh: tb, kind: "town_bus",
      mover: new Mover(pointsFor(this.map, ["town", "gate", "town"]), { speed: 14, offset: 2, loop: true }) });
  }

  _newCabRun(v) {
    const stops = this.map.bus_stops.filter((s) => s !== "gate");
    const to = v.node === "gate" ? stops[Math.floor(this.rand() * stops.length)] : "gate";
    v.mover = new Mover(pointsFor(this.map, route(this.graph, v.node, to)), { speed: v.speed, offset: 2 });
    v.node = to;
  }

  _newDrive(v) {
    const nodes = Object.keys(this.map.nodes).filter((n) => n !== "town" && n !== v.node);
    const to = nodes[Math.floor(this.rand() * nodes.length)];
    v.mover = new Mover(pointsFor(this.map, route(this.graph, v.node, to)), { speed: v.speed, offset: 2 });
    v.node = to;
  }

  _updateTraffic(dt) {
    const day = this.minute >= 360 && this.minute < 1290;
    const busHours = this.minute >= 390 && this.minute < 1260;
    const busy = (this.minute >= 420 && this.minute < 600) || (this.minute >= 960 && this.minute < 1080);
    // fewer people out at night
    const active = day ? (busy ? this.walkers.length : Math.round(this.walkers.length * 0.7)) : 6;
    this.walkers.forEach((w, i) => {
      w.person.visible = i < active;
      if (!w.person.visible) return;
      const p = w.mover.update(dt);
      // step aside if you're in the way
      const me = this.player.position;
      const dx = p.x - me.x;
      const dz = p.z - me.z;
      const d = Math.hypot(dx, dz);
      w.dodge = lerp(w.dodge || 0, d < 3.2 && this.player.visible ? (3.2 - d) * 1.2 : 0, Math.min(1, dt * 6));
      const nx = d > 0.01 ? dx / d : 1;
      const nz = d > 0.01 ? dz / d : 0;
      w.person.position.set(p.x + nx * w.dodge, 0, p.z + nz * w.dodge);
      w.person.rotation.y = p.heading;
      w.person.walk(dt, w.speed);
      if (w.mover.done) {
        w.node = w.to;
        this._newWalk(w);
      }
    });
    for (const q of this.queues) {
      q.person.visible = busHours && (busy || q.rank < 2);
      if (q.person.visible) q.person.walk(dt, 0);
    }
    for (const v of this.vehicles) {
      if (v.kind === "bus") v.mesh.visible = busHours;
      if (v.kind === "keke" || v.kind === "parked_keke") v.mesh.visible = this.minute >= 360 && this.minute < 1320;
      if (v.kind === "cab") v.mesh.visible = this.minute >= 1260 || this.minute < 360;
      if (v.kind === "parked_keke" || !v.mesh.visible || v === this.journey?.vehicle) continue;
      const p = v.mover.update(dt);
      v.mesh.position.set(p.x, 0, p.z);
      v.mesh.rotation.y = p.heading;
      if (v.kind === "bus") {
        // stop for a few seconds at each stop
        const node = this.map.bus_route[p.seg - 1];
        if (v.stops.has(node) && v.lastStop !== `${node}:${p.seg}`) {
          const [nx, nz] = this.map.nodes[node];
          if (Math.hypot(p.x - nx, p.z - nz) < 4) {
            v.mover.pause = 2.5;
            v.lastStop = `${node}:${p.seg}`;
          }
        }
      } else if (v.mover.done) {
        if (v.kind === "cab") this._newCabRun(v);
        else this._newDrive(v);
      }
    }
  }

  // --- Time of day -------------------------------------------------------------------------------

  setMinute(minute) {
    this.minute = ((minute % 1440) + 1440) % 1440;
    const m = this.minute;
    const sky = skyAt(m);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    // sun rises ~6:15 in the east (+x), sets ~18:45 in the west
    const t = (m - 375) / (1125 - 375);
    const up = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    const daylight = Math.max(0, Math.min(1, up * 3));
    this.sunDir = new THREE.Vector3(Math.cos(Math.PI * t) * 160, 40 + up * 160, -60);
    this.sun.position.set(110, 0, 150).add(this.sunDir);
    this.sun.target.position.set(110, 0, 150);
    setSky(this.sky, sky, m, daylight, this.sunDir);
    if (this.scene.environment) this.scene.environmentIntensity = 0.08 + daylight * 0.42;
    for (const c of this.clouds.children) c.material.color.setScalar(0.25 + daylight * 0.75);
    this.sun.intensity = 0.05 + daylight * (this.shadows ? 2.4 : 1.7);
    this.sun.color.set(daylight < 0.4 ? "#ffc58a" : "#fff1d6");
    this.hemi.intensity = 0.2 + daylight * (this.shadows ? 0.6 : 1.0);
    this.hemi.color.set(daylight < 0.25 ? "#5a6f9e" : "#cfe6ff"); // moonlight blue at night
    this.ambient.intensity = 0.05 + daylight * 0.22;
    const night = 1 - daylight;
    const lampOn = night > 0.55;
    this.world.lamps.headMat.emissive.set(lampOn ? "#ffd27a" : "#000000");
    for (const mat of this.world.nightMaterials) mat.emissive.setScalar(night > 0.6 ? 0.9 : 0);
    this.night = night;
  }

  // --- Input ---------------------------------------------------------------------------------------

  _bindInput() {
    this._keydown = (e) => {
      if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        this.keys.add(k);
        this.cancelAutoWalk();
        e.preventDefault();
      }
      if (k === "shift") this.keys.add("shift");
    };
    this._keyup = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", this._keydown);
    window.addEventListener("keyup", this._keyup);
    // drag on the scene to turn the camera
    const el = this.renderer.domElement;
    let drag = null;
    this._pd = (e) => {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId, t: performance.now() };
      el.setPointerCapture?.(e.pointerId);
    };
    this._pm = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      this.camYaw -= (e.clientX - drag.x) * 0.008;
      drag.x = e.clientX;
    };
    this._pu = (e) => {
      // a quick tap (not a drag) walks you there
      if (drag && e.type === "pointerup" && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 10
          && performance.now() - drag.t < 400) {
        this._tapToWalk(e.clientX, e.clientY);
      }
      drag = null;
    };
    el.addEventListener("pointerdown", this._pd);
    el.addEventListener("pointermove", this._pm);
    el.addEventListener("pointerup", this._pu);
    el.addEventListener("pointercancel", this._pu);
    this._wheel = (e) => {
      this.camDist = Math.max(12, Math.min(60, this.camDist + e.deltaY * 0.03));
      e.preventDefault();
    };
    el.addEventListener("wheel", this._wheel, { passive: false });
  }

  /** Joystick: x right, y up, each -1..1. */
  setJoystick(x, y) {
    this.input.x = x;
    this.input.y = y;
    if (Math.hypot(x, y) > 0.1) this.cancelAutoWalk();
  }

  setRun(on) {
    this.running = Boolean(on);
  }

  cancelAutoWalk() {
    this.autoPath = null;
    this.marker.visible = false;
  }

  /** Tap the ground or a building: walk there along the roads, around buildings. */
  _tapToWalk(clientX, clientY) {
    if (this.inside || this.journey) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return;
    // tapped a building? walk to its door instead
    let goal = [hit.x, hit.z];
    const building = this.world.colliders.find((c) => !c.cameraOnly && hit.x > c.x0 - 2 && hit.x < c.x1 + 2 && hit.z > c.z0 - 2 && hit.z < c.z1 + 2);
    const door = building && this.world.doors.find((d) => d.id === building.id);
    if (door) goal = [door.x, door.z];
    [goal[0], goal[1]] = this._collide(goal[0], goal[1]);
    this.walkTo(goal);
  }

  walkTo([gx, gz]) {
    const p = this.player.position;
    const dist = Math.hypot(gx - p.x, gz - p.z);
    let points = [[gx, gz]];
    if (dist > 30 || this._blocked(p.x, p.z, gx, gz)) {
      // follow the roads: nearest junction, the road route, then straight to the goal
      const near = (x, z) => Object.keys(this.map.nodes).reduce((a, n) => {
        const [nx, nz] = this.map.nodes[n];
        return Math.hypot(nx - x, nz - z) < Math.hypot(this.map.nodes[a][0] - x, this.map.nodes[a][1] - z) ? n : a;
      }, Object.keys(this.map.nodes)[0]);
      const a = near(p.x, p.z);
      const b = near(gx, gz);
      points = [...route(this.graph, a, b).map((n) => this.map.nodes[n]), [gx, gz]];
      // skip the first junction if it's behind us on the way
      if (points.length > 2) {
        const [x1, z1] = points[0];
        const [x2, z2] = points[1];
        if (Math.hypot(x2 - p.x, z2 - p.z) < Math.hypot(x2 - x1, z2 - z1)) points.shift();
      }
    }
    this.autoPath = points;
    this.marker.position.set(gx, 0.2, gz);
    this.marker.visible = true;
  }

  _blocked(x1, z1, x2, z2) {
    for (let t = 0.1; t < 1; t += 0.1) {
      const x = x1 + (x2 - x1) * t;
      const z = z1 + (z2 - z1) * t;
      if (this.world.colliders.some((c) => !c.cameraOnly && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)) return true;
    }
    return false;
  }

  zoom(delta) {
    this.camDist = Math.max(12, Math.min(60, this.camDist + delta));
  }

  _moveVector() {
    let x = this.input.x;
    let y = this.input.y;
    const k = this.keys;
    if (k.has("w") || k.has("arrowup")) y += 1;
    if (k.has("s") || k.has("arrowdown")) y -= 1;
    if (k.has("a") || k.has("arrowleft")) x -= 1;
    if (k.has("d") || k.has("arrowright")) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, len: Math.min(1, len) };
  }

  _collide(x, z) {
    for (const c of this.world.colliders) {
      if (c.cameraOnly) continue;
      if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) {
        const dx0 = x - c.x0;
        const dx1 = c.x1 - x;
        const dz0 = z - c.z0;
        const dz1 = c.z1 - z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) x = c.x0;
        else if (m === dx1) x = c.x1;
        else if (m === dz0) z = c.z0;
        else z = c.z1;
      }
    }
    return [Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, x)), Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, z))];
  }

  // --- What React calls --------------------------------------------------------------------------

  setLook(look) {
    const pos = this.player.position.clone();
    const rot = this.player.rotation.y;
    const visible = this.player.visible;
    this.scene.remove(this.player);
    this.player = makePerson(look, { bag: true });
    this._shadowPerson(this.player);
    this.player.position.copy(pos);
    this.player.rotation.y = rot;
    this.player.visible = visible;
    this.scene.add(this.player);
  }

  /** Inside a building you aren't drawn; the camera circles the building. null = outside. */
  setInside(buildingId, pos) {
    this.inside = buildingId;
    if (pos) this.placePlayer(pos);
    this.player.visible = !buildingId && !this.journey;
    if (buildingId) {
      const door = this.world.doors.find((d) => d.id === buildingId);
      if (door) {
        this.player.position.set(door.x, 0, door.z);
        this.target.set(door.x, 0, door.z);
      }
    }
  }

  placePlayer(pos) {
    this.player.position.set(pos[0], 0, pos[1]);
    this.target.copy(this.player.position);
  }

  /** When you step out, stand on the door ring facing the road. */
  stepOut(buildingId) {
    const door = this.world.doors.find((d) => d.id === buildingId);
    this.inside = null;
    this.player.visible = true;
    if (door) {
      const [nx, nz] = door.node;
      const heading = Math.atan2(nx - door.x, nz - door.z);
      this.player.position.set(door.x + Math.sin(heading) * 3, 0, door.z + Math.cos(heading) * 3);
      this.player.rotation.y = heading;
      this.camYaw = heading + Math.PI * 0.8; // over your shoulder, with the building beside you
      this.target.copy(this.player.position);
    }
  }

  playerPos() {
    return [Math.round(this.player.position.x * 10) / 10, Math.round(this.player.position.z * 10) / 10];
  }

  /**
   * Play a journey back: walking, waiting at the park while the bus pulls in, riding.
   * trip.segments come from the server. duration in real seconds.
   */
  playJourney(trip, duration, { onProgress, onDone } = {}) {
    this.endJourney(false);
    const total = trip.segments.reduce((a, s) => a + Math.max(1, s.minutes), 0);
    const segs = trip.segments.map((s) => ({ ...s, real: (Math.max(1, s.minutes) / total) * duration }));
    this.journey = { trip, segs, i: -1, t: 0, onProgress, onDone, elapsed: 0, duration, vehicle: null, minutes: total };
    this.inside = null;
    this._nextSegment();
  }

  _nextSegment() {
    const j = this.journey;
    j.i += 1;
    j.t = 0;
    if (j.i >= j.segs.length) return this.endJourney(true);
    const seg = j.segs[j.i];
    if (j.vehicle && seg.kind !== "ride") {
      this.scene.remove(j.vehicle);
      j.vehicle = null;
    }
    if (seg.kind === "walk") {
      const len = this._pathLength(seg.points);
      j.mover = new Mover(seg.points, { speed: len / Math.max(0.3, seg.real), offset: 4.5 });
      this.player.visible = true;
    } else if (seg.kind === "wait") {
      const ride = j.segs[j.i + 1];
      this.player.visible = true;
      const [x, z] = seg.points[0];
      const node = Object.keys(this.map.nodes).find((n) => this.map.nodes[n][0] === x && this.map.nodes[n][1] === z);
      if (seg.mode === "bus" && node && this.map.bus_stops.includes(node)) {
        const at = stopPlacement(this.map, node);
        this.player.position.set(at.x - at.right[0] * 2.4 + at.dir[0] * 3, 0, at.z - at.right[1] * 2.4 + at.dir[1] * 3);
        j.waitFacing = Math.atan2(-at.right[0], -at.right[1]);
      } else {
        this.player.position.set(x + 5.5, 0, z + 1);
        j.waitFacing = -Math.PI / 2;
      }
      // the vehicle will come in along the ride path, from behind
      if (ride) {
        j.vehicle = makeVehicle(ride.mode);
        j.vehicle.visible = false;
        this.scene.add(j.vehicle);
        const m = new Mover(ride.points, { offset: 2 });
        const start = m.at(0);
        const back = { x: start.x - Math.sin(start.heading) * 60, z: start.z - Math.cos(start.heading) * 60 };
        j.approach = { from: back, to: start };
      }
    } else if (seg.kind === "ride") {
      if (!j.vehicle) {
        j.vehicle = makeVehicle(seg.mode);
        this.scene.add(j.vehicle);
      }
      j.vehicle.visible = true;
      const len = this._pathLength(seg.points);
      j.mover = new Mover(seg.points, { speed: len / Math.max(0.3, seg.real), offset: 2 });
      this.player.visible = false;
    }
  }

  _pathLength(points) {
    let l = 0;
    for (let i = 1; i < points.length; i++) l += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return l;
  }

  _updateJourney(dt) {
    const j = this.journey;
    const seg = j.segs[j.i];
    j.t += dt;
    j.elapsed += dt;
    const frac = Math.min(1, j.t / Math.max(0.01, seg.real));
    if (seg.kind === "walk") {
      const p = j.mover.update(dt);
      this.player.position.set(p.x, 0, p.z);
      this.player.rotation.y = p.heading;
      this.player.walk(dt, Math.min(12, j.mover.speed));
    } else if (seg.kind === "wait") {
      this.player.walk(dt, 0);
      this.player.rotation.y = j.waitFacing ?? -Math.PI / 2;
      if (j.vehicle && j.approach) {
        const arrive = Math.max(0, (frac - 0.6) / 0.4);
        j.vehicle.visible = frac > 0.6;
        const { from, to } = j.approach;
        const e = 1 - (1 - arrive) * (1 - arrive);
        j.vehicle.position.set(lerp(from.x, to.x, e), 0, lerp(from.z, to.z, e));
        j.vehicle.rotation.y = to.heading;
      }
    } else if (seg.kind === "ride" && j.vehicle) {
      const p = j.mover.update(dt);
      j.vehicle.position.set(p.x, 0, p.z);
      j.vehicle.rotation.y = lerpAngle(j.vehicle.rotation.y, p.heading, Math.min(1, dt * 8));
      this.player.position.set(p.x, 0, p.z);
    }
    j.onProgress?.(Math.min(1, j.elapsed / j.duration), seg);
    if (j.t >= seg.real) this._nextSegment();
  }

  /** Stop the journey (finished, or the player tapped Skip) and put the player at the destination. */
  endJourney(callDone = true) {
    const j = this.journey;
    if (!j) return;
    this.journey = null;
    if (j.vehicle) this.scene.remove(j.vehicle);
    const last = j.trip.segments[j.trip.segments.length - 1];
    if (last) {
      const [x, z] = last.points[last.points.length - 1];
      this.player.position.set(x, 0, z);
    }
    this.player.visible = true;
    if (callDone) j.onDone?.();
  }

  // --- The frame loop ------------------------------------------------------------------------------

  _frame() {
    if (this.disposed) return;
    const raw = Math.min(0.5, this.clock.getDelta());
    const dt = Math.min(0.05, raw); // animation step; journeys use real time so slow phones aren't slower
    this._updateTraffic(dt);
    const p = this.player.position;

    if (this.journey) {
      this._updateJourney(raw);
    } else if (!this.inside) {
      const mv = this._moveVector();
      const step = Math.min(raw, 0.15); // real time, so a slow phone doesn't walk slower
      const run = this.running || this.keys.has("shift");
      const speed = WALK_SPEED * (run ? RUN_FACTOR : 1);
      let want = new THREE.Vector2(0, 0);
      if (mv.len > 0.05) {
        // forward is away from the camera
        const fx = -Math.sin(this.camYaw);
        const fz = -Math.cos(this.camYaw);
        const rx = -fz;
        const rz = fx;
        want.set(fx * mv.y + rx * mv.x, fz * mv.y + rz * mv.x).multiplyScalar(speed * mv.len);
      } else if (this.autoPath) {
        const [tx, tz] = this.autoPath[0];
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        const last = this.autoPath.length === 1;
        if (d < (last ? 0.8 : 3)) {
          this.autoPath.shift();
          if (!this.autoPath.length) this.cancelAutoWalk();
        } else {
          const slow = last ? Math.min(1, d / 4) : 1; // ease in to the stop
          want.set(dx / d, dz / d).multiplyScalar(speed * slow);
        }
      }
      // ease towards the wanted velocity: no instant starts and stops
      this.vel.lerp(want, Math.min(1, step * ACCEL));
      const v = this.vel.length();
      if (v > 0.05) {
        const ox = p.x;
        const oz = p.z;
        const [nx, nz] = this._collide(p.x + this.vel.x * step, p.z + this.vel.y * step);
        p.x = nx;
        p.z = nz;
        // slide along walls: if we were pushed back, keep the part of the motion that's free
        if (Math.hypot(nx - ox, nz - oz) < v * step * 0.3 && this.autoPath) this._unstick();
        this.player.rotation.y = lerpAngle(this.player.rotation.y, Math.atan2(this.vel.x, this.vel.y), Math.min(1, dt * 10));
        if (mv.len > 0.05 || this.autoPath) {
          this.camYaw = lerpAngle(this.camYaw, this.player.rotation.y + Math.PI, Math.min(1, dt * 0.9 * Math.min(1, v / WALK_SPEED)));
        }
      }
      this.player.walk(dt, v);
      this._checkDoors();
    } else {
      this.camYaw += dt * 0.12; // slow orbit while you're inside
    }

    // camera follows the player (or the vehicle you're in)
    const focus = this.journey?.vehicle?.visible && this.journey.segs[this.journey.i]?.kind === "ride"
      ? this.journey.vehicle.position : p;
    this.target.lerp(focus, Math.min(1, (this.journey ? raw : dt) * 7));
    const dist = this.inside ? this.camDist * 1.8 : this.journey ? this.camDist * 1.35 : this.camDist;
    const height = this.inside ? this.camHeight * 2.2 : this.camHeight * (this.journey ? 1.5 : 1);
    const want = new THREE.Vector3(this.target.x + Math.sin(this.camYaw) * dist, height, this.target.z + Math.cos(this.camYaw) * dist);
    const clear = this._clearFraction(this.target, want);
    this.camFrac = lerp(this.camFrac ?? 1, clear, Math.min(1, dt * (clear < (this.camFrac ?? 1) ? 12 : 2)));
    this.camera.position.set(
      this.target.x + (want.x - this.target.x) * this.camFrac,
      lerp(height + 6, height, this.camFrac),
      this.target.z + (want.z - this.target.z) * this.camFrac,
    );
    this.camera.lookAt(this.target.x, 2.5, this.target.z);

    if (this.shadows) {
      // keep the sun's direction but centre its shadow box on you
      this.sun.position.copy(this.target).add(this.sunDir);
      this.sun.target.position.copy(this.target);
    }
    this.sky.position.copy(this.camera.position);
    this.clouds.position.x = this.target.x + ((performance.now() / 1000) * 0.8) % 600 - 300;
    this.clouds.position.z = this.target.z;

    // door rings pulse; vehicle headlights at night
    const pulse = 0.55 + Math.sin(performance.now() / 300) * 0.3;
    for (const d of this.world.doors) d.ring.material.opacity = d === this.nearDoor ? 1 : pulse;
    this.renderer.render(this.scene, this.camera);
  }

  _unstick() {
    // stuck on a corner while auto-walking: aim for the nearest road junction first
    const p = this.player.position;
    const n = Object.values(this.map.nodes).reduce((a, b) => (Math.hypot(b[0] - p.x, b[1] - p.z) < Math.hypot(a[0] - p.x, a[1] - p.z) ? b : a));
    if (this.autoPath && (this.autoPath[0][0] !== n[0] || this.autoPath[0][1] !== n[1])) this.autoPath.unshift(n);
  }

  /** How far along the line from the player to the camera we can go before hitting a building. */
  _clearFraction(from, to) {
    const steps = 18;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = 2.5 + (to.y - 2.5) * t;
      const z = from.z + (to.z - from.z) * t;
      for (const c of this.world.colliders) {
        if (y < c.h && x > c.x0 - 1 && x < c.x1 + 1 && z > c.z0 - 1 && z < c.z1 + 1) return Math.max(0.22, (k - 1.5) / steps);
      }
    }
    return 1;
  }

  _checkDoors() {
    const p = this.player.position;
    let best = null;
    let bestD = DOOR_TRIGGER;
    for (const d of this.world.doors) {
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < bestD) {
        best = d;
        bestD = dist;
      }
    }
    if (best !== this.nearDoor) {
      this.nearDoor = best;
      this.onNearDoor(best ? { id: best.id, name: best.name } : null);
    }
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    // phones in portrait: pull back so you can see the road ahead
    this.camera.fov = w < h ? 62 : 52;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("keydown", this._keydown);
    window.removeEventListener("keyup", this._keyup);
    this._ro?.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** A big dome with a gradient: deeper blue overhead, hazy at the horizon. */
function makeSky() {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color("#4a8fd0") },
      horizon: { value: new THREE.Color("#cfe6f5") },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color("#fff3d6") },
    },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(d, 900.0) * 1.6 + pow(d, 12.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function makeClouds() {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, fog: false });
    for (let k = 0; k < 5; k++) {
      const puff = new THREE.Mesh(geo, material);
      puff.scale.set(14 + rand() * 12, 5 + rand() * 4, 10 + rand() * 8);
      puff.position.set(k * 12 - 24 + rand() * 6, rand() * 3, rand() * 8);
      cloud.add(puff);
    }
    cloud.position.set(rand() * 700 - 350, 150 + rand() * 60, rand() * 600 - 300);
    cloud.material = material; // the puffs share it, so tinting this tints the cloud
    g.add(cloud);
  }
  return g;
}

function setSky(sky, horizon, minute, daylight, sunDir) {
  sky.material.uniforms.horizon.value.copy(horizon);
  if (sunDir) sky.material.uniforms.sunDir.value.copy(sunDir).normalize();
  sky.material.uniforms.sunColor.value.set(daylight > 0.05 ? (daylight < 0.4 ? "#ffb070" : "#fff3d6") : "#000000");
  const top = new THREE.Color(daylight > 0.3 ? "#3f86d6" : "#070d22").lerp(new THREE.Color("#3f86d6"), daylight * 0.3);
  sky.material.uniforms.top.value.copy(top);
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
