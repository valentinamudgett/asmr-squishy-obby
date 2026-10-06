import blackletterUrl from "@fontsource/unifrakturmaguntia/files/unifrakturmaguntia-latin-400-normal.woff2?url";
import { mulberry32 } from "./geometry.js";
import { t } from "./i18n.js";

const PLAID = { type: "plaid", base: "#7a4a2b", band: "#c08e5e", line: "#3c2114", thread: "#ead0a4" };
const GRAY_PLAID = { type: "plaid", base: "#d7d7dc", band: "#9b9ba3", line: "#5e5e66", thread: "#f4f4f6" };
const WHITE = "#fbf8f4";
const INKPRINT = { type: "inkprint", base: "#c9c8c4", ink: "#25211f" };
const BLACKLETTER = `"UnifrakturMaguntia", "Old English Text MT", Georgia, serif`;

/** Resolves once the blackletter font can be drawn on a canvas; fabrics that print text repaint then. */
export const fabricFontsReady = new FontFace("UnifrakturMaguntia", `url(${blackletterUrl})`)
  .load()
  .then((font) => {
    document.fonts.add(font);
  })
  .catch(() => {});

export function patternNeedsFonts(pattern) {
  return typeof pattern === "object" && pattern?.type === "inkprint";
}
const INK_WORDS = [
  "gloria", "vitae", "Sanctus", "dominus", "verbum", "lux", "aeterna", "memoria", "Spiritus",
  "mundi", "fides", "amor", "noctis", "regnum", "caelum", "umbra", "bodie", "Deus", "vigilia",
];

/**
 * Pieces: torso (pattern + front overlay), sleeves, skirt, thigh, shin, shoes.
 * "skin" means that part shows the avatar's skin tone.
 * Optional extras: `hood` (fur hood worn up), `belt` (belt with buckle at the waist), `hipCloth` (sheer cloth at one hip).
 */
export const OUTFITS = [
  {
    id: "pinafore",
    label: "Plaid pinafore",
    swatch: ["#7a4a2b", WHITE],
    torso: PLAID,
    overlay: "collar",
    sleeve: WHITE,
    forearm: WHITE,
    skirt: PLAID,
    thigh: "skin",
    shin: WHITE,
    shoes: WHITE,
  },
  {
    id: "overalls",
    label: "Denim overalls",
    swatch: ["#4a6fa5", "#ff9fc0"],
    torso: { type: "stripes", a: "#ff9fc0", b: "#ffffff" },
    overlay: "bib",
    sleeve: { type: "stripes", a: "#ff9fc0", b: "#ffffff" },
    forearm: "skin",
    skirt: null,
    thigh: { type: "denim" },
    shin: { type: "denim" },
    shoes: "#e9475a",
  },
  {
    id: "hoodie",
    label: "Cozy hoodie",
    swatch: ["#b9a6ff", "#8a8fa3"],
    torso: "#b9a6ff",
    overlay: "hoodie",
    sleeve: "#b9a6ff",
    forearm: "#b9a6ff",
    skirt: null,
    thigh: "#8a8fa3",
    shin: "#8a8fa3",
    shoes: "#ffffff",
  },
  {
    id: "sporty",
    label: "Sporty",
    swatch: ["#6fd8c0", "#2f3a68"],
    torso: "#6fd8c0",
    overlay: "number",
    sleeve: "#6fd8c0",
    forearm: "skin",
    skirt: null,
    thigh: "#2f3a68",
    shin: "skin",
    shoes: "#ff7a6a",
  },
  {
    id: "starry",
    label: "Starry dress",
    swatch: ["#2b2f6b", "#ffd96a"],
    torso: { type: "stars", base: "#2b2f6b", star: "#ffd96a" },
    overlay: "collar",
    sleeve: { type: "stars", base: "#2b2f6b", star: "#ffd96a" },
    forearm: "skin",
    skirt: { type: "stars", base: "#2b2f6b", star: "#ffd96a" },
    thigh: "skin",
    shin: "skin",
    shoes: "#1d1a22",
  },
  {
    id: "inkprint",
    label: t("outfit.inkprint"),
    swatch: ["#c9c8c4", "#7b95b6"],
    torso: INKPRINT,
    overlay: "zipHoodie",
    sleeve: INKPRINT,
    forearm: INKPRINT,
    skirt: null,
    thigh: { type: "jeans" },
    shin: { type: "jeans" },
    shoes: "#2a2a2e",
    hood: "#a9a7a3",
    belt: "#1b1a1c",
    hipCloth: "#2c2b30",
  },
  {
    id: "buns",
    label: t("outfit.buns"),
    swatch: ["#e6e2dc", "#c9a36a"],
    torso: "#eceae4",
    overlay: "tank",
    sleeve: "skin",
    forearm: "skin",
    skirt: null,
    thigh: "#d2b48c",
    shin: "#f7f4ef",
    shoes: "#ffffff",
  },
  {
    id: "preppy",
    label: t("outfit.preppy"),
    swatch: ["#d7d7dc", "#141414"],
    torso: { type: "crop", top: "#141414", bottom: "#eab892" },
    overlay: "plaidOpen",
    sleeve: GRAY_PLAID,
    forearm: GRAY_PLAID,
    skirt: null,
    thigh: "#141414",
    shin: "#141414",
    shoes: "#f7f7f7",
  },
  {
    id: "pretty",
    label: t("outfit.pretty"),
    swatch: ["#6b4638", "#8ec4e4"],
    torso: "#6b4638",
    overlay: "eightyNine",
    sleeve: "#6b4638",
    forearm: "skin",
    skirt: null,
    thigh: "#8ec4e4",
    shin: "skin",
    shoes: "#f7f4ee",
  },
];

