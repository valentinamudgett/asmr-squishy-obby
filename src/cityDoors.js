import { TransformNode } from "@babylonjs/core";
import { createKit } from "./cityProps.js";

/**
 * Front doors for the home lots, in a lot's frame (building face at z = 0, street toward -z).
 * Every door sits at the front of a shallow lit entry porch, so it can swing or slide open into
 * that porch when you walk up and close again when you leave. Penthouses, mansions, and hotels
 * get tall fancy entrances; apartments and houses get a real single panel door.
 *
 * Returns an animator: step(time, local) where `local` is your city position (null when indoors).
 */

/** Which entrance each fancy style gets. Anything not listed uses black-framed glass. */
const FANCY = {
  "man-castle": "carved",
  "man-hollywood": "carved",
  "man-lodge": "carved",
  "man-tree": "carved",
  "pent-garden": "bronze",
  "pent-skyline": "bronze",
  "man-modern": "bronze",
  "man-courtyard": "glass",
};

const NUMBER = { apartment: "12", hotel: "1", house: "27", penthouse: "88", mansion: "1" };

/** Plain-door colors by style. Others take a darkened trim color. */
const LEAF = {
  "house-beach": "#ffffff",
  "house-spooky": "#1f1629",
  "house-farm": "#b8382f",
  "house-cottage": "#5f8f6a",
  "house-suburban": "#2f4a6e",
  "house-modern": "#2a2c31",
  "apt-studio": "#5a3a26",
  "apt-loft": "#2f2f33",
  "apt-gamer": "#2b2440",
  "apt-rooftop": "#2f4a6e",
  "apt-cozy": "#7a4e2d",
  "apt-night": "#1d2230",
};

