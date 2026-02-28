import { NextResponse } from 'next/server';

/**
 * API endpoint /api/docs/beads деактивирован.
 * Источник контекста: git + docs/CODEINDEX.md + docs/DECISIONS.md + docs/QUICK_REFERENCE.md
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    enabled: false,
    beads: [],
    message: 'Beads отключены. Используйте git и docs/*.md для контекста.'
  });
}
