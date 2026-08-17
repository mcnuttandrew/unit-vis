/**
 * The example specs are plain JSON documents in `specs/` at the top of the
 * repository, so the app, the packages and the test suite all read the same
 * files rather than one of them owning them. Globbing rather than listing means
 * adding an example is dropping a file in -- there is no import list to fall out
 * of sync with what is on disk.
 */
import type {Spec} from '@unit-vis/core';

const specs = import.meta.glob<Spec>('../../../specs/*.json', {eager: true, import: 'default'});

// The same files a second time, unparsed. The editor opens on this rather than
// on a re-stringify of the parsed value, so what it shows is byte-for-byte the
// file on disk -- key order and spacing included.
const sources = import.meta.glob<string>('../../../specs/*.json', {eager: true, query: '?raw', import: 'default'});

export interface SpecOption {
  name: string;
  spec: Spec;
  /** The file's own text, as authored. */
  text: string;
}

export const options: SpecOption[] = Object.entries(specs)
  .map(([path, spec]) => ({
    name: path.split('/').pop()!.replace(/\.json$/, ''),
    spec,
    text: sources[path],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Named rather than positional so adding specs to `options` cannot move it. */
export const defaultSpecName = 'default1';

/** What the editor starts on, so the initial view matches the selected option. */
export const defaultSpecText = options.find(o => o.name === defaultSpecName)!.text;
