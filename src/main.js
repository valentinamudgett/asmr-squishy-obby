import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  HavokPlugin,
  HemisphericLight,
  ImageProcessingConfiguration,
  Scene,
  ShadowGenerator,
  Vector3,
  WebGPUEngine,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import { createAudio } from "./audio.js";
import { createLavaPop } from "./boom.js";
import { awardLevelCoin, createCoinPop, loadCoins } from "./coins.js";
import { buildAvatar, createPreview } from "./avatar.js";
import { createCourse, LAVA_Y, PADS_PER_LEVEL } from "./course.js";
import { drawFace, FACES } from "./faces.js";
import { DANCES } from "./dances.js";
import { createGuideArrow } from "./guide.js";
import { applyTranslations, t } from "./i18n.js";
import {
  AGES,
  BODIES,
  defaultHair,
  HAIR_STYLES,
  HAIR_SWATCHES,
  loadLook,
  PRESETS,
  saveLook,
  SKIN_SWATCHES,
} from "./look.js";
import { OUTFITS } from "./outfits.js";
import { smoothstep } from "./geometry.js";
import { createPlayer, FOOT_OFFSET, STAIR_RUN } from "./player.js";
import { isOwned, itemKey, loadWallet, priceOf, SHOP_GROUPS, starsLeft, tryBuy } from "./rewards.js";
import { createWorld } from "./world.js";
import "./style.css";

const canvas = document.querySelector("#view");
const boot = document.querySelector("#boot");
const bootStatus = document.querySelector("#boot-status");
const bootBar = document.querySelector("#boot-bar");
const bootFill = document.querySelector("#boot-fill");
const timeEl = document.querySelector("#time");
const fallsEl = document.querySelector("#falls");
const levelEl = document.querySelector("#level");
const heightEl = document.querySelector("#height");
const bestEl = document.querySelector("#best");
const coinsEl = document.querySelector("#coins");
const coins = loadCoins();
coinsEl.textContent = String(coins.coins);
const hintEl = document.querySelector("#hint");
const toastEl = document.querySelector("#toast");
const debugEl = document.querySelector("#debug");
const settingsEl = document.querySelector("#settings");
const qualityNote = document.querySelector("#quality-note");
const showDebug = new URLSearchParams(location.search).has("debug");
const BEST_KEY = "asmr-squishy-obby:best";
const PLAYER_KEY = "asmr-squishy-obby:player";
const NY_AIM_RAISE = 0.5;

const look = loadLook();
const wallet = loadWallet(look);
let publishLook = () => {};
const ui = {
  settingsOpen: false,
  startOpen: true,
};

applyTranslations();
document.body.classList.add("start-open");
const bootProgress = createBootProgress();
bootGame().catch((error) => {
  console.error(error);
  bootProgress.fail();
  bootStatus.textContent = t("boot.error");
  boot.hidden = false;
  boot.classList.remove("is-done");
});

/**
 * Drives the loading bar. The shown value only ever grows: each stage sets a
 * target and the bar creeps toward (but never past) it so long awaits do not
 * look frozen. Resolves `finish()` once the bar has visibly reached 100%.
 */
