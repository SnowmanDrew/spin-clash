import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { World, RigidBodyDesc, ColliderDesc } from '@dimforge/rapier3d-compat';

const BUILD_DEFS = {
  attack: {
    key: 'attack',
    name: 'Attack',
    color: '#ef4444',
    accent: '#fb7185',
    description: 'Fast, aggressive, heavy recoil. Best for ring-outs and burst pressure.',
    stats: { speed: 1.2, weight: 0.95, stamina: 0.85, grip: 0.95, smash: 1.35, defense: 0.9 },
    specialName: 'Dragon Smash',
    specialDescription: 'A forward lunge that converts spin into a massive knockout hit.',
  },
  defense: {
    key: 'defense',
    name: 'Defense',
    color: '#3b82f6',
    accent: '#93c5fd',
    description: 'Heavy and stable. Great at resisting knockback and surviving long exchanges.',
    stats: { speed: 0.9, weight: 1.35, stamina: 1.05, grip: 1.1, smash: 0.95, defense: 1.35 },
    specialName: 'Aegis Guard',
    specialDescription: 'A temporary stability shield that shrugs off impacts and wobble.',
  },
  stamina: {
    key: 'stamina',
    name: 'Stamina',
    color: '#10b981',
    accent: '#6ee7b7',
    description: 'Efficient spin economy with smooth movement and strong endgame survival.',
    stats: { speed: 0.98, weight: 1.0, stamina: 1.4, grip: 1.0, smash: 0.85, defense: 1.0 },
    specialName: 'Silent Orbit',
    specialDescription: 'A spin-conserving focus state that reduces drain and recenters control.',
  },
  rubber: {
    key: 'rubber',
    name: 'Rubber / Spin-Steal',
    color: '#a855f7',
    accent: '#e9d5ff',
    description: 'Sticky contact and reverse-spin tricks. Strong against careless opponents.',
    stats: { speed: 1.0, weight: 0.98, stamina: 1.08, grip: 1.28, smash: 0.92, defense: 0.98 },
    specialName: 'Vampire Drain',
    specialDescription: 'Steals enemy spin on contact and converts it into a comeback surge.',
  },
};

const CPU_BUILD_ORDER = ['attack', 'defense', 'stamina', 'rubber'];

