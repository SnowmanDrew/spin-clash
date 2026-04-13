<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { BUILD_DEFS } from '../data/buildDefs.js'
import { createDefaultLoadout } from '../data/partDefs.js'
import { useRoomConnection } from '../composables/useRoomConnection.js'
import { useBeybladeSimulation } from '../composables/useBeybladeSimulation.js'
import snowverLogo from '../assets/snowverpowered.png'
import { Anvil, Clock3, Copy, Heart, Link2, Play, Radio, RotateCcw, RotateCw, Users, Wifi, WifiOff, Zap } from 'lucide-vue-next'

const PLAYER_ALIAS_STORAGE_KEY = 'spin-clash:player-alias'

const mountRef = ref(null)
const roomApi = useRoomConnection()

const {
  selectedBuild,
  selectedDisc,
  selectedDriver,
  selectedLoadout,
  playerRecord,
  menuMode,
  gamePhase,
  status,
  scoreboard,
  hudPlayers,
  buildEntries,
  sessionIntermission,
  spectatorMode,
  roundResult,
  countdown,
  launchBadges,
  launchState,
  launchSinglePlayerMatch,
  returnToMenu,
} = useBeybladeSimulation(mountRef, roomApi)

const displayBuild = ref(selectedBuild.value)
const cardVisible = ref(true)
const playerAlias = ref('Blader')
const joinCode = ref('')
const copyState = ref('')
const launchBadgeVisible = ref(false)

let launchBadgeTimer = null

watch(selectedBuild, () => {
  const defaults = createDefaultLoadout(selectedBuild.value)
  selectedDisc.value = defaults.disc
  selectedDriver.value = defaults.driver
  cardVisible.value = false
})

watch(playerAlias, (name) => {
  storePlayerAlias(name)
  if (roomApi.room.value) {
    roomApi.updateProfile({ name, build: selectedBuild.value, loadout: selectedLoadout.value })
  }
})

watch(() => roomApi.playerName.value, (name) => {
  if (name && playerAlias.value === 'Blader') {
    playerAlias.value = name
  }
})

watch(() => roomApi.room.value?.matchActive, (matchActive) => {
  if (menuMode.value === 'online' && gamePhase.value === 'battle' && matchActive === false) {
    returnToMenu()
  }
})

const roomPlayers = computed(() => roomApi.room.value?.players || [])
const roomId = computed(() => roomApi.roomId.value)
const roomStatus = computed(() => roomApi.room.value?.statusText || '')
const shareUrl = computed(() => roomApi.shareUrl.value)
const roomError = computed(() => roomApi.errorMessage.value)
const isHost = computed(() => roomApi.isHost.value)
const connectionState = computed(() => roomApi.connectionState.value)
const localRoomPlayer = computed(() => roomPlayers.value.find((player) => player.id === roomApi.clientId.value) || null)
const localHudPlayer = computed(() => hudPlayers.value.find((entry) => entry.isLocal) || null)
const connectedRoomPlayers = computed(() => roomPlayers.value.filter((player) => player.connected !== false))
const allPlayersReady = computed(() => connectedRoomPlayers.value.length >= 2 && connectedRoomPlayers.value.every((player) => player.ready))
const canStartRoomMatch = computed(() => isHost.value && allPlayersReady.value)
const connectionLabel = computed(() => {
  if (roomApi.connectionState.value === 'connected') return 'Server Online'
  if (roomApi.connectionState.value === 'connecting') return 'Connecting'
  if (roomApi.connectionState.value === 'error') return 'Server Unreachable'
  return 'Offline'
})
const modeLabel = computed(() => menuMode.value === 'online' ? 'Online Session' : 'Single Player')

const controlsList = [
  ['A / D', 'Aim before launch'],
  ['SPACE', 'Hold to charge, release before GO'],
  ['W / S', 'Set clockwise or counter spin'],
  ['WASD', 'Drift in combat'],
  ['SHIFT', 'Burst dash'],
  ['E', 'Stabilise / reduce wobble'],
  ['Q', 'Ultimate when full'],
]

function loadStoredPlayerAlias() {
  if (typeof window === 'undefined') return 'Blader'
  const storedAlias = window.localStorage.getItem(PLAYER_ALIAS_STORAGE_KEY)?.trim()
  return storedAlias || 'Blader'
}

function storePlayerAlias(name) {
  if (typeof window === 'undefined') return
  const trimmedName = name.trim()
  if (trimmedName) {
    window.localStorage.setItem(PLAYER_ALIAS_STORAGE_KEY, trimmedName)
    return
  }
  window.localStorage.removeItem(PLAYER_ALIAS_STORAGE_KEY)
}

function resolvePlayerAlias(name = playerAlias.value) {
  return name.trim() || 'Blader'
}

function getRecordLine(record, matchType) {
  const stats = record?.[matchType] || { wins: 0, losses: 0 }
  return `${stats.wins}W-${stats.losses}L`
}

function getRoomPlayerStatus(player) {
  if (player?.connected === false) return 'Reconnecting'
  if (player?.pendingJoin) return 'Next Round'
  if (player?.ready) return 'Ready'
  if (roomApi.room.value?.matchActive) return 'In Session'
  return 'Waiting'
}

const activeRecordLabel = computed(() => menuMode.value === 'online' ? 'VS Player' : 'VS CPU')
const activeRecordValue = computed(() => getRecordLine(playerRecord.value, menuMode.value === 'online' ? 'player' : 'cpu'))
const launchSpinIcon = computed(() => launchState.value.spinDir > 0 ? RotateCw : RotateCcw)
const launchPowerPercent = computed(() => Math.round(launchState.value.charge * 100))
const intermissionRoundStats = computed(() => roundResult.value?.summary?.players || [])
const intermissionRoundDuration = computed(() => roundResult.value?.summary?.duration ?? null)
const launchTimingCursorStyle = computed(() => ({ left: `${Math.round(launchState.value.countdownProgress * 100)}%` }))
const launchTimingWindowStyle = computed(() => {
  const width = Math.max(8, launchState.value.perfectWindowProgress * 100)
  const left = Math.max(0, Math.min(100 - width, launchState.value.idealProgress * 100 - width * 0.5))
  return {
    left: `${left}%`,
    width: `${width}%`,
  }
})
const launchChargeFillStyle = computed(() => ({ width: `${launchPowerPercent.value}%` }))
const launchChargeWindowStyle = computed(() => {
  const width = Math.max(10, launchState.value.chargeWindow * 42)
  const left = Math.max(0, Math.min(100 - width, launchState.value.chargeSweetSpot * 100 - width * 0.5))
  return {
    left: `${left}%`,
    width: `${width}%`,
  }
})
const launchHudStyle = computed(() => ({
  borderColor: `${launchState.value.color}30`,
  boxShadow: `inset 0 0 20px ${launchState.value.color}10, 0 0 0 1px ${launchState.value.color}18`,
}))
const launchHudPositionStyle = computed(() => {
  if (!launchState.value.screenVisible) {
    return {
      left: '50%',
      top: '96px',
      transform: 'translateX(-50%)',
    }
  }

  return {
    left: `clamp(180px, ${launchState.value.screenX}%, calc(100% - 180px))`,
    top: `max(88px, calc(${launchState.value.screenY}% - 104px))`,
    transform: 'translateX(-50%)',
  }
})
const localBladePointerVisible = computed(() => (
  gamePhase.value === 'battle'
  && !spectatorMode.value
  && countdown.value === null
  && !sessionIntermission.value.active
  && !roundResult.value
  && Boolean(localHudPlayer.value?.alive)
  && launchState.value.screenVisible
))
const localBladePointerStyle = computed(() => ({
  left: `clamp(28px, ${launchState.value.screenX}%, calc(100% - 28px))`,
  top: `max(78px, calc(${launchState.value.screenY}% - 58px))`,
  '--cb-pointer-color': launchState.value.color,
  '--cb-pointer-accent': launchState.value.accent,
}))

