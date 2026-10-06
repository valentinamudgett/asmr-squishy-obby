import {
  ArcRotateCamera,
  Color3,
  Color4,
  DynamicTexture,
  Engine,
  HemisphericLight,
  DirectionalLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
} from "@babylonjs/core";
import { DANCE_LENGTH, danceById } from "./dances.js";
import { drawFace } from "./faces.js";
import { hexToColor3, mulberry32, paint, roundedBox } from "./geometry.js";
import { fabricFontsReady, outfitById, paintOverlay, paintPattern, patternKey, patternNeedsFonts } from "./outfits.js";

export { hexToColor3 };

const HIP_Y = 0.5;
const SHOULDER_Y = 0.96;
const HEAD_Y = 1.19;
const HEAD_HALF = 0.18;
const NECK = 0.03;
const TORSO_H = 0.48;
const FACE_W = 512;
const FACE_H = 536;

/** Proportions per age, as multipliers on the kid rig. Older means longer limbs and a smaller head. */
const BUILDS = {
  kid: { scale: 0.9, legs: 1, torso: 1, arms: 1, head: 1, width: 1 },
  teen: { scale: 0.95, legs: 1.24, torso: 1.1, arms: 1.16, head: 0.9, width: 1.03 },
  adult: { scale: 1, legs: 1.42, torso: 1.2, arms: 1.3, head: 0.84, width: 1.06 },
};

