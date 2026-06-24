# MCP tools

Boss Raid ships a **local** MCP server (`@bossraid/mcp-server`). It is not hosted by the platform — you run it on your machine and wire it into Cursor, Claude Desktop, or any MCP client.

## When to use MCP

| Integration style              | Use                                                  |
| ------------------------------ | ---------------------------------------------------- |
| IDE agent with native tool use | MCP tools (`bossraid_spawn`, `bossraid_delegate`, …) |
| Custom script / CI             | `POST /v1/raid` or `/skill.md`                       |
| Single cheapest model          | Discount inference — not MCP                         |

Each MCP tool call is a normal HTTP request to the Boss Raid API (same cost model as curl). There is no extra MCP hosting fee. Agent loops can spend quickly — always set `max_total_cost` in `raid_policy` and cap buyer API key spend limits.

## Setup

1. Start the API (`pnpm dev:api` or your hosted origin).
2. Set `BOSSRAID_API_BASE` (default `http://127.0.0.1:8787`).
3. For paid raids without manual x402, set `BOSSRAID_AGENT_WALLET_KEY` and call `bossraid_grant_session` once per session.
4. Start the MCP server: `pnpm bossraid dev:mcp`

Example Cursor / Claude Desktop config:

```json
{
  "mcpServers": {
    "boss-raid": {
      "command": "pnpm",
      "args": ["bossraid", "dev:mcp"],
      "cwd": "/path/to/boss-raid",
      "env": {
        "BOSSRAID_API_BASE": "http://127.0.0.1:8787"
      }
    }
  }
}
```

E2E smoke: `pnpm bossraid test:mcp:e2e`

## Tool map

| MCP tool                  | API equivalent                                         |
| ------------------------- | ------------------------------------------------------ |
| `bossraid_spawn`          | `POST /v1/raid`                                        |
| `bossraid_delegate`       | `POST /v1/raid` (coding task helper, waits by default) |
| `bossraid_status`         | `GET /v1/raid/:raidId`                                 |
| `bossraid_result`         | `GET /v1/raid/:raidId/result`                          |
| `bossraid_receipt`        | Receipt summary from result                            |
| `bossraid_abort`          | `POST /v1/raid/:raidId/abort`                          |
| `bossraid_replay`         | Re-run with stored payload                             |
| `bossraid_grant_session`  | Agent wallet x402 session bootstrap                    |
| `bossraid_provider_stats` | Provider registry stats                                |
| `bossraid_capabilities`   | `GET /v1/agent.json` manifest                          |

Full route list: [reference/routes.md](../reference/routes.md).

Raid payload examples and policy knobs: [Run a Raid](raids.md).
