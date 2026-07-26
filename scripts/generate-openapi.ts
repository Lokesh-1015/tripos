import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract } from '@tripos/shared/contracts';

/**
 * Emits docs/api/openapi.json from the shared contract.
 *
 * The OpenAPI document is a BUILD ARTEFACT, never hand-edited (CLAUDE.md §5). It
 * exists so future native apps and any third-party consumer have a language-
 * agnostic description of the API — the reason ADR-0004 chose REST + OpenAPI over
 * tRPC. Regenerate with `pnpm api:docs` and commit the result so reviewers can
 * see API changes in the diff.
 */
const OUTPUT = join(process.cwd(), 'docs', 'api', 'openapi.json');

async function main(): Promise<void> {
  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  });

  const document = await generator.generate(contract, {
    info: {
      title: 'TripOS API',
      version: '0.1.0',
      description:
        'Generated from libs/shared/contracts. Do not edit by hand — run `pnpm api:docs`.',
    },
    servers: [{ url: 'http://localhost:3000/api', description: 'Local development' }],
  });

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths ?? {}).length;
  console.log(`Wrote ${OUTPUT} (${pathCount} path${pathCount === 1 ? '' : 's'})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
