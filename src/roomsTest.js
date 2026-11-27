// Dev-only helpers for checking home interiors. Not imported by the game; in `npm run dev` with ?debug:
//   await (await import("/src/roomsTest.js")).boot(); await __go("apt-studio"); __cam([x, y, z], [x, y, z]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for the game, closes the splash, and opens City life. */
export async function boot() {
  for (let i = 0; i < 240 && !window.__obby; i += 1) await wait(1000);
  if (!window.__obby) return "no game";
  install();
  if (!window.__obby.city.active) {
    const start = [...document.querySelectorAll("button")].find((b) => b.offsetParent && /^Start\b/.test(b.textContent.trim()) && !b.textContent.includes("bouncing"));
    start?.click();
    await wait(1200);
    document.querySelector("#start-city")?.click();
    await wait(3000);
  }
  return window.__obby.city.active;
}

function install() {
  const scene = window.__obby.scene;
  /** Tours a style and walks in. */
  window.__go = async (id) => {
    const { city, player } = window.__obby;
    if (city.indoors) {
      city.leave();
      city.enter();
    }
    const spot = city.tour(id);
    player.respawn(spot.position, spot.heading);
    for (let i = 0; i < 40 && city.action !== "homeTour" && city.action !== "homeEnter"; i += 1) await wait(150);
    const errors = [];
    const warn = console.warn;
    console.warn = (...args) => {
      errors.push(`${args[0]} ${String(args[1]?.stack ?? args[1] ?? "").slice(0, 800)}`);
      warn(...args);
    };
    const result = city.act();
    console.warn = warn;
    if (result?.spot) player.respawn(result.spot.position, result.spot.heading);
    await wait(500);
    return { indoors: city.indoors, errors, meshes: scene.meshes.length, at: where() };
  };
  /** Pins the camera. Interior coordinates by default (lift added); pass world = true for city space. */
  let observer = null;
  window.__cam = (eye, target, fov = 0.9, { lift = 0, world = false } = {}) => {
    if (observer) scene.onBeforeRenderObservable.remove(observer);
    observer = null;
    if (!eye) return "off";
    const V = scene.activeCamera.position.constructor;
    const o = world ? [0, 0, 0] : [-1700, 160 + lift, 2600];
    const E = new V(eye[0] + o[0], eye[1] + o[1], eye[2] + o[2]);
    const T = new V(target[0] + o[0], target[1] + o[1], target[2] + o[2]);
    observer = scene.onBeforeRenderObservable.add(() => {
      const camera = scene.activeCamera;
      camera.position.copyFrom(E);
      camera.setTarget(T);
      camera.fov = fov;
    });
    return "on";
  };
  /** Puts the player at interior coordinates. */
  window.__put = (x, y, z, heading = 0, lift = 0) => {
    const V = scene.activeCamera.position.constructor;
    window.__obby.player.respawn(new V(-1700 + x, 160 + lift + y + 0.62, 2600 + z), heading);
  };
  window.__hud = (on) => {
    for (const el of document.querySelectorAll("#hud, #toast, #hint, #coins, #city-hud, #city-map, #touch-controls, .city-hud")) el.style.visibility = on ? "" : "hidden";
  };
  window.__where = where;
}

function where() {
  const p = window.__obby.player;
  const at = p.position ?? p.foot ?? p.root?.position;
  return at ? [at.x + 1700, at.y - 160, at.z - 2600].map((v) => +v.toFixed(2)) : null;
}
