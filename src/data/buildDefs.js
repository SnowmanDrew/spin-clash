export const BUILD_DEFS = {
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
    color: '#10b981',
    accent: '#6ee7b7',
    description: 'Heavy and stable. Great at resisting knockback and surviving long exchanges.',
    stats: { speed: 0.9, weight: 1.35, stamina: 1.05, grip: 1.1, smash: 0.95, defense: 1.35 },
    specialName: 'Aegis Guard',
    specialDescription: 'A temporary stability shield that shrugs off impacts and wobble.',
  },
  stamina: {
    key: 'stamina',
    name: 'Stamina',
    color: '#3b82f6',
    accent: '#93c5fd',
    description: 'Efficient spin economy with smooth movement and strong endgame survival.',
    stats: { speed: 0.98, weight: 1.0, stamina: 1.4, grip: 1.0, smash: 0.85, defense: 1.0 },
    specialName: 'Silent Orbit',
    specialDescription: 'A spin-conserving focus state that reduces drain and recenters control.',
  },
  rubber: {
    key: 'rubber',
    name: 'Rubber',
    color: '#a855f7',
    accent: '#e9d5ff',
    description: 'Sticky contact and reverse-spin tricks. Strong against careless opponents.',
    stats: { speed: 1.0, weight: 0.98, stamina: 1.08, grip: 1.28, smash: 0.92, defense: 0.98 },
    specialName: 'Vampire Drain',
    specialDescription: 'Steals enemy spin on contact and converts it into a comeback surge.',
  },
}

export const CPU_BUILD_ORDER = ['attack', 'defense', 'stamina', 'rubber']
