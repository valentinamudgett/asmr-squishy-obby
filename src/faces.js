import { t } from "./i18n.js";

export const FACES = [
  { id: "grin", label: "Big grin" },
  { id: "dumpling", label: "Dumpling" },
  { id: "smile", label: "Smile" },
  { id: "wink", label: "Wink" },
  { id: "surprised", label: "Surprised" },
  { id: "sleepy", label: "Sleepy" },
  { id: "quiet", label: t("face.quiet") },
  { id: "glam", label: t("face.glam") },
];

const INK = "#1d1418";

/** Draws a face expression into a transparent canvas area of size w × h. */
export function drawFace(ctx, id, w, h) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const draw = DRAWERS[id] ?? DRAWERS.grin;
  draw(ctx, w, h);
  ctx.restore();
}

function blush(ctx, w, h, style = "soft") {
  for (const side of [-1, 1]) {
    const x = w / 2 + side * w * 0.3;
    const y = h * 0.6;
    if (style === "dashes") {
      ctx.strokeStyle = "#ff8fa8";
      ctx.lineWidth = w * 0.014;
      for (let k = -1; k <= 1; k += 1) {
        const cx = x + k * w * 0.032;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.008, y + h * 0.03);
        ctx.lineTo(cx + w * 0.008, y - h * 0.03);
        ctx.stroke();
      }
    } else {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, w * 0.08);
      glow.addColorStop(0, "rgba(255, 120, 140, 0.55)");
      glow.addColorStop(1, "rgba(255, 120, 140, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.08, h * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function ovalEye(ctx, x, y, rx, ry, shine = true) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!shine) return;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x + rx * 0.3, y - ry * 0.38, rx * 0.36, 0, Math.PI * 2);
  ctx.fill();
}

function happyEye(ctx, x, y, w, lashes) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w * 0.024;
  ctx.beginPath();
  ctx.arc(x, y + w * 0.03, w * 0.055, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  if (!lashes) return;
  const side = Math.sign(x - w / 2);
  ctx.lineWidth = w * 0.014;
  ctx.beginPath();
  ctx.moveTo(x + side * w * 0.05, y + w * 0.002);
  ctx.lineTo(x + side * w * 0.078, y - w * 0.018);
  ctx.moveTo(x + side * w * 0.035, y - w * 0.014);
  ctx.lineTo(x + side * w * 0.055, y - w * 0.04);
  ctx.stroke();
}

function bezierPoint(p0, p1, p2, p3, k) {
  const m = 1 - k;
  return [
    m * m * m * p0[0] + 3 * m * m * k * p1[0] + 3 * m * k * k * p2[0] + k * k * k * p3[0],
    m * m * m * p0[1] + 3 * m * m * k * p1[1] + 3 * m * k * k * p2[1] + k * k * k * p3[1],
  ];
}

/**
 * The glam face, laid out from a reference photo: positions are fractions of that photo, with the
 * eyes measured as `u` out from the middle. Soft edges come from a canvas blur where supported.
 */
function drawGlam(ctx, w, h) {
  const X = (x) => (0.5 + (x - 0.49) * 0.9) * w;
  const Y = (y) => (0.16 + y * 0.74) * h;
  const S = (size) => size * 0.9 * w;
  const soft = (amount) => {
    if ("filter" in ctx) ctx.filter = amount ? `blur(${amount * w}px)` : "none";
  };
  const glow = (x, y, rx, ry, rgb, alpha) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    const fade = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    fade.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    fade.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = fade;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  };

  for (const side of [-1, 1]) {
    const at = (u, y) => [X(0.49 + side * u), Y(y)];
    glow(...at(0.3, 0.56), S(0.13), S(0.08), "235, 120, 110", 0.26);
    glow(...at(0.25, 0.33), S(0.21), S(0.11), "104, 56, 38", 0.42);
    glow(...at(0.33, 0.3), S(0.1), S(0.05), "60, 30, 20", 0.35);

    // A long, soft, low arch: thick at the inner end, thinning out to the tail.
    soft(0.004);
    ctx.fillStyle = "rgba(42, 23, 15, 0.88)";
    ctx.beginPath();
    ctx.moveTo(...at(0.06, 0.2));
    ctx.lineTo(...at(0.065, 0.163));
    ctx.quadraticCurveTo(...at(0.14, 0.13), ...at(0.22, 0.12));
    ctx.quadraticCurveTo(...at(0.36, 0.125), ...at(0.46, 0.21));
    ctx.quadraticCurveTo(...at(0.34, 0.155), ...at(0.22, 0.157));
    ctx.quadraticCurveTo(...at(0.14, 0.167), ...at(0.06, 0.2));
    ctx.fill();
    soft(0);

    // Sleepy almond eyes: the heavy upper lid hides the top of a big dark iris.
    const inner = at(0.11, 0.405);
    const outer = at(0.4, 0.31);
    const lid = [inner, at(0.15, 0.32), at(0.3, 0.27), outer];
    const lower = [outer, at(0.34, 0.41), at(0.2, 0.45), inner];
    const opening = () => {
      ctx.beginPath();
      ctx.moveTo(...inner);
      ctx.bezierCurveTo(...lid[1], ...lid[2], ...outer);
      ctx.bezierCurveTo(...lower[1], ...lower[2], ...inner);
    };
    opening();
    ctx.fillStyle = "#e4d6ce";
    ctx.fill();
    ctx.save();
    opening();
    ctx.clip();
    const [ix, iy] = at(0.235, 0.365);
    const iris = ctx.createRadialGradient(ix, iy, 0, ix, iy, S(0.068));
    iris.addColorStop(0, "#4a2c1c");
    iris.addColorStop(0.7, "#24140c");
    iris.addColorStop(1, "#0e0806");
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ix, iy, S(0.068), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#060302";
    ctx.beginPath();
    ctx.arc(ix, iy, S(0.026), 0, Math.PI * 2);
    ctx.fill();
    const lidShade = ctx.createLinearGradient(0, Y(0.26), 0, Y(0.37));
    lidShade.addColorStop(0, "rgba(30, 14, 8, 0.65)");
    lidShade.addColorStop(1, "rgba(30, 14, 8, 0)");
    ctx.fillStyle = lidShade;
    ctx.fillRect(Math.min(inner[0], outer[0]), Y(0.24), Math.abs(outer[0] - inner[0]), Y(0.46) - Y(0.24));
    glow(...at(0.215, 0.345), S(0.018), S(0.018), "255, 255, 255", 1);
    glow(...at(0.27, 0.4), S(0.008), S(0.008), "255, 255, 255", 0.8);
    ctx.restore();

    soft(0.002);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = S(0.022);
    ctx.beginPath();
    ctx.moveTo(...inner);
    ctx.bezierCurveTo(...lid[1], ...lid[2], ...outer);
    ctx.stroke();
    // The thick outer lashes that flick up past the corner of the eye.
    ctx.beginPath();
    ctx.moveTo(...bezierPoint(...lid, 0.5));
    ctx.quadraticCurveTo(...at(0.38, 0.255), ...at(0.46, 0.25));
    ctx.quadraticCurveTo(...at(0.43, 0.3), ...outer);
    for (let along = 0.95; along >= 0.5; along -= 0.05) ctx.lineTo(...bezierPoint(...lid, along));
    ctx.fill();
    // Spiky lashes, each a thin tapered sliver, growing longer and leaning out toward the corner.
    const lash = (x, y, length, lean, base) => {
      ctx.beginPath();
      ctx.moveTo(x - base, y + base * 0.5);
      ctx.quadraticCurveTo(x + side * length * lean * 0.2, y - length * 0.7, x + side * length * lean, y - length);
      ctx.lineTo(x + base, y + base * 0.5);
      ctx.fill();
    };
    for (let along = 0.15; along <= 1.001; along += 0.07) {
      const [x, y] = bezierPoint(...lid, along);
      lash(x, y, S(0.028 + along * along * 0.045), 0.2 + along * 0.7, S(0.008));
    }
    for (const [u, y, length] of [
      [0.42, 0.29, 0.05],
      [0.45, 0.27, 0.042],
    ]) {
      lash(...at(u, y), S(length), 0.9, S(0.008));
    }
    ctx.strokeStyle = "rgba(30, 15, 10, 0.55)";
    ctx.lineWidth = S(0.008);
    ctx.beginPath();
    ctx.moveTo(...outer);
    ctx.bezierCurveTo(...at(0.36, 0.4), ...at(0.28, 0.44), ...bezierPoint(...lower, 0.55));
    ctx.stroke();
    soft(0);
  }

  glow(X(0.49), Y(0.575), S(0.05), S(0.02), "140, 70, 50", 0.2);
  for (const side of [-1, 1]) glow(X(0.49 + side * 0.022), Y(0.58), S(0.012), S(0.008), "110, 50, 40", 0.3);

  // Big, puffy, nude-pink lips with soft edges and a glossy lower lip.
  const left = [X(0.345), Y(0.712)];
  const right = [X(0.635), Y(0.712)];
  const seam = () => ctx.quadraticCurveTo(X(0.49), Y(0.722), ...right);
  soft(0.003);
  const upper = ctx.createLinearGradient(0, Y(0.62), 0, Y(0.715));
  upper.addColorStop(0, "#c47b7d");
  upper.addColorStop(1, "#ae6169");
  ctx.fillStyle = upper;
  ctx.beginPath();
  ctx.moveTo(...left);
  ctx.bezierCurveTo(X(0.37), Y(0.655), X(0.43), Y(0.612), X(0.49), Y(0.642));
  ctx.bezierCurveTo(X(0.55), Y(0.612), X(0.61), Y(0.655), ...right);
  ctx.quadraticCurveTo(X(0.49), Y(0.722), ...left);
  ctx.fill();
  const lower = ctx.createRadialGradient(X(0.49), Y(0.765), 0, X(0.49), Y(0.765), S(0.16));
  lower.addColorStop(0, "#ecb3aa");
  lower.addColorStop(0.6, "#d08a86");
  lower.addColorStop(1, "#bd6f72");
  ctx.fillStyle = lower;
  ctx.beginPath();
  ctx.moveTo(...left);
  seam();
  ctx.bezierCurveTo(X(0.62), Y(0.8), X(0.56), Y(0.848), X(0.49), Y(0.848));
  ctx.bezierCurveTo(X(0.42), Y(0.848), X(0.36), Y(0.8), ...left);
  ctx.fill();
  ctx.strokeStyle = "#7e3a42";
  ctx.lineWidth = S(0.01);
  ctx.beginPath();
  ctx.moveTo(...left);
  seam();
  ctx.stroke();
  soft(0);
  for (const corner of [left, right]) glow(...corner, S(0.025), S(0.02), "120, 50, 50", 0.3);
  glow(X(0.49), Y(0.77), S(0.06), S(0.018), "255, 255, 255", 0.55);
  glow(X(0.44), Y(0.655), S(0.025), S(0.01), "255, 255, 255", 0.35);
}

