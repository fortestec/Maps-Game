import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Compass, MapPin, Navigation, Search, X } from 'lucide-react';
import type {
  CollectibleToken,
  LatLngLiteral,
  RoutePlan,
  TransportMode,
} from '../types/game';
import { formatDistance } from '../services/walkingEngine';

interface MiniMapRadarProps {
  transportMode: TransportMode;
  playerPos: LatLngLiteral;
  heading: number;
  tokens: CollectibleToken[];
  activeRoute: RoutePlan | null;
  expanded: boolean;
  onToggleExpand: (expanded: boolean) => void;
  onTeleport: (loc: LatLngLiteral, heading?: number) => void;
  onSetRoute: (route: RoutePlan | null) => void;
}

/**
 * Child controller inside <Map> to render route polylines cleanly using Routes API.
 */
function RoutePolylineOverlay({
  transportMode,
  routeOrigin,
  routeDest,
  onRouteComputed,
}: {
  transportMode: TransportMode;
  routeOrigin: LatLngLiteral | null;
  routeDest: LatLngLiteral | null;
  onRouteComputed: (plan: RoutePlan | null) => void;
}) {
  const map = useMap('tactical-walk-map');
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !routeOrigin || !routeDest) {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      return;
    }

    let cancelled = false;

    const computeWithTravelMode = async (travelMode: 'WALKING' | 'TWO_WHEELER' | 'DRIVING') => {
      const request = {
        origin: routeOrigin,
        destination: routeDest,
        travelMode,
        fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
      };

      const res = await (routesLib.Route as unknown as {
        computeRoutes: (req: typeof request) => Promise<{
          routes: Array<{
            path?: google.maps.LatLng[];
            distanceMeters?: number;
            durationMillis?: number;
            viewport?: google.maps.LatLngBounds;
            createPolylines: () => google.maps.Polyline[];
          }>;
        }>;
      }).computeRoutes(request);
      return res.routes;
    };

    const runRoute = async () => {
      const preferred: 'WALKING' | 'TWO_WHEELER' | 'DRIVING' =
        transportMode === 'moto'
          ? 'TWO_WHEELER'
          : transportMode === 'car'
            ? 'DRIVING'
            : 'WALKING';

      let routes: Awaited<ReturnType<typeof computeWithTravelMode>> = [];
      try {
        routes = await computeWithTravelMode(preferred);
      } catch (err: unknown) {
        if (preferred === 'TWO_WHEELER') {
          // Graceful fallback to DRIVING where TWO_WHEELER isn't regionally supported
          routes = await computeWithTravelMode('DRIVING');
        } else {
          throw err;
        }
      }

      if (preferred === 'TWO_WHEELER' && (!routes || routes.length === 0)) {
        routes = await computeWithTravelMode('DRIVING');
      }

      if (cancelled) return;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];

      if (!routes || routes.length === 0) return;
      const primary = routes[0];
      const lines = primary.createPolylines();
      const strokeColor =
        transportMode === 'moto'
          ? '#fb923c'
          : transportMode === 'car'
            ? '#38bdf8'
            : '#34d399';
      lines.forEach((p) => {
        p.setOptions({
          strokeColor,
          strokeOpacity: 0.92,
          strokeWeight: 5,
        });
        p.setMap(map);
      });
      polylinesRef.current = lines;

      if (primary.viewport) {
        map.fitBounds(primary.viewport, 40);
      }

      const pathCoords: LatLngLiteral[] = (primary.path || []).map((pt) => ({
        lat: pt.lat(),
        lng: pt.lng(),
      }));

      onRouteComputed({
        destinationName: 'Destino Marcado',
        destination: routeDest,
        totalDistanceMeters: primary.distanceMeters ?? 0,
        estimatedDurationSec: Math.round((primary.durationMillis ?? 0) / 1000),
        path: pathCoords,
      });
    };

    runRoute().catch((err: unknown) => {
      const msg = String(err ?? '');
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('OVER_QUERY_LIMIT') ||
        msg.includes('429')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, transportMode, routeOrigin, routeDest, onRouteComputed]);

  return null;
}

