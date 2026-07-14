const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const TEMPLATE_PATH = path.join(ROOT_DIR, "templates", "mc-template.html");
const DATA_PATH = path.join(ROOT_DIR, "data", "mc_details_all.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "detail_mc");

const SITE_URL = "https://mcbattle.jp";

function main() {
  ensureFileExists(TEMPLATE_PATH);
  ensureFileExists(DATA_PATH);
  ensureDir(OUTPUT_DIR);

  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const data = readJson(DATA_PATH);
  const detailMap = isObject(data?.mc_details) ? data.mc_details : {};
  const entries = Object.entries(detailMap);

  if (!entries.length) {
    console.log("mc_details が見つかりませんでした。");
    return;
  }

  const normalizedEntries = entries
    .filter(([, rawDetail]) => isObject(rawDetail) && isObject(rawDetail.mc))
    .map(([mcId, rawDetail]) => [mcId, normalizeDetail(rawDetail)]);

  const globalRankingContext = buildGlobalRankingContext(normalizedEntries);

  let generatedCount = 0;
  const errors = [];

  for (const [mcId, detail] of normalizedEntries) {
    try {
      const html = buildMcPage(template, mcId, detail, globalRankingContext);
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

function buildMcPage(template, mcId, detail, globalRankingContext) {
  const view = createPageViewModel(mcId, detail, globalRankingContext);
  const replacements = createTemplateReplacements(view);

  let html = template;

  for (const [placeholder, value] of Object.entries(replacements)) {
    html = html.replaceAll(placeholder, value);
  }

  return html;
}

function createPageViewModel(mcId, detail, globalRankingContext) {
  const mcName = cleanText(detail.mc.mc_name) || "このMC";
  const mcSubName = cleanText(detail.mc.mc_name_sub);
  const mcDescription = cleanText(
    detail.mc.mc_description ||
    detail.mc.description ||
    detail.mc.notes_public
  );

  const rankingStatus = cleanText(detail.ranking.ranking_status);
  const rankDisplay = getRankDisplay(detail.ranking);
  const scoreDisplay = getScoreDisplay(detail.ranking);
  const rankingInactive = isInactiveRanking(rankingStatus);
  const prizeRanking = globalRankingContext.prize.get(mcId) || createEmptyMetricRanking();
  const scoreRanking = globalRankingContext.score.get(mcId) || createEmptyMetricRanking();

  const timeline = buildTimeline(detail);
  const appearances = mergeAppearances(
    detail.participatedEvents,
    detail.teamParticipatedEvents
  );
  const analysis = analyzeDetail(detail, timeline, appearances);

  const pageTitle = `${mcName}の戦績・勝率・優勝歴・賞金 | MCBattle.jp`;
  const metaDescription = buildMetaDescription({
    mcName,
    summary: detail.summary,
    teamSummary: detail.teamSummary,
    championships: detail.championships,
    totalPrizeMoney: detail.totalPrizeMoney
  });

  const seoSummary = buildSeoSummary({
    mcName,
    summary: detail.summary,
    teamSummary: detail.teamSummary,
    championships: detail.championships,
    totalPrizeMoney: detail.totalPrizeMoney
  });

  return {
    mcId,
    mcName,
    mcSubName,
    mcDescription,
    pageTitle,
    metaDescription,
    seoSummary,
    rankingStatus,
    rankingInactive,
    rankDisplay,
    scoreDisplay,
    prizeRanking,
    scoreRanking,
    detail,
    timeline,
    appearances,
    analysis
  };
}

function createTemplateReplacements(view) {
  const appHtml = buildMcDetailApp(view);

  return {
    "__PAGE_TITLE__": escapeHtml(view.pageTitle),
    "__META_DESCRIPTION__": escapeHtml(view.metaDescription),
    "__MC_ID__": escapeHtml(view.mcId),
    "__BREADCRUMB_JSON_LD__": escapeScriptJson(
      buildBreadcrumbJsonLd(view.mcId, view.mcName)
    ),
    "__PROFILE_JSON_LD__": escapeScriptJson(
      buildProfileJsonLd(view)
    ),
    "__MC_TITLE__": escapeHtml(view.mcName),
    "__MC_SUBNAME__": escapeHtml(view.mcSubName),
    "__MC_SUBNAME_HIDDEN_CLASS__": view.mcSubName ? "" : "is-hidden",
    "__MC_DESCRIPTION__": formatDescriptionHtml(view.mcDescription),
    "__MC_DESCRIPTION_HIDDEN_CLASS__": view.mcDescription ? "" : "is-hidden",

    /*
     * 既存テンプレートの構造を維持したまま、
     * __MC_META__ の位置へ新UIをまとめて注入する。
     */
    "__MC_META__": appHtml,

    /*
     * 旧セクションは新UIと重複するため非表示にする。
     * テンプレートを同時変更しなくても動作するための互換処理。
     */
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
    buildOverviewTab(view),
    buildHistoryTab(view),
    buildAnalysisTab(view),
    "</div>",
    "</div>",
    buildMcDetailStyles(),
    buildMcDetailScript()
  ].join("\n");
}

function buildTabNavigation() {
  return `
    <div class="mc-tabs" role="tablist" aria-label="MC詳細">
      <button
        type="button"
        class="mc-tab-button is-active"
        role="tab"
        aria-selected="true"
        aria-controls="mc-tab-overview"
        id="mc-tab-button-overview"
        data-tab-target="overview"
      >概要</button>
      <button
        type="button"
        class="mc-tab-button"
        role="tab"
        aria-selected="false"
        aria-controls="mc-tab-history"
        id="mc-tab-button-history"
        data-tab-target="history"
        tabindex="-1"
      >戦績</button>
      <button
        type="button"
        class="mc-tab-button"
        role="tab"
        aria-selected="false"
        aria-controls="mc-tab-analysis"
        id="mc-tab-button-analysis"
        data-tab-target="analysis"
        tabindex="-1"
      >分析</button>
    </div>
  `.trim();
}

function buildOverviewTab(view) {
  const {
    detail,
    rankingInactive,
    scoreDisplay,
    prizeRanking,
    scoreRanking,
    appearances
  } = view;

  const summary = detail.summary;
  const teamSummary = detail.teamSummary;
  const rankingNote = rankingInactive
    ? "直近の参加実績不足によりスコア対象外"
    : "";

  return `
    <section
      class="mc-tab-panel is-active"
      id="mc-tab-overview"
      role="tabpanel"
      aria-labelledby="mc-tab-button-overview"
      data-tab-panel="overview"
    >
      <p class="mc-seo-summary">${escapeHtml(view.seoSummary)}</p>

      <div class="mc-overview-grid ${teamSummary.totalMatches > 0 ? "has-team" : "no-team"}">
        ${buildPrimaryStats(summary, teamSummary)}
        ${buildRankedMetricCard({
          title: "獲得賞金",
          value: `¥${formatYen(detail.totalPrizeMoney)}`,
          ranking: prizeRanking,
          className: "is-prize"
        })}
        ${buildRankedMetricCard({
          title: "スコア",
          value: rankingInactive ? "−" : displayValue(scoreDisplay),
          ranking: rankingInactive ? createEmptyMetricRanking() : scoreRanking,
          note: rankingNote,
          className: "is-score"
        })}
      </div>

      <div class="mc-overview-secondary-grid">
        ${buildChampionshipSection(detail.championships)}
        ${buildAppearanceSection(appearances)}
      </div>
    </section>
  `.trim();
}

function buildPrimaryStats(summary, teamSummary) {
  const soloWinRate = calculateRate(summary.wins, summary.totalMatches);
  const teamWinRate = calculateRate(teamSummary.wins, teamSummary.totalMatches);

  const cards = [
    buildStatCard(
      "個人戦",
      `${summary.totalMatches}戦`,
      `${summary.wins}勝 ${summary.losses}敗`,
      soloWinRate,
      "is-solo"
    ),
    teamSummary.totalMatches > 0
      ? buildStatCard(
          "チーム戦",
          `${teamSummary.totalMatches}戦`,
          `${teamSummary.wins}勝 ${teamSummary.losses}敗`,
          teamWinRate,
          "is-team"
        )
      : ""
  ].filter(Boolean);

  return `<div class="mc-stat-grid">${cards.join("")}</div>`;
}

function buildStatCard(label, main, sub, rate = null, className = "") {
  return `
    <article class="mc-stat-card ${escapeHtml(className)}">
      <div class="mc-stat-label">${escapeHtml(label)}</div>
      <div class="mc-stat-main">${escapeHtml(main)}</div>
      <div class="mc-stat-sub">${escapeHtml(sub)}</div>
      ${rate === null ? "" : `<div class="mc-stat-rate">勝率 ${formatPercent(rate)}</div>`}
    </article>
  `.trim();
}

function buildRankedMetricCard(params) {
  const {
    title,
    value,
    ranking,
    note = "",
    className = ""
  } = params;

  const rankText = ranking.rank === null ? "−" : `${ranking.rank}位`;

  return `
    <article class="mc-ranking-card ${escapeHtml(className)}">
      <h2 class="mc-card-title">${escapeHtml(title)}</h2>

      <div class="mc-ranked-metric-main">
        <div class="mc-ranked-metric-value">${escapeHtml(value)}</div>
        <div class="mc-ranked-metric-rank">${escapeHtml(rankText)}</div>
      </div>

      ${buildRankingNeighbor("up", ranking.above)}
      ${buildRankingNeighbor("down", ranking.below)}

      ${
        title === "獲得賞金"
          ? `<p class="mc-card-note">※予選や一部大会の金額は反映されていません</p>`
          : ""
      }
      ${note ? `<p class="mc-card-note">${escapeHtml(note)}</p>` : ""}
    </article>
  `.trim();
}

function buildRankingNeighbor(direction, neighbor) {
  if (!neighbor) return "";

  const arrow = direction === "up" ? "↑" : "↓";
  const directionClass = direction === "up" ? "is-up" : "is-down";

  return `
    <div class="mc-ranking-neighbor ${directionClass}">
      <span class="mc-ranking-neighbor-arrow" aria-hidden="true">${arrow}</span>
      <span class="mc-ranking-neighbor-rank">${neighbor.rank}位</span>
      ${renderMcLink(neighbor.mcName, neighbor.mcId, "mc-ranking-neighbor-link")}
    </div>
  `.trim();
}

function buildChampionshipSection(championships) {
  if (!championships.length) return "";

  const visibleLimit = 5;
  const hasMore = championships.length > visibleLimit;

  const body = `
    <ul class="mc-link-list" data-collapsible-list>
      ${championships.map((item, index) => renderChampionshipItem(item, index >= visibleLimit)).join("")}
    </ul>
    ${hasMore ? buildCollapseButton(championships.length - visibleLimit) : ""}
  `;

  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div>
          <h2>優勝歴</h2>
        </div>
        <span class="mc-section-count">${championships.length}</span>
      </div>
      ${body}
    </section>
  `.trim();
}

function renderChampionshipItem(item, hidden = false) {
  const eventName = cleanText(item.event_name);
  if (!eventName) return "";

  return `
    <li${hidden ? ' class="is-collapsed-item" hidden' : ""}>
      ${renderEventLink(eventName, item.event_id, "championship-event-link")}
    </li>
  `.trim();
}


function buildAppearanceSection(appearances) {
  const visibleLimit = 5;
  const hasMore = appearances.length > visibleLimit;

  const body = appearances.length
    ? `
      <ol class="mc-appearance-list" data-collapsible-list>
        ${appearances.map((item, index) => renderAppearanceItem(item, index >= visibleLimit)).join("")}
      </ol>
      ${hasMore ? buildCollapseButton(appearances.length - visibleLimit) : ""}
    `
    : buildEmptyState("出場大会がありません");

  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div>
          <h2>出場大会</h2>
        </div>
        <span class="mc-section-count">${appearances.length}</span>
      </div>
      ${body}
    </section>
  `.trim();
}

function renderAppearanceItem(item, hidden = false) {
  const eventName = cleanText(item.event_name) || "大会名不明";
  const eventDate = formatDateDots(item.event_date);

  return `
    <li${hidden ? ' class="is-collapsed-item" hidden' : ""}>
      <div class="mc-appearance-date">${escapeHtml(eventDate || "日付不明")}</div>
      <div class="mc-appearance-event">
        ${renderEventLink(eventName, item.event_id, "mc-inline-link")}
      </div>
    </li>
  `.trim();
}

function buildCollapseButton(remainingCount) {
  return `
    <button
      type="button"
      class="mc-collapse-button"
      data-collapse-button
      data-remaining-count="${remainingCount}"
      aria-expanded="false"
    >
      もっと見る（あと${remainingCount}件）
    </button>
  `.trim();
}


function buildHistoryTab(view) {
  const count = view.timeline.length;

  return `
    <section
      class="mc-tab-panel"
      id="mc-tab-history"
      role="tabpanel"
      aria-labelledby="mc-tab-button-history"
      data-tab-panel="history"
      hidden
    >
      <div class="mc-history-toolbar">
        <div class="mc-filter-stack">
          <div class="mc-filter-row">
            <span class="mc-filter-label">形式</span>
            <div class="mc-filter-group" role="group" aria-label="形式">
              ${buildFilterButton("mode", "all", "全て", true)}
              ${buildFilterButton("mode", "solo", "個人")}
              ${buildFilterButton("mode", "team", "Team")}
            </div>
          </div>

          <div class="mc-filter-row">
            <span class="mc-filter-label">勝敗</span>
            <div class="mc-filter-group" role="group" aria-label="勝敗">
              ${buildFilterButton("result", "all", "全て", true)}
              ${buildFilterButton("result", "win", "Win")}
              ${buildFilterButton("result", "loss", "Lose")}
            </div>
          </div>
        </div>

        <div class="mc-history-count" aria-live="polite">
          <span data-visible-count>${count}</span>件
        </div>
      </div>

      ${
        count
          ? `<ol class="mc-timeline" data-timeline>${view.timeline.map(renderTimelineItem).join("")}</ol>`
          : buildEmptyState("戦績データがありません")
      }

      <div class="mc-filter-empty" data-filter-empty hidden>
        条件に一致する戦績がありません
      </div>
    </section>
  `.trim();
}

function buildFilterButton(axis, value, label, active = false) {
  return `
    <button
      type="button"
      class="mc-filter-button${active ? " is-active" : ""}"
      data-filter-axis="${escapeHtml(axis)}"
      data-filter-value="${escapeHtml(value)}"
      aria-pressed="${active ? "true" : "false"}"
    >${escapeHtml(label)}</button>
  `.trim();
}

function renderTimelineItem(item) {
  const typeClass = `is-${item.type}`;
  const matchMode = item.isTeam ? "team" : "solo";
  const resultType = item.type;

  return `
    <li
      class="mc-timeline-item ${typeClass}"
      data-history-item
      data-match-mode="${escapeHtml(matchMode)}"
      data-result-type="${escapeHtml(resultType)}"
    >
      <div class="mc-timeline-marker" aria-hidden="true"></div>
      <article class="mc-timeline-card">
        <div class="mc-timeline-head">
          <time datetime="${escapeHtml(item.eventDate || "")}">
            ${escapeHtml(formatDateDots(item.eventDate) || "日付不明")}
          </time>
          <div class="mc-result-badges">
            <span class="mc-result-badge ${typeClass}">${item.type === "win" ? "WIN" : "LOSE"}</span>
            ${item.isTeam ? '<span class="mc-result-badge is-team">TEAM</span>' : ""}
          </div>
        </div>

        <div class="mc-timeline-match">
          ${item.isTeam ? renderTeamTimelineMatch(item) : renderSoloTimelineMatch(item)}
        </div>

        <div class="mc-timeline-event">
          ${renderEventLink(item.eventName || "大会名不明", item.eventId, "mc-inline-link")}
          ${item.roundName ? `<span class="mc-round-label">${escapeHtml(item.roundName)}</span>` : ""}
        </div>
      </article>
    </li>
  `.trim();
}

function renderSoloTimelineMatch(item) {
  return `
    <span class="mc-match-prefix">vs</span>
    ${renderMcLink(item.opponentName || "不明", item.opponentMcId, "mc-opponent-link")}
  `.trim();
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

function buildAnalysisTab(view) {
  const a = view.analysis;

  return `
    <section
      class="mc-tab-panel"
      id="mc-tab-analysis"
      role="tabpanel"
      aria-labelledby="mc-tab-button-analysis"
      data-tab-panel="analysis"
      hidden
    >
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
    return `
      <section class="mc-content-section">
        <div class="mc-section-heading">
          <div>
            <div class="mc-section-kicker">Recent form</div>
            <h2>直近の戦績</h2>
          </div>
        </div>
        ${buildEmptyState("戦績データがありません")}
      </section>
    `.trim();
  }

  const resultHtml = analysis.recentMatches
    .map((item) => {
      const className = item.type === "win" ? "is-win" : "is-loss";
      return `<span class="mc-form-dot ${className}" title="${item.type === "win" ? "Win" : "Lose"}">${item.type === "win" ? "W" : "L"}</span>`;
    })
    .join("");

  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div>
          <div class="mc-section-kicker">Recent form</div>
          <h2>直近${analysis.recentMatches.length}戦</h2>
        </div>
        <span class="mc-section-count">${analysis.recentWins}勝</span>
      </div>
      <div class="mc-form-row" aria-label="直近の勝敗">${resultHtml}</div>
      <p class="mc-analysis-copy">
        直近${analysis.recentMatches.length}戦の勝率は${formatPercent(analysis.recentWinRate)}です。
      </p>
    </section>
  `.trim();
}

function buildOpponentAnalysisSection(analysis) {
  const items = analysis.frequentOpponents;

  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div>
          <div class="mc-section-kicker">Head to head</div>
          <h2>対戦回数の多い相手</h2>
        </div>
      </div>
      ${
        items.length
          ? `
            <ol class="mc-ranking-table">
              ${items.map((item, index) => `
                <li>
                  <span class="mc-table-rank">${index + 1}</span>
                  <span class="mc-table-name">${renderMcLink(item.name, item.mcId, "mc-inline-link")}</span>
                  <span class="mc-table-record">${item.matches}戦 ${item.wins}勝 ${item.losses}敗</span>
                </li>
              `).join("")}
            </ol>
          `
          : buildEmptyState("個人戦の対戦相手データがありません")
      }
    </section>
  `.trim();
}

function buildYearAnalysisSection(analysis) {
  const items = analysis.yearlyResults;

  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div>
          <div class="mc-section-kicker">By year</div>
          <h2>年別戦績</h2>
        </div>
      </div>
      ${
        items.length
          ? `
            <div class="mc-year-list">
              ${items.map((item) => {
                const rate = calculateRate(item.wins, item.matches);
                return `
                  <div class="mc-year-row">
                    <div class="mc-year-head">
                      <strong>${escapeHtml(item.year)}</strong>
                      <span>${item.matches}戦 ${item.wins}勝 ${item.losses}敗</span>
                    </div>
                    <div class="mc-progress" aria-label="${escapeHtml(item.year)}年 勝率 ${formatPercent(rate)}">
                      <span style="width:${Math.max(0, Math.min(100, rate))}%"></span>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `
          : buildEmptyState("日付付きの戦績データがありません")
      }
    </section>
  `.trim();
}

function buildAnalysisNotes(analysis) {
  const notes = [];

  if (analysis.soloMatches > 0) {
    notes.push(`個人戦は通算${analysis.soloMatches}戦、勝率${formatPercent(analysis.soloWinRate)}。`);
  }

  if (analysis.teamMatches > 0) {
    notes.push(`チーム戦は通算${analysis.teamMatches}戦、勝率${formatPercent(analysis.teamWinRate)}。`);
  }

  if (analysis.bestYear) {
    notes.push(
      `最も勝利数が多い年は${analysis.bestYear.year}年で、${analysis.bestYear.wins}勝。`
    );
  }

  if (!notes.length) return "";

  return `
    <section class="mc-content-section">
      <div class="mc-section-heading">
        <div>
          <div class="mc-section-kicker">Summary</div>
          <h2>データ要約</h2>
        </div>
      </div>
      <ul class="mc-analysis-notes">
        ${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
      </ul>
    </section>
  `.trim();
}

function buildTimeline(detail) {
  const soloWins = detail.wins.map((item) => createSoloTimelineItem(item, "win"));
  const soloLosses = detail.losses.map((item) => createSoloTimelineItem(item, "loss"));
  const teamWins = detail.teamWins.map((item) => createTeamTimelineItem(item, "win"));
  const teamLosses = detail.teamLosses.map((item) => createTeamTimelineItem(item, "loss"));

  return [...soloWins, ...soloLosses, ...teamWins, ...teamLosses]
    .sort(compareTimelineItems);
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
  if (a.eventDate !== b.eventDate) {
    return b.eventDate.localeCompare(a.eventDate);
  }

  const roundDifference = getRoundSortValue(a.roundName) - getRoundSortValue(b.roundName);
  if (roundDifference !== 0) return roundDifference;

  const eventDifference = a.eventName.localeCompare(b.eventName, "ja");
  if (eventDifference !== 0) return eventDifference;

  return Number(a.isTeam) - Number(b.isTeam);
}

function analyzeDetail(detail, timeline, appearances) {
  const soloMatches = detail.summary.totalMatches;
  const soloWins = detail.summary.wins;
  const teamMatches = detail.teamSummary.totalMatches;
  const teamWins = detail.teamSummary.wins;

  const recentMatches = timeline.slice(0, 10);
  const recentWins = recentMatches.filter((item) => item.type === "win").length;
  const frequentOpponents = buildOpponentStats(detail.wins, detail.losses);
  const yearlyResults = buildYearlyResults(timeline);
  const bestYear = [...yearlyResults].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.matches - a.matches;
  })[0] || null;

  return {
    soloMatches,
    soloWins,
    soloWinRate: calculateRate(soloWins, soloMatches),
    teamMatches,
    teamWins,
    teamWinRate: calculateRate(teamWins, teamMatches),
    championshipCount: detail.championships.length,
    appearanceCount: appearances.length,
    activeSpanLabel: buildActiveSpanLabel(appearances),
    recentMatches,
    recentWins,
    recentWinRate: calculateRate(recentWins, recentMatches.length),
    frequentOpponents,
    yearlyResults,
    bestYear
  };
}

function buildOpponentStats(wins, losses) {
  const map = new Map();

  const add = (item, type) => {
    const name = cleanText(item.opponent_name) || "不明";
    const mcId = cleanText(item.opponent_mc_id);
    const key = mcId || name;

    if (!map.has(key)) {
      map.set(key, {
        name,
        mcId,
        matches: 0,
        wins: 0,
        losses: 0
      });
    }

    const row = map.get(key);
    row.matches += 1;
    row[type === "win" ? "wins" : "losses"] += 1;
  };

  wins.forEach((item) => add(item, "win"));
  losses.forEach((item) => add(item, "loss"));

  return [...map.values()]
    .sort((a, b) => {
      if (b.matches !== a.matches) return b.matches - a.matches;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.name.localeCompare(b.name, "ja");
    })
    .slice(0, 5);
}

function buildYearlyResults(timeline) {
  const map = new Map();

  for (const item of timeline) {
    const match = item.eventDate.match(/^(\d{4})/);
    if (!match) continue;

    const year = match[1];

    if (!map.has(year)) {
      map.set(year, {
        year,
        matches: 0,
        wins: 0,
        losses: 0
      });
    }

    const row = map.get(year);
    row.matches += 1;
    row[item.type === "win" ? "wins" : "losses"] += 1;
  }

  return [...map.values()].sort((a, b) => b.year.localeCompare(a.year));
}

function buildActiveSpanLabel(appearances) {
  const years = appearances
    .map((item) => cleanText(item.event_date).match(/^(\d{4})/)?.[1] || "")
    .filter(Boolean)
    .sort();

  if (!years.length) return "活動期間不明";

  const first = years[0];
  const last = years[years.length - 1];

  return first === last
    ? `${first}年に出場`
    : `${first}年〜${last}年`;
}

function buildGlobalRankingContext(normalizedEntries) {
  const prizeRows = normalizedEntries
    .map(([mcId, detail]) => ({
      mcId,
      mcName: cleanText(detail.mc.mc_name) || "名称不明",
      value: detail.totalPrizeMoney
    }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0);

  const scoreRows = normalizedEntries
    .map(([mcId, detail]) => {
      const rankingStatus = cleanText(detail.ranking.ranking_status);
      const score = getNumericScore(detail.ranking);
      const suppliedRank = toNullableFiniteNumber(detail.ranking.rank);

      return {
        mcId,
        mcName: cleanText(detail.mc.mc_name) || "名称不明",
        value: score,
        suppliedRank,
        inactive: isInactiveRanking(rankingStatus)
      };
    })
    .filter((row) => !row.inactive && row.value !== null);

  return {
    prize: buildMetricRankingMap(prizeRows, {
      compare: (a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.mcName.localeCompare(b.mcName, "ja");
      }
    }),
    score: buildMetricRankingMap(scoreRows, {
      compare: (a, b) => {
        const rankA = a.suppliedRank ?? Number.POSITIVE_INFINITY;
        const rankB = b.suppliedRank ?? Number.POSITIVE_INFINITY;

        if (rankA !== rankB) return rankA - rankB;
        if (b.value !== a.value) return b.value - a.value;
        return a.mcName.localeCompare(b.mcName, "ja");
      },
      useSuppliedRank: true
    })
  };
}

function buildMetricRankingMap(rows, options = {}) {
  const {
    compare,
    useSuppliedRank = false
  } = options;

  const sorted = [...rows].sort(compare);
  const ranked = [];
  let previousValue = null;
  let previousRank = 0;

  sorted.forEach((row, index) => {
    let rank;

    if (useSuppliedRank && row.suppliedRank !== null) {
      rank = row.suppliedRank;
    } else if (previousValue !== null && row.value === previousValue) {
      rank = previousRank;
    } else {
      rank = index + 1;
    }

    ranked.push({
      ...row,
      rank
    });

    previousValue = row.value;
    previousRank = rank;
  });

  const map = new Map();

  ranked.forEach((row, index) => {
    map.set(row.mcId, {
      rank: row.rank,
      above: index > 0 ? toRankingNeighbor(ranked[index - 1]) : null,
      below: index < ranked.length - 1 ? toRankingNeighbor(ranked[index + 1]) : null
    });
  });

  return map;
}

function toRankingNeighbor(row) {
  return {
    mcId: row.mcId,
    mcName: row.mcName,
    rank: row.rank
  };
}

function createEmptyMetricRanking() {
  return {
    rank: null,
    above: null,
    below: null
  };
}

function getNumericScore(ranking) {
  const value = ranking.current_score ?? ranking.score;
  const score = Number(value);
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
    prizeAdjustments: normalizePrizeAdjustments(detail),
    totalPrizeMoney: toFiniteNumber(detail.total_prize_money, 0)
  };
}

function normalizeSummary(summary) {
  const source = isObject(summary) ? summary : {};
  const wins = toFiniteNumber(source.wins, 0);
  const losses = toFiniteNumber(source.losses, 0);
  const explicitTotal = toNullableFiniteNumber(source.total_matches);

  return {
    totalMatches: explicitTotal === null ? wins + losses : explicitTotal,
    wins,
    losses
  };
}

function normalizePrizeAdjustments(detail) {
  const candidates = [
    detail.prize_adjustments,
    detail.prize_adjustment,
    detail.manual_prize_adjustments,
    detail.prizeAdjustment,
    detail.prizeAdjustments
  ];

  const source = candidates.find(Array.isArray) || [];

  return source
    .map((item) => ({
      amount: firstValidNumber([
        item?.amount,
        item?.adjustment_amount,
        item?.prize_amount,
        item?.prize_money,
        item?.money
      ], null),
      note: cleanText(
        item?.note ??
        item?.notes ??
        item?.adjustment_note ??
        item?.description ??
        item?.memo
      ),
      eventName: cleanText(
        item?.event_name ??
        item?.eventName ??
        item?.event_title ??
        item?.eventTitle ??
        item?.event_name_full ??
        item?.eventNameFull ??
        item?.tournament_name ??
        item?.tournamentName ??
        item?.event
      )
    }))
    .filter((item) => item.amount !== null && item.amount !== 0);
}

function renderPrizeAdjustmentText(item) {
  const amountText = `${formatYen(item.amount)}円`;
  const detailText = item.note ? `${amountText}（${item.note}）` : amountText;

  return item.eventName ? `${item.eventName}：${detailText}` : detailText;
}

function mergeAppearances(baseAppearances, teamAppearances) {
  const map = new Map();

  for (const item of [...baseAppearances, ...teamAppearances]) {
    const eventId = cleanText(item.event_id);
    const eventName = cleanText(item.event_name);
    const eventDate = cleanText(item.event_date);
    const key = eventId || `${eventName}__${eventDate}`;

    if (!key || map.has(key)) continue;
    map.set(key, item);
  }

  return sortAppearances([...map.values()]);
}

function sortMatchHistory(items) {
  return [...items].sort((a, b) => {
    const dateDifference = cleanText(b.event_date).localeCompare(cleanText(a.event_date));
    if (dateDifference !== 0) return dateDifference;

    const roundDifference = getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name);
    if (roundDifference !== 0) return roundDifference;

    const eventDifference = cleanText(a.event_name).localeCompare(cleanText(b.event_name), "ja");
    if (eventDifference !== 0) return eventDifference;

    return cleanText(a.opponent_name).localeCompare(cleanText(b.opponent_name), "ja");
  });
}

function sortTeamMatchHistory(items) {
  return [...items].sort((a, b) => {
    const dateDifference = cleanText(b.event_date).localeCompare(cleanText(a.event_date));
    if (dateDifference !== 0) return dateDifference;

    const roundDifference = getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name);
    if (roundDifference !== 0) return roundDifference;

    const eventDifference = cleanText(a.event_name).localeCompare(cleanText(b.event_name), "ja");
    if (eventDifference !== 0) return eventDifference;

    return cleanText(a.opponent_team_name).localeCompare(cleanText(b.opponent_team_name), "ja");
  });
}

function sortAppearances(items) {
  return [...items].sort((a, b) => {
    const dateDifference = cleanText(b.event_date).localeCompare(cleanText(a.event_date));
    if (dateDifference !== 0) return dateDifference;

    const roundDifference = getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name);
    if (roundDifference !== 0) return roundDifference;

    return cleanText(a.event_name).localeCompare(cleanText(b.event_name), "ja");
  });
}

function renderMcLink(name, mcId, className = "") {
  const safeName = escapeHtml(name);
  const safeId = cleanText(mcId);
  const safeClass = escapeHtml(className);

  if (!safeId) {
    return `<span class="${safeClass}">${safeName}</span>`;
  }

  return `<a href="../detail_mc/${encodeURIComponent(safeId)}.html" class="${safeClass}">${safeName}</a>`;
}

function renderEventLink(name, eventId, className = "") {
  const safeName = escapeHtml(name);
  const safeId = cleanText(eventId);
  const safeClass = escapeHtml(className);

  if (!safeId) {
    return `<span class="${safeClass}">${safeName}</span>`;
  }

  return `<a href="../detail_event/${encodeURIComponent(safeId)}.html" class="${safeClass}">${safeName}</a>`;
}

function renderTeamMemberLinks(members) {
  return normalizeMembers(members)
    .map((member) => renderMcLink(member.name, member.mcId, "mc-team-member-link"))
    .join('<span class="mc-team-member-separator">・</span>') || "不明";
}

function normalizeMembers(members) {
  return toArray(members)
    .map((member) => ({
      name: cleanText(member?.mc_name || member?.name),
      mcId: cleanText(member?.mc_id || member?.id)
    }))
    .filter((member) => member.name);
}

function buildMetaDescription(params) {
  const {
    mcName,
    summary,
    teamSummary,
    championships,
    totalPrizeMoney
  } = params;

  const soloWinRate = calculateRate(summary.wins, summary.totalMatches);

  return [
    `${mcName}のMCバトル戦績。`,
    summary.totalMatches > 0
      ? `個人戦${summary.totalMatches}戦${summary.wins}勝${summary.losses}敗（勝率${formatPercent(soloWinRate)}）。`
      : "",
    teamSummary.totalMatches > 0
      ? `チーム戦${teamSummary.totalMatches}戦${teamSummary.wins}勝${teamSummary.losses}敗。`
      : "",
    championships.length > 0
      ? `優勝${championships.length}回。`
      : "",
    totalPrizeMoney > 0
      ? `獲得賞金¥${formatYen(totalPrizeMoney)}。`
      : "",
    "優勝歴、出場大会、対戦履歴、スコア、年別成績を掲載。"
  ].filter(Boolean).join("");
}

function buildSeoSummary(params) {
  const {
    mcName,
    summary,
    teamSummary,
    championships,
    totalPrizeMoney
  } = params;

  const soloWinRate = calculateRate(summary.wins, summary.totalMatches);
  const parts = [];

  if (summary.totalMatches > 0) {
    parts.push(
      `個人戦${summary.totalMatches}戦${summary.wins}勝${summary.losses}敗、勝率${formatPercent(soloWinRate)}`
    );
  }

  if (teamSummary.totalMatches > 0) {
    parts.push(
      `チーム戦${teamSummary.totalMatches}戦${teamSummary.wins}勝${teamSummary.losses}敗`
    );
  }

  if (championships.length > 0) {
    parts.push(`優勝${championships.length}回`);
  }

  if (totalPrizeMoney > 0) {
    parts.push(`獲得賞金¥${formatYen(totalPrizeMoney)}`);
  }

  const recordText = parts.length
    ? `${parts.join("、")}。`
    : "公開されている大会データを掲載しています。";

  return `${mcName}のMCバトル戦績ページです。${recordText}対戦履歴、出場大会、スコア、年別成績を確認できます。`;
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
        item: `${SITE_URL}/`
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "MC一覧",
        item: `${SITE_URL}/list_mc.html`
      },
      {
        "@type": "ListItem",
        position: 3,
        name: mcName,
        item: `${SITE_URL}/detail_mc/${mcId}.html`
      }
    ]
  }, null, 2);
}

function buildProfileJsonLd(view) {
  const {
    mcId,
    mcName,
    metaDescription,
    detail,
    rankingInactive,
    rankDisplay,
    scoreDisplay,
    prizeRanking
  } = view;

  const properties = [];
  const soloWinRate = calculateRate(
    detail.summary.wins,
    detail.summary.totalMatches
  );

  if (detail.summary.totalMatches > 0) {
    properties.push({
      "@type": "PropertyValue",
      name: "個人戦戦績",
      value: `${detail.summary.totalMatches}戦${detail.summary.wins}勝${detail.summary.losses}敗`
    });

    properties.push({
      "@type": "PropertyValue",
      name: "個人戦勝率",
      value: formatPercent(soloWinRate)
    });
  }

  if (detail.teamSummary.totalMatches > 0) {
    properties.push({
      "@type": "PropertyValue",
      name: "チーム戦戦績",
      value: `${detail.teamSummary.totalMatches}戦${detail.teamSummary.wins}勝${detail.teamSummary.losses}敗`
    });
  }

  if (detail.championships.length > 0) {
    properties.push({
      "@type": "PropertyValue",
      name: "優勝回数",
      value: `${detail.championships.length}回`
    });
  }

  if (detail.totalPrizeMoney > 0) {
    properties.push({
      "@type": "PropertyValue",
      name: "獲得賞金",
      value: `¥${formatYen(detail.totalPrizeMoney)}`
    });
  }

  if (prizeRanking.rank !== null) {
    properties.push({
      "@type": "PropertyValue",
      name: "賞金ランキング",
      value: `${prizeRanking.rank}位`
    });
  }

  if (!rankingInactive && hasValue(scoreDisplay)) {
    properties.push({
      "@type": "PropertyValue",
      name: "スコア",
      value: String(scoreDisplay)
    });

    if (hasValue(rankDisplay) && rankDisplay !== "圏外") {
      properties.push({
        "@type": "PropertyValue",
        name: "スコアランキング",
        value: `${rankDisplay}位`
      });
    }
  }

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `${mcName}の戦績・勝率・優勝歴・賞金`,
    description: metaDescription,
    url: `${SITE_URL}/detail_mc/${mcId}.html`,
    inLanguage: "ja",
    isPartOf: {
      "@type": "WebSite",
      name: "MCBattle.jp",
      url: `${SITE_URL}/`
    },
    mainEntity: {
      "@type": "Person",
      name: mcName,
      url: `${SITE_URL}/detail_mc/${mcId}.html`,
      additionalProperty: properties
    }
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

  const bestMatch = normalized.match(/^Best(\d+)$/i);
  if (bestMatch) return Number(bestMatch[1]);

  const roundMatch = normalized.match(/^(\d+)回戦$/);
  if (roundMatch) return 1000 + Number(roundMatch[1]);

  return 999999;
}

function getRankDisplay(ranking) {
  if (hasValue(ranking.rank_display)) {
    return String(ranking.rank_display);
  }

  const rank = Number(ranking.rank);
  return Number.isFinite(rank) && rank <= 100 ? String(rank) : "圏外";
}

function getScoreDisplay(ranking) {
  if (hasValue(ranking.score_display)) {
    return String(ranking.score_display);
  }

  const value = ranking.current_score ?? ranking.score;

  if (!hasValue(value)) return "";
  if (!Number.isFinite(Number(value))) return String(value);

  return Number(value).toFixed(2);
}

function isInactiveRanking(status) {
  return status === "inactive_3y" || status === "inactive_4y";
}

function calculateRate(wins, matches) {
  if (!Number.isFinite(matches) || matches <= 0) return 0;
  return (wins / matches) * 100;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function formatYen(value) {
  const number = toFiniteNumber(value, 0);
  return Math.round(number).toLocaleString("ja-JP");
}

function formatDateDots(value) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? text.replace(/-/g, ".")
    : text;
}

function formatDescriptionHtml(value) {
  const text = cleanText(value);
  if (!text) return "";

  return escapeHtml(text)
    .replace(/。+/g, (match) => `${match}<br>`)
    .replace(/(<br>)+$/g, "");
}

function displayValue(value) {
  return hasValue(value) ? String(value) : "−";
}

function firstValidNumber(values, defaultValue) {
  for (const value of values) {
    if (!hasValue(value)) continue;

    const cleaned = String(value).replace(/[^\d.-]/g, "");
    if (!cleaned) continue;

    const number = Number(cleaned);
    if (Number.isFinite(number)) return number;
  }

  return defaultValue;
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

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function cleanText(value) {
  return String(value ?? "").trim();
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

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`JSONの読み込みに失敗しました: ${filePath}\n${error.message}`);
  }
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildMcDetailStyles() {
  return `
    <style>
      /*
       * MC詳細UIがページ上部の共通ヘッダーを覆わないように
       * stacking contextを明示的に分離する。
       */
      .mc-detail-app {
        position: relative;
        z-index: 0;
        isolation: isolate;
        margin-top: 24px;
      }

      .mc-tab-panels,
      .mc-tab-panel {
        position: relative;
        z-index: 0;
      }

      /*
       * 共通ヘッダー／ナビゲーションを常にクリック可能にする。
       * テンプレート側のクラス差異にも対応するため、
       * home-header・site-header・headerをまとめて保護する。
       */
      .home-header,
      .site-header,
      body > header,
      header[role="banner"] {
        position: relative;
        z-index: 1000;
        pointer-events: auto;
      }

      .home-header a,
      .home-header button,
      .site-header a,
      .site-header button,
      body > header a,
      body > header button,
      header[role="banner"] a,
      header[role="banner"] button {
        position: relative;
        z-index: 1001;
        pointer-events: auto;
        touch-action: manipulation;
      }

      .home-header::before,
      .home-header::after,
      .site-header::before,
      .site-header::after,
      body > header::before,
      body > header::after,
      header[role="banner"]::before,
      header[role="banner"]::after {
        pointer-events: none;
      }

      .mc-tabs {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        margin-bottom: 18px;
        padding: 5px;
        border: 1px solid rgba(255, 255, 255, .1);
        border-radius: 14px;
        background: rgba(255, 255, 255, .035);
      }

      .mc-tab-button,
      .mc-filter-button {
        appearance: none;
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .mc-tab-button {
        min-height: 42px;
        border-radius: 10px;
        color: rgba(255, 255, 255, .62);
        background: transparent;
        font-weight: 700;
        letter-spacing: .04em;
        transition: background .18s ease, color .18s ease;
      }

      .mc-tab-button:hover {
        color: #fff;
        background: rgba(255, 255, 255, .05);
      }

      .mc-tab-button.is-active {
        color: #17130b;
        background: #d8b46a;
      }

      .mc-tab-button:focus-visible,
      .mc-filter-button:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }

      .mc-tab-panel[hidden] {
        display: none !important;
      }

      .mc-seo-summary {
        margin: 0 0 14px;
        color: rgba(255, 255, 255, .58);
        font-size: .84rem;
        line-height: 1.7;
      }

      .mc-overview-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(220px, .75fr);
        gap: 14px;
      }

      .mc-stat-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .mc-stat-card,
      .mc-ranking-card,
      .mc-analysis-metric,
      .mc-content-section,
      .mc-timeline-card {
        border: 1px solid rgba(255, 255, 255, .1);
        background:
          linear-gradient(135deg, rgba(255, 255, 255, .05), rgba(255, 255, 255, .02));
        box-shadow: 0 14px 34px rgba(0, 0, 0, .12);
      }

      .mc-stat-card,
      .mc-ranking-card,
      .mc-analysis-metric {
        border-radius: 16px;
        padding: 14px 16px;
      }

      .mc-stat-label,
      .mc-analysis-label,
      .mc-section-kicker {
        color: rgba(255, 255, 255, .48);
        font-size: .74rem;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
      }

      .mc-stat-main {
        margin-top: 4px;
        color: #fff;
        font-size: clamp(1.35rem, 4vw, 2rem);
        font-weight: 800;
        line-height: 1.15;
      }

      .mc-stat-sub,
      .mc-analysis-sub,
      .mc-card-note {
        margin-top: 3px;
        color: rgba(255, 255, 255, .58);
        font-size: .86rem;
        line-height: 1.55;
      }

      .mc-stat-rate {
        margin-top: 6px;
        color: #d8b46a;
        font-size: .83rem;
        font-weight: 700;
      }

      .mc-ranked-metric-main {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        margin: 10px 0 13px;
      }

      .mc-ranked-metric-value {
        min-width: 0;
        color: #fff;
        font-size: clamp(1.45rem, 5vw, 2rem);
        font-weight: 850;
        line-height: 1.15;
        overflow-wrap: anywhere;
      }

      .mc-ranked-metric-rank {
        flex: 0 0 auto;
        color: #d8b46a;
        font-size: 1rem;
        font-weight: 800;
        white-space: nowrap;
      }

      .mc-ranking-neighbor {
        display: grid;
        grid-template-columns: 18px auto minmax(0, 1fr);
        align-items: baseline;
        gap: 7px;
        padding: 8px 0;
        border-top: 1px solid rgba(255, 255, 255, .07);
        color: rgba(255, 255, 255, .58);
        font-size: .78rem;
        line-height: 1.4;
      }

      .mc-ranking-neighbor-arrow {
        color: #d8b46a;
        font-weight: 900;
      }

      .mc-ranking-neighbor-rank {
        white-space: nowrap;
      }

      .mc-ranking-neighbor-link {
        min-width: 0;
        color: rgba(255, 255, 255, .76);
        font-weight: 700;
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mc-ranking-neighbor-link:hover {
        color: #d8b46a;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .mc-card-title {
        margin: 6px 0 16px;
        font-size: 1.1rem;
      }

      .mc-ranking-list {
        margin: 0;
      }

      .mc-ranking-list > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
        padding: 11px 0;
        border-top: 1px solid rgba(255, 255, 255, .08);
      }

      .mc-ranking-list dt {
        color: rgba(255, 255, 255, .55);
        font-size: .84rem;
      }

      .mc-ranking-list dd {
        margin: 0;
        color: #fff;
        font-size: 1.12rem;
        font-weight: 800;
      }

      .mc-content-section {
        margin-top: 14px;
        border-radius: 16px;
        padding: 14px 16px;
      }

      .mc-section-heading {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 10px;
      }

      .mc-section-heading h2 {
        margin: 4px 0 0;
        font-size: 1.08rem;
      }

      .mc-section-count {
        color: #d8b46a;
        font-size: .9rem;
        font-weight: 800;
      }

      .mc-link-list,
      .mc-note-list,
      .mc-analysis-notes,
      .mc-appearance-list,
      .mc-ranking-table,
      .mc-timeline {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .mc-link-list li,
      .mc-note-list li,
      .mc-analysis-notes li {
        padding: 11px 0;
        border-top: 1px solid rgba(255, 255, 255, .07);
        line-height: 1.55;
      }

      .mc-link-list li:first-child,
      .mc-note-list li:first-child,
      .mc-analysis-notes li:first-child {
        border-top: 0;
      }

      .mc-inline-link,
      .championship-event-link,
      .mc-opponent-link,
      .mc-team-member-link {
        color: inherit;
        text-decoration-color: rgba(216, 180, 106, .55);
        text-underline-offset: 3px;
      }

      .mc-inline-link:hover,
      .championship-event-link:hover,
      .mc-opponent-link:hover,
      .mc-team-member-link:hover {
        color: #d8b46a;
      }

      .mc-appearance-list li {
        display: grid;
        grid-template-columns: 112px minmax(0, 1fr);
        gap: 14px;
        padding: 12px 0;
        border-top: 1px solid rgba(255, 255, 255, .07);
      }

      .mc-appearance-list li:first-child {
        border-top: 0;
      }

      .mc-appearance-date {
        color: rgba(255, 255, 255, .46);
        font-size: .82rem;
        font-variant-numeric: tabular-nums;
      }

      .mc-appearance-event {
        min-width: 0;
        line-height: 1.45;
      }

      .mc-footnote,
      .mc-analysis-copy {
        color: rgba(255, 255, 255, .55);
        font-size: .82rem;
        line-height: 1.65;
      }

      .mc-history-toolbar {
        position: sticky;
        top: 8px;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 22px;
        padding: 10px;
        border: 1px solid rgba(255, 255, 255, .1);
        border-radius: 14px;
        background: rgba(16, 16, 16, .92);
        backdrop-filter: blur(14px);
      }

      .mc-filter-stack {
        display: grid;
        gap: 10px;
        min-width: 0;
      }

      .mc-filter-row {
        display: grid;
        grid-template-columns: 64px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }

      .mc-filter-label {
        color: rgba(255, 255, 255, .42);
        font-size: .72rem;
        font-weight: 700;
        letter-spacing: .06em;
        white-space: nowrap;
      }

      .mc-filter-group {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .mc-filter-button {
        min-height: 34px;
        padding: 0 13px;
        border-radius: 999px;
        color: rgba(255, 255, 255, .62);
        background: rgba(255, 255, 255, .06);
        font-size: .82rem;
        font-weight: 700;
      }

      .mc-filter-button:hover {
        color: #fff;
        background: rgba(255, 255, 255, .1);
      }

      .mc-filter-button.is-active {
        color: #17130b;
        background: #d8b46a;
      }

      .mc-history-count {
        flex: 0 0 auto;
        color: rgba(255, 255, 255, .48);
        font-size: .82rem;
        font-variant-numeric: tabular-nums;
      }

      .mc-timeline {
        position: relative;
        padding-left: 27px;
      }

      .mc-timeline::before {
        content: "";
        position: absolute;
        top: 8px;
        bottom: 8px;
        left: 7px;
        width: 1px;
        background: rgba(255, 255, 255, .12);
      }

      .mc-timeline-item {
        position: relative;
        margin-bottom: 9px;
      }

      .mc-timeline-item[hidden] {
        display: none;
      }

      .mc-timeline-marker {
        position: absolute;
        top: 22px;
        left: -25px;
        width: 11px;
        height: 11px;
        border: 3px solid #111;
        border-radius: 50%;
        background: rgba(255, 255, 255, .38);
        box-shadow: 0 0 0 1px rgba(255, 255, 255, .14);
      }

      .mc-timeline-item.is-win .mc-timeline-marker {
        background: #d8b46a;
      }

      .mc-timeline-item.is-loss .mc-timeline-marker {
        background: #777;
      }

      .mc-timeline-card {
        border-radius: 15px;
        padding: 13px 15px;
      }

      .mc-timeline-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .mc-timeline-head time {
        color: rgba(255, 255, 255, .48);
        font-size: .78rem;
        font-variant-numeric: tabular-nums;
      }

      .mc-result-badges {
        display: flex;
        gap: 6px;
      }

      .mc-result-badge {
        display: inline-flex;
        align-items: center;
        min-height: 22px;
        padding: 0 8px;
        border-radius: 999px;
        font-size: .67rem;
        font-weight: 900;
        letter-spacing: .08em;
      }

      .mc-result-badge.is-win {
        color: #17130b;
        background: #d8b46a;
      }

      .mc-result-badge.is-loss {
        color: rgba(255, 255, 255, .78);
        background: rgba(255, 255, 255, .12);
      }

      .mc-result-badge.is-team {
        color: rgba(255, 255, 255, .78);
        border: 1px solid rgba(255, 255, 255, .15);
        background: transparent;
      }

      .mc-timeline-match {
        margin-top: 6px;
        color: #fff;
        font-size: 1rem;
        font-weight: 750;
        line-height: 1.5;
      }

      .mc-match-prefix {
        margin-right: 7px;
        color: rgba(255, 255, 255, .42);
        font-size: .78rem;
        font-weight: 500;
        text-transform: uppercase;
      }

      .mc-timeline-event {
        display: flex;
        flex-wrap: wrap;
        gap: 7px 10px;
        margin-top: 6px;
        color: rgba(255, 255, 255, .6);
        font-size: .82rem;
        line-height: 1.45;
      }

      .mc-round-label::before {
        content: "/";
        margin-right: 10px;
        color: rgba(255, 255, 255, .22);
      }

      .mc-team-match {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }

      .mc-team-side {
        min-width: 0;
      }

      .mc-team-side:last-child {
        text-align: right;
      }

      .mc-team-name {
        margin-bottom: 4px;
        color: rgba(255, 255, 255, .52);
        font-size: .73rem;
        font-weight: 600;
      }

      .mc-team-members {
        word-break: break-word;
      }

      .mc-team-vs {
        color: rgba(255, 255, 255, .28);
        font-size: .7rem;
      }

      .mc-team-member-separator {
        color: rgba(255, 255, 255, .25);
      }

      .mc-analysis-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .mc-analysis-value {
        margin-top: 4px;
        color: #fff;
        font-size: 1.45rem;
        font-weight: 850;
        line-height: 1.2;
      }

      .mc-form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .mc-form-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-size: .74rem;
        font-weight: 900;
      }

      .mc-form-dot.is-win {
        color: #17130b;
        background: #d8b46a;
      }

      .mc-form-dot.is-loss {
        color: rgba(255, 255, 255, .68);
        background: rgba(255, 255, 255, .1);
      }

      .mc-ranking-table li {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 12px 0;
        border-top: 1px solid rgba(255, 255, 255, .07);
      }

      .mc-ranking-table li:first-child {
        border-top: 0;
      }

      .mc-table-rank {
        color: rgba(255, 255, 255, .35);
        font-size: .76rem;
      }

      .mc-table-name {
        min-width: 0;
        font-weight: 700;
      }

      .mc-table-record {
        color: rgba(255, 255, 255, .52);
        font-size: .8rem;
      }

      .mc-year-list {
        display: grid;
        gap: 15px;
      }

      .mc-year-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 7px;
      }

      .mc-year-head span {
        color: rgba(255, 255, 255, .48);
        font-size: .8rem;
      }

      .mc-progress {
        overflow: hidden;
        height: 7px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .08);
      }

      .mc-progress span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #d8b46a;
      }


      .mc-collapse-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        margin-top: 14px;
        padding: 0 16px;
        border: 1px solid rgba(216, 180, 106, .38);
        border-radius: 10px;
        color: rgba(255, 255, 255, .9);
        background: transparent;
        font: inherit;
        font-size: .84rem;
        font-weight: 700;
        cursor: pointer;
      }

      .mc-collapse-button:hover {
        color: #17130b;
        background: #d8b46a;
      }

      .mc-collapse-button:focus-visible {
        outline: 2px solid #fff;
        outline-offset: 2px;
      }

      .is-collapsed-item[hidden] {
        display: none !important;
      }

      .mc-empty-state,
      .mc-filter-empty {
        padding: 28px 18px;
        border: 1px dashed rgba(255, 255, 255, .12);
        border-radius: 14px;
        color: rgba(255, 255, 255, .42);
        text-align: center;
        font-size: .88rem;
      }

      .mc-filter-empty {
        margin-top: 16px;
      }

      @media (min-width: 900px) {
        .mc-detail-app {
          margin-top: 28px;
        }

        .mc-overview-grid {
          gap: 16px;
          align-items: stretch;
        }

        .mc-overview-grid.has-team {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          grid-template-areas:
            "solo team"
            "prize score";
        }

        .mc-overview-grid.no-team {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          grid-template-areas: "solo prize score";
        }

        .mc-stat-grid {
          display: contents;
        }

        .mc-stat-card.is-solo {
          grid-area: solo;
        }

        .mc-stat-card.is-team {
          grid-area: team;
        }

        .mc-ranking-card.is-prize {
          grid-area: prize;
        }

        .mc-ranking-card.is-score {
          grid-area: score;
        }

        .mc-stat-card,
        .mc-ranking-card {
          min-height: 190px;
          height: 100%;
        }

        .mc-stat-card {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .mc-ranking-card {
          display: flex;
          flex-direction: column;
        }

        .mc-ranked-metric-main {
          margin-top: 12px;
        }

        .mc-ranking-neighbor {
          min-height: 38px;
        }

        .mc-overview-secondary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: stretch;
        }

        .mc-overview-secondary-grid > .mc-content-section {
          margin-top: 16px;
          min-width: 0;
          height: 100%;
          box-sizing: border-box;
        }

        .mc-overview-secondary-grid > .mc-content-section:only-child {
          grid-column: 1 / -1;
        }

        .mc-link-list li,
        .mc-appearance-list li {
          min-height: 52px;
        }

        .mc-history-toolbar {
          top: 12px;
        }

        .mc-timeline {
          max-width: 980px;
          margin: 0 auto;
        }

        .mc-analysis-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }

        .mc-tab-panel[data-tab-panel="analysis"] .mc-content-section {
          max-width: 1100px;
          margin-left: auto;
          margin-right: auto;
        }
      }

      @media (max-width: 760px) {
        .mc-overview-grid,
        .mc-overview-grid.has-team,
        .mc-overview-grid.no-team {
          grid-template-columns: 1fr;
          grid-template-areas: none;
        }

        .mc-stat-card.is-solo,
        .mc-stat-card.is-team,
        .mc-ranking-card.is-prize,
        .mc-ranking-card.is-score {
          grid-area: auto;
        }

        .mc-overview-secondary-grid {
          display: block;
        }

        .mc-analysis-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .mc-history-toolbar {
          align-items: flex-start;
        }

        .mc-appearance-list li {
          grid-template-columns: 94px minmax(0, 1fr);
        }
      }

      @media (max-width: 520px) {
        .mc-detail-app {
          margin-top: 18px;
        }

        .mc-tab-button {
          min-height: 40px;
          font-size: .88rem;
        }

        .mc-stat-grid,
        .mc-analysis-grid {
          grid-template-columns: 1fr;
        }

        .mc-history-toolbar {
          position: static;
          display: block;
        }

        .mc-filter-stack {
          gap: 9px;
        }

        .mc-filter-row {
          grid-template-columns: 58px minmax(0, 1fr);
          gap: 8px;
        }

        .mc-filter-group {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .mc-filter-button {
          min-width: 0;
          padding: 0 7px;
          font-size: .75rem;
        }

        .mc-history-count {
          margin-top: 9px;
          text-align: right;
        }

        .mc-timeline {
          padding-left: 22px;
        }

        .mc-timeline-marker {
          left: -20px;
        }

        .mc-team-match {
          grid-template-columns: 1fr;
          gap: 6px;
        }

        .mc-team-side:last-child {
          text-align: left;
        }

        .mc-team-vs {
          display: none;
        }

        .mc-team-side:last-child::before {
          content: "vs ";
          color: rgba(255, 255, 255, .3);
          font-size: .7rem;
        }

        .mc-ranking-table li {
          grid-template-columns: 24px minmax(0, 1fr);
        }

        .mc-table-record {
          grid-column: 2;
        }
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

        const tabButtons = Array.from(app.querySelectorAll("[data-tab-target]"));
        const tabPanels = Array.from(app.querySelectorAll("[data-tab-panel]"));
        const filterButtons = Array.from(app.querySelectorAll("[data-filter-axis][data-filter-value]"));
        const historyItems = Array.from(app.querySelectorAll("[data-history-item]"));
        const visibleCount = app.querySelector("[data-visible-count]");
        const filterEmpty = app.querySelector("[data-filter-empty]");
        const collapseButtons = Array.from(app.querySelectorAll("[data-collapse-button]"));

        const activateTab = (targetName, options = {}) => {
          const { focus = false, updateHash = true } = options;

          tabButtons.forEach((button) => {
            const active = button.dataset.tabTarget === targetName;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;

            if (active && focus) {
              button.focus();
            }
          });

          tabPanels.forEach((panel) => {
            const active = panel.dataset.tabPanel === targetName;
            panel.classList.toggle("is-active", active);
            panel.hidden = !active;
          });

          if (updateHash && history.replaceState) {
            const hash = targetName === "overview" ? "" : "#" + targetName;
            history.replaceState(null, "", location.pathname + location.search + hash);
          }
        };

        const historyFilter = {
          mode: "all",
          result: "all"
        };

        const applyHistoryFilters = () => {
          let count = 0;

          historyItems.forEach((item) => {
            const itemMode = item.dataset.matchMode || "solo";
            const itemResult = item.dataset.resultType || "";

            const matchesMode =
              historyFilter.mode === "all" ||
              itemMode === historyFilter.mode;

            const matchesResult =
              historyFilter.result === "all" ||
              itemResult === historyFilter.result;

            const visible = matchesMode && matchesResult;
            item.hidden = !visible;

            if (visible) count += 1;
          });

          filterButtons.forEach((button) => {
            const axis = button.dataset.filterAxis;
            const value = button.dataset.filterValue;
            const active = historyFilter[axis] === value;

            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
          });

          if (visibleCount) visibleCount.textContent = String(count);
          if (filterEmpty) filterEmpty.hidden = count !== 0;
        };

        tabButtons.forEach((button, index) => {
          button.addEventListener("click", () => {
            activateTab(button.dataset.tabTarget);
          });

          button.addEventListener("keydown", (event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              return;
            }

            event.preventDefault();

            let nextIndex = index;

            if (event.key === "ArrowLeft") {
              nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
            }

            if (event.key === "ArrowRight") {
              nextIndex = (index + 1) % tabButtons.length;
            }

            if (event.key === "Home") {
              nextIndex = 0;
            }

            if (event.key === "End") {
              nextIndex = tabButtons.length - 1;
            }

            activateTab(tabButtons[nextIndex].dataset.tabTarget, {
              focus: true
            });
          });
        });

        filterButtons.forEach((button) => {
          button.addEventListener("click", () => {
            const axis = button.dataset.filterAxis;
            const value = button.dataset.filterValue;

            if (!axis || !value || !(axis in historyFilter)) return;

            historyFilter[axis] = value;
            applyHistoryFilters();
          });
        });


        collapseButtons.forEach((button) => {
          button.addEventListener("click", () => {
            const section = button.closest(".mc-content-section");
            if (!section) return;

            const hiddenItems = Array.from(
              section.querySelectorAll(".is-collapsed-item")
            );

            const expanded = button.getAttribute("aria-expanded") === "true";
            const nextExpanded = !expanded;

            hiddenItems.forEach((item) => {
              item.hidden = !nextExpanded;
            });

            button.setAttribute("aria-expanded", String(nextExpanded));
            button.textContent = nextExpanded
              ? "閉じる"
              : "もっと見る（あと" + (button.dataset.remainingCount || hiddenItems.length) + "件）";
          });
        });

        const initialTab = location.hash.replace("#", "");
        const validInitialTab = tabButtons.some(
          (button) => button.dataset.tabTarget === initialTab
        );

        activateTab(validInitialTab ? initialTab : "overview", {
          updateHash: false
        });
        applyHistoryFilters();
      })();
    </script>
  `.trim();
}

main();
