import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';

// Telegram WebApp expand - раскрыть на полный экран
if (window.Telegram?.WebApp) {
  window.Telegram.WebApp.expand();
  window.Telegram.WebApp.enableClosingConfirmation?.();

  // Disable swipe to close in Telegram
  if (window.Telegram.WebApp.disableVerticalSwipes) {
    window.Telegram.WebApp.disableVerticalSwipes();
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);




