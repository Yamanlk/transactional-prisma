import { globSync } from "glob";
import { stdout } from "node:process";
import { run } from "node:test";
import { spec } from "node:test/reporters";

run({
  concurrency: true,
  files: globSync("test/**/*.spec.ts"),
})
  .compose(new spec())
  .pipe(stdout);
