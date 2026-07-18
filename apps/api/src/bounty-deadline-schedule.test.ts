import assert from 'node:assert/strict';
import test from 'node:test';
import { msUntilNextHour, scheduleBountyDeadlineWorker } from './routes/bounties.js';

test('msUntilNextHour lands on the next clock hour', () => {
  const now = new Date('2026-07-18T14:37:12.345Z');
  const wait = msUntilNextHour(now);
  const target = new Date(now.getTime() + wait);
  assert.equal(target.getUTCMinutes(), 0);
  assert.equal(target.getUTCSeconds(), 0);
  assert.equal(target.getUTCMilliseconds(), 0);
  assert.equal(target.getUTCHours(), 15);
});

test('scheduleBountyDeadlineWorker defaults to hourly mode', () => {
  const timeouts: number[] = [];
  const intervals: number[] = [];
  const mode = scheduleBountyDeadlineWorker({}, () => undefined, {
    setTimeout: ((fn: () => void, ms?: number) => {
      timeouts.push(ms ?? 0);
      return { unref() {} } as unknown as NodeJS.Timeout;
    }) as typeof setTimeout,
    setInterval: ((fn: () => void, ms?: number) => {
      intervals.push(ms ?? 0);
      return { unref() {} } as unknown as NodeJS.Timeout;
    }) as typeof setInterval,
  });
  assert.equal(mode.mode, 'hourly');
  assert.equal(timeouts.length, 1);
  assert.equal(intervals.length, 0);
  assert.ok(timeouts[0]! > 0);
  assert.ok(timeouts[0]! <= 3_600_000);
});

test('scheduleBountyDeadlineWorker honors fixed interval override', () => {
  const intervals: number[] = [];
  const mode = scheduleBountyDeadlineWorker(
    { BOSSRAID_BOUNTY_DEADLINE_INTERVAL_MS: '60000' },
    () => undefined,
    {
      setTimeout: (() => ({ unref() {} })) as unknown as typeof setTimeout,
      setInterval: ((fn: () => void, ms?: number) => {
        intervals.push(ms ?? 0);
        return { unref() {} } as unknown as NodeJS.Timeout;
      }) as typeof setInterval,
    }
  );
  assert.equal(mode.mode, 'interval');
  assert.deepEqual(intervals, [60_000]);
});

test('scheduleBountyDeadlineWorker can be disabled', () => {
  const mode = scheduleBountyDeadlineWorker({ BOSSRAID_BOUNTY_DEADLINE_INTERVAL_MS: '0' }, () => {
    throw new Error('should not run');
  });
  assert.equal(mode.mode, 'off');
});
