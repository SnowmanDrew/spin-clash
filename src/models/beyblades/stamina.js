import * as THREE from 'three'
import { addBitChip, addSharedBase, createBladeContext, finishBlade } from './shared.js'

export function createStaminaBlade(primary, accent) {
  const ctx = createBladeContext(primary, accent)
  addSharedBase(ctx)

  const bladeMat = ctx.toon(ctx.primaryColor, primary, 0.18)
  const capMat = ctx.toon(accent, accent, 0.72)
  const silverMat = ctx.toon(0xdce6ee)
  const hornMat = ctx.toon(0xf2f7ff)
  const bodyMat = ctx.toon(ctx.primaryColor.clone().offsetHSL(0, 0.02, -0.06), primary, 0.14)
  const whiteMat = ctx.toon(0xf7fbff)

  const mainBody = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.86, 0.20, 24), bodyMat)
  mainBody.position.y = 0.49
  mainBody.rotation.y = Math.PI / 6
  ctx.addOutlined(mainBody, 1.05)

  const topCap = new THREE.Mesh(new THREE.SphereGeometry(0.50, 20, 16), bladeMat)
  topCap.scale.set(1.0, 0.18, 1.0)
  topCap.position.y = 0.55
  ctx.addOutlined(topCap, 1.05)

  const flowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.12, 10, 40),
    bodyMat
  )
  flowRing.rotation.x = Math.PI / 2
  flowRing.position.y = 0.49
  ctx.group.add(flowRing)

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2

    const lobe = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.54, 4, 8), bladeMat)
    lobe.position.set(Math.cos(a) * 0.52, 0.49, Math.sin(a) * 0.52)
    lobe.rotation.z = Math.PI / 2
    lobe.rotation.y = a
    ctx.addOutlined(lobe, 1.06)

    const lobeBody = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.24), bladeMat)
    lobeBody.position.set(Math.cos(a) * 0.42, 0.49, Math.sin(a) * 0.42)
    lobeBody.rotation.y = a
    lobeBody.rotation.z = 0.02
    ctx.addOutlined(lobeBody, 1.08)

    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.10, 0.24), bodyMat)
    shoulder.position.set(Math.cos(a) * 0.20, 0.50, Math.sin(a) * 0.20)
    shoulder.rotation.y = a
    ctx.addOutlined(shoulder, 1.05)

    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.10), silverMat)
    trim.position.set(Math.cos(a) * 0.56, 0.56, Math.sin(a) * 0.56)
    trim.rotation.y = a
    ctx.group.add(trim)

    const edgeHighlight = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.08), whiteMat)
    edgeHighlight.position.set(Math.cos(a) * 0.64, 0.585, Math.sin(a) * 0.64)
    edgeHighlight.rotation.y = a
    ctx.group.add(edgeHighlight)

    const topHighlight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.07), whiteMat)
    topHighlight.position.set(Math.cos(a) * 0.42, 0.61, Math.sin(a) * 0.42)
    topHighlight.rotation.y = a
    ctx.group.add(topHighlight)

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), capMat)
    cap.position.set(Math.cos(a) * 0.84, 0.49, Math.sin(a) * 0.84)
    cap.rotation.z = -Math.PI / 2
    cap.rotation.y = a
    ctx.group.add(cap)
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.06, 8, 48),
    new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 1.6, roughness: 0.08, metalness: 0.08 })
  )
  halo.rotation.x = Math.PI / 2
  halo.position.y = 0.51
  ctx.group.add(halo)

  addBitChip(ctx, { gemColor: 0xd6f1ff })
  return finishBlade(ctx)
}