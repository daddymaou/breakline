# Breakline

Breakline is a head-to-head 3D nine-ball game for the browser. Invite a friend to a private table, take turns at the cue, and follow every shot from the same authoritative game state.

## The game

- Private two-player tables joined with a short room code.
- A 3D pool table with orbit and overhead camera views.
- Keyboard or mouse aiming, a live shot-power meter, and animated shot playback.
- Nine-ball turn rules, fouls, scratches, ball-in-hand placement, and rematches.
- Reconnect support for players returning to their reserved seat.

## Playing

Create a table and share its five-character code with another player. The game begins when they join.

- **A / D** or **← / →** — aim
- **Mouse drag** — fine-tune aim
- **Hold Space, then release** — charge and take a shot
- **Top view** — switch camera angle
- **After a foul** — click an open spot on the cloth to place the cue ball
- **Copy code** — copy your table code to share

## How it works

The server owns the match state and runs the shared fixed-timestep physics and nine-ball rules. Players send shot intent; both browsers play back the resulting shot and receive the same final state. The client handles rendering, input, and presentation.

Breakline is built with Three.js, Vite, Socket.IO, and native Node.js modules. The `shared` directory contains the physics, table constants, and rules used by both client and server.
