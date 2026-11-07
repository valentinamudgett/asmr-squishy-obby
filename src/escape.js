import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeContainer,
  Quaternion,
  Ray,
  StandardMaterial,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { buildCapybara, POLICE_CAP_TOP } from "./capybara.js";
import { contains, createSquishy, discardPad, stepSquish } from "./course.js";
import { PAD_TOP } from "./foods.js";
import { t } from "./i18n.js";
import { FOOT_OFFSET } from "./player.js";
import { PRISON_LEVEL } from "./prison.js";
import { plainMaterial, unlitMaterial } from "./seasons.js";

/** Checkpoints inside the prison. PRISON_LEVEL is the cell; FREEDOM_LEVEL is back out on the course. */
export const KILLER_LEVEL = 110;
/** The vending room past the killer capybara's obby, where the chef comes after you. */
export const VENDING_LEVEL = 112;
export const BOSS_LEVEL = 115;
/** The energy soda from the vending machine: its price in coins, the run speed it gives, and for how long. */
export const SODA_PRICE = 3;
export const SODA_SPEED = 1.6;
export const SODA_SECONDS = 18;

/** The prison is built off to the side of the level-100 checkpoint, well clear of the course. */
const OFFSET = new Vector3(160, -2, 0);
const LIVES = 10;
const BOSS_HEALTH = 5;
/**
 * Per difficulty. The player runs at 4.4 m/s, so police that keep coming are a little slower. The
 * chef is faster than a run but slower than a run on soda (7 m/s); `chefWait` is how long it holds
 * off when you don't buy one.
 */
const PACE = {
  easy: { police: 3.3, policeDelay: 2.6, killer: 4.0, killerDelay: 2.2, chef: 5.4, chefDelay: 1.6, chefWait: 5, fireEvery: 1.7, fireSpeed: 10 },
  medium: { police: 3.8, policeDelay: 1.9, killer: 4.6, killerDelay: 1.6, chef: 5.9, chefDelay: 1.3, chefWait: 4, fireEvery: 1.25, fireSpeed: 13 },
  hard: { police: 4.2, policeDelay: 1.3, killer: 5.2, killerDelay: 1.1, chef: 6.4, chefDelay: 1, chefWait: 3, fireEvery: 0.9, fireSpeed: 16 },
};
/** Where each checkpoint puts you, in prison space, and which way you face. */
const SPAWNS = {
  [PRISON_LEVEL]: { x: 0.8, y: 0, z: 1.2, heading: -Math.PI / 2 },
  [KILLER_LEVEL]: { x: 10.5, y: 17.6, z: 1.5, heading: Math.PI / 2 },
  [VENDING_LEVEL]: { x: 41.8, y: 21.8, z: 10.6, heading: -Math.PI / 2 },
  [BOSS_LEVEL]: { x: 46.6, y: 21.8, z: 0, heading: Math.PI / 2 },
};
const HALL_FLOOR = -3;
const SQUISHY_FLOOR = 9;
const KILLER_FLOOR = 17.6;
/** Where the killer capybara's floor ends and the obby over the goo begins. */
const PIT_EDGE = 18;
const ARENA_FLOOR = 21.8;
const STAGE_TOP = 22.4;
const BOSS_X = 72;
const BOSS_SIZE = 4.2;
const KILLER_SIZE = 1.6;
const CHEF_SIZE = 1.8;
const POLICE_SIZE = 1.3;
/** Where the second vent comes out, high on the killer capybara's wall. */
const LEDGE_TOP = 19.4;
/** The zipline from the ledge down to the level-110 checkpoint: cable ends, in prison space. */
const ZIP_FROM = { x: 8, y: 22.2, z: -6.8 };
const ZIP_TO = { x: 10.5, y: 20.05, z: 1.5 };
const ZIP_SPEED = 5;
/** From the cable down to your feet while you hang from the handle. */
const ZIP_HANG = 1.95;
/** Standing this close under the handle grabs it; this close lets you grab it with E. */
const ZIP_TOUCH = 0.5;
const ZIP_REACH = 1.6;
/** The vending machine's front, in prison space, and how close you must be to buy. */
const MACHINE = { x: 35.6, z: 10.4 };
const MACHINE_REACH = 2;
/** Past this x you're out of the vending room and into the kitchen. */
const KITCHEN_X = 44;
const SHOT_SPEED = 32;
const SHOT_COOLDOWN = 0.28;
/** Shots within this angle of where you face curve onto the boss. */
const AUTO_AIM = 0.7;

/**
 * The police capybaras' way from their door, across the hall, up the four flights, and over to the
 * foot of the squishy wall. `w` is how far either side of the line they may step.
 */
const POLICE_ROUTE = [
  { x: -6.8, y: HALL_FLOOR, z: 0, w: 5 },
  { x: -19.5, y: HALL_FLOOR, z: 4.75, w: 1 },
  { x: -21, y: HALL_FLOOR, z: 4.75, w: 1 },
  { x: -27, y: 0, z: 4.75, w: 1.2 },
  { x: -28.5, y: 0, z: 4.75, w: 1.2 },
  { x: -28.5, y: 0, z: -4.75, w: 1.2 },
  { x: -27, y: 0, z: -4.75, w: 1 },
  { x: -21, y: 3, z: -4.75, w: 1.2 },
  { x: -19.5, y: 3, z: -4.75, w: 1.2 },
  { x: -19.5, y: 3, z: 4.75, w: 1.2 },
  { x: -21, y: 3, z: 4.75, w: 1 },
  { x: -27, y: 6, z: 4.75, w: 1.2 },
  { x: -28.5, y: 6, z: 4.75, w: 1.2 },
  { x: -28.5, y: 6, z: -4.75, w: 1.2 },
  { x: -27, y: 6, z: -4.75, w: 1 },
  { x: -21, y: 9, z: -4.75, w: 1.2 },
  { x: -19.5, y: 9, z: -4.75, w: 1.2 },
  { x: -19.5, y: 9, z: 0, w: 1.2 },
  { x: -16.5, y: SQUISHY_FLOOR, z: 0, w: 5.2 },
  { x: -7.5, y: SQUISHY_FLOOR, z: 0 },
];
/** The killer capybara's floor, from the vent wall to the edge of the goo pit. */
const KILLER_ROUTE = [
  { x: 7.2, y: KILLER_FLOOR, z: 0, w: 7.3 },
  { x: PIT_EDGE - 0.6, y: KILLER_FLOOR, z: 0 },
];
/** The chef's way from the vending room, down the kitchen, and to the arena door. */
const CHEF_ROUTE = [
  { x: 35, y: ARENA_FLOOR, z: 12.4, w: 3.2 },
  { x: KITCHEN_X, y: ARENA_FLOOR, z: 14.4, w: 1.6 },
  { x: 60.75, y: ARENA_FLOOR, z: 14.4, w: 1.4 },
  { x: 60.75, y: ARENA_FLOOR, z: 11.4 },
];
/** Kitchen counters to jump or weave round: x0, x1, z0, z1. */
const COUNTERS = [
  [48.5, 49.7, 12.4, 14.6],
  [53, 54.2, 14.2, 16.4],
  [57, 58.2, 12.4, 14.4],
];
/**
 * The big squishies stuck to the walls, bottom to top: once round the room and on to the one under
 * the vent. Gaps of 1.3 to 1.5 m and steps of 0.4 to 0.8 m, like the course; a running jump clears
 * about 2.5 m while rising 0.8 m.
 */
const WALL_SQUISHIES = [
  { food: "jelly", size: 2.4, color: "#ff6f9e", x: -12.6, z: -4.75, top: 9.8 },
  { food: "dumpling", radius: 1.15, color: "#a6d8f2", x: -8.9, z: -4.75, top: 10.6 },
  { food: "cheese", size: 2.4, x: -5.25, z: -1.9, top: 11.4 },
  { food: "needoh", size: 2.4, color: "#9a7bff", x: -5.25, z: 2.1, top: 12.2 },
  { food: "dumpling", radius: 1.15, color: "#ffb8d2", x: -9, z: 4.75, top: 13 },
  { food: "blob", size: 2.4, color: "#7ed957", x: -12.8, z: 4.75, top: 13.8 },
  { food: "jelly", size: 2.4, color: "#4fc3ff", x: -16.35, z: 1.45, top: 14.6 },
  { food: "dumpling", radius: 1.15, color: "#ffd2a6", x: -16.35, z: -2.45, top: 15.4 },
  { food: "cheese", size: 2.4, x: -12.6, z: -4.75, top: 16.2 },
  { food: "needoh", size: 2.4, color: "#ff9f43", x: -8.9, z: -4.75, top: 16.6 },
  { food: "jelly", size: 2.4, color: "#ff6f9e", x: -5.25, z: -3.5, top: 17 },
  { food: "blob", size: 2.4, color: "#ffd23f", x: -5.25, z: 0.5, top: 17.8 },
  { food: "dumpling", radius: 1.15, color: "#c9a0ff", x: -5.25, z: 4.4, top: 18.6 },
];
/** The first vent's centre line, from the cell wall to the hole over the hall. */
const VENT_PATH = [
  [-3.4, -1.5],
  [-6.5, -1.5],
  [-6.5, 2.5],
  [-9.5, 2.5],
  [-9.5, -4.5],
  [-12.5, -4.5],
  [-12.5, -1.5],
  [-15.1, -1.5],
];
/** The second vent's centre line, from the squishy room wall to the ledge in the killer capybara's room. */
const VENT2_PATH = [
  [-3.6, 4.5],
  [-1.2, 4.5],
  [-1.2, -2.5],
  [1.6, -2.5],
  [1.6, 4.5],
  [4.2, 4.5],
  [4.2, -5.5],
  [6, -5.5],
];
/** Half the width of a vent: room for the capsule to turn and the camera to stay inside. */
const DUCT_HALF = 0.9;
/** Vent covers: where the closed grate sits, which edge it hinges on, and which way it swings. */
const GRATES = [
  { x: -2.97, y: 1.65, z: -1.5, hinge: -0.6, swing: -1.75 },
  { x: -4.03, y: LEDGE_TOP, z: 4.5, hinge: 5.4, swing: 1.75 },
];
/** How close (to the grate's middle) you must be to open it. */
const GRATE_REACH = 2.1;
const CLOSE_UP_SECONDS = 1;
/** Platforms over the goo in the killer capybara's room: x0, x1, z0, z1, top, look. */
const OBBY = [
  [18.6, 20.6, -2, 0, 18.2, "crate"],
  [22.2, 23.8, -0.3, 1.3, 18.8, "crate"],
  [25.4, 29.4, 0.15, 0.95, 19.2, "steel"],
  [30.8, 32.3, -2.2, -0.7, 19.8, "crate"],
  [33.6, 34.8, -0.2, 1, 20.4, "steel"],
  [35.8, 37.6, 1.6, 3.4, 20.9, "crate"],
  [38.4, 39.6, -0.4, 0.8, 21.3, "steel"],
];
/** Crates to hide behind in the boss arena: x0, x1, z0, z1. Shots on both sides stop on them. */
const COVER = [
  [53.5, 55.1, -6.2, -4.6],
  [56.5, 58.1, 3.8, 5.4],
  [60.5, 62.1, -1.6, 0],
];

