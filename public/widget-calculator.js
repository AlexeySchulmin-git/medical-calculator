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
      per_km: 45,
      base_fixed_add: 0,
      base_coeff: 0,
      oxygen_fee: 800,
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
    } catch (err) {
      console.warn('loadPricing error:', err.message);
    }
    // Восстанавливаем форму ПОСЛЕ загрузки pricing — чтобы bonus был доступен
    this.restoreFormState();
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
          max-width: 100%;
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

        .calculator-inner {
          max-width: 600px;
          margin: 0 auto;
        }

        .calculator-price-col {
          display: none;
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

        .info-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #94a3b8;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          font-style: normal;
          cursor: help;
          margin-left: 6px;
          vertical-align: middle;
          position: relative;
          flex-shrink: 0;
        }

        .info-icon .tooltip {
          display: none;
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
          background: #1e293b;
          color: #f1f5f9;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
          padding: 8px 12px;
          border-radius: 8px;
          width: 260px;
          white-space: normal;
          z-index: 100;
          pointer-events: none;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .info-icon .tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #1e293b;
        }

        .info-icon:hover .tooltip {
          display: block;
        }

        .label-row {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }

        .label-row .form-label {
          margin-bottom: 0;
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

        .form-input.hint {
          border-color: #d1d5db;
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
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          max-height: 300px;
          overflow-y: auto;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          z-index: 1000;
          margin-top: 4px;
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

        .suggestion-value mark {
          background: #fef3c7;
          color: #92400e;
          font-weight: 600;
          padding: 0;
        }

        .suggestion-data {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        .field-error {
          color: #ef4444;
          font-size: 12px;
          margin-top: 4px;
          display: none;
        }

        .field-error.show {
          display: block;
        }

        .field-hint {
          color: #6b7280;
          font-size: 12px;
          margin-bottom: 4px;
          display: none;
        }

        .field-hint.show {
          display: block;
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
          background: white;
          color: #1f2937;
          padding: 20px;
          border-radius: 16px;
          margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
          transition: all 0.3s ease;
          border: 1px solid #e5e7eb;
        }

        .result-price {
          font-size: 48px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #4279F6;
        }

        @media (min-width: 900px) {
          .result-price {
            font-size: 30px;
          }
        }

        .result-details {
          font-size: 14px;
          color: #6b7280;
        }

        .result-note {
          font-size: 12px;
          color: #9ca3af;
          margin-top: 8px;
        }

        .result-options {
          margin-top: 12px;
          font-size: 13px;
        }

        .result-options-title {
          font-weight: 600;
          margin-bottom: 8px;
          color: #374151;
        }

        .result-option-tag {
          display: inline-block;
          background: #56CA6F;
          color: white;
          border-radius: 12px;
          padding: 4px 12px;
          margin: 4px 4px 0 0;
          font-size: 12px;
          font-weight: 500;
        }

        .success-message {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
          padding: 20px;
          border-radius: 12px;
          text-align: center;
          font-size: 15px;
          font-weight: 600;
          margin-top: 24px;
        }

        .success-message .success-title {
          font-size: 18px;
          margin-bottom: 8px;
        }

        .success-message .success-sub {
          font-size: 13px;
          font-weight: 400;
          color: #4ade80;
          margin-top: 4px;
        }

        .success-message .bonus-earned-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #dcfce7;
          border: 1px solid #86efac;
          color: #15803d;
          border-radius: 20px;
          padding: 6px 16px;
          font-size: 14px;
          font-weight: 700;
          margin-top: 12px;
        }

        .loyalty-block {
          background: #eff6ff;
          border: 1.5px solid #bfdbfe;
          border-radius: 10px;
          padding: 12px 14px;
          margin-top: 10px;
          font-size: 13px;
        }

        .loyalty-block.has-balance {
          background: #f0fdf4;
          border-color: #86efac;
        }

        .loyalty-block .lb-title {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .loyalty-block.has-balance .lb-title {
          color: #15803d;
        }

        .loyalty-block .lb-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 6px;
        }

        .loyalty-block .lb-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: #3b82f6;
          flex-shrink: 0;
        }

        .loyalty-block .lb-label {
          font-size: 13px;
          color: #374151;
          cursor: pointer;
          line-height: 1.4;
        }

        .loyalty-block .lb-hint {
          font-size: 11px;
          color: #6b7280;
          margin-top: 4px;
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

        @media (max-width: 768px) {
          .result-card {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            top: auto;
            margin: 0;
            padding: 16px;
            border-radius: 16px 16px 0 0;
            box-shadow: 0 -2px 12px rgba(0,0,0,0.12);
            z-index: 1000;
          }

          .result-card.hidden {
            transform: translateY(100%);
          }

          .result-price {
            font-size: 36px;
          }

          .result-details {
            font-size: 13px;
          }

          .result-note {
            font-size: 11px;
          }

          .result-option-tag {
            font-size: 11px;
            padding: 3px 10px;
          }
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
            font-size: 24px;
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

        <div class="calculator-inner">
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
            <div class="field-hint" id="fromAddressHint"></div>
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
            <div class="field-hint" id="toAddressHint"></div>
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
              <select id="weight" name="weight" class="form-input">
                <option value="">— Выберите —</option>
                <option value="50">до 50 кг</option>
                <option value="70">51–70 кг</option>
                <option value="90">71–90 кг</option>
                <option value="110">91–110 кг</option>
                <option value="130">111–130 кг</option>
                <option value="150">131–150 кг</option>
                <option value="200">более 150 кг</option>
              </select>
              <div class="field-error" id="weightError"></div>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <div class="label-row">
                <label class="form-label required" for="floorDescent">Спуск без лифта</label>
                <span class="info-icon">i
                  <span class="tooltip">Если пациент может находиться в сидячем положении и есть пассажирский лифт или есть грузовой лифт, оставьте «<strong>Не нужен</strong>»</span>
                </span>
              </div>
              <select id="floorDescent" name="floor_descent" class="form-input">
                <option value="0">Не нужен</option>
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
              <div class="label-row">
                <label class="form-label required" for="floorAscent">Подъём без лифта</label>
                <span class="info-icon">i
                  <span class="tooltip">Если пациент может находиться в сидячем положении и есть пассажирский лифт или есть грузовой лифт, оставьте «<strong>Не нужен</strong>»</span>
                </span>
              </div>
              <select id="floorAscent" name="floor_ascent" class="form-input">
                <option value="0">Не нужен</option>
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
            <label class="form-label required" for="diagnosis">Диагноз</label>
            <select id="diagnosis" name="diagnosis" class="form-input">
              <option value="">Выберите диагноз</option>
              <option value="Инсульт">Инсульт</option>
              <option value="Перелом шейки бедра">Перелом шейки бедра</option>
              <option value="Онкология">Онкология</option>
              <option value="Инфаркт">Инфаркт</option>
              <option value="other">Свой вариант</option>
            </select>
            <div class="field-error" id="diagnosisError"></div>
          </div>

          <div class="form-group" id="diagnosisCustomGroup" style="display:none;">
            <label class="form-label required" for="diagnosisCustom">Укажите диагноз</label>
            <input
              type="text"
              id="diagnosisCustom"
              name="diagnosis_custom"
              class="form-input"
              placeholder="Введите диагноз"
              autocomplete="off"
            />
            <div class="field-error" id="diagnosisCustomError"></div>
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

          <div id="loyaltyBlock" class="loyalty-block hidden"></div>

          <div class="form-group">
            <label class="form-label" for="email">Email</label>
            <div class="input-wrapper">
              <input 
                type="text" 
                id="email" 
                name="email"
                class="form-input" 
                placeholder="Введите для получения деталей заказа"
                autocomplete="email"
              />
              <button type="button" class="clear-btn" id="clearEmail" title="Очистить">×</button>
            </div>
            <div class="field-error" id="emailError"></div>
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
                checked
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
      </div>
    `;
  }

  saveFormState() {
    const sr = this.shadowRoot;
    // Сохраняем последнюю цену если блок видим
    const resultCard = sr.getElementById('resultCard');
    if (resultCard && !resultCard.classList.contains('hidden') && this._lastPrice) {
      try {
        localStorage.setItem('medcalc_price', JSON.stringify({
          price: this._lastPrice,
          distanceData: this._lastDistanceData || {}
        }));
      } catch (_) {}
    }
    const state = {
      fromAddress: sr.getElementById('fromAddress')?.value || '',
      fromLat:     sr.getElementById('fromAddress')?.dataset.lat || '',
      fromLon:     sr.getElementById('fromAddress')?.dataset.lon || '',
      toAddress:   sr.getElementById('toAddress')?.value || '',
      toLat:       sr.getElementById('toAddress')?.dataset.lat || '',
      toLon:       sr.getElementById('toAddress')?.dataset.lon || '',
      phone:       sr.getElementById('phone')?.value || '',
      email:       sr.getElementById('email')?.value || '',
      weight:      sr.getElementById('weight')?.value || '',
      diagnosis:   sr.getElementById('diagnosis')?.value || '',
      diagnosisCustom: sr.getElementById('diagnosisCustom')?.value || '',
      comment:     sr.getElementById('comment')?.value || '',
      floorDescent: sr.getElementById('floorDescent')?.value || '0',
      floorAscent:  sr.getElementById('floorAscent')?.value || '0',
      escortCount:  sr.getElementById('escortCount')?.value || '1',
      needOxygen:   sr.getElementById('needOxygen')?.checked || false,
      medEscort:    sr.getElementById('medEscort')?.checked || false,
      roundTrip:    sr.getElementById('roundTrip')?.checked || false,
    };
    try { localStorage.setItem('medcalc_form', JSON.stringify(state)); } catch (_) {}
  }

  restoreFormState() {
    let state;
    try { state = JSON.parse(localStorage.getItem('medcalc_form') || 'null'); } catch (_) {}
    if (!state) return;
    const sr = this.shadowRoot;
    const set = (id, val) => { const el = sr.getElementById(id); if (el) el.value = val; };
    const setChk = (id, val) => { const el = sr.getElementById(id); if (el) el.checked = !!val; };

    if (state.fromAddress) {
      const el = sr.getElementById('fromAddress');
      if (el) { el.value = state.fromAddress; el.dataset.lat = state.fromLat || ''; el.dataset.lon = state.fromLon || ''; }
      const btn = sr.getElementById('clearFromAddress');
      if (btn && state.fromAddress) btn.classList.add('visible');
    }
    if (state.toAddress) {
      const el = sr.getElementById('toAddress');
      if (el) { el.value = state.toAddress; el.dataset.lat = state.toLat || ''; el.dataset.lon = state.toLon || ''; }
      const btn = sr.getElementById('clearToAddress');
      if (btn && state.toAddress) btn.classList.add('visible');
    }
    set('phone', state.phone);
    set('email', state.email);
    set('weight', state.weight);
    set('diagnosis', state.diagnosis);
    set('diagnosisCustom', state.diagnosisCustom);
    set('comment', state.comment);
    set('floorDescent', state.floorDescent);
    set('floorAscent', state.floorAscent);
    set('escortCount', state.escortCount);
    setChk('needOxygen', state.needOxygen);
    setChk('medEscort', state.medEscort);
    setChk('roundTrip', state.roundTrip);

    if (state.diagnosis === 'other' && state.diagnosisCustom) {
      const g = sr.getElementById('diagnosisCustomGroup');
      if (g) g.style.display = 'block';
    }
    if (state.medEscort) {
      const h = sr.getElementById('medEscortHint');
      if (h) h.style.display = 'block';
    }

    // Автозагрузка баланса бонусов если телефон восстановлен
    if (state.phone) {
      const digits = state.phone.replace(/\D/g, '');
      if (digits.length === 11) {
        setTimeout(() => this.checkLoyaltyBalance(state.phone), 500);
      }
    }

    // Восстанавливаем блок цены если был рассчитан
    try {
      const savedPrice = JSON.parse(localStorage.getItem('medcalc_price') || 'null');
      if (savedPrice && savedPrice.price) {
        this._lastPrice = savedPrice.price;
        this._lastDistanceData = savedPrice.distanceData || {};
        setTimeout(() => this.showResult(savedPrice.price, savedPrice.distanceData || {}), 100);
      }
    } catch (_) {}
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
    this.setupClearButton('clearComment', this.shadowRoot.getElementById('comment'));

    // Логика диагноза: показываем поле ввода при выборе "Свой вариант"
    const diagnosisSelect = this.shadowRoot.getElementById('diagnosis');
    const diagnosisCustomGroup = this.shadowRoot.getElementById('diagnosisCustomGroup');
    const diagnosisCustom = this.shadowRoot.getElementById('diagnosisCustom');
    diagnosisSelect.addEventListener('change', () => {
      const isOther = diagnosisSelect.value === 'other';
      diagnosisCustomGroup.style.display = isOther ? 'block' : 'none';
      if (!isOther) {
        diagnosisCustom.value = '';
        this.hideError('diagnosisCustomError');
        diagnosisCustom.classList.remove('error');
      }
      diagnosisSelect.classList.remove('error');
      this.hideError('diagnosisError');
    });

    // Blur-валидация на лету для всех полей
    this.setupBlurValidation();

    // Обработка изменений select-полей (без визуальной валидации)
    [this.shadowRoot.getElementById('floorDescent'),
     this.shadowRoot.getElementById('floorAscent'),
     this.shadowRoot.getElementById('escortCount')].forEach(el => {
      el.addEventListener('change', () => {
        el.classList.remove('success', 'error');
      });
    });

    const medEscort = this.shadowRoot.getElementById('medEscort');
    const medEscortHint = this.shadowRoot.getElementById('medEscortHint');
    const roundTrip = this.shadowRoot.getElementById('roundTrip');
    const waitingHint = this.shadowRoot.getElementById('waitingHint');

    // Логика мед. сопровождения
    medEscort.addEventListener('change', () => {
      medEscortHint.style.display = medEscort.checked ? 'block' : 'none';
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

    // Автоматический расчет при изменении параметров + сохранение состояния
    [fromAddress, toAddress, weight,
     this.shadowRoot.getElementById('floorDescent'),
     this.shadowRoot.getElementById('floorAscent'),
     this.shadowRoot.getElementById('needOxygen'),
     this.shadowRoot.getElementById('escortCount')].forEach(el => {
      el.addEventListener('change', () => { this.autoCalculate(); this.saveFormState(); });
    });

    // Сохранение текстовых полей при вводе
    [phone, email, weight,
     this.shadowRoot.getElementById('comment'),
     this.shadowRoot.getElementById('diagnosisCustom')].forEach(el => {
      if (el) el.addEventListener('input', () => this.saveFormState());
    });
    this.shadowRoot.getElementById('diagnosis').addEventListener('change', () => this.saveFormState());
    this.shadowRoot.getElementById('medEscort').addEventListener('change', () => this.saveFormState());
    this.shadowRoot.getElementById('roundTrip').addEventListener('change', () => this.saveFormState());

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
    const phone = this.shadowRoot.getElementById('phone');
    const email = this.shadowRoot.getElementById('email');

    fromAddress.addEventListener('blur', () => {
      if (!fromAddress.value.trim()) {
        this.showError('fromAddressError', 'Укажите адрес отправления');
        fromAddress.classList.add('error');
        fromAddress.classList.remove('success');
      } else if (fromAddress.dataset.lat && fromAddress.dataset.lon) {
        this.hideError('fromAddressError');
        fromAddress.classList.remove('error');
        fromAddress.classList.add('success');
      } else {
        this.hideError('fromAddressError');
        fromAddress.classList.remove('error', 'success');
      }
    });

    toAddress.addEventListener('blur', () => {
      if (!toAddress.value.trim()) {
        this.showError('toAddressError', 'Укажите адрес назначения');
        toAddress.classList.add('error');
        toAddress.classList.remove('success');
      } else if (toAddress.dataset.lat && toAddress.dataset.lon) {
        this.hideError('toAddressError');
        toAddress.classList.remove('error');
        toAddress.classList.add('success');
      } else {
        this.hideError('toAddressError');
        toAddress.classList.remove('error', 'success');
      }
    });


    phone.addEventListener('input', () => {
      const digits = phone.value.replace(/\D/g, '');
      if (digits.length === 11) {
        phone.classList.add('success');
        phone.classList.remove('error');
        this.hideError('phoneError');
        this.checkLoyaltyBalance(phone.value);
      } else {
        phone.classList.remove('success');
        this.hideLoyaltyBlock();
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
        this.checkLoyaltyBalance(phone.value);
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
    const PREFIX = '+7 (';
    const PREFIX_LEN = PREFIX.length;
    // Позиции цифр в отформатированной строке: +7 (XXX) XXX-XX-XX
    // Индексы символов где стоят цифры (0-based):
    // 4,5,6 — код, 9,10,11 — первые 3, 13,14 — следующие 2, 16,17 — последние 2
    const DIGIT_POSITIONS = [4, 5, 6, 9, 10, 11, 13, 14, 16, 17];

    function getDigits(val) {
      const raw = val.replace(/\D/g, '');
      if (raw.startsWith('7')) return raw.substring(1);
      if (raw.startsWith('8')) return raw.substring(1);
      return raw;
    }

    function applyMask(val) {
      const digits = getDigits(val).substring(0, 10);
      if (digits.length === 0) return PREFIX;
      const d = digits.padEnd(10, ' ');
      let result = `+7 (${d.substring(0,3)}`;
      if (digits.length >= 3) result += `) ${d.substring(3,6)}`;
      else result = `+7 (${digits}`;
      if (digits.length >= 6) result += `-${d.substring(6,8)}`;
      if (digits.length >= 8) result += `-${d.substring(8,10)}`;
      return result.trimEnd();
    }

    input.value = PREFIX;

    input.addEventListener('keydown', (e) => {
      const val = e.target.value;
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;

      if (e.key === 'Backspace') {
        e.preventDefault();
        if (start === end) {
          // Нет выделения — удаляем символ слева от курсора
          // Ищем ближайшую цифру слева
          let pos = start - 1;
          while (pos >= PREFIX_LEN && !/\d/.test(val[pos])) pos--;
          if (pos < PREFIX_LEN) return; // защита префикса
          const digits = getDigits(val);
          // Определяем индекс цифры в массиве digits
          const digitIdx = DIGIT_POSITIONS.indexOf(pos);
          if (digitIdx === -1) return;
          const newDigits = digits.substring(0, digitIdx) + digits.substring(digitIdx + 1);
          const newVal = applyMask('7' + newDigits);
          input.value = newVal;
          // Ставим курсор на место удалённой цифры
          const newPos = DIGIT_POSITIONS[Math.min(digitIdx, newDigits.length)] ?? newVal.length;
          input.setSelectionRange(newPos, newPos);
        } else {
          // Есть выделение — удаляем выделенные цифры
          const digits = getDigits(val);
          const dStart = DIGIT_POSITIONS.findIndex(p => p >= start);
          const dEnd = DIGIT_POSITIONS.findIndex(p => p >= end);
          const s = dStart === -1 ? digits.length : dStart;
          const en = dEnd === -1 ? digits.length : dEnd;
          const newDigits = digits.substring(0, s) + digits.substring(en);
          input.value = applyMask('7' + newDigits);
          const newPos = DIGIT_POSITIONS[s] ?? input.value.length;
          input.setSelectionRange(newPos, newPos);
        }
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        const digits = getDigits(val);
        if (start === end) {
          let pos = start;
          while (pos < val.length && !/\d/.test(val[pos])) pos++;
          const digitIdx = DIGIT_POSITIONS.indexOf(pos);
          if (digitIdx === -1) return;
          const newDigits = digits.substring(0, digitIdx) + digits.substring(digitIdx + 1);
          input.value = applyMask('7' + newDigits);
          const newPos = DIGIT_POSITIONS[digitIdx] ?? input.value.length;
          input.setSelectionRange(newPos, newPos);
        }
        return;
      }
    });

    input.addEventListener('input', (e) => {
      const digits = getDigits(e.target.value).substring(0, 10);
      const newVal = applyMask('7' + digits);
      e.target.value = newVal;
      // Курсор: ставим на позицию следующей цифры для ввода
      const newPos = digits.length < 10
        ? (DIGIT_POSITIONS[digits.length] ?? newVal.length)
        : newVal.length;
      e.target.setSelectionRange(newPos, newPos);
    });

    input.addEventListener('focus', () => {
      if (!input.value.startsWith(PREFIX)) input.value = PREFIX;
      setTimeout(() => {
        const pos = input.value.length;
        input.setSelectionRange(pos, pos);
      }, 0);
    });

    input.addEventListener('click', () => {
      if (input.selectionStart < PREFIX_LEN) {
        input.setSelectionRange(PREFIX_LEN, PREFIX_LEN);
      }
    });
  }

  setupAddressSuggestions(input, suggestionsId) {
    const suggestionsDiv = this.shadowRoot.getElementById(suggestionsId);
    let timeout;
    
    // Состояние каскадного ввода
    if (!input.addressState) {
      input.addressState = {
        cityFiasId: null,
        settlementFiasId: null,
        streetFiasId: null,
        cityName: '',
        streetName: '',
        houseName: ''
      };
    }

    input.addEventListener('input', () => {
      clearTimeout(timeout);
      const query = input.value.trim();

      // Очищаем ошибку валидации при вводе
      const errorId = input.id + 'Error';
      this.hideError(errorId);
      input.classList.remove('error');

      // Проверяем, не удалил ли пользователь часть адреса
      this.detectAddressStateChange(input);

      // Обновляем подсказку в зависимости от состояния
      this.updateAddressHint(input);

      if (query.length < 2) {
        suggestionsDiv.classList.add('hidden');
        return;
      }

      timeout = setTimeout(async () => {
        try {
          const requestBody = { 
            query, 
            count: 10,
            restrict_value: true
          };
          
          // Каскадный выбор по документации DaData
          if (input.addressState.streetFiasId) {
            // Ищем дома на выбранной улице
            requestBody.locations = [{ street_fias_id: input.addressState.streetFiasId }];
            requestBody.from_bound = { value: 'house' };
            requestBody.to_bound = { value: 'house' };
          } else if (input.addressState.settlementFiasId) {
            // Ищем улицы в выбранном населённом пункте
            requestBody.locations = [{ settlement_fias_id: input.addressState.settlementFiasId }];
            requestBody.from_bound = { value: 'street' };
            requestBody.to_bound = { value: 'street' };
          } else if (input.addressState.cityFiasId) {
            // Ищем улицы в выбранном городе
            requestBody.locations = [{ city_fias_id: input.addressState.cityFiasId }];
            requestBody.from_bound = { value: 'street' };
            requestBody.to_bound = { value: 'street' };
          } else {
            // Ищем города и населённые пункты
            requestBody.from_bound = { value: 'city' };
            requestBody.to_bound = { value: 'settlement' };
          }

          const response = await fetch(`${this.apiUrl}/api/dadata/suggest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.apiKey
            },
            body: JSON.stringify(requestBody)
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
      }, 200);
    });

    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
        suggestionsDiv.classList.add('hidden');
      }
    });
  }

  renderSuggestions(suggestions, container, input) {
    console.log('🔍 renderSuggestions called with', suggestions.length, 'suggestions');
    console.log('📍 Current addressState:', input.addressState);
    
    const query = input.value.trim();
    
    container.innerHTML = suggestions.map(s => {
      const displayValue = s.value;
      const region = s.data?.region_with_type || '';
      const fiasLevel = s.data?.fias_level || '';
      
      // Подсвечиваем совпадения
      const highlightedValue = this.highlightMatch(displayValue, query);
      
      console.log('📝 Suggestion:', {
        value: s.value,
        fiasLevel,
        city: s.data?.city,
        settlement: s.data?.settlement,
        street: s.data?.street,
        house: s.data?.house,
        cityFiasId: s.data?.city_fias_id,
        settlementFiasId: s.data?.settlement_fias_id,
        streetFiasId: s.data?.street_fias_id
      });
      
      return `
      <div class="suggestion-item" 
           data-value="${s.value}" 
           data-unrestricted="${s.unrestricted_value || s.value}"
           data-lat="${s.data?.geo_lat || ''}" 
           data-lon="${s.data?.geo_lon || ''}"
           data-fias-level="${fiasLevel}"
           data-city="${s.data?.city || ''}"
           data-settlement="${s.data?.settlement || ''}"
           data-street="${s.data?.street || ''}"
           data-house="${s.data?.house || ''}"
           data-city-fias="${s.data?.city_fias_id || ''}"
           data-settlement-fias="${s.data?.settlement_fias_id || ''}"
           data-street-fias="${s.data?.street_fias_id || ''}">
        <div class="suggestion-value">${highlightedValue}</div>
        ${region && (fiasLevel === 'city' || fiasLevel === 'settlement') ? `<div class="suggestion-data">${region}</div>` : ''}
        ${s.data?.geo_lat ? `<div class="suggestion-data">📍 ${s.data.geo_lat}, ${s.data.geo_lon}</div>` : ''}
      </div>
    `;
    }).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const fiasLevel = item.dataset.fiasLevel;
        console.log('🖱️ Clicked suggestion:', {
          fiasLevel,
          city: item.dataset.city,
          settlement: item.dataset.settlement,
          street: item.dataset.street,
          house: item.dataset.house,
          cityFias: item.dataset.cityFias,
          settlementFias: item.dataset.settlementFias,
          streetFias: item.dataset.streetFias
        });
        
        // fias_level: 0-2=регион/район, 3-4=город, 5-6=населённый пункт, 7=улица, 8=дом
        if (fiasLevel === '3' || fiasLevel === '4' || fiasLevel === '5' || fiasLevel === '6') {
          // Выбран город или населённый пункт
          const cityName = item.dataset.city || item.dataset.settlement;
          console.log('🏙️ Selected city/settlement:', cityName, 'fiasLevel:', fiasLevel);
          input.addressState.cityName = cityName;
          input.addressState.cityFiasId = item.dataset.cityFias;
          input.addressState.settlementFiasId = item.dataset.settlementFias;
          console.log('💾 Updated addressState:', input.addressState);
          
          input.value = cityName + ', ';
          input.placeholder = 'Введите улицу';
          input.classList.remove('error');
          input.classList.add('hint');
          this.updateAddressHint(input);
          container.classList.add('hidden');
          setTimeout(() => input.focus(), 10);
          
        } else if (fiasLevel === '7') {
          // Выбрана улица
          const streetName = item.dataset.street;
          console.log('🛣️ Selected street:', streetName);
          input.addressState.streetName = streetName;
          input.addressState.streetFiasId = item.dataset.streetFias;
          console.log('💾 Updated addressState:', input.addressState);
          
          input.value = input.addressState.cityName + ', ' + streetName + ', ';
          input.placeholder = 'Введите номер дома';
          input.classList.remove('error');
          input.classList.add('hint');
          this.updateAddressHint(input);
          container.classList.add('hidden');
          
          // Автоматически показываем варианты домов
          setTimeout(() => {
            input.focus();
            // Триггерим поиск домов
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
          }, 100);
          
        } else if (fiasLevel === '8') {
          // Выбран дом
          let house = item.dataset.house;
          console.log('🏠 Selected house:', house);
          // Нормализуем номер дома: 1, д1, д 1 → д 1
          if (house && !/^д /.test(house) && !/^дом /.test(house)) {
            house = 'д ' + house.replace(/^д/, '').trim();
          }
          input.addressState.houseName = house;
          
          // Формируем компактный адрес для отображения (без индекса и области)
          const parts = [];
          if (input.addressState.cityName) parts.push(input.addressState.cityName);
          if (input.addressState.streetName) parts.push(input.addressState.streetName);
          if (house) parts.push(house);
          
          const finalAddress = parts.join(', ');
          console.log('✅ Final address:', finalAddress);
          console.log('📦 Full address for admin:', item.dataset.unrestricted);
          
          input.value = finalAddress;
          input.placeholder = 'Начните вводить адрес...';
          
          // Сохраняем полный адрес для админки
          input.dataset.fullAddress = item.dataset.unrestricted || item.dataset.value;
          input.dataset.lat = item.dataset.lat;
          input.dataset.lon = item.dataset.lon;
          input.classList.remove('hint');
          this.hideAddressHint(input);
          console.log('💾 Saved to dataset:', {
            fullAddress: input.dataset.fullAddress,
            lat: input.dataset.lat,
            lon: input.dataset.lon
          });
          
          // Сбрасываем состояние для нового ввода
          input.addressState = {
            cityFiasId: null,
            settlementFiasId: null,
            streetFiasId: null,
            cityName: '',
            streetName: '',
            houseName: ''
          };
          
          container.classList.add('hidden');
          input.classList.remove('error');
          input.classList.add('success');
          this.hideError(input.id + 'Error');
          console.log('🚀 Calling autoCalculate()');
          this.autoCalculate();
        } else {
          console.log('⚠️ Unknown fias_level:', fiasLevel);
          container.classList.add('hidden');
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
      options.push('Мед. сопровождение');
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


    // Фикс применяется только если оба адреса в одном фиксированном городе
    const bothInSameFixedCity = toRate && fromRate &&
      toRate.is_fixed_price && fromRate.is_fixed_price &&
      toRate.city_name === fromRate.city_name;

    let kmPrice = 0;
    if (bothInSameFixedCity) {
      kmPrice = parseFloat(toRate.value);
    } else {
      kmPrice = distance * (parseFloat(p.per_km) || 50);
      const rate = (toRate && !toRate.is_fixed_price ? toRate : null)
                || (fromRate && !fromRate.is_fixed_price ? fromRate : null);
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

    // --- Сопровождение: без сопровождения = +500 (повышенная ответственность) ---
    if (escortCount === 0) {
      price += parseFloat(p.no_escort_fee) || 500;
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

  async checkLoyaltyBalance(phone) {
    if (!this.pricing || !this.pricing.bonus) return;
    const block = this.shadowRoot.getElementById('loyaltyBlock');
    if (!block) return;
    try {
      const res = await fetch(`${this.apiUrl}/api/loyalty/balance?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      this._loyaltyBalance = parseInt(data.bonus_balance) || 0;
      this._loyaltyPercent = this.pricing.bonus.percent || 5;
      this._loyaltyPhone   = phone;
      this.renderLoyaltyBlock();
    } catch (_) {
      this.hideLoyaltyBlock();
    }
  }

  renderLoyaltyBlock() {
    const block = this.shadowRoot.getElementById('loyaltyBlock');
    if (!block) return;
    const balance  = this._loyaltyBalance || 0;
    const percent  = this._loyaltyPercent || 5;
    const price    = this.calculatedPrice || 0;
    const willEarn = price > 0 ? Math.round(price * percent / 100) : null;

    if (balance > 0) {
      block.className = 'loyalty-block has-balance';
      block.innerHTML = `
        <div class="lb-title">⭐ У вас ${balance.toLocaleString('ru')} бонусных баллов</div>
        <div class="lb-row">
          <input type="checkbox" class="lb-checkbox" id="useBonus">
          <label class="lb-label" for="useBonus">Списать <strong>${balance.toLocaleString('ru')} ₽</strong> бонусами</label>
        </div>
        ${willEarn ? `<div class="lb-hint">За этот заказ начислится ещё ~${willEarn} баллов</div>` : ''}
      `;
    } else {
      block.className = 'loyalty-block';
      block.innerHTML = `
        <div class="lb-title">⭐ Программа лояльности</div>
        <div style="color:#374151;font-size:13px">
          ${willEarn
            ? `За этот заказ вам начислится <strong>~${willEarn} бонусных баллов</strong> (1 балл = 1 ₽)`
            : `Оформите заказ и получайте бонусные баллы — ${percent}% от суммы`}
        </div>
      `;
    }
    block.classList.remove('hidden');
  }

  hideLoyaltyBlock() {
    this._loyaltyBalance = 0;
    this._loyaltyPhone   = null;
    const block = this.shadowRoot.getElementById('loyaltyBlock');
    if (block) block.classList.add('hidden');
  }

  showResult(price, distanceData) {
    // Сохраняем для восстановления после перезагрузки
    this._lastPrice = price;
    this._lastDistanceData = distanceData;
    try {
      localStorage.setItem('medcalc_price', JSON.stringify({ price, distanceData: distanceData || {} }));
    } catch (_) {}

    const resultCard = this.shadowRoot.getElementById('resultCard');
    const resultPrice = this.shadowRoot.getElementById('resultPrice');
    const resultDetails = this.shadowRoot.getElementById('resultDetails');
    const resultOptions = this.shadowRoot.getElementById('resultOptions');

    resultPrice.textContent = `${price.toLocaleString('ru-RU')} ₽`;

    const toAddr   = (this.shadowRoot.getElementById('toAddress')?.value   || '').toLowerCase();
    const fromAddr = (this.shadowRoot.getElementById('fromAddress')?.value || '').toLowerCase();
    const cityRates = this.pricing.city_rates || [];
    const findRate  = (addr) => cityRates.find(c => addr.includes(c.city_name.toLowerCase())) || null;
    const toRateR  = findRate(toAddr);
    const fromRateR = findRate(fromAddr);
    const hasFixed  = toRateR && fromRateR &&
      toRateR.is_fixed_price && fromRateR.is_fixed_price &&
      toRateR.city_name === fromRateR.city_name;

    let details = '';
    if (!hasFixed) {
      // Показываем А→Б (distance_display), полный маршрут скрыт от заказчика
      const displayDist = distanceData.distance_display ?? distanceData.distance;
      details = `Расстояние: ${displayDist} км`;
      if (distanceData.duration) {
        const hours = Math.floor(distanceData.duration / 60);
        const minutes = distanceData.duration % 60;
        details += ` • Время: ${hours > 0 ? hours + ' ч ' : ''}${minutes} мин`;
      }
      if (distanceData.provider === 'graphhopper') details += ' 🚗';
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

    // Обновляем блок лояльности с актуальной суммой начисления
    if (this._loyaltyPhone) this.renderLoyaltyBlock();
  }

  resetForm() {
    const ids = ['fromAddress','toAddress','weight','phone','email','comment'];
    ids.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) {
        el.value = '';
        delete el.dataset.lat;
        delete el.dataset.lon;
        el.classList.remove('success','error');
      }
    });
    // Сбрасываем кнопки очистки адресов
    ['clearFromAddress','clearToAddress','clearPhone','clearEmail'].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.classList.remove('visible');
    });
    ['escortCount'].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.value = '0';
    });
    // Этажи сбрасываем на «Не нужен» (value=0)
    ['floorDescent','floorAscent'].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.value = '0';
    });
    ['medEscort','needOxygen','roundTrip','personalData'].forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.checked = false;
    });
    const diag = this.shadowRoot.getElementById('diagnosis');
    if (diag) diag.selectedIndex = 0;
    const diagCustomGroup = this.shadowRoot.getElementById('diagnosisCustomGroup');
    if (diagCustomGroup) diagCustomGroup.style.display = 'none';
    const resultCard = this.shadowRoot.getElementById('resultCard');
    if (resultCard) resultCard.classList.add('hidden');
    // Сбрасываем все ошибки
    this.shadowRoot.querySelectorAll('.field-error.show').forEach(el => el.classList.remove('show'));
    this.calculatedDistance = null;
    this.calculatedPrice = null;
    this._lastPrice = null;
    this._lastDistanceData = null;
    try { localStorage.removeItem('medcalc_price'); } catch (_) {}
    this.hideLoyaltyBlock();
    // Очищаем сохранённое состояние формы — иначе restoreFormState восстановит поля
    try { localStorage.removeItem('medcalc_form'); } catch (_) {}
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
    const medEscort = this.shadowRoot.getElementById('medEscort');
    const roundTrip = this.shadowRoot.getElementById('roundTrip');
    const personalData = this.shadowRoot.getElementById('personalData');

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span> Отправка...';

    try {
      const orderData = {
        from_address: fromAddress.value,
        to_address: toAddress.value,
        weight: parseInt(weight.value) || 0,
        floor_descent: parseInt(this.shadowRoot.getElementById('floorDescent').value) || 0,
        floor_ascent: parseInt(this.shadowRoot.getElementById('floorAscent').value) || 0,
        medical_escort: medEscort.checked,
        med_escort_count: 1,
        escort_count: parseInt(this.shadowRoot.getElementById('escortCount').value) || 0,
        need_oxygen: this.shadowRoot.getElementById('needOxygen').checked,
        round_trip: roundTrip.checked,
        phone: phone.value,
        email: email.value,
        diagnosis: (() => {
          const sel = this.shadowRoot.getElementById('diagnosis');
          if (sel.value === 'other') return this.shadowRoot.getElementById('diagnosisCustom').value.trim();
          return sel.value;
        })(),
        comment: this.shadowRoot.getElementById('comment').value,
        personal_data: personalData.checked,
        distance: this.calculatedDistance?.distance || 0,
        bonus_used: (() => {
          const cb = this.shadowRoot.getElementById('useBonus');
          return (cb && cb.checked) ? (this._loyaltyBalance || 0) : 0;
        })()
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
        this.showSuccess(data.orderNumber, data.bonus_earned || 0, orderData.bonus_used || 0);
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

  showSuccess(orderNumber, bonusEarned, bonusUsed) {
    const form = this.shadowRoot.getElementById('calculatorForm');
    const successMessage = this.shadowRoot.getElementById('successMessage');

    let bonusHtml = '';
    if (bonusUsed > 0 && bonusEarned > 0) {
      bonusHtml = `
        <div class="bonus-earned-badge">⭐ Списано ${bonusUsed.toLocaleString('ru')} баллов · Начислено ${bonusEarned.toLocaleString('ru')} баллов</div>
      `;
    } else if (bonusEarned > 0) {
      bonusHtml = `
        <div class="bonus-earned-badge">⭐ Вам начислено ${bonusEarned.toLocaleString('ru')} бонусных баллов</div>
      `;
    } else if (bonusUsed > 0) {
      bonusHtml = `
        <div class="bonus-earned-badge">⭐ Списано ${bonusUsed.toLocaleString('ru')} бонусных баллов</div>
      `;
    }

    // Очищаем все поля перед показом успеха
    this.resetForm();

    form.classList.add('hidden');
    successMessage.innerHTML = `
      <div class="success-title">✅ Заявка принята!</div>
      <div>Номер заявки: <strong>№${orderNumber}</strong></div>
      <div class="success-sub">Мы свяжемся с вами в ближайшее время</div>
      ${bonusHtml}
    `;
    successMessage.classList.remove('hidden');
  }

  validateForm() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const weight = this.shadowRoot.getElementById('weight');
    const phone = this.shadowRoot.getElementById('phone');
    const email = this.shadowRoot.getElementById('email');
    const personalData = this.shadowRoot.getElementById('personalData');

    // Сбрасываем все ошибки перед повторной валидацией
    this.shadowRoot.querySelectorAll('.field-error.show').forEach(el => el.classList.remove('show'));
    this.shadowRoot.querySelectorAll('.error').forEach(el => el.classList.remove('error'));

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

    // Вес — обязательный
    const weightEl = this.shadowRoot.getElementById('weight');
    if (!weightEl?.value) {
      this.showError('weightError', 'Укажите вес пациента');
      weightEl.classList.add('error');
      isValid = false;
    } else {
      this.hideError('weightError');
      weightEl.classList.remove('error');
    }

    // Этажи спуска и подъёма — обязательные (значение 0 = «Не нужен» — допустимо)
    const floorDescentEl = this.shadowRoot.getElementById('floorDescent');
    const floorAscentEl  = this.shadowRoot.getElementById('floorAscent');
    if (floorDescentEl?.value === null || floorDescentEl?.value === undefined) {
      this.showError('floorDescentError', 'Укажите этаж спуска');
      floorDescentEl.classList.add('error');
      isValid = false;
    } else {
      this.hideError('floorDescentError');
      floorDescentEl.classList.remove('error');
    }
    if (floorAscentEl?.value === null || floorAscentEl?.value === undefined) {
      this.showError('floorAscentError', 'Укажите этаж подъёма');
      floorAscentEl.classList.add('error');
      isValid = false;
    } else {
      this.hideError('floorAscentError');
      floorAscentEl.classList.remove('error');
    }

    const diagnosisSel2 = this.shadowRoot.getElementById('diagnosis');
    const diagnosisCustomEl = this.shadowRoot.getElementById('diagnosisCustom');
    if (!diagnosisSel2.value) {
      this.showError('diagnosisError', 'Выберите диагноз');
      diagnosisSel2.classList.add('error');
      isValid = false;
    } else if (diagnosisSel2.value === 'other' && !diagnosisCustomEl.value.trim()) {
      this.showError('diagnosisCustomError', 'Введите диагноз');
      diagnosisCustomEl.classList.add('error');
      isValid = false;
    } else {
      this.hideError('diagnosisError');
      this.hideError('diagnosisCustomError');
      diagnosisSel2.classList.remove('error');
      diagnosisCustomEl.classList.remove('error');
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

    if (!isValid) {
      setTimeout(() => this.scrollToFirstError(), 50);
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

  scrollToFirstError() {
    const firstError = this.shadowRoot.querySelector('.field-error.show');
    if (firstError) {
      firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  hideError(errorId) {
    const errorEl = this.shadowRoot.getElementById(errorId);
    if (errorEl) {
      errorEl.classList.remove('show');
    }
  }

  updateAddressHint(input) {
    const hintId = input.id + 'Hint';
    const hintEl = this.shadowRoot.getElementById(hintId);
    if (!hintEl) return;

    const state = input.addressState;
    if (!state) return;

    let hintText = '';
    
    // Показываем подсказку ТОЛЬКО если уже что-то выбрано из DaData
    if ((state.cityFiasId || state.settlementFiasId) && !state.streetFiasId) {
      // Город выбран — ждём улицу
      hintText = 'Введите улицу';
    } else if (state.streetFiasId && !state.houseName) {
      // Улица выбрана — ждём дом
      hintText = 'Введите номер дома';
    }
    // В начальном состоянии (нет cityFiasId) — ничего не показываем

    if (hintText) {
      hintEl.textContent = hintText;
      hintEl.classList.add('show');
    } else {
      hintEl.classList.remove('show');
    }
  }

  hideAddressHint(input) {
    const hintId = input.id + 'Hint';
    const hintEl = this.shadowRoot.getElementById(hintId);
    if (hintEl) {
      hintEl.classList.remove('show');
    }
  }

  highlightMatch(text, query) {
    if (!query || query.length < 2) return text;
    
    // Убираем запятые и лишние пробелы из запроса
    const cleanQuery = query.replace(/,\s*/g, ' ').trim();
    const queryParts = cleanQuery.split(/\s+/);
    
    let result = text;
    queryParts.forEach(part => {
      if (part.length >= 2) {
        const regex = new RegExp(`(${part})`, 'gi');
        result = result.replace(regex, '<mark>$1</mark>');
      }
    });
    
    return result;
  }

  detectAddressStateChange(input) {
    const currentValue = input.value.trim();
    const state = input.addressState;
    
    if (!state) return;
    
    // Если поле пустое, сбрасываем всё состояние
    if (!currentValue) {
      input.addressState = {
        cityFiasId: null,
        settlementFiasId: null,
        streetFiasId: null,
        cityName: '',
        streetName: '',
        houseName: ''
      };
      delete input.dataset.lat;
      delete input.dataset.lon;
      delete input.dataset.fullAddress;
      input.classList.remove('hint', 'success');
      return;
    }
    
    // Проверяем, не удалил ли пользователь часть адреса
    // Если удалили дом, сбрасываем houseName
    if (state.houseName && !currentValue.includes(state.houseName)) {
      state.houseName = '';
      delete input.dataset.lat;
      delete input.dataset.lon;
      delete input.dataset.fullAddress;
      input.classList.remove('success');
    }
    
    // Если удалили улицу, сбрасываем streetName и houseName
    if (state.streetName && !currentValue.includes(state.streetName)) {
      state.streetName = '';
      state.streetFiasId = null;
      state.houseName = '';
      delete input.dataset.lat;
      delete input.dataset.lon;
      delete input.dataset.fullAddress;
      input.classList.remove('success');
    }
    
    // Если удалили город, сбрасываем всё
    if (state.cityName && !currentValue.includes(state.cityName)) {
      input.addressState = {
        cityFiasId: null,
        settlementFiasId: null,
        streetFiasId: null,
        cityName: '',
        streetName: '',
        houseName: ''
      };
      delete input.dataset.lat;
      delete input.dataset.lon;
      delete input.dataset.fullAddress;
      input.classList.remove('hint', 'success');
    }
  }
}

customElements.define('medical-calculator', MedicalCalculator);
