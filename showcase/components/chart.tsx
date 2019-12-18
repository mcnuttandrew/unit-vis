import React, {useEffect} from 'react';

import UnitVis from '../../index';
import {UnitSpec} from '../../index.d';

interface Props {
  spec?: UnitSpec;
}

export default function Chart(props: Props) {
  const {spec} = props;
  useEffect(() => {
    const oldSvg = document.querySelector('#target svg');
    if (oldSvg) {
      oldSvg.remove();
    }
    if (spec) {
      UnitVis('target', spec);
    }
  }, [spec]);

  return (
    <div>
      <div id="target" />
    </div>
  );
}
