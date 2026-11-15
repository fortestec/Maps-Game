import { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import type {
  AdjacentLink,
  CameraMode,
  CollectibleToken,
  GamePhase,
  LatLngLiteral,
  PlayerTelemetry,
  RoutePlan,
  TransportMode,
} from '../types/game';
import {
  angleDiff,
  computeBearing,
  haversineDistance,
  lerpLatLng,
  normalizeHeading,
  offsetLatLng,
  pickBestLink,
} from '../services/walkingEngine';
import { WorldOverlayScene } from '../three/worldOverlayScene';
import { soundEngine } from '../audio/soundEngine';

export interface VirtualInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jog: boolean;
}

interface StreetViewWorldProps {
  phase: GamePhase;
  transportMode: TransportMode;
  cameraMode: CameraMode;
  autoWalk: boolean;
  spawnRequest: { location: LatLngLiteral; heading: number; seq: number };
  tokens: CollectibleToken[];
  activeRoute: RoutePlan | null;
  virtualInputRef: React.MutableRefObject<VirtualInputState>;
  onTelemetryUpdate: (telemetry: PlayerTelemetry) => void;
  onTokenCollected: (tokenId: string) => void;
  onRouteArrived: () => void;
  onSelectTransportMode: (mode: TransportMode) => void;
  onToggleCameraMode: () => void;
  onToggleAutoWalk: () => void;
  onTogglePause: () => void;
  onToggleMapModal: () => void;
}

interface PanoBufferSlot {
  index: number;
  container: HTMLDivElement;
  pano: google.maps.StreetViewPanorama;
  requestedPano: string;
  loadedPano: string;
  ready: boolean;
  readyAtMs: number;
  position: LatLngLiteral;
  streetName: string;
  links: AdjacentLink[];
  listeners: google.maps.MapsEventListener[];
}

interface CachedPanoNode {
  pano: string;
  position: LatLngLiteral;
  streetName: string;
  links: AdjacentLink[];
}

const BUFFER_COUNT = 4;

const TRANSPORT_CONFIG: Record<
  TransportMode,
  {
    cruiseSpeed: number;
    boostSpeed: number;
    turnSpeedDeg: number;
    accelRate: number;
    brakeRate: number;
    readyGraceMs: number;
  }
> = {
  walk: {
    cruiseSpeed: 5.5, // ~20 km/h (caminhada ágil)
    boostSpeed: 11.5, // ~41 km/h (corrida com Shift)
    turnSpeedDeg: 118,
    accelRate: 18,
    brakeRate: 20,
    readyGraceMs: 190,
  },
  moto: {
    cruiseSpeed: 22.0, // ~79 km/h
    boostSpeed: 38.0, // ~137 km/h
    turnSpeedDeg: 128,
    accelRate: 9.5,
    brakeRate: 16,
    readyGraceMs: 160,
  },
  car: {
    cruiseSpeed: 26.5, // ~95 km/h
    boostSpeed: 48.0, // ~173 km/h
    turnSpeedDeg: 98,
    accelRate: 8.5,
    brakeRate: 15,
    readyGraceMs: 150,
  },
};

