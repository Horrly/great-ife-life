// Real people. Every student is a rigged human body (CC0 models by Quaternius: Universal Base Characters,
// Modular Character Outfits and the Universal Animation Library) dressed in tinted clothes, with real
// motion-captured style animation: idle breathing, walking, jogging, sitting, eating, talking on the phone.
// Characters face +Z. Until the models have downloaded (and on very old phones) a light stand-in is used.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { LOOK, isHighQuality, mat, randomLook, setQuality, surface } from "./look";
import { HIP, blobShadow, makeSimplePerson } from "./simple";

export { HIP, LOOK, mat, randomLook, setQuality, surface };

// The models are 1.8 m tall; the game's people are about 3.4 units.
const UNIT = 1.88;
const BASE = "/models/";

let assets = null; // { m, f, clips }
let loading = null;
let fullDetail = true;

/** Use the light stand-in everywhere (very old phones). */
export function setPeopleDetail(full) {
  fullDetail = Boolean(full);
}

/** Download the people once. Resolves when real people can be made (or rejects; stand-ins stay). */
export function preloadPeople() {
  if (assets) return Promise.resolve(assets);
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all([loader.loadAsync(`${BASE}person-m.glb`), loader.loadAsync(`${BASE}person-f.glb`), loader.loadAsync(`${BASE}person-anims.glb`)])
    .then(([m, f, a]) => {
      for (const g of [m, f]) g.scenes[0].traverse((o) => o.isBone && BONE_NAMES.add(o.name));
      // The packed files hold several copies of the skeleton, so the loader numbers the repeats
      // ("pelvis_1"). Each clip is retargeted onto each body: the motion is kept relative to the rest
      // pose it was recorded on, then applied on top of the body's own rest pose.
      const restOf = (root) => {
        const out = {};
        root.traverse((o) => {
          if (o.isBone || o.type === "Object3D" || o.isObject3D) out[o.name] = { q: o.quaternion.clone(), p: o.position.clone() };
        });
        return out;
      };
      const source = {};
      for (const sc of a.scenes) Object.assign(source, restOf(sc));
      const clips = { m: {}, f: {} };
      for (const [sex, g] of [["m", m], ["f", f]]) {
        const target = restOf(g.scenes[0]);
        for (const clip of a.animations) {
          const tracks = [];
          for (const track of clip.tracks) {
            const dot = track.name.lastIndexOf(".");
            const node = track.name.slice(0, dot);
            const prop = track.name.slice(dot + 1);
            const name = realName(node);
            const src = source[node];
            const dst = target[name];
            const t = track.clone();
            t.name = `${name}.${prop}`;
            // The library's standing clips are game-ready "action" stances (wide legs, fists). A student
            // standing at the buka doesn't stand like that: pull the legs back under the hips and open the hands.
            const relax = RELAX[clip.name] || 0;
            const legs = /^(thigh|calf|foot|ball)_/.test(name);
            const fingers = /^(index|middle|ring|pinky|thumb)_/.test(name);
            if (src && dst && prop === "quaternion") {
              const delta = dst.q.clone().multiply(src.q.clone().invert());
              const q = new THREE.Quaternion();
              const pull = legs ? relax : fingers && clip.name === "Idle_Loop" ? 0.6 : 0;
              for (let i = 0; i < t.values.length; i += 4) {
                q.fromArray(t.values, i).premultiply(delta).normalize();
                if (pull) q.slerp(dst.q, pull);
                q.toArray(t.values, i);
              }
            } else if (src && dst && prop === "position") {
              const k = src.p.length() > 1e-4 ? dst.p.length() / src.p.length() : 1;
              const v = new THREE.Vector3();
              for (let i = 0; i < t.values.length; i += 3) {
                v.fromArray(t.values, i).multiplyScalar(k);
                if (relax && name === "pelvis") v.lerp(dst.p, relax);
                v.toArray(t.values, i);
              }
            }
            tracks.push(t);
          }
          clips[sex][clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
        }
      }
      assets = { m: template(m), f: template(f), clips };
      for (const fn of waiting.splice(0)) fn();
      return assets;
    })
    .catch((err) => {
      loading = null;
      console.warn("People models unavailable, using simple people", err);
      throw err;
    });
  return loading;
}
export function peopleReady() {
  return Boolean(assets);
}
const waiting = [];

// standing clips whose legs are pulled back to a natural stance (0 = as recorded, 1 = straight)
const RELAX = { Idle_Loop: 0.85, Idle_Talking_Loop: 0.8, Idle_TalkingPhone_Loop: 0.8, Idle_FoldArms_Loop: 0.8, Yes: 0.8, Idle_No_Loop: 0.8,
  Consume: 0.8, Interact: 0.6 };
const BONE_NAMES = new Set();
function realName(name) {
  if (BONE_NAMES.size === 0 || BONE_NAMES.has(name)) return name;
  const stripped = name.replace(/_\d+$/, "");
  return BONE_NAMES.has(stripped) ? stripped : name;
}

/** Split a packed GLB into its parts: the body scene (with the skeleton) and the clothes/hair meshes. */
function template(gltf) {
  const parts = {};
  for (const scene of gltf.scenes) {
    scene.updateMatrixWorld(true);
    const meshes = [];
    scene.traverse((o) => {
      if (o.isSkinnedMesh) meshes.push(o);
    });
    parts[scene.name] = { scene, meshes };
  }
  return parts;
}

// --- materials: tinted, with parts of the body or clothes cut away by their rest position -------------

const tinted = new Map();
/**
 * A copy of `base` in `color`. `clip` cuts parts away (in the model's rest pose, metres):
 *   sleeve: hide beyond |x| > c        shoe: hide above y > c
 *   body:  hide the skin that clothes cover, and paint the lower legs in trouser colour
 */
function tint(base, color, clip = null, extra = {}) {
  const key = `${base.uuid}|${color}|${clip ? JSON.stringify(clip) : ""}|${extra.map?.uuid || ""}|${isHighQuality()}`;
  if (tinted.has(key)) return tinted.get(key);
  let m;
  if (isHighQuality()) {
    m = base.clone();
    m.color = new THREE.Color(color);
  } else {
    m = new THREE.MeshLambertMaterial({ color, map: base.map, alphaTest: base.alphaTest, side: base.side });
  }
  if (extra.map) {
    m.map = extra.map;
  }
  if (extra.roughness != null && "roughness" in m) m.roughness = extra.roughness;
  if (clip) {
    const c = clip;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uClipA = { value: new THREE.Vector4(...(c.a || [0, 0, 0, 0])) };
      shader.uniforms.uClipB = { value: new THREE.Vector4(...(c.b || [0, 0, 0, 0])) };
      shader.uniforms.uPaint = { value: new THREE.Color(c.paint || "#000000") };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vRest;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRest = position;");
      let head = "varying vec3 vRest;\nuniform vec4 uClipA;\nuniform vec4 uClipB;\nuniform vec3 uPaint;\n";
      let test = "";
      let paint = "";
      if (c.kind === "sleeve") test = "if (abs(vRest.x) > uClipA.x) discard;";
      else if (c.kind === "shoe") test = "if (vRest.y > uClipA.x) discard;";
      else if (c.kind === "body") {
        // a: torso (yLow, yHigh, halfWidth, upper-arm reach)  b: legs (yLow, yHigh, paintBelow, shoeTop)
        test = `
          float ax = abs(vRest.x);
          if (vRest.y > uClipA.x && vRest.y < uClipA.y && ax < uClipA.z) discard;
          if (vRest.y > uClipA.y - 0.16 && vRest.y < uClipA.y + 0.09 && ax < uClipA.w && ax >= uClipA.z) discard;
          if (vRest.y > uClipB.x && vRest.y < uClipB.y && ax < 0.3) discard;
          if (vRest.y < uClipB.w) discard;`;
        paint = "if (vRest.y < uClipB.z && vRest.y >= uClipB.w) { diffuseColor.rgb = uPaint; }";
      }
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${head}`)
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>\n${test}`)
        .replace("#include <map_fragment>", `#include <map_fragment>\n${paint}`);
    };
    m.customProgramCacheKey = () => `clip-${c.kind}-${isHighQuality()}`;
  }
  tinted.set(key, m);
  return m;
}

