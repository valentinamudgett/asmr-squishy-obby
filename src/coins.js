import { Matrix, Vector3 } from "@babylonjs/core";

const COINS_KEY = "asmr-squishy-obby:coins";
/** How long the stacked pop stays up, including the gem's short delay. */
const POP_LIFE = 2.05;
/** Lift above the capsule center so the pop sits just over the avatar's head. */
const HEAD_LIFT = 0.62;

const lifted = new Vector3();
const projected = new Vector3();
const viewProj = new Matrix();
let viewport = null;
let viewW = 0;
let viewH = 0;

/**
 * Coins are separate from stars. One coin the first time a level checkpoint is reached.
 * Level 1 never pays: the run starts there. `claimed` is the level numbers already paid.
 */
export function loadCoins() {
  const empty = { coins: 0, claimed: [] };
  try {
    const data = JSON.parse(localStorage.getItem(COINS_KEY) ?? "null");
    if (!data || typeof data !== "object") return empty;
    const coins = Number.isFinite(data.coins) && data.coins >= 0 ? Math.floor(data.coins) : 0;
    return { coins, claimed: cleanClaimed(data.claimed) };
  } catch {
    return empty;
  }
}

/** Awards 1 coin for a new level. Returns false when that level already paid or is level 1. */
export function awardLevelCoin(state, level) {
  const n = Math.floor(Number(level));
  if (!Number.isInteger(n) || n < 2) return false;
  if (state.claimed.includes(n)) return false;
  state.claimed.push(n);
  state.claimed.sort((a, b) => a - b);
  state.coins = Math.max(0, Math.floor(Number(state.coins)) || 0) + 1;
  saveCoins(state);
  return true;
}

function cleanClaimed(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const item of value) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isInteger(n) || n < 2 || n > 100000) continue;
    seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

function saveCoins(state) {
  try {
    localStorage.setItem(COINS_KEY, JSON.stringify({ coins: state.coins, claimed: state.claimed }));
  } catch {
    // Private mode: the coin count just won't persist.
  }
}

/**
 * Screen-space pop that follows the avatar: a gold star-coin with green pluses,
 * and a pink blob with light-blue sparkles under it. Both pop, float, and fade.
 */
export function createCoinPop(scene, camera) {
  ensureStyle();
  const root = document.createElement("div");
  root.className = "earn-pop";
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = popMarkup();
  document.body.appendChild(root);

  const anchor = new Vector3();
  let life = 0;

  return {
    burst(position) {
      anchor.set(position.x, position.y, position.z);
      life = POP_LIFE;
      root.hidden = false;
      root.classList.remove("is-on");
      void root.offsetWidth;
      root.classList.add("is-on");
    },
    tick(dt, position) {
      if (life <= 0) return;
      if (position) anchor.set(position.x, position.y, position.z);
      life = Math.max(0, life - dt);
      const screen = project(scene, camera, anchor);
      if (screen) {
        root.style.left = `${screen.x}px`;
        root.style.top = `${screen.y}px`;
        root.style.visibility = "visible";
      } else {
        root.style.visibility = "hidden";
      }
      if (life <= 0) {
        root.hidden = true;
        root.classList.remove("is-on");
      }
    },
  };
}

function project(scene, camera, position) {
  const engine = scene.getEngine();
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  if (width < 2 || height < 2) return null;
  if (!viewport || viewW !== width || viewH !== height) {
    viewport = camera.viewport.toGlobal(width, height);
    viewW = width;
    viewH = height;
  }
  lifted.set(position.x, position.y + HEAD_LIFT, position.z);
  camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), viewProj);
  Vector3.ProjectToRef(lifted, Matrix.IdentityReadOnly, viewProj, viewport, projected);
  if (projected.z < 0 || projected.z > 1) return null;
  const rect = engine.getRenderingCanvasClientRect();
  return {
    x: rect.left + (projected.x / width) * rect.width,
    y: rect.top + (projected.y / height) * rect.height,
  };
}

function plus(x, y) {
  return `<g fill="#3dce4a" transform="translate(${x} ${y})"><rect x="-6.5" y="-17" width="13" height="34" rx="4.5"/><rect x="-17" y="-6.5" width="34" height="13" rx="4.5"/></g>`;
}

