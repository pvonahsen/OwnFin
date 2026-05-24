import { useState, useEffect, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import Modal from './Modal.jsx';
import Spinner from './Spinner.jsx';
import { api, ownerUrl } from '../api.js';
import { eur2 } from '../utils.js';

export default function PositionChartModal({ pos, currentUser, onClose }) {
  const [prices, setPrices] = useState(null);
  const [txns,   setTxns]   = useState(null);
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    setPrices(null); setTxns(null);
    Promise.all([
      api.get(`/api/positions/${pos.id}/history`),
      api.get(ownerUrl(`/api/transactions?position_id=${pos.id}`, currentUser)).catch(() => []),
    ]).then(([p, t]) => { setPrices(p); setTxns(t); });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [pos.id]);

  useEffect(() => {
    if (!prices || !txns || !canvasRef.current) return;
    chartRef.current?.destroy();

    // Merge price dates + transaction dates
    const priceMap = Object.fromEntries(prices.map(p => [p.date, p.price]));
    const allDates = [...new Set([...prices.map(p => p.date), ...txns.map(t => t.date)])].sort();

    const buyMap = {}, sellMap = {};
    txns.forEach(t => {
      if (t.units > 0) buyMap[t.date] = t.price;
      else             sellMap[t.date] = t.price;
    });

    const step = Math.max(1, Math.floor(allDates.length / 14));
    const labels = allDates.map((d, i) => i % step === 0 ? d.slice(0, 7) : '');

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: pos.name,
            data: allDates.map(d => priceMap[d] ?? null),
            borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)',
            fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2, spanGaps: true,
          },
          {
            label: 'Kauf',
            data: allDates.map(d => buyMap[d] ?? null),
            borderColor: 'transparent', backgroundColor: '#4ade80',
            pointRadius: allDates.map(d => buyMap[d] != null ? 9 : 0),
            pointHoverRadius: 11, pointStyle: 'triangle', showLine: false,
          },
          {
            label: 'Verkauf',
            data: allDates.map(d => sellMap[d] ?? null),
            borderColor: 'transparent', backgroundColor: '#f87171',
            pointRadius: allDates.map(d => sellMap[d] != null ? 9 : 0),
            pointHoverRadius: 11, pointStyle: 'triangle', pointRotation: 180, showLine: false,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 300 },
        plugins: {
          legend: { labels: { color: '#9ca3af', boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: ctx => allDates[ctx[0]?.dataIndex] ?? '',
              label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label}: ${eur2(ctx.parsed.y)}` : null,
            },
            filter: item => item.parsed.y != null,
          },
        },
        scales: {
          x: { ticks: { color: '#6b7280', font: { size: 10 }, maxTicksLimit: 14 }, grid: { color: '#1e2d40' } },
          y: { ticks: { color: '#6b7280', font: { size: 10 }, callback: v => eur2(v) }, grid: { color: '#1e2d40' } },
        },
      },
    });
  }, [prices, txns]);

  return (
    <Modal title={`${pos.name}${pos.ticker ? ` · ${pos.ticker}` : ''}`} onClose={onClose} wide>
      {(!prices || !txns)
        ? <Spinner />
        : prices.length === 0
          ? <p className="text-gray-500 text-sm py-8 text-center">Keine Kursdaten verfügbar. Erst synchronisieren.</p>
          : <div style={{ height: 300 }}><canvas ref={canvasRef} /></div>
      }
      {txns?.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-1.5 pr-3">Datum</th>
                <th className="text-right py-1.5 pr-3">Typ</th>
                <th className="text-right py-1.5 pr-3">Stück</th>
                <th className="text-right py-1.5 pr-3">Kurs</th>
                <th className="text-right py-1.5">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {[...txns].sort((a, b) => b.date.localeCompare(a.date)).map(t => (
                <tr key={t.id} className="border-b border-gray-700/40">
                  <td className="py-1.5 pr-3 text-gray-300 tabular-nums">{t.date}</td>
                  <td className="text-right py-1.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${t.type === 'buy' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                      {t.type === 'buy' ? 'Kauf' : 'Verkauf'}
                    </span>
                  </td>
                  <td className="text-right py-1.5 pr-3 text-gray-300 font-mono tabular-nums">
                    {Math.abs(t.units).toFixed(4)}
                  </td>
                  <td className="text-right py-1.5 pr-3 text-gray-300 tabular-nums">{eur2(t.price)}</td>
                  <td className="text-right py-1.5 text-white tabular-nums">{eur2(Math.abs(t.units) * t.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
