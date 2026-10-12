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
  Quaternion,
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
// Flip around the chest so the feet and head trade places instead of spinning around the toes.
const FLIP_PIVOT = 0.7;
const SHOULDER_Y = 0.96;
const HEAD_Y = 1.19;
const HEAD_HALF = 0.18;
const NECK = 0.03;
const TORSO_H = 0.48;
// The bow sits on the upper back of the head, pushed out to wherever the current hair ends.
const BOW_ORIGIN = new Vector3(0, 0.06, -0.02);
const BOW_DIRECTION = new Vector3(0.1, 0.11, -0.15).normalize();
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
    buns: { mesh: buildBunHair(scene), extras: buildSparkles(scene) },
    headphones: { mesh: buildBraidHair(scene), extras: [...buildHeadphones(scene), ...buildChoker(scene)] },
    waves: { mesh: buildWaveHair(scene), extras: buildHeadband(scene) },
  };
  for (const entry of Object.values(hairStyles)) {
    entry.mesh.parent = headNode;
    entry.mesh.material = hairMat;
    const ys = entry.mesh.getVerticesData(VertexBuffer.PositionKind).filter((_, index) => index % 3 === 1);
    entry.mesh.metadata = {
      top: Math.max(...ys),
      bottom: Math.min(...ys),
      bowDepth: Math.max(HEAD_HALF + 0.02, surfaceDepth(entry.mesh, BOW_ORIGIN, BOW_DIRECTION)),
    };
    for (const extra of entry.extras) {
      extra.parent = headNode;
      extra.isPickable = false;
    }
  }

  const bowMat = cloth(scene, "avatarBow");
  bowMat.diffuseColor = hexToColor3("#ff8fb8");
  const bow = buildBow(scene);
  bow.parent = headNode;
  bow.rotationQuaternion = new Quaternion();
  Quaternion.FromUnitVectorsToRef(new Vector3(0, 0, -1), BOW_DIRECTION, bow.rotationQuaternion);
  bow.scaling.setAll(1.15);
  bow.material = bowMat;

  const necklace = buildNecklace(scene);
  necklace.root.parent = headNode;
  necklace.root.setEnabled(false);
  const wearBand = buildWearHeadband(scene);
  wearBand.parent = headNode;
  wearBand.setEnabled(false);
  const bracelet = buildBracelet(scene);
  bracelet.root.parent = arms[0].pivot;
  bracelet.root.setEnabled(false);

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
  let faceId = "grin";
  let screaming = false;
  const paintFace = () => {
    const ctx = faceTexture.getContext();
    ctx.clearRect(0, 0, FACE_W, FACE_H);
    drawFace(ctx, screaming ? "scream" : faceId, FACE_W, FACE_H);
    faceTexture.update();
  };

  const parts = [
    torso,
    skirt,
    head,
    ...Object.values(hairStyles).flatMap((entry) => [entry.mesh, ...entry.extras]),
    bow,
    ...necklace.meshes,
    wearBand,
    ...bracelet.meshes,
    hood,
    beltStrap,
    buckle,
    hipCloth,
    ...arms.flatMap((a) => a.parts),
    ...legs.flatMap((l) => l.parts),
  ];
  let squash = 0;
  let rigLift = 0;
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
    rigLift = HIP_Y * (build.legs - 1) * build.scale;
    rig.position.y = rigLift;
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
      faceId = look.face;
      paintFace();
      const hairStyle = hairStyles[look.hair] ? look.hair : boy ? "short" : "long";
      for (const [style, entry] of Object.entries(hairStyles)) {
        const active = style === hairStyle;
        entry.mesh.setEnabled(active);
        for (const extra of entry.extras) extra.setEnabled(active);
        if (!active) continue;
        colorHair(entry.mesh, look.hairColor, entry.mesh.metadata.top, entry.mesh.metadata.bottom);
        bow.position.copyFrom(BOW_DIRECTION).scaleInPlace(entry.mesh.metadata.bowDepth + 0.022).addInPlace(BOW_ORIGIN);
      }
      hood.setEnabled(Boolean(outfit.hood));
      if (outfit.hood) hoodMat.diffuseColor = hexToColor3(outfit.hood);
      bow.setEnabled(look.bow && !outfit.hood);
      necklace.root.setEnabled(Boolean(look.necklace));
      wearBand.setEnabled(Boolean(look.headband) && !outfit.hood);
      bracelet.root.setEnabled(Boolean(look.bracelet));
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
    /** Open-mouth yell while a lava fall plays out. Restores the chosen face when it ends. */
    setScreaming(on) {
      if (screaming === on) return;
      screaming = on;
      paintFace();
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
      phase += dt * (pose.moving ? 11 * (pose.stride ?? 1) : 0);
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

      const trick = pose.trick ?? null;
      const trickP = trick ? Math.min(1, Math.max(0, pose.trickP ?? 0)) : 0;
      const wave = trick ? Math.sin(trickP * Math.PI) : 0;
      const blendPose = (node, x, y, z, amount) => {
        node.rotation.x += (x - node.rotation.x) * amount;
        node.rotation.y += (y - node.rotation.y) * amount;
        node.rotation.z += (z - node.rotation.z) * amount;
      };
      if (trick === "spin") {
        blendPose(arms[0].pivot, -0.2, 0, -2.2, wave);
        blendPose(arms[1].pivot, -0.2, 0, 2.2, wave);
        blendPose(legs[0].pivot, 0.2, 0, -0.28, wave);
        blendPose(legs[1].pivot, -0.15, 0, 0.28, wave);
      } else if (wave > 0) {
        blendPose(arms[0].pivot, -1.65, 0, 0.9, wave);
        blendPose(arms[1].pivot, -1.65, 0, -0.9, wave);
        blendPose(legs[0].pivot, -1.2, 0, -0.1, wave);
        blendPose(legs[1].pivot, -1.2, 0, 0.1, wave);
        blendPose(headNode, 0.5, 0, 0, wave);
        stretch += 0.12 * wave;
      }

      const eased = trickP * trickP * (3 - 2 * trickP);
      const turns = eased * Math.PI * 2;
      const pitch = trick === "front" ? turns : trick === "back" ? -turns : 0;
      const spin = trick === "spin" ? turns : 0;
      const pivot = FLIP_PIVOT * rig.scaling.y;
      const cos = Math.cos(pitch);
      const sin = Math.sin(pitch);
      rig.rotation.set(pitch, spin, 0);
      rig.position.set(0, rigLift + pivot * (1 - cos), -pivot * sin);

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

/**
 * One flat lock hanging from the side of the head.
 * It eases out of the bun, then falls in loose S-waves that taper to a point.
 */
function wavySideLock(scene, name, side) {
  const steps = 48;
  const around = 14;
  const length = 0.48;
  const sample = (t) => {
    const phase = t * Math.PI * 2 * 1.85;
    const emerge = Math.min(1, t / 0.2);
    const swing = 0.068 * emerge;
    return {
      x: side * (0.15 + emerge * 0.08 + Math.sin(phase) * swing),
      y: 0.16 - t * length,
      z: -0.03 + Math.cos(phase) * swing * 0.72,
      phase,
      emerge,
      t,
    };
  };
  const points = Array.from({ length: steps + 1 }, (_, i) => sample(i / steps));
  const frames = points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(steps, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    let tz = next.z - prev.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    tx /= len;
    ty /= len;
    tz /= len;
    let wx = side;
    let wy = 0;
    let wz = 0;
    const dot = wx * tx + wy * ty + wz * tz;
    wx -= tx * dot;
    wy -= ty * dot;
    wz -= tz * dot;
    let wlen = Math.hypot(wx, wy, wz);
    if (wlen < 1e-5) {
      wx = 0;
      wy = 0;
      wz = 1;
      wlen = 1;
    }
    wx /= wlen;
    wy /= wlen;
    wz /= wlen;
    const nx = ty * wz - tz * wy;
    const ny = tz * wx - tx * wz;
    const nz = tx * wy - ty * wx;
    const twist = Math.sin(p.phase) * 0.35;
    const c = Math.cos(twist);
    const s = Math.sin(twist);
    const bunch = 0.86 + 0.14 * Math.max(0, Math.sin(p.phase));
    const halfWidth = (0.012 + 0.014 * p.emerge) * (1 - p.t * 0.78) * bunch;
    return {
      p,
      bx: wx * c + nx * s,
      by: wy * c + ny * s,
      bz: wz * c + nz * s,
      hx: -wx * s + nx * c,
      hy: -wy * s + ny * c,
      hz: -wz * s + nz * c,
      halfWidth,
      halfThick: halfWidth * 0.7,
      tx,
      ty,
      tz,
    };
  });

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const ring = around + 1;
  for (let i = 0; i <= steps; i += 1) {
    const f = frames[i];
    for (let j = 0; j <= around; j += 1) {
      const a = (j / around) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      positions.push(
        f.p.x + f.bx * ca * f.halfWidth + f.hx * sa * f.halfThick,
        f.p.y + f.by * ca * f.halfWidth + f.hy * sa * f.halfThick,
        f.p.z + f.bz * ca * f.halfWidth + f.hz * sa * f.halfThick,
      );
      const nx = f.bx * (ca / f.halfWidth) + f.hx * (sa / f.halfThick);
      const ny = f.by * (ca / f.halfWidth) + f.hy * (sa / f.halfThick);
      const nz = f.bz * (ca / f.halfWidth) + f.hz * (sa / f.halfThick);
      const nlen = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / nlen, ny / nlen, nz / nlen);
      uvs.push(j / around, i / steps);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < around; j += 1) {
      const a = i * ring + j;
      indices.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
    }
  }
  const root = frames[0];
  const tip = frames[steps];
  const rootIndex = positions.length / 3;
  positions.push(root.p.x, root.p.y, root.p.z);
  normals.push(-root.tx, -root.ty, -root.tz);
  uvs.push(0.5, 0);
  const tipIndex = positions.length / 3;
  positions.push(tip.p.x, tip.p.y, tip.p.z);
  normals.push(tip.tx, tip.ty, tip.tz);
  uvs.push(0.5, 1);
  for (let j = 0; j < around; j += 1) {
    indices.push(rootIndex, j + 1, j);
    const tipRing = steps * ring;
    indices.push(tipIndex, tipRing + j, tipRing + j + 1);
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

/** Space buns with one wavy lock hanging from each side of the head. */
function buildBunHair(scene) {
  const cap = MeshBuilder.CreateSphere("bunCap", { diameter: 0.44, segments: 18, slice: 0.46 }, scene);
  cap.position.set(0, 0.07, -0.05);
  cap.scaling.set(1, 0.84, 0.86);
  const pieces = [cap];
  for (const side of [-1, 1]) {
    const bun = MeshBuilder.CreateSphere("spaceBun", { diameter: 0.2, segments: 14 }, scene);
    bun.position.set(side * 0.12, 0.23, -0.03);
    pieces.push(bun, wavySideLock(scene, "bunWave", side));
  }
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/** Fringe and two braids that start beside the temples and hang down the sides of the head. */
function buildBraidHair(scene) {
  const cap = MeshBuilder.CreateSphere("braidCap", { diameter: 0.46, segments: 18, slice: 0.46 }, scene);
  cap.position.set(0, 0.07, -0.01);
  cap.scaling.set(1, 0.84, 0.92);
  // The cap stops above the eyes. This wraps the sides and back below it, leaving the face open.
  const faceGap = 1.9;
  const under = MeshBuilder.CreateCylinder(
    "braidUnder",
    { height: 0.24, diameter: 0.4, tessellation: 32, arc: 1 - faceGap / (Math.PI * 2), cap: 0 },
    scene,
  );
  under.position.y = -0.02;
  under.rotation.y = -(Math.PI / 2 - faceGap / 2);
  const pieces = [cap, under];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, h, d) * 0.4, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    pieces.push(mesh);
  };
  add("braidBack", 0.38, 0.3, 0.14, 0, -0.08, -0.16, 0, 0.1);
  add("braidFringe", 0.3, 0.06, 0.07, 0, 0.12, 0.165, 0, -0.22);
  for (const side of [-1, 1]) {
    add("braidSide", 0.1, 0.14, 0.12, side * 0.2, 0.1, 0.02);
    for (let i = 0; i < 11; i += 1) {
      const t = i / 10;
      const bead = MeshBuilder.CreateSphere(`braidBead${side}${i}`, { diameter: 0.08 - i * 0.002, segments: 8 }, scene);
      bead.position.set(side * (0.195 + t * 0.035), 0.07 - i * 0.055, 0.11 - t * 0.1);
      pieces.push(bead);
    }
  }
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/**
 * A loose S-wave. It falls from `start` and drifts outward along `out`, bending side to side
 * a few times instead of coiling into a corkscrew.
 */
function waveStrand(scene, start, out, { length, waves, amp, thick, phase, spread = 1 }) {
  const forward = out.clone();
  if (forward.lengthSquared() < 1e-8) forward.set(0, 0, 1);
  else forward.normalize();
  const across = new Vector3(forward.z, 0, -forward.x);
  if (across.lengthSquared() < 1e-8) across.set(1, 0, 0);
  else across.normalize();
  const steps = Math.max(12, Math.round(waves * 18));
  const path = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const angle = phase + t * waves * Math.PI * 2;
    const envelope = Math.sin(Math.min(1, t / 0.14) * Math.PI * 0.5);
    const swing = amp * envelope * (0.7 + 0.3 * t);
    const drift = (0.03 * t + 0.05 * t * t) * spread;
    const along = drift + Math.cos(angle) * swing * 0.22;
    const sideways = Math.sin(angle) * swing;
    path.push(
      new Vector3(
        start.x + forward.x * along + across.x * sideways,
        start.y - t * length,
        start.z + forward.z * along + across.z * sideways,
      ),
    );
  }
  return MeshBuilder.CreateTube(
    "waveStrand",
    { path, tessellation: 6, cap: Mesh.CAP_ALL, radiusFunction: (i) => thick * (1 - (i / steps) * 0.32) },
    scene,
  );
}

