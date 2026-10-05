"use client";
import { useEffect, useState } from "react";

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return dayFmt.format(new Date(iso));
}

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) window.location.href = "/login";
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

function Schedule() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState([]);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    getJSON("/api/schedule").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="empty">Loading schedules…</p>;
  if (!data.sources.length) return <p className="empty">No calendar links yet. Add them to CALENDAR_FEEDS.</p>;

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const events = data.events.filter(
    (e) => !hidden.includes(e.source) && (showPast || new Date(e.end) >= startOfToday)
  );
  const byDay = [];
  for (const ev of events) {
    const label = dayFmt.format(new Date(ev.start));
    if (byDay.at(-1)?.label !== label) byDay.push({ label, items: [] });
    byDay.at(-1).items.push(ev);
  }
  const toggle = (s) => setHidden((h) => (h.includes(s) ? h.filter((x) => x !== s) : [...h, s]));

  return (
    <>
      <div className="filters">
        {data.sources.map((s) => (
          <button key={s} className={hidden.includes(s) ? "" : "on"} onClick={() => toggle(s)}>{s}</button>
        ))}
        <button className={showPast ? "on" : ""} onClick={() => setShowPast(!showPast)}>Past week</button>
      </div>
      {data.errors.map((e) => (
        <p key={e.source} className="err">Couldn't load {e.source}: {e.error}</p>
      ))}
      {!byDay.length && <p className="empty">Nothing on the schedule.</p>}
      {byDay.map((d) => (
        <section key={d.label}>
          <div className="day">{d.label}</div>
          {d.items.map((ev) => (
            <div className="card row" key={ev.id}>
              <div className="time">{ev.allDay ? "All day" : timeFmt.format(new Date(ev.start))}</div>
              <div className="grow">
                <div className="title">{ev.title}</div>
                {ev.location && <div className="meta">{ev.location}</div>}
                <span className="chip">{ev.source}</span>
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

// A chat screen for any source whose API answers GET {messages} and POST {text} at one URL.
function Chat({ group, onBack }) {
  const url = group.chatUrl || `/api/groupme/${group.id}`;
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    getJSON(url).then((b) => setMessages(b.messages)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [url]);

  useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [messages?.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setSending(false);
    if (res.ok) {
      setText("");
      load();
    } else setError((await res.json()).error || "Send failed");
  }

  return (
    <>
      <p><button className="link" onClick={onBack}>‹ All chats</button></p>
      <h1>{group.name}</h1>
      {error && <p className="err">{error}</p>}
      {!messages && !error && <p className="empty">Loading…</p>}
      {messages?.map((m) => (
        <div className="msg" key={m.id}>
          {m.avatar ? <img className="avatar" src={`${m.avatar}.avatar`} alt="" /> : <div className="avatar" />}
          <div className="grow">
            <div><b>{m.author}</b> <span className="meta">{ago(m.at)}{m.likes ? ` · ♥ ${m.likes}` : ""}</span></div>
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}</div>
            {m.images.map((src) => <img key={src} className="photo" src={src} alt="" />)}
          </div>
        </div>
      ))}
      <div className="compose">
        <form onSubmit={send}>
          <textarea rows={1} value={text} placeholder={`Message ${group.name}`} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }} />
          <button className="btn" disabled={sending || !text.trim()}>Send</button>
        </form>
      </div>
    </>
  );
}

function Update({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title ellipsis">{item.unread ? "● " : ""}{item.title}</span>
        <span className="meta">{ago(item.at)}</span>
      </div>
      {item.author && <div className="meta ellipsis">{item.author}</div>}
      <div className={open ? "meta" : "meta ellipsis"} style={{ whiteSpace: open ? "pre-wrap" : undefined }}>{item.text}</div>
      <span className="chip">{item.source}{item.kind === "email" ? " · email" : ""}</span>
      {open && (
        <p style={{ marginBottom: 0 }}>
          <a className="btn" href={item.openUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            style={{ textDecoration: "none", display: "inline-block" }}>
            Reply in {item.source}
          </a>
        </p>
      )}
    </div>
  );
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

function ConnectHeja({ onDone }) {
  const [step, setStep] = useState("email");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (step === "email") {
        await postJSON("/api/heja/start", { email: value });
        setValue("");
        setStep("code");
      } else {
        await postJSON("/api/heja/verify", { code: value.trim() });
        onDone();
      }
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }
  return (
    <form className="card" onSubmit={submit}>
      <div className="title">Connect Heja</div>
      <div className="meta">
        {step === "email" ? "Heja will email you a 4-digit code, like when you sign in on the web." : "Enter the 4-digit code Heja just emailed you."}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="grow" style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)" }}
          type={step === "email" ? "email" : "text"} inputMode={step === "code" ? "numeric" : undefined}
          placeholder={step === "email" ? "Your Heja email" : "1234"} value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn" disabled={busy || !value}>{step === "email" ? "Send code" : "Connect"}</button>
      </div>
      {error && <p className="err">{error}</p>}
    </form>
  );
}

function HejaPost({ item, onBack }) {
  const [post, setPost] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const q = `teamid=${encodeURIComponent(item.teamid)}&postid=${encodeURIComponent(item.postid)}`;

  useEffect(() => {
    getJSON(`/api/heja/post?${q}`).then((b) => setPost(b.post)).catch((e) => setError(e.message));
  }, [q]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const b = await postJSON("/api/heja/post", { teamid: item.teamid, postid: item.postid, text });
      setPost(b.post);
      setText("");
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  }

  return (
    <>
      <p><button className="link" onClick={onBack}>‹ All messages</button></p>
      <h1>{item.title}</h1>
      {error && <p className="err">{error}</p>}
      {!post && !error && <p className="empty">Loading…</p>}
      {post && (
        <>
          <div className="card">
            <div><b>{post.author}</b> <span className="meta">{ago(post.at)}</span></div>
            <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.text}</div>
            {post.images.map((src) => <img key={src} className="photo" src={src} alt="" style={{ maxWidth: "100%", borderRadius: 10 }} />)}
          </div>
          {post.comments.map((c) => (
            <div className="msg" key={c.id}>
              {c.avatar ? <img className="avatar" src={c.avatar} alt="" /> : <div className="avatar" />}
              <div className="grow">
                <div><b>{c.author}</b> {c.at && <span className="meta">{ago(c.at)}</span>}</div>
                <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.text}</div>
              </div>
            </div>
          ))}
        </>
      )}
      <div className="compose">
        <form onSubmit={send}>
          <textarea rows={1} value={text} placeholder="Comment on this post" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }} />
          <button className="btn" disabled={sending || !text.trim()}>Send</button>
        </form>
      </div>
    </>
  );
}

