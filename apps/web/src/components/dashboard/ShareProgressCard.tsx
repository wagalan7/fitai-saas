'use client';

import { useState } from 'react';
import { Share2, Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';

interface Props {
  userName: string;
  streak: number;
  weeklyWorkouts: number;
  weeklyTarget: number;
  adherencePct: number;
}

/**
 * Renders a shareable 1080×1080 PNG card with the user's weekly stats.
 * Uses Web Share API on mobile (native sheet) and falls back to download on desktop.
 */
export default function ShareProgressCard({ userName, streak, weeklyWorkouts, weeklyTarget, adherencePct }: Props) {
  const [loading, setLoading] = useState(false);

  async function buildImage(): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Background gradient — emerald to teal (brand)
    const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
    grad.addColorStop(0, '#10b981');
    grad.addColorStop(1, '#0f766e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Decorative circle
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(900, 200, 220, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(180, 950, 280, 0, Math.PI * 2);
    ctx.fill();

    // Header
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 36px system-ui, -apple-system, sans-serif';
    ctx.fillText('FitAI', 80, 130);
    ctx.font = '400 28px system-ui, sans-serif';
    ctx.fillText('Meu progresso desta semana', 80, 180);

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 64px system-ui, sans-serif';
    ctx.fillText(userName.split(' ')[0] || 'Atleta', 80, 320);

    // Main stat — streak
    ctx.font = '900 240px system-ui, sans-serif';
    ctx.fillText(`${streak}`, 80, 600);
    ctx.font = '500 44px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(streak === 1 ? 'dia de sequência 🔥' : 'dias de sequência 🔥', 80, 670);

    // Secondary stats
    drawStat(ctx, 80, 800, `${weeklyWorkouts}/${weeklyTarget}`, 'treinos esta semana');
    drawStat(ctx, 580, 800, `${adherencePct}%`, 'de aderência');

    // Footer CTA
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '400 30px system-ui, sans-serif';
    ctx.fillText('Treinando com IA personalizada', 80, 1010);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 0.95));
  }

  function drawStat(ctx: CanvasRenderingContext2D, x: number, y: number, big: string, label: string) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 88px system-ui, sans-serif';
    ctx.fillText(big, x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '500 28px system-ui, sans-serif';
    ctx.fillText(label, x, y + 50);
  }

  async function share() {
    if (loading) return;
    setLoading(true);
    try {
      const blob = await buildImage();
      if (!blob) throw new Error('canvas failed');
      const file = new File([blob], 'fitai-progresso.png', { type: 'image/png' });

      // Try native share with file
      if (
        typeof navigator !== 'undefined' &&
        (navigator as any).canShare?.({ files: [file] }) &&
        (navigator as any).share
      ) {
        try {
          await (navigator as any).share({
            files: [file],
            title: 'Meu progresso no FitAI',
            text: `${streak} dias de sequência 🔥 — treinando com FitAI!`,
          });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return; // user cancelled
          // fall through to download
        }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fitai-progresso.png';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Imagem baixada — compartilhe nas suas redes!');
    } catch (err) {
      toast.error('Não foi possível gerar a imagem.');
    } finally {
      setLoading(false);
    }
  }

  // Don't show button if there's no progress to brag about
  if (streak === 0 && weeklyWorkouts === 0) return null;

  return (
    <button
      onClick={share}
      disabled={loading}
      className="card p-4 w-full flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white transition-all disabled:opacity-60"
    >
      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
        {loading ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="font-semibold text-sm">Compartilhar meu progresso</p>
        <p className="text-xs text-white/80">Gera uma imagem com sua sequência e treinos</p>
      </div>
      <Download size={16} className="text-white/60 flex-shrink-0" />
    </button>
  );
}
