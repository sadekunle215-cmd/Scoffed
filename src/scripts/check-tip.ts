import { calculateDynamicTip } from "../tips/tip-engine.js";

const tip = await calculateDynamicTip();
console.log(JSON.stringify(tip, null, 2));
