"use client";

import React from 'react';
import { useEffect } from 'react';

type WidgetInstance = { init: (apiKey: string) => void };
type WidgetWindow = Window & {
  MedicalCalculatorWidget?: new () => WidgetInstance;
};

export default function Home() {
  useEffect(() => {
    const w = window as WidgetWindow;

    const initWidget = () => {
      if (!w.MedicalCalculatorWidget) {
        console.error('MedicalCalculatorWidget is not available after script load');
        return;
      }
      const widget = new w.MedicalCalculatorWidget();
      widget.init('test-api-key-12345');
      console.log('Medical calculator widget initialized');
    };

    const existing = document.querySelector('script[data-widget-calculator="1"]');
    if (existing) {
      initWidget();
      return;
    }

    const script = document.createElement('script');
    script.src = '/widget-calculator.js';
    script.async = true;
    script.setAttribute('data-widget-calculator', '1');
    script.onload = initWidget;
    script.onerror = () => console.error('Failed to load /widget-calculator.js');
    document.body.appendChild(script);

    return () => {
      // Скрипт оставляем в DOM, чтобы не ломать повторную инициализацию при HMR
    };
  }, []);

  return (
    <>
      <main style={{ minHeight: '100vh', padding: '20px' }}>
        <h1 style={{ marginBottom: '20px' }}>Медицинский калькулятор</h1>
        <div style={{ maxWidth: '800px', margin: '0 auto', color: '#6b7280' }}>
          Загрузка формы...
        </div>
      </main>
    </>
  );
}
