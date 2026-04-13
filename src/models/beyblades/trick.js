import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createTrickBlade(primary, accent) {
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

  const shellMat = ctx.toon(ctx.primaryColor.clone().offsetHSL(0, 0.02, -0.06), primary, 0.12)
  const bladeMat = ctx.toon(ctx.primaryColor, primary, 0.2)
  const accentMat = ctx.toon(0xf5ffaf, accent, 0.24)
  const tipMat = ctx.toon(0x9ffcff, accent, 0.3)

  const mainBody = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.84, 0.16, 24), shellMat)
  mainBody.position.y = 0.49
  mainBody.rotation.y = Math.PI / 8
  ctx.addOutlined(mainBody, 1.05)

  const topShell = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 16), bladeMat)
  topShell.scale.set(0.96, 0.14, 0.96)
  topShell.position.y = 0.56
  ctx.addOutlined(topShell, 1.05)

  const splitRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.74, 0.1, 10, 36),
    shellMat
  )
  splitRing.rotation.x = Math.PI / 2
  splitRing.position.y = 0.5
  ctx.group.add(splitRing)

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2

    const wingShape = new THREE.Shape()
    wingShape.absarc(0, 0, 1.05, -0.34, 0.5, false)
    wingShape.absarc(0, 0, 0.62, 0.48, -0.28, true)
    wingShape.closePath()

    const wing = makeFlatShapeMesh(wingShape, 0.075, bladeMat)
    wing.position.set(Math.cos(angle + 0.08) * 0.13, 0.505, Math.sin(angle + 0.08) * 0.13)
    wing.rotation.y = angle - 0.08
    ctx.addOutlined(wing, 1.08)

    const edgeShape = new THREE.Shape()
    edgeShape.absarc(0, 0, 0.98, 0.02, 0.42, false)
    edgeShape.absarc(0, 0, 0.76, 0.4, 0.06, true)
    edgeShape.closePath()

    const edge = makeFlatShapeMesh(edgeShape, 0.038, accentMat)
    edge.position.set(Math.cos(angle + 0.11) * 0.13, 0.535, Math.sin(angle + 0.11) * 0.13)
    edge.rotation.y = angle - 0.08
    ctx.addOutlined(edge, 1.08)

    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.12), tipMat)
    tip.position.set(Math.cos(angle) * 0.51, 0.51, Math.sin(angle) * 0.51)
    tip.rotation.y = -angle
    ctx.addOutlined(tip, 1.08)
  }

  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + Math.PI / 3
    const innerFin = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.1), accentMat)
    innerFin.position.set(Math.cos(angle) * 0.34, 0.58, Math.sin(angle) * 0.34)
    innerFin.rotation.y = angle
    ctx.addOutlined(innerFin, 1.07)
  }

  const crest = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.07, 6), accentMat)
  crest.position.y = 0.575
  crest.rotation.y = Math.PI / 6
  ctx.addOutlined(crest, 1.08)

  addBitChip(ctx, { gemColor: 0xbffff8, housingColor: 0xf6ffb5 })
  return finishBlade(ctx)
}