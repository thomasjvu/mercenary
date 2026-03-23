const WAVE_THRESHOLD = 3;
const CHARACTER_MULTIPLIER = 3;
const ANIMATION_STEP_MS = 40;
const WAVE_BUFFER = 5;

type AsciiShiftOptions = {
  dur: number;
  chars: string;
  preserveSpaces: boolean;
  spread: number;
};

type AsciiShiftController = {
  destroy: () => void;
};

type ActiveWave = {
  startPos: number;
  startTime: number;
};

export function bindAsciiRipple(root: HTMLElement): () => void {
  const controllers = Array.from(root.querySelectorAll<HTMLElement>("[data-ascii-ripple]")).map((element) =>
    createAsciiShift(element, { dur: 1000, spread: 1 }),
  );

  return () => {
    controllers.forEach((controller) => controller.destroy());
  };
}

function createAsciiShift(
  element: HTMLElement,
  options: Partial<AsciiShiftOptions> = {},
): AsciiShiftController {
  let originalText = element.textContent ?? "";
  let originalChars = [...originalText];
  let isAnimating = false;
  let isHovering = false;
  let cursorPos = 0;
  let waves: ActiveWave[] = [];
  let animationFrame: number | null = null;
  let lockedWidth: number | null = null;
  let observer: MutationObserver | null = null;

  const config: AsciiShiftOptions = {
    dur: 600,
    chars: ".,:;-=+*#%@!?/\\\\|[]{}()<>0123456789",
    preserveSpaces: true,
    spread: 0.3,
    ...options,
  };

  function stop() {
    element.textContent = originalText;
    element.classList.remove("ascii-ripple--active");
    if (lockedWidth !== null) {
      element.style.width = "";
      lockedWidth = null;
    }
    isAnimating = false;
    animationFrame = null;
  }

  function updateCursorPos(event: PointerEvent) {
    if (originalChars.length === 0) {
      cursorPos = 0;
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) {
      cursorPos = 0;
      return;
    }

    const x = event.clientX - rect.left;
    const rawPos = Math.round((x / rect.width) * (originalChars.length - 1));
    cursorPos = Math.max(0, Math.min(rawPos, originalChars.length - 1));
  }

  function startWave() {
    if (originalChars.length === 0) {
      return;
    }

    waves.push({
      startPos: cursorPos,
      startTime: Date.now(),
    });

    if (!isAnimating) {
      start();
    }
  }

  function cleanupWaves(timestamp: number) {
    waves = waves.filter((wave) => timestamp - wave.startTime < config.dur);
  }

  function calcWaveEffect(index: number, timestamp: number) {
    let shouldAnimate = false;
    let nextChar = originalChars[index];

    for (const wave of waves) {
      const age = timestamp - wave.startTime;
      const progress = Math.min(age / config.dur, 1);
      const distance = Math.abs(index - wave.startPos);
      const maxDistance = Math.max(wave.startPos, originalChars.length - wave.startPos - 1);
      const radius = (progress * (maxDistance + WAVE_BUFFER)) / config.spread;

      if (distance > radius) {
        continue;
      }

      shouldAnimate = true;
      const intensity = Math.max(0, radius - distance);
      if (intensity <= WAVE_THRESHOLD && intensity > 0) {
        const frameIndex =
          (distance * CHARACTER_MULTIPLIER + Math.floor(age / ANIMATION_STEP_MS)) % config.chars.length;
        nextChar = config.chars[frameIndex] ?? nextChar;
      }
    }

    return { shouldAnimate, nextChar };
  }

  function generateScrambledText(timestamp: number) {
    return originalChars
      .map((char, index) => {
        if (config.preserveSpaces && char === " ") {
          return " ";
        }

        const effect = calcWaveEffect(index, timestamp);
        return effect.shouldAnimate ? effect.nextChar : char;
      })
      .join("");
  }

  function start() {
    if (isAnimating || originalChars.length === 0) {
      return;
    }

    if (lockedWidth === null) {
      lockedWidth = element.getBoundingClientRect().width;
      if (lockedWidth > 0) {
        element.style.width = `${lockedWidth}px`;
      }
    }

    isAnimating = true;
    element.classList.add("ascii-ripple--active");

    const animate = () => {
      const timestamp = Date.now();
      cleanupWaves(timestamp);

      if (waves.length === 0) {
        stop();
        return;
      }

      element.textContent = generateScrambledText(timestamp);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
  }

  function handlePointerEnter(event: PointerEvent) {
    isHovering = true;
    updateCursorPos(event);
    startWave();
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isHovering) {
      return;
    }

    const previousCursorPos = cursorPos;
    updateCursorPos(event);
    if (cursorPos !== previousCursorPos) {
      startWave();
    }
  }

  function handlePointerLeave() {
    isHovering = false;
  }

  element.addEventListener("pointerenter", handlePointerEnter);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerleave", handlePointerLeave);

  observer = new MutationObserver(() => {
    if (isAnimating) {
      return;
    }

    originalText = element.textContent ?? "";
    originalChars = [...originalText];
  });
  observer.observe(element, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  return {
    destroy() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      observer?.disconnect();
      waves = [];
      stop();
      element.removeEventListener("pointerenter", handlePointerEnter);
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("pointerleave", handlePointerLeave);
    },
  };
}
