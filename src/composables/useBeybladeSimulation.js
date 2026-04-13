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

const AIM_COUNTDOWN_DURATION = 3.5

const ATTACK_SPECIAL = {
  lockDuration: 0.42,
  rushDuration: 0.34,
  commitDuration: 0.56,
  snapDuration: 0.12,
  slashDuration: 0.16,
  smashWindow: 1.18,
  smashMultiplier: 1.3,
  rushPowerScale: 1.85,
  fallbackPowerScale: 1.6,
  guidedSpeedFloor: 9.1,
  guidedBlend: 0.7,
}

const DEFENSE_SPECIAL = {
  guardDuration: 1.95,
  wobbleScale: 0.3,
  passiveDrainMultiplier: 0.76,
  defenseMultiplier: 1.62,
  reflectPushBonus: 1.05,
  reflectPushImpactScale: 0.56,
  reflectSpinBonus: 0.62,
  reflectSpinImpactScale: 0.18,
  guardedPushAbsorb: 0.82,
  guardedSpinAbsorb: 0.72,
  reflectFlashDuration: 0.2,
}

const STAMINA_SPECIAL = {
  duration: 2.8,
  wobbleScale: 0.28,
  passiveDrainMultiplier: 0.4,
  collisionDrainMultiplier: 0.52,
  controlBoost: 1.18,
  lateralDamping: 7.8,
  idleDriftDamping: 0.95,
  recenterStartRadius: 4.9,
  recenterForce: 4.2,
  outwardBrake: 2.2,
  activationVelocityCleanse: 0.9,
  activationRefundThreshold: 20,
  activationRefund: 4.4,
  completionRefund: 3.6,
  pulseDuration: 0.28,
}

const RUBBER_SPECIAL = {
  duration: 2.2,
  burstDuration: 0.52,
  pulseDuration: 0.18,
}

const TRICK_SPECIAL = {
  duration: 2.45,
  stepCooldown: 0.34,
  dodgeDuration: 0.2,
  counterDuration: 0.54,
  pulseDuration: 0.18,
  echoDuration: 0.52,
  stepDistance: 0.78,
  forwardCarryDistance: 0.08,
  stepVelocity: 5.2,
  forwardCarryVelocity: 0.16,
  passiveDrainMultiplier: 0.84,
  controlBoost: 1.24,
  dodgePushAbsorb: 0.28,
  dodgeSpinAbsorb: 0.42,
  counterPushBonus: 0.82,
  counterPushImpactScale: 0.3,
  counterSpinBonus: 0.42,
  counterSpinImpactScale: 0.12,
  maxTargetDist: 5.2,
  safeEdgeBuffer: 1.1,
  inwardBiasDistance: 0.44,
  edgeOutwardDamping: 0.9,
}

const CPU_LAUNCH = {
  baseCharge: 0.72,
  chargeVariance: 0.12,
  angleVariance: 0.18,
  buildProfiles: {
    attack: { baseCharge: 0.79, chargeVariance: 0.08, angleVariance: 0.1 },
    defense: { baseCharge: 0.68, chargeVariance: 0.09, angleVariance: 0.13 },
    stamina: { baseCharge: 0.7, chargeVariance: 0.08, angleVariance: 0.16 },
    rubber: { baseCharge: 0.74, chargeVariance: 0.1, angleVariance: 0.2 },
    trick: { baseCharge: 0.76, chargeVariance: 0.11, angleVariance: 0.24 },
  },
}

const ATTACK_UI_RENDER_ORDER = 120
const SELECTED_BUILD_STORAGE_KEY = 'spin-clash:selected-build'
const PLAYER_RECORD_STORAGE_KEY = 'spin-clash:player-record'
const PLAYER_STATS_STORAGE_KEY = 'spin-clash:player-stats'

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

function createCornerMarker(size, cornerLength, thickness, color) {
  const half = size * 0.5
  const marker = new THREE.Group()
  marker.rotation.x = -Math.PI / 2
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  })
  const materials = []

  const segments = [
    { x: -half + cornerLength * 0.5, z: -half, width: cornerLength, height: thickness },
    { x: -half, z: -half + cornerLength * 0.5, width: thickness, height: cornerLength },
    { x: half - cornerLength * 0.5, z: -half, width: cornerLength, height: thickness },
    { x: half, z: -half + cornerLength * 0.5, width: thickness, height: cornerLength },
    { x: -half + cornerLength * 0.5, z: half, width: cornerLength, height: thickness },
    { x: -half, z: half - cornerLength * 0.5, width: thickness, height: cornerLength },
    { x: half - cornerLength * 0.5, z: half, width: cornerLength, height: thickness },
    { x: half, z: half - cornerLength * 0.5, width: thickness, height: cornerLength },
  ]

  for (const segment of segments) {
    const piece = new THREE.Mesh(new THREE.PlaneGeometry(segment.width, segment.height), material.clone())
    piece.position.set(segment.x, 0, segment.z)
    piece.renderOrder = ATTACK_UI_RENDER_ORDER
    marker.add(piece)
    materials.push(piece.material)
  }

  marker.userData.materials = materials
  marker.renderOrder = ATTACK_UI_RENDER_ORDER
  return marker
}

function createAttackSlash(color) {
  const slash = new THREE.Group()
  slash.rotation.x = -Math.PI / 2
  slash.renderOrder = ATTACK_UI_RENDER_ORDER
  const materials = []
  const pieces = [
    { width: 2.5, height: 0.24, angle: Math.PI / 4 },
    { width: 1.95, height: 0.16, angle: Math.PI / 4, x: 0.22, z: -0.18 },
    { width: 2.15, height: 0.18, angle: -Math.PI / 4, x: -0.18, z: 0.16 },
  ]

  for (const pieceDef of pieces) {
    const piece = new THREE.Mesh(
      new THREE.PlaneGeometry(pieceDef.width, pieceDef.height),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      })
    )
    piece.position.set(pieceDef.x || 0, 0, pieceDef.z || 0)
    piece.rotation.z = pieceDef.angle
    piece.renderOrder = ATTACK_UI_RENDER_ORDER
    slash.add(piece)
    materials.push(piece.material)
  }

  slash.userData.materials = materials
  return slash
}

function createDefenseShield(color, accent) {
  const shield = new THREE.Group()
  const materials = []

  const shell = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.02, 1),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  shield.add(shell)
  materials.push(shell.material)

  const ringA = new THREE.Mesh(
    new THREE.TorusGeometry(1.04, 0.085, 10, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  ringA.rotation.x = Math.PI / 2
  shield.add(ringA)
  materials.push(ringA.material)

  const ringB = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.055, 10, 28),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  ringB.rotation.z = Math.PI / 2
  shield.add(ringB)
  materials.push(ringB.material)

  shield.userData.materials = materials
  return shield
}

function createStaminaOrbit(color, accent) {
  const orbit = new THREE.Group()
  const primary = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.05, 10, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  primary.rotation.x = Math.PI / 2
  orbit.add(primary)

  const secondary = new THREE.Mesh(
    new THREE.TorusGeometry(1.12, 0.03, 8, 36),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  secondary.rotation.x = Math.PI / 3
  secondary.rotation.z = Math.PI / 5
  orbit.add(secondary)

  orbit.userData.primaryMaterial = primary.material
  orbit.userData.secondaryMaterial = secondary.material
  orbit.userData.secondaryMesh = secondary
  return orbit
}

function createRubberAura(color, accent) {
  const aura = new THREE.Group()
  const rimGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.84, 0.07, 10, 42),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  rimGlow.rotation.x = Math.PI / 2
  rimGlow.position.y = 0.02
  aura.add(rimGlow)

  const hotEdge = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.026, 8, 36),
    new THREE.MeshBasicMaterial({
      color: 0xd18bff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  hotEdge.rotation.x = Math.PI / 2
  hotEdge.rotation.z = Math.PI / 5
  hotEdge.position.y = 0.04
  aura.add(hotEdge)

  const edgeSlashA = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.03, 8, 20, Math.PI * 0.46),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  edgeSlashA.rotation.x = Math.PI / 2
  edgeSlashA.rotation.z = Math.PI / 3
  edgeSlashA.position.y = 0.06
  aura.add(edgeSlashA)

  const edgeSlashB = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.03, 8, 20, Math.PI * 0.36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  edgeSlashB.rotation.x = Math.PI / 2
  edgeSlashB.rotation.z = -Math.PI / 4
  edgeSlashB.rotation.y = Math.PI * 0.72
  edgeSlashB.position.y = -0.01
  aura.add(edgeSlashB)

  aura.userData.outerMaterial = rimGlow.material
  aura.userData.shellMaterial = hotEdge.material
  aura.userData.shellMesh = hotEdge
  aura.userData.innerMaterial = edgeSlashA.material
  aura.userData.innerMesh = edgeSlashA
  aura.userData.accentMaterial = edgeSlashB.material
  aura.userData.accentMesh = edgeSlashB
  return aura
}

function createRubberDrainParticles(color, accent) {
  const particles = new THREE.Group()
  const materials = []
  const pieces = []
  for (let index = 0; index < 24; index += 1) {
    const size = 0.035 + (index % 4) * 0.012
    const piece = new THREE.Mesh(
      new THREE.SphereGeometry(size, 8, 8),
      new THREE.MeshBasicMaterial({
        color: index % 2 === 0 ? accent : color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    piece.visible = false
    piece.userData.delay = (index % 12) * 0.04 + Math.floor(index / 12) * 0.025
    piece.userData.lane = ((index % 6) - 2.5) * 0.085
    piece.userData.lift = 0.03 + (index % 5) * 0.022
    piece.userData.phase = index * 0.7
    piece.userData.angle = (index / 24) * Math.PI * 2 + (index % 3) * 0.18
    piece.userData.burstRadius = 0.48 + (index % 4) * 0.12
    piece.userData.arcLift = 0.42 + (index % 5) * 0.08
    particles.add(piece)
    pieces.push(piece)
    materials.push(piece.material)
  }
  particles.userData.pieces = pieces
  particles.userData.materials = materials
  return particles
}

function createRubberDrainTrail(color) {
  const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 7 }, () => new THREE.Vector3()))
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    })
  )
  line.renderOrder = ATTACK_UI_RENDER_ORDER
  line.visible = false
  return line
}

function createTrickMirage(color, accent) {
  const mirage = new THREE.Group()
  const materials = []

  const core = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.045, 8, 36),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  core.rotation.x = Math.PI / 2
  mirage.add(core)
  materials.push(core.material)

  const arcMeshes = []
  for (let index = 0; index < 3; index += 1) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(0.94, 0.035, 8, 28, Math.PI * 0.42),
      new THREE.MeshBasicMaterial({
        color: index === 1 ? 0xf7ff93 : accent,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    arc.rotation.x = Math.PI / 2
    arc.rotation.z = index * (Math.PI * 2 / 3) + 0.4
    arc.position.y = 0.02 + index * 0.01
    mirage.add(arc)
    arcMeshes.push(arc)
    materials.push(arc.material)
  }

  const shardMeshes = []
  for (let index = 0; index < 3; index += 1) {
    const shard = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.035, 0.14),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    shard.position.y = 0.12
    mirage.add(shard)
    shardMeshes.push(shard)
    materials.push(shard.material)
  }

  mirage.userData.materials = materials
  mirage.userData.arcMeshes = arcMeshes
  mirage.userData.shardMeshes = shardMeshes
  return mirage
}

