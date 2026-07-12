// site-header.js // MCBattle.jp shared header / navigation

(function () { function getBasePrefix() { const path =
window.location.pathname || ““;

    if (
      path.includes("/detail_mc/") ||
      path.includes("/detail_event/")
    ) {
      return "../";
    }

    return "./";

}

function getCurrentSection() { const file =
(window.location.pathname.split(“/”).pop() ||
“index.html”).toLowerCase(); const path =
window.location.pathname.toLowerCase();

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

function createHeader() { const base = getBasePrefix(); const current =
getCurrentSection();

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
      </header>
    `;

}

function mountHeader() { const mount =
document.getElementById(“site-header”); if (!mount) return;

    mount.innerHTML = createHeader();

}

if (document.readyState === “loading”) {
document.addEventListener(“DOMContentLoaded”, mountHeader); } else {
mountHeader(); } })();
