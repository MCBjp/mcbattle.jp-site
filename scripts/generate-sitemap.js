const fs = require("fs");
const path = require("path");

const ROOT_DIR = process.cwd();
const OUTPUT_PATH = path.join(ROOT_DIR, "sitemap.xml");
const DETAIL_EVENT_DIR = path.join(ROOT_DIR, "detail_event");

const SITE_URL = "https://mcbattle.jp";

const STATIC_PAGES = [
  "/",
  "/list_event.html",
  "/list_mc.html",
  "/score_ranking.html",
  "/prize_ranking.html",
  "/score_spec.html",
  "/simulation.html",
  "/contact.html"
];

function main() {
  const urls = [];

  STATIC_PAGES.forEach((p) => {
    urls.push({
      loc: SITE_URL + p
    });
  });

  if (fs.existsSync(DETAIL_EVENT_DIR)) {
    const files = fs
      .readdirSync(DETAIL_EVENT_DIR)
      .filter((name) => name.toLowerCase().endsWith(".html"))
      .sort((a, b) => a.localeCompare(b, "ja"));

    files.forEach((fileName) => {
      urls.push({
        loc: `${SITE_URL}/detail_event/${fileName}`
      });
    });
  }

  const xml = buildSitemapXml(urls);
  fs.writeFileSync(OUTPUT_PATH, xml, "utf8");

  console.log(`sitemap.xml generated: ${urls.length} URLs`);
}

function buildSitemapXml(urls) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  urls.forEach((item) => {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(item.loc)}</loc>`);
    lines.push("  </url>");
  });

  lines.push("</urlset>");
  lines.push("");

  return lines.join("\n");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

main();