import { Link } from "react-router-dom";
import { Footer } from "../App";

export default function Privacy() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-xl px-5 py-10 leading-relaxed">
        <Link to="/" className="text-sm font-bold text-ife-600">
          Great Ife Life
        </Link>
        <h1 className="display mt-3 text-5xl font-black text-ife-900">Privacy</h1>
        <p className="mt-4">Great Ife Life collects as little as possible.</p>
        <h2 className="mt-6 font-bold">What we store</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Your game progress, so you can come back to it.</li>
          <li>If you create an account: a username and your password (stored scrambled, never readable).</li>
          <li>If you type a name for the leaderboard, that name and your final CGPA, shown publicly.</li>
        </ul>
        <h2 className="mt-6 font-bold">What we don't collect</h2>
        <p className="mt-2">No email, phone number, real name, location, contacts or photos. No ads and no ad trackers.</p>
        <h2 className="mt-6 font-bold">On your device</h2>
        <p className="mt-2">Your browser keeps your save code and sign-in token so the game opens where you left off. Signing out removes them.</p>
        <h2 className="mt-6 font-bold">Deleting your data</h2>
        <p className="mt-2">
          To delete your account and games, or remove a name from the leaderboard, contact the developer through{" "}
          <a className="text-ife-600 underline" href="https://github.com/Horrly" target="_blank" rel="noreferrer">
            github.com/Horrly
          </a>
          .
        </p>
        <h2 className="mt-6 font-bold">Who it's for</h2>
        <p className="mt-2">Students of all ages play, so the game has no chat, no dating and no money transfers between players.</p>
      </main>
      <Footer />
    </div>
  );
}
