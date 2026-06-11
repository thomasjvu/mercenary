export function mapContractErrorCode(statusCode: number): string {
  switch (statusCode) {
    case 401:
      return 'unauthorized';
    case 402:
      return 'payment_required';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    case 502:
      return 'bad_gateway';
    case 503:
      return 'service_unavailable';
    case 400:
    default:
      return 'bad_request';
  }
}
