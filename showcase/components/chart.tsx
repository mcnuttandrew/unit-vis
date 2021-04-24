import React, {useEffect} from 'react';

import UnitVis from '../../index';
import {Spec} from '../../index.d';

interface Props {
  spec?: Spec;
}

export default function Chart(props: Props) {
  const {spec} = props;
  useEffect(() => {
    const oldSvg1 = document.querySelector('#old-target svg');
    if (oldSvg1) {
      oldSvg1.remove();
    }
    const oldSvg2 = document.querySelector('#new-target svg');
    if (oldSvg2) {
      oldSvg2.remove();
    }
    if (spec) {
      UnitVis('old-target', spec, {backend: 'old'});
      UnitVis('new-target', spec, {backend: 'vega'});
    }
  }, [spec]);

  return (
    <div>
      <div>
        <span>Old backend</span>
        <div id="old-target" />
      </div>
      <div>
        <span>New backend</span>
        <div id="new-target" />
      </div>
    </div>
  );
}
