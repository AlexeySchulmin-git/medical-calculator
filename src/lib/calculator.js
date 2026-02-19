// Расчёт стоимости медицинской перевозки

function calculatePrice({ distance, weight, floor, noElevator, roundTrip, medEscort, bonusUsed, settings }) {
  let price = settings.pricing.base;
  
  // Расстояние
  if (distance > 0) {
    price += distance * settings.pricing.per_km;
  }
  
  // Вес (превышение лимита)
  if (weight > settings.pricing.overweight_limit) {
    price += settings.pricing.overweight_fee;
  }
  
  // Этажность без лифта
  if (noElevator && floor > 1) {
    price += (floor - 1) * settings.pricing.floor_fee;
  }
  
  // Медицинское сопровождение
  if (medEscort) {
    price += settings.pricing.escort_fee;
  }
  
  // Перевозка туда-обратно
  if (roundTrip) {
    price *= 1.8;
  }
  
  // Расчёт бонусов
  let bonusEarned = 0;
  if (settings.bonus.enabled) {
    bonusEarned = Math.round(price * settings.bonus.percent / 100);
  }
  
  const subtotal = Math.round(price);
  const total = Math.round(price) - (bonusUsed || 0);
  
  return {
    subtotal,
    bonus_earned: bonusEarned,
    total,
    currency: '₽'
  };
}

// Расчёт расстояния по формуле Haversine
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в км
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Округление до 0.01 км
}

function toRad(deg) {
  return deg * (Math.PI/180);
}

// Валидация полей формы
function validateForm(data, settings) {
  const errors = {};
  
  // Проверка обязательных полей
  settings.required.forEach(field => {
    if (!data[field] || data[field].trim() === '') {
      errors[field] = 'Это поле обязательно для заполнения';
    }
  });
  
  // Валидация телефона
  if (data.phone && !/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/.test(data.phone)) {
    errors.phone = 'Неверный формат телефона';
  }
  
  // Валидация email
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Неверный формат email';
  }
  
  // Валидация веса
  if (data.weight && (data.weight < 1 || data.weight > 500)) {
    errors.weight = 'Вес должен быть от 1 до 500 кг';
  }
  
  // Валидация этажа
  if (data.floor_num && (data.floor_num < 1 || data.floor_num > 50)) {
    errors.floor_num = 'Этаж должен быть от 1 до 50';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

module.exports = {
  calculatePrice,
  calculateDistance,
  validateForm
};
