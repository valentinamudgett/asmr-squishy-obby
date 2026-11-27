import { Axis, Vector3 } from "@babylonjs/core";
import { createPeople } from "./cityPeople.js";
import { bindHousehold, createHousehold } from "./cityHousehold.js";
import { createSportsPark } from "./citySports.js";
import { t } from "./i18n.js";

/**
 * City life version 2: the household, the taxi job, moving day, the airport, and trips abroad.
 * Each lives in its own module; this one plugs them into the city as one add-on (city.use) and
 * owns what they share: a small crowd of city people for passengers.
 */
export function bindCityV2(city, cityUi, { blip, onCoins, onPaid, onToast, onSpot, camera }) {
  const shared = { crowd: null, onPaid, onCoins, onToast, onSpot, blip, camera };
  let household = null;
  const parts = [];

  city.use((host) => {
    shared.crowd = createPeople(host.scene, host.origin, { max: 14 });
    for (const mesh of shared.crowd.sources) host.graphics?.shadow?.addShadowCaster(mesh, false);
    const sports = createSportsPark(host, { shapes: city.mapInfo({ x: host.at.x, z: host.at.z }).shapes });
    household = createHousehold(host, { ...shared, sports });
    parts.push(sports, household);
    const lookDir = new Vector3();
    let goal = null;
    let action = null;
    let owner = null;
    return {
      update(dt, time, frame) {
        const ctx = { ...frame, away: city.away };
        const events = [];
        goal = null;
        action = null;
        owner = null;
        for (const part of parts) {
          const out = part.update(dt, time, ctx);
          if (out?.length) events.push(...out);
          goal ??= part.goal ?? null;
          if (!action && part.action) {
            action = part.action;
            owner = part;
          }
        }
        const cam = host.scene.activeCamera;
        if (cam && !city.away) {
          cam.getDirectionToRef(Axis.Z, lookDir);
          const flat = Math.hypot(lookDir.x, lookDir.z) || 1;
          shared.crowd.update(dt, time, {
            x: cam.globalPosition.x - host.at.x,
            z: cam.globalPosition.z - host.at.z,
            fx: lookDir.x / flat,
            fz: lookDir.z / flat,
            far: 220,
            ox: host.at.x,
            oy: host.at.y,
            oz: host.at.z,
          });
        }
        return events;
      },
      get goal() {
        return goal;
      },
      get action() {
        return action;
      },
      act(name) {
        return owner?.act?.(name) ?? null;
      },
      mapPlaces() {
        return parts.flatMap((part) => part.mapPlaces?.() ?? []);
      },
      moved(from, to) {
        for (const part of parts) part.moved?.(from, to);
      },
      leave() {
        for (const part of parts) part.leave?.();
      },
    };
  });

  const homeUi = bindHousehold(household, { blip, onToast, isActive: () => city.active && !city.away });
  cityUi.addSheet(homeUi);
  const sheets = [homeUi];

  if (new URLSearchParams(location.search).has("debug")) window.__cityV2 = { city, household, parts };

  return {
    get open() {
      return sheets.some((sheet) => sheet.open);
    },
    tick(showHud) {
      const show = showHud && !city.away;
      for (const sheet of sheets) sheet.tick(show);
    },
  };
}

/** The prompt and button words for the add-ons' actions, or null for anyone else's. */
export function cityActionText(action) {
  return null;
}
