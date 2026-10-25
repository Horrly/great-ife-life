// The 3D campus: renders the world, moves your student, runs the buses and the crowds, and plays
// journeys back. React owns everything on top (HUD, menus); this class only draws.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makePerson, randomLook, setQuality } from "./characters";
import RoomView from "./room";
import { buildGraph, Mover, pointsFor, route } from "./traffic";
import { makeBus, makeCab, makeKeke, makeTownBus, makeVehicle } from "./vehicles";
import { buildWorld, stopPlacement } from "./world";
import { nameFor } from "./look";

const WALKER_ROLES = ["100L student", "200L student", "300L student", "400L student", "Final-year student", "Postgraduate student",
  "Course rep", "Corps member", "Hall porter's son", "Exchange student"];

// People are drawn at 1.88 world units to the metre, so a real brisk walk (about 1.5 m/s) is ~3 units a
// second and a jog (about 3 m/s) is ~6. Anything faster looked like everyone was rushing to an exam.
const WALK_SPEED = 3.0;
const RUN_FACTOR = 2.0; // the Run button: a steady jog, not a sprint
const ACCEL = 5; // how quickly you speed up and slow down (people don't start and stop instantly)
const DOOR_TRIGGER = 7;
let BOUNDS = { x0: -230, x1: 470, z0: -40, z1: 360 }; // replaced by the map's own bounds

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
  constructor(container, map, { look, pos, onNearDoor, onRoomTap, onPersonTap, lowPower = false } = {}) {
    this.container = container;
    this.opts = { onRoomTap, onPersonTap };
    this.map = map;
    if (map.bounds) BOUNDS = { x0: map.bounds.x0 - 30, x1: map.bounds.x1 + 30, z0: map.bounds.z0 - 30, z1: map.bounds.z1 + 30 };
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
    // how many campus people get the full body at once: fewer on weak phones
    this.fullPeople = lowPower ? 4 : 10;
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
    const apply = (root) =>
      root.traverse((o) => {
        if (o.isMesh && !o.userData.blob) o.castShadow = true;
        if (o.userData.blob) o.visible = false; // real shadows replace the blob
      });
    apply(person);
    person.userData.onSwap = apply; // when the real body arrives
  }

  /** Only the people nearest the camera get the full body; the rest are light stand-ins. */
  _peopleDetail(dt) {
    this._lodT = (this._lodT || 0) - dt;
    if (this._lodT > 0) return;
    this._lodT = 0.6;
    const me = this.player.position;
    const near = [];
    for (const w of this.walkers) if (w.person.visible) near.push(w.person);
    for (const q of this.queues) if (q.person.visible) near.push(q.person);
    near.sort((a, b) => a.position.distanceToSquared(me) - b.position.distanceToSquared(me));
    near.forEach((p, i) => {
      const d = p.position.distanceTo(me);
      // a little slack so people don't flicker between the two at the edge
      const full = p.isReal() ? i < this.fullPeople + 2 && d < 110 : i < this.fullPeople && d < 90;
      p.setDetail(full);
    });
  }

  // --- People and vehicles -----------------------------------------------------------------------

  _makeCrowds() {
    const rand = seeded(1234);
    const nodes = Object.keys(this.map.nodes).filter((n) => n !== "town");
    this.walkers = [];
    for (let i = 0; i < 42; i++) {
      const look = randomLook(rand);
      const person = makePerson(look, { bag: rand() < 0.7 });
      person.setDetail(false);
      const from = nodes[Math.floor(rand() * nodes.length)];
      const w = { person, mover: null, node: from, speed: 2.3 + rand() * 0.9, side: rand() < 0.5 ? 1 : -1,
        look, name: nameFor(look, rand), role: WALKER_ROLES[Math.floor(rand() * WALKER_ROLES.length)], pause: 0, chatCd: rand() * 20 };
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
        p.setDetail(false);
        p.act(["idle", "phone", "fold", "idle", "talk"][Math.floor(rand() * 5)]);
        const along = (i - 2) * 1.5;
        p.position.set(at.x + at.dir[0] * along - at.right[0] * 2.2, 0, at.z + at.dir[1] * along - at.right[1] * 2.2);
        p.rotation.y = Math.atan2(-at.right[0], -at.right[1]);
        this.scene.add(p);
        this.queues.push({ person: p, rank: i });
      }
    }
  }

  /** Where people head at this time of day: class in the morning, food at lunch, halls and the library at night. */
  _destinations() {
    if (!this._dest) {
      const by = (kinds) => [...new Set(Object.values(this.map.buildings).filter((b) => kinds.includes(b.kind)).map((b) => b.node))];
      this._dest = { halls: by(["hall", "home"]), classes: by(["lecture", "faculty"]), food: by(["food", "shop", "market"]),
        campus: by(["campus", "library", "bank", "sports"]), all: Object.keys(this.map.nodes).filter((n) => n !== "town") };
      for (const k of Object.keys(this._dest)) if (!this._dest[k].length) this._dest[k] = this._dest.all;
    }
    const m = this.minute;
    const d = this._dest;
    if (m >= 420 && m < 600) return [[d.classes, 0.65], [d.food, 0.1], [d.all, 0.25]];
    if (m >= 600 && m < 720) return [[d.classes, 0.4], [d.campus, 0.3], [d.all, 0.3]];
    if (m >= 720 && m < 840) return [[d.food, 0.5], [d.classes, 0.25], [d.all, 0.25]];
    if (m >= 840 && m < 1020) return [[d.classes, 0.35], [d.campus, 0.3], [d.halls, 0.35]];
    if (m >= 1020 && m < 1200) return [[d.halls, 0.45], [d.food, 0.25], [d.campus, 0.3]];
    return [[d.halls, 0.6], [d.campus, 0.25], [d.all, 0.15]];
  }

  _newWalk(w, rand = this.rand) {
    let list = this._destinations();
    let r = rand();
    let pool = list[list.length - 1][0];
    for (const [l, p] of list) {
      if ((r -= p) <= 0) {
        pool = l;
        break;
      }
    }
    list = pool.filter((n) => n !== w.node);
    const to = list.length ? list[Math.floor(rand() * list.length)] : Object.keys(this.map.nodes).find((n) => n !== w.node);
    const path = route(this.graph, w.node, to);
    w.to = to;
    const pts = pointsFor(this.map, path);
    if (w.startAt) {
      // carry on from where they're standing (after stopping to talk), not from the junction
      pts.unshift(w.startAt);
      w.startAt = null;
    }
    w.mover = new Mover(pts, { speed: w.speed, offset: w.side * 5.6 });
  }

  _makeTraffic() {
    this.vehicles = [];
    const loop = pointsFor(this.map, this.map.bus_route);
    const stops = new Set(this.map.bus_stops);
    for (let i = 0; i < 3; i++) {
      const mesh = makeBus();
      const mover = new Mover(loop, { speed: 9, offset: 2, loop: true });
      mover.s = (mover.total * i) / 3;
      this.scene.add(mesh);
      this.vehicles.push({ mesh, mover, kind: "bus", stops, lastStop: null });
    }
    const nodes = Object.keys(this.map.nodes).filter((n) => n !== "town");
    for (let i = 0; i < 5; i++) {
      const mesh = makeKeke(["#e9c227", "#7fb03a", "#e9c227", "#7fb03a", "#e9c227"][i]);
      const v = { mesh, kind: "keke", node: nodes[(i * 5) % nodes.length], speed: 8 };
      this._newDrive(v);
      v.mover.s = this.rand() * v.mover.total;
      this.scene.add(mesh);
      this.vehicles.push(v);
    }
    // night cabs: only between the Main Gate and the bus stops, only after 9 PM
    for (let i = 0; i < 2; i++) {
      const mesh = makeCab(i ? "#2f6fae" : "#f0b72f");
      const v = { mesh, kind: "cab", node: "gate", speed: 10 };
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
      mover: new Mover(pointsFor(this.map, ["town", "gate", "town"]), { speed: 9, offset: 2, loop: true }) });
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
    // How many are out: packed when classes change (ten to the hour till ten past), quiet late at night
    const m = this.minute;
    const changeover = m >= 470 && m < 1030 && (m % 60 >= 50 || m % 60 < 10);
    const share = m < 330 || m >= 1350 ? 0.08 : m < 390 ? 0.3 : changeover || busy ? 1 : m >= 1260 ? 0.3 : m >= 1110 ? 0.55 : 0.65;
    const wet = this.weather === "rain" ? 0.5 : this.weather === "heavy" ? 0.25 : 1; // people stay in when it pours
    const active = Math.max(3, Math.round(this.walkers.length * share * wet));
    this._chatCheck = (this._chatCheck || 0) - dt;
    const checkChats = this._chatCheck <= 0;
    if (checkChats) this._chatCheck = 0.5;
    this.walkers.forEach((w, i) => {
      w.person.visible = i < active || w.pause > 0;
      if (!w.person.visible) return;
      w.chatCd -= dt;
      if (w.pause > 0) {
        // stopped: chatting with a friend, or talking to you
        w.pause -= dt;
        if (w === this.chatWith) {
          const me = this.player.position;
          const d = Math.hypot(me.x - w.person.position.x, me.z - w.person.position.z);
          if (d > 4) {
            const step = Math.min(d - 4, 1.4 * dt);
            w.person.position.x += ((me.x - w.person.position.x) / d) * step;
            w.person.position.z += ((me.z - w.person.position.z) / d) * step;
            w.person.walk(dt, 1.4);
            w.person.rotation.y = Math.atan2(me.x - w.person.position.x, me.z - w.person.position.z);
            return;
          }
        }
        if (w.faceTo) {
          const want = Math.atan2(w.faceTo.x - w.person.position.x, w.faceTo.z - w.person.position.z);
          w.person.rotation.y = lerpAngle(w.person.rotation.y, want, Math.min(1, dt * 5));
        }
        w.person.tick(dt);
        if (w.pause <= 0) {
          w.faceTo = null;
          w.chatCd = 25 + Math.random() * 30;
        }
        return;
      }
      if (checkChats && w.chatCd <= 0) {
        // bump into a friend: stop and gist for a bit
        const pos = w.person.position;
        const friend = this.walkers.find((o, j) => j !== i && j < active && o.pause <= 0 && o.chatCd <= 0
          && Math.hypot(o.person.position.x - pos.x, o.person.position.z - pos.z) < 3.5);
        if (friend && Math.random() < 0.35) {
          const t = 6 + Math.random() * 8;
          for (const [a, b] of [[w, friend], [friend, w]]) {
            a.pause = t;
            a.faceTo = b.person.position;
            a.person.act(Math.random() < 0.5 ? "talk" : "idle");
          }
          return;
        }
        w.chatCd = 3 + Math.random() * 5;
      }
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
      if (q.person.visible) q.person.tick(dt);
    }
    for (const v of this.vehicles) {
      if (v.kind === "bus") v.mesh.visible = busHours;
      if (v.kind === "keke" || v.kind === "parked_keke") v.mesh.visible = this.minute >= 360 && this.minute < 1320;
      if (v.kind === "cab") v.mesh.visible = this.minute >= 1260 || this.minute < 360;
      if (v.kind === "parked_keke" || !v.mesh.visible || v === this.journey?.vehicle) continue;
      // slow down and stop if you're standing in the road ahead
      const me = this.player.position;
      const hx = Math.sin(v.mesh.rotation.y);
      const hz = Math.cos(v.mesh.rotation.y);
      const rx = me.x - v.mesh.position.x;
      const rz = me.z - v.mesh.position.z;
      const ahead = rx * hx + rz * hz;
      const side = Math.abs(rx * hz - rz * hx);
      const yieldTo = this.player.visible && !this.inside && !this.journey && ahead > 0 && ahead < 14 && side < 3.2;
      v.brake = lerp(v.brake ?? 1, yieldTo ? Math.max(0, (ahead - 6) / 8) : 1, Math.min(1, dt * 4));
      if (yieldTo && ahead < 9 && !v.honked && v.kind !== "bus") {
        v.honked = true;
        this.onHonk?.();
      }
      if (!yieldTo) v.honked = false;
      const p = v.mover.update(dt * v.brake);
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

  /** Rain or shine (from the server, the same for everyone): drops, a grey sky, dimmer light, fewer people out. */
  setWeather(w) {
    const kind = w?.rain ? (w.heavy ? "heavy" : "rain") : w?.label === "Cloudy" ? "cloudy" : "clear";
    if (kind === this.weather) return;
    this.weather = kind;
    const wet = kind === "rain" || kind === "heavy";
    if (wet && !this.rain) {
      const n = this.lowPower ? 500 : 1400;
      const pos = new Float32Array(n * 6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#dfe8f1", transparent: true, opacity: 0.75 }));
      this.rain.frustumCulled = false;
      this.rainDrops = Array.from({ length: n }, () => [Math.random() * 120 - 60, Math.random() * 60, Math.random() * 120 - 60]);
      this.scene.add(this.rain);
    }
    if (this.rain) this.rain.visible = wet && !this.mapMode;
    this.setMinute(this.realMinute ?? this.minute ?? 720);
  }

  _tickRain(dt) {
    if (!this.rain?.visible) return;
    const heavy = this.weather === "heavy";
    const fall = heavy ? 19 : 16; // about 9 m/s: real raindrops, not a blur
    const n = heavy ? this.rainDrops.length : Math.floor(this.rainDrops.length * 0.55);
    const arr = this.rain.geometry.attributes.position.array;
    const c = this.target;
    for (let i = 0; i < this.rainDrops.length; i++) {
      const d = this.rainDrops[i];
      d[1] -= fall * dt;
      d[0] += 1.2 * dt; // a light wind
      if (d[1] < 0) {
        d[1] += 60;
        d[0] = Math.random() * 120 - 60;
        d[2] = Math.random() * 120 - 60;
      }
      const o = i * 6;
      if (i >= n) {
        arr.fill(0, o, o + 6);
        continue;
      }
      const x = c.x + d[0];
      const z = c.z + d[2];
      arr[o] = x;
      arr[o + 1] = d[1];
      arr[o + 2] = z;
      arr[o + 3] = x - 0.08;
      arr[o + 4] = d[1] + (heavy ? 1.3 : 0.9);
      arr[o + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }

  setMinute(minute) {
    this.realMinute = ((minute % 1440) + 1440) % 1440;
    // the map is always drawn in daylight so you can read it, like a printed campus map
    this.minute = this.mapMode ? 780 : this.realMinute;
    if (this.roomView) this.roomView.setMinute(this.minute, this.noLight);
    const m = this.minute;
    const sky = skyAt(m);
    // overcast and rain wash the sky grey and dim the sun (the printed-style map stays bright)
    const gloom = this.mapMode ? 0 : { cloudy: 0.25, rain: 0.55, heavy: 0.75 }[this.weather] || 0;
    if (gloom) sky.lerp(new THREE.Color("#6f7a84").multiplyScalar(0.35 + 0.65 * Math.max(0.15, Math.sin(Math.PI * Math.min(1, Math.max(0, (m - 375) / 750))))), gloom);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    if (!this.mapMode) [this.scene.fog.near, this.scene.fog.far] = gloom > 0.5 ? [70, 300] : gloom ? [130, 460] : [160, 520];
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
    this.sun.intensity = (0.05 + daylight * (this.shadows ? 2.4 : 1.7)) * (1 - gloom * 0.8);
    this.sun.color.set(daylight < 0.4 ? "#ffc58a" : "#fff1d6");
    this.hemi.intensity = (0.2 + daylight * (this.shadows ? 0.6 : 1.0)) * (1 - gloom * 0.25);
    this.hemi.color.set(daylight < 0.25 ? "#5a6f9e" : "#cfe6ff"); // moonlight blue at night
    this.ambient.intensity = 0.05 + daylight * 0.22;
    const night = 1 - daylight;
    const lampOn = night > 0.55 || (gloom > 0.6 && night > 0.3);
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
    const touches = new Map(); // for pinch-zoom on the map
    this._pd = (e) => {
      touches.set(e.pointerId, [e.clientX, e.clientY]);
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, id: e.pointerId, t: performance.now() };
      el.setPointerCapture?.(e.pointerId);
    };
    this._pm = (e) => {
      if (this.mapMode) {
        const before = touches.get(e.pointerId);
        if (!before) return;
        if (touches.size >= 2) {
          const [a, b] = [...touches.values()];
          const d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
          touches.set(e.pointerId, [e.clientX, e.clientY]);
          const [c, d] = [...touches.values()];
          const d1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
          if (d0 > 0) this.mapZoom = Math.max(0.45, Math.min(3.2, this.mapZoom * (d1 / d0)));
          return;
        }
        // drag the map: the ground moves with your finger
        const k = this._mapHeight() / (this.renderer.domElement.clientHeight || 800) * 1.15;
        this.mapT.x -= (e.clientX - before[0]) * k;
        this.mapT.z -= (e.clientY - before[1]) * k * 1.25;
        this._clampMap();
        touches.set(e.pointerId, [e.clientX, e.clientY]);
        return;
      }
      if (this.roomMode && this.roomView) {
        // inside: drag to look round the room, pinch to zoom
        const before = touches.get(e.pointerId);
        if (touches.size >= 2 && before) {
          const [a, b] = [...touches.values()];
          const d0 = Math.hypot(a[0] - b[0], a[1] - b[1]);
          touches.set(e.pointerId, [e.clientX, e.clientY]);
          const [c, d] = [...touches.values()];
          const d1 = Math.hypot(c[0] - d[0], c[1] - d[1]);
          if (d0 > 0 && d1 > 0) this.roomView.zoomBy(d0 / d1);
          return;
        }
        if (!drag || drag.id !== e.pointerId) return;
        this.roomView.orbit(e.clientX - drag.x, e.clientY - (drag.y ?? e.clientY));
        drag.x = e.clientX;
        drag.y = e.clientY;
        touches.set(e.pointerId, [e.clientX, e.clientY]);
        return;
      }
      if (!drag || drag.id !== e.pointerId) return;
      this.camYaw -= (e.clientX - drag.x) * 0.008;
      drag.x = e.clientX;
    };
    this._pu = (e) => {
      touches.delete(e.pointerId);
      if (this.mapMode) {
        drag = null;
        return;
      }
      // a quick tap (not a drag): a person opens their sheet, anywhere else walks you there
      if (drag && e.type === "pointerup" && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 10
          && performance.now() - drag.t < 400) {
        if (this.roomMode && this.roomView) this._tapRoom(e.clientX, e.clientY);
        else if (!this._tapWalker(e.clientX, e.clientY)) this._tapToWalk(e.clientX, e.clientY);
      }
      drag = null;
    };
    el.addEventListener("pointerdown", this._pd);
    el.addEventListener("pointermove", this._pm);
    el.addEventListener("pointerup", this._pu);
    el.addEventListener("pointercancel", this._pu);
    this._wheel = (e) => {
      if (this.mapMode) this.mapZoom = Math.max(0.45, Math.min(3.2, this.mapZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      else if (this.roomMode && this.roomView) this.roomView.zoomBy(e.deltaY > 0 ? 1.08 : 0.93);
      else this.camDist = Math.max(6, Math.min(60, this.camDist + e.deltaY * 0.03));
      e.preventDefault();
    };
    el.addEventListener("wheel", this._wheel, { passive: false });
  }

  // --- The map: the same 3D campus seen from above, north up, with React pins on top -------------

  /** Turn the map view on or off. focus = [x, z] to centre on (default: you). */
  setMapMode(on, focus) {
    this.mapMode = Boolean(on);
    if (this.rain) this.rain.visible = !this.mapMode && (this.weather === "rain" || this.weather === "heavy");
    if (this.mapMode) {
      const p = focus || [this.player.position.x, this.player.position.z];
      this.mapT = new THREE.Vector3(p[0], 0, p[1]);
      this.mapZoom = this.mapZoom || 0.8;
      if (this.clouds) this.clouds.visible = false;
      this._fogWas = [this.scene.fog.near, this.scene.fog.far];
      this.scene.fog.near = 900;
      this.scene.fog.far = 2400;
      for (const s of this.world.labels || []) s.visible = false;
      this._clampMap();
      this.setMinute(this.realMinute ?? this.minute);
      [this.scene.fog.near, this.scene.fog.far] = [900, 2400];
    } else if (this._fogWas) {
      if (this.clouds) this.clouds.visible = true;
      this.setMinute(this.realMinute ?? this.minute);
      [this.scene.fog.near, this.scene.fog.far] = this._fogWas;
    }
  }

  mapCentre(x, z) {
    if (!this.mapT) return;
    this.mapT.set(x, 0, z);
    this._clampMap();
  }

  zoomMap(factor) {
    this.mapZoom = Math.max(0.45, Math.min(3.2, (this.mapZoom || 1) * factor));
  }

  _mapHeight() {
    return 230 / (this.mapZoom || 1);
  }

  _clampMap() {
    const b = this.map.bounds;
    this.mapT.x = Math.max(b.x0 - 260, Math.min(b.x1 + 40, this.mapT.x));
    this.mapT.z = Math.max(b.z0 - 40, Math.min(b.z1 + 260, this.mapT.z));
  }

  /** Where points [x, y, z] are on the screen: [{ x, y, on }] in CSS pixels. */
  project(points) {
    const el = this.renderer.domElement;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    const v = this._projV || (this._projV = new THREE.Vector3());
    return points.map(([x, y, z]) => {
      v.set(x, y, z).project(this.camera);
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, on: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 };
    });
  }

  _mapCamera() {
    const h = this._mapHeight();
    this.camera.position.set(this.mapT.x, h, this.mapT.z + h * 0.45);
    this.camera.lookAt(this.mapT.x, 0, this.mapT.z - h * 0.05);
    this.sky.position.copy(this.camera.position);
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

  /** Tap someone walking about campus: they stop, turn to you, and their sheet opens (like Lagos Life). */
  _tapWalker(clientX, clientY) {
    if (this.inside || this.journey || !this.opts.onPersonTap) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    let best = null;
    let bestD = 44; // px: generous, people are small on a phone
    for (const w of this.walkers) {
      if (!w.person.visible) continue;
      for (const y of [1.2, 2.4, 3.4]) {
        v.set(w.person.position.x, y, w.person.position.z).project(this.camera);
        if (v.z > 1) continue;
        const d = Math.hypot((v.x + 1) / 2 * rect.width + rect.left - clientX, (1 - v.y) / 2 * rect.height + rect.top - clientY);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
    }
    if (!best) return false;
    const far = Math.hypot(best.person.position.x - this.player.position.x, best.person.position.z - this.player.position.z);
    if (far > 40) return false; // too far to call over: tapping there just walks you that way
    best.pause = 1e9; // until you're done talking
    best.faceTo = this.player.position;
    best.person.act("idle");
    this.talkingTo = best;
    this.chatWith = best; // you walk over to them (and they come a few steps towards you)
    this.chatTalking = false;
    // and you face them
    this.cancelAutoWalk();
    this.player.rotation.y = Math.atan2(best.person.position.x - this.player.position.x, best.person.position.z - this.player.position.z);
    this.opts.onPersonTap({ kind: "npc", name: best.name, look: best.look, role: best.role });
    return true;
  }

  /** The person you were talking to goes on their way after a moment. */
  releaseWalker() {
    const w = this.talkingTo;
    if (w) {
      w.pause = 1.5;
      const at = w.person.position;
      w.node = Object.keys(this.map.nodes).filter((n) => n !== "town")
        .reduce((a, n) => (Math.hypot(this.map.nodes[n][0] - at.x, this.map.nodes[n][1] - at.z)
          < Math.hypot(this.map.nodes[a][0] - at.x, this.map.nodes[a][1] - at.z) ? n : a), "gate");
      w.startAt = [at.x, at.z];
      this._newWalk(w);
    }
    this.talkingTo = null;
    this.chatWith = null;
    this.chatActive = false;
    this.chatTalking = false;
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
    this.camDist = Math.max(6, Math.min(60, this.camDist + delta)); // zoom right in to see faces
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
      // a trek is shown sped up, but the legs keep a normal walking rhythm: nobody sprints to class
      this.player.walk(dt, WALK_SPEED * 1.05);
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
    this._peopleDetail(raw);
    const p = this.player.position;

    if (this.journey) {
      this._updateJourney(raw);
    } else if (!this.inside && this.chatWith) {
      // walk up to the person you're talking to, then talk with your hands
      const w = this.chatWith;
      const dx = w.person.position.x - p.x;
      const dz = w.person.position.z - p.z;
      const d = Math.hypot(dx, dz);
      this.player.rotation.y = lerpAngle(this.player.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      if (d > 2.35) {
        const step = Math.min(d - 2.2, WALK_SPEED * raw);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.player.walk(dt, WALK_SPEED);
        this.chatTalking = false;
      } else if (this.chatActive) {
        if (!this.chatTalking) {
          this.chatTalking = true;
          this.player.act("talk");
          w.person.act("talk");
        }
        this.player.tick(dt);
      } else {
        // face to face, waiting for you to pick what to say
        if (this.chatTalking) {
          this.chatTalking = false;
          w.person.act("idle");
        }
        this.player.walk(dt, 0);
      }
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
        // Only settle the camera behind you when walking forwards or tap-walking. Following
        // sideways joystick input makes you run in circles and the whole campus spins.
        const forwards = mv.len > 0.05 && mv.y > Math.abs(mv.x) * 1.5;
        if (forwards || (this.autoPath && mv.len <= 0.05)) {
          this.camYaw = lerpAngle(this.camYaw, this.player.rotation.y + Math.PI, Math.min(1, dt * 0.9 * Math.min(1, v / WALK_SPEED)));
        }
      }
      // standing still for a while: check your phone, fold your arms, shift your weight… like a real person
      if (v > 0.05 || mv.len > 0.05 || this.autoPath) {
        this.stillFor = 0;
        this.idleAct = null;
        this.player.walk(dt, v);
      } else {
        this.stillFor = (this.stillFor || 0) + raw;
        if (this.stillFor > 6 && (!this.idleAct || this.stillFor > this.idleUntil)) {
          const options = ["phone", "fold", "idle", "phone", "idle", "talk"].filter((a) => a !== this.idleAct);
          this.idleAct = options[Math.floor(Math.random() * options.length)];
          this.idleUntil = this.stillFor + 7 + Math.random() * 8;
          this.player.act(this.idleAct);
        }
        if (this.idleAct) this.player.tick(dt);
        else this.player.walk(dt, 0);
      }
      this._checkDoors();
    }
    if (this.mapMode) {
      this._mapCamera();
      if (this.camera.far < 3000) {
        this.camera.far = 3000;
        this.camera.updateProjectionMatrix();
      }
      for (const d of this.world.doors) d.ring.material.opacity = 0;
      this.renderer.render(this.scene, this.camera);
      if (this.onMapFrame) this.onMapFrame();
      return;
    }
    if (this.roomMode && this.roomView) {
      // inside your own room: draw the room instead of the campus
      this.roomView.tick(raw);
      this.roomView.render(this.renderer, raw);
      return;
    }

    // camera follows the player (or the vehicle you're in)
    // talking to someone outside: a face-to-face close-up from the side, like a cutscene
    const talk = Boolean(this.chatWith && this.chatTalking && !this.journey && !this.inside);
    this.talkK = lerp(this.talkK || 0, talk ? 1 : 0, Math.min(1, dt * 4));
    let focus = this.journey?.vehicle?.visible && this.journey.segs[this.journey.i]?.kind === "ride"
      ? this.journey.vehicle.position : p;
    if (talk) {
      const o = this.chatWith.person.position;
      focus = new THREE.Vector3((p.x + o.x) / 2, 0, (p.z + o.z) / 2);
      const line = Math.atan2(o.x - p.x, o.z - p.z);
      const a = line + Math.PI / 2;
      const b = line - Math.PI / 2;
      const side = Math.abs(lerpAngle(this.camYaw, a, 1) - this.camYaw) < Math.abs(lerpAngle(this.camYaw, b, 1) - this.camYaw) ? a : b;
      this.camYaw = lerpAngle(this.camYaw, side, Math.min(1, dt * 2));
    }
    this.target.lerp(focus, Math.min(1, (this.journey ? raw : dt) * 7));
    // closer in means a lower, more level camera: zoomed right in you see faces, not the tops of heads
    const level = Math.max(0.3, Math.min(1, this.camDist / 24));
    let dist = this.inside ? this.camDist * 1.8 : this.journey ? this.camDist * 1.35 : this.camDist;
    let height = this.inside ? this.camHeight * 2.2 : this.camHeight * (this.journey ? 1.5 : level);
    if (this.talkK > 0.01) {
      dist = lerp(dist, 7.5, this.talkK);
      height = lerp(height, 3.6, this.talkK);
    }
    const want = new THREE.Vector3(this.target.x + Math.sin(this.camYaw) * dist, height, this.target.z + Math.cos(this.camYaw) * dist);
    const clear = this._clearFraction(this.target, want);
    this.camFrac = lerp(this.camFrac ?? 1, clear, Math.min(1, dt * (clear < (this.camFrac ?? 1) ? 12 : 2)));
    this.camera.position.set(
      this.target.x + (want.x - this.target.x) * this.camFrac,
      lerp(height + 6, height, this.camFrac),
      this.target.z + (want.z - this.target.z) * this.camFrac,
    );
    this.camera.lookAt(this.target.x, 2.5 + 0.6 * (this.talkK || 0) + (1 - Math.max(0.3, Math.min(1, this.camDist / 24))) * 0.6, this.target.z);

    if (this.shadows) {
      // keep the sun's direction but centre its shadow box on you
      this.sun.position.copy(this.target).add(this.sunDir);
      this.sun.target.position.copy(this.target);
    }
    this._tickRain(raw);
    this.sky.position.copy(this.camera.position);
    this.clouds.position.x = this.target.x + ((performance.now() / 1000) * 0.8) % 600 - 300;
    this.clouds.position.z = this.target.z;

    // door rings pulse; vehicle headlights at night
    const pulse = 0.65 + Math.sin(performance.now() / 700) * 0.2; // a slow, calm glow
    for (const d of this.world.doors) d.ring.material.opacity = d === this.nearDoor ? 1 : pulse;
    this._fadeLabels();
    this.renderer.render(this.scene, this.camera);
  }

  /** Building names never sit under the clock and wallet: they fade out as they reach the top band. */
  _fadeLabels() {
    const h = this.renderer.domElement.clientHeight || 1;
    const band = Math.min(0.24, 150 / h); // the HUD's top rows, as a share of the screen
    const v = this._labelV || (this._labelV = new THREE.Vector3());
    for (const s of this.world.labels || []) {
      v.copy(s.position).project(this.camera);
      const fromTop = (1 - v.y) / 2; // 0 at the top edge
      const k = THREE.MathUtils.clamp((fromTop - band) / 0.06, 0, 1);
      s.material.opacity = k;
      s.visible = k > 0.02 && v.z < 1;
    }
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
    this.roomView?.resize(w, h);
  }

  /** Tapping something inside (a bucket, the buka counter, yourself) opens what you can do with it. */
  _tapRoom(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const station = this.roomView.pick(ndc);
    if (station) this.opts.onRoomTap?.(station);
    else this.roomView.walkToTap(ndc); // tapped the floor: walk there
  }

  /** Show the inside of a campus place, with the people in it. */
  showPlace(spec, noLight = false) {
    if (!this.roomView) {
      this.roomView = new RoomView({ lowPower: this.lowPower, environment: this.scene.environment });
      this.roomView.resize(this.container.clientWidth || 1, this.container.clientHeight || 1);
    }
    this.noLight = noLight;
    this.roomView.showPlace(spec, this.minute, noLight);
    this.roomMode = true;
  }

  /** While an action plays, you walk to where it happens (the cooker, the counter, a desk). */
  roomActivity(station, emoji, actionId) {
    this.roomView?.setActivity(station, actionId);
    // outside: a gist with someone you stopped on the road
    if (!this.roomMode) {
      this.chatActive = Boolean(station && actionId?.startsWith("social") && this.talkingTo);
      if (this.chatActive) this.chatWith = this.talkingTo;
      this.chatTalking = false;
      this.idleAct = null;
      this.stillFor = 0;
    }
    this.roomView?.setBubble(station ? emoji : null);
  }

  /** The person behind a "person:<n>" tap inside a room or place. */
  personAt(tag) {
    return this.roomView?.personAt(tag) || null;
  }

  /** Show your room (hall or off campus) with your roommates in it. */
  showRoom(info, noLight = false) {
    if (!this.roomView) {
      this.roomView = new RoomView({ lowPower: this.lowPower, environment: this.scene.environment });
      this.roomView.resize(this.container.clientWidth || 1, this.container.clientHeight || 1);
    }
    this.noLight = noLight;
    this.roomView.show(info, this.minute, noLight);
    this.roomMode = true;
  }

  hideRoom() {
    this.roomMode = false;
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("keydown", this._keydown);
    window.removeEventListener("keyup", this._keyup);
    this._ro?.disconnect();
    this.roomView?.dispose();
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
