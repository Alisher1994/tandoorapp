import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';

// Telegram WebApp expand - раскрыть на полный экран
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.ready?.();
  window.Telegram.WebApp.expand();
  window.Telegram.WebApp.enableClosingConfirmation?.();
  window.Telegram.WebApp.setBackgroundColor?.('#f3f4f6');
  window.Telegram.WebApp.setBottomBarColor?.('#f3f4f6');

  // Disable swipe to close in Telegram
  if (window.Telegram.WebApp.disableVerticalSwipes) {
    window.Telegram.WebApp.disableVerticalSwipes();
  }
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




