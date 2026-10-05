// The team apps we know about, matched by the domain their notification emails come from.
export const APPS = [
  { key: "teamsnap", name: "TeamSnap", domains: ["teamsnap.com"], openUrl: "https://go.teamsnap.com" },
  { key: "playmetrics", name: "PlayMetrics", domains: ["playmetrics.com"], openUrl: "https://playmetrics.com/login" },
  { key: "heja", name: "Heja", domains: ["heja.io", "heja.app", "heja.se"], openUrl: "https://heja.io" },
];

export function appForAddress(address = "") {
  const domain = address.toLowerCase().split("@")[1] || "";
  return APPS.find((a) => a.domains.some((d) => domain === d || domain.endsWith(`.${d}`)));
}
