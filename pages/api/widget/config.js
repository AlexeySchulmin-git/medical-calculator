import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export async function GET(request) {
  try {
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    // Ищем клиента в базе данных
    const [clients] = await db.execute(
      'SELECT * FROM clients WHERE api_key = ? AND is_active = 1',
      [apiKey]
    );

    if (clients.length === 0) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const client = clients[0];
    
    // Настройки по умолчанию
    const defaultSettings = {
      fields: {
        from_address: true,
        to_address: true,
        floor: true,
        no_elevator: true,
        diagnosis: true,
        weight: true,
        phone: true,
        email: true,
        round_trip: true,
        payment_method: true,
        medical_escort: true,
        news_subscribe: true,
        personal_data: true
      },
      required: ['phone', 'from_address', 'to_address', 'personal_data'],
      pricing: {
        base: 1500,
        per_km: 45,
        floor_fee: 150,
        overweight_limit: 100,
        overweight_fee: 500,
        escort_fee: 1000
      },
      bonus: {
        enabled: true,
        percent: 5
      },
      personal_data_url: '/privacy',
      ui: {
        primary_color: '#3b82f6',
        bg_color: '#ffffff',
        font_size: '16px',
        border_radius: '8px'
      }
    };

    // Объединяем с настройками клиента
    const settings = {
      ...defaultSettings,
      ...(client.settings && JSON.parse(client.settings))
    };

    return NextResponse.json({
      client_id: client.id,
      company_name: client.company_name,
      settings
    });

  } catch (error) {
    console.error('Config API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
