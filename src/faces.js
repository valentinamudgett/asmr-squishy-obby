import { t } from "./i18n.js";

export const FACES = [
  { id: "grin", label: "Big grin" },
  { id: "dumpling", label: "Dumpling" },
  { id: "smile", label: "Smile" },
  { id: "wink", label: "Wink" },
  { id: "surprised", label: "Surprised" },
  { id: "sleepy", label: "Sleepy" },
  { id: "quiet", label: t("face.quiet") },
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
};
