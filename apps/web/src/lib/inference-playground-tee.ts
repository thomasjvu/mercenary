export type TeePreflightInput = {
  requiresTeeVerify: boolean;
  strictE2ee: boolean;
  attestation: { valid: boolean; e2eeReady?: boolean };
};

export type TeePreflightResult =
  | { ok: true; status: string }
  | { ok: false; status: string; message: string };

export function evaluateTeePreflight(input: TeePreflightInput): TeePreflightResult {
  if (!input.requiresTeeVerify) {
    return { ok: true, status: '' };
  }

  if (!input.attestation.valid) {
    return {
      ok: false,
      status: 'TEE verification failed',
      message: 'TEE verification failed. Inference was not sent.',
    };
  }

  if (input.strictE2ee && !input.attestation.e2eeReady) {
    return {
      ok: false,
      status: 'E2EE not ready',
      message: 'Strict E2EE requires a TEE attestation with E2EE keys ready.',
    };
  }

  return {
    ok: true,
    status: input.strictE2ee ? 'TEE verified · server E2EE relay' : 'TEE verified',
  };
}

export function resolveTeeStatusAfterReceipt(input: {
  preflightPassed: boolean;
  receiptId?: string;
  currentStatus: string | null;
}): string | null {
  if (!input.receiptId || !input.preflightPassed) {
    return input.currentStatus;
  }

  return 'TEE verified · inference receipt issued';
}
