import { useEffect } from 'react';
import { Bike, Car, Eye, Footprints, LocateFixed, MapPin, Play, User } from 'lucide-react';
import { CITY_PRESETS } from '../data/presets';
import type { CameraMode, CityPreset, TransportMode } from '../types/game';

interface TitleScreenProps {
  selectedPreset: CityPreset;
  transportMode: TransportMode;
  cameraMode: CameraMode;
  geoLoading: boolean;
  geoError: string | null;
  onSelectPreset: (preset: CityPreset) => void;
  onSelectTransportMode: (mode: TransportMode) => void;
  onSelectCameraMode: (mode: CameraMode) => void;
  onUseMyLocation: () => void;
  onStartGame: () => void;
}

export function TitleScreen({
  selectedPreset,
  transportMode,
  cameraMode,
  geoLoading,
  geoError,
  onSelectPreset,
  onSelectTransportMode,
  onSelectCameraMode,
  onUseMyLocation,
  onStartGame,
}: TitleScreenProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT')) return;
        e.preventDefault();
        onStartGame();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStartGame]);

  const ctaLabel =
    transportMode === 'moto'
      ? 'PILOTAR MOTO'
      : transportMode === 'car'
        ? 'DIRIGIR CARRO'
        : 'INICIAR CAMINHADA';

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/35 p-6 md:p-12 pointer-events-auto overflow-y-auto">
      {/* Top Left Bespoke SVG Brand Lockup */}
      <div className="max-w-2xl pt-2 md:pt-4">
        <div className="flex items-center gap-3.5 mb-4">
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect width="48" height="48" rx="14" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5" />
            <circle cx="24" cy="24" r="16" stroke="#38BDF8" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="3 3" />
            <path
              d="M24 10L31 28L24 24.5L17 28L24 10Z"
              fill="#38BDF8"
            />
            <circle cx="24" cy="34" r="3" fill="#FBBF24" />
          </svg>
          <div>
            <div className="text-xs font-mono-tabular uppercase tracking-[0.26em] text-sky-400 font-bold">
              Exploração Urbana em Tempo Real
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-none mt-1">
              PASSO LIVRE
            </h1>
          </div>
        </div>

        <p className="text-slate-300 text-sm md:text-base max-w-xl leading-relaxed mb-6">
          Explore as ruas reais do planeta no Google Street View{' '}
          <span className="text-white font-semibold">a pé, de moto ou de carro</span> em{' '}
          <span className="text-white font-semibold">primeira ou terceira pessoa</span>, trace rotas no mapa e colete marcos pelo caminho.
        </p>

        {/* Transport & Camera Perspective Selectors */}
        <div className="flex flex-wrap gap-5 mb-6">
          <div>
            <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-slate-400 mb-2">
              Modo de Transporte
            </div>
            <div className="inline-flex rounded-xl bg-slate-900/95 border border-slate-700/80 p-1 gap-1">
              <button
                type="button"
                onClick={() => onSelectTransportMode('walk')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  transportMode === 'walk'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Footprints className="w-4 h-4" />
                A Pé
              </button>
              <button
                type="button"
                onClick={() => onSelectTransportMode('moto')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  transportMode === 'moto'
                    ? 'bg-orange-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Bike className="w-4 h-4" />
                Moto
              </button>
              <button
                type="button"
                onClick={() => onSelectTransportMode('car')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  transportMode === 'car'
                    ? 'bg-emerald-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Car className="w-4 h-4" />
                Carro
              </button>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-mono-tabular uppercase tracking-widest text-slate-400 mb-2">
              Perspectiva Inicial
            </div>
            <div className="inline-flex rounded-xl bg-slate-900/95 border border-slate-700/80 p-1 gap-1">
              <button
                type="button"
                onClick={() => onSelectCameraMode('third_person')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  cameraMode === 'third_person'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <User className="w-4 h-4" />
                3ª Pessoa
              </button>
              <button
                type="button"
                onClick={() => onSelectCameraMode('first_person')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  cameraMode === 'first_person'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-4 h-4" />
                1ª Pessoa
              </button>
            </div>
          </div>
        </div>

        {/* Starting City Selector */}
        <div className="mb-7">
          <div className="flex items-center justify-between max-w-xl mb-2.5">
            <span className="text-[11px] font-mono-tabular uppercase tracking-widest text-slate-400">
              Escolha onde começar
            </span>
            <button
              type="button"
              onClick={onUseMyLocation}
              disabled={geoLoading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50 cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              {geoLoading ? 'Localizando...' : 'Usar minha localização'}
            </button>
          </div>

          {geoError && (
            <div className="mb-2.5 text-xs text-amber-300 bg-amber-950/80 border border-amber-700/60 rounded-lg px-3 py-1.5 max-w-xl">
              {geoError}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-xl">
            {CITY_PRESETS.map((preset) => {
              const active = preset.id === selectedPreset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-800/95 border-sky-400 shadow-lg'
                      : 'bg-slate-900/85 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white truncate">
                    <MapPin
                      className="w-3.5 h-3.5 shrink-0"
                      style={{ color: preset.accentColor }}
                    />
                    <span className="truncate">{preset.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {preset.city}, {preset.country}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Start CTA */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onStartGame}
            className="inline-flex items-center gap-3 px-7 py-4 rounded-2xl bg-sky-400 hover:bg-sky-300 active:scale-[0.98] text-slate-950 font-extrabold text-base md:text-lg tracking-tight shadow-xl transition-all cursor-pointer"
          >
            <Play className="w-5 h-5 fill-slate-950" />
            {ctaLabel}
          </button>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            {transportMode === 'moto' ? (
              <Bike className="w-4 h-4 text-orange-400" />
            ) : transportMode === 'car' ? (
              <Car className="w-4 h-4 text-emerald-400" />
            ) : (
              <Footprints className="w-4 h-4 text-sky-400" />
            )}
            <span>
              Iniciando em <strong className="text-slate-200">{selectedPreset.name}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Single flat control-hint line at bottom */}
      <div className="pt-6">
        <div className="inline-block px-4 py-2 rounded-xl bg-slate-950/90 border border-slate-800/90 text-xs font-mono-tabular text-slate-300">
          WASD Mover · Shift Turbo/Correr · 1/2/3 A Pé/Moto/Carro · V 1ª/3ª Pessoa · F Buzina · Espaço Piloto Auto · M Mapa
        </div>
      </div>
    </div>
  );
}
