import { z } from 'zod';

/**
 * JSON-safe attribute value type used throughout debugger schemas. Restricted
 * to values that survive JSON.stringify/JSON.parse without data loss: no
 * bigints, buffers, Dates, class instances, functions, or undefined.
 */
export type AztecAttributeValue =
  | string
  | number
  | boolean
  | null
  | AztecAttributeValue[]
  | { [key: string]: AztecAttributeValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const PlainRecordSchema: z.ZodType<{ [key: string]: AztecAttributeValue }> = z
  .custom<{ [key: string]: AztecAttributeValue }>(isPlainObject, {
    message: 'Expected a plain object',
  })
  .superRefine((value, ctx) => {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const result = AztecAttributeValueSchema.safeParse(entry);
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({ ...issue, path: [key, ...issue.path] });
        }
      }
    }
  });

/**
 * Zod schema enforcing the JSON-safe attribute constraint. Uses a recursive
 * union; rejects bigints, buffers, dates, class instances, functions, and
 * undefined. Numbers must be finite.
 */
export const AztecAttributeValueSchema: z.ZodType<AztecAttributeValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().refine(n => Number.isFinite(n), { message: 'Must be a finite number' }),
    z.boolean(),
    z.null(),
    z.array(AztecAttributeValueSchema),
    PlainRecordSchema,
  ]),
);

/** Plain record of JSON-safe attribute values. */
export type AztecAttributeMap = Record<string, AztecAttributeValue>;

/** Zod schema for an attribute map. */
export const AztecAttributeMapSchema: z.ZodType<AztecAttributeMap> = PlainRecordSchema;
