import {
  ArcRotateCamera,
  Color3,
  Color4,
  Curve3,
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
import { buildCostumes, costumeById, costumeSkin, POLICE_CAP } from "./costumes.js";
import { DANCE_LENGTH, danceById } from "./dances.js";
import { drawFace } from "./faces.js";
import { hexToColor3, mulberry32, paint, roundedBox, smoothstep, weld } from "./geometry.js";
import { fabricFontsReady, outfitById, paintOverlay, paintPattern, patternKey, patternNeedsFonts, POLICE_OUTFIT } from "./outfits.js";
import { disposeMaterial, fabricMaterial, furTextures, hairTextures, leatherMaterial, metalMaterial, skinMaterial, tintSkin } from "./surfaces.js";

export { hexToColor3 };

// Hip joint above the soles, before a build stretches the legs.
const HIP_Y = 0.7;
// Coaster carts are built round a hip sitting this high above the feet, in world meters.
const SEAT_HIP = 0.45;
// Visible yaw, lean, and landing settle. Physics speeds are unchanged; these only move the mesh.
const TURN_TAU = 0.045;
const TORSO_TAU = 0.05;
const LEAN_TAU = 0.06;
const STRETCH_TAU = 0.04;
const TRICK_TAU = 0.04;
const LAND_TAU = 0.032;
const JUMP_SQUAT = 0.16;
const JUMP_STRETCH = 0.11;
const SQUAT_TIME = 0.06;
const STRETCH_TIME = 0.1;
// Up from the hip joint to the shoulder joints, and to where the neck leaves the torso.
const TORSO_H = 0.375;
const NECK_BASE = 0.435;
const NECK = 0.05;
const NECK_R = 0.042;
// From the middle of the head up to the crown and down to the chin.
const HEAD_HALF = 0.18;
const HEAD_CHIN = 0.255;
// Shoulder joints out from the middle for a girl and a boy, before the build widens them.
const SHOULDER_X = [0.128, 0.142];
const LEG_X = 0.075;
// Arms hang this far out from the sides, in radians, so they clear the hips.
const ARM_OUT = 0.12;
const THIGH = 0.33;
const WRIST_Y = -0.455;
// The middle of the palm, on the shoulder pivot.
const HAND_Y = -0.505;
const BELT_Y = 0.083;
// Torso sections are superellipses this square.
const SECTION = 2.6;
// The bow sits on the upper back of the head, pushed out to wherever the current hair ends.
const BOW_ORIGIN = new Vector3(0, 0.06, -0.02);
const BOW_DIRECTION = new Vector3(0.1, 0.11, -0.15).normalize();
const FACE_W = 512;
const FACE_H = 536;

/**
 * Torso sections from the crotch to the base of the neck, up from the hip joint:
 * [height, half width, front depth, back depth]. A girl's hips are wider and a boy's shoulders.
 */
const TORSO_GIRL = [
  [-0.088, 0, 0, 0],
  [-0.08, 0.06, 0.045, 0.05],
  [-0.055, 0.118, 0.07, 0.086],
  [-0.02, 0.142, 0.08, 0.098],
  [0.03, 0.146, 0.082, 0.096],
  [0.1, 0.126, 0.076, 0.08],
  [0.17, 0.108, 0.072, 0.07],
  [0.24, 0.112, 0.08, 0.07],
  [0.3, 0.12, 0.086, 0.074],
  [0.35, 0.13, 0.082, 0.074],
  [0.385, 0.135, 0.07, 0.07],
  [0.41, 0.115, 0.058, 0.062],
  [0.43, 0.075, 0.048, 0.05],
  [0.445, 0.04, 0.035, 0.04],
  [0.452, 0, 0, 0],
];
const TORSO_BOY = [
  [-0.088, 0, 0, 0],
  [-0.08, 0.06, 0.045, 0.05],
  [-0.055, 0.112, 0.07, 0.08],
  [-0.02, 0.13, 0.078, 0.088],
  [0.03, 0.13, 0.08, 0.085],
  [0.1, 0.122, 0.078, 0.078],
  [0.17, 0.116, 0.078, 0.074],
  [0.24, 0.124, 0.085, 0.075],
  [0.3, 0.134, 0.09, 0.078],
  [0.35, 0.146, 0.086, 0.078],
  [0.385, 0.153, 0.074, 0.074],
  [0.41, 0.13, 0.06, 0.064],
  [0.43, 0.08, 0.05, 0.052],
  [0.445, 0.042, 0.036, 0.04],
  [0.452, 0, 0, 0],
];

// Limb outlines as [drop below the joint, radius], top to bottom.
const UPPER_ARM = [
  [0, 0.044],
  [0.07, 0.043],
  [0.16, 0.039],
  [0.25, 0.034],
];
const FOREARM = [
  [0.24, 0.035],
  [0.29, 0.037],
  [0.38, 0.031],
  [WRIST_Y * -1, 0.027],
];
const THIGH_SHAPE = [
  [0, 0.066],
  [0.08, 0.064],
  [0.2, 0.055],
  [THIGH, 0.044],
];
const SHIN_SHAPE = [
  [0, 0.043],
  [0.08, 0.049],
  [0.17, 0.042],
  [0.29, 0.03],
  [0.31, 0.029],
];

/**
 * Proportions per age, as multipliers on the kid rig: a kid is about six heads tall, a teen seven
 * and a half, a grown-up a little more, with longer limbs, a wider and deeper chest, and thicker
 * arms and legs (`limb`).
 */
const BUILDS = {
  kid: { scale: 0.9, legs: 1, torso: 1, arms: 1, head: 0.56, width: 1, depth: 1, limb: 1 },
  teen: { scale: 0.95, legs: 1.22, torso: 1.13, arms: 1.18, head: 0.52, width: 1.1, depth: 1.08, limb: 1.1 },
  adult: { scale: 1, legs: 1.26, torso: 1.18, arms: 1.24, head: 0.53, width: 1.16, depth: 1.16, limb: 1.22 },
};

export function buildAvatar(scene) {
  const root = new TransformNode("avatar", scene);
  const rig = new TransformNode("avatarRig", scene);
  rig.parent = root;
  rig.scaling.setAll(BUILDS.kid.scale);
  const body = new TransformNode("avatarBody", scene);
  body.parent = rig;
  // The torso and what's worn round it are built about the hip joint and stretched together by the build.
  const frame = new TransformNode("avatarTorsoFrame", scene);
  frame.parent = body;
  frame.position.y = HIP_Y;

  const materials = new Map();
  const skin = skinMaterial(scene, "avatarSkin");
  const materialFor = (pattern, repeat = 1, kind = "cloth") => {
    if (pattern === "skin") return skin;
    const key = `${patternKey(pattern)}|${repeat}|${kind}`;
    if (materials.has(key)) return materials.get(key);
    const name = `avatarCloth${materials.size}`;
    const material = kind === "shoe" ? leatherMaterial(scene, name) : fabricMaterial(scene, name);
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

  const torso = new Mesh("avatarTorso", scene);
  torso.parent = frame;
  const overlayTexture = new DynamicTexture("avatarOverlay", { width: 256, height: 256 }, scene, true);
  overlayTexture.hasAlpha = true;
  const overlayMat = fabricMaterial(scene, "avatarOverlayMat");
  overlayMat.diffuseTexture = overlayTexture;
  overlayMat.useAlphaFromDiffuseTexture = true;
  overlayMat.backFaceCulling = false;
  overlayMat.zOffset = -1;
  const overlay = new Mesh("avatarOverlay", scene);
  overlay.parent = frame;
  overlay.material = overlayMat;
  const skirt = new Mesh("avatarSkirt", scene);
  skirt.parent = frame;

  const neck = MeshBuilder.CreateCylinder("avatarNeck", { height: 1, diameter: 1, tessellation: 20 }, scene);
  neck.parent = body;
  neck.material = skin;

  const limb = (side, isArm) => {
    const pivot = new TransformNode(`${isArm ? "arm" : "leg"}${side}`, scene);
    pivot.parent = body;
    // Shin and foot hang off a knee so the coaster seat can fold them.
    // Arms stay one piece: cuffs, mitts, and held toys are placed on the shoulder pivot.
    const bend = isArm ? null : new TransformNode(`${pivot.name}Bend`, scene);
    if (bend) {
      bend.parent = pivot;
      bend.position.y = -THIGH;
    }
    const hang = (mesh, parent) => {
      mesh.parent = parent;
      return mesh;
    };
    const parts = isArm
      ? [
          hang(limbMesh(scene, `${pivot.name}-0`, UPPER_ARM), pivot),
          hang(limbMesh(scene, `${pivot.name}-1`, FOREARM), pivot),
          hang(buildHand(scene, `${pivot.name}-2`, side), pivot),
        ]
      : [
          hang(limbMesh(scene, `${pivot.name}-0`, THIGH_SHAPE), pivot),
          hang(limbMesh(scene, `${pivot.name}-1`, SHIN_SHAPE), bend),
          hang(buildShoe(scene, `${pivot.name}-2`), bend),
        ];
    return { side, pivot, bend, parts };
  };
  const arms = [limb(-1, true), limb(1, true)];
  const legs = [limb(-1, false), limb(1, false)];

  const headNode = new TransformNode("avatarHead", scene);
  headNode.parent = body;
  const head = buildHead(scene);
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
  const face = facePatch(scene, "avatarFaceMesh");
  face.parent = headNode;
  face.material = faceMat;

  // The hair's own vertex colors tint fine strands with a soft sheen running along them.
  const strands = hairTextures(scene);
  const hairMat = new StandardMaterial("avatarHair", scene);
  hairMat.diffuseColor = Color3.White();
  hairMat.diffuseTexture = strands.color;
  hairMat.bumpTexture = strands.bump;
  hairMat.bumpTexture.level = 0.55;
  hairMat.specularColor = new Color3(0.24, 0.22, 0.2);
  hairMat.specularPower = 44;
  hairMat.backFaceCulling = false;
  const choker = buildChoker(scene);
  const hairStyles = {
    long: { mesh: buildHair(scene), extras: [] },
    short: { mesh: buildShortHair(scene), extras: [] },
    shaggy: { mesh: buildShaggyHair(scene), extras: [] },
    buns: { mesh: buildBunHair(scene), extras: [] },
    headphones: { mesh: buildBraidHair(scene), extras: [...buildHeadphones(scene), choker] },
    waves: { mesh: buildHeadbandHair(scene), extras: buildHeadband(scene) },
    redwaves: { mesh: buildRedWaveHair(scene), extras: [] },
  };
  for (const entry of Object.values(hairStyles)) {
    entry.mesh.parent = headNode;
    entry.mesh.material = hairMat;
    const rest = entry.mesh.getVerticesData(VertexBuffer.PositionKind);
    const ys = rest.filter((_, index) => index % 3 === 1);
    // Hair is built painted in grays. Keep that as shading under whatever color the player picks.
    const baked = entry.mesh.getVerticesData(VertexBuffer.ColorKind);
    entry.mesh.metadata = {
      rest: Float32Array.from(rest),
      shade: baked ? Float32Array.from({ length: ys.length }, (_, index) => baked[index * 4]) : null,
      top: Math.max(...ys),
      bottom: Math.min(...ys),
      bowDepth: Math.max(HEAD_HALF + 0.02, surfaceDepth(entry.mesh, BOW_ORIGIN, BOW_DIRECTION)),
    };
    for (const extra of entry.extras) {
      extra.parent = headNode;
      extra.isPickable = false;
    }
  }

  const bowMat = fabricMaterial(scene, "avatarBow");
  bowMat.diffuseColor = hexToColor3("#ff8fb8");
  bowMat.specularColor = new Color3(0.16, 0.14, 0.15);
  const bow = buildBow(scene);
  bow.parent = headNode;
  bow.rotationQuaternion = new Quaternion();
  Quaternion.FromUnitVectorsToRef(new Vector3(0, 0, -1), BOW_DIRECTION, bow.rotationQuaternion);
  bow.scaling.setAll(1.15);
  bow.material = bowMat;

  const necklace = buildNecklace(scene);
  necklace.root.parent = body;
  necklace.root.setEnabled(false);
  const wearBand = buildWearHeadband(scene);
  wearBand.parent = headNode;
  wearBand.setEnabled(false);
  const bracelet = buildBracelet(scene);
  bracelet.root.parent = arms[0].pivot;
  bracelet.root.setEnabled(false);
  const held = buildHeldSquishies(scene);
  held.root.parent = arms[1].pivot;
  // Against the palm of the right hand, on the thumb side.
  held.root.position.set(-0.012, HAND_Y + 0.005, 0.105);
  held.root.rotation.set(0.85, -0.2, 0.15);
  held.root.setEnabled(false);
  const blaster = buildBlaster(scene);
  blaster.root.parent = arms[1].pivot;
  blaster.root.position.set(0, HAND_Y + 0.02, 0);
  blaster.root.setEnabled(false);
  let armed = false;
  // Middle of the left fist. Its scale undoes the arm's stretch, so anything held keeps its shape.
  const leftGrip = new TransformNode("avatarLeftGrip", scene);
  leftGrip.parent = arms[0].pivot;
  leftGrip.position.set(0, HAND_Y, 0);
  let leftHeld = false;
  const costumes = buildCostumes(scene, headNode, body, { arms, skin, hand: { wrist: WRIST_Y, palm: HAND_Y, radius: 0.03 } });

  const hoodMat = fabricMaterial(scene, "avatarHoodMat");
  hoodMat.diffuseTexture = furTextures(scene).color;
  hoodMat.backFaceCulling = false;
  const hood = buildHood(scene);
  hood.parent = headNode;
  hood.material = hoodMat;

  const beltMat = leatherMaterial(scene, "avatarBeltMat");
  beltMat.backFaceCulling = false;
  const buckleMat = metalMaterial(scene, "avatarBuckleMat", "#d1d3da");
  const belt = new TransformNode("avatarBelt", scene);
  belt.parent = frame;
  const beltStrap = new Mesh("avatarBeltStrap", scene);
  beltStrap.parent = belt;
  beltStrap.material = beltMat;
  const buckle = roundedBox(scene, "avatarBuckle", { width: 0.05, height: 0.036, depth: 0.008, radius: 0.004, segments: 3 });
  buckle.parent = belt;
  buckle.material = buckleMat;
  const buckleHole = MeshBuilder.CreateBox("avatarBuckleHole", { width: 0.03, height: 0.017, depth: 0.004 }, scene);
  buckleHole.parent = buckle;
  buckleHole.position.z = 0.003;
  buckleHole.material = beltMat;

  const hipClothTexture = new DynamicTexture("avatarHipCloth", { width: 128, height: 256 }, scene, true);
  hipClothTexture.hasAlpha = true;
  const hipClothMat = fabricMaterial(scene, "avatarHipClothMat");
  hipClothMat.diffuseTexture = hipClothTexture;
  hipClothMat.useAlphaFromDiffuseTexture = true;
  hipClothMat.backFaceCulling = false;
  const hipCloth = buildHipCloth(scene);
  hipCloth.parent = legs[0].pivot;
  hipCloth.position.set(-0.064, -0.01, 0.064);
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
    neck,
    head,
    ...Object.values(hairStyles).flatMap((entry) => [entry.mesh, ...entry.extras]),
    bow,
    ...necklace.meshes,
    wearBand,
    ...bracelet.meshes,
    ...held.meshes,
    ...blaster.meshes,
    ...costumes.meshes,
    hood,
    beltStrap,
    buckle,
    hipCloth,
    ...arms.flatMap((a) => a.parts),
    ...legs.flatMap((l) => l.parts),
  ];
  let squash = 0;
  let rigLift = 0;
  let flipPivot = HIP_Y + 0.25;
  let phase = 0;
  let walkBlend = 0;
  let runBlend = 0;
  let airBlend = 0;
  let flyBlend = 0;
  let hangBlend = 0;
  let swimBlend = 0;
  let treadBlend = 0;
  let climbBlend = 0;
  let swimPhase = 0;
  // How far a taller build must drop so its hip lands on the same cart seat as a kid.
  let sitDrop = 0;
  let move = null;
  let lastMove = null;
  let danceTime = 0;
  let danceLoop = false;
  let danceBlend = 0;
  let visualYaw = null;
  let torsoYaw = 0;
  let leanPitch = 0;
  let shownStretch = 0;
  let airT = 0;
  let wasAirborne = false;
  let flipPitch = 0;
  let flipSpin = 0;
  let shownWave = 0;
  let trickKind = null;
  let height = 1.28;
  // Sections of the torso for the current girl-to-boy mix, and how the build stretches them.
  let torsoMix = null;
  let sections = null;
  let build = BUILDS.kid;

  /** The torso's half width and front and back depth at height `y` in body space, as built now. */
  const section = (y) => {
    const at = sectionAt(sections, (y - HIP_Y) / build.torso);
    return { halfWidth: at.w * build.width, front: at.f * build.depth, back: at.b * build.depth };
  };

  const rebuildTorso = (mix) => {
    sections = torsoSections(mix);
    loft(torso, sections, { u: 1.5, v: 0.48 });
    loft(overlay, sections, { from: -0.03, to: NECK_BASE + 0.01, rows: 24, theta: 0.46 * Math.PI, columns: 28, grow: () => 0.003 });
    // Hugs the hips, then flares out over the thighs.
    loft(skirt, sections, {
      from: 0.13,
      to: -0.27,
      rows: 14,
      clampBelow: 0.03,
      grow: (y) => 0.008 + 0.12 * smoothstep(0.04, -0.27, y) ** 1.2,
      u: 1,
      v: 0.48,
      doubleSided: true,
    });
    loft(beltStrap, sections, { from: BELT_Y - 0.022, to: BELT_Y + 0.022, rows: 2, grow: () => 0.005, u: 6, v: 1 });
    buckle.position.set(0, BELT_Y, sectionAt(sections, BELT_Y).f + 0.009);
  };

  const shape = (age, boy) => {
    build = BUILDS[age] ?? BUILDS.kid;
    const mix = boy ? (age === "kid" ? 0.65 : 1) : age === "kid" ? 0.35 : 0;
    if (mix !== torsoMix) {
      torsoMix = mix;
      rebuildTorso(mix);
    }
    rig.scaling.setAll(build.scale);
    // Longer legs reach further below the hip, so lift the rig to keep the feet on the ground.
    rigLift = HIP_Y * (build.legs - 1) * build.scale;
    sitDrop = HIP_Y * build.legs - SEAT_HIP / build.scale;
    flipPivot = HIP_Y + 0.25 * build.torso;
    rig.position.y = rigLift;
    frame.scaling.set(build.width, build.torso, build.depth);
    const shoulderX = (SHOULDER_X[0] + (SHOULDER_X[1] - SHOULDER_X[0]) * mix) * build.width;
    for (const arm of arms) {
      arm.pivot.position.set(arm.side * shoulderX, HIP_Y + TORSO_H * build.torso, 0);
      arm.pivot.scaling.set(build.limb, build.arms, build.limb);
    }
    for (const leg of legs) {
      leg.pivot.position.set(leg.side * LEG_X * build.width, HIP_Y, 0);
      leg.pivot.scaling.set(build.limb, build.legs, build.limb);
    }
    leftGrip.scaling.set(1 / build.limb, 1 / build.arms, 1 / build.limb);
    blaster.root.scaling.copyFrom(leftGrip.scaling);
    const neckBase = HIP_Y + NECK_BASE * build.torso;
    headNode.scaling.setAll(build.head);
    headNode.position.y = neckBase + NECK * build.torso + HEAD_CHIN * build.head;
    const neckBottom = neckBase - 0.035 * build.torso;
    const neckTop = headNode.position.y - 0.12 * build.head;
    const neckWidth = NECK_R * 2 * build.limb;
    neck.position.set(0, (neckBottom + neckTop) / 2, -0.004);
    neck.scaling.set(neckWidth, neckTop - neckBottom, neckWidth * 0.94);
    const pendantY = neckBase - 0.075 * build.torso;
    necklace.fit(neckBase + 0.004 * build.torso, NECK_R * build.limb, pendantY, section(pendantY).front);
    const neckInHead = (NECK_R * build.limb) / build.head;
    choker.position.set(0, -HEAD_CHIN - (NECK * build.torso * 0.5) / build.head, 0);
    choker.scaling.setAll((neckInHead + 0.012) * 2);
    height = rig.position.y + (headNode.position.y + (HEAD_HALF + 0.05) * build.head) * build.scale;
    return {
      top: HIP_Y + 0.4 * build.torso,
      bottom: HIP_Y - 0.45 * build.legs,
      hip: HIP_Y,
      wide: build.width,
      deep: build.depth,
      neck: neckBase,
      neckRadius: NECK_R * build.limb,
      section,
      /** Fits `mesh` as a band round the torso from `from` to `to` above the hip joint, `grow` out from it. */
      band(mesh, from, to, grow) {
        loft(mesh, sections, { from, to, rows: 2, grow: () => grow, u: 6, v: 1 });
        mesh.position.set(0, HIP_Y, 0);
        mesh.scaling.copyFrom(frame.scaling);
      },
    };
  };

  /**
   * Long hair below the chin lies on the back and chest instead of sinking into them. Everything
   * from the body's middle out to just past its surface is squeezed into a thin layer on the
   * surface, in order, so locks keep their thickness and front faces stay in front.
   */
  const drape = (mesh) => {
    const rest = mesh.metadata.rest;
    const positions = Float32Array.from(rest);
    const scale = headNode.scaling.y;
    const center = headNode.position.y;
    const bottom = HIP_Y - 0.1;
    const top = HIP_Y + (NECK_BASE + 0.01) * build.torso;
    const margin = 0.004;
    const layer = 0.016;
    for (let i = 0; i < rest.length; i += 3) {
      const y = center + rest[i + 1] * scale;
      if (y > top || y < bottom) continue;
      const at = section(y);
      const across = Math.abs(rest[i] * scale) / (at.halfWidth + margin);
      if (across >= 1) continue;
      const reach = (1 - across ** SECTION) ** (1 / SECTION);
      const z = rest[i + 2] * scale;
      const surface = ((z < 0 ? at.back : at.front) + margin) * reach;
      const depth = Math.abs(z);
      if (depth >= surface + layer) continue;
      positions[i + 2] = (Math.sign(z || 1) * (surface + (layer * depth) / (surface + layer))) / scale;
    }
    mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    mesh.refreshBoundingInfo();
  };
  shape("kid", false);

  return {
    root,
    parts,
    get height() {
      return height;
    },
    apply(look) {
      // "Play as police" wears the uniform and cap over whatever outfit and costume are picked.
      if (look.police) look = { ...look, outfit: POLICE_OUTFIT.id, costume: POLICE_CAP.id };
      const boy = look.body === "boy";
      const outfit = outfitById(look.outfit);
      const fit = shape(look.age, boy);
      const hat = costumeById(look.costume).head;
      // Boys wear a dress outfit as a shirt with matching shorts and suspenders.
      const shorts = boy && Boolean(outfit.skirt);
      tintSkin(skin, costumeSkin(look.costume, look.skinColor));
      torso.material = materialFor(shorts ? outfit.sleeve : outfit.torso, 2);
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
        leg.parts[2].material = materialFor(outfit.shoes, 1, "shoe");
      }
      faceId = look.face;
      paintFace();
      const hairStyle = hairStyles[look.hair] ? look.hair : boy ? "short" : "long";
      let hairTop = HEAD_HALF;
      for (const [style, entry] of Object.entries(hairStyles)) {
        const active = style === hairStyle;
        entry.mesh.setEnabled(active);
        for (const extra of entry.extras) extra.setEnabled(active);
        if (!active) continue;
        hairTop = Math.max(HEAD_HALF, entry.mesh.metadata.top);
        drape(entry.mesh);
        colorHair(entry.mesh, look.hairColor, entry.mesh.metadata.top, entry.mesh.metadata.bottom);
        bow.position.copyFrom(BOW_DIRECTION).scaleInPlace(entry.mesh.metadata.bowDepth + 0.022).addInPlace(BOW_ORIGIN);
      }
      costumes.apply(look.costume, { hairTop, ...fit });
      hood.setEnabled(Boolean(outfit.hood) && !hat);
      if (outfit.hood) hoodMat.diffuseColor = hexToColor3(outfit.hood);
      bow.setEnabled(look.bow && !outfit.hood && !hat);
      necklace.root.setEnabled(Boolean(look.necklace));
      wearBand.setEnabled(Boolean(look.headband) && !outfit.hood && !hat);
      bracelet.root.setEnabled(Boolean(look.bracelet));
      held.show(look.held);
      if (armed) held.root.setEnabled(false);
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
    /** Holds the toy blaster out in the right hand, in place of any held squishy. */
    setArmed(on) {
      armed = on;
      blaster.root.setEnabled(on);
      held.root.setEnabled(!on && Boolean(held.id));
    },
    /** Holds `node` up in the left fist, its +z running out of the fist (up while held). */
    holdLeft(node) {
      node.parent = leftGrip;
      leftHeld = true;
    },
    dispose() {
      // Outfit materials swapped out by an earlier apply() are no longer on any mesh.
      const owned = new Set(materials.values());
      for (const mesh of root.getChildMeshes()) if (mesh.material) owned.add(mesh.material);
      root.dispose(false, false);
      for (const material of owned) {
        if (scene.materials.includes(material)) disposeMaterial(material);
      }
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
      const aimYaw = pose.facing + turnToCamera * danceBlend;
      if (visualYaw === null) visualYaw = aimYaw;
      else visualYaw = lerpAngle(visualYaw, aimYaw, 1 - Math.exp(-dt / TURN_TAU));
      root.rotation.y = visualYaw;
      const yawLag = wrapAngle(aimYaw - visualYaw);
      const torsoTarget = Math.max(-0.4, Math.min(0.4, yawLag * 0.5));
      torsoYaw += (torsoTarget - torsoYaw) * (1 - Math.exp(-dt / TORSO_TAU));
      squash += (0 - squash) * Math.min(1, dt * 7);
      const airborne = pose.airborne;
      walkBlend += ((pose.moving && !airborne ? 1 : 0) - walkBlend) * Math.min(1, dt * 10);
      airBlend += ((airborne ? 1 : 0) - airBlend) * Math.min(1, dt * 12);
      runBlend += ((pose.running && pose.moving && !airborne ? 1 : 0) - runBlend) * Math.min(1, dt * 8);
      phase += dt * (pose.moving ? 11 * (pose.stride ?? 1) : 0);
      const legSwing = Math.sin(phase) * (0.75 + 0.4 * runBlend) * walkBlend;
      const armSwing = Math.sin(phase) * (0.75 + 0.5 * runBlend) * walkBlend;
      const pump = 0.35 * runBlend;
      const breathe = Math.sin(pose.time * 2.4) * 0.03 * (1 - walkBlend);
      arms[0].pivot.rotation.set(-armSwing - pump - airBlend * 2.6, 0, -ARM_OUT - airBlend * 0.35 - breathe);
      arms[1].pivot.rotation.set(armSwing - pump - airBlend * 2.6, 0, ARM_OUT + airBlend * 0.35 + breathe);
      legs[0].pivot.rotation.set(legSwing - airBlend * 0.45, 0, 0);
      legs[1].pivot.rotation.set(-legSwing + airBlend * 0.25, 0, 0);
      // The trailing knee folds as it swings back, more when running.
      const knee = (side) => Math.max(0, Math.sin(phase + (side > 0 ? Math.PI : 0) - 0.6)) * (0.5 + 0.7 * runBlend) * walkBlend;
      legs[0].bend.rotation.set(knee(-1) + airBlend * 0.5, 0, 0);
      legs[1].bend.rotation.set(knee(1) + airBlend * 0.3, 0, 0);
      const poseAir = Boolean(airborne) && !pose.sitting;
      if (poseAir && !wasAirborne) airT = 0;
      if (poseAir) airT += dt;
      wasAirborne = poseAir;
      const stretchTarget = poseAir ? airStretchTarget(airT) : -squash;
      shownStretch += (stretchTarget - shownStretch) * (1 - Math.exp(-dt / STRETCH_TAU));
      let stretch = shownStretch;
      const leanTarget = poseAir ? 0.4 : 0.2 * runBlend;
      leanPitch += (leanTarget - leanPitch) * (1 - Math.exp(-dt / LEAN_TAU));
      body.position.y = Math.abs(Math.sin(phase)) * (0.04 + 0.05 * runBlend) * walkBlend;
      body.rotation.set(leanPitch, torsoYaw, 0);
      headNode.rotation.set(-0.12 * runBlend, 0, Math.sin(phase * 0.5) * 0.04 * walkBlend);
      const flying = Boolean(pose.flying);
      costumes.update({ time: pose.time, walk: walkBlend, run: runBlend, air: airBlend, flying });
      const toward = (node, x, y, z, amount) => {
        node.rotation.x += (x - node.rotation.x) * amount;
        node.rotation.y += (y - node.rotation.y) * amount;
        node.rotation.z += (z - node.rotation.z) * amount;
      };

      // Angel flight: arms out like wings, body tipped into the glide, legs trailing.
      flyBlend += ((flying ? 1 : 0) - flyBlend) * Math.min(1, dt * 8);
      if (flyBlend > 0.001) {
        const beat = Math.sin(pose.time * 24) * 0.25;
        toward(arms[0].pivot, -0.25, 0, -1.35 - beat, flyBlend);
        toward(arms[1].pivot, -0.25, 0, 1.35 + beat, flyBlend);
        toward(legs[0].pivot, 0.35, 0, 0, flyBlend);
        toward(legs[1].pivot, 0.25, 0, 0, flyBlend);
        body.rotation.x += (0.35 - body.rotation.x) * flyBlend;
      }

      // Zipline: both hands up on the handle, legs dangling.
      hangBlend += ((pose.hanging ? 1 : 0) - hangBlend) * Math.min(1, dt * 12);
      if (hangBlend > 0.001) {
        toward(arms[0].pivot, -3.05, 0, -0.14, hangBlend);
        toward(arms[1].pivot, -3.05, 0, 0.14, hangBlend);
        toward(legs[0].pivot, 0.25 + Math.sin(pose.time * 7) * 0.12, 0, 0, hangBlend);
        toward(legs[1].pivot, -0.05 - Math.sin(pose.time * 7) * 0.12, 0, 0, hangBlend);
      }

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
      const trickLive = Boolean(trick) && airborne;
      if (trickLive) trickKind = trick;
      const waveTarget = trickLive ? Math.sin(trickP * Math.PI) : 0;
      shownWave += (waveTarget - shownWave) * (1 - Math.exp(-dt / (trickLive ? TRICK_TAU : LAND_TAU)));
      if (!trickLive && shownWave < 0.004) {
        shownWave = 0;
        trickKind = null;
      }
      const wave = shownWave;
      const blendPose = (node, x, y, z, amount) => {
        node.rotation.x += (x - node.rotation.x) * amount;
        node.rotation.y += (y - node.rotation.y) * amount;
        node.rotation.z += (z - node.rotation.z) * amount;
      };
      if (trickKind === "spin") {
        blendPose(arms[0].pivot, -0.2, 0, -2.2, wave);
        blendPose(arms[1].pivot, -0.2, 0, 2.2, wave);
        blendPose(legs[0].pivot, 0.2, 0, -0.28, wave);
        blendPose(legs[1].pivot, -0.15, 0, 0.28, wave);
      } else if (wave > 0) {
        blendPose(arms[0].pivot, -1.65, 0, 0.9, wave);
        blendPose(arms[1].pivot, -1.65, 0, -0.9, wave);
        blendPose(legs[0].pivot, -1.2, 0, -0.1, wave);
        blendPose(legs[1].pivot, -1.2, 0, 0.1, wave);
        blendPose(legs[0].bend, 1.6, 0, 0, wave);
        blendPose(legs[1].bend, 1.6, 0, 0, wave);
        blendPose(headNode, 0.5, 0, 0, wave);
        stretch += 0.12 * wave;
      }

      const eased = trickP * trickP * (3 - 2 * trickP);
      const wantPitch = trickLive && trick === "front" ? eased * Math.PI * 2 : trickLive && trick === "back" ? -eased * Math.PI * 2 : 0;
      const wantSpin = trickLive && trick === "spin" ? eased * Math.PI * 2 : 0;
      if (trickLive) {
        const follow = 1 - Math.exp(-dt / TRICK_TAU);
        flipPitch += (wantPitch - flipPitch) * follow;
        flipSpin += (wantSpin - flipSpin) * follow;
      } else {
        flipPitch = wrapAngle(flipPitch);
        flipSpin = wrapAngle(flipSpin);
        const settle = 1 - Math.exp(-dt / LAND_TAU);
        flipPitch += (0 - flipPitch) * settle;
        flipSpin += (0 - flipSpin) * settle;
        if (Math.abs(flipPitch) < 0.008) flipPitch = 0;
        if (Math.abs(flipSpin) < 0.008) flipSpin = 0;
      }
      // Flip round the chest so the feet and head trade places instead of spinning round the toes.
      const pivot = flipPivot * rig.scaling.y;
      const cos = Math.cos(flipPitch);
      const sin = Math.sin(flipPitch);
      rig.rotation.set(flipPitch, flipSpin, 0);
      rig.position.set(0, rigLift + pivot * (1 - cos), -pivot * sin);

      const hold = held.id && !armed ? (1 - flyBlend) * (1 - hangBlend) * (1 - danceBlend) * (1 - wave) : 0;
      if (hold > 0.001) toward(arms[1].pivot, -1.25, -0.15, 0.55, hold);
      const aim = armed ? (1 - flyBlend) * (1 - hangBlend) * (1 - danceBlend) * (1 - wave) : 0;
      if (aim > 0.001) toward(arms[1].pivot, -1.5, 0, 0.1, aim);
      const grip = leftHeld ? (1 - flyBlend) * (1 - hangBlend) * (1 - danceBlend) * (1 - wave) : 0;
      if (grip > 0.001) toward(arms[0].pivot, -1.2, 0.15, -0.35, grip);
      if (held.id) {
        const pulse = 1 + Math.sin(pose.time * 3.2) * 0.045;
        const armScale = arms[1].pivot.scaling.y || 1;
        const thick = arms[1].pivot.scaling.x || 1;
        held.root.scaling.set(pulse / thick, pulse / armScale, pulse / thick);
      }

      // Swimming: tipped forward into a front crawl with a flutter kick. Treading water: upright,
      // slow arm and leg sweeps. Climbing out: hands on the edge, pull up, knee over.
      swimBlend += ((pose.swimming ? 1 : 0) - swimBlend) * Math.min(1, dt * 5);
      treadBlend += ((pose.treading ? 1 : 0) - treadBlend) * Math.min(1, dt * 5);
      climbBlend += ((pose.climbing ? 1 : 0) - climbBlend) * Math.min(1, dt * 14);
      swimPhase += dt * (5.5 + 1.2 * Math.min(4, pose.swimSpeed ?? 0));
      if (swimBlend + treadBlend + climbBlend > 0.001) {
        const t = pose.time;
        if (swimBlend > 0.001) {
          arms.forEach((arm, i) => {
            const reach = ((swimPhase + i * Math.PI) % (Math.PI * 2)) - Math.PI;
            toward(arm.pivot, reach, 0, (i ? 1 : -1) * 0.22, swimBlend);
          });
          legs.forEach((leg, i) => {
            toward(leg.pivot, 0.1 + Math.sin(t * 11 + i * Math.PI) * 0.32, 0, 0, swimBlend);
            toward(leg.bend, 0.18, 0, 0, swimBlend);
          });
          toward(headNode, -0.85, 0, 0, swimBlend);
          body.rotation.z += Math.sin(swimPhase) * 0.14 * swimBlend;
        }
        if (treadBlend > 0.001) {
          arms.forEach((arm, i) => {
            const side = i ? 1 : -1;
            toward(arm.pivot, -0.95 + Math.sin(t * 3.2 + i) * 0.15, side * Math.sin(t * 3.2) * 0.4, side * (0.85 + Math.sin(t * 3.2 + 1.2) * 0.3), treadBlend);
          });
          legs.forEach((leg, i) => {
            toward(leg.pivot, -0.45 + Math.sin(t * 4 + i * Math.PI) * 0.35, 0, (i ? 1 : -1) * 0.12, treadBlend);
            toward(leg.bend, 0.8 + Math.sin(t * 4 + i * Math.PI + 1) * 0.35, 0, 0, treadBlend);
          });
          body.position.y += Math.sin(t * 2.6) * 0.015 * treadBlend;
        }
        const p = Math.min(1, Math.max(0, pose.climbing || 0));
        if (climbBlend > 0.001) {
          const push = smoothstep(0.35, 0.7, p);
          for (const [i, arm] of arms.entries()) toward(arm.pivot, -2.4 + 2.1 * push, 0, (i ? 1 : -1) * 0.3, climbBlend);
          toward(legs[0].pivot, -0.2 - 1.3 * smoothstep(0.5, 0.85, p), 0, 0, climbBlend);
          toward(legs[0].bend, 0.3 + 1.3 * smoothstep(0.5, 0.85, p), 0, 0, climbBlend);
          toward(legs[1].pivot, 0.25, 0, 0, climbBlend);
          toward(legs[1].bend, 0.4, 0, 0, climbBlend);
        }
        // Tip the whole rig round the chest, on top of any flip.
        const tilt = flipPitch + 1.25 * swimBlend + 0.12 * treadBlend + 0.55 * climbBlend * (1 - p * 0.8);
        const swimPivot = flipPivot * rig.scaling.y;
        rig.rotation.x = tilt;
        rig.position.y = rigLift + swimPivot * (1 - Math.cos(tilt)) + 0.06 * swimBlend;
        rig.position.z = -swimPivot * Math.sin(tilt);
      }

      // Coaster seat: hips down, knees up, hands on the lap. Snaps off when the ride ends (not the zipline hang).
      const sitting = Boolean(pose.sitting);
      if (sitting) {
        body.position.y = -sitDrop;
        body.rotation.set(-0.05, 0, 0);
        headNode.rotation.set(0.08, 0, 0);
        legs[0].pivot.rotation.set(-1.75, 0, -0.1);
        legs[1].pivot.rotation.set(-1.75, 0, 0.1);
        legs[0].bend.rotation.set(1.6, 0, 0);
        legs[1].bend.rotation.set(1.6, 0, 0);
        arms[0].pivot.rotation.set(-0.7, 0.1, 0.32);
        arms[1].pivot.rotation.set(-0.7, -0.1, -0.32);
        skirt.rotation.x = 0.22;
      } else {
        skirt.rotation.x = 0;
      }

      body.scaling.set(1 - stretch * 0.5, 1 + stretch, 1 - stretch * 0.5);
    },
  };
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(from, to, t) {
  return from + wrapAngle(to - from) * t;
}

/** Squash on takeoff, then stretch. Starts at 0 so a jump doesn't pop the body scale. */
function airStretchTarget(t) {
  if (t < SQUAT_TIME) return -JUMP_SQUAT * smoothstep(0, SQUAT_TIME, t);
  const rise = smoothstep(SQUAT_TIME, SQUAT_TIME + STRETCH_TIME, t);
  return -JUMP_SQUAT + (JUMP_STRETCH + JUMP_SQUAT) * rise;
}

function signPow(value, power) {
  return Math.sign(value) * Math.abs(value) ** power;
}

/** The girl and boy torso outlines mixed by `mix`, smoothed into many more sections. */
function torsoSections(mix) {
  const rows = TORSO_GIRL.map((girl, index) => girl.map((value, k) => value + (TORSO_BOY[index][k] - value) * mix));
  const out = [];
  const pick = (index) => rows[Math.max(0, Math.min(rows.length - 1, index))];
  for (let i = 0; i < rows.length - 1; i += 1) {
    const steps = i === 0 || i === rows.length - 2 ? 2 : 3;
    for (let k = 0; k < steps; k += 1) {
      const t = k / steps;
      const [a, b, c, d] = [pick(i - 1), pick(i), pick(i + 1), pick(i + 2)];
      const value = (n) =>
        0.5 * (2 * b[n] + (-a[n] + c[n]) * t + (2 * a[n] - 5 * b[n] + 4 * c[n] - d[n]) * t * t + (-a[n] + 3 * b[n] - 3 * c[n] + d[n]) * t * t * t);
      out.push({ y: value(0), w: Math.max(0, value(1)), f: Math.max(0, value(2)), b: Math.max(0, value(3)) });
    }
  }
  const last = rows[rows.length - 1];
  out.push({ y: last[0], w: 0, f: 0, b: 0 });
  return out;
}

/** The section at height `y`, between the two nearest built ones. */
function sectionAt(sections, y) {
  if (y <= sections[0].y) return sections[0];
  for (let i = 1; i < sections.length; i += 1) {
    const next = sections[i];
    if (y > next.y) continue;
    const prev = sections[i - 1];
    const t = (y - prev.y) / (next.y - prev.y || 1);
    return { y, w: prev.w + (next.w - prev.w) * t, f: prev.f + (next.f - prev.f) * t, b: prev.b + (next.b - prev.b) * t };
  }
  return sections[sections.length - 1];
}

/**
 * Builds `mesh` as a surface through the torso `sections`: the whole torso by default, or rows
 * evenly spaced from `from` to `to`, part way round (`theta` either side of the front) and grown
 * out by `grow(y)`. `u` and `v` set how many texture tiles go round and per unit of height.
 */
function loft(mesh, sections, options) {
  const { from, to, rows: count, theta = Math.PI, columns = 40, grow = () => 0, u = 1, v = 1, clampBelow = -Infinity, doubleSided = false } = options;
  const heights = from === undefined ? sections.map((s) => s.y) : Array.from({ length: count + 1 }, (_, j) => from + ((to - from) * j) / count);
  const base = heights[0];
  const positions = [];
  const uvs = [];
  const indices = [];
  const square = 2 / SECTION;
  const partial = theta < Math.PI;
  for (const [j, y] of heights.entries()) {
    const at = from === undefined ? sections[j] : sectionAt(sections, Math.max(y, clampBelow));
    const g = at.w > 0 ? grow(y) : 0;
    for (let i = 0; i <= columns; i += 1) {
      // Round from the back, out past +x, across the front, and back by -x, so prints read the right way.
      const share = i / columns;
      const angle = partial ? theta - 2 * theta * share : Math.PI - 2 * Math.PI * share;
      const s = Math.sin(angle);
      const c = Math.cos(angle);
      const depth = (c >= 0 ? at.f : at.b) + g;
      positions.push((at.w + g) * signPow(s, square), y, depth * signPow(c, square));
      uvs.push(share * u, partial ? (y - base) / (heights[heights.length - 1] - base) : Math.abs(y - base) / v);
    }
  }
  const row = columns + 1;
  for (let j = 0; j < heights.length - 1; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const middle = (heights[0] + heights[heights.length - 1]) / 2;
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  let score = 0;
  for (let i = 0; i < positions.length; i += 3) score += normals[i] * positions[i] + normals[i + 1] * (positions[i + 1] - middle) + normals[i + 2] * positions[i + 2];
  if (score < 0) {
    for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
    VertexData.ComputeNormals(positions, indices, normals);
  }
  weld(positions, normals);
  const data = new VertexData();
  if (doubleSided) {
    const count3 = positions.length / 3;
    data.positions = [...positions, ...positions];
    data.normals = [...normals, ...Array.from(normals, (n) => -n)];
    data.uvs = [...uvs, ...uvs];
    const inside = [];
    for (let t = 0; t < indices.length; t += 3) inside.push(indices[t] + count3, indices[t + 2] + count3, indices[t + 1] + count3);
    data.indices = [...indices, ...inside];
  } else {
    data.positions = positions;
    data.normals = normals;
    data.uvs = uvs;
    data.indices = indices;
  }
  data.applyToMesh(mesh, true);
  mesh.refreshBoundingInfo();
}

/** A rounded limb hanging from its joint, through the [drop, radius] `outline`. */
function limbMesh(scene, name, outline) {
  const shape = [];
  const [topDrop, topRadius] = outline[0];
  const [endDrop, endRadius] = outline[outline.length - 1];
  for (let i = 0; i <= 5; i += 1) {
    const a = (i / 5) * (Math.PI / 2);
    shape.push(new Vector3(Math.max(0.0001, endRadius * Math.sin(a)), -endDrop - endRadius * 0.85 * Math.cos(a), 0));
  }
  for (let k = outline.length - 2; k >= 1; k -= 1) shape.push(new Vector3(outline[k][1], -outline[k][0], 0));
  for (let i = 0; i <= 5; i += 1) {
    const a = (i / 5) * (Math.PI / 2);
    shape.push(new Vector3(Math.max(0.0001, topRadius * Math.cos(a)), -topDrop + topRadius * 0.9 * Math.sin(a), 0));
  }
  return MeshBuilder.CreateLathe(name, { shape, tessellation: 22 }, scene);
}

/** A relaxed hand hanging from the wrist: palm toward the leg, fingers loosely curled, thumb in front. */
function buildHand(scene, name, side) {
  const palm = roundedBox(scene, `${name}Palm`, { width: 0.03, height: 0.07, depth: 0.066, radius: 0.013, segments: 4 });
  palm.position.set(0, WRIST_Y - 0.035, 0.002);
  const fingers = roundedBox(scene, `${name}Fingers`, { width: 0.025, height: 0.062, depth: 0.06, radius: 0.0115, segments: 4 });
  fingers.position.set(-side * 0.006, WRIST_Y - 0.088, -0.002);
  fingers.rotation.z = -side * 0.22;
  const thumb = MeshBuilder.CreateCapsule(`${name}Thumb`, { radius: 0.0105, height: 0.058, tessellation: 10, subdivisions: 1, capSubdivisions: 4 }, scene);
  thumb.position.set(-side * 0.008, WRIST_Y - 0.043, 0.034);
  thumb.rotation.set(0.45, 0, -side * 0.25);
  const hand = Mesh.MergeMeshes([palm, fingers, thumb], true, true);
  hand.name = name;
  return hand;
}

/** A trainer: rounded toe, a little heel, and a sole that sits flat on the ground. */
function buildShoe(scene, name) {
  const upper = roundedBox(scene, `${name}Upper`, { width: 0.084, height: 0.066, depth: 0.19, radius: 0.03, segments: 5 });
  upper.position.set(0, -0.31 - 0.03, 0.038);
  const sole = roundedBox(scene, `${name}Sole`, { width: 0.09, height: 0.016, depth: 0.205, radius: 0.007, segments: 3 });
  sole.position.set(0, -0.31 - 0.06 + 0.008, 0.038);
  const shoe = Mesh.MergeMeshes([upper, sole], true, true);
  shoe.name = name;
  return shoe;
}

/** Radius of the head round its middle at height `y`: a rounded crown, straight sides, and a jaw tapering to the chin. */
function headRadius(y) {
  if (y > 0.105) return 0.115 + Math.sqrt(Math.max(0, 0.075 ** 2 - (y - 0.105) ** 2));
  if (y > -0.06) return 0.19;
  const t = Math.min(1, (y + 0.06) / -(HEAD_CHIN - 0.06));
  return 0.19 * Math.sqrt(Math.max(0, 1 - t * t)) ** 0.75;
}

/** A point on the head `angle` round from the face at height `y`, pushed out by `lift`. The jaw narrows and the chin juts forward. */
function headSurface(angle, y, lift = 0) {
  const r = headRadius(y) + lift;
  const jaw = smoothstep(-0.06, -HEAD_CHIN, y);
  const ahead = Math.cos(angle) * r;
  return [-Math.sin(angle) * r * (1 - 0.2 * jaw), y, ahead >= 0 ? ahead : ahead * (1 - 0.45 * jaw)];
}

/** A grid over `point(i, j)` with its UVs, normals welded across the seam, faces pointing out of `center`. */
function gridMesh(scene, name, columns, rows, point, center, uv) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= columns; i += 1) {
      positions.push(...point(i, j));
      uvs.push(...uv(i, j));
    }
  }
  const row = columns + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);
  let score = 0;
  for (let i = 0; i < positions.length; i += 3) {
    score += normals[i] * (positions[i] - center[0]) + normals[i + 1] * (positions[i + 1] - center[1]) + normals[i + 2] * (positions[i + 2] - center[2]);
  }
  if (score < 0) {
    for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
    VertexData.ComputeNormals(positions, indices, normals);
  }
  weld(positions, normals);
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  data.applyToMesh(mesh);
  return mesh;
}

