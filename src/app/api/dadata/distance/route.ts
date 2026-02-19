import { NextRequest, NextResponse } from 'next/server';
import { calculateDistance } from '@/lib/calculator';

export async function POST(request: NextRequest) {
  try {
    const { from_lat, from_lon, to_lat, to_lon } = await request.json();
    
    // Валидация координат
    if (!from_lat || !from_lon || !to_lat || !to_lon) {
      return NextResponse.json({ error: 'All coordinates are required' }, { status: 400 });
    }

    // Проверка диапазона координат
    if (Math.abs(from_lat) > 90 || Math.abs(to_lat) > 90 || 
        Math.abs(from_lon) > 180 || Math.abs(to_lon) > 180) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const distance = calculateDistance(
      parseFloat(from_lat), 
      parseFloat(from_lon), 
      parseFloat(to_lat), 
      parseFloat(to_lon)
    );

    return NextResponse.json({ 
      distance,
      unit: 'km'
    });

  } catch (error) {
    console.error('Distance calculation error:', error);
    return NextResponse.json({ error: 'Failed to calculate distance' }, { status: 500 });
  }
}
