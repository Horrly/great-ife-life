export const naira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString("en-NG")}`;

export const NEED_LABELS = { hunger: "Food", energy: "Energy", hygiene: "Hygiene", fun: "Fun", social: "Social", prep: "Readiness" };

/** "+12 Readiness", "−₦900": short chips showing what an action does. */
export function effectChips(action) {
  const chips = [];
  if (action.earn) chips.push({ text: `+${naira(action.earn)}`, tone: "good" });
  if (action.cost) chips.push({ text: `−${naira(action.cost)}`, tone: "cost" });
  for (const [key, value] of Object.entries(action.effects || {})) {
    if (!value || !NEED_LABELS[key]) continue;
    chips.push({ text: `${value > 0 ? "+" : "−"}${Math.abs(value)} ${NEED_LABELS[key]}`, tone: value > 0 ? "good" : "bad" });
  }
  return chips;
}

export function needTone(value) {
  if (value < 20) return "critical";
  if (value < 40) return "low";
  return "ok";
}

export function shareText(card, url) {
  const who = card.name === "A Great Ife student" ? "I" : card.name;
  return `${who} just graduated from Great Ife Life with ${card.class} (${card.cgpa.toFixed(2)}) as a ${card.profile} in ${card.department}. Beat that: ${url}`;
}

export function whatsapp(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function tweet(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}

/** Game minutes after midnight -> "8:05 AM". */
export function clockText(minutes) {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** 135 -> "2 hr 15 min" */
export function duration(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr${h > 1 ? "s" : ""}`;
}