/** The head: a rounded crown, a jaw and chin below the face, and an ear on each side. */
function buildHead(scene) {
  const heights = [HEAD_HALF];
  for (let i = 0; i <= 6; i += 1) heights.push(0.105 + 0.075 * Math.cos((i / 6) * (Math.PI / 2)));
  heights.push(0.03, -0.06);
  for (let i = 1; i <= 10; i += 1) heights.push(-0.06 - (i / 10) * (HEAD_CHIN - 0.06));
  const columns = 40;
  const skull = gridMesh(
    scene,
    "avatarHeadMesh",
    columns,
    heights.length - 1,
    (i, j) => (j === 0 ? [0, HEAD_HALF, 0] : headSurface((i / columns) * Math.PI * 2, heights[j])),
    [0, -0.02, 0],
    (i, j) => [i / columns, 1 - j / (heights.length - 1)],
  );
  const ears = [-1, 1].map((side) => {
    const ear = MeshBuilder.CreateSphere(`avatarEar${side}`, { diameter: 1, segments: 12 }, scene);
    ear.scaling.set(0.034, 0.105, 0.068);
    ear.rotation.set(0, side * 0.32, side * -0.06);
    ear.position.set(side * 0.186, -0.035, -0.022);
    return ear;
  });
  const head = Mesh.MergeMeshes([skull, ...ears], true, true);
  head.name = "avatarHeadMesh";
  return head;
}

