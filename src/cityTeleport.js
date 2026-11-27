import { t } from "./i18n.js";

/** Lane middles sit this far either side of a road's center line, like the traffic's. */
const LANE = 3.4;
/** How much room you need to stand: a bit wider than the player, so you never touch a wall. */
const FOOT_R = 0.75;
/** How far from a spot (meters) the search for open ground will go. */
const SEARCH = 90;
const STEP = 0.75;
/** A click this many pixels outside a badge still counts as clicking it. */
const SLOP = 6;
/** Open ground within this far of a named place is "near" it in the toast. */
const NEAR = 45;
const FADE_IN_MS = 200;
const HOLD_MS = 120;
const FADE_OUT_MS = 360;
const PIN = "#ff5fa2";
const TEXT_FONT = '"Trebuchet MS", "Segoe UI", sans-serif';

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Teleporting from the City map. Click or tap the big map: a named place takes you to its front
 * door, a road puts you on the road, and anywhere else snaps to the nearest open ground outside
 * walls and water. Driving, the car comes too and lands in a lane facing along the road.
 * Also wires the Map button in the city HUD. `onSpot(spot)` moves the player.
 */
export function bindCityTeleport(city, map, { onSpot, onToast, blip }) {
  const button = document.querySelector("#city-map-open");
  const veil = document.createElement("div");
  veil.className = "city-warp";
  veil.setAttribute("aria-hidden", "true");
  document.body.append(veil);
  let busy = false;
  let hover = null;

  button?.addEventListener("click", (event) => {
    event.currentTarget.blur();
    if (!city.active || city.away || busy) return;
    if (map.big) map.close();
    else map.open();
  });

  map.setPicker({
    hint: (touch) => (touch ? t("cityMap.hintTeleportTap") : t("cityMap.hintTeleportClick")),
    hover(point) {
      if (busy) return;
      hover = point && city.active ? plan(point) : null;
    },
    pick(point) {
      if (busy || !city.active || city.away) return;
      const trip = plan(point);
      if (!trip) return;
      hover = trip;
      go(trip);
    },
    draw(ctx, view) {
      if (hover && view.e > 0.98) drawPin(ctx, view, hover);
    },
  });

  /** Works out where a click on the map sends you, and what to call it. */
  function plan(point) {
    const { info, view } = point;
    const warp = city.teleportInfo();
    const driving = Boolean(info.you.driving);
    const named = pickNamed(point, info, warp, view);
    let aim;
    let label;
    let toast;
    if (named) {
      aim = named.door ?? { x: named.x, z: named.z };
      label = named.name;
      toast = named.toast;
    } else {
      const road = roadAt(point.x, point.z, warp);
      if (road) {
        aim = { x: point.x, z: point.z, road };
        label = t("cityMap.pickRoad");
        toast = t("cityMap.warpRoad");
      } else {
        aim = { x: point.x, z: point.z };
        label = t("cityMap.pickHere");
        toast = nearestNamed(point.x, point.z, info, warp)?.near ?? t("cityMap.warpHere");
      }
    }
    const spot = driving ? laneSpot(aim, warp, info.you.heading) : footSpot(aim, warp, view.facing);
    if (!spot) return null;
    return { x: spot.x, z: spot.z, heading: spot.heading, click: { x: point.x, z: point.z }, label, toast, driving };
  }

  /** A badge or a building you clicked: homes, the pizza shop, the park, the beach, your car. */
  function pickNamed(point, info, warp, view) {
    const reach = view.badge / 2 + SLOP;
    const named = namedPlaces(info, warp);
    let best = null;
    let bestPx = Infinity;
    for (const place of named) {
      const px = Math.hypot(view.sx(place.x) - point.px, view.sy(place.z) - point.py);
      if (px <= reach && px < bestPx) {
        best = place;
        bestPx = px;
      }
    }
    if (best) return best;
    return named.find((place) => place.area && Math.abs(point.x - place.area.x) <= place.area.w / 2 && Math.abs(point.z - place.area.z) <= place.area.d / 2) ?? null;
  }

  function namedPlaces(info, warp) {
    const list = [];
    for (const lot of info.lots) {
      const door = warp.doors[lot.type];
      const type = t(lot.nameKey);
      list.push({
        x: lot.x,
        z: lot.z,
        door,
        area: door?.area,
        name: lot.main ? t("cityMap.yourHome") : type,
        toast: lot.main ? t("cityMap.warpHome") : fill(t("cityMap.warpTo"), { place: type }),
        near: lot.main ? t("cityMap.warpNearHome") : fill(t("cityMap.warpNear"), { place: type }),
      });
    }
    for (const place of info.places) {
      const door = place.door ?? warp.doors[place.id] ?? null;
      const name = t(place.nameKey);
      list.push({ x: place.x, z: place.z, door, area: door?.area, name, toast: fill(t("cityMap.warpTo"), { place: name }), near: fill(t("cityMap.warpNear"), { place: name }) });
    }
    if (!info.you.driving && info.car && !warp.car.sunk) {
      const side = beside(warp.car);
      list.push({ x: info.car.x, z: info.car.z, door: side, name: t("cityMap.yourCar"), toast: t("cityMap.warpCar") });
    }
    return list;
  }

  /** Where to stand next to your parked car: the driver's side, facing it. */
  function beside(car) {
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);
    return { x: car.x - cos * 2.4, z: car.z + sin * 2.4, heading: car.heading + Math.PI / 2 };
  }

  function nearestNamed(x, z, info, warp) {
    let best = null;
    let bestD = NEAR;
    for (const place of namedPlaces(info, warp)) {
      if (!place.near) continue;
      const d = Math.hypot(place.x - x, place.z - z);
      if (d < bestD) {
        best = place;
        bestD = d;
      }
    }
    return best;
  }

  /** On foot: the door or spot itself if it's clear, else the nearest clear ground to it. */
  function footSpot(aim, warp, facing = 0) {
    const free = nearestFree(aim.x, aim.z);
    if (!free) return null;
    let heading = aim.heading ?? facing;
    if (aim.road) heading = alongRoad(aim.road, facing);
    else if (aim.heading === undefined && Math.hypot(free.x - aim.x, free.z - aim.z) > 1) heading = Math.atan2(aim.x - free.x, aim.z - free.z);
    return { x: free.x, z: free.z, heading };
  }

  /** Driving: the right-hand lane nearest the spot, facing along the road, clear of traffic. */
  function laneSpot(aim, warp, carHeading = 0) {
    const end = warp.roadEnd - 4;
    const options = [];
    for (const r of warp.roads) {
      const sideZ = aim.z >= r ? 1 : -1;
      options.push({ axis: "x", road: r, x: clamp(aim.x, -end, end), z: r + sideZ * LANE, heading: sideZ > 0 ? -Math.PI / 2 : Math.PI / 2 });
      const sideX = aim.x >= r ? 1 : -1;
      options.push({ axis: "z", road: r, x: r + sideX * LANE, z: clamp(aim.z, -end, end), heading: sideX > 0 ? 0 : Math.PI });
    }
    const score = (option) => {
      let d = Math.hypot(option.x - aim.x, option.z - aim.z);
      if (aim.road) {
        // On the road you clicked; at a crossing, the way the car already points.
        if (option.axis !== aim.road.axis && !aim.road.cross) d += 1000;
        if (aim.road.cross && option.axis !== (Math.abs(Math.sin(carHeading)) > 0.7 ? "x" : "z")) d += 0.5;
      }
      return d;
    };
    options.sort((a, b) => score(a) - score(b));
    for (const option of options.slice(0, 4)) {
      for (const shift of [0, 7, -7, 14, -14, 21, -21, 28, -28]) {
        const x = option.axis === "x" ? clamp(option.x + shift, -end, end) : option.x;
        const z = option.axis === "z" ? clamp(option.z + shift, -end, end) : option.z;
        if (warp.traffic.some((bot) => Math.hypot(bot.x - x, bot.z - z) < 7)) continue;
        if (city.blockedAt(x, z, 1.4)) continue;
        return { x, z, heading: option.heading };
      }
    }
    return null;
  }

  /** The closest spot to x, z with room to stand, searching outward in rings. */
  function nearestFree(x, z) {
    if (!city.blockedAt(x, z, FOOT_R)) return { x, z };
    for (let r = STEP; r <= SEARCH; r += STEP) {
      const count = Math.max(12, Math.ceil((Math.PI * 2 * r) / STEP));
      const turn = Math.atan2(-x, -z);
      for (let i = 0; i < count; i += 1) {
        // Alternate either side of the way toward the middle of town, so ties lean inward.
        const k = i % 2 ? -Math.ceil(i / 2) : Math.ceil(i / 2);
        const a = turn + (k / count) * Math.PI * 2;
        const px = x + Math.sin(a) * r;
        const pz = z + Math.cos(a) * r;
        if (!city.blockedAt(px, pz, FOOT_R)) return { x: px, z: pz };
      }
    }
    return null;
  }

  async function go(trip) {
    busy = true;
    blip?.("ding");
    veil.classList.add("is-on");
    await wait(FADE_IN_MS);
    if (city.active && !city.away) {
      const spot = city.teleport(trip.x, trip.z, trip.heading);
      onSpot?.(spot);
      map.close();
      hover = null;
      await wait(HOLD_MS);
      onToast?.(trip.toast, spot.dropped ? t("cityMap.warpDropped") : null);
    }
    veil.classList.remove("is-on");
    await wait(FADE_OUT_MS);
    busy = false;
  }

  function drawPin(ctx, view, trip) {
    const x = view.sx(trip.x);
    const y = view.sy(trip.z);
    const cx = view.sx(trip.click.x);
    const cy = view.sy(trip.click.z);
    ctx.save();
    if (Math.hypot(cx - x, cy - y) > 6) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const pulse = 0.5 + 0.5 * Math.sin(view.time * 6);
    ctx.strokeStyle = PIN;
    ctx.globalAlpha = 0.45 + 0.4 * (1 - pulse);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 9 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(30, 12, 28, 0.3)";
    ctx.beginPath();
    ctx.ellipse(1, 1, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PIN;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-3, -6, -8, -10, -8, -16);
    ctx.arc(0, -16, 8, Math.PI, 0);
    ctx.bezierCurveTo(8, -10, 3, -6, 0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, -16, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const text = fill(t("cityMap.pickLabel"), { place: trip.label });
    ctx.save();
    ctx.font = `900 13px ${TEXT_FONT}`;
    const w = ctx.measureText(text).width + 18;
    const h = 24;
    const lx = clamp(x - w / 2, 4, view.W - w - 4);
    const ly = y - 30 - h < 4 ? y + 8 : y - 30 - h;
    ctx.fillStyle = PIN;
    ctx.beginPath();
    ctx.roundRect(lx, ly, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, lx + w / 2, ly + h / 2 + 0.5);
    ctx.restore();
  }

  return {
    /** True while the big map is open or a teleport is fading: no walking, driving, or E. */
    get blocking() {
      return busy || map.big;
    },
  };
}

/** Which road a city point is on, if any. `cross` when it's where two roads meet. */
function roadAt(x, z, warp) {
  const half = warp.roadWidth / 2;
  const onX = warp.roads.some((r) => Math.abs(z - r) <= half) && Math.abs(x) <= warp.roadEnd;
  const onZ = warp.roads.some((r) => Math.abs(x - r) <= half) && Math.abs(z) <= warp.roadEnd;
  if (!onX && !onZ) return null;
  return { axis: onX ? "x" : "z", cross: onX && onZ };
}

/** Facing along a road, whichever way is closer to how you face now. */
function alongRoad(road, facing) {
  if (road.cross) return facing;
  if (road.axis === "x") return Math.sin(facing) >= 0 ? Math.PI / 2 : -Math.PI / 2;
  return Math.cos(facing) >= 0 ? 0 : Math.PI;
}
