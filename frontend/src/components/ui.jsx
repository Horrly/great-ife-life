// The few shapes every screen is built from: a bottom sheet, pill tabs, one toast at a time,
// decision cards at the bottom, and a centred card for big moments.
import { useEffect, useRef, useState } from "react";
import { sfx, soundFor } from "../lib/sfx";

/** Every menu is the same sheet: slides up, 86% tall, grab handle, tap the dimmed campus (or ×) to close. */
export function BottomSheet({ title, subtitle, onClose, children, label, height = "86%", header, footer, tone = "white" }) {
  const ref = useRef(null);
  const start = useRef(null);
  const [drag, setDrag] = useState(0);
  useEffect(() => {
    sfx("open");
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-end justify-center" role="presentation">
      <button className="absolute inset-0 cursor-default bg-black/15" aria-label="Close" onClick={onClose} tabIndex={-1} />
      <section
        ref={ref}
        role="dialog"
        aria-label={label || title}
        className={`slide-up relative flex w-full max-w-[560px] flex-col rounded-t-[22px] shadow-2xl sm:mb-3 sm:rounded-[22px] ${tone === "white" ? "bg-white" : "bg-slab"}`}
        style={{ height, transform: drag ? `translateY(${drag}px)` : undefined }}
      >
        <div
          className="flex shrink-0 touch-none justify-center pb-1 pt-2"
          onPointerDown={(e) => {
            start.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => start.current !== null && setDrag(Math.max(0, e.clientY - start.current))}
          onPointerUp={() => {
            if (drag > 90) onClose?.();
            start.current = null;
            setDrag(0);
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden />
        </div>
        {(title || header) && (
          <header className="flex shrink-0 items-start gap-3 px-4 pb-2">
            <div className="min-w-0 flex-1">
              {header || (
                <>
                  <h2 className="display truncate text-[1.6rem] text-ife-900">{title}</h2>
                  {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
                </>
              )}
            </div>
            {onClose && (
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-chip text-lg font-bold text-muted" onClick={onClose} aria-label="Close">
                ×
              </button>
            )}
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-line/60 px-4 py-3">{footer}</div>}
      </section>
    </div>
  );
}

/** Pill tabs in a row that scrolls sideways. The active one is filled. */
export function PillTabs({ tabs, value, onChange, dark = true }) {
  return (
    <div className="chip-row -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2" role="tablist">
      {tabs.map(([id, label, badge]) => (
        <button key={id} role="tab" aria-selected={value === id}
          onClick={() => {
            sfx("tap");
            onChange(id);
          }}
          className={`relative shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
            value === id ? (dark ? "bg-ink text-white" : "bg-ife-600 text-white") : "bg-chip text-ink"
          }`}>
          {label}
          {badge ? <span className="ml-1 rounded-full bg-danger px-1.5 text-[11px] font-black text-white">{badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** One toast at a time, top-centre under the status pills. Errors stay until tapped. */
export function Toast({ messages, error, onDismiss, onDone, top = "7.2rem" }) {
  const [index, setIndex] = useState(0);
  const list = messages || [];
  useEffect(() => setIndex(0), [messages]);
  const current = error || list[index];
  useEffect(() => {
    if (!current) return undefined;
    sfx(error ? "error" : soundFor(current));
    if (error) return undefined;
    const long = current.length > 90 ? 7000 : 4500;
    const id = setTimeout(() => {
      if (index + 1 < list.length) setIndex(index + 1);
      else onDone?.();
    }, long);
    return () => clearTimeout(id);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!current) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[25] flex justify-center px-4" style={{ top }} aria-live="polite">
      <button key={current + index} onClick={() => (error ? onDismiss() : onDone?.())}
        className={`toast-in pointer-events-auto w-full max-w-md rounded-2xl px-4 py-2.5 text-left text-sm font-medium shadow-[0_8px_28px_rgb(10_44_29/0.16)] ${
          error ? "bg-danger text-white" : "bg-white/95 text-ink"
        }`} role={error ? "alert" : "status"}>
        {current}
        {!error && list.length > 1 && <span className="ml-1 text-xs text-muted">({index + 1}/{list.length})</span>}
        {error && <span className="ml-2 text-xs font-bold underline">OK</span>}
      </button>
    </div>
  );
}

/** Events and choices: a pale card at the bottom, above the controls, until you answer. */
export function DecisionCard({ event, onChoose, busy }) {
  useEffect(() => sfx("notice"), [event?.id]);
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 flex justify-center p-3" role="dialog" aria-modal="true" aria-label={event.title}>
      <div className="slide-up w-full max-w-[560px] rounded-3xl bg-bulb-soft p-4 shadow-2xl ring-1 ring-black/5">
        <h2 className="display text-[1.45rem] text-ink">{event.title}</h2>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink/80">{event.text}</p>
        <div className="mt-3 space-y-2">
          {event.choices.map((c, i) => (
            <button key={c.label} disabled={busy || !c.enabled}
              onClick={() => {
                sfx("tap");
                onChoose(i);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left font-semibold shadow-sm disabled:opacity-50">
              <span>{c.label}</span>
              {!c.enabled && c.reason && <span className="shrink-0 text-xs font-bold uppercase text-muted">{c.reason}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Big moments only: results, graduation. The campus dims behind. */
export function MomentCard({ children, label }) {
  useEffect(() => sfx("wish"), []);
  return (
    <div className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-ink/45 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="pop max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">{children}</div>
    </div>
  );
}

/** A progress ring with something in the middle (an emoji, a level number). */
export function Ring({ value, size = 36, stroke = 4, color = "#1c9a5e", track = "rgb(0 0 0 / 0.08)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: "stroke-dashoffset .3s" }} />
      </svg>
      <span className="relative leading-none">{children}</span>
    </span>
  );
}