// --- fabric prints (Ankara, Adire, Aso-oke) --------------------------------------------------------------

const prints = new Map();
function printTexture(kind, color) {
  const key = `${kind}|${color}`;
  if (prints.has(key)) return prints.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const base = new THREE.Color(color);
  const hex = (col) => `#${col.getHexString()}`;
  const accent = base.clone().offsetHSL(0.45, 0.1, 0.05);
  const third = base.clone().offsetHSL(-0.2, 0.15, 0.15);
  if (kind === "ankara") {
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 9; i++) {
      const x = (i % 3) * 43 + 21;
      const y = Math.floor(i / 3) * 43 + 21;
      g.fillStyle = hex(accent);
      g.beginPath();
      g.ellipse(x, y, 17, 12, (i * 0.7) % Math.PI, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hex(third);
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f6efe0";
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "adire") {
    g.fillStyle = "#1d2f6b";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(220,230,255,0.75)";
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = i * 32 + 16;
        const y = j * 32 + 16;
        g.beginPath();
        g.arc(x, y, 10, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(x - 14, y);
        g.lineTo(x + 14, y);
        g.moveTo(x, y - 14);
        g.lineTo(x, y + 14);
        g.stroke();
      }
    }
  } else {
    // aso-oke: woven stripes
    for (let y = 0; y < 128; y += 8) {
      g.fillStyle = y % 32 < 16 ? hex(base) : y % 16 < 8 ? "#d8b45a" : hex(base.clone().multiplyScalar(0.7));
      g.fillRect(0, y, 128, 8);
    }
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let x = 0; x < 128; x += 4) g.fillRect(x, 0, 1, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  prints.set(key, tex);
  return tex;
}

// --- extras that the packs don't have: afro, dreads, a skirt, a backpack --------------------------------

const extraGeo = {};
function afroGeo() {
  if (extraGeo.afro) return extraGeo.afro;
  const geo = new THREE.IcosahedronGeometry(0.155, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = 1 + 0.07 * Math.sin(v.x * 90) * Math.sin(v.y * 83) * Math.sin(v.z * 97);
    pos.setXYZ(i, v.x * n * 1.05, v.y * n * 0.9, v.z * n);
  }
  geo.computeVertexNormals();
  extraGeo.afro = geo;
  return geo;
}
function strandGeo(len, r) {
  const key = `strand${len}${r}`;
  if (!extraGeo[key]) extraGeo[key] = new THREE.CapsuleGeometry(r, len, 3, 6).translate(0, -len / 2, 0);
  return extraGeo[key];
}
function skirtGeo() {
  if (extraGeo.skirt) return extraGeo.skirt;
  const pts = [[0.158, 0.05], [0.166, 0], [0.19, -0.12], [0.225, -0.28], [0.25, -0.4], [0.248, -0.42]].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 32).scale(1, 1, 0.8);
  // weights: [pelvis, thigh_l (+x), thigh_r (-x)]; the hem follows the legs, the waistband the hips
  const pos = geo.attributes.position;
  const idx = [];
  const wts = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const down = THREE.MathUtils.clamp(-y / 0.42, 0, 1);
    const side = THREE.MathUtils.clamp(Math.abs(x) / 0.15, 0, 1);
    const leg = down * (0.3 + 0.45 * side);
    const left = THREE.MathUtils.clamp(0.5 + x / 0.16, 0, 1);
    idx.push(0, 1, 2, 0);
    wts.push(1 - leg, leg * left, leg * (1 - left), 0);
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wts, 4));
  extraGeo.skirt = geo;
  return geo;
}
function bagGeo() {
  if (!extraGeo.bag) {
    extraGeo.bag = new THREE.CapsuleGeometry(0.11, 0.2, 4, 10).scale(1.15, 1, 0.55);
    extraGeo.strap = new THREE.BoxGeometry(0.035, 0.24, 0.012);
    extraGeo.strapTop = new THREE.BoxGeometry(0.035, 0.012, 0.2);
  }
  return extraGeo.bag;
}

