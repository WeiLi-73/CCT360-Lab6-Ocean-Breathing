const refreshButton = document.querySelector("#refresh-button");
const statusText = document.querySelector("#status");
const heightText = document.querySelector("#wave-height");
const periodText = document.querySelector("#wave-period");
const directionText = document.querySelector("#wave-direction");
const dataTime = document.querySelector("#data-time");

const canvas = document.querySelector("#ocean");
const context = canvas.getContext("2d");

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
);

let width = 0;
let height = 0;
let targetAmplitude = 0;
let amplitude = 0;
let hasData = false;

// A sea location off the Lisbon coast.
const apiURL =
  "https://marine-api.open-meteo.com/v1/marine" +
  "?latitude=38.5&longitude=-9.6" +
  "&current=wave_height,wave_period,wave_direction" +
  "&timezone=GMT";

async function loadSeaData() {
  refreshButton.disabled = true;
  statusText.textContent = "Reading the latest sea conditions…";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(apiURL, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("The marine service could not be reached.");
    }

    const result = await response.json();
    const sea = result.current;

    const values = [
      sea?.wave_height,
      sea?.wave_period,
      sea?.wave_direction
    ];

    if (!values.every(Number.isFinite)) {
      throw new Error("Some sea conditions are unavailable.");
    }

    heightText.textContent = sea.wave_height.toFixed(1);
    periodText.textContent = sea.wave_period.toFixed(1);
    directionText.textContent = Math.round(sea.wave_direction);

    dataTime.textContent =
      `MODEL TIME · ${sea.time.replace("T", " ")} UTC`;

    // Convert wave height in metres into a visible drawing amplitude.
    // Keep a limit so large values do not overwhelm the page.
    targetAmplitude = Math.min(100, sea.wave_height * 22);

    hasData = true;
    statusText.textContent =
      "Sea updated. Wave height now shapes the scene.";

    if (reducedMotion.matches) {
      amplitude = targetAmplitude;
      drawOcean(0);
    }
  } catch (error) {
    statusText.textContent = hasData
      ? "Could not refresh. Showing the last loaded sea conditions."
      : "Could not load sea data. Please try Refresh the sea.";

    console.error("Marine data request failed:", error);
  } finally {
    clearTimeout(timeout);
    refreshButton.disabled = false;
  }
}

function resizeCanvas() {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  width = bounds.width;
  height = bounds.height;

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

  if (reducedMotion.matches) {
    drawOcean(0);
  }
}

function drawOcean(time) {
  context.clearRect(0, 0, width, height);

  // Do not draw a simulated sea before real data arrives.
  if (!hasData) return;

  for (let layer = 0; layer < 5; layer++) {
    const baseline = height * 0.54 + layer * 32;
    const phase = time * (0.00016 + layer * 0.000025);

    context.beginPath();

    for (let x = 0; x <= width + 8; x += 8) {
      const y =
        baseline +
        Math.sin(x * 0.004 + phase + layer * 0.7) *
          amplitude +
        Math.sin(x * 0.008 - phase * 0.7) *
          amplitude * 0.25;

      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();

    const fill = context.createLinearGradient(
      0, baseline - amplitude, 0, height
    );

    fill.addColorStop(0, `rgba(108, 192, 211, ${0.1 + layer * 0.015})`);
    fill.addColorStop(1, "rgba(7, 21, 34, 0.08)");

    context.fillStyle = fill;
    context.fill();

    context.strokeStyle = `rgba(169, 227, 237, ${0.2 - layer * 0.025})`;
    context.lineWidth = 1;
    context.stroke();
  }
}

let previousTime = 0;

function animate(time) {
  const elapsed = previousTime
    ? Math.min(time - previousTime, 64)
    : 16;

  previousTime = time;

  // Smooth the transition when refreshed data changes the wave height.
  amplitude +=
    (targetAmplitude - amplitude) *
    (1 - Math.exp(-elapsed / 500));

  drawOcean(reducedMotion.matches ? 0 : time);
  requestAnimationFrame(animate);
}

refreshButton.addEventListener("click", loadSeaData);
window.addEventListener("resize", resizeCanvas);

resizeCanvas();
requestAnimationFrame(animate);
loadSeaData();