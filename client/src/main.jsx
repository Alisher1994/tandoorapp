import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'leaflet/dist/leaflet.css';
import './index.css';

// Telegram WebApp expand - раскрыть на полный экран
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready?.();
  window.Telegram.WebApp.expand?.();
}

// Prevent pinch-zoom scaling on mobile browsers (iOS/Android)
document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
document.addEventListener('gestureend', (event) => event.preventDefault(), { passive: false });
document.addEventListener('touchmove', (event) => {
  if (event.touches && event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);




