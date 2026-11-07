import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Scene, Vector3 } from "@babylonjs/core";
import { buildAvatar } from "./avatar.js";
import { cleanLook } from "./look.js";
import { cleanName } from "./online.js";

const KEY = "asmr-squishy-obby:friends";
const MAX_FRIENDS = 40;
const PHOTO_SIZE = 128;
const SETTLE_FRAMES = 90;

let studio = null;
let queue = Promise.resolve();

/** Friends you added, saved in this browser. Adding is one-way: they don't have to add you back. */
export function loadFriends() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((friend) => friend && typeof friend.id === "string" && /^[0-9a-f]{16}$/.test(friend.id))
      .slice(0, MAX_FRIENDS)
      .map((friend) => ({
        id: friend.id,
        name: cleanName(friend.name),
        look: cleanLook(friend.look),
        photo: typeof friend.photo === "string" && friend.photo.startsWith("data:image/") ? friend.photo : "",
      }));
  } catch {
    return [];
  }
}

export function saveFriends(friends) {
  try {
    localStorage.setItem(KEY, JSON.stringify(friends.slice(0, MAX_FRIENDS)));
  } catch {
    // Private mode or a full store: friends just won't persist.
  }
}

/**
 * Renders a headshot of an avatar in `look` to a data URL. One small hidden renderer is
 * shared, and shots are taken one at a time.
 */
export function snapshotLook(look) {
  const shot = queue.then(() => shoot(look));
  queue = shot.catch(() => {});
  return shot;
}

async function shoot(look) {
  studio ??= createStudio();
  const { engine, scene, camera, avatar, canvas } = studio;
  avatar.apply(look);
  avatar.update(0, { x: 0, y: 0, z: 0, facing: 0, airborne: false, moving: false, time: 0 });
  camera.target.set(0, avatar.height * 0.74, 0);
  camera.radius = avatar.height * 0.95;
  engine.setSize(PHOTO_SIZE, PHOTO_SIZE);
  for (let frame = 0; frame < SETTLE_FRAMES && !shownReady(scene); frame += 1) {
    scene.render();
    await nextFrame();
  }
  scene.render();
  return canvas.toDataURL("image/webp", 0.86);
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// Unworn outfit parts keep never-painted textures, so scene.isReady() would never pass.
const shownReady = (scene) => scene.meshes.every((mesh) => !mesh.isEnabled() || mesh.isReady(true));

function createStudio() {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const engine = new Engine(canvas, true, {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  engine.enableOfflineSupport = false;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const camera = new ArcRotateCamera("photoCam", Math.PI / 2 - 0.3, 1.42, 1.5, Vector3.Zero(), scene);
  camera.minZ = 0.05;
  camera.fov = 0.7;
  const hemi = new HemisphericLight("photoHemi", new Vector3(0.2, 1, 0.3), scene);
  hemi.intensity = 0.85;
  hemi.groundColor = new Color3(0.55, 0.45, 0.55);
  const key = new DirectionalLight("photoKey", new Vector3(-0.4, -0.6, 0.7), scene);
  key.intensity = 0.55;
  const avatar = buildAvatar(scene);
  return { engine, scene, camera, avatar, canvas };
}
