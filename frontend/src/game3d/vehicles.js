// Campus transport, low-poly. Every vehicle faces +Z and sits on the ground at y = 0.
import * as THREE from "three";
import { mat } from "./characters";
import { signTexture } from "./textures";

const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10).rotateZ(Math.PI / 2);
const glass = () => mat("#22343c", { emissive: "#0b1418" });

function wheels(group, positions, size = 1) {
  for (const [x, z] of positions) {
    const w = new THREE.Mesh(wheelGeo, mat("#1c1c1c"));
    w.scale.setScalar(size);
    w.position.set(x, 0.55 * size, z);
    group.add(w);
  }
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function lights(group, y, z, width, { tail = true } = {}) {
  const head = mat("#fff6d0", { emissive: "#fff2b0", emissiveIntensity: 0.2 });
  for (const s of [-1, 1]) {
    group.add(box(0.5, 0.3, 0.1, head, s * (width / 2 - 0.4), y, z));
    if (tail) group.add(box(0.4, 0.3, 0.1, mat("#c0281e", { emissive: "#600" }), s * (width / 2 - 0.4), y, -z));
  }
  group.userData.headlights = head;
}

/** The CNG campus shuttle: white with a green band and a "CAMPUS SHUTTLE" board. */
export function makeBus() {
  const g = new THREE.Group();
  const L = 11;
  const W = 3.4;
  g.add(box(W, 2.6, L, mat("#f2f0ea"), 0, 1.75, 0));
  g.add(box(W + 0.02, 0.5, L + 0.02, mat("#1f6f4a"), 0, 1.0, 0));
  g.add(box(W + 0.04, 1.0, L - 1.6, glass(), 0, 2.35, -0.4));
  g.add(box(W - 0.4, 1.1, 0.06, glass(), 0, 2.35, L / 2 + 0.01));
  g.add(box(W - 0.2, 0.3, L - 0.2, mat("#d9d6cd"), 0, 3.15, 0));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.45), new THREE.MeshBasicMaterial({
    map: signTexture("CAMPUS SHUTTLE", { bg: "#111", fg: "#ffcc33", border: "#111" }) }));
  sign.position.set(0, 2.98, L / 2 + 0.04);
  g.add(sign);
  // door
  g.add(box(0.05, 2.0, 1.4, mat("#3a4a50"), W / 2 + 0.01, 1.55, 3.2));
  wheels(g, [[-1.5, 3.6], [1.5, 3.6], [-1.5, -3.4], [1.5, -3.4]], 1.05);
  lights(g, 1.0, L / 2 + 0.02, W);
  g.userData.length = L;
  return g;
}

/** Keke (tricycle): OAU campus kekes are green, with a black canopy. */
export function makeKeke(color = "#1e8f4e") {
  const g = new THREE.Group();
  const body = mat(color);
  g.add(box(1.7, 0.8, 3.0, body, 0, 0.9, -0.2));
  g.add(box(1.2, 0.9, 0.9, body, 0, 1.0, 1.35));
  g.add(box(1.0, 0.7, 0.05, glass(), 0, 1.75, 1.78));
  // canopy
  g.add(box(1.9, 0.12, 3.2, mat("#1d1d1d"), 0, 2.6, -0.1));
  for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.6], [0.9, -1.6]]) {
    g.add(box(0.08, 1.4, 0.08, mat("#1d1d1d"), x, 1.9, z));
  }
  g.add(box(1.6, 0.5, 0.9, mat("#3b2b22"), 0, 1.45, -0.8)); // back seat
  wheels(g, [[0, 1.6], [-0.95, -1.2], [0.95, -1.2]], 0.62);
  lights(g, 1.05, 1.82, 1.2, { tail: false });
  g.userData.length = 3.6;
  return g;
}

/** A drop cab: a small saloon with a TAXI board. */
export function makeCab(color = "#f0b72f", { taxi = true } = {}) {
  const g = new THREE.Group();
  g.add(box(2.2, 0.9, 4.8, mat(color), 0, 0.95, 0));
  g.add(box(2.0, 0.8, 2.6, mat(color), 0, 1.8, -0.3));
  g.add(box(2.04, 0.6, 2.4, glass(), 0, 1.85, -0.3));
  g.add(box(2.24, 0.12, 4.82, mat("#222"), 0, 0.85, 0));
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4), new THREE.MeshBasicMaterial({
    map: signTexture("TAXI", { bg: "#111", fg: "#ffd13b", border: "#111", width: 256 }) }));
  sign.position.set(0, 2.36, -0.3);
  if (taxi) g.add(sign);
  wheels(g, [[-1.0, 1.5], [1.0, 1.5], [-1.0, -1.5], [1.0, -1.5]], 0.75);
  lights(g, 1.0, 2.41, 2.2);
  g.userData.length = 4.8;
  return g;
}

/** Town bus ("korope"): a yellow minibus with black stripes, plying Asherifa to the gate. */
export function makeTownBus() {
  const g = new THREE.Group();
  const L = 6.4;
  g.add(box(2.5, 2.2, L, mat("#efb926"), 0, 1.55, 0));
  for (const y of [0.9, 1.25]) g.add(box(2.52, 0.12, L + 0.02, mat("#111"), 0, y, 0));
  g.add(box(2.54, 0.8, L - 1.4, glass(), 0, 2.15, -0.3));
  g.add(box(2.1, 0.8, 0.05, glass(), 0, 2.15, L / 2 + 0.01));
  wheels(g, [[-1.1, 2.0], [1.1, 2.0], [-1.1, -2.0], [1.1, -2.0]], 0.8);
  lights(g, 1.0, L / 2 + 0.02, 2.5);
  g.userData.length = L;
  return g;
}

/** A bicycle with you on it is drawn by the engine; this is just the bike. */
export function makeBike() {
  const g = new THREE.Group();
  const wheel = new THREE.TorusGeometry(0.75, 0.08, 6, 16).rotateY(Math.PI / 2);
  for (const z of [-1, 1]) {
    const w = new THREE.Mesh(wheel, mat("#1c1c1c"));
    w.position.set(0, 0.8, z * 1.0);
    g.add(w);
  }
  g.add(box(0.12, 0.12, 2.0, mat("#b03a2e"), 0, 1.3, 0));
  g.add(box(0.12, 0.9, 0.12, mat("#b03a2e"), 0, 1.15, -0.5));
  g.add(box(0.5, 0.12, 0.3, mat("#222"), 0, 1.7, -0.5));
  g.add(box(0.9, 0.08, 0.08, mat("#888"), 0, 1.9, 0.9));
  // the rider
  const rider = box(0.8, 1.1, 0.5, mat("#1f6f4a"), 0, 2.3, -0.3);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), mat("#8d5524"));
  head.position.set(0, 3.1, -0.2);
  g.add(rider, head);
  g.userData.length = 2.2;
  return g;
}

export function makeVehicle(mode) {
  if (mode === "bike") return makeBike();
  if (mode === "car") return makeCab("#9aa7b0", { taxi: false });
  if (mode === "bus") return makeBus();
  if (mode === "keke") return makeKeke();
  if (mode === "cab") return makeCab();
  if (mode === "town_bus") return makeTownBus();
  return null;
}
