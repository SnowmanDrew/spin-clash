import { BUILD_DEFS } from './buildDefs.js'

export const DISC_DEFS = {
  assault: {
    key: 'assault',
    name: 'Assault Disc',
    shortName: 'Assault',
    description: 'Forward-heavy metal that makes head-on hits nastier, but gives up some stability.',
    statMods: { speed: 0.02, weight: 0.16, stamina: -0.08, grip: -0.03, smash: 0.14, defense: -0.05 },
    physics: {
      collisionPushScale: 1.12,
      collisionSpinLossScale: 1.04,
      ringOutResist: 0.95,
      passiveDrainMultiplier: 1.03,
      wobbleGainMultiplier: 1.08,
      launchPowerScale: 1.04,
    },
  },
  fortress: {
    key: 'fortress',
    name: 'Fortress Disc',
    shortName: 'Fortress',
    description: 'A dense stabilizer disc that soaks recoil and keeps the blade planted in ugly exchanges.',
    statMods: { speed: -0.07, weight: 0.22, stamina: 0.02, grip: 0.06, smash: -0.04, defense: 0.18 },
    physics: {
      collisionPushScale: 0.93,
      collisionSpinLossScale: 0.94,
      ringOutResist: 1.18,
      passiveDrainMultiplier: 0.97,
      wobbleGainMultiplier: 0.84,
      launchPowerScale: 0.96,
      launchStability: 1.08,
    },
  },
  glide: {
    key: 'glide',
    name: 'Glide Disc',
    shortName: 'Glide',
    description: 'A low-drag disc that preserves spin and smooths movement at the cost of raw impact.',
    statMods: { speed: 0.08, weight: -0.08, stamina: 0.18, grip: 0.02, smash: -0.05, defense: -0.02 },
    physics: {
      collisionPushScale: 0.9,
      collisionSpinLossScale: 0.9,
      ringOutResist: 0.97,
      passiveDrainMultiplier: 0.88,
      wobbleGainMultiplier: 0.9,
      launchPowerScale: 1.01,
      launchStability: 1.04,
    },
  },
}

export const DRIVER_DEFS = {
  rush: {
    key: 'rush',
    name: 'Rush Driver',
    shortName: 'Rush',
    description: 'A sharp, fast driver that spikes launch speed and burst threat, but burns energy faster.',
    statMods: { speed: 0.18, weight: -0.02, stamina: -0.12, grip: -0.02, smash: 0.08, defense: -0.04 },
    physics: {
      launchPowerScale: 1.12,
      launchSpinScale: 1.06,
      launchStability: 0.92,
      chargeRate: 1.08,
      burstScale: 1.1,
      controlScale: 1.04,
      passiveDrainMultiplier: 1.08,
      wobbleGainMultiplier: 1.08,
      wobbleRecoveryMultiplier: 0.92,
    },
  },
  anchor: {
    key: 'anchor',
    name: 'Anchor Driver',
    shortName: 'Anchor',
    description: 'A planted driver that resists ring-outs and settles quickly after heavy contact.',
    statMods: { speed: -0.08, weight: 0.03, stamina: 0.04, grip: 0.18, smash: -0.04, defense: 0.1 },
    physics: {
      launchPowerScale: 0.94,
      launchSpinScale: 1.03,
      launchStability: 1.18,
      chargeRate: 0.96,
      burstScale: 0.9,
      controlScale: 0.96,
      passiveDrainMultiplier: 0.95,
      ringOutResist: 1.18,
      wobbleGainMultiplier: 0.78,
      wobbleRecoveryMultiplier: 1.14,
      stabiliseScale: 1.18,
    },
  },
  drift: {
    key: 'drift',
    name: 'Drift Driver',
    shortName: 'Drift',
    description: 'A smooth driver built for endurance, opposite-spin control, and late-game wobble duels.',
    statMods: { speed: 0.05, weight: -0.03, stamina: 0.2, grip: 0.04, smash: -0.06, defense: -0.03 },
    physics: {
      launchPowerScale: 1,
      launchSpinScale: 1.08,
      launchStability: 1.06,
      chargeRate: 1,
      burstScale: 0.96,
      controlScale: 1.06,
      passiveDrainMultiplier: 0.86,
      ringOutResist: 0.98,
      wobbleGainMultiplier: 0.8,
      wobbleRecoveryMultiplier: 1.16,
      oppositeSpinScale: 1.12,
    },
  },
}

export const LOADOUT_STORAGE_FALLBACK = {
  layer: 'attack',
  disc: 'assault',
  driver: 'rush',
}

