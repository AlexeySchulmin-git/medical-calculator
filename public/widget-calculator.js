// Медицинский калькулятор - одноэтапная форма, скриптовая валидация
class MedicalCalculator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.classList.add('mode-unresolved');
    this.apiUrl = this.getAttribute('api-url') || 'http://localhost:3003';
    this.apiKey = this.getAttribute('api-key') || 'test-api-key-12345';
    this.calculatedPrice = null;
    this.calculatedDistance = null;
    this.suggestionsCache = new Map();
    this.suggestionsCacheTtlMs = 60 * 1000;
    this.suggestionsReqSeq = 0;
    this.userGeo = null;
    this.userGeoRequested = false;
    this.calculatorFields = {
      medical_escort: true,
      need_oxygen: true,
      email: true,
      comment: true,
      trip_date: true,
    };
    this.widgetDisplayMode = 'hybrid';
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
    this._launcherHintTimer = null;
    this._launcherHintHideTimer = null;
    this._onExternalFocusIn = null;
    this._onDrawerEsc = null;
    this._onViewportResize = null;
    this._onCalculatorScroll = null;
  }

  applyBasePointAsDefaultFromAddress() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    if (!fromAddress) return;
    const hasValue = !!fromAddress.value.trim();
    const hasCoords = !!(fromAddress.dataset.lat && fromAddress.dataset.lon);
    if (hasValue || hasCoords) return;

    const baseCoords = this.companyBaseCoords || '';
    const [latRaw, lonRaw] = baseCoords.split(',').map((v) => Number(String(v).trim()));
    if (!Number.isFinite(latRaw) || !Number.isFinite(lonRaw)) return;

    fromAddress.value = this.companyBaseAddress || 'Базовая точка';
    fromAddress.dataset.lat = String(latRaw);
    fromAddress.dataset.lon = String(lonRaw);
    fromAddress.dataset.fullAddress = this.companyBaseAddress || fromAddress.value;
    fromAddress.classList.add('success');
    const clearBtn = this.shadowRoot.getElementById('clearFromAddress');
    if (clearBtn) clearBtn.classList.add('visible');
  }

  setupAddressOverflowAssist(input, echoId) {
    const echo = this.shadowRoot.getElementById(echoId);
    if (!input || !echo) return;

    const updateEcho = () => this.updateAddressEchoForInput(input, echo);
    const ensureCaretVisible = () => {
      const caret = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
      const end = input.value.length;
      if (caret >= end - 1) {
        input.scrollLeft = input.scrollWidth;
      } else if (caret <= 1) {
        input.scrollLeft = 0;
      }
    };

    input.addEventListener('pointerdown', () => {
      input.dataset.pointerFocus = '1';
    });

    input.addEventListener('focus', () => {
      requestAnimationFrame(() => {
        const end = input.value.length;
        input.setSelectionRange(end, end);
        ensureCaretVisible();
        updateEcho();
      });
    });

    input.addEventListener('click', () => requestAnimationFrame(ensureCaretVisible));
    input.addEventListener('keyup', () => requestAnimationFrame(ensureCaretVisible));

    input.addEventListener('input', () => {
      requestAnimationFrame(() => {
        ensureCaretVisible();
        updateEcho();
      });
    });

    input.addEventListener('change', updateEcho);
    window.addEventListener('resize', updateEcho);
    requestAnimationFrame(updateEcho);
  }

  updateAddressEchoForInput(input, echoEl) {
    const value = (input.value || '').trim();
    if (!value) {
      echoEl.classList.remove('show');
      echoEl.textContent = '';
      return;
    }

    const isOverflowing = this.isInputTextOverflowing(input, value);
    if (!isOverflowing) {
      echoEl.classList.remove('show');
      echoEl.textContent = '';
      return;
    }

    echoEl.textContent = value;
    echoEl.classList.add('show');
  }

  isInputTextOverflowing(input, value) {
    if (!value) return false;
    const style = window.getComputedStyle(input);
    const canvas = this._textMeasureCanvas || (this._textMeasureCanvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    if (!context) return input.scrollWidth > input.clientWidth + 2;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const textWidth = context.measureText(value).width;
    const horizontalPadding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const clearBtn = input.parentElement ? input.parentElement.querySelector('.clear-btn') : null;
    const clearButtonSpace = clearBtn && clearBtn.classList.contains('visible')
      ? (clearBtn.offsetWidth || 32) + 10
      : 10;
    const availableWidth = Math.max(0, input.clientWidth - horizontalPadding - clearButtonSpace);
    return textWidth > availableWidth;
  }

  initFrontendCustomSelects() {
    const selects = Array.from(this.shadowRoot.querySelectorAll('select.form-input'));
    selects.forEach((select) => {
      if (!select.id || select.dataset.customSelectInit === '1') return;
      select.dataset.customSelectInit = '1';

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select-w';
      wrapper.dataset.for = select.id;

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');

      const menu = document.createElement('div');
      menu.className = 'custom-select-menu';
      menu.setAttribute('role', 'listbox');

      const closeDropdown = () => {
        wrapper.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
      };

      const openDropdown = () => {
        wrapper.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
      };

      const focusActiveOrFirst = () => {
        const active = menu.querySelector('.custom-select-item.active') || menu.querySelector('.custom-select-item');
        if (active) active.focus();
      };

      const renderOptions = () => {
        menu.innerHTML = '';
        Array.from(select.options).forEach((opt) => {
          const item = document.createElement('div');
          item.className = 'custom-select-item';
          if (opt.value === select.value) item.classList.add('active');
          item.dataset.value = opt.value;
          item.textContent = opt.textContent || '';
          item.tabIndex = -1;
          item.setAttribute('role', 'option');
          item.setAttribute('aria-selected', opt.value === select.value ? 'true' : 'false');
          item.addEventListener('click', () => {
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            closeDropdown();
          });
          item.addEventListener('keydown', (event) => {
            const items = Array.from(menu.querySelectorAll('.custom-select-item'));
            const idx = items.indexOf(item);
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const next = items[Math.min(idx + 1, items.length - 1)];
              if (next) next.focus();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              const prev = items[Math.max(idx - 1, 0)];
              if (prev) prev.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              item.click();
              trigger.focus();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              closeDropdown();
              trigger.focus();
            }
          });
          menu.appendChild(item);
        });
      };

      const syncFromNative = () => {
        const selected = select.options[select.selectedIndex];
        trigger.textContent = (selected && selected.textContent) ? selected.textContent : 'Выберите';
        menu.querySelectorAll('.custom-select-item').forEach((item) => {
          const active = item.dataset.value === select.value;
          item.classList.toggle('active', active);
          item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
      };

      trigger.addEventListener('click', () => {
        const willOpen = !wrapper.classList.contains('open');
        this.shadowRoot.querySelectorAll('.custom-select-w.open').forEach((other) => {
          if (other !== wrapper) {
            other.classList.remove('open');
            const btn = other.querySelector('.custom-select-trigger');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        });
        if (willOpen) {
          openDropdown();
          requestAnimationFrame(focusActiveOrFirst);
        } else {
          closeDropdown();
        }
      });

      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDropdown();
          requestAnimationFrame(focusActiveOrFirst);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeDropdown();
        }
      });

      select.addEventListener('change', syncFromNative);

      renderOptions();
      syncFromNative();

      select.classList.add('native-select-hidden');
      select.insertAdjacentElement('afterend', wrapper);
      wrapper.appendChild(trigger);
      wrapper.appendChild(menu);
    });

    if (!this._onCustomSelectOutsideClick) {
      this._onCustomSelectOutsideClick = (event) => {
        const path = event.composedPath ? event.composedPath() : [];
        this.shadowRoot.querySelectorAll('.custom-select-w.open').forEach((openWrap) => {
          if (!path.includes(openWrap)) {
            openWrap.classList.remove('open');
            const btn = openWrap.querySelector('.custom-select-trigger');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        });
      };
      this.shadowRoot.addEventListener('click', this._onCustomSelectOutsideClick);
    }
  }

  connectedCallback() {
    this.render();
    this.updateCompactLayoutMode();
    this.attachEventListeners();
    this.loadPricing();
    this.ensureUserGeo();
    this._onViewportResize = () => this.updateCompactLayoutMode();
    window.addEventListener('resize', this._onViewportResize);
  }

  disconnectedCallback() {
    if (this._launcherHintTimer) clearTimeout(this._launcherHintTimer);
    if (this._launcherHintHideTimer) clearTimeout(this._launcherHintHideTimer);
    if (this._onExternalFocusIn) {
      document.removeEventListener('focusin', this._onExternalFocusIn, true);
      this._onExternalFocusIn = null;
    }
    if (this._onDrawerEsc) {
      document.removeEventListener('keydown', this._onDrawerEsc);
      this._onDrawerEsc = null;
    }
    if (this._onViewportResize) {
      window.removeEventListener('resize', this._onViewportResize);
      this._onViewportResize = null;
    }
    if (this._onCalculatorScroll) {
      const pageCalculator = this.shadowRoot?.querySelector('.calculator');
      if (pageCalculator) pageCalculator.removeEventListener('scroll', this._onCalculatorScroll);
      this._onCalculatorScroll = null;
    }
  }

  updateCompactLayoutMode() {
    const calculator = this.shadowRoot?.querySelector('.calculator');
    const calculatorWidth = calculator ? calculator.getBoundingClientRect().width : 0;
    const compact = window.innerWidth <= 900 || (calculatorWidth > 0 && calculatorWidth <= 560);
    this.classList.toggle('compact-layout', compact);
    this.syncResultCardVisibilityForDrawerMode();
  }

  syncResultCardVisibilityForDrawerMode() {
    const resultCard = this.shadowRoot?.getElementById('resultCard');
    if (!resultCard) return;

    const isDrawerMode = this.widgetDisplayMode === 'drawer_only' || this.widgetDisplayMode === 'hybrid';
    const isFormActive = this.classList.contains('drawer-form-active');

    if (isDrawerMode && !isFormActive) {
      resultCard.classList.add('hidden');
      resultCard.style.removeProperty('transform');
      return;
    }

    if (this._lastPrice && this.hasMinimumResultInputsValid()) {
      resultCard.classList.remove('hidden');
    }

    this.updateDrawerResultFollowScroll();
  }

  updateDrawerResultFollowScroll() {
    const resultCard = this.shadowRoot?.getElementById('resultCard');
    if (!resultCard) return;
    resultCard.style.removeProperty('transform');
  }

  async loadPricing() {
    try {
      const res = await fetch(`${this.apiUrl}/api/pricing/public`, {
        headers: {
          'X-API-Key': this.apiKey
        }
      });
      if (!res.ok) return;
      const data = await res.json();
      this.pricing = { ...this.pricing, ...data };
      this.calculatorFields = {
        ...this.calculatorFields,
        ...(data.calculator_fields || {})
      };
      this.widgetDisplayMode = data.widget_display_mode || 'hybrid';
      // Обновляем ссылки политики из настроек компании
      const company = data.company || {};
      this.companyBaseAddress = company.base_address || '';
      this.companyBaseCoords = company.base_coords || '';
      const policyLink    = this.shadowRoot.getElementById('policyLink');
      const agreementLink = this.shadowRoot.getElementById('agreementLink');
      if (policyLink    && company.policy_url)    policyLink.href    = company.policy_url;
      if (agreementLink && company.agreement_url) agreementLink.href = company.agreement_url;
      // Если расстояние уже было рассчитано — пересчитываем цену
      if (this.calculatedDistance) {
        this.updateResult();
      }
      this.applyCalculatorFieldVisibility();
      this.applyWidgetDisplayMode();
    } catch (err) {
      console.warn('loadPricing error:', err.message);
    } finally {
      this.classList.remove('mode-unresolved');
    }
    // Восстанавливаем форму ПОСЛЕ загрузки pricing — чтобы bonus был доступен
    this.restoreFormState();
  }

  render() {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        :host {
          display: block;
          font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 100%;
          margin: 0 auto;
          --border:         #e2e8f0;
          --w-primary:      ${this.getAttribute('primary-color')  || '#3b82f6'};
          --w-primary-dark: ${this.getAttribute('primary-dark')   || '#2563eb'};
          --w-bg:           ${this.getAttribute('bg-color')       || '#ffffff'};
          --w-radius:       ${this.getAttribute('border-radius')  || '16px'};
          --w-input-radius: ${this.getAttribute('input-radius')   || '8px'};
          --w-font-size:    ${this.getAttribute('font-size')      || '16px'};
          --w-accent-bg:    ${this.getAttribute('accent-bg')      || 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)'};
        }

        :host(:not(.mode-page_only):not(.mode-drawer_only):not(.mode-hybrid)) .calculator {
          visibility: hidden;
        }

        .calculator {
          background: var(--w-bg);
          border-radius: var(--w-radius);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07), 0 10px 20px rgba(0, 0, 0, 0.1);
          padding: 32px;
        }

        .launcher {
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 1100;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 999px;
          background: #ffffff;
          color: #2563eb;
          box-shadow: 0 10px 25px rgba(37, 99, 235, 0.24);
          padding: 8px 12px;
          cursor: pointer;
        }

        .launcher:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.3);
        }

        .launcher-icon {
          width: 30px;
          height: 30px;
          color: #2f80ed;
          flex-shrink: 0;
        }

        .launcher-text {
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          color: #2f80ed;
          white-space: nowrap;
        }

        .launcher-tooltip {
          position: fixed;
          right: 14px;
          bottom: 66px;
          z-index: 1101;
          background: #ffffff;
          color: #334155;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.35;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
          max-width: 240px;
          opacity: 0;
          transform: translateY(6px);
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }

        .launcher-tooltip.show {
          opacity: 1;
          transform: translateY(0);
        }

        .launcher-tooltip::after {
          content: '';
          position: absolute;
          right: 20px;
          top: 100%;
          border: 6px solid transparent;
          border-top-color: #ffffff;
        }

        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.38);
          z-index: 1110;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.22s ease;
        }

        .drawer {
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: min(430px, calc(100vw - 16px));
          background: #ffffff;
          z-index: 1111;
          box-shadow: -16px 0 36px rgba(2, 6, 23, 0.2);
          transform: translateX(102%);
          transition: transform 0.22s ease;
          display: flex;
          flex-direction: column;
        }

        .drawer.open {
          transform: translateX(0);
        }

        .drawer-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .drawer-head {
          padding: 14px 14px 10px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .drawer-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
        }

        .drawer-close {
          border: 0;
          background: #f1f5f9;
          color: #334155;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          padding: 0;
          cursor: pointer;
          font-size: 30px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .drawer-body {
          padding: 14px;
          overflow-y: auto;
        }

        .drawer-text {
          font-size: 14px;
          color: #334155;
          line-height: 1.45;
          margin-bottom: 12px;
        }

        .drawer-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .drawer-actions .btn {
          margin-top: 0;
        }

        .drawer-form-close {
          display: none;
        }

        :host(.mode-page_only) .launcher,
        :host(.mode-page_only) .launcher-tooltip,
        :host(.mode-page_only) .drawer,
        :host(.mode-page_only) .drawer-overlay {
          display: none !important;
        }

        :host(.mode-unresolved) .calculator {
          visibility: hidden;
        }

        :host(.mode-drawer_only) .drawer {
          display: none;
        }

        :host(.mode-hybrid) .drawer {
          display: none;
        }

        :host(.mode-drawer_only) .calculator {
          position: fixed;
          top: 0;
          right: -110vw;
          height: 100vh;
          width: min(430px, calc(100vw - 16px));
          max-width: none;
          border-radius: 0;
          transition: right 0.22s ease;
          z-index: 1111;
          overflow-y: auto;
          padding: 18px 14px 120px;
        }

        :host(.mode-hybrid.drawer-form-active) .calculator {
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: min(430px, calc(100vw - 16px));
          max-width: none;
          border-radius: 0;
          z-index: 1111;
          overflow-y: auto;
          padding: 18px 14px 120px;
          transition: right 0.22s ease;
        }

        :host(.mode-drawer_only) .calculator.open {
          right: 0;
        }

        :host(.mode-hybrid) .calculator {
          transition: right 0.22s ease;
        }

        :host(.mode-drawer_only) .drawer-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        :host(.mode-drawer_only) .drawer-form-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          background: #f1f5f9;
          color: #334155;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          padding: 0;
          cursor: pointer;
          font-size: 30px;
          line-height: 1;
          float: right;
          margin-bottom: 8px;
        }

        :host(.mode-hybrid.drawer-form-active) .drawer-form-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          background: #f1f5f9;
          color: #334155;
          border-radius: 8px;
          width: 32px;
          height: 32px;
          padding: 0;
          cursor: pointer;
          font-size: 30px;
          line-height: 1;
          float: right;
          margin-bottom: 8px;
        }

        .calculator-inner {
          max-width: 600px;
          margin: 0 auto;
          display: block;
        }

        .calculator-price-col {
          display: none;
        }

        .calculator-title {
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
          text-align: left;
        }

        .calculator-subtitle {
          font-size: 16px;
          color: #64748b;
          margin-bottom: 32px;
          text-align: left;
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

        .form-label[for]::before {
          content: '';
          display: inline-block;
          width: 14px;
          height: 14px;
          margin-right: 6px;
          vertical-align: -2px;
          background-repeat: no-repeat;
          background-position: center;
          background-size: 14px 14px;
          opacity: 0.86;
        }

        .form-label[for='fromAddress']::before,
        .form-label[for='toAddress']::before {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12 22s7-5.86 7-12a7 7 0 1 0-14 0c0 6.14 7 12 7 12z' stroke='%23475569' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='12' cy='10' r='2.5' stroke='%23475569' stroke-width='1.8'/%3E%3C/svg%3E");
        }

        .form-label[for='weight']::before {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M7 20h10l1.2-8.5A2 2 0 0 0 16.2 9H7.8a2 2 0 0 0-2 2.5L7 20z' stroke='%23475569' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M9.5 9a2.5 2.5 0 1 1 5 0' stroke='%23475569' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E");
        }

        .form-label[for='floorDescent']::before,
        .form-label[for='floorAscent']::before {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12 3v18M7 16l5 5 5-5M7 8l5-5 5 5' stroke='%23475569' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        }

        .form-label[for='phone']::before {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M22 16.92v2a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 3.1 4.18 2 2 0 0 1 5.1 2h2a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11l-.84.84a16 16 0 0 0 6.4 6.4l.84-.84a2 2 0 0 1 2.11-.45c.84.29 1.72.5 2.62.62A2 2 0 0 1 22 16.92z' stroke='%23475569' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
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
          right: auto;
          transform: translateX(-50%);
          background: #ffffff;
          color: #334155;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.5;
          padding: 8px 12px;
          border-radius: 8px;
          width: min(260px, calc(100vw - 48px));
          white-space: normal;
          z-index: 100;
          pointer-events: none;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }

        .info-icon .tooltip::after {
          content: '';
          position: absolute;
          top: 100%;
          left: 50%;
          right: auto;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #ffffff;
        }

        .form-row .form-group:first-child .info-icon .tooltip {
          left: 0;
          right: auto;
          transform: none;
        }

        .form-row .form-group:first-child .info-icon .tooltip::after {
          left: 12px;
          right: auto;
          transform: none;
        }

        .form-row .form-group:last-child .info-icon .tooltip {
          left: auto;
          right: 0;
          transform: none;
        }

        .form-row .form-group:last-child .info-icon .tooltip::after {
          left: auto;
          right: 12px;
          transform: none;
        }

        .address-echo {
          display: none;
          width: 100%;
          max-width: 100%;
          margin-bottom: 6px;
          color: #94a3b8;
          font-size: 13px;
          line-height: 1.35;
          white-space: normal;
          word-break: normal;
          overflow-wrap: anywhere;
        }

        .address-echo.show {
          display: block;
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

        select.form-input {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
          background: #ffffff;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' fill='none' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 12px 8px;
          padding-right: 38px;
        }

        select.form-input:hover {
          background-color: #f8fafc;
        }

        .native-select-hidden {
          display: none !important;
        }

        .custom-select-w {
          position: relative;
          width: 100%;
        }

        .custom-select-trigger {
          width: 100%;
          padding: 12px 38px 12px 16px;
          font-size: 16px;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
          background: #ffffff;
          text-align: left;
          color: #0f172a;
          cursor: pointer;
          position: relative;
        }

        .custom-select-trigger::after {
          content: '';
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          width: 12px;
          height: 8px;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' fill='none' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center / 12px 8px;
        }

        .custom-select-w.open .custom-select-trigger::after {
          transform: translateY(-50%) rotate(180deg);
        }

        .custom-select-trigger:hover {
          background-color: #f8fafc;
        }

        .custom-select-trigger:focus {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--w-primary) 16%, transparent), 0 8px 16px rgba(15, 23, 42, 0.12);
        }

        .custom-select-menu {
          display: none;
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          z-index: 30;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
          padding: 6px;
          max-height: 240px;
          overflow-y: auto;
        }

        .custom-select-w.open .custom-select-menu {
          display: block;
        }

        .custom-select-item {
          padding: 9px 10px;
          border-radius: 8px;
          font-size: 15px;
          color: #0f172a;
          cursor: pointer;
        }

        .custom-select-item:hover,
        .custom-select-item.active {
          background: #f8fafc;
        }

        select.form-input:focus {
          border: 1.5px solid var(--w-primary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--w-primary) 16%, transparent), 0 8px 16px rgba(15, 23, 42, 0.12);
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

        .suggestion-data .inline-ico {
          width: 12px;
          height: 12px;
          vertical-align: -2px;
          margin-right: 4px;
          color: #64748b;
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
          padding: 14px;
          border-radius: 16px;
          margin-bottom: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
          transition: all 0.3s ease;
          border: 1px solid #e5e7eb;
          position: relative;
          top: auto;
          width: 100%;
          max-width: 100%;
          margin: 0 0 24px;
          z-index: 10;
        }

        :host(:not(.compact-layout)) .result-card {
          position: sticky;
          bottom: 12px;
          z-index: 40;
        }

        :host(.compact-layout) .result-card {
          position: fixed !important;
          left: 8px;
          right: 8px;
          bottom: 8px;
          top: auto;
          margin: 0;
          max-width: 100%;
          z-index: 1000;
        }

        :host(.mode-drawer_only):not(.drawer-form-active) .result-card,
        :host(.mode-hybrid):not(.drawer-form-active) .result-card {
          display: none !important;
        }

        @media (min-width: 769px) {
          :host(.mode-drawer_only) .calculator,
          :host(.mode-hybrid.drawer-form-active) .calculator {
            padding-bottom: 130px;
          }

          :host(.mode-drawer_only) #calculatorForm,
          :host(.mode-hybrid.drawer-form-active) #calculatorForm {
            padding-bottom: 130px;
          }

          :host(.mode-drawer_only) .result-card,
          :host(.mode-hybrid.drawer-form-active) .result-card {
            position: fixed !important;
            left: auto;
            right: 25px;
            bottom: 8px;
            width: calc(min(430px, calc(100vw - 16px)) - 40px);
            max-width: calc(min(430px, calc(100vw - 16px)) - 40px);
            margin: 0;
            z-index: 1000;
          }

        }

        :host(.compact-layout) #calculatorForm {
          padding-bottom: 98px;
        }

        .result-top {
          display: block;
        }

        .result-main {
          min-width: 0;
        }

        .result-price {
          font-size: 34px;
          font-weight: 700;
          margin-bottom: 6px;
          color: #4279F6;
          will-change: transform, filter;
        }

        .result-price.price-updated {
          animation: resultPricePulse 420ms ease;
        }

        @keyframes resultPricePulse {
          0% { transform: scale(1); filter: brightness(1); }
          35% { transform: scale(1.06); filter: brightness(1.12); }
          100% { transform: scale(1); filter: brightness(1); }
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

        .result-details .inline-ico {
          width: 14px;
          height: 14px;
          vertical-align: -2px;
          margin-left: 4px;
          color: #64748b;
        }

        .result-note {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 6px;
        }

        .result-options {
          margin-top: 8px;
          font-size: 12px;
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
          padding: 3px 10px;
          margin: 4px 4px 0 0;
          font-size: 11px;
          font-weight: 500;
        }

        .result-cta {
          margin-top: 10px;
          width: 100%;
          display: none;
          font-size: 14px;
          padding: 10px 14px;
        }

        .result-cta.show {
          display: block;
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
          padding: 10px 12px;
          margin-bottom: 14px;
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
          .launcher {
            right: 8px;
            bottom: 72px;
            padding: 8px 10px;
            gap: 6px;
          }

          .launcher-icon {
            width: 24px;
            height: 24px;
          }

          .launcher-text {
            font-size: 12px;
          }

          .launcher-tooltip {
            right: 8px;
            bottom: 118px;
            max-width: 210px;
          }

          .info-icon .tooltip {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            width: min(260px, calc(100vw - 24px));
          }

          .info-icon .tooltip::after {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
          }

          .form-row .form-group:first-child .info-icon .tooltip,
          .form-row .form-group:last-child .info-icon .tooltip {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
          }

          .form-row .form-group:first-child .info-icon .tooltip::after,
          .form-row .form-group:last-child .info-icon .tooltip::after {
            left: 50%;
            right: auto;
            transform: translateX(-50%);
          }

          .drawer {
            width: calc(100vw - 10px);
          }

          :host(.mode-drawer_only) .calculator {
            width: calc(100vw - 10px);
          }

          :host(.mode-hybrid.drawer-form-active) .calculator {
            width: calc(100vw - 10px);
          }

          .calculator-inner { max-width: 100%; }

          .result-card {
            position: fixed !important;
            left: 8px;
            right: 8px;
            bottom: 8px;
            top: auto;
            margin: 0;
            max-width: 100%;
            border-radius: 12px;
            z-index: 1000;
            padding: 7px 8px;
            box-shadow: 0 -3px 14px rgba(0,0,0,0.14);
            max-height: 34vh;
            overflow-y: auto;
          }

          :host(.mode-drawer_only) .result-card,
          :host(.mode-hybrid.drawer-form-active) .result-card {
            left: auto;
            right: 5px;
            width: calc(100vw - 26px);
            max-width: calc(100vw - 26px);
          }

          .result-top {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
          }

          .result-main {
            flex: 1 1 auto;
          }

          .result-card.hidden {
            transform: translateY(120%);
          }

          .result-price {
            font-size: 19px;
            margin-bottom: 1px;
          }

          .result-details {
            font-size: 10px;
          }

          .result-note {
            display: none;
          }

          .result-option-tag {
            font-size: 9px;
            padding: 1px 7px;
            margin: 2px 3px 0 0;
          }

          .result-options {
            margin-top: 2px;
            max-height: none;
            overflow: visible;
          }

          .result-cta {
            font-size: 13px;
            line-height: 1.1;
            padding: 8px 16px!important;
            margin-top: 3px;
            margin-right: 17px;
            border-radius: 8px;
            min-height: 26px;
            width: auto;
            min-width: 110px;
            white-space: nowrap;
            flex-shrink: 0;
          }

          #calculatorForm {
            padding-bottom: 98px;
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

      <div class="launcher-tooltip" id="launcherTooltip" role="status" aria-live="polite">Рассчитайте точную стоимость поездки</div>
      <button type="button" class="launcher" id="launcherBtn" aria-label="Рассчитать стоимость">
        <svg class="launcher-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="8" y="4" width="48" height="56" rx="12" stroke="currentColor" stroke-width="4"/>
          <rect x="18" y="15" width="28" height="8" rx="4" fill="currentColor"/>
          <circle cx="21" cy="33" r="3" fill="currentColor"/>
          <circle cx="31" cy="33" r="3" fill="currentColor"/>
          <circle cx="41" cy="33" r="3" fill="currentColor"/>
          <circle cx="21" cy="44" r="3" fill="currentColor"/>
          <circle cx="31" cy="44" r="3" fill="currentColor"/>
          <rect x="37" y="40" width="12" height="8" rx="4" fill="currentColor"/>
        </svg>
        <span class="launcher-text">Рассчитать стоимость</span>
      </button>

      <div class="drawer-overlay" id="drawerOverlay"></div>
      <aside class="drawer" id="launcherDrawer" aria-hidden="true" aria-label="Панель быстрого расчёта">
        <div class="drawer-head">
          <div class="drawer-title">Быстрый расчёт</div>
          <button type="button" class="drawer-close" id="drawerCloseBtn" aria-label="Закрыть">×</button>
        </div>
        <div class="drawer-body">
          <p class="drawer-text">Откройте полный калькулятор на странице и получите точную стоимость с учётом всех параметров поездки.</p>
          <div class="drawer-actions">
            <button type="button" class="btn btn-primary" id="drawerGoToFormBtn">Перейти к форме</button>
            <button type="button" class="btn" id="drawerHideBtn">Скрыть</button>
          </div>
        </div>
      </aside>

      <div class="calculator">
        <button type="button" class="drawer-form-close" id="drawerFormCloseBtn" aria-label="Закрыть">×</button>
        <h1 class="calculator-title">Калькулятор перевозки</h1>
        <p class="calculator-subtitle">Рассчитайте стоимость поездки</p>

        <div class="calculator-inner">
          <div id="resultCard" class="result-card hidden">
            <div class="result-top">
              <div class="result-main">
                <div class="result-price" id="resultPrice">0 ₽</div>
                <div class="result-details" id="resultDetails"></div>
                <div class="result-note" id="resultNote">* без учёта платных дорог и выбранных опций. Не является публичной офертой.</div>
              </div>
              <button type="button" class="btn btn-primary result-cta" id="resultSubmitCta">Оставить заявку</button>
            </div>
            <div class="result-options" id="resultOptions"></div>
          </div>

          <form id="calculatorForm" autocomplete="off">
          <input type="text" name="fake_user" style="display:none;" tabindex="-1" aria-hidden="true" autocomplete="username" />
          <input type="password" name="fake_pass" style="display:none;" tabindex="-1" aria-hidden="true" autocomplete="current-password" />
          <div class="form-group">
            <label class="form-label required" for="fromAddress">Откуда забрать</label>
            <div class="address-echo" id="fromAddressEcho"></div>
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
            <div class="address-echo" id="toAddressEcho"></div>
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
            <label class="form-label" for="tripDate">Дата поездки</label>
            <div class="input-wrapper">
              <input
                type="date"
                id="tripDate"
                name="trip_date"
                class="form-input"
                min="${todayIso}"
              />
            </div>
            <div class="field-error" id="tripDateError"></div>
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
      } catch {}
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
      tripDate:    sr.getElementById('tripDate')?.value || '',
      comment:     sr.getElementById('comment')?.value || '',
      floorDescent: sr.getElementById('floorDescent')?.value || '0',
      floorAscent:  sr.getElementById('floorAscent')?.value || '0',
      escortCount:  sr.getElementById('escortCount')?.value || '1',
      needOxygen:   sr.getElementById('needOxygen')?.checked || false,
      medEscort:    sr.getElementById('medEscort')?.checked || false,
      roundTrip:    sr.getElementById('roundTrip')?.checked || false,
    };
    try { localStorage.setItem('medcalc_form', JSON.stringify(state)); } catch {}
  }

  restoreFormState() {
    let state;
    try { state = JSON.parse(localStorage.getItem('medcalc_form') || 'null'); } catch {}
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
    set('tripDate', state.tripDate);
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
      if (savedPrice && savedPrice.price && this.hasMinimumResultInputsValid()) {
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
    this.setupAddressOverflowAssist(fromAddress, 'fromAddressEcho');
    this.setupAddressOverflowAssist(toAddress, 'toAddressEcho');
    this.initFrontendCustomSelects();

    // Крестики очистки
    this.setupClearButton('clearFromAddress', fromAddress, () => {
      this.resetAddressInputState(fromAddress);
      const fromSuggestions = this.shadowRoot.getElementById('fromSuggestions');
      if (fromSuggestions) fromSuggestions.classList.add('hidden');
      this.clearResult();
    });
    this.setupClearButton('clearToAddress', toAddress, () => {
      this.resetAddressInputState(toAddress);
      const toSuggestions = this.shadowRoot.getElementById('toSuggestions');
      if (toSuggestions) toSuggestions.classList.add('hidden');
      this.clearResult();
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
     this.shadowRoot.getElementById('escortCount'),
     this.shadowRoot.getElementById('tripDate')].forEach(el => {
      if (!el) return;
      el.addEventListener('change', () => { this.autoCalculate(); this.saveFormState(); });
    });

    // Сохранение текстовых полей при вводе
    [phone, email, weight,
     this.shadowRoot.getElementById('comment'),
     this.shadowRoot.getElementById('diagnosisCustom')].forEach(el => {
      if (el) el.addEventListener('input', () => this.saveFormState());
    });
    [fromAddress, toAddress, weight].forEach(el => {
      if (!el) return;
      el.addEventListener('input', () => {
        if (!this.hasMinimumResultInputsValid()) this.clearResult();
      });
    });
    this.shadowRoot.getElementById('diagnosis').addEventListener('change', () => this.saveFormState());
    this.shadowRoot.getElementById('medEscort').addEventListener('change', () => this.saveFormState());
    this.shadowRoot.getElementById('roundTrip').addEventListener('change', () => this.saveFormState());

    // Отправка заявки
    this.shadowRoot.getElementById('submitBtn').addEventListener('click', () => {
      this.submitOrder();
    });

    this.initResultCtaObserver();
    this.initLauncherExperience();
  }

  initLauncherExperience() {
    const launcherBtn = this.shadowRoot.getElementById('launcherBtn');
    const tooltip = this.shadowRoot.getElementById('launcherTooltip');
    const drawer = this.shadowRoot.getElementById('launcherDrawer');
    const overlay = this.shadowRoot.getElementById('drawerOverlay');
    const drawerCloseBtn = this.shadowRoot.getElementById('drawerCloseBtn');
    const drawerGoToFormBtn = this.shadowRoot.getElementById('drawerGoToFormBtn');
    const drawerHideBtn = this.shadowRoot.getElementById('drawerHideBtn');
    const pageCalculator = this.shadowRoot.querySelector('.calculator');
    const drawerFormCloseBtn = this.shadowRoot.getElementById('drawerFormCloseBtn');
    if (!launcherBtn || !tooltip || !drawer || !overlay || !drawerCloseBtn || !drawerGoToFormBtn || !drawerHideBtn || !pageCalculator || !drawerFormCloseBtn) return;

    this.applyWidgetDisplayMode();
    this.updateDrawerResultFollowScroll();

    if (!this._onCalculatorScroll) {
      this._onCalculatorScroll = () => this.updateDrawerResultFollowScroll();
      pageCalculator.addEventListener('scroll', this._onCalculatorScroll, { passive: true });
    }

    const focusMainForm = () => {
      const fromAddress = this.shadowRoot.getElementById('fromAddress');
      const topTarget = this.shadowRoot.querySelector('.calculator');
      if (topTarget) topTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => fromAddress && fromAddress.focus(), 260);
    };

    const openDrawer = () => {
      this.hideLauncherHint();
      if (this.widgetDisplayMode === 'drawer_only' || this.widgetDisplayMode === 'hybrid') {
        this.classList.add('drawer-form-active');
        pageCalculator.classList.add('open');
      } else {
        drawer.classList.add('open');
      }
      overlay.classList.add('open');
      drawer.setAttribute('aria-hidden', this.widgetDisplayMode === 'drawer_only' ? 'true' : 'false');
      this.syncResultCardVisibilityForDrawerMode();
      try { sessionStorage.setItem('medcalc_hint_interacted', '1'); } catch {}
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      this.classList.remove('drawer-form-active');
      pageCalculator.classList.remove('open');
      overlay.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
      this.syncResultCardVisibilityForDrawerMode();
    };

    launcherBtn.addEventListener('click', () => {
      openDrawer();
    });

    drawerCloseBtn.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);
    drawerHideBtn.addEventListener('click', closeDrawer);
    drawerFormCloseBtn.addEventListener('click', closeDrawer);
    drawerGoToFormBtn.addEventListener('click', () => {
      closeDrawer();
      focusMainForm();
    });

    this._onDrawerEsc = (event) => {
      if (event.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', this._onDrawerEsc);

    launcherBtn.addEventListener('mouseenter', () => this.showLauncherHint('hover', 2500));
    launcherBtn.addEventListener('mouseleave', () => this.hideLauncherHint());

    let shouldShowTimedHint = true;
    try {
      const lastDismissed = Number(localStorage.getItem('medcalc_hint_dismissed_at') || '0');
      shouldShowTimedHint = Date.now() - lastDismissed > 24 * 60 * 60 * 1000;
    } catch {}

    if (shouldShowTimedHint) {
      this._launcherHintTimer = setTimeout(() => {
        this.showLauncherHint('timer', 5000);
      }, 10000);
    }

    this._onExternalFocusIn = (event) => {
      const target = event.target;
      if (!target) return;
      if (this.contains(target) || this.shadowRoot.contains(target)) return;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;

      const attrs = `${target.name || ''} ${target.id || ''} ${target.placeholder || ''}`.toLowerCase();
      const looksLikeRouteForm = /(from|to|address|адрес|куда|откуда|phone|телефон|contact)/.test(attrs);
      if (!looksLikeRouteForm) return;

      let interacted = false;
      try { interacted = sessionStorage.getItem('medcalc_hint_interacted') === '1'; } catch {}
      if (interacted) return;

      this.showLauncherHint('form_focus', 5000);
      try { sessionStorage.setItem('medcalc_hint_interacted', '1'); } catch {}
    };

    document.addEventListener('focusin', this._onExternalFocusIn, true);
  }

  showLauncherHint(reason, autoHideMs) {
    const tooltip = this.shadowRoot.getElementById('launcherTooltip');
    if (!tooltip) return;
    tooltip.textContent = this.getLauncherHintText();
    tooltip.dataset.reason = reason || '';
    tooltip.classList.add('show');

    if (this._launcherHintHideTimer) clearTimeout(this._launcherHintHideTimer);
    if (autoHideMs) {
      this._launcherHintHideTimer = setTimeout(() => this.hideLauncherHint(), autoHideMs);
    }
  }

  hideLauncherHint() {
    const tooltip = this.shadowRoot.getElementById('launcherTooltip');
    if (!tooltip) return;
    tooltip.classList.remove('show');
    try { localStorage.setItem('medcalc_hint_dismissed_at', String(Date.now())); } catch {}
  }

  getLauncherHintText() {
    const loyaltyEnabled = !!(this.pricing && this.pricing.bonus && this.pricing.bonus.enabled);
    if (loyaltyEnabled) {
      return 'Рассчитайте точную стоимость поездки и получите бонусы на следующие поездки';
    }
    return 'Рассчитайте точную стоимость поездки';
  }

  applyWidgetDisplayMode() {
    const host = this;
    const mode = ['page_only', 'drawer_only', 'hybrid'].includes(this.widgetDisplayMode)
      ? this.widgetDisplayMode
      : 'hybrid';
    this.widgetDisplayMode = mode;

    host.classList.remove('mode-page_only', 'mode-drawer_only', 'mode-hybrid');
    host.classList.add(`mode-${mode}`);

    const overlay = this.shadowRoot.getElementById('drawerOverlay');
    const drawer = this.shadowRoot.getElementById('launcherDrawer');
    const pageCalculator = this.shadowRoot.querySelector('.calculator');
    if (overlay) overlay.classList.remove('open');
    if (drawer) {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
    host.classList.remove('drawer-form-active');
    if (pageCalculator) pageCalculator.classList.remove('open');
  }

  applyCalculatorFieldVisibility() {
    const fields = this.calculatorFields || {};
    const cfg = [
      { key: 'medical_escort', id: 'medEscort' },
      { key: 'need_oxygen', id: 'needOxygen' },
      { key: 'email', id: 'email' },
      { key: 'comment', id: 'comment' },
      { key: 'diagnosis', id: 'diagnosis' },
      { key: 'escort_count', id: 'escortCount' },
      { key: 'round_trip', id: 'roundTrip' },
      { key: 'trip_date', id: 'tripDate' },
    ];

    cfg.forEach(({ key, id }) => {
      const el = this.shadowRoot.getElementById(id);
      if (!el) return;
      const group = el.closest('.form-group');
      if (!group) return;
      const visible = fields[key] !== false;
      group.style.display = visible ? '' : 'none';
      if (!visible) {
        if (el.type === 'checkbox') el.checked = false;
        else el.value = '';
      }
    });
  }

  initResultCtaObserver() {
    const submitBtn = this.shadowRoot.getElementById('submitBtn');
    const cta = this.shadowRoot.getElementById('resultSubmitCta');
    const resultCard = this.shadowRoot.getElementById('resultCard');
    if (!submitBtn || !cta || !resultCard) return;

    cta.addEventListener('click', () => {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => submitBtn.focus(), 300);
    });

    if (this._submitObserver) this._submitObserver.disconnect();
    this._submitObserver = new IntersectionObserver((entries) => {
      const visible = entries[0] && entries[0].isIntersecting;
      cta.classList.toggle('show', !visible);
      resultCard.classList.toggle('submit-visible', !!visible);
    }, {
      root: null,
      threshold: 0.15
    });
    this._submitObserver.observe(submitBtn);
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
    let activeController = null;
    let lastAppliedSeq = 0;
    
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

          const cacheKey = this.getSuggestionsCacheKey(input, requestBody);
          const cachedSuggestions = this.getCachedSuggestions(cacheKey);
          if (cachedSuggestions) {
            this.renderSuggestions(cachedSuggestions, suggestionsDiv, input);
            return;
          }

          if (activeController) {
            activeController.abort();
          }
          activeController = new AbortController();
          const reqSeq = ++this.suggestionsReqSeq;

          const response = await fetch(`${this.apiUrl}/api/dadata/suggest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': this.apiKey
            },
            body: JSON.stringify(requestBody),
            signal: activeController.signal
          });

          const data = await response.json();

          if (reqSeq < lastAppliedSeq) {
            return;
          }
          lastAppliedSeq = reqSeq;

          if (data.success && data.suggestions.length > 0) {
            const sorted = this.rankSuggestions(data.suggestions, query, input.addressState);
            this.setCachedSuggestions(cacheKey, sorted);
            this.renderSuggestions(sorted, suggestionsDiv, input);
          } else {
            suggestionsDiv.classList.add('hidden');
          }
        } catch (error) {
          if (error && error.name === 'AbortError') return;
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
    const step = this.getAddressSuggestionStep(input);
    const filteredSuggestions = (Array.isArray(suggestions) ? suggestions : []).filter((s) =>
      this.shouldKeepSuggestionForStep(s, step)
    );

    if (filteredSuggestions.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.innerHTML = filteredSuggestions.map(s => {
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
           data-fias-id="${s.data?.fias_id || ''}"
           data-region-fias="${s.data?.region_fias_id || ''}"
           data-lat="${s.data?.geo_lat || ''}" 
           data-lon="${s.data?.geo_lon || ''}"
           data-fias-level="${fiasLevel}"
           data-city="${s.data?.city || ''}"
           data-city-with-type="${s.data?.city_with_type || ''}"
           data-settlement="${s.data?.settlement || ''}"
           data-settlement-with-type="${s.data?.settlement_with_type || ''}"
           data-area-with-type="${s.data?.area_with_type || ''}"
           data-city-district-with-type="${s.data?.city_district_with_type || ''}"
           data-street="${s.data?.street || ''}"
           data-street-with-type="${s.data?.street_with_type || ''}"
           data-house="${s.data?.house || ''}"
           data-city-fias="${s.data?.city_fias_id || ''}"
           data-settlement-fias="${s.data?.settlement_fias_id || ''}"
           data-street-fias="${s.data?.street_fias_id || ''}">
        <div class="suggestion-value">${highlightedValue}</div>
        ${(() => {
          if (!['1', '3', '4', '5', '6'].includes(fiasLevel)) return '';
          const area = s.data?.area_with_type || '';
          const district = s.data?.city_district_with_type || '';
          const details = [district, area, region].filter(Boolean).join(', ');
          return details ? `<div class="suggestion-data">${details}</div>` : '';
        })()}
        ${s.data?.geo_lat ? `<div class="suggestion-data"><svg class="inline-ico" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 22s7-5.86 7-12a7 7 0 1 0-14 0c0 6.14 7 12 7 12z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>${s.data.geo_lat}, ${s.data.geo_lon}</div>` : ''}
      </div>
    `;
    }).join('');

    container.classList.remove('hidden');

    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', async () => {
        const fiasLevel = (item.dataset.fiasLevel || '').trim();
        const fiasLevelNum = parseInt(fiasLevel, 10);
        const isStreetLevel = fiasLevel === '7' || fiasLevelNum === 7;
        const isHouseLevel = fiasLevel === '8' || fiasLevelNum === 8 || (!!item.dataset.house && !!input.addressState?.streetFiasId);
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
        // Особый случай: федеральные города (например, Москва) могут приходить как fias_level=1.
        const isLocalityLevel = [1, 3, 4, 5, 6].includes(fiasLevelNum);
        const hasLocalityData = !!(item.dataset.city || item.dataset.settlement || item.dataset.cityWithType || item.dataset.settlementWithType);
        if (isLocalityLevel && hasLocalityData) {
          // Для fias 5-6 приоритет settlement, чтобы не подставлялся уровень выше.
          const isSettlement = fiasLevelNum === 5 || fiasLevelNum === 6;
          const localityCore = isSettlement
            ? (item.dataset.settlementWithType || item.dataset.settlement || item.dataset.cityWithType || item.dataset.city)
            : (item.dataset.cityWithType || item.dataset.city || item.dataset.settlementWithType || item.dataset.settlement);
          const localityName = this.buildLocalityLabel(item, localityCore);

          console.log('🏙️ Selected city/settlement:', localityName, 'fiasLevel:', fiasLevel);
          input.addressState.cityName = localityName;
          input.addressState.cityFiasId = item.dataset.cityFias || item.dataset.fiasId || item.dataset.regionFias || '';
          input.addressState.settlementFiasId = item.dataset.settlementFias || '';
          input.addressState.streetFiasId = null;
          input.addressState.streetName = '';
          input.addressState.houseName = '';
          console.log('💾 Updated addressState:', input.addressState);
          
          input.value = localityName + ', ';
          input.placeholder = 'Введите улицу';
          input.classList.remove('error');
          input.classList.add('hint');
          this.updateAddressEchoForInput(input, this.shadowRoot.getElementById(`${input.id}Echo`));
          this.updateAddressHint(input);
          container.classList.add('hidden');
          setTimeout(() => {
            input.focus();
            // Автоматически запрашиваем улицы для выбранного НП/города
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
          }, 100);
          
        } else if (isHouseLevel) {
          // Выбран дом
          const confirmed = await this.confirmHouseSelection(item.dataset.unrestricted || item.dataset.value || '');
          if (confirmed && confirmed.valid === false) {
            this.showError(input.id + 'Error', 'Выберите адрес до дома из подсказок');
            input.classList.add('error');
            container.classList.add('hidden');
            return;
          }

          const selectedData = confirmed?.valid ? (confirmed.suggestion?.data || {}) : null;
          let house = selectedData?.house || item.dataset.house;
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
          const fullAddress = confirmed?.valid
            ? (confirmed.suggestion?.unrestricted_value || confirmed.suggestion?.value || item.dataset.unrestricted || item.dataset.value)
            : (item.dataset.unrestricted || item.dataset.value);
          console.log('📦 Full address for admin:', fullAddress);
          
          input.value = finalAddress;
          input.placeholder = 'Начните вводить адрес...';
          
          // Сохраняем полный адрес для админки
          input.dataset.fullAddress = fullAddress;
          input.dataset.lat = selectedData?.geo_lat || item.dataset.lat;
          input.dataset.lon = selectedData?.geo_lon || item.dataset.lon;
          input.classList.remove('hint');
          this.updateAddressEchoForInput(input, this.shadowRoot.getElementById(`${input.id}Echo`));
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
        } else if (isStreetLevel) {
          // Выбрана улица
          const streetName = item.dataset.streetWithType || item.dataset.street;
          console.log('🛣️ Selected street:', streetName);
          input.addressState.streetName = streetName;
          input.addressState.streetFiasId = item.dataset.streetFias;
          console.log('💾 Updated addressState:', input.addressState);
          
          input.value = input.addressState.cityName + ', ' + streetName + ', ';
          input.placeholder = 'Введите номер дома';
          input.classList.remove('error');
          input.classList.add('hint');
          this.updateAddressEchoForInput(input, this.shadowRoot.getElementById(`${input.id}Echo`));
          this.updateAddressHint(input);
          container.classList.add('hidden');
          
          // Автоматически показываем варианты домов
          setTimeout(() => {
            input.focus();
            // Триггерим поиск домов
            const event = new Event('input', { bubbles: true });
            input.dispatchEvent(event);
          }, 100);
          
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

    if (!fromAddress.dataset.lat || !fromAddress.dataset.lon || !toAddress.dataset.lat || !toAddress.dataset.lon || !weight.value) {
      this.clearResult();
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

  ensureUserGeo() {
    if (this.userGeoRequested) return;
    this.userGeoRequested = true;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userGeo = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        };
      },
      () => {},
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 10 * 60 * 1000 }
    );
  }

  rankSuggestions(suggestions, query, state) {
    if (!Array.isArray(suggestions) || suggestions.length < 2) return suggestions || [];
    const q = String(query || '').trim().toLowerCase();
    const inStreetStep = !!state?.streetFiasId;
    return [...suggestions]
      .map((s, idx) => ({ s, idx, score: this.getSuggestionScore(s, q, inStreetStep) }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .map(x => x.s);
  }

  getAddressSuggestionStep(input) {
    const state = input?.addressState || {};
    if (state.streetFiasId) return 'house';
    if (state.settlementFiasId || state.cityFiasId) return 'street';
    return 'locality';
  }

  shouldKeepSuggestionForStep(suggestion, step) {
    const d = suggestion?.data || {};
    const level = parseInt(String(d.fias_level || '').trim(), 10);

    if (step === 'locality') {
      const isLocalityLevel = [1, 3, 4, 5, 6].includes(level);
      const hasLocalityData = !!(d.city || d.settlement || d.city_with_type || d.settlement_with_type);
      return isLocalityLevel && hasLocalityData;
    }

    if (step === 'street') {
      if (level !== 7) return false;
      if (!d.street && !d.street_with_type) return false;
      if (!d.street_fias_id) return false;
      return !this.isUnsupportedStreetEntity(d.street_with_type || d.street || suggestion?.value || '');
    }

    if (step === 'house') {
      const hasHouse = !!d.house;
      return level === 8 || hasHouse;
    }

    return true;
  }

  isUnsupportedStreetEntity(streetLabel) {
    const value = String(streetLabel || '').trim().toLowerCase();
    if (!value) return false;
    const blockedMarkers = ['тер ', 'тер.', 'территория', 'гпк', 'снт', 'днп', 'тсн'];
    return blockedMarkers.some(marker => value.includes(marker));
  }

  async confirmHouseSelection(unrestrictedValue) {
    const query = String(unrestrictedValue || '').trim();
    if (!query) return null;

    try {
      const response = await fetch(`${this.apiUrl}/api/dadata/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          query,
          count: 1,
          restrict_value: true
        })
      });

      if (!response.ok) return null;
      const data = await response.json();
      const suggestion = Array.isArray(data?.suggestions) ? data.suggestions[0] : null;
      if (!suggestion) {
        return { valid: false, reason: 'empty' };
      }

      const d = suggestion.data || {};
      const level = parseInt(String(d.fias_level || '').trim(), 10);
      const hasHouse = !!d.house || level === 8;
      const hasGeo = !!d.geo_lat && !!d.geo_lon;
      const streetLabel = d.street_with_type || d.street || suggestion.value || '';
      if (!hasHouse || !hasGeo || this.isUnsupportedStreetEntity(streetLabel)) {
        return { valid: false, reason: 'not_house_or_geo' };
      }

      return { valid: true, suggestion };
    } catch (error) {
      console.warn('[ADDRESS][CONFIRM] fallback to clicked suggestion', error?.message || error);
      return null;
    }
  }

  getSuggestionScore(s, query, inStreetStep) {
    let score = 0;
    const value = String(s?.value || '').toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);

    if (query && value.startsWith(query)) score += 120;
    for (const w of words) {
      if (w.length < 2) continue;
      if (value.startsWith(w)) score += 40;
      else if (value.includes(` ${w}`)) score += 25;
      else if (value.includes(w)) score += 10;
    }

    const level = parseInt(String(s?.data?.fias_level || '').trim(), 10);
    if (inStreetStep) {
      if (s?.data?.house) score += 200;
      if (level === 8) score += 150;
    } else {
      if ([1, 3, 4, 5, 6].includes(level)) score += 20;
    }

    if (this.userGeo && [1, 3, 4, 5, 6].includes(level)) {
      const lat = parseFloat(s?.data?.geo_lat);
      const lon = parseFloat(s?.data?.geo_lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
        const km = this.haversineKm(this.userGeo.lat, this.userGeo.lon, lat, lon);
        if (km < 15) score += 60;
        else if (km < 40) score += 35;
        else if (km < 80) score += 15;
      }
    }

    return score;
  }

  haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  resetAddressInputState(input) {
    if (!input) return;
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
    input.classList.remove('hint', 'success', 'error');
    this.hideAddressHint(input);
  }

  getSuggestionsCacheKey(input, requestBody) {
    const state = input.addressState || {};
    return JSON.stringify({
      q: String(requestBody.query || '').trim().toLowerCase(),
      b1: requestBody.from_bound?.value || '',
      b2: requestBody.to_bound?.value || '',
      city: state.cityFiasId || '',
      settlement: state.settlementFiasId || '',
      street: state.streetFiasId || ''
    });
  }

  getCachedSuggestions(cacheKey) {
    const entry = this.suggestionsCache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() - entry.ts > this.suggestionsCacheTtlMs) {
      this.suggestionsCache.delete(cacheKey);
      return null;
    }
    return entry.value;
  }

  setCachedSuggestions(cacheKey, suggestions) {
    this.suggestionsCache.set(cacheKey, { ts: Date.now(), value: suggestions });
    if (this.suggestionsCache.size > 200) {
      const oldestKey = this.suggestionsCache.keys().next().value;
      if (oldestKey) this.suggestionsCache.delete(oldestKey);
    }
  }

  buildLocalityLabel(item, localityCore) {
    const base = String(localityCore || '').trim();
    if (!base) return '';
    const district = String(item.dataset.cityDistrictWithType || '').trim();
    const area = String(item.dataset.areaWithType || '').trim();
    const extra = district || area;
    if (!extra) return base;

    const baseNorm = base.toLowerCase();
    const extraNorm = extra.toLowerCase();
    if (baseNorm.includes(extraNorm) || extraNorm.includes(baseNorm)) return base;

    return `${base}, ${extra}`;
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
    if (!this.calculatedDistance || !this.hasMinimumResultInputsValid()) {
      this.clearResult();
      return;
    }
    const price = this.calculatePrice(this.calculatedDistance.distance);
    this.calculatedPrice = price;
    this.showResult(price, this.calculatedDistance);
  }

  hasMinimumResultInputsValid() {
    const fromAddress = this.shadowRoot.getElementById('fromAddress');
    const toAddress = this.shadowRoot.getElementById('toAddress');
    const weight = this.shadowRoot.getElementById('weight');
    return !!(
      fromAddress?.value?.trim() && fromAddress.dataset.lat && fromAddress.dataset.lon &&
      toAddress?.value?.trim() && toAddress.dataset.lat && toAddress.dataset.lon &&
      weight?.value
    );
  }

  clearResult() {
    this.calculatedDistance = null;
    this.calculatedPrice = null;
    this._lastPrice = null;
    this._lastDistanceData = null;
    try { localStorage.removeItem('medcalc_price'); } catch (_) {}
    const resultCard = this.shadowRoot.getElementById('resultCard');
    if (resultCard) resultCard.classList.add('hidden');
    const resultOptions = this.shadowRoot.getElementById('resultOptions');
    if (resultOptions) resultOptions.innerHTML = '';
  }

  async checkLoyaltyBalance(phone) {
    if (!this.pricing || !this.pricing.bonus) return;
    const block = this.shadowRoot.getElementById('loyaltyBlock');
    if (!block) return;
    try {
      const res = await fetch(`${this.apiUrl}/api/loyalty/balance?phone=${encodeURIComponent(phone)}`, {
        headers: {
          'X-API-Key': this.apiKey
        }
      });
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
    const maxUsagePercent = Math.max(0, Math.min(100, parseFloat(this.pricing?.bonus?.max_usage_percent ?? 100) || 100));
    const maxUsableByBalancePercent = Math.floor(Math.max(0, balance) * maxUsagePercent / 100);
    const usableBonus = Math.max(0, Math.min(balance, maxUsableByBalancePercent, Math.max(0, price)));
    const willEarn = price > 0 ? Math.round(price * percent / 100) : null;

    if (balance > 0) {
      block.className = 'loyalty-block has-balance';
      block.innerHTML = `
        <div class="lb-title">⭐ У вас ${balance.toLocaleString('ru')} бонусных баллов</div>
        <div class="lb-row">
          <input type="checkbox" class="lb-checkbox" id="useBonus">
          <label class="lb-label" for="useBonus">Списать <strong>${usableBonus.toLocaleString('ru')} ₽</strong> бонусами</label>
        </div>
        ${willEarn ? `<div class="lb-hint">После завершения заявки начислится ~${willEarn} баллов</div>` : ''}
      `;
      const cb = block.querySelector('#useBonus');
      if (cb && usableBonus <= 0) {
        cb.disabled = true;
      }
    } else {
      block.className = 'loyalty-block';
      block.innerHTML = `
        <div class="lb-title">⭐ Программа лояльности</div>
        <div style="color:#374151;font-size:13px">
          ${willEarn
            ? `После завершения заявки вам начислится <strong>~${willEarn} бонусных баллов</strong> (1 балл = 1 ₽)`
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
    resultPrice.classList.remove('price-updated');
    void resultPrice.offsetWidth;
    resultPrice.classList.add('price-updated');
    if (this._priceAnimTimer) clearTimeout(this._priceAnimTimer);
    this._priceAnimTimer = setTimeout(() => {
      resultPrice.classList.remove('price-updated');
      this._priceAnimTimer = null;
    }, 450);

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
    let providerIconHtml = '';
    if (!hasFixed) {
      // Показываем А→Б (distance_display), полный маршрут скрыт от заказчика
      const displayDist = distanceData.distance_display ?? distanceData.distance;
      details = `Расстояние: ${displayDist} км`;
      if (distanceData.duration) {
        const hours = Math.floor(distanceData.duration / 60);
        const minutes = distanceData.duration % 60;
        details += ` • Время: ${hours > 0 ? hours + ' ч ' : ''}${minutes} мин`;
      }
      if (distanceData.provider === 'graphhopper') {
        providerIconHtml = " <svg class='inline-ico' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg' aria-hidden='true'><path d='M4 14l1.5-4.5A2 2 0 0 1 7.4 8h9.2a2 2 0 0 1 1.9 1.5L20 14' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/><path d='M4 14h16v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-2-2H8a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1v-4z' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/><circle cx='7.5' cy='16.5' r='1' fill='currentColor'/><circle cx='16.5' cy='16.5' r='1' fill='currentColor'/></svg>";
      }
    }
    resultDetails.innerHTML = `${details}${providerIconHtml}`;

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
    this.syncResultCardVisibilityForDrawerMode();

    // Обновляем блок лояльности с актуальной суммой начисления
    if (this._loyaltyPhone) this.renderLoyaltyBlock();
  }

  resetForm() {
    const ids = ['fromAddress','toAddress','weight','phone','email','comment','tripDate'];
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
    if (resultCard) {
      resultCard.classList.add('hidden');
    }
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
    const tripDate = this.shadowRoot.getElementById('tripDate');

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
        trip_datetime: (() => {
          const tripDate = this.shadowRoot.getElementById('tripDate')?.value || '';
          return tripDate ? `${tripDate}T00:00:00` : null;
        })(),
        personal_data: personalData.checked,
        distance: this.calculatedDistance?.distance || 0,
        bonus_used: (() => {
          const cb = this.shadowRoot.getElementById('useBonus');
          const maxUsagePercent = Math.max(0, Math.min(100, parseFloat(this.pricing?.bonus?.max_usage_percent ?? 100) || 100));
          const balance = this._loyaltyBalance || 0;
          const maxUsableByBalancePercent = Math.floor(Math.max(0, balance) * maxUsagePercent / 100);
          const allowedBonus = Math.max(0, Math.min(balance, maxUsableByBalancePercent, Math.max(0, this.calculatedPrice || 0)));
          return (cb && cb.checked) ? allowedBonus : 0;
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
    const tripDate = this.shadowRoot.getElementById('tripDate');

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

    const todayIso = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();
    if (tripDate?.value && tripDate.value < todayIso) {
      this.showError('tripDateError', 'Дата поездки не может быть в прошлом');
      tripDate.classList.add('error');
      isValid = false;
    } else {
      this.hideError('tripDateError');
      tripDate.classList.remove('error');
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
      this.resetAddressInputState(input);
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
      this.resetAddressInputState(input);
    }
  }
}

customElements.define('medical-calculator', MedicalCalculator);
