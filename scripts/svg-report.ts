/**
 * Renders every example spec through both backends and writes a comparison
 * report plus the SVGs themselves to `test/__output__/`.
 *
 *   yarn report:svg              # sampled rows, fast
 *   yarn report:svg --full       # every row of every dataset
 *   yarn report:svg --rows 500   # explicit sample size
 *
 * Run it to see, spec by spec, where the vega backend and the old backend
 * disagree. The tests assert on the same numbers; this prints them.
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';

// The old backend draws through d3-selection, which needs a live document.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const globals = globalThis as unknown as {window: unknown; document: unknown};
globals.window = dom.window;
globals.document = dom.window.document;
// `navigator` is a getter-only global in modern node, so leave it alone.

const {buildSceneForSpec, renderOld, renderVegaHeadless, REPO_ROOT} = await import('../test/harness/render');
const {modelFromOldSvg, modelFromVegaSvg} = await import('../test/harness/svg-model');
const {compare, formatComparison, formatQuality, inspect} = await import('../test/harness/compare');
// The report is a backend comparison, so it runs on the specs both backends
// draw -- see `PARITY_SPECS`.
const {PARITY_SPECS} = await import('../test/harness/specs');

const args = process.argv.slice(2);
const full = args.includes('--full');
const rowsFlag = args.indexOf('--rows');
const sampleSize = full ? undefined : rowsFlag >= 0 ? Number(args[rowsFlag + 1]) : 120;

const outDir = join(REPO_ROOT, 'test/__output__');
mkdirSync(outDir, {recursive: true});

const lines: string[] = [
  '# unit-vis backend comparison',
  '',
  `Rows per spec: ${sampleSize ?? 'all'}`,
  '',
  '| spec | rows | units old/vega | boxes old/vega | max center drift | max size error | position | fill | color classes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
const details: string[] = [];
const failures: string[] = [];

for (const {name, spec} of PARITY_SPECS) {
  try {
    const scene = buildSceneForSpec(spec, sampleSize);
    const oldSvg = renderOld(scene);
    const vegaSvg = await renderVegaHeadless(scene);
    writeFileSync(join(outDir, `${name}.old.svg`), oldSvg);
    writeFileSync(join(outDir, `${name}.vega.svg`), vegaSvg);

    const oldModel = modelFromOldSvg(oldSvg);
    const vegaModel = modelFromVegaSvg(vegaSvg);
    const report = compare(oldModel, vegaModel);
    const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
    lines.push(
      `| ${name} | ${scene.data.length} | ${report.counts.leftUnits}/${report.counts.rightUnits} ` +
        `| ${report.counts.leftBoxes}/${report.counts.rightBoxes} ` +
        `| ${report.centerDistance.max.toFixed(3)} | ${report.sizeError.max.toFixed(3)} ` +
        `| ${pct(report.positionAgreement)} | ${pct(report.fillAgreement)} | ${report.colorPartitionMatches} |`,
    );
    details.push(
      [
        `## ${name}`,
        '```',
        formatComparison(name, report),
        formatQuality('old', inspect(oldModel)),
        formatQuality('vega', inspect(vegaModel)),
        '```',
      ].join('\n'),
    );
  } catch (error) {
    lines.push(`| ${name} | - | - | - | - | - | - | - | threw |`);
    failures.push(`## ${name}\n\n\`\`\`\n${(error as Error).stack ?? String(error)}\n\`\`\``);
  }
}

const body = [
  ...lines,
  '',
  failures.length ? `## specs that threw\n\n${failures.join('\n\n')}` : '',
  '',
  ...details,
].join('\n');

writeFileSync(join(outDir, 'report.md'), body);
process.stdout.write(`${lines.slice(4).join('\n')}\n\nwrote ${outDir}/report.md\n`);