export function outfitById(id) {
  return OUTFITS.find((outfit) => outfit.id === id) ?? OUTFITS[0];
}

export function patternKey(pattern) {
  return typeof pattern === "string" ? pattern : JSON.stringify(pattern);
}

/** Paints a tileable fabric pattern across a size × size canvas. */
export function paintPattern(ctx, size, pattern) {
  if (typeof pattern === "string") {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, size, size);
    return;
  }
  if (pattern.type === "plaid") {
    ctx.fillStyle = pattern.base;
    ctx.fillRect(0, 0, size, size);
    const step = size / 4;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pattern.band;
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(i * step + step * 0.3, 0, step * 0.4, size);
      ctx.fillRect(0, i * step + step * 0.3, size, step * 0.4);
    }
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pattern.line;
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(i * step, 0, step * 0.08, size);
      ctx.fillRect(0, i * step, size, step * 0.08);
    }
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = pattern.thread;
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(i * step + step * 0.49, 0, step * 0.03, size);
      ctx.fillRect(0, i * step + step * 0.49, size, step * 0.03);
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (pattern.type === "stripes") {
    const band = size / 8;
    for (let i = 0; i < 8; i += 1) {
      ctx.fillStyle = i % 2 ? pattern.b : pattern.a;
      ctx.fillRect(0, i * band, size, band);
    }
    return;
  }
  if (pattern.type === "denim") {
    ctx.fillStyle = "#4a6fa5";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.lineWidth = 2;
    for (let i = -size; i < size * 2; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(240, 190, 90, 0.8)";
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(size * 0.06, -4, size * 0.88, size + 8);
    ctx.setLineDash([]);
    return;
  }
  if (pattern.type === "stars") {
    ctx.fillStyle = pattern.base;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = pattern.star;
    const spots = [
      [0.15, 0.2], [0.6, 0.12], [0.38, 0.45], [0.82, 0.5], [0.12, 0.72], [0.55, 0.8], [0.9, 0.9],
    ];
    for (const [x, y] of spots) star(ctx, x * size, y * size, size * 0.05);
    return;
  }
  if (pattern.type === "inkprint") {
    paintInkprint(ctx, size, pattern);
    return;
  }
  if (pattern.type === "jeans") paintJeans(ctx, size);
  if (pattern.type === "crop") {
    ctx.fillStyle = pattern.bottom;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = pattern.top;
    ctx.fillRect(0, 0, size, size * 0.42);
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.fillRect(0, size * 0.38, size, size * 0.035);
  }
}

