// Live microphone waveform, ported from the ElevenLabs UI LiveWaveform component.
// Source: https://github.com/elevenlabs/ui (apps/www/registry/elevenlabs-ui/ui/live-waveform.tsx)
// MIT License, Copyright (c) ElevenLabs.
// The canvas drawing, the mirrored static-mode spectrum, the edge fade, and the defaults are kept
// as in the component; this app has no React, so only the hook wiring is replaced by a tiny API.

export function createLiveWaveform(container, options = {}) {
  const {
    barWidth = 3,
    barGap = 1,
    barRadius = 1.5,
    barHeight = 4,
    height = 24,
    sensitivity = 1,
    smoothingTimeConstant = 0.8,
    fftSize = 256,
    updateRate = 30,
    barColor = "#E3201F",
    fadeEdges = true,
    fadeWidth = 24,
  } = options;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  container.append(canvas);
  const ctx = canvas.getContext("2d");

  let analyser = null;
  let audioContext = null;
  let animation = 0;
  let bars = [];
  let lastUpdate = 0;
  let needsRedraw = true;
  let gradient = null;
  let lastWidth = 0;

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gradient = null;
    lastWidth = rect.width;
    needsRedraw = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // Static mode: mirror the 5% to 40% frequency slice around the center.
  function updateBars(width) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const relevant = data.slice(Math.floor(data.length * 0.05), Math.floor(data.length * 0.4));
    const halfCount = Math.floor(Math.floor(width / (barWidth + barGap)) / 2);
    if (!halfCount || !relevant.length) return;
    const valueAt = (i) => Math.max(0.05, Math.min(1, (relevant[Math.floor((i / halfCount) * relevant.length)] / 255) * sensitivity));
    const next = [];
    for (let i = halfCount - 1; i >= 0; i -= 1) next.push(valueAt(i));
    for (let i = 0; i < halfCount; i += 1) next.push(valueAt(i));
    bars = next;
  }

  function draw(time) {
    const rect = canvas.getBoundingClientRect();
    if (analyser && time - lastUpdate > updateRate) {
      lastUpdate = time;
      updateBars(rect.width);
      needsRedraw = true;
    }
    if (!needsRedraw) {
      animation = requestAnimationFrame(draw);
      return;
    }
    needsRedraw = Boolean(analyser);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const step = barWidth + barGap;
    const barCount = Math.floor(rect.width / step);
    const centerY = rect.height / 2;
    ctx.fillStyle = barColor;
    for (let i = 0; i < barCount && i < bars.length; i += 1) {
      const value = bars[i] || 0.1;
      const barPx = Math.max(barHeight, value * rect.height * 0.8);
      ctx.globalAlpha = 0.4 + value * 0.6;
      if (barRadius > 0) {
        ctx.beginPath();
        ctx.roundRect(i * step, centerY - barPx / 2, barWidth, barPx, barRadius);
        ctx.fill();
      } else {
        ctx.fillRect(i * step, centerY - barPx / 2, barWidth, barPx);
      }
    }
    if (fadeEdges && fadeWidth > 0 && rect.width > 0) {
      if (!gradient || lastWidth !== rect.width) {
        const fadePercent = Math.min(0.3, fadeWidth / rect.width);
        gradient = ctx.createLinearGradient(0, 0, rect.width, 0);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1 - fadePercent, "rgba(255,255,255,0)");
        gradient.addColorStop(1, "rgba(255,255,255,1)");
        lastWidth = rect.width;
      }
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.globalAlpha = 1;
    animation = requestAnimationFrame(draw);
  }

  /** Starts drawing the given stream, or asks for the microphone when no stream is given. */
  async function start(stream) {
    try {
      const input = stream || await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextConstructor();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothingTimeConstant;
      audioContext.createMediaStreamSource(input).connect(analyser);
      bars = [];
      needsRedraw = true;
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(draw);
      return true;
    } catch {
      analyser = null;
      return false;
    }
  }

  function stop() {
    cancelAnimationFrame(animation);
    animation = 0;
    analyser = null;
    bars = [];
    if (audioContext && audioContext.state !== "closed") audioContext.close().catch(() => {});
    audioContext = null;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    needsRedraw = true;
  }

  return { start, stop, destroy() { stop(); observer.disconnect(); container.replaceChildren(); } };
}
