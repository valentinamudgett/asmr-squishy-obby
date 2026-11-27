import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector4,
} from "@babylonjs/core";
import { buildFleetCar, CAR_TYPES } from "./cityCars.js";
import { treeMesh } from "./cityTrees.js";

/** One material per color, glow, and see-through amount, shared by every city prop. */
export function createMaterials(scene) {
  const cache = new Map();
  const windows = new Map();
  return {
    get(hex, glow = 0, alpha = 1) {
      const key = `${hex}|${glow}|${alpha}`;
      let material = cache.get(key);
      if (!material) {
        material = new StandardMaterial(`city-${key}`, scene);
        material.diffuseColor = Color3.FromHexString(hex);
        material.emissiveColor = material.diffuseColor.scale(glow);
        material.specularColor = new Color3(0.08, 0.08, 0.08);
        material.fogEnabled = false;
        if (alpha < 1) {
          material.alpha = alpha;
          material.backFaceCulling = false;
        }
        cache.set(key, material);
      }
      return material;
    },
    /** A wall with one window in each tile. Boxes repeat it with their face UVs. */
    windows(id, wall, trim, glass) {
      let material = windows.get(id);
      if (material) return material;
      const texture = new DynamicTexture(`city-win-${id}`, { width: 128, height: 128 }, scene, true);
      const ctx = texture.getContext();
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = trim;
      ctx.fillRect(22, 24, 84, 82);
      ctx.fillStyle = glass;
      ctx.fillRect(28, 30, 72, 70);
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      ctx.fillRect(33, 35, 20, 60);
      ctx.fillStyle = trim;
      ctx.fillRect(62, 30, 4, 70);
      texture.update();
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      material = new StandardMaterial(`city-win-mat-${id}`, scene);
      material.diffuseTexture = texture;
      material.emissiveColor = new Color3(0.14, 0.14, 0.14);
      material.specularColor = new Color3(0.06, 0.06, 0.06);
      material.fogEnabled = false;
      windows.set(id, material);
      return material;
    },
  };
}

/** Shape helpers that place meshes in a parent's frame. `y` is the center of the shape. */
export function createKit(scene, parent, mats) {
  const add = (mesh, x, y, z, hex, o = {}) => {
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    if (o.rx) mesh.rotation.x = o.rx;
    if (o.ry) mesh.rotation.y = o.ry;
    if (o.rz) mesh.rotation.z = o.rz;
    if (o.sx) mesh.scaling.x = o.sx;
    if (o.sy) mesh.scaling.y = o.sy;
    if (o.sz) mesh.scaling.z = o.sz;
    mesh.material = o.material ?? mats.get(hex, o.glow ?? 0, o.alpha ?? 1);
    mesh.isPickable = false;
    return mesh;
  };
  const kit = {
    parent,
    mats,
    box: (w, h, d, x, y, z, hex, o) =>
      add(MeshBuilder.CreateBox("city-box", { width: w, height: h, depth: d }, scene), x, y, z, hex, o),
    cyl: (top, bottom, h, x, y, z, hex, o) =>
      add(
        MeshBuilder.CreateCylinder("city-cyl", { diameterTop: top, diameterBottom: bottom, height: h, tessellation: o?.tess ?? 14 }, scene),
        x, y, z, hex, o,
      ),
    ball: (diameter, x, y, z, hex, o) =>
      add(MeshBuilder.CreateSphere("city-ball", { diameter, segments: o?.seg ?? 10 }, scene), x, y, z, hex, o),
    ring: (diameter, thickness, x, y, z, hex, o) =>
      add(MeshBuilder.CreateTorus("city-ring", { diameter, thickness, tessellation: 24 }, scene), x, y, z, hex, o),
    /** A gable roof along x: `depth` wide at its base, `height` tall, sitting on `baseY`. */
    prism(width, depth, height, baseY, z, hex, o = {}) {
      const r = depth / Math.sqrt(3);
      const sx = height / (1.5 * r);
      const mesh = kit.cyl(r * 2, r * 2, width, o.x ?? 0, baseY + (r / 2) * sx, z, hex, { ...o, tess: 3, rz: Math.PI / 2 });
      mesh.scaling.x = sx;
      return mesh;
    },
    /** A wall of repeating windows, about one tile every `cell` meters. */
    windowBox(w, h, d, x, y, z, material, cell = 3.2) {
      const across = Math.max(1, Math.round(w / cell));
      const deep = Math.max(1, Math.round(d / cell));
      const rows = Math.max(1, Math.round(h / cell));
      const plain = new Vector4(0, 0, 0.04, 0.04);
      const faceUV = [
        new Vector4(0, 0, across, rows),
        new Vector4(0, 0, across, rows),
        new Vector4(0, 0, deep, rows),
        new Vector4(0, 0, deep, rows),
        plain,
        plain,
      ];
      const mesh = MeshBuilder.CreateBox("city-wall", { width: w, height: h, depth: d, faceUV, wrap: true }, scene);
      return add(mesh, x, y, z, null, { material });
    },
    /** A leafy tree. `crown` leans its leaves toward a color. Sizes match the old blob trees. */
    tree(x, z, size = 1, crown = null) {
      return grow("oak", x, z, size * 0.8, crown);
    },
    pine(x, z, size = 1) {
      return grow("pine", x, z, size * 0.65);
    },
    palm(x, z, size = 1) {
      return grow("palm", x, z, size * 0.88, null, 4);
    },
    cherry(x, z, size = 1) {
      return grow("cherry", x, z, size * 0.8);
    },
    plant(x, z, size = 1, leaf = null) {
      return grow("potted", x, z, size * 1.1, leaf, 1);
    },
  };
  const grow = (species, x, z, size, tint = null, variants = 3) => {
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const mesh = treeMesh(scene, species, { variant: Math.floor(h * variants), tint });
    mesh.parent = parent;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = h * Math.PI * 14;
    mesh.scaling.setAll(size);
    return mesh;
  };
  return kit;
}

