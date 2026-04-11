# Project: Beyblade Clash Circuit

This project is a Vue 3 + Vite arcade prototype using Three.js and Rapier.

## Goals
- Prioritize fun, readable, arcade-first gameplay over perfect real-world simulation.
- Preserve the fantasy of spinning tops colliding in a stadium.
- Keep controls simple and high-skill.
- Favor game feel: dramatic hits, readable knockback, tense endgame spin duels.

## Architecture rules
- UI belongs in Vue components.
- Simulation, physics, and game loop logic belong in composables or plain JS modules.
- Avoid putting large simulation systems directly inside template components.
- Prefer small focused files over one giant component.
- Keep state transitions explicit: menu, aiming, fighting, round_end, match_end.

## Gameplay rules
- Spin is a resource, not health.
- Attack builds should feel explosive but unstable.
- Defense builds should feel heavy and resilient.
- Stamina builds should feel efficient and smooth.
- Rubber/spin-steal builds should be strongest in contact-based exchanges.
- Every change should improve either readability, skill expression, or dramatic tension.

## Visual rules
- Anime/cartoon style.
- Strong silhouettes.
- Bright readable effects.
- Do not make the arena or effects so noisy that players lose track of the tops.

## Code rules
- Keep functions small and named clearly.
- Add brief comments only where logic is not obvious.
- Avoid magic numbers unless grouped into tuning constants.
- When adding tuning values, centralize them in config objects.
- Clean up event listeners, animation frames, and physics resources.

## When making changes
- Explain what changed and why.
- Prefer minimal safe edits over broad rewrites unless asked.
- When uncertain, preserve existing gameplay and structure.