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
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import { FOOT_OFFSET } from "./player.js";
import { plainMaterial, unlitMaterial } from "./seasons.js";
import { refundCoins, spendCoins } from "./coins.js";
import { onCanvasClick } from "./clicks.js";
import { cleanUpgrades, DECK_FRONT, deckTier, DECOR_SPOT, dressCart } from "./coasterUpgrades.js";
import { t } from "./i18n.js";

/** Reaching this checkpoint opens your private coaster yard. */
export const COASTER_LEVEL = 150;
/** Coins paid when a ride returns to the station. Same wallet as the rest of the game. */
export const RIDE_PAY = 1000;

const SAVE_KEY = "asmr-squishy-obby:coaster";
const MAX_EXTRA = 40;
const STARTER = ["straight", "hill", "straight"];
/** Far from the course and from the prison, up in the level-150 sky. */
const OX = -1100;
const OY = 980;
const OZ = -1100;
const RAIL_Y = 0.95;
const RAIL_MIN = -18;
/** Clears a straight-up tower (UP_RISE) with room for a hill or loop above it. */
const RAIL_MAX = 96;
const STEP = 0.85;
// Standing capsule: feet rest on the cart floor. The sit drops that center so the hips meet the same floor.
const SEAT = 0.42 + FOOT_OFFSET;
const SIT_SEAT = 0.1 + FOOT_OFFSET;
// Back from the rail sample (the car's middle) toward the backrest, along the facing.
const SIT_BACK = 0.5;
/** The catwalk runs beside the track, its floor one RAIL_Y under the rails, so it starts level with the deck. */
const WALK_SIDE = 1.85;
const WALK_WIDTH = 1.8;
const WALK_THICK = 0.3;
const WALK_RAIL = 1;
/** The flat bit past the track end where you stand to build. */
const WALK_CAP = 2.6;
/** Arc speed of the catwalk belt. A run is 4.4; this is quicker, and still short of the ride. */
const BELT_SPEED = 8.2;
/** Meters of planks per arrow tile. The texture scrolls at BELT_SPEED / this. */
const BELT_TILE = 1.6;
/** How far onto the planks, past the arch, before the outbound lane picks you up. */
const BELT_START = 0.4;
/** Width of one direction's arrows. The two lanes sit side by side on the planks. */
const BELT_LANE = 0.7;
/** How far each lane sits from the center line. Positive is the outer side, away from the track. */
const BELT_LANE_OFFSET = 0.38;
/** Outer than this (away from the track) is the lane home. The track side carries you out. */
const BELT_RETURN = 0.02;
/** Once the outbound lane drops you on the build spot, it leaves you alone this far back so you can press E. */
const BELT_PARK = 1.4;
/** The first starter piece is a straight, so the catwalk can step off the deck edge here. */
const WALK_START_Z = 17;
const BUILD_REACH = 1.7;

export const PARTS = [
  { id: "straight", cost: 500, nameKey: "coaster.straight", emoji: "➡️" },
  { id: "climb", cost: 800, nameKey: "coaster.climb", emoji: "↗️" },
  { id: "up", cost: 1200, nameKey: "coaster.up", emoji: "⬆️" },
  { id: "down", cost: 1200, nameKey: "coaster.down", emoji: "⬇️" },
  { id: "drop", cost: 800, nameKey: "coaster.drop", emoji: "↘️" },
  { id: "left", cost: 700, nameKey: "coaster.left", emoji: "↩️" },
  { id: "right", cost: 700, nameKey: "coaster.right", emoji: "↪️" },
  { id: "hill", cost: 1200, nameKey: "coaster.hill", emoji: "⛰️" },
  { id: "loop", cost: 2000, nameKey: "coaster.loop", emoji: "🔄" },
];

const MAX_OWNED = 99;
/** The parts shack stands on the left of the deck. The right side (x ≈ +15) is kept free for the decor shack. */
const SHACK_X = -15;
const SHACK_Z = -5.5;
/** Where the parts shack stands, relative to the yard origin. It stays put when the deck grows. */
export const PARTS_SHACK = { x: SHACK_X, z: SHACK_Z };

/** Ticket booth on the right of the path to the ride, clear of the shack, decor, and exit. */
const BUSINESS = { x: 8.6, z: 3.2, reach: 2.35 };
const ZONES = [
  { id: "ride", x: 0, z: 10.2, reach: 2.9 },
  { id: "shop", x: SHACK_X, z: SHACK_Z + 3.3, reach: 2.6 },
  { id: "decor", x: DECOR_SPOT.x, z: DECOR_SPOT.z, reach: DECOR_SPOT.reach },
  { id: "exit", x: 0, z: -13.2, reach: 2.9 },
  { id: "business", x: BUSINESS.x, z: BUSINESS.z, reach: BUSINESS.reach },
];

/**
 * Your own rollercoaster. The yard is saved in this browser and is not shared online.
 * A short hill is already built. Parts are bought at the parts shack on the deck and kept until you
 * add them: the catwalk has two moving lanes, one out to the end and one back to the deck, and from
 * the end you click a joint on the track to put a part in, or click a part to take it off. A ride goes out and back.
 */
