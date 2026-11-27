import { TransformNode, Vector3 } from "@babylonjs/core";
import { buildAvatar } from "./avatar.js";
import { earnCoins } from "./coins.js";
import { BABY_SCALE, makeLook, roleLook } from "./cityLooks.js";
import { createBubble, createNameTag } from "./figure.js";
import { t } from "./i18n.js";
import { makeButton, makeHudButton, makeSheet, passengerSeats, randomIn, seatToWorld, seeded, turnToward, buildMarker } from "./cityShared.js";
import { bindLookEditor } from "./cityLookEditor.js";
import { sportById } from "./citySports.js";

const SAVE_KEY = "asmr-squishy-obby:city-household";

/** Who can live with you. `max` is how many of each kind fit in one home. */
export const MEMBER_KINDS = [
  { id: "dog", group: "pet", emoji: "🐶", max: 2, nameKey: "house.kindDog" },
  { id: "cat", group: "pet", emoji: "🐱", max: 2, nameKey: "house.kindCat" },
  { id: "capybara", group: "pet", emoji: "🦫", max: 2, nameKey: "house.kindCapybara" },
  { id: "roommate", group: "roommate", emoji: "🧑", max: 2, nameKey: "house.kindRoommate" },
  { id: "parent", group: "family", emoji: "🧑‍🍼", max: 1, nameKey: "house.kindParent" },
  { id: "sibling", group: "family", emoji: "🧒", max: 1, nameKey: "house.kindSibling" },
  { id: "baby", group: "family", emoji: "👶", max: 1, nameKey: "house.kindBaby" },
];
const MAX_MEMBERS = 6;

const NAMES = {
  dog: ["Biscuit", "Waffles", "Pepper", "Noodle"],
  cat: ["Mochi", "Luna", "Tofu", "Pickle"],
  capybara: ["Mango", "Nugget", "Coco", "Peaches"],
  roommate: { girl: ["Riley", "Jordan", "Maya", "Casey"], boy: ["Alex", "Jordan", "Noah", "Casey"] },
  sibling: { girl: ["Zoe", "Mia", "Lily", "Ava"], boy: ["Leo", "Max", "Theo", "Finn"] },
  baby: ["Bean", "Pip", "Dot", "Lulu"],
};

/** A seated avatar's feet sit this far under the seat cushion, as for the player. */
const SEAT_RISE = 0.45;
/** Seconds between happy dances at home when nobody needs anything. */
const DANCE_GAP = [25, 60];

/** Family needs, in the order the sheet shows them. Each runs from full to empty in `drain` seconds. */
export const NEEDS = [
  { id: "hunger", emoji: "🍎", drain: 420, nameKey: "house.needHunger" },
  { id: "sleep", emoji: "😴", drain: 600, nameKey: "house.needSleep" },
  { id: "fun", emoji: "🎈", drain: 360, nameKey: "house.needFun" },
  { id: "clean", emoji: "🫧", drain: 540, nameKey: "house.needClean" },
];
const LOW_NEED = 30;
/** Where each need gets looked after at home. */
const NEED_ROOM = { hunger: "kitchen", sleep: "bedroom", fun: "living", clean: "bath" };

const HOME_WALK = 1.2;
const FOLLOW_RUN = 7.5;
/** Seconds between ride requests while you're in the city, and how long an offer waits. */
const REQUEST_GAP = [50, 95];
const OFFER_SECONDS = 45;
/** Seconds a member stays out after you drop them off, before they're home again. */
const OUT_SECONDS = 50;
const SAY_GAP = 4;
/** Drop-offs count inside this many meters of the stop. */
const STOP_REACH = 7;

/** One-way ride requests. `from` is the kind that asks. Family trips bring the whole family that's home. */
const REQUESTS = [
  { id: "park", from: "parent", dest: "park", pay: 70, family: true },
  { id: "pizza", from: "roommate", dest: "pizza", pay: 45 },
  { id: "parkRide", from: "roommate", dest: "park", pay: 45 },
  { id: "babyPark", from: "baby", dest: "park", pay: 50, family: true },
];
/** Sports each kind of member asks to be driven to. Sport trips are round trips: there and home. */
const SPORT_FANS = {
  sibling: ["soccer", "basketball", "baseball", "football", "volleyball", "tennis"],
  parent: ["tennis", "volleyball", "basketball", "baseball"],
  roommate: ["basketball", "volleyball", "football", "soccer", "tennis"],
};
/** How often a request is for a sport, when someone at home plays one. */
const SPORT_CHANCE = 0.7;
const SPORT_PAY = 80;
/** Seconds of play before they head back to the car. */
const PLAY_SECONDS = 14;
/** They walk back to your ride when it's parked this close to the venue's stop. */
const PICKUP_REACH = 16;
/** Driving this far from the venue while they play leaves them waiting. */
const LEFT_BEHIND = 45;

/**
 * The people and pets who live with you in Squishy City. They live in whichever home you call
 * home, so they move when you do. People are player avatars with their own saved looks, like
 * the obby regulars; pets are made here. Saved in this browser.
 */