function createBootProgress() {
  const CREEP_RATE = 0.4;
  const CREEP_HEADROOM = 0.14;
  let target = 0;
  let shown = 0;
  let last = performance.now();
  let frame = 0;
  bootBar.setAttribute("aria-label", t("boot.title"));

  const paint = () => {
    bootFill.style.width = `${(shown * 100).toFixed(2)}%`;
    bootBar.setAttribute("aria-valuenow", String(Math.round(shown * 100)));
  };

  // While waiting on a stage, ease a little past it (never near 100%) so the bar is never frozen.
  const ceiling = () => (target >= 1 ? 1 : Math.min(0.99, target + CREEP_HEADROOM));

  const tick = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const room = ceiling() - shown;
    shown = Math.max(shown, shown + room * Math.min(1, CREEP_RATE * dt));
    paint();
    frame = room > 0.001 ? requestAnimationFrame(tick) : 0;
  };

  const set = (fraction) => {
    target = Math.max(target, Math.min(1, fraction));
    shown = Math.max(shown, target);
    paint();
    last = performance.now();
    if (!frame && shown < ceiling()) frame = requestAnimationFrame(tick);
  };

  return {
    set,
    finish() {
      set(1);
      return new Promise((resolve) => {
        const done = () => {
          bootFill.removeEventListener("transitionend", done);
          resolve();
        };
        bootFill.addEventListener("transitionend", done);
        setTimeout(done, 450);
      });
    },
    fail() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

async function hideBoot() {
  await bootProgress.finish();
  boot.classList.add("is-done");
  await new Promise((resolve) => setTimeout(resolve, 400));
  boot.hidden = true;
}

async function bootGame() {
  bootProgress.set(0.04);
  const engine = await createEngine(canvas);
  fit(engine);
  const scene = new Scene(engine);
  bootProgress.set(0.1);
  scene.clearColor = new Color4(0.35, 0.12, 0.14, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 40;
  scene.fogEnd = 120;
  scene.fogColor = new Color3(0.92, 0.52, 0.46);
  scene.ambientColor = new Color3(0.24, 0.16, 0.2);

  const havok = await HavokPhysics({
    locateFile: (file) => (file.endsWith(".wasm") ? havokWasmUrl : file),
  });
  const plugin = new HavokPlugin(true, havok);
  scene.enablePhysics(new Vector3(0, -24, 0), plugin);
  bootProgress.set(0.3);

  const world = createWorld(scene, LAVA_Y);
  bootProgress.set(0.5);
  const audio = await createAudio();
  bootProgress.set(0.7);
  let graphics = null;
  let best = loadBest();
  const course = createCourse(scene, {
    onAdd(pad) {
      audio.attachPad(pad).catch((error) => console.warn("Pad sound failed", error));
      graphics?.addPad(pad);
    },
    onRemove(pad) {
      audio.detachPad(pad);
      graphics?.removePad(pad);
      if (pad.flight) graphics?.removeStair(pad.flight);
    },
    onStair(flight) {
      graphics?.addStair(flight);
    },
  });

  const avatar = buildAvatar(scene);
  avatar.apply(look);
  bootProgress.set(0.85);

  const spawn = course.standOn(course.start, FOOT_OFFSET);
  let checkpointPad = course.start;
  const player = createPlayer(scene, spawn, {
    findPad: (foot) => course.findPad(foot),
    onLand: (pad, impact) => {
      const amount = pad.kind === "spring" ? 0.95 : Math.min(0.9, 0.4 + impact / 14);
      pad.kick(amount);
      audio.crunch(pad, impact);
      avatar.nudge(impact);
    },
    onJump: (pad) => {
      pad.kick(pad.kind === "spring" ? 0.38 : 0.22);
    },
  }, course.start.heading ?? 0);
  audio.attachListener(player.camera);
  graphics = createGraphics(scene, player.camera, world);
  for (const mesh of avatar.parts) graphics.shadow.addShadowCaster(mesh, true);
  for (const pad of course.pads) graphics.addPad(pad);
  for (const flight of course.flights) graphics.addStair(flight);
  graphics.apply(look.quality);

  const preview = createPreview(document.querySelector("#preview"));
  preview.avatar.apply(look);
  bootProgress.set(0.92);
  const syncMenuMusic = () => audio.setMenuMusic(ui.startOpen || ui.settingsOpen);
  bindSettings(preview, graphics, avatar, syncMenuMusic);
  let aimRaise = 0;
  bindStartMenu(
    best,
    (difficulty) => course.setDifficulty(difficulty),
    (background) => {
      world.setBackdrop(background);
      // The night skyline stands on the horizon, so tip the view up enough to see it.
      aimRaise = background === "newyork" ? NY_AIM_RAISE : 0;
    },
    syncMenuMusic,
  );
  syncMenuMusic();
  bindShop(best, () => publishLook());
  bindTouch(player);

  let started = false;
  let startMs = 0;
  let elapsed = 0;
  let falls = 0;
  let fallLock = 0;
  let toastTimer = 0;
  let nextToast = null;
  let lastSafePad = course.start;
  const guide = createGuideArrow(scene);
  const pop = createLavaPop(scene, avatar);
  const coinPop = createCoinPop(scene, player.camera);
  let meltHome = null;
  const sendHome = (home) => {
    course.restoreStairs();
    const spot = course.standOn(home, FOOT_OFFSET);
    avatar.stopDance();
    player.respawn(spot, home.heading ?? 0);
    pop.place({ x: spot.x, y: spot.y - FOOT_OFFSET, z: spot.z });
    const next = home.flight?.steps[0] ?? course.pads.find((pad) => pad.index > home.index);
    if (next) guide.show(home, next);
  };
  let hintTimer = 9;
  let clock = 0;
  levelEl.textContent = String(course.start.level);
  bestEl.textContent = String(best);
  if (showDebug) window.__obby = { scene, course, player, world, audio, pop, coins, coinPop };

  const wake = () => {
    audio.unlock().catch((error) => console.warn("Audio unlock failed", error));
    document.body.classList.add("sound-on");
    if (!ui.settingsOpen) hintEl.textContent = hintCopy();
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
  hintEl.textContent = "Press a key or tap to wake the crunch.";

  window.addEventListener("resize", () => {
    fit(engine);
    preview.resize();
  });

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 1 / 30);
    if (dt <= 0) {
      scene.render();
      return;
    }
    clock += dt;
    fallLock = Math.max(0, fallLock - dt);
    if (pop.active) player.easeFall(pop.phase === "boom" ? 0 : 0.5);
    const allowInput = !ui.settingsOpen && !ui.startOpen && !avatar.dancing && !pop.active;
    const frame = player.update(dt, allowInput);
    const standing = frame.grounded ? frame.pad : null;
    course.update(clock, dt, { standing, position: frame.position, keepFrom: checkpointPad.index });
    const here = frame.pad ?? lastSafePad;
    const cover = world.update(clock, dt, frame.position, here.index / PADS_PER_LEVEL + 1);
    // High up the skyline is below you, so stop tipping the view toward the horizon.
    player.setAimRaise(aimRaise * (1 - smoothstep(8, 120, world.altitude)));
    graphics.update(clock, cover);
    audio.setWalking(frame.walking);
    avatar.update(dt, {
      x: frame.foot.x,
      y: frame.foot.y,
      z: frame.foot.z,
      sink: standing ? standing.sink : 0,
      facing: frame.facing,
      faceAngle: Math.atan2(player.camera.position.x - frame.foot.x, player.camera.position.z - frame.foot.z),
      airborne: frame.airborne,
      trick: frame.trick,
      trickP: frame.trickP,
      // Input, not speed: a moving pad or a landing slide carries the body without any steps.
      moving: frame.walking,
      stride: frame.onStair ? STAIR_RUN : 1,
      time: clock,
    });

    const lavaCue = pop.tick(dt, frame.foot, world.seaY);
    if (lavaCue === "boom") audio.boom();
    if (lavaCue === "done" && meltHome) {
      const home = meltHome.removed ? checkpointPad : meltHome;
      meltHome = null;
      sendHome(home);
      fallLock = 0.6;
    }

    graphics.sun.position.set(frame.position.x + 8, frame.position.y + 18, frame.position.z - 6);
    graphics.sun.setDirectionToTarget(frame.position);

    const startDx = frame.foot.x - course.start.mesh.position.x;
    const startDz = frame.foot.z - course.start.mesh.position.z;
    const startReach = course.start.solid?.r ?? course.start.walkRadius;
    const leftStart = Math.hypot(startDx, startDz) > startReach * 0.98;
    if (!started && (leftStart || frame.jumped)) {
      started = true;
      startMs = performance.now();
    }
    if (started) elapsed = (performance.now() - startMs) / 1000;

    if (frame.grounded && frame.pad && frame.pad.index < checkpointPad.index && !pop.active && fallLock <= 0) {
      falls += 1;
      fallLock = 0.6;
      lastSafePad = checkpointPad;
      sendHome(checkpointPad);
      showToast(t("toast.backToLevel"));
      toastTimer = 1.4;
      nextToast = t("toast.keepGoing");
    } else if (frame.grounded && frame.pad && isSafe(frame.pad)) {
      lastSafePad = frame.pad;
    }
    if (frame.grounded && frame.pad && guide.pad && frame.pad !== guide.pad) guide.hide();

    if (!pop.active && fallLock <= 0) {
      const burned = frame.foot.y < world.seaY + 0.15 || course.lavaBurn(frame.position);
      // Up high the sea is far below, so dropping past the course floor counts as the fall.
      const dropped = !burned && course.lava.y > world.seaY + 0.5 && frame.foot.y < course.lava.y;
      const bonked = !burned && !dropped && course.hazardHit(frame.position);
      if (dropped) {
        falls += 1;
        fallLock = 0.6;
        sendHome(lastSafePad.removed ? checkpointPad : lastSafePad);
        showToast(t("toast.backToLevel"));
        toastTimer = 1.4;
        nextToast = t("toast.keepGoing");
      } else if (burned || bonked) {
        const home = lastSafePad.removed ? checkpointPad : lastSafePad;
        if (burned && pop.begin()) {
          falls += 1;
          meltHome = home;
          avatar.stopDance();
          audio.scream();
          audio.setWalking(false);
          showToast(t("toast.tooHot"));
          toastTimer = 1.6;
          nextToast = t("toast.keepGoing");
        } else if (!burned) {
          falls += 1;
          fallLock = 0.6;
          // The pad may be moving, so ask for its current top.
          sendHome(home);
          showToast(t("toast.ouch"));
          toastTimer = 0.9;
          nextToast = t("toast.keepGoing");
        }
      }
    }
    guide.update(dt, clock);

    if (frame.grounded && frame.pad?.role === "checkpoint" && frame.pad.index > checkpointPad.index) {
      checkpointPad = frame.pad;
      levelEl.textContent = String(frame.pad.level);
      if (frame.pad.level > best) {
        best = frame.pad.level;
        bestEl.textContent = String(best);
        saveBest(best);
      }
      avatar.dance(look.dance);
      showToast(`Level ${frame.pad.level}`);
      toastTimer = 1.6;
      nextToast = null;
      if (awardLevelCoin(coins, frame.pad.level)) {
        coinsEl.textContent = String(coins.coins);
        coinPop.burst(frame.position);
      }
    }

    if (hintTimer > 0) {
      hintTimer -= dt;
      if (hintTimer <= 0 || (frame.justLanded && frame.pad && frame.pad !== course.start)) {
        hintEl.hidden = true;
      }
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0 && nextToast) {
        showToast(nextToast);
        nextToast = null;
        toastTimer = 1.8;
      } else if (toastTimer <= 0) {
        toastEl.hidden = true;
      }
    }

    heightEl.textContent = `${Math.max(0, Math.round(frame.foot.y - LAVA_Y))} m`;
    timeEl.textContent = formatTime(started ? elapsed : 0);
    fallsEl.textContent = String(falls);
    if (showDebug) {
      debugEl.hidden = false;
      debugEl.textContent = [
        frame.state,
        `level ${checkpointPad.level} pads ${course.pads.length} [${course.pads[0].index}-${course.pads[course.pads.length - 1].index}]`,
        `pos ${frame.position.x.toFixed(2)} ${frame.position.y.toFixed(2)} ${frame.position.z.toFixed(2)}`,
        `speed ${frame.speed.toFixed(2)}`,
        `pad ${frame.pad?.id ?? "-"} ${frame.pad?.kind ?? ""}`,
        `squish ${(frame.pad?.target.influence ?? 0).toFixed(2)}`,
        `impact ${frame.impact.toFixed(2)}`,
        `audio ${audio.unlocked ? "on" : "locked"}`,
        `quality ${look.quality}`,
      ].join("\n");
    }

    coinPop.tick(dt, frame.position);
    scene.render();
  });

  // Let the first frame's shaders/textures settle, but never hold the screen hostage.
  await new Promise((resolve) => {
    scene.executeWhenReady(resolve);
    setTimeout(resolve, 3000);
  });
  await hideBoot();

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
  }
}

