(function () {
  const BASE = (function () {
    // Project Pages live under /Desk-app/
    const p = location.pathname;
    if (p.includes("/Desk-app")) {
      return location.origin + "/Desk-app";
    }
    // local file or root
    const i = p.lastIndexOf("/");
    return location.origin + (i > 0 ? p.slice(0, i) : "");
  })();

  function getDataPath() {
    // Prefer #d= (fragment). Backup: ?d= query (survives some home-screen launches).
    // Then localStorage for this standalone context.
    let d = "";
    const hash = location.hash || "";
    const hm = hash.match(/[#&]d=([^&]+)/);
    if (hm) d = decodeURIComponent(hm[1]);
    if (!d) {
      try {
        const q = new URLSearchParams(location.search).get("d");
        if (q) d = q;
      } catch (e) {}
    }
    if (d) {
      try { localStorage.setItem("desk_data_path", d); } catch (e) {}
      return d;
    }
    try { return localStorage.getItem("desk_data_path") || ""; } catch (e) { return ""; }
  }

  let DATA_PATH = getDataPath();
  let state = null;
  let lastOk = null;
  let chartRange = "LIVE";
  let pollTimer = null;

  const $ = (id) => document.getElementById(id);

  function dataUrl(path) {
    return `${BASE}/d/${DATA_PATH}/${path}`;
  }

  async function fetchJson(path) {
    const r = await fetch(dataUrl(path), { cache: "no-store" });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return r.json();
  }

  function showErr(msg) {
    const el = $("err");
    if (!msg) { el.style.display = "none"; return; }
    el.style.display = "block";
    el.textContent = msg;
  }

  function ago(ts) {
    if (!ts) return "—";
    const t = Date.parse(ts);
    if (!t) return "—";
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return "updated just now";
    return `updated ${m} min ago`;
  }

  function money(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderHome() {
    if (!state) return;
    const mode = state.mode || "PAPER";
    $("mode-pill").textContent = mode;
    $("mode-pill").className = "pill " + (mode === "LIVE" ? "live" : "paper");
    $("balance").textContent = money(state.balance);
    const pct = state.today_pct;
    $("today-pct").textContent = (pct == null ? "—" : ((pct >= 0 ? "+" : "") + pct.toFixed(2) + "%"));
    $("today-pct").style.color = pct >= 0 ? "var(--green)" : "var(--red)";
    $("mult").textContent = (state.multiplier == null ? "—" : state.multiplier.toFixed(2) + "×");
    $("updated").textContent = ago(state.updated_at);
    $("agents-running").textContent = String((state.agents || []).filter(a => a.status === "running").length || 5);

    const points = (state.chart && state.chart[chartRange]) || state.chart_points || [];
    DeskCharts.lineChart($("home-chart"), points, {
      marks: state.chart_marks || [],
      emptyText: "Waiting for the first trade",
    });

    const car = $("agent-carousel");
    car.innerHTML = "";
    (state.agents || []).forEach((a) => {
      const div = document.createElement("div");
      div.className = "agent-card " + a.name;
      const dot = a.status === "paused" ? "pause" : (a.status === "running" ? "on" : "off");
      div.innerHTML = `
        <div class="name"><span class="dot ${dot}"></span><span class="accent">${a.label || a.name}</span></div>
        <div class="tabular" style="font-size:22px;font-weight:600">${a.headline || "—"}</div>
        <div style="color:var(--secondary);font-size:13px;margin-top:6px">${a.subtitle || ""}</div>
        ${a.layers ? `<div class="layers">${a.layers.map(l =>
          `<div class="layer ${l.pass === true ? "ok" : l.pass === false ? "bad" : ""}">${l.n}. ${l.value || "—"}</div>`
        ).join("")}</div>` : ""}
        ${a.name === "analyst" ? `<canvas class="score-ring" width="72" height="72" data-score="${a.score ?? ""}"></canvas>` : ""}
      `;
      car.appendChild(div);
      const c = div.querySelector("canvas.score-ring");
      if (c) DeskCharts.scoreRing(c, a.score);
    });

    renderActivityList($("home-activity"), (state.activity || []).slice(0, 5));
  }

  function renderActivityList(el, rows) {
    if (!rows || !rows.length) {
      el.innerHTML = `<div class="empty">Nothing yet tonight</div>`;
      return;
    }
    el.innerHTML = rows.map((r) => `
      <div class="activity-row" data-mint="${r.mint || ""}" data-kind="${r.kind || ""}">
        <div class="mid">
          <div class="title">${escapeHtml(r.title || "")}</div>
          <div class="sub">${escapeHtml(r.subtitle || "")}</div>
        </div>
        <div class="val tabular">${escapeHtml(r.value || "")}</div>
      </div>
    `).join("");
    el.querySelectorAll(".activity-row").forEach((row) => {
      row.addEventListener("click", () => {
        const mint = row.getAttribute("data-mint");
        const kind = row.getAttribute("data-kind");
        if (!mint) return;
        if (kind === "rejected") openAuditor(mint);
        else openCoin(mint);
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function renderAgents() {
    const el = $("agents-list");
    if (!state || !state.agents) {
      el.innerHTML = `<div class="empty">Listening for graduations</div>`;
      return;
    }
    el.innerHTML = state.agents.map((a) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div><span class="dot ${a.status === "running" ? "on" : a.status === "paused" ? "pause" : "off"}"></span><strong>${a.label || a.name}</strong></div>
          <span class="pill" style="color:var(--secondary)">${a.status || "—"}</span>
        </div>
        <div class="tabular" style="margin-top:8px">${a.headline || ""}</div>
        <div style="color:var(--secondary);font-size:13px;margin-top:4px">${a.subtitle || ""}</div>
        <div style="margin-top:10px;font-size:12px;color:var(--tertiary)">Last decisions</div>
        ${(a.decisions || []).slice(0, 8).map((d) =>
          `<div class="row-kv"><span class="k">${escapeHtml(d.ts || "")} · ${escapeHtml(d.coin || "")}</span><span>${escapeHtml(d.verdict || "")} ${escapeHtml(d.reason || "")}</span></div>`
        ).join("") || `<div class="empty" style="padding:8px">None yet</div>`}
        <p class="muted" style="padding:8px 0 0">Telegram: pause ${a.name} / resume ${a.name}</p>
      </div>
    `).join("");
  }

  function renderActivity() {
    renderActivityList($("activity-list"), (state && state.activity) || []);
  }

  function renderAccount() {
    const a = (state && state.account) || {};
    $("account-card").innerHTML = `
      <div class="row-kv"><span class="k">Mode</span><span>${escapeHtml(a.mode || state?.mode || "PAPER")} (Telegram: paper / LIVE)</span></div>
      <div class="row-kv"><span class="k">Stack</span><span class="tabular">${money(a.stack)}</span></div>
      <div class="row-kv"><span class="k">Stop</span><span class="tabular">-${a.stop_pct ?? "—"}%</span></div>
      <div class="row-kv"><span class="k">Trail</span><span class="tabular">${a.trail_pct ?? "—"}%</span></div>
      <div class="row-kv"><span class="k">Analyst</span><span>${escapeHtml(a.analyst_mode || "rules")}</span></div>
      <div class="row-kv"><span class="k">Notifier</span><span>telegram (Plan B — no web push)</span></div>
      <div class="row-kv"><span class="k">FOMO</span><span>@${escapeHtml(a.fomo_handle || "")}</span></div>
    `;
    if (a.profile_url) $("btn-profile").href = a.profile_url;
    if (a.signup_url) $("btn-invite").href = a.signup_url;
  }

  async function openAuditor(mint) {
    showScreen("auditor");
    const body = $("auditor-body");
    body.innerHTML = `<div class="loading"><div class="pulse"></div></div>`;
    try {
      const data = await fetchJson(`audit/${mint}.json`);
      body.innerHTML = `
        <div style="font-weight:600;margin-bottom:8px">${escapeHtml(data.name || mint.slice(0, 8))}</div>
        <div style="color:var(--secondary);font-size:13px;margin-bottom:10px">${data.passed ? "Cleared · 8/8 parts" : "Rejected · " + escapeHtml(data.reason || "")}</div>
        ${(data.layers || []).map((l) =>
          `<div class="row-kv"><span class="k">${l.n}. ${escapeHtml(l.name)}</span><span class="${l.pass ? "" : ""}" style="color:${l.pass ? "var(--green)" : "var(--red)"}">${escapeHtml(l.value)}</span></div>`
        ).join("")}
      `;
      if (data.coin_url) $("aud-fomo").href = data.coin_url;
    } catch (e) {
      body.innerHTML = `<div class="empty">No coin taken apart yet</div>`;
    }
  }

  async function openCoin(mint) {
    showScreen("coin");
    $("coin-title").textContent = mint.slice(0, 8) + "…";
    try {
      const data = await fetchJson(`coin/${mint}.json`);
      $("coin-title").textContent = data.name || data.symbol || mint.slice(0, 8);
      $("coin-price").textContent = data.price != null ? Number(data.price).toPrecision(4) : "—";
      $("coin-sub").textContent = `${data.symbol || ""} · Solana · ${data.age || ""}`;
      DeskCharts.lineChart($("coin-chart"), data.candles || [], { emptyText: "No candles yet" });
      $("coin-stats").innerHTML = `
        <div class="row-kv"><span class="k">Market cap</span><span>${money(data.market_cap)}</span></div>
        <div class="row-kv"><span class="k">Liquidity</span><span>${money(data.liquidity)}</span></div>
        <div class="row-kv"><span class="k">Holders</span><span>${data.holders ?? "n/a"}</span></div>
      `;
      if (data.position) {
        $("coin-pos").innerHTML = `
          <div style="font-weight:600">Your position · ${money(data.position.size_usd)}</div>
          <div class="row-kv"><span class="k">Entry</span><span>${data.position.entry_price}</span></div>
          <div class="row-kv"><span class="k">Stop</span><span>${data.position.stop_price}</span></div>
        `;
        $("coin-fomo").textContent = "Sell on FOMO";
      } else {
        $("coin-pos").innerHTML = `<div class="empty" style="padding:8px">No open position</div>`;
        $("coin-fomo").textContent = "Buy on FOMO";
      }
      if (data.coin_url) $("coin-fomo").href = data.coin_url;
      $("coin-paper").style.display = (state && state.mode === "LIVE") ? "none" : "inline-flex";
    } catch (e) {
      $("coin-stats").innerHTML = `<div class="empty">Coin data not published yet</div>`;
    }
  }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    const map = { home: "screen-home", agents: "screen-agents", activity: "screen-activity", account: "screen-account", auditor: "screen-auditor", coin: "screen-coin" };
    $(map[name]).classList.add("active");
  }

  async function refresh() {
    if (!DATA_PATH) {
      showErr(
        "This Home Screen icon is missing your private desk key. " +
        "Delete this icon, open the full private link in Safari " +
        "(it has ?d=… and #d=…), wait until your balance loads, " +
        "then Share → Add to Home Screen again. Don’t share that link."
      );
      return;
    }
    try {
      state = await fetchJson("state.json");
      showErr(null);
      lastOk = new Date();
      renderHome();
      renderAgents();
      renderActivity();
      renderAccount();
    } catch (e) {
      const last = lastOk ? lastOk.toLocaleTimeString() : "never";
      showErr(`Desk offline · retrying in 30s · last update ${last}`);
      // keep last good numbers on screen
    }
  }

  function bind() {
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => showScreen(t.dataset.tab));
    });
    $("btn-avatar").addEventListener("click", () => showScreen("account"));
    $("aud-back").addEventListener("click", () => showScreen("activity"));
    $("coin-back").addEventListener("click", () => showScreen("home"));
    $("chart-range").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-r]");
      if (!b) return;
      chartRange = b.dataset.r;
      [...$("chart-range").querySelectorAll("button")].forEach((x) => x.classList.toggle("on", x === b));
      renderHome();
    });
  }

  bind();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  refresh();
  // Poll often for "updated N min ago"; JSON itself only refreshes every ~8 min on Pages
  pollTimer = setInterval(refresh, 30000);
  setInterval(() => { if (state) $("updated").textContent = ago(state.updated_at); }, 15000);
})();
