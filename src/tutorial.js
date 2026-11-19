import { t } from "./i18n.js";

const SEEN_KEY = "asmr-squishy-obby:tutorial";
const STEPS = ["welcome", "move", "look", "jump", "double", "climb", "ready"];
/** Long enough to read the card, short enough that a finished action moves on. */
const READ_SECONDS = 0.55;

/**
 * First-play coach for the climb. It stays hidden until Start bouncing, waits while a menu
 * or another mode has the screen, and remembers when it is skipped or finished.
 */
export function createTutorial() {
  const root = document.querySelector("#tutorial");
  const title = document.querySelector("#tutorial-title");
  const body = document.querySelector("#tutorial-body");
  const keys = document.querySelector("#tutorial-keys");
  const tryLine = document.querySelector("#tutorial-try");
  const skipButton = document.querySelector("#tutorial-skip");
  const nextButton = document.querySelector("#tutorial-next");
  const dots = document.querySelector(".tutorial-dots");
  for (let i = 0; i < STEPS.length; i += 1) dots.append(document.createElement("span"));

  let armed = false;
  let stepIndex = 0;
  let stepAge = 0;
  let ready = false;
  let pendingDouble = false;
  let painted = "";

  skipButton.addEventListener("click", finish);
  nextButton.addEventListener("click", () => {
    const step = STEPS[stepIndex];
    if (step === "welcome") go(stepIndex + 1);
    else if (step === "ready") finish();
  });

  function seen() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  }

  function finish() {
    armed = false;
    root.hidden = true;
    painted = "";
    markHighlights(null, false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode: the lesson can show again next visit.
    }
  }

  /** `alreadyPlayed` is true once a checkpoint past the start has been saved. Returns true when the lesson actually starts. */
  function offer(alreadyPlayed) {
    if (armed || seen() || alreadyPlayed) return false;
    armed = true;
    stepIndex = 0;
    stepAge = 0;
    ready = false;
    pendingDouble = false;
    painted = "";
    return true;
  }

  function go(index) {
    stepIndex = index;
    stepAge = 0;
    ready = false;
    if (STEPS[index] !== "double") pendingDouble = false;
    painted = "";
  }

  function tick(dt, frame, { teaching, startPad }) {
    if (!armed) return;
    if (!teaching) {
      root.hidden = true;
      markHighlights(null, false);
      return;
    }
    const step = STEPS[stepIndex];
    stepAge += dt;
    if (step === "move" && frame.walking) ready = true;
    if (step === "look" && frame.looked) ready = true;
    if (step === "jump" && frame.jumped) ready = true;
    if ((step === "jump" || step === "double") && (frame.doubleJumped || frame.flying)) pendingDouble = true;
    if (step === "double" && pendingDouble) ready = true;
    if (step === "climb" && frame.pad && frame.pad !== startPad && (frame.grounded || frame.justLanded)) ready = true;
    if (step !== "welcome" && step !== "ready" && ready && stepAge >= READ_SECONDS) go(stepIndex + 1);
    paint(STEPS[stepIndex]);
  }

  function paint(step) {
    const touch = window.matchMedia("(pointer: coarse)").matches || document.body.classList.contains("show-touch");
    const key = `${step}:${touch}`;
    root.hidden = false;
    markHighlights(step, touch);
    if (key === painted) return;
    painted = key;
    title.textContent = titleFor(step);
    body.textContent = bodyFor(step, touch);
    const caps = keycaps(step, touch);
    keys.replaceChildren();
    if (step === "move" && !touch) {
      keys.hidden = false;
      keys.append(wasdKeys());
    } else {
      keys.hidden = caps.length === 0;
      for (const label of caps) keys.append(cap(label));
    }
    const prompted = step !== "welcome" && step !== "ready";
    tryLine.hidden = !prompted;
    skipButton.hidden = step === "ready";
    nextButton.hidden = step !== "welcome" && step !== "ready";
    nextButton.textContent = step === "ready" ? t("tutorial.gotIt") : t("tutorial.go");
    [...dots.children].forEach((dot, index) => {
      dot.classList.toggle("is-done", index < stepIndex);
      dot.classList.toggle("is-on", index === stepIndex);
    });
  }

  return {
    offer,
    tick,
    get showing() {
      return armed && !root.hidden;
    },
  };
}

function titleFor(step) {
  if (step === "welcome") return t("tutorial.welcomeTitle");
  if (step === "move") return t("tutorial.moveTitle");
  if (step === "look") return t("tutorial.lookTitle");
  if (step === "jump") return t("tutorial.jumpTitle");
  if (step === "double") return t("tutorial.doubleTitle");
  if (step === "climb") return t("tutorial.climbTitle");
  return t("tutorial.readyTitle");
}

function bodyFor(step, touch) {
  if (step === "welcome") return t("tutorial.welcome");
  if (step === "move") return touch ? t("tutorial.moveTouch") : t("tutorial.moveKeys");
  if (step === "look") return touch ? t("tutorial.lookTouch") : t("tutorial.lookKeys");
  if (step === "jump") return touch ? t("tutorial.jumpTouch") : t("tutorial.jumpKeys");
  if (step === "double") return touch ? t("tutorial.doubleTouch") : t("tutorial.doubleKeys");
  if (step === "climb") return t("tutorial.climb");
  return t("tutorial.ready");
}

function keycaps(step, touch) {
  if (touch) return [];
  if (step === "jump" || step === "double") return ["Space"];
  return [];
}

function cap(label) {
  const key = document.createElement("kbd");
  key.textContent = label;
  return key;
}

function wasdKeys() {
  const cluster = document.createElement("span");
  cluster.className = "tutorial-wasd";
  const top = document.createElement("span");
  top.append(cap("W"));
  const bottom = document.createElement("span");
  bottom.append(cap("A"), cap("S"), cap("D"));
  cluster.append(top, bottom);
  return cluster;
}

function markHighlights(step, touch) {
  document.body.classList.toggle("tutorial-stick", touch && step === "move");
  document.body.classList.toggle("tutorial-jump", touch && (step === "jump" || step === "double"));
}
