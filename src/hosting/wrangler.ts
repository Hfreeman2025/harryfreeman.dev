// What the deploy script reads from wrangler, validated: who it is logged in as (a positive allowlist
// of exactly one email), the projects that exist, and where a deployment landed.

import * as v from 'valibot';

const Whoami = v.object({
  loggedIn: v.literal(true),
  email: v.pipe(v.string(), v.email()),
  accounts: v.array(v.looseObject({ id: v.pipe(v.string(), v.regex(/^[0-9a-f]{32}$/)), name: v.string() })),
});

export interface Account {
  readonly email: string;
  readonly id: string;
  readonly name: string;
}

/**
 * The account to deploy to, from `wrangler whoami --json`, only when its email is exactly the allowed
 * one and it has exactly one account. Anything else, including output that is not what it expects,
 * is a refusal with the reason.
 */
export function allowedAccount(whoamiJson: string, allowedEmail: string): Account {
  let parsed: unknown;
  try {
    parsed = JSON.parse(whoamiJson);
  } catch {
    throw new Error('wrangler whoami did not answer in JSON: is wrangler logged in? (npx wrangler login)');
  }
  const result = v.safeParse(Whoami, parsed);
  if (!result.success) throw new Error('wrangler is not logged in with a user email (an API token or no login): refusing');
  const { email, accounts } = result.output;
  if (email !== allowedEmail) throw new Error(`wrangler is logged in as ${email}, not ${allowedEmail}: refusing`);
  const [account, ...others] = accounts;
  if (!account || others.length) throw new Error(`${email} has ${accounts.length} Cloudflare accounts; expected exactly one: refusing`);
  return { email, id: account.id, name: account.name };
}

const Projects = v.array(v.looseObject({ 'Project Name': v.string() }));

/** Project names from `wrangler pages project list --json`. */
export function projectNames(listJson: string): string[] {
  return v.parse(Projects, JSON.parse(listJson)).map((p) => p['Project Name']);
}

/** The deployment's own URL from `wrangler pages deploy`. */
export function deploymentUrl(output: string): string | null {
  return /Take a peek over at (https:\/\/\S+)/.exec(output)?.[1]?.replace(/[.,]$/, '') ?? null;
}
