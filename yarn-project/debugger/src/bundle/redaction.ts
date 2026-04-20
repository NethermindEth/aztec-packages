import {
  type AztecAttributeValue,
  type AztecCallFrame,
  type AztecSpan,
  type AztecSpanEvent,
  type AztecTrace,
  type AztecTraceError,
  REDACTION_MANIFEST_SCHEMA_VERSION,
  type RedactionManifest,
  type RedactionPolicy,
} from '@aztec/stdlib/debug';

import { createHmac } from 'node:crypto';

import { deterministicStringify } from './deterministic_json.js';

export type RedactionOutput = {
  /** Mutated deep-clone of the input trace. Undefined in preview mode. */
  trace?: AztecTrace;
  /** Final manifest with paths populated. */
  manifest: RedactionManifest;
  /** Sorted dotted JSONPath-like strings. */
  preservedFields: string[];
  /** Sorted dotted JSONPath-like strings. */
  redactedFields: string[];
};

export type RedactionOptions = {
  /** When true, do not mutate; just compute redacted/preserved field paths. */
  preview?: boolean;
  /** Clock override, primarily for tests. */
  now?: () => string;
};

/** Per the D4 spec, the exact key names of wallet/pxe PII that is dropped entirely. */
const EXACT_DROP_KEYS = new Set<string>([
  'aztec.wallet.from_address',
  'aztec.wallet.target_address',
  'aztec.pxe.args',
  'aztec.pxe.return_values',
]);

/** Regex matching key names whose attribute values are dropped entirely on strict. */
const DROP_KEY_REGEX = /auth_witness|capsule|note|tagging|shared_secret|witness|partial_witness/i;

/** Keys preserved in raw form under `balanced` only. */
const BALANCED_PRESERVED_KEYS = new Set<string>([
  'aztec.tx.origin',
  'aztec.tx.function_selector',
  'aztec.pxe.job_id',
  'aztec.pxe.queue_length_before',
  'aztec.pxe.job_status',
]);

/** Span/frame attribute keys whose integer values remain in the clear under `balanced`. */
const BALANCED_PRESERVED_COUNT_KEYS = new Set<string>([
  'aztec.private.note_hashes.count',
  'aztec.private.nullifiers.count',
]);

/** Internal attribute keys used to populate call-frame argsDigest/returnDigest. */
const ARGS_HASH_KEY = 'aztec.private.args_hash';
const RETURNS_HASH_KEY = 'aztec.private.returns_hash';

export function hmacDigestHex(value: unknown, salt: Buffer): string {
  const payload = deterministicStringify(value);
  return createHmac('sha256', salt).update(payload, 'utf8').digest('hex').slice(0, 32);
}

function shouldDropKey(key: string): boolean {
  return EXACT_DROP_KEYS.has(key) || DROP_KEY_REGEX.test(key);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type WalkContext = {
  policy: RedactionPolicy;
  salt: Buffer;
  preserved: string[];
  redacted: string[];
};

function digestValuePreservingShape(value: AztecAttributeValue, salt: Buffer): AztecAttributeValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return hmacDigestHex(value, salt);
  }
  if (Array.isArray(value)) {
    return value.map(v => digestValuePreservingShape(v, salt));
  }
  const result: Record<string, AztecAttributeValue> = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = digestValuePreservingShape(v, salt);
  }
  return result;
}

/** Redact an attribute map in place according to policy. Returns a new object; caller replaces. */
function redactAttributes(
  attrs: Record<string, AztecAttributeValue> | undefined,
  pathPrefix: string,
  ctx: WalkContext,
): Record<string, AztecAttributeValue> | undefined {
  if (!attrs) {
    return attrs;
  }
  const out: Record<string, AztecAttributeValue> = {};
  const keys = Object.keys(attrs).sort();
  for (const key of keys) {
    const keyPath = `${pathPrefix}.${key}`;
    const value = attrs[key];

    if (ctx.policy === 'local_full') {
      out[key] = value;
      ctx.preserved.push(keyPath);
      continue;
    }

    if (ctx.policy === 'balanced') {
      if (BALANCED_PRESERVED_KEYS.has(key)) {
        out[key] = value;
        ctx.preserved.push(keyPath);
        continue;
      }
      if (BALANCED_PRESERVED_COUNT_KEYS.has(key) && typeof value === 'number') {
        out[key] = value;
        ctx.preserved.push(keyPath);
        continue;
      }
    }

    if (shouldDropKey(key)) {
      ctx.redacted.push(keyPath);
      continue;
    }

    out[key] = digestValuePreservingShape(value, ctx.salt);
    ctx.redacted.push(keyPath);
  }
  return out;
}

