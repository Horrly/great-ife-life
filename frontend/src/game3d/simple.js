// The light-weight stand-in person: built from a few smooth shapes. Used for far-away crowds, on very
// old phones, and for the moment before the real people have downloaded. Characters face +Z.
import * as THREE from "three";

import { LOOK, mat } from "./look";

// Proportions of a real young adult: the head is about a seventh of the height, legs about half.
export const HIP = 1.62;   // hip height above the ground (before scaling)
const V2 = THREE.Vector2;

/** A smooth limb: a tapered tube with rounded ends, hanging down from its joint at y = 0. */
function limb(r0, r1, len, seg = 14) {
  const pts = [];
  const cap = 5;
  for (let i = 0; i <= cap; i++) {
    const a = (Math.PI / 2) * (1 - i / cap);
    pts.push(new V2(Math.cos(a) * r0, Math.sin(a) * r0 * 0.7));
  }
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    pts.push(new V2(r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * 0.012, -len * t));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (Math.PI / 2) * (i / cap);
    pts.push(new V2(Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.7));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/** A body part turned on a lathe from [radius, height] pairs, flattened front to back. */
function turned(profile, seg = 20, depth = 0.66) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new V2(r, y)), seg).scale(1, 1, depth);
}

const geoCache = new Map();
function shapes(female) {
  const key = female ? "f" : "m";
  if (geoCache.has(key)) return geoCache.get(key);
  const sh = female ? 0.35 : 0.39; // shoulder half-width
  const g = {
    // shirt/blouse from the waist to the shoulders and around the neck
    torso: turned(female
      ? [[0.001, -0.06], [0.3, -0.06], [0.3, 0.1], [0.255, 0.34], [0.28, 0.55], [0.33, 0.7], [0.335, 0.82], [0.32, 0.95], [0.25, 1.03], [0.12, 1.08], [0.001, 1.08]]
      : [[0.001, -0.06], [0.3, -0.06], [0.31, 0.12], [0.3, 0.36], [0.33, 0.6], [0.36, 0.8], [0.37, 0.93], [0.3, 1.02], [0.13, 1.08], [0.001, 1.08]], 24, 0.6),
    // the pelvis, in trouser or skirt colour
    pelvis: turned(female
      ? [[0.001, 0.04], [0.29, 0.04], [0.33, -0.08], [0.32, -0.2], [0.001, -0.22]]
      : [[0.001, 0.04], [0.29, 0.04], [0.3, -0.08], [0.29, -0.2], [0.001, -0.22]], 20, 0.6),
    skirt: turned([[0.001, 0.06], [0.31, 0.06], [0.34, -0.12], [0.4, -0.45], [0.44, -0.7], [0.001, -0.7]], 24, 0.72),
    bust: new THREE.SphereGeometry(0.11, 12, 10).scale(1, 0.85, 0.75),
    thigh: limb(0.15, 0.112, 0.8),
    shin: limb(0.1, 0.078, 0.74),
    upper: limb(0.085, 0.07, 0.48),
    sleeve: limb(0.105, 0.095, 0.26),
    fore: limb(0.068, 0.052, 0.44),
    hand: new THREE.SphereGeometry(0.062, 10, 8).scale(0.95, 1.5, 0.62).translate(0, -0.08, 0),
    thumb: new THREE.CapsuleGeometry(0.022, 0.06, 2, 6).rotateZ(0.5).translate(0.045, -0.05, 0.02),
    shoe: new THREE.CapsuleGeometry(0.1, 0.22, 4, 10).rotateX(Math.PI / 2).scale(1.05, 0.75, 1).translate(0, -0.03, 0.07),
    sole: new THREE.CapsuleGeometry(0.105, 0.22, 2, 10).rotateX(Math.PI / 2).scale(1.05, 0.25, 1).translate(0, -0.085, 0.07),
    neck: limb(0.088, 0.098, 0.2),
    head: new THREE.SphereGeometry(0.235, 28, 22).scale(0.9, 1.06, 0.98),
    jaw: new THREE.SphereGeometry(0.175, 20, 14).scale(female ? 0.92 : 1.0, 0.86, 0.95),
    eyeWhite: new THREE.SphereGeometry(0.04, 14, 10).scale(1.3, 0.75, 0.45),
    iris: new THREE.SphereGeometry(0.024, 12, 8).scale(1, 1, 0.5),
    shine: new THREE.SphereGeometry(0.007, 6, 4),
    lid: new THREE.SphereGeometry(0.045, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(1.3, 0.8, 0.55),
    brow: new THREE.CapsuleGeometry(0.011, 0.07, 2, 6).rotateZ(Math.PI / 2),
    nose: new THREE.SphereGeometry(0.036, 12, 8).scale(1.25, 0.85, 0.9),
    noseBridge: new THREE.CapsuleGeometry(0.018, 0.06, 2, 6),
    lipUp: new THREE.CapsuleGeometry(0.017, 0.07, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.9, 0.7),
    lipLow: new THREE.CapsuleGeometry(0.02, 0.06, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.9, 0.7),
    ear: new THREE.SphereGeometry(0.048, 10, 8).scale(0.45, 1, 0.75),
    // hair, made to sit on this head shape
    fade: new THREE.SphereGeometry(0.242, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.92, 1.08, 1.0),
    cap: new THREE.SphereGeometry(0.252, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.93, 1.1, 1.02),
    back: new THREE.SphereGeometry(0.248, 20, 12, Math.PI * 1.1, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.42).scale(0.93, 1.08, 1.01),
    afro: new THREE.IcosahedronGeometry(0.31, 3),
    bun: new THREE.SphereGeometry(0.11, 14, 10),
    braid: limb(0.026, 0.02, 0.62, 6),
    dread: limb(0.036, 0.03, 0.4, 6),
    bag: new THREE.CapsuleGeometry(0.16, 0.3, 4, 10).scale(1.25, 1, 0.55),
    strap: new THREE.BoxGeometry(0.075, 0.46, 0.03),
    strapTop: new THREE.BoxGeometry(0.075, 0.03, 0.5),
    shadow: new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2),
  };
  // ruffle the afro so it looks like hair, not a ball
  const pos = g.afro.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const n = 1 + 0.06 * Math.sin(v.x * 40) * Math.sin(v.y * 37) * Math.sin(v.z * 43);
    pos.setXYZ(i, v.x * n, v.y * n, v.z * n);
  }
  g.afro.computeVertexNormals();
  g.sh = sh;
  geoCache.set(key, g);
  return g;
}

