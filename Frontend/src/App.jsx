import { useState, useEffect, useRef, useCallback } from "react";
import LoginForm from "./components/LoginForm.jsx";
import ControlPanel from "./components/ControlPanel.jsx";
import ConnectionPanel from "./components/ConnectionPanel.jsx";
import ChatBox from "./components/ChatBox.jsx";
import MessageInput from "./components/MessageInput.jsx";
import AuditPanel from "./components/AuditPanel.jsx";
import UsersPanel from "./components/UserPersonal.jsx";
import { useMultiConnection } from "./hooks/useMultiConnection.js";
import {
  encryptMessage,
  decryptMessage,
  generateFernetKey,
  generateECDHKeyPair,
  deriveSharedFernetKey,
  generateECDSAKeyPair,
  signMessage,
  verifyMessage,
} from "./utils/crypto.js";

// ── session history helpers ───────────────────
const SESSION_KEY = "cryptochat_history";
function loadHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHistory(msgs) {
  // Don't persist file data (too large)
  const slim = msgs.map((m) => ({ ...m, fileData: undefined }));
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(slim));
  } catch {
    /* quota */
  }
}

let msgIdCounter = 0;
function newId() {
  return `msg-${Date.now()}-${++msgIdCounter}`;
}
function nowTime() {
  return new Date().toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function App() {
  const [joined, setJoined] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [currentRoom, setCurrentRoom] = useState("general");
  const [cipherKey, setCipherKey] = useState("");
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState([]); // list of usernames typing
  const [auditLog, setAuditLog] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [ecdhStatus, setEcdhStatus] = useState("idle"); // idle | pending | derived
  const [username, setUsername] = useState("");

  const keyRef = useRef("");
  const ecdhRef = useRef(null); // { keyPair, publicKeyB64 }
  const ecdsaRef = useRef(null); // { keyPair, publicKeyB64 }
  const peerKeysRef = useRef({}); // username → { ecdhPublic, ecdsaPublic }
  const typingTimer = useRef(null);

  const {
    connections,
    anyConnected,
    addConnection,
    removeConnection,
    sendToAll,
    sendTyping,
    sendReadReceipt,
    sendReaction,
    addListener,
  } = useMultiConnection();

  // ── audit log helper ──────────────────────
  const audit = useCallback((dir, data, size) => {
    setAuditLog((prev) => [
      ...prev.slice(-199),
      {
        time: nowTime(),
        dir,
        type: data.type,
        sender: data.sender || null,
        encrypted: !!data.encrypted,
        size: size || JSON.stringify(data).length,
        raw: JSON.stringify(data).slice(0, 80),
      },
    ]);
  }, []);

  // ── join ──────────────────────────────────
  const handleJoin = async (uname, url, room) => {
    setUsername(uname);
    setServerUrl(url);
    setCurrentRoom(room);

    // Generate ECDH + ECDSA key pairs for this session
    const ecdh = await generateECDHKeyPair();
    const ecdsa = await generateECDSAKeyPair();
    ecdhRef.current = ecdh;
    ecdsaRef.current = ecdsa;

    // Load session history for this room
    setMessages(loadHistory());

    addConnection(url, uname, room);
    setJoined(true);
    setEcdhStatus("pending");
    history.pushState({ view: "chat" }, "");
  };

  // ── send public keys once connected ───────
  useEffect(() => {
    if (!anyConnected || !ecdhRef.current || !ecdsaRef.current) return;
    const payload = {
      type: "public-keys",
      ecdhPublic: ecdhRef.current.publicKeyB64,
      ecdsaPublic: ecdsaRef.current.publicKeyB64,
    };
    sendToAll(payload);
    audit("out", payload, JSON.stringify(payload).length);

    // Request user list
    sendToAll({ type: "users" });
  }, [anyConnected]);

  // ── message listener ──────────────────────
  useEffect(() => {
    const handler = async (data) => {
      const label = data._connUrl
        ? `${data._connUser}@${new URL(data._connUrl).host}`
        : "";
      audit("in", data);

      // ── system / error ──
      if (data.type === "system" || data.type === "error") {
        const msg = {
          id: newId(),
          type: "system",
          content: label ? `[${label}] ${data.content}` : data.content,
        };
        setMessages((prev) => {
          const next = [...prev, msg];
          saveHistory(next);
          return next;
        });
        return;
      }

      // ── users list ──
      if (data.type === "users") {
        setOnlineUsers(data.users || []);
        return;
      }

      // ── typing ──
      if (data.type === "typing") {
        setTyping((prev) =>
          prev.includes(data.sender) ? prev : [...prev, data.sender],
        );
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(
          () => setTyping((prev) => prev.filter((u) => u !== data.sender)),
          2500,
        );
        return;
      }

      // ── delivery / read receipts ──
      if (data.type === "receipt") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.msg_id
              ? {
                  ...m,
                  receiptStatus: data.status === "read" ? "read" : "delivered",
                }
              : m,
          ),
        );
        return;
      }

      // ── reactions ──
      if (data.type === "reaction") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.msg_id
              ? {
                  ...m,
                  reactions: [
                    ...(m.reactions || []),
                    { sender: data.sender, emoji: data.emoji },
                  ],
                }
              : m,
          ),
        );
        return;
      }

      // ── public-keys (ECDH handshake) ──
      if (data.type === "public-keys") {
        peerKeysRef.current[data.sender] = {
          ecdhPublic: data.ecdhPublic,
          ecdsaPublic: data.ecdsaPublic,
        };
        if (data.ecdhPublic && ecdhRef.current) {
          try {
            const derived = await deriveSharedFernetKey(
              ecdhRef.current.keyPair,
              data.ecdhPublic,
            );
            setCipherKey(derived);
            keyRef.current = derived;
            setEcdhStatus("derived");
            const note = {
              id: newId(),
              type: "system",
              content: `🔑 clave ECDH derivada con ${data.sender} (Forward Secrecy activo)`,
            };
            setMessages((prev) => {
              const next = [...prev, note];
              saveHistory(next);
              return next;
            });
          } catch (e) {
            console.error("ECDH derive failed", e);
          }
        }
        return;
      }

      // ── chat message ──
      if (data.type === "message") {
        let displayContent = data.content;
        let mode = data.mode;
        let verified = undefined;

        if (data.encrypted && keyRef.current) {
          const dec = await decryptMessage(data.content, keyRef.current);
          displayContent = dec || "[sin clave para descifrar]";
          if (!dec) mode = "PLANO";

          // Verify ECDSA signature if we have the sender's public key
          if (
            dec &&
            data.sig &&
            peerKeysRef.current[data.sender]?.ecdsaPublic
          ) {
            verified = await verifyMessage(
              dec,
              data.sig,
              peerKeysRef.current[data.sender].ecdsaPublic,
            );
          }
        }

        const msg = {
          id: data.msg_id || newId(),
          sender: data.sender,
          content: displayContent,
          mode,
          verified,
          raw: data.content.substring(0, 60),
          type: "message",
          target: data.target || null,
          ttl: data.ttl || 0,
          contentType: data.contentType || null,
          filename: data.filename || null,
          reactions: [],
          receiptStatus: null,
          _connLabel: label,
          _createdAt: Date.now(),
        };

        setMessages((prev) => {
          const next = [...prev, msg];
          saveHistory(next);
          return next;
        });

        // Send read receipt (handled by IntersectionObserver in ChatBox via onVisible)
        return;
      }
    };

    return addListener(handler);
  }, [addListener, audit]);

  // ── send message ──────────────────────────
  const handleSend = useCallback(
    (text, encrypted, opts = {}) => {
      (async () => {
        let content = text;
        let mode = "PLANO";
        let sig = undefined;
        const msgId = newId();

        if (encrypted) {
          if (!keyRef.current) {
            const sysMsg = {
              id: newId(),
              type: "system",
              content: "genera o intercambia una clave antes de cifrar",
            };
            setMessages((prev) => [...prev, sysMsg]);
            return;
          }
          const enc = await encryptMessage(text, keyRef.current);
          if (!enc) return;
          content = enc;
          mode = "CIFRADO";

          // Sign the plaintext
          if (ecdsaRef.current) {
            sig = await signMessage(text, ecdsaRef.current.keyPair.privateKey);
          }
        }

        const payload = {
          type: "message",
          content,
          mode,
          encrypted,
          msg_id: msgId,
          sig,
          target: opts.target || undefined,
          ttl: opts.ttl || undefined,
          contentType: opts.contentType || undefined,
          filename: opts.filename || undefined,
        };

        sendToAll(payload);
        audit("out", payload);

        // Optimistic own message
        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: msgId,
              sender: "tú",
              content: text,
              mode,
              raw: content.substring(0, 60),
              type: "message",
              target: opts.target || null,
              ttl: opts.ttl || 0,
              contentType: opts.contentType || null,
              filename: opts.filename || null,
              reactions: [],
              receiptStatus: "sent",
              _createdAt: Date.now(),
            },
          ];
          saveHistory(next);
          return next;
        });
      })();
    },
    [sendToAll, audit],
  );

  // ── expire message ────────────────────────
  const handleExpire = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // ── read receipt via IntersectionObserver ─
  const handleVisible = useCallback(
    (msg) => {
      if (msg.sender !== "tú" && msg.id) {
        sendReadReceipt(msg.id, msg.sender);
      }
    },
    [sendReadReceipt],
  );

  // ── reaction ──────────────────────────────
  const handleReact = useCallback(
    (msgId, emoji) => {
      sendReaction(msgId, emoji);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                reactions: [
                  ...(m.reactions || []),
                  { sender: username, emoji },
                ],
              }
            : m,
        ),
      );
    },
    [sendReaction, username],
  );

  // ── typing indicator ──────────────────────
  const handleTyping = useCallback(() => {
    sendTyping();
  }, [sendTyping]);

  // ── browser back ──────────────────────────
  useEffect(() => {
    const onPop = () => {
      if (joined) {
        setJoined(false);
        setMessages([]);
        setCipherKey("");
        keyRef.current = "";
        ecdhRef.current = null;
        ecdsaRef.current = null;
        peerKeysRef.current = {};
        setEcdhStatus("idle");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [joined]);

  const handleBack = () => {
    setJoined(false);
    setMessages([]);
    setCipherKey("");
    keyRef.current = "";
    setEcdhStatus("idle");
    history.back();
  };

  // ── render ────────────────────────────────
  if (!joined) return <LoginForm onJoin={handleJoin} />;

  const connectedUserNames = onlineUsers.length ? onlineUsers : [username];

  return (
    <div className="chat-container">
      {/* TOP BAR */}
      <div className="topbar">
        <button className="btn btn-ghost topbar-back" onClick={handleBack}>
          ← salir
        </button>
        <div className="topbar-divider" />
        <span className="topbar-logo">cryptochat</span>
        <span className="topbar-room">#{currentRoom}</span>
        <div className="topbar-divider" />
        <span
          className={`topbar-status ${anyConnected ? "online" : "offline"}`}
        >
          {anyConnected ? "conectado" : "desconectado"}
        </span>
        {serverUrl && (
          <>
            <div className="topbar-divider" />
            <span className="topbar-status">
              {serverUrl.replace(/^ws:\/\//, "")}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button
            className={`btn btn-ghost ${showAudit ? "active" : ""}`}
            style={{ height: 26, fontSize: 11, padding: "0 10px" }}
            onClick={() => setShowAudit((v) => !v)}
          >
            auditoría {auditLog.length > 0 && `(${auditLog.length})`}
          </button>
        </div>
      </div>

      <ControlPanel
        onKeyChange={(key) => {
          setCipherKey(key);
          keyRef.current = key;
        }}
        ecdhStatus={ecdhStatus}
        connected={anyConnected}
      />

      <ConnectionPanel
        connections={connections}
        onAdd={(url, user) => addConnection(url, user, currentRoom)}
        onRemove={(id) => removeConnection(id)}
      />

      {/* MAIN AREA */}
      <div className="main-area">
        {/* Users sidebar */}
        <UsersPanel users={connectedUserNames} room={currentRoom} />

        {/* Chat */}
        <div className="chat-col">
          <ChatBox
            messages={messages}
            onReact={handleReact}
            onExpire={handleExpire}
            onVisible={handleVisible}
          />

          {/* Typing indicator */}
          {typing.length > 0 && (
            <div className="typing-bar">
              {typing.join(", ")} {typing.length === 1 ? "está" : "están"}{" "}
              escribiendo
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}

          <MessageInput
            onSend={handleSend}
            onTyping={handleTyping}
            disabled={!anyConnected}
            connectedUsers={connectedUserNames.filter((u) => u !== username)}
          />
        </div>

        {/* Audit panel */}
        {showAudit && <AuditPanel entries={auditLog} />}
      </div>
    </div>
  );
}
