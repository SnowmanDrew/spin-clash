import * as THREE from 'three'

export function createBladeContext(primary, accent) {
  const group = new THREE.Group()
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

  function addOutlined(mesh, scale = 1.08) {
    const outline = new THREE.Mesh(
      mesh.geometry,
      new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide })
    )
    outline.scale.setScalar(scale)
    mesh.add(outline)
    group.add(mesh)
    return mesh
  }

  return {
    group,
    primary,
    accent,
    primaryColor: new THREE.Color(primary),
    accentColor: new THREE.Color(accent),
    toon,
    addOutlined,
  }
}

export function addSharedBase(ctx) {
  const shadowDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.98, 0.98, 0.03, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
  )
  shadowDisc.position.y = -0.20
  ctx.group.add(shadowDisc)

  const spinTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.28, 10),
    ctx.toon(0xd0dce8)
  )
  spinTip.rotation.x = Math.PI
  spinTip.position.y = 0.05
  ctx.addOutlined(spinTip, 1.12)

  const gearHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.24, 0.30, 20),
    ctx.toon(0x5e6b76)
  )
  gearHousing.position.y = 0.27
  ctx.addOutlined(gearHousing, 1.06)

  const gearRidge = new THREE.Mesh(
    new THREE.TorusGeometry(0.40, 0.035, 6, 28),
    ctx.toon(0x7c8e99)
  )
  gearRidge.rotation.x = Math.PI / 2
  gearRidge.position.y = 0.16
  ctx.group.add(gearRidge)

  const supportColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.18, 0.16, 18),
    ctx.toon(0x7b8792)
  )
  supportColumn.position.y = 0.38
  ctx.addOutlined(supportColumn, 1.05)

  const weightDisk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.84, 0.77, 0.13, 40),
    ctx.toon(0x9daab5)
  )
  weightDisk.position.y = 0.38
  weightDisk.castShadow = true
  ctx.addOutlined(weightDisk, 1.03)

  const weightInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.47, 0.42, 0.18, 30),
    ctx.toon(0xb8c4cc)
  )
  weightInner.position.y = 0.40
  ctx.group.add(weightInner)

  const lockRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.04, 8, 36),
    ctx.toon(ctx.primaryColor.clone().offsetHSL(0, 0.02, -0.04))
  )
  lockRing.rotation.x = Math.PI / 2
  lockRing.position.y = 0.47
  ctx.group.add(lockRing)
}

export function addBitChip(ctx, options = {}) {
  const housingColor = options.housingColor || ctx.primaryColor.clone().offsetHSL(0, 0.05, -0.10)
  const bitHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.30, 0.18, 6),
    ctx.toon(housingColor)
  )
  bitHousing.position.y = options.housingY ?? 0.57
  bitHousing.castShadow = true
  ctx.addOutlined(bitHousing, 1.08)

  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.028, 6, 24),
    ctx.toon(0xe8eef4)
  )
  bezel.rotation.x = Math.PI / 2
  bezel.position.y = (options.housingY ?? 0.57) + 0.05
  ctx.group.add(bezel)

  const gem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 0.10, 6),
    ctx.toon(options.gemColor || ctx.accent, options.gemColor || ctx.accent, 2.6)
  )
  gem.position.y = options.gemY ?? 0.68
  ctx.group.add(gem)
}

export function finishBlade(ctx) {
  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(1.10, 0.03, 8, 52),
    new THREE.MeshBasicMaterial({ color: ctx.accent, transparent: true, opacity: 0.0 })
  )
  aura.rotation.x = Math.PI / 2
  aura.position.y = 0.26
  ctx.group.add(aura)
  return { group: ctx.group, aura }
}