export function buildAvatar(scene) {
  const root = new TransformNode("avatar", scene);
  const rig = new TransformNode("avatarRig", scene);
  rig.parent = root;
  rig.scaling.setAll(BUILDS.kid.scale);
  const body = new TransformNode("avatarBody", scene);
  body.parent = rig;

  const materials = new Map();
  const skin = cloth(scene, "avatarSkin");
  const materialFor = (pattern, repeat = 1) => {
    if (pattern === "skin") return skin;
    const key = `${patternKey(pattern)}|${repeat}`;
    if (materials.has(key)) return materials.get(key);
    const material = cloth(scene, `avatarCloth${materials.size}`);
    if (typeof pattern === "string") {
      material.diffuseColor = hexToColor3(pattern);
    } else {
      const texture = new DynamicTexture(`avatarTex${materials.size}`, { width: 256, height: 256 }, scene, true);
      paintPattern(texture.getContext(), 256, pattern);
      texture.update();
      if (patternNeedsFonts(pattern)) {
        fabricFontsReady.then(() => {
          paintPattern(texture.getContext(), 256, pattern);
          texture.update();
        });
      }
      texture.wrapU = Texture.WRAP_ADDRESSMODE;
      texture.wrapV = Texture.WRAP_ADDRESSMODE;
      texture.uScale = repeat;
      texture.vScale = repeat;
      material.diffuseTexture = texture;
      material.diffuseColor = Color3.White();
    }
    materials.set(key, material);
    return material;
  };

  const box = (name, w, h, d, parent, x, y, z) => {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    return mesh;
  };

  const torso = box("avatarTorso", 0.5, 0.48, 0.25, body, 0, HIP_Y + 0.24, 0);
  const overlayTexture = new DynamicTexture("avatarOverlay", { width: 256, height: 256 }, scene, true);
  overlayTexture.hasAlpha = true;
  const overlayMat = cloth(scene, "avatarOverlayMat");
  overlayMat.diffuseTexture = overlayTexture;
  overlayMat.useAlphaFromDiffuseTexture = true;
  overlayMat.backFaceCulling = false;
  overlayMat.zOffset = -1;
  const overlay = MeshBuilder.CreatePlane("avatarOverlay", { width: 0.5, height: 0.48 }, scene);
  overlay.parent = body;
  overlay.position.set(0, HIP_Y + 0.24, 0.1265);
  overlay.rotation.y = Math.PI;
  overlay.material = overlayMat;

  const skirt = MeshBuilder.CreateCylinder(
    "avatarSkirt",
    { height: 0.22, diameterTop: 0.58, diameterBottom: 0.82, tessellation: 28 },
    scene,
  );
  skirt.parent = body;
  skirt.position.y = HIP_Y + 0.05;
  skirt.scaling.z = 0.6;

  const limb = (side, isArm) => {
    const pivot = new TransformNode(`${isArm ? "arm" : "leg"}${side}`, scene);
    pivot.parent = body;
    if (isArm) pivot.position.set(side * 0.365, SHOULDER_Y, 0);
    else pivot.position.set(side * 0.125, HIP_Y, 0);
    const width = isArm ? 0.22 : 0.245;
    const sizes = isArm ? [0.24, 0.16, 0.08] : [0.2, 0.24, 0.06];
    let y = isArm ? 0.02 : 0;
    const parts = sizes.map((height, index) => {
      const foot = !isArm && index === 2;
      const mesh = box(
        `${pivot.name}-${index}`,
        width + (foot ? 0.01 : 0),
        height,
        foot ? 0.3 : isArm ? 0.22 : 0.245,
        pivot,
        0,
        y - height / 2,
        foot ? 0.03 : 0,
      );
      y -= height;
      return mesh;
    });
    return { side, pivot, parts };
  };
  const arms = [limb(-1, true), limb(1, true)];
  const legs = [limb(-1, false), limb(1, false)];

  const headNode = new TransformNode("avatarHead", scene);
  headNode.parent = body;
  headNode.position.y = HEAD_Y;
  const head = roundedCylinder(scene, "avatarHeadMesh", 0.19, 0.36, 0.075);
  head.parent = headNode;
  head.material = skin;

  const faceTexture = new DynamicTexture("avatarFace", { width: FACE_W, height: FACE_H }, scene, true);
  faceTexture.hasAlpha = true;
  const faceMat = new StandardMaterial("avatarFaceMat", scene);
  faceMat.diffuseTexture = faceTexture;
  faceMat.useAlphaFromDiffuseTexture = true;
  faceMat.specularColor = Color3.Black();
  faceMat.emissiveColor = new Color3(0.18, 0.18, 0.18);
  faceMat.backFaceCulling = false;
  faceMat.zOffset = -2;
  const face = curvedPatch(scene, "avatarFaceMesh", 0.1915, 1.5, 0.3);
  face.parent = headNode;
  face.material = faceMat;

  const hairMat = new StandardMaterial("avatarHair", scene);
  hairMat.diffuseColor = Color3.White();
  hairMat.specularColor = new Color3(0.18, 0.16, 0.14);
  hairMat.specularPower = 24;
  hairMat.backFaceCulling = false;
  const hairStyles = {
    long: { mesh: buildHair(scene), extras: [] },
    short: { mesh: buildShortHair(scene), extras: [] },
    shaggy: { mesh: buildShaggyHair(scene), extras: [] },
    buns: { mesh: buildBunHair(scene), extras: [...buildGlasses(scene), ...buildSparkles(scene)] },
    headphones: { mesh: buildBraidHair(scene), extras: [...buildHeadphones(scene), ...buildChoker(scene)] },
    waves: { mesh: buildWaveHair(scene), extras: buildHeadband(scene) },
  };
  for (const entry of Object.values(hairStyles)) {
    entry.mesh.parent = headNode;
    entry.mesh.material = hairMat;
    const ys = entry.mesh.getVerticesData(VertexBuffer.PositionKind).filter((_, index) => index % 3 === 1);
    entry.mesh.metadata = { top: Math.max(...ys), bottom: Math.min(...ys) };
    for (const extra of entry.extras) {
      extra.parent = headNode;
      extra.isPickable = false;
    }
  }

  const bowMat = cloth(scene, "avatarBow");
  bowMat.diffuseColor = hexToColor3("#ff8fb8");
  const bow = buildBow(scene);
  bow.parent = headNode;
  bow.position.set(0.1, 0.17, -0.17);
  bow.rotation.set(0.5, 0.35, 0.25);
  bow.material = bowMat;

  const furTexture = new DynamicTexture("avatarFur", { width: 256, height: 256 }, scene, true);
  paintFur(furTexture.getContext(), 256);
  furTexture.update();
  furTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  furTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  const hoodMat = cloth(scene, "avatarHoodMat");
  hoodMat.diffuseTexture = furTexture;
  hoodMat.backFaceCulling = false;
  const hood = buildHood(scene);
  hood.parent = headNode;
  hood.material = hoodMat;

  const beltMat = cloth(scene, "avatarBeltMat");
  beltMat.specularColor = new Color3(0.2, 0.2, 0.2);
  const buckleMat = cloth(scene, "avatarBuckleMat");
  buckleMat.diffuseColor = new Color3(0.82, 0.83, 0.86);
  buckleMat.specularColor = new Color3(0.9, 0.9, 0.9);
  buckleMat.specularPower = 48;
  const belt = new TransformNode("avatarBelt", scene);
  belt.parent = body;
  const beltStrap = box("avatarBeltStrap", 0.51, 0.05, 0.26, belt, 0, 0, 0);
  beltStrap.material = beltMat;
  const buckle = box("avatarBuckle", 0.08, 0.055, 0.012, belt, 0, 0, 0.134);
  buckle.material = buckleMat;
  const buckleHole = box("avatarBuckleHole", 0.05, 0.027, 0.006, belt, 0, 0, 0.141);
  buckleHole.material = beltMat;

  const hipClothTexture = new DynamicTexture("avatarHipCloth", { width: 128, height: 256 }, scene, true);
  hipClothTexture.hasAlpha = true;
  const hipClothMat = cloth(scene, "avatarHipClothMat");
  hipClothMat.diffuseTexture = hipClothTexture;
  hipClothMat.useAlphaFromDiffuseTexture = true;
  hipClothMat.backFaceCulling = false;
  const hipCloth = buildHipCloth(scene);
  hipCloth.parent = legs[0].pivot;
  hipCloth.position.set(-0.13, -0.01, 0.13);
  hipCloth.material = hipClothMat;
  let hipClothColor = null;

  const parts = [
    torso,
    skirt,
    head,
    ...Object.values(hairStyles).flatMap((entry) => [entry.mesh, ...entry.extras]),
    bow,
    hood,
    beltStrap,
    buckle,
    hipCloth,
    ...arms.flatMap((a) => a.parts),
    ...legs.flatMap((l) => l.parts),
  ];
  let squash = 0;
  let phase = 0;
  let walkBlend = 0;
  let airBlend = 0;
  let move = null;
  let lastMove = null;
  let danceTime = 0;
  let danceLoop = false;
  let danceBlend = 0;
  let height = (HEAD_Y + HEAD_HALF + 0.05) * BUILDS.kid.scale;

  const shape = (age, boy) => {
    const build = BUILDS[age] ?? BUILDS.kid;
    const wide = build.width * (boy && age !== "kid" ? 1.07 : 1);
    const torsoH = TORSO_H * build.torso;
    rig.scaling.setAll(build.scale);
    // Longer legs reach further below the hip, so lift the rig to keep the feet on the ground.
    rig.position.y = HIP_Y * (build.legs - 1) * build.scale;
    torso.scaling.set(wide, build.torso, 1);
    torso.position.y = HIP_Y + torsoH / 2;
    overlay.scaling.set(wide, build.torso, 1);
    overlay.position.y = HIP_Y + torsoH / 2;
    skirt.scaling.set(wide, 1, 0.6);
    belt.position.y = HIP_Y + 0.025;
    beltStrap.scaling.x = wide;
    for (const arm of arms) {
      arm.pivot.position.set(arm.side * (0.25 * wide + 0.115), HIP_Y + torsoH - 0.02, 0);
      arm.pivot.scaling.y = build.arms;
    }
    for (const leg of legs) leg.pivot.scaling.y = build.legs;
    headNode.scaling.setAll(build.head);
    headNode.position.y = HIP_Y + torsoH + NECK + HEAD_HALF * build.head;
    height = rig.position.y + (headNode.position.y + (HEAD_HALF + 0.05) * build.head) * build.scale;
  };

  return {
    root,
    parts,
    get height() {
      return height;
    },
    apply(look) {
      const boy = look.body === "boy";
      const outfit = outfitById(look.outfit);
      shape(look.age, boy);
      // Boys wear a dress outfit as a shirt with matching shorts and suspenders.
      const shorts = boy && Boolean(outfit.skirt);
      skin.diffuseColor = hexToColor3(look.skinColor);
      const torsoPattern =
        outfit.torso && typeof outfit.torso === "object" && outfit.torso.type === "crop"
          ? { ...outfit.torso, bottom: look.skinColor }
          : outfit.torso;
      torso.material = materialFor(shorts ? outfit.sleeve : torsoPattern, torsoPattern?.type === "crop" ? 1 : 2);
      paintOverlay(overlayTexture.getContext(), 256, shorts ? "suspenders" : outfit.overlay, outfit.skirt);
      overlayTexture.update();
      const showSkirt = Boolean(outfit.skirt) && !boy;
      skirt.setEnabled(showSkirt);
      if (showSkirt) skirt.material = materialFor(outfit.skirt, 3);
      for (const arm of arms) {
        arm.parts[0].material = materialFor(outfit.sleeve);
        arm.parts[1].material = materialFor(outfit.forearm);
        arm.parts[2].material = skin;
      }
      const thigh = shorts ? outfit.skirt : outfit.thigh;
      for (const leg of legs) {
        leg.parts[0].material = materialFor(thigh);
        leg.parts[1].material = materialFor(outfit.shin);
        leg.parts[2].material = materialFor(outfit.shoes);
      }
      const ctx = faceTexture.getContext();
      ctx.clearRect(0, 0, FACE_W, FACE_H);
      drawFace(ctx, look.face, FACE_W, FACE_H);
      faceTexture.update();
      const hairStyle = hairStyles[look.hair] ? look.hair : boy ? "short" : "long";
      for (const [style, entry] of Object.entries(hairStyles)) {
        const active = style === hairStyle;
        entry.mesh.setEnabled(active);
        for (const extra of entry.extras) extra.setEnabled(active);
        if (active) colorHair(entry.mesh, look.hairColor, entry.mesh.metadata.top, entry.mesh.metadata.bottom);
      }
      hood.setEnabled(Boolean(outfit.hood));
      if (outfit.hood) hoodMat.diffuseColor = hexToColor3(outfit.hood);
      bow.setEnabled(look.bow && !outfit.hood);
      belt.setEnabled(Boolean(outfit.belt));
      if (outfit.belt) beltMat.diffuseColor = hexToColor3(outfit.belt);
      hipCloth.setEnabled(Boolean(outfit.hipCloth));
      if (outfit.hipCloth && outfit.hipCloth !== hipClothColor) {
        hipClothColor = outfit.hipCloth;
        paintHipCloth(hipClothTexture.getContext(), 128, 256, outfit.hipCloth);
        hipClothTexture.update();
      }
    },
    nudge(impact) {
      squash = Math.max(squash, Math.min(0.3, 0.08 + impact * 0.018));
    },
    get dancing() {
      return move !== null;
    },
    /** Plays a dance move by id once, or on repeat with `loop`. An unknown id or "none" stops dancing. */
    dance(id, loop = false) {
      move = danceById(id);
      if (move) lastMove = move;
      danceTime = 0;
      danceLoop = loop;
    },
    stopDance() {
      move = null;
    },
    update(dt, pose) {
      root.position.set(pose.x, pose.y - (pose.sink ?? 0), pose.z);
      if (move) {
        danceTime += dt;
        if (!danceLoop && danceTime > DANCE_LENGTH) move = null;
      }
      danceBlend += ((move ? 1 : 0) - danceBlend) * Math.min(1, dt * 8);
      const turnToCamera = pose.faceAngle === undefined ? 0 : wrapAngle(pose.faceAngle - pose.facing);
      root.rotation.y = pose.facing + turnToCamera * danceBlend;
      squash += (0 - squash) * Math.min(1, dt * 7);
      const airborne = pose.airborne;
      walkBlend += ((pose.moving && !airborne ? 1 : 0) - walkBlend) * Math.min(1, dt * 10);
      airBlend += ((airborne ? 1 : 0) - airBlend) * Math.min(1, dt * 12);
      phase += dt * (pose.moving ? 11 : 0);
      const swing = Math.sin(phase) * 0.75 * walkBlend;
      const breathe = Math.sin(pose.time * 2.4) * 0.03 * (1 - walkBlend);
      arms[0].pivot.rotation.set(-swing - airBlend * 2.6, 0, -0.08 - airBlend * 0.35 - breathe);
      arms[1].pivot.rotation.set(swing - airBlend * 2.6, 0, 0.08 + airBlend * 0.35 + breathe);
      legs[0].pivot.rotation.set(swing - airBlend * 0.45, 0, 0);
      legs[1].pivot.rotation.set(-swing + airBlend * 0.25, 0, 0);
      let stretch = airborne ? 0.1 : -squash;
      body.position.y = Math.abs(Math.sin(phase)) * 0.04 * walkBlend;
      body.rotation.set(0, 0, 0);
      headNode.rotation.set(0, 0, Math.sin(phase * 0.5) * 0.04 * walkBlend);

      if (danceBlend > 0.001 && lastMove) {
        const step = lastMove.pose(danceTime);
        const mix = (node, target) => {
          node.rotation.x += (target[0] - node.rotation.x) * danceBlend;
          node.rotation.y += (target[1] - node.rotation.y) * danceBlend;
          node.rotation.z += (target[2] - node.rotation.z) * danceBlend;
        };
        arms.forEach((arm, index) => mix(arm.pivot, step.arms[index]));
        legs.forEach((leg, index) => mix(leg.pivot, step.legs[index]));
        mix(headNode, step.head);
        body.position.y += step.hop * danceBlend;
        body.rotation.y = step.turn * danceBlend;
        body.rotation.z = step.lean * danceBlend;
        stretch += step.squash * danceBlend;
      }
      body.scaling.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    },
  };
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function cloth(scene, name) {
  const material = new StandardMaterial(name, scene);
  material.specularColor = new Color3(0.06, 0.06, 0.06);
  return material;
}

function roundedCylinder(scene, name, radius, height, corner) {
  const shape = [new Vector3(0.0001, -height / 2, 0)];
  for (let i = 0; i <= 6; i += 1) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    shape.push(new Vector3(radius - corner + Math.cos(a) * corner, -height / 2 + corner + Math.sin(a) * corner, 0));
  }
  for (let i = 0; i <= 6; i += 1) {
    const a = (i / 6) * (Math.PI / 2);
    shape.push(new Vector3(radius - corner + Math.cos(a) * corner, height / 2 - corner + Math.sin(a) * corner, 0));
  }
  shape.push(new Vector3(0.0001, height / 2, 0));
  return MeshBuilder.CreateLathe(name, { shape, tessellation: 40 }, scene);
}

