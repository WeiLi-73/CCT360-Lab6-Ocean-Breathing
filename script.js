/*
  CCT360 Lab 6: Working with API
  Project: Ocean Breathing
  Author: Wei Li

  Data:
  Open-Meteo Marine API

  Data-driven properties:
  1. Text: wave height, period, direction and sea state.
  2. Visuals: wave amplitude and colour palette.
  3. Behaviour: wave rhythm, lateral movement and compass.
  4. Sound: surf intensity, tone and swell rhythm.
*/

"use strict";

/* 1. Locations and page elements */

const coasts = {
  lisbon: {
    name: "LISBON COAST / PORTUGAL",
    lat: 38.5,
    lon: -9.6
  },

  tofino: {
    name: "TOFINO COAST / CANADA",
    lat: 49.0,
    lon: -126.2
  },

  kamakura: {
    name: "KAMAKURA COAST / JAPAN",
    lat: 35.15,
    lon: 139.5
  },

  cape: {
    name: "CAPE TOWN COAST / SOUTH AFRICA",
    lat: -34.1,
    lon: 18.1
  }
};

const $ = (selector) => document.querySelector(selector);

const canvas = $("#ocean");
const ctx = canvas.getContext("2d");

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

const AUTO_REFRESH = 60 * 1000;

let sea = null;
let controller = null;
let requestID = 0;
let loading = false;
let lastFetched = 0;

let width = 1;
let height = 1;
let phase = 0;
let lastFrame = 0;
let amplitude = 0;

let audio = null;
let soundOn = false;
let soundBusy = false;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function coordinates(lat, lon) {
  const latitude = Math.abs(lat).toFixed(2);
  const longitude = Math.abs(lon).toFixed(2);

  const northSouth = lat >= 0 ? "N" : "S";
  const eastWest = lon >= 0 ? "E" : "W";

  return `${latitude}° ${northSouth} · ${longitude}° ${eastWest}`;
}

function moodForHeight(value) {
  // These are artistic labels, not official safety classifications.
  if (value < 1) return "calm";
  if (value < 2.5) return "moderate";

  return "energetic";
}

function updateLocation() {
  const place = coasts[$("#coast").value];

  $("#location").textContent = place.name;

  $("#coordinates").textContent = coordinates(
    place.lat,
    place.lon
  );
}

/* Clear the previous coast before loading a different location. */

function resetSea() {
  sea = null;
  amplitude = 0;
  lastFetched = 0;

  document.body.dataset.mood = "waiting";

  [
    "#wave-height",
    "#wave-period",
    "#wave-direction"
  ].forEach((id) => {
    $(id).textContent = "…";
  });

  $("#mood").textContent = "AWAITING DATA";

  $("#model-time").textContent = "Model time: awaiting data";
  $("#fetched-time").textContent = "Not fetched yet";

  $("#arrow").style.transform = "rotate(0deg)";

  updateAudio();
  drawOcean();
}

/* 2. Fetch and process current marine model data */

async function loadSeaData() {
  const id = ++requestID;

  // Cancel an older request when a newer request starts.
  if (controller) {
    controller.abort();
  }

  controller = new AbortController();
  const activeController = controller;

  loading = true;

  $("#refresh").disabled = true;
  $("#sound").disabled = !sea || soundBusy;

  $(".data-panel").setAttribute("aria-busy", "true");

  $("#status").textContent =
    "Reading the latest available sea conditions…";

  const place = coasts[$("#coast").value];

  const params = new URLSearchParams({
    latitude: place.lat,
    longitude: place.lon,
    current: "wave_height,wave_period,wave_direction",
    timezone: "GMT"
  });

  const url =
    `https://marine-api.open-meteo.com/v1/marine?${params}`;

  const timeout = setTimeout(() => {
    activeController.abort();
  }, 15000);

  try {
    const response = await fetch(url, {
      signal: activeController.signal
    });

    if (!response.ok) {
      throw new Error(
        `Marine service returned ${response.status}`
      );
    }

    const data = await response.json();
    const current = data.current;

    const values = [
      current?.wave_height,
      current?.wave_period,
      current?.wave_direction
    ];

    const validNumbers = values.every(Number.isFinite);

    if (
      !validNumbers ||
      current.wave_height < 0 ||
      current.wave_period < 0 ||
      current.wave_direction < 0 ||
      current.wave_direction > 360 ||
      typeof current.time !== "string"
    ) {
      throw new Error("Incomplete marine data");
    }

    // Ignore a response if the visitor has already changed coast.
    if (id !== requestID) return;

    sea = {
      height: current.wave_height,
      period: current.wave_period,
      direction: current.wave_direction
    };

    $("#wave-height").textContent = sea.height.toFixed(1);
    $("#wave-period").textContent = sea.period.toFixed(1);

    $("#wave-direction").textContent =
      Math.round(sea.direction);

    $("#arrow").style.transform =
      `rotate(${sea.direction}deg)`;

    const mood = moodForHeight(sea.height);

    document.body.dataset.mood = mood;

    $("#mood").textContent =
      `${mood.toUpperCase()} SEA`;

    $("#model-time").textContent =
      `Model time: ${current.time.replace("T", " ")} UTC`;

    lastFetched = Date.now();

    const localTime = new Date(lastFetched).toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

    $("#fetched-time").textContent =
      `Fetched: ${localTime} (your time)`;

    $("#status").textContent =
      "Sea connected. These values shape the scene below.";

    updateAudio();

    if (reducedMotion.matches) {
      amplitude = targetAmplitude();
      drawOcean();
    }
  } catch (error) {
    if (id !== requestID) return;

    $("#status").textContent = sea
      ? "Refresh failed. Keeping this coast’s last loaded data. Try again."
      : "Sea data unavailable. Check your connection and try Refresh sea.";

    console.warn("Marine request:", error.message);
  } finally {
    clearTimeout(timeout);

    if (id === requestID) {
      loading = false;

      $("#refresh").disabled = false;
      $("#sound").disabled = !sea || soundBusy;

      $(".data-panel").setAttribute("aria-busy", "false");
    }
  }
}

