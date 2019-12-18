import ReactDOM from 'react-dom';
import React from 'react';
import Root from './components/root';
import setupMonaco from './monaco';

setupMonaco();

const el = document.createElement('div');
document.body.appendChild(el);

ReactDOM.render(<Root />, el);
