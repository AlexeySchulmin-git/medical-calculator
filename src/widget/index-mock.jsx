import { render } from 'preact';
import Calculator from './Calculator';
import './styles.css';

// Mock данные для тестирования без API
const mockConfig = {
  client_id: 'test-client-001',
  company_name: 'Тестовая медицинская компания',
  settings: {
    fields: {
      from_address: true,
      to_address: true,
      floor: true,
      no_elevator: true,
      diagnosis: true,
      weight: true,
      phone: true,
      email: true,
      round_trip: true,
      payment_method: true,
      medical_escort: true,
      news_subscribe: true,
      personal_data: true
    },
    required: ['phone', 'from_address', 'to_address', 'personal_data'],
    pricing: {
      base: 1500,
      per_km: 45,
      floor_fee: 150,
      overweight_limit: 100,
      overweight_fee: 500,
      escort_fee: 1000
    },
    bonus: {
      enabled: true,
      percent: 5
    },
    personal_data_url: '/privacy',
    ui: {
      primary_color: '#3b82f6',
      bg_color: '#ffffff',
      font_size: '16px',
      border_radius: '8px'
    }
  }
};

class MedicalCalculatorWidget {
  constructor() {
    this.container = null;
    this.shadow = null;
    this.config = mockConfig;
  }

  init(apiKey) {
    try {
      // Создаём Shadow DOM контейнер
      this.createContainer();
      
      // Применяем CSS переменные из конфига
      this.applyStyles();
      
      // Рендерим калькулятор с mock данными
      render(
        <Calculator config={this.config} />,
        this.shadow.appendChild(document.createElement('div'))
      );

      console.log('Widget initialized with mock data');

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
