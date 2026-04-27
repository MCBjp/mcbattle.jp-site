const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const TEMPLATE_PATH = path.join(ROOT_DIR, "templates", "mc-template.html");
const DATA_PATH = path.join(ROOT_DIR, "data", "mc_details_all.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "detail_mc");

const COLLAPSE_LIMIT_BATTLE = 5;
const COLLAPSE_LIMIT_APPEARANCE = 10;

function main() {
  ensureFileExists(TEMPLATE_PATH);
  ensureFileExists(DATA_PATH);
  ensureDir(OUTPUT_DIR);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  const detailMap = data && data.mc_details ? data.mc_details : {};
  const mcIds = Object.keys(detailMap);

  if (!mcIds.length) {
    console.log("mc_details が見つかりませんでした。");
    return;
  }

  let generatedCount = 0;

  for (const mcId of mcIds) {
    const detail = detailMap[mcId];
    if (!detail || !detail.mc) continue;

    const html = buildMcHtml(template, mcId, detail);
    const outPath = path.join(OUTPUT_DIR, `${mcId}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    generatedCount += 1;
  }

  console.log(`MC静的ページ生成完了: ${generatedCount}件`);
}

function buildMcHtml(template, mcId, detail) {
  const mc = detail.mc || {};
  const ranking = detail.ranking || {};
  const summary = detail.summary || {};
  const appearances = sortAppearances(Array.isArray(detail.participated_events) ? detail.participated_events : []);
  const wins = sortMatchHistory(Array.isArray(detail.wins_against) ? detail.wins_against : []);
  const losses = sortMatchHistory(Array.isArray(detail.losses_against) ? detail.losses_against : []);
  const championships = Array.isArray(detail.championships) ? detail.championships : [];
  const totalPrizeMoney = detail.total_prize_money ?? 0;

  const mcName = safeString(mc.mc_name || "このMC");
  const mcSubName = safeString(mc.mc_name_sub || "").trim();
  const mcDescription = getMcDescription(mc);
  const pageTitle = `${mcName} | 戦績・優勝歴・賞金・出場大会 | MCBattle.jp`;
  const metaDescription = buildMetaDescription(mcName, summary, championships, totalPrizeMoney);

  const rankDisplay = getRankDisplay(ranking);
  const scoreDisplay = getScoreDisplay(ranking);
  const rankingStatus = safeString(ranking.ranking_status || "");
  const rankingNote = rankingStatus === "inactive_3y" || rankingStatus === "inactive_4y"
    ? "直近の参加実績不足によりスコア対象外"
    : "";

  const mcInfoListItems = buildMcInfoListItems({
    summary,
    championships,
    totalPrizeMoney,
    rankingStatus,
    rankDisplay,
    scoreDisplay,
    rankingNote
  });

  const winsListItems = buildBattleListItems(wins, "win");
  const lossesListItems = buildBattleListItems(losses, "loss");
  const appearancesListItems = buildAppearanceListItems(appearances);

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(mcId, mcName);
  const profileJsonLd = buildProfileJsonLd(mcId, mcName, metaDescription);

  const winsHasMore = wins.length > COLLAPSE_LIMIT_BATTLE;
  const lossesHasMore = losses.length > COLLAPSE_LIMIT_BATTLE;
  const appearancesHasMore = appearances.length > COLLAPSE_LIMIT_APPEARANCE;

  return template
    .replaceAll("__PAGE_TITLE__", escapeHtml(pageTitle))
    .replaceAll("__META_DESCRIPTION__", escapeHtml(metaDescription))
    .replaceAll("__MC_ID__", escapeHtml(String(mcId)))
    .replaceAll("__BREADCRUMB_JSON_LD__", escapeScriptJson(breadcrumbJsonLd))
    .replaceAll("__PROFILE_JSON_LD__", escapeScriptJson(profileJsonLd))
    .replaceAll("__MC_TITLE__", escapeHtml(mcName))
    .replaceAll("__MC_SUBNAME__", escapeHtml(mcSubName))
    .replaceAll("__MC_SUBNAME_HIDDEN_CLASS__", mcSubName ? "" : "is-hidden")
    .replaceAll("__MC_DESCRIPTION__", escapeHtml(mcDescription))
    .replaceAll("__MC_DESCRIPTION_HIDDEN_CLASS__", mcDescription ? "" : "is-hidden")
    .replaceAll("__MC_META__", "")
    .replaceAll("__STATE_CARD_HIDDEN_CLASS__", "is-hidden")
    .replaceAll("__STATE_MESSAGE_ERROR_CLASS__", "")
    .replaceAll("__STATE_MESSAGE__", "")
    .replaceAll("__INFO_SECTION_HIDDEN_CLASS__", "")
    .replaceAll("__MC_INFO_LIST_ITEMS__", mcInfoListItems)
    .replaceAll("__WINS_SECTION_HIDDEN_CLASS__", "")
    .replaceAll("__WINS_STATUS_HIDDEN_CLASS__", wins.length === 0 ? "" : "is-hidden")
    .replaceAll("__WINS_STATUS__", "")
    .replaceAll("__WINS_LIST_ITEMS__", winsListItems)
    .replaceAll("__WINS_MORE_HIDDEN_CLASS__", winsHasMore ? "" : "is-hidden")
    .replaceAll("__LOSSES_SECTION_HIDDEN_CLASS__", "")
    .replaceAll("__LOSSES_STATUS_HIDDEN_CLASS__", losses.length === 0 ? "" : "is-hidden")
    .replaceAll("__LOSSES_STATUS__", "")
    .replaceAll("__LOSSES_LIST_ITEMS__", lossesListItems)
    .replaceAll("__LOSSES_MORE_HIDDEN_CLASS__", lossesHasMore ? "" : "is-hidden")
    .replaceAll("__APPEARANCES_SECTION_HIDDEN_CLASS__", "")
    .replaceAll("__APPEARANCES_STATUS_HIDDEN_CLASS__", appearances.length === 0 ? "" : "is-hidden")
    .replaceAll("__APPEARANCES_STATUS__", appearances.length === 0 ? "出場大会がありません" : "")
    .replaceAll("__APPEARANCES_LIST_ITEMS__", appearancesListItems)
    .replaceAll("__APPEARANCES_MORE_HIDDEN_CLASS__", appearancesHasMore ? "" : "is-hidden");
}

function getMcDescription(mc) {
  return safeString(
    mc.mc_description ??
    mc.description ??
    mc.notes_public ??
    ""
  ).trim();
}

function buildMetaDescription(mcName, summary, championships, totalPrizeMoney) {
  const totalMatches = summary && summary.total_matches !== undefined && summary.total_matches !== null
    ? Number(summary.total_matches)
    : null;
  const wins = summary && summary.wins !== undefined && summary.wins !== null
    ? Number(summary.wins)
    : null;
  const losses = summary && summary.losses !== undefined && summary.losses !== null
    ? Number(summary.losses)
    : null;

  const parts = [
    `${mcName}の戦績・優勝歴・出場大会ページです。`,
    totalMatches !== null && Number.isFinite(totalMatches) && wins !== null && Number.isFinite(wins) && losses !== null && Number.isFinite(losses)
      ? `戦績は${totalMatches}試合${wins}勝${losses}敗。`
      : "",
    championships.length
      ? `優勝歴は${championships.length}回。`
      : "",
    Number(totalPrizeMoney) > 0
      ? `獲得賞金総額は¥${formatYen(totalPrizeMoney)}。`
      : "",
    "出場大会、戦績、スコアを掲載しています。"
  ].filter(Boolean);

  return parts.join(" ");
}

function buildMcInfoListItems(params) {
  const {
    summary,
    championships,
    totalPrizeMoney,
    rankingStatus,
    rankDisplay,
    scoreDisplay,
    rankingNote
  } = params;

  const hasChampionships = championships.length > 0;
  const championshipText = hasChampionships
    ? championships.map(renderChampionshipLine).join("")
    : "−";

  const battleSummary = `${displayValue(summary.total_matches)}試合 ${displayValue(summary.wins)}勝 ${displayValue(summary.losses)}敗`;

  const rows = [];

  rows.push(renderInfoRow("戦績", escapeHtml(battleSummary)));
  rows.push(renderInfoRow("獲得賞金総額", escapeHtml(`¥${formatYen(totalPrizeMoney)}`)));

  if (hasChampionships) {
    rows.push(renderInfoRow("優勝歴", championshipText, { block: true }));
  } else {
    rows.push(renderInfoRow("優勝歴", escapeHtml(championshipText)));
  }

  rows.push(renderInfoRow("スコアランキング", escapeHtml(isInactiveRanking(rankingStatus) ? "対象外" : displayValue(rankDisplay))));
  rows.push(renderInfoRow("スコア", escapeHtml(isInactiveRanking(rankingStatus) ? "−" : displayValue(scoreDisplay))));

  if (rankingNote) {
    rows.push(renderInfoRow("補足", `<span class="mc-note">${escapeHtml(rankingNote)}</span>`));
  }

  return rows.join("\n");
}

function renderInfoRow(label, valueHtml, options = {}) {
  if (options.block) {
    return [
      '<li class="meta-list-block">',
      `<span class="meta-label">${escapeHtml(label)}：</span>`,
      `<span class="meta-value-block">${valueHtml}</span>`,
      "</li>"
    ].join("");
  }

  return [
    "<li>",
    `<span class="meta-label">${escapeHtml(label)}：</span>`,
    `<span>${valueHtml}</span>`,
    "</li>"
  ].join("");
}

function buildBattleListItems(items, battleType) {
  if (!items.length) {
    return '<li class="is-static-empty">−</li>';
  }

  return items.map((item) => {
    const opponentHtml = renderMcLink(item.opponent_name || "不明", item.opponent_mc_id || "", battleType);
    const eventHtml = renderBattleEvent(item.event_name || "", item.event_id || "");

    return [
      "<li>",
      `<span class="battle-opponent">${opponentHtml}</span>`,
      eventHtml,
      "</li>"
    ].join("");
  }).join("\n");
}

function buildAppearanceListItems(items) {
  if (!items.length) {
    return '<li class="is-static-empty">−</li>';
  }

  return items.map((item) => {
    return [
      "<li>",
      `<div class="appearance-link-wrap">${renderEventStack(item.event_name || "", item.event_id || "", item.event_date || "")}</div>`,
      "</li>"
    ].join("");
  }).join("\n");
}

function buildBreadcrumbJsonLd(mcId, mcName) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "MCBattle.jp",
        item: "https://mcbattle.jp/"
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "MC一覧",
        item: "https://mcbattle.jp/list_mc.html"
      },
      {
        "@type": "ListItem",
        position: 3,
        name: mcName,
        item: `https://mcbattle.jp/detail_mc/${mcId}.html`
      }
    ]
  }, null, 2);
}

