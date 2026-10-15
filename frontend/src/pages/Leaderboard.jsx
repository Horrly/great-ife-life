import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Footer, Loading } from "../App";
import { api } from "../lib/api";

export default function Leaderboard() {
  const [departments, setDepartments] = useState([]);
  const [dept, setDept] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/config/", { code: null }).then((c) => setDepartments(c.departments)).catch(() => {});
  }, []);

  useEffect(() => {
    setRows(null);
    api(`/leaderboard/${dept ? `?department=${dept}` : ""}`, { code: null })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [dept]);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-xl px-5 py-10">
        <Link to="/" className="text-sm font-bold text-ife-600">
          Great Ife Life
        </Link>
        <h1 className="display mt-3 text-5xl font-black text-ife-900">Best graduates</h1>
        <p className="mt-2 text-muted">Top 25 by CGPA. Graduate with a name to appear here.</p>
        <select className="input mt-5" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        {error && <p className="mt-4 text-danger">{error}</p>}
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="mt-6 slab p-6 text-center text-muted">Nobody has graduated here yet. Be the first.</p>
        ) : (
          <ol className="mt-5 slab divide-y divide-line">
            {rows.map((r, i) => (
              <li key={r.share_code}>
                <Link to={`/c/${r.share_code}`} className="flex items-center gap-4 px-4 py-3 hover:bg-white">
                  <span className="num display w-8 text-3xl font-black text-ife-600">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {r.department}, started as {r.profile}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="num display block text-3xl font-black">{r.cgpa.toFixed(2)}</span>
                    <span className="block text-xs text-muted">{r.class}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
      <Footer />
    </div>
  );
}
