import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  Quaternion,
  TransformNode,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";
import { buildAvatar } from "./avatar.js";
import { HARD_HAT } from "./costumes.js";
import { createBubble } from "./figure.js";
import { t } from "./i18n.js";
import { defaultLook } from "./look.js";
import { BUILDER_OUTFIT } from "./outfits.js";
import { FOOT_OFFSET } from "./player.js";
import { plainMaterial, unlitMaterial } from "./seasons.js";
import { createTowerWings } from "./towerWings.js";

const SAVE_KEY = "asmr-squishy-obby:tower";

/** Far from the course, the prison, and the coaster yard. Places sit in a row. */
const BASE_OX = 1680;
const OY = 160;
const OZ = 1680;
const SPAN = 720;

/** Wide enough for the taller tower, the front ladder, the spawn, and the shack. Not an endless floor. */
const PLAZA_W = 168;
const PLAZA_D = 160;
const PLAZA_TOP = 0.8;
/**
 * Climb height above the plaza, in meters. Was 936. Doubled again. The plaza stays the same
 * size, so the tower's feet stay put and the body, ladder, and landing stretch upward.
 */
const CROWN_TOP = 1872;
/** A small pad at the top, just big enough to stand on after the climb. */
const DECK_W = 8;
const DECK_D = 8;
const DECK_H = 0.8;
const TOWER_Z = 16;
const BASE_HALF = 50.4;
const LADDER_X = 0;
const LADDER_Z = TOWER_Z - BASE_HALF - 1.2;
const DECK_Z = (TOWER_Z + LADDER_Z) / 2;
const SHACK_X = 66;
const SHACK_Z = -46;
const SHACK_D = 3.6;
const BASE_CLIMB = 3.2;
const CRATE = 0.35;

/**
 * Bought in order. The first five stay as they were. Later pairs cost more and climb faster,
 * and each id matches a photo in public/wings/.
 */
export const WINGS = [
  { id: "sprout", cost: 40, speed: 1.5, nameKey: "wing.sprout", hintKey: "wing.sproutHint" },
  { id: "breeze", cost: 110, speed: 2, nameKey: "wing.breeze", hintKey: "wing.breezeHint" },
  { id: "cloud", cost: 260, speed: 2.7, nameKey: "wing.cloud", hintKey: "wing.cloudHint" },
  { id: "sky", cost: 560, speed: 3.6, nameKey: "wing.sky", hintKey: "wing.skyHint" },
  { id: "rainbow", cost: 1200, speed: 4.8, nameKey: "wing.rainbow", hintKey: "wing.rainbowHint" },
  { id: "crimson", cost: 2200, speed: 5.4, nameKey: "wing.crimson", hintKey: "wing.crimsonHint" },
  { id: "comet", cost: 2800, speed: 5.8, nameKey: "wing.comet", hintKey: "wing.cometHint" },
  { id: "storm", cost: 3600, speed: 6.1, nameKey: "wing.storm", hintKey: "wing.stormHint" },
  { id: "aurora", cost: 4600, speed: 6.5, nameKey: "wing.aurora", hintKey: "wing.auroraHint" },
  { id: "nova", cost: 5800, speed: 6.8, nameKey: "wing.nova", hintKey: "wing.novaHint" },
  { id: "phoenix", cost: 7400, speed: 7.2, nameKey: "wing.phoenix", hintKey: "wing.phoenixHint" },
  { id: "azure", cost: 9400, speed: 7.6, nameKey: "wing.azure", hintKey: "wing.azureHint" },
  { id: "gale", cost: 12000, speed: 7.9, nameKey: "wing.gale", hintKey: "wing.galeHint" },
  { id: "bolt", cost: 15000, speed: 8.3, nameKey: "wing.bolt", hintKey: "wing.boltHint" },
  { id: "drift", cost: 19000, speed: 8.6, nameKey: "wing.drift", hintKey: "wing.driftHint" },
  { id: "glider", cost: 24000, speed: 9, nameKey: "wing.glider", hintKey: "wing.gliderHint" },
  { id: "swift", cost: 30000, speed: 9.3, nameKey: "wing.swift", hintKey: "wing.swiftHint" },
  { id: "prism", cost: 38000, speed: 9.7, nameKey: "wing.prism", hintKey: "wing.prismHint" },
  { id: "falcon", cost: 48000, speed: 10, nameKey: "wing.falcon", hintKey: "wing.falconHint" },
  { id: "rocket", cost: 60000, speed: 10.4, nameKey: "wing.rocket", hintKey: "wing.rocketHint" },
  { id: "blaze", cost: 76000, speed: 10.8, nameKey: "wing.blaze", hintKey: "wing.blazeHint" },
  { id: "frost", cost: 96000, speed: 11.1, nameKey: "wing.frost", hintKey: "wing.frostHint" },
  { id: "solar", cost: 120000, speed: 11.5, nameKey: "wing.solar", hintKey: "wing.solarHint" },
  { id: "monarch", cost: 150000, speed: 11.8, nameKey: "wing.monarch", hintKey: "wing.monarchHint", form: "butterfly" },
  { id: "lunar", cost: 190000, speed: 12.2, nameKey: "wing.lunar", hintKey: "wing.lunarHint" },
  { id: "cosmic", cost: 240000, speed: 12.6, nameKey: "wing.cosmic", hintKey: "wing.cosmicHint" },
  { id: "velvet", cost: 300000, speed: 12.9, nameKey: "wing.velvet", hintKey: "wing.velvetHint" },
  { id: "thunder", cost: 380000, speed: 13.3, nameKey: "wing.thunder", hintKey: "wing.thunderHint" },
  { id: "eclipse", cost: 480000, speed: 13.6, nameKey: "wing.eclipse", hintKey: "wing.eclipseHint" },
  { id: "mythic", cost: 600000, speed: 14, nameKey: "wing.mythic", hintKey: "wing.mythicHint" },
];

