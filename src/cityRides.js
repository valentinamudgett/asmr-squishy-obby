import { Vector3 } from "@babylonjs/core";
import { createShape } from "./cityMesh.js";

/**
 * Rides that aren't lofted cars: golf carts and a beach cruiser bike. Meters, forward +z, the
 * ground at y 0. Each builder fills the same layers as a car body (paint, trim, glass, lamps, and
 * near-only detail) and may add `joints`: parts that move on their own, like the bike's cranks.
 */

const BLACK = [0.035, 0.037, 0.042];
const RUBBER = [0.09, 0.09, 0.1];
const CHROME = [0.84, 0.86, 0.9];
const WHITE = [1, 1, 1];

/** A smooth shell lofted through sections: { z, w (half width), top, bottom, n (squareness) }. */
export function loft(shape, sections, color, { around = 28, closed = true, from = -Math.PI, to = Math.PI } = {}) {
  const paths = sections.map((s) => {
    const ring = [];
    const count = closed ? around : around + 1;
    for (let k = 0; k < count; k += 1) {
      const a = closed ? (k / around) * Math.PI * 2 : from + ((to - from) * k) / around;
      const c = Math.cos(a);
      const si = Math.sin(a);
      const n = s.n ?? 4;
      const x = s.w * Math.sign(c) * Math.abs(c) ** (2 / n);
      const mid = (s.top + s.bottom) / 2;
      const half = (s.top - s.bottom) / 2;
      const y = mid + half * Math.sign(si) * Math.abs(si) ** (2 / (s.ny ?? n));
      ring.push(new Vector3(x + (s.x ?? 0), y, s.z));
    }
    return ring;
  });
  shape.ribbon(paths, color, { closePath: closed, outward: (x, y, z) => [0, (sections[0].top + sections[0].bottom) / 2, z] });
  return shape;
}

/** Points along a quadratic curve a -> b -> c, as [x, y, z] arrays. */
function curve(a, b, c, steps = 10) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * b[k] + t * t * c[k]));
  }
  return pts;
}

/** A generic badge: a ring and a bar, facing +z (or -z with `back`). */
function badge(shape, x, y, z, size, color = CHROME) {
  shape.torus(size, size * 0.16, color, { rx: Math.PI / 2, x, y, z, tess: 14 });
  shape.box(size * 0.78, size * 0.13, size * 0.1, color, { x, y, z });
}

/** A seat cushion and back, with piping lines along the panels. */
function seatPair(trim, detail, { x = 0, y, z, width, depth = 0.46, back = 0.5, tilt = -0.18, main, panel, piping, facing = 1 }) {
  const f = facing;
  trim.box(width, 0.13, depth, main, { x, y: y - 0.065, z });
  trim.box(width - 0.12, 0.03, depth - 0.1, panel, { x, y: y + 0.01, z: z + f * 0.02 });
  trim.ball(width, 0.07, depth * 0.3, main, { x, y: y + 0.005, z: z + f * (depth / 2 - 0.06), seg: 10 });
  trim.box(width, back, 0.11, main, { x, y: y + back / 2 + 0.02, z: z - f * (depth / 2 - 0.02), rx: f * tilt });
  // A rolled top edge so the back reads as a padded cushion, not a board.
  trim.ball(width + 0.01, 0.12, 0.13, main, { x, y: y + back + 0.02, z: z - f * (depth / 2 - 0.02 - Math.tan(tilt) * back), seg: 12 });
  trim.box(width - 0.12, back - 0.1, 0.03, panel, { x, y: y + back / 2 + 0.03, z: z - f * (depth / 2 - 0.085), rx: f * tilt });
  for (const k of [-1, 1]) {
    detail.box(0.012, 0.012, depth - 0.12, piping, { x: x + (k * (width - 0.12)) / 2, y: y + 0.03, z: z + f * 0.02 });
    detail.box(0.012, back - 0.12, 0.012, piping, { x: x + (k * (width - 0.12)) / 2, y: y + back / 2 + 0.03, z: z - f * (depth / 2 - 0.1), rx: f * tilt });
  }
  for (let k = 1; k < 4; k += 1) detail.box(width - 0.14, 0.008, 0.008, piping, { x, y: y + 0.028, z: z + f * (-depth / 2 + 0.05 + (k * (depth - 0.1)) / 4) });
  // Stitched horizontal ribs across the back panel.
  for (let k = 1; k < 5; k += 1) {
    const h = y + 0.08 + (k * (back - 0.14)) / 5;
    const lean = Math.tan(tilt) * (h - y);
    detail.box(width - 0.14, 0.008, 0.008, piping, { x, y: h, z: z - f * (depth / 2 - 0.105 + lean), rx: f * tilt });
  }
}

