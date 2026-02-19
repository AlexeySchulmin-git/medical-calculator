import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { from, to } = await request.json();
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    if (!from || !to) {
      return NextResponse.json({ error: 'From and to coordinates are required' }, { status: 400 });
    }

    // TODO: Реальная интеграция с DaData API
    // const dadataResponse = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/geolocate/address', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Token ${process.env.DADATA_API_KEY}`
    //   },
    //   body: JSON.stringify({
    //     lat: from.lat,
    //     lon: from.lon,
    //     radius_meters: 100,
    //     count: 1
    //   })
    // });

    // Mock расчёт расстояния
    const distance = calculateDistance(
      parseFloat(from.lat), 
      parseFloat(from.lon), 
      parseFloat(to.lat), 
      parseFloat(to.lon)
    );

    return NextResponse.json({
      success: true,
      distance: Math.round(distance * 100) / 100, // Округляем до 2 знаков
      unit: 'km'
    });

  } catch (error) {
    console.error('DaData distance API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Формула Хаверсина для расчёта расстояния между двумя точками
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Радиус Земли в километрах
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  return R * c;
}
