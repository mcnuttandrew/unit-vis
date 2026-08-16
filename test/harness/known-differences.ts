/**
 * Where the vega backend is knowingly not yet at parity with the old one.
 *
 * Each entry suppresses exactly one check for one spec (or `*` for all specs).
 * The registry is checked in both directions: a listed difference that stops
 * reproducing fails the suite too, so entries cannot go stale. Delete an entry
 * as soon as the backend catches up.
 *
 * These reproduce at `SAMPLE_SIZE` rows; `yarn report:svg --full` prints the
 * same comparison over the complete datasets.
 */
export interface KnownDifference {
  /** Spec name, or `*` for every spec. */
  spec: string;
  /** The `it(...)` title of the check being suppressed. */
  check: string;
  reason: string;
}

export const KNOWN_DIFFERENCES: KnownDifference[] = [
  {
    spec: 'enumerate',
    check: 'draws one unit mark per data row in both backends',
    reason:
      'The spec has an empty `layouts` array, so the container tree is one node deep and both backends draw a ' +
      'single mark for the whole dataset. A pre-existing quirk of the layout engine, not of either renderer.',
  },
  ...['titanic_spec1', 'titanic_spec2'].map(spec => ({
    spec,
    check: 'draws a visible chart in both backends',
    reason:
      'Every unit mark comes out with no extent, so these two specs render an empty chart in *both* backends: ' +
      '`calcRadiusIsolated` returns a negative radius, which the old backend writes as `<circle r="-16.4">` ' +
      '(svg refuses to draw it) and vega clamps to 0. A layout/mark-size bug that predates the port.',
  })),
];

/**
 * Specs the *layout engine* cannot process at all, before either backend is
 * reached. Listed here so a backend regression is never confused with one of
 * these pre-existing crashes.
 */
export const KNOWN_LAYOUT_FAILURES: {[spec: string]: string} = {
  unit_small_multiple: 'layout.ts `getMinAmongContainers` reduces an empty container list with no initial value.',
};

export function findKnownDifference(spec: string, check: string): KnownDifference | undefined {
  return KNOWN_DIFFERENCES.find(d => (d.spec === spec || d.spec === '*') && d.check === check);
}

/**
 * Run a parity assertion against the registry.
 *
 * - unlisted check fails  -> a regression, rethrow
 * - listed check fails    -> known, stay quiet
 * - listed check passes   -> the backend caught up, fail so the entry gets removed
 */
export function checkParity(spec: string, check: string, assertion: () => void): void {
  const known = findKnownDifference(spec, check);
  let failure: unknown = null;
  try {
    assertion();
  } catch (error) {
    failure = error;
  }
  if (known && !failure) {
    throw new Error(
      `"${check}" now passes for ${spec}. Remove the KNOWN_DIFFERENCES entry:\n  ${known.reason}`,
    );
  }
  if (!known && failure) {
    throw failure;
  }
}