export function createHousehold(host, { onPaid, sports = null }) {
  const { scene } = host;
  const saved = loadSave();
  const members = [];
  let needsOn = saved.needsOn;
  let nextId = saved.nextId;
  let request = null;
  let requestWait = randomIn(REQUEST_GAP) * 0.4;
  let roomKey = null;
  let rects = null;
  let lastFoot = null;
  let walkHeading = 0;
  let atHome = false;
  let wasDriving = false;
  let lastSport = null;
  const stop = buildMarker(host, "city-house-stop", "#3ec6ff");
  const sportStop = buildMarker(host, "city-house-sport", "#3ecf8e");
  const seatAt = new Vector3();

  for (const data of saved.members) members.push(spawn(data));

  function spawn(data) {
    const kind = kindOf(data.kind);
    return {
      ...data,
      group: kind.group,
      avatar: null,
      scale: data.kind === "baby" ? BABY_SCALE : 1,
      danceWait: randomIn(DANCE_GAP),
      pet: null,
      tag: null,
      bubble: null,
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      moving: false,
      wave: 0,
      place: "home",
      outLeft: 0,
      walkedHome: false,
      placed: false,
      goal: null,
      idle: 0,
      rect: null,
      sayWait: Math.random() * SAY_GAP,
      task: null,
      shown: false,
    };
  }

  /** Builds the member's body, name tag, and bubble the first time they're seen. */
  function bodyOf(member) {
    if (member.group === "pet") {
      member.pet ??= buildPet(host, member.kind);
    } else if (!member.avatar) {
      const avatar = buildAvatar(scene);
      avatar.apply(member.look);
      avatar.root.scaling.setAll(member.scale);
      for (const mesh of avatar.root.getChildMeshes()) mesh.isPickable = false;
      for (const mesh of avatar.parts) host.graphics?.shadow?.addShadowCaster(mesh, true);
      avatar.root.setEnabled(false);
      member.avatar = avatar;
    }
    member.tag ??= createNameTag(scene, host.graphics);
    member.tag.setName(nameOf(member));
    member.bubble ??= createBubble(scene, host.graphics);
  }

  function setShown(member, on) {
    if (member.shown === on) return;
    member.shown = on;
    if (!on) member.placed = false;
    if (on) bodyOf(member);
    member.avatar?.root.setEnabled(on);
    member.pet?.setShown(on);
    member.tag?.setShown(on);
    member.bubble?.setShown(on);
  }

  function disposeBody(member) {
    if (member.avatar) {
      for (const mesh of member.avatar.parts) host.graphics?.shadow?.removeShadowCaster(mesh, true);
      member.avatar.dispose();
    }
    member.avatar = null;
    member.pet?.dispose();
    member.pet = null;
    member.tag?.dispose();
    member.tag = null;
    member.bubble?.dispose();
    member.bubble = null;
    member.shown = false;
  }

  function say(member, text) {
    member.sayWait = SAY_GAP;
    if (member.shown) member.bubble?.say(text);
  }

  /** Plays the member's own happy dance, or a wave hello. */
  function dance(member, id = member.look?.dance) {
    if (!member.avatar || !id || id === "none") return;
    member.avatar.dance(id);
    member.danceWait = randomIn(DANCE_GAP);
  }

  const looksAtHome = (except) => members.filter((member) => member.look && member !== except).map((member) => member.look);

  function save() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ needsOn, nextId, members: members.map(({ id, kind, name, seed, needs, follow, look }) => ({ id, kind, name, seed, needs, follow, look })) }),
      );
    } catch {
      // Private mode: the household just won't persist.
    }
  }

  const countOf = (kindId) => members.filter((member) => member.kind === kindId).length;

  function canAdd(kindId) {
    const kind = kindOf(kindId);
    return Boolean(kind) && members.length < MAX_MEMBERS && countOf(kindId) < kind.max;
  }

  function add(kindId) {
    const kind = kindOf(kindId);
    if (!kind) return "bad";
    if (members.length >= MAX_MEMBERS) return "full";
    if (countOf(kindId) >= kind.max) return "max";
    const id = `m${nextId}`;
    nextId += 1;
    const rand = seeded(hashString(`${id}-${kindId}-${Date.now()}`));
    const look = kind.group === "pet" ? null : makeLook(kindId, rand, looksAtHome());
    const data = {
      id,
      kind: kindId,
      name: pickName(kindId, look, members.map((member) => member.name), rand),
      seed: 5000 + Math.floor(rand() * 90000),
      follow: true,
    };
    if (kind.group === "family") data.needs = Object.fromEntries(NEEDS.map((need) => [need.id, 80 + rand() * 20]));
    if (look) data.look = look;
    members.push(spawn(data));
    rects = null;
    save();
    return "ok";
  }

  function remove(id) {
    const index = members.findIndex((member) => member.id === id);
    if (index < 0) return false;
    const [member] = members.splice(index, 1);
    disposeBody(member);
    if (request?.who.includes(id)) request.who = request.who.filter((each) => each !== id);
    if (request && (request.who.length === 0 || request.asker === id)) endRequest();
    save();
    return true;
  }

  function liveAlone() {
    for (const member of [...members]) remove(member.id);
    endRequest();
  }

  function endRequest() {
    if (request) {
      request.play?.run?.dispose();
      for (const id of request.who) {
        const member = byId(id);
        if (member?.place === "withYou" || member?.place === "sport") {
          member.place = "home";
          member.placed = false;
        }
      }
    }
    request = null;
    requestWait = randomIn(REQUEST_GAP);
  }

  const byId = (id) => members.find((member) => member.id === id);

  /** Feeds, naps, plays with, or bathes a family member. Only at home, and only with needs on. */
  function care(id, needId) {
    const member = byId(id);
    if (!member?.needs || !(needId in member.needs)) return "bad";
    if (!atHome || placeOf(member) !== "home") return "away";
    member.needs[needId] = 100;
    member.task = { need: needId, left: 8 };
    member.rect = null;
    member.placed = false;
    save();
    say(member, careLine(needId));
    dance(member);
    return "ok";
  }

  function placeOf(member) {
    if (member.group === "pet") return member.follow && !member.walkedHome ? "withYou" : "home";
    return member.place;
  }

  function familyHome() {
    return members.filter((member) => member.group === "family" && placeOf(member) === "home");
  }

  /** A round trip to play a sport, asked by someone at home who plays one. Not the same sport twice running. */
  function makeSportRequest() {
    const fans = members.filter((member) => SPORT_FANS[member.kind] && placeOf(member) === "home");
    if (!sports || fans.length === 0) return null;
    const asker = fans[Math.floor(Math.random() * fans.length)];
    const choices = SPORT_FANS[asker.kind].filter((id) => id !== lastSport);
    const sport = sportById(choices[Math.floor(Math.random() * choices.length)]);
    lastSport = sport.id;
    return {
      spec: { id: "sport", pay: SPORT_PAY },
      sport,
      venue: sports.venue(sport.id),
      asker: asker.id,
      who: [asker.id],
      phase: "offer",
      left: OFFER_SECONDS,
      ask: Math.random() < 0.5 ? "house.askSport" : "house.askSportDrive",
      play: null,
      warned: false,
    };
  }

  function makeRequest() {
    if (Math.random() < SPORT_CHANCE) {
      const sport = makeSportRequest();
      if (sport) return sport;
    }
    const options = REQUESTS.filter((spec) => members.some((member) => member.kind === spec.from && placeOf(member) === "home"));
    if (options.length === 0) return makeSportRequest();
    const spec = options[Math.floor(Math.random() * options.length)];
    const asker = members.find((member) => member.kind === spec.from && placeOf(member) === "home");
    const who = spec.family ? familyHome().map((member) => member.id) : [asker.id];
    return { spec, asker: asker.id, who, phase: "offer", left: OFFER_SECONDS, dest: destOf(spec.dest) };
  }

  /** Where a one-way ride goes, in city meters. */
  function destOf(id) {
    if (id === "pizza") return { ...host.places.pizza };
    return { ...host.places.park };
  }

  function sportText() {
    const vars = {
      name: nameOf(byId(request.asker) ?? members[0]),
      sport: t(request.sport.nameKey),
      place: t(request.sport.placeKey),
      emoji: request.sport.emoji,
    };
    const stage = request.play?.stage;
    let key = "house.pickUp";
    if (request.phase === "offer") key = request.ask;
    else if (request.phase === "ride") key = "house.toSport";
    else if (request.phase === "home") key = "house.driveHome";
    else if (request.phase === "play") key = stage === "wait" ? "house.waitForMe" : stage === "back" ? "house.comingBack" : "house.playing";
    return fill(t(key), vars);
  }

  function requestText() {
    if (!request) return "";
    if (request.sport) return sportText();
    const name = nameOf(byId(request.asker) ?? members[0]);
    if (request.phase === "offer") return askLine(request.spec.id).replace("{name}", name);
    if (request.phase === "pickup") return t("house.pickUp").replace("{name}", name);
    return destLine(request.spec.dest).replace("{name}", name);
  }

  function accept() {
    if (request?.phase !== "offer") return null;
    request.phase = "pickup";
    if (atHome) joinRide();
    const next = request.phase === "pickup" ? t("house.pickUpHint") : requestText();
    return { text: t("house.accepted"), next };
  }

  function decline() {
    if (!request) return;
    const asker = byId(request.asker);
    if (asker && request.phase === "offer") say(asker, t("house.sayOkay"));
    endRequest();
  }

  function joinRide() {
    request.phase = "ride";
    for (const id of request.who) {
      const member = byId(id);
      if (!member) continue;
      member.place = "withYou";
      member.task = null;
      member.placed = false;
    }
  }

  /** Home rooms on the front door's floor, as walkable rectangles in world space. */
  function homeRects(info) {
    const at = host.at;
    if (info.box) {
      const { x, z, w, d } = info.box;
      return [{ x0: x - w / 2 + 0.9, x1: x + w / 2 - 0.9, z0: z - d / 2 + 0.9, z1: z + d / 2 - 0.9, y: at.y, kind: "living", entry: true }];
    }
    const node = [...scene.transformNodes].reverse().find((each) => each.name === "city-interior");
    const base = node?.position;
    const door = info.door;
    const list = [];
    if (base) {
      for (const r of info.inside?.rooms ?? []) {
        if (r.out || r.x1 - r.x0 < 2.4 || r.z1 - r.z0 < 2.4) continue;
        const y = base.y + r.y;
        if (door.y !== undefined && Math.abs(y - door.y) > 1.2) continue;
        list.push({ x0: base.x + r.x0 + 0.9, x1: base.x + r.x1 - 0.9, z0: base.z + r.z0 + 0.9, z1: base.z + r.z1 - 0.9, y, kind: r.kind ?? r.name ?? "living" });
      }
    }
    if (list.length === 0) list.push({ x0: door.x - 1.5, x1: door.x + 1.5, z0: door.z - 1.5, z1: door.z + 1.5, y: door.y ?? at.y, kind: "living" });
    let entry = list[0];
    let best = Infinity;
    for (const rect of list) {
      const dx = Math.max(rect.x0 - door.x, 0, door.x - rect.x1);
      const dz = Math.max(rect.z0 - door.z, 0, door.z - rect.z1);
      if (dx + dz < best) {
        best = dx + dz;
        entry = rect;
      }
    }
    entry.entry = true;
    return list;
  }

  function rectFor(member, index) {
    const want = member.task
      ? [NEED_ROOM[member.task.need], "living"]
      : member.group === "pet"
        ? ["entry"]
        : member.kind === "parent"
          ? ["kitchen", "living"]
          : member.kind === "roommate"
            ? ["bedroom", "living", "kitchen"]
            : member.kind === "sibling"
              ? ["bedroom", "living"]
              : ["living", "bedroom"];
    for (const kind of want) {
      const matches = rects.filter((rect) => (kind === "entry" ? rect.entry : rect.kind === kind));
      if (matches.length) return matches[index % matches.length];
    }
    return rects.find((rect) => rect.entry) ?? rects[0];
  }

  /** People at home wander their room and stand about; pets pad around the hall. */
  function poseAtHome(dt, member, index, foot, entered) {
    member.rect ??= rectFor(member, index);
    const rect = member.rect;
    const pick = () => ({ x: rect.x0 + Math.random() * Math.max(0.1, rect.x1 - rect.x0), z: rect.z0 + Math.random() * Math.max(0.1, rect.z1 - rect.z0) });
    if (!member.placed) {
      const spot = entered && member.group === "pet" ? { x: foot.x + (Math.random() - 0.5) * 2, z: foot.z + (Math.random() - 0.5) * 2 } : pick();
      member.x = clamp(spot.x, rect.x0, rect.x1);
      member.z = clamp(spot.z, rect.z0, rect.z1);
      member.y = rect.y;
      member.heading = Math.random() * Math.PI * 2;
      member.goal = null;
      member.idle = 1 + Math.random() * 4;
      member.placed = true;
    }
    if (member.task) {
      member.task.left -= dt;
      if (member.task.left <= 0) {
        member.task = null;
        member.rect = null;
        member.placed = false;
        return;
      }
    }
    if (!member.goal) {
      member.idle -= dt;
      member.moving = false;
      if (member.wave > 0 || member.group === "pet") member.heading = turnToward(member.heading, Math.atan2(foot.x - member.x, foot.z - member.z), dt * 3);
      if (member.idle <= 0) member.goal = pick();
      return;
    }
    const dx = member.goal.x - member.x;
    const dz = member.goal.z - member.z;
    const dist = Math.hypot(dx, dz);
    const pace = member.group === "pet" ? 1.6 : member.kind === "baby" ? 0.6 : HOME_WALK;
    if (dist > 0.08) {
      const step = Math.min(dist, pace * dt);
      member.x += (dx / dist) * step;
      member.z += (dz / dist) * step;
      member.heading = turnToward(member.heading, Math.atan2(dx, dz), dt * 6);
      member.moving = true;
    } else {
      member.goal = null;
      member.idle = 4 + Math.random() * 9;
      member.moving = false;
    }
    member.y = rect.y;
  }

  /** Puts each follower where it should be this frame: seats first when you drive, else trotting behind. */
  function poseFollowers(dt, followers, foot, heading, driving, events) {
    const seats = driving ? passengerSeats(host.car.ride.type) : null;
    const ordered = [...followers.filter((member) => member.group !== "pet"), ...followers.filter((member) => member.group === "pet")];
    ordered.forEach((member, index) => {
      member.seat = null;
      if (seats) {
        const seat = seats[index];
        if (!seat) {
          if (member.group === "pet") member.walkedHome = true;
          else member.place = "home";
          member.placed = false;
          member.rect = null;
          events.push({ type: "toast", text: t("house.noSeat").replace("{name}", nameOf(member)), next: t("house.noSeatHint") });
          return;
        }
        member.seat = seat;
        seatToWorld(host.car.model, seat, seatAt);
        member.x = seatAt.x;
        member.y = seatAt.y;
        member.z = seatAt.z;
        member.heading = host.car.heading;
        member.moving = false;
        member.placed = true;
        return;
      }
      const side = index % 2 ? 0.8 : -0.8;
      const back = 1.5 + Math.floor(index / 2) * 1.1;
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      const tx = foot.x - sin * back + cos * side;
      const tz = foot.z - cos * back - sin * side;
      const dx = tx - member.x;
      const dz = tz - member.z;
      const dist = Math.hypot(dx, dz);
      if (!member.placed || dist > 24 || Math.abs(member.y - foot.y) > 3) {
        member.x = tx;
        member.z = tz;
        member.heading = heading;
        member.placed = true;
        member.moving = false;
      } else if (dist > 0.4) {
        const pace = Math.min(FOLLOW_RUN, dist * 2.6) * (member.kind === "baby" ? 0.9 : 1);
        const step = Math.min(dist, pace * dt);
        member.x += (dx / dist) * step;
        member.z += (dz / dist) * step;
        member.heading = turnToward(member.heading, Math.atan2(dx, dz), dt * 10);
        member.moving = pace * dt > 0.004;
      } else {
        member.moving = false;
        member.heading = turnToward(member.heading, heading, dt * 4);
      }
      member.y += (foot.y - member.y) * Math.min(1, dt * 10);
    });
  }

  function react(member, ctx) {
    if (member.sayWait > 0) return;
    if (ctx.bump > 0) {
      if (member.kind === "baby") return say(member, t("house.sayGiggle"));
      if (member.kind === "parent") return say(member, t("house.sayCareful"));
      if (member.kind === "dog") return say(member, t("house.sayWoof"));
      if (member.kind === "cat") return say(member, t("house.sayHiss"));
      if (member.kind === "sibling") return say(member, t("house.saySlowDown"));
    }
    if (ctx.horn) {
      if (member.kind === "dog") return say(member, t("house.sayWoof"));
      if (member.kind === "roommate") return say(member, t("house.sayBeep"));
      if (member.kind === "capybara") return say(member, t("house.saySqueak"));
      if (member.kind === "baby") return say(member, t("house.sayGiggle"));
    }
    if (ctx.speed > 17) {
      if (member.kind === "sibling") return say(member, t("house.saySlowDown"));
      if (member.kind === "roommate" && Math.random() < 0.02) return say(member, t("house.sayWhee"));
      if (member.kind === "parent" && Math.random() < 0.01) return say(member, t("house.sayCareful"));
    }
  }

  function complain(member) {
    if (!needsOn || !member.needs || member.sayWait > 0 || member.task) return;
    const low = NEEDS.find((need) => member.needs[need.id] < LOW_NEED);
    if (low && Math.random() < 0.01) say(member, needLine(low.id));
  }

  /** Copies a member's pose onto its body, tag, and bubble. */
  function draw(dt, member, time) {
    let top;
    if (member.avatar) {
      const avatar = member.avatar;
      const feet = (member.seat ? member.y - SEAT_RISE * member.scale : member.y) + (member.lift ?? 0);
      avatar.update(dt, {
        x: member.x,
        y: feet,
        z: member.z,
        facing: member.heading,
        sitting: Boolean(member.seat),
        moving: member.moving,
        running: Boolean(member.running),
        airborne: Boolean(member.airborne),
        stride: member.kind === "baby" ? 0.7 : 1,
        time,
      });
      top = feet + avatar.height * member.scale;
    } else {
      member.pet.update(dt, member, time);
      top = member.y + member.pet.height;
    }
    member.wave = Math.max(0, member.wave - dt);
    member.tag.update(member.x, top, member.z);
    member.bubble.update(dt, member.x, top + 0.75, member.z);
  }

  function hideAll() {
    for (const member of members) setShown(member, false);
    stop.show(false);
    sportStop.show(false);
  }

  /** Walks (or runs, over 2 m/s) toward `to` in world meters. True once there. */
  function walkTo(member, to, dt, pace, reach = 0.5) {
    const dx = to.x - member.x;
    const dz = to.z - member.z;
    const dist = Math.hypot(dx, dz);
    member.lift = 0;
    member.airborne = false;
    if (dist <= reach) {
      member.moving = false;
      member.running = false;
      return true;
    }
    const step = Math.min(dist, pace * dt);
    member.x += (dx / dist) * step;
    member.z += (dz / dist) * step;
    member.heading = turnToward(member.heading, Math.atan2(dx, dz), dt * 8);
    member.moving = true;
    member.running = pace > 2;
    return false;
  }

  /**
   * A member at the sports park: out of the car to their spot, a few rounds of play, then back to
   * your ride once it's parked close by. Driven off without them, they wait at the parking spot.
   */
  function poseSport(dt, member, hereC, parked, events) {
    const play = request?.play;
    if (!play) return;
    const at = host.at;
    member.y = at.y + host.ground;
    const { stop: venueStop, spot } = request.venue;
    if (play.stage === "out") {
      if (walkTo(member, { x: at.x + spot.x, z: at.z + spot.z }, dt, 3.6)) {
        play.stage = "play";
        play.time = 0;
        play.run = sports.startPlay(request.sport.id, member);
      }
      return;
    }
    if (play.stage === "play") {
      play.time += dt;
      if (play.run.update(dt) === "cheer") say(member, t(request.sport.cheerKey));
      if (play.time >= PLAY_SECONDS) {
        play.run.dispose();
        play.run = null;
        play.stage = "wait";
        say(member, t("house.sayGoodGame"));
      }
      return;
    }
    const near = Math.hypot(hereC.x - venueStop.x, hereC.z - venueStop.z) < PICKUP_REACH && parked;
    if (!near) {
      if (play.stage !== "wait") say(member, t("house.sayWaitForMe"));
      play.stage = "wait";
      if (walkTo(member, { x: at.x + venueStop.x, z: at.z + venueStop.z }, dt, 1.3, 1.2)) member.heading = turnToward(member.heading, Math.atan2(hereC.x - venueStop.x, hereC.z - venueStop.z), dt * 3);
      return;
    }
    play.stage = "back";
    const ride = host.driving ? { x: at.x + host.car.x, z: at.z + host.car.z } : lastFoot;
    if (walkTo(member, ride, dt, 3.6, host.driving ? 2.2 : 1.2)) {
      member.place = "withYou";
      member.placed = false;
      request.phase = "home";
      say(member, t("house.sayLetsGoHome"));
      events.push({ type: "toast", text: fill(t("house.backInCar"), { name: nameOf(member) }), next: sportText() });
    }
  }

  /** The sport round trip once they're in the car: drop off at the venue, then home to finish. */
  function updateSport(here, info, inHome, events) {
    const rider = byId(request.asker);
    if (!rider) {
      endRequest();
      return;
    }
    const hereC = { x: here.x - host.at.x, z: here.z - host.at.z };
    const parked = !host.driving || Math.abs(host.car.speed) < 1.5;
    const name = nameOf(rider);
    if (request.phase === "ride") {
      if (rider.place !== "withYou") {
        endRequest();
        return;
      }
      const { stop: venueStop } = request.venue;
      if (!info && parked && Math.hypot(hereC.x - venueStop.x, hereC.z - venueStop.z) < STOP_REACH) {
        rider.place = "sport";
        rider.seat = null;
        rider.placed = true;
        rider.y = host.at.y + host.ground;
        request.phase = "play";
        request.play = { stage: "out", run: null, time: 0 };
        say(rider, t("house.sayLetsGo"));
        events.push({ type: "toast", text: fill(t("house.arrivedSport"), { name, sport: t(request.sport.nameKey) }), next: t("house.arrivedHint") });
      }
    } else if (request.phase === "play") {
      const far = Math.hypot(hereC.x - request.venue.stop.x, hereC.z - request.venue.stop.z) > LEFT_BEHIND;
      if (far && !request.warned) {
        request.warned = true;
        events.push({ type: "toast", text: fill(t("house.leftBehind"), { name, place: t(request.sport.placeKey) }), next: t("house.leftBehindHint") });
      } else if (!far) request.warned = false;
    } else if (request.phase === "home") {
      if (rider.place !== "withYou") {
        endRequest();
        return;
      }
      const door = host.lotSpots(host.mainId).door;
      const nearDoor = !info && parked && Math.hypot(hereC.x - door.x, hereC.z - door.z) < 12;
      if (inHome || nearDoor) {
        rider.place = "home";
        rider.placed = false;
        if (rider.needs) rider.needs.fun = Math.min(100, rider.needs.fun + 60);
        say(rider, t("house.sayThanks"));
        const pay = request.spec.pay;
        earnCoins(host.coins, pay);
        onPaid?.(new Vector3(here.x, here.y + 1.5, here.z));
        events.push({ type: "toast", text: t("house.paid").replace("{n}", String(pay)), next: fill(t("house.sportDone"), { name, sport: t(request.sport.nameKey) }) });
        request = null;
        requestWait = randomIn(REQUEST_GAP);
        save();
      }
    }
  }

  function update(dt, time, ctx) {
    const events = [];
    if (!host.active || ctx.away) {
      hideAll();
      atHome = false;
      roomKey = null;
      return events;
    }
    const foot = ctx.foot;
    const driving = host.driving;
    const info = host.room();
    const inHome = Boolean(info?.main);
    atHome = inHome;
    const key = info ? info.key : null;
    const entered = key !== roomKey;
    if (entered) {
      roomKey = key;
      rects = info ? homeRects(info) : null;
      for (const member of members) {
        member.rect = null;
        member.placed = false;
        if (inHome) member.walkedHome = false;
      }
    }
    if (inHome && !rects) rects = homeRects(info);
    const jumped = lastFoot && Math.hypot(foot.x - lastFoot.x, foot.z - lastFoot.z) > 30;
    if (lastFoot) {
      const dx = foot.x - lastFoot.x;
      const dz = foot.z - lastFoot.z;
      if (Math.hypot(dx, dz) > 0.02 && Math.hypot(dx, dz) < 3) walkHeading = Math.atan2(dx, dz);
    }
    lastFoot = { x: foot.x, z: foot.z };
    const heading = driving ? host.car.heading : walkHeading;
    const here = driving ? { x: host.at.x + host.car.x, y: host.at.y + host.ground, z: host.at.z + host.car.z } : foot;

    if (needsOn) {
      for (const member of members) {
        if (!member.needs) continue;
        for (const need of NEEDS) member.needs[need.id] = Math.max(0, member.needs[need.id] - (100 / need.drain) * dt);
      }
    }

    for (const member of members) {
      member.sayWait = Math.max(0, member.sayWait - dt);
      if (member.place === "out") {
        member.outLeft -= dt;
        if (member.outLeft <= 0) {
          member.place = "home";
          member.placed = false;
        }
      }
    }

    const followers = members.filter((member) => placeOf(member) === "withYou");
    if (jumped || driving !== wasDriving) for (const member of followers) member.placed = false;
    wasDriving = driving;
    poseFollowers(dt, followers, here, heading, driving, events);

    const bump = ctx.events.find((event) => event.type === "bump");
    const react_ = { bump: bump ? bump.strength : 0, horn: ctx.events.some((event) => event.type === "horn"), speed: driving ? Math.abs(host.car.speed) : 0 };
    let index = 0;
    const hereC = { x: here.x - host.at.x, z: here.z - host.at.z };
    const parked = !driving || Math.abs(host.car.speed) < 1.5;
    for (const member of members) {
      const place = placeOf(member);
      const shown = place === "withYou" || (place === "home" && inHome) || (place === "sport" && !info);
      setShown(member, shown);
      if (!shown) {
        member.seat = null;
        continue;
      }
      if (place === "sport") poseSport(dt, member, hereC, parked, events);
      else if (place === "home") {
        poseAtHome(dt, member, index, foot, entered);
        index += 1;
        if (entered && member.group === "pet") say(member, greetLine(member.kind));
        complain(member);
        if (member.avatar && !member.moving) {
          member.danceWait -= dt;
          const content = !needsOn || !member.needs || NEEDS.every((need) => member.needs[need.id] >= 60);
          if (member.danceWait <= 0 && content && !member.task) dance(member);
        }
      } else if (driving && member.seat) react(member, react_);
      draw(dt, member, time);
    }
    if (inHome && entered) {
      const greeter = members.find((member) => member.group !== "pet" && placeOf(member) === "home");
      if (greeter) {
        greeter.wave = 2.5;
        dance(greeter, "wave");
        say(greeter, greeter.kind === "baby" ? t("house.sayGiggle") : t("house.sayWelcome"));
      }
    }

    if (!request) {
      requestWait -= dt;
      if (requestWait <= 0) {
        request = makeRequest();
        requestWait = randomIn(REQUEST_GAP);
        if (request) {
          const asker = byId(request.asker);
          if (asker?.shown) say(asker, requestText().replace(`${nameOf(asker)}: `, ""));
          events.push({ type: "toast", text: requestText(), next: t("house.offerHint") });
        }
      }
    } else if (request.phase === "offer") {
      request.left -= dt;
      if (request.left <= 0) {
        endRequest();
        events.push({ type: "toast", text: t("house.offerGone"), next: null });
      }
    } else if (request.phase === "pickup") {
      const door = host.lotSpots(host.mainId).door;
      const near = Math.hypot(here.x - host.at.x - door.x, here.z - host.at.z - door.z) < 12;
      if (inHome || (!info && near)) {
        joinRide();
        events.push({ type: "toast", text: t("house.joined"), next: requestText() });
      }
    } else if (request.sport) {
      updateSport(here, info, inHome, events);
    } else if (request.phase === "ride") {
      const dest = request.dest;
      const riders = request.who.map(byId).filter((member) => member && member.place === "withYou");
      if (riders.length === 0) endRequest();
      else if (!info && Math.hypot(here.x - host.at.x - dest.x, here.z - host.at.z - dest.z) < STOP_REACH) {
        for (const member of riders) {
          member.place = "out";
          member.outLeft = OUT_SECONDS;
          if (member.needs) member.needs.fun = Math.min(100, member.needs.fun + 50);
          say(member, t("house.sayThanks"));
        }
        const pay = request.spec.pay + (riders.length - 1) * 15;
        earnCoins(host.coins, pay);
        onPaid?.(new Vector3(here.x, here.y + 1.5, here.z));
        events.push({ type: "toast", text: t("house.paid").replace("{n}", String(pay)), next: null });
        request = null;
        requestWait = randomIn(REQUEST_GAP);
        save();
      }
    }
    const riding = request?.phase === "ride" && !request.sport;
    stop.show(riding);
    if (riding) {
      stop.place(request.dest.x, request.dest.z);
      stop.spin(time, -1);
    }
    const toVenue = Boolean(request?.sport) && (request.phase === "ride" || (request.phase === "play" && request.play?.stage === "wait"));
    sportStop.show(toVenue);
    if (toVenue) {
      sportStop.place(request.venue.stop.x, request.venue.stop.z);
      sportStop.spin(time, -1);
    }
    return events;
  }

  return {
    get members() {
      return members.map((member) => ({
        id: member.id,
        kind: member.kind,
        group: member.group,
        name: nameOf(member),
        needs: member.needs ? { ...member.needs } : null,
        follow: member.follow,
        place: placeOf(member),
        look: member.look ? { ...member.look } : null,
      }));
    },
    /** Saves a new look for a person in the household and puts it on them right away. */
    setLook(id, look) {
      const member = byId(id);
      if (!member?.look) return null;
      member.look = roleLook(member.kind, look);
      member.avatar?.apply(member.look);
      save();
      return { ...member.look };
    },
    /** Rolls a fresh random look that suits the member's role. */
    newLook(id) {
      const member = byId(id);
      if (!member?.look) return null;
      return this.setLook(id, makeLook(member.kind, Math.random, looksAtHome(member)));
    },
    /** Shows off the member's happy dance (or `id`) if they're in view. */
    dance(id, move) {
      const member = byId(id);
      if (member) dance(member, move);
    },
    get needsOn() {
      return needsOn;
    },
    set needsOn(on) {
      needsOn = Boolean(on);
      save();
    },
    get atHome() {
      return atHome;
    },
    /** True when a family member at home is low on something, so the HUD can flag it. */
    get needsAlert() {
      return needsOn && members.some((member) => member.needs && placeOf(member) === "home" && NEEDS.some((need) => member.needs[need.id] < LOW_NEED));
    },
    get request() {
      if (!request) return null;
      return { phase: request.phase, text: requestText() };
    },
    /** Where the ride wants you next, in city meters, for the arrow and the map. */
    get goal() {
      if (!request) return null;
      const home = () => ({ kind: "tour", ...host.lotSpots(host.mainId).door });
      if (request.phase === "pickup") return home();
      if (request.sport) {
        if (request.phase === "ride" || request.phase === "play") return { kind: "deliver", ...request.venue.stop };
        if (request.phase === "home") return home();
        return null;
      }
      if (request.phase === "ride") return { kind: "deliver", x: request.dest.x, z: request.dest.z };
      return null;
    },
    canAdd,
    add,
    remove,
    liveAlone,
    care,
    accept,
    decline,
    /** Pets come along by default. Left home, they wait there and greet you at the door. */
    setFollow(id, on) {
      const member = byId(id);
      if (!member || member.group !== "pet") return;
      member.follow = Boolean(on);
      member.walkedHome = false;
      member.placed = false;
      member.rect = null;
      save();
    },
    /** Asks for a ride right now (for testing, and the sheet's "Anyone need a ride?"). */
    askNow() {
      if (request) return false;
      request = makeRequest();
      return Boolean(request);
    },
    /** Moving house: everyone comes along and settles into the new place. */
    moved() {
      for (const member of members) {
        member.rect = null;
        member.placed = false;
      }
      rects = null;
      roomKey = undefined;
      return members.length > 0;
    },
    /** Leaving the city cancels any ride and sends everyone home. */
    leave() {
      if (request) endRequest();
      for (const member of members) {
        if (member.place === "withYou") member.place = "home";
        member.walkedHome = false;
        member.task = null;
      }
      hideAll();
      roomKey = null;
      lastFoot = null;
    },
    update,
  };
}

