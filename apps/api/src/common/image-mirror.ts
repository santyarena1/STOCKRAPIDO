import { put } from '@vercel/blob';
import { BadRequestException, Logger } from '@nestjs/common';

const logger = new Logger('ImageMirror');
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
 * Baja una imagen remota y la sube a Vercel Blob (URL estable).
 * Si no hay BLOB_READ_WRITE_TOKEN, lanza error claro.
 */
export async function mirrorRemoteImageUrl(url: string): Promise<string> {
  const source = String(url ?? '').trim();
  if (!source) throw new BadRequestException('URL de imagen vacía.');
  if (isAlreadyHosted(source)) return source;
  if (!/^https?:\/\//i.test(source) || source.length > 2000) {
    throw new BadRequestException('URL de imagen inválida.');
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new BadRequestException(
      'Falta BLOB_READ_WRITE_TOKEN en la API: no se puede guardar la foto de Serper de forma estable.',
    );
  }

  const upstream = await fetch(source, {
    redirect: 'follow',
    signal: AbortSignal.timeout(18_000),
    headers: {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; StockRapido/1.0; +https://stockrapido.app)',
    },
  });
  if (!upstream.ok) {
    throw new BadRequestException(`No se pudo bajar la imagen (${upstream.status}).`);
  }
  const contentType = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (contentType && !contentType.startsWith('image/')) {
    throw new BadRequestException('La URL no devolvió una imagen.');
  }
  const buf = Buffer.from(await upstream.arrayBuffer());
  if (!buf.length) throw new BadRequestException('Imagen vacía.');
  if (buf.length > MAX_BYTES) throw new BadRequestException('La imagen pesa demasiado (máx. 5 MB).');

  const type = contentType.startsWith('image/') ? contentType : 'image/jpeg';
  const filename = `stockrapido/serper/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${extFromContentType(type)}`;
  try {
    const blob = await put(filename, buf, {
      access: 'public',
      contentType: type,
      token,
    });
    return blob.url;
  } catch (err) {
    logger.warn(`Blob put falló: ${err instanceof Error ? err.message : String(err)}`);
    throw new BadRequestException('No se pudo guardar la imagen en el almacenamiento.');
  }
}

/** Prueba varias URLs (full + thumb) hasta que una se pueda espejar. */
export async function mirrorFirstAvailable(urls: Array<string | null | undefined>): Promise<string> {
  const tried = new Set<string>();
  let lastError: Error | null = null;
  for (const raw of urls) {
    const url = String(raw ?? '').trim();
    if (!url || tried.has(url)) continue;
    tried.add(url);
    try {
      return await mirrorRemoteImageUrl(url);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError || new BadRequestException('Ninguna imagen de Serper se pudo guardar.');
}
