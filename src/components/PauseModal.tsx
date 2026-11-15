import { CheckCircle2, Home, MapPin, Play, RotateCcw } from 'lucide-react';
import { CITY_PRESETS } from '../data/presets';
import type { CityPreset, GamePhase, PlayerTelemetry } from '../types/game';
import { formatDistance } from '../services/walkingEngine';

interface PauseModalProps {
  phase: Extract<GamePhase, 'paused' | 'arrived'>;
  telemetry: PlayerTelemetry;
  destinationName?: string;
  onResume: () => void;
  onTeleportPreset: (preset: CityPreset) => void;
  onBackToTitle: () => void;
}

export function PauseModal({
  phase,
  telemetry,
  destinationName,
  onResume,
  onTeleportPreset,
  onBackToTitle,
}: PauseModalProps) {
  const isArrived = phase === 'arrived';
  const mode = telemetry.transportMode;
  const modePreposition = mode === 'moto' ? 'de moto' : mode === 'car' ? 'de carro' : 'a pé';
  const pauseTitle =
    mode === 'moto'
      ? 'Passeio de Moto Pausado'
      : mode === 'car'
        ? 'Direção Pausada'
        : 'Caminhada Pausada';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 pointer-events-auto">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 md:p-7">
        <div className="flex items-center gap-3 mb-4">
          {isArrived ? (
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/50 flex items-center justify-center text-sky-400">
              <MapPin className="w-6 h-6" />
            </div>
          )}
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              {isArrived ? 'Destino Alcançado!' : pauseTitle}
            </h2>
            <p className="text-xs text-slate-400">
              {isArrived
                ? `Você chegou a ${destinationName || 'seu destino'} ${modePreposition}.`
                : telemetry.currentStreet}
            </p>
          </div>
        </div>

        {/* Session Stats */}
        <div className="grid grid-cols-3 gap-3 my-5">
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
              Passos
            </div>
            <div className="font-mono-tabular text-lg font-bold text-white mt-0.5">
              {telemetry.steps.toLocaleString('pt-BR')}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
              Distância
            </div>
            <div className="font-mono-tabular text-lg font-bold text-sky-300 mt-0.5">
              {formatDistance(telemetry.distanceMeters)}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] font-mono-tabular uppercase text-slate-400">
              Pontuação
            </div>
            <div className="font-mono-tabular text-lg font-bold text-amber-300 mt-0.5">
              {telemetry.score}
            </div>
          </div>
        </div>

        {/* Quick Teleport Cities */}
        <div className="mb-6">
          <div className="text-[11px] font-mono-tabular uppercase tracking-wider text-slate-400 mb-2">
            Viajar para outra rua agora
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CITY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onTeleportPreset(preset)}
                className="text-left px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-400/60 transition-colors cursor-pointer"
              >
                <div className="text-xs font-bold text-white truncate">
                  {preset.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {preset.city}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onResume}
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold text-sm transition-colors cursor-pointer"
          >
            {isArrived ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4 fill-slate-950" />}
            {isArrived ? 'Continuar Explorando' : 'Retomar Exploração'}
          </button>

          <button
            type="button"
            onClick={onBackToTitle}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
            Início
          </button>
        </div>
      </div>
    </div>
  );
}
