// Dev tool, not part of the game build. Open /scripts/car-previews.html on the dev server, then
// `window.studio.preview(id)` returns the picker picture for one car as a WebP data URL and
// `window.studio.view(id, angle)` frames a car for comparing it with a reference photo.
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from "@babylonjs/core";
import { CARS, buildFleetCar, setCarDetail } from "../src/cityCars.js";

const canvas = document.querySelector("#studio");
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.86, 0.89, 0.93, 1);
const hemi = new HemisphericLight("hemi", new Vector3(0.15, 1, 0.2), scene);
hemi.intensity = 0.62;
hemi.diffuse = new Color3(1, 0.97, 0.95);
hemi.groundColor = new Color3(0.42, 0.42, 0.46);
const sun = new DirectionalLight("sun", new Vector3(-0.35, -1, 0.25), scene);
sun.position.set(8, 18, -6);
sun.intensity = 1.1;
sun.diffuse = new Color3(1, 0.96, 0.9);
const shadow = new ShadowGenerator(2048, sun);
shadow.usePercentageCloserFiltering = true;
shadow.darkness = 0.35;
shadow.bias = 0.004;
const floor = MeshBuilder.CreateDisc("floor", { radius: 30, tessellation: 64 }, scene);
floor.rotation.x = Math.PI / 2;
floor.receiveShadows = true;
const floorMat = new StandardMaterial("floor", scene);
floorMat.diffuseColor = new Color3(0.8, 0.82, 0.86);
floorMat.specularColor = new Color3(0.05, 0.05, 0.05);
floor.material = floorMat;

const camera = new ArcRotateCamera("camera", -Math.PI / 4, 1.2, 7, new Vector3(0, 0.6, 0), scene);
camera.minZ = 0.05;
camera.fov = 0.5;
setCarDetail(scene, { reflections: true, near: Infinity });

let current = null;

function place(def, steer = 0) {
  current?.root.dispose();
  shadow.getShadowMap().renderList.length = 0;
  current = buildFleetCar(scene, `studio-${def.id}`, { paint: def.paint, type: def.type });
  for (const mesh of current.root.getChildMeshes(false)) shadow.addShadowCaster(mesh, false);
  for (const wheel of current.wheels) if (wheel.front) wheel.pivot.rotation.y = steer;
  return current;
}

async function settle() {
  await scene.whenReadyAsync();
  for (let i = 0; i < 4; i += 1) {
    scene.render();
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

function frame(view) {
  camera.fov = view.fov ?? 0.5;
  camera.target.set(...(view.target ?? [0, 0.6, 0]));
  camera.alpha = view.alpha;
  camera.beta = view.beta;
  camera.radius = view.radius;
}

async function capture(width, height, type = "image/png", quality = 0.9) {
  engine.setSize(width, height);
  await settle();
  return canvas.toDataURL(type, quality);
}

/** Front three-quarter from the driver's side, like a showroom photo. */
const PREVIEW = { alpha: Math.PI * 0.3, beta: 1.2, radius: 7.6, target: [0, 0.55, 0.05], fov: 0.5 };

window.studio = {
  ids: CARS.map((def) => def.id),
  async preview(id) {
    const def = CARS.find((car) => car.id === id);
    place(def, -0.22);
    const small = def.preview ?? {};
    frame({ ...PREVIEW, ...small });
    floor.isVisible = false;
    scene.clearColor = new Color4(0, 0, 0, 0);
    const url = await capture(720, 420, "image/webp", 0.86);
    floor.isVisible = true;
    scene.clearColor = new Color4(0.86, 0.89, 0.93, 1);
    return url;
  },
  /** angle: { alpha, beta, radius, target, fov, steer, width, height } */
  async view(id, angle) {
    const def = CARS.find((car) => car.id === id);
    place(def, angle.steer ?? 0);
    frame(angle);
    return capture(angle.width ?? 1200, angle.height ?? 800, "image/jpeg", 0.9);
  },
  get car() {
    return current;
  },
  scene,
};
window.studioReady = true;
