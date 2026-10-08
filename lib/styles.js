// Colors and icons for each schedule (by its source name). Defaults come from the clubs' own colors
// where we know them; Setup can change any of them. Safe to import in the browser.
const RULES = [
  { test: /ODP|Georgia Soccer|2014 Girls/i, color: "#1d3f7a", icon: "⭐" }, // Georgia Soccer navy
  { test: /\bUFA\b|United Futbol/i, color: "#c8102e", icon: "⚽" }, // UFA red
  { test: /Pickens|Dragons|Nettes|PJHS/i, color: "#1e7b34", icon: "🐉" }, // Pickens Dragons green
  { test: /Falcons|Futsal/i, color: "#d9480f", icon: "⚽" },
  { test: /Georgia Impact/i, color: "#0089cf", icon: "⚽" },
  { test: /Strive/i, color: "#6b3fa0", icon: "⚽" },
];

const PALETTE = ["#b35c00", "#7a3fb0", "#00838f", "#ad1457", "#5d6d1f", "#3949ab"];

export const ICONS = ["⚽", "🏈", "🏀", "⚾", "🥎", "🏐", "🎾", "🏊", "🏒", "🥍", "⭐", "🐉", "🏆", "🎓", "🏫", "📅"];

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

export function defaultStyle(source = "") {
  const rule = RULES.find((r) => r.test.test(source));
  if (rule) return { color: rule.color, icon: rule.icon };
  const icon = /football|helmet/i.test(source) ? "🏈" : /basketball/i.test(source) ? "🏀" : /soccer|futbol|playmetrics/i.test(source) ? "⚽" : "📅";
  return { color: PALETTE[hash(source) % PALETTE.length], icon };
}

export const styleFor = (source, saved = {}) => ({ ...defaultStyle(source), ...(saved[source] || {}) });

// Games and tournaments get a small badge so they stand out from practices.
export const isGame = (title = "") => /\b(game|match|vs\.?|@|tournament|scrimmage|cup|league)\b/i.test(title);
