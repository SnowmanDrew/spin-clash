import { computed, onUnmounted, ref } from 'vue'

const RECONNECT_KEY_STORAGE_KEY = 'spin-clash:reconnect-key'

function createEmptyRecord() {
  return {
    cpu: { wins: 0, losses: 0 },
    player: { wins: 0, losses: 0 },
  }
}

function createEmptyLoadout() {
  return {
    layer: 'attack',
    disc: 'assault',
    driver: 'rush',
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

function normalizeLoadout(loadout) {
  const source = loadout || {}
  return {
    layer: String(source.layer || 'attack'),
    disc: String(source.disc || 'assault'),
    driver: String(source.driver || 'rush'),
  }
}

function getDefaultSocketUrl() {
  if (import.meta.env.VITE_MULTIPLAYER_WS_URL) {
    return import.meta.env.VITE_MULTIPLAYER_WS_URL
  }

  if (typeof window === 'undefined') {
    return 'ws://localhost:8787/ws'
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.port === '5173'
    ? `${window.location.hostname}:8787`
    : window.location.host
  return `${protocol}//${host}/ws`
}

function createReconnectKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `reconnect-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

function loadReconnectKey() {
  if (typeof window === 'undefined') return createReconnectKey()
  const stored = window.localStorage.getItem(RECONNECT_KEY_STORAGE_KEY)?.trim()
  if (stored) return stored
  const nextKey = createReconnectKey()
  window.localStorage.setItem(RECONNECT_KEY_STORAGE_KEY, nextKey)
  return nextKey
}

export function useRoomConnection() {
  const socket = ref(null)
  const connectionState = ref('offline')
  const errorMessage = ref('')
  const clientId = ref('')
  const playerName = ref('')
  const playerRecord = ref(createEmptyRecord())
  const playerLoadout = ref(createEmptyLoadout())
  const room = ref(null)
  const latestSnapshot = ref(null)
  const latestMatchConfig = ref(null)
  const hostMigration = ref(null)
  const remoteInput = ref(null)
  const remoteLaunchCommit = ref(null)
  const serverTimeOffset = ref(0)
  const reconnectKey = loadReconnectKey()
  let timeSyncTimer = null

  function normalizePlayerName(name) {
    return String(name || '').trim() || 'Blader'
  }

  function send(type, payload = {}) {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return false
    socket.value.send(JSON.stringify({ type, ...payload }))
    return true
  }

  function estimateServerTime() {
    return Date.now() + serverTimeOffset.value
  }

  function stopTimeSync() {
    if (!timeSyncTimer) return
    clearInterval(timeSyncTimer)
    timeSyncTimer = null
  }

  function requestTimeSync() {
    send('time_sync', { clientSentAt: Date.now() })
  }

  function startTimeSync() {
    stopTimeSync()
    requestTimeSync()
    timeSyncTimer = setInterval(requestTimeSync, 5000)
  }

  function syncRoomUrl(roomId) {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (roomId) url.searchParams.set('room', roomId)
    else url.searchParams.delete('room')
    window.history.replaceState({}, '', url)
  }

  function attachSocket(nextSocket) {
    nextSocket.addEventListener('open', () => {
      connectionState.value = 'connected'
      errorMessage.value = ''
      startTimeSync()
    })

    nextSocket.addEventListener('close', () => {
      stopTimeSync()
      connectionState.value = 'offline'
      room.value = null
      latestSnapshot.value = null
      latestMatchConfig.value = null
      hostMigration.value = null
      remoteInput.value = null
      remoteLaunchCommit.value = null
      serverTimeOffset.value = 0
    })

    nextSocket.addEventListener('message', (event) => {
      let message = null
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }

      switch (message.type) {
        case 'welcome':
          clientId.value = message.clientId
          playerName.value = normalizePlayerName(playerName.value || message.playerName)
          send('set_identity', { name: playerName.value, build: playerLoadout.value.layer, loadout: playerLoadout.value, record: playerRecord.value, reconnectKey })
          break
        case 'identity_claimed':
          clientId.value = message.clientId || clientId.value
          break
        case 'room_state':
          room.value = message.room
          syncRoomUrl(message.room?.id || '')
          break
        case 'match_started':
          latestMatchConfig.value = {
            roomId: message.roomId,
            hostId: message.hostId,
            participants: message.participants,
            scoreToWin: message.scoreToWin,
            spectator: Boolean(message.spectator),
            phaseEndsAtServerTime: Number(message.phaseEndsAtServerTime) || null,
          }
          hostMigration.value = null
          latestSnapshot.value = null
          remoteInput.value = null
          remoteLaunchCommit.value = null
          break
        case 'host_migrated':
          latestSnapshot.value = message.snapshot
            ? {
                ...message.snapshot,
                _serverTime: Date.now(),
              }
            : latestSnapshot.value
          hostMigration.value = {
            roomId: message.roomId,
            hostId: message.hostId,
            statusText: message.statusText || '',
            snapshot: latestSnapshot.value,
            receivedAt: Date.now(),
          }
          break
        case 'match_snapshot':
          latestSnapshot.value = {
            ...message.snapshot,
            _serverTime: message.serverTime || Date.now(),
          }
          break
        case 'remote_input':
          remoteInput.value = {
            playerId: message.playerId,
            input: message.input || {},
            sentAt: message.sentAt || Date.now(),
          }
          break
        case 'launch_commit':
          remoteLaunchCommit.value = {
            playerId: message.playerId,
            launch: message.launch || {},
            sentAt: message.sentAt || Date.now(),
          }
          break
        case 'time_sync': {
          const clientSentAt = Number(message.clientSentAt) || Date.now()
          const serverTime = Number(message.serverTime) || Date.now()
          const now = Date.now()
          const roundTrip = Math.max(0, now - clientSentAt)
          const estimatedServerNow = serverTime + roundTrip * 0.5
          const nextOffset = estimatedServerNow - now
          serverTimeOffset.value = serverTimeOffset.value === 0
            ? nextOffset
            : serverTimeOffset.value * 0.75 + nextOffset * 0.25
          break
        }
        case 'left_room':
          room.value = null
          latestSnapshot.value = null
          latestMatchConfig.value = null
          hostMigration.value = null
          remoteInput.value = null
          remoteLaunchCommit.value = null
          syncRoomUrl('')
          break
        case 'error_message':
          errorMessage.value = message.message || 'Room error.'
          break
        default:
          break
      }
    })
  }

  async function ensureConnected() {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) return true
    if (socket.value && socket.value.readyState === WebSocket.CONNECTING) {
      await new Promise((resolve) => setTimeout(resolve, 120))
      return ensureConnected()
    }

    connectionState.value = 'connecting'
    errorMessage.value = ''

    await new Promise((resolve, reject) => {
      const nextSocket = new WebSocket(getDefaultSocketUrl())
      socket.value = nextSocket
      attachSocket(nextSocket)
      nextSocket.addEventListener('open', resolve, { once: true })
      nextSocket.addEventListener('error', reject, { once: true })
    }).catch(() => {
      connectionState.value = 'error'
      errorMessage.value = 'Unable to reach the multiplayer server.'
    })

    return connectionState.value === 'connected'
  }

  async function connectAndCreateRoom({ name, build, loadout = playerLoadout.value, record = playerRecord.value }) {
    playerName.value = normalizePlayerName(name)
    playerRecord.value = normalizeRecord(record)
    playerLoadout.value = normalizeLoadout(loadout)
    const ok = await ensureConnected()
    if (!ok) return false
    send('set_identity', { name: playerName.value, build, loadout: playerLoadout.value, record: playerRecord.value, reconnectKey })
    send('create_room')
    return true
  }

  async function connectAndJoinRoom({ roomId, name, build, loadout = playerLoadout.value, record = playerRecord.value }) {
    playerName.value = normalizePlayerName(name)
    playerRecord.value = normalizeRecord(record)
    playerLoadout.value = normalizeLoadout(loadout)
    const ok = await ensureConnected()
    if (!ok) return false
    send('set_identity', { name: playerName.value, build, loadout: playerLoadout.value, record: playerRecord.value, reconnectKey })
    send('join_room', { roomId: roomId.toUpperCase() })
    return true
  }

  function updateProfile({ name, build, loadout, record }) {
    playerName.value = normalizePlayerName(name || playerName.value)
    playerRecord.value = normalizeRecord(record || playerRecord.value)
    playerLoadout.value = normalizeLoadout(loadout || playerLoadout.value)
    send('update_profile', { name: playerName.value, build, loadout: playerLoadout.value, record: playerRecord.value, reconnectKey })
  }

  function setReady(ready) {
    send('set_ready', { ready })
  }

  function startMatch() {
    send('start_match')
  }

  function admitPendingPlayers() {
    send('admit_pending_players')
  }

  function leaveRoom() {
    send('leave_room')
    room.value = null
    latestSnapshot.value = null
    latestMatchConfig.value = null
    syncRoomUrl('')
  }

  function sendInput(input) {
    send('input', { input })
  }

  function sendSnapshot(snapshot) {
    send('snapshot', { snapshot })
  }

  function sendLaunchCommit(launch) {
    send('launch_commit', { launch })
  }

  function sendMatchComplete(statusText, summary = null) {
    send('match_complete', { statusText, summary })
  }

  const roomId = computed(() => room.value?.id || '')
  const isHost = computed(() => room.value?.hostId === clientId.value)
  const shareUrl = computed(() => {
    if (typeof window === 'undefined' || !roomId.value) return ''
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomId.value)
    return url.toString()
  })

  onUnmounted(() => {
    stopTimeSync()
    if (socket.value) socket.value.close()
  })

  return {
    connectionState,
    errorMessage,
    clientId,
    playerName,
    playerRecord,
    playerLoadout,
    room,
    roomId,
    shareUrl,
    isHost,
    latestSnapshot,
    latestMatchConfig,
    hostMigration,
    remoteInput,
    remoteLaunchCommit,
    serverTimeOffset,
    ensureConnected,
    connectAndCreateRoom,
    connectAndJoinRoom,
    updateProfile,
    setReady,
    startMatch,
    admitPendingPlayers,
    leaveRoom,
    sendInput,
    sendSnapshot,
    sendLaunchCommit,
    sendMatchComplete,
    estimateServerTime,
  }
}