// --- animation names the game uses ----------------------------------------------------------------------

export const ACTIONS = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  sprint: "Sprint_Loop",
  sit: "Sitting_Idle_Loop",
  sit_talk: "Sitting_Talking_Loop",
  talk: "Idle_Talking_Loop",
  phone: "Idle_TalkingPhone_Loop",
  eat: "Consume",
  fold: "Idle_FoldArms_Loop",
  dance: "Dance_Loop",
  drive: "Driving_Loop",
  interact: "Interact",
  pickup: "PickUp_Table",
  crouch: "Crouch_Idle_Loop",
  kneel: "Fixing_Kneeling",
  push: "Push_Loop",
  carry: "Walk_Carry_Loop",
  water: "Farm_Watering",
  yes: "Yes",
  no: "Idle_No_Loop",
  lie: "LayToIdle",
};
// One-shot gestures and what the person does between them. Looping them back to back looked frantic,
// so after each one they settle into the rest pose for a few seconds, then go again, a little slower than the clip.
const ONE_SHOT = {
  eat: { rest: "idle", gap: [2.5, 4.5], speed: 0.85 },
  interact: { rest: "idle", gap: [2.0, 4.0], speed: 0.8 },
  pickup: { rest: "idle", gap: [3.0, 5.0], speed: 0.8 },
  yes: { rest: "idle", gap: [3.0, 6.0], speed: 0.9 },
};
// Loops that are played a touch slower than authored, so work looks steady rather than rushed
const CALM = { kneel: 0.8, push: 0.8, water: 0.85, dance: 0.9, phone: 0.9, talk: 0.9, sit_talk: 0.9, fold: 0.9 };
// How fast each gait moves at normal playback, in game units per second (scale 1)
const GAIT = { walk: 1.35 * UNIT, jog: 3.2 * UNIT, sprint: 5.6 * UNIT };

