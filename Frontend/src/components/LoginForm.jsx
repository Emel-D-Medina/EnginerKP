/* LoginForm.jsx — now includes room input */
import { useState, useEffect } from "react";

function detectWsUrl() {
  const port = window.location.port;
  if (port === "5173" || port === "5174") {
    return import.meta.env.VITE_WS_URL || "ws://localhost:8000";
  }
  return window.location.origin.replace(/^http/, "ws");
}

export default function LoginForm({ onJoin }) {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("general");
  const [localIps, setLocalIps] = useState([]);
  const [loading, setLoading] = useState(true);

  const serverUrl = detectWsUrl();

  useEffect(() => {
    const base = serverUrl.replace(/^ws/, "http");
    fetch(base + "/api/local-ips")
      .then((r) => r.json())
      .then((d) => setLocalIps(d.ips || []))
      .catch(() => setLocalIps([]))
      .finally(() => setLoading(false));
  }, [serverUrl]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim() && room.trim())
      onJoin(username.trim(), serverUrl, room.trim());
  };

  const host = serverUrl.replace(/^wss?:\/\//, "");

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-header">
          <div className="login-title">cryptochat</div>
          <div className="login-subtitle">AES-128 · ECDH · ECDSA · fernet</div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="login-label">identificador</label>
          <input
            className="login-input"
            placeholder="alice"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <label className="login-label">sala</label>
          <input
            className="login-input"
            placeholder="general"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn-login">
            entrar →
          </button>
        </form>

        {!loading && (
          <div className="login-meta">
            <div className="login-meta-row">
              <span className="login-meta-key">servidor</span>
              <span className="login-meta-val">{host}</span>
            </div>
            {localIps.map((ip) => (
              <div key={ip} className="login-meta-row">
                <span className="login-meta-key">tu ip</span>
                <span className="login-meta-ip">
                  {ip}:{window.location.port || "8000"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
