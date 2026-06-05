/* ControlPanel.jsx — key gen + ECDH status */
import { useState } from "react";
import { generateFernetKey } from "../utils/crypto.js";

function apiBase() {
  return window.location.origin;
}

export default function ControlPanel({ onKeyChange, ecdhStatus, connected }) {
  const [keyInput, setKeyInput] = useState("");

  const handleGenerate = async () => {
    const local = generateFernetKey();
    setKeyInput(local);
    onKeyChange(local);
    try {
      const res = await fetch(apiBase() + "/api/generate-key");
      if (res.ok) {
        const { key } = await res.json();
        setKeyInput(key);
        onKeyChange(key);
      }
    } catch {
      /* usa clave local */
    }
  };

  return (
    <div className="control-panel">
      <input
        className="key-input"
        placeholder="clave fernet compartida (o usa ECDH automático →)"
        value={keyInput}
        onChange={(e) => setKeyInput(e.target.value)}
        onBlur={() => onKeyChange(keyInput)}
        spellCheck={false}
        autoComplete="off"
      />
      <button className="btn btn-amber" onClick={handleGenerate}>
        generar clave
      </button>
      {ecdhStatus === "derived" && (
        <span
          className="ecdh-badge ok"
          title="Clave derivada automáticamente via ECDH"
        >
          🔑 ECDH ✓
        </span>
      )}
      {ecdhStatus === "pending" && (
        <span
          className="ecdh-badge pending"
          title="Esperando clave pública del peer"
        >
          🔑 ECDH…
        </span>
      )}
    </div>
  );
}
