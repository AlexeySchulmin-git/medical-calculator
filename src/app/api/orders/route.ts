import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { calculatePrice, validateForm } from '@/lib/calculator';

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    // Получаем клиента и его настройки
    const [clients] = await db.execute(
      'SELECT id, settings FROM clients WHERE api_key = ? AND active = 1',
      [apiKey]
    );

    if (clients.length === 0) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const client = clients[0];
    const settings = { ...client.settings };

    // Получаем данные формы
    const orderData = await request.json();
    
    // Валидация
    const validation = validateForm(orderData, settings);
    if (!validation.isValid) {
      return NextResponse.json({ error: 'Validation failed', errors: validation.errors }, { status: 400 });
    }

    // Расчёт стоимости
    const priceCalculation = calculatePrice({
      distance: orderData.distance || 0,
      weight: orderData.weight || 0,
      floor: orderData.floor_num || 1,
      noElevator: orderData.no_elevator || false,
      roundTrip: orderData.round_trip || false,
      medEscort: orderData.medical_escort || false,
      bonusUsed: orderData.bonus_used || 0,
      settings
    });

    // Генерируем ID заявки
    const orderId = crypto.randomUUID();

    // Сохраняем заявку
    await db.execute(`
      INSERT INTO orders (
        id, client_id, from_address, from_lat, from_lon, 
        to_address, to_lat, to_lon, distance, price,
        floor_num, no_elevator, weight, diagnosis, phone,
        round_trip, payment_method, medical_escort, bonus_used,
        customer_name, customer_email, comment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      orderId,
      client.id,
      orderData.from_address,
      orderData.from_lat || null,
      orderData.from_lon || null,
      orderData.to_address,
      orderData.to_lat || null,
      orderData.to_lon || null,
      orderData.distance || 0,
      priceCalculation.total,
      orderData.floor_num || null,
      orderData.no_elevator || false,
      orderData.weight || null,
      orderData.diagnosis || null,
      orderData.phone,
      orderData.round_trip || false,
      orderData.payment_method || null,
      orderData.medical_escort || false,
      orderData.bonus_used || 0,
      orderData.customer_name || null,
      orderData.customer_email || null,
      orderData.comment || null
    ]);

    // Обработка бонусов (если включены)
    if (settings.bonus.enabled && priceCalculation.bonus_earned > 0) {
      // Здесь будет логика начисления бонусов
      // TODO: Добавить после создания таблицы customers
    }

    // TODO: Отправка уведомлений (email, telegram, sheets, webhook)
    // await sendNotifications(orderData, priceCalculation, client);

    return NextResponse.json({
      id: orderId,
      price: priceCalculation.total,
      bonus_earned: priceCalculation.bonus_earned,
      message: 'Order created successfully'
    });

  } catch (error: any) {
    console.error('Order creation error:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
