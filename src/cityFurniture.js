import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, Texture, Vector4 } from "@babylonjs/core";

/**
 * Real-size furniture and finishes for home interiors. Every builder takes a placement frame
 * (see `frame`) whose front faces local -z and whose back (the wall side) is +z, so a piece is
 * centered on its footprint with its back against the wall. Heights are meters above the floor.
 */

/* ------------------------------------------------------------------ colors */

export function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const toRgb = (hex) => {
  const c = Color3.FromHexString(hex);
  return [c.r, c.g, c.b];
};
const toHex = ([r, g, b]) => new Color3(Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))).toHexString();

/** Lighter (positive) or darker (negative) by `amount` of the way to white or black. */
export function shade(hex, amount) {
  const c = toRgb(hex);
  return toHex(c.map((v) => (amount >= 0 ? v + (1 - v) * amount : v * (1 + amount))));
}

export function mix(a, b, t) {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

/* ------------------------------------------------------------------ finishes */

/** Meters covered by one repeat of each finish's texture. */
export const FINISH_SIZE = {
  plain: 4, wood: 2.4, deck: 2.4, tile: 1.2, marble: 3, carpet: 2, stone: 2.4, limestone: 3.6, logs: 1.6,
  brick: 1.6, slats: 2, stripes: 1.2, panel: 2, grass: 3, sand: 3, gravel: 2, shingle: 1.6, water: 4, walnut: 2.4,
};

function paint(ctx, kind, hex, alt, rand) {
  const S = 256;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, S, S);
  const speckle = (n, size, hexes, alpha) => {
    for (let i = 0; i < n; i += 1) {
      ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
      ctx.fillStyle = hexes[i % hexes.length];
      ctx.fillRect(rand() * S, rand() * S, size * (0.5 + rand()), size * (0.5 + rand()));
    }
    ctx.globalAlpha = 1;
  };
  switch (kind) {
    case "wood":
    case "deck":
    case "walnut": {
      const vertical = kind === "walnut";
      const rows = kind === "deck" ? 8 : kind === "walnut" ? 4 : 12;
      const step = S / rows;
      for (let i = 0; i < rows; i += 1) {
        const tone = shade(hex, (rand() - 0.5) * 0.16);
        ctx.fillStyle = tone;
        if (vertical) ctx.fillRect(i * step, 0, step, S);
        else ctx.fillRect(0, i * step, S, step);
        ctx.strokeStyle = shade(tone, -0.12);
        ctx.globalAlpha = 0.35;
        for (let g = 0; g < 7; g += 1) {
          ctx.lineWidth = 0.6 + rand();
          ctx.beginPath();
          const o = i * step + rand() * step;
          if (vertical) {
            ctx.moveTo(o, 0);
            ctx.bezierCurveTo(o + rand() * 6 - 3, S * 0.3, o + rand() * 6 - 3, S * 0.7, o + rand() * 4 - 2, S);
          } else {
            ctx.moveTo(0, o);
            ctx.bezierCurveTo(S * 0.3, o + rand() * 4 - 2, S * 0.7, o + rand() * 4 - 2, S, o + rand() * 3 - 1.5);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = shade(hex, kind === "deck" ? -0.55 : -0.35);
        if (vertical) ctx.fillRect(i * step, 0, kind === "walnut" ? 2 : 1, S);
        else {
          ctx.fillRect(0, i * step, S, kind === "deck" ? 4 : 1.5);
          const cut = rand() * S;
          ctx.fillRect(cut, i * step, 1.5, step);
        }
      }
      break;
    }
    case "tile": {
      const n = 4;
      const step = S / n;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          ctx.fillStyle = shade(hex, (rand() - 0.5) * 0.05);
          ctx.fillRect(i * step, j * step, step, step);
        }
      }
      ctx.fillStyle = alt;
      for (let i = 0; i <= n; i += 1) {
        ctx.fillRect(i * step - 1.5, 0, 3, S);
        ctx.fillRect(0, i * step - 1.5, S, 3);
      }
      break;
    }
    case "marble":
    case "limestone": {
      if (kind === "limestone") {
        speckle(500, 2, [shade(hex, -0.08), shade(hex, 0.06)], 0.5);
        ctx.fillStyle = shade(hex, -0.18);
        for (let y = 0; y < S; y += S / 4) ctx.fillRect(0, y, S, 1.5);
        for (let y = 0; y < 4; y += 1) ctx.fillRect(((y % 2) * S) / 2 + S / 4, (y * S) / 4, 1.5, S / 4);
        break;
      }
      ctx.strokeStyle = alt;
      for (let i = 0; i < 9; i += 1) {
        ctx.globalAlpha = 0.12 + rand() * 0.3;
        ctx.lineWidth = 0.6 + rand() * 1.8;
        ctx.beginPath();
        let x = rand() * S;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < S) {
          const nx = x + (rand() - 0.5) * 60;
          const ny = y + 20 + rand() * 40;
          ctx.quadraticCurveTo(x + (rand() - 0.5) * 40, (y + ny) / 2, nx, ny);
          x = nx;
          y = ny;
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(hex, -0.06);
      ctx.fillRect(0, 0, S, 1);
      ctx.fillRect(0, 0, 1, S);
      break;
    }
    case "carpet":
      speckle(1600, 2, [shade(hex, -0.08), shade(hex, 0.06)], 0.6);
      break;
    case "grass":
      speckle(1400, 3, [shade(hex, -0.15), shade(hex, 0.1), shade(hex, -0.05)], 0.7);
      break;
    case "sand":
      speckle(1800, 1.5, [shade(hex, -0.1), shade(hex, 0.08), "#ffffff"], 0.6);
      break;
    case "gravel":
      speckle(900, 5, [shade(hex, -0.2), shade(hex, 0.15), shade(hex, -0.05)], 0.9);
      break;
    case "stone": {
      const rows = 5;
      const h = S / rows;
      for (let r = 0; r < rows; r += 1) {
        let x = -rand() * 40;
        while (x < S) {
          const w = 40 + rand() * 50;
          ctx.fillStyle = shade(hex, (rand() - 0.5) * 0.22);
          ctx.fillRect(x + 2, r * h + 2, w - 4, h - 4);
          x += w;
        }
      }
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = shade(hex, -0.4);
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = "source-over";
      speckle(500, 2, [shade(hex, -0.2)], 0.4);
      break;
    }
    case "brick": {
      ctx.fillStyle = alt;
      ctx.fillRect(0, 0, S, S);
      const rows = 8;
      const h = S / rows;
      for (let r = 0; r < rows; r += 1) {
        const off = r % 2 ? S / 8 : 0;
        for (let x = -S / 4 + off; x < S; x += S / 4) {
          ctx.fillStyle = shade(hex, (rand() - 0.5) * 0.25);
          ctx.fillRect(x + 2, r * h + 2, S / 4 - 4, h - 4);
        }
      }
      break;
    }
    case "logs": {
      const rows = 6;
      const h = S / rows;
      for (let r = 0; r < rows; r += 1) {
        const g = ctx.createLinearGradient(0, r * h, 0, r * h + h);
        g.addColorStop(0, shade(hex, -0.35));
        g.addColorStop(0.3, shade(hex, 0.08));
        g.addColorStop(0.7, hex);
        g.addColorStop(1, shade(hex, -0.45));
        ctx.fillStyle = g;
        ctx.fillRect(0, r * h, S, h);
      }
      break;
    }
    case "slats": {
      const n = 8;
      for (let i = 0; i < n; i += 1) {
        ctx.fillStyle = shade(hex, -0.12);
        ctx.fillRect(0, (i * S) / n, S, 2);
      }
      break;
    }
    case "stripes": {
      for (let i = 0; i < 8; i += 2) {
        ctx.fillStyle = alt;
        ctx.fillRect((i * S) / 8, 0, S / 8, S);
      }
      break;
    }
    case "panel": {
      ctx.fillStyle = shade(hex, -0.15);
      for (let i = 0; i <= 2; i += 1) {
        ctx.fillRect((i * S) / 2 - 2, 0, 4, S);
        ctx.fillRect(0, (i * S) / 2 - 2, S, 4);
      }
      ctx.fillStyle = alt;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(20, S / 2 - 30, 40, 4);
      ctx.fillRect(S / 2 + 20, S - 30, 40, 4);
      ctx.globalAlpha = 1;
      break;
    }
    case "shingle": {
      const rows = 8;
      const h = S / rows;
      for (let r = 0; r < rows; r += 1) {
        const off = r % 2 ? 16 : 0;
        for (let x = -32 + off; x < S; x += 32) {
          ctx.fillStyle = shade(hex, (rand() - 0.5) * 0.18);
          ctx.fillRect(x + 1, r * h, 30, h - 2);
        }
      }
      break;
    }
    case "water":
      speckle(80, 14, ["#ffffff"], 0.15);
      break;
    default:
      break;
  }
}

const finishCache = new WeakMap();

/** Cached tiling materials: get(kind, hex, alt) for floors, walls, and decks. */
export function finishes(scene) {
  let api = finishCache.get(scene);
  if (api) return api;
  const cache = new Map();
  api = {
    get(kind, hex, alt = "#000000") {
      const key = `${kind}|${hex}|${alt}`;
      let material = cache.get(key);
      if (material) return material;
      material = new StandardMaterial(`fin-${key}`, scene);
      if (kind === "plain") material.diffuseColor = Color3.FromHexString(hex);
      else {
        const texture = new DynamicTexture(`fin-tex-${key}`, { width: 256, height: 256 }, scene, true);
        paint(texture.getContext(), kind, hex, alt, seeded(key.length * 7919 + hex.charCodeAt(1)));
        texture.update();
        texture.wrapU = Texture.WRAP_ADDRESSMODE;
        texture.wrapV = Texture.WRAP_ADDRESSMODE;
        texture.anisotropicFilteringLevel = 4;
        material.diffuseTexture = texture;
      }
      const glossy = kind === "marble" || kind === "tile";
      material.specularColor = glossy ? new Color3(0.55, 0.55, 0.55) : kind === "wood" || kind === "walnut" ? new Color3(0.14, 0.14, 0.14) : new Color3(0.04, 0.04, 0.04);
      material.specularPower = glossy ? 90 : 32;
      material.fogEnabled = false;
      cache.set(key, material);
      return material;
    },
  };
  finishCache.set(scene, api);
  return api;
}

/** A box whose faces repeat `material` once every `size` meters. */
export function tiledBox(scene, w, h, d, material, size = 1) {
  const u = (a) => Math.max(0.05, a / size);
  const faceUV = [
    new Vector4(0, 0, u(w), u(h)),
    new Vector4(0, 0, u(w), u(h)),
    new Vector4(0, 0, u(d), u(h)),
    new Vector4(0, 0, u(d), u(h)),
    new Vector4(0, 0, u(w), u(d)),
    new Vector4(0, 0, u(w), u(d)),
  ];
  const mesh = MeshBuilder.CreateBox("fin-box", { width: w, height: h, depth: d, faceUV, wrap: true }, scene);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

/* ------------------------------------------------------------------ placement frame */

/**
 * A spot to build furniture at: interior position (x, z), turned `ry`, on a floor at `y0`.
 * ctx = { scene, k (kit for baked meshes), a (kit for animated meshes), fin, th, low, ceil, solid }.
 */
export function frame(ctx, x, z, ry, y0) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const world = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const turn = (o = {}) => ({ ...o, ry: ry + (o.ry ?? 0) });
  const prims = (kit) => ({
    box: (w, h, d, lx, y, lz, hex, o) => {
      const [wx, wz] = world(lx, lz);
      return kit.box(w, h, d, wx, y0 + y, wz, hex, turn(o));
    },
    cyl: (top, bottom, h, lx, y, lz, hex, o = {}) => {
      const [wx, wz] = world(lx, lz);
      if (o.arc) {
        const mesh = MeshBuilder.CreateCylinder("fin-arc", { diameterTop: top, diameterBottom: bottom, height: h, tessellation: o.tess ?? 18, arc: o.arc }, ctx.scene);
        mesh.parent = kit.parent;
        mesh.position.set(wx, y0 + y, wz);
        mesh.rotation.set(o.rx ?? 0, ry + (o.ry ?? 0) + Math.PI * (0.5 - o.arc), o.rz ?? 0);
        mesh.material = kit.mats.get(hex, o.glow ?? 0, o.alpha ?? 1);
        mesh.isPickable = false;
        return mesh;
      }
      return kit.cyl(top, bottom, h, wx, y0 + y, wz, hex, turn(o));
    },
    ball: (d, lx, y, lz, hex, o) => {
      const [wx, wz] = world(lx, lz);
      return kit.ball(d, wx, y0 + y, wz, hex, turn(o));
    },
    ring: (d, t, lx, y, lz, hex, o) => {
      const [wx, wz] = world(lx, lz);
      return kit.ring(d, t, wx, y0 + y, wz, hex, turn(o));
    },
  });
  const base = prims(ctx.k);
  return {
    ctx,
    th: ctx.th,
    low: ctx.low,
    x,
    z,
    ry,
    y0,
    world,
    ...base,
    live: ctx.a ? prims(ctx.a) : base,
    /** A box in a tiling finish. */
    fbox(w, h, d, lx, y, lz, kind, hex, alt, o = {}) {
      const mesh = tiledBox(ctx.scene, w, h, d, ctx.fin.get(kind, hex, alt), FINISH_SIZE[kind] ?? 1);
      const [wx, wz] = world(lx, lz);
      mesh.parent = ctx.k.parent;
      mesh.position.set(wx, y0 + y, wz);
      mesh.rotation.set(o.rx ?? 0, ry + (o.ry ?? 0), 0);
      return mesh;
    },
    solid(w, h, d, lx, y, lz) {
      const [wx, wz] = world(lx, lz);
      ctx.solid(wx, y0 + y, wz, w, h, d, ry);
    },
    sub(lx, lz, dry = 0) {
      const [wx, wz] = world(lx, lz);
      return frame(ctx, wx, wz, ry + dry, y0);
    },
  };
}

/* ------------------------------------------------------------------ seating */

export function sofa(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 2.2;
  const d = o.d ?? 0.95;
  const fabric = o.fabric ?? th.fabric;
  const pillows = o.pillows ?? [th.accent2, th.fabric2];
  const armL = o.armL ?? true;
  const armR = o.armR ?? true;
  const wood = o.wood;
  const legH = wood ? 0.16 : 0.1;
  if (wood) {
    p.box(w, 0.07, d, 0, legH + 0.035, 0, th.wood);
    for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) p.box(0.06, legH, 0.06, x, legH / 2, z, th.wood);
    p.box(w, 0.42, 0.06, 0, legH + 0.28, d / 2 - 0.03, th.wood);
    for (const [x, on] of [[-w / 2 + 0.04, armL], [w / 2 - 0.04, armR]]) if (on) p.box(0.06, 0.36, d, x, legH + 0.25, 0, th.wood);
  } else {
    for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) for (const z of [-d / 2 + 0.08, d / 2 - 0.08]) p.cyl(0.05, 0.04, legH, x, legH / 2, z, th.metalDark, { tess: 6 });
    p.box(w, 0.22, d, 0, legH + 0.11, 0, fabric);
    p.box(w, 0.48, 0.2, 0, legH + 0.42, d / 2 - 0.1, fabric);
    for (const [x, on] of [[-w / 2 + 0.08, armL], [w / 2 - 0.08, armR]]) if (on) p.box(0.16, 0.36, d, x, legH + 0.36, 0, fabric);
  }
  const inner = w - (armL ? 0.16 : 0) - (armR ? 0.16 : 0);
  const shift = ((armL ? 0.16 : 0) - (armR ? 0.16 : 0)) / 2;
  const n = inner > 2.1 ? 3 : 2;
  const cw = inner / n;
  const seatTop = 0.45;
  for (let i = 0; i < n; i += 1) {
    const cx = shift - inner / 2 + cw * (i + 0.5);
    p.box(cw - 0.02, 0.15, d - 0.25, cx, seatTop - 0.075, -0.1, wood ? "#fbfaf6" : shade(fabric, 0.03));
    p.box(cw - 0.04, 0.4, 0.17, cx, seatTop + 0.2, d / 2 - 0.27, wood ? "#fbfaf6" : shade(fabric, 0.02), { rx: -0.12 });
  }
  if (!p.low || pillows.length) {
    pillows.slice(0, 2).forEach((hex, i) => {
      const x = (i === 0 ? -1 : 1) * (inner / 2 - 0.3) + shift;
      p.box(0.42, 0.4, 0.12, x, seatTop + 0.2, d / 2 - 0.4, hex, { rx: -0.3, rz: i === 0 ? 0.08 : -0.08 });
    });
    if (!p.low && inner > 2.2) p.box(0.38, 0.36, 0.11, shift, seatTop + 0.19, d / 2 - 0.4, pillows[1] ?? pillows[0], { rx: -0.3 });
  }
  p.solid(w, 0.5, d, 0, 0.25, 0);
}

