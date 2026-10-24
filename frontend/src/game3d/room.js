// Your room, drawn like a doll's house (the front wall is cut away so you can see in).
// Hall rooms have two bunk beds for four real players; off campus there's a single room, a self-contain
// or a 2-bedroom flat for at most two tenants. Roommates who are in sit on their beds, sleepers lie down,
// and the beds of people who are out have their names on them.
import * as THREE from "three";
import { makePerson, mat, seat as seatPerson, surface } from "./characters";
import { labelTexture } from "./textures";

// Some actions have their own body language (otherwise the station decides)
const ACT_FOR_ACTION = { war_cry: "dance", rally_sub: "talk", dept_dinner: "dance", party: "dance", scroll: "phone", gist: "talk" };

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const SHEETS = ["#2f5f9e", "#b03a2e", "#f2c230", "#1f6f4a", "#7a3e9d", "#e07a5f", "#3d405b", "#81b29a"];

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, base, dots, n = 1800) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = dots[i % dots.length];
    const s = 1 + Math.random() * 2.5;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

const FLOORS = {
  // terrazzo in the halls, tiles off campus, wood-look tiles in a flat
  hostel: () => canvasTex(256, 256, (g, w, h) => speckle(g, w, h, "#b8ae9b", ["#8f8574", "#d8d0c0", "#6f6658", "#c9b48f"], 2600), [3, 3]),
  tiles: (color) => canvasTex(256, 256, (g, w, h) => {
    speckle(g, w, h, color, ["rgba(0,0,0,0.05)", "rgba(255,255,255,0.08)"], 900);
    g.strokeStyle = "rgba(60,50,40,0.35)";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo((i * w) / 4, 0);
      g.lineTo((i * w) / 4, h);
      g.moveTo(0, (i * h) / 4);
      g.lineTo(w, (i * h) / 4);
      g.stroke();
    }
  }, [3, 3]),
};

function wallTex(paint, dado) {
  return canvasTex(256, 256, (g, w, h) => {
    speckle(g, w, h, paint, ["rgba(0,0,0,0.025)", "rgba(255,255,255,0.05)"], 1400);
    if (dado) {
      g.fillStyle = dado;
      g.fillRect(0, h * 0.72, w, h * 0.28);
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(0, h * 0.72, w, 3);
    }
    // a few scuffs and a damp patch low down
    g.fillStyle = "rgba(90,70,50,0.08)";
    g.beginPath();
    g.ellipse(w * 0.3, h * 0.95, 60, 18, 0, 0, Math.PI * 2);
    g.fill();
  }, [2, 1]);
}

