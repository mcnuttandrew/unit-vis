import ReactDOM from 'react-dom';
import React from 'react';

function App() {
  return (
    <div>
      <h1>Unit Vis test</h1>
    </div>
  );
}

const el = document.createElement('div');
document.body.appendChild(el);

ReactDOM.render(React.createElement(App), el);
