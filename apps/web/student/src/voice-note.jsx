// Ported from the 21st.dev Voice Note component by ebnsina (MIT).
// Source: https://21st.dev/@ebnsina/components/voice-note
// Changes for this app: the Hugeicons play/pause icons are replaced with inline SVG, the green
// accent becomes the app's navy tokens, the slider is controlled by the test screen, and the
// listening audio passes seekable={false} so the one-play rule still holds. No inline styles,
// because the student app runs under a strict CSP.

const clock = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
};

const Play = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
  </svg>
);

const Pause = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export function VoiceNote({ label, current, duration, paused, finished = false, seekable = true, onToggle, onSeek, failed = false }) {
  if (failed) {
    return <div className="voice-note" id="audio-playback" role="group" aria-label={label}>
      <span className="voice-note__failed">Audio tidak bisa diputar. Periksa koneksi internet, lalu muat ulang halaman.</span>
    </div>;
  }
  return (
    <div className="voice-note" id="audio-playback" role="group" aria-label={label}>
      <button
        type="button"
        className="voice-note__play"
        id="audio-play"
        aria-label={finished ? "Audio sudah selesai" : paused ? "Putar audio" : "Jeda audio"}
        onClick={onToggle}
        disabled={finished}
      >
        {paused || finished ? <Play /> : <Pause />}
      </button>
      <input
        type="range"
        className="voice-note__range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(current, duration || 1)}
        onChange={(event) => onSeek?.(Number(event.target.value))}
        aria-label="Posisi audio"
        aria-valuetext={`${clock(current)} dari ${clock(duration || 0)}`}
        disabled={!seekable}
      />
      <span className="voice-note__time" id="audio-time">{clock(paused && !current ? duration || 0 : current)}</span>
    </div>
  );
}
