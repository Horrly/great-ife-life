import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makePerson, preloadPeople } from "../game3d/characters";
import { HAIR_NAMES, LOOK, PRINT_NAMES, randomLook } from "../game3d/look";
import { sfx } from "../lib/sfx";

// little things your student does while you dress them
const FIDGETS = ["idle", "idle", "yes", "idle", "phone", "idle", "fold"];

/** Your student on a studio turntable: drag to spin. */
export default function AvatarPreview({ look, className = "" }) {
  const host = useRef(null);
  const state = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.current.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60);
    scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a60", 1.1));
    const key = new THREE.DirectionalLight("#fff1dc", 2.2);
    key.position.set(3, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#cfe3ff", 1.2);
    rim.position.set(-4, 4, -4);
    scene.add(rim);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.9, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#c4dfcf", roughness: 1 }));
    scene.add(ground);
    const s = { renderer, scene, camera, person: null, raf: 0, spin: 0.35, drag: null, vel: 0, t: 0, fidget: 0 };
    state.current = s;
    const size = () => {
      const w = host.current?.clientWidth || 200;
      const h = host.current?.clientHeight || 260;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      // frame the whole body, head to shoes, whatever the box's shape
      const fit = Math.max(4.3 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))), 2.4 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      camera.position.set(0, 2.1, fit * 1.04);
      camera.lookAt(0, 1.75, 0);
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host.current);
    const el = renderer.domElement;
    const down = (e) => {
      s.drag = e.clientX;
      s.vel = 0;
    };
    const move = (e) => {
      if (s.drag == null) return;
      const dx = e.clientX - s.drag;
      s.drag = e.clientX;
      s.spin += dx * 0.012;
      s.vel = dx * 0.012;
    };
    const up = () => (s.drag = null);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      s.t += dt;
      if (s.drag == null) {
        s.spin += s.vel;
        s.vel *= 0.92;
      }
      if (s.person) {
        s.person.rotation.y = s.spin;
        s.fidget -= dt;
        if (s.fidget <= 0) {
          s.fidget = 4 + Math.random() * 3;
          s.person.act(FIDGETS[Math.floor(Math.random() * FIDGETS.length)]);
        }
        s.person.tick(dt);
      }
      renderer.render(scene, camera);
      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
    preloadPeople()
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => {
      cancelAnimationFrame(s.raf);
      ro.disconnect();
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.person) s.scene.remove(s.person);
    s.person = makePerson(look, { bag: true, scale: 1 });
    s.person.rotation.y = s.spin;
    s.person.act("idle");
    s.fidget = 3;
    s.scene.add(s.person);
  }, [look, loading]);

  return (
    <div className={`relative ${className}`}>
      <div ref={host} className="absolute inset-0 cursor-grab active:cursor-grabbing" role="img" aria-label="Your student. Drag to turn them around." />
      {loading && <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-muted">Getting dressed…</span>}
      {!loading && <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-semibold text-ife-900/50">Drag to turn</span>}
    </div>
  );
}

export function LookPicker({ look, onChange, halls }) {
  const female = (look.hall ?? 0) === 1;
  const set = (key, i) => {
    sfx("tap");
    navigator.vibrate?.(8);
    onChange({ ...look, [key]: i });
  };
  const swatch = (key, label) => (
    <fieldset>
      <legend className="text-sm font-bold">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {LOOK[key].map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => set(key, i)}
            className={`h-9 w-9 rounded-full border-2 ${(look[key] ?? 0) === i ? "border-ink ring-2 ring-bulb" : "border-white"}`}
            style={{ background: c }}
            aria-label={`${label} ${i + 1}`}
            aria-pressed={(look[key] ?? 0) === i}
          />
        ))}
      </div>
    </fieldset>
  );
  const words = (key, label, names, only) => (
    <fieldset>
      <legend className="text-sm font-bold">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {LOOK[key].map((v, i) =>
          only && !only.includes(v) ? null : (
            <button
              key={v}
              type="button"
              onClick={() => set(key, i)}
              aria-pressed={(look[key] ?? 0) === i}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${(look[key] ?? 0) === i ? "bg-ink text-white" : "bg-chip text-ink"}`}
            >
              {names[v]}
            </button>
          ),
        )}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-3.5">
      <button
        type="button"
        className="w-full rounded-full bg-chip py-2.5 text-sm font-bold"
        onClick={() => {
          sfx("roll");
          // keep the hall (it decides where you live); everything else is a surprise
          onChange({ ...randomLook(), hall: look.hall ?? 0 });
        }}
      >
        🎲 Randomise
      </button>
      {halls && words("hall", "Body", { male: "Man", female: "Woman" })}
      {swatch("skin", "Skin tone")}
      {words("hair", "Hair", HAIR_NAMES)}
      {swatch("hair_color", "Hair colour")}
      {!female && words("beard", "Beard", { none: "No beard", beard: "Beard" })}
      {swatch("top", "Top")}
      {words("print", "Fabric", PRINT_NAMES)}
      {words("style", "Wear", { trousers: "Trousers", skirt: "Skirt" })}
      {swatch("bottom", look.style === 1 ? "Skirt" : "Trousers")}
      {swatch("shoes", "Shoes")}
    </div>
  );
}