function redactSpanEvents(
  events: AztecSpanEvent[] | undefined,
  pathPrefix: string,
  ctx: WalkContext,
): AztecSpanEvent[] | undefined {
  if (!events) {
    return events;
  }
  return events.map((event, i) => {
    const eventPath = `${pathPrefix}[${i}]`;
    if (ctx.policy === 'local_full') {
      ctx.preserved.push(`${eventPath}.name`, `${eventPath}.timestamp`);
      return {
        ...event,
        attributes: redactAttributes(event.attributes, `${eventPath}.attributes`, ctx),
      };
    }
    ctx.redacted.push(`${eventPath}.name`);
    return {
      name: hmacDigestHex(event.name, ctx.salt),
      timestamp: event.timestamp,
      attributes: redactAttributes(event.attributes, `${eventPath}.attributes`, ctx),
    };
  });
}

function redactSpan(span: AztecSpan, index: number, ctx: WalkContext): AztecSpan {
  const base = `spans[${index}]`;
  ctx.preserved.push(
    `${base}.spanId`,
    `${base}.name`,
    `${base}.phase`,
    `${base}.component`,
    `${base}.kind`,
    `${base}.status`,
    `${base}.sensitivity`,
  );

  const newAttributes = redactAttributes(span.attributes, `${base}.attributes`, ctx);
  const newEvents = redactSpanEvents(span.events, `${base}.events`, ctx);
  return { ...span, attributes: newAttributes, events: newEvents };
}

function redactCallFrame(frame: AztecCallFrame, index: number, ctx: WalkContext): AztecCallFrame {
  const base = `callFrames[${index}]`;
  ctx.preserved.push(`${base}.callFrameId`, `${base}.kind`, `${base}.sensitivity`);
  if (frame.contractAddress !== undefined) {
    ctx.preserved.push(`${base}.contractAddress`);
  }
  if (frame.functionSelector !== undefined) {
    ctx.preserved.push(`${base}.functionSelector`);
  }
  if (frame.sourceRef !== undefined) {
    ctx.preserved.push(`${base}.sourceRef`);
  }

  if (ctx.policy === 'local_full') {
    const newAttributes = redactAttributes(frame.attributes, `${base}.attributes`, ctx);
    if (frame.argsDigest !== undefined) {
      ctx.preserved.push(`${base}.argsDigest`);
    }
    if (frame.returnDigest !== undefined) {
      ctx.preserved.push(`${base}.returnDigest`);
    }
    return { ...frame, attributes: newAttributes };
  }

  const attrs = frame.attributes ?? {};
  const argsHashValue = attrs[ARGS_HASH_KEY];
  const returnsHashValue = attrs[RETURNS_HASH_KEY];

  let argsDigest: string | undefined = frame.argsDigest;
  let returnDigest: string | undefined = frame.returnDigest;
  const residualAttrs: Record<string, AztecAttributeValue> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (k === ARGS_HASH_KEY) {
      ctx.redacted.push(`${base}.attributes.${k}`);
      continue;
    }
    if (k === RETURNS_HASH_KEY) {
      ctx.redacted.push(`${base}.attributes.${k}`);
      continue;
    }
    residualAttrs[k] = v;
  }
  if (argsHashValue !== undefined) {
    argsDigest = hmacDigestHex(argsHashValue, ctx.salt);
    ctx.redacted.push(`${base}.argsDigest`);
  }
  if (returnsHashValue !== undefined) {
    returnDigest = hmacDigestHex(returnsHashValue, ctx.salt);
    ctx.redacted.push(`${base}.returnDigest`);
  }

  const newAttributes = redactAttributes(
    Object.keys(residualAttrs).length > 0 ? residualAttrs : undefined,
    `${base}.attributes`,
    ctx,
  );

  return {
    ...frame,
    attributes: newAttributes,
    argsDigest,
    returnDigest,
  };
}

