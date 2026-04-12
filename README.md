# ClashBlades

Vue 3 + Vite arcade Beyblade prototype with Three.js visuals, Rapier physics, single-player, and room-based online multiplayer.

## Modes

- Single-player: local player vs CPU, first to 2 rounds.
- Online room: host-authoritative free-for-all for 2 to 4 players with a shareable room link.

## Run Locally

Install dependencies:

```bash
npm install
```

Start the room server in one terminal:

```bash
npm run server
```

Start the Vite client in another terminal:

```bash
npm run dev
```

Development convenience for the room server with auto-reload:

```bash
npm run dev:server
```

Production build:

```bash
npm run build
```

## Online Multiplayer

The online mode uses a lightweight WebSocket room server at `/ws`.

- One player creates a room.
- The room creator becomes the host.
- The host shares the generated room link or room code.
- Up to 4 players can join.
- All players must ready up before the host can start the match.
- The host runs the authoritative simulation and broadcasts match snapshots.

This keeps the existing arcade physics and avoids forcing Rapier to run authoritatively on a separate Node game server.

## Network Architecture

The project now uses a host-authoritative room model:

- `server/roomServer.js`: WebSocket room server, lobby state, host election, input relay, snapshot relay.
- `src/composables/useRoomConnection.js`: browser room client, room lifecycle, snapshots, remote input relay.
- `src/composables/useBeybladeSimulation.js`: shared single-player and multiplayer simulation layer.

### Why this architecture

- Preserves single-player without a second gameplay implementation.
- Allows 2 to 4 player rooms with a shareable link immediately.
- Keeps simulation complexity in the browser where the current Three.js + Rapier code already lives.
- Avoids a larger dedicated authoritative physics backend rewrite.

## Environment Configuration

By default, the client connects to:

- `ws://localhost:8787/ws` during local Vite development.
- `ws(s)://<current-host>/ws` when served from a non-Vite host.

You can override that with:

```bash
VITE_MULTIPLAYER_WS_URL=ws://your-host:8787/ws
```

## Current Constraints

- Online matches are host-authoritative rather than fully server-simulated.
- Guests render from host snapshots.
- Joining a room is disabled once a match is already active.

## Health Check

The room server exposes:

```text
GET /health
```

Example response:

```json
{"ok":true,"rooms":0}
```