function bindStartMenu(best, onDifficulty, onBackground, syncMenuMusic) {
  const menu = document.querySelector("#start-menu");
  const playButton = document.querySelector("#start-play");
  const avatarButton = document.querySelector("#start-avatar");
  const nameInput = document.querySelector("#player-name");
  const difficultyButtons = [...menu.querySelectorAll("[data-difficulty]")];
  const backgroundButtons = [...menu.querySelectorAll("[data-background]")];
  const preferences = loadPlayerPreferences();

  nameInput.value = preferences.name;
  document.querySelector("#menu-best").textContent = String(best);
  document.querySelector("#menu-stars").textContent = String(starsLeft(best, wallet));

  const selectDifficulty = (difficulty) => {
    preferences.difficulty = difficulty;
    onDifficulty(difficulty);
    difficultyButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === difficulty));
    });
    savePlayerPreferences(preferences);
  };

  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => selectDifficulty(button.dataset.difficulty));
  });
  selectDifficulty(preferences.difficulty);

  const selectBackground = (background) => {
    preferences.background = background;
    onBackground(background);
    backgroundButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.background === background));
    });
    savePlayerPreferences(preferences);
  };
  backgroundButtons.forEach((button) => {
    button.addEventListener("click", () => selectBackground(button.dataset.background));
  });
  selectBackground(preferences.background);

  nameInput.addEventListener("input", () => {
    preferences.name = nameInput.value.trimStart();
    savePlayerPreferences(preferences);
  });

  avatarButton.addEventListener("click", () => {
    document.querySelector("#settings-open").click();
  });

  playButton.addEventListener("click", () => {
    preferences.name = nameInput.value.trim() || "Player";
    nameInput.value = preferences.name;
    savePlayerPreferences(preferences);
    ui.startOpen = false;
    menu.hidden = true;
    document.querySelector("#shop").hidden = true;
    document.body.classList.remove("start-open");
    document.querySelector("#view").focus();
    syncMenuMusic();
  });

  window.__obbyPreferences = preferences;
}

function loadPlayerPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "{}");
    return {
      name: typeof stored.name === "string" ? stored.name.slice(0, 18) : "",
      difficulty: ["easy", "medium", "hard"].includes(stored.difficulty) ? stored.difficulty : "easy",
      background: stored.background === "lava" || stored.background === "newyork" ? stored.background : "hollywood",
    };
  } catch {
    return { name: "", difficulty: "easy", background: "hollywood" };
  }
}

function savePlayerPreferences(preferences) {
  try {
    localStorage.setItem(PLAYER_KEY, JSON.stringify(preferences));
  } catch {
    // Private mode: player preferences just won't persist.
  }
}

/** A platform you can be dropped back onto: no spring launch and nothing spinning or orbiting on it. */
function isSafe(pad) {
  if (pad.stair) return false;
  return pad.kind !== "spring" && !pad.hazards.some((hazard) => hazard.kind !== "fireball");
}

function loadBest() {
  try {
    return Math.max(1, Number.parseInt(localStorage.getItem(BEST_KEY) ?? "1", 10) || 1);
  } catch {
    return 1;
  }
}

function saveBest(level) {
  try {
    localStorage.setItem(BEST_KEY, String(level));
  } catch {
    // Private mode: the best level just won't persist.
  }
}

function bindSettings(preview, graphics, avatar, syncMenuMusic) {
  const openButton = document.querySelector("#settings-open");
  const closeButton = document.querySelector("#settings-close");
  const menuButton = document.querySelector("#settings-menu");
  const backdrop = document.querySelector("#settings-backdrop");
  const hairInput = document.querySelector("#hair-color");
  const hairBox = document.querySelector("#hair-swatches");
  const skinBox = document.querySelector("#skin-swatches");
  const presetBox = document.querySelector("#presets");
  const bodyBox = document.querySelector("#bodies");
  const ageBox = document.querySelector("#ages");
  const hairStyleBox = document.querySelector("#hair-styles");
  const danceBox = document.querySelector("#dances");
  const faceBox = document.querySelector("#faces");
  const outfitBox = document.querySelector("#outfits");
  const bowButton = document.querySelector("#bow");
  const qualityBox = document.querySelector("#quality");

  const makeButton = (className, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.addEventListener("click", () => {
      onClick();
      publish();
    });
    return button;
  };

  const canUse = (kind, id) => isOwned(wallet, itemKey(kind, id));
  const lockTitle = (kind, id) => {
    const key = itemKey(kind, id);
    return canUse(kind, id) ? "" : `${t("shop.locked")} · ${priceOf(key)} ⭐`;
  };

  for (const preset of PRESETS) {
    const button = makeButton("chip", () => {
      if (canUse("face", preset.face)) look.face = preset.face;
      if (preset.hairColor !== "rainbow" || canUse("extra", "rainbow")) look.hairColor = preset.hairColor;
      if (canUse("outfit", preset.outfit)) look.outfit = preset.outfit;
      look.skinColor = preset.skinColor;
      look.bow = preset.bow ? canUse("extra", "bow") || look.bow : false;
      if (preset.body) {
        look.body = preset.body;
        const hair = preset.hair ?? defaultHair(preset.body);
        look.hair = canUse("hair", hair) ? hair : defaultHair(preset.body);
      }
    });
    button.textContent = preset.name;
    presetBox.append(button);
  }

  const choiceRow = (box, options, key, onPick, kind) => {
    for (const option of options) {
      const button = makeButton("", () => {
        if (kind && !canUse(kind, option.id)) return;
        look[key] = option.id;
        onPick?.(option.id);
      });
      button.dataset.value = option.id;
      button.textContent = option.label;
      box.append(button);
    }
  };
  choiceRow(bodyBox, BODIES, "body", (id) => {
    look.hair = defaultHair(id);
  });
  choiceRow(ageBox, AGES, "age");
  choiceRow(hairStyleBox, HAIR_STYLES, "hair", null, "hair");
  choiceRow(danceBox, DANCES, "dance", (id) => preview.avatar.dance(id, true), "dance");

  for (const face of FACES) {
    const button = makeButton("tile", () => {
      if (!canUse("face", face.id)) return;
      look.face = face.id;
    });
    button.dataset.face = face.id;
    const icon = document.createElement("canvas");
    icon.width = 112;
    icon.height = 92;
    icon.setAttribute("aria-hidden", "true");
    button.append(icon, document.createTextNode(face.label));
    faceBox.append(button);
  }

  for (const color of [...HAIR_SWATCHES, "rainbow"]) {
    const button = makeButton(color === "rainbow" ? "swatch rainbow" : "swatch", () => {
      if (color === "rainbow" && !canUse("extra", "rainbow")) return;
      look.hairColor = color;
    });
    if (color !== "rainbow") button.style.background = color;
    button.dataset.color = color;
    button.setAttribute("aria-label", color === "rainbow" ? "Rainbow hair" : `Hair color ${color}`);
    hairBox.append(button);
  }
  hairInput.addEventListener("input", () => {
    look.hairColor = hairInput.value.toLowerCase();
    publish();
  });

  for (const outfit of OUTFITS) {
    const button = makeButton("tile", () => {
      if (!canUse("outfit", outfit.id)) return;
      look.outfit = outfit.id;
    });
    button.dataset.outfit = outfit.id;
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.setAttribute("aria-hidden", "true");
    for (const color of outfit.swatch) {
      const dot = document.createElement("span");
      dot.style.background = color;
      dots.append(dot);
    }
    button.append(dots, document.createTextNode(outfit.label));
    outfitBox.append(button);
  }

  for (const color of SKIN_SWATCHES) {
    const button = makeButton("swatch", () => {
      look.skinColor = color;
    });
    button.style.background = color;
    button.dataset.color = color;
    button.setAttribute("aria-label", `Skin tone ${color}`);
    skinBox.append(button);
  }
  bowButton.addEventListener("click", () => {
    if (!canUse("extra", "bow")) return;
    look.bow = !look.bow;
    publish();
  });
  qualityBox.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    look.quality = button.dataset.quality;
    publish();
  });

  const setOpen = (open) => {
    ui.settingsOpen = open;
    settingsEl.hidden = !open;
    if (open) {
      preview.avatar.dance(look.dance, true);
      preview.start();
      closeButton.focus();
    } else {
      preview.stop();
      (ui.startOpen ? document.querySelector("#start-avatar") : openButton).focus();
    }
    syncMenuMusic();
  };
  openButton.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  menuButton.addEventListener("click", () => {
    ui.startOpen = true;
    document.querySelector("#start-menu").hidden = false;
    document.body.classList.add("start-open");
    setOpen(false);
    document.querySelector("#start-play").focus();
  });
  backdrop.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && ui.settingsOpen) setOpen(false);
  });
  publish();

  function publish() {
    saveLook(look);
    preview.avatar.apply(look);
    avatar.apply(look);
    graphics.apply(look.quality);
    if (look.hairColor !== "rainbow") hairInput.value = look.hairColor;
    hairBox.querySelectorAll(".swatch").forEach((button) => {
      const locked = button.dataset.color === "rainbow" && !canUse("extra", "rainbow");
      button.disabled = locked;
      button.title = locked ? lockTitle("extra", "rainbow") : "";
      button.setAttribute("aria-pressed", String(button.dataset.color === look.hairColor));
    });
    skinBox.querySelectorAll(".swatch").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.color === look.skinColor));
    });
    faceBox.querySelectorAll(".tile").forEach((button) => {
      button.disabled = !canUse("face", button.dataset.face);
      button.title = lockTitle("face", button.dataset.face);
      button.setAttribute("aria-pressed", String(button.dataset.face === look.face));
      const icon = button.querySelector("canvas");
      const ctx = icon.getContext("2d");
      ctx.clearRect(0, 0, icon.width, icon.height);
      ctx.fillStyle = look.skinColor;
      ctx.fillRect(0, 0, icon.width, icon.height);
      drawFace(ctx, button.dataset.face, icon.width, icon.height);
    });
    outfitBox.querySelectorAll(".tile").forEach((button) => {
      button.disabled = !canUse("outfit", button.dataset.outfit);
      button.title = lockTitle("outfit", button.dataset.outfit);
      button.setAttribute("aria-pressed", String(button.dataset.outfit === look.outfit));
    });
    for (const [box, value, kind] of [
      [bodyBox, look.body, null],
      [ageBox, look.age, null],
      [hairStyleBox, look.hair, "hair"],
      [danceBox, look.dance, "dance"],
    ]) {
      box.querySelectorAll("button").forEach((button) => {
        const locked = kind ? !canUse(kind, button.dataset.value) : false;
        button.disabled = locked;
        button.title = locked ? lockTitle(kind, button.dataset.value) : "";
        button.setAttribute("aria-pressed", String(button.dataset.value === value));
      });
    }
    const bowOwned = canUse("extra", "bow");
    bowButton.disabled = !bowOwned;
    bowButton.title = bowOwned ? "" : lockTitle("extra", "bow");
    bowButton.setAttribute("aria-pressed", String(look.bow));
    bowButton.textContent = bowOwned ? (look.bow ? "Bow on" : "Bow off") : `${t("shop.bow")} · ${priceOf("extra:bow")} ⭐`;
    document.querySelectorAll("#quality button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.quality === look.quality));
    });
    qualityNote.textContent =
      look.quality === "high"
        ? "Bloom, glow, film grain, a vignette, and sharper shadows."
        : "No bloom, glow, grain, or vignette, and softer shadows. Use this if the game runs slowly.";
  }

  publishLook = publish;
}

