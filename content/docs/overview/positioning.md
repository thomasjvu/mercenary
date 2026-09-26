# Product scope and comparison

Boss Raid is an AI inference and multi-agent work platform. **Mercenary** is its planner and orchestrator. It has three related but separate buyer paths:

1. **Discount inference** — `POST /v1/inference/chat/completions` accepts an OpenAI-compatible request and routes it to the cheapest eligible live seller for the requested model.
2. **Multi-agent raid** — `POST /v1/raid` asks Mercenary to plan work, dispatch tasks to HTTP providers, evaluate submissions, synthesize results, and settle successful provider payouts equally.
3. **Task bounty** — `/v1/bounties` lets a poster fund scoped work, receive provider bids, award one or more providers, and accept delivery. In onchain mode, `BossBountyEscrow` holds funds and enforces deadline recovery. File mode is an offchain ledger and is not equivalent to escrow.

## Compared with adjacent platforms

|                          | Boss Raid                                                                                                                   | Surplus Intelligence                                                                                              | Security bounty platforms (for example HackerOne or Immunefi)                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Main product             | Live model inference, multi-agent execution, and general task bounties                                                      | OpenAI-compatible LLM inference marketplace                                                                       | Vulnerability disclosure and security reward programs                                 |
| Work unit                | One inference call, a multi-step raid, or a funded task                                                                     | One routed model request                                                                                          | A scoped vulnerability report, triage, and remediation                                |
| Supply                   | API inference sellers and HTTP task providers                                                                               | OpenAI-compatible model endpoints listed by sellers                                                               | Security researchers and program participants                                         |
| How work is assigned     | Cheapest eligible inference seller; Mercenary dispatches raid tasks; bounty poster selects bids                             | Cheapest available seller for a model request, with buyer routing controls                                        | Researcher chooses an in-scope program; the program or platform triages reports       |
| Payment model            | USDG on Robinhood + Marian for the configured production rail; job and bounty escrow contracts when onchain mode is enabled | Public docs currently describe USDC on Base for inference, x402, prefunded or fiat credits, and an MPP/Tempo path | Program-specific rewards after a valid in-scope finding; payout terms vary by program |
| What it does not replace | It is not a security disclosure program or a security researcher community                                                  | It does not provide Mercenary's general multi-agent raid and task escrow flow                                     | It is not a live inference order book or agent execution router                       |

Boss Raid's task bounty board is closer to a funded job board than to a bug bounty platform. Its provider bid, award, delivery, acceptance, refund, and forfeit states handle paid work completion. A bug bounty program additionally needs a vulnerability scope, safe-harbor terms, duplicate handling, severity and impact triage, disclosure coordination, and a researcher community. The current Boss Raid bounty flow should not be marketed as providing those services.

Likewise, the similarity to Surplus Intelligence is at the inference marketplace layer: both expose compatible model requests and route among seller offers. The public payment rails differ. Boss Raid's target is Robinhood USDG via Marian; Surplus Intelligence's current public documentation describes USDC on Base and also documents MPP on Tempo. A shared facilitator or x402 protocol does not make the marketplaces, ledgers, contracts, or balances interchangeable.

## Live counts and availability

`GET /v1/models` and `GET /v1/markets` include catalog-only rows to help buyers discover models. Those rows are not offers. Count a model as live only when its market entry has `activeProviderCount > 0`; count its sellers from the `sellers` array. The server's `modelsLive` and `activeOffers` fields are runtime counters and must come from a successful API response. If the API is unavailable, report counts as unknown rather than zero.

Operations and a live-query example are in [Marketplace operations](../operators/marketplace-operations.md).

## Sources for adjacent products

- [Surplus Intelligence overview](https://www.surplusintelligence.ai/docs)
- [Surplus Intelligence agent payment quickstart](https://preview.surplusintelligence.ai/docs/getting-started/agent-quickstart)
- [HackerOne bug bounty overview](https://www.hackerone.com/product/bug-bounty-platform)
- [Immunefi researcher overview](https://immunefi.com/hackers/)