/** A painted board, readable from both sides. Returns its meshes and what to dispose with it. */
export function createSign(scene, parent, text, width, height, background, ink, glow = 0.6) {
  const texture = new DynamicTexture("city-sign", { width: 512, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 76;
  do {
    ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 470 && size > 20);
  ctx.fillText(text, 256, 68);
  texture.update();
  const material = new StandardMaterial("city-sign-mat", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.emissiveColor = new Color3(glow, glow, glow);
  material.specularColor = Color3.Black();
  material.fogEnabled = false;
  const meshes = [0, Math.PI].map((flip) => {
    const board = MeshBuilder.CreatePlane("city-sign-board", { width, height }, scene);
    board.parent = parent;
    board.rotation.y = flip;
    board.material = material;
    board.isPickable = false;
    board.metadata = { keep: true };
    return board;
  });
  return {
    meshes,
    place(x, y, z, yaw = 0) {
      for (const [index, mesh] of meshes.entries()) {
        mesh.position.set(x, y, z);
        mesh.rotation.y = yaw + index * Math.PI;
      }
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}

/**
 * Bakes every plain mesh under `node` into one mesh per material, under `holder`. A city block
 * or a home is then a handful of draw calls. Sign boards and anything animated stay out of it.
 */
export function mergeByMaterial(node, holder) {
  node.computeWorldMatrix(true);
  const groups = new Map();
  for (const mesh of node.getChildMeshes(false)) {
    if (mesh.metadata?.keep || !(mesh instanceof Mesh) || !mesh.material) continue;
    const list = groups.get(mesh.material) ?? [];
    list.push(mesh);
    groups.set(mesh.material, list);
  }
  const merged = [];
  for (const list of groups.values()) {
    for (const mesh of list) mesh.computeWorldMatrix(true);
    const mesh = Mesh.MergeMeshes(list, true, true, undefined, false, false);
    if (!mesh) continue;
    mesh.parent = holder;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    merged.push(mesh);
  }
  return merged;
}

/**
 * Outside props, in a home lot's frame: the building fills x across ±w/2 and z from 0 to d,
 * with the front yard at negative z. `a` is a kit for props that move.
 */
export const OUTSIDE = {
  planters(k, a, L, s) {
    for (const x of [-L.w * 0.32, -L.w * 0.16, L.w * 0.16, L.w * 0.32]) {
      k.box(1.6, 0.5, 0.7, x, 0.25, -0.6, s.trim);
      k.ball(0.9, x - 0.4, 0.7, -0.6, "#5fbf6a");
      k.ball(0.8, x + 0.4, 0.7, -0.6, "#e98aa0");
    }
  },
  awnings(k, a, L, s) {
    const floors = Math.floor(L.h / 3.2);
    for (let row = 1; row < floors; row += 1) {
      for (const x of [-L.w * 0.3, 0, L.w * 0.3]) {
        k.box(3, 0.08, 1.1, x, row * 3.2 + 0.4, -0.5, row % 2 ? s.accent : s.trim, { rx: -0.35 });
      }
    }
  },
  neon(k, a, L, s) {
    for (let y = 3.2; y < L.h; y += 6.4) k.box(L.w + 0.1, 0.16, 0.12, 0, y, -0.08, y % 12 < 6 ? s.trim : s.window, { glow: 1 });
    for (const x of [-L.w / 2, L.w / 2]) k.box(0.16, L.h, 0.16, x, L.h / 2, -0.06, s.trim, { glow: 1 });
  },
  roofPatio(k, a, L, s) {
    const y = L.h + 0.55;
    k.box(L.w * 0.6, 0.1, L.d * 0.6, 0, y, L.d / 2, "#c9a27a");
    k.cyl(0.08, 0.08, 2.2, -2, y + 1.1, L.d / 2, "#ffffff");
    k.cyl(0, 3.4, 0.8, -2, y + 2.3, L.d / 2, s.accent);
    k.box(1.6, 0.4, 0.8, 2, y + 0.25, L.d / 2, "#ffffff");
    k.plant(4, L.d / 2 + 2, 1.2);
    k.plant(-4.5, L.d / 2 - 2, 1.2);
    for (const x of [-L.w * 0.3, L.w * 0.3]) k.box(0.1, 1, L.d * 0.6, x, y + 0.5, L.d / 2, s.trim);
  },
  carpet(k, a, L) {
    k.box(2.4, 0.04, L.setback - 0.4, 0, 0.06, -L.setback / 2, "#c8102e");
    for (const side of [-1, 1]) {
      for (let z = -1.5; z > -L.setback + 1; z -= 2.2) {
        k.cyl(0.14, 0.14, 0.9, side * 1.6, 0.45, z, "#d4a017", { glow: 0.2 });
        k.ball(0.26, side * 1.6, 0.95, z, "#ffd23f", { glow: 0.4 });
      }
    }
  },
  goldTrim(k, a, L, s) {
    k.box(L.w + 0.8, 0.4, 0.3, 0, L.h - 0.2, -0.2, s.trim, { glow: 0.25 });
    for (const x of [-L.w / 2, L.w / 2]) k.box(0.4, L.h, 0.4, x, L.h / 2, -0.1, s.trim, { glow: 0.2 });
  },
  dome(k, a, L, s) {
    k.ball(Math.min(L.w, L.d) * 0.7, 0, L.h + 0.5, L.d / 2, s.window, { alpha: 0.6, glow: 0.35, sy: 0.6 });
    k.ring(Math.min(L.w, L.d) * 0.72, 0.3, 0, L.h + 0.6, L.d / 2, s.trim, { glow: 0.8 });
  },
  rings(k, a, L, s) {
    const ring = a.ring(Math.max(L.w, L.d) * 1.35, 0.5, 0, L.h * 0.55, L.d / 2, s.trim, { glow: 0.9 });
    ring.rotation.x = 0.25;
    L.animators.push((time) => {
      ring.rotation.y = time * 0.5;
    });
  },
  palms(k, a, L) {
    k.palm(-L.w / 2 - 2.5, -2.5, 1.1);
    k.palm(L.w / 2 + 2.5, -3, 1);
    k.palm(-L.w / 2 + 1, -L.setback + 2.5, 0.9);
    // A row along the street (clear of the path and the parking spot) and a pair beside the house.
    for (const [x, size] of [[-L.w / 2 - 6, 1.05], [L.w * 0.3, 1.1]]) k.palm(x, -L.setback + 1.2, size);
    k.palm(L.w / 2 + 2.2, L.d * 0.5, 1.15);
    k.palm(-L.w / 2 - 2.2, L.d * 0.4, 1);
  },
  waterfall(k, a, L) {
    const x = L.w * 0.35;
    k.box(2.4, L.h * 0.8, 0.12, x, L.h * 0.4, -0.08, "#6fd3ff", { glow: 0.6, alpha: 0.85 });
    k.box(5, 0.1, 2.6, x, 0.06, -1.5, "#3ec6ff", { glow: 0.4 });
    k.box(5.4, 0.3, 0.3, x, 0.15, -2.8, "#8d7f6c");
  },
  stripes(k, a, L, s) {
    for (let x = -L.w / 2 + 1.5; x < L.w / 2; x += 3) {
      if (Math.abs(x) < 2.5) continue;
      k.box(0.9, L.h, 0.1, x, L.h / 2, -0.07, s.accent);
    }
  },
  lollipops(k, a, L) {
    const colors = ["#ff4d8d", "#ffd23f", "#7ee0c3", "#9b8cff"];
    [-L.w * 0.35, -L.w * 0.2, L.w * 0.2, L.w * 0.35].forEach((x, index) => {
      k.cyl(0.14, 0.14, 2.6, x, 1.3, -2.5, "#ffffff");
      k.cyl(1.5, 1.5, 0.22, x, 3.1, -2.5, colors[index], { rx: Math.PI / 2, glow: 0.2 });
      k.ring(1.1, 0.16, x, 3.1, -2.65, "#ffffff", { rx: Math.PI / 2 });
    });
  },
  icicles(k, a, L) {
    k.box(L.w + 0.8, 0.5, L.d + 0.8, 0, L.h + 0.75, L.d / 2, "#ffffff");
    for (let x = -L.w / 2; x <= L.w / 2; x += 1.4) {
      k.cyl(0.32, 0, 1 + ((x * 7) % 3 + 3) % 3 * 0.4, x, L.h - 0.4, -0.25, "#bfe9ff", { alpha: 0.85, glow: 0.3 });
    }
  },
  fence(k, a, L) {
    const z = -L.setback + 0.6;
    for (let x = -L.w / 2 - 3; x <= L.w / 2 + 3; x += 0.6) {
      if (Math.abs(x) < 1.4) continue;
      k.box(0.12, 1, 0.08, x, 0.5, z, "#ffffff");
    }
    for (const side of [-1, 1]) k.box(L.w / 2 + 1.6, 0.1, 0.06, side * (L.w / 4 + 2.2), 0.7, z, "#ffffff");
  },
  flowers(k, a, L) {
    const colors = ["#ff6fa5", "#ffd23f", "#9b8cff", "#ff8a5a"];
    for (const side of [-1, 1]) {
      k.box(L.w * 0.35, 0.12, 1.6, side * L.w * 0.25, 0.08, -2, "#6b4a2e");
      for (let i = 0; i < 8; i += 1) k.ball(0.42, side * (L.w * 0.1 + i * L.w * 0.04), 0.3, -2 + (i % 2) * 0.5 - 0.25, colors[i % 4]);
    }
  },
  barn(k, a, L) {
    const x = L.w / 2 + 6;
    k.box(7, 4.5, 8, x, 2.25, L.d / 2, "#b8382f");
    k.prism(8.4, 7.4, 2.6, 4.5, L.d / 2, "#ffffff", { x, ry: Math.PI / 2 });
    k.box(3, 3, 0.1, x, 1.5, L.d / 2 - 4.05, "#ffffff");
    k.box(0.15, 3.6, 0.12, x, 1.5, L.d / 2 - 4.1, "#b8382f", { rz: 0.78 });
    k.box(0.15, 3.6, 0.12, x, 1.5, L.d / 2 - 4.1, "#b8382f", { rz: -0.78 });
  },
  trampoline(k, a, L) {
    const x = -L.w / 2 - 3.5;
    const z = -L.setback / 2;
    k.cyl(3.2, 3.2, 0.08, x, 0.85, z, "#1b2c3c");
    k.ring(3.3, 0.22, x, 0.88, z, "#3ec6ff");
    for (let i = 0; i < 4; i += 1) {
      const yaw = (i / 4) * Math.PI * 2 + 0.4;
      k.cyl(0.1, 0.1, 0.85, x + Math.sin(yaw) * 1.5, 0.42, z + Math.cos(yaw) * 1.5, "#3a4252");
    }
  },
  hoop(k, a, L) {
    const x = L.w / 2 + 3.5;
    k.cyl(0.18, 0.2, 3.4, x, 1.7, -1, "#3a4252");
    k.box(1.8, 1.2, 0.08, x, 3.6, -1.2, "#ffffff");
    k.ring(0.55, 0.06, x, 3.15, -1.55, "#ff6a2a");
    k.ball(0.32, x - 0.8, 0.16, -2.6, "#ff8a1f");
  },
  sand(k, a, L) {
    k.box(L.w + 8, 0.05, L.setback - 0.8, 0, 0.05, -L.setback / 2, "#f4e2b8");
  },
  surf(k, a, L) {
    ["#ff8a5a", "#3ec6ff", "#ffd23f"].forEach((hex, index) => {
      k.box(0.6, 2.4, 0.1, -L.w * 0.3 + index * 0.75, 1.15, -0.35, hex, { rx: -0.2 });
    });
  },
  ghosts(k, a, L) {
    for (const [x, y, z, phase] of [[-L.w * 0.3, 3, -3, 0], [L.w * 0.35, 4.2, -2, 1.7], [0, L.h + 2, L.d / 2, 3.1]]) {
      const ghost = new TransformNode("city-ghost", a.parent.getScene());
      ghost.parent = a.parent;
      ghost.position.set(x, y, z);
      const ga = createKit(a.parent.getScene(), ghost, a.mats);
      ga.ball(1.1, 0, 0, 0, "#f6f3ff", { glow: 0.45, alpha: 0.9 });
      ga.cyl(1.1, 0.2, 0.9, 0, -0.6, 0, "#f6f3ff", { glow: 0.45, alpha: 0.9 });
      ga.ball(0.16, -0.2, 0.1, -0.5, "#241a33");
      ga.ball(0.16, 0.2, 0.1, -0.5, "#241a33");
      L.animators.push((time) => {
        ghost.position.y = y + Math.sin(time * 1.3 + phase) * 0.35;
        ghost.rotation.y = Math.sin(time * 0.6 + phase) * 0.5;
      });
    }
  },
  pumpkins(k, a, L) {
    for (const x of [-2.2, 2.2, -L.w * 0.35]) {
      k.ball(0.9, x, 0.38, -1.2, "#ff8a1f", { sy: 0.75, glow: 0.15 });
      k.cyl(0.1, 0.12, 0.25, x, 0.8, -1.2, "#3f7a3a");
    }
  },
  glass(k, a, L, s) {
    k.box(L.w * 0.8, L.h * 0.7, 0.1, 0, L.h * 0.45, -0.1, s.window, { alpha: 0.55, glow: 0.25 });
  },
  balcony(k, a, L, s) {
    const y = L.h - 4;
    k.box(L.w + 3, 0.3, 3, 0, y, -1.4, s.trim);
    k.box(L.w + 3, 1, 0.08, 0, y + 0.65, -2.85, s.window, { alpha: 0.5, glow: 0.2 });
    k.box(1.6, 0.5, 0.8, -3, y + 0.4, -1.4, "#ffffff");
    k.plant(4, -1.2, 1);
  },
  roofGarden(k, a, L) {
    k.box(L.w - 1, 0.3, L.d - 1, 0, L.h + 0.65, L.d / 2, "#6cc070");
    k.tree(-L.w * 0.25, L.d * 0.3, 1.1);
    k.tree(L.w * 0.25, L.d * 0.7, 1.2);
    k.tree(L.w * 0.2, L.d * 0.25, 0.9, "#7dcea0");
    k.plant(-L.w * 0.3, L.d * 0.75, 1.3);
  },
  invader(k, a, L, s) {
    const rows = ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"];
    const node = new TransformNode("city-invader", a.parent.getScene());
    node.parent = a.parent;
    node.position.set(0, L.h + 2, L.d / 2);
    const ia = createKit(a.parent.getScene(), node, a.mats);
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "1") ia.box(0.7, 0.7, 0.7, (x - 5) * 0.72, (7 - y) * 0.72, 0, s.accent, { glow: 0.9 });
      });
    });
    L.animators.push((time) => {
      node.rotation.y = Math.sin(time * 0.7) * 0.6;
    });
  },
  telescope(k, a, L) {
    k.cyl(0.5, 0.7, 3.2, 3, L.h + 2.6, L.d / 2 + 2, "#ffffff", { rx: -0.7 });
    k.box(0.2, 1.6, 0.2, 3, L.h + 1.1, L.d / 2 + 2.6, "#3a4252");
  },
  pool(k, a, L) {
    const w = Math.min(L.w * 0.7, 18);
    const d = Math.min(L.setback * 0.45, 9);
    const z = -L.setback * 0.42;
    k.box(w + 1.2, 0.2, d + 1.2, 0, 0.1, z, "#ffffff");
    k.box(w, 0.05, d, 0, 0.22, z, "#3ec6ff", { glow: 0.45 });
    k.box(0.8, 0.12, 2.4, w / 2 - 1, 0.45, z + d / 2 + 0.6, "#ffffff");
    for (const x of [-w / 2 - 2, w / 2 + 2]) {
      k.box(0.9, 0.2, 2, x, 0.3, z, "#ffffff");
      k.cyl(0.06, 0.06, 2, x, 1.1, z + 1.4, "#ffffff");
      k.cyl(0, 2.6, 0.6, x, 2.2, z + 1.4, "#ff8a5a");
    }
    k.palm(-w / 2 - 4.5, z - d / 2 + 0.5, 1.05);
    k.palm(w / 2 + 4.5, z + d / 2 - 0.5, 0.95);
  },
  towers(k, a, L, s) {
    for (const [x, z] of [[-L.w / 2, 0], [L.w / 2, 0], [-L.w / 2, L.d], [L.w / 2, L.d]]) {
      k.cyl(5, 5, L.h + 5, x, (L.h + 5) / 2, z, s.wall);
      k.cyl(0, 6, 4.5, x, L.h + 7.25, z, s.roof);
      k.cyl(0.1, 0.1, 2.4, x, L.h + 10.5, z, "#3a4252");
      k.box(1.4, 0.8, 0.05, x + 0.7, L.h + 11.2, z, "#ffd23f");
    }
    for (let x = -L.w / 2 + 1; x < L.w / 2; x += 2) k.box(1, 1, 1, x, L.h + 0.5, -0.1, s.trim);
  },
  moat(k, a, L) {
    k.box(L.w + 10, 0.06, 4, 0, 0.05, -3, "#3a8fd6", { glow: 0.3 });
    k.box(3.2, 0.25, 4.6, 0, 0.18, -3, "#7a4e2d");
    for (const side of [-1, 1]) k.cyl(0.08, 0.08, 4.4, side * 1.5, 2, -1.6, "#3a4252", { rx: 0.7 });
  },
  chimneys(k, a, L) {
    for (const x of [-L.w * 0.3, L.w * 0.3]) {
      k.box(1.8, 4, 1.8, x, L.h + 2, L.d * 0.6, "#8d7f6c");
      const puffs = [0, 1, 2].map((i) => a.ball(1, x, L.h + 4.5 + i, L.d * 0.6, "#eeeeee", { alpha: 0.7 }));
      L.animators.push((time) => {
        puffs.forEach((puff, i) => {
          const p = (time * 0.35 + i / 3) % 1;
          puff.position.y = L.h + 4.4 + p * 4;
          puff.scaling.setAll(0.6 + p * 1.2);
          puff.visibility = 1 - p;
        });
      });
    }
  },
  hottub(k, a, L) {
    const x = L.w * 0.3;
    const z = -L.setback * 0.45;
    k.cyl(4.2, 4.2, 0.9, x, 0.45, z, "#7a4e2d", { tess: 20 });
    k.cyl(3.6, 3.6, 0.1, x, 0.92, z, "#6fd3ff", { glow: 0.45, tess: 20 });
    const bubbles = [0, 1, 2, 3, 4].map((i) => a.ball(0.3, x, 1, z, "#ffffff", { alpha: 0.8 }));
    L.animators.push((time) => {
      bubbles.forEach((bubble, i) => {
        const p = (time * 0.8 + i / 5) % 1;
        bubble.position.set(x + Math.sin(i * 2.1) * 1.2, 0.95 + p * 0.5, z + Math.cos(i * 2.1) * 1.2);
        bubble.visibility = 1 - p;
      });
    });
  },
  pines(k, a, L) {
    for (const [x, z] of [[-L.w / 2 - 4, -2], [L.w / 2 + 4, -3], [-L.w / 2 - 5, L.d * 0.6], [L.w / 2 + 5, L.d * 0.5], [-L.w * 0.3, -L.setback + 3]]) {
      k.pine(x, z, 1.3);
    }
  },
  gates(k, a, L, s) {
    const z = -L.setback + 1;
    for (const side of [-1, 1]) {
      k.box(1.2, 4, 1.2, side * 4, 2, z, s.trim, { glow: 0.2 });
      k.ball(1.1, side * 4, 4.5, z, "#ffd23f", { glow: 0.5 });
      for (let i = 0; i < 6; i += 1) k.cyl(0.1, 0.1, 3, side * (5 + i * 0.55), 1.5, z, s.trim, { glow: 0.2 });
      k.box(3.4, 0.14, 0.14, side * 6.4, 2.9, z, s.trim, { glow: 0.2 });
    }
  },
  star(k, a, L, s) {
    const star = a.cyl(6, 6, 0.4, 0, L.h + 4, L.d * 0.3, s.trim, { tess: 5, rx: Math.PI / 2, glow: 0.7 });
    L.animators.push((time) => {
      star.rotation.y = time * 0.6;
    });
  },
  bigTrees(k, a, L) {
    for (const [x, z, size] of [[-L.w / 2 - 3, L.d * 0.3, 3], [L.w / 2 + 3, L.d * 0.5, 2.6], [0, L.d + 4, 3.3]]) {
      k.tree(x, z, size, "#5d9e57");
      k.cyl(5, 5, 0.3, x, size * 2.1, z, "#a77a4e");
    }
  },
  bridges(k, a, L) {
    k.box(1.4, 0.12, 6, -L.w / 2 - 1.5, L.h * 0.55, L.d * 0.3, "#c9a27a", { ry: Math.PI / 2 });
    k.box(1.4, 0.12, 6, L.w / 2 + 1.5, L.h * 0.55, L.d * 0.5, "#c9a27a", { ry: Math.PI / 2 });
  },
};