export function sectional(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 3.2;
  const d = o.d ?? 0.95;
  const ret = o.ret ?? 2.0;
  sofa(p.sub(-0.475, 0), { ...o, w: w - 0.95, d, armR: false });
  const q = p.sub(w / 2 - 0.475, d / 2 - ret / 2);
  const fabric = o.fabric ?? th.fabric;
  q.box(0.95, 0.22, ret, 0, 0.21, 0, fabric);
  q.box(0.2, 0.48, ret, 0.375, 0.52, 0, fabric);
  q.box(0.95, 0.36, 0.16, 0, 0.46, -ret / 2 + 0.08, fabric);
  q.box(0.7, 0.15, ret - 0.4, -0.08, 0.375, 0.02, shade(fabric, 0.03));
  q.box(0.17, 0.4, ret - 0.45, 0.2, 0.65, 0.05, shade(fabric, 0.02), { rz: 0.12 });
  q.box(0.42, 0.4, 0.12, 0.15, 0.65, -ret / 2 + 0.5, th.accent2, { rx: 0.3, ry: Math.PI / 2 });
  q.solid(0.95, 0.5, ret, 0, 0.25, 0);
}

export function armchair(p, o = {}) {
  const th = p.th;
  const fabric = o.fabric ?? th.fabric2;
  if (o.wood) {
    p.box(0.78, 0.06, 0.8, 0, 0.2, 0, th.wood);
    for (const x of [-0.36, 0.36]) {
      p.box(0.06, 0.4, 0.8, x, 0.4, 0, th.wood);
      for (const z of [-0.35, 0.35]) p.box(0.05, 0.2, 0.05, x, 0.1, z, th.wood);
    }
    p.box(0.66, 0.16, 0.66, 0, 0.32, -0.04, "#fbfaf6");
    p.box(0.66, 0.42, 0.14, 0, 0.6, 0.3, "#fbfaf6", { rx: -0.15 });
    p.box(0.36, 0.34, 0.1, 0, 0.6, 0.2, th.accent, { rx: -0.3 });
  } else {
    for (const x of [-0.32, 0.32]) for (const z of [-0.32, 0.32]) p.cyl(0.05, 0.04, 0.12, x, 0.06, z, th.metalDark, { tess: 6 });
    p.box(0.82, 0.22, 0.82, 0, 0.23, 0, fabric);
    p.box(0.6, 0.12, 0.62, 0, 0.4, -0.05, shade(fabric, 0.04));
    p.box(0.82, 0.48, 0.18, 0, 0.58, 0.32, fabric);
    for (const x of [-0.34, 0.34]) p.box(0.14, 0.26, 0.82, x, 0.47, 0, fabric);
  }
  p.solid(0.8, 0.5, 0.8, 0, 0.25, 0);
}

