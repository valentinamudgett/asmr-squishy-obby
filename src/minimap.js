import { mulberry32 } from "./geometry.js";
import { t } from "./i18n.js";
import { MAX_LEVEL, ZONES, zoneAt } from "./zones.js";

/** Ten levels per row, snaking left and right. Zones start on whole rows, so each band is one or two rows. */
const ROWS = 10;
/** The minimap crops a window out of a tall copy of the map, centered on you. */
const MINI_ART = { w: 400, h: 1100 };
const MINI_CROP = 230;
const INK = "#3a2433";

function fmt(key, vars) {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

/** Where every level sits on a map drawn `w` × `h` CSS pixels. */
function layout(w, h) {
  const top = h * 0.15;
  const bottom = h * 0.05;
  const side = Math.max(16, w * 0.05);
  const rh = (h - top - bottom) / ROWS;
  const cw = (w - side * 2) / 10;
  const rowBottom = (k) => h - bottom - k * rh;
  const rowTop = (k) => rowBottom(k + 1);
  const nodes = [null];
  for (let level = 1; level < MAX_LEVEL; level += 1) {
    const k = Math.floor(level / 10);
    const c = level % 10;
    const col = k % 2 === 0 ? c : 9 - c;
    nodes.push({ level, x: side + (col + 0.5) * cw, y: rowBottom(k) - rh * 0.5 });
  }
  nodes.push({ level: MAX_LEVEL, x: w / 2, y: top * 0.55 });
  const r = Math.max(5, Math.min(cw * 0.3, rh * 0.24, 17));
  const unit = Math.max(0.6, Math.min(cw / 40, rh / 30));
  return { w, h, top, bottom, side, rh, cw, rowTop, rowBottom, nodes, r, unit };
}

function bandFor(L, id) {
  switch (id) {
    case "core":
      return [L.rowTop(0), L.h];
    case "crust":
      return [L.rowTop(1), L.rowBottom(1)];
    case "ocean":
      return [L.rowTop(2), L.rowBottom(2)];
    case "city":
      return [L.rowTop(4), L.rowBottom(3)];
    case "clouds":
      return [L.rowTop(6), L.rowBottom(5)];
    case "space":
      return [L.rowTop(8), L.rowBottom(7)];
    default:
      return [0, L.rowBottom(9)];
  }
}

/**
 * The HUD minimap plus the full-screen journey map. `onPick(level)` replays a level
 * you've already reached; `onToggle(open)` lets the game pause input while the map is up.
 */
export function createMinimap({ onPick, onToggle }) {
  const button = document.querySelector("#minimap");
  const mini = document.querySelector("#minimap-canvas");
  const zoneEl = document.querySelector("#minimap-zone");
  const levelEl = document.querySelector("#minimap-level");
  const overlay = document.querySelector("#world-map");
  const canvas = document.querySelector("#map-canvas");
  const hereEl = document.querySelector("#map-here");
  const pickedEl = document.querySelector("#map-picked");
  const playButton = document.querySelector("#map-play");
  const closeButton = document.querySelector("#map-close");
  const miniCtx = mini.getContext("2d");
  const ctx = canvas.getContext("2d");

  let level = 1;
  let best = 1;
  let selected = 1;
  let open = false;
  let miniArt = null;
  let fullArt = null;
  let frame = 0;
  let returnFocus = null;
  const cam = { x: -1, y: -1, time: 0 };

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const clampLevel = (value) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(value)));

  function renderArt(w, h) {
    const scale = dpr();
    const art = document.createElement("canvas");
    art.width = Math.round(w * scale);
    art.height = Math.round(h * scale);
    const L = layout(w, h);
    const g = art.getContext("2d");
    g.scale(scale, scale);
    drawWorld(g, L, best);
    return { canvas: art, L, w, h };
  }

  function caption() {
    const shown = clampLevel(level);
    zoneEl.textContent = t(zoneAt(level).nameKey);
    levelEl.textContent = fmt("map.short", { level, max: MAX_LEVEL });
    hereEl.textContent = fmt("map.here", { level: shown, max: MAX_LEVEL });
  }

  function drawMini(time) {
    const scale = dpr();
    const cssW = mini.clientWidth || 200;
    const cssH = mini.clientHeight || 130;
    if (mini.width !== Math.round(cssW * scale) || mini.height !== Math.round(cssH * scale)) {
      mini.width = Math.round(cssW * scale);
      mini.height = Math.round(cssH * scale);
    }
    if (!miniArt) miniArt = renderArt(MINI_ART.w, MINI_ART.h);
    const { L } = miniArt;
    const cropW = MINI_CROP;
    const cropH = (cropW * cssH) / cssW;
    const node = L.nodes[clampLevel(level)];
    const wantX = Math.max(cropW / 2, Math.min(L.w - cropW / 2, node.x));
    const wantY = Math.max(cropH / 2, Math.min(L.h - cropH / 2, node.y - cropH * 0.08));
    const dt = Math.min(0.1, Math.max(0, time - cam.time));
    cam.time = time;
    // Glide between neighbouring levels; a replay from the map jumps straight there.
    if (cam.x < 0 || Math.hypot(wantX - cam.x, wantY - cam.y) > cropH) {
      cam.x = wantX;
      cam.y = wantY;
    } else {
      const ease = 1 - Math.exp(-5 * dt);
      cam.x += (wantX - cam.x) * ease;
      cam.y += (wantY - cam.y) * ease;
    }
    const k = (cssW / cropW) * scale;
    miniCtx.setTransform(1, 0, 0, 1, 0, 0);
    miniCtx.clearRect(0, 0, mini.width, mini.height);
    miniCtx.setTransform(k, 0, 0, k, -(cam.x - cropW / 2) * k, -(cam.y - cropH / 2) * k);
    miniCtx.drawImage(miniArt.canvas, 0, 0, L.w, L.h);
    drawMarkers(miniCtx, L, { level, best, selected: null, time, label: false });
  }

  function resizeFull() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const scale = dpr();
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    fullArt = renderArt(w, h);
  }

  function drawFull(now) {
    frame = open ? requestAnimationFrame(drawFull) : 0;
    if (!fullArt) resizeFull();
    if (!fullArt) return;
    const scale = dpr();
    const time = now / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.drawImage(fullArt.canvas, 0, 0, fullArt.w, fullArt.h);
    drawMarkers(ctx, fullArt.L, { level, best, selected, time, label: true });
  }

  function select(value) {
    selected = clampLevel(value);
    const unlocked = selected <= best;
    playButton.disabled = !unlocked;
    pickedEl.textContent = unlocked
      ? fmt("map.level", { level: selected, zone: t(zoneAt(selected).nameKey) })
      : fmt("map.locked", { level: selected });
  }

  function setOpen(next) {
    if (open === next) return;
    open = next;
    overlay.hidden = !open;
    onToggle?.(open);
    if (open) {
      returnFocus = document.activeElement;
      caption();
      select(Math.min(clampLevel(level), best));
      fullArt = null;
      frame = requestAnimationFrame(drawFull);
      closeButton.focus();
    } else {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      returnFocus?.focus?.();
    }
  }

  canvas.addEventListener("click", (event) => {
    if (!fullArt) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const { L } = fullArt;
    let hit = null;
    let bestDist = Math.max(18, L.r * 1.9);
    for (let i = 1; i < L.nodes.length; i += 1) {
      const node = L.nodes[i];
      const dist = Math.hypot(node.x - x, node.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        hit = node;
      }
    }
    if (hit) select(hit.level);
  });
  canvas.addEventListener("dblclick", () => {
    if (selected <= best) playButton.click();
  });
  playButton.addEventListener("click", () => {
    if (selected > best) return;
    setOpen(false);
    onPick?.(selected);
  });
  closeButton.addEventListener("click", () => setOpen(false));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) setOpen(false);
  });
  button.addEventListener("click", () => setOpen(true));
  window.addEventListener("keydown", (event) => {
    if (!open) return;
    if (event.code === "Escape") setOpen(false);
    else if (event.code === "ArrowRight" || event.code === "ArrowUp") select(Math.min(best, selected + 1));
    else if (event.code === "ArrowLeft" || event.code === "ArrowDown") select(Math.max(1, selected - 1));
    else if (event.code === "Enter" && event.target === canvas) playButton.click();
    else return;
    event.stopPropagation();
  });
  window.addEventListener("resize", () => {
    miniArt = null;
    if (open) resizeFull();
  });

  caption();
  return {
    get isOpen() {
      return open;
    },
    open() {
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    /** Call every frame. Redraws the art only when the best level changes. */
    setLevel(nextLevel, nextBest, time) {
      if (nextBest !== best) {
        best = nextBest;
        miniArt = null;
        fullArt = null;
      }
      if (nextLevel !== level) {
        level = nextLevel;
        caption();
      }
      drawMini(time);
    },
  };
}

