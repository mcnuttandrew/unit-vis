import { writeFileSync } from "node:fs";

import fs from "fs";
import path from "path";

const SRC_DIR = path.resolve(__dirname, "../src/specs");

async function main() {
  const specNames = fs
    .readdirSync(SRC_DIR)
    .filter((name) => name.endsWith(".json"));

  writeFileSync("public/specs.json", JSON.stringify(specNames, null, 2));
}

main();