/**
 * Capybara Prison, the climb from the level-100 checkpoint to level 120. It is its own building,
 * put up beside the course when you get locked up and taken down again once you're free:
 *
 * 1. Your cell. Climb the stool, the desk, and the top bunk into the vent in the wall.
 * 2. The vent drops you through the hall ceiling. Police capybaras come out of their door and chase
 *    you up four flights of stairs. If they catch you, it's back to the cell.
 * 3. Big squishies stuck to the wall climb to a second vent. The police can't catch you on them.
 * 4. The vent comes out on a ledge, and a zipline carries you down to level 110. A killer capybara
 *    chases you across the floor until you're on the obby over the goo.
 * 5. Level 112: a vending machine sells an energy soda that makes you run faster for a while. Then a
 *    chef capybara chases you down the kitchen to the arena door.
 * 6. Level 115: the warden, a giant capybara, throws mandarins at you. You get a blaster and 10
 *    lives; five hits wins, and losing all your lives starts the fight over.
 * 7. The gate behind the warden opens, and walking through it sends you out to level 120.
 */
export function createEscape(scene, { graphics, audio, avatar }) {
  let pace = PACE.easy;
  let site = null;
  let active = false;
  let level = PRISON_LEVEL;
  let phase = "cell";
  let fight = null;
  let policeIn = 0;
  let safeShown = false;
  let obbyShown = false;
  const origin = new Vector3();
  const here = new Vector3();
  const center = new Vector3();
  const lastCenter = new Vector3();
  let facing = 0;
  let cooldown = 0;
  /** Set while the caught close-up plays: seconds left, where you go back to, and what it says then. */
  let caught = null;
  let replay = false;
  /** How far along the zipline you are while riding it. */
  let rideS = 0;
  /** Whether you've had the soda since the last time you were at level 112, and when the chef comes out. */
  let soda = false;
  let chefIn = 0;
  const events = [];

  const toast = (text, next = null, time = 2.2) => events.push({ type: "toast", text, next, time });
  const world = (x, y, z) => new Vector3(origin.x + x, origin.y + y, origin.z + z);

  function spot(at) {
    const spawn = SPAWNS[at];
    return { position: world(spawn.x, spawn.y + FOOT_OFFSET + 0.06, spawn.z), heading: spawn.heading };
  }

  /** Puts the actors back the way they are when you arrive at checkpoint `at`. */
  function reset(at) {
    level = at;
    phase = { [PRISON_LEVEL]: "cell", [KILLER_LEVEL]: "killer", [VENDING_LEVEL]: "chef" }[at] ?? "boss";
    safeShown = false;
    obbyShown = false;
    for (const officer of site.police) officer.hide();
    site.killer.hide();
    site.chef.hide();
    if (phase === "killer") site.killer.wait = pace.killerDelay;
    rideS = 0;
    site.zip.place(0);
    soda = false;
    chefIn = pace.chefWait;
    if (at === VENDING_LEVEL) events.push({ type: "sodaEnd" });
    site.clearShots();
    fight = null;
    site.boss.restore();
    site.gate.close();
    if (at === PRISON_LEVEL) for (const grate of site.grates) grate.close();
    caught = null;
    if (phase === "boss") fight = { lives: LIVES, health: BOSS_HEALTH, intro: 1.6, time: 0, fireIn: 2, hurt: 0 };
    avatar.setArmed(phase === "boss");
  }

  function respawn(at, text, next) {
    events.push({ type: "respawn", ...spot(at) });
    if (text) toast(text, next, 1.8);
    reset(at);
  }

  /**
   * The capybara that caught you turns to you and the camera cuts to its face; after
   * CLOSE_UP_SECONDS you're back at checkpoint `at`.
   */
  function catchBy(actor, at, text, next) {
    const eye = new Vector3();
    const target = new Vector3();
    // Toward you if the camera fits there (you're hidden for the close-up), else the next most open way.
    const toward = Math.atan2(here.x - actor.position.x, here.z - actor.position.z);
    let yaw = toward;
    for (let step = 0; step < 8; step += 1) {
      const turn = toward + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * (Math.PI / 4);
      actor.closeUp(eye, target, turn);
      if (site.viewClear(actor, eye, target)) {
        yaw = turn;
        break;
      }
    }
    actor.faceYaw(yaw);
    actor.closeUp(eye, target);
    caught = { left: CLOSE_UP_SECONDS, at, next };
    events.push({ type: "closeUp", eye: eye.addInPlace(origin), target: target.addInPlace(origin) });
    toast(text, null, CLOSE_UP_SECONDS + 0.4);
    audio.blip("thump");
  }

  function reach(at, text) {
    events.push({ type: "checkpoint", level: at, text });
    reset(at);
  }

  function updateChase(dt) {
    if (policeIn > 0) {
      policeIn -= dt;
      if (policeIn <= 0) site.police.forEach((officer, index) => officer.release(index * 0.7));
    }
    const target = site.policeRoute.project(here.x, here.y, here.z);
    const onSquishy = site.standing !== null;
    // Higher than a jump from the floor means you're hopping between squishies.
    const safe = onSquishy || (here.x > -17.6 && here.y > SQUISHY_FLOOR + 1.3);
    let catcher = null;
    site.police.forEach((officer, index) => {
      if (officer.step(dt, target, index === 0 ? 0.4 : -0.4, pace.police) && !safe) catcher ??= officer;
    });
    if (catcher) {
      catchBy(catcher, PRISON_LEVEL, t("toast.policeCaught"), t("toast.backToCell"));
      return;
    }
    if (onSquishy && !safeShown) {
      safeShown = true;
      toast(t("toast.squishySafe"), t("toast.climbSquishies"), 2.6);
    }
    if (here.x > -3.8 && here.y > LEDGE_TOP - 0.4) {
      phase = "duct";
      for (const officer of site.police) officer.hide();
    }
  }

  /** Through the second vent and out on the ledge: grab the zipline, or drop down, to reach level 110. */
  function updateDuct(grounded) {
    if (here.y > LEDGE_TOP - 0.3 && Math.hypot(here.x - ZIP_FROM.x, here.z - ZIP_FROM.z) < ZIP_TOUCH) {
      grab();
      return;
    }
    if (grounded && here.x > 6.4 && here.y < KILLER_FLOOR + 0.5) reach(KILLER_LEVEL, t("toast.killer"));
  }

  function nearHandle() {
    return phase === "duct" && here.y > LEDGE_TOP - 0.3 && Math.hypot(here.x - ZIP_FROM.x, here.z - ZIP_FROM.z) < ZIP_REACH;
  }

  function grab() {
    phase = "zip";
    rideS = 0;
    audio.blip("thump");
  }

  function nearMachine() {
    return phase === "chef" && !soda && here.y > ARENA_FLOOR - 0.3 && Math.hypot(center.x - MACHINE.x, center.z - MACHINE.z) < MACHINE_REACH;
  }

  /** Level 112: the chef comes out once you've had the soda (or got tired of waiting) and runs you down the kitchen. */
  function updateChef(dt) {
    if (here.y < ARENA_FLOOR - 3) {
      respawn(VENDING_LEVEL, t("toast.goo"), t("toast.keepGoing"));
      return;
    }
    const chef = site.chef;
    if (!chef.out) {
      chefIn -= dt;
      if (here.x > KITCHEN_X) chefIn = Math.min(chefIn, 0.3);
      if (chefIn <= 0) {
        chef.release(0);
        toast(t("toast.chef"), null, 2.2);
        audio.blip("thump");
      }
    }
    const target = site.chefRoute.project(here.x, here.y, here.z);
    if (chef.step(dt, target, 0, pace.chef)) {
      catchBy(chef, VENDING_LEVEL, t("toast.chefCaught"), t("toast.buyAgain"));
      return;
    }
    if (here.x > 44.4 && here.z < 11.8 && here.y > ARENA_FLOOR - 0.5) reach(BOSS_LEVEL, t("toast.bossIntro"));
  }

  function updateKiller(dt) {
    if (here.y < KILLER_FLOOR - 5.6) {
      respawn(KILLER_LEVEL, t("toast.goo"), t("toast.keepGoing"));
      return;
    }
    const killer = site.killer;
    if (!killer.out) {
      killer.wait -= dt;
      if (killer.wait <= 0) killer.release(0);
    }
    const onObby = here.x > PIT_EDGE - 0.1;
    if (onObby && !obbyShown && killer.out) {
      obbyShown = true;
      toast(t("toast.onObby"));
    }
    const target = site.killerRoute.project(here.x, here.y, here.z);
    if (killer.step(dt, target, 0, pace.killer) && !onObby) {
      catchBy(killer, KILLER_LEVEL, t("toast.killerCaught"), t("toast.keepGoing"));
      return;
    }
    if (here.z > 8.6 && here.y > ARENA_FLOOR - 0.5) reach(VENDING_LEVEL, t("toast.vending"));
  }

  function updateFight(dt) {
    if (here.y < ARENA_FLOOR - 3) {
      respawn(BOSS_LEVEL);
      return;
    }
    fight.time += dt;
    fight.hurt = Math.max(0, fight.hurt - dt);
    if (fight.intro > 0) {
      fight.intro -= dt;
      if (fight.intro <= 0) toast(t("toast.fight"), coarse() ? t("hint.shootTouch") : t("hint.shootKeys"), 2.4);
    }
    const boss = site.boss;
    boss.walk(fight.time, here);
    if (fight.intro <= 0) {
      fight.fireIn -= dt;
      if (fight.fireIn <= 0) {
        fight.fireIn = pace.fireEvery * (0.8 + Math.random() * 0.4);
        const lead = Math.min(0.6, Vector3.Distance(boss.mouth, center) / pace.fireSpeed);
        // Clamped, so the jump of a respawn never reads as a sprint.
        const velocityX = Math.max(-8, Math.min(8, (center.x - lastCenter.x) / dt));
        const velocityZ = Math.max(-8, Math.min(8, (center.z - lastCenter.z) / dt));
        const aimAt = new Vector3(center.x + velocityX * lead * 0.6, center.y, center.z + velocityZ * lead * 0.6);
        site.throwMandarin(boss.mouth, aimAt, pace.fireSpeed);
      }
    }
    const hits = site.stepShots(dt, center, fight.hurt <= 0, boss);
    if (hits.player) {
      fight.lives -= 1;
      fight.hurt = 0.9;
      audio.blip("thump");
      if (fight.lives <= 0) {
        respawn(BOSS_LEVEL, t("toast.out"), t("toast.tryAgain"));
        return;
      }
      toast(t("toast.livesLeft").replace("{n}", String(fight.lives)), null, 1.2);
    }
    if (hits.boss) {
      fight.health -= 1;
      boss.flinch();
      audio.blip("thump");
      if (fight.health <= 0) {
        phase = "won";
        boss.topple();
        site.clearShots();
        site.gate.open();
        avatar.setArmed(false);
        toast(t("toast.bossBeaten"), t("toast.gateOpen"), 2.6);
      } else {
        toast(t("toast.bossHit").replace("{n}", String(fight.health)), null, 1.2);
      }
    }
  }

  return {
    get active() {
      return active;
    },
    /** True when you went back in from the Character studio after already escaping. */
    get replay() {
      return active && replay;
    },
    /** Lives and boss health while the warden fight is on, otherwise null. */
    get fight() {
      return active && fight ? { lives: fight.lives, maxLives: LIVES, health: fight.health, maxHealth: BOSS_HEALTH } : null;
    },
    get armed() {
      return active && phase === "boss" && fight !== null && fight.intro <= 0;
    },
    setDifficulty(difficulty) {
      pace = PACE[difficulty] ?? PACE.easy;
    },
    /**
     * Locks you up at checkpoint `at` (100, 110, 112, or 115), building the prison beside `gate`, the
     * level-100 checkpoint pad (or any pad, for a replay). Returns where to put the player.
     */
    enter(gate, at, { again = false } = {}) {
      replay = again;
      origin.set(gate.homeX + OFFSET.x, gate.homeY + OFFSET.y, gate.homeZ + OFFSET.z);
      if (site && !site.origin.equals(origin)) {
        site.dispose();
        site = null;
      }
      site ??= buildSite(scene, origin, { graphics, audio });
      active = true;
      events.length = 0;
      reset(SPAWNS[at] ? at : PRISON_LEVEL);
      if (level === PRISON_LEVEL) toast(t("toast.lockedUp"), t("toast.findVent"), 3);
      return spot(level);
    },
    /** Out through the gate: the prison comes down. */
    leave() {
      active = false;
      replay = false;
      caught = null;
      fight = null;
      avatar.setArmed(false);
      site?.dispose();
      site = null;
    },
    /** The wall squishy under `foot`, if any. */
    findPad(foot) {
      if (!site) return null;
      let best = null;
      let bestDy = 1.05;
      for (const pad of site.squishies) {
        if (!contains(pad, foot.x - pad.mesh.position.x, foot.z - pad.mesh.position.z)) continue;
        const dy = Math.abs(foot.y - (pad.mesh.position.y + pad.thickness));
        if (dy <= bestDy) {
          best = pad;
          bestDy = dy;
        }
      }
      return best;
    },
    /** Fires the blaster from where you stand, the way you face. */
    shoot() {
      if (!this.armed || cooldown > 0) return;
      cooldown = SHOT_COOLDOWN;
      site.fireShot(center, facing);
      audio.blip("pew");
    },
    /**
     * What E (or the touch action button) does where you stand: "vent" opens a vent grate, "zip"
     * grabs the zipline, "soda" buys an energy soda. Null when there's nothing to do.
     */
    get action() {
      if (!active || !site || caught !== null) return null;
      if (site.grates.some((grate) => grate.closed && Vector3.Distance(grate.center, center) < GRATE_REACH)) return "vent";
      if (nearHandle()) return "zip";
      if (nearMachine()) return "soda";
      return null;
    },
    act() {
      const action = this.action;
      if (action === "vent") {
        site.grates.find((each) => each.closed && Vector3.Distance(each.center, center) < GRATE_REACH).open();
        audio.blip("thump");
      } else if (action === "zip") {
        grab();
      } else if (action === "soda") {
        // main.js takes the coins and gives you the speed.
        soda = true;
        if (!site.chef.out) chefIn = pace.chefDelay;
        events.push({ type: "soda" });
      }
    },
    /** True while you hang from the zipline. */
    get riding() {
      return active && phase === "zip";
    },
    /**
     * Moves you along the zipline. Call before the player update; while riding, put the capsule
     * centre at the returned position instead. Null when you're not on it (or it just let go).
     */
    ride(dt, hold) {
      if (!active || !site || phase !== "zip") return null;
      if (!hold) rideS = Math.min(site.zip.length, rideS + ZIP_SPEED * dt);
      const point = site.zip.place(rideS);
      if (rideS >= site.zip.length) phase = "duct";
      return { position: world(point.x, point.y - ZIP_HANG + FOOT_OFFSET, point.z), heading: site.zip.heading };
    },
    /**
     * `hold` freezes the actors (menus, dances, screen changes). Returns this frame's events:
     * `toast`, `respawn` (position, heading), `checkpoint` (level, text), `closeUp` (eye, target:
     * look at the capybara that caught you), `closeUpEnd`, `soda` (you bought one), `sodaEnd` (it's
     * taken away), and `free`.
     */
    update(dt, time, { foot, position, pad, grounded, facing: faceAngle, hold }) {
      if (!active || !site) return events.splice(0);
      lastCenter.copyFrom(center);
      center.set(position.x - origin.x, position.y - origin.y, position.z - origin.z);
      here.set(foot.x - origin.x, foot.y - origin.y, foot.z - origin.z);
      facing = faceAngle;
      cooldown = Math.max(0, cooldown - dt);
      site.standing = grounded && site.squishies.includes(pad) ? pad : null;
      site.animate(dt, time);
      // Held events wait, so the lock-up toast shows once you leave the start menu.
      if (hold) return [];
      if (caught) {
        caught.left -= dt;
        if (caught.left <= 0) {
          const { at, next } = caught;
          events.push({ type: "closeUpEnd" });
          respawn(at, next);
        }
        return events.splice(0);
      }
      if (here.y < HALL_FLOOR - 5) {
        respawn(level);
        return events.splice(0);
      }
      if (phase === "cell" && here.y < HALL_FLOOR + 2 && here.x < -6) {
        phase = "chase";
        policeIn = pace.policeDelay;
        toast(t("toast.policeSpotted"), null, 2.6);
      } else if (phase === "chase") updateChase(dt);
      else if (phase === "duct") updateDuct(grounded);
      else if (phase === "killer") updateKiller(dt);
      else if (phase === "chef") updateChef(dt);
      else if (phase === "boss") updateFight(dt);
      else if (phase === "won") {
        site.boss.walk(fight.time, here);
        if (here.x > 77.6 && Math.abs(here.z) < 2.2) {
          phase = "out";
          events.push({ type: "free" });
        }
      }
      return events.splice(0);
    },
  };
}