/**
 * Inside props, in a room's frame: floor at y 0, x across ±w/2, z across ±d/2, the door in the
 * wall at -z. `spot` is a free patch of floor for a prop that stands on its own.
 */
export const INSIDE = {
  plants(k, a, R) {
    k.plant(R.w / 2 - 0.7, -R.d / 2 + 0.7, 1.1);
    k.plant(-R.w / 2 + 0.7, -R.d / 2 + 0.7, 0.9, "#7dcea0");
  },
  easel(k, a, R, s, spot) {
    k.box(0.08, 1.8, 0.08, spot.x - 0.4, 0.9, spot.z, "#7a4e2d", { rz: 0.15 });
    k.box(0.08, 1.8, 0.08, spot.x + 0.4, 0.9, spot.z, "#7a4e2d", { rz: -0.15 });
    k.box(1.2, 0.9, 0.05, spot.x, 1.35, spot.z - 0.05, "#ffffff");
    k.ball(0.35, spot.x - 0.2, 1.4, spot.z - 0.09, s.accent, { sz: 0.1 });
    k.ball(0.25, spot.x + 0.25, 1.2, spot.z - 0.09, "#5b8bd6", { sz: 0.1 });
  },
  neon(k, a, R, s) {
    const y = R.h - 0.25;
    k.box(R.w - 0.3, 0.08, 0.06, 0, y, R.d / 2 - 0.15, s.trim, { glow: 1 });
    k.box(R.w - 0.3, 0.08, 0.06, 0, y, -R.d / 2 + 0.15, s.window, { glow: 1 });
    k.box(0.06, 0.08, R.d - 0.3, R.w / 2 - 0.15, y, 0, s.window, { glow: 1 });
    k.box(0.06, 0.08, R.d - 0.3, -R.w / 2 + 0.15, y, 0, s.trim, { glow: 1 });
  },
  gaming(k, a, R, s, spot) {
    k.box(1.8, 0.08, 0.8, spot.x, 0.75, spot.z, "#1b1630");
    k.box(0.1, 0.72, 0.6, spot.x - 0.8, 0.36, spot.z, "#1b1630");
    k.box(0.1, 0.72, 0.6, spot.x + 0.8, 0.36, spot.z, "#1b1630");
    for (const x of [-0.45, 0.45]) {
      k.box(0.8, 0.5, 0.05, spot.x + x, 1.15, spot.z + 0.25, "#59f3ff", { glow: 0.9, ry: x * -0.4 });
    }
    k.box(0.7, 0.1, 0.7, spot.x, 0.5, spot.z - 0.8, s.trim);
    k.box(0.7, 0.9, 0.1, spot.x, 0.95, spot.z - 1.15, s.trim);
  },
  reading(k, a, R, s) {
    const x = R.w / 2 - 0.35;
    const z = -R.d / 2 + 2.2;
    k.box(0.5, 2, 1.6, x, 1, z, "#7a4e2d");
    ["#e23b4a", "#5b8bd6", "#ffd23f", "#3ecf8e", "#9b8cff"].forEach((hex, i) => {
      k.box(0.3, 0.42, 0.18, x - 0.1, 0.5 + Math.floor(i / 3) * 0.6, z - 0.5 + (i % 3) * 0.35, hex);
    });
  },
  chandelier(k, a, R) {
    const y = R.h - 0.9;
    k.ring(1.6, 0.08, 0, y, 0, "#d4a017", { glow: 0.3 });
    for (let i = 0; i < 8; i += 1) {
      const yaw = (i / 8) * Math.PI * 2;
      k.ball(0.22, Math.sin(yaw) * 0.8, y - 0.1, Math.cos(yaw) * 0.8, "#fff6d2", { glow: 1 });
    }
    k.cyl(0.04, 0.04, 0.8, 0, R.h - 0.45, 0, "#d4a017");
  },
  spa(k, a, R, s, spot) {
    k.cyl(2.2, 2.2, 0.6, spot.x, 0.3, spot.z, "#ffffff", { tess: 20 });
    k.cyl(1.9, 1.9, 0.05, spot.x, 0.6, spot.z, "#6fd3ff", { glow: 0.4, tess: 20 });
  },
  stars(k, a, R) {
    for (let i = 0; i < 46; i += 1) {
      const x = (((i * 37) % 100) / 100 - 0.5) * (R.w - 0.6);
      const z = (((i * 61) % 100) / 100 - 0.5) * (R.d - 0.6);
      k.ball(0.09 + (i % 3) * 0.04, x, R.h - 0.06, z, i % 4 ? "#fff6d2" : "#9fd4ff", { glow: 1, seg: 4 });
    }
  },
  pods(k, a, R, s, spot) {
    for (const dx of [-0.8, 0.8]) {
      k.cyl(1.1, 1.1, 2.3, spot.x + dx, 0.6, spot.z, "#e8eef5", { rx: Math.PI / 2 });
      k.box(0.7, 0.06, 1.8, spot.x + dx, 1.05, spot.z, s.window, { glow: 0.6, alpha: 0.7 });
    }
  },
  parrot(k, a, R, s, spot) {
    k.cyl(0.06, 0.06, 1.6, spot.x, 0.8, spot.z, "#7a4e2d");
    k.box(0.7, 0.06, 0.06, spot.x, 1.6, spot.z, "#7a4e2d");
    const bird = a.ball(0.36, spot.x, 1.85, spot.z, "#e23b4a", { sy: 1.4 });
    const beak = a.ball(0.14, 0, 0.12, -0.17, "#ffd23f");
    beak.parent = bird;
    R.animators.push((time) => {
      bird.rotation.y = Math.sin(time * 1.4) * 0.7;
    });
  },
  candy(k, a, R) {
    const colors = ["#ff4d8d", "#7ee0c3", "#ffd23f"];
    colors.forEach((hex, i) => {
      const x = -R.w / 2 + 1 + i * 1.2;
      const z = -R.d / 2 + 0.8;
      k.cyl(0.08, 0.08, 1.6, x, 0.8, z, "#ffffff");
      k.cyl(0.9, 0.9, 0.12, x, 1.75, z, hex, { rx: Math.PI / 2, glow: 0.25 });
    });
  },
  fountain(k, a, R, s, spot) {
    k.cyl(1.4, 1.6, 0.4, spot.x, 0.2, spot.z, "#7a4e2d");
    k.cyl(0.8, 1, 0.4, spot.x, 0.6, spot.z, "#8a5a3b");
    k.cyl(0.3, 0.5, 0.4, spot.x, 1, spot.z, "#a0673f");
    k.ball(0.4, spot.x, 1.3, spot.z, "#5a3a22");
  },
  igloo(k, a, R, s, spot) {
    k.ball(2.4, spot.x, 0, spot.z, "#ffffff", { glow: 0.1 });
    k.box(0.8, 0.9, 0.6, spot.x, 0.45, spot.z - 1.05, "#1d5f8a");
  },
  fireplace(k, a, R) {
    const z = R.d / 2 - 0.4;
    const x = R.w * 0.12;
    k.box(2.2, 1.8, 0.6, x, 0.9, z, "#8d7f6c");
    k.box(1.2, 0.8, 0.2, x, 0.5, z - 0.25, "#241a33");
    const fire = a.cyl(0, 0.7, 0.6, x, 0.45, z - 0.3, "#ff8a1f", { glow: 1 });
    R.animators.push((time) => {
      fire.scaling.y = 0.8 + Math.sin(time * 9) * 0.15 + Math.sin(time * 13) * 0.1;
    });
  },
  surf(k, a, R) {
    ["#ff8a5a", "#3ec6ff"].forEach((hex, i) => {
      k.box(0.55, 2.2, 0.08, -R.w / 2 + 0.25, 1.1, -R.d / 2 + 1.6 + i * 0.7, hex, { ry: Math.PI / 2, rx: 0.12 });
    });
  },
  ghosts(k, a, R) {
    const ghost = a.ball(0.9, 0, 2, 0, "#f6f3ff", { glow: 0.45, alpha: 0.85 });
    R.animators.push((time) => {
      ghost.position.set(Math.sin(time * 0.5) * R.w * 0.3, 2 + Math.sin(time * 1.7) * 0.25, Math.cos(time * 0.5) * R.d * 0.25);
    });
  },
  smart(k, a, R, s) {
    for (const z of [-R.d / 4, 0, R.d / 4]) k.box(R.w - 1, 0.03, 0.12, 0, 0.02, z, s.accent, { glow: 0.9 });
  },
  skyline(k, a, R) {
    const z = R.d / 2 - 0.12;
    k.box(R.w - 1, R.h - 0.6, 0.05, 0, R.h / 2, z, "#7fb8ff", { glow: 0.6 });
    for (let x = -R.w / 2 + 1; x < R.w / 2 - 1; x += 1.1) {
      const h = 0.8 + (((x * 13) % 7) + 7) % 7 * 0.25;
      k.box(0.9, h, 0.04, x, 0.4 + h / 2, z - 0.04, "#2a3a5a", { glow: 0.2 });
    }
  },
  pond(k, a, R, s, spot) {
    k.cyl(2.6, 2.6, 0.06, spot.x, 0.03, spot.z, "#3ec6ff", { glow: 0.4, tess: 20 });
    k.cyl(0.5, 0.5, 0.04, spot.x + 0.5, 0.07, spot.z, "#5fbf6a");
    k.cyl(0.4, 0.4, 0.04, spot.x - 0.6, 0.07, spot.z + 0.4, "#5fbf6a");
  },
  arcade(k, a, R, s) {
    ["#ff4dd8", "#59f3ff", "#ffd23f"].forEach((hex, i) => {
      const x = -R.w / 2 + 1.2 + i * 1.3;
      const z = R.d / 2 - 0.6;
      k.box(1, 2, 0.8, x, 1, z, "#1b1630");
      k.box(0.8, 0.6, 0.05, x, 1.45, z - 0.43, hex, { glow: 0.9 });
      k.box(1, 0.3, 0.3, x, 0.95, z - 0.5, s.trim);
    });
  },
  bowling(k, a, R) {
    const x = R.w / 2 - 1.2;
    k.box(1.2, 0.04, R.d - 2.5, x, 0.03, 0.4, "#d9b48a");
    for (let i = 0; i < 6; i += 1) {
      const row = i < 3 ? 0 : i < 5 ? 1 : 2;
      const col = i < 3 ? i - 1 : i < 5 ? i - 3.5 : 0;
      k.cyl(0.12, 0.16, 0.45, x + col * 0.28, 0.25, R.d / 2 - 1.2 - row * 0.3, "#ffffff");
    }
    k.ball(0.32, x, 0.17, -R.d / 2 + 2.2, "#5b4dff");
  },
  fish(k, a, R) {
    const z = R.d / 2 - 0.6;
    k.box(R.w * 0.7, R.h * 0.7, 0.8, 0, R.h * 0.4, z, "#3ec6ff", { alpha: 0.45, glow: 0.5 });
    const fish = [0, 1, 2, 3, 4].map((i) => a.ball(0.32, 0, 1 + i * 0.3, z, i % 2 ? "#ff8a3d" : "#ffd23f", { glow: 0.3, sz: 0.5 }));
    R.animators.push((time) => {
      fish.forEach((one, i) => {
        one.position.x = Math.sin(time * (0.4 + i * 0.07) + i) * R.w * 0.3;
        one.rotation.y = Math.cos(time * (0.4 + i * 0.07) + i) > 0 ? Math.PI / 2 : -Math.PI / 2;
      });
    });
  },
  telescope(k, a, R, s, spot) {
    k.cyl(0.3, 0.42, 1.8, spot.x, 1.5, spot.z, "#ffffff", { rx: -0.7 });
    for (let i = 0; i < 3; i += 1) {
      const yaw = (i / 3) * Math.PI * 2;
      k.box(0.06, 1.3, 0.06, spot.x + Math.sin(yaw) * 0.3, 0.6, spot.z + Math.cos(yaw) * 0.3, "#3a4252", { rx: Math.cos(yaw) * 0.25, rz: -Math.sin(yaw) * 0.25 });
    }
  },
  pool(k, a, R, s, spot) {
    const w = Math.min(6, R.w * 0.3);
    const d = Math.min(3.6, R.d * 0.25);
    k.box(w + 0.6, 0.1, d + 0.6, spot.x, 0.05, spot.z, "#ffffff");
    k.box(w, 0.04, d, spot.x, 0.11, spot.z, "#3ec6ff", { glow: 0.45 });
  },
  throne(k, a, R, s) {
    const z = R.d / 2 - 1;
    k.box(2, 0.04, R.d * 0.6, 0, 0.03, z - R.d * 0.3, s.accent);
    k.box(1.4, 0.6, 1, 0, 0.6, z, "#d4a017", { glow: 0.2 });
    k.box(1.4, 2.2, 0.2, 0, 1.4, z + 0.45, "#d4a017", { glow: 0.2 });
    k.box(1.1, 0.15, 0.8, 0, 0.95, z - 0.05, s.accent);
  },
  hottub(k, a, R, s, spot) {
    k.cyl(2.4, 2.4, 0.7, spot.x, 0.35, spot.z, "#7a4e2d", { tess: 20 });
    k.cyl(2, 2, 0.05, spot.x, 0.7, spot.z, "#6fd3ff", { glow: 0.45, tess: 20 });
  },
  cinema(k, a, R) {
    const z = R.d / 2 - 0.15;
    k.box(R.w * 0.55, R.h * 0.5, 0.05, 0, R.h * 0.55, z, "#e8f7ff", { glow: 0.85 });
    for (let row = 0; row < 2; row += 1) {
      for (let i = -2; i <= 2; i += 1) k.box(0.8, 0.9, 0.8, i * 1, 0.45, z - 3 - row * 1.4, "#c8102e");
    }
  },
  slide(k, a, R, s, spot) {
    k.box(1.4, 2, 1.4, spot.x + 1.2, 1, spot.z, s.trim);
    k.box(0.9, 0.08, 3.2, spot.x - 0.2, 1.05, spot.z, "#ffd23f", { rz: 0.6, ry: Math.PI / 2 });
  },
};

