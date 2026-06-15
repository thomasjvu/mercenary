export function encodeBase64Json(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(
      encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      )
    );
  }

  return Buffer.from(json, 'utf8').toString('base64');
}
