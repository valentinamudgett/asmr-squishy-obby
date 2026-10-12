import { CreateAudioEngineAsync, CreateSoundAsync, CreateSoundBufferAsync, CreateStreamingSoundAsync, SoundState } from "@babylonjs/core";
import boomUrl from "../sounds/boom.mp3?url";
import butterUrl from "../sounds/butter.mp3?url";
import crunchUrl from "../sounds/crunch.mp3?url";
import menuMusicUrl from "../sounds/menu-music.mp3?url";
import walkingUrl from "../sounds/walking.mp3?url";

const COOLDOWN_MS = 55;
const CRUNCH_OFFSET = 0.05;
const BOOM_FILE = "sounds/boom.mp3";
/** Falling yell, then the puff. The pink puff in boom.js is shorter than the boom file. */
export const LAVA_SCREAM_SECONDS = 0.58;
/** Pink puff length. sounds/boom.mp3 keeps playing after the puff ends. */
export const LAVA_BOOM_SECONDS = 0.4;
const LAVA_PEAK = 0.74;
const GAG_LOCK_MS = (LAVA_SCREAM_SECONDS + LAVA_BOOM_SECONDS + 0.35) * 1000;

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
  const screamBuffer = await synthBuffer(LAVA_SCREAM_SECONDS, renderScream);
  const screamSound = await CreateSoundAsync(
    "lava-scream",
    screamBuffer,
    { outBus: effects, volume: 0.68, maxInstances: 1 },
    audioEngine,
  );
  // Non-positional bed on the effects bus. A second play while this is running would cut the first.
  const boomSound = await CreateSoundAsync(
    "boom",
    boomUrl,
    { outBus: effects, volume: 1, maxInstances: 1 },
    audioEngine,
  );
  const boomSeconds = boomSound.buffer.duration;
  const music = await audioEngine.createBusAsync("music");
  const menuMusic = await CreateStreamingSoundAsync(
    "menu-music",
    menuMusicUrl,
    { loop: true, outBus: music, volume: 0.5, maxInstances: 1, preloadCount: 1 },
    audioEngine,
  );

  let unlocked = false;
  let unlockPromise = null;
  let menuWanted = false;
  let walkingOn = false;
  let screamLock = 0;
  let boomLock = 0;
  const cues = [];

  function playGag(sound, name, volume, file) {
    if (!unlocked || audioEngine.volume <= 0) return false;
    try {
      sound.play({ volume });
    } catch (error) {
      console.warn(`Lava ${name} failed`, error);
      return false;
    }
    const clock = audioEngine.audioContext ?? audioEngine._audioContext;
    cues.push({
      name,
      file: file ?? null,
      sound: sound.name,
      bufferSeconds: sound.buffer?.duration ?? null,
      at: clock?.currentTime ?? null,
      wall: performance.now(),
      instances: sound.activeInstancesCount,
    });
    if (cues.length > 12) cues.shift();
    console.info(file ? `lava ${name} ${file}` : `lava ${name}`);
    return true;
  }

  function menuPlaying() {
    return menuMusic.state === SoundState.Started || menuMusic.state === SoundState.Starting;
  }

  function applyMenuMusic() {
    if (!unlocked) return;
    if (menuWanted) {
      if (menuMusic.state === SoundState.Paused) menuMusic.resume();
      else if (!menuPlaying()) menuMusic.play();
    } else if (menuPlaying()) {
      menuMusic.pause();
    }
  }

  function unlock() {
    if (!unlockPromise) {
      unlockPromise = audioEngine.unlockAsync().then(() => {
        unlocked = true;
        applyMenuMusic();
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
    /** Loop the start-menu track while a menu is up. Pauses on the course so it can resume. */
    setMenuMusic(on) {
      menuWanted = on;
      applyMenuMusic();
    },
    get menuMusicPlaying() {
      return menuPlaying();
    },
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
    /** One yell per fall. Ignored if a gag is already sounding. */
    scream() {
      const now = performance.now();
      if (now < screamLock) return false;
      screamLock = now + GAG_LOCK_MS;
      return playGag(screamSound, "scream", 0.68);
    },
    /** One boom file per fall, starting with the puff. A long take plays out and will not stack. */
    boom() {
      const now = performance.now();
      if (now < boomLock || boomSound.activeInstancesCount > 0) return false;
      const played = playGag(boomSound, "boom", 1, BOOM_FILE);
      if (played) boomLock = now + boomSeconds * 1000;
      return played;
    },
    get cues() {
      return cues;
    },
    get lavaVoices() {
      return {
        scream: screamSound.activeInstancesCount,
        boom: boomSound.activeInstancesCount,
      };
    },
    screamSeconds: screamBuffer.duration,
    boomSeconds,
    boomFile: BOOM_FILE,
  };
}

function synthBuffer(seconds, render) {
  const rate = 44100;
  const context = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
  render(context, seconds);
  return context.startRendering().then((rendered) => {
    peakNormalize(rendered, LAVA_PEAK);
    // A buffer from OfflineAudioContext is locked to that context. Playback uses the
    // engine's AudioContext, which rejects it, so the yell never starts.
    const free = new AudioBuffer({
      length: rendered.length,
      numberOfChannels: rendered.numberOfChannels,
      sampleRate: rendered.sampleRate,
    });
    for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
      free.copyToChannel(rendered.getChannelData(channel), channel);
    }
    return free;
  });
}

function peakNormalize(buffer, peak) {
  let max = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) max = Math.max(max, Math.abs(data[i]));
  }
  if (max < 1e-4) return;
  const gain = peak / max;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) data[i] *= gain;
  }
}

/** A short falling "yaah": triangle plus a quiet saw through vowel formants. */
function renderScream(ctx, seconds) {
  const voice = ctx.createOscillator();
  voice.type = "triangle";
  voice.frequency.setValueAtTime(540, 0);
  voice.frequency.exponentialRampToValueAtTime(190, seconds * 0.94);

  const buzz = ctx.createOscillator();
  buzz.type = "sawtooth";
  buzz.frequency.setValueAtTime(546, 0);
  buzz.frequency.exponentialRampToValueAtTime(188, seconds * 0.94);
  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0.16;

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5.6;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.setValueAtTime(7, 0);
  vibratoGain.gain.linearRampToValueAtTime(16, seconds * 0.8);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(voice.frequency);
  vibratoGain.connect(buzz.frequency);

  const mix = ctx.createGain();
  voice.connect(mix);
  buzz.connect(buzzGain);
  buzzGain.connect(mix);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.001, 0);
  master.gain.exponentialRampToValueAtTime(0.22, 0.03);
  master.gain.setValueAtTime(0.2, seconds * 0.62);
  master.gain.exponentialRampToValueAtTime(0.001, seconds);

  const formants = [
    { from: 820, to: 640, q: 7, gain: 1 },
    { from: 1900, to: 1120, q: 6, gain: 0.55 },
    { from: 2750, to: 2460, q: 5, gain: 0.2 },
  ];
  for (const formant of formants) {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = formant.q;
    filter.frequency.setValueAtTime(formant.from, 0);
    filter.frequency.exponentialRampToValueAtTime(formant.to, seconds * 0.9);
    const gain = ctx.createGain();
    gain.gain.value = formant.gain;
    mix.connect(filter);
    filter.connect(gain);
    gain.connect(master);
  }

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3400;
  tone.Q.value = 0.4;
  master.connect(tone);
  tone.connect(ctx.destination);

  voice.start(0);
  buzz.start(0);
  vibrato.start(0);
  voice.stop(seconds);
  buzz.stop(seconds);
  vibrato.stop(seconds);
}

