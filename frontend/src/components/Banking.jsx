// Money that lives in a bank: the Banking Area (branches and ATMs), POS agents around campus, and the
// bank app on your phone (transfers by account number, with a name check first, like real banking apps).
import { useState } from "react";
import { naira } from "../lib/format";
import { useGame } from "../lib/game";

const k = (n) => (n >= 1000 ? `₦${n / 1000}k` : `₦${n}`);

function Chips({ amounts, value, onPick, disabled, note }) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
      {amounts.map((a) => (
        <button key={a} role="radio" aria-checked={value === a} disabled={disabled?.(a)} onClick={() => onPick(a)}
          className={`rounded-lg px-1 py-2 text-sm font-black disabled:opacity-40 ${value === a ? "bg-ife-700 text-white" : "bg-white text-ink ring-1 ring-line"}`}>
          {k(a)}
          {note && <span className="block text-[10px] font-semibold opacity-75">{note(a)}</span>}
        </button>
      ))}
    </div>
  );
}

function Section({ title, subtitle, children, tone = "white" }) {
  return (
    <section className={`mb-3 rounded-2xl border border-line p-3.5 ${tone === "white" ? "bg-white" : "bg-bulb-soft"}`}>
      <h3 className="text-base font-bold text-ife-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** A bank's sign: its colour and name, no logos. */
export function BankBadge({ bank, small = false }) {
  return (
    <span className={`inline-flex items-center rounded-md font-black ${small ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-sm"}`}
      style={{ background: bank.color, color: bank.fg }}>
      {bank.name}
    </span>
  );
}

function Wallet({ game }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-white p-2.5 ring-1 ring-line">
        <p className="text-xs text-muted">Cash in hand</p>
        <p className="num text-xl">{naira(game.cash)}</p>
      </div>
      <div className="rounded-xl bg-white p-2.5 ring-1 ring-line">
        <p className="text-xs text-muted">{game.bank ? game.bank.name : "Bank"}</p>
        <p className="num text-xl">{game.bank ? naira(game.bank.balance) : "No account"}</p>
      </div>
    </div>
  );
}

/** Type any amount (₦ prefix, commas as you type), or tap a quick chip. */
export function AmountInput({ value, onChange, chips = [], max, step = 1, dark = false, label = "Amount" }) {
  const text = value ? Number(value).toLocaleString("en-NG") : "";
  return (
    <div>
      <label className={`flex items-center gap-1 rounded-2xl px-4 py-3 ring-1 focus-within:ring-2 focus-within:ring-[#f08a24] ${dark ? "bg-white/95 text-ink ring-white/30" : "bg-white ring-line"}`}>
        <span className="num text-2xl text-muted">₦</span>
        <input inputMode="numeric" aria-label={label} placeholder="0" value={text}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, "")) || 0;
            onChange(Math.min(n, max ?? n));
          }}
          className="num min-w-0 flex-1 bg-transparent text-2xl outline-none placeholder:text-line" />
      </label>
      {step > 1 && value % step !== 0 && <p className="mt-1 text-xs font-semibold text-danger">Use a multiple of ₦{step.toLocaleString("en-NG")}.</p>}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map(([v, l]) => (
            <button key={l} type="button" onClick={() => onChange(v)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${value === v ? "bg-ink text-white" : "bg-chip text-ink"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ngn = (n) => naira(n || 0);

function BankHall({ game, bankId, run, onBack }) {
  const { openBank, bankCounter, atm, busy } = useGame();
  const b = game.banking;
  const bank = b.banks.find((x) => x.id === bankId);
  const acct = game.bank;
  const mine = acct?.bank === bankId;
  const [kind, setKind] = useState("deposit");
  const [amt, setAmt] = useState(0);
  const [atmAmt, setAtmAmt] = useState(0);
  const L = b.limits;
  const atmFee = acct && !mine ? b.atm_fee : 0;
  const counterOk = amt >= L.counter_min && (kind === "deposit" ? amt <= game.cash : amt <= (acct?.balance ?? 0));
  const atmOk = acct?.card && atmAmt >= L.atm_step && atmAmt % L.atm_step === 0 && atmAmt + atmFee <= acct.balance && atmAmt <= acct.atm_left;
  return (
    <div className="mb-3">
      <div className="mb-3 flex items-center gap-3 rounded-2xl p-4" style={{ background: bank.color, color: bank.fg }}>
        <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full bg-black/20 text-lg" aria-label="All banks">‹</button>
        <div className="min-w-0 flex-1">
          <p className="display truncate text-2xl">{bank.name}</p>
          <p className="text-sm opacity-85">{b.branch_open ? "Banking hall open till 4:00 PM" : "Hall closed · ATM works all day"}</p>
        </div>
      </div>
      <Wallet game={game} />
      {!acct && (
        <Section title={`Open a ${bank.name} account`}
          subtitle={b.branch_open
            ? `Fill the form at the desk and bring ${naira(b.open_cost)} cash: ₦1,000 opening deposit and ₦1,000 for your debit card. Your card works at every ATM and POS.`
            : "Come back between 8:00 AM and 4:00 PM, Monday to Friday."}>
          <button className="btn w-full rounded-full bg-go py-3.5 text-white" disabled={busy || !b.branch_open || game.cash < b.open_cost}
            onClick={() => run(openBank(bankId), `Opening your ${bank.name} account`)}>
            {game.cash < b.open_cost ? `You need ${naira(b.open_cost)} cash` : `Open account · ${naira(b.open_cost)}`}
          </button>
        </Section>
      )}
      {mine && (
        <Section title="At the counter" subtitle={b.branch_open ? "Deposits and withdrawals here are free." : "The counter is closed. The ATM works all day."}>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-full bg-chip p-1">
            {["deposit", "withdraw"].map((k) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`rounded-full py-1.5 text-sm font-bold ${kind === k ? "bg-white shadow" : "text-muted"}`}>
                {k === "deposit" ? "Deposit cash" : "Withdraw"}
              </button>
            ))}
          </div>
          <AmountInput value={amt} onChange={setAmt} label={kind === "deposit" ? "Amount to deposit" : "Amount to withdraw"}
            chips={kind === "deposit"
              ? [[1000, "₦1k"], [5000, "₦5k"], [20000, "₦20k"], [game.cash, "All my cash"]]
              : [[1000, "₦1k"], [5000, "₦5k"], [20000, "₦20k"], [acct.balance, "Everything"]]} />
          <button className="btn mt-3 w-full rounded-full bg-ink py-3.5 text-white" disabled={busy || !b.branch_open || !counterOk}
            onClick={() => run(bankCounter(kind, amt, bankId).then((g) => {
              if (g) setAmt(0);
              return g;
            }), kind === "deposit" ? "At the counter" : "The cashier is counting")}>
            {kind === "deposit" ? "Deposit" : "Withdraw"} {amt ? naira(amt) : ""}
          </button>
        </Section>
      )}
      {acct && !mine && (
        <p className="mb-3 rounded-2xl bg-bulb-soft px-4 py-3 text-sm">You bank with <b>{acct.name}</b>, so the counter here can't help you. You can still use this bank's ATM for a ₦{b.atm_fee} fee.</p>
      )}
      <Section title={`${bank.name} ATM`}
        subtitle={!acct ? "You need an account and a debit card." : !acct.card ? `${acct.name} has no card. Cash out at a POS agent by transfer.`
          : `₦500 and ₦1,000 notes, up to ${ngn(L.atm_max)} at a time · ${ngn(acct.atm_left)} left today${atmFee ? ` · ₦${atmFee} fee` : " · free for you"}`}>
        <AmountInput value={atmAmt} onChange={setAtmAmt} max={L.atm_max} step={L.atm_step} label="Amount to withdraw at the ATM"
          chips={[[2000, "₦2k"], [5000, "₦5k"], [10000, "₦10k"], [20000, "₦20k"]]} />
        <button className="btn mt-3 w-full rounded-full bg-go py-3.5 text-white" disabled={busy || !atmOk}
          onClick={() => run(atm(atmAmt, bankId).then((g) => {
            if (g) setAtmAmt(0);
            return g;
          }), "Inserting your card…")}>
          Withdraw {atmAmt ? naira(atmAmt) : ""}{atmFee && atmAmt ? ` · fee ₦${atmFee}` : ""}
        </button>
      </Section>
    </div>
  );
}

function PosAgent({ game, run }) {
  const { pos, busy } = useGame();
  const b = game.banking;
  const L = b.limits;
  const acct = game.bank;
  const [kind, setKind] = useState("withdraw");
  const [method, setMethod] = useState(acct?.card ? "card" : "transfer");
  const [amt, setAmt] = useState(0);
  const charge = amt ? Math.ceil(amt / L.pos_per) * L.pos_fee + L.pos_night : 0;
  const nip = kind === "withdraw" && method === "transfer" && amt ? (amt <= 5000 ? 10 : amt <= 50000 ? 25 : 50) : 0;
  const ok = amt >= L.pos_min && amt <= L.pos_max
    && (kind === "withdraw" ? amt + charge + nip <= (acct?.balance ?? 0) : amt + charge <= game.cash);
  return (
    <Section title="POS agent" subtitle={`Cash out or deposit here. ₦${L.pos_fee} for every ₦${L.pos_per.toLocaleString("en-NG")}${L.pos_night ? `, plus ₦${L.pos_night} at night` : ""}.`}>
      {!acct ? <p className="text-sm text-muted">You need a bank account to use POS.</p> : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-1 rounded-full bg-chip p-1">
            {["withdraw", "deposit"].map((k) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k}
                className={`rounded-full py-1.5 text-sm font-bold ${kind === k ? "bg-white shadow" : "text-muted"}`}>
                {k === "withdraw" ? "Get cash" : "Deposit cash"}
              </button>
            ))}
          </div>
          {kind === "withdraw" && (
            <div className="mb-2 flex gap-1.5 text-sm">
              {["card", "transfer"].map((m) => (
                <button key={m} onClick={() => setMethod(m)} aria-pressed={method === m} disabled={m === "card" && !acct.card}
                  className={`flex-1 rounded-full px-2 py-1.5 font-bold disabled:opacity-40 ${method === m ? "bg-ife-700 text-white" : "bg-white ring-1 ring-line"}`}>
                  {m === "card" ? `💳 ${acct.name} card` : "📲 Transfer to agent"}
                </button>
              ))}
            </div>
          )}
          <AmountInput value={amt} onChange={setAmt} max={L.pos_max} label="Amount"
            chips={[[1000, "₦1k"], [2000, "₦2k"], [5000, "₦5k"], [10000, "₦10k"], [20000, "₦20k"]]} />
          <button className="btn mt-3 w-full rounded-full bg-go py-3.5 text-white" disabled={busy || !ok}
            onClick={() => run(pos(kind, amt, method).then((g) => {
              if (g) setAmt(0);
              return g;
            }), "The POS agent is counting")}>
            {kind === "withdraw" ? "Get" : "Deposit"} {amt ? `${naira(amt)} · charge ₦${charge + nip}` : ""}
          </button>
        </>
      )}
    </Section>
  );
}

