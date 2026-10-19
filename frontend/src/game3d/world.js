// Builds the campus from the server's map (GET /api/world/): ground, roads, buildings, scenery.
// OAU's campus is known for its stepped "inverted pyramid" buildings, red earth and lots of trees.
import * as THREE from "three";
import { mat, surface } from "./characters";
import { facadeTextures, grassTexture, labelTexture, paveTexture, roadTexture, signTexture } from "./textures";

const ROAD_W = 8;

function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

function facadeMaterial(wall, w, h, floors) {
  const { map, emissive } = facadeTextures(wall, { floors, cols: 6 });
  const m = surface({ map: map.clone(), emissiveMap: emissive.clone(), emissive: "#000000", roughness: 0.93 });
  m.map.repeat.set(Math.max(1, Math.round(w / 14)), 1);
  m.emissiveMap.repeat.copy(m.map.repeat);
  m.map.needsUpdate = m.emissiveMap.needsUpdate = true;
  m.userData.night = true; // windows light up at night
  return m;
}

/** A block with windows on the sides and a plain roof. */
function block(w, h, d, wall, roof, floors) {
  const side = facadeMaterial(wall, w, h, floors);
  const sideD = facadeMaterial(wall, d, h, floors);
  const top = mat(roof);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideD, sideD, top, top, side, side]);
  m.position.y = h / 2;
  return m;
}

/** Where the door is: the point on the footprint nearest the road node, and which way it faces. */
function doorFor(b, node) {
  const hw = b.w / 2;
  const hd = b.d / 2;
  const cx = Math.max(b.x - hw, Math.min(b.x + hw, node[0]));
  const cz = Math.max(b.z - hd, Math.min(b.z + hd, node[1]));
  // pick the face we're on
  const dists = [
    [Math.abs(cx - (b.x - hw)), [-1, 0]],
    [Math.abs(cx - (b.x + hw)), [1, 0]],
    [Math.abs(cz - (b.z - hd)), [0, -1]],
    [Math.abs(cz - (b.z + hd)), [0, 1]],
  ].sort((a, c) => a[0] - c[0]);
  let normal = dists[0][1];
  // if the node is diagonal, prefer the face the node is most "in front of"
  const dx = (node[0] - b.x) / hw;
  const dz = (node[1] - b.z) / hd;
  normal = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const px = normal[0] ? b.x + normal[0] * hw : Math.max(b.x - hw + 4, Math.min(b.x + hw - 4, node[0]));
  const pz = normal[1] ? b.z + normal[1] * hd : Math.max(b.z - hd + 4, Math.min(b.z + hd - 4, node[1]));
  return { x: px, z: pz, normal, angle: Math.atan2(normal[0], normal[1]) };
}

function addSign(group, text, door, y, width = 14) {
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.16), new THREE.MeshLambertMaterial({ map: signTexture(text) }));
  sign.position.set(door.x + door.normal[0] * 0.3, y, door.z + door.normal[1] * 0.3);
  sign.rotation.y = door.angle;
  group.add(sign);
}

function entrance(group, door, wall) {
  // canopy and steps at the door
  const canopy = box(9, 0.5, 4, mat("#f4efe4"));
  canopy.position.set(door.x + door.normal[0] * 2, 4.2, door.z + door.normal[1] * 2);
  canopy.rotation.y = door.angle;
  group.add(canopy);
  for (const s of [-1, 1]) {
    const pillar = box(0.5, 4.2, 0.5, mat(wall));
    const off = new THREE.Vector3(s * 4, 0, 3.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), door.angle);
    pillar.position.set(door.x + off.x, 2.1, door.z + off.z);
    group.add(pillar);
  }
  const opening = box(4, 3.4, 0.4, mat("#2a2622"));
  opening.position.set(door.x, 1.7, door.z);
  opening.rotation.y = door.angle;
  group.add(opening);
}

/** Black plastic water tanks on a steel stand: on top of nearly every building in Ife. */
function roofTanks(g, b, top, n = 2) {
  for (let i = 0; i < n; i++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.4, 14), mat("#1b1b1b", { roughness: 0.6 }));
    const x = (i - (n - 1) / 2) * 4;
    tank.position.set(x, top + 2.4, b.d * 0.15);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 3), mat("#6b6f72", { metalness: 0.4, roughness: 0.6 }));
    stand.position.set(x, top + 0.6, b.d * 0.15);
    g.add(tank, stand);
  }
}