function bindShop(best, onOwned) {
  const openButton = document.querySelector("#rewards-open");
  const shop = document.querySelector("#shop");
  const list = document.querySelector("#shop-list");
  const starsEl = document.querySelector("#shop-stars");
  const menuStars = document.querySelector("#menu-stars");
  const closeButton = document.querySelector("#shop-close");
  const backdrop = document.querySelector("#shop-backdrop");
  const status = document.querySelector("#shop-status");
  openButton.title = t("shop.open");
  backdrop.setAttribute("aria-label", t("shop.close"));

  for (const group of SHOP_GROUPS) {
    const heading = document.createElement("p");
    heading.className = "label";
    heading.textContent = t(group.titleKey);
    const grid = document.createElement("div");
    grid.className = "shop-grid";
    for (const item of group.items) {
      const card = document.createElement("article");
      card.className = "shop-item";
      const name = document.createElement("strong");
      name.textContent = item.label;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.item = item.key;
      button.dataset.label = item.label;
      button.addEventListener("click", () => {
        const result = tryBuy(wallet, item.key, best);
        if (!result.ok) {
          paint(t("shop.broke"));
          return;
        }
        equipReward(result.item);
        paint(t("shop.unlocked"));
        onOwned();
      });
      card.append(shopMark(item), name, button);
      grid.append(card);
    }
    list.append(heading, grid);
  }

  const paint = (message) => {
    const left = starsLeft(best, wallet);
    menuStars.textContent = String(left);
    starsEl.textContent = String(left);
    status.textContent = message ?? t("shop.note");
    list.querySelectorAll("[data-item]").forEach((button) => {
      const key = button.dataset.item;
      const owned = isOwned(wallet, key);
      const cost = priceOf(key);
      const short = !owned && left < cost;
      button.disabled = owned;
      button.classList.toggle("is-short", short);
      button.textContent = owned ? t("shop.owned") : `${t("shop.buy")} · ${cost} ⭐`;
      const label = button.dataset.label;
      button.setAttribute("aria-label", owned ? `${label}, ${t("shop.owned")}` : `${label}, ${t("shop.buy")} ${cost}`);
      button.closest(".shop-item")?.classList.toggle("is-owned", owned);
    });
  };

  const setOpen = (open) => {
    shop.hidden = !open;
    if (open) {
      paint();
      closeButton.focus();
    } else {
      openButton.focus();
    }
  };

  openButton.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && !shop.hidden) setOpen(false);
  });
  paint();

  function equipReward(item) {
    if (item.kind === "avatar") Object.assign(look, item.look);
    else if (item.kind === "outfit") look.outfit = item.id;
    else if (item.kind === "face") look.face = item.id;
    else if (item.kind === "dance") look.dance = item.id;
    else if (item.kind === "hair") look.hair = item.id;
    else if (item.key === "extra:bow") look.bow = true;
    else if (item.key === "extra:rainbow") look.hairColor = "rainbow";
  }

  function shopMark(item) {
    if (item.swatch) {
      const dots = document.createElement("span");
      dots.className = "dots";
      dots.setAttribute("aria-hidden", "true");
      for (const color of item.swatch) {
        const dot = document.createElement("span");
        dot.style.background = color;
        dots.append(dot);
      }
      return dots;
    }
    if (item.kind === "face") {
      const icon = document.createElement("canvas");
      icon.width = 112;
      icon.height = 92;
      icon.className = "shop-face";
      icon.setAttribute("aria-hidden", "true");
      const ctx = icon.getContext("2d");
      ctx.fillStyle = look.skinColor;
      ctx.fillRect(0, 0, icon.width, icon.height);
      drawFace(ctx, item.id, icon.width, icon.height);
      return icon;
    }
    const mark = document.createElement("span");
    mark.setAttribute("aria-hidden", "true");
    if (item.key === "extra:rainbow") {
      mark.className = "swatch rainbow shop-swatch";
      return mark;
    }
    mark.className = "shop-emoji";
    mark.textContent = item.key === "extra:bow" ? "🎀" : item.kind === "dance" ? "♪" : "✨";
    return mark;
  }
}

