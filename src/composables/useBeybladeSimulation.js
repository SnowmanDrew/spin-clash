import { ref, computed, watch } from 'vue'
import * as THREE from 'three'
import { BUILD_DEFS, CPU_BUILD_ORDER } from '../data/buildDefs.js'
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
        scene.fog = new THREE.Fog(0x0c0820, 10, 24)

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        mount.innerHTML = ''
        mount.appendChild(renderer.domElement)

        const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 100)
        camera.position.set(0, 12.5, 11.5)
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

        // --- Arena geometry ---
        const floor = new THREE.Mesh(
          new THREE.CylinderGeometry(9.4, 10.2, 1.2, 64),
          new THREE.MeshStandardMaterial({ color: 0x19114e, roughness: 0.72, metalness: 0.15 })
        )
        floor.receiveShadow = true
        floor.position.y = -0.65
        scene.add(floor)

        const bowl = new THREE.Mesh(
          new THREE.CylinderGeometry(8.1, 9.0, 0.8, 64, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x0e0828, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide })
        )
        bowl.position.y = -0.15
        bowl.receiveShadow = true
        scene.add(bowl)

        const outerNeon = new THREE.Mesh(
          new THREE.TorusGeometry(8.15, 0.22, 16, 72),
          new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.35 })
        )
        outerNeon.rotation.x = Math.PI / 2
        outerNeon.position.y = 0.04
        scene.add(outerNeon)

        const innerDisc = new THREE.Mesh(
          new THREE.CircleGeometry(2.4, 48),
          new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8, metalness: 0.1 })
        )
        innerDisc.rotation.x = -Math.PI / 2
        innerDisc.position.y = 0.02
        scene.add(innerDisc)

        const decalRing = new THREE.Mesh(
          new THREE.RingGeometry(2.6, 5.7, 64),
          new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
        )
        decalRing.rotation.x = -Math.PI / 2
        decalRing.position.y = 0.021
        scene.add(decalRing)

        // --- Physics world ---
        const world = new World({ x: 0, y: -9.81, z: 0 })

        const groundRB = world.createRigidBody(RigidBodyDesc.fixed())
        world.createCollider(ColliderDesc.cylinder(0.4, 8.4).setTranslation(0, -0.2, 0).setRestitution(0.65).setFriction(0.15), groundRB)
        world.createCollider(ColliderDesc.cylinder(0.8, 8.95).setTranslation(0, -0.65, 0), groundRB)

        const wallCount = 32
        for (let i = 0; i < wallCount; i++) {
          const a = (i / wallCount) * Math.PI * 2
          const x = Math.cos(a) * 8.2
          const z = Math.sin(a) * 8.2
          const wallRB = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(x, 0.35, z).setRotation({ x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }))
          world.createCollider(ColliderDesc.cuboid(0.35, 0.55, 1.0).setRestitution(0.9).setFriction(0.08), wallRB)
        }

        // --- Blade mesh builder (cel-shaded, per-build cartoon archetype) ---
        function makeBeybladeMesh(primary, accent, buildKey) {
          const group = new THREE.Group()
          const primaryColor = new THREE.Color(primary)

          // 3-step hard toon gradient — dark / mid / light bands
          const gradientMap = new THREE.DataTexture(
            new Uint8Array([58, 138, 228]), 3, 1, THREE.RedFormat
          )
          gradientMap.minFilter = THREE.NearestFilter
          gradientMap.magFilter = THREE.NearestFilter
          gradientMap.needsUpdate = true

          function toon(color, emissive = 0x000000, emissiveIntensity = 0) {
            return new THREE.MeshToonMaterial({
              color: new THREE.Color(color),
              gradientMap,
              emissive: new THREE.Color(emissive),
              emissiveIntensity,
            })
          }

          // Black BackSide outline — the classic toon ink-line technique
          function mkOutline(mesh, s = 1.10) {
            const o = new THREE.Mesh(
              mesh.geometry,
              new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
            )
            o.scale.setScalar(s)
            mesh.add(o)
          }

          // ---- SHARED BASE STRUCTURE (all builds) ----

          // Ground shadow
          const shadowDisc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.98, 0.98, 0.03, 48),
            new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
          )
          shadowDisc.position.y = -0.20
          group.add(shadowDisc)

          // Spin tip — sharp silver point at the bottom
          const spinTip = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.28, 10),
            toon(0xd0dce8)
          )
          spinTip.rotation.x = Math.PI
          spinTip.position.y = 0.05
          mkOutline(spinTip, 1.12)
          group.add(spinTip)

          // Spin gear housing — squat tapered shaft above the tip
          const gearHousing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.40, 0.26, 0.24, 20),
            toon(0x5e6b76)
          )
          gearHousing.position.y = 0.24
          mkOutline(gearHousing, 1.06)
          group.add(gearHousing)

          // Gear ridge detail at shaft base
          const gearRidge = new THREE.Mesh(
            new THREE.TorusGeometry(0.40, 0.035, 6, 28),
            toon(0x7c8e99)
          )
          gearRidge.rotation.x = Math.PI / 2
          gearRidge.position.y = 0.14
          group.add(gearRidge)

          // Weight disk — wide flat silver ring (the heavy "10-wide" type from classic sets)
          const weightDisk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.82, 0.78, 0.11, 40),
            toon(0x9daab5)
          )
          weightDisk.position.y = 0.32
          weightDisk.castShadow = true
          mkOutline(weightDisk, 1.03)
          group.add(weightDisk)

          // Weight disk inner raised step
          const weightInner = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.42, 0.15, 30),
            toon(0xb8c4cc)
          )
          weightInner.position.y = 0.33
          group.add(weightInner)

          // ---- ATTACK RING — unique per build, sits y≈0.38 ----
          // This is the design signature: each build has completely different geometry here.

          if (buildKey === 'attack') {
            // DRAGON WINGS — 2 large swept scimitar blades + 2 small counter-fins (Dranzer-style)
            const bladeMat = toon(primaryColor, primary, 0.18)
            const accentMat = toon(accent, accent, 0.72)

            for (let i = 0; i < 2; i++) {
              const a = (i / 2) * Math.PI * 2
              // Main wing body — long radial box swept forward
              const wing = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.14, 0.30), bladeMat)
              wing.position.set(Math.cos(a + 0.32) * 0.54, 0.38, Math.sin(a + 0.32) * 0.54)
              wing.rotation.y = a + 0.32
              wing.castShadow = true
              mkOutline(wing, 1.07)
              group.add(wing)
              // Sharp accent spike at the tip of each wing
              const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.30, 8), accentMat)
              tipCone.position.set(Math.cos(a + 0.28) * 0.95, 0.38, Math.sin(a + 0.28) * 0.95)
              tipCone.rotation.z = -Math.PI / 2
              tipCone.rotation.y = a + 0.28
              mkOutline(tipCone, 1.14)
              group.add(tipCone)
            }
            // 2 shorter counter-fins offset 90° — swept backward for asymmetry
            for (let i = 0; i < 2; i++) {
              const a = (i / 2) * Math.PI * 2 + Math.PI / 2
              const fin = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.20), bladeMat)
              fin.position.set(Math.cos(a - 0.28) * 0.52, 0.38, Math.sin(a - 0.28) * 0.52)
              fin.rotation.y = a - 0.28
              mkOutline(fin, 1.09)
              group.add(fin)
            }
            // Emissive energy ring at attack ring base
            const atkRing = new THREE.Mesh(
              new THREE.TorusGeometry(0.76, 0.04, 8, 36),
              new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.1, roughness: 0.16, metalness: 0.08 })
            )
            atkRing.rotation.x = Math.PI / 2
            atkRing.position.y = 0.38
            group.add(atkRing)
          }

          if (buildKey === 'defense') {
            // CASTLE SHIELD — 4 wide blocky panels around a heavy armour ring (Draciel turtle-shell)
            const shieldMat = toon(primaryColor)
            const armorMat = toon(accent, accent, 0.28)

            // 4 wide flat shield panels — square and solid
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * Math.PI * 2
              const panel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.44), shieldMat)
              panel.position.set(Math.cos(a) * 0.62, 0.38, Math.sin(a) * 0.62)
              panel.rotation.y = a
              panel.castShadow = true
              mkOutline(panel, 1.05)
              group.add(panel)
            }
            // Heavy armour ring binding the panels
            const armorRing = new THREE.Mesh(
              new THREE.TorusGeometry(0.80, 0.13, 12, 36),
              armorMat
            )
            armorRing.rotation.x = Math.PI / 2
            armorRing.position.y = 0.44
            group.add(armorRing)
            // Accent bolts at the four shield junctions
            for (let i = 0; i < 4; i++) {
              const a = (i / 4) * Math.PI * 2 + Math.PI / 4
              const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 8), armorMat)
              bolt.position.set(Math.cos(a) * 0.80, 0.44, Math.sin(a) * 0.80)
              group.add(bolt)
            }
          }

          if (buildKey === 'stamina') {
            // AERODYNAMIC SWEPT BLADES — 3 long smooth fan blades, rounded tips (Wolfborg/gyroscope)
            const bladeMat = toon(primaryColor, primary, 0.12)
            const capMat = toon(accent, accent, 0.65)

            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2
              // Long thin swept blade — like a propeller aerofoil
              const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.09, 0.26), bladeMat)
              blade.position.set(Math.cos(a - 0.22) * 0.50, 0.38, Math.sin(a - 0.22) * 0.50)
              blade.rotation.y = a - 0.22
              blade.castShadow = true
              mkOutline(blade, 1.07)
              group.add(blade)
              // Rounded sphere cap at the outer tip
              const cap = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 10), capMat)
              cap.position.set(Math.cos(a - 0.22) * 0.92, 0.38, Math.sin(a - 0.22) * 0.92)
              group.add(cap)
            }
            // Bright orbital halo ring — the stamina signature glow
            const halo = new THREE.Mesh(
              new THREE.TorusGeometry(0.84, 0.040, 8, 48),
              new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2.2, roughness: 0.06, metalness: 0.06 })
            )
            halo.rotation.x = Math.PI / 2
            halo.position.y = 0.50
            group.add(halo)
          }

          if (buildKey === 'rubber') {
            // RUBBER CONTACT RING — solid core with 6 outer bumper pads (studded wheel look)
            const coreMat = toon(primaryColor, primary, 0.10)
            const bumperMat = toon(accent, accent, 0.18)

            // Inner ring core body
            const core = new THREE.Mesh(
              new THREE.CylinderGeometry(0.60, 0.56, 0.18, 32),
              coreMat
            )
            core.position.y = 0.38
            mkOutline(core, 1.04)
            group.add(core)
            // 3 spoke arms connecting core to bumper ring
            for (let i = 0; i < 3; i++) {
              const a = (i / 3) * Math.PI * 2
              const arm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.10, 0.16), coreMat)
              arm.position.set(Math.cos(a) * 0.74, 0.38, Math.sin(a) * 0.74)
              arm.rotation.y = a
              group.add(arm)
            }
            // 6 outer rubber bumper cylinders — the distinctive studded contact look
            for (let i = 0; i < 6; i++) {
              const a = (i / 6) * Math.PI * 2
              const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.20, 12), bumperMat)
              bumper.position.set(Math.cos(a) * 0.86, 0.38, Math.sin(a) * 0.86)
              mkOutline(bumper, 1.14)
              group.add(bumper)
            }
          }

          // ---- BIT CHIP HOUSING — hexagonal, build-coloured ----
          const bitHousing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.28, 0.17, 6),
            toon(primaryColor.clone().offsetHSL(0, 0.04, -0.08))
          )
          bitHousing.position.y = 0.48
          bitHousing.castShadow = true
          mkOutline(bitHousing, 1.08)
          group.add(bitHousing)

          // Bit gem — hexagonal emissive jewel on top
          const gem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.11, 0.13, 0.09, 6),
            toon(accent, accent, 2.4)
          )
          gem.position.y = 0.58
          group.add(gem)

          // Aura ring — driven by special meter
          const aura = new THREE.Mesh(
            new THREE.TorusGeometry(1.10, 0.03, 8, 52),
            new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.0 })
          )
          aura.rotation.x = Math.PI / 2
          aura.position.y = 0.26
          group.add(aura)

          scene.add(group)
          return { group, aura }
        }

        // --- Blade controller factory ---
        function buildController({ key, isPlayer, name, spawnX }) {
          const def = BUILD_DEFS[key]
          const meshPack = makeBeybladeMesh(def.color, def.accent, key)
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
            ultGlow: 0, trailAccum: 0,
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
          new THREE.Vector3(-4.9, 0.25, 0),
          2.2, 0xFFE500, 0.55, 0.28
        )
        scene.add(launchArrow)

        function updateArrow() {
          const dir = new THREE.Vector3(Math.cos(state.angle), 0, Math.sin(state.angle))
          launchArrow.setDirection(dir)
          launchArrow.setLength(1.4 + state.charge * 2.6, 0.55 + state.charge * 0.18, 0.28)
          launchArrow.setColor(new THREE.Color().setHSL(0.13 - state.charge * 0.10, 1.0, 0.55))
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

        // --- Blade visual sync ---
        function syncMesh(blade) {
          const t = blade.rb.translation()
          blade.mesh.position.set(t.x, 0.02, t.z)
          blade.mesh.rotation.y += blade.spin * 0.032 * blade.spinDir
          blade.mesh.rotation.x = Math.sin(performance.now() * 0.02 + t.x) * blade.wobble * 0.7
          blade.mesh.rotation.z = Math.cos(performance.now() * 0.024 + t.z) * blade.wobble * 0.7
          const activeAbility = blade.guarding > 0 || blade.silentOrbit > 0 || blade.vampireDrain > 0 || blade.smashWindow > 0
          blade.aura.material.opacity = Math.min(1.0,
            blade.special / 100 * 0.5 +
            (activeAbility ? 0.2 : 0) +
            blade.ultGlow * 0.65)
          blade.aura.scale.setScalar(1 + blade.special / 300 + blade.lastImpact * 0.08 + blade.ultGlow * 3.8)
          // Blade point light: pulses hard on ult, softly on impact
          blade.bladeLight.position.set(t.x, 0.4, t.z)
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
            ring.position.set(pos.x, 0.08, pos.z)
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
              spark.position.set(pos.x + Math.cos(dir) * d, 0.06 + Math.random() * 0.12, pos.z + Math.sin(dir) * d)
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
            // Instant ground flash disc
            const disc = new THREE.Mesh(
              new THREE.CircleGeometry(0.55, 32),
              new THREE.MeshBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
            )
            disc.rotation.x = -Math.PI / 2
            disc.position.set(pos.x, 0.03, pos.z)
            scene.add(disc)
            state.particles.push({ mesh: disc, life: 0.38, maxLife: 0.38, shockwave: true, shockwaveScale: 4 })
            // 3 staggered hexagonal shield rings — snap out and fade by 0.65s
            const ringColors = [0xffffff, 0x93c5fd, 0x3b82f6]
            for (let i = 0; i < 3; i++) {
              const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.85, 0.11 - i * 0.015, 6, 48),
                new THREE.MeshBasicMaterial({ color: ringColors[i], transparent: true, opacity: 0.0 })
              )
              ring.rotation.x = Math.PI / 2
              ring.position.set(pos.x, 0.14 + i * 0.20, pos.z)
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
                new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xbfdbfe : 0xffffff, transparent: true, opacity: 0.9 })
              )
              shard.position.set(pos.x + Math.cos(a) * r, 0.06 + Math.random() * 0.1, pos.z + Math.sin(a) * r)
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
            // 3 tight sonar-pulse rings that expand gently and follow the blade — staggered 0.1s
            const echoColors = [0x6ee7b7, 0x34d399, 0x10b981]
            for (let i = 0; i < 3; i++) {
              const echo = new THREE.Mesh(
                new THREE.RingGeometry(0.28, 0.46, 32),
                new THREE.MeshBasicMaterial({ color: new THREE.Color(echoColors[i]), transparent: true, opacity: 0, side: THREE.DoubleSide })
              )
              echo.rotation.x = -Math.PI / 2
              echo.position.set(pos.x, 0.06 + i * 0.04, pos.z)
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
                new THREE.MeshBasicMaterial({ color: inner ? 0x10b981 : 0x6ee7b7, transparent: true, opacity: 0.95 })
              )
              orb.position.set(pos.x + Math.cos(startAngle) * radius, 0.28 + (i % 3) * 0.1, pos.z + Math.sin(startAngle) * radius)
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
            voidEye.position.set(pos.x, 0.04, pos.z)
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
              m.position.set(pos.x + Math.cos(angle) * r, 0.08 + Math.random() * 0.25, pos.z + Math.sin(angle) * r)
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
        function cpuBrain(dt) {
          if (state.phase !== 'fighting') return
          const cpu = state.cpu
          const player = state.player
          if (!cpu.alive) return

          const cp = cpu.rb.translation()
          const pp = player.rb.translation()
          const dx = pp.x - cp.x
          const dz = pp.z - cp.z
          const dist = Math.hypot(dx, dz) || 1
          const lv = cpu.rb.linvel()

          // Arena boundary awareness: if very close to the edge, steer toward center
          const edgeDist = 8.55 - Math.hypot(cp.x, cp.z)
          const tooClose = edgeDist < 1.1
          const targetX = tooClose ? -cp.x : dx
          const targetZ = tooClose ? -cp.z : dz
          const targetDist = tooClose ? Math.hypot(cp.x, cp.z) || 1 : dist
          const nx = targetX / targetDist
          const nz = targetZ / targetDist

          // Slight brake only right at the lip
          const velToEdge = (lv.x * cp.x + lv.z * cp.z) / (Math.hypot(cp.x, cp.z) || 1)
          const edgeBrake = (edgeDist < 1.5 && velToEdge > 0) ? 1 - Math.min(0.45, (1.5 - edgeDist) / 1.5) : 1

          const intent = cpu.key === 'attack' ? 1.35 : cpu.key === 'stamina' ? 0.8 : 1.0
          cpu.rb.setLinvel({
            x: (lv.x + nx * 2.9 * intent * dt) * edgeBrake,
            y: 0,
            z: (lv.z + nz * 2.9 * intent * dt) * edgeBrake,
          }, true)

          if (dist < 2.4 && cpu.spin > 8 && cpu.boostCooldown <= 0 && !tooClose && Math.random() < 0.024) burst(cpu, cpu.key === 'attack' ? 1.2 : 1)
          if (cpu.spin < 8 && Math.random() < 0.04) stabilise(cpu, dt)
          if (cpu.special >= 100 && (dist < 3.6 || cpu.spin < player.spin) && Math.random() < 0.03) triggerSpecial(cpu)
        }

        // --- Blade update ---
        function updateBlade(blade, dt) {
          if (!blade.alive) return
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

          if (Math.hypot(pos.x, pos.z) > 8.55) {
            if (!blade.deathType) blade.deathType = 'ring_out'
            blade.ringOutTimer = (blade.ringOutTimer ?? 0.4) - dt
            if (blade.ringOutTimer <= 0) {
              blade.alive = false
              blade.spin = 0
              blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true)
            }
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
          clashFlash.position.set((pa.x + pb.x) / 2, 0.08, (pa.z + pb.z) / 2)
          spawnImpact(
            new THREE.Vector3((pa.x + pb.x) / 2, 0.2, (pa.z + pb.z) / 2),
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
            12.5 + Math.cos(now * 0.027) * shake * 0.4,
            11.5 + Math.sin(now * 0.035) * shake * 0.5
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
