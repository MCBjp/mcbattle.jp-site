const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const DATA_PATH = path.join(ROOT_DIR, "data", "events.json");
const OUTPUT_PATH = path.join(ROOT_DIR, "list_event.html");

const PAGE_TITLE = "MCバトル大会一覧 | UMB・KOK・戦極・凱旋などの結果まとめ | MCBattle.jp";
const PAGE_DESCRIPTION = "UMB、KOK、戦極MC BATTLE、凱旋MC battle、ADRENALINEなど国内MCバトル大会の結果一覧。開催日、優勝者、準優勝者、試合結果、賞金情報をカテゴリ別に掲載しています。";
const CANONICAL_URL = "https://mcbattle.jp/list_event.html";
const SITE_NAME = "MCBattle.jp";
const OGP_IMAGE_URL = "https://mcbattle.jp/ogp.png?v=2";

function main() {
  ensureFileExists(DATA_PATH);

  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const payload = JSON.parse(raw);
  const allEvents = Array.isArray(payload.events) ? payload.events : [];

  const today = startOfDay(new Date());

  const events = allEvents
    .filter((event) => {
      const d = getDateValue(event.event_date);
      return d && d.getTime() <= today.getTime();
    });

  const groups = groupEvents(events);
  const html = buildHtml(groups, events);

  fs.writeFileSync(OUTPUT_PATH, html, "utf8");

  console.log(`大会一覧HTML生成完了: ${OUTPUT_PATH}`);
  console.log(`カテゴリ数: ${groups.length}`);
  console.log(`大会数: ${events.length}`);
}

