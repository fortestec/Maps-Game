import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
} from '@vis.gl/react-google-maps';
import { AlertTriangle } from 'lucide-react';
import { CITY_PRESETS } from './data/presets';
import { generateStreetTokens } from './services/walkingEngine';
import type {
  CameraMode,
  CityPreset,
  CollectibleToken,
  GamePhase,
  LatLngLiteral,
  PlayerTelemetry,
  RoutePlan,
  TransportMode,
} from './types/game';
import { StreetViewWorld, type VirtualInputState } from './components/StreetViewWorld';
import { MiniMapRadar } from './components/MiniMapRadar';
import { TitleScreen } from './components/TitleScreen';
import { GameHud } from './components/GameHud';
import { PauseModal } from './components/PauseModal';
import { soundEngine } from './audio/soundEngine';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const INITIAL_PRESET = CITY_PRESETS[0];

function WalkingGameShell() {
  const apiStatus = useApiLoadingStatus();

  const [phase, setPhase] = useState<GamePhase>('title');
  const [selectedPreset, setSelectedPreset] = useState<CityPreset>(INITIAL_PRESET);
  const [transportMode, setTransportMode] = useState<TransportMode>('walk');
  const [cameraMode, setCameraMode] = useState<CameraMode>('third_person');
  const [autoWalk, setAutoWalk] = useState(false);
  const [muted, setMuted] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [spawnRequest, setSpawnRequest] = useState<{
    location: LatLngLiteral;
    heading: number;
    seq: number;
  }>({
    location: INITIAL_PRESET.location,
    heading: INITIAL_PRESET.heading,
    seq: 0,
  });

  const [tokens, setTokens] = useState<CollectibleToken[]>(() =>
    generateStreetTokens(INITIAL_PRESET.location, INITIAL_PRESET.heading, 5)
  );
  const [activeRoute, setActiveRoute] = useState<RoutePlan | null>(null);

  const [telemetry, setTelemetry] = useState<PlayerTelemetry>({
    transportMode: 'walk',
    position: INITIAL_PRESET.location,
    panoId: '',
    heading: INITIAL_PRESET.heading,
    pitch: 0,
    zoom: 0.9,
    strideProgress: 0,
    speedMetersPerSec: 0,
    isMoving: false,
    isJogging: false,
    distanceMeters: 0,
    steps: 0,
    tokensCollected: 0,
    totalTokensSpawned: 5,
    score: 0,
    stamina: 100,
    currentStreet: `${INITIAL_PRESET.name}, ${INITIAL_PRESET.city}`,
    links: [],
    hasDeadEnd: false,
  });

  const virtualInputRef = useRef<VirtualInputState>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jog: false,
  });

  const handleSelectPreset = useCallback((preset: CityPreset) => {
    setSelectedPreset(preset);
    setGeoError(null);
    setActiveRoute(null);
    setSpawnRequest((prev) => ({
      location: preset.location,
      heading: preset.heading,
      seq: prev.seq + 1,
    }));
    setTokens(generateStreetTokens(preset.location, preset.heading, 5));
  }, []);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocalização não suportada neste navegador.');
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setActiveRoute(null);
        setSpawnRequest((prev) => ({
          location: loc,
          heading: 0,
          seq: prev.seq + 1,
        }));
        setTokens(generateStreetTokens(loc, 0, 5));
        setPhase('playing');
        soundEngine.unlock();
      },
      () => {
        setGeoLoading(false);
        setGeoError('Não foi possível obter sua localização. Escolha uma cidade abaixo.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  const handleStartGame = useCallback(() => {
    soundEngine.unlock();
    setPhase('playing');
  }, []);

  const handleSelectTransportMode = useCallback((mode: TransportMode) => {
    setTransportMode((prev) => {
      if (prev !== mode) {
        soundEngine.unlock();
        soundEngine.playModeSwitch(mode);
      }
      return mode;
    });
  }, []);

  const handleToggleCameraMode = useCallback(() => {
    setCameraMode((prev) => {
      const next = prev === 'third_person' ? 'first_person' : 'third_person';
      soundEngine.playCameraToggle(next === 'third_person');
      return next;
    });
  }, []);

  const handleToggleAutoWalk = useCallback(() => {
    setAutoWalk((prev) => !prev);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleTogglePause = useCallback(() => {
    setMapExpanded(false);
    setPhase((prev) => (prev === 'playing' ? 'paused' : prev === 'paused' ? 'playing' : prev));
  }, []);

  const handleTeleport = useCallback(
    (loc: LatLngLiteral, heading = telemetry.heading) => {
      setActiveRoute(null);
      setSpawnRequest((prev) => ({
        location: loc,
        heading,
        seq: prev.seq + 1,
      }));
      setTokens(generateStreetTokens(loc, heading, 5));
    },
    [telemetry.heading]
  );

  const handleTeleportPreset = useCallback(
    (preset: CityPreset) => {
      setSelectedPreset(preset);
      handleTeleport(preset.location, preset.heading);
      setPhase('playing');
    },
    [handleTeleport]
  );

  const handleTokenCollected = useCallback((tokenId: string) => {
    setTokens((prev) =>
      prev.map((t) => (t.id === tokenId ? { ...t, collected: true } : t))
    );
  }, []);

  const handleRespawnTokens = useCallback(() => {
    setTokens(generateStreetTokens(telemetry.position, telemetry.heading, 5));
  }, [telemetry.position, telemetry.heading]);

  const handleRouteArrived = useCallback(() => {
    setAutoWalk(false);
    setPhase('arrived');
  }, []);

  if (!MAPS_API_KEY) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-6 text-center">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">
            Chave do Google Maps Necessária
          </h2>
          <p className="text-sm text-slate-300">
            Configure a variável <code className="text-sky-300">VITE_GOOGLE_MAPS_API_KEY</code> para carregar o Street View e o Mapa em tempo real.
          </p>
        </div>
      </div>
    );
  }

  if (apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 p-6 text-center">
        <div className="max-w-md rounded-2xl bg-slate-900 border border-amber-600/60 p-6 shadow-2xl">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">
            Falha ao Carregar Google Maps
          </h2>
          <p className="text-sm text-slate-300">
            Verifique sua conexão ou as permissões da chave da API do Google Maps Platform.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      <StreetViewWorld
        phase={phase}
        transportMode={transportMode}
        cameraMode={cameraMode}
        autoWalk={autoWalk}
        spawnRequest={spawnRequest}
        tokens={tokens}
        activeRoute={activeRoute}
        virtualInputRef={virtualInputRef}
        onTelemetryUpdate={setTelemetry}
        onTokenCollected={handleTokenCollected}
        onRouteArrived={handleRouteArrived}
        onSelectTransportMode={handleSelectTransportMode}
        onToggleCameraMode={handleToggleCameraMode}
        onToggleAutoWalk={handleToggleAutoWalk}
        onTogglePause={handleTogglePause}
        onToggleMapModal={() => setMapExpanded((v) => !v)}
      />

      {phase === 'title' && (
        <TitleScreen
          selectedPreset={selectedPreset}
          transportMode={transportMode}
          cameraMode={cameraMode}
          geoLoading={geoLoading}
          geoError={geoError}
          onSelectPreset={handleSelectPreset}
          onSelectTransportMode={handleSelectTransportMode}
          onSelectCameraMode={(m) => {
            setCameraMode(m);
            soundEngine.playCameraToggle(m === 'third_person');
          }}
          onUseMyLocation={handleUseMyLocation}
          onStartGame={handleStartGame}
        />
      )}

      {phase === 'playing' && (
        <>
          <GameHud
            telemetry={telemetry}
            transportMode={transportMode}
            cameraMode={cameraMode}
            autoWalk={autoWalk}
            muted={muted}
            tokens={tokens}
            activeRoute={activeRoute}
            virtualInputRef={virtualInputRef}
            onSelectTransportMode={handleSelectTransportMode}
            onToggleCameraMode={handleToggleCameraMode}
            onToggleAutoWalk={handleToggleAutoWalk}
            onToggleMute={handleToggleMute}
            onToggleMap={() => setMapExpanded((v) => !v)}
            onPause={handleTogglePause}
            onRespawnTokens={handleRespawnTokens}
          />

          <MiniMapRadar
            transportMode={transportMode}
            playerPos={telemetry.position}
            heading={telemetry.heading}
            tokens={tokens}
            activeRoute={activeRoute}
            expanded={mapExpanded}
            onToggleExpand={setMapExpanded}
            onTeleport={handleTeleport}
            onSetRoute={setActiveRoute}
          />
        </>
      )}

      {(phase === 'paused' || phase === 'arrived') && (
        <PauseModal
          phase={phase}
          telemetry={telemetry}
          destinationName={activeRoute?.destinationName}
          onResume={() => {
            if (phase === 'arrived') {
              setActiveRoute(null);
            }
            setPhase('playing');
          }}
          onTeleportPreset={handleTeleportPreset}
          onBackToTitle={() => {
            setAutoWalk(false);
            setMapExpanded(false);
            setPhase('title');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {MAPS_API_KEY ? (
        <APIProvider
          apiKey={MAPS_API_KEY}
          language="pt-BR"
          region="BR"
          libraries={['places', 'routes', 'streetView', 'marker']}
        >
          <WalkingGameShell />
        </APIProvider>
      ) : (
        <WalkingGameShell />
      )}
    </div>
  );
}