function getLaunchBadgeTheme(grade) {
  if (grade === 'Perfect') return { color: '#FFE500', glow: 'rgba(255,229,0,0.34)' }
  if (grade === 'Great') return { color: '#00E5FF', glow: 'rgba(0,229,255,0.3)' }
  if (grade === 'Good') return { color: '#7df9ff', glow: 'rgba(125,249,255,0.28)' }
  if (grade === 'Forced') return { color: '#f97316', glow: 'rgba(249,115,22,0.32)' }
  return { color: '#fb7185', glow: 'rgba(251,113,133,0.28)' }
}

function usesLaunchWarningTheme(grade) {
  return grade === 'Rough' || grade === 'Forced'
}

function getLaunchCardStyle(badge) {
  const theme = getLaunchBadgeTheme(badge.grade)
  if (usesLaunchWarningTheme(badge.grade)) {
    return {
      borderColor: theme.color,
      boxShadow: `0 0 0 1px ${theme.glow}, 0 0 32px ${theme.glow}`,
    }
  }

  return {
    borderColor: badge.color || theme.color,
    boxShadow: `0 0 0 1px ${(badge.accent || theme.color)}22, 0 0 32px ${(badge.accent || theme.color)}22`,
  }
}

function getLaunchBadgeGradeStyle(badge) {
  const theme = getLaunchBadgeTheme(badge.grade)
  if (usesLaunchWarningTheme(badge.grade)) {
    return {
      color: theme.color,
      textShadow: `0 0 20px ${theme.glow}`,
    }
  }

  return {
    color: badge.accent || theme.color,
    textShadow: `0 0 20px ${badge.accent || theme.glow}`,
  }
}

function getSpinIcon(spinDir) {
  return spinDir > 0 ? RotateCw : RotateCcw
}

function getLaunchBadgeStyle(badge) {
  return {
    left: `clamp(100px, ${badge.stableScreenX ?? badge.screenX}%, calc(100% - 100px))`,
    top: `clamp(118px, ${badge.stableScreenY ?? badge.screenY}%, calc(100% - 18px))`,
  }
}

function getLaunchBadgeLabel(badge) {
  if (badge.isLocal) return 'You'
  if (badge.isCpu) return 'CPU'
  return badge.name
}

const launchGradeTheme = computed(() => getLaunchBadgeTheme(launchState.value.grade))
const visibleLaunchBadges = computed(() => launchBadgeVisible.value
  ? launchBadges.value.filter((badge) => (badge.hasStableAnchor || badge.screenVisible) && badge.grade !== 'Unreleased')
  : [])

function clearLaunchBadgeTimer() {
  if (launchBadgeTimer) {
    clearTimeout(launchBadgeTimer)
    launchBadgeTimer = null
  }
}

function showLaunchBadge() {
  if (!launchState.value.locked || launchState.value.grade === 'Unreleased') return
  launchBadgeVisible.value = true
  clearLaunchBadgeTimer()
  launchBadgeTimer = setTimeout(() => {
    launchBadgeVisible.value = false
    launchBadgeTimer = null
  }, 1780)
}

watch(countdown, (current, previous) => {
  if (previous !== null && current === null) {
    showLaunchBadge()
  }
})

function onSpotlightAfterLeave() {
  displayBuild.value = selectedBuild.value
  cardVisible.value = true
}

function buildCardStyle(build, isSelected) {
  return {
    borderLeftColor: isSelected ? build.color : 'transparent',
    background: isSelected
      ? `linear-gradient(135deg, ${build.color}1f 0%, ${build.accent}10 26%, rgba(16,16,26,0.98) 68%)`
      : `linear-gradient(135deg, ${build.color}0d 0%, rgba(13,13,18,0.97) 46%, rgba(8,8,12,0.98) 100%)`,
    boxShadow: isSelected
      ? `inset 0 0 28px ${build.color}18, 0 0 0 1px ${build.color}26, 0 0 22px ${build.accent}12`
      : `inset 0 0 16px ${build.color}08, 0 0 0 1px rgba(255,255,255,0.05)`,
  }
}

function spotlightStyle(buildKey) {
  const build = BUILD_DEFS[buildKey]
  return {
    background: `linear-gradient(145deg, ${build.color}18 0%, rgba(10,10,16,0.95) 28%, rgba(10,10,16,0.98) 100%)`,
    border: `1px solid ${build.color}24`,
    borderLeft: `3px solid ${build.color}`,
    boxShadow: `0 0 0 1px ${build.color}24,0 0 36px ${build.color}12,inset 0 0 24px ${build.accent}0f`,
  }
}

async function createRoom() {
  menuMode.value = 'online'
  const name = resolvePlayerAlias()
  playerAlias.value = name
  await roomApi.connectAndCreateRoom({ name, build: selectedBuild.value, loadout: selectedLoadout.value, record: playerRecord.value })
}

async function joinRoom() {
  if (!joinCode.value.trim()) return
  menuMode.value = 'online'
  const name = resolvePlayerAlias()
  playerAlias.value = name
  await roomApi.connectAndJoinRoom({ roomId: joinCode.value.trim(), name, build: selectedBuild.value, loadout: selectedLoadout.value, record: playerRecord.value })
}

function toggleReady() {
  roomApi.setReady(!localRoomPlayer.value?.ready)
}

function startRoomMatch() {
  roomApi.startMatch()
}

function leaveRoom() {
  roomApi.leaveRoom()
}

async function copyShareLink() {
  if (!shareUrl.value) return
  await navigator.clipboard.writeText(shareUrl.value)
  copyState.value = 'Copied'
  setTimeout(() => {
    copyState.value = ''
  }, 1200)
}

function launchSingle() {
  menuMode.value = 'single'
  const name = resolvePlayerAlias()
  playerAlias.value = name
  launchSinglePlayerMatch(name)
}

function exitBattle() {
  if (menuMode.value === 'online' && isHost.value) {
    roomApi.sendMatchComplete('Session ended.')
  }
  returnToMenu()
}

onMounted(() => {
  playerAlias.value = loadStoredPlayerAlias()
  const roomId = new URL(window.location.href).searchParams.get('room')
  if (roomId) {
    menuMode.value = 'online'
    joinCode.value = roomId
    roomApi.connectAndJoinRoom({ roomId, name: resolvePlayerAlias(), build: selectedBuild.value, loadout: selectedLoadout.value, record: playerRecord.value })
  }
})

onUnmounted(() => {
  clearLaunchBadgeTimer()
})
</script>

