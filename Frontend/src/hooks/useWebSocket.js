import { useEffect, useRef, useCallback, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

export function useWebSocket(username) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const listenersRef = useRef([]);

  const addListener = useCallback((fn) => {
    listenersRef.current.push(fn);
    return () => {
      listenersRef.current = listenersRef.current.filter((l) => l !== fn);
    };
  }, []);

  const notifyListeners = useCallback((data) => {
    listenersRef.current.forEach((fn) => fn(data));
  }, []);

  const sendMessage = useCallback((content, mode, encrypted) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content,
          mode,
          encrypted,
        }),
      );
    }
  }, []);

  useEffect(() => {
    if (!username) return;

    const ws = new WebSocket(`${WS_URL}/ws/${username}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        notifyListeners(data);
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [username, notifyListeners]);

  return { connected, sendMessage, addListener, wsRef };
}
