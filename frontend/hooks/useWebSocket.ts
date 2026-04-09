import { useEffect, useRef, useCallback } from 'react';
import { apiClient } from '../api/client';
import type { WSEvent } from '../types/journey';

const WS_RECONNECT_DELAY_MS = 3000;
const WS_MAX_RETRIES = 5;

interface UseWebSocketOptions {
  sessionId: string;
  onEvent: (event: WSEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useWebSocket({
  sessionId,
  onEvent,
  onConnect,
  onDisconnect,
  onError,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const connect = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      // Get WebSocket URL from backend
      const { ws_url } = await apiClient.getGroupSessionWSUrl(sessionId);
      if (!isMountedRef.current) return;

      const ws = new WebSocket(ws_url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        retryCountRef.current = 0;
        onConnect?.();
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data) as WSEvent;
          onEvent(data);
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = (error: Event) => {
        if (!isMountedRef.current) return;
        onError?.(error);
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        onDisconnect?.();

        // Attempt reconnection
        if (retryCountRef.current < WS_MAX_RETRIES) {
          retryCountRef.current += 1;
          retryTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect();
            }
          }, WS_RECONNECT_DELAY_MS);
        }
      };
    } catch {
      // Failed to get WS URL — retry later
      if (retryCountRef.current < WS_MAX_RETRIES) {
        retryCountRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            connect();
          }
        }, WS_RECONNECT_DELAY_MS);
      }
    }
  }, [sessionId, onEvent, onConnect, onDisconnect, onError]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
