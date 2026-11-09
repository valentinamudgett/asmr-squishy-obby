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
import { lavaTexture } from "./world.js";

/**
 * Checkpoints inside the prison. PRISON_LEVEL is the cell; FREEDOM_LEVEL is back out on the course.
 * LAVA_LEVEL is the lava room off the top of the police stairs, where the police can't get you.
 */
export const LAVA_LEVEL = 60;
export const KILLER_LEVEL = 75;
/** The vending room past the killer capybara's obby, where the chef comes after you. */
export const VENDING_LEVEL = 80;
export const BOSS_LEVEL = 90;
/** The energy soda from the vending machine: its price in coins and the run speed it gives until level 90 or a catch. */
export const SODA_PRICE = 3;
export const SODA_SPEED = 2.6;

/**
 * Where the prison stands in the world: one spot for everyone, replays included, so other players in
 * it show up in the right place. Level-50 height, and far enough out that no course pad reaches it.
 */
export const PRISON_ORIGIN = new Vector3(260, 375, 0);
const LIVES = 10;
const BOSS_HEALTH = 5;
/**
 * Per difficulty. The player runs at 4.4 m/s, so police that keep coming are a little slower. The
 * chef is more than twice as fast as a run, but a little slower than a run on soda (11.4 m/s).
 * `escapee` is the prisoner you chase when you play as police, slower than you so you can catch it.
 */
const PACE = {
  easy: { police: 3.3, policeDelay: 2.6, killer: 4.0, killerDelay: 2.2, chef: 9.7, chefDelay: 2.2, fireEvery: 1.7, fireSpeed: 10, escapee: 2.4 },
  medium: { police: 3.8, policeDelay: 1.9, killer: 4.6, killerDelay: 1.6, chef: 10.1, chefDelay: 1.8, fireEvery: 1.25, fireSpeed: 13, escapee: 3 },
  hard: { police: 4.2, policeDelay: 1.3, killer: 5.2, killerDelay: 1.1, chef: 10.6, chefDelay: 1.4, fireEvery: 0.9, fireSpeed: 16, escapee: 3.5 },
};
/** Where each checkpoint puts you, in prison space, and which way you face. */
const SPAWNS = {
  [PRISON_LEVEL]: { x: 0.8, y: 0, z: 1.2, heading: -Math.PI / 2 },
  [LAVA_LEVEL]: { x: -19.5, y: 9, z: 8.6, heading: 0 },
  [KILLER_LEVEL]: { x: 10.5, y: 17.6, z: -4.2, heading: Math.PI / 2 },
  [VENDING_LEVEL]: { x: 41.8, y: 21.8, z: 10.6, heading: -Math.PI / 2 },
  [BOSS_LEVEL]: { x: 46.6, y: 21.8, z: 0, heading: Math.PI / 2 },
};
/**
 * The prisoners you chase as police run the police route, from the hall up the stairs to the lava
 * room's door. Each comes out ESCAPEE_AHEAD meters along it from you, waits once it's ESCAPEE_LEAD
 * ahead, and is caught within ESCAPEE_REACH. ESCAPEE_AGAIN seconds later another one gets out.
 */
const ESCAPEE_SIZE = 1.25;
const ESCAPEE_AHEAD = 7;
const ESCAPEE_LEAD = 10;
const ESCAPEE_REACH = 1.1;
const ESCAPEE_FIRST = 1.5;
const ESCAPEE_AGAIN = 3;
const HALL_FLOOR = -3;
/** Playing as police, level 50 starts you in the hall by the police door instead of the cell. */
const POLICE_START = { x: -8.4, y: HALL_FLOOR, z: 0, heading: -Math.PI / 2 };
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
/**
 * The cell block is one tall open hall, ceiling at BLOCK_TOP: the stairwell round the barred cells,
 * the squishy wall, and a goo pit over your own cell, joined to the killer capybara's room above
 * its floor. The second vent runs round the outside to a ledge high on the stairwell's far wall.
 */
const LEDGE_TOP = 19.4;
const BLOCK_TOP = 30;
const GOO_PIT = { x0: -3.6, x1: 6, top: 5 };
/** The squishy wall's top on the zipline's side, low enough for the rider's feet to pass over. */
const EAST_WALL_TOP = 17;
/** Walls between the cell block's halves stop here, under the zipline. */
const SPLIT_TOP = 16.4;
/** Cell Block B, south of the stairwell: rows of barred cells far below the zipline. x0, x1, z0, z1. */
const BLOCK_B = { x0: -30, x1: 6, z0: -38, z1: -6.4 };
/** Its rows of cells: the middle of each row, and the z span they run along. */
const CELL_ROWS = [-25.7, -14.9, -4.1];
const CELL_ROW_Z = [-32, -12];
/**
 * The lava room, north of the stairwell and the squishy room on the squishy room's floor: in through
 * LAVA_DOOR (x0, x1 in the stairwell's north wall) off the top of the stairs, cupboards round its west
 * end, a lava pool across the middle, and out through LAVA_EXIT (x0, x1 in the squishy room's north
 * wall) at its east end.
 */
const LAVA_ROOM = { x0: -30, x1: -4, z0: 6.4, z1: 18.4, top: 15.4 };
const LAVA_POOL = { x0: -17, x1: -6.6, y: 8.4 };
const LAVA_DOOR = [-20.6, -18.4];
const LAVA_EXIT = [-6.2, -4.4];
/**
 * Over the north side of the lava room the ceiling goes up to BAY.top: a tall bay from x0 to the
 * east wall and from z0 to the north wall, closed off on the south above the room's ceiling by a
 * wall that hangs down to PARTITION_BOTTOM over the lava. The second vent runs through solid metal
 * over the rest of the room, so the bay can't reach further south.
 */
const BAY = { x0: -17, z0: 13.4, top: 24 };
const PARTITION_BOTTOM = 11;
/**
 * The little cages the key makes form over the lava: each one's middle (x), top, and the wall it
 * sticks out of (1 the north wall, -1 the bay's hanging wall facing it). They climb like stairs in
 * three flights, east along the north wall, back west along the hanging wall, and east along the
 * north wall again high above the first, CAGE_RISE a step with gaps like the obby's, CAGE_SIZE
 * square and CAGE_TALL deep. The last one is a step below the top floor.
 */
const CAGE_RISE = 0.7;
const CAGE_XS = [-15.7, -13.6, -11.5, -9.4, -7.3];
const CAGES = [
  ...CAGE_XS.map((x) => [x, 1]),
  ...[...CAGE_XS].reverse().map((x) => [x, -1]),
  ...CAGE_XS.map((x) => [x, 1]),
].map(([x, wall], index) => [x, SQUISHY_FLOOR + CAGE_RISE * (index + 1), wall]);
const CAGE_SIZE = 1.3;
const CAGE_TALL = 1;
/** The middle (z) of a cage on `wall` (see CAGES). */
const cageZ = (wall) => (wall > 0 ? LAVA_ROOM.z1 - CAGE_SIZE / 2 : BAY.z0 + CAGE_SIZE / 2);
/**
 * The top floor the cage stairs climb to, high in the bay at the lava room's east end from x0 and
 * z0 to the walls, and the elevator in the tall shaft just south of its edge that takes you all the
 * way down to the floor by the exit door. LIFT is the car's footprint (x0, x1, z0, z1). It rides for
 * LIFT_SECONDS; its gates take LIFT_GATE_SECONDS to slide shut or open. Call panels are on the east
 * wall at LIFT_PANELS (z) on each floor. With nobody in it, it goes back up LIFT_RETURN_SECONDS
 * after reaching the bottom.
 */
const LANDING = { x0: LAVA_POOL.x1, z0: 15.6, top: SQUISHY_FLOOR + CAGE_RISE * (CAGES.length + 1) };
const LIFT = { x0: -6.5, x1: -4.1, z0: BAY.z0, z1: 15.6 };
const LIFT_TALL = 2.3;
const LIFT_SECONDS = 10;
const LIFT_GATE_SECONDS = 0.5;
const LIFT_PANELS = { top: 16.3, bottom: 12.8 };
const LIFT_REACH = 1.3;
const LIFT_RETURN_SECONDS = 4;
/** Cupboards round the west end: where each stands against the wall, and the way its doors face. */
const CUPBOARDS = [
  { x: -29.65, z: 9.6, yaw: Math.PI / 2 },
  { x: -29.65, z: 13, yaw: Math.PI / 2 },
  { x: -29.65, z: 16.4, yaw: Math.PI / 2 },
  { x: -26, z: 18.05, yaw: Math.PI },
  { x: -22, z: 18.05, yaw: Math.PI },
  { x: -26, z: 6.75, yaw: 0 },
];
const CUPBOARD_REACH = 1.4;
/** The big red button's pedestal by the lava, padlocked until you have the key, and how close you must be to unlock it. */
const BUTTON = { x: -18.3, z: 16.6 };
const BUTTON_REACH = 1.5;
/** How long the cages stay formed for a bot that unlocks them: long enough for it to climb across. */
const BOT_CAGE_SECONDS = 22;
/**
 * The zipline: from the ledge it zig-zags south and north over the cell blocks along ZIP_LEGS (x),
 * turning in smooth half circles round ZIP_SOUTH and ZIP_NORTH (z) so every northern turn swings
 * back over the stairwell and the squishy wall, then bends east to the level-75 checkpoint. In
 * prison space; about 200 m, with brackets out of the walls at the turns.
 */
const ZIP_FROM = { x: -28.4, y: LEDGE_TOP + 2, z: -4.2 };
const ZIP_TO = { x: 10.5, y: 20.05, z: -4.2 };
const ZIP_LEGS = [-28.4, -23, -17.6, -12.2, -6.8, -1.4];
const ZIP_SOUTH = -28;
const ZIP_NORTH = -3.4;
const ZIP_BEND = 3;
/** The ride starts slow, speeds up to ZIP_SPEED on the straights, and slows to ZIP_TURN_SPEED round the turns. */
const ZIP_START_SPEED = 2.5;
const ZIP_SPEED = 12;
const ZIP_TURN_SPEED = 7;
const ZIP_ACCEL = 5;
const ZIP_BRAKE = 8;
/** How far ahead of a turn the handle starts to slow. */
const ZIP_LOOKAHEAD = 6;
/** From the cable down to your feet while you hang from the handle. */
const ZIP_HANG = 1.95;
/** Standing this close under the handle grabs it; this close lets you grab it with E. */
const ZIP_TOUCH = 0.5;
const ZIP_REACH = 1.6;
/** The vending machine's front, in prison space, and how close you must be to buy. */
const MACHINE = { x: 35.6, z: 12.4 };
const MACHINE_REACH = 2;
/** The kitchen door in the vending room's north wall, shut until you've had the soda: x0, x1. */
const KITCHEN_DOOR = [39.6, 43.2];
/** Floor-to-ceiling height of the chef chase rooms. */
const CHASE_HEIGHT = 5;
/** The arena's side door, where the chef chase ends: x0, x1 in the arena's north wall. */
const ARENA_DOOR = [46, 50];
const SHOT_SPEED = 32;
const SHOT_COOLDOWN = 0.28;
/** Shots within this angle of where you face curve onto the boss. */
const AUTO_AIM = 0.7;

/**
 * The police capybaras' way from their door, across the hall, and up the four flights to the lava
 * room's door, where they have to stop. `w` is how far either side of the line they may step.
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
  { x: -19.5, y: 9, z: 4.4 },
];
/** Once you're out of the lava room they come at you through the side door at the top of the stairs. */
const SIDE_ROUTE = [
  { x: -19.2, y: SQUISHY_FLOOR, z: 0, w: 1 },
  { x: -16.5, y: SQUISHY_FLOOR, z: 0, w: 5.2 },
  { x: -5, y: SQUISHY_FLOOR, z: 0 },
];
/** The killer capybara's floor, from the vent wall to the edge of the goo pit. */
const KILLER_ROUTE = [
  { x: 7.2, y: KILLER_FLOOR, z: 0, w: 7.3 },
  { x: PIT_EDGE - 0.6, y: KILLER_FLOOR, z: 0 },
];
/**
 * The chef chase, about 660 m of rooms north of the vending room (a minute even on soda): up the
 * kitchen, east through the pantry between its shelves, down the freezer, then up one side of the
 * dining hall and back down the other to the arena's side door. Each room is a lane about 9.6 m
 * wide. CHASE_END is the north wall, PANTRY_Z0 the pantry's south side.
 */
const CHASE_END = 177;
const PANTRY_Z0 = CHASE_END - 9.6;
const CHASE_ROOMS = {
  kitchen: { x0: 34, x1: 44, z0: 16.8, z1: CHASE_END },
  pantry: { x0: 44.4, x1: 74, z0: PANTRY_Z0, z1: CHASE_END },
  freezer: { x0: 64.4, x1: 74, z0: 12.4, z1: PANTRY_Z0 },
  dining: { x0: 44.4, x1: 64, z0: 12.4, z1: PANTRY_Z0 - 0.4 },
};
/** The dining hall's middle row of screens splits it into two lanes, joined past its north end. */
const DINING_SPLIT = { x: 54, z1: PANTRY_Z0 - 9.4 };
/** Pantry shelves, too tall to jump: x, and the z span each one blocks (the gap is on the other side). */
const SHELVES = [
  [50, CHASE_END - 5, CHASE_END],
  [56, PANTRY_Z0, PANTRY_Z0 + 5],
  [62, CHASE_END - 5, CHASE_END],
  [68, PANTRY_Z0, PANTRY_Z0 + 5],
];
const SIDES = ["west", "east", "full"];
/**
 * Low things across the lanes: x0, x1, z0, z1, height. Kitchen counters and dining tables are 0.75
 * to 0.8 m and freezer ice 0.6 m, under the 1.2 m a jump rises. The full-width ones must be jumped,
 * and they are 1.2 to 1.6 m deep, well inside the 2.5 m a running jump carries.
 */
