import { checkLeaderWindow } from "../leaders/leader-window.js";

const result = await checkLeaderWindow();
console.log(JSON.stringify(result, null, 2));