function buildProfileJsonLd(mcId, mcName, description) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${mcName} | MCBattle.jp`,
    description,
    url: `https://mcbattle.jp/detail_mc/${mcId}.html`,
    mainEntity: {
      "@type": "Person",
      name: mcName
    }
  }, null, 2);
}

function renderMcLink(name, mcId, battleType = "") {
  const safeName = escapeHtml(name || "");
  const safeId = String(mcId || "").trim();

  const linkClass = "battle-opponent-link";
  const labelHtml = `<span class="battle-opponent-label">${safeName}</span>`;

  if (!safeName) return "";

  if (!safeId) {
    return `<span class="${linkClass}">${labelHtml}</span>`;
  }

  return `<a href="../detail_mc/${encodeURIComponent(safeId)}.html" class="${linkClass}">${labelHtml}</a>`;
}

function renderBattleEvent(name, eventId) {
  const safeName = escapeHtml(name || "");
  const safeId = String(eventId || "").trim();

  if (!safeName) return "";
  if (!safeId) return `<span class="battle-event">${safeName}</span>`;

  return `
        <span class="battle-event">
          <a href="../detail_event/${encodeURIComponent(safeId)}.html" class="battle-event-link">${safeName}</a>
        </span>
      `.trim();
}

function renderEventStack(name, eventId, eventDate) {
  const safeName = escapeHtml(name || "");
  const safeDate = escapeHtml(formatDateDots(eventDate || ""));
  const safeId = String(eventId || "").trim();

  if (!safeName && !safeDate) return "";
  if (!safeId) {
    return `
          <span class="appearance-name">${safeName}</span>
          ${safeDate ? `<span class="appearance-date">${safeDate}</span>` : ""}
        `.trim();
  }

  return `
        <a href="../detail_event/${encodeURIComponent(safeId)}.html">
          <span class="appearance-name">${safeName}</span>
          ${safeDate ? `<span class="appearance-date">${safeDate}</span>` : ""}
        </a>
      `.trim();
}

