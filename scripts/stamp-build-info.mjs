import { writeFileSync, readFileSync } from "node:fs";
const sha = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(sha ?? "")) throw new Error("Expected full source commit SHA");
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
writeFileSync(new URL("../src/buildInfo.ts", import.meta.url),
  `export const buildInfo = ${JSON.stringify({ sourceCommit: sha, version, channel: "clouddebug" })};\n`);