/** The Family button, the Household sheet, and the ride request bar over the city buttons. */
export function bindHousehold(household, { blip, onToast, isActive }) {
  const openButton = makeHudButton("city-family-open", "👪", "house.button", t, "city-cars-open");
  openButton.setAttribute("aria-controls", "city-household");
  const alert = document.createElement("span");
  alert.className = "city-v2-alert";
  alert.textContent = "!";
  alert.hidden = true;
  openButton.append(alert);

  const bar = document.createElement("div");
  bar.className = "city-request";
  bar.hidden = true;
  const barText = document.createElement("span");
  barText.setAttribute("aria-live", "polite");
  const yes = makeButton(t("house.accept"), "is-yes", () => {
    const out = household.accept();
    if (!out) return;
    blip?.("ding");
    onToast?.(out.text, out.next);
  });
  const no = makeButton(t("house.decline"), "", () => {
    household.decline();
    blip?.("thump");
  });
  for (const button of [yes, no]) button.addEventListener("click", (event) => event.currentTarget.blur());
  bar.append(barText, yes, no);
  document.querySelector(".city-hud-row")?.before(bar);

  let open = false;
  let armed = null;
  let armTimer = 0;
  let shownKey = "";
  let barKey = "";
  let editing = null;
  const editor = bindLookEditor(household, { blip });

  const close = () => {
    open = false;
    sheet.root.hidden = true;
    armed = null;
    editing = null;
    editor.stop();
  };
  const sheet = makeSheet("city-household", { kickerKey: "house.kicker", titleKey: "house.title", t, onClose: close });
  const intro = document.createElement("p");
  intro.className = "note";
  intro.dataset.i18n = "house.note";
  intro.textContent = t("house.note");
  const list = document.createElement("div");
  list.className = "city-members";
  const addTitle = document.createElement("h3");
  addTitle.className = "city-v2-sub";
  addTitle.dataset.i18n = "house.addTitle";
  addTitle.textContent = t("house.addTitle");
  const addRow = document.createElement("div");
  addRow.className = "city-member-add";
  const tools = document.createElement("div");
  tools.className = "city-v2-tools";
  const needsLabel = document.createElement("label");
  needsLabel.className = "city-v2-toggle";
  const needsBox = document.createElement("input");
  needsBox.type = "checkbox";
  const needsText = document.createElement("span");
  needsText.dataset.i18n = "house.needsToggle";
  needsText.textContent = t("house.needsToggle");
  needsLabel.append(needsBox, " ", needsText);
  const aloneButton = makeButton(t("house.alone"), "city-v2-alone", () => {
    if (armed !== "alone") {
      arm("alone");
      render();
      return;
    }
    armed = null;
    household.liveAlone();
    blip?.("thump");
    note.textContent = t("house.aloneDone");
    render();
  });
  tools.append(needsLabel, aloneButton);
  const note = document.createElement("p");
  note.className = "note";
  note.setAttribute("aria-live", "polite");
  sheet.body.append(intro, list, addTitle, addRow, tools, note);

  needsBox.addEventListener("change", () => {
    household.needsOn = needsBox.checked;
    note.textContent = needsBox.checked ? t("house.needsOnNote") : t("house.needsOffNote");
    render();
  });

  const arm = (id) => {
    armed = id;
    clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      armed = null;
      if (open) render();
    }, 3500);
  };

  const placeText = (place) =>
    place === "withYou" ? t("house.placeWithYou") : place === "out" ? t("house.placeOut") : place === "sport" ? t("house.placeSport") : t("house.placeHome");

  const renderKey = () =>
    JSON.stringify([
      household.members.map((member) => [member.id, member.place, member.follow, member.needs && NEEDS.map((need) => Math.round(member.needs[need.id] / 5))]),
      household.needsOn,
      household.atHome,
      armed,
    ]);

  const render = () => {
    shownKey = renderKey();
    const members = household.members;
    if (editing && !members.some((member) => member.id === editing)) {
      editing = null;
      editor.stop();
    }
    list.replaceChildren();
    if (members.length === 0) {
      const empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = t("house.empty");
      list.append(empty);
    }
    for (const member of members) {
      const kind = MEMBER_KINDS.find((each) => each.id === member.kind);
      const card = document.createElement("article");
      card.className = "city-member";
      const head = document.createElement("div");
      head.className = "city-member-head";
      const face = editor.thumb(member, kind.emoji);
      const words = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = member.name;
      const sub = document.createElement("small");
      sub.textContent = `${t(kind.nameKey)} · ${placeText(member.place)}`;
      words.append(name, sub);
      head.append(face, words);
      card.append(head);
      if (member.needs && household.needsOn) {
        const needs = document.createElement("div");
        needs.className = "city-needs";
        for (const need of NEEDS) {
          const value = Math.round(member.needs[need.id]);
          const row = document.createElement("div");
          row.className = "city-need";
          if (value < LOW_NEED) row.classList.add("is-low");
          const label = document.createElement("span");
          label.textContent = `${need.emoji} ${t(need.nameKey)}`;
          const meter = document.createElement("span");
          meter.className = "city-need-bar";
          const fill = document.createElement("span");
          fill.style.width = `${value}%`;
          meter.append(fill);
          const care = makeButton(careLabel(need.id), "is-use", () => {
            const result = household.care(member.id, need.id);
            if (result === "ok") {
              blip?.("ding");
              note.textContent = careDone(need.id).replace("{name}", member.name);
            } else if (result === "away") note.textContent = t("house.goHomeFirst");
            render();
          });
          care.disabled = !household.atHome || member.place !== "home";
          row.append(label, meter, care);
          needs.append(row);
        }
        card.append(needs);
      }
      const actions = document.createElement("div");
      actions.className = "city-member-actions";
      if (member.group === "pet") {
        actions.append(
          makeButton(member.follow ? t("house.petFollows") : t("house.petStays"), member.follow ? "is-use" : "", () => {
            household.setFollow(member.id, !member.follow);
            note.textContent = (member.follow ? t("house.petStayNote") : t("house.petFollowNote")).replace("{name}", member.name);
            render();
          }),
        );
      } else {
        const editingThis = editing === member.id;
        actions.append(
          makeButton(`🎨 ${t("house.customize")}`, editingThis ? "is-use" : "", () => {
            editing = editingThis ? null : member.id;
            if (!editing) editor.stop();
            render();
          }),
          makeButton(`🎲 ${t("house.newLook")}`, "", () => {
            household.newLook(member.id);
            blip?.("ding");
            note.textContent = t("house.lookRolled").replace("{name}", member.name);
            render();
          }),
        );
      }
      const sure = armed === member.id;
      actions.append(
        makeButton(sure ? t("house.removeSure") : t("house.remove"), sure ? "is-short" : "", () => {
          if (!sure) {
            arm(member.id);
            render();
            return;
          }
          armed = null;
          household.remove(member.id);
          blip?.("thump");
          note.textContent = t("house.removed").replace("{name}", member.name);
          render();
        }),
      );
      card.append(actions);
      if (editing === member.id && member.look) {
        card.classList.add("is-editing");
        card.append(
          editor.panel(member, () => {
            editing = null;
            note.textContent = t("house.lookSaved").replace("{name}", member.name);
            render();
          }),
        );
      }
      list.append(card);
    }

    addRow.replaceChildren();
    const familyKinds = ["parent", "sibling", "baby"];
    addRow.append(
      makeButton(`👨‍👩‍👧 ${t("house.addFamily")}`, "is-family", () => {
        const added = familyKinds.filter((kind) => household.add(kind) === "ok");
        if (added.length) {
          blip?.("ding");
          note.textContent = t("house.familyAdded");
        } else note.textContent = t("house.full");
        render();
      }, !familyKinds.some((kind) => household.canAdd(kind))),
    );
    for (const kind of MEMBER_KINDS) {
      addRow.append(
        makeButton(`${kind.emoji} ${t(kind.nameKey)}`, "", () => {
          const result = household.add(kind.id);
          if (result === "ok") {
            blip?.("ding");
            note.textContent = t("house.added").replace("{name}", household.members.at(-1)?.name ?? "");
          } else if (result === "full") note.textContent = t("house.full");
          else if (result === "max") note.textContent = t("house.maxKind");
          render();
        }, !household.canAdd(kind.id)),
      );
    }
    needsBox.checked = household.needsOn;
    const sure = armed === "alone";
    aloneButton.textContent = sure ? t("house.aloneSure") : t("house.alone");
    aloneButton.classList.toggle("is-short", sure);
    aloneButton.disabled = members.length === 0;
  };

  const show = () => {
    if (!isActive()) return;
    open = true;
    sheet.root.hidden = false;
    note.textContent = household.atHome || household.members.length === 0 ? "" : t("house.awayNote");
    render();
    sheet.close.focus();
  };

  openButton.addEventListener("click", (event) => {
    event.currentTarget.blur();
    show();
  });

  return {
    get open() {
      return open;
    },
    show,
    close,
    tick(showHud) {
      if (!showHud) {
        bar.hidden = true;
        barKey = "";
        return;
      }
      alert.hidden = !household.needsAlert;
      const request = household.request;
      const key = request ? `${request.phase}|${request.text}` : "";
      if (key !== barKey) {
        barKey = key;
        bar.hidden = !request;
        if (request) {
          barText.textContent = request.text;
          yes.hidden = request.phase !== "offer";
          no.textContent = request.phase === "offer" ? t("house.decline") : t("house.cancelRide");
        }
      }
      if (open && !editing && renderKey() !== shownKey) render();
    },
  };
}

