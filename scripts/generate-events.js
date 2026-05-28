const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const TEMPLATE_PATH = path.join(ROOT_DIR, "templates", "event-template.html");
const DATA_PATH = path.join(ROOT_DIR, "data", "event_details_all.json");
const MC_DETAILS_PATH = path.join(ROOT_DIR, "data", "mc_details_all.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "detail_event");
const LONG_NAME_THRESHOLD = 10;
function shouldShowRoundByDefault(roundName) {
  const normalized = normalizeRoundLabel(roundName);

  if (normalized === "Final") return true;

  const bestMatch = normalized.match(/^Best(\d+)$/i);
  if (!bestMatch) return false;

  return Number(bestMatch[1]) <= 8;
}

function main() {
  ensureFileExists(TEMPLATE_PATH);
  ensureFileExists(DATA_PATH);
  ensureDir(OUTPUT_DIR);
  cleanHtmlFilesInDir(OUTPUT_DIR);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const raw = fs.readFileSync(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  const mcNameById = loadCanonicalMcNameMap(data);

  const detailMap = data && data.event_details ? data.event_details : {};
  const eventIds = Object.keys(detailMap);

  if (!eventIds.length) {
    console.log("event_details が見つかりませんでした。");
    return;
  }

  const neighborMap = buildEventNeighborMap(detailMap);

  let generatedCount = 0;

  for (const eventId of eventIds) {
    const detail = detailMap[eventId];
    if (!detail || !detail.event) continue;

    const html = buildEventHtml(template, eventId, detail, mcNameById, neighborMap);
    const outPath = path.join(OUTPUT_DIR, `${eventId}.html`);
    fs.writeFileSync(outPath, html, "utf8");
    generatedCount += 1;
  }

  console.log(`大会静的ページ生成完了: ${generatedCount}件`);
}

function buildEventHtml(template, eventId, detail, mcNameById, neighborMap) {
  const event = detail.event || {};
  const groupedMatches = Array.isArray(detail.grouped_matches) ? detail.grouped_matches.slice() : [];
  const totalMatches = Number(detail.total_matches || 0);
  const isTeamEvent = isTeamBattleEvent(event);

  groupedMatches.sort((a, b) => getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name));

  const eventTitle = safeString(event.event_name_full || event.event_name || "大会名不明");
  const seoEventName = getSeoEventName(event, eventTitle);
  const eventDateText = formatDateJP(event.event_date || "");
  const eventDateLongText = formatDateLongJP(event.event_date || "");
  const winnerName = safeString(event.winner_name || event.winner_team_name || "");
  const runnerUpName = safeString(event.runner_up_name || event.runner_up_team_name || "");

  const pageTitle = `${eventTitle} | 大会結果・優勝者・試合結果 | MCBattle.jp`;
  const metaDescription = buildMetaDescription(eventTitle, eventDateText, winnerName, runnerUpName, totalMatches, isTeamEvent);

  const seoTitle = buildEventSeoTitle(event, seoEventName, winnerName, runnerUpName, isTeamEvent);
  const seoDescription = buildEventSeoDescription(event, seoEventName, eventDateLongText || eventDateText, winnerName, runnerUpName, totalMatches, groupedMatches, isTeamEvent);

  const eventInfoListItems = buildEventInfoListItems(detail, groupedMatches, mcNameById);
  const eventNeighborNavHtml = buildEventNeighborNavHtml(eventId, neighborMap);
  const matchesHtml = isTeamEvent ? buildTeamMatchesHtml(groupedMatches, mcNameById) : buildMatchesHtml(groupedMatches);
  const matchesStatusHtml = totalMatches === 0
    ? '<p id="matches-status" class="muted">試合結果がありません</p>'
    : "";

  const breadcrumbJsonLd = buildBreadcrumbJsonLd(eventId, eventTitle);
  const eventJsonLd = buildEventJsonLd(eventId, event, eventTitle, seoDescription || metaDescription, winnerName, isTeamEvent);

  const html = template
    .replaceAll("__SEO_TITLE__", escapeHtml(seoTitle))
    .replaceAll("__SEO_DESCRIPTION__", escapeHtml(seoDescription))
    .replaceAll("__PAGE_TITLE__", escapeHtml(pageTitle))
    .replaceAll("__META_DESCRIPTION__", escapeHtml(metaDescription))
    .replaceAll("__EVENT_ID__", escapeHtml(String(eventId)))
    .replaceAll("__BREADCRUMB_JSON_LD__", escapeScriptJson(breadcrumbJsonLd))
    .replaceAll("__EVENT_JSON_LD__", escapeScriptJson(eventJsonLd))
    .replaceAll("__EVENT_TITLE__", escapeHtml(eventTitle))
    .replaceAll("__EVENT_INFO_LIST_ITEMS__", eventInfoListItems)
    .replaceAll("__EVENT_NEIGHBOR_NAV_HTML__", eventNeighborNavHtml)
    .replaceAll("__MATCHES_STATUS_HTML__", matchesStatusHtml)
    .replaceAll("__MATCHES_HTML__", matchesHtml)
    .replaceAll("__CONTACT_EVENT_NAME_URL__", escapeHtml(encodeURIComponent(eventTitle)))
    .replaceAll("__COMMENTS_HTML__", "")
    .replaceAll("__COMMENT_HTML__", "")
    .replaceAll("__EVENT_COMMENTS_HTML__", "")
    .replaceAll("__EVENT_COMMENT_HTML__", "")
    .replaceAll("__COMMENTS_STATUS_HTML__", "")
    .replaceAll("__COMMENT_STATUS_HTML__", "")
    .replaceAll("__EVENT_COMMENTS_STATUS_HTML__", "")
    .replaceAll("__EVENT_COMMENT_STATUS_HTML__", "");

  return html;
}

function buildEventNeighborMap(detailMap) {
  const map = new Map();
  const groups = new Map();

  Object.keys(detailMap || {}).forEach((eventId) => {
    const detail = detailMap[eventId];
    const event = detail && detail.event ? detail.event : {};
    const categoryId = safeString(event.category_id || "").trim();
    const eventDate = safeString(event.event_date || "").trim();

    if (!categoryId || !eventDate) return;

    const item = {
      event_id: eventId,
      category_id: categoryId,
      event_date: eventDate,
      sort_time: getEventDateSortTime(eventDate),
      event_name: safeString(event.event_name_full || event.event_name || "大会名不明")
    };

    if (!Number.isFinite(item.sort_time)) return;

    if (!groups.has(categoryId)) {
      groups.set(categoryId, []);
    }
    groups.get(categoryId).push(item);
  });

  groups.forEach((items) => {
    items.sort((a, b) => {
      if (a.sort_time !== b.sort_time) return a.sort_time - b.sort_time;
      return String(a.event_id).localeCompare(String(b.event_id));
    });

    items.forEach((item, index) => {
      map.set(item.event_id, {
        prev: index > 0 ? items[index - 1] : null,
        next: index < items.length - 1 ? items[index + 1] : null
      });
    });
  });

  return map;
}

function buildEventNeighborNavHtml(eventId, neighborMap) {
  const neighbors = neighborMap && neighborMap.get(String(eventId));
  if (!neighbors || (!neighbors.prev && !neighbors.next)) return "";

  return [
    '<nav class="event-neighbor-nav" aria-label="同カテゴリの前後大会">',
    buildEventNeighborLinkHtml(neighbors.prev, "prev"),
    buildEventNeighborLinkHtml(neighbors.next, "next"),
    '</nav>'
  ].join("\n");
}

function buildEventNeighborLinkHtml(item, direction) {
  const isNext = direction === "next";
  const label = isNext ? "次の大会 →" : "← 前の大会";

  if (!item) {
    return [
      `<span class="event-neighbor-link${isNext ? " is-next" : ""} is-disabled">`,
      `<span class="event-neighbor-label">${escapeHtml(label)}</span>`,
      '</span>'
    ].join("");
  }

  return [
    `<a class="event-neighbor-link${isNext ? " is-next" : ""}" href="../detail_event/${encodeURIComponent(item.event_id)}.html">`,
    `<span class="event-neighbor-label">${escapeHtml(label)}</span>`,
    '</a>'
  ].join("");
}

function getEventDateSortTime(value) {
  const text = safeString(value || "").trim();
  if (!text) return NaN;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const d = new Date(`${text}T00:00:00`);
    return d.getTime();
  }

  const dotMatch = text.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})$/);
  if (dotMatch) {
    const d = new Date(Number(dotMatch[1]), Number(dotMatch[2]) - 1, Number(dotMatch[3]));
    return d.getTime();
  }

  const d = new Date(text);
  return d.getTime();
}