function createTrickEchoes(color, accent) {
  const echoes = new THREE.Group()
  const states = []
  for (let index = 0; index < 3; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.56, 0.98, 28),
      new THREE.MeshBasicMaterial({
        color: index === 1 ? accent : color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.visible = false
    echoes.add(mesh)
    states.push({ mesh, material: mesh.material, life: 0, baseScale: 1 })
  }
  echoes.userData.echoes = states
  return echoes
}

function createTrickFlash(accent) {
  const flash = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 1.18, 36),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  )
  flash.rotation.x = -Math.PI / 2
  flash.visible = false
  return flash
}

function setMarkerOpacity(marker, opacity) {
  for (const material of marker.userData.materials || []) {
    material.opacity = opacity
  }
}

function spawnTrickEcho(blade, x, z, scale = 1) {
  const echoes = blade.trickEchoes?.userData?.echoes || []
  if (!echoes.length) return
  const echo = echoes[blade.trickEchoCursor % echoes.length]
  blade.trickEchoCursor = (blade.trickEchoCursor + 1) % echoes.length
  echo.life = TRICK_SPECIAL.echoDuration
  echo.baseScale = scale
  echo.mesh.visible = true
  echo.mesh.position.set(x, getSurfaceYAtXZ(x, z, 0.03), z)
  echo.mesh.scale.setScalar(scale)
  echo.material.opacity = 0.34
}

function hideBladeEffects(blade) {
  if (blade.lockRing) {
    blade.lockRing.visible = false
    setMarkerOpacity(blade.lockRing, 0)
  }
  if (blade.lockRingOuter) {
    blade.lockRingOuter.visible = false
    setMarkerOpacity(blade.lockRingOuter, 0)
  }
  if (blade.lockSlash) {
    blade.lockSlash.visible = false
    setMarkerOpacity(blade.lockSlash, 0)
  }
  if (blade.lockFlash) {
    blade.lockFlash.visible = false
    blade.lockFlash.material.opacity = 0
  }
  if (blade.lockBeam) {
    blade.lockBeam.visible = false
    blade.lockBeam.material.opacity = 0
  }
  if (blade.defenseShield) {
    blade.defenseShield.visible = false
    setMarkerOpacity(blade.defenseShield, 0)
  }
  if (blade.defenseShieldBurst) {
    blade.defenseShieldBurst.visible = false
    blade.defenseShieldBurst.material.opacity = 0
  }
  if (blade.staminaOrbit) {
    blade.staminaOrbit.visible = false
    blade.staminaOrbit.userData.primaryMaterial.opacity = 0
    blade.staminaOrbit.userData.secondaryMaterial.opacity = 0
  }
  if (blade.staminaFloorRing) {
    blade.staminaFloorRing.visible = false
    blade.staminaFloorRing.material.opacity = 0
  }
  if (blade.staminaPulse) {
    blade.staminaPulse.visible = false
    blade.staminaPulse.material.opacity = 0
  }
  if (blade.rubberAura) {
    blade.rubberAura.visible = false
    blade.rubberAura.userData.outerMaterial.opacity = 0
    blade.rubberAura.userData.shellMaterial.opacity = 0
    blade.rubberAura.userData.innerMaterial.opacity = 0
    blade.rubberAura.userData.accentMaterial.opacity = 0
  }
  if (blade.rubberFloorRing) {
    blade.rubberFloorRing.visible = false
    blade.rubberFloorRing.material.opacity = 0
  }
  if (blade.rubberPulse) {
    blade.rubberPulse.visible = false
    blade.rubberPulse.material.opacity = 0
  }
  if (blade.rubberDrainParticles) {
    blade.rubberDrainParticles.visible = false
    setMarkerOpacity(blade.rubberDrainParticles, 0)
    for (const piece of blade.rubberDrainParticles.userData.pieces || []) piece.visible = false
  }
  if (blade.rubberDrainTrail) {
    blade.rubberDrainTrail.visible = false
    blade.rubberDrainTrail.material.opacity = 0
  }
  if (blade.trickMirage) {
    blade.trickMirage.visible = false
    setMarkerOpacity(blade.trickMirage, 0)
  }
  if (blade.trickFlash) {
    blade.trickFlash.visible = false
    blade.trickFlash.material.opacity = 0
  }
  if (blade.trickEchoes) {
    blade.trickEchoes.visible = false
    for (const echo of blade.trickEchoes.userData.echoes || []) {
      echo.life = 0
      echo.mesh.visible = false
      echo.material.opacity = 0
    }
  }
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

function getBladeTarget(runtimeState, blade) {
  return blade.attackTargetId ? runtimeState.bladesById.get(blade.attackTargetId) || null : null
}

function rollCpuLaunchProfile(blade) {
  const profile = CPU_LAUNCH.buildProfiles[blade.key] || CPU_LAUNCH
  blade.cpuLaunchCharge = clamp01(profile.baseCharge + (Math.random() * 2 - 1) * profile.chargeVariance)
  blade.cpuLaunchAngle = blade.spawn.angle + (Math.random() * 2 - 1) * profile.angleVariance
}

function createEmptyPlayerRecord() {
  return {
    cpu: { wins: 0, losses: 0 },
    player: { wins: 0, losses: 0 },
  }
}

function createEmptyBladeLifetimeStats() {
  return {
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    roundsWon: 0,
    roundsLost: 0,
    ultsUsed: 0,
    ringOutWins: 0,
    spinOutWins: 0,
    ringOutLosses: 0,
    spinOutLosses: 0,
  }
}

function createEmptyPlayerStats() {
  const blades = Object.fromEntries(Object.keys(BUILD_DEFS).map((key) => [key, createEmptyBladeLifetimeStats()]))
  return {
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    roundsWon: 0,
    roundsLost: 0,
    ultsUsed: 0,
    finishWins: { ringOut: 0, spinOut: 0 },
    finishLosses: { ringOut: 0, spinOut: 0 },
    modes: {
      cpu: { matchesPlayed: 0, matchesWon: 0, matchesLost: 0 },
      player: { matchesPlayed: 0, matchesWon: 0, matchesLost: 0 },
    },
    blades,
  }
}

function normalizePlayerRecord(record) {
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

function normalizePlayerStats(stats) {
  const source = stats || {}
  const normalized = createEmptyPlayerStats()
  normalized.matchesPlayed = Math.max(0, Number(source.matchesPlayed) || 0)
  normalized.matchesWon = Math.max(0, Number(source.matchesWon) || 0)
  normalized.matchesLost = Math.max(0, Number(source.matchesLost) || 0)
  normalized.roundsWon = Math.max(0, Number(source.roundsWon) || 0)
  normalized.roundsLost = Math.max(0, Number(source.roundsLost) || 0)
  normalized.ultsUsed = Math.max(0, Number(source.ultsUsed) || 0)
  normalized.finishWins.ringOut = Math.max(0, Number(source.finishWins?.ringOut) || 0)
  normalized.finishWins.spinOut = Math.max(0, Number(source.finishWins?.spinOut) || 0)
  normalized.finishLosses.ringOut = Math.max(0, Number(source.finishLosses?.ringOut) || 0)
  normalized.finishLosses.spinOut = Math.max(0, Number(source.finishLosses?.spinOut) || 0)
  for (const mode of ['cpu', 'player']) {
    normalized.modes[mode].matchesPlayed = Math.max(0, Number(source.modes?.[mode]?.matchesPlayed) || 0)
    normalized.modes[mode].matchesWon = Math.max(0, Number(source.modes?.[mode]?.matchesWon) || 0)
    normalized.modes[mode].matchesLost = Math.max(0, Number(source.modes?.[mode]?.matchesLost) || 0)
  }
  for (const bladeKey of Object.keys(BUILD_DEFS)) {
    const bladeSource = source.blades?.[bladeKey] || {}
    normalized.blades[bladeKey] = {
      matchesPlayed: Math.max(0, Number(bladeSource.matchesPlayed) || 0),
      matchesWon: Math.max(0, Number(bladeSource.matchesWon) || 0),
      matchesLost: Math.max(0, Number(bladeSource.matchesLost) || 0),
      roundsWon: Math.max(0, Number(bladeSource.roundsWon) || 0),
      roundsLost: Math.max(0, Number(bladeSource.roundsLost) || 0),
      ultsUsed: Math.max(0, Number(bladeSource.ultsUsed) || 0),
      ringOutWins: Math.max(0, Number(bladeSource.ringOutWins) || 0),
      spinOutWins: Math.max(0, Number(bladeSource.spinOutWins) || 0),
      ringOutLosses: Math.max(0, Number(bladeSource.ringOutLosses) || 0),
      spinOutLosses: Math.max(0, Number(bladeSource.spinOutLosses) || 0),
    }
  }
  return normalized
}

function normalizeFinishStatKey(value) {
  return value === 'ring_out' || value === 'Ring Out' || value === 'ringOut' ? 'ringOut' : 'spinOut'
}

function loadStoredBuild() {
  if (typeof window === 'undefined') return 'attack'
  const storedBuild = window.localStorage.getItem(SELECTED_BUILD_STORAGE_KEY)
  return storedBuild && BUILD_DEFS[storedBuild] ? storedBuild : 'attack'
}

function storeSelectedBuild(build) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SELECTED_BUILD_STORAGE_KEY, build)
}

function loadStoredPlayerRecord() {
  if (typeof window === 'undefined') return createEmptyPlayerRecord()
  try {
    const storedRecord = window.localStorage.getItem(PLAYER_RECORD_STORAGE_KEY)
    return storedRecord ? normalizePlayerRecord(JSON.parse(storedRecord)) : createEmptyPlayerRecord()
  } catch {
    return createEmptyPlayerRecord()
  }
}

function storePlayerRecord(record) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PLAYER_RECORD_STORAGE_KEY, JSON.stringify(normalizePlayerRecord(record)))
}

function loadStoredPlayerStats() {
  if (typeof window === 'undefined') return createEmptyPlayerStats()
  try {
    const storedStats = window.localStorage.getItem(PLAYER_STATS_STORAGE_KEY)
    return storedStats ? normalizePlayerStats(JSON.parse(storedStats)) : createEmptyPlayerStats()
  } catch {
    return createEmptyPlayerStats()
  }
}

function storePlayerStats(stats) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PLAYER_STATS_STORAGE_KEY, JSON.stringify(normalizePlayerStats(stats)))
}

