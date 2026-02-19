// Простой виджет на чистом JavaScript для тестирования
class MedicalCalculatorWidget {
  constructor() {
    this.container = null;
    this.shadow = null;
    this.config = this.getMockConfig();
  }

  async loadConfig() {
    try {
      const response = await fetch('http://localhost:3003/api/widget/config', {
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load widget configuration');
      }

      const data = await response.json();
      this.config = data;
      return data;

    } catch (error) {
      console.error('Config loading error:', error);
      // Fallback к mock данным
      return this.getMockConfig();
    }
  }

  getMockConfig() {
    return {
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
  }

  async init(apiKey) {
    try {
      console.log('Initializing widget...');
      this.apiKey = apiKey;
      
      // Загружаем конфигурацию
      await this.loadConfig();
      
      this.createContainer();
      this.applyStyles();
      this.renderCalculator();
      console.log('Widget initialized successfully');
    } catch (error) {
      console.error('Widget initialization failed:', error);
      this.showError('Не удалось загрузить калькулятор');
    }
  }

  createContainer() {
    // Ищем контейнер на странице или создаем его
    this.container = document.getElementById('medical-calculator-widget');
    
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'medical-calculator-widget';
      
      // Ищем специальный контейнер для виджета
      const widgetContainer = document.querySelector('.widget-container');
      if (widgetContainer) {
        // Находим заголовок и сохраняем его
        const title = widgetContainer.querySelector('h3');
        const description = widgetContainer.querySelector('p');
        
        // Добавляем виджет, но не очищаем весь контейнер
        widgetContainer.appendChild(this.container);
        
        // Скрываем заголовок после загрузки виджета
        if (title) title.style.display = 'none';
        if (description) description.style.display = 'none';
      } else {
        // Если контейнера нет, добавляем в body
        document.body.appendChild(this.container);
      }
    }
    
    this.shadow = this.container.attachShadow({ mode: 'open' });
    
    const styles = document.createElement('style');
    styles.textContent = this.getStyles();
    this.shadow.appendChild(styles);
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

  renderCalculator() {
    const calculatorHTML = `
      <div class="wdg-calculator">
        <h2 class="wdg-title">Медицинская перевозка</h2>
        <form id="wdg-form">
          <div class="wdg-form-group">
            <label class="wdg-label">Адрес откуда *</label>
            <input type="text" class="wdg-input" name="from_address" placeholder="Введите адрес" required>
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Адрес куда *</label>
            <input type="text" class="wdg-input" name="to_address" placeholder="Введите адрес" required>
          </div>
          
          <div id="wdg-result" style="display: none;">
            <div class="wdg-result">
              <div class="wdg-price">0 ₽</div>
              <div>Расстояние: 0 км</div>
            </div>
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Телефон *</label>
            <input type="tel" class="wdg-input" name="phone" placeholder="+7 (___) ___-__-__" required>
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Имя</label>
            <input type="text" class="wdg-input" name="customer_name" placeholder="Ваше имя">
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Email</label>
            <input type="email" class="wdg-input" name="email" placeholder="email@example.com">
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Вес пациента (кг)</label>
            <input type="number" class="wdg-input" name="weight" placeholder="80">
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Этаж</label>
            <input type="number" class="wdg-input" name="floor_num" placeholder="2" disabled>
          </div>
          
          <div class="wdg-form-group">
            <div class="wdg-checkbox-group">
              <input type="checkbox" class="wdg-checkbox" name="no_elevator" id="no_elevator">
              <label for="no_elevator">Нет лифта</label>
            </div>
          </div>
          
          <div class="wdg-form-group">
            <div class="wdg-checkbox-group">
              <input type="checkbox" class="wdg-checkbox" name="medical_escort" id="medical_escort">
              <label for="medical_escort">Медицинское сопровождение</label>
            </div>
          </div>
          
          <div class="wdg-form-group">
            <div class="wdg-checkbox-group">
              <input type="checkbox" class="wdg-checkbox" name="round_trip" id="round_trip">
              <label for="round_trip">Перевозка туда-обратно</label>
            </div>
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Способ оплаты</label>
            <select class="wdg-select" name="payment_method">
              <option value="">Выберите способ</option>
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
              <option value="invoice">Счёт</option>
            </select>
          </div>
          
          <div class="wdg-form-group">
            <label class="wdg-label">Комментарий</label>
            <textarea class="wdg-input" name="comment" placeholder="Дополнительная информация" rows="3"></textarea>
          </div>
          
          <div class="wdg-form-group">
            <div class="wdg-checkbox-group">
              <input type="checkbox" class="wdg-checkbox" name="news_subscribe" id="news_subscribe">
              <label for="news_subscribe">Подписаться на новости и спецпредложения</label>
            </div>
          </div>
          
          <div class="wdg-form-group">
            <div class="wdg-checkbox-group">
              <input type="checkbox" class="wdg-checkbox" name="personal_data" id="personal_data" required>
              <label for="personal_data">
                Согласен на обработку персональных данных
                <a href="/privacy" target="_blank" style="margin-left: 5px;">(подробнее)</a>
              </label>
            </div>
          </div>
          
          <button type="submit" class="wdg-button" disabled>Оставить заявку</button>
        </form>
      </div>
    `;

    const container = this.shadow.appendChild(document.createElement('div'));
    container.innerHTML = calculatorHTML;
    
    this.attachEventListeners();
  }

  attachEventListeners() {
    const form = this.shadow.getElementById('wdg-form');
    const fromAddress = this.shadow.querySelector('[name="from_address"]');
    const toAddress = this.shadow.querySelector('[name="to_address"]');
    const noElevator = this.shadow.querySelector('[name="no_elevator"]');
    const floorInput = this.shadow.querySelector('[name="floor_num"]');
    const submitButton = this.shadow.querySelector('.wdg-button');

    // Обработчик лифта
    noElevator.addEventListener('change', (e) => {
      floorInput.disabled = !e.target.checked;
    });

    // Обработчики адресов для расчёта
    const calculatePrice = async () => {
      if (fromAddress.value && toAddress.value) {
        try {
          // Получаем координаты из dataset (сохранены при выборе из подсказок DaData)
          const fromLat = fromAddress.dataset.lat;
          const fromLon = fromAddress.dataset.lon;
          const toLat = toAddress.dataset.lat;
          const toLon = toAddress.dataset.lon;
          
          if (!fromLat || !fromLon || !toLat || !toLon) {
            console.warn('⚠️ Координаты не найдены, выберите более точный адрес (улица, дом)');
            
            // Показываем сообщение пользователю
            const resultDiv = this.shadow.getElementById('wdg-result');
            resultDiv.innerHTML = `
              <div style="padding: 15px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e;">
                <strong>⚠️ Выберите более точный адрес</strong>
                <p style="margin: 5px 0 0 0; font-size: 14px;">
                  Для расчета расстояния необходимо указать конкретный адрес с улицей и домом, а не только город или район.
                </p>
              </div>
            `;
            resultDiv.style.display = 'block';
            submitButton.disabled = true;
            return;
          }
          
          const fromCoords = { lat: parseFloat(fromLat), lon: parseFloat(fromLon) };
          const toCoords = { lat: parseFloat(toLat), lon: parseFloat(toLon) };
          
          console.log('📍 Calculating distance from:', fromCoords, 'to:', toCoords);
          
          const response = await fetch('http://localhost:3003/api/dadata/distance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.apiKey
            },
            body: JSON.stringify({
              from: fromCoords,
              to: toCoords
            })
          });
          
          const data = await response.json();
          
          if (data.success) {
            const distance = data.distance;
            const duration = data.duration;
            const method = data.method || 'unknown';
            const provider = data.provider || 'unknown';
            const price = this.calculatePrice(distance);
            
            console.log('✅ Distance calculated:', distance, 'km, price:', price, '₽, provider:', provider);
            
            const resultDiv = this.shadow.getElementById('wdg-result');
            
            // Формируем текст с информацией о маршруте
            let routeInfo = `Расстояние: ${distance} км`;
            if (duration) {
              const hours = Math.floor(duration / 60);
              const minutes = duration % 60;
              const timeStr = hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`;
              routeInfo += ` (${timeStr})`;
            }
            
            // Иконка в зависимости от провайдера
            if (provider === 'graphhopper') {
              routeInfo += ' 🚗';
            } else if (provider === 'osrm') {
              routeInfo += ' �';
            } else if (provider === 'haversine' || method === 'straight-line') {
              routeInfo += ' ⚠️ по прямой';
            } else if (method === 'road') {
              routeInfo += ' 🚗';
            }
            
            resultDiv.innerHTML = `
              <div class="wdg-price">${price} ₽</div>
              <div style="color: #64748b; font-size: 14px; margin-top: 5px;">${routeInfo}</div>
            `;
            resultDiv.style.display = 'block';
            
            submitButton.disabled = false;
          } else {
            throw new Error(data.error || 'Failed to calculate distance');
          }
        } catch (error) {
          console.error('❌ Distance calculation error:', error);
          
          const resultDiv = this.shadow.getElementById('wdg-result');
          resultDiv.style.display = 'none';
          submitButton.disabled = true;
        }
      }
    };

    // Обработчики адресов для подсказок
    const fromAddressInput = this.shadow.querySelector('[name="from_address"]');
    const toAddressInput = this.shadow.querySelector('[name="to_address"]');
    
    // Debounce для подсказок
    let suggestTimeout;
    
    const handleAddressInput = async (input) => {
      clearTimeout(suggestTimeout);
      
      suggestTimeout = setTimeout(async () => {
        console.log('🔍 Address input:', input.value, 'length:', input.value.length);
        
        if (input.value.length < 3) {
          console.log('❌ Too short, hiding suggestions');
          this.hideAddressSuggestions(input);
          return;
        }
        
        try {
          console.log('📡 Fetching suggestions for:', input.value);
          const response = await fetch('http://localhost:3003/api/dadata/suggest', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.apiKey
            },
            body: JSON.stringify({
              query: input.value,
              count: 5
            })
          });
          
          const data = await response.json();
          console.log('📥 API Response:', data);
          
          if (data.success && data.suggestions.length > 0) {
            console.log('✅ Showing suggestions:', data.suggestions.length);
            // Показываем dropdown с подсказками
            this.showAddressSuggestions(input, data.suggestions);
          } else {
            console.log('❌ No suggestions found');
            this.hideAddressSuggestions(input);
          }
        } catch (error) {
          console.error('❌ Address suggestions error:', error);
          this.hideAddressSuggestions(input);
        }
      }, 300);
    };

    // Метод для показа подсказок
    this.showAddressSuggestions = (input, suggestions) => {
      console.log('🎯 Showing suggestions for input:', input, 'suggestions:', suggestions);
      
      // Удаляем существующий dropdown
      this.hideAddressSuggestions(input);
      
      const dropdown = document.createElement('div');
      dropdown.className = 'wdg-address-suggestions';
      
      suggestions.forEach((suggestion, index) => {
        console.log(`📍 Adding suggestion ${index + 1}:`, suggestion.value);
        
        const item = document.createElement('div');
        item.className = 'wdg-suggestion-item';
        item.textContent = suggestion.value;
        
        // Стили для элемента
        item.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #f1f5f9;
          font-size: 14px;
        `;
        
        item.addEventListener('mouseenter', () => {
          item.style.backgroundColor = '#f8fafc';
        });
        
        item.addEventListener('mouseleave', () => {
          item.style.backgroundColor = 'white';
        });
        
        item.addEventListener('click', () => {
          console.log('👆 Selected suggestion:', suggestion.value);
          console.log('📦 Suggestion data:', suggestion.data);
          
          input.value = suggestion.value;
          
          // Сохраняем координаты из DaData
          if (suggestion.data && suggestion.data.geo_lat && suggestion.data.geo_lon) {
            input.dataset.lat = suggestion.data.geo_lat;
            input.dataset.lon = suggestion.data.geo_lon;
            console.log('✅ Saved coordinates:', suggestion.data.geo_lat, suggestion.data.geo_lon);
          } else {
            console.warn('⚠️ No coordinates for this address. Please select a more specific address (street, house).');
            // Очищаем старые координаты
            delete input.dataset.lat;
            delete input.dataset.lon;
          }
          
          this.hideAddressSuggestions(input);
          
          // Автоматически рассчитываем расстояние, если оба адреса выбраны
          calculatePrice();
        });
        
        dropdown.appendChild(item);
      });
      
      // Стили для dropdown
      dropdown.style.cssText = `
        position: absolute;
        top: ${input.offsetTop + input.offsetHeight + 2}px;
        left: ${input.offsetLeft}px;
        width: ${input.offsetWidth}px;
        background: white;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1000;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      `;
      
      console.log('🎨 Dropdown styles applied, adding to DOM');
      
      // Добавляем dropdown после input в Shadow DOM
      input.parentNode.style.position = 'relative';
      input.parentNode.appendChild(dropdown);
      
      console.log('✅ Dropdown added to DOM, total items:', suggestions.length);
      
      // Сохраняем ссылку для удаления
      input._suggestionsDropdown = dropdown;
    };

    // Метод для скрытия подсказок
    this.hideAddressSuggestions = (input) => {
      if (input._suggestionsDropdown && input._suggestionsDropdown.parentNode) {
        input._suggestionsDropdown.parentNode.removeChild(input._suggestionsDropdown);
        input._suggestionsDropdown = null;
      }
    };

    // Скрываем подсказки при клике вне поля (внутри Shadow DOM)
    this.shadow.addEventListener('click', (e) => {
      if (!e.target.matches('[name="from_address"], [name="to_address"]') && 
          !e.target.closest('.wdg-address-suggestions')) {
        this.hideAddressSuggestions(fromAddressInput);
        this.hideAddressSuggestions(toAddressInput);
      }
    });
    
    fromAddressInput.addEventListener('input', () => handleAddressInput(fromAddressInput));
    toAddressInput.addEventListener('input', () => handleAddressInput(toAddressInput));

    // Обработчик формы
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitButton.textContent = 'Отправка...';
      submitButton.disabled = true;

      try {
        const formData = this.getFormData();
        
        const response = await fetch('http://localhost:3003/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
          },
          body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (data.success) {
          const orderId = data.order_number;
          
          console.log('Order submitted successfully:', { orderId, ...formData });
          
          // Показываем успех
          const calculator = this.shadow.querySelector('.wdg-calculator');
          calculator.innerHTML = `
            <div class="wdg-success">
              <h3>Заявка отправлена!</h3>
              <p>Мы свяжемся с вами в ближайшее время.</p>
              <p><strong>Номер заявки:</strong> ${orderId}</p>
              <p><strong>Стоимость:</strong> ${data.price} ₽</p>
            </div>
          `;
        } else {
          throw new Error(data.error || 'Failed to submit order');
        }
      } catch (error) {
        console.error('Order submission error:', error);
        const errorDiv = this.shadow.querySelector('.wdg-error') || document.createElement('div');
        errorDiv.className = 'wdg-error';
        errorDiv.textContent = error.message || 'Ошибка при отправке заявки';
        form.appendChild(errorDiv);
      } finally {
        submitButton.textContent = 'Оставить заявку';
        submitButton.disabled = false;
      }
    });
  }