/**
 * A golf cart: a rounded nose cowl with lamps, a floorboard, a bench (two-tone on the pink one),
 * a canopy on thin posts with a fold-down windshield, and on the family cart a rear-facing seat.
 */
export function buildCart(spec) {
  const paint = createShape(31);
  const trim = createShape(32);
  const glass = createShape(33);
  const lamps = createShape(34);
  const detail = createShape(35);
  const L = spec.L;
  const half = L / 2;
  const W = spec.W;
  const r = spec.wheelR;
  const [fz, rz] = spec.wheels;
  const seatColor = spec.seatMain;
  const panel = spec.seatPanel ?? seatColor;
  const piping = spec.piping ?? [0.2, 0.2, 0.2];
  const post = spec.posts ?? BLACK;
  const roofColor = spec.roof;
  const deck = 0.34;

  // Frame and floorboard, with a ribbed rubber mat.
  trim.box(W * 1.7, 0.08, L - 0.5, [0.1, 0.1, 0.11], { y: deck - 0.06, z: (fz + rz) / 2 + 0.05 });
  trim.box(W * 1.86, 0.035, 0.85, RUBBER, { y: deck, z: fz - 0.6 });
  for (let k = 0; k < 9; k += 1) detail.box(W * 1.7, 0.012, 0.025, [0.16, 0.16, 0.17], { y: deck + 0.022, z: fz - 0.96 + k * 0.085 });
  for (const side of [-1, 1]) trim.box(0.06, 0.07, 0.9, BLACK, { x: side * W * 0.95, y: deck - 0.01, z: fz - 0.6 });

  // The nose cowl: a soft dome over the front wheels, flaring into the fenders.
  const cowlBack = fz - 0.36;
  const nose = half - 0.02;
  const C = { top: 0.86, drop: 0.24, round: 0.72, n: 3.2, ny: 2.6, apron: 0.16, apronW: 1.7, ...spec.cowl };
  const cowl = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const z = cowlBack + (nose - cowlBack) * t;
    const round = Math.sqrt(Math.max(0, 1 - Math.max(0, (t - C.round) / (1 - C.round)) ** 2));
    const top = C.top - C.drop * t * t + 0.02 * Math.sin(t * Math.PI);
    cowl.push({ z, w: W * (0.97 - 0.12 * t * t) * (0.25 + 0.75 * round), top: deck + (top - deck) * (0.35 + 0.65 * round), bottom: deck + 0.02, n: C.n, ny: C.ny });
  }
  loft(paint, cowl, WHITE, { around: 36 });
  // Fender lips over the wheels and a black lower bumper.
  for (const side of [-1, 1]) {
    const arch = [];
    for (let k = 0; k <= 12; k += 1) {
      const a = (k / 12) * Math.PI;
      arch.push([side * W * 0.93, r + Math.sin(a) * (r + 0.07), fz + Math.cos(a) * (r + 0.07)]);
    }
    trim.tube(arch, 0.022, BLACK, { tess: 5 });
  }
  const bumperZ = nose + 0.02;
  trim.box(W * C.apronW, C.apron, 0.12, BLACK, { y: deck - 0.06 + C.apron / 2, z: bumperZ - 0.04 });
  trim.box(W * (C.apronW - 0.2), 0.05, 0.1, [0.14, 0.14, 0.15], { y: deck - 0.1 + C.apron, z: bumperZ - 0.06 });
  for (const side of [-1, 1]) trim.ball(0.24, 0.16, 0.14, BLACK, { x: side * W * 0.8, y: deck + 0.02, z: bumperZ - 0.06, seg: 8 });
  detail.box(0.36, 0.11, 0.015, [0.12, 0.12, 0.13], { y: deck + 0.02, z: bumperZ + 0.025 });

  // Lamps: round chrome-ringed lamps or small square ones, set into the cowl front.
  const lampY = spec.lampY ?? 0.66;
  for (const side of [-1, 1]) {
    const x = side * W * 0.56;
    const t = cowl.findIndex((s) => s.top < lampY + 0.04 && s.z > half - 0.35);
    const z = (t >= 0 ? cowl[t].z : half - 0.16) + 0.02;
    if (spec.lamps === "oval") {
      // Wide oval lamps wrapped into the cowl's corners, each with a chrome bezel and a projector.
      const ox = side * W * 0.66;
      const oz = z - 0.03;
      trim.ball(0.27, 0.14, 0.07, CHROME, { x: ox, y: lampY, z: oz, ry: side * 0.45, seg: 14 });
      lamps.ball(0.24, 0.115, 0.07, [1, 1, 0.95], { x: ox, y: lampY, z: oz + 0.012, ry: side * 0.45, seg: 14 });
      detail.ball(0.07, 0.07, 0.03, [0.7, 0.74, 0.8], { x: ox - side * 0.025, y: lampY, z: oz + 0.04, seg: 8 });
    } else if (spec.lamps === "round") {
      trim.torus(0.2, 0.035, CHROME, { rx: Math.PI / 2 - 0.35, x, y: lampY, z, tess: 18 });
      lamps.ball(0.18, 0.18, 0.06, [1, 1, 0.94], { x, y: lampY, z: z + 0.005, seg: 10 });
      detail.ball(0.08, 0.08, 0.04, [0.75, 0.78, 0.82], { x, y: lampY, z: z + 0.02, seg: 8 });
    } else {
      trim.box(0.17, 0.09, 0.05, CHROME, { x, y: lampY, z, rx: -0.35 });
      lamps.box(0.14, 0.065, 0.03, [1, 1, 0.94], { x, y: lampY, z: z + 0.018, rx: -0.35 });
    }
  }
  if (spec.script) {
    // A small swirly script with a crown, up on the cowl's left shoulder like a decal name.
    const sx = -W * 0.36;
    const sy = lampY + 0.17;
    const sz = half - 0.22;
    const pts = [];
    for (let k = 0; k <= 36; k += 1) {
      const t = k / 36;
      pts.push([sx - 0.13 + 0.26 * t, sy + 0.014 * Math.sin(t * Math.PI * 8) + 0.01 * Math.sin(t * Math.PI), sz + 0.03 - 0.04 * t]);
    }
    detail.tube(pts, 0.005, spec.script, { tess: 4 });
    for (const dx of [-0.03, 0, 0.03]) detail.cyl(0, 0.014, 0.03, spec.script, { x: sx + dx, y: sy + 0.06, z: sz + 0.005, rx: -0.5, tess: 4 });
    detail.box(0.08, 0.012, 0.012, spec.script, { x: sx, y: sy + 0.045, z: sz + 0.012, rx: -0.5 });
  } else {
    badge(detail, 0, lampY + 0.12, half - 0.08, 0.07);
  }

  // Rear body over the back wheels, under the seat.
  const rearFront = fz - 0.95;
  const rearEnd = -half + 0.04;
  const rear = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const z = rearFront + (rearEnd - rearFront) * t;
    const round = Math.sqrt(Math.max(0, 1 - Math.max(0, (t - 0.8) / 0.2) ** 2));
    const lead = Math.sqrt(Math.max(0, 1 - Math.max(0, (0.15 - t) / 0.15) ** 2));
    const k = Math.min(round, lead);
    rear.push({ z, w: W * (0.94 + 0.03 * Math.sin(t * Math.PI)) * (0.35 + 0.65 * k), top: deck + (spec.rearTop - deck) * (0.4 + 0.6 * k), bottom: deck + 0.02, n: 4, ny: 4 });
  }
  loft(paint, rear, WHITE, { around: 32 });
  for (const side of [-1, 1]) {
    const arch = [];
    for (let k = 0; k <= 12; k += 1) {
      const a = (k / 12) * Math.PI;
      arch.push([side * W * 0.96, r + Math.sin(a) * (r + 0.06), rz + Math.cos(a) * (r + 0.06)]);
    }
    trim.tube(arch, 0.022, BLACK, { tess: 5 });
    // Tail lamps and a black corner bumper.
    lamps.box(0.04, 0.08, 0.1, [0.85, 0.06, 0.08], { x: side * W * 0.86, y: spec.rearTop - 0.12, z: rearEnd + 0.06 });
    trim.box(0.18, 0.12, 0.08, BLACK, { x: side * W * 0.75, y: deck + 0.04, z: rearEnd - 0.01 });
  }
  // The front bench on a body-colored base, with a hip rail round the back.
  const seatTop = spec.seatY ?? 0.74;
  const seatZ = rearFront + 0.02;
  const baseH = seatTop - deck - 0.1;
  paint.box(W * 1.75, baseH, 0.5, WHITE, { y: deck + baseH / 2, z: seatZ });
  trim.box(W * 1.78, 0.03, 0.52, BLACK, { y: deck + 0.015, z: seatZ });
  if (spec.bow) {
    // A ribbon bow decal on each side of the seat base: two loops, a knot, and two tails.
    for (const side of [-1, 1]) {
      const x = side * (W * 0.875 + 0.006);
      const y = deck + baseH * 0.62;
      const z = seatZ;
      for (const dz of [-1, 1]) trim.ball(0.008, 0.075, 0.1, spec.bow, { x, y: y + 0.02, z: z + dz * 0.055, rx: dz * 0.5, seg: 8 });
      trim.ball(0.01, 0.04, 0.04, spec.bow, { x: x + side * 0.002, y: y + 0.015, z, seg: 6 });
      for (const dz of [-1, 1]) trim.box(0.006, 0.12, 0.028, spec.bow, { x, y: y - 0.06, z: z + dz * 0.03, rx: dz * 0.35 });
    }
  }
  const split = spec.seats === "split";
  for (const sx of split ? [-0.29, 0.29] : [0]) {
    seatPair(trim, detail, { x: sx, y: seatTop, z: seatZ, width: split ? 0.56 : W * 1.75, back: 0.5, main: seatColor, panel, piping });
  }
  const backZ = seatZ - 0.27;
  const rail = curve([-W * 0.9, seatTop + 0.05, backZ - 0.02], [-W * 0.95, seatTop + 0.62, backZ - 0.12], [-W * 0.6, seatTop + 0.62, backZ - 0.12], 6);
  for (const side of [-1, 1]) trim.tube(rail.map(([x, y, z]) => [x * -side, y, z]), 0.018, CHROME, { tess: 6 });
  trim.tube([[-W * 0.6, seatTop + 0.62, backZ - 0.12], [W * 0.6, seatTop + 0.62, backZ - 0.12]], 0.018, CHROME, { tess: 6 });

  // The family cart's rear seat faces backward, over a footrest.
  if (spec.rearSeat) {
    const rzSeat = rearEnd + 0.38;
    seatPair(trim, detail, { y: spec.rearTop + 0.11, z: rzSeat, width: W * 1.7, depth: 0.42, back: 0.42, main: seatColor, panel, piping, facing: -1 });
    trim.box(W * 1.7, 0.03, 0.42, [0.2, 0.2, 0.21], { y: deck + 0.04, z: rearEnd - 0.2 });
    for (const side of [-1, 1]) {
      trim.tube([[side * W * 0.82, deck + 0.04, rearEnd - 0.4], [side * W * 0.84, deck + 0.04, rearEnd + 0.02]], 0.02, CHROME, { tess: 5 });
      const grab = curve([side * W * 0.88, spec.rearTop + 0.05, rearEnd + 0.12], [side * W * 0.94, spec.rearTop + 0.42, rearEnd + 0.08], [side * W * 0.9, spec.rearTop + 0.4, rearEnd + 0.4], 6);
      trim.tube(grab, 0.016, CHROME, { tess: 5 });
    }
  }

  // Dash, steering column and wheel, pedals.
  const dashZ = cowlBack + 0.06;
  trim.box(W * 1.7, 0.22, 0.12, BLACK, { y: 0.78, z: dashZ });
  for (const dx of [0.15, 0.32]) detail.cyl(0.08, 0.08, 0.02, [0.06, 0.06, 0.07], { x: dx, y: 0.9, z: dashZ - 0.03, tess: 10 });
  detail.box(0.12, 0.05, 0.02, [0.12, 0.12, 0.13], { x: -0.05, y: 0.84, z: dashZ - 0.065 });
  lamps.box(0.05, 0.02, 0.01, [0.4, 1, 0.55], { x: -0.05, y: 0.845, z: dashZ - 0.076 });
  const wheelAt = [-0.29, 1.02, dashZ - 0.28];
  trim.tube([[-0.29, 0.45, dashZ - 0.02], [-0.29, 0.75, dashZ - 0.12], wheelAt], 0.025, [0.1, 0.1, 0.11], { tess: 6 });
  trim.torus(0.36, 0.03, [0.08, 0.08, 0.09], { x: wheelAt[0], y: wheelAt[1], z: wheelAt[2], rx: -0.95, tess: 18 });
  for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    detail.box(0.16, 0.02, 0.025, [0.08, 0.08, 0.09], { x: wheelAt[0] + Math.cos(a) * 0.08, y: wheelAt[1] + Math.sin(a) * 0.08 * 0.58, z: wheelAt[2] + Math.sin(a) * 0.08 * 0.81, rz: a, rx: -0.95 });
  }
  detail.cyl(0.06, 0.06, 0.03, [0.15, 0.15, 0.16], { x: wheelAt[0], y: wheelAt[1], z: wheelAt[2], rx: -0.95 + Math.PI / 2, tess: 8 });
  for (const dx of [-0.36, -0.2]) detail.box(0.09, 0.03, 0.15, [0.15, 0.15, 0.16], { x: dx, y: deck + 0.08, z: dashZ - 0.18, rx: -0.6 });

  // Canopy posts, roof, windshield and mirrors.
  const roofY = spec.roofY;
  const roofFront = spec.roofFront;
  const roofRear = spec.roofRear;
  for (const side of [-1, 1]) {
    const x = side * W * 0.86;
    const front = curve([x, 0.84, cowlBack + 0.04], [x, 1.35, cowlBack + 0.04], [x * 0.98, roofY - 0.02, roofFront - 0.12], 8);
    trim.tube(front, 0.022, post, { tess: 6 });
    for (const z of spec.rearPosts) trim.tube([[x, spec.rearTop, z], [x * 0.98, roofY - 0.02, z]], 0.022, post, { tess: 6 });
    detail.ball(0.1, 0.07, 0.025, BLACK, { x: x + side * 0.08, y: 1.18, z: cowlBack + 0.06, seg: 6 });
    detail.box(0.08, 0.012, 0.012, BLACK, { x: x + side * 0.04, y: 1.18, z: cowlBack + 0.06 });
  }
  trim.box(W * 1.7, 0.035, 0.035, post, { y: spec.rearTop + 0.42, z: spec.rearPosts[0] });
  const roof = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const z = roofRear + (roofFront - roofRear) * t;
    const edge = Math.min(1, Math.min(t, 1 - t) / 0.08);
    roof.push({ z, w: W * 1.0 * (0.7 + 0.3 * edge), top: roofY + 0.055 + 0.02 * Math.sin(t * Math.PI), bottom: roofY - 0.02, n: 8, ny: 3 });
  }
  loft(trim, roof, roofColor, { around: 28 });
  detail.box(W * 1.85, 0.015, 0.015, roofColor.map((c) => c * 0.8), { y: roofY + 0.07, z: (roofFront + roofRear) / 2 });
  // Windshield: two clear panes with a black frame and the fold in the middle.
  const shield = (y0, y1) => {
    const rows = [];
    for (const y of [y0, y1]) {
      const row = [];
      for (let k = 0; k <= 6; k += 1) {
        const x = -W * 0.84 + (W * 1.68 * k) / 6;
        const t = (y - 0.86) / (roofY - 0.86);
        row.push(new Vector3(x, y, cowlBack + 0.05 + t * (roofFront - 0.14 - cowlBack)));
      }
      rows.push(row);
    }
    glass.ribbon(rows, [0.75, 0.82, 0.88], { outward: [0, 1.2, -3] });
  };
  const frameAt = (y) => {
    const t = (y - 0.86) / (roofY - 0.86);
    return cowlBack + 0.05 + t * (roofFront - 0.14 - cowlBack);
  };
  if (spec.shield === "single") {
    // One frameless clear sheet held by two clips each side.
    shield(0.95, roofY - 0.06);
    for (const side of [-1, 1]) for (const y of [1.2, roofY - 0.25]) detail.box(0.05, 0.04, 0.03, BLACK, { x: side * W * 0.85, y, z: frameAt(y) });
  } else {
    const mid = (0.95 + roofY - 0.06) / 2;
    shield(0.95, mid - 0.015);
    shield(mid + 0.015, roofY - 0.06);
    for (const y of [0.95, mid, roofY - 0.06]) trim.box(W * 1.72, 0.03, 0.025, BLACK, { y, z: frameAt(y) });
  }

  return { paint, trim, glass, lamps, detail, plates: [] };
}

