export type CameraMode = 'first_person' | 'third_person';
export type TransportMode = 'walk' | 'moto' | 'car';
export type GamePhase = 'title' | 'playing' | 'paused' | 'arrived';
export type WalkSpeedMode = 'walk' | 'jog';

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

export interface CityPreset {
  id: string;
  name: string;
  city: string;
  country: string;
  tagline: string;
  location: LatLngLiteral;
  heading: number;
  accentColor: string;
}

export interface CollectibleToken {
  id: string;
  position: LatLngLiteral;
  label: string;
  collected: boolean;
  points: number;
}

export interface RoutePlan {
  destinationName: string;
  destination: LatLngLiteral;
  totalDistanceMeters: number;
  estimatedDurationSec: number;
  path: LatLngLiteral[];
}

export interface AdjacentLink {
  pano: string;
  heading: number;
  description: string;
}

export interface PlayerTelemetry {
  transportMode: TransportMode;
  position: LatLngLiteral;
  panoId: string;
  heading: number;
  pitch: number;
  zoom: number;
  strideProgress: number;
  speedMetersPerSec: number;
  isMoving: boolean;
  isJogging: boolean;
  distanceMeters: number;
  steps: number;
  tokensCollected: number;
  totalTokensSpawned: number;
  score: number;
  stamina: number; // 0..100
  currentStreet: string;
  links: AdjacentLink[];
  hasDeadEnd: boolean;
}
