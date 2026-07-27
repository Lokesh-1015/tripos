import { pollsContract } from './polls.contract';
import { systemContract } from './system.contract';
import { tripsContract } from './trips.contract';

/**
 * The root API contract.
 *
 * Every domain adds one namespace here as it lands — `trips`, `expenses`,
 * `polls`, and so on. This object is the single description of the whole HTTP
 * surface: the Nest implementation is type-checked against it, the frontend
 * client is generated from it, and `docs/api/openapi.json` is emitted from it.
 *
 * Because it is the only thing `scope:web` and `scope:api` may share
 * (CLAUDE.md §4), it must stay free of any server- or browser-specific imports.
 */
export const contract = {
  system: systemContract,
  trips: tripsContract,
  polls: pollsContract,
};

export type AppContract = typeof contract;
