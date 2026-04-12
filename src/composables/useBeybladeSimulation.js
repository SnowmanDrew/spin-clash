import { ref, computed, watch } from 'vue'
import * as THREE from 'three'
import { BUILD_DEFS, CPU_BUILD_ORDER } from '../data/buildDefs.js'
import { createBeybladeMesh } from '../models/beyblades/index.js'
import { useAudio } from './useAudio.js'

// All simulation state and the Three.js / Rapier game loop live here.
// mountRef must be a Vue template ref pointing at the canvas container div.
export function useBeybladeSimulation(mountRef) {
  const { beep, noiseBurst } = useAudio()

  const selectedBuild = ref('attack')
  const gamePhase = ref('menu')
  const status = ref('Choose your blade, then launch into battle.')
  const roundScore = ref({ player: 0, cpu: 0, round: 1 })
  const playerHud = ref({ spin: 0, special: 0, build: 'attack', specialName: BUILD_DEFS.attack.specialName })
  const cpuHud = ref({ spin: 0, special: 0, build: 'defense', specialName: BUILD_DEFS.defense.specialName })
  const roundResult = ref(null)
  const countdown = ref(null)  // null | 3 | 2 | 1 | 0 ("GO!")
  const aimAngle = ref(0)      // exposed so Vue can render the aim line
  const cpuMatchBuild = ref('defense')  // locked in at match start, same for all rounds
  let cpuMatchBuildIdx = 0

  const buildEntries = computed(() => Object.values(BUILD_DEFS))

  watch(
    [gamePhase, selectedBuild, () => roundScore.value.round],
    ([phase, build, round], _old, onCleanup) => {
      if (phase !== 'battle') return

      let destroyed = false
      let cleanupFns = []

      onCleanup(() => {
        destroyed = true
        cleanupFns.forEach(fn => { try { fn() } catch (_) {} })
      })

      roundResult.value = null
      countdown.value = null
      aimAngle.value = 0
      // Lock in a CPU opponent once per match; keep them all 3 rounds
      if (round === 1) {
        cpuMatchBuild.value = CPU_BUILD_ORDER[cpuMatchBuildIdx % CPU_BUILD_ORDER.length]
        cpuMatchBuildIdx++
      }
      async function boot() {
        const mount = mountRef.value
        if (!mount) return

        const RAPIER = await import('@dimforge/rapier3d-compat')
        await RAPIER.init()
        if (destroyed) return

        const { World, RigidBodyDesc, ColliderDesc } = RAPIER

        // --- Scene setup ---
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

        const hemi = new THREE.HemisphereLight(0xc7f2ff, 0x0b1220, 1.25)
        scene.add(hemi)

        const dir = new THREE.DirectionalLight(0xffffff, 1.7)
        dir.position.set(7, 12, 6)
        dir.castShadow = true
        dir.shadow.mapSize.width = 1024
        dir.shadow.mapSize.height = 1024
        scene.add(dir)

        const arenaGlow = new THREE.PointLight(0x38bdf8, 4, 20, 2)
        arenaGlow.position.set(0, 1.5, 0)
        scene.add(arenaGlow)

        const purpleGlow = new THREE.PointLight(0xb800ff, 3.0, 16, 2)
        purpleGlow.position.set(-3, 2.5, -3)
        scene.add(purpleGlow)

        // --- Arena geometry (concave dish stadium) ---

        const STADIUM = {
          floorY: 0.22,
          flatRadius: 1.85,
          bankRadius: 7.15,
          lipRadius: 8.60,
          ejectRadius: 8.98,
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

        // One sampled profile drives the visible bowl, blade height, and radial force.
        const bowlProfile = []
        for (let r = 0; r <= STADIUM.outerRadius; r += 0.2) {
          bowlProfile.push(new THREE.Vector2(r, getStadiumHeight(r)))
        }
        bowlProfile.push(new THREE.Vector2(9.90, -0.38))
        const bowlMesh = new THREE.Mesh(
          new THREE.LatheGeometry(bowlProfile, 96),
          new THREE.MeshStandardMaterial({ color: 0x12103a, roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide })
        )
        bowlMesh.receiveShadow = true
        scene.add(bowlMesh)

        // Center hub disc — sits on the flat launch zone.
        const centerHub = new THREE.Mesh(
          new THREE.CircleGeometry(1.5, 48),
          new THREE.MeshBasicMaterial({ color: 0x07051a, side: THREE.DoubleSide })
        )
        centerHub.rotation.x = -Math.PI / 2
        centerHub.position.y = STADIUM.floorY + 0.01
        scene.add(centerHub)

        // Center glow ring (purple accent) — radius fits inside hub area
        const centerGlow = new THREE.Mesh(
          new THREE.RingGeometry(1.25, 1.52, 48),
          new THREE.MeshBasicMaterial({ color: 0x7040e0, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
        )
        centerGlow.rotation.x = -Math.PI / 2
        centerGlow.position.y = STADIUM.floorY + 0.015
        scene.add(centerGlow)

        // Center crosshair — short enough to stay in hub zone above bowl surface
        for (let i = 0; i < 2; i++) {
          const cLine = new THREE.Mesh(
            new THREE.PlaneGeometry(3.0, 0.055),
            new THREE.MeshBasicMaterial({ color: 0x5032c0, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
          )
          cLine.rotation.x = -Math.PI / 2
          cLine.rotation.y = i * Math.PI / 2
          cLine.position.y = STADIUM.floorY + 0.02
          scene.add(cLine)
        }

        // 4 sector wedges confined to the flat center.
        const secColors = [0x1a1054, 0x0d0a2c]
        for (let i = 0; i < 4; i++) {
          const sec = new THREE.Mesh(
            new THREE.CircleGeometry(1.8, 48, (i / 4) * Math.PI * 2, Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: secColors[i % 2], transparent: true, opacity: 0.7, side: THREE.DoubleSide })
          )
          sec.rotation.x = -Math.PI / 2
          sec.position.y = STADIUM.floorY + 0.01
          scene.add(sec)
        }

        // Stripe rings follow the same stadium surface as the blades.
        const stripeData = [
          { r: 3.5, y: getStadiumHeight(3.5) },
          { r: 6.3, y: getStadiumHeight(6.3) },
          { r: 7.9, y: getStadiumHeight(7.9) },
        ]
        for (const { r, y } of stripeData) {
          const stripe = new THREE.Mesh(
            new THREE.TorusGeometry(r, 0.045, 8, 72),
            new THREE.MeshBasicMaterial({ color: 0x4030c8, transparent: true, opacity: 0.75 })
          )
          stripe.rotation.x = Math.PI / 2
          stripe.position.y = y
          scene.add(stripe)
        }

        // Rim neon ring — marks the crest that can still be escaped over.
        const rimNeon = new THREE.Mesh(
          new THREE.TorusGeometry(STADIUM.lipRadius, 0.065, 8, 96),
          new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 3.0, metalness: 0.1, roughness: 0.2 })
        )
        rimNeon.rotation.x = Math.PI / 2
        rimNeon.position.y = STADIUM.lipHeight
        scene.add(rimNeon)



        // --- Physics world ---
        const world = new World({ x: 0, y: -9.81, z: 0 })

        const groundRB = world.createRigidBody(RigidBodyDesc.fixed())
        world.createCollider(ColliderDesc.cylinder(0.45, 9.3).setTranslation(0, -0.25, 0).setRestitution(0.65).setFriction(0.15), groundRB)
        world.createCollider(ColliderDesc.cylinder(0.9, 10.2).setTranslation(0, -0.80, 0), groundRB)

        // --- Blade controller factory ---
        function buildController({ key, isPlayer, name, spawnX }) {
          const def = BUILD_DEFS[key]
          const meshPack = createBeybladeMesh(def.color, def.accent, key)
          scene.add(meshPack.group)
          const rb = world.createRigidBody(
            RigidBodyDesc.dynamic()
              .setTranslation(spawnX, 0.22, 0)
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
          // Per-blade glow light — driven by ultGlow and lastImpact in syncMesh
          const bladeLight = new THREE.PointLight(new THREE.Color(def.color), 0, 8, 2)
          bladeLight.position.set(spawnX, 0.4, 0)
          scene.add(bladeLight)
          return {
            key, def, name, isPlayer,
            mesh: meshPack.group, aura: meshPack.aura, rb, bladeLight,
            radius: 0.78, spin: 0, spinDir: isPlayer ? 1 : -1, wobble: 0.02,
            special: 0, alive: true, guarding: 0, silentOrbit: 0,
            vampireDrain: 0, smashWindow: 0, boostCooldown: 0,
            lastImpact: 0, launchAngle: 0, launchPower: 0, score: 0, deathType: null,
            ultGlow: 0, trailAccum: 0, visualSpin: 0, ringOutTimer: 0.18, ringOutVisual: null,
          }
        }

        // --- Game state ---
        const state = {
          keys: new Set(),
          phase: 'aiming',
          roundOver: false,
          roundResolved: false,
          charge: 0,
          angle: 0,
          player: buildController({ key: build, isPlayer: true, name: 'Player', spawnX: -4.9 }),
          cpu: buildController({ key: cpuMatchBuild.value, isPlayer: false, name: 'CPU', spawnX: 4.9 }),
          lastTime: performance.now(),
          hitStop: 0,
          cameraShake: 0,
          resetClock: 0,
          particles: [],
          launched: false,
          arenaFlash: 0,
        }

        playerHud.value = { spin: 0, special: 0, build: state.player.key, specialName: state.player.def.specialName }
        cpuHud.value = { spin: 0, special: 0, build: state.cpu.key, specialName: state.cpu.def.specialName }
        status.value = 'Hold SPACE to charge. Aim with A / D. GO fires automatically!'

        // Start 3-2-1-GO countdown
        let countdownTimer = 3.5
        const BEAT_TIMES = [3.5, 2.5, 1.5, 0.6]
        const BEATS      = [3, 2, 1, 0]
        let nextBeat = 0
        countdown.value = 3

        // --- 3D launch arrow (ArrowHelper) ---
        const launchArrow = new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(-4.9, getSurfaceYAtXZ(-4.9, 0, 0.42), 0),
          2.2, new THREE.Color(build), 0.55, 0.28
        )
        scene.add(launchArrow)

        function updateArrow() {
          const dir = new THREE.Vector3(Math.cos(state.angle), 0, Math.sin(state.angle))
          const arrowBase = new THREE.Color(state.player.def.color)
          const arrowAccent = new THREE.Color(state.player.def.accent)
          launchArrow.position.set(-4.9, getSurfaceYAtXZ(-4.9, 0, 0.42), 0)
          launchArrow.setDirection(dir)
          launchArrow.setLength(1.4 + state.charge * 2.6, 0.55 + state.charge * 0.18, 0.28)
          launchArrow.setColor(arrowBase.lerp(arrowAccent, state.charge * 0.55))
          aimAngle.value = state.angle
        }

        const clashFlash = new THREE.Mesh(
          new THREE.RingGeometry(0.25, 0.45, 24),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
        )
        clashFlash.rotation.x = -Math.PI / 2
        clashFlash.position.y = 0.08
        scene.add(clashFlash)

        // --- Particle helpers ---
        function spawnImpact(pos, color = 0xf8fafc, count = 18, scale = 1) {
          for (let i = 0; i < count; i++) {
            const m = new THREE.Mesh(
              new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 8, 8),
              new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? color : 0xfbbf24 })
            )
            m.position.copy(pos)
            scene.add(m)
            state.particles.push({
              mesh: m,
              vx: (Math.random() - 0.5) * 7 * scale,
              vz: (Math.random() - 0.5) * 7 * scale,
              vy: 0.5 + Math.random() * 2.2,
              life: 0.22 + Math.random() * 0.24,
            })
          }
        }

        function spawnAnimeArc(pos, color) {
          const arc = new THREE.Mesh(
            new THREE.TorusGeometry(0.55, 0.04, 10, 28, Math.PI * 1.25),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
          )
          arc.rotation.x = Math.PI / 2
          arc.position.copy(pos)
          scene.add(arc)
          state.particles.push({ mesh: arc, vx: 0, vz: 0, vy: 0, life: 0.18, arc: true })
        }

        function spawnShockwave(pos, color) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.4, 0.75, 32),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9, side: THREE.DoubleSide })
          )
          ring.rotation.x = -Math.PI / 2
          ring.position.copy(pos)
          ring.position.y = 0.08
          scene.add(ring)
          state.particles.push({ mesh: ring, vx: 0, vz: 0, vy: 0, life: 0.5, maxLife: 0.5, shockwave: true })
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

        function startRingOutVisual(blade) {
          const pos = blade.rb.translation()
          const lv = blade.rb.linvel()
          const r = Math.hypot(pos.x, pos.z) || 1
          const radialX = pos.x / r
          const radialZ = pos.z / r
          const tangentialX = -radialZ
          const tangentialZ = radialX
          const tangentialPush = (Math.random() - 0.5) * 1.6
          const launchSpeed = Math.hypot(lv.x, lv.z)
          const travelX = launchSpeed > 0.001 ? lv.x / launchSpeed : radialX
          const travelZ = launchSpeed > 0.001 ? lv.z / launchSpeed : radialZ
          const launchOffset = 0.18 + Math.min(0.34, launchSpeed * 0.025)
          blade.ringOutVisual = {
            x: pos.x + travelX * launchOffset + radialX * 0.14,
            y: getSurfaceYAtXZ(pos.x, pos.z, STADIUM.bladeLift) + 0.08 + Math.min(0.22, launchSpeed * 0.015),
            z: pos.z + travelZ * launchOffset + radialZ * 0.14,
            vx: lv.x * 1.02 + radialX * (1.9 + launchSpeed * 0.24) + tangentialX * tangentialPush,
            vy: STADIUM.ringOutLift + Math.min(2.4, launchSpeed * 0.16),
            vz: lv.z * 1.02 + radialZ * (1.9 + launchSpeed * 0.24) + tangentialZ * tangentialPush,
            tumbleSpeed: 14 + launchSpeed * 0.7,
            axisX: tangentialX * 0.65 + radialX * 0.25,
            axisY: 0.35,
            axisZ: tangentialZ * 0.65 + radialZ * 0.25,
          }
          blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
        }

        function updateRingOutVisual(blade, dt) {
          if (!blade.ringOutVisual) {
            syncMesh(blade)
            return
          }

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

          tmpTumbleAxis.set(fx.axisX, fx.axisY, fx.axisZ).normalize()
          tmpSpinQuat.setFromAxisAngle(tmpTumbleAxis, fx.tumbleSpeed * dt)
          blade.mesh.quaternion.multiply(tmpSpinQuat)
          tmpTumbleQuat.setFromAxisAngle(WORLD_UP, blade.visualSpin)
          blade.mesh.quaternion.multiply(tmpTumbleQuat)

          blade.aura.material.opacity = Math.max(0, blade.aura.material.opacity - dt * 1.6)
          blade.aura.scale.setScalar(1 + blade.lastImpact * 0.08 + blade.ultGlow * 2.2)
          blade.bladeLight.position.set(fx.x, fx.y + 0.35, fx.z)
          blade.bladeLight.intensity = Math.max(0, blade.bladeLight.intensity - dt * 10)
        }

        // --- Blade visual sync ---
        function syncMesh(blade) {
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
          blade.visualSpin += blade.spin * 0.032 * blade.spinDir

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
          const activeAbility = blade.guarding > 0 || blade.silentOrbit > 0 || blade.vampireDrain > 0 || blade.smashWindow > 0
          blade.aura.material.opacity = Math.min(1.0,
            blade.special / 100 * 0.5 +
            (activeAbility ? 0.2 : 0) +
            blade.ultGlow * 0.65)
          blade.aura.scale.setScalar(1 + blade.special / 300 + blade.lastImpact * 0.08 + blade.ultGlow * 3.8)
          // Blade point light: pulses hard on ult, softly on impact
          blade.bladeLight.position.set(t.x, surfaceY + 0.38, t.z)
          blade.bladeLight.intensity = blade.ultGlow * 24 + blade.lastImpact * 5
        }


        // --- Gameplay actions ---
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
          blade.ultGlow = 1.0
          const pos = blade.rb.translation()
          const groundY = getSurfaceYAtXZ(pos.x, pos.z, 0.03)
          const lowY = getSurfaceYAtXZ(pos.x, pos.z, 0.08)
          const midY = getSurfaceYAtXZ(pos.x, pos.z, 0.18)
          const v3 = (x, y, z) => new THREE.Vector3(x, y, z)
          status.value = `${blade.name} used ${blade.def.specialName}!`

          // Spawn a shockwave ring, optionally delayed and with custom expansion
          // expandScale of 4 = outer ring edge reaches ~3 units from blade centre
          function wave(color, delay = 0, expandScale = 4) {
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.3, 0.55, 32),
              new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0, side: THREE.DoubleSide })
            )
            ring.rotation.x = -Math.PI / 2
            ring.position.set(pos.x, lowY, pos.z)
            ring.visible = delay <= 0
            scene.add(ring)
            state.particles.push({ mesh: ring, life: 0.38, maxLife: 0.38, shockwave: true, shockwaveScale: expandScale, spawnDelay: delay })
          }

          if (blade.key === 'attack') {
            // ── Dragon Smash ── directional charge ignition burst + ground trail
            blade.smashWindow = 1.0
            burst(blade, 1.8)
            // Charge sparks: tight forward cone in the blade's current movement direction
            const lv0 = blade.rb.linvel()
            const fwdLen = Math.hypot(lv0.x, lv0.z) || 1
            const fx = lv0.x / fwdLen, fz = lv0.z / fwdLen
            for (let i = 0; i < 26; i++) {
              const spread = (Math.random() - 0.5) * 0.55
              const dir = Math.atan2(fz, fx) + spread
              const spd = 6.0 + Math.random() * 6.0
              const colors = [0xffdd00, 0xff8800, 0xff5500, 0xff2200]
              const spark = new THREE.Mesh(
                new THREE.SphereGeometry(0.055 + Math.random() * 0.045, 5, 4),
                new THREE.MeshBasicMaterial({ color: colors[i % 4], transparent: true, opacity: 0.95 })
              )
              const d = 0.05 + Math.random() * 0.25
              spark.position.set(pos.x + Math.cos(dir) * d, groundY + 0.03 + Math.random() * 0.12, pos.z + Math.sin(dir) * d)
              scene.add(spark)
              const lifeSpan = 0.22 + Math.random() * 0.1
              state.particles.push({
                mesh: spark, vx: Math.cos(dir) * spd, vz: Math.sin(dir) * spd,
                vy: 1.2 + Math.random() * 2.0,
                life: lifeSpan, maxLife: lifeSpan, beam: true,
              })
            }
            state.cameraShake = Math.max(state.cameraShake, 0.9)
            state.hitStop = Math.max(state.hitStop, 0.08)
            state.arenaFlash = 1.0
            noiseBurst(0.06, 0.09)
            beep({ freq: 200, duration: 0.05, type: 'sawtooth', gain: 0.045, slideTo: 75 })

          } else if (blade.key === 'defense') {
            // ── Aegis Guard ── ground disc flash + 3 staggered hex rings + crystal shards
            blade.guarding = 1.8
            blade.wobble *= 0.3
            const defenseAccent = new THREE.Color(blade.def.accent)
            const defenseColor = new THREE.Color(blade.def.color)
            const defenseLight = defenseAccent.clone().lerp(new THREE.Color(0xffffff), 0.55)
            // Instant ground flash disc
            const disc = new THREE.Mesh(
              new THREE.CircleGeometry(0.55, 32),
              new THREE.MeshBasicMaterial({ color: defenseLight, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
            )
            disc.rotation.x = -Math.PI / 2
            disc.position.set(pos.x, groundY, pos.z)
            scene.add(disc)
            state.particles.push({ mesh: disc, life: 0.38, maxLife: 0.38, shockwave: true, shockwaveScale: 4 })
            // 3 staggered hexagonal shield rings — snap out and fade by 0.65s
            const ringColors = [0xffffff, defenseAccent.clone(), defenseColor.clone()]
            for (let i = 0; i < 3; i++) {
              const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.85, 0.11 - i * 0.015, 6, 48),
                new THREE.MeshBasicMaterial({ color: ringColors[i], transparent: true, opacity: 0.0 })
              )
              ring.rotation.x = Math.PI / 2
              ring.position.set(pos.x, lowY + 0.06 + i * 0.20, pos.z)
              ring.visible = false
              scene.add(ring)
              state.particles.push({ mesh: ring, life: 0.65 - i * 0.08, maxLife: 0.65 - i * 0.08, aegis: true, spawnDelay: i * 0.08, followRb: blade.rb })
            }
            // 10 crystal shards — tight spawn, quick pop
            for (let i = 0; i < 14; i++) {
              const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3
              const r = 0.22 + Math.random() * 0.65
              const shard = new THREE.Mesh(
                new THREE.ConeGeometry(0.04 + Math.random() * 0.025, 0.45 + Math.random() * 0.3, 4),
                new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? defenseAccent : defenseLight, transparent: true, opacity: 0.9 })
              )
              shard.position.set(pos.x + Math.cos(a) * r, groundY + 0.03 + Math.random() * 0.1, pos.z + Math.sin(a) * r)
              shard.rotation.z = (Math.random() - 0.5) * 0.5
              scene.add(shard)
              state.particles.push({ mesh: shard, vx: Math.cos(a) * 0.4, vz: Math.sin(a) * 0.4, vy: 3.5 + Math.random() * 2.0, life: 0.38 + Math.random() * 0.14 })
            }
            state.arenaFlash = 0.5
            state.cameraShake = Math.max(state.cameraShake, 0.3)
            beep({ freq: 160, duration: 0.22, type: 'triangle', gain: 0.05, slideTo: 290 })

          } else if (blade.key === 'stamina') {
            // ── Silent Orbit ── sonar echo rings + two counter-rotating orb rings
            blade.silentOrbit = 2.4
            blade.wobble *= 0.4
            const staminaAccent = new THREE.Color(blade.def.accent)
            const staminaColor = new THREE.Color(blade.def.color)
            const staminaMid = staminaColor.clone().lerp(staminaAccent, 0.55)
            // 3 tight sonar-pulse rings that expand gently and follow the blade — staggered 0.1s
            const echoColors = [staminaAccent.clone(), staminaMid, staminaColor.clone()]
            for (let i = 0; i < 3; i++) {
              const echo = new THREE.Mesh(
                new THREE.RingGeometry(0.28, 0.46, 32),
                new THREE.MeshBasicMaterial({ color: new THREE.Color(echoColors[i]), transparent: true, opacity: 0, side: THREE.DoubleSide })
              )
              echo.rotation.x = -Math.PI / 2
              echo.position.set(pos.x, groundY + 0.03 + i * 0.04, pos.z)
              echo.visible = i === 0
              scene.add(echo)
              state.particles.push({ mesh: echo, life: 0.55, maxLife: 0.55, shockwave: true, shockwaveScale: 2.2, spawnDelay: i * 0.1, followRb: blade.rb })
            }
            // Inner ring (3 orbs, CW) + outer ring (3 orbs, CCW) — kept close
            for (let i = 0; i < 6; i++) {
              const inner = i < 3
              const radius = inner ? 0.9 : 1.4
              const startAngle = (i / 3) * Math.PI * 2 + (inner ? 0 : Math.PI / 3)
              const orb = new THREE.Mesh(
                new THREE.SphereGeometry(inner ? 0.14 : 0.1, 8, 8),
                new THREE.MeshBasicMaterial({ color: inner ? staminaColor : staminaAccent, transparent: true, opacity: 0.95 })
              )
              orb.position.set(pos.x + Math.cos(startAngle) * radius, midY + (i % 3) * 0.1, pos.z + Math.sin(startAngle) * radius)
              scene.add(orb)
              state.particles.push({
                mesh: orb, cx: pos.x, cz: pos.z,
                radius, angle: startAngle,
                angSpeed: inner ? 4.5 : -3.2,
                vy: 0.3,
                life: 0.7, maxLife: 0.7, orb: true, followRb: blade.rb,
              })
            }
            state.arenaFlash = 0.35
            beep({ freq: 520, duration: 0.2, type: 'sine', gain: 0.032, slideTo: 820 })

          } else if (blade.key === 'rubber') {
            // ── Vampire Drain ── void eye at centre + 36 particles swirling inward
            blade.vampireDrain = 2.2
            // Small dark void disc at blade centre — fades in place without expanding
            const voidEye = new THREE.Mesh(
              new THREE.CircleGeometry(0.22, 24),
              new THREE.MeshBasicMaterial({ color: 0x1a0033, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
            )
            voidEye.rotation.x = -Math.PI / 2
            voidEye.position.set(pos.x, groundY + 0.01, pos.z)
            scene.add(voidEye)
            state.particles.push({ mesh: voidEye, life: 0.6, maxLife: 0.6, shockwave: true, shockwaveScale: 0, followRb: blade.rb })
            // 36 drain particles swirling inward from wide radius with strong inward pull
            for (let i = 0; i < 36; i++) {
              const angle = (i / 36) * Math.PI * 2 + Math.random() * 0.15
              const r = 1.2 + Math.random() * 1.4
              const m = new THREE.Mesh(
                new THREE.SphereGeometry(0.058 + Math.random() * 0.038, 6, 6),
                new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xa855f7 : i % 3 === 1 ? 0xc084fc : 0x7c3aed, transparent: true, opacity: 0.92 })
              )
              m.position.set(pos.x + Math.cos(angle) * r, lowY + Math.random() * 0.25, pos.z + Math.sin(angle) * r)
              scene.add(m)
              state.particles.push({
                mesh: m, cx: pos.x, cz: pos.z,
                vx: -Math.sin(angle) * 2.0 - Math.cos(angle) * 2.5,
                vz:  Math.cos(angle) * 2.0 - Math.sin(angle) * 2.5,
                vy: 0.04,
                life: 0.62, maxLife: 0.62, vortex: true, followRb: blade.rb,
              })
            }
            state.arenaFlash = 0.8
            beep({ freq: 140, duration: 0.22, type: 'sawtooth', gain: 0.045, slideTo: 55 })
          }
        }

        function launchRound() {
          const p = state.player
          const c = state.cpu
          p.launchPower = 5.0 + state.charge * 6.0 * p.def.stats.speed
          p.launchAngle = state.angle
          c.launchPower = (6 + Math.random() * 2.5) * c.def.stats.speed
          c.launchAngle = Math.PI + (Math.random() * 0.8 - 0.4)

          p.rb.setTranslation({ x: -4.9, y: 0.22, z: 0 }, true)
          c.rb.setTranslation({ x: 4.9, y: 0.22, z: 0 }, true)
          p.rb.setLinvel({ x: Math.cos(p.launchAngle) * p.launchPower, y: 0, z: Math.sin(p.launchAngle) * p.launchPower }, true)
          c.rb.setLinvel({ x: Math.cos(c.launchAngle) * c.launchPower, y: 0, z: Math.sin(c.launchAngle) * c.launchPower }, true)
          p.spin = 38 + state.charge * 28 * p.def.stats.stamina
          c.spin = 50 + Math.random() * 15 * c.def.stats.stamina
          p.special = 12
          c.special = 12
          p.wobble = 0.02
          c.wobble = 0.02
          p.alive = true
          c.alive = true
          p.deathType = null
          c.deathType = null
          p.ringOutVisual = null
          c.ringOutVisual = null
          p.ringOutTimer = 0.18
          c.ringOutTimer = 0.18
          state.phase = 'fighting'
          state.launched = true
          countdown.value = null
          launchArrow.visible = false
          status.value = 'Fight! WASD to drift, Shift to burst, E to stabilise, Q for special.'
          beep({ freq: 240, duration: 0.08, type: 'sawtooth', gain: 0.03, slideTo: 130 })
        }

        // --- Input ---
        function processInput(dt) {
          if (state.phase === 'aiming') {
            if (state.keys.has('KeyA')) state.angle -= 2.2 * dt
            if (state.keys.has('KeyD')) state.angle += 2.2 * dt
            if (state.keys.has('Space')) state.charge = Math.min(1, state.charge + 0.65 * dt)
            else state.charge = Math.max(0, state.charge - 0.45 * dt)
            updateArrow()

            // Countdown auto-launch
            countdownTimer -= dt
            while (nextBeat < BEAT_TIMES.length && countdownTimer <= BEAT_TIMES[nextBeat]) {
              countdown.value = BEATS[nextBeat]
              if (BEATS[nextBeat] === 0) {
                beep({ freq: 880, duration: 0.12, type: 'square', gain: 0.04, slideTo: 880 })
              } else {
                beep({ freq: 440, duration: 0.08, type: 'square', gain: 0.025, slideTo: 440 })
              }
              nextBeat++
            }
            if (countdownTimer <= 0) {
              launchRound()
            }
            return
          }

          const p = state.player
          if (!p.alive) return
          const lv = p.rb.linvel()
          let addX = 0, addZ = 0
          const nudge = 7.6 * p.def.stats.grip
          if (state.keys.has('KeyW')) addZ -= nudge * dt
          if (state.keys.has('KeyS')) addZ += nudge * dt
          if (state.keys.has('KeyA')) addX -= nudge * dt
          if (state.keys.has('KeyD')) addX += nudge * dt
          p.rb.setLinvel({ x: lv.x + addX, y: 0, z: lv.z + addZ }, true)

          if (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight')) burst(p)
          if (state.keys.has('KeyE')) stabilise(p, dt)
        }

        // --- CPU AI ---
        // State machine: orbit → approach → orbit, overridden by recover (rim) or stabilise (wobble)
        function cpuBrain(dt) {
          if (state.phase !== 'fighting') return
          const cpu = state.cpu
          const player = state.player
          if (!cpu.alive) return

          // Persistent state initialised once per match
          if (cpu.aiState === undefined) {
            cpu.aiState = 'orbit'
            cpu.aiTimer = 0
            cpu.orbitDir = Math.random() < 0.5 ? 1 : -1
          }

          const cp = cpu.rb.translation()
          const pp = player.rb.translation()
          const lv = cpu.rb.linvel()
          const cpuR     = Math.hypot(cp.x, cp.z)
          const playerR  = Math.hypot(pp.x, pp.z)
          const dx = pp.x - cp.x, dz = pp.z - cp.z
          const dist     = Math.hypot(dx, dz) || 1
          const edgeDist      = 8.15 - cpuR
          const playerEdgeDist = 8.15 - playerR
          const cpuSpeed = Math.hypot(lv.x, lv.z)
          // Radial outward velocity (positive = moving toward rim)
          const velOut   = cpuR > 0.1 ? (lv.x * cp.x + lv.z * cp.z) / cpuR : 0

          cpu.aiTimer = Math.max(0, cpu.aiTimer - dt)

          // ── State transitions ──────────────────────────────────────────────
          // RECOVER: rim danger always overrides
          if (edgeDist < 1.8 || (edgeDist < 3.5 && velOut > 3.5)) {
            cpu.aiState = 'recover'
          } else if (cpu.aiState === 'recover' && edgeDist > 4.5 && velOut < 0.5) {
            cpu.aiState = 'orbit'
            cpu.aiTimer = 0.3
          }

          // STABILISE: dangerous wobble, not already recovering
          if (cpu.aiState !== 'recover' && cpu.wobble > 0.28 && cpu.spin > 5) {
            cpu.aiState = 'stabilise'
          } else if (cpu.aiState === 'stabilise' && (cpu.wobble < 0.10 || cpu.spin < 5)) {
            cpu.aiState = 'orbit'
          }

          // ORBIT → APPROACH: engage when player is reachable or near edge
          if (cpu.aiState === 'orbit' && cpu.aiTimer <= 0 && (dist < 6.5 || playerEdgeDist < 4.0)) {
            cpu.aiState = 'approach'
            cpu.aiTimer = 0.5 + Math.random() * 0.9
          }

          // APPROACH → ORBIT: disengage when timer up
          if (cpu.aiState === 'approach' && cpu.aiTimer <= 0) {
            cpu.aiState = 'orbit'
            cpu.aiTimer = 0.4 + Math.random() * 0.6
          }

          // ── Movement vectors ───────────────────────────────────────────────
          let moveX = 0, moveZ = 0

          if (cpu.aiState === 'recover') {
            // Drive straight inward — no blending, pure escape
            moveX = cpuR > 0.1 ? -cp.x / cpuR : 0
            moveZ = cpuR > 0.1 ? -cp.z / cpuR : 0

          } else if (cpu.aiState === 'stabilise') {
            stabilise(cpu, dt)
            // Drift gently toward orbit radius while recovering spin
            const radErr = cpuR - 4.5
            moveX = cpuR > 0.1 ? (-cp.x / cpuR) * Math.sign(radErr) * 0.3 : 0
            moveZ = cpuR > 0.1 ? (-cp.z / cpuR) * Math.sign(radErr) * 0.3 : 0

          } else if (cpu.aiState === 'orbit') {
            // Orbit at r≈4.5 with tangential + radial correction
            const radErr = cpuR - 4.5
            const tgX = cpuR > 0.1 ? (-cp.z / cpuR) * cpu.orbitDir : 0
            const tgZ = cpuR > 0.1 ? ( cp.x / cpuR) * cpu.orbitDir : 0
            const rdX = cpuR > 0.1 ? -cp.x / cpuR : 0
            const rdZ = cpuR > 0.1 ? -cp.z / cpuR : 0
            moveX = tgX * 0.75 + rdX * Math.sign(radErr) * Math.min(1, Math.abs(radErr) * 0.5) * 0.4
            moveZ = tgZ * 0.75 + rdZ * Math.sign(radErr) * Math.min(1, Math.abs(radErr) * 0.5) * 0.4
            // Occasionally reverse orbit direction to be unpredictable
            if (cpu.aiTimer <= 0 && Math.random() < 0.012) {
              cpu.orbitDir *= -1
              cpu.aiTimer = 1.5 + Math.random()
            }

          } else if (cpu.aiState === 'approach') {
            // Aim through a point just outward of the player with a tangential offset —
            // creates an angled hit that deflects them toward the rim instead of back to center
            const prx = playerR > 0.1 ? pp.x / playerR : 0
            const prz = playerR > 0.1 ? pp.z / playerR : 0
            const ptx = -prz * cpu.orbitDir * 0.55   // tangential nudge
            const ptz =  prx * cpu.orbitDir * 0.55
            const aimX = pp.x + prx * 1.0 + ptx - cp.x
            const aimZ = pp.z + prz * 1.0 + ptz - cp.z
            const aimMag = Math.hypot(aimX, aimZ) || 1
            moveX = aimX / aimMag
            moveZ = aimZ / aimMag
          }

          // Normalise so state scalar is the only magnitude driver
          const moveMag = Math.hypot(moveX, moveZ)
          if (moveMag > 0.001) { moveX /= moveMag; moveZ /= moveMag }

          // RECOVER gets extra thrust to fight outward momentum; orbit is gentle;
          // approach is at full strength. Matches player's 7.6*grip nudge per frame.
          const stateScale = cpu.aiState === 'recover' ? 1.9 : cpu.aiState === 'approach' ? 1.05 : 0.85
          const buildScale = cpu.key === 'attack' ? 1.1 : cpu.key === 'stamina' ? 0.9 : 1.0
          const nudge = 7.6 * cpu.def.stats.grip * stateScale * buildScale
          cpu.rb.setLinvel({
            x: lv.x + moveX * nudge * dt,
            y: 0,
            z: lv.z + moveZ * nudge * dt,
          }, true)

          // ── Tool usage ─────────────────────────────────────────────────────
          // Burst: approaching fast, player is near edge, CPU has clearance
          if (cpu.aiState === 'approach' && cpuSpeed > 4.0 && dist < 3.5
              && playerEdgeDist < 5.5 && edgeDist > 3.0
              && cpu.boostCooldown <= 0 && cpu.spin > 12 && Math.random() < 0.03) {
            burst(cpu, cpu.key === 'attack' ? 1.2 : 1.0)
          }

          // Stabilise: opportunistic spin recovery during orbit (costs spin, so gated)
          if (cpu.aiState === 'orbit' && cpu.wobble > 0.18 && cpu.spin > 10 && Math.random() < 0.05) {
            stabilise(cpu, dt)
          }

          // ULT: each build fires at different conditions
          if (cpu.special >= 100) {
            let fire = false
            if (cpu.key === 'attack')  fire = cpuSpeed > 3.5 && dist < 4.0 && playerEdgeDist < 5.5 && Math.random() < 0.06
            if (cpu.key === 'defense') fire = (dist < 2.8 || cpu.wobble > 0.22) && Math.random() < 0.05
            if (cpu.key === 'stamina') fire = (cpu.spin < player.spin * 0.9 || cpu.wobble > 0.15) && Math.random() < 0.05
            if (cpu.key === 'rubber')  fire = dist < 3.0 && Math.random() < 0.06
            if (!fire && Math.random() < 0.007) fire = true  // don't hoard a full gauge
            if (fire) triggerSpecial(cpu)
          }
        }

        // --- Blade update ---
        function updateBlade(blade, dt) {
          if (!blade.alive) {
            updateRingOutVisual(blade, dt)
            return
          }
          blade.boostCooldown = Math.max(0, blade.boostCooldown - dt)
          blade.guarding = Math.max(0, blade.guarding - dt)
          blade.silentOrbit = Math.max(0, blade.silentOrbit - dt)
          blade.vampireDrain = Math.max(0, blade.vampireDrain - dt)
          blade.smashWindow = Math.max(0, blade.smashWindow - dt)
          blade.lastImpact = Math.max(0, blade.lastImpact - dt * 2.6)
          blade.ultGlow   = Math.max(0, blade.ultGlow   - dt * 1.4)

          const pos = blade.rb.translation()
          const lv = blade.rb.linvel()
          const speed = Math.hypot(lv.x, lv.z)

          // Stadium force — inward on the bowl, outward once a blade crests the lip.
          const br = Math.hypot(pos.x, pos.z)
          if (br > STADIUM.flatRadius) {
            const slope = getStadiumSlope(br)
            const bowlAccel = -slope * STADIUM.bankGravity
            const bnx = pos.x / br, bnz = pos.z / br
            blade.rb.setLinvel({ x: lv.x + bnx * bowlAccel * dt, y: 0, z: lv.z + bnz * bowlAccel * dt }, true)
          }

          // Dragon Smash trail — spawn glowing discs at blade position
          if (blade.smashWindow > 0) {
            blade.trailAccum += dt
            while (blade.trailAccum >= 0.022) {
              blade.trailAccum -= 0.028
              const trailColor = Math.random() < 0.35 ? 0xffcc00 : Math.random() < 0.55 ? 0xff6600 : 0xff2200
              const disc = new THREE.Mesh(
                new THREE.CircleGeometry(0.16 + Math.random() * 0.18, 12),
                new THREE.MeshBasicMaterial({ color: trailColor, transparent: true, opacity: 0.88, side: THREE.DoubleSide })
              )
              disc.rotation.x = -Math.PI / 2
              disc.position.set(pos.x + (Math.random() - 0.5) * 0.1, 0.03, pos.z + (Math.random() - 0.5) * 0.1)
              scene.add(disc)
              state.particles.push({ mesh: disc, life: 0.22, maxLife: 0.22, trail: true })
            }
          } else {
            blade.trailAccum = 0
          }

          const radialVel = br > 0.001 ? (lv.x * pos.x + lv.z * pos.z) / br : 0
          if (br > STADIUM.lipRadius && radialVel > 0.35) {
            blade.deathType = 'ring_out'
            startRingOutVisual(blade)
            blade.alive = false
          } else {
            blade.ringOutTimer = 0.18
          }

          let drain = 1.6 + speed * 0.13 + blade.wobble * 1.2
          drain /= blade.def.stats.stamina
          if (blade.silentOrbit > 0) drain *= 0.45
          if (blade.guarding > 0) drain *= 0.82
          blade.spin = Math.max(0, blade.spin - drain * dt)

          blade.special = Math.min(100, blade.special + (0.9 + speed * 0.06) * dt * 10)

          if (blade.spin < 7) blade.wobble = Math.min(0.45, blade.wobble + 0.3 * dt)
          else blade.wobble = Math.max(0.01, blade.wobble - 0.03 * dt)

          if (blade.spin <= 0.1) {
            blade.alive = false
            blade.deathType = blade.deathType || 'spin_out'
            blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
          }

          syncMesh(blade)
        }

        // --- Collision ---
        function clampVelocity(blade) {
          const lv = blade.rb.linvel()
          const cap = 18
          const mag = Math.hypot(lv.x, lv.z)
          if (mag > cap) blade.rb.setLinvel({ x: (lv.x / mag) * cap, y: 0, z: (lv.z / mag) * cap }, true)
        }

        function resolveBladeCollision(a, b) {
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
          clampVelocity(a)
          clampVelocity(b)

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

          state.cameraShake = Math.max(state.cameraShake, Math.min(0.4, impact * 0.015))
          state.hitStop = Math.max(state.hitStop, Math.min(0.055, impact * 0.002))
          clashFlash.material.opacity = Math.min(0.9, 0.25 + impact * 0.05)
          clashFlash.scale.setScalar(1 + impact * 0.06)
          const hitX = (pa.x + pb.x) / 2
          const hitZ = (pa.z + pb.z) / 2
          const hitY = getSurfaceYAtXZ(hitX, hitZ, 0.04)
          clashFlash.position.set(hitX, hitY, hitZ)
          spawnImpact(
            new THREE.Vector3(hitX, hitY + 0.12, hitZ),
            new THREE.Color(a.def.accent || BUILD_DEFS[a.key].accent).getHex(),
            impact > 10 ? 26 : 16,
            1 + impact * 0.04
          )

          if (impact > 6.5) {
            noiseBurst(0.035 + Math.min(0.03, impact * 0.002), 0.06)
            beep({ freq: 180 + impact * 18, duration: 0.03, type: 'square', gain: 0.02, slideTo: 100 })
          }
        }

        // --- Particle update ---
        function updateParticles(dt) {
          clashFlash.material.opacity = Math.max(0, clashFlash.material.opacity - dt * 6)
          clashFlash.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10)

          for (let i = state.particles.length - 1; i >= 0; i--) {
            const p = state.particles[i]
            // Deferred spawn: don't tick until delay expires
            if (p.spawnDelay > 0) {
              p.spawnDelay -= dt
              if (p.spawnDelay <= 0) p.mesh.visible = true
              continue
            }
            p.life -= dt
            if (p.shockwave) {
              // Expanding ring — shockwaveScale controls how large it grows
              if (p.followRb) { const ft = p.followRb.translation(); p.mesh.position.x = ft.x; p.mesh.position.z = ft.z }
              const t = 1 - (p.life / p.maxLife)
              p.mesh.scale.setScalar(1 + t * (p.shockwaveScale ?? 9))
              p.mesh.material.opacity = Math.max(0, (1 - t) * 0.9)
            } else if (p.arc) {
              p.mesh.rotation.z += dt * 7
              p.mesh.scale.multiplyScalar(1 + dt * 3)
              p.mesh.material.opacity = Math.max(0, p.life * 4)
            } else if (p.beam) {
              // Stamina pillar or other rising elements (noGravity skips fall)
              p.mesh.position.x += p.vx * dt
              p.mesh.position.z += p.vz * dt
              p.mesh.position.y += p.vy * dt
              if (!p.noGravity) p.vy -= 5 * dt
              p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.95)
            } else if (p.aegis) {
              // Shield rings: snap-expand in first 25% of life, hold, then fade
              if (p.followRb) { const ft = p.followRb.translation(); p.mesh.position.x = ft.x; p.mesh.position.z = ft.z }
              const prog = 1 - p.life / p.maxLife
              p.mesh.scale.setScalar(1 + Math.min(prog * 4, 1.0) * 2.8)
              p.mesh.material.opacity = p.life > p.maxLife * 0.35
                ? 0.78
                : (p.life / (p.maxLife * 0.35)) * 0.78
            } else if (p.trail) {
              // Dragon Smash ground trail discs — shrink and fade in place
              const t = p.life / p.maxLife
              p.mesh.material.opacity = t * t * 0.88
              p.mesh.scale.setScalar(0.35 + t * 0.65)
            } else if (p.orb) {
              // Orbiting energy orbs: spin + slowly rise + fade at end
              if (p.followRb) { const ft = p.followRb.translation(); p.cx = ft.x; p.cz = ft.z }
              p.angle += p.angSpeed * dt
              p.mesh.position.x = p.cx + Math.cos(p.angle) * p.radius
              p.mesh.position.z = p.cz + Math.sin(p.angle) * p.radius
              p.mesh.position.y += p.vy * dt
              p.mesh.material.opacity = p.life > p.maxLife * 0.25
                ? 0.95
                : (p.life / (p.maxLife * 0.25)) * 0.95
            } else if (p.vortex) {
              // Spiral drain: tangential velocity already set; add homing acceleration
              if (p.followRb) {
                const ft = p.followRb.translation()
                // Translate particle rigidly with the blade each frame, then home on new cx/cz
                const ddx = ft.x - p.cx
                const ddz = ft.z - p.cz
                p.mesh.position.x += ddx
                p.mesh.position.z += ddz
                p.cx = ft.x
                p.cz = ft.z
              }
              const dx = p.cx - p.mesh.position.x
              const dz = p.cz - p.mesh.position.z
              const d = Math.hypot(dx, dz) || 1
              p.vx += (dx / d) * 16 * dt
              p.vz += (dz / d) * 16 * dt
              p.mesh.position.x += p.vx * dt
              p.mesh.position.z += p.vz * dt
              p.mesh.position.y += p.vy * dt
              p.vy -= 2 * dt
              p.mesh.material.opacity = Math.max(0, (p.life / p.maxLife) * 0.9)
              p.mesh.scale.setScalar(Math.max(0.12, p.life / p.maxLife))
            } else {
              p.mesh.position.x += p.vx * dt
              p.mesh.position.z += p.vz * dt
              p.mesh.position.y += p.vy * dt
              p.vy -= 8 * dt
              p.mesh.scale.setScalar(Math.max(0.15, p.life * 2.4))
            }
            if (p.life <= 0) {
              scene.remove(p.mesh)
              p.mesh.geometry.dispose()
              p.mesh.material.dispose()
              state.particles.splice(i, 1)
            }
          }
        }

        // --- Round resolution ---
        function resolveRound() {
          if (state.roundResolved) return
          const pAlive = state.player.alive
          const cAlive = state.cpu.alive
          let winner = 'cpu'
          if (pAlive && !cAlive) winner = 'player'
          else if (!pAlive && cAlive) winner = 'cpu'
          else winner = state.player.spin >= state.cpu.spin ? 'player' : 'cpu'

          state.roundResolved = true
          state.roundOver = true
          state.phase = 'round_end'
          countdown.value = null
          launchArrow.visible = false

          const nextScore = { ...roundScore.value }
          nextScore[winner] += 1
          const isMatchOver = nextScore.player >= 2 || nextScore.cpu >= 2
          // Don't increment round here — do it after the delay so the watch isn't
          // triggered prematurely, which would reset the round before the overlay shows.
          roundScore.value = nextScore

          const loserBlade = winner === 'player' ? state.cpu : state.player
          const winType = loserBlade.deathType === 'ring_out' ? 'Ring Out' : 'Spin Out'
          roundResult.value = { type: winType, outcome: winner === 'player' ? 'You Win' : 'CPU Wins', winner, isMatchOver }

          if (winner === 'player') {
            beep({ freq: 660, duration: 0.15, type: 'sawtooth', gain: 0.03, slideTo: 920 })
          } else {
            beep({ freq: 220, duration: 0.18, type: 'sawtooth', gain: 0.03, slideTo: 140 })
          }

          state.resetClock = isMatchOver ? 2.8 : 2.2
          state.matchOver = isMatchOver
        }

        // --- Main loop ---
        function animate(now) {
          if (destroyed) return
          let dt = Math.min(0.033, (now - state.lastTime) / 1000)
          state.lastTime = now

          if (state.hitStop > 0) {
            state.hitStop -= dt
            dt *= 0.08
          }

          processInput(dt)
          cpuBrain(dt)

          if (state.phase === 'fighting' || state.phase === 'round_end') {
            world.step()
            resolveBladeCollision(state.player, state.cpu)
            updateBlade(state.player, dt)
            updateBlade(state.cpu, dt)

            if (!state.roundResolved && (!state.player.alive || !state.cpu.alive)) {
              resolveRound()
            }
          } else {
            syncMesh(state.player)
            syncMesh(state.cpu)
          }

          updateParticles(dt)
          arenaGlow.intensity = 4 + state.arenaFlash * 14
          state.arenaFlash = Math.max(0, state.arenaFlash - dt * 3.5)

          // Sync HUD reactive refs
          playerHud.value = { spin: state.player.spin, special: state.player.special, build: state.player.key, specialName: state.player.def.specialName }
          cpuHud.value = { spin: state.cpu.spin, special: state.cpu.special, build: state.cpu.key, specialName: state.cpu.def.specialName }

          const shake = state.cameraShake
          state.cameraShake = Math.max(0, state.cameraShake - dt * 1.8)
          camera.position.set(
            Math.sin(now * 0.03) * shake * 0.7,
            18 + Math.cos(now * 0.027) * shake * 0.4,
            16 + Math.sin(now * 0.035) * shake * 0.5
          )
          camera.lookAt(0, 0.1, 0)

          renderer.render(scene, camera)

          if (state.roundOver) {
            state.resetClock -= dt
            if (state.resetClock <= 0) {
              roundResult.value = null
              if (state.matchOver) {
                gamePhase.value = 'menu'
                roundScore.value = { player: 0, cpu: 0, round: 1 }
              } else {
                // Increment round now — this triggers the watcher to boot the next round
                roundScore.value = { ...roundScore.value, round: roundScore.value.round + 1 }
              }
              destroyed = true
              return
            }
          }

          requestAnimationFrame(animate)
        }

        // --- Event listeners ---
        function onKeyDown(e) {
          if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
          state.keys.add(e.code)
          if (e.code === 'KeyQ' && state.phase === 'fighting') triggerSpecial(state.player)
        }

        function onKeyUp(e) {
          state.keys.delete(e.code)
          // SPACE no longer triggers launch — countdown is automatic
        }

        function onResize() {
          const mountEl = mountRef.value
          if (!mountEl) return
          camera.aspect = mountEl.clientWidth / mountEl.clientHeight
          camera.updateProjectionMatrix()
          renderer.setSize(mountEl.clientWidth, mountEl.clientHeight)
        }

        cleanupFns = [
          () => window.removeEventListener('keydown', onKeyDown),
          () => window.removeEventListener('keyup', onKeyUp),
          () => window.removeEventListener('resize', onResize),
          () => { renderer.dispose(); mount.innerHTML = '' },
        ]

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)
        window.addEventListener('resize', onResize)
        requestAnimationFrame(animate)
      }

      boot()
    },
    { flush: 'post' }
  )

  return { selectedBuild, gamePhase, status, roundScore, playerHud, cpuHud, buildEntries, roundResult, countdown, aimAngle }
}