export function MiniMapRadar({
  transportMode,
  playerPos,
  heading,
  tokens,
  activeRoute,
  expanded,
  onToggleExpand,
  onTeleport,
  onSetRoute,
}: MiniMapRadarProps) {
  const placesLib = useMapsLibrary('places');
  const mapInstance = useMap('tactical-walk-map');

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const [clickAction, setClickAction] = useState<'teleport' | 'route'>('route');
  const [pendingRouteOrigin, setPendingRouteOrigin] = useState<LatLngLiteral | null>(null);
  const [pendingRouteDest, setPendingRouteDest] = useState<LatLngLiteral | null>(null);
  const [pendingDestLabel, setPendingDestLabel] = useState<string>('Destino no Mapa');

  // Keep compact radar centered on player when collapsed
  useEffect(() => {
    if (!mapInstance || expanded) return;
    mapInstance.panTo(playerPos);
  }, [mapInstance, playerPos, expanded]);

  // Modern Places API (New) AutocompleteSuggestion with AutocompleteSessionToken
  useEffect(() => {
    if (!placesLib || !expanded) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }

    const timer = window.setTimeout(() => {
      placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          setSuggestions(res.suggestions || []);
        })
        .catch((err: unknown) => {
          const msg = String(err ?? '');
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        });
    }, 240);

    return () => window.clearTimeout(timer);
  }, [placesLib, searchQuery, expanded]);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'location'] });
      sessionTokenRef.current = null;
      setSuggestions([]);

      if (place.location) {
        const loc = { lat: place.location.lat(), lng: place.location.lng() };
        const label = place.displayName || suggestion.placePrediction.text.text;
        setSearchQuery('');
        if (clickAction === 'teleport') {
          onTeleport(loc);
          onToggleExpand(false);
        } else {
          setPendingDestLabel(label);
          setPendingRouteOrigin(playerPos);
          setPendingRouteDest(loc);
        }
      }
    } catch (err: unknown) {
      const msg = String(err ?? '');
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    }
  };

  const handleMapClick = useCallback(
    (ev: { detail: { latLng?: LatLngLiteral | null } }) => {
      if (!expanded || !ev.detail.latLng) return;
      const clicked = ev.detail.latLng;
      if (clickAction === 'teleport') {
        onTeleport(clicked);
        onToggleExpand(false);
      } else {
        setPendingDestLabel('Destino Marcado');
        setPendingRouteOrigin(playerPos);
        setPendingRouteDest(clicked);
      }
    },
    [expanded, clickAction, playerPos, onTeleport, onToggleExpand]
  );

  const handleRouteComputed = useCallback(
    (plan: RoutePlan | null) => {
      if (!plan) {
        onSetRoute(null);
        return;
      }
      onSetRoute({
        ...plan,
        destinationName: pendingDestLabel,
      });
    },
    [onSetRoute, pendingDestLabel]
  );

  const clearRoute = () => {
    setPendingRouteOrigin(null);
    setPendingRouteDest(null);
    onSetRoute(null);
  };

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 md:p-8 pointer-events-auto'
          : 'fixed bottom-5 left-5 z-30 pointer-events-auto'
      }
    >
      <div
        className={
          expanded
            ? 'relative w-full max-w-5xl h-[82vh] rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl overflow-hidden flex flex-col'
            : 'relative w-44 h-44 md:w-48 md:h-48 rounded-2xl border-2 border-slate-700/90 bg-slate-900 shadow-2xl overflow-hidden group transition-transform duration-200 hover:scale-[1.02]'
        }
      >
        {/* Top bar when expanded */}
        {expanded && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 z-10">
            <div className="flex items-center gap-2.5">
              <Compass className="w-5 h-5 text-sky-400" />
              <span className="font-bold text-base tracking-tight text-slate-100">
                Mapa Tático & Rota ({transportMode === 'moto' ? 'Moto' : transportMode === 'car' ? 'Carro' : 'A Pé'})
              </span>
            </div>

            {/* Search box */}
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <div className="flex items-center bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 focus-within:border-sky-400">
                <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar rua, praça ou cidade..."
                  className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                />
              </div>

              {suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto">
                  {suggestions.map((s, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => void handleSelectSuggestion(s)}
                        className="w-full text-left px-3.5 py-2.5 text-sm text-slate-200 hover:bg-slate-800 border-b border-slate-800/70 last:border-none flex items-center gap-2"
                      >
                        <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="truncate">{s.placePrediction?.text.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Click Mode Switch */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setClickAction('route')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  clickAction === 'route'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Traçar Rota
              </button>
              <button
                type="button"
                onClick={() => setClickAction('teleport')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  clickAction === 'teleport'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Teleportar
              </button>
            </div>

            <button
              type="button"
              onClick={() => onToggleExpand(false)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              aria-label="Fechar mapa"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Map Container with explicit non-zero height (CF2) */}
        <div className="relative flex-1 w-full h-full min-h-[160px]">
          <GoogleMap
            id="tactical-walk-map"
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            defaultCenter={playerPos}
            defaultZoom={17}
            gestureHandling={expanded ? 'greedy' : 'none'}
            disableDefaultUI={true}
            clickableIcons={false}
            onClick={handleMapClick}
            style={{ width: '100%', height: '100%' }}
          >
            {/* Player Position + Heading Cone Marker */}
            <AdvancedMarker position={playerPos} zIndex={50}>
              <div
                className="relative flex items-center justify-center"
                style={{ transform: `rotate(${heading}deg)` }}
              >
                <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[26px] border-b-sky-400/45 -translate-y-4" />
                <div className="absolute w-4 h-4 rounded-full bg-sky-400 border-2 border-white shadow-md" />
              </div>
            </AdvancedMarker>

            {/* Collectible Token Pins */}
            {tokens
              .filter((t) => !t.collected)
              .map((t) => (
                <AdvancedMarker key={t.id} position={t.position} zIndex={20}>
                  <div className="w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-slate-950 shadow" />
                </AdvancedMarker>
              ))}

            {/* Destination Pin */}
            {activeRoute && (
              <AdvancedMarker position={activeRoute.destination} zIndex={40}>
                <Pin background="#10b981" glyphColor="#022c22" borderColor="#ecfdf5" />
              </AdvancedMarker>
            )}

            <RoutePolylineOverlay
              transportMode={transportMode}
              routeOrigin={pendingRouteOrigin}
              routeDest={pendingRouteDest}
              onRouteComputed={handleRouteComputed}
            />
          </GoogleMap>

          {/* Compact Radar Click Trigger + Label */}
          {!expanded && (
            <button
              type="button"
              onClick={() => onToggleExpand(true)}
              className="absolute inset-0 w-full h-full bg-transparent cursor-pointer flex items-end justify-between p-2"
              title="Abrir Mapa Tático (M)"
            >
              <span className="px-2 py-0.5 rounded bg-slate-950/90 text-[11px] font-semibold tracking-wide text-slate-200 border border-slate-700/80">
                MAPA [M]
              </span>
              <span className="p-1 rounded bg-slate-950/90 text-sky-400 border border-slate-700/80">
                <Navigation className="w-3 h-3" />
              </span>
            </button>
          )}

          {/* Expanded Footer Route Status */}
          {expanded && (
            <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
              <div className="pointer-events-auto px-4 py-2.5 rounded-xl bg-slate-950/92 border border-slate-700/80 text-xs md:text-sm text-slate-200 shadow-lg">
                {clickAction === 'route'
                  ? `Clique em qualquer rua no mapa (ou busque acima) para traçar uma rota ${
                      transportMode === 'moto' ? 'de moto' : transportMode === 'car' ? 'de carro' : 'a pé'
                    }.`
                  : 'Clique em qualquer ponto no mapa (ou busque acima) para ir até lá imediatamente.'}
              </div>

              {activeRoute && (
                <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-950/95 border border-emerald-500/60 text-emerald-100 shadow-lg">
                  <div className="text-xs md:text-sm">
                    <span className="font-bold">{activeRoute.destinationName}</span>
                    <span className="mx-2 text-emerald-400">•</span>
                    <span className="font-mono-tabular">
                      {formatDistance(activeRoute.totalDistanceMeters)}
                    </span>
                    <span className="mx-2 text-emerald-400">•</span>
                    <span className="font-mono-tabular">
                      ~{Math.max(1, Math.round(activeRoute.estimatedDurationSec / 60))} min{' '}
                      {transportMode === 'moto' ? 'de moto' : transportMode === 'car' ? 'de carro' : 'a pé'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={clearRoute}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-200 text-xs font-semibold"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