export function chair(p, x, z, ry, hex) {
  const q = p.sub(x, z, ry);
  const th = p.th;
  const seat = hex ?? th.fabric2;
  q.box(0.46, 0.06, 0.46, 0, 0.46, 0, seat);
  for (const lx of [-0.2, 0.2]) for (const lz of [-0.2, 0.2]) q.box(0.035, 0.44, 0.035, lx, 0.22, lz, th.woodDark);
  q.box(0.44, 0.46, 0.05, 0, 0.74, 0.21, seat, { rx: -0.08 });
}

export function stool(p, x, z, hex) {
  const q = p.sub(x, z);
  const th = p.th;
  q.cyl(0.4, 0.38, 0.07, 0, 0.74, 0, hex ?? th.fabric2, { tess: 16 });
  q.cyl(0.04, 0.04, 0.7, 0, 0.36, 0, th.metal, { tess: 6 });
  q.ring(0.32, 0.02, 0, 0.28, 0, th.metal);
  q.cyl(0.36, 0.38, 0.02, 0, 0.01, 0, th.metal, { tess: 16 });
}

export function cinemaSeats(p, o = {}) {
  const th = p.th;
  const rows = o.rows ?? 2;
  const per = o.per ?? 4;
  const seatW = 0.82;
  const rowW = per * seatW + 0.1;
  for (let r = 0; r < rows; r += 1) {
    const z = (r - (rows - 1) / 2) * 1.5;
    const rise = r * 0.24;
    if (r > 0) {
      p.box(rowW + 0.6, rise, 1.5, 0, rise / 2, z, th.cinemaFloor);
      p.box(rowW + 0.6, 0.02, 0.03, 0, rise + 0.005, z - 0.75, "#ffcf6a", { glow: 1 });
      p.solid(rowW + 0.6, rise, 1.5, 0, rise / 2, z);
    }
    for (let i = 0; i < per; i += 1) {
      const x = (i - (per - 1) / 2) * seatW;
      p.box(0.7, 0.32, 0.75, x, rise + 0.26, z, th.velvet);
      p.box(0.66, 0.12, 0.6, x, rise + 0.47, z - 0.04, shade(th.velvet, 0.08));
      p.box(0.7, 0.62, 0.18, x, rise + 0.7, z + 0.3, th.velvet, { rx: -0.15 });
      p.box(0.12, 0.22, 0.75, x - 0.41, rise + 0.52, z, "#1d1f24");
    }
    p.box(0.12, 0.22, 0.75, rowW / 2 - 0.05 + 0.04, rise + 0.52, z, "#1d1f24");
    p.solid(rowW, 0.45, 0.75, 0, rise + 0.225, z);
  }
}

export function lounger(p) {
  const th = p.th;
  const frameHex = th.fam === "villa" || th.fam === "beach" ? "#ffffff" : th.wood;
  for (const x of [-0.28, 0.28]) for (const z of [-0.8, 0.8]) p.box(0.05, 0.28, 0.05, x, 0.14, z, frameHex);
  p.box(0.66, 0.06, 1.25, 0, 0.3, -0.3, frameHex);
  p.box(0.62, 0.08, 1.2, 0, 0.37, -0.3, "#fbfaf6");
  p.box(0.66, 0.06, 0.7, 0, 0.52, 0.55, frameHex, { rx: -0.6 });
  p.box(0.62, 0.08, 0.68, 0, 0.58, 0.52, "#fbfaf6", { rx: -0.6 });
  if (!p.low) p.box(0.4, 0.1, 0.2, 0, 0.78, 0.7, th.accent, { rx: -0.6 });
  p.solid(0.66, 0.4, 1.85, 0, 0.2, 0);
}

/* ------------------------------------------------------------------ tables and decor */

export function rug(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 2.4;
  const d = o.d ?? 1.7;
  const hex = o.hex ?? th.rug;
  if (o.round) {
    p.cyl(w, w, 0.012, 0, 0.006, 0, shade(hex, -0.08), { tess: 32 });
    p.cyl(w - 0.12, w - 0.12, 0.014, 0, 0.007, 0, hex, { tess: 32 });
    return;
  }
  p.box(w, 0.012, d, 0, 0.006, 0, shade(hex, -0.1));
  p.box(w - 0.16, 0.014, d - 0.16, 0, 0.007, 0, hex);
  if (!p.low) p.box(w - 0.5, 0.0145, d - 0.5, 0, 0.0075, 0, shade(hex, 0.05));
}

export function vase(p, x, y, z, o = {}) {
  const th = p.th;
  const hex = o.hex ?? th.vase;
  p.cyl(0.1, 0.15, 0.26, x, y + 0.13, z, hex, { tess: 12 });
  if (p.low || o.flowers === false) return;
  for (let i = 0; i < 4; i += 1) {
    const a = i * 1.6;
    p.cyl(0.012, 0.012, 0.3, x + Math.sin(a) * 0.04, y + 0.38, z + Math.cos(a) * 0.04, "#4f8a4a", { tess: 4, rz: Math.sin(a) * 0.25, rx: Math.cos(a) * 0.25 });
    p.ball(0.11, x + Math.sin(a) * 0.08, y + 0.54, z + Math.cos(a) * 0.08, i % 2 ? "#ffffff" : "#f6f0e6", { seg: 6 });
  }
}

export function books(p, x, y, z, n = 3) {
  const th = p.th;
  for (let i = 0; i < n; i += 1) p.box(0.26 - i * 0.02, 0.04, 0.2 - i * 0.01, x, y + 0.02 + i * 0.04, z, th.books[i % th.books.length], { ry: i * 0.2 });
}

export function candles(p, x, y, z) {
  for (const [dx, h] of [[-0.1, 0.5], [0.06, 0.35], [0.14, 0.62]]) {
    p.cyl(0.1, 0.1, h, x + dx, y + h / 2, z + dx * 0.5, "#f6efe2", { tess: 10 });
    p.ball(0.04, x + dx, y + h + 0.03, z + dx * 0.5, "#ffcf6a", { glow: 1, seg: 4, sy: 1.6 });
  }
}

export function coffeeTable(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.2;
  const top = o.top ?? th.wood;
  if (o.round) {
    p.cyl(w, w, 0.05, 0, 0.4, 0, top, { tess: 28 });
    p.cyl(w * 0.4, w * 0.5, 0.36, 0, 0.19, 0, top, { tess: 20 });
    vase(p, 0.08, 0.425, -0.05, { hex: "#f4f1ea" });
    if (!p.low) books(p, -w * 0.22, 0.425, 0.1, 2);
    p.solid(w * 0.9, 0.44, w * 0.9, 0, 0.22, 0);
    return;
  }
  const d = 0.62;
  p.box(w, 0.05, d, 0, 0.41, 0, top);
  p.box(w - 0.1, 0.03, d - 0.1, 0, 0.12, 0, top);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) for (const z of [-d / 2 + 0.05, d / 2 - 0.05]) p.box(0.05, 0.39, 0.05, x, 0.2, z, shade(top, -0.2));
  vase(p, w * 0.22, 0.435, 0, {});
  if (!p.low) {
    books(p, -w * 0.2, 0.435, 0.02, 3);
    p.cyl(0.22, 0.2, 0.05, -w * 0.2, 0.15, 0, "#c9b28c", { tess: 10 });
  }
  p.solid(w, 0.44, d, 0, 0.22, 0);
}

export function mediaWall(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 2.0;
  const tvW = o.tv ?? Math.min(1.9, w * 0.8);
  const tvH = tvW * 0.5625;
  p.box(w, 0.42, 0.42, 0, 0.29, 0.02, th.woodDark);
  for (let i = 1; i < 4; i += 1) p.box(0.006, 0.36, 0.01, -w / 2 + (w * i) / 4, 0.29, -0.195, shade(th.woodDark, -0.3));
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) p.box(0.04, 0.08, 0.38, x, 0.04, 0.02, th.metalDark);
  p.box(tvW + 0.03, tvH + 0.03, 0.04, 0, 1.25, 0.18, "#111216");
  p.box(tvW, tvH, 0.01, 0, 1.25, 0.155, th.screen, { glow: 0.4 });
  if (!p.low) {
    p.box(w * 0.5, 0.07, 0.1, 0, 0.55, -0.05, "#1d1f24");
    vase(p, -w * 0.38, 0.5, 0, { flowers: false });
    books(p, w * 0.36, 0.5, 0, 2);
  }
  p.solid(w, 0.5, 0.45, 0, 0.25, 0);
}

export function tableLamp(p, x, y, z) {
  const th = p.th;
  p.cyl(0.12, 0.14, 0.04, x, y + 0.02, z, th.metal, { tess: 10 });
  p.cyl(0.025, 0.025, 0.3, x, y + 0.19, z, th.metal, { tess: 6 });
  p.cyl(0.2, 0.28, 0.22, x, y + 0.44, z, "#fbf3e2", { glow: 0.55, tess: 14 });
}

export function floorLamp(p, x, z, o = {}) {
  const th = p.th;
  p.cyl(0.32, 0.32, 0.03, x, 0.015, z, th.metalDark, { tess: 14 });
  if (o.arc) {
    p.cyl(0.03, 0.03, 1.8, x, 0.9, z, th.metal, { tess: 6 });
    p.box(0.03, 0.03, 0.9, x, 1.8, z - 0.45, th.metal);
    p.ball(0.38, x, 1.7, z - 0.9, "#fbf3e2", { glow: 0.6, sy: 0.55, seg: 10 });
  } else {
    p.cyl(0.03, 0.03, 1.45, x, 0.74, z, th.metal, { tess: 6 });
    p.cyl(0.3, 0.38, 0.32, x, 1.55, z, "#fbf3e2", { glow: 0.6, tess: 14 });
  }
  p.solid(0.32, 1.6, 0.32, x, 0.8, z);
}