export function createCoaster(scene) {
  const saved = loadLayout();
  // In track order. `n` is 0 for the starter pieces and counts up as parts are added.
  const layout = saved.track;
  let added = layout.reduce((top, piece) => Math.max(top, piece.n), 0);
  let here = saved.here;
  // Closed: the yard is yours alone. Open: the regulars come and ride.
  let open = saved.open;
  const owned = saved.owned;
  const upgrades = saved.upgrades;
  // { kind: "place", id, joint } while choosing where a part goes, { kind: "remove", piece } while picking one to take off.
  let tool = null;
  let active = false;
  let riding = false;
  let travel = 0;
  let travelDir = 1;
  let action = null;
  const events = [];
  const trackMeshes = [];

  const mats = {
    rail: plainMaterial(scene, "coaster-rail", "#ff4d6d", 0.22),
    tie: plainMaterial(scene, "coaster-tie", "#c9844a", 0.1),
    pole: plainMaterial(scene, "coaster-pole", "#9eb0c4", 0.14),
    fence: plainMaterial(scene, "coaster-fence", "#ff9ec4", 0.16),
    wood: plainMaterial(scene, "coaster-wood", "#e7b07a", 0.12),
    plank: plainMaterial(scene, "coaster-plank", "#b07a52", 0.06),
    cream: plainMaterial(scene, "coaster-cream", "#fff6ea", 0.18),
    pink: plainMaterial(scene, "coaster-pink", "#ff4d8d", 0.2),
    gold: plainMaterial(scene, "coaster-gold", "#ffd23f", 0.22),
    mint: plainMaterial(scene, "coaster-mint", "#7dcea0", 0.16),
    ink: plainMaterial(scene, "coaster-ink", "#3a2433", 0.08),
    white: plainMaterial(scene, "coaster-white", "#fffafc", 0.2),
  };

  const cart = new TransformNode("coaster-cart", scene);
  let cartLook = dressCart(scene, cart, upgrades.cart, mats);
  let points = [];
  let walk = [];
  let dist = [0];
  let length = 0;
  // Bumps whenever the rails are rebuilt, so a guest lap can tell the track moved under it.
  let trackRev = 0;
  let spot = null;
  let lowest = 0;
  let walkKit = null;
  let joints = [];
  let lane = [];
  let laneDist = [0];
  let laneLength = 0;
  // True after the outbound lane has set you down on the build spot, until you leave that pad.
  let beltParked = false;
  // True while the return lane is finishing the step from the planks onto the deck.
  let beltHoming = false;
  const beltOut = { x: 0, y: 0, z: 0, heading: 0 };
  const picks = { pieces: [], joints: [] };
  const lastFoot = { x: 0, y: 0, z: 0, known: false };
  const glow = new StandardMaterial("coaster-pick-glow", scene);
  glow.diffuseColor = Color3.FromHexString("#ffd23f");
  glow.emissiveColor = Color3.FromHexString("#ffb81f");
  glow.alpha = 0.5;

  const beltLook = createBeltLook(scene);
  buildYard(scene, mats);
  const gate = buildBusiness(scene, mats);
  gate.paint(open);
  let deckKit = buildDeck(scene, mats, deckTier(upgrades.deck));
  const marker = buildMarker(scene, mats);
  rebuild(false);

  function rebuild(persist = true) {
    trackRev += 1;
    for (const mesh of trackMeshes) mesh.dispose(false, false);
    trackMeshes.length = 0;
    const track = buildTrack(layout.map((piece) => piece.id));
    points = track.points;
    walk = track.walk;
    joints = track.joints;
    lane = laneOf(walk);
    measureLane();
    walkKit?.dispose();
    walkKit = layWalk(scene, lane, mats, beltLook);
    layPicks(track.spans);
    spot = sideSpot(joints[joints.length - 1], WALK_CAP / 2);
    lowest = walk.reduce((low, node) => Math.min(low, node.y - RAIL_Y), 0);
    marker.position.set(OX + spot.x, OY + spot.y, OZ + spot.z);
    marker.rotation.y = spot.heading;
    dist = [0];
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      dist.push(dist[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    length = dist[dist.length - 1] || 0;
    travel = 0;
    travelDir = 1;
    layTrack(scene, points, mats, trackMeshes);
    if (persist) save();
    placeCart(0);
  }

  function placeCart(bob) {
    const pose = sampleAt(travel);
    const face = riding && travelDir < 0 ? pose.heading + Math.PI : pose.heading;
    cart.position.set(OX + pose.x, OY + pose.y + bob, OZ + pose.z);
    cart.rotationQuaternion = Quaternion.RotationYawPitchRoll(face, 0, 0);
    return pose;
  }

  function seatPose(distance, returning) {
    const pose = sampleAt(distance);
    const face = returning ? pose.heading + Math.PI : pose.heading;
    const sin = Math.sin(face);
    const cos = Math.cos(face);
    return {
      cartX: OX + pose.x,
      cartY: OY + pose.y,
      cartZ: OZ + pose.z,
      footX: OX + pose.x - sin * SIT_BACK,
      footY: OY + pose.y + (SIT_SEAT - FOOT_OFFSET),
      footZ: OZ + pose.z - cos * SIT_BACK,
      heading: face,
      pitch: pose.pitch,
    };
  }

  function sampleAt(distance) {
    if (points.length === 0) return { x: 0, y: RAIL_Y, z: 12.2, heading: 0, pitch: 0 };
    const s = Math.max(0, Math.min(length, distance));
    if (points.length === 1 || length <= 0) return points[0];
    let lo = 0;
    let hi = dist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (dist[mid] <= s) lo = mid;
      else hi = mid;
    }
    const span = dist[lo + 1] - dist[lo] || 1;
    const t = (s - dist[lo]) / span;
    const a = points[lo];
    const b = points[Math.min(points.length - 1, lo + 1)];
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      heading: lerpAngle(a.heading, b.heading, t),
      pitch: a.pitch + (b.pitch - a.pitch) * t,
    };
  }

  function stand(x, z, heading = 0, y = 0) {
    return { position: new Vector3(OX + x, OY + y + FOOT_OFFSET + 0.08, OZ + z), heading };
  }

  /** Which piece's catwalk you're on (`cap` past the end), or null on the deck. */
  function whereOnTrack() {
    if (!lastFoot.known) return null;
    let best = 1.6;
    let found = null;
    for (let i = 1; i < lane.length; i += 1) {
      const gap = segmentGap(lastFoot, lane[i - 1], lane[i]);
      if (gap < best) {
        best = gap;
        found = lane[i].piece;
      }
    }
    if (found === null) return null;
    return found >= layout.length ? { cap: true } : { piece: found };
  }

  /** The catwalk moved out from under you. `to` is a spot from sideSpot(). */
  function moveTo(to) {
    events.push({ type: "move", ...stand(to.x, to.z, to.heading, to.y) });
  }

  function addedCount() {
    return layout.reduce((sum, piece) => sum + (piece.n > 0 ? 1 : 0), 0);
  }

  function newestPiece() {
    let best = -1;
    layout.forEach((piece, index) => {
      if (piece.n > 0 && (best < 0 || piece.n > layout[best].n)) best = index;
    });
    return best;
  }

  /** Puts the part being placed in at joint `k` (the start of piece k), shifting the rest along. */
  function insertAt(k) {
    const id = tool?.id;
    if (riding || !(owned[id] > 0) || addedCount() >= MAX_EXTRA || k < 1 || k > layout.length) return null;
    const where = whereOnTrack();
    const end = layout.length;
    owned[id] -= 1;
    added += 1;
    layout.splice(k, 0, { id, n: added });
    tool = null;
    rebuild(true);
    // A climb starts right where the old end cap was, so step back onto the joint.
    if (where?.cap) moveTo(k === end ? sideSpot(joints[k], -0.4) : spot);
    else if (where && where.piece >= k) moveTo(sideSpot(joints[where.piece + 1], 0));
    return partById(id);
  }

  function layPicks(spans) {
    for (const mesh of picks.pieces.concat(picks.joints)) mesh.dispose(false, false);
    picks.pieces = spans.map(([from, to], index) => {
      const boxes = [];
      for (let i = from; i < to; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        span(scene, boxes, 1.6, 0.7, a.x, a.y + 0.2, a.z, b.x, b.y + 0.2, b.z);
      }
      const mesh = (boxes.length > 1 ? Mesh.MergeMeshes(boxes, true, true) : boxes[0]) ?? MeshBuilder.CreateBox("coaster-piece-pick", { size: 0.5 }, scene);
      mesh.name = "coaster-piece-pick";
      mesh.isPickable = true;
      mesh.material = glow;
      mesh.isVisible = false;
      mesh.metadata = { coasterPiece: index };
      return mesh;
    });
    picks.joints = joints.slice(1).map((joint, index) => {
      const ball = MeshBuilder.CreateSphere("coaster-joint", { diameter: 0.85, segments: 12 }, scene);
      ball.position.set(OX + joint.x, OY + joint.y + 1.5, OZ + joint.z);
      ball.metadata = { coasterJoint: index + 1 };
      return ball;
    });
    showTool();
  }

  function showTool() {
    const placing = tool?.kind === "place";
    for (const ball of picks.joints) {
      ball.setEnabled(placing);
      const chosen = placing && ball.metadata.coasterJoint === tool.joint;
      ball.material = chosen ? mats.pink : mats.gold;
      ball.scaling.setAll(chosen ? 1.35 : 1);
    }
    for (const mesh of picks.pieces) {
      mesh.isVisible = tool?.kind === "remove" && mesh.metadata.coasterPiece === tool.piece;
    }
  }

  return {
    get active() {
      return active;
    },
    get riding() {
      return riding;
    },
    /** True while the yard is open for business and the regulars may ride. */
    get open() {
      return open;
    },
    get action() {
      return action;
    },
    get floor() {
      return OY;
    },
    get canvas() {
      return scene.getEngine().getRenderingCanvas();
    },
    /** Below this you've fallen off the yard and the catwalk, all the way down to its lowest drop. */
    get fallY() {
      return OY + lowest - 7;
    },
    get full() {
      return addedCount() >= MAX_EXTRA;
    },
    /** Parts on the track that can come off (not the starter pieces). */
    get partsAdded() {
      return addedCount();
    },
    /** `place` or `remove` while one is out, else null. */
    get toolKind() {
      return tool?.kind ?? null;
    },
    /** The part being placed, or the track part picked to take off. */
    get toolPart() {
      if (tool?.kind === "place") return partById(tool.id);
      if (tool?.kind === "remove") return partById(layout[tool.piece]?.id);
      return null;
    },
    /** Bought parts waiting to go on the track, all kinds together. */
    get partsOwned() {
      return PARTS.reduce((sum, part) => sum + owned[part.id], 0);
    },
    countOf(id) {
      return owned[id] ?? 0;
    },
    /** Platform size, carts, and decorations (see coasterUpgrades.js). Edit, then call saveUpgrades(). */
    get upgrades() {
      return upgrades;
    },
    get origin() {
      return { x: OX, y: OY, z: OZ };
    },
    /** Deck edges, relative to the yard origin. */
    get deck() {
      const tier = deckTier(upgrades.deck);
      return { half: tier.half, back: tier.back, front: DECK_FRONT };
    },
    /** Rail points relative to the yard origin, with heading and pitch. */
    get track() {
      return points;
    },
    /** Meters along the rails. A ride needs at least a few. */
    get trackLength() {
      return length;
    },
    /** Changes when the track is rebuilt. A guest lap that sees a new value was interrupted. */
    get trackRev() {
      return trackRev;
    },
    /**
     * World pose of a cart and a sitting rider at `distance` along the rails.
     * `returning` faces the cart back home, the same way ride() does.
     * footX/Y/Z is the avatar root: the player's sitting capsule, minus the foot offset.
     */
    seatAt(distance, returning) {
      return seatPose(distance, returning);
    },
    /**
     * One step of a guest cart on the same sample and pace as ride()
     * (9 m/s, faster downhill up to 20, a crawl on a near-vertical climb).
     * `trip` is `{ travel, dir }`. The player's cart is not moved. `done` means it is back at the station.
     */
    advanceGuest(trip, dt) {
      if (!(dt > 0) || length < 4) return null;
      const speed = rideSpeed(sampleAt(trip.travel).pitch, trip.dir);
      trip.travel += trip.dir * speed * dt;
      let done = false;
      if (trip.dir > 0 && trip.travel >= length) {
        trip.travel = length;
        trip.dir = -1;
      } else if (trip.dir < 0 && trip.travel <= 0) {
        trip.travel = 0;
        trip.dir = 1;
        done = true;
      }
      return { ...seatPose(trip.travel, trip.dir < 0), done };
    },
    /** Dresses `root` in the cart you're riding, and returns its tick. */
    dressGuestCart(root) {
      return dressCart(scene, root, upgrades.cart, mats);
    },
    saveUpgrades() {
      save();
    },
    setDeckSize(level) {
      if (riding) return;
      upgrades.deck = Math.max(upgrades.deck, level);
      deckKit.dispose();
      deckKit = buildDeck(scene, mats, deckTier(upgrades.deck));
      // Track supports stop at the deck edge.
      rebuild(true);
    },
    setCartStyle(id) {
      if (!upgrades.carts.includes(id)) upgrades.carts.push(id);
      upgrades.cart = id;
      cartLook = dressCart(scene, cart, id, mats);
      save();
    },
    wasHere() {
      return here;
    },
    mark(pad) {
      markGate(scene, pad);
    },
    unmark(pad) {
      clearGate(pad);
    },
    spawn() {
      return stand(0, -2, 0);
    },
    enter() {
      active = true;
      here = true;
      riding = false;
      travel = 0;
      travelDir = 1;
      save();
      return stand(0, -2, 0);
    },
    leave() {
      active = false;
      here = false;
      riding = false;
      travel = 0;
      travelDir = 1;
      action = null;
      lastFoot.known = false;
      beltParked = false;
      beltHoming = false;
      tool = null;
      showTool();
      save();
    },
    /** Puts a part in your inventory. The shop takes the coins. */
    buy(id) {
      if (!partById(id) || owned[id] >= MAX_OWNED) return false;
      owned[id] += 1;
      save();
      return true;
    },
    /** Shows a ball at every joint to click. The end is chosen until you click another. */
    startPlacing(id) {
      if (!active || riding || addedCount() >= MAX_EXTRA || !(owned[id] > 0)) return false;
      tool = { kind: "place", id, joint: layout.length };
      showTool();
      return true;
    },
    /** Lights up the newest part; click others to pick them instead. */
    startRemoving() {
      const piece = newestPiece();
      if (!active || riding || piece < 0) return false;
      tool = { kind: "remove", piece };
      showTool();
      return true;
    },
    stopTool() {
      tool = null;
      showTool();
    },
    /**
     * A click in the 3D view (canvas CSS pixels) while a tool is out. Placing at a joint returns
     * `{ type: "placed", part }`; picking returns `{ type: "picked", part }` or `{ type: "starter" }`.
     */
    clickAt(x, y) {
      if (!tool || riding) return null;
      const key = tool.kind === "place" ? "coasterJoint" : "coasterPiece";
      const hit = scene.pick(x, y, (mesh) => mesh.isEnabled() && mesh.metadata?.[key] !== undefined);
      if (!hit?.hit) return null;
      const index = hit.pickedMesh.metadata[key];
      if (tool.kind === "place") {
        const part = insertAt(index);
        return part ? { type: "placed", part } : null;
      }
      if (layout[index]?.n === 0) return { type: "starter" };
      tool.piece = index;
      showTool();
      return { type: "picked", part: partById(layout[index].id) };
    },
    placeAtEnd() {
      return tool?.kind === "place" ? insertAt(layout.length) : null;
    },
    /** Takes the picked part off and puts it back in your inventory. Returns that part, or null. */
    removePicked() {
      const r = tool?.kind === "remove" ? tool.piece : -1;
      const piece = layout[r];
      if (riding || !piece || piece.n === 0) return null;
      const where = whereOnTrack();
      layout.splice(r, 1);
      owned[piece.id] += 1;
      tool = null;
      rebuild(true);
      if (where?.cap) moveTo(spot);
      else if (where && where.piece >= r) moveTo(sideSpot(joints[where.piece === r ? r : where.piece - 1], 0));
      return partById(piece.id);
    },
    /** Opens the yard for riders, or closes it so it is yours alone. Saved in this browser. */
    toggleBusiness() {
      open = !open;
      gate.paint(open);
      save();
      return open;
    },
    act() {
      if (action === "ride") {
        if (riding || length < 4) return null;
        tool = null;
        showTool();
        riding = true;
        travel = 0;
        travelDir = 1;
        return "ride";
      }
      return action;
    },
    /**
     * While you ride, the capsule center to carry. Call before the player update.
     * `hold` freezes the car (menus). Finishing the trip home queues a `paid` event.
     */
    ride(dt, hold) {
      if (!active || !riding) return null;
      if (!hold) {
        const pose = sampleAt(travel);
        const speed = rideSpeed(pose.pitch, travelDir);
        travel += travelDir * speed * dt;
        if (travelDir > 0 && travel >= length) {
          travel = length;
          travelDir = -1;
        } else if (travelDir < 0 && travel <= 0) {
          travel = 0;
          travelDir = 1;
          riding = false;
          events.push({ type: "paid" });
        }
      }
      const seated = riding;
      const pose = seated || travel > 0 ? sampleAt(travel) : sampleAt(0);
      const face = travelDir < 0 && seated ? pose.heading + Math.PI : pose.heading;
      const position = new Vector3(OX + pose.x, OY + pose.y + (seated ? SIT_SEAT : SEAT), OZ + pose.z);
      if (seated) {
        position.x -= Math.sin(face) * SIT_BACK;
        position.z -= Math.cos(face) * SIT_BACK;
      }
      return { position, heading: face, sitting: seated };
    },
    /**
     * One step of the catwalk, in world meters. The track side carries you out to the build spot.
     * The outer side carries you back and sets you down on the deck by the arch.
     * Nothing in the air, while a tool is out, or while you push against that lane.
     */
    beltStep(foot, wish, dt) {
      if (!active || riding || tool || lane.length < 2 || !(dt > 0)) return null;
      const hit = projectLane(foot.x - OX, foot.y - OY, foot.z - OZ);
      if (!hit || hit.vert > 0.45 || hit.vert < -0.55) {
        beltHoming = false;
        return null;
      }
      // The return lane keeps going for a step past the lip, onto the deck by the arch.
      if (hit.before) {
        if (!beltHoming || hit.horiz > 1.7) {
          beltHoming = false;
          return null;
        }
        const home = beltHome(hit, dt);
        if (!home) beltHoming = false;
        return home;
      }
      if (hit.horiz > WALK_WIDTH * 0.42) return null;
      const flat = Math.hypot(hit.tx, hit.tz) || 1;
      const along = (wish.x * hit.tx + wish.z * hit.tz) / flat;
      const goingBack = hit.side > BELT_RETURN;
      const stopS = Math.max(BELT_START, laneLength - WALK_CAP / 2);
      if (goingBack) {
        if (along > 1) return null;
        beltParked = false;
        if (hit.s <= 0.45) {
          beltHoming = true;
          const home = beltHome(hit, dt);
          if (!home) beltHoming = false;
          return home;
        }
        const speed = Math.max(0, BELT_SPEED - Math.max(0, -along));
        if (speed < 0.05) return null;
        const dest = hit.s - Math.min(0.45, speed * dt);
        if (dest <= 0.45) {
          beltHoming = true;
          return beltHome(hit, dt);
        }
        return beltDelta(hit, dest, true);
      }
      beltHoming = false;
      if (along < -1) return null;
      if (hit.s < BELT_START) return null;
      if (hit.s >= stopS - 0.08) {
        beltParked = true;
        return null;
      }
      if (beltParked && hit.s > stopS - BELT_PARK) return null;
      beltParked = false;
      const speed = Math.max(0, BELT_SPEED - Math.max(0, along));
      if (speed < 0.05) return null;
      const dest = Math.min(stopS, hit.s + Math.min(0.45, speed * dt));
      if (dest <= hit.s + 1e-4) {
        beltParked = true;
        return null;
      }
      if (dest >= stopS - 1e-3) beltParked = true;
      return beltDelta(hit, dest, false);
    },
    /** Parks the car, picks the nearby prompt, and returns events (`paid`). */
    update(_dt, foot, time = 0) {
      beltLook.scroll(time);
      const bob = riding ? 0 : Math.sin(time * 2.2) * 0.035;
      placeCart(bob);
      cartLook.tick(time);
      if (tool?.kind === "place") {
        const pulse = 1 + Math.sin(time * 5) * 0.12;
        for (const ball of picks.joints) ball.scaling.setAll((ball.metadata.coasterJoint === tool.joint ? 1.35 : 1) * pulse);
      }
      if (!active || riding || !foot) action = null;
      else {
        const x = foot.x - OX;
        const z = foot.z - OZ;
        const y = foot.y - OY;
        lastFoot.x = x;
        lastFoot.y = y;
        lastFoot.z = z;
        lastFoot.known = true;
        const dx = x - spot.x;
        const dz = z - spot.z;
        if (Math.abs(y - spot.y) < 2.2 && dx * dx + dz * dz <= BUILD_REACH * BUILD_REACH) action = "build";
        else action = y > -1.6 && y < 4 ? zoneAt(x, z) : null;
        if (action === "business") action = open ? "closeBusiness" : "openBusiness";
      }
      return events.splice(0);
    },
  };

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ track: layout, here, owned, upgrades, open }));
    } catch {
      // Private mode: the track just won't persist.
    }
  }

  function measureLane() {
    laneDist = [0];
    for (let i = 1; i < lane.length; i += 1) {
      const a = lane[i - 1];
      const b = lane[i];
      laneDist.push(laneDist[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    laneLength = laneDist[laneDist.length - 1] || 0;
    beltParked = false;
    beltHoming = false;
  }

  /** Closest point on the catwalk center line. `before` is still on the deck, short of the planks. */
  function projectLane(px, py, pz) {
    let best = Infinity;
    let found = null;
    for (let i = 1; i < lane.length; i += 1) {
      const a = lane[i - 1];
      const b = lane[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const span2 = dx * dx + dy * dy + dz * dz || 1;
      const raw = ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / span2;
      const t = Math.max(0, Math.min(1, raw));
      const qx = a.x + dx * t;
      const qy = a.y + dy * t;
      const qz = a.z + dz * t;
      const horiz = Math.hypot(px - qx, pz - qz);
      const vert = py - qy;
      const gap = Math.hypot(horiz, vert);
      if (gap < best) {
        best = gap;
          const len = Math.sqrt(span2);
          const tx = dx / len;
          const tz = dz / len;
          const flat = Math.hypot(tx, tz) || 1;
          found = {
            px,
            py,
            pz,
            s: laneDist[i - 1] + t * len,
            tx,
            ty: dy / len,
            tz,
            // Positive is the outer side of the planks, away from the track.
            side: ((px - qx) * tz) / flat + ((pz - qz) * -tx) / flat,
            horiz,
            vert,
            before: i === 1 && raw < 0,
          };
      }
    }
    return found;
  }

  function sampleLane(s) {
    const c = Math.max(0, Math.min(laneLength, s));
    let lo = 0;
    let hi = laneDist.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (laneDist[mid] <= c) lo = mid;
      else hi = mid;
    }
    const span = laneDist[lo + 1] - laneDist[lo] || 1;
    const t = (c - laneDist[lo]) / span;
    const a = lane[lo];
    const b = lane[Math.min(lane.length - 1, lo + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return {
      x: a.x + dx * t,
      y: a.y + dy * t,
      z: a.z + dz * t,
      tx: dx / len,
      ty: dy / len,
      tz: dz / len,
      heading: Math.atan2(dx, dz),
    };
  }

  /** Step from the feet to `s1` on the center line, keeping the sideways offset so curves don't shove you off. */
  function beltDelta(hit, s1, back) {
    const a = sampleLane(hit.s);
    const b = sampleLane(s1);
    const aH = Math.hypot(a.tx, a.tz) || 1;
    const bH = Math.hypot(b.tx, b.tz) || 1;
    const side = ((hit.px - a.x) * a.tz) / aH + ((hit.pz - a.z) * -a.tx) / aH;
    beltOut.x = b.x + (b.tz / bH) * side - hit.px;
    beltOut.z = b.z + (-b.tx / bH) * side - hit.pz;
    beltOut.y = b.y - a.y;
    // A joint can drop the feet through the plank for a frame. Put them back on it.
    if (hit.vert < -0.08) beltOut.y += Math.min(0.25, -hit.vert);
    beltOut.heading = back ? b.heading + Math.PI : b.heading;
    return beltOut;
  }

  /** Last bit of the return lane: off the planks and onto the deck, just this side of the arch. */
  function beltHome(hit, dt) {
    const a = sampleLane(0);
    const flat = Math.hypot(a.tx, a.tz) || 1;
    const backX = -a.tx / flat;
    const backZ = -a.tz / flat;
    const rightX = a.tz / flat;
    const rightZ = -a.tx / flat;
    const dist = 1.25;
    const tx = a.x + backX * dist + rightX * BELT_LANE_OFFSET;
    const tz = a.z + backZ * dist + rightZ * BELT_LANE_OFFSET;
    const dx = tx - hit.px;
    const dz = tz - hit.pz;
    const span = Math.hypot(dx, dz);
    if (span < 0.25) return null;
    const step = Math.min(span, Math.min(0.45, BELT_SPEED * dt));
    const scale = step / (span || 1);
    beltOut.x = dx * scale;
    beltOut.z = dz * scale;
    beltOut.y = Math.max(-0.35, Math.min(0.35, a.y + 0.02 - hit.py));
    beltOut.heading = Math.atan2(backX, backZ);
    return beltOut;
  }
}

/**
 * The parts overlay, in one of two modes. `shop` (the parts shack on the deck) buys parts into
 * your inventory with the game's coin wallet. `build` (the end of the track) lists the parts you
 * own. Choosing one, or "Take a part off", closes it and brings out the tool bar: the track stays
 * in view, you can walk and look around, and a click on a joint ball or a track part does the rest.
 */
export function bindCoasterShop(coaster, { coins, blip, onCoins, onDone }) {
  const root = document.querySelector("#coaster-shop");
  const list = document.querySelector("#coaster-parts");
  const title = document.querySelector("#coaster-shop-title");
  const note = document.querySelector("#coaster-shop-note");
  const status = document.querySelector("#coaster-shop-status");
  const undo = document.querySelector("#coaster-undo");
  const badge = document.querySelector("#coaster-coins");
  const bar = document.querySelector("#coaster-tool");
  const barText = document.querySelector("#coaster-tool-text");
  const barGo = document.querySelector("#coaster-tool-go");
  const barCancel = document.querySelector("#coaster-tool-cancel");
  if (!root || !list || !undo || !bar || !barText || !barGo || !barCancel) {
    return { get open() { return false; }, show() {}, close() {}, tick() {} };
  }
  let open = false;
  let mode = "shop";

  for (const part of PARTS) {
    const card = document.createElement("article");
    card.className = "shop-item";
    card.dataset.card = part.id;
    const emoji = document.createElement("span");
    emoji.className = "shop-emoji";
    emoji.textContent = part.emoji;
    emoji.setAttribute("aria-hidden", "true");
    const name = document.createElement("strong");
    name.textContent = t(part.nameKey);
    const have = document.createElement("span");
    have.className = "shop-have";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.part = part.id;
    card.append(emoji, name, have, button);
    list.append(card);
    button.addEventListener("click", () => {
      if (coaster.riding) return;
      if (mode === "build") attach(part);
      else buy(part);
    });
  }

  function buy(part) {
    if (!spendCoins(coins, part.cost)) {
      paint(t("coaster.broke"));
      return;
    }
    if (!coaster.buy(part.id)) {
      refundCoins(coins, part.cost);
      paint(t("coaster.tooMany"));
      return;
    }
    blip?.("ding");
    onCoins?.();
    paint(t("coaster.bought").replace("{name}", t(part.nameKey)));
  }

  function attach(part) {
    if (coaster.full) {
      paint(t("coaster.full"));
      return;
    }
    if (!coaster.startPlacing(part.id)) return;
    blip?.("clank");
    setOpen(false);
    showBar();
  }

  function placed(part) {
    blip?.("clank");
    showBar();
    onDone?.(t("coaster.added").replace("{name}", t(part.nameKey)), t("toast.coasterWalkOn"));
  }

  /** The tool bar follows the coaster's tool: hidden when there's none. */
  function showBar(message) {
    const kind = coaster.toolKind;
    bar.hidden = !kind;
    if (!kind) return;
    const name = t(coaster.toolPart?.nameKey ?? "");
    if (kind === "place") {
      barText.textContent = message ?? t("coaster.placeHint").replace("{name}", name);
      barGo.textContent = t("coaster.placeEnd");
    } else {
      barText.textContent = message ?? t("coaster.pickHint").replace("{name}", name);
      barGo.textContent = `🗑️ ${t("coaster.removeWhich").replace("{name}", name)}`;
    }
  }

  onCanvasClick(coaster.canvas, (x, y) => {
    if (open || !coaster.toolKind) return;
    const result = coaster.clickAt(x, y);
    if (result?.type === "placed") placed(result.part);
    else if (result?.type === "starter") showBar(t("coaster.starter"));
    else if (result?.type === "picked") showBar();
  });
  barGo.addEventListener("click", () => {
    if (coaster.toolKind === "place") {
      const part = coaster.placeAtEnd();
      if (part) placed(part);
      return;
    }
    const part = coaster.removePicked();
    if (!part) return;
    blip?.("thump");
    showBar();
    onDone?.(t("coaster.removed").replace("{name}", t(part.nameKey)), null);
  });
  barCancel.addEventListener("click", () => {
    coaster.stopTool();
    showBar();
  });

  function paint(message) {
    const building = mode === "build";
    const count = Math.max(0, Math.floor(Number(coins.coins)) || 0);
    if (badge) badge.textContent = String(count);
    if (title) title.textContent = building ? t("coaster.buildTitle") : t("coaster.shopTitle");
    if (note) note.textContent = building ? t("coaster.buildNote") : t("coaster.shopNote");
    const empty = building && coaster.partsOwned === 0;
    if (status) status.textContent = message ?? (empty ? t("coaster.noParts") : "");
    list.querySelectorAll("[data-card]").forEach((card) => {
      const part = partById(card.dataset.card);
      const have = coaster.countOf(part.id);
      card.hidden = building && have <= 0;
      card.querySelector(".shop-have").textContent = t("coaster.have").replace("{n}", String(have));
      const button = card.querySelector("button");
      button.classList.toggle("is-short", !building && count < part.cost);
      button.disabled = coaster.riding || (building && coaster.full);
      if (building) button.replaceChildren(`➕ ${t("coaster.add")}`);
      else button.replaceChildren(`${t("shop.buy")} · ${part.cost}`, coinGlyph());
    });
    undo.hidden = !building;
    undo.disabled = coaster.partsAdded <= 0 || coaster.riding;
    undo.textContent = `🗑️ ${t("coaster.remove")}`;
  }

  function setOpen(next, nextMode = mode) {
    mode = nextMode;
    open = next && coaster.active && !coaster.riding;
    root.hidden = !open;
    if (open) {
      coaster.stopTool();
      showBar();
      paint();
      document.querySelector("#coaster-shop-close")?.focus();
    }
  }

  root.querySelector("#coaster-shop-backdrop")?.addEventListener("click", () => setOpen(false));
  document.querySelector("#coaster-shop-close")?.addEventListener("click", () => setOpen(false));
  undo.addEventListener("click", () => {
    if (!coaster.startRemoving()) return;
    setOpen(false);
    showBar();
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape") return;
    if (open) {
      event.preventDefault();
      setOpen(false);
    } else if (coaster.toolKind) {
      event.preventDefault();
      coaster.stopTool();
      showBar();
    }
  });

  return {
    get open() {
      return open;
    },
    /** `shop` at the parts shack, `build` at the end of the track. */
    show(nextMode = "shop") {
      setOpen(true, nextMode);
    },
    close() {
      setOpen(false);
      coaster.stopTool();
      showBar();
    },
    /** Hides the tool bar once the tool is gone (a ride started, or you left the yard). */
    tick() {
      if (!bar.hidden && !coaster.toolKind) showBar();
    },
  };
}

function partById(id) {
  return PARTS.find((part) => part.id === id) ?? null;
}

function loadLayout() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    const known = new Set(PARTS.map((part) => part.id));
    let track = Array.isArray(data?.track)
      ? data.track
          .filter((piece) => known.has(piece?.id))
          .map((piece) => ({ id: piece.id, n: Math.max(0, Math.floor(Number(piece.n)) || 0) }))
      : null;
    // The catwalk steps off the deck along the first starter straight, so the starter pieces must lead.
    const starters = track?.filter((piece) => piece.n === 0).map((piece) => piece.id).join();
    if (!track || starters !== STARTER.join() || track[0].n !== 0) {
      // Older saves kept added parts as a list after the starter pieces.
      const extra = Array.isArray(data?.extra) ? data.extra.filter((id) => known.has(id)) : (track ?? []).filter((piece) => piece.n > 0).map((piece) => piece.id);
      track = starterTrack().concat(extra.map((id, index) => ({ id, n: index + 1 })));
    }
    let count = track.filter((piece) => piece.n > 0).length;
    for (let i = track.length - 1; i >= 0 && count > MAX_EXTRA; i -= 1) {
      if (track[i].n > 0) {
        track.splice(i, 1);
        count -= 1;
      }
    }
    // Saves from before the parts shack have no inventory: everything bought is already on the track.
    const owned = noParts();
    for (const part of PARTS) {
      const n = Math.floor(Number(data?.owned?.[part.id]));
      if (Number.isFinite(n) && n > 0) owned[part.id] = Math.min(MAX_OWNED, n);
    }
    return { track, here: data?.here === true, owned, upgrades: cleanUpgrades(data?.upgrades), open: data?.open === true };
  } catch {
    return { track: starterTrack(), here: false, owned: noParts(), upgrades: cleanUpgrades(null), open: false };
  }
}

function starterTrack() {
  return STARTER.map((id) => ({ id, n: 0 }));
}

function noParts() {
  return Object.fromEntries(PARTS.map((part) => [part.id, 0]));
}

function zoneAt(x, z) {
  for (const zone of ZONES) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    if (dx * dx + dz * dz <= zone.reach * zone.reach) return zone.id;
  }
  return null;
}

function lerpAngle(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}

/**
 * Rail points, plus the catwalk's center line: one node per piece end (tagged with its piece), and
 * the arc on turns. Straight-up towers and straight-down drops add a spiral beside the rails.
 * `joints[k]` is where piece k starts, and the last one is the track end. `spans[k]` is the first
 * and last point of piece k.
 */
function buildTrack(ids) {
  const pose = { x: 0, y: RAIL_Y, z: 12.2, heading: 0 };
  const points = [{ x: pose.x, y: pose.y, z: pose.z, heading: pose.heading, pitch: 0 }];
  const walk = [{ x: 0, y: RAIL_Y, z: WALK_START_Z, heading: 0, piece: 0 }];
  const joints = [{ ...pose }];
  const spans = [];
  ids.forEach((id, piece) => {
    const from = points.length;
    const started = { x: pose.x, y: pose.y, z: pose.z, heading: pose.heading };
    appendPiece(id, pose, points);
    spans.push([from - 1, points.length - 1]);
    joints.push({ ...pose });
    if (id === "up" || id === "down") appendUpWalk(walk, started, pose, piece);
    else {
      // Hills and loops end at the height they started, so the catwalk runs level past them.
      const nodes = id === "left" || id === "right" ? points.slice(from) : points.slice(-1);
      for (const node of nodes) walk.push({ x: node.x, y: node.y, z: node.z, heading: node.heading, piece });
    }
  });
  return { points, walk, joints, spans };
}

/** Where to stand on the catwalk beside a track pose, `ahead` meters along it (back when negative). */
function sideSpot(pose, ahead) {
  const side = lateral(pose.heading, WALK_SIDE);
  return {
    x: pose.x + side.x + Math.sin(pose.heading) * ahead,
    y: pose.y - RAIL_Y,
    z: pose.z + side.z + Math.cos(pose.heading) * ahead,
    heading: pose.heading,
  };
}

/** The catwalk floor line beside the track, plus the end cap (tagged one past the last piece). */
function laneOf(walk) {
  const lane = walk.map((node) => {
    const side = lateral(node.heading, WALK_SIDE);
    return { x: node.x + side.x, y: node.y - RAIL_Y, z: node.z + side.z, piece: node.piece, brace: node.brace };
  });
  const end = walk[walk.length - 1];
  const tip = lane[lane.length - 1];
  const cap = walk.length > 1 ? end.piece + 1 : 0;
  lane.push({ x: tip.x + Math.sin(end.heading) * WALK_CAP, y: tip.y, z: tip.z + Math.cos(end.heading) * WALK_CAP, piece: cap });
  return lane;
}

/** Distance from point `p` to the segment a-b. */
function segmentGap(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const span2 = dx * dx + dy * dy + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / span2));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t, p.z - a.z - dz * t);
}