const geo = { shadow: new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2) };

let shadowMat;
export function blobShadow() {
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


/**
 * makePerson(look) -> THREE.Group with .walk(dt, speed) to animate.
 * look = indexes into LOOK, as the server stores it.
 */
function shade(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k).getStyle();
}

export function makeSimplePerson(look = {}, { bag = false, scale = 1.05 } = {}) {
  const skinHex = LOOK.skin[look.skin ?? 0];
  const skin = mat(skinHex, { roughness: 0.62 });
  const topHex = LOOK.top[look.top ?? 0];
  const top = mat(topHex, { roughness: 0.9 });
  const bottom = mat(LOOK.bottom[look.bottom ?? 0], { roughness: 0.92 });
  const hairMat = mat("#141010", { roughness: 1 });
  const hair = LOOK.hair[look.hair ?? 0];
  const skirt = LOOK.style[look.style ?? 0] === "skirt";
  const female = (look.hall ?? 0) === 1 || skirt || ["braids", "bun"].includes(hair);
  const G = shapes(female);
  const shoeMat = mat(["#f2f2ee", "#1c1c1c", "#6b4a2a", "#2f5f9e"][((look.top ?? 0) + (look.bottom ?? 0)) % 4], { roughness: 0.7 });
  const soleMat = mat("#ece9e2", { roughness: 0.8 });

  const root = new THREE.Group();
  const body = new THREE.Group(); // origin at the hips
  body.position.y = HIP;
  root.add(body);

  // legs: thigh + shin (trousers, or bare legs under a skirt), knees that bend, shoes
  const legs = [];
  const knees = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * (female ? 0.15 : 0.16), -0.08, 0);
    const thigh = new THREE.Mesh(G.thigh, skirt ? skin : bottom);
    const knee = new THREE.Group();
    knee.position.y = -0.8;
    const shin = new THREE.Mesh(G.shin, skirt ? skin : bottom);
    const foot = new THREE.Group();
    foot.position.y = -0.74;
    foot.add(new THREE.Mesh(G.shoe, shoeMat), new THREE.Mesh(G.sole, soleMat));
    knee.add(shin, foot);
    hip.add(thigh, knee);
    body.add(hip);
    legs.push(hip);
    knees.push(knee);
  }
  body.add(new THREE.Mesh(G.pelvis, skirt ? bottom : bottom));
  if (skirt) body.add(new THREE.Mesh(G.skirt, bottom));
  const torso = new THREE.Mesh(G.torso, top);
  torso.position.y = 0.0;
  body.add(torso);
  const neck = new THREE.Mesh(G.neck, skin);
  neck.position.y = 1.3;
  body.add(neck);

  // arms: a short sleeve, bare upper arm and forearm, a hand with a thumb; elbows bend
  const arms = [];
  const elbows = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * G.sh, 0.95, 0);
    shoulder.rotation.z = side * 0.07;
    const elbow = new THREE.Group();
    elbow.position.y = -0.48;
    const hand = new THREE.Group();
    hand.position.y = -0.44;
    const thumb = new THREE.Mesh(G.thumb, skin);
    thumb.scale.x = side;
    hand.add(new THREE.Mesh(G.hand, skin), thumb);
    elbow.add(new THREE.Mesh(G.fore, skin), hand);
    shoulder.add(new THREE.Mesh(G.sleeve, top), new THREE.Mesh(G.upper, skin), elbow);
    body.add(shoulder);
    arms.push(shoulder);
    elbows.push(elbow);
  }

  // the head: skull and jaw, ears, eyes with lids and a glint, brows, a nose and two lips
  const head = new THREE.Group();
  head.position.y = 1.43;
  head.add(new THREE.Mesh(G.head, skin));
  const jaw = new THREE.Mesh(G.jaw, skin);
  jaw.position.set(0, -0.09, 0.035);
  head.add(jaw);
  const white = mat("#f4efe6", { roughness: 0.4 });
  const irisMat = mat("#24140c", { roughness: 0.3 });
  const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const lidMat = mat(shade(skinHex, 0.88), { roughness: 0.6 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.078, 0.02, 0.197);
    eye.rotation.y = side * 0.25;
    const iris = new THREE.Mesh(G.iris, irisMat);
    iris.position.z = 0.014;
    const glint = new THREE.Mesh(G.shine, shine);
    glint.position.set(0.008, 0.009, 0.026);
    const lid = new THREE.Mesh(G.lid, lidMat);
    lid.position.set(0, 0.006, 0.002);
    eye.add(new THREE.Mesh(G.eyeWhite, white), iris, glint, lid);
    const brow = new THREE.Mesh(G.brow, hairMat);
    brow.position.set(side * 0.08, 0.075, 0.205);
    brow.rotation.set(0, side * 0.25, side * -0.1);
    const ear = new THREE.Mesh(G.ear, skin);
    ear.position.set(side * 0.208, -0.005, -0.01);
    head.add(eye, brow, ear);
  }
  const bridge = new THREE.Mesh(G.noseBridge, skin);
  bridge.position.set(0, 0.0, 0.215);
  bridge.rotation.x = -0.25;
  const nose = new THREE.Mesh(G.nose, mat(shade(skinHex, 0.93), { roughness: 0.6 }));
  nose.position.set(0, -0.045, 0.222);
  const lipUp = new THREE.Mesh(G.lipUp, mat(shade(skinHex, 0.62), { roughness: 0.5 }));
  lipUp.position.set(0, -0.112, 0.2);
  const lipLow = new THREE.Mesh(G.lipLow, mat(shade(skinHex, 0.75), { roughness: 0.45 }));
  lipLow.position.set(0, -0.137, 0.195);
  head.add(bridge, nose, lipUp, lipLow);

  if (hair === "low_cut") {
    const cap = new THREE.Mesh(G.fade, hairMat);
    cap.position.set(0, 0.035, -0.01);
    cap.rotation.x = -0.5; // hairline high on the forehead, lower at the back
    head.add(cap);
  } else if (hair !== "bald") {
    const cap = new THREE.Mesh(G.cap, hairMat);
    cap.position.set(0, 0.04, -0.012);
    cap.rotation.x = -0.45;
    head.add(cap);
    const back = new THREE.Mesh(G.back, hairMat);
    back.position.set(0, 0.0, -0.01);
    head.add(back);
  }
  if (hair === "afro") {
    const afro = new THREE.Mesh(G.afro, hairMat);
    afro.position.set(0, 0.1, -0.05);
    afro.scale.set(1.0, 0.9, 0.98);
    head.add(afro);
  } else if (hair === "bun") {
    const bun = new THREE.Mesh(G.bun, hairMat);
    bun.position.set(0, 0.2, -0.17);
    head.add(bun);
  } else if (hair === "braids" || hair === "dreads") {
    const g = hair === "braids" ? G.braid : G.dread;
    const n = hair === "braids" ? 22 : 16;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.02 + (0.96 * i) / (n - 1)) + Math.PI / 2;
      const strand = new THREE.Mesh(g, hairMat);
      strand.position.set(Math.cos(a) * 0.2, 0.05, -Math.abs(Math.sin(a)) * 0.19 - 0.01);
      strand.rotation.x = 0.16 + (i % 3) * 0.04;
      strand.rotation.z = Math.cos(a) * 0.22;
      head.add(strand);
    }
  }
  body.add(head);

  if (bag) {
    const color = ["#2f3b52", "#6b2e2e", "#3d5a3a", "#222222"][(look.top ?? 0) % 4];
    const pack = new THREE.Mesh(G.bag, mat(color, { roughness: 0.85 }));
    pack.position.set(0, 0.66, -0.3);
    body.add(pack);
    const strapMat = mat(shade(color, 0.7), { roughness: 0.8 });
    for (const side of [-1, 1]) {
      // down the front of the chest, then back over the shoulder to the bag
      const front = new THREE.Mesh(G.strap, strapMat);
      front.position.set(side * 0.2, 0.8, female ? 0.21 : 0.225);
      front.rotation.x = -0.12;
      const over = new THREE.Mesh(G.strapTop, strapMat);
      over.position.set(side * 0.2, 1.035, -0.02);
      body.add(front, over);
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
    const amp = running ? 0.85 : Math.min(0.55, 0.22 + speed * 0.055);
    const swing = moving ? Math.sin(phase) * amp : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    // the back leg's knee bends as it swings forward
    knees[0].rotation.x = moving ? Math.max(0, -Math.sin(phase)) * amp * 1.4 : 0;
    knees[1].rotation.x = moving ? Math.max(0, Math.sin(phase)) * amp * 1.4 : 0;
    arms[0].rotation.x = -swing * (running ? 1.1 : 0.7);
    arms[1].rotation.x = swing * (running ? 1.1 : 0.7);
    elbows[0].rotation.x = elbows[1].rotation.x = moving ? -(running ? 1.3 : 0.3) : -0.1;
    body.rotation.x = running ? 0.15 : moving ? 0.04 : 0;
    body.rotation.y = moving ? Math.sin(phase) * 0.06 : 0; // hips and shoulders counter-swing
    const t = performance.now() / 1000;
    head.rotation.y = moving ? -body.rotation.y : Math.sin(t * 0.5 + phase) * 0.3; // idle: look around
    torso.scale.y = moving ? 1 : 1 + Math.sin(t * 1.8 + phase) * 0.006; // breathing
    body.position.y = HIP + (moving ? Math.abs(Math.cos(phase)) * (running ? 0.09 : 0.045) : 0);
  };
  root.userData.parts = { body, head, arms, legs, knees, elbows };
  root.userData.hip = HIP;
  return root;
}
