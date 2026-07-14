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

  const payload = readJson(DATA_PATH);
  const allEvents = Array.isArray(payload.events) ? payload.events : [];
  const today = startOfDay(new Date());

  const events = allEvents.filter((event) => {
    const date = getDateValue(event.event_date);
    return date && date.getTime() <= today.getTime();
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
  <link rel="stylesheet" href="site-header.css" />

  <style>
    .page-top {
      margin-bottom: 14px;
    }

    .page-header-block {
      margin-bottom: 14px;
    }

    .page-header-block h1 {
      margin: 0;
      color: var(--text);
      text-wrap: balance;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .event-page-lead {
      max-width: 820px;
      margin: 0 0 14px;
      color: var(--muted);
      font-size: .95rem;
      line-height: 1.72;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .event-group-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .event-group {
      overflow: hidden;
      border: 1px solid #d9dde3;
      border-radius: 18px;
      background: #ffffff;
      box-shadow:
        0 8px 24px rgba(17, 24, 39, .07),
        0 1px 2px rgba(17, 24, 39, .04);
    }

    .event-group-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 15px;
      border: 0;
      background: #ffffff;
      color: #17191f;
      text-align: left;
      cursor: pointer;
      font: inherit;
      transition:
        background-color .18s ease,
        color .18s ease;
    }

    .event-group-toggle:hover {
      background: #f8fafc;
    }

    .event-group-toggle:focus-visible {
      outline: 2px solid #a97928;
      outline-offset: -2px;
    }

    .event-group-left {
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .event-group-name {
      color: #17191f;
      font-size: .98rem;
      font-weight: 800;
      line-height: 1.32;
      word-break: break-word;
    }

    .event-group-count {
      margin-left: 8px;
      color: #68707d;
      font-size: .78rem;
      font-weight: 700;
      white-space: nowrap;
    }

    .event-group-icon {
      flex: 0 0 auto;
      color: #8a611f;
      font-size: 1.02rem;
      line-height: 1;
      transition: transform .18s ease;
    }

    .event-group.is-open .event-group-icon {
      transform: rotate(180deg);
    }

    .event-group-body {
      display: none;
      padding: 0 9px 9px;
      border-top: 1px solid #e4e7eb;
      background: #ffffff;
    }

    .event-group.is-open .event-group-body {
      display: block;
    }

    .event-group-description {
      margin: 9px 0 8px;
      padding: 11px 12px;
      border: 1px solid #dfc993;
      border-radius: 14px;
      background: #fbf6ea;
      color: #4e4538;
      font-size: .84rem;
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
      padding: 10px 11px 9px;
      border: 1px solid #e1e5ea;
      border-radius: 13px;
      background: #f8fafc;
      box-shadow: 0 1px 2px rgba(17, 24, 39, .035);
      transition:
        transform .18s ease,
        border-color .18s ease,
        background-color .18s ease,
        box-shadow .18s ease;
    }

    .event-row:hover {
      transform: translateY(-1px);
      border-color: #c9ac72;
      background: #fffdf8;
      box-shadow:
        0 8px 20px rgba(17, 24, 39, .08),
        0 0 0 1px rgba(169, 121, 40, .04) inset;
    }

    .event-date {
      margin-bottom: 3px;
      color: #8a611f;
      font-size: .76rem;
      font-weight: 800;
      letter-spacing: .04em;
    }

    .event-row:hover .event-date {
      color: #6d4a16;
    }

    .event-name {
      color: #17191f;
      font-size: .92rem;
      font-weight: 800;
      line-height: 1.38;
      word-break: break-word;
    }

    .event-winner {
      display: block;
      color: #39404a;
      font-weight: 700;
    }

    .event-meta {
      display: block;
      margin-top: 3px;
      color: #68707d;
      font-size: .78rem;
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

    @media (min-width: 1024px) {
      .event-winner {
        display: inline;
        margin-left: .45em;
      }
    }

    @media (max-width: 640px) {
      .page-top {
        margin-bottom: 12px;
      }

      .page-header-block {
        margin-bottom: 12px;
      }

      .page-header-block h1 {
        font-size: clamp(1.5rem, 5.3vw, 1.95rem);
        line-height: 1.12;
      }

      .event-page-lead {
        margin-bottom: 11px;
        font-size: .86rem;
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
        font-size: .78rem;
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
        font-size: .94rem;
      }

      .event-group-count {
        margin-left: 7px;
        font-size: .72rem;
      }

      .event-date {
        font-size: .72rem;
      }

      .event-name {
        font-size: .89rem;
        line-height: 1.34;
      }

      .event-meta {
        font-size: .72rem;
      }
    }
  </style>
</head>
<body>
  <div id="site-header"></div>

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
    document.querySelectorAll(".event-group-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.closest(".event-group");
        if (!group) return;

        group.classList.toggle("is-open");
        button.setAttribute(
          "aria-expanded",
          group.classList.contains("is-open") ? "true" : "false"
        );
      });
    });
  </script>
  <script src="site-header.js"></script>
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

  const href = id
    ? `detail_event/${encodeURIComponent(id)}.html`
    : "list_event.html";

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
  <div class="event-name">${escapeHtml(name)}${winnerHtml}</div>
  ${metaHtml}
</a>`;
}

function buildCategoryDescriptionHtml(description) {
  const lines = toStr(description)
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  return `<div class="event-group-description">
${indent(lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"), 2)}
</div>`;
}

function buildJsonLd(groups, events) {
  const itemList = events
    .slice()
    .sort(compareEventsByDateDesc)
    .slice(0, 200)
    .map((event, index) => {
      const id = toStr(event.event_id);
      return {
        "@type": "ListItem",
        position: index + 1,
        url: id
          ? `https://mcbattle.jp/detail_event/${encodeURIComponent(id)}.html`
          : CANONICAL_URL,
        name: getName(event)
      };
    });

  return JSON.stringify({
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
    about: groups.map((group) => ({
      "@type": "Thing",
      name: group.category
    }))
  }, null, 2);
}

