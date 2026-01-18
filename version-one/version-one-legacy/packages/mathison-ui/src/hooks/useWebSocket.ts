import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSMessage } from '../types/api';

/**
 * Type-safe WebSocket hook for real-time updates
 *
 * NOTE: This connects to kernel-mac (port 3001), NOT mathison-server.
 * The WebSocket events (stream_start, intent_proposed, etc.) are
 * kernel-mac specific for the desktop chat interface.
 */

type UseWebSocketOptions = {
  url?: string;
  onMessage?: (message: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  autoConnect?: boolean;
};

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    url = `ws://${window.location.hostname}:3001`,
    onMessage,
    onConnect,
    onDisconnect,
    autoConnect = true,
  } = options;

  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      ws.current = new WebSocket(url);

      ws.current.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        onConnect?.();
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          setLastMessage(message);
          onMessage?.(message);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      ws.current.onclose = () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
        onDisconnect?.();

        // Attempt reconnect after 3 seconds
        reconnectTimeout.current = window.setTimeout(() => {
          console.log('[WS] Reconnecting...');
          connect();
        }, 3000);
      };

      ws.current.onerror = (error) => {
        console.error('[WS] Error:', error);
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
    }
  }, [url, onConnect, onDisconnect, onMessage]);

  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      window.clearTimeout(reconnectTimeout.current);
    }
    ws.current?.close();
    ws.current = null;
    setIsConnected(false);
  }, []);

  const send = useCallback((message: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send, not connected');
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    send,
  };
}
