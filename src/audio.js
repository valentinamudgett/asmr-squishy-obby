import { CreateAudioEngineAsync, CreateSoundAsync, CreateSoundBufferAsync } from "@babylonjs/core";
import butterUrl from "../sounds/butter.mp3?url";
import crunchUrl from "../sounds/crunch.mp3?url";
import walkingUrl from "../sounds/walking.mp3?url";

const COOLDOWN_MS = 55;
const CRUNCH_OFFSET = 0.05;

export async function createAudio() {
  const audioEngine = await CreateAudioEngineAsync({
    disableDefaultUI: true,
    volume: 1,
  });
  const effects = await audioEngine.createBusAsync("effects");
  // Decoded once and shared by every pad's spatial sound.
  const crunchBuffer = await CreateSoundBufferAsync(crunchUrl, {}, audioEngine);
  const butterBuffer = await CreateSoundBufferAsync(butterUrl, {}, audioEngine);
  const walking = await CreateSoundAsync("walking", walkingUrl, { loop: true, outBus: effects, volume: 0.6 }, audioEngine);

  let unlocked = false;
  let unlockPromise = null;
  let walkingOn = false;

  function unlock() {
    if (!unlockPromise) {
      unlockPromise = audioEngine.unlockAsync().then(() => {
        unlocked = true;
      });
    }
    return unlockPromise;
  }

  return {
    audioEngine,
    effects,
    get unlocked() {
      return unlocked;
    },
    unlock,
    async attachPad(pad) {
      const butter = pad.food === "butter";
      pad.landOffset = butter ? 0 : CRUNCH_OFFSET;
      pad.landSound = await CreateSoundAsync(
        `${pad.id}-land`,
        butter ? butterBuffer : crunchBuffer,
        {
          spatialEnabled: true,
          spatialAutoUpdate: true,
          spatialMinDistance: 1.5,
          spatialMaxDistance: 28,
          spatialRolloffFactor: 1.2,
          spatialDistanceModel: "linear",
          maxInstances: 2,
          outBus: effects,
          volume: 1,
        },
        audioEngine,
      );
      pad.landSound.spatial.attach(pad.mesh);
      // Wooden blocks get a quicker, higher knock instead of the soft crunch.
      if (pad.hard) pad.landSound.playbackRate = 1.7;
      pad.lastCrunch = 0;
      if (pad.removed) pad.landSound.dispose();
    },
    detachPad(pad) {
      pad.landSound?.dispose();
      pad.landSound = null;
    },
    crunch(pad, impact) {
      if (!unlocked || !pad.landSound) return;
      const now = performance.now();
      if (now - pad.lastCrunch < COOLDOWN_MS) return;
      pad.lastCrunch = now;
      const strength = Math.max(0, Math.min(1, impact / 11));
      const volume = (0.55 + strength * 0.45) * (pad.hard ? 0.6 : 1);
      pad.landSound.play({ startOffset: pad.landOffset, volume });
    },
    setWalking(active) {
      if (!unlocked || active === walkingOn) return;
      walkingOn = active;
      if (active) walking.play();
      else walking.stop();
    },
    attachListener(camera) {
      audioEngine.listener.attach(camera);
    },
  };
}
