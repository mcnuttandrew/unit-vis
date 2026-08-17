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
  ...['titanic_spec1', 'titanic_spec2'].map(spec => ({
    spec,
    check: 'draws a visible chart in both backends',
    reason:
      'Every unit mark comes out with no extent, so these two specs render an empty chart in *both* backends: ' +
      'the layout hands the marks containers of negative size, so `inscribedRadius` is negative too, which the ' +
      'old backend writes as `<circle r="-16.4">` (svg refuses to draw it) and vega clamps to 0. A layout bug ' +
      'that predates the port.',
  })),
];

/**
 * Specs the *JS layout engine* cannot process at all, so the d3 backend never
 * gets a tree to draw. Listed here so a backend regression is never confused
 * with one of these pre-existing crashes.
 *
 * The vega backend lays these out itself and renders them fine; they stay
 * excluded because parity needs both sides, and there is no tree to be the
 * other one.
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
