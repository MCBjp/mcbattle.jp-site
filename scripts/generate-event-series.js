const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const DATA_PATH = path.join(ROOT_DIR, "data", "events.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "series");

const SITE_NAME = "MCBattle.jp";
const SITE_URL = "https://mcbattle.jp";
const OGP_IMAGE_URL = "https://mcbattle.jp/ogp.png?v=2";

/**
 * event_categoryシートの定義。
 * URLはこのslugを正とする。
 *
 * groupingは category_id 優先。
 * category_id が events.json にない場合は、category_name / event_category を正規化して照合する。
 * 例:
 * - "UMB 本戦" / "UMB本戦" / "UMB　本戦" は同じ扱い
 * - "戦極MC BATTLE" / "戦極MCBATTLE" は同じ扱い
 * - "凱旋MC battle" / "凱旋MCBattle" は同じ扱い
 */
const CATEGORY_DEFINITIONS = [
  { id: "EVTCat001", name: "UMB 本戦", slug: "umb-main" },
  { id: "EVTCat002", name: "UMB The Choise is yours", slug: "umb-the-choise-is-yours" },
  { id: "EVTCat003", name: "King of Kings 本戦", slug: "king-of-kings-main" },
  { id: "EVTCat004", name: "戦極MC BATTLE", slug: "sengoku-mc-battle" },
  { id: "EVTCat005", name: "凱旋MC battle", slug: "gaisen-mc-battle" },
  { id: "EVTCat006", name: "口喧嘩祭", slug: "kuchigenka-matsuri" },
  { id: "EVTCat007", name: "ADRENALINE", slug: "adrenaline" },
  { id: "EVTCat008", name: "BUTTLE SUMMIT", slug: "buttle-summit" },
  { id: "EVTCat009", name: "NEO GENESIS MC BATTLE", slug: "neo-genesis-mc-battle" },
  { id: "EVTCat010", name: "Spotlight", slug: "spotlight" },
  { id: "EVTCat011", name: "LUSHBOMU MC BATTLE", slug: "lushbomu-mc-battle" },
  { id: "EVTCat012", name: "The罵倒", slug: "the-batou" }
];

const CATEGORY_BY_ID = new Map();
const CATEGORY_BY_NORMALIZED_NAME = new Map();

CATEGORY_DEFINITIONS.forEach((category, index) => {
  const normalizedCategory = {
    ...category,
    show_order: index + 1
  };

  CATEGORY_BY_ID.set(normalizedCategory.id, normalizedCategory);

  const nameKey = normalizeCategoryKey(normalizedCategory.name);
  if (nameKey) {
    CATEGORY_BY_NORMALIZED_NAME.set(nameKey, normalizedCategory);
  }
});

function main() {
  ensureFileExists(DATA_PATH);

  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const payload = JSON.parse(raw);
  const allEvents = Array.isArray(payload.events) ? payload.events : [];

  const today = startOfDay(new Date());

  const events = allEvents.filter((event) => {
    const d = getDateValue(event.event_date);
    return d && d.getTime() <= today.getTime();
  });

  const groups = groupEvents(events);

  // 古いslugで生成されたファイルが残らないように、series配下はいったん作り直す。
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  groups.forEach((group) => {
    const dir = path.join(OUTPUT_DIR, group.slug);
    const outputPath = path.join(dir, "index.html");

    fs.mkdirSync(dir, { recursive: true });

    const html = buildHtml(group);
    fs.writeFileSync(outputPath, html, "utf8");

    console.log(
      `シリーズページ生成完了: ${outputPath} (${group.items.length}件 / ${group.category_id || "no-category-id"} / ${group.category_name})`
    );
  });

  console.log(`シリーズカテゴリ数: ${groups.length}`);
}

function buildHtml(group) {
  const category = group.category_name;
  const canonicalUrl = `${SITE_URL}/series/${group.slug}/`;
  const pageTitle = `${category} 歴代結果一覧 | 優勝者・大会結果まとめ | MCBattle.jp`;
  const pageDescription = `${category}の歴代大会結果一覧。各大会の開催日、優勝者、詳細結果をまとめています。`;

  const latestEvent = group.items[0] || null;
  const rowsHtml = group.items.length
    ? group.items.map(buildEventRowHtml).join("\n")
    : '<tr><td colspan="4" class="series-muted">大会がありません</td></tr>';

  const jsonLd = buildJsonLd(group, canonicalUrl, pageTitle, pageDescription);
  const categoryDescriptionHtml = buildCategoryDescriptionHtml(group.category_description);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" href="/favicon-32x32.png" sizes="32x32">
  <link rel="apple-touch-icon" href="/favicon-180x180.png">
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(pageDescription)}">
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(pageDescription)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${escapeHtml(OGP_IMAGE_URL)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(pageDescription)}" />
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

  <link rel="stylesheet" href="../../style.css" />
  <link rel="stylesheet" href="../../site-header.css" />

  <style>
    .series-page{
      max-width: 980px;
      margin: 0 auto;
      padding: 18px 14px 44px;
    }

    .series-page-top{
      margin-bottom: 14px;
    }

    .series-breadcrumb{
      margin: 0 0 10px;
      color: var(--muted);
      font-size: 0.78rem;
      line-height: 1.5;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-breadcrumb a{
      color: var(--muted);
      text-decoration: none;
    }

    .series-breadcrumb a:hover{
      color: var(--accent);
      text-decoration: none;
    }

    .series-header-block{
      margin-bottom: 12px;
    }

    .series-header-block h1{
      margin: 0;
      text-wrap: balance;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-page-lead{
      margin: 0;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.72;
      max-width: 820px;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-description{
      margin: 11px 0 0;
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

    .series-description p{
      margin: 0;
    }

    .series-description p + p{
      margin-top: 5px;
    }

    .series-summary{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 14px 0;
    }

    .series-summary-card{
      padding: 11px 12px;
      border-radius: 15px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.018);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.015) inset;
    }

    .series-summary-label{
      display: block;
      margin-bottom: 3px;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1.35;
    }

    .series-summary-value{
      display: block;
      color: #ffffff;
      font-size: 1.06rem;
      font-weight: 800;
      line-height: 1.35;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-section{
      margin-top: 9px;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 18px;
      background: rgba(255,255,255,0.018);
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(255,255,255,0.025) inset;
    }

    .series-section-inner{
      padding: 14px 14px 13px;
    }

    .series-section h2{
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 1.08rem;
      line-height: 1.35;
      text-wrap: balance;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .latest-event-card{
      display: block;
      padding: 10px 11px;
      border-radius: 13px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.018);
      text-decoration: none !important;
      transition:
        transform 0.18s ease,
        border-color 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease;
    }

    .latest-event-card:hover{
      background: rgba(255,255,255,0.032);
      border-color: rgba(255,255,255,0.16);
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0,0,0,0.12);
      text-decoration: none !important;
    }

    .latest-event-date{
      color: var(--accent);
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }

    .latest-event-name{
      color: #ffffff;
      font-size: 0.98rem;
      font-weight: 800;
      line-height: 1.36;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .latest-event-meta{
      display: block;
      margin-top: 3px;
      color: var(--muted);
      font-size: 0.78rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-table-wrap{
      overflow-x: auto;
      border-radius: 13px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.012);
    }

    .series-table{
      width: 100%;
      min-width: 580px;
      border-collapse: collapse;
    }

    .series-table th,
    .series-table td{
      padding: 9px 10px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      text-align: left;
      vertical-align: top;
      font-size: 0.82rem;
      line-height: 1.45;
    }

    .series-table th{
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 800;
      white-space: nowrap;
      background: rgba(255,255,255,0.02);
    }

    .series-table tr:last-child td{
      border-bottom: none;
    }

    .series-table a{
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
    }

    .series-table a:hover{
      color: #f0cd87;
      text-decoration: none;
    }

    .series-event-title{
      min-width: 220px;
    }

    .series-date{
      color: var(--accent);
      font-weight: 700;
      white-space: nowrap;
    }

    .series-muted{
      color: var(--muted);
    }

    @media (max-width: 640px){
      .series-page{
        padding: 15px 12px 40px;
      }

      .series-page-top{
        margin-bottom: 12px;
      }

      .series-header-block h1{
        font-size: clamp(1.5rem, 5.3vw, 1.95rem);
        line-height: 1.12;
      }

      .series-page-lead{
        font-size: 0.86rem;
        line-height: 1.62;
      }

      .series-description{
        padding: 10px 11px;
        border-radius: 13px;
        font-size: 0.78rem;
        line-height: 1.58;
      }

      .series-summary{
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin: 12px 0;
      }

      .series-summary-card{
        padding: 9px 9px;
        border-radius: 13px;
      }

      .series-summary-label{
        font-size: 0.66rem;
      }

      .series-summary-value{
        font-size: 0.86rem;
      }

      .series-section{
        border-radius: 16px;
      }

      .series-section-inner{
        padding: 12px 11px 11px;
      }

      .series-section h2{
        font-size: 1rem;
      }

      .latest-event-card{
        padding: 9px 10px;
        border-radius: 12px;
      }

      .latest-event-date{
        font-size: 0.72rem;
      }

      .latest-event-name{
        font-size: 0.92rem;
      }

      .latest-event-meta{
        font-size: 0.72rem;
      }

      .series-table th,
      .series-table td{
        padding: 8px 9px;
        font-size: 0.78rem;
      }
    }
  </style>
</head>
<body>
  <div id="site-header"></div>

  <main class="series-page">
    <div class="series-page-top">
      <nav class="series-breadcrumb" aria-label="パンくずリスト">
        <a href="/">ホーム</a> &gt; <a href="/list_event.html">大会一覧</a> &gt; ${escapeHtml(category)}
      </nav>

      <div class="series-header-block">
        <h1>${escapeHtml(category)} 歴代結果一覧</h1>
      </div>

      <p class="series-page-lead">
        ${escapeHtml(category)}の歴代大会結果をまとめています。各大会の開催日、優勝者、詳細結果を確認できます。
      </p>

${categoryDescriptionHtml ? indent(categoryDescriptionHtml, 6) + "\n" : ""}      <div class="series-summary">
        <div class="series-summary-card">
          <span class="series-summary-label">掲載大会数</span>
          <span class="series-summary-value">${escapeHtml(String(group.items.length))}</span>
        </div>
        <div class="series-summary-card">
          <span class="series-summary-label">最新大会</span>
          <span class="series-summary-value">${escapeHtml(getShortEventLabel(latestEvent))}</span>
        </div>
        <div class="series-summary-card">
          <span class="series-summary-label">最新優勝者</span>
          <span class="series-summary-value">${escapeHtml(getWinnerName(latestEvent) || "-")}</span>
        </div>
      </div>
    </div>

${latestEvent ? indent(buildLatestEventHtml(latestEvent), 4) + "\n" : ""}    <section class="series-section">
      <div class="series-section-inner">
        <h2>${escapeHtml(category)} 歴代大会結果</h2>

        <div class="series-table-wrap">
          <table class="series-table">
            <thead>
              <tr>
                <th>開催日</th>
                <th>大会名</th>
                <th>優勝</th>
                <th>優勝賞金</th>
              </tr>
            </thead>
            <tbody>
${indent(rowsHtml, 14)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </main>

  <script src="../../site-header.js"></script>
</body>
</html>
`;
}

function buildLatestEventHtml(event) {
  const name = getName(event);
  const date = formatDate(event.event_date);
  const href = getEventHref(event);
  const winnerName = getWinnerName(event);
  const prize = formatPrize(event.prize_money_winner);

  const metaParts = [];
  if (winnerName) metaParts.push(`優勝：${winnerName}`);
  if (prize) metaParts.push(`優勝賞金 ${prize}`);

  const metaHtml = metaParts.length
    ? `<span class="latest-event-meta">${escapeHtml(metaParts.join(" / "))}</span>`
    : "";

  return `<section class="series-section">
  <div class="series-section-inner">
    <h2>最新大会</h2>

    <a class="latest-event-card" href="${escapeHtml(href)}">
      <div class="latest-event-date">${escapeHtml(date)}</div>
      <div class="latest-event-name">${escapeHtml(name)}</div>
      ${metaHtml}
    </a>
  </div>
</section>`;
}

function buildEventRowHtml(event) {
  const href = getEventHref(event);
  const name = getName(event);
  const date = formatDate(event.event_date);
  const winnerName = getWinnerName(event);
  const prize = formatPrize(event.prize_money_winner);

  return `<tr>
  <td class="series-date">${escapeHtml(date)}</td>
  <td class="series-event-title"><a href="${escapeHtml(href)}">${escapeHtml(name)}</a></td>
  <td>${winnerName ? escapeHtml(winnerName) : '<span class="series-muted">-</span>'}</td>
  <td>${prize ? escapeHtml(prize) : '<span class="series-muted">-</span>'}</td>
</tr>`;
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

  return `<div class="series-description">
${indent(lines.map(line => `<p>${escapeHtml(line)}</p>`).join("\n"), 2)}
</div>`;
}

function buildJsonLd(group, canonicalUrl, pageTitle, pageDescription) {
  const itemList = group.items
    .slice()
    .sort(compareEventsByDateDesc)
    .slice(0, 200)
    .map((event, index) => {
      return {
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${getEventHref(event)}`,
        name: getName(event)
      };
    });

  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/`
    },
    about: {
      "@type": "Thing",
      name: group.category_name
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: group.items.length,
      itemListElement: itemList
    }
  };

  return JSON.stringify(collection, null, 2);
}

function groupEvents(events) {
  const map = new Map();

  events.forEach(event => {
    const category = resolveCategory(event);
    const key = category.id || normalizeCategoryKey(category.name) || category.name;

    if (!map.has(key)) {
      map.set(key, {
        category_id: category.id,
        category_name: category.name,
        category_show_order: category.show_order,
        category_description: getCategoryDescription(event),
        slug: category.slug,
        items: []
      });
    }

    const group = map.get(key);
    const categoryDescription = getCategoryDescription(event);

    if (!group.category_description && categoryDescription) {
      group.category_description = categoryDescription;
    }

    group.items.push(event);
  });

  const groups = Array.from(map.values()).map(group => {
    return {
      ...group,
      items: group.items.slice().sort(compareEventsByDateDesc)
    };
  });

  groups.sort((a, b) => {
    if (a.category_show_order !== b.category_show_order) {
      return a.category_show_order - b.category_show_order;
    }
    return a.category_name.localeCompare(b.category_name, "ja");
  });

  return groups;
}

function resolveCategory(event) {
  const categoryId = getCategoryId(event);
  if (categoryId && CATEGORY_BY_ID.has(categoryId)) {
    return CATEGORY_BY_ID.get(categoryId);
  }

  const eventCategoryName = getCategoryNameFromEvent(event);
  const normalizedName = normalizeCategoryKey(eventCategoryName);

  if (normalizedName && CATEGORY_BY_NORMALIZED_NAME.has(normalizedName)) {
    return CATEGORY_BY_NORMALIZED_NAME.get(normalizedName);
  }

  const fallbackName = eventCategoryName || "その他";

  return {
    id: categoryId || "",
    name: fallbackName,
    slug: slugify(fallbackName) || "other",
    show_order: getCategoryShowOrder(event)
  };
}

function getCategoryId(event) {
  return toStr(
    event.category_id ||
    event.event_category_id ||
    event.event_category_code ||
    ""
  ).trim();
}

function getCategoryNameFromEvent(event) {
  return toStr(event.category_name).trim() || toStr(event.event_category).trim();
}

function normalizeCategoryKey(value) {
  return toStr(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function getEventHref(event) {
  const id = toStr(event && event.event_id).trim();
  return id ? `/detail_event/${encodeURIComponent(id)}.html` : "/list_event.html";
}

function getName(event) {
  if (!event) return "";
  return toStr(event.event_name_full || event.event_name || event.event_name_simple || "");
}

function getWinnerName(event) {
  if (!event) return "";
  return toStr(event.winner_name).trim();
}

function getCategoryDescription(event) {
  return toStr(event.category_description).trim();
}

function getCategoryShowOrder(event) {
  const n = Number(event.category_show_order);
  return Number.isFinite(n) ? n : 999999;
}

function slugify(value) {
  const raw = toStr(value).trim().toLowerCase();
  if (!raw) return "";

  return raw
    .normalize("NFKC")
    .replace(/&/g, " and ")
    .replace(/[・･]/g, "-")
    .replace(/[／/]/g, "-")
    .replace(/[（）()［\]\[\]【】]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "other";
}

function getShortEventLabel(event) {
  const name = getName(event);
  if (!name) return "-";

  const match = name.match(/第\s*\d+\s*(章|回|弾|節)/);
  if (match) return match[0].replace(/\s+/g, "");

  const date = formatDate(event && event.event_date);
  return date || name;
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
