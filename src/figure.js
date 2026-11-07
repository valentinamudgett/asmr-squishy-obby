import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial } from "@babylonjs/core";
import { buildAvatar } from "./avatar.js";
import { cleanLook } from "./look.js";
import { STAIR_RUN } from "./player.js";

const TAG_W = 512;
const TAG_H = 128;
const BUBBLE_W = 640;
const BUBBLE_H = 256;
const BUBBLE_LINES = 3;
/** Chat bubbles float this far over the head, clear of the name tag. */
export const BUBBLE_LIFT = 1.02;
/** How long a chat line floats over the speaker before it fades. */
const BUBBLE_SECONDS = 5;
const FONT = "system-ui, -apple-system, Segoe UI, Arial, sans-serif";
const LABEL_GROUP = 1;
const glowSeen = new WeakMap();

/**
 * Another player drawn in the world: an avatar with a name tag and a chat bubble. It has
 * no collider, so the local player walks straight through it.
 */
export function createFigure(scene, graphics) {
  const avatar = buildAvatar(scene);
  avatar.apply(cleanLook(null));
  for (const mesh of avatar.root.getChildMeshes()) mesh.isPickable = false;
  for (const mesh of avatar.parts) graphics.shadow.addShadowCaster(mesh, true);
  const tag = createNameTag(scene, graphics);
  const bubble = createBubble(scene, graphics);
  let shown = true;

  return {
    avatar,
    get name() {
      return tag.name;
    },
    get shown() {
      return shown;
    },
    setName(next) {
      tag.setName(next);
    },
    say(text) {
      bubble.say(text);
    },
    setShown(on) {
      if (shown === on) return;
      shown = on;
      avatar.root.setEnabled(on);
      tag.setShown(on);
      bubble.setShown(on);
    },
    /** `pose` is in the same shape the local avatar gets, plus `running` for the stair stride. */
    update(dt, pose, camera, time) {
      avatar.update(dt, {
        ...pose,
        // A level-up dance turns to face whoever is watching.
        faceAngle: Math.atan2(camera.position.x - pose.x, camera.position.z - pose.z),
        stride: pose.running ? STAIR_RUN : 1,
        time,
      });
      const top = pose.y - (pose.sink ?? 0) + avatar.height;
      tag.update(pose.x, top, pose.z);
      bubble.update(dt, pose.x, top + BUBBLE_LIFT, pose.z);
    },
    dispose() {
      for (const mesh of avatar.parts) graphics.shadow.removeShadowCaster(mesh, true);
      avatar.dispose();
      tag.dispose();
      bubble.dispose();
    },
  };
}

/** A name floating just over an avatar's head. `top` is the top of the head. */
export function createNameTag(scene, graphics) {
  const mesh = createLabel(scene, "nameTag", 1.6, 0.4, TAG_W, TAG_H);
  let name = "";
  return {
    get name() {
      return name;
    },
    setName(next) {
      if (next === name) return;
      name = next;
      paintTag(mesh, next);
    },
    setShown(on) {
      mesh.setEnabled(on);
    },
    update(x, top, z) {
      mesh.position.set(x, top + 0.3, z);
      noGlow(graphics, mesh);
    },
    dispose() {
      mesh.dispose(false, true);
    },
  };
}

/** A speech bubble that floats at a point for a few seconds after `say()`. */
export function createBubble(scene, graphics) {
  const mesh = createLabel(scene, "chatBubble", 2, 0.8, BUBBLE_W, BUBBLE_H);
  mesh.setEnabled(false);
  let left = 0;
  let allowed = true;
  return {
    say(text) {
      paintBubble(mesh, text);
      left = BUBBLE_SECONDS;
      mesh.visibility = 1;
      mesh.setEnabled(allowed);
    },
    setShown(on) {
      allowed = on;
      mesh.setEnabled(on && left > 0);
    },
    update(dt, x, y, z) {
      if (left <= 0) return;
      left -= dt;
      mesh.position.set(x, y, z);
      mesh.visibility = Math.min(1, left / 0.6);
      if (left <= 0) mesh.setEnabled(false);
      noGlow(graphics, mesh);
    },
    dispose() {
      mesh.dispose(false, true);
    },
  };
}

/** The glow layer appears when graphics go to High, so check each frame that labels stay out of it. */
function noGlow(graphics, mesh) {
  const layer = graphics.pipeline.glowLayer;
  if (!layer || glowSeen.get(mesh) === layer) return;
  layer.addExcludedMesh(mesh);
  glowSeen.set(mesh, layer);
}

function createLabel(scene, name, width, height, texW, texH) {
  const texture = new DynamicTexture(`${name}Tex`, { width: texW, height: texH }, scene, true);
  texture.hasAlpha = true;
  const material = new StandardMaterial(`${name}Mat`, scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  const mesh = MeshBuilder.CreatePlane(name, { width, height }, scene);
  mesh.material = material;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  // Big see-through backdrops sort after small labels and would paint over them, so labels draw
  // in a later group that keeps the depth buffer: solid things in front still hide them.
  mesh.renderingGroupId = LABEL_GROUP;
  scene.setRenderingAutoClearDepthStencil(LABEL_GROUP, false, false, false);
  return mesh;
}

function paintTag(tag, name) {
  const texture = tag.material.emissiveTexture;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, TAG_W, TAG_H);
  ctx.font = `800 58px ${FONT}`;
  const width = Math.min(TAG_W - 8, ctx.measureText(name).width + 56);
  const h = TAG_H - 36;
  roundRect(ctx, (TAG_W - width) / 2, 18, width, h, h / 2);
  ctx.fillStyle = "rgba(255, 250, 253, 0.88)";
  ctx.fill();
  ctx.fillStyle = "#6a3f82";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, TAG_W / 2, 18 + h / 2 + 2, TAG_W - 40);
  texture.update();
}

function paintBubble(mesh, text) {
  const texture = mesh.material.emissiveTexture;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, BUBBLE_W, BUBBLE_H);
  ctx.font = `700 46px ${FONT}`;
  const lines = wrap(ctx, text, BUBBLE_W - 80);
  const lineH = 54;
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const w = Math.min(BUBBLE_W - 8, widest + 64);
  const h = lines.length * lineH + 34;
  const x = (BUBBLE_W - w) / 2;
  const y = BUBBLE_H - 30 - h;
  roundRect(ctx, x, y, w, h, 30);
  ctx.moveTo(BUBBLE_W / 2 - 22, y + h - 1);
  ctx.lineTo(BUBBLE_W / 2, y + h + 26);
  ctx.lineTo(BUBBLE_W / 2 + 22, y + h - 1);
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fill();
  ctx.fillStyle = "#3a2433";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, index) => ctx.fillText(line, BUBBLE_W / 2, y + 17 + lineH * (index + 0.5) + 2));
  texture.update();
}

/** Breaks text into at most three lines that fit `max` pixels, with an ellipsis if it runs over. */
function wrap(ctx, text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  if (lines.length > BUBBLE_LINES) {
    lines.length = BUBBLE_LINES;
    lines[BUBBLE_LINES - 1] += "…";
  }
  return lines.map((each) => {
    let fitted = each;
    while (fitted.length > 1 && ctx.measureText(fitted).width > max) fitted = `${fitted.slice(0, -2)}…`;
    return fitted;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, (Math.PI * 3) / 2);
  ctx.closePath();
}
