import { t } from "./i18n.js";

const SEEN_KEY = "asmr-squishy-obby:tutorial";

/** One idea per slide. `keys` draws the desktop controls under the sentence. */
const SLIDES = [
  { id: "welcome" },
  { id: "move", keys: "wasd" },
  { id: "look" },
  { id: "jump", keys: "space" },
  { id: "double", keys: "space" },
  { id: "climb" },
  { id: "checkpoint" },
  { id: "coins" },
  { id: "ready" },
];

/**
 * First-open slideshow. It covers the screen until Skip or Got it, which are remembered.
 * Next and Back move between slides. Starting play also closes it, so it never sits over the climb.
 */
export function createTutorial() {
  const root = document.querySelector("#tutorial");
  const slideBox = document.querySelector("#tutorial .tutorial-slide");
  const title = document.querySelector("#tutorial-title");
  const body = document.querySelector("#tutorial-body");
  const keys = document.querySelector("#tutorial-keys");
  const skipButton = document.querySelector("#tutorial-skip");
  const backButton = document.querySelector("#tutorial-back");
  const nextButton = document.querySelector("#tutorial-next");
  const dots = document.querySelector(".tutorial-dots");
  for (let i = 0; i < SLIDES.length; i += 1) dots.append(document.createElement("span"));

  let armed = false;
  let climbClaimed = false;
  let stepIndex = 0;
  let painted = "";

  skipButton.addEventListener("click", finish);
  backButton.addEventListener("click", () => {
    if (stepIndex > 0) go(stepIndex - 1);
  });
  nextButton.addEventListener("click", () => {
    if (stepIndex >= SLIDES.length - 1) finish();
    else go(stepIndex + 1);
  });

  function seen() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  }

  function finish() {
    const wasOpen = armed || !root.hidden;
    armed = false;
    root.hidden = true;
    painted = "";
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode: the lesson can show again next visit.
    }
    if (!wasOpen) return;
    const screen = document.querySelector("#title-screen");
    if (screen && !screen.hidden) document.querySelector("#title-start")?.focus({ preventScroll: true });
  }

  /** Starts the lesson unless it was skipped, finished, or is already on screen. */
  function offer() {
    if (armed || seen()) return false;
    armed = true;
    stepIndex = 0;
    painted = "";
    paint(0);
    nextButton.focus({ preventScroll: true });
    return true;
  }

  /** True once, the first time the climb starts while this lesson is still up. */
  function claimClimb() {
    if (!armed || climbClaimed) return false;
    climbClaimed = true;
    return true;
  }

  function go(index) {
    stepIndex = Math.max(0, Math.min(SLIDES.length - 1, index));
    painted = "";
    paint(stepIndex);
  }

  function tick(_dt, _frame, { present = true, playing = false } = {}) {
    if (!armed) return;
    // The lesson is only for the opening. Once the menu closes, play has started.
    if (playing) {
      finish();
      return;
    }
    // Settings, the shop, and game over take the screen. The title stays covered.
    if (!present) {
      root.hidden = true;
      return;
    }
    paint(stepIndex);
  }

  function paint(index) {
    const slide = SLIDES[index];
    const touch = window.matchMedia("(pointer: coarse)").matches || document.body.classList.contains("show-touch");
    const key = `${slide.id}:${touch}`;
    root.hidden = false;
    if (key === painted) return;
    painted = key;
    title.textContent = titleFor(slide.id);
    body.textContent = bodyFor(slide.id, touch);
    keys.replaceChildren();
    if (!touch && slide.keys === "wasd") {
      keys.hidden = false;
      keys.append(wasdKeys());
    } else if (!touch && slide.keys === "space") {
      keys.hidden = false;
      keys.append(cap("Space"));
    } else {
      keys.hidden = true;
    }
    const last = index === SLIDES.length - 1;
    backButton.hidden = index === 0;
    nextButton.textContent = last ? t("tutorial.gotIt") : t("tutorial.go");
    [...dots.children].forEach((dot, dotIndex) => {
      dot.classList.toggle("is-done", dotIndex < index);
      dot.classList.toggle("is-on", dotIndex === index);
    });
    slideBox.classList.remove("is-changing");
    void slideBox.offsetWidth;
    slideBox.classList.add("is-changing");
  }

  return {
    offer,
    claimClimb,
    tick,
    get showing() {
      return armed && !root.hidden;
    },
  };
}

function titleFor(id) {
  if (id === "welcome") return t("tutorial.welcomeTitle");
  if (id === "move") return t("tutorial.moveTitle");
  if (id === "look") return t("tutorial.lookTitle");
  if (id === "jump") return t("tutorial.jumpTitle");
  if (id === "double") return t("tutorial.doubleTitle");
  if (id === "climb") return t("tutorial.climbTitle");
  if (id === "checkpoint") return t("tutorial.checkpointTitle");
  if (id === "coins") return t("tutorial.coinsTitle");
  return t("tutorial.readyTitle");
}

function bodyFor(id, touch) {
  if (id === "welcome") return t("tutorial.welcome");
  if (id === "move") return touch ? t("tutorial.moveTouch") : t("tutorial.moveKeys");
  if (id === "look") return touch ? t("tutorial.lookTouch") : t("tutorial.lookKeys");
  if (id === "jump") return touch ? t("tutorial.jumpTouch") : t("tutorial.jumpKeys");
  if (id === "double") return touch ? t("tutorial.doubleTouch") : t("tutorial.doubleKeys");
  if (id === "climb") return t("tutorial.climb");
  if (id === "checkpoint") return t("tutorial.checkpoint");
  if (id === "coins") return t("tutorial.coins");
  return t("tutorial.ready");
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
