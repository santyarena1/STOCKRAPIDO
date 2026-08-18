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

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  const jar = await cookies();
  const key = jar.get(COOKIE_SERPER_KEY)?.value?.trim();
  return NextResponse.json({ hasSerperKey: Boolean(key) });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { key?: string };
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  const res = NextResponse.json({ hasSerperKey: Boolean(key) });
  if (key) {
    res.cookies.set(COOKIE_SERPER_KEY, key, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    res.cookies.set(COOKIE_SERPER_KEY, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }
  return res;
}