function crownWave(scene, x, phase, radius) {
  const steps = 16;
  const path = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const z = 0.02 - t * 0.3;
    const y = 0.16 + Math.sin(t * Math.PI) * 0.07 - t * 0.06;
    const sway = Math.sin(phase + t * Math.PI * 1.25) * 0.03;
    path.push(new Vector3(x + sway, y, z));
  }
  return MeshBuilder.CreateTube("crownWave", { path, radius, tessellation: 6, cap: Mesh.CAP_ALL }, scene);
}

/**
 * Loose waves under a headband: sweeps over the crown, soft bangs, shoulder-length waves
 * at the sides, and longer waves down the back.
 */
function buildWaveHair(scene) {
  const rand = mulberry32(31);
  const cap = MeshBuilder.CreateSphere("curlCap", { diameter: 0.43, segments: 18, slice: 0.5 }, scene);
  cap.position.set(0, 0.05, -0.04);
  cap.scaling.set(1, 0.9, 0.92);
  // Hair behind the waves on the sides and back, so gaps between locks show hair, not skin.
  const faceGap = 1.9;
  const under = MeshBuilder.CreateCylinder(
    "curlUnder",
    { height: 0.26, diameter: 0.4, tessellation: 32, arc: 1 - faceGap / (Math.PI * 2), cap: 0 },
    scene,
  );
  under.position.y = -0.06;
  under.rotation.y = -(Math.PI / 2 - faceGap / 2);
  const pieces = [cap, under];

  // Loose sweeps over the crown, with a second set tucked between them.
  // The forehead stays clear for the headband and the face.
  const crown = 5;
  for (let i = 0; i < crown; i += 1) {
    const x = -0.12 + (i / (crown - 1)) * 0.24;
    pieces.push(crownWave(scene, x, i * 0.85, 0.022));
  }
  for (let i = 0; i < crown - 1; i += 1) {
    const x = -0.12 + ((i + 0.5) / (crown - 1)) * 0.24;
    pieces.push(crownWave(scene, x, i * 0.85 + 1.4, 0.016));
  }

  // Soft bangs under the headband. They end above the eyes.
  const bang = (angle, phase, thick) => {
    const out = new Vector3(Math.sin(angle), 0, Math.cos(angle));
    const start = new Vector3(out.x * 0.19, 0.145, out.z * 0.19);
    pieces.push(
      waveStrand(scene, start, out, {
        length: 0.085,
        waves: 0.55,
        amp: 0.016,
        thick,
        phase,
        spread: 0.2,
      }),
    );
  };
  for (let i = 0; i < 5; i += 1) bang((i - 2) * 0.28, i * 0.9, 0.011);
  for (let i = 0; i < 4; i += 1) bang((i - 1.5) * 0.28, i * 0.9 + 0.45, 0.009);

  // One layer from the temples round to the back. Angles are measured from the face.
  // Side waves stop at the shoulders. The long ones hang behind the back of the shirt.
  const angles = [1.05, 1.5, 1.95, 2.4, 2.85];
  for (const side of [-1, 1]) {
    for (const angle of angles) {
      const out = new Vector3(side * Math.sin(angle), 0, Math.cos(angle));
      const long = angle >= 2.15;
      let z = out.z * 0.2 - 0.02;
      if (long) z = Math.min(z, -0.16);
      const top = 0.07 + Math.max(0, -out.z) * 0.05;
      const start = new Vector3(out.x * 0.2, top, z);
      pieces.push(
        waveStrand(scene, start, out, {
          length: long ? 0.48 + rand() * 0.06 : top + 0.2 + rand() * 0.02,
          waves: long ? 2 + rand() * 0.35 : 1.15 + rand() * 0.2,
          amp: 0.04 + rand() * 0.01,
          thick: 0.016 + rand() * 0.003,
          phase: rand() * Math.PI * 2,
          spread: 0.55,
        }),
      );
    }
  }

  // More locks between the ones above, plus one down the middle of the back.
  // A separate roll keeps the original waves from shifting.
  const extra = mulberry32(73);
  const fill = [1.28, 1.72, 2.18, 2.62];
  for (const side of [-1, 1]) {
    for (const angle of fill) {
      const out = new Vector3(side * Math.sin(angle), 0, Math.cos(angle));
      const long = angle >= 2.15;
      let z = out.z * 0.17 - 0.01;
      if (long) z = Math.min(z, -0.13);
      const top = 0.05 + Math.max(0, -out.z) * 0.05;
      const start = new Vector3(out.x * 0.17, top, z);
      pieces.push(
        waveStrand(scene, start, out, {
          length: long ? 0.42 + extra() * 0.06 : top + 0.17 + extra() * 0.02,
          waves: long ? 2 + extra() * 0.35 : 1.15 + extra() * 0.2,
          amp: 0.032 + extra() * 0.01,
          thick: 0.013 + extra() * 0.002,
          phase: extra() * Math.PI * 2,
          spread: 0.45,
        }),
      );
    }
  }
  const back = new Vector3(0, 0, -1);
  pieces.push(
    waveStrand(scene, new Vector3(0, 0.1, -0.18), back, {
      length: 0.5 + extra() * 0.05,
      waves: 2.1,
      amp: 0.038,
      thick: 0.015,
      phase: extra() * Math.PI * 2,
      spread: 0.4,
    }),
  );

  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

function accessoryMaterial(scene, name, hex) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = hexToColor3(hex);
  material.specularColor = new Color3(0.2, 0.2, 0.22);
  return material;
}