/* 3. Draw data-driven waves */

function targetAmplitude() {
  if (!sea) return 0;

  return Math.min(
    height * 0.15,
    sea.height * Math.min(width / 24, 25)
  );
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();

  width = bounds.width;
  height = bounds.height;

  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    2
  );

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  ctx.setTransform(
    pixelRatio,
    0,
    0,
    pixelRatio,
    0,
    0
  );

  if (reducedMotion.matches) {
    amplitude = targetAmplitude();
  }

  drawOcean();
}

function drawOcean() {
  ctx.clearRect(0, 0, width, height);

  // Never present invented values as real marine data.
  if (!sea) return;

  const colours = {
    calm: [138, 224, 209],
    moderate: [132, 191, 231],
    energetic: [186, 169, 234]
  };

  const mood = moodForHeight(sea.height);
  const rgb = colours[mood].join(",");

  // API direction is the bearing waves come from.
  // Its east/west component guides the sideways animation.
  const lateral =
    -Math.sin(sea.direction * Math.PI / 180);

  const mobile = width < 560;

  for (let layer = 0; layer < 16; layer++) {
    const baseline =
      height * (mobile ? 0.78 : 0.49) +
      layer * (mobile ? 6 : 10);

    ctx.beginPath();

    for (let x = 0; x <= width + 6; x += 6) {
      const position = x / width;

      // Keep the waves quieter behind the title on desktop.
      const envelope = mobile
        ? 0.8
        : 0.22 + 0.78 * Math.pow(position, 1.3);

      const primaryWave = Math.sin(
        position * 7.4 -
        phase * lateral +
        layer * 0.18
      );

      const secondaryWave = Math.sin(
        position * 13 +
        phase * 0.55 +
        layer * 0.12
      );

      const y =
        baseline +
        envelope *
        amplitude *
        (primaryWave + 0.34 * secondaryWave);

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    const opacity = 0.12 + layer * 0.017;

    ctx.strokeStyle = `rgba(${rgb}, ${opacity})`;
    ctx.lineWidth = layer % 5 === 0 ? 1.5 : 0.7;

    ctx.stroke();

    if (layer === 15) {
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();

      const fill = ctx.createLinearGradient(
        0,
        baseline - amplitude,
        0,
        height
      );

      fill.addColorStop(0, `rgba(${rgb}, 0.10)`);
      fill.addColorStop(1, `rgba(${rgb}, 0)`);

      ctx.fillStyle = fill;
      ctx.fill();
    }
  }
}

function animate(timestamp) {
  const seconds = lastFrame
    ? Math.min((timestamp - lastFrame) / 1000, 0.05)
    : 0;

  lastFrame = timestamp;

  if (!document.hidden && !reducedMotion.matches) {
    if (sea) {
      // Longer wave periods create slower visual breathing.
      const period = clamp(sea.period || 1, 1, 25);

      phase += seconds * Math.PI * 2 / period;
    }

    // Smooth changes instead of suddenly jumping to a new height.
    amplitude +=
      (targetAmplitude() - amplitude) *
      (1 - Math.exp(-seconds * 3));

    drawOcean();
  }

  requestAnimationFrame(animate);
}

/* 4. Synthesized ocean audio */

/*
  Filtered noise creates a soft surf texture.
  A slow oscillator shapes its swell.

  Wave height controls intensity and tone.
  Wave period controls the duration of each swell.
*/

function createAudio() {
  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio is unavailable");
  }

  const ac = new AudioContextClass();

  const buffer = ac.createBuffer(
    1,
    ac.sampleRate * 5,
    ac.sampleRate
  );

  const samples = buffer.getChannelData(0);

  let previous = 0;

  for (let i = 0; i < samples.length; i++) {
    const random = Math.random() * 2 - 1;

    previous = (previous + random * 0.025) / 1.025;
    samples[i] = previous * 6;
  }

  const source = ac.createBufferSource();

  source.buffer = buffer;
  source.loop = true;

  const filter = ac.createBiquadFilter();

  filter.type = "lowpass";
  filter.Q.value = 0.4;

  const swell = ac.createGain();
  swell.gain.value = 0.65;

  const lfo = ac.createOscillator();
  lfo.type = "sine";

  const depth = ac.createGain();
  depth.gain.value = 0.28;

  const master = ac.createGain();
  master.gain.value = 0;

  const limiter = ac.createDynamicsCompressor();

  source
    .connect(filter)
    .connect(swell)
    .connect(master)
    .connect(limiter)
    .connect(ac.destination);

  lfo.connect(depth).connect(swell.gain);

  source.start();
  lfo.start();

  return {
    ac,
    filter,
    lfo,
    master
  };
}

