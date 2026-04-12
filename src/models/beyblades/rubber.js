import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createRubberBlade(primary, accent) {
  const ctx = createBladeContext(primary, accent)
  addSharedBase(ctx)

  const coreMat = ctx.toon(ctx.primaryColor, primary, 0.10)
  const rubberMat = ctx.toon(accent, accent, 0.18)

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.56, 0.18, 32), coreMat)
  core.position.y = 0.44
  ctx.addOutlined(core, 1.04)

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.10, 0.16), coreMat)
    arm.position.set(Math.cos(a) * 0.74, 0.44, Math.sin(a) * 0.74)
    arm.rotation.y = a
    ctx.group.add(arm)
  }

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.20, 12), rubberMat)
    bumper.position.set(Math.cos(a) * 0.86, 0.44, Math.sin(a) * 0.86)
    ctx.addOutlined(bumper, 1.14)
  }

  const contactRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.05, 10, 36),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.6, roughness: 0.38, metalness: 0.03 })
  )
  contactRing.rotation.x = Math.PI / 2
  contactRing.position.y = 0.44
  ctx.group.add(contactRing)

  addBitChip(ctx, { gemColor: 0xff8ea1 })
  return finishBlade(ctx)
}