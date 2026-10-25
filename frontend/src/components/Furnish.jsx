import { useEffect, useMemo, useState } from "react";
import { naira } from "../lib/format";
import { sfx } from "../lib/sfx";

/** The 🛋 tab: buy things for your home, by category, from a foam topper to a solar setup. */
export default function Furnish({ game, onBuy, onSell, onHousing, busy }) {
  const f = game.furnish;
  const [cat, setCat] = useState(() => f?.categories?.[0]?.id || "sleep");
  const [confirm, setConfirm] = useState(null);
  useEffect(() => {
    if (!confirm) return undefined;
    const id = setTimeout(() => setConfirm(null), 3500);
    return () => clearTimeout(id);
  }, [confirm]);

  const items = useMemo(() => {
    if (!f) return [];
    const list = f.items.filter((i) => i.cat === cat);
    // group by slot (all mattresses together), cheapest first
    const order = [];
    for (const i of list) if (!order.includes(i.slot)) order.push(i.slot);
    return list.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || a.price - b.price);
  }, [f, cat]);
  if (!f) return null;

  const category = f.categories.find((c) => c.id === cat);
  const [cosy, dream] = f.levels;
  const goal = f.comfort >= cosy.points ? dream : cosy;
  const pct = Math.min(100, Math.round((100 * f.comfort) / dream.points));
  const money = game.total_money ?? game.money;
  const hall = f.rank === 0;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-ink p-3 text-white">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold">{game.home_name}</p>
          <p className="num text-sm">{naira(money)}</p>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span aria-hidden>🛋</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/15" role="meter" aria-valuenow={f.comfort}
            aria-valuemin={0} aria-valuemax={dream.points} aria-label="Comfort">
            <span className="block h-full rounded-full bg-[#f2c230]" style={{ width: `${pct}%` }} />
          </span>
          <span className="num font-bold">{f.comfort}</span>
        </div>
        <p className="mt-1 text-[11px] opacity-80">
          {f.comfort >= dream.points ? `${dream.name}: the best mood boost at home.`
            : `Comfort ${f.comfort} of ${goal.points} for "${goal.name}", a mood boost whenever you're home.`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-white/10 px-2 py-0.5">{f.light ? "💡 Light on" : "🕯 No light"}{f.backup ? ` · ${f.backup}` : ""}</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">⚡ Bills {naira(f.bills)}/week</span>
        </div>
      </section>

      {hall && (
        <button onClick={onHousing} className="w-full rounded-2xl bg-[#fff4d6] p-3 text-left text-xs text-ink">
          <b>You live in a hall.</b> There's room for small things like a foam topper, a lamp or a rechargeable fan.
          For a TV, PS5, generator or a real bed, move off campus. <span className="font-bold text-ife-700 underline">See houses</span>
        </button>
      )}
      {f.stored.length > 0 && (
        <p className="rounded-2xl bg-slab p-3 text-xs">📦 In storage (too big for this place): {f.stored.join(", ")}.</p>
      )}

      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Categories">
        {f.categories.map((c) => {
          const owned = f.items.filter((i) => i.cat === c.id && i.owned).length;
          return (
            <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-bold ${cat === c.id ? "bg-ife-600 text-white" : "bg-concrete"}`}>
              <span aria-hidden>{c.emoji}</span>
              {c.name}
              {owned > 0 && <span className={`rounded-full px-1.5 text-[10px] ${cat === c.id ? "bg-white/25" : "bg-white"}`}>{owned}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">{category?.blurb}</p>

      <ul className="space-y-2">
        {items.map((it) => {
          const asking = confirm === it.id;
          const short = it.pay > money;
          return (
            <li key={it.id} className={`rounded-2xl border p-3 ${it.owned ? "border-ife-600 bg-[#eaf6ef]" : "border-transparent bg-slab"} ${!it.fits ? "opacity-60" : ""}`}>
              <div className="flex gap-3">
                <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white text-3xl shadow-sm">{it.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold leading-tight">{it.name}</p>
                    <p className="num shrink-0 text-sm font-black">{naira(it.price)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{it.blurb}</p>
                </div>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1">
                {it.perks.map((p) => (
                  <li key={p} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ife-700">{p}</li>
                ))}
                {it.power && <li className="rounded-full bg-white px-2 py-0.5 text-[11px] text-muted">Needs light{it.bill ? ` · ${naira(it.bill)}/week` : ""}</li>}
              </ul>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted">
                  {!it.fits ? `Needs ${it.fit_name} or bigger`
                    : it.owned ? "In your home"
                      : it.replaces ? `Replaces your ${it.replaces.toLowerCase()} (−${naira(it.trade_in)} trade-in)` : ""}
                </p>
                {it.owned ? (
                  <button disabled={busy} onClick={() => (asking ? (setConfirm(null), onSell(it.id)) : setConfirm(it.id))}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-danger">
                    {asking ? `Sell for ${naira(it.sell)}?` : "✓ Owned · Sell"}
                  </button>
                ) : (
                  <button disabled={busy || !it.fits || short}
                    onClick={() => {
                      if (!asking) return setConfirm(it.id);
                      setConfirm(null);
                      sfx("cash");
                      onBuy(it.id);
                    }}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold text-white disabled:bg-chip disabled:text-muted ${asking ? "bg-[#c47f00]" : "bg-ife-600"}`}>
                    {!it.fits ? "🔒" : short ? "Not enough money"
                      : it.pay < 0 ? (asking ? `Swap, get ${naira(-it.pay)}` : `Swap · +${naira(-it.pay)} back`)
                        : asking ? `Pay ${naira(it.pay)}` : it.replaces ? `Upgrade · ${naira(it.pay)}` : "Buy"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
