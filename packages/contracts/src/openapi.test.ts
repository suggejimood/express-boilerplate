import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument, healthResponseSchema, OpenAPIRegistry } from './index.js';

describe('generateOpenApiDocument', () => {
  const registry = new OpenAPIRegistry();
  registry.register('HealthResponse', healthResponseSchema);
  registry.registerPath({
    method: 'get',
    path: '/health',
    summary: 'Liveness probe',
    responses: {
      200: {
        description: 'Service is up',
        content: { 'application/json': { schema: healthResponseSchema } },
      },
    },
  });

  const document = generateOpenApiDocument({ info: { title: 'API', version: '1.0.0' } }, registry);

  it('produces an OpenAPI 3.1 document', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.info).toEqual({ title: 'API', version: '1.0.0' });
  });

  it('references registered schemas as components', () => {
    expect(document.components?.schemas?.HealthResponse).toMatchObject({
      type: 'object',
      required: ['status', 'service', 'uptime'],
    });
    const response = document.paths?.['/health']?.get?.responses?.['200'];
    expect(JSON.stringify(response)).toContain('#/components/schemas/HealthResponse');
  });

  it('keeps runtime validation intact', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'ok', service: 'api', uptime: 1 }).success,
    ).toBe(true);
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });
});