function getSeoEventName(event, eventTitle) {
  const seoEventName = safeString(event && event.seo_event_name ? event.seo_event_name : "").trim();
  if (seoEventName) return normalizeSeoEventName(seoEventName);
  return normalizeSeoEventName(eventTitle);
}

function buildEventSeoTitle(event, seoEventName, winnerName, runnerUpName, isTeamEvent = false) {
  const seoBaseName = getSeoEventName(event, seoEventName);
  const winnerLabel = isTeamEvent ? "優勝チーム" : "優勝";
  const runnerUpLabel = isTeamEvent ? "準優勝チーム" : "準優勝";

  if (winnerName && runnerUpName) {
    return `${seoBaseName} 結果 | ${winnerLabel} ${winnerName}・${runnerUpLabel} ${runnerUpName} | MCBattle.jp`;
  }

  if (winnerName) {
    return `${seoBaseName} 結果 | ${winnerLabel} ${winnerName} | MCBattle.jp`;
  }

  return `${seoBaseName} 結果・試合結果 | MCBattle.jp`;
}

function buildEventSeoDescription(event, seoEventName, eventDateText, winnerName, runnerUpName, totalMatches, groupedMatches, isTeamEvent = false) {
  const seoBaseName = getSeoEventName(event, seoEventName);
  const winnerLabel = isTeamEvent ? "優勝チーム" : "優勝";
  const runnerUpLabel = isTeamEvent ? "準優勝チーム" : "準優勝";
  const roundRange = buildRoundRangeText(groupedMatches);

  const parts = [
    `${seoBaseName}の大会結果まとめ。`,
    eventDateText ? `${eventDateText}開催、` : "",
    winnerName ? `${winnerLabel}は${winnerName}` : "",
    runnerUpName ? `、${runnerUpLabel}は${runnerUpName}` : "",
    (winnerName || runnerUpName) ? "。" : "",
    totalMatches > 0
      ? `${roundRange ? `${roundRange}まで` : ""}全${totalMatches}試合の試合結果を掲載しています。`
      : "試合結果を掲載しています。"
  ];

  return parts.filter(Boolean).join("");
}

