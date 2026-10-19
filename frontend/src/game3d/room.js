// Your room, drawn like a doll's house (the front wall is cut away so you can see in).
// Hall rooms have two bunk beds for four real players; off campus there's a single room, a self-contain
// or a 2-bedroom flat for at most two tenants. Roommates who are in sit on their beds, sleepers lie down,
// and the beds of people who are out have their names on them.
import * as THREE from "three";
import { makePerson, mat, surface } from "./characters";
import { labelTexture } from "./textures";

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
    const dist = Math.max((r.w * (this.camera.aspect < 0.8 ? 0.5 : 0.56)) / Math.tan(hfov), (r.d * 0.55 + r.h * 0.5) / Math.tan(v));
    const elev = 0.62; // looking down into the room
    const sway = Math.sin(this.t * 0.25) * 0.05; // a gentle drift so the room feels alive; it never spins
    const tx = 0;
    const ty = r.h * 0.28;
    const tz = -r.d * 0.05;
    this.camera.position.set(tx + Math.sin(sway) * dist * Math.cos(elev), ty + Math.sin(elev) * dist,
      tz + Math.cos(sway) * dist * Math.cos(elev));
    this.camera.lookAt(tx, ty, tz);
    for (const p of this.people) p.update?.(this.t);
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

  label(text, x, y, z, scale = 0.9) {
    const tex = labelTexture(text);
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

  _poster(x, y, z, w, h, color, rot = 0) {
    const p = this.box(w, h, 0.04, color, x, y, z);
    p.rotation.y = rot;
  }

  // --- the rooms ---------------------------------------------------------------------------------

  _build(info) {
    this._clear();
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.glass = this.tube = this.fanBlades = null;
    const people = info.people || [];
    const seats = [];
    if (info.kind === "hostel") {
      this._shell({ w: 11.5, d: 13, h: 6.2, paint: "#ebe1c8", dado: "#4f7fa8", floor: FLOORS.hostel(), win: 0 });
      this._door(-5.6, 4.4);
      this._bunk(-3.85, -1.9, [SHEETS[0], SHEETS[1]]);
      this._bunk(3.85, -1.9, [SHEETS[2], SHEETS[3]]);
      // bed slots, bottom bunks first: lower-left, lower-right, upper-left, upper-right
      const slots = [[-3.85, 1.6, -1.9], [3.85, 1.6, -1.9], [-3.85, 3.6, -1.9], [3.85, 3.6, -1.9]];
      this._table(0, -5.2, 2.8, 1.4);
      this._chair(0, -3.9, "#d64535", Math.PI);
      this._locker(4.6, 2.9, "#7a8c96", -Math.PI / 2);
      this._locker(4.6, 4.9, "#8a7a5a", -Math.PI / 2);
      this._bucket(-1.0, 4.9, "#d23b3b");
      this._bucket(0.3, 5.4, "#2a6fd6");
      this._clothesLine(-5.3, -2.2, 5.6, -5.9);
      this._poster(-5.4, 3.0, 2.2, 1.4, 1.9, "#f2c230", Math.PI / 2);
      this._poster(5.4, 3.2, -4.6, 1.2, 1.7, "#1f6f4a", -Math.PI / 2);
      for (let i = 0; i < 4; i++) {
        const [bx, by, bz] = slots[i];
        seats.push({ x: bx, y: by, z: bz, bed: true, top: i >= 2, side: bx < 0 ? 1 : -1 });
      }
    } else if (info.kind === "single") {
      this._shell({ w: 12, d: 10, h: 6, paint: "#e7dcc3", dado: "#a8754a", floor: FLOORS.tiles("#c9b9a0") });
      this._door(-5.85, 2.8);
      this._bed(-3.4, -1.5, 3.6, SHEETS[4]);
      this._table(3.2, -3.6, 3, 1.6);
      this._chair(3.2, -2.3, "#2f5f9e", Math.PI);
      this._fan(4.6, 1.2);
      this._locker(0.6, -4.2, "#7a5230");
      this._bucket(4.6, 3.6, "#d23b3b");
      this._rug(-0.6, 2.2, 4.5, 3, "#7a3e3e");
      seats.push({ x: -3.4, y: 1.4, z: -0.6, bed: true, side: 1 }, { x: 1.4, y: 0.1, z: 2.4, floorMattress: true, side: -1 });
      if (people.length > 1) this.box(2.6, 0.35, 4.6, "#efe8d8", 1.4, 0, 2.2), this.box(2.6, 0.06, 3.4, SHEETS[5], 1.4, 0.35, 2.7);
    } else if (info.kind === "self_con") {
      this._shell({ w: 15, d: 11, h: 6.2, paint: "#efe6d3", dado: null, floor: FLOORS.tiles("#d7cdbd") });
      this._door(-7.35, 3.4);
      this._bed(-4.4, -2.0, 4.2, SHEETS[6]);
      this._kitchen(4.4, -4.4, 5);
      this._sofa(2.4, 2.4, 4, "#3d5a80", Math.PI);
      this._tv(-0.4, -4.6);
      this._rug(1.0, 0.6, 5, 3.4, "#b5482a");
      this._fan(-1.2, 2.8);
      // the bathroom door
      this.box(0.25, 4.2, 2.2, "#f4f4f4", 7.35, 0, -1.8);
      this._poster(7.1, 3.0, 1.6, 1.4, 1.8, "#e07a5f", -Math.PI / 2);
      seats.push({ x: -4.4, y: 1.4, z: -1.0, bed: true, side: 1 }, { x: 1.6, y: 1.1, z: 2.2, sofa: true });
    } else {
      // a 2-bedroom flat: the parlour, with the two bedroom doors at the back
      this._shell({ w: 18, d: 13, h: 6.6, paint: "#f2ead9", dado: null, floor: FLOORS.tiles("#cdb79a") });
      this._door(-8.85, 4.2);
      this.box(2.4, 4.4, 0.25, "#6b4a2a", -5.2, 0, -6.3);
      this.box(2.4, 4.4, 0.25, "#6b4a2a", 6.4, 0, -6.3);
      this._sofa(-2.4, 2.6, 5.2, "#5b3a29", Math.PI);
      this._sofa(-6.6, -1.0, 2.6, "#5b3a29", Math.PI / 2);
      this._tv(1.8, -5.2);
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
        if (o.userData.blob) o.visible = false;
        if (o.isMesh) o.castShadow = !this.lowPower;
      });
      const { legs, arms, body, head } = person.userData.parts;
      const pivot = new THREE.Group();
      pivot.add(person);
      if (p.where === "asleep") {
        person.rotation.x = -Math.PI / 2;
        pivot.position.set(seat.x, seat.y + 0.45, seat.z + 2.6);
        if (seat.sofa) pivot.rotation.y = Math.PI / 2;
        this.label(`${name} 😴`, seat.x, seat.y + 1.9, seat.z, 0.75);
      } else {
        // sitting on the edge of the bed (or on the sofa), facing the room
        legs[0].rotation.x = legs[1].rotation.x = -Math.PI / 2;
        pivot.position.set(seat.x + (seat.bed ? (seat.side || 1) * 0.9 : 0), seat.y - 0.95 + (seat.floorMattress ? 0.2 : 0),
          seat.z + (seat.bed ? 1.2 : 0));
        pivot.rotation.y = seat.bed && !seat.top ? (seat.side || 1) * Math.PI / 2 : 0;
        if (seat.top) pivot.rotation.y = 0;
        this.label(name, pivot.position.x, pivot.position.y + 3.4, pivot.position.z, 0.75);
        let phase = i * 1.7;
        person.update = (t) => {
          head.rotation.y = Math.sin(t * 0.6 + phase) * 0.5;
          arms[0].rotation.x = -0.5 + Math.sin(t * 1.3 + phase) * 0.15;
          arms[1].rotation.x = -0.5 + Math.cos(t * 1.1 + phase) * 0.15;
          body.position.y = 1.15 + Math.sin(t * 1.6 + phase) * 0.015;
          phase += 0;
        };
        this.people.push(person);
      }
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

  tick(dt) {
    if (this.fanBlades) this.fanBlades.rotation.y += dt * 12;
  }
}
