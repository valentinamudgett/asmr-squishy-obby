import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  FreeCamera,
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
import { createBots } from "./bot.js";
import { awardLevelCoin, createCoinPop, earnCoins, loadCoins } from "./coins.js";
import { buildAvatar, createPreview } from "./avatar.js";
import { COSTUMES, costumeById } from "./costumes.js";
import { createCourse, LAVA_Y, PADS_PER_LEVEL } from "./course.js";
import { BOSS_LEVEL, createEscape, KILLER_LEVEL } from "./escape.js";
import { drawFace, FACES } from "./faces.js";
import { BUBBLE_LIFT, createBubble, createNameTag } from "./figure.js";
import { DANCES } from "./dances.js";
import { createGuideArrow } from "./guide.js";
import { createHalloween } from "./halloween.js";
import { createThanksgiving } from "./thanksgiving.js";
import { createChristmas } from "./christmas.js";
import { createValentines } from "./valentines.js";
import { applyTranslations, t } from "./i18n.js";
import {
  AGES,
  BODIES,
  defaultHair,
  HAIR_STYLES,
  HAIR_SWATCHES,
  HELD_FOODS,
  loadLook,
  PRESETS,
  saveLook,
  SKIN_SWATCHES,
} from "./look.js";
import { courseClock, courseDay, courseSeed, createOnline } from "./online.js";
import { OUTFITS, PRISONER_OUTFIT } from "./outfits.js";
import { SONGS } from "./songs.js";
import { smoothstep } from "./geometry.js";
import { createPlayer, FOOT_OFFSET, STAIR_RUN } from "./player.js";
import { createPrison, FREEDOM_LEVEL, isPrisonLevel, PRISON_LEVEL } from "./prison.js";
import { hairColorKey, isOwned, itemKey, loadWallet, priceOf, SHOP_GROUPS, tryBuy } from "./rewards.js";
import { bindSocial } from "./social.js";
import { createWorld } from "./world.js";
import "@fontsource/dancing-script/600.css";
import "@fontsource/dancing-script/700.css";
import "./style.css";

const canvas = document.querySelector("#view");
const boot = document.querySelector("#boot");
const bootStatus = document.querySelector("#boot-status");
const bootBar = document.querySelector("#boot-bar");
const bootFill = document.querySelector("#boot-fill");
const levelEl = document.querySelector("#level");
const escapeStat = document.querySelector("#escape-stat");
const escapeCount = document.querySelector("#escape-count");
const coinsEl = document.querySelector("#coins");
const menuCoinsEl = document.querySelector("#menu-coins");
const shopCoinsEl = document.querySelector("#shop-coins");
const coins = loadCoins();
const hintEl = document.querySelector("#hint");
const toastEl = document.querySelector("#toast");
const fadeEl = document.querySelector("#fade");
const bossHud = document.querySelector("#boss-hud");
const livesEl = document.querySelector("#lives");
const bossFill = document.querySelector("#boss-fill");
const debugEl = document.querySelector("#debug");
const settingsEl = document.querySelector("#settings");
const qualityNote = document.querySelector("#quality-note");
const showDebug = new URLSearchParams(location.search).has("debug");
const BEST_KEY = "asmr-squishy-obby:best";
const PLAYER_KEY = "asmr-squishy-obby:player";
const NY_AIM_RAISE = 0.5;
/** How long a fall off the course lasts, from leaving the ground, before you are put back on your last safe pad. */
const FALL_SECONDS = 2.5;
const MIN_PLUNGE_SECONDS = 0.5;
/** Paid once, the first time you break out of Capybara Prison. */
const ESCAPE_COINS = 25;
/** How long the screen goes dark between touching the level-100 checkpoint and waking up in the cell. */
const LOCK_SECONDS = 0.55;
/**
 * Each holiday game style shows only in its own month, by the player's own clock: Valentine's Day
 * in February, Halloween in October, Thanksgiving in November, Christmas in December.
 * `?debug&month=2` previews another month.
 */
const DEBUG_MONTH = showDebug ? Number.parseInt(new URLSearchParams(location.search).get("month"), 10) : NaN;
const MONTH = DEBUG_MONTH >= 1 && DEBUG_MONTH <= 12 ? DEBUG_MONTH - 1 : new Date().getMonth();
const SEASONAL_THEMES = { valentines: MONTH === 1, halloween: MONTH === 9, thanksgiving: MONTH === 10, christmas: MONTH === 11 };

const look = loadLook();
const wallet = loadWallet(look, coins, loadBest());
showCoins();
let publishLook = () => {};
const ui = {
  settingsOpen: false,
  startOpen: true,
};

