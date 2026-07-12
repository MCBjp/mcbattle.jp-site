// site-header.js
// MCBattle.jp shared header / navigation

(function () {
  const FIXED_NAV_ID = "site-fixed-navigation";

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

  function createNavigation(base, current, extraClass = "") {
    return `
      <nav class="home-tabs ${extraClass}" aria-label="主要メニュー">
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
    `;
  }

  function createHeader(base, current) {
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

          <div class="home-tabs-source" data-site-tabs-source>
            ${createNavigation(base, current)}
          </div>
        </div>
      </header>
    `;
  }

  function createFixedNavigation(base, current) {
    const fixed = document.createElement("div");
    fixed.id = FIXED_NAV_ID;
    fixed.className = "home-tabs-fixed";
    fixed.setAttribute("aria-hidden", "true");

    fixed.innerHTML = `
      <div class="home-header-inner">
        ${createNavigation(base, current, "home-tabs-fixed-copy")}
      </div>
    `;

    return fixed;
  }

  function setupFixedNavigation(base, current) {
    const source = document.querySelector("[data-site-tabs-source]");
    if (!source) return;

    const oldFixed = document.getElementById(FIXED_NAV_ID);
    if (oldFixed) oldFixed.remove();

    const fixed = createFixedNavigation(base, current);
    document.body.appendChild(fixed);

    function setFixedVisible(visible) {
      fixed.classList.toggle("is-visible", visible);
      fixed.setAttribute("aria-hidden", visible ? "false" : "true");
      document.documentElement.classList.toggle("has-fixed-site-tabs", visible);
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        function (entries) {
          const entry = entries[0];
          setFixedVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
        },
        {
          root: null,
          threshold: 0
        }
      );

      observer.observe(source);
      return;
    }

    let ticking = false;

    function updateFallback() {
      const rect = source.getBoundingClientRect();
      setFixedVisible(rect.bottom <= 0);
    }

    function requestFallbackUpdate() {
      if (ticking) return;

      ticking = true;
      window.requestAnimationFrame(function () {
        updateFallback();
        ticking = false;
      });
    }

    window.addEventListener("scroll", requestFallbackUpdate, { passive: true });
    window.addEventListener("resize", requestFallbackUpdate);
    updateFallback();
  }

  function mountHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    const base = getBasePrefix();
    const current = getCurrentSection();

    mount.innerHTML = createHeader(base, current);
    setupFixedNavigation(base, current);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountHeader, { once: true });
  } else {
    mountHeader();
  }
})();
