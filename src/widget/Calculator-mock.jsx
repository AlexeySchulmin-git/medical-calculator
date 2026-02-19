import { useState } from 'preact/hooks';
import { h } from 'preact';

const Calculator = ({ config }) => {
  const [formData, setFormData] = useState({
    from_address: '',
    to_address: '',
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

  const [distance, setDistance] = useState(null);
  const [price, setPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const settings = config.settings;

  // Mock расчёт расстояния
  const calculateDistance = () => {
    if (formData.from_address && formData.to_address) {
      const mockDistance = Math.floor(Math.random() * 20) + 1; // 1-20 км
      setDistance(mockDistance);
      calculatePrice(mockDistance);
    }
  };

  // Mock расчёт стоимости
  const calculatePrice = (dist) => {
    const priceData = {
      distance: dist || 0,
      weight: parseFloat(formData.weight) || 0,
      floor: parseInt(formData.floor_num) || 1,
      noElevator: formData.no_elevator,
      roundTrip: formData.round_trip,
      medEscort: formData.medical_escort,
      settings
    };

    let calculatedPrice = settings.pricing.base;
    calculatedPrice += (dist || 0) * settings.pricing.per_km;
    
    if (priceData.weight > settings.pricing.overweight_limit) {
      calculatedPrice += settings.pricing.overweight_fee;
    }
    
    if (priceData.noElevator && priceData.floor > 1) {
      calculatedPrice += (priceData.floor - 1) * settings.pricing.floor_fee;
    }
    
    if (priceData.medEscort) {
      calculatedPrice += settings.pricing.escort_fee;
    }
    
    if (priceData.roundTrip) {
      calculatedPrice *= 1.8;
    }

    setPrice(Math.round(calculatedPrice));
  };

  // Отправка формы (mock)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      // Mock отправка
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setSubmitted(true);
      console.log('Order submitted:', { ...formData, distance, price });
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
    if (distance !== null && ['weight', 'floor_num', 'no_elevator', 'round_trip', 'medical_escort'].includes(field)) {
      calculatePrice(distance);
    }
  };

  if (submitted) {
    return (
      <div className="wdg-calculator">
        <div className="wdg-success">
          <h3>Заявка отправлена!</h3>
          <p>Мы свяжемся с вами в ближайшее время.</p>
          <p><strong>Номер заявки:</strong> TEST-{Math.floor(Math.random() * 10000)}</p>
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
            <input
              type="text"
              className="wdg-input"
              value={formData.from_address}
              onInput={(e) => handleChange('from_address', e.target.value)}
              placeholder="Введите адрес"
              onBlur={calculateDistance}
            />
            {errors.from_address && <div className="wdg-error">{errors.from_address}</div>}
          </div>
        )}

        {/* Адрес куда */}
        {settings.fields.to_address && (
          <div className="wdg-form-group">
            <label className="wdg-label">
              Адрес куда {settings.required.includes('to_address') && '*'}
            </label>
            <input
              type="text"
              className="wdg-input"
              value={formData.to_address}
              onInput={(e) => handleChange('to_address', e.target.value)}
              placeholder="Введите адрес"
              onBlur={calculateDistance}
            />
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

        {/* Имя */}
        <div className="wdg-form-group">
          <label className="wdg-label">Имя</label>
          <input
            type="text"
            className="wdg-input"
            value={formData.customer_name}
            onInput={(e) => handleChange('customer_name', e.target.value)}
            placeholder="Ваше имя"
          />
        </div>

        {/* Email */}
        {settings.fields.email && (
          <div className="wdg-form-group">
            <label className="wdg-label">Email</label>
            <input
              type="email"
              className="wdg-input"
              value={formData.email}
              onInput={(e) => handleChange('email', e.target.value)}
              placeholder="email@example.com"
            />
            {errors.email && <div className="wdg-error">{errors.email}</div>}
          </div>
        )}

        {/* Вес */}
        {settings.fields.weight && (
          <div className="wdg-form-group">
            <label className="wdg-label">Вес пациента (кг)</label>
            <input
              type="number"
              className="wdg-input"
              value={formData.weight}
              onInput={(e) => handleChange('weight', e.target.value)}
              placeholder="80"
            />
          </div>
        )}

        {/* Этаж и лифт */}
        {settings.fields.floor && (
          <div className="wdg-form-group">
            <label className="wdg-label">Этаж</label>
            <input
              type="number"
              className="wdg-input"
              value={formData.floor_num}
              onInput={(e) => handleChange('floor_num', e.target.value)}
              placeholder="2"
              disabled={!formData.no_elevator}
            />
          </div>
        )}

        {settings.fields.no_elevator && (
          <div className="wdg-form-group">
            <div className="wdg-checkbox-group">
              <input
                type="checkbox"
                className="wdg-checkbox"
                checked={formData.no_elevator}
                onChange={(e) => handleChange('no_elevator', e.target.checked)}
              />
              <label>Нет лифта</label>
            </div>
          </div>
        )}

        {/* Медицинское сопровождение */}
        {settings.fields.medical_escort && (
          <div className="wdg-form-group">
            <div className="wdg-checkbox-group">
              <input
                type="checkbox"
                className="wdg-checkbox"
                checked={formData.medical_escort}
                onChange={(e) => handleChange('medical_escort', e.target.checked)}
              />
              <label>Медицинское сопровождение</label>
            </div>
          </div>
        )}

        {/* Туда-обратно */}
        {settings.fields.round_trip && (
          <div className="wdg-form-group">
            <div className="wdg-checkbox-group">
              <input
                type="checkbox"
                className="wdg-checkbox"
                checked={formData.round_trip}
                onChange={(e) => handleChange('round_trip', e.target.checked)}
              />
              <label>Перевозка туда-обратно</label>
            </div>
          </div>
        )}

        {/* Способ оплаты */}
        {settings.fields.payment_method && (
          <div className="wdg-form-group">
            <label className="wdg-label">Способ оплаты</label>
            <select
              className="wdg-select"
              value={formData.payment_method}
              onChange={(e) => handleChange('payment_method', e.target.value)}
            >
              <option value="">Выберите способ</option>
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
              <option value="invoice">Счёт</option>
            </select>
          </div>
        )}

        {/* Комментарий */}
        <div className="wdg-form-group">
          <label className="wdg-label">Комментарий</label>
          <textarea
            className="wdg-input"
            value={formData.comment}
            onInput={(e) => handleChange('comment', e.target.value)}
            placeholder="Дополнительная информация"
            rows="3"
          />
        </div>

        {/* Чекбоксы */}
        {settings.fields.news_subscribe && (
          <div className="wdg-form-group">
            <div className="wdg-checkbox-group">
              <input
                type="checkbox"
                className="wdg-checkbox"
                checked={formData.news_subscribe}
                onChange={(e) => handleChange('news_subscribe', e.target.checked)}
              />
              <label>Подписаться на новости и спецпредложения</label>
            </div>
          </div>
        )}

        {settings.fields.personal_data && (
          <div className="wdg-form-group">
            <div className="wdg-checkbox-group">
              <input
                type="checkbox"
                className="wdg-checkbox"
                checked={formData.personal_data}
                onChange={(e) => handleChange('personal_data', e.target.checked)}
                required={settings.required.includes('personal_data')}
              />
              <label>
                Согласен на обработку персональных данных
                {settings.personal_data_url && (
                  <a href={settings.personal_data_url} target="_blank" style={{ marginLeft: '5px' }}>
                    (подробнее)
                  </a>
                )}
              </label>
            </div>
            {errors.personal_data && <div className="wdg-error">{errors.personal_data}</div>}
          </div>
        )}

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
