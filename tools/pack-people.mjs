// Pack the CC0 Quaternius characters into small game-ready GLBs.
// Run from a folder with the Quaternius CC0 packs in ../qt/ (see frontend/public/models/CREDITS.txt):
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions sharp && node pack-people.mjs <out dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, dedup, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions';
import sharp from 'sharp';
const Q = '../qt/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const OUT = process.argv[2];

async function pack(sex) {
  const S = sex === 'm' ? 'Male' : 'Female';
  const parts = [
    ['body', `base/Superhero_${S}_FullBody.gltf`],
    ['top', `parts/${S}_Peasant_Body.gltf`],
    ['sleeves', `parts/${S}_Peasant_Arms.gltf`],
    ['legs', `parts/${S}_Peasant_Legs.gltf`],
    ['feet', `parts/${S}_Peasant_Feet.gltf`],
    ['hair_buzzed', sex === 'm' ? 'hair/Hair_Buzzed.gltf' : 'hair/Hair_BuzzedFemale.gltf'],
    ['hair_parted', 'hair/Hair_SimpleParted.gltf'],
    ['hair_long', 'hair/Hair_Long.gltf'],
    ['hair_buns', 'hair/Hair_Buns.gltf'],
  ];
  if (sex === 'm') parts.push(['beard', 'hair/Hair_Beard.gltf']);
  const doc = await io.read(Q + parts[0][1]);
  doc.getRoot().listScenes()[0].setName('body');
  for (const [name, file] of parts.slice(1)) {
    const other = await io.read(Q + file);
    other.getRoot().listScenes()[0].setName(name);
    mergeDocuments(doc, other);
  }
  const root = doc.getRoot();
  for (const an of root.listAnimations()) { an.listChannels().forEach((c) => c.dispose()); an.listSamplers().forEach((x) => x.dispose()); an.dispose(); }
  // the outfit's own hands are dropped: the body supplies bare hands
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    if (p.getMaterial()?.getName() === 'MI_Regular_Male') { mesh.removePrimitive(p); p.dispose(); }
  }
  for (const m of root.listMaterials()) {
    const n = m.getName();
    m.setMetallicFactor(0).setMetallicRoughnessTexture(null);
    if (n === 'MI_Peasant') { m.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85); }
    else if (n.startsWith('MI_Hair')) { m.setAlphaMode('MASK').setAlphaCutoff(0.4).setRoughnessFactor(0.7); }
    else if (n.startsWith('MI_Superhero')) { m.setRoughnessFactor(0.55); }
    else m.setRoughnessFactor(0.3);
  }
  // only one copy of each scene's armature is needed at runtime, but they are tiny; keep them for binding by name
  await doc.transform(dedup(), prune({ keepLeaves: true }));
  // textures: skin 2048 (faces need it), skin normals 1024, hair 512, eyes 256
  for (const t of root.listTextures()) {
    const users = t.listParents().filter((p) => p.propertyType === 'Material');
    const mats = users.map((m) => m.getName());
    const isNormal = users.some((m) => m.getNormalTexture() === t);
    const skin = mats.some((n) => n.startsWith('MI_Superhero'));
    let size = 512;
    if (skin) size = isNormal ? 1024 : 2048;
    if (mats.includes('MI_Eyes')) size = 256;
    let img = sharp(t.getImage()).resize(size, size);
    if (skin && !isNormal) {
      // Skin becomes a "ratio map": each texel says how much lighter/darker/redder than the face's own base tone
      // it is (stored at half scale). The game multiplies a real skin tone by 2x this, so lips, cheeks, the nose,
      // creases and stubble keep their colour and shading on every skin tone instead of being washed out.
      const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const lin = (v) => Math.pow(v / 255, 2.2);
      const W = info.width;
      const sample = [[], [], []];
      for (let y = Math.floor(W * 0.11); y < W * 0.2; y += 2) for (let x = Math.floor(W * 0.08); x < W * 0.3; x += 2) {
        const o = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) sample[c].push(lin(data[o + c]));
      }
      const base = sample.map((a) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)]);
      const baseLum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2];
      const out = Buffer.alloc(data.length);
      for (let i = 0; i < data.length; i += 3) {
        const l = [lin(data[i]), lin(data[i + 1]), lin(data[i + 2])];
        const lumRatio = (0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]) / baseLum;
        for (let c = 0; c < 3; c++) {
          const r = 0.4 * lumRatio + 0.6 * (l[c] / base[c]);
          out[i + c] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, r * 0.5)), 1 / 2.2));
        }
      }
      img = sharp(out, { raw: { width: W, height: info.height, channels: 3 } });
      console.log(sex, 'skin base', base.map((v) => Math.round(255 * Math.pow(v, 1 / 2.2))));
    }
    t.setImage(await img.webp({ quality: isNormal ? 85 : skin ? 84 : 80 }).toBuffer()).setMimeType('image/webp');
  }
  const live = new Set();
  for (const me of root.listMeshes()) for (const p of me.listPrimitives()) { p.listAttributes().forEach((a) => live.add(a)); live.add(p.getIndices()); }
  for (const sk of root.listSkins()) live.add(sk.getInverseBindMatrices());
  for (const a of root.listAccessors()) if (!live.has(a)) a.dispose();
  await doc.transform(prune(), unpartition());
  await io.write(`${OUT}/person-${sex}.glb`, doc);
}

async function anims() {
  const keepA = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Idle_Talking_Loop',
    'Dance_Loop', 'Driving_Loop', 'Interact', 'PickUp_Table', 'Crouch_Idle_Loop', 'Fixing_Kneeling', 'Push_Loop', 'Jump_Start'];
  const keepB = ['Consume', 'Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Yes', 'Idle_No_Loop', 'LayToIdle', 'Walk_Carry_Loop', 'Farm_Watering'];
  const doc = await io.read(Q + 'gaits.glb');
  const other = await io.read(Q + 'animations.glb');
  for (const [d, keep] of [[doc, keepA], [other, keepB]]) {
    for (const a of d.getRoot().listAnimations()) if (!keep.includes(a.getName())) a.dispose();
    for (const m of d.getRoot().listMeshes()) m.dispose();
    for (const a of d.getRoot().listAnimations()) for (const c of a.listChannels()) {
      // keep only rotations, plus the pelvis height/sway: bone lengths come from each body
      const node = c.getTargetNode(); const path = c.getTargetPath();
      if (path === 'scale' || (path === 'translation' && node.getName() !== 'pelvis')) { const s = c.getSampler(); c.dispose(); s.dispose(); }
    }
  }
  mergeDocuments(doc, other);
  await doc.transform(resample({ tolerance: 0.0005 }), dedup());
  const live = new Set();
  for (const an of doc.getRoot().listAnimations()) for (const sm of an.listSamplers()) { live.add(sm.getInput()); live.add(sm.getOutput()); }
  for (const sk of doc.getRoot().listSkins()) live.add(sk.getInverseBindMatrices());
  for (const a of doc.getRoot().listAccessors()) if (!live.has(a)) a.dispose();
  await doc.transform(prune(), unpartition());
  console.log('clips', doc.getRoot().listAnimations().map((a) => a.getName()).join(','));
  await io.write(`${OUT}/person-anims.glb`, doc);
}
await pack('m'); await pack('f'); await anims();
