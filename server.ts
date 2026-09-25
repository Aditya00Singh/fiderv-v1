import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = express();
app.use(express.json());

// Public STUN server configuration for NAT traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

app.get('/api/ice-servers', (_req, res) => {
  res.json({ iceServers: ICE_SERVERS });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// Room state management in server memory
interface PeerSocket extends WebSocket {
  roomId?: string;
  peerId?: string;
  isAlive?: boolean;
}

const rooms = new Map<string, Set<PeerSocket>>();

// HTTP fallback message queues: roomId -> Map(peerId -> QueuedMessage[])
interface QueuedSignalMessage {
  type: string;
  fromPeerId?: string;
  payload?: any;
  initiator?: boolean;
  peerId?: string;
  timestamp: number;
}
const httpRoomPeers = new Map<string, Set<string>>(); // roomId -> Set of peerIds
const httpMessageQueues = new Map<string, Map<string, QueuedSignalMessage[]>>(); // roomId -> (peerId -> messages)

function generateRoomCode(): string {
  let code = '';
  let attempts = 0;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    attempts++;
  } while (
    (rooms.has(code) && (rooms.get(code)?.size || 0) >= 2 ||
     httpRoomPeers.has(code) && (httpRoomPeers.get(code)?.size || 0) >= 2) &&
    attempts < 100
  );
  return code;
}

function queueHttpMessage(roomId: string, recipientPeerId: string, msg: QueuedSignalMessage) {
  let roomQueue = httpMessageQueues.get(roomId);
  if (!roomQueue) {
    roomQueue = new Map();
    httpMessageQueues.set(roomId, roomQueue);
  }
  let peerQueue = roomQueue.get(recipientPeerId);
  if (!peerQueue) {
    peerQueue = [];
    roomQueue.set(recipientPeerId, peerQueue);
  }
  peerQueue.push(msg);
}

// HTTP Signaling API Endpoints (100% resilient across iframe auth proxies)
app.post('/api/signaling/create', (req, res) => {
  const { requestedCode, peerId } = req.body || {};
  const code = (requestedCode && /^\d{6}$/.test(String(requestedCode)))
    ? String(requestedCode)
    : generateRoomCode();
  const assignedPeerId = peerId || Math.random().toString(36).substring(2, 9);

  let peerSet = httpRoomPeers.get(code);
  if (!peerSet) {
    peerSet = new Set();
    httpRoomPeers.set(code, peerSet);
  }
  peerSet.add(assignedPeerId);

  res.json({
    type: 'room_created',
    roomId: code,
    peerId: assignedPeerId,
    peersCount: peerSet.size
  });
});

app.post('/api/signaling/join', (req, res) => {
  const { roomId, peerId } = req.body || {};
  const code = String(roomId || '').trim();
  const assignedPeerId = peerId || Math.random().toString(36).substring(2, 9);

  let peerSet = httpRoomPeers.get(code);
  if (!peerSet) {
    peerSet = new Set();
    httpRoomPeers.set(code, peerSet);
  }

  // Notify existing peers that a new peer joined
  peerSet.forEach((existingPeerId) => {
    if (existingPeerId !== assignedPeerId) {
      queueHttpMessage(code, existingPeerId, {
        type: 'peer_joined',
        peerId: assignedPeerId,
        initiator: true,
        payload: { initiator: true, peerId: assignedPeerId },
        timestamp: Date.now()
      });
      // Notify the joiner about the existing peer
      queueHttpMessage(code, assignedPeerId, {
        type: 'peer_joined',
        peerId: existingPeerId,
        initiator: false,
        payload: { initiator: false, peerId: existingPeerId },
        timestamp: Date.now()
      });
    }
  });

  peerSet.add(assignedPeerId);

  res.json({
    type: 'room_joined',
    roomId: code,
    peerId: assignedPeerId,
    peersCount: peerSet.size
  });
});

app.post('/api/signaling/signal', (req, res) => {
  const { roomId, fromPeerId, payload } = req.body || {};
  if (!roomId || !fromPeerId) {
    res.status(400).json({ error: 'Missing roomId or fromPeerId' });
    return;
  }

  const peerSet = httpRoomPeers.get(roomId);
  if (peerSet) {
    peerSet.forEach((targetPeerId) => {
      if (targetPeerId !== fromPeerId) {
        queueHttpMessage(roomId, targetPeerId, {
          type: 'signal',
          fromPeerId,
          payload,
          timestamp: Date.now()
        });
      }
    });
  }

  // Also broadcast to any WebSocket clients in the room
  const wsPeerSet = rooms.get(roomId);
  if (wsPeerSet) {
    wsPeerSet.forEach((client) => {
      if (client.peerId !== fromPeerId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'signal',
          fromPeerId,
          payload
        }));
      }
    });
  }

  res.json({ success: true });
});