/**
 * makePerson(look, {bag, scale}) -> THREE.Group.
 *   .walk(dt, speed)  move the legs for a speed in units/second (0 = stand and breathe)
 *   .act(name)        play an action from ACTIONS ("sit", "eat", "phone"…) until walk() moves again
 *   .tick(dt)         advance the current action (for people who don't walk)
 * look = indexes into LOOK, as the server stores it.
 */
export function makePerson(look = {}, { bag = false, scale = 1.05, simple = false } = {}) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  root.userData.look = look;
  let impl = null;
  let simpleImpl = null;
  let realImpl = null;
  let wantReal = !simple && fullDetail;
  let wanted = { action: null, speed: 0 };

  const makeSimple = () => {
    const p = makeSimplePerson(look, { bag, scale: 1 });
    return {
      kind: "simple",
      show: (on) => (on ? root.add(p) : root.remove(p)),
      walk: (dt, sp) => p.walk(dt, sp),
      act: (name) => simplePose(p, name),
      tick: (dt) => p.walk(dt, 0),
    };
  };
  const swap = (next) => {
    if (impl === next) return;
    if (impl) impl.show(false);
    impl = next;
    impl.show(true);
    if (wanted.action) impl.act(wanted.action);
    if (root.userData.onSwap) root.userData.onSwap(root);
  };
  const choose = () => {
    if (wantReal && assets) {
      if (!realImpl) realImpl = buildReal(root, look, bag);
      swap(realImpl);
    } else {
      if (!simpleImpl) simpleImpl = makeSimple();
      swap(simpleImpl);
    }
  };
  choose();
  if (!assets && fullDetail && !simple) {
    waiting.push(choose);
    preloadPeople().catch(() => {});
  }

  root.walk = (dt, speed) => {
    wanted = { action: null, speed };
    impl.walk(dt, speed);
  };
  root.act = (name) => {
    wanted = { action: name, speed: 0 };
    impl.act(name);
  };
  root.tick = (dt) => impl.tick(dt);
  root.isReal = () => impl.kind === "real";
  /** Far-away people can drop to the light stand-in; near ones get the real body. */
  root.setDetail = (full) => {
    const next = Boolean(full) && fullDetail && !simple;
    if (next === wantReal) return;
    wantReal = next;
    choose();
  };
  root.userData.hip = HIP;
  return root;
}

