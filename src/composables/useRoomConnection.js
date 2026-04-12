import { computed, onUnmounted, ref } from 'vue'

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

export function useRoomConnection() {
  const socket = ref(null)
  const connectionState = ref('offline')
  const errorMessage = ref('')
  const clientId = ref('')
  const playerName = ref('')
  const room = ref(null)
  const latestSnapshot = ref(null)
  const latestMatchConfig = ref(null)
  const remoteInput = ref(null)

  function send(type, payload = {}) {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) return false
    socket.value.send(JSON.stringify({ type, ...payload }))
    return true
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
    })

    nextSocket.addEventListener('close', () => {
      connectionState.value = 'offline'
      room.value = null
      latestSnapshot.value = null
      latestMatchConfig.value = null
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
          playerName.value = playerName.value || message.playerName || 'Blader'
          send('set_identity', { name: playerName.value, build: 'attack' })
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
          }
          latestSnapshot.value = null
          break
        case 'match_snapshot':
          latestSnapshot.value = message.snapshot
          break
        case 'remote_input':
          remoteInput.value = {
            playerId: message.playerId,
            input: message.input || {},
            sentAt: message.sentAt || Date.now(),
          }
          break
        case 'left_room':
          room.value = null
          latestSnapshot.value = null
          latestMatchConfig.value = null
          remoteInput.value = null
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

  async function connectAndCreateRoom({ name, build }) {
    playerName.value = name
    const ok = await ensureConnected()
    if (!ok) return false
    send('set_identity', { name, build })
    send('create_room')
    return true
  }

  async function connectAndJoinRoom({ roomId, name, build }) {
    playerName.value = name
    const ok = await ensureConnected()
    if (!ok) return false
    send('set_identity', { name, build })
    send('join_room', { roomId: roomId.toUpperCase() })
    return true
  }

  function updateProfile({ name, build }) {
    if (name) playerName.value = name
    send('update_profile', { name: playerName.value, build })
  }

  function setReady(ready) {
    send('set_ready', { ready })
  }

  function startMatch() {
    send('start_match')
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

  function sendMatchComplete(statusText) {
    send('match_complete', { statusText })
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
    if (socket.value) socket.value.close()
  })

  return {
    connectionState,
    errorMessage,
    clientId,
    playerName,
    room,
    roomId,
    shareUrl,
    isHost,
    latestSnapshot,
    latestMatchConfig,
    remoteInput,
    ensureConnected,
    connectAndCreateRoom,
    connectAndJoinRoom,
    updateProfile,
    setReady,
    startMatch,
    leaveRoom,
    sendInput,
    sendSnapshot,
    sendMatchComplete,
  }
}