import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Footprints,
  Gamepad2,
  Map as MapIcon,
  Pause,
  Play,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import type {
  CameraMode,
  CollectibleToken,
  PlayerTelemetry,
  RoutePlan,
  TransportMode,
} from '../types/game';
import {
  angleDiff,
  computeBearing,
  formatDistance,
  getCompassCardinal,
  haversineDistance,
} from '../services/walkingEngine';
import type { VirtualInputState } from './StreetViewWorld';

interface GameHudProps {
  telemetry: PlayerTelemetry;
  transportMode: TransportMode;
  cameraMode: CameraMode;
  autoWalk: boolean;
  muted: boolean;
  tokens: CollectibleToken[];
  activeRoute: RoutePlan | null;
  virtualInputRef: React.MutableRefObject<VirtualInputState>;
  onSelectTransportMode: (mode: TransportMode) => void;
  onToggleCameraMode: () => void;
  onToggleAutoWalk: () => void;
  onToggleMute: () => void;
  onToggleMap: () => void;
  onPause: () => void;
  onRespawnTokens: () => void;
}

export function GameHud({
  telemetry,
  transportMode,
  cameraMode,
  autoWalk,
  muted,
  tokens,
  activeRoute,
  virtualInputRef,
  onSelectTransportMode,
  onToggleCameraMode,
  onToggleAutoWalk,
  onToggleMute,
  onToggleMap,
  onPause,
  onRespawnTokens,
}: GameHudProps) {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showTouchPad, setShowTouchPad] = useState(false);

  // H key collapses/expands bottom dock for Zen Mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.code === 'KeyH' && !e.repeat) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Compute nearest uncollected token or active route target guidance
  const uncollected = tokens.filter((t) => !t.collected);
  let targetLabel = '';
  let targetDist = 0;
  let targetRelAngle = 0;
  let targetIsRoute = false;

  if (activeRoute) {
    targetIsRoute = true;
    targetLabel = activeRoute.destinationName;
    targetDist = haversineDistance(telemetry.position, activeRoute.destination);
    const b = computeBearing(telemetry.position, activeRoute.destination);
    targetRelAngle = angleDiff(b, telemetry.heading);
  } else if (uncollected.length > 0) {
    let bestToken = uncollected[0];
    let bestD = haversineDistance(telemetry.position, bestToken.position);
    for (let i = 1; i < uncollected.length; i++) {
      const d = haversineDistance(telemetry.position, uncollected[i].position);
      if (d < bestD) {
        bestD = d;
        bestToken = uncollected[i];
      }
    }
    targetLabel = bestToken.label;
    targetDist = bestD;
    const b = computeBearing(telemetry.position, bestToken.position);
    targetRelAngle = angleDiff(b, telemetry.heading);
  }

  const setVirtualKey = (key: keyof VirtualInputState, active: boolean) => {
    virtualInputRef.current[key] = active;
  };

  const cardinal = getCompassCardinal(telemetry.heading);

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* TOP-LEFT: Current Street + Active Waypoint Guidance */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 max-w-[290px]">
        <div className="px-3.5 py-2 rounded-xl bg-slate-950/88 border border-slate-700/80 shadow-lg">
          <div className="text-[10px] font-mono-tabular uppercase tracking-widest text-sky-400 font-bold">
            Local Atual
          </div>
          <div className="text-sm font-bold text-white truncate">
            {telemetry.currentStreet}
          </div>
        </div>

        {(activeRoute || uncollected.length > 0) && (
          <div
            className={`px-3.5 py-2 rounded-xl border shadow-lg flex items-center gap-3 ${
              targetIsRoute
                ? 'bg-emerald-950/90 border-emerald-500/60'
                : 'bg-slate-950/88 border-amber-500/50'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                targetIsRoute ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              <ArrowUp
                className="w-4 h-4 transition-transform duration-100"
                style={{ transform: `rotate(${targetRelAngle}deg)` }}
              />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-slate-300">
                {targetIsRoute ? 'Destino da Rota' : 'Marco Próximo'}
              </div>
              <div className="text-xs font-bold text-white truncate">
                {targetLabel}{' '}
                <span className="font-mono-tabular text-sky-300 ml-1">
                  {formatDistance(targetDist)}
                </span>
              </div>
            </div>
          </div>
        )}

        {telemetry.hasDeadEnd && (
          <div className="px-3 py-1.5 rounded-lg bg-amber-950/92 border border-amber-500/70 text-xs text-amber-200 font-medium">
            Sem saída à frente — gire com A/D ou arraste o mouse
          </div>
        )}
      </div>

      {/* TOP-CENTER: Compact Compass Bearing Readout */}
      <div className="hidden sm:flex absolute top-4 left-1/2 -translate-x-1/2 items-center gap-2.5 px-4 py-1.5 rounded-xl bg-slate-950/88 border border-slate-700/80 shadow-lg">
        <Compass className="w-4 h-4 text-sky-400" />
        <span className="font-mono-tabular text-sm font-bold text-white">
          {cardinal}
        </span>
        <span className="font-mono-tabular text-xs text-slate-400">
          {Math.round(telemetry.heading).toString().padStart(3, '0')}°
        </span>
        <span className="text-slate-700">|</span>
        <span className="font-mono-tabular text-xs text-sky-300">
          {(telemetry.speedMetersPerSec * 3.6).toFixed(1)} km/h
        </span>
      </div>

      {/* TOP-RIGHT: Tabular-nums Telemetry + Mute + Pause */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <div className="px-3.5 py-2 rounded-xl bg-slate-950/88 border border-slate-700/80 shadow-lg flex items-center gap-4">
          {transportMode === 'walk' ? (
            <div className="text-right">
              <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400">
                Passos
              </div>
              <div className="font-mono-tabular text-sm md:text-base font-bold text-white">
                {telemetry.steps.toLocaleString('pt-BR')}
              </div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400">
                Velocidade
              </div>
              <div className="font-mono-tabular text-sm md:text-base font-bold text-orange-300">
                {Math.round(telemetry.speedMetersPerSec * 3.6)} km/h
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400">
              Distância
            </div>
            <div className="font-mono-tabular text-sm md:text-base font-bold text-sky-300">
              {formatDistance(telemetry.distanceMeters)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono-tabular uppercase tracking-wider text-slate-400">
              Marcos
            </div>
            <div className="font-mono-tabular text-sm md:text-base font-bold text-amber-300">
              {telemetry.tokensCollected}/{telemetry.totalTokensSpawned}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="pointer-events-auto p-2.5 rounded-xl bg-slate-950/88 hover:bg-slate-800 border border-slate-700/80 text-slate-200 shadow-lg transition-colors cursor-pointer"
          title={muted ? 'Ativar Áudio' : 'Silenciar Áudio'}
        >
          {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-sky-400" />}
        </button>

        <button
          type="button"
          onClick={onPause}
          className="pointer-events-auto p-2.5 rounded-xl bg-slate-950/88 hover:bg-slate-800 border border-slate-700/80 text-slate-200 shadow-lg transition-colors cursor-pointer"
          title="Pausar (Esc)"
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {/* Optional On-Screen Touch / Mouse D-Pad (Bottom-Right) */}
      {showTouchPad && (
        <div className="absolute bottom-24 right-5 pointer-events-auto flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-950/90 border border-slate-700/80 shadow-2xl">
          <button
            type="button"
            onPointerDown={() => setVirtualKey('forward', true)}
            onPointerUp={() => setVirtualKey('forward', false)}
            onPointerLeave={() => setVirtualKey('forward', false)}
            className="w-12 h-11 rounded-xl bg-slate-800 active:bg-sky-400 active:text-slate-950 flex items-center justify-center text-white"
            aria-label="Andar para frente"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onPointerDown={() => setVirtualKey('left', true)}
              onPointerUp={() => setVirtualKey('left', false)}
              onPointerLeave={() => setVirtualKey('left', false)}
              className="w-12 h-11 rounded-xl bg-slate-800 active:bg-sky-400 active:text-slate-950 flex items-center justify-center text-white"
              aria-label="Virar esquerda"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onPointerDown={() => setVirtualKey('backward', true)}
              onPointerUp={() => setVirtualKey('backward', false)}
              onPointerLeave={() => setVirtualKey('backward', false)}
              className="w-12 h-11 rounded-xl bg-slate-800 active:bg-sky-400 active:text-slate-950 flex items-center justify-center text-white"
              aria-label="Andar para trás"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
            <button
              type="button"
              onPointerDown={() => setVirtualKey('right', true)}
              onPointerUp={() => setVirtualKey('right', false)}
              onPointerLeave={() => setVirtualKey('right', false)}
              className="w-12 h-11 rounded-xl bg-slate-800 active:bg-sky-400 active:text-slate-950 flex items-center justify-center text-white"
              aria-label="Virar direita"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
          <button
            type="button"
            onPointerDown={() => setVirtualKey('jog', true)}
            onPointerUp={() => setVirtualKey('jog', false)}
            onPointerLeave={() => setVirtualKey('jog', false)}
            className="w-full py-1.5 mt-0.5 rounded-lg bg-amber-500/20 active:bg-amber-400 active:text-slate-950 border border-amber-500/40 text-[11px] font-bold text-amber-200 flex items-center justify-center gap-1"
          >
            <Zap className="w-3.5 h-3.5" />
            {transportMode === 'walk' ? 'Segurar p/ Correr' : 'Segurar p/ Turbo'}
          </button>
        </div>
      )}

      {/* COLLAPSIBLE BOTTOM CONTROL DOCK */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 bottom-5 flex flex-col items-center transition-transform duration-200 ${
          dockCollapsed ? 'translate-y-[calc(100%-26px)]' : 'translate-y-0'
        }`}
      >
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-t-xl bg-slate-950/92 border border-b-0 border-slate-700/80 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Controles [H]
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Ocultar [H]
            </>
          )}
        </button>

        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-950/92 border border-slate-700/80 shadow-2xl max-w-[95vw]">
          {/* Transport Mode Segmented Switch */}
          <div className="inline-flex items-center rounded-xl bg-slate-900 border border-slate-700/80 p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => onSelectTransportMode('walk')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                transportMode === 'walk'
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Andar a Pé (1)"
            >
              <Footprints className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">A Pé</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTransportMode('moto')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                transportMode === 'moto'
                  ? 'bg-orange-400 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Andar de Moto (2)"
            >
              <Bike className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Moto</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectTransportMode('car')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                transportMode === 'car'
                  ? 'bg-emerald-400 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              title="Dirigir Carro (3)"
            >
              <Car className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Carro</span>
            </button>
          </div>

          {/* Camera Perspective Toggle */}
          <button
            type="button"
            onClick={onToggleCameraMode}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            title="Alternar Câmera (V)"
          >
            {cameraMode === 'third_person' ? (
              <>
                <User className="w-4 h-4" />
                3ª Pessoa [V]
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" />
                1ª Pessoa [V]
              </>
            )}
          </button>

          {/* Auto-Walk / Auto-Cruise Toggle */}
          <button
            type="button"
            onClick={onToggleAutoWalk}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              autoWalk
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
            title="Piloto Automático (Espaço)"
          >
            {autoWalk ? (
              <Play className="w-3.5 h-3.5 fill-slate-950" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {transportMode === 'walk' ? 'Auto-Passo' : 'Piloto Auto'}
          </button>

          {/* Tactical Map Button */}
          <button
            type="button"
            onClick={onToggleMap}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
            title="Abrir Mapa & Rotas (M)"
          >
            <MapIcon className="w-3.5 h-3.5 text-emerald-400" />
            Mapa [M]
          </button>

          {/* Respawn Tokens if all collected */}
          {uncollected.length === 0 && (
            <button
              type="button"
              onClick={onRespawnTokens}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Novos Marcos
            </button>
          )}

          {/* On-Screen Pad Toggle */}
          <button
            type="button"
            onClick={() => setShowTouchPad((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              showTouchPad
                ? 'bg-slate-700 text-white border-slate-500'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title="Mostrar Controles na Tela"
          >
            <Gamepad2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
