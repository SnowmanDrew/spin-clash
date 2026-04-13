import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 8787)
const rooms = new Map()
const clients = new Map()
const STATS_PATH = join(process.cwd(), 'server', 'online-stats.json')

function createEmptyRecord() {
  return {
    cpu: { wins: 0, losses: 0 },
    player: { wins: 0, losses: 0 },
  }
}

function normalizeRecord(record) {
  const source = record || {}
  const cpu = source.cpu || {}
  const player = source.player || {}
  return {
    cpu: {
      wins: Math.max(0, Number(cpu.wins) || 0),
      losses: Math.max(0, Number(cpu.losses) || 0),
    },
    player: {
      wins: Math.max(0, Number(player.wins) || 0),
      losses: Math.max(0, Number(player.losses) || 0),
    },
  }
}

function createEmptyLoadout() {
  return {
    layer: 'attack',
    disc: 'assault',
    driver: 'rush',
  }
}

function normalizeLoadout(loadout, fallbackBuild = 'attack') {
  const source = loadout || {}
  return {
    layer: String(source.layer || fallbackBuild || 'attack'),
    disc: String(source.disc || 'assault'),
    driver: String(source.driver || 'rush'),
  }
}

function createEmptyOnlineStats() {
  return {
    version: 1,
    updatedAt: null,
    totals: {
      matchesCompleted: 0,
      matchesCancelled: 0,
      ringOutFinishes: 0,
      spinOutFinishes: 0,
    },
    builds: {},
    players: {},
    recentMatches: [],
  }
}

function normalizeStatCounter(value) {
  return Math.max(0, Number(value) || 0)
}

function createEmptyBuildStats() {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
  }
}

function createEmptyPlayerStats(name = 'Unknown') {
  return {
    name,
    matches: 0,
    wins: 0,
    losses: 0,
    lastSeenAt: null,
    builds: {},
  }
}

function normalizeOnlineStats(stats) {
  const source = stats || {}
  const normalized = createEmptyOnlineStats()
  normalized.updatedAt = typeof source.updatedAt === 'string' ? source.updatedAt : null
  normalized.totals.matchesCompleted = normalizeStatCounter(source.totals?.matchesCompleted)
  normalized.totals.matchesCancelled = normalizeStatCounter(source.totals?.matchesCancelled)
  normalized.totals.ringOutFinishes = normalizeStatCounter(source.totals?.ringOutFinishes)
  normalized.totals.spinOutFinishes = normalizeStatCounter(source.totals?.spinOutFinishes)

  for (const [buildKey, buildStats] of Object.entries(source.builds || {})) {
    normalized.builds[buildKey] = {
      matches: normalizeStatCounter(buildStats?.matches),
      wins: normalizeStatCounter(buildStats?.wins),
      losses: normalizeStatCounter(buildStats?.losses),
    }
  }

  for (const [playerId, playerStats] of Object.entries(source.players || {})) {
    const normalizedPlayer = createEmptyPlayerStats(playerStats?.name || playerId)
    normalizedPlayer.matches = normalizeStatCounter(playerStats?.matches)
    normalizedPlayer.wins = normalizeStatCounter(playerStats?.wins)
    normalizedPlayer.losses = normalizeStatCounter(playerStats?.losses)
    normalizedPlayer.lastSeenAt = typeof playerStats?.lastSeenAt === 'string' ? playerStats.lastSeenAt : null
    for (const [buildKey, buildStats] of Object.entries(playerStats?.builds || {})) {
      normalizedPlayer.builds[buildKey] = {
        matches: normalizeStatCounter(buildStats?.matches),
        wins: normalizeStatCounter(buildStats?.wins),
        losses: normalizeStatCounter(buildStats?.losses),
      }
    }
    normalized.players[playerId] = normalizedPlayer
  }

  normalized.recentMatches = Array.isArray(source.recentMatches)
    ? source.recentMatches.slice(0, 25)
    : []

  return normalized
}

function loadOnlineStats() {
  if (!existsSync(STATS_PATH)) return createEmptyOnlineStats()
  try {
    return normalizeOnlineStats(JSON.parse(readFileSync(STATS_PATH, 'utf8')))
  } catch {
    return createEmptyOnlineStats()
  }
}

function saveOnlineStats(stats) {
  const normalized = normalizeOnlineStats(stats)
  normalized.updatedAt = new Date().toISOString()
  writeFileSync(STATS_PATH, JSON.stringify(normalized, null, 2))
  return normalized
}

function ensureBuildStats(target, buildKey) {
  target[buildKey] ||= createEmptyBuildStats()
  return target[buildKey]
}

function ensurePlayerStats(target, playerId, name) {
  target[playerId] ||= createEmptyPlayerStats(name)
  if (name) target[playerId].name = name
  return target[playerId]
}

function normalizeFinishType(value) {
  return value === 'Ring Out' ? 'ringOut' : 'spinOut'
}