// ---------------------------------------------------------------- drawing

const BANDS = {
  moon: ["#000006", "#05071a"],
  space: ["#060a20", "#14286a"],
  clouds: ["#3d74c4", "#a6d4f4"],
  city: ["#4a5ab0", "#1c2468"],
  ocean: ["#2a9fd0", "#03203f"],
  crust: ["#5e4a40", "#241c22"],
  core: ["#5a1208", "#1a0303"],
};

function drawWorld(ctx, L, best) {
  const sky = ctx.createLinearGradient(0, 0, 0, L.h);
  const edge = 4 / L.h;
  for (const zone of [...ZONES].reverse()) {
    const [y0, y1] = bandFor(L, zone.id);
    const [topColor, bottomColor] = BANDS[zone.id];
    sky.addColorStop(Math.min(1, Math.max(0, y0 / L.h + edge)), topColor);
    sky.addColorStop(Math.min(1, Math.max(0, y1 / L.h - edge)), bottomColor);
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, L.w, L.h);
  const painters = { core: drawCore, crust: drawCrust, ocean: drawOcean, city: drawCity, clouds: drawClouds, space: drawSpace, moon: drawMoonBand };
  ZONES.forEach((zone, index) => {
    const [y0, y1] = bandFor(L, zone.id);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y0, L.w, y1 - y0);
    ctx.clip();
    painters[zone.id](ctx, L, y0, y1, mulberry32(101 + index * 37));
    ctx.restore();
  });
  drawPath(ctx, L, best);
  drawNodes(ctx, L, best);
  for (const zone of ZONES) {
    const [y0] = bandFor(L, zone.id);
    pill(ctx, t(zone.nameKey), 6, y0 + 6, L.unit);
  }
}

