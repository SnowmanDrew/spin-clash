import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createStaminaBlade(primary, accent) {
  const ctx = createBladeContext(primary, accent)
  addSharedBase(ctx)

  const bladeMat = ctx.toon(ctx.primaryColor, primary, 0.18)
  const capMat = ctx.toon(accent, accent, 0.72)
  const silverMat = ctx.toon(0xdce6ee)
  const hornMat = ctx.toon(0xf2f7ff)

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2

    const arcBlade = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.045, 8, 26, Math.PI * 0.60),
      bladeMat
    )
    arcBlade.rotation.x = Math.PI / 2
    arcBlade.rotation.z = Math.PI / 2
    arcBlade.rotation.y = a - 0.06
    arcBlade.position.y = 0.48
    ctx.addOutlined(arcBlade, 1.06)

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.10, 0.18), bladeMat)
    blade.position.set(Math.cos(a - 0.12) * 0.56, 0.47, Math.sin(a - 0.12) * 0.56)
    blade.rotation.y = a - 0.12
    ctx.addOutlined(blade, 1.08)

    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.10), silverMat)
    trim.position.set(Math.cos(a - 0.02) * 0.68, 0.56, Math.sin(a - 0.02) * 0.68)
    trim.rotation.y = a - 0.02
    ctx.group.add(trim)

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.24, 6), capMat)
    cap.position.set(Math.cos(a + 0.10) * 0.94, 0.47, Math.sin(a + 0.10) * 0.94)
    cap.rotation.z = -Math.PI / 2
    cap.rotation.y = a + 0.10
    ctx.group.add(cap)

    const horn = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.08), hornMat)
    horn.position.set(Math.cos(a + 0.16) * 0.80, 0.61, Math.sin(a + 0.16) * 0.80)
    horn.rotation.y = a + 0.36
    ctx.addOutlined(horn, 1.06)
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.038, 8, 48),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.6, roughness: 0.08, metalness: 0.08 })
  )
  halo.rotation.x = Math.PI / 2
  halo.position.y = 0.50
  ctx.group.add(halo)

  const dragonRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.028, 8, 30, Math.PI * 1.55),
    hornMat
  )
  dragonRing.rotation.x = Math.PI / 2
  dragonRing.rotation.y = Math.PI / 5
  dragonRing.position.y = 0.57
  ctx.group.add(dragonRing)

  addBitChip(ctx, { gemColor: 0xd6f1ff })
  return finishBlade(ctx)
}