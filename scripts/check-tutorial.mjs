const port = Number(process.env.CDP_PORT || 9333);
const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const page = list.find((entry) => entry.type === "page");
if (!page) throw new Error(`No page target: ${JSON.stringify(list)}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve);
  ws.addEventListener("error", () => reject(new Error("CDP socket failed")));
});

let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(`${message.error.message}`));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 25000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await evaluate(expression);
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${expression}. Last: ${JSON.stringify(last)}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: "http://127.0.0.1:41723/?tutorialcheck=1" });
await waitFor("document.querySelector('#boot')?.hidden === true");
const bootError = await evaluate("document.querySelector('#boot-status')?.textContent");
await evaluate("document.querySelector('#title-start')?.click()");
await waitFor("!document.body.classList.contains('title-open')");
await evaluate("document.querySelector('#start-play')?.click()");
await waitFor("document.querySelector('#tutorial') && !document.querySelector('#tutorial').hidden");

const steps = [];
async function readCard() {
  return evaluate(`(() => {
    const root = document.querySelector('#tutorial');
    return {
      hidden: root.hidden,
      title: document.querySelector('#tutorial-title')?.textContent,
      body: document.querySelector('#tutorial-body')?.textContent,
      try: document.querySelector('#tutorial-try')?.hidden ? '' : document.querySelector('#tutorial-try')?.textContent,
      next: document.querySelector('#tutorial-next')?.hidden ? '' : document.querySelector('#tutorial-next')?.textContent,
      skip: document.querySelector('#tutorial-skip')?.hidden ? '' : document.querySelector('#tutorial-skip')?.textContent,
      keys: document.querySelector('#tutorial-keys')?.innerText?.replace(/\\s+/g, ' ').trim(),
    };
  })()`);
}
steps.push({ at: "welcome", ...(await readCard()) });

await evaluate("document.querySelector('#tutorial-next')?.click()");
await sleep(200);
steps.push({ at: "after-next", ...(await readCard()) });

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(900);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w', code: 'KeyW', bubbles: true }))`);
await sleep(200);
steps.push({ at: "after-run", ...(await readCard()) });

await evaluate(`(() => {
  const canvas = document.querySelector('#view');
  const down = new PointerEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 320, pointerId: 1, button: 0, pointerType: 'mouse' });
  const move = new PointerEvent('pointermove', { bubbles: true, clientX: 640, clientY: 300, pointerId: 1, button: 0, pointerType: 'mouse' });
  const up = new PointerEvent('pointerup', { bubbles: true, clientX: 640, clientY: 300, pointerId: 1, button: 0, pointerType: 'mouse' });
  canvas.dispatchEvent(down);
  canvas.dispatchEvent(move);
  canvas.dispatchEvent(up);
})()`);
await sleep(900);
steps.push({ at: "after-look", ...(await readCard()) });

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))`);
await sleep(900);
steps.push({ at: "after-jump", ...(await readCard()) });

await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))`);
await sleep(120);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))`);
await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true }))`);
await sleep(1000);
steps.push({ at: "after-double", ...(await readCard()) });

const shot = await send("Page.captureScreenshot", { format: "png" });
const file = new URL("../.tutorial-check.png", import.meta.url);
await import("node:fs/promises").then((fs) => fs.writeFile(file, Buffer.from(shot.data, "base64")));

console.log(JSON.stringify({ bootError, steps, screenshot: file.pathname }, null, 2));
ws.close();
