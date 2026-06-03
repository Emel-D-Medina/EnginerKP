/* ─────────────────────────────────────────────
   useMultiConnection.js
   Manages multiple WebSocket connections.
   Adds: typing events, read receipts, per-conn
   message ID tracking, audit log feed.
───────────────────────────────────────────── */
import { useRef, useCallback, useState } from "react";

let connIdCounter = 0;

function buildWsUrl(base, room, username) {
  const url = base.replace(/\/+$/, "");
  return `${url}/ws/${encodeURIComponent(room)}/${encodeURIComponent(username)}`;
}

export function useMultiConnection() {
  const [connections, setConnections] = useState([]);
  const connsRef = useRef({});
  const listenersRef = useRef([]);

  // ── listener registry ──────────────────────
  const addListener = useCallback((fn) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== fn);
    };
  }, []);

  const notifyListeners = useCallback((data) => {
    listenersRef.current.forEach((fn) => fn(data));
  }, []);

  // ── connect ───────────────────────────────
  const addConnection = useCallback(
    (baseUrl, username, room = "general") => {
      const id = ++connIdCounter;
      const wsUrl = buildWsUrl(baseUrl, room, username);
      const displayUrl = baseUrl.replace(/\/+$/, "");

      setConnections((prev) => [
        ...prev,
        { id, url: displayUrl, username, room, status: "connecting" },
      ]);

      const ws = new WebSocket(wsUrl);
      connsRef.current[id] = { ws, username, url: displayUrl, room };

      ws.onopen = () => {
        setConnections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "connected" } : c)),
        );
      };
      ws.onclose = () => {
        setConnections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "disconnected" } : c)),
        );
        delete connsRef.current[id];
      };
      ws.onerror = () => {
        setConnections((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: "error" } : c)),
        );
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          notifyListeners({
            ...data,
            _connId: id,
            _connUrl: displayUrl,
            _connUser: username,
          });
        } catch {
          /* ignore malformed */
        }
      };

      return id;
    },
    [notifyListeners],
  );

  // ── disconnect ────────────────────────────
  const removeConnection = useCallback((id) => {
    const entry = connsRef.current[id];
    if (entry) {
      entry.ws.close();
      delete connsRef.current[id];
    }
    setConnections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── send helpers ──────────────────────────
  const sendToAll = useCallback((payload) => {
    const raw = JSON.stringify(payload);
    Object.values(connsRef.current).forEach(({ ws }) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(raw);
    });
  }, []);

  const sendTyping = useCallback(() => {
    sendToAll({ type: "typing" });
  }, [sendToAll]);

  const sendReadReceipt = useCallback(
    (msgId, originalSender) => {
      sendToAll({ type: "read", msg_id: msgId, sender: originalSender });
    },
    [sendToAll],
  );

  const sendReaction = useCallback(
    (msgId, emoji) => {
      sendToAll({ type: "reaction", msg_id: msgId, emoji });
    },
    [sendToAll],
  );

  const anyConnected = connections.some((c) => c.status === "connected");

  return {
    connections,
    anyConnected,
    addConnection,
    removeConnection,
    sendToAll,
    sendTyping,
    sendReadReceipt,
    sendReaction,
    addListener,
  };
}