/** Ground jump on each tower. The crown pays ten times this, before the worn wing. */
const PAY_RISE = 9;

export const PLACES = [
  { id: "eiffel", cost: 0, pay: 1000, kind: "eiffel", nameKey: "place.eiffel", hintKey: "place.eiffelHint" },
  { id: "lighthouse", cost: 1, pay: 10000, kind: "lighthouse", nameKey: "place.lighthouse", hintKey: "place.lighthouseHint" },
  { id: "ice", cost: 2, pay: 100000, kind: "ice", nameKey: "place.ice", hintKey: "place.iceHint" },
  { id: "volcano", cost: 3, pay: 1000000, kind: "volcano", nameKey: "place.volcano", hintKey: "place.volcanoHint" },
];

const held = new Set();
const climbKey = (event) => {
  const key = event.key?.toLowerCase?.();
  if (event.code === "KeyW" || event.code === "ArrowUp" || key === "w") return "up";
  if (event.code === "KeyS" || event.code === "ArrowDown" || key === "s") return "down";
  return null;
};
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const action = climbKey(event);
  if (action) held.add(action);
});
window.addEventListener("keyup", (event) => {
  const action = climbKey(event);
  if (action) held.delete(action);
});
window.addEventListener("blur", () => held.clear());

/**
 * Tower climb. The Eiffel Tower is free. Other places cost wins. Jump off the ladder to earn
 * tower coins (not the coins from the other games) and spend them on wings at the shack.
 * A jump on the Eiffel Tower starts near 1,000 and each later tower starts ten times higher.
 * The same jump pays more the farther up the ladder you are. The top of a climb is 1 win.
 * Saved in this browser.
 */
