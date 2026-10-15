import { useEffect, useRef } from "react";

export function Sheet({ title, children, label }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ife-900/55 sm:items-center sm:p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label || title}
        className="reveal max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-slab p-6 sm:max-w-md sm:rounded-2xl"
      >
        {title && <h2 className="display text-4xl font-black text-ife-900">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function EventDialog({ event, onChoose, busy }) {
  return (
    <Sheet title={event.title}>
      <p className="mt-3 text-lg leading-relaxed">{event.text}</p>
      <div className="mt-6 grid gap-2">
        {event.choices.map((c, i) => (
          <button
            key={c.label}
            className={i === 0 ? "btn-primary py-4" : "btn-ghost py-4"}
            disabled={busy || !c.enabled}
            onClick={() => onChoose(i)}
          >
            {c.label}
            {!c.enabled && c.reason && <span className="text-xs font-normal"> ({c.reason})</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const GRADE_TONE = { A: "text-ife-600", B: "text-ife-600", C: "text-ink", D: "text-ink", E: "text-danger", F: "text-danger" };

/** The semester result slip. */
export function ResultSlip({ result, onNext, busy, nextLabel, onSave }) {
  return (
    <Sheet label={`Results for ${result.label}`}>
      <p className="text-sm font-bold text-ife-600">Result slip</p>
      <h2 className="display text-4xl font-black text-ife-900">{result.label}</h2>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-left text-xs text-muted">
            <th className="py-2 font-bold">Course</th>
            <th className="py-2 text-right font-bold">CA /30</th>
            <th className="py-2 text-right font-bold">Exam /70</th>
            <th className="py-2 text-right font-bold">Total</th>
            <th className="py-2 text-right font-bold">Grade</th>
          </tr>
        </thead>
        <tbody>
          {result.courses.map((c) => (
            <tr key={c.code} className="border-b border-line">
              <td className="py-2 font-bold">
                {c.code}
                {c.carry && <span className="ml-1 text-xs font-normal text-muted">(carryover)</span>}
              </td>
              <td className="num py-2 text-right">{c.ca}</td>
              <td className="num py-2 text-right">{c.exam}</td>
              <td className="num py-2 text-right">{c.total}</td>
              <td className={`display py-2 text-right text-2xl font-black ${GRADE_TONE[c.grade]}`}>{c.grade}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-concrete px-2 py-2">
          <dt className="text-xs text-muted">GPA</dt>
          <dd className="num display text-3xl font-black">{result.gpa.toFixed(2)}</dd>
        </div>
        <div className="rounded-lg bg-ife-600 px-2 py-2 text-white">
          <dt className="text-xs text-ife-100">CGPA</dt>
          <dd className="num display text-3xl font-black">{result.cgpa.toFixed(2)}</dd>
        </div>
        <div className="rounded-lg bg-concrete px-2 py-2">
          <dt className="text-xs text-muted">Attendance</dt>
          <dd className="num display text-3xl font-black">{result.attendance}%</dd>
        </div>
      </dl>
      {result.note && <p className="mt-4 rounded-lg bg-bulb-soft px-3 py-2 text-sm font-bold">{result.note}</p>}
      <button className="btn-primary mt-6 w-full py-4 text-lg" onClick={onNext} disabled={busy}>
        {nextLabel}
      </button>
      {onSave && (
        <button className="mt-3 w-full text-sm font-bold text-ife-600 underline underline-offset-2" onClick={onSave}>
          Don't lose this: save your progress to an account
        </button>
      )}
    </Sheet>
  );
}
