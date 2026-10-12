import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Adds `.openapi({ ... })` to zod schemas. Runs once; every package shares the same zod copy.
extendZodWithOpenApi(z);

export { z };

/**
 * Shared registry. Each service registers its schemas (`registry.register`) and routes
 * (`registry.registerPath`) and then calls generateOpenApiDocument().
 */
export const registry = new OpenAPIRegistry();

type DocumentConfig = Parameters<OpenApiGeneratorV31['generateDocument']>[0];
/** Everything the generator accepts except the spec version (info, servers, tags, security…). */
export type OpenApiDocumentConfig = Omit<DocumentConfig, 'openapi'>;
export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

/** OpenAPI 3.1 document from a registry (defaults to the shared one). */
export function generateOpenApiDocument(
  config: OpenApiDocumentConfig,
  source: OpenAPIRegistry = registry,
): OpenApiDocument {
  return new OpenApiGeneratorV31(source.definitions).generateDocument({
    openapi: '3.1.0',
    ...config,
  });
}

export { OpenAPIRegistry };