function buildSparkles(scene) {
  const material = accessoryMaterial(scene, "sparkleMat", "#fff8ee");
  material.emissiveColor = new Color3(1, 0.96, 0.88);
  const spots = [
    [0.16, 0.3, 0.1],
    [-0.14, 0.28, 0.12],
    [0.04, 0.32, 0.02],
    [-0.2, 0.16, 0.16],
  ];
  return spots.map(([x, y, z], index) => {
    const mesh = MeshBuilder.CreateBox(`sparkle${index}`, { size: 0.038 }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.set(0.5, 0.7, 0.8);
    mesh.material = material;
    return mesh;
  });
}

function buildHeadphones(scene) {
  const silver = accessoryMaterial(scene, "headphoneBandMat", "#d5d6db");
  const cupMat = accessoryMaterial(scene, "headphoneCupMat", "#3a3a40");
  const padMat = accessoryMaterial(scene, "headphonePadMat", "#ececef");
  const path = [];
  for (let i = 0; i <= 18; i += 1) {
    const theta = Math.PI - (i / 18) * Math.PI;
    path.push(new Vector3(Math.cos(theta) * 0.27, Math.sin(theta) * 0.32 + 0.02, Math.sin(theta) * -0.02));
  }
  const band = MeshBuilder.CreateTube("headphoneBand", { path, radius: 0.016, tessellation: 10, cap: Mesh.CAP_ALL }, scene);
  band.material = silver;
  const pieces = [band];
  for (const side of [-1, 1]) {
    const cup = MeshBuilder.CreateCylinder("headphoneCup", { height: 0.05, diameter: 0.15, tessellation: 16 }, scene);
    cup.rotation.z = Math.PI / 2;
    cup.position.set(side * 0.26, 0.02, 0.02);
    cup.material = cupMat;
    pieces.push(cup);
    const pad = MeshBuilder.CreateCylinder("headphonePad", { height: 0.018, diameter: 0.1, tessellation: 16 }, scene);
    pad.rotation.z = Math.PI / 2;
    pad.position.set(side * 0.23, 0.02, 0.02);
    pad.material = padMat;
    pieces.push(pad);
  }
  return pieces;
}

function buildChoker(scene) {
  const material = accessoryMaterial(scene, "chokerMat", "#1a1a1a");
  material.zOffset = -3;
  const band = MeshBuilder.CreateBox("choker", { width: 0.18, height: 0.03, depth: 0.045 }, scene);
  band.position.set(0, -0.155, 0.2);
  band.material = material;
  return [band];
}

function buildHeadband(scene) {
  const material = accessoryMaterial(scene, "headbandMat", "#3a261c");
  material.zOffset = -4;
  const path = [];
  const steps = 28;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const x = Math.sin(angle) * 0.23;
    const z = Math.cos(angle) * 0.21;
    path.push(new Vector3(x, 0.165 - Math.max(0, z) * 0.02, z));
  }
  const band = MeshBuilder.CreateTube("headband", { path, radius: 0.022, tessellation: 8 }, scene);
  band.material = material;
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

/** How far a mesh reaches from `origin` along `direction`, counting only vertices near that line. */
function surfaceDepth(mesh, origin, direction, reach = 0.045) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  let depth = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] - origin.x;
    const y = positions[i + 1] - origin.y;
    const z = positions[i + 2] - origin.z;
    const along = x * direction.x + y * direction.y + z * direction.z;
    if (along <= depth) continue;
    if (x * x + y * y + z * z - along * along < reach * reach) depth = along;
  }
  return depth;
}

