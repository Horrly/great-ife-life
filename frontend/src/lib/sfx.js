// Tiny sound effects made in the browser (no audio files to download) and a short buzz on phones.
// Sound is on by default and can be turned off in the status drawer.
let ctx = null;
const KEY = "gil.sound";

export function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

function tone(freq, start, length, { type = "sine", gain = 0.08, to } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + start + length);
  g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + length);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + length + 0.02);
}

const SOUNDS = {
  tap: () => tone(520, 0, 0.06, { gain: 0.04, type: "triangle" }),
  open: () => tone(380, 0, 0.12, { to: 620, gain: 0.05 }),
  cash: () => {
    tone(1320, 0, 0.08, { type: "square", gain: 0.03 });
    tone(1760, 0.07, 0.16, { type: "square", gain: 0.03 });
  },
  notice: () => {
    tone(660, 0, 0.1, { gain: 0.05 });
    tone(880, 0.1, 0.14, { gain: 0.05 });
  },
  error: () => tone(220, 0, 0.18, { type: "sawtooth", gain: 0.035, to: 160 }),
  levelup: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.09, 0.16, { type: "triangle", gain: 0.06 })),
  wish: () => [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, { gain: 0.04 })),
  roll: () => tone(300, 0, 0.04, { type: "square", gain: 0.02 }),
  horn: () => {
    tone(392, 0, 0.18, { type: "square", gain: 0.04 });
    tone(392, 0.24, 0.3, { type: "square", gain: 0.04 });
  },
};

const BUZZ = { tap: 8, cash: [30, 40, 30], notice: [60, 80, 60], error: 40, levelup: [60, 80, 60] };

/** Play a sound (and buzz on phones that can). Never throws: sound is a nice-to-have. */
export function sfx(name) {
  if (!soundOn()) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    SOUNDS[name]?.();
    if (BUZZ[name] && navigator.vibrate) navigator.vibrate(BUZZ[name]);
  } catch {
    /* no audio here */
  }
}

/** Which sound a server message deserves. */
export function soundFor(text) {
  if (/credit alert|\+₦|sent ₦|paid you|landed|bonus|odds landed|counted out/i.test(text)) return "cash";
  if (/level up|badge unlocked|mission done|streak/i.test(text)) return "levelup";
  if (/getting low|collapsed|missed|lost|stolen|took ₦|bet cut/i.test(text)) return "error";
  return "notice";
}