export function createTower(scene, graphics) {
  const saved = loadSave();
  let tier = saved.tier;
  let worn = saved.worn;
  let wins = saved.wins;
  let purse = saved.coins;
  let placeId = saved.place;
  const owned = new Set(saved.owned);
  let active = false;
  let climbing = false;
  let climbY = OY + PLAZA_TOP;
  let grabLock = 0;
  let claimedTop = false;
  let autoClimb = false;
  let action = null;
  const pending = [];

  const mats = {
    plaza: plainMaterial(scene, "tower-plaza", "#5cba84", 0),
    iron: plainMaterial(scene, "tower-iron", "#6e4e34", 0.08),
    ironLite: plainMaterial(scene, "tower-iron-lite", "#a67c52", 0.1),
    deck: plainMaterial(scene, "tower-deck", "#8d6848", 0.06),
    gold: plainMaterial(scene, "tower-gold", "#f0b429", 0.22),
    rail: plainMaterial(scene, "tower-rail", "#a86b38", 0),
    wood: plainMaterial(scene, "tower-wood", "#d39a5c", 0),
    plank: plainMaterial(scene, "tower-plank", "#b5783e", 0),
    roof: plainMaterial(scene, "tower-roof", "#e23b78", 0),
    door: plainMaterial(scene, "tower-door", "#7a4e2d", 0),
    red: plainMaterial(scene, "tower-red", "#e23b4a", 0.08),
    cream: plainMaterial(scene, "tower-cream", "#fff6ea", 0.1),
    ice: plainMaterial(scene, "tower-ice", "#b9e7ff", 0.16),
    iceDeep: plainMaterial(scene, "tower-ice-deep", "#7ec8ee", 0.12),
    rock: plainMaterial(scene, "tower-rock", "#4a342c", 0.05),
    lava: plainMaterial(scene, "tower-lava", "#ff6a2a", 0.55),
    lantern: plainMaterial(scene, "tower-lantern", "#ffe38a", 0.35),
  };
  for (const material of Object.values(mats)) material.fogEnabled = false;

  const wingRoot = new TransformNode("tower-wings", scene);
  wingRoot.setEnabled(false);
  const wings = createTowerWings(scene, wingRoot);
  paintWings();

  const rung = MeshBuilder.CreateBox("tower-rung", { width: 1.35, height: 0.1, depth: 0.16 }, scene);
  rung.material = mats.gold;
  rung.isVisible = false;
  rung.isPickable = false;
  rung.position.set(BASE_OX, OY + PLAZA_TOP, OZ);

  PLACES.forEach((spec, index) => buildPlace(scene, mats, rung, spec, originOf(index)));

  const keeper = buildKeeper(scene, graphics);

  function paintWings() {
    wings.wear(worn > 0 ? WINGS[worn - 1] : null, (worn - 1) / (WINGS.length - 1));
  }

  function here() {
    return PLACES.find((spec) => spec.id === placeId) ?? PLACES[0];
  }

  function origin() {
    return originOf(Math.max(0, PLACES.findIndex((spec) => spec.id === here().id)));
  }

  function quote(feetY) {
    const height = Math.max(0, feetY - (origin().y + PLAZA_TOP));
    const span = CROWN_TOP - PLAZA_TOP;
    const climb = 1 + (PAY_RISE * height) / span;
    const wing = 1 + worn * 0.45;
    return Math.max(1, Math.round(here().pay * climb * wing));
  }

  function climbed(feetY) {
    return Math.max(0, feetY - (origin().y + PLAZA_TOP));
  }

  function climbProgress(feetY) {
    const span = CROWN_TOP - PLAZA_TOP;
    return Math.max(0, Math.min(1, climbed(feetY) / span));
  }

  function climbSpeed() {
    return BASE_CLIMB * (worn > 0 ? WINGS[worn - 1].speed : 1);
  }

  function carryPose(feetY) {
    const o = origin();
    return {
      position: new Vector3(o.x + LADDER_X, feetY + FOOT_OFFSET, o.z + LADDER_Z),
      heading: 0,
    };
  }

  function nearLadder(foot) {
    const o = origin();
    const dx = Math.abs(foot.x - (o.x + LADDER_X));
    const dz = Math.abs(foot.z - (o.z + LADDER_Z));
    const y = foot.y - o.y;
    return dx < 1.25 && dz < 1.2 && y > PLAZA_TOP - 0.2 && y < CROWN_TOP + 0.8;
  }

  function nearShop(foot) {
    const o = origin();
    const doorX = o.x + SHACK_X;
    const doorZ = o.z + SHACK_Z - SHACK_D / 2 - 0.7;
    const dx = foot.x - doorX;
    const dz = foot.z - doorZ;
    return dx * dx + dz * dz < 2.6 * 2.6 && Math.abs(foot.y - (o.y + PLAZA_TOP)) < 2.4;
  }

  function ride(dt, { stickY = 0, jump = false, hold = false, auto = false } = {}) {
    grabLock = Math.max(0, grabLock - dt);
    if (!active || !climbing) return null;
    if (hold) return { carry: carryPose(climbY) };
    let axis = 0;
    if (held.has("up")) axis += 1;
    if (held.has("down")) axis -= 1;
    const stick = Math.abs(stickY) > 0.22 ? stickY : 0;
    axis = Math.max(-1, Math.min(1, axis - stick));
    if (auto) axis = 1;
    climbY += axis * climbSpeed() * dt;
    const o = origin();
    const top = o.y + CROWN_TOP;
    const bottom = o.y + PLAZA_TOP;
    if (jump && climbY < top - 0.55) {
      autoClimb = false;
      const amount = quote(climbY);
      purse += amount;
      save();
      climbing = false;
      grabLock = 0.9;
      pending.push({ type: "paid", amount, position: new Vector3(o.x + LADDER_X, climbY, o.z + LADDER_Z) });
      return {
        drop: {
          position: new Vector3(o.x + LADDER_X, climbY + FOOT_OFFSET, o.z + LADDER_Z - 1.45),
          heading: 0,
        },
      };
    }
    if (climbY >= top - 0.2) {
      climbing = false;
      autoClimb = false;
      grabLock = 0.45;
      if (!claimedTop) {
        claimedTop = true;
        wins += 1;
        save();
        pending.push({ type: "win", wins });
      }
      return {
        drop: {
          position: new Vector3(o.x, o.y + CROWN_TOP + FOOT_OFFSET + 0.08, o.z + DECK_Z),
          heading: 0,
        },
      };
    }
    if (climbY <= bottom + 0.12 && axis < -0.2) {
      climbing = false;
      grabLock = 0.35;
      return {
        drop: {
          position: new Vector3(o.x + LADDER_X, bottom + FOOT_OFFSET + 0.08, o.z + LADDER_Z - 1.45),
          heading: 0,
        },
      };
    }
    climbY = Math.max(bottom, Math.min(top, climbY));
    return { carry: carryPose(climbY) };
  }

  function scan(foot, facing, time, hold) {
    const events = pending.splice(0, pending.length);
    if (!active || !foot) {
      action = null;
      wingRoot.setEnabled(false);
      keeper.show(false);
      return events;
    }
    const o = origin();
    if (foot.y < o.y + CROWN_TOP - 144) claimedTop = false;
    if (!climbing && !hold && grabLock <= 0 && nearLadder(foot)) {
      climbing = true;
      climbY = Math.max(o.y + PLAZA_TOP, Math.min(o.y + CROWN_TOP - 0.3, foot.y));
    }
    action = !climbing && nearShop(foot) ? "wings" : null;
    if (worn > 0) {
      wingRoot.setEnabled(true);
      wingRoot.position.set(foot.x, foot.y + 1.16, foot.z);
      wingRoot.rotation.y = facing;
      wings.update(time, climbing);
    } else wingRoot.setEnabled(false);
    keeper.show(true);
    keeper.update(dtFrom(time), foot, time, o, action === "wings");
    return events;
  }

  let lastKeeperTime = 0;
  function dtFrom(time) {
    const dt = lastKeeperTime ? Math.min(0.05, Math.max(0, time - lastKeeperTime)) : 0;
    lastKeeperTime = time;
    return dt;
  }

  function startSpot() {
    const o = origin();
    return {
      position: new Vector3(o.x, o.y + PLAZA_TOP + FOOT_OFFSET + 0.08, o.z - 52),
      heading: 0,
    };
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        tier,
        worn,
        wins,
        coins: purse,
        owned: [...owned],
        place: placeId,
      }));
    } catch {
      // Private mode: the tower wallet just won't persist.
    }
  }

  return {
    get active() {
      return active;
    },
    get climbing() {
      return climbing;
    },
    get autoClimb() {
      return autoClimb;
    },
    setAutoClimb(on) {
      autoClimb = Boolean(on);
    },
    get action() {
      return action;
    },
    get wins() {
      return wins;
    },
    get tier() {
      return tier;
    },
    /** 0 means no wings on. 1 is the first pair. Never higher than the pairs you have bought. */
    get worn() {
      return worn;
    },
    get coins() {
      return purse;
    },
    get placeId() {
      return placeId;
    },
    owns(id) {
      return owned.has(id);
    },
    get fallY() {
      return OY - 4;
    },
    quote,
    climbed,
    climbProgress,
    ride,
    scan,
    spawn() {
      climbing = false;
      grabLock = 0.5;
      return startSpot();
    },
    enter() {
      active = true;
      claimedTop = false;
      autoClimb = false;
      return this.spawn();
    },
    leave() {
      active = false;
      climbing = false;
      autoClimb = false;
      action = null;
      grabLock = 0;
      wingRoot.setEnabled(false);
      keeper.show(false);
    },
    /**
     * Buys the next pair, which is `index` in WINGS. Spends tower coins only.
     * Returns "ok", "owned", "skip", "broke", or "max".
     */
    buy(index) {
      if (index < tier) return "owned";
      if (index !== tier) return index >= WINGS.length ? "max" : "skip";
      const wing = WINGS[index];
      if (!wing) return "max";
      if (purse < wing.cost) return "broke";
      purse -= wing.cost;
      tier += 1;
      paintWings();
      save();
      return "ok";
    },
    /**
     * Wears a pair you already own. `index` is the pair in WINGS.
     * Returns "ok", "same", or "locked".
     */
    equip(index) {
      if (!Number.isInteger(index) || index < 0 || index >= tier) return "locked";
      if (worn === index + 1) return "same";
      worn = index + 1;
      paintWings();
      save();
      return "ok";
    },
    /** Spends wins, never coins. Returns "ok", "owned", "broke", or "bad". */
    buyPlace(id) {
      const spec = PLACES.find((item) => item.id === id);
      if (!spec) return "bad";
      if (owned.has(id)) return "owned";
      if (wins < spec.cost) return "broke";
      wins -= spec.cost;
      owned.add(id);
      save();
      return "ok";
    },
    /** Moves to an owned place and returns the spawn, or null if it is locked. */
    travel(id) {
      if (!owned.has(id)) return null;
      placeId = id;
      climbing = false;
      claimedTop = false;
      grabLock = 0.4;
      save();
      return startSpot();
    },
  };
}

