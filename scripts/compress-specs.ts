import { readFileSync, writeFileSync } from "node:fs";
import {
  Formatter,
  FracturedJsonOptions,
  EolStyle,
  NumberListAlignment,
  TableCommaPlacement,
} from "fracturedjsonjs";
// import {execSync} from 'node:child_process';

const options = new FracturedJsonOptions();

options.MaxTotalLineLength = 110;
options.MaxInlineComplexity = 3;
options.JsonEolStyle = EolStyle.Crlf;
options.NumberListAlignment = NumberListAlignment.Decimal;
options.TableCommaPlacement = TableCommaPlacement.BeforePadding;
options.MaxPropNamePadding = 16;
options.IndentSpaces = 2;
options.PreserveBlankLines = false;
options.NestedBracketPadding = false;

const formatter = new Formatter();
formatter.Options = options;

async function main() {
  const allSpecs = JSON.parse(readFileSync("apps/playground/public/specs.json", "utf-8"));

  for (const spec of allSpecs) {
    const specFilePath = `apps/playground/src/specs/${spec}`;
    const specFileContent = readFileSync(specFilePath, "utf-8");
    // const specJson = JSON.parse(specFileContent);
    const compressed = formatter.Reformat(specFileContent);
    writeFileSync(specFilePath, compressed, "utf-8");
  }
}

main();
