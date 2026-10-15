import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Footer, Loading } from "../App";
import GradCard from "../components/GradCard";
import { api } from "../lib/api";

/** A shared graduation card. This is where most new players arrive from WhatsApp and X. */
export default function CardPage() {
  const { code } = useParams();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api(`/cards/${encodeURIComponent(code)}/`, { code: null }).then(setCard).catch(() => setError(true));
  }, [code]);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-md px-5 py-10">
        {error ? (
          <p className="slab p-6 text-center text-muted">This card doesn't exist, or it was taken down.</p>
        ) : !card ? (
          <Loading />
        ) : (
          <>
            <p className="mb-4 text-sm font-bold text-ife-600">Can you beat this?</p>
            <GradCard card={card} />
          </>
        )}
        <Link to="/new" className="btn-primary mt-6 w-full py-4 text-lg">
          Play Great Ife Life
        </Link>
        <p className="mt-3 text-center text-sm text-muted">Free, in your browser. Takes a minute to start.</p>
      </main>
      <Footer />
    </div>
  );
}