export function useBeybladeSimulation(mountRef, roomApi = null) {
  const { beep, noiseBurst } = useAudio()

  const selectedBuild = ref(loadStoredBuild())
  const playerRecord = ref(loadStoredPlayerRecord())
  const playerStats = ref(loadStoredPlayerStats())
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

  function updatePlayerStats(mutator) {
    const nextStats = normalizePlayerStats(playerStats.value)
    mutator(nextStats)
    playerStats.value = nextStats
    storePlayerStats(nextStats)
  }

  function commitPlayerRecord(matchType, didWin) {
    const nextRecord = normalizePlayerRecord(playerRecord.value)
    nextRecord[matchType][didWin ? 'wins' : 'losses'] += 1
    playerRecord.value = nextRecord
    storePlayerRecord(nextRecord)
    if (roomApi?.room?.value) {
      roomApi.updateProfile({
        name: roomApi.playerName.value,
        build: selectedBuild.value,
        record: nextRecord,
      })
    }
  }

  function commitRoundStats(runtimeState, winnerId, finishType, localDeathType = null) {
    if (runtimeState.lastRecordedRound === runtimeState.round) return
    const didWin = winnerId === runtimeState.localPlayerId
    const finishKey = normalizeFinishStatKey(didWin ? finishType : localDeathType)
    updatePlayerStats((stats) => {
      stats[didWin ? 'roundsWon' : 'roundsLost'] += 1
      const bladeStats = stats.blades[runtimeState.localBuildKey] || createEmptyBladeLifetimeStats()
      bladeStats[didWin ? 'roundsWon' : 'roundsLost'] += 1
      if (didWin) {
        stats.finishWins[finishKey] += 1
        bladeStats[finishKey === 'ringOut' ? 'ringOutWins' : 'spinOutWins'] += 1
      } else {
        stats.finishLosses[finishKey] += 1
        bladeStats[finishKey === 'ringOut' ? 'ringOutLosses' : 'spinOutLosses'] += 1
      }
      stats.blades[runtimeState.localBuildKey] = bladeStats
    })
    runtimeState.lastRecordedRound = runtimeState.round
  }

  function commitUltUse(buildKey) {
    updatePlayerStats((stats) => {
      stats.ultsUsed += 1
      const bladeStats = stats.blades[buildKey] || createEmptyBladeLifetimeStats()
      bladeStats.ultsUsed += 1
      stats.blades[buildKey] = bladeStats
    })
  }

  function commitDetailedMatchStats(runtimeState, didWin) {
    updatePlayerStats((stats) => {
      stats.matchesPlayed += 1
      stats[didWin ? 'matchesWon' : 'matchesLost'] += 1
      stats.modes[runtimeState.matchStatKey].matchesPlayed += 1
      stats.modes[runtimeState.matchStatKey][didWin ? 'matchesWon' : 'matchesLost'] += 1
      const bladeStats = stats.blades[runtimeState.localBuildKey] || createEmptyBladeLifetimeStats()
      bladeStats.matchesPlayed += 1
      bladeStats[didWin ? 'matchesWon' : 'matchesLost'] += 1
      stats.blades[runtimeState.localBuildKey] = bladeStats
    })
  }

  function commitMatchRecord(runtimeState, winnerId) {
    if (runtimeState.recordCommitted) return
    const didWin = winnerId === runtimeState.localPlayerId
    commitPlayerRecord(runtimeState.matchStatKey, didWin)
    commitDetailedMatchStats(runtimeState, didWin)
    runtimeState.recordCommitted = true
  }

  function buildOnlineMatchSummary(runtimeState) {
    if (!runtimeState.networked || !roundResult.value?.winner) return null
    return {
      completedAt: new Date().toISOString(),
      roomType: runtimeState.type,
      scoreToWin: runtimeState.scoreToWin,
      round: runtimeState.round,
      winnerId: roundResult.value.winner,
      outcome: roundResult.value.outcome,
      finishType: roundResult.value.type,
      scores: { ...runtimeState.scores },
      participants: runtimeState.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        build: participant.build,
        score: runtimeState.scores[participant.id] || 0,
      })),
    }
  }

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
          silentOrbitPulse: blade.silentOrbitPulse,
          vampireDrain: blade.vampireDrain,
          rubberDrainBurst: blade.rubberDrainBurst,
          rubberDrainTargetId: blade.rubberDrainTargetId,
          rubberDrainPulse: blade.rubberDrainPulse,
          trickPhantomTimer: blade.trickPhantomTimer,
          trickStepCooldown: blade.trickStepCooldown,
          trickDodgeTimer: blade.trickDodgeTimer,
          trickCounterTimer: blade.trickCounterTimer,
          trickPulseTimer: blade.trickPulseTimer,
          defenseReflectFlash: blade.defenseReflectFlash,
          smashWindow: blade.smashWindow,
          attackLockTimer: blade.attackLockTimer,
          attackRushTimer: blade.attackRushTimer,
          attackCommitTimer: blade.attackCommitTimer,
          attackTargetId: blade.attackTargetId,
          attackSnapTimer: blade.attackSnapTimer,
          attackSlashTimer: blade.attackSlashTimer,
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
    const specialReady = blade.special >= 100
    const corePulse = 1 + Math.sin(now * 0.02 + t.x * 0.6 + t.z * 0.6) * 0.08
    const coreGlow = Math.max(specialReady ? 0.85 : 0, blade.ultGlow * 0.75)
    blade.aura.material.opacity = coreGlow
    blade.aura.scale.setScalar((specialReady ? 1.12 : 0.9) * corePulse + blade.ultGlow * 0.22)
    blade.bladeLight.position.set(t.x, surfaceY + 0.38, t.z)
    blade.bladeLight.intensity = blade.ultGlow * 24 + blade.lastImpact * 5

    const orbitActive = blade.key === 'stamina' && blade.alive && (blade.silentOrbit > 0 || blade.silentOrbitPulse > 0)
    blade.staminaOrbit.visible = orbitActive
    blade.staminaFloorRing.visible = orbitActive
    blade.staminaPulse.visible = orbitActive && blade.silentOrbitPulse > 0
    if (orbitActive) {
      const orbitRatio = clamp01(blade.silentOrbit / STAMINA_SPECIAL.duration)
      const pulseProgress = blade.silentOrbitPulse > 0
        ? 1 - clamp01(blade.silentOrbitPulse / STAMINA_SPECIAL.pulseDuration)
        : 1
      const flow = 1 + Math.sin(now * 0.018 + t.x * 0.35 + t.z * 0.35) * 0.05
      blade.staminaOrbit.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
      blade.staminaOrbit.quaternion.copy(blade.mesh.quaternion)
      blade.staminaOrbit.scale.setScalar((0.98 + orbitRatio * 0.12 + (1 - pulseProgress) * 0.08) * flow)
      blade.staminaOrbit.userData.primaryMaterial.opacity = 0.18 + orbitRatio * 0.22
      blade.staminaOrbit.userData.secondaryMaterial.opacity = 0.12 + orbitRatio * 0.16
      blade.staminaOrbit.userData.secondaryMesh.rotation.y = now * 0.0032

      blade.staminaFloorRing.position.set(t.x, getSurfaceYAtXZ(t.x, t.z, 0.03), t.z)
      blade.staminaFloorRing.scale.setScalar(1.02 + orbitRatio * 0.18)
      blade.staminaFloorRing.material.opacity = 0.16 + orbitRatio * 0.22

      if (blade.staminaPulse.visible) {
        blade.staminaPulse.position.set(t.x, getSurfaceYAtXZ(t.x, t.z, 0.045), t.z)
        blade.staminaPulse.scale.setScalar(0.82 + pulseProgress * 1.18)
        blade.staminaPulse.material.opacity = (1 - pulseProgress) * 0.8
      } else {
        blade.staminaPulse.material.opacity = 0
      }
    } else {
      blade.staminaOrbit.userData.primaryMaterial.opacity = 0
      blade.staminaOrbit.userData.secondaryMaterial.opacity = 0
      blade.staminaFloorRing.material.opacity = 0
      blade.staminaPulse.material.opacity = 0
    }

    const rubberActive = blade.key === 'rubber' && blade.alive && (blade.vampireDrain > 0 || blade.rubberDrainPulse > 0)
    blade.rubberAura.visible = rubberActive
    blade.rubberFloorRing.visible = rubberActive
    blade.rubberPulse.visible = rubberActive && blade.rubberDrainPulse > 0
    if (rubberActive) {
      const drainRatio = clamp01(blade.vampireDrain / RUBBER_SPECIAL.duration)
      const pulseProgress = blade.rubberDrainPulse > 0
        ? 1 - clamp01(blade.rubberDrainPulse / RUBBER_SPECIAL.pulseDuration)
        : 1
      blade.rubberAura.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
      blade.rubberAura.quaternion.copy(blade.mesh.quaternion)
      blade.rubberAura.scale.setScalar(1.01 + drainRatio * 0.1 + (1 - pulseProgress) * 0.08)
      blade.rubberAura.userData.outerMaterial.opacity = 0.24 + drainRatio * 0.24
      blade.rubberAura.userData.shellMaterial.opacity = 0.18 + drainRatio * 0.2
      blade.rubberAura.userData.innerMaterial.opacity = 0.22 + drainRatio * 0.22
      blade.rubberAura.userData.accentMaterial.opacity = 0.16 + drainRatio * 0.18
      blade.rubberAura.userData.shellMesh.rotation.y = now * 0.0028
      blade.rubberAura.userData.innerMesh.rotation.y = now * -0.0042
      blade.rubberAura.userData.accentMesh.rotation.y = now * 0.0053

      blade.rubberFloorRing.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
      blade.rubberFloorRing.quaternion.copy(blade.mesh.quaternion)
      blade.rubberFloorRing.scale.setScalar(1 + drainRatio * 0.1)
      blade.rubberFloorRing.material.opacity = 0.16 + drainRatio * 0.18

      if (blade.rubberPulse.visible) {
        blade.rubberPulse.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
        blade.rubberPulse.quaternion.copy(blade.mesh.quaternion)
        blade.rubberPulse.scale.setScalar(0.9 + pulseProgress * 0.36)
        blade.rubberPulse.material.opacity = (1 - pulseProgress) * 0.68
      } else {
        blade.rubberPulse.material.opacity = 0
      }
    } else {
      blade.rubberAura.userData.outerMaterial.opacity = 0
      blade.rubberAura.userData.shellMaterial.opacity = 0
      blade.rubberAura.userData.innerMaterial.opacity = 0
      blade.rubberAura.userData.accentMaterial.opacity = 0
      blade.rubberFloorRing.material.opacity = 0
      blade.rubberPulse.material.opacity = 0
    }

    const drainTarget = blade.rubberDrainTargetId && runtime?.bladesById?.get(blade.rubberDrainTargetId)
    const drainBurstActive = blade.key === 'rubber' && blade.alive && blade.rubberDrainBurst > 0 && drainTarget?.alive
    blade.rubberDrainParticles.visible = drainBurstActive
    blade.rubberDrainTrail.visible = drainBurstActive
    if (drainBurstActive) {
      const targetPos = drainTarget.rb.translation()
      const sourcePos = blade.rb.translation()
      const startY = getSurfaceYAtXZ(targetPos.x, targetPos.z, 0.26)
      const endY = getSurfaceYAtXZ(sourcePos.x, sourcePos.z, 0.24)
      const burstProgress = 1 - clamp01(blade.rubberDrainBurst / RUBBER_SPECIAL.burstDuration)
      const pieces = blade.rubberDrainParticles.userData.pieces || []
      const materials = blade.rubberDrainParticles.userData.materials || []
      const dx = sourcePos.x - targetPos.x
      const dz = sourcePos.z - targetPos.z
      const dist = Math.hypot(dx, dz) || 1
      const sideX = -dz / dist
      const sideZ = dx / dist
      const trailControlX = targetPos.x + dx * 0.24 + sideX * 0.95
      const trailControlY = mix(startY, endY, 0.38) + 1.1
      const trailControlZ = targetPos.z + dz * 0.24 + sideZ * 0.95
      const trailPoints = []
      for (let step = 0; step <= 6; step += 1) {
        const u = step / 6
        const invU = 1 - u
        trailPoints.push(new THREE.Vector3(
          invU * invU * targetPos.x + 2 * invU * u * trailControlX + u * u * sourcePos.x,
          invU * invU * startY + 2 * invU * u * trailControlY + u * u * endY,
          invU * invU * targetPos.z + 2 * invU * u * trailControlZ + u * u * sourcePos.z,
        ))
      }
      blade.rubberDrainTrail.geometry.setFromPoints(trailPoints)
      blade.rubberDrainTrail.material.opacity = clamp01(0.3 + (1 - burstProgress) * 0.22)
      pieces.forEach((piece, index) => {
        const delay = piece.userData.delay || 0
        const travel = clamp01((burstProgress - delay) / Math.max(0.12, 1 - delay))
        const arriveFade = clamp01((1 - travel) / 0.22)
        const spawnFade = clamp01((burstProgress - delay) / 0.08)
        const visible = burstProgress > delay && arriveFade > 0.001
        piece.visible = visible
        if (!visible) {
          materials[index].opacity = 0
          return
        }
        const lane = piece.userData.lane || 0
        const lift = piece.userData.lift || 0
        const phase = piece.userData.phase || 0
        const angle = piece.userData.angle || 0
        const burstRadius = piece.userData.burstRadius || 0.4
        const arcLift = piece.userData.arcLift || 0.4
        const burstDirX = Math.cos(angle)
        const burstDirZ = Math.sin(angle)
        const curveT = Math.pow(travel, 0.78)
        const invT = 1 - curveT
        const controlX = targetPos.x + burstDirX * burstRadius + sideX * lane * 0.55 + dx * 0.18
        const controlY = startY + arcLift + lift
        const controlZ = targetPos.z + burstDirZ * burstRadius + sideZ * lane * 0.55 + dz * 0.18
        const arcX = invT * invT * targetPos.x + 2 * invT * curveT * controlX + curveT * curveT * sourcePos.x
        const arcY = invT * invT * startY + 2 * invT * curveT * controlY + curveT * curveT * endY
        const arcZ = invT * invT * targetPos.z + 2 * invT * curveT * controlZ + curveT * curveT * sourcePos.z
        const swirl = Math.sin(now * 0.024 + phase) * 0.05 * invT
        piece.position.set(
          arcX + sideX * swirl,
          arcY + Math.sin(now * 0.03 + phase) * 0.028,
          arcZ - sideZ * swirl
        )
        piece.scale.setScalar(0.62 + invT * 0.95)
        materials[index].opacity = spawnFade * arriveFade * (0.78 + invT * 0.2)
      })
    } else {
      setMarkerOpacity(blade.rubberDrainParticles, 0)
      for (const piece of blade.rubberDrainParticles.userData.pieces || []) piece.visible = false
      blade.rubberDrainTrail.material.opacity = 0
    }

    const guardActive = blade.key === 'defense' && blade.alive && (blade.guarding > 0 || blade.defenseReflectFlash > 0)
    blade.defenseShield.visible = guardActive
    blade.defenseShieldBurst.visible = guardActive && blade.defenseReflectFlash > 0
    if (guardActive) {
      const time = performance.now()
      const guardRatio = clamp01(blade.guarding / DEFENSE_SPECIAL.guardDuration)
      const reflectRatio = clamp01(blade.defenseReflectFlash / DEFENSE_SPECIAL.reflectFlashDuration)
      const guardPulse = 1 + Math.sin(time * 0.024 + t.x * 0.8 + t.z * 0.8) * 0.045
      blade.defenseShield.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
      blade.defenseShield.scale.setScalar((1.02 + guardRatio * 0.06 + reflectRatio * 0.16) * guardPulse)
      blade.defenseShield.quaternion.copy(blade.mesh.quaternion)
      setMarkerOpacity(blade.defenseShield, 0.16 + guardRatio * 0.12 + reflectRatio * 0.28)

      blade.defenseShieldBurst.position.set(t.x, getSurfaceYAtXZ(t.x, t.z, 0.08), t.z)
      blade.defenseShieldBurst.scale.setScalar(0.88 + (1 - reflectRatio) * 0.82)
      blade.defenseShieldBurst.material.opacity = reflectRatio * 0.85
    } else {
      setMarkerOpacity(blade.defenseShield, 0)
      blade.defenseShieldBurst.material.opacity = 0
    }

    const trickEchoStates = blade.trickEchoes.userData.echoes || []
    const trickEchoActive = trickEchoStates.some((echo) => echo.life > 0)
    blade.trickEchoes.visible = trickEchoActive
    for (const echo of trickEchoStates) {
      const ratio = clamp01(echo.life / TRICK_SPECIAL.echoDuration)
      echo.mesh.visible = ratio > 0.001
      if (echo.mesh.visible) {
        echo.material.opacity = ratio * 0.34
        echo.mesh.scale.setScalar((echo.baseScale || 1) * (1.04 + (1 - ratio) * 0.26))
      } else {
        echo.material.opacity = 0
      }
    }

    const trickActive = blade.key === 'trick' && blade.alive && (blade.trickPhantomTimer > 0 || blade.trickPulseTimer > 0 || trickEchoActive)
    blade.trickMirage.visible = trickActive
    blade.trickFlash.visible = blade.key === 'trick' && blade.alive && blade.trickPulseTimer > 0
    if (trickActive) {
      const phantomRatio = clamp01(blade.trickPhantomTimer / TRICK_SPECIAL.duration)
      const pulseProgress = blade.trickPulseTimer > 0
        ? 1 - clamp01(blade.trickPulseTimer / TRICK_SPECIAL.pulseDuration)
        : 1
      const pulse = 1 + Math.sin(now * 0.034 + t.x * 0.7 + t.z * 0.45) * 0.08
      blade.trickMirage.position.set(t.x, surfaceY + STADIUM.bladeLift, t.z)
      blade.trickMirage.quaternion.copy(blade.mesh.quaternion)
      blade.trickMirage.scale.setScalar((0.98 + phantomRatio * 0.1 + (1 - pulseProgress) * 0.14) * pulse)
      setMarkerOpacity(blade.trickMirage, 0.16 + phantomRatio * 0.16 + (1 - pulseProgress) * 0.18)
      blade.trickMirage.userData.arcMeshes.forEach((mesh, index) => {
        mesh.rotation.z = now * (0.0024 + index * 0.0008) + index * (Math.PI * 2 / 3)
      })
      blade.trickMirage.userData.shardMeshes.forEach((mesh, index) => {
        const angle = now * 0.004 + index * (Math.PI * 2 / 3)
        mesh.position.set(Math.cos(angle) * 0.86, 0.08 + Math.sin(now * 0.006 + index) * 0.03, Math.sin(angle) * 0.86)
        mesh.rotation.y = -angle + Math.PI / 4
      })
    } else {
      setMarkerOpacity(blade.trickMirage, 0)
    }

    if (blade.trickFlash.visible) {
      const pulseProgress = 1 - clamp01(blade.trickPulseTimer / TRICK_SPECIAL.pulseDuration)
      blade.trickFlash.position.set(t.x, getSurfaceYAtXZ(t.x, t.z, 0.04), t.z)
      blade.trickFlash.scale.setScalar(0.88 + pulseProgress * 1.18)
      blade.trickFlash.material.opacity = (1 - pulseProgress) * 0.62
    } else {
      blade.trickFlash.material.opacity = 0
    }
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
    hideBladeEffects(blade)
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

  function burst(blade, powerScale = 1, aimDirection = null) {
    if (blade.boostCooldown > 0 || blade.spin < 7) return
    const lv = blade.rb.linvel()
    const boost = 4.5 * blade.def.stats.speed * powerScale
    if (aimDirection) {
      const currentSpeed = Math.hypot(lv.x, lv.z)
      const carrySpeed = Math.max(boost * 0.55, currentSpeed * 0.35)
      blade.rb.setLinvel({
        x: aimDirection.x * (carrySpeed + boost),
        y: 0,
        z: aimDirection.z * (carrySpeed + boost),
      }, true)
    } else {
      const mag = Math.hypot(lv.x, lv.z) || 1
      blade.rb.setLinvel({ x: lv.x + (lv.x / mag) * boost, y: 0, z: lv.z + (lv.z / mag) * boost }, true)
    }
    blade.spin = Math.max(0, blade.spin - 2.6)
    blade.boostCooldown = 0.6
    blade.lastImpact = 0.4
    beep({ freq: 480, duration: 0.05, type: 'square', gain: 0.018, slideTo: 260 })
  }

  function startAttackRush(blade, runtimeState, powerScale = ATTACK_SPECIAL.rushPowerScale) {
    const target = getBladeTarget(runtimeState, blade)
    const bladePos = blade.rb.translation()
    const targetPos = target?.rb.translation()
    const dx = targetPos ? targetPos.x - bladePos.x : 0
    const dz = targetPos ? targetPos.z - bladePos.z : 0
    const mag = Math.hypot(dx, dz)
    const aimDirection = mag > 0.001 ? { x: dx / mag, z: dz / mag } : null
    blade.smashWindow = Math.max(blade.smashWindow, ATTACK_SPECIAL.smashWindow)
    blade.attackRushTimer = ATTACK_SPECIAL.rushDuration
    blade.attackCommitTimer = ATTACK_SPECIAL.commitDuration
    blade.attackSlashTimer = ATTACK_SPECIAL.slashDuration
    burst(blade, powerScale, aimDirection)
    noiseBurst(0.06, 0.09)
    beep({ freq: 220, duration: 0.05, type: 'sawtooth', gain: 0.03, slideTo: 120 })
  }

  function performTrickStep(blade, runtimeState, preferredSign = null) {
    const pos = blade.rb.translation()
    const lv = blade.rb.linvel()
    const target = runtimeState ? pickNearestOpponent(runtimeState, blade) : null
    const currentSpeed = Math.hypot(lv.x, lv.z)
    const currentRadius = Math.hypot(pos.x, pos.z)
    const safeRadius = STADIUM.lipRadius - TRICK_SPECIAL.safeEdgeBuffer
    const inwardStrength = currentRadius > STADIUM.flatRadius
      ? clamp01((currentRadius - STADIUM.flatRadius) / Math.max(0.001, safeRadius - STADIUM.flatRadius))
      : 0
    const inwardX = currentRadius > 0.001 ? -pos.x / currentRadius : 0
    const inwardZ = currentRadius > 0.001 ? -pos.z / currentRadius : 0

    let dirX = 0
    let dirZ = 0
    if (target) {
      const tp = target.rb.translation()
      const dx = tp.x - pos.x
      const dz = tp.z - pos.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.001 && dist <= TRICK_SPECIAL.maxTargetDist) {
        dirX = dx / dist
        dirZ = dz / dist
      }
    }
    if (Math.hypot(dirX, dirZ) < 0.001) {
      if (currentSpeed > 0.001) {
        dirX = lv.x / currentSpeed
        dirZ = lv.z / currentSpeed
      } else {
        dirX = Math.cos(blade.launchAngle)
        dirZ = Math.sin(blade.launchAngle)
      }
    }

    const desiredSign = preferredSign || blade.trickStepSign || 1
    let chosen = null
    for (const sign of [desiredSign, -desiredSign]) {
      const sideX = -dirZ * sign
      const sideZ = dirX * sign
      const candidateX = pos.x
        + sideX * TRICK_SPECIAL.stepDistance
        + dirX * TRICK_SPECIAL.forwardCarryDistance
        + inwardX * TRICK_SPECIAL.inwardBiasDistance * inwardStrength
      const candidateZ = pos.z
        + sideZ * TRICK_SPECIAL.stepDistance
        + dirZ * TRICK_SPECIAL.forwardCarryDistance
        + inwardZ * TRICK_SPECIAL.inwardBiasDistance * inwardStrength
      const candidateRadius = Math.hypot(candidateX, candidateZ)
      if (candidateRadius <= safeRadius) {
        chosen = { sign, sideX, sideZ, x: candidateX, z: candidateZ }
        break
      }
    }
    if (!chosen) return false

    spawnTrickEcho(blade, pos.x, pos.z, 0.92)
    blade.rb.setTranslation({ x: chosen.x, y: 0.22, z: chosen.z }, true)
    const carrySpeed = Math.max(currentSpeed * 0.72, TRICK_SPECIAL.stepVelocity)
    let nextVx = chosen.sideX * carrySpeed + dirX * carrySpeed * TRICK_SPECIAL.forwardCarryVelocity + inwardX * carrySpeed * inwardStrength * 0.22
    let nextVz = chosen.sideZ * carrySpeed + dirZ * carrySpeed * TRICK_SPECIAL.forwardCarryVelocity + inwardZ * carrySpeed * inwardStrength * 0.22
    const chosenRadius = Math.hypot(chosen.x, chosen.z)
    if (chosenRadius > 0.001) {
      const outwardX = chosen.x / chosenRadius
      const outwardZ = chosen.z / chosenRadius
      const outwardSpeed = nextVx * outwardX + nextVz * outwardZ
      if (outwardSpeed > 0) {
        nextVx -= outwardX * outwardSpeed * TRICK_SPECIAL.edgeOutwardDamping
        nextVz -= outwardZ * outwardSpeed * TRICK_SPECIAL.edgeOutwardDamping
      }
    }
    blade.rb.setLinvel({ x: nextVx, y: 0, z: nextVz }, true)
    blade.trickStepSign = -chosen.sign
    blade.trickStepCooldown = TRICK_SPECIAL.stepCooldown
    blade.trickDodgeTimer = TRICK_SPECIAL.dodgeDuration
    blade.trickCounterTimer = TRICK_SPECIAL.counterDuration
    blade.trickPulseTimer = TRICK_SPECIAL.pulseDuration
    blade.ultGlow = Math.max(blade.ultGlow, 0.85)
    blade.lastImpact = Math.max(blade.lastImpact, 0.62)
    beep({ freq: 760, duration: 0.03, type: 'square', gain: 0.017, slideTo: 1020 })
    return true
  }

  function stabilise(blade, dt) {
    if (blade.spin < 3) return
    blade.spin = Math.max(0, blade.spin - 3.2 * dt)
    blade.wobble = Math.max(0.008, blade.wobble - 1.9 * dt)
    const lv = blade.rb.linvel()
    blade.rb.setLinvel({ x: lv.x * (1 - 0.8 * dt), y: 0, z: lv.z * (1 - 0.8 * dt) }, true)
  }

  function pickNearestOpponent(runtimeState, sourceBlade) {
    let best = null
    let bestDist = Number.POSITIVE_INFINITY
    const sourcePos = sourceBlade.rb.translation()
    for (const blade of runtimeState.blades) {
      if (blade.id === sourceBlade.id || !blade.alive) continue
      const otherPos = blade.rb.translation()
      const dist = Math.hypot(otherPos.x - sourcePos.x, otherPos.z - sourcePos.z)
      if (dist < bestDist) {
        bestDist = dist
        best = blade
      }
    }
    return best
  }

  function triggerSpecial(blade, runtimeState) {
    if (blade.special < 100) return
    blade.special = 0
    blade.lastImpact = 0.8
    blade.ultGlow = 1
    if (runtimeState && blade.id === runtimeState.localPlayerId) {
      commitUltUse(runtimeState.localBuildKey)
    }
    status.value = `${blade.name} used ${blade.def.specialName}!`
    if (blade.key === 'attack') {
      const target = runtimeState ? pickNearestOpponent(runtimeState, blade) : null
      blade.attackTargetId = target?.id || null
      blade.attackLockTimer = target ? ATTACK_SPECIAL.lockDuration : 0
      blade.attackRushTimer = 0
      blade.attackCommitTimer = target ? ATTACK_SPECIAL.lockDuration : ATTACK_SPECIAL.commitDuration * 0.72
      blade.attackSnapTimer = target ? ATTACK_SPECIAL.snapDuration : 0
      blade.attackSlashTimer = 0
      if (target) {
        status.value = `${blade.name} locked onto ${target.name}!`
        beep({ freq: 780, duration: 0.04, type: 'square', gain: 0.02, slideTo: 860 })
      } else {
        startAttackRush(blade, runtimeState, ATTACK_SPECIAL.fallbackPowerScale)
      }
    } else if (blade.key === 'defense') {
      blade.guarding = DEFENSE_SPECIAL.guardDuration
      blade.wobble *= DEFENSE_SPECIAL.wobbleScale
      blade.defenseReflectFlash = DEFENSE_SPECIAL.reflectFlashDuration * 0.7
    } else if (blade.key === 'stamina') {
      blade.silentOrbit = STAMINA_SPECIAL.duration
      blade.silentOrbitPulse = STAMINA_SPECIAL.pulseDuration
      blade.wobble *= STAMINA_SPECIAL.wobbleScale
      const lv = blade.rb.linvel()
      const pos = blade.rb.translation()
      const radius = Math.hypot(pos.x, pos.z)
      const inward = radius > STAMINA_SPECIAL.recenterStartRadius
        ? clamp01((radius - STAMINA_SPECIAL.recenterStartRadius) / (STADIUM.lipRadius - STAMINA_SPECIAL.recenterStartRadius))
        : 0
      const nx = radius > 0.001 ? pos.x / radius : 0
      const nz = radius > 0.001 ? pos.z / radius : 0
      blade.rb.setLinvel({
        x: lv.x * STAMINA_SPECIAL.activationVelocityCleanse - nx * inward * 1.8,
        y: 0,
        z: lv.z * STAMINA_SPECIAL.activationVelocityCleanse - nz * inward * 1.8,
      }, true)
      if (blade.spin < STAMINA_SPECIAL.activationRefundThreshold) {
        blade.spin = Math.min(80, blade.spin + STAMINA_SPECIAL.activationRefund)
      }
      beep({ freq: 430, duration: 0.08, type: 'triangle', gain: 0.022, slideTo: 760 })
    } else if (blade.key === 'rubber') {
      blade.vampireDrain = RUBBER_SPECIAL.duration
      blade.rubberDrainPulse = RUBBER_SPECIAL.pulseDuration
      beep({ freq: 320, duration: 0.08, type: 'sawtooth', gain: 0.024, slideTo: 180 })
    } else if (blade.key === 'trick') {
      blade.trickPhantomTimer = TRICK_SPECIAL.duration
      blade.trickStepCooldown = 0
      blade.trickDodgeTimer = 0
      blade.trickCounterTimer = 0
      blade.trickPulseTimer = TRICK_SPECIAL.pulseDuration
      performTrickStep(blade, runtimeState)
      status.value = `${blade.name} vanished into a phantom lane!`
      beep({ freq: 920, duration: 0.05, type: 'triangle', gain: 0.02, slideTo: 540 })
    }
  }

  function pickCpuTarget(runtimeState, cpuBlade) {
    return pickNearestOpponent(runtimeState, cpuBlade)
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
    const buildScale = cpuBlade.key === 'attack' ? 1.1 : cpuBlade.key === 'stamina' ? 0.9 : cpuBlade.key === 'trick' ? 1.04 : 1
    const nudge = 7.6 * cpuBlade.def.stats.grip * stateScale * buildScale
    cpuBlade.rb.setLinvel({ x: lv.x + moveX * nudge * dt, y: 0, z: lv.z + moveZ * nudge * dt }, true)
    if (cpuBlade.aiState === 'approach' && cpuSpeed > 4 && dist < 3.5 && targetEdgeDist < 5.5 && edgeDist > 3 && cpuBlade.boostCooldown <= 0 && cpuBlade.spin > 12 && Math.random() < 0.03) {
      burst(cpuBlade, cpuBlade.key === 'attack' ? 1.2 : 1)
    }
    if (cpuBlade.aiState === 'orbit' && cpuBlade.wobble > 0.18 && cpuBlade.spin > 10 && Math.random() < 0.05) {
      stabilise(cpuBlade, dt)
    }
    if (cpuBlade.special >= 100 && Math.random() < 0.04) {
      triggerSpecial(cpuBlade, runtimeState)
    }
  }

  function applyHumanInput(blade, input, dt, phase, runtimeState = null) {
    if (!input || !blade.alive) return
    if (phase === 'aiming') {
      if (input.aimLeft) blade.launchAngle -= 2.2 * dt
      if (input.aimRight) blade.launchAngle += 2.2 * dt
      if (input.charge) blade.charge = Math.min(1, blade.charge + 0.65 * dt)
      else blade.charge = Math.max(0, blade.charge - 0.45 * dt)
      return
    }

    const lv = blade.rb.linvel()
    const controlScale = blade.attackCommitTimer > 0 ? 0.18 : 1
    const orbitActive = blade.silentOrbit > 0
    const phantomActive = blade.trickPhantomTimer > 0
    const nudge = 7.6 * blade.def.stats.grip * (orbitActive ? STAMINA_SPECIAL.controlBoost : 1) * (phantomActive ? TRICK_SPECIAL.controlBoost : 1)
    let nextX = lv.x + input.moveX * nudge * dt * controlScale
    let nextZ = lv.z + input.moveZ * nudge * dt * controlScale
    if (orbitActive) {
      const moveMag = Math.hypot(input.moveX, input.moveZ)
      if (moveMag > 0.05) {
        const desiredX = input.moveX / moveMag
        const desiredZ = input.moveZ / moveMag
        const along = nextX * desiredX + nextZ * desiredZ
        const lateralX = nextX - desiredX * along
        const lateralZ = nextZ - desiredZ * along
        const damp = Math.min(1, STAMINA_SPECIAL.lateralDamping * dt)
        nextX -= lateralX * damp
        nextZ -= lateralZ * damp
      } else {
        const driftDamp = Math.min(0.45, STAMINA_SPECIAL.idleDriftDamping * dt)
        nextX *= 1 - driftDamp
        nextZ *= 1 - driftDamp
      }
    }
    blade.rb.setLinvel({ x: nextX, y: 0, z: nextZ }, true)
    if (blade.attackCommitTimer <= 0) {
      if (input.burst) burst(blade)
      if (input.stabilise) stabilise(blade, dt)
      if (input.special) triggerSpecial(blade, runtimeState)
    }
  }

  function updateBlade(blade, dt, runtimeState) {
    blade.boostCooldown = Math.max(0, blade.boostCooldown - dt)
    blade.guarding = Math.max(0, blade.guarding - dt)
    const hadOrbit = blade.silentOrbit > 0
    blade.silentOrbit = Math.max(0, blade.silentOrbit - dt)
    blade.silentOrbitPulse = Math.max(0, blade.silentOrbitPulse - dt)
    blade.vampireDrain = Math.max(0, blade.vampireDrain - dt)
    blade.rubberDrainBurst = Math.max(0, blade.rubberDrainBurst - dt)
    blade.rubberDrainPulse = Math.max(0, blade.rubberDrainPulse - dt)
    blade.trickPhantomTimer = Math.max(0, blade.trickPhantomTimer - dt)
    blade.trickStepCooldown = Math.max(0, blade.trickStepCooldown - dt)
    blade.trickDodgeTimer = Math.max(0, blade.trickDodgeTimer - dt)
    blade.trickCounterTimer = Math.max(0, blade.trickCounterTimer - dt)
    blade.trickPulseTimer = Math.max(0, blade.trickPulseTimer - dt)
    blade.defenseReflectFlash = Math.max(0, blade.defenseReflectFlash - dt)
    blade.smashWindow = Math.max(0, blade.smashWindow - dt)
    const hadLock = blade.attackLockTimer > 0
    blade.attackLockTimer = Math.max(0, blade.attackLockTimer - dt)
    blade.attackRushTimer = Math.max(0, blade.attackRushTimer - dt)
    blade.attackCommitTimer = Math.max(0, blade.attackCommitTimer - dt)
    blade.attackSnapTimer = Math.max(0, blade.attackSnapTimer - dt)
    blade.attackSlashTimer = Math.max(0, blade.attackSlashTimer - dt)
    blade.lastImpact = Math.max(0, blade.lastImpact - dt * 2.6)
    blade.ultGlow = Math.max(0, blade.ultGlow - dt * 1.4)
    for (const echo of blade.trickEchoes.userData.echoes || []) {
      echo.life = Math.max(0, echo.life - dt)
    }

    if (hadLock && blade.attackLockTimer <= 0 && blade.attackTargetId) {
      startAttackRush(blade, runtimeState)
    }
    if (hadOrbit && blade.silentOrbit <= 0 && blade.alive) {
      blade.spin = Math.min(80, blade.spin + STAMINA_SPECIAL.completionRefund)
      blade.silentOrbitPulse = Math.max(blade.silentOrbitPulse, STAMINA_SPECIAL.pulseDuration)
      blade.ultGlow = Math.max(blade.ultGlow, 0.72)
      beep({ freq: 620, duration: 0.07, type: 'triangle', gain: 0.02, slideTo: 940 })
    }
    if (blade.trickPhantomTimer > 0 && blade.trickStepCooldown <= 0) {
      const target = pickNearestOpponent(runtimeState, blade)
      const targetPos = target?.rb.translation()
      const bladePos = blade.rb.translation()
      const dist = targetPos ? Math.hypot(targetPos.x - bladePos.x, targetPos.z - bladePos.z) : Number.POSITIVE_INFINITY
      const speed = Math.hypot(blade.rb.linvel().x, blade.rb.linvel().z)
      if (dist <= TRICK_SPECIAL.maxTargetDist || speed > 4.1) {
        performTrickStep(blade, runtimeState)
      }
    }

    if (!blade.alive) {
      hideBladeEffects(blade)
      updateRingOutVisual(blade, dt)
      return
    }

    const pos = blade.rb.translation()
    const lv = blade.rb.linvel()
    const radius = Math.hypot(pos.x, pos.z)
    if (radius > STADIUM.flatRadius) {
      const slope = getStadiumSlope(radius)
      const bowlAccel = -slope * STADIUM.bankGravity
      const nx = pos.x / radius
      const nz = pos.z / radius
      blade.rb.setLinvel({ x: lv.x + nx * bowlAccel * dt, y: 0, z: lv.z + nz * bowlAccel * dt }, true)
    }

    let tunedLv = blade.rb.linvel()
    if (blade.silentOrbit > 0 && radius > 0.001) {
      const nx = pos.x / radius
      const nz = pos.z / radius
      const inward = clamp01((radius - STAMINA_SPECIAL.recenterStartRadius) / (STADIUM.lipRadius - STAMINA_SPECIAL.recenterStartRadius))
      if (inward > 0) {
        const outwardVel = Math.max(0, tunedLv.x * nx + tunedLv.z * nz)
        const recenter = (STAMINA_SPECIAL.recenterForce * inward + outwardVel * STAMINA_SPECIAL.outwardBrake * inward) * dt
        blade.rb.setLinvel({ x: tunedLv.x - nx * recenter, y: 0, z: tunedLv.z - nz * recenter }, true)
        tunedLv = blade.rb.linvel()
      }
    }

    if (blade.attackRushTimer > 0 && runtimeState) {
      const target = getBladeTarget(runtimeState, blade)
      if (target?.alive) {
        const targetPos = target.rb.translation()
        const bladePos = blade.rb.translation()
        const aimX = targetPos.x - bladePos.x
        const aimZ = targetPos.z - bladePos.z
        const aimMag = Math.hypot(aimX, aimZ)
        if (aimMag > 0.001) {
          const dirX = aimX / aimMag
          const dirZ = aimZ / aimMag
          const current = blade.rb.linvel()
          const guidedSpeed = Math.max(ATTACK_SPECIAL.guidedSpeedFloor, Math.hypot(current.x, current.z))
          blade.rb.setLinvel({
            x: current.x * (1 - ATTACK_SPECIAL.guidedBlend) + dirX * guidedSpeed * ATTACK_SPECIAL.guidedBlend,
            y: 0,
            z: current.z * (1 - ATTACK_SPECIAL.guidedBlend) + dirZ * guidedSpeed * ATTACK_SPECIAL.guidedBlend,
          }, true)
          blade.launchAngle = Math.atan2(dirZ, dirX)
        }
      }
    }

    const speed = Math.hypot(tunedLv.x, tunedLv.z)
    const radialVel = radius > 0.001 ? (tunedLv.x * pos.x + tunedLv.z * pos.z) / radius : 0
    if (radius > STADIUM.lipRadius && radialVel > 0.35) {
      blade.deathType = 'ring_out'
      blade.alive = false
      startRingOutVisual(blade)
    }

    let drain = 1.6 + speed * 0.13 + blade.wobble * 1.2
    drain /= blade.def.stats.stamina
    if (blade.silentOrbit > 0) drain *= STAMINA_SPECIAL.passiveDrainMultiplier
    if (blade.trickPhantomTimer > 0) drain *= TRICK_SPECIAL.passiveDrainMultiplier
    if (blade.guarding > 0) drain *= DEFENSE_SPECIAL.passiveDrainMultiplier
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
    if (!blade.alive) {
      blade.attackLockTimer = 0
      blade.attackRushTimer = 0
      blade.attackCommitTimer = 0
      blade.attackTargetId = null
      blade.attackSnapTimer = 0
      blade.attackSlashTimer = 0
      blade.silentOrbitPulse = 0
      blade.rubberDrainBurst = 0
      blade.rubberDrainPulse = 0
      blade.rubberDrainTargetId = null
      blade.trickPhantomTimer = 0
      blade.trickStepCooldown = 0
      blade.trickDodgeTimer = 0
      blade.trickCounterTimer = 0
      blade.trickPulseTimer = 0
      blade.defenseReflectFlash = 0
      hideBladeEffects(blade)
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
    const attackModA = a.def.stats.smash * (a.smashWindow > 0 ? ATTACK_SPECIAL.smashMultiplier : 1)
    const attackModB = b.def.stats.smash * (b.smashWindow > 0 ? ATTACK_SPECIAL.smashMultiplier : 1)
    const defenseA = a.def.stats.defense * (a.guarding > 0 ? DEFENSE_SPECIAL.defenseMultiplier : 1)
    const defenseB = b.def.stats.defense * (b.guarding > 0 ? DEFENSE_SPECIAL.defenseMultiplier : 1)
    let pushA = (1.2 + impact * 0.35) * (attackModB / defenseA)
    let pushB = (1.2 + impact * 0.35) * (attackModA / defenseB)
    if (a.guarding > 0) {
      pushA *= DEFENSE_SPECIAL.guardedPushAbsorb
      pushB += DEFENSE_SPECIAL.reflectPushBonus + impact * DEFENSE_SPECIAL.reflectPushImpactScale
      a.defenseReflectFlash = Math.max(a.defenseReflectFlash, DEFENSE_SPECIAL.reflectFlashDuration)
      a.ultGlow = Math.max(a.ultGlow, 0.75)
      a.lastImpact = Math.max(a.lastImpact, 0.7)
    }
    if (b.guarding > 0) {
      pushB *= DEFENSE_SPECIAL.guardedPushAbsorb
      pushA += DEFENSE_SPECIAL.reflectPushBonus + impact * DEFENSE_SPECIAL.reflectPushImpactScale
      b.defenseReflectFlash = Math.max(b.defenseReflectFlash, DEFENSE_SPECIAL.reflectFlashDuration)
      b.ultGlow = Math.max(b.ultGlow, 0.75)
      b.lastImpact = Math.max(b.lastImpact, 0.7)
    }
    if (a.trickDodgeTimer > 0) {
      pushA *= TRICK_SPECIAL.dodgePushAbsorb
    }
    if (b.trickDodgeTimer > 0) {
      pushB *= TRICK_SPECIAL.dodgePushAbsorb
    }
    if (a.trickCounterTimer > 0) {
      pushB += TRICK_SPECIAL.counterPushBonus + impact * TRICK_SPECIAL.counterPushImpactScale
      a.ultGlow = Math.max(a.ultGlow, 0.82)
      a.lastImpact = Math.max(a.lastImpact, 0.65)
    }
    if (b.trickCounterTimer > 0) {
      pushA += TRICK_SPECIAL.counterPushBonus + impact * TRICK_SPECIAL.counterPushImpactScale
      b.ultGlow = Math.max(b.ultGlow, 0.82)
      b.lastImpact = Math.max(b.lastImpact, 0.65)
    }
    a.rb.setLinvel({ x: lva.x - nx * pushA, y: 0, z: lva.z - nz * pushA }, true)
    b.rb.setLinvel({ x: lvb.x + nx * pushB, y: 0, z: lvb.z + nz * pushB }, true)

    let spinLossA = (0.7 + impact * 0.12) / defenseA
    let spinLossB = (0.7 + impact * 0.12) / defenseB
    if (a.guarding > 0) {
      spinLossA *= DEFENSE_SPECIAL.guardedSpinAbsorb
      spinLossB += DEFENSE_SPECIAL.reflectSpinBonus + impact * DEFENSE_SPECIAL.reflectSpinImpactScale
    }
    if (b.guarding > 0) {
      spinLossB *= DEFENSE_SPECIAL.guardedSpinAbsorb
      spinLossA += DEFENSE_SPECIAL.reflectSpinBonus + impact * DEFENSE_SPECIAL.reflectSpinImpactScale
    }
    if (a.trickDodgeTimer > 0) spinLossA *= TRICK_SPECIAL.dodgeSpinAbsorb
    if (b.trickDodgeTimer > 0) spinLossB *= TRICK_SPECIAL.dodgeSpinAbsorb
    if (a.trickCounterTimer > 0) spinLossB += TRICK_SPECIAL.counterSpinBonus + impact * TRICK_SPECIAL.counterSpinImpactScale
    if (b.trickCounterTimer > 0) spinLossA += TRICK_SPECIAL.counterSpinBonus + impact * TRICK_SPECIAL.counterSpinImpactScale
    if (a.silentOrbit > 0) spinLossA *= STAMINA_SPECIAL.collisionDrainMultiplier
    if (b.silentOrbit > 0) spinLossB *= STAMINA_SPECIAL.collisionDrainMultiplier
    a.spin = Math.max(0, a.spin - spinLossA)
    b.spin = Math.max(0, b.spin - spinLossB)
    if (a.vampireDrain > 0) {
      const steal = Math.min(1.25, spinLossB * 0.9)
      b.spin = Math.max(0, b.spin - steal)
      a.spin = Math.min(80, a.spin + steal * 0.75)
      a.rubberDrainBurst = RUBBER_SPECIAL.burstDuration
      a.rubberDrainPulse = Math.max(a.rubberDrainPulse, RUBBER_SPECIAL.pulseDuration)
      a.rubberDrainTargetId = b.id
      a.ultGlow = Math.max(a.ultGlow, 0.78)
    }
    if (b.vampireDrain > 0) {
      const steal = Math.min(1.25, spinLossA * 0.9)
      a.spin = Math.max(0, a.spin - steal)
      b.spin = Math.min(80, b.spin + steal * 0.75)
      b.rubberDrainBurst = RUBBER_SPECIAL.burstDuration
      b.rubberDrainPulse = Math.max(b.rubberDrainPulse, RUBBER_SPECIAL.pulseDuration)
      b.rubberDrainTargetId = a.id
      b.ultGlow = Math.max(b.ultGlow, 0.78)
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
    if (roundResult.value?.isMatchOver && roundResult.value.winner) {
      commitMatchRecord(runtimeState, roundResult.value.winner)
    }
    runtimeState.scores = { ...snapshot.scores }
    let localSnapshot = null
    for (const playerSnapshot of snapshot.players || []) {
      const blade = runtimeState.bladesById.get(playerSnapshot.id)
      if (!blade) continue
      if (playerSnapshot.id === runtimeState.localPlayerId) {
        localSnapshot = playerSnapshot
      }
      const previousSpecial = blade.special
      blade.alive = playerSnapshot.alive
      blade.spin = playerSnapshot.spin
      blade.special = playerSnapshot.special
      blade.wobble = playerSnapshot.wobble
      blade.guarding = playerSnapshot.guarding
      blade.silentOrbit = playerSnapshot.silentOrbit
      blade.silentOrbitPulse = playerSnapshot.silentOrbitPulse || 0
      blade.vampireDrain = playerSnapshot.vampireDrain
      blade.rubberDrainBurst = playerSnapshot.rubberDrainBurst || 0
      blade.rubberDrainTargetId = playerSnapshot.rubberDrainTargetId || null
      blade.rubberDrainPulse = playerSnapshot.rubberDrainPulse || 0
      const previousTrickPulse = blade.trickPulseTimer
      const previousTrickDodge = blade.trickDodgeTimer
      const previousX = blade.rb.translation().x
      const previousZ = blade.rb.translation().z
      blade.trickPhantomTimer = playerSnapshot.trickPhantomTimer || 0
      blade.trickStepCooldown = playerSnapshot.trickStepCooldown || 0
      blade.trickDodgeTimer = playerSnapshot.trickDodgeTimer || 0
      blade.trickCounterTimer = playerSnapshot.trickCounterTimer || 0
      blade.trickPulseTimer = playerSnapshot.trickPulseTimer || 0
      blade.defenseReflectFlash = playerSnapshot.defenseReflectFlash || 0
      blade.smashWindow = playerSnapshot.smashWindow
      blade.attackLockTimer = playerSnapshot.attackLockTimer || 0
      blade.attackRushTimer = playerSnapshot.attackRushTimer || 0
      blade.attackCommitTimer = playerSnapshot.attackCommitTimer || 0
      blade.attackTargetId = playerSnapshot.attackTargetId || null
      blade.attackSnapTimer = playerSnapshot.attackSnapTimer || 0
      blade.attackSlashTimer = playerSnapshot.attackSlashTimer || 0
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
      if ((blade.trickPulseTimer > previousTrickPulse + 0.03 || blade.trickDodgeTimer > previousTrickDodge + 0.03) && blade.key === 'trick') {
        spawnTrickEcho(blade, previousX, previousZ, 0.9)
      }
      if (!runtimeState.authoritative && playerSnapshot.id === runtimeState.localPlayerId) {
        const ultActivated = previousSpecial >= 99 && playerSnapshot.special <= 1 && (
          playerSnapshot.attackLockTimer > 0 ||
          playerSnapshot.guarding > 0 ||
          playerSnapshot.silentOrbit > 0 ||
          playerSnapshot.vampireDrain > 0 ||
          playerSnapshot.trickPhantomTimer > 0 ||
          playerSnapshot.ultGlow > 0.55
        )
        if (ultActivated) {
          commitUltUse(runtimeState.localBuildKey)
        }
      }
    }
    if (roundResult.value?.winner && runtimeState.lastRecordedRound !== runtimeState.round) {
      commitRoundStats(runtimeState, roundResult.value.winner, roundResult.value.type, localSnapshot?.deathType)
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
      const defenseShield = createDefenseShield(def.color, def.accent)
      defenseShield.visible = false
      scene.add(defenseShield)
      const staminaOrbit = createStaminaOrbit(def.color, def.accent)
      staminaOrbit.visible = false
      scene.add(staminaOrbit)
      const staminaFloorRing = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.26, 40),
        new THREE.MeshBasicMaterial({
          color: def.accent,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      staminaFloorRing.rotation.x = -Math.PI / 2
      staminaFloorRing.visible = false
      scene.add(staminaFloorRing)
      const staminaPulse = new THREE.Mesh(
        new THREE.RingGeometry(0.54, 0.96, 40),
        new THREE.MeshBasicMaterial({
          color: 0xd7f0ff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      staminaPulse.rotation.x = -Math.PI / 2
      staminaPulse.visible = false
      scene.add(staminaPulse)
      const rubberAura = createRubberAura(def.color, def.accent)
      rubberAura.visible = false
      scene.add(rubberAura)
      const rubberFloorRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.78, 0.038, 8, 36),
        new THREE.MeshBasicMaterial({
          color: def.accent,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      rubberFloorRing.visible = false
      scene.add(rubberFloorRing)
      const rubberPulse = new THREE.Mesh(
        new THREE.TorusGeometry(0.88, 0.055, 8, 32),
        new THREE.MeshBasicMaterial({
          color: 0xf2d7ff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      rubberPulse.visible = false
      scene.add(rubberPulse)
      const rubberDrainParticles = createRubberDrainParticles(def.color, def.accent)
      rubberDrainParticles.visible = false
      scene.add(rubberDrainParticles)
      const rubberDrainTrail = createRubberDrainTrail(0x5b168c)
      scene.add(rubberDrainTrail)
      const trickMirage = createTrickMirage(def.color, def.accent)
      trickMirage.visible = false
      scene.add(trickMirage)
      const trickEchoes = createTrickEchoes(def.color, def.accent)
      trickEchoes.visible = false
      scene.add(trickEchoes)
      const trickFlash = createTrickFlash(def.accent)
      trickFlash.visible = false
      scene.add(trickFlash)
      const defenseShieldBurst = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1.34, 28),
        new THREE.MeshBasicMaterial({
          color: def.accent,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      defenseShieldBurst.rotation.x = -Math.PI / 2
      defenseShieldBurst.visible = false
      scene.add(defenseShieldBurst)
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 2.2, new THREE.Color(def.color), 0.55, 0.28)
      scene.add(arrow)
      const lockRing = createCornerMarker(3.05, 0.9, 0.2, 0xff7a18)
      lockRing.visible = false
      scene.add(lockRing)
      const lockRingOuter = createCornerMarker(4.05, 1.08, 0.24, 0xffe066)
      lockRingOuter.visible = false
      scene.add(lockRingOuter)
      const lockFlash = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 1.7),
        new THREE.MeshBasicMaterial({ color: 0xffc14d, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
      )
      lockFlash.rotation.x = -Math.PI / 2
      lockFlash.renderOrder = ATTACK_UI_RENDER_ORDER
      lockFlash.visible = false
      scene.add(lockFlash)
      const lockBeamGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
      const lockBeam = new THREE.Line(
        lockBeamGeometry,
        new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
      )
      lockBeam.renderOrder = ATTACK_UI_RENDER_ORDER
      lockBeam.visible = false
      scene.add(lockBeam)
      const lockSlash = createAttackSlash(0xfff3bf)
      lockSlash.visible = false
      scene.add(lockSlash)

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
        defenseShield,
        staminaOrbit,
        staminaFloorRing,
        staminaPulse,
        rubberAura,
        rubberFloorRing,
        rubberPulse,
        rubberDrainParticles,
        rubberDrainTrail,
        trickMirage,
        trickEchoes,
        trickFlash,
        defenseShieldBurst,
        arrow,
        lockRing,
        lockRingOuter,
        lockFlash,
        lockBeam,
        lockSlash,
        spawn,
        radius: 0.78,
        spin: 0,
        spinDir: index % 2 === 0 ? 1 : -1,
        wobble: 0.02,
        special: 12,
        alive: true,
        guarding: 0,
        silentOrbit: 0,
        silentOrbitPulse: 0,
        vampireDrain: 0,
        rubberDrainBurst: 0,
        rubberDrainTargetId: null,
        rubberDrainPulse: 0,
        trickPhantomTimer: 0,
        trickStepCooldown: 0,
        trickDodgeTimer: 0,
        trickCounterTimer: 0,
        trickPulseTimer: 0,
        trickStepSign: index % 2 === 0 ? 1 : -1,
        trickEchoCursor: 0,
        defenseReflectFlash: 0,
        smashWindow: 0,
        attackLockTimer: 0,
        attackRushTimer: 0,
        attackCommitTimer: 0,
        attackTargetId: null,
        attackSnapTimer: 0,
        attackSlashTimer: 0,
        cpuLaunchCharge: CPU_LAUNCH.baseCharge,
        cpuLaunchAngle: spawn.angle,
        boostCooldown: 0,
        lastImpact: 0,
        launchAngle: spawn.angle,
        launchPower: 0,
        deathType: null,
        ultGlow: 0,
        visualSpin: 0,
        ringOutVisual: null,
        charge: participant.kind === 'cpu' ? CPU_LAUNCH.baseCharge : 0,
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
      localBuildKey: config.participants.find((participant) => participant.id === config.localPlayerId)?.build || selectedBuild.value,
      matchStatKey: config.type.startsWith('online') ? 'player' : 'cpu',
      scores: Object.fromEntries(config.participants.map((participant) => [participant.id, 0])),
      round: 1,
      lastRecordedRound: 0,
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
      recordCommitted: false,
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

    function updateAttackLockVisual(blade) {
      const target = getBladeTarget(runtimeState, blade)
      const showLock = target?.alive && (blade.attackLockTimer > 0 || blade.attackRushTimer > 0)
      blade.lockRing.visible = showLock
      blade.lockRingOuter.visible = showLock
      blade.lockFlash.visible = showLock
      blade.lockBeam.visible = showLock
      blade.lockSlash.visible = blade.attackSlashTimer > 0 && !!target?.alive
      if (!showLock) {
        setMarkerOpacity(blade.lockRing, 0)
        setMarkerOpacity(blade.lockRingOuter, 0)
        blade.lockFlash.material.opacity = 0
        blade.lockBeam.material.opacity = 0
      }
      if (!target?.alive) {
        blade.lockSlash.visible = false
        setMarkerOpacity(blade.lockSlash, 0)
        return
      }

      const targetPos = target.rb.translation()
      const bladePos = blade.rb.translation()
      const time = performance.now()
      const pulse = 1 + Math.sin(time * 0.032) * 0.08
      const outerPulse = 1 + Math.sin(time * 0.026 + 0.8) * 0.11
      const flashPulse = 0.9 + Math.sin(time * 0.045) * 0.08
      const snapProgress = blade.attackSnapTimer > 0
        ? 1 - clamp01(blade.attackSnapTimer / ATTACK_SPECIAL.snapDuration)
        : 1
      const lockProgress = blade.attackLockTimer > 0
        ? 1 - clamp01(blade.attackLockTimer / ATTACK_SPECIAL.lockDuration)
        : 1
      const ringY = getSurfaceYAtXZ(targetPos.x, targetPos.z, 0.06)
      blade.lockRing.position.set(targetPos.x, ringY, targetPos.z)
      blade.lockRingOuter.position.set(targetPos.x, ringY + 0.015, targetPos.z)
      blade.lockFlash.position.set(targetPos.x, ringY - 0.01, targetPos.z)
      const snapBoost = blade.attackSnapTimer > 0 ? 1.42 - snapProgress * 0.42 : 1
      blade.lockRing.scale.setScalar((blade.attackLockTimer > 0 ? pulse + lockProgress * 0.12 : 1.18) * snapBoost)
      blade.lockRingOuter.scale.setScalar((blade.attackLockTimer > 0 ? outerPulse + lockProgress * 0.16 : 1.34) * (blade.attackSnapTimer > 0 ? 1.22 - snapProgress * 0.22 : 1))
      blade.lockFlash.scale.setScalar(blade.attackLockTimer > 0 ? flashPulse + lockProgress * 0.2 : 1.06)
      setMarkerOpacity(blade.lockRing, blade.attackLockTimer > 0 ? 1 : 0.82)
      setMarkerOpacity(blade.lockRingOuter, blade.attackLockTimer > 0 ? 0.46 : 0.24)
      blade.lockFlash.material.opacity = blade.attackLockTimer > 0 ? 0.18 + lockProgress * 0.14 : 0.1

      if (blade.lockBeam.visible) {
        const beamStart = new THREE.Vector3(bladePos.x, getSurfaceYAtXZ(bladePos.x, bladePos.z, 0.26), bladePos.z)
        const beamEnd = new THREE.Vector3(targetPos.x, ringY + 0.05, targetPos.z)
        blade.lockBeam.geometry.setFromPoints([beamStart, beamEnd])
        blade.lockBeam.material.opacity = blade.attackLockTimer > 0 ? 0.95 : 0.4
      }

      if (blade.lockSlash.visible) {
        const slashProgress = 1 - clamp01(blade.attackSlashTimer / ATTACK_SPECIAL.slashDuration)
        blade.lockSlash.position.set(targetPos.x, ringY + 0.025, targetPos.z)
        blade.lockSlash.scale.setScalar(0.7 + slashProgress * 0.85)
        setMarkerOpacity(blade.lockSlash, 0.75 * (1 - slashProgress))
      } else {
        setMarkerOpacity(blade.lockSlash, 0)
      }
    }

    function resetRound() {
      runtimeState.roundResolved = false
      runtimeState.phase = 'aiming'
      runtimeState.countdownTimer = AIM_COUNTDOWN_DURATION
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
        blade.silentOrbitPulse = 0
        blade.vampireDrain = 0
        blade.rubberDrainBurst = 0
        blade.rubberDrainTargetId = null
        blade.rubberDrainPulse = 0
        blade.trickPhantomTimer = 0
        blade.trickStepCooldown = 0
        blade.trickDodgeTimer = 0
        blade.trickCounterTimer = 0
        blade.trickPulseTimer = 0
        blade.trickStepSign = blade.trickStepSign || 1
        blade.defenseReflectFlash = 0
        blade.smashWindow = 0
        blade.attackLockTimer = 0
        blade.attackRushTimer = 0
        blade.attackCommitTimer = 0
        blade.attackTargetId = null
        blade.attackSnapTimer = 0
        blade.attackSlashTimer = 0
        hideBladeEffects(blade)
        blade.boostCooldown = 0
        blade.lastImpact = 0
        blade.ultGlow = 0
        blade.visualSpin = 0
        blade.deathType = null
        blade.ringOutVisual = null
        blade.launchPower = 0
        if (blade.kind === 'cpu') {
          rollCpuLaunchProfile(blade)
          blade.charge = 0
          blade.launchAngle = blade.spawn.angle
        } else {
          blade.charge = 0
          blade.launchAngle = blade.spawn.angle
        }
        setBladeArrow(blade)
        updateAttackLockVisual(blade)
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
        updateAttackLockVisual(blade)
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
      const localBlade = runtimeState.bladesById.get(runtimeState.localPlayerId)
      commitRoundStats(runtimeState, winnerBlade.id, winType, localBlade?.deathType)
      updateHud(runtimeState)
      runtimeState.matchOver = runtimeState.scores[winnerBlade.id] >= runtimeState.scoreToWin
      if (runtimeState.matchOver) {
        commitMatchRecord(runtimeState, winnerBlade.id)
      }
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
              const aimProgress = clamp01(1 - runtimeState.countdownTimer / AIM_COUNTDOWN_DURATION)
              blade.charge = mix(0, blade.cpuLaunchCharge, aimProgress)
              blade.launchAngle = mix(blade.spawn.angle, blade.cpuLaunchAngle, aimProgress)
            } else if (blade.id === runtimeState.localPlayerId) {
              applyHumanInput(blade, runtimeState.localInput, dt, 'aiming', runtimeState)
            } else {
              applyHumanInput(blade, runtimeState.remoteInputs.get(blade.id) || {}, dt, 'aiming', runtimeState)
            }
            setBladeArrow(blade)
          }

          if (runtimeState.countdownTimer <= 0) launchRound()
        } else if (runtimeState.phase === 'fighting') {
          for (const blade of runtimeState.blades) {
            if (blade.kind === 'cpu') runCpuBrain(runtimeState, blade, dt)
            else if (blade.id === runtimeState.localPlayerId) applyHumanInput(blade, runtimeState.localInput, dt, 'fighting', runtimeState)
            else applyHumanInput(blade, runtimeState.remoteInputs.get(blade.id) || {}, dt, 'fighting', runtimeState)
          }
          runtimeState.world.step()
          for (let i = 0; i < runtimeState.blades.length; i++) {
            for (let j = i + 1; j < runtimeState.blades.length; j++) {
              resolveBladeCollision(runtimeState.blades[i], runtimeState.blades[j], runtimeState)
            }
          }
          for (const blade of runtimeState.blades) {
            updateBlade(blade, dt, runtimeState)
            updateAttackLockVisual(blade)
          }
          if (runtimeState.blades.filter((blade) => blade.alive).length <= 1) {
            resolveRound()
          }
        } else if (runtimeState.phase === 'round_end') {
          for (const blade of runtimeState.blades) {
            updateBlade(blade, dt, runtimeState)
            updateAttackLockVisual(blade)
          }
          runtimeState.roundResetTimer -= dt
          if (runtimeState.roundResetTimer <= 0) {
            if (runtimeState.matchOver) {
              if (runtimeState.networked && roomApi) {
                roomApi.sendMatchComplete(
                  roundResult.value?.outcome || 'Match finished.',
                  buildOnlineMatchSummary(runtimeState)
                )
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
        for (const blade of runtimeState.blades) {
          updateAttackLockVisual(blade)
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
    storeSelectedBuild(build)
    if (roomApi?.room?.value) {
      roomApi.updateProfile({ name: roomApi.playerName.value, build, record: playerRecord.value })
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
    playerRecord,
    playerStats,
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