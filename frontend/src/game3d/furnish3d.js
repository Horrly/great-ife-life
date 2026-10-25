// What you've bought in the 🛋 Furnish tab, drawn in your room. Everything is made of simple boxes and
// cylinders (like the rest of the room) so it stays light on old phones.
import * as THREE from "three";
import { mat } from "./characters";

const glow = (color, k = 0.9) => mat(color, { emissive: color, emissiveIntensity: k });

/**
 * Where each kind of thing goes in each kind of home: [x, z, rotY].
 * Rooms: hostel 11.5×13, single 12×10, self_con 15×11, flat 18×13 (centred on 0,0; back wall at -d/2).
 */
const SPOTS = {
  hostel: { lamp: [0.9, -5.2], fan: [-1.9, -3.4], sound: [-1.0, -5.3], decor: [0, 0], lock: [4.0, 2.9], camera: [-5.4, -6.1] },
  single: {
    tv: [5.5, -1.3, -Math.PI / 2], sofa: [2.5, -1.3, Math.PI / 2], fan: [4.6, 1.6], ac: [-3.4, -4.85],
    power: [-4.9, 4.2], lamp: [4.2, -3.6], cold: [-1.0, -4.3], small: [-2.6, 4.4], cooker: [-0.2, 3.6],
    water: [5.2, 2.4], vanity: [5.8, 3.4, -Math.PI / 2], laundry: [3.4, 4.3], desk: [3.2, -3.6],
    plants: [5.3, 4.4], rug: [2.6, -1.3, 4.4, 3.6], camera: [-5.6, -4.6], lockDoor: [-5.85, 2.8],
  },
  self_con: {
    tv: [-0.4, -4.7, 0], sofa: [2.4, 2.4, Math.PI], fan: [-1.2, 2.8], ac: [-4.4, -5.35], power: [-6.6, 4.6],
    lamp: [-1.6, -4.7], cold: [6.8, 0.6], cold2: [6.6, 2.6], small: [3.0, -4.4, 2.32], cooker: [6.4, -2.5, -Math.PI / 2],
    water: [6.6, 4.5], vanity: [7.3, -4.2, -Math.PI / 2], laundry: [4.8, 4.6], desk: [-3.8, 4.3, Math.PI],
    shelf: [-6.9, 1.8, Math.PI / 2], plants: [-2.9, -4.9], rug: [1.4, 0.6, 5.4, 3.8], camera: [-7.1, -5.1], lockDoor: [-7.35, 3.4],
  },
  flat: {
    tv: [2.4, -5.3, 0], sofa: [-2.4, 2.6, Math.PI], sofa2: [-6.6, -1.0, Math.PI / 2], fan: [-7.6, -4.6], ac: [-4.6, -6.1],
    power: [-7.8, 5.8], lamp: [-2.4, 0], cold: [-2.6, -5.8], cold2: [-0.9, -5.7], small: [8.2, -1.4, 2.32], cooker: [8.2, -3.6, -Math.PI / 2],
    water: [8.2, 5.6], vanity: [8.85, -5.2, -Math.PI / 2], laundry: [6.2, 5.6], desk: [-8.0, 2.0, Math.PI / 2],
    shelf: [8.5, 3.8, -Math.PI / 2], plants: [-8.3, -5.8], rug: [-2.6, 0.2, 7.4, 5], camera: [-8.7, -6.2], lockDoor: [-8.85, 4.2],
  },
};

