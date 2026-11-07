import { COSTUMES } from "./costumes.js";
import { DANCE_LENGTH, DANCES } from "./dances.js";
import { FACES } from "./faces.js";
import { createFigure } from "./figure.js";
import { t } from "./i18n.js";
import { AGES, BODIES, cleanLook, HAIR_STYLES, HAIR_SWATCHES, SKIN_SWATCHES } from "./look.js";
import { OUTFITS } from "./outfits.js";
import { PADS_PER_LEVEL } from "./course.js";

/**
 * The regulars. Their ids, names, and looks come from fixed seeds, so they are the same on
 * every visit and a friend you add is still there next time. `true` marks the ten who are good
 * at the course; the other ten fumble their jumps.
 */
const REGULARS = [
  ["SkyBunny22", true],
  ["mochi_luv", false],
  ["PuddingPop7", false],
  ["LavaLeaper", true],
  ["sunnyhops", false],
  ["Bubblegum_Bea", true],
  ["CloudyKai", false],
  ["taffy.twirl", true],
  ["NoodleNinja", true],
  ["peachy_pia", false],
  ["StarSprinkle9", true],
  ["marshmeowlow", false],
  ["BouncyBen04", false],
  ["gumdrop_gal", true],
  ["WaffleWiz", false],
  ["HoppyHana", true],
  ["squishqueen", false],
  ["ZoomZoe11", true],
  ["biscuit_boi", false],
  ["JellyJumpJo", true],
];
const TRICKS = ["front", "back", "spin"];
/** Levels above (or below, when negative) yours where each one plays, in `REGULARS` order per skill. */
const GOOD_LANES = [1, 2, 3, 4, 5, 6, 2, 3, 4, -1];
const BAD_LANES = [-1, -2, -3, -4, -5, -2, -3, -1, 1, 2];
const WALK_SPEED = 2.2;
/** A friend hops back once it is this many pads past the farthest it likes to be ahead of you. */
const AHEAD_SLACK = 2;
/** A friend further than this from you pops over instead of hopping all the way. */
const FRIEND_GAP = 5;
const FALL_SECONDS = 1.1;
const GRAVITY = 22;
/** Seconds between any two lines from the whole crowd, so twenty of them don't flood the chat. */
const CHAT_GAP = 9;
const LINES = {
  common: ["chatter.squishy", "chatter.race", "chatter.wheee", "chatter.nice", "chatter.go", "chatter.view"],
  good: ["chatter.easy", "chatter.catchMe", "chatter.speedy"],
  bad: ["chatter.hard", "chatter.how", "chatter.almost"],
  fell: ["chatter.fell", "chatter.again", "chatter.lava"],
};
/** What you said picks the kind of answer, first match wins. Anything else gets a friendly "chat" line. */
const REPLY_KINDS = [
  [/\b(bye+|goodbye|cya|see (ya|you|u)|gtg|gotta go)\b/, "bye"],
  [/\b(how are (you|u)|how r u|hru|wbu)\b/, "howAreYou"],
  [/\b(what'?s (your|ur) name|who (are|r) (you|u))\b/, "name"],
  [/\b(hi+|hello+|hey+|hiya|yo|sup|heyo)\b/, "hi"],
  [/\b(thanksgiving|thankful|turkey|gobble|pie)\b/, "thanksgiving"],
  [/\b(thanks|thank (you|u)|thx|ty)\b/, "thanks"],
  [/\b(friends?|bff)\b/, "friend"],
  [/\b(race|follow|come|wait)\b/, "race"],
  [/\b(help|how|hard|stuck|can'?t)\b/, "help"],
  [/\b(lol|lmao|haha+|hehe+|xd)\b/, "laugh"],
  [/\b(christmas|xmas|snow|santa|merry)\b/, "christmas"],
  [/\b(valentines?|valentine'?s|cupid|hearts?|be mine)\b/, "valentines"],
  [/\b(gg|nice|cool|love|cute|pretty|awesome|great)\b/, "nice"],
  [/\?\s*$/, "question"],
];
const REPLIES = {
  hi: ["reply.hi.1", "reply.hi.2", "reply.hi.3"],
  bye: ["reply.bye.1", "reply.bye.2"],
  howAreYou: ["reply.howAreYou.1", "reply.howAreYou.2"],
  name: ["reply.name.1", "reply.name.2"],
  thanks: ["reply.thanks.1", "reply.thanks.2"],
  friend: ["reply.friend.1", "reply.friend.2"],
  race: ["reply.race.1", "reply.race.2", "reply.race.3"],
  help: ["reply.help.1", "reply.help.2", "reply.help.3"],
  laugh: ["reply.laugh.1", "reply.laugh.2", "reply.laugh.3"],
  christmas: ["reply.christmas.1", "reply.christmas.2", "reply.christmas.3"],
  thanksgiving: ["reply.thanksgiving.1", "reply.thanksgiving.2", "reply.thanksgiving.3"],
  valentines: ["reply.valentines.1", "reply.valentines.2", "reply.valentines.3"],
  nice: ["reply.nice.1", "reply.nice.2", "reply.nice.3"],
  question: ["reply.question.1", "reply.question.2", "reply.question.3"],
  chat: ["reply.chat.1", "reply.chat.2", "reply.chat.3", "reply.chat.4", "reply.chat.5"],
};
const letters = (text) => text.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Twenty players who are always in the room while you play online. Each climbs on its own
 * levels away from yours, out of sight. Friends come and play next to you instead, hopping pad
 * to pad along the real course on scripted arcs with no physics. Only the nearest ones are
 * drawn, built one per frame, and only a few cast shadows.
 */
export function createBots(scene, { graphics, course, onChat, onRoster }) {
  const regulars = makeRegulars();
  const tuning = { cull: 40, near: 18, shadows: 4, drawn: 10 };
  let runners = null;
  let friends = new Set();
  let enabled = false;
  let clock = 0;
  let quietUntil = 0;
  let ambientIn = 10;
  let shadowIn = 0;

  function speak(runner, kind, chance = 1) {
    if (clock < quietUntil || Math.random() > chance) return;
    quietUntil = clock + CHAT_GAP;
    runner.say(t(pick(LINES[kind])));
  }

  const present = () => runners?.filter((runner) => !runner.away) ?? [];

  return {
    tuning,
    get runners() {
      return runners ?? [];
    },
    get count() {
      return enabled ? regulars.length : 0;
    },
    setEnabled(on) {
      if (enabled === on) return;
      enabled = on;
      if (!on) for (const runner of runners ?? []) runner.setShown(false);
      onRoster?.();
    },
    players() {
      if (!enabled) return [];
      return regulars.map((regular, index) => ({
        peerId: null,
        id: regular.id,
        name: regular.name,
        look: regular.look,
        away: runners ? runners[index].away : false,
        level: runners?.[index].level ?? null,
      }));
    },
    /** Ids from Your friends. Those regulars come and play next to you. */
    setFriends(ids) {
      friends = new Set(ids);
    },
    isOnline(id) {
      return enabled && regulars.some((regular) => regular.id === id);
    },
    /**
     * Someone always answers when you chat, to what you said. Say a regular's name (or the start
     * of it, like "mochi") and that one answers; otherwise one playing next to you does, so the
     * bubble shows, or anyone in the room.
     */
    hear(text, from) {
      const here = present();
      if (!here.length) return;
      const said = text.toLowerCase();
      const words = said.split(/[^a-z]+/).filter((word) => word.length >= 4);
      const named = runners.find((runner) => {
        const name = letters(runner.regular.name);
        return letters(said).includes(name) || words.some((word) => name.startsWith(word));
      });
      const nearby = here.filter((runner) => runner.shown);
      const runner = named ?? pick(nearby.length ? nearby : here);
      const kind = REPLY_KINDS.find(([pattern]) => pattern.test(said))?.[1] ?? "chat";
      const line = t(pick(REPLIES[kind])).replace("{name}", from).replace("{me}", runner.regular.name);
      setTimeout(() => {
        if (!enabled) return;
        // Keeps the crowd's own chatter from talking over the answer.
        quietUntil = clock + CHAT_GAP;
        runner.say(line);
      }, 900 + Math.random() * 1200);
    },
    update(dt, camera, time, playerIndex) {
      if (!enabled) return;
      clock += dt;
      runners ??= regulars.map((regular) => createRunner(scene, graphics, course, regular, onChat, speak, playerIndex));
      let changed = false;
      for (const runner of runners) {
        changed = runner.setFriend(friends.has(runner.regular.id), playerIndex) || changed;
        changed = runner.tickAway(dt) || changed;
      }
      if (changed) onRoster?.();

      ambientIn -= dt;
      if (ambientIn <= 0) {
        ambientIn = 14 + Math.random() * 22;
        const here = present();
        if (here.length) {
          const runner = pick(here);
          speak(runner, Math.random() < 0.5 ? "common" : runner.skill.kind);
        }
      }

      const here = [];
      for (const runner of runners) {
        if (!runner.friend) {
          runner.roam(dt, playerIndex);
          runner.setShown(false);
          continue;
        }
        if (runner.away) {
          runner.setShown(false);
          continue;
        }
        runner.think(dt, playerIndex);
        const distance = Math.hypot(
          runner.pose.x - camera.position.x,
          runner.pose.y - camera.position.y,
          runner.pose.z - camera.position.z,
        );
        // Ones already drawn get a head start, so they don't flicker at the edge of the cut.
        here.push({ runner, distance, rank: distance * (runner.shown ? 0.75 : 1) });
      }
      // Only the nearest few are drawn, like real players elsewhere on the climb.
      here.sort((a, b) => a.rank - b.rank);
      const high = graphics.pipeline.bloomEnabled;
      const drawn = high ? tuning.drawn : Math.ceil(tuning.drawn * 0.6);
      let built = false;
      const shown = [];
      here.forEach(({ runner, distance }, rank) => {
        const wanted = rank < drawn && distance < tuning.cull;
        if (wanted && !runner.built && !built) {
          runner.build();
          built = true;
        }
        runner.setShown(wanted && runner.built);
        if (!runner.shown) return;
        runner.draw(dt, camera, time, distance > tuning.near);
        shown.push(runner);
      });

      shadowIn -= dt;
      if (shadowIn <= 0) {
        shadowIn = 0.5;
        // The Low setting is the one without bloom.
        const nearest = new Set(shown.slice(0, high ? tuning.shadows : 0));
        for (const runner of runners) runner.setShadow(nearest.has(runner));
      }
    },
  };
}

function createRunner(scene, graphics, course, regular, onChat, speak, playerIndex) {
  const { name, look, skill } = regular;
  let figure = null;
  let shown = false;
  let casting = false;
  let pad = null;
  let checkpoint = null;
  let hop = null;
  let walk = null;
  let fall = null;
  let teeter = null;
  let wait = 0;
  let friend = false;
  // Where a non-friend is on its own levels: a pad index with no pad behind it.
  let roaming = null;
  let away = Math.random() < 0.15;
  let awayIn = away ? 10 + Math.random() * 40 : 60 + Math.random() * 240;
  let skipped = 0;
  let frame = 0;
  let falls = 0;
  const offset = { x: 0, z: 0 };
  const pose = { x: 0, y: 0, z: 0, sink: 0, facing: 0, airborne: false, moving: false, running: false, trick: null, trickP: 0 };

  const topOf = (target) => target.mesh.position.y + target.thickness + 0.02;
  const nextPad = (from, step) => {
    const pads = course.pads;
    if (step > 0) return pads.find((each) => each.index > from.index) ?? null;
    for (let i = pads.length - 1; i >= 0; i -= 1) if (pads[i].index < from.index) return pads[i];
    return null;
  };
  const padFrom = (index) => course.pads.find((each) => each.index >= index) ?? course.pads[course.pads.length - 1];
  const between = ([low, high]) => low + Math.random() * (high - low);
  const levelOf = (index) => Math.floor(index / PADS_PER_LEVEL) + 1;

  /** The level it plays on, given yours. Never yours; the lowest other level when below would be off the course. */
  function laneLevel(index) {
    const yours = levelOf(index);
    if (yours + regular.lane >= 1) return yours + regular.lane;
    return yours > 1 ? 1 : 2;
  }

  function laneStart(index) {
    return (laneLevel(index) - 1) * PADS_PER_LEVEL;
  }

  /** Climbs its own levels without a pad in sight: a hop, a miss back to the level's start, or a pause. */
  function roam(dt, index) {
    const low = laneStart(index);
    // Good ones get through their level and on into the next.
    const high = low + PADS_PER_LEVEL * (skill.kind === "good" ? 2 : 1) - 1;
    if (levelOf(roaming.index) === levelOf(index) || roaming.index < low - PADS_PER_LEVEL || roaming.index > high + PADS_PER_LEVEL) {
      roaming.index = low + Math.floor(Math.random() * PADS_PER_LEVEL);
      return;
    }
    roaming.wait -= dt;
    if (roaming.wait > 0) return;
    roaming.wait = between(skill.pause) + 0.7 * skill.speed + (Math.random() < skill.teeter ? between(skill.hesitate) : 0);
    if (roaming.index >= high || Math.random() < skill.mill) return;
    if (Math.random() < skill.fail) {
      falls += 1;
      roaming.index = (levelOf(roaming.index) - 1) * PADS_PER_LEVEL;
      roaming.wait += FALL_SECONDS;
      speak(runner, "fell", 0.3);
      return;
    }
    roaming.index += 1;
    if (roaming.index % PADS_PER_LEVEL === 0 && Math.random() < skill.dance) {
      roaming.wait += DANCE_LENGTH;
      speak(runner, Math.random() < 0.5 ? "common" : skill.kind, 0.35);
    }
  }

  /** Becoming a friend brings it over to you; unfriending sends it back to its own levels. True when it changed. */
  function setFriend(on, index) {
    if (on === friend) return false;
    friend = on;
    if (on) {
      away = false;
      roaming = null;
      checkpoint = null;
      // Just behind you, so it hops up to where you are.
      place(padFrom(index - 1 - Math.floor(Math.random() * 2)));
    } else {
      roaming = { index: pad?.index ?? laneStart(index), wait: 0 };
      pad = null;
      hop = null;
      walk = null;
      fall = null;
      teeter = null;
    }
    return true;
  }

  function say(text) {
    figure?.say(text);
    onChat?.({ name, text });
  }

  function place(target) {
    pad = target;
    hop = null;
    walk = null;
    fall = null;
    teeter = null;
    // Somewhere on the pad, so a few arriving together don't stand inside each other.
    const reach = Math.max(0.2, (target.walkRadius ?? 1) * 0.5);
    const angle = Math.random() * Math.PI * 2;
    offset.x = Math.sin(angle) * reach;
    offset.z = Math.cos(angle) * reach;
    wait = between(skill.pause);
    pose.x = target.mesh.position.x + offset.x;
    pose.y = topOf(target);
    pose.z = target.mesh.position.z + offset.z;
  }

  function hopTo(target, miss) {
    const fromX = pose.x;
    const fromY = pose.y;
    const fromZ = pose.z;
    const dx = target.mesh.position.x - fromX;
    const dz = target.mesh.position.z - fromZ;
    const dist = Math.hypot(dx, dz);
    const radius = target.walkRadius ?? 1;
    let landing;
    if (miss) {
      // Overshoot past the far edge or come up short of the near one.
      const along = (Math.random() < 0.5 ? 1 : -1) * (radius + 0.7 + Math.random() * 0.6);
      landing = { x: (dx / (dist || 1)) * along, z: (dz / (dist || 1)) * along };
    } else {
      const reach = Math.max(0.2, radius * 0.35);
      const angle = Math.random() * Math.PI * 2;
      landing = { x: Math.sin(angle) * reach * Math.random(), z: Math.cos(angle) * reach * Math.random() };
    }
    hop = {
      fromX,
      fromY,
      fromZ,
      target,
      landing,
      miss,
      time: 0,
      duration: Math.min(1.15, Math.max(0.5, 0.42 + dist * 0.07)) * skill.speed,
      height: 0.9 + Math.max(0, topOf(target) - fromY) * 0.5 + Math.min(0.8, dist * 0.06),
      trick: Math.random() < skill.trick ? pick(TRICKS) : null,
    };
    pad?.kick?.(0.22);
  }

  function land() {
    if (hop.miss) {
      falls += 1;
      const p = 1 / hop.duration;
      fall = { time: 0, vy: 1.5, vx: (pose.x - hop.fromX) * p * 0.4, vz: (pose.z - hop.fromZ) * p * 0.4 };
      hop = null;
      return;
    }
    pad = hop.target;
    offset.x = hop.landing.x;
    offset.z = hop.landing.z;
    hop = null;
    pad.kick?.(0.5);
    wait = between(skill.pause);
    if (pad.role === "checkpoint" && pad.index > (checkpoint?.index ?? -1)) {
      checkpoint = pad;
      if (Math.random() < skill.dance) {
        const moves = DANCES.filter((dance) => dance.id !== "none");
        figure?.avatar.dance(pick(moves).id);
        wait = DANCE_LENGTH + 0.1;
        speak(runner, Math.random() < 0.5 ? "common" : skill.kind, 0.35);
      }
    }
  }

  /** Back to the checkpoint that starts the level it fell on. */
  function respawn() {
    const levelStart = Math.floor(pad.index / PADS_PER_LEVEL) * PADS_PER_LEVEL;
    place(checkpoint && !checkpoint.removed && checkpoint.index >= levelStart ? checkpoint : padFrom(levelStart));
    speak(runner, "fell", 0.3);
  }

  function jump(next) {
    hopTo(next, Math.random() < skill.fail);
  }

  /**
   * What a friend does next, given which pad it is on. It keeps up with you, up to `cap` pads
   * ahead, and hurries when it has dropped behind.
   */
  function decide(index) {
    const ahead = pad.index - (index + regular.cap);
    if (Math.abs(pad.index - index) > FRIEND_GAP) {
      place(padFrom(index - Math.floor(Math.random() * 2)));
      return;
    }
    const hurry = pad.index < index - 1;
    if (teeter) {
      const next = teeter;
      teeter = null;
      if (!next.removed && Math.random() > skill.chicken) jump(next);
      else wait = between(skill.pause);
      return;
    }
    const back = nextPad(pad, -1);
    if (back && (ahead > AHEAD_SLACK || (!hurry && Math.random() < skill.wander))) {
      jump(back);
      return;
    }
    if (ahead >= 0 || (!hurry && Math.random() < skill.mill)) {
      // Mill about on the pad.
      const reach = Math.max(0.2, (pad.walkRadius ?? 1) * 0.5);
      const angle = Math.random() * Math.PI * 2;
      walk = { x: Math.sin(angle) * reach * Math.random(), z: Math.cos(angle) * reach * Math.random() };
      return;
    }
    const next = nextPad(pad, 1);
    if (!next) {
      wait = 0.5;
      return;
    }
    if (!hurry && Math.random() < skill.teeter) {
      // Creep to the edge facing the next pad and think about it.
      const dx = next.mesh.position.x - pad.mesh.position.x;
      const dz = next.mesh.position.z - pad.mesh.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const edge = (pad.walkRadius ?? 1) * 0.75;
      walk = { x: (dx / dist) * edge, z: (dz / dist) * edge };
      teeter = next;
      return;
    }
    jump(next);
  }

  function setShadow(on) {
    if (!figure || casting === on) return;
    casting = on;
    for (const mesh of figure.avatar.parts) {
      if (on) graphics.shadow.addShadowCaster(mesh, true);
      else graphics.shadow.removeShadowCaster(mesh, true);
    }
  }

  const runner = {
    regular,
    skill,
    pose,
    say,
    setShadow,
    roam,
    setFriend,
    get friend() {
      return friend;
    },
    get falls() {
      return falls;
    },
    get level() {
      return levelOf(friend ? (pad?.index ?? 0) : roaming.index);
    },
    get padIndex() {
      return friend ? (pad?.index ?? null) : roaming.index;
    },
    get away() {
      return away;
    },
    get built() {
      return Boolean(figure);
    },
    get shown() {
      return shown;
    },
    build() {
      figure = createFigure(scene, graphics);
      casting = true;
      setShadow(false);
      figure.setName(name);
      figure.avatar.apply(look);
      figure.setShown(shown);
    },
    setShown(on) {
      shown = on;
      figure?.setShown(on);
      if (on) return;
      setShadow(false);
      // Dances only play while drawn, so one left running would freeze when it comes back.
      figure?.avatar.stopDance();
    },
    /** Steps between playing and sitting in the menu. True when it changed. */
    tickAway(dt) {
      if (friend) return false;
      awayIn -= dt;
      if (awayIn > 0) return false;
      away = !away;
      awayIn = away ? 25 + Math.random() * 65 : 90 + Math.random() * 210;
      return true;
    },
    think(dt, index) {
      if (!pad || pad.removed) place(padFrom(index - 1));
      pose.airborne = false;
      pose.moving = false;
      pose.trick = null;
      pose.trickP = 0;
      pose.sink = 0;
      if (fall) {
        fall.time += dt;
        fall.vy -= GRAVITY * dt;
        pose.x += fall.vx * dt;
        pose.y += fall.vy * dt;
        pose.z += fall.vz * dt;
        pose.airborne = true;
        if (fall.time >= FALL_SECONDS) respawn();
        return;
      }
      if (hop) {
        hop.time += dt;
        const p = Math.min(1, hop.time / hop.duration);
        // Aim at the pad as it is now, since sliding and bobbing pads keep moving.
        const toX = hop.target.mesh.position.x + hop.landing.x;
        const toY = topOf(hop.target);
        const toZ = hop.target.mesh.position.z + hop.landing.z;
        pose.x = hop.fromX + (toX - hop.fromX) * p;
        pose.z = hop.fromZ + (toZ - hop.fromZ) * p;
        pose.y = hop.fromY + (toY - hop.fromY) * p + 4 * hop.height * p * (1 - p);
        pose.facing = Math.atan2(toX - hop.fromX, toZ - hop.fromZ);
        pose.airborne = p < 0.92 || hop.miss;
        if (hop.trick) {
          pose.trick = hop.trick;
          pose.trickP = Math.min(1, Math.max(0, (p - 0.12) / 0.7));
        }
        if (p >= 1) land();
        return;
      }
      if (walk) {
        const dx = walk.x - offset.x;
        const dz = walk.z - offset.z;
        const dist = Math.hypot(dx, dz);
        const step = WALK_SPEED * dt;
        if (dist <= step) {
          offset.x = walk.x;
          offset.z = walk.z;
          walk = null;
          wait = teeter ? between(skill.hesitate) : 0.4 + Math.random() * 1.2;
        } else {
          offset.x += (dx / dist) * step;
          offset.z += (dz / dist) * step;
          pose.facing = Math.atan2(dx, dz);
          pose.moving = true;
        }
      } else {
        wait -= dt;
        if (wait <= 0) decide(index);
      }
      if (hop || fall) return;
      pose.x = pad.mesh.position.x + offset.x;
      pose.y = topOf(pad);
      pose.z = pad.mesh.position.z + offset.z;
      pose.sink = pad.sink ?? 0;
    },
    /** Far ones animate every other frame. */
    draw(dt, camera, time, far) {
      frame += 1;
      skipped += dt;
      if (far && frame % 2 === 0) return;
      figure.update(skipped, pose, camera, time);
      skipped = 0;
    },
  };
  roaming = { index: laneStart(playerIndex) + Math.floor(Math.random() * PADS_PER_LEVEL), wait: 0 };
  return runner;
}

/** Fixed per regular: who they are, how they look, and how well they play. */
function makeRegulars() {
  const regulars = [];
  let goods = 0;
  let bads = 0;
  REGULARS.forEach(([name, good], index) => {
    const rand = seeded(0x51f15eed ^ Math.imul(index + 1, 0x9e3779b1));
    const id = hex(rand) + hex(rand);
    const look = randomLook(rand, regulars.map((each) => each.look));
    const vary = rand();
    const skill = good
      ? {
          kind: "good",
          fail: 0.02 + vary * 0.04,
          speed: 0.8 + vary * 0.1,
          pause: [0.1, 0.5],
          hesitate: [0.2, 0.5],
          teeter: 0,
          chicken: 0,
          wander: 0.02,
          mill: 0.15,
          trick: 0.3 + vary * 0.2,
          dance: 0.85,
        }
      : {
          kind: "bad",
          fail: 0.22 + vary * 0.18,
          speed: 1.1 + vary * 0.15,
          pause: [0.6, 1.8],
          hesitate: [1, 2.6],
          teeter: 0.35 + vary * 0.2,
          chicken: 0.35,
          wander: 0.12 + vary * 0.1,
          mill: 0.4,
          trick: 0.04,
          dance: 0.45,
        };
    // Which levels they play on, and as a friend how far ahead of you they like to get.
    const lane = good ? GOOD_LANES[goods % GOOD_LANES.length] : BAD_LANES[bads % BAD_LANES.length];
    const cap = good ? 1 + (goods % 2) : bads % 2;
    if (good) goods += 1;
    else bads += 1;
    // Rolled last so the seeded rolls above stay the same as before costumes existed.
    look.costume = rand() < 0.7 ? pick(COSTUMES.filter((costume) => costume.id !== "none"), rand).id : "none";
    regulars.push({ id, name, look, skill, lane, cap });
  });
  return regulars;
}

const pick = (list, rand = Math.random) => list[Math.floor(rand() * list.length)];
/** Prefers what nobody in `taken` has yet, so the crowd looks different. */
const pickFresh = (list, taken, rand) => pick(list.filter((each) => !taken.includes(each)), rand) ?? pick(list, rand);

function randomLook(rand, others) {
  const body = pick(BODIES, rand).id;
  const hairColors = others.map((look) => look.hairColor);
  return cleanLook({
    body,
    age: pick(AGES, rand).id,
    hair: pickFresh(HAIR_STYLES.map((style) => style.id), others.map((look) => look.hair), rand),
    face: pick(FACES, rand).id,
    hairColor: rand() < 0.15 && !hairColors.includes("rainbow") ? "rainbow" : pickFresh(HAIR_SWATCHES, hairColors, rand),
    outfit: pickFresh(OUTFITS.map((outfit) => outfit.id), others.map((look) => look.outfit), rand),
    skinColor: pick(SKIN_SWATCHES, rand),
    bow: body === "girl" && rand() < 0.4,
  });
}

/** mulberry32: a small seeded generator, so the same seed always gives the same regular. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (rand) => Math.floor(rand() * 2 ** 32).toString(16).padStart(8, "0");