function buildHtml(groups, events) {
  const groupHtml = groups.length
    ? groups.map(buildGroupHtml).join("\n")
    : '<p class="status">大会がありません</p>';

  const jsonLd = buildJsonLd(groups, events);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
  <link rel="apple-touch-icon" href="/favicon-180x180.png">
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${escapeHtml(PAGE_TITLE)}</title>
  <meta name="description" content="${escapeHtml(PAGE_DESCRIPTION)}">
  <link rel="canonical" href="${escapeHtml(CANONICAL_URL)}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:title" content="${escapeHtml(PAGE_TITLE)}" />
  <meta property="og:description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
  <meta property="og:url" content="${escapeHtml(CANONICAL_URL)}" />
  <meta property="og:image" content="${escapeHtml(OGP_IMAGE_URL)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(PAGE_TITLE)}" />
  <meta name="twitter:description" content="${escapeHtml(PAGE_DESCRIPTION)}" />
  <meta name="twitter:image" content="${escapeHtml(OGP_IMAGE_URL)}" />

  <script type="application/ld+json">
${escapeScriptJson(jsonLd)}
  </script>

  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-9C8VGD3THB"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-9C8VGD3THB');
  </script>

  <link rel="stylesheet" href="style.css" />

  <style>
    .home-header{
      position:relative;
      margin-bottom:18px;
      padding:26px 0 0;
      background:
        linear-gradient(120deg, rgba(255,255,255,.035), rgba(255,255,255,.012)),
        radial-gradient(circle at 96% 0%, rgba(216,180,106,.07), transparent 34%);
      border-bottom:1px solid rgba(255,255,255,.14);
      z-index:40;
    }

    .home-header-inner{
      width:min(calc(100% - (var(--page-gutter) * 2)), var(--content-max));
      margin-left:auto;
      margin-right:auto;
    }

    .home-logo{
      margin:0 0 6px;
      font-family:"Times New Roman", Georgia, serif;
      font-style:italic;
      font-size:clamp(2.08rem, 7.8vw, 3.15rem);
      font-weight:800;
      line-height:.95;
      letter-spacing:-.055em;
      color:var(--accent);
      text-shadow:0 10px 26px rgba(0,0,0,.18);
    }

    .home-logo a{
      color:inherit;
      text-decoration:none !important;
    }

    .home-lead{
      margin:0 0 13px;
      color:#f0f2f6;
      font-size:1rem;
      font-weight:700;
      line-height:1.48;
      letter-spacing:-.02em;
    }

    .home-tabs{
      position:relative;
      display:flex;
      align-items:center;
      gap:0;
      width:100%;
      border-top:1px solid rgba(255,255,255,.13);
      border-bottom:1px solid rgba(255,255,255,.13);
      overflow:visible;
      z-index:50;
    }

    .home-tab,
    .home-menu-summary{
      position:relative;
      flex:1 1 0;
      min-width:0;
      padding:11px 8px 12px;
      color:#f3f4f6;
      font-size:.96rem;
      font-weight:800;
      line-height:1.1;
      text-align:center;
      white-space:nowrap;
      opacity:.96;
      transition:color .18s ease, opacity .18s ease;
      cursor:pointer;
      text-decoration:none !important;
    }

    .home-tab:hover,
    .home-menu-summary:hover{
      color:#fff7e8;
      opacity:1;
      text-decoration:none !important;
    }

    .home-menu{
      position:relative;
      flex:1 1 0;
      min-width:0;
    }

    .home-menu summary{
      list-style:none;
    }

    .home-menu summary::-webkit-details-marker{
      display:none;
    }

    .home-menu-summary::after{
      content:"";
      display:inline-block;
      width:0;
      height:0;
      margin-left:5px;
      border-left:4px solid transparent;
      border-right:4px solid transparent;
      border-top:5px solid currentColor;
      transform:translateY(-1px);
      opacity:.75;
    }

    .home-menu[open] .home-menu-summary{
      color:var(--accent);
    }

    .home-menu[open] .home-menu-summary::before{
      content:"";
      position:absolute;
      left:12px;
      right:12px;
      bottom:-1px;
      height:3px;
      border-radius:999px 999px 0 0;
      background:var(--accent);
      box-shadow:0 0 18px rgba(216,180,106,.28);
    }

    .home-submenu{
      position:absolute;
      top:calc(100% + 8px);
      left:50%;
      z-index:80;
      min-width:176px;
      padding:8px;
      border:1px solid rgba(216,180,106,.24);
      border-radius:14px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018)),
        rgba(18,21,30,.98);
      box-shadow:
        0 16px 34px rgba(0,0,0,.34),
        0 0 0 1px rgba(255,255,255,.018) inset;
      transform:translateX(-50%);
    }

    .home-submenu a{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      min-height:38px;
      padding:0 12px;
      border-radius:10px;
      color:#f3f4f6;
      font-size:.9rem;
      font-weight:800;
      line-height:1;
      white-space:nowrap;
      text-decoration:none !important;
      transition:
        background-color .18s ease,
        color .18s ease,
        opacity .18s ease;
    }

    .home-submenu a::after{
      content:"›";
      color:var(--accent);
      font-size:1.15rem;
      line-height:1;
      opacity:.8;
    }

    .home-submenu a:hover{
      background:rgba(216,180,106,.1);
      color:#fff7e8;
      text-decoration:none !important;
    }

    .page-top{
      margin-bottom:14px;
    }

    .page-header-block{
      margin-bottom:14px;
    }

    .page-header-block h1{
      margin:0;
      text-wrap:balance;
      overflow-wrap:anywhere;
      word-break:break-word;
    }

    .event-page-lead {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.72;
      max-width: 820px;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .event-group-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .event-group {
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 18px;
      background: rgba(255,255,255,0.018);
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset;
    }

    .event-group-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 15px;
      border: none;
      background: rgba(255,255,255,0.02);
      color: var(--accent);
      text-align: left;
      cursor: pointer;
      font: inherit;
      transition:
        background-color 0.18s ease,
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        color 0.18s ease,
        transform 0.18s ease;
    }

    .event-group-toggle:hover {
      background: rgba(255,255,255,0.032);
    }

    .event-group-left {
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .event-group-name {
      font-size: 0.98rem;
      font-weight: 800;
      line-height: 1.32;
      color: var(--accent);
      word-break: break-word;
    }

    .event-group-count {
      margin-left: 8px;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .event-group-icon {
      flex: 0 0 auto;
      color: var(--muted);
      font-size: 1.02rem;
      line-height: 1;
      transition: transform 0.18s ease;
    }

    .event-group.is-open .event-group-icon {
      transform: rotate(180deg);
    }

    .event-group-body {
      display: none;
      padding: 0 9px 9px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }

    .event-group.is-open .event-group-body {
      display: block;
    }

    .event-group-description {
      margin: 9px 0 8px;
      padding: 11px 12px;
      border-radius: 14px;
      border: 1px solid rgba(216,180,106,0.22);
      background:
        linear-gradient(180deg, rgba(216,180,106,0.08), rgba(216,180,106,0.025)),
        rgba(255,255,255,0.018);
      color: #c7cedc;
      font-size: 0.84rem;
      line-height: 1.68;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .event-group-description p {
      margin: 0;
    }

    .event-group-description p + p {
      margin-top: 5px;
    }

    .event-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .event-row,
    .event-row:hover,
    .event-row *,
    .event-row:hover * {
      text-decoration: none !important;
    }

    .event-row {
      display: block;
      padding: 9px 10px 8px;
      border-radius: 13px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.018);
      transition:
        transform 0.18s ease,
        border-color 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease,
        color 0.18s ease;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.015) inset;
    }

    .event-row:hover {
      background: rgba(255,255,255,0.032);
      border-color: rgba(255,255,255,0.16);
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0,0,0,0.12);
    }

    .event-date {
      font-size: 0.76rem;
      color: var(--accent);
      margin-bottom: 3px;
      font-weight: 700;
      letter-spacing: 0.04em;
      transition: color 0.18s ease;
    }

    .event-row:hover .event-date {
      color: #f0cd87;
    }

    .event-name {
      font-size: 0.92rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.38;
      word-break: break-word;
      transition: color 0.18s ease;
    }

    .event-row:hover .event-name {
      color: #ffffff;
    }

    .event-winner {
      display: block;
      color: #ffffff;
      font-weight: 700;
    }

    .event-meta {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: 0.78rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .status {
      margin-top: 8px;
      color: var(--muted);
    }

    .status.error {
      color: var(--danger);
    }

    @media (min-width: 1024px){
      .home-header-inner{
        width:min(var(--content-max), calc(100% - var(--pc-left-gutter) - var(--page-gutter)));
        margin-left:var(--pc-left-gutter);
        margin-right:auto;
      }

      .home-logo{
        font-size:3rem;
      }
    }

    @media (max-width: 640px) {
      .home-header{
        margin-bottom:14px;
        padding:38px 0 0;
      }

      .home-header-inner{
        width:calc(100% - 24px);
      }

      .home-logo{
        margin-bottom:5px;
        font-size:2.42rem;
      }

      .home-lead{
        margin-bottom:12px;
        font-size:.96rem;
        line-height:1.42;
        letter-spacing:-.025em;
      }

      .home-tabs{
        margin-left:-1px;
        margin-right:-1px;
      }

      .home-tab,
      .home-menu-summary{
        padding:10px 5px 11px;
        font-size:.9rem;
      }

      .home-menu[open] .home-menu-summary::before{
        left:8px;
        right:8px;
        height:3px;
      }

      .home-submenu{
        min-width:158px;
        top:calc(100% + 7px);
      }

      .home-submenu a{
        min-height:37px;
        font-size:.86rem;
      }

      .page-top{
        margin-bottom:12px;
      }

      .page-header-block{
        margin-bottom:12px;
      }

      .page-header-block h1{
        font-size:clamp(1.5rem, 5.3vw, 1.95rem);
        line-height:1.12;
      }

      .event-page-lead {
        margin-bottom: 11px;
        font-size: 0.86rem;
        line-height: 1.62;
      }

      .event-group-list {
        gap: 6px;
      }

      .event-group {
        border-radius: 16px;
      }

      .event-group-toggle {
        padding: 10px 13px;
      }

      .event-group-body {
        padding: 0 8px 8px;
      }

      .event-group-description {
        margin: 8px 0 7px;
        padding: 10px 11px;
        border-radius: 13px;
        font-size: 0.78rem;
        line-height: 1.58;
      }

      .event-group-description p + p {
        margin-top: 4px;
      }

      .event-row {
        padding: 8px 9px 7px;
        border-radius: 12px;
      }

      .event-group-name {
        font-size: 0.94rem;
      }

      .event-group-count {
        margin-left: 7px;
        font-size: 0.72rem;
      }

      .event-date {
        font-size: 0.72rem;
      }

      .event-name {
        font-size: 0.89rem;
        line-height: 1.34;
      }

      .event-meta {
        font-size: 0.72rem;
      }
    }

    @media (max-width: 390px){
      .home-header-inner{
        width:calc(100% - 20px);
      }

      .home-logo{
        font-size:2.32rem;
      }

      .home-lead{
        font-size:.92rem;
      }

      .home-tab,
      .home-menu-summary{
        padding-left:4px;
        padding-right:4px;
        font-size:.84rem;
      }
    }
  </style>
</head>
<body>
  <header class="home-header">
    <div class="home-header-inner">
      <h1 class="home-logo"><a href="./">MCBattle.jp</a></h1>
      <p class="home-lead">日本一情報量の多いMCバトルポータル。<br>大会記録・戦績・独自スコアをまとめています。</p>

      <nav class="home-tabs" aria-label="主要メニュー">
        <a class="home-tab" href="./">ホーム</a>

        <details class="home-menu" data-menu="data">
          <summary class="home-menu-summary">データ</summary>
          <div class="home-submenu">
            <a href="list_mc.html">MC一覧</a>
            <a href="list_event.html">大会一覧</a>
          </div>
        </details>

        <details class="home-menu" data-menu="ranking">
          <summary class="home-menu-summary">ランキング</summary>
          <div class="home-submenu">
            <a href="score_ranking.html">スコアランキング</a>
            <a href="prize_ranking.html">賞金ランキング</a>
            <a href="score_spec.html">スコアリング仕様</a>
          </div>
        </details>

        <a class="home-tab" href="articles.html">読み物</a>
      </nav>
    </div>
  </header>

  <div class="events-page">
    <div class="page-top">
      <div class="page-header-block">
        <h1>MCバトル大会一覧</h1>
      </div>

      <p class="event-page-lead">
        UMB、KOK、戦極MC BATTLE、凱旋MC battle、ADRENALINEなど、国内MCバトル大会の結果をカテゴリ別に掲載しています。各大会ページでは開催日、優勝者、準優勝者、試合結果、賞金情報を確認できます。
      </p>
    </div>

    <div id="event-list" class="event-group-list">
${indent(groupHtml, 6)}
    </div>
  </div>

  <script>
    function closeOtherMenus(currentMenu) {
      const menus = document.querySelectorAll(".home-menu");
      menus.forEach((menu) => {
        if (menu !== currentMenu) {
          menu.removeAttribute("open");
        }
      });
    }

    function setupHeaderMenus() {
      const menus = document.querySelectorAll(".home-menu");

      menus.forEach((menu) => {
        menu.addEventListener("toggle", () => {
          if (menu.open) {
            closeOtherMenus(menu);
          }
        });
      });

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".home-menu")) return;

        menus.forEach((menu) => {
          menu.removeAttribute("open");
        });
      });
    }

    function attachAccordionEvents() {
      const toggles = document.querySelectorAll(".event-group-toggle");
      toggles.forEach(btn => {
        btn.addEventListener("click", () => {
          const group = btn.closest(".event-group");
          if (!group) return;

          group.classList.toggle("is-open");

          const expanded = group.classList.contains("is-open");
          btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        });
      });
    }

    setupHeaderMenus();
    attachAccordionEvents();
  </script>
