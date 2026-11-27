import { Color3, Vector3 } from "@babylonjs/core";
import { createShape, vertexColorMaterial } from "./cityMesh.js";
import { mulberry32 } from "./geometry.js";

/**
 * City people: grown-up proportions, real clothes, and a walk cycle. Each body part is one mesh
 * drawn with thin instances, so every pedestrian, driver, and customer together is about twenty
 * draws. Bones are posed each frame with plain matrix math straight into the instance buffers.
 * Separate from the player's avatar on purpose: these are city extras only.
 */

const SKIN = ["#f6d7c3", "#efc6a8", "#e0b08a", "#c99066", "#b0774d", "#8d5a38", "#6e4429", "#523020"];
const HAIR = ["#1c1714", "#2a1d15", "#3b2618", "#5e3b22", "#7a3a1e", "#a0612f", "#c9a25a", "#e0c78c", "#9a9590", "#d8d4cc"];
const TOPS = ["#f2f2ee", "#26324f", "#b8323a", "#3f6e4a", "#d2a23a", "#7fb2dd", "#222226", "#e48aa6", "#8c8f96", "#2e8a8a", "#cdb89a", "#6e4d8f", "#e8d27a", "#ff8a5a"];
const JACKETS = ["#4a6a96", "#1f1e22", "#a67c52", "#5d6440", "#8e2b2e", "#5a5e66", "#2c3e5c", "#c8b79a"];
const PANTS = ["#3d5277", "#2a3550", "#232326", "#b8a47c", "#6c6f75", "#6a4a33", "#e8e6df", "#4b5a3a"];
const SKIRTS = ["#2b2b33", "#2e3a66", "#a33a3a", "#d69a4b", "#6b4d7d", "#3f6e4a", "#e0a0b4"];
const SHOES = ["#f0f0ec", "#1e1e20", "#5a3a24", "#b03030", "#77797e", "#2f4a7a", "#c9b28f"];
const BAGS = ["#5a3a24", "#1e1e20", "#a33a3a", "#c9a27a", "#2f4a7a", "#6b4d7d"];
const HAIRDOS = ["short", "short", "buzz", "long", "long", "bun", "pony", "curly"];

/** Joint heights for a 1.71 m adult. Every person scales this a little. */
const HIP_Y = 0.9;
const HIP_X = 0.092;
const THIGH = 0.405;
const SHIN = 0.41;
const WAIST_Y = 0.98;
const SHOULDER = [0.195, 0.41];
const NECK_Y = 0.445;
const UPPER = 0.285;
const FORE = 0.25;

const PARTS = {
  thigh: 2, shin: 2, shoe: 2, pelvis: 1, shirt: 1, blouse: 1, jacket: 1, head: 1,
  hairShort: 1, hairLong: 1, hairBun: 1, hairPony: 1, hairCurly: 1, hairBuzz: 1,
  upperArm: 2, forearm: 2, hand: 2, skirt: 1, bag: 1, backpack: 1, phone: 1,
};
const HAIR_PART = { short: "hairShort", long: "hairLong", bun: "hairBun", pony: "hairPony", curly: "hairCurly", buzz: "hairBuzz" };

