/**
 * Confetti discret, în culorile bancnotelor, fără biblioteci: un canvas peste pagină, ~1,6 secunde.
 * Nu rulează dacă utilizatorul a cerut mișcare redusă.
 */
const COLORS = ["#3D7A4E", "#6A4E99", "#B5456A", "#E4B74C", "#2E5C8A", "#F7F0DA"];

export function confetti(opts: { x?: number; y?: number; count?: number } = {}) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "200" });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.remove();
  ctx.scale(dpr, dpr);

  const ox = opts.x ?? innerWidth / 2;
  const oy = opts.y ?? innerHeight / 3;
  const parts = Array.from({ length: opts.count ?? 140 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 7 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      coin: Math.random() < 0.18, // câțiva „bănuți” rotunzi
    };
  });

  const start = performance.now();
  const DURATION = 1700;
  const frame = (now: number) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / DURATION);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.coin) {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.w / 2, (p.w / 2) * Math.abs(Math.cos(p.rot * 2)) + 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (t < DURATION) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

/** Sărbătorește o singură dată pentru o cheie (ex. un obiectiv atins), ținut minte pe dispozitiv. */
export function celebrateOnce(key: string, opts?: Parameters<typeof confetti>[0]) {
  try {
    const k = `leuta-sarbatorit:${key}`;
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, new Date().toISOString());
  } catch {
    return false;
  }
  confetti(opts);
  return true;
}