/** NEPA poles with sagging wires along the main roads. */
function powerLines(map) {
  const g = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.26, 10, 6).translate(0, 5, 0);
  const armGeo = new THREE.BoxGeometry(2.2, 0.18, 0.18);
  const poleMat = mat("#6b5134");
  const wireMat = new THREE.LineBasicMaterial({ color: "#1a1a1a" });
  for (const [a, b, kind] of map.edges) {
    if (kind === "town") continue;
    const A = map.nodes[a];
    const B = map.nodes[b];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const nx = (B[1] - A[1]) / len;
    const nz = -(B[0] - A[0]) / len;
    const pts = [];
    for (let t = 8; t < len - 4; t += 38) {
      const x = A[0] + ((B[0] - A[0]) * t) / len + nx * (ROAD_W / 2 + 4.2);
      const z = A[1] + ((B[1] - A[1]) * t) / len + nz * (ROAD_W / 2 + 4.2);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 0, z);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(x, 9.4, z);
      arm.rotation.y = Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2;
      g.add(pole, arm);
      pts.push([x, z]);
    }
    for (let i = 1; i < pts.length; i++) {
      for (const off of [-0.9, 0.9]) {
        const [x1, z1] = pts[i - 1];
        const [x2, z2] = pts[i];
        const line = [];
        for (let k = 0; k <= 8; k++) {
          const t = k / 8;
          const sag = Math.sin(Math.PI * t) * 1.1;
          line.push(new THREE.Vector3(x1 + (x2 - x1) * t + nx * off, 9.35 - sag, z1 + (z2 - z1) * t + nz * off));
        }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), wireMat));
      }
    }
  }
  return g;
}

// --- Building styles ------------------------------------------------------------------------------

function stepped(b, levels, floorsPer) {
  // OAU's signature: each storey sticks out further than the one below.
  const g = new THREE.Group();
  const lh = b.h / levels;
  for (let i = 0; i < levels; i++) {
    const grow = 1 + i * 0.07;
    const m = block(b.w * (0.86 * grow), lh, b.d * (0.86 * grow), b.wall, b.roof, floorsPer);
    m.position.y = lh * i + lh / 2;
    g.add(m);
    const lip = box(b.w * 0.86 * grow + 0.6, 0.5, b.d * 0.86 * grow + 0.6, mat("#bdb4a3"));
    lip.position.y = lh * (i + 1);
    g.add(lip);
  }
  g.position.set(b.x, 0, b.z);
  roofTanks(g, b, (b.h / levels) * levels);
  return g;
}