function appendPiece(id, pose, points) {
  if (id === "straight") appendLine(points, pose, 8, 0);
  else if (id === "climb") appendLine(points, pose, 8, 4.6);
  else if (id === "drop") appendLine(points, pose, 8, -4.6);
  else if (id === "up") appendUp(points, pose);
  else if (id === "down") appendDown(points, pose);
  else if (id === "hill") appendHill(points, pose);
  else if (id === "loop") appendLoop(points, pose);
  else if (id === "left") appendTurn(points, pose, -1);
  else if (id === "right") appendTurn(points, pose, 1);
}

function pushPoint(points, x, y, z, heading) {
  const prev = points[points.length - 1];
  const dy = y - prev.y;
  const horiz = Math.hypot(x - prev.x, z - prev.z);
  if (horiz < 0.04 && Math.abs(dy) < 0.04) return;
  points.push({ x, y, z, heading, pitch: Math.atan2(dy, Math.max(0.001, horiz)) });
}

function takeEnd(points, pose) {
  const end = points[points.length - 1];
  pose.x = end.x;
  pose.y = end.y;
  pose.z = end.z;
  pose.heading = end.heading;
}

function appendLine(points, pose, length, rise) {
  const steps = Math.max(2, Math.round(length / STEP));
  const y1 = Math.min(RAIL_MAX, Math.max(RAIL_MIN, pose.y + rise));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    pushPoint(
      points,
      pose.x + Math.sin(pose.heading) * length * t,
      pose.y + (y1 - pose.y) * t,
      pose.z + Math.cos(pose.heading) * length * t,
      pose.heading,
    );
  }
  takeEnd(points, pose);
}

