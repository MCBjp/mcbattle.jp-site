const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const DATA_PATH = path.join(ROOT_DIR, "data", "event_details_all.json");
const MC_DETAILS_PATH = path.join(ROOT_DIR, "data", "mc_details_all.json");
const OUTPUT_DIR = path.join(ROOT_DIR, "series");

const SITE_NAME = "MCBattle.jp";
const SITE_URL = "https://mcbattle.jp";
const OGP_IMAGE_URL = "https://mcbattle.jp/ogp.png?v=2";

/**
 * event_categoryシートの定義。
 * URLはこのslugを正とする。
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
  const data = JSON.parse(raw);
  const detailMap = data && data.event_details ? data.event_details : {};
  const mcNameById = loadCanonicalMcNameMap(data);

  const today = startOfDay(new Date());

  const items = Object.keys(detailMap)
    .map((eventId) => {
      const detail = detailMap[eventId];
      return {
        event_id: eventId,
        detail
      };
    })
    .filter((item) => {
      const event = item.detail && item.detail.event ? item.detail.event : {};
      const d = getDateValue(event.event_date);
      return d && d.getTime() <= today.getTime();
    });

  const groups = groupEvents(items);

  // 古いslugで生成されたファイルが残らないように、series配下はいったん作り直す。
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  groups.forEach((group) => {
    const dir = path.join(OUTPUT_DIR, group.slug);
    const outputPath = path.join(dir, "index.html");

    fs.mkdirSync(dir, { recursive: true });

    const html = buildHtml(group, mcNameById);
    fs.writeFileSync(outputPath, html, "utf8");

    console.log(
      `シリーズページ生成完了: ${outputPath} (${group.items.length}件 / ${group.category_id || "no-category-id"} / ${group.category_name})`
    );
  });

  console.log(`シリーズカテゴリ数: ${groups.length}`);
}

function buildHtml(group, mcNameById) {
  const category = group.category_name;
  const canonicalUrl = `${SITE_URL}/series/${group.slug}/`;
  const pageTitle = `${category} 歴代結果一覧 | 優勝者・準優勝・大会結果まとめ | MCBattle.jp`;
  const pageDescription = `${category}の歴代大会結果一覧。各大会の開催日、優勝者、準優勝、優勝賞金、詳細結果をまとめています。`;

  const cardsHtml = group.items.length
    ? group.items.map((item) => buildEventCardHtml(item, mcNameById)).join("\n")
    : '<p class="series-status">大会がありません</p>';

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
      max-width: 900px;
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
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 14px 0 0;
    }

    .series-summary-card{
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
      padding: 9px 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.018);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.015) inset;
    }

    .series-summary-label{
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 700;
      line-height: 1.35;
      white-space: nowrap;
    }

    .series-summary-value{
      color: #ffffff;
      font-size: 0.94rem;
      font-weight: 800;
      line-height: 1.35;
      white-space: nowrap;
    }

    .series-section{
      margin-top: 14px;
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

    .series-event-list{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .series-event-card{
      padding: 11px 12px 10px;
      border-radius: 15px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.018);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.015) inset;
      transition:
        transform 0.18s ease,
        border-color 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease;
    }

    .series-event-card:hover{
      background: rgba(255,255,255,0.032);
      border-color: rgba(255,255,255,0.16);
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0,0,0,0.12);
    }

    .series-event-date{
      color: var(--accent);
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      line-height: 1.3;
      margin-bottom: 4px;
    }

    .series-event-title{
      margin: 0 0 8px;
      font-size: 0.98rem;
      font-weight: 800;
      line-height: 1.38;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-event-title a{
      color: #ffffff;
      text-decoration: none;
    }

    .series-event-title a:hover{
      color: #f0cd87;
      text-decoration: none;
    }

    .series-result-list{
      display: grid;
      gap: 5px;
      margin: 0;
    }

    .series-result-row{
      display: grid;
      grid-template-columns: 4.7em minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      font-size: 0.82rem;
      line-height: 1.48;
    }

    .series-result-row dt{
      color: var(--muted);
      font-weight: 800;
      white-space: nowrap;
    }

    .series-result-row dd{
      margin: 0;
      color: #ffffff;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .series-result-row.is-empty{
      display: none;
    }

    .series-mc-link,
    .series-team-member-link{
      color: #ffffff;
      font-weight: 800;
      text-decoration: none;
    }

    .series-mc-link:hover,
    .series-team-member-link:hover{
      color: #f0cd87;
      text-decoration: none;
    }

    .series-team-name{
      display: block;
      color: #ffffff;
      font-weight: 800;
      line-height: 1.45;
    }

    .series-team-members{
      display: block;
      margin-top: 1px;
      color: #c7cedc;
      line-height: 1.5;
    }

    .series-team-member-text{
      color: #ffffff;
      font-weight: 800;
    }

    .series-team-member-separator{
      color: var(--muted);
      margin: 0 0.22em;
    }

    .series-muted,
    .series-status{
      color: var(--muted);
    }

    .series-status{
      margin: 0;
      font-size: 0.88rem;
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
        margin-top: 12px;
      }

      .series-summary-card{
        padding: 8px 11px;
      }

      .series-summary-label{
        font-size: 0.68rem;
      }

      .series-summary-value{
        font-size: 0.88rem;
      }

      .series-section{
        margin-top: 12px;
      }

      .series-section h2{
        font-size: 1rem;
      }

      .series-event-list{
        gap: 7px;
      }

      .series-event-card{
        padding: 10px 11px 9px;
        border-radius: 14px;
      }

      .series-event-date{
        font-size: 0.71rem;
      }

      .series-event-title{
        font-size: 0.92rem;
        margin-bottom: 7px;
      }

      .series-result-row{
        grid-template-columns: 4.4em minmax(0, 1fr);
        gap: 7px;
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
        ${escapeHtml(category)}の歴代大会結果をまとめています。各大会の開催日、優勝、準優勝、優勝賞金、詳細結果を確認できます。
      </p>

${categoryDescriptionHtml ? indent(categoryDescriptionHtml, 6) + "\n" : ""}      <div class="series-summary" aria-label="掲載情報">
        <div class="series-summary-card">
          <span class="series-summary-label">掲載大会数</span>
          <span class="series-summary-value">${escapeHtml(String(group.items.length))}件</span>
        </div>
      </div>
    </div>

    <section class="series-section">
      <h2>${escapeHtml(category)} 歴代大会結果</h2>

      <div class="series-event-list">
${indent(cardsHtml, 8)}
      </div>
    </section>
  </main>

  <script src="../../site-header.js"></script>
</body>
</html>
`;
}

function buildEventCardHtml(item, mcNameById) {
  const detail = item.detail || {};
  const event = detail.event || {};
  const groupedMatches = Array.isArray(detail.grouped_matches) ? detail.grouped_matches.slice() : [];

  groupedMatches.sort((a, b) => getRoundSortValue(a.round_name) - getRoundSortValue(b.round_name));

  const eventId = item.event_id || event.event_id || "";
  const name = getName(event);
  const date = formatDate(event.event_date);
  const href = getEventHref(eventId);

  const winnerHtml = buildParticipantHtml(event, groupedMatches, mcNameById, "winner");
  const runnerUpHtml = buildParticipantHtml(event, groupedMatches, mcNameById, "runner_up");
  const prize = formatPrize(event.prize_money_winner);

  return `<article class="series-event-card">
  <div class="series-event-date">${escapeHtml(date)}</div>
  <h3 class="series-event-title"><a href="${escapeHtml(href)}">${escapeHtml(name)}</a></h3>

  <dl class="series-result-list">
    <div class="series-result-row${winnerHtml ? "" : " is-empty"}">
      <dt>優勝</dt>
      <dd>${winnerHtml || '<span class="series-muted">-</span>'}</dd>
    </div>
    <div class="series-result-row${runnerUpHtml ? "" : " is-empty"}">
      <dt>準優勝</dt>
      <dd>${runnerUpHtml || '<span class="series-muted">-</span>'}</dd>
    </div>
    <div class="series-result-row${prize ? "" : " is-empty"}">
      <dt>優勝賞金</dt>
      <dd>${prize ? escapeHtml(prize) : '<span class="series-muted">-</span>'}</dd>
    </div>
  </dl>
</article>`;
}

function buildParticipantHtml(event, groupedMatches, mcNameById, type) {
  if (isTeamBattleEvent(event, groupedMatches)) {
    return buildTeamParticipantHtml(event, groupedMatches, mcNameById, type);
  }

  const finalMatch = getFinalMatch(groupedMatches);

  if (type === "winner") {
    const name = safeString(event.winner_name || (finalMatch ? finalMatch.winner_name : "")).trim();
    const mcId = safeString(event.winner_mc_id || (finalMatch ? finalMatch.winner_mc_id : "")).trim();
    return renderMcLink(name, mcId);
  }

  const name = safeString(event.runner_up_name || (finalMatch ? finalMatch.loser_name : "")).trim();
  const mcId = safeString(event.runner_up_mc_id || (finalMatch ? finalMatch.loser_mc_id : "")).trim();
  return renderMcLink(name, mcId);
}

function buildTeamParticipantHtml(event, groupedMatches, mcNameById, type) {
  const team = getTeamParticipant(event, groupedMatches, type);
  if (!team) return "";

  const teamName = normalizeTeamName(team.team_name);
  const members = normalizeTeamMembers(team.members, mcNameById);

  if (!teamName && !members.length) return "";

  const teamNameHtml = teamName
    ? `<span class="series-team-name">${escapeHtml(teamName)}</span>`
    : "";

  const membersHtml = members.length
    ? `<span class="series-team-members">メンバー：${renderTeamMemberLinks(members)}</span>`
    : "";

  return `${teamNameHtml}${membersHtml}`;
}

function getTeamParticipant(event, groupedMatches, type) {
  const teamResults = Array.isArray(event.team_results) ? event.team_results : [];

  if (teamResults.length) {
    const result = findTeamResult(teamResults, type);
    if (result) {
      return {
        team_name: result.team_name || "",
        members: Array.isArray(result.members) ? result.members : []
      };
    }
  }

  const finalMatch = getFinalMatch(groupedMatches);

  if (finalMatch) {
    if (type === "winner") {
      return {
        team_name: finalMatch.winner_team_name || event.winner_team_name || "",
        members: Array.isArray(finalMatch.winner_members) ? finalMatch.winner_members : []
      };
    }

    return {
      team_name: finalMatch.loser_team_name || event.runner_up_team_name || "",
      members: Array.isArray(finalMatch.loser_members) ? finalMatch.loser_members : []
    };
  }

  if (type === "winner") {
    return {
      team_name: event.winner_team_name || "",
      members: Array.isArray(event.winner_members) ? event.winner_members : []
    };
  }

  return {
    team_name: event.runner_up_team_name || "",
    members: Array.isArray(event.runner_up_members) ? event.runner_up_members : []
  };
}

function findTeamResult(teamResults, type) {
  if (!Array.isArray(teamResults) || !teamResults.length) return null;

  if (type === "winner") {
    return teamResults.find((item) => {
      const label = normalizeResultLabel(item.result_label);
      const rankLabel = safeString(item.rank_label || "");
      return label === "winner" || /🥇|優勝|1位|1st/i.test(rankLabel);
    }) || teamResults[0] || null;
  }

  return teamResults.find((item) => {
    const label = normalizeResultLabel(item.result_label);
    const rankLabel = safeString(item.rank_label || "");
    return label === "runner_up" || label === "second" || /🥈|準優勝|2位|2nd/i.test(rankLabel);
  }) || teamResults[1] || null;
}

function normalizeResultLabel(value) {
  return safeString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .trim();
}

function normalizeTeamName(value) {
  const name = safeString(value).trim();
  if (!name) return "";

  const normalized = name.normalize("NFKC").trim();

  if (
    normalized === "-" ||
    normalized === "−" ||
    normalized === "ー" ||
    normalized === "―" ||
    normalized === "不明" ||
    normalized === "なし"
  ) {
    return "";
  }

  return name;
}

function normalizeTeamMembers(members, mcNameById) {
  const list = Array.isArray(members) ? members : [];

  return list
    .map((member) => {
      const mcId = safeString(member.mc_id || member.id || "").trim();

      const name = getCanonicalTeamMemberName(member, mcNameById);
      if (!name) return null;

      return {
        mc_id: mcId,
        name
      };
    })
    .filter(Boolean);
}

function renderTeamMemberLinks(members) {
  return members
    .map((member) => {
      const name = safeString(member.name).trim();
      const mcId = safeString(member.mc_id).trim();

      if (!name) return "";

      if (mcId) {
        return `<a class="series-team-member-link" href="/detail_mc/${encodeURIComponent(mcId)}.html">${escapeHtml(name)}</a>`;
      }

      return `<span class="series-team-member-text">${escapeHtml(name)}</span>`;
    })
    .filter(Boolean)
    .join('<span class="series-team-member-separator">・</span>');
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

function renderMcLink(name, mcId) {
  const cleanName = safeString(name).trim();
  const cleanMcId = safeString(mcId).trim();

  if (!cleanName) return "";

  if (cleanMcId) {
    return `<a class="series-mc-link" href="/detail_mc/${encodeURIComponent(cleanMcId)}.html">${escapeHtml(cleanName)}</a>`;
  }

  return `<span class="series-mc-link">${escapeHtml(cleanName)}</span>`;
}

function getFinalMatch(groupedMatches) {
  const finalMatches = getRoundMatches(groupedMatches, "Final");
  return finalMatches[0] || null;
}

function getRoundMatches(groupedMatches, roundLabel) {
  const group = groupedMatches.find((g) => normalizeRoundLabel(g.round_name) === roundLabel);
  return group && Array.isArray(group.matches) ? group.matches : [];
}

function isTeamBattleEvent(event, groupedMatches = []) {
  const format = safeString(event && event.battle_format ? event.battle_format : "")
    .trim()
    .toLowerCase();

  if (format === "team" || format === "tag" || format === "2on2" || format === "3on3") return true;

  if (Array.isArray(event && event.team_results) && event.team_results.length) return true;

  const finalMatch = getFinalMatch(groupedMatches);
  if (!finalMatch) return false;

  return Boolean(
    finalMatch.winner_team_name ||
    finalMatch.loser_team_name ||
    (Array.isArray(finalMatch.winner_members) && finalMatch.winner_members.length) ||
    (Array.isArray(finalMatch.loser_members) && finalMatch.loser_members.length)
  );
}

function buildCategoryDescriptionHtml(description) {
  const text = safeString(description).trim();
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
    .sort(compareItemsByDateDesc)
    .slice(0, 200)
    .map((item, index) => {
      const event = item.detail && item.detail.event ? item.detail.event : {};

      return {
        "@type": "ListItem",
        position: index + 1,
        url: `${SITE_URL}${getEventHref(item.event_id)}`,
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

function groupEvents(items) {
  const map = new Map();

  items.forEach(item => {
    const event = item.detail && item.detail.event ? item.detail.event : {};
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

    group.items.push(item);
  });

  const groups = Array.from(map.values()).map(group => {
    return {
      ...group,
      items: group.items.slice().sort(compareItemsByDateDesc)
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
  return safeString(
    event.category_id ||
    event.event_category_id ||
    event.event_category_code ||
    ""
  ).trim();
}

function getCategoryNameFromEvent(event) {
  return safeString(event.category_name).trim() || safeString(event.event_category).trim();
}

function normalizeCategoryKey(value) {
  return safeString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function getEventHref(eventId) {
  const id = safeString(eventId).trim();
  return id ? `/detail_event/${encodeURIComponent(id)}.html` : "/list_event.html";
}

function getName(event) {
  if (!event) return "";
  return safeString(event.event_name_full || event.event_name || event.event_name_simple || "大会名不明");
}

function getCategoryDescription(event) {
  return safeString(event.category_description).trim();
}

function getCategoryShowOrder(event) {
  const n = Number(event.category_show_order);
  return Number.isFinite(n) ? n : 999999;
}

function slugify(value) {
  const raw = safeString(value).trim().toLowerCase();
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

function compareItemsByDateDesc(a, b) {
  const eventA = a.detail && a.detail.event ? a.detail.event : {};
  const eventB = b.detail && b.detail.event ? b.detail.event : {};

  const da = getDateValue(eventA.event_date);
  const db = getDateValue(eventB.event_date);

  if (da && db) return db - da;
  if (da) return -1;
  if (db) return 1;

  return getName(eventA).localeCompare(getName(eventB), "ja");
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

function safeString(value) {
  return String(value ?? "");
}

function ensureFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ファイルが見つかりません: ${filePath}`);
  }
}

main();
