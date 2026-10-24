// Head-and-shoulders portraits of people, drawn from the same 3D model as the game, for sheets and the HUD.
// One small offscreen renderer is shared; each look is drawn once and kept as an image.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { makePerson, preloadPeople } from "./characters";

let renderer = null;
let scene = null;
let camera = null;
const cache = new Map();
let queue = Promise.resolve();

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(1);
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight("#ffffff", "#9a8a70", 0.9));
  const key = new THREE.DirectionalLight("#fff3e6", 2.0); // soft studio key light from the front-left
  key.position.set(-1.5, 4.5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight("#d6e6ff", 1.1);
  rim.position.set(2.5, 3.5, -3);
  scene.add(rim);
  camera = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
}

/** A data URL of this person's face. Resolves to null where WebGL isn't available. */
export function portrait(look, size = 160) {
  const key = `${JSON.stringify(look || {})}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const job = (queue = queue.then(async () => {
    try {
      await preloadPeople();
      if (!renderer) setup();
      renderer.setSize(size, size, false);
      const person = makePerson(look || {}, { scale: 1 });
      person.act("idle");
      person.tick(0.4);
      person.rotation.y = 0.28;
      scene.add(person);
      person.updateMatrixWorld(true);
      const head = new THREE.Vector3(0, 3.2, 0);
      person.traverse((o) => {
        if (o.isBone && o.name === "Head") o.getWorldPosition(head);
      });
      camera.position.set(head.x + 0.14, head.y + 0.16, head.z + 1.5);
      camera.lookAt(head.x, head.y + 0.04, head.z);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      scene.remove(person);
      return url;
    } catch {
      return null;
    }
  }));
  cache.set(key, job);
  return job;
}
