import * as THREE from 'three';

export type BuildingCategory = 'residential' | 'commercial' | 'industrial' | 'road' | 'empty';
export type VehicleType = 'car' | 'pedestrian';

export interface Cell {
  category: BuildingCategory;
  level: number;
  x: number;
  z: number;
  isOrigin: boolean; // True if this is the top-left tile of a multi-tile building
  isLocked: boolean; // True if the player hasn't bought this land
}

export interface GameState {
  grid: Cell[][];
  money: number;
  population: number;
  selectedTool: BuildingCategory;
  selectedBuilding: { x: number, z: number } | null;
}

export interface Agent {
  type: VehicleType;
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  progress: number;
  speed: number;
  mesh?: THREE.Object3D;
  modelIndex: number;
}