const DRAWERS = {
  grin(ctx, w, h) {
    happyEye(ctx, w * 0.36, h * 0.4, w, true);
    happyEye(ctx, w * 0.64, h * 0.4, w, true);
    blush(ctx, w, h);
    const cx = w / 2;
    const top = h * 0.55;
    const half = w * 0.13;
    const depth = h * 0.2;
    ctx.fillStyle = "#6e1f2a";
    ctx.beginPath();
    ctx.moveTo(cx - half, top);
    ctx.quadraticCurveTo(cx, top - h * 0.015, cx + half, top);
    ctx.bezierCurveTo(cx + half * 0.95, top + depth * 1.1, cx - half * 0.95, top + depth * 1.1, cx - half, top);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx - half, top - h * 0.02, half * 2, depth * 0.32);
    ctx.fillStyle = "#ff8a9a";
    ctx.beginPath();
    ctx.ellipse(cx, top + depth * 0.95, half * 0.55, depth * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.012;
    ctx.beginPath();
    ctx.moveTo(cx - half, top);
    ctx.quadraticCurveTo(cx, top - h * 0.015, cx + half, top);
    ctx.bezierCurveTo(cx + half * 0.95, top + depth * 1.1, cx - half * 0.95, top + depth * 1.1, cx - half, top);
    ctx.stroke();
  },
  dumpling(ctx, w, h) {
    ovalEye(ctx, w * 0.37, h * 0.45, w * 0.04, h * 0.065);
    ovalEye(ctx, w * 0.63, h * 0.45, w * 0.04, h * 0.065);
    blush(ctx, w, h, "dashes");
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.016;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.5, w * 0.035, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  },
  smile(ctx, w, h) {
    ovalEye(ctx, w * 0.38, h * 0.43, w * 0.03, h * 0.07, false);
    ovalEye(ctx, w * 0.62, h * 0.43, w * 0.03, h * 0.07, false);
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.018;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.48, w * 0.12, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  },
  wink(ctx, w, h) {
    ovalEye(ctx, w * 0.37, h * 0.43, w * 0.04, h * 0.065);
    happyEye(ctx, w * 0.63, h * 0.42, w, true);
    blush(ctx, w, h);
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.016;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.5, w * 0.08, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.fillStyle = "#ff7d92";
    ctx.beginPath();
    ctx.ellipse(w * 0.53, h * 0.615, w * 0.025, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  scream(ctx, w, h) {
    for (const x of [0.37, 0.63]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(w * x, h * 0.39, w * 0.072, h * 0.105, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = w * 0.012;
      ctx.stroke();
      ovalEye(ctx, w * x, h * 0.4, w * 0.026, h * 0.042);
    }
    ctx.fillStyle = "#6e1f2a";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.68, w * 0.1, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.014;
    ctx.stroke();
    ctx.fillStyle = "#ff8fa3";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.73, w * 0.05, h * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  surprised(ctx, w, h) {
    for (const x of [0.37, 0.63]) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(w * x, h * 0.43, w * 0.055, h * 0.085, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = w * 0.01;
      ctx.stroke();
      ovalEye(ctx, w * x, h * 0.445, w * 0.032, h * 0.05);
    }
    ctx.fillStyle = "#6e1f2a";
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.64, w * 0.035, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  sleepy(ctx, w, h) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.02;
    for (const x of [0.37, 0.63]) {
      ctx.beginPath();
      ctx.arc(w * x, h * 0.4, w * 0.05, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
    }
    blush(ctx, w, h);
    ctx.lineWidth = w * 0.014;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.6, w * 0.025, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.round(h * 0.1)}px sans-serif`;
    ctx.fillText("z", w * 0.74, h * 0.24);
    ctx.font = `700 ${Math.round(h * 0.07)}px sans-serif`;
    ctx.fillText("z", w * 0.8, h * 0.16);
  },
  quiet(ctx, w, h) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w * 0.02;
    for (const x of [0.37, 0.63]) {
      ctx.beginPath();
      ctx.moveTo(w * x - w * 0.055, h * 0.41);
      ctx.lineTo(w * x + w * 0.055, h * 0.41);
      ctx.stroke();
      ovalEye(ctx, w * x, h * 0.45, w * 0.032, h * 0.04, false);
    }
    ctx.lineWidth = w * 0.014;
    ctx.beginPath();
    ctx.moveTo(w * 0.47, h * 0.64);
    ctx.lineTo(w * 0.53, h * 0.64);
    ctx.stroke();
  },
  glam: drawGlam,
};