const LAYER_DEFAULTS = {
  attack: { disc: 'assault', driver: 'rush' },
  defense: { disc: 'fortress', driver: 'anchor' },
  stamina: { disc: 'glide', driver: 'drift' },
  rubber: { disc: 'fortress', driver: 'anchor' },
  trick: { disc: 'glide', driver: 'rush' },
}

function clampStat(value) {
  return Math.max(0.65, Math.min(1.65, Math.round(value * 100) / 100))
}

function normalisePartKey(key, defs, fallbackKey) {
  return key && defs[key] ? key : fallbackKey
}

export function createDefaultLoadout(layer = LOADOUT_STORAGE_FALLBACK.layer) {
  const safeLayer = BUILD_DEFS[layer] ? layer : LOADOUT_STORAGE_FALLBACK.layer
  const defaults = LAYER_DEFAULTS[safeLayer] || LAYER_DEFAULTS[LOADOUT_STORAGE_FALLBACK.layer]
  return {
    layer: safeLayer,
    disc: defaults.disc,
    driver: defaults.driver,
  }
}

export function normalizeLoadout(loadout) {
  if (typeof loadout === 'string') {
    return createDefaultLoadout(loadout)
  }
  const base = createDefaultLoadout(loadout?.layer)
  return {
    layer: normalisePartKey(loadout?.layer, BUILD_DEFS, base.layer),
    disc: normalisePartKey(loadout?.disc, DISC_DEFS, base.disc),
    driver: normalisePartKey(loadout?.driver, DRIVER_DEFS, base.driver),
  }
}

export function getLayerEntries() {
  return Object.values(BUILD_DEFS)
}

export function getDiscEntries() {
  return Object.values(DISC_DEFS)
}

export function getDriverEntries() {
  return Object.values(DRIVER_DEFS)
}

export function describeLoadout(loadout) {
  const normalized = normalizeLoadout(loadout)
  return `${BUILD_DEFS[normalized.layer].name} / ${DISC_DEFS[normalized.disc].shortName} / ${DRIVER_DEFS[normalized.driver].shortName}`
}

export function getLoadoutKey(loadout) {
  const normalized = normalizeLoadout(loadout)
  return `${normalized.layer}:${normalized.disc}:${normalized.driver}`
}

export function buildResolvedBlade(loadout) {
  const normalized = normalizeLoadout(loadout)
  const layer = BUILD_DEFS[normalized.layer]
  const layerPhysics = layer.physics || {}
  const disc = DISC_DEFS[normalized.disc]
  const driver = DRIVER_DEFS[normalized.driver]
  const stats = {}
  for (const statKey of Object.keys(layer.stats)) {
    stats[statKey] = clampStat(layer.stats[statKey] + (disc.statMods[statKey] || 0) + (driver.statMods[statKey] || 0))
  }

  return {
    ...layer,
    key: layer.key,
    loadout: normalized,
    loadoutKey: getLoadoutKey(normalized),
    fullName: describeLoadout(normalized),
    discName: disc.name,
    driverName: driver.name,
    discDescription: disc.description,
    driverDescription: driver.description,
    stats,
    physics: {
      collisionPushScale: (disc.physics.collisionPushScale || 1) * (driver.physics.collisionPushScale || 1),
      collisionSpinLossScale: (disc.physics.collisionSpinLossScale || 1) * (driver.physics.collisionSpinLossScale || 1),
      ringOutResist: (disc.physics.ringOutResist || 1) * (driver.physics.ringOutResist || 1),
      passiveDrainMultiplier: (layerPhysics.passiveDrainMultiplier || 1) * (disc.physics.passiveDrainMultiplier || 1) * (driver.physics.passiveDrainMultiplier || 1),
      wobbleGainMultiplier: (disc.physics.wobbleGainMultiplier || 1) * (driver.physics.wobbleGainMultiplier || 1),
      wobbleRecoveryMultiplier: driver.physics.wobbleRecoveryMultiplier || 1,
      launchPowerScale: (disc.physics.launchPowerScale || 1) * (driver.physics.launchPowerScale || 1),
      launchSpinScale: (layerPhysics.launchSpinScale || 1) * (driver.physics.launchSpinScale || 1),
      launchStability: (disc.physics.launchStability || 1) * (driver.physics.launchStability || 1),
      chargeRate: driver.physics.chargeRate || 1,
      burstScale: driver.physics.burstScale || 1,
      controlScale: driver.physics.controlScale || 1,
      stabiliseScale: driver.physics.stabiliseScale || 1,
      oppositeSpinScale: driver.physics.oppositeSpinScale || 1,
    },
  }
}