function redactError(err: AztecTraceError, index: number, ctx: WalkContext): AztecTraceError {
  const base = `errors[${index}]`;
  ctx.preserved.push(
    `${base}.errorId`,
    `${base}.code`,
    `${base}.category`,
    `${base}.severity`,
    `${base}.retryable`,
    `${base}.schemaVersion`,
  );
  if (err.errorType !== undefined) {
    ctx.preserved.push(`${base}.errorType`);
  }
  if (err.spanId !== undefined) {
    ctx.preserved.push(`${base}.spanId`);
  }
  if (err.callFrameId !== undefined) {
    ctx.preserved.push(`${base}.callFrameId`);
  }
  if (err.remediationHint !== undefined) {
    ctx.preserved.push(`${base}.remediationHint`);
  }
  if (err.sourceRef !== undefined) {
    ctx.preserved.push(`${base}.sourceRef`);
  }

  if (ctx.policy === 'local_full') {
    ctx.preserved.push(`${base}.message`);
    return { ...err };
  }

  const redactedMessage = hmacDigestHex(err.message, ctx.salt);
  ctx.redacted.push(`${base}.message`);

  let newEvidence: Record<string, AztecAttributeValue> | undefined = undefined;
  if (err.evidence) {
    newEvidence = {};
    for (const [k, v] of Object.entries(err.evidence)) {
      newEvidence[k] = digestValuePreservingShape(v, ctx.salt);
      ctx.redacted.push(`${base}.evidence.${k}`);
    }
  }

  // Drop attributes entirely on strict/balanced.
  if (err.attributes) {
    for (const k of Object.keys(err.attributes)) {
      ctx.redacted.push(`${base}.attributes.${k}`);
    }
  }

  return {
    ...err,
    message: redactedMessage,
    evidence: newEvidence,
    attributes: undefined,
  };
}

function sortUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function buildManifestFields(
  policy: RedactionPolicy,
  salt: Buffer,
  createdAt: string,
  preservedFields: string[],
  redactedFields: string[],
): RedactionManifest {
  return {
    schemaVersion: REDACTION_MANIFEST_SCHEMA_VERSION,
    policy,
    saltHex: salt.toString('hex'),
    digestAlgorithm: 'HMAC-SHA256',
    redactedFields,
    preservedFields,
    createdAt,
  };
}

/**
 * Transforms an input trace by redacting secret_local-sensitive data according
 * to `policy`, returning a deep-cloned trace and a manifest that enumerates
 * every redacted/preserved dotted field path. `preview: true` skips the
 * mutation and returns only the paths.
 */
export function redactTrace(
  input: AztecTrace,
  policy: RedactionPolicy,
  salt: Buffer,
  options: RedactionOptions = {},
): RedactionOutput {
  if (salt.byteLength !== 32) {
    throw new Error(`redactTrace: salt must be exactly 32 bytes (got ${salt.byteLength})`);
  }

  const now = options.now?.() ?? new Date().toISOString();
  const ctx: WalkContext = {
    policy,
    salt,
    preserved: [],
    redacted: [],
  };

  if (policy === 'local_full') {
    const clone = deepClone(input);
    ctx.preserved.push('trace', 'traceId', 'network', 'spans', 'callFrames', 'errors', 'artifacts', 'anchors');
    // Walk top level to record secret_local attribute paths as preserved.
    clone.spans.forEach((span, i) => {
      const updated = redactSpan(span, i, ctx);
      clone.spans[i] = updated;
    });
    clone.callFrames.forEach((frame, i) => {
      const updated = redactCallFrame(frame, i, ctx);
      clone.callFrames[i] = updated;
    });
    clone.errors.forEach((err, i) => {
      const updated = redactError(err, i, ctx);
      clone.errors[i] = updated;
    });
    const preservedFields = sortUnique(ctx.preserved);
    const redactedFields = sortUnique(ctx.redacted);
    const manifest = buildManifestFields(policy, salt, now, preservedFields, redactedFields);
    clone.redaction = manifest;
    return {
      trace: options.preview ? undefined : clone,
      manifest,
      preservedFields,
      redactedFields,
    };
  }

  const clone = deepClone(input);

  // Always preserve these top-level identifiers.
  ctx.preserved.push('traceId', 'schemaVersion', 'network', 'createdAt', 'status', 'anchors.provisionalTraceId');
  if (clone.txHash !== undefined) {
    ctx.preserved.push('txHash', 'anchors.txHash');
  }

  clone.spans = clone.spans.map((span, i) => redactSpan(span, i, ctx));
  clone.callFrames = clone.callFrames.map((frame, i) => redactCallFrame(frame, i, ctx));
  clone.errors = clone.errors.map((err, i) => redactError(err, i, ctx));

  const preservedFields = sortUnique(ctx.preserved);
  const redactedFields = sortUnique(ctx.redacted);
  const manifest = buildManifestFields(policy, salt, now, preservedFields, redactedFields);
  clone.redaction = manifest;

  return {
    trace: options.preview ? undefined : clone,
    manifest,
    preservedFields,
    redactedFields,
  };
}
