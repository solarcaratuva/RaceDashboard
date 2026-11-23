import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { io, Socket } from 'socket.io-client';
import './Dashboard.css';

interface TelemetryData {
  speedMph: number | null;
  soc: number | null;
  solarWatts: number | null;
  netWatts: number | null;
  fetTempC: number | null;
  mileageMi: number | null;
  packVoltage: number | null;
  packCurrent: number | null;
  motorRpm: number | null;
  motorCurrent: number | null;
  motorBusV: number | null;
  accelPos: number | null;
  regenPos: number | null;
}

interface CANMessage {
  id: string;
  payload: string;
  tag: string;
  receivedAt: number;
  signals: Record<string, SignalValue>;
}

type SignalValue = string | number | boolean | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numericSignal(signals: Record<string, SignalValue>, ...names: string[]): number | null {
  for (const name of names) {
    const value = signals[name];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function formatMetric(value: number | null, digits = 1): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
}

function formatSignalStatus(value: SignalValue | undefined): string {
  if (value === undefined || value === null) return 'No data';
  if (typeof value === 'boolean') return value ? 'ACTIVE' : 'INACTIVE';
  return typeof value === 'number' ? formatMetric(value) : value;
}

function formatAge(receivedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - receivedAt) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(receivedAt).toLocaleTimeString();
}

