import { Color3, DynamicTexture, Material, Mesh, MeshBuilder, StandardMaterial, TransformNode, VertexBuffer } from "@babylonjs/core";
import { buildCapybara } from "./capybara.js";
import { mulberry32 } from "./geometry.js";
import { t } from "./i18n.js";
import { linear, merged, plainMaterial, recolorPad, unlitMaterial } from "./seasons.js";

/** Reaching this checkpoint locks you up. The escape runs until the FREEDOM_LEVEL checkpoint. */
export const PRISON_LEVEL = 100;
export const FREEDOM_LEVEL = 110;

export function isPrisonLevel(level) {
  return level >= PRISON_LEVEL && level < FREEDOM_LEVEL;
}

const CONCRETE = linear("#a3a7ad");
const STRIPE_LIGHT = linear("#f2efe6");
const STRIPE_DARK = linear("#2b2b31");
const JUMPSUIT = linear("#ff7a1a");
const ALARM_ON = new Color3(1, 0.1, 0.06);
const ALARM_OFF = new Color3(0.25, 0.02, 0.02);
const BEAM_LENGTH = 7;
const BEAM_TILT = 0.95;
const CELL_BARS = 16;
const CELL_HEIGHT = 2.3;
/** Seconds the cell door stays shut. You can't move until it opens. */
const CELL_HOLD = 3;
const BAR_DROP = 0.3;
const BAR_LIFT = 0.9;
const BAR_START = 3.2;

/**
 * Capybara Prison, from the level-100 checkpoint up to the level-110 one: pads painted as concrete,
 * prison stripes, and orange-jumpsuit checkpoints, with sweeping searchlights, flashing alarms,
 * capybara inmates, and the cell you get locked in at level 100. The guards are course hazards.
 * Prison pads never change back, so nothing here needs undoing beyond the props.
 */
