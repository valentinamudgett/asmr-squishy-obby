import {
  CharacterSupportedState,
  FreeCamera,
  PhysicsCharacterController,
  PhysicsRaycastResult,
  Ray,
  Vector3,
} from "@babylonjs/core";

export const GRAVITY = -24;
export const MOVE_SPEED = 4.4;
// Ground run on a rainbow stair. Jumps keep the normal air speed.
export const STAIR_RUN = 1.3;
const STEP_HEIGHT = 0.28;
// Rainbow treads rise up to ~0.26, too close to STEP_HEIGHT for the step-up probe.
const STAIR_STEP_HEIGHT = 0.42;
// The bun and the other rounded foods curve down well before the silhouette.
// 0.32 keeps that slope underfoot. A vertical side is still a wall.
const SLOPE_COSINE = 0.32;
// Stair risers meet the capsule at a contact normal only ~0.37 up.
const STAIR_SLOPE_COSINE = 0.2;
const STEP_HOP_SECONDS = 0.2;
/** Still rising faster than this (m/s) after a jump means the feet have not come back down yet. */
const TAKEOFF_RISE = 1;
/** How far the feet may drift from where they rested on the pad and still count as standing. */
const HOLD_GROUND_GAP = 0.05;
export const JUMP_SPEED = 7.6;
// Second press in the air. Keeps some of the upward speed, then adds another hop.
export const DOUBLE_JUMP_SPEED = 7.8;
const DOUBLE_CARRY = 1.34;
// Angel costume: the second press flies instead. Holds about level with a gentle bob, then drops.
export const FLIGHT_SECONDS = 45;
const FLY_SPEED = 6.2;
const FLY_LIFT = 1.2;
const FLY_BOB = 0.35;
const TRICK_SECONDS = 0.5;
const TRICKS = ["front", "back", "spin"];
// Horizontal speed of a normal jump. With JUMP_SPEED this carries about 4.7m.
export const AIR_SPEED = 7.5;
// Springs stay on the shorter carry the pads were spaced for, so a pop still lands on the next one.
export const SPRING_AIR_SPEED = 5.4;
// A spring landing launches along the held direction. At SPRING_AIR_SPEED the
// hang time covers the center-to-center gap onto the next pad.
export const SPRING_POP = 13.2;
export const CAPSULE_HEIGHT = 1.12;
export const CAPSULE_RADIUS = 0.3;
export const FOOT_OFFSET = CAPSULE_HEIGHT / 2;
export const KILL_Y = -7;
/** Top speed of the long fall after you drop off the course. */
const PLUNGE_SPEED = 30;

/** How fast the camera swings round behind the way the avatar faces. */
const FOLLOW_TURN = 9;
/** How fast the camera position catches up with where it should sit. */
const FOLLOW_MOVE = 10;
/** A held direction keeps its control frame until the input turns this far (radians). */
const NEW_INPUT_TURN = 0.7;
const AIR_BOOST = AIR_SPEED / MOVE_SPEED;
const SPRING_BOOST = SPRING_AIR_SPEED / MOVE_SPEED;
const UP = new Vector3(0, 1, 0);
const KEY_ACTIONS = {
  KeyW: "up",
  KeyA: "left",
  KeyS: "down",
  KeyD: "right",
  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowRight: "right",
  Numpad8: "up",
  Numpad4: "left",
  Numpad2: "down",
  Numpad6: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  Up: "up",
  Left: "left",
  Down: "down",
  Right: "right",
};

function actionFor(event) {
  return KEY_ACTIONS[event.key] ?? KEY_ACTIONS[event.key?.toLowerCase?.()] ?? KEY_ACTIONS[event.code];
}
const DOWN = new Vector3(0, -1, 0);
const GRAVITY_VECTOR = new Vector3(0, GRAVITY, 0);
const NO_GRAVITY = new Vector3(0, 0, 0);

// Swimming, only where hooks.waterAt finds water (the city's pools and sea).
/** Water at least this deep (surface to floor) is for swimming. Shallower is wading. */
const SWIM_DEPTH = 1;
/** Back to wading once it gets this shallow, so the change doesn't flicker on a slope. */
const WADE_DEPTH = 0.88;
/** How far the feet hang below the surface while afloat: head and shoulders stay out. */
const FLOAT_DEPTH = 0.85;
const SWIM_SHARE = 0.55;
const STROKE_SPEED = 3.4;
const STROKE_WAIT = 0.55;
const SWIM_TOP_SPEED = 5.2;
/** A pool edge, step, or ladder top at most this far above the surface can be climbed. */
const CLIMB_UP = 0.6;
/** Pushing into a taller edge this long still climbs it, up to CLIMB_STUCK, so nobody is stuck in a pool. */
const STUCK_SECONDS = 1.2;
const CLIMB_STUCK = 1.5;
const CLIMB_SECONDS = 0.6;

