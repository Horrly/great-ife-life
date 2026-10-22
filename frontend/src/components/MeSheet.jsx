// "You": one sheet with pill tabs, like a profile in a life game. Profile, needs and feelings, studies,
// skills, goals (today's missions, streak, dream) and badges.
import { useState } from "react";
import { naira } from "../lib/format";
import AvatarPreview from "./AvatarPreview";
import { moodOf, NEEDS, Timetable } from "./Hud";
import { Businesses, Skills } from "./Progress";
import { BottomSheet, PillTabs, Ring } from "./ui";

function Card({ children, className = "" }) {
  return <section className={`mb-3 rounded-2xl bg-slab p-4 ${className}`}>{children}</section>;
}

function NeedsTab({ game }) {
  return (
    <>
      <ul className="space-y-3">
        {Object.entries(NEEDS).map(([k, n]) => (
          <li key={k} className="flex items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg" style={{ background: n.tint }}>{n.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between text-[0.95rem] font-semibold">
                <span>{n.label}</span>
                <span className="num">{game.needs[k]}%</span>
              </span>
              <span className="mt-1 block h-2 overflow-hidden rounded-full bg-chip">
                <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${game.needs[k]}%`, background: n.color }} />
              </span>
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mb-2 mt-5 text-xs font-bold text-muted">FEELINGS</h3>
      {game.moodlets?.length ? (
        <ul className="space-y-2">
          {game.moodlets.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl bg-slab px-3 py-2.5">
              <span aria-hidden className="text-2xl">{m.emoji}</span>
              <span className="min-w-0 flex-1 font-semibold">{m.name}</span>
              <span className={`num ${m.value > 0 ? "text-go" : "text-danger"}`}>{m.value > 0 ? "+" : ""}{m.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing special. Eat well, sleep, gist with people.</p>
      )}
      {game.mood < 40 && <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Low mood makes reading and exams harder.</p>}
    </>
  );
}

function StudiesTab({ game }) {
  return (
    <>
      <Card>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div><dt className="text-xs text-muted">Readiness</dt><dd className="num text-3xl">{game.prep}%</dd></div>
          <div><dt className="text-xs text-muted">Attendance</dt><dd className="num text-3xl">{game.attendance ?? "–"}{game.attendance !== null && "%"}</dd></div>
          <div><dt className="text-xs text-muted">CGPA</dt><dd className="num text-3xl">{game.cgpa?.toFixed(2) ?? "–"}</dd></div>
        </dl>
        {game.upcoming.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line/60 pt-3 text-sm">
            {game.upcoming.map((u) => <li key={u}>▸ {u}</li>)}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="font-bold">Timetable</h3>
        <p className="mb-2 text-xs text-muted">Doors open an hour before. Come 20 minutes early for a front seat. More than 15 minutes late and you stand by the window; after 40 the doors shut.</p>
        <Timetable game={game} />
        <p className="mt-2 text-xs text-muted">Courses: {game.courses.map((c) => c.code + (c.carry ? " (carryover)" : "")).join(", ")}</p>
      </Card>
    </>
  );
}

function GoalsTab({ game }) {
  const done = game.missions.filter((m) => m.done).length;
  const rep = game.rep;
  const pct = (rep.xp - rep.floor) / Math.max(1, rep.next - rep.floor);
  return (
    <>
      <section className="mb-3 rounded-2xl bg-[#1e2a5a] p-4 text-white">
        <div className="flex items-center gap-3">
          <Ring value={pct} size={58} stroke={5} color="#f2c230" track="rgb(255 255 255 / 0.15)">
            <span className="num text-sm">LV {rep.level}</span>
          </Ring>
          <div className="min-w-0">
            <p className="display text-xl">⭐ {rep.title}</p>
            <p className="text-xs text-white/70">{rep.xp - rep.floor}/{rep.next - rep.floor} Rep to the next level</p>
          </div>
        </div>
        <h3 className="mt-4 text-sm font-bold">Today on campus · {done}/{game.missions.length}</h3>
        <ul className="mt-2 space-y-1.5">
          {game.missions.map((m) => (
            <li key={m.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${m.done ? "bg-go/30" : "bg-white/10"}`}>
              <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${m.done ? "bg-go" : "bg-white/15"}`}>{m.done ? "✓" : ""}</span>
              <span className="min-w-0 flex-1 text-sm font-semibold">{m.label}</span>
              <span className="num text-sm text-bulb">+{naira(m.reward)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-white/70">{game.missions_bonus ? "All three done: bonus collected!" : "Finish all three for a ₦1,500 bonus and +80 Rep."}</p>
      </section>
      <section className="mb-3 rounded-2xl bg-[#fde9d3] p-4">
        <h3 className="font-bold">Daily streak 🔥</h3>
        <ol className="mt-2 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i} className={`grid aspect-square place-items-center rounded-full text-xs font-black ${i < game.streak ? "bg-need-hunger text-white" : "bg-white text-muted"}`}>
              {i < game.streak ? "✓" : i === 6 ? "🎁" : i + 1}
            </li>
          ))}
        </ol>
      </section>
      {game.dream && (
        <section className="mb-3 rounded-2xl bg-gradient-to-br from-[#6d3ab8] to-[#c2448f] p-4 text-white">
          <p className="text-xs font-bold text-white/70">YOUR DREAM</p>
          <p className="display mt-1 text-2xl">{game.dream.emoji} {game.dream.name}</p>
          <p className="mt-1 text-sm text-white/85">{game.dream.done ? "Achieved! 🎉" : game.dream.note}</p>
          {game.dream.progress != null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, game.dream.progress * 100)}%` }} /></div>
          )}
        </section>
      )}
      <Businesses businesses={game.businesses} income={game.business_income} />
    </>
  );
}