export function plantPot(p, x, z, kind = "fiddle") {
  const th = p.th;
  const leaf = th.leaf;
  p.cyl(0.46, 0.36, 0.46, x, 0.23, z, th.pot, { tess: 14 });
  p.cyl(0.42, 0.42, 0.02, x, 0.45, z, "#4a3524", { tess: 14 });
  const rand = seeded(Math.round(x * 13 + z * 31) + kind.length);
  const n = p.low ? 4 : 8;
  if (kind === "fiddle") {
    p.cyl(0.04, 0.05, 1.3, x, 1.1, z, "#6b4a32", { tess: 5 });
    for (let i = 0; i < n + 2; i += 1) {
      const a = rand() * Math.PI * 2;
      const y = 0.9 + rand() * 0.95;
      p.ball(0.36, x + Math.sin(a) * 0.2, y, z + Math.cos(a) * 0.2, i % 3 ? leaf : shade(leaf, 0.15), { sy: 1.3, sz: 0.35, ry: a, seg: 6 });
    }
  } else if (kind === "bird" || kind === "palm") {
    const tall = kind === "palm" ? 1.9 : 1.5;
    for (let i = 0; i < n + 2; i += 1) {
      const a = (i / (n + 2)) * Math.PI * 2 + rand() * 0.4;
      const h = tall * (0.65 + rand() * 0.35);
      const tilt = 0.18 + rand() * 0.25;
      p.cyl(0.025, 0.03, h, x + Math.sin(a) * h * 0.18, 0.46 + h / 2, z + Math.cos(a) * h * 0.18, "#4f7a3a", { tess: 4, rx: Math.cos(a) * tilt, rz: -Math.sin(a) * tilt });
      const lx = x + Math.sin(a) * h * 0.38;
      const lz = z + Math.cos(a) * h * 0.38;
      if (kind === "bird") p.box(0.26, 0.6, 0.02, lx, 0.46 + h - 0.1, lz, i % 2 ? leaf : shade(leaf, -0.1), { ry: a + Math.PI / 2, rz: 0, rx: 0 });
      else p.box(0.5, 0.02, 0.9, lx, 0.46 + h, lz, i % 2 ? leaf : shade(leaf, 0.1), { ry: a, rx: 0.5 });
    }
    if (kind === "bird" && !p.low) {
      p.box(0.16, 0.05, 0.05, x + 0.1, 1.55, z, "#ff8a1f", { glow: 0.2, rz: 0.4 });
      p.box(0.1, 0.04, 0.04, x - 0.1, 1.4, z + 0.1, "#3a6bd6", { rz: -0.4 });
    }
  } else if (kind === "snake") {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const h = 0.55 + rand() * 0.45;
      p.box(0.09, h, 0.02, x + Math.sin(a) * 0.09, 0.46 + h / 2, z + Math.cos(a) * 0.09, i % 2 ? "#3f6b3a" : "#6f9a4a", { ry: a, rx: Math.cos(a) * 0.12, rz: -Math.sin(a) * 0.12 });
    }
  } else {
    p.ball(0.55, x, 0.68, z, leaf, { seg: 7 });
    p.ball(0.38, x + 0.12, 0.9, z, shade(leaf, 0.12), { seg: 6 });
  }
  p.solid(0.46, 0.8, 0.46, x, 0.4, z);
}

export function wardrobe(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.6;
  const h = 2.15;
  p.box(w, h, 0.58, 0, h / 2, 0.01, th.cabinet === "#f2efe9" ? "#f4f1ea" : th.cabinet);
  const doors = Math.max(2, Math.round(w / 0.55));
  for (let i = 1; i < doors; i += 1) p.box(0.008, h - 0.08, 0.01, -w / 2 + (w * i) / doors, h / 2, -0.285, shade(th.cabinet, -0.35));
  for (let i = 0; i < doors; i += 1) {
    const x = -w / 2 + (w * (i + 0.5)) / doors + (i % 2 ? -1 : 1) * (w / doors / 2 - 0.06);
    p.box(0.02, 0.32, 0.03, x, 1.05, -0.3, th.metal);
  }
  p.box(w, 0.06, 0.6, 0, 0.03, 0, shade(th.cabinet, -0.3));
  p.solid(w, h, 0.58, 0, h / 2, 0);
}

export function dresser(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.2;
  p.box(w, 0.72, 0.46, 0, 0.44, 0.01, th.woodDark);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) p.box(0.04, 0.08, 0.04, x, 0.04, -0.16, th.metalDark);
  for (let r = 0; r < 3; r += 1) {
    const y = 0.2 + r * 0.24;
    p.box(w - 0.04, 0.006, 0.01, 0, y + 0.12, -0.225, shade(th.woodDark, -0.4));
    for (const x of [-w / 4, w / 4]) p.box(0.14, 0.02, 0.03, x, y + 0.02, -0.23, th.metal);
  }
  p.box(w + 0.02, 0.03, 0.48, 0, 0.815, 0, shade(th.woodDark, -0.1));
  if (o.mirror !== false) {
    p.box(w * 0.7, 0.9, 0.03, 0, 1.45, 0.2, th.metal);
    p.box(w * 0.66, 0.86, 0.01, 0, 1.45, 0.183, "#d9eef7", { glow: 0.15 });
  }
  if (!p.low) {
    vase(p, -w * 0.32, 0.83, 0, {});
    books(p, w * 0.3, 0.83, 0, 2);
  }
  tableLamp(p, w * 0.3, 0.91, 0.06);
  p.solid(w, 0.83, 0.46, 0, 0.415, 0);
}

export function desk(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.3;
  p.box(w, 0.04, 0.62, 0, 0.74, 0, th.gamerTop ?? (o.gamer ? "#1d1f24" : th.wood));
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) p.box(0.04, 0.72, 0.58, x, 0.36, 0, o.gamer ? "#1d1f24" : th.metalDark);
  const screens = o.gamer ? [-0.32, 0.32] : [0];
  for (const x of screens) {
    p.box(0.58, 0.34, 0.03, x, 1.1, 0.16, "#111216", { ry: x * -0.5 });
    p.box(0.55, 0.31, 0.01, x, 1.1, 0.143, o.gamer ? "#3a2f8a" : "#26324a", { glow: 0.5, ry: x * -0.5 });
    p.box(0.05, 0.18, 0.05, x, 0.85, 0.2, "#2a2c31");
  }
  p.box(0.45, 0.02, 0.15, 0, 0.77, -0.08, "#2a2c31");
  if (o.gamer) p.box(w, 0.015, 0.015, 0, 0.72, -0.31, "#ff4dd8", { glow: 1 });
  else tableLamp(p, w / 2 - 0.18, 0.76, 0.12);
  chair(p, 0, -0.55, Math.PI, o.gamer ? "#e23b4a" : th.fabric2);
  p.solid(w, 0.76, 0.62, 0, 0.38, 0);
}

export function pendant(p, x, z, ceil, y, o = {}) {
  const th = p.th;
  p.cyl(0.012, 0.012, ceil - y, x, (ceil + y) / 2, z, th.metalDark, { tess: 4 });
  if (o.kind === "globe") p.ball(0.3, x, y - 0.12, z, "#fff4dc", { glow: 0.8, seg: 10 });
  else if (o.kind === "dome") {
    p.cyl(0.08, 0.42, 0.24, x, y - 0.12, z, o.hex ?? th.metalDark, { tess: 16 });
    p.cyl(0.3, 0.3, 0.01, x, y - 0.24, z, "#fff4dc", { glow: 1, tess: 12 });
  } else {
    p.cyl(0.2, 0.2, 0.32, x, y - 0.16, z, o.hex ?? th.metal, { tess: 14 });
    p.cyl(0.17, 0.17, 0.01, x, y - 0.325, z, "#fff4dc", { glow: 1, tess: 10 });
  }
}

export function ringChandelier(p, x, z, y, d, o = {}) {
  const th = p.th;
  const ceil = p.ctx.ceil ?? y + 1;
  p.cyl(0.015, 0.015, ceil - y, x, (ceil + y) / 2, z, th.metalDark, { tess: 4 });
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    p.cyl(0.006, 0.006, 0.5, x + Math.sin(a) * d * 0.3, y + 0.2, z + Math.cos(a) * d * 0.3, th.metalDark, { tess: 3, rz: Math.sin(a) * 0.6, rx: Math.cos(a) * 0.6 });
  }
  p.ring(d, 0.06, x, y, z, "#fff1d0", { glow: 1 });
  if (d > 1.2) p.ring(d * 0.6, 0.05, x, y - 0.25, z, "#fff1d0", { glow: 1 });
  if (o.crystal && !p.low) {
    const n = 18;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      p.cyl(0.03, 0.03, 0.35 + (i % 3) * 0.12, x + (Math.sin(a) * d) / 2, y - 0.25 - (i % 3) * 0.06, z + (Math.cos(a) * d) / 2, "#eaf6ff", { alpha: 0.7, glow: 0.4, tess: 4 });
    }
  }
}

