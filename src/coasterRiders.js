import { Quaternion, TransformNode } from "@babylonjs/core";
import { coasterGuests } from "./bot.js";
import { createFigure } from "./figure.js";

const GUESTS = 3;
const BOARD = 0.72;
const ALIGHT = 0.7;
/** Seconds the line waits between laps, so they don't leap straight back in. */
const BETWEEN = 1.05;
/** Meters over which a guest cart eases off the side dock and onto the rails. */
const JOIN = 4.5;
/** How far the dock sits beside the station, clear of the player's own cart. */
const SIDE = 1.75;
/** Waiting spots on the deck, left of the station and outside the ride prompt. Spread in x so the line reads from the deck. */
const LINE = [
  { x: -3.6, z: 7.8 },
  { x: -5.2, z: 6.6 },
  { x: -6.8, z: 5.4 },
];

/**
 * While you're online in your coaster yard, a few regulars line up and ride the track
 * you've built. Each sits in their own cart, on the same rail sample as your ride, and a
 * lap that gets back to the station pays the yard. Leaving, going offline, or editing the
 * track sends the current lap away with no pay. No physics: the cart is moved along the sample.
 */
export function createCoasterRiders(scene, graphics, coaster) {
  const roster = coasterGuests(GUESTS);
  const origin = coaster.origin;
  const guests = [];
  const order = [0, 1, 2];
  const trip = { travel: 0, dir: 1 };
  const yaw = new Quaternion();
  const cart = new TransformNode("coaster-guest-cart", scene);
  cart.rotationQuaternion = new Quaternion();
  cart.setEnabled(false);

  let online = false;
  let shown = false;
  let phase = "queue";
  let blend = 0;
  let wait = 0.8;
  let stamp = 0;
  let style = null;
  let cartTick = () => {};
  let axisRev = -1;
  const axis = { x: -1, z: 0 };

  function stayClear(root) {
    for (const mesh of root.getChildMeshes()) {
      mesh.isPickable = false;
      if (mesh.metadata?.blocksCamera) mesh.metadata.blocksCamera = false;
    }
  }

  function dress() {
    const id = coaster.upgrades.cart;
    if (id === style) return;
    style = id;
    cartTick = coaster.dressGuestCart(cart).tick;
    stayClear(cart);
  }

  function buildNext() {
    const spec = roster[guests.length];
    const figure = createFigure(scene, graphics);
    figure.setName(spec.name);
    figure.avatar.apply(spec.look);
    stayClear(figure.avatar.root);
    figure.setShown(true);
    guests.push(figure);
  }

  function hide() {
    shown = false;
    phase = "queue";
    blend = 0;
    wait = 0.8;
    trip.travel = 0;
    trip.dir = 1;
    cart.setEnabled(false);
    for (const figure of guests) figure.setShown(false);
  }

  // Fixed side of the station, so the way home doesn't swing the dock onto the catwalk.
  function dockAxis() {
    if (axisRev !== coaster.trackRev) {
      axisRev = coaster.trackRev;
      const seat = coaster.seatAt(0, false);
      axis.x = -Math.cos(seat.heading);
      axis.z = Math.sin(seat.heading);
    }
    return axis;
  }

  function shifted(seat, travel) {
    const u = Math.min(1, Math.max(0, travel) / JOIN);
    const slide = 1 - u * u * (3 - 2 * u);
    const side = SIDE * slide;
    const drop = Math.max(0, seat.cartY - origin.y) * slide;
    const { x, z } = dockAxis();
    return {
      ...seat,
      cartX: seat.cartX + x * side,
      cartY: seat.cartY - drop,
      cartZ: seat.cartZ + z * side,
      footX: seat.footX + x * side,
      footY: seat.footY - drop,
      footZ: seat.footZ + z * side,
    };
  }

  function dock() {
    return shifted(coaster.seatAt(0, false), 0);
  }

  function rideSeat() {
    return shifted(coaster.seatAt(trip.travel, trip.dir < 0), trip.travel);
  }

  function spot(index) {
    const local = LINE[Math.min(index, LINE.length - 1)];
    return {
      x: origin.x + local.x,
      y: origin.y,
      z: origin.z + local.z,
      heading: Math.atan2(-local.x, 12.2 - local.z),
    };
  }

  function step(dt) {
    // A half-finished lap never pays: the track changed, or it is too short to ride.
    if (phase !== "queue" && (coaster.trackRev !== stamp || coaster.trackLength < 4)) {
      phase = "queue";
      blend = 0;
      trip.travel = 0;
      trip.dir = 1;
      wait = 0.6;
      return false;
    }
    // Your own ride goes first. A guest already out on the track waits where they are.
    if (coaster.riding) {
      if (phase === "queue") wait = Math.max(wait, 0.45);
      return false;
    }
    if (phase === "board") {
      blend = Math.min(1, blend + dt / BOARD);
      if (blend >= 1) phase = "ride";
      return false;
    }
    if (phase === "ride") {
      const moved = coaster.advanceGuest(trip, dt);
      if (!moved) {
        phase = "queue";
        wait = 0.6;
        return false;
      }
      if (moved.done) {
        phase = "alight";
        blend = 0;
        return true;
      }
      return false;
    }
    if (phase === "alight") {
      blend = Math.min(1, blend + dt / ALIGHT);
      if (blend >= 1) {
        order.push(order.shift());
        phase = "queue";
        wait = BETWEEN;
      }
      return false;
    }
    wait -= dt;
    if (wait <= 0 && guests[order[0]] && coaster.trackLength >= 4) {
      phase = "board";
      blend = 0;
      stamp = coaster.trackRev;
      trip.travel = 0;
      trip.dir = 1;
    }
    return false;
  }

  function placeCart(pose, bob) {
    cart.position.set(pose.cartX, pose.cartY + bob, pose.cartZ);
    Quaternion.RotationYawPitchRollToRef(pose.heading, 0, 0, yaw);
    cart.rotationQuaternion.copyFrom(yaw);
  }

  function placeFigure(figure, pose, sitting, moving, dt, camera, time) {
    if (!figure.shown) figure.setShown(true);
    figure.update(
      dt,
      {
        x: pose.x,
        y: pose.y,
        z: pose.z,
        facing: pose.heading,
        sitting,
        moving,
        airborne: false,
        running: false,
        time,
      },
      camera,
      time,
    );
  }

  function poseAll(dt, camera, time) {
    const bob = phase === "queue" ? Math.sin(time * 2.2) * 0.035 : 0;
    const seat = phase === "ride" ? rideSeat() : dock();
    placeCart(seat, bob);
    const rider = order[0];
    const eased = ease(blend);
    let slot = 0;
    for (const index of order) {
      const figure = guests[index];
      if (!figure) continue;
      if (index === rider && phase !== "queue") {
        const from = spot(0);
        const back = spot(Math.min(guests.length, LINE.length) - 1);
        if (phase === "board") {
          placeFigure(
            figure,
            {
              x: mix(from.x, seat.footX, eased),
              y: mix(from.y, seat.footY, eased),
              z: mix(from.z, seat.footZ, eased),
              heading: mixAngle(from.heading, seat.heading, eased),
            },
            eased > 0.82,
            eased <= 0.82,
            dt,
            camera,
            time,
          );
        } else if (phase === "ride") {
          placeFigure(figure, { x: seat.footX, y: seat.footY, z: seat.footZ, heading: seat.heading }, true, false, dt, camera, time);
        } else {
          placeFigure(
            figure,
            {
              x: mix(seat.footX, back.x, eased),
              y: mix(seat.footY, back.y, eased),
              z: mix(seat.footZ, back.z, eased),
              heading: mixAngle(seat.heading, back.heading, eased),
            },
            eased < 0.18,
            eased >= 0.18,
            dt,
            camera,
            time,
          );
        }
        continue;
      }
      const at = spot(slot);
      slot += 1;
      placeFigure(
        figure,
        { x: at.x, y: at.y + Math.sin(time * 2 + index) * 0.012, z: at.z, heading: at.heading },
        false,
        false,
        dt,
        camera,
        time,
      );
    }
  }

  return {
    /** `queue`, `board`, `ride`, or `alight`. */
    get phase() {
      return phase;
    },
    /** Online room is connected. Guests still stay hidden until you're in the yard. */
    setOnline(on) {
      online = on;
      if (!on && shown) hide();
    },
    /**
     * One frame. Returns true the frame a guest cart gets back to the station.
     * Returns false, and does not pay, when the lap is dropped.
     */
    update(dt, camera, time) {
      if (!online || !coaster.active) {
        if (shown) hide();
        return false;
      }
      if (!shown) {
        shown = true;
        wait = 0.8;
      }
      if (guests.length < GUESTS) buildNext();
      dress();
      if (!cart.isEnabled()) cart.setEnabled(true);
      const paid = step(dt);
      poseAll(dt, camera, time);
      cartTick(time);
      return paid;
    },
  };
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixAngle(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * t;
}
