import 'dotenv/config';
import { createApp } from './app.js';
import { getDb, closeDb } from './config/database.js';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { addClientToSession, removeClientFromSession, wsAuth } from './routes/groupSession.routes.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'journeytogether-secret';

// Initialize database connection
getDb();

const app = createApp();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[JourneyTogether API] Listening on http://0.0.0.0:${PORT}`);
  console.log(`[JourneyTogether API] Health check: http://0.0.0.0:${PORT}/health`);
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);

  if (url.pathname.startsWith('/ws/sessions/')) {
    const sessionId = url.pathname.replace('/ws/sessions/', '');
    const token = url.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const userId = wsAuth(token);
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, { sessionId, userId });
    });
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

interface SessionClient {
  ws: WebSocket;
  sessionId: string;
  userId: string;
}

wss.on('connection', (ws: WebSocket, _request: import('http').IncomingMessage, { sessionId, userId }: { sessionId: string; userId: string }) => {
  console.log(`[WS] Client connected: user=${userId} session=${sessionId}`);

  const client = {
    send: (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    userId,
  };

  addClientToSession(sessionId, client);

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: user=${userId} session=${sessionId}`);
    removeClientFromSession(sessionId, userId);
  });

  ws.on('error', () => {
    removeClientFromSession(sessionId, userId);
  });

  // Send initial ack
  ws.send(JSON.stringify({ type: 'connected', payload: { sessionId } }));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  wss.close();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  wss.close();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});
