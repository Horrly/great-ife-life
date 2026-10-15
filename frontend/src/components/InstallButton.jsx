import { useEffect, useState } from "react";

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

/** "Install the app": Android/Chrome gets the real install prompt; iPhone gets Add to Home Screen steps. */
export default function InstallButton() {
  const [prompt, setPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!prompt && !isIos())) return null;

  return (
    <div className="mt-4">
      <button
        className="btn-ghost w-full"
        onClick={async () => {
          if (prompt) {
            prompt.prompt();
            const { outcome } = await prompt.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setPrompt(null);
          } else {
            setShowIos((v) => !v);
          }
        }}
      >
        Install the app on your phone
      </button>
      {showIos && (
        <p className="mt-2 rounded-lg bg-slab px-3 py-2 text-sm text-muted">
          In Safari, tap the <b className="text-ink">Share</b> button, then <b className="text-ink">Add to Home Screen</b>. Great Ife Life
          opens full screen like any other app.
        </p>
      )}
    </div>
  );
}