function coarse() {
  return window.matchMedia("(pointer: coarse)").matches || document.body.classList.contains("show-touch");
}

/** Everything that makes up the prison, in prison space with `origin` as (0, 0, 0). */
function buildSite(scene, origin, { graphics, audio }) {
  const root = new TransformNode("prison", scene);
  root.position.copyFrom(origin);
  root.computeWorldMatrix(true);
  const groups = new Map();
  const owned = [];
  const casters = [];
  const container = new PhysicsShapeContainer(scene);
  owned.push(container);

  // Indoors the sun and sky light still reach every wall, so the prison keeps its own glow low and
  // its pale colors muted; otherwise bloom washes it out next to the obby.
  const material = (name, hex, glow = 0.06) => {
    const made = plainMaterial(scene, `prison-${name}`, hex, glow);
    made.specularColor = Color3.Black();
    owned.push(made);
    return made;
  };
  const M = {
    concrete: material("concrete", "#7f868f"),
    trim: material("trim", "#4c5560"),
    floor: material("floor", "#5d6470"),
    tile: material("tile", "#a39d90"),
    ceiling: material("ceiling", "#8f949c"),
    metal: material("metal", "#8c949e"),
    bars: material("bars", "#2f343c", 0.02),
    frame: material("frame", "#3c4a5c"),
    mattress: material("mattress", "#5d7ea0"),
    blanket: material("blanket", "#e86e18"),
    white: material("white", "#c9c5bb"),
    wood: material("wood", "#7a5c3f"),
    light: material("light", "#fff1cc", 0.55),
    hazard: material("hazard", "#e8be36", 0.12),
    goo: material("goo", "#4fd640", 0.45),
    crate: material("crate", "#9c6b35"),
    steel: material("steel", "#6d7682"),
    kitchen: material("kitchen", "#b7c2c4"),
    vend: material("vend", "#c8203a", 0.1),
    vendGlow: material("vendGlow", "#bff1ff", 0.85),
    cans: ["#2f7bff", "#3ddc84", "#ff4fa3", "#ffcf3a"].map((hex, index) => material(`can${index}`, hex, 0.35)),
    arena: material("arena", "#3b2f4a"),
    arenaWall: material("arenaWall", "#6e2a35"),
    door: material("door", "#24356b"),
    dark: material("dark", "#120c10", 0),
    exit: material("exit", "#e8e4d0", 0.5),
  };

  const add = (mesh, look, { camera = true, cast = false } = {}) => {
    mesh.parent = root;
    const key = `${look.name}|${camera}|${cast}`;
    let group = groups.get(key);
    if (!group) {
      group = { look, camera, cast, meshes: [] };
      groups.set(key, group);
    }
    group.meshes.push(mesh);
    return mesh;
  };
  const collide = (x, y, z, w, h, d, rotation = Quaternion.Identity()) => {
    const shape = new PhysicsShapeBox(new Vector3(x, y, z), rotation, new Vector3(w, h, d), scene);
    container.addChild(shape);
    owned.push(shape);
  };

  /** A solid block from corner to corner. Leave `look` null for an invisible wall. */
  function box(x0, y0, z0, x1, y1, z1, look, { solid = true, camera = true, cast = false } = {}) {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    const z = (z0 + z1) / 2;
    if (look) {
      const mesh = MeshBuilder.CreateBox("prisonBlock", { width: w, height: h, depth: d }, scene);
      mesh.position.set(x, y, z);
      add(mesh, look, { camera, cast });
    }
    if (solid) collide(x, y, z, w, h, d);
  }

  /** A slab between z0 and z1 whose top runs straight from (xa, ya) to (xb, yb), `lift` above that line. */
  function slope(xa, ya, xb, yb, z0, z1, thick, look, { solid = true, lift = 0 } = {}) {
    const run = xb - xa;
    const rise = yb - ya;
    const tilt = Math.atan(rise / run);
    const length = Math.hypot(run, rise);
    const off = lift - thick / 2;
    const x = (xa + xb) / 2 - Math.sin(tilt) * off;
    const y = (ya + yb) / 2 + Math.cos(tilt) * off;
    const z = (z0 + z1) / 2;
    if (look) {
      const mesh = MeshBuilder.CreateBox("prisonSlope", { width: length, height: thick, depth: z1 - z0 }, scene);
      mesh.position.set(x, y, z);
      mesh.rotation.z = tilt;
      add(mesh, look);
    }
    if (solid) collide(x, y, z, length, thick, z1 - z0, Quaternion.RotationYawPitchRoll(0, 0, tilt));
  }

  /** A flight of stairs. The feet walk a smooth ramp; the steps are only for looks. */
  function flight(xa, ya, xb, yb, z0, z1, railZ) {
    slope(xa, ya, xb, yb, z0, z1, 0.3, null);
    slope(xa, ya, xb, yb, z0, z1, 0.3, M.trim, { solid: false, lift: -0.35 });
    const steps = Math.round(Math.abs(xb - xa) / 0.5);
    for (let i = 0; i < steps; i += 1) {
      const from = xa + ((xb - xa) * i) / steps;
      const to = xa + ((xb - xa) * (i + 1)) / steps;
      const top = ya + ((yb - ya) * (i + 0.5)) / steps;
      box(Math.min(from, to), top - 0.5, z0, Math.max(from, to), top, z1, M.concrete, { solid: false });
      box(from - 0.06, top - 0.02, z0, from + 0.06, top + 0.01, z1, M.hazard, { solid: false, camera: false });
    }
    const rail = [railZ - 0.05, railZ + 0.05];
    slope(xa, ya, xb, yb, ...rail, 1, null, { lift: 1 });
    slope(xa, ya, xb, yb, ...rail, 0.08, M.hazard, { solid: false, lift: 1 });
    slope(xa, ya, xb, yb, ...rail, 0.06, M.hazard, { solid: false, lift: 0.5 });
  }

  /** A waist-high yellow rail at `x` from z0 to z1, standing on `y`, that you can't fall past. */
  function railing(z0, z1, x, y) {
    box(x - 0.05, y, z0, x + 0.05, y + 1.05, z1, null);
    box(x - 0.05, y + 0.96, z0, x + 0.05, y + 1.04, z1, M.hazard, { solid: false, camera: false });
    box(x - 0.04, y + 0.47, z0, x + 0.04, y + 0.53, z1, M.hazard, { solid: false, camera: false });
  }

  /**
   * Fills x0..x1, z0..z1 between y0 and y1 with metal, except a corridor DUCT_HALF either side of
   * `path` (axis-aligned [x, z] points). Walls come out as one block per run of solid cells.
   */
  function ductWalls(x0, x1, z0, z1, y0, y1, path) {
    const open = [];
    for (let i = 0; i + 1 < path.length; i += 1) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      open.push([Math.min(ax, bx) - DUCT_HALF, Math.max(ax, bx) + DUCT_HALF, Math.min(az, bz) - DUCT_HALF, Math.max(az, bz) + DUCT_HALF]);
    }
    const cuts = (lo, hi, edges) => [...new Set([lo, hi, ...edges].map((v) => Math.min(hi, Math.max(lo, v))))].sort((a, b) => a - b);
    const xs = cuts(x0, x1, open.flatMap((rect) => [rect[0], rect[1]]));
    const zs = cuts(z0, z1, open.flatMap((rect) => [rect[2], rect[3]]));
    for (let i = 0; i + 1 < xs.length; i += 1) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      let from = null;
      for (let j = 0; j + 1 <= zs.length; j += 1) {
        const cz = j + 1 < zs.length ? (zs[j] + zs[j + 1]) / 2 : null;
        const solid = cz !== null && !open.some(([a, b, c, d]) => cx > a && cx < b && cz > c && cz < d);
        if (solid && from === null) from = zs[j];
        if (!solid && from !== null) {
          box(xs[i], y0, from, xs[i + 1], y1, zs[j], M.metal);
          from = null;
        }
      }
    }
  }

  /** A ceiling light. */
  const lamp = (x, y, z, w = 1.6, d = 0.5) => box(x - w / 2, y - 0.05, z - d / 2, x + w / 2, y, z + d / 2, M.light, { solid: false, camera: false });

  function sign(text, x, y, z, yaw, width, height, background, ink) {
    const texture = new DynamicTexture("prisonSignTex", { width: 512, height: Math.round((512 * height) / width) }, scene, true);
    const ctx = texture.getContext();
    const h = texture.getSize().height;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 512, h);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, h - 16);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let size = Math.round(h * 0.55);
    do {
      ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
      size -= 4;
    } while (ctx.measureText(text).width > 460 && size > 16);
    ctx.fillText(text, 256, h / 2 + 4);
    texture.update();
    const look = unlitMaterial(scene, "prisonSignMat", texture, { alpha: false });
    look.backFaceCulling = true;
    const plane = MeshBuilder.CreatePlane("prisonSign", { width, height }, scene);
    plane.parent = root;
    plane.position.set(x, y, z);
    plane.rotation.y = yaw;
    plane.material = look;
    plane.isPickable = false;
    owned.push(plane, look, texture);
  }

  /** An orange floor disc and a flag with the level on it. */
  function marker(levelNumber, x, y, z) {
    const disc = MeshBuilder.CreateCylinder("prisonMarker", { height: 0.05, diameter: 2.4, tessellation: 32 }, scene);
    disc.position.set(x, y + 0.025, z);
    add(disc, M.blanket, { camera: false });
    box(x + 0.95, y, z - 0.03, x + 1.01, y + 1.6, z + 0.03, M.hazard, { solid: false, camera: false });
    const texture = new DynamicTexture("prisonFlagTex", { width: 256, height: 128 }, scene, true);
    const ctx = texture.getContext();
    ctx.fillStyle = "#ff7a1a";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#2b1405";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 84px Arial Black, Arial, sans-serif";
    ctx.fillText(String(levelNumber), 128, 70);
    texture.update();
    const look = new StandardMaterial("prisonFlagMat", scene);
    look.diffuseTexture = texture;
    look.emissiveColor = new Color3(0.45, 0.3, 0.15);
    look.specularColor = Color3.Black();
    look.backFaceCulling = false;
    const flag = MeshBuilder.CreatePlane("prisonFlag", { width: 0.62, height: 0.31 }, scene);
    flag.parent = root;
    flag.position.set(x + 1.32, y + 1.42, z);
    flag.rotation.y = Math.PI / 2;
    flag.material = look;
    flag.isPickable = false;
    owned.push(flag, look, texture);
  }

  const props = [];
  const prop = (look, name, x, y, z, yaw = 0, roll = 0) => {
    const mesh = buildCapybara(scene, look).createInstance(`prison-${name}`);
    mesh.parent = root;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, yaw, roll);
    mesh.isPickable = false;
    props.push(mesh);
    return mesh;
  };

  // 1. The cell, with the corridor outside its bars. Floor at 0, ceiling at 4.2.
  box(-3.4, -0.4, -3.4, 3.4, 0, 7.4, M.floor);
  box(-3.4, 4.2, -3.4, 3.4, 4.6, 7.4, M.ceiling);
  box(-3.4, 0, -3.4, 3.4, 4.2, -3, M.concrete);
  box(3, 0, -3, 3.4, 4.2, 7, M.concrete);
  box(-3.4, 0, 3, -3, 4.2, 7, M.concrete);
  box(-3.4, 0, 7, 3.4, 4.2, 7.4, M.concrete);
  // The left wall, with the vent opening over the top bunk.
  box(-3.4, 0, -3, -3, 1.65, 3, M.concrete);
  box(-3.4, 3.75, -3, -3, 4.2, 3, M.concrete);
  box(-3.4, 1.65, -3, -3, 3.75, -2.4, M.concrete);
  box(-3.4, 1.65, -0.6, -3, 3.75, 3, M.concrete);
  box(-3.02, 3.75, -2.5, -2.94, 3.85, -0.5, M.metal, { solid: false, camera: false });
  box(-3.02, 1.65, -2.5, -2.94, 3.85, -2.4, M.metal, { solid: false, camera: false });
  box(-3.02, 1.65, -0.6, -2.94, 3.85, -0.5, M.metal, { solid: false, camera: false });
  // The bars and the door in them.
  const bars = [];
  for (let x = -2.85; x <= 2.86; x += 0.3) {
    const bar = MeshBuilder.CreateCylinder("prisonBar", { height: 4.2, diameter: 0.07, tessellation: 8 }, scene);
    bar.position.set(x, 2.1, 3);
    bars.push(bar);
  }
  for (const y of [0.1, 2.1, 4.1]) {
    const rail = MeshBuilder.CreateBox("prisonBarRail", { width: 6, height: 0.08, depth: 0.08 }, scene);
    rail.position.set(0, y, 3);
    bars.push(rail);
  }
  for (const bar of bars) add(bar, M.bars, { camera: false });
  box(-3, 0, 2.95, 3, 4.2, 3.05, null);
  // Bunk bed against the left wall. You can't fit between the bunks, so climb the stool and desk.
  for (const [x, z] of [
    [-2.95, -2.55],
    [-2.05, -2.55],
    [-2.95, -0.45],
    [-2.05, -0.45],
  ]) {
    box(x - 0.05, 0, z - 0.05, x + 0.05, 2.3, z + 0.05, M.frame, { solid: false, camera: false, cast: true });
  }
  box(-3, 0.2, -2.6, -2, 0.32, -0.4, M.frame, { cast: true });
  box(-3, 0.32, -2.6, -2, 0.55, -0.4, M.mattress);
  box(-2.98, 0.55, -2, -2.02, 0.6, -0.42, M.blanket, { solid: false, camera: false });
  box(-3, 1.3, -2.6, -2, 1.42, -0.4, M.frame, { cast: true });
  box(-3, 1.42, -2.6, -2, 1.65, -0.4, M.mattress);
  box(-2.98, 1.65, -1.9, -2.02, 1.68, -0.42, M.blanket, { solid: false, camera: false });
  box(-2.95, 1.65, -2.55, -2.05, 1.76, -2.2, M.white, { solid: false, camera: false });
  box(-3, 0, 0, -2.2, 0.85, 1, M.wood, { cast: true });
  box(-1.9, 0, 0.25, -1.4, 0.45, 0.75, M.wood, { cast: true });
  box(2.3, 0, -2.6, 2.9, 0.45, -1.9, M.white);
  box(2.75, 0.45, -2.6, 2.95, 0.95, -1.9, M.white);
  lamp(0, 4.2, 0);
  lamp(0, 4.2, 5.2);
  prop("inmate", "cellmate", 1.5, 0, -2.2, -2.4);
  box(1.2, 0, 5.4, 2.6, 0.8, 6.4, M.wood);
  prop("guard", "sleepyGuard", 1.9, 0, 4.6, Math.PI, 0.25);
  sign(t("prison.cellBlock"), 0, 3.2, 6.94, 0, 3.2, 0.7, "#2f3640", "#ffd23f");

  // 2. The vent: out through the left wall, zig-zagging over the hall, and down through a hole in its ceiling.
  box(-14.2, 1.45, -6.4, -3.4, 1.65, 6.4, M.metal);
  box(-16.4, 1.45, -6.4, -14.2, 1.65, -2.4, M.metal);
  box(-16.4, 1.45, -0.6, -14.2, 1.65, 6.4, M.metal);
  box(-16.4, 1.45, -2.4, -16, 1.65, -0.6, M.metal);
  box(-16.4, 3.75, -6.4, -3.4, 3.95, 6.4, M.metal);
  ductWalls(-16.4, -3.4, -6.4, 6.4, 1.65, 3.75, VENT_PATH);
  for (const [x, z] of VENT_PATH.slice(1, -1)) lamp(x, 3.75, z, 0.5, 0.3);
  box(-14.25, 1.64, -2.4, -14.15, 1.67, -0.6, M.hazard, { solid: false, camera: false });

  // 3. The hall the vent drops you into, with the police door at its far end. Floor at -3.
  box(-30.4, HALL_FLOOR - 0.4, -6.4, -5.6, HALL_FLOOR, 6.4, M.tile);
  box(-18, 1.4, -6.4, -16, 1.6, 6.4, M.ceiling);
  box(-14.2, 1.4, -6.4, -5.6, 1.6, 6.4, M.ceiling);
  box(-16, 1.4, -6.4, -14.2, 1.6, -2.4, M.ceiling);
  box(-16, 1.4, -0.6, -14.2, 1.6, 6.4, M.ceiling);
  box(-18, HALL_FLOOR, -6.4, -5.6, 1.4, -6, M.concrete);
  box(-18, HALL_FLOOR, 6, -5.6, 1.4, 6.4, M.concrete);
  box(-6, HALL_FLOOR, -6, -5.6, 1.4, 6, M.concrete);
  box(-6.06, HALL_FLOOR, -1.1, -5.98, -0.6, 1.1, M.door, { solid: false });
  box(-6.08, -0.6, -1.25, -5.98, -0.45, 1.25, M.trim, { solid: false, camera: false });
  for (const z of [-6, 6]) box(-18, HALL_FLOOR, z - 0.03, -6, HALL_FLOOR + 0.4, z + 0.03, M.trim, { solid: false, camera: false });
  for (const x of [-8.5, -12, -17]) lamp(x, 1.4, 3);
  lamp(-11, 1.4, -3.5);

  // 4. The stairwell: four flights up to the door at the top, floor -3 to ceiling 13.
  box(-30.4, HALL_FLOOR, -6.4, -30, 13.4, 6.4, M.concrete);
  box(-30, HALL_FLOOR, -6.4, -18, 13.4, -6, M.concrete);
  box(-30, HALL_FLOOR, 6, -18, 13.4, 6.4, M.concrete);
  box(-18, 1.4, -6.4, -17.6, 9, 6.4, M.concrete);
  box(-18, 11.8, -6.4, -17.6, 13.4, 6.4, M.concrete);
  box(-18, 9, -6.4, -17.6, 11.8, -2.5, M.concrete);
  box(-18, 9, 2.5, -17.6, 11.8, 6.4, M.concrete);
  box(-30.4, 13, -6.4, -17.6, 13.4, 6.4, M.ceiling);
  for (const [x0, x1, top] of [
    [-30, -27, 0],
    [-21, -18, 3],
    [-30, -27, 6],
    [-21, -18, 9],
  ]) {
    box(x0, top - 0.4, -6, x1, top, 6, M.concrete);
    railing(-3.5, 3.5, x0 === -30 ? -27 : -21, top);
  }
  flight(-21, HALL_FLOOR, -27, 0, 3.5, 6, 3.5);
  flight(-27, 0, -21, 3, -6, -3.5, -3.5);
  flight(-21, 3, -27, 6, 3.5, 6, 3.5);
  flight(-27, 6, -21, 9, -6, -3.5, -3.5);
  for (const z of [-4.5, 0, 4.5]) lamp(-24, 13, z, 2, 0.6);

  // The cell block in the middle of the stairwell: three floors of barred cells facing the flights,
  // with inmates bouncing and pacing inside. The bars are solid both ways.
  const cellInmates = [];
  box(-26.6, HALL_FLOOR, -3.2, -26.3, 9, 3.2, M.concrete);
  box(-21.7, HALL_FLOOR, -3.2, -21.4, 9, 3.2, M.concrete);
  box(-26.3, HALL_FLOOR, -0.15, -21.7, 9, 0.15, M.concrete);
  box(-26.6, 8.7, -3.2, -21.4, 9, 3.2, M.concrete);
  const cellBars = [];
  for (let floor = 0; floor < 3; floor += 1) {
    const base = HALL_FLOOR + floor * 4;
    if (floor > 0) box(-26.3, base - 0.3, -3.2, -21.7, base, 3.2, M.floor);
    for (const side of [-1, 1]) {
      const face = side * 3.12;
      box(-26.3, base, face - 0.06, -21.7, base + 3.7, face + 0.06, null);
      for (let x = -26.1; x <= -21.85; x += 0.3) {
        const bar = MeshBuilder.CreateCylinder("prisonCellBar", { height: 3.7, diameter: 0.07, tessellation: 6 }, scene);
        bar.position.set(x, base + 1.85, face);
        cellBars.push(bar);
      }
      box(-26.3, base, side * 0.15, -25.2, base + 0.5, side * 1.9, M.mattress, { camera: false });
      lamp(-24, base + 3.7, side * 1.6, 1, 0.3);
      const look = buildCapybara(scene, "inmate").createInstance(`prison-cellInmate${floor}${side}`);
      look.parent = root;
      look.isPickable = false;
      look.position.set(-23.4, base, side * 1.7);
      look.rotation.y = side > 0 ? 0 : Math.PI;
      cellInmates.push({ mesh: look, base, side, pace: (floor + (side > 0 ? 1 : 0)) % 2 === 0, phase: floor * 1.7 + side });
    }
  }
  for (const bar of cellBars) add(bar, M.bars, { camera: false });

  // 5. The squishy wall room, floor 9. The squishies climb the far wall to the second vent.
  box(-17.6, SQUISHY_FLOOR - 0.4, -6.4, -3.6, SQUISHY_FLOOR, 6.4, M.floor);
  box(-18, 13.4, -6.4, -17.6, 25.4, 6.4, M.concrete);
  box(-17.6, SQUISHY_FLOOR, -6.4, -3.6, 25.4, -6, M.concrete);
  box(-17.6, SQUISHY_FLOOR, 6, -3.6, 25.4, 6.4, M.concrete);
  const ductTop = LEDGE_TOP + 2.1;
  box(-4, SQUISHY_FLOOR, -6, -3.6, LEDGE_TOP, 6, M.trim);
  box(-4, ductTop, -6, -3.6, 25.4, 6, M.trim);
  box(-4, LEDGE_TOP, -6, -3.6, ductTop, 3.6, M.trim);
  box(-4, LEDGE_TOP, 5.4, -3.6, ductTop, 6, M.trim);
  box(-17.6, 25, -6.4, -3.6, 25.4, 6.4, M.ceiling);
  for (const x of [-15, -10]) for (const z of [-3, 3]) lamp(x, 25, z, 2, 0.6);
  box(-4.02, ductTop, 3.5, -3.96, ductTop + 0.1, 5.5, M.metal, { solid: false, camera: false });

  // 6. The second vent, zig-zagging high over the cell and out onto the ledge in the killer capybara's room.
  box(-3.6, LEDGE_TOP - 0.2, -6.8, 6.4, LEDGE_TOP, 5.8, M.metal);
  box(-3.6, ductTop, -6.8, 6.4, ductTop + 0.2, 5.8, M.metal);
  ductWalls(-3.6, 6, -6.8, 5.8, LEDGE_TOP, ductTop, VENT2_PATH);
  for (const [x, z] of VENT2_PATH.slice(1, -1)) lamp(x, ductTop, z, 0.5, 0.3);

  // 7. The killer capybara's room: the ledge and zipline, its floor, the goo pit, the obby, and the
  // ledge on the far side with the door to the vending room.
  box(6, 9, -8.4, 6.4, LEDGE_TOP, 8.4, M.concrete);
  box(6, ductTop, -8.4, 6.4, 30.4, 8.4, M.concrete);
  box(6, LEDGE_TOP, -8.4, 6.4, ductTop, -6.4, M.concrete);
  box(6, LEDGE_TOP, -4.6, 6.4, ductTop, 8.4, M.concrete);
  box(6.4, LEDGE_TOP - 0.4, -8, 9.4, LEDGE_TOP, -4.2, M.steel, { cast: true });
  box(6.4, LEDGE_TOP, -4.32, 9.4, LEDGE_TOP + 0.02, -4.2, M.hazard, { solid: false, camera: false });
  box(9.28, LEDGE_TOP, -8, 9.4, LEDGE_TOP + 0.02, -4.2, M.hazard, { solid: false, camera: false });
  for (const z of [-7.8, -4.4]) box(9.2, KILLER_FLOOR, z - 0.1, 9.4, LEDGE_TOP - 0.4, z + 0.1, M.trim, { solid: false, camera: false });
  const zip = buildZipline(scene, root, add, M);
  box(6.4, 9, -8, PIT_EDGE, KILLER_FLOOR, 8, M.floor);
  box(PIT_EDGE - 0.4, KILLER_FLOOR, -8, PIT_EDGE, KILLER_FLOOR + 0.02, 8, M.hazard, { solid: false, camera: false });
  box(PIT_EDGE, 8.6, -8, 40, 9, 8, M.goo);
  box(40, 9, -8, 44, ARENA_FLOOR, 8, M.steel);
  box(6, 9, -8.4, 44.4, 30.4, -8, M.concrete);
  box(6, 9, 8, 40.6, 30.4, 8.4, M.concrete);
  box(43.4, 9, 8, 44.4, 30.4, 8.4, M.concrete);
  box(40.6, 9, 8, 43.4, ARENA_FLOOR, 8.4, M.concrete);
  box(40.6, ARENA_FLOOR + 2.8, 8, 43.4, 30.4, 8.4, M.concrete);
  box(44, 9, -8, 44.4, 30.4, 8, M.concrete);
  box(6, 30, -8.4, 44.4, 30.4, 8.4, M.ceiling);
  box(9.5, KILLER_FLOOR, 7.94, 12.5, KILLER_FLOOR + 3, 8, M.dark, { solid: false });
  sign(t("prison.danger"), 11, KILLER_FLOOR + 3.9, 7.93, 0, 4.4, 0.8, "#ffd23f", "#2b1405");
  for (const [x0, x1, z0, z1, top, look] of OBBY) {
    box(x0, 9, z0, x1, top, z1, look === "crate" ? M.crate : M.steel, { cast: true });
    box(x0, top, z0, x1, top + 0.02, z0 + 0.12, M.hazard, { solid: false, camera: false });
  }
  for (const x of [10, 20, 30, 40]) lamp(x, 30, 0, 2.4, 0.8);
  marker(KILLER_LEVEL, SPAWNS[KILLER_LEVEL].x, KILLER_FLOOR, SPAWNS[KILLER_LEVEL].z);

  // 8. The vending room through the door off the far ledge, and the kitchen corridor that runs
  // along the arena's wall to its side door. Floor at ARENA_FLOOR, ceiling 4.2 above.
  const roomTop = ARENA_FLOOR + 4.2;
  box(34, ARENA_FLOOR - 0.4, 8.4, 44, ARENA_FLOOR, 16.4, M.tile);
  box(44, ARENA_FLOOR - 0.4, 12.4, 64.4, ARENA_FLOOR, 16.4, M.tile);
  box(33.6, ARENA_FLOOR, 8.4, 34, roomTop, 16.4, M.kitchen);
  box(33.6, ARENA_FLOOR, 16.4, 64.4, roomTop, 16.8, M.kitchen);
  box(64, ARENA_FLOOR, 12.4, 64.4, roomTop, 16.4, M.kitchen);
  box(33.6, roomTop, 8.4, 44, roomTop + 0.4, 16.8, M.ceiling);
  box(44, roomTop, 12.4, 64.4, roomTop + 0.4, 16.8, M.ceiling);
  // The vending machine against the west wall, its lit front full of cans facing the room.
  box(34, ARENA_FLOOR, 9.5, 35.1, ARENA_FLOOR + 2.2, 11.3, M.vend, { cast: true });
  box(35.1, ARENA_FLOOR + 0.85, 9.7, 35.13, ARENA_FLOOR + 2.0, 11.1, M.vendGlow, { solid: false, camera: false });
  box(35.1, ARENA_FLOOR + 0.25, 9.9, 35.16, ARENA_FLOOR + 0.55, 10.9, M.dark, { solid: false, camera: false });
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const can = MeshBuilder.CreateCylinder("prisonCan", { height: 0.22, diameter: 0.13, tessellation: 10 }, scene);
      can.position.set(35.2, ARENA_FLOOR + 1.07 + row * 0.33, 9.95 + col * 0.3);
      add(can, M.cans[(row + col) % M.cans.length], { camera: false });
    }
  }
  sign(t("prison.soda"), 35.17, ARENA_FLOOR + 2.45, 10.4, -Math.PI / 2, 1.7, 0.4, "#ff2d6f", "#ffffff");
  // The chef's door in the corner, and the kitchen: counters, stoves, and the arena's side door.
  box(33.96, ARENA_FLOOR, 13.6, 34.02, ARENA_FLOOR + 2.6, 15.6, M.dark, { solid: false });
  sign(t("prison.kitchen"), 50, ARENA_FLOOR + 3.2, 16.37, 0, 3, 0.6, "#2f3640", "#ffffff");
  for (const [x0, x1, z0, z1] of COUNTERS) {
    box(x0, ARENA_FLOOR, z0, x1, ARENA_FLOOR + 0.75, z1, M.steel, { cast: true });
    box(x0 + 0.15, ARENA_FLOOR + 0.75, z0 + 0.3, x1 - 0.15, ARENA_FLOOR + 0.78, z0 + 1, M.dark, { solid: false, camera: false });
  }
  box(59, ARENA_FLOOR, 12.36, 62.5, ARENA_FLOOR + 0.02, 12.6, M.hazard, { solid: false, camera: false });
  for (const [x, z] of [
    [39, 12.4],
    [48, 14.4],
    [55, 14.4],
    [61, 14.4],
  ]) lamp(x, roomTop, z, 2, 0.6);
  marker(VENDING_LEVEL, SPAWNS[VENDING_LEVEL].x, ARENA_FLOOR, SPAWNS[VENDING_LEVEL].z);

  // 9. The warden's arena: a stage for the giant capybara, crates for cover, and the exit gate.
  box(44.4, ARENA_FLOOR - 0.4, -12.4, 78.4, ARENA_FLOOR, 12.4, M.arena);
  box(44.4, ARENA_FLOOR, -12.4, 78, 34.4, -12, M.arenaWall);
  box(44.4, ARENA_FLOOR, 12, 59, 34.4, 12.4, M.arenaWall);
  box(62.5, ARENA_FLOOR, 12, 78, 34.4, 12.4, M.arenaWall);
  box(59, ARENA_FLOOR + 3, 12, 62.5, 34.4, 12.4, M.arenaWall);
  box(44, ARENA_FLOOR, -12.4, 44.4, 34.4, -8, M.arenaWall);
  box(44, ARENA_FLOOR, 8, 44.4, 34.4, 12.4, M.arenaWall);
  box(44, 30.4, -8, 44.4, 34.4, 8, M.arenaWall);
  box(78, ARENA_FLOOR, -12.4, 78.4, 34.4, -2, M.arenaWall);
  box(78, ARENA_FLOOR, 2, 78.4, 34.4, 12.4, M.arenaWall);
  box(78, 25.8, -2, 78.4, 34.4, 2, M.arenaWall);
  box(44, 34, -12.4, 78.4, 34.4, 12.4, M.ceiling);
  box(68, ARENA_FLOOR, -9, 76, STAGE_TOP, 9, M.steel);
  for (const [x0, x1, z0, z1] of COVER) box(x0, ARENA_FLOOR, z0, x1, ARENA_FLOOR + 1.4, z1, M.crate, { cast: true });
  box(78.4, ARENA_FLOOR - 0.4, -2.4, 84.4, ARENA_FLOOR, 2.4, M.arena);
  box(78.4, ARENA_FLOOR, -2.4, 84, 25.8, -2, M.arenaWall);
  box(78.4, ARENA_FLOOR, 2, 84, 25.8, 2.4, M.arenaWall);
  box(78.4, 25.8, -2.4, 84.4, 26.2, 2.4, M.arenaWall);
  box(84, ARENA_FLOOR, -2.4, 84.4, 25.8, 2.4, M.exit);
  sign(t("prison.exit"), 77.95, 26.8, 0, Math.PI / 2, 2.4, 0.7, "#2f8f46", "#ffffff");
  for (const x of [50, 60, 70]) for (const z of [-6, 6]) lamp(x, 34, z, 3, 0.8);
  marker(BOSS_LEVEL, 46.8, ARENA_FLOOR, 3);

  for (const group of groups.values()) {
    const mesh = Mesh.MergeMeshes(group.meshes, true, true);
    mesh.name = `prison-${group.look.name}`;
    mesh.material = group.look;
    mesh.isPickable = group.camera;
    mesh.metadata = group.camera ? { blocksCamera: true } : null;
    mesh.receiveShadows = true;
    owned.push(mesh);
    if (group.cast) casters.push(mesh);
  }
  const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
  body.shape = container;
  owned.push(body);

  const squishies = WALL_SQUISHIES.map((spec, index) => {
    const pad = createSquishy(
      scene,
      { id: `prison-squishy-${index}`, kind: "firm", role: "pad", seed: index * 31 + 7, ...spec },
      origin.x + spec.x,
      origin.y + spec.top - PAD_TOP,
      origin.z + spec.z,
    );
    audio.attachPad(pad).catch((error) => console.warn("Pad sound failed", error));
    casters.push(pad.mesh);
    return pad;
  });

  const gate = buildGate(scene, root, M.bars);
  casters.push(...gate.meshes);
  const grates = GRATES.map((spec) => buildGrate(scene, root, M.trim, spec));
  for (const grate of grates) grate.close();
  const police = [0, 1].map((index) => createActor(scene, root, "police", POLICE_SIZE, `prisonPolice${index}`));
  const killer = createActor(scene, root, "killer", KILLER_SIZE, "killerCapybara");
  const chef = createActor(scene, root, "chef", CHEF_SIZE, "chefCapybara");
  const boss = createBoss(scene, root);
  casters.push(...police.map((officer) => officer.body), killer.body, chef.body, boss.body, zip.trolley);
  for (const mesh of casters) graphics.shadow.addShadowCaster(mesh, true);
  const sirens = [new Color3(1, 0.08, 0.06), new Color3(0.1, 0.35, 1)].map((color, index) => {
    const look = new StandardMaterial(`prisonSiren${index}`, scene);
    look.diffuseColor = color.scale(0.6);
    look.specularColor = Color3.Black();
    look.metadata = { on: color.clone(), off: color.scale(0.15) };
    owned.push(look);
    return look;
  });
  for (const officer of police) {
    sirens.forEach((look, index) => {
      const bulb = MeshBuilder.CreateSphere("prisonSirenBulb", { diameter: 0.09, segments: 8 }, scene);
      bulb.parent = officer.body;
      bulb.position.set(index ? 0.07 : -0.07, POLICE_CAP_TOP.y + 0.02, POLICE_CAP_TOP.z);
      bulb.material = look;
      bulb.isPickable = false;
    });
    officer.route = createRoute(POLICE_ROUTE);
  }
  killer.route = createRoute(KILLER_ROUTE);
  const door = killer.route.project(11, KILLER_FLOOR, 7.6);
  killer.door = { s: door.s, side: door.side, facing: Math.PI };
  chef.route = createRoute(CHEF_ROUTE);
  const chefDoor = chef.route.project(34.6, ARENA_FLOOR, 14.6);
  chef.door = { s: chefDoor.s, side: chefDoor.side, facing: Math.PI / 2 };
  const shots = createShots(scene, root, boss);
  owned.push(shots);

  return {
    origin: origin.clone(),
    squishies,
    standing: null,
    police,
    killer,
    chef,
    boss,
    gate,
    grates,
    zip,
    policeRoute: police[0].route,
    killerRoute: killer.route,
    chefRoute: chef.route,
    throwMandarin: shots.throwMandarin,
    fireShot: shots.fireShot,
    stepShots: shots.step,
    clearShots: shots.clear,
    /**
     * True when nothing stands between `target` (an actor's face) and `eye`, in prison space: no
     * wall, bars, squishy, or other capybara, with a little room behind the camera too.
     */
    viewClear(actor, eye, target) {
      const from = target.add(origin);
      const way = eye.subtract(target);
      const length = way.length() + 0.25;
      way.normalize();
      const blocks = (mesh) =>
        mesh.metadata?.blocksCamera === true || mesh.name === "prison-prison-bars" || squishies.some((pad) => pad.mesh === mesh);
      if (scene.pickWithRay(new Ray(from, way, length), blocks)?.hit) return false;
      for (const other of [...police, killer, chef]) {
        if (other === actor || !other.body.isEnabled()) continue;
        const middle = other.position.add(new Vector3(0, 0.5 * other.size, 0));
        const along = Math.max(0, Math.min(length, Vector3.Dot(middle.subtract(target), way)));
        const closest = target.add(way.scale(along));
        if (Vector3.Distance(middle, closest) < 0.55 * other.size + 0.2) return false;
      }
      return true;
    },
    animate(dt, time) {
      for (const pad of squishies) {
        pad.loaded = pad === this.standing;
        stepSquish(pad, dt);
      }
      const flash = Math.sin(time * 12) > 0;
      sirens[0].emissiveColor.copyFrom(flash ? sirens[0].metadata.on : sirens[0].metadata.off);
      sirens[1].emissiveColor.copyFrom(flash ? sirens[1].metadata.off : sirens[1].metadata.on);
      for (const mesh of props) {
        if (mesh.name === "prison-cellmate") mesh.position.y = Math.abs(Math.sin(time * 5)) * 0.15;
      }
      for (const inmate of cellInmates) {
        const t = time + inmate.phase;
        if (inmate.pace) {
          inmate.mesh.position.x = -23.6 + Math.sin(t * 0.9) * 1.3;
          inmate.mesh.position.y = inmate.base + Math.abs(Math.sin(t * 7)) * 0.05;
          inmate.mesh.rotation.y = Math.cos(t * 0.9) > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          inmate.mesh.position.y = inmate.base + Math.abs(Math.sin(t * 4.5)) * 0.3;
        }
      }
      gate.update(dt);
      for (const grate of grates) grate.update(dt);
      boss.animate(dt);
      shots.spin(dt);
    },
    dispose() {
      for (const mesh of casters) graphics.shadow.removeShadowCaster(mesh, true);
      for (const pad of squishies) {
        audio.detachPad(pad);
        discardPad(pad);
      }
      gate.dispose();
      for (const grate of grates) grate.dispose();
      for (const item of owned.reverse()) item.dispose();
      root.dispose(false, false);
    },
  };
}

