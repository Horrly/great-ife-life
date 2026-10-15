import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountForm from "../components/AccountForm";
import { EventDialog, ResultSlip, Sheet } from "../components/Dialogs";
import { BadgesButton, Businesses, Skills } from "../components/Progress";
import { Academics, Money, Needs, TimeBand } from "../components/Status";
import { save } from "../lib/api";
import { effectChips } from "../lib/format";
import { useGame } from "../lib/game";

const CHIP = {
  good: "bg-ife-50 text-ife-700",
  bad: "bg-concrete text-muted",
  cost: "bg-bulb-soft text-ink",
};

function ActionRow({ action, onAct, busy }) {
  const chips = effectChips(action);
  return (
    <li>
      <button
        onClick={() => onAct(action.id)}
        disabled={busy || !action.enabled}
        className="group w-full rounded-lg border border-line bg-white px-4 py-3 text-left transition-colors hover:border-ife-500 disabled:cursor-not-allowed disabled:bg-slab disabled:hover:border-line"
      >
        <span className="flex items-start justify-between gap-3">
          <span className={`font-bold ${action.enabled ? "text-ink" : "text-muted"}`}>{action.label}</span>
          {action.hustle && action.enabled && <span className="shrink-0 rounded bg-bulb px-1.5 py-0.5 text-[0.7rem] font-bold">Hustle</span>}
          {action.locked && <span className="shrink-0 rounded bg-concrete px-1.5 py-0.5 text-[0.7rem] font-bold text-muted">Locked</span>}
        </span>
        <span className="mt-0.5 block text-sm text-muted">{action.enabled ? action.blurb : action.reason}</span>
        {action.enabled && (chips.length > 0 || action.xp > 0) && (
          <span className="mt-2 flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c.text} className={`rounded px-1.5 py-0.5 text-xs font-bold ${CHIP[c.tone]}`}>
                {c.text}
              </span>
            ))}
            {action.xp > 0 && (
              <span className="rounded bg-bulb-soft px-1.5 py-0.5 text-xs font-bold text-ink">
                +{action.xp} {action.skill} XP
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

function Places({ places, onAct, busy }) {
  const [selected, setSelected] = useState(places[0]?.id);
  const current = places.find((p) => p.id === selected) || places[0];
  return (
    <section aria-labelledby="where-h">
      <h2 id="where-h" className="sr-only">
        Where to go
      </h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:overflow-visible md:px-0" role="tablist" aria-label="Places">
        <div className="flex min-w-max gap-1.5 md:min-w-0 md:flex-wrap">
          {places.map((p) => {
            const open = p.actions.filter((a) => a.enabled).length;
            const active = p.id === current.id;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(p.id)}
                className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                  active ? "bg-ife-600 text-white" : open ? "bg-slab text-ink hover:bg-white" : "bg-slab/60 text-muted"
                }`}
              >
                {p.name}
                {open > 0 && !active && <span className="ml-1.5 text-xs text-ife-600">{open}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3" role="tabpanel" aria-label={current.name}>
        <p className="text-sm text-muted">{current.blurb}</p>
        <ul className="mt-3 space-y-2">
          {[...current.actions].sort((a, b) => b.enabled - a.enabled).map((a) => (
            <ActionRow key={a.id} action={a} onAct={onAct} busy={busy} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ForcedCard({ action, onAct, busy }) {
  return (
    <section className="reveal rounded-xl bg-ife-900 p-6 text-white" aria-live="polite">
      <p className="text-sm font-bold text-bulb">This morning</p>
      <h2 className="display mt-1 text-5xl font-black">{action.label}</h2>
      <p className="mt-2 text-ife-100">{action.blurb}</p>
      <button className="btn-bulb mt-5 w-full py-4 text-lg" onClick={() => onAct(action.id)} disabled={busy}>
        {action.id === "write_ca" ? "Write it" : "Enter the exam hall"}
      </button>
    </section>
  );
}

function SaveSheet({ onClose }) {
  const { account } = useGame();
  const [copied, setCopied] = useState(false);
  if (!account) {
    return (
      <Sheet title="Save your progress">
        <div className="mt-4">
          <AccountForm onDone={onClose} />
        </div>
        <button className="btn-ghost mt-3 w-full" onClick={onClose}>
          Not now
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet title="Your game is saved">
      <p className="mt-2 text-muted">
        Every move is saved to <b className="text-ink">@{account.username}</b>. On another phone, open Great Ife Life and sign in to
        continue.
      </p>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-bold text-ife-600">Use a save code instead</summary>
        <p className="mt-2 text-muted">Keep it private: anyone with it can play this game.</p>
        <p className="mt-2 select-all break-all rounded-lg bg-concrete px-3 py-3 font-mono text-sm">{save.code}</p>
        <button
          className="btn-ghost mt-2 w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(save.code);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy save code"}
        </button>
      </details>
      <button className="btn-primary mt-5 w-full" onClick={onClose}>
        Back to campus
      </button>
    </Sheet>
  );
}

export default function Play() {
  const { game, busy, error, setError, messages, act, choose, next, account } = useGame();
  const navigate = useNavigate();
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    if (game.phase === "graduated") navigate("/graduation", { replace: true });
  }, [game.phase, navigate]);

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-20 border-b border-line bg-concrete/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 pb-3 pt-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ife-600">
                {game.department.name}, {game.level}
              </p>
              <p className="truncate font-bold">
                {game.phase === "results"
                  ? "Semester over: results are out"
                  : game.strike_days
                    ? "ASUU strike"
                    : `${game.weekday}, day ${game.day} of ${game.days_in_semester}`}
              </p>
            </div>
            <Money value={game.money} />
          </div>
          <div className="mt-2.5">
            <TimeBand slotIndex={game.slot_index} strike={game.strike_days > 0} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="order-2 space-y-4 md:order-1">
          <Needs needs={game.needs} mood={game.mood} />
          <Academics game={game} />
          <Skills skills={game.skills} />
          <Businesses businesses={game.businesses} income={game.business_income} />
          <BadgesButton badges={game.badges} />
          <section className="slab p-4" aria-labelledby="log-h">
            <h2 id="log-h" className="font-bold">
              Recently
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted">
              {game.log.slice(0, 8).map((line, i) => (
                <li key={i}>{line.text}</li>
              ))}
            </ul>
          </section>
          <div className="flex gap-2 text-sm">
            <button className={`flex-1 py-2 ${account ? "btn-ghost" : "btn-bulb"}`} onClick={() => setShowSave(true)}>
              {account ? `Saved to @${account.username}` : "Save progress"}
            </button>
            <button className="btn-ghost flex-1 py-2" onClick={() => navigate("/")}>
              Title screen
            </button>
          </div>
        </div>

        <div className="order-1 space-y-4 md:order-2">
          {(messages.length > 0 || error) && (
            <div aria-live="polite" className="space-y-1.5">
              {error && (
                <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-bold text-danger" role="alert">
                  {error}{" "}
                  <button className="underline" onClick={() => setError("")}>
                    OK
                  </button>
                </p>
              )}
              {messages.map((m, i) => (
                <p key={`${game.turn}-${i}`} className={`rounded-lg px-3 py-2 text-sm ${i === 0 ? "bump bg-ife-600 font-bold text-white" : "bg-slab"}`}>
                  {m}
                </p>
              ))}
            </div>
          )}
          {game.forced ? (
            <ForcedCard action={game.forced} onAct={act} busy={busy} />
          ) : game.places.length ? (
            <Places places={game.places} onAct={act} busy={busy} />
          ) : null}
        </div>
      </main>

      {game.phase === "event" && game.pending && <EventDialog event={game.pending} onChoose={choose} busy={busy} />}
      {game.phase === "results" && game.last_result && (
        <ResultSlip
          result={game.last_result}
          onNext={next}
          busy={busy}
          nextLabel={game.graduates_next ? "Go to graduation" : "Start next semester"}
          onSave={account ? null : () => setShowSave(true)}
        />
      )}
      {showSave && <SaveSheet onClose={() => setShowSave(false)} />}
    </div>
  );
}