function recordCompletedOnlineMatch(summary) {
  if (!summary?.winnerId || !Array.isArray(summary.participants)) return
  const stats = loadOnlineStats()
  const winnerId = summary.winnerId
  const finishKey = normalizeFinishType(summary.finishType)
  stats.totals.matchesCompleted += 1
  stats.totals[finishKey === 'ringOut' ? 'ringOutFinishes' : 'spinOutFinishes'] += 1

  for (const participant of summary.participants) {
    const playerStats = ensurePlayerStats(stats.players, participant.id, participant.name)
    playerStats.matches += 1
    playerStats.lastSeenAt = summary.completedAt || new Date().toISOString()
    const playerBuildStats = ensureBuildStats(playerStats.builds, participant.build)
    playerBuildStats.matches += 1

    const buildStats = ensureBuildStats(stats.builds, participant.build)
    buildStats.matches += 1

    if (participant.id === winnerId) {
      playerStats.wins += 1
      playerBuildStats.wins += 1
      buildStats.wins += 1
    } else {
      playerStats.losses += 1
      playerBuildStats.losses += 1
      buildStats.losses += 1
    }
  }

  stats.recentMatches.unshift({
    completedAt: summary.completedAt || new Date().toISOString(),
    outcome: summary.outcome || 'Match finished.',
    finishType: summary.finishType || 'Spin Out',
    winnerId,
    participants: summary.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      build: participant.build,
      score: normalizeStatCounter(participant.score),
    })),
  })
  stats.recentMatches = stats.recentMatches.slice(0, 25)

  saveOnlineStats(stats)
}

function recordCancelledOnlineMatch() {
  const stats = loadOnlineStats()
  stats.totals.matchesCancelled += 1
  saveOnlineStats(stats)
}

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
      loadout: player.loadout,
      record: player.record,
      ready: player.ready,
      pendingJoin: Boolean(player.pendingJoin),
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
    loadout: client.loadout,
    record: client.record,
    ready: false,
    pendingJoin: room.matchActive,
    connected: true,
    socket,
  })
  room.statusText = room.matchActive
    ? `${client.name} will join next round.`
    : `${client.name} joined the room.`
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
  client.loadout = normalizeLoadout(message.loadout || client.loadout, client.build)
  client.record = normalizeRecord(message.record || client.record)
  const roomPlayer = room.players.get(client.id)
  if (roomPlayer) {
    roomPlayer.name = client.name
    roomPlayer.build = client.build
    roomPlayer.loadout = client.loadout
    roomPlayer.record = client.record
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

  players.forEach((player) => {
    player.pendingJoin = false
  })
  room.matchActive = true
  room.statusText = 'Session starting.'
  const participants = players.map((player) => ({
    id: player.id,
    name: player.name,
    build: player.build,
    loadout: player.loadout,
    record: player.record,
  }))
  for (const player of players) {
    send(player.socket, 'match_started', {
      roomId: room.id,
      hostId: room.hostId,
      participants,
      scoreToWin: null,
    })
  }
  broadcastRoomState(room)
}

function admitPendingPlayers(socket) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room || room.hostId !== client.id || !room.matchActive) return

  const pendingPlayers = [...room.players.values()].filter((player) => player.pendingJoin)
  if (!pendingPlayers.length) return

  for (const player of pendingPlayers) {
    player.pendingJoin = false
    send(player.socket, 'match_started', {
      roomId: room.id,
      hostId: room.hostId,
      participants: [...room.players.values()]
        .filter((entry) => !entry.pendingJoin)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          build: entry.build,
          loadout: entry.loadout,
          record: entry.record,
        })),
      scoreToWin: null,
    })
  }

  room.statusText = pendingPlayers.length === 1
    ? `${pendingPlayers[0].name} joins next round.`
    : `${pendingPlayers.length} players join next round.`
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

function relayLaunchCommit(socket, message) {
  const client = clients.get(socket)
  const room = requireRoom(socket)
  if (!client || !room || !room.matchActive) return
  const host = room.players.get(room.hostId)
  if (!host || host.id === client.id) return
  send(host.socket, 'launch_commit', {
    playerId: client.id,
    launch: message.launch || {},
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
  room.statusText = message.statusText || 'Session finished.'
  if (message.summary?.winnerId) recordCompletedOnlineMatch(message.summary)
  else recordCancelledOnlineMatch()
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
  if (req.url === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(loadOnlineStats(), null, 2))
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
    loadout: createEmptyLoadout(),
    record: createEmptyRecord(),
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
        client.loadout = normalizeLoadout(message.loadout || client.loadout, client.build)
        client.record = normalizeRecord(message.record || client.record)
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
      case 'admit_pending_players':
        admitPendingPlayers(socket)
        break
      case 'input':
        relayInput(socket, message)
        break
      case 'launch_commit':
        relayLaunchCommit(socket, message)
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