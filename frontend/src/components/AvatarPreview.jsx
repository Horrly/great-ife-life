import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LOOK, makePerson } from "../game3d/characters";

/** A slowly turning 3D preview of your student. */
export default function AvatarPreview({ look, className = "" }) {
  const host = useRef(null);
  const state = useRef(null);

  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 2.4, 9);
    camera.lookAt(0, 1.55, 0);
    scene.add(new THREE.HemisphereLight("#ffffff", "#7a6a50", 1.6));
    const sun = new THREE.DirectionalLight("#fff3dc", 1.4);
    sun.position.set(3, 6, 5);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#c4dfcf" }));
    scene.add(ground);
    const s = { renderer, scene, camera, person: null, raf: 0 };
    state.current = s;
    const size = () => {
      const w = host.current?.clientWidth || 200;
      const h = host.current?.clientHeight || 260;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    const loop = () => {
      if (s.person) {
        s.person.rotation.y += 0.012;
        s.person.walk(0.016, 0);
      }
      renderer.render(scene, camera);
      s.raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(s.raf);
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const rot = s.person?.rotation.y ?? 0.5;
    if (s.person) s.scene.remove(s.person);
    s.person = makePerson(look, { bag: true, scale: 1.3 });
    s.person.rotation.y = rot;
    s.scene.add(s.person);
  }, [look]);

  return <div ref={host} className={className} role="img" aria-label="Your student" />;
}

export function LookPicker({ look, onChange, halls }) {
  const swatch = (key, label) => (
    <fieldset>
      <legend className="text-sm font-bold">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {LOOK[key].map((c, i) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange({ ...look, [key]: i })}
            className={`h-8 w-8 rounded-full border-2 ${look[key] === i ? "border-ink ring-2 ring-bulb" : "border-white"}`}
            style={{ background: c }}
            aria-label={`${label} ${i + 1}`}
            aria-pressed={look[key] === i}
          />
        ))}
      </div>
    </fieldset>
  );
  const words = (key, label, names) => (
    <fieldset>
      <legend className="text-sm font-bold">{label}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {LOOK[key].map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange({ ...look, [key]: i })}
            aria-pressed={look[key] === i}
            className={`rounded-full px-3 py-1.5 text-sm font-bold ${look[key] === i ? "bg-ife-600 text-white" : "bg-concrete text-ink"}`}
          >
            {names[v]}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-3">
      {swatch("skin", "Skin")}
      {words("hair", "Hair", { low_cut: "Low cut", afro: "Afro", braids: "Braids", bun: "Bun", dreads: "Dreads", bald: "Clean shave" })}
      {swatch("top", "Top")}
      {swatch("bottom", "Bottom")}
      {words("style", "Wear", { trousers: "Trousers", skirt: "Skirt" })}
      {halls && words("hall", "Hall of residence", halls)}
    </div>
  );
}
