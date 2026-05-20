# Test scripts

## test-websocket.js

WebSocket smoke test for the `jamie-oliver-agent-v0` backend.

### Install

```bash
npm install
```

### Run

**npm script**

```bash
npm run test:websocket
```

**Direct**

```bash
node scripts/test-websocket.js
```

**Custom URL**

```bash
node scripts/test-websocket.js wss://your-server.com/ws/voice
```

### Interactive commands

#### Connection
- `connect` or `c` — open WebSocket
- `reconnect` or `r` — reconnect
- `disconnect` or `d` — close socket
- `status` or `s` — connection state
- `session` — print session id
- `newsession` — new session id

#### Messages
- `send <json>` — send JSON payload
- `text <message>` — send plain text
- `test` — send canned test message

#### Recipe workflow
- `recipe start [recipe_id]` — start recipe (e.g. `recipe start squash_risotto_2`)
- `recipe next` — next step
- `recipe done` — mark step done
- `recipe repeat` — repeat current step
- `recipe status` — recipe status
- `recipe list` — list recipes

#### Voice
- `voice start` — capture mic (needs sox)
- `voice stop` — stop capture

#### Help
- `examples` — sample commands
- `help` or `h` — help
- `exit` / `quit` / `q` — quit

### Example (text workflow)

```bash
$ npm run test:websocket

> connect
✅ WebSocket connected

> recipe list
📤 Sending text: "What recipes are available?"

> recipe start squash_risotto_2
📤 Starting recipe: squash_risotto_2

> recipe next
📤 Asking for next step

> recipe done
📤 Marking step complete
```

### Audio capture

Requires `sox` (`brew install sox` on macOS).

### Notes

- Default URL targets the production ALB (override with argv)
- Session id is generated per run
- Colorized output for readability
- Handles common WebSocket close codes (e.g. 1006)
