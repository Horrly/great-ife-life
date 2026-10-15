import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useGame } from "../lib/game";

export default function NewGame() {
  const { start } = useGame();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState([]);
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/config/", { code: null }).then((c) => setDepartments(c.departments)).catch((e) => setError(e.message));
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
        <fieldset>
          <legend className="font-bold">Course of study</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {departments.map((d) => (
              <label
                key={d.id}
                className={`cursor-pointer rounded-lg border-2 px-3 py-3 ${
                  department === d.id ? "border-ife-600 bg-ife-50" : "border-line bg-slab hover:border-ife-100"
                }`}
              >
                <input type="radio" name="department" value={d.id} className="sr-only" onChange={() => setDepartment(d.id)} />
                <span className="block font-bold">{d.name}</span>
                <span className="block text-xs text-muted">{d.code}</span>
              </label>
            ))}
          </div>
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
