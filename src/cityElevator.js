import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { createKit } from "./cityProps.js";
import { t } from "./i18n.js";
import { FOOT_OFFSET } from "./player.js";

/**
 * A home elevator inside a penthouse, mansion, or hotel (cityRooms.js builds one from the layout's
 * `elevator`). The car rides a closed shaft between `stops`; each stop has a landing door on one of
 * the shaft's faces ("x0", "x1", "z0", "z1"), a call button, and a lit floor indicator over the door.
 * Walk in and press E (or tap Ride) to go to the next floor, or press a number key for that floor.
 * Like the prison lift in escape.js, the car only has a floor collider while it's parked, the
 * rider is carried while it moves, and every landing door is shut (with a collider) unless the car
 * is parked behind it with its doors open, so nobody steps into an empty shaft.
 *
 * Everything is in the interior's frame (the `root` node's local space).
 */

const WALL = 0.12;
const CAR_H = 2.45;
const DOOR_H = 2.15;
const GATE_SECONDS = 0.75;

/** Brushed steel, glass, brass and wood, and themed cars. */
const LOOKS = {
  steel: { frame: "#b7bcc2", shaft: "#8f969d", car: "#c9ced3", floor: "#2b2d31", door: "#c6cbd0", trim: "#e4e8eb", ink: "#9fe6ff", panel: "#16181c", glass: "#cfe6f0", carGlass: false, shaftGlass: false },
  glass: { frame: "#e9e4da", shaft: "#e9e4da", car: "#f3f1ec", floor: "#efece6", door: "#f6f4ef", trim: "#d9c9a3", ink: "#ffe7b0", panel: "#1c1a17", glass: "#e6f4fb", carGlass: true, shaftGlass: true },
  brass: { frame: "#b08a3e", shaft: "#5a3a22", car: "#6b4528", floor: "#3a2616", door: "#c9a24a", trim: "#d8b45a", ink: "#ffd27a", panel: "#24160b", glass: "#f3dca8", carGlass: false, shaftGlass: false, wood: true },
  deco: { frame: "#d4af37", shaft: "#16161a", car: "#1c1c22", floor: "#0e0e10", door: "#d4af37", trim: "#f0cf63", ink: "#ffd86a", panel: "#0b0b0d", glass: "#ffe6a0", carGlass: false, shaftGlass: false, wood: false },
  space: { frame: "#e8eef5", shaft: "#c9d3df", car: "#f4f7fb", floor: "#2a2f55", door: "#e8eef5", trim: "#9b8cff", ink: "#59d6ff", panel: "#141833", glass: "#bfe6ff", carGlass: false, shaftGlass: false, portholes: true },
  jungle: { frame: "#8a6a3a", shaft: "#4f6b3a", car: "#a07a48", floor: "#5a4128", door: "#9a7a44", trim: "#6fbf4a", ink: "#b6ff7a", panel: "#1d2414", glass: "#d6f0c0", carGlass: false, shaftGlass: false, wood: true, vines: true },
  candy: { frame: "#ff8fc7", shaft: "#ffd1e8", car: "#fff0f7", floor: "#9fe8d4", door: "#ffb3d9", trim: "#7fe0c8", ink: "#ff5fae", panel: "#3a1028", glass: "#ffe0f0", carGlass: false, shaftGlass: false, stripes: true },
  ice: { frame: "#dff4ff", shaft: "#bfe6ff", car: "#eaf8ff", floor: "#cfeeff", door: "#e6f6ff", trim: "#9fdcff", ink: "#7fd8ff", panel: "#0d2233", glass: "#d8f3ff", carGlass: true, shaftGlass: true },
  garden: { frame: "#3f6b3a", shaft: "#3f6b3a", car: "#f2f0e8", floor: "#6b5a44", door: "#4e7a46", trim: "#a8d08a", ink: "#c8ff9a", panel: "#14200f", glass: "#e3f6dc", carGlass: true, shaftGlass: true, vines: true },
  aquarium: { frame: "#2b6f8f", shaft: "#1d4f6b", car: "#e8f6fb", floor: "#1d4f6b", door: "#3a86a8", trim: "#7fe8ff", ink: "#7fe8ff", panel: "#06202c", glass: "#5fc8e8", carGlass: true, shaftGlass: true, bubbles: true },
  gamer: { frame: "#1a1b22", shaft: "#23242d", car: "#15161c", floor: "#0f1014", door: "#2a2b35", trim: "#ff3fd0", ink: "#3ff0ff", panel: "#08080c", glass: "#3ff0ff", carGlass: false, shaftGlass: false, neon: true },
};

