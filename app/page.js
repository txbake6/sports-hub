"use client";
import { useEffect, useState } from "react";
import { ICONS, isGame, styleFor } from "../lib/styles";

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
  if (!data.sources.length) return <p className="empty">No schedules yet. Connect Heja or add a calendar link in the Setup tab.</p>;

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
        {data.sources.map((s) => {
          const st = styleFor(s, data.styles);
          const on = !hidden.includes(s);
          return (
            <button key={s} className={on ? "on" : ""} onClick={() => toggle(s)}
              style={on ? { background: st.color, borderColor: st.color, color: "#fff" } : { borderColor: st.color }}>
              {st.icon} {s}
            </button>
          );
        })}
        <button className={showPast ? "on" : ""} onClick={() => setShowPast(!showPast)}>Past week</button>
      </div>
      {data.errors.map((e) => (
        <p key={e.source} className="err">Couldn't load {e.source}: {e.error}</p>
      ))}
      {!byDay.length && <p className="empty">Nothing on the schedule.</p>}
      {byDay.map((d) => (
        <section key={d.label}>
          <div className="day">{d.label}</div>
          {d.items.map((ev) => {
            const st = styleFor(ev.source, data.styles);
            return (
              <div className={`card row event${ev.cancelled ? " cancelled" : ""}`} key={ev.id} style={{ borderLeftColor: st.color }}>
                <div className="time">{ev.allDay ? "All day" : timeFmt.format(new Date(ev.start))}</div>
                <div className="badge" style={{ background: st.color }} aria-hidden>{st.icon}</div>
                <div className="grow">
                  <div className="title">
                    {ev.title}
                    {isGame(ev.title) && <span className="tag" style={{ background: st.color, borderColor: st.color, color: "#fff" }}>Game</span>}
                    {ev.cancelled && <span className="tag">Cancelled</span>}
                  </div>
                  {ev.location && <div className="meta">{ev.location}</div>}
                  <span className="chip" style={{ borderColor: st.color }}>{ev.source}</span>
                </div>
              </div>
            );
          })}
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

function ConnectWithPassword({ app, url, note, onDone }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(null); // set when the app asks for an emailed code
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await postJSON(url, code === null ? { email, password } : { email, password, code });
      if (r.needsCode) {
        setCode("");
      } else {
        setPassword("");
        setCode(null);
        onDone();
      }
    } catch (err) {
      setError(err.message);
      if (/expired/i.test(err.message)) setCode(null);
    }
    setBusy(false);
  }
  const box = { padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)", minWidth: 0 };
  return (
    <form className="card" onSubmit={submit}>
      <div className="title">Connect {app}</div>
      <div className="meta">Sign in with your {app} email and password. The password is only used to sign in and isn't saved.{note ? ` ${note}` : ""}</div>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        <input style={box} type="email" autoComplete="username" placeholder={`${app} email`} value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="row">
          <input className="grow" style={box} type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" disabled={busy || !email || !password || code !== null}>{busy ? "Connecting…" : "Connect"}</button>
        </div>
      </div>
      {code !== null && (
        <div style={{ marginTop: 8 }}>
          <div className="meta">{app} wants to confirm this new device. Enter the 4-digit code it just emailed you.</div>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="grow" style={box} inputMode="numeric" autoComplete="one-time-code" placeholder="0000" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn" type="submit" disabled={busy || !/^\d{4,8}$/.test(code.trim())}>{busy ? "Checking…" : "Confirm"}</button>
          </div>
          <button className="link" type="button" onClick={() => { setCode(null); setError(""); }}>Start over</button>
        </div>
      )}
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
  const [pm, setPm] = useState(null);
  const [rm, setRm] = useState(null);
  const [ts1, setTs1] = useState(null);
  const [open, setOpen] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (open) return;
    getJSON("/api/heja").then(setHeja).catch((e) => setHeja({ connected: false, items: [], error: e.message }));
    getJSON("/api/teamsnapone").then(setTs1).catch((e) => setTs1({ connected: false, items: [], error: e.message }));
    getJSON("/api/remind").then(setRm).catch((e) => setRm({ connected: false, items: [], error: e.message }));
    getJSON("/api/playmetrics").then(setPm).catch((e) => setPm({ connected: false, items: [], error: e.message }));
    getJSON("/api/groupme").then((b) => setGroups(b.groups)).catch((e) => { setGroups([]); setGmError(e.message); });
    getJSON("/api/notifications").then(setUpdates).catch((e) => setUpdates({ items: [], errors: [{ source: "Updates", error: e.message }] }));
  }, [open, reload]);

  if (open?.kind === "heja") return <HejaPost item={open} onBack={() => setOpen(null)} />;
  if (open) return <Chat group={open} onBack={() => setOpen(null)} />;
  if (!groups || !updates || !heja || !pm || !rm || !ts1) return <p className="empty">Loading messages…</p>;

  const feed = [
    ...groups.map((g) => ({ ...g, kind: "groupme", at: g.lastAt })),
    ...updates.items,
    ...(heja.items || []),
    ...(pm.items || []),
    ...(rm.items || []),
    ...(ts1.items || []),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="chatlist" style={{ marginTop: 12 }}>
      {gmError && <p className="err">GroupMe: {gmError}</p>}
      {updates.errors?.map((e) => <p key={e.source} className="err">{e.source}: {e.error}</p>)}
      {heja.error && heja.connected !== false && <p className="err">Heja: {heja.error}</p>}
      {pm.error && <p className="err">PlayMetrics: {pm.error}</p>}
      {rm.error && <p className="err">Remind: {rm.error}</p>}
      {ts1.error && <p className="err">TeamSnap ONE: {ts1.error}</p>}
      {!feed.length && <p className="empty">No messages yet. Connect your apps in the Setup tab.</p>}
      {feed.map((item) =>
        item.kind === "groupme" || item.kind === "playmetrics" || item.kind === "remind" || item.kind === "teamsnapone" ? (
          <div className="card" key={item.id} onClick={() => setOpen(item)}>
            {item.image ? <img className="avatar" src={`${item.image}.avatar`} alt="" /> : <div className="avatar" />}
            <div className="grow">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="title ellipsis">{item.name}</span>
                <span className="meta">{ago(item.at)}</span>
              </div>
              <div className="meta ellipsis">{item.preview}</div>
              <span className="chip">{item.source || "GroupMe"}</span>
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

const inputStyle = { padding: "8px 10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--card)", color: "var(--text)", minWidth: 0 };

function ConnectGroupMe({ connected, onChange }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(value) {
    setBusy(true);
    setError("");
    try {
      onChange(await postJSON("/api/settings", { groupmeToken: value }));
      setToken("");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">GroupMe</span>
        <span className="meta">{connected ? "Connected" : "Not connected"}</span>
      </div>
      {connected ? (
        <p style={{ margin: "6px 0 0" }}><button className="link" onClick={() => save(null)} disabled={busy}>Disconnect</button></p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save(token); }}>
          <div className="meta">Sign in at <a href="https://dev.groupme.com" target="_blank" rel="noreferrer">dev.groupme.com</a>, tap <b>Access Token</b> at the top, and paste it here.</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input className="grow" style={inputStyle} placeholder="GroupMe access token" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn" disabled={busy || !token.trim()}>Connect</button>
          </div>
        </form>
      )}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function CalendarLinks({ feeds, uploads = [], onChange }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(body) {
    setBusy(true);
    setError("");
    try {
      onChange(await postJSON("/api/settings", body));
      setUrl("");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  }
  return (
    <div className="card">
      <div className="title">Other calendars</div>
      <div className="meta">For any app that isn't connected, paste its calendar "subscribe" or "sync" link.</div>
      {feeds.map((f) => (
        <div className="row" key={f.url} style={{ justifyContent: "space-between", marginTop: 6 }}>
          <span className="meta ellipsis grow">{f.name || new URL(f.url).hostname}</span>
          <button className="link" onClick={() => send({ removeFeed: f.url })} disabled={busy}>Remove</button>
        </div>
      ))}
      <form className="row" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); send({ addFeed: { url } }); }}>
        <input className="grow" style={inputStyle} placeholder="webcal:// or https:// link" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="btn" disabled={busy || !url.trim()}>Add</button>
      </form>
      <div className="meta" style={{ marginTop: 12 }}>Or upload an .ics file. An upload is a snapshot, so upload it again when the schedule changes. A link stays up to date by itself.</div>
      {uploads.map((u) => (
        <div className="row" key={u.id} style={{ justifyContent: "space-between", marginTop: 6 }}>
          <span className="meta ellipsis grow">📎 {u.name}</span>
          <button className="link" disabled={busy} onClick={async () => { await fetch(`/api/calendars?id=${encodeURIComponent(u.id)}`, { method: "DELETE" }); onChange(await getJSON("/api/settings")); }}>Remove</button>
        </div>
      ))}
      <label className="btn" style={{ display: "inline-block", marginTop: 8, cursor: "pointer" }}>
        {busy ? "Uploading…" : "Upload .ics file"}
        <input type="file" accept=".ics,text/calendar" multiple hidden disabled={busy} onChange={async (e) => {
          const files = [...e.target.files];
          e.target.value = "";
          setBusy(true);
          setError("");
          try {
            for (const f of files) await postJSON("/api/calendars", { name: f.name, ics: await f.text() });
            onChange(await getJSON("/api/settings"));
          } catch (err) {
            setError(err.message);
          }
          setBusy(false);
        }} />
      </label>
      {error && <p className="err">{error}</p>}
    </div>
  );
}

// Pick the color and icon for each schedule. Changes save right away and show on every device.
function ScheduleColors({ styles, onChange }) {
  const [sources, setSources] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !sources) getJSON("/api/schedule").then((d) => setSources(d.sources)).catch(() => setSources([]));
  }, [open]);
  async function save(body) {
    try { onChange(await postJSON("/api/settings", body)); } catch {}
  }
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">Schedule colors and icons</span>
        <button className="link" onClick={() => setOpen(!open)}>{open ? "Done" : "Change"}</button>
      </div>
      {!open && <div className="meta">Each team gets its own color and icon on the Schedule.</div>}
      {open && !sources && <p className="empty">Loading…</p>}
      {open && sources?.map((src) => {
        const st = styleFor(src, styles);
        return (
          <div key={src} className="row" style={{ marginTop: 8, gap: 8 }}>
            <input type="color" value={st.color} aria-label={`Color for ${src}`} onChange={(e) => save({ setStyle: { source: src, color: e.target.value } })}
              style={{ width: 36, height: 32, padding: 0, border: "none", background: "none" }} />
            <select value={st.icon} aria-label={`Icon for ${src}`} onChange={(e) => save({ setStyle: { source: src, icon: e.target.value } })} style={inputStyle}>
              {[...new Set([st.icon, ...ICONS])].map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <span className="meta ellipsis grow">{src}</span>
            {styles[src] && <button className="link" onClick={() => save({ resetStyle: src })}>Reset</button>}
          </div>
        );
      })}
    </div>
  );
}

function Setup() {
  const [s, setS] = useState(null);
  const [error, setError] = useState("");
  const load = () => getJSON("/api/settings").then(setS).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  if (error) return <p className="err">{error}</p>;
  if (!s) return <p className="empty">Loading…</p>;
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      <p className="meta" style={{ margin: 0 }}>{s.synced ? "Connect each app once. Your phone and computer share these connections." : "Connect each app once on this phone or computer. Your sign-ins stay saved in this browser."}</p>
      {s.heja ? (
        <div className="card"><div className="row" style={{ justifyContent: "space-between" }}><span className="title">Heja</span>
          <button className="link" onClick={async () => { await fetch("/api/heja", { method: "DELETE" }); load(); }}>Disconnect</button></div>
          <div className="meta">Posts, comments and schedule</div></div>
      ) : (
        <ConnectHeja onDone={load} />
      )}
      <ConnectGroupMe connected={s.groupme} onChange={setS} />
      {s.playmetrics ? (
        <div className="card"><div className="row" style={{ justifyContent: "space-between" }}><span className="title">PlayMetrics</span>
          <button className="link" onClick={async () => { await fetch("/api/playmetrics", { method: "DELETE" }); load(); }}>Disconnect</button></div>
          <div className="meta">Team chats, club messages and team calendars</div></div>
      ) : (
        <ConnectWithPassword app="PlayMetrics" url="/api/playmetrics" onDone={load} />
      )}
      {s.teamsnapone ? (
        <div className="card"><div className="row" style={{ justifyContent: "space-between" }}><span className="title">TeamSnap ONE</span>
          <button className="link" onClick={async () => { await fetch("/api/teamsnapone", { method: "DELETE" }); load(); }}>Disconnect</button></div>
          <div className="meta">Team chats and schedule</div></div>
      ) : (
        <ConnectWithPassword app="TeamSnap ONE" url="/api/teamsnapone" onDone={load} />
      )}
      {s.remind ? (
        <div className="card"><div className="row" style={{ justifyContent: "space-between" }}><span className="title">Remind</span>
          <button className="link" onClick={async () => { await fetch("/api/remind", { method: "DELETE" }); load(); }}>Disconnect</button></div>
          <div className="meta">Chats and class announcements</div></div>
      ) : (
        <ConnectWithPassword app="Remind" url="/api/remind" onDone={load} />
      )}
      {s.teamsnap.available && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><span className="title">TeamSnap</span><span className="meta">{s.teamsnap.connected ? "Connected" : "Not connected"}</span></div>
          {!s.teamsnap.connected && <p style={{ margin: "6px 0 0" }}><a className="btn" href="/api/teamsnap/connect" style={{ textDecoration: "none", display: "inline-block" }}>Connect TeamSnap</a></p>}
        </div>
      )}
      <CalendarLinks feeds={s.feeds} uploads={s.uploads} onChange={setS} />
      <ScheduleColors styles={s.styles || {}} onChange={setS} />
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState("schedule");
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "messages" || t === "setup") setTab(t);
  }, []);
  return (
    <>
      <header className="top">
        <h1>Sports Hub</h1>
        <div className="tabs">
          <button className={tab === "schedule" ? "on" : ""} onClick={() => setTab("schedule")}>Schedule</button>
          <button className={tab === "messages" ? "on" : ""} onClick={() => setTab("messages")}>Messages</button>
          <button className={tab === "setup" ? "on" : ""} onClick={() => setTab("setup")}>Setup</button>
        </div>
      </header>
      <main className="wrap">{tab === "schedule" ? <Schedule /> : tab === "messages" ? <Messages /> : <Setup />}</main>
    </>
  );
}
