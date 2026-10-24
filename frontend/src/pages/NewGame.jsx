import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useGame } from "../lib/game";

export default function NewGame() {
  const { start } = useGame();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [q, setQ] = useState("");
  const [faculty, setFaculty] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/config/", { code: null }).then((c) => {
      setDepartments(c.departments);
      setFaculties(c.faculties || []);
    }).catch((e) => setError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await start({ name: name.trim(), department });
      navigate("/admission");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-10">
      <Link to="/" className="text-sm font-bold text-ife-600">
        Back
      </Link>
      <h1 className="display mt-4 text-5xl font-black text-ife-900">Your JAMB result is out</h1>
      <p className="mt-3 text-muted">
        Pick your course. What kind of student life you get is up to fate, like real admission.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <fieldset className="min-w-0">
          <legend className="font-bold">Course of study</legend>
          <p className="text-sm text-muted">{departments.length} OAU courses across {faculties.length} faculties.</p>
          <input className="input mt-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: Law, Medicine, Mechanical…"
            aria-label="Search courses" />
          <div className="chip-row mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Faculty">
            {["", ...faculties].map((f) => (
              <button key={f || "all"} type="button" role="tab" aria-selected={faculty === f} onClick={() => setFaculty(f)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${faculty === f ? "bg-ink text-white" : "bg-chip"}`}>
                {f || "All"}
              </button>
            ))}
          </div>
          {(() => {
            const term = q.trim().toLowerCase();
            const shown = departments.filter((d) => (!faculty || d.faculty === faculty)
              && (!term || `${d.name} ${d.code} ${d.faculty}`.toLowerCase().includes(term)));
            const groups = [...new Set(shown.map((d) => d.faculty))];
            if (!shown.length) return <p className="mt-4 text-sm text-muted">No course matches “{q}”.</p>;
            return groups.map((g) => (
              <div key={g} className="mt-4">
                <h3 className="text-xs font-bold text-muted">Faculty of {g}</h3>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {shown.filter((d) => d.faculty === g).map((d) => (
                    <label key={d.id}
                      className={`cursor-pointer rounded-lg border-2 px-3 py-3 ${
                        department === d.id ? "border-ife-600 bg-ife-50" : "border-line bg-slab hover:border-ife-100"
                      }`}>
                      <input type="radio" name="department" value={d.id} className="sr-only" checked={department === d.id}
                        onChange={() => setDepartment(d.id)} />
                      <span className="block font-bold leading-tight">{d.name}</span>
                      <span className="block text-xs text-muted">{d.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            ));
          })()}
        </fieldset>
        <label className="block">
          <span className="font-bold">Your name on the leaderboard</span>
          <span className="block text-sm text-muted">Optional. Leave it empty to play anonymously.</span>
          <input
            className="input mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="e.g. Tunde B."
            autoComplete="nickname"
          />
        </label>
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full py-4 text-lg" disabled={!department || busy}>
          {busy ? "Checking the admission list…" : "Check admission list"}
        </button>
      </form>
    </main>
  );
}
