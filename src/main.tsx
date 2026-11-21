import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import './styles/editor.css';
import './styles/views.css';

const container = document.getElementById('root');
if (!container) throw new Error('Kök öğe bulunamadı.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
