import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import css from './index.css?inline';

const host=document.getElementById('works-carousel-root');
if(host&&!host.shadowRoot){
 const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style'),mount=document.createElement('div');
 style.textContent=css;shadow.append(style,mount);createRoot(mount).render(<App/>);
}