const FAMILY_LOOK = {
  marble: "glass",
  castle: "brass",
  grand: "brass",
  lodge: "brass",
  hollywood: "deco",
  tree: "jungle",
  space: "space",
  jungle: "jungle",
  candy: "candy",
  ice: "ice",
  garden: "garden",
  aquarium: "aquarium",
  gamer: "gamer",
};

/** Which elevator look a home theme family gets. */
export function elevatorLook(fam) {
  return FAMILY_LOOK[fam] ?? "steel";
}

/** Number keys pick a floor while you're in a car. */
let picked = null;
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code ?? "")?.[1] ?? (/^[1-9]$/.test(event.key ?? "") ? event.key : null);
    if (digit) picked = { index: Number(digit) - 1, at: performance.now() };
  });
}

const FACES = {
  x0: { nx: -1, nz: 0 },
  x1: { nx: 1, nz: 0 },
  z0: { nx: 0, nz: -1 },
  z1: { nx: 0, nz: 1 },
};

const ease = (k) => k * k * (3 - 2 * k);

/**
 * Builds the elevator. `spec` is { x0, z0, x1, z1, stops: [{ y, side, label, nameKey }] } with the
 * stops listed bottom to top. `solid(x, y, z, w, h, d)` adds a static collider box to the home's
 * body; `shell` is the home's shell kit (merged later) for the shaft's fixed parts.
 */
