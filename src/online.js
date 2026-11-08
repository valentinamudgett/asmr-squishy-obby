import { joinRoom } from "trystero";
import { DANCES } from "./dances.js";
import { createFigure } from "./figure.js";
import { cleanText } from "./filter.js";
import { cleanLook } from "./look.js";

const APP_ID = "asmr-squishy-obby";
const DAY_MS = 86_400_000;
const ID_KEY = "asmr-squishy-obby:id";
const ID_PATTERN = /^[0-9a-f]{16}$/;
/** Pose updates per second sent to the other players. */
const SEND_RATE = 12;
/** While you sit in a menu, a slow heartbeat keeps you counted without showing your avatar. */
const AWAY_RATE = 1;
/** Others are drawn this far in the past, so there are always two poses to blend between. */
const VIEW_DELAY = 0.15;
/** Seconds without a pose before a player is hidden. */
const STALE_AFTER = 4;
/** After you catch a player as police, how long before you can catch that same one again. */
const NAB_COOLDOWN = 8;
/** How long a catch waits for the caught player's game to say it counted. */
const NAB_ANSWER = 5;
export const NAME_MAX = 18;
export const CHAT_MAX = 120;
const TRICKS = [null, "front", "back", "spin"];
const AIRBORNE = 1;
const MOVING = 2;
const RUNNING = 4;
const AWAY = 8;
const FLYING = 16;

let ownId = null;

/** Days since 1970 in UTC. Everyone online on the same day shares one course and one room. */
export function courseDay(now = Date.now()) {
  return Math.floor(now / DAY_MS);
}

export function courseSeed(day) {
  return (Math.imul(day + 1, 0x2c1b3c6d) ^ 0x5eed) >>> 0;
}

/** Seconds since the course's day began, by the wall clock, so moving pads line up between players. */
export function courseClock(day) {
  return (Date.now() - day * DAY_MS) / 1000;
}

/** Your id across visits, so friends can find you again. Trystero's peer ids change every session. */
export function playerId() {
  if (ownId) return ownId;
  try {
    const stored = localStorage.getItem(ID_KEY);
    if (ID_PATTERN.test(stored ?? "")) ownId = stored;
  } catch {
    // Private mode: a fresh id each visit.
  }
  if (!ownId) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    ownId = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    try {
      localStorage.setItem(ID_KEY, ownId);
    } catch {
      // Private mode: the id just won't persist.
    }
  }
  return ownId;
}

export function cleanName(value) {
  return cleanText(value, NAME_MAX) || "Player";
}

/**
 * Peer-to-peer play over WebRTC. Players find each other through public Nostr relays,
 * so there is no game server to run. `isNear(padIndex)` says whether that part of the
 * course is built here; players elsewhere on the climb are hidden.
 */
