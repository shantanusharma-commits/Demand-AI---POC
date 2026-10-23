// Configuration as stored in config_versions.body: the engine's CONFIG with regular expressions written as
// { regex, flags } so it is plain JSON. Config v1 is today's engine defaults (D-13: fixed for the pilot).
import { CONFIG } from '../demandai-engine.ts';

/** Bumped whenever an engine rule changes results; stamped on every stored run with the config version. */
export const ENGINE_VERSION = 'ts-1.12.0';

export type SerializedRegex = { regex: string; flags: string };

export function serializeConfig(config: typeof CONFIG = CONFIG): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config, (_key, value) => (value instanceof RegExp ? { regex: value.source, flags: value.flags } : value)));
}

export function deserializeRegex(r: SerializedRegex): RegExp {
  return new RegExp(r.regex, r.flags);
}
