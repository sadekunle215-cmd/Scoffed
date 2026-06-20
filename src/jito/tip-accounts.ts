import { env } from "../config/env.js";

let cachedAccounts: string[] = [];
let cachedAt = 0;

/**
 * Fetches the current set of Jito tip accounts directly from the Block
 * Engine's getTipAccounts RPC method, with a short-lived cache. This is
 * live data from Jito itself, not a hardcoded address list baked into
 * the repo — tip accounts have rotated before and a stale hardcoded
 * list would silently break bundle submission.
 */
export async function getJitoTipAccounts(): Promise<string[]> {
  const isFresh = Date.now() - cachedAt < env.JITO_TIP_ACCOUNTS_REFRESH_MS;
  if (isFresh && cachedAccounts.length > 0) {
    return cachedAccounts;
  }

  const response = await fetch(`${env.JITO_BLOCK_ENGINE_URL}/api/v1/bundles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTipAccounts",
      params: [],
    }),
  });

  if (!response.ok) {
    throw new Error(`getTipAccounts HTTP ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as { result?: string[]; error?: unknown };
  if (!body.result || body.result.length === 0) {
    throw new Error(`getTipAccounts returned no accounts: ${JSON.stringify(body)}`);
  }

  cachedAccounts = body.result;
  cachedAt = Date.now();
  return cachedAccounts;
}

export function pickRandomTipAccount(accounts: string[]): string {
  if (accounts.length === 0) {
    throw new Error("No Jito tip accounts available to pick from.");
  }
  return accounts[Math.floor(Math.random() * accounts.length)];
}