/** A slice of a cylinder wall facing +Z, used as the face decal. */
function curvedPatch(scene, name, radius, span, height) {
  const cols = 16;
  const rows = 4;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const u = i / cols;
      const angle = (u - 0.5) * span;
      const y = -height / 2 + (j / rows) * height;
      positions.push(-Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      normals.push(-Math.sin(angle), 0, Math.cos(angle));
      uvs.push(u, j / rows);
    }
  }
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * (cols + 1) + i;
      indices.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
    }
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.uvs = uvs;
  data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}

function buildHair(scene) {
  const cap = MeshBuilder.CreateSphere("hairCap", { diameter: 0.45, segments: 20, slice: 0.5 }, scene);
  cap.position.set(0, 0.035, -0.012);
  cap.scaling.set(1, 0.95, 1);

  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, d) * 0.45, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  add("hairBack", 0.46, 0.7, 0.12, 0, -0.29, -0.17, 0, 0.05);
  for (const side of [-1, 1]) {
    add("hairSide", 0.075, 0.3, 0.34, side * 0.205, -0.07, -0.03);
    add("hairStrand", 0.11, 0.66, 0.11, side * 0.2, -0.3, 0.12, side * 0.04);
  }
  add("hairBangs", 0.3, 0.09, 0.09, 0.045, 0.115, 0.165, -0.22);
  add("hairBangs2", 0.16, 0.08, 0.08, -0.11, 0.1, 0.16, 0.35);
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