/**
 * A capybara that runs after you along a route (see `createRoute`). It waits out of sight until
 * released, then keeps to the route's lane and heads for the spot nearest you.
 */
function createActor(scene, root, look, size, name) {
  const node = new TransformNode(name, scene);
  node.parent = root;
  const body = buildCapybara(scene, look).clone(`${name}Body`, node);
  body.isVisible = true;
  body.isPickable = false;
  body.scaling.setAll(size);
  node.setEnabled(false);
  const goal = new Vector3();
  const reach = 0.55 * size;
  let s = 0;
  let side = 0;
  let delay = 0;
  let moving = false;
  let clock = 0;
  return {
    body,
    route: null,
    /** The spot it comes out at. Null means the start of its route. */
    door: null,
    out: false,
    wait: 0,
    hide() {
      this.out = false;
      delay = 0;
      node.setEnabled(false);
    },
    /** Comes out of its door after `after` seconds. */
    release(after) {
      this.out = true;
      delay = after;
      const start = this.door ?? this.route.start;
      s = start.s;
      side = start.side;
      this.route.at(s, side, goal);
      node.position.copyFrom(goal);
      node.rotation.y = start.facing;
    },
    size,
    /** Where it stands, in prison space. */
    position: node.position,
    /** Stands still facing `yaw`: the pose for the caught close-up. */
    faceYaw(yaw) {
      node.rotation.y = yaw;
      body.position.y = 0;
      body.rotation.z = 0;
    },
    /**
     * Its face (`target`) and a spot right in front of its nose (`eye`) for when it faces `yaw`, in
     * prison space. Close enough that the face fills most of the close-up.
     */
    closeUp(eye, target, yaw = node.rotation.y) {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      // Head middle and snout tip, along its nose, in the unscaled model.
      const face = look === "police" ? { y: 0.74, z: 0.18, tip: 0.35 } : { y: 0.66, z: 0.55, tip: 0.79 };
      target.set(node.position.x + fx * face.z * size, node.position.y + face.y * size, node.position.z + fz * face.z * size);
      const back = (face.tip - face.z) * size + 0.6;
      eye.set(target.x + fx * back, target.y + 0.04 * size, target.z + fz * back);
    },
    /** Moves toward `target` (a route spot). True when it has caught you. */
    step(dt, target, spread, speed) {
      if (!this.out) return false;
      if (delay > 0) {
        delay -= dt;
        if (delay > 0) return false;
      }
      node.setEnabled(true);
      clock += dt;
      const ds = target.s - s;
      const dside = target.side + spread * Math.min(1, Math.abs(ds) / 3) - side;
      const gap = Math.hypot(ds, dside);
      const move = Math.min(gap, speed * dt);
      moving = gap > 0.05;
      if (moving) {
        s += (ds / gap) * move;
        side += (dside / gap) * move;
      }
      this.route.at(s, side, goal);
      const dx = goal.x - node.position.x;
      const dz = goal.z - node.position.z;
      node.position.x += dx * Math.min(1, dt * 14);
      node.position.z += dz * Math.min(1, dt * 14);
      node.position.y = goal.y;
      if (Math.hypot(dx, dz) > 0.01) {
        const want = Math.atan2(dx, dz);
        node.rotation.y += wrap(want - node.rotation.y) * Math.min(1, dt * 10);
      }
      body.position.y = moving ? Math.abs(Math.sin(clock * 14)) * 0.08 * size : Math.abs(Math.sin(clock * 6)) * 0.05;
      body.rotation.z = moving ? Math.sin(clock * 14) * 0.07 : 0;
      const near = Math.hypot(target.x - node.position.x, target.z - node.position.z) < reach + 0.3;
      return near && Math.abs(target.y - node.position.y) < 0.8;
    },
  };
}