function updateAudio() {
  if (!audio) return;

  const now = audio.ac.currentTime;
  const level = Number($("#volume").value) / 100;

  const intensity = sea
    ? clamp(0.12 + sea.height * 0.09, 0.12, 0.45)
    : 0;

  const gain =
    soundOn && sea && !document.hidden
      ? level * intensity
      : 0;

  // Fade changes to avoid sudden audio jumps.
  audio.master.gain.setTargetAtTime(
    gain,
    now,
    0.35
  );

  if (sea) {
    const frequency = clamp(
      450 + sea.height * 200,
      450,
      1800
    );

    audio.filter.frequency.setTargetAtTime(
      frequency,
      now,
      0.5
    );

    const period = clamp(sea.period || 1, 1, 25);

    audio.lfo.frequency.setTargetAtTime(
      1 / period,
      now,
      0.5
    );
  }
}

async function toggleSound() {
  if (!sea || soundBusy) return;

  soundBusy = true;
  $("#sound").disabled = true;

  try {
    // Audio is only created after a deliberate button click.
    if (!audio) {
      audio = createAudio();
    }

    if (!soundOn) {
      await audio.ac.resume();
    }

    soundOn = !soundOn;

    $("#sound").setAttribute(
      "aria-pressed",
      String(soundOn)
    );

    $("#sound").innerHTML = soundOn
      ? 'Mute sound <span aria-hidden="true">♪</span>'
      : 'Enable sound <span aria-hidden="true">♪</span>';

    $("#audio-status").textContent = soundOn
      ? "Sound on. Wave height and period shape the synthesized surf."
      : "Sound is off. Enable it to hear this sea.";

    updateAudio();
  } catch (error) {
    soundOn = false;

    $("#sound").setAttribute("aria-pressed", "false");

    $("#sound").innerHTML =
      'Enable sound <span aria-hidden="true">♪</span>';

    $("#audio-status").textContent =
      "Audio could not start. Try again or use another browser.";

    updateAudio();
  } finally {
    soundBusy = false;
    $("#sound").disabled = !sea;
  }
}

/* 5. User interactions */

$("#coast").addEventListener("change", () => {
  updateLocation();
  resetSea();
  loadSeaData();
});

$("#refresh").addEventListener("click", loadSeaData);

$("#sound").addEventListener("click", toggleSound);

$("#volume").addEventListener("input", () => {
  $("#volume-value").textContent =
    `${$("#volume").value}%`;

  updateAudio();
});

/* 6. Refresh and visibility handling */

setInterval(() => {
  if (!document.hidden && !loading) {
    loadSeaData();
  }
}, AUTO_REFRESH);

document.addEventListener("visibilitychange", () => {
  // Silence the sound when the visitor moves to another tab.
  updateAudio();

  const refreshDue =
    Date.now() - lastFetched >= AUTO_REFRESH;

  if (!document.hidden && !loading && refreshDue) {
    loadSeaData();
  }
});

new ResizeObserver(resizeCanvas).observe(canvas);

reducedMotion.addEventListener("change", () => {
  amplitude = targetAmplitude();
  drawOcean();
});

/* 7. Start the experience */

updateLocation();
resizeCanvas();
loadSeaData();

requestAnimationFrame(animate);