/** How tall a straight-up tower tries to be, before the rail ceiling. */
const UP_RISE = 72;
/** Crawl speed on a near-vertical climb. Downhill still uses the boost in rideSpeed. */
const CLIMB_CRAWL = 2.8;
/** Forward drift so each span stays a real segment. Small enough that the tower still looks vertical. */
const UP_NUDGE = 0.2;
/** Steepest catwalk the belt can carry. A vertical plank is a wall to the character. */
const UP_SLOPE = 28 * Math.PI / 180;
/** Least rise between stacked loops, so a rail doesn't poke through the deck above it. */
const UP_CLEAR = 1.45;

/** Pace along the rails. Downhill speeds up; a near-vertical climb crawls. */
function rideSpeed(pitch, dir) {
  const slope = -Math.sin(pitch) * dir;
  const speed = Math.min(20, 9 + Math.max(0, slope) * 8);
  // Hills and the shallow climb stay under 80°. A straight-up tower, and the ride back up a
  // straight drop, sit past 88° and crawl instead of shooting up the wall.
  const climbing = (dir > 0 && pitch > 80 * Math.PI / 180) || (dir < 0 && pitch < -80 * Math.PI / 180);
  if (!climbing) return speed;
  const steep = Math.min(1, (Math.abs(pitch) - 80 * Math.PI / 180) / (8 * Math.PI / 180));
  return speed + (CLIMB_CRAWL - speed) * steep;
}

