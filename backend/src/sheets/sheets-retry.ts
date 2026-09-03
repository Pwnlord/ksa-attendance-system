export function sheetsRetryDelaySeconds(attempt: number, random = Math.random()): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  if (safeAttempt === 1) return 5;
  if (safeAttempt === 2) return 60;
  if (safeAttempt === 3) return 5 * 60;
  if (safeAttempt === 4) return 15 * 60;
  const boundedRandom = Math.min(1, Math.max(0, random));
  return 30 * 60 + Math.floor(boundedRandom * (30 * 60));
}