</body>
</html>
`;
}

function buildGroupHtml(group, index) {
  const bodyId = `event-group-body-${index}`;
  const rows = group.items.map(buildEventRowHtml).join("\n");
  const descriptionHtml = buildCategoryDescriptionHtml(group.category_description);

  return `<section class="event-group">
  <button
    class="event-group-toggle"
    type="button"
    aria-expanded="false"
    aria-controls="${bodyId}"
  >
    <span class="event-group-left">
      <span class="event-group-name">${escapeHtml(group.category)}</span>
      <span class="event-group-count">${group.items.length}件</span>
    </span>
    <span class="event-group-icon">▼</span>
  </button>
  <div id="${bodyId}" class="event-group-body">
${descriptionHtml ? indent(descriptionHtml, 4) + "\n" : ""}    <div class="event-list">
${indent(rows, 6)}
    </div>
  </div>
</section>`;
}

function buildEventRowHtml(event) {
  const id = toStr(event.event_id);
  const name = getName(event);
  const winnerName = getWinnerName(event);
  const date = formatDate(event.event_date);
  const location = toStr(event.location).trim();
  const prize = formatPrize(event.prize_money_winner);

  const href = id ? `detail_event/${encodeURIComponent(id)}.html` : "list_event.html";
  const winnerHtml = winnerName
    ? `<span class="event-winner">（${escapeHtml(winnerName)}）</span>`
    : "";

  const metaParts = [];
  if (location) metaParts.push(location);
  if (prize) metaParts.push(`優勝賞金 ${prize}`);

  const metaHtml = metaParts.length
    ? `<span class="event-meta">${escapeHtml(metaParts.join(" / "))}</span>`
    : "";

  return `<a class="event-row" href="${escapeHtml(href)}">
  <div class="event-date">${escapeHtml(date)}</div>
  <div class="event-name">
    ${escapeHtml(name)}
    ${winnerHtml}
    ${metaHtml}
  </div>
