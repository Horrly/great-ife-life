import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import WelcomeBack from "../components/WelcomeBack";
import { Footer } from "../App";
import InstallButton from "../components/InstallButton";
import { api } from "../lib/api";
import { useGame } from "../lib/game";

function PhoneShot({ src, alt, className = "" }) {
  return (
    <div className={`overflow-hidden rounded-[2.2rem] border-[7px] border-[#0d1310] bg-[#0d1310] shadow-[0_30px_60px_-20px_rgb(0_0_0/0.55)] ${className}`}>
      <img src={src} alt={alt} loading="lazy" width="390" height="844" className="block h-auto w-full rounded-[1.7rem]" />
    </div>
  );
}

const DAY = [
  ["7:40 AM", "🛺", "Keke from Moremi to Tech LT", "Doors open at seven. Get there twenty minutes early and you keep a seat in front."],
  ["12:15 PM", "🍲", "Amala at Mama Put", "₦600 with ponmo. Pay cash, or ask if she'll take transfer today."],
  ["4:30 PM", "🏧", "ATM at the Banking Area", "Unable to dispense cash. Try the POS man at the hall gate instead."],
  ["9:00 PM", "📚", "TDB at HOL", "Night reading till the library lights go off. Your CA test is in two days."],
];

export default function Title() {
  const { game, loading, resume, account } = useGame();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [error, setError] = useState("");
  const [top, setTop] = useState([]);

  useEffect(() => {
    api("/leaderboard/", { code: null, accountToken: null }).then((rows) => setTop(rows.slice(0, 5))).catch(() => {});
  }, []);

  async function load(e) {
    e.preventDefault();
    setError("");
    try {
      const g = await resume(code);
      navigate(g.status === "graduated" ? "/graduation" : "/play");
    } catch (err) {
      setError(err.status === 404 ? "No game matches that save code." : err.message);
    }
  }

  const playing = game && !loading;
  const [params] = useSearchParams();
  const primary = playing
    ? { to: game.status === "graduated" ? "/graduation" : "/play", label: `Continue as ${game.name || game.profile.name}` }
    : { to: "/new", label: "Get admission" };

  // coming back on a phone that already has a game: the welcome-back screen, not the sales page
  if (playing && !params.get("about")) return <WelcomeBack />;

  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0b2a1c] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_10%,rgb(28_154_94/0.35),transparent),radial-gradient(40rem_20rem_at_0%_100%,rgb(242_194_48/0.12),transparent)]" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <Link to="/" className="display text-xl tracking-tight">Great Ife Life</Link>
          <div className="flex items-center gap-1 text-sm font-semibold sm:gap-3">
            <Link to="/leaderboard" className="hidden rounded-full px-3 py-2 text-white/80 hover:text-white sm:inline">Leaderboard</Link>
            <Link to={account ? "/account" : "/account?mode=login"} className="rounded-full px-3 py-2 text-white/80 hover:text-white">
              {account ? `@${account.username}` : "Sign in"}
            </Link>
            <Link to={primary.to} className="rounded-full bg-white px-4 py-2 text-ink hover:bg-white/90">{playing ? "Continue" : "Play free"}</Link>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-6 md:grid-cols-[1.1fr_0.9fr] md:pb-24 md:pt-12">
          <div>
            <h1 className="display text-[2.9rem] leading-[0.98] sm:text-[4.2rem]">
              Four years at Great Ife. One CGPA to show for it.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/80">
              A free 3D life game set on the OAU campus, on real Nigerian time. Make your 8 AM lecture, hustle for your
              school charges, open a bank account, gist with real roommates, and try to graduate with a First.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to={primary.to} className="inline-flex items-center justify-center rounded-full bg-[#1c9a5e] px-7 py-4 text-lg font-bold text-white shadow-lg hover:bg-[#178a53]">
                {primary.label}
              </Link>
              {playing ? (
                <Link to="/new" className="inline-flex items-center justify-center rounded-full border border-white/30 px-7 py-4 text-lg font-semibold text-white hover:bg-white/10">
                  Start a new life
                </Link>
              ) : (
                <Link to="/account?mode=login" className="inline-flex items-center justify-center rounded-full border border-white/30 px-7 py-4 text-lg font-semibold text-white hover:bg-white/10">
                  I have an account
                </Link>
              )}
            </div>
            <p className="mt-5 text-sm text-white/60">Plays in your browser on any phone. No download, no data-hungry install.</p>
            <div className="mt-2 [&_button]:text-white/80"><InstallButton /></div>
          </div>
          <div className="relative mx-auto w-full max-w-[22rem] md:max-w-none">
            <PhoneShot src="/shots/campus.webp" alt="Walking on the 3D campus, with the clock, wallet and needs on screen" className="relative z-10 mx-auto w-[68%] md:w-[62%]" />
            <PhoneShot src="/shots/place.webp" alt="Things to do in a hall room: read, practise design, braid hair" className="absolute -right-2 top-14 w-[46%] rotate-[5deg] opacity-95 md:right-0" />
            <PhoneShot src="/shots/status.webp" alt="The status lottery result: Nepo Baby" className="absolute -left-2 top-24 w-[42%] -rotate-[6deg] opacity-95 md:left-2" />
          </div>
        </div>
      </section>

      {/* A day */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="display max-w-2xl text-4xl leading-tight text-ife-900 sm:text-5xl">A normal Tuesday, if you're lucky</h2>
        <p className="mt-3 max-w-xl text-lg text-muted">The clock is the real time in Ife. Lectures, banks and Mama Put keep real hours, and every choice costs time, money or sleep.</p>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {DAY.map(([time, icon, title, text]) => (
            <li key={time} className="bg-white p-6">
              <p className="num text-sm text-[#1c9a5e]">{time}</p>
              <p className="mt-3 text-3xl" aria-hidden>{icon}</p>
              <h3 className="mt-2 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features with real screenshots */}
      <section className="bg-[#eef2ee]">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <h2 className="display text-4xl leading-tight text-ife-900 sm:text-5xl">Your roommates are real people</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                Hall rooms take four, off-campus landlords allow two, and the other beds belong to other players. Leave notes on the
                room board, chat in your department, and share a room code so your friends land in your room.
              </p>
              <ul className="mt-6 space-y-2 text-[0.95rem]">
                <li>Hall bunks from ₦30,000, self-contains in Asherifa from ₦250,000</li>
                <li>Chat that hides phone numbers and links, with block and report</li>
                <li>Every student has a matric number you can message</li>
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <PhoneShot src="/shots/room.webp" alt="A Moremi Hall room with roommates on their bunks" />
              <PhoneShot src="/shots/chat.webp" alt="The CSC students chat, with a phone number hidden" className="mt-12" />
            </div>
          </div>

          <div className="mt-24 grid items-center gap-12 md:grid-cols-2">
            <div className="order-2 grid grid-cols-2 gap-4 md:order-1">
              <PhoneShot src="/shots/bank.webp" alt="Sending money from the bank app after checking the name" className="mt-12" />
              <PhoneShot src="/shots/map.webp" alt="The campus map with pins for every building" />
            </div>
            <div className="order-1 md:order-2">
              <h2 className="display text-4xl leading-tight text-ife-900 sm:text-5xl">Money works the way it does in Ife</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                You arrive with cash. Open an account at First Bank, GTBank, UBA or a fintech app, get a card, and cash out at the
                ATM or the POS agent by the hall gate. Kekes want cash. Your parents send money to your account number, and only so much.
              </p>
              <ul className="mt-6 space-y-2 text-[0.95rem]">
                <li>Keke ₦100 to ₦200, CNG bus ₦100, night cab from 9 PM</li>
                <li>Transfers with a name check and real transfer fees</li>
                <li>Hustles: chin-chin, barbing, braids, freelancing on your laptop</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Status */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="display max-w-2xl text-4xl leading-tight text-ife-900 sm:text-5xl">What were you born into?</h2>
        <p className="mt-3 max-w-xl text-lg text-muted">Admission rolls your status. It decides your phone, your starting cash and how much home will send.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ["Lapo Baby", "60% of students", "₦100,000 in your pocket, a cracked itel, and hustles that pay 30% more. Home sends ₦20,000 at most."],
            ["Nepo Baby", "32% of students", "₦200,000, a laptop and ₦10,000 every Monday. School charges paid. Home sends up to ₦100,000."],
            ["Odogwu", "8% of students", "₦300,000, an iPhone and your own Corolla. Even your father stops at ₦300,000 per request."],
          ].map(([name, odds, text]) => (
            <div key={name} className="rounded-3xl border border-line p-6">
              <p className="text-sm font-semibold text-muted">{odds}</p>
              <h3 className="display mt-2 text-3xl text-ife-900">{name}</h3>
              <p className="mt-3 leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Leaderboard */}
      {top.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="rounded-3xl bg-[#0b2a1c] p-6 text-white sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="display text-3xl sm:text-4xl">Best graduates so far</h2>
              <Link to="/leaderboard" className="text-sm font-semibold text-white/80 underline underline-offset-4">Full leaderboard</Link>
            </div>
            <ol className="mt-6 divide-y divide-white/10">
              {top.map((r, i) => (
                <li key={r.share_code} className="flex items-center gap-4 py-3">
                  <span className="num w-6 text-white/50">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.name}</span>
                    <span className="block truncate text-sm text-white/60">{r.department} · {r.profile}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-xl">{r.cgpa?.toFixed(2)}</span>
                    <span className="block text-xs text-white/60">{r.class}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Final call */}
      <section className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-5 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="display text-3xl text-ife-900 sm:text-4xl">Your JAMB result is out.</h2>
            <p className="mt-2 text-muted">Pick a course and see where admission puts you.</p>
          </div>
          <Link to={primary.to} className="inline-flex items-center justify-center rounded-full bg-[#1c9a5e] px-7 py-4 text-lg font-bold text-white hover:bg-[#178a53]">
            {primary.label}
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-6 text-sm">
          {showCode ? (
            <form onSubmit={load} className="flex max-w-md gap-2">
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste your save code"
                aria-label="Save code" autoFocus />
              <button className="btn-ghost shrink-0" disabled={!code.trim()}>Load</button>
            </form>
          ) : (
            <button className="text-muted underline underline-offset-2" onClick={() => setShowCode(true)}>Continue with a save code</button>
          )}
          {error && <p className="mt-2 text-danger">{error}</p>}
        </div>
        <Footer />
      </section>
    </div>
  );
}
