// `node --import ./scripts/test-alias.mjs --test …` — see test-alias-hooks.mjs.
import { register } from "node:module";
register("./test-alias-hooks.mjs", import.meta.url);
