# Synthesis Submission Copy

Use this file for the Devfolio submission, video script, docs page, and landing page rewrite.

Only use claims here after the evidence checklist in [docs/synthesis-submission-plan.md](/Users/area/Desktop/boss-raid/docs/synthesis-submission-plan.md) is satisfied.

## Canonical Title

Boss Raid

## Canonical Tagline

One task. The right agents. One result with proof.

## Simple Hook

Lead with this first:

- One task. The right agents. One result with proof.

Then expand only after the judge asks how it works.

## One-Line Pitch

Boss Raid takes one task, routes it to the right specialist agents, and returns one verified result with a receipt.

## Short Description

Boss Raid takes one task, routes it to the right specialist agents, and returns one verified result with proof. Mercenary accepts a task through MCP, `POST /v1/raid`, or an OpenAI-compatible chat surface, partitions it into scoped workstreams, routes each workstream to the right specialist providers, verifies the outputs, synthesizes one canonical result, and attaches receipt and settlement proof.

## 280-Character Version

Boss Raid lets Claude Code, Codex, and API clients send one task, route it across specialist agents, get one verified result back, and keep the receipt plus settlement proof.

## Problem Statement

AI coding tools are strong generalists, but hard tasks still need multiple kinds of expertise: diagnosis, implementation, verification, constraints, and rollout. Today that coordination is manual. A human has to decide who to ask, how to split the work, how to compare conflicting outputs, which outputs to trust, and how to pay or score contributors.

Existing agent systems usually fail in one of four ways:

- they act like a single monolithic assistant instead of a coordination layer
- they use multiple agents but return a weak or opaque ensemble with no proof surface
- they lack a real settlement path for specialist contributors
- they do not fit naturally into existing workflows like Claude Code, Codex, MCP, or standard HTTP APIs

Boss Raid solves this by making specialist-agent coordination a first-class service. Mercenary accepts one task, decomposes it into explicit workstreams, routes each workstream privately to the right providers, verifies the outputs, drops weak contributions, returns one canonical multi-agent synthesis result, and records receipt and settlement proof for the run.

## Long Description

Boss Raid is the coordination and settlement rail for specialist agents.

The simple version is:

- one task in
- the right agents behind it
- one result with proof out

Mercenary is the orchestrator agent inside Boss Raid. It is built to sit directly inside a user's existing workflow instead of asking them to learn a new product category. A user can call it through MCP from Claude Code or Codex, through the native `POST /v1/raid` route, or through an OpenAI-compatible chat route.

Once a task enters the system, Mercenary does not just broadcast it to a swarm. It sanitizes the task, chooses privacy mode, partitions the work into explicit workstreams, assigns sub-roles to specialist providers, and fans complex work into internal child raids under one parent raid handle.

Examples of workstreams include:

- diagnosis
- implementation
- verification
- constraints
- execution

Each specialist provider receives a scoped brief over HTTP. Providers return their outputs independently. Mercenary then evaluates the returned work, drops weak or unapproved outputs, and synthesizes the approved contributions into one canonical result.

When the caller needs trust-gated coordination, Mercenary can require registered ERC-8004 providers and minimum trust scores before a workstream is assigned. Trust routing stays separate from privacy scoring.

That result is not an opaque ensemble. Boss Raid keeps a receipt surface with:

- synthesized output
- workstream summaries
- approved contributors
- ranked submissions
- payout allocation
- settlement proof
- ERC-8004 identity and trust selection data
- ERC-8183-aligned parent raid, registry call, and child-job proof

Judges do not need internal ops access to see that proof. The public receipt page is capability-based: `raidId` plus `raidAccessToken` loads one raid receipt through the normal public read routes.

This matters because the value of a multi-agent system is not just parallel generation. The value is controlled coordination: scoped routing, evaluation, synthesis, and proof.

Boss Raid also has a real economic surface. Paid public routes use x402 on Base. Buyers pay for the service through a normal HTTP-native payment flow. Providers who are approved split the payout budget equally. There is no winner-takes-all logic and no runner-up bonus path.

For sensitive tasks, Boss Raid can keep reasoning private while still producing trustworthy public outcomes. Private task context can flow through privacy-oriented model families, while public proof surfaces expose only the artifacts and receipts needed for verification.

For autonomous systems, Boss Raid is a natural control plane. Mercenary can serve as the service that other agents hire when they need specialist help, structured verification, or settlement-backed coordination.

For developers, the main win is workflow fit. Boss Raid is designed to feel native inside existing tool use:

- MCP for host-agent delegation
- `POST /v1/raid` for native integrations
- `POST /v1/chat/completions` for compatibility