const STYLES = {
  hall(b) {
    const g = new THREE.Group();
    const main = block(b.w, b.h, b.d, b.wall, b.roof, 5);
    g.add(main);
    const roof = box(b.w + 1, 1, b.d + 1, mat(b.roof));
    roof.position.y = b.h + 0.5;
    g.add(roof);
    // water tanks on the roof (every hall has them)
    for (const z of [-b.d / 4, b.d / 4]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10), mat("#2b2b2b"));
      tank.position.set(0, b.h + 2.2, z);
      g.add(tank);
    }
    g.position.set(b.x, 0, b.z);
    return g;
  },
  tower(b) {
    const g = stepped({ ...b, w: b.w * 0.8, d: b.d * 0.8 }, 6, 3);
    const crown = box(b.w * 1.1, 3, b.d * 1.1, mat("#cfc8ba"));
    crown.position.y = b.h + 1.5;
    g.add(crown);
    return g;
  },
  faculty(b) {
    return stepped(b, 3, 2);
  },
  library(b) {
    const g = stepped(b, 3, 2);
    // vertical fins on the long sides
    for (let i = -4; i <= 4; i++) {
      for (const s of [-1, 1]) {
        const fin = box(0.6, b.h * 0.9, 1.6, mat("#b3ab9b"));
        fin.position.set((i * b.w) / 10, b.h * 0.47, s * (b.d * 0.5 + 0.5));
        g.add(fin);
      }
    }
    return g;
  },
  auditorium(b) {
    const g = new THREE.Group();
    const base = block(b.w, b.h * 0.6, b.d, b.wall, b.roof, 2);
    g.add(base);
    // big folded roof
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(b.d * 0.62, b.d * 0.62, b.w + 2, 4, 1, false, 0, Math.PI),
      mat(b.roof));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = 0;
    roof.scale.set(1, 1, 0.45);
    roof.position.y = b.h * 0.6;
    g.add(roof);
    for (let i = -3; i <= 3; i++) {
      const col = box(0.9, b.h * 0.6, 0.9, mat("#f1ece2"));
      col.position.set((i * b.w) / 8, b.h * 0.3, -b.d / 2 - 1.5);
      g.add(col);
    }
    g.position.set(b.x, 0, b.z);
    return g;
  },
  clinic(b) {
    const g = new THREE.Group();
    g.add(block(b.w, b.h, b.d, b.wall, b.roof, 2));
    const roof = box(b.w + 2, 0.6, b.d + 2, mat(b.roof));
    roof.position.y = b.h + 0.3;
    g.add(roof);
    const cross = new THREE.Group();
    cross.add(box(4, 1.2, 0.3, mat("#c0281e")), box(1.2, 4, 0.3, mat("#c0281e")));
    cross.position.set(0, b.h + 3, 0);
    g.add(cross);
    g.position.set(b.x, 0, b.z);
    return g;
  },
  sub(b) {
    const g = new THREE.Group();
    g.add(block(b.w, b.h, b.d, b.wall, b.roof, 2));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(b.w, b.d) * 0.56, 5, 4), mat(b.roof));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(b.w / Math.hypot(b.w, b.d) * 1.42, 1, b.d / Math.hypot(b.w, b.d) * 1.42);
    roof.position.y = b.h + 2.5;
    g.add(roof);
    // umbrellas and stalls outside
    for (let i = 0; i < 4; i++) {
      const umb = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 8), mat(["#d23c2a", "#2f6fae", "#f2c230", "#1f6f4a"][i]));
      umb.position.set(-b.w / 2 + 5 + i * 8, 3.3, -b.d / 2 - 6);
      const pole = box(0.15, 3, 0.15, mat("#ddd"));
      pole.position.set(umb.position.x, 1.5, umb.position.z);
      g.add(umb, pole);
    }
    g.position.set(b.x, 0, b.z);
    return g;
  },
  buka(b) {
    const g = new THREE.Group();
    const roof = box(b.w + 2, 0.3, b.d + 2, mat("#a8b0b4"));
    roof.position.y = b.h;
    roof.rotation.x = 0.06;
    g.add(roof);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const pole = box(0.35, b.h, 0.35, mat("#6b4a2a"));
      pole.position.set((x * b.w) / 2, b.h / 2, (z * b.d) / 2);
      g.add(pole);
    }
    for (let i = 0; i < 3; i++) {
      const table = box(4, 0.2, 1.6, mat("#8a5a2e"));
      table.position.set(-5 + i * 5, 1.4, 1.5);
      g.add(table);
      for (const s of [-1, 1]) {
        const bench = box(4, 0.15, 0.6, mat("#7a4a22"));
        bench.position.set(-5 + i * 5, 0.8, 1.5 + s * 1.3);
        g.add(bench);
      }
    }
    for (let i = 0; i < 3; i++) {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 1.2, 10), mat("#333"));
      pot.position.set(-4 + i * 3, 0.6, -3.5);
      g.add(pot);
    }
    const wall = box(b.w, 1.2, 0.3, mat(b.wall));
    wall.position.set(0, 0.6, -b.d / 2);
    g.add(wall);
    g.position.set(b.x, 0, b.z);
    return g;
  },
  amphitheatre(b) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(8 + i * 2.2, 8 + i * 2.2, 0.6 + i * 0.6, 24, 1, false, Math.PI * 0.5, Math.PI),
        mat(i % 2 ? "#cbbfa8" : "#bfb29a"));
      ring.position.y = (0.6 + i * 0.6) / 2;
      ring.renderOrder = -i;
      g.add(ring);
    }
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.8, 24), mat("#9a8c74"));
    stage.position.y = 0.4;
    g.add(stage);
    g.position.set(b.x, 0, b.z);
    g.rotation.y = Math.PI; // seats face the road
    return g;
  },
  sports(b) {
    const g = new THREE.Group();
    const track = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), mat("#b0503a"));
    track.scale.set(b.w / 2, 1, b.d / 2);
    track.position.y = 0.06;
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.62, b.d * 0.62).rotateX(-Math.PI / 2), mat("#4f8a35"));
    pitch.position.y = 0.1;
    g.add(track, pitch);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.62, 0.3).rotateX(-Math.PI / 2), mat("#f4f4f2"));
    line.position.y = 0.12;
    g.add(line);
    for (const z of [-1, 1]) {
      const post = box(7, 2.4, 0.3, mat("#f4f4f2"));
      post.position.set(0, 1.2, (z * b.d * 0.62) / 2);
      g.add(post);
    }
    const stand = block(b.w * 0.8, b.h, 6, "#d9d9d9", b.roof, 2);
    stand.position.set(0, b.h / 2, -b.d / 2 - 4);
    g.add(stand);
    const roof = box(b.w * 0.85, 0.4, 8, mat(b.roof));
    roof.position.set(0, b.h + 1.5, -b.d / 2 - 4);
    g.add(roof);
    g.position.set(b.x, 0, b.z);
    return g;
  },
  theatre(b) {
    // Lecture theatre: a raked hall whose roof slopes down towards the lecturer, glass front, OAU concrete.
    const g = new THREE.Group();
    const base = block(b.w, b.h * 0.55, b.d, b.wall, b.roof, 1);
    g.add(base);
    const roofGeo = new THREE.BoxGeometry(b.w + 2, 1, b.d + 2);
    const roof = new THREE.Mesh(roofGeo, mat(b.roof));
    roof.position.y = b.h * 0.78;
    roof.rotation.x = -0.18;
    g.add(roof);
    const back = box(b.w, b.h * 0.45, 2, mat(b.wall));
    back.position.set(0, b.h * 0.55 + b.h * 0.2, -b.d / 2 + 1);
    g.add(back);
    // the long glass front and tiered seating visible through it
    for (const side of [-1, 1]) {
      const glassWall = box(0.3, b.h * 0.42, b.d * 0.8, mat("#2c3e46", { emissive: "#0b1418" }));
      glassWall.position.set(side * (b.w / 2 + 0.2), b.h * 0.3, 0);
      g.add(glassWall);
    }
    for (let i = 0; i < 4; i++) {
      const step = box(b.w * 0.8, 0.4, 2.4, mat("#7a4a2a"));
      step.position.set(0, b.h * 0.56 + 0.2 + i * 0.6, -b.d / 2 + 4 + i * 2.6);
      g.add(step);
    }
    g.position.set(b.x, 0, b.z);
    return g;
  },
  market(b) {
    // Ojaja: rows of stalls under zinc roofs, umbrellas, crates, and wares on display.
    const g = new THREE.Group();
    const rows = 3;
    const cols = 4;
    const wares = ["#d23c2a", "#f2c230", "#2f6fae", "#1f6f4a", "#e88b5d", "#7a3e9d", "#222", "#f4f4f2"];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -b.w / 2 + 4 + c * ((b.w - 8) / (cols - 1));
        const z = -b.d / 2 + 6 + r * ((b.d - 12) / (rows - 1));
        const stall = new THREE.Group();
        const table = box(5, 1.1, 3, mat("#8a5a2e"));
        table.position.y = 0.55;
        stall.add(table);
        for (let i = 0; i < 3; i++) {
          const item = box(1.2, 0.6 + (k % 3) * 0.3, 1, mat(wares[(k + i) % wares.length]));
          item.position.set(-1.6 + i * 1.6, 1.4, 0);
          stall.add(item);
        }
        for (const [px, pz] of [[-2.4, -1.5], [2.4, -1.5], [-2.4, 1.5], [2.4, 1.5]]) {
          const pole = box(0.15, 3.4, 0.15, mat("#6b4a2a"));
          pole.position.set(px, 1.7, pz);
          stall.add(pole);
        }
        const zinc = box(6, 0.15, 4.2, mat(k % 4 === 0 ? "#b5482a" : "#9aa3a8"));
        zinc.position.y = 3.5;
        zinc.rotation.x = 0.1;
        stall.add(zinc);
        stall.position.set(x, 0, z);
        g.add(stall);
        k += 1;
      }
    }
    // a phone shop and a barber's shed at the front
    const shop = block(10, 4.5, 7, "#e9e2d0", "#2f5f9e", 1);
    shop.position.set(b.w / 2 - 6, 2.25, b.d / 2 - 4);
    g.add(shop);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 8), mat("#f2c230"));
    umb.position.set(-b.w / 2 + 4, 3.4, b.d / 2 - 2);
    g.add(umb);
    g.position.set(b.x, 0, b.z);
    return g;
  },
  bungalows(b) {
    const g = new THREE.Group();
    for (let i = -1; i <= 1; i++) g.add(house(b, i * (b.w / 3), 0, 0.33));
    g.position.set(b.x, 0, b.z);
    return g;
  },
  house(b) {
    const g = new THREE.Group();
    g.add(house(b, 0, 0, 1));
    g.position.set(b.x, 0, b.z);
    return g;
  },
};

