import { useState, useEffect } from 'preact/hooks';
import { h } from 'preact';
import api from './api';

const Calculator = ({ config }) => {
  const [formData, setFormData] = useState({
    from_address: '',
    to_address: '',
    from_lat: null,
    from_lon: null,
    to_lat: null,
    to_lon: null,
    floor_num: '',
    no_elevator: false,
    weight: '',
    diagnosis: '',
    phone: '',
    email: '',
    round_trip: false,
    payment_method: '',
    medical_escort: false,
    news_subscribe: false,
    personal_data: false,
    customer_name: '',
    comment: ''
  });

  const [suggestions, setSuggestions] = useState({ from: [], to: [] });
  const [distance, setDistance] = useState(null);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState({ field: null, index: -1 });

  const settings = config.settings;

  // Автодополнение адресов
  const handleAddressInput = async (value, field) => {
    setFormData(prev => ({ ...prev, [`${field}_address`]: value }));
    
    if (value.length < 3) {
      setSuggestions(prev => ({ ...prev, [field]: [] }));
      return;
    }

    try {
      const response = await api.fetch('/api/dadata/suggest', {
        method: 'POST',
        body: JSON.stringify({ query: value })
      });
      
      setSuggestions(prev => ({ ...prev, [field]: response.suggestions }));
    } catch (error) {
      console.error('Address suggestions error:', error);
    }
  };

  // Выбор адреса из подсказок
  const selectAddress = (suggestion, field) => {
    setFormData(prev => ({
      ...prev,
      [`${field}_address`]: suggestion.value,
      [`${field}_lat`]: suggestion.data.geo_lat,
      [`${field}_lon`]: suggestion.data.geo_lon
    }));
    setSuggestions(prev => ({ ...prev, [field]: [] }));
    
    // Если оба адреса выбраны, рассчитываем расстояние
    const otherField = field === 'from' ? 'to' : 'from';
    const otherLat = formData[`${otherField}_lat`];
    const otherLon = formData[`${otherField}_lon`];
    const otherAddress = formData[`${otherField}_address`];
    
    if (suggestion.data.geo_lat && suggestion.data.geo_lon && otherLat && otherLon) {
      const fromLat  = field === 'from' ? suggestion.data.geo_lat : otherLat;
      const fromLon  = field === 'from' ? suggestion.data.geo_lon : otherLon;
      const toLat    = field === 'from' ? otherLat : suggestion.data.geo_lat;
      const toLon    = field === 'from' ? otherLon : suggestion.data.geo_lon;
      const fromAddr = field === 'from' ? suggestion.value : otherAddress;
      const toAddr   = field === 'from' ? otherAddress : suggestion.value;
      calculateDistance(fromLat, fromLon, toLat, toLon, fromAddr, toAddr);
    }
  };

  // Расчёт расстояния и цены через сервер
  const calculateDistance = async (fromLat, fromLon, toLat, toLon, fromAddress, toAddress) => {
    try {
      setLoading(true);
      const response = await api.fetch('/api/dadata/distance', {
        method: 'POST',
        body: JSON.stringify({
          from: { lat: parseFloat(fromLat), lon: parseFloat(fromLon) },
          to:   { lat: parseFloat(toLat),   lon: parseFloat(toLon)   }
        })
      });
      
      setDistance(response.distance);
      await calculatePrice(response.distance, fromAddress, toAddress);
    } catch (error) {
      console.error('Distance calculation error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Расчёт стоимости через сервер (с городскими коэффициентами и тарифами из БД)
  const calculatePrice = async (dist, fromAddr, toAddr) => {
    try {
      const currentForm = formData;
      const response = await api.fetch('/api/calculate-price', {
        method: 'POST',
        body: JSON.stringify({
          total_distance: dist || 0,
          from_city: fromAddr || currentForm.from_address || '',
          to_city:   toAddr   || currentForm.to_address   || '',
          weight:        parseFloat(currentForm.weight) || 0,
          descent_floors: parseInt(currentForm.descent_floors) || 0,
          ascent_floors:  parseInt(currentForm.ascent_floors)  || 0,
          waiting_slots:  parseInt(currentForm.waiting_slots)  || 0,
          need_oxygen: !!currentForm.need_oxygen,
          no_escort:   currentForm.no_escort !== undefined ? !!currentForm.no_escort : false,
          round_trip:  !!currentForm.round_trip,
        })
      });
      setPrice(response.price);
    } catch (error) {
      console.error('Price calculation error:', error);
    }
  };

  // Отправка формы
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const response = await api.fetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          total_distance: distance,
          distance,
          from_city: formData.from_address,
          to_city:   formData.to_address,
          price
        })
      });

      setSubmitted(true);
    } catch (error) {
      setErrors({ submit: error.message || 'Ошибка при отправке заявки' });
    } finally {
      setLoading(false);
    }
  };

  // Обработчик изменений полей
  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Пересчёт стоимости при изменении параметров
    if (distance !== null && ['weight', 'floor_num', 'no_elevator', 'round_trip', 'medical_escort', 'descent_floors', 'ascent_floors', 'waiting_slots', 'need_oxygen'].includes(field)) {
      calculatePrice(distance, formData.from_address, formData.to_address);
    }
  };

  if (submitted) {
    return (
      <div className="wdg-calculator">
        <div className="wdg-success">
          <h3>Заявка отправлена!</h3>
          <p>Мы свяжемся с вами в ближайшее время.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wdg-calculator">
      <h2 className="wdg-title">Медицинская перевозка</h2>
      
      <form onSubmit={handleSubmit}>
        {/* Адрес откуда */}
        {settings.fields.from_address && (
          <div className="wdg-form-group">
            <label className="wdg-label">
              Адрес откуда {settings.required.includes('from_address') && '*'}
            </label>
            <div className="wdg-autocomplete">
              <input
                type="text"
                className="wdg-input"
                value={formData.from_address}
                onInput={(e) => handleAddressInput(e.target.value, 'from')}
                placeholder="Введите адрес"
              />
              {suggestions.from.length > 0 && (
                <div className="wdg-suggestions">
                  {suggestions.from.map((suggestion, index) => (
                    <div
                      key={index}
                      className="wdg-suggestion"
                      onClick={() => selectAddress(suggestion, 'from')}
                    >
                      {suggestion.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.from_address && <div className="wdg-error">{errors.from_address}</div>}
          </div>
        )}

        {/* Адрес куда */}
        {settings.fields.to_address && (
          <div className="wdg-form-group">
            <label className="wdg-label">
              Адрес куда {settings.required.includes('to_address') && '*'}
            </label>
            <div className="wdg-autocomplete">
              <input
                type="text"
                className="wdg-input"
                value={formData.to_address}
                onInput={(e) => handleAddressInput(e.target.value, 'to')}
                placeholder="Введите адрес"
              />
              {suggestions.to.length > 0 && (
                <div className="wdg-suggestions">
                  {suggestions.to.map((suggestion, index) => (
                    <div
                      key={index}
                      className="wdg-suggestion"
                      onClick={() => selectAddress(suggestion, 'to')}
                    >
                      {suggestion.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.to_address && <div className="wdg-error">{errors.to_address}</div>}
          </div>
        )}

        {/* Результат расчёта */}
        {distance !== null && price !== null && (
          <div className="wdg-result">
            <div className="wdg-price">{price} ₽</div>
            <div>Расстояние: {distance} км</div>
          </div>
        )}

        {/* Телефон */}
        {settings.fields.phone && (
          <div className="wdg-form-group">
            <label className="wdg-label">
              Телефон {settings.required.includes('phone') && '*'}
            </label>
            <input
              type="tel"
              className="wdg-input"
              value={formData.phone}
              onInput={(e) => handleChange('phone', e.target.value)}
              placeholder="+7 (___) ___-__-__"
            />
            {errors.phone && <div className="wdg-error">{errors.phone}</div>}
          </div>
        )}

        {/* Остальные поля... */}
        
        {/* Кнопка отправки */}
        <button
          type="submit"
          className="wdg-button"
          disabled={loading || !price}
        >
          {loading ? 'Отправка...' : 'Оставить заявку'}
        </button>

        {errors.submit && <div className="wdg-error">{errors.submit}</div>}
      </form>
    </div>
  );
};

export default Calculator;