/** A little dog, cat, or capybara made of soft shapes, with legs that trot. World position. */
function buildPet(host, kind) {
  const { scene } = host;
  const root = new TransformNode(`city-pet-${kind}`, scene);
  root.parent = host.root;
  const body = new TransformNode(`city-pet-body-${kind}`, scene);
  body.parent = root;
  const k = host.makeKit(body);
  const coat = kind === "dog" ? "#c98f5a" : kind === "cat" ? "#f2a65a" : "#9a6a48";
  const light = kind === "dog" ? "#fff1dc" : kind === "cat" ? "#fff6ea" : "#b8865c";
  const size = kind === "capybara" ? 1.25 : kind === "cat" ? 0.82 : 1;
  const legH = (kind === "capybara" ? 0.16 : 0.24) * size;
  const bodyY = legH + 0.14 * size;
  k.ball(0.4 * size, 0, bodyY, 0, coat, { sx: kind === "capybara" ? 1.15 : 0.9, sy: 0.85, sz: 1.7 });
  k.ball(0.3 * size, 0, bodyY - 0.03 * size, 0.12 * size, light, { sx: 0.8, sy: 0.7, sz: 1.4 });
  const head = new TransformNode(`city-pet-head-${kind}`, scene);
  head.parent = body;
  head.position.set(0, bodyY + 0.16 * size, 0.33 * size);
  const hk = host.makeKit(head);
  if (kind === "capybara") {
    hk.ball(0.34 * size, 0, 0, 0.04 * size, coat, { sx: 0.9, sy: 0.85, sz: 1.35 });
    hk.ball(0.18 * size, 0, -0.03 * size, 0.24 * size, "#5a3b2a", { sx: 1.1, sy: 0.7, sz: 0.6 });
    for (const side of [-1, 1]) hk.ball(0.07 * size, side * 0.12 * size, 0.15 * size, -0.08 * size, "#6e4630");
    hk.ball(0.12 * size, 0, 0.22 * size, -0.02 * size, "#ff9a2e", { glow: 0.1 });
  } else {
    hk.ball(0.3 * size, 0, 0, 0, coat);
    hk.ball(0.16 * size, 0, -0.04 * size, 0.15 * size, light, { sx: 1, sy: 0.8, sz: 1.1 });
    hk.ball(0.06 * size, 0, 0.0, 0.24 * size, "#2a2228");
    if (kind === "dog") {
      for (const side of [-1, 1]) hk.box(0.07 * size, 0.2 * size, 0.12 * size, side * 0.15 * size, 0.02 * size, -0.02 * size, "#8a5a3b", { rz: side * 0.25 });
    } else {
      for (const side of [-1, 1]) hk.cyl(0, 0.12 * size, 0.14 * size, side * 0.09 * size, 0.16 * size, -0.02 * size, coat, { tess: 4, rz: side * -0.25 });
    }
  }
  for (const side of [-1, 1]) hk.ball(0.05 * size, side * 0.075 * size, 0.06 * size, (kind === "capybara" ? 0.16 : 0.12) * size, "#1b1418");
  const tail = new TransformNode(`city-pet-tail-${kind}`, scene);
  tail.parent = body;
  tail.position.set(0, bodyY + 0.06 * size, -0.32 * size);
  if (kind !== "capybara") {
    const tk = host.makeKit(tail);
    const long = kind === "cat" ? 0.42 : 0.24;
    tk.cyl(0.05 * size, 0.07 * size, long * size, 0, (long / 2) * size, -0.04 * size, kind === "cat" ? coat : light, { rx: -0.5 });
  }
  const legs = [];
  for (const [x, z] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
    const pivot = new TransformNode(`city-pet-leg-${kind}`, scene);
    pivot.parent = body;
    pivot.position.set(x * size * (kind === "capybara" ? 1.3 : 1), legH, z * size);
    const lk = host.makeKit(pivot);
    lk.cyl(0.08 * size, 0.08 * size, legH, 0, -legH / 2, 0, coat);
    lk.ball(0.09 * size, 0, -legH + 0.02, 0.02, kind === "capybara" ? "#3a2a22" : light);
    legs.push(pivot);
  }
  const parts = root.getChildMeshes(false);
  for (const mesh of parts) host.graphics?.shadow?.addShadowCaster(mesh, true);
  root.setEnabled(false);
  let phase = Math.random() * 6;
  return {
    height: bodyY + 0.45 * size,
    setShown(on) {
      root.setEnabled(on);
    },
    update(dt, pose, time) {
      root.position.set(pose.x, pose.y, pose.z);
      root.rotation.y = pose.heading;
      phase += dt * (pose.moving ? 11 : 0);
      const sitting = Boolean(pose.seat) || (!pose.moving && kind !== "dog");
      const swing = pose.moving ? Math.sin(phase) * 0.7 : 0;
      legs.forEach((leg, index) => {
        if (sitting) leg.rotation.x = index < 2 ? 0 : -1.25;
        else leg.rotation.x = index === 0 || index === 3 ? swing : -swing;
      });
      body.rotation.x = sitting ? -0.35 : 0;
      body.position.y = sitting ? -legH * 0.45 : pose.moving ? Math.abs(Math.sin(phase)) * 0.04 : 0;
      tail.rotation.y = Math.sin(time * (kind === "dog" ? 14 : 3)) * (kind === "dog" ? 0.6 : 0.3);
      head.rotation.x = pose.moving ? 0 : Math.sin(time * 1.3) * 0.08;
    },
    dispose() {
      for (const mesh of parts) host.graphics?.shadow?.removeShadowCaster(mesh, true);
      root.dispose();
    },
  };
}

