/* ─────────────────────────────────────────────
   ChatBox.jsx
   Renders messages with:
   - Delivery / read receipts (✓ ✓✓)
   - Emoji reactions
   - Self-destructing message countdown
   - Signature verification badge
   - File / image previews
   - @private message styling
───────────────────────────────────────────── */
import { useEffect, useRef, useState } from "react";

const EMOJI_LIST = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function ReceiptIcon({ status }) {
  if (!status) return null;
  if (status === "read")
    return (
      <span className="receipt read" title="leído">
        ✓✓
      </span>
    );
  if (status === "delivered")
    return (
      <span className="receipt delivered" title="entregado">
        ✓✓
      </span>
    );
  return (
    <span className="receipt sent" title="enviado">
      ✓
    </span>
  );
}

function ReactionBar({ reactions, onReact, msgId }) {
  const [open, setOpen] = useState(false);
  const grouped = reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="reaction-bar">
      {Object.entries(grouped).map(([emoji, count]) => (
        <span
          key={emoji}
          className="reaction-pill"
          onClick={() => onReact(msgId, emoji)}
        >
          {emoji} {count > 1 ? count : ""}
        </span>
      ))}
      <span className="reaction-add" onClick={() => setOpen((v) => !v)}>
        ＋
      </span>
      {open && (
        <div className="emoji-picker">
          {EMOJI_LIST.map((e) => (
            <span
              key={e}
              onClick={() => {
                onReact(msgId, e);
                setOpen(false);
              }}
            >
              {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SelfDestructTimer({ ttl, createdAt, onExpire }) {
  const [remaining, setRemaining] = useState(ttl);

  useEffect(() => {
    if (!ttl) return;
    const elapsed = Math.floor((Date.now() - createdAt) / 1000);
    const left = Math.max(0, ttl - elapsed);
    setRemaining(left);
    if (left === 0) {
      onExpire();
      return;
    }
    const iv = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(iv);
          onExpire();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [ttl, createdAt, onExpire]);

  if (!ttl) return null;
  return (
    <span className="ttl-badge" title="se autodestruye">
      💣 {remaining}s
    </span>
  );
}

function FilePreview({ msg }) {
  if (msg.contentType === "image") {
    return (
      <img
        src={`data:image/jpeg;base64,${msg.fileData || msg.content}`}
        alt={msg.filename || "imagen"}
        className="msg-image"
      />
    );
  }
  if (msg.contentType === "file") {
    return (
      <a
        className="msg-file"
        href={`data:application/octet-stream;base64,${msg.fileData || msg.content}`}
        download={msg.filename || "archivo"}
      >
        📎 {msg.filename || "archivo"}
      </a>
    );
  }
  return <div className="msg-text">{msg.content}</div>;
}

function Message({ msg, onReact, onExpire, onVisible }) {
  const ref = useRef(null);

  // Intersection observer → fire read receipt once message is visible
  useEffect(() => {
    if (!onVisible || msg.sender === "tú") return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(msg);
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    if (el) obs.observe(el);
    return () => obs.disconnect();
  }, [msg, onVisible]);

  if (msg.type === "system") {
    return <div className="msg system">{msg.content}</div>;
  }

  const isPrivate = !!msg.target;
  const extraClass = [msg.mode, isPrivate ? "private" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={`msg ${extraClass}`}>
      <div className="msg-header">
        <span className="msg-sender">{msg.sender}</span>
        <span className={`msg-badge ${msg.mode}`}>
          {msg.mode === "CIFRADO" ? "cifrado" : "plano"}
        </span>
        {msg.verified === true && (
          <span className="sig-badge verified" title="firma válida">
            ✔ firmado
          </span>
        )}
        {msg.verified === false && (
          <span className="sig-badge invalid" title="firma inválida">
            ✘ firma inv.
          </span>
        )}
        {isPrivate && <span className="private-badge">privado</span>}
        {msg._connLabel && <span className="msg-conn">{msg._connLabel}</span>}
        {msg.sender === "tú" && <ReceiptIcon status={msg.receiptStatus} />}
        <SelfDestructTimer
          ttl={msg.ttl}
          createdAt={msg._createdAt || Date.now()}
          onExpire={() => onExpire(msg.id)}
        />
      </div>

      {msg.contentType ? (
        <FilePreview msg={msg} />
      ) : (
        <div className="msg-text">{msg.content}</div>
      )}

      {msg.raw && <div className="msg-raw">en red: {msg.raw}</div>}

      <ReactionBar
        reactions={msg.reactions || []}
        onReact={onReact}
        msgId={msg.id}
      />
    </div>
  );
}

export default function ChatBox({ messages, onReact, onExpire, onVisible }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="chat-box">
      {messages.length === 0 && <div className="chat-empty">canal listo</div>}
      {messages.map((msg) => (
        <Message
          key={msg.id}
          msg={msg}
          onReact={onReact}
          onExpire={onExpire}
          onVisible={onVisible}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
