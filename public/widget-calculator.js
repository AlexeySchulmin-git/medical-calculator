// Медицинский калькулятор - одноэтапная форма, скриптовая валидация
class MedicalCalculator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.apiUrl = this.getAttribute('api-url') || 'http://localhost:3003';
    this.apiKey = this.getAttribute('api-key') || 'test-api-key-12345';
    this.calculatedPrice = null;
    this.calculatedDistance = null;
    // Тарифы по умолчанию (заменяются данными из БД)
    this.pricing = {
      per_km: 50,
      base_fixed_add: 0,
      base_coeff: 0,
      oxygen_fee: 1000,
      no_escort_fee: 300,
      round_trip_type: 0,
      round_trip_value: 80,
      floor_tiers: { descent: [], ascent: [] },
      city_rates: [],
    };
  }

  connectedCallback() {
    this.render();
    this.attachEventListeners();
    this.loadPricing();
  }

  async loadPricing() {
    try {
      const res = await fetch(`${this.apiUrl}/api/pricing/public`);
      if (!res.ok) return;
      const data = await res.json();
      this.pricing = { ...this.pricing, ...data };
      // Обновляем ссылки политики из настроек компании
      const company = data.company || {};
      const policyLink    = this.shadowRoot.getElementById('policyLink');
      const agreementLink = this.shadowRoot.getElementById('agreementLink');
      if (policyLink    && company.policy_url)    policyLink.href    = company.policy_url;
      if (agreementLink && company.agreement_url) agreementLink.href = company.agreement_url;
      // Если расстояние уже было рассчитано — пересчитываем цену
      if (this.calculatedDistance) {
        this.updateResult();
      }
    } catch (_) {
      // Фаллбэк: работаем с дефолтными значениями
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: ${this.getAttribute('max-width') || '600px'};
          margin: 0 auto;
          --w-primary:      ${this.getAttribute('primary-color')  || '#3b82f6'};
          --w-primary-dark: ${this.getAttribute('primary-dark')   || '#2563eb'};
          --w-bg:           ${this.getAttribute('bg-color')       || '#ffffff'};
          --w-radius:       ${this.getAttribute('border-radius')  || '16px'};
          --w-input-radius: ${this.getAttribute('input-radius')   || '8px'};
          --w-font-size:    ${this.getAttribute('font-size')      || '16px'};
          --w-accent-bg:    ${this.getAttribute('accent-bg')      || 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)'};
        }

        .calculator {
          background: var(--w-bg);
          border-radius: var(--w-radius);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07), 0 10px 20px rgba(0, 0, 0, 0.1);
          padding: 32px;
        }

        .calculator-title {
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
          text-align: center;
        }

        .calculator-subtitle {
          font-size: 16px;
          color: #64748b;
          margin-bottom: 32px;
          text-align: center;
        }

        .form-group {
          margin-bottom: 24px;
        }

        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #334155;
          margin-bottom: 8px;
        }

        .form-label.required::after {
          content: '*';
          color: #ef4444;
          margin-left: 4px;
          font-size: 18px;
          line-height: 1;
          vertical-align: middle;
        }

        .form-input {
          width: 100%;
          padding: 12px 16px;
          font-size: 16px;
          border: 2px solid #e2e8f0;
          border-radius: 8px;
          transition: all 0.2s;
          font-family: inherit;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--w-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--w-primary) 15%, transparent);
        }

        .form-input.error {
          border-color: #ef4444;
        }

        .form-input.success {
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .input-wrapper {
          position: relative;
        }

        .clear-btn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          font-size: 36px;
          line-height: 1;
          padding: 0 4px;
          display: none;
          transition: color 0.15s;
          width: 32px;
          height: 32px;
          display: none;
          align-items: center;
          justify-content: center;
        }

        .clear-btn:hover {
          color: #ef4444;
        }

        .clear-btn.visible {
          display: flex;
        }

        .input-wrapper .form-input {
          padding-right: 44px;
        }

        .suggestions-container {
          position: relative;
        }

        .suggestions-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 2px solid #e2e8f0;
          border-top: none;
          border-radius: 0 0 8px 8px;
          max-height: 300px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .suggestion-item {
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #f1f5f9;
        }

        .suggestion-item:last-child {
          border-bottom: none;
        }

        .suggestion-item:hover {
          background: #f8fafc;
        }

        .suggestion-value {
          font-size: 14px;
          color: #1e293b;
          font-weight: 500;
        }

        .suggestion-data {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .checkbox-group:hover {
          background: #f1f5f9;
        }

        .checkbox-input {
          width: 20px;
          height: 20px;
          cursor: pointer;
        }

        .checkbox-label {
          font-size: 14px;
          color: #334155;
          cursor: pointer;
          user-select: none;
        }

        .btn {
          width: 100%;
          padding: 14px 24px;
          font-size: 16px;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }

        .btn-primary {
          background: var(--w-primary);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--w-primary-dark);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px color-mix(in srgb, var(--w-primary) 40%, transparent);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .result-card {
          background: var(--w-accent-bg);
          color: white;
          padding: 24px;
          border-radius: 12px;
          margin-bottom: 24px;
          text-align: center;
        }

        .result-price {
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .result-details {
          font-size: 14px;
          opacity: 0.9;
        }

        .result-note {
          font-size: 12px;
          opacity: 0.7;
          margin-top: 8px;
        }

        .result-options {
          margin-top: 12px;
          font-size: 13px;
        }

        .result-options-title {
          font-weight: 600;
          margin-bottom: 6px;
          opacity: 0.9;
        }

        .result-option-tag {
          display: inline-block;
          background: rgba(255,255,255,0.2);
          border-radius: 12px;
          padding: 3px 10px;
          margin: 3px 3px 0 0;
          font-size: 12px;
        }

        .success-message {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          padding: 16px;
          border-radius: 8px;
          text-align: center;
          font-size: 16px;
          font-weight: 600;
          margin-top: 24px;
        }

        .field-error {
          font-size: 12px;
          color: #ef4444;
          margin-top: 4px;
          display: none;
        }

        .field-error.show {
          display: block;
        }

        .field-hint {
          font-size: 12px;
          color: #64748b;
          margin-top: 6px;
          padding: 6px 10px;
          background: #f0f9ff;
          border-radius: 6px;
          border-left: 3px solid var(--w-primary);
        }

        .hidden {
          display: none;
        }

        .loading {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 640px) {
          :host {
            max-width: 100%;
          }
          .calculator {
            padding: 20px 16px;
            border-radius: calc(var(--w-radius) * 0.75);
          }
          .form-row {
            grid-template-columns: 1fr;
          }
          .calculator-title {
            font-size: 22px;
          }
          .result-price {
            font-size: 36px;
          }
          .btn {
            padding: 13px 20px;
          }
        }

        @media (max-width: 400px) {
          .calculator {
            padding: 16px 12px;
          }
          .form-input {
            font-size: 15px;
            padding: 10px 12px;
          }
        }
      </style>

      <div class="calculator">
        <h1 class="calculator-title">Медицинский калькулятор</h1>
        <p class="calculator-subtitle">Рассчитайте стоимость перевозки</p>

        <div id="resultCard" class="result-card hidden">
          <div class="result-price" id="resultPrice">0 ₽</div>
          <div class="result-details" id="resultDetails"></div>
          <div class="result-note" id="resultNote">* без учёта платных дорог и выбранных опций. Не является публичной офертой.</div>
          <div class="result-options" id="resultOptions"></div>
        </div>

        <form id="calculatorForm" autocomplete="off">
          <input type="text" name="fake_user" style="display:none;" tabindex="-1" aria-hidden="true" />
          <input type="password" name="fake_pass" style="display:none;" tabindex="-1" aria-hidden="true" />
          <div class="form-group">
            <label class="form-label required" for="fromAddress">Откуда забрать</label>
            <div class="suggestions-container">
              <div class="input-wrapper">
                <input 
                  type="text" 
                  id="fromAddress" 
                  name="from_address"
                  class="form-input" 
                  placeholder="Начните вводить адрес..."
                  autocomplete="new-password"
                />
                <button type="button" class="clear-btn" id="clearFromAddress" title="Очистить">×</button>
              </div>
              <div id="fromSuggestions" class="suggestions-list hidden"></div>
            </div>
            <div class="field-error" id="fromAddressError"></div>
          </div>

          <div class="form-group">
            <label class="form-label required" for="toAddress">Куда доставить</label>
            <div class="suggestions-container">
              <div class="input-wrapper">
                <input 
                  type="text" 
                  id="toAddress" 
                  name="to_address"
                  class="form-input" 
                  placeholder="Начните вводить адрес..."
                  autocomplete="new-password"
                />
                <button type="button" class="clear-btn" id="clearToAddress" title="Очистить">×</button>
              </div>
              <div id="toSuggestions" class="suggestions-list hidden"></div>
            </div>
            <div class="field-error" id="toAddressError"></div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label required" for="weight">Вес пациента (кг)</label>
              <input 
                type="number" 
                id="weight" 
                name="weight"
                class="form-input" 
                placeholder="70"
                min="30"
                max="180"
                autocomplete="off"
              />
              <div class="field-error" id="weightError"></div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="floorDescent">Спуск без лифта</label>
              <select id="floorDescent" name="floor_descent" class="form-input">
                <option value="0">Выберите этаж</option>
                <option value="1">1 этаж</option>
                <option value="2">2 этаж</option>
                <option value="3">3 этаж</option>
                <option value="4">4 этаж</option>
                <option value="5">5 этаж</option>
                <option value="6">6 этаж</option>
                <option value="7">7 этаж</option>
                <option value="8">8 этаж</option>
                <option value="9">9 этаж</option>
                <option value="10">10 этаж</option>
              </select>
              <div class="field-error" id="floorDescentError"></div>
            </div>

            <div class="form-group">
              <label class="form-label" for="floorAscent">Подъём без лифта</label>
              <select id="floorAscent" name="floor_ascent" class="form-input">
                <option value="0">Выберите этаж</option>
                <option value="1">1 этаж</option>
                <option value="2">2 этаж</option>
                <option value="3">3 этаж</option>
                <option value="4">4 этаж</option>
                <option value="5">5 этаж</option>
                <option value="6">6 этаж</option>
                <option value="7">7 этаж</option>
                <option value="8">8 этаж</option>
                <option value="9">9 этаж</option>
                <option value="10">10 этаж</option>
              </select>
              <div class="field-error" id="floorAscentError"></div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="escortCount">Сопровождение (родственники)</label>
            <select id="escortCount" name="escort_count" class="form-input">
              <option value="1">1 человек</option>
              <option value="2">2 человека</option>
              <option value="0">Без сопровождения</option>
            </select>
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input 
                type="checkbox" 
                id="roundTrip" 
                name="round_trip"
                class="checkbox-input"
              />
              <label class="checkbox-label" for="roundTrip">Туда и обратно</label>
            </div>
            <div class="field-hint" id="waitingHint" style="display:none;"></div>
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input 
                type="checkbox" 
                id="medEscort" 
                name="medical_escort"
                class="checkbox-input"
              />
              <label class="checkbox-label" for="medEscort">Медицинское сопровождение</label>
            </div>
            <div class="field-hint" id="medEscortHint" style="display:none;">Стоимость зависит от диагноза и состояния пациента</div>
          </div>

          <div class="form-group" id="medEscortCountGroup" style="display:none;">
            <label class="form-label" for="medEscortCount">Количество врачей</label>
            <select id="medEscortCount" name="med_escort_count" class="form-input">
              <option value="1">1 врач</option>
              <option value="2">2 врача</option>
            </select>
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input 
                type="checkbox" 
                id="needOxygen" 
                name="need_oxygen"
                class="checkbox-input"
              />
              <label class="checkbox-label" for="needOxygen">Нужен кислород</label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label required" for="phone">Телефон</label>
            <div class="input-wrapper">
              <input 
                type="tel" 
                id="phone" 
                name="phone"
                class="form-input" 
                placeholder="+7 (___) ___-__-__"
                autocomplete="new-password"
              />
              <button type="button" class="clear-btn" id="clearPhone" title="Очистить">×</button>
            </div>
            <div class="field-error" id="phoneError"></div>
          </div>

          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <div class="input-wrapper">
              <input 
                type="text" 
                id="email" 
                name="email"
                class="form-input" 
                placeholder="example@mail.ru"
                autocomplete="new-password"
              />
              <button type="button" class="clear-btn" id="clearEmail" title="Очистить">×</button>
            </div>
            <div class="field-error" id="emailError"></div>
          </div>

          <div class="form-group">
            <label class="form-label" for="diagnosis">Диагноз</label>
            <div class="input-wrapper">
              <input 
                type="text" 
                id="diagnosis" 
                name="diagnosis"
                class="form-input" 
                placeholder="Укажите диагноз (необязательно)"
                autocomplete="off"
              />
              <button type="button" class="clear-btn" id="clearDiagnosis" title="Очистить">×</button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="comment">Комментарий</label>
            <div class="input-wrapper">
              <input 
                type="text" 
                id="comment" 
                name="comment"
                class="form-input" 
                placeholder="Дополнительная информация"
                autocomplete="off"
              />
              <button type="button" class="clear-btn" id="clearComment" title="Очистить">×</button>
            </div>
          </div>

          <div class="form-group">
            <div class="checkbox-group">
              <input 
                type="checkbox" 
                id="personalData" 
                name="personal_data"
                class="checkbox-input"
              />
              <label class="checkbox-label" for="personalData">Принимаю <a id="policyLink" href="${this.getAttribute('policy-url') || '#'}" target="_blank" style="color:#3b82f6;text-decoration:underline">обработку персональных данных</a> и <a id="agreementLink" href="${this.getAttribute('agreement-url') || '#'}" target="_blank" style="color:#3b82f6;text-decoration:underline">пользовательское соглашение</a></label>
            </div>
            <div class="field-error" id="personalDataError"></div>
          </div>

          <button type="button" class="btn btn-primary" id="submitBtn">
            Отправить заявку
          </button>
        </form>

        <div id="successMessage" class="success-message hidden"></div>
      </div>
    `;
  }

  attachEventListeners() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const phone = this.shadowRoot.getElementById('phone');
    const weight = this.shadowRoot.getElementById('weight');
    const email = this.shadowRoot.getElementById('email');

    // Маска телефона
    this.setupPhoneMask(phone);

    // Подсказки адресов
    this.setupAddressSuggestions(fromAddress, 'fromSuggestions');
    this.setupAddressSuggestions(toAddress, 'toSuggestions');

    // Крестики очистки
    this.setupClearButton('clearFromAddress', fromAddress, () => {
      fromAddress.dataset.lat = '';
      fromAddress.dataset.lon = '';
    });
    this.setupClearButton('clearToAddress', toAddress, () => {
      toAddress.dataset.lat = '';
      toAddress.dataset.lon = '';
    });
    this.setupClearButton('clearPhone', phone, () => { phone.value = '+7 ('; });
    this.setupClearButton('clearEmail', email);
    this.setupClearButton('clearDiagnosis', this.shadowRoot.getElementById('diagnosis'));
    this.setupClearButton('clearComment', this.shadowRoot.getElementById('comment'));

    // Blur-валидация на лету для всех полей
    this.setupBlurValidation();

    // Зелёная граница для select-полей при изменении
    [this.shadowRoot.getElementById('floorDescent'),
     this.shadowRoot.getElementById('floorAscent'),
     this.shadowRoot.getElementById('escortCount'),
     this.shadowRoot.getElementById('medEscortCount')].forEach(el => {
      el.addEventListener('change', () => {
        el.classList.add('success');
        el.classList.remove('error');
      });
    });

    const medEscort = this.shadowRoot.getElementById('medEscort');
    const medEscortHint = this.shadowRoot.getElementById('medEscortHint');
    const medEscortCountGroup = this.shadowRoot.getElementById('medEscortCountGroup');
    const roundTrip = this.shadowRoot.getElementById('roundTrip');
    const waitingHint = this.shadowRoot.getElementById('waitingHint');

    // Логика мед. сопровождения (врачи)
    medEscort.addEventListener('change', () => {
      medEscortHint.style.display = medEscort.checked ? 'block' : 'none';
      medEscortCountGroup.style.display = medEscort.checked ? 'block' : 'none';
      this.updateResult();
    });

    // Логика туда-обратно — показываем стоимость ожидания
    roundTrip.addEventListener('change', () => {
      if (roundTrip.checked) {
        waitingHint.textContent = `Ожидание: 500 руб. за каждые 30 мин.`;
        waitingHint.style.display = 'block';
      } else {
        waitingHint.style.display = 'none';
      }
      this.updateResult();
    });

    // Автоматический расчет при изменении параметров
    [fromAddress, toAddress, weight,
     this.shadowRoot.getElementById('floorDescent'),
     this.shadowRoot.getElementById('floorAscent'),
     this.shadowRoot.getElementById('needOxygen'),
     this.shadowRoot.getElementById('medEscortCount'),
     this.shadowRoot.getElementById('escortCount')].forEach(el => {
      el.addEventListener('change', () => this.autoCalculate());
    });

    // Отправка заявки
    this.shadowRoot.getElementById('submitBtn').addEventListener('click', () => {
      this.submitOrder();
    });
  }

  setupClearButton(btnId, input, onClear) {
    const btn = this.shadowRoot.getElementById(btnId);
    if (!btn || !input) return;

    const toggle = () => {
      const hasValue = input.value && input.value !== '+7 (';
      btn.classList.toggle('visible', !!hasValue);
    };

    input.addEventListener('input', toggle);
    input.addEventListener('change', toggle);

    btn.addEventListener('click', () => {
      input.value = '';
      input.classList.remove('success', 'error');
      if (onClear) onClear();
      btn.classList.remove('visible');
      input.focus();
      this.hideError(input.id + 'Error');
    });
  }

  setupBlurValidation() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const weight = this.shadowRoot.getElementById('weight');
    const phone = this.shadowRoot.getElementById('phone');
    const email = this.shadowRoot.getElementById('email');

    fromAddress.addEventListener('blur', () => {
      if (!fromAddress.value.trim()) {
        this.showError('fromAddressError', 'Укажите адрес отправления');
        fromAddress.classList.add('error');
        fromAddress.classList.remove('success');
      } else if (!fromAddress.dataset.lat || !fromAddress.dataset.lon) {
        this.showError('fromAddressError', 'Выберите адрес из списка подсказок');
        fromAddress.classList.add('error');
        fromAddress.classList.remove('success');
      } else {
        this.hideError('fromAddressError');
        fromAddress.classList.remove('error');
        fromAddress.classList.add('success');
      }
    });

    toAddress.addEventListener('blur', () => {
      if (!toAddress.value.trim()) {
        this.showError('toAddressError', 'Укажите адрес назначения');
        toAddress.classList.add('error');
        toAddress.classList.remove('success');
      } else if (!toAddress.dataset.lat || !toAddress.dataset.lon) {
        this.showError('toAddressError', 'Выберите адрес из списка подсказок');
        toAddress.classList.add('error');
        toAddress.classList.remove('success');
      } else {
        this.hideError('toAddressError');
        toAddress.classList.remove('error');
        toAddress.classList.add('success');
      }
    });

    weight.addEventListener('blur', () => {
      const v = parseInt(weight.value);
      if (!v || v < 30 || v > 180) {
        this.showError('weightError', 'Вес должен быть от 30 до 180 кг');
        weight.classList.add('error');
        weight.classList.remove('success');
      } else {
        this.hideError('weightError');
        weight.classList.remove('error');
        weight.classList.add('success');
      }
    });

    weight.addEventListener('input', () => {
      const v = parseInt(weight.value);
      if (v >= 30 && v <= 180) {
        weight.classList.add('success');
        weight.classList.remove('error');
        this.hideError('weightError');
      }
    });

    phone.addEventListener('input', () => {
      const digits = phone.value.replace(/\D/g, '');
      if (digits.length === 11) {
        phone.classList.add('success');
        phone.classList.remove('error');
        this.hideError('phoneError');
      } else {
        phone.classList.remove('success');
      }
      // обновляем крестик
      const btn = this.shadowRoot.getElementById('clearPhone');
      if (btn) btn.classList.toggle('visible', phone.value !== '+7 (');
    });

    phone.addEventListener('blur', () => {
      const digits = phone.value.replace(/\D/g, '');
      if (digits.length !== 11) {
        this.showError('phoneError', 'Введите корректный номер телефона');
        phone.classList.add('error');
        phone.classList.remove('success');
      } else {
        this.hideError('phoneError');
        phone.classList.remove('error');
        phone.classList.add('success');
      }
    });

    email.addEventListener('blur', () => {
      if (email.value && !this.isValidEmail(email.value)) {
        this.showError('emailError', 'Введите корректный email');
        email.classList.add('error');
        email.classList.remove('success');
      } else if (email.value) {
        this.hideError('emailError');
        email.classList.remove('error');
        email.classList.add('success');
      }
    });

    email.addEventListener('input', () => {
      if (this.isValidEmail(email.value)) {
        email.classList.add('success');
        email.classList.remove('error');
        this.hideError('emailError');
      } else {
        email.classList.remove('success');
      }
    });
  }

  setupPhoneMask(input) {
    input.value = '+7 (';
    
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      
      if (!value.startsWith('7')) {
        value = '7' + value;
      }
      
      value = value.substring(1);
      
      let formatted = '+7 (';
      
      if (value.length > 0) {
        formatted += value.substring(0, 3);
      }
      if (value.length >= 3) {
        formatted += ') ' + value.substring(3, 6);
      }
      if (value.length >= 6) {
        formatted += '-' + value.substring(6, 8);
      }
      if (value.length >= 8) {
        formatted += '-' + value.substring(8, 10);
      }
      
      e.target.value = formatted;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && e.target.value === '+7 (') {
        e.preventDefault();
      }
    });

    input.addEventListener('focus', () => {
      if (input.value === '') {
        input.value = '+7 (';
      }
    });
  }

  setupAddressSuggestions(input, suggestionsId) {
    const suggestionsDiv = this.shadowRoot.getElementById(suggestionsId);
    let timeout;

    input.addEventListener('input', () => {
      clearTimeout(timeout);
      const query = input.value.trim();

      if (query.length < 3) {
        suggestionsDiv.classList.add('hidden');
        return;
      }

      timeout = setTimeout(async () => {
        try {
          const response = await fetch(`${this.apiUrl}/api/dadata/suggest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.apiKey
            },
            body: JSON.stringify({ query })
          });

          const data = await response.json();

          if (data.success && data.suggestions.length > 0) {
            this.renderSuggestions(data.suggestions, suggestionsDiv, input);
          } else {
            suggestionsDiv.classList.add('hidden');
          }
        } catch (error) {
          console.error('Suggestions error:', error);
        }
      }, 300);
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
        suggestionsDiv.classList.add('hidden');
      }
    });
  }

  renderSuggestions(suggestions, container, input) {
    container.innerHTML = suggestions.map(s => `
      <div class="suggestion-item" data-value="${s.value}" data-lat="${s.data?.geo_lat || ''}" data-lon="${s.data?.geo_lon || ''}">
        <div class="suggestion-value">${s.value}</div>
        ${s.data?.geo_lat ? `<div class="suggestion-data">📍 ${s.data.geo_lat}, ${s.data.geo_lon}</div>` : ''}
      </div>
    `).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.value;
        input.dataset.lat = item.dataset.lat;
        input.dataset.lon = item.dataset.lon;
        container.classList.add('hidden');
        
        if (item.dataset.lat && item.dataset.lon) {
          input.classList.remove('error');
          input.classList.add('success');
          this.hideError(input.id + 'Error');
          this.autoCalculate();
        } else {
          this.showError(input.id + 'Error', 'Выберите адрес с точными координатами');
        }
      });
    });
  }

  async autoCalculate() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const weight = this.shadowRoot.getElementById('weight');

    if (!fromAddress.dataset.lat || !toAddress.dataset.lat || !weight.value) {
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/dadata/distance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          from: {
            lat: parseFloat(fromAddress.dataset.lat),
            lon: parseFloat(fromAddress.dataset.lon)
          },
          to: {
            lat: parseFloat(toAddress.dataset.lat),
            lon: parseFloat(toAddress.dataset.lon)
          }
        })
      });

      const data = await response.json();

      if (data.success) {
        this.calculatedDistance = data;
        const price = this.calculatePrice(data.distance);
        this.calculatedPrice = price;
        this.showResult(price, data);
      }
    } catch (error) {
      console.error('Calculate error:', error);
    }
  }

  getActiveOptions() {
    const options = [];
    const floorDescent = parseInt(this.shadowRoot.getElementById('floorDescent').value) || 0;
    const floorAscent = parseInt(this.shadowRoot.getElementById('floorAscent').value) || 0;
    if (floorDescent > 0) options.push(`Спуск без лифта (${floorDescent} эт.)`);
    if (floorAscent > 0) options.push(`Подъём без лифта (${floorAscent} эт.)`);
    if (this.shadowRoot.getElementById('medEscort').checked) {
      const count = this.shadowRoot.getElementById('medEscortCount').value;
      options.push(`Мед. сопровождение (${count} врач)`);
    }
    const escortCount = parseInt(this.shadowRoot.getElementById('escortCount').value) || 0;
    if (escortCount > 0) options.push(`Сопровождение (${escortCount} чел.)`);
    if (this.shadowRoot.getElementById('needOxygen').checked) options.push('Кислород');
    if (this.shadowRoot.getElementById('roundTrip').checked) options.push('Туда и обратно');
    return options;
  }

  getFloorPrice(direction, weight) {
    const tiers = (this.pricing.floor_tiers && this.pricing.floor_tiers[direction]) || [];
    for (const t of tiers) {
      const from = parseInt(t.weight_from) || 0;
      const to   = (t.weight_to === null || t.weight_to === undefined) ? Infinity : parseInt(t.weight_to);
      if (weight >= from && weight <= to) return parseFloat(t.price_per_floor);
    }
    return direction === 'descent' ? 250 : 350;
  }

  calculatePrice(distance) {
    const p = this.pricing;
    const weight       = parseInt(this.shadowRoot.getElementById('weight').value) || 0;
    const floorDescent = parseInt(this.shadowRoot.getElementById('floorDescent').value) || 0;
    const floorAscent  = parseInt(this.shadowRoot.getElementById('floorAscent').value) || 0;
    const escortCount  = parseInt(this.shadowRoot.getElementById('escortCount').value) || 0;
    const needOxygen   = this.shadowRoot.getElementById('needOxygen').checked;
    const roundTrip    = this.shadowRoot.getElementById('roundTrip').checked;

    // --- Стоимость по км с городскими коэффициентами ---
    const toAddrEl   = this.shadowRoot.getElementById('toAddress');
    const fromAddrEl = this.shadowRoot.getElementById('fromAddress');
    const toAddr   = toAddrEl   ? toAddrEl.value.toLowerCase()   : '';
    const fromAddr = fromAddrEl ? fromAddrEl.value.toLowerCase() : '';

    const cityRates = p.city_rates || [];
    const findRate  = (addr) => cityRates.find(c => addr.includes(c.city_name.toLowerCase())) || null;
    const toRate    = findRate(toAddr);
    const fromRate  = findRate(fromAddr);

    let kmPrice = 0;
    if (toRate && toRate.is_fixed_price) {
      kmPrice = parseFloat(toRate.value);
    } else {
      kmPrice = distance * (parseFloat(p.per_km) || 50);
      const rate = toRate || fromRate;
      if (rate && rate.rate_type === 'percent') {
        kmPrice = kmPrice * (1 + parseFloat(rate.value) / 100);
      } else if (rate && rate.rate_type === 'flat_km') {
        kmPrice = distance * ((parseFloat(p.per_km) || 50) + parseFloat(rate.value));
      }
    }

    let price = kmPrice;

    // --- Спуск без лифта ---
    if (floorDescent > 0) {
      price += floorDescent * this.getFloorPrice('descent', weight);
    }

    // --- Подъём без лифта ---
    if (floorAscent > 0) {
      price += floorAscent * this.getFloorPrice('ascent', weight);
    }

    // --- Кислород ---
    if (needOxygen) {
      price += parseFloat(p.oxygen_fee) || 1000;
    }

    // --- Сопровождение (семейное) ---
    if (escortCount > 0) {
      price += escortCount * 500;
    }

    // --- Мед. сопровождение: цена по договорённости, не добавляем к расчёту ---

    // --- Фикс. надбавка ---
    const fixedAdd = parseFloat(p.base_fixed_add) || 0;
    if (fixedAdd !== 0) price += fixedAdd;

    // --- Коэффициент % ---
    const coeff = parseFloat(p.base_coeff) || 0;
    if (coeff !== 0) price = price * (1 + coeff / 100);

    // --- Туда-обратно ---
    if (roundTrip) {
      const rtType  = parseInt(p.round_trip_type)  || 0;
      const rtValue = parseFloat(p.round_trip_value) || 80;
      if (rtType === 1) {
        price += rtValue;
      } else {
        price = price * (1 + rtValue / 100);
      }
    }

    return Math.round(price);
  }

  updateResult() {
    if (!this.calculatedDistance) return;
    const price = this.calculatePrice(this.calculatedDistance.distance);
    this.calculatedPrice = price;
    this.showResult(price, this.calculatedDistance);
  }

  showResult(price, distanceData) {
    const resultCard = this.shadowRoot.getElementById('resultCard');
    const resultPrice = this.shadowRoot.getElementById('resultPrice');
    const resultDetails = this.shadowRoot.getElementById('resultDetails');
    const resultOptions = this.shadowRoot.getElementById('resultOptions');

    resultPrice.textContent = `${price.toLocaleString('ru-RU')} ₽`;

    let details = `Расстояние: ${distanceData.distance} км`;
    if (distanceData.duration) {
      const hours = Math.floor(distanceData.duration / 60);
      const minutes = distanceData.duration % 60;
      details += ` • Время: ${hours > 0 ? hours + ' ч ' : ''}${minutes} мин`;
    }
    if (distanceData.provider === 'graphhopper') {
      details += ' 🚗';
    }
    resultDetails.textContent = details;

    const activeOptions = this.getActiveOptions();
    const resultNote = this.shadowRoot.getElementById('resultNote');
    if (activeOptions.length > 0) {
      resultOptions.innerHTML = `<div class="result-options-title">Включены опции:</div>` +
        activeOptions.map(o => `<span class="result-option-tag">${o}</span>`).join('');
      resultNote.textContent = '* без учёта платных дорог. Не является публичной офертой.';
    } else {
      resultOptions.innerHTML = '';
      resultNote.textContent = '* без учёта платных дорог и выбранных опций. Не является публичной офертой.';
    }

    resultCard.classList.remove('hidden');
  }

  async submitOrder() {
    if (!this.validateForm()) {
      return;
    }

    const submitBtn = this.shadowRoot.getElementById('submitBtn');
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const weight = this.shadowRoot.getElementById('weight');
    const phone = this.shadowRoot.getElementById('phone');
    const email = this.shadowRoot.getElementById('email');
    const diagnosis = this.shadowRoot.getElementById('diagnosis');
    const medEscort = this.shadowRoot.getElementById('medEscort');
    const roundTrip = this.shadowRoot.getElementById('roundTrip');
    const personalData = this.shadowRoot.getElementById('personalData');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span> Отправка...';

    try {
      const orderData = {
        from_address: fromAddress.value,
        to_address: toAddress.value,
        weight: parseInt(weight.value),
        floor_descent: parseInt(this.shadowRoot.getElementById('floorDescent').value) || 0,
        floor_ascent: parseInt(this.shadowRoot.getElementById('floorAscent').value) || 0,
        medical_escort: medEscort.checked,
        med_escort_count: parseInt(this.shadowRoot.getElementById('medEscortCount').value) || 1,
        escort_count: parseInt(this.shadowRoot.getElementById('escortCount').value) || 0,
        need_oxygen: this.shadowRoot.getElementById('needOxygen').checked,
        round_trip: roundTrip.checked,
        phone: phone.value,
        email: email.value,
        diagnosis: diagnosis.value,
        comment: this.shadowRoot.getElementById('comment').value,
        personal_data: personalData.checked,
        distance: this.calculatedDistance?.distance || 0
      };

      const response = await fetch(`${this.apiUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify(orderData)
      });

      const data = await response.json();

      if (data.success) {
        this.showSuccess(data.orderNumber);
      } else {
        this.showError('phoneError', data.error || 'Ошибка при отправке заявки');
      }
    } catch (error) {
      console.error('Submit error:', error);
      this.showError('phoneError', 'Ошибка при отправке. Попробуйте еще раз.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
    }
  }

  showSuccess(orderNumber) {
    const form = this.shadowRoot.getElementById('calculatorForm');
    const successMessage = this.shadowRoot.getElementById('successMessage');

    form.classList.add('hidden');
    successMessage.textContent = `✅ Заявка №${orderNumber} успешно отправлена! Мы свяжемся с вами в ближайшее время.`;
    successMessage.classList.remove('hidden');
  }

  validateForm() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const weight = this.shadowRoot.getElementById('weight');
    const phone = this.shadowRoot.getElementById('phone');
    const email = this.shadowRoot.getElementById('email');
    const personalData = this.shadowRoot.getElementById('personalData');

    let isValid = true;

    if (!fromAddress.value.trim()) {
      this.showError('fromAddressError', 'Укажите адрес отправления');
      fromAddress.classList.add('error');
      isValid = false;
    } else if (!fromAddress.dataset.lat || !fromAddress.dataset.lon) {
      this.showError('fromAddressError', 'Выберите адрес из списка подсказок');
      fromAddress.classList.add('error');
      isValid = false;
    } else {
      this.hideError('fromAddressError');
      fromAddress.classList.remove('error');
    }

    if (!toAddress.value.trim()) {
      this.showError('toAddressError', 'Укажите адрес назначения');
      toAddress.classList.add('error');
      isValid = false;
    } else if (!toAddress.dataset.lat || !toAddress.dataset.lon) {
      this.showError('toAddressError', 'Выберите адрес из списка подсказок');
      toAddress.classList.add('error');
      isValid = false;
    } else {
      this.hideError('toAddressError');
      toAddress.classList.remove('error');
    }

    const weightValue = parseInt(weight.value);
    if (!weightValue || weightValue < 30 || weightValue > 180) {
      this.showError('weightError', 'Вес должен быть от 30 до 180 кг');
      weight.classList.add('error');
      isValid = false;
    } else {
      this.hideError('weightError');
      weight.classList.remove('error');
    }

    const phoneValue = phone.value.replace(/\D/g, '');
    if (phoneValue.length !== 11) {
      this.showError('phoneError', 'Введите корректный номер телефона');
      phone.classList.add('error');
      isValid = false;
    } else {
      this.hideError('phoneError');
      phone.classList.remove('error');
    }

    if (email.value && !this.isValidEmail(email.value)) {
      this.showError('emailError', 'Введите корректный email');
      email.classList.add('error');
      isValid = false;
    } else {
      this.hideError('emailError');
      email.classList.remove('error');
    }

    if (!personalData.checked) {
      this.showError('personalDataError', 'Необходимо согласие на обработку персональных данных');
      isValid = false;
    } else {
      this.hideError('personalDataError');
    }

    return isValid;
  }

  isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  showError(errorId, message) {
    const errorEl = this.shadowRoot.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('show');
    }
  }

  hideError(errorId) {
    const errorEl = this.shadowRoot.getElementById(errorId);
    if (errorEl) {
      errorEl.classList.remove('show');
    }
  }
}

customElements.define('medical-calculator', MedicalCalculator);
