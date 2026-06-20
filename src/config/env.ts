import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const EnvSchema = z.object({
  NETWORK: z.enum(["devnet", "mainnet"]).default("devnet"),

  WALLET_KEYPAIR_PATH: z.string().default("./wallet.json"),

  SOLANA_RPC_URL: z.string().url(),
  SOLANA_WS_URL: z.string().url(),

  JITO_BLOCK_ENGINE_URL: z.string().url(),
  JITO_TIP_ACCOUNTS_REFRESH_MS: z.coerce.number().default(60_000),

  SLOT_STREAM_SOURCE: z
    .enum(["yellowstone", "yellowstone_grpcurl", "solana_ws"])
    .default("solana_ws"),
  YELLOWSTONE_GRPC_ENDPOINT: z.string().optional().default(""),
  YELLOWSTONE_GRPC_TOKEN: z.string().optional().default(""),
  YELLOWSTONE_COMMITMENT: z
    .enum(["processed", "confirmed", "finalized"])
    .default("processed"),
  STREAM_EVIDENCE_EVENT_COUNT: z.coerce.number().default(25),
  STREAM_RECONNECT_MAX_ATTEMPTS: z.coerce.number().default(5),
  STREAM_RECONNECT_BACKOFF_MS: z.coerce.number().default(1000),

  TIP_FEE_SAMPLE_SIZE: z.coerce.number().default(20),
  TIP_PERCENTILE: z.coerce.number().default(75),
  TIP_FLOOR_LAMPORTS_ABSOLUTE_MIN: z.coerce.number().default(1000),

  COMPUTE_UNIT_LIMIT: z.coerce.number().default(200_000),
  PRIORITY_FEE_MICRO_LAMPORTS: z.coerce.number().default(200_000),
  BUNDLE_STATUS_TIMEOUT_MS: z.coerce.number().default(45_000),
  BUNDLE_STATUS_POLL_INTERVAL_MS: z.coerce.number().default(1500),

  OPENAI_API_KEY: z.string().optional().default(""),
  AGENT_MODEL: z.string().default("gpt-4o"),

  EVIDENCE_PROFILE: z.string().default("dev"),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