export default class RoomView {
  constructor({ lowPower = false, environment = null } = {}) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#141b17");
    if (environment) {
      this.scene.environment = environment;
      this.scene.environmentIntensity = 0.35;
    }
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.lowPower = lowPower;
    this.group = null;
    this.people = [];
    this.tappables = [];
    this.anchors = {};
    this.key = "";
    this.t = 0;
    this.hemi = new THREE.HemisphereLight("#fff4e0", "#4a3a28", 0.9);
    this.bulb = new THREE.PointLight("#ffe2a8", 30, 40, 1.6);
    this.window = new THREE.DirectionalLight("#fff3d6", 1.4);
    this.scene.add(this.hemi, this.bulb, this.window, this.window.target);
    if (!lowPower) {
      this.window.castShadow = true;
      this.window.shadow.mapSize.set(1024, 1024);
      const sc = this.window.shadow.camera;
      sc.left = -14;
      sc.right = 14;
      sc.top = 14;
      sc.bottom = -14;
      sc.near = 1;
      sc.far = 60;
      sc.updateProjectionMatrix();
      this.window.shadow.bias = -0.0005;
      this.window.shadow.normalBias = 0.3;
    }
  }

  /**
   * info = { kind, label, people: [{name, you, where, look}], capacity }, minute = time of day,
   * noLight = NEPA has taken light.
   */
  show(info, minute, noLight = false) {
    const key = JSON.stringify([info.kind, info.label, info.people.map((p) => [p.name, p.where, p.you, p.look])]);
    if (key !== this.key) {
      this.key = key;
      this._build(info);
    }
    this.setMinute(minute, noLight);
  }

  setMinute(minute, noLight = false) {
    const day = minute > 390 && minute < 1110 ? 1 : minute > 330 && minute < 1170 ? 0.5 : 0;
    this.window.intensity = 0.2 + day * 1.6;
    this.window.color.set(day > 0.6 ? "#fff3d6" : day > 0 ? "#ffc58a" : "#7d93c9");
    this.bulb.intensity = noLight ? 0 : day > 0.6 ? 6 : 34;
    this.hemi.intensity = noLight && !day ? 0.25 : 0.55 + day * 0.4;
    if (this.glass) this.glass.material.emissiveIntensity = day ? 0.9 * day : 0.05;
    if (this.tube) this.tube.material.emissiveIntensity = noLight ? 0 : 1.2;
    if (this.lantern) this.lantern.visible = noLight && !day;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 50 : 40;
    this.camera.updateProjectionMatrix();
  }

  render(renderer, dt) {
    this.t += dt;
    const r = this.size;
    // step back far enough that the whole room fits the screen, phone or laptop
    const v = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hfov = Math.atan(Math.tan(v) * this.camera.aspect);
    const dist = Math.max((r.w * (this.camera.aspect < 0.8 ? 0.45 : 0.54)) / Math.tan(hfov), (r.d * 0.55 + r.h * 0.5) / Math.tan(v));
    const elev = 0.62; // looking down into the room
    const sway = Math.sin(this.t * 0.25) * 0.05; // a gentle drift so the room feels alive; it never spins
    const tx = 0;
    const ty = r.h * 0.28;
    const tz = -r.d * 0.05;
    this.camera.position.set(tx + Math.sin(sway) * dist * Math.cos(elev), ty + Math.sin(elev) * dist,
      tz + Math.cos(sway) * dist * Math.cos(elev));
    this.camera.lookAt(tx, ty, tz);
    const mine = this.you?.children[0];
    for (const p of this.people) {
      if (p.userData.managed) continue; // players and joggers are animated by their own movement
      if (p !== mine || !this.walkGoal) p.tick?.(dt);
    }
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._clear();
  }

  _clear() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        if (o.userData.own) o.geometry?.dispose();
        if (o.material?.userData?.own) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      }
    });
    this.group = null;
    this.people = [];
    this.persons = [];
    this.bubble = null;
  }

  /** A little emoji bubble over your head while you're busy doing something. null hides it. */
  setBubble(emoji) {
    if (this.bubble) {
      this.bubble.parent?.remove(this.bubble);
      this.bubble.material.map.dispose();
      this.bubble.material.dispose();
      this.bubble = null;
    }
    if (!emoji || !this.you) return;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff";
    g.shadowColor = "rgba(0,0,0,0.25)";
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(64, 58, 46, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(52, 98);
    g.lineTo(64, 122);
    g.lineTo(76, 98);
    g.fill();
    g.shadowBlur = 0;
    g.font = "56px serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(emoji, 64, 62);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(1.1, 1.1, 1);
    s.position.set(0, 4.6, 0);
    s.renderOrder = 12;
    this.you.add(s);
    this.bubble = s;
  }

  /** Who is behind a "person:<n>" tap. */
  personAt(tag) {
    const i = Number(String(tag || "").split(":")[1]);
    return Number.isInteger(i) ? this.persons?.[i] || null : null;
  }

  // --- tapping things ----------------------------------------------------------------------------

  /** Mark an object as tappable: tapping it opens that station's actions. */
  tag(obj, station) {
    obj.userData.station = station;
    this.tappables.push(obj);
    return obj;
  }

  /** What's under the finger: a station id ("food", "rest", "self"…) or null. */
  pick(ndc) {
    if (!this.group) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.tappables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.station) o = o.parent;
      if (o) return o.userData.station;
    }
    return null;
  }

  /** Group the meshes added by fn() into one tappable object. */
  thing(station, fn) {
    const g = new THREE.Group();
    const parent = this.group;
    this.group = g;
    fn();
    this.group = parent;
    parent.add(g);
    return this.tag(g, station);
  }

  // --- building blocks -----------------------------------------------------------------------------

  box(w, h, d, material, x, y, z, parent = this.group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === "string" ? mat(material) : material);
    m.userData.own = true;
    m.position.set(x, y + h / 2, z);
    m.castShadow = !this.lowPower;
    m.receiveShadow = !this.lowPower;
    parent.add(m);
    return m;
  }

  cyl(rt, rb, h, color, x, y, z, seg = 12, parent = this.group) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === "string" ? mat(color) : color);
    m.userData.own = true;
    m.position.set(x, y + h / 2, z);
    m.castShadow = !this.lowPower;
    m.receiveShadow = !this.lowPower;
    parent.add(m);
    return m;
  }

  label(text, x, y, z, scale = 0.9, tone = "dark") {
    const tex = labelTexture(text, tone);
    const material = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const s = new THREE.Sprite(material);
    s.scale.set(scale * tex.userData.aspect, scale, 1);
    s.position.set(x, y, z);
    s.renderOrder = 10;
    this.group.add(s);
    return s;
  }

  _shell({ w, d, h, paint, dado, floor, win }) {
    this.size = { w, d, h };
    const floorMat = surface({ map: floor, roughness: 0.75 });
    floorMat.userData.own = true;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), floorMat);
    fl.position.y = -0.15;
    fl.receiveShadow = true;
    fl.userData.own = true;
    this.group.add(fl);
    const wallMat = surface({ map: wallTex(paint, dado), roughness: 0.95 });
    wallMat.userData.own = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), wallMat);
    back.position.set(0, h / 2, -d / 2);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, d), wallMat);
    left.position.set(-w / 2, h / 2, 0);
    const right = left.clone();
    right.position.x = w / 2;
    for (const m of [back, left, right]) {
      m.receiveShadow = true;
      m.userData.own = true;
      this.group.add(m);
    }
    // skirting
    this.box(w, 0.25, 0.08, "#5a4632", 0, 0, -d / 2 + 0.18);
    // the window on the back wall: louvre blades behind burglar bars; daylight comes through it
    const wx = win ?? w * 0.18;
    const wy = h * 0.42;
    this.box(4.2, 2.8, 0.2, "#e9e2d3", wx, wy - 0.1, -d / 2 + 0.12);
    const glassMat = new THREE.MeshStandardMaterial({ color: "#9fc6dc", emissive: "#cfe6f5", emissiveIntensity: 0.8, roughness: 0.2 });
    glassMat.userData.own = true;
    this.glass = this.box(3.8, 2.4, 0.06, glassMat, wx, wy + 0.1, -d / 2 + 0.24);
    for (let i = 0; i < 7; i++) {
      const blade = this.box(3.7, 0.04, 0.3, "#d9e6ec", wx, wy + 0.2 + i * 0.33, -d / 2 + 0.36);
      blade.rotation.x = 0.5;
    }
    for (let i = 0; i < 6; i++) this.box(0.06, 2.5, 0.06, "#2b2b2b", wx - 1.6 + i * 0.64, wy + 0.05, -d / 2 + 0.5);
    this.box(3.9, 0.06, 0.06, "#2b2b2b", wx, wy + 1.25, -d / 2 + 0.5);
    this.window.position.set(wx + 6, h * 1.6, -d / 2 - 14);
    this.window.target.position.set(0, 0, 2);
    this.bulb.position.set(0, h - 0.6, 0);
    // a fluorescent tube on the back wall
    const tubeMat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff8e6", emissiveIntensity: 1.2 });
    tubeMat.userData.own = true;
    this.tube = this.box(3, 0.16, 0.16, tubeMat, -w * 0.22, h - 0.9, -d / 2 + 0.3);
    // a kerosene lantern for when NEPA takes light
    this.lantern = new THREE.PointLight("#ffb347", 12, 14, 1.5);
    this.lantern.position.set(w * 0.3, 2.2, d * 0.1);
    this.group.add(this.lantern);
  }

  _door(x, z, rotY = Math.PI / 2) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.box(2.2, 4.2, 0.25, "#6b4a2a", 0, 0, 0, g);
    this.box(0.18, 0.18, 0.2, "#c9a24a", 0.8, 2, 0.15, g);
    this.group.add(g);
  }

  _bunk(x, z, sheets, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const metal = "#2e5f4a";
    for (const [px, pz] of [[-1.3, -2.7], [1.3, -2.7], [-1.3, 2.7], [1.3, 2.7]]) this.box(0.14, 4.7, 0.14, metal, px, 0, pz, g);
    for (const y of [1.0, 3.0]) {
      this.box(2.7, 0.14, 5.5, metal, 0, y, 0, g);
    }
    // foam mattresses with sheets and pillows
    sheets.forEach((color, i) => {
      const y = i === 0 ? 1.14 : 3.14;
      this.box(2.5, 0.36, 5.3, "#e9e1cf", 0, y, 0, g);
      this.box(2.52, 0.08, 4.2, color, 0, y + 0.33, 0.5, g);
      this.box(1.4, 0.3, 0.8, "#f4f1ea", 0, y + 0.36, -2.1, g);
    });
    // ladder
    for (let i = 0; i < 4; i++) this.box(0.08, 0.08, 0.9, metal, 1.36, 0.6 + i * 0.8, 2.2, g);
    this.group.add(g);
    return g;
  }

  _bed(x, z, w, color, rot = 0, wood = "#7a5230") {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(w + 0.3, 0.9, 5.6, wood, 0, 0, 0, g);
    this.box(w + 0.3, 2.4, 0.3, wood, 0, 0, -2.8, g);
    this.box(w, 0.5, 5.2, "#efe8d8", 0, 0.9, 0.05, g);
    this.box(w + 0.04, 0.1, 3.8, color, 0, 1.36, 0.75, g);
    this.box(w * 0.4, 0.32, 0.8, "#f6f3ec", -w * 0.24, 1.4, -2.1, g);
    if (w > 3) this.box(w * 0.4, 0.32, 0.8, "#f6f3ec", w * 0.24, 1.4, -2.1, g);
    this.group.add(g);
    return g;
  }

  _table(x, z, w = 3, d = 1.8, color = "#8a5a33") {
    this.box(w, 0.14, d, color, x, 2.0, z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(0.12, 2.0, 0.12, color, x + dx * (w / 2 - 0.15), 0, z + dz * (d / 2 - 0.15));
  }

  _chair(x, z, color = "#f4f4f2", rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(1.3, 0.12, 1.3, color, 0, 1.25, 0, g);
    this.box(1.3, 1.5, 0.12, color, 0, 1.3, -0.6, g);
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) this.box(0.1, 1.25, 0.1, color, dx, 0, dz, g);
    this.group.add(g);
  }

  _bucket(x, z, color) {
    const m = surface({ color, roughness: 0.5, side: THREE.DoubleSide });
    m.userData.own = true;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.48, 1.0, 16, 1, true), m);
    b.userData.own = true;
    b.position.set(x, 0.5, z);
    b.castShadow = !this.lowPower;
    this.group.add(b);
    this.cyl(0.48, 0.48, 0.05, color, x, 0, z, 16);
    const water = this.cyl(0.55, 0.55, 0.02, "#6aa4c8", x, 0.75, z, 16);
    water.material = mat("#6aa4c8", { roughness: 0.1 });
  }

  _locker(x, z, color = "#7a8c96", rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(1.8, 4.2, 1.3, color, 0, 0, 0, g);
    this.box(0.04, 3.8, 0.02, "#3a454c", 0, 0.2, 0.66, g);
    this.box(0.12, 0.4, 0.1, "#d8d8d8", 0.25, 2.1, 0.7, g);
    this.group.add(g);
  }

  _clothesLine(x0, x1, y, z) {
    this.cyl(0.03, 0.03, Math.abs(x1 - x0), "#ddd", (x0 + x1) / 2, y, z, 4).rotation.z = Math.PI / 2;
    const colors = ["#c0392b", "#2980b9", "#f1c40f", "#ecf0f1", "#27ae60"];
    for (let i = 0; i < 4; i++) {
      const c = this.box(0.9, 1.1, 0.04, colors[i % colors.length], x0 + 0.8 + i * ((x1 - x0 - 1.6) / 3), y - 1.1, z);
      c.rotation.y = 0.1 * (i - 2);
    }
  }

  _rug(x, z, w, d, color) {
    this.box(w, 0.04, d, color, x, 0, z).receiveShadow = true;
  }

  _fan(x, z) {
    this.cyl(0.6, 0.7, 0.2, "#e9e9e6", x, 0, z, 16);
    this.cyl(0.08, 0.08, 3.2, "#cfcfcf", x, 0.2, z, 8);
    const head = this.cyl(0.55, 0.55, 0.35, "#f2f2f0", x, 3.3, z, 16);
    head.rotation.x = Math.PI / 2;
    this.fanBlades = this.cyl(0.95, 0.95, 0.04, mat("#9fd3f0", { transparent: true, opacity: 0.6 }), x, 3.6, z + 0.25, 3);
    this.fanBlades.rotation.x = Math.PI / 2;
  }

  _sofa(x, z, w, color, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(w, 1.1, 1.9, color, 0, 0, 0, g);
    this.box(w, 1.6, 0.5, color, 0, 0.6, -0.75, g);
    this.box(0.45, 1.5, 1.9, color, -w / 2, 0, 0, g);
    this.box(0.45, 1.5, 1.9, color, w / 2, 0, 0, g);
    for (let i = 0; i < Math.round(w / 1.6); i++) {
      this.box(w / Math.round(w / 1.6) - 0.15, 0.3, 1.4, "#efe6d6", -w / 2 + (i + 0.5) * (w / Math.round(w / 1.6)), 1.1, 0.15, g);
    }
    this.group.add(g);
  }

  _tv(x, z, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(4.2, 1.4, 1.2, "#3a2a1e", 0, 0, 0, g);
    this.box(3.4, 2.0, 0.12, "#111", 0, 1.6, -0.2, g);
    const screen = new THREE.MeshStandardMaterial({ color: "#1b2a38", emissive: "#2c6e9e", emissiveIntensity: 0.35 });
    screen.userData.own = true;
    this.box(3.2, 1.8, 0.02, screen, 0, 1.7, -0.13, g);
    this.group.add(g);
  }

  _kitchen(x, z, w) {
    this.box(w, 2.2, 1.6, "#d9d2c4", x, 0, z);
    this.box(w, 0.12, 1.7, "#5d6d6e", x, 2.2, z);
    this.box(1.6, 0.3, 1.0, "#2b2b2b", x - w / 2 + 1.2, 2.32, z);
    this.cyl(0.45, 0.4, 0.6, "#a8a8a8", x - w / 2 + 1.2, 2.62, z, 14);
    this.cyl(0.5, 0.5, 1.6, "#2f7a4f", x + w / 2 - 0.7, 0, z, 14); // gas cylinder
    this.box(w, 1.4, 1.0, "#c9bba4", x, 4.0, z - 0.2);
  }

  /** A two-burner gas cooker on a small table, with the gas cylinder beside it and a pot on top. */
  _cooker(x, z) {
    this.box(2.0, 1.6, 1.2, "#6b4a2a", x, 0, z);
    this.box(1.6, 0.25, 0.9, "#2b2b2b", x, 1.6, z);
    this.cyl(0.42, 0.36, 0.5, "#a9a9a9", x - 0.35, 1.85, z, 14);
    this.cyl(0.36, 0.36, 1.3, "#2f7a4f", x + 1.35, 0, z, 14);
    this.cyl(0.12, 0.12, 0.25, "#c9c9c9", x + 1.35, 1.3, z, 8);
  }

  _poster(x, y, z, w, h, color, rot = 0) {
    const p = this.box(w, h, 0.04, color, x, y, z);
    p.rotation.y = rot;
  }

  // --- the rooms ---------------------------------------------------------------------------------

  _build(info) {
    this._clear();
    this.tappables = [];
    this.anchors = {};
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.glass = this.tube = this.fanBlades = null;
    const people = info.people || [];
    const seats = [];
    if (info.kind === "hostel") {
      this._shell({ w: 11.5, d: 13, h: 6.2, paint: "#ebe1c8", dado: "#4f7fa8", floor: FLOORS.hostel(), win: 0 });
      this.thing("leave", () => this._door(-5.6, 4.4));
      this.thing("rest", () => this._bunk(-3.85, -1.9, [SHEETS[0], SHEETS[1]]));
      this.thing("rest", () => this._bunk(3.85, -1.9, [SHEETS[2], SHEETS[3]]));
      // bed slots, bottom bunks first: lower-left, lower-right, upper-left, upper-right
      const slots = [[-3.85, 1.6, -1.9], [3.85, 1.6, -1.9], [-3.85, 3.6, -1.9], [3.85, 3.6, -1.9]];
      this.thing("study", () => {
        this._table(0, -5.2, 2.8, 1.4);
        this._chair(0, -3.9, "#d64535", Math.PI);
        this.box(0.9, 0.12, 0.7, "#f4f1ea", -0.4, 2.14, -5.2); // an open note
        this.box(0.8, 0.5, 0.6, "#2f5f9e", 0.7, 2.14, -5.3); // textbooks
      });
      this.thing("room", () => {
        this._locker(4.6, 2.9, "#7a8c96", -Math.PI / 2);
        this._locker(4.6, 4.9, "#8a7a5a", -Math.PI / 2);
      });
      this.thing("care", () => {
        this._bucket(-1.0, 4.9, "#d23b3b");
        this._bucket(0.3, 5.4, "#2a6fd6");
      });
      this.thing("food", () => this._cooker(-3.6, 5.2));
      this.anchors = { study: [0, -3.2], care: [-0.3, 3.9], food: [-3.6, 4.1], rest: [-2.2, 0.8], room: [3.4, 3.8], idle: [1.2, 2.2] };
      this._clothesLine(-5.3, -2.2, 5.6, -5.9);
      this._poster(-5.4, 3.0, 2.2, 1.4, 1.9, "#f2c230", Math.PI / 2);
      this._poster(5.4, 3.2, -4.6, 1.2, 1.7, "#1f6f4a", -Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        const [bx, by, bz] = slots[i];
        seats.push({ x: bx, y: by, z: bz, bed: true, top: i >= 2, side: bx < 0 ? 1 : -1 });
      }
    } else if (info.kind === "single") {
      this._shell({ w: 12, d: 10, h: 6, paint: "#e7dcc3", dado: "#a8754a", floor: FLOORS.tiles("#c9b9a0") });
      this.thing("leave", () => this._door(-5.85, 2.8));
      this.thing("rest", () => this._bed(-3.4, -1.5, 3.6, SHEETS[4]));
      this.thing("study", () => {
        this._table(3.2, -3.6, 3, 1.6);
        this._chair(3.2, -2.3, "#2f5f9e", Math.PI);
      });
      this._fan(4.6, 1.2);
      this.thing("room", () => this._locker(0.6, -4.2, "#7a5230"));
      this.thing("care", () => this._bucket(4.6, 3.6, "#d23b3b"));
      this.thing("food", () => this._cooker(-0.2, 3.6));
      this.anchors = { study: [3.2, -1.4], care: [3.6, 2.6], food: [-0.2, 2.4], rest: [-1.2, 0.2], idle: [1.0, 1.0] };
      this._rug(-0.6, 2.2, 4.5, 3, "#7a3e3e");
      seats.push({ x: -3.4, y: 1.4, z: -0.6, bed: true, side: 1 }, { x: 1.4, y: 0.1, z: 2.4, floorMattress: true, side: -1 });
      if (people.length > 1) this.box(2.6, 0.35, 4.6, "#efe8d8", 1.4, 0, 2.2), this.box(2.6, 0.06, 3.4, SHEETS[5], 1.4, 0.35, 2.7);
    } else if (info.kind === "self_con") {
      this._shell({ w: 15, d: 11, h: 6.2, paint: "#efe6d3", dado: null, floor: FLOORS.tiles("#d7cdbd") });
      this.thing("leave", () => this._door(-7.35, 3.4));
      this.thing("rest", () => this._bed(-4.4, -2.0, 4.2, SHEETS[6]));
      this.thing("food", () => this._kitchen(4.4, -4.4, 5));
      this.thing("fun", () => {
        this._sofa(2.4, 2.4, 4, "#3d5a80", Math.PI);
        this._tv(-0.4, -4.6);
      });
      this.thing("care", () => this.box(0.25, 4.2, 2.2, "#f4f4f4", 7.35, 0, -1.8));
      this.anchors = { food: [4.4, -2.8], rest: [-2.0, 0.4], fun: [1.0, 0.8], care: [6.2, -1.8], study: [-1.0, -2.6], idle: [0, 1] };
      this._rug(1.0, 0.6, 5, 3.4, "#b5482a");
      this._fan(-1.2, 2.8);
      // the bathroom door
      this.box(0.25, 4.2, 2.2, "#f4f4f4", 7.35, 0, -1.8);
      this._poster(7.1, 3.0, 1.6, 1.4, 1.8, "#e07a5f", -Math.PI / 2);
      seats.push({ x: -4.4, y: 1.4, z: -1.0, bed: true, side: 1 }, { x: 1.6, y: 1.1, z: 2.2, sofa: true });
    } else {
      // a 2-bedroom flat: the parlour, with the two bedroom doors at the back
      this._shell({ w: 18, d: 13, h: 6.6, paint: "#f2ead9", dado: null, floor: FLOORS.tiles("#cdb79a") });
      this.thing("leave", () => this._door(-8.85, 4.2));
      this.thing("rest", () => this.box(2.4, 4.4, 0.25, "#6b4a2a", -5.2, 0, -6.3));
      this.thing("care", () => this.box(2.4, 4.4, 0.25, "#6b4a2a", 6.4, 0, -6.3));
      this.thing("fun", () => {
        this._sofa(-2.4, 2.6, 5.2, "#5b3a29", Math.PI);
        this._sofa(-6.6, -1.0, 2.6, "#5b3a29", Math.PI / 2);
        this._tv(1.8, -5.2);
      });
      this.thing("food", () => this._kitchen(-1, -5.6, 0.1));
      this.anchors = { fun: [-2.4, 1.0], rest: [-5.2, -4.8], care: [6.4, -4.8], study: [5.8, 2.6], food: [5.8, 0], idle: [1, 2] };
      this._table(-2.4, 0, 3.2, 1.8, "#4a3426");
      this._rug(-2.6, 0.2, 7, 4.6, "#8e3b46");
      this._table(5.8, 1.4, 3.6, 2.4, "#6b4a2a");
      for (const [cx, cz, r] of [[4.6, 3.0, Math.PI], [7.0, 3.0, Math.PI], [4.6, -0.2, 0], [7.0, -0.2, 0]]) this._chair(cx, cz, "#3a2a1e", r);
      // the AC on the wall
      this.box(3, 0.9, 0.8, "#f4f4f4", -4.6, 4.6, -6.1);
      seats.push({ x: -3.6, y: 1.1, z: 2.4, sofa: true }, { x: -1.2, y: 1.1, z: 2.4, sofa: true });
    }

    // your roommates (and you)
    const others = people.filter((p) => !p.you);
    const you = people.find((p) => p.you);
    const order = info.kind === "hostel" ? people : [you, ...others].filter(Boolean);
    order.forEach((p, i) => {
      const seat = seats[i];
      if (!seat) return;
      const name = p.you ? "You" : p.name;
      if (p.where === "out" && !p.you) {
        this.label(`${name} · out`, seat.x, seat.y + 1.8, seat.z + 1, 0.75);
        // their bag is on the bed
        this.box(0.8, 0.8, 0.5, "#2f3b52", seat.x + 0.4, seat.y + 0.3, seat.z + 1.3);
        return;
      }
      const person = makePerson(p.look || {}, { scale: 1.05 });
      person.traverse((o) => {
        if (o.isMesh) o.castShadow = !this.lowPower;
      });
      const pivot = new THREE.Group();
      pivot.add(person);
      if (p.where === "asleep") {
        // lying on the bed, head towards the wall
        seatPerson(person, "lie");
        pivot.position.set(seat.x, seat.y + 0.2, seat.z + 0.9);
        if (seat.sofa) pivot.rotation.y = Math.PI / 2;
        this.label(`${name} 😴`, seat.x, seat.y + 1.9, seat.z, 0.75);
      } else {
        // sitting on the edge of the bed (or on the sofa), facing the room; some chat, some are on their phones
        const kind = ["sit", "sit_talk", "sit"][i % 3];
        seatPerson(person, kind);
        pivot.position.set(seat.x + (seat.bed ? (seat.side || 1) * 0.9 : 0), seat.y + 0.3 + (seat.floorMattress ? 0.2 : 0),
          seat.z + (seat.bed ? 1.2 : 0));
        pivot.rotation.y = seat.bed && !seat.top ? (seat.side || 1) * Math.PI / 2 : 0;
        if (seat.top) pivot.rotation.y = 0;
        this.label(name, pivot.position.x, pivot.position.y + 2.6, pivot.position.z, 0.7, p.you ? "you" : "player");
        this.people.push(person);
      }
      if (p.you) this.tag(pivot, "self");
      else {
        this.persons = this.persons || [];
        this.persons.push({ kind: "player", id: p.id, name: p.name, look: p.look, role: `Your roommate · ${p.department || ""}`.trim() });
        this.tag(pivot, `person:${this.persons.length - 1}`);
      }
      if (p.you) this.you = pivot;
      this.group.add(pivot);
    });
    // empty beds in a hall room: "free bed"
    if (info.kind === "hostel") {
      for (let i = people.length; i < 4; i++) {
        const s = seats[i];
        this.label("Free bed", s.x, s.y + 1.4, s.z + 1, 0.65);
      }
    }
    this.group.traverse((o) => {
      if (o.isMesh && !this.lowPower) {
        o.castShadow = o.castShadow ?? true;
        o.receiveShadow = true;
      }
    });
  }

  // --- places on campus --------------------------------------------------------------------------

  /**
   * Show the inside of a campus place. spec = { type, name, hall, banks, people: [{name, look, kind}], seed }
   * kind: "you" | "player" (real students, blue tags) | "npc" (campus people, white tags).
   */
  showPlace(spec, minute, noLight = false) {
    const key = JSON.stringify([spec.type, spec.name, spec.hall, spec.people.map((p) => [p.name, p.kind])]);
    if (key !== this.key) {
      this.key = key;
      this._buildPlace(spec);
    }
    this.setMinute(minute, noLight);
  }

  _person(p, spot) {
    const person = makePerson(p.look || {}, { scale: 1.05, bag: p.kind !== "npc" && !spot.sit && Math.random() < 0.5 });
    person.traverse((o) => {
      if (o.isMesh) o.castShadow = !this.lowPower;
    });
    const pivot = new THREE.Group();
    pivot.add(person);
    // what they're doing: writing and typing sit at a desk, eating at the buka, talking, on the phone…
    const busy = spot.pose;
    if (spot.sit) {
      seatPerson(person, busy === "talk" ? "sit_talk" : "sit");
      pivot.position.set(spot.x, (spot.y || 0) + 1.15, spot.z);
    } else {
      const stand = { talk: "talk", eat: "eat", phone: "phone", write: "fold", type: "interact" }[busy]
        || ["idle", "idle", "phone", "fold", "talk"][Math.floor(Math.random() * 5)];
      person.act(stand);
      pivot.position.set(spot.x, spot.y || 0, spot.z);
    }
    pivot.rotation.y = spot.rot ?? 0;
    pivot.userData.spot = spot;
    this.people.push(person);
    const tag = p.kind === "you" ? "You" : p.kind === "player" ? `@${p.name}` : p.name;
    const lbl = this.label(tag, 0, 4.0, 0, 0.62, p.kind === "npc" ? "npc" : p.kind);
    this.group.remove(lbl);
    pivot.add(lbl); // the tag moves with the person
    if (p.kind === "you") this.tag(pivot, "self");
    else {
      this.persons = this.persons || [];
      this.persons.push({ kind: p.kind === "player" ? "player" : "npc", id: p.id, name: p.name, look: p.look, role: p.role });
      this.tag(pivot, `person:${this.persons.length - 1}`);
    }
    this.group.add(pivot);
    return pivot;
  }

  /** Put the people in the spots: staff first, then real players, then campus NPCs. You stand at the door. */
  _crowd(staff, spots, people, youSpot) {
    staff.forEach(([p, spot]) => this._person({ ...p, kind: "npc" }, spot));
    const others = people.filter((p) => p.kind !== "you");
    others.slice(0, spots.length).forEach((p, i) => this._person(p, spots[i]));
    const you = people.find((p) => p.kind === "you");
    if (you) {
      this.you = this._person(you, youSpot);
      this.youHome = [youSpot.x, youSpot.z];
    }
  }

  _bench(x, z, w, color = "#7a5230", rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(w, 0.18, 1.0, color, 0, 1.3, 0, g);
    for (const dx of [-w / 2 + 0.3, w / 2 - 0.3]) this.box(0.18, 1.3, 0.8, color, dx, 0, 0, g);
    this.group.add(g);
    return g;
  }

  _shelf(x, z, w, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(w, 5, 1.1, "#6b4a2a", 0, 0, 0, g);
    const colors = ["#8e3b46", "#2f5f9e", "#1f6f4a", "#c9a24a", "#3d405b", "#b5482a", "#e9e2d3"];
    for (let row = 0; row < 4; row++) {
      this.box(w - 0.2, 0.1, 1.0, "#5a3d22", 0, 0.5 + row * 1.15, 0.05, g);
      let bx = -w / 2 + 0.3;
      let i = row * 3;
      while (bx < w / 2 - 0.3) {
        const bw = 0.18 + ((i * 37) % 10) / 40;
        this.box(bw, 0.8 + ((i * 13) % 4) / 10, 0.8, colors[i % colors.length], bx + bw / 2, 0.6 + row * 1.15, 0.12, g);
        bx += bw + 0.02;
        i++;
      }
    }
    this.group.add(g);
    return g;
  }

  _board(x, y, z, w, h, text, color = "#22382c", rot = 0) {
    const tex = labelTexture(text, "dark");
    this.box(w + 0.3, h + 0.3, 0.12, "#6b4a2a", x, y - 0.15, z).rotation.y = rot;
    const m = this.box(w, h, 0.14, color, x, y, z + 0.02);
    m.rotation.y = rot;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.set(Math.min(w * 0.8, 0.9 * tex.userData.aspect), 0.9, 1);
    s.position.set(x, y + h / 2, z + 0.3);
    this.group.add(s);
  }

  _counter(x, z, w, color, top = "#5d6d6e", glass = false) {
    this.box(w, 2.3, 1.4, color, x, 0, z);
    this.box(w + 0.2, 0.14, 1.6, top, x, 2.3, z);
    if (glass) {
      const g = mat("#bfe3f0", { transparent: true, opacity: 0.35, roughness: 0.1 });
      this.box(w, 1.8, 0.06, g, x, 2.44, z + 0.5);
    }
  }

  _pot(x, z, y = 2.4, r = 0.5) {
    this.cyl(r, r * 0.85, r * 1.2, "#232323", x, y, z, 14);
    this.cyl(r * 0.92, r * 0.92, 0.05, "#7a3a1a", x, y + r * 1.15, z, 14);
  }

  _atm(x, z, color, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(1.4, 3.2, 1.0, "#c9ccd0", 0, 0, 0, g);
    this.box(1.5, 0.6, 1.1, color, 0, 3.2, 0, g);
    const screen = new THREE.MeshStandardMaterial({ color: "#123", emissive: "#3ec1ff", emissiveIntensity: 0.6 });
    screen.userData.own = true;
    this.box(0.8, 0.6, 0.05, screen, 0, 2.0, 0.5, g);
    this.box(0.9, 0.08, 0.3, "#555", 0, 1.6, 0.55, g);
    this.group.add(g);
    return g;
  }

  _stall(x, z, w, awning, goods, rot = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.box(w, 1.6, 1.8, "#8a6a42", 0, 0, 0, g);
    goods.forEach((c, i) => this.cyl(0.32, 0.36, 0.5, c, -w / 2 + 0.5 + i * ((w - 1) / Math.max(1, goods.length - 1)), 1.6, 0, 8, g));
    for (const dx of [-w / 2, w / 2]) this.box(0.12, 3.6, 0.12, "#5a4632", dx, 0, -0.9, g);
    const awn = this.box(w + 0.6, 0.12, 2.4, awning, 0, 3.6, 0.1, g);
    awn.rotation.x = 0.18;
    this.group.add(g);
    return g;
  }

  _buildPlace(spec) {
    this._clear();
    this.tappables = [];
    this.anchors = {};
    this.you = null;
    this.kick = null;
    this.jog = null;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.glass = this.tube = this.fanBlades = null;
    const people = spec.people || [];
    const t = spec.type;
    const staff = [];
    let spots = [];
    let youSpot = { x: 0, z: 4, rot: Math.PI };
    const S = (x, z, o = {}) => ({ x, z, y: 0, ...o });
    const seat = (x, z, y = 1.4, rot = Math.PI, o = {}) => ({ x, z, y, sit: true, rot, ...o });

    if (t === "lecture") {
      this._shell({ w: 22, d: 17, h: 7.5, paint: "#e6dfcf", dado: "#7a8c74", floor: FLOORS.tiles("#b9b0a0") });
      this.thing("class", () => {
        this.box(10, 3.4, 0.2, "#f4f4f2", 0, 2.8, -8.2); // whiteboard
        this.box(3.2, 2.2, 1.6, "#6b4a2a", -6, 0, -5.4); // lecturer's desk
      });
      this._board(0, 6.6, -8.1, 9, 1, `${spec.name}`);
      // raked rows of long desks and benches
      for (let r = 0; r < 4; r++) {
        const z = -2 + r * 2.6;
        const y = r * 0.45;
        this.box(20, y + 0.01, 2.6, "#a89c88", 0, 0, z + 0.6); // the step
        for (const side of [-1, 1]) {
          this.thing("class", () => {
            this.box(8, 0.14, 1.0, "#7a5230", side * 5, y + 2.2, z);
            this.box(8, 2.2, 0.12, "#6b4a2a", side * 5, y, z - 0.45);
            this._bench(side * 5, z + 1.1, 8, "#5a3d22");
          });
        }
        for (let i = 0; i < 6; i++) {
          const x = (i < 3 ? -1 : 1) * (2.4 + (i % 3) * 2.6);
          spots.push(seat(x, z + 1.1, y + 1.45, Math.PI, { pose: "write", station: "class" }));
        }
      }
      spots = spots.sort(() => Math.random() - 0.5);
      staff.push([{ name: "Dr. Adeyemi", look: { skin: 2, hair: 0, top: 5, bottom: 1 } }, S(-3, -6.2, { rot: 0.3, pose: "talk", station: "class" })]);
      this.anchors = { class: [0, -0.4], study: [0, -0.4], idle: [8.5, 6.8] };
      youSpot = S(8.5, 6.8, { rot: Math.PI * 1.1 });
    } else if (t === "classroom" || t === "office") {
      this._shell({ w: 18, d: 14, h: 6.5, paint: t === "office" ? "#ece7dc" : "#e3ddd0", dado: "#8a9a86", floor: FLOORS.tiles("#c9c0ae") });
      this._board(0, 5.6, -6.8, 8, 1, spec.name);
      if (t === "office") {
        this.thing("study", () => this._counter(0, -3.6, 8, "#6b4a2a", "#4a3426"));
        for (let i = 0; i < 3; i++) this.thing("study", () => this._shelf(-7.5 + i * 0.01, -5 + i * 3, 3.5, Math.PI / 2));
        staff.push([{ name: "Admin officer", look: { skin: 1, hair: 3, top: 4, bottom: 0, style: 1 } }, S(0, -5, { rot: 0, pose: "type" })]);
        for (let i = 0; i < 4; i++) spots.push(S(-4 + i * 2.6, 0.2, { rot: Math.PI, station: "study" }));
      } else {
        this.thing("study", () => this.box(9, 3.2, 0.2, "#22382c", 0, 2.2, -6.8));
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          const x = -6 + c * 4;
          const z = -2.5 + r * 3.2;
          this.thing("study", () => {
            this._table(x, z, 2.6, 1.3, "#8a6a42");
            this._chair(x, z + 1.2, "#2f5f9e", Math.PI);
          });
          spots.push(seat(x, z + 1.2, 1.4, Math.PI, { pose: "write", station: "study" }));
        }
        spots = spots.sort(() => Math.random() - 0.5);
        this.thing("hustle", () => this.box(3, 4, 0.1, "#c9a24a", 7.5, 1.2, -6.8)); // notice board
      }
      this.anchors = { study: [-2, 0.6], class: [-2, 0.6], hustle: [7.5, -5.4], idle: [6.8, 5.4] };
      youSpot = S(6.8, 5.4, { rot: Math.PI * 1.15 });
    } else if (t === "library") {
      this._shell({ w: 22, d: 16, h: 7, paint: "#e8e2d6", dado: null, floor: FLOORS.tiles("#9c8f7c") });
      for (let i = 0; i < 4; i++) this.thing("study", () => this._shelf(-8 + i * 5.3, -6.6, 4.6));
      for (let i = 0; i < 3; i++) this.thing("study", () => this._shelf(10.2, -3.5 + i * 4, 3.4, -Math.PI / 2));
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const x = -6.5 + c * 5.2;
        const z = -1.5 + r * 4.4;
        this.thing("study", () => {
          this.box(4, 0.14, 2.2, "#6b4a2a", x, 2.0, z);
          for (const dx of [-1.8, 1.8]) this.box(0.2, 2.0, 2, "#5a3d22", x + dx, 0, z);
          this.cyl(0.08, 0.08, 0.8, "#2b2b2b", x, 2.14, z, 6);
          this.cyl(0.3, 0.2, 0.25, "#2f7a4f", x, 2.9, z, 10);
        });
        for (const [dx, dz, rot] of [[-1, 1.5, Math.PI], [1, 1.5, Math.PI], [-1, -1.5, 0], [1, -1.5, 0]]) {
          this._chair(x + dx, z + dz * 0.9, "#7a3e3e", rot);
          spots.push(seat(x + dx, z + dz * 0.9, 1.4, rot, { pose: "write", station: "study" }));
        }
      }
      spots = spots.sort(() => Math.random() - 0.5);
      this.thing("study", () => this._counter(-7.5, 5.5, 4.5, "#6b4a2a", "#4a3426"));
      staff.push([{ name: "Librarian", look: { skin: 3, hair: 3, top: 4, bottom: 0, style: 1 } }, S(-7.5, 4.3, { rot: 0, pose: "type" })]);
      this._board(0, 6.2, -7.6, 7, 0.9, "SILENCE PLEASE");
      this.anchors = { study: [-4, 1.2], idle: [7, 6] };
      youSpot = S(7, 6, { rot: Math.PI * 1.15 });
    } else if (t === "buka") {
      this._shell({ w: 18, d: 13, h: 6, paint: "#e9d9b8", dado: "#b5482a", floor: FLOORS.tiles("#a5865c") });
      this.thing("food", () => {
        this._counter(-3, -4.6, 9, "#8a5a2e", "#6b4a2a", true);
        for (let i = 0; i < 5; i++) this._pot(-6.6 + i * 1.8, -4.6, 2.44, 0.55);
      });
      this._board(-3, 5.2, -6.2, 8, 1, "MAMA PUT · AMALA · RICE · BEANS");
      for (let r = 0; r < 2; r++) {
        const z = 0.2 + r * 3.6;
        this.thing("fun", () => {
          this.box(9, 0.16, 1.6, "#7a5230", 1, 1.9, z);
          for (const dx of [-4, 4]) this.box(0.2, 1.9, 1.4, "#5a3d22", 1 + dx, 0, z);
          this._bench(1, z - 1.3, 9, "#5a3d22");
          this._bench(1, z + 1.3, 9, "#5a3d22");
          for (let i = 0; i < 4; i++) this.cyl(0.35, 0.3, 0.2, ["#e05a2a", "#2f7a4f", "#f2c230"][i % 3], -2.4 + i * 2.2, 2.06, z, 10);
        });
        for (let i = 0; i < 4; i++) {
          spots.push(seat(-2.4 + i * 2.2, z - 1.3, 1.45, 0, { pose: "eat", station: "food" }));
          spots.push(seat(-2.4 + i * 2.2, z + 1.3, 1.45, Math.PI, { pose: "eat", station: "food" }));
        }
      }
      spots = spots.sort(() => Math.random() - 0.5);
      staff.push([{ name: "Mama Put", look: { skin: 4, hair: 3, top: 2, bottom: 2, style: 1 } }, S(-3, -5.9, { rot: 0, pose: "talk", station: "food" })]);
      this.anchors = { food: [-3, -2.8], fun: [1, 2], idle: [7, 5] };
      youSpot = S(7, 5, { rot: Math.PI * 1.2 });
    } else if (t === "market") {
      this._shell({ w: 22, d: 16, h: 7.5, paint: "#d9cdb4", dado: null, floor: FLOORS.hostel() });
      const awn = ["#1f6f4a", "#d23b3b", "#2f5f9e", "#f2c230", "#7a3e9d", "#e07a5f"];
      const goods = [["#e05a2a", "#f2c230", "#2f7a4f"], ["#8e3b46", "#f4f1ea"], ["#c9a24a", "#e9e2d3", "#6b4a2a"]];
      for (let i = 0; i < 6; i++) {
        const x = -7 + (i % 3) * 7;
        const z = i < 3 ? -4.5 : 1.5;
        this.thing(i % 2 ? "shop" : "food", () => this._stall(x, z, 5, awn[i], goods[i % 3]));
        staff.push([{ name: ["Iya Basira", "Alhaji Musa", "Mama Ngozi", "Baba Phone", "Iya Ibeji", "Bro Femi"][i], look: { skin: (i * 2) % 5, hair: (i * 3) % 6, top: i % 7, bottom: i % 5, style: i % 2 } },
          S(x + 1, z - 1.5, { rot: 0, pose: "talk", station: i % 2 ? "shop" : "food" })]);
      }
      for (let i = 0; i < 10; i++) spots.push(S(-8 + i * 1.8, i % 2 ? -1.6 : 4.6, { rot: i % 2 ? Math.PI : 0, station: "shop" }));
      this.anchors = { shop: [0, -1.8], food: [-7, -1.8], hustle: [7, 4.2], idle: [9, 6.8] };
      youSpot = S(9, 6.8, { rot: Math.PI * 1.2 });
    } else if (t === "sub") {
      this._shell({ w: 20, d: 14, h: 6.5, paint: "#efe3c4", dado: "#2f5f9e", floor: FLOORS.tiles("#cdbfa5") });
      this.thing("hustle", () => {
        this._counter(-5, -5.2, 7, "#3d5a80", "#2b3d55");
        for (let i = 0; i < 3; i++) {
          this.box(1.4, 1.0, 0.12, "#111", -7.5 + i * 2.4, 2.44, -5.6);
          this.box(1.2, 0.8, 0.04, mat("#2a6fd6", { emissive: "#2a6fd6" }), -7.5 + i * 2.4, 2.54, -5.52);
        }
        this.box(1.6, 1.1, 1.2, "#e9e9e6", -1.8, 2.44, -5.2); // printer
      });
      this._board(-5, 5.4, -6.7, 7, 0.9, "BUSINESS CENTRE · PRINT · TYPE · SCAN");
      this.thing("shop", () => {
        this._counter(5.5, -5.2, 6, "#8a5a2e", "#6b4a2a", true);
        this.box(6, 3, 0.8, "#6b4a2a", 5.5, 0, -6.6);
        for (let i = 0; i < 10; i++) this.box(0.5, 0.7, 0.5, ["#d23b3b", "#f2c230", "#2f5f9e", "#1f6f4a"][i % 4], 3.2 + (i % 5) * 1.1, 3.1 + Math.floor(i / 5) * 0.8, -6.5);
      });
      this._board(5.5, 5.4, -6.7, 5.5, 0.9, "PROVISIONS");
      staff.push([{ name: "Business centre", look: { skin: 1, hair: 0, top: 3, bottom: 1 } }, S(-5, -6.4, { rot: 0, pose: "type", station: "hustle" })]);
      staff.push([{ name: "Shop owner", look: { skin: 3, hair: 4, top: 2, bottom: 2 } }, S(5.5, -6.4, { rot: 0, station: "shop" })]);
      for (let i = 0; i < 4; i++) this.thing("fun", () => this._bench(-6 + i * 4, 3.2, 3.2, "#5a3d22"));
      for (let i = 0; i < 8; i++) spots.push(i < 4 ? seat(-6 + i * 4, 3.2, 1.45, Math.PI, { station: "fun" }) : S(-5 + (i - 4) * 3.4, -2.6, { rot: 0, station: "shop" }));
      this.anchors = { hustle: [-5, -3.2], shop: [5.5, -3.2], fun: [0, 2], idle: [8, 5.4] };
      youSpot = S(8, 5.4, { rot: Math.PI * 1.2 });
    } else if (t === "bank") {
      const banks = Object.values(spec.banks || {}).filter((b) => !b.app);
      const hall = spec.hall && spec.banks?.[spec.hall];
      const color = hall?.color || "#0d2f6e";
      this._shell({ w: 22, d: 15, h: 7, paint: "#f2efe8", dado: color, floor: FLOORS.tiles("#d8d4cc") });
      if (hall) {
        this._board(0, 6.1, -7.3, 8, 1, hall.name.toUpperCase());
        for (let i = 0; i < 3; i++) {
          this.thing("money", () => this._counter(-6 + i * 4.5, -4.6, 3.6, color, "#e9e6df", true));
          staff.push([{ name: ["Teller", "Teller", "Customer service"][i], look: { skin: (i * 2 + 1) % 5, hair: i === 1 ? 3 : 0, top: 5, bottom: 1, style: i === 1 ? 1 : 0 } },
            S(-6 + i * 4.5, -5.8, { rot: 0, pose: "type", station: "money" })]);
        }
        for (let i = 0; i < 3; i++) this.thing("money", () => this._atm(9.6, -3.8 + i * 2.6, color, -Math.PI / 2));
        for (let i = 0; i < 6; i++) {
          this._chair(-7.5 + i * 2, 3.4, "#3d405b", Math.PI);
          spots.push(seat(-7.5 + i * 2, 3.4, 1.4, Math.PI, { station: "money" }));
        }
        for (let i = 0; i < 4; i++) spots.push(S(-5 + i * 1.2, -1.4 + i * 0.3, { rot: Math.PI, station: "money" })); // the queue
      } else {
        // the lobby: every bank's sign and ATM in a row
        banks.forEach((b, i) => {
          const x = -9 + i * (18 / Math.max(1, banks.length - 1));
          this.box(2.8, 0.9, 0.2, b.color, x, 5.2, -7.2);
          this.thing("money", () => this._atm(x, -6.2, b.color));
          spots.push(S(x, -4.4, { rot: Math.PI, station: "money" }));
        });
        this._board(0, 6.4, -7.1, 7, 0.9, "BANKING AREA · ATM GALLERY");
      }
      this.anchors = { money: [0, -2.4], idle: [8, 5.8] };
      youSpot = S(8, 5.8, { rot: Math.PI * 1.2 });
    } else if (t === "clinic") {
      this._shell({ w: 18, d: 13, h: 6.2, paint: "#f4f4f2", dado: "#2f7a5a", floor: FLOORS.tiles("#e3e6e2") });
      this.thing("rest", () => this._counter(-4, -4.2, 5, "#2b2b2b", "#e9e9e6"));
      this._board(-4, 5.3, -6.2, 6, 0.9, "HEALTH CENTRE · RECEPTION");
      for (let i = 0; i < 3; i++) this.thing("rest", () => {
        this._bed(5 + (i % 2) * 0.01, -4 + i * 3.4, 2.6, "#cfe6f5", Math.PI / 2, "#9aa3a8");
        this.box(0.1, 4, 3, "#bfe3d0", 2.6, 0, -4 + i * 3.4);
      });
      for (let i = 0; i < 5; i++) {
        this._chair(-7 + i * 1.8, 3.6, "#d23b3b", Math.PI);
        spots.push(seat(-7 + i * 1.8, 3.6, 1.4, Math.PI, { station: "rest" }));
      }
      staff.push([{ name: "Nurse Funmi", look: { skin: 2, hair: 3, top: 4, bottom: 3, style: 1 } }, S(-4, -5.4, { rot: 0, pose: "type", station: "rest" })]);
      this.anchors = { rest: [-4, -2.2], care: [-4, -2.2], idle: [7.4, 5.4] };
      youSpot = S(7.4, 5.4, { rot: Math.PI * 1.2 });
    } else if (t === "auditorium" || t === "amphi") {
      const outdoor = t === "amphi";
      this._shell({ w: 22, d: 17, h: outdoor ? 0.4 : 8, paint: "#d9cfbd", dado: outdoor ? null : "#8e3b46", floor: outdoor ? FLOORS.hostel() : FLOORS.tiles("#7a5a3a") });
      this.thing("fun", () => {
        this.box(14, 1.4, 5, "#5a3d22", 0, 0, -6);
        if (!outdoor) for (const dx of [-7.5, 7.5]) this.box(1.6, 7, 0.4, "#8e1f2e", dx, 0, -7.5);
        this.box(1.2, 2.6, 1.2, "#111", -5, 1.4, -6.5);
        this.box(1.2, 2.6, 1.2, "#111", 5, 1.4, -6.5);
      });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
        const x = -8.4 + c * 2.4;
        const z = 0 + r * 2.4;
        this._chair(x, z, outdoor ? "#cbbfa8" : "#8e1f2e", Math.PI);
        spots.push(seat(x, z, 1.4, Math.PI, { station: "fun" }));
      }
      spots = spots.sort(() => Math.random() - 0.5);
      staff.push([{ name: "MC", look: { skin: 0, hair: 1, top: 2, bottom: 0 } }, S(0, -5.6, { y: 1.4, rot: 0, pose: "talk", station: "fun" })]);
      this.anchors = { fun: [0, -2.4], idle: [9, 7] };
      youSpot = S(9, 7, { rot: Math.PI * 1.2 });
    } else if (t === "sports") {
      this._shell({ w: 24, d: 17, h: 0.4, paint: "#d9d9d9", dado: null, floor: FLOORS.tiles("#4f8a35") });
      this.thing("fun", () => {
        this.box(16, 0.04, 0.2, "#f4f4f2", 0, 0, 0);
        for (const z of [-6.5, 6.5]) {
          this.box(4, 2.4, 0.15, "#f4f4f2", 0, 0, z);
        }
      });
      // a kickabout: six on the pitch, a few watching from the touchline
      for (let i = 0; i < 6; i++) spots.push(S(-6 + (i % 3) * 6, i < 3 ? -3 : 3, { rot: i < 3 ? 0 : Math.PI, play: true, station: "fun" }));
      for (let i = 0; i < 4; i++) spots.push(S(-9 + i * 6, 8, { rot: Math.PI, pose: i % 2 ? "talk" : "phone", station: "fun" }));
      this.anchors = { fun: [0, 1], idle: [10, 7] };
      youSpot = S(10, 7, { rot: Math.PI * 1.2 });
    } else {
      // a hall common room: TV, benches, notice board
      this._shell({ w: 18, d: 13, h: 6.2, paint: "#ebe1c8", dado: "#4f7fa8", floor: FLOORS.hostel() });
      this.thing("fun", () => {
        this._tv(0, -5.6);
        for (let i = 0; i < 3; i++) this._bench(-4 + i * 4, 0.5, 3.4, "#5a3d22");
      });
      this.thing("hustle", () => this.box(4, 3, 0.1, "#c9a24a", -6.5, 1.5, -6.2));
      for (let i = 0; i < 9; i++) spots.push(seat(-5.2 + (i % 3) * 1.2 + Math.floor(i / 3) * 4, 0.5, 1.45, Math.PI, { station: "fun" }));
      this.anchors = { fun: [0, -2.2], hustle: [-6.5, -4.6], idle: [6.5, 5] };
      youSpot = S(6.5, 5, { rot: Math.PI * 1.2 });
    }
    this.thing("leave", () => this._door(-(this.size.w / 2) + 0.15, this.size.d / 2 - 2.4));
    this._crowd(staff, spots, people, youSpot);
    if (t === "sports") this._kickabout();
    this.group.traverse((o) => {
      if (o.isMesh && !this.lowPower) {
        o.castShadow = o.castShadow ?? true;
        o.receiveShadow = true;
      }
    });
  }

  /** Walk "you" to the spot for a station while an action plays, then back. Football and jogging are acted out. */
  setActivity(station, actionId) {
    if (!this.you || !this.anchors) return;
    const me = this.you.children[0];
    // finishing: leave the game or the track and walk back
    if (!station) {
      if (this.kick) this._leaveKickabout();
      this.jog = null;
      me.userData.managed = false;
    }
    if (station && actionId === "football" && this.kick) {
      this.walkGoal = null;
      this.doing = station;
      me.userData.managed = true;
      if (!this.kick.players.includes(this.you)) this.kick.players.push(this.you);
      return;
    }
    if (station && actionId === "jog") {
      this.walkGoal = null;
      this.doing = station;
      me.userData.managed = true;
      this.jog = { s: 0 };
      return;
    }
    // a gist with someone in here: walk up to them, and they turn and talk back
    if (station && actionId?.startsWith("social:")) {
      const tag = actionId.slice(7);
      const them = this.tappables.find((o) => o.userData.station === tag);
      if (them) {
        const dx = this.you.position.x - them.position.x;
        const dz = this.you.position.z - them.position.z;
        const d = Math.hypot(dx, dz) || 1;
        this.walkGoal = [them.position.x + (dx / d) * 2, them.position.z + (dz / d) * 2];
        this.doing = station;
        this.doingAction = "gist";
        this.faceTarget = them;
        const person = them.children[0];
        if (!them.userData.spot?.sit && !person.userData.managed) {
          them.rotation.y = Math.atan2(dx, dz);
          person.act?.("talk");
        }
        return;
      }
    }
    this.faceTarget = null;
    const to = station ? this.anchors[station] || this.anchors.idle : this.youHome || this.anchors.idle;
    if (!to) return;
    this.walkGoal = to;
    this.doing = station;
    this.doingAction = actionId;
    if (!station) this.setBubble(null);
  }

  /** A relaxed kickabout: short passes along the grass, players jogging to the ball and strolling into space. */
  _kickabout() {
    const players = this.group.children.filter((c) => c.userData.spot?.play);
    if (players.length < 2) return;
    const ball = new THREE.Group();
    ball.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat("#f4f4f2", { flatShading: true, roughness: 0.6 })));
    for (const [x, y, z] of [[0.2, 0, 0], [-0.2, 0, 0], [0, 0.2, 0], [0, -0.2, 0], [0, 0, 0.2], [0, 0, -0.2]]) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.075, 5), mat("#1c1c1c", { side: THREE.DoubleSide }));
      patch.position.set(x * 1.01, y * 1.01, z * 1.01);
      patch.lookAt(x * 3, y * 3, z * 3);
      ball.add(patch);
    }
    ball.position.set(players[0].position.x, 0.22, players[0].position.z + 0.7);
    this.group.add(ball);
    for (const p of players) p.children[0].userData.managed = true;
    this.kick = { ball, players, holder: players[0], target: null, hold: 2.5, vel: new THREE.Vector2() };
  }

  _leaveKickabout() {
    const k = this.kick;
    const i = k.players.indexOf(this.you);
    if (i < 0) return;
    k.players.splice(i, 1);
    if (k.holder === this.you || k.target === this.you) {
      k.holder = k.players[0];
      k.target = null;
      k.vel.set(0, 0);
      k.hold = 1.5;
    }
  }

  _tickKickabout(dt) {
    const k = this.kick;
    const b = k.ball;
    const R = 0.22;
    const PITCH = { x: 8.6, z: 6.2 };
    if (!k.target) {
      // at someone's feet: a touch or two, then a pass
      const h = k.holder;
      const f = h.rotation.y;
      b.position.x += (h.position.x + Math.sin(f) * 0.75 - b.position.x) * Math.min(1, dt * 6);
      b.position.z += (h.position.z + Math.cos(f) * 0.75 - b.position.z) * Math.min(1, dt * 6);
      k.hold -= dt;
      if (k.hold <= 0) {
        const others = k.players.filter((p) => p !== h);
        const to = others[Math.floor(Math.random() * others.length)];
        const dx = to.position.x - b.position.x;
        const dz = to.position.z - b.position.z;
        const d = Math.hypot(dx, dz) || 1;
        // a firm side-foot pass: about 4–6 m/s (people here are 1.88 units to the metre)
        const speed = Math.min(11, Math.sqrt(2 * 2.4 * d) + 1.2);
        k.vel.set((dx / d) * speed, (dz / d) * speed);
        h.rotation.y = Math.atan2(dx, dz);
        k.target = to;
      }
    } else {
      const sp = k.vel.length();
      const next = Math.max(0, sp - 2.4 * dt); // grass slows the ball down
      if (sp > 0) k.vel.multiplyScalar(next / sp);
      b.position.x += k.vel.x * dt;
      b.position.z += k.vel.y * dt;
      if (Math.abs(b.position.x) > PITCH.x) {
        b.position.x = Math.sign(b.position.x) * PITCH.x;
        k.vel.x *= -0.4;
      }
      if (Math.abs(b.position.z) > PITCH.z) {
        b.position.z = Math.sign(b.position.z) * PITCH.z;
        k.vel.y *= -0.4;
      }
      // roll, don't slide
      if (next > 0.01) b.rotateOnWorldAxis(new THREE.Vector3(k.vel.y, 0, -k.vel.x).normalize(), (next * dt) / R);
      // whoever reaches it first takes it
      for (const p of k.players) {
        if (Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z) < 0.95 && (p === k.target || next < 1.5)) {
          k.holder = p;
          k.target = null;
          k.vel.set(0, 0);
          k.hold = 1.2 + Math.random() * 2.3;
          break;
        }
      }
    }
    for (const p of k.players) {
      const person = p.children[0];
      let goal = null;
      let speed = 0;
      if (p === k.target || (k.target && k.vel.length() < 1.2 && p === this._nearest(k.players, b))) {
        goal = [b.position.x, b.position.z];
        speed = Math.hypot(goal[0] - p.position.x, goal[1] - p.position.z) > 5 ? 5.4 : 2.7; // jog if it's far, else walk
      } else if (p !== k.holder) {
        // stroll into space now and then (about every few seconds), otherwise stand and watch
        const r = p.userData.roam;
        if (r && Math.hypot(r[0] - p.position.x, r[1] - p.position.z) < 0.5) p.userData.roam = null;
        if (!p.userData.roam && Math.random() < dt * 0.25) {
          p.userData.roam = [(Math.random() * 2 - 1) * PITCH.x * 0.85, (Math.random() * 2 - 1) * PITCH.z * 0.85];
        }
        if (p.userData.roam) {
          goal = p.userData.roam;
          speed = 1.6;
        }
      }
      if (goal) {
        const dx = goal[0] - p.position.x;
        const dz = goal[1] - p.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.5) {
          const step = Math.min(d, speed * dt);
          p.position.x += (dx / d) * step;
          p.position.z += (dz / d) * step;
          p.rotation.y = lerpAngle(p.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
          person.walk?.(dt, speed);
          continue;
        }
      }
      // standing: keep an eye on the ball
      p.rotation.y = lerpAngle(p.rotation.y, Math.atan2(b.position.x - p.position.x, b.position.z - p.position.z), Math.min(1, dt * 3));
      person.walk?.(dt, 0);
    }
  }

  _nearest(list, b) {
    let best = null;
    let bd = Infinity;
    for (const p of list) {
      const d = Math.hypot(p.position.x - b.position.x, p.position.z - b.position.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Laps of the pitch at an easy jogging pace (about 2.8 m/s). */
  _tickJog(dt) {
    const p = this.you;
    const person = p.children[0];
    const W = 10;
    const D = 7.2;
    const lap = 4 * W + 4 * D;
    this.jog.s = (this.jog.s + dt * 5.2) % lap;
    let s = this.jog.s;
    let x;
    let z;
    if (s < 2 * W) [x, z] = [-W + s, -D];
    else if ((s -= 2 * W) < 2 * D) [x, z] = [W, -D + s];
    else if ((s -= 2 * D) < 2 * W) [x, z] = [W - s, D];
    else [x, z] = [-W, D - (s - 2 * W)];
    const dx = x - p.position.x;
    const dz = z - p.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 3) {
      // first get to the track
      p.position.x += (dx / d) * Math.min(d, 4 * dt);
      p.position.z += (dz / d) * Math.min(d, 4 * dt);
      p.rotation.y = Math.atan2(dx, dz);
      person.walk?.(dt, 4);
      this.jog.s = Math.max(0, this.jog.s - dt * 5.2);
      return;
    }
    if (d > 0.001) p.rotation.y = lerpAngle(p.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));
    p.position.set(x, p.position.y, z);
    person.walk?.(dt, 5.2);
  }

  tick(dt) {
    if (this.kick) this._tickKickabout(dt);
    if (this.jog && this.you) this._tickJog(dt);
    if (this.you && this.walkGoal) {
      const p = this.you.position;
      const dx = this.walkGoal[0] - p.x;
      const dz = this.walkGoal[1] - p.z;
      const d = Math.hypot(dx, dz);
      const person = this.you.children[0];
      if (d > 0.15) {
        const step = Math.min(d, dt * 2.4); // an unhurried indoor walk
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.you.rotation.y = Math.atan2(dx, dz);
        person.walk?.(dt, 2.4);
      } else {
        this.walkGoal = null;
        if (this.faceTarget) {
          this.you.rotation.y = Math.atan2(this.faceTarget.position.x - p.x, this.faceTarget.position.z - p.z);
        }
        // once there, do the thing: eat at the pot, read standing at the shelf, wash at the bucket…
        const act = ACT_FOR_ACTION[this.doingAction] || { food: "eat", study: "interact", class: "fold", care: "kneel", rest: "fold", fun: "phone",
          hustle: "interact", shop: "pickup", money: "interact" }[this.doing];
        if (act) person.act?.(act);
        else person.walk?.(dt, 0);
      }
    }
    if (this.fanBlades) this.fanBlades.rotation.y += dt * 7;
  }
}
