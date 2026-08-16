import {options} from './specs';

interface Props {
  specName: string;
  setSpecName: (name: string) => void;
}

export default function DefaultChooser(props: Props) {
  const {specName, setSpecName} = props;
  // An unknown name (a bad hash, mid-normalization) still has to render
  // something, and the first option is what the app falls back to anyway.
  const currentIndex = Math.max(
    0,
    options.findIndex(({name}) => name === specName),
  );
  const step = (offset: number) =>
    setSpecName(options[(currentIndex + offset + options.length) % options.length].name);

  return (
    <div className="default-chooser">
      <select value={options[currentIndex].name} onChange={({target: {value}}) => setSpecName(value)}>
        {options.map(({name}) => (
          <option value={name} key={name}>
            {name}
          </option>
        ))}
      </select>
      <button onClick={() => step(-1)}>Prev</button>
      <button onClick={() => step(1)}>Next</button>
    </div>
  );
}