</a>`;
}

function buildCategoryDescriptionHtml(description) {
  const text = toStr(description).trim();
  if (!text) return "";

  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  return `<div class="event-group-description">
${indent(lines.map(line => `<p>${escapeHtml(line)}</p>`).join("\n"), 2)}
</div>`;
}

function buildJsonLd(groups, events) {
  const itemList = events
    .slice()
    .sort(compareEventsByDateDesc)
    .slice(0, 200)
    .map((event, index) => {
      const id = toStr(event.event_id);
      const url = id
        ? `https://mcbattle.jp/detail_event/${encodeURIComponent(id)}.html`
        : CANONICAL_URL;

      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        name: getName(event)
      };
    });

  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: CANONICAL_URL,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: "https://mcbattle.jp/"
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: events.length,
      itemListElement: itemList
    },
    about: groups.map(group => ({
      "@type": "Thing",
      name: group.category
    }))
  };

  return JSON.stringify(collection, null, 2);
}

function groupEvents(events) {
  const map = new Map();

  events.forEach(event => {
    const categoryName = getCategoryName(event);
    const categoryDescription = getCategoryDescription(event);
    const key = `${getCategoryShowOrder(event)}__${categoryName}`;

    if (!map.has(key)) {
      map.set(key, {
        category_name: categoryName,
        category_show_order: getCategoryShowOrder(event),
        category_description: categoryDescription,
        items: []
      });
    }

    const group = map.get(key);

    if (!group.category_description && categoryDescription) {
      group.category_description = categoryDescription;
    }

    group.items.push(event);
  });

  const groups = Array.from(map.values()).map(group => {
    return {
      category: group.category_name,
      category_show_order: group.category_show_order,
      category_description: group.category_description,
      items: group.items.slice().sort(compareEventsByDateDesc)
    };
  });

  groups.sort((a, b) => {
    if (a.category_show_order !== b.category_show_order) {
      return a.category_show_order - b.category_show_order;
    }
    return a.category.localeCompare(b.category, "ja");
  });

  return groups;
}

