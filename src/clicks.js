/** Farther than this (px) between press and release, or longer than CLICK_MS, is a camera drag. */
const CLICK_MOVE = 6;
const CLICK_MS = 450;

/**
 * Calls `handler(x, y, event)` for a quick tap or click on the canvas, but not for a camera drag.
 * x and y are canvas CSS pixels, ready for `scene.pick`. Returns a function that stops listening.
 */
export function onCanvasClick(canvas, handler) {
  let down = null;
  const press = (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    down = { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() };
  };
  const release = (event) => {
    const from = down;
    down = null;
    if (!from || from.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_MOVE) return;
    if (performance.now() - from.at > CLICK_MS) return;
    const rect = canvas.getBoundingClientRect();
    handler(event.clientX - rect.left, event.clientY - rect.top, event);
  };
  const cancel = () => {
    down = null;
  };
  canvas.addEventListener("pointerdown", press);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", cancel);
  return () => {
    canvas.removeEventListener("pointerdown", press);
    canvas.removeEventListener("pointerup", release);
    canvas.removeEventListener("pointercancel", cancel);
  };
}