/**
 * The face decal: a patch hugging the front of the head, a little out from it. It reaches from
 * the brow to the chin, so the painted eyes land halfway down the head and the mouth above the chin.
 */
function facePatch(scene, name) {
  const span = 0.85;
  const top = 0.1;
  const height = 0.34;
  return gridMesh(
    scene,
    name,
    20,
    12,
    (i, j) => headSurface(-span + (i / 20) * span * 2, top - height + (j / 12) * height, 0.0015),
    [0, -0.05, 0],
    (i, j) => [i / 20, j / 12],
  );
}

function buildHair(scene) {
  const cap = MeshBuilder.CreateSphere("hairCap", { diameter: 0.45, segments: 24, slice: 0.5 }, scene);
  cap.position.set(0, 0.035, -0.012);
  cap.scaling.set(1, 0.95, 1);

  const pieces = [cap];
  const add = (name, w, h, d, x, y, z, rz = 0, rx = 0, ry = 0) => {
    const mesh = roundedBox(scene, name, { width: w, height: h, depth: d, radius: Math.min(w, d) * 0.45, segments: 4 });
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    pieces.push(mesh);
  };
  add("hairBack", 0.42, 0.7, 0.075, 0, -0.29, -0.175, 0, 0.05);
  for (const side of [-1, 1]) {
    add("hairSide", 0.032, 0.3, 0.32, side * 0.194, -0.07, -0.03);
    // Flat locks falling from the temples past the cheeks and onto the chest.
    add("hairStrand", 0.1, 0.62, 0.04, side * 0.18, -0.29, 0.07, side * 0.03);
  }
  pieces.push(sweptFringe(scene, "hairBangs", 0.225, 0.95));
  for (const mesh of pieces) paint(mesh, Color3.White());
  return Mesh.MergeMeshes(pieces, true, true);
}