export function diningSet(p, o = {}) {
  const th = p.th;
  const len = o.len ?? 1.8;
  const seats = o.seats ?? 6;
  const ceil = o.ceil ?? 2.8;
  if (o.round) {
    p.cyl(len, len, 0.05, 0, 0.75, 0, th.wood, { tess: 26 });
    p.cyl(0.18, 0.5, 0.73, 0, 0.365, 0, th.woodDark, { tess: 14 });
    const n = seats;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      chair(p, Math.sin(a) * (len / 2 + 0.3), Math.cos(a) * (len / 2 + 0.3), a);
    }
    p.solid(len * 0.85, 0.78, len * 0.85, 0, 0.39, 0);
  } else {
    const d = 0.95;
    p.box(len, 0.05, d, 0, 0.75, 0, th.wood);
    for (const x of [-len / 2 + 0.1, len / 2 - 0.1]) for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) p.box(0.07, 0.73, 0.07, x, 0.365, z, th.woodDark);
    const side = Math.floor(Math.min(seats, 8) / 2) - (seats >= 8 ? 1 : 0);
    for (let i = 0; i < side; i += 1) {
      const x = (i - (side - 1) / 2) * (len / side);
      chair(p, x, -d / 2 - 0.25, 0);
      chair(p, x, d / 2 + 0.25, Math.PI);
    }
    if (seats >= 8) {
      chair(p, -len / 2 - 0.35, 0, -Math.PI / 2);
      chair(p, len / 2 + 0.35, 0, Math.PI / 2);
    }
    if (!p.low) {
      p.box(len * 0.6, 0.006, 0.32, 0, 0.778, 0, th.accent2);
      vase(p, 0, 0.78, 0, {});
    }
    p.solid(len, 0.78, d, 0, 0.39, 0);
  }
  const kind = o.chandelier ?? "linear";
  if (kind === "none") return;
  const ctx = p.ctx;
  const saved = ctx.ceil;
  ctx.ceil = ceil;
  if (kind === "crystal") ringChandelier(p, 0, 0, Math.min(ceil - 0.9, 2.3), Math.min(1.2, len * 0.6), { crystal: true });
  else if (o.round) pendant(p, 0, 0, ceil, Math.min(ceil - 0.6, 1.95), { kind: "dome", hex: th.metalDark });
  else {
    const y = Math.min(ceil - 0.7, 1.95);
    p.cyl(0.01, 0.01, ceil - y, -len * 0.3, (ceil + y) / 2, 0, th.metalDark, { tess: 3 });
    p.cyl(0.01, 0.01, ceil - y, len * 0.3, (ceil + y) / 2, 0, th.metalDark, { tess: 3 });
    p.box(len * 0.75, 0.06, 0.12, 0, y, 0, th.metal);
    p.box(len * 0.72, 0.01, 0.08, 0, y - 0.035, 0, "#fff4dc", { glow: 1 });
  }
  ctx.ceil = saved;
}

/* ------------------------------------------------------------------ bedroom */

export function bed(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.6;
  const l = o.l ?? 2.05;
  const back = 1.075;
  const cz = back - 0.1 - l / 2;
  p.box(w + 0.1, 0.28, l, 0, 0.2, cz, th.bedFrame);
  for (const x of [-w / 2, w / 2]) for (const z of [cz - l / 2 + 0.06, cz + l / 2 - 0.06]) p.box(0.06, 0.08, 0.06, x, 0.04, z, th.metalDark);
  p.box(w, 0.24, l - 0.06, 0, 0.46, cz, "#fbfaf6");
  p.box(w + 0.04, 0.07, l * 0.72, 0, 0.6, cz - l * 0.14, o.duvet ?? th.duvet);
  p.box(w + 0.05, 0.09, 0.3, 0, 0.62, cz + l * 0.2, shade(o.duvet ?? th.duvet, -0.06));
  if (!o.kid) p.box(w + 0.06, 0.08, 0.5, 0, 0.66, cz - l / 2 + 0.35, th.accent, {});
  const pillows = w > 1.3 ? [-w / 4, w / 4] : [0];
  for (const x of pillows) {
    p.box(w / pillows.length - 0.1, 0.16, 0.42, x, 0.66, back - 0.38, "#ffffff", { rx: -0.25 });
    if (!p.low && !o.kid) p.box(w / pillows.length - 0.22, 0.14, 0.12, x, 0.68, back - 0.62, th.fabric2, { rx: -0.3 });
  }
  p.box(w + 0.24, 1.15, 0.1, 0, 0.6, back - 0.05, th.headboard);
  if (!p.low) for (let i = 0; i < 4; i += 1) p.box(0.005, 0.95, 0.01, -w / 2 + ((w + 0.24) * (i + 1)) / 5 - 0.12, 0.62, back - 0.105, shade(th.headboard, -0.15));
  if (o.nightstands !== false) {
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.38);
      p.box(0.5, 0.52, 0.42, x, 0.3, back - 0.24, th.woodDark);
      p.box(0.46, 0.006, 0.01, x, 0.38, back - 0.455, shade(th.woodDark, -0.4));
      p.box(0.12, 0.02, 0.02, x, 0.46, back - 0.46, th.metal);
      tableLamp(p, x, 0.56, back - 0.24);
      p.solid(0.5, 0.56, 0.42, x, 0.28, back - 0.24);
    }
  }
  p.solid(w + 0.1, 0.62, l, 0, 0.31, cz);
}

/* ------------------------------------------------------------------ kitchen */

export function kitchenRun(p, o = {}) {
  const th = p.th;
  const len = o.len ?? 4;
  const ceil = o.ceil ?? 2.8;
  const fridgeW = 0.82;
  const runLen = len - fridgeW;
  const rx = -len / 2 + runLen / 2;
  const line = shade(th.cabinet, -0.35);
  p.box(runLen, 0.1, 0.54, rx, 0.05, 0.03, "#1d1f24");
  p.box(runLen, 0.76, 0.6, rx, 0.48, 0, th.cabinet);
  const doors = Math.max(2, Math.round(runLen / 0.6));
  const dw = runLen / doors;
  for (let i = 0; i < doors; i += 1) {
    const x = -len / 2 + dw * (i + 0.5);
    if (i > 0) p.box(0.006, 0.72, 0.01, x - dw / 2, 0.48, -0.302, line);
    if (i % 2 === 0) {
      p.box(dw - 0.04, 0.005, 0.01, x, 0.7, -0.302, line);
      p.box(0.22, 0.015, 0.025, x, 0.78, -0.31, th.metal);
    }
    p.box(0.015, 0.2, 0.025, x + dw / 2 - 0.06, 0.55, -0.31, th.metal);
  }
  p.fbox(runLen + 0.02, 0.04, 0.64, rx, 0.9, -0.01, "marble", th.counterTop, th.counterVein);
  p.box(runLen, 0.6, 0.02, rx, 1.22, 0.29, th.backsplash);
  const sinkX = -len / 2 + runLen * 0.3;
  const cookX = -len / 2 + runLen * 0.72;
  p.box(0.62, 0.012, 0.42, sinkX, 0.922, -0.03, "#9aa0a8");
  p.box(0.56, 0.01, 0.36, sinkX, 0.925, -0.03, "#5f656d");
  p.cyl(0.04, 0.05, 0.32, sinkX, 1.08, 0.2, th.metal, { tess: 8 });
  p.cyl(0.03, 0.03, 0.26, sinkX, 1.24, 0.08, th.metal, { tess: 6, rx: Math.PI / 2 });
  p.cyl(0.03, 0.03, 0.08, sinkX, 1.2, -0.04, th.metal, { tess: 6 });
  p.box(0.62, 0.012, 0.52, cookX, 0.924, -0.02, "#111216");
  for (const [dx, dz] of [[-0.15, -0.12], [0.15, -0.12], [-0.15, 0.12], [0.15, 0.12]]) p.ring(0.18, 0.012, cookX + dx, 0.932, -0.02 + dz, "#3a3d44");
  p.box(0.62, 0.42, 0.02, cookX, 0.5, -0.305, "#1d1f24");
  p.box(0.4, 0.015, 0.02, cookX, 0.75, -0.315, th.metal);
  p.box(0.75, 0.12, 0.5, cookX, 1.75, 0.05, th.metal);
  p.box(0.36, Math.max(0.2, ceil - 1.81), 0.3, cookX, 1.81 + (ceil - 1.81) / 2, 0.15, th.metal);
  p.box(0.6, 0.01, 0.3, cookX, 1.685, 0.05, "#fff4dc", { glow: 0.8 });
  if (o.uppers !== false) {
    const gap = [cookX - 0.45, cookX + 0.45];
    for (const [a, b] of [[-len / 2, gap[0]], [gap[1], -len / 2 + runLen]]) {
      if (b - a < 0.3) continue;
      const cx = (a + b) / 2;
      p.box(b - a, 0.75, 0.34, cx, 1.88, 0.13, th.cabinet);
      const n = Math.max(1, Math.round((b - a) / 0.5));
      for (let i = 1; i < n; i += 1) p.box(0.006, 0.71, 0.01, a + ((b - a) * i) / n, 1.88, -0.042, line);
      for (let i = 0; i < n; i += 1) p.box(0.015, 0.14, 0.025, a + ((b - a) * (i + 0.5)) / n + 0.12, 1.6, -0.05, th.metal);
      p.box(b - a - 0.04, 0.012, 0.03, cx, 1.497, 0.1, "#fff4dc", { glow: 1 });
    }
  }
  const fx = len / 2 - fridgeW / 2;
  p.box(fridgeW - 0.02, 2.0, 0.66, fx, 1.0, 0.02, th.fridge);
  p.box(0.006, 1.98, 0.01, fx, 1.0, -0.312, shade(th.fridge, -0.4));
  for (const s of [-1, 1]) p.box(0.025, 0.7, 0.04, fx + s * 0.06, 1.2, -0.33, th.metal);
  if (ceil > 2.3) p.box(fridgeW, Math.min(0.6, ceil - 2.05), 0.62, fx, 2.05 + Math.min(0.6, ceil - 2.05) / 2, 0.03, th.cabinet);
  if (!p.low) {
    p.box(0.4, 0.02, 0.28, sinkX + 0.7, 0.93, -0.02, th.wood, { ry: 0.2 });
    p.cyl(0.16, 0.18, 0.22, cookX - 0.9, 1.03, 0.1, th.metal, { tess: 10 });
    p.cyl(0.28, 0.18, 0.1, rx - runLen * 0.45, 0.97, 0, "#f4f1ea", { tess: 12 });
    for (let i = 0; i < 3; i += 1) p.ball(0.08, rx - runLen * 0.45 + (i - 1) * 0.06, 1.03, 0.02 * i, ["#e23b4a", "#ffd23f", "#7ac74f"][i], { seg: 5 });
  }
  p.solid(runLen, 0.93, 0.62, rx, 0.465, 0);
  p.solid(fridgeW, 2.0, 0.66, fx, 1.0, 0.02);
}