function appendUp(points, pose) {
  const room = Math.min(RAIL_MAX, Math.max(RAIL_MIN, pose.y + UP_RISE)) - pose.y;
  // A shorter leftover would stack the catwalk closer than a person can stand.
  const rise = room >= UP_CLEAR ? room : 0;
  const run = UP_NUDGE;
  const steps = Math.max(2, Math.round(Math.max(run, Math.abs(rise)) / STEP));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    pushPoint(
      points,
      pose.x + Math.sin(pose.heading) * run * t,
      pose.y + rise * t,
      pose.z + Math.cos(pose.heading) * run * t,
      pose.heading,
    );
  }
  takeEnd(points, pose);
}

/** Rails go straight down, the mirror of the straight-up tower, until the rail floor. */
function appendDown(points, pose) {
  const target = Math.min(RAIL_MAX, Math.max(RAIL_MIN, pose.y - UP_RISE));
  const room = pose.y - target;
  // A shorter leftover would stack the catwalk closer than a person can stand.
  const drop = room >= UP_CLEAR ? room : 0;
  const run = UP_NUDGE;
  const steps = Math.max(2, Math.round(Math.max(run, drop) / STEP));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    pushPoint(
      points,
      pose.x + Math.sin(pose.heading) * run * t,
      pose.y - drop * t,
      pose.z + Math.cos(pose.heading) * run * t,
      pose.heading,
    );
  }
  takeEnd(points, pose);
}

/**
 * The rails go straight up or straight down. The catwalk cannot: the character treats a vertical
 * belt as a wall and falls off. A spiral around the tower stays under 30 degrees and lands back
 * on the same side.
 */
function appendUpWalk(walk, start, end, piece) {
  const rise = end.y - start.y;
  const flat = Math.hypot(end.x - start.x, end.z - start.z);
  const height = Math.abs(rise);
  if (!(height >= UP_CLEAR) || height <= Math.max(flat, 0.05) * Math.tan(UP_SLOPE)) {
    walk.push({ x: end.x, y: end.y, z: end.z, heading: end.heading, piece });
    return;
  }
  const minRun = height / Math.tan(UP_SLOPE);
  const lap = 2 * Math.PI * WALK_SIDE;
  const turns = Math.max(1, Math.ceil(minRun / lap - 1e-9));
  appendUpSpiral(walk, start, end, piece, rise, turns);
}

function appendUpSpiral(walk, start, end, piece, rise, turns) {
  const steps = turns * 18;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    // Heading decreases so the first step keeps going forward. Full turns land on the same side.
    const heading = i === steps ? end.heading : start.heading - turns * Math.PI * 2 * t;
    walk.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + rise * t,
      z: start.z + (end.z - start.z) * t,
      heading,
      piece,
      brace: false,
    });
  }
}