<template>
  <div class="relative flex h-screen w-screen flex-col overflow-hidden bg-[#050508] text-white select-none">
    <div class="md:hidden absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050508] text-center px-8">
      <div class="text-[#FFE500] font-black uppercase text-2xl tracking-widest mb-3">Desktop Only</div>
      <div class="text-white/40 text-sm leading-relaxed">CLASHBLADES requires a keyboard.<br>Please open on a desktop browser.</div>
    </div>

    <div class="hidden md:contents">
      <template v-if="gamePhase === 'battle'">
        <div ref="mountRef" class="absolute inset-0 z-0" />

        <header class="absolute top-0 inset-x-0 z-20 h-[78px]" style="clip-path: polygon(0 0, 100% 0, 100% 58px, 0 78px)">
          <div class="absolute inset-0 bg-[#0a0a0a]/92"></div>
          <div class="absolute left-0 top-0 h-full w-[300px] bg-[#FFE500]" style="clip-path: polygon(0 0, 100% 0, 83% 100%, 0 100%)">
            <div class="h-full flex items-center pl-5 pr-20">
              <div class="flex flex-col gap-[3px] leading-none">
                <span class="font-black text-[#0a0a0a] text-[8px] uppercase tracking-[0.55em] opacity-60">{{ modeLabel }}</span>
                <span class="font-black text-[#0a0a0a] text-[19px] uppercase tracking-tight leading-none">ClashBlades</span>
              </div>
            </div>
          </div>
          <div class="absolute top-0 h-full w-[88px] bg-[#00E5FF]" style="left: 255px; clip-path: polygon(40% 0, 100% 0, 60% 100%, 0 100%)"></div>
          <div class="absolute top-0 h-full w-[70px] bg-[#B800FF]" style="left: 324px; clip-path: polygon(40% 0, 100% 0, 60% 100%, 0 100%)"></div>

          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span class="text-[10px] uppercase tracking-[0.45em] text-white/35">{{ status }}</span>
          </div>

          <div class="absolute right-5 top-4 flex items-center gap-3">
            <span class="text-[9px] uppercase tracking-[0.35em] text-white/40">{{ hudPlayers.length }} Players</span>
            <button class="cb-chip cb-chip-interactive" @click="exitBattle">Exit</button>
          </div>
        </header>

        <div class="absolute top-[92px] left-4 right-4 z-20 flex flex-wrap items-center justify-end gap-2">
          <div
            v-for="entry in scoreboard"
            :key="entry.id"
            class="cb-score-chip"
            :style="{ borderColor: BUILD_DEFS[entry.build].color + '66', boxShadow: `0 0 0 1px ${BUILD_DEFS[entry.build].color}24 inset` }"
          >
            <div class="flex items-center gap-2">
              <div class="w-2 h-2" :style="{ background: BUILD_DEFS[entry.build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
              <span class="font-black uppercase tracking-[0.16em] text-[10px]">{{ entry.name }}</span>
              <span class="text-[10px] text-[#FFE500] font-black">{{ entry.score }}</span>
            </div>
          </div>
        </div>

        <div class="absolute bottom-0 inset-x-0 z-20 cb-bottom-hud px-5 py-4">
          <div class="mx-auto grid max-w-6xl grid-cols-2 gap-3">
            <div
              v-for="entry in hudPlayers"
              :key="entry.id"
              class="cb-hud-card"
              :style="{ borderColor: BUILD_DEFS[entry.build].color + '33' }"
            >
              <div class="flex items-center gap-2.5 mb-2">
                <span class="cb-tag" :style="{ background: BUILD_DEFS[entry.build].color, color: '#060610' }">{{ entry.isCpu ? 'CPU' : entry.isLocal ? 'You' : 'Player' }}</span>
                <div class="w-2 h-2" :style="{ background: BUILD_DEFS[entry.build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                <span class="text-[11px] font-black uppercase tracking-[0.12em]">{{ entry.name }}</span>
                <span class="ml-auto text-[9px] uppercase tracking-[0.16em] text-white/35">{{ BUILD_DEFS[entry.build].name }}</span>
              </div>

              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-[8px] uppercase tracking-widest text-white/28 w-8">Spin</span>
                <div class="flex-1 h-[3px] bg-white/[0.07] overflow-hidden">
                  <div class="cb-bar-cyan" :style="{ width: `${Math.max(0, Math.min(100, entry.spin))}%`, background: BUILD_DEFS[entry.build].color, boxShadow: `0 0 8px ${BUILD_DEFS[entry.build].color}` }" />
                </div>
                <span class="text-[8px] font-mono text-white/28 w-8 text-right">{{ entry.spin.toFixed(0) }}</span>
              </div>

              <div class="flex items-center gap-2">
                <span class="text-[8px] uppercase tracking-widest text-[#FFE500]/60 w-8">ULT</span>
                <div class="flex-1 h-[3px] bg-white/[0.07] overflow-hidden">
                  <div class="cb-bar-yellow" :style="{ width: `${entry.special}%` }" />
                </div>
                <span class="text-[8px] font-mono text-white/28 w-8 text-right">{{ entry.special.toFixed(0) }}%</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="countdown !== null" class="absolute inset-0 z-25 pointer-events-none" style="z-index:25">
          <div v-if="!spectatorMode" class="absolute w-[min(360px,calc(100%-2rem))] launch-hud-wrap" :style="launchHudPositionStyle">
            <div class="launch-hud" :class="{ 'is-locked': launchState.locked }" :style="launchHudStyle">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[7px] uppercase tracking-[0.38em] text-white/32">Launch</div>
                  <div class="mt-0.5 text-[11px] font-black uppercase tracking-[0.12em]" :style="{ color: launchState.locked ? launchGradeTheme.color : '#ffffff' }">
                    {{ launchState.locked ? launchState.grade : 'Release on the mark' }}
                  </div>
                </div>
                <div class="flex items-center gap-1.5 text-[7px] uppercase tracking-[0.16em] text-white/52">
                  <span class="launch-key inline-flex items-center gap-1" :class="launchState.spinDir > 0 ? 'is-active' : ''">
                    <RotateCw class="h-3 w-3" />
                    <span>W</span>
                  </span>
                  <span class="launch-key inline-flex items-center gap-1" :class="launchState.spinDir < 0 ? 'is-active' : ''">
                    <RotateCcw class="h-3 w-3" />
                    <span>S</span>
                  </span>
                  <component :is="launchSpinIcon" class="h-3.5 w-3.5 text-white/78" />
                </div>
              </div>

              <div class="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 launch-hud-grid">
                <div>
                  <div class="mb-1 flex items-center justify-between text-[6px] uppercase tracking-[0.2em] text-white/32">
                    <span class="inline-flex items-center gap-1"><Clock3 class="h-2.5 w-2.5" />Timing</span>
                    <span>{{ launchState.locked ? 'Locked' : 'Release in zone' }}</span>
                  </div>
                  <div class="launch-lane">
                    <div class="launch-window" :style="{ ...launchTimingWindowStyle, background: `linear-gradient(90deg, ${launchState.accent}2e 0%, ${launchState.accent}70 100%)`, boxShadow: `0 0 18px ${launchState.accent}35` }" />
                    <div class="launch-cursor" :style="launchTimingCursorStyle" :class="{ 'is-locked': launchState.locked }" />
                    <div class="launch-target-tag" :style="{ ...launchTimingWindowStyle, color: launchState.accent, borderColor: `${launchState.accent}55`, background: `${launchState.accent}12` }">RELEASE</div>
                  </div>
                  <div class="launch-lane-note-row">
                    <span>Hold</span>
                    <span :style="{ color: `${launchState.accent}cc` }">Target</span>
                    <span>GO</span>
                  </div>
                </div>

                <div>
                  <div class="mb-1 flex items-center justify-between text-[6px] uppercase tracking-[0.2em] text-white/32">
                    <span class="inline-flex items-center gap-1"><Zap class="h-2.5 w-2.5" />Power</span>
                    <span>{{ launchState.locked ? 'Set' : `${launchPowerPercent}%` }}</span>
                  </div>
                  <div class="launch-lane">
                    <div class="launch-window launch-window-charge" :style="{ ...launchChargeWindowStyle, background: `linear-gradient(90deg, ${launchState.color}24 0%, ${launchState.accent}40 100%)`, boxShadow: `0 0 18px ${launchState.color}25` }" />
                    <div class="launch-fill" :style="{ ...launchChargeFillStyle, background: `linear-gradient(90deg, ${launchState.color} 0%, ${launchState.accent} 100%)`, boxShadow: `0 0 16px ${launchState.color}28` }" />
                    <div class="launch-target-tag launch-target-tag-charge" :style="{ ...launchChargeWindowStyle, color: launchState.color, borderColor: `${launchState.color}55`, background: `${launchState.color}12` }">SWEET</div>
                  </div>
                  <div class="launch-lane-note-row">
                    <span>Low</span>
                    <span :style="{ color: `${launchState.color}cc` }">Sweet spot</span>
                    <span>Overhold</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="absolute inset-0 flex items-center justify-center">
            <Transition name="cd-pop" mode="out-in">
              <div :key="countdown" class="font-black leading-none select-none" :class="countdown === 0 ? 'countdown-go' : 'countdown-num'">
                {{ countdown === 0 ? 'GO!' : countdown }}
              </div>
            </Transition>
          </div>
        </div>

        <div v-if="spectatorMode" class="absolute left-1/2 top-[96px] z-[26] -translate-x-1/2 pointer-events-none">
          <div class="px-4 py-2 text-center bg-black/70 border border-white/10 backdrop-blur-md" style="clip-path: polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)">
            <div class="text-[8px] uppercase tracking-[0.38em] text-white/38">Spectating</div>
            <div class="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#FFE500]">You join next round</div>
          </div>
        </div>

        <div v-if="localBladePointerVisible" class="cb-local-pointer" :style="localBladePointerStyle">
          <div class="cb-local-pointer-chevron" />
        </div>

        <TransitionGroup name="launch-grade-pop" tag="div">
          <div
            v-for="badge in visibleLaunchBadges"
            :key="badge.id"
            class="absolute z-[29] pointer-events-none"
            :style="getLaunchBadgeStyle(badge)"
          >
            <div class="launch-grade-card" :style="getLaunchCardStyle(badge)">
              <div class="text-[8px] uppercase tracking-[0.52em] text-white/38">{{ getLaunchBadgeLabel(badge) }}</div>
              <div class="mt-2 text-[clamp(1.35rem,2.6vw,2.35rem)] font-black uppercase tracking-[0.08em] leading-none" :style="getLaunchBadgeGradeStyle(badge)">{{ badge.grade }}</div>
              <div class="mt-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/52">
                <component :is="getSpinIcon(badge.spinDir)" class="h-3.5 w-3.5" :style="{ color: badge.color || '#d7f0ff' }" />
                <span>{{ badge.powerPercent }}% power</span>
              </div>
            </div>
          </div>
        </TransitionGroup>

        <Transition name="cb-result">
          <div v-if="sessionIntermission.active" class="absolute inset-0 z-30 flex items-center justify-center bg-black/45 px-6">
            <div class="session-intermission-card pointer-events-auto">
              <div class="text-[8px] uppercase tracking-[0.58em] text-white/38">Session Break</div>
              <div class="mt-2 text-[clamp(1.8rem,3vw,2.5rem)] font-black uppercase tracking-[0.08em] text-[#FFE500]">Next Round In {{ sessionIntermission.seconds }}</div>
              <div class="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/46">Pick a new blade or keep your current one</div>

              <div v-if="intermissionRoundStats.length" class="mt-5 text-left">
                <div class="flex items-center justify-between gap-3 border-b border-white/8 pb-2">
                  <span class="text-[8px] uppercase tracking-[0.46em] text-white/36">Round Breakdown</span>
                  <span v-if="intermissionRoundDuration !== null" class="text-[9px] uppercase tracking-[0.24em] text-[#FFE500]/80">{{ intermissionRoundDuration.toFixed(1) }}s</span>
                </div>
                <div class="mt-3 grid gap-2.5">
                  <div
                    v-for="entry in intermissionRoundStats"
                    :key="`round-stat-${entry.id}`"
                    class="rounded-[10px] border px-3 py-2"
                    :style="{ borderColor: `${BUILD_DEFS[entry.build].color}33`, background: `linear-gradient(135deg, ${BUILD_DEFS[entry.build].color}12 0%, rgba(255,255,255,0.03) 100%)` }"
                  >
                    <div class="flex items-center gap-2">
                      <div class="w-2.5 h-2.5" :style="{ background: BUILD_DEFS[entry.build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                      <span class="font-black uppercase tracking-[0.12em] text-[11px]">{{ entry.isLocal ? 'You' : entry.name }}</span>
                      <span class="text-[8px] uppercase tracking-[0.22em] text-white/34">{{ BUILD_DEFS[entry.build].name }}</span>
                      <span class="ml-auto text-[9px] font-black uppercase tracking-[0.18em]" :style="{ color: entry.result === 'Winner' ? '#FFE500' : 'rgba(255,255,255,0.58)' }">{{ entry.result }}</span>
                    </div>
                    <div class="mt-2 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <div class="text-[7px] uppercase tracking-[0.24em] text-white/28">Launch</div>
                        <div class="mt-1 text-[10px] font-black uppercase tracking-[0.12em]" :style="{ color: BUILD_DEFS[entry.build].accent }">{{ entry.launchGrade }}</div>
                      </div>
                      <div>
                        <div class="text-[7px] uppercase tracking-[0.24em] text-white/28">Max Hit</div>
                        <div class="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/78">{{ entry.maxImpact.toFixed(1) }}</div>
                      </div>
                      <div>
                        <div class="text-[7px] uppercase tracking-[0.24em] text-white/28">Spin Dealt</div>
                        <div class="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/78">{{ entry.spinDamageDealt.toFixed(1) }}</div>
                      </div>
                      <div>
                        <div class="text-[7px] uppercase tracking-[0.24em] text-white/28">Survival</div>
                        <div class="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/78">{{ entry.survivalTime.toFixed(1) }}s</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-5 gap-2">
                <button
                  v-for="build in buildEntries"
                  :key="`intermission-${build.key}`"
                  class="session-blade-btn"
                  :class="{ 'is-selected': selectedBuild === build.key }"
                  :style="selectedBuild === build.key ? { borderColor: build.color, boxShadow: `inset 0 0 18px ${build.color}22, 0 0 0 1px ${build.color}18` } : { borderColor: 'rgba(255,255,255,0.08)' }"
                  @click="selectedBuild = build.key"
                >
                  <div class="w-3 h-3" :style="{ background: build.color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                  <span class="font-black uppercase tracking-[0.14em] text-[10px]">{{ build.name }}</span>
                  <span class="text-[8px] uppercase tracking-[0.22em]" :style="selectedBuild === build.key ? { color: build.color } : { color: 'rgba(255,255,255,0.34)' }">{{ selectedBuild === build.key ? 'Next Up' : build.specialName }}</span>
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <Transition name="cb-result">
          <div v-if="roundResult && !sessionIntermission.active" class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div class="cb-result-card text-center">
              <div class="text-[8px] uppercase tracking-[0.6em] text-white/40 mb-2">{{ roundResult.isMatchOver ? 'Match Over' : 'Round Over' }}</div>
              <div class="text-[clamp(2rem,4vw,3rem)] font-black uppercase leading-none tracking-tight mb-2 text-[#00E5FF]">{{ roundResult.type }}</div>
              <div class="text-[0.95rem] font-black uppercase tracking-[0.22em] text-[#FFE500]">{{ roundResult.outcome }}</div>
            </div>
          </div>
        </Transition>
      </template>

      <template v-else>
        <header class="relative flex-shrink-0 h-[78px] z-10" style="clip-path: polygon(0 0, 100% 0, 100% 58px, 0 78px)">
          <div class="absolute inset-0 bg-[#0a0a0a]/92"></div>
          <div class="absolute left-0 top-0 h-full w-[300px] bg-[#FFE500]" style="clip-path: polygon(0 0, 100% 0, 83% 100%, 0 100%)">
            <div class="h-full flex items-center pl-5 pr-20">
              <div class="flex flex-col gap-[3px] leading-none">
                <span class="font-black text-[#0a0a0a] text-[8px] uppercase tracking-[0.55em] opacity-60">Tournament Edition</span>
                <span class="font-black text-[#0a0a0a] text-[19px] uppercase tracking-tight leading-none">ClashBlades</span>
              </div>
            </div>
          </div>
          <div class="absolute top-0 h-full w-[88px] bg-[#00E5FF]" style="left: 255px; clip-path: polygon(40% 0, 100% 0, 60% 100%, 0 100%)"></div>
          <div class="absolute top-0 h-full w-[70px] bg-[#B800FF]" style="left: 324px; clip-path: polygon(40% 0, 100% 0, 60% 100%, 0 100%)"></div>

          <div class="absolute right-5 top-4 flex items-center gap-3">
            <div class="cb-chip flex items-center gap-2">
              <component :is="connectionState === 'connected' ? Wifi : WifiOff" class="w-3.5 h-3.5" />
              <span>{{ connectionLabel }}</span>
            </div>
            <div v-if="roomId" class="cb-chip">Room {{ roomId }}</div>
          </div>
        </header>

        <div class="flex flex-1 overflow-hidden">
          <aside class="w-[340px] flex-shrink-0 flex flex-col overflow-y-auto bg-[#050508]">
            <div class="h-4 flex-shrink-0" />
            <div class="bg-[#00E5FF] px-5 py-3 flex-shrink-0" style="clip-path:polygon(0 0,100% 0,92% 100%,0 100%)">
              <div class="text-[16px] font-black uppercase tracking-tight text-[#060610] leading-none">Blade Select</div>
            </div>

            <div class="px-3 pt-3 flex flex-col gap-1.5">
              <button
                v-for="build in buildEntries"
                :key="build.key"
                @click="selectedBuild = build.key"
                class="cb-card relative overflow-hidden px-3 py-2.5"
                :class="{ 'is-selected': selectedBuild === build.key }"
                :style="buildCardStyle(build, selectedBuild === build.key)"
              >
                <div class="absolute inset-0 pointer-events-none opacity-100" :style="{ background: `radial-gradient(circle at 100% 0%, ${build.accent}18 0%, transparent 42%)` }" />
                <div class="absolute top-0 right-0 h-[2px] w-14 pointer-events-none" :style="{ background: `linear-gradient(90deg, transparent, ${build.accent})` }" />

                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2 min-w-0">
                    <div class="w-2.5 h-2.5 flex-shrink-0" :style="{ background: build.color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                    <span class="font-black uppercase tracking-[0.1em] text-[13px]">{{ build.name }}</span>
                  </div>
                  <span class="text-[7px] uppercase tracking-[0.3em] font-bold px-1.5 py-0.5 leading-tight flex-shrink-0" :style="selectedBuild === build.key ? { color: build.color, border: `1px solid ${build.color}`, background: build.color + '1a', clipPath: 'polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)' } : { color: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.1)', clipPath: 'polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)' }">{{ selectedBuild === build.key ? 'Selected' : build.specialName }}</span>
                </div>

                <Transition name="build-details">
                  <div v-if="selectedBuild === build.key" class="build-card-details space-y-2 border-t border-white/[0.06] pt-2">
                    <div class="text-[10px] text-white/32 leading-relaxed">{{ build.description }}</div>
                    <div v-for="({ icon, val }) in [{ icon: Zap, val: build.stats.speed }, { icon: Anvil, val: build.stats.weight }, { icon: Heart, val: build.stats.stamina }]" :key="icon" class="flex items-center gap-2.5">
                      <component :is="icon" class="w-4 h-4 flex-shrink-0 text-white/30" :stroke-width="2" />
                      <div class="flex-1 h-[2px]" style="background:rgba(255,255,255,0.07)">
                        <div class="h-full" :style="{ width: Math.round(val / 1.5 * 100) + '%', background: build.color, boxShadow: `0 0 5px ${build.color}88` }" />
                      </div>
                    </div>
                  </div>
                </Transition>
              </button>
            </div>

            <div class="flex-1" />

            <div class="px-3 pb-5">
              <div class="p-3" style="clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.018)">
                <div class="text-[7px] uppercase tracking-[0.58em] text-[#FFE500]/45 mb-2.5">Controls</div>
                <div class="space-y-1.5">
                  <div v-for="[key, action] in controlsList" :key="key" class="flex items-center justify-between gap-3">
                    <span class="font-mono text-[#FFE500] text-[8px] uppercase tracking-wider whitespace-nowrap px-2 py-0.5 flex-shrink-0" style="background:rgba(255,229,0,0.08);border:1px solid rgba(255,229,0,0.22);clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)">{{ key }}</span>
                    <span class="text-[9px] text-white/28 text-right">{{ action }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="px-4 pb-4 pt-2 flex items-center justify-center gap-3">
              <span class="text-[13px] text-white/60">by</span>
              <img :src="snowverLogo" alt="Snowverpowered" class="h-10 w-auto" />
            </div>
          </aside>

          <main class="flex-1 relative overflow-hidden bg-[#050508]">
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden cb-ring-field">
              <div class="cb-ring cb-ring-outer w-[640px] h-[640px] rounded-full" style="border:1px solid rgba(184,0,255,0.10)"/>
              <div class="cb-ring cb-ring-mid absolute w-[460px] h-[460px] rounded-full" style="border:1px solid rgba(0,229,255,0.13)"/>
              <div class="cb-ring cb-ring-inner absolute w-[290px] h-[290px] rounded-full" style="border:1px solid rgba(255,229,0,0.17)"/>
              <div class="cb-ring cb-ring-dashed absolute w-[148px] h-[148px] rounded-full" style="border:1.5px dashed rgba(255,229,0,0.22)"/>
            </div>

            <div class="relative z-10 h-full flex flex-col items-center justify-center px-12 text-center">
              <h1 class="font-black uppercase leading-none tracking-[-0.02em] mb-6">
                <span class="block text-[clamp(3.5rem,7vw,6.5rem)] text-[#FFE500]" style="text-shadow:0 0 40px rgba(255,229,0,0.45),0 0 80px rgba(255,229,0,0.18)">CLASH</span>
                <span class="block text-[clamp(3.5rem,7vw,6.5rem)] text-[#FFE500]" style="text-shadow:0 0 40px rgba(255,229,0,0.38),0 0 80px rgba(255,229,0,0.15)">BLADES</span>
              </h1>

              <div class="mb-6 flex items-center gap-2">
                <button class="cb-mode-btn" :class="{ 'is-active': menuMode === 'single' }" @click="menuMode = 'single'">
                  <Play class="w-4 h-4" />
                  <span>Single Player</span>
                </button>
                <button class="cb-mode-btn" :class="{ 'is-active': menuMode === 'online' }" @click="menuMode = 'online'">
                  <Radio class="w-4 h-4" />
                  <span>Online Session</span>
                </button>
              </div>

              <div class="grid w-full max-w-[980px] grid-cols-[minmax(0,460px)_minmax(0,420px)] gap-6 items-start">
                <Transition name="spotlight" @after-leave="onSpotlightAfterLeave">
                  <div v-if="cardVisible" class="text-left cb-spotlight" :style="spotlightStyle(displayBuild)">
                    <div class="h-[2px]" :style="{ background: `linear-gradient(90deg,${BUILD_DEFS[displayBuild].color},${BUILD_DEFS[displayBuild].color}00)` }" />
                    <div class="p-5 cb-spotlight-body">
                      <div class="flex items-center gap-3 mb-3">
                        <div class="w-5 h-5 flex-shrink-0" :style="{ background: BUILD_DEFS[displayBuild].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                        <span class="font-black uppercase tracking-[0.18em] text-sm">{{ BUILD_DEFS[displayBuild].name }}</span>
                        <div class="ml-auto px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.3em]" :style="{ color: BUILD_DEFS[displayBuild].color, border: `1px solid ${BUILD_DEFS[displayBuild].color}55`, background: BUILD_DEFS[displayBuild].color + '14', clipPath: 'polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)' }">{{ BUILD_DEFS[displayBuild].specialName }}</div>
                      </div>

                      <p class="text-[11px] text-white/40 leading-relaxed">{{ BUILD_DEFS[displayBuild].description }}</p>

                      <div class="mt-4 grid gap-2.5">
                        <div v-for="({ icon, label, val }) in [
                          { icon: Zap, label: 'Speed', val: BUILD_DEFS[displayBuild].stats.speed },
                          { icon: Anvil, label: 'Weight', val: BUILD_DEFS[displayBuild].stats.weight },
                          { icon: Heart, label: 'Stamina', val: BUILD_DEFS[displayBuild].stats.stamina },
                        ]" :key="label" class="cb-spotlight-stat">
                          <div class="cb-spotlight-stat-label">
                            <component :is="icon" class="w-3.5 h-3.5" :stroke-width="2" />
                            <span>{{ label }}</span>
                          </div>
                          <div class="cb-spotlight-stat-track">
                            <div class="cb-spotlight-stat-fill" :style="{ width: Math.round(val / 1.5 * 100) + '%', background: BUILD_DEFS[displayBuild].color, boxShadow: `0 0 10px ${BUILD_DEFS[displayBuild].color}66` }" />
                          </div>
                        </div>
                      </div>

                      <p class="mt-4 text-[10px] leading-relaxed" :style="{ color: BUILD_DEFS[displayBuild].color + 'b0' }">▸ {{ BUILD_DEFS[displayBuild].specialDescription }}</p>
                    </div>
                  </div>
                </Transition>

                <div class="cb-panel text-left">
                  <div class="flex items-center gap-2 mb-3">
                    <Users class="w-4 h-4 text-[#FFE500]" />
                    <span class="text-[10px] uppercase tracking-[0.4em] text-white/35">{{ modeLabel }}</span>
                    <span class="ml-auto text-[8px] uppercase tracking-[0.28em] text-white/30">{{ activeRecordLabel }}</span>
                    <span class="text-[10px] font-black uppercase tracking-[0.18em] text-[#FFE500]">{{ activeRecordValue }}</span>
                  </div>

                  <label class="block mb-3">
                    <span class="cb-label">Name</span>
                    <input v-model="playerAlias" maxlength="24" class="cb-input" placeholder="Enter a name" />
                  </label>

                  <template v-if="menuMode === 'single'">
                    <button class="cb-btn-launch" @click="launchSingle">Launch Match</button>
                  </template>

                  <template v-else>
                    <template v-if="!roomId">
                      <p class="text-[12px] text-white/45 leading-relaxed mb-4">Create a room, share the link, and run an endless free-for-all session for up to four players.</p>
                      <div class="grid grid-cols-[1fr_auto] gap-2 mb-3">
                        <input v-model="joinCode" maxlength="12" class="cb-input uppercase" placeholder="Room Code" />
                        <button class="cb-chip cb-chip-cta" :disabled="!joinCode.trim()" @click="joinRoom">
                          <Link2 class="w-3.5 h-3.5" />
                          Join
                        </button>
                      </div>
                      <button class="cb-btn-launch" @click="createRoom">Create Session</button>
                    </template>

                    <template v-else>
                      <div class="grid gap-3">
                        <div class="cb-lobby-box">
                          <div class="flex items-center justify-between gap-3 mb-2">
                            <span class="cb-label">Share Link</span>
                            <button class="cb-chip cb-chip-interactive" @click="copyShareLink">
                              <Copy class="w-3.5 h-3.5" />
                              {{ copyState || 'Copy' }}
                            </button>
                          </div>
                          <div class="cb-code">{{ shareUrl }}</div>
                        </div>

                        <div class="cb-lobby-box">
                          <div class="flex items-center justify-between gap-3 mb-2">
                            <span class="cb-label">Session Lobby</span>
                            <span class="text-[10px] uppercase tracking-[0.3em]" :class="isHost ? 'text-[#FFE500]' : 'text-white/35'">{{ isHost ? 'Host' : 'Guest' }}</span>
                          </div>
                          <div v-if="roomStatus" class="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/28">{{ roomStatus }}</div>
                          <div class="grid gap-2">
                            <div v-for="slot in 4" :key="slot" class="cb-slot">
                              <template v-if="roomPlayers[slot - 1]">
                                <div class="min-w-0">
                                  <div class="flex items-center gap-2">
                                    <div class="w-2 h-2" :style="{ background: BUILD_DEFS[roomPlayers[slot - 1].build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                                    <span class="font-black uppercase tracking-[0.12em] text-[11px]">{{ roomPlayers[slot - 1].name }}</span>
                                    <span class="text-[9px] text-white/35 uppercase">{{ BUILD_DEFS[roomPlayers[slot - 1].build].name }}</span>
                                  </div>
                                  <div class="mt-1 text-[8px] uppercase tracking-[0.16em] text-white/28">
                                    PVP {{ getRecordLine(roomPlayers[slot - 1].record, 'player') }}
                                  </div>
                                </div>
                                <span class="text-[9px] uppercase tracking-[0.25em]" :class="roomPlayers[slot - 1].pendingJoin || roomPlayers[slot - 1].ready ? 'text-[#FFE500]' : 'text-white/30'">{{ getRoomPlayerStatus(roomPlayers[slot - 1]) }}</span>
                              </template>
                              <template v-else>
                                <span class="text-[10px] uppercase tracking-[0.3em] text-white/25">Open Slot</span>
                              </template>
                            </div>
                          </div>
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                          <button class="cb-chip cb-chip-cta" :disabled="!localRoomPlayer" @click="toggleReady">{{ localRoomPlayer?.ready ? 'Unready' : 'Ready Up' }}</button>
                          <button class="cb-chip cb-chip-cta" :disabled="!canStartRoomMatch" @click="startRoomMatch">Start Session</button>
                          <button class="cb-chip cb-chip-interactive" @click="leaveRoom">Leave</button>
                        </div>
                      </div>
                    </template>

                    <p v-if="roomError" class="mt-3 text-[11px] text-[#ff7a9e]">{{ roomError }}</p>
                  </template>
                </div>
              </div>
            </div>
          </main>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cb-card {
  background: #0d0d12;
  border: 1px solid rgba(255,255,255,0.06);
  border-left-width: 3px;
  clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%);
  transition: background 0.14s, box-shadow 0.18s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1), border-color 0.16s, filter 0.18s;
  cursor: pointer;
  width: 100%;
  text-align: left;
  position: relative;
}