/** The stand-in can only approximate the actions: sit and lie are the ones that matter. */
function simplePose(p, name) {
  const parts = p.userData.parts;
  if (!parts) return;
  const sit = name === "sit" || name === "sit_talk" || name === "drive";
  const lie = name === "lie";
  parts.legs.forEach((l) => (l.rotation.x = sit ? -Math.PI / 2 : 0));
  parts.knees.forEach((k) => (k.rotation.x = sit ? Math.PI / 2 : 0));
  // land the hips where the real body's hips are in the same pose
  if (sit) p.position.set(POSE.sit.x, POSE.sit.y - HIP, POSE.sit.z);
  else if (lie) p.position.set(POSE.lie.x, POSE.lie.y + 0.15, POSE.lie.z + HIP);
  else p.position.set(0, 0, 0);
  p.rotation.x = lie ? -Math.PI / 2 : 0;
  p.userData.blobHidden = sit || lie;
}

function buildReal(root, look, bag) {
  const female = (look.hall ?? 0) === 1;
  const A = female ? assets.f : assets.m;
  const skinHex = LOOK.skin[look.skin ?? 0] || LOOK.skin[0];
  const topHex = LOOK.top[look.top ?? 0] || LOOK.top[0];
  const bottomHex = LOOK.bottom[look.bottom ?? 0] || LOOK.bottom[0];
  const shoeHex = LOOK.shoes[look.shoes ?? ((look.top ?? 0) + (look.bottom ?? 0)) % LOOK.shoes.length] || LOOK.shoes[0];
  const hairHex = LOOK.hair_color[look.hair_color ?? 0] || LOOK.hair_color[0];
  const hair = LOOK.hair[look.hair ?? 0] || "low_cut";
  const skirt = LOOK.style[look.style ?? 0] === "skirt";
  const print = LOOK.print[look.print ?? 0] || "plain";

  const model = cloneSkinned(A.body.scene);
  model.scale.setScalar(UNIT);
  const bones = {};
  model.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
  });
  if (!female) {
    // the base body is a superhero build; a student is slimmer
    for (const [b, k] of [["upperarm_l", 0.86], ["upperarm_r", 0.86], ["thigh_l", 0.93], ["thigh_r", 0.93]]) {
      if (bones[b]) bones[b].scale.set(k, 1, k);
    }
  }
  let skeleton = null;
  const bodyMeshes = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh) {
      bodyMeshes.push(o);
      if (!skeleton) skeleton = o.skeleton;
    }
  });

  // trousers stop at the boot tops in the pack; below them the body's shins are painted as trouser
  const trouserBottom = skirt ? 0 : female ? 0.45 : 0.42;
  const shoeTop = 0.15;
  for (const m of bodyMeshes) {
    const name = m.material.name;
    if (name.startsWith("MI_Superhero")) {
      m.material = tint(m.material, skinHex, {
        kind: "body",
        a: [female ? 1.0 : 0.95, female ? 1.47 : 1.5, female ? 0.17 : 0.21, 0.34],
        b: [skirt ? 9 : trouserBottom + 0.03, skirt ? 9 : 1.0, female ? 0 : trouserBottom + 0.03, shoeTop - 0.03],
        paint: bottomHex,
      }, { roughness: 0.6 });
    } else if (name.startsWith("MI_Hair")) {
      m.material = tint(m.material, hairHex);
    }
    m.frustumCulled = false;
  }

  const attach = (part, material) => {
    for (const src of part.meshes) {
      const mesh = new THREE.SkinnedMesh(src.geometry, material);
      mesh.name = src.name;
      const mapped = src.skeleton.bones.map((b) => bones[realName(b.name)] || bones[b.name] || b);
      mesh.bind(new THREE.Skeleton(mapped, src.skeleton.boneInverses), src.bindMatrix);
      mesh.frustumCulled = false;
      model.add(mesh);
    }
  };
  const cloth = (part) => A[part].meshes[0].material;
  const printMap = print !== "plain" ? printTexture(print, topHex) : null;
  attach(A.top, tint(cloth("top"), printMap ? "#ffffff" : topHex, null, { map: printMap, roughness: 0.85 }));
  attach(A.sleeves, tint(cloth("sleeves"), printMap ? "#ffffff" : topHex, { kind: "sleeve", a: [0.37] }, { map: printMap, roughness: 0.85 }));
  if (!skirt) attach(A.legs, tint(cloth("legs"), bottomHex, null, { roughness: 0.9 }));
  attach(A.feet, tint(cloth("feet"), shoeHex, { kind: "shoe", a: [shoeTop] }, { roughness: 0.6 }));

  const hairMat = (part) => tint(A[part].meshes[0].material, hairHex);
  const pack = { low_cut: "hair_buzzed", afro: "hair_buzzed", dreads: "hair_buzzed", classic: "hair_parted", braids: "hair_long", long: "hair_long", bun: "hair_buns" }[hair];
  if (pack && A[pack]) attach(A[pack], hairMat(pack));
  if (!female && (look.beard ?? 0) === 1 && A.beard) attach(A.beard, hairMat("beard"));

  // rigid extras ride on bones; mount() gives a group lined up with the body, in metres
  model.updateMatrixWorld(true);
  const modelQ = model.getWorldQuaternion(new THREE.Quaternion());
  const mount = (bone, x, y, z) => {
    const g = new THREE.Group();
    const target = new THREE.Vector3(x, y, z).applyMatrix4(model.matrixWorld);
    g.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(modelQ));
    g.position.copy(bone.worldToLocal(target));
    g.scale.setScalar(UNIT / bone.getWorldScale(new THREE.Vector3()).x);
    bone.add(g);
    return g;
  };
  const top = female ? 1.77 : 1.81;
  const head = bones.Head;
  const hairSolid = mat(hairHex, { roughness: 1 });
  if (hair === "afro" && head) {
    mount(head, 0, top - 0.06, -0.05).add(new THREE.Mesh(afroGeo(), hairSolid));
  } else if (hair === "dreads" && head) {
    const g = mount(head, 0, top - 0.06, -0.015);
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * (0.05 + (0.9 * i) / 17) + Math.PI / 2;
      const s = new THREE.Mesh(strandGeo(0.2, 0.017), hairSolid);
      s.position.set(Math.cos(a) * 0.085, 0, -Math.abs(Math.sin(a)) * 0.085);
      s.rotation.set(-0.3 - (i % 3) * 0.05, 0, Math.cos(a) * 0.35);
      g.add(s);
    }
  }
  if (skirt && bones.pelvis && bones.thigh_l && bones.thigh_r) {
    // the skirt is skinned to the hips and thighs so it swings with each step instead of the legs poking through
    const sk = new THREE.SkinnedMesh(skirtGeo(), mat(bottomHex, { roughness: 0.85, side: THREE.DoubleSide }));
    sk.position.set(0, 1.0, -0.01);
    sk.frustumCulled = false;
    model.add(sk);
    model.updateMatrixWorld(true);
    sk.bind(new THREE.Skeleton([bones.pelvis, bones.thigh_l, bones.thigh_r]));
  }
  if (bag && bones.spine_03) {
    const color = ["#2f3b52", "#6b2e2e", "#3d5a3a", "#222222"][(look.top ?? 0) % 4];
    const g = mount(bones.spine_03, 0, 1.3, 0);
    const packMesh = new THREE.Mesh(bagGeo(), mat(color, { roughness: 0.85 }));
    packMesh.position.set(0, -0.04, female ? -0.17 : -0.19);
    g.add(packMesh);
    const strapMat = mat(new THREE.Color(color).multiplyScalar(0.7).getStyle(), { roughness: 0.8 });
    for (const side of [-1, 1]) {
      const st = new THREE.Mesh(extraGeo.strap, strapMat);
      st.position.set(side * 0.09, 0.07, female ? 0.118 : 0.128);
      st.rotation.set(-0.2, 0, side * 0.08);
      g.add(st);
      const over = new THREE.Mesh(extraGeo.strapTop, strapMat);
      over.position.set(side * 0.1, 0.205, -0.01);
      g.add(over);
    }
  }

  const shadow = blobShadow();

  // animation
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  const get = (name) => {
    const clipName = ACTIONS[name];
    if (!clipName || !assets.clips[female ? "f" : "m"][clipName]) return null;
    if (!actions[name]) {
      const a = mixer.clipAction(assets.clips[female ? "f" : "m"][clipName]);
      if (name === "lie" || ONE_SHOT[name]) {
        // gestures (a bite, a reach, a nod) play once; tick() rests between them like a real person would
        a.setLoop(THREE.LoopOnce);
        a.clampWhenFinished = true;
      }
      actions[name] = a;
    }
    return actions[name];
  };
  let current = null;
  let currentName = "";
  let gesture = null;
  const play = (name, fade = 0.25) => {
    if (name === currentName) return current;
    const next = get(name);
    if (!next) return current;
    next.reset().play();
    if (name === "lie") next.paused = true; // hold the lying-down frame
    if (current) next.crossFadeFrom(current, fade, false);
    current = next;
    currentName = name;
    return next;
  };
  // everyone breathes on their own clock
  const idle = play("idle", 0);
  if (idle) idle.time = Math.random() * idle.getClip().duration;
  mixer.update(0);

  return {
    kind: "real",
    walk(dt, speed) {
      gesture = null;
      const s = speed / (root.scale.x || 1);
      if (s < 0.3) {
        play("idle");
        if (current) current.timeScale = 1;
      } else {
        // pick the gait that matches the ground speed, and keep the legs close to their natural rhythm
        const gait = s < GAIT.walk * 1.45 ? "walk" : s < GAIT.jog * 1.35 ? "jog" : "sprint";
        play(gait, 0.3);
        const lim = { walk: [0.75, 1.2], jog: [0.85, 1.15], sprint: [0.9, 1.1] }[gait];
        current.timeScale = THREE.MathUtils.clamp(s / GAIT[gait], lim[0], lim[1]);
      }
      mixer.update(dt);
    },
    act(name) {
      const shot = ONE_SHOT[name];
      gesture = shot ? { name, shot, wait: 0, playing: true } : null;
      play(name, 0.45);
      if (current) {
        current.timeScale = shot ? shot.speed : CALM[name] || 1;
        if (shot) current.reset().play();
      }
      if (name === "lie" || name.startsWith("sit") || name === "drive") shadow.visible = false;
      else shadow.visible = true;
    },
    tick(dt) {
      if (gesture) {
        const g = gesture;
        if (g.playing) {
          const a = actions[g.name];
          if (!a || !a.isRunning() || a.time >= a.getClip().duration - 0.02) {
            // done: settle into the rest pose for a few seconds
            g.playing = false;
            g.wait = g.shot.gap[0] + Math.random() * (g.shot.gap[1] - g.shot.gap[0]);
            play(g.shot.rest, 0.6);
            if (current) current.timeScale = CALM[g.shot.rest] || 1;
          }
        } else if ((g.wait -= dt) <= 0) {
          g.playing = true;
          const a = get(g.name);
          if (a) {
            currentName = "";
            play(g.name, 0.5);
            a.reset().play();
            a.timeScale = g.shot.speed;
          }
        }
      }
      mixer.update(dt);
    },
    show(on) {
      if (on) root.add(model, shadow);
      else root.remove(model, shadow);
    },
  };
}

/**
 * Where the hips are in the sitting and lying poses, relative to the person's own origin (scale 1).
 * Callers put a pivot at the spot the hips should be and offset the person by minus these.
 */
export const POSE = { sit: new THREE.Vector3(-0.185, 1.054, -0.618), lie: new THREE.Vector3(-0.132, 0.085, -0.446) };

/** Seat a person (made by makePerson) so their hips land on the parent's origin. */
export function seat(person, how = "sit") {
  person.act(how);
  const k = person.scale.x;
  const at = how === "lie" ? POSE.lie : POSE.sit;
  person.position.set(-at.x * k, -at.y * k, -at.z * k);
}