function house(b, x, z, scale) {
  const g = new THREE.Group();
  const w = b.w * scale * 0.85;
  const d = b.d * (scale < 1 ? 0.8 : 1);
  const body = block(w, b.h, d, b.wall, b.roof, 1);
  g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) * 0.6, 3.2, 4), mat(b.roof));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(w / Math.hypot(w, d) * 1.42, 1, d / Math.hypot(w, d) * 1.42);
  roof.position.y = b.h + 1.6;
  g.add(roof);
  g.position.set(x, 0, z);
  return g;
}

// --- Roads and scenery ----------------------------------------------------------------------------

function road(a, b, kind) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const tex = roadTexture().clone();
  tex.repeat.set(1, len / 16);
  tex.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, len).rotateX(-Math.PI / 2),
    surface({ map: tex, roughness: 0.95 }));
  m.position.set((a[0] + b[0]) / 2, kind === "town" ? 0.07 : 0.08, (a[1] + b[1]) / 2);
  m.rotation.y = Math.atan2(dx, dz);
  // red-earth verges, then a paved walkway and kerbs on both sides
  const verge = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W + 9, len).rotateX(-Math.PI / 2), mat("#a8603c"));
  verge.position.set(m.position.x, 0.03, m.position.z);
  verge.rotation.y = m.rotation.y;
  const out = [verge, m];
  if (kind !== "town") {
    const side = new THREE.Group();
    side.position.copy(m.position);
    side.rotation.y = m.rotation.y;
    for (const s of [-1, 1]) {
      // the open concrete gutter every Nigerian road has
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, len), mat("#5b5e58"));
      gutter.position.set(s * (ROAD_W / 2 + 0.85), 0.02, 0);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(0.5, len).rotateX(-Math.PI / 2), mat("#2e3a33", { roughness: 0.3 }));
      water.position.set(s * (ROAD_W / 2 + 0.85), 0.09, 0);
      side.add(gutter, water);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, len).rotateX(-Math.PI / 2), mat("#c9c2b0"));
      walk.position.set(s * (ROAD_W / 2 + 2.4), -0.02, 0);
      walk.userData.ground = true;
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, len), mat("#e8e4da"));
      kerb.position.set(s * (ROAD_W / 2 + 0.2), 0.08, 0);
      side.add(walk, kerb);
    }
    out.push(side);
  }
  verge.userData.ground = true;
  m.userData.ground = true;
  return out;
}