export function createPrison(scene, { graphics }) {
  let kit = null;
  const dressed = new Map();
  const glowSeen = new WeakMap();
  let cell = null;

  function build() {
    return {
      inmate: buildCapybara(scene, "inmate"),
      lamp: buildLamp(scene),
      beam: buildBeam(scene),
      alarm: buildAlarm(scene),
    };
  }

  function dress(pad) {
    if (dressed.has(pad) || !pad.mesh || pad.lavaDisc || pad.stair) return;
    const freedom = pad.role === "checkpoint" && pad.level === FREEDOM_LEVEL;
    if (!pad.prison && !freedom) return;
    kit ??= build();
    const record = { decor: [], beams: [], hoppers: [], bars: null };
    dressed.set(pad, record);
    if (pad.prison && pad.kind !== "spring") {
      const colors = pad.mesh.getVerticesData(VertexBuffer.ColorKind);
      if (colors) pad.mesh.setVerticesData(VertexBuffer.ColorKind, recolor(pad, colors));
    }
    decorate(pad, record, freedom);
  }

  function decorate(pad, record, freedom) {
    const top = pad.thickness ?? 0.4;
    const r = pad.walkRadius ?? 1;
    const place = (source, name, x, y, z, yaw = 0, parent = pad.mesh) => {
      const mesh = source.createInstance(`${pad.id}-${name}`);
      mesh.parent = parent;
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.isPickable = false;
      record.decor.push(mesh);
      return mesh;
    };

    if (freedom) {
      record.decor.push(...buildSign(scene, pad, t("prison.freedom"), "#2f8f46", "#ffffff"));
      return;
    }
    if (pad.role === "checkpoint") {
      // The alarm sits on top of the flag pole.
      place(kit.alarm, "alarm", r * 0.75, top + 1.4, 0.5);
      const cellmate = place(kit.inmate, "cellmate", -r * 0.6, top - 0.06, -0.2, Math.PI * 0.6);
      record.hoppers.push({ mesh: cellmate, base: top - 0.06, phase: pad.index * 0.7 });
      if (pad.level === PRISON_LEVEL) {
        record.decor.push(...buildSign(scene, pad, t("prison.sign"), "#2f3640", "#ffd23f"));
        record.bars = buildBars(scene, pad);
      }
      return;
    }
    if (r < 1 || pad.kind === "spring") return;
    const random = mulberry32(pad.index * 977 + 3);
    const angle = Math.PI * (0.65 + random() * 0.7);
    const edgeX = (a) => Math.cos(a) * r * 0.8;
    const edgeZ = (a) => Math.sin(a) * r * 0.55;
    if (pad.index % 4 === 2) {
      place(kit.lamp, "lamp", edgeX(angle), top - 0.05, edgeZ(angle));
      const pivot = new TransformNode(`${pad.id}-searchlight`, scene);
      pivot.parent = pad.mesh;
      pivot.position.set(edgeX(angle), top + 1.55, edgeZ(angle));
      place(kit.beam, "beam", 0, 0, 0, 0, pivot);
      record.decor.push(pivot);
      record.beams.push({ pivot, speed: (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.4), phase: random() * 6.28 });
    }
    const guarded = pad.hazards.some((hazard) => hazard.kind === "guard");
    if (!guarded && pad.index % 3 === 1) {
      const across = angle + Math.PI;
      place(kit.inmate, "inmate", edgeX(across), top - 0.06, edgeZ(across), Math.PI / 2 - across + Math.PI);
    }
  }

  function undress(pad) {
    const record = dressed.get(pad);
    if (!record) return;
    dressed.delete(pad);
    for (const mesh of record.decor) mesh.dispose();
    record.bars?.dispose();
    if (cell?.record === record) cell = null;
  }

  function excludeFromGlow() {
    const layer = graphics.pipeline.glowLayer;
    if (!kit || !layer || glowSeen.get(layer)) return;
    glowSeen.set(layer, true);
    layer.addExcludedMesh(kit.beam);
  }

  return {
    addPad: dress,
    removePad: undress,
    /** True while the cell door is shut. */
    get locked() {
      return Boolean(cell) && cell.time < CELL_HOLD;
    },
    /** Slams the cell bars down around the level-100 checkpoint, then lifts them away. */
    lockUp(pad) {
      dress(pad);
      const record = dressed.get(pad);
      if (!record?.bars) return;
      record.bars.setEnabled(true);
      cell = { record, time: 0, top: pad.thickness ?? 0.4 };
    },
    update(time, dt) {
      if (!kit) return;
      excludeFromGlow();
      const flash = Math.sin(time * 7) > 0 ? 1 : 0;
      Color3.LerpToRef(ALARM_OFF, ALARM_ON, flash, kit.alarm.material.emissiveColor);
      for (const record of dressed.values()) {
        for (const beam of record.beams) beam.pivot.rotation.y = beam.phase + time * beam.speed;
        for (const hop of record.hoppers) {
          hop.mesh.position.y = hop.base + Math.abs(Math.sin(time * 5 + hop.phase)) * 0.18;
        }
      }
      if (cell) stepCell(dt);
    },
  };

  function stepCell(dt) {
    cell.time += dt;
    const bars = cell.record.bars;
    const rest = cell.top - 0.08;
    const { time } = cell;
    if (time < BAR_DROP) {
      const k = time / BAR_DROP;
      bars.position.y = rest + BAR_START * (1 - k * k);
      bars.visibility = 1;
    } else if (time < CELL_HOLD) {
      // A rattle as it lands.
      const since = time - BAR_DROP;
      bars.position.y = rest + Math.max(0, Math.sin(since * 30) * 0.08 * (1 - since * 3));
    } else if (time < CELL_HOLD + BAR_LIFT) {
      const k = (time - CELL_HOLD) / BAR_LIFT;
      bars.position.y = rest + BAR_START * k * k;
      bars.visibility = 1 - k;
    } else {
      bars.setEnabled(false);
      bars.visibility = 1;
      cell = null;
    }
  }
}