function pill(ctx, text, x, y, unit) {
  const size = Math.max(9, Math.min(13, 9 * unit));
  ctx.font = `800 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const width = ctx.measureText(text).width + size * 1.2;
  const height = size * 1.7;
  ctx.fillStyle = "rgba(255, 247, 242, 0.88)";
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + size * 0.6, y + height / 2 + 0.5);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function spikeRow(ctx, w, baseY, length, random, color, spacing, unit) {
  ctx.fillStyle = color;
  const count = Math.max(4, Math.round(w / spacing));
  for (let i = 0; i < count; i += 1) {
    const x = ((i + random() * 0.8) / count) * w;
    const half = (3 + random() * 6) * unit;
    const len = length * (0.35 + 0.65 * random());
    ctx.beginPath();
    ctx.moveTo(x - half, baseY);
    ctx.lineTo(x, baseY + len);
    ctx.lineTo(x + half, baseY);
    ctx.closePath();
    ctx.fill();
  }
}

function wave(ctx, w, y, amp, period, phase) {
  ctx.moveTo(0, y);
  for (let x = 0; x <= w; x += 4) ctx.lineTo(x, y + Math.sin(x / period + phase) * amp);
}

function glowBall(ctx, x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCore(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  const height = y1 - y0;
  const lavaTop = y1 - height * 0.2;
  const glow = ctx.createLinearGradient(0, lavaTop - height * 0.45, 0, lavaTop);
  glow.addColorStop(0, "rgba(255,110,30,0)");
  glow.addColorStop(1, "rgba(255,110,30,0.4)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, lavaTop - height * 0.45, w, height * 0.45);
  spikeRow(ctx, w, y0, height * 0.34, random, "#2a0805", 26 * unit, unit);
  spikeRow(ctx, w, lavaTop + 2, -height * 0.26, random, "#3a0e08", 34 * unit, unit);
  for (let i = 0; i < 3; i += 1) {
    const x = w * (0.15 + 0.7 * random());
    const fall = ctx.createLinearGradient(x - 3 * unit, 0, x + 3 * unit, 0);
    fall.addColorStop(0, "rgba(255,120,20,0)");
    fall.addColorStop(0.5, "#ffc24a");
    fall.addColorStop(1, "rgba(255,120,20,0)");
    ctx.fillStyle = fall;
    ctx.fillRect(x - 3 * unit, y0, 6 * unit, lavaTop - y0);
  }
  const lava = ctx.createLinearGradient(0, lavaTop, 0, y1);
  lava.addColorStop(0, "#ffb347");
  lava.addColorStop(0.35, "#ff5a1a");
  lava.addColorStop(1, "#7a1004");
  ctx.fillStyle = lava;
  ctx.beginPath();
  wave(ctx, w, lavaTop, 2 * unit, 14 * unit, 0);
  ctx.lineTo(w, y1);
  ctx.lineTo(0, y1);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 4; i += 1) {
    const x = w * (0.1 + 0.8 * random());
    const peak = y0 + height * (0.3 + random() * 0.25);
    const span = (18 + random() * 20) * unit;
    ctx.strokeStyle = "rgba(255,190,90,0.55)";
    ctx.setLineDash([3 * unit, 4 * unit]);
    ctx.lineWidth = 1.5 * unit;
    ctx.beginPath();
    ctx.moveTo(x - span, lavaTop);
    ctx.quadraticCurveTo(x, peak - (lavaTop - peak), x + span, lavaTop);
    ctx.stroke();
    ctx.setLineDash([]);
    glowBall(ctx, x + span * 0.35, peak + (lavaTop - peak) * 0.12, 4 * unit, "#fff2b0", "rgba(255,110,20,0.85)");
  }
}

function drawCrust(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  const height = y1 - y0;
  const colors = ["rgba(140,110,90,0.28)", "rgba(80,70,90,0.3)", "rgba(170,140,110,0.22)"];
  for (let b = 0; b < 6; b += 1) {
    ctx.fillStyle = colors[b % colors.length];
    ctx.beginPath();
    const y = y0 + (b / 6) * height;
    wave(ctx, w, y, 3 * unit, (20 + random() * 20) * unit, random() * 6);
    ctx.lineTo(w, y + height / 6 + 4);
    ctx.lineTo(0, y + height / 6 + 4);
    ctx.closePath();
    ctx.fill();
  }
  spikeRow(ctx, w, y0, height * 0.22, random, "#1d1a22", 30 * unit, unit);
  const gems = [
    ["#e2b8ff", "#7a3ae0"],
    ["#b8fbff", "#2a8ad0"],
    ["#ffc4ee", "#c03aa0"],
  ];
  for (let i = 0; i < 7; i += 1) {
    const [light, dark] = gems[i % gems.length];
    const x = w * (0.08 + 0.84 * random());
    const y = y1 - height * (0.05 + random() * 0.2);
    const len = (10 + random() * 10) * unit;
    const half = (2.5 + random() * 2) * unit;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((random() - 0.5) * 0.9);
    ctx.shadowColor = light;
    ctx.shadowBlur = 8 * unit;
    const g = ctx.createLinearGradient(-half, 0, half, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.5, light);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(-half, -len * 0.8);
    ctx.lineTo(0, -len);
    ctx.lineTo(half, -len * 0.8);
    ctx.lineTo(half, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawOcean(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  const height = y1 - y0;
  for (let i = 0; i < 6; i += 1) {
    const x = w * (0.05 + 0.9 * random());
    const ray = ctx.createLinearGradient(0, y0, 0, y0 + height * 0.8);
    ray.addColorStop(0, "rgba(220,250,255,0.28)");
    ray.addColorStop(1, "rgba(220,250,255,0)");
    ctx.fillStyle = ray;
    ctx.beginPath();
    ctx.moveTo(x - 6 * unit, y0);
    ctx.lineTo(x + 6 * unit, y0);
    ctx.lineTo(x + 22 * unit, y0 + height * 0.8);
    ctx.lineTo(x - 2 * unit, y0 + height * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  // Sandy floor with coral and kelp.
  const floor = y1 - height * 0.12;
  ctx.fillStyle = "#c8b07a";
  ctx.beginPath();
  wave(ctx, w, floor, 3 * unit, 30 * unit, 1);
  ctx.lineTo(w, y1);
  ctx.lineTo(0, y1);
  ctx.closePath();
  ctx.fill();
  const corals = ["#ff6f91", "#ff9a3c", "#ffd23c", "#b06aff"];
  for (let i = 0; i < Math.round(w / (40 * unit)); i += 1) {
    const x = w * random();
    const color = corals[i % corals.length];
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    const branch = (bx, by, len, angle, depth) => {
      if (depth === 0) return;
      const ex = bx + Math.sin(angle) * len;
      const ey = by - Math.cos(angle) * len;
      ctx.lineWidth = (0.8 + depth * 0.8) * unit;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      branch(ex, ey, len * 0.7, angle - 0.5, depth - 1);
      branch(ex, ey, len * 0.7, angle + 0.5, depth - 1);
    };
    branch(x, floor + 2, (5 + random() * 4) * unit, (random() - 0.5) * 0.3, 3);
  }
  ctx.strokeStyle = "#3c9a4a";
  ctx.lineWidth = 2 * unit;
  for (let i = 0; i < Math.round(w / (50 * unit)); i += 1) {
    const x = w * random();
    const top = floor - height * (0.25 + random() * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, floor);
    for (let y = floor; y > top; y -= 3) ctx.lineTo(x + Math.sin(y / (5 * unit)) * 3 * unit, y);
    ctx.stroke();
  }
  // Fish, a squid, and a jellyfish.
  const fishColors = ["#ff7a1a", "#ffd83a", "#3a7cff", "#ff5fa8"];
  for (let i = 0; i < Math.round(w / (60 * unit)) + 2; i += 1) {
    const x = w * random();
    const y = y0 + height * (0.2 + random() * 0.5);
    const s = (3 + random() * 2) * unit;
    const dir = random() < 0.5 ? -1 : 1;
    ctx.fillStyle = fishColors[i % fishColors.length];
    ctx.beginPath();
    ctx.ellipse(x, y, s * 1.4, s * 0.8, 0, 0, Math.PI * 2);
    ctx.moveTo(x - dir * s * 1.2, y);
    ctx.lineTo(x - dir * s * 2.3, y - s * 0.8);
    ctx.lineTo(x - dir * s * 2.3, y + s * 0.8);
    ctx.fill();
    ctx.fillStyle = "#1a1020";
    ctx.beginPath();
    ctx.arc(x + dir * s * 0.7, y - s * 0.15, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }
  const sx = w * (0.2 + random() * 0.6);
  const sy = y0 + height * 0.35;
  const s = 6 * unit;
  ctx.fillStyle = "#ff8fb8";
  ctx.beginPath();
  ctx.moveTo(sx, sy - s * 1.6);
  ctx.quadraticCurveTo(sx + s * 1.1, sy - s * 0.4, sx + s * 0.6, sy + s * 0.4);
  ctx.lineTo(sx - s * 0.6, sy + s * 0.4);
  ctx.quadraticCurveTo(sx - s * 1.1, sy - s * 0.4, sx, sy - s * 1.6);
  ctx.fill();
  ctx.strokeStyle = "#ff8fb8";
  ctx.lineWidth = 1.4 * unit;
  for (let i = 0; i < 5; i += 1) {
    const x0 = sx - s * 0.5 + (i / 4) * s;
    ctx.beginPath();
    ctx.moveTo(x0, sy + s * 0.4);
    ctx.quadraticCurveTo(x0 + s * 0.3, sy + s, x0, sy + s * 1.6);
    ctx.stroke();
  }
  ctx.fillStyle = "#fff";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx + side * s * 0.3, sy + s * 0.1, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const jx = w * (0.1 + random() * 0.8);
  const jy = y0 + height * 0.25;
  ctx.fillStyle = "rgba(230,160,255,0.75)";
  ctx.beginPath();
  ctx.ellipse(jx, jy, 5 * unit, 4 * unit, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "rgba(230,160,255,0.6)";
  ctx.lineWidth = unit;
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(jx - 3.5 * unit + i * 2.3 * unit, jy);
    ctx.lineTo(jx - 3.5 * unit + i * 2.3 * unit + Math.sin(i) * 2, jy + 9 * unit);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 14; i += 1) {
    ctx.beginPath();
    ctx.arc(w * random(), y0 + height * random(), (0.8 + random() * 1.6) * unit, 0, Math.PI * 2);
    ctx.fill();
  }
  // The sea surface, where the climb comes out at New York.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2 * unit;
  ctx.beginPath();
  wave(ctx, w, y0 + 2 * unit, 1.6 * unit, 8 * unit, 0);
  ctx.stroke();
}

function drawCity(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  const height = y1 - y0;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 30; i += 1) {
    ctx.fillRect(w * random(), y0 + height * random() * 0.6, unit, unit);
  }
  // Harbor water along the bottom edge, then the skyline standing on it.
  const shore = y1 - height * 0.05;
  ctx.fillStyle = "#0c1a40";
  ctx.fillRect(0, shore, w, y1 - shore);
  const skyline = shore;
  let x = w * 0.22;
  while (x < w) {
    const bw = (8 + random() * 10) * unit;
    const bh = (14 + random() * 34) * unit * (x > w * 0.45 && x < w * 0.6 ? 1.5 : 1);
    ctx.fillStyle = random() < 0.5 ? "#151a3c" : "#1d2350";
    ctx.fillRect(x, skyline - bh, bw, bh);
    ctx.fillStyle = "rgba(255,214,120,0.85)";
    for (let wy = skyline - bh + 3 * unit; wy < skyline - 2 * unit; wy += 4 * unit) {
      for (let wx = x + 2 * unit; wx < x + bw - 2 * unit; wx += 3.5 * unit) {
        if (random() < 0.55) ctx.fillRect(wx, wy, 1.4 * unit, 1.6 * unit);
      }
    }
    x += bw + random() * 3 * unit;
  }
  // A spire for the tallest tower.
  const spireX = w * 0.52;
  ctx.fillStyle = "#1d2350";
  ctx.fillRect(spireX, skyline - 80 * unit, 2 * unit, 30 * unit);
  // The Statue of Liberty on her island.
  const lx = w * 0.1;
  ctx.fillStyle = "#1d3a30";
  ctx.fillRect(lx - 8 * unit, shore - 3 * unit, 16 * unit, 3 * unit);
  ctx.fillStyle = "#5fb89a";
  ctx.fillRect(lx - 2 * unit, shore - 18 * unit, 4 * unit, 15 * unit);
  ctx.fillRect(lx + 1.5 * unit, shore - 25 * unit, 1.6 * unit, 8 * unit);
  ctx.beginPath();
  ctx.arc(lx, shore - 19.5 * unit, 2.2 * unit, 0, Math.PI * 2);
  ctx.fill();
  glowBall(ctx, lx + 2.3 * unit, shore - 26 * unit, 1.6 * unit, "#fff6c0", "rgba(255,200,80,0.8)");
}

function cloud(ctx, x, y, s) {
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.arc(x + s * 1.1, y + s * 0.2, s * 0.8, 0, Math.PI * 2);
  ctx.arc(x - s * 1.1, y + s * 0.25, s * 0.75, 0, Math.PI * 2);
  ctx.arc(x + s * 0.4, y - s * 0.5, s * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(180,210,240,0.5)";
  ctx.fillRect(x - s * 1.8, y + s * 0.6, s * 3.6, s * 0.4);
}

function drawClouds(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  const height = y1 - y0;
  glowBall(ctx, w * 0.86, y0 + height * 0.22, 9 * unit, "#fffbe0", "rgba(255,240,170,0.6)");
  for (let i = 0; i < Math.round(w / (45 * unit)) + 3; i += 1) {
    cloud(ctx, w * random(), y0 + height * (0.15 + random() * 0.75), (6 + random() * 8) * unit);
  }
  // A little plane.
  const px = w * (0.2 + random() * 0.5);
  const py = y0 + height * 0.3;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(px - 8 * unit, py - unit, 16 * unit, 2.4 * unit);
  ctx.fillRect(px - 2 * unit, py - 6 * unit, 3 * unit, 12 * unit);
  ctx.fillRect(px - 8 * unit, py - 4 * unit, 2 * unit, 4 * unit);
}

function stars(ctx, L, y0, y1, random, count) {
  for (let i = 0; i < count; i += 1) {
    const a = 0.4 + random() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    const s = (0.6 + random() * 1.4) * L.unit;
    ctx.fillRect(L.w * random(), y0 + (y1 - y0) * random(), s, s);
  }
}

function drawSpace(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  const height = y1 - y0;
  stars(ctx, L, y0, y1, random, Math.round(w / 6));
  // The Earth's curved edge, falling away below.
  const radius = w * 1.6;
  const cy = y1 + radius - height * 0.18;
  const air = ctx.createRadialGradient(w / 2, cy, radius * 0.98, w / 2, cy, radius * 1.03);
  air.addColorStop(0, "rgba(90,170,255,0.9)");
  air.addColorStop(1, "rgba(90,170,255,0)");
  ctx.fillStyle = air;
  ctx.beginPath();
  ctx.arc(w / 2, cy, radius * 1.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b4fa0";
  ctx.beginPath();
  ctx.arc(w / 2, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  // A ringed planet and a satellite.
  const px = w * 0.8;
  const py = y0 + height * 0.3;
  ctx.fillStyle = "#e8b878";
  ctx.beginPath();
  ctx.arc(px, py, 7 * unit, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,230,190,0.8)";
  ctx.lineWidth = 1.5 * unit;
  ctx.beginPath();
  ctx.ellipse(px, py, 13 * unit, 3.5 * unit, -0.3, 0, Math.PI * 2);
  ctx.stroke();
  const sx = w * (0.15 + random() * 0.3);
  const sy = y0 + height * 0.5;
  ctx.fillStyle = "#c8ccd8";
  ctx.fillRect(sx - 2 * unit, sy - 2 * unit, 4 * unit, 4 * unit);
  ctx.fillStyle = "#3a6ad0";
  ctx.fillRect(sx - 10 * unit, sy - 1.5 * unit, 7 * unit, 3 * unit);
  ctx.fillRect(sx + 3 * unit, sy - 1.5 * unit, 7 * unit, 3 * unit);
}

function drawMoonBand(ctx, L, y0, y1, random) {
  const { w, unit } = L;
  stars(ctx, L, y0, y1, random, Math.round(w / 5));
  // A tiny Earth in the black overhead.
  const ex = w * 0.12;
  const ey = L.top * 0.45;
  ctx.fillStyle = "#1b4fa0";
  ctx.beginPath();
  ctx.arc(ex, ey, 9 * unit, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f9a4c";
  ctx.beginPath();
  ctx.ellipse(ex - 2 * unit, ey - unit, 4 * unit, 3 * unit, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // The Moon as a wide dome under the last row, with level 100 on its peak.
  const topY = L.nodes[MAX_LEVEL].y + L.r * 1.2;
  const ry = (y1 - topY) * 1.25;
  const rx = w * 0.62;
  const cy = topY + ry;
  const rock = ctx.createRadialGradient(w * 0.4, topY, 0, w / 2, cy, Math.max(rx, ry));
  rock.addColorStop(0, "#e6e6ec");
  rock.addColorStop(1, "#8a8a96");
  ctx.fillStyle = rock;
  ctx.beginPath();
  ctx.ellipse(w / 2, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w / 2, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 18; i += 1) {
    const x = w * (0.1 + 0.8 * random());
    const y = topY + (y1 - topY) * (0.15 + random() * 0.85);
    const r = (2 + random() * 7) * unit;
    ctx.fillStyle = "rgba(90,90,104,0.45)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = unit;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.08, r, r * 0.6, 0, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath(ctx, L, best) {
  const { nodes, r } = L;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(20,8,24,0.35)";
  ctx.lineWidth = r * 0.9;
  ctx.beginPath();
  nodes.slice(1).forEach((node, i) => (i === 0 ? ctx.moveTo(node.x, node.y) : ctx.lineTo(node.x, node.y)));
  ctx.stroke();
  const reached = Math.min(MAX_LEVEL, best);
  ctx.setLineDash([r * 0.5, r * 0.45]);
  ctx.lineWidth = r * 0.32;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  nodes.slice(reached).forEach((node, i) => (i === 0 ? ctx.moveTo(node.x, node.y) : ctx.lineTo(node.x, node.y)));
  ctx.stroke();
  ctx.strokeStyle = "#ffd76a";
  ctx.beginPath();
  nodes.slice(1, reached + 1).forEach((node, i) => (i === 0 ? ctx.moveTo(node.x, node.y) : ctx.lineTo(node.x, node.y)));
  ctx.stroke();
  ctx.restore();
}

function drawNodes(ctx, L, best) {
  const { nodes, r } = L;
  for (let i = 1; i < nodes.length; i += 1) {
    const node = nodes[i];
    const unlocked = node.level <= best;
    const milestone = node.level === 1 || node.level % 10 === 0;
    const radius = milestone ? r * 1.25 : r;
    if (node.level === MAX_LEVEL) {
      flag(ctx, node.x, node.y - radius * 0.6, radius * 2.2, unlocked ? "#ffd24a" : "#ff6fae");
      star(ctx, node.x, node.y, radius * 1.5, unlocked);
    } else {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      if (unlocked) {
        const g = ctx.createRadialGradient(node.x - radius * 0.3, node.y - radius * 0.3, 0, node.x, node.y, radius);
        g.addColorStop(0, "#fff8d6");
        g.addColorStop(1, "#ffbf3a");
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = "rgba(40,30,60,0.6)";
      }
      ctx.fill();
      ctx.lineWidth = Math.max(1.2, r * 0.16);
      ctx.strokeStyle = unlocked ? "#8a4a12" : "rgba(255,255,255,0.4)";
      ctx.stroke();
    }
    if (r >= 8.5 || milestone) {
      const size = Math.max(7, radius * (node.level >= 100 ? 0.8 : node.level >= 10 ? 0.9 : 1.05));
      ctx.font = `800 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = unlocked ? "#5a2a10" : "rgba(255,255,255,0.7)";
      ctx.fillText(String(node.level), node.x, node.y + size * 0.05);
    }
  }
}