function seeded(n) {
  let s = n;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function distToSegment(px, pz, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

function trees(map, colliders) {
  const rand = seeded(42);
  const edges = map.edges.map(([a, b]) => [map.nodes[a], map.nodes[b]]);
  const bx = map.bounds || { x0: -230, x1: 470, z0: -20, z1: 340 };
  const spots = [];
  for (let i = 0; spots.length < 560 && i < 8000; i++) {
    const x = bx.x0 - 30 + rand() * (bx.x1 - bx.x0 + 60);
    const z = bx.z0 - 20 + rand() * (bx.z1 - bx.z0 + 40);
    if (edges.some(([a, b]) => distToSegment(x, z, a, b) < ROAD_W / 2 + 6)) continue;
    if (colliders.some((c) => x > c.x0 - 12 && x < c.x1 + 12 && z > c.z0 - 12 && z < c.z1 + 12)) continue;
    spots.push([x, z, rand(), rand()]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.6, 4.4, 6).translate(0, 2.2, 0);
  const crownGeo = new THREE.IcosahedronGeometry(3.2, 1).translate(0, 5.8, 0);
  const topGeo = new THREE.IcosahedronGeometry(2.1, 1).translate(0.8, 8.0, 0.4);
  const palmTrunk = new THREE.CylinderGeometry(0.28, 0.42, 9, 6).translate(0, 4.5, 0);
  const frond = new THREE.ConeGeometry(4.2, 1.1, 7, 1, true).translate(0, 9.1, 0);
  const frond2 = new THREE.ConeGeometry(3.0, 1.6, 6, 1, true).translate(0, 9.7, 0);
  const round = spots.filter((s) => s[2] > 0.22);
  const palms = spots.filter((s) => s[2] <= 0.22);
  const meshes = [];
  const greens = ["#3f7a2f", "#2f6a2a", "#4d8a34", "#356f2c", "#5a8f3a"].map((c) => new THREE.Color(c));
  const place = (geom, material, list, scaleFn, tint = false) => {
    const im = new THREE.InstancedMesh(geom, material, list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach(([x, z, , r], i) => {
      const s = scaleFn(r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m4);
      if (tint) im.setColorAt(i, greens[Math.floor(r * 997) % greens.length]);
    });
    im.userData.trees = true;
    meshes.push(im);
  };
  place(trunkGeo, mat("#6b4a2a"), round, (r) => 0.8 + r * 0.7);
  place(crownGeo, mat("#ffffff", { flatShading: true }), round, (r) => 0.8 + r * 0.7, true);
  place(topGeo, mat("#ffffff", { flatShading: true }), round.filter((_, i) => i % 3 !== 0), (r) => 0.8 + r * 0.7, true);
  place(palmTrunk, mat("#7a5a3a"), palms, (r) => 0.8 + r * 0.4);
  place(frond, mat("#4f8a2f", { flatShading: true, side: THREE.DoubleSide }), palms, (r) => 0.8 + r * 0.4);
  place(frond2, mat("#5f9a35", { flatShading: true, side: THREE.DoubleSide }), palms, (r) => 0.8 + r * 0.4);

  // bushes and flowers along building fronts
  const bushes = [];
  for (const c of colliders) {
    if (c.cameraOnly) continue;
    const per = Math.round((c.x1 - c.x0) / 6);
    for (let i = 0; i <= per; i++) {
      const x = c.x0 + ((c.x1 - c.x0) * i) / Math.max(1, per);
      for (const z of [c.z0 - 2.2, c.z1 + 2.2]) {
        if (edges.some(([a, b]) => distToSegment(x, z, a, b) < ROAD_W / 2 + 3)) continue;
        if (rand() < 0.7) bushes.push([x + (rand() - 0.5), z, rand(), rand()]);
      }
    }
  }
  const bushGeo = new THREE.IcosahedronGeometry(1.1, 0).translate(0, 0.7, 0);
  place(bushGeo, mat("#ffffff", { flatShading: true }), bushes, (r) => 0.8 + r * 0.6, true);
  const flowerGeo = new THREE.IcosahedronGeometry(0.28, 0).translate(0.5, 1.5, 0.3);
  const flowers = bushes.filter((_, i) => i % 3 === 0);
  const fm = new THREE.InstancedMesh(flowerGeo, mat("#ffffff"), flowers.length);
  const fcol = ["#e84a7f", "#f2c230", "#ffffff", "#ff7a3d"].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4();
  flowers.forEach(([x, z, , r], i) => {
    m4.makeTranslation(x, 0, z);
    fm.setMatrixAt(i, m4);
    fm.setColorAt(i, fcol[i % fcol.length]);
  });
  meshes.push(fm);
  return meshes;
}

function lamps(map) {
  const points = [];
  for (const [a, b] of map.edges) {
    const A = map.nodes[a];
    const B = map.nodes[b];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const nx = -(B[1] - A[1]) / len;
    const nz = (B[0] - A[0]) / len;
    for (let t = 18; t < len - 10; t += 34) {
      const x = A[0] + ((B[0] - A[0]) * t) / len + nx * (ROAD_W / 2 + 1.6);
      const z = A[1] + ((B[1] - A[1]) * t) / len + nz * (ROAD_W / 2 + 1.6);
      points.push([x, z]);
    }
  }
  const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 5).translate(0, 3.5, 0), mat("#5b5f62"), points.length);
  const headMat = new THREE.MeshLambertMaterial({ color: "#fff3c4", emissive: "#000" });
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.3, 0.6).translate(0, 7, 0), headMat, points.length);
  const m4 = new THREE.Matrix4();
  points.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    pole.setMatrixAt(i, m4);
    head.setMatrixAt(i, m4);
  });
  return { meshes: [pole, head], headMat, points };
}

