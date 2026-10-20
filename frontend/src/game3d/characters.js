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

// Proportions of a real young adult: the head is about a seventh of the height, legs about half.
export const HIP = 1.5;   // hip height above the ground (before scaling)
const geo = {
  thigh: new THREE.CylinderGeometry(0.16, 0.13, 0.78, 10).translate(0, -0.39, 0),
  shin: new THREE.CylinderGeometry(0.12, 0.095, 0.72, 10).translate(0, -0.36, 0),
  shoe: new THREE.CapsuleGeometry(0.11, 0.26, 3, 8).rotateX(Math.PI / 2).scale(1.15, 0.8, 1).translate(0, -0.07, 0.08),
  sole: new THREE.BoxGeometry(0.26, 0.05, 0.46).translate(0, -0.15, 0.08),
  hips: new THREE.CylinderGeometry(0.31, 0.29, 0.34, 12),
  torso: new THREE.CylinderGeometry(0.36, 0.3, 0.86, 12).translate(0, 0.43, 0),
  chest: new THREE.SphereGeometry(0.36, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 0.82),
  sleeve: new THREE.CylinderGeometry(0.115, 0.1, 0.42, 8).translate(0, -0.21, 0),
  upper: new THREE.CylinderGeometry(0.09, 0.08, 0.5, 8).translate(0, -0.25, 0),
  fore: new THREE.CylinderGeometry(0.075, 0.06, 0.5, 8).translate(0, -0.25, 0),
  hand: new THREE.SphereGeometry(0.075, 8, 6).scale(0.9, 1.25, 0.7).translate(0, -0.06, 0),
  neck: new THREE.CylinderGeometry(0.085, 0.1, 0.2, 8),
  head: new THREE.SphereGeometry(0.235, 20, 16).scale(0.92, 1.12, 1),
  jaw: new THREE.SphereGeometry(0.17, 12, 8).scale(1.05, 0.8, 1),
  eye: new THREE.SphereGeometry(0.026, 8, 6),
  eyeWhite: new THREE.SphereGeometry(0.042, 8, 6).scale(1.25, 0.8, 0.6),
  brow: new THREE.BoxGeometry(0.085, 0.018, 0.02),
  ear: new THREE.SphereGeometry(0.05, 6, 5).scale(0.6, 1, 0.8),
  nose: new THREE.SphereGeometry(0.042, 8, 6).scale(1.1, 0.9, 0.9),
  lips: new THREE.CapsuleGeometry(0.02, 0.07, 2, 6).rotateZ(Math.PI / 2),
  collar: new THREE.TorusGeometry(0.13, 0.03, 5, 14).rotateX(Math.PI / 2),
  cap: new THREE.SphereGeometry(0.248, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.95, 1.08, 1.04),
  fade: new THREE.SphereGeometry(0.243, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(0.94, 1.1, 1.03),
  afro: new THREE.IcosahedronGeometry(0.34, 2),
  bun: new THREE.SphereGeometry(0.13, 10, 8),
  braid: new THREE.CylinderGeometry(0.028, 0.022, 0.62, 5).translate(0, -0.31, 0),
  dread: new THREE.CylinderGeometry(0.038, 0.03, 0.4, 5).translate(0, -0.2, 0),
  skirt: new THREE.CylinderGeometry(0.3, 0.46, 0.7, 14),
  bag: new THREE.BoxGeometry(0.46, 0.56, 0.2),
  strap: new THREE.BoxGeometry(0.05, 0.8, 0.04),
  shadow: new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2),
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
  const skinHex = LOOK.skin[look.skin ?? 0];
  const skin = mat(skinHex);
  const skinDark = mat(new THREE.Color(skinHex).multiplyScalar(0.72).getStyle());
  const top = mat(LOOK.top[look.top ?? 0]);
  const bottom = mat(LOOK.bottom[look.bottom ?? 0]);
  const hairMat = mat("#141010", { roughness: 0.95 });
  const skirt = LOOK.style[look.style ?? 0] === "skirt";
  const female = (look.hall ?? 0) === 1 || ["braids", "bun"].includes(LOOK.hair[look.hair ?? 0]);
  const shoeMat = mat(["#f2f2ee", "#1c1c1c", "#6b4a2a"][((look.top ?? 0) + (look.bottom ?? 0)) % 3]);

  const root = new THREE.Group();
  const body = new THREE.Group(); // origin at the hips
  body.position.y = HIP;
  root.add(body);

  // legs: thigh + shin, with the knee bending a little as you walk
  const legs = [];
  const knees = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.15, 0, 0);
    const thigh = new THREE.Mesh(geo.thigh, skirt ? skin : bottom);
    const knee = new THREE.Group();
    knee.position.y = -0.78;
    const shin = new THREE.Mesh(geo.shin, skirt ? skin : bottom);
    const foot = new THREE.Group();
    foot.position.y = -0.72;
    foot.add(new THREE.Mesh(geo.shoe, shoeMat), new THREE.Mesh(geo.sole, mat("#e9e6df")));
    knee.add(shin, foot);
    hip.add(thigh, knee);
    body.add(hip);
    legs.push(hip);
    knees.push(knee);
  }
  const pelvis = new THREE.Mesh(geo.hips, skirt ? top : bottom);
  pelvis.position.y = 0.05;
  body.add(pelvis);
  if (skirt) {
    const s = new THREE.Mesh(geo.skirt, bottom);
    s.position.y = -0.18;
    body.add(s);
  }
  const torso = new THREE.Mesh(geo.torso, top);
  torso.position.y = 0.12;
  torso.scale.set(1, 1, 0.68);
  const chest = new THREE.Mesh(geo.chest, top);
  chest.position.y = 0.98;
  chest.scale.z = female ? 0.9 : 0.75;
  body.add(torso, chest);
  const neck = new THREE.Mesh(geo.neck, skin);
  neck.position.y = 1.14;
  const collar = new THREE.Mesh(geo.collar, top);
  collar.position.y = 1.06;
  body.add(neck, collar);

  // arms: a short sleeve, a bare upper arm and forearm, a hand; the elbow bends as you walk
  const arms = [];
  const elbows = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.42, 0.98, 0);
    shoulder.rotation.z = side * 0.1;
    const elbow = new THREE.Group();
    elbow.position.y = -0.5;
    elbow.add(new THREE.Mesh(geo.fore, skin));
    const hand = new THREE.Mesh(geo.hand, skin);
    hand.position.y = -0.5;
    elbow.add(hand);
    shoulder.add(new THREE.Mesh(geo.sleeve, top), new THREE.Mesh(geo.upper, skin), elbow);
    body.add(shoulder);
    arms.push(shoulder);
    elbows.push(elbow);
  }

  // head: a slightly long skull, jaw, ears, a nose, eyes with whites, brows and lips
  const head = new THREE.Group();
  head.position.y = 1.43;
  head.add(new THREE.Mesh(geo.head, skin));
  const jaw = new THREE.Mesh(geo.jaw, skin);
  jaw.position.set(0, -0.1, 0.03);
  head.add(jaw);
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(geo.eyeWhite, mat("#f3efe6"));
    white.position.set(side * 0.085, 0.03, 0.2);
    const eye = new THREE.Mesh(geo.eye, mat("#120c0a"));
    eye.position.set(side * 0.085, 0.03, 0.222);
    const brow = new THREE.Mesh(geo.brow, hairMat);
    brow.position.set(side * 0.085, 0.09, 0.205);
    brow.rotation.z = side * -0.12;
    const ear = new THREE.Mesh(geo.ear, skin);
    ear.position.set(side * 0.215, 0.0, -0.01);
    head.add(white, eye, brow, ear);
  }
  const nose = new THREE.Mesh(geo.nose, skinDark);
  nose.position.set(0, -0.035, 0.225);
  const lips = new THREE.Mesh(geo.lips, mat(new THREE.Color(skinHex).multiplyScalar(0.55).getStyle()));
  lips.position.set(0, -0.125, 0.19);
  head.add(nose, lips);

  const hair = LOOK.hair[look.hair ?? 0];
  if (hair === "low_cut") {
    const cap = new THREE.Mesh(geo.fade, hairMat);
    cap.position.set(0, 0.025, -0.012);
    cap.rotation.x = -0.25;
    head.add(cap);
  } else if (hair !== "bald") {
    const cap = new THREE.Mesh(geo.cap, hairMat);
    cap.position.set(0, 0.03, -0.01);
    cap.rotation.x = -0.22;
    head.add(cap);
  }
  if (hair === "afro") {
    const afro = new THREE.Mesh(geo.afro, hairMat);
    afro.position.set(0, 0.13, -0.05);
    afro.scale.set(1, 0.92, 1);
    head.add(afro);
  } else if (hair === "bun") {
    const bun = new THREE.Mesh(geo.bun, hairMat);
    bun.position.set(0, 0.24, -0.14);
    head.add(bun);
  } else if (hair === "braids" || hair === "dreads") {
    const g = hair === "braids" ? geo.braid : geo.dread;
    const n = hair === "braids" ? 16 : 14;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.08 + (0.84 * i) / (n - 1)) + Math.PI / 2;
      const strand = new THREE.Mesh(g, hairMat);
      strand.position.set(Math.cos(a) * 0.21, 0.07, -Math.abs(Math.sin(a)) * 0.2 - 0.01);
      strand.rotation.x = 0.18 + (i % 2) * 0.06;
      strand.rotation.z = Math.cos(a) * 0.15;
      head.add(strand);
    }
  }
  body.add(head);

  if (bag) {
    const color = ["#2f3b52", "#6b2e2e", "#3d5a3a", "#222"][Math.floor(Math.random() * 4)];
    const b = new THREE.Mesh(geo.bag, mat(color));
    b.position.set(0, 0.62, -0.3);
    body.add(b);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(geo.strap, mat(color));
      strap.position.set(side * 0.2, 0.7, 0.2);
      strap.rotation.x = 0.2;
      body.add(strap);
    }
  }

  root.add(blobShadow());
  root.scale.setScalar(scale);

  let phase = Math.random() * 6;
  root.walk = (dt, speed) => {
    // speed in units per second; 0 = standing
    const moving = speed > 0.2;
    const running = speed > 9;
    phase += dt * (moving ? Math.min(16, 4 + speed * 0.95) : 0);
    const amp = running ? 0.85 : Math.min(0.6, 0.22 + speed * 0.06);
    const swing = moving ? Math.sin(phase) * amp : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    // the back leg's knee bends as it swings forward
    knees[0].rotation.x = moving ? Math.max(0, -Math.sin(phase)) * amp * 1.3 : 0;
    knees[1].rotation.x = moving ? Math.max(0, Math.sin(phase)) * amp * 1.3 : 0;
    arms[0].rotation.x = -swing * (running ? 1.1 : 0.75);
    arms[1].rotation.x = swing * (running ? 1.1 : 0.75);
    elbows[0].rotation.x = elbows[1].rotation.x = moving ? -(running ? 1.2 : 0.35) : -0.08;
    body.rotation.x = running ? 0.16 : moving ? 0.04 : 0;
    const t = performance.now() / 1000;
    head.rotation.y = moving ? 0 : Math.sin(t * 0.5 + phase) * 0.35; // idle: look around
    body.position.y = HIP + (moving ? Math.abs(Math.cos(phase)) * (running ? 0.1 : 0.05) : Math.sin(t * 1.6) * 0.01);
  };
  root.userData.parts = { body, head, arms, legs, knees, elbows };
  root.userData.hip = HIP;
  return root;
}
