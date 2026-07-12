// site-header.js
// MCBattle.jp shared header / navigation

(function () {
  function getBasePrefix() {
    const path = window.location.pathname || "";

    if (
      path.includes("/detail_mc/") ||
      path.includes("/detail_event/")
    ) {
      return "../";
    }

    return "./";
  }

  function getCurrentSection() {
    const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    const path = window.location.pathname.toLowerCase();

    if (file === "list_event.html" || path.includes("/detail_event/")) {
      return "events";
    }

    if (file === "list_mc.html" || path.includes("/detail_mc/")) {
      return "mcs";
    }

    if (file === "score_ranking.html" || file === "score_spec.html") {
      return "score";
    }

    if (file === "prize_ranking.html") {
      return "prize";
    }

    return "";
  }

  function createHeader() {
    const base = getBasePrefix();
    const current = getCurrentSection();

    return `
      <header class="home-header">
        <div class="home-header-inner">
          <h1 class="home-logo">
            <a href="${base}">MCBattle.jp</a>
          </h1>

          <p class="home-lead">
            日本一情報量の多いMCバトルポータル。<br>
            大会記録・戦績・独自スコアをまとめています。
          </p>
        </div>
      </header>

      <div class="home-tabs-slot" data-site-tabs-slot>
        <div class="home-tabs-fixed-layer" data-site-tabs-layer>
          <div class="home-header-inner">
            <nav class="home-tabs" aria-label="主要メニュー">
              <div class="home-tabs-row home-tabs-row-primary">
                <a
                  class="home-tab home-tab-events ${current === "events" ? "is-current" : ""}"
                  href="${base}list_event.html"
                >
                  <span class="home-tab-text">大会一覧</span>
                </a>

                <a
                  class="home-tab home-tab-mcs ${current === "mcs" ? "is-current" : ""}"
                  href="${base}list_mc.html"
                >
                  <span class="home-tab-text">MC一覧</span>
                </a>

                <a
                  class="home-tab home-tab-score ${current === "score" ? "is-current" : ""}"
                  href="${base}score_ranking.html"
                >
                  <span class="home-tab-text">スコア</span>
                </a>

                <a
                  class="home-tab home-tab-prize ${current === "prize" ? "is-current" : ""}"
                  href="${base}prize_ranking.html"
                >
                  <span class="home-tab-text">賞金</span>
                </a>
              </div>
            </nav>
          </div>
        </div>
      </div>
    `;
  }

  function setupFixedNavigation() {
    const slot = document.querySelector("[data-site-tabs-slot]");
    const layer = document.querySelector("[data-site-tabs-layer]");

    if (!slot || !layer) return;

    let slotTop = 0;
    let layerHeight = 0;
    let ticking = false;

    function measure() {
      slot.classList.remove("is-fixed");
      slot.style.removeProperty("--site-tabs-height");

      const rect = slot.getBoundingClientRect();
      slotTop = rect.top + window.scrollY;
      layerHeight = layer.getBoundingClientRect().height;

      slot.style.setProperty("--site-tabs-height", `${layerHeight}px`);
      update();
    }

    function update() {
      const shouldFix = window.scrollY >= slotTop;

      slot.classList.toggle("is-fixed", shouldFix);
      document.documentElement.classList.toggle("has-fixed-site-tabs", shouldFix);
    }

    function requestUpdate() {
      if (ticking) return;

      ticking = true;
      window.requestAnimationFrame(function () {
        update();
        ticking = false;
      });
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", measure);

    measure();
  }

  function mountHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    mount.innerHTML = createHeader();
    setupFixedNavigation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountHeader);
  } else {
    mountHeader();
  }
})();
