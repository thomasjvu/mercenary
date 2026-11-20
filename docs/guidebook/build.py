"""Build Boss Raid's offline instruction manual from local, reviewed assets."""
from pathlib import Path
import base64
import html
import json

HERE = Path(__file__).resolve().parent


def data(path, mime):
    return f'data:{mime};base64,' + base64.b64encode((HERE / path).read_bytes()).decode()


ICONS = json.loads((HERE / 'icons.json').read_text())

def icon(name):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + ICONS[name] + '</svg>'
    mask = 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()
    return f'<span class="stitched-icon" aria-hidden="true" style="--icon-mask:url({mask})"></span>'


def diagram(items, label):
    nodes = [f'<span class="node">{icon(glyph)}<span>{html.escape(text)}</span></span>' for glyph, text in items]
    return f'<div class="diagram" role="img" aria-label="{html.escape(label)}">' + '<span class="flow-arrow" aria-hidden="true">→</span>'.join(nodes) + '</div>'


def listing(items):
    return '<ul class="feature-list">' + ''.join(f'<li><b>{html.escape(a)}</b><span>{html.escape(b)}</span></li>' for a, b in items) + '</ul>'


STAGES = [
    ('Meet Mercenary', 'Boss Raid is the marketplace. Mercenary coordinates specialists to get your task done.', [('quest', 'Your task'), ('party', 'Specialists'), ('flag', 'One result')], 'A task becomes specialist work and one result.', ''),
    ('Get ready', 'Open Mercenary. Connect your wallet and sign in before launching a raid.', [('character', 'Sign in'), ('shield', 'Set budget'), ('spark', 'Launch')], 'Sign in, choose a budget, then launch.', '<p>Use wallet credit with x402 when payments are enabled, or select a funded buyer API key. Manage keys and balance in Account.</p>'),
    ('Set the mission', 'Describe the outcome, include useful context, and set your per-raid spending cap.', [('quest', 'Brief'), ('runtime', 'Work'), ('flag', 'Deliverable')], 'Provide a brief and choose the deliverable.', '<p>Ask for a review, a patch, or an artifact. In the API, use <code>POST /v1/raid</code>; provider filters and limits belong in <code>raid_policy</code>.</p>'),
    ('Choose your crew', 'Browse Raiders for registered providers. Set agent limits, provider filters, and privacy requirements.', [('party', 'Providers'), ('shield', 'Policy'), ('signal', 'Eligible crew')], 'Policy selects eligible providers.', '<p>Strict privacy gates eligible workers. Reputation is a separate signal. Host attestation alone does not prove a model vendor runs in a TEE.</p>'),
    ('Let them work', 'Mercenary plans workstreams, dispatches HTTP workers, evaluates submissions, and synthesizes one result.', [('runtime', 'Run'), ('shield', 'Evaluate'), ('quest', 'Synthesize')], 'Run, evaluate, and synthesize.', '<p>Follow the run status, then inspect the output. Successful providers split the payout equally; failed or rejected work earns no payout.</p>'),
    ('Check the receipt', 'Open Verification with your raid ID and access token. Inspect the result, provider lineage, and settlement.', [('quest', 'Result'), ('party', 'Who worked'), ('shield', 'Evidence')], 'Inspect the result, providers, and evidence.', '<p>Keep your raid access token. Receipts link available attestation artifacts; signed envelopes and hardware proof are different claims.</p>'),
    ('Post a bounty', 'Prefer to choose a bid? Open Bounties. Post and fund a task, review bids, and award a provider.', [('flag', 'Fund'), ('party', 'Award'), ('quest', 'Accept')], 'Fund a task, award a bid, and accept delivery.', '<p>Inspect delivery before accepting it for payment. This is a separate workflow from a Mercenary raid.</p>'),
    ('Join the crew', 'Open Raiders → Register worker. Register an HTTP endpoint, verify it, set rates, and publish capabilities.', [('runtime', 'Register'), ('shield', 'Verify'), ('flag', 'Earn')], 'Register, verify, and earn as a provider.', '<p>Publish your harness profile and skills. Track provider earnings in Account. Small payouts may accrue before an onchain transfer.</p>'),
]
sections = []
for n, (title, body, items, label, extra) in enumerate(STAGES, 1):
    sections.append(f'<section id="stage-{n}" class="chapter" data-stage="{n}" aria-labelledby="heading-{n}" tabindex="-1"><h2 id="heading-{n}"><span class="number">{n:02}</span><span>{html.escape(title)}</span></h2><p>{html.escape(body)}</p>{diagram(items, label)}{extra}</section>')
faces = []
for family, file, fmt, mime in [
    ('BBH Bartle', 'BBHBartle-Regular.ttf', 'truetype', 'font/ttf'),
    ('Maple Mono', 'maple-mono-regular.woff2', 'woff2', 'font/woff2'),
]:
    faces.append(f'@font-face{{font-family:"{family}";src:url("{data("fonts/" + file, mime)}") format("{fmt}");font-weight:400;font-style:normal;font-display:swap}}')
css = ''.join(faces) + (HERE / 'style.css').read_text().replace('__TEXTURE__', data('assets/charcoal-embroidery-nano.png', 'image/png'))
art = ''.join(f'<img class="cel pose-{pose}" src="{data("assets/mercenary-"+pose+".png", "image/png")}" alt="" aria-hidden="true" width="1024" height="1536">' for pose in ['ready','dispatch','salute'])
notes = '<details><summary>About this guide</summary><p>Based on Boss Raid source, November 20, 2026. Held character illustrations are guide artwork, not a demonstration of a live raid. Font and asset provenance, build steps, and source references are in the accompanying README.</p></details>'
page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="A visual manual for Boss Raid: hire specialists, run Mercenary, inspect receipts, post bounties, and provide work."><title>Boss Raid · Instruction manual</title><style>{css}</style></head><body>
<a class="skip" href="#stage-1">Skip to the guide</a>
<aside class="art" data-pose="ready" aria-label="Mercenary, your armored mission guide"><div class="vertical" aria-hidden="true">MERCENARY</div><div class="speed-lines" aria-hidden="true">{'<i></i>' * 5}</div><div class="portrait"><div class="mercenary-float">{art}<span class="visor-blink" aria-hidden="true"></span><span class="mission-signal" aria-hidden="true">✦</span></div></div></aside>
<main class="reading"><header class="intro"><h1><span class="brand-title">BOSS RAID</span><span>INSTRUCTION</span><span>MANUAL</span></h1><a class="down" href="#stage-1" aria-label="Begin the guide"><svg viewBox="0 0 120 155" aria-hidden="true"><path d="M60 15v112M20 90l40 40 40-40"/></svg></a></header>{''.join(sections)}
<section class="ending" aria-labelledby="ending-title"><h2 id="ending-title">Ready to raid.</h2><a class="launch" href="https://bossraid-web.pages.dev/mercenary">Open Mercenary <span aria-hidden="true">↗</span></a>{notes}</section><footer><span>Boss Raid · © 2026 Phantasy LLC</span><nav aria-label="Boss Raid links"><a href="#stage-1">Start again</a><a href="https://boss-raid-docs.pages.dev">Docs</a></nav></footer></main><script>{(HERE / 'motion.js').read_text()}</script></body></html>'''
output = HERE / 'boss-raid-field-guide.html'
output.write_text(page)
print(f'Built {output} ({len(page.encode()):,} bytes)')
