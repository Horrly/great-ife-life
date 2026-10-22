// Tapping a person: campus people (NPCs) can be greeted, gisted with, joked with or shaded. Real students
// can also be messaged, sent money, invited to your room, or blocked.
import { useState } from "react";
import { naira } from "../lib/format";
import { useGame } from "../lib/game";
import { sfx } from "../lib/sfx";
import { AmountInput } from "./Banking";
import { Thread } from "./Chat";
import { FriendBar, LEVEL_COLOR } from "./MeSheet";
import { BottomSheet } from "./ui";

// what you can do with someone; the later ones open as you get closer (the server checks too)
const SOCIAL = [
  ["hello", "👋🏾", "Say hello", "+Social", 0],
  ["gist", "💬", "Gist", "+Fun · +Social", 0],
  ["joke", "😂", "Crack a joke", null, 0],
  ["hype", "🙌🏾", "Hype them up", "+Social · +Fun", 10],
  ["life", "🫶🏾", "Talk about life", "++Social", 30],
  ["hang", "🚶🏾", "Hang out", "++Fun · ++Social", 30],
  ["borrow", "🙏🏾", "Ask for small money", "Once a day", 60, "npc"],
  ["shade", "😒", "Throw shade", "+Fun · −Friendship", 0],
];
const LEVEL_AT = { 10: "Acquaintance", 30: "Friend", 60: "Close friend" };
const FEE = (n) => (n <= 5000 ? 10 : n <= 50000 ? 25 : 50);

export function PersonSheet({ person, game, busy, onSocial, onClose, onChat, onSend }) {
  const { chat } = useGame();
  const [sending, setSending] = useState(false);
  const [amount, setAmount] = useState(1000);
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState("");
  const player = person.kind === "player";
  const chance = Math.min(95, 52 + 5 * (game.skills?.find?.((s) => s.id === "charisma")?.level ?? 1));
  const known = game.people?.find((p) => p.name === person.name);
  const rel = known || { bond: 0, level: "Stranger", floor: 0, next: 10, next_name: "Acquaintance" };
  const maxSend = Math.min(200_000, game.bank?.balance || 0);
  const initials = person.name.replace(/^@/, "").slice(0, 1).toUpperCase();
  return (
    <BottomSheet onClose={onClose} label={person.name} height={sending ? "78%" : "auto"}
      header={
        <div className="flex items-center gap-3">
          <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-black text-white ${player ? "bg-[#2f7de1]" : "bg-ink"}`}>
            {initials}
          </span>
          <span className="min-w-0">
            <span className="display block truncate text-[1.4rem] text-ife-900">{player ? `@${person.name}` : person.name}</span>
            <span className="block truncate text-sm text-muted">
              {player ? `Real student${person.role ? ` · ${person.role}` : ""}` : person.role || "On campus"} ·{" "}
              <b style={{ color: LEVEL_COLOR[rel.level] }}>{rel.level}</b>
            </span>
          </span>
        </div>
      }>
      {player && !sending && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button className="btn rounded-full bg-go py-3 text-white" onClick={() => onChat(person)}>💬 Chat</button>
          <button className="btn rounded-full bg-chip py-3" onClick={() => setSending(true)} disabled={!game.bank}>
            💸 Send money
          </button>
          {!game.bank && <p className="col-span-2 -mt-1 text-xs text-muted">Open a bank account to send money to students.</p>}
        </div>
      )}
      {sending ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Lands in {person.name}'s account right away. Fee ₦10–₦50.</p>
          <AmountInput value={amount} onChange={setAmount} min={100} max={maxSend} step={50}
            chips={[500, 1000, 5000, 10000]} />
          <button type="button" className="rounded-full bg-chip px-3 py-1 text-xs font-bold" onClick={() => setAmount(Math.max(100, maxSend - FEE(maxSend)))}>
            Max {naira(Math.max(0, maxSend - FEE(maxSend)))}
          </button>
          <input className="w-full rounded-xl bg-chip px-3 py-2.5 text-sm outline-none" placeholder="Note (optional)" value={note}
            onChange={(e) => setNote(e.target.value)} maxLength={60} aria-label="Note" />
          <div className="grid grid-cols-2 gap-2">
            <button className="btn rounded-full bg-chip py-3" onClick={() => setSending(false)}>Back</button>
            <button className="btn rounded-full bg-go py-3 text-white" disabled={busy || !amount}
              onClick={async () => {
                const ok = await onSend(person, amount, note);
                if (ok) {
                  sfx("cash");
                  setSending(false);
                  setFlash(`Sent ${naira(amount)} to ${person.name}`);
                }
              }}>
              Send {naira(amount || 0)} · fee {naira(FEE(amount || 0))}
            </button>
          </div>
        </div>
      ) : (
        <>
          {flash && <p className="mb-3 rounded-xl bg-[#e3f3ea] px-3 py-2 text-sm font-semibold text-ife-900" role="status">{flash}</p>}
          <div className="mb-3 rounded-2xl bg-slab px-3 py-2.5">
            <p className="flex justify-between text-xs font-bold">
              <span style={{ color: LEVEL_COLOR[rel.level] }}>{rel.level}</span>
              <span className="text-muted">{rel.next ? `${Math.floor(rel.bond)}/${rel.next} to ${rel.next_name}` : "As close as it gets"}</span>
            </p>
            <FriendBar p={rel} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SOCIAL.filter((x) => !(player && x[5] === "npc")).map(([kind, emoji, label, tags, needs]) => {
              const locked = rel.bond < needs;
              return (
                <button key={kind} disabled={busy || locked} onClick={() => onSocial(person, kind)}
                  className={`flex flex-col items-start rounded-2xl px-3.5 py-3 text-left disabled:opacity-60 ${locked ? "bg-slab" : "bg-chip"}`}>
                  <span className="text-sm font-bold"><span aria-hidden>{locked ? "🔒" : emoji}</span> {label}</span>
                  <span className="mt-0.5 text-xs text-muted">
                    {locked ? `Opens at ${LEVEL_AT[needs]} (${Math.floor(rel.bond)}/${needs})` : kind === "joke" ? `${chance}% · +Fun · +Social` : tags}
                  </span>
                </button>
              );
            })}
          </div>
          {player && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {game.room?.code && (
                <button className="rounded-full bg-chip px-3 py-1.5 text-xs font-bold" onClick={async () => {
                  try {
                    const res = await chat.dm({ game: person.id });
                    await chat.send(res.thread.id, `🏠 Come and stay with me! My room code is ${game.room.code}`);
                    setFlash(`Invite sent to ${person.name}`);
                  } catch (e) {
                    setFlash(e.message);
                  }
                }}>🏠 Invite to my room</button>
              )}
              <button className="rounded-full bg-chip px-3 py-1.5 text-xs font-bold" onClick={async () => {
                try {
                  await chat.block(person.id);
                  setFlash(`${person.name} is blocked. They can't message you.`);
                } catch (e) {
                  setFlash(e.message);
                }
              }}>🚫 Block</button>
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}

/** A private chat with one student, opened from their sheet. */
export function DmSheet({ thread, name, onClose }) {
  return (
    <BottomSheet onClose={onClose} label={`Chat with ${name}`} height="86%"
      header={<span className="display block truncate text-[1.3rem] text-ife-900">🔒 {name}</span>}>
      <div className="-mx-4 -mb-4 flex h-full min-h-[22rem] flex-col rounded-b-[22px] bg-[#0f5132] text-white">
        <Thread id={thread} onBack={onClose} onOpen={() => {}} />
      </div>
    </BottomSheet>
  );
}