/**
 * A fringe combed down and across from the crown of a hair cap of `radius` (squashed by `squash`
 * in height), ending in a wispy hem at `hem` that dips by `sweep` toward one side. It starts
 * tucked inside the cap.
 */
function sweptFringe(scene, name, radius, squash, hem = 0.075, sweep = 0.028) {
  const columns = 40;
  const rows = 9;
  const from = -1.1;
  const to = 1.1;
  return gridMesh(
    scene,
    name,
    columns,
    rows,
    (i, j) => {
      const angle = from + (i / columns) * (to - from);
      const v = j / rows;
      const edge = hem + sweep * angle - 0.014 * Math.abs(Math.sin(angle * 9));
      const y = 0.2 + (edge - 0.2) * v;
      const rise = Math.min(1, (y - 0.035) / (radius * squash));
      const reach = radius * Math.sqrt(1 - rise * rise) - 0.004 + 0.02 * v;
      const turn = angle + 0.12 * v;
      return [Math.sin(turn) * reach, y, Math.cos(turn) * reach - 0.012];
    },
    [0, 0.035, -0.012],
    (i, j) => [(i / columns) * 2.5, 1 - j / rows],
  );
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
  add("shortBack", 0.41, 0.24, 0.08, 0, -0.03, -0.16, 0, 0.08);
  for (const side of [-1, 1]) add("shortSide", 0.026, 0.13, 0.24, side * 0.19, 0.04, -0.03);
  pieces.push(sweptFringe(scene, "shortFringe", 0.22, 0.92, 0.11, -0.022));
  add("shortTuft", 0.06, 0.08, 0.035, 0.04, 0.215, 0.03, -0.45);
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

// The space buns sit on this ellipsoid. It clears the head's rounded top edge with a little room to spare.
const BUN_SHELL_CENTER = new Vector3(0, 0.04, 0);
const BUN_SHELL_RADII = new Vector3(0.218, 0.21, 0.218);

/** Point on the space-bun shell in direction `dir`, pushed out by `lift`. Below the crown it also clears the head's straight sides. */
function bunShellPoint(dir, lift = 1) {
  const point = BUN_SHELL_CENTER.add(dir.normalizeToNew().multiply(BUN_SHELL_RADII).scaleInPlace(lift));
  const flat = Math.hypot(point.x, point.z);
  const floor = 0.2 * lift;
  if (point.y < 0.1 && flat > 1e-6 && flat < floor) {
    point.x *= floor / flat;
    point.z *= floor / flat;
  }
  return point;
}

/** Unit direction `azimuth` radians around from the face and `elevation` radians up from the ear line. */
function headDirection(azimuth, elevation) {
  const c = Math.cos(elevation);
  return new Vector3(Math.sin(azimuth) * c, Math.sin(elevation), Math.cos(azimuth) * c);
}

/** Height of the space-bun hairline above the face, `azimuth` radians from the middle of the forehead. */
function bunHairline(azimuth) {
  return 0.125 - 0.065 * (azimuth / 1.15) ** 2;
}

/**
 * Messy space buns: two loosely wound buns high on the crown with loops and wisps springing out, the
 * hair swept up into them in layered locks from the hairline and from a whorl at the back, a soft
 * nape, wispy pieces beside the cheeks, and long wavy strands that fall behind the shoulders.
 */
function buildBunHair(scene) {
  const rand = mulberry32(29);
  const pieces = [];
  const shaded = (mesh, tone) => {
    pieces.push(paint(mesh, new Color3(tone, tone, tone)));
    return mesh;
  };
  // Ribbons sometimes build inside out. Flip a lock whose faces point at its own center.
  const lock = (points, options) => {
    const mesh = hairLock(scene, points, { groove: 0.22, ...options });
    const around = options.around ?? 8;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const ring = Math.floor(positions.length / 3 / around / 2) * around * 3;
    const center = [0, 1, 2].map((axis) => {
      let sum = 0;
      for (let j = 0; j < around; j += 1) sum += positions[ring + j * 3 + axis];
      return sum / around;
    });
    let facing = 0;
    for (let j = ring; j < ring + around * 3; j += 3) {
      for (let axis = 0; axis < 3; axis += 1) facing += (positions[j + axis] - center[axis]) * normals[j + axis];
    }
    if (facing < 0) mesh.flipFaces(true);
    pieces.push(mesh);
  };
  const shellDirection = (point) => point.subtract(BUN_SHELL_CENTER).divide(BUN_SHELL_RADII).normalize();
  const buns = [-1, 1].map((side) => new Vector3(side * 0.165, 0.238, -0.025));
  const bunOf = (side) => buns[side < 0 ? 0 : 1];

  // Base layer under the locks, open over the forehead and face.
  const cap = MeshBuilder.CreateSphere("bunCap", { diameter: 2, segments: 24, slice: 0.78 }, scene);
  const capPositions = cap.getVerticesData(VertexBuffer.PositionKind);
  for (let i = 0; i < capPositions.length; i += 3) {
    const point = bunShellPoint(new Vector3(capPositions[i], capPositions[i + 1], capPositions[i + 2]));
    capPositions[i] = point.x;
    capPositions[i + 1] = point.y;
    capPositions[i + 2] = point.z;
  }
  const capNormals = [];
  VertexData.ComputeNormals(capPositions, cap.getIndices(), capNormals);
  cap.setVerticesData(VertexBuffer.PositionKind, capPositions);
  cap.setVerticesData(VertexBuffer.NormalKind, capNormals);
  const bare = (vertex) => {
    const x = capPositions[vertex * 3];
    const y = capPositions[vertex * 3 + 1];
    const z = capPositions[vertex * 3 + 2];
    const azimuth = Math.atan2(x, z);
    return z > 0 && Math.abs(azimuth) < 1.15 && y < bunHairline(azimuth);
  };
  const capIndices = cap.getIndices();
  const kept = [];
  for (let i = 0; i < capIndices.length; i += 3) {
    const triangle = [capIndices[i], capIndices[i + 1], capIndices[i + 2]];
    if (!triangle.some(bare)) kept.push(...triangle);
  }
  cap.setIndices(kept);
  shaded(cap, 0.72);
  // Down to a smooth nape on the sides and back.
  const faceGap = 2.3;
  const under = MeshBuilder.CreateCylinder(
    "bunUnder",
    { height: 0.19, diameterTop: 0.404, diameterBottom: 0.412, tessellation: 40, arc: 1 - faceGap / (Math.PI * 2), cap: 0 },
    scene,
  );
  under.position.y = -0.07;
  under.rotation.y = -(Math.PI / 2 - faceGap / 2);
  shaded(under, 0.7);

  // A lock from `from` over the shell up into the bun on `side`, bowing sideways by `bow` on the way,
  // or bending through the direction `via` first.
  const sweep = (side, from, { lift = 1.06, bow = 0, via = null, width, thick = 0.009, shade, steps = 16 }) => {
    const bun = bunOf(side);
    const start = shellDirection(from);
    const end = shellDirection(bun.add(new Vector3(0, -0.05, 0)));
    const across = Vector3.Cross(start, end);
    if (across.lengthSquared() > 1e-6) across.normalize();
    const along = (k) => {
      if (!via) return Vector3.Lerp(start, end, k).addInPlace(across.scale(bow * Math.sin(k * Math.PI)));
      return k < 0.5 ? Vector3.Lerp(start, via, k * 2) : Vector3.Lerp(via, end, k * 2 - 1);
    };
    const points = [from];
    for (const k of via ? [0.25, 0.5, 0.7, 0.88] : [0.3, 0.6, 0.85]) {
      points.push(bunShellPoint(along(k), 1.01 + (lift - 1.01) * smoothstep(0, 0.45, k)));
    }
    points.push(Vector3.Lerp(points[points.length - 1], bun, 0.65));
    lock(points, { width, thick, taper: 0.45, root: 0.25, shade, steps });
  };

  for (const side of [-1, 1]) {
    // From the hairline, parted in the middle, over the top. A wide under-layer, then narrower locks between them.
    for (const layer of [
      { count: 8, width: 0.058, lift: 1.045, shade: 0.8, offset: 0 },
      { count: 8, width: 0.032, lift: 1.08, shade: 0.98, offset: 0.5 },
    ]) {
      for (let i = 0; i < layer.count; i += 1) {
        const t = Math.min(1, (i + layer.offset) / (layer.count - 1));
        const azimuth = side * (0.035 + t * 1.08);
        const elevation = Math.asin((bunHairline(azimuth) - BUN_SHELL_CENTER.y) / BUN_SHELL_RADII.y);
        sweep(side, bunShellPoint(headDirection(azimuth, elevation), 1.02), {
          lift: layer.lift,
          bow: side * (t - 0.5) * 0.25,
          width: layer.width,
          shade: layer.shade + rand() * 0.12,
        });
      }
    }
    // Fanned out from the whorl at the back of the head, up and across to the bun.
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const from = bunShellPoint(headDirection(Math.PI - side * (0.03 + t * 0.1), 0.12 + (rand() - 0.5) * 0.08), 1.01);
      sweep(side, from, { lift: 1.075, bow: side * (0.4 - t * 0.8), width: 0.038 + rand() * 0.014, shade: 0.9 + rand() * 0.16 });
    }
    // Up from the nape toward the whorl, then out to the bun. The outer ones come up behind the ears.
    for (let i = 0; i < 8; i += 1) {
      const t = i / 7;
      const from = bunShellPoint(headDirection(Math.PI - side * (0.03 + t * 1.35), -0.8 + t * 0.25), 1.01);
      sweep(side, from, {
        lift: 1.05,
        via: headDirection(Math.PI - side * (0.22 + t * 0.9), 0.05 + t * 0.08),
        width: 0.058,
        shade: 0.8 + rand() * 0.14,
      });
    }
    // Over the ears.
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      const from = bunShellPoint(headDirection(side * (1.2 + t * 0.32), -0.55 + t * 0.1), 1.01);
      sweep(side, from, { lift: 1.05, width: 0.055, shade: 0.84 + rand() * 0.14 });
    }
    // Across the top between the buns.
    for (let i = 0; i < 3; i += 1) {
      const from = bunShellPoint(new Vector3(side * 0.02, 1, 0.35 - i * 0.4), 1.03);
      sweep(side, from, { lift: 1.07, width: 0.036, shade: 0.94 + rand() * 0.12, steps: 12 });
    }
  }

  // Swings in x as it falls from `top` to `bottom` behind the shoulders, curling out at the tip.
  const wave = (side, top, bottom, { x, z, amp, waves, phase, curl }) => {
    const points = [];
    for (let i = 1; i <= 7; i += 1) {
      const t = i / 7;
      const sway = Math.sin(t * Math.PI * waves + phase) * amp * (0.4 + 0.6 * t);
      const flick = smoothstep(0.6, 1, t) * curl;
      points.push(new Vector3(side * (x + sway + flick), top + (bottom - top) * t + Math.abs(flick) * 0.5, z - Math.abs(sway) * 0.4));
    }
    return points;
  };
  const strand = (points, width, shade, twist) =>
    lock(points, { width, thick: 0.007, taper: 0.92, root: 0.8, shade, steps: 30, around: 6, twist, groove: 0.15 });

  for (const side of [-1, 1]) {
    const bun = bunOf(side);
    // Long waves from the sides and back of the head. Below the head they stay behind the back.
    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      const azimuth = 1.5 + t * 1.0;
      const bend = Math.max(azimuth, 2.2);
      const x = 0.14 + (1 - t) * 0.11 + (rand() - 0.5) * 0.02;
      strand(
        [
          bunShellPoint(headDirection(side * azimuth, 0.25 - t * 0.2), 1.05),
          new Vector3(side * Math.sin(bend) * 0.238, -0.07, Math.cos(bend) * 0.238),
          new Vector3(side * x, -0.2, -0.192),
          ...wave(side, -0.2, -0.44 - (1 - Math.abs(t - 0.5) * 2) * 0.1 - rand() * 0.1, {
            x,
            z: -0.192,
            amp: 0.025 + rand() * 0.02,
            waves: 1.6 + rand() * 0.8,
            phase: rand() * 6,
            curl: 0.03 + rand() * 0.02,
          }),
        ],
        0.036 + rand() * 0.012,
        0.88 + rand() * 0.18,
        side * (1 + rand()),
      );
    }
    // Loose strands slipping out under each bun and down the side.
    for (let i = 0; i < 2; i += 1) {
      const x = 0.235 + i * 0.015;
      strand(
        [
          bun.add(new Vector3(side * 0.045, -0.04, -0.01 - i * 0.03)),
          new Vector3(side * 0.236, 0.12, -0.05 - i * 0.03),
          new Vector3(side * 0.244, 0.0, -0.09 - i * 0.02),
          new Vector3(side * 0.24, -0.11, -0.15),
          new Vector3(side * x, -0.2, -0.198),
          ...wave(side, -0.2, -0.5 - i * 0.08, { x, z: -0.198, amp: 0.03, waves: 1.8 + i * 0.5, phase: 1 + i * 2, curl: 0.04 }),
        ],
        0.026,
        1 + rand() * 0.1,
        side * 1.8,
      );
    }
    // Wavy wisps beside the cheeks that fall in front of the shoulders.
    for (let i = 0; i < 2; i += 1) {
      const x = 0.205 + i * 0.012;
      lock(
        [
          bunShellPoint(headDirection(side * (1.02 + i * 0.1), 0.2), 1.04),
          new Vector3(side * (x + 0.004), -0.02, 0.11 - i * 0.02),
          new Vector3(side * (x + 0.018), -0.09, 0.125 - i * 0.015),
          new Vector3(side * (x + 0.002), -0.16, 0.15),
          new Vector3(side * (x + 0.016), -0.22, 0.175),
          new Vector3(side * (x + 0.002), -0.28 - i * 0.03, 0.182),
          new Vector3(side * (x + 0.03), -0.33 - i * 0.04, 0.178),
          new Vector3(side * (x + 0.05), -0.315 - i * 0.04, 0.17),
        ],
        { width: 0.024, thick: 0.005, taper: 0.88, root: 0.6, shade: 1.02 + rand() * 0.08, steps: 32, around: 6, twist: side * 2 },
      );
    }

    // The bun: a core wound round with ribbons along tilted spirals.
    const core = MeshBuilder.CreateSphere("bunCore", { diameter: 0.126, segments: 10 }, scene);
    core.position.copyFrom(bun);
    shaded(core, 0.72);
    const winds = [
      { axis: [0.3, 1, -0.2], radius: 0.067, turns: 1.4, spin: 0, shade: 0.9 },
      { axis: [1, 0.4, 0.3], radius: 0.07, turns: 1.2, spin: 1.7, shade: 1.0 },
      { axis: [-0.4, 0.7, 0.8], radius: 0.074, turns: 1.1, spin: 3.1, shade: 0.94 },
      { axis: [0.6, 0.5, -0.9], radius: 0.077, turns: 1.0, spin: 4.4, shade: 1.06 },
      { axis: [-0.2, 0.3, 1], radius: 0.079, turns: 0.8, spin: 5.5, shade: 1.0 },
    ];
    for (const wind of winds) {
      const n = new Vector3(wind.axis[0] * side, wind.axis[1], wind.axis[2]).normalize();
      const u = Vector3.Cross(Math.abs(n.y) < 0.9 ? Vector3.Up() : Vector3.Right(), n).normalize();
      const v = Vector3.Cross(n, u);
      const count = Math.round(wind.turns * 10);
      const points = [];
      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const angle = wind.spin + side * t * wind.turns * Math.PI * 2;
        const lat = -1.05 + t * 2;
        const r = wind.radius * (i === count ? 0.75 : 1);
        points.push(
          bun
            .add(u.scale(Math.cos(angle) * Math.cos(lat) * r))
            .addInPlace(v.scale(Math.sin(angle) * Math.cos(lat) * r))
            .addInPlace(n.scale(Math.sin(lat) * r)),
        );
      }
      lock(points, { width: 0.05, thick: 0.014, taper: 0.55, root: 1, shade: wind.shade, steps: count * 3, from: bun, groove: 0.35 });
    }
    // Loose loops springing out of the bun, open at the end like a curl.
    const loops = [
      { dir: [0.2, 1, 0.1], bend: [1, 0, 0.3], size: 0.04 },
      { dir: [0.9, 0.5, -0.2], bend: [0, 1, 0.5], size: 0.034 },
      { dir: [-0.5, 0.8, -0.4], bend: [0.3, 0.2, -1], size: 0.032 },
      { dir: [0.5, 0.2, 0.9], bend: [0.2, 1, 0], size: 0.028 },
      { dir: [1, -0.1, 0.3], bend: [0, 1, -0.4], size: 0.03 },
    ];
    for (const loop of loops) {
      const d = new Vector3(loop.dir[0] * side, loop.dir[1], loop.dir[2]).normalize();
      const bend = new Vector3(loop.bend[0] * side, loop.bend[1], loop.bend[2]);
      const e = bend.subtract(d.scale(Vector3.Dot(bend, d))).normalize();
      const base = bun.add(d.scale(0.07));
      const middle = base.add(d.scale(loop.size));
      const points = [];
      for (let i = 0; i <= 9; i += 1) {
        const angle = (i / 9) * Math.PI * 1.65;
        points.push(middle.add(d.scale(-Math.cos(angle) * loop.size)).addInPlace(e.scale(Math.sin(angle) * loop.size)));
      }
      lock(points, { width: 0.026, thick: 0.007, taper: 0.7, root: 1, shade: 1.04, steps: 18, around: 6, from: middle });
    }
    // Flyaway wisps off the top of the bun.
    for (const [dx, dz, lean] of [
      [0.2, 0.3, 0.6],
      [-0.3, -0.2, -0.4],
      [0.6, -0.4, 0.9],
    ]) {
      const d = new Vector3(dx * side, 1, dz).normalize();
      const a = bun.add(d.scale(0.07));
      const b = bun.add(d.scale(0.12));
      lock([a, b, b.add(new Vector3(side * lean * 0.04, 0.012, dz * 0.03)), b.add(new Vector3(side * lean * 0.07, -0.01, dz * 0.05))], {
        width: 0.009,
        thick: 0.003,
        taper: 0.9,
        root: 0.8,
        shade: 1.05,
        steps: 12,
        around: 6,
      });
    }
  }

  const mesh = Mesh.MergeMeshes(pieces, true, true);
  // A soft sheen across the crown, and darker hair where it gathers under the buns.
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    const y = positions[i + 1];
    const near = Math.min(...buns.map((bun) => Math.hypot(positions[i] - bun.x, y - bun.y, positions[i + 2] - bun.z)));
    const sheen = smoothstep(0.09, 0.15, y) * (1 - smoothstep(0.19, 0.24, y)) * smoothstep(0.09, 0.12, near);
    const gathered = (1 - smoothstep(0.07, 0.12, near)) * smoothstep(0.01, -0.05, y - buns[0].y);
    const tone = (1 + 0.14 * sheen) * (1 - 0.25 * gathered);
    colors[c] *= tone;
    colors[c + 1] *= tone;
    colors[c + 2] *= tone;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
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