app.get('/api/signaling/poll', (req, res) => {
  const roomId = String(req.query.roomId || '');
  const peerId = String(req.query.peerId || '');

  if (!roomId || !peerId) {
    res.json({ messages: [] });
    return;
  }

  const roomQueue = httpMessageQueues.get(roomId);
  if (!roomQueue) {
    res.json({ messages: [] });
    return;
  }

  const peerQueue = roomQueue.get(peerId) || [];
  // Flush queue
  roomQueue.set(peerId, []);

  res.json({ messages: peerQueue });
});

app.post('/api/signaling/leave', (req, res) => {
  const { roomId, peerId } = req.body || {};
  if (roomId && peerId) {
    const peerSet = httpRoomPeers.get(roomId);
    if (peerSet) {
      peerSet.delete(peerId);
      peerSet.forEach((otherId) => {
        queueHttpMessage(roomId, otherId, {
          type: 'peer_left',
          peerId,
          timestamp: Date.now()
        });
      });
      if (peerSet.size === 0) {
        httpRoomPeers.delete(roomId);
        httpMessageQueues.delete(roomId);
      }
    }
  }
  res.json({ success: true });
});

app.get('/api/room/:code', (req, res) => {
  const code = req.params.code;
  const room = rooms.get(code);
  if (!room) {
    res.json({ exists: false, peers: 0 });
    return;
  }
  res.json({ exists: true, peers: room.size, full: room.size >= 2 });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Heartbeat interval to drop dead connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const peer = ws as PeerSocket;
    if (peer.isAlive === false) {
      peer.terminate();
      return;
    }
    peer.isAlive = false;
    peer.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('connection', (ws: PeerSocket) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const { type, roomId, peerId, payload } = msg;

      switch (type) {
        case 'create_room': {
          const requestedCode = (payload && payload.code) ? String(payload.code).trim() : '';
          const code = (requestedCode && /^\d{6}$/.test(requestedCode)) ? requestedCode : generateRoomCode();
          
          let peerSet = rooms.get(code);
          if (!peerSet) {
            peerSet = new Set<PeerSocket>();
            rooms.set(code, peerSet);
          }
          
          ws.roomId = code;
          ws.peerId = peerId || Math.random().toString(36).substring(2, 9);
          peerSet.add(ws);

          ws.send(JSON.stringify({
            type: 'room_created',
            roomId: code,
            peerId: ws.peerId,
            peersCount: peerSet.size
          }));
          break;
        }

        case 'join_room': {
          const code = String(roomId || '').trim();
          let peerSet = rooms.get(code);

          if (!peerSet) {
            // Auto-create room if it doesn't exist yet, enabling symmetrical 6-digit linking
            peerSet = new Set<PeerSocket>();
            rooms.set(code, peerSet);
          }

          if (peerSet.size >= 8) { // Allow up to multiple peers, but typically 2
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Room is full'
            }));
            return;
          }

          ws.roomId = code;
          ws.peerId = peerId || Math.random().toString(36).substring(2, 9);
          peerSet.add(ws);

          ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: code,
            peerId: ws.peerId,
            peersCount: peerSet.size
          }));

          // Notify existing peers in room that a new peer joined
          peerSet.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              // Existing peer acts as initiator
              client.send(JSON.stringify({
                type: 'peer_joined',
                peerId: ws.peerId,
                initiator: true,
                payload: { initiator: true, peerId: ws.peerId }
              }));
              // Joining peer acts as responder
              ws.send(JSON.stringify({
                type: 'peer_joined',
                peerId: client.peerId,
                initiator: false,
                payload: { initiator: false, peerId: client.peerId }
              }));
            }
          });
          break;
        }

        case 'signal': {
          // Relay WebRTC signal (SDP offer/answer, ICE candidates) to other peer(s)
          const targetRoomId = ws.roomId || roomId;
          if (!targetRoomId) return;

          const peerSet = rooms.get(targetRoomId);
          if (!peerSet) return;

          peerSet.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'signal',
                fromPeerId: ws.peerId,
                payload
              }));
            }
          });
          break;
        }

        case 'leave_room': {
          cleanupPeer(ws);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    cleanupPeer(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket client error:', err);
    cleanupPeer(ws);
  });
});

function cleanupPeer(ws: PeerSocket) {
  if (!ws.roomId) return;
  const peerSet = rooms.get(ws.roomId);
  if (peerSet) {
    peerSet.delete(ws);
    // Notify remaining peers
    peerSet.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'peer_left',
          peerId: ws.peerId
        }));
      }
    });

    if (peerSet.size === 0) {
      rooms.delete(ws.roomId);
    }
  }
  ws.roomId = undefined;
}

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
