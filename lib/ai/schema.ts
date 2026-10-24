// Structured outputs (D-44): the JSON Schema a provider enforces while the model writes, made from the capability's
// zod schema. Strict mode takes a subset of JSON Schema: every object closed (additionalProperties false) with every
// field required, and few constraint keywords. So the shape goes to the model and the constraints (lengths, counts,
// ranges) stay with zod, which still checks every reply. A schema strict mode can't express (an optional field, an
// open record) returns null, and the call uses JSON mode instead.
import { z, type ZodType } from 'zod';

type Node = Record<string, unknown>;
// Shape keywords strict mode understands; everything else is dropped (constraints) or refused (structure).
const SHAPE = ['type', 'properties', 'required', 'items', 'enum', 'const', 'anyOf', 'description'];
const STRUCTURE = ['$ref', 'allOf', 'oneOf', 'not', 'if', 'then', 'else', 'patternProperties', 'propertyNames', 'prefixItems', 'dependentSchemas'];

function strictNode(n: unknown): Node | null {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
  const src = n as Node;
  if (STRUCTURE.some(k => k in src)) return null;
  if (src.additionalProperties !== undefined && src.additionalProperties !== false) return null;
  const out: Node = {};
  for (const k of SHAPE) if (k in src) out[k] = src[k];
  if (Array.isArray(src.anyOf)) {
    const parts: Node[] = [];
    for (const a of src.anyOf) {
      const s = strictNode(a);
      if (!s) return null;
      // zod nests unions inside a nullable union; strict mode takes them flat.
      if (Array.isArray(s.anyOf) && Object.keys(s).length === 1) parts.push(...(s.anyOf as Node[])); else parts.push(s);
    }
    out.anyOf = parts;
  }
  if (src.type === 'object') {
    const props = (src.properties ?? {}) as Record<string, unknown>, keys = Object.keys(props);
    const required = Array.isArray(src.required) ? (src.required as string[]) : [];
    if (keys.some(k => !required.includes(k))) return null;
    const properties: Record<string, Node> = {};
    for (const k of keys) {
      const s = strictNode(props[k]);
      if (!s) return null;
      properties[k] = s;
    }
    return { type: 'object', additionalProperties: false, required: keys, properties };
  }
  if (src.type === 'array') {
    const items = strictNode(src.items);
    if (!items) return null;
    out.items = items;
  }
  return out;
}

/** The strict JSON Schema for a reply, or null when strict mode can't express it (the call then uses JSON mode). */
export function strictSchema(schema: ZodType): Record<string, unknown> | null {
  let js: unknown;
  try {
    js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'throw' });
  } catch {
    return null;
  }
  const root = strictNode(js);
  return root && root.type === 'object' ? root : null;
}
