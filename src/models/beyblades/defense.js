import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createDefenseBlade(primary, accent) {
  const ctx = createBladeContext(primary, accent)
  addSharedBase(ctx)

  const shellMat = ctx.toon(ctx.primaryColor.clone().offsetHSL(0, 0.02, -0.04), primary, 0.08)
  const armorMat = ctx.toon(0xb9c7d1)
  const accentMat = ctx.toon(accent, accent, 0.28)
  const paleMat = ctx.toon(0xeaf9ef)

  const shellDome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), shellMat)
  shellDome.scale.set(1.0, 0.52, 1.0)
  shellDome.position.y = 0.61
  ctx.addOutlined(shellDome, 1.06)

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.18, 0.42), shellMat)
    shield.position.set(Math.cos(a) * 0.62, 0.46, Math.sin(a) * 0.62)
    shield.rotation.y = a
    ctx.addOutlined(shield, 1.05)

    const shellCap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.24), accentMat)
    shellCap.position.set(Math.cos(a) * 0.58, 0.58, Math.sin(a) * 0.58)
    shellCap.rotation.y = a
    ctx.addOutlined(shellCap, 1.08)
  }

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const turtleLeg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.18), armorMat)
    turtleLeg.position.set(Math.cos(a) * 0.90, 0.43, Math.sin(a) * 0.90)
    turtleLeg.rotation.y = a
    ctx.addOutlined(turtleLeg, 1.06)
  }

  const shellHead = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.18), paleMat)
  shellHead.position.set(0, 0.55, 0.94)
  ctx.addOutlined(shellHead, 1.06)

  const shellTail = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.22, 4), paleMat)
  shellTail.position.set(0, 0.52, -0.92)
  shellTail.rotation.x = Math.PI / 2
  shellTail.rotation.z = Math.PI
  ctx.addOutlined(shellTail, 1.08)

  const armorRing = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.14, 12, 36), armorMat)
  armorRing.rotation.x = Math.PI / 2
  armorRing.position.y = 0.49
  ctx.group.add(armorRing)

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.14, 8), accentMat)
    tower.position.set(Math.cos(a) * 0.74, 0.60, Math.sin(a) * 0.74)
    ctx.group.add(tower)
  }

  addBitChip(ctx, { gemColor: 0xcaf7d8 })
  return finishBlade(ctx)
}