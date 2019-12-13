# UnitVis

This library is a fork of Park etal's [unit grammar](https://github.com/intuinno/unit) for specifying unit based charts through a declarative grammar.
We make the core library available as reusable utility with a single entry point. [You can find the paper here](https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf).

```
yarn add unit-vis
```


## Usage

First have a DOM element present with the id that you desire then simply run, perhaps target. Then run

```js
UnitVis('target', GRAMMAR_STATEMENT)
```
And that's it!

Now you might want to embed this library in a react component, perfectly normal thing to want to do. You can do that via


```js
export default function ExampleComponent() {
  useEffect(() => {
    const oldSvg = document.querySelector('#target svg');
    if (oldSvg) {
      oldSvg.remove();
    }
    UnitVis('target', GRAMMAR_STATEMENT);
  });

  return (
    <div>
      <div id="target" />
    </div>
  );
}
```


## Grammar

If you are following along from the paper, we make one small change to the language. Specifically we change the data attribute from being a string pointing to the data, and replace it with an object, either {url: 'MY_CSV_LOCATION.csv'} or {url: JSON_OF_YOUR_DATA}. Not too bad!
