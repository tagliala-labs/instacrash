import React, { useEffect, useRef, useState } from 'react';
import { Chart, ArcElement, DoughnutController, Tooltip } from 'chart.js';
import {
  CarIcon,
  ChartPieIcon,
  CheckeredFlagIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockRotateLeftIcon,
  FaceAngryIcon,
  FaceSmileBeamIcon,
  MobileScreenButtonIcon,
  PauseIcon,
  PersonDressIcon,
  PersonIcon,
  PlayIcon,
  QuestionCircleIcon,
  RotateLeftIcon,
  TrashIcon,
  VolumeHighIcon,
  VolumeXmarkIcon,
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
  longestCombo: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const STORAGE_KEY = 'instacrash-measurements';
const SOUND_KEY = 'instacrash-sound';
const CHART_COLORS = ['#2563eb', '#db2777', '#374151'];
const EMPTY_COUNTS: Counts = {
  male: 0,
  female: 0,
  malePhone: 0,
  femalePhone: 0,
};

// ── i18n ──────────────────────────────────────────────────────────────────
const LANG_KEY = 'instacrash-lang';
type Lang = 'en' | 'it';

function detectLang(): Lang {
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (s === 'en' || s === 'it') return s;
  } catch {}
  return (navigator.language ?? '').toLowerCase().startsWith('it')
    ? 'it'
    : 'en';
}

function detectSound(): boolean {
  try {
    const s = localStorage.getItem(SOUND_KEY);
    if (s === 'true') return true;
    if (s === 'false') return false;
  } catch {}
  return false; // disabled by default
}

// ── Web Audio sound engine ─────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

function playSafeSound() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  // Crisp warm click: short sine burst at 880 Hz + 1320 Hz → descending ding
  const freqs = [880, 1320];
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + i * 0.04);
    osc.frequency.exponentialRampToValueAtTime(
      freq * 0.85,
      t + i * 0.04 + 0.12
    );
    gain.gain.setValueAtTime(0, t + i * 0.04);
    gain.gain.linearRampToValueAtTime(0.22, t + i * 0.04 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.04);
    osc.stop(t + i * 0.04 + 0.2);
  });
}

function playInfractionSound() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  // Dramatic descending: three falling tones 740 → 494 → 330 Hz
  const steps = [740, 494, 330];
  steps.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t + i * 0.1);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.7, t + i * 0.1 + 0.12);
    gain.gain.setValueAtTime(0, t + i * 0.1);
    gain.gain.linearRampToValueAtTime(
      i === 0 ? 0.22 : 0.16,
      t + i * 0.1 + 0.01
    );
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.28);
    // Low-pass to add weight
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1400;
    osc.connect(lpf);
    lpf.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.1);
    osc.stop(t + i * 0.1 + 0.3);
  });
}

function playComboSound() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  // Energetic ascending arpeggio: 523 → 659 → 784 → 1047 Hz (C5 E5 G5 C6)
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t + i * 0.06);
    gain.gain.setValueAtTime(0, t + i * 0.06);
    gain.gain.linearRampToValueAtTime(0.2, t + i * 0.06 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t + i * 0.06);
    osc.stop(t + i * 0.06 + 0.15);
  });
}