export function createPlayer(scene, spawn, hooks, heading = 0) {
  const controller = new PhysicsCharacterController(
    spawn.clone(),
    { capsuleHeight: CAPSULE_HEIGHT, capsuleRadius: CAPSULE_RADIUS },
    scene,
  );
  controller.acceleration = 1;
  controller.maxAcceleration = 80;
  controller.maxCharacterSpeedForSolver = 40;
  controller.maxStepHeight = STEP_HEIGHT;
  controller.keepDistance = 0.04;
  controller.staticFriction = 0.2;
  controller.dynamicFriction = 0.4;

  const camera = new FreeCamera("camera", new Vector3(spawn.x, spawn.y + 2, spawn.z - 7), scene);
  camera.minZ = 0.1;
  camera.maxZ = 1400;
  camera.fov = 0.86;

  const position = spawn.clone();
  const next = new Vector3();
  const eased = new Vector3();
  const forward = new Vector3();
  const wish = new Vector3();
  const move = new Vector3();
  const desiredCam = new Vector3();
  const camHold = new Vector3();
  const look = new Vector3();
  const aimPoint = new Vector3();
  const foot = new Vector3();
  const ray = new Ray(Vector3.Zero(), Vector3.Up(), 1);

  let state = "IN_AIR";
  let yaw = heading;
  let aim = heading;
  let heldAngle = null;
  let lookedAround = false;
  let steerPause = 0;
  let pitch = 0.48;
  let distance = 7.3;
  /** Extra camera height and distance for the car you're in, eased in and out. */
  let viewLift = 0;
  let viewBack = 0;
  let aimRaise = 0;
  let facing = heading;
  let coyote = 0;
  let jumpBuffer = 0;
  let jumpQueued = 0;
  let airJumpLeft = false;
  let canFly = false;
  let flying = false;
  let flyTime = 0;
  let trick = null;
  let trickTime = 0;
  let trickFresh = false;
  let lastTrick = -1;
  let mute = 0.3;
  let airImpact = 0;
  let airTime = 0;
  let launched = true;
  let stairRun = false;
  let airCarry = AIR_BOOST;
  let speedBoost = 1;
  let boostLeft = 0;
  let dip = 0;
  let dipVel = 0;
  const swim = {
    on: false,
    time: 0,
    strokeWait: 0,
    stuck: 0,
    climb: null,
    wade: 0,
    rest: 0,
    from: new Vector3(),
    to: new Vector3(),
    vel: new Vector3(),
    dir: new Vector3(),
    ray: new PhysicsRaycastResult(),
    a: new Vector3(),
    b: new Vector3(),
  };
  // Last good support reading and the pad it came from, for frames where the check misses that pad.
  const heldGround = {
    supportedState: CharacterSupportedState.SUPPORTED,
    averageSurfaceNormal: new Vector3(0, 1, 0),
    averageSurfaceVelocity: new Vector3(),
    averageAngularSurfaceVelocity: new Vector3(),
    isSurfaceDynamic: false,
  };
  let groundPad = null;
  // Pad the feet left, so a coyote jump still springs when that pad is a green dumpling.
  let takeoffPad = null;
  let groundGap = 0;
  // The moving pad under the feet and where it was last frame. Its step is applied to the body directly.
  let ridePad = null;
  const rideFrom = new Vector3();
  const rideVelocity = new Vector3();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const keys = new Set();
  const stick = { x: 0, y: 0, active: false };

  const canvas = scene.getEngine().getRenderingCanvas();
  bindDesktop(canvas, keys, {
    onJump: () => {
      queueJump();
    },
    onDragStart: (x, y) => {
      dragging = true;
      lastX = x;
      lastY = y;
    },
    onDrag: (x, y) => {
      if (!dragging) return;
      const dx = x - lastX;
      const dy = y - lastY;
      if (dx !== 0 || dy !== 0) {
        steerPause = 0.7;
        lookedAround = true;
      }
      yaw -= dx * 0.005;
      pitch = clamp(pitch + dy * 0.0035, 0.2, 1.15);
      lastX = x;
      lastY = y;
    },
    onDragEnd: () => {
      dragging = false;
    },
    onWheel: (delta) => {
      distance = clamp(distance + Math.sign(delta) * 0.38, 5.2, 10.2);
    },
  });

  snapCamera(spawn);

  function snapCamera(from) {
    look.set(from.x, from.y - FOOT_OFFSET + 1.05, from.z);
    cameraOffset(camHold, look);
    camera.position.copyFrom(camHold);
    camera.setTarget(raisedAim(look));
  }

  // Aims above the avatar by a share of the camera's height over it, so the view tips toward the horizon.
  function raisedAim(focus) {
    aimPoint.copyFrom(focus);
    aimPoint.y += Math.sin(pitch) * distance * aimRaise;
    return aimPoint;
  }

  function cameraOffset(target, focus) {
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    target.set(
      focus.x - Math.sin(yaw) * cp * distance,
      focus.y + sp * distance,
      focus.z - Math.cos(yaw) * cp * distance,
    );
  }

  function readWish() {
    let x = 0;
    let z = 0;
    if (keys.has("left")) x -= 1;
    if (keys.has("right")) x += 1;
    if (keys.has("up")) z += 1;
    if (keys.has("down")) z -= 1;
    x += stick.x;
    z += -stick.y;
    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    // Holding a direction keeps its frame, so the camera can swing round behind without bending
    // the run. A new direction starts from wherever the camera points now.
    const held = length > 0.2;
    const angle = Math.atan2(x, z);
    if (!held || dragging || steerPause > 0) {
      aim = yaw;
      heldAngle = held ? angle : null;
    } else if (heldAngle === null || Math.abs(angleDelta(angle, heldAngle)) > NEW_INPUT_TURN) {
      aim = yaw;
      heldAngle = angle;
    }
    const sin = Math.sin(aim);
    const cos = Math.cos(aim);
    wish.set(sin * z + cos * x, 0, cos * z - sin * x);
    if (wish.lengthSquared() > 1) wish.normalize();
    wish.scaleInPlace(MOVE_SPEED * speedBoost);
  }

  return {
    camera,
    stick,
    requestJump() {
      queueJump();
    },
    /** True when a jump was pressed and not used yet. Clears it. */
    consumeJump() {
      if (jumpQueued <= 0) return false;
      jumpQueued = 0;
      jumpBuffer = 0;
      return true;
    },
    setStick(x, y) {
      stick.x = x;
      stick.y = y;
    },
    setAimRaise(share) {
      aimRaise = share;
    },
    /** Wearing the angel costume turns the double jump into flight. */
    setAngelFlight(on) {
      canFly = on;
      if (!on) land();
    },
    get flying() {
      return flying;
    },
    get swimming() {
      return swim.on || Boolean(swim.climb);
    },
    /** Runs and air moves `multiplier` times faster for `seconds`. A multiplier of 1 ends it. */
    setSpeedBoost(multiplier, seconds = 0) {
      speedBoost = multiplier > 1 && seconds > 0 ? multiplier : 1;
      boostLeft = speedBoost > 1 ? seconds : 0;
    },
    get boostLeft() {
      return boostLeft;
    },
    respawn(spot, nextHeading = 0) {
      land();
      leaveWater();
      controller.setPosition(spot);
      controller.setVelocity(Vector3.Zero());
      state = "IN_AIR";
      launched = true;
      stairRun = false;
      mute = 0.35;
      coyote = 0;
      jumpBuffer = 0;
      jumpQueued = 0;
      airJumpLeft = false;
      trick = null;
      trickTime = 0;
      trickFresh = false;
      yaw = nextHeading;
      aim = nextHeading;
      heldAngle = null;
      lookedAround = false;
      steerPause = 0;
      facing = nextHeading;
      dip = 0;
      dipVel = 0;
      groundPad = null;
      takeoffPad = null;
      ridePad = null;
      position.copyFrom(spot);
      snapCamera(spot);
    },
    // Keeps a lava fall from shooting through the crust while the yell plays.
    easeFall(maxDrop) {
      const velocity = controller.getVelocity();
      eased.copyFrom(velocity);
      const limit = maxDrop > 0 ? maxDrop : 0;
      if (eased.y < -limit) eased.y = -limit;
      eased.x *= 0.2;
      eased.z *= 0.2;
      controller.setVelocity(eased);
    },
    /** The long fall off the course: no steering, and it passes through any pads below. */
    plunge(dt) {
      land();
      jumpBuffer = 0;
      jumpQueued = 0;
      trick = null;
      trickTime = 0;
      state = "IN_AIR";
      launched = true;
      ridePad = null;
      next.copyFrom(controller.getVelocity());
      next.y = Math.max(-PLUNGE_SPEED, next.y + GRAVITY * dt);
      const drag = Math.exp(-1.2 * dt);
      next.x *= drag;
      next.z *= drag;
      controller.setVelocity(next);
      position.copyFrom(controller.getPosition());
      position.addInPlaceFromFloats(next.x * dt, next.y * dt, next.z * dt);
      controller.setPosition(position);
      if (!dragging) steerPause = Math.max(0, steerPause - dt);
      followCamera(dt);
      return {
        position,
        foot,
        pad: null,
        grounded: false,
        walking: false,
        onStair: false,
        airborne: true,
        state: "PLUNGE",
        justLanded: false,
        jumped: false,
        trick: null,
        trickP: 0,
        facing,
        speed: Math.hypot(next.x, next.z),
        impact: 0,
        supportX: 0,
      };
    },
    /** Hangs the capsule center at `spot` (a zipline): no gravity, no steering, the camera follows. */
    /** `view` ({ lift, back }) raises and pulls the camera back, for tall or long cars. */
    carry(dt, spot, nextFacing, view = null) {
      land();
      leaveWater();
      tickBoost(dt);
      jumpBuffer = 0;
      jumpQueued = 0;
      trick = null;
      trickTime = 0;
      state = "IN_AIR";
      launched = true;
      airJumpLeft = false;
      heldAngle = null;
      ridePad = null;
      groundPad = null;
      controller.setVelocity(Vector3.Zero());
      controller.setPosition(spot);
      position.copyFrom(spot);
      facing = lerpAngle(facing, nextFacing, 1 - Math.exp(-10 * dt));
      if (!dragging) steerPause = Math.max(0, steerPause - dt);
      if (!dragging && steerPause <= 0) yaw = lerpAngle(yaw, facing, 1 - Math.exp(-FOLLOW_TURN * dt));
      aim = yaw;
      followCamera(dt, view);
      return {
        position,
        foot,
        pad: null,
        grounded: false,
        walking: false,
        onStair: false,
        airborne: true,
        state: "CARRIED",
        justLanded: false,
        jumped: false,
        trick: null,
        trickP: 0,
        flying: false,
        facing,
        speed: 0,
        impact: 0,
        supportX: 0,
      };
    },
    update(dt, allowInput) {
      mute = Math.max(0, mute - dt);
      tickBoost(dt);
      trickFresh = false;
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (!allowInput) {
        land();
        jumpBuffer = 0;
        jumpQueued = 0;
        trick = null;
        trickTime = 0;
      } else if (jumpBuffer <= 0) jumpQueued = 0;

      position.copyFrom(controller.getPosition());
      rideVelocity.set(0, 0, 0);
      if (ridePad && !ridePad.removed && !ridePad.gone) {
        // Step with the pad itself. Its surface velocity is lost on the frames the feet lift off it,
        // and the pad slides out from under you.
        const at = ridePad.mesh.position;
        rideVelocity.set(at.x - rideFrom.x, at.y - rideFrom.y, at.z - rideFrom.z);
        position.addInPlace(rideVelocity);
        controller.setPosition(position);
        rideVelocity.scaleInPlace(1 / dt);
      }
      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      const water = hooks.waterAt ? hooks.waterAt(foot) : null;
      swim.wade = 0;
      if (water || swim.on || swim.climb) {
        const swum = swimStep(dt, allowInput, water);
        if (swum) return swum;
      }
      let support = controller.checkSupport(dt, DOWN);
      let grounded = support.supportedState === CharacterSupportedState.SUPPORTED;
      // On the way up a jump grazes the pad's rim or the next stair tread, and the check reads that as
      // standing. Landing there would end the jump and take away the double jump.
      if (grounded && launched && controller.getVelocity().y - support.averageSurfaceVelocity.y > TAKEOFF_RISE) {
        grounded = false;
      }
      if (grounded) {
        groundPad = hooks.findPad(foot);
        if (groundPad?.motion) support.averageSurfaceVelocity.setAll(0);
        heldGround.averageSurfaceNormal.copyFrom(support.averageSurfaceNormal);
        heldGround.averageSurfaceVelocity.copyFrom(support.averageSurfaceVelocity);
        groundGap = groundPad ? foot.y - padTop(groundPad) : 0;
      } else if (state === "ON_GROUND" && stillOn(groundPad)) {
        // The support check keeps missing a pad that is moving down while the feet are still on it.
        // Stay standing on the last reading, at the same height over the pad, instead of dropping
        // into a fall and landing again every few frames.
        support = heldGround;
        grounded = true;
        position.y = padTop(groundPad) + groundGap + FOOT_OFFSET;
        controller.setPosition(position);
        foot.y = position.y - FOOT_OFFSET;
      }
      if (!dragging) steerPause = Math.max(0, steerPause - dt);

      const previous = state;
      if (state === "START_JUMP") state = "IN_AIR";
      else state = grounded ? "ON_GROUND" : "IN_AIR";
      const justLanded = previous === "IN_AIR" && state === "ON_GROUND";

      if (state === "ON_GROUND") coyote = 0.1;
      else coyote = Math.max(0, coyote - dt);

      if (allowInput) readWish();
      else {
        wish.set(0, 0, 0);
        heldAngle = null;
      }
      if (swim.wade > 0) wish.scaleInPlace(1 - 0.45 * swim.wade);
      const velocity = controller.getVelocity();
      next.copyFrom(velocity);
      forward.set(Math.sin(aim), 0, Math.cos(aim));
      if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);

      position.copyFrom(controller.getPosition());
      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      const pad = hooks.findPad(foot);
      if (state === "ON_GROUND" && pad) takeoffPad = pad;
      const canJump = state === "ON_GROUND" || coyote > 0;
      const wantJump = allowInput && jumpQueued > 0 && canJump;
      let jumped = false;
      let doubleJumped = false;
      let coyoteJump = false;

      const onStair = state === "ON_GROUND" && Boolean(pad?.stair);
      const climbing = onStair || (stairRun && !launched && state !== "ON_GROUND");
      controller.maxStepHeight = climbing ? STAIR_STEP_HEIGHT : STEP_HEIGHT;
      controller.maxSlopeCosine = climbing ? STAIR_SLOPE_COSINE : SLOPE_COSINE;
      if (state === "ON_GROUND") {
        land();
        launched = false;
        airJumpLeft = false;
        stairRun = onStair;
        move.copyFrom(wish);
        if (onStair) move.scaleInPlace(STAIR_RUN);
        // Catwalk belt: step along the planks first. Rails, slopes, and a jump still run after this.
        if (!onStair && !wantJump && allowInput && hooks.beltStep) {
          const step = hooks.beltStep(foot, wish, dt);
          if (step) {
            position.x += step.x;
            position.y += step.y;
            position.z += step.z;
            controller.setPosition(position);
            if (wish.lengthSquared() <= 0.4) facing = lerpAngle(facing, step.heading, 1 - Math.exp(-8 * dt));
          }
        }
        const moved = controller.calculateMovement(
          dt,
          forward,
          support.averageSurfaceNormal,
          velocity,
          support.averageSurfaceVelocity,
          move,
          UP,
        );
        next.copyFrom(moved);
        // calculateMovement slows the run against the next tread's riser. The controller only steps up
        // when its forward probe clears keepDistance, so hand it the full run on stairs.
        if (onStair) {
          next.x = move.x;
          next.z = move.z;
        }
        if (wantJump) {
          takeQueuedJump();
          const spring = pad?.kind === "spring";
          launch(spring ? SPRING_POP : JUMP_SPEED, spring ? SPRING_BOOST : AIR_BOOST, spring);
          if (wish.lengthSquared() <= 0.2) {
            next.x += rideVelocity.x;
            next.z += rideVelocity.z;
          }
          jumped = true;
        } else if (justLanded && pad?.kind === "spring" && mute <= 0) {
          launch(SPRING_POP, SPRING_BOOST, true);
        } else {
          // Ride a pad that is bobbing down instead of hovering where it was.
          const floor = Math.min(0, support.averageSurfaceVelocity.y);
          if (next.y < floor) next.y = floor;
        }
      } else {
        if (previous === "ON_GROUND") airCarry = stairRun ? STAIR_RUN : AIR_BOOST;
        // Riding up a tread edge leaves upward speed behind. Drop it so the run settles on the tread.
        if (stairRun && !launched) next.y = Math.min(next.y, 0);
        // Walked off a pad: the queued press is the ground jump, including a spring they just left.
        // One press. The extra air jump waits for a later press, and a jump that already launched this fall does not get coyote.
        const coyoteLaunch = allowInput && jumpQueued > 0 && coyote > 0 && !launched;
        if (coyoteLaunch) {
          takeQueuedJump();
          const spring = takeoffPad?.kind === "spring";
          launch(spring ? SPRING_POP : JUMP_SPEED, spring ? SPRING_BOOST : AIR_BOOST, spring);
          if (wish.lengthSquared() <= 0.2) {
            next.x += rideVelocity.x;
            next.z += rideVelocity.z;
          }
          jumped = true;
          coyoteJump = true;
        } else {
          if (flying) {
            flyTime += dt;
            // Another press while flying lets go and drops you.
            if (allowInput && jumpQueued > 0) {
              takeQueuedJump();
              land();
            } else if (flyTime >= FLIGHT_SECONDS) land();
          }
          if (flying) {
            const hover = Math.sin(flyTime * 2.4) * FLY_BOB;
            next.y += (hover - next.y) * (1 - Math.exp(-6 * dt));
            const glide = 1 - Math.exp(-4 * dt);
            next.x += ((wish.x * FLY_SPEED) / MOVE_SPEED - next.x) * glide;
            next.z += ((wish.z * FLY_SPEED) / MOVE_SPEED - next.z) * glide;
          } else {
            next.y += GRAVITY * dt;
            const blend = 1 - Math.exp(-5.5 * dt);
            next.x += (wish.x * airCarry - next.x) * blend;
            next.z += (wish.z * airCarry - next.z) * blend;
          }
          if (allowInput && jumpQueued > 0 && airJumpLeft && launched && canFly) {
            // Drop any extra buffered press so it can't end the flight on the next frame.
            jumpQueued = 0;
            jumpBuffer = 0;
            flying = true;
            flyTime = 0;
            airJumpLeft = false;
            stairRun = false;
            coyote = 0;
            trick = null;
            trickTime = 0;
            next.y = Math.max(next.y, FLY_LIFT);
            doubleJumped = true;
            hooks.onFly?.(true);
          }
          // One extra press after a jump. It pops higher and, if you're moving, carries farther.
          if (allowInput && jumpQueued > 0 && airJumpLeft && launched) {
            takeQueuedJump();
            const carry = Math.max(airCarry, AIR_BOOST) * DOUBLE_CARRY;
            airCarry = carry;
            const rising = Math.max(0, next.y);
            next.y = rising * 0.45 + DOUBLE_JUMP_SPEED;
            if (wish.lengthSquared() > 0.2) {
              next.x = wish.x * carry;
              next.z = wish.z * carry;
            } else {
              const horiz = Math.hypot(next.x, next.z);
              const target = MOVE_SPEED * carry;
              if (horiz > 0.35 && target > horiz) {
                const scale = target / horiz;
                next.x *= scale;
                next.z *= scale;
              }
            }
            state = "START_JUMP";
            launched = true;
            airJumpLeft = false;
            stairRun = false;
            coyote = 0;
            jumped = true;
            doubleJumped = true;
            beginTrick();
          }
        }
      }

      if (previous === "IN_AIR" || previous === "START_JUMP") {
        airImpact = Math.max(airImpact, Math.max(0, -velocity.y));
      }
      const impact = justLanded ? airImpact : Math.max(0, -velocity.y);
      if (justLanded) airImpact = 0;
      // Bobbing pads can drop out from under the feet for a frame or two; that isn't a landing.
      const realLanding = justLanded && airTime > 0.12;
      airTime = state === "ON_GROUND" ? 0 : airTime + dt;
      if (realLanding && pad && mute <= 0) {
        dip = Math.max(dip, Math.min(0.16, impact * 0.014));
        dipVel = 0;
        hooks.onLand(pad, impact);
      }
      if (jumped && !justLanded && mute <= 0) {
        const jumpPad = coyoteJump ? (takeoffPad ?? pad) : pad;
        if (jumpPad) hooks.onJump(jumpPad);
      }

      const speed = Math.hypot(next.x, next.z);
      const looked = lookedAround;
      if (state === "ON_GROUND") {
        // The mesh eases upright on its own. Clearing the trick here keeps the next hop from resuming it.
        trick = null;
        trickTime = 0;
      } else if (trick && !trickFresh) {
        trickTime += dt;
        if (trickTime >= TRICK_SECONDS) trickTime = TRICK_SECONDS;
      }
      const trickOut = trick;
      const trickP = trick ? trickTime / TRICK_SECONDS : 0;
      if (trick && trickTime >= TRICK_SECONDS) {
        trick = null;
        trickTime = 0;
      }
      controller.setVelocity(next);
      controller.integrate(dt, support, GRAVITY_VECTOR);
      position.copyFrom(controller.getPosition());

      if (wish.lengthSquared() > 0.4) {
        const targetFacing = Math.atan2(wish.x, wish.z);
        facing = lerpAngle(facing, targetFacing, 1 - Math.exp(-10 * dt));
        lookedAround = false;
        if (!dragging) steerPause = 0;
      }
      // Keep the camera behind the avatar. After a drag while standing still, hold the view until you move.
      if (!dragging && steerPause <= 0 && !lookedAround) {
        yaw = lerpAngle(yaw, facing, 1 - Math.exp(-FOLLOW_TURN * dt));
      }

      dipVel += (-90 * dip - 14 * dipVel) * dt;
      dip += dipVel * dt;

      followCamera(dt);

      // Tread edges and bobbing pads drop the feet for a few frames. Keep running through those.
      const hopping = state !== "ON_GROUND" && !launched && airTime < STEP_HOP_SECONDS;
      const under = hooks.findPad(foot);
      if (state === "ON_GROUND") ridePad = under?.motion ? under : null;
      else if (!hopping || under !== ridePad) ridePad = null;
      if (ridePad) rideFrom.copyFrom(ridePad.mesh.position);

      return {
        position,
        foot,
        pad: under,
        grounded: state === "ON_GROUND",
        walking: (state === "ON_GROUND" || hopping) && wish.lengthSquared() > 0.4,
        onStair: stairRun,
        airborne: state !== "ON_GROUND" && !hopping,
        state,
        justLanded,
        jumped,
        doubleJumped,
        looked,
        trick: trickOut,
        trickP,
        flying,
        facing,
        speed,
        impact,
        supportX: support.averageSurfaceVelocity.x,
        wading: swim.wade,
        water,
      };
    },
  };

  /**
   * One frame in the water. Returns the frame while swimming or climbing out, or null to carry on
   * walking (shallow water only sets `swim.wade`, which slows the walk).
   */
  function swimStep(dt, allowInput, water) {
    if (swim.climb) return climbStep(dt);
    swim.rest = Math.max(0, swim.rest - dt);
    const bottom = water ? bottomDepth(water, foot.x, foot.z) : 0;
    let entered = 0;
    if (!swim.on) {
      if (!water) return null;
      if (bottom < SWIM_DEPTH || water.under < FLOAT_DEPTH - 0.1 || swim.rest > 0) {
        swim.wade = clamp(water.under, 0, 1);
        if (water.under > -0.05 && allowInput && hasWish() && tryClimb(water, dt)) return climbStep(0);
        return null;
      }
      swim.on = true;
      swim.time = 0;
      swim.stuck = 0;
      swim.strokeWait = 0.25;
      entered = Math.max(0.5, -controller.getVelocity().y);
      land();
      trick = null;
      trickTime = 0;
      launched = false;
      airJumpLeft = false;
      stairRun = false;
      ridePad = null;
      groundPad = null;
      controller.maxStepHeight = STEP_HEIGHT;
      controller.maxSlopeCosine = SLOPE_COSINE;
      hooks.onSwim?.(true);
    } else if (!water || bottom < WADE_DEPTH) {
      leaveWater();
      state = "IN_AIR";
      launched = false;
      coyote = 0;
      return null;
    }

    swim.time += dt;
    swim.strokeWait = Math.max(0, swim.strokeWait - dt);
    if (allowInput) readWish();
    else {
      wish.set(0, 0, 0);
      heldAngle = null;
    }
    const velocity = controller.getVelocity();
    swim.vel.copyFrom(velocity);
    const glide = 1 - Math.exp(-2.4 * dt);
    swim.vel.x += (wish.x * SWIM_SHARE - swim.vel.x) * glide;
    swim.vel.z += (wish.z * SWIM_SHARE - swim.vel.z) * glide;
    let stroked = false;
    if (allowInput && jumpQueued > 0) {
      takeQueuedJump();
      if (swim.strokeWait <= 0) {
        swim.strokeWait = STROKE_WAIT;
        const held = hasWish();
        const angle = held ? Math.atan2(wish.x, wish.z) : facing;
        swim.vel.x += Math.sin(angle) * STROKE_SPEED;
        swim.vel.z += Math.cos(angle) * STROKE_SPEED;
        stroked = true;
      }
    }
    const horiz = Math.hypot(swim.vel.x, swim.vel.z);
    if (horiz > SWIM_TOP_SPEED) {
      swim.vel.x *= SWIM_TOP_SPEED / horiz;
      swim.vel.z *= SWIM_TOP_SPEED / horiz;
    }
    // Buoyancy eases the feet to FLOAT_DEPTH with a gentle bob. A dive in sinks a little, then rises.
    let floatFoot = water.surfaceY - FLOAT_DEPTH + Math.sin(swim.time * 2.6) * 0.035;
    // Steps or a beach rising ahead: feet up onto them, so you stand and walk out.
    if (horiz > 0.3) {
      const ahead = bottomDepth(water, foot.x + (swim.vel.x / horiz) * 0.5, foot.z + (swim.vel.z / horiz) * 0.5);
      if (ahead < FLOAT_DEPTH && ahead > 0.15) floatFoot = Math.max(floatFoot, water.surfaceY - ahead + 0.04);
    }
    const rise = clamp((floatFoot - foot.y) * 3.2, -2.5, 2.5);
    swim.vel.y += (rise - swim.vel.y) * (1 - Math.exp(-(swim.vel.y < rise ? 5 : 3) * dt));

    const support = controller.checkSupport(dt, DOWN);
    controller.setVelocity(swim.vel);
    controller.integrate(dt, support, NO_GRAVITY);
    position.copyFrom(controller.getPosition());
    // Never sink below the floor or drift off the top of the water.
    const top = floatFoot + 0.25 + FOOT_OFFSET;
    if (position.y > top) {
      position.y = top;
      controller.setPosition(position);
    }
    // Feet down on a floor that is nearly too shallow to swim: stand up and wade.
    if (support.supportedState === CharacterSupportedState.SUPPORTED && bottom < SWIM_DEPTH && swim.time > 0.8) {
      leaveWater();
      launched = false;
      return null;
    }

    if (hasWish()) {
      facing = lerpAngle(facing, Math.atan2(wish.x, wish.z), 1 - Math.exp(-6 * dt));
      lookedAround = false;
      if (!dragging) steerPause = 0;
    }
    if (!dragging) steerPause = Math.max(0, steerPause - dt);
    if (!dragging && steerPause <= 0 && !lookedAround) {
      yaw = lerpAngle(yaw, facing, 1 - Math.exp(-FOLLOW_TURN * dt));
    }
    state = "IN_AIR";
    coyote = 0;
    followCamera(dt);

    if (allowInput && hasWish() && tryClimb(water, dt)) return climbStep(0);
    const speed = Math.hypot(swim.vel.x, swim.vel.z);
    return swimFrame({ speed, stroked, entered, water });
  }

  function hasWish() {
    return wish.x * wish.x + wish.z * wish.z > 0.4;
  }

  /** Surface to floor right here, from the colliders (falls back to the registered floor). */
  function bottomDepth(water, x, z) {
    const physics = scene.getPhysicsEngine?.();
    if (!physics) return water.depth;
    swim.a.set(x, water.surfaceY + 0.1, z);
    swim.b.set(x, water.surfaceY - Math.max(water.depth, 1) - 2, z);
    physics.raycastToRef(swim.a, swim.b, swim.ray);
    if (!swim.ray.hasHit) return water.depth;
    return Math.min(water.depth, water.surfaceY - swim.ray.hitPointWorld.y);
  }

  /** Pushing into an edge low enough to climb: starts the climb-out and returns true. */
  function tryClimb(water, dt) {
    const physics = scene.getPhysicsEngine?.();
    if (!physics) return false;
    swim.dir.set(wish.x, 0, wish.z).normalize();
    const dir = swim.dir;
    const probeY = Math.max(foot.y + 0.1, water.surfaceY - 0.25);
    swim.a.set(position.x, probeY, position.z);
    swim.b.set(position.x + dir.x * (CAPSULE_RADIUS + 0.45), probeY, position.z + dir.z * (CAPSULE_RADIUS + 0.45));
    physics.raycastToRef(swim.a, swim.b, swim.ray);
    if (!swim.ray.hasHit || Math.abs(swim.ray.hitNormalWorld.y) > 0.5) {
      swim.stuck = 0;
      return false;
    }
    const wallX = swim.ray.hitPointWorld.x;
    const wallZ = swim.ray.hitPointWorld.z;
    swim.stuck += dt;
    const reach = swim.stuck > STUCK_SECONDS ? CLIMB_STUCK : CLIMB_UP;
    const landX = wallX + dir.x * (CAPSULE_RADIUS + 0.2);
    const landZ = wallZ + dir.z * (CAPSULE_RADIUS + 0.2);
    swim.a.set(landX, water.surfaceY + reach + 0.05, landZ);
    swim.b.set(landX, water.surfaceY - 0.4, landZ);
    physics.raycastToRef(swim.a, swim.b, swim.ray);
    if (!swim.ray.hasHit || swim.ray.hitNormalWorld.y < 0.6) return false;
    const deckY = swim.ray.hitPointWorld.y;
    // A riser the walk can step up by itself isn't a climb.
    if (deckY - water.surfaceY > reach || deckY < foot.y + STEP_HEIGHT + 0.02) return false;
    // Room to stand: nothing in the way at chest height on the deck.
    swim.a.set(position.x, deckY + 0.7, position.z);
    swim.b.set(landX + dir.x * 0.25, deckY + 0.7, landZ + dir.z * 0.25);
    physics.raycastToRef(swim.a, swim.b, swim.ray);
    if (swim.ray.hasHit) return false;
    swim.climb = { t: 0, deckY };
    swim.from.copyFrom(position);
    swim.to.set(landX, deckY + FOOT_OFFSET + 0.04, landZ);
    swim.on = false;
    swim.stuck = 0;
    facing = Math.atan2(dir.x, dir.z);
    controller.setVelocity(Vector3.Zero());
    return true;
  }

  /** Hands on the edge, pull up, then step forward onto the deck. Moves the capsule directly. */
  function climbStep(dt) {
    const climb = swim.climb;
    climb.t = Math.min(1, climb.t + dt / CLIMB_SECONDS);
    const up = smooth(Math.min(1, climb.t / 0.6));
    const over = smooth(Math.max(0, (climb.t - 0.45) / 0.55));
    const lift = swim.to.y + 0.06;
    position.set(
      swim.from.x + (swim.to.x - swim.from.x) * (0.15 * up + 0.85 * over),
      swim.from.y + (lift - swim.from.y) * up + (swim.to.y - lift) * over,
      swim.from.z + (swim.to.z - swim.from.z) * (0.15 * up + 0.85 * over),
    );
    controller.setPosition(position);
    controller.setVelocity(Vector3.Zero());
    jumpQueued = 0;
    jumpBuffer = 0;
    if (!dragging) steerPause = Math.max(0, steerPause - dt);
    if (!dragging && steerPause <= 0) yaw = lerpAngle(yaw, facing, 1 - Math.exp(-FOLLOW_TURN * dt));
    aim = yaw;
    followCamera(dt);
    const p = climb.t;
    if (climb.t >= 1) {
      swim.climb = null;
      state = "IN_AIR";
      launched = false;
      coyote = 0;
      airTime = 0;
      mute = Math.max(mute, 0.1);
      hooks.onSwim?.(false);
    }
    return swimFrame({ speed: 0, stroked: false, entered: 0, water: null, climbing: p });
  }

  function swimFrame({ speed, stroked, entered, water, climbing = 0 }) {
    return {
      position,
      foot,
      pad: null,
      grounded: false,
      walking: false,
      onStair: false,
      airborne: false,
      state: climbing ? "CLIMB_OUT" : "SWIM",
      justLanded: false,
      jumped: false,
      doubleJumped: false,
      looked: false,
      trick: null,
      trickP: 0,
      flying: false,
      facing,
      speed,
      impact: 0,
      supportX: 0,
      swimming: !climbing,
      swimMoving: !climbing && (speed > 0.7 || hasWish()),
      stroked,
      splashIn: entered,
      climbing,
      wading: 0,
      water,
      surfaceY: water?.surfaceY ?? swim.to.y - FOOT_OFFSET,
    };
  }

  function leaveWater() {
    const was = swim.on || Boolean(swim.climb);
    if (swim.on) swim.rest = 0.5;
    swim.on = false;
    swim.climb = null;
    swim.stuck = 0;
    swim.wade = 0;
    if (was) hooks.onSwim?.(false);
  }

  function tickBoost(dt) {
    if (boostLeft <= 0) return;
    boostLeft = Math.max(0, boostLeft - dt);
    if (boostLeft === 0) speedBoost = 1;
  }

  function padTop(pad) {
    return pad.mesh.position.y + pad.thickness;
  }

  function stillOn(pad) {
    if (!pad?.mesh || pad.removed || pad.gone) return false;
    if (hooks.findPad(foot) !== pad) return false;
    return Math.abs(foot.y - padTop(pad) - groundGap) < HOLD_GROUND_GAP;
  }

  function followCamera(dt, view = null) {
    foot.set(position.x, position.y - FOOT_OFFSET, position.z);
    const lift = view?.lift ?? 0;
    const back = view?.back ?? 0;
    viewLift += (lift - viewLift) * Math.min(1, dt * 4);
    viewBack += (back - viewBack) * Math.min(1, dt * 4);
    look.set(position.x, foot.y + 1.05 + viewLift, position.z);
    distance += viewBack;
    cameraOffset(desiredCam, look);
    distance -= viewBack;
    const follow = 1 - Math.exp(-FOLLOW_MOVE * dt);
    camHold.x += (desiredCam.x - camHold.x) * follow;
    camHold.y += (desiredCam.y - camHold.y) * follow;
    camHold.z += (desiredCam.z - camHold.z) * follow;
    placeCamera(scene, camera, camHold, look, ray, dip);
  }

  function queueJump() {
    jumpQueued = Math.min(2, jumpQueued + 1);
    jumpBuffer = 0.16;
  }

  function land() {
    if (!flying) return;
    flying = false;
    flyTime = 0;
    hooks.onFly?.(false);
  }

  function takeQueuedJump() {
    jumpQueued = Math.max(0, jumpQueued - 1);
    if (jumpQueued === 0) jumpBuffer = 0;
  }

  function launch(pop, carry, straightUp = false) {
    airCarry = carry;
    if (wish.lengthSquared() > 0.2) {
      next.x = wish.x * carry;
      next.z = wish.z * carry;
    } else if (straightUp) {
      // A spring landing off the dome's flat crown leaves a downhill slide. Carried into
      // the next pop, it lands further out and steeper every bounce until you slip off.
      next.x = 0;
      next.z = 0;
    }
    next.y = pop;
    state = "START_JUMP";
    launched = true;
    airJumpLeft = true;
    stairRun = false;
    coyote = 0;
  }

  function beginTrick() {
    let index = Math.floor(Math.random() * TRICKS.length);
    if (index === lastTrick) index = (index + 1 + Math.floor(Math.random() * (TRICKS.length - 1))) % TRICKS.length;
    lastTrick = index;
    trick = TRICKS[index];
    trickTime = 0;
    trickFresh = true;
  }

  function placeCamera(scene, camera, hold, focus, cameraRay, dipAmount) {
    const dx = hold.x - focus.x;
    const dy = hold.y - focus.y;
    const dz = hold.z - focus.z;
    const dist = Math.hypot(dx, dy, dz) || 0.001;
    cameraRay.origin.copyFrom(focus);
    cameraRay.direction.set(dx / dist, dy / dist, dz / dist);
    cameraRay.length = dist;
    const hit = scene.pickWithRay(cameraRay, (mesh) => mesh.metadata?.blocksCamera);
    if (hit?.hit && hit.distance > 0.4 && hit.distance < dist - 0.3) {
      const keep = Math.max(1.5, hit.distance - 0.35);
      camera.position.set(
        focus.x + cameraRay.direction.x * keep,
        focus.y + cameraRay.direction.y * keep - dipAmount,
        focus.z + cameraRay.direction.z * keep,
      );
    } else {
      camera.position.set(hold.x, hold.y - dipAmount, hold.z);
    }
    const water = hooks.waterAt?.(camera.position);
    if (water && camera.position.y < water.surfaceY + 0.35) camera.position.y = water.surfaceY + 0.35;
    camera.setTarget(raisedAim(focus));
  }
}

