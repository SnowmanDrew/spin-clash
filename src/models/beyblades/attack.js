import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createAttackBlade(primary, accent) {
  const ctx = createBladeContext(primary, accent)
  addSharedBase(ctx)

  const wingMat = ctx.toon(ctx.primaryColor, primary, 0.22)
  const flareMat = ctx.toon(0xfff3d0, accent, 0.55)
  const goldMat = ctx.toon(0xf8c74a, 0xf59e0b, 0.25)
  const darkGoldMat = ctx.toon(0xd79632, 0xf59e0b, 0.12)

  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * Math.PI * 2

    const arcWing = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.055, 8, 28, Math.PI * 0.56),
      wingMat
    )
    arcWing.rotation.x = Math.PI / 2
    arcWing.rotation.z = Math.PI / 2
    arcWing.rotation.y = a + 0.36
    arcWing.position.y = 0.48
    ctx.addOutlined(arcWing, 1.06)

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.22), wingMat)
    wing.position.set(Math.cos(a + 0.34) * 0.58, 0.48, Math.sin(a + 0.34) * 0.58)
    wing.rotation.y = a + 0.34
    wing.castShadow = true
    ctx.addOutlined(wing, 1.08)

    const upperWing = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.14), flareMat)
    upperWing.position.set(Math.cos(a + 0.48) * 0.67, 0.58, Math.sin(a + 0.48) * 0.67)
    upperWing.rotation.y = a + 0.48
    upperWing.rotation.z = 0.14
    ctx.addOutlined(upperWing, 1.10)

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.34, 6), goldMat)
    beak.position.set(Math.cos(a + 0.30) * 0.98, 0.46, Math.sin(a + 0.30) * 0.98)
    beak.rotation.z = -Math.PI / 2
    beak.rotation.y = a + 0.30
    ctx.addOutlined(beak, 1.12)
  }

  for (let i = 0; i < 2; i++) {
    const a = (i / 2) * Math.PI * 2 + Math.PI / 2
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.14), flareMat)
    tail.position.set(Math.cos(a - 0.24) * 0.64, 0.45, Math.sin(a - 0.24) * 0.64)
    tail.rotation.y = a - 0.22
    ctx.addOutlined(tail, 1.08)
  }

  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.26, 3), darkGoldMat)
  crest.position.y = 0.67
  crest.rotation.z = Math.PI
  crest.rotation.y = Math.PI / 4
  ctx.addOutlined(crest, 1.10)

  const chestPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.29, 0.08, 8), goldMat)
  chestPlate.position.y = 0.58
  chestPlate.rotation.y = Math.PI / 8
  ctx.addOutlined(chestPlate, 1.08)

  const fireCrown = new THREE.Mesh(
    new THREE.TorusGeometry(0.80, 0.045, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xffefc2, emissive: accent, emissiveIntensity: 1.0, roughness: 0.14, metalness: 0.08 })
  )
  fireCrown.rotation.x = Math.PI / 2
  fireCrown.position.y = 0.48
  ctx.group.add(fireCrown)

  const upperCrown = new THREE.Mesh(
    new THREE.TorusGeometry(0.60, 0.03, 8, 28, Math.PI * 1.8),
    flareMat
  )
  upperCrown.rotation.x = Math.PI / 2
  upperCrown.rotation.y = Math.PI / 8
  upperCrown.position.y = 0.56
  ctx.group.add(upperCrown)

  addBitChip(ctx, { gemColor: 0xffde59 })
  return finishBlade(ctx)
}