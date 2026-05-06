'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

interface ProgressLog {
  loggedAt: string;
  weightKg?: number;
}

export default function ProgressChart({ data }: { data: ProgressLog[] }) {
  const filtered = data.filter((d) => d.weightKg != null);

  if (filtered.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
        Registre pelo menos 2 pesos para ver o gráfico
      </div>
    );
  }

  const labels = filtered.map((d) =>
    new Date(d.loggedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  );
  const values = filtered.map((d) => d.weightKg!);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Peso (kg)',
        data: values,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#22c55e',
        pointRadius: 4,
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { callback: (v: any) => `${v}kg` },
      },
    },
  };

  return <Line data={chartData} options={options as any} height={120} />;
}