function gate(map) {
  const g = new THREE.Group();
  const [x, z] = map.nodes.gate;
  for (const s of [-1, 1]) {
    const pillar = box(2.4, 9, 2.4, mat("#d8d2c6"));
    pillar.position.set(x - 6, 4.5, z + s * 8);
    g.add(pillar);
  }
  const beam = box(2.2, 2.4, 19, mat("#14402c"));
  beam.position.set(x - 6, 9.6, z);
  g.add(beam);
  for (const side of [-1, 1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshLambertMaterial({ map: signTexture("GREAT IFE") }));
    sign.position.set(x - 6 + side * 1.15, 9.6, z);
    sign.rotation.y = (side * Math.PI) / 2;
    g.add(sign);
  }
  // security post
  const post = box(4, 3, 4, mat("#e9e2d0"));
  post.position.set(x - 2, 1.5, z + 14);
  g.add(post);
  return g;
}

/** Where a bus stop's shelter stands: at the roadside just before the stop, on the bus's side. */
export function stopPlacement(map, nodeId) {
  const route = map.bus_route;
  const i = Math.max(1, route.indexOf(nodeId, 1));
  const prev = map.nodes[route[i - 1]];
  const [x, z] = map.nodes[nodeId];
  const len = Math.hypot(x - prev[0], z - prev[1]) || 1;
  const dx = (x - prev[0]) / len;
  const dz = (z - prev[1]) / len;
  const rx = -dz;
  const rz = dx;
  const back = Math.min(14, len / 2);
  return { x: x - dx * back + rx * (ROAD_W / 2 + 3.2), z: z - dz * back + rz * (ROAD_W / 2 + 3.2), dir: [dx, dz], right: [rx, rz] };
}

function busStop(map, nodeId, name) {
  const g = new THREE.Group();
  const roof = box(7, 0.25, 3, mat("#1f6f4a"));
  roof.position.y = 3.2;
  g.add(roof);
  for (const s of [-1, 1]) {
    const p = box(0.2, 3.2, 0.2, mat("#ccc"));
    p.position.set(s * 3.2, 1.6, -1.2);
    g.add(p);
  }
  const bench = box(5, 0.2, 0.8, mat("#8a5a2e"));
  bench.position.set(0, 0.8, -0.8);
  g.add(bench);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.8), new THREE.MeshLambertMaterial({
    map: signTexture(`BUS STOP · ${name.toUpperCase()}`, { width: 1024 }), side: THREE.DoubleSide }));
  sign.position.set(0, 3.8, 0);
  g.add(sign);
  const at = stopPlacement(map, nodeId);
  g.position.set(at.x, 0, at.z);
  g.rotation.y = Math.atan2(-at.dir[1], at.dir[0]);
  return g;
}

function townStrip(map) {
  // Asherifa: shops and houses along the road outside the gate.
  const g = new THREE.Group();
  const [tx, tz] = map.nodes.town;
  const [gx] = map.nodes.gate;
  const shops = ["MAMA PUT", "POS", "PROVISIONS", "PRINTING", "CHEMIST", "BARBING SALON", "ROOMS TO LET"];
  const rand = seeded(7);
  let i = 0;
  for (let x = tx - 40; x < gx - 20; x += 16, i++) {
    for (const side of [-1, 1]) {
      if (side === 1 && Math.abs(x - tx) < 14) continue; // your self-con is there
      const w = 10 + rand() * 4;
      const color = ["#d9c9a8", "#c8d6c0", "#e5c6a0", "#d0c4d8", "#e8dcc2"][Math.floor(rand() * 5)];
      const h = 5 + rand() * 3;
      const b = block(w, h, 9, color, "#6b6b6b", 1);
      b.position.set(x, h / 2, tz + side * 18);
      g.add(b);
      const zinc = box(w + 1.5, 0.3, 11, mat("#8e979c"));
      zinc.position.set(x, h + 0.2, tz + side * 18);
      zinc.rotation.x = side * 0.08;
      g.add(zinc);
      const text = shops[(i + (side > 0 ? 3 : 0)) % shops.length];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, 1.4), new THREE.MeshLambertMaterial({
        map: signTexture(text, { bg: ["#b03a2e", "#2f5f9e", "#1f6f4a", "#7a3e9d"][i % 4], fg: "#fff", border: "#fff" }) }));
      sign.position.set(x, h - 1, tz + side * (18 - 4.6));
      sign.rotation.y = side > 0 ? Math.PI : 0;
      g.add(sign);
    }
  }
  return g;
}

