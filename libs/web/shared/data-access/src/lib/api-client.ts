import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { contract } from '@tripos/shared/contracts';

/**
 * Typed API client.
 *
 * Every method, argument, and return type is derived from the shared contract —
 * there is no hand-written client and no code generation step, so the frontend
 * cannot disagree with the backend about a shape (ADR-0004, ADR-0009).
 *
 * `OpenAPILink` (rather than the RPC link) keeps real REST semantics on the wire,
 * which is what preserves the future native-app and third-party paths the PRD
 * asks for in §7 and §15.
 */
export type ApiClient = ContractRouterClient<typeof contract>;

export interface CreateApiClientOptions {
  /** Base URL of the API, including the `/api` prefix. */
  baseUrl: string;
  /**
   * Extra headers per request — this is where the Clerk session token goes once
   * authenticated calls arrive in M1.
   */
  headers?: () => Promise<Record<string, string>> | Record<string, string>;
}

export function createApiClient({ baseUrl, headers }: CreateApiClientOptions): ApiClient {
  // `headers` is spread conditionally rather than passed as possibly-undefined:
  // `exactOptionalPropertyTypes` distinguishes "absent" from "present but
  // undefined", and oRPC's options type only accepts the former.
  const link = new OpenAPILink(contract, {
    url: baseUrl,
    ...(headers ? { headers } : {}),
  });

  return createORPCClient(link);
}
