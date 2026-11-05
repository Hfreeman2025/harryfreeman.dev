// hosting.config.json: where the public site lives and whether search engines may index it. Validated,
// so a typo fails the build rather than shipping the wrong origin or the wrong indexing.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';

const HostingSchema = v.object({
  origin: v.pipe(
    v.string(),
    v.url(),
    v.check((s) => /^https:\/\/[a-z0-9.-]+$/.test(s), 'must be an https:// origin with no path or trailing slash'),
  ),
  project: v.pipe(v.string(), v.regex(/^[a-z0-9][a-z0-9-]{0,57}$/, 'must be a Cloudflare Pages project name')),
  branch: v.literal('main'),
  SITE_INDEXABLE: v.boolean(),
});

export type HostingConfig = v.InferOutput<typeof HostingSchema>;

export function parseHostingConfig(input: unknown): HostingConfig {
  const result = v.safeParse(HostingSchema, input);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path?.map((p) => String(p.key)).join('.') ?? '(root)';
    throw new Error(`hosting.config.json is invalid at ${path}: ${issue?.message ?? 'unknown problem'}`);
  }
  return result.output;
}

export function readHostingConfig(root: string): HostingConfig {
  return parseHostingConfig(JSON.parse(readFileSync(join(root, 'hosting.config.json'), 'utf8')));
}
