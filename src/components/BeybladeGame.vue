<script setup>
import { ref, watch } from 'vue'
import { BUILD_DEFS } from '../data/buildDefs.js'
import { useBeybladeSimulation } from '../composables/useBeybladeSimulation.js'
import snowverLogo from '../assets/snowverpowered.png'
import { Zap, Anvil, Heart } from 'lucide-vue-next'

// mountRef is the only thing the component owns — it's the Three.js canvas container
const mountRef = ref(null)

const {
  selectedBuild,
  gamePhase,
  status,
  roundScore,
  playerHud,
  cpuHud,
  buildEntries,
  roundResult,
  countdown,
  aimAngle,
} = useBeybladeSimulation(mountRef)

// displayBuild lags behind selectedBuild so card content stays frozen during leave animation
const displayBuild = ref(selectedBuild.value)
const cardVisible = ref(true)
watch(selectedBuild, () => { cardVisible.value = false })
function onSpotlightAfterLeave() {
  displayBuild.value = selectedBuild.value
  cardVisible.value = true
}

const controlsList = [
  ['A / D', 'Aim before launch'],  ['SPACE', 'Hold to charge power (before launch)'],  ['WASD', 'Drift in combat'],
  ['SHIFT', 'Burst dash'],
  ['E', 'Stabilise / reduce wobble'],
  ['Q', 'Ultimate (full meter)'],
]
</script>

