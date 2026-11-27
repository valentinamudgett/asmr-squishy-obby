import { t } from "./i18n.js";

/** Meters across the corner map. */
const MINI_SPAN = 120;
const GROW_MS = 320;
/** Seconds between checks for a changed layout: a home bought, moved into, or sold. */
const LAYOUT_EVERY = 0.25;
/** Pixels per meter in the cached city picture, and the most pixels it can be across. */
const BASE_RES = 4;
const BASE_MAX = 2048;
/** Smaller pieces than this (square meters) are left off: lane dashes, trunks, little props. */
const MIN_AREA = 1.4;
const LAND = "#7cc06e";
const INK = "#3a2433";
const ME = "#ff5fa2";
const CAR = "#ff6fa5";
const GOALS = {
  pickup: { color: "#ff8a1f", icon: "🍕" },
  deliver: { color: "#2fbf7a", icon: "📦" },
  tour: { color: "#ff5fa2", icon: "🏠" },
};
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
const TEXT_FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
const smooth = (x) => x * x * (3 - 2 * x);

/**
 * Wraps a city kit so what it builds is also noted for the map: flat paint (roads, blocks, sand,
 * water) and the footprint of anything standing on it, in city meters with its real color.
 * Tilted and see-through pieces are left out. `origin` is the city's world position.
 */
export function recordKit(kit, shapes, origin) {
  const frame = () => {
    const node = kit.parent;
    node.computeWorldMatrix(true);
    const p = node.getAbsolutePosition();
    let yaw = 0;
    for (let n = node; n; n = n.parent) yaw += n.rotation?.y ?? 0;
    return { x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z, yaw };
  };
  const at = (f, x, z) => {
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    return { x: f.x + x * c + z * s, z: f.z - x * s + z * c };
  };
  const flat = (o) => !o || (!o.rx && !o.rz && (o.alpha ?? 1) >= 1);
  const note = (name, shape) => {
    const build = kit[name];
    if (typeof build !== "function") return;
    kit[name] = (...args) => {
      const mesh = build(...args);
      const piece = shape(...args);
      if (piece) shapes.push(piece);
      return mesh;
    };
  };
  const rect = (w, h, d, x, y, z, color, o) => {
    const sw = w * (o?.sx ?? 1);
    const sd = d * (o?.sz ?? 1);
    if (!flat(o) || sw * sd < MIN_AREA) return null;
    const f = frame();
    const p = at(f, x, z);
    return { kind: "rect", x: p.x, z: p.z, w: sw, d: sd, yaw: f.yaw + (o?.ry ?? 0), top: f.y + y + (h * (o?.sy ?? 1)) / 2, color };
  };
  const disc = (diameter, top, x, z, color, o) => {
    const size = diameter * Math.max(o?.sx ?? 1, o?.sz ?? 1);
    if (!flat(o) || size * size * 0.785 < MIN_AREA) return null;
    const f = frame();
    const p = at(f, x, z);
    return { kind: "disc", x: p.x, z: p.z, r: size / 2, top: f.y + top, color };
  };
  note("box", (w, h, d, x, y, z, hex, o) => (hex ? rect(w, h, d, x, y, z, hex, o) : null));
  note("windowBox", (w, h, d, x, y, z) => rect(w, h, d, x, y, z, "#e6dcef"));
  note("cyl", (top, bottom, h, x, y, z, hex, o) => disc(Math.max(top, bottom), y + (h * (o?.sy ?? 1)) / 2, x, z, hex, o));
  note("ball", (diameter, x, y, z, hex, o) => disc(diameter, y + (diameter * (o?.sy ?? 1)) / 2, x, z, hex, o));
  return kit;
}

/**
 * The City map: a small rounded map in the top-right corner that follows you, which grows into a
 * big map of the whole city when you click or tap it (or press M), and shrinks back the same way.
 * Reads `city.mapInfo(foot)` for the layout, the homes, named places, you, and where to go.
 */
