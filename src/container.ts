import {DataRow, UnitSpec, Container} from '../index.d';
export function buildRootContainer(
  csv_data: DataRow[],
  spec: UnitSpec,
): Container {
  if (!spec.hasOwnProperty('padding')) {
    spec.padding = {
      top: 10,
      left: 30,
      bottom: 30,
      right: 10,
    };
  }
  const myContainer: Container = {
    contents: csv_data,
    label: 'root',
    visualspace: {
      width: spec.width,
      height: spec.height,
      posX: 0,
      posY: 0,
      padding: spec.padding,
    },
    layout: 'StartOfLayout',
    parent: 'RootContainer',
  };

  return myContainer;
}
