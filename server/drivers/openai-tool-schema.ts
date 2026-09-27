// Tool parameters for a custom OpenAI-compatible chat-completions request.
//
// The chat runtime compiles every MCP input schema with Ajv before the turn
// can start. Keywords Ajv's strict draft-07 compiler does not know
// (prefixItems, unevaluatedProperties, unresolved $ref, unknown annotations)
// abort the turn with "MCP tool schema could not be validated" before any
// provider sees the request. DeepSeek's documented function-calling subset
// (https://api-docs.deepseek.com/guides/tool_calls) also rejects several
// constructs Ajv would accept: minLength/maxLength, minItems/maxItems,
// oneOf/allOf, $defs/$ref (they spell the container $def), and format values
// other than email, hostname, ipv4, ipv6, and uuid.
//
// This rewrite is what the model is told and what we check before calling
// the tool. The MCP server still validates the call against its own schema.
// Optional fields stay optional — marking every property required, as
// DeepSeek strict mode does, would make computer tools unusable.
import { providerSafeInputSchema } from "../mcp-tool-schema.ts";

type Json = Record<string, unknown>;

const FORMATS = new Set(["email", "hostname", "ipv4", "ipv6", "uuid"]);
const KEEP = [
  "type", "description", "title", "properties", "required", "items", "anyOf",
  "enum", "const", "pattern", "format", "minimum", "maximum", "exclusiveMinimum",
  "exclusiveMaximum", "multipleOf", "default", "additionalProperties",
] as const;

function isObject(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function decodePointer(part: string): string {
  return part.replace(/~1/g, "/").replace(/~0/g, "~");
}

function collectDefs(node: unknown, defs: Map<string, Json>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectDefs(item, defs);
    return;
  }
  if (!isObject(node)) return;
  for (const key of ["$defs", "$def", "definitions"] as const) {
    const block = node[key];
    if (!isObject(block)) continue;
    for (const [name, value] of Object.entries(block)) {
      if (isObject(value) && !defs.has(name)) defs.set(name, value);
    }
  }
  for (const value of Object.values(node)) collectDefs(value, defs);
}

function pointer(root: Json, ref: string, defs: Map<string, Json>): Json | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/").map(decodePointer);
  const head = parts[0];
  let current: unknown;
  if (head === "$defs" || head === "$def" || head === "definitions") {
    current = parts[1] ? defs.get(parts[1]) : undefined;
    parts.splice(0, 2);
  } else {
    current = root;
  }
  for (const part of parts) {
    if (Array.isArray(current) && /^\d+$/.test(part)) current = current[Number(part)];
    else if (isObject(current)) current = current[part];
    else return undefined;
  }
  return isObject(current) ? current : undefined;
}

function inlineRefs(node: unknown, root: Json, defs: Map<string, Json>, stack: string[]): unknown {
  if (Array.isArray(node)) return node.map((item) => inlineRefs(item, root, defs, stack));
  if (!isObject(node)) return node;
  if (typeof node.$ref === "string") {
    const ref = node.$ref;
    const { $ref: _ref, ...siblings } = node;
    if (!ref.startsWith("#/") || stack.includes(ref)) return inlineRefs(siblings, root, defs, stack);
    const target = pointer(root, ref, defs);
    if (!target) return inlineRefs(siblings, root, defs, stack);
    return inlineRefs({ ...clone(target), ...siblings }, root, defs, [...stack, ref]);
  }
  const next: Json = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$defs" || key === "$def" || key === "definitions") continue;
    next[key] = inlineRefs(value, root, defs, stack);
  }
  return next;
}

function mergeAllOf(base: Json, branch: Json): Json {
  const merged: Json = { ...base };
  if (isObject(branch.properties)) {
    merged.properties = { ...(isObject(base.properties) ? base.properties : {}), ...branch.properties };
  }
  if (Array.isArray(branch.required)) {
    const required = new Set<string>([
      ...(Array.isArray(base.required) ? base.required.filter((key) => typeof key === "string") : []),
      ...branch.required.filter((key) => typeof key === "string"),
    ]);
    if (required.size) merged.required = [...required];
  }
  if (Array.isArray(branch.anyOf)) merged.anyOf = [...asBranches(base.anyOf), ...asBranches(branch.anyOf)];
  for (const key of KEEP) {
    if (key === "properties" || key === "required" || key === "anyOf" || key === "items") continue;
    if (merged[key] === undefined && branch[key] !== undefined) merged[key] = branch[key];
  }
  return merged;
}

