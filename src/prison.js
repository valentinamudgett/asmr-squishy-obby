import { Color3, DynamicTexture, MeshBuilder, StandardMaterial, VertexBuffer } from "@babylonjs/core";
import { buildCapybara } from "./capybara.js";
import { t } from "./i18n.js";
import { linear, plainMaterial, recolorPad, unlitMaterial } from "./seasons.js";

/**
 * Reaching this checkpoint locks you up in Capybara Prison (see escape.js). The course has no pads
 * between it and the FREEDOM_LEVEL checkpoint, where the escape lets you out again.
 */
export const PRISON_LEVEL = 50;
export const FREEDOM_LEVEL = 100;

export function isPrisonLevel(level) {
  return level >= PRISON_LEVEL && level < FREEDOM_LEVEL;
}

const JUMPSUIT = linear("#ff7a1a");
const ALARM_ON = new Color3(1, 0.1, 0.06);
const ALARM_OFF = new Color3(0.25, 0.02, 0.02);

/**
 * The course side of Capybara Prison: the level-50 checkpoint wears jumpsuit orange with a
 * flashing alarm, a hopping capybara inmate, and the prison sign, and the level-100 checkpoint
 * gets a FREEDOM! sign.
 */
export function createPrison(scene) {
  let kit = null;
  const dressed = new Map();

  function dress(pad) {
    if (dressed.has(pad) || !pad.mesh || pad.role !== "checkpoint") return;
    const gate = pad.level === PRISON_LEVEL;
    const freedom = pad.level === FREEDOM_LEVEL;
    if (!gate && !freedom) return;
    kit ??= { inmate: buildCapybara(scene, "inmate"), alarm: buildAlarm(scene) };
    const record = { decor: [], hoppers: [] };
    dressed.set(pad, record);
    if (freedom) {
      record.decor.push(...buildSign(scene, pad, t("prison.freedom"), "#2f8f46", "#ffffff"));
      return;
    }
    const colors = pad.mesh.getVerticesData(VertexBuffer.ColorKind);
    if (colors) pad.mesh.setVerticesData(VertexBuffer.ColorKind, recolorPad(pad, colors, (x, z, shade) => [JUMPSUIT, shade]));
    const top = pad.thickness ?? 0.4;
    const r = pad.walkRadius ?? 1;
    const place = (source, name, x, y, z, yaw = 0) => {
      const mesh = source.createInstance(`${pad.id}-${name}`);
      mesh.parent = pad.mesh;
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.isPickable = false;
      record.decor.push(mesh);
      return mesh;
    };
    // The alarm sits on top of the flag pole.
    place(kit.alarm, "alarm", r * 0.75, top + 1.4, 0.5);
    const cellmate = place(kit.inmate, "cellmate", -r * 0.6, top - 0.06, -0.2, Math.PI * 0.6);
    record.hoppers.push({ mesh: cellmate, base: top - 0.06, phase: pad.index * 0.7 });
    record.decor.push(...buildSign(scene, pad, t("prison.sign"), "#2f3640", "#ffd23f"));
  }

  function undress(pad) {
    const record = dressed.get(pad);
    if (!record) return;
    dressed.delete(pad);
    for (const mesh of record.decor) mesh.dispose();
  }

  return {
    addPad: dress,
    removePad: undress,
    update(time) {
      if (!kit) return;
      const flash = Math.sin(time * 7) > 0 ? 1 : 0;
      Color3.LerpToRef(ALARM_OFF, ALARM_ON, flash, kit.alarm.material.emissiveColor);
      for (const record of dressed.values()) {
        for (const hop of record.hoppers) {
          hop.mesh.position.y = hop.base + Math.abs(Math.sin(time * 5 + hop.phase)) * 0.18;
        }
      }
    },
  };
}

/** A sign on two posts at the far left of the pad, facing the way you came in. */
function buildSign(scene, pad, text, background, ink) {
  const top = pad.thickness ?? 0.4;
  const r = pad.walkRadius ?? 1.5;
  const texture = new DynamicTexture(`${pad.id}-signTex`, { width: 512, height: 128 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 64;
  do {
    ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 460 && size > 20);
  ctx.fillText(text, 256, 68);
  texture.update();
  const material = unlitMaterial(scene, `${pad.id}-signMat`, texture, { alpha: false });
  // One face per side, so the words read the right way round from behind too.
  material.backFaceCulling = true;
  const boards = [0, Math.PI].map((yaw) => {
    const board = MeshBuilder.CreatePlane(`${pad.id}-sign`, { width: 2, height: 0.5 }, scene);
    board.material = material;
    board.parent = pad.mesh;
    board.position.set(-r * 0.45, top + 1.45, r * 0.65);
    board.rotation.y = yaw;
    board.isPickable = false;
    return board;
  });
  const wood = plainMaterial(scene, `${pad.id}-postMat`, "#6b4a2e");
  const posts = [-0.85, 0.85].map((dx) => {
    const post = MeshBuilder.CreateCylinder(`${pad.id}-signPost`, { height: 1.7, diameter: 0.07, tessellation: 8 }, scene);
    post.material = wood;
    post.parent = pad.mesh;
    post.position.set(-r * 0.45 + dx, top + 0.85 - 0.12, r * 0.65 + 0.02);
    post.isPickable = false;
    return post;
  });
  const owned = { dispose: () => [material, texture, wood].forEach((item) => item.dispose()) };
  return [...boards, ...posts, owned];
}

/** A red dome that flashes. All alarms share one material, so they flash together. */
function buildAlarm(scene) {
  const dome = MeshBuilder.CreateSphere("prisonAlarmDome", { diameter: 0.3, segments: 10, slice: 0.55 }, scene);
  const material = new StandardMaterial("prisonAlarm", scene);
  material.diffuseColor = new Color3(0.8, 0.05, 0.05);
  material.emissiveColor = ALARM_OFF.clone();
  material.specularColor = new Color3(0.6, 0.6, 0.6);
  dome.material = material;
  dome.isPickable = false;
  dome.isVisible = false;
  return dome;
}