function getName(event) {
  return toStr(event.event_name_full || event.event_name || event.event_name_simple || "");
}

function getWinnerName(event) {
  return toStr(event.winner_name).trim();
}

function getCategoryName(event) {
  return toStr(event.category_name).trim() || toStr(event.event_category).trim() || "その他";
}

function getCategoryDescription(event) {
  return toStr(event.category_description).trim();
}

function getCategoryShowOrder(event) {
  const n = Number(event.category_show_order);
  return Number.isFinite(n) ? n : 999999;
}

function compareEventsByDateDesc(a, b) {
  const da = getDateValue(a.event_date);
  const db = getDateValue(b.event_date);

  if (da && db) return db - da;
  if (da) return -1;
  if (db) return 1;

  return getName(a).localeCompare(getName(b), "ja");
}

function getDateValue(value) {
  if (!value) return null;

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("/");
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  if (!value) return "";

  const s = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}.${m}.${d}`;
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("/");
    return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function formatPrize(value) {
  if (value === null || value === undefined || value === "") return "";

  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return "";

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return "";

  return `¥${n.toLocaleString("ja-JP")}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeScriptJson(jsonText) {
  return String(jsonText)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return String(text)
    .split("\n")
    .map(line => line ? pad + line : line)
    .join("\n");
}

function toStr(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
}

main();
