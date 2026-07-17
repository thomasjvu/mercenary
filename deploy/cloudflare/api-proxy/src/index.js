/**
 * Reverse-proxy api.raid.quest -> Phala CVM gateway.
 * Preserves path/query; sets Host to the Phala origin hostname for TLS/SNI.
 */
export default {
  async fetch(request, env) {
    const originHost = env.ORIGIN_HOST;
    if (!originHost) {
      return new Response('ORIGIN_HOST not configured', { status: 500 });
    }

    const incoming = new URL(request.url);
    const target = new URL(request.url);
    target.protocol = 'https:';
    target.hostname = originHost;
    target.port = '';

    const headers = new Headers(request.headers);
    headers.set('Host', originHost);
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));
    // Avoid hop-by-hop issues
    headers.delete('cf-connecting-ip');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      // @ts-expect-error workers duplex
      init.duplex = 'half';
    }

    try {
      const upstream = await fetch(target.toString(), init);
      // Pass through response; strip hop-by-hop
      const outHeaders = new Headers(upstream.headers);
      outHeaders.delete('content-encoding'); // let CF re-encode if needed
      // CORS: if origin needs open, leave API to handle CORS
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: outHeaders,
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: 'origin_unreachable',
          message: err instanceof Error ? err.message : String(err),
        }),
        { status: 502, headers: { 'content-type': 'application/json' } }
      );
    }
  },
};
