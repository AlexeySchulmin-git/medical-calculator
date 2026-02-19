import { h, render } from 'preact';
import Calculator from './Calculator';
import './styles.css';

class MedicalCalculatorWidget {
  constructor() {
    this.container = null;
    this.shadow = null;
    this.config = null;
  }

  async init(apiKey) {
    try {
      // Получаем конфигурацию
      const response = await fetch(`${window.location.origin}/api/widget/config`, {
        headers: {
          'X-API-Key': apiKey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load widget configuration');
      }

      this.config = await response.json();
      
      // Создаём Shadow DOM контейнер
      this.createContainer();
      
      // Применяем CSS переменные из конфига
      this.applyStyles();
      
      // Рендерим калькулятор
      render(
        <Calculator config={this.config} />,
        this.shadow.appendChild(document.createElement('div'))
      );

    } catch (error) {
      console.error('Widget initialization failed:', error);
      this.showError('Не удалось загрузить калькулятор');
    }
  }

  createContainer() {
    // Создаём основной контейнер
    this.container = document.createElement('div');
    this.container.id = 'medical-calculator-widget';
    
    // Создаём Shadow DOM
    this.shadow = this.container.attachShadow({ mode: 'open' });
    
    // Вставляем стили
    const styles = document.createElement('style');
    styles.textContent = this.getStyles();
    this.shadow.appendChild(styles);
    
    // Добавляем на страницу
    document.body.appendChild(this.container);
  }

  applyStyles() {
    const root = this.shadow.host;
    if (root && this.config.settings.ui) {
      const ui = this.config.settings.ui;
      root.style.setProperty('--wdg-primary', ui.primary_color || '#3b82f6');
      root.style.setProperty('--wdg-bg', ui.bg_color || '#ffffff');
      root.style.setProperty('--wdg-font-size', ui.font_size || '16px');
      root.style.setProperty('--wdg-radius', ui.border_radius || '8px');
    }
  }

  getStyles() {
    return `
      :host {
        --wdg-primary: #3b82f6;
        --wdg-bg: #ffffff;
        --wdg-text: #374151;
        --wdg-border: #d1d5db;
        --wdg-error: #ef4444;
        --wdg-success: #10b981;
        --wdg-font-size: 16px;
        --wdg-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: var(--wdg-font-size);
        line-height: 1.5;
        color: var(--wdg-text);
      }

      .wdg-calculator {
        background: var(--wdg-bg);
        border: 1px solid var(--wdg-border);
        border-radius: var(--wdg-radius);
        padding: 20px;
        max-width: 500px;
        margin: 20px auto;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      }

      .wdg-title {
        font-size: 1.25em;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--wdg-text);
      }

      .wdg-form-group {
        margin-bottom: 16px;
      }

      .wdg-label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
        color: var(--wdg-text);
      }

      .wdg-input, .wdg-select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--wdg-border);
        border-radius: var(--wdg-radius);
        font-size: var(--wdg-font-size);
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      .wdg-input:focus, .wdg-select:focus {
        outline: none;
        border-color: var(--wdg-primary);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .wdg-checkbox-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .wdg-checkbox {
        width: auto;
        margin: 0;
      }

      .wdg-autocomplete {
        position: relative;
      }

      .wdg-suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--wdg-bg);
        border: 1px solid var(--wdg-border);
        border-top: none;
        border-radius: 0 0 var(--wdg-radius) var(--wdg-radius);
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
      }

      .wdg-suggestion {
        padding: 8px 12px;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .wdg-suggestion:hover {
        background: rgba(59, 130, 246, 0.1);
      }

      .wdg-result {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: var(--wdg-radius);
        padding: 16px;
        margin: 20px 0;
        text-align: center;
      }

      .wdg-price {
        font-size: 1.5em;
        font-weight: 600;
        color: var(--wdg-success);
        margin-bottom: 8px;
      }

      .wdg-button {
        background: var(--wdg-primary);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: var(--wdg-radius);
        font-size: var(--wdg-font-size);
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        width: 100%;
      }

      .wdg-button:hover {
        background: #2563eb;
      }

      .wdg-button:disabled {
        background: #9ca3af;
        cursor: not-allowed;
      }

      .wdg-error {
        color: var(--wdg-error);
        font-size: 0.875em;
        margin-top: 4px;
      }

      .wdg-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        color: var(--wdg-text);
      }

      .wdg-success {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.3);
        color: var(--wdg-success);
        padding: 16px;
        border-radius: var(--wdg-radius);
        text-align: center;
      }

      @media (max-width: 640px) {
        .wdg-calculator {
          margin: 10px;
          padding: 16px;
        }
      }
    `;
  }

  showError(message) {
    if (document.body) {
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      errorDiv.textContent = message;
      document.body.appendChild(errorDiv);
      
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.parentNode.removeChild(errorDiv);
        }
      }, 5000);
    }
  }
}

// Глобальная инициализация
window.MedicalCalculatorWidget = MedicalCalculatorWidget;

// Автоматическая инициализация если есть script тег с data-key
(function() {
  const script = document.querySelector('script[data-key]');
  if (script) {
    const apiKey = script.getAttribute('data-key');
    const widget = new MedicalCalculatorWidget();
    widget.init(apiKey);
  }
})();
