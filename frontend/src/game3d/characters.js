// Low-poly students. Every person is built from a few simple shapes, shares materials, and swings
// their arms and legs as they walk. Characters face +Z.
import * as THREE from "three";

export const LOOK = {
  skin: ["#8d5524", "#a86b3c", "#6b3e1f", "#c68642", "#4a2a14"],
  hair: ["low_cut", "afro", "braids", "bun", "dreads", "bald"],
  top: ["#1f6f4a", "#b03a2e", "#f2c230", "#2f5f9e", "#f4f4f2", "#222222", "#7a3e9d"],
  bottom: ["#26324a", "#3b3b3b", "#6b4f2a", "#e8e2d4", "#1f6f4a"],
  style: ["trousers", "skirt"],
  hall: ["male", "female"],
};

const materials = new Map();
let HIGH = true;
/** Realistic (physically based) materials on capable devices; cheaper ones on old phones. */
export function setQuality(high) {
  HIGH = Boolean(high);
}
export function surface(params = {}) {
  if (HIGH) return new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0, ...params });
  const { roughness, metalness, ...rest } = params; // eslint-disable-line no-unused-vars
  return new THREE.MeshLambertMaterial(rest);
}
export function mat(color, extra = {}) {
  const key = `${HIGH}:${color}:${JSON.stringify(extra)}`;
  if (!materials.has(key)) materials.set(key, surface({ color, ...extra }));
  return materials.get(key);
}

const geo = {
  leg: new THREE.CylinderGeometry(0.17, 0.13, 1.08, 10).translate(0, -0.54, 0),
  shoe: new THREE.BoxGeometry(0.28, 0.16, 0.42).translate(0, -1.08, 0.07),
  torso: new THREE.CapsuleGeometry(0.4, 0.62, 4, 12),
  arm: new THREE.CylinderGeometry(0.115, 0.09, 0.86, 8).translate(0, -0.43, 0),
  hand: new THREE.SphereGeometry(0.12, 6, 5).translate(0, -0.9, 0),
  head: new THREE.SphereGeometry(0.34, 18, 14),
  eye: new THREE.SphereGeometry(0.035, 6, 5),
  eyeWhite: new THREE.SphereGeometry(0.06, 8, 6),
  ear: new THREE.SphereGeometry(0.08, 6, 5),
  nose: new THREE.SphereGeometry(0.06, 6, 5),
  mouth: new THREE.BoxGeometry(0.14, 0.03, 0.03),
  collar: new THREE.TorusGeometry(0.2, 0.05, 5, 12).rotateX(Math.PI / 2),
  cap: new THREE.SphereGeometry(0.375, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
  afro: new THREE.IcosahedronGeometry(0.55, 1),
  bun: new THREE.SphereGeometry(0.2, 8, 6),
  braid: new THREE.CylinderGeometry(0.045, 0.04, 0.75, 4).translate(0, -0.37, 0),
  dread: new THREE.CylinderGeometry(0.06, 0.05, 0.45, 4).translate(0, -0.22, 0),
  skirt: new THREE.CylinderGeometry(0.36, 0.56, 0.78, 9),
  bag: new THREE.BoxGeometry(0.6, 0.72, 0.28),
  shadow: new THREE.CircleGeometry(0.62, 14).rotateX(-Math.PI / 2),
};

let shadowMat;
function blobShadow() {
  if (!shadowMat) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.45)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(geo.shadow, shadowMat);
  m.position.y = 0.04;
  m.userData.blob = true;
  m.renderOrder = 1;
  return m;
}

export function randomLook(rand = Math.random) {
  const pick = (arr) => Math.floor(rand() * arr.length);
  return { skin: pick(LOOK.skin), hair: pick(LOOK.hair), top: pick(LOOK.top), bottom: pick(LOOK.bottom), style: pick(LOOK.style), hall: pick(LOOK.hall) };
}

/**
 * makePerson(look) -> THREE.Group with .walk(dt, speed) to animate.
 * look = indexes into LOOK, as the server stores it.
 */