<template>
  <!--
    Root: full viewport, always black. flex-col so menu mode header + body stack,
    battle mode uses absolute children and the h-screen keeps the root anchored.
  -->
  <div class="relative flex flex-col w-screen h-screen overflow-hidden bg-[#050508] text-white select-none">

    <!-- Mobile block -->
    <div class="md:hidden absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050508] text-center px-8">
      <div class="text-[#FFE500] font-black uppercase text-2xl tracking-widest mb-3">Desktop Only</div>
      <div class="text-white/40 text-sm leading-relaxed">CLASHBLADES requires a keyboard.<br>Please open on a desktop browser.</div>
    </div>

    <!-- All game content — hidden on mobile -->
    <div class="hidden md:contents">

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- BATTLE MODE — canvas fills viewport, HUD bars float over   -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <template v-if="gamePhase === 'battle'">

      <!-- Three.js canvas mount -->
      <div ref="mountRef" class="absolute inset-0 z-0" />

      <!-- Radial arena grid overlay removed -->

      <!-- Top esports HUD ribbon — same dimensions as menu header -->
      <div class="absolute top-0 inset-x-0 z-20 h-[70px]" style="clip-path: polygon(0 0, 100% 0, 100% 54px, 0 70px)">
        <!-- Dark base layer -->
        <div class="absolute inset-0 bg-[#0a0a0a]/92"></div>

        <!-- Logo panel — yellow trapezoid anchored left, right edge ~33° cut -->
        <div
          class="absolute left-0 top-0 h-full w-[300px] bg-[#FFE500]"
          style="clip-path: polygon(0% 0%, 100% 0%, 83% 100%, 0% 100%)"
        >
          <div class="h-full flex items-center pl-5 pr-20">
            <div class="flex flex-col leading-none gap-[3px]">
              <span class="font-black text-[#0a0a0a] text-[8px] uppercase tracking-[0.55em] opacity-60">Best of 3</span>
              <span class="font-black text-[#0a0a0a] text-[19px] uppercase tracking-tight leading-none">ClashBlades</span>
            </div>
          </div>
        </div>

        <!-- Cyan accent parallelogram — bridges logo into center -->
        <div
          class="absolute top-0 h-full w-[88px] bg-[#00E5FF]"
          style="left: 255px; clip-path: polygon(40% 0%, 100% 0%, 60% 100%, 0% 100%)"
        ></div>

        <!-- Purple accent parallelogram -->
        <div
          class="absolute top-0 h-full w-[70px] bg-[#B800FF]"
          style="left: 324px; clip-path: polygon(40% 0%, 100% 0%, 60% 100%, 0% 100%)"
        ></div>

        <!-- Round label — floating, centered -->
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span class="text-[10px] uppercase tracking-[0.5em] text-white/35">
            Round <span class="text-[#FFE500] font-black text-sm ml-1">{{ roundScore.round }}</span>
          </span>
        </div>

        <!-- Score panel — dark trapezoid anchored right, left edge ~33° cut -->
        <div
          class="absolute right-0 top-0 h-full w-[280px]"
          style="background: #0e0822; clip-path: polygon(17% 0%, 100% 0%, 100% 100%, 0% 100%)"
        >
          <div class="h-full flex items-center justify-end pr-6 pl-20">
            <div class="flex flex-col items-end leading-none gap-[3px]">
              <span class="text-[8px] uppercase tracking-[0.4em] text-white/35">Score</span>
              <div class="font-black text-[27px] tracking-tight leading-none">
                <span class="text-[#00E5FF]">{{ roundScore.player }}</span>
                <span class="mx-2 text-white/20 text-sm">—</span>
                <span class="text-[#FF2D78]">{{ roundScore.cpu }}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Bottom HUD bar — angled top edge, neon glow bars -->
      <div class="absolute bottom-0 inset-x-0 z-20 flex items-stretch cb-bottom-hud">

        <!-- Player -->
        <div class="flex-1 px-5 py-3 border-r border-white/[0.07]">
          <div class="flex items-center gap-2.5 mb-2.5">
            <span class="cb-tag" style="background:#00E5FF;color:#060610">Player</span>
            <div class="w-2 h-2 flex-shrink-0" :style="{ background: BUILD_DEFS[playerHud.build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
            <span class="text-[11px] font-black uppercase tracking-[0.12em]">{{ BUILD_DEFS[playerHud.build].name }}</span>
          </div>
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-[8px] uppercase tracking-widest text-white/28 w-7">Spin</span>
            <div class="flex-1 h-[3px] bg-white/[0.07] overflow-hidden">
              <div class="cb-bar-cyan" :style="{ width: `${Math.max(0, Math.min(100, playerHud.spin))}%` }" />
            </div>
            <span class="text-[8px] font-mono text-white/28 w-6 text-right">{{ playerHud.spin.toFixed(0) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[8px] uppercase tracking-widest w-7 flex-shrink-0" :style="{ color: playerHud.special >= 100 ? '#FFE500' : 'rgba(255,229,0,0.4)' }">ULT</span>
            <div class="flex-1 h-[3px] bg-white/[0.07] overflow-hidden">
              <div class="cb-bar-yellow" :style="{ width: `${playerHud.special}%` }" />
            </div>
            <span v-if="playerHud.special >= 100" class="cb-ult-badge">READY</span>
            <span v-else class="text-[8px] font-mono text-white/28 w-6 text-right">{{ playerHud.special.toFixed(0) }}%</span>
          </div>
        </div>

        <!-- Center status -->
        <div class="w-56 flex-shrink-0 flex flex-col items-center justify-center px-4 py-2 border-r border-white/[0.07]">
          <div class="text-[7px] uppercase tracking-[0.55em] text-white/18 mb-1">Arena</div>
          <div class="text-[10px] text-white/65 text-center leading-snug">{{ status }}</div>
        </div>

        <!-- CPU -->
        <div class="flex-1 px-5 py-3">
          <div class="flex items-center justify-end gap-2.5 mb-2.5">
            <span class="text-[11px] font-black uppercase tracking-[0.12em]">{{ BUILD_DEFS[cpuHud.build].name }}</span>
            <div class="w-2 h-2 flex-shrink-0" :style="{ background: BUILD_DEFS[cpuHud.build].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
            <span class="cb-tag" style="background:#FF2D78;color:#060610">CPU</span>
          </div>
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-[8px] font-mono text-white/28 w-6">{{ cpuHud.spin.toFixed(0) }}</span>
            <div class="flex-1 h-[3px] bg-white/[0.07] overflow-hidden">
              <div class="cb-bar-pink" :style="{ width: `${Math.max(0, Math.min(100, cpuHud.spin))}%` }" />
            </div>
            <span class="text-[8px] uppercase tracking-widest text-white/28 w-7 text-right">Spin</span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="cpuHud.special >= 100" class="cb-ult-badge">READY</span>
            <span v-else class="text-[8px] font-mono text-white/28 w-6">{{ cpuHud.special.toFixed(0) }}%</span>
            <div class="flex-1 h-[3px] bg-white/[0.07] overflow-hidden">
              <div class="cb-bar-yellow" :style="{ width: `${cpuHud.special}%` }" />
            </div>
            <span class="text-[8px] uppercase tracking-widest w-7 text-right flex-shrink-0" :style="{ color: cpuHud.special >= 100 ? '#FFE500' : 'rgba(255,229,0,0.4)' }">ULT</span>
          </div>
        </div>

      </div>

      <!-- Countdown overlay (shown during aiming phase) -->
      <div v-if="countdown !== null" class="absolute inset-0 z-25 pointer-events-none" style="z-index:25">
        <!-- Countdown number -->
        <div class="absolute inset-0 flex items-center justify-center">
          <Transition name="cd-pop" mode="out-in">
            <div
              :key="countdown"
              class="font-black leading-none select-none"
              :class="countdown === 0 ? 'countdown-go' : 'countdown-num'"
            >{{ countdown === 0 ? 'GO!' : countdown }}</div>
          </Transition>
        </div>
      </div>
      <Transition name="cb-result">
        <div v-if="roundResult" class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            class="cb-result-card text-center"
            :style="{ borderTopColor: roundResult.winner === 'player' ? '#00E5FF' : '#FF2D78' }"
          >
            <div class="text-[8px] uppercase tracking-[0.6em] text-white/40 mb-2">{{ roundResult.isMatchOver ? 'Match Over' : 'Round Over' }}</div>
            <div
              class="text-[clamp(2rem,4vw,3rem)] font-black uppercase leading-none tracking-tight mb-2"
              :style="{ color: roundResult.winner === 'player' ? '#00E5FF' : '#FF2D78', textShadow: roundResult.winner === 'player' ? '0 0 40px rgba(0,229,255,0.7)' : '0 0 40px rgba(255,45,120,0.7)' }"
            >{{ roundResult.type }}</div>
            <div
              class="text-[0.95rem] font-black uppercase tracking-[0.22em]"
              :style="{ color: roundResult.winner === 'player' ? '#00E5FF' : '#FF2D78' }"
            >{{ roundResult.outcome }}</div>
          </div>
        </div>
      </Transition>
    </template>
    <template v-else>

      <!-- Header — esports HUD ribbon (same shape as battle header) -->
      <header class="relative flex-shrink-0 h-[70px] z-10" style="clip-path: polygon(0 0, 100% 0, 100% 54px, 0 70px)">
        <!-- Dark base -->
        <div class="absolute inset-0 bg-[#0a0a0a]/92"></div>

        <!-- Logo panel — yellow trapezoid anchored left -->
        <div
          class="absolute left-0 top-0 h-full w-[300px] bg-[#FFE500]"
          style="clip-path: polygon(0% 0%, 100% 0%, 83% 100%, 0% 100%)"
        >
          <div class="h-full flex items-center pl-5 pr-20">
            <div class="flex flex-col leading-none gap-[3px]">
              <span class="font-black text-[#0a0a0a] text-[8px] uppercase tracking-[0.55em] opacity-60">Tournament Edition</span>
              <span class="font-black text-[#0a0a0a] text-[19px] uppercase tracking-tight leading-none">ClashBlades</span>
            </div>
          </div>
        </div>

        <!-- Cyan accent parallelogram -->
        <div
          class="absolute top-0 h-full w-[88px] bg-[#00E5FF]"
          style="left: 255px; clip-path: polygon(40% 0%, 100% 0%, 60% 100%, 0% 100%)"
        ></div>

        <!-- Purple accent parallelogram -->
        <div
          class="absolute top-0 h-full w-[70px] bg-[#B800FF]"
          style="left: 324px; clip-path: polygon(40% 0%, 100% 0%, 60% 100%, 0% 100%)"
        ></div>

      </header>

      <!-- Body: sidebar + main panel -->
      <div class="flex flex-1 overflow-hidden">

        <!-- Left sidebar: build select -->
        <aside class="w-[340px] flex-shrink-0 flex flex-col overflow-y-auto" style="background:#050508">

          <div class="h-4 flex-shrink-0" />
          <!-- Section header — cyan diagonal trapezoid -->
          <div class="bg-[#00E5FF] px-5 pt-4 pb-3 flex-shrink-0" style="clip-path:polygon(0 0,100% 0,92% 100%,0 100%)">
            <div class="text-[7px] uppercase tracking-[0.6em] text-[#060610]/55 mb-0.5">Select Build</div>
            <div class="text-[17px] font-black uppercase tracking-tight text-[#060610] leading-none">Blade Select</div>
          </div>

          <!-- Build cards -->
          <div class="px-3 pt-3 flex flex-col gap-1.5">
            <button
              v-for="build in buildEntries"
              :key="build.key"
              @click="selectedBuild = build.key"
              class="cb-card p-3"
              :class="{ 'is-selected': selectedBuild === build.key }"
              :style="{ borderLeftColor: selectedBuild === build.key ? build.color : 'transparent' }"
            >
              <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 flex-shrink-0" :style="{ background: build.color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                  <span class="font-black uppercase tracking-[0.1em] text-[13px]">{{ build.name }}</span>
                </div>
                <span
                  class="text-[7px] uppercase tracking-[0.3em] font-bold px-1.5 py-0.5 leading-tight flex-shrink-0"
                  :style="selectedBuild === build.key
                    ? { color: build.color, border: `1px solid ${build.color}`, background: build.color + '1a', clipPath: 'polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)' }
                    : { color: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.1)', clipPath: 'polygon(4px 0%,100% 0%,calc(100% - 4px) 100%,0% 100%)' }"
                >{{ selectedBuild === build.key ? 'Selected' : build.specialName }}</span>
              </div>
              <div class="text-[10px] text-white/32 leading-relaxed">{{ build.description }}</div>
              <div v-if="selectedBuild === build.key" class="mt-3 space-y-1.5 border-t border-white/[0.06] pt-2.5">
                <div
                  v-for="({ icon, val }) in [
                    { icon: Zap,   val: build.stats.speed },
                    { icon: Anvil, val: build.stats.weight },
                    { icon: Heart, val: build.stats.stamina },
                  ]" :key="val"
                  class="flex items-center gap-2.5"
                >
                  <component :is="icon" class="w-4 h-4 flex-shrink-0 text-white/30" :stroke-width="2" />
                  <div class="flex-1 h-[2px]" style="background:rgba(255,255,255,0.07)">
                    <div class="h-full" :style="{ width: Math.round(val / 1.5 * 100) + '%', background: build.color, boxShadow: `0 0 5px ${build.color}88` }" />
                  </div>
                  <div class="flex gap-[3px] flex-shrink-0">
                    <div
                      v-for="n in 5" :key="n"
                      class="w-[5px] h-[5px]"
                      :style="{ background: n <= Math.round(val / 1.5 * 5) ? build.color : 'rgba(255,255,255,0.10)', clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }"
                    />
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div class="flex-1" />

          <!-- Launch button -->
          <div class="px-4 pt-4 pb-3">
            <button
              @click="roundScore = { player: 0, cpu: 0, round: 1 }; gamePhase = 'battle'"
              class="cb-btn-launch"
            >Launch Match</button>
          </div>

          <!-- Controls -->
          <div class="px-3 pb-5">
            <div class="p-3" style="clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.018)">
              <div class="text-[7px] uppercase tracking-[0.58em] text-[#FFE500]/45 mb-2.5">Controls</div>
              <div class="space-y-1.5">
                <div v-for="[key, action] in controlsList" :key="key" class="flex items-center justify-between gap-3">
                  <span
                    class="font-mono text-[#FFE500] text-[8px] uppercase tracking-wider whitespace-nowrap px-2 py-0.5 flex-shrink-0"
                    style="background:rgba(255,229,0,0.08);border:1px solid rgba(255,229,0,0.22);clip-path:polygon(5px 0%,100% 0%,calc(100% - 5px) 100%,0% 100%)"
                  >{{ key }}</span>
                  <span class="text-[9px] text-white/28 text-right">{{ action }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Snowver footer -->
          <div class="px-4 pb-4 pt-2 flex items-center justify-center gap-3">
            <span class="text-[13px] text-white/60">by</span>
            <img :src="snowverLogo" alt="Snowverpowered" class="h-10 w-auto" />
          </div>

        </aside>

        <!-- Right panel: title + selected build spotlight -->
        <main class="flex-1 relative overflow-hidden" style="background:#050508">

          <!-- Decorative concentric rings — enhanced multi-color -->
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div class="w-[640px] h-[640px] rounded-full" style="border:1px solid rgba(184,0,255,0.10)"/>
            <div class="absolute w-[460px] h-[460px] rounded-full" style="border:1px solid rgba(0,229,255,0.13)"/>
            <div class="absolute w-[290px] h-[290px] rounded-full" style="border:1px solid rgba(255,229,0,0.17)"/>
            <div class="absolute w-[148px] h-[148px] rounded-full animate-spin" style="border:1.5px dashed rgba(255,229,0,0.22);animation-duration:18s"/>
          </div>


          <!-- Content -->
          <div class="relative z-10 h-full flex flex-col items-center justify-center px-12 text-center">

            <h1 class="font-black uppercase leading-none tracking-[-0.02em] mb-8">
              <span class="block text-[clamp(3.5rem,7vw,6.5rem)] text-[#FFE500]" style="text-shadow:0 0 40px rgba(255,229,0,0.45),0 0 80px rgba(255,229,0,0.18)">CLASH</span>
              <span class="block text-[clamp(3.5rem,7vw,6.5rem)] text-[#FFE500]" style="text-shadow:0 0 40px rgba(255,229,0,0.38),0 0 80px rgba(255,229,0,0.15)">BLADES</span>
            </h1>

            <!-- Selected build spotlight card -->
            <Transition name="spotlight" @after-leave="onSpotlightAfterLeave">
            <div
              v-if="cardVisible"
              class="w-full max-w-[460px] text-left cb-spotlight"
              :style="{
                background: 'rgba(10,10,16,0.94)',
                border: '1px solid rgba(255,255,255,0.09)',
                borderLeft: `3px solid ${BUILD_DEFS[displayBuild].color}`,
                boxShadow: `0 0 0 1px ${BUILD_DEFS[displayBuild].color}28,0 0 36px ${BUILD_DEFS[displayBuild].color}16,inset 0 0 24px ${BUILD_DEFS[displayBuild].color}0a`
              }"
            >
              <div class="h-[2px]" :style="{ background: `linear-gradient(90deg,${BUILD_DEFS[displayBuild].color},${BUILD_DEFS[displayBuild].color}00)` }" />
              <div class="p-5">
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-5 h-5 flex-shrink-0" :style="{ background: BUILD_DEFS[displayBuild].color, clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)' }" />
                  <span class="font-black uppercase tracking-[0.18em] text-sm">{{ BUILD_DEFS[displayBuild].name }}</span>
                  <div
                    class="ml-auto px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.3em]"
                    :style="{ color: BUILD_DEFS[displayBuild].color, border: `1px solid ${BUILD_DEFS[displayBuild].color}55`, background: BUILD_DEFS[displayBuild].color + '14', clipPath: 'polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)' }"
                  >{{ BUILD_DEFS[displayBuild].specialName }}</div>
                </div>
                <p class="text-[11px] text-white/40 leading-relaxed">{{ BUILD_DEFS[displayBuild].description }}</p>
                <p class="text-[10px] mt-2" :style="{ color: BUILD_DEFS[displayBuild].color + 'aa' }">▸ {{ BUILD_DEFS[displayBuild].specialDescription }}</p>
              </div>
            </div>
            </Transition>

          </div>
        </main>

      </div>
    </template>

    </div><!-- end md:contents wrapper -->

  </div>
</template>

<style scoped>
/* ─── Build card ─────────────────────────────────────────── */
.cb-card {
  background: #0d0d12;
  border: 1px solid rgba(255,255,255,0.06);
  border-left-width: 3px;
  clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%);
  transition: background 0.12s, box-shadow 0.16s, transform 0.22s cubic-bezier(0.34,1.56,0.64,1), max-height 0.3s ease;
  cursor: pointer;
  width: 100%;
  text-align: left;
}
.cb-card:hover {
  background: #12121c;
  box-shadow: inset 0 0 20px rgba(0,229,255,0.04);
}
.cb-card.is-selected {
  background: #10101a;
  transform: scaleX(1.015);
  box-shadow:
    inset 0 0 28px rgba(255,255,255,0.03),
    0 0 0 1px rgba(255,255,255,0.07);
}

/* ─── Launch button ───────────────────────────────────── */
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
  overflow: hidden;
  position: relative;
  transition: background 0.12s, box-shadow 0.16s, transform 0.08s;
}
.cb-btn-launch::after {
  content: '';
  position: absolute;
  top: 0; left: -120%;
  width: 80%; height: 100%;
  background: linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.55) 50%, transparent 80%);
  animation: btn-shine 3.4s ease-in-out infinite;
}
@keyframes btn-shine {
  0%   { left: -120%; }
  35%  { left: 140%; }
  100% { left: 140%; }
}
.cb-btn-launch:hover {
  background: #ffffff;
  box-shadow: 0 0 32px rgba(255,229,0,0.52), 0 0 64px rgba(255,229,0,0.18);
}
.cb-btn-launch:active {
  transform: scaleY(0.95);
}