/**
 * A path along the floor. `project` finds the spot on it nearest a point (height counts triple, so
 * the flight above never steals you from the one you're on) and `at` turns a spot back into a point.
 * A spot is how far along the path it is (`s`) and how far to its left or right (`side`).
 */
function createRoute(points) {
  const segments = [];
  let total = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const flat = Math.hypot(dx, dz);
    const length = Math.hypot(dx, dy, dz);
    segments.push({ a, dx, dy, dz, length, start: total, px: dz / flat, pz: -dx / flat, w: a.w ?? 1 });
    total += length;
  }
  const first = segments[0];
  const spot = { s: 0, side: 0, x: 0, y: 0, z: 0 };
  return {
    start: { s: 0, side: 0, facing: Math.atan2(first.dx, first.dz) },
    project(x, y, z) {
      let best = Infinity;
      for (const segment of segments) {
        const vx = x - segment.a.x;
        const vy = (y - segment.a.y) * 3;
        const vz = z - segment.a.z;
        const ey = segment.dy * 3;
        const ee = segment.dx * segment.dx + ey * ey + segment.dz * segment.dz;
        const u = Math.max(0, Math.min(1, (vx * segment.dx + vy * ey + vz * segment.dz) / ee));
        const qx = vx - segment.dx * u;
        const qy = vy - ey * u;
        const qz = vz - segment.dz * u;
        const side = qx * segment.px + qz * segment.pz;
        const over = Math.max(0, Math.abs(side) - segment.w);
        const d = qx * qx + qz * qz - side * side + over * over + qy * qy;
        if (d < best) {
          best = d;
          spot.s = segment.start + u * segment.length;
          spot.side = Math.max(-segment.w, Math.min(segment.w, side));
        }
      }
      spot.x = x;
      spot.y = y;
      spot.z = z;
      return spot;
    },
    at(s, side, out) {
      let segment = segments[segments.length - 1];
      for (const each of segments) {
        if (s <= each.start + each.length) {
          segment = each;
          break;
        }
      }
      const u = Math.max(0, Math.min(1, (s - segment.start) / segment.length));
      const lateral = Math.max(-segment.w, Math.min(segment.w, side));
      out.set(
        segment.a.x + segment.dx * u + segment.px * lateral,
        segment.a.y + segment.dy * u,
        segment.a.z + segment.dz * u + segment.pz * lateral,
      );
      return out;
    },
  };
}

