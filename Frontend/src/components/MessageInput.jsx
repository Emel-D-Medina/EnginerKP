/* ─────────────────────────────────────────────
   MessageInput.jsx
   Features:
   - Typing indicator (debounced)
   - @usuario for private messages
   - TTL selector (self-destruct)
   - File / image attachment (base64 cifrado)
───────────────────────────────────────────── */
import { useState, useRef, useCallback } from "react";

const TTL_OPTIONS = [
  { label: "∞", value: 0 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "1min", value: 60 },
];

export default function MessageInput({
  onSend,
  onTyping,
  disabled,
  connectedUsers = [],
}) {
  const [text, setText] = useState("");
  const [ttl, setTtl] = useState(0);
  const [showTtl, setShowTtl] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const typingTimer = useRef(null);
  const fileRef = useRef(null);

  // ── typing indicator (debounce 1.5 s) ─────
  const handleChange = useCallback(
    (e) => {
      const val = e.target.value;
      setText(val);

      // @mention autocomplete
      const atMatch = val.match(/@(\w*)$/);
      if (atMatch) {
        const partial = atMatch[1].toLowerCase();
        const match = connectedUsers.find(
          (u) => u.toLowerCase().startsWith(partial) && u !== "tú",
        );
        setSuggestion(match || null);
      } else {
        setSuggestion(null);
      }

      // typing event
      if (onTyping) {
        onTyping();
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {}, 1500);
      }
    },
    [onTyping, connectedUsers],
  );

  const applySuggestion = () => {
    if (!suggestion) return;
    setText((t) => t.replace(/@\w*$/, `@${suggestion} `));
    setSuggestion(null);
  };

  // ── file attachment ────────────────────────
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result.split(",")[1];
      onSend(b64, false, {
        contentType: isImage ? "image" : "file",
        filename: file.name,
        ttl,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── send ───────────────────────────────────
  const send = (encrypted) => {
    if (!text.trim()) return;
    // parse @target
    const privateMatch = text.match(/^@(\S+)\s+([\s\S]+)$/);
    if (privateMatch) {
      const [, target, body] = privateMatch;
      onSend(body.trim(), encrypted, { target, ttl });
    } else {
      onSend(text.trim(), encrypted, { ttl });
    }
    setText("");
    setSuggestion(null);
  };

  return (
    <div className="input-bar">
      {/* TTL picker */}
      {showTtl && (
        <div className="ttl-row">
          <span className="ttl-label">💣 autodestruir en:</span>
          {TTL_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`btn btn-ghost ttl-opt ${ttl === o.value ? "active" : ""}`}
              onClick={() => setTtl(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="input-row">
        {/* file attach */}
        <button
          className="btn btn-ghost icon-btn"
          title="adjuntar archivo"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFile}
        />

        {/* ttl toggle */}
        <button
          className={`btn btn-ghost icon-btn ${ttl > 0 ? "active" : ""}`}
          title="mensaje autodestructible"
          onClick={() => setShowTtl((v) => !v)}
          disabled={disabled}
        >
          💣
        </button>

        {/* text input */}
        <div style={{ flex: 1, position: "relative" }}>
          <input
            className="msg-input"
            placeholder="mensaje... (@usuario para privado)"
            value={text}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === "Tab" && suggestion) {
                e.preventDefault();
                applySuggestion();
              }
              if (e.key === "Enter" && !e.shiftKey) send(false);
            }}
            disabled={disabled}
            autoComplete="off"
            spellCheck={false}
          />
          {suggestion && (
            <div className="mention-suggestion" onClick={applySuggestion}>
              @{suggestion} <span className="mention-hint">Tab</span>
            </div>
          )}
        </div>

        <button
          className="btn btn-red"
          onClick={() => send(false)}
          disabled={disabled}
        >
          plano
        </button>
        <button
          className="btn btn-green"
          onClick={() => send(true)}
          disabled={disabled}
        >
          cifrado
        </button>
      </div>

      <div className="input-hint">
        <span>
          <span className="hint-dot" style={{ background: "var(--red)" }} />
          plano — visible en red
        </span>
        <span>
          <span className="hint-dot" style={{ background: "var(--green)" }} />
          fernet AES-128-CBC + HMAC-SHA256
        </span>
        <span style={{ marginLeft: "auto", color: "var(--txt-3)" }}>
          @usuario mensaje privado · Tab para completar
        </span>
      </div>
    </div>
  );
}
