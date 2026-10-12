import {
  CharacterSupportedState,
  FreeCamera,
  PhysicsCharacterController,
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
export const JUMP_SPEED = 7.6;
// Second press in the air. Keeps some of the upward speed, then adds another hop.
export const DOUBLE_JUMP_SPEED = 7.8;
const DOUBLE_CARRY = 1.34;
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

/** How fast the camera swings round behind the way the avatar faces. */
const FOLLOW_TURN = 3.2;
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
  let aimRaise = 0;
  let facing = heading;
  let coyote = 0;
  let jumpBuffer = 0;
  let jumpQueued = 0;
  let airJumpLeft = false;
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
  let dip = 0;
  let dipVel = 0;
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
    wish.scaleInPlace(MOVE_SPEED);
  }

  return {
    camera,
    stick,
    requestJump() {
      queueJump();
    },
    setStick(x, y) {
      stick.x = x;
      stick.y = y;
    },
    setAimRaise(share) {
      aimRaise = share;
    },
    respawn(spot, nextHeading = 0) {
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
    update(dt, allowInput) {
      mute = Math.max(0, mute - dt);
      trickFresh = false;
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      if (!allowInput) {
        jumpBuffer = 0;
        jumpQueued = 0;
        trick = null;
        trickTime = 0;
      } else if (jumpBuffer <= 0) jumpQueued = 0;

      position.copyFrom(controller.getPosition());
      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      const support = controller.checkSupport(dt, DOWN);
      const grounded = support.supportedState === CharacterSupportedState.SUPPORTED;
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
      const velocity = controller.getVelocity();
      next.copyFrom(velocity);
      forward.set(Math.sin(aim), 0, Math.cos(aim));
      if (forward.lengthSquared() < 1e-6) forward.set(0, 0, 1);

      position.copyFrom(controller.getPosition());
      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      const pad = hooks.findPad(foot);
      const canJump = state === "ON_GROUND" || coyote > 0;
      const wantJump = allowInput && jumpQueued > 0 && canJump;
      let jumped = false;

      const onStair = state === "ON_GROUND" && Boolean(pad?.stair);
      const climbing = onStair || (stairRun && !launched && state !== "ON_GROUND");
      controller.maxStepHeight = climbing ? STAIR_STEP_HEIGHT : STEP_HEIGHT;
      controller.maxSlopeCosine = climbing ? STAIR_SLOPE_COSINE : SLOPE_COSINE;
      if (state === "ON_GROUND") {
        launched = false;
        airJumpLeft = false;
        stairRun = onStair;
        move.copyFrom(wish);
        if (onStair) move.scaleInPlace(STAIR_RUN);
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
          launch(spring ? SPRING_POP : JUMP_SPEED, spring ? SPRING_BOOST : AIR_BOOST);
          jumped = true;
        } else if (justLanded && pad?.kind === "spring" && mute <= 0) {
          launch(SPRING_POP, SPRING_BOOST);
        } else if (next.y < 0) {
          next.y = 0;
        }
      } else {
        if (previous === "ON_GROUND") airCarry = stairRun ? STAIR_RUN : AIR_BOOST;
        // Riding up a tread edge leaves upward speed behind. Drop it so the run settles on the tread.
        if (stairRun && !launched) next.y = Math.min(next.y, 0);
        next.y += GRAVITY * dt;
        const blend = 1 - Math.exp(-5.5 * dt);
        next.x += (wish.x * airCarry - next.x) * blend;
        next.z += (wish.z * airCarry - next.z) * blend;
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
          beginTrick();
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
      if (jumped && pad && !justLanded && mute <= 0) hooks.onJump(pad);

      const speed = Math.hypot(next.x, next.z);
      if (trick && !trickFresh) {
        // Finish the flip quickly once the feet are back on a pad.
        trickTime += dt * (state === "ON_GROUND" ? 4 : 1);
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
      }
      // Keep the camera behind the avatar. After a drag while standing still, hold the view until you move.
      if (!dragging && steerPause <= 0 && !lookedAround) {
        yaw = lerpAngle(yaw, facing, 1 - Math.exp(-FOLLOW_TURN * dt));
      }

      dipVel += (-90 * dip - 14 * dipVel) * dt;
      dip += dipVel * dt;

      foot.set(position.x, position.y - FOOT_OFFSET, position.z);
      look.set(position.x, foot.y + 1.05, position.z);
      cameraOffset(desiredCam, look);
      const follow = 1 - Math.exp(-7 * dt);
      camHold.x += (desiredCam.x - camHold.x) * follow;
      camHold.y += (desiredCam.y - camHold.y) * follow;
      camHold.z += (desiredCam.z - camHold.z) * follow;
      placeCamera(scene, camera, camHold, look, ray, dip);

      // Tread edges and bobbing pads drop the feet for a few frames. Keep running through those.
      const hopping = state !== "ON_GROUND" && !launched && airTime < STEP_HOP_SECONDS;

      return {
        position,
        foot,
        pad: hooks.findPad(foot),
        grounded: state === "ON_GROUND",
        walking: (state === "ON_GROUND" || hopping) && wish.lengthSquared() > 0.4,
        onStair: stairRun,
        airborne: state !== "ON_GROUND" && !hopping,
        state,
        justLanded,
        jumped,
        trick: trickOut,
        trickP,
        facing,
        speed,
        impact,
        supportX: support.averageSurfaceVelocity.x,
      };
    },
  };

  function queueJump() {
    jumpQueued = Math.min(2, jumpQueued + 1);
    jumpBuffer = 0.16;
  }

  function takeQueuedJump() {
    jumpQueued = Math.max(0, jumpQueued - 1);
    if (jumpQueued === 0) jumpBuffer = 0;
  }

  function launch(pop, carry) {
    airCarry = carry;
    if (wish.lengthSquared() > 0.2) {
      next.x = wish.x * carry;
      next.z = wish.z * carry;
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

function angleDelta(to, from) {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function lerpAngle(from, to, t) {
  return from + angleDelta(to, from) * t;
}
