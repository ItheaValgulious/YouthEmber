let authGateBootstrapped = false;
let authGateSkippedForSession = false;

export function markAuthGateBootstrapped(): void {
  authGateBootstrapped = true;
}

export function isAuthGateBootstrapped(): boolean {
  return authGateBootstrapped;
}

export function skipAuthGateForSession(): void {
  authGateSkippedForSession = true;
}

export function resetAuthGateSkip(): void {
  authGateSkippedForSession = false;
}

export function isAuthGateSkippedForSession(): boolean {
  return authGateSkippedForSession;
}