/** The warden: a giant capybara pacing its stage, turning to face you, and toppling when beaten. */
function createBoss(scene, root) {
  const node = new TransformNode("wardenCapybara", scene);
  node.parent = root;
  const body = buildCapybara(scene, "warden").clone("wardenCapybaraBody", node);
  body.isVisible = true;
  body.isPickable = false;
  body.scaling.setAll(BOSS_SIZE);
  const mouth = new Vector3();
  const middle = new Vector3();
  let flinch = 0;
  let fall = -1;
  return {
    body,
    mouth,
    /** Middle of its body, for blaster hits. */
    middle,
    radius: 0.62 * BOSS_SIZE,
    restore() {
      fall = -1;
      flinch = 0;
      node.rotation.set(0, -Math.PI / 2, 0);
      node.position.set(BOSS_X, STAGE_TOP, 0);
      body.visibility = 1;
      this.place();
    },
    place() {
      const yaw = node.rotation.y;
      mouth.set(
        node.position.x + Math.sin(yaw) * 0.7 * BOSS_SIZE,
        node.position.y + 0.6 * BOSS_SIZE,
        node.position.z + Math.cos(yaw) * 0.7 * BOSS_SIZE,
      );
      middle.set(node.position.x, node.position.y + 0.5 * BOSS_SIZE, node.position.z);
    },
    walk(time, target) {
      if (fall >= 0) return;
      node.position.z = Math.sin(time * 0.45) * 6;
      const want = Math.atan2(target.x - node.position.x, target.z - node.position.z);
      node.rotation.y += wrap(want - node.rotation.y) * 0.08;
      this.place();
    },
    flinch() {
      flinch = 0.3;
    },
    topple() {
      fall = 0;
    },
    animate(dt) {
      flinch = Math.max(0, flinch - dt);
      const pulse = 1 + Math.sin((flinch / 0.3) * Math.PI) * 0.12;
      body.scaling.set(BOSS_SIZE * pulse, BOSS_SIZE / pulse, BOSS_SIZE * pulse);
      if (fall >= 0) {
        fall = Math.min(1.5, fall + dt);
        const k = Math.min(1, fall / 0.9);
        node.rotation.z = (Math.PI / 2) * k * k;
        node.position.y = STAGE_TOP + 0.3 * BOSS_SIZE * k;
      }
    },
  };
}