function buildShortHair(scene) {
  const cap = MeshBuilder.CreateSphere("shortCap", { diameter: 0.44, segments: 20, slice: 0.5 }, scene);
  cap.position.set(0, 0.035, -0.012);
  cap.scaling.set(1, 0.92, 1);

  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, h, d) * 0.45, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  add("shortBack", 0.42, 0.24, 0.12, 0, -0.03, -0.14, 0, 0.08);
  for (const side of [-1, 1]) add("shortSide", 0.06, 0.15, 0.24, side * 0.198, 0.03, -0.03);
  add("shortFringeL", 0.14, 0.08, 0.08, -0.1, 0.15, 0.15, 0.28, -0.25);
  add("shortFringeM", 0.14, 0.09, 0.08, 0.01, 0.16, 0.16, -0.12, -0.25);
  add("shortFringeR", 0.12, 0.08, 0.08, 0.11, 0.15, 0.15, -0.35, -0.25);
  add("shortTuft", 0.07, 0.1, 0.06, 0.04, 0.235, 0.03, -0.45);
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/** Messy emo cut: a long, pointed, uneven fringe that hangs over the eyes, plus a few stray spikes. */
function buildShaggyHair(scene) {
  const cap = MeshBuilder.CreateSphere("shaggyCap", { diameter: 0.45, segments: 20, slice: 0.5 }, scene);
  cap.position.set(0, 0.03, -0.012);
  cap.scaling.set(1, 0.98, 1);

  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, h, d) * 0.45, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  const strand = (name, w, h, x, top, z, rz, rx = -0.12, ry = 0) => {
    const mesh = MeshBuilder.CreateCylinder(name, { height: h, diameterTop: w, diameterBottom: w * 0.12, tessellation: 6 }, scene);
    mesh.scaling.z = 0.32;
    mesh.position.set(x, top - h / 2, z);
    mesh.rotation.set(rx, ry, rz);
    pieces.push(mesh);
  };
  add("shaggyBack", 0.4, 0.28, 0.12, 0, -0.04, -0.14, 0, 0.06);
  for (const side of [-1, 1]) {
    add("shaggySide", 0.06, 0.24, 0.28, side * 0.19, -0.01, -0.02);
    strand("shaggySideLock", 0.09, 0.3, side * 0.185, 0.12, 0.1, side * 0.1, -0.05);
    strand("shaggyNape", 0.1, 0.16, side * 0.1, -0.12, -0.16, side * -0.2, 0.2);
  }
  const rand = mulberry32(41);
  for (let i = 0; i < 15; i += 1) {
    const x = -0.17 + (i / 14) * 0.34 + (rand() - 0.5) * 0.02;
    const z = Math.sqrt(0.2 ** 2 - x ** 2) + 0.01 + rand() * 0.012;
    const h = 0.2 + rand() * 0.17 - Math.abs(x) * 0.35;
    const lean = -x * 0.9 + (rand() - 0.5) * 0.35;
    strand("shaggyFringe", 0.055 + rand() * 0.035, h, x, 0.22 + rand() * 0.02, z, lean, -0.14 - rand() * 0.08, Math.atan2(x, z));
  }
  add("shaggyFringeBase", 0.36, 0.08, 0.1, 0, 0.17, 0.13, 0, -0.35);
  const spikes = [
    [-0.22, 0.13, 0.08, 1.2],
    [0.225, 0.11, 0.09, -1.3],
    [0.2, 0.0, 0.11, -1.7],
  ];
  for (const [x, y, z, rz] of spikes) strand("shaggySpike", 0.035, 0.12, x, y + 0.06, z, rz, 0);
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/** Blonde space buns with a short fringe, worn with the glasses extra. */
function buildBunHair(scene) {
  const cap = MeshBuilder.CreateSphere("bunCap", { diameter: 0.44, segments: 18, slice: 0.55 }, scene);
  cap.position.set(0, 0.04, -0.01);
  cap.scaling.set(1, 0.9, 1);
  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, h, d) * 0.45, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  add("bunFringe", 0.28, 0.08, 0.08, 0.02, 0.14, 0.16, -0.15, -0.2);
  for (const side of [-1, 1]) {
    const bun = MeshBuilder.CreateSphere("spaceBun", { diameter: 0.16, segments: 12 }, scene);
    bun.position.set(side * 0.15, 0.16, -0.02);
    pieces.push(bun);
    add("bunCurl", 0.07, 0.22, 0.07, side * 0.18, -0.02, 0.1, side * 0.35, 0.2);
  }
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/** Long hair gathered into two low braids, worn with the headphone extra. */
function buildBraidHair(scene) {
  const cap = MeshBuilder.CreateSphere("braidCap", { diameter: 0.45, segments: 18, slice: 0.55 }, scene);
  cap.position.set(0, 0.03, -0.01);
  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, h, d) * 0.4, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  add("braidBack", 0.4, 0.22, 0.12, 0, -0.02, -0.15, 0, 0.08);
  add("braidFringe", 0.26, 0.08, 0.08, 0, 0.13, 0.15, 0, -0.25);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i += 1) {
      const bead = MeshBuilder.CreateSphere(`braidBead${side}${i}`, { diameter: 0.07 - i * 0.006, segments: 8 }, scene);
      bead.position.set(side * 0.16, 0.02 - i * 0.07, 0.06);
      pieces.push(bead);
    }
  }
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/** Long wavy hair, worn with the headband extra. */
function buildWaveHair(scene) {
  const cap = MeshBuilder.CreateSphere("waveCap", { diameter: 0.45, segments: 18, slice: 0.55 }, scene);
  cap.position.set(0, 0.03, -0.012);
  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, h, d) * 0.45, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  add("waveBack", 0.42, 0.55, 0.14, 0, -0.22, -0.12, 0, 0.08);
  add("waveFringe", 0.3, 0.1, 0.09, 0.02, 0.12, 0.15, -0.1, -0.2);
  for (const side of [-1, 1]) {
    add("waveSide", 0.1, 0.62, 0.12, side * 0.18, -0.22, 0.04, side * 0.12, 0.15);
    add("waveTip", 0.08, 0.22, 0.08, side * 0.22, -0.5, 0.08, side * -0.3, 0.4);
  }
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