function appendHill(points, pose) {
  const length = 14;
  const peak = 5.6;
  const steps = Math.max(2, Math.round(length / STEP));
  const y0 = pose.y;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const y = Math.min(RAIL_MAX, Math.max(RAIL_MIN, y0 + Math.sin(t * Math.PI) * peak));
    pushPoint(
      points,
      pose.x + Math.sin(pose.heading) * length * t,
      y,
      pose.z + Math.cos(pose.heading) * length * t,
      pose.heading,
    );
  }
  takeEnd(points, pose);
}

function appendLoop(points, pose) {
  const radius = 3.5;
  const exit = 2.4;
  const steps = 36;
  const y0 = pose.y;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const angle = t * Math.PI * 2;
    const along = radius * Math.sin(angle) + exit * t;
    const y = Math.min(RAIL_MAX, Math.max(RAIL_MIN, y0 + radius * (1 - Math.cos(angle))));
    pushPoint(
      points,
      pose.x + Math.sin(pose.heading) * along,
      y,
      pose.z + Math.cos(pose.heading) * along,
      pose.heading,
    );
  }
  takeEnd(points, pose);
}

function appendTurn(points, pose, dir) {
  const radius = 6;
  const steps = 12;
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  const cx = pose.x + rx * radius * dir;
  const cz = pose.z + rz * radius * dir;
  const ox = pose.x - cx;
  const oz = pose.z - cz;
  for (let i = 1; i <= steps; i += 1) {
    const a = (Math.PI / 2) * (i / steps);
    const cos = Math.cos(a);
    const sin = Math.sin(a) * dir;
    pushPoint(points, cx + ox * cos + oz * sin, pose.y, cz - ox * sin + oz * cos, pose.heading + dir * a);
  }
  takeEnd(points, pose);
}

function layTrack(scene, points, mats, trackMeshes) {
  const rails = [];
  const ties = [];
  const poles = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const aSide = lateral(a.heading, 0.46);
    const bSide = lateral(b.heading, 0.46);
    span(scene, rails, 0.14, 0.1, a.x + aSide.x, a.y + 0.08, a.z + aSide.z, b.x + bSide.x, b.y + 0.08, b.z + bSide.z);
    span(scene, rails, 0.14, 0.1, a.x - aSide.x, a.y + 0.08, a.z - aSide.z, b.x - bSide.x, b.y + 0.08, b.z - bSide.z);
    if (i % 2 === 0) {
      span(scene, ties, 1.2, 0.08, a.x - aSide.x, a.y, a.z - aSide.z, a.x + aSide.x, a.y, a.z + aSide.z);
    }
    if (i % 5 === 0 && !onDeck(a)) {
      const hang = 4.8;
      const pole = MeshBuilder.CreateCylinder("coaster-pole", { height: hang, diameter: 0.16, tessellation: 6 }, scene);
      pole.position.set(OX + a.x, OY + a.y - hang / 2, OZ + a.z);
      pole.isPickable = false;
      poles.push(pole);
    }
  }
  adopt(scene, "coaster-rails", rails, mats.rail, trackMeshes);
  adopt(scene, "coaster-ties", ties, mats.tie, trackMeshes);
  adopt(scene, "coaster-poles", poles, mats.pole, trackMeshes);
  const end = points[points.length - 1];
  if (end) {
    const bumper = MeshBuilder.CreateBox("coaster-bumper", { width: 1.35, height: 0.7, depth: 0.28 }, scene);
    bumper.position.set(OX + end.x, OY + end.y + 0.55, OZ + end.z);
    bumper.rotationQuaternion = Quaternion.RotationYawPitchRoll(end.heading, 0, 0);
    bumper.material = mats.gold;
    bumper.isPickable = false;
    trackMeshes.push(bumper);
  }
}

/**
 * The catwalk out to the track end, with a flat cap past it to build from. Two arrow lanes share
 * the planks: toward the track they run out to the cap, and the outer lane runs back to the deck.
 * Floor and side rails are solid, so you can only fall off by jumping over a rail. Slopes are 30
 * degrees at most (climbs and drops), inside the player's slope limit.
 */
function layWalk(scene, lane, mats, beltLook) {
  const root = new TransformNode("coaster-walk", scene);
  root.position.set(OX, OY, OZ);
  root.computeWorldMatrix(true);
  const container = new PhysicsShapeContainer(scene);
  const shapes = [];
  const floors = [];
  const outStrips = [];
  const backStrips = [];
  const bars = [];
  const posts = [];
  const meshes = [];
  const solid = (center, rotation, width, height, depth) => {
    const shape = new PhysicsShapeBox(center, rotation, new Vector3(width, height, depth), scene);
    shape.material = { friction: 0.92, restitution: 0 };
    container.addChild(shape);
    shapes.push(shape);
  };
  const up = new Vector3();
  const across = new Vector3();
  let rotation = Quaternion.Identity();
  for (let i = 0; i < lane.length - 1; i += 1) {
    const a = lane[i];
    const b = lane[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) continue;
    rotation = Quaternion.RotationYawPitchRoll(Math.atan2(dx, dz), -Math.atan2(dy, Math.hypot(dx, dz)), 0);
    new Vector3(0, 1, 0).rotateByQuaternionToRef(rotation, up);
    new Vector3(1, 0, 0).rotateByQuaternionToRef(rotation, across);
    // Run each piece a little into the next so turns and slope changes leave no gap at the joint.
    const back = i > 0 ? 0.15 : 0;
    const front = i < lane.length - 2 ? 0.15 : 0;
    const depth = len + back + front;
    const shift = (front - back) / 2 / len;
    const mid = new Vector3((a.x + b.x) / 2 + dx * shift, (a.y + b.y) / 2 + dy * shift, (a.z + b.z) / 2 + dz * shift);
    const floor = mid.subtract(up.scale(WALK_THICK / 2));
    solid(floor, rotation, WALK_WIDTH, WALK_THICK, depth);
    floors.push(walkBox(scene, floor, rotation, WALK_WIDTH, WALK_THICK, depth));
    const center = new Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const lift = up.scale(0.04);
    // Local +X is the outer side (away from the track): that lane points back toward the deck.
    outStrips.push(beltStrip(scene, center.add(across.scale(-BELT_LANE_OFFSET)).add(lift), rotation, len, false));
    backStrips.push(beltStrip(scene, center.add(across.scale(BELT_LANE_OFFSET)).add(lift), rotation, len, true));
    for (const sign of [-1, 1]) {
      const edge = mid.add(across.scale(sign * (WALK_WIDTH / 2 - 0.05)));
      solid(edge.add(up.scale(WALK_RAIL / 2)), rotation, 0.1, WALK_RAIL, depth);
      bars.push(walkBox(scene, edge.add(up.scale(WALK_RAIL - 0.04)), rotation, 0.1, 0.08, depth));
      bars.push(walkBox(scene, edge.add(up.scale(WALK_RAIL * 0.5)), rotation, 0.06, 0.06, depth));
      const foot = new Vector3(a.x, a.y, a.z).addInPlace(across.scale(sign * (WALK_WIDTH / 2 - 0.05)));
      const stick = MeshBuilder.CreateCylinder("coaster-walk-post", { height: WALK_RAIL, diameter: 0.09, tessellation: 6 }, scene);
      stick.position.set(OX + foot.x, OY + foot.y + WALK_RAIL / 2, OZ + foot.z);
      stick.isPickable = false;
      posts.push(stick);
    }
    if (i % 4 === 0 && !onDeck(a) && a.brace !== false) {
      const hang = 4.2;
      const pole = MeshBuilder.CreateCylinder("coaster-walk-pole", { height: hang, diameter: 0.14, tessellation: 6 }, scene);
      pole.position.set(OX + a.x, OY + a.y - WALK_THICK - hang / 2, OZ + a.z);
      pole.isPickable = false;
      posts.push(pole);
    }
  }
  // A gate across the far end of the cap.
  const last = lane[lane.length - 1];
  const gate = new Vector3(last.x, last.y, last.z);
  solid(gate.add(up.scale(WALK_RAIL / 2)), rotation, WALK_WIDTH, WALK_RAIL, 0.1);
  bars.push(walkBox(scene, gate.add(up.scale(WALK_RAIL - 0.04)), rotation, WALK_WIDTH, 0.08, 0.1));
  bars.push(walkBox(scene, gate.add(up.scale(WALK_RAIL * 0.5)), rotation, WALK_WIDTH, 0.06, 0.06));

  adopt(scene, "coaster-walk-floor", floors, mats.plank, meshes);
  adopt(scene, "coaster-belt-out", outStrips, beltLook.out, meshes);
  adopt(scene, "coaster-belt-back", backStrips, beltLook.back, meshes);
  adopt(scene, "coaster-walk-bars", bars, mats.cream, meshes);
  adopt(scene, "coaster-walk-posts", posts, mats.pole, meshes);
  shapes.push(container);
  const body = new PhysicsBody(root, PhysicsMotionType.STATIC, false, scene);
  body.shape = container;
  body.setMassProperties({ mass: 0 });
  body.disablePreStep = true;
  return {
    dispose() {
      body.dispose();
      for (const shape of shapes) shape.dispose();
      for (const mesh of meshes) mesh.dispose(false, false);
      root.dispose();
    },
  };
}

/** Two scrolling lanes. The return strip's V is flipped, so one offset runs the arrows opposite ways. */
function createBeltLook(scene) {
  const outTex = beltTexture(scene, "coaster-belt-out-tex", "#d85a86");
  const backTex = beltTexture(scene, "coaster-belt-back-tex", "#3f9d78");
  return {
    out: beltMaterial(scene, "coaster-belt-out-mat", outTex, new Color3(0.05, 0.02, 0.028)),
    back: beltMaterial(scene, "coaster-belt-back-mat", backTex, new Color3(0.02, 0.045, 0.032)),
    scroll(time) {
      const off = -((time * BELT_SPEED) / BELT_TILE);
      outTex.vOffset = off;
      backTex.vOffset = off;
    },
  };
}