export function createOnline(scene, { day, graphics, isNear, onCount, onRoster, onChat, onFriended, onNabbed, onCaught }) {
  const remotes = new Map();
  const peers = new Set();
  let room = null;
  let actions = null;
  let profile = { id: playerId(), name: "Player", look: {} };
  let sendTimer = 0;
  let wasAway = true;
  const sample = { x: 0, y: 0, z: 0, facing: 0, sink: 0, flags: 0, trick: null, trickP: 0 };
  const pose = {};

  const now = () => performance.now() / 1000;
  const warn = (error) => console.warn("Online", error);
  const count = () => onCount?.(room ? peers.size + 1 : 0, Boolean(room));

  function connect() {
    if (room) return;
    room = joinRoom({ appId: APP_ID }, `course-${day}`, {
      onJoinError: (details) => console.warn("Online join failed", details.error),
    });
    actions = {
      pose: room.makeAction("pose"),
      profile: room.makeAction("profile"),
      dance: room.makeAction("dance"),
      chat: room.makeAction("chat"),
      friend: room.makeAction("friend"),
      nab: room.makeAction("nab"),
      nabbed: room.makeAction("nabbed"),
    };
    actions.pose.onMessage = (data, { peerId }) => receivePose(peerId, data);
    actions.profile.onMessage = (data, { peerId }) => receiveProfile(peerId, data);
    actions.dance.onMessage = (data, { peerId }) => {
      if (typeof data !== "string" || !DANCES.some((dance) => dance.id === data)) return;
      remotes.get(peerId)?.figure.avatar.dance(data);
    };
    actions.chat.onMessage = (data, { peerId }) => {
      const text = cleanText(data, CHAT_MAX);
      if (!text) return;
      const remote = remoteFor(peerId);
      remote.figure.say(text);
      onChat?.({ name: remote.figure.name, id: remote.id, text });
    };
    actions.friend.onMessage = (_data, { peerId }) => {
      const remote = remotes.get(peerId);
      if (remote) onFriended?.(remote.figure.name);
    };
    // A police player says they caught you. Only someone you've heard from can, and the game checks
    // they're police, in the prison, and right next to you. If it counts, they hear back.
    actions.nab.onMessage = (_data, { peerId }) => {
      const remote = remotes.get(peerId);
      const last = remote?.snaps[remote.snaps.length - 1];
      if (!remote || !last) return;
      const caught = onNabbed?.({ name: remote.figure.name, police: Boolean(remote.look.police), index: remote.index, x: last.x, y: last.y, z: last.z });
      if (caught) actions.nabbed.send(true, { target: peerId }).catch(warn);
    };
    // The player you caught as police says it counted.
    actions.nabbed.onMessage = (_data, { peerId }) => {
      const remote = remotes.get(peerId);
      if (!remote?.nabOpen || now() - remote.nabAt > NAB_ANSWER) return;
      remote.nabOpen = false;
      onCaught?.(remote.figure.name);
    };
    room.onPeerJoin = (peerId) => {
      peers.add(peerId);
      actions.profile.send(profile, { target: peerId }).catch(warn);
      sendTimer = 0;
      count();
    };
    room.onPeerLeave = (peerId) => {
      peers.delete(peerId);
      drop(peerId);
      count();
    };
    count();
  }

  function disconnect() {
    if (!room) return;
    const leaving = room;
    room = null;
    actions = null;
    leaving.leave().catch(warn);
    for (const peerId of [...remotes.keys()]) drop(peerId);
    peers.clear();
    count();
  }

  window.addEventListener("pagehide", () => room?.leave().catch(warn));

  function remoteFor(peerId) {
    let remote = remotes.get(peerId);
    if (remote) return remote;
    peers.add(peerId);
    const figure = createFigure(scene, graphics);
    figure.setName("Player");
    figure.setShown(false);
    remote = {
      figure,
      id: null,
      look: cleanLook(null),
      snaps: [],
      offset: null,
      heardAt: -Infinity,
      away: true,
      index: 0,
    };
    remotes.set(peerId, remote);
    count();
    onRoster?.();
    return remote;
  }

  function drop(peerId) {
    const remote = remotes.get(peerId);
    if (!remote) return;
    remotes.delete(peerId);
    remote.figure.dispose();
    onRoster?.();
  }

  function receivePose(peerId, data) {
    if (!Array.isArray(data) || data.length < 10 || !data.every(Number.isFinite)) return;
    const [sent, x, y, z, facing, flags, trick, trickP, index, sink] = data;
    const remote = remoteFor(peerId);
    const at = now();
    // Their clock has a different origin. The smallest gap seen so far is the best guess at
    // the offset, and letting it creep up handles clocks that drift apart.
    const lag = at - sent;
    remote.offset = remote.offset === null ? lag : Math.min(lag, remote.offset + 0.02);
    remote.heardAt = at;
    remote.index = index;
    const away = (flags & AWAY) !== 0;
    if (away !== remote.away) {
      remote.away = away;
      onRoster?.();
    }
    const t = sent + remote.offset;
    const last = remote.snaps[remote.snaps.length - 1];
    if (last && t <= last.t) return;
    remote.snaps.push({ t, x, y, z, facing, flags, trick: TRICKS[trick] ?? null, trickP, sink });
    if (remote.snaps.length > 40) remote.snaps.shift();
  }

  function receiveProfile(peerId, data) {
    if (!data || typeof data !== "object") return;
    const remote = remoteFor(peerId);
    remote.id = typeof data.id === "string" && ID_PATTERN.test(data.id) ? data.id : null;
    remote.figure.setName(cleanName(data.name));
    remote.look = cleanLook(data.look);
    remote.figure.avatar.apply(remote.look);
    onRoster?.();
  }

  return {
    get enabled() {
      return Boolean(room);
    },
    setEnabled(on) {
      if (on) connect();
      else disconnect();
    },
    get name() {
      return profile.name;
    },
    setProfile(name, look) {
      profile = {
        id: playerId(),
        name: cleanName(name),
        look: {
          body: look.body,
          hair: look.hair,
          age: look.age,
          face: look.face,
          hairColor: look.hairColor,
          outfit: look.outfit,
          skinColor: look.skinColor,
          bow: Boolean(look.bow),
          held: look.held,
          necklace: Boolean(look.necklace),
          headband: Boolean(look.headband),
          bracelet: Boolean(look.bracelet),
          costume: look.costume,
          police: Boolean(look.police),
        },
      };
      if (actions && peers.size) actions.profile.send(profile).catch(warn);
    },
    /** Everyone else in the room who has said who they are. */
    players() {
      return [...remotes.entries()].map(([peerId, remote]) => ({
        peerId,
        id: remote.id,
        name: remote.figure.name,
        look: remote.look,
        away: remote.away,
      }));
    },
    isOnline(id) {
      for (const remote of remotes.values()) if (remote.id === id) return true;
      return false;
    },
    /** Sends a chat line to the room. Returns the cleaned text, or "" if there was nothing to send. */
    chat(text) {
      const clean = cleanText(text, CHAT_MAX);
      if (clean && actions && peers.size) actions.chat.send(clean).catch(warn);
      return clean;
    },
    /**
     * You're police in the prison: tries to catch a player in there who's playing as a prisoner,
     * within `reach` of (x, y, z) and not tried by you in the last NAB_COOLDOWN seconds. `onCaught`
     * gets their name once their game says it counted.
     */
    nabNear(x, y, z, reach, prisonIndex) {
      if (!actions) return;
      const at = now();
      for (const [peerId, remote] of remotes) {
        const last = remote.snaps[remote.snaps.length - 1];
        if (!last || !remote.figure.shown || remote.index !== prisonIndex || remote.look.police) continue;
        if (at - (remote.nabAt ?? -Infinity) < NAB_COOLDOWN) continue;
        if (Math.hypot(last.x - x, last.z - z) > reach || Math.abs(last.y - y) > 1.2) continue;
        remote.nabAt = at;
        remote.nabOpen = true;
        actions.nab.send(true, { target: peerId }).catch(warn);
        return;
      }
    },
    /** Lets a player know you added them as a friend. */
    befriend(peerId) {
      if (actions && peers.has(peerId)) actions.friend.send(true, { target: peerId }).catch(warn);
    },
    dance(id) {
      if (actions && peers.size) actions.dance.send(id).catch(warn);
    },
    /** Called every frame with the local player's pose. Sends a few times a second. */
    sendPose(dt, self) {
      if (!actions || peers.size === 0) return;
      if (self.away !== wasAway) {
        wasAway = self.away;
        sendTimer = 0;
      }
      sendTimer -= dt;
      if (sendTimer > 0) return;
      sendTimer = 1 / (self.away ? AWAY_RATE : SEND_RATE);
      const flags =
        (self.airborne ? AIRBORNE : 0) | (self.moving ? MOVING : 0) | (self.running ? RUNNING : 0) | (self.away ? AWAY : 0) | (self.flying ? FLYING : 0);
      actions.pose
        .send([
          round(now()),
          round(self.x),
          round(self.y),
          round(self.z),
          round(self.facing),
          flags,
          Math.max(0, TRICKS.indexOf(self.trick ?? null)),
          round(self.trickP ?? 0),
          self.index,
          round(self.sink ?? 0),
        ])
        .catch(warn);
    },
    update(dt, camera, time) {
      const at = now();
      for (const remote of remotes.values()) {
        const fresh = at - remote.heardAt < STALE_AFTER;
        remote.figure.setShown(remote.snaps.length > 0 && fresh && !remote.away && isNear(remote.index));
        if (!remote.figure.shown) continue;
        interpolate(remote.snaps, at - VIEW_DELAY, sample);
        pose.x = sample.x;
        pose.y = sample.y;
        pose.z = sample.z;
        pose.sink = sample.sink;
        pose.facing = sample.facing;
        pose.airborne = (sample.flags & AIRBORNE) !== 0;
        pose.moving = (sample.flags & MOVING) !== 0;
        pose.running = (sample.flags & RUNNING) !== 0;
        pose.flying = (sample.flags & FLYING) !== 0;
        pose.trick = sample.trick;
        pose.trickP = sample.trickP;
        remote.figure.update(dt, pose, camera, time);
      }
    },
  };
}

/** Blends the two poses either side of `t`, dropping ones that are no longer needed. */
function interpolate(snaps, t, out) {
  while (snaps.length > 2 && snaps[1].t <= t) snaps.shift();
  const a = snaps[0];
  const b = snaps[1] ?? a;
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const near = k < 0.5 ? a : b;
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.z = a.z + (b.z - a.z) * k;
  out.sink = a.sink + (b.sink - a.sink) * k;
  out.facing = a.facing + Math.atan2(Math.sin(b.facing - a.facing), Math.cos(b.facing - a.facing)) * k;
  out.flags = near.flags;
  if (a.trick === b.trick) {
    out.trick = a.trick;
    out.trickP = a.trickP + (b.trickP - a.trickP) * k;
  } else {
    out.trick = near.trick;
    out.trickP = near.trickP;
  }
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