function spark(x, y, deg) {
  return `<g fill="#8eebff" transform="translate(${x} ${y}) rotate(${deg})"><rect x="-15" y="-5" width="30" height="10" rx="5"/></g>`;
}

function star(cx, cy, outer, inner) {
  let d = "";
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = (cx + Math.cos(angle) * radius).toFixed(2);
    const y = (cy + Math.sin(angle) * radius).toFixed(2);
    d += i === 0 ? `M${x} ${y}` : `L${x} ${y}`;
  }
  return `${d}Z`;
}

function popMarkup() {
  return `<svg viewBox="0 0 180 312" aria-hidden="true">
    <defs>
      <radialGradient id="earnCoinFill" cx="36%" cy="30%" r="72%">
        <stop offset="0%" stop-color="#fff8c8"/>
        <stop offset="24%" stop-color="#ffe45a"/>
        <stop offset="60%" stop-color="#ffc20a"/>
        <stop offset="100%" stop-color="#e89008"/>
      </radialGradient>
      <radialGradient id="earnGemFill" cx="32%" cy="22%" r="80%">
        <stop offset="0%" stop-color="#ffd4ee"/>
        <stop offset="28%" stop-color="#ff6eb5"/>
        <stop offset="100%" stop-color="#ff2f8c"/>
      </radialGradient>
    </defs>
    <g class="earn-coin">
      ${plus(90, 28)}
      ${plus(24, 86)}
      ${plus(156, 86)}
      ${plus(90, 144)}
      <circle cx="90" cy="86" r="36" fill="url(#earnCoinFill)" stroke="#d4840c" stroke-width="3.5"/>
      <ellipse cx="76" cy="72" rx="12" ry="7" fill="#ffffff" opacity="0.55"/>
      <path d="${star(90, 88, 16, 6.6)}" fill="#fff6b0" stroke="#f0c018" stroke-width="1.25"/>
    </g>
    <g class="earn-gem">
      ${spark(28, 236, -36)}
      ${spark(152, 236, 36)}
      ${spark(46, 286, 32)}
      ${spark(134, 280, -28)}
      <path d="M90 198C122 198 128 220 128 246C128 286 112 302 90 302C68 302 52 286 52 246C52 220 58 198 90 198Z" fill="url(#earnGemFill)" stroke="#ff2a78" stroke-width="2"/>
      <rect x="78" y="214" width="24" height="68" rx="12" fill="#ff4d9e"/>
      <ellipse cx="74" cy="222" rx="10" ry="7" fill="#ffffff" opacity="0.92"/>
    </g>
  </svg>`;
}

function ensureStyle() {
  if (document.getElementById("earn-pop-style")) return;
  const style = document.createElement("style");
  style.id = "earn-pop-style";
  style.textContent = `
.earn-pop {
  position: fixed;
  z-index: 4;
  left: 0;
  top: 0;
  width: 158px;
  height: 274px;
  margin: 0;
  pointer-events: none;
  transform: translate(-50%, -100%);
}
.earn-pop[hidden] { display: none !important; }
.earn-pop svg { display: block; width: 100%; height: 100%; overflow: visible; }
.earn-coin, .earn-gem {
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
}
.earn-pop.is-on .earn-coin {
  animation: earn-rise 1.85s cubic-bezier(.2, .85, .2, 1) forwards;
}
.earn-pop.is-on .earn-gem {
  animation: earn-rise 1.85s cubic-bezier(.2, .85, .2, 1) 0.12s forwards;
}
@keyframes earn-rise {
  0% { opacity: 0; transform: translateY(26px) scale(0.15); }
  12% { opacity: 1; transform: translateY(0) scale(1.16); }
  22% { opacity: 1; transform: translateY(-8px) scale(0.98); }
  32% { opacity: 1; transform: translateY(-2px) scale(1); }
  70% { opacity: 1; transform: translateY(-30px) scale(1); }
  100% { opacity: 0; transform: translateY(-68px) scale(0.92); }
}
`;
  document.head.appendChild(style);
}