export function island(p, o = {}) {
  const th = p.th;
  const len = o.len ?? 2.4;
  const ceil = o.ceil ?? 2.8;
  p.box(len - 0.1, 0.1, 0.8, 0, 0.05, 0.05, "#1d1f24");
  p.box(len, 0.8, 0.9, 0, 0.5, 0.05, th.cabinet);
  for (let i = 1; i < 4; i += 1) p.box(0.006, 0.76, 0.01, -len / 2 + (len * i) / 4, 0.5, 0.502, shade(th.cabinet, -0.35));
  p.fbox(len + 0.1, 0.05, 1.05, 0, 0.925, -0.02, "marble", th.counterTop, th.counterVein);
  for (const x of [-len / 2 - 0.025, len / 2 + 0.025]) p.fbox(0.05, 0.9, 1.05, x, 0.45, -0.02, "marble", th.counterTop, th.counterVein);
  const n = Math.max(2, Math.floor(len / 0.65));
  for (let i = 0; i < n; i += 1) stool(p, (i - (n - 1) / 2) * 0.65, -0.82, th.fabric2);
  if (!p.low) {
    vase(p, len * 0.3, 0.95, 0.1, {});
    p.cyl(0.32, 0.22, 0.1, -len * 0.25, 1.0, 0.1, th.wood, { tess: 12 });
  }
  const pendants = len > 2 ? [-len / 3, 0, len / 3] : [-len / 4, len / 4];
  for (const x of pendants) pendant(p, x, 0.05, ceil, Math.min(ceil - 0.5, 1.95), { kind: th.fam === "night" || th.fam === "walnut" ? "globe" : "drum", hex: th.metal });
  p.solid(len + 0.1, 0.95, 1.05, 0, 0.475, 0);
}

/* ------------------------------------------------------------------ bathroom */

export function vanity(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.0;
  p.box(w, 0.5, 0.5, 0, 0.6, 0.01, th.vanity);
  p.box(0.006, 0.46, 0.01, 0, 0.6, -0.245, shade(th.vanity, -0.35));
  p.fbox(w + 0.02, 0.04, 0.52, 0, 0.87, 0, "marble", "#f6f4ef", "#c9c2b6");
  const basins = o.double ? [-w / 4, w / 4] : [0];
  for (const x of basins) {
    p.cyl(0.4, 0.34, 0.12, x, 0.95, -0.02, "#ffffff", { tess: 18 });
    p.cyl(0.34, 0.34, 0.01, x, 1.005, -0.02, "#d9e2e8", { tess: 18 });
    p.cyl(0.03, 0.03, 0.26, x, 1.02, 0.19, th.metal, { tess: 6 });
    p.cyl(0.025, 0.025, 0.14, x, 1.14, 0.13, th.metal, { tess: 6, rx: Math.PI / 2 });
    p.box(w / basins.length - 0.1, 0.8, 0.03, x, 1.62, 0.235, "#cfdde6", { glow: 0.2 });
    p.box(w / basins.length - 0.08, 0.82, 0.02, x, 1.62, 0.245, "#fff4dc", { glow: 0.7 });
  }
  if (!p.low) {
    p.cyl(0.06, 0.06, 0.16, w / 2 - 0.1, 0.97, 0.12, "#f4f1ea", { tess: 8 });
    p.box(0.25, 0.08, 0.15, -w / 2 + 0.16, 0.93, 0.12, th.towel);
  }
  p.solid(w, 0.9, 0.5, 0, 0.45, 0);
}

export function toilet(p) {
  p.box(0.42, 0.38, 0.18, 0, 0.62, 0.27, "#ffffff");
  p.box(0.44, 0.03, 0.2, 0, 0.82, 0.27, "#f4f4f4");
  p.cyl(0.36, 0.28, 0.4, 0, 0.2, -0.02, "#ffffff", { tess: 16, sz: 1.3 });
  p.cyl(0.38, 0.38, 0.04, 0, 0.42, -0.02, "#f4f4f4", { tess: 16, sz: 1.3 });
  p.box(0.06, 0.02, 0.03, 0.14, 0.76, 0.17, "#c9ced4");
  p.solid(0.44, 0.44, 0.7, 0, 0.22, 0);
}

export function shower(p) {
  const th = p.th;
  p.box(0.98, 0.05, 0.98, 0, 0.025, 0, "#f4f4f4");
  p.box(0.98, 2.1, 0.02, 0, 1.05, 0.48, th.bathTile);
  p.box(0.02, 2.0, 0.98, -0.48, 1.05, 0, "#cfe6f2", { alpha: 0.25 });
  p.box(0.5, 2.0, 0.02, 0.24, 1.05, -0.48, "#cfe6f2", { alpha: 0.25 });
  p.box(0.03, 2.0, 0.03, -0.48, 1.05, -0.48, th.metal);
  p.box(0.03, 0.03, 0.98, -0.48, 2.05, 0, th.metal);
  p.cyl(0.02, 0.02, 0.3, 0, 2.05, 0.33, th.metal, { tess: 6, rx: Math.PI / 2 });
  p.cyl(0.24, 0.24, 0.02, 0, 2.02, 0.18, th.metal, { tess: 14 });
  p.cyl(0.06, 0.06, 0.08, 0, 1.1, 0.46, th.metal, { tess: 8, rx: Math.PI / 2 });
  p.cyl(0.08, 0.08, 0.005, 0, 0.053, 0, "#9aa0a8", { tess: 10 });
  p.solid(0.06, 2, 0.98, -0.48, 1, 0);
}

export function tub(p, o = {}) {
  const th = p.th;
  const l = o.l ?? 1.7;
  p.cyl(0.8, 0.74, 0.56, 0, 0.28, 0, "#ffffff", { tess: 24, sx: l / 0.8 });
  p.cyl(0.66, 0.66, 0.02, 0, 0.5, 0, "#bfe8f5", { tess: 24, sx: (l - 0.16) / 0.66, glow: 0.15 });
  p.cyl(0.04, 0.05, 0.9, l / 2 - 0.15, 0.45, 0.42, th.metal, { tess: 8 });
  p.cyl(0.03, 0.03, 0.22, l / 2 - 0.15, 0.88, 0.32, th.metal, { tess: 6, rx: Math.PI / 2 });
  if (!p.low) p.box(0.5, 0.06, 0.3, -l / 2 + 0.4, 0.59, 0.25, th.towel, { ry: 0.2 });
  p.solid(l, 0.56, 0.8, 0, 0.28, 0);
}

export function towel(p, x, z) {
  const th = p.th;
  p.box(0.6, 0.025, 0.025, x, 1.15, z - 0.04, th.metal);
  p.box(0.46, 0.62, 0.04, x, 0.86, z - 0.05, th.towel);
  p.box(0.46, 0.1, 0.06, x, 1.15, z - 0.05, th.towel);
}

/* ------------------------------------------------------------------ living extras */

export function bookshelf(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.2;
  const h = o.h ?? 2.0;
  const d = 0.36;
  const wood = th.fam === "walnut" || th.fam === "night" ? th.wood : th.woodDark;
  p.box(w, h, 0.02, 0, h / 2, d / 2 - 0.01, shade(wood, -0.15));
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) p.box(0.04, h, d, x, h / 2, 0, wood);
  const shelves = Math.max(3, Math.round(h / 0.38));
  const gap = h / shelves;
  const rand = seeded(Math.round(w * 100 + h * 10));
  for (let i = 0; i <= shelves; i += 1) p.box(w, 0.03, d, 0, Math.min(h - 0.015, i * gap + 0.015), 0, wood);
  for (let i = 0; i < shelves; i += 1) {
    const y = i * gap + 0.03;
    if (p.low) {
      p.box(w * 0.7, gap * 0.7, d * 0.75, -w * 0.1, y + gap * 0.35, 0, th.books[i % th.books.length]);
      continue;
    }
    let x = -w / 2 + 0.06;
    const stop = w / 2 - 0.06 - (i % 2 ? 0.3 : 0);
    while (x < stop - 0.04) {
      const bw = 0.03 + rand() * 0.04;
      const bh = gap * (0.55 + rand() * 0.3);
      p.box(bw, bh, d * 0.75, x + bw / 2, y + bh / 2, 0, th.books[Math.floor(rand() * th.books.length)]);
      x += bw + 0.004;
      if (rand() < 0.08) x += 0.12;
    }
    if (i % 2) vase(p, w / 2 - 0.2, y, 0, { flowers: false, hex: th.vase });
  }
  p.solid(w, h, d, 0, h / 2, 0);
}