const Dashboard: React.FC = () => {
  // Navigation & Unit State
  const [activeScreen, setActiveScreen] = useState<number>(1);
  const [unitMode, setUnitMode] = useState<'imperial' | 'si'>('imperial');
  const [prechargeStage, setPrechargeStage] = useState<number | null>(null);

  // A dash represents a signal that has not been received; no demo values are generated.
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    speedMph: null,
    soc: null,
    solarWatts: null,
    netWatts: null,
    fetTempC: null,
    mileageMi: null,
    packVoltage: null,
    packCurrent: null,
    motorRpm: null,
    motorCurrent: null,
    motorBusV: null,
    accelPos: null,
    regenPos: null,
  });

  // Stopwatch State
  const [swTimeMs, setSwTimeMs] = useState<number>(0);
  const [swRunning, setSwRunning] = useState<boolean>(false);
  const [lapCount, setLapCount] = useState<number>(0);

  // Keep the most recent received frame for each CAN message.
  const [canLogs, setCanLogs] = useState<CANMessage[]>([]);
  const [isRunModalOpen, setIsRunModalOpen] = useState<boolean>(false);
  const [latestSignals, setLatestSignals] = useState<Record<string, SignalValue>>({});
  const latestSignalsRef = useRef<Record<string, SignalValue>>({});
  const [now, setNow] = useState(Date.now);

  const [graphData, setGraphData] = useState<{ time: string; speed: number | null; solar: number | null }[]>([]);

  // WebSocket Connection Setup
  useEffect(() => {
    const socket: Socket = io('http://localhost:5500');

    socket.on('telemetry_update', (data: Partial<TelemetryData>) => {
      setTelemetry((prev) => ({ ...prev, ...data }));
    });

    socket.on('can_frame', (payload: unknown) => {
      if (!isRecord(payload)) return;
      const id = typeof payload.id === 'string' || typeof payload.id === 'number' ? String(payload.id) : '';
      const tag = typeof payload.tag === 'string' ? payload.tag : '';
      if (!id || !tag) return;

      const signals: Record<string, SignalValue> = {};
      if (isRecord(payload.signals)) {
        Object.entries(payload.signals).forEach(([name, value]) => {
          if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            signals[name.toLowerCase()] = value;
          }
        });
      }

      const rawReceivedAt = payload.receivedAt;
      const receivedAt = typeof rawReceivedAt === 'number'
        ? (rawReceivedAt < 1e12 ? rawReceivedAt * 1000 : rawReceivedAt)
        : Date.now();
      const frame: CANMessage = {
        id,
        tag,
        payload: typeof payload.payload === 'string' ? payload.payload : '',
        receivedAt,
        signals,
      };

      setCanLogs((previous) => {
        const key = `${frame.id}-${frame.tag}`;
        const latestByMessage = previous.filter((item) => `${item.id}-${item.tag}` !== key);
        return [frame, ...latestByMessage].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 20);
      });

      const combinedSignals = { ...latestSignalsRef.current, ...signals };
      latestSignalsRef.current = combinedSignals;
      setLatestSignals(combinedSignals);

      const update: Partial<TelemetryData> = {};
      const northVelocity = numericSignal(combinedSignals, 'vel_n');
      const eastVelocity = numericSignal(combinedSignals, 'vel_e');
      const speed = numericSignal(combinedSignals, 'speed_mph', 'vehicle_speed_mph', 'speed')
        ?? (northVelocity !== null && eastVelocity !== null
          ? Math.hypot(northVelocity, eastVelocity) * 2.23694
          : null);
      const mppt0Power = numericSignal(combinedSignals, 'mg0inputpower');
      const mppt1Power = numericSignal(combinedSignals, 'mg1inputpower');
      const solarWatts = numericSignal(combinedSignals, 'solar_power_in', 'solar_watts')
        ?? (mppt0Power !== null || mppt1Power !== null
          ? ((mppt0Power ?? 0) + (mppt1Power ?? 0)) / 1000
          : null);

      if (speed !== null) update.speedMph = speed;
      const soc = numericSignal(combinedSignals, 'pack_soc');
      if (soc !== null) update.soc = soc;
      if (solarWatts !== null) update.solarWatts = solarWatts;
      const netWatts = numericSignal(combinedSignals, 'net_pack_power', 'net_power');
      if (netWatts !== null) update.netWatts = netWatts;
      const fetTemp = numericSignal(combinedSignals, 'fet_temp');
      if (fetTemp !== null) update.fetTempC = fetTemp;
      const mileage = numericSignal(combinedSignals, 'mileage_mi', 'mileage');
      if (mileage !== null) update.mileageMi = mileage;
      const packVoltage = numericSignal(combinedSignals, 'pack_voltage');
      if (packVoltage !== null) update.packVoltage = packVoltage;
      const packCurrent = numericSignal(combinedSignals, 'pack_current');
      if (packCurrent !== null) update.packCurrent = packCurrent;
      const motorRpm = numericSignal(combinedSignals, 'motor_rpm');
      if (motorRpm !== null) update.motorRpm = motorRpm;
      const motorCurrent = numericSignal(combinedSignals, 'motor_current');
      if (motorCurrent !== null) update.motorCurrent = motorCurrent;
      const motorVoltage = numericSignal(combinedSignals, 'battery_voltage');
      if (motorVoltage !== null) update.motorBusV = motorVoltage;
      const accelerator = numericSignal(combinedSignals, 'accelerator_vr_position', 'accel_position', 'throttle');
      if (accelerator !== null) update.accelPos = accelerator;
      const regen = numericSignal(combinedSignals, 'regen_vr_position', 'regen_position');
      if (regen !== null) update.regenPos = regen;
      setTelemetry((previous) => ({ ...previous, ...update }));

      const stage = numericSignal(combinedSignals, 'motor_stage', 'mppt_stage');
      if (stage !== null) setPrechargeStage(stage);

      if (speed !== null || solarWatts !== null) {
        const time = new Date(receivedAt).toLocaleTimeString();
        setGraphData((previous) => {
          const lastPoint = previous[previous.length - 1];
          return [...previous, {
            time,
            speed: speed ?? lastPoint?.speed ?? null,
            solar: solarWatts ?? lastPoint?.solar ?? null,
          }].slice(-60);
        });
      }
    });

    const ageTimer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      socket.disconnect();
      window.clearInterval(ageTimer);
    };
  }, []);

  // Stopwatch Effect
  useEffect(() => {
    if (!swRunning) return;
    const timer = window.setInterval(() => {
      setSwTimeMs((prev) => prev + 100);
    }, 100);
    return () => window.clearInterval(timer);
  }, [swRunning]);

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const secs = (totalSec % 60).toString().padStart(2, '0');
    const tenths = Math.floor((ms % 1000) / 100);
    return `${mins}:${secs}.${tenths}0`;
  };

  // Unit Calculations
  const isImp = unitMode === 'imperial';
  const displaySpeed = telemetry.speedMph === null
    ? null
    : isImp ? telemetry.speedMph : +(telemetry.speedMph * 1.60934).toFixed(1);
  const speedUnit = isImp ? 'mph' : 'km/h';
  const displayDistance = telemetry.mileageMi === null
    ? null
    : isImp ? telemetry.mileageMi : +(telemetry.mileageMi * 1.60934).toFixed(1);
  const distanceUnit = isImp ? 'mi' : 'km';
  const displayFetTemp = telemetry.fetTempC === null
    ? null
    : isImp ? +((telemetry.fetTempC * 9) / 5 + 32).toFixed(1) : telemetry.fetTempC;
  const tempUnit = isImp ? '°F' : '°C';
  const latestMessage = canLogs[0];

  return (
    <div className="bg-[var(--page)] text-slate-900 min-h-screen w-full flex flex-col font-sans">
      
      {/* HEADER */}
      <header className="bg-uva-blue border-b-4 border-uva-orange px-1.5 py-2.5 shrink-0 shadow-sm text-white overflow-x-auto">
        <div className="dashboard-header-row">
          <div className="dashboard-brand">
            <a href="https://solarcaratuva.com/" target="_blank" rel="noreferrer" aria-label="Solar Car at UVA website">
              <img src="/solar-car-logo.png" alt="Solar Car at UVA" className="solar-car-logo" />
            </a>
            <div className="flex shrink-0 flex-col leading-tight">
              <h1 className="dashboard-title whitespace-nowrap font-extrabold text-base tracking-wide text-white">
                RaceDashboard
              </h1>
              <p className="dashboard-byline whitespace-nowrap text-[10px] text-white/70">
                Brought to you by Nicholas "ECE" Jennings
              </p>
            </div>
          </div>

          <nav className="dashboard-screen-selector flex shrink-0 items-center rounded-xl border border-white/20 bg-white/10 p-1" aria-label="Dashboard screens">
            <button
              onClick={() => setActiveScreen(1)}
              aria-label="Main Screen"
              aria-pressed={activeScreen === 1}
              className={`dashboard-nav-button rounded-lg text-xs font-bold transition-all flex items-center ${
                activeScreen === 1 ? 'bg-uva-orange text-white shadow-lg shadow-uva-orange/20' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-desktop"></i>
              <span className="dashboard-nav-label-full">Main Screen</span>
              <span className="dashboard-nav-label-compact">Main</span>
            </button>
            <button
              onClick={() => setActiveScreen(2)}
              aria-label="Diagnostics Screen"
              aria-pressed={activeScreen === 2}
              className={`dashboard-nav-button rounded-lg text-xs font-bold transition-all flex items-center ${
                activeScreen === 2 ? 'bg-uva-orange text-white shadow-lg shadow-uva-orange/20' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-stethoscope"></i>
              <span className="dashboard-nav-label-full">Diagnostics Screen</span>
              <span className="dashboard-nav-label-compact">Diag</span>
            </button>
            <button
              onClick={() => setActiveScreen(3)}
              aria-label="Lap Analysis Screen"
              aria-pressed={activeScreen === 3}
              className={`dashboard-nav-button rounded-lg text-xs font-bold transition-all flex items-center ${
                activeScreen === 3 ? 'bg-uva-orange text-white shadow-lg shadow-uva-orange/20' : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-stopwatch-20"></i>
              <span className="dashboard-nav-label-full">Lap Analysis Screen</span>
              <span className="dashboard-nav-label-compact">Laps</span>
            </button>
          </nav>

          <div className="dashboard-unit-track">
            <button
              onClick={() => setUnitMode(unitMode === 'imperial' ? 'si' : 'imperial')}
              aria-label={`Toggle units; current ${unitMode}`}
              className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-2 py-2 text-xs font-semibold text-white transition hover:bg-white/20 flex items-center gap-2"
            >
              <i className="fa-solid fa-sliders text-uva-orange"></i>
              <span className="dashboard-unit-full">Units: {unitMode.toUpperCase()}</span>
              <span className="dashboard-unit-compact">{unitMode === 'imperial' ? 'IMP' : 'SI'}</span>
            </button>
          </div>

          <div
            aria-label="Last sent message"
            title={latestMessage ? `${latestMessage.tag} (${latestMessage.id})` : 'Waiting for CAN data'}
            className="dashboard-last-message flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-[10px]"
          >
            <i className="fa-solid fa-tower-broadcast text-uva-orange"></i>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[9px] font-bold uppercase tracking-wider text-white/70">Last sent message</div>
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate font-bold text-white">{latestMessage?.tag ?? 'Waiting'}</span>
                <span className="relative top-px shrink-0 font-mono text-uva-orange">
                  {latestMessage ? formatAge(latestMessage.receivedAt, now) : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 p-6 w-full flex flex-col min-h-0 overflow-y-auto">
        
        {/* ================= SCREEN 1: MAIN SCREEN ================= */}
        {activeScreen === 1 && (
          <div className="flex-1 flex flex-col gap-5 min-h-0">
            
            {/* Key Telemetry Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-white/70 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Vehicle Speed</span>
                  <i className="fa-solid fa-gauge-high text-uva-orange text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{formatMetric(displaySpeed)}</span>
                  <span className="text-base text-white/70 font-bold">{speedUnit}</span>
                </div>
                <div className="text-xs text-white/70 flex justify-between">
                  <span>Target: —</span>
                  <span className="text-uva-orange font-bold font-mono">No target data</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-uva-orange"></div>
              </div>

              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-white/70 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Pack SoC</span>
                  <i className="fa-solid fa-battery-three-quarters text-uva-orange text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{formatMetric(telemetry.soc, 2)}</span>
                  <span className="text-base text-white/70 font-bold">%</span>
                </div>
                <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                  <div className="bg-uva-orange h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, telemetry.soc ?? 0))}%` }}></div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-uva-orange"></div>
              </div>

              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-white/70 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Race Mileage</span>
                  <i className="fa-solid fa-route text-uva-orange text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{formatMetric(displayDistance)}</span>
                  <span className="text-base text-white/70 font-bold">{distanceUnit}</span>
                </div>
                <div className="text-xs text-white/70">Est Range: <span className="text-uva-orange font-bold">—</span></div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-uva-orange"></div>
              </div>

              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-white/70 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Net Pack Power</span>
                  <i className="fa-solid fa-bolt text-uva-orange text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{formatMetric(telemetry.netWatts)}</span>
                  <span className="text-base text-white/70 font-bold">W</span>
                </div>
                <div className="text-xs text-white/70">Solar In: <span className="text-uva-orange font-bold">{formatMetric(telemetry.solarWatts)} {telemetry.solarWatts === null ? '' : 'W'}</span></div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-uva-orange"></div>
              </div>
            </div>

            {/* Figures Grid: map placeholder + real-time graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
              
              <div className="lg:col-span-7 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex flex-col min-h-[350px]">
                <div className="flex flex-wrap justify-between items-center pb-3 mb-3 border-b border-[var(--line)] gap-2 shrink-0">
                  <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
                   <i className="fa-solid fa-map-location-dot text-uva-orange"></i> Race Mapping
                  </h3>
                </div>
                {/* TODO: Decode coordinate data from VN200 CAN messages and provide the live coordinates to this map. */}
                {/* TODO: Render the car's current position on the track from those coordinates. */}
                {/* TODO: Add a heatmap layer when solar telemetry supports it. */}
                <div className="aspect-square w-full max-w-[420px] max-h-[420px] self-center rounded-lg border border-[var(--line)] bg-white"></div>
              </div>

              {/* Real-time Recharts Graph */}
              <div className="lg:col-span-5 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex flex-col min-h-[350px]">
                <div className="flex justify-between items-center pb-3 mb-3 border-b border-[var(--line)] shrink-0">
                  <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-chart-line text-uva-blue"></i> Race Graphs
                  </h3>
                </div>
                {graphData.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                    Waiting for speed or solar telemetry…
                  </div>
                ) : <div className="flex-1 w-full min-h-0 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="time" stroke="var(--muted)" tick={{ fontSize: 12 }} />
                      <YAxis stroke="var(--muted)" tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--line)', color: 'var(--uva-blue)' }} />
                      <Line type="monotone" dataKey="speed" stroke="var(--uva-blue)" strokeWidth={3} dot={{ r: 4 }} connectNulls={false} />
                      <Line type="monotone" dataKey="solar" stroke="var(--uva-orange)" strokeWidth={2} strokeDasharray="3 3" dot={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>}
              </div>
            </div>

            {/* Precharge Sequencer Footer Section */}
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 shrink-0">
              <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[var(--line)] mb-3 gap-2">
                <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <i className="fa-solid fa-power-off text-uva-orange"></i> Precharge & Startup System Sequencer
                </h3>
                <span className="font-mono text-xs font-bold text-slate-500">
                  {prechargeStage === null ? 'Awaiting CAN data' : `Stage ${prechargeStage}/4`}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3 bg-[var(--page)] rounded-lg border border-[var(--line)]">
                  <div className="text-xs font-bold text-slate-500 uppercase mb-2 flex justify-between">
                    <span>Precharge Sequence</span>
                    <span className="text-uva-blue font-mono">{prechargeStage === null ? '—' : `Stage ${prechargeStage}/4`}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-xs font-mono font-bold text-center">
                    <div className={`p-2 rounded ${prechargeStage !== null && prechargeStage >= 1 ? 'bg-uva-blue/10 text-uva-blue border border-uva-blue/30' : 'bg-white text-slate-500'}`}>1: OFF</div>
                    <div className={`p-2 rounded ${prechargeStage !== null && prechargeStage >= 2 ? 'bg-uva-blue/10 text-uva-blue border border-uva-blue/30' : 'bg-white text-slate-500'}`}>2: RES</div>
                    <div className={`p-2 rounded ${prechargeStage !== null && prechargeStage >= 3 ? 'bg-uva-blue/10 text-uva-blue border border-uva-blue/30' : 'bg-white text-slate-500'}`}>3: MAIN</div>
                    <div className={`p-2 rounded ${prechargeStage === 4 ? 'bg-uva-orange text-white font-extrabold shadow' : 'bg-white text-slate-500'}`}>4: READY</div>
                  </div>
                </div>

                <div className="p-3 bg-[var(--page)] rounded-lg border border-[var(--line)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase">Main Contactor Relay</div>
                    <div className="text-base font-extrabold font-mono text-uva-blue">{formatSignalStatus(latestSignals.cont12)}</div>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${latestSignals.cont12 == null ? 'bg-slate-300' : 'bg-uva-orange'}`}></div>
                </div>

                <div className="p-3 bg-[var(--page)] rounded-lg border border-[var(--line)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase">Discharge Safety Relay</div>
                    <div className="text-base font-extrabold text-uva-blue font-mono">{formatSignalStatus(latestSignals.discharge_relay_status)}</div>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${latestSignals.discharge_relay_status == null ? 'bg-slate-300' : 'bg-uva-orange'}`}></div>
                </div>

                <div className="p-3 bg-[var(--page)] rounded-lg border border-[var(--line)] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase">Aux Charge Relay</div>
                    <div className="text-base font-extrabold text-uva-blue font-mono">{formatSignalStatus(latestSignals.charge_relay_status)}</div>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${latestSignals.charge_relay_status == null ? 'bg-slate-300' : 'bg-uva-orange'}`}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 2: DIAGNOSTICS SCREEN ================= */}
        {activeScreen === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 flex-1 min-h-0">
            {/* Motor Metrics */}
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[var(--line)] mb-4">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-microchip text-uva-orange"></i> MOTOR METRICS
                </h3>
                <span className="px-2.5 py-1 rounded text-xs font-bold bg-uva-blue/10 text-uva-blue border border-uva-blue/20">
                  {telemetry.motorRpm === null ? 'NO DATA' : 'RECEIVED'}
                </span>
              </div>
              <div className="space-y-3 text-sm font-mono flex-1">
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Motor RPM</span><span className="font-semibold text-uva-blue">{formatMetric(telemetry.motorRpm, 0)} rpm</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Motor Current</span><span className="font-semibold text-uva-blue">{formatMetric(telemetry.motorCurrent)} A</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Bus Voltage</span><span className="font-semibold text-uva-blue">{formatMetric(telemetry.motorBusV)} V</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">FET Temp</span><span className="font-semibold text-uva-orange">{formatMetric(displayFetTemp)} {displayFetTemp === null ? '' : tempUnit}</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Accel Pos</span><span className="font-semibold text-uva-blue">{formatMetric(telemetry.accelPos)}%</span></div>
              </div>
            </div>

            {/* Battery Metrics */}
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[var(--line)] mb-4">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-car-battery text-uva-orange"></i> BATTERY METRICS
                </h3>
                <span className="px-2.5 py-1 rounded text-xs font-bold bg-uva-blue/10 text-uva-blue border border-uva-blue/20">
                  {telemetry.packVoltage === null ? 'NO DATA' : 'RECEIVED'}
                </span>
              </div>
              <div className="space-y-3 text-sm font-mono flex-1">
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Pack Voltage</span><span className="font-semibold text-uva-blue">{formatMetric(telemetry.packVoltage)} V</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Pack Current</span><span className="font-semibold text-uva-blue">{formatMetric(telemetry.packCurrent)} A</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Max Cell V</span><span className="font-semibold text-uva-blue">{formatMetric(numericSignal(latestSignals, 'highest_cell_voltage'), 4)} V</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Min Cell V</span><span className="font-semibold text-uva-blue">{formatMetric(numericSignal(latestSignals, 'lowest_cell_voltage'), 4)} V</span></div>
              </div>
            </div>

            {/* Solar Metrics */}
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[var(--line)] mb-4">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-sun text-uva-orange"></i> SOLAR METRICS
                </h3>
                <span className={`px-2.5 py-1 rounded text-xs font-bold border ${
                  telemetry.solarWatts === null
                    ? 'bg-uva-blue/10 text-uva-blue border-uva-blue/20'
                    : 'bg-uva-orange/10 text-uva-orange border-uva-orange/20'
                }`}>
                  {telemetry.solarWatts === null ? 'NO DATA' : 'RECEIVED'}
                </span>
              </div>
              <div className="space-y-3 text-sm font-mono flex-1">
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Solar Power In</span><span className="font-semibold text-uva-orange">{formatMetric(telemetry.solarWatts)} W</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">Irradiance</span><span className="font-semibold text-uva-blue">— W/m²</span></div>
                <div className="flex justify-between py-1.5 border-b border-[var(--line)]"><span className="text-slate-500">MPPT 1 Power</span><span className="font-semibold text-uva-blue">{formatMetric(numericSignal(latestSignals, 'mg1inputpower'), 0)} mW</span></div>
              </div>
            </div>

            {/* CAN Stream Logger */}
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[var(--line)] mb-4">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-terminal text-uva-orange"></i> CAN LOGGER STREAM
                </h3>
              </div>
              <div className="bg-[var(--page)] p-3 rounded text-xs font-mono space-y-1.5 flex-1 overflow-y-auto">
                {canLogs.length === 0 ? (
                  <p className="text-slate-500">No CAN messages received yet.</p>
                ) : canLogs.map((log) => (
                  <div key={`${log.id}-${log.tag}`} className="flex items-center justify-between gap-2 py-1 border-b border-[var(--line)]">
                    <span className="text-slate-500">{formatAge(log.receivedAt, now)}</span>
                    <span className="text-uva-orange font-bold">{log.id}</span>
                    <span className="text-slate-600">[{log.tag}]</span>
                    <span className="text-slate-700">{log.payload}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 3: LAP ANALYSIS SCREEN ================= */}
        {activeScreen === 3 && (
          <div className="flex flex-col gap-5 flex-1 min-h-0">
            <section className="bg-uva-navy border-b-2 border-uva-orange rounded-xl px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-3 text-xs text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 font-bold text-white">
                  <i className="fa-solid fa-stopwatch text-uva-orange text-sm"></i>
                  <span className="uppercase tracking-wide text-[10px]">RACE TIMER & LIVE LAP TELEMETRY</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!swRunning ? (
                    <button onClick={() => setSwRunning(true)} className="px-3 py-1 bg-uva-orange hover:bg-orange-600 text-white font-semibold rounded text-[10px] flex items-center gap-1 transition">
                      <i className="fa-solid fa-play"></i> Start
                    </button>
                  ) : (
                    <button onClick={() => setSwRunning(false)} className="px-3 py-1 bg-white hover:bg-slate-100 text-uva-blue font-semibold rounded text-[10px] flex items-center gap-1 transition">
                      <i className="fa-solid fa-pause"></i> Pause
                    </button>
                  )}
                  <button onClick={() => setLapCount((prev) => prev + 1)} className="px-3 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded text-[10px] flex items-center gap-1 transition">
                    <i className="fa-solid fa-flag-checkered"></i> Log Lap
                  </button>
                  <button onClick={() => { setSwRunning(false); setSwTimeMs(0); }} className="px-2 py-1 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded text-[10px]">
                    <i className="fa-solid fa-rotate-left"></i>
                  </button>
                </div>

                <div className="font-mono text-base font-extrabold text-uva-blue bg-white px-3 py-0.5 rounded border-2 border-uva-orange">
                  {formatTime(swTimeMs)}
                </div>
              </div>

              <div className="flex items-center gap-6 text-white/70 font-mono text-[11px]">
                <div>Current Lap: <span className="text-uva-orange font-bold">{lapCount > 0 ? lapCount : '—'}</span></div>
                <div>Total Mileage: <span className="text-white font-bold">{formatMetric(displayDistance)} {displayDistance === null ? '' : distanceUnit}</span></div>
                <div>Target Delta: <span className="text-uva-orange font-bold">—</span></div>
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 shrink-0">
              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl">
                <div className="text-xs font-bold text-white/70 uppercase mb-1">Laps Completed</div>
                <div className="text-3xl font-extrabold font-mono text-uva-orange">{lapCount > 0 ? lapCount : '—'}</div>
              </div>
              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl">
                <div className="text-xs font-bold text-white/70 uppercase mb-1">Fastest Lap Benchmark</div>
                <div className="text-3xl font-extrabold font-mono text-uva-orange">—</div>
              </div>
              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl">
                <div className="text-xs font-bold text-white/70 uppercase mb-1">Pace Undertimer Delta</div>
                <div className="text-3xl font-extrabold font-mono text-uva-orange">—</div>
              </div>
              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl">
                <div className="text-xs font-bold text-white/70 uppercase mb-1">Lap Power Lost</div>
                <div className="text-3xl font-extrabold font-mono text-uva-orange">—</div>
              </div>
              <div className="bg-uva-navy border border-uva-blue/30 p-5 rounded-xl">
                <div className="text-xs font-bold text-white/70 uppercase mb-1">Distance Per Lap Avg</div>
                <div className="text-3xl font-extrabold font-mono text-uva-orange">—</div>
              </div>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl p-5 flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center pb-3 border-b border-[var(--line)] mb-4 shrink-0">
                <h3 className="font-bold text-sm text-slate-800 uppercase">Individual Lap Breakdown</h3>
                <button onClick={() => setIsRunModalOpen(true)} className="px-4 py-2 bg-uva-orange text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition">
                  <i className="fa-solid fa-code-compare mr-2"></i> Compare Run Statistics
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left font-mono text-sm">
                  <thead>
                    <tr className="bg-[var(--surface-alt)] text-slate-500 border-b border-[var(--line)]">
                      <th className="p-3">Lap #</th>
                      <th className="p-3">Lap Time</th>
                      <th className="p-3">Pace Delta</th>
                      <th className="p-3">Distance</th>
                      <th className="p-3">Power Lost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    <tr><td className="p-3 text-slate-500" colSpan={5}>No lap data received yet.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* RUN STATS COMPARISON MODAL */}
      {isRunModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-xl max-w-xl w-full p-6 space-y-4 text-slate-800">
            <div className="flex justify-between items-center border-b border-[var(--line)] pb-3">
              <h3 className="font-bold text-base text-uva-blue">RUN STATISTICS COMPARISON</h3>
              <button onClick={() => setIsRunModalOpen(false)} className="text-slate-500 hover:text-uva-blue"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-[var(--page)] p-3 rounded border border-[var(--line)]">
                <div className="font-bold text-uva-orange mb-2">Current Run</div>
                  <div>Avg Speed: —</div><div>Power Lost: —</div>
              </div>
              <div className="bg-[var(--page)] p-3 rounded border border-[var(--line)]">
                <div className="font-bold text-slate-400 mb-2">Previous Run</div>
                <div>Avg Speed: —</div><div>Power Lost: —</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
