import { env } from "../config/env.js";

const redacted = { ...env, OPENAI_API_KEY: env.OPENAI_API_KEY ? "(set)" : "(unset)" };
console.log(JSON.stringify(redacted, null, 2));