function beltTexture(scene, name, arrow) {
  const texture = new DynamicTexture(name, { width: 128, height: 256 }, scene, true);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  paintBelt(texture, arrow);
  return texture;
}

function beltMaterial(scene, name, texture, emissive) {
  const material = new StandardMaterial(name, scene);
  material.diffuseTexture = texture;
  material.diffuseColor = new Color3(0.78, 0.78, 0.78);
  material.emissiveColor = emissive;
  material.specularColor = new Color3(0.04, 0.04, 0.04);
  material.zOffset = -2;
  return material;
}

function paintBelt(texture, arrow) {
  const ctx = texture.getContext();
  const w = 128;
  const h = 256;
  ctx.fillStyle = "#a56d48";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#8d5a38";
  ctx.fillRect(0, 0, 14, h);
  ctx.fillRect(w - 14, 0, 14, h);
  ctx.strokeStyle = arrow;
  ctx.lineWidth = 22;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const chevron = (y) => {
    ctx.beginPath();
    ctx.moveTo(34, y + 46);
    ctx.lineTo(64, y);
    ctx.lineTo(94, y + 46);
    ctx.stroke();
  };
  chevron(64);
  chevron(148);
  texture.update();
}

/**
 * One lane of arrows on a plank. `flipV` turns the chevrons around and, with the shared scroll,
 * walks them back toward the deck.
 */
function beltStrip(scene, center, rotation, length, flipV) {
  const mesh = MeshBuilder.CreateGround("coaster-belt-strip", { width: BELT_LANE, height: length, subdivisions: 1 }, scene);
  mesh.position.set(OX + center.x, OY + center.y, OZ + center.z);
  mesh.rotationQuaternion = rotation.clone();
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const uvs = new Float32Array((positions.length / 3) * 2);
  for (let i = 0, u = 0; i < positions.length; i += 3, u += 2) {
    uvs[u] = positions[i] / BELT_LANE + 0.5;
    const v = positions[i + 2] / BELT_TILE + length / (2 * BELT_TILE);
    uvs[u + 1] = flipV ? -v : v;
  }
  mesh.setVerticesData(VertexBuffer.UVKind, uvs);
  mesh.isPickable = false;
  return mesh;
}

function walkBox(scene, center, rotation, width, height, depth) {
  const mesh = MeshBuilder.CreateBox("coaster-walk-part", { width, height, depth }, scene);
  mesh.position.set(OX + center.x, OY + center.y, OZ + center.z);
  mesh.rotationQuaternion = rotation.clone();
  mesh.isPickable = false;
  return mesh;
}

/** Ring and sign on the catwalk cap, moved to the track end whenever it changes. */
function buildMarker(scene, mats) {
  const root = new TransformNode("coaster-build", scene);
  const ring = MeshBuilder.CreateTorus("coaster-build-ring", { diameter: 1.45, thickness: 0.1, tessellation: 28 }, scene);
  ring.parent = root;
  ring.position.y = 0.06;
  ring.material = mats.pink;
  ring.isPickable = false;
  const front = WALK_CAP / 2 - 0.08;
  for (const x of [-0.85, 0.85]) {
    const stick = MeshBuilder.CreateCylinder("coaster-build-post", { height: 2.5, diameter: 0.12, tessellation: 8 }, scene);
    stick.parent = root;
    stick.position.set(x, 1.25, front);
    stick.material = mats.cream;
    stick.isPickable = false;
  }
  makeSign(scene, root, "coaster-build", t("coaster.buildSign"), 0, 2.2, front, 0, 1.9, 0.56, "#ff4d8d", "#fff8fb");
  const balloon = MeshBuilder.CreateSphere("coaster-build-balloon", { diameter: 0.55, segments: 12 }, scene);
  balloon.parent = root;
  balloon.position.set(0.85, 3, front);
  balloon.material = mats.mint;
  balloon.isPickable = false;
  return root;
}

/** Set by buildDeck(), so track supports skip the deck at every platform size. */
let deckBounds = deckTier(0);

function onDeck(point) {
  return Math.abs(point.x) <= deckBounds.half - 2 && point.z >= deckBounds.back + 1 && point.z <= DECK_FRONT - 0.8;
}

function lateral(heading, amount) {
  return { x: Math.cos(heading) * amount, z: -Math.sin(heading) * amount };
}

function span(scene, list, width, height, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return;
  const mesh = MeshBuilder.CreateBox("coaster-span", { width, height, depth: len }, scene);
  mesh.position.set(OX + (ax + bx) / 2, OY + (ay + by) / 2, OZ + (az + bz) / 2);
  mesh.rotationQuaternion = Quaternion.RotationYawPitchRoll(
    Math.atan2(dx, dz),
    -Math.atan2(dy, Math.hypot(dx, dz)),
    0,
  );
  mesh.isPickable = false;
  list.push(mesh);
}

function adopt(scene, name, meshes, material, trackMeshes) {
  if (!meshes.length) return;
  const merged = Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
  const kept = merged ? [merged] : meshes;
  if (merged) merged.name = name;
  for (const mesh of kept) {
    mesh.material = material;
    mesh.isPickable = false;
    trackMeshes.push(mesh);
  }
}

/** The yard deck at one platform size, with its fences and corner lamps. The front edge (z = DECK_FRONT) never moves. */
function buildDeck(scene, mats, { half, back }) {
  deckBounds = { half, back };
  const width = half * 2;
  const depth = DECK_FRONT - back;
  const midZ = (DECK_FRONT + back) / 2;
  const meshes = [];
  const owned = [];
  const deck = MeshBuilder.CreateBox("coaster-deck", { width, height: 1.3, depth }, scene);
  deck.position.set(OX, OY - 0.65, OZ + midZ);
  deck.material = deckMaterial(scene, width, depth);
  deck.isPickable = false;
  deck.computeWorldMatrix(true);
  addStatic(scene, deck, width, 1.3, depth);
  owned.push(deck.material);
  meshes.push(deck);

  // The gap in the front fence (|x| < 4.2) is where the track and the catwalk leave the deck.
  const wing = half - 4.2;
  meshes.push(fence(scene, mats.fence, wing, 1.05, 0.4, -(4.2 + wing / 2), 0.52, DECK_FRONT - 0.3));
  meshes.push(fence(scene, mats.fence, wing, 1.05, 0.4, 4.2 + wing / 2, 0.52, DECK_FRONT - 0.3));
  meshes.push(fence(scene, mats.fence, width, 1.05, 0.4, 0, 0.52, back + 0.3));
  meshes.push(fence(scene, mats.fence, 0.4, 1.05, depth - 0.8, -(half - 0.2), 0.52, midZ));
  meshes.push(fence(scene, mats.fence, 0.4, 1.05, depth - 0.8, half - 0.2, 0.52, midZ));

  const lx = half - 2;
  for (const [x, z, hex] of [[-lx, DECK_FRONT - 2, "#ffd23f"], [lx, DECK_FRONT - 2, "#ff4d8d"], [-lx, back + 2, "#7dcea0"], [lx, back + 2, "#fff6ea"]]) {
    const lamp = MeshBuilder.CreateSphere("coaster-lamp", { diameter: 0.46, segments: 10 }, scene);
    lamp.position.set(OX + x, OY + 2.15, OZ + z);
    lamp.material = plainMaterial(scene, `coaster-lamp-${x}-${z}`, hex, 0.5);
    lamp.isPickable = false;
    owned.push(lamp.material);
    meshes.push(lamp, post(scene, mats.cream, x, 1.05, z));
  }
  return {
    dispose() {
      for (const mesh of meshes) {
        mesh.physicsBody?.shape?.dispose();
        mesh.physicsBody?.dispose();
        mesh.dispose(false, false);
      }
      for (const material of owned) material.dispose(false, true);
    },
  };
}

/** The ticket booth: stand in the ring and press E to open the yard for riders, or close it. */
function buildBusiness(scene, mats) {
  const { x, z } = BUSINESS;
  const ringMesh = MeshBuilder.CreateTorus("coaster-business-ring", { diameter: 2.6, thickness: 0.12, tessellation: 28 }, scene);
  ringMesh.position.set(OX + x, OY + 0.06, OZ + z);
  ringMesh.isPickable = false;
  post(scene, mats.cream, x - 0.85, 1.2, z + 0.2);
  post(scene, mats.cream, x + 0.85, 1.2, z + 0.2);
  const counter = box(scene, mats.wood, 2.1, 1.05, 0.5, x, 0.52, z - 0.2);
  counter.computeWorldMatrix(true);
  addStatic(scene, counter, 2.1, 1.05, 0.5);
  const closedSign = makeSign(
    scene, null, "coaster-business-closed",
    [t("coaster.businessKicker"), t("coaster.businessClosed")],
    OX + x, OY + 2.2, OZ + z + 0.25, 0, 2.4, 0.78, "#ff4d8d", "#fff8fb",
  );
  const openSign = makeSign(
    scene, null, "coaster-business-open",
    [t("coaster.businessKicker"), t("coaster.businessOpen")],
    OX + x, OY + 2.2, OZ + z + 0.25, 0, 2.4, 0.78, "#1f8a4c", "#fff8fb",
  );
  const balloon = MeshBuilder.CreateSphere("coaster-business-balloon", { diameter: 0.55, segments: 12 }, scene);
  balloon.position.set(OX + x + 1.35, OY + 3.15, OZ + z + 0.2);
  balloon.material = mats.gold;
  balloon.isPickable = false;
  const string = MeshBuilder.CreateCylinder("coaster-business-string", { height: 0.9, diameter: 0.03, tessellation: 6 }, scene);
  string.position.set(OX + x + 1.35, OY + 2.45, OZ + z + 0.2);
  string.material = mats.ink;
  string.isPickable = false;
  return {
    paint(isOpen) {
      for (const mesh of closedSign.meshes) mesh.setEnabled(!isOpen);
      for (const mesh of openSign.meshes) mesh.setEnabled(isOpen);
      ringMesh.material = isOpen ? mats.mint : mats.pink;
      balloon.material = isOpen ? mats.mint : mats.gold;
    },
  };
}