function playUndoSound() {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(660, t);
  osc.frequency.exponentialRampToValueAtTime(330, t + 0.15);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

function playSirenSound(direction: 'ltr' | 'rtl') {
  const ctx = getAudioCtx();
  // Start 80ms after button press: lights just flashed, car still offscreen.
  const t0 = ctx.currentTime + 0.08;

  // Keyframe offsets from t0 — derived from CSS animation physics:
  //   CSS: 0.25s delay, 2.8s duration, linear. Siren lead = 0.08s → anim offset = 0.17s.
  //   Velocities: entry 58.8 vw/s → braking ~18 vw/s → stop ~4 vw/s → accel 58 vw/s → exit 140 vw/s
  const K = {
    enter: 0.31, // 5% car appears, fast approach 58.8 vw/s
    fastEnd: 0.79, // 22% fast entry ends, car at 28vw
    brake: 1.18, // 36% braking, 36vw
    stop: 1.68, // 54% almost stopped, 39vw — clearly before center
    pass: 1.87, // center crossing ~50vw at 58 vw/s (accelerating)
    accel: 2.13, // 70% acceleration peak, 65vw
    exit: 2.52, // 84% abrupt exit
    end: 2.72,
  };

  // Signal chain: osc → lpf → masterGain → panner → destination
  //                      lfo → lfoGain → osc.frequency (modulation)
  const panner = ctx.createStereoPanner();
  panner.connect(ctx.destination);

  const masterGain = ctx.createGain();
  masterGain.connect(panner);

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 2100;
  lpf.Q.value = 0.6;
  lpf.connect(masterGain);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.connect(lpf);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  const lfoGain = ctx.createGain();
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  // ─ BASE PITCH: exaggerated Doppler (±28%) around 700 Hz emission ───────
  // fast approach (58.8 vw/s) → ×1.25 = 875 Hz
  // braking    (18  vw/s  )   → ×1.08 = 756 Hz
  // almost stopped (~4 vw/s ) → ×1.01 = 707 Hz  (near-zero Doppler)
  // center flip, accelerating → drops to 578 Hz  (fast recession)
  // exit       (140 vw/s  )   → ×0.62 = 434 Hz
  osc.frequency.setValueAtTime(800, t0);
  osc.frequency.linearRampToValueAtTime(875, t0 + K.enter);
  osc.frequency.linearRampToValueAtTime(756, t0 + K.brake);
  osc.frequency.linearRampToValueAtTime(714, t0 + K.stop);
  osc.frequency.linearRampToValueAtTime(704, t0 + K.stop + 0.12); // zero-velocity moment
  osc.frequency.linearRampToValueAtTime(578, t0 + K.pass + 0.12); // Doppler drop
  osc.frequency.linearRampToValueAtTime(510, t0 + K.accel);
  osc.frequency.linearRampToValueAtTime(434, t0 + K.exit); // 140 vw/s recession
  osc.frequency.linearRampToValueAtTime(390, t0 + K.end);

  // ─ LFO RATE: sweep cycle is Doppler-compressed approaching, stretched receding ─
  lfo.frequency.setValueAtTime(2.1, t0);
  lfo.frequency.linearRampToValueAtTime(2.25, t0 + K.enter); // fast approach
  lfo.frequency.linearRampToValueAtTime(1.92, t0 + K.brake);
  lfo.frequency.linearRampToValueAtTime(1.78, t0 + K.stop); // near-static
  lfo.frequency.linearRampToValueAtTime(1.5, t0 + K.accel); // receding
  lfo.frequency.linearRampToValueAtTime(1.22, t0 + K.end);

  // ─ LFO SWING: proportional to velocity (faster = wider wee–woo arc) ───
  lfoGain.gain.setValueAtTime(115, t0);
  lfoGain.gain.linearRampToValueAtTime(155, t0 + K.enter); // fast = wide
  lfoGain.gain.linearRampToValueAtTime(100, t0 + K.brake);
  lfoGain.gain.linearRampToValueAtTime(55, t0 + K.stop); // near-zero = narrow
  lfoGain.gain.linearRampToValueAtTime(55, t0 + K.pass);
  lfoGain.gain.linearRampToValueAtTime(115, t0 + K.accel); // accelerating again
  lfoGain.gain.linearRampToValueAtTime(145, t0 + K.exit); // fast exit
  lfoGain.gain.linearRampToValueAtTime(70, t0 + K.end);

  // ─ STEREO PAN: mapped from exact car position ──────────────────────
  // pan(vw) = (vw − 50) / 62  — negative = left, positive = right
  // LTR: -0.9 → 0 → +0.9  |  RTL: mirrored
  const sgn = direction === 'ltr' ? 1 : -1;
  panner.pan.setValueAtTime(-0.9 * sgn, t0);
  panner.pan.linearRampToValueAtTime(-0.85 * sgn, t0 + K.enter);
  panner.pan.linearRampToValueAtTime(-0.37 * sgn, t0 + K.fastEnd); // 28vw
  panner.pan.linearRampToValueAtTime(-0.23 * sgn, t0 + K.brake); // 36vw
  panner.pan.linearRampToValueAtTime(-0.18 * sgn, t0 + K.stop); // 39vw
  panner.pan.linearRampToValueAtTime(0, t0 + K.pass); // 50vw center
  panner.pan.linearRampToValueAtTime(0.25 * sgn, t0 + K.accel); // 65vw
  panner.pan.linearRampToValueAtTime(0.9 * sgn, t0 + K.exit);

  // ─ VOLUME: inverse distance from center + envelope ─────────────────
  // Loudest when car is nearest (at K.pass, 50vw), quieter at edges
  masterGain.gain.setValueAtTime(0, t0);
  masterGain.gain.linearRampToValueAtTime(0.07, t0 + K.enter);
  masterGain.gain.linearRampToValueAtTime(0.15, t0 + K.brake);
  masterGain.gain.linearRampToValueAtTime(0.24, t0 + K.stop);
  masterGain.gain.linearRampToValueAtTime(0.28, t0 + K.pass); // closest
  masterGain.gain.linearRampToValueAtTime(0.18, t0 + K.accel);
  masterGain.gain.linearRampToValueAtTime(0.08, t0 + K.exit);
  masterGain.gain.linearRampToValueAtTime(0, t0 + K.end);

  lfo.start(t0);
  lfo.stop(t0 + K.end + 0.05);
  osc.start(t0);
  osc.stop(t0 + K.end + 0.05);
}

const T: Record<
  Lang,
  {
    tagline: string;
    totalObserved: string;
    start: string;
    pause: string;
    resume: string;
    idle: string;
    running: string;
    paused: string;
    undoTitle: string;
    endTitle: string;
    maleDriver: string;
    femaleDriver: string;
    liveBreakdown: string;
    maleInfraction: string;
    femaleInfraction: string;
    noInfraction: string;
    totalMaleRate: string;
    totalFemaleRate: string;
    allTimeTotals: (n: number) => string;
    maleRate: string;
    femaleRate: string;
    overall: string;
    pastMeasurements: string;
    measurement: (n: number) => string;
    infractionRate: string;
    observed: string;
    measurementResults: string;
    duration: string;
    malePhone: string;
    femalePhone: string;
    deleteMeasurement: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    best: string;
    maxCombo: string;
    cancel: string;
    delete: string;
    helpTitle: string;
    close: string;
  }
> = {
  en: {
    tagline: 'Follow people texting while driving',
    totalObserved: 'Total observed',
    start: 'Start',
    pause: 'Pause',
    resume: 'Resume',
    idle: 'Idle',
    running: 'Running',
    paused: 'Paused',
    undoTitle: 'Undo last entry',
    endTitle: 'End',
    maleDriver: 'Male driver',
    femaleDriver: 'Female driver',
    liveBreakdown: 'Live infraction breakdown',
    maleInfraction: 'Male infraction',
    femaleInfraction: 'Female infraction',
    noInfraction: 'No infraction',
    totalMaleRate: 'Total male infraction rate',
    totalFemaleRate: 'Total female infraction rate',
    allTimeTotals: (n) => `All-time totals · ${n} session${n !== 1 ? 's' : ''}`,
    maleRate: 'Male rate',
    femaleRate: 'Female rate',
    overall: 'Overall',
    pastMeasurements: 'Past measurements',
    measurement: (n) => `Measurement #${n}`,
    infractionRate: 'infraction rate',
    observed: 'observed',
    measurementResults: 'Measurement Results',
    duration: 'duration',
    malePhone: 'Male + Phone',
    femalePhone: 'Female + Phone',
    deleteMeasurement: 'Delete measurement',
    deleteConfirmTitle: 'Delete this measurement?',
    deleteConfirmBody: 'This action cannot be undone.',
    best: 'Best',
    maxCombo: 'Max combo',
    cancel: 'Cancel',
    delete: 'Delete',
    helpTitle: 'How to use',
    close: 'Close',
  },
  it: {
    tagline: 'Segui chi usa il telefono alla guida',
    totalObserved: 'Totale osservati',
    start: 'Inizia',
    pause: 'Pausa',
    resume: 'Riprendi',
    idle: 'Inattivo',
    running: 'In corso',
    paused: 'In pausa',
    undoTitle: 'Annulla ultima voce',
    endTitle: 'Fine',
    maleDriver: 'Guida uomo',
    femaleDriver: 'Guida donna',
    liveBreakdown: 'Infrazioni in tempo reale',
    maleInfraction: 'Infrazione uomo',
    femaleInfraction: 'Infrazione donna',
    noInfraction: 'Nessuna infrazione',
    totalMaleRate: 'Tasso infrazione uomini',
    totalFemaleRate: 'Tasso infrazione donne',
    allTimeTotals: (n) => `Totali · ${n} session${n !== 1 ? 'i' : 'e'}`,
    maleRate: 'Tasso uomini',
    femaleRate: 'Tasso donne',
    overall: 'Totale',
    pastMeasurements: 'Misurazioni passate',
    measurement: (n) => `Misurazione #${n}`,
    infractionRate: 'tasso infrazione',
    observed: 'osservati',
    measurementResults: 'Risultati misurazione',
    duration: 'durata',
    malePhone: 'Uomo + Telefono',
    femalePhone: 'Donna + Telefono',
    deleteMeasurement: 'Elimina misurazione',
    deleteConfirmTitle: 'Eliminare questa misurazione?',
    deleteConfirmBody: "L'azione non può essere annullata.",
    best: 'Migliore',
    maxCombo: 'Max combo',
    cancel: 'Annulla',
    delete: 'Elimina',
    helpTitle: 'Come funziona',
    close: 'Chiudi',
  },
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
  const [sirenActive, setSirenActive] = useState<'male' | 'female' | null>(
    null
  );
  const [selectedMeasurement, setSelectedMeasurement] =
    useState<Measurement | null>(null);
  const [lang, setLang] = useState<Lang>(detectLang);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(detectSound);
  const [comboCount, setComboCount] = useState(0);
  const [longestCombo, setLongestCombo] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Refs for values used inside callbacks without causing re-renders
  const elapsedRef = useRef(0);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sirenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsRef = useRef<Counts>({ ...EMPTY_COUNTS });
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastActionRef = useRef<Array<keyof Counts>>([]);
  const comboRef = useRef(0);
  const longestComboRef = useRef(0);

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
      comboRef.current = 0;
      longestComboRef.current = 0;
      setComboCount(0);
      setLongestCombo(0);
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
      longestCombo: longestComboRef.current,
    };
    setMeasurements((prev) => [snap, ...prev]);
    elapsedRef.current = 0;
    countsRef.current = { ...EMPTY_COUNTS };
    setCounts({ ...EMPTY_COUNTS });
    lastActionRef.current = [];
    comboRef.current = 0;
    longestComboRef.current = 0;
    setComboCount(0);
    setLongestCombo(0);
    setDisplayTime('00:00:00');
    setAppState('idle');
  }

  function triggerSiren(gender: 'male' | 'female') {
    if (sirenTimerRef.current) clearTimeout(sirenTimerRef.current);
    setSirenActive(gender);
    sirenTimerRef.current = setTimeout(() => setSirenActive(null), 2500);
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

  function spawnComboText(n: number) {
    const el = document.createElement('div');
    el.className = 'floating-combo';
    el.textContent = `${n}\u00d7 COMBO`;
    el.style.fontSize = `${1.4 + Math.min(n - 2, 6) * 0.15}rem`;
    const vw = window.innerWidth;
    el.style.left = `${vw * 0.15 + Math.random() * vw * 0.5}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
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
      comboRef.current += 1;
      if (comboRef.current > longestComboRef.current) {
        longestComboRef.current = comboRef.current;
        setLongestCombo(longestComboRef.current);
      }
      setComboCount(comboRef.current);
      if (comboRef.current >= 2) spawnComboText(comboRef.current);
      triggerSiren(type === 'malePhone' ? 'male' : 'female');
      if (soundEnabled) {
        playInfractionSound();
        playSirenSound(type === 'malePhone' ? 'ltr' : 'rtl');
        if (comboRef.current >= 2) playComboSound();
      }
      spawnFloatingEmoji('😡', 4);
    } else {
      comboRef.current = 0;
      setComboCount(0);
      if (soundEnabled) playSafeSound();
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
    comboRef.current = 0;
    setComboCount(0);
    if (soundEnabled) playUndoSound();
    spawnFloatingEmoji('😅', 2);
  }

  function toggleLang() {
    setLang((l) => {
      const next: Lang = l === 'en' ? 'it' : 'en';
      try {
        localStorage.setItem(LANG_KEY, next);
      } catch {}
      return next;
    });
  }

  function toggleSound() {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_KEY, String(next));
      } catch {}
      return next;
    });
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
  const t = T[lang];
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
    appState === 'idle' ? t.start : appState === 'running' ? t.pause : t.resume;

  const statusPillClass =
    appState === 'idle'
      ? 'status-idle'
      : appState === 'running'
        ? 'status-running'
        : 'status-paused';

  const statusLabel =
    appState === 'idle'
      ? t.idle
      : appState === 'running'
        ? t.running
        : t.paused;

  return (
    <>
      <div
        className="min-h-screen p-4 pb-8"
        style={{ background: 'var(--bg)', color: 'var(--text)' }}
      >
        {/* Police siren overlay */}
        {sirenActive && (
          <>
            <div className="siren-overlay" aria-hidden="true" />
            <div
              className={`police-car police-car--${sirenActive}`}
              aria-hidden="true"
            >
              🚓
            </div>
          </>
        )}

        <div className="mx-auto max-w-lg">
          {/* Header */}
          <div className="relative pt-2 pb-3 text-center">
            <div className="absolute top-2 left-0">
              <button
                onClick={() => setShowHelp(true)}
                className="rounded px-2 py-1 text-gray-500 transition-colors hover:text-white"
                title={t.helpTitle}
              >
                <QuestionCircleIcon style={{ width: '1rem', height: '1rem' }} />
              </button>
            </div>
            <div className="absolute top-2 right-0 flex items-center gap-1">
              <button
                onClick={toggleSound}
                className="rounded px-2 py-1 text-gray-500 transition-colors hover:text-white"
                title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {soundEnabled ? (
                  <VolumeHighIcon style={{ width: '1rem', height: '1rem' }} />
                ) : (
                  <VolumeXmarkIcon style={{ width: '1rem', height: '1rem' }} />
                )}
              </button>
              <button
                onClick={toggleLang}
                className="rounded px-2 py-1 text-sm font-bold tracking-widest text-gray-500 uppercase transition-colors hover:text-white"
              >
                {lang === 'en' ? 'IT' : 'EN'}
              </button>
            </div>
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
              {t.tagline}
            </p>
          </div>

          {/* Control Panel */}
          <div className="stat-card mb-3">
            <div className="mb-3 flex items-center gap-3">
              <div className="timer-display">{displayTime}</div>
              <span className={`status-pill ${statusPillClass}`}>
                <span className="status-dot" />
                <span>{statusLabel}</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="ctrl-btn ctrl-undo ctrl-side"
                onClick={handleUndo}
                disabled={!isActive || total === 0}
                title={t.undoTitle}
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
                <span className="mr-auto">{startPauseLabel}</span>
              </button>
              <button
                className="ctrl-btn ctrl-end"
                onClick={handleEnd}
                disabled={appState !== 'paused'}
              >
                <CheckeredFlagIcon style={{ width: '1em', height: '1em' }} />
                <span>{t.endTitle}</span>
              </button>
            </div>
          </div>

          {/* Total observed */}
          <div className="stat-card mb-3 flex items-center justify-between">
            <span className="text-base font-bold tracking-widest text-gray-400 uppercase">
              {t.totalObserved}
            </span>
            <div className="flex items-center gap-3">
              {comboCount >= 2 && (
                <span className="combo-pill combo-active">
                  🔥 {comboCount}×
                </span>
              )}
              <span className="mono text-2xl font-medium text-white">
                {total}
              </span>
            </div>
          </div>

          {/* Count Buttons — two gender columns */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            {/* ── Male column ── */}
            <div className="col-male flex flex-col gap-2">
              <button
                ref={(el) => {
                  btnRefs.current.male = el;
                }}
                className="count-btn btn-male"
                onClick={() => register('male')}
                disabled={!isRunning}
              >
                <div
                  style={{ display: 'flex', gap: '2px', alignItems: 'center' }}
                >
                  <CheckIcon style={{ width: '2rem', height: '2rem' }} />
                  <FaceSmileBeamIcon
                    style={{ width: '2rem', height: '2rem' }}
                  />
                </div>
                <span className="count-number">{male}</span>
              </button>
              <div className="col-gender-header col-male-header">
                <PersonIcon style={{ width: '1.4rem', height: '1.4rem' }} />
                <span>{t.maleDriver}</span>
              </div>
              <button
                ref={(el) => {
                  btnRefs.current.malePhone = el;
                }}
                className="count-btn btn-male-infraction"
                onClick={() => register('malePhone')}
                disabled={!isRunning}
              >
                <div
                  style={{ display: 'flex', gap: '2px', alignItems: 'center' }}
                >
                  <MobileScreenButtonIcon
                    style={{ width: '2rem', height: '2rem' }}
                  />
                  <FaceAngryIcon style={{ width: '2rem', height: '2rem' }} />
                </div>
                <span className="count-number">{malePhone}</span>
              </button>
            </div>

            {/* ── Female column ── */}
            <div className="col-female flex flex-col gap-2">
              <button
                ref={(el) => {
                  btnRefs.current.female = el;
                }}
                className="count-btn btn-female"
                onClick={() => register('female')}
                disabled={!isRunning}
              >
                <div
                  style={{ display: 'flex', gap: '2px', alignItems: 'center' }}
                >
                  <CheckIcon style={{ width: '2rem', height: '2rem' }} />
                  <FaceSmileBeamIcon
                    style={{ width: '2rem', height: '2rem' }}
                  />
                </div>
                <span className="count-number">{female}</span>
              </button>
              <div className="col-gender-header col-female-header">
                <PersonDressIcon
                  style={{ width: '1.4rem', height: '1.4rem' }}
                />
                <span>{t.femaleDriver}</span>
              </div>
              <button
                ref={(el) => {
                  btnRefs.current.femalePhone = el;
                }}
                className="count-btn btn-female-infraction"
                onClick={() => register('femalePhone')}
                disabled={!isRunning}
              >
                <div
                  style={{ display: 'flex', gap: '2px', alignItems: 'center' }}
                >
                  <MobileScreenButtonIcon
                    style={{ width: '2rem', height: '2rem' }}
                  />
                  <FaceAngryIcon style={{ width: '2rem', height: '2rem' }} />
                </div>
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
              {t.liveBreakdown}
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
                  <span className="text-gray-400">{t.maleInfraction}</span>
                  <span className="mono ml-auto font-medium text-blue-400">
                    {total ? `${pct(malePhone, total)}%` : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="legend-dot"
                    style={{ background: '#db2777' }}
                  />
                  <span className="text-gray-400">{t.femaleInfraction}</span>
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
                  <span className="text-gray-400">{t.noInfraction}</span>
                  <span className="mono ml-auto font-medium text-gray-400">
                    {total ? `${pct(male + female, total)}%` : '—'}
                  </span>
                </div>
                <hr className="divider my-2" />
                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>{t.totalMaleRate}</span>
                    <span className="mono text-blue-400">
                      {totalMale ? `${pct(malePhone, totalMale)}%` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t.totalFemaleRate}</span>
                    <span className="mono text-pink-400">
                      {totalFemale ? `${pct(femalePhone, totalFemale)}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* History */}
          {measurements.length > 0 &&
            (() => {
              const gMale = measurements.reduce((s, m) => s + m.counts.male, 0);
              const gFemale = measurements.reduce(
                (s, m) => s + m.counts.female,
                0
              );
              const gMalePhone = measurements.reduce(
                (s, m) => s + m.counts.malePhone,
                0
              );
              const gFemalePhone = measurements.reduce(
                (s, m) => s + m.counts.femalePhone,
                0
              );
              const gTotal = gMale + gFemale + gMalePhone + gFemalePhone;
              const gTotalMale = gMale + gMalePhone;
              const gTotalFemale = gFemale + gFemalePhone;
              const gMaxCombo = measurements.reduce(
                (max, m) => Math.max(max, m.longestCombo ?? 0),
                0
              );
              const locale = lang === 'it' ? 'it-IT' : 'en-US';
              return (
                <div>
                  {/* Global aggregated stats */}
                  <div className="stat-card mb-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs tracking-widest text-gray-500 uppercase">
                        <ChartPieIcon
                          style={{
                            width: '0.875rem',
                            height: '0.875rem',
                            color: '#4b5563',
                          }}
                        />
                        {t.allTimeTotals(measurements.length)}
                      </div>
                      {gMaxCombo >= 2 && (
                        <span
                          className="combo-pill combo-active"
                          style={{ fontSize: '0.65rem', padding: '1px 7px' }}
                        >
                          🔥 {gMaxCombo}×
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="stat-card text-center">
                        <div className="mb-1 text-xs tracking-wider text-gray-500 uppercase">
                          {t.maleRate}
                        </div>
                        <div className="mono text-2xl text-blue-400">
                          {gTotalMale ? pct(gMalePhone, gTotalMale) : 0}%
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {gMalePhone}/{gTotalMale}
                        </div>
                      </div>
                      <div className="stat-card text-center">
                        <div className="mb-1 text-xs tracking-wider text-gray-500 uppercase">
                          {t.femaleRate}
                        </div>
                        <div className="mono text-2xl text-pink-400">
                          {gTotalFemale ? pct(gFemalePhone, gTotalFemale) : 0}%
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {gFemalePhone}/{gTotalFemale}
                        </div>
                      </div>
                      <div className="stat-card text-center">
                        <div className="mb-1 text-xs tracking-wider text-gray-500 uppercase">
                          {t.overall}
                        </div>
                        <div className="mono text-2xl text-white">
                          {gTotal ? pct(gMalePhone + gFemalePhone, gTotal) : 0}%
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {gMalePhone + gFemalePhone}/{gTotal}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 flex items-center gap-2 text-xs tracking-widest text-gray-500 uppercase">
                    <ClockRotateLeftIcon
                      style={{
                        width: '0.875rem',
                        height: '0.875rem',
                        color: '#4b5563',
                      }}
                    />
                    {t.pastMeasurements}
                  </div>
                  <div className="space-y-2">
                    {measurements.map((m, i) => {
                      const c = m.counts;
                      const tot =
                        c.male + c.female + c.malePhone + c.femalePhone;
                      const infrPct = tot
                        ? pct(c.malePhone + c.femalePhone, tot)
                        : 0;
                      const d = new Date(m.date);
                      const dateStr = d.toLocaleDateString(locale, {
                        month: 'short',
                        day: 'numeric',
                      });
                      const timeStr = d.toLocaleTimeString(locale, {
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
                                {t.measurement(measurements.length - i)}
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
                                {t.infractionRate}
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
                            {(m.longestCombo ?? 0) >= 2 && (
                              <span
                                className="combo-pill combo-active"
                                style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 7px',
                                }}
                              >
                                🔥 {m.longestCombo}×
                              </span>
                            )}
                            <div className="ml-auto text-xs text-gray-500">
                              {tot} {t.observed}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
        </div>

        {/* Detail modal */}
        {selectedMeasurement && (
          <div
            className="modal-bg"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedMeasurement(null);
            }}
          >
            <div className="modal-card">
              <button
                onClick={() => setSelectedMeasurement(null)}
                className="modal-close-btn text-gray-500 transition-colors hover:text-white"
              >
                <XMarkIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>
              <div className="mb-4 pr-8">
                <h2 className="text-xl font-bold tracking-wide text-white">
                  {t.measurementResults}
                </h2>
                <p className="mono mt-0.5 text-xs text-gray-500">
                  {new Date(selectedMeasurement.date).toLocaleDateString(
                    lang === 'it' ? 'it-IT' : 'en-US',
                    { weekday: 'long', month: 'long', day: 'numeric' }
                  )}{' '}
                  · {formatTime(selectedMeasurement.duration)} {t.duration} ·{' '}
                  {selectedMeasurement.counts.male +
                    selectedMeasurement.counts.female +
                    selectedMeasurement.counts.malePhone +
                    selectedMeasurement.counts.femalePhone}{' '}
                  {t.observed}
                </p>
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
                  { color: '#2563eb', label: t.malePhone, value: c.malePhone },
                  {
                    color: '#db2777',
                    label: t.femalePhone,
                    value: c.femalePhone,
                  },
                  { color: '#374151', label: t.noInfraction, value: noInfr },
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
                          <span className="flex-1 text-gray-300">
                            {r.label}
                          </span>
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
                          {t.maleRate}
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
                          {t.femaleRate}
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
                          {t.overall}
                        </div>
                        <div className="mono text-2xl text-white">
                          {tot ? pct(c.malePhone + c.femalePhone, tot) : 0}%
                        </div>
                        <div className="mt-1 text-xs text-gray-600">
                          {c.malePhone + c.femalePhone}/{tot}
                        </div>
                      </div>
                    </div>
                    <hr className="divider my-4" />
                    <button
                      className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-red-500 transition-colors hover:bg-red-950 hover:text-red-400"
                      onClick={() => setPendingDeleteId(selectedMeasurement.id)}
                    >
                      <TrashIcon
                        style={{ width: '0.8rem', height: '0.8rem' }}
                      />
                      {t.deleteMeasurement}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Confirm delete modal */}
        {pendingDeleteId !== null && (
          <div
            className="modal-bg"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPendingDeleteId(null);
            }}
          >
            <div className="modal-card" style={{ maxWidth: 360 }}>
              <h2 className="mb-2 text-lg font-bold text-white">
                {t.deleteConfirmTitle}
              </h2>
              <p className="mb-5 text-sm text-gray-400">
                {t.deleteConfirmBody}
              </p>
              <div className="flex gap-3">
                <button
                  className="ctrl-btn ctrl-undo flex-1"
                  onClick={() => setPendingDeleteId(null)}
                >
                  {t.cancel}
                </button>
                <button
                  className="ctrl-btn ctrl-end flex-1"
                  onClick={() => {
                    setMeasurements((prev) =>
                      prev.filter((x) => x.id !== pendingDeleteId)
                    );
                    if (selectedMeasurement?.id === pendingDeleteId)
                      setSelectedMeasurement(null);
                    setPendingDeleteId(null);
                  }}
                >
                  {t.delete}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Help Modal */}
        {showHelp && (
          <div
            className="modal-bg"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowHelp(false);
            }}
          >
            <div className="modal-card">
              <button
                onClick={() => setShowHelp(false)}
                className="modal-close-btn text-gray-500 transition-colors hover:text-white"
              >
                <XMarkIcon style={{ width: '1.25rem', height: '1.25rem' }} />
              </button>

              <h2 className="mb-4 text-xl font-bold tracking-wide text-white">
                {t.helpTitle}
              </h2>

              {/* English instructions */}
              <div className="mb-5">
                <h3 className="mb-2 text-sm font-bold tracking-widest text-gray-400 uppercase">
                  🇬🇧 English
                </h3>
                <ol className="space-y-2 text-sm text-gray-300">
                  <li>
                    <span className="font-semibold text-white">1.</span> Tap{' '}
                    <span className="font-semibold text-green-400">Start</span>{' '}
                    to begin a new measurement session — the timer will start
                    counting.
                  </li>
                  <li>
                    <span className="font-semibold text-white">2.</span> For
                    each vehicle you observe, tap the appropriate button:
                    <ul className="mt-1 ml-4 space-y-1">
                      <li>
                        <span className="text-blue-400">😊 Male driver</span> or{' '}
                        <span className="text-pink-400">😊 Female driver</span>{' '}
                        — driver is not using a phone.
                      </li>
                      <li>
                        <span className="text-blue-400">📱 Male + phone</span>{' '}
                        or{' '}
                        <span className="text-pink-400">📱 Female + phone</span>{' '}
                        — driver is using a phone (infraction).
                      </li>
                    </ul>
                  </li>
                  <li>
                    <span className="font-semibold text-white">3.</span> Use the{' '}
                    <span className="font-semibold text-yellow-400">
                      ↺ Undo
                    </span>{' '}
                    button to remove the last recorded entry.
                  </li>
                  <li>
                    <span className="font-semibold text-white">4.</span> Tap{' '}
                    <span className="font-semibold text-yellow-400">Pause</span>{' '}
                    to pause the timer, then{' '}
                    <span className="font-semibold text-green-400">Resume</span>{' '}
                    to continue.
                  </li>
                  <li>
                    <span className="font-semibold text-white">5.</span> Tap the{' '}
                    <span className="font-semibold text-red-400">🏁 End</span>{' '}
                    button to save the session and view the results.
                  </li>
                  <li>
                    <span className="font-semibold text-white">6.</span> Tap any
                    saved session in the history to see its detailed breakdown
                    and chart.
                  </li>
                  <li>
                    <span className="font-semibold text-white">7.</span> Use the{' '}
                    <span className="font-semibold text-gray-300">🔊</span> icon
                    to toggle sound effects and{' '}
                    <span className="font-semibold text-gray-300">EN / IT</span>{' '}
                    to switch the interface language.
                  </li>
                </ol>
              </div>

              <div className="border-t border-gray-700" />

              {/* Italian instructions */}
              <div className="mt-5 mb-2">
                <h3 className="mb-2 text-sm font-bold tracking-widest text-gray-400 uppercase">
                  🇮🇹 Italiano
                </h3>
                <ol className="space-y-2 text-sm text-gray-300">
                  <li>
                    <span className="font-semibold text-white">1.</span> Premi{' '}
                    <span className="font-semibold text-green-400">Inizia</span>{' '}
                    per avviare una nuova sessione di misurazione — il timer
                    inizierà a scorrere.
                  </li>
                  <li>
                    <span className="font-semibold text-white">2.</span> Per
                    ogni veicolo osservato, premi il pulsante appropriato:
                    <ul className="mt-1 ml-4 space-y-1">
                      <li>
                        <span className="text-blue-400">😊 Guida uomo</span> o{' '}
                        <span className="text-pink-400">😊 Guida donna</span> —
                        il conducente non usa il telefono.
                      </li>
                      <li>
                        <span className="text-blue-400">
                          📱 Uomo + telefono
                        </span>{' '}
                        o{' '}
                        <span className="text-pink-400">
                          📱 Donna + telefono
                        </span>{' '}
                        — il conducente sta usando il telefono (infrazione).
                      </li>
                    </ul>
                  </li>
                  <li>
                    <span className="font-semibold text-white">3.</span> Usa il
                    pulsante{' '}
                    <span className="font-semibold text-yellow-400">
                      ↺ Annulla
                    </span>{' '}
                    per rimuovere l&apos;ultima voce registrata.
                  </li>
                  <li>
                    <span className="font-semibold text-white">4.</span> Premi{' '}
                    <span className="font-semibold text-yellow-400">Pausa</span>{' '}
                    per mettere in pausa il timer, poi{' '}
                    <span className="font-semibold text-green-400">
                      Riprendi
                    </span>{' '}
                    per continuare.
                  </li>
                  <li>
                    <span className="font-semibold text-white">5.</span> Premi
                    il pulsante{' '}
                    <span className="font-semibold text-red-400">🏁 Fine</span>{' '}
                    per salvare la sessione e visualizzare i risultati.
                  </li>
                  <li>
                    <span className="font-semibold text-white">6.</span> Tocca
                    una sessione salvata nella cronologia per vedere il
                    dettaglio e il grafico.
                  </li>
                  <li>
                    <span className="font-semibold text-white">7.</span> Usa
                    l&apos;icona{' '}
                    <span className="font-semibold text-gray-300">🔊</span> per
                    attivare/disattivare i suoni e{' '}
                    <span className="font-semibold text-gray-300">EN / IT</span>{' '}
                    per cambiare la lingua dell&apos;interfaccia.
                  </li>
                </ol>
              </div>

              <button
                className="ctrl-btn ctrl-undo mt-4 w-full"
                onClick={() => setShowHelp(false)}
              >
                {t.close}
              </button>
            </div>
          </div>
        )}
      </div>

      <footer className="pb-4 text-center text-xs text-gray-600">
        <a
          href="https://github.com/tagliala-labs/instacrash"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-gray-400"
        >
          github.com/tagliala-labs/instacrash
        </a>
      </footer>
    </>
  );
}