function star(ctx, x, y, r, lit) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.5;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = lit ? "#ffd24a" : "rgba(60,50,80,0.75)";
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.strokeStyle = lit ? "#8a4a12" : "rgba(255,255,255,0.5)";
  ctx.stroke();
}

function flag(ctx, x, y, size, color) {
  ctx.strokeStyle = "#f2f2f6";
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.35, y);
  ctx.lineTo(x + size * 0.35, y - size);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.35, y - size);
  ctx.lineTo(x + size * 0.95, y - size * 0.82);
  ctx.lineTo(x + size * 0.35, y - size * 0.62);
  ctx.closePath();
  ctx.fill();
}

/** The pulsing "You are here" pin, your best level's flag, and the level picked to replay. */
function drawMarkers(ctx, L, { level, best, selected, time, label }) {
  const { nodes, r } = L;
  const clamp = (value) => Math.max(1, Math.min(MAX_LEVEL, Math.floor(value)));
  const here = nodes[clamp(level)];
  if (selected != null && selected !== clamp(level)) {
    const node = nodes[clamp(selected)];
    ctx.save();
    ctx.strokeStyle = selected <= best ? "#ffffff" : "rgba(255,255,255,0.6)";
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.setLineDash([r * 0.5, r * 0.35]);
    ctx.lineDashOffset = -time * r * 2;
    ctx.beginPath();
    ctx.arc(node.x, node.y, r * 1.7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const bestNode = nodes[clamp(best)];
  if (clamp(best) !== clamp(level) && best < MAX_LEVEL) {
    flag(ctx, bestNode.x, bestNode.y - r * 0.6, r * 2, "#ff6fae");
  }
  const pulse = 1.35 + 0.35 * (0.5 + 0.5 * Math.sin(time * 4));
  ctx.strokeStyle = "rgba(255,95,162,0.9)";
  ctx.lineWidth = Math.max(2, r * 0.25);
  ctx.beginPath();
  ctx.arc(here.x, here.y, r * pulse, 0, Math.PI * 2);
  ctx.stroke();
  const bob = Math.sin(time * 3) * r * 0.2;
  const headY = here.y - r * 2.6 + bob;
  ctx.fillStyle = "#ff5fa2";
  ctx.beginPath();
  ctx.moveTo(here.x - r * 0.55, headY + r * 0.5);
  ctx.lineTo(here.x, here.y - r * 0.9 + bob);
  ctx.lineTo(here.x + r * 0.55, headY + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(here.x, headY, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.15);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(here.x, headY, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  if (!label) return;
  const text = t("map.youAreHere");
  const size = Math.max(11, Math.min(15, r));
  ctx.font = `800 ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const width = ctx.measureText(text).width + size * 1.2;
  const height = size * 1.8;
  const bx = Math.max(4, Math.min(L.w - width - 4, here.x - width / 2));
  const by = Math.max(4, headY - r - height - 4);
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, bx, by, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = "#c2306f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + width / 2, by + height / 2 + 0.5);
}