function buildYard(scene, mats) {
  ring(scene, mats.gold, 0, 10.2, 3.1);
  ring(scene, mats.mint, 0, -13.2, 2.8);
  ring(scene, mats.pink, SHACK_X, SHACK_Z + 3.3, 3);
  buildShack(scene, mats);

  // An arch over the catwalk where it leaves the deck: parts are added out at the far end.
  const archZ = WALK_START_Z - 0.6;
  post(scene, mats.cream, WALK_SIDE - 1.05, 1.4, archZ);
  post(scene, mats.cream, WALK_SIDE + 1.05, 1.4, archZ);
  makeSign(scene, null, "coaster-to-end", t("coaster.toEndSign"), OX + WALK_SIDE, OY + 2.55, OZ + archZ, 0, 2.6, 0.62, "#ff4d8d", "#fff8fb");
  const balloon = MeshBuilder.CreateSphere("coaster-balloon", { diameter: 0.7, segments: 12 }, scene);
  balloon.position.set(OX + WALK_SIDE + 1.05, OY + 3.75, OZ + archZ);
  balloon.material = mats.pink;
  balloon.isPickable = false;
  const string = MeshBuilder.CreateCylinder("coaster-string", { height: 1, diameter: 0.03, tessellation: 6 }, scene);
  string.position.set(OX + WALK_SIDE + 1.05, OY + 3.1, OZ + archZ);
  string.material = mats.ink;
  string.isPickable = false;

  makeSign(scene, null, "coaster-yard", t("coaster.yardSign"), OX - 8.2, OY + 2.5, OZ + 1, Math.PI / 2, 3.2, 0.8, "#ff4d8d", "#fff8fb");
  makeSign(scene, null, "coaster-ride", t("coaster.rideSign"), OX + 2.6, OY + 1.7, OZ + 10.2, -Math.PI / 2, 1.5, 0.55, "#ffd23f", "#3a2433");
  makeSign(scene, null, "coaster-back", t("coaster.backSign"), OX, OY + 2.15, OZ - 14.2, 0, 1.6, 0.55, "#7dcea0", "#163326");
  post(scene, mats.cream, -1.3, 1.05, -14.6);
  post(scene, mats.cream, 1.3, 1.05, -14.6);
}

/** A little wooden stand with a striped roof, open at the front over the counter. */
function buildShack(scene, mats) {
  const x = SHACK_X;
  const z = SHACK_Z;
  fence(scene, mats.wood, 4.6, 2.6, 0.2, x, 1.3, z - 1);
  fence(scene, mats.wood, 0.2, 2.6, 2.2, x - 2.2, 1.3, z);
  fence(scene, mats.wood, 0.2, 2.6, 2.2, x + 2.2, 1.3, z);
  fence(scene, mats.cream, 4.4, 1.05, 0.5, x, 0.52, z + 0.95);
  box(scene, mats.pink, 4.7, 0.08, 0.75, x, 1.09, z + 0.95);
  for (const [side, material] of [[1, mats.pink], [-1, mats.white]]) {
    const roof = box(scene, material, 5.1, 0.12, 1.75, x, 2.92, z + side * 0.72);
    roof.rotation.x = side * 0.42;
  }
  box(scene, mats.wood, 4.2, 0.08, 0.4, x, 1.75, z - 0.75);
  for (const [dx, material] of [[-1.4, mats.gold], [-0.5, mats.mint], [0.5, mats.pink], [1.4, mats.rail]]) {
    box(scene, material, 0.55, 0.4, 0.3, x + dx, 2, z - 0.75);
  }
  box(scene, mats.gold, 0.5, 0.18, 0.32, x - 1.2, 1.22, z + 0.9).rotation.y = 0.3;
  box(scene, mats.mint, 0.45, 0.3, 0.3, x + 1.3, 1.28, z + 0.95).rotation.y = -0.2;
  makeSign(scene, null, "coaster-shack", t("coaster.shackSign"), OX + x, OY + 3.75, OZ + z + 0.2, 0, 3, 0.7, "#ff4d8d", "#fff8fb");
  const balloon = MeshBuilder.CreateSphere("coaster-shack-balloon", { diameter: 0.62, segments: 12 }, scene);
  balloon.position.set(OX + x + 2.45, OY + 3.7, OZ + z + 1);
  balloon.material = mats.mint;
  balloon.isPickable = false;
  post(scene, mats.cream, x + 2.45, 1.6, z + 1);
}

function fence(scene, material, width, height, depth, x, y, z) {
  const mesh = box(scene, material, width, height, depth, x, y, z);
  mesh.computeWorldMatrix(true);
  addStatic(scene, mesh, width, height, depth);
  return mesh;
}

function box(scene, material, width, height, depth, x, y, z) {
  const mesh = MeshBuilder.CreateBox("coaster-box", { width, height, depth }, scene);
  mesh.position.set(OX + x, OY + y, OZ + z);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function ring(scene, material, x, z, diameter) {
  const mesh = MeshBuilder.CreateTorus("coaster-ring", { diameter, thickness: 0.1, tessellation: 28 }, scene);
  mesh.position.set(OX + x, OY + 0.06, OZ + z);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function post(scene, material, x, y, z) {
  const mesh = MeshBuilder.CreateCylinder("coaster-post", { height: y * 2, diameter: 0.14, tessellation: 8 }, scene);
  mesh.position.set(OX + x, OY + y, OZ + z);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function addStatic(scene, mesh, width, height, depth) {
  const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(width, height, depth), scene);
  shape.material = { friction: 0.92, restitution: 0 };
  const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
  body.shape = shape;
  body.setMassProperties({ mass: 0 });
  body.disablePreStep = true;
}

function deckMaterial(scene, width, depth) {
  const size = 512;
  const texture = new DynamicTexture("coaster-deck", { width: size, height: size }, scene, true);
  const ctx = texture.getContext();
  // Same checker size on every platform size: 10 squares across the starter deck.
  const across = Math.round((width / 46) * 10);
  const down = Math.round((depth / 34) * 10);
  const stepX = size / across;
  const stepY = size / down;
  for (let y = 0; y < down; y += 1) {
    for (let x = 0; x < across; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ffc8dc" : "#ffadcb";
      ctx.fillRect(x * stepX, y * stepY, stepX + 1, stepY + 1);
    }
  }
  ctx.strokeStyle = "#ff4d8d";
  ctx.lineWidth = 22;
  ctx.strokeRect(12, 12, size - 24, size - 24);
  texture.update();
  const material = new StandardMaterial("coaster-deck-mat", scene);
  material.diffuseTexture = texture;
  // Up here the sun and sky add up to well over full light, so pale pinks clip to white.
  material.diffuseColor = new Color3(0.68, 0.68, 0.68);
  material.specularColor = new Color3(0.08, 0.08, 0.08);
  return material;
}

function makeSign(scene, parent, name, text, x, y, z, yaw, width, height, background, ink) {
  const texture = new DynamicTexture(`${name}-tex`, { width: 512, height: 256 }, scene, true);
  return paintSign(scene, parent, name, text, x, y, z, yaw, width, height, background, ink, texture);
}

function writeBoard(texture, lines, background, ink) {
  const ctx = texture.getContext();
  const rows = Array.isArray(lines) ? lines : [lines];
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 14;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (rows.length < 2) {
    const text = rows[0] ?? "";
    let size = 96;
    do {
      ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
      size -= 4;
    } while (ctx.measureText(text).width > 460 && size > 28);
    ctx.fillText(text, 256, 132);
  } else {
    ctx.font = "900 46px Arial Black, Arial, sans-serif";
    ctx.fillText(rows[0], 256, 82);
    let size = 78;
    do {
      ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
      size -= 4;
    } while (ctx.measureText(rows[1]).width > 440 && size > 36);
    ctx.fillText(rows[1], 256, 164);
  }
  texture.update();
}

function paintSign(scene, parent, name, text, x, y, z, yaw, width, height, background, ink, texture) {
  writeBoard(texture, text, background, ink);
  const material = unlitMaterial(scene, `${name}-mat`, texture, { alpha: false });
  material.backFaceCulling = true;
  const meshes = [0, Math.PI].map((flip) => {
    const board = MeshBuilder.CreatePlane(`${name}-board`, { width, height }, scene);
    board.material = material;
    board.parent = parent;
    board.position.set(x, y, z);
    board.rotation.y = yaw + flip;
    board.isPickable = false;
    return board;
  });
  return { meshes, owned: [material, texture] };
}

function markGate(scene, pad) {
  if (!pad?.mesh || pad.coasterGate || pad.role !== "checkpoint" || pad.level !== COASTER_LEVEL) return;
  const top = pad.thickness ?? 0.45;
  const reach = pad.walkRadius ?? 1.5;
  const texture = new DynamicTexture(`${pad.id}-coaster-tex`, { width: 512, height: 256 }, scene, true);
  pad.coasterGate = paintSign(
    scene,
    pad.mesh,
    `${pad.id}-coaster`,
    t("coaster.gate"),
    -reach * 0.1,
    top + 1.9,
    reach * 0.45,
    0,
    2.5,
    0.66,
    "#ff4d8d",
    "#fff8fb",
    texture,
  );
}

function clearGate(pad) {
  const kit = pad?.coasterGate;
  if (!kit) return;
  pad.coasterGate = null;
  for (const mesh of kit.meshes) mesh.dispose(false, false);
  for (const item of kit.owned) item.dispose();
}

function coinGlyph() {
  const glyph = document.createElement("span");
  glyph.className = "coin-glyph";
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
}