export function createCityMap(city) {
  const root = document.querySelector("#city-map");
  const canvas = document.querySelector("#city-map-canvas");
  const toggle = document.querySelector("#city-map-toggle");
  const closeButton = document.querySelector("#city-map-close");
  const hint = document.querySelector("#city-map-hint");
  const ctx = canvas.getContext("2d");
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  let shown = false;
  let big = false;
  let grow = 0;
  let growFrom = 0;
  let growAt = 0;
  let layoutAge = Infinity;
  let layoutKey = "";
  let shapesRef = null;
  let bounds = null;
  let base = null;
  let last = 0;
  const icons = new Map();
  /** Optional: what clicks on the big map do (see cityTeleport.js). */
  let picker = null;
  let view = null;
  let lastInfo = null;

  const dpr = () => Math.min(window.devicePixelRatio || 1, 3);

  function setBig(next) {
    if (big === next) return;
    big = next;
    growFrom = grow;
    growAt = performance.now();
    root.classList.toggle("is-big", big);
    toggle.setAttribute("aria-expanded", String(big));
    toggle.setAttribute("aria-label", t(big ? "cityMap.shrink" : "cityMap.grow"));
    toggle.title = t(big ? "cityMap.shrink" : "cityMap.grow");
    const touch = document.body.classList.contains("show-touch") || window.matchMedia?.("(pointer: coarse)").matches;
    hint.textContent = picker ? picker.hint(touch) : touch ? t("cityMap.hintTap") : t("cityMap.hintClick");
    if (!big) picker?.hover(null);
  }

  /** A pointer event on the map, in city meters and map pixels, for the picker. */
  function pointAt(event) {
    if (!view || !lastInfo) return null;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    return { px, py, x: view.cx + (px - view.W / 2) / view.s, z: view.cz - (py - view.H / 2) / view.s, info: lastInfo, view };
  }

  toggle.addEventListener("click", (event) => {
    event.currentTarget.blur();
    // A real click or tap on the open map picks a spot. Enter or Space on the button still closes it.
    if (big && picker && event.detail > 0) {
      if (grow < 1) return;
      const point = pointAt(event);
      if (point) picker.pick(point);
      return;
    }
    setBig(!big);
  });
  toggle.addEventListener("pointermove", (event) => {
    if (big && picker && grow >= 1 && event.pointerType !== "touch") picker.hover(pointAt(event));
  });
  toggle.addEventListener("pointerleave", () => picker?.hover(null));
  closeButton.addEventListener("click", (event) => {
    event.currentTarget.blur();
    setBig(false);
  });
  window.addEventListener("keydown", (event) => {
    if (shown && big && event.code === "Escape") {
      event.preventDefault();
      setBig(false);
      return;
    }
    if (!shown || event.code !== "KeyM" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
    event.preventDefault();
    setBig(!big);
  });
  toggle.setAttribute("aria-label", t("cityMap.grow"));
  toggle.title = t("cityMap.grow");

  function hide() {
    if (!shown) return;
    shown = false;
    root.hidden = true;
    big = false;
    grow = 0;
    root.classList.remove("is-big");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", t("cityMap.grow"));
    toggle.title = t("cityMap.grow");
  }

  /** Rebuilds the cached city picture when the ground plan or a home on it changes. */
  function refreshLayout(info) {
    if (info.shapes !== shapesRef) {
      shapesRef = info.shapes;
      bounds = measure(info.shapes);
      layoutKey = "";
    }
    const key = info.lots.map((lot) => `${lot.type}:${lot.wall}:${lot.roof}:${lot.main}:${lot.mine}`).join("|");
    if (key === layoutKey && base) return;
    layoutKey = key;
    base = paintBase(info.shapes, info.lots, bounds);
  }

  /**
   * Call every frame. `show` is false outside the city or on the start menu. `foot` and `facing`
   * are the player's, from the game loop.
   */
  function tick(show, foot, facing) {
    if (!show) {
      hide();
      return;
    }
    if (!shown) {
      shown = true;
      root.hidden = false;
      layoutAge = Infinity;
    }
    const now = performance.now();
    const dt = last ? Math.min(0.25, (now - last) / 1000) : 0;
    last = now;
    const info = city.mapInfo(foot);
    lastInfo = info;
    layoutAge += dt;
    if (layoutAge >= LAYOUT_EVERY || !base) {
      layoutAge = 0;
      refreshLayout(info);
    }
    const target = big ? 1 : 0;
    if (grow !== target) {
      const k = still?.matches ? 1 : Math.min(1, (now - growAt) / GROW_MS);
      grow = growFrom + (target - growFrom) * k;
      if (k >= 1) grow = target;
    }
    draw(info, facing, now / 1000);
  }

  function draw(info, facing, time) {
    const scale = dpr();
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W || !H || !base) return;
    const pw = Math.round(W * scale);
    const ph = Math.round(H * scale);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const e = smooth(grow);
    const you = info.you;
    const heading = you.driving ? you.heading : facing ?? 0;
    const pad = 18 + 22 * e;
    const fit = Math.min((W - pad * 2) / (bounds.maxX - bounds.minX), (H - pad * 2) / (bounds.maxZ - bounds.minZ));
    const near = W / MINI_SPAN;
    const s = Math.exp(Math.log(near) * (1 - e) + Math.log(fit) * e);
    const midX = (bounds.minX + bounds.maxX) / 2;
    const midZ = (bounds.minZ + bounds.maxZ) / 2;
    const cx = you.x + (midX - you.x) * e;
    const cz = you.z + (midZ - you.z) * e;
    const sx = (x) => W / 2 + (x - cx) * s;
    const sy = (z) => H / 2 - (z - cz) * s;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = LAND;
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base.canvas, sx(bounds.minX), sy(bounds.maxZ), (bounds.maxX - bounds.minX) * s, (bounds.maxZ - bounds.minZ) * s);

    const badge = 16 + 6 * e;
    const placed = [];
    const labels = [];
    const goal = info.goal;
    const goalStyle = goal ? GOALS[goal.kind] ?? GOALS.pickup : null;

    if (goal) {
      const gx = sx(goal.x);
      const gy = sy(goal.z);
      ctx.save();
      ctx.strokeStyle = goalStyle.color;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.setLineDash([2, 7]);
      ctx.lineDashOffset = -time * 18;
      ctx.beginPath();
      ctx.moveTo(sx(you.x), sy(you.z));
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.restore();
    }

    for (const place of info.places) {
      drawBadge(sx(place.x), sy(place.z), badge, place.icon, place.color ?? "#ffffff");
      labels.push({ x: sx(place.x), y: sy(place.z), text: t(place.nameKey), rank: place.id === "pizza" ? 3 : 6 });
    }
    for (const lot of info.lots) {
      const x = sx(lot.x);
      const y = sy(lot.z);
      const type = t(lot.nameKey);
      if (lot.main) {
        drawBadge(x, y, badge * 1.15, "🏠", ME);
        labels.push({ x, y, text: t("cityMap.yourHome"), rank: 2, strong: true });
      } else if (lot.mine) {
        drawBadge(x, y, badge, "🔑", "#3ecf8e");
        labels.push({ x, y, text: fill(t("cityMap.owned"), { type }), rank: 4 });
      } else {
        drawBadge(x, y, badge, "🏷️", "#ffffff");
        labels.push({ x, y, text: fill(t("cityMap.forSale"), { type }), rank: 5 });
      }
    }
    if (!you.driving && info.car) {
      drawCar(sx(info.car.x), sy(info.car.z), info.car.heading, 0.75 + 0.2 * e, 0.9);
      labels.push({ x: sx(info.car.x), y: sy(info.car.z), text: t("cityMap.yourCar"), rank: 7 });
    }

    if (goal) {
      const gx = sx(goal.x);
      const gy = sy(goal.z);
      const pulse = 0.5 + 0.5 * Math.sin(time * 5);
      ctx.save();
      ctx.strokeStyle = goalStyle.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + 0.5 * (1 - pulse);
      ctx.beginPath();
      ctx.arc(gx, gy, badge * (0.7 + 0.5 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawBadge(gx, gy, badge * 1.1, goalStyle.icon, goalStyle.color);
      const goalText = goal.kind === "deliver" ? t("cityMap.goalDeliver") : goal.kind === "tour" ? t("cityMap.goalTour") : t("cityMap.goalPickup");
      labels.push({ x: gx, y: gy, text: goalText, rank: 0, color: goalStyle.color });
    }

    drawYou(sx(you.x), sy(you.z), heading, you.driving, time, 1 + 0.15 * e);
    labels.push({ x: sx(you.x), y: sy(you.z), text: t("cityMap.you"), rank: 1, color: ME });

    if (goal && e < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - e;
      drawEdgePointer(sx(goal.x), sy(goal.z), sx(you.x), sy(you.z), W, H, goalStyle, Math.hypot(goal.x - you.x, goal.z - you.z), badge);
      ctx.restore();
    }

    if (e > 0.55) {
      ctx.save();
      ctx.globalAlpha = (e - 0.55) / 0.45;
      labels.sort((a, b) => a.rank - b.rank);
      for (const label of labels) drawLabel(label, badge, placed, W, H);
      ctx.restore();
    }
    view = { cx, cz, s, W, H, sx, sy, badge, e, time, facing: heading };
    picker?.draw(ctx, view, info);
    if (e < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - e;
      drawNorth(W);
      ctx.restore();
    }
  }

  function icon(glyph, size) {
    const scale = dpr();
    const key = `${glyph}|${size}|${scale}`;
    let art = icons.get(key);
    if (art) return art;
    art = document.createElement("canvas");
    const px = Math.ceil(size * 1.3 * scale);
    art.width = px;
    art.height = px;
    const g = art.getContext("2d");
    g.scale(scale, scale);
    g.font = `${size}px ${EMOJI_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(glyph, (size * 1.3) / 2, (size * 1.3) / 2 + size * 0.06);
    icons.set(key, art);
    return art;
  }

  function drawBadge(x, y, size, glyph, color) {
    const r = size / 2;
    ctx.fillStyle = "rgba(30, 12, 28, 0.28)";
    ctx.beginPath();
    ctx.arc(x + 1, y + 2, r + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const glyphSize = Math.round(size * 0.62);
    const art = icon(glyph, glyphSize);
    const box = glyphSize * 1.3;
    ctx.drawImage(art, x - box / 2, y - box / 2, box, box);
  }

  function drawYou(x, y, heading, driving, time, k) {
    const halo = 11 * k + Math.sin(time * 4) * 1.5;
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.arc(x, y, halo, 0, Math.PI * 2);
    ctx.fill();
    if (driving) {
      drawCar(x, y, heading, 1.05 * k, 1);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7.5, 7.5);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-7.5, 7.5);
    ctx.closePath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = ME;
    ctx.fill();
    ctx.restore();
  }

  /** A pink car seen from above, nose pointing along `heading`. */
  function drawCar(x, y, heading, k, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(heading);
    ctx.scale(k, k);
    ctx.fillStyle = "rgba(30, 12, 28, 0.3)";
    roundRect(ctx, -5, -8, 12, 18, 4);
    ctx.fill();
    ctx.fillStyle = CAR;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    roundRect(ctx, -6, -10, 12, 19, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#cfefff";
    roundRect(ctx, -4.2, -6.5, 8.4, 4, 1.5);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.fillRect(-4.5, -10, 2.4, 1.6);
    ctx.fillRect(2.1, -10, 2.4, 1.6);
    ctx.restore();
  }

  /** When the goal is off the corner map, a pointer on its edge shows which way to go and how far. */
  function drawEdgePointer(gx, gy, ox, oy, W, H, style, meters, size) {
    const inset = size * 0.5 + 8;
    if (gx > inset && gx < W - inset && gy > inset && gy < H - inset) return;
    const dx = gx - ox;
    const dy = gy - oy;
    const tx = dx > 0 ? (W - inset - ox) / dx : dx < 0 ? (inset - ox) / dx : Infinity;
    const ty = dy > 0 ? (H - inset - oy) / dy : dy < 0 ? (inset - oy) / dy : Infinity;
    const k = Math.min(tx, ty, 1);
    const x = ox + dx * k;
    const y = oy + dy * k;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = style.color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 0.5 + 7, 0);
    ctx.lineTo(size * 0.5 - 1, -6);
    ctx.lineTo(size * 0.5 - 1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    drawBadge(x, y, size, style.icon, style.color);
    const text = fill(t("cityMap.meters"), { n: Math.round(meters) });
    ctx.font = `800 10px ${TEXT_FONT}`;
    const tw = ctx.measureText(text).width + 8;
    const ly = y + size * 0.5 + 9 > H - 4 ? y - size * 0.5 - 9 : y + size * 0.5 + 9;
    const lx = Math.max(tw / 2 + 2, Math.min(W - tw / 2 - 2, x));
    ctx.fillStyle = "rgba(255, 252, 255, 0.92)";
    roundRect(ctx, lx - tw / 2, ly - 7, tw, 14, 7);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx, ly + 0.5);
  }

  /** A name pill above its marker, or below when that spot is taken. Skipped if neither fits. */
  function drawLabel(label, size, placed, W, H) {
    const fontSize = W < 420 ? 11 : 13;
    ctx.font = `${label.strong ? 900 : 800} ${fontSize}px ${TEXT_FONT}`;
    const w = ctx.measureText(label.text).width + fontSize * 1.1;
    const h = fontSize * 1.75;
    const gap = size * 0.5 + 4;
    for (const y of [label.y - gap - h, label.y + gap]) {
      const x = Math.max(3, Math.min(W - w - 3, label.x - w / 2));
      const top = Math.max(3, Math.min(H - h - 3, y));
      const box = { x0: x - 2, y0: top - 2, x1: x + w + 2, y1: top + h + 2 };
      if (placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
      placed.push(box);
      ctx.fillStyle = label.color ?? "rgba(255, 252, 255, 0.94)";
      roundRect(ctx, x, top, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = label.color ? "#ffffff" : INK;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label.text, x + w / 2, top + h / 2 + 0.5);
      return;
    }
  }

  function drawNorth(W) {
    const x = W / 2;
    const y = 12;
    ctx.fillStyle = "rgba(255, 252, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `900 10px ${TEXT_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("cityMap.north"), x, y + 0.5);
  }

  return {
    get big() {
      return big;
    },
    tick,
    open() {
      if (shown) setBig(true);
    },
    close() {
      setBig(false);
    },
    /** `{ hint(touch), hover(point | null), pick(point), draw(ctx, view, info) }` for clicks on the big map. */
    setPicker(next) {
      picker = next;
    },
  };
}

/** The ground plan's extent, from the flat pieces (so tall props at the edge don't stretch it). */
function measure(shapes) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const shape of shapes) {
    if (shape.top > 1.2) continue;
    const half = shape.kind === "disc" ? shape.r : Math.hypot(shape.w, shape.d) / 2;
    const hx = shape.kind === "disc" ? half : Math.abs(Math.cos(shape.yaw)) * shape.w / 2 + Math.abs(Math.sin(shape.yaw)) * shape.d / 2;
    const hz = shape.kind === "disc" ? half : Math.abs(Math.sin(shape.yaw)) * shape.w / 2 + Math.abs(Math.cos(shape.yaw)) * shape.d / 2;
    b.minX = Math.min(b.minX, shape.x - hx);
    b.maxX = Math.max(b.maxX, shape.x + hx);
    b.minZ = Math.min(b.minZ, shape.z - hz);
    b.maxZ = Math.max(b.maxZ, shape.z + hz);
  }
  if (!Number.isFinite(b.minX)) return { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
  const limit = 900;
  return {
    minX: Math.max(-limit, b.minX),
    maxX: Math.min(limit, b.maxX),
    minZ: Math.max(-limit, b.minZ),
    maxZ: Math.min(limit, b.maxZ),
  };
}