applyTranslations();
document.body.classList.add("start-open");
// Before boot, so the title screen already wears the saved game style.
wearTheme(loadPlayerPreferences().theme);
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
  // The holiday game styles by theme name, filled in once graphics exist.
  const seasons = {};
  let prison = null;
  let best = loadBest();
  const day = courseDay();
  const course = createCourse(scene, {
    onAdd(pad) {
      audio.attachPad(pad).catch((error) => console.warn("Pad sound failed", error));
      graphics?.addPad(pad);
      for (const season of Object.values(seasons)) season.addPad(pad);
      prison?.addPad(pad);
    },
    onRemove(pad) {
      audio.detachPad(pad);
      graphics?.removePad(pad);
      for (const season of Object.values(seasons)) season.removePad(pad);
      prison?.removePad(pad);
      if (pad.flight) graphics?.removeStair(pad.flight);
    },
    onStair(flight) {
      graphics?.addStair(flight);
    },
    onHazards(pad) {
      graphics?.addHazards(pad);
    },
  }, isPrisonLevel(best) ? PRISON_LEVEL : best, courseSeed(day));

  const avatar = buildAvatar(scene);
  avatar.apply(look);
  bootProgress.set(0.85);

  const spawn = course.standOn(course.start, FOOT_OFFSET);
  let checkpointPad = course.start;
  let escape = null;
  const player = createPlayer(scene, spawn, {
    findPad: (foot) => course.findPad(foot) ?? escape?.findPad(foot) ?? null,
    onLand: (pad, impact) => {
      const amount = pad.kind === "spring" ? 0.95 : Math.min(0.9, 0.4 + impact / 14);
      pad.kick(amount);
      audio.crunch(pad, impact);
      avatar.nudge(impact);
    },
    onJump: (pad) => {
      pad.kick(pad.kind === "spring" ? 0.38 : 0.22);
    },
    onFly: (on) => {
      if (!on) return;
      showToast(t("toast.angelFlight"));
      toastTimer = 1.6;
      nextToast = null;
    },
  }, course.start.heading ?? 0);
  player.setAngelFlight(look.costume === "angel");
  audio.attachListener(player.camera);
  graphics = createGraphics(scene, player.camera, world);
  for (const mesh of avatar.parts) graphics.shadow.addShadowCaster(mesh, true);
  for (const pad of course.pads) graphics.addPad(pad);
  for (const flight of course.flights) graphics.addStair(flight);
  graphics.apply(look.quality);
  const seasonContext = { world, graphics, pads: () => course.pads };
  seasons.halloween = createHalloween(scene, seasonContext);
  seasons.thanksgiving = createThanksgiving(scene, seasonContext);
  seasons.christmas = createChristmas(scene, seasonContext);
  seasons.valentines = createValentines(scene, seasonContext);
  prison = createPrison(scene);
  for (const pad of course.pads) prison.addPad(pad);
  escape = createEscape(scene, { graphics, audio, avatar });
  // In the prison you wear stripes. Only the avatar wears them: the saved look and the one other players see stay yours.
  let prisoner = false;
  const wearPrisoner = (on) => {
    prisoner = on;
    avatar.apply(on ? { ...look, outfit: PRISONER_OUTFIT.id, costume: "none" } : look);
  };

  // Filled in once the HUD is bound; the room only calls back after boot has finished.
  let social = null;
  let hereIndex = course.start.index;
  const notify = (text) => {
    showToast(text);
    toastTimer = 2.6;
    nextToast = null;
  };
  const bots = createBots(scene, {
    graphics,
    course,
    onChat: (line) => social?.addLine(line),
    onRoster: () => social?.refresh(),
  });
  const online = createOnline(scene, {
    day,
    graphics,
    isNear: (index) => {
      const pads = course.pads;
      return pads.length > 0 && index >= pads[0].index - 2 && index <= pads[pads.length - 1].index + 2;
    },
    onCount: (count, connected) => {
      bots.setEnabled(connected);
      showOnline(connected ? count + bots.count : count, connected);
      social?.refresh();
    },
    onRoster: () => social?.refresh(),
    onChat: (line) => social?.addLine(line),
    onFriended: (name) => notify(t("friends.addedYou").replace("{name}", name)),
  });
  const selfBubble = createBubble(scene, graphics);
  const selfTag = createNameTag(scene, graphics);

  const preview = createPreview(document.querySelector("#preview"));
  preview.avatar.apply(look);
  bootProgress.set(0.92);
  const syncMenuMusic = () => audio.setMenuMusic(ui.startOpen || ui.settingsOpen);
  bindSettings(
    preview,
    graphics,
    avatar,
    syncMenuMusic,
    (song) => audio.setCourseSong(song),
    () => {
      online.setProfile(window.__obbyPreferences?.name ?? "", look);
      player.setAngelFlight(look.costume === "angel");
      if (prisoner) wearPrisoner(true);
    },
  );
  let aimRaise = 0;
  bindStartMenu(
    (difficulty) => {
      course.setDifficulty(difficulty);
      escape.setDifficulty(difficulty);
    },
    (background) => {
      world.setBackdrop(background);
      for (const season of Object.values(seasons)) season.setBackdrop(background);
      // The night skyline stands on the horizon, so tip the view up enough to see it.
      aimRaise = background === "newyork" ? NY_AIM_RAISE : 0;
    },
    syncMenuMusic,
    online,
    (theme, background) => {
      const wasSeasonal = Object.values(seasons).some((season) => season.enabled);
      // Off before on, so the next style starts from the game's own colors.
      for (const [name, season] of Object.entries(seasons)) if (name !== theme) season.setEnabled(false);
      // Puts back the backdrop's own sea and sky colors after a holiday tint.
      if (wasSeasonal) world.setBackdrop(background);
      seasons[theme]?.setEnabled(true);
    },
  );
  bindTitleScreen();
  syncMenuMusic();
  bindShop(() => publishLook());
  bindTouch(player);
  const shooting = bindShoot();
  social = bindSocial({ online, bots, ui, notify, onSay: (text) => selfBubble.say(text) });

  let fallLock = 0;
  let toastTimer = 0;
  let nextToast = null;
  let lastSafePad = course.start;
  // Set while a long fall off the course plays out: seconds left and the height it started from.
  let plunge = null;
  let airTime = 0;
  const guide = createGuideArrow(scene);
  const pop = createLavaPop(scene, avatar);
  const coinPop = createCoinPop(scene, player.camera);
  let meltHome = null;
  const pointAhead = (from) => {
    const next = from.flight?.steps[0] ?? course.pads.find((pad) => pad.index > from.index);
    if (next) guide.show(from, next);
  };
  const sendHome = (home) => {
    course.restoreStairs();
    const spot = course.standOn(home, FOOT_OFFSET);
    avatar.stopDance();
    player.respawn(spot, home.heading ?? 0);
    pop.place({ x: spot.x, y: spot.y - FOOT_OFFSET, z: spot.z });
    pointAhead(home);
  };
  /** Counts down the dark screen before the cell. */
  let lockIn = 0;
  const showLevel = (level) => {
    levelEl.textContent = String(level);
    showEscape(level);
  };
  /** Puts you in Capybara Prison at checkpoint `at` (100, 110, or 115). `again` is a replay from the Character studio. */
  const enterEscape = (at, again = false) => {
    const gate = course.pads.find((pad) => pad.role === "checkpoint" && pad.level === PRISON_LEVEL) ?? checkpointPad;
    const spot = escape.enter(gate, at, { again });
    guide.hide();
    avatar.stopDance();
    endCloseUp();
    plunge = null;
    meltHome = null;
    lastSafePad = checkpointPad;
    player.respawn(spot.position, spot.heading);
    showLevel(at);
  };
  /**
   * Out through the prison gate onto the level-120 checkpoint, which then lets you out as usual.
   * After a replay you're already past it, so you go back to your own checkpoint instead.
   */
  const leaveEscape = () => {
    const again = escape.replay;
    escape.leave();
    endCloseUp();
    const exit = course.pads.find((pad) => pad.role === "checkpoint" && pad.level === FREEDOM_LEVEL);
    lastSafePad = checkpointPad;
    sendHome(checkpointPad.level >= FREEDOM_LEVEL || !exit ? checkpointPad : exit);
    showLevel(checkpointPad.level);
    if (again) {
      showToast(t("toast.escaped"));
      toastTimer = 2.4;
      nextToast = t("toast.backToObby");
    }
  };
  // The caught close-up looks through its own camera for a second, so the follow camera can't move
  // it. You're hidden meanwhile (your name tag follows the avatar), so nothing of yours blocks the face.
  const closeUpCamera = new FreeCamera("closeUpCamera", new Vector3(), scene);
  closeUpCamera.minZ = 0.05;
  closeUpCamera.fov = 0.7;
  let closeUp = false;
  function startCloseUp(eye, target) {
    closeUpCamera.position.copyFrom(eye);
    closeUpCamera.setTarget(target);
    scene.activeCamera = closeUpCamera;
    closeUp = true;
    avatar.root.setEnabled(false);
    selfTag.setShown(false);
    selfBubble.setShown(false);
    audio.setWalking(false);
  }
  function endCloseUp() {
    if (!closeUp) return;
    closeUp = false;
    scene.activeCamera = player.camera;
    avatar.root.setEnabled(true);
    selfBubble.setShown(true);
  }
  const replayButton = document.querySelector("#replay-prison");
  const showReplay = () => {
    replayButton.hidden = best < FREEDOM_LEVEL || escape.active;
  };
  document.querySelector("#settings-open").addEventListener("click", showReplay);
  replayButton.addEventListener("click", () => {
    document.querySelector("#settings-close").click();
    if (ui.startOpen) document.querySelector("#start-play").click();
    lockIn = 0;
    fadeEl.classList.remove("is-on");
    enterEscape(PRISON_LEVEL, true);
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyE" && !(event.target instanceof HTMLInputElement) && !ui.settingsOpen && !ui.startOpen) escape.openVent();
  });
  document.querySelector("#open-vent").addEventListener("pointerdown", (event) => {
    event.preventDefault();
    escape.openVent();
  });
  let ventShown = false;
  let hintTimer = 9;
  let clock = 0;
  let fightShown = "";
  showLevel(course.start.level);
  if (isPrisonLevel(best)) {
    const at = best >= BOSS_LEVEL ? BOSS_LEVEL : best >= KILLER_LEVEL ? KILLER_LEVEL : PRISON_LEVEL;
    enterEscape(at);
    if (at !== PRISON_LEVEL) {
      showToast(`Level ${at}`);
      toastTimer = 2.4;
    }
  }
  if (showDebug) window.__obby = { scene, course, player, world, audio, pop, coins, coinPop, online, bots, graphics, seasons, prison, escape, enterEscape };

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
    if (lockIn > 0) {
      lockIn -= dt;
      if (lockIn <= 0) {
        enterEscape(PRISON_LEVEL);
        fadeEl.classList.remove("is-on");
      }
    }
    const allowInput = !ui.settingsOpen && !ui.startOpen && !avatar.dancing && !pop.active && lockIn <= 0 && !closeUp;
    const frame = plunge ? player.plunge(dt) : player.update(dt, allowInput);
    const standing = frame.grounded ? frame.pad : null;
    airTime = frame.grounded ? 0 : airTime + dt;
    // In the prison the course keeps itself around the gate checkpoint.
    const inEscape = escape.active;
    // Moving pads and hazards run on the wall clock, so online players see them in step.
    course.update(courseClock(day), dt, {
      standing: inEscape ? null : standing,
      position: inEscape ? checkpointPad.mesh.position : frame.position,
      keepFrom: checkpointPad.index,
    });
    const here = frame.pad ?? lastSafePad;
    hereIndex = !inEscape && Number.isFinite(here.index) ? here.index : lastSafePad.index;
    const drop = plunge ? plunge.fromY - frame.position.y : 0;
    const cover = world.update(clock, dt, frame.position, hereIndex / PADS_PER_LEVEL + 1, drop);
    // High up the skyline is below you, so stop tipping the view toward the horizon.
    player.setAimRaise(aimRaise * (1 - smoothstep(8, 120, world.altitude)));
    graphics.update(clock, cover);
    if (inEscape) {
      // Indoors: the walls are close and pale, so ease off the sun and the bloom.
      graphics.sun.intensity *= 0.62;
      graphics.pipeline.bloomWeight *= 0.45;
    }
    for (const season of Object.values(seasons)) season.update(clock, dt, frame.position, player.camera, cover, world.space);
    prison.update(clock);
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
      flying: frame.flying,
      // Input, not speed: a moving pad or a landing slide carries the body without any steps.
      moving: frame.walking,
      stride: frame.onStair ? STAIR_RUN : 1,
      running: frame.onStair,
      time: clock,
    });
    online.sendPose(dt, {
      x: frame.foot.x,
      y: frame.foot.y,
      z: frame.foot.z,
      sink: standing ? standing.sink : 0,
      facing: frame.facing,
      airborne: frame.airborne,
      moving: frame.walking,
      running: frame.onStair,
      flying: frame.flying,
      trick: frame.trick,
      trickP: frame.trickP,
      index: hereIndex,
      away: ui.startOpen,
    });
    online.update(dt, player.camera, clock);
    bots.update(dt, player.camera, clock, hereIndex);
    const headTop = frame.foot.y - (standing ? standing.sink : 0) + avatar.height;
    selfTag.setName(online.name);
    selfTag.setShown(avatar.root.isEnabled());
    selfTag.update(frame.foot.x, headTop, frame.foot.z);
    selfBubble.update(dt, frame.foot.x, headTop + BUBBLE_LIFT, frame.foot.z);

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

    // The prison's own floors aren't pads; escape.js looks after falls and catches in there.
    const coursePad = inEscape ? null : frame.pad;
    if (frame.grounded && coursePad && coursePad.index < checkpointPad.index && !pop.active && fallLock <= 0) {
      fallLock = 0.6;
      lastSafePad = checkpointPad;
      sendHome(checkpointPad);
      showToast(t("toast.backToLevel"));
      toastTimer = 1.4;
      nextToast = t("toast.keepGoing");
    } else if (frame.grounded && coursePad && isSafe(coursePad)) {
      lastSafePad = coursePad;
    }
    if (frame.grounded && frame.pad && guide.pad && frame.pad !== guide.pad) guide.hide();

    if (plunge) {
      plunge.left -= dt;
      if (plunge.left <= 0) {
        plunge = null;
        fallLock = 0.6;
        sendHome(lastSafePad.removed ? checkpointPad : lastSafePad);
        showToast(t("toast.backToLevel"));
        toastTimer = 1.4;
        nextToast = t("toast.keepGoing");
      }
    } else if (!inEscape && !pop.active && fallLock <= 0) {
      const burned = frame.foot.y < world.seaY + 0.15 || course.lavaBurn(frame.position);
      // Up high the sea is far below, so dropping past the course floor counts as the fall.
      const dropped = !burned && course.lava.y > world.seaY + 0.5 && frame.foot.y < course.lava.y;
      const bonked = !burned && !dropped && course.hazardHit(frame.position);
      if (dropped) {
        plunge = { left: Math.max(MIN_PLUNGE_SECONDS, FALL_SECONDS - airTime), fromY: frame.position.y };
        guide.hide();
        avatar.stopDance();
        audio.scream();
        audio.setWalking(false);
        showToast(t("toast.falling"));
        toastTimer = 2.2;
        nextToast = null;
      } else if (burned || bonked) {
        const home = lastSafePad.removed ? checkpointPad : lastSafePad;
        if (burned && pop.begin()) {
          meltHome = home;
          avatar.stopDance();
          audio.scream();
          audio.setWalking(false);
          showToast(t("toast.tooHot"));
          toastTimer = 1.6;
          nextToast = t("toast.keepGoing");
        } else if (!burned) {
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

    if (frame.grounded && coursePad?.role === "checkpoint" && coursePad.index > checkpointPad.index) {
      checkpointPad = coursePad;
      const level = coursePad.level;
      const firstTime = level > best;
      showLevel(level);
      if (firstTime) {
        best = level;
        saveBest(best);
      }
      let earned = awardLevelCoin(coins, level);
      if (level !== PRISON_LEVEL) {
        avatar.dance(look.dance);
        online.dance(look.dance);
      }
      if (level === PRISON_LEVEL) {
        // The screen goes dark and you wake up in the cell (see enterEscape).
        lockIn = LOCK_SECONDS;
        fadeEl.classList.add("is-on");
        audio.setWalking(false);
      } else if (level === FREEDOM_LEVEL) {
        const lines = [t("toast.escaped")];
        if (firstTime) {
          earnCoins(coins, ESCAPE_COINS);
          earned = true;
          lines.push(t("toast.escapeBonus").replace("{n}", String(ESCAPE_COINS)));
        }
        lines.push(t("toast.backToObby"));
        pointAhead(coursePad);
        showToast(lines[0]);
        toastTimer = 2.4;
        nextToast = lines.slice(1).join(" ") || null;
      } else {
        showToast(`Level ${level}`);
        toastTimer = 1.6;
        nextToast = null;
      }
      if (earned) {
        showCoins();
        coinPop.burst(frame.position);
      }
    }

    if (escape.active !== prisoner) wearPrisoner(escape.active);
    const menus = ui.startOpen || ui.settingsOpen;
    if (shooting.take() && !menus) escape.shoot();
    const escapeEvents = escape.update(dt, clock, {
      foot: frame.foot,
      position: frame.position,
      pad: frame.pad,
      grounded: frame.grounded,
      facing: frame.facing,
      hold: menus || avatar.dancing || lockIn > 0,
    });
    for (const event of escapeEvents) {
      if (event.type === "toast") {
        showToast(event.text);
        toastTimer = event.time;
        nextToast = event.next;
      } else if (event.type === "closeUp") {
        startCloseUp(event.eye, event.target);
      } else if (event.type === "closeUpEnd") {
        endCloseUp();
      } else if (event.type === "respawn") {
        endCloseUp();
        avatar.stopDance();
        player.respawn(event.position, event.heading);
        pop.place({ x: event.position.x, y: event.position.y - FOOT_OFFSET, z: event.position.z });
      } else if (event.type === "checkpoint") {
        showLevel(event.level);
        if (event.level > best) {
          best = event.level;
          saveBest(best);
        }
        if (awardLevelCoin(coins, event.level)) {
          showCoins();
          coinPop.burst(frame.position);
        }
        avatar.dance(look.dance);
        online.dance(look.dance);
        showToast(`Level ${event.level}`);
        toastTimer = 1.6;
        nextToast = event.text;
      } else if (event.type === "free") {
        leaveEscape();
      }
    }
    const nearVent = escape.canOpen && !menus;
    if (nearVent !== ventShown) {
      ventShown = nearVent;
      document.body.classList.toggle("near-vent", nearVent);
    }
    const fight = escape.fight;
    const fightKey = fight ? `${fight.lives}/${fight.health}/${escape.armed}` : "";
    if (fightKey !== fightShown) {
      fightShown = fightKey;
      showFight(fight, escape.armed);
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

function bindStartMenu(onDifficulty, onBackground, syncMenuMusic, online, onTheme) {
  const menu = document.querySelector("#start-menu");
  const playButton = document.querySelector("#start-play");
  const avatarButton = document.querySelector("#start-avatar");
  const onlineButton = document.querySelector("#online-toggle");
  const nameInput = document.querySelector("#player-name");
  const themeButtons = [...menu.querySelectorAll("[data-theme]")];
  const difficultyButtons = [...menu.querySelectorAll("[data-difficulty]")];
  const backgroundButtons = [...menu.querySelectorAll("[data-background]")];
  const preferences = loadPlayerPreferences();

  nameInput.value = preferences.name;

  for (const button of themeButtons) button.hidden = !themeOpen(button.dataset.theme);
  // Outside the holiday months Normal is the only game, so there is nothing to choose.
  menu.querySelector(".theme-picker").hidden = themeButtons.every((button) => button.hidden || button.dataset.theme === "normal");

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

  const selectTheme = (theme) => {
    preferences.theme = theme;
    wearTheme(theme);
    onTheme(theme, preferences.background);
    themeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.theme === theme));
    });
    savePlayerPreferences(preferences);
  };
  themeButtons.forEach((button) => {
    button.addEventListener("click", () => selectTheme(button.dataset.theme));
  });
  selectTheme(preferences.theme);

  const selectOnline = (on) => {
    preferences.online = on;
    onlineButton.setAttribute("aria-pressed", String(on));
    document.querySelector("#online-state").textContent = t(on ? "online.on" : "online.off");
    online.setProfile(preferences.name, look);
    online.setEnabled(on);
    savePlayerPreferences(preferences);
  };
  onlineButton.addEventListener("click", () => selectOnline(!preferences.online));
  selectOnline(preferences.online);

  nameInput.addEventListener("input", () => {
    preferences.name = nameInput.value.trimStart();
    savePlayerPreferences(preferences);
  });
  nameInput.addEventListener("change", () => online.setProfile(nameInput.value.trim(), look));

  avatarButton.addEventListener("click", () => {
    document.querySelector("#settings-open").click();
  });

  playButton.addEventListener("click", () => {
    preferences.name = nameInput.value.trim() || "Player";
    nameInput.value = preferences.name;
    savePlayerPreferences(preferences);
    online.setProfile(preferences.name, look);
    ui.startOpen = false;
    menu.hidden = true;
    document.querySelector("#shop").hidden = true;
    document.body.classList.remove("start-open");
    document.querySelector("#view").focus();
    syncMenuMusic();
  });

  window.__obbyPreferences = preferences;
}