export function createPeople(scene, parent, { max = 48, detail = 1 } = {}) {
  const material = vertexColorMaterial(scene, "city-people", { specular: 0.05, power: 16 });
  // A little bounce light, so people with the sun behind them keep their clothes' colors.
  material.emissiveColor = new Color3(0.2, 0.19, 0.19);
  const built = buildParts(detail);
  const sources = {};
  for (const [name, per] of Object.entries(PARTS)) {
    const mesh = built[name].mesh(`city-person-${name}`, scene, material);
    mesh.parent = parent;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = false;
    const capacity = max * per;
    const matrices = new Float32Array(capacity * 16);
    const colors = new Float32Array(capacity * 4);
    mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
    mesh.thinInstanceSetBuffer("color", colors, 4, false);
    sources[name] = { mesh, matrices, colors, count: 0, capacity };
  }
  const people = [];
  const m = Array.from({ length: 20 }, () => new Float32Array(16));
  const rot = new Float32Array(9);

  const emit = (name, matrix, color) => {
    const source = sources[name];
    if (source.count >= source.capacity) return;
    source.matrices.set(matrix, source.count * 16);
    source.colors.set(color, source.count * 4);
    source.count += 1;
  };

  /** out = R(ax, ay, az) then a move by (tx, ty, tz), in the frame of `parent`. */
  const joint = (out, parentM, ax, ay, az, tx, ty, tz) => {
    rotation(rot, ax, ay, az);
    const p = parentM;
    for (let i = 0; i < 3; i += 1) {
      const a = rot[i * 3];
      const b = rot[i * 3 + 1];
      const c = rot[i * 3 + 2];
      out[i * 4] = a * p[0] + b * p[4] + c * p[8];
      out[i * 4 + 1] = a * p[1] + b * p[5] + c * p[9];
      out[i * 4 + 2] = a * p[2] + b * p[6] + c * p[10];
      out[i * 4 + 3] = 0;
    }
    out[12] = tx * p[0] + ty * p[4] + tz * p[8] + p[12];
    out[13] = tx * p[1] + ty * p[5] + tz * p[9] + p[13];
    out[14] = tx * p[2] + ty * p[6] + tz * p[10] + p[14];
    out[15] = 1;
  };

  function pose(person, rootM) {
    const P = person.pose;
    const L = person.look;
    const [root, torso, neck, sl, sr, el, er, wl, wr, hl, hr, kl, kr, al, ar, waist] = m;
    root.set(rootM);
    // Legs.
    joint(hl, root, -P.thighL, 0, -0.02, -HIP_X, HIP_Y, 0);
    joint(hr, root, -P.thighR, 0, 0.02, HIP_X, HIP_Y, 0);
    joint(kl, hl, P.kneeL, 0, 0, 0, -THIGH, 0);
    joint(kr, hr, P.kneeR, 0, 0, 0, -THIGH, 0);
    joint(al, kl, P.ankleL, 0, 0, 0, -SHIN, 0);
    joint(ar, kr, P.ankleR, 0, 0, 0, -SHIN, 0);
    const legColor = L.skirt ? L.skin : L.pants;
    const shinColor = L.skirt || L.shorts ? L.skin : L.pants;
    emit("thigh", hl, legColor);
    emit("thigh", hr, legColor);
    emit("shin", kl, shinColor);
    emit("shin", kr, shinColor);
    emit("shoe", al, L.shoes);
    emit("shoe", ar, L.shoes);
    emit("pelvis", root, L.skirt ?? L.pants);
    if (L.skirt) emit("skirt", root, L.skirt);
    // Body, head, and hair.
    joint(waist, root, P.lean, P.twist, P.sway, 0, WAIST_Y, 0);
    torso.set(waist);
    emit(L.torso, torso, L.top);
    joint(neck, torso, P.nod, P.look, 0, 0, NECK_Y, 0);
    emit("head", neck, L.skin);
    emit(HAIR_PART[L.hair], neck, L.hairColor);
    if (L.bag) emit(L.bag, torso, L.bagColor);
    // Arms.
    joint(sl, torso, P.armL, 0, -P.spreadL, -SHOULDER[0], SHOULDER[1], 0);
    joint(sr, torso, P.armR, 0, P.spreadR, SHOULDER[0], SHOULDER[1], 0);
    joint(el, sl, P.elbowL, 0, 0, 0, -UPPER, 0);
    joint(er, sr, P.elbowR, P.elbowYawR, P.waveR, 0, -UPPER, 0);
    joint(wl, el, 0, 0, 0, 0, -FORE, 0);
    joint(wr, er, P.wristR, 0, 0, 0, -FORE, 0);
    const fore = L.shortSleeves ? L.skin : L.top;
    emit("upperArm", sl, L.top);
    emit("upperArm", sr, L.top);
    emit("forearm", el, fore);
    emit("forearm", er, fore);
    emit("hand", wl, L.skin);
    emit("hand", wr, L.skin);
    if (L.phone) emit("phone", wr, WHITE);
  }

  /** Sets the pose fields for walking at `speed` (m/s), standing, sitting, or waving. */
  function animate(person, dt, time) {
    const P = person.pose;
    const L = person.look;
    const mode = person.mode;
    if (mode === "seated") {
      Object.assign(P, SEATED);
      P.twist = Math.sin(time * 0.4 + person.seed) * 0.06;
      P.look = Math.sin(time * 0.3 + person.seed * 2) * 0.25;
      return 0;
    }
    const speed = mode === "walk" ? person.speed : 0;
    const gait = Math.min(1, speed / 1.3);
    person.phase += (speed * dt * Math.PI * 2) / (1.32 * person.h);
    const f = person.phase;
    const s = Math.sin(f);
    const c = Math.cos(f);
    const amp = 0.4 * gait;
    P.thighL = amp * s;
    P.thighR = -amp * s;
    P.kneeL = 0.06 + gait * 0.78 * Math.max(0, Math.cos(f + 0.35)) ** 1.6;
    P.kneeR = 0.06 + gait * 0.78 * Math.max(0, Math.cos(f + Math.PI + 0.35)) ** 1.6;
    P.ankleL = -(P.kneeL - P.thighL) * 0.75 + 0.1 * gait * Math.max(0, -s);
    P.ankleR = -(P.kneeR - P.thighR) * 0.75 + 0.1 * gait * Math.max(0, s);
    P.lean = 0.03 + gait * 0.04;
    P.twist = gait * 0.07 * s;
    P.sway = gait * 0.015 * c;
    P.nod = L.phone ? 0.32 : 0.02 + Math.sin(time * 0.7 + person.seed) * 0.03;
    P.look = -P.twist * 0.8 + (L.phone ? 0 : Math.sin(time * 0.25 + person.seed * 3) * 0.18 * (1 - gait * 0.5));
    const swing = gait * 0.32;
    P.armL = -swing * -s;
    P.armR = -swing * s;
    P.spreadL = 0.09;
    P.spreadR = 0.09;
    P.elbowL = -(0.22 + gait * 0.25 * Math.max(0, s));
    P.elbowR = -(0.22 + gait * 0.25 * Math.max(0, -s));
    P.elbowYawR = 0;
    P.waveR = 0;
    P.wristR = 0;
    if (L.phone) {
      P.armR = -0.38;
      P.spreadR = 0.05;
      P.elbowR = -1.45;
      P.elbowYawR = 0.45;
      P.wristR = 0.25;
    }
    if (mode === "wave") {
      const w = Math.sin(time * 7 + person.seed);
      P.armR = -0.2;
      P.spreadR = 2.5;
      P.elbowR = -0.35;
      P.elbowYawR = 0;
      P.waveR = 0.35 * w;
      P.look = 0;
      P.nod = -0.05;
    }
    if (speed === 0) {
      const breathe = Math.sin(time * 1.6 + person.seed) * 0.012;
      P.lean = 0.01 + breathe;
      const shift = Math.sin(time * 0.35 + person.seed) * 0.03;
      P.thighL = shift;
      P.thighR = -shift;
      P.kneeL = 0.04;
      P.kneeR = 0.04;
      P.ankleL = -0.04 - shift;
      P.ankleR = -0.04 + shift;
    }
    return 0.018 * gait * Math.cos(f * 2);
  }

  const rootM = new Float32Array(16);
  const seatM = new Float32Array(16);

  return {
    sources: Object.values(sources).map((source) => source.mesh),
    /** A new person with a random look. `state` fills in where they are and what they do. */
    add(seed, state = {}) {
      const person = {
        seed,
        look: randomLook(seed),
        pose: { ...SEATED },
        mode: "walk",
        x: 0,
        z: 0,
        yaw: 0,
        speed: 1.2,
        phase: (seed * 1.7) % (Math.PI * 2),
        visible: true,
        car: null,
        ...state,
      };
      const r = mulberry32(seed * 31 + 7);
      person.h = state.h ?? 0.93 + r() * 0.13;
      person.w = state.w ?? 0.92 + r() * 0.18;
      if (person.look.phone) person.speed *= 0.8;
      people.push(person);
      return person;
    },
    people,
    /** Poses everyone near the camera and fills the instance buffers. `view` is { x, z, fx, fz, far }. */
    update(dt, time, view) {
      for (const source of Object.values(sources)) source.count = 0;
      for (const person of people) {
        if (!person.visible) continue;
        let px = person.x;
        let pz = person.z;
        if (person.car) {
          const w = person.car.getWorldMatrix();
          px = w.m[12] - view.ox;
          pz = w.m[14] - view.oz;
        }
        const dx = px - view.x;
        const dz = pz - view.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > view.far * view.far) continue;
        if (d2 > 144 && dx * view.fx + dz * view.fz < -0.25 * Math.sqrt(d2)) continue;
        const bob = animate(person, dt, time);
        if (person.car) {
          const w = person.car.getWorldMatrix().m;
          placeRoot(seatM, person.seat.x, person.seat.y + 0.06 - HIP_Y * person.h, person.seat.z, 0, person.w, person.h);
          multiply(rootM, seatM, w);
          rootM[12] -= view.ox;
          rootM[13] -= view.oy;
          rootM[14] -= view.oz;
        } else {
          placeRoot(rootM, person.x, (person.y ?? 0) + bob, person.z, person.yaw, person.w, person.h);
        }
        pose(person, rootM);
      }
      for (const source of Object.values(sources)) {
        source.mesh.thinInstanceCount = source.count;
        source.mesh.isVisible = source.count > 0;
        if (source.count > 0) {
          source.mesh.thinInstanceBufferUpdated("matrix");
          source.mesh.thinInstanceBufferUpdated("color");
        }
      }
    },
  };
}

