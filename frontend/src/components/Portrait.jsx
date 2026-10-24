import { useEffect, useState } from "react";
import { portrait } from "../game3d/portrait";

/** A round 3D portrait of a person; their initial (or an emoji) while it draws, or if 3D isn't available. */
export default function Portrait({ look, name = "", size = 48, ring = "", bg = "#e6efe9", fallback }) {
  const [url, setUrl] = useState(null);
  const key = JSON.stringify(look || null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!look) return undefined;
    portrait(look, Math.min(256, Math.round(size * 2.5))).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [key, size]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-black text-white ${ring}`}
      style={{ width: size, height: size, background: url ? bg : "#16201a", fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} /> : fallback ?? name.replace(/^@/, "").slice(0, 1).toUpperCase()}
    </span>
  );
}