// The headband hair's crown, as an ellipsoid. Locks and the band sit on it.
const BAND_CAP_CENTER = new Vector3(0, 0.04, -0.015);
const BAND_CAP_RADII = new Vector3(0.22, 0.205, 0.22);
// How far the Alice band's arch leans back from upright, in radians.
const BAND_TILT = 1.1;

/** Point on an arch over the crown from ear to ear, `theta` radians from the top toward the right ear. */
function bandPoint(theta, lift, tilt = BAND_TILT) {
  return new Vector3(
    BAND_CAP_CENTER.x + Math.sin(theta) * BAND_CAP_RADII.x * lift,
    BAND_CAP_CENTER.y + Math.cos(theta) * Math.sin(tilt) * BAND_CAP_RADII.y * lift,
    BAND_CAP_CENTER.z + Math.cos(theta) * Math.cos(tilt) * BAND_CAP_RADII.z * lift,
  );
}

/** Point on the crown in direction (`azimuth` from the face, `elevation` above the ear line), pushed out by `lift`. */
function crownPoint(azimuth, elevation, lift = 1.04, side = 1) {
  const c = Math.cos(elevation);
  return new Vector3(
    BAND_CAP_CENTER.x + side * Math.sin(azimuth) * c * BAND_CAP_RADII.x * lift,
    BAND_CAP_CENTER.y + Math.sin(elevation) * BAND_CAP_RADII.y * lift,
    BAND_CAP_CENTER.z + Math.cos(azimuth) * c * BAND_CAP_RADII.z * lift,
  );
}

