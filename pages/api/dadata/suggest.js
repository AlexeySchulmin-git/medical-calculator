import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { query, count = 5 } = await request.json();
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 });
    }

    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    // TODO: Реальная интеграция с DaData API
    // const dadataResponse = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Token ${process.env.DADATA_API_KEY}`
    //   },
    //   body: JSON.stringify({
    //     query,
    //     count,
    //     from_bound: { "value": "city" },
    //     to_bound: { "value": "house" }
    //   })
    // });

    // const suggestions = await dadataResponse.json();

    // Mock данные для тестирования
    const mockSuggestions = [
      {
        value: "г Москва, ул Тверская, д 1",
        unrestricted_value: "г Москва, ул Тверская, д 1",
        data: {
          postal_code: "125009",
          city: "г Москва",
          street: "ул Тверская",
          house: "1",
          geo_lat: "55.756",
          geo_lon: "37.617"
        }
      },
      {
        value: "г Москва, ул Тверская, д 2",
        unrestricted_value: "г Москва, ул Тверская, д 2",
        data: {
          postal_code: "125009",
          city: "г Москва",
          street: "ул Тверская",
          house: "2",
          geo_lat: "55.756",
          geo_lon: "37.617"
        }
      },
      {
        value: "г Москва, ул Тверская, д 3",
        unrestricted_value: "г Москва, ул Тверская, д 3",
        data: {
          postal_code: "125009",
          city: "г Москва",
          street: "ул Тверская",
          house: "3",
          geo_lat: "55.756",
          geo_lon: "37.617"
        }
      }
    ];

    // Фильтруем по query
    const filteredSuggestions = mockSuggestions
      .filter(suggestion => 
        suggestion.value.toLowerCase().includes(query.toLowerCase()) ||
        suggestion.unrestricted_value.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, count);

    return NextResponse.json({
      success: true,
      suggestions: filteredSuggestions
    });

  } catch (error) {
    console.error('DaData suggest API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
