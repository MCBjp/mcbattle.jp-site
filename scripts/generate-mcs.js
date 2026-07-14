const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const TEMPLATE_PATH = path.join(ROOT_DIR, "templates", "mc-template.html");
const DATA_PATH = path.join(ROOT_DIR, "data", "mc_details_all.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "detail_mc");
const SITE_URL = "https://mcbattle.jp";
const LIST_LIMIT = 5;
const RECENT_MATCH_LIMIT = 10;
const FREQUENT_OPPONENT_LIMIT = 5;

function main() {
  ensureFileExists(TEMPLATE_PATH);
  ensureFileExists(DATA_PATH);
  ensureDir(OUTPUT_DIR);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const source = readJson(DATA_PATH);
  const rawEntries = Object.entries(isObject(source?.mc_details) ? source.mc_details : {});

  if (!rawEntries.length) {
    console.log("mc_details が見つかりませんでした。");
    return;
  }

  const entries = rawEntries
    .filter(([, detail]) => isObject(detail) && isObject(detail.mc))
    .map(([mcId, detail]) => [mcId, normalizeDetail(detail)]);

  const rankingContext = buildGlobalRankingContext(entries);
  const errors = [];
  let generatedCount = 0;

  for (const [mcId, detail] of entries) {
    try {
      const html = buildMcPage(template, mcId, detail, rankingContext);
      fs.writeFileSync(path.join(OUTPUT_DIR, `${mcId}.html`), html, "utf8");
      generatedCount += 1;
    } catch (error) {
      errors.push({ mcId, message: error.message });
      console.error(`[${mcId}] 生成失敗: ${error.message}`);
    }
  }

  console.log(`MC静的ページ生成完了: ${generatedCount}件`);

  if (errors.length) {
    console.log(`生成失敗: ${errors.length}件`);
    process.exitCode = 1;
  }
}

function buildMcPage(template, mcId, detail, rankingContext) {
  const view = createPageViewModel(mcId, detail, rankingContext);
  return applyTemplateReplacements(template, createTemplateReplacements(view));
}

function createPageViewModel(mcId, detail, rankingContext) {
  const mcName = cleanText(detail.mc.mc_name) || "このMC";
  const mcSubName = cleanText(detail.mc.mc_name_sub);
  const mcDescription = cleanText(
    detail.mc.mc_description || detail.mc.description || detail.mc.notes_public
  );
  const rankingStatus = cleanText(detail.ranking.ranking_status);
  const rankingInactive = isInactiveRanking(rankingStatus);
  const timeline = buildTimeline(detail);
  const appearances = mergeAppearances(
    detail.participatedEvents,
    detail.teamParticipatedEvents
  );

  const seoParams = {
    mcName,
    summary: detail.summary,
    teamSummary: detail.teamSummary,
    championships: detail.championships,
    totalPrizeMoney: detail.totalPrizeMoney
  };

  return {
    mcId,
    mcName,
    mcSubName,
    mcDescription,
    pageTitle: `${mcName}の戦績・勝率・優勝歴・賞金 | MCBattle.jp`,
    metaDescription: buildMetaDescription(seoParams),
    seoSummary: buildSeoSummary(seoParams),
    rankingStatus,
    rankingInactive,
    rankDisplay: getRankDisplay(detail.ranking),
    scoreDisplay: getScoreDisplay(detail.ranking),
    prizeRanking: rankingContext.prize.get(mcId) || createEmptyMetricRanking(),
    scoreRanking: rankingContext.score.get(mcId) || createEmptyMetricRanking(),
    detail,
    timeline,
    appearances,
    analysis: analyzeDetail(detail, timeline, appearances)
  };
}

function applyTemplateReplacements(template, replacements) {
  return Object.entries(replacements).reduce(
    (html, [placeholder, value]) => html.replaceAll(placeholder, value),
    template
  );
}

function createTemplateReplacements(view) {
  return {
    "__PAGE_TITLE__": escapeHtml(view.pageTitle),
    "__META_DESCRIPTION__": escapeHtml(view.metaDescription),
    "__MC_ID__": escapeHtml(view.mcId),
    "__BREADCRUMB_JSON_LD__": escapeScriptJson(
      buildBreadcrumbJsonLd(view.mcId, view.mcName)
    ),
    "__PROFILE_JSON_LD__": escapeScriptJson(buildProfileJsonLd(view)),
    "__MC_TITLE__": escapeHtml(view.mcName),
    "__MC_SUBNAME__": escapeHtml(view.mcSubName),
    "__MC_SUBNAME_HIDDEN_CLASS__": view.mcSubName ? "" : "is-hidden",
    "__MC_DESCRIPTION__": formatDescriptionHtml(view.mcDescription),
    "__MC_DESCRIPTION_HIDDEN_CLASS__": view.mcDescription ? "" : "is-hidden",
    "__MC_META__": buildMcDetailApp(view),
    ...createLegacyTemplateFallbacks()
  };
}

function createLegacyTemplateFallbacks() {
  return {
    "__STATE_CARD_HIDDEN_CLASS__": "is-hidden",
    "__STATE_MESSAGE_ERROR_CLASS__": "",
    "__STATE_MESSAGE__": "",
    "__INFO_SECTION_HIDDEN_CLASS__": "is-hidden",
    "__MC_INFO_LIST_ITEMS__": "",
    "__WINS_SECTION_HIDDEN_CLASS__": "is-hidden",
    "__WINS_STATUS_HIDDEN_CLASS__": "is-hidden",
    "__WINS_STATUS__": "",
    "__WINS_SEARCH_HIDDEN_CLASS__": "is-hidden",
    "__WINS_LIST_ITEMS__": "",
    "__WINS_MORE_HIDDEN_CLASS__": "is-hidden",
    "__LOSSES_SECTION_HIDDEN_CLASS__": "is-hidden",
    "__LOSSES_STATUS_HIDDEN_CLASS__": "is-hidden",
    "__LOSSES_STATUS__": "",
    "__LOSSES_SEARCH_HIDDEN_CLASS__": "is-hidden",
    "__LOSSES_LIST_ITEMS__": "",
    "__LOSSES_MORE_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_WINS_SECTION_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_WINS_STATUS_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_WINS_STATUS__": "",
    "__TEAM_WINS_SEARCH_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_WINS_LIST_ITEMS__": "",
    "__TEAM_WINS_MORE_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_LOSSES_SECTION_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_LOSSES_STATUS_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_LOSSES_STATUS__": "",
    "__TEAM_LOSSES_SEARCH_HIDDEN_CLASS__": "is-hidden",
    "__TEAM_LOSSES_LIST_ITEMS__": "",
    "__TEAM_LOSSES_MORE_HIDDEN_CLASS__": "is-hidden",
    "__APPEARANCES_SECTION_HIDDEN_CLASS__": "is-hidden",
    "__APPEARANCES_STATUS_HIDDEN_CLASS__": "is-hidden",
    "__APPEARANCES_STATUS__": "",
    "__APPEARANCES_LIST_ITEMS__": "",
    "__APPEARANCES_MORE_HIDDEN_CLASS__": "is-hidden"
  };
}

function buildMcDetailApp(view) {
  return [
    '<div class="mc-detail-app" data-mc-detail-app>',
    buildTabNavigation(),
    '<div class="mc-tab-panels">',
    buildOverview(view),
    buildHistory(view),
    buildAnalysis(view),
    "</div>",
    "</div>",
    buildMcDetailStyles(),
    buildMcDetailScript()
  ].join("\n");
}

function buildTabNavigation() {
  const tabs = [
    ["overview", "概要", true],
    ["history", "戦績", false],
    ["analysis", "分析", false]
  ];

  return `
    <div class="mc-tabs" role="tablist" aria-label="MC詳細">
      ${tabs.map(([id, label, active]) => `
        <button
          type="button"
          class="mc-tab-button${active ? " is-active" : ""}"
          role="tab"
          aria-selected="${active}"
          aria-controls="mc-tab-${id}"
          id="mc-tab-button-${id}"
          data-tab-target="${id}"
          tabindex="${active ? "0" : "-1"}"
        >${label}</button>
      `).join("")}
    </div>
  `.trim();
}

function buildOverview(view) {
  const { detail, rankingInactive, scoreDisplay, prizeRanking, scoreRanking } = view;
  const rankingNote = rankingInactive ? "直近の参加実績不足によりスコア対象外" : "";

  return `
    <section class="mc-tab-panel is-active" id="mc-tab-overview" role="tabpanel"
      aria-labelledby="mc-tab-button-overview" data-tab-panel="overview">
      <p class="mc-seo-summary">${escapeHtml(view.seoSummary)}</p>

      <div class="mc-overview-grid">
        ${buildOverviewStatCard("個人戦", detail.summary, "is-solo")}
        ${buildOverviewStatCard("チーム戦", detail.teamSummary, "is-team")}
        ${buildRankedMetricCard({
          title: "獲得賞金",
          value: `¥${formatYen(detail.totalPrizeMoney)}`,
          ranking: prizeRanking,
          className: "is-prize",
          footnote: "※予選や一部大会の金額は反映されていません"
        })}
        ${buildRankedMetricCard({
          title: "スコア",
          value: rankingInactive ? "−" : displayValue(scoreDisplay),
          ranking: rankingInactive ? createEmptyMetricRanking() : scoreRanking,
          className: "is-score",
          note: rankingNote
        })}
      </div>

      <div class="mc-overview-secondary-grid">
        ${buildChampionshipSection(detail.championships)}
        ${buildAppearanceSection(view.appearances)}
      </div>
    </section>
  `.trim();
}

function buildOverviewStatCard(title, summary, className) {
  const hasMatches = summary.totalMatches > 0;
  const rate = calculateRate(summary.wins, summary.totalMatches);

  return `
    <article class="mc-overview-card mc-stat-card ${escapeHtml(className)}">
      <h2 class="mc-overview-card-title">${escapeHtml(title)}</h2>
      <div class="mc-overview-card-body">
        ${hasMatches ? `
          <div class="mc-stat-main">${summary.totalMatches}戦</div>
          <div class="mc-stat-sub">${summary.wins}勝 ${summary.losses}敗</div>
          <div class="mc-stat-rate">勝率 ${formatPercent(rate)}</div>
        ` : `
          <div class="mc-stat-empty">出場履歴なし</div>
        `}
      </div>
      <div class="mc-overview-card-footer" aria-hidden="true"></div>
    </article>
  `.trim();
}

function buildRankedMetricCard({ title, value, ranking, className = "", note = "", footnote = "" }) {
  return `
    <article class="mc-overview-card mc-ranking-card ${escapeHtml(className)}">
      <h2 class="mc-overview-card-title">${escapeHtml(title)}</h2>
      <div class="mc-overview-card-body">
        <div class="mc-ranked-metric-main">
          <div class="mc-ranked-metric-value">${escapeHtml(value)}</div>
          <div class="mc-ranked-metric-rank">${ranking.rank === null ? "−" : `${ranking.rank}位`}</div>
        </div>
        <div class="mc-ranking-neighbors">
          ${buildRankingNeighbor("up", ranking.above)}
          ${buildRankingNeighbor("down", ranking.below)}
        </div>
      </div>
      <div class="mc-overview-card-footer">
        ${footnote ? `<p class="mc-card-note">${escapeHtml(footnote)}</p>` : ""}
        ${note ? `<p class="mc-card-note">${escapeHtml(note)}</p>` : ""}
      </div>
    </article>
  `.trim();
}

function buildRankingNeighbor(direction, neighbor) {
  if (!neighbor) return '<div class="mc-ranking-neighbor is-placeholder" aria-hidden="true"></div>';
  const isUp = direction === "up";

  return `
    <div class="mc-ranking-neighbor ${isUp ? "is-up" : "is-down"}">
      <span class="mc-ranking-neighbor-arrow" aria-hidden="true">${isUp ? "↑" : "↓"}</span>
      <span class="mc-ranking-neighbor-rank">${neighbor.rank}位</span>
      ${renderMcLink(neighbor.mcName, neighbor.mcId, "mc-ranking-neighbor-link")}
    </div>
  `.trim();
}

function buildChampionshipSection(championships) {
  if (!championships.length) return "";
  return buildListSection({
    title: "優勝歴",
    count: championships.length,
    listTag: "ul",
    listClass: "mc-link-list",
    items: championships.map((item, index) => renderChampionshipItem(item, index >= LIST_LIMIT))
  });
}

function renderChampionshipItem(item, hidden) {
  const eventName = cleanText(item.event_name);
  if (!eventName) return "";
  return `<li${hidden ? ' class="is-collapsed-item" hidden' : ""}>${renderEventLink(eventName, item.event_id, "championship-event-link")}</li>`;
}

function buildAppearanceSection(appearances) {
  if (!appearances.length) {
    return buildListSection({
      title: "出場大会",
      count: 0,
      content: buildEmptyState("出場大会がありません")
    });
  }

  return buildListSection({
    title: "出場大会",
    count: appearances.length,
    listTag: "ol",
    listClass: "mc-appearance-list",
    items: appearances.map((item, index) => renderAppearanceItem(item, index >= LIST_LIMIT))
  });
}

function buildListSection({ title, count, listTag = "div", listClass = "", items = [], content = "" }) {
  const hasMore = count > LIST_LIMIT;
  const listHtml = content || `<${listTag} class="${listClass}" data-collapsible-list>${items.join("")}</${listTag}>`;

  return `
    <section class="mc-content-section mc-balanced-section">
      <div class="mc-section-heading">
        <h2>${escapeHtml(title)}</h2>
        <span class="mc-section-count">${count}</span>
      </div>
      <div class="mc-balanced-section-body">${listHtml}</div>
      <div class="mc-balanced-section-footer">
        ${hasMore ? buildCollapseButton(count - LIST_LIMIT) : ""}
      </div>
    </section>
  `.trim();
}

function renderAppearanceItem(item, hidden) {
  const eventName = cleanText(item.event_name) || "大会名不明";
  const eventDate = formatDateDots(item.event_date) || "日付不明";
  return `
    <li${hidden ? ' class="is-collapsed-item" hidden' : ""}>
      <div class="mc-appearance-date">${escapeHtml(eventDate)}</div>
      <div class="mc-appearance-event">${renderEventLink(eventName, item.event_id, "mc-inline-link")}</div>
    </li>
  `.trim();
}

function buildCollapseButton(remainingCount) {
  return `
    <button type="button" class="mc-collapse-button" data-collapse-button
      data-remaining-count="${remainingCount}" aria-expanded="false">
      もっと見る（あと${remainingCount}件）
    </button>
  `.trim();
}

function buildHistory(view) {
  return `
    <section class="mc-tab-panel" id="mc-tab-history" role="tabpanel"
      aria-labelledby="mc-tab-button-history" data-tab-panel="history" hidden>
      <div class="mc-history-toolbar">
        <div class="mc-filter-stack">
          ${buildFilterRow("形式", "mode", [["all", "全て"], ["solo", "個人"], ["team", "Team"]])}
          ${buildFilterRow("勝敗", "result", [["all", "全て"], ["win", "Win"], ["loss", "Lose"]])}
        </div>
        <div class="mc-history-count" aria-live="polite"><span data-visible-count>${view.timeline.length}</span>件</div>
      </div>
      ${view.timeline.length
        ? `<ol class="mc-timeline" data-timeline>${view.timeline.map(renderTimelineItem).join("")}</ol>`
        : buildEmptyState("戦績データがありません")}
      <div class="mc-filter-empty" data-filter-empty hidden>条件に一致する戦績がありません</div>
    </section>
  `.trim();
}

function buildFilterRow(label, axis, options) {
  return `
    <div class="mc-filter-row">
      <span class="mc-filter-label">${label}</span>
      <div class="mc-filter-group" role="group" aria-label="${label}">
        ${options.map(([value, text], index) => buildFilterButton(axis, value, text, index === 0)).join("")}
      </div>
    </div>
  `.trim();
}

function buildFilterButton(axis, value, label, active) {
  return `
    <button type="button" class="mc-filter-button${active ? " is-active" : ""}"
      data-filter-axis="${axis}" data-filter-value="${value}" aria-pressed="${active}">
      ${label}
    </button>
  `.trim();
}

function renderTimelineItem(item) {
  const typeClass = `is-${item.type}`;
  return `
    <li class="mc-timeline-item ${typeClass}" data-history-item
      data-match-mode="${item.isTeam ? "team" : "solo"}" data-result-type="${item.type}">
      <div class="mc-timeline-marker" aria-hidden="true"></div>
      <article class="mc-timeline-card">
        <div class="mc-timeline-head">
          <time datetime="${escapeHtml(item.eventDate || "")}">${escapeHtml(formatDateDots(item.eventDate) || "日付不明")}</time>
          <div class="mc-result-badges">
            <span class="mc-result-badge ${typeClass}">${item.type === "win" ? "WIN" : "LOSE"}</span>
            ${item.isTeam ? '<span class="mc-result-badge is-team">TEAM</span>' : ""}
          </div>
        </div>
        <div class="mc-timeline-match">${item.isTeam ? renderTeamTimelineMatch(item) : renderSoloTimelineMatch(item)}</div>
        <div class="mc-timeline-event">
          ${renderEventLink(item.eventName || "大会名不明", item.eventId, "mc-inline-link")}
          ${item.roundName ? `<span class="mc-round-label">${escapeHtml(item.roundName)}</span>` : ""}
        </div>
      </article>
    </li>
  `.trim();
}

function renderSoloTimelineMatch(item) {
  return `<span class="mc-match-prefix">vs</span>${renderMcLink(item.opponentName || "不明", item.opponentMcId, "mc-opponent-link")}`;
}

function renderTeamTimelineMatch(item) {
  return `
    <div class="mc-team-match">
      ${renderTeamSide(item.ownTeamName, item.ownMembers, true)}
      <span class="mc-team-vs">vs</span>
      ${renderTeamSide(item.opponentTeamName, item.opponentMembers, false)}
    </div>
  `.trim();
}

function renderTeamSide(teamName, members, isOwn) {
  return `
    <div class="mc-team-side${isOwn ? " is-own" : ""}">
      ${teamName ? `<div class="mc-team-name">${escapeHtml(teamName)}</div>` : ""}
      <div class="mc-team-members">${renderTeamMemberLinks(members)}</div>
    </div>
  `.trim();
}

function buildAnalysis(view) {
  const a = view.analysis;
  return `
    <section class="mc-tab-panel" id="mc-tab-analysis" role="tabpanel"
      aria-labelledby="mc-tab-button-analysis" data-tab-panel="analysis" hidden>
      <div class="mc-analysis-grid">
        ${buildAnalysisMetric("個人戦勝率", formatPercent(a.soloWinRate), `${a.soloWins}勝 / ${a.soloMatches}戦`)}
        ${buildAnalysisMetric("チーム戦勝率", a.teamMatches ? formatPercent(a.teamWinRate) : "−", a.teamMatches ? `${a.teamWins}勝 / ${a.teamMatches}戦` : "チーム戦データなし")}
        ${buildAnalysisMetric("通算優勝回数", `${a.championshipCount}回`, "")}
        ${buildAnalysisMetric("出場大会数", `${a.appearanceCount}大会`, a.activeSpanLabel)}
      </div>
      ${buildRecentFormSection(a)}
      ${buildOpponentAnalysisSection(a)}
      ${buildYearAnalysisSection(a)}
      ${buildAnalysisNotes(a)}
    </section>
  `.trim();
}

function buildAnalysisMetric(label, value, sub) {
  return `
    <article class="mc-analysis-metric">
      <div class="mc-analysis-label">${escapeHtml(label)}</div>
      <div class="mc-analysis-value">${escapeHtml(value)}</div>
      <div class="mc-analysis-sub">${escapeHtml(sub)}</div>
    </article>
  `.trim();
}

function buildRecentFormSection(analysis) {
  if (!analysis.recentMatches.length) {
    return buildAnalysisSection("Recent form", "直近の戦績", buildEmptyState("戦績データがありません"));
  }

  const dots = analysis.recentMatches.map((item) => {
    const isWin = item.type === "win";
    return `<span class="mc-form-dot ${isWin ? "is-win" : "is-loss"}" title="${isWin ? "Win" : "Lose"}">${isWin ? "W" : "L"}</span>`;
  }).join("");

  return buildAnalysisSection(
    "Recent form",
    `直近${analysis.recentMatches.length}戦`,
    `<div class="mc-form-row" aria-label="直近の勝敗">${dots}</div><p class="mc-analysis-copy">直近${analysis.recentMatches.length}戦の勝率は${formatPercent(analysis.recentWinRate)}です。</p>`,
    `${analysis.recentWins}勝`
  );
}

function buildOpponentAnalysisSection(analysis) {
  const content = analysis.frequentOpponents.length
    ? `<ol class="mc-ranking-table">${analysis.frequentOpponents.map((item, index) => `
        <li>
          <span class="mc-table-rank">${index + 1}</span>
          <span class="mc-table-name">${renderMcLink(item.name, item.mcId, "mc-inline-link")}</span>
          <span class="mc-table-record">${item.matches}戦 ${item.wins}勝 ${item.losses}敗</span>
        </li>`).join("")}</ol>`
    : buildEmptyState("2回以上対戦した個人戦の相手はいません");

  return buildAnalysisSection("Head to head", "対戦回数の多い相手", content);
}

function buildYearAnalysisSection(analysis) {
  const content = analysis.yearlyResults.length
    ? `<div class="mc-year-list">${analysis.yearlyResults.map((item) => {
        const rate = calculateRate(item.wins, item.matches);
        return `
          <div class="mc-year-row">
            <div class="mc-year-head"><strong>${item.year}</strong><span>${item.matches}戦 ${item.wins}勝 ${item.losses}敗</span></div>
            <div class="mc-progress" aria-label="${item.year}年 勝率 ${formatPercent(rate)}"><span style="width:${clamp(rate, 0, 100)}%"></span></div>
          </div>`;
      }).join("")}</div>`
    : buildEmptyState("日付付きの戦績データがありません");

  return buildAnalysisSection("By year", "年別戦績", content);
}

function buildAnalysisNotes(analysis) {
  const notes = [];
  if (analysis.soloMatches) notes.push(`個人戦は通算${analysis.soloMatches}戦、勝率${formatPercent(analysis.soloWinRate)}。`);
  if (analysis.teamMatches) notes.push(`チーム戦は通算${analysis.teamMatches}戦、勝率${formatPercent(analysis.teamWinRate)}。`);
  if (analysis.bestYear) notes.push(`最も勝利数が多い年は${analysis.bestYear.year}年で、${analysis.bestYear.wins}勝。`);
  if (!notes.length) return "";

  return buildAnalysisSection(
    "Summary",
    "データ要約",
    `<ul class="mc-analysis-notes">${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`
  );
}

function buildAnalysisSection(kicker, title, content, count = "") {
  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div><div class="mc-section-kicker">${escapeHtml(kicker)}</div><h2>${escapeHtml(title)}</h2></div>
        ${count ? `<span class="mc-section-count">${escapeHtml(count)}</span>` : ""}
      </div>
      ${content}
    </section>
  `.trim();
}

function buildTimeline(detail) {
  return [
    ...detail.wins.map((item) => createSoloTimelineItem(item, "win")),
    ...detail.losses.map((item) => createSoloTimelineItem(item, "loss")),
    ...detail.teamWins.map((item) => createTeamTimelineItem(item, "win")),
    ...detail.teamLosses.map((item) => createTeamTimelineItem(item, "loss"))
  ].sort(compareTimelineItems);
}

function createSoloTimelineItem(item, type) {
  return {
    type,
    isTeam: false,
    eventId: cleanText(item.event_id),
    eventName: cleanText(item.event_name),
    eventDate: cleanText(item.event_date),
    roundName: normalizeRoundLabel(item.round_name),
    opponentName: cleanText(item.opponent_name),
    opponentMcId: cleanText(item.opponent_mc_id)
  };
}

function createTeamTimelineItem(item, type) {
  return {
    type,
    isTeam: true,
    eventId: cleanText(item.event_id),
    eventName: cleanText(item.event_name),
    eventDate: cleanText(item.event_date),
    roundName: normalizeRoundLabel(item.round_name),
    ownTeamName: cleanText(item.own_team_name),
    opponentTeamName: cleanText(item.opponent_team_name),
    ownMembers: normalizeMembers(item.own_members),
    opponentMembers: normalizeMembers(item.opponent_members)
  };
}

function compareTimelineItems(a, b) {
  return cleanText(b.eventDate).localeCompare(cleanText(a.eventDate)) ||
    getRoundSortValue(a.roundName) - getRoundSortValue(b.roundName) ||
    cleanText(a.eventName).localeCompare(cleanText(b.eventName), "ja") ||
    Number(a.isTeam) - Number(b.isTeam);
}

function analyzeDetail(detail, timeline, appearances) {
  const recentMatches = timeline.slice(0, RECENT_MATCH_LIMIT);
  const recentWins = recentMatches.filter((item) => item.type === "win").length;
  const yearlyResults = buildYearlyResults(timeline);
  const bestYear = [...yearlyResults].sort((a, b) => b.wins - a.wins || b.matches - a.matches)[0] || null;

  return {
    soloMatches: detail.summary.totalMatches,
    soloWins: detail.summary.wins,
    soloWinRate: calculateRate(detail.summary.wins, detail.summary.totalMatches),
    teamMatches: detail.teamSummary.totalMatches,
    teamWins: detail.teamSummary.wins,
    teamWinRate: calculateRate(detail.teamSummary.wins, detail.teamSummary.totalMatches),
    championshipCount: detail.championships.length,
    appearanceCount: appearances.length,
    activeSpanLabel: buildActiveSpanLabel(appearances),
    recentMatches,
    recentWins,
    recentWinRate: calculateRate(recentWins, recentMatches.length),
    frequentOpponents: buildOpponentStats(detail.wins, detail.losses),
    yearlyResults,
    bestYear
  };
}

function buildOpponentStats(wins, losses) {
  const rows = new Map();
  const add = (item, type) => {
    const name = cleanText(item.opponent_name) || "不明";
    const mcId = cleanText(item.opponent_mc_id);
    const key = mcId || name;
    const row = rows.get(key) || { name, mcId, matches: 0, wins: 0, losses: 0 };
    row.matches += 1;
    row[type === "win" ? "wins" : "losses"] += 1;
    rows.set(key, row);
  };

  wins.forEach((item) => add(item, "win"));
  losses.forEach((item) => add(item, "loss"));

  return [...rows.values()]
    .filter((row) => row.matches >= 2)
    .sort((a, b) => b.matches - a.matches || b.wins - a.wins || a.name.localeCompare(b.name, "ja"))
    .slice(0, FREQUENT_OPPONENT_LIMIT);
}

function buildYearlyResults(timeline) {
  const rows = new Map();
  for (const item of timeline) {
    const year = cleanText(item.eventDate).match(/^(\d{4})/)?.[1];
    if (!year) continue;
    const row = rows.get(year) || { year, matches: 0, wins: 0, losses: 0 };
    row.matches += 1;
    row[item.type === "win" ? "wins" : "losses"] += 1;
    rows.set(year, row);
  }
  return [...rows.values()].sort((a, b) => b.year.localeCompare(a.year));
}

function buildActiveSpanLabel(appearances) {
  const years = appearances
    .map((item) => cleanText(item.event_date).match(/^(\d{4})/)?.[1] || "")
    .filter(Boolean)
    .sort();
  if (!years.length) return "活動期間不明";
  return years[0] === years.at(-1) ? `${years[0]}年に出場` : `${years[0]}年〜${years.at(-1)}年`;
}

function buildGlobalRankingContext(entries) {
  const prizeRows = entries
    .map(([mcId, detail]) => ({ mcId, mcName: cleanText(detail.mc.mc_name) || "名称不明", value: detail.totalPrizeMoney }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0);

  const scoreRows = entries
    .map(([mcId, detail]) => ({
      mcId,
      mcName: cleanText(detail.mc.mc_name) || "名称不明",
      value: getNumericScore(detail.ranking),
      suppliedRank: toNullableFiniteNumber(detail.ranking.rank),
      inactive: isInactiveRanking(cleanText(detail.ranking.ranking_status))
    }))
    .filter((row) => !row.inactive && row.value !== null);

  return {
    prize: buildMetricRankingMap(prizeRows, (a, b) => b.value - a.value || a.mcName.localeCompare(b.mcName, "ja")),
    score: buildMetricRankingMap(
      scoreRows,
      (a, b) => (a.suppliedRank ?? Infinity) - (b.suppliedRank ?? Infinity) || b.value - a.value || a.mcName.localeCompare(b.mcName, "ja"),
      true
    )
  };
}

function buildMetricRankingMap(rows, compare, useSuppliedRank = false) {
  const ranked = [];
  let previousValue = null;
  let previousRank = 0;

  [...rows].sort(compare).forEach((row, index) => {
    const rank = useSuppliedRank && row.suppliedRank !== null
      ? row.suppliedRank
      : previousValue !== null && row.value === previousValue
        ? previousRank
        : index + 1;
    ranked.push({ ...row, rank });
    previousValue = row.value;
    previousRank = rank;
  });

  return new Map(ranked.map((row, index) => [row.mcId, {
    rank: row.rank,
    above: index ? toRankingNeighbor(ranked[index - 1]) : null,
    below: index < ranked.length - 1 ? toRankingNeighbor(ranked[index + 1]) : null
  }]));
}

function toRankingNeighbor(row) {
  return { mcId: row.mcId, mcName: row.mcName, rank: row.rank };
}

function createEmptyMetricRanking() {
  return { rank: null, above: null, below: null };
}

function getNumericScore(ranking) {
  const score = Number(ranking.current_score ?? ranking.score);
  return Number.isFinite(score) ? score : null;
}

function normalizeDetail(detail) {
  return {
    mc: isObject(detail.mc) ? detail.mc : {},
    ranking: isObject(detail.ranking) ? detail.ranking : {},
    summary: normalizeSummary(detail.summary),
    teamSummary: normalizeSummary(detail.team_summary),
    participatedEvents: sortAppearances(toArray(detail.participated_events)),
    teamParticipatedEvents: sortAppearances(toArray(detail.team_participated_events)),
    wins: sortMatchHistory(toArray(detail.wins_against)),
    losses: sortMatchHistory(toArray(detail.losses_against)),
    teamWins: sortTeamMatchHistory(toArray(detail.team_wins)),
    teamLosses: sortTeamMatchHistory(toArray(detail.team_losses)),
    championships: toArray(detail.championships),
    totalPrizeMoney: toFiniteNumber(detail.total_prize_money, 0)
  };
}

function normalizeSummary(summary) {
  const source = isObject(summary) ? summary : {};
  const wins = toFiniteNumber(source.wins, 0);
  const losses = toFiniteNumber(source.losses, 0);
  return {
    totalMatches: toNullableFiniteNumber(source.total_matches) ?? wins + losses,
    wins,
    losses
  };
}

function mergeAppearances(baseAppearances, teamAppearances) {
  const map = new Map();
  for (const item of [...baseAppearances, ...teamAppearances]) {
    const eventId = cleanText(item.event_id);
    const eventName = cleanText(item.event_name);
    const eventDate = cleanText(item.event_date);
    const key = eventId || `${eventName}__${eventDate}`;
    if (key && !map.has(key)) map.set(key, item);
  }
  return sortAppearances([...map.values()]);
}

function sortMatchHistory(items) {
  return [...items].sort((a, b) =>
    cleanText(b.event_date).localeCompare(cleanText(a.event_date)) ||
    getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name) ||
    cleanText(a.event_name).localeCompare(cleanText(b.event_name), "ja") ||
    cleanText(a.opponent_name).localeCompare(cleanText(b.opponent_name), "ja")
  );
}

function sortTeamMatchHistory(items) {
  return [...items].sort((a, b) =>
    cleanText(b.event_date).localeCompare(cleanText(a.event_date)) ||
    getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name) ||
    cleanText(a.event_name).localeCompare(cleanText(b.event_name), "ja") ||
    cleanText(a.opponent_team_name).localeCompare(cleanText(b.opponent_team_name), "ja")
  );
}

function sortAppearances(items) {
  return [...items].sort((a, b) =>
    cleanText(b.event_date).localeCompare(cleanText(a.event_date)) ||
    getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name) ||
    cleanText(a.event_name).localeCompare(cleanText(b.event_name), "ja")
  );
}

function renderMcLink(name, mcId, className = "") {
  const label = escapeHtml(name);
  const id = cleanText(mcId);
  return id
    ? `<a href="../detail_mc/${encodeURIComponent(id)}.html" class="${escapeHtml(className)}">${label}</a>`
    : `<span class="${escapeHtml(className)}">${label}</span>`;
}

function renderEventLink(name, eventId, className = "") {
  const label = escapeHtml(name);
  const id = cleanText(eventId);
  return id
    ? `<a href="../detail_event/${encodeURIComponent(id)}.html" class="${escapeHtml(className)}">${label}</a>`
    : `<span class="${escapeHtml(className)}">${label}</span>`;
}

function renderTeamMemberLinks(members) {
  return normalizeMembers(members)
    .map((member) => renderMcLink(member.name, member.mcId, "mc-team-member-link"))
    .join('<span class="mc-team-member-separator">・</span>') || "不明";
}

function normalizeMembers(members) {
  return toArray(members)
    .map((member) => ({ name: cleanText(member?.mc_name || member?.name), mcId: cleanText(member?.mc_id || member?.id) }))
    .filter((member) => member.name);
}

function buildMetaDescription({ mcName, summary, teamSummary, championships, totalPrizeMoney }) {
  const parts = [`${mcName}のMCバトル戦績。`];
  if (summary.totalMatches) parts.push(`個人戦${summary.totalMatches}戦${summary.wins}勝${summary.losses}敗（勝率${formatPercent(calculateRate(summary.wins, summary.totalMatches))}）。`);
  if (teamSummary.totalMatches) parts.push(`チーム戦${teamSummary.totalMatches}戦${teamSummary.wins}勝${teamSummary.losses}敗。`);
  if (championships.length) parts.push(`優勝${championships.length}回。`);
  if (totalPrizeMoney > 0) parts.push(`獲得賞金¥${formatYen(totalPrizeMoney)}。`);
  parts.push("優勝歴、出場大会、対戦履歴、スコア、年別成績を掲載。");
  return parts.join("");
}

function buildSeoSummary({ mcName, summary, teamSummary, championships, totalPrizeMoney }) {
  const parts = [];
  if (summary.totalMatches) parts.push(`個人戦${summary.totalMatches}戦${summary.wins}勝${summary.losses}敗、勝率${formatPercent(calculateRate(summary.wins, summary.totalMatches))}`);
  if (teamSummary.totalMatches) parts.push(`チーム戦${teamSummary.totalMatches}戦${teamSummary.wins}勝${teamSummary.losses}敗`);
  if (championships.length) parts.push(`優勝${championships.length}回`);
  if (totalPrizeMoney > 0) parts.push(`獲得賞金¥${formatYen(totalPrizeMoney)}`);
  return `${mcName}のMCバトル戦績ページです。${parts.length ? `${parts.join("、")}。` : "公開されている大会データを掲載しています。"}対戦履歴、出場大会、スコア、年別成績を確認できます。`;
}

function buildBreadcrumbJsonLd(mcId, mcName) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "MCBattle.jp", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "MC一覧", item: `${SITE_URL}/list_mc.html` },
      { "@type": "ListItem", position: 3, name: mcName, item: `${SITE_URL}/detail_mc/${mcId}.html` }
    ]
  }, null, 2);
}

function buildProfileJsonLd(view) {
  const { detail } = view;
  const properties = [];
  if (detail.summary.totalMatches) {
    properties.push({ "@type": "PropertyValue", name: "個人戦戦績", value: `${detail.summary.totalMatches}戦${detail.summary.wins}勝${detail.summary.losses}敗` });
    properties.push({ "@type": "PropertyValue", name: "個人戦勝率", value: formatPercent(calculateRate(detail.summary.wins, detail.summary.totalMatches)) });
  }
  if (detail.teamSummary.totalMatches) properties.push({ "@type": "PropertyValue", name: "チーム戦戦績", value: `${detail.teamSummary.totalMatches}戦${detail.teamSummary.wins}勝${detail.teamSummary.losses}敗` });
  if (detail.championships.length) properties.push({ "@type": "PropertyValue", name: "優勝回数", value: `${detail.championships.length}回` });
  if (detail.totalPrizeMoney > 0) properties.push({ "@type": "PropertyValue", name: "獲得賞金", value: `¥${formatYen(detail.totalPrizeMoney)}` });
  if (view.prizeRanking.rank !== null) properties.push({ "@type": "PropertyValue", name: "賞金ランキング", value: `${view.prizeRanking.rank}位` });
  if (!view.rankingInactive && hasValue(view.scoreDisplay)) properties.push({ "@type": "PropertyValue", name: "スコア", value: String(view.scoreDisplay) });

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${view.mcName}の戦績・勝率・優勝歴・賞金`,
    description: view.metaDescription,
    url: `${SITE_URL}/detail_mc/${view.mcId}.html`,
    inLanguage: "ja",
    isPartOf: { "@type": "WebSite", name: "MCBattle.jp", url: `${SITE_URL}/` },
    mainEntity: { "@type": "Person", name: view.mcName, url: `${SITE_URL}/detail_mc/${view.mcId}.html`, additionalProperty: properties }
  }, null, 2);
}

