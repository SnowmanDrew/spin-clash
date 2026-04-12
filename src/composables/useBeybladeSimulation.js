import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { BUILD_DEFS, CPU_BUILD_ORDER } from '../data/buildDefs.js'
import { createBeybladeMesh } from '../models/beyblades/index.js'
import { useAudio } from './useAudio.js'

const STADIUM = {
  floorY: 0.22,
  flatRadius: 1.85,
  bankRadius: 7.15,
  lipRadius: 8.6,
  outerRadius: 9.55,
  bankHeight: 0.56,
  lipHeight: 1.22,
  outerHeight: -0.08,
  bankGravity: 13.2,
  bladeLift: 0.08,
  tiltScale: 0.36,
  wobbleBankDamping: 0.96,
  ringOutLift: 4.6,
  ringOutDrag: 0.992,
  ringOutGravity: 10.2,
}

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const tmpSurfaceNormal = new THREE.Vector3()
const tmpSpinAxis = new THREE.Vector3()
const tmpBankAxis = new THREE.Vector3()
const tmpSurfaceQuat = new THREE.Quaternion()
const tmpSpinQuat = new THREE.Quaternion()
const tmpWobbleQuatA = new THREE.Quaternion()
const tmpWobbleQuatB = new THREE.Quaternion()
const tmpTumbleQuat = new THREE.Quaternion()
const tmpTumbleAxis = new THREE.Vector3()

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smooth01(t) {
  const u = clamp01(t)
  return u * u * (3 - 2 * u)
}

function mix(a, b, t) {
  return a + (b - a) * t
}

function getStadiumHeight(r) {
  const rc = Math.max(0, r)
  if (rc <= STADIUM.flatRadius) return STADIUM.floorY
  if (rc <= STADIUM.bankRadius) {
    const t = smooth01((rc - STADIUM.flatRadius) / (STADIUM.bankRadius - STADIUM.flatRadius))
    return mix(STADIUM.floorY, STADIUM.bankHeight, t)
  }
  if (rc <= STADIUM.lipRadius) {
    const t = smooth01((rc - STADIUM.bankRadius) / (STADIUM.lipRadius - STADIUM.bankRadius))
    return mix(STADIUM.bankHeight, STADIUM.lipHeight, t)
  }
  if (rc <= STADIUM.outerRadius) {
    const t = smooth01((rc - STADIUM.lipRadius) / (STADIUM.outerRadius - STADIUM.lipRadius))
    return mix(STADIUM.lipHeight, STADIUM.outerHeight, t)
  }
  return STADIUM.outerHeight
}

function getStadiumSlope(r) {
  const eps = 0.04
  const r0 = Math.max(0, r - eps)
  const r1 = r + eps
  return (getStadiumHeight(r1) - getStadiumHeight(r0)) / (r1 - r0)
}

function getSurfaceYAtXZ(x, z, offset = 0) {
  return getStadiumHeight(Math.hypot(x, z)) + offset
}

function getSpawnPoints(count) {
  if (count <= 2) {
    return [
      { x: -4.9, z: 0, angle: 0 },
      { x: 4.9, z: 0, angle: Math.PI },
    ]
  }

  const radius = count === 3 ? 4.9 : 5.25
  return Array.from({ length: count }, (_, index) => {
    const angle = (-Math.PI / 2) + (index / count) * Math.PI * 2
    return {
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      angle: angle + Math.PI,
    }
  })
}

function serialiseInput(input) {
  return {
    aimLeft: Boolean(input.aimLeft),
    aimRight: Boolean(input.aimRight),
    charge: Boolean(input.charge),
    moveX: Math.max(-1, Math.min(1, Number(input.moveX || 0))),
    moveZ: Math.max(-1, Math.min(1, Number(input.moveZ || 0))),
    burst: Boolean(input.burst),
    stabilise: Boolean(input.stabilise),
    special: Boolean(input.special),
  }
}