export default function BeybladeAnimeVerticalSlice() {
  const mountRef = useRef(null);
  const audioCtxRef = useRef(null);
  const [selectedBuild, setSelectedBuild] = useState('attack');
  const [gamePhase, setGamePhase] = useState('menu');
  const [status, setStatus] = useState('Choose your blade, then launch into battle.');
  const [roundScore, setRoundScore] = useState({ player: 0, cpu: 0, round: 1 });
  const [playerHud, setPlayerHud] = useState({ spin: 0, special: 0, build: 'attack', specialName: BUILD_DEFS.attack.specialName });
  const [cpuHud, setCpuHud] = useState({ spin: 0, special: 0, build: 'defense', specialName: BUILD_DEFS.defense.specialName });

  const buildEntries = useMemo(() => Object.values(BUILD_DEFS), []);

  useEffect(() => {
    if (gamePhase !== 'battle') return;

    let destroyed = false;
    let cleanupFns = [];

    async function boot() {
      const mount = mountRef.current;
      if (!mount) return;

      const RAPIER = await import('@dimforge/rapier3d-compat');
      await RAPIER.init();
      if (destroyed) return;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07111f);
      scene.fog = new THREE.Fog(0x07111f, 10, 24);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.innerHTML = '';
      mount.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 100);
      camera.position.set(0, 12.5, 11.5);
      camera.lookAt(0, 0, 0);

      const hemi = new THREE.HemisphereLight(0xc7f2ff, 0x0b1220, 1.25);
      scene.add(hemi);

      const dir = new THREE.DirectionalLight(0xffffff, 1.7);
      dir.position.set(7, 12, 6);
      dir.castShadow = true;
      dir.shadow.mapSize.width = 1024;
      dir.shadow.mapSize.height = 1024;
      scene.add(dir);

      const arenaGlow = new THREE.PointLight(0x38bdf8, 4, 20, 2);
      arenaGlow.position.set(0, 1.5, 0);
      scene.add(arenaGlow);

      const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

      const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(9.4, 10.2, 1.2, 64),
        new THREE.MeshStandardMaterial({ color: 0x14213d, roughness: 0.72, metalness: 0.15 })
      );
      floor.receiveShadow = true;
      floor.position.y = -0.65;
      scene.add(floor);

      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(8.1, 9.0, 0.8, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide })
      );
      bowl.position.y = -0.15;
      bowl.receiveShadow = true;
      scene.add(bowl);

      const outerNeon = new THREE.Mesh(
        new THREE.TorusGeometry(8.15, 0.22, 16, 72),
        new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 1.2, metalness: 0.1, roughness: 0.35 })
      );
      outerNeon.rotation.x = Math.PI / 2;
      outerNeon.position.y = 0.04;
      scene.add(outerNeon);

      const innerDisc = new THREE.Mesh(
        new THREE.CircleGeometry(2.4, 48),
        new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8, metalness: 0.1 })
      );
      innerDisc.rotation.x = -Math.PI / 2;
      innerDisc.position.y = 0.02;
      scene.add(innerDisc);

      const decalRing = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 5.7, 64),
        new THREE.MeshBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.2, side: THREE.DoubleSide })
      );
      decalRing.rotation.x = -Math.PI / 2;
      decalRing.position.y = 0.021;
      scene.add(decalRing);

      const groundRB = world.createRigidBody(RigidBodyDesc.fixed());
      world.createCollider(ColliderDesc.cylinder(0.4, 8.4).setTranslation(0, -0.2, 0).setRestitution(0.65).setFriction(0.15), groundRB);
      world.createCollider(ColliderDesc.cylinder(0.8, 8.95).setTranslation(0, -0.65, 0), groundRB);

      const wallCount = 32;
      for (let i = 0; i < wallCount; i++) {
        const a = (i / wallCount) * Math.PI * 2;
        const x = Math.cos(a) * 8.2;
        const z = Math.sin(a) * 8.2;
        const wallRB = world.createRigidBody(RigidBodyDesc.fixed().setTranslation(x, 0.35, z).setRotation({ x: 0, y: Math.sin(-a / 2), z: 0, w: Math.cos(-a / 2) }));
        world.createCollider(ColliderDesc.cuboid(0.35, 0.55, 1.0).setRestitution(0.9).setFriction(0.08), wallRB);
      }

      function makeBeybladeMesh(primary, accent, buildKey) {
        const group = new THREE.Group();

        const shadowDisc = new THREE.Mesh(
          new THREE.CylinderGeometry(0.92, 0.92, 0.06, 32),
          new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
        );
        shadowDisc.position.y = -0.22;
        group.add(shadowDisc);

        const lowerMetal = new THREE.Mesh(
          new THREE.CylinderGeometry(0.64, 0.46, 0.18, 40),
          new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.28 })
        );
        lowerMetal.castShadow = true;
        lowerMetal.position.y = 0.14;
        group.add(lowerMetal);

        const upperCore = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.56, 0.18, 36),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(primary).offsetHSL(0, 0, 0.05), metalness: 0.5, roughness: 0.35 })
        );
        upperCore.position.y = 0.26;
        upperCore.castShadow = true;
        group.add(upperCore);

        const centerGem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.17, 0.1, 20),
          new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.1, metalness: 0.2, roughness: 0.18 })
        );
        centerGem.position.y = 0.39;
        group.add(centerGem);

        const wingMaterial = new THREE.MeshStandardMaterial({ color: primary, emissive: primary, emissiveIntensity: 0.35, metalness: 0.35, roughness: 0.3 });
        const wingGeom = new THREE.BoxGeometry(0.65, 0.09, 0.18);
        for (let i = 0; i < 6; i++) {
          const wing = new THREE.Mesh(wingGeom, wingMaterial);
          wing.position.set(Math.cos((i / 6) * Math.PI * 2) * 0.56, 0.34, Math.sin((i / 6) * Math.PI * 2) * 0.56);
          wing.rotation.y = (i / 6) * Math.PI * 2;
          wing.rotation.z = 0.28;
          wing.castShadow = true;
          group.add(wing);
        }

        if (buildKey === 'attack') {
          const spikeMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.2 });
          for (let i = 0; i < 3; i++) {
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 10), spikeMat);
            spike.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.88, 0.28, Math.sin((i / 3) * Math.PI * 2) * 0.88);
            spike.rotation.z = -Math.PI / 2;
            spike.rotation.x = (i / 3) * Math.PI * 2;
            spike.castShadow = true;
            group.add(spike);
          }
        }

        if (buildKey === 'defense') {
          const shield = new THREE.Mesh(
            new THREE.TorusGeometry(0.84, 0.1, 12, 32),
            new THREE.MeshStandardMaterial({ color: accent, metalness: 0.7, roughness: 0.25, emissive: accent, emissiveIntensity: 0.25 })
          );
          shield.rotation.x = Math.PI / 2;
          shield.position.y = 0.27;
          group.add(shield);
        }

        if (buildKey === 'stamina') {
          const halo = new THREE.Mesh(
            new THREE.TorusGeometry(0.72, 0.05, 10, 32),
            new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.2 })
          );
          halo.rotation.x = Math.PI / 2;
          halo.position.y = 0.41;
          group.add(halo);
        }

        if (buildKey === 'rubber') {
          const rubber = new THREE.Mesh(
            new THREE.TorusGeometry(0.82, 0.09, 12, 36),
            new THREE.MeshStandardMaterial({ color: accent, roughness: 0.85, metalness: 0.05, emissive: accent, emissiveIntensity: 0.12 })
          );
          rubber.rotation.x = Math.PI / 2;
          rubber.position.y = 0.26;
          group.add(rubber);
        }

        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(0.09, 0.24, 18),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.55, roughness: 0.35 })
        );
        tip.position.y = -0.02;
        tip.rotation.x = Math.PI;
        group.add(tip);

        const aura = new THREE.Mesh(
          new THREE.TorusGeometry(1.05, 0.03, 8, 48),
          new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.0 })
        );
        aura.rotation.x = Math.PI / 2;
        aura.position.y = 0.18;
        group.add(aura);

        scene.add(group);
        return { group, aura };
      }

      function buildController({ key, isPlayer, name, spawnX }) {
        const def = BUILD_DEFS[key];
        const meshPack = makeBeybladeMesh(def.color, def.accent, key);
        const rb = world.createRigidBody(
          RigidBodyDesc.dynamic()
            .setTranslation(spawnX, 0.22, 0)
            .setCanSleep(false)
            .lockTranslations()
        );
        world.createCollider(
          ColliderDesc.cylinder(0.18, 0.78)
            .setRestitution(0.92)
            .setFriction(0.06)
            .setMass(def.stats.weight * 1.25),
          rb
        );

        return {
          key,
          def,
          name,
          isPlayer,
          mesh: meshPack.group,
          aura: meshPack.aura,
          rb,
          radius: 0.78,
          spin: 0,
          spinDir: isPlayer ? 1 : -1,
          wobble: 0.02,
          special: 0,
          alive: true,
          guarding: 0,
          silentOrbit: 0,
          vampireDrain: 0,
          smashWindow: 0,
          boostCooldown: 0,
          lastImpact: 0,
          launchAngle: 0,
          launchPower: 0,
          score: 0,
        };
      }

      const state = {
        keys: new Set(),
        phase: 'aiming',
        roundOver: false,
        roundResolved: false,
        charge: 0,
        angle: 0,
        player: buildController({ key: selectedBuild, isPlayer: true, name: 'Player', spawnX: -4.9 }),
        cpu: buildController({ key: CPU_BUILD_ORDER[(roundScore.round - 1) % CPU_BUILD_ORDER.length], isPlayer: false, name: 'CPU', spawnX: 4.9 }),
        lastTime: performance.now(),
        hitStop: 0,
        cameraShake: 0,
        resetClock: 0,
        announcerPulse: 0,
        particles: [],
        launched: false,
      };

      setPlayerHud({ spin: 0, special: 0, build: state.player.key, specialName: state.player.def.specialName });
      setCpuHud({ spin: 0, special: 0, build: state.cpu.key, specialName: state.cpu.def.specialName });
      setStatus('Hold SPACE to charge. Aim with A / D. Release SPACE to launch.');

      const launchArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-4.9, 0.2, 0),
        2,
        0xffffff,
        0.5,
        0.26
      );
      scene.add(launchArrow);

      const clashFlash = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.45, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })
      );
      clashFlash.rotation.x = -Math.PI / 2;
      clashFlash.position.y = 0.08;
      scene.add(clashFlash);

      function ensureAudio() {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      }

      function beep({ freq = 220, duration = 0.07, type = 'square', gain = 0.02, slideTo = null }) {
        try {
          ensureAudio();
          const ctx = audioCtxRef.current;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
          osc.connect(g).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + duration + 0.02);
        } catch {}
      }

      function noiseBurst(gain = 0.035, duration = 0.05) {
        try {
          ensureAudio();
          const ctx = audioCtxRef.current;
          const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1400;
          const g = ctx.createGain();
          g.gain.value = gain;
          src.connect(filter).connect(g).connect(ctx.destination);
          src.start();
        } catch {}
      }

      function spawnImpact(pos, color = 0xf8fafc, count = 18, scale = 1) {
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 8, 8),
            new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? color : 0xfbbf24 })
          );
          m.position.copy(pos);
          scene.add(m);
          state.particles.push({
            mesh: m,
            vx: (Math.random() - 0.5) * 7 * scale,
            vz: (Math.random() - 0.5) * 7 * scale,
            vy: 0.5 + Math.random() * 2.2,
            life: 0.22 + Math.random() * 0.24,
          });
        }
      }

      function spawnAnimeArc(pos, color) {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.04, 10, 28, Math.PI * 1.25),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
        );
        arc.rotation.x = Math.PI / 2;
        arc.position.copy(pos);
        scene.add(arc);
        state.particles.push({ mesh: arc, vx: 0, vz: 0, vy: 0, life: 0.18, arc: true });
      }

      function syncMesh(blade) {
        const t = blade.rb.translation();
        blade.mesh.position.set(t.x, 0.02, t.z);
        blade.mesh.rotation.y += blade.spin * 0.032 * blade.spinDir;
        blade.mesh.rotation.x = Math.sin(performance.now() * 0.02 + t.x) * blade.wobble * 0.7;
        blade.mesh.rotation.z = Math.cos(performance.now() * 0.024 + t.z) * blade.wobble * 0.7;

        blade.aura.material.opacity = Math.min(0.65, blade.special / 100 * 0.5 + (blade.guarding > 0 || blade.silentOrbit > 0 || blade.vampireDrain > 0 || blade.smashWindow > 0 ? 0.2 : 0));
        blade.aura.scale.setScalar(1 + blade.special / 300 + blade.lastImpact * 0.08);
      }

      function updateArrow() {
        const dir = new THREE.Vector3(Math.cos(state.angle), 0, Math.sin(state.angle));
        launchArrow.position.set(-4.9, 0.2, 0);
        launchArrow.setDirection(dir);
        launchArrow.setLength(1.1 + state.charge * 2.5, 0.48, 0.26);
        const c = new THREE.Color().setHSL(0.58 - state.charge * 0.22, 0.95, 0.6);
        launchArrow.setColor(c);
      }

      function launchRound() {
        const p = state.player;
        const c = state.cpu;
        p.launchPower = 8 + state.charge * 11 * p.def.stats.speed;
        p.launchAngle = state.angle;
        c.launchPower = (10 + Math.random() * 4) * c.def.stats.speed;
        c.launchAngle = Math.PI + (Math.random() * 0.8 - 0.4);

        p.rb.setTranslation({ x: -4.9, y: 0.22, z: 0 }, true);
        c.rb.setTranslation({ x: 4.9, y: 0.22, z: 0 }, true);
        p.rb.setLinvel({ x: Math.cos(p.launchAngle) * p.launchPower, y: 0, z: Math.sin(p.launchAngle) * p.launchPower }, true);
        c.rb.setLinvel({ x: Math.cos(c.launchAngle) * c.launchPower, y: 0, z: Math.sin(c.launchAngle) * c.launchPower }, true);
        p.spin = 36 + state.charge * 34 * p.def.stats.stamina;
        c.spin = 40 + Math.random() * 24 * c.def.stats.stamina;
        p.special = 12;
        c.special = 12;
        p.wobble = 0.02;
        c.wobble = 0.02;
        state.phase = 'fighting';
        state.launched = true;
        launchArrow.visible = false;
        setStatus('Fight! WASD to drift, Shift to burst, E to stabilise, Q for special.');
        beep({ freq: 240, duration: 0.08, type: 'sawtooth', gain: 0.03, slideTo: 130 });
      }

      function burst(blade, powerScale = 1) {
        if (blade.boostCooldown > 0 || blade.spin < 7) return;
        const lv = blade.rb.linvel();
        const mag = Math.hypot(lv.x, lv.z) || 1;
        const boost = 4.5 * blade.def.stats.speed * powerScale;
        blade.rb.setLinvel({ x: lv.x + (lv.x / mag) * boost, y: 0, z: lv.z + (lv.z / mag) * boost }, true);
        blade.spin = Math.max(0, blade.spin - 2.6);
        blade.boostCooldown = 0.6;
        blade.lastImpact = 0.4;
        beep({ freq: 480, duration: 0.05, type: 'square', gain: 0.018, slideTo: 260 });
      }

      function stabilise(blade, dt) {
        if (blade.spin < 3) return;
        blade.spin = Math.max(0, blade.spin - 3.2 * dt);
        blade.wobble = Math.max(0.008, blade.wobble - 1.9 * dt);
        const lv = blade.rb.linvel();
        blade.rb.setLinvel({ x: lv.x * (1 - 0.8 * dt), y: 0, z: lv.z * (1 - 0.8 * dt) }, true);
      }

      function useSpecial(blade, enemy) {
        if (blade.special < 100) return;
        blade.special = 0;
        blade.lastImpact = 0.8;
        const accent = BUILD_DEFS[blade.key].accent;
        const pos = blade.rb.translation();
        spawnAnimeArc(new THREE.Vector3(pos.x, 0.18, pos.z), accent);

        if (blade.key === 'attack') {
          blade.smashWindow = 1.0;
          burst(blade, 1.8);
          setStatus(`${blade.name} used ${blade.def.specialName}!`);
          noiseBurst(0.05, 0.08);
        } else if (blade.key === 'defense') {
          blade.guarding = 1.8;
          blade.wobble *= 0.3;
          setStatus(`${blade.name} used ${blade.def.specialName}!`);
          beep({ freq: 180, duration: 0.12, type: 'triangle', gain: 0.03, slideTo: 120 });
        } else if (blade.key === 'stamina') {
          blade.silentOrbit = 2.4;
          blade.wobble *= 0.4;
          setStatus(`${blade.name} used ${blade.def.specialName}!`);
          beep({ freq: 620, duration: 0.14, type: 'sine', gain: 0.024, slideTo: 420 });
        } else if (blade.key === 'rubber') {
          blade.vampireDrain = 2.2;
          setStatus(`${blade.name} used ${blade.def.specialName}!`);
          beep({ freq: 300, duration: 0.12, type: 'square', gain: 0.028, slideTo: 190 });
        }
      }

      function processInput(dt) {
        if (state.phase === 'aiming') {
          if (state.keys.has('KeyA')) state.angle -= 1.9 * dt;
          if (state.keys.has('KeyD')) state.angle += 1.9 * dt;
          if (state.keys.has('Space')) state.charge = Math.min(1, state.charge + 0.6 * dt);
          updateArrow();
          return;
        }

        const p = state.player;
        if (!p.alive) return;
        const lv = p.rb.linvel();
        let addX = 0;
        let addZ = 0;
        const nudge = 7.6 * p.def.stats.grip;
        if (state.keys.has('KeyW')) addZ -= nudge * dt;
        if (state.keys.has('KeyS')) addZ += nudge * dt;
        if (state.keys.has('KeyA')) addX -= nudge * dt;
        if (state.keys.has('KeyD')) addX += nudge * dt;
        p.rb.setLinvel({ x: lv.x + addX, y: 0, z: lv.z + addZ }, true);

        if (state.keys.has('ShiftLeft') || state.keys.has('ShiftRight')) burst(p);
        if (state.keys.has('KeyE')) stabilise(p, dt);
      }

      function cpuBrain(dt) {
        if (state.phase !== 'fighting') return;
        const cpu = state.cpu;
        const player = state.player;
        if (!cpu.alive) return;

        const cp = cpu.rb.translation();
        const pp = player.rb.translation();
        const dx = pp.x - cp.x;
        const dz = pp.z - cp.z;
        const dist = Math.hypot(dx, dz) || 1;
        const lv = cpu.rb.linvel();

        const intent = cpu.key === 'attack' ? 1.4 : cpu.key === 'stamina' ? 0.85 : 1.05;
        cpu.rb.setLinvel({ x: lv.x + (dx / dist) * 2.9 * intent * dt, y: 0, z: lv.z + (dz / dist) * 2.9 * intent * dt }, true);

        if (dist < 2.4 && cpu.spin > 8 && cpu.boostCooldown <= 0 && Math.random() < 0.024) burst(cpu, cpu.key === 'attack' ? 1.2 : 1);
        if (cpu.spin < 8 && Math.random() < 0.04) stabilise(cpu, dt);
        if (cpu.special >= 100 && (dist < 3.6 || cpu.spin < player.spin) && Math.random() < 0.03) useSpecial(cpu, player);
      }

      function updateBlade(blade, enemy, dt) {
        if (!blade.alive) return;
        blade.boostCooldown = Math.max(0, blade.boostCooldown - dt);
        blade.guarding = Math.max(0, blade.guarding - dt);
        blade.silentOrbit = Math.max(0, blade.silentOrbit - dt);
        blade.vampireDrain = Math.max(0, blade.vampireDrain - dt);
        blade.smashWindow = Math.max(0, blade.smashWindow - dt);
        blade.lastImpact = Math.max(0, blade.lastImpact - dt * 2.6);

        const pos = blade.rb.translation();
        const lv = blade.rb.linvel();
        const speed = Math.hypot(lv.x, lv.z);

        const arenaDist = Math.hypot(pos.x, pos.z);
        if (arenaDist > 8.55) {
          blade.alive = false;
          blade.spin = 0;
          blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }

        let drain = 1.6 + speed * 0.13 + blade.wobble * 1.2;
        drain /= blade.def.stats.stamina;
        if (blade.silentOrbit > 0) drain *= 0.45;
        if (blade.guarding > 0) drain *= 0.82;
        blade.spin = Math.max(0, blade.spin - drain * dt);

        blade.special = Math.min(100, blade.special + (0.9 + speed * 0.06) * dt * 10);

        if (blade.spin < 7) blade.wobble = Math.min(0.45, blade.wobble + 0.3 * dt);
        else blade.wobble = Math.max(0.01, blade.wobble - 0.03 * dt);

        if (blade.spin <= 0.1) {
          blade.alive = false;
          blade.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }

        syncMesh(blade);
      }

      function clampVelocity(blade) {
        const lv = blade.rb.linvel();
        const cap = 18;
        const mag = Math.hypot(lv.x, lv.z);
        if (mag > cap) blade.rb.setLinvel({ x: (lv.x / mag) * cap, y: 0, z: (lv.z / mag) * cap }, true);
      }

      function resolveBladeCollision(a, b) {
        if (!a.alive || !b.alive) return;
        const pa = a.rb.translation();
        const pb = b.rb.translation();
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const dist = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (dist >= minDist || dist === 0) return;

        const nx = dx / dist;
        const nz = dz / dist;
        const lva = a.rb.linvel();
        const lvb = b.rb.linvel();
        const relV = (lvb.x - lva.x) * nx + (lvb.z - lva.z) * nz;
        const impact = Math.abs(relV) + Math.abs(a.spin - b.spin) * 0.055;

        const attackModA = a.def.stats.smash * (a.smashWindow > 0 ? 1.45 : 1);
        const attackModB = b.def.stats.smash * (b.smashWindow > 0 ? 1.45 : 1);
        const defenseA = a.def.stats.defense * (a.guarding > 0 ? 1.4 : 1);
        const defenseB = b.def.stats.defense * (b.guarding > 0 ? 1.4 : 1);

        const pushA = (1.2 + impact * 0.35) * (attackModB / defenseA);
        const pushB = (1.2 + impact * 0.35) * (attackModA / defenseB);

        a.rb.setLinvel({ x: lva.x - nx * pushA, y: 0, z: lva.z - nz * pushA }, true);
        b.rb.setLinvel({ x: lvb.x + nx * pushB, y: 0, z: lvb.z + nz * pushB }, true);
        clampVelocity(a);
        clampVelocity(b);

        let spinLossA = (0.7 + impact * 0.12) / defenseA;
        let spinLossB = (0.7 + impact * 0.12) / defenseB;
        if (a.silentOrbit > 0) spinLossA *= 0.6;
        if (b.silentOrbit > 0) spinLossB *= 0.6;

        a.spin = Math.max(0, a.spin - spinLossA);
        b.spin = Math.max(0, b.spin - spinLossB);

        if (a.vampireDrain > 0) {
          const steal = Math.min(1.25, spinLossB * 0.9);
          b.spin = Math.max(0, b.spin - steal);
          a.spin = Math.min(80, a.spin + steal * 0.75);
        }
        if (b.vampireDrain > 0) {
          const steal = Math.min(1.25, spinLossA * 0.9);
          a.spin = Math.max(0, a.spin - steal);
          b.spin = Math.min(80, b.spin + steal * 0.75);
        }

        a.special = Math.min(100, a.special + impact * 1.1);
        b.special = Math.min(100, b.special + impact * 1.1);
        a.wobble = Math.min(0.48, a.wobble + 0.02 + impact * 0.005 / defenseA);
        b.wobble = Math.min(0.48, b.wobble + 0.02 + impact * 0.005 / defenseB);

        state.cameraShake = Math.max(state.cameraShake, Math.min(0.4, impact * 0.015));
        state.hitStop = Math.max(state.hitStop, Math.min(0.055, impact * 0.002));
        clashFlash.material.opacity = Math.min(0.9, 0.25 + impact * 0.05);
        clashFlash.scale.setScalar(1 + impact * 0.06);
        clashFlash.position.set((pa.x + pb.x) / 2, 0.08, (pa.z + pb.z) / 2);
        spawnImpact(new THREE.Vector3((pa.x + pb.x) / 2, 0.2, (pa.z + pb.z) / 2), new THREE.Color(a.def.accent || BUILD_DEFS[a.key].accent).getHex(), impact > 10 ? 26 : 16, 1 + impact * 0.04);

        if (impact > 6.5) {
          setStatus('Clash!');
          noiseBurst(0.035 + Math.min(0.03, impact * 0.002), 0.06);
          beep({ freq: 180 + impact * 18, duration: 0.03, type: 'square', gain: 0.02, slideTo: 100 });
        }
      }

      function updateParticles(dt) {
        clashFlash.material.opacity = Math.max(0, clashFlash.material.opacity - dt * 6);
        clashFlash.scale.lerp(new THREE.Vector3(1, 1, 1), dt * 10);

        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.life -= dt;
          if (p.arc) {
            p.mesh.rotation.z += dt * 7;
            p.mesh.scale.multiplyScalar(1 + dt * 3);
            p.mesh.material.opacity = Math.max(0, p.life * 4);
          } else {
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.z += p.vz * dt;
            p.mesh.position.y += p.vy * dt;
            p.vy -= 8 * dt;
            p.mesh.scale.setScalar(Math.max(0.15, p.life * 2.4));
          }
          if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            state.particles.splice(i, 1);
          }
        }
      }

      function updateHud() {
        setPlayerHud({ spin: state.player.spin, special: state.player.special, build: state.player.key, specialName: state.player.def.specialName });
        setCpuHud({ spin: state.cpu.spin, special: state.cpu.special, build: state.cpu.key, specialName: state.cpu.def.specialName });
      }

      function resolveRound() {
        if (state.roundResolved) return;
        const pAlive = state.player.alive;
        const cAlive = state.cpu.alive;
        let winner = 'cpu';
        if (pAlive && !cAlive) winner = 'player';
        else if (!pAlive && cAlive) winner = 'cpu';
        else winner = state.player.spin >= state.cpu.spin ? 'player' : 'cpu';

        state.roundResolved = true;
        state.roundOver = true;
        state.phase = 'round_end';
        launchArrow.visible = false;

        const nextScore = { ...roundScore };
        nextScore[winner] += 1;
        const isMatchOver = nextScore.player >= 2 || nextScore.cpu >= 2;
        if (!isMatchOver) nextScore.round += 1;
        setRoundScore(nextScore);

        if (winner === 'player') {
          setStatus(isMatchOver ? 'You win the match! Back to build select shortly.' : 'Round win! Next round coming up...');
          beep({ freq: 660, duration: 0.15, type: 'sawtooth', gain: 0.03, slideTo: 920 });
        } else {
          setStatus(isMatchOver ? 'CPU wins the match. Back to build select shortly.' : 'Round lost. Next round coming up...');
          beep({ freq: 220, duration: 0.18, type: 'sawtooth', gain: 0.03, slideTo: 140 });
        }

        state.resetClock = isMatchOver ? 2.4 : 1.9;
        state.matchOver = isMatchOver;
      }

      function animate(now) {
        if (destroyed) return;
        let dt = Math.min(0.033, (now - state.lastTime) / 1000);
        state.lastTime = now;

        if (state.hitStop > 0) {
          state.hitStop -= dt;
          dt *= 0.08;
        }

        processInput(dt);
        cpuBrain(dt);

        if (state.phase === 'fighting' || state.phase === 'round_end') {
          world.step();
          resolveBladeCollision(state.player, state.cpu);
          updateBlade(state.player, state.cpu, dt);
          updateBlade(state.cpu, state.player, dt);

          if (!state.roundResolved && (!state.player.alive || !state.cpu.alive)) {
            resolveRound();
          }
        } else {
          syncMesh(state.player);
          syncMesh(state.cpu);
        }

        updateParticles(dt);
        updateHud();

        const shake = state.cameraShake;
        state.cameraShake = Math.max(0, state.cameraShake - dt * 1.8);
        camera.position.set(
          Math.sin(now * 0.03) * shake * 0.7,
          12.5 + Math.cos(now * 0.027) * shake * 0.4,
          11.5 + Math.sin(now * 0.035) * shake * 0.5
        );
        camera.lookAt(0, 0.1, 0);

        renderer.render(scene, camera);

        if (state.roundOver) {
          state.resetClock -= dt;
          if (state.resetClock <= 0) {
            if (state.matchOver) {
              setGamePhase('menu');
              setRoundScore({ player: 0, cpu: 0, round: 1 });
            } else {
              setGamePhase('battle');
            }
            destroyed = true;
            return;
          }
        }

        requestAnimationFrame(animate);
      }

      function onKeyDown(e) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        state.keys.add(e.code);
        if (e.code === 'KeyQ' && state.phase === 'fighting') {
          useSpecial(state.player, state.cpu);
        }
      }

      function onKeyUp(e) {
        state.keys.delete(e.code);
        if (e.code === 'Space' && state.phase === 'aiming') {
          launchRound();
          state.charge = 0;
        }
      }

      function onResize() {
        const mountEl = mountRef.current;
        if (!mountEl) return;
        camera.aspect = mountEl.clientWidth / mountEl.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mountEl.clientWidth, mountEl.clientHeight);
      }

      cleanupFns = [
        () => window.removeEventListener('keydown', onKeyDown),
        () => window.removeEventListener('keyup', onKeyUp),
        () => window.removeEventListener('resize', onResize),
        () => {
          renderer.dispose();
          mount.innerHTML = '';
        },
      ];

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('resize', onResize);
      updateArrow();
      requestAnimationFrame(animate);
    }

    boot();

    return () => {
      destroyed = true;
      cleanupFns.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
  }, [gamePhase, selectedBuild, roundScore.round]);

  return (
    <div className="w-full min-h-screen bg-[radial-gradient(circle_at_top,_#0f1f3b,_#050a14_55%)] text-white">
      <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
        <div className="rounded-[28px] border border-cyan-400/20 bg-slate-950/70 shadow-[0_0_60px_rgba(34,211,238,0.12)] backdrop-blur overflow-hidden">
          <div className="px-6 py-5 border-b border-cyan-400/15 bg-gradient-to-r from-cyan-500/10 via-sky-500/5 to-fuchsia-500/10">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">Anime Physics Vertical Slice</div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-1">BEYBLADE: Clash Circuit</h1>
                <p className="text-sm md:text-base text-slate-300 mt-2 max-w-3xl">
                  Proper rigidbody physics, build archetypes, best-of-3 rounds, specials, juice, and a more show-inspired anime presentation.
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-700">
                  Round <span className="font-black text-cyan-300">{roundScore.round}</span>
                </div>
                <div className="px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-700">
                  Score <span className="font-black text-emerald-300">{roundScore.player}</span>
                  <span className="mx-1 text-slate-500">-</span>
                  <span className="font-black text-rose-300">{roundScore.cpu}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr_320px] gap-4 p-4 md:p-5 min-h-[760px]">
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
              <div className="text-lg font-bold">Build Select</div>
              <div className="text-sm text-slate-400 mt-1">Pick your blade archetype. Each one has a different special and physics profile.</div>
              <div className="mt-4 space-y-3">
                {buildEntries.map((build) => {
                  const active = selectedBuild === build.key;
                  return (
                    <button
                      key={build.key}
                      onClick={() => setSelectedBuild(build.key)}
                      className={`w-full text-left rounded-[22px] border p-4 transition ${active ? 'border-cyan-300 bg-cyan-400/10 shadow-[0_0_30px_rgba(34,211,238,0.12)]' : 'border-slate-700 bg-slate-950/60 hover:border-slate-500'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded-full shadow-lg" style={{ background: build.color }} />
                          <div className="font-bold text-white">{build.name}</div>
                        </div>
                        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{build.specialName}</div>
                      </div>
                      <div className="text-sm text-slate-300 mt-2">{build.description}</div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-300">
                        <div className="rounded-xl bg-slate-900/90 px-2 py-2 border border-slate-700">Speed {build.stats.speed.toFixed(2)}</div>
                        <div className="rounded-xl bg-slate-900/90 px-2 py-2 border border-slate-700">Weight {build.stats.weight.toFixed(2)}</div>
                        <div className="rounded-xl bg-slate-900/90 px-2 py-2 border border-slate-700">Stamina {build.stats.stamina.toFixed(2)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  setRoundScore({ player: 0, cpu: 0, round: 1 });
                  setGamePhase('battle');
                }}
                className="mt-5 w-full rounded-[22px] bg-gradient-to-r from-cyan-400 via-sky-400 to-fuchsia-500 px-5 py-4 text-slate-950 font-black text-lg shadow-[0_12px_40px_rgba(56,189,248,0.35)] hover:scale-[1.01] transition"
              >
                Launch Match
              </button>

              <div className="mt-5 rounded-[22px] border border-slate-700 bg-slate-950/60 p-4">
                <div className="font-semibold text-cyan-300">Controls</div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div><span className="font-mono text-cyan-300">SPACE</span> charge and launch</div>
                  <div><span className="font-mono text-cyan-300">A / D</span> aim before launch</div>
                  <div><span className="font-mono text-cyan-300">W A S D</span> drift during combat</div>
                  <div><span className="font-mono text-cyan-300">Shift</span> burst dash</div>
                  <div><span className="font-mono text-cyan-300">E</span> stabilise and reduce wobble</div>
                  <div><span className="font-mono text-cyan-300">Q</span> use signature special at full meter</div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-800 bg-slate-950/70 overflow-hidden relative shadow-[0_10px_80px_rgba(0,0,0,0.45)] min-h-[640px]">
              {gamePhase === 'battle' ? (
                <>
                  <div ref={mountRef} className="absolute inset-0" />
                  <div className="absolute left-4 right-4 bottom-4 rounded-[22px] border border-cyan-300/20 bg-slate-950/72 backdrop-blur px-4 py-3 shadow-xl">
                    <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/80">Arena Status</div>
                    <div className="mt-1 text-sm md:text-base text-white font-medium">{status}</div>
                  </div>
                  <div className="absolute inset-x-0 top-4 flex items-start justify-center pointer-events-none">
                    <div className="rounded-full bg-slate-950/70 border border-fuchsia-400/20 px-5 py-2 shadow-lg text-sm font-bold tracking-[0.25em] uppercase text-fuchsia-200">
                      Best of 3
                    </div>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(34,211,238,0.08),_transparent_60%)] p-8">
                  <div className="max-w-xl text-center">
                    <div className="text-xs uppercase tracking-[0.4em] text-cyan-300/80">Ready Room</div>
                    <h2 className="text-4xl md:text-5xl font-black mt-3">Choose Your Bey</h2>
                    <p className="text-slate-300 mt-4 text-base md:text-lg">
                      This version upgrades the MVP with Rapier rigidbodies, archetype builds, specials, best-of-3 structure, and a brighter anime broadcast feel.
                    </p>
                    <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-cyan-300/25 bg-slate-950/60 px-5 py-3 text-sm text-cyan-100">
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-300 animate-pulse" />
                      {BUILD_DEFS[selectedBuild].name} selected
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-2xl flex flex-col gap-4">
              <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-emerald-300/80">Player</div>
                    <div className="text-xl font-black mt-1">{BUILD_DEFS[playerHud.build].name}</div>
                  </div>
                  <div className="w-4 h-4 rounded-full" style={{ background: BUILD_DEFS[playerHud.build].color }} />
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-300 mb-1"><span>Spin</span><span>{playerHud.spin.toFixed(0)}</span></div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300" style={{ width: `${Math.max(0, Math.min(100, playerHud.spin))}%` }} /></div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-300 mb-1"><span>Special</span><span>{playerHud.special.toFixed(0)}%</span></div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300" style={{ width: `${playerHud.special}%` }} /></div>
                </div>
                <div className="mt-3 text-sm text-slate-300"><span className="text-cyan-300 font-semibold">Signature:</span> {playerHud.specialName}</div>
              </div>

              <div className="rounded-[22px] border border-rose-400/20 bg-rose-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-rose-300/80">CPU</div>
                    <div className="text-xl font-black mt-1">{BUILD_DEFS[cpuHud.build].name}</div>
                  </div>
                  <div className="w-4 h-4 rounded-full" style={{ background: BUILD_DEFS[cpuHud.build].color }} />
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-300 mb-1"><span>Spin</span><span>{cpuHud.spin.toFixed(0)}</span></div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-rose-300 to-orange-300" style={{ width: `${Math.max(0, Math.min(100, cpuHud.spin))}%` }} /></div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-300 mb-1"><span>Special</span><span>{cpuHud.special.toFixed(0)}%</span></div>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-rose-300" style={{ width: `${cpuHud.special}%` }} /></div>
                </div>
                <div className="mt-3 text-sm text-slate-300"><span className="text-rose-300 font-semibold">Signature:</span> {cpuHud.specialName}</div>
              </div>

              <div className="rounded-[22px] border border-slate-700 bg-slate-950/65 p-4">
                <div className="font-semibold text-cyan-300">What changed from the MVP</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-300 list-disc list-inside">
                  <li>Rapier rigidbody collisions replace the fake positional physics.</li>
                  <li>Attack, Defense, Stamina, and Rubber/Spin-Steal builds.</li>
                  <li>Best-of-3 match flow with round score tracking.</li>
                  <li>Signature specials tied to a spin/combat meter.</li>
                  <li>Camera shake, hit-stop, sparks, flash rings, and synth audio.</li>
                  <li>More anime-styled blade silhouettes and arena presentation.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