function groupEvents(events) {
  const map = new Map();

  events.forEach((event) => {
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

  return [...map.values()]
    .map((group) => ({
      category: group.category_name,
      category_show_order: group.category_show_order,
      category_description: group.category_description,
      items: group.items.slice().sort(compareEventsByDateDesc)
    }))
    .sort((a, b) => {
      if (a.category_show_order !== b.category_show_order) {
        return a.category_show_order - b.category_show_order;
      }
      return a.category.localeCompare(b.category, "ja");
    });
}

function getName(event) {
  return toStr(
    event.event_name_full ||
    event.event_name ||
    event.event_name_simple ||
    ""
  );
}

function getWinnerName(event) {
  return toStr(event.winner_name).trim();
}

function getCategoryName(event) {
  return (
    toStr(event.category_name).trim() ||
    toStr(event.event_category).trim() ||
    "その他"
  );
}

function getCategoryDescription(event) {
  return toStr(event.category_description).trim();
}

function getCategoryShowOrder(event) {
  const value = Number(event.category_show_order);
  return Number.isFinite(value) ? value : 999999;
}

function compareEventsByDateDesc(a, b) {
  const dateA = getDateValue(a.event_date);
  const dateB = getDateValue(b.event_date);

  if (dateA && dateB) return dateB - dateA;
  if (dateA) return -1;
  if (dateB) return 1;

  return getName(a).localeCompare(getName(b), "ja");
}

function getDateValue(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("/");
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.replace(/-/g, ".");
  }

  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("/");
    return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join(".");
}

function formatPrize(value) {
  if (value === null || value === undefined || value === "") return "";

  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return "";

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return "";

  return `¥${amount.toLocaleString("ja-JP")}`;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`JSONの読み込みに失敗しました: ${filePath}\n${error.message}`);
  }
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
    .map((line) => line ? pad + line : line)
    .join("\n");
}

function toStr(value) {
  return value === null || value === undefined ? "" : String(value);
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
}

main();