function hills() {
  const g = new THREE.Group();
  const rand = seeded(99);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = 520 + rand() * 120;
    const h = 40 + rand() * 70;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(90 + rand() * 80, h, 7), mat(rand() > 0.5 ? "#4d7a3a" : "#5b8540", { flatShading: true }));
    hill.position.set(110 + Math.cos(a) * r, h / 2 - 4, 150 + Math.sin(a) * r * 0.7);
    g.add(hill);
  }
  return g;
}

/**
 * buildWorld(map) -> { group, doors, colliders, lamps, nightMaterials, labels }
 */
/** The Banking Area: a row of bank fronts, each with its own sign and an ATM outside. */
function bankRow(b, banks, door) {
  const g = new THREE.Group();
  const base = block(b.w, b.h, b.d, b.wall, b.roof, 1);
  base.position.set(b.x, b.h / 2, b.z);
  g.add(base);
  const roof = box(b.w + 1.2, 0.6, b.d + 1.2, mat(b.roof));
  roof.position.set(b.x, b.h + 0.3, b.z);
  g.add(roof);
  const [nx, nz] = door.normal;
  const along = nx ? [0, 1] : [1, 0];           // the facade runs this way
  const span = nx ? b.d : b.w;
  const branches = Object.values(banks || {}).filter((x) => !x.app);
  const seg = span / Math.max(1, branches.length);
  const face = (t, out, y) => [b.x + nx * (b.w / 2 + out) + along[0] * t, y, b.z + nz * (b.d / 2 + out) + along[1] * t];
  branches.forEach((bank, i) => {
    const t = -span / 2 + seg * (i + 0.5);
    // fascia board in the bank's colours
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(seg * 0.92, seg * 0.92 * 0.16),
      new THREE.MeshLambertMaterial({ map: signTexture(bank.name.toUpperCase(), { bg: bank.color, fg: bank.fg, border: bank.fg, width: 768 }) }));
    sign.position.set(...face(t, 0.35, b.h - 1.3));
    sign.rotation.y = door.angle;
    g.add(sign);
    // glass door and a strip of colour at the base
    const glass = box(seg * 0.5, 3.2, 0.2, mat("#3b5560", { roughness: 0.2 }));
    glass.position.set(...face(t, 0.15, 1.6));
    glass.rotation.y = door.angle;
    g.add(glass);
    const band = box(seg * 0.96, 0.5, 0.25, mat(bank.color));
    band.position.set(...face(t, 0.2, 3.6));
    band.rotation.y = door.angle;
    g.add(band);
    // the ATM, under a little canopy, with a queue line painted on the floor
    const atm = new THREE.Group();
    const body = box(1.3, 2.3, 0.9, mat("#c9ccd0"));
    body.position.y = 1.15;
    const screen = box(0.8, 0.5, 0.05, new THREE.MeshBasicMaterial({ color: "#3ec1ff" }));
    screen.position.set(0, 1.65, 0.46);
    const top = box(1.5, 0.35, 1.1, mat(bank.color));
    top.position.y = 2.45;
    atm.add(body, screen, top);
    atm.position.set(...face(t + seg * 0.32, 1.2, 0));
    atm.rotation.y = door.angle;
    g.add(atm);
  });
  // fintech agents don't have branches: their POS umbrellas stand outside
  Object.values(banks || {}).filter((x) => x.app).forEach((bank, i) => {
    const stand = posStand(bank.color);
    stand.position.set(...face((i ? 1 : -1) * (span / 2 + 3), 4, 0));
    stand.rotation.y = door.angle;
    g.add(stand);
  });
  return g;
}

/** A POS agent: a small table under a branded umbrella, with a POS machine and a plastic chair. */
function posStand(color = "#1dbf8d") {
  const g = new THREE.Group();
  const pole = box(0.12, 2.8, 0.12, mat("#dddddd"));
  pole.position.y = 1.4;
  const umb = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.9, 8), mat(color));
  umb.position.y = 3.0;
  const table = box(1.8, 0.12, 1.0, mat("#f1f1f1"));
  table.position.y = 1.0;
  for (const [x, z] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) {
    const leg = box(0.08, 1.0, 0.08, mat("#9aa0a6"));
    leg.position.set(x, 0.5, z);
    g.add(leg);
  }
  const machine = box(0.35, 0.12, 0.5, mat("#222"));
  machine.position.set(0.3, 1.12, 0);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.42),
    new THREE.MeshLambertMaterial({ map: signTexture("POS", { bg: color, fg: "#ffffff", border: "#ffffff", width: 384 }) }));
  sign.position.set(0, 0.62, 0.52);
  const chair = box(0.6, 0.08, 0.6, mat("#d23b3b"));
  chair.position.set(0, 0.55, -1.0);
  g.add(pole, umb, table, machine, sign, chair);
  return g;
}

