// site.config.json: where each piece opens, and the contact links. Validated, because a typo in a
// URL should fail the build rather than ship a dead desk.

import * as v from 'valibot';
import { PIECE_IDS, type PieceId } from './pieces';

const Url = v.pipe(
  v.string(),
  v.check((s) => /^https?:\/\/[^\s]+$/.test(s) || /^\/[^\s/][^\s]*$/.test(s), 'must be an http(s) URL or a site path'),
);

const ConfigSchema = v.object({
  pieces: v.strictObject(Object.fromEntries(PIECE_IDS.map((id) => [id, Url])) as Record<PieceId, typeof Url>),
  cv: Url,
  email: v.pipe(v.string(), v.email()),
  linkedin: v.pipe(v.string(), v.url()),
});

export type SiteConfig = v.InferOutput<typeof ConfigSchema>;

export function parseConfig(input: unknown): SiteConfig {
  const result = v.safeParse(ConfigSchema, input);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path?.map((p) => String(p.key)).join('.') ?? '(root)';
    throw new Error(`site.config.json is invalid at ${path}: ${issue?.message ?? 'unknown problem'}`);
  }
  return result.output;
}