function careLabel(id) {
  if (id === "hunger") return t("house.feed");
  if (id === "sleep") return t("house.nap");
  if (id === "fun") return t("house.play");
  return t("house.bath");
}

function careDone(id) {
  if (id === "hunger") return t("house.fed");
  if (id === "sleep") return t("house.napped");
  if (id === "fun") return t("house.played");
  return t("house.bathed");
}

function kindOf(id) {
  return MEMBER_KINDS.find((kind) => kind.id === id);
}

/** A name nobody at home has yet. The parent is Mom or Dad to match their look. */
function pickName(kindId, look, taken, rand = Math.random) {
  if (kindId === "parent") return look?.body === "boy" ? "Dad" : "Mom";
  const list = NAMES[kindId] ?? [];
  const all = Array.isArray(list) ? list : (list[look?.body] ?? list.girl);
  const names = all.filter((name) => !taken.includes(name));
  return names[Math.floor(rand() * names.length)] ?? all[0] ?? "";
}

function nameOf(member) {
  return member?.name ?? "";
}

/** Puts `{name}`-style values into a translated line. */
function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

function askLine(id) {
  if (id === "pizza") return t("house.askPizza");
  if (id === "parkRide") return t("house.askParkRide");
  if (id === "babyPark") return t("house.askBabyPark");
  return t("house.askPark");
}

