/**
 * Reading rows in, without `d3-dsv` or `d3-fetch`.
 *
 * The csv parser is a port of d3-dsv's, kept faithful because the example
 * datasets rely on its behavior: quoted fields carry commas (`"Allen, Miss.
 * Elisabeth Walton"`), and a short or empty field reads as `""` rather than
 * `undefined`, which is what the layout engine's `== ''` tests for a missing
 * value are written against.
 */
import type {DataRow} from './types.js';

const QUOTE = 34;
const NEWLINE = 10;
const RETURN = 13;
const COMMA = 44;

/** Sentinels, distinguishable from any string a field could hold. */
const EOL = Symbol('end of line');
const EOF = Symbol('end of file');

type Token = string | typeof EOL | typeof EOF;

/** Splits csv text into rows of raw string fields, unescaping quoted ones. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let N = text.length;
  let I = 0;
  let eof = N <= 0;
  let eol = false;

  // A trailing newline ends the last row rather than starting an empty one.
  if (text.charCodeAt(N - 1) === NEWLINE) {
    --N;
  }
  if (text.charCodeAt(N - 1) === RETURN) {
    --N;
  }

  function token(): Token {
    if (eof) {
      return EOF;
    }
    if (eol) {
      eol = false;
      return EOL;
    }

    const j = I;
    let i: number;
    let c: number;

    // A quoted field runs to the next lone quote; a doubled quote is a literal
    // one, so the scan skips over pairs.
    if (text.charCodeAt(j) === QUOTE) {
      while ((I++ < N && text.charCodeAt(I) !== QUOTE) || text.charCodeAt(++I) === QUOTE) {
        // scanning
      }
      if ((i = I) >= N) {
        eof = true;
      } else if ((c = text.charCodeAt(I++)) === NEWLINE) {
        eol = true;
      } else if (c === RETURN) {
        eol = true;
        if (text.charCodeAt(I) === NEWLINE) {
          ++I;
        }
      }
      return text.slice(j + 1, i - 1).replace(/""/g, '"');
    }

    while (I < N) {
      c = text.charCodeAt((i = I++));
      if (c === NEWLINE) {
        eol = true;
      } else if (c === RETURN) {
        eol = true;
        if (text.charCodeAt(I) === NEWLINE) {
          ++I;
        }
      } else if (c !== COMMA) {
        continue;
      }
      return text.slice(j, i);
    }

    eof = true;
    return text.slice(j, N);
  }

  let t = token();
  while (t !== EOF) {
    const row: string[] = [];
    while (t !== EOL && t !== EOF) {
      row.push(t as string);
      t = token();
    }
    rows.push(row);
    t = token();
  }

  return rows;
}

/**
 * Csv text as an array of row objects keyed by the header line. Every field is
 * a string -- nothing is coerced or type-inferred here, and the layout engine
 * applies `Number` where it needs a number.
 */
export function parseCsv(text: string): DataRow[] {
  const [columns, ...rows] = parseCsvRows(text);
  if (!columns) {
    return [];
  }
  return rows.map(fields => {
    const row: DataRow = {};
    columns.forEach((column, i) => {
      row[column] = fields[i] || '';
    });
    return row;
  });
}

/**
 * `data.url` may point at a csv or at a json array of rows. Csv fields arrive
 * as strings and json fields keep whatever type they were written with; the
 * layout engine coerces with `Number` where it needs a number, so both work.
 */
export function fetchData(url: string): Promise<DataRow[]> {
  return fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.text();
    })
    .then(text => (url.endsWith('.json') ? (JSON.parse(text) as DataRow[]) : parseCsv(text)));
}