/**
 * A flat lock of hair along a smooth curve through `points`. It is thin outward from the head
 * and wide along it, narrows toward the tip, and darkens a little toward the root. `groove` darkens its
 * edges, so neighboring locks read as separate strands.
 */
function hairLock(scene, points, { width, thick, taper = 0.85, root = 0.7, shade = 1, steps = 28, around = 8, closed = false, from = null, twist = 0, groove = 0 }) {
  const spans = Math.max(1, points.length - (closed ? 0 : 1));
  const per = Math.max(2, Math.round(steps / spans));
  const path = Curve3.CreateCatmullRomSpline(points, per, closed).getPoints();
  // A closed spline repeats its first point at the end. Drop it and weld the tube shut.
  if (closed) path.pop();
  const count = path.length;
  const spin = closed ? 0 : twist;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const tangent = new Vector3();
  const outward = new Vector3();
  const wide = new Vector3();
  const deep = new Vector3();
  for (let i = 0; i < count; i += 1) {
    const p = path[i];
    const iPrev = closed ? (i - 1 + count) % count : Math.max(0, i - 1);
    const iNext = closed ? (i + 1) % count : Math.min(count - 1, i + 1);
    path[iNext].subtractToRef(path[iPrev], tangent);
    tangent.normalize();
    if (from) outward.set(p.x - from.x, p.y - from.y, p.z - from.z);
    else outward.set(p.x, Math.max(0, p.y - 0.02), p.z);
    if (outward.lengthSquared() < 1e-8) outward.set(0, 0, 1);
    outward.normalize();
    Vector3.CrossToRef(tangent, outward, wide);
    if (wide.lengthSquared() < 1e-8) wide.set(1, 0, 0);
    wide.normalize();
    Vector3.CrossToRef(wide, tangent, deep);
    deep.normalize();
    if (spin) {
      const ang = spin * (i / (count - 1));
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const wx = wide.x;
      const wy = wide.y;
      const wz = wide.z;
      wide.set(wx * cs + deep.x * sn, wy * cs + deep.y * sn, wz * cs + deep.z * sn);
      deep.set(deep.x * cs - wx * sn, deep.y * cs - wy * sn, deep.z * cs - wz * sn);
    }
    const s = i / (count - 1);
    const halfWidth = (width / 2) * Math.min(1, root + s * 3) * (1 - taper * s ** 1.6);
    const halfThick = (thick / 2) * (closed ? 1 : 1 - 0.55 * s);
    const tone = shade * (closed ? 1 : 0.9 + 0.1 * Math.min(1, s * 2.5));
    for (let j = 0; j < around; j += 1) {
      const a = (j / around) * Math.PI * 2;
      const ca = Math.cos(a) * halfWidth;
      const sa = Math.sin(a) * halfThick;
      positions.push(p.x + wide.x * ca + deep.x * sa, p.y + wide.y * ca + deep.y * sa, p.z + wide.z * ca + deep.z * sa);
      const edged = tone * (1 - groove * Math.abs(Math.cos(a)) ** 3);
      colors.push(edged, edged, edged, 1);
      uvs.push(j / around, s);
    }
  }
  const seams = closed ? count : count - 1;
  for (let i = 0; i < seams; i += 1) {
    const next = closed ? (i + 1) % count : i + 1;
    for (let j = 0; j < around; j += 1) {
      const a = i * around + j;
      const b = i * around + ((j + 1) % around);
      const a2 = next * around + j;
      const b2 = next * around + ((j + 1) % around);
      indices.push(a, a2, b, b, a2, b2);
    }
  }
  if (!closed) {
    for (const [ring, end] of [
    [0, path[0]],
    [count - 1, path[count - 1]],
  ]) {
    const center = positions.length / 3;
    positions.push(end.x, end.y, end.z);
    colors.push(shade, shade, shade, 1);
    uvs.push(0.5, ring / (count - 1));
    for (let j = 0; j < around; j += 1) {
      const a = ring * around + j;
      const b = ring * around + ((j + 1) % around);
      if (ring === 0) indices.push(center, b, a);
      else indices.push(center, a, b);
    }
    }
  }
  const normals = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new Mesh("hairLock", scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.colors = colors;
  data.uvs = uvs;
  data.applyToMesh(mesh);
  return mesh;
}

/**
 * Long, straight hair parted in the middle under a white Alice band: wispy see-through bangs,
 * face-framing pieces that fall over the front of the shoulders, and a long back that ends in soft points.
 */
function buildHeadbandHair(scene) {
  const rand = mulberry32(57);
  const pieces = [];
  const shaded = (mesh, tone) => {
    pieces.push(paint(mesh, new Color3(tone, tone, tone)));
    return mesh;
  };
  const cap = MeshBuilder.CreateSphere("headbandCap", { diameter: 0.44, segments: 22, slice: 0.5 }, scene);
  cap.position.copyFrom(BAND_CAP_CENTER);
  cap.scaling.set(1, BAND_CAP_RADII.y / 0.22, 1);
  // Open the forehead in front of the band, so gaps between the bangs show skin.
  const capPositions = cap.getVerticesData(VertexBuffer.PositionKind);
  const bare = (vertex) => {
    const [x, y, z] = [capPositions[vertex * 3], capPositions[vertex * 3 + 1], capPositions[vertex * 3 + 2]];
    const ahead = (z * Math.sin(BAND_TILT) - y * Math.cos(BAND_TILT)) / 0.22;
    return ahead > 0.4 && Math.abs(Math.atan2(x, z)) < 0.85;
  };
  const capIndices = cap.getIndices();
  const kept = [];
  for (let i = 0; i < capIndices.length; i += 3) {
    const triangle = [capIndices[i], capIndices[i + 1], capIndices[i + 2]];
    if (!triangle.some(bare)) kept.push(...triangle);
  }
  cap.setIndices(kept);
  shaded(cap, 0.86);
  // Hair under the locks on the sides and back, so gaps between them show hair, not skin.
  const faceGap = 1.9;
  const under = MeshBuilder.CreateCylinder(
    "headbandUnder",
    { height: 0.26, diameter: 0.4, tessellation: 36, arc: 1 - faceGap / (Math.PI * 2), cap: 0 },
    scene,
  );
  under.position.y = -0.06;
  under.rotation.y = -(Math.PI / 2 - faceGap / 2);
  shaded(under, 0.76);
  const backing = roundedBox(scene, "headbandBacking", { width: 0.36, height: 0.5, depth: 0.03, radius: 0.012, segments: 4 });
  backing.position.set(0, -0.33, -0.158);
  shaded(backing, 0.72);
  const lock = (points, options) => pieces.push(hairLock(scene, points, options));

  // The part runs back from the band down the middle. Every long lock starts there (`along` it from
  // 0 at the band to 1 at the back of the crown) and combs over the crown toward the unit direction
  // `end`, so no lock ends sit on the head.
  const partPath = (end, along, away, lift = 1.035) => {
    const partElevation = BAND_TILT + 0.06 + along * (2.3 - BAND_TILT - 0.06);
    const start = new Vector3(away * 0.01, Math.sin(partElevation), Math.cos(partElevation));
    return [0, 1 / 3, 2 / 3].map((k) => {
      const dir = Vector3.Lerp(start, end, k).normalize();
      return BAND_CAP_CENTER.add(dir.multiply(BAND_CAP_RADII).scale(k === 0 ? 1 : lift));
    });
  };
  const fromPart = (azimuth, elevation, side = 1, lift = 1.035) => {
    const folded = Math.acos(Math.cos(azimuth));
    const c = Math.cos(elevation);
    return partPath(
      new Vector3(side * Math.sin(azimuth) * c, Math.sin(elevation), Math.cos(azimuth) * c),
      Math.max(0, (folded - 0.95) / (Math.PI - 0.95)),
      Math.sign(Math.sin(azimuth) * side) || 1,
      lift,
    );
  };

  // See-through bangs that start at the band and stop at the brows, split a little at the part.
  const bangs = 15;
  for (let i = 0; i < bangs; i += 1) {
    const u = (i / (bangs - 1)) * 2 - 1;
    const azimuth = u * 0.82;
    const side = Math.sign(u) || 1;
    const outer = Math.abs(u);
    const underBand = BAND_TILT - 0.06;
    const ahead = BAND_TILT - 0.22;
    const root = bandPoint(Math.atan(Math.tan(azimuth) * Math.cos(underBand)), 1, underBand);
    const sweep = side * (0.012 + outer * 0.03);
    const tipY = 0.05 + rand() * 0.012 - (outer > 0.75 ? (outer - 0.75) * 0.5 : 0);
    const reach = 0.212 - outer * outer * 0.06;
    lock(
      [
        root,
        bandPoint(Math.atan(Math.tan(azimuth) * Math.cos(ahead)), 1.035, ahead),
        new Vector3(root.x * 1.04 + sweep * 0.4, 0.158, Math.max(root.z + 0.06, 0.185 - outer * 0.05)),
        new Vector3(Math.sin(azimuth) * 0.215 + sweep, 0.112, reach),
        new Vector3(Math.sin(azimuth) * 0.217 + sweep * 1.3, (0.112 + tipY) / 2, reach - 0.002),
        new Vector3(Math.sin(azimuth) * 0.218 + sweep * 1.5, tipY, reach - 0.004),
      ],
      { width: 0.032 + rand() * 0.008, thick: 0.007, taper: 0.9, root: 0.3, shade: 1 + rand() * 0.08 },
    );
  }

  for (const side of [-1, 1]) {
    // Face-framing pieces: beside the cheeks, then over the front of the shoulders onto the chest.
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      const azimuth = 0.98 + t * 0.4;
      const x = 0.205 + t * 0.02 + (rand() - 0.5) * 0.008;
      const z = 0.118 - t * 0.05;
      // Comb down behind the band and cross it low on the side, where it has already sunk into the hair.
      const cross = side * (0.9 + t * 0.2);
      const behind = BAND_TILT + 0.32;
      const crossing = new Vector3(Math.sin(cross), Math.cos(cross) * Math.sin(behind), Math.cos(cross) * Math.cos(behind));
      lock(
        [
          ...partPath(crossing, 0.12, side),
          bandPoint(cross, 1.035, behind),
          crownPoint(azimuth, 0.45 - t * 0.15, 1.04, side),
          new Vector3(side * x, 0.04, z),
          new Vector3(side * (x + 0.008), -0.1, z + 0.012),
          new Vector3(side * (x + 0.016), -0.2, 0.162 + t * 0.008),
          new Vector3(side * (x + 0.012), -0.34, 0.176),
          new Vector3(side * (x - 0.004), -0.5 - rand() * 0.06 - t * 0.04, 0.168),
        ],
        { width: 0.06, thick: 0.013, shade: 0.96 + rand() * 0.1, steps: 48 },
      );
    }
    // Over the ears and down behind the shoulders.
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      const azimuth = 1.45 + t * 0.6;
      const z = Math.cos(azimuth) * 0.21;
      lock(
        [
          ...fromPart(azimuth, 0.5, side),
          crownPoint(azimuth, 0.5, 1.04, side),
          crownPoint(azimuth, 0.22, 1.05, side),
          new Vector3(side * 0.222, 0, z),
          new Vector3(side * 0.226, -0.12, Math.min(z, -0.02) - 0.05),
          new Vector3(side * 0.222, -0.2, -0.165),
          new Vector3(side * 0.212, -0.38, -0.182),
          new Vector3(side * 0.19, -0.56 - rand() * 0.06, -0.176),
        ],
        { width: 0.065, thick: 0.014, shade: 0.9 + rand() * 0.1, steps: 48 },
      );
    }
  }

  // Down the back, longest in the middle.
  const backs = 13;
  for (let i = 0; i < backs; i += 1) {
    const u = (i / (backs - 1)) * 2 - 1;
    const azimuth = Math.PI - u * 0.85;
    const x = Math.sin(azimuth);
    const middle = 1 - Math.abs(u);
    // These rise out of the smooth crown below the end of the part, so they never pile up there.
    // Neighbors overlap by more than half, so every other one lies a lock's thickness further out.
    const layer = new Vector3(x, 0, Math.cos(azimuth)).scale(i % 2 ? 0.009 : 0);
    const points = [
      crownPoint(azimuth, 1.1, 0.97),
      crownPoint(azimuth, 0.85, 1.03),
      crownPoint(azimuth, 0.55, 1.04),
      crownPoint(azimuth, 0.22, 1.05),
      new Vector3(x * 0.224, -0.02, Math.cos(azimuth) * 0.224 - 0.015),
      new Vector3(x * 0.22, -0.18, Math.min(Math.cos(azimuth) * 0.22, -0.175) - 0.012),
      new Vector3(x * 0.235, -0.38, -0.19 - middle * 0.004),
      new Vector3(x * 0.225, -0.6 - middle * 0.05 - rand() * 0.06, -0.186),
    ];
    lock(
      points.map((point) => point.add(layer)),
      { width: 0.075, thick: 0.014, root: 0.35, shade: 0.9 + rand() * 0.12, steps: 44 },
    );
  }

  return Mesh.MergeMeshes(pieces, true, true);
}