const WHITE = new Float32Array([1, 1, 1, 1]);
const SEATED = {
  thighL: 1.45, thighR: 1.45, kneeL: 1.4, kneeR: 1.4, ankleL: 0.1, ankleR: 0.1,
  lean: -0.1, twist: 0, sway: 0, nod: 0.02, look: 0,
  armL: -0.85, armR: -0.85, spreadL: 0.12, spreadR: 0.12, elbowL: -0.75, elbowR: -0.75, elbowYawR: 0, waveR: 0, wristR: 0,
};

function color4(hex) {
  const c = Color3.FromHexString(hex);
  return new Float32Array([c.r, c.g, c.b, 1]);
}

function randomLook(seed) {
  const r = mulberry32(seed * 7919 + 13);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const feminine = r() < 0.5;
  const jacket = r() < 0.32;
  const skirt = feminine && !jacket && r() < 0.45 ? color4(pick(SKIRTS)) : null;
  const hair = feminine ? pick(["long", "long", "bun", "pony", "curly", "short"]) : pick(["short", "short", "buzz", "curly", "short", "pony"]);
  const roll = r();
  return {
    torso: jacket ? "jacket" : feminine ? "blouse" : "shirt",
    skin: color4(pick(SKIN)),
    hairColor: color4(r() < 0.12 ? "#9a9590" : pick(HAIR.slice(0, 8))),
    hair,
    top: color4(jacket ? pick(JACKETS) : pick(TOPS)),
    shortSleeves: !jacket && r() < 0.5,
    pants: color4(pick(PANTS)),
    shorts: !skirt && r() < 0.14,
    skirt,
    shoes: color4(pick(SHOES)),
    bag: roll < 0.22 ? "bag" : roll < 0.36 ? "backpack" : null,
    bagColor: color4(pick(BAGS)),
    phone: r() < 0.18,
  };
}

