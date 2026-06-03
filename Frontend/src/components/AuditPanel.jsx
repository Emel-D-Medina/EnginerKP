/* ─────────────────────────────────────────────
   AuditPanel.jsx  —  Panel de Auditoría
   Rediseñado para ser comprensible por cualquier
   usuario, no solo técnicos.
───────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";

/* ── Descripción legible de cada tipo de paquete ── */
const PACKET_INFO = {
  message: {
    icon: "💬",
    label: "Mensaje",
    color: "pkt-msg",
    explain: (e) =>
      e.encrypted
        ? `Mensaje cifrado de ${e.sender || "tú"}. En la red viaja codificado — nadie sin la clave puede leerlo.`
        : `Mensaje en texto plano de ${e.sender || "tú"}. Cualquiera que intercepte la red puede leer este contenido.`,
  },
  system: {
    icon: "⚙️",
    label: "Sistema",
    color: "pkt-sys",
    explain: () =>
      "Notificación interna del servidor: conexión, desconexión o estado de la sala.",
  },
  typing: {
    icon: "✏️",
    label: "Escribiendo",
    color: "pkt-typing",
    explain: (e) =>
      `El servidor notifica que ${e.sender || "alguien"} está escribiendo. Este paquete no contiene texto, solo la señal.`,
  },
  receipt: {
    icon: "✓",
    label: "Recibo",
    color: "pkt-receipt",
    explain: () =>
      "Confirmación de entrega o lectura. Permite mostrar los ✓✓ verdes en tus mensajes.",
  },
  reaction: {
    icon: "😊",
    label: "Reacción",
    color: "pkt-reaction",
    explain: (e) =>
      `${e.sender || "Alguien"} reaccionó a un mensaje. Las reacciones viajan como paquetes independientes.`,
  },
  "public-keys": {
    icon: "🔑",
    label: "Clave pública",
    color: "pkt-keys",
    explain: (e) =>
      `${e.sender || "Un cliente"} compartió su clave pública ECDH y ECDSA. Con esto ambos extremos derivan la clave secreta sin que el servidor la conozca. Es el corazón del cifrado E2E.`,
  },
  users: {
    icon: "👥",
    label: "Usuarios",
    color: "pkt-users",
    explain: () => "Lista de usuarios activos en la sala en este momento.",
  },
  error: {
    icon: "🚨",
    label: "Error",
    color: "pkt-error",
    explain: () =>
      "El servidor reportó un error. Puede ser usuario duplicado u otro problema de conexión.",
  },
};

const DEFAULT_INFO = {
  icon: "📦",
  label: "Paquete",
  color: "pkt-other",
  explain: () => "Paquete de tipo desconocido reenviado por el servidor.",
};

/* ── Contador de tipos para el resumen ── */
function buildStats(entries) {
  const total = entries.length;
  const enc = entries.filter((e) => e.encrypted).length;
  const plain = entries.filter(
    (e) => e.type === "message" && !e.encrypted,
  ).length;
  const bytes = entries.reduce((acc, e) => acc + (e.size || 0), 0);
  return { total, enc, plain, bytes };
}

/* ── Fila de un paquete ── */
function AuditRow({ entry, index, isSelected, onClick }) {
  const info = PACKET_INFO[entry.type] || DEFAULT_INFO;

  return (
    <div
      className={`audit2-row ${info.color} ${isSelected ? "selected" : ""} ${entry.dir}`}
      onClick={onClick}
    >
      {/* número de secuencia */}
      <span className="audit2-seq">#{index + 1}</span>

      {/* icono + tipo */}
      <span className="audit2-icon">{info.icon}</span>
      <span className="audit2-label">{info.label}</span>

      {/* dirección */}
      <span className={`audit2-dir ${entry.dir}`}>
        {entry.dir === "out" ? "↑ enviado" : "↓ recibido"}
      </span>

      {/* cifrado / plano */}
      {entry.type === "message" && (
        <span className={`audit2-enc ${entry.encrypted ? "enc" : "plain"}`}>
          {entry.encrypted ? "🔒 cifrado" : "🔓 plano"}
        </span>
      )}

      {/* tamaño */}
      <span className="audit2-size">{entry.size} B</span>

      {/* hora */}
      <span className="audit2-time">{entry.time}</span>
    </div>
  );
}