function Messages() {
  const [groups, setGroups] = useState(null);
  const [gmError, setGmError] = useState("");
  const [updates, setUpdates] = useState(null);
  const [heja, setHeja] = useState(null);
  const [open, setOpen] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (open) return;
    getJSON("/api/heja").then(setHeja).catch((e) => setHeja({ connected: false, items: [], error: e.message }));
    getJSON("/api/groupme").then((b) => setGroups(b.groups)).catch((e) => { setGroups([]); setGmError(e.message); });
    getJSON("/api/notifications").then(setUpdates).catch((e) => setUpdates({ items: [], errors: [{ source: "Updates", error: e.message }] }));
  }, [open, reload]);

  if (open?.kind === "heja") return <HejaPost item={open} onBack={() => setOpen(null)} />;
  if (open) return <Chat group={open} onBack={() => setOpen(null)} />;
  if (!groups || !updates || !heja) return <p className="empty">Loading messages…</p>;

  const feed = [
    ...groups.map((g) => ({ ...g, kind: "groupme", at: g.lastAt })),
    ...updates.items,
    ...(heja.items || []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="chatlist" style={{ marginTop: 12 }}>
      {gmError && <p className="err">GroupMe: {gmError}</p>}
      {updates.errors?.map((e) => <p key={e.source} className="err">{e.source}: {e.error}</p>)}
      {heja.error && heja.connected !== false && <p className="err">Heja: {heja.error}</p>}
      {!heja.connected && <ConnectHeja onDone={() => setReload((n) => n + 1)} />}
      {updates.teamsnap?.available && !updates.teamsnap.connected && (
        <p><a className="btn" href="/api/teamsnap/connect" style={{ textDecoration: "none", display: "inline-block" }}>Connect TeamSnap</a></p>
      )}
      {updates.email === false && <p className="meta">Gmail isn't connected, so the email backup is off.</p>}
      {!feed.length && <p className="empty">No messages yet.</p>}
      {feed.map((item) =>
        item.kind === "groupme" ? (
          <div className="card" key={item.id} onClick={() => setOpen(item)}>
            {item.image ? <img className="avatar" src={`${item.image}.avatar`} alt="" /> : <div className="avatar" />}
            <div className="grow">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="title ellipsis">{item.name}</span>
                <span className="meta">{ago(item.at)}</span>
              </div>
              <div className="meta ellipsis">{item.preview}</div>
              <span className="chip">GroupMe</span>
            </div>
          </div>
        ) : item.kind === "heja" ? (
          <div className="card" key={item.id} onClick={() => setOpen(item)} style={{ cursor: "pointer", display: "block" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="title ellipsis">{item.title}</span>
              <span className="meta">{ago(item.at)}</span>
            </div>
            <div className="meta ellipsis">{item.author}: {item.text}</div>
            {item.lastComment && <div className="meta ellipsis">↳ {item.lastComment}</div>}
            <span className="chip">Heja</span>
          </div>
        ) : (
          <Update key={item.id} item={item} />
        )
      )}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState("schedule");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "messages") setTab("messages");
  }, []);
  return (
    <>
      <header className="top">
        <h1>Sports Hub</h1>
        <div className="tabs">
          <button className={tab === "schedule" ? "on" : ""} onClick={() => setTab("schedule")}>Schedule</button>
          <button className={tab === "messages" ? "on" : ""} onClick={() => setTab("messages")}>Messages</button>
        </div>
      </header>
      <main className="wrap">{tab === "schedule" ? <Schedule /> : <Messages />}</main>
    </>
  );
}