const OBSTACLES = [
  // Kitchen counters every 7 to 8 m up to 15 m short of the pantry, in turn west, east, and full width.
  ...Array.from({ length: 19 }, (_, i) => [24 + i * 7 + Math.floor(i / 3), SIDES[i % 3]]).map(([z, side]) => [
    side === "east" ? 38.6 : 34,
    side === "west" ? 39.4 : 44,
    z,
    z + 1.2,
    0.75,
    "counter",
  ]),
  // Freezer ice every 8 m going south from 8.4 m below the pantry: full width, west, east.
  ...Array.from({ length: 17 }, (_, i) => [PANTRY_Z0 - 8.4 - i * 8, ["full", "west", "east"][i % 3]]).map(([z, side]) => [
    side === "east" ? 69.2 : 64.4,
    side === "west" ? 69.2 : 74,
    z,
    z + 1.2,
    0.6,
    "ice",
  ]),
  // Dining tables every 8 m in both lanes, every third row full width.
  ...Array.from({ length: 17 }, (_, row) => 20 + row * 8).flatMap((z, row) => [
    row % 3 === 2 ? [54.4, 64, z, z + 1.4, 0.8, "table"] : [57.7, 60.7, z, z + 1.6, 0.8, "table"],
    row % 3 === 1 ? [44.4, 54, z + 4, z + 5.4, 0.8, "table"] : [47.7, 50.7, z + 4, z + 5.6, 0.8, "table"],
  ]),
];
/** The chef's way from its door, through the rooms (weaving between the shelves), to the arena door. */
const CHEF_ROUTE = [
  { x: 35, y: ARENA_FLOOR, z: 9.8, w: 2.6 },
  { x: 41.4, y: ARENA_FLOOR, z: 15.6, w: 1.4 },
  { x: 39, y: ARENA_FLOOR, z: 19, w: 4.2 },
  { x: 39, y: ARENA_FLOOR, z: CHASE_END - 4.8, w: 1.6 },
  { x: 48.5, y: ARENA_FLOOR, z: PANTRY_Z0 + 2.3, w: 1 },
  { x: 51.5, y: ARENA_FLOOR, z: PANTRY_Z0 + 2.3, w: 1 },
  { x: 54.5, y: ARENA_FLOOR, z: CHASE_END - 2.3, w: 1 },
  { x: 57.5, y: ARENA_FLOOR, z: CHASE_END - 2.3, w: 1 },
  { x: 60.5, y: ARENA_FLOOR, z: PANTRY_Z0 + 2.3, w: 1 },
  { x: 63.5, y: ARENA_FLOOR, z: PANTRY_Z0 + 2.3, w: 1 },
  { x: 66.5, y: ARENA_FLOOR, z: CHASE_END - 2.3, w: 1 },
  { x: 69.4, y: ARENA_FLOOR, z: CHASE_END - 2.3, w: 3.8 },
  { x: 69.2, y: ARENA_FLOOR, z: 17.2, w: 3.5 },
  { x: 59.2, y: ARENA_FLOOR, z: 17.2, w: 3.8 },
  { x: 59.2, y: ARENA_FLOOR, z: PANTRY_Z0 - 4.9, w: 3.5 },
  { x: 49.2, y: ARENA_FLOOR, z: PANTRY_Z0 - 4.9, w: 3.8 },
  { x: 49.2, y: ARENA_FLOOR, z: 13.6, w: 1.4 },
  { x: 48, y: ARENA_FLOOR, z: 11 },
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
/**
 * The second vent's centre line, from the top of the squishy wall out through the north wall,
 * zig-zagging west outside the cell block, and in through the far wall onto the zipline ledge.
 */
const VENT2_PATH = [
  [-3.6, 4.5],
  [-2.2, 4.5],
  [-2.2, 8.4],
  [-8, 8.4],
  [-8, 11.4],
  [-14, 11.4],
  [-14, 8.4],
  [-20, 8.4],
  [-20, 11.4],
  [-26, 11.4],
  [-26, 8.4],
  [-32.2, 8.4],
  [-32.2, -4.2],
  [-30, -4.2],
];
/** The zipline ledge on the stairwell's far wall: x0, x1, z0, z1, with the vent coming out at ZIP_FROM.z. */
const ZIP_LEDGE = [-30, -27, -6, -2.4];
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
 * Capybara Prison, the climb from the level-50 checkpoint to level 100. It is its own building,
 * put up beside the course when you get locked up and taken down again once you're free:
 *
 * 1. Your cell. Climb the stool, the desk, and the top bunk into the vent in the wall.
 * 2. The vent drops you through the hall ceiling. Police capybaras come out of their door and chase
 *    you up four flights of stairs. If they catch you, it's back to the cell.
 * 3. Big squishies stuck to the wall climb to a second vent. The police can't catch you on them.
 * 4. The vent goes round the outside to a ledge high on the stairwell's far wall, and a long
 *    zipline carries you over the cells, the police stairs, and the squishy wall to level 75. A
 *    killer capybara chases you across the floor until you're on the obby over the goo.
 * 5. Level 80: a vending machine sells an energy soda that makes you run faster until level 90.
 *    Drinking it opens the kitchen door and lets the chef capybara out, and it chases you through
 *    the kitchen, pantry, freezer, and dining hall to the arena door.
 * 6. Level 90: the warden, a giant capybara, throws mandarins at you. You get a blaster and 10
 *    lives; five hits wins, and losing all your lives starts the fight over.
 * 7. The gate behind the warden opens, and walking through it sends you out to level 100.
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
  const origin = PRISON_ORIGIN.clone();
  const here = new Vector3();
  const center = new Vector3();
  const lastCenter = new Vector3();
  let facing = 0;
  let cooldown = 0;
  /** Set while the caught close-up plays: seconds left, where you go back to, and what it says then. */
  let caught = null;
  let replay = false;
  /** How far along the zipline you are while riding it, and how fast you're going. */
  let rideS = 0;
  let rideSpeed = ZIP_START_SPEED;
  /** Whether you've had the soda since the last time you were at level 80, and when the chef comes out after it. */
  let soda = false;
  let chefIn = Infinity;
  /** True once you're out of the lava room and the police come through the side door. */
  let late = false;
  /** Seconds before the lava can melt you again, so one fall pops you once. */
  let melt = 0;
  /** True while the lava room's elevator carries you. */
  let lifting = false;
  /** Whether the "take the elevator" toast has shown since the last reset. */
  let liftShown = false;
  /** Playing as police: the police capybaras are on your side, and you catch escaping prisoners. */
  let police = false;
  /** Seconds until the next escaping prisoner gets out (Infinity: none will). */
  let escapeeIn = Infinity;
  const escapeeGoal = new Vector3();
  const events = [];

  const toast = (text, next = null, time = 2.2) => events.push({ type: "toast", text, next, time });
  const world = (x, y, z) => new Vector3(origin.x + x, origin.y + y, origin.z + z);

  function spot(at) {
    const spawn = police && at === PRISON_LEVEL ? POLICE_START : SPAWNS[at];
    return { position: world(spawn.x, spawn.y + FOOT_OFFSET + 0.06, spawn.z), heading: spawn.heading };
  }

  /** Puts the actors back the way they are when you arrive at checkpoint `at`. */
  function reset(at) {
    // Running into the lava room, the police chasing you walk on up to its door instead of vanishing.
    const fromChase = phase === "chase" && !late && at === LAVA_LEVEL;
    level = at;
    phase = { [PRISON_LEVEL]: police ? "chase" : "cell", [LAVA_LEVEL]: "lava", [KILLER_LEVEL]: "killer", [VENDING_LEVEL]: "chef" }[at] ?? "boss";
    site.escapee.hide();
    escapeeIn = police && at === PRISON_LEVEL ? ESCAPEE_FIRST : Infinity;
    safeShown = false;
    obbyShown = false;
    late = false;
    melt = 0;
    for (const officer of site.police) {
      if (!fromChase) officer.hide();
      officer.route = site.policeRoute;
    }
    site.sideDoor.close();
    if (at === PRISON_LEVEL) site.lava.reset();
    site.lift.reset();
    lifting = false;
    liftShown = false;
    if (phase === "lava") {
      site.police.forEach((officer, index) => {
        if (officer.out) return;
        officer.door = site.lavaWait[index];
        officer.release(0);
        officer.door = null;
      });
    }
    site.killer.hide();
    site.chef.hide();
    if (phase === "killer") site.killer.wait = pace.killerDelay;
    rideS = 0;
    site.zip.place(0);
    soda = false;
    chefIn = Infinity;
    site.kitchenDoor.close();
    events.push({ type: "sodaEnd" });
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

  function inLavaRoom() {
    return here.z > LAVA_ROOM.z0 + 0.2 && here.x > LAVA_ROOM.x0 && here.x < LAVA_ROOM.x1 && here.y > SQUISHY_FLOOR - 1;
  }

  function updateChase(dt) {
    if (policeIn > 0 && !police) {
      policeIn -= dt;
      if (policeIn <= 0) {
        if (late) {
          site.sideDoor.open();
          audio.blip("thump");
        }
        site.police.forEach((officer, index) => officer.release(index * 0.7));
      }
    }
    const route = late ? site.sideRoute : site.policeRoute;
    const target = route.project(here.x, here.y, here.z);
    const onSquishy = site.standing !== null;
    // Higher than a jump from the floor means you're hopping between squishies.
    const safe = onSquishy || (here.x > -17.6 && here.y > SQUISHY_FLOOR + 1.3);
    let catcher = null;
    if (police) {
      if (!late) updateEscapee(dt);
    } else {
      site.police.forEach((officer, index) => {
        if (officer.step(dt, target, index === 0 ? 0.4 : -0.4, pace.police) && !safe) catcher ??= officer;
      });
    }
    if (catcher) {
      if (late) catchBy(catcher, LAVA_LEVEL, t("toast.policeCaught"), t("toast.backToLava"));
      else catchBy(catcher, PRISON_LEVEL, t("toast.policeCaught"), t("toast.backToCell"));
      return;
    }
    // Into the lava room: the police have to stop at its door. Back in from the squishy room, they
    // go back round to wait at the door again.
    if (inLavaRoom()) {
      if (late) reset(LAVA_LEVEL);
      else reach(LAVA_LEVEL, police ? t("toast.lavaRoomPolice") : t("toast.lavaRoom"));
      return;
    }
    if (onSquishy && !safeShown) {
      safeShown = true;
      if (!police) toast(t("toast.squishySafe"), t("toast.climbSquishies"), 2.6);
    }
    // Over the squishy wall's low end and into the goo over your cell: back to the foot of the wall.
    if (here.x > GOO_PIT.x0 && here.y < SQUISHY_FLOOR - 1 && here.y > GOO_PIT.top - 1) {
      events.push({ type: "respawn", position: world(-11, SQUISHY_FLOOR + FOOT_OFFSET + 0.06, -2.6), heading: Math.PI / 2 });
      toast(t("toast.goo"), t("toast.climbSquishies"), 1.8);
      return;
    }
    // Over the low wall into Cell Block B: back to the foot of the squishy wall too.
    if (here.z < BLOCK_B.z1 && here.y < SPLIT_TOP - 1) {
      events.push({ type: "respawn", position: world(-11, SQUISHY_FLOOR + FOOT_OFFSET + 0.06, -2.6), heading: Math.PI / 2 });
      toast(t("toast.falling"), t("toast.climbSquishies"), 1.8);
      return;
    }
    if (here.x > -3.8 && here.y > LEDGE_TOP - 0.4) {
      phase = "duct";
      for (const officer of site.police) officer.hide();
      events.push({ type: "ventTwo" });
    }
  }

  /**
   * Level 60, the lava room: the police stamp about outside its door while you find the key, unlock
   * the button, and climb the cages it forms on the wall over the lava. Out the far door into the squishy room, they come
   * at you through the side door; back out the way you came, they get you.
   */
  function updateLava(dt) {
    site.police.forEach((officer, index) => {
      officer.step(dt, site.lavaWait[index], 0, pace.police);
      officer.stomp(dt, 0);
    });
    melt = Math.max(0, melt - dt);
    if (!liftShown && here.y > LANDING.top - 0.3 && here.x > LANDING.x0 && here.z > LANDING.z0) {
      liftShown = true;
      toast(t("toast.takeLift"), null, 2.4);
    }
    const overPool = here.x > LAVA_POOL.x0 && here.x < LAVA_POOL.x1 && here.z > LAVA_ROOM.z0;
    if (overPool && here.y < LAVA_POOL.y + 0.3) {
      if (melt <= 0) {
        melt = 3;
        events.push({ type: "lava", ...spot(LAVA_LEVEL) });
      }
      return;
    }
    if (here.z > LAVA_ROOM.z0 - 0.2) return;
    if (here.x < -18) {
      if (!police) catchBy(site.police[0], LAVA_LEVEL, t("toast.policeCaught"), t("toast.backToLava"));
      return;
    }
    phase = "chase";
    late = true;
    safeShown = false;
    for (const officer of site.police) {
      officer.hide();
      officer.route = site.sideRoute;
    }
    policeIn = pace.policeDelay + 0.6;
    if (police) toast(t("toast.climbSquishies"), null, 2.6);
    else toast(t("toast.sideDoor"), t("toast.climbSquishies"), 2.6);
  }

  /**
   * Playing as police in the hall and up the stairs: a prisoner gets out ahead of you and runs for
   * the lava room's door, waiting whenever it's far ahead. Touch it to catch it; another gets out a
   * little later, caught or not.
   */
  function updateEscapee(dt) {
    const runner = site.escapee;
    const route = site.escapeeRoute;
    const you = route.project(here.x, here.y, here.z).s;
    if (!runner.out) {
      escapeeIn -= dt;
      if (escapeeIn > 0) return;
      escapeeIn = Infinity;
      const s = you + ESCAPEE_AHEAD;
      // Too near the door to get away from you: none until you're back down the stairs.
      if (s > route.length - ESCAPEE_AHEAD) {
        escapeeIn = ESCAPEE_AGAIN;
        return;
      }
      route.at(s, 0, escapeeGoal);
      runner.door = { s, side: 0, facing: Math.atan2(escapeeGoal.x - here.x, escapeeGoal.z - here.z) };
      runner.release(0);
      runner.door = null;
      toast(t("toast.escapeeOut"), null, 2);
      return;
    }
    const at = route.project(runner.position.x, runner.position.y, runner.position.z).s;
    const waiting = at - you > ESCAPEE_LEAD;
    const goal = waiting ? at : route.length;
    route.at(goal, 0, escapeeGoal);
    const target = { s: goal, side: 0, x: escapeeGoal.x, y: escapeeGoal.y, z: escapeeGoal.z };
    runner.step(dt, target, 0, pace.escapee);
    if (waiting) runner.stomp(dt, Math.atan2(here.x - runner.position.x, here.z - runner.position.z));
    const close = Math.hypot(here.x - runner.position.x, here.z - runner.position.z) < ESCAPEE_REACH;
    if (close && Math.abs(here.y - runner.position.y) < 1.2) {
      events.push({ type: "nab", position: world(runner.position.x, runner.position.y + 0.6, runner.position.z) });
      runner.hide();
      escapeeIn = ESCAPEE_AGAIN;
    } else if (at >= route.length - 0.4) {
      runner.hide();
      escapeeIn = ESCAPEE_AGAIN;
      toast(t("toast.escapeeAway"), null, 2);
    }
  }

  /**
   * Through the second vent and out on the ledge: grab the zipline to reach level 75. Falling off
   * the ledge puts you back on it (you haven't reached 75 yet).
   */
  function updateDuct(grounded) {
    if (here.y > LEDGE_TOP - 0.3 && Math.hypot(here.x - ZIP_FROM.x, here.z - ZIP_FROM.z) < ZIP_TOUCH) {
      grab();
      return;
    }
    if (here.x < GOO_PIT.x1 + 0.4 && here.y < LEDGE_TOP - 3) {
      events.push({ type: "respawn", position: world(ZIP_LEDGE[0] + 0.8, LEDGE_TOP + FOOT_OFFSET + 0.06, ZIP_FROM.z), heading: Math.PI });
      toast(t("toast.falling"), t("toast.grabZipline"), 1.8);
      return;
    }
    if (grounded && here.x > GOO_PIT.x1 + 0.4 && here.y > KILLER_FLOOR - 0.5 && here.y < KILLER_FLOOR + 0.5) reach(KILLER_LEVEL, t("toast.killer"));
  }

  function nearHandle() {
    return phase === "duct" && here.y > LEDGE_TOP - 0.3 && Math.hypot(here.x - ZIP_FROM.x, here.z - ZIP_FROM.z) < ZIP_REACH;
  }

  function grab() {
    phase = "zip";
    rideS = 0;
    rideSpeed = ZIP_START_SPEED;
    audio.blip("thump");
    events.push({ type: "zipGrab" });
  }

  function nearCupboard() {
    if (phase !== "lava" || here.y < SQUISHY_FLOOR - 0.3) return null;
    return site.lava.cupboards.find((cupboard) => !cupboard.opened && Math.hypot(center.x - cupboard.front.x, center.z - cupboard.front.z) < CUPBOARD_REACH) ?? null;
  }

  /** Standing in the elevator car while it's parked. */
  function inLift() {
    return site.lift.parked && insideLift(center.x, center.z) && Math.abs(here.y - site.lift.y) < 0.5;
  }

  /** Below the car, where it mustn't come down on you. */
  function underLift() {
    return insideLift(center.x, center.z, 0.4) && here.y < site.lift.y - 0.5;
  }

  /** By the call panel on the floor the parked car isn't on. */
  function nearLiftPanel() {
    if (!site.lift.parked) return false;
    const up = here.y > LANDING.top - 0.5;
    if (up === site.lift.atTop || Math.abs(here.y - (up ? LANDING.top : SQUISHY_FLOOR)) > 0.5) return false;
    return Math.hypot(center.x - (LIFT.x1 - 0.3), center.z - (up ? LIFT_PANELS.top : LIFT_PANELS.bottom)) < LIFT_REACH;
  }

  function nearLock() {
    return phase === "lava" && !site.lava.unlocked && here.y > SQUISHY_FLOOR - 0.3 && Math.hypot(center.x - BUTTON.x, center.z - BUTTON.z) < BUTTON_REACH;
  }

  function nearMachine() {
    return phase === "chef" && !soda && here.y > ARENA_FLOOR - 0.3 && Math.hypot(center.x - MACHINE.x, center.z - MACHINE.z) < MACHINE_REACH;
  }

  /** Level 80: the chef only comes out once you've drunk the soda, then runs you through the rooms to the arena. */
  function updateChef(dt) {
    if (here.y < ARENA_FLOOR - 3) {
      respawn(VENDING_LEVEL, t("toast.goo"), t("toast.keepGoing"));
      return;
    }
    const chef = site.chef;
    if (!chef.out && soda) {
      chefIn -= dt;
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
    /** Locks you up at checkpoint `at` (50, 75, 80, or 90), building the prison. Returns where to put the player. */
    enter(at, { again = false } = {}) {
      replay = again;
      site ??= buildSite(scene, origin, { graphics, audio });
      active = true;
      events.length = 0;
      reset(SPAWNS[at] ? at : PRISON_LEVEL);
      if (level === PRISON_LEVEL) {
        if (police) toast(t("toast.policeShift"), t("toast.catchThem"), 3);
        else toast(t("toast.lockedUp"), t("toast.findVent"), 3);
      }
      return spot(level);
    },
    /**
     * Playing as police or not. In the prison it takes over from where you are: as police the
     * capybara police leave you be and prisoners start getting out; back as a prisoner, the police
     * come after you again.
     */
    setPolice(on) {
      if (police === on) return;
      police = on;
      if (!active || !site) return;
      if (on) {
        for (const officer of site.police) officer.hide();
        policeIn = 0;
        if (phase === "chase" && !late) escapeeIn = ESCAPEE_FIRST;
      } else {
        site.escapee.hide();
        escapeeIn = Infinity;
        if (phase === "chase") policeIn = pace.policeDelay;
      }
    },
    /** A police player caught you: back to your checkpoint. False when that can't happen right now. */
    nabbed(text, next) {
      if (!active || !site || police || caught || phase === "zip") return false;
      respawn(level, text, next);
      return true;
    },
    /**
     * The bots' way through the prison (see `botRoute`), in world space, starting from the stretch
     * you're on: `nodes`, `start`, `hop(x, z)` (how high to hop at a spot in the chef chase), and
     * the soda and zipline speeds.
     */
    botPlan() {
      const nodes = botRoute(site?.lava.keyIndex ?? 0).map((node) => ({
        ...node,
        x: node.x + origin.x,
        y: node.y + origin.y,
        z: node.z + origin.z,
        section: node.section && { ...node.section, safeX: node.section.safeX === undefined ? undefined : node.section.safeX + origin.x },
      }));
      const from = level === BOSS_LEVEL ? VENDING_LEVEL : level;
      const path = site?.zip.path ?? createZipPath();
      const shift = origin.clone();
      return {
        nodes,
        start: Math.max(0, nodes.findIndex((node) => node.section?.level === from)),
        hop: (x, z) => obstacleHop(x - origin.x, z - origin.z),
        /**
         * The lava room: a bot opens cupboard `index` for a look, unlocks the button to borrow the
         * cages, and takes the elevator down (it only goes if you're not in it or under it).
         */
        lava: {
          open: (index) => site?.lava.peek(index),
          unlock: () => site?.lava.borrow(BOT_CAGE_SECONDS),
          lift: () => {
            if (site?.lift.atTop && !lifting && !inLift() && !underLift()) site.lift.go();
          },
          liftSeconds: LIFT_GATE_SECONDS + LIFT_SECONDS,
        },
        soda: SODA_SPEED,
        zip: {
          start: ZIP_START_SPEED,
          accel: ZIP_ACCEL,
          brake: ZIP_BRAKE,
          length: path.length,
          target: (s) => zipTarget(path, s),
          /** Puts the cable point `s` along into `out` (world space) and returns the heading there. */
          at(s, out) {
            const heading = path.at(s, out);
            out.x += shift.x;
            out.y += shift.y;
            out.z += shift.z;
            return heading;
          },
        },
      };
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
     * grabs the zipline, "cupboard" opens a cupboard, "unlock" unlocks the lava room's button with
     * the key ("needKey" without it), "liftDown" or "liftUp" rides the elevator you're standing in,
     * "liftCall" calls it to your floor, "soda" buys an energy soda. Null when there's nothing to do.
     */
    get action() {
      if (!active || !site || caught !== null || lifting) return null;
      if (site.grates.some((grate) => grate.closed && Vector3.Distance(grate.center, center) < GRATE_REACH)) return "vent";
      if (nearHandle()) return "zip";
      if (nearCupboard()) return "cupboard";
      if (nearLock()) return site.lava.hasKey ? "unlock" : "needKey";
      if (phase === "lava" && inLift()) return site.lift.atTop ? "liftDown" : "liftUp";
      if (phase === "lava" && nearLiftPanel()) return "liftCall";
      if (nearMachine()) return "soda";
      return null;
    },
    /** True while you carry the lava room's key. */
    get hasKey() {
      return active && site !== null && site.lava.hasKey;
    },
    act() {
      const action = this.action;
      if (action === "vent") {
        site.grates.find((each) => each.closed && Vector3.Distance(each.center, center) < GRATE_REACH).open();
        audio.blip("thump");
      } else if (action === "cupboard") {
        audio.blip("thump");
        if (site.lava.open(nearCupboard())) toast(t("toast.keyFound"), t("toast.findLock"), 2.4);
        else toast(t("toast.emptyCupboard"), null, 1.4);
      } else if (action === "needKey") {
        toast(t("toast.needKey"), null, 2);
      } else if (action === "unlock") {
        site.lava.unlock();
        audio.blip("clank");
        toast(t("toast.cagesForm"), t("toast.climbCages"), 2.4);
      } else if (action === "liftDown" || action === "liftUp") {
        lifting = site.lift.go();
        audio.blip("clank");
      } else if (action === "liftCall") {
        site.lift.go();
        audio.blip("clank");
      } else if (action === "zip") {
        grab();
      } else if (action === "soda") {
        // main.js takes the coins and gives you the speed.
        soda = true;
        chefIn = pace.chefDelay;
        site.kitchenDoor.open();
        events.push({ type: "soda" });
      }
    },
    /** True while you hang from the zipline. */
    get riding() {
      return active && phase === "zip";
    },
    /**
     * Moves you along the zipline, or down (or up) in the lava room's elevator, standing in the
     * middle of the car facing east so the camera watches from over the lava. Call before the
     * player update; while riding, put the capsule centre at the returned position instead. Null
     * when you're not on either (or it just let you go).
     */
    ride(dt, hold) {
      if (!active || !site) return null;
      if (lifting) {
        if (site.lift.parked) {
          lifting = false;
          return null;
        }
        return { position: world((LIFT.x0 + LIFT.x1) / 2, site.lift.y + FOOT_OFFSET + 0.02, (LIFT.z0 + LIFT.z1) / 2), heading: Math.PI / 2 };
      }
      if (phase !== "zip") return null;
      if (!hold) {
        const change = zipTarget(site.zip.path, rideS) - rideSpeed;
        rideSpeed += Math.max(-ZIP_BRAKE * dt, Math.min(ZIP_ACCEL * dt, change));
        rideS = Math.min(site.zip.length, rideS + rideSpeed * dt);
      }
      const point = site.zip.place(rideS);
      if (rideS >= site.zip.length) phase = "duct";
      return { position: world(point.x, point.y - ZIP_HANG + FOOT_OFFSET, point.z), heading: site.zip.heading };
    },
    /**
     * `hold` freezes the actors (menus, dances, screen changes). Returns this frame's events:
     * `toast`, `respawn` (position, heading), `checkpoint` (level, text), `closeUp` (eye, target:
     * look at the capybara that caught you), `closeUpEnd`, `ventTwo` (you're on your way to the
     * zipline), `zipGrab` (you're on it), `lava` (position, heading: you fell in the lava room's lava;
     * where to put you after the pop), `soda` (you bought one), `sodaEnd` (it's taken away), `nab`
     * (position: as police you caught an escaping prisoner there), and `free`.
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
      if (site.lava.takeClank()) audio.blip("clank");
      if (site.lift.takeDing()) {
        audio.blip("ding");
        if (lifting && !site.lift.atTop) toast(t("toast.liftArrived"), null, 2.4);
      }
      if (site.lift.idle > LIFT_RETURN_SECONDS && !inLift()) site.lift.go();
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
        if (police) {
          escapeeIn = ESCAPEE_FIRST;
        } else {
          policeIn = pace.policeDelay;
          toast(t("toast.policeSpotted"), null, 2.6);
        }
      } else if (phase === "chase") updateChase(dt);
      else if (phase === "lava") updateLava(dt);
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

/**
 * The way the bots run the escape, in prison space: spots to get to and how ("run", "crawl", "hop",
 * "drop", "lift" down in the lava room's elevator, or "ride" the zipline). A `section` starts a
 * stretch a bot goes back to the start of when it's caught or misses a `risky` hop: who chases it
 * there, whether it has had the soda, and what it says. `pause` waits on arrival; `open` (a
 * cupboard's index), `unlock` (the lava room's button), and `lift` (calling the elevator down)
 * happen on arrival. `keyIndex` is the cupboard with the key in it.
 */
function botRoute(keyIndex) {
  const at = (x, y, z, how = "run", extra = {}) => ({ x, y, z, how, ...extra });
  const F = ARENA_FLOOR;
  const S = SQUISHY_FLOOR;
  const cupboard = CUPBOARDS[keyIndex];
  // Starting spots a little off yours, so nobody stands inside you.
  return [
    at(1.4, 0, -0.9, "run", { section: { level: PRISON_LEVEL, say: "prisonStart" }, pause: 1 }),
    at(-1.2, 0, 0.5),
    at(-1.65, 0.45, 0.5, "hop"),
    at(-2.6, 0.85, 0.5, "hop"),
    at(-2.5, 1.65, -1.5, "hop"),
    ...VENT_PATH.map(([x, z]) => at(x, 1.65, z, "crawl")),
    at(-15.1, HALL_FLOOR, -1.5, "drop", { section: { chaser: "police", say: "prisonRun" } }),
    ...POLICE_ROUTE.slice(1).map((point) => at(point.x, point.y, point.z)),
    at(-20.6, S, 9.4, "run", { section: { level: LAVA_LEVEL, lava: true, say: "prisonLava" } }),
    at(cupboard.x + Math.sin(cupboard.yaw) * 0.9, S, cupboard.z + Math.cos(cupboard.yaw) * 0.9, "run", { pause: 1.2, open: keyIndex, say: "prisonKey" }),
    at(BUTTON.x - 0.6, S, BUTTON.z - 0.9, "run", { pause: 2.2, unlock: true, say: "prisonUnlock" }),
    at(LAVA_POOL.x0 - 0.5, S, cageZ(1)),
    ...CAGES.map(([x, top, wall]) => at(x, top, cageZ(wall), "hop", { risky: true })),
    at(-5.3, LANDING.top, 17.4, "hop"),
    at(-5.3, LANDING.top, LANDING.z0 + 0.6),
    at((LIFT.x0 + LIFT.x1) / 2, LANDING.top, (LIFT.z0 + LIFT.z1) / 2, "run", { pause: 0.4, lift: true, say: "prisonLift" }),
    at((LIFT.x0 + LIFT.x1) / 2, S, (LIFT.z0 + LIFT.z1) / 2, "lift"),
    at((LAVA_EXIT[0] + LAVA_EXIT[1]) / 2, S, 7.6),
    at((LAVA_EXIT[0] + LAVA_EXIT[1]) / 2, S, 4.6),
    at(-12.6, S, -2.7, "run", { section: { say: "prisonSafe" } }),
    ...WALL_SQUISHIES.map((pad) => at(pad.x, pad.top, pad.z, "hop", { risky: true })),
    at(-3.6, LEDGE_TOP, 4.5, "hop"),
    ...VENT2_PATH.slice(1).map(([x, z]) => at(x, LEDGE_TOP, z, "crawl")),
    at(ZIP_FROM.x, LEDGE_TOP, ZIP_FROM.z, "run", { pause: 0.6, say: "prisonZip" }),
    at(ZIP_TO.x, ZIP_TO.y - ZIP_HANG, ZIP_TO.z, "ride"),
    at(SPAWNS[KILLER_LEVEL].x, KILLER_FLOOR, SPAWNS[KILLER_LEVEL].z, "drop", {
      section: { level: KILLER_LEVEL, chaser: "killer", safeX: PIT_EDGE, goo: true, say: "prisonKiller" },
    }),
    at(PIT_EDGE - 0.5, KILLER_FLOOR, -1),
    ...OBBY.map(([x0, x1, z0, z1, top]) => at((x0 + x1) / 2, top, (z0 + z1) / 2, "hop", { risky: true })),
    at(41.4, F, 0.2, "hop"),
    at(41.8, F, 7.6),
    at(40, F, 10.4, "run", { section: { level: VENDING_LEVEL } }),
    at(MACHINE.x + 0.8, F, MACHINE.z, "run", { pause: 1.5, say: "prisonSoda" }),
    at(41.4, F, 15.4, "run", { section: { chaser: "chef", soda: true, hops: true, say: "prisonChef" } }),
    ...CHEF_ROUTE.slice(2).map((point) => at(point.x, point.y, point.z)),
    at(47.6, F, 5, "run", { section: { level: BOSS_LEVEL, say: "prisonMadeIt" }, pause: 5 }),
  ];
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
    ice: material("ice", "#cfe9ff", 0.16),
    frost: material("frost", "#8fb8d4", 0.08),
    carpet: material("carpet", "#7a2232"),
    dining: material("dining", "#d9c7a3"),
    cloth: material("cloth", "#f2eee4", 0.1),
    shelf: material("shelf", "#8a6038"),
    arena: material("arena", "#3b2f4a"),
    arenaWall: material("arenaWall", "#6e2a35"),
    door: material("door", "#24356b"),
    dark: material("dark", "#120c10", 0),
    exit: material("exit", "#e8e4d0", 0.5),
    cupboard: material("cupboard", "#8a5a34"),
    cupboardDoor: material("cupboardDoor", "#b07a45"),
    gold: material("gold", "#ffc93a", 0.5),
    button: material("button", "#e8182e", 0.35),
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

  // 4. The stairwell: four flights up to the door at the top, open all the way up to the cell
  // block's roof, with the zipline ledge high on its far wall.
  const ductTop = LEDGE_TOP + 2.1;
  const [ledgeX0, ledgeX1, ledgeZ0, ledgeZ1] = ZIP_LEDGE;
  const ventZ = [ZIP_FROM.z - DUCT_HALF, ZIP_FROM.z + DUCT_HALF];
  box(-30.4, HALL_FLOOR, -6.4, -30, LEDGE_TOP, 6.4, M.concrete);
  box(-30.4, ductTop, -6.4, -30, BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(-30.4, LEDGE_TOP, -6.4, -30, ductTop, ventZ[0], M.concrete);
  box(-30.4, LEDGE_TOP, ventZ[1], -30, ductTop, 6.4, M.concrete);
  box(-30, HALL_FLOOR, -6.4, -18, SPLIT_TOP, -6, M.concrete);
  box(-30, HALL_FLOOR, 6, -18, SQUISHY_FLOOR, 6.4, M.concrete);
  box(-30, SQUISHY_FLOOR, 6, LAVA_DOOR[0], BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(LAVA_DOOR[1], SQUISHY_FLOOR, 6, -18, BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(LAVA_DOOR[0], SQUISHY_FLOOR + 2.8, 6, LAVA_DOOR[1], BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(-18, 1.4, -6.4, -17.6, 9, 6.4, M.concrete);
  box(-18, 11.8, -6.4, -17.6, 16.4, 6.4, M.concrete);
  box(-18, 9, -6.4, -17.6, 11.8, -2.5, M.concrete);
  box(-18, 9, 2.5, -17.6, 11.8, 6.4, M.concrete);
  box(-30.4, BLOCK_TOP, BLOCK_B.z0 - 0.4, GOO_PIT.x1 + 0.4, BLOCK_TOP + 0.4, 6.4, M.ceiling);
  // The zipline ledge, railed except where the cable leaves it to the south.
  const edge = (x0, x1, z) => {
    box(x0, LEDGE_TOP, z - 0.05, x1, LEDGE_TOP + 1.05, z + 0.05, null);
    box(x0, LEDGE_TOP + 0.96, z - 0.05, x1, LEDGE_TOP + 1.04, z + 0.05, M.hazard, { solid: false, camera: false });
  };
  box(ledgeX0, LEDGE_TOP - 0.4, ledgeZ0, ledgeX1, LEDGE_TOP, ledgeZ1, M.steel, { cast: true });
  for (const z of [ledgeZ0 + 0.5, ledgeZ1 - 0.5]) box(ledgeX0, LEDGE_TOP - 1.4, z - 0.15, ledgeX1 - 0.3, LEDGE_TOP - 0.4, z + 0.15, M.trim, { solid: false });
  railing(ledgeZ0, ledgeZ1, ledgeX1, LEDGE_TOP);
  edge(ledgeX0, ledgeX1, ledgeZ1);
  edge(ledgeX0, ZIP_FROM.x - 0.8, ledgeZ0);
  edge(ZIP_FROM.x + 0.8, ledgeX1, ledgeZ0);
  box(ZIP_FROM.x - 0.8, LEDGE_TOP, ledgeZ0, ZIP_FROM.x + 0.8, LEDGE_TOP + 0.02, ledgeZ0 + 0.12, M.hazard, { solid: false, camera: false });
  sign(t("prison.zipline"), -29.97, LEDGE_TOP + 3.2, ZIP_FROM.z, -Math.PI / 2, 3, 0.7, "#ffd23f", "#2b1405");
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
  for (const z of [-4.5, 0, 4.5]) lamp(-24, BLOCK_TOP, z, 2, 0.6);

  // The cell block in the middle of the stairwell: three floors of barred cells facing the flights,
  // with inmates bouncing and pacing inside. The bars are solid both ways, and its roof is bars
  // too, so you see the top floor's inmates from the zipline.
  const cellInmates = [];
  box(-26.6, HALL_FLOOR, -3.2, -26.3, 9, 3.2, M.concrete);
  box(-21.7, HALL_FLOOR, -3.2, -21.4, 9, 3.2, M.concrete);
  box(-26.3, HALL_FLOOR, -0.15, -21.7, 9, 0.15, M.concrete);
  box(-26.6, 8.7, -3.2, -21.4, 9, 3.2, null);
  const cellBars = [];
  for (let z = -3.05; z <= 3.06; z += 0.3) {
    const bar = MeshBuilder.CreateCylinder("prisonCellRoofBar", { height: 5.2, diameter: 0.07, tessellation: 6 }, scene);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(-24, 8.95, z);
    cellBars.push(bar);
  }
  for (const x of [-26.45, -21.55]) box(x - 0.15, 8.7, -3.2, x + 0.15, 9, 3.2, M.concrete, { solid: false });
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
      cellInmates.push({ mesh: look, base, pace: (floor + (side > 0 ? 1 : 0)) % 2 === 0, phase: floor * 1.7 + side, middle: -23.6, swing: 1.3 });
    }
  }

  // Cell Block B, south of the stairwell and the squishy wall and open to them above SPLIT_TOP:
  // rows of two-floor barred cells with barred roofs, inmates inside and police pacing the aisles,
  // all far below the zipline.
  const patrols = [];
  const { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } = BLOCK_B;
  box(bx0, HALL_FLOOR - 0.4, bz0, bx1, HALL_FLOOR, bz1, M.tile);
  box(bx0 - 0.4, HALL_FLOOR, bz0 - 0.4, bx0, BLOCK_TOP + 0.4, bz1, M.concrete);
  box(bx0, HALL_FLOOR, bz0 - 0.4, bx1 + 0.4, BLOCK_TOP + 0.4, bz0, M.concrete);
  box(bx1, HALL_FLOOR, bz0 - 0.4, bx1 + 0.4, BLOCK_TOP + 0.4, -8.4, M.concrete);
  box(bx0, SPLIT_TOP - 0.04, -6.44, bx1, SPLIT_TOP + 0.02, -5.96, M.hazard, { solid: false, camera: false });
  sign(t("prison.cellBlockB"), (bx0 + bx1) / 2, 13, bz0 + 0.03, Math.PI, 7, 1.2, "#2f3640", "#ffd23f");
  const [rowZ0, rowZ1] = CELL_ROW_Z;
  const rowTop = HALL_FLOOR + 8;
  for (const [row, cx] of CELL_ROWS.entries()) {
    box(cx - 0.15, HALL_FLOOR, rowZ0, cx + 0.15, rowTop, rowZ1, M.concrete);
    for (let z = rowZ0; z <= rowZ1 + 0.01; z += 4) box(cx - 2.5, HALL_FLOOR, z - 0.15, cx + 2.5, rowTop, z + 0.15, M.concrete);
    box(cx - 2.5, rowTop - 0.3, rowZ0, cx + 2.5, rowTop, rowZ1, null);
    for (const x of [cx - 2.4, cx + 2.4]) box(x - 0.1, rowTop - 0.3, rowZ0, x + 0.1, rowTop, rowZ1, M.concrete, { solid: false });
    for (let x = cx - 2.1; x <= cx + 2.11; x += 0.35) {
      const bar = MeshBuilder.CreateCylinder("prisonBlockRoofBar", { height: rowZ1 - rowZ0, diameter: 0.07, tessellation: 6 }, scene);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(x, rowTop - 0.05, (rowZ0 + rowZ1) / 2);
      cellBars.push(bar);
    }
    for (let floor = 0; floor < 2; floor += 1) {
      const base = HALL_FLOOR + floor * 4;
      if (floor > 0) box(cx - 2.5, base - 0.3, rowZ0, cx + 2.5, base, rowZ1, M.floor);
      for (const side of [-1, 1]) {
        const face = cx + side * 2.44;
        box(face - 0.06, base, rowZ0, face + 0.06, base + 3.7, rowZ1, null);
        for (let z = rowZ0 + 0.2; z < rowZ1 - 0.1; z += 0.4) {
          const bar = MeshBuilder.CreateCylinder("prisonCellBar", { height: 3.7, diameter: 0.07, tessellation: 6 }, scene);
          bar.position.set(face, base + 1.85, z);
          cellBars.push(bar);
        }
        for (let cell = 0; cell * 4 < rowZ1 - rowZ0; cell += 1) {
          const middle = rowZ0 + 2 + cell * 4;
          box(cx + side * 0.15, base, middle - 1.7, cx + side * 1.05, base + 0.5, middle - 0.3, M.mattress, { camera: false });
          const look = buildCapybara(scene, "inmate").createInstance(`prison-blockInmate${row}${floor}${side}${cell}`);
          look.parent = root;
          look.isPickable = false;
          look.position.set(cx + side * 1.6, base, middle);
          look.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          const pace = (row + floor + cell + (side > 0 ? 1 : 0)) % 2 === 0;
          cellInmates.push({ mesh: look, base, pace, phase: row * 2.3 + floor * 1.7 + cell * 0.9 + side, alongZ: true, middle, swing: 1.1 });
        }
      }
    }
  }
  for (const [i, x] of [-20.3, -9.5, 2.2].entries()) {
    const guard = buildCapybara(scene, "police").createInstance(`prison-blockGuard${i}`);
    guard.parent = root;
    guard.isPickable = false;
    guard.scaling.setAll(1.3);
    guard.position.set(x, HALL_FLOOR, -22);
    patrols.push({ mesh: guard, middle: -22, swing: 12, speed: 0.22 + i * 0.04, phase: i * 2.1 });
    for (const z of [-14, -24, -34]) lamp(x, BLOCK_TOP, z, 2, 0.6);
  }
  for (const bar of cellBars) add(bar, M.bars, { camera: false });

  // 5. The squishy wall room, floor 9. The squishies climb the far wall to the second vent.
  box(-17.6, SQUISHY_FLOOR - 0.4, -6.4, -3.6, SQUISHY_FLOOR, 6.4, M.floor);
  box(-18, HALL_FLOOR, -6.4, -3.6, SPLIT_TOP, -6, M.concrete);
  box(-17.6, SQUISHY_FLOOR, 6, LAVA_EXIT[0], BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(LAVA_EXIT[1], SQUISHY_FLOOR, 6, -3.6, BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(LAVA_EXIT[0], SQUISHY_FLOOR + 2.8, 6, LAVA_EXIT[1], BLOCK_TOP + 0.4, 6.4, M.concrete);
  // The wall the squishies end on: full height round the vent, and low enough on the zipline's side
  // for the rider to pass over.
  const ventWall = 2.6;
  box(-4, GOO_PIT.top - 0.4, -6.4, -3.6, SQUISHY_FLOOR, 6.4, M.concrete);
  box(-4, SQUISHY_FLOOR, -6, -3.6, EAST_WALL_TOP, -1.4, M.trim);
  box(-4, SQUISHY_FLOOR, -1.4, -3.6, 17.8, ventWall, M.trim);
  box(-4, SQUISHY_FLOOR, ventWall, -3.6, LEDGE_TOP, 6, M.trim);
  box(-4, LEDGE_TOP, ventWall, -3.6, ductTop, 3.6, M.trim);
  box(-4, LEDGE_TOP, 5.4, -3.6, ductTop, 6, M.trim);
  box(-4, ductTop, ventWall, -3.6, ductTop + 0.2, 6, M.trim);
  box(-4, EAST_WALL_TOP - 0.02, -6, -3.6, EAST_WALL_TOP + 0.02, -1.4, M.hazard, { solid: false, camera: false });
  for (const x of [-15, -10]) for (const z of [-3, 3]) lamp(x, BLOCK_TOP, z, 2, 0.6);
  box(-4.02, ductTop, 3.5, -3.96, ductTop + 0.1, 5.5, M.metal, { solid: false, camera: false });

  // 5b. The lava room, through the door at the top of the stairs: cupboards round its west end, the
  // big red button by the lava, and the way out to the squishy room at its east end. The doors, the
  // key, the button's padlock, and the cages it forms move, so `buildLavaRoom` makes them.
  const { x0: lx0, x1: lx1, z0: lz0, z1: lz1, top: lavaTop } = LAVA_ROOM;
  const S = SQUISHY_FLOOR;
  box(lx0, S - 1.2, lz0, LAVA_POOL.x0, S, lz1, M.floor);
  box(LAVA_POOL.x1, S - 1.2, lz0, lx1, S, lz1, M.floor);
  box(LAVA_POOL.x0, S - 1.6, lz0, LAVA_POOL.x1, LAVA_POOL.y - 0.02, lz1, M.dark);
  box(lx0 - 0.4, S - 1.2, lz0, lx0, lavaTop, lz1 + 0.4, M.concrete);
  box(lx1, S - 1.2, lz0, lx1 + 0.4, lavaTop, lz1 + 0.4, M.concrete);
  box(lx0, S - 1.2, lz1, lx1, lavaTop, lz1 + 0.4, M.concrete);
  box(lx0 - 0.4, lavaTop, lz0, lx1 + 0.4, lavaTop + 0.4, BAY.z0 - 0.4, M.ceiling);
  box(lx0 - 0.4, lavaTop, BAY.z0 - 0.4, BAY.x0 - 0.4, lavaTop + 0.4, lz1 + 0.4, M.ceiling);
  for (const x of [LAVA_POOL.x0 - 0.15, LAVA_POOL.x1]) box(x, S - 0.01, lz0, x + 0.15, S + 0.01, lz1, M.hazard, { solid: false, camera: false });
  for (const x of [-25, -19, -12, -6]) lamp(x, lavaTop, 12.4, 2, 0.6);
  // The tall bay over the cage stairs and the elevator shaft: its hanging wall over the lava, the
  // walls carried on up, and its roof.
  box(BAY.x0, PARTITION_BOTTOM, BAY.z0 - 0.4, LAVA_POOL.x1, lavaTop, BAY.z0, M.concrete);
  box(BAY.x0 - 0.4, lavaTop, BAY.z0 - 0.4, lx1 + 0.4, BAY.top, BAY.z0, M.concrete);
  box(BAY.x0 - 0.4, lavaTop, BAY.z0, BAY.x0, BAY.top, lz1, M.concrete);
  box(BAY.x0 - 0.4, lavaTop, lz1, lx1 + 0.4, BAY.top, lz1 + 0.4, M.concrete);
  box(lx1, lavaTop, BAY.z0, lx1 + 0.4, BAY.top, lz1, M.concrete);
  box(BAY.x0 - 0.4, BAY.top, BAY.z0 - 0.4, lx1 + 0.4, BAY.top + 0.4, lz1 + 0.4, M.ceiling);
  for (const x of [-14, -9.5, -5.3]) lamp(x, BAY.top, 15.9, 2, 0.6);
  // The top floor at the end of the cage stairs, the elevator's call panels on the east wall, and its sign.
  box(LANDING.x0, S, LANDING.z0, lx1, LANDING.top, lz1, M.concrete);
  box(LANDING.x0, LANDING.top - 0.01, LANDING.z0, LANDING.x0 + 0.12, LANDING.top + 0.01, lz1, M.hazard, { solid: false, camera: false });
  for (const [z, y] of [
    [LIFT_PANELS.top, LANDING.top],
    [LIFT_PANELS.bottom, S],
  ]) {
    box(lx1 - 0.05, y + 0.9, z - 0.18, lx1, y + 1.4, z + 0.18, M.steel, { solid: false, camera: false });
    box(lx1 - 0.09, y + 1.08, z - 0.07, lx1 - 0.05, y + 1.22, z + 0.07, M.button, { solid: false, camera: false });
  }
  sign(t("prison.lift"), lx1 - 0.03, LANDING.top + 2.45, (LIFT.z0 + LIFT.z1) / 2, Math.PI / 2, 1.8, 0.45, "#2f3640", "#ffd84a");
  for (const spec of CUPBOARDS) {
    const across = Math.abs(Math.sin(spec.yaw)) > 0.5;
    const [hw, hd] = across ? [0.3, 0.7] : [0.7, 0.3];
    box(spec.x - hw, S, spec.z - hd, spec.x + hw, S + 2, spec.z + hd, M.cupboard, { cast: true });
    // The dark inside you see once the doors swing open.
    const ix = spec.x + Math.sin(spec.yaw) * hw;
    const iz = spec.z + Math.cos(spec.yaw) * hd;
    const [iw, id] = across ? [0.01, 0.62] : [0.62, 0.01];
    box(ix - iw, S + 0.08, iz - id, ix + iw, S + 1.92, iz + id, M.dark, { solid: false, camera: false });
  }
  box(BUTTON.x - 0.3, S, BUTTON.z - 0.3, BUTTON.x + 0.3, S + 1, BUTTON.z + 0.3, M.steel, { cast: true });
  box(BUTTON.x - 0.32, S + 0.98, BUTTON.z - 0.32, BUTTON.x + 0.32, S + 1.02, BUTTON.z + 0.32, M.hazard, { solid: false, camera: false });
  sign(t("prison.lavaRoom"), (LAVA_DOOR[0] + LAVA_DOOR[1]) / 2, S + 3.4, 5.97, 0, 2.6, 0.6, "#ff7a1a", "#2b1405");
  sign(t("prison.exit"), (LAVA_EXIT[0] + LAVA_EXIT[1]) / 2, S + 3.3, 6.43, Math.PI, 1.6, 0.5, "#2f8f46", "#ffffff");
  marker(LAVA_LEVEL, SPAWNS[LAVA_LEVEL].x, S, SPAWNS[LAVA_LEVEL].z);
  // Goo over your own cell, between the squishy wall and the killer capybara's floor.
  box(GOO_PIT.x0, GOO_PIT.top - 0.4, -6, GOO_PIT.x1, GOO_PIT.top, 6, M.goo);
  box(GOO_PIT.x0, HALL_FLOOR, -6.4, GOO_PIT.x1 + 0.4, SPLIT_TOP, -6, M.concrete);
  box(-1, GOO_PIT.top - 0.4, 6, GOO_PIT.x1 + 0.4, BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(GOO_PIT.x0, GOO_PIT.top - 0.4, 6, -1, LEDGE_TOP - 0.2, 6.4, M.concrete);
  box(GOO_PIT.x0, ductTop + 0.2, 6, -1, BLOCK_TOP + 0.4, 6.4, M.concrete);
  box(GOO_PIT.x1, GOO_PIT.top - 0.4, -6, GOO_PIT.x1 + 0.4, KILLER_FLOOR, 6, M.concrete);
  for (const z of [-3, 3]) lamp(1.2, BLOCK_TOP, z, 2, 0.6);

  // 6. The second vent: out of the squishy wall's top, through the north wall, zig-zagging west
  // outside the cell block, and in through the stairwell's far wall onto the zipline ledge.
  const ventRooms = [
    [GOO_PIT.x0, -1, 3.4, 6.4],
    [-33.4, -1, 6.4, 12.6],
    [-33.4, -30.4, ventZ[0] - 0.3, 6.4],
  ];
  for (const [x0, x1, z0, z1] of ventRooms) {
    box(x0, LEDGE_TOP - 0.2, z0, x1, LEDGE_TOP, z1, M.metal);
    box(x0, ductTop, z0, x1, ductTop + 0.2, z1, M.metal);
    ductWalls(x0, x1, z0, z1, LEDGE_TOP, ductTop, VENT2_PATH);
  }
  for (const [x, z] of VENT2_PATH.slice(1, -1)) lamp(x, ductTop, z, 0.5, 0.3);
  box(ledgeX0 - 0.05, LEDGE_TOP, ventZ[0], ledgeX0 + 0.05, LEDGE_TOP + 0.02, ventZ[1], M.hazard, { solid: false, camera: false });

  // 7. The zipline over the cell block, and the killer capybara's room, open to the cell block above
  // its floor: the floor, the goo pit, the obby, and the ledge on the far side with the door to the
  // vending room.
  const zip = buildZipline(scene, root, add, M);
  box(6.4, 9, -8, PIT_EDGE, KILLER_FLOOR, 8, M.floor);
  box(6.4, KILLER_FLOOR, -6, 6.8, KILLER_FLOOR + 0.02, 6, M.hazard, { solid: false, camera: false });
  box(PIT_EDGE - 0.4, KILLER_FLOOR, -8, PIT_EDGE, KILLER_FLOOR + 0.02, 8, M.hazard, { solid: false, camera: false });
  box(PIT_EDGE, 8.6, -8, 40, 9, 8, M.goo);
  box(40, 9, -8, 44, ARENA_FLOOR, 8, M.steel);
  box(6, HALL_FLOOR, -8.4, 6.4, BLOCK_TOP + 0.4, -6.4, M.concrete);
  box(6, 9, 6.4, 6.4, BLOCK_TOP + 0.4, 8.4, M.concrete);
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

  // 8. The vending room through the door off the far ledge (floor at ARENA_FLOOR, ceiling 4.2
  // above), then the chef chase: up the kitchen, across the pantry, down the freezer, and up and
  // back down the dining hall to the arena's side door.
  const AF = ARENA_FLOOR;
  const roomTop = AF + 4.2;
  const chaseTop = AF + CHASE_HEIGHT;
  const [doorX0, doorX1] = KITCHEN_DOOR;
  box(34, AF - 0.4, 8.4, 44, AF, 16.4, M.tile);
  box(33.6, AF, 8.4, 34, roomTop, 16.4, M.kitchen);
  box(33.6, roomTop, 8.4, 44, roomTop + 0.4, 16.4, M.ceiling);
  box(33.6, AF, 16.4, doorX0, chaseTop, 16.8, M.kitchen);
  box(doorX1, AF, 16.4, 44.4, chaseTop, 16.8, M.kitchen);
  box(doorX0, AF + 2.8, 16.4, doorX1, chaseTop, 16.8, M.kitchen);
  box(doorX0, AF, 16.32, doorX1, AF + 0.02, 16.4, M.hazard, { solid: false, camera: false });
  sign(t("prison.kitchen"), (doorX0 + doorX1) / 2, AF + 3.4, 16.37, 0, 3, 0.6, "#2f3640", "#ffffff");
  // The vending machine against the west wall, its lit front full of cans facing the room.
  box(34, AF, 11.5, 35.1, AF + 2.2, 13.3, M.vend, { cast: true });
  box(35.1, AF + 0.85, 11.7, 35.13, AF + 2.0, 13.1, M.vendGlow, { solid: false, camera: false });
  box(35.1, AF + 0.25, 11.9, 35.16, AF + 0.55, 12.9, M.dark, { solid: false, camera: false });
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const can = MeshBuilder.CreateCylinder("prisonCan", { height: 0.22, diameter: 0.13, tessellation: 10 }, scene);
      can.position.set(35.2, AF + 1.07 + row * 0.33, 11.95 + col * 0.3);
      add(can, M.cans[(row + col) % M.cans.length], { camera: false });
    }
  }
  sign(t("prison.soda"), 35.17, AF + 2.45, 12.4, -Math.PI / 2, 1.7, 0.4, "#ff2d6f", "#ffffff");
  // The chef's own door in the corner, where it bursts out from.
  box(33.96, AF, 8.8, 34.02, AF + 2.6, 10.8, M.dark, { solid: false });
  lamp(39, roomTop, 12.4, 2, 0.6);
  marker(VENDING_LEVEL, SPAWNS[VENDING_LEVEL].x, AF, SPAWNS[VENDING_LEVEL].z);

  // The chase rooms' floors, walls, and ceiling.
  const rooms = CHASE_ROOMS;
  box(rooms.kitchen.x0, AF - 0.4, 16.4, rooms.kitchen.x1, AF, rooms.kitchen.z1, M.tile);
  box(rooms.kitchen.x1, AF - 0.4, rooms.pantry.z0 - 0.4, rooms.pantry.x1, AF, rooms.pantry.z1, M.wood);
  box(rooms.freezer.x0 - 0.4, AF - 0.4, rooms.freezer.z0, rooms.freezer.x1, AF, rooms.pantry.z0 - 0.4, M.frost);
  box(rooms.dining.x0, AF - 0.4, rooms.dining.z0, rooms.freezer.x0 - 0.4, AF, rooms.pantry.z0 - 0.4, M.carpet);
  box(33.6, AF, 16.4, 34, chaseTop, CHASE_END + 0.4, M.kitchen);
  box(33.6, AF, CHASE_END, 74.4, chaseTop, CHASE_END + 0.4, M.kitchen);
  box(44, AF, 12.4, 44.4, chaseTop, PANTRY_Z0, M.kitchen);
  box(44.4, AF, PANTRY_Z0 - 0.4, 64.4, chaseTop, PANTRY_Z0, M.dining);
  box(64, AF, 22, 64.4, chaseTop, PANTRY_Z0, M.frost);
  box(74, AF, 12.4, 74.4, chaseTop, CHASE_END + 0.4, M.frost);
  box(DINING_SPLIT.x, AF, 12.4, DINING_SPLIT.x + 0.4, chaseTop, DINING_SPLIT.z1, M.dining);
  box(33.6, chaseTop, 16.4, 74.4, chaseTop + 0.4, CHASE_END + 0.4, M.ceiling);
  box(44.4, chaseTop, 12, 74.4, chaseTop + 0.4, 16.4, M.ceiling);
  // Pantry shelves, too tall to jump, stacked with jars and boxes.
  SHELVES.forEach(([x, z0, z1], index) => {
    box(x - 0.3, AF, z0, x + 0.3, AF + 3.4, z1, M.shelf, { cast: true });
    for (let level = 0; level < 3; level += 1) {
      for (let item = 0; item < 4; item += 1) {
        const z = z0 + 0.7 + item * ((z1 - z0 - 1.4) / 3);
        const look = M.cans[(index + level + item) % M.cans.length];
        const side = item % 2 ? 0.34 : -0.34;
        box(x + side - 0.06, AF + 0.6 + level * 1, z - 0.2, x + side + 0.06, AF + 0.95 + level * 1, z + 0.2, look, { solid: false, camera: false });
      }
    }
  });
  // Counters, ice blocks, and tables to jump over.
  for (const [x0, x1, z0, z1, height, kind] of OBSTACLES) {
    const look = { counter: M.steel, ice: M.ice, table: M.wood }[kind];
    box(x0, AF, z0, x1, AF + height, z1, look, { cast: true });
    if (kind === "counter") box(x0 + 0.15, AF + height, z0 + 0.25, x1 - 0.15, AF + height + 0.03, z1 - 0.25, M.dark, { solid: false, camera: false });
    if (kind === "table") box(x0 - 0.05, AF + height, z0 - 0.05, x1 + 0.05, AF + height + 0.03, z1 + 0.05, M.cloth, { solid: false, camera: false });
  }
  sign(t("prison.pantry"), 50, AF + 3.9, CHASE_END - 0.03, Math.PI, 3, 0.6, "#5b3a1e", "#ffffff");
  sign(t("prison.freezer"), 69.2, AF + 3.9, CHASE_END - 0.03, Math.PI, 3, 0.6, "#2f6f9f", "#ffffff");
  sign(t("prison.dining"), 63.97, AF + 3.9, 26, Math.PI / 2, 3.4, 0.6, "#7a2232", "#ffffff");
  for (let z = 22; z < CHASE_END - 1; z += 10) lamp(39, chaseTop, z, 2, 0.6);
  for (const x of [50, 58, 66]) lamp(x, chaseTop, CHASE_END - 4.8, 2, 0.6);
  for (let z = 18; z < PANTRY_Z0 - 1; z += 12) {
    lamp(69.2, chaseTop, z, 2, 0.6);
    lamp(49.2, chaseTop, z, 2, 0.6);
    lamp(59.2, chaseTop, z, 2, 0.6);
  }

  // 9. The warden's arena: a stage for the giant capybara, crates for cover, and the exit gate.
  box(44.4, ARENA_FLOOR - 0.4, -12.4, 78.4, ARENA_FLOOR, 12.4, M.arena);
  box(44.4, ARENA_FLOOR, -12.4, 78, 34.4, -12, M.arenaWall);
  box(44.4, ARENA_FLOOR, 12, ARENA_DOOR[0], 34.4, 12.4, M.arenaWall);
  box(ARENA_DOOR[1], ARENA_FLOOR, 12, 78, 34.4, 12.4, M.arenaWall);
  box(ARENA_DOOR[0], ARENA_FLOOR + 3, 12, ARENA_DOOR[1], 34.4, 12.4, M.arenaWall);
  box(ARENA_DOOR[0], ARENA_FLOOR, 12.4, ARENA_DOOR[1], ARENA_FLOOR + 0.02, 12.64, M.hazard, { solid: false, camera: false });
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
  const chef = createActor(scene, root, "chef", CHEF_SIZE, "chefCapybara", obstacleHop);
  const escapee = createActor(scene, root, "inmate", ESCAPEE_SIZE, "escapeeCapybara");
  escapee.route = createRoute(POLICE_ROUTE);
  const kitchenDoor = buildSlideDoor(scene, root, M.steel, KITCHEN_DOOR[0], KITCHEN_DOOR[1], ARENA_FLOOR, 16.6);
  casters.push(kitchenDoor.mesh);
  // The side door at the top of the stairs into the squishy room, shut until you're out of the lava room.
  const sideDoor = buildSlideDoor(scene, root, M.steel, -2.5, 2.5, SQUISHY_FLOOR, -17.8, { alongZ: true });
  const lava = buildLavaRoom(scene, root, M);
  owned.push(lava);
  casters.push(...lava.casters);
  const lift = buildLift(scene, root, M);
  owned.push(lift);
  casters.push(...lift.casters);
  const boss = createBoss(scene, root);
  casters.push(...police.map((officer) => officer.body), killer.body, chef.body, escapee.body, boss.body, zip.trolley);
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
  const sideRoute = createRoute(SIDE_ROUTE);
  // Where the police stand stamping outside the lava room's door.
  const lavaWait = [
    [-19.2, 4.6],
    [-20, 3.4],
  ].map(([x, z]) => {
    const spot = police[0].route.project(x, SQUISHY_FLOOR, z);
    return { s: spot.s, side: spot.side, x, y: SQUISHY_FLOOR, z, facing: 0 };
  });
  killer.route = createRoute(KILLER_ROUTE);
  const door = killer.route.project(11, KILLER_FLOOR, 7.6);
  killer.door = { s: door.s, side: door.side, facing: Math.PI };
  chef.route = createRoute(CHEF_ROUTE);
  const chefDoor = chef.route.project(34.6, ARENA_FLOOR, 9.8);
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
    escapee,
    escapeeRoute: escapee.route,
    boss,
    gate,
    grates,
    zip,
    kitchenDoor,
    sideDoor,
    lava,
    lift,
    lavaWait,
    policeRoute: police[0].route,
    sideRoute,
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
      for (const other of [...police, killer, chef, escapee]) {
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
          const ahead = Math.cos(t * 0.9) > 0;
          if (inmate.alongZ) {
            inmate.mesh.position.z = inmate.middle + Math.sin(t * 0.9) * inmate.swing;
            inmate.mesh.rotation.y = ahead ? 0 : Math.PI;
          } else {
            inmate.mesh.position.x = inmate.middle + Math.sin(t * 0.9) * inmate.swing;
            inmate.mesh.rotation.y = ahead ? Math.PI / 2 : -Math.PI / 2;
          }
          inmate.mesh.position.y = inmate.base + Math.abs(Math.sin(t * 7)) * 0.05;
        } else {
          inmate.mesh.position.y = inmate.base + Math.abs(Math.sin(t * 4.5)) * 0.3;
        }
      }
      for (const guard of patrols) {
        const t = time * guard.speed + guard.phase;
        guard.mesh.position.z = guard.middle + Math.sin(t) * guard.swing;
        guard.mesh.position.y = HALL_FLOOR + Math.abs(Math.sin(time * 8)) * 0.06;
        guard.mesh.rotation.y = Math.cos(t) > 0 ? 0 : Math.PI;
      }
      gate.update(dt);
      kitchenDoor.update(dt);
      sideDoor.update(dt);
      lava.update(dt, time);
      lift.update(dt);
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
      kitchenDoor.dispose();
      sideDoor.dispose();
      for (const grate of grates) grate.dispose();
      for (const item of owned.reverse()) item.dispose();
      root.dispose(false, false);
    },
  };
}

/**
 * A capybara that runs after you along a route (see `createRoute`). It waits out of sight until
 * released, then keeps to the route's lane and heads for the spot nearest you. `hop(x, z)` lifts it
 * over anything in its way.
 */
function createActor(scene, root, look, size, name, hop = null) {
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
      const lift = hop ? hop(node.position.x, node.position.z) : 0;
      node.position.y = goal.y + lift;
      if (Math.hypot(dx, dz) > 0.01) {
        const want = Math.atan2(dx, dz);
        node.rotation.y += wrap(want - node.rotation.y) * Math.min(1, dt * 10);
      }
      const bounce = moving && lift < 0.05;
      body.position.y = bounce ? Math.abs(Math.sin(clock * 14)) * 0.08 * size : Math.abs(Math.sin(clock * 6)) * 0.05;
      body.rotation.z = bounce ? Math.sin(clock * 14) * 0.07 : 0;
      const near = Math.hypot(target.x - node.position.x, target.z - node.position.z) < reach + 0.3;
      // Along the route too, so a wall between two lanes never counts as close.
      return near && Math.abs(target.s - s) < 3 && Math.abs(target.y - goal.y) < 0.8;
    },
    /** Once it has stopped, stamps about facing `yaw`, cross that it can't get at you. */
    stomp(dt, yaw) {
      if (!this.out || delay > 0 || moving) return;
      clock += dt;
      node.rotation.y += wrap(yaw - node.rotation.y) * Math.min(1, dt * 6);
      body.position.y = Math.abs(Math.sin(clock * 8)) * 0.16 * size;
      body.rotation.z = Math.sin(clock * 16) * 0.12;
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
    length: total,
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
 * The lava room's moving parts, in prison space: the glowing lava, the cupboards' doors (the key is
 * in one cupboard), the big red button with its padlock, and the cage stairs the key makes form on
 * the wall over the lava one by one. Until then there's nothing of the cages to see or stand on.
 * `reset` hides the key in a new cupboard and puts everything back.
 */
function buildLavaRoom(scene, root, M) {
  const S = SQUISHY_FLOOR;
  const owned = [];
  const casters = [];
  const part = (mesh, look, parent = root) => {
    mesh.material = look;
    mesh.parent = parent;
    mesh.isPickable = false;
    owned.push(mesh);
    return mesh;
  };

  // The lava: crust plates drifting over glowing cracks, like the sea round the obby.
  const width = LAVA_POOL.x1 - LAVA_POOL.x0;
  const depth = LAVA_ROOM.z1 - LAVA_ROOM.z0;
  const glow = lavaTexture(scene, "prisonLavaGlow", 256, 4, [40, 4, 2], [255, 190, 70]);
  glow.uScale = width / 7;
  glow.vScale = depth / 7;
  const crust = lavaTexture(scene, "prisonLavaCrust", 128, 9, [70, 12, 6], [255, 90, 30]);
  crust.uScale = width / 16;
  crust.vScale = depth / 16;
  const lavaLook = new StandardMaterial("prisonLavaMat", scene);
  lavaLook.emissiveTexture = glow;
  lavaLook.diffuseTexture = crust;
  lavaLook.specularColor = new Color3(0.25, 0.12, 0.05);
  lavaLook.specularPower = 12;
  owned.push(glow, crust, lavaLook);
  const pool = part(MeshBuilder.CreateGround("prisonLava", { width, height: depth }, scene), lavaLook);
  pool.position.set((LAVA_POOL.x0 + LAVA_POOL.x1) / 2, LAVA_POOL.y, (LAVA_ROOM.z0 + LAVA_ROOM.z1) / 2);

  // Two doors on each cupboard, hinged at its outer edges, a little out from its front.
  const cupboards = CUPBOARDS.map((spec, index) => {
    const fx = Math.sin(spec.yaw);
    const fz = Math.cos(spec.yaw);
    const face = { x: spec.x + fx * 0.3, z: spec.z + fz * 0.3 };
    const doors = [-1, 1].map((hand) => {
      const hinge = new TransformNode(`prisonCupboardHinge${index}`, scene);
      hinge.parent = root;
      hinge.position.set(face.x + Math.cos(spec.yaw) * 0.7 * hand + fx * 0.12, S + 1.01, face.z - Math.sin(spec.yaw) * 0.7 * hand + fz * 0.12);
      owned.push(hinge);
      const door = part(MeshBuilder.CreateBox("prisonCupboardDoor", { width: 0.68, height: 1.9, depth: 0.05 }, scene), M.cupboardDoor, hinge);
      door.position.x = -hand * 0.34;
      const knob = part(MeshBuilder.CreateSphere("prisonCupboardKnob", { diameter: 0.07, segments: 8 }, scene), M.gold, hinge);
      knob.position.set(-hand * 0.6, 0, 0.05);
      casters.push(door);
      return { hinge, hand };
    });
    return { index, spec, face, doors, front: { x: spec.x + fx * 0.9, z: spec.z + fz * 0.9 }, opened: false, peek: 0, swing: 0 };
  });
  const pose = (cupboard) => {
    for (const { hinge, hand } of cupboard.doors) hinge.rotation.y = cupboard.spec.yaw + hand * cupboard.swing * 1.9;
  };

  // A shiny gold key, standing just inside its cupboard's doors.
  const key = new TransformNode("prisonKey", scene);
  key.parent = root;
  owned.push(key);
  const ring = part(MeshBuilder.CreateTorus("prisonKeyRing", { diameter: 0.16, thickness: 0.045, tessellation: 20 }, scene), M.gold, key);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  part(MeshBuilder.CreateBox("prisonKeyShaft", { width: 0.04, height: 0.24, depth: 0.03 }, scene), M.gold, key).position.y = -0.04;
  for (const [y, w] of [
    [-0.12, 0.08],
    [-0.06, 0.06],
  ]) {
    part(MeshBuilder.CreateBox("prisonKeyTooth", { width: w, height: 0.035, depth: 0.03 }, scene), M.gold, key).position.set(w / 2 + 0.02, y, 0);
  }

  const cap = part(MeshBuilder.CreateCylinder("prisonButton", { diameter: 0.42, height: 0.14, tessellation: 24 }, scene), M.button);
  cap.position.set(BUTTON.x, S + 1.09, BUTTON.z);

  // A gold padlock on the cap, facing the door. The key pops its shackle and it spins away.
  const lock = new TransformNode("prisonPadlock", scene);
  lock.parent = root;
  lock.position.set(BUTTON.x, S + 1.3, BUTTON.z);
  owned.push(lock);
  part(MeshBuilder.CreateBox("prisonPadlockBody", { width: 0.26, height: 0.22, depth: 0.1 }, scene), M.gold, lock);
  part(MeshBuilder.CreateBox("prisonPadlockHole", { width: 0.04, height: 0.07, depth: 0.01 }, scene), M.dark, lock).position.set(0, -0.02, 0.052);
  const shackle = part(MeshBuilder.CreateTorus("prisonPadlockShackle", { diameter: 0.16, thickness: 0.035, tessellation: 16 }, scene), M.steel, lock);
  shackle.rotation.x = Math.PI / 2;

  // Each cage hangs off the wall from its anchor, at the middle of its top against the wall: a
  // backplate, a top to stand on, corner posts, and bottom rails, with bars hanging from the top
  // on the three open sides. It forms by sliding out of the wall, then its bars drop down.
  const half = CAGE_SIZE / 2;
  const merged = (name, specs) => {
    const pieces = specs.map(([w, h, d, x, y, z]) => {
      const piece = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      piece.position.set(x, y, z);
      return piece;
    });
    return Mesh.MergeMeshes(pieces, true, true);
  };
  const barSpots = [
    ...[-0.39, -0.13, 0.13, 0.39].map((x) => [x, -(CAGE_SIZE - 0.04)]),
    ...[-0.33, -0.65, -0.97].flatMap((z) => [[-(half - 0.04), z], [half - 0.04, z]]),
  ];
  const barLength = CAGE_TALL - 0.12;
  const cages = CAGES.map(([x, top, wall], index) => {
    const anchor = new TransformNode(`prisonCage${index}`, scene);
    anchor.parent = root;
    // Local -z points out of the wall, so cages on the hanging wall are turned round to face north.
    anchor.position.set(x, top, wall > 0 ? LAVA_ROOM.z1 : BAY.z0);
    if (wall < 0) anchor.rotation.y = Math.PI;
    owned.push(anchor);
    const frame = part(
      merged("prisonCageFrame", [
        [CAGE_SIZE, 0.12, CAGE_SIZE, 0, -0.06, -half],
        [CAGE_SIZE, CAGE_TALL, 0.06, 0, -CAGE_TALL / 2, -0.03],
        ...[-1, 1].map((side) => [0.08, CAGE_TALL, 0.08, side * (half - 0.04), -CAGE_TALL / 2, -(CAGE_SIZE - 0.04)]),
        [CAGE_SIZE, 0.06, 0.06, 0, 0.03 - CAGE_TALL, -(CAGE_SIZE - 0.03)],
        ...[-1, 1].map((side) => [0.06, 0.06, CAGE_SIZE, side * (half - 0.03), 0.03 - CAGE_TALL, -half]),
      ]),
      M.steel,
      anchor,
    );
    const hang = new TransformNode(`prisonCageBars${index}`, scene);
    hang.parent = anchor;
    hang.position.y = -0.12;
    owned.push(hang);
    const bars = part(merged("prisonCageBars", barSpots.map(([bx, bz]) => [0.04, barLength, 0.04, bx, -barLength / 2, bz])), M.bars, hang);
    casters.push(frame, bars);
    anchor.setEnabled(false);
    return { anchor, hang, frame, form: 0, wait: 0, body: null };
  });
  const free = (cage) => {
    cage.body?.shape?.dispose();
    cage.body?.dispose();
    cage.body = null;
    cage.frame.metadata = null;
  };
  /** Eases 0 to 1 with a little springy overshoot at the end, like metal snapping into place. */
  const snap = (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;

  let keyIndex = 0;
  let hasKey = false;
  let unlocked = false;
  let opening = 0;
  let borrowed = 0;
  let up = false;
  let showing = 0;
  let clank = false;

  const room = {
    cupboards,
    casters,
    get keyIndex() {
      return keyIndex;
    },
    get hasKey() {
      return hasKey;
    },
    get unlocked() {
      return unlocked;
    },
    /** Opens `cupboard` for good. True when the key was in it. */
    open(cupboard) {
      cupboard.opened = true;
      if (cupboard.index !== keyIndex || hasKey) return false;
      hasKey = true;
      showing = 1.1;
      return true;
    },
    /** A bot opens cupboard `index` for a look and lets it swing shut again. */
    peek(index) {
      cupboards[index].peek = 2.5;
    },
    /** With the key: the padlock comes off and the cages form for good. */
    unlock() {
      unlocked = true;
    },
    /** A bot unlocked it: the cages form for `seconds`, then fold back into the wall. */
    borrow(seconds) {
      borrowed = Math.max(borrowed, seconds);
    },
    /** True once after each cage finishes forming, for its clank. */
    takeClank() {
      const was = clank;
      clank = false;
      return was;
    },
    reset() {
      keyIndex = Math.floor(Math.random() * cupboards.length);
      hasKey = false;
      unlocked = false;
      opening = 0;
      borrowed = 0;
      showing = 0;
      up = false;
      clank = false;
      lock.setEnabled(true);
      lock.scaling.setAll(1);
      lock.rotation.set(0, Math.PI, 0);
      shackle.position.y = 0.12;
      for (const cupboard of cupboards) {
        cupboard.opened = false;
        cupboard.peek = 0;
        cupboard.swing = 0;
        pose(cupboard);
      }
      for (const cage of cages) {
        free(cage);
        cage.form = 0;
        cage.wait = 0;
        cage.anchor.setEnabled(false);
      }
      const { face, spec } = cupboards[keyIndex];
      key.position.set(face.x + Math.sin(spec.yaw) * 0.05, S + 1.1, face.z + Math.cos(spec.yaw) * 0.05);
      key.rotation.set(0, spec.yaw, 0);
      key.setEnabled(false);
    },
    update(dt, time) {
      glow.uOffset = time * 0.02;
      glow.vOffset = Math.sin(time * 0.3) * 0.05;
      crust.uOffset = -time * 0.012;
      crust.vOffset = time * 0.01;
      glow.level = 1 + Math.sin(time * 1.3) * 0.12 + Math.sin(time * 3.1) * 0.05;
      for (const cupboard of cupboards) {
        cupboard.peek = Math.max(0, cupboard.peek - dt);
        const want = cupboard.opened || cupboard.peek > 0 ? 1 : 0;
        if (cupboard.swing === want) continue;
        cupboard.swing = want > cupboard.swing ? Math.min(1, cupboard.swing + dt * 3) : Math.max(0, cupboard.swing - dt * 2);
        pose(cupboard);
      }
      if (showing > 0) {
        showing -= dt;
        key.position.y += dt * 0.7;
        key.rotation.y += dt * 9;
      }
      key.setEnabled(showing > 0 || (!hasKey && cupboards[keyIndex].swing > 0.2));
      cap.position.y = S + (unlocked ? 1.04 : 1.09);
      const pulse = hasKey && !unlocked ? 1 + Math.abs(Math.sin(time * 5)) * 0.12 : 1;
      cap.scaling.set(pulse, 1, pulse);
      if (unlocked && opening < 1) {
        opening = Math.min(1, opening + dt / 0.8);
        shackle.position.y = 0.12 + Math.min(1, opening * 3) * 0.08;
        const away = Math.max(0, (opening - 0.4) / 0.6);
        lock.rotation.y = Math.PI + away * 9;
        lock.position.y = S + 1.3 + away * 0.4;
        lock.scaling.setAll(Math.max(0.001, 1 - away));
        lock.setEnabled(opening < 1);
      }
      borrowed = Math.max(0, borrowed - dt);
      const want = unlocked || borrowed > 0;
      if (want && !up) cages.forEach((cage, index) => (cage.wait = 0.4 + index * 0.3));
      up = want;
      for (const cage of cages) {
        if (up && cage.wait > 0) {
          cage.wait -= dt;
          continue;
        }
        const was = cage.form;
        cage.form = up ? Math.min(1, cage.form + dt / 0.7) : Math.max(0, cage.form - dt / 0.5);
        if (!up && cage.body) free(cage);
        cage.anchor.setEnabled(cage.form > 0);
        if (cage.form === was) continue;
        cage.anchor.scaling.z = Math.max(0.02, snap(Math.min(1, cage.form / 0.55)));
        cage.hang.scaling.y = Math.max(0.01, snap(Math.max(0, (cage.form - 0.45) / 0.55)));
        if (cage.form >= 1 && !cage.body) {
          clank = true;
          cage.anchor.computeWorldMatrix(true);
          cage.body = new PhysicsBody(cage.anchor, PhysicsMotionType.STATIC, false, scene);
          cage.body.shape = new PhysicsShapeBox(new Vector3(0, -CAGE_TALL / 2, -half), Quaternion.Identity(), new Vector3(CAGE_SIZE, CAGE_TALL, CAGE_SIZE), scene);
          // The camera pulls in in front of a formed cage instead of ending up inside it; hidden ones still count for picking.
          cage.frame.metadata = { blocksCamera: true };
        }
      }
    },
    dispose() {
      for (const cage of cages) free(cage);
      for (const item of owned.reverse()) item.dispose();
    },
  };
  room.reset();
  return room;
}

/**
 * The lava room's elevator, in prison space: an open cage car with barred sides that rides between
 * the top floor and the floor by the exit door. Its gates slide aside, the north one at the top
 * (onto the top floor) and the south one at the bottom (toward the door). A barrier closes the top
 * floor's edge whenever the car isn't up there, so nobody steps into the empty shaft. The car only
 * has colliders while it's parked; whoever rides it is carried (see `ride`).
 */
function buildLift(scene, root, M) {
  const width = LIFT.x1 - LIFT.x0;
  const depth = LIFT.z1 - LIFT.z0;
  const hw = width / 2;
  const hd = depth / 2;
  const top = LANDING.top;
  const bottom = SQUISHY_FLOOR;
  const owned = [];
  const casters = [];
  const merged = (name, look, parent, specs) => {
    const pieces = specs.map(([w, h, d, x, y, z]) => {
      const piece = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      piece.position.set(x, y, z);
      return piece;
    });
    const mesh = Mesh.MergeMeshes(pieces, true, true);
    mesh.name = name;
    mesh.material = look;
    mesh.parent = parent;
    mesh.isPickable = false;
    owned.push(mesh);
    casters.push(mesh);
    return mesh;
  };
  const node = (name, parent) => {
    const each = new TransformNode(name, scene);
    each.parent = parent;
    owned.push(each);
    return each;
  };

  const car = node("prisonLift", root);
  car.position.set((LIFT.x0 + LIFT.x1) / 2, top, (LIFT.z0 + LIFT.z1) / 2);
  merged("prisonLiftFrame", M.steel, car, [
    [width, 0.15, depth, 0, -0.075, 0],
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [0.1, LIFT_TALL, 0.1, sx * (hw - 0.05), LIFT_TALL / 2, sz * (hd - 0.05)])),
    ...[-1, 1].map((sz) => [width, 0.08, 0.08, 0, LIFT_TALL, sz * (hd - 0.04)]),
    ...[-1, 1].map((sx) => [0.08, 0.08, depth, sx * (hw - 0.04), LIFT_TALL, 0]),
  ]);
  const bars = [];
  for (const sx of [-1, 1]) {
    for (let i = 1; i < 7; i += 1) bars.push([0.05, LIFT_TALL, 0.05, sx * (hw - 0.04), LIFT_TALL / 2, -hd + (depth * i) / 7]);
    bars.push([0.06, 0.06, depth, sx * (hw - 0.04), 1.1, 0]);
  }
  merged("prisonLiftBars", M.bars, car, bars);
  merged("prisonLiftButtons", M.button, car, [[0.04, 0.3, 0.2, hw - 0.1, 1.2, 0]]);
  // North gate first, then south. Each slides west, out over the lava side.
  const gates = [1, -1].map((sz) => {
    const holder = node("prisonLiftGate", car);
    holder.position.z = sz * (hd - 0.1);
    const specs = [0.1, 1.1, LIFT_TALL - 0.1].map((y) => [width - 0.1, 0.06, 0.05, 0, y, 0]);
    for (let i = 1; i < 9; i += 1) specs.push([0.04, LIFT_TALL - 0.2, 0.04, -hw + (width * i) / 9, LIFT_TALL / 2, 0]);
    merged("prisonLiftGate", M.metal, holder, specs);
    return { holder, open: 0 };
  });
  const barrier = node("prisonLiftBarrier", root);
  barrier.position.set(car.position.x, top + 0.55, LANDING.z0 + 0.1);
  merged("prisonLiftBarrierBars", M.hazard, barrier, [
    [width - 0.1, 0.1, 0.08, 0, 0.45, 0],
    [width - 0.1, 0.08, 0.06, 0, 0, 0],
  ]);

  let body = null;
  const shapes = [];
  let fence = null;
  const freeBody = () => {
    body?.dispose();
    body = null;
    for (const shape of shapes) shape.dispose();
    shapes.length = 0;
  };
  /** The floor, both barred sides, and the gate that stays shut: south at the top, north at the bottom. */
  const park = () => {
    car.computeWorldMatrix(true);
    const container = new PhysicsShapeContainer(scene);
    const piece = (x, y, z, w, h, d) => {
      const shape = new PhysicsShapeBox(new Vector3(x, y, z), Quaternion.Identity(), new Vector3(w, h, d), scene);
      container.addChild(shape);
      shapes.push(shape);
    };
    piece(0, -0.075, 0, width, 0.15, depth);
    for (const sx of [-1, 1]) piece(sx * (hw - 0.04), LIFT_TALL / 2, 0, 0.08, LIFT_TALL, depth);
    piece(0, LIFT_TALL / 2, (atTop ? -1 : 1) * (hd - 0.04), width, LIFT_TALL, 0.08);
    shapes.push(container);
    body = new PhysicsBody(car, PhysicsMotionType.STATIC, false, scene);
    body.shape = container;
  };
  const setFence = (on) => {
    barrier.setEnabled(on);
    if (on && !fence) {
      barrier.computeWorldMatrix(true);
      fence = new PhysicsBody(barrier, PhysicsMotionType.STATIC, false, scene);
      fence.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(width, 1.1, 0.12), scene);
    } else if (!on && fence) {
      fence.shape?.dispose();
      fence.dispose();
      fence = null;
    }
  };
  const ease = (k) => k * k * (3 - 2 * k);
  const pose = () => {
    for (const gate of gates) gate.holder.position.x = -(width - 0.15) * ease(gate.open);
  };

  let atTop = true;
  /** "parked", "closing" its open gate, "moving", or "opening" the gate at the other floor. */
  let mode = "parked";
  let time = 0;
  let idle = 0;
  let ding = false;
  const lift = {
    casters,
    /** The car floor's height. */
    get y() {
      return car.position.y;
    },
    get parked() {
      return mode === "parked";
    },
    get atTop() {
      return atTop;
    },
    /** Seconds it has sat parked at the bottom. */
    get idle() {
      return idle;
    },
    /** True once when it reaches a floor, for the ding. */
    takeDing() {
      const was = ding;
      ding = false;
      return was;
    },
    /** Shuts the open gate and rides to the other floor. False if it's already on its way. */
    go() {
      if (mode !== "parked") return false;
      mode = "closing";
      time = 0;
      idle = 0;
      freeBody();
      setFence(true);
      return true;
    },
    /** Parked at the top with its north gate open. */
    reset() {
      freeBody();
      atTop = true;
      mode = "parked";
      time = 0;
      idle = 0;
      ding = false;
      car.position.y = top;
      gates[0].open = 1;
      gates[1].open = 0;
      pose();
      setFence(false);
      park();
    },
    update(dt) {
      if (mode === "parked") {
        if (!atTop) idle += dt;
        return;
      }
      time += dt;
      if (mode === "closing") {
        gates[atTop ? 0 : 1].open = Math.max(0, 1 - time / LIFT_GATE_SECONDS);
        if (time >= LIFT_GATE_SECONDS) {
          mode = "moving";
          time = 0;
        }
      } else if (mode === "moving") {
        const k = ease(Math.min(1, time / LIFT_SECONDS));
        car.position.y = atTop ? top + (bottom - top) * k : bottom + (top - bottom) * k;
        if (time >= LIFT_SECONDS) {
          atTop = !atTop;
          mode = "opening";
          time = 0;
          ding = true;
        }
      } else {
        gates[atTop ? 0 : 1].open = Math.min(1, time / LIFT_GATE_SECONDS);
        if (time >= LIFT_GATE_SECONDS) {
          mode = "parked";
          idle = 0;
          if (atTop) setFence(false);
          park();
        }
      }
      pose();
    },
    dispose() {
      freeBody();
      setFence(false);
      for (const item of owned.reverse()) item.dispose();
    },
  };
  lift.reset();
  return lift;
}

/**
 * A door that slides up into the wall to open: from x `from` to `to` in a wall at z `at`, or along z
 * in a wall at x `at` when `alongZ`.
 */
function buildSlideDoor(scene, root, look, from, to, floor, at, { alongZ = false } = {}) {
  const height = 2.8;
  const width = to - from;
  const mesh = MeshBuilder.CreateBox("prisonSlideDoor", { width, height, depth: 0.14 }, scene);
  mesh.material = look;
  mesh.parent = root;
  mesh.isPickable = false;
  if (alongZ) mesh.rotation.y = Math.PI / 2;
  const middle = (from + to) / 2;
  const rest = alongZ ? new Vector3(at, floor + height / 2, middle) : new Vector3(middle, floor + height / 2, at);
  mesh.position.copyFrom(rest);
  let body = null;
  let lifting = false;
  const free = () => {
    body?.shape?.dispose();
    body?.dispose();
    body = null;
  };
  return {
    mesh,
    close() {
      lifting = false;
      mesh.position.copyFrom(rest);
      if (body) return;
      mesh.computeWorldMatrix(true);
      body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
      body.shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(width, height, 0.3), scene);
    },
    open() {
      free();
      lifting = true;
    },
    update(dt) {
      if (lifting && mesh.position.y < rest.y + height - 0.1) mesh.position.y = Math.min(rest.y + height - 0.1, mesh.position.y + dt * 3.5);
    },
    dispose() {
      free();
      mesh.dispose();
    },
  };
}

/** Whether (x, z), prison space, is over the elevator car's footprint, grown by `margin`. */
function insideLift(x, z, margin = 0) {
  return x > LIFT.x0 - margin && x < LIFT.x1 + margin && z > LIFT.z0 - margin && z < LIFT.z1 + margin;
}

/**
 * Up to how high anything running along the chef chase has to be at (x, z), prison space, to clear
 * the counters, ice, and tables: an arc over each one.
 */
export function obstacleHop(x, z) {
  let lift = 0;
  for (const [x0, x1, z0, z1, height] of OBSTACLES) {
    if (x < x0 - 0.4 || x > x1 + 0.4) continue;
    const middle = (z0 + z1) / 2;
    const reach = (z1 - z0) / 2 + 1.1;
    const k = 1 - ((z - middle) / reach) ** 2;
    if (k > 0) lift = Math.max(lift, (height + 0.4) * Math.sqrt(k));
  }
  return lift;
}

/**
 * The zipline's line in prison space (see ZIP_LEGS): points every half metre or so round the turns,
 * each with how far along it is (`s`) and whether it is on a turn (`slow`). Heights fall evenly from
 * ZIP_FROM to ZIP_TO. `at(s, out)` puts the point `s` along it into `out` and returns the heading
 * there; `slowAt(s)` says whether the handle should be slowing for a turn.
 */
export function createZipPath() {
  const points = [];
  const push = (x, z, slow = false) => points.push({ x, y: 0, z, s: 0, slow });
  const arc = (cx, cz, r, from, to) => {
    const steps = Math.max(6, Math.ceil((Math.abs(to - from) * r) / 0.4));
    for (let i = 1; i <= steps; i += 1) {
      const angle = from + ((to - from) * i) / steps;
      push(cx + r * Math.cos(angle), cz + r * Math.sin(angle), true);
    }
  };
  push(ZIP_FROM.x, ZIP_FROM.z);
  ZIP_LEGS.forEach((x, index) => {
    const next = ZIP_LEGS[index + 1];
    if (next === undefined) return;
    const south = index % 2 === 0;
    const end = south ? ZIP_SOUTH : ZIP_NORTH;
    push(x, end);
    const r = (next - x) / 2;
    arc(x + r, end, r, Math.PI, south ? 2 * Math.PI : 0);
  });
  const last = ZIP_LEGS[ZIP_LEGS.length - 1];
  push(last, ZIP_TO.z - ZIP_BEND);
  arc(last + ZIP_BEND, ZIP_TO.z - ZIP_BEND, ZIP_BEND, Math.PI, Math.PI / 2);
  push(ZIP_TO.x, ZIP_TO.z);
  for (let i = 1; i < points.length; i += 1) {
    points[i].s = points[i - 1].s + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  }
  const length = points[points.length - 1].s;
  for (const point of points) point.y = ZIP_FROM.y + ((ZIP_TO.y - ZIP_FROM.y) * point.s) / length;
  const find = (s) => {
    let low = 0;
    let high = points.length - 2;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (points[mid].s <= s) low = mid;
      else high = mid - 1;
    }
    return low;
  };
  return {
    points,
    length,
    at(s, out) {
      const k = find(Math.max(0, Math.min(length, s)));
      const a = points[k];
      const b = points[k + 1];
      const f = Math.max(0, Math.min(1, (s - a.s) / Math.max(1e-6, b.s - a.s)));
      out.x = a.x + (b.x - a.x) * f;
      out.y = a.y + (b.y - a.y) * f;
      out.z = a.z + (b.z - a.z) * f;
      return Math.atan2(b.x - a.x, b.z - a.z);
    },
    slowAt(s) {
      if (s >= length) return false;
      const k = find(Math.max(0, s));
      return points[k].slow || points[k + 1].slow;
    },
    /** The middle of each half-circle turn, and which way out of it a wall lies (+1 north, -1 south). */
    get turns() {
      const middles = [];
      ZIP_LEGS.forEach((x, index) => {
        const next = ZIP_LEGS[index + 1];
        if (next === undefined) return;
        const south = index % 2 === 0;
        const r = (next - x) / 2;
        const z = (south ? ZIP_SOUTH : ZIP_NORTH) + (south ? -r : r);
        middles.push({ x: x + r, z, side: south ? -1 : 1 });
      });
      return middles;
    },
  };
}

/** The speed the handle heads for at `s` along `path`: slow round the turns, fast on the straights. */
export function zipTarget(path, s) {
  return path.slowAt(s) || path.slowAt(s + ZIP_LOOKAHEAD) ? ZIP_TURN_SPEED : ZIP_SPEED;
}

/**
 * The zipline: a cable along `createZipPath`, held by brackets from the walls, and the handle that rides
 * it. `place(s)` puts the handle `s` along the cable and returns that cable point, in prison space.
 */
function buildZipline(scene, root, add, M) {
  const path = createZipPath();
  const line = path.points.map((point) => new Vector3(point.x, point.y, point.z));
  const end = line[line.length - 1].add(new Vector3(1.2, 0, 0));
  const cable = MeshBuilder.CreateTube("prisonZipCable", { path: [...line, end], radius: 0.025, tessellation: 6 }, scene);
  add(cable, M.bars, { camera: false });
  // Thin brackets out of the walls, level with the cable, hold it at its ends and the outside of
  // each turn; nothing stands under it or behind you to get in the camera's way.
  const bracket = (x0, z0, x1, z1, y) => {
    const mesh = MeshBuilder.CreateBox("prisonZipBracket", { width: Math.max(0.08, Math.abs(x1 - x0)), height: 0.08, depth: Math.max(0.08, Math.abs(z1 - z0)) }, scene);
    mesh.position.set((x0 + x1) / 2, y + 0.06, (z0 + z1) / 2);
    add(mesh, M.trim, { camera: false });
  };
  bracket(-30, ZIP_FROM.z, ZIP_FROM.x - 0.1, ZIP_FROM.z, ZIP_FROM.y);
  for (const turn of path.turns) {
    const near = path.points.reduce((best, point) => (Math.hypot(point.x - turn.x, point.z - turn.z) < Math.hypot(best.x - turn.x, best.z - turn.z) ? point : best));
    bracket(turn.x, turn.z + turn.side * 0.1, turn.x, turn.side > 0 ? 6 : BLOCK_B.z0, near.y);
  }
  bracket(end.x, end.z, end.x, -8, end.y);

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
  const point = new Vector3();
  let heading = 0;
  const zip = {
    path,
    length: path.length,
    trolley,
    get heading() {
      return heading;
    },
    /** Puts the handle `s` along the cable and returns that cable point. */
    place(s) {
      heading = path.at(s, point);
      trolley.position.copyFrom(point);
      trolley.rotation.y = heading;
      return point;
    },
  };
  zip.place(0);
  return zip;
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
