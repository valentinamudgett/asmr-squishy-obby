import { ArcRotateCamera, CreateScreenshotUsingRenderTargetAsync, Vector3 } from "@babylonjs/core";
import { createPreview } from "./avatar.js";
import { COSTUMES } from "./costumes.js";
import { DANCES } from "./dances.js";
import { FACES } from "./faces.js";
import { AGES, BODIES, cleanLook, HAIR_STYLES, HAIR_SWATCHES, HELD_FOODS, SKIN_SWATCHES } from "./look.js";
import { OUTFITS } from "./outfits.js";

/** Ages that suit each household role, youngest first. */
export const ROLE_AGES = {
  parent: ["adult"],
  roommate: ["teen", "adult"],
  sibling: ["kid", "teen"],
  baby: ["kid"],
};
/** The baby is a kid avatar shrunk this far. */
export const BABY_SCALE = 0.62;

const BABY_OUTFITS = ["overalls", "pinafore", "hoodie"];
const BABY_FACES = ["dumpling", "grin", "sleepy", "smile"];
const BABY_HAIR = ["buns", "short", "waves"];
const SQUISHIES = HELD_FOODS.filter((food) => food.id !== "none").map((food) => food.id);
const MOVES = DANCES.filter((dance) => dance.id !== "none").map((dance) => dance.id);

const pick = (list, rand) => list[Math.floor(rand() * list.length)];
/** Prefers what nobody in `taken` has yet, so a household doesn't look like clones. */
const pickFresh = (list, taken, rand) => pick(list.filter((each) => !taken.includes(each)), rand) ?? pick(list, rand);

/**
 * A random, nice-looking avatar look for a household role, made the way the obby regulars get
 * theirs: body, age, face, hair and color, skin, outfit, plus a few accessories, now and then a
 * costume or a held squishy, and a dance for happy moments. `others` are looks already at home.
 */
export function makeLook(role, rand = Math.random, others = []) {
  const baby = role === "baby";
  const body = pick(BODIES, rand).id;
  const ages = ROLE_AGES[role] ?? AGES.map((age) => age.id);
  const hairColors = others.map((look) => look.hairColor);
  const look = {
    body,
    age: pick(ages, rand),
    hair: baby ? pick(BABY_HAIR, rand) : pickFresh(HAIR_STYLES.map((style) => style.id), others.map((each) => each.hair), rand),
    face: baby ? pick(BABY_FACES, rand) : pick(FACES, rand).id,
    hairColor: !baby && rand() < 0.12 && !hairColors.includes("rainbow") ? "rainbow" : pickFresh(HAIR_SWATCHES, hairColors, rand),
    outfit: baby ? pick(BABY_OUTFITS, rand) : pickFresh(OUTFITS.map((outfit) => outfit.id), others.map((each) => each.outfit), rand),
    skinColor: pick(SKIN_SWATCHES, rand),
    bow: body === "girl" && rand() < (baby ? 0.7 : 0.4),
    necklace: !baby && rand() < 0.3,
    headband: !baby && rand() < 0.18,
    bracelet: !baby && rand() < 0.3,
    held: rand() < (baby ? 0.55 : 0.15) ? (baby ? "blob" : pick(SQUISHIES, rand)) : "none",
    costume: !baby && rand() < 0.15 ? pick(COSTUMES.filter((costume) => costume.id !== "none"), rand).id : "none",
    dance: pick(MOVES, rand),
  };
  return cleanLook(look);
}

/** A look saved with a member, cleaned, with the age kept to what suits the role. */
export function roleLook(role, data) {
  const look = cleanLook(data);
  const ages = ROLE_AGES[role];
  if (ages && !ages.includes(look.age)) look.age = ages[0];
  return look;
}

const SHOT_W = 144;
const SHOT_H = 168;

/**
 * One Character-studio preview shared by the Household sheet: it turns live while a member is
 * being customized, and paints small portraits for the member cards the rest of the time. One
 * WebGL context for the whole sheet, made the first time it's needed.
 */
export function createLookShots() {
  let preview = null;
  let canvas = null;
  let portraitCam = null;
  let live = null;
  let busy = false;
  const cache = new Map();
  const waiting = new Map();
  /** Portrait images still waiting for their picture, by look key. */
  const holes = [];

  function ensure() {
    if (preview) return preview;
    canvas = document.createElement("canvas");
    canvas.className = "city-look-canvas";
    canvas.width = SHOT_W;
    canvas.height = SHOT_H;
    preview = createPreview(canvas);
    for (const mesh of preview.avatar.root.getChildMeshes()) mesh.isPickable = false;
    const scene = preview.avatar.root.getScene();
    const studio = scene.activeCamera;
    portraitCam = new ArcRotateCamera("portraitCam", studio.alpha, 1.42, 1, Vector3.Zero(), scene);
    portraitCam.fov = studio.fov;
    portraitCam.inputs.clear();
    scene.activeCamera = studio;
    return preview;
  }

  /** Paints the next waiting portrait, then the one after. Waits while the live view is up. */
  async function pump() {
    if (busy || live || waiting.size === 0) return;
    busy = true;
    const [key, look] = waiting.entries().next().value;
    waiting.delete(key);
    const { avatar } = ensure();
    const scene = avatar.root.getScene();
    avatar.apply(look);
    avatar.update(0, { x: 0, y: 0, z: 0, facing: 0.25, airborne: false, moving: false, time: 0 });
    portraitCam.target.set(0, avatar.height * 0.8, 0);
    portraitCam.radius = avatar.height * 0.62;
    let url = "";
    try {
      url = await CreateScreenshotUsingRenderTargetAsync(scene.getEngine(), portraitCam, { width: SHOT_W, height: SHOT_H }, "image/png", 4);
    } catch {
      url = "";
    }
    if (cache.size > 40) cache.clear();
    if (url) cache.set(key, url);
    for (let i = holes.length - 1; i >= 0; i -= 1) {
      const hole = holes[i];
      if (hole.key === key && url) hole.img.src = url;
      if (hole.key === key || !hole.img.isConnected) holes.splice(i, 1);
    }
    busy = false;
    if (live) avatar.apply(live);
    pump();
  }

  /** Fills `img` with a head-and-shoulders portrait of `look`, now or as soon as it's painted. */
  function shot(look, img) {
    const key = JSON.stringify(look);
    const hit = cache.get(key);
    if (hit) {
      img.src = hit;
      return;
    }
    holes.push({ key, img });
    waiting.set(key, look);
    pump();
  }

  return {
    shot,
    /** Shows `look` turning in `holder`, until `stop`. */
    show(holder, look) {
      const view = ensure();
      live = look;
      view.avatar.apply(look);
      if (canvas.parentElement !== holder) holder.replaceChildren(canvas);
      view.start();
      view.resize();
    },
    /** Updates the live look (after a pick in the Customize panel). */
    set(look) {
      live = look;
      preview?.avatar.apply(look);
    },
    dance(id) {
      preview?.avatar.dance(id);
    },
    stop() {
      live = null;
      preview?.stop();
      canvas?.remove();
      pump();
    },
  };
}