.cb-card:hover {
  transform: translateX(4px) scale(1.012);
  box-shadow: inset 0 0 24px rgba(255,255,255,0.05), 0 12px 28px rgba(0,0,0,0.36);
  border-color: rgba(255,255,255,0.1);
  filter: brightness(1.04);
}

.cb-card.is-selected {
  background: #10101a;
  transform: scaleX(1.015);
}

.build-card-details {
  overflow: hidden;
  transform-origin: top;
}

.cb-spotlight-body {
  display: flex;
  flex-direction: column;
}

.cb-spotlight-stat {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
}

.cb-spotlight-stat-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.42);
}

.cb-spotlight-stat-track {
  height: 4px;
  background: rgba(255,255,255,0.07);
  overflow: hidden;
}

.cb-spotlight-stat-fill {
  height: 100%;
}

.build-details-enter-active,
.build-details-leave-active {
  transition: max-height 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.18s ease, transform 0.22s ease, margin-top 0.22s ease, padding-top 0.22s ease, border-color 0.18s ease;
}

.build-details-enter-from,
.build-details-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-6px) scaleY(0.96);
  margin-top: 0;
  padding-top: 0;
  border-color: transparent;
}

.build-details-enter-to,
.build-details-leave-from {
  max-height: 160px;
  opacity: 1;
  transform: translateY(0) scaleY(1);
}