/**
 * The title screen sits over the main menu until the first tap or key press. Your friends box
 * starts on it and moves into the main menu once you go in.
 */
function bindTitleScreen() {
  const screen = document.querySelector("#title-screen");
  const startButton = document.querySelector("#title-start");
  const menu = document.querySelector("#start-menu");
  const friendsBox = document.querySelector("#friends-box");
  const players = document.querySelector("#players");
  menu.inert = true;
  document.body.classList.add("title-open");

  const enter = () => {
    if (screen.hidden || screen.classList.contains("is-leaving")) return;
    window.removeEventListener("keydown", onKey);
    screen.classList.add("is-leaving");
    setTimeout(() => {
      menu.querySelector(".start-actions").before(friendsBox);
      screen.hidden = true;
      document.body.classList.remove("title-open");
      menu.inert = false;
      screen.classList.remove("is-leaving");
      const nameInput = document.querySelector("#player-name");
      (nameInput.value ? document.querySelector("#start-play") : nameInput).focus();
    }, 350);
  };
  const onKey = (event) => {
    if (event.repeat || ["Tab", "Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
    if (!players.hidden || (event.target instanceof Element && event.target.closest("#friends-box"))) return;
    event.preventDefault();
    enter();
  };

  screen.addEventListener("click", (event) => {
    if (event.target.closest("#friends-box")) return;
    if (!players.hidden && !event.target.closest("#title-start")) {
      document.querySelector("#players-close").click();
      return;
    }
    enter();
  });
  window.addEventListener("keydown", onKey);
  startButton.focus();
}

function themeOpen(theme) {
  return theme === "normal" || SEASONAL_THEMES[theme] === true;
}

/** Menu and loading screens take the game style's colors from a class on the body. */
function wearTheme(theme) {
  for (const name of Object.keys(SEASONAL_THEMES)) document.body.classList.toggle(`theme-${name}`, theme === name);
}

function loadPlayerPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAYER_KEY) ?? "{}");
    return {
      name: typeof stored.name === "string" ? stored.name.slice(0, 18) : "",
      difficulty: ["easy", "medium", "hard"].includes(stored.difficulty) ? stored.difficulty : "easy",
      background: stored.background === "lava" || stored.background === "newyork" ? stored.background : "hollywood",
      online: stored.online !== false,
      theme: themeOpen(stored.theme) ? stored.theme : "normal",
    };
  } catch {
    return { name: "", difficulty: "easy", background: "hollywood", online: true, theme: "normal" };
  }
}

