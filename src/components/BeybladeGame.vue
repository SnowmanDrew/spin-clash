<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { BUILD_DEFS } from '../data/buildDefs.js'
import { useRoomConnection } from '../composables/useRoomConnection.js'
import { useBeybladeSimulation } from '../composables/useBeybladeSimulation.js'
import snowverLogo from '../assets/snowverpowered.png'
import { Anvil, Copy, Heart, Link2, Play, Radio, Users, Wifi, WifiOff, Zap } from 'lucide-vue-next'

const mountRef = ref(null)
const roomApi = useRoomConnection()

const {
  selectedBuild,
  menuMode,
  gamePhase,
  status,
  scoreboard,
  hudPlayers,
  buildEntries,
  roundResult,
  countdown,
  launchSinglePlayerMatch,
  returnToMenu,
} = useBeybladeSimulation(mountRef, roomApi)

const displayBuild = ref(selectedBuild.value)
const cardVisible = ref(true)
const playerAlias = ref('Blader')
const joinCode = ref('')
const copyState = ref('')

watch(selectedBuild, () => {
  cardVisible.value = false
})

watch(playerAlias, (name) => {
  if (roomApi.room.value) {
    roomApi.updateProfile({ name, build: selectedBuild.value })
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
const shareUrl = computed(() => roomApi.shareUrl.value)
const roomError = computed(() => roomApi.errorMessage.value)
const isHost = computed(() => roomApi.isHost.value)
const connectionState = computed(() => roomApi.connectionState.value)
const localRoomPlayer = computed(() => roomPlayers.value.find((player) => player.id === roomApi.clientId.value) || null)
const allPlayersReady = computed(() => roomPlayers.value.length >= 2 && roomPlayers.value.every((player) => player.ready))
const canStartRoomMatch = computed(() => isHost.value && allPlayersReady.value)
const connectionLabel = computed(() => {
  if (roomApi.connectionState.value === 'connected') return 'Server Online'
  if (roomApi.connectionState.value === 'connecting') return 'Connecting'
  if (roomApi.connectionState.value === 'error') return 'Server Unreachable'
  return 'Offline'
})
const modeLabel = computed(() => menuMode.value === 'online' ? 'Online Room' : 'Single Player')

const controlsList = [
  ['A / D', 'Aim before launch'],
  ['SPACE', 'Hold to charge power'],
  ['WASD', 'Drift in combat'],
  ['SHIFT', 'Burst dash'],
  ['E', 'Stabilise / reduce wobble'],
  ['Q', 'Ultimate when full'],
]

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
  await roomApi.connectAndCreateRoom({ name: playerAlias.value, build: selectedBuild.value })
}

async function joinRoom() {
  if (!joinCode.value.trim()) return
  menuMode.value = 'online'
  await roomApi.connectAndJoinRoom({ roomId: joinCode.value.trim(), name: playerAlias.value, build: selectedBuild.value })
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
  launchSinglePlayerMatch(playerAlias.value.trim() || 'Player')
}

function exitBattle() {
  if (menuMode.value === 'online' && isHost.value) {
    roomApi.sendMatchComplete('Match cancelled.')
  }
  returnToMenu()
}

onMounted(() => {
  const roomId = new URL(window.location.href).searchParams.get('room')
  if (roomId) {
    menuMode.value = 'online'
    joinCode.value = roomId
    roomApi.connectAndJoinRoom({ roomId, name: playerAlias.value, build: selectedBuild.value })
  }
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
                <span class="ml-auto text-[9px] uppercase tracking-[0.22em] text-white/35">{{ BUILD_DEFS[entry.build].name }}</span>
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
          <div class="absolute inset-0 flex items-center justify-center">
            <Transition name="cd-pop" mode="out-in">
              <div :key="countdown" class="font-black leading-none select-none" :class="countdown === 0 ? 'countdown-go' : 'countdown-num'">
                {{ countdown === 0 ? 'GO!' : countdown }}
              </div>
            </Transition>
          </div>
        </div>

        <Transition name="cb-result">
          <div v-if="roundResult" class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
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
                class="cb-card relative overflow-hidden p-3"
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

                <div class="text-[10px] text-white/32 leading-relaxed">{{ build.description }}</div>

                <div v-if="selectedBuild === build.key" class="mt-3 space-y-1.5 border-t border-white/[0.06] pt-2.5">
                  <div v-for="({ icon, val }) in [{ icon: Zap, val: build.stats.speed }, { icon: Anvil, val: build.stats.weight }, { icon: Heart, val: build.stats.stamina }]" :key="icon" class="flex items-center gap-2.5">
                    <component :is="icon" class="w-4 h-4 flex-shrink-0 text-white/30" :stroke-width="2" />
                    <div class="flex-1 h-[2px]" style="background:rgba(255,255,255,0.07)">
                      <div class="h-full" :style="{ width: Math.round(val / 1.5 * 100) + '%', background: build.color, boxShadow: `0 0 5px ${build.color}88` }" />
                    </div>
                  </div>
                </div>
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
                  <span>Online Room</span>
                </button>
              </div>

              <div class="grid w-full max-w-[980px] grid-cols-[minmax(0,460px)_minmax(0,420px)] gap-6 items-start">
                <Transition name="spotlight" @after-leave="onSpotlightAfterLeave">
                  <div v-if="cardVisible" class="text-left cb-spotlight" :style="spotlightStyle(displayBuild)">
                    <div class="h-[2px]" :style="{ background: `linear-gradient(90deg,${BUILD_DEFS[displayBuild].color},${BUILD_DEFS[displayBuild].color}00)` }" />
                    <div class="p-5">
                      <div class="flex items-center gap-3 mb-3">
                        <div class="w-5 h-5 flex-shrink-0" :style="{ background: BUILD_DEFS[displayBuild].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                        <span class="font-black uppercase tracking-[0.18em] text-sm">{{ BUILD_DEFS[displayBuild].name }}</span>
                        <div class="ml-auto px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.3em]" :style="{ color: BUILD_DEFS[displayBuild].color, border: `1px solid ${BUILD_DEFS[displayBuild].color}55`, background: BUILD_DEFS[displayBuild].color + '14', clipPath: 'polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)' }">{{ BUILD_DEFS[displayBuild].specialName }}</div>
                      </div>
                      <p class="text-[11px] text-white/40 leading-relaxed">{{ BUILD_DEFS[displayBuild].description }}</p>
                      <p class="text-[10px] mt-2" :style="{ color: BUILD_DEFS[displayBuild].color + 'aa' }">▸ {{ BUILD_DEFS[displayBuild].specialDescription }}</p>
                    </div>
                  </div>
                </Transition>

                <div class="cb-panel text-left">
                  <div class="flex items-center gap-2 mb-3">
                    <Users class="w-4 h-4 text-[#FFE500]" />
                    <span class="text-[10px] uppercase tracking-[0.4em] text-white/35">{{ modeLabel }}</span>
                  </div>

                  <label class="block mb-3">
                    <span class="cb-label">Name</span>
                    <input v-model="playerAlias" maxlength="24" class="cb-input" placeholder="Enter a name" />
                  </label>

                  <template v-if="menuMode === 'single'">
                    <p class="text-[12px] text-white/45 leading-relaxed mb-4">Keep the local arcade flow exactly as before: one blade, one CPU rival, first to two rounds.</p>
                    <button class="cb-btn-launch" @click="launchSingle">Launch Match</button>
                  </template>

                  <template v-else>
                    <template v-if="!roomId">
                      <p class="text-[12px] text-white/45 leading-relaxed mb-4">Create a room, share the link, and run a host-authoritative free-for-all for up to four players.</p>
                      <div class="grid grid-cols-[1fr_auto] gap-2 mb-3">
                        <input v-model="joinCode" maxlength="12" class="cb-input uppercase" placeholder="Room Code" />
                        <button class="cb-chip cb-chip-cta" :disabled="!joinCode.trim()" @click="joinRoom">
                          <Link2 class="w-3.5 h-3.5" />
                          Join
                        </button>
                      </div>
                      <button class="cb-btn-launch" @click="createRoom">Create Room</button>
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
                            <span class="cb-label">Lobby</span>
                            <span class="text-[10px] uppercase tracking-[0.3em]" :class="isHost ? 'text-[#FFE500]' : 'text-white/35'">{{ isHost ? 'Host' : 'Guest' }}</span>
                          </div>
                          <div class="grid gap-2">
                            <div v-for="slot in 4" :key="slot" class="cb-slot">
                              <template v-if="roomPlayers[slot - 1]">
                                <div class="flex items-center gap-2">
                                  <div class="w-2 h-2" :style="{ background: BUILD_DEFS[roomPlayers[slot - 1].build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                                  <span class="font-black uppercase tracking-[0.12em] text-[11px]">{{ roomPlayers[slot - 1].name }}</span>
                                  <span class="text-[9px] text-white/35 uppercase">{{ BUILD_DEFS[roomPlayers[slot - 1].build].name }}</span>
                                </div>
                                <span class="text-[9px] uppercase tracking-[0.25em]" :class="roomPlayers[slot - 1].ready ? 'text-[#FFE500]' : 'text-white/30'">{{ roomPlayers[slot - 1].ready ? 'Ready' : 'Waiting' }}</span>
                              </template>
                              <template v-else>
                                <span class="text-[10px] uppercase tracking-[0.3em] text-white/25">Open Slot</span>
                              </template>
                            </div>
                          </div>
                        </div>

                        <div class="grid grid-cols-3 gap-2">
                          <button class="cb-chip cb-chip-cta" :disabled="!localRoomPlayer" @click="toggleReady">{{ localRoomPlayer?.ready ? 'Unready' : 'Ready Up' }}</button>
                          <button class="cb-chip cb-chip-cta" :disabled="!canStartRoomMatch" @click="startRoomMatch">Start Match</button>
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

.spotlight-enter-active { animation: spotlight-in 0.2s ease-out; }
@keyframes spotlight-in  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>