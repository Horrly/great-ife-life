import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-ink px-4 py-2 text-center text-sm font-bold text-bulb" role="status">
      You're offline. Your game is saved. Reconnect to keep playing.
    </div>
  );
}
