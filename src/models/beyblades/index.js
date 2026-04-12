import { createAttackBlade } from './attack.js'
import { createDefenseBlade } from './defense.js'
import { createRubberBlade } from './rubber.js'
import { createStaminaBlade } from './stamina.js'

export function createBeybladeMesh(primary, accent, buildKey) {
  if (buildKey === 'attack') return createAttackBlade(primary, accent)
  if (buildKey === 'defense') return createDefenseBlade(primary, accent)
  if (buildKey === 'stamina') return createStaminaBlade(primary, accent)
  if (buildKey === 'rubber') return createRubberBlade(primary, accent)
  return createAttackBlade(primary, accent)
}