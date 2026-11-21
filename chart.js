/* Hand-drawn charts — no library. */
(function (global) {
  function dprCanvas(canvas, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor((cssH || rect.height || 180) * dpr));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: cssH || rect.height || 180 };
  }

  function lineChart(canvas, points, opts) {
    opts = opts || {};
    const { ctx, w, h } = dprCanvas(canvas, 180);
    ctx.clearRect(0, 0, w, h);
    const pad = 12;
    if (!points || points.length < 1) {
      ctx.strokeStyle = "rgba(235,235,245,0.3)";
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(pad, h / 2);
      ctx.lineTo(w - pad, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(235,235,245,0.3)";
      ctx.font = "13px -apple-system, sans-serif";
      ctx.fillText(opts.emptyText || "Waiting for the first trade", pad, h / 2 - 10);
      return;
    }
    const ys = points.map((p) => p.v);
    let min = Math.min(...ys), max = Math.max(...ys);
    if (min === max) { min -= 1; max += 1; }
    const x0 = pad, x1 = w - pad, y0 = h - pad, y1 = pad + 8;
    function X(i) { return x0 + (i / Math.max(1, points.length - 1)) * (x1 - x0); }
    function Y(v) { return y0 - ((v - min) / (max - min)) * (y0 - y1); }
    // start dashed
    const startY = Y(points[0].v);
    ctx.strokeStyle = "rgba(235,235,245,0.3)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x0, startY); ctx.lineTo(x1, startY); ctx.stroke();
    ctx.setLineDash([]);
    // fill
    ctx.beginPath();
    points.forEach((p, i) => { const x = X(i), y = Y(p.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.lineTo(X(points.length - 1), y0);
    ctx.lineTo(X(0), y0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y1, 0, y0);
    g.addColorStop(0, "rgba(0,211,90,0.28)");
    g.addColorStop(1, "rgba(0,211,90,0)");
    ctx.fillStyle = g; ctx.fill();
    // line
    ctx.strokeStyle = "#00d35a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => { const x = X(i), y = Y(p.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    // marks
    (opts.marks || []).forEach((m) => {
      if (m.i < 0 || m.i >= points.length) return;
      const x = X(m.i), y = Y(points[m.i].v) - (m.row || 0) * 14;
      ctx.fillStyle = m.color || "#0a84ff";
      ctx.font = "11px -apple-system, sans-serif";
      ctx.fillText(m.text, Math.min(x, w - 80), Math.max(12, y - 6));
    });
  }

  function scoreRing(canvas, score) {
    const { ctx, w, h } = dprCanvas(canvas, 72);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 6;
    ctx.strokeStyle = "#2c2c2e"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const t = Math.max(0, Math.min(100, score || 0)) / 100;
    ctx.strokeStyle = score >= 70 ? "#00d35a" : "#ffd60a";
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "600 18px -apple-system, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(score == null ? "—" : score), cx, cy);
  }

  global.DeskCharts = { lineChart, scoreRing };
})(window);