/**
 * A beach cruiser: a curved step-through frame, balloon whitewalls, swept chrome bars with tan
 * grips, a sprung tan saddle, a wire basket, fenders, and a chain guard. The cranks and the
 * fork with its bars and basket are joints, so they can spin and steer.
 */
export function buildBike(spec) {
  const paint = createShape(41);
  const trim = createShape(42);
  const lamps = createShape(44);
  const detail = createShape(45);
  const crank = { paint: createShape(46), trim: createShape(47) };
  const fork = { paint: createShape(48), trim: createShape(49), detail: createShape(50) };
  const r = spec.wheelR;
  const [fz, rz] = spec.wheels;
  const tan = [0.72, 0.5, 0.3];
  const leather = [0.66, 0.45, 0.27];
  const copper = [0.74, 0.46, 0.26];
  const copperDark = [0.55, 0.32, 0.17];
  const bb = [0, 0.29, -0.02];
  const head = { bottom: [0, 0.74, fz - 0.17], top: [0, 0.94, fz - 0.21] };
  const seatTop = [0, spec.seatY - 0.12, rz + 0.36];

  // Frame: twin curved step-through tubes into the seat tube, the down tube, and stays to the back axle.
  const tube = 0.024;
  const seatAt = (t) => [0, bb[1] + (seatTop[1] - bb[1]) * t, bb[2] + (seatTop[2] - bb[2]) * t];
  paint.tube(curve(head.top, [0, 0.52, 0.12], seatAt(0.42), 16), tube, WHITE, { tess: 8 });
  paint.tube(curve([0, (head.top[1] + head.bottom[1]) / 2, (head.top[2] + head.bottom[2]) / 2], [0, 0.4, 0.16], seatAt(0.24), 16), tube * 0.9, WHITE, { tess: 8 });
  paint.tube(curve(head.bottom, [0, 0.3, 0.3], [bb[0], bb[1] - 0.01, bb[2] + 0.02], 14), tube, WHITE, { tess: 8 });
  paint.tube([bb, [0, (bb[1] + seatTop[1]) / 2, (bb[2] + seatTop[2]) / 2 + 0.01], seatTop], tube, WHITE, { tess: 8 });
  detail.box(0.012, 0.05, 0.03, [0.9, 0.82, 0.55], { x: 0, y: (head.top[1] + head.bottom[1]) / 2, z: (head.top[2] + head.bottom[2]) / 2 + 0.03, rx: -0.2 });
  paint.tube([head.bottom, head.top], 0.032, WHITE, { tess: 10 });
  for (const side of [-1, 1]) {
    paint.tube([[side * 0.04, bb[1], bb[2]], [side * 0.06, r, rz]], 0.014, WHITE, { tess: 6 });
    paint.tube([[side * 0.025, seatTop[1] - 0.04, seatTop[2] + 0.01], [side * 0.06, r + 0.02, rz]], 0.013, WHITE, { tess: 6 });
  }
  trim.cyl(0.06, 0.06, 0.12, [0.25, 0.25, 0.27], { rz: Math.PI / 2, x: 0, y: bb[1], z: bb[2], tess: 10 });
  // Seat post, springs, and the wide tan saddle.
  trim.cyl(0.022, 0.022, 0.16, CHROME, { x: 0, y: seatTop[1] + 0.06, z: seatTop[2] - 0.01, rx: -0.3, tess: 8 });
  const saddleY = spec.seatY - 0.04;
  const saddleZ = seatTop[2] - 0.04;
  for (const side of [-1, 1]) {
    const coil = [];
    for (let k = 0; k <= 36; k += 1) {
      const a = (k / 36) * Math.PI * 8;
      coil.push([side * 0.08 + Math.cos(a) * 0.022, saddleY - 0.11 + (k / 36) * 0.08, saddleZ - 0.11 + Math.sin(a) * 0.022]);
    }
    detail.tube(coil, 0.005, CHROME, { tess: 4 });
    trim.tube([[side * 0.08, saddleY - 0.12, saddleZ - 0.11], [0, seatTop[1] + 0.12, seatTop[2] - 0.03]], 0.008, CHROME, { tess: 4 });
  }
  const saddle = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    const z = saddleZ - 0.16 + 0.33 * t;
    const w = 0.05 + 0.105 * Math.cos(t * Math.PI * 0.5) ** 0.7;
    const end = Math.sin(Math.min(1, t * 4) * Math.PI * 0.5);
    saddle.push({ z, w, top: saddleY + 0.02 + 0.035 * end - 0.025 * t, bottom: saddleY - 0.05 + 0.02 * (1 - end), n: 2.6, ny: 1.8 });
  }
  loft(trim, saddle, leather, { around: 24 });
  trim.box(0.24, 0.025, 0.07, [0.45, 0.3, 0.18], { y: saddleY - 0.045, z: saddleZ - 0.13 });
  detail.tube(saddle.map((s) => [0, s.top + 0.002, s.z]), 0.004, [0.5, 0.33, 0.19], { tess: 4 });
  // Fenders hug the tires: short curved slats in frame paint, with a rolled edge each side.
  const hug = r + 0.035;
  for (const [wz, from, to] of [[fz, -0.25, 2.0], [rz, 0.95, 3.45]]) {
    const steps = 18;
    const edges = [[], []];
    for (let k = 0; k < steps; k += 1) {
      const a = from + ((to - from) * (k + 0.5)) / steps;
      const y = r + Math.sin(a) * hug;
      const z = wz + Math.cos(a) * hug;
      paint.box(0.085, 0.008, (hug * (to - from)) / steps + 0.006, WHITE, { y, z, rx: -a + Math.PI / 2 });
    }
    for (let k = 0; k <= steps; k += 1) {
      const a = from + ((to - from) * k) / steps;
      for (const [i, side] of [-1, 1].entries()) edges[i].push([side * 0.043, r + Math.sin(a) * (hug - 0.008), wz + Math.cos(a) * (hug - 0.008)]);
    }
    for (const edge of edges) paint.tube(edge, 0.006, WHITE, { tess: 4 });
  }
  // Rear rack over the back wheel.
  const rackY = r + hug + 0.07;
  for (const side of [-1, 1]) {
    paint.tube([[side * 0.07, rackY, seatTop[2] - 0.02], [side * 0.07, rackY, rz - 0.3]], 0.009, WHITE, { tess: 5 });
    paint.tube([[side * 0.07, rackY, rz - 0.18], [side * 0.06, r, rz]], 0.008, WHITE, { tess: 5 });
  }
  for (let k = 0; k < 4; k += 1) paint.tube([[-0.07, rackY, seatTop[2] - 0.06 - k * 0.1], [0.07, rackY, seatTop[2] - 0.06 - k * 0.1]], 0.007, WHITE, { tess: 4 });
  // Small chain guard over the top run.
  paint.tube(curve([0.095, bb[1] + 0.13, bb[2] + 0.06], [0.095, bb[1] + 0.12, (bb[2] + rz) / 2], [0.095, r + 0.07, rz + 0.08], 10), 0.018, WHITE, { tess: 6 });
  // The chain: two runs from the chainring to the back cog.
  for (const dy of [0.095, -0.095]) {
    const pts = [];
    for (let k = 0; k <= 12; k += 1) {
      const t = k / 12;
      pts.push([0.085, bb[1] + dy + (r - bb[1] + dy * -0.55) * t, bb[2] + (rz - bb[2]) * t]);
    }
    detail.tube(pts, 0.006, [0.2, 0.2, 0.22], { tess: 4 });
  }
  trim.cyl(0.08, 0.08, 0.01, [0.6, 0.6, 0.63], { rz: Math.PI / 2, x: 0.085, y: r, z: rz, tess: 12 });
  // Kickstand, folded back on the left.
  trim.tube([[-0.06, bb[1] - 0.01, bb[2] - 0.08], [-0.1, 0.12, bb[2] - 0.32]], 0.009, CHROME, { tess: 5 });
  // Rear lamp on the fender.
  lamps.box(0.04, 0.03, 0.02, [0.9, 0.08, 0.08], { y: r + 0.33, z: rz - 0.2, rx: -0.6 });

  // Cranks: chainring, arms, pedals. Built about the bottom bracket; the ride spins them.
  const ring = crank.trim;
  ring.torus(0.19, 0.012, [0.72, 0.74, 0.78], { rz: Math.PI / 2, x: 0.085, tess: 22 });
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2;
    ring.box(0.008, 0.09, 0.016, [0.72, 0.74, 0.78], { x: 0.085, y: Math.cos(a) * 0.05, z: Math.sin(a) * 0.05, rx: a });
  }
  for (let k = 0; k < 32; k += 1) {
    const a = (k / 32) * Math.PI * 2;
    ring.box(0.006, 0.012, 0.012, [0.5, 0.5, 0.54], { x: 0.085, y: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1, rx: a });
  }
  for (const side of [-1, 1]) {
    const dir = side;
    ring.box(0.018, 0.17, 0.03, CHROME, { x: side * 0.1, y: (-dir * 0.17) / 2, z: 0 });
    ring.cyl(0.015, 0.015, 0.06, CHROME, { rz: Math.PI / 2, x: side * 0.13, y: -dir * 0.17, z: 0, tess: 6 });
    ring.box(0.1, 0.022, 0.06, [0.6, 0.42, 0.26], { x: side * 0.19, y: -dir * 0.17, z: 0 });
    crank.paint.box(0.1, 0.008, 0.008, [0.95, 0.75, 0.2], { x: side * 0.19, y: -dir * 0.17 + 0.012, z: 0.031 });
  }

  // Fork, bars, basket: built about the head tube's foot, so they turn together.
  const fp = fork.paint;
  const ft = fork.trim;
  const fd = fork.detail;
  const hb = head.bottom;
  const at = (p) => [p[0] - hb[0], p[1] - hb[1], p[2] - hb[2]];
  for (const side of [-1, 1]) {
    fp.tube(curve(at([side * 0.045, hb[1] + 0.02, hb[2]]), at([side * 0.055, (hb[1] + r) / 2, hb[2] + 0.12]), at([side * 0.055, r, fz]), 10), 0.016, WHITE, { tess: 7 });
  }
  ft.cyl(0.024, 0.024, 0.18, CHROME, { ...pos(at([0, head.top[1] + 0.07, head.top[2] - 0.015])), rx: -0.2, tess: 8 });
  const stemTop = at([0, 1.16, head.top[2] - 0.05]);
  ft.tube([at([0, head.top[1] + 0.06, head.top[2] - 0.01]), stemTop], 0.018, CHROME, { tess: 6 });
  for (const side of [-1, 1]) {
    const bar = curve(stemTop, [side * 0.28, stemTop[1] + 0.05, stemTop[2] + 0.06], [side * 0.34, stemTop[1] - 0.02, stemTop[2] - 0.3], 12);
    ft.tube(bar, 0.012, CHROME, { tess: 6 });
    const end = bar[bar.length - 1];
    const prev = bar[bar.length - 4];
    const d = [end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]];
    const len = Math.hypot(...d);
    const grip = [0, 1, 2].map((k) => end[k] - (d[k] / len) * 0.06);
    ft.tube([grip, [end[0] + (d[0] / len) * 0.06, end[1] + (d[1] / len) * 0.06, end[2] + (d[2] / len) * 0.06]], 0.019, tan, { tess: 8 });
    // Brake lever and its cable down to the brake.
    fd.tube([[grip[0] * 0.86, grip[1] - 0.01, grip[2] + 0.04], [grip[0] * 0.8, grip[1] - 0.05, grip[2] + 0.1]], 0.006, CHROME, { tess: 4 });
    fd.tube(curve([grip[0] * 0.8, grip[1] - 0.03, grip[2] + 0.08], [side * 0.12, stemTop[1] + 0.02, stemTop[2] + 0.1], [side * 0.04, at([0, 0.8, 0])[1], 0.08], 10), 0.004, [0.1, 0.1, 0.1], { tess: 4 });
  }
  // A little bell by the left grip.
  fd.ball(0.05, 0.035, 0.05, CHROME, { x: -0.15, y: stemTop[1] + 0.05, z: stemTop[2] + 0.02, seg: 8, slice: 0.55 });
  fd.cyl(0.012, 0.012, 0.02, CHROME, { x: -0.15, y: stemTop[1] + 0.04, z: stemTop[2] + 0.02, tess: 5 });
  // A small wooden box on the bars and the woven basket in front.
  ft.box(0.13, 0.11, 0.1, [0.92, 0.78, 0.52], { x: 0, y: stemTop[1] - 0.03, z: stemTop[2] - 0.08 });
  const bx = { y: at([0, 0.96, 0])[1], z: at([0, 0, fz + 0.1])[2], w: 0.38, d: 0.3, h: 0.24 };
  // A see-through copper wire basket: a square mesh on each wall, a solid floor, a rolled rim.
  ft.box(bx.w, 0.012, bx.d, copperDark, { y: bx.y - bx.h / 2, z: bx.z });
  const wire = 0.006;
  for (const [x, z, w, d] of [[0, bx.z + bx.d / 2, bx.w, 0], [0, bx.z - bx.d / 2, bx.w, 0], [bx.w / 2, bx.z, 0, bx.d], [-bx.w / 2, bx.z, 0, bx.d]]) {
    const along = w > d ? "x" : "z";
    const span = along === "x" ? w : d;
    for (let k = 0; k < 9; k += 1) {
      const y = bx.y - bx.h / 2 + 0.024 + k * 0.026;
      ft.box(along === "x" ? span : wire, wire, along === "x" ? wire : span, copper, { x, y, z });
    }
    const cols = Math.round(span / 0.026);
    for (let k = 0; k <= cols; k += 1) {
      const u = -0.5 + k / cols;
      ft.box(wire, bx.h, wire, k % cols === 0 ? copperDark : copper, { x: along === "x" ? x + u * w : x, y: bx.y, z: along === "x" ? z : z + u * d });
    }
  }
  const rimY = bx.y + bx.h / 2 + 0.008;
  ft.tube([[-bx.w / 2, rimY, bx.z - bx.d / 2], [bx.w / 2, rimY, bx.z - bx.d / 2], [bx.w / 2, rimY, bx.z + bx.d / 2], [-bx.w / 2, rimY, bx.z + bx.d / 2], [-bx.w / 2, rimY, bx.z - bx.d / 2]], 0.013, copperDark, { tess: 6 });
  ft.tube([at([0, head.top[1] + 0.02, head.top[2] + 0.02]), [0, bx.y - 0.04, bx.z - bx.d / 2]], 0.008, CHROME, { tess: 4 });
  ft.ball(0.07, 0.07, 0.05, CHROME, { y: bx.y - bx.h / 2 - 0.06, z: bx.z + bx.d / 2 - 0.02, seg: 8 });

  return {
    paint,
    trim,
    lamps,
    detail,
    plates: [],
    joints: [
      { name: "crank", at: bb, spin: true, ...crank },
      { name: "fork", at: hb, steer: true, ...fork },
    ],
  };
}

function pos(p) {
  return { x: p[0], y: p[1], z: p[2] };
}