/** The bars across the exit behind the warden. They lift away once the warden is beaten. */
function buildGate(scene, root, look) {
  const parts = [];
  for (let z = -1.8; z <= 1.81; z += 0.3) {
    const bar = MeshBuilder.CreateCylinder("prisonGateBar", { height: 4, diameter: 0.1, tessellation: 8 }, scene);
    bar.position.set(0, 2, z);
    parts.push(bar);
  }
  for (const y of [0.15, 2, 3.85]) {
    const rail = MeshBuilder.CreateBox("prisonGateRail", { width: 0.12, height: 0.1, depth: 4 }, scene);
    rail.position.set(0, y, 0);
    parts.push(rail);
  }
  const gate = Mesh.MergeMeshes(parts, true, true);
  gate.name = "prisonGate";
  gate.material = look;
  gate.parent = root;
  gate.isPickable = false;
  const rest = new Vector3(78.2, ARENA_FLOOR, 0);
  gate.position.copyFrom(rest);
  let body = null;
  let lifting = false;
  const close = () => {
    lifting = false;
    gate.position.copyFrom(rest);
    if (body) return;
    gate.computeWorldMatrix(true);
    body = new PhysicsBody(gate, PhysicsMotionType.STATIC, false, scene);
    body.shape = new PhysicsShapeBox(new Vector3(0, 2, 0), Quaternion.Identity(), new Vector3(0.3, 4, 4), scene);
  };
  const free = () => {
    body?.shape?.dispose();
    body?.dispose();
    body = null;
  };
  return {
    meshes: [gate],
    close,
    open() {
      free();
      lifting = true;
    },
    update(dt) {
      if (lifting && gate.position.y < rest.y + 4.2) gate.position.y += dt * 2.2;
    },
    dispose() {
      free();
      gate.dispose();
    },
  };
}

