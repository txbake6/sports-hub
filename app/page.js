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

function Chat({ group, onBack }) {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    getJSON(`/api/groupme/${group.id}`).then((b) => setMessages(b.messages)).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [group.id]);

  useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [messages?.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const res = await fetch(`/api/groupme/${group.id}`, {
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

function Messages() {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    getJSON("/api/groupme").then((b) => setGroups(b.groups)).catch((e) => setError(e.message));
  }, [open]);

  if (open) return <Chat group={open} onBack={() => setOpen(null)} />;
  if (error) return <p className="err">GroupMe: {error}</p>;
  if (!groups) return <p className="empty">Loading chats…</p>;
  if (!groups.length) return <p className="empty">No GroupMe chats found.</p>;
  return (
    <div className="chatlist" style={{ marginTop: 12 }}>
      {groups.map((g) => (
        <div className="card" key={g.id} onClick={() => setOpen(g)}>
          {g.image ? <img className="avatar" src={`${g.image}.avatar`} alt="" /> : <div className="avatar" />}
          <div className="grow">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="title ellipsis">{g.name}</span>
              <span className="meta">{ago(g.lastAt)}</span>
            </div>
            <div className="meta ellipsis">{g.preview}</div>
            <span className="chip">GroupMe</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState("schedule");
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
