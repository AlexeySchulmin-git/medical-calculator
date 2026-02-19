import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { calculatePrice } from '@/lib/calculator.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    // Валидация обязательных полей
    const requiredFields = ['phone', 'from_address', 'to_address', 'personal_data'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({ error: `Field ${field} is required` }, { status: 400 });
      }
    }

    // Проверка API ключа
    const [clients] = await db.execute(
      'SELECT id FROM clients WHERE api_key = ? AND is_active = 1',
      [apiKey]
    );

    if (clients.length === 0) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const clientId = clients[0].id;

    // Генерируем уникальный номер заявки
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Расчёт стоимости
    const priceData = {
      distance: body.distance || 0,
      weight: parseFloat(body.weight) || 0,
      floor: parseInt(body.floor_num) || 1,
      noElevator: body.no_elevator,
      roundTrip: body.round_trip,
      medEscort: body.medical_escort,
      settings: {
        base: 1500,
        per_km: 45,
        floor_fee: 150,
        overweight_limit: 100,
        overweight_fee: 500,
        escort_fee: 1000
      }
    };

    const calculatedPrice = calculatePrice(priceData);

    // Сохраняем заявку в базу данных
    await db.execute(`
      INSERT INTO orders (
        client_id, order_number, customer_name, phone, email,
        from_address, to_address, floor_num, no_elevator,
        diagnosis, weight, round_trip, payment_method,
        medical_escort, news_subscribe, personal_data,
        comment, distance, price, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      clientId,
      orderNumber,
      body.customer_name || '',
      body.phone,
      body.email || '',
      body.from_address,
      body.to_address,
      body.floor_num || 1,
      body.no_elevator || false,
      body.diagnosis || '',
      body.weight || 0,
      body.round_trip || false,
      body.payment_method || '',
      body.medical_escort || false,
      body.news_subscribe || false,
      body.personal_data || false,
      body.comment || '',
      body.distance || 0,
      calculatedPrice,
      'new'
    ]);

    // TODO: Отправка email уведомлений
    // await sendEmailNotifications(orderNumber, body, calculatedPrice);

    return NextResponse.json({
      success: true,
      order_number: orderNumber,
      price: calculatedPrice,
      status: 'new'
    });

  } catch (error) {
    console.error('Orders API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