/** `count` includes you. Zero means online play is switched off. */
function showOnline(count, connected) {
  const stat = document.querySelector("#online-stat");
  const status = document.querySelector("#online-status");
  stat.hidden = !connected;
  document.querySelector("#online-count").textContent = String(count);
  const others = count - 1;
  if (!connected) status.textContent = t("online.solo");
  else if (others <= 0) status.textContent = t("online.waiting");
  else if (others === 1) status.textContent = t("online.one");
  else status.textContent = t("online.many").replace("{n}", String(others));
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

/** The HUD, the start menu, and the shop all show the same coin count. */
function showCoins() {
  const text = String(coins.coins);
  coinsEl.textContent = text;
  menuCoinsEl.textContent = text;
  shopCoinsEl.textContent = text;
}

/** While you are in Capybara Prison, the HUD counts the levels you've climbed toward freedom. */
function showEscape(level) {
  escapeStat.hidden = !isPrisonLevel(level);
  escapeCount.textContent = `${level - PRISON_LEVEL}/${FREEDOM_LEVEL - PRISON_LEVEL}`;
}

/** Your hearts and the warden's health bar while the boss fight is on. The touch blaster button shows while you hold the blaster. */
function showFight(fight, armed) {
  bossHud.hidden = !fight;
  document.body.classList.toggle("armed", armed);
  if (!fight) return;
  livesEl.textContent = "♥".repeat(fight.lives) + "♡".repeat(fight.maxLives - fight.lives);
  livesEl.setAttribute("aria-label", `${fight.lives}/${fight.maxLives}`);
  bossFill.style.width = `${(fight.health / fight.maxHealth) * 100}%`;
}

function coinCount(n) {
  return (n === 1 ? t("coin.one") : t("coin.many")).replace("{n}", String(n));
}

function coinGlyph() {
  const glyph = document.createElement("span");
  glyph.className = "coin-glyph";
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
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

function bindSettings(preview, graphics, avatar, syncMenuMusic, onSong, onLook) {
  const openButton = document.querySelector("#settings-open");
  const closeButton = document.querySelector("#settings-close");
  const menuButton = document.querySelector("#hud-menu");
  const backdrop = document.querySelector("#settings-backdrop");
  const hairInput = document.querySelector("#hair-color");
  const hairBox = document.querySelector("#hair-swatches");
  const skinBox = document.querySelector("#skin-swatches");
  const presetBox = document.querySelector("#presets");
  const bodyBox = document.querySelector("#bodies");
  const ageBox = document.querySelector("#ages");
  const hairStyleBox = document.querySelector("#hair-styles");
  const danceBox = document.querySelector("#dances");
  const songBox = document.querySelector("#songs");
  const faceBox = document.querySelector("#faces");
  const outfitBox = document.querySelector("#outfits");
  const costumeBox = document.querySelector("#costumes");
  const bowButton = document.querySelector("#bow");
  const heldBox = document.querySelector("#held");
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
    return canUse(kind, id) ? "" : `${t("shop.locked")} · ${coinCount(priceOf(key))}`;
  };
  const colorLocked = (color) => {
    const key = hairColorKey(color);
    return key !== null && !isOwned(wallet, key);
  };

  for (const preset of PRESETS) {
    const button = makeButton("chip", () => {
      if (canUse("face", preset.face)) look.face = preset.face;
      if (!colorLocked(preset.hairColor)) look.hairColor = preset.hairColor;
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
  choiceRow(heldBox, HELD_FOODS, "held");
  choiceRow(danceBox, DANCES, "dance", (id) => preview.avatar.dance(id, true), "dance");
  choiceRow(songBox, SONGS, "song", null, "song");
  choiceRow(
    costumeBox,
    COSTUMES.map((costume) => ({ id: costume.id, label: `${costume.icon} ${costume.label}` })),
    "costume",
    null,
    "costume",
  );

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
      if (colorLocked(color)) return;
      look.hairColor = color;
    });
    if (color !== "rainbow") button.style.background = color;
    button.dataset.color = color;
    button.setAttribute("aria-label", color === "rainbow" ? "Rainbow hair" : `Hair color ${color}`);
    hairBox.append(button);
  }
  hairInput.addEventListener("input", () => {
    if (!canUse("haircolor", "custom")) return;
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
    onSong(look.song);
    onLook();
    if (look.hairColor !== "rainbow") hairInput.value = look.hairColor;
    hairInput.disabled = !canUse("haircolor", "custom");
    hairInput.title = lockTitle("haircolor", "custom");
    hairBox.querySelectorAll(".swatch").forEach((button) => {
      const locked = colorLocked(button.dataset.color);
      button.disabled = locked;
      button.title = locked ? `${t("shop.locked")} · ${coinCount(priceOf(hairColorKey(button.dataset.color)))}` : "";
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
      [heldBox, look.held, null],
      [danceBox, look.dance, "dance"],
      [songBox, look.song, "song"],
      [costumeBox, look.costume, "costume"],
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
    bowButton.textContent = bowOwned ? (look.bow ? "Bow on" : "Bow off") : `${t("shop.bow")} · ${coinCount(priceOf("extra:bow"))}`;
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

function bindShop(onOwned) {
  const openButton = document.querySelector("#rewards-open");
  const shop = document.querySelector("#shop");
  const list = document.querySelector("#shop-list");
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
        const result = tryBuy(wallet, item.key, coins);
        if (!result.ok) {
          paint(t("shop.broke"));
          return;
        }
        equipReward(result.item);
        paint(t("shop.unlocked"));
        onOwned(result.item);
      });
      card.append(shopMark(item), name, button);
      grid.append(card);
    }
    list.append(heading);
    if (group.noteKey) {
      const note = document.createElement("p");
      note.className = "note";
      note.textContent = t(group.noteKey);
      list.append(note);
    }
    list.append(grid);
  }

  const paint = (message) => {
    showCoins();
    status.textContent = message ?? t("shop.note");
    list.querySelectorAll("[data-item]").forEach((button) => {
      const key = button.dataset.item;
      const owned = isOwned(wallet, key);
      const cost = priceOf(key);
      const short = !owned && coins.coins < cost;
      button.disabled = owned;
      button.classList.toggle("is-short", short);
      if (owned) button.textContent = t("shop.owned");
      else button.replaceChildren(`${t("shop.buy")} · ${cost}`, coinGlyph());
      const label = button.dataset.label;
      button.setAttribute(
        "aria-label",
        owned ? `${label}, ${t("shop.owned")}` : `${label}, ${t("shop.buy")} ${coinCount(cost)}`,
      );
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
    else if (item.kind === "song") look.song = item.id;
    else if (item.kind === "costume") look.costume = item.id;
    else if (item.key === "extra:bow") look.bow = true;
    else if (item.key === "extra:rainbow") look.hairColor = "rainbow";
    else if (item.color) look.hairColor = item.color;
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
    if (item.color) {
      mark.className = "swatch shop-swatch";
      mark.style.background = item.color;
      return mark;
    }
    mark.className = "shop-emoji";
    if (item.key === "extra:bow") mark.textContent = "🎀";
    else if (item.kind === "dance") mark.textContent = "♪";
    else if (item.kind === "song") mark.textContent = "🎵";
    else if (item.kind === "costume") mark.textContent = costumeById(item.id).icon;
    else mark.textContent = item.icon ?? "✨";
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

/**
 * The blaster fires while you hold F or the touch blaster button, and once for a quick click on the
 * game (a longer press or a drag turns the camera instead).
 */
function bindShoot() {
  const view = document.querySelector("#view");
  const button = document.querySelector("#shoot");
  let key = false;
  let pressed = false;
  let tap = false;
  let down = null;
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyF" && !(event.target instanceof HTMLInputElement)) key = true;
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyF") key = false;
  });
  window.addEventListener("blur", () => {
    key = false;
    pressed = false;
  });
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pressed = true;
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener("pointerup", () => {
    pressed = false;
  });
  button.addEventListener("pointercancel", () => {
    pressed = false;
  });
  view.addEventListener("pointerdown", (event) => {
    if (event.button === 0) down = { x: event.clientX, y: event.clientY, time: performance.now() };
  });
  view.addEventListener("pointerup", (event) => {
    if (down && performance.now() - down.time < 250 && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) tap = true;
    down = null;
  });
  return {
    /** True while the blaster should fire this frame. */
    take() {
      const wants = key || pressed || tap;
      tap = false;
      return wants;
    },
  };
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
    /** Disposed hazard meshes leave the shadow list on their own; only the new ones need adding. */
    addHazards(pad) {
      for (const hazard of pad.hazards) {
        for (const mesh of hazard.meshes) shadow.addShadowCaster(mesh, true);
      }
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

function hintCopy() {
  const coarse = window.matchMedia("(pointer: coarse)").matches || document.body.classList.contains("show-touch");
  return coarse ? t("hint.touch") : t("hint.keys");
}