/** Root bone: scale (girth w, height h), a yaw, then a position. */
function placeRoot(out, x, y, z, yaw, w, h) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out[0] = c * w;
  out[1] = 0;
  out[2] = -s * w;
  out[3] = 0;
  out[4] = 0;
  out[5] = h;
  out[6] = 0;
  out[7] = 0;
  out[8] = s * w;
  out[9] = 0;
  out[10] = c * w;
  out[11] = 0;
  out[12] = x;
  out[13] = y;
  out[14] = z;
  out[15] = 1;
}

function multiply(out, a, b) {
  for (let i = 0; i < 4; i += 1) {
    const a0 = a[i * 4];
    const a1 = a[i * 4 + 1];
    const a2 = a[i * 4 + 2];
    const a3 = a[i * 4 + 3];
    out[i * 4] = a0 * b[0] + a1 * b[4] + a2 * b[8] + a3 * b[12];
    out[i * 4 + 1] = a0 * b[1] + a1 * b[5] + a2 * b[9] + a3 * b[13];
    out[i * 4 + 2] = a0 * b[2] + a1 * b[6] + a2 * b[10] + a3 * b[14];
    out[i * 4 + 3] = a0 * b[3] + a1 * b[7] + a2 * b[11] + a3 * b[15];
  }
}

