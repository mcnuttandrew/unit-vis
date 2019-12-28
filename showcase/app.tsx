import ReactDOM from 'react-dom';
import React from 'react';
import Root from './components/root';
import setupMonaco from './monaco';
import './main.css';

setupMonaco();

ReactDOM.render(<Root />, document.querySelector('#app'));
