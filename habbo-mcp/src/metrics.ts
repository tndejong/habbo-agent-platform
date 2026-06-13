import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const toolCallsTotal = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total MCP tool calls grouped by tool and outcome',
  labelNames: ['tool', 'outcome'] as const,
  registers: [registry],
});

export const toolCallDuration = new Histogram({
  name: 'mcp_tool_call_duration_seconds',
  help: 'Latency of MCP tool calls',
  labelNames: ['tool'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const rconErrorsTotal = new Counter({
  name: 'mcp_rcon_errors_total',
  help: 'RCON failures grouped by error kind',
  labelNames: ['kind'] as const,
  registers: [registry],
});

export const rconCallDuration = new Histogram({
  name: 'mcp_rcon_call_duration_seconds',
  help: 'Latency of RCON commands',
  labelNames: ['key', 'outcome'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export async function renderMetrics(): Promise<{ contentType: string; body: string }> {
  return {
    contentType: registry.contentType,
    body: await registry.metrics(),
  };
}
