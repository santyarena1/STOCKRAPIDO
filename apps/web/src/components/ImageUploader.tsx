'use client';

import { useRef, useState } from 'react';
import { getToken } from '@/lib/api';

async function compressImage(file: File, maxPx: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas error'))),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('load error')); };
    img.src = objectUrl;
  });
}

async function uploadToBlob(file: File, maxPx: number, quality: number): Promise<string> {
  const compressed = await compressImage(file, maxPx, quality);
  const fd = new FormData();
  fd.append('file', compressed, 'image.jpg');
  const token = getToken();
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || 'Error al subir imagen');
  }
  const data = await res.json() as { url: string };
  return data.url;
}

/** Sube una imagen al blob store. Comprime client-side antes de enviar. */
export function ImageUploader({
  value,
  onChange,
  maxPx = 1200,
  quality = 0.85,
  previewClass = 'w-16 h-16 object-contain',
  label = 'Subir imagen',
}: {
  value: string;
  onChange: (url: string) => void;
  maxPx?: number;
  quality?: number;
  previewClass?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const url = await uploadToBlob(file, maxPx, quality);
      onChange(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir imagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? 'Subiendo…' : label}
      </button>
      {value && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className={`${previewClass} rounded-lg border border-slate-600 bg-white/5`} />
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-sm px-2 py-1 rounded border border-slate-600 text-slate-400 hover:text-red-400 hover:border-red-700"
          >
            Quitar
          </button>
        </>
      )}
    </div>
  );
}

/** Sube múltiples imágenes al blob store (hasta maxCount). */
export function MultiImageUploader({
  values,
  onChange,
  maxCount = 12,
  maxPx = 1400,
  quality = 0.85,
}: {
  values: string[];
  onChange: (urls: string[]) => void;
  maxCount?: number;
  maxPx?: number;
  quality?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList) => {
    const remaining = maxCount - values.length;
    if (remaining <= 0) {
      alert(`Máximo ${maxCount} imágenes.`);
      return;
    }
    const toProcess = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, remaining);
    if (toProcess.length === 0) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of toProcess) {
        const url = await uploadToBlob(file, maxPx, quality);
        newUrls.push(url);
      }
      onChange([...values, ...newUrls]);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al subir imagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || values.length >= maxCount}
          className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Subiendo…' : `Agregar imagen${values.length > 0 ? ` (${values.length}/${maxCount})` : ''}`}
        </button>
      </div>
      {values.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {values.map((url, i) => (
            <li key={i} className="relative group rounded-lg overflow-hidden border border-slate-600 aspect-video bg-slate-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 w-7 h-7 rounded bg-black/70 text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
