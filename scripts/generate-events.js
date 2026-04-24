const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const TEMPLATE_PATH = path.join(ROOT_DIR, "templates", "event-template.html");
const DATA_PATH = path.join(ROOT_DIR, "data", "event_details_all.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "detail_event");
const LONG_NAME_THRESHOLD = 10;

function main() {
  ensureFileExists(TEMPLATE_PATH);
  ensureFileExists(DATA_PATH);
  ensureDir(OUTPUT_DIR);
  cleanHtmlFilesInDir(OUTPUT_DIR);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);

  const detailMap = data && data.event_details ? data.event_details : {};
  const eventIds = Object.keys(detailMap);

  if (!eventIds.length) {
    console.log("event_details が見つかりませんでした。");
    return;
  }

  let generatedCount = 0;

  for (const eventId of eventIds) {
    const detail = detailMap[eventId];
    if (!detail || !detail.event) continue;

    const html = buildEventHtml(template, eventId, detail);
    const outPath = path.join(OUTPUT_DIR, `${eventId}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    generatedCount += 1;
  }

  console.log(`大会静的ページ生成完了: ${generatedCount}件`);
}

function buildEventHtml(template, eventId, detail) {
  const event = detail.event || {};
  const groupedMatches = Array.isArray(detail.grouped_matches) ? detail.grouped_matches.slice() : [];
  const totalMatches = Number(detail.total_matches || 0);

  groupedMatches.sort((a, b) => getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name));

  const eventTitle = safeString(event.event_name_full || event.event_name || "大会名不明");
  const eventDateText = formatDateJP(event.event_date || "");
  const winnerName = safeString(event.winner_name || "");
  const runnerUpName = safeString(event.runner_up_name || "");

  const pageTitle = `${eventTitle} | 大会結果・優勝者・試合結果 | MCBattle.jp`;
  const metaDescription = buildMetaDescription(eventTitle, eventDateText, winnerName, runnerUpName, totalMatches);

  const eventInfoListItems = buildEventInfoListItems(event, groupedMatches);
  const matchesHtml = buildMatchesHtml(groupedMatches);
  const matchesStatusHtml = totalMatches === 0
    ? '<p id="matches-status" class="muted">試合結果がありません</p>'
    : "";

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(eventId, eventTitle);
  const eventJsonLd = buildEventJsonLd(eventId, event, eventTitle, metaDescription, winnerName);

  return template
    .replaceAll("__PAGE_TITLE__", escapeHtml(pageTitle))
    .replaceAll("__META_DESCRIPTION__", escapeHtml(metaDescription))
    .replaceAll("__EVENT_ID__", escapeHtml(String(eventId)))
    .replaceAll("__BREADCRUMB_JSON_LD__", escapeScriptJson(breadcrumbJsonLd))
    .replaceAll("__EVENT_JSON_LD__", escapeScriptJson(eventJsonLd))
    .replaceAll("__EVENT_TITLE__", escapeHtml(eventTitle))
    .replaceAll("__EVENT_INFO_LIST_ITEMS__", eventInfoListItems)
    .replaceAll("__MATCHES_STATUS_HTML__", matchesStatusHtml)
    .replaceAll("__MATCHES_HTML__", matchesHtml)
    .replaceAll("__CONTACT_EVENT_NAME_URL__", escapeHtml(encodeURIComponent(eventTitle)));
}

function buildMetaDescription(eventTitle, eventDateText, winnerName, runnerUpName, totalMatches) {
  const parts = [
    `${eventTitle}の大会結果ページです。`,
    eventDateText ? `開催日は${eventDateText}。` : "",
    winnerName ? `優勝者は${winnerName}。` : "",
    runnerUpName ? `準優勝者は${runnerUpName}。` : "",
    totalMatches > 0 ? `全${totalMatches}試合の試合結果を掲載しています。` : "試合結果を掲載しています。"
  ].filter(Boolean);

  return parts.join(" ");
}

function buildEventInfoListItems(event, groupedMatches) {
  const resultsHtml = buildResultsHtml(event, groupedMatches);
  const formattedWinnerPrize = formatPrizeYen(event.prize_money_winner);
  const formattedLocation = safeString(event.location || "").trim();

  const items = [
    { label: "開催日", html: escapeHtml(formatDateJP(event.event_date || "")) },
    { label: "場所", html: escapeHtml(formattedLocation) },
    { label: "結果", html: resultsHtml },
    { label: "優勝賞金", html: escapeHtml(formattedWinnerPrize || "") }
  ].filter((item) => item.html !== "");

  return items.map((item) => {
    return [
      "<li>",
      `<span class="meta-label">${escapeHtml(item.label)}：</span>`,
      `<span>${item.html}</span>`,
      "</li>"
    ].join("");
  }).join("\n");
}

function buildResultsHtml(event, groupedMatches) {
  const finalMatches = getRoundMatches(groupedMatches, "Final");
  const semiMatches = getRoundMatches(groupedMatches, "Best4");

  const winnerName = safeString(event.winner_name || (finalMatches[0] ? finalMatches[0].winner_name : ""));
  const winnerMcId = safeString(event.winner_mc_id || (finalMatches[0] ? finalMatches[0].winner_mc_id : ""));

  const runnerUpName = safeString(event.runner_up_name || (finalMatches[0] ? finalMatches[0].loser_name : ""));
  const runnerUpMcId = safeString(event.runner_up_mc_id || (finalMatches[0] ? finalMatches[0].loser_mc_id : ""));

  const best4List = semiMatches
    .map((match) => {
      const name = safeString(match.loser_name || "");
      const mcId = safeString(match.loser_mc_id || "");
      if (!name) return "";
      return `🥉 ${renderMcLink(name, mcId, "loser")}`;
    })
    .filter(Boolean);

  const lines = [];

  if (winnerName) lines.push(`<span class="result-line">🥇 ${renderMcLink(winnerName, winnerMcId, "winner")}</span>`);
  if (runnerUpName) lines.push(`<span class="result-line is-sub">🥈 ${renderMcLink(runnerUpName, runnerUpMcId, "loser")}</span>`);
  best4List.forEach((line) => lines.push(`<span class="result-line is-sub">${line}</span>`));

  if (!lines.length) return "−";
  return `<span class="result-block">${lines.join("")}</span>`;
}

function buildMatchesHtml(groupedMatches) {
  return groupedMatches.map((group) => {
    const roundName = normalizeRoundLabel(group.round_name) || "ラウンド不明";
    const isTwoColumn = isTwoColumnRound(roundName);
    const matches = Array.isArray(group.matches) ? group.matches : [];

    const rows = matches.map((match) => {
      const winnerHtml = renderMcLink(match.winner_name || "不明", match.winner_mc_id || "", "winner");
      const loserHtml = renderMcLink(match.loser_name || "不明", match.loser_mc_id || "", "loser");

      return [
        '<li class="match-row-wrap">',
        '<div class="match-row-box">',
        '<div class="match-single-line">',
        `<span class="match-name is-winner">${winnerHtml}</span>`,
        '<span class="match-separator">/</span>',
        `<span class="match-name is-loser">${loserHtml}</span>`,
        "</div>",
        "</div>",
        "</li>"
      ].join("");
    }).join("\n");

    return [
      '<div class="round-block">',
      `<h3 class="round-heading">${escapeHtml(roundName)}</h3>`,
      `<ul class="match-list${isTwoColumn ? " is-two-column" : ""}">`,
      rows,
      "</ul>",
      "</div>"
    ].join("\n");
  }).join("\n");
}

function buildBreadcrumbJsonLd(eventId, eventTitle) {
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
        name: "大会一覧",
        item: "https://mcbattle.jp/list_event.html"
      },
      {
        "@type": "ListItem",
        position: 3,
        name: eventTitle,
        item: `https://mcbattle.jp/detail_event/${eventId}.html`
      }
    ]
  }, null, 2);
}