/**
 * The zipline: a cable from ZIP_FROM past ZIP_TO to its post on the floor, and the handle that rides
 * it. `place(s)` puts the handle `s` along the cable and returns that cable point, in prison space.
 */
function buildZipline(scene, root, add, M) {
  const from = new Vector3(ZIP_FROM.x, ZIP_FROM.y, ZIP_FROM.z);
  const to = new Vector3(ZIP_TO.x, ZIP_TO.y, ZIP_TO.z);
  const way = to.subtract(from);
  const length = way.length();
  way.normalize();
  const end = to.add(way.scale(1.2));
  const cable = MeshBuilder.CreateCylinder("prisonZipCable", { height: Vector3.Distance(from, end) + 0.4, diameter: 0.05, tessellation: 6 }, scene);
  cable.position.copyFrom(from.add(end).scaleInPlace(0.5));
  cable.rotationQuaternion = new Quaternion();
  Quaternion.FromUnitVectorsToRef(Vector3.Up(), way, cable.rotationQuaternion);
  add(cable, M.bars, { camera: false });
  // A bracket out of the wall holds the top end, so nothing stands between the camera and you at the start.
  const back = from.subtract(way.scale(0.2));
  const bracket = MeshBuilder.CreateBox("prisonZipBracket", { width: back.x - 6.4, height: 0.12, depth: 0.12 }, scene);
  bracket.position.set((back.x + 6.4) / 2, back.y + 0.06, back.z);
  add(bracket, M.trim, { camera: false });
  const post = MeshBuilder.CreateBox("prisonZipPost", { width: 0.14, height: end.y + 0.3 - KILLER_FLOOR, depth: 0.14 }, scene);
  post.position.set(end.x, (end.y + 0.3 + KILLER_FLOOR) / 2, end.z);
  add(post, M.trim, { camera: false });

  const parts = [];
  const piece = (mesh, y) => {
    mesh.position.y = y;
    parts.push(mesh);
    return mesh;
  };
  piece(MeshBuilder.CreateBox("prisonZipWheel", { width: 0.16, height: 0.2, depth: 0.4 }, scene), 0.02);
  piece(MeshBuilder.CreateCylinder("prisonZipRod", { height: 0.42, diameter: 0.035, tessellation: 6 }, scene), -0.25);
  piece(MeshBuilder.CreateCylinder("prisonZipBar", { height: 0.7, diameter: 0.05, tessellation: 8 }, scene), -0.46).rotation.z = Math.PI / 2;
  const trolley = Mesh.MergeMeshes(parts, true, true);
  trolley.name = "prisonZipTrolley";
  trolley.material = M.hazard;
  trolley.parent = root;
  trolley.isPickable = false;
  const heading = Math.atan2(way.x, way.z);
  trolley.rotation.y = heading;
  const point = new Vector3();
  return {
    length,
    heading,
    trolley,
    place(s) {
      point.copyFrom(way).scaleInPlace(Math.max(0, Math.min(length, s))).addInPlace(from);
      trolley.position.copyFrom(point);
      return point;
    },
  };
}

/**
 * A metal cover over a vent opening, hinged on one side. Closed it blocks the way; opening it
 * swings it aside and takes its collider away.
 */
function buildGrate(scene, root, look, { x, y, z, hinge, swing }) {
  const width = 1.8;
  const height = 2.1;
  const parts = [];
  const bar = (w, h, d, px, py, pz) => {
    const part = MeshBuilder.CreateBox("prisonGratePart", { width: w, height: h, depth: d }, scene);
    part.position.set(px, py, pz);
    parts.push(part);
  };
  const off = z - hinge;
  bar(0.07, 0.1, width, 0, 0.05, off);
  bar(0.07, 0.1, width, 0, height - 0.05, off);
  bar(0.07, height, 0.1, 0, height / 2, off - width / 2 + 0.05);
  bar(0.07, height, 0.1, 0, height / 2, off + width / 2 - 0.05);
  for (let i = 1; i < 6; i += 1) bar(0.05, 0.06, width, 0, (height * i) / 6, off);
  for (let i = 1; i < 6; i += 1) bar(0.04, height, 0.05, 0, height / 2, off - width / 2 + (width * i) / 6);
  const mesh = Mesh.MergeMeshes(parts, true, true);
  mesh.name = "prisonGrate";
  mesh.material = look;
  mesh.isPickable = false;
  const pivot = new TransformNode("prisonGrateHinge", scene);
  pivot.parent = root;
  pivot.position.set(x, y, hinge);
  mesh.parent = pivot;
  const holder = new TransformNode("prisonGrateCollider", scene);
  holder.parent = root;
  holder.position.set(x, y + height / 2, z);
  const center = holder.position.clone();
  let body = null;
  let opening = false;
  const free = () => {
    body?.shape?.dispose();
    body?.dispose();
    body = null;
  };
  return {
    meshes: [mesh],
    center,
    get closed() {
      return body !== null;
    },
    close() {
      opening = false;
      pivot.rotation.y = 0;
      if (body) return;
      holder.computeWorldMatrix(true);
      body = new PhysicsBody(holder, PhysicsMotionType.STATIC, false, scene);
      body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(0.14, height, width), scene);
    },
    open() {
      free();
      opening = true;
    },
    update(dt) {
      if (opening) pivot.rotation.y += (swing - pivot.rotation.y) * Math.min(1, dt * 6);
    },
    dispose() {
      free();
      pivot.dispose();
      holder.dispose();
    },
  };
}

/** Mandarins the warden throws at you and your blaster shots. */
function createShots(scene, root, boss) {
  const peel = plainMaterial(scene, "prisonMandarin", "#ff8a1c", 0.35);
  const leaf = plainMaterial(scene, "prisonMandarinLeaf", "#3f9a3a", 0.2);
  const fruit = MeshBuilder.CreateSphere("prisonMandarinFruit", { diameter: 0.55, segments: 12 }, scene);
  fruit.scaling.y = 0.85;
  fruit.material = peel;
  const sprig = MeshBuilder.CreateSphere("prisonMandarinSprig", { diameter: 0.2, segments: 6 }, scene);
  sprig.scaling.set(1, 0.3, 0.6);
  sprig.position.y = 0.25;
  sprig.material = leaf;
  const mandarin = Mesh.MergeMeshes([fruit, sprig], true, true, undefined, false, true);
  mandarin.name = "prisonMandarin";
  mandarin.isVisible = false;
  mandarin.isPickable = false;
  const zap = plainMaterial(scene, "prisonZap", "#fff27a", 1);
  const bolt = MeshBuilder.CreateSphere("prisonBolt", { diameter: 0.22, segments: 8 }, scene);
  bolt.scaling.z = 2.4;
  bolt.material = zap;
  bolt.isVisible = false;
  bolt.isPickable = false;

  const flying = [];
  const inCover = (p) =>
    COVER.some(([x0, x1, z0, z1]) => p.x > x0 - 0.15 && p.x < x1 + 0.15 && p.z > z0 - 0.15 && p.z < z1 + 0.15 && p.y < ARENA_FLOOR + 1.55);
  const outside = (p) => p.x < 44.4 || p.x > 78 || Math.abs(p.z) > 12 || p.y < ARENA_FLOOR || p.y > 34;

  const launch = (source, from, toward, speed, mine) => {
    const mesh = source.createInstance(mine ? "prisonShot" : "prisonThrow");
    mesh.parent = root;
    mesh.isPickable = false;
    mesh.position.copyFrom(from);
    const velocity = toward.subtract(from).normalize().scaleInPlace(speed);
    mesh.rotation.y = Math.atan2(velocity.x, velocity.z);
    flying.push({ mesh, velocity, mine, life: 4 });
  };

  return {
    throwMandarin(from, toward, speed) {
      launch(mandarin, from, toward, speed, false);
    },
    /** A blaster shot from `center` the way `facing` points, curving onto the warden when roughly in front. */
    fireShot(center, facing) {
      const from = new Vector3(center.x + Math.sin(facing) * 0.5, center.y + 0.2, center.z + Math.cos(facing) * 0.5);
      const toBoss = Math.atan2(boss.middle.x - from.x, boss.middle.z - from.z);
      const ahead = new Vector3(from.x + Math.sin(facing) * 10, from.y, from.z + Math.cos(facing) * 10);
      launch(bolt, from, Math.abs(wrap(toBoss - facing)) < AUTO_AIM ? boss.middle : ahead, SHOT_SPEED, true);
    },
    /** Moves everything in flight. Says whether a mandarin hit you (when `hittable`) or a shot hit the warden. */
    step(dt, center, hittable) {
      const hits = { player: false, boss: false };
      for (let i = flying.length - 1; i >= 0; i -= 1) {
        const shot = flying[i];
        shot.life -= dt;
        shot.mesh.position.addInPlace(shot.velocity.scale(dt));
        const p = shot.mesh.position;
        let gone = shot.life <= 0 || outside(p) || inCover(p);
        if (!gone && shot.mine && Vector3.Distance(p, boss.middle) < boss.radius) {
          hits.boss = true;
          gone = true;
        }
        if (!gone && !shot.mine && hittable && Vector3.Distance(p, center) < 0.7) {
          hits.player = true;
          gone = true;
        }
        if (gone) {
          shot.mesh.dispose();
          flying.splice(i, 1);
        }
      }
      return hits;
    },
    spin(dt) {
      for (const shot of flying) if (!shot.mine) shot.mesh.rotation.x += dt * 9;
    },
    clear() {
      for (const shot of flying) shot.mesh.dispose();
      flying.length = 0;
    },
    dispose() {
      this.clear();
      mandarin.dispose();
      bolt.dispose();
      for (const look of [peel, leaf, zap]) look.dispose();
    },
  };
}

function wrap(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
