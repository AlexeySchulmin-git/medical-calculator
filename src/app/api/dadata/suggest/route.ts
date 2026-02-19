import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import axios from 'axios';

// Очистка кэша старых записей
async function cleanExpiredCache() {
  await db.execute(
    'DELETE FROM address_cache WHERE expires_at < NOW()'
  );
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    
    if (!query || query.length < 3) {
      return NextResponse.json({ suggestions: [] });
    }

    // Очистка старого кэша
    await cleanExpiredCache();

    // Проверяем кэш
    const [cached] = await db.execute(
      'SELECT response_data FROM address_cache WHERE query_text = ? AND expires_at > NOW()',
      [query]
    );

    if (cached.length > 0) {
      return NextResponse.json({ suggestions: cached[0].response_data });
    }

    // Запрос к DaData API
    const dadataResponse = await axios.post(
      'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address',
      { query, count: 10, from_bound: { value: "city" }, to_bound: { value: "house" } },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Token ${process.env.DADATA_API_KEY}`
        },
        timeout: 5000
      }
    );

    const suggestions = dadataResponse.data.suggestions.map((item: any) => ({
      value: item.value,
      unrestricted_value: item.unrestricted_value,
      data: {
        city: item.data.city,
        street: item.data.street,
        house: item.data.house,
        flat: item.data.flat,
        geo_lat: item.data.geo_lat,
        geo_lon: item.data.geo_lon,
        postal_code: item.data.postal_code
      }
    }));

    // Сохраняем в кэш на 7 дней
    await db.execute(
      'INSERT INTO address_cache (query_text, response_data, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
      [query, suggestions]
    );

    return NextResponse.json({ suggestions });

  } catch (error: any) {
    console.error('DaData suggest error:', error);
    
    if (error.response?.status === 401) {
      return NextResponse.json({ error: 'Invalid DaData API key' }, { status: 500 });
    }
    
    if (error.response?.status === 429) {
      return NextResponse.json({ error: 'DaData rate limit exceeded' }, { status: 429 });
    }

    return NextResponse.json({ error: 'Failed to get address suggestions' }, { status: 500 });
  }
}
