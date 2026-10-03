"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) window.location.href = "/";
    else setError("That password didn't work.");
  }
  return (
    <form className="login" onSubmit={submit}>
      <h1>Sports Hub</h1>
      <input type="password" autoFocus placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn" style={{ width: "100%" }}>Sign in</button>
      {error && <p className="err">{error}</p>}
    </form>
  );
}