/** Places list. You can visit a place only after you own it. */
export function bindTowerPlaces(tower, { onTravel, onToast }) {
  const picker = document.querySelector("#tower-place-picker");
  const list = document.querySelector("#tower-place-list");
  const openBtn = document.querySelector("#tower-place-open");
  if (!picker || !list || !openBtn) return { close() {} };

  const render = () => {
    list.replaceChildren();
    for (const spec of PLACES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tower-place-option";
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = t(spec.nameKey);
      const hint = document.createElement("small");
      const owned = tower.owns(spec.id);
      const here = tower.placeId === spec.id;
      if (here) hint.textContent = t("tower.placeHere");
      else if (spec.cost <= 0) hint.textContent = t("tower.placeFree");
      else hint.textContent = t("tower.placeCost").replace("{n}", String(spec.cost));
      copy.append(name, hint);
      const go = document.createElement("b");
      if (here) go.textContent = t("tower.placeHere");
      else if (owned) go.textContent = t("tower.placeGo");
      else go.textContent = t("tower.placeBuy");
      button.append(copy, go);
      button.addEventListener("click", () => {
        if (!owned) {
          const result = tower.buyPlace(spec.id);
          if (result === "broke") {
            onToast?.(t("tower.placeNeed").replace("{n}", String(spec.cost)));
          } else if (result === "ok") {
            onToast?.(t("toast.towerPlace").replace("{name}", t(spec.nameKey)));
          }
          render();
          return;
        }
        if (here) return;
        const spot = tower.travel(spec.id);
        if (!spot) return;
        onTravel?.(spot);
        onToast?.(t("toast.towerTravel").replace("{name}", t(spec.nameKey)));
        picker.hidden = true;
        openBtn.setAttribute("aria-expanded", "false");
      });
      list.append(button);
    }
  };

  openBtn.addEventListener("click", () => {
    openBtn.blur();
    const show = picker.hidden;
    picker.hidden = !show;
    openBtn.setAttribute("aria-expanded", String(show));
    if (show) {
      document.querySelector("#tower-sky-picker")?.setAttribute("hidden", "");
      document.querySelector("#tower-sky-open")?.setAttribute("aria-expanded", "false");
      const sky = document.querySelector("#tower-sky-picker");
      if (sky) sky.hidden = true;
      render();
    }
  });

  return {
    close() {
      picker.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
    },
  };
}