/** Rows of Rx(ax) then Ry(ay) then Rz(az), for row vectors like Babylon's matrices. */
function rotation(out, ax, ay, az) {
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const rows = [cy, 0, -sy, sx * sy, cx, sx * cy, cx * sy, -sx, cx * cy];
  for (let i = 0; i < 3; i += 1) {
    const a = rows[i * 3];
    const b = rows[i * 3 + 1];
    out[i * 3] = a * cz - b * sz;
    out[i * 3 + 1] = a * sz + b * cz;
    out[i * 3 + 2] = rows[i * 3 + 2];
  }
}

/** Every body part, each in its own joint's frame: hanging down -y, facing +z. White is tinted. */
function buildParts(detail) {
  const seg = detail > 0 ? 10 : 6;
  const tess = detail > 0 ? 10 : 6;
  const W = [1, 1, 1];
  const shade = (k) => [k, k, k];
  const parts = {};

  const limb = (length, top, bottom, bulge = 0, at = 0.3, joint = bottom) => {
    const s = createShape();
    const pts = [];
    const radii = [];
    for (let k = 0; k <= 6; k += 1) {
      const f = k / 6;
      pts.push([0, -length * f, bulge * 0.15 * Math.sin(f * Math.PI)]);
      radii.push((top + (bottom - top) * f) / 2 + bulge * Math.exp(-(((f - at) / 0.22) ** 2)));
    }
    s.tube(pts, radii, W, { tess });
    // The top joint ball is a little smaller than the bottom one, so where a limb tucks into the
    // one above, the two balls never share a surface and flicker.
    s.ball(top * 0.92, top * 0.86, top * 0.92, W, { seg });
    s.ball(joint, joint * 0.92, joint, W, { y: -length, seg });
    return s;
  };
  // Knees and elbows are a little fuller than the limb below, which leaves them at a steep angle
  // instead of grazing out and leaving a jagged seam.
  parts.thigh = limb(THIGH, 0.165, 0.11, 0.008, 0.25, 0.116);
  parts.shin = limb(SHIN, 0.09, 0.072, 0.012, 0.25);
  parts.upperArm = limb(UPPER, 0.098, 0.078, 0.004, 0.3, 0.086);
  parts.forearm = limb(FORE, 0.064, 0.056, 0.006, 0.2);

  parts.shoe = createShape()
    .ball(0.098, 0.085, 0.26, W, { y: -0.04, z: 0.055, seg })
    .box(0.1, 0.022, 0.27, shade(0.45), { y: -0.075, z: 0.055 })
    .ball(0.06, 0.05, 0.05, shade(0.85), { y: -0.005, z: 0.12, seg: 6 });

  parts.hand = createShape()
    .ball(0.05, 0.09, 0.085, W, { y: -0.062, seg })
    .ball(0.045, 0.05, 0.07, W, { y: -0.112, z: 0.005, seg: 6 })
    .ball(0.028, 0.055, 0.03, W, { y: -0.05, z: 0.04, rx: 0.4, seg: 6 });

  parts.pelvis = createShape()
    .ball(0.33, 0.24, 0.215, (x, y) => (y > WAIST_Y - 0.03 ? shade(0.55) : W), { y: 0.93, seg })
    .cyl(0.326, 0.332, 0.04, shade(0.55), { y: WAIST_Y - 0.01, sz: 0.66, tess: 12 });

  parts.skirt = createShape()
    .cyl(0.32, 0.52, 0.44, (x, y) => (y < 0.56 ? shade(0.82) : W), { y: 0.77, sz: 0.75, tess: 16 })
    .cyl(0.34, 0.34, 0.05, shade(0.7), { y: 0.97, sz: 0.76, tess: 14 });

  const torso = (sections, { collar = 0.55, jacket = false } = {}) => {
    const s = createShape();
    const around = 14;
    const paths = sections.map(([y, w, d, dz = 0], index) => {
      // A jacket hangs over the trousers; a shirt tucks well inside them.
      if (index === 0) {
        w *= jacket ? 1.08 : 0.86;
        d *= jacket ? 1.1 : 0.86;
      }
      const ring = [];
      for (let k = 0; k < around; k += 1) {
        const a = (k / around) * Math.PI * 2;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        ring.push(new Vector3(Math.sign(c) * Math.abs(c) ** 0.8 * (w / 2), y, dz + Math.sign(sn) * Math.abs(sn) ** 0.9 * (d / 2)));
      }
      return ring;
    });
    const top = sections[sections.length - 1];
    s.ribbon(
      paths,
      (x, y, z) => {
        if (jacket) {
          if (z > 0.06 && Math.abs(x) < 0.012 + Math.max(0, (y - 0.12) * 0.25) && y > 0.05) return shade(0.38);
          if (z > 0.05 && Math.abs(x) < 0.045 + Math.max(0, (y - 0.12) * 0.25) && y > 0.1) return shade(0.78);
          if (y < sections[0][0] + 0.03) return shade(0.8);
        }
        if (y > top[0] - 0.035) return shade(collar);
        return W;
      },
      { closePath: true, outward: (x, y) => [0, y, 0] },
    );
    s.ball(top[1] * 0.55, 0.05, top[2] * 0.9, shade(collar), { y: top[0], seg: 8 });
    for (const side of [-1, 1]) s.ball(0.12, 0.1, 0.13, W, { x: side * (sections[sections.length - 2][1] / 2 - 0.035), y: SHOULDER[1] - 0.005, seg: 8 });
    if (jacket) {
      for (const side of [-1, 1]) s.box(0.09, 0.012, 0.03, shade(0.55), { x: side * 0.1, y: 0.02, z: 0.115 });
    }
    return s;
  };
  parts.shirt = torso([[-0.02, 0.3, 0.19], [0.1, 0.3, 0.19], [0.24, 0.35, 0.22, 0.008], [0.35, 0.39, 0.21], [0.42, 0.37, 0.17], [0.45, 0.14, 0.12]]);
  parts.blouse = torso([[-0.02, 0.29, 0.18], [0.08, 0.26, 0.17], [0.2, 0.3, 0.21, 0.012], [0.3, 0.33, 0.22, 0.016], [0.4, 0.34, 0.16], [0.44, 0.13, 0.11]], { collar: 0.7 });
  parts.jacket = torso([[-0.13, 0.35, 0.23], [0.0, 0.33, 0.215], [0.14, 0.34, 0.225], [0.26, 0.38, 0.235, 0.008], [0.36, 0.41, 0.22], [0.425, 0.385, 0.18], [0.455, 0.16, 0.13]], { collar: 0.62, jacket: true });

  const skinLip = [0.82, 0.52, 0.5];
  const eye = shade(0.07);
  const brow = shade(0.22);
  parts.head = createShape()
    .cyl(0.1, 0.11, 0.12, W, { y: 0.04, tess })
    .ball(0.172, 0.215, 0.2, W, { y: 0.16, z: 0.008, seg: seg + 4 })
    .ball(0.118, 0.1, 0.15, W, { y: 0.095, z: 0.03, seg })
    .ball(0.032, 0.058, 0.05, W, { y: 0.15, z: 0.1, rx: -0.2, seg: 6 })
    .ball(0.028, 0.058, 0.04, W, { x: -0.087, y: 0.155, z: 0.0, seg: 6 })
    .ball(0.028, 0.058, 0.04, W, { x: 0.087, y: 0.155, z: 0.0, seg: 6 })
    .ball(0.03, 0.017, 0.012, eye, { x: -0.035, y: 0.178, z: 0.098, seg: 6 })
    .ball(0.03, 0.017, 0.012, eye, { x: 0.035, y: 0.178, z: 0.098, seg: 6 })
    .box(0.042, 0.009, 0.012, brow, { x: -0.036, y: 0.2, z: 0.093, rz: 0.08 })
    .box(0.042, 0.009, 0.012, brow, { x: 0.036, y: 0.2, z: 0.093, rz: -0.08 })
    .ball(0.046, 0.014, 0.016, skinLip, { y: 0.11, z: 0.096, seg: 6 });

  // Hair is the head's own shape grown a little and tilted back, so it never grazes the skin;
  // the tilt and slice set the hairline (high at the brow, low at the nape).
  const cap = (s, grow = 1) => s.ball(0.19 * grow, 0.236 * grow, 0.236 * grow, W, { y: 0.16, z: 0.004, rx: -0.68, slice: 0.51, seg: seg + 2 });
  parts.hairShort = cap(createShape()).ball(0.18, 0.13, 0.12, W, { y: 0.135, z: -0.06, seg });
  parts.hairBuzz = createShape().ball(0.182, 0.226, 0.226, shade(0.9), { y: 0.16, z: 0.006, rx: -0.7, slice: 0.5, seg: seg + 2 });
  parts.hairLong = cap(createShape())
    .ball(0.2, 0.36, 0.1, W, { y: 0.06, z: -0.075, seg })
    .ball(0.045, 0.27, 0.1, W, { x: -0.104, y: 0.085, z: -0.01, rz: 0.06, seg: 6 })
    .ball(0.045, 0.27, 0.1, W, { x: 0.104, y: 0.085, z: -0.01, rz: -0.06, seg: 6 });
  parts.hairBun = cap(createShape()).ball(0.18, 0.12, 0.12, W, { y: 0.14, z: -0.06, seg }).ball(0.1, 0.1, 0.1, W, { y: 0.27, z: -0.08, seg: 8 });
  parts.hairPony = cap(createShape())
    .ball(0.18, 0.12, 0.12, W, { y: 0.14, z: -0.06, seg })
    .tube([[0, 0.21, -0.1], [0, 0.15, -0.15], [0, 0.06, -0.165], [0, -0.04, -0.15]], [0.035, 0.04, 0.032, 0.012], W, { tess: 7 });
  const curly = createShape(41);
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * Math.PI * 2;
    const ring = k % 2 ? 0.07 : 0.085;
    curly.lump(0.05, W, { x: Math.cos(a) * ring, y: 0.24 + (k % 3) * 0.01, z: Math.sin(a) * ring - 0.015, seg: 5, bumps: 0.4, seed: k, jitter: 0.2 });
  }
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2;
    if (Math.sin(a) > 0.55) continue;
    curly.lump(0.048, W, { x: Math.cos(a) * 0.092, y: 0.16, z: Math.sin(a) * 0.1 - 0.01, seg: 5, bumps: 0.4, seed: 20 + k, jitter: 0.2 });
  }
  curly.ball(0.188, 0.232, 0.232, W, { y: 0.16, z: 0.004, rx: -0.5, slice: 0.5, seg });
  parts.hairCurly = curly;

  parts.bag = createShape()
    // It hangs in front of the hip, clear of the body.
    .box(0.24, 0.2, 0.075, W, { x: 0.17, y: -0.07, z: 0.165, ry: 0.3 })
    .box(0.24, 0.06, 0.08, shade(0.75), { x: 0.17, y: 0.02, z: 0.167, ry: 0.3 })
    .tube([[0.1, 0.03, 0.17], [0.04, 0.18, 0.14], [-0.06, 0.34, 0.11], [-0.15, 0.43, 0.02], [-0.12, 0.42, -0.08], [0.06, 0.26, -0.12], [0.2, 0.12, -0.04], [0.24, 0.03, 0.1]], 0.012, shade(0.6), { tess: 5 });
  parts.backpack = createShape()
    .ball(0.29, 0.38, 0.15, W, { y: 0.24, z: -0.17, seg })
    .box(0.2, 0.14, 0.05, shade(0.8), { y: 0.13, z: -0.24 })
    .tube([[-0.1, 0.42, -0.1], [-0.12, 0.44, 0.03], [-0.13, 0.3, 0.11], [-0.12, 0.08, 0.09], [-0.1, 0.06, -0.08]], 0.014, shade(0.5), { tess: 5 })
    .tube([[0.1, 0.42, -0.1], [0.12, 0.44, 0.03], [0.13, 0.3, 0.11], [0.12, 0.08, 0.09], [0.1, 0.06, -0.08]], 0.014, shade(0.5), { tess: 5 });
  parts.phone = createShape()
    .box(0.072, 0.145, 0.012, shade(0.08), { y: -0.09, z: 0.04, rx: 0.2 })
    .box(0.064, 0.13, 0.004, [0.32, 0.45, 0.62], { y: -0.09, z: 0.032, rx: 0.2 });
  return parts;
}