/** The bed, couch, TV, kitchen, table, rug, and lamps every home has, in the room's colors. */
export function furnish(k, R, s) {
  const hw = R.w / 2;
  const hd = R.d / 2;
  k.box(R.w * 0.4, 0.02, R.d * 0.32, 0, 0.012, -R.d * 0.05, s.accent);
  const bx = -hw + 1.25;
  const bz = hd - 1.35;
  k.box(1.9, 0.35, 2.3, bx, 0.25, bz, s.trim);
  k.box(1.8, 0.22, 2.2, bx, 0.53, bz, "#fffaf2");
  k.box(1.82, 0.12, 1.4, bx, 0.66, bz - 0.4, s.accent);
  k.box(1.3, 0.16, 0.45, bx, 0.72, bz + 0.8, "#ffffff");
  k.box(1.9, 1.1, 0.14, bx, 0.6, hd - 0.12, s.trim);
  k.box(0.5, 0.55, 0.5, bx + 1.35, 0.275, hd - 0.45, s.trim);
  k.cyl(0.05, 0.05, 0.35, bx + 1.35, 0.72, hd - 0.45, "#c9d3df");
  k.cyl(0.25, 0.4, 0.3, bx + 1.35, 1, hd - 0.45, "#fff2c4", { glow: 0.7 });
  const kx = hw - 0.45;
  const run = Math.min(3.4, R.d * 0.45);
  k.box(0.85, 0.95, run, kx, 0.475, hd * 0.25, "#ffffff");
  k.box(0.92, 0.06, run + 0.06, kx, 0.98, hd * 0.25, s.trim);
  k.box(0.5, 0.04, 0.6, kx - 0.05, 1.02, hd * 0.25 - run * 0.25, "#c9d3df");
  k.box(0.8, 1.9, 0.8, kx, 0.95, hd - 0.5, "#e8eef5");
  const cx = -hw + 3.3;
  const cz = -hd * 0.4;
  k.box(0.9, 0.42, 2.2, cx, 0.3, cz, s.accent);
  k.box(0.28, 0.75, 2.2, cx + 0.45, 0.6, cz, s.accent);
  for (const side of [-1, 1]) k.box(0.9, 0.55, 0.22, cx + 0.05, 0.4, cz + side * 1.1, s.accent);
  k.box(0.45, 0.5, 1.6, -hw + 0.32, 0.25, cz, s.trim);
  k.box(0.08, 0.95, 1.7, -hw + 0.24, 1.05, cz, "#1b2c3c");
  k.box(0.02, 0.82, 1.56, -hw + 0.29, 1.05, cz, "#7ec8ff", { glow: 0.85 });
  const tx = hw * 0.45;
  const tz = -hd * 0.45;
  k.cyl(1.2, 1.2, 0.06, tx, 0.75, tz, s.trim);
  k.cyl(0.12, 0.12, 0.72, tx, 0.36, tz, "#7a4e2d");
  for (const side of [-1, 1]) k.box(0.45, 0.45, 0.45, tx + side * 0.95, 0.22, tz, s.accent);
  k.cyl(0.7, 0.7, 0.06, 0, R.h - 0.04, 0, "#fff6d2", { glow: 1 });
  for (const x of [-hw * 0.5, hw * 0.5]) k.box(R.w * 0.18, 1, 0.04, x, R.h * 0.55, hd - 0.1, "#bfe6ff", { glow: 0.55 });
  k.box(0.04, 1, R.d * 0.25, -hw + 0.1, R.h * 0.55, hd * 0.1, "#bfe6ff", { glow: 0.55 });
}

/**
 * A car with a real body, glass, lights, plates, and spinning wheels. Forward is +z and the
 * driver sits on the left. `colors.type` picks the body: the player's "city-car" is an open
 * roadster, other names get a closed sedan, hatchback, or SUV. Cars of one body type share
 * meshes, so a street full of traffic is a handful of draws. `mats` is kept for callers.
 */
export function buildCar(scene, mats, name, colors) {
  let type = colors.type;
  if (!type) {
    const closed = CAR_TYPES.filter((id) => id !== "roadster");
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    type = name === "city-car" ? "roadster" : closed[hash % closed.length];
  }
  return buildFleetCar(scene, name, { paint: colors.paint, type });
}