function ProfileTab({ game, account, onSave, onTitle }) {
  return (
    <>
      <div className="mb-3 overflow-hidden rounded-2xl bg-[#dcebf7]">
        <AvatarPreview look={game.look} className="mx-auto h-56 w-full" />
      </div>
      <Card>
        <p className="text-sm text-muted">{game.department.name} · {game.level}</p>
        <p className="mt-1 font-semibold">{game.profile.name} · lives in {game.room?.label || game.home_name}
          {game.housing.share > 0 && <span className="text-muted"> · {naira(game.housing.share)} a session</span>}</p>
        <p className="mt-1 text-sm text-muted">Matric number <b className="num text-ink">{game.matric}</b></p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {game.traits.map((t) => (
            <li key={t.id} title={t.text} className="rounded-full bg-ife-50 px-2.5 py-1 text-xs font-bold text-ife-700">{t.emoji} {t.name}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-bold">Your things</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>📱 {game.phone_info ? `${game.phone_info.name}${game.phone_info.cracked ? " (cracked screen)" : ""}` : "No phone (buy one at Ojaja)"}</li>
          <li>🏦 {game.bank ? `${game.bank.name} · ${game.bank.number}` : "No bank account yet"}</li>
          <li>🍚 Foodstuff for {game.pantry} meal{game.pantry === 1 ? "" : "s"}</li>
          {game.items.map((i) => <li key={i.id}>{{ bike: "🚲", car: "🚗", clippers: "💈", cobbler_kit: "👞", laptop: "💻" }[i.id] || "🎒"} {i.name}</li>)}
        </ul>
        <p className="mt-2 text-xs text-muted">You've trekked {game.trekked_km} km around campus.</p>
      </Card>
      <div className="flex gap-2 text-sm">
        <button className={`flex-1 py-2.5 ${account ? "btn-ghost" : "btn-bulb"}`} onClick={onSave}>{account ? `Saved to @${account.username}` : "Save progress"}</button>
        <button className="btn-ghost flex-1 py-2.5" onClick={onTitle}>Title screen</button>
      </div>
    </>
  );
}

function BadgesTab({ badges }) {
  return (
    <ul className="grid grid-cols-1 gap-2">
      {badges.map((b) => (
        <li key={b.id} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${b.earned ? "bg-bulb-soft" : "bg-slab"}`}>
          <span aria-hidden className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-black ${b.earned ? "bg-bulb" : "bg-chip text-muted"}`}>{b.earned ? "★" : "?"}</span>
          <span>
            <span className={`block font-semibold ${b.earned ? "" : "text-muted"}`}>{b.name}</span>
            <span className="block text-xs text-muted">{b.description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export const LEVEL_COLOR = { Stranger: "#9aa3a0", Acquaintance: "#2f7de1", Friend: "#1f9d55", "Close friend": "#d97706", Bestie: "#d6336c" };

/** Everyone you've met, closest first, with how far to the next level. */
export function FriendBar({ p }) {
  const pct = p.next ? Math.round(((p.bond - p.floor) / (p.next - p.floor)) * 100) : 100;
  return (
    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-chip" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(4, pct)}%`, background: LEVEL_COLOR[p.level] }} />
    </span>
  );
}

function PeopleTab({ people }) {
  if (!people?.length) {
    return <p className="rounded-2xl bg-slab px-3 py-4 text-sm text-muted">Nobody yet. Tap someone at a buka, in class or in your hall and say hello.</p>;
  }
  return (
    <ul className="space-y-2">
      {people.map((p) => (
        <li key={p.name} className="flex items-center gap-3 rounded-2xl bg-slab px-3 py-2.5">
          <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-black text-white ${p.player ? "bg-[#2f7de1]" : "bg-ink"}`}>
            {p.name.replace(/^@/, "").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-bold">{p.player ? `@${p.name}` : p.name}</span>
              <span className="shrink-0 text-xs font-bold" style={{ color: LEVEL_COLOR[p.level] }}>{p.level}</span>
            </span>
            <span className="block truncate text-xs text-muted">{p.role || (p.player ? "Real student" : "On campus")}</span>
            <FriendBar p={p} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function MeSheet({ game, account, tab: initial = "profile", onClose, onSave, onTitle }) {
  const [tab, setTab] = useState(initial);
  const m = moodOf(game.mood);
  const top = game.moodlets?.[0];
  const earned = game.badges.filter((b) => b.earned).length;
  const done = game.missions.filter((x) => x.done).length;
  return (
    <BottomSheet onClose={onClose} label="You"
      header={
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-chip text-2xl ring-[3px] ring-go">
            {game.look?.hall === "female" ? "👩🏾‍🎓" : "🧑🏾‍🎓"}
          </span>
          <span className="min-w-0">
            <span className="display block truncate text-[1.45rem] text-ife-900">{game.name || "You"}</span>
            <span className="block truncate text-sm text-muted">{m.label}{top ? ` · ${top.name}` : ""}</span>
          </span>
        </div>
      }>
      <PillTabs value={tab} onChange={setTab} tabs={[
        ["profile", "✏️ Profile"], ["needs", "Needs"], ["studies", "📚 Studies"], ["goals", "🎯 Goals", game.missions.length - done],
        ["people", `👥 People ${game.people?.length || 0}`], ["skills", "Skills"], ["badges", `★ Badges ${earned}/${game.badges.length}`], ["log", "Recently"],
      ]} />
      <div className="pt-2">
        {tab === "profile" && <ProfileTab game={game} account={account} onSave={onSave} onTitle={onTitle} />}
        {tab === "needs" && <NeedsTab game={game} />}
        {tab === "studies" && <StudiesTab game={game} />}
        {tab === "goals" && <GoalsTab game={game} />}
        {tab === "people" && <PeopleTab people={game.people} />}
        {tab === "skills" && <Skills skills={game.skills} />}
        {tab === "badges" && <BadgesTab badges={game.badges} />}
        {tab === "log" && (
          <ul className="space-y-2 text-sm">
            {game.log.map((line, i) => (
              <li key={i} className="rounded-2xl bg-slab px-3 py-2"><span className="font-bold">{line.time}</span> {line.text}</li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

/** The inbox: everything that's happened lately, newest first. */
export function InboxSheet({ game, onClose }) {
  return (
    <BottomSheet title="Inbox" subtitle="Alerts, results and things that happened" onClose={onClose} height="70%">
      {game.log.length ? (
        <ul className="space-y-2">
          {game.log.map((line, i) => (
            <li key={i} className="flex gap-3 rounded-2xl bg-slab px-3 py-2.5 text-sm">
              <span className="shrink-0 font-bold text-muted">{line.time}</span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing yet.</p>
      )}
    </BottomSheet>
  );
}