/** The Wings shack dialog. Buying is in order, and each pair costs more tower coins. */
export function bindTowerShop(tower, { blip, onDone }) {
  const root = document.querySelector("#tower-shop");
  const list = document.querySelector("#tower-wings");
  const coinsEl = document.querySelector("#tower-coins");
  const status = document.querySelector("#tower-shop-status");
  let open = false;

  const render = () => {
    coinsEl.textContent = tower.coins.toLocaleString("en-US");
    list.replaceChildren();
    WINGS.forEach((wing, index) => {
      const card = document.createElement("article");
      card.className = "shop-item";
      const ownedPair = index < tower.tier;
      const wearing = ownedPair && index + 1 === tower.worn;
      if (ownedPair) card.classList.add("is-owned");
      if (wearing) card.classList.add("is-worn");
      const photo = document.createElement("img");
      photo.className = "tower-wing-photo";
      photo.src = `/wings/${wing.id}.png`;
      photo.alt = t(wing.nameKey);
      const name = document.createElement("strong");
      name.textContent = t(wing.nameKey);
      const hint = document.createElement("small");
      hint.textContent = t(wing.hintKey);
      const price = document.createElement("span");
      price.className = "reward-badge";
      const glyph = document.createElement("span");
      glyph.className = "coin-glyph";
      glyph.setAttribute("aria-hidden", "true");
      price.append(glyph, document.createTextNode(` ${wing.cost.toLocaleString("en-US")}`));
      const button = document.createElement("button");
      button.type = "button";
      if (wearing) {
        button.textContent = t("tower.wearing");
        button.disabled = true;
      } else if (ownedPair) {
        button.textContent = t("tower.wear");
        button.classList.add("is-use");
      } else if (index === tower.tier) {
        button.textContent = t("shop.buy");
        if (tower.coins < wing.cost) button.classList.add("is-short");
      } else {
        button.textContent = t("shop.buy");
        button.classList.add("is-short");
      }
      button.addEventListener("click", () => {
        if (ownedPair) {
          const equipped = tower.equip(index);
          if (equipped === "ok") {
            blip?.("ding");
            onDone?.(t("toast.towerWear").replace("{name}", t(wing.nameKey)));
          }
          render();
          return;
        }
        const result = tower.buy(index);
        if (result === "ok") {
          blip?.("ding");
          onDone?.(t("toast.towerWings").replace("{name}", t(wing.nameKey)));
        } else if (result === "broke") onDone?.(t("tower.broke"));
        else if (result === "skip") onDone?.(t("tower.needPrevious"));
        render();
      });
      card.append(photo, name, hint, price, button);
      list.append(card);
    });
    status.textContent = tower.tier >= WINGS.length ? t("tower.maxed") : "";
  };

  const close = () => {
    open = false;
    root.hidden = true;
  };
  const show = () => {
    if (!tower.active) return;
    open = true;
    root.hidden = false;
    render();
    document.querySelector("#tower-shop-close").focus();
  };

  document.querySelector("#tower-shop-close").addEventListener("click", close);
  document.querySelector("#tower-shop-backdrop").addEventListener("click", close);
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Escape" || root.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  });

  return {
    get open() {
      return open;
    },
    show,
    close,
  };
}

function originOf(index) {
  return { x: BASE_OX + index * SPAN, y: OY, z: OZ };
}

function buildPlace(scene, mats, rung, spec, origin) {
  box(scene, mats.plaza, PLAZA_W, PLAZA_TOP, PLAZA_D, origin, 0, PLAZA_TOP / 2, 0, true);
  const deckMat = spec.kind === "ice" ? mats.ice : spec.kind === "volcano" ? mats.rock : spec.kind === "lighthouse" ? mats.cream : mats.deck;
  box(scene, deckMat, DECK_W, DECK_H, DECK_D, origin, 0, CROWN_TOP - DECK_H / 2, DECK_Z, true);
  box(scene, mats.gold, 2.4, 0.06, 2.4, origin, 0, CROWN_TOP + 0.04, DECK_Z, false);
  if (spec.kind === "eiffel") buildEiffel(scene, mats, origin);
  else if (spec.kind === "lighthouse") buildLighthouse(scene, mats, origin);
  else if (spec.kind === "ice") buildIce(scene, mats, origin);
  else buildVolcano(scene, mats, origin);
  addLadder(scene, mats, rung, origin);
  buildShack(scene, mats, origin, spec.id);
  sign(scene, `tower-win-${spec.id}`, t("tower.winSign"), origin, 0, CROWN_TOP - 1.6, DECK_Z - DECK_D / 2 - 0.05, Math.PI, 2.6, 0.7, "#ffd23f", "#5a3b16");
}