.cb-card:focus-visible {
  outline: none;
  border-color: rgba(255,229,0,0.5);
  box-shadow: 0 0 0 1px rgba(255,229,0,0.34), 0 0 0 4px rgba(255,229,0,0.08), inset 0 0 24px rgba(255,255,255,0.04);
}

.cb-panel {
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(14,14,22,0.96) 0%, rgba(8,8,12,0.94) 100%);
  padding: 22px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.38);
}

.cb-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.6);
  padding: 10px 14px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 10px;
  font-weight: 900;
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  cursor: pointer;
  transition: background 0.14s, color 0.14s, border-color 0.14s, transform 0.14s, box-shadow 0.18s;
}

.cb-mode-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.18);
  color: rgba(255,255,255,0.84);
  box-shadow: inset 0 0 18px rgba(255,255,255,0.03), 0 8px 18px rgba(0,0,0,0.22);
}

.cb-mode-btn.is-active {
  color: #060610;
  background: #ffe500;
  border-color: #ffe500;
  box-shadow: 0 0 20px rgba(255,229,0,0.18);
}

.cb-mode-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px rgba(255,229,0,0.4), 0 0 0 4px rgba(255,229,0,0.08);
}

.cb-label {
  display: block;
  margin-bottom: 8px;
  font-size: 9px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
}

