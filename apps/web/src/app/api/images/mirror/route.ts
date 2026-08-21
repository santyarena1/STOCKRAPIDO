import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024;

function isAlreadyHosted(url: string) {
  return /vercel-storage\.com|\.public\.blob\.vercel-storage\.com/i.test(url) || url.startsWith('data:image/');
}

function extFromContentType(type: string) {
  if (type.includes('png')) return '.png';
  if (type.includes('webp')) return '.webp';
  if (type.includes('gif')) return '.gif';
  return '.jpg';
}

/**
 * Baja una imagen remota (p. ej. Serper/Google) y la sube a Vercel Blob.
 * Las URLs de Serper suelen romperse (hotlink / vencen); el blob es estable.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request inválido' }, { status: 400 });
  }

  const source = String(body.url ?? '').trim();
  if (!/^https?:\/\//i.test(source) || source.length > 2000) {
    return NextResponse.json({ error: 'URL de imagen inválida' }, { status: 400 });
  }
  if (isAlreadyHosted(source)) {
    return NextResponse.json({ url: source, mirrored: false });
  }

  try {
    const upstream = await fetch(source, {
      redirect: 'follow',
      signal: AbortSignal.timeout(18_000),
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (compatible; StockRapido/1.0; +https://stockrapido.app)',
      },
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `No se pudo bajar la imagen (${upstream.status}). Probá otra de la lista.` },
        { status: 422 },
      );
    }
    const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'La URL no devolvió una imagen. Probá otra foto.' },
        { status: 422 },
      );
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!buf.length) {
      return NextResponse.json({ error: 'Imagen vacía.' }, { status: 422 });
    }
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: 'La imagen pesa demasiado (máx. 5 MB).' }, { status: 422 });
    }

    const type = contentType.startsWith('image/') ? contentType : 'image/jpeg';
    const filename = `stockrapido/serper/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extFromContentType(type)}`;
    const blob = await put(filename, buf, {
      access: 'public',
      contentType: type,
    });
    return NextResponse.json({ url: blob.url, mirrored: true });
  } catch (err) {
    console.error('image mirror error:', err);
    return NextResponse.json(
      { error: 'No se pudo guardar la imagen. Probá otra o subila a mano.' },
      { status: 500 },
    );
  }
}
