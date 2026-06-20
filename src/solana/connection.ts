import { Connection } from "@solana/web3.js";
import { env } from "../config/env.js";

let connectionSingleton: Connection | null = null;

export function getConnection(): Connection {
  if (!connectionSingleton) {
    connectionSingleton = new Connection(env.SOLANA_RPC_URL, {
      commitment: "confirmed",
      wsEndpoint: env.SOLANA_WS_URL,
    });
  }
  return connectionSingleton;
}

export async function assertRpcHealthy(): Promise<{
  ok: boolean;
  slot?: number;
  version?: string;
  error?: string;
}> {
  try {
    const connection = getConnection();
    const [slot, version] = await Promise.all([
      connection.getSlot("confirmed"),
      connection.getVersion(),
    ]);
    return {
      ok: true,
      slot,
      version: version["solana-core"],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
