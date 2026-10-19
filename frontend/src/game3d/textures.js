// Textures drawn on a canvas at runtime: no image downloads, which matters on Nigerian data plans.
import * as THREE from "three";

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function texture(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

/** A painted sign board: dark green with cream letters, like campus signage. */
export function signTexture(text, { bg = "#14402c", fg = "#f6efd9", border = "#f2c230", width = 1024 } = {}) {
  const key = `sign:${text}:${bg}:${fg}:${width}`;
  if (cache.has(key)) return cache.get(key);
  const h = 160;
  const [c, g] = canvas(width, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, width, h);
  g.strokeStyle = border;
  g.lineWidth = 10;
  g.strokeRect(8, 8, width - 16, h - 16);
  g.fillStyle = fg;
  let size = 84;
  g.font = `800 ${size}px "Bricolage Grotesque Variable", "Figtree Variable", sans-serif`;
  while (g.measureText(text).width > width - 60 && size > 30) {
    size -= 4;
    g.font = `800 ${size}px "Bricolage Grotesque Variable", "Figtree Variable", sans-serif`;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, width / 2, h / 2 + 4);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(key, t);
  return t;
}

/** Floating name label above a building. */
export function labelTexture(text) {
  const key = `label:${text}`;
  if (cache.has(key)) return cache.get(key);
  const [m, mg] = canvas(8, 8);
  mg.font = '700 44px "Figtree Variable", sans-serif';
  const w = Math.ceil(mg.measureText(text).width) + 56;
  m.width = 1;
  const [c, g] = canvas(w, 76);
  g.fillStyle = "rgba(16, 32, 24, 0.82)";
  const r = 36;
  g.beginPath();
  g.roundRect(0, 0, w, 76, r);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = '700 44px "Figtree Variable", sans-serif';
  g.textBaseline = "middle";
  g.fillText(text, 28, 40);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.userData = { aspect: w / 76 };
  cache.set(key, t);
  return t;
}

/** Walls with rows of windows. Lit windows glow at night via an emissive map. */
export function facadeTextures(wall, { floors = 4, cols = 6, window = "#2c3e46", lit = "#ffd27a", frame = "#f4efe4" } = {}) {
  const key = `facade:${wall}:${floors}:${cols}`;
  if (cache.has(key)) return cache.get(key);
  const W = 512;
  const Hh = 512;
  const [c, g] = canvas(W, Hh);
  const [e, eg] = canvas(W, Hh);
  let seed = wall.length * 7 + floors * 13 + cols;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  // painted plaster with uneven tone
  g.fillStyle = wall;
  g.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = rand() < 0.5 ? "rgba(0,0,0,0.035)" : "rgba(255,255,255,0.05)";
    const sz = 1 + rand() * 4;
    g.fillRect(rand() * W, rand() * Hh, sz, sz);
  }
  eg.fillStyle = "#000";
  eg.fillRect(0, 0, W, Hh);
  const cw = W / cols;
  const fh = Hh / floors;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < cols; i++) {
      const x = i * cw + cw * 0.2;
      const y = f * fh + fh * 0.22;
      const ww = cw * 0.6;
      const wh = fh * 0.5;
      // rain streaks under each window: every building in Ife has them
      const streak = g.createLinearGradient(0, y + wh, 0, y + wh + fh * 0.5);
      streak.addColorStop(0, "rgba(40,30,20,0.22)");
      streak.addColorStop(1, "rgba(40,30,20,0)");
      g.fillStyle = streak;
      g.fillRect(x + ww * 0.1, y + wh, ww * 0.8, fh * 0.5);
      // frame and glass
      g.fillStyle = frame;
      g.fillRect(x - 4, y - 4, ww + 8, wh + 8);
      const glass = g.createLinearGradient(x, y, x + ww, y + wh);
      glass.addColorStop(0, window);
      glass.addColorStop(1, "#4d6470");
      g.fillStyle = glass;
      g.fillRect(x, y, ww, wh);
      // louvre blades
      g.fillStyle = "rgba(255,255,255,0.16)";
      for (let l = 1; l < 7; l++) g.fillRect(x, y + (wh * l) / 7, ww, 1.5);
      // burglar-proof bars
      g.fillStyle = "rgba(30,30,30,0.75)";
      for (let bx = 1; bx < 5; bx++) g.fillRect(x + (ww * bx) / 5 - 1, y, 2.5, wh);
      g.fillRect(x, y + wh / 2 - 1, ww, 2.5);
      // sill
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x - 6, y + wh + 4, ww + 12, 4);
      // the odd air conditioner or curtain
      if (rand() < 0.12) {
        g.fillStyle = "#e9e9e6";
        g.fillRect(x + ww * 0.55, y + wh - wh * 0.3, ww * 0.42, wh * 0.28);
        g.fillStyle = "#b9bcbd";
        for (let k = 0; k < 4; k++) g.fillRect(x + ww * 0.57, y + wh - wh * 0.27 + k * 4, ww * 0.38, 1.5);
      } else if (rand() < 0.3) {
        g.fillStyle = ["#b03a2e", "#2f5f9e", "#f2c230", "#1f6f4a"][Math.floor(rand() * 4)];
        g.globalAlpha = 0.55;
        g.fillRect(x, y, ww * 0.3, wh);
        g.globalAlpha = 1;
      }
      if (rand() < 0.55) {
        eg.fillStyle = lit;
        eg.fillRect(x, y, ww, wh);
      }
    }
    // floor slab band
    g.fillStyle = "rgba(0,0,0,0.1)";
    g.fillRect(0, (f + 1) * fh - 5, W, 5);
  }
  // red-earth splash at the foot of the wall
  const grad = g.createLinearGradient(0, Hh * 0.85, 0, Hh);
  grad.addColorStop(0, "rgba(150,70,30,0)");
  grad.addColorStop(1, "rgba(150,70,30,0.35)");
  g.fillStyle = grad;
  g.fillRect(0, Hh * 0.85, W, Hh * 0.15);
  const map = texture(c);
  const emissive = texture(e);
  const out = { map, emissive };
  cache.set(key, out);
  return out;
}

