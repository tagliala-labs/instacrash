import React, { useEffect, useRef, useState } from 'react';
import { Chart, ArcElement, DoughnutController, Tooltip } from 'chart.js';
import {
  CarIcon,
  ChartPieIcon,
  CheckeredFlagIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockRotateLeftIcon,
  MobileScreenButtonIcon,
  PauseIcon,
  PersonDressIcon,
  PersonIcon,
  PlayIcon,
  RotateLeftIcon,
  XMarkIcon,
} from './icons';

Chart.register(ArcElement, DoughnutController, Tooltip);

// ── Types ──────────────────────────────────────────────────────────────────
type AppState = 'idle' | 'running' | 'paused';

interface Counts {
  male: number;
  female: number;
  malePhone: number;
  femalePhone: number;
}

interface Measurement {
  id: number;
  date: string; // ISO string
  duration: number; // ms
  counts: Counts;
}

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'instacrash-measurements';
const CHART_COLORS = ['#2563eb', '#db2777', '#374151'];
const EMPTY_COUNTS: Counts = {
  male: 0,
  female: 0,
  malePhone: 0,
  femalePhone: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((s % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function loadMeasurements(): Measurement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Measurement[];
  } catch {
    // ignore parse errors
  }
  return [];
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [counts, setCounts] = useState<Counts>({ ...EMPTY_COUNTS });
  const [displayTime, setDisplayTime] = useState('00:00:00');
  const [measurements, setMeasurements] =
    useState<Measurement[]>(loadMeasurements);
  const [sirenActive, setSirenActive] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] =
    useState<Measurement | null>(null);

  // Refs for values used inside callbacks without causing re-renders
  const elapsedRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sirenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsRef = useRef<Counts>({ ...EMPTY_COUNTS });
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastActionRef = useRef<Array<keyof Counts>>([]);

  // Chart canvas refs
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveChartInstRef = useRef<Chart | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalChartInstRef = useRef<Chart | null>(null);

  // Persist measurements to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(measurements));
  }, [measurements]);

  // Live chart — initialize once on mount
  useEffect(() => {
    const canvas = liveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Male + Phone', 'Female + Phone', 'No infraction'],
        datasets: [
          {
            data: [1, 1, 1],
            backgroundColor: ['#1f2937', '#1f2937', '#1f2937'],
            borderWidth: 2,
            borderColor: '#111827',
            hoverOffset: 6,
          },
        ],
      },
      options: {
        cutout: '68%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 300 },
        responsive: true,
        maintainAspectRatio: true,
      },
    });
    liveChartInstRef.current = chart;
    return () => {
      chart.destroy();
      liveChartInstRef.current = null;
    };
  }, []);

  // Live chart — update on counts change
  useEffect(() => {
    const chart = liveChartInstRef.current;
    if (!chart) return;
    const { male, female, malePhone, femalePhone } = counts;
    const total = male + female + malePhone + femalePhone;
    const noInfraction = male + female;
    const hasData = total > 0;
    const ds = chart.data.datasets[0];
    if (hasData) {
      ds.data = [
        malePhone || 0.001,
        femalePhone || 0.001,
        noInfraction || 0.001,
      ];
      ds.backgroundColor = CHART_COLORS;
    } else {
      ds.data = [1, 1, 1];
      ds.backgroundColor = ['#1f2937', '#1f2937', '#1f2937'];
    }
    chart.update();
  }, [counts]);

  // Modal chart — create/destroy when selectedMeasurement changes
  useEffect(() => {
    if (!selectedMeasurement) {
      modalChartInstRef.current?.destroy();
      modalChartInstRef.current = null;
      return;
    }
    const canvas = modalCanvasRef.current;
    if (!canvas) return;
    modalChartInstRef.current?.destroy();
    const { male, female, malePhone, femalePhone } = selectedMeasurement.counts;
    const total = male + female + malePhone + femalePhone;
    const noInfraction = male + female;
    const hasData = total > 0;
    const ctx = canvas.getContext('2d')!;
    modalChartInstRef.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Male + Phone', 'Female + Phone', 'No infraction'],
        datasets: [
          {
            data: hasData
              ? [
                  malePhone || 0.001,
                  femalePhone || 0.001,
                  noInfraction || 0.001,
                ]
              : [1, 1, 1],
            backgroundColor: hasData
              ? CHART_COLORS
              : ['#1f2937', '#1f2937', '#374151'],
            borderWidth: 3,
            borderColor: '#111827',
            hoverOffset: 8,
          },
        ],
      },
      options: {
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) =>
                ` ${item.label}: ${hasData ? pct(item.raw as number, total) : 0}%`,
            },
          },
        },
        responsive: true,
        maintainAspectRatio: true,
      },
    });
  }, [selectedMeasurement]);

  function getElapsed(): number {
    if (startTimeRef.current !== null) {
      return elapsedRef.current + (Date.now() - startTimeRef.current);
    }
    return elapsedRef.current;
  }

  function handleStartPause() {
    if (appState === 'idle') {
      elapsedRef.current = 0;
      countsRef.current = { ...EMPTY_COUNTS };
      setCounts({ ...EMPTY_COUNTS });
      lastActionRef.current = [];
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(
        () => setDisplayTime(formatTime(getElapsed())),
        200
      );
      setAppState('running');
    } else if (appState === 'running') {
      elapsedRef.current += Date.now() - (startTimeRef.current ?? Date.now());
      startTimeRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
      setAppState('paused');
    } else {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(
        () => setDisplayTime(formatTime(getElapsed())),
        200
      );
      setAppState('running');
    }
  }

  function handleEnd() {
    if (appState === 'idle') return;
    if (appState === 'running') {
      elapsedRef.current += Date.now() - (startTimeRef.current ?? Date.now());
      startTimeRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    const snap: Measurement = {
      id: Date.now(),
      date: new Date().toISOString(),
      duration: elapsedRef.current,
      counts: { ...countsRef.current },
    };
    setMeasurements((prev) => [snap, ...prev]);
    elapsedRef.current = 0;
    countsRef.current = { ...EMPTY_COUNTS };
    setCounts({ ...EMPTY_COUNTS });
    lastActionRef.current = [];
    setDisplayTime('00:00:00');
    setAppState('idle');
  }

  function triggerSiren() {
    if (sirenTimerRef.current) clearTimeout(sirenTimerRef.current);
    setSirenActive(true);
    sirenTimerRef.current = setTimeout(() => setSirenActive(false), 2500);
  }

  function spawnFloatingEmoji(emoji: string, count: number) {
    const vw = window.innerWidth;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const el = document.createElement('span');
        el.className = 'floating-emoji';
        el.textContent = emoji;
        const minX = Math.max(vw * 0.55, vw - 160);
        el.style.left = `${minX + Math.random() * 80}px`;
        el.style.animationDuration = `${1.4 + Math.random() * 0.8}s`;
        el.style.fontSize = `${1.6 + Math.random() * 0.8}rem`;
        document.body.appendChild(el);
        el.addEventListener('animationend', () => el.remove(), { once: true });
      }, i * 180);
    }
  }

  function register(type: keyof Counts) {
    if (appState !== 'running') return;
    const next = {
      ...countsRef.current,
      [type]: countsRef.current[type] + 1,
    };
    countsRef.current = next;
    setCounts(next);
    bumpAnim(type);
    lastActionRef.current.push(type);
    if (type === 'malePhone' || type === 'femalePhone') {
      triggerSiren();
      spawnFloatingEmoji('😡', 4);
    } else {
      spawnFloatingEmoji('😊', 3);
    }
  }

  function handleUndo() {
    if (appState === 'idle') return;
    const last = lastActionRef.current.pop();
    if (!last) return;
    const next = {
      ...countsRef.current,
      [last]: Math.max(0, countsRef.current[last] - 1),
    };
    countsRef.current = next;
    setCounts(next);
    spawnFloatingEmoji('😅', 2);
  }

  function bumpAnim(type: string) {
    const btn = btnRefs.current[type];
    if (!btn) return;
    btn.classList.remove('bumping');
    void btn.offsetWidth; // force reflow to restart animation
    btn.classList.add('bumping');
    btn.addEventListener(
      'animationend',
      () => btn.classList.remove('bumping'),
      {
        once: true,
      }
    );
    // Ripple effect
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    const size = Math.max(btn.offsetWidth, btn.offsetHeight);
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${btn.offsetWidth / 2 - size / 2}px;top:${btn.offsetHeight / 2 - size / 2}px;`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  // Derived values
  const { male, female, malePhone, femalePhone } = counts;
  const total = male + female + malePhone + femalePhone;
  const totalMale = male + malePhone;
  const totalFemale = female + femalePhone;
  const isRunning = appState === 'running';
  const isActive = appState !== 'idle';

  const startPauseBtnClass =
    appState === 'idle'
      ? 'ctrl-start'
      : appState === 'running'
        ? 'ctrl-pause'
        : 'ctrl-resume';

  const startPauseLabel =
    appState === 'idle' ? 'Start' : appState === 'running' ? 'Pause' : 'Resume';

  const statusPillClass =
    appState === 'idle'
      ? 'status-idle'
      : appState === 'running'
        ? 'status-running'
        : 'status-paused';

  const statusLabel =
    appState === 'idle'
      ? 'Idle'
      : appState === 'running'
        ? 'Running'
        : 'Paused';

  return (
    <div
      className="min-h-screen p-4 pb-8"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Police siren overlay */}
      {sirenActive && <div className="siren-overlay" aria-hidden="true" />}

      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="pt-2 pb-3 text-center">
          <div className="mb-1 flex items-center justify-center gap-3">
            <MobileScreenButtonIcon
              className="text-red-400"
              style={{ width: '1.25rem', height: '1.25rem' }}
            />
            <h1
              className="text-2xl font-bold text-white"
              style={{ letterSpacing: '0.18em' }}
            >
              INSTACRASH
            </h1>
            <CarIcon
              className="text-blue-400"
              style={{ width: '1.25rem', height: '1.25rem' }}
            />
          </div>
          <p className="text-sm tracking-wider text-gray-500 uppercase">
            Follow people using smartphone while driving
          </p>
        </div>

        {/* Control Panel */}
        <div className="stat-card mb-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="timer-display">{displayTime}</div>
              <div className="mt-1">
                <span className={`status-pill ${statusPillClass}`}>
                  <span className="status-dot" />
                  <span>{statusLabel}</span>
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="mb-1 text-xs tracking-widest text-gray-500 uppercase">
                Total observed
              </div>
              <div className="mono text-4xl font-medium text-white">
                {total}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              className="ctrl-btn ctrl-undo ctrl-side"
              onClick={handleUndo}
              style={{
                visibility: isActive && total > 0 ? 'visible' : 'hidden',
              }}
              title="Undo last entry"
            >
              <RotateLeftIcon style={{ width: '1em', height: '1em' }} />
            </button>
            <button
              className={`ctrl-btn flex-1 ${startPauseBtnClass}`}
              onClick={handleStartPause}
            >
              {appState === 'running' ? (
                <PauseIcon style={{ width: '1em', height: '1em' }} />
              ) : (
                <PlayIcon style={{ width: '1em', height: '1em' }} />
              )}
              <span>{startPauseLabel}</span>
            </button>
            <button
              className="ctrl-btn ctrl-end ctrl-side"
              onClick={handleEnd}
              style={{ visibility: isActive ? 'visible' : 'hidden' }}
              title="End session"
            >
              <CheckeredFlagIcon style={{ width: '1em', height: '1em' }} />
            </button>
          </div>
        </div>

        {/* Count Buttons — two gender columns */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          {/* ── Male column ── */}
          <div className="flex flex-col gap-2">
            <div className="col-gender-header col-male-header">
              <PersonIcon style={{ width: '1.4rem', height: '1.4rem' }} />
              <span>Male</span>
            </div>
            <button
              ref={(el) => {
                btnRefs.current.male = el;
              }}
              className="count-btn btn-male"
              onClick={() => register('male')}
              disabled={!isRunning}
            >
              <CheckIcon style={{ width: '1.6rem', height: '1.6rem' }} />
              <span className="count-number">{male}</span>
            </button>
            <button
              ref={(el) => {
                btnRefs.current.malePhone = el;
              }}
              className="count-btn btn-male-infraction"
              onClick={() => register('malePhone')}
              disabled={!isRunning}
            >
              <MobileScreenButtonIcon
                style={{ width: '1.6rem', height: '1.6rem' }}
              />
              <span className="count-number">{malePhone}</span>
            </button>
          </div>

          {/* ── Female column ── */}
          <div className="flex flex-col gap-2">
            <div className="col-gender-header col-female-header">
              <PersonDressIcon style={{ width: '1.4rem', height: '1.4rem' }} />
              <span>Female</span>
            </div>
            <button
              ref={(el) => {
                btnRefs.current.female = el;
              }}
              className="count-btn btn-female"
              onClick={() => register('female')}
              disabled={!isRunning}
            >
              <CheckIcon style={{ width: '1.6rem', height: '1.6rem' }} />
              <span className="count-number">{female}</span>
            </button>
            <button
              ref={(el) => {
                btnRefs.current.femalePhone = el;
              }}
              className="count-btn btn-female-infraction"
              onClick={() => register('femalePhone')}
              disabled={!isRunning}
            >
              <MobileScreenButtonIcon
                style={{ width: '1.6rem', height: '1.6rem' }}
              />
              <span className="count-number">{femalePhone}</span>
            </button>
          </div>
        </div>

        {/* Live Stats & Chart */}
        <div className="stat-card mb-4">
          <div className="mb-3 flex items-center gap-2 text-xs tracking-widest text-gray-500 uppercase">
            <ChartPieIcon
              style={{
                width: '0.875rem',
                height: '0.875rem',
                color: '#4b5563',
              }}
            />
            Live infraction breakdown
          </div>
          <div className="flex items-center gap-4">
            <div style={{ width: 140, height: 140, flexShrink: 0 }}>
              <canvas ref={liveCanvasRef} />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="legend-dot"
                  style={{ background: '#2563eb' }}
                />
                <span className="text-gray-400">Male infraction</span>
                <span className="mono ml-auto font-medium text-blue-400">
                  {total ? `${pct(malePhone, total)}%` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="legend-dot"
                  style={{ background: '#db2777' }}
                />
                <span className="text-gray-400">Female infraction</span>
                <span className="mono ml-auto font-medium text-pink-400">
                  {total ? `${pct(femalePhone, total)}%` : '—'}
                </span>
              </div>
              <hr className="divider my-2" />
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="legend-dot"
                  style={{ background: '#6b7280' }}
                />
                <span className="text-gray-400">No infraction</span>
                <span className="mono ml-auto font-medium text-gray-400">
                  {total ? `${pct(male + female, total)}%` : '—'}
                </span>
              </div>
              <hr className="divider my-2" />
              <div className="space-y-1 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>Total male infraction rate</span>
                  <span className="mono text-blue-400">
                    {totalMale ? `${pct(malePhone, totalMale)}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total female infraction rate</span>
                  <span className="mono text-pink-400">
                    {totalFemale ? `${pct(femalePhone, totalFemale)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* History */}
        {measurements.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs tracking-widest text-gray-500 uppercase">
              <ClockRotateLeftIcon
                style={{
                  width: '0.875rem',
                  height: '0.875rem',
                  color: '#4b5563',
                }}
              />
              Past measurements
            </div>
            <div className="space-y-2">
              {measurements.map((m, i) => {
                const c = m.counts;
                const tot = c.male + c.female + c.malePhone + c.femalePhone;
                const infrPct = tot ? pct(c.malePhone + c.femalePhone, tot) : 0;
                const d = new Date(m.date);
                const dateStr = d.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                });
                const timeStr = d.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const rateColor =
                  infrPct > 50
                    ? 'text-red-400'
                    : infrPct > 20
                      ? 'text-amber-400'
                      : 'text-green-400';
                return (
                  <div
                    key={m.id}
                    className="history-item"
                    onClick={() => setSelectedMeasurement(m)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ')
                        setSelectedMeasurement(m);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold tracking-wide text-white">
                          Measurement #{measurements.length - i}
                        </div>
                        <div className="mono mt-0.5 text-xs text-gray-500">
                          {dateStr} · {timeStr} · {formatTime(m.duration)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`mono text-lg font-medium ${rateColor}`}
                        >
                          {infrPct}%
                        </div>
                        <div className="text-xs text-gray-500">
                          infraction rate
                        </div>
                      </div>
                      <ChevronRightIcon
                        className="ml-3 text-gray-600"
                        style={{ width: '0.75rem', height: '0.75rem' }}
                      />
                    </div>
                    <div className="mt-3 flex gap-3">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: '#2563eb' }}
                        />
                        <span className="text-gray-400">
                          {c.male}{' '}
                          <span className="text-blue-400">
                            +{c.malePhone}📱
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: '#db2777' }}
                        />
                        <span className="text-gray-400">
                          {c.female}{' '}
                          <span className="text-pink-400">
                            +{c.femalePhone}📱
                          </span>
                        </span>
                      </div>
                      <div className="ml-auto text-xs text-gray-500">
                        {tot} observed
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedMeasurement && (
        <div
          className="modal-bg"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedMeasurement(null);
          }}
        >
          <div className="modal-card">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-wide text-white">
                  Measurement Results
                </h2>
                <p className="mono mt-0.5 text-xs text-gray-500">
                  {new Date(selectedMeasurement.date).toLocaleDateString(
                    undefined,
                    { weekday: 'long', month: 'long', day: 'numeric' }
                  )}{' '}
                  · {formatTime(selectedMeasurement.duration)} duration ·{' '}
                  {selectedMeasurement.counts.male +
                    selectedMeasurement.counts.female +
                    selectedMeasurement.counts.malePhone +
                    selectedMeasurement.counts.femalePhone}{' '}
                  observed
                </p>
              </div>
              <button
                onClick={() => setSelectedMeasurement(null)}
                className="p-2 text-gray-500 transition-colors hover:text-white"
              >
                <XMarkIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
            </div>

            <div className="mb-6 flex justify-center" style={{ height: 200 }}>
              <canvas ref={modalCanvasRef} />
            </div>

            {(() => {
              const c = selectedMeasurement.counts;
              const tot = c.male + c.female + c.malePhone + c.femalePhone;
              const noInfr = c.male + c.female;
              const totMale = c.male + c.malePhone;
              const totFemale = c.female + c.femalePhone;
              const legendRows = [
                { color: '#2563eb', label: 'Male + Phone', value: c.malePhone },
                {
                  color: '#db2777',
                  label: 'Female + Phone',
                  value: c.femalePhone,
                },
                { color: '#374151', label: 'No infraction', value: noInfr },
              ];
              return (
                <>
                  <div className="mb-4 space-y-2">
                    {legendRows.map((r) => (
                      <div
                        key={r.label}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span
                          className="legend-dot"
                          style={{ background: r.color }}
                        />
                        <span className="flex-1 text-gray-300">{r.label}</span>
                        <span className="mono text-gray-400">{r.value}</span>
                        <span
                          className="mono w-12 text-right font-medium"
                          style={{ color: r.color }}
                        >
                          {tot ? pct(r.value, tot) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <hr className="divider my-4" />
                  <div className="grid grid-cols-3 gap-3">
                    <div className="stat-card text-center">
                      <div className="mb-1 text-xs tracking-wider text-gray-500 uppercase">
                        Male rate
                      </div>
                      <div className="mono text-2xl text-blue-400">
                        {totMale ? pct(c.malePhone, totMale) : 0}%
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {c.malePhone}/{totMale}
                      </div>
                    </div>
                    <div className="stat-card text-center">
                      <div className="mb-1 text-xs tracking-wider text-gray-500 uppercase">
                        Female rate
                      </div>
                      <div className="mono text-2xl text-pink-400">
                        {totFemale ? pct(c.femalePhone, totFemale) : 0}%
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {c.femalePhone}/{totFemale}
                      </div>
                    </div>
                    <div className="stat-card text-center">
                      <div className="mb-1 text-xs tracking-wider text-gray-500 uppercase">
                        Overall
                      </div>
                      <div className="mono text-2xl text-white">
                        {tot ? pct(c.malePhone + c.femalePhone, tot) : 0}%
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {c.malePhone + c.femalePhone}/{tot}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
