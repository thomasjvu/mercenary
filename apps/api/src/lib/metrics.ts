type ApiMetricsRouteStats = {
  count: number;
  errorCount: number;
  totalLatencyMs: number;
  maxLatencyMs: number;
};

export type ApiMetrics = ReturnType<typeof createApiMetrics>;

export function createApiMetrics() {
  const startedAt = new Date().toISOString();
  const counters = new Map<string, number>();
  const routes = new Map<string, ApiMetricsRouteStats>();

  return {
    increment(name: string, value = 1) {
      counters.set(name, (counters.get(name) ?? 0) + value);
    },
    recordHttp(input: { method: string; route: string; statusCode: number; durationMs: number }) {
      const key = `${input.method.toUpperCase()} ${input.route}`;
      const current =
        routes.get(key) ??
        ({
          count: 0,
          errorCount: 0,
          totalLatencyMs: 0,
          maxLatencyMs: 0,
        } satisfies ApiMetricsRouteStats);
      current.count += 1;
      current.errorCount += input.statusCode >= 500 ? 1 : 0;
      current.totalLatencyMs += input.durationMs;
      current.maxLatencyMs = Math.max(current.maxLatencyMs, input.durationMs);
      routes.set(key, current);
      counters.set('http.requests_total', (counters.get('http.requests_total') ?? 0) + 1);
      if (input.statusCode >= 400) {
        counters.set('http.errors_total', (counters.get('http.errors_total') ?? 0) + 1);
      }
    },
    snapshot() {
      return {
        startedAt,
        generatedAt: new Date().toISOString(),
        counters: Object.fromEntries(
          [...counters.entries()].sort(([left], [right]) => left.localeCompare(right))
        ),
        routes: Object.fromEntries(
          [...routes.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([route, stats]) => [
              route,
              {
                ...stats,
                averageLatencyMs: stats.count > 0 ? stats.totalLatencyMs / stats.count : 0,
              },
            ])
        ),
      };
    },
    toPrometheus() {
      const lines = [
        '# HELP bossraid_http_requests_total Total HTTP requests observed by Boss Raid.',
        '# TYPE bossraid_http_requests_total counter',
      ];
      for (const [route, stats] of [...routes.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const [method, ...routeParts] = route.split(' ');
        lines.push(
          `bossraid_http_requests_total{method="${escapeMetricLabel(method)}",route="${escapeMetricLabel(
            routeParts.join(' ')
          )}"} ${stats.count}`
        );
      }

      lines.push(
        '# HELP bossraid_http_request_latency_ms_sum Total HTTP request latency in milliseconds.',
        '# TYPE bossraid_http_request_latency_ms_sum counter'
      );
      for (const [route, stats] of [...routes.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        const [method, ...routeParts] = route.split(' ');
        lines.push(
          `bossraid_http_request_latency_ms_sum{method="${escapeMetricLabel(
            method
          )}",route="${escapeMetricLabel(routeParts.join(' '))}"} ${stats.totalLatencyMs}`
        );
      }

      lines.push(
        '# HELP bossraid_events_total Total named Boss Raid application events.',
        '# TYPE bossraid_events_total counter'
      );
      for (const [name, value] of [...counters.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )) {
        lines.push(`bossraid_events_total{name="${escapeMetricLabel(name)}"} ${value}`);
      }
      return `${lines.join('\n')}\n`;
    },
  };
}

export function escapeMetricLabel(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"').replace(/\n/gu, '\\n');
}