function normalizeSeoEventName(value) {
  return safeString(value || "")
    .replace(/Grand\s*Chanpion\s*Ship/ig, "Grand Championship")
    .replace(/Grand\s*Champion\s*Ship/ig, "Grand Championship")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRoundRangeText(groupedMatches) {
  const normalizedRounds = Array.isArray(groupedMatches)
    ? groupedMatches.map((group) => normalizeRoundLabel(group.round_name)).filter(Boolean)
    : [];

  if (!normalizedRounds.length) return "";

  const bestRounds = normalizedRounds
    .map((round) => {
      const match = round.match(/^Best(\d+)$/i);
      return match ? Number(match[1]) : null;
    })
    .filter((value) => Number.isFinite(value));

  if (!bestRounds.length) {
    return normalizedRounds.includes("Final") ? "決勝" : "";
  }

  const maxBest = Math.max(...bestRounds);
  return `Best${maxBest}から決勝`;
}

function buildMetaDescription(eventTitle, eventDateText, winnerName, runnerUpName, totalMatches, isTeamEvent = false) {
  const parts = [
    `${eventTitle}の大会結果ページです。`,
    eventDateText ? `開催日は${eventDateText}。` : "",
    winnerName ? `${isTeamEvent ? "優勝チーム" : "優勝者"}は${winnerName}。` : "",
    runnerUpName ? `${isTeamEvent ? "準優勝チーム" : "準優勝者"}は${runnerUpName}。` : "",
    totalMatches > 0 ? `全${totalMatches}試合の試合結果を掲載しています。` : "試合結果を掲載しています。"
  ].filter(Boolean);

  return parts.join("\n");
}

function buildEventInfoListItems(detail, groupedMatches, mcNameById) {
  const event = detail && detail.event ? detail.event : {};
  const isTeamEvent = isTeamBattleEvent(event);
  const resultsHtml = buildResultsHtml(event, groupedMatches, mcNameById);
  const formattedWinnerPrize = formatPrizeYen(event.prize_money_winner);
  const formattedLocation = safeString(event.location || "").trim();
  const prizeSupplementHtml = buildPrizeSupplementHtml(detail);

  const items = [
    { label: "開催日", html: escapeHtml(formatDateJP(event.event_date || "")) },
    { label: "場所", html: escapeHtml(formattedLocation) },
    { label: "結果", html: resultsHtml, className: isTeamEvent ? "meta-result-item is-team-result" : "" },
    { label: "優勝賞金", html: escapeHtml(formattedWinnerPrize || "") },
    { label: "補足", html: prizeSupplementHtml }
  ].filter((item) => item.html !== "");

  return items.map((item) => {
    if (item.className) {
      return [
        `<li class="${escapeHtml(item.className)}">`,
        `<span class="meta-label">${escapeHtml(item.label)}：</span>`,
        `<span class="team-result-body">${item.html}</span>`,
        "</li>"
      ].join("\n");
    }

    return [
      "<li>",
      `<span class="meta-label">${escapeHtml(item.label)}：</span>`,
      `<span>${item.html}</span>`,
      "</li>"
    ].join("\n");
  }).join("\n");
}

function buildPrizeSupplementHtml(detail) {
  const items = normalizeEventPrizeSupplements(detail);
  if (!items.length) return "";

  const groups = buildPrizeSupplementGroups(items);
  if (!groups.length) return "";

  const prefix = "この大会は優勝以外にも賞金が発生します。";

  return [
    `<span class="event-prize-note" style="display:block;">${escapeHtml(prefix)}</span>`,
    ...groups.map((group) => {
      const namesHtml = group.names.length
        ? group.names.map((name) => {
            return `<span class="event-prize-name" style="display:block;line-height:1.45;">${escapeHtml(name)}</span>`;
          }).join("")
        : "";

      return [
        '<span class="event-prize-group" style="display:block;margin-top:8px;">',
        `<span class="event-prize-group-head" style="display:block;color:var(--accent);font-weight:800;line-height:1.45;">［${escapeHtml(group.label)}］${escapeHtml(group.amount)}</span>`,
        namesHtml,
        '</span>'
      ].join("");
    })
  ].join("");
}

function buildPrizeSupplementGroups(items) {
  const groupMap = new Map();

  items.forEach((item) => {
    const amount = formatPrizeYen(item.amount);
    if (!amount) return;

    const rawLabel = safeString(item.label || "").trim();
    const rawNote = safeString(item.note || "").trim();

    const noteRoundLabel = normalizePrizeSupplementRoundLabel(rawNote);
    const labelRoundLabel = normalizePrizeSupplementRoundLabel(rawLabel);
    const roundLabel = noteRoundLabel || labelRoundLabel || rawNote || rawLabel || "その他";

    let mcName = safeString(item.mc_name || "").trim();

    if (!mcName && noteRoundLabel && rawLabel && !labelRoundLabel) {
      mcName = rawLabel;
    }

    const key = `${roundLabel}__${amount}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        label: roundLabel,
        amount,
        names: [],
        order: getPrizeSupplementRoundOrder(roundLabel)
      });
    }

    if (mcName && !groupMap.get(key).names.includes(mcName)) {
      groupMap.get(key).names.push(mcName);
    }
  });

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return String(a.label).localeCompare(String(b.label), "ja");
  });
}

function normalizePrizeSupplementRoundLabel(value) {
  const text = safeString(value || "").trim();
  if (!text) return "";

  if (/準優勝|runner[\s_-]*up|second/i.test(text)) return "準優勝";

  const bestMatch = text.match(/best\s*(\d+)/i) || text.match(/ベスト\s*(\d+)/);
  if (bestMatch) return `Best${Number(bestMatch[1])}`;

  if (/準決勝/.test(text)) return "Best4";
  if (/準々決勝/.test(text)) return "Best8";

  return "";
}

function getPrizeSupplementRoundOrder(label) {
  const text = safeString(label || "").trim();

  if (text === "準優勝") return 2;

  const bestMatch = text.match(/^Best(\d+)$/i);
  if (bestMatch) return Number(bestMatch[1]);

  return 999999;
}

function normalizeEventPrizeSupplements(detail) {
  const event = detail && detail.event ? detail.event : {};
  const source = findEventPrizeSupplementSource(detail);

  if (Array.isArray(source)) {
    return source
      .map((item) => {
        return {
          label: getPrizeSupplementLabel(item),
          amount: getPrizeSupplementAmount(item),
          note: getPrizeSupplementNote(item),
          mc_id: safeString(item.mc_id || "").trim(),
          mc_name: safeString(item.mc_name || item.name || item.mc || item.player_name || "").trim(),
          event_id: safeString(item.event_id || event.event_id || "").trim(),
          event_name: safeString(item.event_name || event.event_name_full || event.event_name || "").trim(),
          event_date: safeString(item.event_date || event.event_date || "").trim()
        };
      })
      .filter((item) => {
        return item.amount !== null && item.amount !== undefined && item.amount !== "";
      });
  }

  const parsedFromText = parsePrizeSupplementText(source);
  if (parsedFromText.length) return parsedFromText;

  return normalizeEventPrizeSupplementsFromColumns(event);
}

function findEventPrizeSupplementSource(detail) {
  const event = detail && detail.event ? detail.event : {};

  const candidates = [
    detail.prize_adjustments,
    detail.prize_adjustment,
    detail.manual_prize_adjustments,
    detail.prizeAdjustment,
    detail.prizeAdjustments,

    event.prize_adjustments,
    event.prize_adjustment,
    event.manual_prize_adjustments,
    event.prizeAdjustment,
    event.prizeAdjustments,

    event.prize_supplements,
    event.prize_supplement,
    event.prize_distribution,
    event.prize_distributions,
    event.prize_breakdown,
    event.prize_breakdowns,
    event.prize_notes,
    event.prize_note,
    event.prize_money_notes,
    event.prize_money_note,
    event.prize_money_other,
    event.other_prize_money,
    event.other_prizes
  ];

  return candidates.find((value) => {
    if (Array.isArray(value)) return value.length > 0;
    return safeString(value).trim() !== "";
  });
}

function normalizeEventPrizeSupplementsFromColumns(event) {
  const candidates = [
    { label: "準優勝", amount: event.prize_money_runner_up ?? event.runner_up_prize_money ?? event.prize_money_second ?? event.second_prize_money },
    { label: "Best4", amount: event.prize_money_best4 ?? event.best4_prize_money ?? event.prize_money_semifinalist ?? event.semifinalist_prize_money },
    { label: "Best8", amount: event.prize_money_best8 ?? event.best8_prize_money },
    { label: "Best16", amount: event.prize_money_best16 ?? event.best16_prize_money },
    { label: "Best32", amount: event.prize_money_best32 ?? event.best32_prize_money }
  ];

  return candidates.filter((item) => {
    return item.amount !== null && item.amount !== undefined && item.amount !== "" && Number(String(item.amount).replace(/,/g, "").trim()) > 0;
  });
}

function parsePrizeSupplementText(value) {
  const text = safeString(value).trim();
  if (!text) return [];

  return text
    .split(/[\/／、，\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const rankedMatch = part.match(/^(.+?)\s*[¥￥]?\s*([0-9][0-9,]*)\s*円?\s*[:：]\s*(.+)$/);
      if (rankedMatch) {
        return {
          label: rankedMatch[3].trim(),
          amount: rankedMatch[2].trim(),
          note: "",
          mc_name: rankedMatch[1].trim()
        };
      }

      const match = part.match(/^(.+?)\s*[:：]?\s*[¥￥]?\s*([0-9][0-9,]*)\s*円?$/);
      if (!match) {
        return {
          label: part,
          amount: "",
          note: ""
        };
      }

      return {
        label: match[1].trim(),
        amount: match[2].trim(),
        note: ""
      };
    })
    .filter((item) => item.label);
}

function getPrizeSupplementLabel(item) {
  return safeString(
    item.label ??
    item.round ??
    item.round_name ??
    item.rank ??
    item.result ??
    item.position ??
    item.name ??
    ""
  ).trim();
}

function getPrizeSupplementAmount(item) {
  const value =
    item.amount ??
    item.prize_money ??
    item.prize ??
    item.money ??
    item.value ??
    "";

  if (value === null || value === undefined || value === "") return "";
  return value;
}

function getPrizeSupplementNote(item) {
  return safeString(
    item.note ??
    item.notes ??
    item.adjustment_note ??
    item.description ??
    item.memo ??
    ""
  ).trim();
}

function buildResultsHtml(event, groupedMatches, mcNameById) {
  if (isTeamBattleEvent(event)) {
    return buildTeamResultsHtml(event, mcNameById);
  }

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
  return `<span class="result-block">${lines.join("\n")}</span>`;
}

function buildMatchesHtml(groupedMatches) {
  const visibleGroups = [];
  const collapsedGroups = [];

  groupedMatches.forEach((group) => {
    const roundName = normalizeRoundLabel(group.round_name) || "ラウンド不明";

    if (shouldShowRoundByDefault(roundName)) {
      visibleGroups.push(group);
    } else {
      collapsedGroups.push(group);
    }
  });

  const visibleHtml = visibleGroups
    .map((group) => buildOneRoundMatchesHtml(group))
    .join("\n");

  const collapsedHtml = collapsedGroups
    .map((group) => buildOneRoundMatchesHtml(group))
    .join("\n");

  if (!collapsedHtml) {
    return visibleHtml;
  }

  return [
    visibleHtml,
    '<details class="matches-lower-accordion">',
    '<summary class="matches-lower-summary">',
    '<span>試合結果を全て見る</span>',
    '<span class="matches-accordion-icon" aria-hidden="true"></span>',
    '</summary>',
    '<div class="matches-lower-body">',
    collapsedHtml,
    '</div>',
    '</details>'
  ].filter(Boolean).join("\n");
}

function buildOneRoundMatchesHtml(group) {
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
    ].join("\n");
  }).join("\n");

  return [
    '<div class="round-block">',
    `<h3 class="round-heading">${escapeHtml(roundName)}</h3>`,
    `<ul class="match-list${isTwoColumn ? " is-two-column" : ""}">`,
    rows,
    "</ul>",
    "</div>"
  ].join("\n");
}

function buildTeamResultsHtml(event, mcNameById) {
  const teamResults = Array.isArray(event.team_results) ? event.team_results : [];

  const lines = teamResults
    .map((item, index) => {
      const rankLabel = safeString(item.rank_label || getFallbackTeamRankLabel(index));
      const resultLabel = safeString(item.result_label || "");
      const teamName = safeString(item.team_name || "");
      const members = Array.isArray(item.members) ? item.members : [];
      const subClass = resultLabel && resultLabel !== "winner" ? " is-sub" : "";

      if (!teamName && !members.length) return "";

      return [
        `<span class="result-line${subClass}">`,
        `<span class="result-medal">${escapeHtml(rankLabel)}</span>`,
        '<span class="result-team-summary">',
        teamName ? `<span class="result-team-header">${escapeHtml(teamName)}</span>` : "",
        `<span class="result-team-member-row">${renderTeamMemberLinks(members, mcNameById)}</span>`,
        "</span>",
        "</span>"
      ].join("\n");
    })
    .filter(Boolean);

  if (!lines.length) return "−";
  return `<span class="result-block result-team-summary-block">${lines.join("\n")}</span>`;
}

function buildTeamMatchesHtml(groupedMatches, mcNameById) {
  const visibleGroups = [];
  const collapsedGroups = [];

  groupedMatches.forEach((group) => {
    const roundName = normalizeRoundLabel(group.round_name) || "ラウンド不明";

    if (shouldShowRoundByDefault(roundName)) {
      visibleGroups.push(group);
    } else {
      collapsedGroups.push(group);
    }
  });

  const visibleHtml = visibleGroups
    .map((group) => buildOneTeamRoundMatchesHtml(group, mcNameById))
    .join("\n");

  const collapsedHtml = collapsedGroups
    .map((group) => buildOneTeamRoundMatchesHtml(group, mcNameById))
    .join("\n");

  if (!collapsedHtml) {
    return visibleHtml;
  }

  return [
    visibleHtml,
    '<details class="matches-lower-accordion">',
    '<summary class="matches-lower-summary">',
    '<span>試合結果を全て見る</span>',
    '<span class="matches-accordion-icon" aria-hidden="true"></span>',
    '</summary>',
    '<div class="matches-lower-body">',
    collapsedHtml,
    '</div>',
    '</details>'
  ].filter(Boolean).join("\n");
}

function buildOneTeamRoundMatchesHtml(group, mcNameById) {
  const roundName = normalizeRoundLabel(group.round_name) || "ラウンド不明";
  const isTwoColumn = isTwoColumnRound(roundName);
  const matches = Array.isArray(group.matches) ? group.matches : [];

  const rows = matches.map((match) => {
    const winnerTeamName = safeString(match.winner_team_name || "");
    const loserTeamName = safeString(match.loser_team_name || "");
    const winnerMembers = Array.isArray(match.winner_members) ? match.winner_members : [];
    const loserMembers = Array.isArray(match.loser_members) ? match.loser_members : [];

    return [
      '<li class="match-row-wrap">',
      '<div class="match-row-box">',
      '<div class="match-team-layout">',
      '<div class="match-team-side is-winner">',
      winnerTeamName ? `<div class="team-name-label">${escapeHtml(winnerTeamName)}</div>` : "",
      `<div class="team-members-text">${renderTeamMemberLinks(winnerMembers, mcNameById)}</div>`,
      "</div>",
      '<div class="match-vs">VS</div>',
      '<div class="match-team-side is-loser">',
      loserTeamName ? `<div class="team-name-label">${escapeHtml(loserTeamName)}</div>` : "",
      `<div class="team-members-text">${renderTeamMemberLinks(loserMembers, mcNameById)}</div>`,
      "</div>",
      "</div>",
      "</div>",
      "</li>"
    ].join("\n");
  }).join("\n");

  return [
    '<div class="round-block">',
    `<h3 class="round-heading">${escapeHtml(roundName)}</h3>`,
    `<ul class="match-list${isTwoColumn ? " is-two-column" : ""}">`,
    rows,
    "</ul>",
    "</div>"
  ].join("\n");
}

function renderTeamMemberLinks(members, mcNameById) {
  const list = Array.isArray(members) ? members : [];

  return list
    .map((member) => {
      const mcId = safeString(member.mc_id || member.id || "").trim();
      const name = getCanonicalTeamMemberName(member, mcNameById);
      if (!name) return "";

      const body = escapeHtml(name);
      if (!mcId) return `<span class="team-member-text">${body}</span>`;

      return `<a class="team-member-link" href="../detail_mc/${encodeURIComponent(mcId)}.html">${body}</a>`;
    })
    .filter(Boolean)
    .join('<span class="team-member-separator">・</span>');
}

function getCanonicalTeamMemberName(member, mcNameById) {
  const mcId = safeString(member && (member.mc_id || member.id) || "").trim();

  if (mcId && mcNameById && mcNameById.has(mcId)) {
    return mcNameById.get(mcId);
  }

  return safeString(
    member && (
      member.mc_name ??
      member.name ??
      member.member_name ??
      member.display_name ??
      ""
    )
  ).trim();
}

function loadCanonicalMcNameMap(eventData) {
  const mcNameById = new Map();

  collectMcNamesFromData(eventData, mcNameById);

  if (fs.existsSync(MC_DETAILS_PATH)) {
    try {
      const raw = fs.readFileSync(MC_DETAILS_PATH, "utf8");
      const mcData = JSON.parse(raw);
      collectMcNamesFromData(mcData, mcNameById);
      console.log(`MC正規名マップ読込: ${mcNameById.size}件`);
    } catch (error) {
      console.warn(`MC正規名マップ読込失敗: ${MC_DETAILS_PATH}`);
      console.warn(error.message);
    }
  } else {
    console.warn(`MC正規名マップファイルなし: ${MC_DETAILS_PATH}`);
  }

  return mcNameById;
}

function collectMcNamesFromData(data, mcNameById) {
  if (!data || !mcNameById) return;

  if (Array.isArray(data)) {
    data.forEach((item) => collectOneMcName(item, mcNameById));
    return;
  }

  if (data.mc && typeof data.mc === "object") {
    collectOneMcName(data.mc, mcNameById);
  }

  if (Array.isArray(data.mcs)) {
    data.mcs.forEach((item) => collectOneMcName(item, mcNameById));
  }

  if (Array.isArray(data.mc_master)) {
    data.mc_master.forEach((item) => collectOneMcName(item, mcNameById));
  }

  if (Array.isArray(data.MC_Master)) {
    data.MC_Master.forEach((item) => collectOneMcName(item, mcNameById));
  }

  if (data.mc_details && typeof data.mc_details === "object") {
    Object.values(data.mc_details).forEach((detail) => {
      if (detail && detail.mc) {
        collectOneMcName(detail.mc, mcNameById);
      } else {
        collectOneMcName(detail, mcNameById);
      }
    });
  }

  if (data.mc_map && typeof data.mc_map === "object") {
    Object.values(data.mc_map).forEach((item) => collectOneMcName(item, mcNameById));
  }
}

function collectOneMcName(item, mcNameById) {
  if (!item || typeof item !== "object") return;

  const mcId = safeString(
    item.mc_id ??
    item.id ??
    item.MC_ID ??
    item.mcId ??
    ""
  ).trim();

  const mcName = safeString(
    item.mc_name ??
    item.name ??
    item.MC名 ??
    item.mcName ??
    ""
  ).trim();

  if (!mcId || !mcName) return;

  if (!mcNameById.has(mcId)) {
    mcNameById.set(mcId, mcName);
  }
}

function getFallbackTeamRankLabel(index) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  return "🥉";
}

function isTeamBattleEvent(event) {
  const format = safeString(event && event.battle_format ? event.battle_format : "").trim().toLowerCase();
  return format === "team";
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

function buildEventJsonLd(eventId, event, eventTitle, description, winnerName, isTeamEvent = false) {
  const normalizedDate = normalizeDateForSchema(event.event_date || "");
  const locationName = safeString(event.location || "").trim();

  const obj = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: eventTitle,
    description,
    url: `https://mcbattle.jp/detail_event/${eventId}.html`,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventCompleted",
    image: [
      "https://mcbattle.jp/ogp.png?v=2"
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
      "@type": isTeamEvent ? "Organization" : "Person",
      name: winnerName
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

function formatDateLongJP(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const text = String(value).trim();
    const m = text.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
    if (m) return `${m[1]}年${Number(m[2])}月${Number(m[3])}日`;
    return text;
  }

  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
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
