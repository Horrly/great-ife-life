// How a student can look (the server stores indexes into these lists), and the shared material helpers.
// New options are only ever added at the end of a list, so old saves keep their look.
import * as THREE from "three";

export const LOOK = {
  skin: ["#8d5524", "#a86b3c", "#6b3e1f", "#c68642", "#4a2a14", "#3b2210", "#e0ac69", "#5c3a21"],
  hair: ["low_cut", "afro", "braids", "bun", "dreads", "bald", "classic", "long"],
  top: ["#1f6f4a", "#b03a2e", "#f2c230", "#2f5f9e", "#f4f4f2", "#222222", "#7a3e9d", "#e07b39", "#8fb8de"],
  bottom: ["#26324a", "#3b3b3b", "#6b4f2a", "#e8e2d4", "#1f6f4a", "#4a6fa5"],
  style: ["trousers", "skirt"],
  hall: ["male", "female"],
  hair_color: ["#141010", "#3b2314", "#6b4226", "#7a1f2b", "#c9a227", "#4b2a6b"],
  print: ["plain", "ankara", "adire", "aso_oke"],
  beard: ["none", "beard"],
  shoes: ["#f2f2ee", "#1c1c1c", "#6b4a2a", "#2f5f9e", "#b03a2e"],
};

export const HAIR_NAMES = {
  low_cut: "Low cut", afro: "Afro", braids: "Braids", bun: "Bun", dreads: "Dreads", bald: "Clean shave",
  classic: "Classic", long: "Long",
};
export const PRINT_NAMES = { plain: "Plain", ankara: "Ankara", adire: "Adire", aso_oke: "Aso-oke" };

export function randomLook(rand = Math.random) {
  const pick = (arr) => Math.floor(rand() * arr.length);
  const look = {};
  for (const [k, v] of Object.entries(LOOK)) look[k] = pick(v);
  // most people dress plain, dark hair is the norm, and beards are for some of the guys
  if (rand() < 0.65) look.print = 0;
  if (rand() < 0.8) look.hair_color = rand() < 0.7 ? 0 : 1;
  if (look.hall === 1) look.beard = 0;
  else if (rand() < 0.6) look.beard = 0;
  if (look.hall === 0 && rand() < 0.85) look.style = 0;
  return look;
}

const materials = new Map();
let HIGH = true;
/** Realistic (physically based) materials on capable devices; cheaper ones on old phones. */
export function setQuality(high) {
  HIGH = Boolean(high);
}
export function isHighQuality() {
  return HIGH;
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