function buildEmptyState(message) {
  return `<div class="mc-empty-state">${escapeHtml(message)}</div>`;
}

function normalizeRoundLabel(roundName) {
  const name = cleanText(roundName);
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
  const best = normalized.match(/^Best(\d+)$/i);
  if (best) return Number(best[1]);
  const round = normalized.match(/^(\d+)回戦$/);
  return round ? 1000 + Number(round[1]) : 999999;
}

function getRankDisplay(ranking) {
  if (hasValue(ranking.rank_display)) return String(ranking.rank_display);
  const rank = Number(ranking.rank);
  return Number.isFinite(rank) && rank <= 100 ? String(rank) : "圏外";
}

function getScoreDisplay(ranking) {
  if (hasValue(ranking.score_display)) return String(ranking.score_display);
  const value = ranking.current_score ?? ranking.score;
  if (!hasValue(value)) return "";
  return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : String(value);
}

function isInactiveRanking(status) {
  return status === "inactive_3y" || status === "inactive_4y";
}

function calculateRate(wins, matches) {
  return Number.isFinite(matches) && matches > 0 ? wins / matches * 100 : 0;
}

function formatPercent(value) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1).replace(/\.0$/, "")}%`;
}

function formatYen(value) {
  return Math.round(toFiniteNumber(value, 0)).toLocaleString("ja-JP");
}

function formatDateDots(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text.replace(/-/g, ".") : text;
}

function formatDescriptionHtml(value) {
  const text = cleanText(value);
  return text ? escapeHtml(text).replace(/。+/g, (match) => `${match}<br>`).replace(/(<br>)+$/g, "") : "";
}

function displayValue(value) {
  return hasValue(value) ? String(value) : "−";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNullableFiniteNumber(value) {
  if (!hasValue(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toArray(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hasValue(value) { return value !== null && value !== undefined && value !== ""; }
function cleanText(value) { return String(value ?? "").trim(); }
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeScriptJson(jsonText) {
  return String(jsonText).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw new Error(`JSONの読み込みに失敗しました: ${filePath}\n${error.message}`); }
}
function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`ファイルが見つかりません: ${filePath}`);
}
function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }

function buildMcDetailStyles() {
  return `
    <style>
      :root {
        --mc-bg: #090909;
        --mc-card: #151515;
        --mc-border: rgba(255,255,255,.12);
        --mc-border-pc: rgba(255,255,255,.18);
        --mc-border-hover: rgba(255,255,255,.28);
        --mc-text: #f5f5f5;
        --mc-muted: rgba(255,255,255,.56);
        --mc-faint: rgba(255,255,255,.38);
        --mc-accent: #d8b46a;
        --mc-shadow: 0 8px 24px rgba(0,0,0,.45);
      }

      body { background: var(--mc-bg); }
      .mc-detail-app { position: relative; z-index: 0; isolation: isolate; margin-top: 22px; color: var(--mc-text); }
      .mc-tab-panels, .mc-tab-panel { position: relative; z-index: 0; }
      .home-header, .site-header, body > header, header[role="banner"] { position: relative; z-index: 1000; pointer-events: auto; }
      .home-header a, .home-header button, .site-header a, .site-header button, body > header a, body > header button, header[role="banner"] a, header[role="banner"] button { position: relative; z-index: 1001; pointer-events: auto; touch-action: manipulation; }
      .home-header::before, .home-header::after, .site-header::before, .site-header::after, body > header::before, body > header::after, header[role="banner"]::before, header[role="banner"]::after { pointer-events: none; }

      .mc-tabs { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 4px; margin-bottom: 14px; padding: 4px; border: 1px solid rgba(255,255,255,.10); border-radius: 13px; background: #111; }
      .mc-tab-button, .mc-filter-button, .mc-collapse-button { appearance: none; font: inherit; cursor: pointer; }
      .mc-tab-button { min-height: 40px; border: 0; border-radius: 9px; color: rgba(255,255,255,.58); background: transparent; font-weight: 750; letter-spacing: .03em; transition: background .16s ease,color .16s ease; }
      .mc-tab-button:hover { color: #fff; background: rgba(255,255,255,.05); }
      .mc-tab-button.is-active { color: #15110a; background: var(--mc-accent); }
      .mc-tab-button:focus-visible, .mc-filter-button:focus-visible, .mc-collapse-button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
      .mc-tab-panel[hidden], .mc-timeline-item[hidden], .is-collapsed-item[hidden] { display: none !important; }
      .mc-seo-summary { margin: 0 0 12px; color: var(--mc-muted); font-size: .82rem; line-height: 1.65; }

      .mc-overview-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
      .mc-overview-card, .mc-analysis-metric, .mc-content-section, .mc-timeline-card { box-sizing: border-box; border: 1px solid var(--mc-border); background: var(--mc-card); box-shadow: var(--mc-shadow); transition: border-color .16s ease, transform .16s ease; }
      .mc-overview-card:hover, .mc-analysis-metric:hover, .mc-content-section:hover, .mc-timeline-card:hover { border-color: var(--mc-border-hover); }
      .mc-overview-card { display: grid; grid-template-rows: auto 1fr auto; min-height: 180px; border-radius: 15px; padding: 15px 16px; }
      .mc-overview-card-title { margin: 0; color: rgba(255,255,255,.72); font-size: .86rem; font-weight: 800; letter-spacing: .04em; }
      .mc-overview-card-body { display: flex; flex-direction: column; justify-content: center; min-height: 0; }
      .mc-overview-card-footer { min-height: 22px; }
      .mc-stat-main, .mc-ranked-metric-value { color: #fff; font-size: clamp(1.65rem,5vw,2.25rem); font-weight: 850; line-height: 1.08; letter-spacing: -.025em; overflow-wrap: anywhere; }
      .mc-stat-sub { margin-top: 7px; color: rgba(255,255,255,.66); font-size: .9rem; }
      .mc-stat-rate { margin-top: 7px; color: var(--mc-accent); font-size: .82rem; font-weight: 750; }
      .mc-stat-empty { display: flex; align-items: center; min-height: 82px; color: var(--mc-faint); font-size: .95rem; font-weight: 650; }
      .mc-ranked-metric-main { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .mc-ranked-metric-rank { flex: 0 0 auto; color: var(--mc-accent); font-size: 1rem; font-weight: 850; }
      .mc-ranking-neighbors { display: grid; min-height: 74px; }
      .mc-ranking-neighbor { display: grid; grid-template-columns: 17px auto minmax(0,1fr); align-items: center; gap: 7px; min-height: 36px; border-top: 1px solid rgba(255,255,255,.07); color: var(--mc-muted); font-size: .77rem; }
      .mc-ranking-neighbor-arrow { color: var(--mc-accent); font-weight: 900; }
      .mc-ranking-neighbor-rank { white-space: nowrap; }
      .mc-ranking-neighbor-link { min-width: 0; color: rgba(255,255,255,.76); font-weight: 700; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mc-ranking-neighbor-link:hover { color: var(--mc-accent); text-decoration: underline; text-underline-offset: 3px; }
      .mc-card-note { margin: 7px 0 0; color: var(--mc-faint); font-size: .73rem; line-height: 1.45; }

      .mc-overview-secondary-grid { display: block; }
      .mc-content-section { margin-top: 12px; border-radius: 15px; padding: 14px 16px; }
      .mc-balanced-section { display: grid; grid-template-rows: auto 1fr auto; }
      .mc-balanced-section-footer { min-height: 42px; display: flex; align-items: flex-end; }
      .mc-section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
      .mc-section-heading h2 { margin: 0; font-size: 1.04rem; font-weight: 800; }
      .mc-section-kicker, .mc-analysis-label { color: var(--mc-faint); font-size: .71rem; font-weight: 750; letter-spacing: .11em; text-transform: uppercase; }
      .mc-section-count { color: var(--mc-accent); font-size: .88rem; font-weight: 850; }
      .mc-link-list, .mc-analysis-notes, .mc-appearance-list, .mc-ranking-table, .mc-timeline { margin: 0; padding: 0; list-style: none; }
      .mc-link-list li, .mc-analysis-notes li { padding: 10px 0; border-top: 1px solid rgba(255,255,255,.07); line-height: 1.5; }
      .mc-link-list li:first-child, .mc-analysis-notes li:first-child { border-top: 0; }
      .mc-appearance-list li { display: grid; grid-template-columns: 108px minmax(0,1fr); gap: 12px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,.07); }
      .mc-appearance-list li:first-child { border-top: 0; }
      .mc-appearance-date { color: var(--mc-faint); font-size: .79rem; font-variant-numeric: tabular-nums; }
      .mc-appearance-event { min-width: 0; line-height: 1.45; }
      .mc-inline-link, .championship-event-link, .mc-opponent-link, .mc-team-member-link { color: inherit; text-decoration-color: rgba(216,180,106,.52); text-underline-offset: 3px; }
      .mc-inline-link:hover, .championship-event-link:hover, .mc-opponent-link:hover, .mc-team-member-link:hover { color: var(--mc-accent); }
      .mc-collapse-button { min-height: 36px; margin-top: 10px; padding: 0 14px; border: 1px solid rgba(216,180,106,.34); border-radius: 9px; color: rgba(255,255,255,.86); background: transparent; font-size: .8rem; font-weight: 750; }
      .mc-collapse-button:hover { color: #17130b; background: var(--mc-accent); }

      .mc-history-toolbar { position: sticky; top: 8px; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 9px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; background: rgba(14,14,14,.94); backdrop-filter: blur(14px); box-shadow: 0 8px 22px rgba(0,0,0,.35); }
      .mc-filter-stack { display: grid; gap: 8px; min-width: 0; }
      .mc-filter-row { display: grid; grid-template-columns: 54px minmax(0,1fr); align-items: center; gap: 8px; }
      .mc-filter-label { color: var(--mc-faint); font-size: .7rem; font-weight: 750; white-space: nowrap; }
      .mc-filter-group { display: flex; flex-wrap: wrap; gap: 6px; }
      .mc-filter-button { min-height: 31px; padding: 0 12px; border: 0; border-radius: 999px; color: rgba(255,255,255,.62); background: rgba(255,255,255,.06); font-size: .78rem; font-weight: 750; }
      .mc-filter-button:hover { color: #fff; background: rgba(255,255,255,.11); }
      .mc-filter-button.is-active { color: #17130b; background: var(--mc-accent); }
      .mc-history-count { color: var(--mc-faint); font-size: .79rem; font-variant-numeric: tabular-nums; }
      .mc-timeline { position: relative; padding-left: 25px; }
      .mc-timeline::before { content: ""; position: absolute; top: 8px; bottom: 8px; left: 7px; width: 1px; background: rgba(255,255,255,.17); }
      .mc-timeline-item { position: relative; margin-bottom: 8px; }
      .mc-timeline-marker { position: absolute; top: 21px; left: -23px; width: 10px; height: 10px; border: 3px solid #090909; border-radius: 50%; background: #777; box-shadow: 0 0 0 1px rgba(255,255,255,.20); }
      .mc-timeline-item.is-win .mc-timeline-marker { background: var(--mc-accent); }
      .mc-timeline-card { border-radius: 14px; padding: 12px 14px; }
      .mc-timeline-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .mc-timeline-head time { color: var(--mc-faint); font-size: .76rem; font-variant-numeric: tabular-nums; }
      .mc-result-badges { display: flex; gap: 5px; }
      .mc-result-badge { display: inline-flex; align-items: center; min-height: 21px; padding: 0 7px; border-radius: 999px; font-size: .64rem; font-weight: 900; letter-spacing: .08em; }
      .mc-result-badge.is-win { color: #17130b; background: var(--mc-accent); }
      .mc-result-badge.is-loss { color: rgba(255,255,255,.76); background: rgba(255,255,255,.11); }
      .mc-result-badge.is-team { color: rgba(255,255,255,.74); border: 1px solid rgba(255,255,255,.16); background: transparent; }
      .mc-timeline-match { margin-top: 6px; color: #fff; font-size: 1rem; font-weight: 780; line-height: 1.45; }
      .mc-match-prefix { margin-right: 7px; color: var(--mc-faint); font-size: .75rem; font-weight: 500; }
      .mc-timeline-event { display: flex; flex-wrap: wrap; gap: 6px 9px; margin-top: 5px; color: var(--mc-muted); font-size: .79rem; line-height: 1.4; }
      .mc-round-label::before { content: "/"; margin-right: 9px; color: rgba(255,255,255,.20); }
      .mc-team-match { display: grid; grid-template-columns: minmax(0,1fr) auto minmax(0,1fr); align-items: center; gap: 9px; }
      .mc-team-side { min-width: 0; }
      .mc-team-side:last-child { text-align: right; }
      .mc-team-name { margin-bottom: 3px; color: var(--mc-faint); font-size: .71rem; font-weight: 650; }
      .mc-team-members { word-break: break-word; }
      .mc-team-vs { color: rgba(255,255,255,.28); font-size: .68rem; }
      .mc-team-member-separator { color: rgba(255,255,255,.24); }

      .mc-analysis-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
      .mc-analysis-metric { border-radius: 14px; padding: 13px 14px; }
      .mc-analysis-value { margin-top: 5px; color: #fff; font-size: 1.55rem; font-weight: 850; line-height: 1.15; }
      .mc-analysis-sub, .mc-analysis-copy { margin-top: 4px; color: var(--mc-muted); font-size: .8rem; line-height: 1.55; }
      .mc-form-row { display: flex; flex-wrap: wrap; gap: 7px; }
      .mc-form-dot { display: inline-flex; align-items: center; justify-content: center; width: 31px; height: 31px; border-radius: 50%; font-size: .72rem; font-weight: 900; }
      .mc-form-dot.is-win { color: #17130b; background: var(--mc-accent); }
      .mc-form-dot.is-loss { color: rgba(255,255,255,.66); background: rgba(255,255,255,.1); }
      .mc-ranking-table li { display: grid; grid-template-columns: 26px minmax(0,1fr) auto; align-items: center; gap: 9px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,.07); }
      .mc-ranking-table li:first-child { border-top: 0; }
      .mc-table-rank { color: var(--mc-faint); font-size: .74rem; }
      .mc-table-name { min-width: 0; font-weight: 750; }
      .mc-table-record { color: var(--mc-muted); font-size: .78rem; }
      .mc-year-list { display: grid; gap: 13px; }
      .mc-year-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
      .mc-year-head span { color: var(--mc-muted); font-size: .78rem; }
      .mc-progress { overflow: hidden; height: 7px; border-radius: 999px; background: rgba(255,255,255,.08); }
      .mc-progress span { display: block; height: 100%; border-radius: inherit; background: var(--mc-accent); }
      .mc-empty-state, .mc-filter-empty { padding: 24px 16px; border: 1px dashed rgba(255,255,255,.13); border-radius: 13px; color: var(--mc-faint); text-align: center; font-size: .84rem; }
      .mc-filter-empty { margin-top: 14px; }

      @media (min-width: 761px) {
        .mc-overview-card, .mc-analysis-metric, .mc-content-section, .mc-timeline-card { border-color: var(--mc-border-pc); }
      }

      @media (min-width: 900px) {
        .mc-detail-app { margin-top: 24px; }
        .mc-overview-grid { grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
        .mc-overview-card { min-height: 188px; padding: 14px 15px; }
        .mc-overview-secondary-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; align-items: stretch; }
        .mc-overview-secondary-grid > .mc-content-section { margin-top: 10px; min-width: 0; height: 100%; }
        .mc-overview-secondary-grid > .mc-content-section:only-child { grid-column: 1 / -1; }
        .mc-balanced-section { min-height: 356px; }
        .mc-link-list li, .mc-appearance-list li { min-height: 47px; box-sizing: border-box; }
        .mc-analysis-grid { grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; }
        .mc-analysis-metric { padding: 12px 13px; }
        .mc-tab-panel[data-tab-panel="analysis"] .mc-content-section { max-width: 1180px; margin-left: auto; margin-right: auto; }
        .mc-timeline { max-width: 1100px; margin: 0 auto; }
        .mc-history-toolbar { top: 10px; }
      }

      @media (max-width: 760px) {
        .mc-overview-secondary-grid { display: block; }
        .mc-appearance-list li { grid-template-columns: 92px minmax(0,1fr); }
      }

      @media (max-width: 520px) {
        .mc-detail-app { margin-top: 17px; }
        .mc-tab-button { min-height: 39px; font-size: .86rem; }
        .mc-overview-card { min-height: 168px; }
        .mc-analysis-grid { grid-template-columns: 1fr; }
        .mc-history-toolbar { position: static; display: block; }
        .mc-filter-row { grid-template-columns: 52px minmax(0,1fr); }
        .mc-filter-group { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }
        .mc-filter-button { min-width: 0; padding: 0 6px; font-size: .73rem; }
        .mc-history-count { margin-top: 8px; text-align: right; }
        .mc-timeline { padding-left: 21px; }
        .mc-timeline-marker { left: -19px; }
        .mc-team-match { grid-template-columns: 1fr; gap: 5px; }
        .mc-team-side:last-child { text-align: left; }
        .mc-team-vs { display: none; }
        .mc-team-side:last-child::before { content: "vs "; color: rgba(255,255,255,.3); font-size: .68rem; }
        .mc-ranking-table li { grid-template-columns: 23px minmax(0,1fr); }
        .mc-table-record { grid-column: 2; }
      }
    </style>
  `.trim();
}

function buildMcDetailScript() {
  return `
    <script>
      (() => {
        const app = document.querySelector("[data-mc-detail-app]");
        if (!app) return;

        const tabButtons = [...app.querySelectorAll("[data-tab-target]")];
        const tabPanels = [...app.querySelectorAll("[data-tab-panel]")];
        const filterButtons = [...app.querySelectorAll("[data-filter-axis][data-filter-value]")];
        const historyItems = [...app.querySelectorAll("[data-history-item]")];
        const collapseButtons = [...app.querySelectorAll("[data-collapse-button]")];
        const visibleCount = app.querySelector("[data-visible-count]");
        const filterEmpty = app.querySelector("[data-filter-empty]");
        const filters = { mode: "all", result: "all" };

        const activateTab = (name, { focus = false, updateHash = true } = {}) => {
          tabButtons.forEach((button) => {
            const active = button.dataset.tabTarget === name;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
            if (active && focus) button.focus();
          });

          tabPanels.forEach((panel) => {
            const active = panel.dataset.tabPanel === name;
            panel.classList.toggle("is-active", active);
            panel.hidden = !active;
          });

          if (updateHash && history.replaceState) {
            history.replaceState(null, "", location.pathname + location.search + (name === "overview" ? "" : "#" + name));
          }
        };

        const applyFilters = () => {
          let count = 0;
          historyItems.forEach((item) => {
            const visible = (filters.mode === "all" || item.dataset.matchMode === filters.mode) &&
              (filters.result === "all" || item.dataset.resultType === filters.result);
            item.hidden = !visible;
            if (visible) count += 1;
          });

          filterButtons.forEach((button) => {
            const active = filters[button.dataset.filterAxis] === button.dataset.filterValue;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
          });

          if (visibleCount) visibleCount.textContent = String(count);
          if (filterEmpty) filterEmpty.hidden = count !== 0;
        };

        tabButtons.forEach((button, index) => {
          button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
          button.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            let next = index;
            if (event.key === "ArrowLeft") next = (index - 1 + tabButtons.length) % tabButtons.length;
            if (event.key === "ArrowRight") next = (index + 1) % tabButtons.length;
            if (event.key === "Home") next = 0;
            if (event.key === "End") next = tabButtons.length - 1;
            activateTab(tabButtons[next].dataset.tabTarget, { focus: true });
          });
        });

        filterButtons.forEach((button) => {
          button.addEventListener("click", () => {
            const axis = button.dataset.filterAxis;
            if (!(axis in filters)) return;
            filters[axis] = button.dataset.filterValue;
            applyFilters();
          });
        });

        collapseButtons.forEach((button) => {
          button.addEventListener("click", () => {
            const section = button.closest(".mc-content-section");
            if (!section) return;
            const items = [...section.querySelectorAll(".is-collapsed-item")];
            const expanded = button.getAttribute("aria-expanded") === "true";
            items.forEach((item) => { item.hidden = expanded; });
            button.setAttribute("aria-expanded", String(!expanded));
            button.textContent = expanded
              ? "もっと見る（あと" + (button.dataset.remainingCount || items.length) + "件）"
              : "閉じる";
          });
        });

        const initial = location.hash.slice(1);
        activateTab(tabButtons.some((button) => button.dataset.tabTarget === initial) ? initial : "overview", { updateHash: false });
        applyFilters();
      })();
    </script>
  `.trim();
}

main();