/** Inside a building: the Banking Area's banks, an ATM, and the POS agent, whichever are here. */
export function MoneyHere({ game, run, hall, setHall }) {
  const b = game.banking;
  const [localHall, setLocalHall] = useState(null);
  const current = hall !== undefined ? hall : localHall;
  const choose = setHall || setLocalHall;
  if (!b.branch && !b.atm && !b.pos) return null;
  if (b.branch && current) return <BankHall game={game} bankId={current} run={run} onBack={() => choose(null)} />;
  return (
    <div className="mb-3">
      <Wallet game={game} />
      {b.branch && (
        <Section title="Pick a bank to go in" subtitle={b.branch_open ? "Banking halls are open till 4:00 PM. ATMs work all day." : "Banking halls are closed (8 AM to 4 PM, Mon to Fri). The ATMs still work."}>
          <div className="grid grid-cols-2 gap-2">
            {b.banks.filter((x) => !x.app).map((x) => (
              <button key={x.id} onClick={() => choose(x.id)}
                className="relative rounded-2xl px-3 py-4 text-left shadow-sm" style={{ background: x.color, color: x.fg }}>
                <span className="block font-black">{x.name}</span>
                <span className="block text-xs opacity-85">{game.bank?.bank === x.id ? "Your bank" : "Enter"}</span>
              </button>
            ))}
          </div>
          {b.held_allowance > 0 && <p className="mt-2 text-sm font-semibold text-ife-700">Your parents are holding {naira(b.held_allowance)} until you open an account.</p>}
        </Section>
      )}
      {b.atm && !b.branch && <AtmOnly game={game} run={run} />}
      {b.pos && <PosAgent game={game} run={run} />}
    </div>
  );
}