/** The bed: from thin floor foam to a king-size bed with LED strips. Returns the height you sit at. */
export function drawBed(v, furn, x, z, w, sheet) {
  const bed = furn.bed;
  const linen = furn.linen;
  const sheetColor = linen === "duvet" ? "#fbfaf6" : linen === "bedding" ? "#dfe8f3" : sheet;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  let top;
  if (!bed || bed === "foam_pad" || bed === "foam6" || bed === "ortho") {
    // a mattress on the floor: thin, 6-inch, or an orthopaedic one
    const h = bed === "ortho" ? 0.95 : bed === "foam6" ? 0.7 : bed === "foam_pad" ? 0.45 : 0.32;
    v.box(w, h, 5.2, bed === "ortho" ? "#f4f1ea" : "#e9e1cf", 0, 0, 0, g);
    if (bed === "ortho") v.box(w + 0.04, 0.08, 5.24, "#c9d6e2", 0, h * 0.5, 0, g); // the quilted band
    top = h;
  } else {
    const king = bed === "kingbed" || bed === "smartbed";
    const W = king ? w + 1.2 : w;
    const wood = bed === "smartbed" ? "#3b3f46" : king ? "#6d5a7a" : "#7a5230";
    v.box(W + 0.3, 0.9, 5.8, wood, 0, 0, 0, g);
    // headboard: plain wood, or tall and padded for a king
    v.box(W + 0.5, king ? 3.6 : 2.4, 0.35, wood, 0, 0, -2.9, g);
    if (king) for (let i = 0; i < 4; i++) v.box((W + 0.2) / 4 - 0.12, 2.4, 0.12, bed === "smartbed" ? "#575d66" : "#8a7698",
      -W / 2 + (i + 0.5) * ((W + 0.2) / 4) - 0.1, 1.0, -2.68, g);
    v.box(W, 0.6, 5.3, "#f2ede2", 0, 0.9, 0.1, g);
    if (bed === "smartbed") v.box(W + 0.2, 0.06, 5.6, glow("#7ad3ff", 1.4), 0, 0.12, 0, g); // lights under the frame
    top = 1.5;
    w = W;
  }
  v.box(w + 0.04, linen === "duvet" ? 0.3 : 0.1, 3.8, sheetColor, 0, top, 0.7, g);
  const pillows = linen === "duvet" ? 4 : w > 3.4 ? 2 : 1;
  for (let i = 0; i < pillows; i++) {
    const px = pillows === 1 ? -w * 0.2 : -w / 2 + (i + 0.5) * (w / pillows);
    v.box(Math.min(1.4, w / pillows - 0.15), 0.34, 0.8, i % 2 && linen === "duvet" ? "#e9dcc4" : "#f6f3ec", px, top, -2.0, g);
  }
  if (furn.net) {
    const net = mat("#ffffff", { transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    v.box(w + 0.6, 4.4, 5.8, net, 0, 0.1, 0, g);
  }
  v.group.add(g);
  return top;
}

/** The TV, PlayStation, decoder and sound system on one stand. */
function drawTvSet(v, furn, [x, z, rot = 0]) {
  const size = { tv32: 2.2, tv43: 2.9, tv55: 3.7, tv75: 4.7 }[furn.tv] || 0;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const standW = Math.max(3.2, size + 1.2);
  if (furn.tv || furn.console || furn.decoder) v.box(standW, 1.3, 1.1, "#3a2a1e", 0, 0, 0, g);
  if (size) {
    const h = size * 0.58;
    v.box(size + 0.12, h + 0.12, 0.12, "#0d0f12", 0, 1.55, -0.2, g);
    v.box(size, h, 0.02, mat("#1b2a38", { emissive: "#3c84bd", emissiveIntensity: 0.5 }), 0, 1.61, -0.13, g);
    v.box(0.5, 0.25, 0.4, "#0d0f12", 0, 1.3, -0.2, g);
  }
  if (furn.console) {
    const pro = furn.console === "ps5pro";
    if (furn.console === "ps4") v.box(1.0, 0.18, 0.8, "#16181c", standW / 2 - 0.8, 1.3, 0, g);
    else {
      v.box(0.28, 1.1, 0.85, "#f4f5f7", standW / 2 - 0.6, 1.3, 0, g);
      v.box(0.1, 1.0, 0.86, "#16181c", standW / 2 - 0.6, 1.35, 0, g);
    }
    v.box(0.55, 0.12, 0.35, "#f4f5f7", -standW / 2 + 0.7, 1.3, 0.25, g); // a pad
    if (pro) v.box(0.7, 0.35, 0.45, "#f4f5f7", -standW / 2 + 1.5, 1.3, 0.15, g); // the VR headset
  }
  if (furn.decoder) {
    v.box(0.9, 0.2, 0.6, "#1d1d1f", -standW / 2 + 0.7, 1.3, -0.1, g);
    v.box(0.06, 0.06, 0.02, glow("#36d26b"), -standW / 2 + 1.0, 1.4, 0.21, g);
  }
  if (furn.sound === "speaker") v.cyl(0.32, 0.32, 0.8, "#222", standW / 2 + 0.7, 0, 0.3, 14, g);
  if (furn.sound === "theatre") {
    for (const dx of [-standW / 2 - 0.6, standW / 2 + 0.6]) v.box(0.6, 3.2, 0.6, "#1e1e1e", dx, 0, 0, g);
    v.box(1.0, 1.0, 1.0, "#1e1e1e", standW / 2 + 0.6, 0, 1.1, g);
  }
  if (furn.sound === "soundbar") {
    v.box(Math.max(2.4, size * 0.85), 0.22, 0.3, "#1a1a1a", 0, 1.3, 0.35, g);
    v.box(1.0, 1.3, 1.0, "#1a1a1a", standW / 2 + 0.7, 0, 0.2, g);
  }
  v.group.add(g);
}

function drawSofa(v, id, [x, z, rot = 0], side) {
  const color = { sofa3: "#3d5a80", sofaL: "#5b5f66", leather: "#efe3c8" }[id];
  v._sofa(x, z, id === "sofa3" ? 4 : 5.2, color, rot);
  if (id !== "sofa3" && side) v._sofa(side[0], side[1], 2.6, color, side[2]);
  if (id === "leather") {
    // glass centre table
    const glass = mat("#bfe3ee", { transparent: true, opacity: 0.45, roughness: 0.1 });
    const dz = Math.cos(rot) > 0 ? 2.6 : -2.6;
    const dx = Math.sin(rot) > 0.5 ? 2.6 : Math.sin(rot) < -0.5 ? -2.6 : 0;
    v.box(3, 0.1, 1.6, glass, x + dx, 1.2, z + dz);
    v.box(2.6, 1.2, 0.1, "#c9a24a", x + dx, 0, z + dz);
  }
}

/** White plastic chairs where a sofa would be: what every bare Nigerian parlour has. */
export function plasticChairs(v, spots) {
  for (const [x, z] of spots) v._chair(x, z, "#f4f4f2", 0);
}

function drawFan(v, id, spot, acSpot) {
  if (id === "rfan") {
    const [x, z] = spot;
    v.cyl(0.4, 0.45, 0.15, "#e9e9e6", x, 0, z, 14);
    v.cyl(0.06, 0.06, 1.3, "#cfcfcf", x, 0.15, z, 8);
    const head = v.cyl(0.42, 0.42, 0.3, "#9fd3f0", x, 1.5, z, 14);
    head.rotation.x = Math.PI / 2;
  } else if (id === "standfan") v._fan(spot[0], spot[1]);
  else if (acSpot) {
    const [x, z] = acSpot;
    const slim = id === "ac15";
    v.box(slim ? 3.0 : 2.6, slim ? 0.8 : 1.0, 0.7, "#f6f6f4", x, 4.4, z + 0.4);
    v.box(slim ? 2.6 : 2.2, 0.06, 0.05, "#c9cfd3", x, 4.5, z + 0.76);
    v.box(0.08, 0.08, 0.02, glow("#4be38a"), x + (slim ? 1.2 : 1.0), 4.9, z + 0.77);
  }
}

function drawPower(v, id, [x, z]) {
  if (id === "gen_small" || id === "gen_big") {
    const big = id === "gen_big";
    const [w, h, d] = big ? [1.8, 1.3, 1.2] : [1.2, 0.95, 0.85];
    v.box(w, h, d, big ? "#e1b12c" : "#d0482f", x, 0.1, z);
    for (const dx of [-w / 2, w / 2]) v.box(0.06, h + 0.2, 0.06, "#222", x + dx, 0, z + d / 2);
    v.box(w * 0.5, 0.25, d * 0.6, "#2b2b2b", x, h + 0.1, z);
  } else {
    // inverter on the wall and batteries on the floor (more for solar)
    v.box(1.0, 1.4, 0.4, "#e8eaec", x, 2.2, z);
    v.box(0.1, 0.1, 0.02, glow("#36d26b"), x + 0.3, 3.2, z + 0.21);
    const n = id === "solar" ? 4 : 2;
    for (let i = 0; i < n; i++) v.box(0.55, 0.9, 0.9, "#26323a", x - 0.6 + i * 0.62, 0, z + 0.9);
    if (id === "solar") v.label("☀️ Solar", x, 4.0, z + 0.4, 0.55);
  }
}

function drawKitchen(v, furn, s) {
  if (furn.cooker === "cooker4" && s.cooker) {
    const [x, z, rot = 0] = s.cooker;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    v.box(2.0, 2.2, 1.5, "#c9cdd1", 0, 0, 0, g);
    v.box(1.9, 0.08, 1.4, "#1e1e1e", 0, 2.2, 0, g);
    v.box(1.5, 1.1, 0.04, "#2a2d31", 0, 0.5, 0.76, g); // oven door
    for (const [dx, dz] of [[-0.45, -0.35], [0.45, -0.35], [-0.45, 0.35], [0.45, 0.35]]) v.cyl(0.25, 0.25, 0.05, "#3a3a3a", dx, 2.28, dz, 12, g);
    v.group.add(g);
  }
  if (furn.cold && s.cold) {
    const [x, z] = s.cold;
    v.box(1.5, 4.2, 1.4, "#e9ecef", x, 0, z);
    v.box(1.52, 0.04, 1.42, "#b9c0c6", x, 2.8, z);
    v.box(0.08, 1.2, 0.08, "#9aa3aa", x + 0.55, 1.4, z + 0.72);
    if (furn.cold === "freezer" && s.cold2) v.box(2.0, 1.8, 1.3, "#f4f5f6", s.cold2[0], 0, s.cold2[1]);
  }
  const small = [furn.microwave && "microwave", furn.blender && "blender", furn.airfryer && "airfryer"].filter(Boolean);
  if (small.length && s.small) {
    const [x, z, y0] = s.small;
    let y = y0;
    if (y === undefined) {
      // no counter here: a small kitchen table
      v._table(x, z, 2.6, 1.2, "#8a5a33");
      y = 2.14;
    }
    small.forEach((k, i) => {
      const px = x - 0.8 + i * 0.85;
      if (k === "microwave") v.box(0.9, 0.55, 0.6, "#2b2e33", px, y, z);
      if (k === "blender") v.cyl(0.18, 0.22, 0.75, mat("#cfe8f0", { transparent: true, opacity: 0.7 }), px, y, z, 12);
      if (k === "airfryer") v.box(0.6, 0.65, 0.6, "#151515", px, y, z);
    });
  }
}

function drawBath(v, furn, s) {
  if (furn.water === "drum" && s.water) v.cyl(0.75, 0.75, 2.2, "#2a6fd6", s.water[0], 0, s.water[1], 18);
  if (furn.water === "tank" && s.water) {
    v.box(0.9, 0.7, 0.7, "#2f6fb5", s.water[0], 0, s.water[1]); // the pumping machine
    v.cyl(0.05, 0.05, 4.5, "#e0e0e0", s.water[0] + 0.3, 0.7, s.water[1], 6);
  }
  if (furn.vanity && s.vanity) {
    const [x, z, rot] = s.vanity;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    v.box(1.6, 2.0, 0.08, mat("#dfe9ef", { roughness: 0.05, metalness: 0.6 }), 0, 2.6, 0, g);
    v.box(1.8, 0.12, 0.5, "#7a5230", 0, 2.3, 0.25, g);
    ["#e07a5f", "#81b29a", "#f2cc8f"].forEach((c, i) => v.cyl(0.1, 0.1, 0.4, c, -0.5 + i * 0.5, 2.42, 0.25, 8, g));
    v.group.add(g);
  }
  if (furn.laundry && s.laundry) {
    const [x, z] = s.laundry;
    v.box(1.5, 2.0, 1.5, "#f6f7f8", x, 0, z);
    const door = v.cyl(0.5, 0.5, 0.06, "#3a4a5a", x, 1.0, z + 0.76, 18);
    door.rotation.x = Math.PI / 2;
  }
}

function drawStudy(v, furn, s) {
  if (furn.shelf && s.shelf) v._shelf(s.shelf[0], s.shelf[1], 2.6, s.shelf[2] || 0);
  const desk = furn.desk;
  if (desk && s.desk) {
    const [x, z, rot = 0] = s.desk;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const w = desk === "desk" ? 3 : 3.8;
    v.box(w, 0.14, 1.7, desk === "standing" ? "#ece6da" : "#6b4a2a", 0, desk === "standing" ? 2.5 : 2.0, 0, g);
    for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) v.box(0.14, desk === "standing" ? 2.5 : 2.0, 1.4, "#2b2b2b", dx, 0, 0, g);
    if (desk === "standing") {
      v.box(2.0, 1.2, 0.08, "#0d0f12", 0, 3.0, -0.55, g);
      v.box(1.9, 1.1, 0.02, mat("#1b2a38", { emissive: "#5aa0d8", emissiveIntensity: 0.5 }), 0, 3.05, -0.5, g);
    }
    // the chair: plastic, then a black office chair with a high back
    const cc = desk === "desk" ? "#2f5f9e" : "#1d1f22";
    v.box(1.2, 0.16, 1.2, cc, 0, 1.3, 1.4, g);
    v.box(1.2, desk === "desk" ? 1.5 : 1.9, 0.16, cc, 0, 1.4, 2.0, g);
    v.cyl(0.08, 0.08, 1.3, "#555", 0, 0, 1.4, 8, g);
    if (furn.net_box) v.box(0.6, 0.15, 0.4, "#f2f2f2", w / 2 - 0.5, 2.14, -0.4, g);
    if (furn.lamp) v.cyl(0.18, 0.25, 0.6, glow("#ffd27a", 0.8), -w / 2 + 0.5, 2.14, -0.4, 10, g);
    v.group.add(g);
    return true;
  }
  return false;
}

function drawLiving(v, furn, s, kind) {
  const w = v.size.w;
  const d = v.size.d;
  const h = v.size.h;
  if (furn.rug && s.rug) {
    const [x, z, rw, rd] = s.rug;
    v.box(rw, 0.06, rd, "#7b2d3b", x, 0, z);
    v.box(rw - 0.6, 0.08, rd - 0.6, "#c99a4a", x, 0, z);
    v.box(rw - 1.0, 0.1, rd - 1.0, "#8e3b46", x, 0, z);
  }
  if (furn.curtains) {
    const wx = kind === "hostel" ? 0 : w * 0.18;
    for (const dx of [-2.6, 2.6]) v.box(1.0, 3.6, 0.15, "#7d2e46", wx + dx, h * 0.42 - 0.9, -d / 2 + 0.4);
    v.box(6.4, 0.14, 0.14, "#c9a24a", wx, h * 0.42 + 2.75, -d / 2 + 0.4);
  }
  if (furn.decor) {
    v.box(w - 0.8, 0.08, 0.08, glow("#b06cff", 1.6), 0, h - 0.25, -d / 2 + 0.25);
    v._poster(-w * 0.32, 3.4, -d / 2 + 0.2, 1.4, 1.0, "#1d3557");
    v._poster(-w * 0.32 + 1.7, 3.6, -d / 2 + 0.2, 1.0, 1.4, "#e76f51");
    if (kind !== "hostel") v.box(1.8, 0.5, 0.06, glow("#ff4fa3", 1.4), w * 0.32, 4.6, -d / 2 + 0.22);
  }
  if (furn.plants && s.plants) {
    const [x, z] = s.plants;
    v.cyl(0.4, 0.3, 0.7, "#b5482a", x, 0, z, 12);
    for (let i = 0; i < 5; i++) {
      const leaf = v.box(0.18, 1.8 + (i % 3) * 0.4, 0.06, "#2f7a4f", x + (i - 2) * 0.12, 0.7, z);
      leaf.rotation.z = (i - 2) * 0.16;
    }
  }
}

function drawSecurity(v, furn, s) {
  if (furn.camera && s.camera) {
    const [x, z] = s.camera;
    v.box(0.3, 0.3, 0.3, "#f4f4f4", x, v.size.h - 0.8, z + 0.3);
    v.cyl(0.12, 0.12, 0.35, "#f4f4f4", x + 0.2, v.size.h - 0.85, z + 0.55, 10).rotation.x = Math.PI / 2;
    v.box(0.06, 0.06, 0.02, glow("#ff3b30", 1.5), x, v.size.h - 0.55, z + 0.46);
  }
  if (furn.door && s.lockDoor) {
    const [x, z] = s.lockDoor;
    const g = new THREE.Group();
    g.position.set(x + 0.15, 0, z);
    g.rotation.y = Math.PI / 2;
    v.box(2.3, 4.3, 0.12, "#59626b", 0, 0, 0, g);
    for (let i = 0; i < 4; i++) v.box(1.9, 0.06, 0.04, "#454c53", 0, 0.8 + i * 0.9, 0.08, g);
    v.group.add(g);
  }
  if (furn.lock && (s.lockDoor || s.lock)) {
    const [x, z] = s.lock || s.lockDoor;
    v.box(0.22, 0.3, 0.12, "#c9a24a", x + (s.lock ? -0.2 : 0.3), 2.0, z + (s.lock ? 0 : 0.8));
  }
}

/** Draw everything you own that fits this home. furn = { slot: itemId }. */
export function drawFurniture(v, kind, furn) {
  const s = SPOTS[kind] || {};
  v.thing("fun", () => {
    if (s.tv) drawTvSet(v, furn, s.tv);
    else if (furn.sound === "speaker" && s.sound) v.cyl(0.25, 0.25, 0.6, "#222", s.sound[0], 2.14, s.sound[1], 12);
    if (furn.sofa && s.sofa) drawSofa(v, furn.sofa, s.sofa, s.sofa2);
    drawLiving(v, furn, s, kind);
  });
  if (furn.fan && s.fan) v.thing("rest", () => drawFan(v, furn.fan, s.fan, s.ac));
  if (furn.power && s.power) v.thing("room", () => drawPower(v, furn.power, s.power));
  v.thing("food", () => drawKitchen(v, furn, s));
  v.thing("care", () => drawBath(v, furn, s));
  let desk = false;
  v.thing("study", () => {
    desk = drawStudy(v, furn, s);
    if (furn.lamp && s.lamp && !desk) v.cyl(0.18, 0.25, 0.6, glow("#ffd27a", 0.8), s.lamp[0], 2.14, s.lamp[1], 10);
  });
  drawSecurity(v, furn, s);
  return { desk, sofa: Boolean(furn.sofa && s.sofa), lamp: Boolean(furn.lamp) };
}