function destLine(dest) {
  if (dest === "pizza") return t("house.toPizza");
  return t("house.toPark");
}

function needLine(id) {
  if (id === "hunger") return t("house.sayHungry");
  if (id === "sleep") return t("house.saySleepy");
  if (id === "fun") return t("house.sayBored");
  return t("house.sayDirty");
}

function careLine(id) {
  if (id === "hunger") return t("house.sayYum");
  if (id === "sleep") return t("house.sayZzz");
  if (id === "fun") return t("house.sayYay");
  return t("house.sayClean");
}

function greetLine(kind) {
  if (kind === "dog") return t("house.greetDog");
  if (kind === "cat") return t("house.greetCat");
  return t("house.greetCapybara");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

function loadSave() {
  const fallback = { needsOn: true, nextId: 1, members: [] };
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (!data) return fallback;
    const members = (Array.isArray(data.members) ? data.members : [])
      .filter((entry) => kindOf(entry?.kind) && typeof entry.id === "string")
      .slice(0, MAX_MEMBERS)
      .map((entry, index) => {
        const kind = kindOf(entry.kind);
        const clean = {
          id: entry.id,
          kind: entry.kind,
          name: String(entry.name ?? "").slice(0, 20),
          seed: Number.isFinite(entry.seed) ? entry.seed : 5000 + index * 977,
          follow: entry.follow !== false,
        };
        if (kind.group === "family") {
          clean.needs = Object.fromEntries(
            NEEDS.map((need) => [need.id, Number.isFinite(entry.needs?.[need.id]) ? Math.max(0, Math.min(100, entry.needs[need.id])) : 90]),
          );
        }
        if (kind.group !== "pet") {
          clean.look = entry.look && typeof entry.look === "object" ? roleLook(entry.kind, entry.look) : makeLook(entry.kind, seeded(clean.seed));
        }
        if (!clean.name) clean.name = pickName(entry.kind, clean.look, []);
        return clean;
      });
    const nextId = Math.max(Number.isFinite(data.nextId) ? data.nextId : 1, members.length + 1);
    return { needsOn: data.needsOn !== false, nextId, members };
  } catch {
    return fallback;
  }
}