export function useBeybladeSimulation(mountRef, roomApi = null) {
  const { beep, noiseBurst } = useAudio()

  const selectedBuild = ref('attack')
  const menuMode = ref('single')
  const gamePhase = ref('menu')
  const status = ref('Choose your blade, then launch into battle.')
  const scoreboard = ref([])
  const hudPlayers = ref([])
  const roundResult = ref(null)
  const countdown = ref(null)
  const aimAngle = ref(0)
  const buildEntries = computed(() => Object.values(BUILD_DEFS))

  let runtime = null
  let cpuMatchBuildIdx = 0
  let keyCleanup = null
  const pressedKeys = new Set()
  const queuedActions = { special: false }

  function readLocalInput() {
    const input = {
      aimLeft: pressedKeys.has('KeyA'),
      aimRight: pressedKeys.has('KeyD'),
      charge: pressedKeys.has('Space'),
      moveX: (pressedKeys.has('KeyD') ? 1 : 0) - (pressedKeys.has('KeyA') ? 1 : 0),
      moveZ: (pressedKeys.has('KeyS') ? 1 : 0) - (pressedKeys.has('KeyW') ? 1 : 0),
      burst: pressedKeys.has('ShiftLeft') || pressedKeys.has('ShiftRight'),
      stabilise: pressedKeys.has('KeyE'),
      special: queuedActions.special,
    }
    queuedActions.special = false
    return input
  }

  function attachKeyListeners() {
    if (keyCleanup || typeof window === 'undefined') return

    const onKeyDown = (event) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
      pressedKeys.add(event.code)
      if (event.code === 'KeyQ') queuedActions.special = true
    }

    const onKeyUp = (event) => {
      pressedKeys.delete(event.code)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    keyCleanup = () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      pressedKeys.clear()
      keyCleanup = null
    }
  }

  function updateHud(runtimeState) {
    hudPlayers.value = runtimeState.participants.map((participant) => {
      const blade = runtimeState.bladesById.get(participant.id)
      return {
        id: participant.id,
        name: participant.name,
        build: participant.build,
        isLocal: participant.id === runtimeState.localPlayerId,
        isCpu: participant.kind === 'cpu',
        spin: blade ? blade.spin : 0,
        special: blade ? blade.special : 0,
        alive: blade ? blade.alive : false,
        score: runtimeState.scores[participant.id] || 0,
      }
    })
    scoreboard.value = hudPlayers.value.map((entry) => ({
      id: entry.id,
      name: entry.name,
      build: entry.build,
      score: entry.score,
      isLocal: entry.isLocal,
      isCpu: entry.isCpu,
    }))
  }

  function makeSnapshot(runtimeState) {
    return {
      phase: runtimeState.phase,
      countdown: countdown.value,
      status: status.value,
      round: runtimeState.round,
      scores: runtimeState.scores,
      roundResult: roundResult.value,
      players: runtimeState.participants.map((participant) => {
        const blade = runtimeState.bladesById.get(participant.id)
        const pos = blade.rb.translation()
        const vel = blade.rb.linvel()
        return {
          id: participant.id,
          alive: blade.alive,
          spin: blade.spin,
          special: blade.special,
          wobble: blade.wobble,
          guarding: blade.guarding,
          silentOrbit: blade.silentOrbit,
          vampireDrain: blade.vampireDrain,
          smashWindow: blade.smashWindow,
          ultGlow: blade.ultGlow,
          visualSpin: blade.visualSpin,
          deathType: blade.deathType,
          charge: blade.charge,
          launchAngle: blade.launchAngle,
          launchPower: blade.launchPower,
          pos: { x: pos.x, z: pos.z },
          vel: { x: vel.x, z: vel.z },
          ringOutVisual: blade.ringOutVisual ? { ...blade.ringOutVisual } : null,
        }
      }),
    }
  }

  function disposeRuntime() {
    if (!runtime) return
    runtime.destroyed = true
    runtime.cleanupFns.forEach((fn) => {
      try { fn() } catch (_) {}
    })
    if (keyCleanup) keyCleanup()
    runtime = null
  }

  function syncMesh(blade) {
    if (!blade.alive && blade.ringOutVisual) {
      const fx = blade.ringOutVisual
      blade.mesh.position.set(fx.x, fx.y, fx.z)
      blade.bladeLight.position.set(fx.x, fx.y + 0.35, fx.z)
      return
    }

    const t = blade.rb.translation()
    const r = Math.hypot(t.x, t.z)
    const now = performance.now()
    const slope = getStadiumSlope(r) * STADIUM.tiltScale
    const radialX = r > 0.0001 ? t.x / r : 1
    const radialZ = r > 0.0001 ? t.z / r : 0
    const surfaceY = getStadiumHeight(r)
    const bankFactor = clamp01(Math.abs(slope) / 0.04)
    const lipFactor = clamp01((r - (STADIUM.bankRadius - 0.55)) / (STADIUM.lipRadius - (STADIUM.bankRadius - 0.55)))
    const wobbleScale = Math.max(0.06, 1 - bankFactor * STADIUM.wobbleBankDamping)
    const upperBankScale = 1 - lipFactor * 0.78
    const wobbleA = Math.sin(now * 0.02 + t.x) * blade.wobble * 0.16 * wobbleScale * upperBankScale
    const wobbleB = Math.cos(now * 0.024 + t.z) * blade.wobble * 0.045 * wobbleScale * wobbleScale * upperBankScale * upperBankScale

    blade.mesh.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
    tmpSurfaceNormal.set(-radialX * slope, 1, -radialZ * slope).normalize()
    tmpSpinAxis.set(-radialZ, 0, radialX).normalize()
    tmpBankAxis.crossVectors(tmpSpinAxis, tmpSurfaceNormal).normalize()

    tmpSurfaceQuat.setFromUnitVectors(WORLD_UP, tmpSurfaceNormal)
    tmpSpinQuat.setFromAxisAngle(tmpSurfaceNormal, blade.visualSpin)
    tmpWobbleQuatA.setFromAxisAngle(tmpSpinAxis, wobbleA)
    tmpWobbleQuatB.setFromAxisAngle(tmpBankAxis, wobbleB)

    blade.mesh.quaternion.copy(tmpSurfaceQuat)
    blade.mesh.quaternion.multiply(tmpSpinQuat)
    blade.mesh.quaternion.multiply(tmpWobbleQuatA)
    blade.mesh.quaternion.multiply(tmpWobbleQuatB)
    blade.aura.material.opacity = Math.min(1, blade.special / 100 * 0.5 + blade.ultGlow * 0.55)
    blade.aura.scale.setScalar(1 + blade.special / 320 + blade.lastImpact * 0.08 + blade.ultGlow * 2.8)
    blade.bladeLight.position.set(t.x, surfaceY + 0.38, t.z)
    blade.bladeLight.intensity = blade.ultGlow * 24 + blade.lastImpact * 5
  }

  function startRingOutVisual(blade) {
    const pos = blade.rb.translation()
    const lv = blade.rb.linvel()
    const r = Math.hypot(pos.x, pos.z) || 1
    const radialX = pos.x / r
    const radialZ = pos.z / r
    const tangentialX = -radialZ
    const tangentialZ = radialX
    const launchSpeed = Math.hypot(lv.x, lv.z)
    blade.ringOutVisual = {
      x: pos.x + radialX * 0.14,
      y: getSurfaceYAtXZ(pos.x, pos.z, STADIUM.bladeLift) + 0.12,
      z: pos.z + radialZ * 0.14,
      vx: lv.x * 1.02 + radialX * (1.9 + launchSpeed * 0.24) + tangentialX * 0.3,
      vy: STADIUM.ringOutLift + Math.min(2.4, launchSpeed * 0.16),
      vz: lv.z * 1.02 + radialZ * (1.9 + launchSpeed * 0.24) + tangentialZ * 0.3,
      tumbleSpeed: 14 + launchSpeed * 0.7,
      axisX: tangentialX * 0.65 + radialX * 0.25,
      axisY: 0.35,
      axisZ: tangentialZ * 0.65 + radialZ * 0.25,
    }
    blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }

  function updateRingOutVisual(blade, dt) {
    if (!blade.ringOutVisual) return
    const fx = blade.ringOutVisual
    fx.x += fx.vx * dt
    fx.y += fx.vy * dt
    fx.z += fx.vz * dt
    fx.vy -= STADIUM.ringOutGravity * dt
    fx.vx *= Math.pow(STADIUM.ringOutDrag, dt * 60)
    fx.vz *= Math.pow(STADIUM.ringOutDrag, dt * 60)
    fx.tumbleSpeed *= Math.pow(0.987, dt * 60)

    blade.visualSpin += blade.spin * 0.02 * blade.spinDir
    blade.spin = Math.max(0, blade.spin - dt * 7.5)
    blade.wobble = Math.min(0.5, blade.wobble + dt * 0.9)
    blade.mesh.position.set(fx.x, fx.y, fx.z)
    blade.bladeLight.position.set(fx.x, fx.y + 0.35, fx.z)
    blade.bladeLight.intensity = Math.max(0, blade.bladeLight.intensity - dt * 10)
    tmpTumbleAxis.set(fx.axisX, fx.axisY, fx.axisZ).normalize()
    tmpSpinQuat.setFromAxisAngle(tmpTumbleAxis, fx.tumbleSpeed * dt)
    blade.mesh.quaternion.multiply(tmpSpinQuat)
    tmpTumbleQuat.setFromAxisAngle(WORLD_UP, blade.visualSpin)
    blade.mesh.quaternion.multiply(tmpTumbleQuat)
  }

  function burst(blade, powerScale = 1) {
    if (blade.boostCooldown > 0 || blade.spin < 7) return
    const lv = blade.rb.linvel()
    const mag = Math.hypot(lv.x, lv.z) || 1
    const boost = 4.5 * blade.def.stats.speed * powerScale
    blade.rb.setLinvel({ x: lv.x + (lv.x / mag) * boost, y: 0, z: lv.z + (lv.z / mag) * boost }, true)
    blade.spin = Math.max(0, blade.spin - 2.6)
    blade.boostCooldown = 0.6
    blade.lastImpact = 0.4
    beep({ freq: 480, duration: 0.05, type: 'square', gain: 0.018, slideTo: 260 })
  }

  function stabilise(blade, dt) {
    if (blade.spin < 3) return
    blade.spin = Math.max(0, blade.spin - 3.2 * dt)
    blade.wobble = Math.max(0.008, blade.wobble - 1.9 * dt)
    const lv = blade.rb.linvel()
    blade.rb.setLinvel({ x: lv.x * (1 - 0.8 * dt), y: 0, z: lv.z * (1 - 0.8 * dt) }, true)
  }

  function triggerSpecial(blade) {
    if (blade.special < 100) return
    blade.special = 0
    blade.lastImpact = 0.8
    blade.ultGlow = 1
    status.value = `${blade.name} used ${blade.def.specialName}!`
    if (blade.key === 'attack') {
      blade.smashWindow = 1
      burst(blade, 1.8)
      noiseBurst(0.05, 0.08)
    } else if (blade.key === 'defense') {
      blade.guarding = 1.8
      blade.wobble *= 0.3
    } else if (blade.key === 'stamina') {
      blade.silentOrbit = 2.4
      blade.wobble *= 0.4
    } else if (blade.key === 'rubber') {
      blade.vampireDrain = 2.2
    }
  }

  function pickCpuTarget(runtimeState, cpuBlade) {
    let best = null
    let bestDist = Number.POSITIVE_INFINITY
    const cpuPos = cpuBlade.rb.translation()
    for (const blade of runtimeState.blades) {
      if (blade.id === cpuBlade.id || !blade.alive) continue
      const otherPos = blade.rb.translation()
      const dist = Math.hypot(otherPos.x - cpuPos.x, otherPos.z - cpuPos.z)
      if (dist < bestDist) {
        bestDist = dist
        best = blade
      }
    }
    return best
  }

  function runCpuBrain(runtimeState, cpuBlade, dt) {
    if (!cpuBlade.alive || runtimeState.phase !== 'fighting') return
    const target = pickCpuTarget(runtimeState, cpuBlade)
    if (!target) return

    if (cpuBlade.aiState === undefined) {
      cpuBlade.aiState = 'orbit'
      cpuBlade.aiTimer = 0
      cpuBlade.orbitDir = Math.random() < 0.5 ? 1 : -1
    }

    const cp = cpuBlade.rb.translation()
    const tp = target.rb.translation()
    const lv = cpuBlade.rb.linvel()
    const cpuR = Math.hypot(cp.x, cp.z)
    const targetR = Math.hypot(tp.x, tp.z)
    const dx = tp.x - cp.x
    const dz = tp.z - cp.z
    const dist = Math.hypot(dx, dz) || 1
    const edgeDist = 8.15 - cpuR
    const targetEdgeDist = 8.15 - targetR
    const cpuSpeed = Math.hypot(lv.x, lv.z)
    const velOut = cpuR > 0.1 ? (lv.x * cp.x + lv.z * cp.z) / cpuR : 0

    cpuBlade.aiTimer = Math.max(0, cpuBlade.aiTimer - dt)
    if (edgeDist < 1.8 || (edgeDist < 3.5 && velOut > 3.5)) {
      cpuBlade.aiState = 'recover'
    } else if (cpuBlade.aiState === 'recover' && edgeDist > 4.5 && velOut < 0.5) {
      cpuBlade.aiState = 'orbit'
      cpuBlade.aiTimer = 0.3
    }
    if (cpuBlade.aiState !== 'recover' && cpuBlade.wobble > 0.28 && cpuBlade.spin > 5) {
      cpuBlade.aiState = 'stabilise'
    } else if (cpuBlade.aiState === 'stabilise' && (cpuBlade.wobble < 0.1 || cpuBlade.spin < 5)) {
      cpuBlade.aiState = 'orbit'
    }
    if (cpuBlade.aiState === 'orbit' && cpuBlade.aiTimer <= 0 && (dist < 6.5 || targetEdgeDist < 4)) {
      cpuBlade.aiState = 'approach'
      cpuBlade.aiTimer = 0.5 + Math.random() * 0.9
    }
    if (cpuBlade.aiState === 'approach' && cpuBlade.aiTimer <= 0) {
      cpuBlade.aiState = 'orbit'
      cpuBlade.aiTimer = 0.4 + Math.random() * 0.6
    }

    let moveX = 0
    let moveZ = 0
    if (cpuBlade.aiState === 'recover') {
      moveX = cpuR > 0.1 ? -cp.x / cpuR : 0
      moveZ = cpuR > 0.1 ? -cp.z / cpuR : 0
    } else if (cpuBlade.aiState === 'stabilise') {
      stabilise(cpuBlade, dt)
      const radErr = cpuR - 4.5
      moveX = cpuR > 0.1 ? (-cp.x / cpuR) * Math.sign(radErr) * 0.3 : 0
      moveZ = cpuR > 0.1 ? (-cp.z / cpuR) * Math.sign(radErr) * 0.3 : 0
    } else if (cpuBlade.aiState === 'orbit') {
      const radErr = cpuR - 4.5
      const tgX = cpuR > 0.1 ? (-cp.z / cpuR) * cpuBlade.orbitDir : 0
      const tgZ = cpuR > 0.1 ? (cp.x / cpuR) * cpuBlade.orbitDir : 0
      const rdX = cpuR > 0.1 ? -cp.x / cpuR : 0
      const rdZ = cpuR > 0.1 ? -cp.z / cpuR : 0
      moveX = tgX * 0.75 + rdX * Math.sign(radErr) * Math.min(1, Math.abs(radErr) * 0.5) * 0.4
      moveZ = tgZ * 0.75 + rdZ * Math.sign(radErr) * Math.min(1, Math.abs(radErr) * 0.5) * 0.4
      if (cpuBlade.aiTimer <= 0 && Math.random() < 0.012) {
        cpuBlade.orbitDir *= -1
        cpuBlade.aiTimer = 1.5 + Math.random()
      }
    } else {
      const targetRX = targetR > 0.1 ? tp.x / targetR : 0
      const targetRZ = targetR > 0.1 ? tp.z / targetR : 0
      const tangentX = -targetRZ * cpuBlade.orbitDir * 0.55
      const tangentZ = targetRX * cpuBlade.orbitDir * 0.55
      const aimX = tp.x + targetRX + tangentX - cp.x
      const aimZ = tp.z + targetRZ + tangentZ - cp.z
      const aimMag = Math.hypot(aimX, aimZ) || 1
      moveX = aimX / aimMag
      moveZ = aimZ / aimMag
    }

    const mag = Math.hypot(moveX, moveZ)
    if (mag > 0.001) {
      moveX /= mag
      moveZ /= mag
    }

    const stateScale = cpuBlade.aiState === 'recover' ? 1.9 : cpuBlade.aiState === 'approach' ? 1.05 : 0.85
    const buildScale = cpuBlade.key === 'attack' ? 1.1 : cpuBlade.key === 'stamina' ? 0.9 : 1
    const nudge = 7.6 * cpuBlade.def.stats.grip * stateScale * buildScale
    cpuBlade.rb.setLinvel({ x: lv.x + moveX * nudge * dt, y: 0, z: lv.z + moveZ * nudge * dt }, true)
    if (cpuBlade.aiState === 'approach' && cpuSpeed > 4 && dist < 3.5 && targetEdgeDist < 5.5 && edgeDist > 3 && cpuBlade.boostCooldown <= 0 && cpuBlade.spin > 12 && Math.random() < 0.03) {
      burst(cpuBlade, cpuBlade.key === 'attack' ? 1.2 : 1)
    }
    if (cpuBlade.aiState === 'orbit' && cpuBlade.wobble > 0.18 && cpuBlade.spin > 10 && Math.random() < 0.05) {
      stabilise(cpuBlade, dt)
    }
    if (cpuBlade.special >= 100 && Math.random() < 0.04) {
      triggerSpecial(cpuBlade)
    }
  }

  function applyHumanInput(blade, input, dt, phase) {
    if (!input || !blade.alive) return
    if (phase === 'aiming') {
      if (input.aimLeft) blade.launchAngle -= 2.2 * dt
      if (input.aimRight) blade.launchAngle += 2.2 * dt
      if (input.charge) blade.charge = Math.min(1, blade.charge + 0.65 * dt)
      else blade.charge = Math.max(0, blade.charge - 0.45 * dt)
      return
    }

    const lv = blade.rb.linvel()
    const nudge = 7.6 * blade.def.stats.grip
    blade.rb.setLinvel({
      x: lv.x + input.moveX * nudge * dt,
      y: 0,
      z: lv.z + input.moveZ * nudge * dt,
    }, true)
    if (input.burst) burst(blade)
    if (input.stabilise) stabilise(blade, dt)
    if (input.special) triggerSpecial(blade)
  }

  function updateBlade(blade, dt) {
    blade.boostCooldown = Math.max(0, blade.boostCooldown - dt)
    blade.guarding = Math.max(0, blade.guarding - dt)
    blade.silentOrbit = Math.max(0, blade.silentOrbit - dt)
    blade.vampireDrain = Math.max(0, blade.vampireDrain - dt)
    blade.smashWindow = Math.max(0, blade.smashWindow - dt)
    blade.lastImpact = Math.max(0, blade.lastImpact - dt * 2.6)
    blade.ultGlow = Math.max(0, blade.ultGlow - dt * 1.4)
    if (!blade.alive) {
      updateRingOutVisual(blade, dt)
      return
    }

    const pos = blade.rb.translation()
    const lv = blade.rb.linvel()
    const speed = Math.hypot(lv.x, lv.z)
    const radius = Math.hypot(pos.x, pos.z)
    if (radius > STADIUM.flatRadius) {
      const slope = getStadiumSlope(radius)
      const bowlAccel = -slope * STADIUM.bankGravity
      const nx = pos.x / radius
      const nz = pos.z / radius
      blade.rb.setLinvel({ x: lv.x + nx * bowlAccel * dt, y: 0, z: lv.z + nz * bowlAccel * dt }, true)
    }

    const radialVel = radius > 0.001 ? (lv.x * pos.x + lv.z * pos.z) / radius : 0
    if (radius > STADIUM.lipRadius && radialVel > 0.35) {
      blade.deathType = 'ring_out'
      blade.alive = false
      startRingOutVisual(blade)
    }

    let drain = 1.6 + speed * 0.13 + blade.wobble * 1.2
    drain /= blade.def.stats.stamina
    if (blade.silentOrbit > 0) drain *= 0.45
    if (blade.guarding > 0) drain *= 0.82
    blade.spin = Math.max(0, blade.spin - drain * dt)
    blade.special = Math.min(100, blade.special + (0.9 + speed * 0.06) * dt * 10)
    if (blade.spin < 7) blade.wobble = Math.min(0.45, blade.wobble + 0.3 * dt)
    else blade.wobble = Math.max(0.01, blade.wobble - 0.03 * dt)
    blade.visualSpin += blade.spin * 0.032 * blade.spinDir
    if (blade.spin <= 0.1) {
      blade.alive = false
      blade.deathType = blade.deathType || 'spin_out'
      blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
    syncMesh(blade)
  }

  function resolveBladeCollision(a, b, runtimeState) {
    if (!a.alive || !b.alive) return
    const pa = a.rb.translation()
    const pb = b.rb.translation()
    const dx = pb.x - pa.x
    const dz = pb.z - pa.z
    const dist = Math.hypot(dx, dz)
    if (dist >= a.radius + b.radius || dist === 0) return

    const nx = dx / dist
    const nz = dz / dist
    const lva = a.rb.linvel()
    const lvb = b.rb.linvel()
    const relV = (lvb.x - lva.x) * nx + (lvb.z - lva.z) * nz
    const impact = Math.abs(relV) + Math.abs(a.spin - b.spin) * 0.055
    const attackModA = a.def.stats.smash * (a.smashWindow > 0 ? 1.45 : 1)
    const attackModB = b.def.stats.smash * (b.smashWindow > 0 ? 1.45 : 1)
    const defenseA = a.def.stats.defense * (a.guarding > 0 ? 1.4 : 1)
    const defenseB = b.def.stats.defense * (b.guarding > 0 ? 1.4 : 1)
    const pushA = (1.2 + impact * 0.35) * (attackModB / defenseA)
    const pushB = (1.2 + impact * 0.35) * (attackModA / defenseB)
    a.rb.setLinvel({ x: lva.x - nx * pushA, y: 0, z: lva.z - nz * pushA }, true)
    b.rb.setLinvel({ x: lvb.x + nx * pushB, y: 0, z: lvb.z + nz * pushB }, true)

    let spinLossA = (0.7 + impact * 0.12) / defenseA
    let spinLossB = (0.7 + impact * 0.12) / defenseB
    if (a.silentOrbit > 0) spinLossA *= 0.6
    if (b.silentOrbit > 0) spinLossB *= 0.6
    a.spin = Math.max(0, a.spin - spinLossA)
    b.spin = Math.max(0, b.spin - spinLossB)
    if (a.vampireDrain > 0) {
      const steal = Math.min(1.25, spinLossB * 0.9)
      b.spin = Math.max(0, b.spin - steal)
      a.spin = Math.min(80, a.spin + steal * 0.75)
    }
    if (b.vampireDrain > 0) {
      const steal = Math.min(1.25, spinLossA * 0.9)
      a.spin = Math.max(0, a.spin - steal)
      b.spin = Math.min(80, b.spin + steal * 0.75)
    }
    a.special = Math.min(100, a.special + impact * 1.1)
    b.special = Math.min(100, b.special + impact * 1.1)
    a.wobble = Math.min(0.48, a.wobble + 0.02 + impact * 0.005 / defenseA)
    b.wobble = Math.min(0.48, b.wobble + 0.02 + impact * 0.005 / defenseB)
    a.lastImpact = 0.4
    b.lastImpact = 0.4
    runtimeState.cameraShake = Math.max(runtimeState.cameraShake, Math.min(0.4, impact * 0.015))
  }

  function pushSnapshot(runtimeState) {
    if (!runtimeState.networked || !runtimeState.authoritative || !roomApi) return
    runtimeState.snapshotAccumulator += runtimeState.lastDt
    if (runtimeState.snapshotAccumulator < 0.05) return
    runtimeState.snapshotAccumulator = 0
    roomApi.sendSnapshot(makeSnapshot(runtimeState))
  }

  function applySnapshot(runtimeState, snapshot) {
    runtimeState.phase = snapshot.phase
    runtimeState.round = snapshot.round
    status.value = snapshot.status
    countdown.value = snapshot.countdown
    roundResult.value = snapshot.roundResult || null
    runtimeState.scores = { ...snapshot.scores }
    for (const playerSnapshot of snapshot.players || []) {
      const blade = runtimeState.bladesById.get(playerSnapshot.id)
      if (!blade) continue
      blade.alive = playerSnapshot.alive
      blade.spin = playerSnapshot.spin
      blade.special = playerSnapshot.special
      blade.wobble = playerSnapshot.wobble
      blade.guarding = playerSnapshot.guarding
      blade.silentOrbit = playerSnapshot.silentOrbit
      blade.vampireDrain = playerSnapshot.vampireDrain
      blade.smashWindow = playerSnapshot.smashWindow
      blade.ultGlow = playerSnapshot.ultGlow
      blade.visualSpin = playerSnapshot.visualSpin
      blade.deathType = playerSnapshot.deathType
      blade.charge = playerSnapshot.charge
      blade.launchAngle = playerSnapshot.launchAngle
      blade.launchPower = playerSnapshot.launchPower
      blade.ringOutVisual = playerSnapshot.ringOutVisual ? { ...playerSnapshot.ringOutVisual } : null
      blade.rb.setTranslation({ x: playerSnapshot.pos.x, y: 0.22, z: playerSnapshot.pos.z }, true)
      blade.rb.setLinvel({ x: playerSnapshot.vel.x, y: 0, z: playerSnapshot.vel.z }, true)
      blade.arrow.visible = runtimeState.phase === 'aiming'
      syncMesh(blade)
    }
    updateHud(runtimeState)
  }

  async function beginMatch(config) {
    disposeRuntime()
    attachKeyListeners()

    await nextTick()

    const mount = mountRef.value
    if (!mount) return
    const RAPIER = await import('@dimforge/rapier3d-compat')
    await RAPIER.init()
    const { World, RigidBodyDesc, ColliderDesc } = RAPIER

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0c0820)
    scene.fog = new THREE.Fog(0x0c0820, 18, 34)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.innerHTML = ''
    mount.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.set(0, 18, 16)
    camera.lookAt(0, 0, 0)

    scene.add(new THREE.HemisphereLight(0xc7f2ff, 0x0b1220, 1.25))
    const dir = new THREE.DirectionalLight(0xffffff, 1.7)
    dir.position.set(7, 12, 6)
    dir.castShadow = true
    dir.shadow.mapSize.width = 1024
    dir.shadow.mapSize.height = 1024
    scene.add(dir)
    const arenaGlow = new THREE.PointLight(0x38bdf8, 4, 20, 2)
    arenaGlow.position.set(0, 1.5, 0)
    scene.add(arenaGlow)
    const purpleGlow = new THREE.PointLight(0xb800ff, 3, 16, 2)
    purpleGlow.position.set(-3, 2.5, -3)
    scene.add(purpleGlow)

    const bowlProfile = []
    for (let r = 0; r <= STADIUM.outerRadius; r += 0.2) {
      bowlProfile.push(new THREE.Vector2(r, getStadiumHeight(r)))
    }
    bowlProfile.push(new THREE.Vector2(9.9, -0.38))
    const bowlMesh = new THREE.Mesh(
      new THREE.LatheGeometry(bowlProfile, 96),
      new THREE.MeshStandardMaterial({ color: 0x12103a, roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide })
    )
    bowlMesh.receiveShadow = true
    scene.add(bowlMesh)

    const centerHub = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 48),
      new THREE.MeshBasicMaterial({ color: 0x07051a, side: THREE.DoubleSide })
    )
    centerHub.rotation.x = -Math.PI / 2
    centerHub.position.y = STADIUM.floorY + 0.01
    scene.add(centerHub)

    const centerGlow = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.52, 48),
      new THREE.MeshBasicMaterial({ color: 0x7040e0, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    )
    centerGlow.rotation.x = -Math.PI / 2
    centerGlow.position.y = STADIUM.floorY + 0.015
    scene.add(centerGlow)

    for (const radius of [3.5, 6.3, 7.9]) {
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.045, 8, 72),
        new THREE.MeshBasicMaterial({ color: 0x4030c8, transparent: true, opacity: 0.75 })
      )
      stripe.rotation.x = Math.PI / 2
      stripe.position.y = getStadiumHeight(radius)
      scene.add(stripe)
    }

    const rimNeon = new THREE.Mesh(
      new THREE.TorusGeometry(STADIUM.lipRadius, 0.065, 8, 96),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 3, metalness: 0.1, roughness: 0.2 })
    )
    rimNeon.rotation.x = Math.PI / 2
    rimNeon.position.y = STADIUM.lipHeight
    scene.add(rimNeon)

    const world = new World({ x: 0, y: -9.81, z: 0 })
    const groundRB = world.createRigidBody(RigidBodyDesc.fixed())
    world.createCollider(ColliderDesc.cylinder(0.45, 9.3).setTranslation(0, -0.25, 0).setRestitution(0.65).setFriction(0.15), groundRB)
    world.createCollider(ColliderDesc.cylinder(0.9, 10.2).setTranslation(0, -0.8, 0), groundRB)

    const spawnPoints = getSpawnPoints(config.participants.length)
    const blades = []
    const bladesById = new Map()

    function createBlade(participant, index) {
      const def = BUILD_DEFS[participant.build]
      const meshPack = createBeybladeMesh(def.color, def.accent, participant.build)
      scene.add(meshPack.group)
      const bladeLight = new THREE.PointLight(new THREE.Color(def.color), 0, 8, 2)
      scene.add(bladeLight)
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 2.2, new THREE.Color(def.color), 0.55, 0.28)
      scene.add(arrow)

      const spawn = spawnPoints[index]
      const rb = world.createRigidBody(
        RigidBodyDesc.dynamic()
          .setTranslation(spawn.x, 0.22, spawn.z)
          .setCanSleep(false)
          .lockTranslations()
      )
      world.createCollider(
        ColliderDesc.cylinder(0.18, 0.78)
          .setRestitution(0.92)
          .setFriction(0.06)
          .setMass(def.stats.weight * 1.25),
        rb
      )

      const blade = {
        id: participant.id,
        key: participant.build,
        def,
        name: participant.name,
        kind: participant.kind,
        isLocal: participant.id === config.localPlayerId,
        mesh: meshPack.group,
        aura: meshPack.aura,
        rb,
        bladeLight,
        arrow,
        spawn,
        radius: 0.78,
        spin: 0,
        spinDir: index % 2 === 0 ? 1 : -1,
        wobble: 0.02,
        special: 12,
        alive: true,
        guarding: 0,
        silentOrbit: 0,
        vampireDrain: 0,
        smashWindow: 0,
        boostCooldown: 0,
        lastImpact: 0,
        launchAngle: spawn.angle,
        launchPower: 0,
        deathType: null,
        ultGlow: 0,
        visualSpin: 0,
        ringOutVisual: null,
        charge: participant.kind === 'cpu' ? 0.72 : 0,
      }
      blades.push(blade)
      bladesById.set(participant.id, blade)
    }

    config.participants.forEach(createBlade)

    const runtimeState = {
      ...config,
      authoritative: config.type !== 'online-client',
      networked: config.type.startsWith('online'),
      destroyed: false,
      scene,
      renderer,
      camera,
      arenaGlow,
      world,
      blades,
      bladesById,
      participants: config.participants,
      scores: Object.fromEntries(config.participants.map((participant) => [participant.id, 0])),
      round: 1,
      phase: 'aiming',
      roundResolved: false,
      matchOver: false,
      roundResetTimer: 0,
      lastTime: performance.now(),
      lastDt: 0,
      localInput: serialiseInput({}),
      remoteInputs: new Map(),
      snapshotAccumulator: 0,
      sendInputAccumulator: 0,
      countdownTimer: 3.5,
      nextCountdownIndex: 0,
      countdownBeats: [3.5, 2.5, 1.5, 0.6],
      countdownValues: [3, 2, 1, 0],
      cameraShake: 0,
      cleanupFns: [],
    }

    function setBladeArrow(blade) {
      const dir = new THREE.Vector3(Math.cos(blade.launchAngle), 0, Math.sin(blade.launchAngle))
      blade.arrow.position.set(blade.spawn.x, getSurfaceYAtXZ(blade.spawn.x, blade.spawn.z, 0.42), blade.spawn.z)
      blade.arrow.setDirection(dir)
      blade.arrow.setLength(1.4 + blade.charge * 2.6, 0.55 + blade.charge * 0.18, 0.28)
      blade.arrow.setColor(new THREE.Color(blade.def.color).lerp(new THREE.Color(blade.def.accent), blade.charge * 0.55))
      blade.arrow.visible = runtimeState.phase === 'aiming'
      if (blade.id === runtimeState.localPlayerId) aimAngle.value = blade.launchAngle
    }

    function resetRound() {
      runtimeState.roundResolved = false
      runtimeState.phase = 'aiming'
      runtimeState.countdownTimer = 3.5
      runtimeState.nextCountdownIndex = 0
      countdown.value = 3
      roundResult.value = null
      status.value = runtimeState.authoritative ? 'Hold SPACE to charge. Aim with A / D. GO fires automatically.' : 'Waiting for host launch.'
      for (const blade of runtimeState.blades) {
        blade.rb.setTranslation({ x: blade.spawn.x, y: 0.22, z: blade.spawn.z }, true)
        blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        blade.spin = 0
        blade.special = 12
        blade.wobble = 0.02
        blade.alive = true
        blade.guarding = 0
        blade.silentOrbit = 0
        blade.vampireDrain = 0
        blade.smashWindow = 0
        blade.boostCooldown = 0
        blade.lastImpact = 0
        blade.ultGlow = 0
        blade.visualSpin = 0
        blade.deathType = null
        blade.ringOutVisual = null
        blade.launchPower = 0
        blade.charge = blade.kind === 'cpu' ? 0.72 : 0
        blade.launchAngle = blade.spawn.angle
        setBladeArrow(blade)
        syncMesh(blade)
      }
      updateHud(runtimeState)
    }

    function launchRound() {
      for (const blade of runtimeState.blades) {
        blade.launchPower = 5 + blade.charge * 6 * blade.def.stats.speed
        blade.rb.setTranslation({ x: blade.spawn.x, y: 0.22, z: blade.spawn.z }, true)
        blade.rb.setLinvel({ x: Math.cos(blade.launchAngle) * blade.launchPower, y: 0, z: Math.sin(blade.launchAngle) * blade.launchPower }, true)
        blade.spin = blade.kind === 'cpu'
          ? 46 + 12 * blade.def.stats.stamina
          : 38 + blade.charge * 28 * blade.def.stats.stamina
        blade.arrow.visible = false
      }
      runtimeState.phase = 'fighting'
      countdown.value = null
      status.value = 'Fight! WASD to drift, Shift to burst, E to stabilise, Q for special.'
      beep({ freq: 240, duration: 0.08, type: 'sawtooth', gain: 0.03, slideTo: 130 })
    }

    function resolveRound() {
      if (runtimeState.roundResolved) return
      runtimeState.roundResolved = true
      runtimeState.phase = 'round_end'
      countdown.value = null
      const aliveBlades = runtimeState.blades.filter((blade) => blade.alive)
      let winnerBlade = aliveBlades[0] || null
      if (aliveBlades.length === 0) {
        winnerBlade = [...runtimeState.blades].sort((a, b) => b.spin - a.spin)[0] || null
      } else if (aliveBlades.length > 1) {
        winnerBlade = [...aliveBlades].sort((a, b) => b.spin - a.spin)[0]
      }
      if (!winnerBlade) return
      runtimeState.scores[winnerBlade.id] = (runtimeState.scores[winnerBlade.id] || 0) + 1
      const defeated = runtimeState.blades.filter((blade) => blade.id !== winnerBlade.id).sort((a, b) => b.spin - a.spin)[0] || winnerBlade
      const winType = defeated.deathType === 'ring_out' ? 'Ring Out' : 'Spin Out'
      const winnerLabel = winnerBlade.isLocal && !runtimeState.networked ? 'You Win' : `${winnerBlade.name} Wins`
      roundResult.value = {
        type: winType,
        outcome: winnerLabel,
        winner: winnerBlade.id,
        isMatchOver: runtimeState.scores[winnerBlade.id] >= runtimeState.scoreToWin,
      }
      status.value = `${winnerBlade.name} takes round ${runtimeState.round}.`
      updateHud(runtimeState)
      runtimeState.matchOver = runtimeState.scores[winnerBlade.id] >= runtimeState.scoreToWin
      runtimeState.roundResetTimer = runtimeState.matchOver ? 3 : 2.2
    }

    function onResize() {
      const mountEl = mountRef.value
      if (!mountEl) return
      camera.aspect = mountEl.clientWidth / mountEl.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mountEl.clientWidth, mountEl.clientHeight)
    }

    window.addEventListener('resize', onResize)
    runtimeState.cleanupFns.push(() => {
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mount.innerHTML = ''
    })

    resetRound()
    runtime = runtimeState

    function animate(now) {
      if (runtime !== runtimeState || runtimeState.destroyed) return

      const dt = Math.min(0.033, (now - runtimeState.lastTime) / 1000)
      runtimeState.lastTime = now
      runtimeState.lastDt = dt
      runtimeState.localInput = serialiseInput(readLocalInput())

      if (runtimeState.authoritative) {
        if (runtimeState.phase === 'aiming') {
          runtimeState.countdownTimer -= dt
          while (runtimeState.nextCountdownIndex < runtimeState.countdownBeats.length && runtimeState.countdownTimer <= runtimeState.countdownBeats[runtimeState.nextCountdownIndex]) {
            countdown.value = runtimeState.countdownValues[runtimeState.nextCountdownIndex]
            runtimeState.nextCountdownIndex += 1
          }

          for (const blade of runtimeState.blades) {
            if (blade.kind === 'cpu') {
              blade.charge = 0.72
              blade.launchAngle = blade.spawn.angle
            } else if (blade.id === runtimeState.localPlayerId) {
              applyHumanInput(blade, runtimeState.localInput, dt, 'aiming')
            } else {
              applyHumanInput(blade, runtimeState.remoteInputs.get(blade.id) || {}, dt, 'aiming')
            }
            setBladeArrow(blade)
          }

          if (runtimeState.countdownTimer <= 0) launchRound()
        } else if (runtimeState.phase === 'fighting') {
          for (const blade of runtimeState.blades) {
            if (blade.kind === 'cpu') runCpuBrain(runtimeState, blade, dt)
            else if (blade.id === runtimeState.localPlayerId) applyHumanInput(blade, runtimeState.localInput, dt, 'fighting')
            else applyHumanInput(blade, runtimeState.remoteInputs.get(blade.id) || {}, dt, 'fighting')
          }
          runtimeState.world.step()
          for (let i = 0; i < runtimeState.blades.length; i++) {
            for (let j = i + 1; j < runtimeState.blades.length; j++) {
              resolveBladeCollision(runtimeState.blades[i], runtimeState.blades[j], runtimeState)
            }
          }
          for (const blade of runtimeState.blades) {
            updateBlade(blade, dt)
          }
          if (runtimeState.blades.filter((blade) => blade.alive).length <= 1) {
            resolveRound()
          }
        } else if (runtimeState.phase === 'round_end') {
          for (const blade of runtimeState.blades) updateBlade(blade, dt)
          runtimeState.roundResetTimer -= dt
          if (runtimeState.roundResetTimer <= 0) {
            if (runtimeState.matchOver) {
              if (runtimeState.networked && roomApi) {
                roomApi.sendMatchComplete(roundResult.value?.outcome || 'Match finished.')
              }
              gamePhase.value = 'menu'
              if (runtime === runtimeState) disposeRuntime()
              return
            }
            runtimeState.round += 1
            resetRound()
          }
        }
        pushSnapshot(runtimeState)
      } else {
        runtimeState.sendInputAccumulator += dt
        if (runtimeState.sendInputAccumulator >= 0.05 && roomApi) {
          runtimeState.sendInputAccumulator = 0
          roomApi.sendInput(runtimeState.localInput)
        }
        if (roomApi?.latestSnapshot?.value) {
          applySnapshot(runtimeState, roomApi.latestSnapshot.value)
        }
      }

      updateHud(runtimeState)
      const shake = runtimeState.cameraShake
      runtimeState.cameraShake = Math.max(0, runtimeState.cameraShake - dt * 1.8)
      camera.position.set(
        Math.sin(now * 0.03) * shake * 0.7,
        18 + Math.cos(now * 0.027) * shake * 0.4,
        16 + Math.sin(now * 0.035) * shake * 0.5
      )
      camera.lookAt(0, 0.1, 0)
      arenaGlow.intensity = 4 + runtimeState.blades.filter((blade) => blade.alive).length * 0.6
      renderer.render(scene, camera)
      requestAnimationFrame(animate)
    }

    requestAnimationFrame(animate)
  }

  function launchSinglePlayerMatch(playerName = 'Player') {
    const cpuBuild = CPU_BUILD_ORDER[cpuMatchBuildIdx % CPU_BUILD_ORDER.length]
    cpuMatchBuildIdx += 1
    gamePhase.value = 'battle'
    beginMatch({
      type: 'single',
      localPlayerId: 'local-player',
      scoreToWin: 2,
      participants: [
        { id: 'local-player', name: playerName, build: selectedBuild.value, kind: 'human' },
        { id: 'cpu-opponent', name: 'CPU', build: cpuBuild, kind: 'cpu' },
      ],
    })
  }

  function launchOnlineMatch(matchConfig) {
    if (!roomApi) return
    gamePhase.value = 'battle'
    beginMatch({
      type: roomApi.isHost.value ? 'online-host' : 'online-client',
      localPlayerId: roomApi.clientId.value,
      scoreToWin: matchConfig.scoreToWin || 2,
      participants: matchConfig.participants.map((participant) => ({
        ...participant,
        kind: 'human',
      })),
    })
  }

  function returnToMenu() {
    gamePhase.value = 'menu'
    disposeRuntime()
  }

  watch(selectedBuild, (build) => {
    if (roomApi?.room?.value) {
      roomApi.updateProfile({ name: roomApi.playerName.value, build })
    }
  })

  if (roomApi) {
    watch(() => roomApi.latestMatchConfig.value, (matchConfig) => {
      if (!matchConfig) return
      launchOnlineMatch(matchConfig)
    })

    watch(() => roomApi.remoteInput.value, (payload) => {
      if (!payload || !runtime || !runtime.authoritative) return
      runtime.remoteInputs.set(payload.playerId, serialiseInput(payload.input))
    })
  }

  onUnmounted(() => {
    disposeRuntime()
    if (keyCleanup) keyCleanup()
  })

  return {
    selectedBuild,
    menuMode,
    gamePhase,
    status,
    scoreboard,
    hudPlayers,
    buildEntries,
    roundResult,
    countdown,
    aimAngle,
    launchSinglePlayerMatch,
    returnToMenu,
  }
}