function renderChampionshipLine(item) {
  const eventName = escapeHtml(item.event_name || "");
  const safeEventId = String(item.event_id || "").trim();

  if (!eventName) return "";

  if (safeEventId) {
    return `
          <span class="championship-line">
            <a class="championship-event-link" href="../detail_event/${encodeURIComponent(safeEventId)}.html">${eventName}</a>
          </span>
        `.trim();
  }

  return `
        <span class="championship-line">
          <span>${eventName}</span>
        </span>
      `.trim();
}

function isInactiveRanking(rankingStatus) {
  return rankingStatus === "inactive_3y" || rankingStatus === "inactive_4y";
}

function getRankLabel(rankValue) {
  if (rankValue === null || rankValue === undefined || rankValue === "") return "圏外";
  const n = Number(rankValue);
  if (!Number.isFinite(n)) return "圏外";
  return n <= 100 ? String(n) : "圏外";
}

function getRankDisplay(ranking) {
  if (ranking.rank_display !== null && ranking.rank_display !== undefined && ranking.rank_display !== "") {
    return String(ranking.rank_display);
  }
  return getRankLabel(ranking.rank);
}

function getScoreDisplay(ranking) {
  if (ranking.score_display !== null && ranking.score_display !== undefined && ranking.score_display !== "") {
    return String(ranking.score_display);
  }
  return formatScore(ranking.current_score ?? ranking.score);
}