function accessoryMaterial(scene, name, hex) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = hexToColor3(hex);
  material.specularColor = new Color3(0.2, 0.2, 0.22);
  return material;
}

function buildGlasses(scene) {
  const frame = accessoryMaterial(scene, "glassesMat", "#3a3438");
  const pieces = [];
  for (const side of [-1, 1]) {
    const ring = MeshBuilder.CreateTorus("glassRing", { diameter: 0.085, thickness: 0.012, tessellation: 14 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(side * 0.05, 0.02, 0.155);
    ring.material = frame;
    pieces.push(ring);
    const arm = MeshBuilder.CreateBox("glassArm", { width: 0.01, height: 0.01, depth: 0.14 }, scene);
    arm.position.set(side * 0.09, 0.025, 0.08);
    arm.material = frame;
    pieces.push(arm);
  }
  const bridge = MeshBuilder.CreateBox("glassBridge", { width: 0.028, height: 0.008, depth: 0.008 }, scene);
  bridge.position.set(0, 0.028, 0.16);
  bridge.material = frame;
  pieces.push(bridge);
  return pieces;
}

function buildHeadphones(scene) {
  const silver = accessoryMaterial(scene, "headphoneBandMat", "#c5c6cb");
  const cupMat = accessoryMaterial(scene, "headphoneCupMat", "#2c2c30");
  const band = MeshBuilder.CreateTorus("headphoneBand", { diameter: 0.46, thickness: 0.028, tessellation: 18 }, scene);
  band.scaling.set(1, 0.72, 0.55);
  band.position.y = 0.02;
  band.material = silver;
  const pieces = [band];
  for (const side of [-1, 1]) {
    const cup = MeshBuilder.CreateCylinder("headphoneCup", { height: 0.045, diameter: 0.11, tessellation: 14 }, scene);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * 0.2, 0.0, 0.01);
    cup.material = cupMat;
    pieces.push(cup);
  }
  return pieces;
}

function buildHeadband(scene) {
  const band = MeshBuilder.CreateTorus("headband", { diameter: 0.4, thickness: 0.032, tessellation: 16 }, scene);
  band.rotation.x = Math.PI / 2;
  band.scaling.set(1.05, 0.72, 1);
  band.position.set(0, 0.1, 0.02);
  band.material = accessoryMaterial(scene, "headbandMat", "#4a342c");
  return [band];
}

/** Hood worn up: a shell behind the head, framed by a thick fur trim with fuzzy tufts. */
function buildHood(scene) {
  const shell = MeshBuilder.CreateSphere("hoodShell", { diameter: 0.5, segments: 20, slice: 0.5 }, scene);
  shell.rotation.x = -Math.PI / 2;
  shell.scaling.set(1.06, 1.55, 1.25);
  shell.position.set(0, -0.03, 0.1);

  const path = [];
  const rimPoint = (angle) => new Vector3(Math.sin(angle) * 0.255, Math.cos(angle) * 0.275 + 0.0, 0.11 + Math.abs(Math.sin(angle)) * 0.02);
  for (let i = 0; i <= 40; i += 1) path.push(rimPoint(-2.45 + (i / 40) * 4.9));
  const rim = MeshBuilder.CreateTube("hoodRim", { path, radius: 0.05, tessellation: 12, cap: Mesh.CAP_ALL }, scene);
  const pieces = [shell, rim];
  const rand = mulberry32(17);
  for (let i = 0; i < 110; i += 1) {
    const angle = -2.45 + rand() * 4.9;
    const tuft = MeshBuilder.CreateCylinder(
      "hoodTuft",
      { height: 0.025 + rand() * 0.035, diameterTop: 0, diameterBottom: 0.03 + rand() * 0.02, tessellation: 5 },
      scene,
    );
    const at = rimPoint(angle);
    const out = 0.035 + rand() * 0.015;
    tuft.position.set(at.x + Math.sin(angle) * out, at.y + Math.cos(angle) * out, at.z + (rand() - 0.5) * 0.06);
    tuft.rotation.set((rand() - 0.5) * 1.6, 0, -angle + (rand() - 0.5) * 1.2);
    pieces.push(tuft);
  }
  for (let i = 0; i < 30; i += 1) {
    const a = rand() * Math.PI * 2;
    const b = rand() * 1.2;
    const tuft = MeshBuilder.CreateCylinder("hoodShellTuft", { height: 0.04, diameterTop: 0, diameterBottom: 0.03, tessellation: 5 }, scene);
    const dir = new Vector3(Math.cos(a) * Math.sin(b + 0.3), Math.sin(a) * Math.sin(b + 0.3), -Math.cos(b + 0.3));
    tuft.position.set(dir.x * 0.265, dir.y * 0.31 - 0.03, 0.1 + dir.z * 0.39);
    tuft.rotation.set(Math.atan2(dir.z, Math.hypot(dir.x, dir.y)) * -1, 0, -Math.atan2(dir.x, dir.y));
    pieces.push(tuft);
  }
  return Mesh.MergeMeshes(pieces, true, true);
}

function paintFur(ctx, size) {
  const rand = mulberry32(9);
  ctx.fillStyle = "#c9c7c3";
  ctx.fillRect(0, 0, size, size);
  ctx.lineCap = "round";
  for (let i = 0; i < 2600; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const angle = rand() * Math.PI * 2;
    const length = 4 + rand() * 10;
    const shade = Math.round(70 + rand() * 185);
    ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade - 4}, 0.75)`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
}

function buildHipCloth(scene) {
  const plane = MeshBuilder.CreatePlane("hipCloth", { width: 0.2, height: 0.3 }, scene);
  plane.rotation.set(0, -Math.PI / 4, -0.05);
  plane.position.y = -0.15;
  plane.bakeCurrentTransformIntoVertices();
  return plane;
}

/** Sheer, crumpled fabric: translucent with darker folds and a ragged hem. */
function paintHipCloth(ctx, w, h, color) {
  const rand = mulberry32(23);
  const hem = Array.from({ length: 11 }, () => h * (0.82 + rand() * 0.16));
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(w * 0.05, 0);
    ctx.lineTo(w * 0.95, 0);
    for (let i = 10; i >= 0; i -= 1) ctx.lineTo(w * (0.05 + (i / 10) * 0.9), hem[i]);
    ctx.closePath();
  };
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = color;
  outline();
  ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 9; i += 1) {
    const x = rand() * w;
    ctx.strokeStyle = rand() < 0.5 ? "rgba(0, 0, 0, 0.35)" : "rgba(160, 160, 170, 0.25)";
    ctx.lineWidth = 2 + rand() * 5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + (rand() - 0.5) * 30, h * 0.5, x + (rand() - 0.5) * 20, h * 0.85);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "destination-in";
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = "#000";
  outline();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function buildBow(scene) {
  const loops = [-1, 1].map((side) => {
    const loop = MeshBuilder.CreateTorus("bowLoop", { diameter: 0.13, thickness: 0.045, tessellation: 16 }, scene);
    loop.scaling.set(0.75, 1, 0.5);
    loop.rotation.set(Math.PI / 2, 0, side * 0.5);
    loop.position.x = side * 0.065;
    return loop;
  });
  const knot = MeshBuilder.CreateSphere("bowKnot", { diameter: 0.06, segments: 10 }, scene);
  return Mesh.MergeMeshes([...loops, knot], true, true);
}

function colorHair(mesh, hairColor, top, bottom) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors = new Float32Array((positions.length / 3) * 4);
  const solid = hairColor === "rainbow" ? null : hexToColor3(hairColor);
  const scratch = new Color3();
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    let color = solid;
    if (!color) {
      const t = (top - positions[i + 1]) / (top - bottom);
      Color3.HSVtoRGBToRef(t * 300, 0.62, 1, scratch);
      color = scratch;
    }
    colors[c] = color.r;
    colors[c + 1] = color.g;
    colors[c + 2] = color.b;
    colors[c + 3] = 1;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
}

export function createPreview(canvas) {
  const engine = new Engine(canvas, true, {
    adaptToDeviceRatio: true,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  engine.enableOfflineSupport = false;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const camera = new ArcRotateCamera("previewCam", Math.PI / 2 - 0.35, 1.36, 2.5, new Vector3(0, 0.66, 0), scene);
  camera.inputs.clear();
  const hemi = new HemisphericLight("previewHemi", new Vector3(0.2, 1, 0.3), scene);
  hemi.intensity = 0.8;
  hemi.groundColor = new Color3(0.55, 0.45, 0.55);
  const key = new DirectionalLight("previewKey", new Vector3(-0.4, -0.6, 0.7), scene);
  key.intensity = 0.55;
  const avatar = buildAvatar(scene);
  avatar.update(0, { x: 0, y: 0, z: 0, facing: 0, airborne: false, moving: false, time: 0 });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let running = false;
  let time = 0;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.floor(rect.width * ratio));
    const height = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      engine.resize();
    }
  };

  return {
    avatar,
    resize,
    start() {
      resize();
      if (running) return;
      running = true;
      engine.runRenderLoop(() => {
        const dt = engine.getDeltaTime() / 1000;
        time += dt;
        if (!reduceMotion) avatar.root.rotation.y = Math.sin(time * 0.6) * 0.7;
        const ease = reduceMotion ? 1 : Math.min(1, dt * 6);
        camera.target.y += (avatar.height * 0.516 - camera.target.y) * ease;
        camera.radius += (avatar.height * 1.956 - camera.radius) * ease;
        avatar.update(dt, {
          x: 0,
          y: 0,
          z: 0,
          facing: avatar.root.rotation.y,
          airborne: false,
          moving: false,
          time,
        });
        scene.render();
      });
    },
    stop() {
      running = false;
      engine.stopRenderLoop();
    },
  };
}