export function grassTexture() {
  if (cache.has("grass")) return cache.get("grass");
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = "#6b9440";
  g.fillRect(0, 0, S, S);
  // big soft patches of greener and drier grass
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 30 + Math.random() * 90;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = Math.random();
    grad.addColorStop(0, tone < 0.4 ? "rgba(70,110,40,0.5)" : tone < 0.75 ? "rgba(150,160,70,0.35)" : "rgba(160,90,50,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // blades
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const shade = Math.random();
    g.strokeStyle = shade < 0.33 ? "rgba(60,95,35,0.6)" : shade < 0.66 ? "rgba(130,170,80,0.55)" : "rgba(150,150,80,0.45)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4);
    g.stroke();
  }
  const t = texture(c, { repeat: [60, 60] });
  cache.set("grass", t);
  return t;
}

export function roadTexture() {
  if (cache.has("road")) return cache.get("road");
  const [c, g] = canvas(64, 256);
  g.fillStyle = "#4a4d50";
  g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = Math.random() < 0.5 ? "#55585b" : "#404245";
    g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  }
  // edges and dashed centre line
  g.fillStyle = "#d9d4c4";
  g.fillRect(2, 0, 3, 256);
  g.fillRect(59, 0, 3, 256);
  g.fillStyle = "#f2c230";
  for (let y = 0; y < 256; y += 64) g.fillRect(30, y, 4, 34);
  const t = texture(c);
  cache.set("road", t);
  return t;
}

export function paveTexture() {
  if (cache.has("pave")) return cache.get("pave");
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#c9c2b0";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#ada694";
  g.lineWidth = 2;
  for (let y = 0; y < 128; y += 16) {
    for (let x = (y / 16) % 2 ? 0 : 16; x < 128; x += 32) {
      g.strokeRect(x, y, 32, 16);
    }
  }
  const t = texture(c, { repeat: [1, 1] });
  cache.set("pave", t);
  return t;
}
