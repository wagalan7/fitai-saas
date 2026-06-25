'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Camera, Trash2, GitCompareArrows, Loader2, X } from 'lucide-react';

interface PhotoMeta {
  id: string;
  pose: string | null;
  weightKg: number | null;
  notes: string | null;
  takenAt: string;
}

// Downscale + recompress a picked image entirely client-side. We have no object
// storage, so the bytes get stored as a base64 data URL in Postgres — keeping
// the longest edge at ~1080px JPEG q0.72 lands each photo well under ~250KB.
function compressImage(file: File, maxEdge = 1080, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas indisponível'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('imagem inválida'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

const POSES = ['Frente', 'Lado', 'Costas'];

export default function ProgressPhotos() {
  const [metas, setMetas] = useState<PhotoMeta[]>([]);
  // id → base64 data URL, fetched lazily so the index stays light.
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pose, setPose] = useState('Frente');
  const [compare, setCompare] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get('/progress/photos')
      .then((res) => setMetas(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Lazily load image bytes for any metadata we don't yet have cached.
  useEffect(() => {
    const missing = metas.filter((m) => !images[m.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((m) =>
        api
          .get(`/progress/photos/${m.id}`)
          .then((res) => [m.id, res.data.imageData] as const)
          .catch(() => null),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const p of pairs) if (p) next[p[0]] = p[1];
      if (Object.keys(next).length) setImages((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [metas, images]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setUploading(true);
    try {
      const imageData = await compressImage(file);
      const { data } = await api.post('/progress/photos', { imageData, pose });
      setMetas((prev) => [...prev, data]);
      setImages((prev) => ({ ...prev, [data.id]: imageData }));
      toast.success('Foto adicionada!');
    } catch {
      toast.error('Não foi possível adicionar a foto.');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover esta foto?')) return;
    try {
      await api.delete(`/progress/photos/${id}`);
      setMetas((prev) => prev.filter((m) => m.id !== id));
      setImages((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      toast.error('Não foi possível remover.');
    }
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
  const first = metas[0];
  const latest = metas[metas.length - 1];
  const canCompare = metas.length >= 2;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Fotos de progresso</h2>
        <div className="flex items-center gap-2">
          {canCompare && (
            <button
              onClick={() => setCompare((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${
                compare
                  ? 'bg-primary-50 border-primary-200 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <GitCompareArrows size={15} /> Comparar
            </button>
          )}
          <select
            value={pose}
            onChange={(e) => setPose(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {POSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-60 text-white px-4 py-2 rounded-xl font-medium text-sm"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
            {uploading ? 'Enviando…' : 'Adicionar'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPick}
            className="hidden"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="animate-spin text-primary-500" />
        </div>
      ) : metas.length === 0 ? (
        <div className="text-center py-10">
          <Camera size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            Nenhuma foto ainda. Tire a primeira para começar sua linha do tempo.
          </p>
        </div>
      ) : compare && first && latest ? (
        // First vs latest side-by-side
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Antes', m: first },
            { label: 'Agora', m: latest },
          ].map(({ label, m }) => (
            <div key={m.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{label}</span>
                <span className="text-xs text-gray-400">{fmtDate(m.takenAt)}</span>
              </div>
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-100">
                {images[m.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={images[m.id]}
                    alt={label}
                    onClick={() => setZoom(images[m.id])}
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-gray-300" size={20} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Timeline grid (oldest → newest)
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {metas.map((m) => (
            <div key={m.id} className="group relative">
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-gray-100">
                {images[m.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={images[m.id]}
                    alt={m.pose || 'progresso'}
                    onClick={() => setZoom(images[m.id])}
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="animate-spin text-gray-300" size={18} />
                  </div>
                )}
              </div>
              <button
                onClick={() => remove(m.id)}
                className="absolute top-2 right-2 bg-black/55 hover:bg-red-500 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remover foto"
              >
                <Trash2 size={13} />
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/65 to-transparent rounded-b-xl px-2 py-1.5">
                <p className="text-[11px] text-white font-medium">{fmtDate(m.takenAt)}</p>
                {m.pose && <p className="text-[10px] text-white/75">{m.pose}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zoom lightbox */}
      {zoom && (
        <div
          onClick={() => setZoom(null)}
          className="fixed inset-0 bg-black/85 flex items-center justify-center z-[60] p-4"
        >
          <button
            onClick={() => setZoom(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            aria-label="Fechar"
          >
            <X size={28} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="foto" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
