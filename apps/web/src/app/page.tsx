import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold text-slate-100 mb-2">StockRápido</h1>
      <p className="text-slate-400 mb-8">Sistema de gestión para kioscos</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-3 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-500"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/register"
          className="px-6 py-3 rounded-lg border border-slate-600 text-slate-300 font-medium hover:bg-slate-800"
        >
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