export function buildElevator(scene, { root, base, mats, shell, solid, spec, look: lookName = "steel", low = false }) {
  const L = LOOKS[lookName] ?? LOOKS.steel;
  const stops = spec.stops.slice().sort((p, q) => p.y - q.y);
  const { x0, z0, x1, z1 } = spec;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const W = x1 - x0;
  const D = z1 - z0;
  const yb = stops[0].y - 0.35;
  const yt = stops[stops.length - 1].y + CAR_H + 0.3;
  const owned = [];
  const liftNode = new TransformNode("ci-lift", scene);
  liftNode.parent = root;
  owned.push(liftNode);

  const glassMat = mats.get(L.glass, 0.05, L.shaftGlass ? 0.22 : 0.35);
  const carGlassMat = mats.get(L.glass, 0.05, 0.26);

  /** The face's line, its along-axis range, and where (x, z) a point `along` and `out` from it is. */
  const face = (name) => {
    const { nx, nz } = FACES[name];
    const alongX = nz !== 0;
    const line = name === "x0" ? x0 : name === "x1" ? x1 : name === "z0" ? z0 : z1;
    const [a, b] = alongX ? [x0, x1] : [z0, z1];
    const c = (a + b) / 2;
    const at = (along, out) => (alongX ? [along, line + nz * out] : [line + nx * out, along]);
    return { name, nx, nz, alongX, line, a, b, c, len: b - a, at };
  };
  const doorW = Math.min(1.05, Math.min(W, D) * 0.56);

  /* -------- the shaft: four walls with an opening at each stop's landing */
  const faceNames = ["x0", "x1", "z0", "z1"];
  for (const name of faceNames) {
    const f = face(name);
    const openings = stops.filter((s) => s.side === name).map((s) => [s.y, s.y + DOOR_H]);
    const ext = f.alongX ? WALL : 0;
    const p0 = f.a - ext;
    const p1 = f.b + ext;
    const panel = (pa, pb, ya, yb2) => {
      const len = pb - pa;
      const h = yb2 - ya;
      if (len < 0.01 || h < 0.01) return;
      const [px, pz] = f.at((pa + pb) / 2, WALL / 2);
      const [w, d] = f.alongX ? [len, WALL] : [WALL, len];
      solid(px, (ya + yb2) / 2, pz, w, h, d);
      if (L.shaftGlass) shell.box(w * (f.alongX ? 1 : 0.25), h, d * (f.alongX ? 0.25 : 1), px, (ya + yb2) / 2, pz, null, { material: glassMat });
      else shell.box(w, h, d, px, (ya + yb2) / 2, pz, L.shaft);
    };
    if (!openings.length) {
      panel(p0, p1, yb, yt);
    } else {
      const g0 = f.c - doorW / 2;
      const g1 = f.c + doorW / 2;
      panel(p0, g0, yb, yt);
      panel(g1, p1, yb, yt);
      let y = yb;
      for (const [o0, o1] of openings) {
        panel(g0, g1, y, o0);
        y = o1;
      }
      panel(g0, g1, y, yt);
    }
    // Frame: corner posts, and a band at each floor so a glass shaft reads as a structure.
    for (const along of [p0 + 0.04, p1 - 0.04]) {
      const [px, pz] = f.at(along, WALL / 2);
      shell.box(0.08, yt - yb, 0.08, px, (yb + yt) / 2, pz, L.frame);
    }
    if (L.shaftGlass || L.neon) {
      for (const s of stops) {
        for (const y of [s.y - 0.15, s.y + CAR_H + 0.1]) {
          const [px, pz] = f.at(f.c, WALL / 2);
          const [w, d] = f.alongX ? [f.len + WALL * 2, 0.1] : [0.1, f.len];
          shell.box(w, 0.08, d, px, y, pz, L.neon ? L.trim : L.frame, L.neon ? { glow: 0.9 } : undefined);
        }
      }
    }
  }
  // A cap on top and the pit floor below the lowest stop.
  shell.box(W + WALL * 2, 0.14, D + WALL * 2, cx, yt + 0.07, cz, L.frame);
  solid(cx, yt + 0.07, cz, W + WALL * 2, 0.14, D + WALL * 2);
  solid(cx, yb - 0.05, cz, W, 0.1, D);
  shell.box(W, 0.1, D, cx, yb - 0.05, cz, "#2a2b2e");

  /* -------- the floor indicator: one texture shared by every landing and the car */
  const indTex = new DynamicTexture("ci-lift-ind", { width: 256, height: 128 }, scene, false);
  const indMat = new StandardMaterial("ci-lift-ind-mat", scene);
  indMat.diffuseTexture = indTex;
  indMat.emissiveTexture = indTex;
  indMat.emissiveColor = new Color3(1, 1, 1);
  indMat.specularColor = Color3.Black();
  indMat.disableLighting = true;
  owned.push(indMat, indTex);
  let shown = "";
  const drawIndicator = (label, dir) => {
    const key = `${label}|${dir}`;
    if (key === shown) return;
    shown = key;
    const g = indTex.getContext();
    g.fillStyle = L.panel;
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = L.ink;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "900 78px Arial Black, Arial, sans-serif";
    g.fillText(label, 150, 68);
    if (dir) {
      g.beginPath();
      const ay = dir > 0 ? 34 : 94;
      const by = dir > 0 ? 94 : 34;
      g.moveTo(26, by);
      g.lineTo(78, by);
      g.lineTo(52, ay);
      g.closePath();
      g.fill();
    }
    indTex.update();
  };
  const indicator = (parent, x, y, z, ry, w = 0.5) => {
    const plane = MeshBuilder.CreatePlane("ci-lift-ind", { width: w, height: w / 2 }, scene);
    plane.parent = parent;
    plane.position.set(x, y, z);
    plane.rotation.y = ry;
    plane.material = indMat;
    plane.isPickable = false;
    owned.push(plane);
    return plane;
  };

  /* -------- the landings: a surround, the indicator, a call button, a sill, and the doors */
  const callOn = mats.get(L.ink, 1);
  const callOff = mats.get("#3a3d42", 0.05);
  const landings = stops.map((s, index) => {
    const f = face(s.side);
    const out = WALL + 0.02;
    const yawOut = Math.atan2(-f.nx, -f.nz);
    const put = (along, outBy, y, w, h, d, hex, o) => {
      const [px, pz] = f.at(along, outBy);
      const [bw, bd] = f.alongX ? [w, d] : [d, w];
      return shell.box(bw, h, bd, px, y, pz, hex, o);
    };
    // Surround: jambs and head in the trim, a thin reveal, and a sill plate.
    for (const side of [-1, 1]) put(f.c + side * (doorW / 2 + 0.06), out + 0.01, s.y + (DOOR_H + 0.12) / 2, 0.12, DOOR_H + 0.12, 0.05, L.trim);
    put(f.c, out + 0.01, s.y + DOOR_H + 0.09, doorW + 0.24, 0.14, 0.05, L.trim);
    put(f.c, out - 0.02, s.y + 0.006, doorW + 0.1, 0.012, WALL + 0.1, L.frame);
    if (L.wood || lookName === "deco") put(f.c, out + 0.02, s.y + DOOR_H + 0.42, doorW + 0.5, 0.06, 0.07, L.trim);
    const [ix, iz] = f.at(f.c, out + 0.045);
    indicator(liftNode, ix, s.y + DOOR_H + 0.42, iz, yawOut, 0.46);
    // Call button plate beside the door, its button lit while the car is coming.
    const along = f.c + doorW / 2 + 0.26;
    put(along, out + 0.01, s.y + 1.1, 0.12, 0.24, 0.03, L.trim);
    const [bx, bz] = f.at(along, out + 0.035);
    const button = MeshBuilder.CreateCylinder("ci-lift-call", { diameter: 0.06, height: 0.02, tessellation: 12 }, scene);
    button.parent = liftNode;
    button.position.set(bx, s.y + 1.1, bz);
    button.rotation.set(Math.PI / 2, yawOut, 0);
    button.material = callOff;
    button.isPickable = false;
    owned.push(button);
    // Two door leaves that part from the middle and slide into pockets in the shaft wall.
    const leaves = [-1, 1].map((side) => {
      const node = new TransformNode("ci-lift-leaf", scene);
      node.parent = liftNode;
      owned.push(node);
      const leaf = MeshBuilder.CreateBox("ci-lift-door", { width: f.alongX ? doorW / 2 + 0.01 : 0.04, height: DOOR_H, depth: f.alongX ? 0.04 : doorW / 2 + 0.01 }, scene);
      leaf.parent = node;
      leaf.material = L.shaftGlass ? carGlassMat : mats.get(L.door, 0.02);
      leaf.isPickable = false;
      owned.push(leaf);
      if (!low) {
        const edge = MeshBuilder.CreateBox("ci-lift-door-edge", { width: f.alongX ? 0.03 : 0.05, height: DOOR_H, depth: f.alongX ? 0.05 : 0.03 }, scene);
        edge.parent = node;
        const [ex, ez] = f.alongX ? [-side * (doorW / 4 - 0.015), 0] : [0, -side * (doorW / 4 - 0.015)];
        edge.position.set(ex, 0, ez);
        edge.material = mats.get(L.frame, 0.05);
        edge.isPickable = false;
        owned.push(edge);
      }
      return { node, side };
    });
    const gateNode = new TransformNode("ci-lift-gate", scene);
    gateNode.parent = liftNode;
    const [gx, gz] = f.at(f.c, WALL / 2);
    gateNode.position.set(gx, s.y + DOOR_H / 2, gz);
    owned.push(gateNode);
    const [fx, fz] = f.at(f.c, 1.0);
    return { stop: s, index, f, leaves, button, gateNode, gate: null, open: 0, front: { x: fx, z: fz }, out };
  });

  const poseLanding = (land) => {
    const k = ease(land.open);
    for (const { node, side } of land.leaves) {
      const along = land.f.c + side * (doorW / 4 + k * (doorW / 2 - 0.01));
      const [px, pz] = land.f.at(along, WALL / 2);
      node.position.set(px, land.stop.y + DOOR_H / 2, pz);
    }
  };
  const setGate = (land, on) => {
    if (on && !land.gate) {
      liftNode.computeWorldMatrix(true);
      land.gateNode.computeWorldMatrix(true);
      const [w, d] = land.f.alongX ? [doorW + 0.1, 0.16] : [0.16, doorW + 0.1];
      const body = new PhysicsBody(land.gateNode, PhysicsMotionType.STATIC, false, scene);
      body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(w, DOOR_H, d), scene);
      land.gate = body;
    } else if (!on && land.gate) {
      land.gate.shape?.dispose();
      land.gate.dispose();
      land.gate = null;
    }
  };

  /* -------- the car: floor, ceiling light, walls (glass or panels), handrail, and its own doors */
  const car = new TransformNode("ci-lift-car", scene);
  car.parent = liftNode;
  car.position.set(cx, stops[0].y, cz);
  owned.push(car);
  const build = new TransformNode("ci-lift-build", scene);
  const C = createKit(scene, build, mats);
  const iw = W - 0.06;
  const id = D - 0.06;
  C.box(iw, 0.12, id, 0, -0.06, 0, L.floor);
  if (!low) C.box(iw - 0.3, 0.005, id - 0.3, 0, 0.003, 0, L.wood ? "#7a1f24" : lookName === "glass" ? "#d9d2c4" : "#3a3d43");
  C.box(iw, 0.08, id, 0, CAR_H + 0.04, 0, L.car);
  C.box(iw * 0.6, 0.02, id * 0.6, 0, CAR_H - 0.01, 0, "#fff6e0", { glow: 1 });
  const doorSides = new Set(stops.map((s) => s.side));
  const carFace = (name) => {
    const { nx, nz } = FACES[name];
    const alongX = nz !== 0;
    const half = alongX ? id / 2 : iw / 2;
    const len = alongX ? iw : id;
    const at = (along, inBy) => (alongX ? [along, nz * (half - inBy)] : [nx * (half - inBy), along]);
    return { name, nx, nz, alongX, len, at };
  };
  const wallPiece = (cf, along, inBy, y, w, h, thick, hex, o) => {
    const [px, pz] = cf.at(along, inBy);
    const [bw, bd] = cf.alongX ? [w, thick] : [thick, w];
    return C.box(bw, h, bd, px, y, pz, hex, o);
  };
  let panelFace = null;
  for (const name of faceNames) {
    const cf = carFace(name);
    if (doorSides.has(name)) {
      for (const side of [-1, 1]) {
        const w = (cf.len - doorW) / 2;
        wallPiece(cf, side * (doorW / 2 + w / 2), 0.03, CAR_H / 2, w, CAR_H, 0.05, L.car);
      }
      wallPiece(cf, 0, 0.03, DOOR_H + (CAR_H - DOOR_H) / 2, doorW, CAR_H - DOOR_H, 0.05, L.car);
      continue;
    }
    panelFace ??= name;
    if (L.carGlass) {
      wallPiece(cf, 0, 0.03, CAR_H / 2, cf.len - 0.1, CAR_H - 0.1, 0.02, null, { material: carGlassMat });
      for (const side of [-1, 1]) wallPiece(cf, side * (cf.len / 2 - 0.03), 0.03, CAR_H / 2, 0.06, CAR_H, 0.06, L.frame);
      wallPiece(cf, 0, 0.03, 0.05, cf.len, 0.1, 0.06, L.frame);
    } else {
      wallPiece(cf, 0, 0.03, CAR_H / 2, cf.len, CAR_H, 0.05, L.car);
      if (!low) {
        const n = L.wood ? 3 : 2;
        for (let i = 0; i < n; i += 1) {
          const along = -cf.len / 2 + (cf.len * (i + 0.5)) / n;
          wallPiece(cf, along, 0.06, 1.35, cf.len / n - 0.12, 1.9, 0.01, L.wood ? L.frame : L.trim, L.wood ? undefined : { glow: 0.02 });
        }
        if (L.portholes) {
          const [px, pz] = cf.at(0, 0.065);
          C.cyl(0.5, 0.5, 0.02, px, 1.55, pz, "#0d1430", { rx: Math.PI / 2, ry: cf.alongX ? 0 : Math.PI / 2, glow: 0.2 });
          C.ring(0.52, 0.05, px, 1.55, pz, L.trim, { rx: Math.PI / 2, ry: cf.alongX ? 0 : Math.PI / 2 });
        }
        if (L.stripes) for (let i = 0; i < 5; i += 1) wallPiece(cf, -cf.len / 2 + 0.2 + i * ((cf.len - 0.4) / 4), 0.065, 1.2, 0.08, 2.2, 0.01, L.ink);
        if (L.vines) for (let i = 0; i < 5; i += 1) {
          const [px, pz] = cf.at(-cf.len / 2 + 0.2 + i * ((cf.len - 0.4) / 4), 0.09);
          C.ball(0.22, px, CAR_H - 0.15 - (i % 2) * 0.35, pz, "#4f9a3a", { seg: 6 });
        }
      }
    }
    if (L.neon) wallPiece(cf, 0, 0.06, 0.12, cf.len - 0.1, 0.03, 0.01, L.trim, { glow: 1 });
    wallPiece(cf, 0, 0.1, 0.95, cf.len - 0.3, 0.04, 0.04, L.frame);
  }
  if (L.bubbles && !low) for (let i = 0; i < 8; i += 1) C.ball(0.05 + (i % 3) * 0.02, (i / 8 - 0.5) * iw * 0.8, 0.4 + i * 0.25, -id / 2 + 0.05, "#dff8ff", { seg: 5, glow: 0.4, alpha: 0.6 });
  // The floor panel by the main door: a plate with a button per floor, lit for the one you're going to.
  const mainSide = stops[0].side;
  const mf = carFace(mainSide);
  const panelAlong = doorW / 2 + Math.max(0.12, (mf.len - doorW) / 4);
  const [ppx, ppz] = mf.at(panelAlong, 0.07);
  const panelTex = new DynamicTexture("ci-lift-panel", { width: 128, height: 256 }, scene, false);
  const panelMat = new StandardMaterial("ci-lift-panel-mat", scene);
  panelMat.diffuseTexture = panelTex;
  panelMat.emissiveTexture = panelTex;
  panelMat.emissiveColor = new Color3(0.9, 0.9, 0.9);
  panelMat.specularColor = Color3.Black();
  panelMat.disableLighting = true;
  owned.push(panelMat, panelTex);
  const panelPlane = MeshBuilder.CreatePlane("ci-lift-panel", { width: 0.2, height: 0.4 }, scene);
  panelPlane.parent = car;
  panelPlane.position.set(ppx, 1.25, ppz);
  panelPlane.rotation.y = Math.atan2(mf.nx, mf.nz);
  panelPlane.material = panelMat;
  panelPlane.isPickable = false;
  owned.push(panelPlane);
  let panelShown = "";
  const drawPanel = (lit) => {
    const key = String(lit);
    if (key === panelShown) return;
    panelShown = key;
    const g = panelTex.getContext();
    g.fillStyle = L.panel;
    g.fillRect(0, 0, 128, 256);
    g.strokeStyle = L.trim;
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 250);
    const n = stops.length;
    const step = Math.min(70, 220 / n);
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (let i = 0; i < n; i += 1) {
      const y = 128 + ((n - 1) / 2 - i) * step;
      g.beginPath();
      g.arc(64, y, 26, 0, Math.PI * 2);
      g.fillStyle = i === lit ? L.ink : "#3a3d42";
      g.fill();
      g.fillStyle = i === lit ? L.panel : "#e8e8e8";
      g.font = `900 ${stops[i].label.length > 1 ? 22 : 30}px Arial Black, Arial, sans-serif`;
      g.fillText(stops[i].label, 64, y + 1);
    }
    panelTex.update();
  };
  drawPanel(-1);
  // Indicators inside, over each car door.
  for (const name of doorSides) {
    const cf = carFace(name);
    const [px, pz] = cf.at(0, 0.06);
    indicator(car, px, DOOR_H + 0.16, pz, Math.atan2(cf.nx, cf.nz), 0.34);
  }
  // Merge the car's fixed parts by material, then hang them on the car so they ride with it.
  build.computeWorldMatrix(true);
  const groups = new Map();
  for (const mesh of build.getChildMeshes(false)) {
    if (!mesh.material) continue;
    const list = groups.get(mesh.material) ?? [];
    list.push(mesh);
    groups.set(mesh.material, list);
  }
  for (const list of groups.values()) {
    for (const mesh of list) mesh.computeWorldMatrix(true);
    const merged = Mesh.MergeMeshes(list, true, true, undefined, false, false);
    if (!merged) continue;
    merged.parent = car;
    merged.isPickable = false;
    owned.push(merged);
  }
  build.dispose();
  // The car's own doors on each door side, parting with the landing doors.
  const carLeaves = [];
  for (const name of doorSides) {
    const cf = carFace(name);
    for (const side of [-1, 1]) {
      const node = new TransformNode("ci-lift-carleaf", scene);
      node.parent = car;
      owned.push(node);
      const leaf = MeshBuilder.CreateBox("ci-lift-cardoor", { width: cf.alongX ? doorW / 2 : 0.03, height: DOOR_H - 0.02, depth: cf.alongX ? 0.03 : doorW / 2 }, scene);
      leaf.parent = node;
      leaf.material = L.carGlass ? carGlassMat : mats.get(L.door, 0.02);
      leaf.isPickable = false;
      owned.push(leaf);
      carLeaves.push({ node, side, cf, name });
    }
  }
  const poseCarDoors = (name, open) => {
    const k = ease(open);
    for (const leaf of carLeaves) {
      const o = leaf.name === name ? k : 0;
      const along = leaf.side * (doorW / 4 + o * (doorW / 2 - 0.02));
      const [px, pz] = leaf.cf.at(along, 0.03);
      leaf.node.position.set(px, DOOR_H / 2, pz);
    }
  };

  /* -------- the car floor collider, only while parked */
  let floorBody = null;
  const park = () => {
    if (floorBody) return;
    car.computeWorldMatrix(true);
    floorBody = new PhysicsBody(car, PhysicsMotionType.STATIC, false, scene);
    floorBody.shape = new PhysicsShapeBox(new Vector3(0, -0.075, 0), Quaternion.Identity(), new Vector3(W, 0.15, D), scene);
  };
  const unpark = () => {
    if (!floorBody) return;
    floorBody.shape?.dispose();
    floorBody.dispose();
    floorBody = null;
  };

  /* -------- the ride */
  let at = 0;
  let target = null;
  let mode = "parked";
  let time = 0;
  let rideTime = 1;
  let dir = 1;
  let riding = false;
  let ding = false;
  let called = null;
  let rideHeading = 0;
  const from = new Vector3();
  const events = [];

  const local = (foot) => ({ x: foot.x - base.x, y: foot.y - base.y, z: foot.z - base.z });
  const inCar = (p) => p.x > x0 + 0.12 && p.x < x1 - 0.12 && p.z > z0 + 0.12 && p.z < z1 - 0.12 && Math.abs(p.y - car.position.y) < 1.1;
  const atLanding = (p) => landings.find((land) => Math.abs(p.y - land.stop.y) < 1.1 && Math.hypot(p.x - land.front.x, p.z - land.front.z) < 1.5) ?? null;

  const sync = () => {
    const label = stops[mode === "moving" ? nearestStop() : at].label;
    const moving = mode === "closing" || mode === "moving";
    drawIndicator(label, moving && target !== null ? Math.sign(stops[target].y - stops[at].y) : 0);
    drawPanel(target ?? -1);
    for (const land of landings) land.button.material = (target === land.index && !riding) || called === land.index ? callOn : callOff;
  };
  const nearestStop = () => {
    let best = 0;
    for (let i = 1; i < stops.length; i += 1) if (Math.abs(stops[i].y - car.position.y) < Math.abs(stops[best].y - car.position.y)) best = i;
    return best;
  };

  /** Shuts the doors and sends the car to stop `index`. False if it's busy or already there. */
  const go = (index, ride) => {
    if (mode !== "parked" || index === at || index < 0 || index >= stops.length) return false;
    target = index;
    dir = Math.sign(stops[index].y - stops[at].y) || dir;
    mode = "closing";
    time = 0;
    riding = ride;
    const { nx, nz } = FACES[stops[at].side];
    rideHeading = Math.atan2(-nx, -nz);
    setGate(landings[at], true);
    rideTime = Math.max(2.6, 1.6 + Math.abs(stops[index].y - stops[at].y) / 7);
    sync();
    return true;
  };
  const nextIndex = () => {
    let next = at + dir;
    if (next < 0 || next >= stops.length) {
      dir = -dir;
      next = at + dir;
    }
    return next;
  };
  const goingToast = (index) => {
    events.push({
      type: "toast",
      text: t("toast.elevatorGoing").replace("{floor}", t(stops[index].nameKey)),
      time: 1.6,
      next: stops.length > 2 ? t("toast.elevatorPick").replace("{n}", String(stops.length)) : null,
    });
  };

  // Start parked at the floor you come in on, doors open; every other landing shut.
  const startAt = Math.max(0, stops.findIndex((s) => s.start));
  at = startAt;
  car.position.y = stops[at].y;
  for (const land of landings) {
    land.open = land.index === at ? 1 : 0;
    poseLanding(land);
    setGate(land, land.index !== at);
  }
  poseCarDoors(stops[at].side, 1);
  park();
  sync();

  return {
    stops,
    /** "elevatorRide" standing in the parked car, "elevatorCall" at a landing it isn't open at. */
    action(foot) {
      const p = local(foot);
      if (mode === "parked" && inCar(p)) return "elevatorRide";
      const land = atLanding(p);
      if (land && !(mode === "parked" && at === land.index) && target !== land.index && called !== land.index && !inCar(p)) return "elevatorCall";
      return null;
    },
    /** E or the Ride/Call button. Returns a toast, or null if nothing happened. */
    press(foot) {
      const p = local(foot);
      if (mode === "parked" && inCar(p)) {
        const next = nextIndex();
        from.set(foot.x, foot.y + FOOT_OFFSET, foot.z);
        if (!go(next, true)) return null;
        return {
          toast: t("toast.elevatorGoing").replace("{floor}", t(stops[next].nameKey)),
          next: stops.length > 2 ? t("toast.elevatorPick").replace("{n}", String(stops.length)) : null,
        };
      }
      const land = atLanding(p);
      if (!land || (mode === "parked" && at === land.index)) return null;
      if (mode !== "parked") called = land.index;
      else go(land.index, false);
      sync();
      return { toast: t("toast.elevatorCalled") };
    },
    get riding() {
      return riding;
    },
    /** While you ride, where to hold the capsule center (world space), and a close-in camera. */
    ride() {
      if (!riding) return null;
      const center = new Vector3(base.x + cx, base.y + car.position.y + FOOT_OFFSET + 0.02, base.z + cz);
      if (mode === "closing") {
        const k = ease(Math.min(1, time / GATE_SECONDS));
        center.set(from.x + (center.x - from.x) * k, from.y + (center.y - from.y) * k, from.z + (center.z - from.z) * k);
      }
      return { position: center, heading: rideHeading, camera: { lift: 0.25, back: -6.4 } };
    },
    /** Moves the car and doors. Returns events: { type: "ding" } and toasts. */
    update(dt, foot) {
      events.length = 0;
      if (picked !== null) {
        const want = picked.index;
        const fresh = performance.now() - picked.at < 400;
        picked = null;
        if (fresh && foot && mode === "parked" && want < stops.length && want !== at && inCar(local(foot))) {
          from.set(foot.x, foot.y + FOOT_OFFSET, foot.z);
          if (go(want, true)) goingToast(want);
        }
      }
      if (mode !== "parked") {
        time += dt;
        if (mode === "closing") {
          landings[at].open = Math.max(0, 1 - time / GATE_SECONDS);
          poseLanding(landings[at]);
          poseCarDoors(stops[at].side, landings[at].open);
          if (time >= GATE_SECONDS) {
            mode = "moving";
            time = 0;
            unpark();
          }
        } else if (mode === "moving") {
          const k = ease(Math.min(1, time / rideTime));
          car.position.y = stops[at].y + (stops[target].y - stops[at].y) * k;
          if (time >= rideTime) {
            at = target;
            target = null;
            car.position.y = stops[at].y;
            mode = "opening";
            time = 0;
            ding = true;
            park();
          }
        } else {
          landings[at].open = Math.min(1, time / GATE_SECONDS);
          poseLanding(landings[at]);
          poseCarDoors(stops[at].side, landings[at].open);
          if (time >= GATE_SECONDS) {
            mode = "parked";
            setGate(landings[at], false);
            if (riding) events.push({ type: "toast", text: `🛗 ${t(stops[at].nameKey)}`, time: 1.4, next: null });
            riding = false;
          }
        }
        sync();
      } else if (called !== null) {
        const index = called;
        called = null;
        if (index !== at && !(foot && inCar(local(foot)))) go(index, false);
      }
      if (ding) {
        ding = false;
        events.push({ type: "ding" });
      }
      return events;
    },
    dispose() {
      unpark();
      for (const land of landings) setGate(land, false);
      for (const item of owned.reverse()) item.dispose();
    },
  };
}
