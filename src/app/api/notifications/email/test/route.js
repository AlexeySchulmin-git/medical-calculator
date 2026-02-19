import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import emailService from '@/lib/notifications';

export async function POST(request) {
  try {
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    // Получаем клиента
    const [clients] = await db.execute(
      'SELECT id, company_name, email, settings FROM clients WHERE api_key = ? AND active = 1',
      [apiKey]
    );

    if (clients.length === 0) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const client = clients[0];
    
    // Получаем данные для теста
    const testData = await request.json();
    
    // Отправляем тестовое письмо
    await emailService.sendOrderNotification({
      order: {
        id: 'TEST-001',
        from_address: testData.from_address || 'г. Москва, ул. Тестовая, д. 1',
        to_address: testData.to_address || 'г. Москва, ул. Примерная, д. 2',
        weight: testData.weight || 80,
        diagnosis: testData.diagnosis || 'Тестовый диагноз',
        medical_escort: testData.medical_escort || false,
        round_trip: testData.round_trip || false,
        payment_method: testData.payment_method || 'Наличные',
        comment: testData.comment || 'Тестовый комментарий'
      },
      customer_name: testData.customer_name || 'Тестовый клиент',
      customer_email: testData.customer_email || 'test@example.com',
      phone: testData.phone || '+7 (999) 999-99-99',
      price: testData.price || 2500,
      distance: testData.distance || 5.2
    }, client);

    return NextResponse.json({ 
      success: true,
      message: 'Test email sent successfully',
      recipient: client.email
    });

  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json({ 
      error: 'Failed to send test email',
      details: error.message 
    }, { status: 500 });
  }
}