/** Paints the whole city once, lowest pieces first, so the map only has to copy it each frame. */
function paintBase(shapes, lots, b) {
  const spanX = b.maxX - b.minX;
  const spanZ = b.maxZ - b.minZ;
  const res = Math.min(BASE_RES, BASE_MAX / Math.max(spanX, spanZ));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(spanX * res));
  canvas.height = Math.max(1, Math.ceil(spanZ * res));
  const g = canvas.getContext("2d");
  g.fillStyle = LAND;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(res, 0, 0, res, -b.minX * res, b.maxZ * res);
  const order = shapes.map((shape, index) => ({ shape, index })).sort((a, b2) => a.shape.top - b2.shape.top || a.index - b2.index);
  for (const { shape } of order) {
    const tall = shape.top > 1.5;
    if (tall) {
      g.fillStyle = "rgba(30, 20, 40, 0.18)";
      outline(g, shape, 0.9);
      g.fill();
    }
    g.fillStyle = shape.color;
    outline(g, shape, 0);
    g.fill();
    if (tall) {
      g.lineWidth = 0.45;
      g.strokeStyle = shade(shape.color, 0.72);
      g.stroke();
    }
  }
  for (const lot of lots) {
    const shape = { kind: "rect", x: lot.x, z: lot.z, w: lot.w, d: lot.d, yaw: 0 };
    g.fillStyle = "rgba(30, 20, 40, 0.2)";
    outline(g, shape, 1.2);
    g.fill();
    g.fillStyle = lot.wall;
    outline(g, shape, 0);
    g.fill();
    g.lineWidth = 1.4;
    g.strokeStyle = lot.roof;
    g.stroke();
  }
  return { canvas, res };
}

/** Traces a shape on the base canvas, whose y axis is the city's -z. */
function outline(g, shape, offset) {
  g.beginPath();
  if (shape.kind === "disc") {
    g.arc(shape.x + offset, -shape.z + offset, shape.r, 0, Math.PI * 2);
    return;
  }
  const c = Math.cos(shape.yaw);
  const s = Math.sin(shape.yaw);
  const hw = shape.w / 2;
  const hd = shape.d / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  corners.forEach(([lx, lz], i) => {
    const x = shape.x + lx * c + lz * s + offset;
    const y = -(shape.z - lx * s + lz * c) + offset;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
}

function shade(hex, k) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  if (!m) return "rgba(40, 30, 50, 0.5)";
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const gg = Math.round(((n >> 8) & 255) * k);
  const bl = Math.round((n & 255) * k);
  return `rgb(${r}, ${gg}, ${bl})`;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