.cb-input {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  color: white;
  padding: 12px 14px;
  outline: none;
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  cursor: text;
  transition: border-color 0.14s, background 0.14s, box-shadow 0.14s, color 0.14s;
}

.cb-input:hover {
  border-color: rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.055);
}

.cb-input:focus {
  border-color: rgba(0,229,255,0.55);
  background: rgba(255,255,255,0.06);
  box-shadow: 0 0 0 1px rgba(0,229,255,0.3), 0 0 0 4px rgba(0,229,255,0.08);
}

.cb-input::placeholder {
  color: rgba(255,255,255,0.26);
}

.cb-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.75);
  padding: 8px 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 9px;
  font-weight: 900;
  clip-path: polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%);
  cursor: default;
  transition: transform 0.14s, border-color 0.14s, background 0.14s, color 0.14s, box-shadow 0.18s, opacity 0.14s;
}

.cb-chip-cta {
  justify-content: center;
  background: rgba(255,229,0,0.08);
  color: #ffe500;
  border-color: rgba(255,229,0,0.28);
}

.cb-chip-interactive,
.cb-chip-cta {
  cursor: pointer;
}

.cb-chip-interactive:hover,
.cb-chip-cta:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.18);
  box-shadow: 0 10px 20px rgba(0,0,0,0.22), inset 0 0 18px rgba(255,255,255,0.03);
}