function buildEiffel(scene, mats, origin) {
  const y0 = PLAZA_TOP;
  const y1 = CROWN_TOP - 26.4;
  const top = 16.2;
  const base = BASE_HALF;
  const cz = TOWER_Z;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) {
    beam(scene, mats.iron, origin, sx * base, y0, cz + sz * base, sx * top, y1, cz + sz * top, 5.04);
  }
  for (let i = 1; i <= 6; i += 1) {
    const t = i / 7;
    const y = y0 + (y1 - y0) * t;
    const half = base + (top - base) * t;
    const pts = corners.map(([sx, sz]) => [sx * half, cz + sz * half]);
    for (let k = 0; k < 4; k += 1) {
      const a = pts[k];
      const b = pts[(k + 1) % 4];
      beam(scene, mats.ironLite, origin, a[0], y, a[1], b[0], y, b[1], 2.64);
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const t0 = i / 5;
    const t1 = (i + 1) / 5;
    const yA = y0 + (y1 - y0) * t0;
    const yB = y0 + (y1 - y0) * t1;
    const hA = base + (top - base) * t0;
    const hB = base + (top - base) * t1;
    const faces = [
      [-1, -1, 1, -1],
      [1, -1, 1, 1],
      [1, 1, -1, 1],
      [-1, 1, -1, -1],
    ];
    for (const [ax, az, bx, bz] of faces) {
      beam(scene, mats.iron, origin, ax * hA, yA, cz + az * hA, bx * hB, yB, cz + bz * hB, 1.92);
      beam(scene, mats.iron, origin, bx * hA, yA, cz + bz * hA, ax * hB, yB, cz + az * hB, 1.92);
    }
  }
  const archY = y0 + (y1 - y0) * 0.22;
  beam(scene, mats.iron, origin, -base * 0.86, y0 + 4.8, cz - base * 0.9, 0, archY, cz - base * 0.2, 4.56);
  beam(scene, mats.iron, origin, base * 0.86, y0 + 4.8, cz - base * 0.9, 0, archY, cz - base * 0.2, 4.56);
  beam(scene, mats.ironLite, origin, 0, CROWN_TOP, TOWER_Z, 0, CROWN_TOP + 78, TOWER_Z, 2.64);
}

function buildLighthouse(scene, mats, origin) {
  const bands = 9;
  const y0 = PLAZA_TOP;
  const y1 = CROWN_TOP - 36;
  for (let i = 0; i < bands; i += 1) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const h = (y1 - y0) / bands;
    const mesh = MeshBuilder.CreateCylinder(`tower-band-${i}`, {
      height: h * 0.98,
      diameterTop: (19.8 + (9 - 19.8) * t1) * 2,
      diameterBottom: (19.8 + (9 - 19.8) * t0) * 2,
      tessellation: 16,
    }, scene);
    mesh.position.set(origin.x, origin.y + y0 + h * (i + 0.5), origin.z + TOWER_Z);
    mesh.material = i % 2 === 0 ? mats.red : mats.cream;
    mesh.isPickable = false;
  }
  const lamp = MeshBuilder.CreateCylinder("tower-lamp", { height: 26.4, diameter: 14.4, tessellation: 12 }, scene);
  lamp.position.set(origin.x, origin.y + CROWN_TOP - 15.6, origin.z + TOWER_Z);
  lamp.material = mats.lantern;
  lamp.isPickable = false;
}

function buildIce(scene, mats, origin) {
  const steps = 6;
  const y0 = PLAZA_TOP;
  const y1 = CROWN_TOP - 1.5;
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const size = 43.2 + (10.8 - 43.2) * t;
    const h = (y1 - y0) / steps;
    box(scene, i % 2 ? mats.iceDeep : mats.ice, size, h * 0.92, size, origin, 0, y0 + h * (i + 0.5), TOWER_Z, false);
  }
  for (const side of [-1, 1]) {
    beam(scene, mats.ice, origin, side * 13.2, CROWN_TOP - 12, TOWER_Z, side * 2.4, CROWN_TOP + 50.4, TOWER_Z, 3.36);
  }
}

function buildVolcano(scene, mats, origin) {
  const steps = 6;
  const y0 = PLAZA_TOP;
  const y1 = CROWN_TOP - 1.2;
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const h = (y1 - y0) / steps;
    const mesh = MeshBuilder.CreateCylinder(`tower-cone-${i}`, {
      height: h * 0.98,
      diameterBottom: (51.6 + (13.2 - 51.6) * t0) * 2,
      diameterTop: (51.6 + (13.2 - 51.6) * t1) * 2,
      tessellation: 14,
    }, scene);
    mesh.position.set(origin.x, origin.y + y0 + h * (i + 0.5), origin.z + TOWER_Z);
    mesh.material = i % 2 === 0 ? mats.rock : mats.lava;
    mesh.isPickable = false;
  }
}

