import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { io, Socket } from 'socket.io-client';

// Declare Leaflet global type
declare const L: any;

interface TelemetryData {
  speedMph: number;
  soc: number;
  solarWatts: number;
  netWatts: number;
  fetTempC: number;
  mileageMi: number;
  packVoltage: number;
  packCurrent: number;
  motorRpm: number;
  motorCurrent: number;
  motorBusV: number;
  accelPos: number;
  regenPos: number;
}

interface CANMessage {
  id: string;
  payload: string;
  tag: string;
  timestamp: string;
}

const raceTrackCoords: [number, number][] = [
  [38.0350, -78.5100],
  [38.0370, -78.5080],
  [38.0360, -78.5020],
  [38.0320, -78.5010],
  [38.0300, -78.5060],
  [38.0320, -78.5110],
  [38.0350, -78.5100]
];

const Dashboard: React.FC = () => {
  // Navigation & Unit State
  const [activeScreen, setActiveScreen] = useState<number>(1);
  const [unitMode, setUnitMode] = useState<'imperial' | 'si'>('imperial');
  const [prechargeStage, setPrechargeStage] = useState<number>(4);
  const [mapMode, setMapMode] = useState<'street' | 'heat'>('street');

  // Telemetry State
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    speedMph: 34.4,
    soc: 56.53,
    solarWatts: 845.2,
    netWatts: -13.1,
    fetTempC: 42.3,
    mileageMi: 18.4,
    packVoltage: 134.2,
    packCurrent: -12.3,
    motorRpm: 1450,
    motorCurrent: 32.0,
    motorBusV: 133.8,
    accelPos: 23.0,
    regenPos: 0.0
  });

  // Stopwatch State
  const [swTimeMs, setSwTimeMs] = useState<number>(0);
  const [swRunning, setSwRunning] = useState<boolean>(false);
  const [lapCount, setLapCount] = useState<number>(4);

  // CAN Logs State
  const [canLogs, setCanLogs] = useState<CANMessage[]>([]);
  const [isRunModalOpen, setIsRunModalOpen] = useState<boolean>(false);

  // Time Series Graph Data State
  const [graphData, setGraphData] = useState<{ time: string; speed: number; solar: number }[]>([
    { time: '0m', speed: 30, solar: 800 },
    { time: '5m', speed: 32, solar: 820 },
    { time: '10m', speed: 35, solar: 850 },
    { time: '15m', speed: 34.4, solar: 845 },
    { time: '20m', speed: 36, solar: 860 },
    { time: '25m', speed: 33, solar: 830 },
    { time: '30m', speed: 34.4, solar: 845 },
  ]);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const carMarkerRef = useRef<any>(null);
  const streetPolylineRef = useRef<any>(null);
  const heatPolylineRef = useRef<any>(null);

  // WebSocket Connection Setup
  useEffect(() => {
    const socket: Socket = io('http://localhost:5000', { autoConnect: false });
    
    socket.on('telemetry_update', (data: Partial<TelemetryData>) => {
      setTelemetry((prev) => ({ ...prev, ...data }));
    });

    socket.on('can_frame', (frame: CANMessage) => {
      setCanLogs((prev) => [frame, ...prev.slice(0, 14)]);
    });

    // Fallback simulation timer for standalone preview
    const simInterval = setInterval(() => {
      setTelemetry((prev) => ({
        ...prev,
        speedMph: +(34.0 + Math.sin(Date.now() / 1500) * 1.8).toFixed(1),
        solarWatts: +(840 + Math.cos(Date.now() / 2000) * 25).toFixed(1),
        netWatts: +(-12.5 - Math.random() * 1.5).toFixed(1),
      }));

      // Simulate CAN messages
      const sampleFrames = [
        { id: '0x100', payload: '38 05 E2 00 00 12 F8 A0', tag: 'BPS' },
        { id: '0x201', payload: '05 AC 00 20 04 1B 00 00', tag: 'MC' },
        { id: '0x30B', payload: '03 4D 00 FE', tag: 'MPPT' }
      ];
      const randomMsg = sampleFrames[Math.floor(Math.random() * sampleFrames.length)];
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
      
      setCanLogs((prev) => [{ ...randomMsg, timestamp: timeStr }, ...prev.slice(0, 14)]);
    }, 1500);

    return () => {
      socket.disconnect();
      clearInterval(simInterval);
    };
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (mapContainerRef.current && !mapInstanceRef.current && typeof L !== 'undefined') {
      const darkTiles = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

      const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([38.0336, -78.5080], 14);
      L.tileLayer(darkTiles, { maxZoom: 19 }).addTo(map);

      const streetLine = L.polyline(raceTrackCoords, { color: '#F15A24', weight: 6, opacity: 0.95 }).addTo(map);
      const heatLine = L.polyline(raceTrackCoords, { color: '#10B981', weight: 10, opacity: 0.8 });

      const carMarker = L.circleMarker([38.0350, -78.5100], {
        radius: 9,
        fillColor: '#00F0FF',
        color: '#FFFFFF',
        weight: 2.5,
        fillOpacity: 1
      }).addTo(map);

      mapInstanceRef.current = map;
      carMarkerRef.current = carMarker;
      streetPolylineRef.current = streetLine;
      heatPolylineRef.current = heatLine;

      map.fitBounds(streetLine.getBounds());
    }
  }, []);

  // Update Map Position with Telemetry
  useEffect(() => {
    if (carMarkerRef.current) {
      const pointIndex = Math.floor(Date.now() / 2000) % raceTrackCoords.length;
      carMarkerRef.current.setLatLng(raceTrackCoords[pointIndex]);
    }
  }, [telemetry.speedMph]);

  // Handle Map Mode Toggle
  const toggleMapMode = (mode: 'street' | 'heat') => {
    setMapMode(mode);
    const map = mapInstanceRef.current;
    if (!map) return;

    if (mode === 'street') {
      if (heatPolylineRef.current) map.removeLayer(heatPolylineRef.current);
      if (streetPolylineRef.current) streetPolylineRef.current.addTo(map);
      carMarkerRef.current?.setStyle({ fillColor: '#00F0FF' });
    } else {
      if (streetPolylineRef.current) map.removeLayer(streetPolylineRef.current);
      if (heatPolylineRef.current) heatPolylineRef.current.addTo(map);
      carMarkerRef.current?.setStyle({ fillColor: '#F15A24' });
    }
  };

  // Stopwatch Effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (swRunning) {
      timer = setInterval(() => {
        setSwTimeMs((prev) => prev + 100);
      }, 100);
    }
    return () => clearInterval(timer);
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
  const displaySpeed = isImp ? telemetry.speedMph : +(telemetry.speedMph * 1.60934).toFixed(1);
  const speedUnit = isImp ? 'mph' : 'km/h';
  const displayDistance = isImp ? telemetry.mileageMi : +(telemetry.mileageMi * 1.60934).toFixed(1);
  const distanceUnit = isImp ? 'mi' : 'km';
  const displayFetTemp = isImp ? telemetry.fetTempC : +((telemetry.fetTempC * 9) / 5 + 32).toFixed(1);
  const tempUnit = isImp ? '°C' : '°F';

  return (
    <div className="bg-[#0A0D14] text-slate-100 h-screen w-screen flex flex-col font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-[#121824] border-b border-[#1E293B] px-6 py-3 shrink-0 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#F15A24] to-amber-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-[#F15A24]/20">
            UVA
          </div>
          <div>
            <h1 className="font-extrabold text-base leading-tight tracking-wide flex items-center gap-2 text-white">
              UVA SOLAR CAR TELEMETRY
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> LIVE
              </span>
            </h1>
            <p className="text-[10px] text-slate-400">Operations Command • Dark Telemetry System</p>
          </div>
        </div>

        {/* 3 SCREEN FRONTEND NAVIGATION SELECTOR */}
        <div className="flex items-center bg-[#0A0D14] p-1 rounded-xl border border-[#1E293B]">
          <button
            onClick={() => setActiveScreen(1)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeScreen === 1 ? 'bg-[#F15A24] text-white shadow-lg shadow-[#F15A24]/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-desktop"></i> Main Screen
          </button>
          <button
            onClick={() => setActiveScreen(2)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeScreen === 2 ? 'bg-[#F15A24] text-white shadow-lg shadow-[#F15A24]/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-stethoscope"></i> Diagnostics Screen
          </button>
          <button
            onClick={() => setActiveScreen(3)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeScreen === 3 ? 'bg-[#F15A24] text-white shadow-lg shadow-[#F15A24]/20' : 'text-slate-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-stopwatch-20"></i> Lap Analysis Screen
          </button>
        </div>

        {/* GLOBAL HEADER CONTROLS */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUnitMode(unitMode === 'imperial' ? 'si' : 'imperial')}
            className="px-3 py-1.5 rounded-lg bg-[#0A0D14] hover:bg-slate-800 border border-[#1E293B] text-xs font-semibold text-slate-200 flex items-center gap-2 transition"
          >
            <i className="fa-solid fa-sliders text-[#F15A24]"></i> Units: <span className="text-[#F15A24] font-mono">{unitMode.toUpperCase()}</span>
          </button>

          <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#1E293B] text-xs">
            <span className="text-slate-400 text-[10px]">Precharge:</span>
            <span className="font-bold text-emerald-400 flex items-center gap-1.5 font-mono text-[10px]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> STAGE {prechargeStage} (READY)
            </span>
          </div>
        </div>
      </header>

      {/* TOP STOPWATCH BANNER */}
      <div className="bg-[#161E2E] border-b border-[#1E293B] px-6 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <i className="fa-solid fa-stopwatch text-[#F15A24] text-sm"></i>
            <span className="uppercase tracking-wide text-[10px]">RACE TIMER & LIVE LAP TELEMETRY</span>
          </div>
          <div className="flex items-center gap-1.5">
            {!swRunning ? (
              <button onClick={() => setSwRunning(true)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[10px] flex items-center gap-1 transition">
                <i className="fa-solid fa-play"></i> Start
              </button>
            ) : (
              <button onClick={() => setSwRunning(false)} className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded text-[10px] flex items-center gap-1 transition">
                <i className="fa-solid fa-pause"></i> Pause
              </button>
            )}
            <button onClick={() => setLapCount((prev) => prev + 1)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded text-[10px] flex items-center gap-1 transition">
              <i className="fa-solid fa-flag-checkered"></i> Log Lap
            </button>
            <button onClick={() => { setSwRunning(false); setSwTimeMs(0); }} className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded text-[10px]">
              <i className="fa-solid fa-rotate-left"></i>
            </button>
          </div>

          <div className="font-mono text-base font-extrabold text-[#00F0FF] bg-[#0A0D14] px-3 py-0.5 rounded border border-cyan-500/30">
            {formatTime(swTimeMs)}
          </div>
        </div>

        <div className="flex items-center gap-6 text-slate-300 font-mono text-[11px]">
          <div>Current Lap: <span className="text-white font-bold">{lapCount}</span></div>
          <div>Total Mileage: <span className="text-emerald-400 font-bold">{displayDistance} {distanceUnit}</span></div>
          <div>Target Delta: <span className="text-emerald-400 font-bold">-0.42s (Undertime)</span></div>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 p-6 w-full flex flex-col min-h-0 overflow-y-auto">
        
        {/* ================= SCREEN 1: MAIN SCREEN ================= */}
        {activeScreen === 1 && (
          <div className="flex-1 flex flex-col gap-5 min-h-0">
            
            {/* 5 Key Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 shrink-0">
              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Vehicle Speed</span>
                  <i className="fa-solid fa-gauge-high text-[#00F0FF] text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{displaySpeed}</span>
                  <span className="text-base text-slate-400 font-bold">{speedUnit}</span>
                </div>
                <div className="text-xs text-slate-400 flex justify-between">
                  <span>Target: 35.0</span>
                  <span className="text-emerald-400 font-bold font-mono">-0.6 Target Delta</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#00F0FF]"></div>
              </div>

              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Pack SoC</span>
                  <i className="fa-solid fa-battery-three-quarters text-emerald-400 text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{telemetry.soc}</span>
                  <span className="text-base text-slate-400 font-bold">%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${telemetry.soc}%` }}></div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-400"></div>
              </div>

              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Lap Counter</span>
                  <i className="fa-solid fa-flag-checkered text-[#F15A24] text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{lapCount}</span>
                  <span className="text-base text-slate-400 font-bold">Laps</span>
                </div>
                <div className="text-xs text-slate-400">Completed: <span className="text-slate-200 font-bold">{lapCount - 1} Laps</span></div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#F15A24]"></div>
              </div>

              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Race Mileage</span>
                  <i className="fa-solid fa-route text-amber-400 text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{displayDistance}</span>
                  <span className="text-base text-slate-400 font-bold">{distanceUnit}</span>
                </div>
                <div className="text-xs text-slate-400">Est Range: <span className="text-emerald-400 font-bold">142 mi</span></div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-amber-400"></div>
              </div>

              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start text-slate-400 text-xs font-bold tracking-wider uppercase mb-1">
                  <span>Net Pack Power</span>
                  <i className="fa-solid fa-bolt text-purple-400 text-lg"></i>
                </div>
                <div className="flex items-baseline gap-2 my-2">
                  <span className="text-4xl md:text-5xl font-extrabold font-mono text-white">{telemetry.netWatts}</span>
                  <span className="text-base text-slate-400 font-bold">W</span>
                </div>
                <div className="text-xs text-slate-400">Solar In: <span className="text-amber-400 font-bold">{telemetry.solarWatts} W</span></div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-purple-500"></div>
              </div>
            </div>

            {/* Figures Grid: Interactive Map + Real-time Graphs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
              
              {/* Dynamic Map Viewport */}
              <div className="lg:col-span-7 bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex flex-col min-h-[350px]">
                <div className="flex flex-wrap justify-between items-center pb-3 mb-3 border-b border-[#1E293B] gap-2 shrink-0">
                  <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-map-location-dot text-[#F15A24]"></i> Live Circuit Tactical View
                    <span className="text-xs font-mono bg-[#F15A24]/20 text-[#F15A24] px-2.5 py-1 rounded border border-[#F15A24]/30">
                      {mapMode === 'street' ? 'MARIO KART STREET TRACK' : 'SOLAR THERMAL HEATMAP'}
                    </span>
                  </h3>
                  <div className="flex items-center bg-[#0A0D14] p-1 rounded-lg border border-[#1E293B] text-xs font-bold">
                    <button
                      onClick={() => toggleMapMode('street')}
                      className={`px-3 py-1.5 rounded ${mapMode === 'street' ? 'bg-[#F15A24] text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      <i className="fa-solid fa-road"></i> Street Map
                    </button>
                    <button
                      onClick={() => toggleMapMode('heat')}
                      className={`px-3 py-1.5 rounded ${mapMode === 'heat' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      <i className="fa-solid fa-fire"></i> Solar Heatmap
                    </button>
                  </div>
                </div>

                <div className={`flex-1 rounded-lg overflow-hidden border border-[#1E293B] relative ${mapMode === 'heat' ? 'heatmap-overlay-active' : ''}`}>
                  <div ref={mapContainerRef} className="w-full h-full"></div>
                </div>
              </div>

              {/* Real-time Recharts Graph */}
              <div className="lg:col-span-5 bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex flex-col min-h-[350px]">
                <div className="flex justify-between items-center pb-3 mb-3 border-b border-[#1E293B] shrink-0">
                  <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-chart-line text-[#00F0FF]"></i> Real-time Telemetry Dynamics
                  </h3>
                </div>
                <div className="flex-1 w-full min-h-0 pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={graphData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="time" stroke="#94A3B8" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#94A3B8" tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0A0D14', borderColor: '#1E293B' }} />
                      <Line type="monotone" dataKey="speed" stroke="#00F0FF" strokeWidth={3} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="solar" stroke="#F59E0B" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Precharge Sequencer Footer Section */}
            <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 shrink-0">
              <div className="flex flex-wrap justify-between items-center pb-3 border-b border-[#1E293B] mb-3 gap-2">
                <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <i className="fa-solid fa-power-off text-emerald-400"></i> Precharge & Startup System Sequencer
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPrechargeStage((prev) => Math.max(1, prev - 1))} className="px-3 py-1 rounded bg-[#0A0D14] border border-[#1E293B] text-xs font-bold text-slate-300">
                    <i className="fa-solid fa-minus"></i> Prev Stage
                  </button>
                  <button onClick={() => setPrechargeStage((prev) => Math.min(4, prev + 1))} className="px-3 py-1 rounded bg-[#0A0D14] border border-[#1E293B] text-xs font-bold text-emerald-400">
                    <i className="fa-solid fa-plus"></i> Advance Stage
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3 bg-[#0A0D14] rounded-lg border border-[#1E293B]">
                  <div className="text-xs font-bold text-slate-400 uppercase mb-2 flex justify-between">
                    <span>Precharge Sequence</span>
                    <span className="text-emerald-400 font-mono">Stage {prechargeStage}/4</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text.xs font-mono font-bold text-center">
                    <div className={`p-2 rounded ${prechargeStage >= 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`}>1: OFF</div>
                    <div className={`p-2 rounded ${prechargeStage >= 2 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`}>2: RES</div>
                    <div className={`p-2 rounded ${prechargeStage >= 3 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}`}>3: MAIN</div>
                    <div className={`p-2 rounded ${prechargeStage === 4 ? 'bg-emerald-500 text-black font-extrabold shadow animate-pulse' : 'bg-slate-800 text-slate-500'}`}>4: READY</div>
                  </div>
                </div>

                <div className="p-3 bg-[#0A0D14] rounded-lg border border-[#1E293B] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase">Main Contactor Relay</div>
                    <div className={`text-base font-extrabold font-mono ${prechargeStage >= 3 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {prechargeStage >= 3 ? 'CLOSED (READY)' : 'OPEN (DISCONNECTED)'}
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full ${prechargeStage >= 3 ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-rose-500'}`}></div>
                </div>

                <div className="p-3 bg-[#0A0D14] rounded-lg border border-[#1E293B] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase">Discharge Safety Relay</div>
                    <div className="text-base font-extrabold text-emerald-400 font-mono">ACTIVE (TRUE)</div>
                  </div>
                  <div className="w-4 h-4 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50"></div>
                </div>

                <div className="p-3 bg-[#0A0D14] rounded-lg border border-[#1E293B] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase">Aux Charge Relay</div>
                    <div className="text-base font-extrabold text-slate-400 font-mono">OPEN (PASSIVE)</div>
                  </div>
                  <div className="w-4 h-4 rounded-full bg-slate-600"></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 2: DIAGNOSTICS SCREEN ================= */}
        {activeScreen === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 flex-1 min-h-0">
            {/* Motor Metrics */}
            <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[#1E293B] mb-4">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <i className="fa-solid fa-microchip text-[#F15A24]"></i> MOTOR METRICS
                </h3>
                <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">HEALTHY</span>
              </div>
              <div className="space-y-3 text-sm font-mono flex-1">
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Motor RPM</span><span className="font-semibold text-white">{telemetry.motorRpm} rpm</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Motor Current</span><span className="font-semibold text-white">{telemetry.motorCurrent} A</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Bus Voltage</span><span className="font-semibold text-white">{telemetry.motorBusV} V</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">FET Temp</span><span className="font-semibold text-amber-400">{displayFetTemp} {tempUnit}</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Accel Pos</span><span className="font-semibold text-[#00F0FF]">{telemetry.accelPos}%</span></div>
              </div>
            </div>

            {/* Battery Metrics */}
            <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[#1E293B] mb-4">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <i className="fa-solid fa-car-battery text-rose-400"></i> BATTERY METRICS
                </h3>
                <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">BALANCED</span>
              </div>
              <div className="space-y-3 text-sm font-mono flex-1">
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Pack Voltage</span><span className="font-semibold text-white">{telemetry.packVoltage} V</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Pack Current</span><span className="font-semibold text-cyan-400">{telemetry.packCurrent} A</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Max Cell V</span><span className="font-semibold text-emerald-400">4.12 V</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Min Cell V</span><span className="font-semibold text-emerald-400">3.98 V</span></div>
              </div>
            </div>

            {/* Solar Metrics */}
            <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[#1E293B] mb-4">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <i className="fa-solid fa-sun text-amber-400"></i> SOLAR METRICS
                </h3>
                <span className="px-2.5 py-1 rounded text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">TRACKING</span>
              </div>
              <div className="space-y-3 text-sm font-mono flex-1">
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Solar Power In</span><span className="font-semibold text-amber-400">{telemetry.solarWatts} W</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">Irradiance</span><span className="font-semibold text-white">920 W/m²</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-800"><span className="text-slate-400">MPPT 1 Power</span><span className="font-semibold text-white">285 W</span></div>
              </div>
            </div>

            {/* CAN Stream Logger */}
            <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex flex-col">
              <div className="flex justify-between items-center pb-3 border-b border-[#1E293B] mb-4">
                <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <i className="fa-solid fa-terminal text-emerald-400"></i> CAN LOGGER STREAM
                </h3>
              </div>
              <div className="bg-black/90 p-3 rounded text-xs font-mono space-y-1.5 flex-1 overflow-y-auto">
                {canLogs.map((log, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-500">{log.timestamp}</span>
                    <span className="text-emerald-400 font-bold">{log.id}</span>
                    <span className="text-slate-400">[{log.tag}]</span>
                    <span className="text-slate-300">{log.payload}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= SCREEN 3: LAP ANALYSIS SCREEN ================= */}
        {activeScreen === 3 && (
          <div className="flex flex-col gap-5 flex-1 min-h-0">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Fastest Lap Benchmark</div>
                <div className="text-3xl font-extrabold font-mono text-emerald-400">02:14.32</div>
              </div>
              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Pace Undertimer Delta</div>
                <div className="text-3xl font-extrabold font-mono text-[#00F0FF]">-0.42s</div>
              </div>
              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Lap Power Lost</div>
                <div className="text-3xl font-extrabold font-mono text-amber-400">142 W</div>
              </div>
              <div className="bg-[#121824] border border-[#1E293B] p-5 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Distance Per Lap Avg</div>
                <div className="text-3xl font-extrabold font-mono text-white">4.60 mi</div>
              </div>
            </div>

            <div className="bg-[#121824] border border-[#1E293B] rounded-xl p-5 flex-1 flex flex-col min-h-0">
              <div className="flex justify-between items-center pb-3 border-b border-[#1E293B] mb-4 shrink-0">
                <h3 className="font-bold text-sm text-slate-200 uppercase">Individual Lap Breakdown</h3>
                <button onClick={() => setIsRunModalOpen(true)} className="px-4 py-2 bg-[#F15A24] text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition">
                  <i className="fa-solid fa-code-compare mr-2"></i> Compare Run Statistics
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left font-mono text-sm">
                  <thead>
                    <tr className="bg-[#0A0D14] text-slate-400 border-b border-[#1E293B]">
                      <th className="p-3">Lap #</th>
                      <th className="p-3">Lap Time</th>
                      <th className="p-3">Pace Delta</th>
                      <th className="p-3">Distance</th>
                      <th className="p-3">Power Lost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    <tr><td className="p-3">Lap 1</td><td className="p-3">02:18.10</td><td className="p-3 text-rose-400">+3.36s</td><td className="p-3">4.60 mi</td><td className="p-3 text-amber-400">158 W</td></tr>
                    <tr className="bg-emerald-950/20"><td className="p-3 font-bold text-white">Lap 2</td><td className="p-3 text-emerald-400 font-bold">02:14.32</td><td className="p-3 text-emerald-400">-0.42s</td><td className="p-3">4.60 mi</td><td className="p-3 text-amber-400">135 W</td></tr>
                    <tr><td className="p-3">Lap 3</td><td className="p-3">02:15.80</td><td className="p-3 text-emerald-400">-0.10s</td><td className="p-3">4.60 mi</td><td className="p-3 text-amber-400">140 W</td></tr>
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
          <div className="bg-[#121824] border border-[#1E293B] rounded-xl max-w-xl w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-[#1E293B] pb-3">
              <h3 className="font-bold text-base text-white">RUN STATISTICS COMPARISON</h3>
              <button onClick={() => setIsRunModalOpen(false)} className="text-slate-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-[#0A0D14] p-3 rounded border border-[#1E293B]">
                <div className="font-bold text-[#F15A24] mb-2">Current Run</div>
                <div>Avg Speed: 34.2 mph</div><div>Power Lost: 142 W</div>
              </div>
              <div className="bg-[#0A0D14] p-3 rounded border border-[#1E293B]">
                <div className="font-bold text-slate-400 mb-2">Previous Run</div>
                <div>Avg Speed: 33.8 mph</div><div>Power Lost: 158 W</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