export function buildWorld(map) {
  const group = new THREE.Group();
  const colliders = [];
  const doors = [];
  const labels = [];
  const nightMaterials = new Set();

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1200).rotateX(-Math.PI / 2),
    surface({ map: grassTexture(), roughness: 1 }));
  ground.position.set(110, 0, 150);
  ground.userData.ground = true;
  ground.material.map.repeat.set(110, 80);
  group.add(ground);
  group.add(hills());

  for (const [a, b, kind] of map.edges) group.add(...road(map.nodes[a], map.nodes[b], kind));
  for (const [x, z] of Object.values(map.nodes)) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ROAD_W / 2 + 0.2, 16).rotateX(-Math.PI / 2), mat("#4a4d50"));
    disc.position.set(x, 0.09, z);
    group.add(disc);
  }

  for (const [id, b] of Object.entries(map.buildings)) {
    const node = map.nodes[b.node];
    const make = b.style === "banks" ? (bb) => bankRow(bb, map.banks, doorFor(bb, node)) : STYLES[b.style] || STYLES.hall;
    const mesh = make(b);
    mesh.traverse((o) => o.material && [o.material].flat().forEach((m) => m.userData?.night && nightMaterials.add(m)));
    group.add(mesh);
    const door = doorFor(b, node);
    if (!["amphitheatre", "sports", "buka", "market", "banks"].includes(b.style)) {
      entrance(group, door, b.wall);
      addSign(group, b.sign, door, Math.min(b.h - 1.5, 6.8), Math.min(18, Math.max(b.w, b.d) * 0.6));
    }
    if (b.style === "banks") addSign(group, b.sign, { ...door, x: door.x - door.normal[0] * 0.2, z: door.z - door.normal[1] * 0.2 }, b.h + 1.6, 14);
    // a POS agent by the door of every hall, faculty, lecture theatre and the market
    if (map.pos?.includes(id) && b.style !== "banks") {
      const stand = posStand(["#1dbf8d", "#0a4bd6"][id.length % 2]);
      const side = id.length % 2 ? 1 : -1;
      stand.position.set(door.x + door.normal[0] * 3 - door.normal[1] * 7 * side, 0, door.z + door.normal[1] * 3 + door.normal[0] * 7 * side);
      stand.rotation.y = door.angle;
      group.add(stand);
    }
    if (!["amphitheatre", "sports"].includes(b.style)) {
      colliders.push({ id, h: b.style === "tower" ? b.h + 4 : b.h + 2, x0: b.x - b.w / 2 - 0.5, x1: b.x + b.w / 2 + 0.5, z0: b.z - b.d / 2 - 0.5, z1: b.z + b.d / 2 + 0.5 });
    }
    // paved walk from the road to the door
    const wx = (node[0] + door.x) / 2;
    const wz = (node[1] + door.z) / 2;
    const wl = Math.hypot(node[0] - door.x, node[1] - door.z);
    if (wl > 2) {
      const tex = paveTexture().clone();
      tex.repeat.set(1, wl / 6);
      tex.needsUpdate = true;
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(5, wl).rotateX(-Math.PI / 2), surface({ map: tex, roughness: 0.95 }));
      walk.position.set(wx, 0.06, wz);
      walk.rotation.y = Math.atan2(node[0] - door.x, node[1] - door.z);
      group.add(walk);
    }
    // a glowing ring where you go in
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.9, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#f2c230", transparent: true, opacity: 0.85 }));
    const rx = door.x + door.normal[0] * 4;
    const rz = door.z + door.normal[1] * 4;
    ring.position.set(rx, 0.15, rz);
    group.add(ring);
    doors.push({ id, name: b.name, x: rx, z: rz, ring, node });

    const tex = labelTexture(b.name);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const h = 3.2;
    sprite.scale.set(h * tex.userData.aspect, h, 1);
    sprite.position.set(b.x, (b.style === "tower" ? b.h + 6 : Math.max(b.h, 6)) + 5, b.z);
    sprite.renderOrder = 10;
    group.add(sprite);
    labels.push(sprite);
  }

  for (const t of trees(map, colliders)) group.add(t);
  const lampSet = lamps(map);
  group.add(...lampSet.meshes);
  group.add(gate(map));
  group.add(powerLines(map));
  const [gx, gz] = map.nodes.gate;
  colliders.push({ id: "gate", cameraOnly: true, h: 11, x0: gx - 8, x1: gx - 4, z0: gz - 10, z1: gz + 10 });
  group.add(townStrip(map));
  for (const s of map.bus_stops) group.add(busStop(map, s, map.stop_names?.[s] || s));

  return { group, doors, colliders, lamps: lampSet, nightMaterials: [...nightMaterials], labels };
}