function buildEventJsonLd(eventId, event, eventTitle, description, winnerName) {
  const normalizedDate = normalizeDateForSchema(event.event_date || "");
  const locationName = safeString(event.location || "").trim();

  const organizerName = safeString(
    event.organizer ||
    event.host ||
    event.promoter ||
    event.event_organizer ||
    ""
  ).trim();

  const obj = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: eventTitle,
    description,
    url: `https://mcbattle.jp/detail_event/${eventId}.html`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventCompleted",
    image: [
      "https://mcbattle.jp/ogp.PNG"
    ]
  };

  if (normalizedDate) {
    obj.startDate = normalizedDate;
    obj.endDate = normalizedDate;
  }

  if (locationName) {
    obj.location = {
      "@type": "Place",
      name: locationName
    };
  }

  if (winnerName) {
    obj.performer = {
      "@type": "Person",
      name: winnerName
    };
  }

  if (organizerName) {
    obj.organizer = {
      "@type": "Organization",
      name: organizerName
    };
  }

  return JSON.stringify(obj, null, 2);
}

function normalizeDateForSchema(dateValue) {
  const value = String(dateValue || "").trim();

  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const m = value.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getRoundMatches(groupedMatches, roundLabel) {
  const group = groupedMatches.find((g) => normalizeRoundLabel(g.round_name) === roundLabel);
  return group && Array.isArray(group.matches) ? group.matches : [];
}

function normalizeRoundLabel(roundName) {
  const name = String(roundName || "").trim();

  if (!name) return "";
  if (/^final$/i.test(name) || name === "決勝") return "Final";
  if (/^best\s*4$/i.test(name) || name === "準決勝" || name === "ベスト4") return "Best4";
  if (/^best\s*8$/i.test(name) || name === "準々決勝" || name === "ベスト8") return "Best8";
  if (/^best\s*16$/i.test(name) || name === "ベスト16") return "Best16";
  if (/^best\s*24$/i.test(name) || name === "ベスト24") return "Best24";
  if (/^best\s*32$/i.test(name) || name === "ベスト32") return "Best32";
  if (/^best\s*36$/i.test(name) || name === "ベスト36") return "Best36";
  if (/^best\s*48$/i.test(name) || name === "ベスト48") return "Best48";
  if (/^best\s*64$/i.test(name) || name === "ベスト64") return "Best64";

  const jaBest = name.match(/^ベスト\s*(\d+)$/);
  if (jaBest) return `Best${jaBest[1]}`;

  const enBest = name.match(/^best\s*(\d+)$/i);
  if (enBest) return `Best${enBest[1]}`;

  return name;
}

function getRoundSortValue(roundName) {
  const normalized = normalizeRoundLabel(roundName);

  if (!normalized) return 999999;
  if (normalized === "Final") return 0;

  const bestMatch = normalized.match(/^Best(\d+)$/i);
  if (bestMatch) return Number(bestMatch[1]);

  return 999999;
}

function isTwoColumnRound(roundName) {
  const normalized = normalizeRoundLabel(roundName);
  if (!normalized || normalized === "Final") return false;
  return /^Best\d+$/i.test(normalized);
}

function renderMcLink(name, mcId, type = "winner") {
  const rawName = String(name || "");
  const safeName = escapeHtml(rawName);
  const safeId = String(mcId || "").trim();
  const isLong = getDisplayLength(rawName) >= LONG_NAME_THRESHOLD;
  const className =
    `${type === "loser" ? "result-link-loser" : "result-link-winner"}${isLong ? " is-long" : ""}`;

  if (!safeName) return "";
  if (!safeId) return `<span class="${className}">${safeName}</span>`;
  return `<a href="../detail_mc/${encodeURIComponent(safeId)}.html" class="${className}">${safeName}</a>`;
}

function getDisplayLength(value) {
  return Array.from(String(value || "").trim()).length;
}

function formatPrizeYen(value) {
  const formatted = formatNumberWithComma(value);
  if (!formatted) return "";
  return "¥" + formatted;
}

function formatNumberWithComma(value) {
  if (value === null || value === undefined || value === "") return "";
  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^\d+$/.test(normalized)) return String(value);
  return Number(normalized).toLocaleString("ja-JP");
}

function formatDateJP(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
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

function cleanHtmlFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;

  const files = fs.readdirSync(dirPath);
  let deletedCount = 0;

  files.forEach((file) => {
    if (file.endsWith(".html")) {
      fs.unlinkSync(path.join(dirPath, file));
      deletedCount += 1;
    }
  });

  console.log(`既存大会静的HTML削除: ${deletedCount}件`);
}

main();