function formatScore(value) {
  if (value === null || value === undefined || value === "") return "";
  if (isNaN(Number(value))) return String(value);
  return Number(value).toFixed(2);
}

function formatYen(value) {
  const num = Number(value || 0);
  return num.toLocaleString("ja-JP");
}

function displayValue(value) {
  return (value === null || value === undefined || value === "") ? "−" : value;
}

function formatDateDots(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s.replace(/-/g, ".");
  }
  return s;
}

function normalizeRoundLabel(roundName) {
  const name = String(roundName || "").trim();

  if (!name) return "";
  if (/^final$/i.test(name) || name === "決勝") return "Final";

  const jaBest = name.match(/^ベスト\s*(\d+)$/);
  if (jaBest) return `Best${jaBest[1]}`;

  const enBest = name.match(/^best\s*(\d+)$/i);
  if (enBest) return `Best${enBest[1]}`;

  if (name === "準決勝") return "Best4";
  if (name === "準々決勝") return "Best8";

  return name;
}

function getRoundSortValue(roundName) {
  const normalized = normalizeRoundLabel(roundName);

  if (!normalized) return 999999;
  if (normalized === "Final") return 0;

  const bestMatch = normalized.match(/^Best(\d+)$/i);
  if (bestMatch) return Number(bestMatch[1]);

  const roundMatch = normalized.match(/^(\d+)回戦$/);
  if (roundMatch) return 1000 + Number(roundMatch[1]);

  return 999999;
}

function sortMatchHistory(items) {
  return [...items].sort((a, b) => {
    const dateA = String(a.event_date || "");
    const dateB = String(b.event_date || "");
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const roundA = getRoundSortValue(a.round_name);
    const roundB = getRoundSortValue(b.round_name);
    if (roundA !== roundB) return roundA - roundB;

    const eventA = String(a.event_name || "");
    const eventB = String(b.event_name || "");
    if (eventA !== eventB) return eventA.localeCompare(eventB, "ja");

    const oppA = String(a.opponent_name || "");
    const oppB = String(b.opponent_name || "");
    return oppA.localeCompare(oppB, "ja");
  });
}

function sortAppearances(items) {
  return [...items].sort((a, b) => {
    const dateA = String(a.event_date || "");
    const dateB = String(b.event_date || "");
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    const roundA = getRoundSortValue(a.round_name);
    const roundB = getRoundSortValue(b.round_name);
    if (roundA !== roundB) return roundA - roundB;

    const eventA = String(a.event_name || "");
    const eventB = String(b.event_name || "");
    return eventA.localeCompare(eventB, "ja");
  });
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

function safeString(value) {
  return String(value ?? "");
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

main();