/** Gray concrete with block seams, prison stripes on every third pad, and orange-jumpsuit checkpoints. */
function recolor(pad, colors) {
  const look = pad.role === "checkpoint" ? "jumpsuit" : pad.index % 3 === 0 ? "stripes" : "concrete";
  return recolorPad(pad, colors, (x, z, shade) => {
    if (look === "stripes") return [Math.floor(x * 2.4 + 40) % 2 ? STRIPE_DARK : STRIPE_LIGHT, 0.75 + shade * 0.25];
    if (look === "concrete") {
      const seam = frac(x * 1.5) < 0.1 || frac(z * 3) < 0.1;
      return [CONCRETE, shade * (seam ? 0.62 : 1)];
    }
    return [JUMPSUIT, shade];
  });
}

function frac(value) {
  return value - Math.floor(value);
}

/** A ring of bars with a band at the top, standing on the pad. Hidden until you get locked up. */
function buildBars(scene, pad) {
  const metal = plainMaterial(scene, `${pad.id}-barsMat`, "#3a3f47");
  metal.specularColor.set(0.6, 0.6, 0.65);
  const radius = (pad.walkRadius ?? 1.5) + 0.1;
  const parts = [];
  for (let i = 0; i < CELL_BARS; i += 1) {
    const a = (i / CELL_BARS) * Math.PI * 2;
    const bar = MeshBuilder.CreateCylinder(`${pad.id}-bar${i}`, { height: CELL_HEIGHT, diameter: 0.09, tessellation: 8 }, scene);
    bar.position.set(Math.cos(a) * radius, CELL_HEIGHT / 2, Math.sin(a) * radius);
    parts.push(bar);
  }
  for (const y of [0.05, CELL_HEIGHT]) {
    const band = MeshBuilder.CreateTorus(`${pad.id}-band`, { diameter: radius * 2, thickness: 0.1, tessellation: 40 }, scene);
    band.position.y = y;
    parts.push(band);
  }
  const bars = Mesh.MergeMeshes(parts, true);
  bars.name = `${pad.id}-cell`;
  bars.material = metal;
  bars.parent = pad.mesh;
  bars.isPickable = false;
  bars.setEnabled(false);
  const dispose = bars.dispose.bind(bars);
  bars.dispose = () => {
    dispose();
    metal.dispose();
  };
  return bars;
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

/** A gray post with a lamp head. The beam is a separate piece so it can turn. */
function buildLamp(scene) {
  const metal = plainMaterial(scene, "prisonLampMetal", "#5d636c");
  const bulb = plainMaterial(scene, "prisonLampBulb", "#fff2b0", 1);
  const post = MeshBuilder.CreateCylinder("prisonLampPost", { height: 1.6, diameter: 0.08, tessellation: 8 }, scene);
  post.position.y = 0.8;
  post.material = metal;
  const head = MeshBuilder.CreateCylinder("prisonLampHead", { height: 0.26, diameterTop: 0.2, diameterBottom: 0.32, tessellation: 12 }, scene);
  head.position.y = 1.62;
  head.material = metal;
  const glow = MeshBuilder.CreateSphere("prisonLampGlow", { diameter: 0.22, segments: 8 }, scene);
  glow.position.y = 1.52;
  glow.material = bulb;
  return merged("prisonLamp", [post, head, glow]);
}

/** A see-through cone of light, tip at the origin, pointing out along +z and down. */
function buildBeam(scene) {
  const cone = MeshBuilder.CreateCylinder(
    "prisonBeam",
    { height: BEAM_LENGTH, diameterTop: 0.25, diameterBottom: 3.2, tessellation: 24, cap: Mesh.NO_CAP },
    scene,
  );
  cone.position.y = -BEAM_LENGTH / 2;
  cone.bakeCurrentTransformIntoVertices();
  cone.rotation.x = -BEAM_TILT;
  cone.bakeCurrentTransformIntoVertices();
  const material = new StandardMaterial("prisonBeamMat", scene);
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = new Color3(1, 0.86, 0.36);
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.alpha = 0.24;
  // Instances only draw see-through when the blend mode is set outright.
  material.transparencyMode = Material.MATERIAL_ALPHABLEND;
  cone.material = material;
  cone.isPickable = false;
  cone.isVisible = false;
  return cone;
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
