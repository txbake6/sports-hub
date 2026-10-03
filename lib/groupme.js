// GroupMe public API: https://dev.groupme.com/docs/v3
const BASE = "https://api.groupme.com/v3";

async function gm(path, init = {}) {
  const token = process.env.GROUPME_TOKEN;
  if (!token) throw new Error("GROUPME_TOKEN is not set");
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${encodeURIComponent(token)}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  if (res.status === 304) return null; // GroupMe's "nothing here"
  if (!res.ok) throw new Error(`GroupMe ${res.status}`);
  const body = await res.json();
  return body.response;
}

const msg = (m) => ({
  id: m.id,
  author: m.name,
  avatar: m.avatar_url,
  text: m.text || "",
  images: (m.attachments || []).filter((a) => a.type === "image").map((a) => a.url),
  at: new Date(m.created_at * 1000).toISOString(),
  likes: m.favorited_by?.length || 0,
});

export async function listGroups() {
  const groups = (await gm("/groups?per_page=100&omit=memberships")) || [];
  return groups
    .map((g) => ({
      id: g.id,
      name: g.name,
      image: g.image_url,
      lastAt: new Date((g.messages?.last_message_created_at || g.updated_at) * 1000).toISOString(),
      preview: g.messages?.preview
        ? `${g.messages.preview.nickname}: ${g.messages.preview.text || "(photo)"}`
        : "",
    }))
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export async function groupMessages(groupId, limit = 40) {
  const body = await gm(`/groups/${encodeURIComponent(groupId)}/messages?limit=${limit}`);
  return (body?.messages || []).map(msg).reverse();
}

export async function sendGroupMessage(groupId, text) {
  const body = await gm(`/groups/${encodeURIComponent(groupId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ message: { source_guid: crypto.randomUUID(), text } }),
  });
  return msg(body.message);
}
