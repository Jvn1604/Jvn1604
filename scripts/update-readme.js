#!/usr/bin/env node
/* ============================================================
 * Profile README auto-updater
 * Runs in GitHub Actions on a schedule. Does two things:
 *   1. Fetches all public repos and rewrites the "Latest Repositories"
 *      section between the REPOS markers in README.md.
 *   2. Aggregates languages across repos and renders a
 *      Ring (Legend) chart to assets/ring-langs.svg.
 * No dependencies — uses Node's built-in fetch (Node 18+).
 * ============================================================ */

const fs = require("fs");

const USERNAME = "Jvn1604";
const README = "README.md";
const RING_SVG = "assets/ring-langs.svg";
const MAX_REPOS_SHOWN = 6; // most recently updated, excluding forks + profile repo

// Neon palette matching the cyberpunk profile theme
const PALETTE = ["#00f7ff", "#f2b134", "#e8734a", "#7b5aa3", "#4a9d94", "#d96b7e"];
const INK = "#e6edf3";
const MUTED = "#8b949e";
const TRACK = "rgba(230,237,243,0.08)";

async function ghFetch(url) {
  const headers = { "User-Agent": USERNAME, Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

async function getRepos() {
  const raw = process.env.TEST_FIXTURE
    ? JSON.parse(fs.readFileSync(process.env.TEST_FIXTURE, "utf8"))
    : await ghFetch(`https://api.github.com/users/${USERNAME}/repos?sort=updated&per_page=100`);
  return raw
    .filter((r) => !r.fork && r.name.toLowerCase() !== USERNAME.toLowerCase())
    .sort((a, b) => new Date(b.pushed_at || b.updated_at) - new Date(a.pushed_at || a.updated_at));
}

/* ---------- section 1: latest repos markdown ---------- */
const LANG_ICONS = {
  "C#": "🎮", Python: "🐍", JavaScript: "🌐", HTML: "🌐", CSS: "🎨",
  Java: "☕", GDScript: "🕹️", TypeScript: "🌐", "Jupyter Notebook": "📊", ShaderLab: "✨"
};

function repoRows(repos) {
  const shown = repos.slice(0, MAX_REPOS_SHOWN);
  return shown
    .map((r) => {
      const icon = LANG_ICONS[r.language] || "📦";
      const desc = (r.description || "_No description yet._").replace(/\|/g, "\\|");
      const lang = r.language || "—";
      const date = r.pushed_at ? r.pushed_at.slice(0, 10) : r.updated_at.slice(0, 10);
      const stars = r.stargazers_count > 0 ? ` · ⭐ ${r.stargazers_count}` : "";
      return `| ${icon} **[${r.name}](${r.html_url})** | ${desc} | \`${lang}\`${stars} | ${date} |`;
    })
    .join("\n");
}

function buildReposSection(repos) {
  return [
    "| Repo | Description | Language | Last push |",
    "|---|---|---|---|",
    repoRows(repos),
    "",
    `<sub>🤖 Auto-updated ${new Date().toISOString().slice(0, 10)} · showing ${Math.min(
      MAX_REPOS_SHOWN,
      repos.length
    )} most recently updated of ${repos.length} public repos</sub>`
  ].join("\n");
}

/* ---------- section 2: Ring (Legend) chart of languages ---------- */
function polarToXY(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: +(cx + r * Math.cos(rad)).toFixed(2), y: +(cy + r * Math.sin(rad)).toFixed(2) };
}
function circleArc(cx, cy, r, startA, endA) {
  const s = polarToXY(cx, cy, r, startA);
  const e = polarToXY(cx, cy, r, endA);
  const large = endA - startA <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function buildRingChart(repos) {
  // Count repos per primary language
  const counts = {};
  repos.forEach((r) => {
    if (!r.language) return;
    counts[r.language] = (counts[r.language] || 0) + 1;
  });
  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCount = Math.max(...entries.map(([, v]) => v), 1);

  const W = 460, H = 240;
  const cx = 118, cy = H / 2;
  const rMax = 96, rMin = 34;
  const step = (rMax - rMin) / entries.length;

  const arcs = entries
    .map(([lang, count], i) => {
      const r = +(rMax - i * step).toFixed(2);
      const pct = count / maxCount;
      const endA = -90 + Math.min(0.999, pct) * 360;
      const color = PALETTE[i % PALETTE.length];
      const full = pct >= 0.999;
      const path = full
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${(cx - 0.01).toFixed(2)} ${cy - r}`
        : circleArc(cx, cy, r, -90, endA);
      return `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TRACK}" stroke-width="9"/>
  <path d="${path}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`;
    })
    .join("\n");

  const legend = entries
    .map(([lang, count], i) => {
      const color = PALETTE[i % PALETTE.length];
      const pct = ((count / repos.length) * 100).toFixed(0);
      return `  <g transform="translate(248, ${34 + i * 33})">
    <rect width="11" height="11" rx="2.5" fill="${color}"/>
    <text x="20" y="10" fill="${INK}" font-family="Segoe UI, Ubuntu, sans-serif" font-size="13">${esc(lang)}</text>
    <text x="20" y="26" fill="${MUTED}" font-family="ui-monospace, monospace" font-size="10.5">${count} repo${count > 1 ? "s" : ""} · ${pct}%</text>
  </g>`;
    })
    .join("\n");

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Languages ring chart">
  <rect width="${W}" height="${H}" rx="12" fill="#0d1117" stroke="rgba(230,237,243,0.1)"/>
  <text x="24" y="28" fill="${INK}" font-family="Segoe UI, Ubuntu, sans-serif" font-size="14" font-weight="600">Languages by repo</text>
${arcs}
${legend}
  <text x="${W - 14}" y="${H - 10}" text-anchor="end" fill="${MUTED}" font-family="ui-monospace, monospace" font-size="8.5">auto-generated · ring chart</text>
</svg>
`;
}

/* ---------- injection ---------- */
function inject(readme, startMarker, endMarker, content) {
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1) {
    throw new Error(`Markers ${startMarker} / ${endMarker} not found in README`);
  }
  return (
    readme.slice(0, start + startMarker.length) +
    "\n" + content + "\n" +
    readme.slice(end)
  );
}

async function main() {
  const repos = await getRepos();
  console.log(`Fetched ${repos.length} repos (forks excluded).`);

  // 1. Ring chart SVG
  fs.mkdirSync("assets", { recursive: true });
  fs.writeFileSync(RING_SVG, buildRingChart(repos));
  console.log(`Wrote ${RING_SVG}`);

  // 2. README section
  let readme = fs.readFileSync(README, "utf8");
  readme = inject(readme, "<!-- REPOS:START -->", "<!-- REPOS:END -->", buildReposSection(repos));
  fs.writeFileSync(README, readme);
  console.log("README updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