function bindDesktop(canvas, keys, handlers) {
  const typing = (event) => event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  const pressed = new Map();
  window.addEventListener(
    "keydown",
    (event) => {
      if (typing(event)) return;
      const isJump = event.code === "Space" || event.key === " ";
      const action = actionFor(event);
      if (isJump || action) {
        event.preventDefault();
        if (document.activeElement instanceof HTMLButtonElement && !document.querySelector("#settings:not([hidden])")) {
          document.activeElement.blur();
        }
      }
      if (action) {
        pressed.set(event.code || event.key, action);
        keys.add(action);
      }
      if (isJump && !event.repeat) handlers.onJump();
    },
    { capture: true },
  );
  window.addEventListener(
    "keyup",
    (event) => {
      const action = pressed.get(event.code || event.key) ?? actionFor(event);
      pressed.delete(event.code || event.key);
      if (action && ![...pressed.values()].includes(action)) keys.delete(action);
    },
    { capture: true },
  );
  window.addEventListener("blur", () => {
    keys.clear();
    pressed.clear();
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    handlers.onDragStart(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    handlers.onDrag(event.clientX, event.clientY);
  });
  canvas.addEventListener("pointerup", () => handlers.onDragEnd());
  canvas.addEventListener("pointercancel", () => handlers.onDragEnd());
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      handlers.onWheel(event.deltaY);
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function angleDelta(to, from) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function lerpAngle(from, to, t) {
  return from + angleDelta(to, from) * t;
}