/** Washed grey cotton printed edge to edge with dense blackletter text; tiles in both directions. */
function paintInkprint(ctx, size, pattern) {
  const rand = mulberry32(31);
  ctx.fillStyle = pattern.base;
  ctx.fillRect(0, 0, size, size);
  const wrapped = (draw) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
  };
  for (let i = 0; i < 26; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = size * (0.06 + rand() * 0.14);
    ctx.fillStyle = rand() < 0.5 ? "rgba(255, 255, 255, 0.08)" : "rgba(40, 36, 34, 0.07)";
    wrapped((dx, dy) => {
      ctx.beginPath();
      ctx.ellipse(x + dx, y + dy, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  const rows = 10;
  const step = size / rows;
  ctx.font = `400 ${Math.round(step * 1.05)}px ${BLACKLETTER}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = pattern.ink;
  for (let row = 0; row < rows; row += 1) {
    const y = (row + 0.78) * step;
    const shift = rand() * size;
    ctx.globalAlpha = 0.72 + rand() * 0.25;
    const gap = step * 0.3;
    let x = 0;
    for (let tries = 0; tries < 40; tries += 1) {
      const word = INK_WORDS[Math.floor(rand() * INK_WORDS.length)];
      const width = ctx.measureText(word).width;
      if (x + width + gap > size) continue;
      for (const dx of [-size, 0, size]) ctx.fillText(word, x + shift + dx, y);
      x += width + gap;
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = rand() < 0.6 ? "rgba(214, 212, 207, 0.55)" : "rgba(30, 26, 24, 0.25)";
    ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let i = 0; i < 5; i += 1) {
    const x = rand() * size;
    const fold = ctx.createLinearGradient(x - 10, 0, x + 10, 0);
    fold.addColorStop(0, "rgba(0, 0, 0, 0)");
    fold.addColorStop(0.5, "rgba(0, 0, 0, 0.08)");
    fold.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = fold;
    wrapped((dx) => ctx.fillRect(x - 10 + dx, 0, 20, size));
  }
}

/** Light-wash, faded denim with vertical slub lines and worn highlights. */
function paintJeans(ctx, size) {
  const rand = mulberry32(5);
  ctx.fillStyle = "#6f89aa";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i += 1) {
    const x = rand() * size;
    ctx.strokeStyle = rand() < 0.55 ? `rgba(230, 238, 248, ${0.06 + rand() * 0.14})` : `rgba(28, 42, 66, ${0.05 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    const y = rand() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + rand() * 4 - 2, y + size * (0.1 + rand() * 0.4));
    ctx.stroke();
  }
  const fade = ctx.createRadialGradient(size * 0.5, size * 0.45, 0, size * 0.5, size * 0.45, size * 0.55);
  fade.addColorStop(0, "rgba(225, 233, 245, 0.28)");
  fade.addColorStop(1, "rgba(225, 233, 245, 0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
  ctx.lineWidth = 2;
  for (let i = -size; i < size * 2; i += 5) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(236, 214, 170, 0.7)";
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(size * 0.05, -4, size * 0.9, size + 8);
  ctx.setLineDash([]);
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Transparent decorations drawn on the torso front: collar, bib, pocket, number.
 * "suspenders" draws a collar plus two straps cut from `fabric`; it turns a dress into shirt and shorts.
 */
export function paintOverlay(ctx, size, overlay, fabric) {
  ctx.clearRect(0, 0, size, size);
  if (overlay === "suspenders") {
    const swatch = document.createElement("canvas");
    swatch.width = 128;
    swatch.height = 128;
    paintPattern(swatch.getContext("2d"), 128, fabric);
    ctx.fillStyle = ctx.createPattern(swatch, "repeat");
    ctx.fillRect(size * 0.2, 0, size * 0.13, size);
    ctx.fillRect(size * 0.67, 0, size * 0.13, size);
    ctx.fillRect(0, size * 0.86, size, size * 0.14);
    ctx.fillStyle = "#3c2114";
    for (const x of [0.265, 0.735]) {
      ctx.beginPath();
      ctx.arc(size * x, size * 0.8, size * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
    paintCollar(ctx, size);
    return;
  }
  if (overlay === "collar") {
    paintCollar(ctx, size);
    return;
  }
  if (overlay === "zipHoodie") {
    paintZipHoodie(ctx, size);
    return;
  }
  paintRest(ctx, size, overlay);
}

/** Open zip with a white undershirt V, a sketched flower, a kangaroo pocket, and a phone hanging on a cord. */
function paintZipHoodie(ctx, size) {
  const s = (value) => value * size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "#f4f3f0";
  ctx.beginPath();
  ctx.moveTo(s(0.34), 0);
  ctx.lineTo(s(0.66), 0);
  ctx.lineTo(s(0.5), s(0.34));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(40, 36, 34, 0.55)";
  ctx.lineWidth = s(0.012);
  ctx.beginPath();
  ctx.moveTo(s(0.34), 0);
  ctx.lineTo(s(0.5), s(0.34));
  ctx.lineTo(s(0.66), 0);
  ctx.stroke();

  ctx.strokeStyle = "#6c6a68";
  ctx.lineWidth = s(0.014);
  ctx.beginPath();
  ctx.moveTo(s(0.5), s(0.34));
  ctx.lineTo(s(0.5), size);
  ctx.stroke();
  ctx.strokeStyle = "#d9d8d4";
  ctx.lineWidth = s(0.006);
  ctx.setLineDash([s(0.01), s(0.012)]);
  ctx.beginPath();
  ctx.moveTo(s(0.5), s(0.35));
  ctx.lineTo(s(0.5), size);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#bdbcb8";
  ctx.fillRect(s(0.488), s(0.36), s(0.024), s(0.07));

  ctx.strokeStyle = "rgba(30, 26, 24, 0.45)";
  ctx.lineWidth = s(0.01);
  ctx.beginPath();
  ctx.moveTo(s(0.22), s(0.93));
  ctx.lineTo(s(0.3), s(0.62));
  ctx.lineTo(s(0.47), s(0.62));
  ctx.moveTo(s(0.78), s(0.93));
  ctx.lineTo(s(0.7), s(0.62));
  ctx.lineTo(s(0.53), s(0.62));
  ctx.stroke();
  ctx.fillStyle = "rgba(30, 26, 24, 0.22)";
  ctx.fillRect(0, s(0.94), size, s(0.06));

  paintFlowerSketch(ctx, s(0.72), s(0.36), s(0.12));

  ctx.strokeStyle = "rgba(235, 233, 228, 0.9)";
  ctx.lineWidth = s(0.008);
  ctx.beginPath();
  ctx.moveTo(s(0.43), s(0.02));
  ctx.quadraticCurveTo(s(0.3), s(0.3), s(0.33), s(0.62));
  ctx.stroke();
  ctx.fillStyle = "#151417";
  roundRect(ctx, s(0.27), s(0.62), s(0.12), s(0.2), s(0.02));
  ctx.fill();
  ctx.fillStyle = "#e9e7e2";
  roundRect(ctx, s(0.295), s(0.65), s(0.07), s(0.06), s(0.01));
  ctx.fill();
  ctx.strokeStyle = "#e9e7e2";
  ctx.lineWidth = s(0.006);
  ctx.beginPath();
  ctx.arc(s(0.33), s(0.765), s(0.022), 0, Math.PI * 2);
  ctx.stroke();
}

function paintFlowerSketch(ctx, x, y, r) {
  ctx.save();
  ctx.strokeStyle = "rgba(20, 18, 18, 0.85)";
  ctx.lineWidth = r * 0.07;
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(angle) * r * 0.42, y + Math.sin(angle) * r * 0.42, r * 0.42, r * 0.2, angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r * 0.1, y + r * 0.8);
  ctx.quadraticCurveTo(x - r * 0.4, y + r * 1.4, x - r * 0.15, y + r * 2);
  ctx.stroke();
  for (const [lx, ly, angle] of [[-0.45, 1.25, -0.6], [0.05, 1.6, 0.5]]) {
    ctx.beginPath();
    ctx.ellipse(x + lx * r, y + ly * r, r * 0.28, r * 0.11, angle, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = r * 0.04;
  for (let i = 0; i < 5; i += 1) {
    const angle = i * 1.3;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * r * 0.95, y + Math.sin(angle) * r * 0.95);
    ctx.lineTo(x + Math.cos(angle + 0.25) * r * 1.15, y + Math.sin(angle + 0.25) * r * 1.15);
    ctx.stroke();
  }
  ctx.restore();
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

function paintCollar(ctx, size) {
  ctx.fillStyle = WHITE;
  ctx.fillRect(size * 0.3, 0, size * 0.4, size * 0.05);
  ctx.strokeStyle = "rgba(60, 30, 20, 0.3)";
  ctx.lineWidth = size * 0.008;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(size / 2, size * 0.04);
    ctx.lineTo(size / 2 + side * size * 0.2, size * 0.02);
    ctx.quadraticCurveTo(size / 2 + side * size * 0.19, size * 0.13, size / 2 + side * size * 0.02, size * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function paintRest(ctx, size, overlay) {
  if (overlay === "bib") {
    const denim = document.createElement("canvas");
    denim.width = 128;
    denim.height = 128;
    paintPattern(denim.getContext("2d"), 128, { type: "denim" });
    const fill = ctx.createPattern(denim, "repeat");
    ctx.fillStyle = fill;
    ctx.fillRect(size * 0.2, size * 0.38, size * 0.6, size * 0.62);
    ctx.fillRect(size * 0.18, 0, size * 0.12, size * 0.42);
    ctx.fillRect(size * 0.7, 0, size * 0.12, size * 0.42);
    ctx.fillStyle = "#f2c14e";
    for (const x of [0.26, 0.74]) {
      ctx.beginPath();
      ctx.arc(size * x, size * 0.44, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(size * 0.36, size * 0.56, size * 0.28, size * 0.2);
    return;
  }
  if (overlay === "hoodie") {
    ctx.fillStyle = "rgba(60, 40, 120, 0.22)";
    ctx.beginPath();
    ctx.moveTo(size * 0.24, size * 0.98);
    ctx.lineTo(size * 0.3, size * 0.64);
    ctx.lineTo(size * 0.7, size * 0.64);
    ctx.lineTo(size * 0.76, size * 0.98);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = size * 0.025;
    for (const x of [0.42, 0.58]) {
      ctx.beginPath();
      ctx.moveTo(size * x, size * 0.06);
      ctx.lineTo(size * x, size * 0.34);
      ctx.stroke();
    }
    return;
  }
  if (overlay === "number") {
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(size * 0.46)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("7", size / 2, size * 0.56);
    ctx.fillRect(0, 0, size, size * 0.06);
    return;
  }
  if (overlay === "tank") {
    ctx.strokeStyle = "rgba(90, 78, 68, 0.45)";
    ctx.lineWidth = size * 0.035;
    ctx.beginPath();
    ctx.arc(size / 2, size * -0.02, size * 0.3, 0.35, Math.PI - 0.35);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.fillRect(0, size * 0.9, size, size * 0.08);
    return;
  }
  if (overlay === "plaidOpen") {
    const swatch = document.createElement("canvas");
    swatch.width = 128;
    swatch.height = 128;
    paintPattern(swatch.getContext("2d"), 128, GRAY_PLAID);
    ctx.fillStyle = ctx.createPattern(swatch, "repeat");
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 0.36, 0);
    ctx.lineTo(size * 0.16, size);
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(size * 0.64, 0);
    ctx.lineTo(size * 0.84, size);
    ctx.lineTo(size, size);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.34, size * 0.02);
    ctx.lineTo(size * 0.48, size * 0.02);
    ctx.lineTo(size * 0.42, size * 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(size * 0.66, size * 0.02);
    ctx.lineTo(size * 0.52, size * 0.02);
    ctx.lineTo(size * 0.58, size * 0.16);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (overlay === "eightyNine") {
    ctx.font = `800 ${Math.round(size * 0.48)}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.04;
    ctx.strokeStyle = "#f4a0c4";
    ctx.strokeText("89", size / 2, size * 0.52);
    ctx.fillStyle = "#fff7fb";
    ctx.fillText("89", size / 2, size * 0.52);
    ctx.fillStyle = "#e7a0bf";
    ctx.fillRect(0, size * 0.88, size, size * 0.08);
    ctx.strokeStyle = "#4a3028";
    ctx.lineWidth = size * 0.028;
    ctx.beginPath();
    ctx.arc(size / 2, size * 0.02, size * 0.18, 0.4, Math.PI - 0.4);
    ctx.stroke();
  }
}
