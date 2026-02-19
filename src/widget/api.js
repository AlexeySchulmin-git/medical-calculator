// API клиент для виджета
class WidgetAPI {
  constructor() {
    this.baseURL = window.location.origin;
  }

  async fetch(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    // Добавляем API ключ из script тега
    const script = document.querySelector('script[data-key]');
    if (script) {
      config.headers['X-API-Key'] = script.getAttribute('data-key');
    }

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Получение конфигурации
  async getConfig() {
    return this.fetch('/api/widget/config');
  }

  // Подсказки адресов
  async getAddressSuggestions(query) {
    return this.fetch('/api/dadata/suggest', {
      method: 'POST',
      body: JSON.stringify({ query })
    });
  }

  // Расчёт расстояния
  async calculateDistance(fromLat, fromLon, toLat, toLon) {
    return this.fetch('/api/dadata/distance', {
      method: 'POST',
      body: JSON.stringify({
        from_lat: fromLat,
        from_lon: fromLon,
        to_lat: toLat,
        to_lon: toLon
      })
    });
  }

  // Создание заявки
  async createOrder(orderData) {
    return this.fetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  }

  // Получение баланса бонусов
  async getBonusBalance(phone) {
    return this.fetch(`/api/customers/bonus?phone=${encodeURIComponent(phone)}`);
  }
}

export default new WidgetAPI();