.cb-chip-cta:hover:not(:disabled) {
  background: rgba(255,229,0,0.14);
  border-color: rgba(255,229,0,0.42);
}

.cb-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px rgba(255,229,0,0.34), 0 0 0 4px rgba(255,229,0,0.08);
}

.cb-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.cb-code {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255,255,255,0.65);
  word-break: break-all;
}

.cb-lobby-box {
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.018) 100%);
  padding: 14px;
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
}

.cb-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.025);
  clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%);
  transition: border-color 0.14s, background 0.14s;
}

.cb-slot:hover {
  border-color: rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.035);
}

.cb-btn-launch {
  display: block;
  width: 100%;
  padding: 14px 0;
  font-weight: 900;
  font-size: 13px;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: #060610;
  background: #FFE500;
  clip-path: polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%);
  border: none;
  cursor: pointer;
  transition: transform 0.14s, box-shadow 0.18s, background 0.14s, filter 0.14s;
}

.cb-btn-launch:hover {
  background: #ffffff;
  box-shadow: 0 0 32px rgba(255,229,0,0.52), 0 0 64px rgba(255,229,0,0.18);
  transform: translateY(-1px);
  filter: brightness(1.02);
}

.cb-btn-launch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px rgba(255,229,0,0.4), 0 0 0 5px rgba(255,229,0,0.08), 0 0 32px rgba(255,229,0,0.35);
}

.cb-btn-launch:active,
.cb-chip-interactive:active,
.cb-chip-cta:active,
.cb-mode-btn:active {
  transform: translateY(0);
}

.cb-bottom-hud {
  background: rgba(6,6,10,0.97);
  border-top: 1px solid rgba(0,229,255,0.18);
  clip-path: polygon(0 8px, 100% 0, 100% 100%, 0 100%);
}

.cb-hud-card {
  background: linear-gradient(180deg, rgba(13,13,20,0.96) 0%, rgba(8,8,12,0.95) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 12px;
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
}

.cb-score-chip {
  background: rgba(8,8,12,0.94);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 8px 10px;
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  backdrop-filter: blur(8px);
}

.launch-hud-wrap {
  filter: drop-shadow(0 16px 36px rgba(0, 0, 0, 0.38));
}

.launch-hud {
  background: linear-gradient(180deg, rgba(9,9,14,0.96) 0%, rgba(6,6,10,0.92) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 8px 14px 7px;
  clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  backdrop-filter: blur(12px);
  transition: opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease;
}

.launch-hud.is-locked {
  opacity: 0.64;
  filter: saturate(0.88);
}

.launch-hud-grid {
  align-items: end;
}

.launch-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  padding: 1px 4px;
  border: 1px solid rgba(255,229,0,0.24);
  background: rgba(255,229,0,0.08);
  color: #ffe500;
  font-weight: 900;
  clip-path: polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%);
}