/**
 * Long, fluffy, layered waves with a middle part and darker roots: a few flyaways on the crown,
 * curtain layers that flare out past the cheeks, and a long back that tapers to a point.
 */
function buildRedWaveHair(scene) {
  const rand = mulberry32(83);
  const pieces = [];
  const shaded = (mesh, tone) => pieces.push(paint(mesh, new Color3(tone, tone, tone)));
  const lock = (points, options) => {
    const mesh = hairLock(scene, points, { steps: 44, ...options });
    // Lighting needs the faces to point out of the lock. Check one ring and flip the lock if they point in.
    const around = options.around ?? 8;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const ring = Math.floor((positions.length / 3 - 2) / around / 2) * around * 3;
    const center = [0, 1, 2].map((axis) => {
      let sum = 0;
      for (let j = 0; j < around; j += 1) sum += positions[ring + j * 3 + axis];
      return sum / around;
    });
    let facing = 0;
    for (let j = ring; j < ring + around * 3; j += 3) {
      for (let axis = 0; axis < 3; axis += 1) facing += (positions[j + axis] - center[axis]) * normals[j + axis];
    }
    if (facing < 0) mesh.flipFaces(true);
    pieces.push(mesh);
  };
  // Below the head, `x(y)` and `z(y)` give a lock's center line. It waves along the way and flicks out at the tip.
  const fall = (side, from, to, x, z, phase, amp = 0.018) => {
    const points = [];
    const count = Math.max(2, Math.round((from - to) / 0.045));
    for (let i = 1; i <= count; i += 1) {
      const s = i / count;
      const y = from - (from - to) * s;
      const wave = Math.sin(y * 21 + phase) * amp * Math.min(1, s * 3);
      const flick = smoothstep(0.7, 1, s);
      points.push(new Vector3(side * (x(y) + wave + flick * 0.026), y + flick * 0.022, z(y)));
    }
    return points;
  };

  // Big enough to cover the head's rounded top edge, and tipped back so it stops above the eyes.
  const capCenter = new Vector3(0, 0.035, -0.005);
  const capRadii = new Vector3(0.228, 0.212, 0.228);
  const cap = MeshBuilder.CreateSphere("redWaveCap", { diameter: capRadii.x * 2, segments: 22, slice: 0.5 }, scene);
  cap.position.copyFrom(capCenter);
  cap.scaling.set(1, capRadii.y / capRadii.x, 1);
  cap.rotation.x = -0.3;
  shaded(cap, 0.82);
  // Hair under the layers on the sides and back, so gaps between them show hair, not skin.
  const faceGap = 2;
  const under = MeshBuilder.CreateCylinder(
    "redWaveUnder",
    { height: 0.2, diameterTop: 0.42, diameterBottom: 0.46, tessellation: 40, arc: 1 - faceGap / (Math.PI * 2), cap: 0 },
    scene,
  );
  under.position.y = -0.02;
  under.rotation.y = -(Math.PI / 2 - faceGap / 2);
  shaded(under, 0.62);
  lock(
    [new Vector3(0, -0.02, -0.2), new Vector3(0, -0.2, -0.21), new Vector3(0, -0.42, -0.206), new Vector3(0, -0.64, -0.2)],
    { width: 0.36, thick: 0.02, taper: 0.97, root: 0.55, shade: 0.66 },
  );

  // Combed from the part down each side of the crown.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      const elevation = 0.9 + t * 1.4;
      const start = new Vector3(side * 0.012, Math.sin(elevation), Math.cos(elevation));
      const azimuth = 0.9 + t * 2.05;
      const end = new Vector3(side * Math.sin(azimuth) * 0.97, 0.22, Math.cos(azimuth) * 0.97);
      const points = [];
      for (let k = 0; k <= 4; k += 1) {
        const dir = Vector3.Lerp(start, end, k / 4).normalize();
        points.push(capCenter.add(dir.multiply(capRadii).scaleInPlace(1.05)));
      }
      lock(points, { width: 0.075, thick: 0.016, taper: 0.3, shade: 0.95 + rand() * 0.15 });
    }
  }

  for (const side of [-1, 1]) {
    // Curtain layers from the front of the part, out over the temples, flaring past the cheeks onto the chest.
    for (let i = 0; i < 3; i += 1) {
      const out = i * 0.014;
      const end = -0.36 - i * 0.09 - rand() * 0.03;
      lock(
        [
          crownPoint(0.05 + i * 0.1, 0.78 - i * 0.06, 1.05, side),
          new Vector3(side * (0.1 + out), 0.15 - i * 0.01, 0.172 - i * 0.012),
          new Vector3(side * (0.172 + out), 0.07, 0.165 - i * 0.015),
          new Vector3(side * (0.228 + out), -0.02, 0.142 - i * 0.012),
          ...fall(
            side,
            -0.02,
            end,
            (y) => 0.19 + 0.085 * smoothstep(-0.19, -0.05, y) + out * 0.3,
            (y) => 0.135 + 0.045 * smoothstep(-0.08, -0.22, y) + i * 0.004,
            rand() * 6,
          ),
        ],
        { width: 0.068, thick: 0.015, taper: 0.9, shade: 1.02 + rand() * 0.2 },
      );
    }
    // Layers over the ears that puff out above the shoulders, then fall behind them.
    for (let i = 0; i < 5; i += 1) {
      const azimuth = 1.25 + i * 0.25;
      const front = Math.cos(azimuth) * 0.25;
      const end = -0.4 - rand() * 0.1 - i * 0.02;
      lock(
        [
          crownPoint(azimuth, 0.62, 1.06, side),
          new Vector3(side * Math.sin(azimuth) * 0.24, 0.03, Math.cos(azimuth) * 0.24 - 0.01),
          ...fall(
            side,
            -0.05,
            end,
            (y) => 0.2 + 0.085 * smoothstep(-0.17, -0.06, y),
            (y) => front + (-0.198 - front) * smoothstep(-0.06, -0.24, y),
            rand() * 6,
          ),
        ],
        { width: 0.075, thick: 0.016, taper: 0.9, shade: 0.92 + rand() * 0.22 },
      );
    }
    // Short layers that flick out at the jaw. Swinging arms reach x 0.25 below y -0.13, and about x 0.3 when raised.
    for (let i = 0; i < 3; i += 1) {
      const azimuth = 1.15 + i * 0.32;
      const z = Math.cos(azimuth) * 0.25;
      lock(
        [
          crownPoint(azimuth, 0.7, 1.06, side),
          new Vector3(side * Math.sin(azimuth) * 0.245, 0.05, z),
          new Vector3(side * 0.27, -0.04, z * 1.1),
          new Vector3(side * 0.28, -0.09, z * 1.15),
          new Vector3(side * 0.295, -0.112 + i * 0.012, z * 1.2),
        ],
        { width: 0.07, thick: 0.015, taper: 0.9, shade: 1.05 + rand() * 0.2 },
      );
    }
  }

  // Down the back, longest in the middle so the ends make a V.
  const backs = 13;
  for (let i = 0; i < backs; i += 1) {
    const u = (i / (backs - 1)) * 2 - 1;
    const azimuth = Math.PI - u * 0.85;
    const across = Math.abs(Math.sin(azimuth));
    const back = Math.cos(azimuth) * 0.25 - 0.015;
    const end = -0.42 - 0.2 * (1 - Math.abs(u)) ** 1.3 - rand() * 0.03;
    lock(
      [
        crownPoint(azimuth, 0.5, 1.06),
        new Vector3(Math.sin(azimuth) * 0.25, -0.03, back),
        ...fall(
          Math.sign(u) || 1,
          -0.08,
          end,
          (y) => across * (0.25 - 0.06 * smoothstep(-0.1, -0.3, y)) * (1 - 0.45 * smoothstep(-0.35, end, y)),
          (y) => back + (-0.216 - back) * smoothstep(-0.03, -0.2, y),
          rand() * 6,
          0.012,
        ),
      ],
      { width: 0.1, thick: 0.016, taper: 0.8, shade: 0.9 + rand() * 0.22 },
    );
  }

  // Flyaways curling up off the crown.
  const flyaways = [
    [0.02, 0.04, 0.09, 0.285, 1],
    [-0.02, 0.0, -0.1, 0.29, -1],
    [0.01, -0.07, 0.06, 0.28, -1],
  ];
  for (const [x, z, reach, top, curl] of flyaways) {
    const over = 1 - (x / capRadii.x) ** 2 - ((z - capCenter.z) / capRadii.z) ** 2;
    const base = capCenter.y + Math.sqrt(over) * capRadii.y;
    lock(
      [
        new Vector3(x, base - 0.005, z),
        new Vector3(x + reach * 0.2, top, z + 0.01 * curl),
        new Vector3(x + reach * 0.65, top + 0.008, z - 0.015 * curl),
        new Vector3(x + reach * 1.05, top - 0.03, z - 0.03 * curl),
        new Vector3(x + reach * 1.1, base - 0.01, z - 0.035 * curl),
      ],
      { width: 0.012, thick: 0.005, taper: 0.6, root: 1, shade: 0.85 },
    );
  }

  const mesh = Mesh.MergeMeshes(pieces, true, true);
  // Darker at the roots along the part.
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    const along = (1 - smoothstep(0.015, 0.1, Math.abs(positions[i]))) * smoothstep(0.12, 0.23, positions[i + 1]);
    const tone = 1 - 0.48 * along;
    colors[c] *= tone;
    colors[c + 1] *= tone;
    colors[c + 2] *= tone;
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  return mesh;
}