/** A gold chain under the chin with a pink pendant on the chest. */
function buildNecklace(scene) {
  const root = new TransformNode("necklace", scene);
  const gold = accessoryMaterial(scene, "necklaceGold", "#f0c14d");
  gold.specularColor = new Color3(0.7, 0.6, 0.3);
  const gemMat = accessoryMaterial(scene, "necklaceGem", "#ff8fb8");
  const chain = MeshBuilder.CreateTorus("necklaceChain", { diameter: 0.28, thickness: 0.022, tessellation: 22 }, scene);
  chain.parent = root;
  chain.position.y = -0.21;
  chain.scaling.set(1, 0.85, 0.9);
  chain.material = gold;
  const drop = MeshBuilder.CreateCylinder("necklaceDrop", { height: 0.045, diameter: 0.016, tessellation: 8 }, scene);
  drop.parent = root;
  drop.position.set(0, -0.25, 0.125);
  drop.material = gold;
  const pendant = MeshBuilder.CreateSphere("necklacePendant", { diameter: 0.05, segments: 12 }, scene);
  pendant.parent = root;
  pendant.position.set(0, -0.285, 0.14);
  pendant.material = gemMat;
  return { root, meshes: [chain, drop, pendant] };
}

/** A pink band worn over the hair, above the eyes. */
function buildWearHeadband(scene) {
  const band = MeshBuilder.CreateTorus("wearHeadband", { diameter: 0.46, thickness: 0.038, tessellation: 28 }, scene);
  band.position.y = 0.15;
  band.scaling.set(1, 1, 0.92);
  const material = accessoryMaterial(scene, "wearHeadbandMat", "#ff7eb3");
  material.zOffset = -5;
  band.material = material;
  return band;
}

/** A slim gold bangle with a pink bead, on the wrist. */
function buildBracelet(scene) {
  const root = new TransformNode("bracelet", scene);
  const gold = accessoryMaterial(scene, "braceletGold", "#f0c14d");
  gold.specularColor = new Color3(0.7, 0.6, 0.3);
  const band = MeshBuilder.CreateTorus("braceletBand", { diameter: 0.27, thickness: 0.022, tessellation: 16 }, scene);
  band.parent = root;
  band.position.y = -0.37;
  band.material = gold;
  const bead = MeshBuilder.CreateSphere("braceletBead", { diameter: 0.04, segments: 10 }, scene);
  bead.parent = root;
  bead.position.set(-0.12, -0.37, 0.04);
  bead.material = accessoryMaterial(scene, "braceletBeadMat", "#ff8fb8");
  return { root, meshes: [band, bead] };
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