The result is a system that feels like one API call from the user's point of view, but behaves like a managed private multi-agent synthesis raid under the hood.

## Track Addenda

### Synthesis Open Track

Boss Raid is the broad platform story: a real workflow tool, a real coordination system, a real payment surface, and a real proof surface.

### Venice

Boss Raid uses Venice for the strict-private lane. Sensitive task context stays inside Venice-backed provider paths, while the public receipt, trust, and settlement surfaces expose only the proof needed for verification. The split is deliberate: private inputs, trustworthy outputs.

### Base: Agent Services on Base

Boss Raid is an agent service on Base. Other agents or humans can discover it, call it, and pay for it through x402. The service sold is specialist-agent coordination with receipts.

### Protocol Labs: Let the Agent Cook

Mercenary demonstrates the full loop:

- discover the task shape
- plan workstreams
- execute through specialist providers and real tools
- verify outputs
- submit a canonical result

### Protocol Labs: Agents With Receipts — ERC-8004

Boss Raid is a trust-aware coordination system. Mercenary and specialist providers operate as verifiable economic actors with ERC-8004 identities, manifests, structured logs, and trust-gated routing. ERC-8004 is part of provider selection, not just profile metadata.

### Virtuals: ERC-8183 Open Build

Boss Raid uses ERC-8183 to model the real job structure of the product: one parent raid, many specialist child jobs, evaluator-gated completion, and final raid settlement. Receipts expose the proof standard, settlement contracts, registry call proof, and child-job linkage. The settlement layer is not decorative; it is the economic backbone for specialist coordination.

### EigenCloud

Boss Raid deploys verifiable off-chain execution through EigenCompute. The evaluator and attested runtime proof make verification part of the live system rather than a slideware claim.

## Suggested Problem Statement For Forms

AI agents are good at generating answers but weak at controlled collaboration. Hard tasks usually require multiple specialist roles, but current systems leave coordination, verification, and settlement to the human operator. There is no native rail that lets one workflow tool call a private multi-agent system, receive one canonical result, and keep receipt plus settlement proof. Boss Raid solves this by turning one task into a managed specialist-agent raid with scoped routing, verification, synthesis, and receipts.

## Suggested What Makes It Different

- Boss Raid is not just a swarm. It is a coordination and settlement rail.
- Mercenary creates explicit workstreams and scoped sub-roles instead of running generic parallel prompts.
- The result is one canonical multi-agent synthesis response with supporting receipt data.
- ERC-8183 settlement, ERC-8004 trust, and Venice private providers are load-bearing parts of the flow.
- Public proof links expose `routingProof`, so judges can see why Mercenary chose a provider instead of inferring the route.
- The system fits directly into Claude Code, Codex, MCP, and standard HTTP workflows.
- Paid public routes and settlement proof make the service economically real.

## Demo Script

### 30 Seconds

1. Start in Claude Code or Codex.
2. Call `bossraid_delegate` on a hard task.
3. Show Mercenary split the task into diagnosis, implementation, and verification.
4. Show the final canonical result.
5. Open the receipt and show approved contributors plus settlement proof.

### 2 Minutes

1. Show the user-facing task request.
2. Show the public route or MCP invocation.
3. Show workstream fanout.
4. Show provider status and one rejected output.
5. Show the synthesized result.
6. Show the receipt and ERC-8183 child-job settlement proof.
7. Show ERC-8004 trust-gated provider selection.
8. Show the Venice private-provider path for strict mode.
9. Show Base x402 payment proof.
10. Show EigenCompute attested runtime proof.

### 5 Minutes

1. Start with the workflow problem.
2. Show why a single assistant is not enough.
3. Run a full raid.
4. Show workstreams and child raids.
5. Show evaluator verification.
6. Show the canonical output.
7. Show receipt, payout, and settlement.
8. Show track-specific proof: Base, EigenCompute, ERC-8183, ERC-8004, Venice.

## Submission Asset Checklist

- cover image
- deployed URL
- repo URL
- short description
- full description
- 2 to 5 minute demo video
- architecture diagram
- screenshots for request, result, and receipt
- proof links for Base, EigenCompute, ERC-8183, and ERC-8004

## Do Not Say

- "We built a swarm."
- "We query many models and pick the best."
- "It is just a marketplace."
- "It is basically a bug-fixing assistant."

## Say Instead

- "Boss Raid is the coordination and settlement rail for specialist agents."
- "Mercenary turns one task into a private multi-agent raid."
- "The system returns one canonical multi-agent synthesis result with receipts."
- "The service fits directly into Claude Code, Codex, MCP, and HTTP workflows."
