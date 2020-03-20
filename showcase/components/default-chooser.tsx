import React from 'react';
import default1 from '../specs/default1';
import default2 from '../specs/default2';
import default3 from '../specs/default3';
import default4 from '../specs/default4';
import default5 from '../specs/default5';
import editor from '../specs/editor';
import enumerate from '../specs/enumerate';
import fluctuation from '../specs/fluctuation';
import horizontal_unit_column from '../specs/horizontal_unit_column';
import maxfill_aspect from '../specs/maxfill_aspect';
import mosaic from '../specs/mosaic';
import size_sum_notShared from '../specs/size_sum_notShared';
import size_sum_shared from '../specs/size_sum_shared';
import size_uniform_notShared from '../specs/size_uniform_notShared';
import size_uniform_shared from '../specs/size_uniform_shared';
import square_aspect from '../specs/square_aspect';
import squarified from '../specs/squarified';
import titanic_spec1 from '../specs/titanic_spec1';
import titanic_spec2 from '../specs/titanic_spec2';
import titanic_spec3 from '../specs/titanic_spec3';
import titanic_spec4 from '../specs/titanic_spec4';
import titanic_spec_packxy_hierarchy from '../specs/titanic_spec_packxy_hierarchy';
import titanic_spec_packxy_isolated from '../specs/titanic_spec_packxy_isolated';
import titanic_spec_packxy_mixed from '../specs/titanic_spec_packxy_mixed';
import unit_column_chart from '../specs/unit_column_chart';
import unit_column_chart_shared from '../specs/unit_column_chart_shared';
import unit_column_chart_shared_mark from '../specs/unit_column_chart_shared_mark';
import unit_small_multiple from '../specs/unit_small_multiple';
import violin from '../specs/violin';

const options = [
  {name: 'default1', spec: default1},
  {name: 'default2', spec: default2},
  {name: 'default3', spec: default3},
  {name: 'default4', spec: default4},
  {name: 'default5', spec: default5},
  {name: 'editor', spec: editor},
  {name: 'enumerate', spec: enumerate},
  {name: 'fluctuation', spec: fluctuation},
  {name: 'horizontal_unit_column', spec: horizontal_unit_column},
  {name: 'maxfill_aspect', spec: maxfill_aspect},
  {name: 'mosaic', spec: mosaic},
  {name: 'size_sum_notShared', spec: size_sum_notShared},
  {name: 'size_sum_shared', spec: size_sum_shared},
  {name: 'size_uniform_notShared', spec: size_uniform_notShared},
  {name: 'size_uniform_shared', spec: size_uniform_shared},
  {name: 'square_aspect', spec: square_aspect},
  {name: 'squarified', spec: squarified},
  {name: 'titanic_spec1', spec: titanic_spec1},
  {name: 'titanic_spec2', spec: titanic_spec2},
  {name: 'titanic_spec3', spec: titanic_spec3},
  {name: 'titanic_spec4', spec: titanic_spec4},
  {name: 'titanic_spec_packxy_hierarchy', spec: titanic_spec_packxy_hierarchy},
  {name: 'titanic_spec_packxy_isolated', spec: titanic_spec_packxy_isolated},
  {name: 'titanic_spec_packxy_mixed', spec: titanic_spec_packxy_mixed},
  {name: 'unit_column_chart', spec: unit_column_chart},
  {name: 'unit_column_chart_shared', spec: unit_column_chart_shared},
  {name: 'unit_column_chart_shared_mark', spec: unit_column_chart_shared_mark},
  {name: 'unit_small_multiple', spec: unit_small_multiple},
  {name: 'violin', spec: violin},
];

interface Props {
  setCode: (code: string) => void;
}

export default function DefaultChooser(props: Props) {
  const {setCode} = props;
  return (
    <div className="default-chooser">
      <select onChange={({target: {value}}) => setCode(value)}>
        {options.map(({name, spec}) => {
          return (
            <option value={JSON.stringify(spec, null, 2)} key={name}>
              {name}
            </option>
          );
        })}
      </select>
    </div>
  );
}