function AtmOnly({ game, run }) {
  const { atm, busy } = useGame();
  const b = game.banking;
  const L = b.limits;
  const acct = game.bank;
  const [amt, setAmt] = useState(0);
  const fee = acct && b.atm.owner && b.atm.owner !== acct.bank ? b.atm_fee : 0;
  const ok = acct?.card && amt >= L.atm_step && amt % L.atm_step === 0 && amt + fee <= acct.balance;
  return (
    <Section title={`${b.atm.owner_name} ATM`} subtitle={!acct ? "You need a bank account and a debit card." : !acct.card ? `${acct.name} has no card. Use a POS agent.` : fee ? `Another bank's ATM: ₦${fee} fee.` : "Free for you."}>
      <AmountInput value={amt} onChange={setAmt} max={L.atm_max} step={L.atm_step} chips={[[2000, "₦2k"], [5000, "₦5k"], [10000, "₦10k"], [20000, "₦20k"]]} />
      <button className="btn mt-3 w-full rounded-full bg-go py-3.5 text-white" disabled={busy || !ok}
        onClick={() => run(atm(amt), "Inserting your card…")}>Withdraw {amt ? naira(amt) : ""}</button>
    </Section>
  );
}

/** The bank app on your phone (white text on the phone's wallpaper). */
export function BankApp({ game, run }) {
  const { openBank, transfer, lookupAccount, busy } = useGame();
  const [tab, setTab] = useState("home");
  const [number, setNumber] = useState("");
  const [bankId, setBankId] = useState("");
  const [who, setWho] = useState(null);
  const [lookErr, setLookErr] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const acct = game.bank;
  const b = game.banking;
  if (!acct) {
    return (
      <div className="space-y-3 p-4 text-white">
        <p className="display text-3xl">No account yet</p>
        <p className="text-sm opacity-90">
          Your parents, your allowance and freelance clients pay by transfer, so you need an account. Open one at any bank in
          the Banking Area (8 AM to 4 PM on weekdays), or open a fintech account right here.
        </p>
        {b.held_allowance > 0 && <p className="rounded-xl bg-black/25 px-3 py-2 text-sm">Your parents are holding {naira(b.held_allowance)} for you.</p>}
        {b.banks.filter((x) => x.app).map((x) => (
          <button key={x.id} disabled={busy} onClick={() => run(openBank(x.id), `Signing up on ${x.name}`)}
            className="block w-full rounded-xl px-3 py-3 text-left font-black shadow disabled:opacity-50" style={{ background: x.color, color: x.fg }}>
            Open a {x.name} account
            <span className="block text-xs font-semibold opacity-90">Free, on your phone. No card: cash out at POS by transfer.</span>
          </button>
        ))}
      </div>
    );
  }
  const fee = (a) => (a <= 5000 ? 10 : a <= 50000 ? 25 : 50);
  async function verify() {
    setWho(null);
    setLookErr("");
    try {
      setWho(await lookupAccount(number, bankId));
    } catch (err) {
      setLookErr(err.message);
    }
  }
  async function send() {
    const g = await run(transfer(number, bankId, amount, note), `Sending ${naira(amount)}`);
    if (g) {
      setTab("home");
      setWho(null);
      setNumber("");
      setAmount(0);
      setNote("");
    }
  }
  return (
    <div className="space-y-3 p-3 text-white">
      <div className="rounded-2xl p-4 shadow-lg" style={{ background: acct.color, color: acct.fg }}>
        <p className="text-xs font-bold opacity-90">{acct.name} · Savings</p>
        <p className="num mt-1 text-4xl">{naira(acct.balance)}</p>
        <button className="mt-2 flex items-center gap-2 rounded-full bg-black/20 px-3 py-1 text-sm font-bold"
          onClick={() => {
            navigator.clipboard?.writeText(acct.number).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}>
          <span className="num tracking-wider">{acct.number}</span>
          <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[["home", "Statement"], ["send", "Transfer"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
            className={`rounded-full py-1.5 text-sm font-bold ${tab === id ? "bg-white text-ink" : "bg-black/25"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "home" ? (
        <ul className="space-y-1.5">
          {acct.history.length === 0 && <li className="text-sm opacity-80">No transactions yet.</li>}
          {acct.history.map((h, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-ink">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{h.text}</span>
                <span className="text-[11px] text-muted">Day {h.day}, {h.time}</span>
              </span>
              <span className={`num shrink-0 text-sm ${h.amount < 0 ? "text-danger" : "text-ife-700"}`}>
                {h.amount < 0 ? "−" : "+"}{naira(Math.abs(h.amount))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-2 rounded-2xl bg-white/95 p-3 text-ink">
          <label className="block text-sm font-bold">
            Account number
            <input inputMode="numeric" maxLength={10} value={number}
              onChange={(e) => {
                setNumber(e.target.value.replace(/\D/g, ""));
                setWho(null);
              }}
              className="num mt-1 w-full rounded-lg border border-line px-3 py-2 text-lg tracking-wider" placeholder="0123456789" />
          </label>
          <label className="block text-sm font-bold">
            Bank
            <select value={bankId} onChange={(e) => {
              setBankId(e.target.value);
              setWho(null);
            }} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2">
              <option value="">Choose bank</option>
              {b.banks.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          {!who ? (
            <>
              <button className="btn-primary w-full" disabled={number.length !== 10 || !bankId} onClick={verify}>Check name</button>
              {lookErr && <p className="text-sm font-semibold text-danger" role="alert">{lookErr}</p>}
            </>
          ) : (
            <>
              <p className="rounded-lg bg-ife-50 px-3 py-2 text-sm font-black text-ife-700">✓ {who.name} · {who.bank}</p>
              <AmountInput value={amount} onChange={setAmount} max={acct.sent_left} label="Amount to send"
                chips={[[500, "₦500"], [1000, "₦1k"], [5000, "₦5k"], [10000, "₦10k"]]} />
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} aria-label="Note"
                placeholder="Note (optional), e.g. for printing" className="w-full rounded-xl bg-chip px-3 py-2.5 text-sm outline-none" />
              <button className="btn-primary w-full" disabled={busy || amount < 100 || acct.balance < amount + fee(amount)} onClick={send}>
                Send {amount ? `${naira(amount)} · fee ₦${fee(amount)}` : ""}
              </button>
              <p className="text-xs text-muted">Check the name. Transfers can't be reversed.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