function asBranches(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** A schema Ajv can compile and DeepSeek's chat-completions tools accept.
 * The input is never mutated. */
export function openAICompatToolSchema(schema: unknown): Json {
  const source = isObject(schema) ? clone(schema) : {};
  const defs = new Map<string, Json>();
  collectDefs(source, defs);
  const inlined = inlineRefs(source, source, defs, []);
  const rooted = providerSafeInputSchema(inlined);
  const normalized = normalize(rooted);
  if (!isObject(normalized) || normalized.type !== "object") return { type: "object", properties: {} };
  return normalized;
}

function normalize(node: unknown): unknown {
  if (Array.isArray(node)) return node.map((item) => normalize(item));
  if (!isObject(node)) return node;
  let schema: Json = { ...node };

  if (Array.isArray(schema.oneOf)) {
    schema.anyOf = [...asBranches(schema.anyOf), ...asBranches(schema.oneOf)];
    delete schema.oneOf;
  }
  if (Array.isArray(schema.allOf)) {
    for (const branch of asBranches(schema.allOf)) {
      const normalized = normalize(branch);
      if (isObject(normalized)) schema = mergeAllOf(schema, normalized);
    }
    delete schema.allOf;
  }
  if (Array.isArray(schema.prefixItems)) {
    const parts = schema.prefixItems.filter(isObject);
    if (parts.length && schema.items === undefined) schema.items = parts.length === 1 ? parts[0] : { anyOf: parts };
    delete schema.prefixItems;
  }
  if (Array.isArray(schema.items)) {
    const parts = schema.items.filter(isObject);
    schema.items = parts.length === 1 ? parts[0] : { anyOf: parts };
  }
  if (schema.nullable === true) {
    const { nullable: _nullable, ...rest } = schema;
    return normalize({ anyOf: [rest, { type: "null" }] });
  }
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((item) => typeof item === "string");
    const { type: _type, ...rest } = schema;
    return normalize({ anyOf: types.map((type) => ({ ...rest, type })) });
  }
  if (Array.isArray(schema.enum) && !schema.enum.every((item) => typeof item === "string")) {
    const strings = schema.enum.filter((item) => typeof item === "string");
    const numbers = schema.enum.filter((item) => typeof item === "number");
    const branches: Json[] = [];
    if (strings.length) branches.push({ type: "string", enum: strings });
    for (const value of numbers) branches.push({ type: "number", const: value });
    if (schema.enum.some((item) => typeof item === "boolean")) branches.push({ type: "boolean" });
    if (schema.enum.some((item) => item === null)) branches.push({ type: "null" });
    const { enum: _enum, ...rest } = schema;
    return normalize(branches.length === 1 ? { ...rest, ...branches[0] } : { ...rest, anyOf: branches });
  }
  if ("const" in schema && typeof schema.const !== "string" && typeof schema.const !== "number") {
    if (typeof schema.const === "boolean" && schema.type === undefined) schema.type = "boolean";
    delete schema.const;
  }
  if (typeof schema.format === "string" && !FORMATS.has(schema.format)) delete schema.format;
  for (const key of ["exclusiveMinimum", "exclusiveMaximum", "minimum", "maximum", "multipleOf"] as const) {
    if (key in schema && typeof schema[key] !== "number") delete schema[key];
  }
  if ("default" in schema && schema.default !== null && !["string", "number", "boolean"].includes(typeof schema.default)) delete schema.default;
  if ("additionalProperties" in schema && typeof schema.additionalProperties !== "boolean") delete schema.additionalProperties;
  if (Array.isArray(schema.required)) {
    const required = schema.required.filter((key) => typeof key === "string");
    if (required.length) schema.required = required;
    else delete schema.required;
  }
  if (isObject(schema.properties)) {
    const properties: Json = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      const normalized = normalize(value);
      properties[key] = isObject(normalized) ? normalized : {};
    }
    schema.properties = properties;
  }
  if (schema.items !== undefined) schema.items = normalize(schema.items);
  if (Array.isArray(schema.anyOf)) schema.anyOf = schema.anyOf.map((item) => normalize(item));

  const kept: Json = {};
  for (const key of KEEP) if (key in schema) kept[key] = schema[key];
  return kept;
}
