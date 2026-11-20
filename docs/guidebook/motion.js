const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const art = document.querySelector('.art');
const portrait = document.querySelector('.portrait');
const rail = document.querySelector('.vertical');
const speedLines = document.querySelector('.speed-lines');
const chapters = [...document.querySelectorAll('.chapter')];
const poses = [
  'ready',
  'ready',
  'ready',
  'dispatch',
  'dispatch',
  'dispatch',
  'ready',
  'dispatch',
  'salute',
];
let queued = false;
let lastScroll = scrollY;
let speed = 0;
let frame = 0;
function draw() {
  const active = chapters.find((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top <= innerHeight * 0.5 && rect.bottom > innerHeight * 0.5;
  });
  const stage = active ? Number(active.dataset.stage) : 0;
  const ending = !active && scrollY > innerHeight;
  art.dataset.pose = ending ? 'salute' : poses[stage];
  portrait.dataset.stage = String(stage);
  const progress = scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const amount = reduce.matches ? 0 : progress - 0.5;
  portrait.style.setProperty('--parallax-y', `${amount * 40}px`);
  portrait.style.setProperty('--parallax-x', `${amount * 8}px`);
  rail.style.setProperty('--rail-drift', `${amount * -24}px`);
  const cel = document.querySelector('.pose-ready');
  const scale = Math.min(cel.clientWidth / 1024, cel.clientHeight / 1536);
  const blink = document.querySelector('.visor-blink');
  Object.assign(blink.style, {
    left: `${(cel.clientWidth - 1024 * scale) / 2 + 476 * scale}px`,
    top: `${(cel.clientHeight - 1536 * scale) / 2 + 166 * scale}px`,
    width: `${95 * scale}px`,
    height: `${13 * scale}px`,
  });
  queued = false;
}
function queue() {
  if (!queued) {
    queued = true;
    requestAnimationFrame(draw);
  }
}
function fade() {
  speed *= 0.88;
  speedLines.style.opacity = String(speed);
  if (speed > 0.005 && !reduce.matches) frame = requestAnimationFrame(fade);
  else {
    speedLines.style.opacity = '0';
    frame = 0;
  }
}
addEventListener(
  'scroll',
  () => {
    if (!reduce.matches) {
      speed = Math.min(0.35, speed + Math.abs(scrollY - lastScroll) / 1200);
      if (!frame) frame = requestAnimationFrame(fade);
    }
    lastScroll = scrollY;
    queue();
  },
  { passive: true }
);
addEventListener('resize', queue);
addEventListener('load', queue);
reduce.addEventListener('change', () => {
  cancelAnimationFrame(frame);
  frame = 0;
  speed = 0;
  speedLines.style.opacity = '0';
  draw();
});
draw();
