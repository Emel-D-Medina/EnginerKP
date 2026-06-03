import { useState } from "react";

const STATUS = {
  connected: "connected",
  connecting: "connecting",
  disconnected: "disconnected",
  error: "error",
};

function host(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function ConnectionPanel({ connections, onAdd, onRemove }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newUser, setNewUser] = useState("");

  const primary = connections[0];
  const extras = connections.slice(1);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newUrl.trim() || !newUser.trim()) return;
    onAdd(newUrl.trim(), newUser.trim());
    setNewUrl("");
    setNewUser("");
    setShowAdd(false);
  };

  return (
    <div className="connection-panel">
      <span className="conn-label">nodos</span>

      {primary && (
        <span
          className={`conn-tag ${STATUS[primary.status] ?? "disconnected"}`}
          title={primary.url}
        >
          <span className="conn-dot" />
          {primary.username}@{host(primary.url)}
        </span>
      )}

      {extras.map((c) => (
        <span
          key={c.id}
          className={`conn-tag removable ${STATUS[c.status] ?? "disconnected"}`}
          onClick={() => onRemove(c.id)}
          title={`${c.url} — click para desconectar`}
        >
          <span className="conn-dot" />
          {c.username}@{host(c.url)}
          &nbsp;×
        </span>
      ))}

      <button
        className="btn btn-ghost"
        style={{ height: 24, padding: "0 8px", fontSize: 12 }}
        onClick={() => setShowAdd((v) => !v)}
      >
        {showAdd ? "−" : "+"}
      </button>

      {showAdd && (
        <form className="add-form" onSubmit={handleAdd}>
          <input
            placeholder="ws://192.168.1.x:8000"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            style={{ width: 210 }}
          />
          <input
            placeholder="usuario"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
            style={{ width: 110 }}
          />
          <button
            type="submit"
            className="btn btn-ghost"
            style={{ height: 28 }}
          >
            conectar
          </button>
        </form>
      )}
    </div>
  );
}