function addLadder(scene, mats, rung, origin) {
  const railH = CROWN_TOP - PLAZA_TOP - 0.3;
  box(scene, mats.rail, 0.22, railH, 0.22, origin, LADDER_X - 0.62, PLAZA_TOP + railH / 2 + 0.15, LADDER_Z, false);
  box(scene, mats.rail, 0.22, railH, 0.22, origin, LADDER_X + 0.62, PLAZA_TOP + railH / 2 + 0.15, LADDER_Z, false);
  for (let y = PLAZA_TOP + 1.2; y < CROWN_TOP - 0.4; y += 1.2) {
    const step = rung.createInstance("tower-rung");
    step.position.set(origin.x + LADDER_X, origin.y + y, origin.z + LADDER_Z);
    step.isPickable = false;
  }
}

function buildShack(scene, mats, origin, id) {
  const x = SHACK_X;
  const z = SHACK_Z;
  const w = 4.6;
  const d = SHACK_D;
  const h = 3.15;
  const floorY = PLAZA_TOP;
  box(scene, mats.plank, w, 0.16, d, origin, x, floorY + 0.08, z, false);
  box(scene, mats.wood, 0.18, h, d, origin, x - w / 2, floorY + h / 2, z, true);
  box(scene, mats.wood, 0.18, h, d, origin, x + w / 2, floorY + h / 2, z, true);
  box(scene, mats.wood, w, h, 0.18, origin, x, floorY + h / 2, z + d / 2, true);
  const door = 1.45;
  const side = (w - door) / 2;
  box(scene, mats.wood, side, h, 0.18, origin, x - (door + side) / 2, floorY + h / 2, z - d / 2, true);
  box(scene, mats.wood, side, h, 0.18, origin, x + (door + side) / 2, floorY + h / 2, z - d / 2, true);
  box(scene, mats.wood, door, h - 2.05, 0.18, origin, x, floorY + 2.05 + (h - 2.05) / 2, z - d / 2, true);
  box(scene, mats.door, door - 0.18, 2.02, 0.1, origin, x, floorY + 1.02, z - d / 2 + 0.02, false);
  box(scene, mats.roof, w + 0.7, 0.28, d + 0.7, origin, x, floorY + h + 0.16, z, true);
  box(scene, mats.roof, w * 0.55, 0.55, d * 0.55, origin, x, floorY + h + 0.55, z, false);
  sign(scene, `tower-wings-${id}`, t("tower.shackSign"), origin, x, floorY + 2.15, z - d / 2 - 0.28, Math.PI, 2.4, 0.7, "#fff6ea", "#e23b78");
  sign(scene, `tower-wings-side-${id}`, t("tower.shackSign"), origin, x - w / 2 - 0.24, floorY + 1.85, z, -Math.PI / 2, 3.1, 0.85, "#fff6ea", "#e23b78");
}

function buildKeeper(scene, graphics) {
  const avatar = buildAvatar(scene);
  avatar.apply({
    ...defaultLook(),
    body: "boy",
    age: "adult",
    hair: "short",
    hairColor: "#8a5a3b",
    skinColor: "#d29a6c",
    face: "dumpling",
    outfit: BUILDER_OUTFIT.id,
    costume: HARD_HAT.id,
  });
  const tool = wrench(scene);
  avatar.holdLeft(tool.root);
  const crateMat = plainMaterial(scene, "tower-keeper-crate", "#c9844a", 0.06);
  crateMat.fogEnabled = false;
  const crate = MeshBuilder.CreateBox("tower-keeper-crate", { width: 0.8, height: CRATE, depth: 0.55 }, scene);
  crate.material = crateMat;
  crate.isPickable = false;
  const lifted = new Set();
  for (const mesh of avatar.root.getChildMeshes()) {
    mesh.isPickable = false;
    const material = mesh.material;
    if (!material || lifted.has(material) || mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) continue;
    lifted.add(material);
    if (material.emissiveColor?.equals(Color3.Black())) {
      material.emissiveColor = material.diffuseTexture ? new Color3(0.16, 0.16, 0.16) : material.diffuseColor.scale(0.16);
    }
  }
  if (graphics?.shadow) {
    for (const mesh of [...avatar.parts, tool.mesh, crate]) graphics.shadow.addShadowCaster(mesh, true);
  }
  const bubble = graphics ? createBubble(scene, graphics) : null;
  let shown = false;
  let facing = Math.PI;
  let greeted = -Infinity;
  let next = 0;
  const hellos = [t("keeper.wingsHello1"), t("keeper.wingsHello2"), t("keeper.wingsHello3")];
  avatar.root.setEnabled(false);
  crate.setEnabled(false);

  return {
    show(on) {
      if (on === shown) return;
      shown = on;
      avatar.root.setEnabled(on);
      crate.setEnabled(on);
      bubble?.setShown(on);
    },
    update(dt, foot, time, origin, atDoor) {
      const x = origin.x + SHACK_X;
      const z = origin.z + SHACK_Z + 0.35;
      const y = origin.y + PLAZA_TOP + CRATE;
      crate.position.set(x, origin.y + PLAZA_TOP + CRATE / 2, z);
      if (atDoor && time - greeted > 8) {
        greeted = time;
        avatar.dance("wave");
        bubble?.say(hellos[next % hellos.length]);
        next += 1;
      }
      const dx = foot.x - x;
      const dz = foot.z - z;
      const toward = Math.atan2(dx, dz);
      const watching = dz < 0.4 && dx * dx + dz * dz < 11 * 11;
      let delta = toward - Math.PI;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      const want = watching ? Math.PI + Math.max(-0.85, Math.min(0.85, delta)) : Math.PI + Math.sin(time * 0.6) * 0.2;
      facing += (want - facing) * Math.min(1, dt * 4);
      avatar.update(dt, {
        x,
        y: y + Math.sin(time * 2) * 0.012,
        z,
        facing,
        faceAngle: watching ? toward : facing,
        moving: false,
        airborne: false,
        time,
      });
      bubble?.update(dt, x, origin.y + PLAZA_TOP + 2.7, z - 1.3);
    },
  };
}