function bindTouch(player) {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (coarse) document.body.classList.add("show-touch");
  window.addEventListener("touchstart", () => document.body.classList.add("show-touch"), { passive: true });

  const stick = document.querySelector("#stick");
  const knob = document.querySelector("#stick-knob");
  const jump = document.querySelector("#jump");
  let pointerId = null;

  const move = (event) => {
    const rect = stick.getBoundingClientRect();
    const max = rect.width * 0.36;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(max, length);
    dx = (dx / length) * clamped;
    dy = (dy / length) * clamped;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (!ui.settingsOpen) player.setStick(dx / max, dy / max);
  };
  const end = (event) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    knob.style.transform = "translate(0, 0)";
    player.setStick(0, 0);
  };
  stick.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    move(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (pointerId === event.pointerId) move(event);
  });
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);

  jump.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!ui.settingsOpen) player.requestJump();
  });
}

function createGraphics(scene, camera, world) {
  const hemi = new HemisphericLight("hemi", new Vector3(0.15, 1, 0.2), scene);
  hemi.intensity = 0.6;
  hemi.diffuse = new Color3(1, 0.95, 0.92);
  // The lava below bounces warm light up into the undersides.
  hemi.groundColor = new Color3(0.85, 0.36, 0.2);

  const sun = new DirectionalLight("sun", new Vector3(-0.35, -1, 0.2), scene);
  sun.position.set(8, 18, -6);
  sun.intensity = 1.35;
  sun.diffuse = new Color3(1, 0.94, 0.86);
  sun.shadowMinZ = 0.2;
  sun.shadowMaxZ = 60;
  sun.orthoLeft = -16;
  sun.orthoRight = 16;
  sun.orthoTop = 16;
  sun.orthoBottom = -16;
  sun.autoCalcShadowZBounds = true;

  const shadow = new ShadowGenerator(1024, sun);
  shadow.usePercentageCloserFiltering = true;
  shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadow.darkness = 0.3;
  shadow.bias = 0.012;
  shadow.normalBias = 0.025;

  const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.36;
  pipeline.bloomThreshold = 0.74;
  pipeline.bloomScale = 0.6;
  pipeline.bloomKernel = 64;
  pipeline.sharpenEnabled = true;
  pipeline.depthOfFieldEnabled = false;
  pipeline.imageProcessingEnabled = true;
  const imaging = pipeline.imageProcessing;
  imaging.exposure = 1.04;
  imaging.contrast = 1.08;
  imaging.vignetteEnabled = true;
  imaging.vignetteWeight = 0.85;
  imaging.vignetteStretch = 0;
  imaging.vignetteColor = new Color4(0.16, 0.03, 0.07, 0);
  imaging.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  pipeline.grainEnabled = true;
  pipeline.grain.animated = true;
  pipeline.grain.intensity = 9;

  const casters = (pad) => [pad.mesh, ...pad.hazards.flatMap((hazard) => hazard.meshes)];
  const sunWarm = sun.diffuse.clone();
  const sunCloud = new Color3(0.93, 0.96, 1);
  const vignetteWarm = imaging.vignetteColor.clone();
  const vignetteCloud = new Color4(0.5, 0.68, 0.88, 0);
  const vignetteHold = new Color4();

  return {
    sun,
    shadow,
    pipeline,
    addPad(pad) {
      for (const mesh of casters(pad)) shadow.addShadowCaster(mesh, true);
    },
    removePad(pad) {
      for (const mesh of casters(pad)) shadow.removeShadowCaster(mesh, true);
    },
    addStair(flight) {
      for (const mesh of flight.meshes) shadow.addShadowCaster(mesh, true);
    },
    removeStair(flight) {
      for (const mesh of flight.meshes) shadow.removeShadowCaster(mesh, true);
    },
    update(time, cover = 0) {
      // Bloom breathes a little with the lava, then settles brighter in the clouds.
      if (pipeline.bloomEnabled) {
        pipeline.bloomWeight = 0.34 + Math.sin(time * 1.3) * 0.04 * (1 - cover * 0.5) + cover * 0.05;
      }
      Color3.LerpToRef(sunWarm, sunCloud, cover, sun.diffuse);
      sun.intensity = 1.35 - cover * 0.08;
      Color4.LerpToRef(vignetteWarm, vignetteCloud, cover, vignetteHold);
      imaging.vignetteColor.copyFrom(vignetteHold);
      imaging.vignetteWeight = 0.85 - cover * 0.28;
      shadow.darkness = 0.3 - cover * 0.08;
    },
    apply(quality) {
      const high = quality !== "low";
      pipeline.bloomEnabled = high;
      pipeline.glowLayerEnabled = high;
      pipeline.sharpenEnabled = high;
      pipeline.grainEnabled = high;
      imaging.vignetteEnabled = high;
      pipeline.fxaaEnabled = true;
      shadow.mapSize = high ? 2048 : 1024;
      shadow.filteringQuality = high ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
      if (high && pipeline.glowLayer) {
        pipeline.glowLayer.intensity = 0.5;
        for (const mesh of world.glowExcluded) pipeline.glowLayer.addExcludedMesh(mesh);
      }
      if (pipeline.sharpen) pipeline.sharpen.edgeAmount = high ? 0.18 : 0;
    },
  };
}

async function createEngine(canvas) {
  const options = {
    adaptToDeviceRatio: false,
    antialias: true,
    stencil: true,
    powerPreference: "high-performance",
  };
  try {
    const supported = await withTimeout(WebGPUEngine.IsSupportedAsync, 1500);
    if (supported) {
      const gpu = new WebGPUEngine(canvas, options);
      await withTimeout(gpu.initAsync(), 2000);
      gpu.enableOfflineSupport = false;
      return gpu;
    }
  } catch (error) {
    console.warn("WebGPU unavailable, using WebGL2", error);
  }
  const gl = new Engine(canvas, true, options);
  gl.enableOfflineSupport = false;
  return gl;
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("WebGPU probe timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fit(engine) {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  engine.setHardwareScalingLevel(1 / ratio);
  engine.resize();
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  const hundredths = rest.toFixed(2).padStart(5, "0");
  return minutes > 0 ? `${minutes}:${hundredths}` : hundredths;
}

function hintCopy() {
  const coarse = window.matchMedia("(pointer: coarse)").matches || document.body.classList.contains("show-touch");
  return coarse ? t("hint.touch") : t("hint.keys");
}