/* ─── Glowing bar fills ───────────────────────────────── */
.cb-bar-cyan   { height:100%; background:#00E5FF; transition:width 80ms linear; box-shadow:0 0 8px rgba(0,229,255,0.75),0 0 18px rgba(0,229,255,0.28); }
.cb-bar-pink   { height:100%; background:#FF2D78; transition:width 80ms linear; box-shadow:0 0 8px rgba(255,45,120,0.75),0 0 18px rgba(255,45,120,0.28); }
.cb-bar-yellow { height:100%; background:#FFE500; transition:width 80ms linear; box-shadow:0 0 6px rgba(255,229,0,0.68),0 0 14px rgba(255,229,0,0.22); }

/* ─── Angular HUD tag chip ────────────────────────────── */
.cb-tag {
  clip-path: polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%);
  padding: 3px 12px 3px 8px;
  font-weight: 900;
  font-size: 8px;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  display: inline-block;
  flex-shrink: 0;
}

/* ─── Bottom HUD — angled top edge ──────────────────────── */
.cb-bottom-hud {
  background: rgba(6,6,10,0.97);
  border-top: 1px solid rgba(0,229,255,0.18);
  clip-path: polygon(0 8px, 100% 0, 100% 100%, 0 100%);
}

/* ─── Spotlight card — angular chamfered corners ────────────── */
.cb-spotlight {
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
  transition: box-shadow 0.25s;
}

/* ─── Stat cell ────────────────────────────────────────── */
.cb-stat {
  clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 0 100%);
  background: #08080e;
  border: 1px solid rgba(255,255,255,0.07);
  padding: 7px 4px;
  text-align: center;
}/* ─── Countdown overlay ─────────────────────────────────── */
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
/* ─── Round result overlay ───────────────────────────────── */
.cb-result-card {
  background: rgba(5,5,10,0.96);
  border: 1px solid rgba(255,255,255,0.08);
  border-top-width: 3px;
  clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
  padding: 28px 64px;
  backdrop-filter: blur(12px);
}
.cb-result-enter-active { animation: cb-result-in  0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
.cb-result-leave-active { animation: cb-result-out 0.22s ease-in; }
@keyframes cb-result-in  { from { opacity:0; transform:scale(0.82) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
@keyframes cb-result-out { from { opacity:1; } to { opacity:0; } }

/* ─── Spotlight card transition ─────────────────────────── */
.spotlight-enter-active { animation: spotlight-in 0.2s ease-out; }
@keyframes spotlight-in  { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* ─── ULT READY badge ────────────────────────────────────── */
.cb-ult-badge {
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #060610;
  background: #FFE500;
  clip-path: polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%);
  padding: 2px 8px 2px 5px;
  flex-shrink: 0;
  animation: ult-pulse 0.7s ease-in-out infinite alternate;
}
@keyframes ult-pulse {
  from { box-shadow: 0 0 6px rgba(255,229,0,0.9); }
  to   { box-shadow: 0 0 18px rgba(255,229,0,1), 0 0 36px rgba(255,229,0,0.5); }
}
</style>
