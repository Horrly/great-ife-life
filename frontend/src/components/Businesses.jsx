import { useState } from "react";
import { naira } from "../lib/format";

const TABS = [["campus", "On campus"], ["off", "Off campus"], ["mine", "Mine"]];

/** The Businesses app: start a shop on campus or in town with your capital, takings land every evening. */
export default function Businesses({ game, onAct, busy }) {
  const shops = game.shops || [];
  const cats = game.biz_cats || {};
  const [tab, setTab] = useState("campus");
  const mine = shops.filter((s) => s.owned);
  const list = tab === "mine" ? mine : shops.filter((s) => s.place === tab);
  const promos = (game.phone || []).filter((a) => a.id.startsWith("promo_"));

  return (
    <div className="space-y-3 p-3">
      <section className="rounded-2xl bg-ink p-3 text-white">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold">Businesses</p>
          <p className="num text-sm">{naira(game.total_money ?? game.money)}</p>
        </div>
        <p className="mt-1 text-[11px] opacity-80">
          Put your capital in once. Takings come in every evening at {game.payout_at || "8:00 PM"}; off-campus shops pay rent first.
          You've earned {naira(game.business_income || 0)} from businesses so far.
        </p>
      </section>

      <div role="tablist" aria-label="Where" className="flex gap-1.5">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-1 rounded-full px-3 py-2 text-sm font-bold ${tab === id ? "bg-ife-600 text-white" : "bg-concrete"}`}>
            {label}{id === "mine" && mine.length ? ` (${mine.length})` : ""}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        {tab === "campus" && "Market, halls, SUB and Ojaja. Small capital, small takings, no rent."}
        {tab === "off" && "Shops in Ife town. Big capital and big takings, but rent comes out every evening."}
        {tab === "mine" && (mine.length ? "Your businesses. You can sell one back for 60% of what you paid." : "No business yet. Start one on campus with a small capital, or open a shop in town.")}
      </p>

      <ul className="space-y-2">
        {list.map((s) => {
          const emoji = cats[s.cat]?.emoji || "🏪";
          const cat = cats[s.cat]?.name || "";
          const act = s.owned ? s.sell : s.start;
          const reason = act && !act.enabled ? act.reason : null;
          return (
            <li key={s.id} className={`rounded-2xl border p-3 ${s.owned ? "border-ife-600 bg-[#eaf6ef]" : "border-transparent bg-slab"}`}>
              <div className="flex gap-3">
                <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-2xl shadow-sm">{emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-tight">{s.name}</p>
                  <p className="text-[11px] text-muted">{cat} · {s.place === "off" ? "Off campus" : "On campus"}</p>
                  <p className="mt-1 text-xs text-muted">{s.blurb}</p>
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-1 text-center text-[11px]">
                <div className="rounded-lg bg-white px-1 py-1.5"><dt className="text-muted">Capital</dt><dd className="num font-black">{naira(s.capital)}</dd></div>
                <div className="rounded-lg bg-white px-1 py-1.5"><dt className="text-muted">Each evening</dt><dd className="num font-black">{naira(s.income[0])}–{naira(s.income[1]).replace("₦", "")}</dd></div>
                <div className="rounded-lg bg-white px-1 py-1.5"><dt className="text-muted">{s.rent ? "Rent" : "Bad days"}</dt><dd className="num font-black">{s.rent ? `${naira(s.rent)}/eve` : `${s.bad_chance}%`}</dd></div>
              </dl>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-danger">{reason || ""}</p>
                {s.owned ? (
                  <button disabled={busy || !act?.enabled} onClick={() => onAct(act)}
                    className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-danger disabled:opacity-50">
                    Sell for {naira(s.sell_back)}
                  </button>
                ) : (
                  <button disabled={busy || !act?.enabled} onClick={() => onAct(act)}
                    className="shrink-0 rounded-full bg-ife-600 px-4 py-2 text-sm font-bold text-white disabled:bg-chip disabled:text-muted">
                    Start for {naira(s.capital)}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {tab === "mine" && mine.length > 0 && promos.length > 0 && (
        <section className="rounded-2xl bg-white p-3 text-ink">
          <p className="text-sm font-bold">Push your businesses</p>
          <ul className="mt-2 space-y-1.5">
            {promos.map((a) => (
              <li key={a.id}>
                <button disabled={busy || !a.enabled} onClick={() => onAct(a)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl bg-slab px-3 py-2 text-left text-sm disabled:opacity-50">
                  <span className="min-w-0">
                    <span className="block font-bold">{a.label}</span>
                    <span className="block text-[11px] text-muted">{a.enabled ? a.blurb : a.reason}</span>
                  </span>
                  <span className="num shrink-0 font-black">{naira(a.cost)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