  calculatePrice(distance) {
    const formData = this.getFormData();
    const settings = this.config.settings;
    
    let price = settings.pricing.base;
    price += distance * settings.pricing.per_km;
    
    if (formData.weight > settings.pricing.overweight_limit) {
      price += settings.pricing.overweight_fee;
    }
    
    if (formData.no_elevator && formData.floor_num > 1) {
      price += (formData.floor_num - 1) * settings.pricing.floor_fee;
    }
    
    if (formData.medical_escort) {
      price += settings.pricing.escort_fee;
    }
    
    if (formData.round_trip) {
      price *= 1.8;
    }

    return Math.round(price);
  }

  getFormData() {
    const form = this.shadow.getElementById('wdg-form');
    const formData = new FormData(form);
    const data = {};
    
    for (let [key, value] of formData.entries()) {
      if (value === 'on') {
        data[key] = true;
      } else if (value === '') {
        data[key] = false;
      } else {
        data[key] = value;
      }
    }
    
    return data;
  }

  handleSubmit(form) {
    const submitButton = form.querySelector('.wdg-button');
    submitButton.textContent = 'Отправка...';
    submitButton.disabled = true;

    // Mock отправка
    setTimeout(() => {
      const data = this.getFormData();
      const orderId = 'TEST-' + Math.floor(Math.random() * 10000);
      
      console.log('Order submitted:', { orderId, ...data });
      
      // Показываем успех
      const calculator = this.shadow.querySelector('.wdg-calculator');
      calculator.innerHTML = `
        <div class="wdg-success">
          <h3>Заявка отправлена!</h3>
          <p>Мы свяжемся с вами в ближайшее время.</p>
          <p><strong>Номер заявки:</strong> ${orderId}</p>
        </div>
      `;
    }, 1500);
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

      .wdg-input, .wdg-select, .wdg-textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--wdg-border);
        border-radius: var(--wdg-radius);
        font-size: var(--wdg-font-size);
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      .wdg-input:focus, .wdg-select:focus, .wdg-textarea:focus {
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

      .wdg-button:hover:not(:disabled) {
        background: #2563eb;
      }

      .wdg-button:disabled {
        background: #9ca3af;
        cursor: not-allowed;
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

// Автоматическая инициализация
(function() {
  const script = document.querySelector('script[data-key]');
  if (script) {
    const apiKey = script.getAttribute('data-key');
    const widget = new MedicalCalculatorWidget();
    widget.init(apiKey);
  }
})();
