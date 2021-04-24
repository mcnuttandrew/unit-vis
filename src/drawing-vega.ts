import embed from 'vega-embed';

import {Container, Spec, Layout, Mark} from '../index.d';

export default function drawUnitVega(
  container: Container,
  spec: Spec,
  layoutList: {head: Layout},
  divId: string,
): void {
  console.log(container, spec, layoutList);

  embed(`#${divId}`, {}, {mode: 'vega'});
}