const artCache = new WeakMap();
function artMaterial(scene, motif, th) {
  let cache = artCache.get(scene);
  if (!cache) {
    cache = new Map();
    artCache.set(scene, cache);
  }
  const key = `${motif}|${th.accent}|${th.accent2}`;
  let material = cache.get(key);
  if (material) return material;
  const texture = new DynamicTexture(`art-${key}`, { width: 256, height: 192 }, scene, true);
  const ctx = texture.getContext();
  const rand = seeded(key.length * 131);
  if (motif === "palm") {
    const g = ctx.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, "#bfe8f0");
    g.addColorStop(0.6, "#f6efe0");
    g.addColorStop(1, "#e9d8b8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = "#3ec6c0";
    ctx.fillRect(0, 118, 256, 20);
    ctx.strokeStyle = "#6b4a32";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(150, 192);
    ctx.quadraticCurveTo(140, 110, 120, 60);
    ctx.stroke();
    ctx.strokeStyle = "#3f8a3a";
    ctx.lineWidth = 7;
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI * 0.9 + (i / 6) * Math.PI * 0.95;
      ctx.beginPath();
      ctx.moveTo(120, 60);
      ctx.quadraticCurveTo(120 + Math.cos(a) * 30, 60 + Math.sin(a) * 30 - 10, 120 + Math.cos(a) * 62, 60 + Math.sin(a) * 50 + 20);
      ctx.stroke();
    }
  } else if (motif === "skyline") {
    const g = ctx.createLinearGradient(0, 0, 0, 192);
    g.addColorStop(0, "#1b2340");
    g.addColorStop(1, "#f2a86a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 192);
    ctx.fillStyle = "#141a28";
    let x = 0;
    while (x < 256) {
      const w = 12 + rand() * 22;
      const h = 40 + rand() * 100;
      ctx.fillRect(x, 192 - h, w, h);
      x += w + 2;
    }
  } else {
    ctx.fillStyle = "#f2eee6";
    ctx.fillRect(0, 0, 256, 192);
    const tones = [th.accent, th.accent2, "#c9bfae", "#9fb3c4", "#e8d9c0", "#7a8a9a"];
    for (let i = 0; i < 9; i += 1) {
      ctx.globalAlpha = 0.25 + rand() * 0.35;
      ctx.fillStyle = tones[i % tones.length];
      ctx.beginPath();
      ctx.ellipse(rand() * 256, rand() * 192, 30 + rand() * 70, 20 + rand() * 50, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#5a5f66";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(30, 150);
    ctx.bezierCurveTo(90, 60, 160, 170, 230, 50);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  texture.update();
  material = new StandardMaterial(`art-mat-${key}`, scene);
  material.diffuseTexture = texture;
  material.emissiveColor = new Color3(0.25, 0.25, 0.25);
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  cache.set(key, material);
  return material;
}

export function wallArt(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.1;
  const h = o.h ?? 0.75;
  const y = o.y ?? 1.6;
  p.box(w + 0.06, h + 0.06, 0.035, 0, y, 0, th.frame);
  p.box(w, h, 0.01, 0, y, -0.02, null, { material: artMaterial(p.ctx.scene, o.motif ?? "abstract", th), ry: Math.PI });
}

export function piano(p) {
  const black = "#0c0c0e";
  p.box(1.5, 0.34, 1.1, 0, 0.82, 0.25, black);
  p.cyl(1.5, 1.5, 0.34, 0.0, 0.82, 0.75, black, { tess: 24, sx: 1, sz: 0.9 });
  p.box(1.42, 0.03, 1.6, -0.04, 1.32, 0.55, black, { rz: -0.5 });
  p.cyl(0.02, 0.02, 0.55, 0.6, 1.17, 0.6, "#1d1f24", { rz: 0.3 });
  for (const [x, z] of [[-0.65, -0.15], [0.65, -0.15], [0, 1.3]]) p.cyl(0.1, 0.08, 0.66, x, 0.33, z, black, { tess: 8 });
  p.box(1.4, 0.06, 0.18, 0, 0.74, -0.38, "#f6f4ef");
  if (!p.low) for (let i = 0; i < 20; i += 1) if (i % 7 !== 2 && i % 7 !== 6) p.box(0.035, 0.03, 0.1, -0.66 + i * 0.07, 0.785, -0.34, black);
  p.box(1.4, 0.12, 0.05, 0, 0.82, -0.47, black);
  p.box(0.8, 0.06, 0.38, 0, 0.5, -0.95, black);
  p.box(0.82, 0.04, 0.38, 0, 0.53, -0.95, "#1d1f24");
  for (const x of [-0.35, 0.35]) p.box(0.04, 0.48, 0.34, x, 0.24, -0.95, black);
  p.solid(1.5, 1.0, 1.9, 0, 0.5, 0.45);
  p.solid(0.8, 0.55, 0.38, 0, 0.27, -0.95);
}

/** Returns the flame meshes, which the interior flickers every frame. */
export function fireplace(p, o = {}) {
  const th = p.th;
  const kind = o.kind ?? "modern";
  const w = o.w ?? 1.6;
  const ceil = o.ceil ?? 2.8;
  const flames = [];
  const breastW = w + 1.0;
  if (kind === "stone") p.fbox(breastW, ceil, 0.5, 0, ceil / 2, 0.03, "stone", "#9a9286", "#000");
  else if (kind === "classic") {
    p.box(breastW, ceil, 0.4, 0, ceil / 2, 0.08, th.walls?.default && typeof th.walls.default === "string" ? shade(th.walls.default, -0.04) : "#efe9e0");
    for (const x of [-w / 2 - 0.2, w / 2 + 0.2]) p.box(0.25, 1.15, 0.12, x, 0.575, -0.15, th.mantel);
    p.box(w + 0.8, 0.1, 0.3, 0, 1.2, -0.1, th.mantel);
  } else p.fbox(breastW, ceil, 0.45, 0, ceil / 2, 0.05, "marble", th.fireStone, shade(th.fireStone, -0.2));
  const fbW = kind === "modern" ? w : w * 0.65;
  const fbH = kind === "modern" ? 0.45 : 0.75;
  const fbY = kind === "modern" ? 0.55 : 0.12;
  p.box(fbW, fbH, 0.06, 0, fbY + fbH / 2, -0.2, "#0c0c0e");
  if (kind !== "modern") {
    for (const r of [-0.15, 0.15]) p.cyl(0.12, 0.12, fbW * 0.7, 0, fbY + 0.08, -0.25 + r * 0.2, "#5a3a22", { rz: Math.PI / 2 + r, tess: 8 });
    p.box(w + 0.6, 0.1, 0.55, 0, 0.05, -0.3, kind === "stone" ? "#7a7468" : th.mantel);
  } else {
    p.box(breastW, 0.06, 0.5, 0, fbY - 0.03, -0.27, th.fireStone);
    if (!p.low) p.box(fbW, 0.04, 0.05, 0, fbY + 0.02, -0.22, "#2a2c31");
  }
  const n = kind === "modern" ? Math.round(fbW / 0.22) : 4;
  for (let i = 0; i < n; i += 1) {
    const x = (i - (n - 1) / 2) * (fbW / n) * 0.9;
    const h = (kind === "modern" ? 0.28 : 0.45) * (0.75 + ((i * 37) % 10) / 30);
    flames.push(p.live.cyl(0, 0.16, h, x, fbY + 0.06 + h / 2, -0.23, i % 2 ? "#ff9a2a" : "#ffcf5a", { glow: 1, tess: 6 }));
  }
  if (kind !== "modern" && !p.low) {
    candles(p, -w / 2, 1.25, -0.1);
    vase(p, w / 2, 1.25, -0.1, { flowers: false });
  }
  p.solid(breastW, ceil, 0.55, 0, ceil / 2, 0);
  return flames;
}

export function poolTable(p) {
  const th = p.th;
  for (const x of [-1.0, 1.0]) for (const z of [-0.5, 0.5]) p.box(0.14, 0.62, 0.14, x, 0.31, z, th.woodDark);
  p.box(2.4, 0.18, 1.34, 0, 0.71, 0, th.woodDark);
  p.box(2.2, 0.02, 1.14, 0, 0.81, 0, th.felt);
  for (const [w, d, x, z] of [[2.3, 0.06, 0, -0.6], [2.3, 0.06, 0, 0.6], [0.06, 1.2, -1.13, 0], [0.06, 1.2, 1.13, 0]]) p.box(w, 0.05, d, x, 0.83, z, shade(th.felt, -0.2));
  for (const x of [-1.1, 0, 1.1]) for (const z of [-0.57, 0.57]) p.cyl(0.1, 0.1, 0.03, x, 0.83, z, "#0c0c0e", { tess: 8 });
  if (!p.low) {
    const colors = ["#ffffff", "#ffd23f", "#2b5bd6", "#e23b4a", "#6d597a", "#ff8a1f", "#2f9a4a", "#7a1f2b", "#111216"];
    colors.forEach((hex, i) => p.ball(0.06, i === 0 ? -0.6 : 0.4 + Math.floor((i - 1) / 3) * 0.06, 0.85, i === 0 ? 0 : ((i - 1) % 3) * 0.065 - 0.065, hex, { seg: 6 }));
    p.cyl(0.015, 0.025, 1.4, -0.2, 0.86, 0.3, "#c9a77c", { rz: Math.PI / 2, ry: 0.3, tess: 5 });
  }
  const ceil = p.ctx.ceil ?? 2.8;
  p.cyl(0.01, 0.01, ceil - 1.8, -0.5, (ceil + 1.8) / 2, 0, "#1d1f24", { tess: 3 });
  p.cyl(0.01, 0.01, ceil - 1.8, 0.5, (ceil + 1.8) / 2, 0, "#1d1f24", { tess: 3 });
  p.box(1.5, 0.14, 0.3, 0, 1.75, 0, th.felt === "#2f7a4a" ? "#1d3a2a" : shade(th.felt, -0.4));
  p.box(1.44, 0.01, 0.24, 0, 1.675, 0, "#fff4dc", { glow: 1 });
  p.solid(2.4, 0.85, 1.34, 0, 0.42, 0);
}

export function arcade(p, screenHex = "#59f3ff") {
  const th = p.th;
  p.box(0.7, 1.75, 0.7, 0, 0.875, 0.02, th.arcade);
  p.box(0.72, 0.06, 0.72, 0, 1.78, 0.02, screenHex, { glow: 0.6 });
  p.box(0.6, 0.45, 0.03, 0, 1.35, -0.25, screenHex, { glow: 0.65, rx: 0.2 });
  p.box(0.66, 0.06, 0.32, 0, 0.98, -0.42, "#1d1f24", { rx: -0.15 });
  p.cyl(0.03, 0.03, 0.1, -0.15, 1.05, -0.45, "#1d1f24", { tess: 5 });
  p.ball(0.06, -0.15, 1.1, -0.45, "#e23b4a");
  for (let i = 0; i < 3; i += 1) p.cyl(0.05, 0.05, 0.02, 0.05 + i * 0.08, 1.03, -0.44, ["#ffd23f", "#59c3ff", "#ff4dd8"][i], { glow: 0.6, tess: 8, rx: -0.15 });
  p.box(0.6, 0.15, 0.03, 0, 1.66, -0.33, "#ffffff", { glow: 0.5 });
  p.solid(0.7, 1.8, 0.7, 0, 0.9, 0);
}

/* ------------------------------------------------------------------ outdoor */

export function umbrella(p, x, z, hex) {
  const th = p.th;
  p.cyl(0.4, 0.4, 0.06, x, 0.03, z, "#3a3d44", { tess: 12 });
  p.cyl(0.04, 0.04, 2.3, x, 1.15, z, "#e9e6e1", { tess: 6 });
  p.cyl(0, 2.6, 0.45, x, 2.25, z, hex ?? th.accent, { tess: 8 });
  p.solid(0.12, 2.3, 0.12, x, 1.15, z);
}

export function firePit(p, o = {}) {
  const w = o.w ?? 1.3;
  const d = o.d ?? 0.9;
  const flames = [];
  p.box(w, 0.4, d, 0, 0.2, 0, "#6e7076");
  p.box(w - 0.3, 0.02, d - 0.4, 0, 0.405, 0, "#1d1f24");
  const n = p.low ? 3 : 6;
  for (let i = 0; i < n; i += 1) {
    const x = (i - (n - 1) / 2) * ((w - 0.4) / n);
    flames.push(p.live.cyl(0, 0.15, 0.3, x, 0.56, ((i % 2) - 0.5) * 0.08, i % 2 ? "#ff9a2a" : "#ffcf5a", { glow: 1, tess: 6 }));
  }
  p.solid(w, 0.4, d, 0, 0.2, 0);
  return flames;
}

export function pergola(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 3.6;
  const d = o.d ?? 2.8;
  const hex = o.hex ?? th.woodDark;
  const h = 2.6;
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      p.box(0.12, h, 0.12, x, h / 2, z, hex);
      p.solid(0.14, h, 0.14, x, h / 2, z);
    }
    p.box(0.08, 0.2, d + 0.4, x, h, 0, hex);
  }
  const n = Math.round(w / 0.3);
  for (let i = 0; i <= n; i += p.low ? 2 : 1) p.box(0.05, 0.14, d + 0.6, -w / 2 + (w * i) / n, h + 0.15, 0, hex);
  if (!p.low) for (let i = 0; i < 8; i += 1) p.ball(0.07, -w / 2 + (w * (i + 0.5)) / 8, h - 0.15 - Math.sin((i / 7) * Math.PI) * 0.18, 0, "#ffe7a8", { glow: 1, seg: 4 });
}

export function planter(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 1.0;
  p.box(w, 0.6, w, 0, 0.3, 0, th.planter);
  p.box(w - 0.08, 0.02, w - 0.08, 0, 0.6, 0, "#3a2a1a");
  if (o.tree) {
    p.cyl(0.08, 0.1, 1.4, 0, 1.3, 0, "#6b4a32", { tess: 6 });
    p.ball(1.2, 0, 2.1, 0, th.leaf, { seg: 7 });
    if (!p.low) p.ball(0.8, 0.25, 2.5, 0.1, shade(th.leaf, 0.12), { seg: 6 });
  } else {
    p.ball(w * 0.8, -w * 0.15, 0.85, 0, th.leaf, { seg: 7, sy: 0.7 });
    p.ball(w * 0.6, w * 0.2, 0.85, w * 0.1, shade(th.leaf, 0.12), { seg: 6, sy: 0.7 });
  }
  p.solid(w, 0.6, w, 0, 0.3, 0);
}

export function bbq(p) {
  p.box(0.7, 0.8, 0.55, 0, 0.4, 0, "#2a2c31");
  p.cyl(0.55, 0.55, 0.68, 0, 0.88, 0, "#3a3d44", { rz: Math.PI / 2, arc: 0.5, tess: 14 });
  for (const x of [-0.55, 0.55]) p.box(0.4, 0.04, 0.5, x, 0.8, 0, "#9aa0a8");
  p.box(0.3, 0.03, 0.03, 0, 1.12, -0.22, "#c9ced4");
  p.solid(1.5, 1.0, 0.55, 0, 0.5, 0);
}

export function car(p, o = {}) {
  const paint = o.paint ?? "#c8102e";
  p.box(1.8, 0.55, 4.3, 0, 0.55, 0, paint);
  p.box(1.55, 0.5, 2.1, 0, 1.06, 0.2, paint);
  p.box(1.5, 0.42, 2.0, 0, 1.08, 0.2, "#1d2633", { alpha: 0.85 });
  for (const x of [-0.85, 0.85]) for (const z of [-1.35, 1.35]) p.cyl(0.66, 0.66, 0.26, x, 0.33, z, "#111216", { rz: Math.PI / 2, tess: 14 });
  for (const x of [-0.6, 0.6]) {
    p.box(0.32, 0.12, 0.04, x, 0.66, -2.16, "#fff4dc", { glow: 1 });
    p.box(0.32, 0.1, 0.04, x, 0.68, 2.16, "#e23b4a", { glow: 0.8 });
  }
  p.solid(1.8, 1.35, 4.3, 0, 0.67, 0);
}

export function workbench(p, o = {}) {
  const th = p.th;
  const w = o.w ?? 2.0;
  p.box(w, 0.06, 0.68, 0, 0.9, 0, th.wood);
  for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) for (const z of [-0.28, 0.28]) p.box(0.06, 0.87, 0.06, x, 0.435, z, "#3a3d44");
  p.box(w, 0.04, 0.6, 0, 0.25, 0, "#5a5f66");
  p.box(w, 1.0, 0.03, 0, 1.6, 0.32, "#c9a77c");
  if (!p.low) {
    for (let i = 0; i < 6; i += 1) p.box(0.04, 0.25 + (i % 3) * 0.08, 0.03, -w / 2 + 0.3 + i * 0.28, 1.6, 0.29, ["#e23b4a", "#2a2c31", "#ffd23f"][i % 3]);
    p.box(0.2, 0.12, 0.15, w / 2 - 0.2, 0.99, -0.2, "#3a6bd6");
  }
  p.solid(w, 0.93, 0.68, 0, 0.465, 0);
}