export function makePerson(look = {}, { bag = false, scale = 1.05 } = {}) {
  const skin = mat(LOOK.skin[look.skin ?? 0]);
  const top = mat(LOOK.top[look.top ?? 0]);
  const bottom = mat(LOOK.bottom[look.bottom ?? 0]);
  const hairMat = mat("#151010");
  const skirt = LOOK.style[look.style ?? 0] === "skirt";

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.15;
  root.add(body);

  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.2, 0, 0);
    const leg = new THREE.Mesh(geo.leg, skirt ? skin : bottom);
    const shoe = new THREE.Mesh(geo.shoe, mat("#2a2420"));
    hip.add(leg, shoe);
    body.add(hip);
    legs.push(hip);
  }
  if (skirt) {
    const s = new THREE.Mesh(geo.skirt, bottom);
    s.position.y = -0.1;
    body.add(s);
  }
  const torso = new THREE.Mesh(geo.torso, top);
  torso.position.y = 0.7;
  const collar = new THREE.Mesh(geo.collar, top);
  collar.position.y = 1.42;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 6), skin);
  neck.position.y = 1.5;
  body.add(torso, collar, neck);

  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.55, 1.12, 0);
    shoulder.rotation.z = side * 0.08;
    shoulder.add(new THREE.Mesh(geo.arm, top), new THREE.Mesh(geo.hand, skin));
    body.add(shoulder);
    arms.push(shoulder);
  }

  const head = new THREE.Group();
  head.position.y = 1.72;
  head.add(new THREE.Mesh(geo.head, skin));
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(geo.eyeWhite, mat("#f4f1ea"));
    white.position.set(side * 0.13, 0.05, 0.31);
    const eye = new THREE.Mesh(geo.eye, mat("#111"));
    eye.position.set(side * 0.13, 0.05, 0.345);
    const ear = new THREE.Mesh(geo.ear, skin);
    ear.position.set(side * 0.35, 0.0, 0);
    head.add(white, eye, ear);
  }
  const nose = new THREE.Mesh(geo.nose, skin);
  nose.position.set(0, -0.04, 0.35);
  const mouth = new THREE.Mesh(geo.mouth, mat("#5a2a22"));
  mouth.position.set(0, -0.16, 0.315);
  head.add(nose, mouth);
  const hair = LOOK.hair[look.hair ?? 0];
  if (hair !== "bald") {
    const cap = new THREE.Mesh(geo.cap, hairMat);
    cap.position.y = 0.02;
    cap.rotation.x = -0.18;
    head.add(cap);
  }
  if (hair === "afro") {
    const afro = new THREE.Mesh(geo.afro, hairMat);
    afro.position.set(0, 0.2, -0.06);
    head.add(afro);
  } else if (hair === "bun") {
    const bun = new THREE.Mesh(geo.bun, hairMat);
    bun.position.set(0, 0.36, -0.18);
    head.add(bun);
  } else if (hair === "braids" || hair === "dreads") {
    const g = hair === "braids" ? geo.braid : geo.dread;
    const n = hair === "braids" ? 9 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + (0.7 * i) / (n - 1)) + Math.PI / 2;
      const strand = new THREE.Mesh(g, hairMat);
      strand.position.set(Math.cos(a) * 0.3, 0.05, -Math.abs(Math.sin(a)) * 0.3 - 0.02);
      strand.rotation.x = 0.25;
      head.add(strand);
    }
  }
  body.add(head);

  if (bag) {
    const b = new THREE.Mesh(geo.bag, mat(["#2f3b52", "#6b2e2e", "#3d5a3a", "#222"][Math.floor(Math.random() * 4)]));
    b.position.set(0, 0.78, -0.42);
    body.add(b);
  }

  root.add(blobShadow());
  root.scale.setScalar(scale);

  let phase = Math.random() * 6;
  root.walk = (dt, speed) => {
    // speed in units per second; 0 = standing
    const moving = speed > 0.2;
    const running = speed > 9;
    phase += dt * (moving ? Math.min(16, 4 + speed * 0.95) : 0);
    const amp = running ? 0.95 : Math.min(0.7, 0.25 + speed * 0.07);
    const swing = moving ? Math.sin(phase) * amp : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    arms[0].rotation.x = -swing * (running ? 1.1 : 0.8);
    arms[1].rotation.x = swing * (running ? 1.1 : 0.8);
    body.rotation.x = running ? 0.18 : moving ? 0.05 : 0; // lean into a run
    const t = performance.now() / 1000;
    head.rotation.y = moving ? 0 : Math.sin(t * 0.5 + phase) * 0.35; // idle: look around
    body.position.y = 1.15 + (moving ? Math.abs(Math.cos(phase)) * (running ? 0.12 : 0.06) : Math.sin(t * 1.6) * 0.012);
  };
  root.userData.parts = { body, head, arms, legs };
  return root;
}