function wrench(scene) {
  const steel = plainMaterial(scene, "tower-wrench-steel", "#c9d3df", 0.1);
  const pink = plainMaterial(scene, "tower-wrench-pink", "#ff4d8d", 0.14);
  steel.fogEnabled = false;
  pink.fogEnabled = false;
  const parts = [];
  const add = (w, h, d, x, y, material) => {
    const mesh = MeshBuilder.CreateBox("tower-wrench", { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, 0);
    mesh.material = material;
    parts.push(mesh);
  };
  add(0.045, 0.32, 0.026, 0, 0.09, steel);
  add(0.058, 0.13, 0.036, 0, 0, pink);
  add(0.13, 0.05, 0.03, 0, 0.27, steel);
  for (const side of [-1, 1]) add(0.036, 0.075, 0.03, side * 0.047, 0.325, steel);
  const root = new TransformNode("tower-wrench", scene);
  root.rotation.x = Math.PI / 2;
  root.scaling.setAll(1.35);
  const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  mesh.name = "tower-wrench";
  mesh.parent = root;
  mesh.isPickable = false;
  return { root, mesh };
}

function beam(scene, material, origin, ax, ay, az, bx, by, bz, thick) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const mesh = MeshBuilder.CreateBox("tower-beam", { width: thick, height: len, depth: thick }, scene);
  mesh.position.set(origin.x + (ax + bx) / 2, origin.y + (ay + by) / 2, origin.z + (az + bz) / 2);
  const quat = new Quaternion();
  Quaternion.FromUnitVectorsToRef(Vector3.Up(), new Vector3(dx / len, dy / len, dz / len), quat);
  mesh.rotationQuaternion = quat;
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function box(scene, material, width, height, depth, origin, x, y, z, solid) {
  const mesh = MeshBuilder.CreateBox("tower-box", { width, height, depth }, scene);
  mesh.position.set(origin.x + x, origin.y + y, origin.z + z);
  mesh.material = material;
  mesh.isPickable = false;
  if (solid) {
    const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(width, height, depth), scene);
    shape.material = { friction: 0.9, restitution: 0 };
    const body = new PhysicsBody(mesh, PhysicsMotionType.STATIC, false, scene);
    body.shape = shape;
    body.setMassProperties({ mass: 0 });
    body.disablePreStep = true;
  }
  return mesh;
}

function sign(scene, name, text, origin, x, y, z, yaw, width, height, background, ink) {
  const texture = new DynamicTexture(`${name}-tex`, { width: 512, height: 256 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 16;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 112;
  do {
    ctx.font = `900 ${size}px Arial Black, Arial, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > 450 && size > 36);
  ctx.fillText(text, 256, 132);
  texture.update();
  const material = unlitMaterial(scene, `${name}-mat`, texture, { alpha: false });
  material.backFaceCulling = true;
  material.fogEnabled = false;
  for (const flip of [0, Math.PI]) {
    const board = MeshBuilder.CreatePlane(`${name}-board`, { width, height }, scene);
    board.material = material;
    board.position.set(origin.x + x, origin.y + y, origin.z + z);
    board.rotation.y = yaw + flip;
    board.isPickable = false;
  }
}

function loadSave() {
  const fallback = { tier: 0, worn: 0, wins: 0, coins: 0, owned: ["eiffel"], place: "eiffel" };
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    const tier = Number.isInteger(data?.tier) ? Math.max(0, Math.min(WINGS.length, data.tier)) : 0;
    const worn = Number.isInteger(data?.worn) ? Math.max(0, Math.min(tier, data.worn)) : tier;
    const wins = Number.isInteger(data?.wins) && data.wins > 0 ? data.wins : 0;
    const coins = Number.isFinite(data?.coins) && data.coins > 0 ? Math.floor(data.coins) : 0;
    const known = new Set(PLACES.map((spec) => spec.id));
    const owned = Array.isArray(data?.owned) ? data.owned.filter((id) => known.has(id)) : ["eiffel"];
    if (!owned.includes("eiffel")) owned.unshift("eiffel");
    const place = known.has(data?.place) && owned.includes(data.place) ? data.place : "eiffel";
    return { tier, worn, wins, coins, owned, place };
  } catch {
    return fallback;
  }
}