const STEP_STRIDE_METERS = 0.72;
const DEFAULT_SEGMENT_METERS = 11.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function StreetViewWorld({
  phase,
  transportMode,
  cameraMode,
  autoWalk,
  spawnRequest,
  tokens,
  activeRoute,
  virtualInputRef,
  onTelemetryUpdate,
  onTokenCollected,
  onRouteArrived,
  onSelectTransportMode,
  onToggleCameraMode,
  onToggleAutoWalk,
  onTogglePause,
  onToggleMapModal,
}: StreetViewWorldProps) {
  const streetViewLib = useMapsLibrary('streetView');
  const streetViewLibRef = useRef(streetViewLib);
  streetViewLibRef.current = streetViewLib;

  const containerRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const threeContainerRef = useRef<HTMLDivElement | null>(null);

  const buffersRef = useRef<PanoBufferSlot[] | null>(null);
  // Logical ring order: [0]=Front (N), [1]=Next (N+1), [2]=Lookahead1 (N+2), [3]=Lookahead2 (N+3)
  const slotOrderRef = useRef<number[]>([0, 1, 2, 3]);
  const svServiceRef = useRef<google.maps.StreetViewService | null>(null);
  const overlayRef = useRef<WorldOverlayScene | null>(null);

  // Graph metadata cache for multi-hop lookahead preloading along curved streets
  const panoGraphRef = useRef<Map<string, CachedPanoNode>>(new Map());
  const pendingMetaFetchRef = useRef<Set<string>>(new Set());

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const transportModeRef = useRef(transportMode);
  transportModeRef.current = transportMode;
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;
  const autoWalkRef = useRef(autoWalk);
  autoWalkRef.current = autoWalk;
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const activeRouteRef = useRef(activeRoute);
  activeRouteRef.current = activeRoute;

  const callbacksRef = useRef({
    onTelemetryUpdate,
    onTokenCollected,
    onRouteArrived,
    onSelectTransportMode,
    onToggleCameraMode,
    onToggleAutoWalk,
    onTogglePause,
    onToggleMapModal,
  });
  callbacksRef.current = {
    onTelemetryUpdate,
    onTokenCollected,
    onRouteArrived,
    onSelectTransportMode,
    onToggleCameraMode,
    onToggleAutoWalk,
    onTogglePause,
    onToggleMapModal,
  };

  const simRef = useRef({
    position: { ...spawnRequest.location },
    panoId: '',
    heading: spawnRequest.heading,
    pitch: 0,
    baseZoom: 0.9,
    strideProgress: 0,
    dissolveStartP: null as number | null,
    visualBlend: 0,
    currentSpeed: 0,
    lastMoveDir: 1 as 1 | -1,
    distanceMeters: 0,
    stepAccumulator: 0,
    steps: 0,
    score: 0,
    stamina: 100,
    currentStreet: 'Carregando rua...',
    links: [] as AdjacentLink[],
    hasDeadEnd: false,
    deadEndPushTimer: 0,
    hopInFlight: false,
    waitReadyTimer: 0,
    arrivedTriggered: false,
    titlePanOffset: 0,
    lastPreloadHeading: spawnRequest.heading,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const lastSpawnSeqRef = useRef(-1);

  const cachePanoNode = (node: CachedPanoNode) => {
    const cache = panoGraphRef.current;
    if (cache.size >= 260 && !cache.has(node.pano)) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    cache.set(node.pano, node);
  };

  // Apply zIndex hierarchy matching slotOrderRef: Front(4) -> Next(3) -> Look1(2) -> Look2(1)
  const applyLayerStackStyles = (buffers: PanoBufferSlot[], order: number[]) => {
    for (let role = 0; role < order.length; role++) {
      const slot = buffers[order[role]];
      slot.container.style.zIndex = String(BUFFER_COUNT - role);
      if (role > 0) {
        slot.container.style.opacity = '1';
      }
      if (role >= 2) {
        slot.container.style.transform = 'scale(0.985)';
      }
    }
  };

  // Fetch metadata for a future panorama node so we know its links 2-4 steps ahead
  const prefetchNodeMeta = (panoId: string, onResolved: () => void) => {
    const svService = svServiceRef.current;
    if (!svService) return;
    if (panoGraphRef.current.has(panoId) || pendingMetaFetchRef.current.has(panoId)) return;
    if (pendingMetaFetchRef.current.size >= 6) return;

    pendingMetaFetchRef.current.add(panoId);
    svService
      .getPanorama({ pano: panoId })
      .then(({ data }: google.maps.StreetViewResponse) => {
        const loc = data?.location;
        if (loc?.pano && loc.latLng) {
          const parsedLinks: AdjacentLink[] = (data.links || [])
            .filter(
              (l): l is google.maps.StreetViewLink =>
                Boolean(l && l.pano && l.heading !== null)
            )
            .map((l) => ({
              pano: l.pano as string,
              heading: normalizeHeading(l.heading as number),
              description: l.description || '',
            }));

          cachePanoNode({
            pano: loc.pano,
            position: { lat: loc.latLng.lat(), lng: loc.latLng.lng() },
            streetName: loc.description || loc.shortDescription || 'Via Urbana',
            links: parsedLinks,
          });
          onResolved();
        }
      })
      .catch((err: unknown) => {
        const msg = String(err ?? '');
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      })
      .finally(() => {
        pendingMetaFetchRef.current.delete(panoId);
      });
  };

  // Schedule N+1, N+2, and N+3 panoramas into the 3 pre-render buffers behind Front
  const scheduleMultiHopPreload = (desiredHeading: number) => {
    const buffers = buffersRef.current;
    if (!buffers) return;
    const order = slotOrderRef.current;
    const front = buffers[order[0]];
    const sim = simRef.current;

    sim.lastPreloadHeading = desiredHeading;

    // Walk up to 3 hops ahead along road curvature using front.links + panoGraphRef
    const targets: Array<{ pano: string; heading: number }> = [];
    let curPano = front.loadedPano;
    let curLinks = front.links;
    let curHeading = desiredHeading;

    for (let hop = 0; hop < 3; hop++) {
      const best = pickBestLink(curLinks, curHeading, hop === 0 ? 108 : 92);
      if (!best || best.pano === curPano || targets.some((t) => t.pano === best.pano)) {
        break;
      }
      targets.push({ pano: best.pano, heading: best.heading });

      const cached = panoGraphRef.current.get(best.pano);
      if (cached) {
        curPano = cached.pano;
        curLinks = cached.links;
        curHeading = best.heading;
      } else {
        // Trigger background metadata lookup so next hops become known immediately
        prefetchNodeMeta(best.pano, () => {
          scheduleMultiHopPreload(simRef.current.lastPreloadHeading);
        });
        break;
      }
    }

    if (targets.length === 0) {
      sim.hasDeadEnd = front.links.length > 0;
      return;
    }

    sim.hasDeadEnd = false;

    // If targets[0] (N+1) is ALREADY loaded in Lookahead1 or Lookahead2, promote it to role 1 immediately!
    const immediateTarget = targets[0];
    if (buffers[order[1]].requestedPano !== immediateTarget.pano) {
      for (let r = 2; r < order.length; r++) {
        const candidateSlot = buffers[order[r]];
        if (
          candidateSlot.loadedPano === immediateTarget.pano ||
          candidateSlot.requestedPano === immediateTarget.pano
        ) {
          const tmp = order[1];
          order[1] = order[r];
          order[r] = tmp;
          applyLayerStackStyles(buffers, order);
          break;
        }
      }
    }

    const graceMs = TRANSPORT_CONFIG[transportModeRef.current].readyGraceMs;

    // Assign each pre-render slot (role 1=Next, 2=Look1, 3=Look2)
    for (let r = 1; r < order.length; r++) {
      const target = targets[r - 1];
      if (!target) continue;
      const slot = buffers[order[r]];

      if (slot.requestedPano !== target.pano) {
        // Check if already sitting on that pano from an earlier visit
        if (slot.loadedPano === target.pano) {
          slot.requestedPano = target.pano;
          slot.ready = true;
          slot.readyAtMs = performance.now();
        } else {
          slot.requestedPano = target.pano;
          slot.ready = false;
          slot.readyAtMs = performance.now() + graceMs + r * 40;
          slot.pano.setPano(target.pano);
          slot.pano.setPov({ heading: sim.heading, pitch: sim.pitch });
          slot.pano.setZoom(Math.max(0.2, sim.baseZoom - 0.14));
        }
      }
    }

    // Also prefetch metadata 1 extra hop beyond our 3 buffers so it's cached ahead of time
    const lastTarget = targets[targets.length - 1];
    if (lastTarget) {
      const lastCached = panoGraphRef.current.get(lastTarget.pano);
      if (lastCached) {
        const hop4 = pickBestLink(lastCached.links, lastTarget.heading, 92);
        if (hop4) {
          prefetchNodeMeta(hop4.pano, () => {});
        }
      }
    }
  };

  // Initialize Three.js WebGL overlay once
  useEffect(() => {
    const threeEl = threeContainerRef.current;
    if (!threeEl) return;

    const overlay = new WorldOverlayScene(threeEl, (isJogging) => {
      if (phaseRef.current === 'playing') {
        soundEngine.playFootstep(isJogging);
      }
    });
    overlayRef.current = overlay;

    return () => {
      overlay.dispose();
      overlayRef.current = null;
    };
  }, []);

  // Initialize 4-Slot Ring Buffer Street View Panoramas
  useEffect(() => {
    if (!streetViewLib || buffersRef.current) return;
    const containers = containerRefs.current;
    if (containers.some((c) => !c)) return;

    const svService = new streetViewLib.StreetViewService();
    svServiceRef.current = svService;

    const createSlot = (container: HTMLDivElement, index: number): PanoBufferSlot => {
      const isFront = index === 0;
      const pano = new streetViewLib.StreetViewPanorama(container, {
        position: isFront ? simRef.current.position : undefined,
        pov: { heading: simRef.current.heading, pitch: 0 },
        zoom: isFront ? simRef.current.baseZoom : Math.max(0.2, simRef.current.baseZoom - 0.14),
        visible: true,
        disableDefaultUI: true,
        linksControl: false,
        clickToGo: false,
        panControl: false,
        zoomControl: false,
        addressControl: false,
        enableCloseButton: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
        showRoadLabels: false,
      });

      const slot: PanoBufferSlot = {
        index,
        container,
        pano,
        requestedPano: '',
        loadedPano: '',
        ready: false,
        readyAtMs: 0,
        position: { ...simRef.current.position },
        streetName: 'Via Urbana',
        links: [],
        listeners: [],
      };

      const syncSlotMeta = () => {
        const loc = pano.getLocation();
        const pos = pano.getPosition();
        if (pos) {
          slot.position = { lat: pos.lat(), lng: pos.lng() };
        }
        if (loc) {
          slot.loadedPano = loc.pano || pano.getPano();
          slot.streetName = loc.description || loc.shortDescription || 'Via Urbana';
        }

        if (!slot.requestedPano || slot.loadedPano === slot.requestedPano) {
          slot.readyAtMs =
            performance.now() + TRANSPORT_CONFIG[transportModeRef.current].readyGraceMs;
          slot.ready = true;
        }

        if (slot.loadedPano && slot.links.length > 0) {
          cachePanoNode({
            pano: slot.loadedPano,
            position: { ...slot.position },
            streetName: slot.streetName,
            links: slot.links,
          });
        }

        const buffers = buffersRef.current;
        if (buffers && buffers[slotOrderRef.current[0]] === slot) {
          simRef.current.position = { ...slot.position };
          simRef.current.panoId = slot.loadedPano;
          simRef.current.currentStreet = slot.streetName;
        }
      };

      const syncSlotLinks = () => {
        const rawLinks = pano.getLinks() || [];
        slot.links = rawLinks
          .filter(
            (l): l is google.maps.StreetViewLink =>
              Boolean(l && l.pano && l.heading !== null)
          )
          .map((l) => ({
            pano: l.pano as string,
            heading: normalizeHeading(l.heading as number),
            description: l.description || '',
          }));

        if (slot.loadedPano && slot.links.length > 0) {
          cachePanoNode({
            pano: slot.loadedPano,
            position: { ...slot.position },
            streetName: slot.streetName,
            links: slot.links,
          });
        }

        const buffers = buffersRef.current;
        if (buffers && buffers[slotOrderRef.current[0]] === slot) {
          simRef.current.links = slot.links;
          const moveDirHeading =
            simRef.current.lastMoveDir > 0
              ? simRef.current.heading
              : normalizeHeading(simRef.current.heading + 180);
          scheduleMultiHopPreload(moveDirHeading);
        } else if (buffers && slot.links.length > 0) {
          // A lookahead slot just resolved its links — extend the preload chain further!
          scheduleMultiHopPreload(simRef.current.lastPreloadHeading);
        }
      };

      const l1 = pano.addListener('pano_changed', syncSlotMeta);
      const l2 = pano.addListener('position_changed', syncSlotMeta);
      const l3 = pano.addListener('links_changed', syncSlotLinks);
      const l4 = pano.addListener('status_changed', () => {
        const status = String(pano.getStatus());
        if (status === 'OVER_QUERY_LIMIT') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        } else if (status === 'OK') {
          if (!slot.requestedPano || slot.loadedPano === slot.requestedPano) {
            slot.ready = true;
          }
        }
      });

      slot.listeners.push(l1, l2, l3, l4);
      return slot;
    };

    const created = containers.map((el, idx) => createSlot(el!, idx));
    slotOrderRef.current = [0, 1, 2, 3];
    applyLayerStackStyles(created, slotOrderRef.current);
    created[0].container.style.opacity = '1';
    created[0].container.style.transform = 'scale(1)';

    buffersRef.current = created;

    return () => {
      for (const s of created) {
        s.listeners.forEach((l) => l.remove());
      }
      buffersRef.current = null;
      svServiceRef.current = null;
    };
  }, [streetViewLib]);

  // Handle teleport / city preset spawn requests
  useEffect(() => {
    if (spawnRequest.seq === lastSpawnSeqRef.current) return;
    const buffers = buffersRef.current;
    const svService = svServiceRef.current;
    const svLib = streetViewLibRef.current;
    if (!buffers || !svService || !svLib) return;

    lastSpawnSeqRef.current = spawnRequest.seq;
    const sim = simRef.current;
    sim.heading = spawnRequest.heading;
    sim.pitch = 0;
    sim.strideProgress = 0;
    sim.dissolveStartP = null;
    sim.visualBlend = 0;
    sim.currentSpeed = 0;
    sim.hasDeadEnd = false;
    sim.arrivedTriggered = false;
    sim.lastPreloadHeading = spawnRequest.heading;

    slotOrderRef.current = [0, 1, 2, 3];
    applyLayerStackStyles(buffers, slotOrderRef.current);

    const front = buffers[0];
    front.container.style.opacity = '1';
    front.container.style.transform = 'scale(1)';
    for (let i = 1; i < BUFFER_COUNT; i++) {
      buffers[i].requestedPano = '';
      buffers[i].ready = false;
    }

    svService
      .getPanorama({
        location: spawnRequest.location,
        radius: 120,
        preference: svLib.StreetViewPreference.NEAREST,
        source: svLib.StreetViewSource.OUTDOOR,
      })
      .then(({ data }: google.maps.StreetViewResponse) => {
        if (data?.location?.pano) {
          front.requestedPano = data.location.pano;
          front.pano.setPano(data.location.pano);
          front.pano.setPov({ heading: spawnRequest.heading, pitch: 0 });
          front.pano.setZoom(sim.baseZoom);
          if (data.location.latLng) {
            sim.position = {
              lat: data.location.latLng.lat(),
              lng: data.location.latLng.lng(),
            };
            front.position = { ...sim.position };
          }
          sim.currentStreet =
            data.location.description || data.location.shortDescription || 'Via Urbana';
        }
      })
      .catch((err: unknown) => {
        const msg = String(err ?? '');
        if (msg.includes('OVER_QUERY_LIMIT') || msg.includes('RESOURCE_EXHAUSTED')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        } else {
          front.pano.setPosition(spawnRequest.location);
          front.pano.setPov({ heading: spawnRequest.heading, pitch: 0 });
        }
      });
  }, [spawnRequest, streetViewLib]);

  useEffect(() => {
    simRef.current.arrivedTriggered = false;
  }, [activeRoute]);

  // Keyboard & Window Blur Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (e.code === 'Escape') {
        if (phaseRef.current === 'playing' || phaseRef.current === 'paused') {
          e.preventDefault();
          callbacksRef.current.onTogglePause();
        }
        return;
      }

      if (phaseRef.current !== 'playing') return;

      if (e.code === 'KeyV' && !e.repeat) {
        e.preventDefault();
        callbacksRef.current.onToggleCameraMode();
        return;
      }
      if (e.code === 'Digit1' && !e.repeat) {
        e.preventDefault();
        callbacksRef.current.onSelectTransportMode('walk');
        return;
      }
      if (e.code === 'Digit2' && !e.repeat) {
        e.preventDefault();
        callbacksRef.current.onSelectTransportMode('moto');
        return;
      }
      if (e.code === 'Digit3' && !e.repeat) {
        e.preventDefault();
        callbacksRef.current.onSelectTransportMode('car');
        return;
      }
      if (e.code === 'KeyF' && !e.repeat) {
        e.preventDefault();
        soundEngine.playHorn(transportModeRef.current);
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        callbacksRef.current.onToggleAutoWalk();
        return;
      }
      if (e.code === 'KeyM' && !e.repeat) {
        e.preventDefault();
        callbacksRef.current.onToggleMapModal();
        return;
      }

      keysRef.current[e.code] = true;
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    const onBlur = () => {
      keysRef.current = {};
      dragRef.current.active = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Main 60fps Ring-Buffer Pre-Rendered Exploration Loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let lastTelemetryPush = 0;

    const rotateRingBuffer = (moveHeading: number) => {
      const buffers = buffersRef.current;
      if (!buffers) return;
      const sim = simRef.current;
      const order = slotOrderRef.current;

      // Rotate ring: [oldFront, next, look1, look2] -> [next, look1, look2, oldFront]
      const oldFrontIdx = order.shift()!;
      order.push(oldFrontIdx);

      const newFront = buffers[order[0]];
      const recycledBack = buffers[oldFrontIdx];

      sim.strideProgress = 0;
      sim.dissolveStartP = null;
      sim.visualBlend = 0;
      sim.waitReadyTimer = 0;
      sim.hasDeadEnd = false;
      sim.deadEndPushTimer = 0;

      // New front is already at opacity 1 & scale 1 underneath; just elevate zIndex!
      applyLayerStackStyles(buffers, order);
      newFront.container.style.opacity = '1';
      newFront.container.style.transform = 'scale(1)';
      newFront.pano.setZoom(sim.baseZoom);

      // Clear recycled back slot request so scheduleMultiHopPreload assigns N+3 immediately
      recycledBack.requestedPano = '';
      recycledBack.ready = false;

      // Sync real GPS, panoId & links from the promoted node (fallback to cached graph links if needed)
      const cachedFront = panoGraphRef.current.get(newFront.loadedPano || newFront.requestedPano);
      if (newFront.links.length === 0 && cachedFront?.links.length) {
        newFront.links = cachedFront.links;
      }
      sim.position = { ...newFront.position };
      sim.panoId = newFront.loadedPano;
      sim.currentStreet = newFront.streetName;
      sim.links = newFront.links;

      // Immediately schedule N+1, N+2, N+3 ahead along the road!
      scheduleMultiHopPreload(moveHeading);
    };

    const tryFallbackSpatialHop = (moveHeading: number) => {
      const sim = simRef.current;
      const svService = svServiceRef.current;
      const svLib = streetViewLibRef.current;
      const buffers = buffersRef.current;
      if (!svService || !svLib || !buffers || sim.hopInFlight) return;

      const nextSlot = buffers[slotOrderRef.current[1]];
      sim.hopInFlight = true;
      sim.deadEndPushTimer = 0;
      const probeLoc = offsetLatLng(sim.position, moveHeading, 18);

      svService
        .getPanorama({
          location: probeLoc,
          radius: 36,
          preference: svLib.StreetViewPreference.NEAREST,
          source: svLib.StreetViewSource.OUTDOOR,
        })
        .then(({ data }: google.maps.StreetViewResponse) => {
          if (data?.location?.pano && data.location.pano !== sim.panoId) {
            nextSlot.requestedPano = data.location.pano;
            nextSlot.ready = false;
            nextSlot.readyAtMs =
              performance.now() + TRANSPORT_CONFIG[transportModeRef.current].readyGraceMs;
            nextSlot.pano.setPano(data.location.pano);
            nextSlot.pano.setPov({ heading: sim.heading, pitch: sim.pitch });
            nextSlot.pano.setZoom(Math.max(0.2, sim.baseZoom - 0.14));
            sim.lastPreloadHeading = moveHeading;
            sim.hasDeadEnd = false;
          }
        })
        .catch(() => {
          // Stay cleanly at curb if no nearby outdoor street exists
        })
        .finally(() => {
          sim.hopInFlight = false;
        });
    };

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const sim = simRef.current;
      const buffers = buffersRef.current;
      const keys = keysRef.current;
      const vIn = virtualInputRef.current;
      const mode = transportModeRef.current;
      const cfg = TRANSPORT_CONFIG[mode];

      let isMoving = false;
      let isJogging = false;
      let isBraking = false;
      let moveDir = 0;
      let turnInput = 0;
      let speed = 0;

      if (phaseRef.current === 'title') {
        sim.currentSpeed = 0;
        soundEngine.updateEngineAudio(mode, 0, false, false);
        sim.titlePanOffset += dt * 4.5;
        if (buffers) {
          const front = buffers[slotOrderRef.current[0]];
          front.pano.setPov({
            heading: normalizeHeading(
              sim.heading + Math.sin(sim.titlePanOffset * 0.12) * 18
            ),
            pitch: 2,
          });
        }
      } else if (phaseRef.current !== 'playing') {
        soundEngine.updateEngineAudio(mode, 0, false, false);
      } else if (phaseRef.current === 'playing' && buffers) {
        const order = slotOrderRef.current;
        const front = buffers[order[0]];
        const nextSlot = buffers[order[1]];

        const moveFwd =
          keys['KeyW'] || keys['ArrowUp'] || vIn.forward || autoWalkRef.current;
        const moveBack = keys['KeyS'] || keys['ArrowDown'] || vIn.backward;
        const turnLeft = keys['KeyA'] || keys['ArrowLeft'] || vIn.left;
        const turnRight = keys['KeyD'] || keys['ArrowRight'] || vIn.right;
        const wantBoost = keys['ShiftLeft'] || keys['ShiftRight'] || vIn.jog;

        const dir = (moveFwd ? 1 : 0) - (moveBack ? 1 : 0);
        moveDir = dir;
        isBraking = dir < 0;

        if (turnLeft && !turnRight) {
          turnInput = -1;
          sim.heading = normalizeHeading(sim.heading - cfg.turnSpeedDeg * dt);
        } else if (turnRight && !turnLeft) {
          turnInput = 1;
          sim.heading = normalizeHeading(sim.heading + cfg.turnSpeedDeg * dt);
        }

        const moveHeading =
          dir < 0 ? normalizeHeading(sim.heading + 180) : sim.heading;

        // If player turned significantly or reversed direction, re-route the 3-hop preload queue
        if (
          (dir !== 0 && dir !== sim.lastMoveDir) ||
          Math.abs(angleDiff(moveHeading, sim.lastPreloadHeading)) > 24
        ) {
          sim.lastMoveDir = dir < 0 ? -1 : 1;
          sim.dissolveStartP = null;
          scheduleMultiHopPreload(moveHeading);
        }

        const nextHasTarget = Boolean(
          nextSlot.requestedPano && nextSlot.requestedPano !== front.loadedPano
        );
        const nextIsReady = nextHasTarget && nextSlot.ready && now >= nextSlot.readyAtMs;

        // Real-world GPS distance between Front and Next node for exact optical pacing
        const cachedNext = nextHasTarget ? panoGraphRef.current.get(nextSlot.requestedPano) : undefined;
        const nextPos =
          nextSlot.loadedPano === nextSlot.requestedPano
            ? nextSlot.position
            : cachedNext?.position;
        const rawGap = nextPos ? haversineDistance(front.position, nextPos) : DEFAULT_SEGMENT_METERS;
        const segmentMeters = rawGap >= 6 && rawGap <= 28 ? rawGap : DEFAULT_SEGMENT_METERS;

        let targetSpeed = 0;
        sim.stamina = 100;
        if (dir !== 0) {
          if (wantBoost) {
            isJogging = true;
            targetSpeed = dir < 0 ? cfg.cruiseSpeed * 0.55 : cfg.boostSpeed;
          } else {
            targetSpeed = dir < 0 ? cfg.cruiseSpeed * 0.5 : cfg.cruiseSpeed;
          }
        }

        // Smooth acceleration & braking
        const rate = targetSpeed > sim.currentSpeed ? cfg.accelRate : cfg.brakeRate;
        sim.currentSpeed =
          sim.currentSpeed +
          (targetSpeed - sim.currentSpeed) * (1 - Math.exp(-rate * dt));
        if (dir === 0 && sim.currentSpeed < 0.08) {
          sim.currentSpeed = 0;
        }
        speed = sim.currentSpeed;
        isMoving = speed > 0.15;

        soundEngine.updateEngineAudio(
          mode,
          speed / cfg.boostSpeed,
          isJogging,
          phaseRef.current === 'playing'
        );

        if (isMoving) {
          const activeHeading =
            dir !== 0
              ? moveHeading
              : sim.lastMoveDir < 0
                ? normalizeHeading(sim.heading + 180)
                : sim.heading;

          // Gentle road-curve auto-alignment when steering isn't actively held
          if (
            (dir > 0 || (dir === 0 && sim.lastMoveDir > 0)) &&
            turnInput === 0 &&
            !dragRef.current.active
          ) {
            const guideLink = pickBestLink(front.links, sim.heading, 42);
            if (guideLink) {
              const diff = angleDiff(guideLink.heading, sim.heading);
              if (Math.abs(diff) > 1.5) {
                sim.heading = normalizeHeading(
                  sim.heading + diff * (1 - Math.exp(-2.1 * dt))
                );
              }
            }
          }

          const dMeters = speed * dt;

          if (!nextHasTarget) {
            sim.hasDeadEnd = true;
            sim.deadEndPushTimer += dt;
            sim.currentSpeed *= 0.86;
            sim.strideProgress = Math.min(
              0.42,
              sim.strideProgress + (dMeters / segmentMeters) * 0.4
            );
            if (sim.deadEndPushTimer > 0.35) {
              tryFallbackSpatialHop(activeHeading);
            }
          } else {
            sim.hasDeadEnd = false;
            sim.distanceMeters += dMeters;
            if (mode === 'walk') {
              sim.stepAccumulator += dMeters;
              while (sim.stepAccumulator >= STEP_STRIDE_METERS) {
                sim.stepAccumulator -= STEP_STRIDE_METERS;
                sim.steps += 1;
              }
            }

            const nextProgress = sim.strideProgress + dMeters / segmentMeters;
            if (nextProgress >= 0.92 && !nextIsReady && sim.waitReadyTimer < 1.8) {
              // Hold cleanly while the back buffer finishes rasterizing tiles so it NEVER pops!
              sim.waitReadyTimer += dt;
              sim.strideProgress = 0.92;
            } else {
              sim.strideProgress = Math.min(1.0, nextProgress);
            }

            // Smooth GPS interpolation directly toward Next node (0.0m jump on swap!)
            sim.position = nextPos
              ? lerpLatLng(front.position, nextPos, sim.strideProgress)
              : offsetLatLng(front.position, activeHeading, sim.strideProgress * segmentMeters);

            if (sim.strideProgress >= 1.0 && (nextIsReady || sim.waitReadyTimer >= 1.8)) {
              rotateRingBuffer(activeHeading);
            }
          }
        } else {
          sim.strideProgress = Math.max(0, sim.strideProgress - dt * 1.4);
          sim.deadEndPushTimer = 0;
          sim.waitReadyTimer = 0;
          if (sim.strideProgress < 0.05) {
            sim.dissolveStartP = null;
          }
        }

        // Apply 60fps Multi-Buffer Optical Dolly & Continuous Cross-Dissolve (Zero Jumps!)
        const activeFront = buffers[slotOrderRef.current[0]];
        const activeNext = buffers[slotOrderRef.current[1]];

        const headBobPitch =
          isMoving && cameraModeRef.current === 'first_person'
            ? mode === 'walk'
              ? Math.sin(now * (isJogging ? 0.017 : 0.011)) * (isJogging ? 0.85 : 0.45)
              : Math.sin(now * 0.032) * 0.12
            : 0;
        const povPayload = {
          heading: sim.heading,
          pitch: sim.pitch + headBobPitch,
        };

        const p = sim.strideProgress;
        const canDissolve = Boolean(
          activeNext.requestedPano &&
            activeNext.ready &&
            now >= activeNext.readyAtMs
        );

        let targetBlend = 0;
        if (canDissolve) {
          if (sim.dissolveStartP === null) {
            sim.dissolveStartP = Math.min(0.72, Math.max(0.14, p));
          }
          targetBlend = smoothstep(sim.dissolveStartP, 0.98, p);
        }

        // Smooth visualBlend prevents any 1-frame opacity snap even if readiness arrives mid-stride
        sim.visualBlend =
          sim.visualBlend + (targetBlend - sim.visualBlend) * (1 - Math.exp(-22 * dt));
        const blend = sim.visualBlend;

        if (sim.lastMoveDir >= 0) {
          const frontZoom = sim.baseZoom + p * 0.65;
          const frontScale = 1 + p * 0.06;
          activeFront.pano.setPov(povPayload);
          activeFront.pano.setZoom(frontZoom);
          activeFront.container.style.opacity = String(1 - blend);
          activeFront.container.style.transform = `scale(${frontScale.toFixed(4)})`;

          const backBaseZoom = Math.max(0.2, sim.baseZoom - 0.14);
          const backZoom = backBaseZoom + blend * (sim.baseZoom - backBaseZoom);
          const backScale = 0.985 + blend * 0.015;
          activeNext.pano.setPov(povPayload);
          activeNext.pano.setZoom(backZoom);
          activeNext.container.style.opacity = '1';
          activeNext.container.style.transform = `scale(${backScale.toFixed(4)})`;
        } else {
          const frontZoom = Math.max(0.2, sim.baseZoom - p * 0.36);
          const frontScale = 1 - p * 0.04;
          activeFront.pano.setPov(povPayload);
          activeFront.pano.setZoom(frontZoom);
          activeFront.container.style.opacity = String(1 - blend);
          activeFront.container.style.transform = `scale(${frontScale.toFixed(4)})`;

          const backZoom = sim.baseZoom + 0.22 * (1 - blend);
          const backScale = 1.03 - blend * 0.03;
          activeNext.pano.setPov(povPayload);
          activeNext.pano.setZoom(backZoom);
          activeNext.container.style.opacity = '1';
          activeNext.container.style.transform = `scale(${backScale.toFixed(4)})`;
        }

        // Check collectible tokens proximity (<= 26m)
        for (const token of tokensRef.current) {
          if (!token.collected) {
            const dist = haversineDistance(sim.position, token.position);
            if (dist <= 26) {
              const bRad = (computeBearing(sim.position, token.position) * Math.PI) / 180;
              overlayRef.current?.spawnBurst(
                Math.sin(bRad) * Math.min(dist, 12),
                1.5,
                -Math.cos(bRad) * Math.min(dist, 12),
                0xfbbf24
              );
              soundEngine.playTokenCollect();
              callbacksRef.current.onTokenCollected(token.id);
            }
          }
        }

        // Check active route arrival (<= 30m)
        if (activeRouteRef.current && !sim.arrivedTriggered) {
          const destDist = haversineDistance(sim.position, activeRouteRef.current.destination);
          if (destDist <= 30) {
            sim.arrivedTriggered = true;
            soundEngine.playArrivalFanfare();
            callbacksRef.current.onRouteArrived();
          }
        }
      }

      // Sync Three.js 3D Overlay every frame
      overlayRef.current?.updateSync({
        transportMode: mode,
        cameraMode: cameraModeRef.current,
        playerPos: sim.position,
        heading:
          phaseRef.current === 'title'
            ? normalizeHeading(sim.heading + Math.sin(sim.titlePanOffset * 0.12) * 18)
            : sim.heading,
        pitch: sim.pitch,
        zoom: sim.baseZoom + sim.strideProgress * 0.35,
        speedMetersPerSec: speed,
        moveDir,
        isMoving,
        isJogging,
        isBraking,
        turnInput,
        tokens: tokensRef.current,
        links: sim.links,
        activeRoute: activeRouteRef.current,
      });

      // Push React HUD telemetry at ~12Hz
      if (now - lastTelemetryPush > 80) {
        lastTelemetryPush = now;
        const collectedCount = tokensRef.current.filter((t) => t.collected).length;
        const score = tokensRef.current
          .filter((t) => t.collected)
          .reduce((acc, t) => acc + t.points, 0);

        callbacksRef.current.onTelemetryUpdate({
          transportMode: mode,
          position: sim.position,
          panoId: sim.panoId,
          heading: sim.heading,
          pitch: sim.pitch,
          zoom: sim.baseZoom + sim.strideProgress * 0.35,
          strideProgress: sim.strideProgress,
          speedMetersPerSec: speed,
          isMoving,
          isJogging,
          distanceMeters: sim.distanceMeters,
          steps: sim.steps,
          tokensCollected: collectedCount,
          totalTokensSpawned: tokensRef.current.length,
          score,
          stamina: sim.stamina,
          currentStreet: sim.currentStreet,
          links: sim.links,
          hasDeadEnd: sim.hasDeadEnd,
        });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [virtualInputRef]);

  // Smooth mouse/touch drag to look around 360 degrees
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing') return;
    soundEngine.unlock();
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active || phase !== 'playing') return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;

    simRef.current.heading = normalizeHeading(simRef.current.heading - dx * 0.24);
    simRef.current.pitch = Math.max(-55, Math.min(55, simRef.current.pitch + dy * 0.18));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (phase !== 'playing') return;
    const nextZoom = simRef.current.baseZoom - e.deltaY * 0.0012;
    simRef.current.baseZoom = Math.max(0.45, Math.min(1.65, nextZoom));
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* 4-Slot Ring Buffer Pre-Rendering Google Street View Panoramas (Front + 3 Lookahead Buffers) */}
      {[0, 1, 2, 3].map((idx) => (
        <div
          key={idx}
          ref={(el) => {
            containerRefs.current[idx] = el;
          }}
          className="absolute inset-0 w-full h-full will-change-[opacity,transform]"
          aria-label={`Google Street View Buffer ${idx + 1}`}
        />
      ))}

      {/* Transparent Three.js 3D Character, Vehicle & World Beacons Overlay */}
      <div
        ref={threeContainerRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* Unified Camera Look Interaction Layer */}
      <div
        className={`absolute inset-0 z-20 ${
          phase === 'playing' ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />
    </div>
  );
}
