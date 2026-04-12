import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createAttackBlade(primary, accent) {
  const ctx = createBladeContext(primary, accent)
  addSharedBase(ctx)

  const makeFlatShapeMesh = (shape, depth, material) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      curveSegments: 24,
    })
    geometry.center()
    geometry.rotateX(Math.PI / 2)
    return new THREE.Mesh(geometry, material)
  }

  const shellMat = ctx.toon(ctx.primaryColor.clone().offsetHSL(0, 0.03, -0.08), primary, 0.16)
  const wingMat = ctx.toon(ctx.primaryColor, primary, 0.24)
  const lightWingMat = ctx.toon(0xffa13a, 0xf97316, 0.34)
  const goldMat = ctx.toon(0xf8c74a, 0xf59e0b, 0.22)
  const darkGoldMat = ctx.toon(0xd79632, 0xf59e0b, 0.12)

  const coreBody = new THREE.Mesh(new THREE.CylinderGeometry(0.80, 0.92, 0.14, 24), shellMat)
  coreBody.position.y = 0.50
  coreBody.rotation.y = Math.PI / 4
  ctx.addOutlined(coreBody, 1.05)

  const upperShell = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 16), wingMat)
  upperShell.scale.set(0.92, 0.11, 0.92)
  upperShell.position.y = 0.53
  ctx.addOutlined(upperShell, 1.05)

  const bodyRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.09, 8, 36),
    shellMat
  )
  bodyRing.rotation.x = Math.PI / 2
  bodyRing.position.y = 0.50
  ctx.group.add(bodyRing)

  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI

    const hookShape = new THREE.Shape()
    hookShape.absarc(0, 0, 1.16, -0.30, 0.72, false)
    hookShape.absarc(0, 0, 0.36, 0.70, -0.14, true)
    hookShape.closePath()

    const rearCut = new THREE.Path()
    rearCut.moveTo(-0.18, 0.30)
    rearCut.lineTo(0.14, 0.18)
    rearCut.lineTo(0.10, 0.48)
    rearCut.closePath()
    hookShape.holes.push(rearCut)

    const hookWing = makeFlatShapeMesh(hookShape, 0.07, wingMat)
    hookWing.position.set(Math.cos(a + 0.15) * 0.16, 0.505, Math.sin(a + 0.15) * 0.16)
    hookWing.rotation.y = a - 0.12
    ctx.addOutlined(hookWing, 1.08)

    const leadingShape = new THREE.Shape()
    leadingShape.absarc(0, 0, 1.08, -0.01, 0.66, false)
    leadingShape.absarc(0, 0, 0.78, 0.63, 0.02, true)
    leadingShape.closePath()

    const leadingEdge = makeFlatShapeMesh(leadingShape, 0.036, lightWingMat)
    leadingEdge.position.set(Math.cos(a + 0.17) * 0.15, 0.529, Math.sin(a + 0.17) * 0.15)
    leadingEdge.rotation.y = a - 0.12
    ctx.addOutlined(leadingEdge, 1.08)

    const beakShape = new THREE.Shape()
    beakShape.moveTo(-0.12, -0.06)
    beakShape.lineTo(0.18, -0.04)
    beakShape.lineTo(0.40, 0)
    beakShape.lineTo(0.18, 0.04)
    beakShape.lineTo(-0.12, 0.06)
    beakShape.closePath()

    const beakRoot = makeFlatShapeMesh(beakShape, 0.05, lightWingMat)
    beakRoot.position.set(Math.cos(a + 0.29) * 0.98, 0.507, Math.sin(a + 0.29) * 0.98)
    beakRoot.rotation.y = a + 0.30
    ctx.addOutlined(beakRoot, 1.08)

    const rimPoint = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.26, 5), goldMat)
    rimPoint.position.set(Math.cos(a + 0.31) * 1.08, 0.507, Math.sin(a + 0.31) * 1.08)
    rimPoint.rotation.z = -Math.PI / 2
    rimPoint.rotation.y = a + 0.31
    ctx.addOutlined(rimPoint, 1.10)

    const rimPointCap = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.10, 5), darkGoldMat)
    rimPointCap.position.set(Math.cos(a + 0.31) * 1.24, 0.507, Math.sin(a + 0.31) * 1.24)
    rimPointCap.rotation.z = -Math.PI / 2
    rimPointCap.rotation.y = a + 0.31
    ctx.addOutlined(rimPointCap, 1.08)
  }

  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI + Math.PI / 2
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.10), lightWingMat)
    tail.position.set(Math.cos(a) * 0.38, 0.49, Math.sin(a) * 0.38)
    tail.rotation.y = a
    ctx.addOutlined(tail, 1.07)
  }

  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 3), darkGoldMat)
  crest.scale.set(0.8, 0.7, 0.8)
  crest.position.y = 0.585
  crest.rotation.z = Math.PI
  crest.rotation.y = Math.PI / 4
  ctx.addOutlined(crest, 1.10)

  const chestPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.06, 8), goldMat)
  chestPlate.position.y = 0.525
  chestPlate.rotation.y = Math.PI / 8
  ctx.addOutlined(chestPlate, 1.08)

  const fireCrown = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.055, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xff9b2f, emissive: 0xf97316, emissiveIntensity: 0.75, roughness: 0.18, metalness: 0.06 })
  )
  fireCrown.rotation.x = Math.PI / 2
  fireCrown.position.y = 0.505
  ctx.group.add(fireCrown)

  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI
    const crownFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.08), lightWingMat)
    crownFin.position.set(Math.cos(a) * 0.26, 0.56, Math.sin(a) * 0.26)
    crownFin.rotation.y = a
    crownFin.rotation.z = 0.04
    ctx.addOutlined(crownFin, 1.08)
  }

  addBitChip(ctx, { gemColor: 0xffde59 })
  return finishBlade(ctx)
}