import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 8787)
const rooms = new Map()
const clients = new Map()

function makeRoomCode() {
  return randomBytes(3).toString('hex').toUpperCase()
}

function send(socket, type, payload = {}) {
  if (socket.readyState !== 1) return
  socket.send(JSON.stringify({ type, ...payload }))
}

function serialiseRoom(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    matchActive: room.matchActive,
    statusText: room.statusText,
    players: [...room.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      build: player.build,
      ready: player.ready,
      connected: player.connected,
    })),
  }
}

function broadcastRoomState(room) {
  const roomState = serialiseRoom(room)
  for (const player of room.players.values()) {
    send(player.socket, 'room_state', { room: roomState })
  }
}

function removeRoomIfEmpty(room) {
  if (room.players.size === 0) {
    rooms.delete(room.id)
  }
}

function electHost(room) {
  const nextHost = [...room.players.values()][0]
  room.hostId = nextHost ? nextHost.id : null
}

function detachClient(socket) {
  const client = clients.get(socket)
  if (!client) return

  const room = client.roomId ? rooms.get(client.roomId) : null
  if (room) {
    const removed = room.players.get(client.id)
    room.players.delete(client.id)

    if (room.hostId === client.id) {
      room.matchActive = false
      room.statusText = removed
        ? `${removed.name} left. Host changed.`
        : 'Host left. Room reset.'
      electHost(room)
    }

    broadcastRoomState(room)
    removeRoomIfEmpty(room)
  }

  clients.delete(socket)
}

function joinRoom(socket, roomId) {
  const client = clients.get(socket)
  const room = rooms.get(roomId)
  if (!client || !room) {
    send(socket, 'error_message', { message: 'Room not found.' })
    return
  }
  if (room.matchActive) {
    send(socket, 'error_message', { message: 'This room is already in a match.' })
    return
  }
  if (room.players.size >= 4) {
    send(socket, 'error_message', { message: 'This room is full.' })
    return
  }
  if (client.roomId && client.roomId !== roomId) {
    detachClient(socket)
    clients.set(socket, client)
  }

  client.roomId = roomId
  room.players.set(client.id, {
    id: client.id,
    name: client.name,
    build: client.build,
    ready: false,
    connected: true,
    socket,
  })
  room.statusText = `${client.name} joined the room.`
  broadcastRoomState(room)
}

function createRoom(socket) {
  const client = clients.get(socket)
  if (!client) return
  let roomId = makeRoomCode()
  while (rooms.has(roomId)) {
    roomId = makeRoomCode()
  }

  const room = {
    id: roomId,
    hostId: client.id,
    matchActive: false,
    statusText: 'Room created.',
    players: new Map(),
  }
  rooms.set(roomId, room)
  joinRoom(socket, roomId)
}

function requireRoom(socket) {
  const client = clients.get(socket)
  if (!client?.roomId) return null
  return rooms.get(client.roomId) || null
}

function updateProfile(socket, message) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room) return
  client.name = String(message.name || client.name).slice(0, 24) || 'Blader'
  client.build = message.build || client.build
  const roomPlayer = room.players.get(client.id)
  if (roomPlayer) {
    roomPlayer.name = client.name
    roomPlayer.build = client.build
  }
  broadcastRoomState(room)
}

function setReady(socket, message) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room) return
  const roomPlayer = room.players.get(client.id)
  if (!roomPlayer) return
  roomPlayer.ready = Boolean(message.ready)
  room.statusText = `${roomPlayer.name} is ${roomPlayer.ready ? 'ready' : 'not ready'}.`
  broadcastRoomState(room)
}

function startMatch(socket) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room) return
  if (room.hostId !== client.id) {
    send(socket, 'error_message', { message: 'Only the host can start the match.' })
    return
  }

  const players = [...room.players.values()]
  if (players.length < 2) {
    send(socket, 'error_message', { message: 'At least 2 players are required.' })
    return
  }
  if (players.some((player) => !player.ready)) {
    send(socket, 'error_message', { message: 'All players must be ready.' })
    return
  }

  room.matchActive = true
  room.statusText = 'Match starting.'
  const participants = players.map((player) => ({
    id: player.id,
    name: player.name,
    build: player.build,
  }))
  for (const player of players) {
    send(player.socket, 'match_started', {
      roomId: room.id,
      hostId: room.hostId,
      participants,
      scoreToWin: 2,
    })
  }
  broadcastRoomState(room)
}

function relayInput(socket, message) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room || !room.matchActive) return
  const host = room.players.get(room.hostId)
  if (!host || host.id === client.id) return
  send(host.socket, 'remote_input', {
    playerId: client.id,
    input: message.input || {},
    sentAt: Date.now(),
  })
}

function relaySnapshot(socket, message) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room || room.hostId !== client.id || !room.matchActive) return
  const payload = {
    snapshot: message.snapshot,
    serverTime: Date.now(),
  }
  for (const player of room.players.values()) {
    if (player.id === client.id) continue
    send(player.socket, 'match_snapshot', payload)
  }
}

function completeMatch(socket, message) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room || room.hostId !== client.id) return
  room.matchActive = false
  room.statusText = message.statusText || 'Match finished.'
  for (const player of room.players.values()) {
    player.ready = false
  }
  broadcastRoomState(room)
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }))
    return
  }
  res.writeHead(404)
  res.end('Not found')
})

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (socket) => {
  const id = randomUUID()
  const client = {
    id,
    name: `Blader-${id.slice(0, 4)}`,
    build: 'attack',
    roomId: null,
  }
  clients.set(socket, client)
  send(socket, 'welcome', { clientId: id, playerName: client.name })

  socket.on('message', (raw) => {
    let message = null
    try {
      message = JSON.parse(raw.toString())
    } catch {
      send(socket, 'error_message', { message: 'Invalid message payload.' })
      return
    }

    switch (message.type) {
      case 'set_identity': {
        client.name = String(message.name || client.name).slice(0, 24) || client.name
        client.build = message.build || client.build
        break
      }
      case 'create_room':
        createRoom(socket)
        break
      case 'join_room':
        joinRoom(socket, String(message.roomId || '').trim().toUpperCase())
        break
      case 'update_profile':
        updateProfile(socket, message)
        break
      case 'set_ready':
        setReady(socket, message)
        break
      case 'start_match':
        startMatch(socket)
        break
      case 'input':
        relayInput(socket, message)
        break
      case 'snapshot':
        relaySnapshot(socket, message)
        break
      case 'match_complete':
        completeMatch(socket, message)
        break
      case 'leave_room':
        detachClient(socket)
        clients.set(socket, client)
        client.roomId = null
        send(socket, 'left_room')
        break
      default:
        send(socket, 'error_message', { message: 'Unknown message type.' })
        break
    }
  })

  socket.on('close', () => detachClient(socket))
})

server.listen(PORT, () => {
  console.log(`Spin Clash room server listening on http://localhost:${PORT}`)
})