export function treadmill(p) {
  p.box(0.8, 0.16, 1.8, 0, 0.08, 0, "#2a2c31");
  p.box(0.6, 0.012, 1.6, 0, 0.166, 0, "#111216");
  for (const x of [-0.36, 0.36]) p.box(0.05, 1.2, 0.05, x, 0.75, -0.8, "#3a3d44", { rx: 0.15 });
  p.box(0.8, 0.25, 0.12, 0, 1.38, -0.88, "#2a2c31", { rx: -0.4 });
  p.box(0.4, 0.14, 0.01, 0, 1.4, -0.95, "#59f3ff", { glow: 0.7, rx: -0.4 });
  p.solid(0.8, 1.4, 0.2, 0, 0.7, -0.82);
}

export function weights(p) {
  p.box(1.4, 0.04, 0.4, 0, 0.45, 0, "#2a2c31");
  p.box(1.4, 0.04, 0.4, 0, 0.85, 0, "#2a2c31");
  for (const x of [-0.68, 0.68]) p.box(0.04, 0.9, 0.4, x, 0.45, 0, "#3a3d44");
  for (let row = 0; row < 2; row += 1) {
    for (let i = 0; i < 5; i += 1) {
      const x = -0.55 + i * 0.27;
      const y = 0.53 + row * 0.4;
      p.cyl(0.03, 0.03, 0.24, x, y, 0, "#9aa0a8", { rx: Math.PI / 2, tess: 6 });
      for (const z of [-0.12, 0.12]) p.cyl(0.11 + i * 0.012, 0.11 + i * 0.012, 0.05, x, y, z, "#1d1f24", { rx: Math.PI / 2, tess: 8 });
    }
  }
  p.solid(1.4, 0.9, 0.4, 0, 0.45, 0);
}

export function deskCart(p) {
  for (const x of [-0.38, 0.38]) for (const z of [-0.24, 0.24]) {
    p.box(0.03, 0.78, 0.03, x, 0.42, z, "#c9ced4");
    p.ball(0.07, x, 0.035, z, "#2a2c31");
  }
  p.box(0.86, 0.03, 0.56, 0, 0.82, 0, "#ffffff");
  p.box(0.88, 0.25, 0.01, 0, 0.71, -0.285, "#ffffff");
  p.box(0.8, 0.03, 0.5, 0, 0.3, 0, "#c9ced4");
  p.cyl(0.36, 0.36, 0.18, -0.15, 0.92, 0, "#d9dde2", { arc: 0.5, rz: Math.PI / 2, tess: 14 });
  p.cyl(0.4, 0.4, 0.01, -0.15, 0.84, 0, "#c9ced4", { tess: 14 });
  p.cyl(0.06, 0.05, 0.16, 0.25, 0.92, 0.1, "#e8f7ff", { alpha: 0.6, tess: 8 });
  p.cyl(0.06, 0.05, 0.16, 0.3, 0.92, -0.1, "#e8f7ff", { alpha: 0.6, tess: 8 });
  p.ball(0.12, 0.2, 0.9, -0.15, "#ff6fa5", { seg: 6 });
  p.solid(0.9, 0.9, 0.6, 0, 0.45, 0);
}