/* ── Panel de detalle al seleccionar una fila ── */
function DetailPanel({ entry, index, onClose }) {
  if (!entry) return null;
  const info = PACKET_INFO[entry.type] || DEFAULT_INFO;

  return (
    <div className="audit2-detail">
      <div className="audit2-detail-header">
        <span className="audit2-detail-icon">{info.icon}</span>
        <div>
          <div className="audit2-detail-title">
            {info.label} #{index + 1}
          </div>
          <div className="audit2-detail-sub">
            {entry.time} · {entry.size} bytes ·{" "}
            {entry.dir === "out" ? "enviado por ti" : "recibido del servidor"}
          </div>
        </div>
        <button className="audit2-close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Explicación en lenguaje natural */}
      <div className="audit2-explain">
        <div className="audit2-explain-title">¿Qué es este paquete?</div>
        <p>{info.explain(entry)}</p>
      </div>

      {/* Datos clave */}
      {entry.sender && (
        <div className="audit2-field">
          <span className="audit2-field-key">Remitente</span>
          <span className="audit2-field-val">{entry.sender}</span>
        </div>
      )}
      <div className="audit2-field">
        <span className="audit2-field-key">Tipo</span>
        <span className="audit2-field-val mono">{entry.type}</span>
      </div>
      <div className="audit2-field">
        <span className="audit2-field-key">Dirección</span>
        <span className="audit2-field-val">
          {entry.dir === "out"
            ? "↑ Saliente (tú → servidor)"
            : "↓ Entrante (servidor → tú)"}
        </span>
      </div>
      {entry.type === "message" && (
        <div className="audit2-field">
          <span className="audit2-field-key">Contenido en red</span>
          <span
            className={`audit2-field-val ${entry.encrypted ? "enc-val" : "plain-val"}`}
          >
            {entry.encrypted
              ? "Token Fernet cifrado (AES-128-CBC + HMAC-SHA256)"
              : "Texto legible por cualquiera"}
          </span>
        </div>
      )}

      {/* Payload raw */}
      <div className="audit2-explain-title" style={{ marginTop: 10 }}>
        Lo que viaja por la red
      </div>
      <div className="audit2-raw">{entry.raw}</div>

      {/* Nota de seguridad contextual */}
      {entry.type === "message" && !entry.encrypted && (
        <div className="audit2-warning">
          ⚠️ Este mensaje viaja sin cifrar. Un atacante en la misma red podría
          leerlo con Wireshark u otra herramienta de captura.
        </div>
      )}
      {entry.type === "message" && entry.encrypted && (
        <div className="audit2-ok">
          ✅ Cifrado E2E activo. El servidor solo ve el token opaco — no puede
          descifrar el contenido.
        </div>
      )}
      {entry.type === "public-keys" && (
        <div className="audit2-ok">
          🔑 Intercambio de claves ECDH. Después de este paquete, ambos extremos
          comparten un secreto que nunca viajó por la red.
        </div>
      )}
    </div>
  );
}

/* ── Resumen estadístico ── */
function StatsBar({ stats }) {
  return (
    <div className="audit2-stats">
      <div className="audit2-stat">
        <span className="audit2-stat-n">{stats.total}</span>
        <span className="audit2-stat-l">paquetes</span>
      </div>
      <div className="audit2-stat-div" />
      <div className="audit2-stat enc">
        <span className="audit2-stat-n">{stats.enc}</span>
        <span className="audit2-stat-l">🔒 cifrados</span>
      </div>
      <div className="audit2-stat-div" />
      <div className="audit2-stat plain">
        <span className="audit2-stat-n">{stats.plain}</span>
        <span className="audit2-stat-l">🔓 planos</span>
      </div>
      <div className="audit2-stat-div" />
      <div className="audit2-stat">
        <span className="audit2-stat-n">
          {stats.bytes < 1024
            ? `${stats.bytes}B`
            : `${(stats.bytes / 1024).toFixed(1)}KB`}
        </span>
        <span className="audit2-stat-l">transferidos</span>
      </div>
    </div>
  );
}

/* ── Componente principal ── */
export default function AuditPanel({ entries }) {
  const [selected, setSelected] = useState(null); // index
  const [filter, setFilter] = useState("all"); // all | message | system | keys
  const bottomRef = useRef(null);

  // Auto-scroll al llegar nuevas entradas (solo si no hay selección activa)
  useEffect(() => {
    if (selected === null) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, selected]);

  const stats = buildStats(entries);

  const FILTERS = [
    { key: "all", label: "Todo" },
    { key: "message", label: "💬 Mensajes" },
    { key: "public-keys", label: "🔑 Claves" },
    { key: "system", label: "⚙️ Sistema" },
  ];

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.type === filter);

  const selectedEntry = selected !== null ? entries[selected] : null;

  return (
    <div className="audit2-panel">
      {/* Header */}
      <div className="audit2-header">
        <div className="audit2-header-top">
          <span className="audit2-title">🔍 Auditoría de tráfico</span>
          <span className="audit2-subtitle">
            Haz clic en un paquete para ver su explicación
          </span>
        </div>
        <StatsBar stats={stats} />

        {/* Filtros */}
        <div className="audit2-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`audit2-filter-btn ${filter === f.key ? "active" : ""}`}
              onClick={() => {
                setFilter(f.key);
                setSelected(null);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de paquetes */}
      <div className="audit2-list">
        {visible.length === 0 && (
          <div className="audit2-empty">
            <span style={{ fontSize: 28 }}>📡</span>
            <span>Esperando paquetes…</span>
            <span style={{ fontSize: 11, color: "var(--txt-3)" }}>
              Envía un mensaje para ver el tráfico
            </span>
          </div>
        )}
        {visible.map((e, i) => {
          const realIdx = entries.indexOf(e);
          return (
            <AuditRow
              key={realIdx}
              entry={e}
              index={realIdx}
              isSelected={selected === realIdx}
              onClick={() => setSelected(selected === realIdx ? null : realIdx)}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Panel de detalle */}
      {selectedEntry && (
        <DetailPanel
          entry={selectedEntry}
          index={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Leyenda fija al fondo */}
      <div className="audit2-legend">
        <span className="audit2-legend-item enc">
          🔒 Cifrado = nadie sin la clave puede leerlo
        </span>
        <span className="audit2-legend-item plain">
          🔓 Plano = visible en la red
        </span>
      </div>
    </div>
  );
}
