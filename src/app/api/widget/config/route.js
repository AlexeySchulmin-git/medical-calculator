import { NextResponse } from 'next/server';
import db from '@/lib/db.js';

export async function GET(request) {
  try {
    const apiKey = request.headers.get('x-api-key');
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    // Для теста возвращаем статичные данные
    const settings = {
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

    return NextResponse.json({
      client_id: 'test-client-001',
      company_name: 'Тестовая медицинская компания',
      settings
    });

  } catch (error) {
    console.error('Config API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
