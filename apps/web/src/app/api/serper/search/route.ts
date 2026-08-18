import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_SERPER_KEY } from '@/lib/serper-cookie';

function unauthorized() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

function isAuthed(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') && auth.length > 20;
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { q?: string; num?: number; key?: string };
  const jar = await cookies();
  const key = (typeof body.key === 'string' ? body.key.trim() : '') || jar.get(COOKIE_SERPER_KEY)?.value?.trim() || '';
  if (!key) {
    return NextResponse.json(
      { error: 'Cargá la API key de Serper en Configuración → Imágenes Serper.' },
      { status: 400 },
    );
  }
  const query = String(body.q || '').trim();
  if (query.length < 2) {
    return NextResponse.json({ error: 'Escribí el nombre del producto para buscar fotos.' }, { status: 400 });
  }
  const num = Math.min(20, Math.max(4, Math.floor(Number(body.num)) || 8));
  const serper = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'ar', hl: 'es', num }),
  });
  if (!serper.ok) {
    if (serper.status === 401 || serper.status === 403) {
      return NextResponse.json({ error: 'La API key de Serper no es válida. Revisala en Configuración.' }, { status: 400 });
    }
    if (serper.status === 429) {
      return NextResponse.json({ error: 'Serper está al límite de búsquedas. Probá de nuevo en un rato.' }, { status: 400 });
    }
    return NextResponse.json({ error: `Serper no respondió (${serper.status}).` }, { status: 400 });
  }
  const json = (await serper.json()) as {
    images?: Array<{ title?: string; imageUrl?: string; thumbnailUrl?: string; source?: string }>;
  };
  const images = (json.images ?? [])
    .map((img) => ({
      title: img.title || '',
      imageUrl: img.imageUrl || '',
      thumbnailUrl: img.thumbnailUrl || img.imageUrl || '',
      source: img.source || '',
    }))
    .filter((img) => /^https?:\/\//i.test(img.imageUrl));
  return NextResponse.json({ query, images });
}