function accessoryMaterial(scene, name, hex) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = hexToColor3(hex);
  material.specularColor = new Color3(0.2, 0.2, 0.22);
  return material;
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

/** A black band round the neck, one unit across; the avatar sizes it to the neck. */
function buildChoker(scene) {
  const material = accessoryMaterial(scene, "chokerMat", "#1a1a1a");
  const band = MeshBuilder.CreateTorus("choker", { diameter: 1, thickness: 0.14, tessellation: 28 }, scene);
  band.scaling.y = 0.6;
  band.bakeCurrentTransformIntoVertices();
  band.material = material;
  return band;
}

/**
 * A flat white Alice band arching from ear to ear just behind the bangs. Over the crown it sits half sunk
 * in the hair; lower down it dives under the side hair, so both ends disappear above the ears.
 */
function buildHeadband(scene) {
  const material = accessoryMaterial(scene, "headbandMat", "#f6f3ee");
  material.emissiveColor = new Color3(0.16, 0.16, 0.15);
  const end = 1.25;
  const points = [];
  for (let i = 0; i <= 16; i += 1) {
    const theta = -end + (i / 16) * end * 2;
    const dive = Math.min(1, Math.max(0, (Math.abs(theta) - 0.5) / (end - 0.5)));
    points.push(bandPoint(theta, 1.08 - 0.16 * dive * dive * (3 - 2 * dive)));
  }
  const band = paint(hairLock(scene, points, { width: 0.056, thick: 0.018, taper: 0, root: 1, steps: 48, around: 12 }), Color3.White());
  band.name = "headband";
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

function buildHipCloth(scene) {
  const plane = MeshBuilder.CreatePlane("hipCloth", { width: 0.15, height: 0.26 }, scene);
  plane.rotation.set(0, -Math.PI / 4, -0.05);
  plane.position.y = -0.13;
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

/** A fine gold chain round the base of the neck, dipping in front to a pink pendant on the chest. */
function buildNecklace(scene) {
  const root = new TransformNode("necklace", scene);
  const gold = metalMaterial(scene, "necklaceGold", "#f0c14d");
  const gemMat = accessoryMaterial(scene, "necklaceGem", "#ff8fb8");
  gemMat.specularColor = new Color3(0.9, 0.9, 0.9);
  gemMat.specularPower = 120;
  const chain = MeshBuilder.CreateTorus("necklaceChain", { diameter: 1, thickness: 0.05, tessellation: 32 }, scene);
  chain.parent = root;
  chain.rotation.x = 0.5;
  chain.material = gold;
  const drop = MeshBuilder.CreateCylinder("necklaceDrop", { height: 1, diameter: 0.006, tessellation: 6 }, scene);
  drop.parent = root;
  drop.material = gold;
  const pendant = MeshBuilder.CreateSphere("necklacePendant", { diameter: 0.022, segments: 12 }, scene);
  pendant.parent = root;
  pendant.scaling.z = 0.6;
  pendant.material = gemMat;
  return {
    root,
    meshes: [chain, drop, pendant],
    /** Rings the neck at body height `y`, with the pendant at `pendantY` resting on the chest `front`. */
    fit(y, neckRadius, pendantY, front) {
      root.position.set(0, y, 0);
      const ring = neckRadius + 0.01;
      chain.scaling.set(ring * 2, ring * 2, ring * 2.5);
      const lowY = -Math.sin(0.5) * ring * 1.25;
      const lowZ = Math.cos(0.5) * ring * 1.25;
      pendant.position.set(0, pendantY - y, front + 0.009);
      drop.position.set(0, (lowY + pendant.position.y) / 2, (lowZ + pendant.position.z) / 2);
      drop.scaling.y = Math.max(0.005, Math.hypot(lowY - pendant.position.y, pendant.position.z - lowZ));
      drop.rotation.x = -Math.atan2(pendant.position.z - lowZ, lowY - pendant.position.y);
    },
  };
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

/** Mini course squishies, one of which the avatar can carry in the right hand. */
function buildHeldSquishies(scene) {
  const root = new TransformNode("heldSquishy", scene);
  const ink = accessoryMaterial(scene, "heldInk", "#2a1c24");
  const eyeWhite = accessoryMaterial(scene, "heldEye", "#fffaf6");

  const gloss = (name, hex, shine) => {
    const material = accessoryMaterial(scene, name, hex);
    material.emissiveColor = hexToColor3(hex).scale(0.14);
    material.specularColor = new Color3(shine, shine, shine);
    return material;
  };

  const faceOn = (parent, z, scale = 1) => {
    const meshes = [];
    for (const side of [-1, 1]) {
      const eye = MeshBuilder.CreateSphere("heldEyeBall", { diameter: 0.036 * scale, segments: 8 }, scene);
      eye.parent = parent;
      eye.position.set(side * 0.042 * scale, 0.02 * scale, z);
      eye.material = eyeWhite;
      const pupil = MeshBuilder.CreateSphere("heldPupil", { diameter: 0.015 * scale, segments: 6 }, scene);
      pupil.parent = parent;
      pupil.position.set(side * 0.042 * scale, 0.018 * scale, z + 0.016 * scale);
      pupil.material = ink;
      meshes.push(eye, pupil);
    }
    const mouth = MeshBuilder.CreateSphere("heldMouth", { diameter: 0.026 * scale, segments: 6 }, scene);
    mouth.parent = parent;
    mouth.scaling.set(1.45, 0.42, 0.45);
    mouth.position.set(0, -0.028 * scale, z);
    mouth.material = ink;
    meshes.push(mouth);
    return meshes;
  };

  const adopt = (node, meshes) => {
    node.parent = root;
    node.setEnabled(false);
    for (const mesh of meshes) mesh.isPickable = false;
    return { node, meshes };
  };

  const dumpling = new TransformNode("heldDumpling", scene);
  const bunMat = gloss("heldDumplingMat", "#ffb8d2", 0.35);
  const bun = MeshBuilder.CreateSphere("heldDumplingBun", { diameter: 0.2, segments: 16 }, scene);
  bun.parent = dumpling;
  bun.scaling.set(1, 0.78, 0.94);
  bun.material = bunMat;
  const tip = MeshBuilder.CreateCylinder(
    "heldDumplingTip",
    { height: 0.045, diameterTop: 0.006, diameterBottom: 0.042, tessellation: 8 },
    scene,
  );
  tip.parent = dumpling;
  tip.position.set(0.012, 0.09, 0.01);
  tip.rotation.z = -0.45;
  tip.material = bunMat;
  const seam = MeshBuilder.CreateTorus("heldDumplingSeam", { diameter: 0.11, thickness: 0.012, tessellation: 14 }, scene);
  seam.parent = dumpling;
  seam.position.y = 0.045;
  seam.material = gloss("heldDumplingSeamMat", "#f094b4", 0.3);
  const dumplingGroup = adopt(dumpling, [bun, tip, seam, ...faceOn(dumpling, 0.09)]);

  const jelly = new TransformNode("heldJelly", scene);
  const jellyMat = gloss("heldJellyMat", "#ff6f9e", 0.62);
  const cube = roundedBox(scene, "heldJellyCube", {
    width: 0.16,
    height: 0.14,
    depth: 0.16,
    radius: 0.04,
    segments: 4,
  });
  cube.parent = jelly;
  cube.material = jellyMat;
  const sugarMat = accessoryMaterial(scene, "heldSugar", "#fff6ee");
  const sugars = [];
  for (let i = 0; i < 6; i += 1) {
    const grain = MeshBuilder.CreateBox("heldSugar", { size: 0.014 }, scene);
    grain.parent = jelly;
    const angle = (i / 6) * Math.PI * 2;
    grain.position.set(Math.cos(angle) * 0.038, 0.078, Math.sin(angle) * 0.038);
    grain.rotation.set(angle, angle * 0.4, 0.3);
    grain.material = sugarMat;
    sugars.push(grain);
  }
  const jellyGroup = adopt(jelly, [cube, ...sugars, ...faceOn(jelly, 0.086, 0.9)]);

  const cheese = new TransformNode("heldCheese", scene);
  const cheeseMat = gloss("heldCheeseMat", "#ffd54a", 0.28);
  const wedge = roundedBox(scene, "heldCheeseBody", {
    width: 0.17,
    height: 0.12,
    depth: 0.15,
    radius: 0.022,
    segments: 3,
  });
  wedge.parent = cheese;
  wedge.material = cheeseMat;
  const holeMat = gloss("heldCheeseHole", "#c9841a", 0.12);
  const holes = [
    [-0.028, 0.052, 0.008],
    [0.032, 0.05, -0.02],
    [-0.018, 0.004, 0.07],
    [0.03, -0.014, 0.068],
  ].map(([x, y, z], index) => {
    const hole = MeshBuilder.CreateSphere(`heldHole${index}`, { diameter: index < 2 ? 0.042 : 0.034, segments: 8 }, scene);
    hole.parent = cheese;
    hole.position.set(x, y, z);
    hole.material = holeMat;
    return hole;
  });
  const cheeseGroup = adopt(cheese, [wedge, ...holes, ...faceOn(cheese, 0.08, 0.85)]);

  const blob = new TransformNode("heldBlob", scene);
  const blobMat = gloss("heldBlobMat", "#ff36e7", 0.55);
  const puff = MeshBuilder.CreateSphere("heldBlobBody", { diameter: 0.2, segments: 16 }, scene);
  puff.parent = blob;
  puff.scaling.set(1.08, 0.82, 1);
  puff.material = blobMat;
  const blobGroup = adopt(blob, [puff, ...faceOn(blob, 0.098)]);

  const groups = { dumpling: dumplingGroup, jelly: jellyGroup, cheese: cheeseGroup, blob: blobGroup };
  let current = "";
  return {
    root,
    meshes: Object.values(groups).flatMap((group) => group.meshes),
    get id() {
      return current;
    },
    show(id) {
      current = groups[id] ? id : "";
      root.setEnabled(Boolean(current));
      for (const [key, group] of Object.entries(groups)) group.node.setEnabled(key === current);
    },
  };
}

/**
 * A chunky toy blaster for the boss fight. The barrel runs down the arm (-y), so it points
 * forward once the arm is raised, and the grip sits in the palm.
 */
function buildBlaster(scene) {
  const root = new TransformNode("blaster", scene);
  const body = accessoryMaterial(scene, "blasterBody", "#3a78f2");
  body.specularColor = new Color3(0.5, 0.5, 0.55);
  const trim = accessoryMaterial(scene, "blasterTrim", "#ffd23f");
  const tip = accessoryMaterial(scene, "blasterTip", "#ff8a1c");
  tip.emissiveColor = new Color3(0.35, 0.14, 0.02);
  const part = (mesh, material, x, y, z) => {
    mesh.parent = root;
    mesh.position.set(x, y, z);
    mesh.material = material;
    mesh.isPickable = false;
    return mesh;
  };
  const meshes = [
    part(MeshBuilder.CreateBox("blasterBody", { width: 0.1, height: 0.3, depth: 0.12 }, scene), body, 0, -0.1, 0.02),
    part(MeshBuilder.CreateBox("blasterStripe", { width: 0.105, height: 0.05, depth: 0.125 }, scene), trim, 0, -0.04, 0.02),
    part(MeshBuilder.CreateCylinder("blasterBarrel", { height: 0.12, diameter: 0.06, tessellation: 12 }, scene), body, 0, -0.3, 0.04),
    part(MeshBuilder.CreateCylinder("blasterTip", { height: 0.04, diameter: 0.075, tessellation: 12 }, scene), tip, 0, -0.37, 0.04),
    part(MeshBuilder.CreateBox("blasterGrip", { width: 0.07, height: 0.07, depth: 0.12 }, scene), trim, 0, 0.0, -0.07),
  ];
  return { root, meshes };
}

/** A slim gold bangle with a pink bead, on the wrist. */
function buildBracelet(scene) {
  const root = new TransformNode("bracelet", scene);
  const gold = metalMaterial(scene, "braceletGold", "#f0c14d");
  const band = MeshBuilder.CreateTorus("braceletBand", { diameter: 0.072, thickness: 0.009, tessellation: 24 }, scene);
  band.parent = root;
  band.position.y = WRIST_Y + 0.014;
  band.material = gold;
  const bead = MeshBuilder.CreateSphere("braceletBead", { diameter: 0.017, segments: 10 }, scene);
  bead.parent = root;
  bead.position.set(-0.037, WRIST_Y + 0.014, 0.008);
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
  const shade = mesh.metadata?.shade;
  const scratch = new Color3();
  for (let i = 0, c = 0; i < positions.length; i += 3, c += 4) {
    let color = solid;
    if (!color) {
      const t = (top - positions[i + 1]) / (top - bottom);
      Color3.HSVtoRGBToRef(t * 300, 0.62, 1, scratch);
      color = scratch;
    }
    const tone = shade ? shade[i / 3] : 1;
    colors[c] = Math.min(1, color.r * tone);
    colors[c + 1] = Math.min(1, color.g * tone);
    colors[c + 2] = Math.min(1, color.b * tone);
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