export function buildFrontDoor(scene, k, a, lot, style, { mats, low = false, sign } = {}) {
  const fancy = lot.type === "penthouse" || lot.type === "mansion" || lot.type === "hotel";
  const kind = lot.type === "hotel" ? "revolving" : fancy ? (FANCY[style.id] ?? "glass") : "panel";
  const base = lot.type === "house" ? 0.35 : 0.06;
  const depth = kind === "revolving" ? 1.2 : 1.0;
  const leafH = fancy ? (lot.type === "mansion" ? 3.0 : 2.75) : 2.1;
  const leafW = fancy ? 0.9 : 0.95;
  const open = fancy ? leafW * 2 : leafW;
  const cheek = kind === "revolving" ? 0.5 : fancy ? 0.45 : 0.3;
  const outerW = open + cheek * 2;
  const top = base + leafH + (fancy ? 0.5 : 0.35);
  const front = -depth;
  const dark = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * f)));
    return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  };

  // The porch: cladding cheeks, a lintel, a ceiling with downlights, a floor, and a lit back wall.
  const clad = kind === "carved" ? "#b9b2a6" : fancy ? (kind === "bronze" ? "#efe9df" : "#e9e6e1") : style.trim;
  const cladSeam = dark(clad, 0.82);
  for (const side of [-1, 1]) {
    const x = side * (open / 2 + cheek / 2);
    k.box(cheek, top - base, depth, x, base + (top - base) / 2, front / 2, clad);
    if (fancy && !low) for (let y = base + 0.9; y < top - 0.2; y += 0.9) k.box(cheek + 0.01, 0.012, depth + 0.01, x, y, front / 2, cladSeam);
  }
  k.box(outerW, top - base - leafH, depth, 0, (base + leafH + top) / 2, front / 2, clad);
  k.box(outerW + 0.16, 0.12, depth + 0.16, 0, top + 0.06, front / 2, fancy ? dark(clad, 0.7) : dark(style.trim, 0.8));
  k.box(open, 0.02, depth - 0.04, 0, base + leafH + 0.01, front / 2, "#fff4dc", { glow: 0.35 });
  for (const x of fancy ? [-open / 4, open / 4] : [0]) k.cyl(0.14, 0.14, 0.012, x, base + leafH - 0.002, front / 2, "#fff1d0", { glow: 1, tess: 10 });
  k.box(open, base + 0.04, depth, 0, (base + 0.04) / 2, front / 2, fancy ? "#d9d4cc" : "#c9c2b6");
  k.box(open, leafH, 0.04, 0, base + leafH / 2, -0.03, kind === "carved" ? "#5a3a22" : "#f3e6cc", { glow: 0.45 });
  if (!low) {
    k.box(open * 0.4, leafH * 0.32, 0.02, 0, base + leafH * 0.55, -0.06, fancy ? "#c9a46a" : "#8a6a4a", { glow: 0.2 });
    k.box(open * 0.6, 0.05, 0.3, 0, base + 0.82, -0.2, dark(clad, 0.6));
  }

  // The step or landing out front, and a doormat.
  const landD = fancy ? 1.6 : 1.1;
  k.box(outerW + (fancy ? 1.2 : 0.4), base + 0.04, landD, 0, (base + 0.04) / 2, front - landD / 2, fancy ? "#e2ddd4" : "#cfc8bc");
  if (fancy && base < 0.2) k.box(outerW + 1.6, 0.14, 0.45, 0, 0.07, front - landD - 0.22, "#d9d4cc");
  k.box(fancy ? 1.6 : 0.9, 0.012, 0.6, 0, base + 0.05, front - 0.45, kind === "carved" ? "#7a1f2b" : "#3a332c");
  if (!low) k.box(fancy ? 1.5 : 0.8, 0.013, 0.5, 0, base + 0.051, front - 0.45, kind === "carved" ? "#a0303a" : "#5a5048");

  // Lights either side, and plants.
  for (const side of [-1, 1]) {
    const x = side * (outerW / 2 + (fancy ? 0.35 : 0.22));
    if (fancy) {
      k.box(0.16, 0.6, 0.12, x, base + 2.0, front + 0.06, "#2a2c31");
      k.box(0.11, 0.52, 0.02, x, base + 2.0, front - 0.01, "#fff1d0", { glow: 1 });
    } else if (side > 0) {
      k.box(0.18, 0.3, 0.12, x, base + 1.85, -0.06, "#2a2c31");
      k.box(0.12, 0.22, 0.1, x, base + 1.85, -0.09, "#fff1d0", { glow: 0.9 });
    }
    const potX = side * (outerW / 2 + (fancy ? 0.85 : 0.55));
    const potZ = front - (fancy ? 0.45 : 0.35);
    if (fancy || side > 0) {
      k.cyl(fancy ? 0.6 : 0.42, fancy ? 0.48 : 0.34, fancy ? 0.7 : 0.45, potX, base + (fancy ? 0.35 : 0.225), potZ, fancy ? "#2a2c31" : "#c96f4a", { tess: 14 });
      if (kind === "carved" || kind === "bronze" || style.id === "hotel-fancy") {
        k.cyl(0.05, 0.06, 0.6, potX, base + 0.95, potZ, "#6b4a32", { tess: 5 });
        k.ball(0.75, potX, base + 1.45, potZ, "#3f7a3a", { seg: 8 });
        if (!low) k.ball(0.5, potX, base + 1.95, potZ, "#4e8f4a", { seg: 7 });
      } else if (fancy) {
        k.ball(0.62, potX, base + 0.95, potZ, "#4e8f4a", { seg: 8, sy: 1.6 });
        if (!low) k.ball(0.44, potX, base + 1.55, potZ, "#5f9f52", { seg: 7, sy: 1.5 });
      } else {
        k.ball(0.5, potX, base + 0.6, potZ, "#5fbf6a", { seg: 7 });
      }
    }
  }

  // A brass house number.
  const numX = outerW / 2 + (fancy ? 0.35 : 0.22);
  k.box(fancy ? 0.42 : 0.3, 0.2, 0.02, -numX, base + (fancy ? 2.6 : 1.85), fancy ? front - 0.005 : -0.02, "#c9a46a", { glow: 0.25 });
  const plate = sign?.(NUMBER[lot.type] ?? "1", fancy ? 0.38 : 0.26, 0.17, "#c9a46a", "#2a2116");
  plate?.place(-numX, base + (fancy ? 2.6 : 1.85), (fancy ? front : 0) - 0.035);

  if (lot.type === "hotel") {
    for (const x of [-3, -1.5, 0, 1.5, 3]) k.cyl(0.22, 0.22, 0.02, x, 3.17, -1.3, "#fff1d0", { glow: 1, tess: 10 });
    k.box(5, 0.05, 0.05, 0, 3.2, -2.58, "#fff1d0", { glow: 1 });
  }

  // The moving parts.
  const leaves = [];
  const hinge = (x, z, side) => {
    const node = new TransformNode("city-door-hinge", scene);
    node.parent = a.parent;
    node.position.set(x, base, z);
    return { node, kit: createKit(scene, node, mats ?? a.mats), side };
  };
  let spin = null;
  if (kind === "revolving") {
    const r = open / 2;
    const cz = front + r + 0.05;
    k.cyl(open + 0.1, open + 0.1, 0.12, 0, base + leafH + 0.06, cz, "#8a6a3a", { tess: 24 });
    k.cyl(open + 0.1, open + 0.1, 0.04, 0, base + 0.02, cz, "#8a6a3a", { tess: 24 });
    k.cyl(open, open, leafH, 0, base + leafH / 2, cz, "#cfe6f2", { alpha: 0.18, tess: 24 });
    const drum = hinge(0, cz, 0);
    for (let i = 0; i < 4; i += 1) {
      const yaw = (i / 4) * Math.PI * 2;
      drum.kit.box(0.02, leafH - 0.1, r - 0.04, Math.sin(yaw) * (r / 2), leafH / 2, Math.cos(yaw) * (r / 2), "#cfe6f2", { alpha: 0.3, ry: yaw });
      drum.kit.box(0.04, leafH - 0.1, 0.04, Math.sin(yaw) * (r - 0.04), leafH / 2, Math.cos(yaw) * (r - 0.04), "#8a6a3a", { ry: yaw });
      drum.kit.box(0.025, 0.04, r - 0.1, Math.sin(yaw) * (r / 2), 1.05, Math.cos(yaw) * (r / 2), "#c9a46a", { ry: yaw });
    }
    drum.kit.cyl(0.08, 0.08, leafH - 0.1, 0, leafH / 2, 0, "#8a6a3a", { tess: 8 });
    spin = drum.node;
    for (const side of [-1, 1]) {
      k.box(0.06, leafH, 0.06, side * (r + 0.03), base + leafH / 2, cz, "#8a6a3a");
    }
  } else if (fancy) {
    for (const side of [-1, 1]) {
      const h = hinge(side * (open / 2), front + 0.03, side);
      const x = -side * (leafW / 2);
      if (kind === "carved") {
        const wood = style.id === "man-hollywood" ? "#3a1f14" : "#5a3a22";
        h.kit.box(leafW - 0.02, leafH, 0.09, x, leafH / 2, 0.045, wood);
        const panels = low ? 2 : 3;
        for (let i = 0; i < panels; i += 1) {
          const ph = (leafH - 0.4) / panels - 0.12;
          const py = 0.25 + ph / 2 + i * (ph + 0.12);
          h.kit.box(leafW - 0.26, ph, 0.03, x, py, -0.01, dark(wood, 1.25));
          if (!low) h.kit.box(leafW - 0.36, ph - 0.1, 0.02, x, py, -0.025, dark(wood, 0.85));
        }
        if (style.id === "man-castle") for (const y of [0.5, leafH - 0.5]) h.kit.box(leafW - 0.04, 0.08, 0.02, x, y, -0.01, "#2a2c31");
        h.kit.box(0.04, 0.5, 0.05, -side * (leafW - 0.12), 1.1, -0.04, "#c9a46a", { glow: 0.2 });
        h.kit.ring(0.16, 0.025, -side * (leafW - 0.2), 1.5, -0.04, "#c9a46a", { rx: Math.PI / 2 });
      } else {
        const frame = kind === "bronze" ? "#6b4a2a" : "#15161a";
        h.kit.box(leafW - 0.02, leafH, 0.025, x, leafH / 2, 0.03, "#bfe0ec", { alpha: 0.28 });
        for (const [w, hh, fx, fy] of [[0.07, leafH, -side * 0.035, leafH / 2], [0.07, leafH, -side * (leafW - 0.055), leafH / 2], [leafW - 0.02, 0.08, x, 0.04], [leafW - 0.02, 0.08, x, leafH - 0.04]]) {
          h.kit.box(w, hh, 0.06, fx, fy, 0.03, frame);
        }
        h.kit.box(0.035, leafH * 0.6, 0.035, -side * (leafW - 0.16), leafH * 0.5, -0.06, kind === "bronze" ? "#c9a46a" : "#9aa0a8");
        for (const y of [leafH * 0.22, leafH * 0.78]) h.kit.box(0.02, 0.02, 0.07, -side * (leafW - 0.16), y, -0.02, kind === "bronze" ? "#c9a46a" : "#9aa0a8");
      }
      leaves.push(h);
    }
  } else {
    const color = LEAF[style.id] ?? dark(style.trim, 0.55);
    const trimHex = style.id === "house-spooky" ? "#3a2a44" : "#f4f1ea";
    for (const side of [-1, 1]) k.box(0.08, leafH + 0.08, 0.06, side * (leafW / 2 + 0.04), base + leafH / 2, front - 0.02, trimHex);
    k.box(leafW + 0.16, 0.08, 0.06, 0, base + leafH + 0.04, front - 0.02, trimHex);
    const h = hinge(-leafW / 2, front + 0.03, -1);
    const x = leafW / 2;
    h.kit.box(leafW - 0.02, leafH, 0.05, x, leafH / 2, 0.025, color);
    const raised = color === "#ffffff" ? "#ececec" : dark(color, 1.18);
    const panelsY = [[0.42, 0.62], [1.18, 0.62]];
    for (const [py, ph] of panelsY) for (const px of [0.25, 0.7]) {
      h.kit.box(0.34, ph, 0.02, px, py, -0.005, raised);
      if (!low) h.kit.box(0.28, ph - 0.08, 0.012, px, py, -0.016, color);
    }
    h.kit.box(0.6, 0.32, 0.02, x, 1.78, -0.005, "#cfe6f2", { alpha: 0.6, glow: 0.2 });
    h.kit.box(0.66, 0.04, 0.025, x, 1.96, -0.01, raised);
    h.kit.box(0.66, 0.04, 0.025, x, 1.6, -0.01, raised);
    h.kit.box(0.06, 0.16, 0.02, leafW - 0.1, 1.0, -0.02, "#c9a46a");
    h.kit.box(0.14, 0.025, 0.04, leafW - 0.14, 1.02, -0.05, "#c9a46a");
    h.kit.cyl(0.03, 0.03, 0.02, x, 1.5, -0.015, "#2a2c31", { rx: Math.PI / 2, tess: 8 });
    leaves.push(h);
  }

  // Open when you're near the porch, close when you walk away.
  const yaw = lot.fz < 0 ? 0 : Math.PI;
  const doorX = lot.cx + Math.sin(yaw) * (front - 0.6);
  const doorZ = lot.zf + Math.cos(yaw) * (front - 0.6);
  let amount = 0;
  let last = 0;
  let turn = 0;
  return (time, local) => {
    const dt = Math.min(0.1, Math.max(0, time - last));
    last = time;
    const near = local ? Math.hypot(local.x - doorX, local.z - doorZ) < 4.2 : false;
    amount += Math.sign((near ? 1 : 0) - amount) * Math.min(Math.abs((near ? 1 : 0) - amount), dt * 1.8);
    const ease = amount * amount * (3 - 2 * amount);
    if (spin) {
      turn += dt * (0.25 + ease * 1.1);
      spin.rotation.y = turn;
      return;
    }
    for (const leaf of leaves) leaf.node.rotation.y = leaf.side * ease * (fancy ? 1.25 : 1.35);
  };
}
