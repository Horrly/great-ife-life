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

/** Inside a building: the bank counter, ATMs and the POS agent, whichever are here. */
export function MoneyHere({ game, run }) {
  const { openBank, bankCounter, atm, pos, busy } = useGame();
  const b = game.banking;
  const [counterKind, setCounterKind] = useState("deposit");
  const [counterAmt, setCounterAmt] = useState(null);
  const [atmAmt, setAtmAmt] = useState(null);
  const [posKind, setPosKind] = useState("withdraw");
  const [posMethod, setPosMethod] = useState(game.bank?.card ? "card" : "transfer");
  const [posAmt, setPosAmt] = useState(null);
  if (!b.branch && !b.atm && !b.pos) return null;
  const acct = game.bank;
  const branchBank = acct && !acct.app;
  return (
    <div className="mb-3">
      <Wallet game={game} />
      {b.branch && !acct && (
        <Section title="Open a bank account" subtitle={b.branch_open
          ? `Bring ${naira(b.open_cost)} cash: ${naira(1000)} opening deposit and ${naira(1000)} for an instant debit card. Your parents, allowance and clients pay into it.`
          : "Banks are open 8:00 AM to 4:00 PM, Monday to Friday. Come back then."}>
          <div className="grid grid-cols-2 gap-1.5">
            {b.banks.filter((x) => !x.app).map((x) => (
              <button key={x.id} disabled={busy || !b.branch_open || game.cash < b.open_cost}
                onClick={() => run(openBank(x.id), `Opening your ${x.name} account`)}
                className="rounded-xl px-2 py-3 text-sm font-black shadow-sm disabled:opacity-45" style={{ background: x.color, color: x.fg }}>
                {x.name}
              </button>
            ))}
          </div>
          {b.held_allowance > 0 && (
            <p className="mt-2 text-sm font-semibold text-ife-700">Your parents are holding {naira(b.held_allowance)} until you open one.</p>
          )}
        </Section>
      )}
      {b.branch && branchBank && (
        <Section title={`${acct.name} banking hall`} subtitle={b.branch_open ? "Deposits and withdrawals at the counter are free." : "The banking hall is closed (8 AM to 4 PM, Mon to Fri). The ATM works all night."}>
          <div className="mb-2 grid grid-cols-2 gap-1.5">
            {["deposit", "withdraw"].map((kind) => (
              <button key={kind} onClick={() => setCounterKind(kind)} aria-pressed={counterKind === kind}
                className={`rounded-lg py-1.5 text-sm font-bold ${counterKind === kind ? "bg-ink text-white" : "bg-line/60"}`}>
                {kind === "deposit" ? "Deposit cash" : "Withdraw"}
              </button>
            ))}
          </div>
          <Chips amounts={b.counter_amounts} value={counterAmt} onPick={setCounterAmt}
            disabled={(a) => !b.branch_open || (counterKind === "deposit" ? game.cash < a : acct.balance < a)} />
          <button className="btn-primary mt-2 w-full" disabled={busy || !counterAmt || !b.branch_open}
            onClick={() => run(bankCounter(counterKind, counterAmt), counterKind === "deposit" ? "At the counter" : "The cashier is counting")}>
            {counterKind === "deposit" ? "Deposit" : "Withdraw"} {counterAmt ? naira(counterAmt) : ""}
          </button>
        </Section>
      )}
      {b.atm && (
        <Section title={b.atm.owner ? `${b.atm.owner_name} ATM` : "ATMs (every bank)"}
          subtitle={!acct ? "You need a bank account and a debit card." : !acct.card
            ? `${acct.name} has no card. Cash out at a POS agent by transfer.`
            : `Up to ${naira(acct.atm_left)} more today.${b.atm.owner && b.atm.owner !== acct.bank ? ` Another bank's ATM: ₦${b.atm_fee} fee.` : ""}`}>
          <Chips amounts={b.atm_amounts} value={atmAmt} onPick={setAtmAmt}
            disabled={(a) => !acct?.card || acct.balance < a || acct.atm_left < a} />
          <button className="btn-primary mt-2 w-full" disabled={busy || !atmAmt || !acct?.card}
            onClick={() => run(atm(atmAmt), "Inserting your card…")}>
            Withdraw {atmAmt ? naira(atmAmt) : ""}
          </button>
        </Section>
      )}
      {b.pos && (
        <Section title="POS agent" subtitle="Cash out or deposit right here. The agent charges ₦100 for every ₦5,000.">
          {!acct ? (
            <p className="text-sm text-muted">You need a bank account to use POS.</p>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                {["withdraw", "deposit"].map((kind) => (
                  <button key={kind} onClick={() => setPosKind(kind)} aria-pressed={posKind === kind}
                    className={`rounded-lg py-1.5 text-sm font-bold ${posKind === kind ? "bg-ink text-white" : "bg-line/60"}`}>
                    {kind === "withdraw" ? "Get cash" : "Deposit cash"}
                  </button>
                ))}
              </div>
              {posKind === "withdraw" && (
                <div className="mb-2 flex gap-1.5 text-sm">
                  {["card", "transfer"].map((m) => (
                    <button key={m} onClick={() => setPosMethod(m)} aria-pressed={posMethod === m} disabled={m === "card" && !acct.card}
                      className={`flex-1 rounded-full px-2 py-1 font-bold disabled:opacity-40 ${posMethod === m ? "bg-ife-700 text-white" : "bg-white ring-1 ring-line"}`}>
                      {m === "card" ? "💳 Swipe card" : "📲 Transfer to agent"}
                    </button>
                  ))}
                </div>
              )}
              <Chips amounts={b.pos_amounts} value={posAmt} onPick={setPosAmt} note={(a) => `+₦${b.pos_charges[a]}`}
                disabled={(a) => (posKind === "withdraw" ? acct.balance < a + b.pos_charges[a] : game.cash < a + b.pos_charges[a])} />
              <button className="btn-primary mt-2 w-full" disabled={busy || !posAmt}
                onClick={() => run(pos(posKind, posAmt, posMethod), "The POS agent is counting")}>
                {posKind === "withdraw" ? "Get" : "Deposit"} {posAmt ? `${naira(posAmt)} (charge ₦${b.pos_charges[posAmt]})` : ""}
              </button>
            </>
          )}
        </Section>
      )}
    </div>
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
  const [amount, setAmount] = useState(null);
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
  const fee = (a) => b.transfer_fees[a] ?? 0;
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
    const g = await run(transfer(number, bankId, amount), `Sending ${naira(amount)}`);
    if (g) {
      setTab("home");
      setWho(null);
      setNumber("");
      setAmount(null);
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
              <Chips amounts={b.transfer_amounts} value={amount} onPick={setAmount} note={(a) => `fee ₦${fee(a)}`}
                disabled={(a) => acct.balance < a + fee(a) || acct.sent_left < a} />
              <button className="btn-primary w-full" disabled={busy || !amount} onClick={send}>
                Send {amount ? naira(amount) : ""} to {who.name.split(" ")[0]}
              </button>
              <p className="text-xs text-muted">Check the name. Transfers can't be reversed.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
