import React, {useState, useEffect} from 'react';

const SPECS = [
  'Untitled-2.json',
  'square_aspect.json',
  'default0.json',
  'squarified.json',
  'default1.json',
  'default2.json',
  'default3.json',
  'titanic_spec1.json',
  'default4.json',
  'titanic_spec2.json',
  'default5.json',
  'titanic_spec3.json',
  'editor.json',
  'titanic_spec4.json',
  'enumerate.json',
  'titanic_spec_packxy_hierarchy.json',
  'fluctuation.json',
  'titanic_spec_packxy_isolated.json',
  'horizontal_unit_column.json',
  'titanic_spec_packxy_mixed.json',
  'maxfill_aspect.json',
  'unit_column_chart.json',
  'mosaic.json',
  'unit_column_chart_shared.json',
  'size_sum_notShared.json',
  'unit_column_chart_shared_mark.json',
  'size_sum_shared.json',
  'unit_small_multiple.json',
  'size_uniform_notShared.json',
  'violin.json',
  'size_uniform_shared.json',
].sort();

interface Props {
  setCode: (code: string) => void;
}

export default function DefaultChooser(props: Props) {
  const {setCode} = props;
  const [selectedSpec, changeSpec] = useState('default2.json');
  useEffect(() => {
    fetch(`./data/${selectedSpec}`)
      .then(d => d.json())
      .then(d => {
        setCode(JSON.stringify(d, null, 2));
      });
  }, [selectedSpec]);

  return (
    <div>
      <select
        onChange={({target: {value}}) => changeSpec(value)}
        value={selectedSpec}
      >
        {SPECS.map(specKey => {
          return (
            <option value={specKey} key={specKey}>
              {specKey}
            </option>
          );
        })}
      </select>
    </div>
  );
}