.launch-key.is-active {
  border-color: rgba(255,229,0,0.44);
  background: rgba(255,229,0,0.16);
  box-shadow: inset 0 0 14px rgba(255,229,0,0.08), 0 0 14px rgba(255,229,0,0.14);
}

.launch-lane {
  position: relative;
  height: 9px;
  background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.08) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
  overflow: hidden;
}

.launch-window {
  position: absolute;
  inset: 2px auto 2px 0;
  background: linear-gradient(90deg, rgba(255,229,0,0.18) 0%, rgba(255,229,0,0.42) 100%);
  box-shadow: 0 0 18px rgba(255,229,0,0.24);
}

.launch-window-charge {
  background: linear-gradient(90deg, rgba(0,229,255,0.16) 0%, rgba(255,255,255,0.26) 100%);
  box-shadow: 0 0 18px rgba(0,229,255,0.18);
}

.launch-fill {
  position: absolute;
  inset: 2px auto 2px 2px;
  background: linear-gradient(90deg, #00e5ff 0%, #ffe500 88%);
  box-shadow: 0 0 16px rgba(0,229,255,0.24);
}

.launch-target-tag {
  position: absolute;
  top: -14px;
  height: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  font-size: 6px;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: rgba(255, 229, 0, 0.88);
  background: rgba(255, 229, 0, 0.08);
  border: 1px solid rgba(255, 229, 0, 0.24);
  clip-path: polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%);
}

.launch-target-tag-charge {
  color: rgba(125, 249, 255, 0.92);
  background: rgba(0, 229, 255, 0.08);
  border-color: rgba(0, 229, 255, 0.24);
}

.launch-lane-note-row {
  margin-top: 2px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 6px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.24);
}

.launch-cursor {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 4px;
  margin-left: -2px;
  background: #ffffff;
  box-shadow: 0 0 16px rgba(255,255,255,0.58);
}

.launch-cursor.is-locked {
  background: #ffe500;
  box-shadow: 0 0 18px rgba(255,229,0,0.7);
}

.launch-grade-card {
  min-width: 176px;
  text-align: left;
  padding: 12px 15px;
  background: rgba(5,5,10,0.94);
  border: 1px solid rgba(255,255,255,0.08);
  clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  backdrop-filter: blur(12px);
  transform: translate(-50%, calc(-100% - 18px));
}

.cb-local-pointer {
  position: absolute;
  z-index: 27;
  pointer-events: none;
  display: flex;
  align-items: center;
  transform: translate(-50%, -100%);
}

.cb-local-pointer-chevron {
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 9px solid color-mix(in srgb, var(--cb-pointer-accent) 78%, white 22%);
  opacity: 0.82;
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--cb-pointer-accent) 28%, transparent));
  animation: cb-pointer-bob 1.1s ease-in-out infinite alternate;
}

@keyframes cb-pointer-bob {
  from { transform: translateY(0); }
  to { transform: translateY(3px); }
}

.session-intermission-card {
  width: min(760px, calc(100% - 2rem));
  padding: 22px 24px;
  text-align: center;
  background: linear-gradient(180deg, rgba(8, 8, 12, 0.98) 0%, rgba(5, 5, 10, 0.96) 100%);
  border: 1px solid rgba(255,255,255,0.08);
  clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  box-shadow: 0 0 0 1px rgba(255,229,0,0.08), 0 24px 60px rgba(0,0,0,0.42);
  backdrop-filter: blur(16px);
}

.session-blade-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 102px;
  padding: 10px 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.session-blade-btn:hover {
  transform: translateY(-1px);
  background: rgba(255,255,255,0.045);
}

.session-blade-btn.is-selected {
  background: rgba(255,255,255,0.06);
}

.cb-ring-field {
  background:
    radial-gradient(circle at 50% 50%, rgba(72,48,182,0.10) 0%, rgba(5,5,8,0) 34%),
    radial-gradient(circle at 50% 50%, rgba(0,229,255,0.06) 0%, rgba(5,5,8,0) 58%);
}

.cb-ring {
  will-change: transform, opacity;
  transform-origin: 50% 50%;
}

.cb-ring-outer {
  animation: cb-spin-reverse 32s linear infinite;
}

.cb-ring-mid {
  animation: cb-spin-slow 24s linear infinite;
}

.cb-ring-inner {
  animation: cb-spin-reverse 16s linear infinite;
}

.cb-ring-dashed {
  animation: cb-spin-slow 10s linear infinite;
}

@keyframes cb-spin-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes cb-spin-reverse {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

.cb-bar-cyan   { height:100%; transition:width 80ms linear; }
.cb-bar-yellow { height:100%; background:#FFE500; transition:width 80ms linear; box-shadow:0 0 6px rgba(255,229,0,0.68),0 0 14px rgba(255,229,0,0.22); }

.cb-tag {
  clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
  padding: 3px 12px 3px 8px;
  font-weight: 900;
  font-size: 8px;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  display: inline-block;
}

.cb-spotlight {
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
  transition: box-shadow 0.25s;
}

.countdown-num {
  font-size: clamp(5rem, 14vw, 10rem);
  color: #FFE500;
  text-shadow: 0 0 60px rgba(255,229,0,0.7), 0 0 120px rgba(255,229,0,0.3);
}

.countdown-go {
  font-size: clamp(4rem, 10vw, 7.5rem);
  color: #00E5FF;
  letter-spacing: 0.05em;
  text-shadow: 0 0 60px rgba(0,229,255,0.75), 0 0 120px rgba(0,229,255,0.3);
}

.cd-pop-enter-active { animation: cd-pop-in 0.18s cubic-bezier(0.34,1.56,0.64,1); }
.cd-pop-leave-active { animation: cd-pop-out 0.12s ease-in; }
@keyframes cd-pop-in  { from { opacity:0; transform:scale(0.55); } to { opacity:1; transform:scale(1); } }
@keyframes cd-pop-out { from { opacity:1; transform:scale(1); } to { opacity:0; transform:scale(1.3); } }

.cb-result-card {
  background: rgba(5,5,10,0.96);
  border: 1px solid rgba(255,255,255,0.08);
  border-top-width: 3px;
  clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  padding: 28px 64px;
  backdrop-filter: blur(12px);
}

.cb-result-enter-active { animation: cb-result-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
.cb-result-leave-active { animation: cb-result-out 0.22s ease-in; }
@keyframes cb-result-in  { from { opacity:0; transform:scale(0.82) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
@keyframes cb-result-out { from { opacity:1; } to { opacity:0; } }

.launch-grade-pop-enter-active { animation: launch-grade-in 0.18s ease-out; }
.launch-grade-pop-leave-active { animation: launch-grade-out 0.16s ease-in; }
@keyframes launch-grade-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes launch-grade-out { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-6px); } }

.spotlight-enter-active { animation: spotlight-in 0.2s ease-out; }
@keyframes spotlight-in  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>