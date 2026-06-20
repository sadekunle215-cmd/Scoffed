import { learnObservedJitoLeaders } from "../leaders/observed-jito-leaders.js";

const result = await learnObservedJitoLeaders();
console.log(`Observed Jito-landing leaders updated: ${result.identities.length} identities.`);
console.log(JSON.stringify(result, null, 2));
