import * as THREE from 'three';

export type Category = 'road' | 'building' | 'shop' | 'gov';
export type VehicleType = 'car' | 'pedestrian';

export interface Cell {
  category: Category | 'empty';
  level: number;
  x: number;
  z: number;
  isOrigin: boolean;
  isLocked: boolean;
}

export interface GameState {
  grid: Cell[][];
  money: number;
  population: number;
  selectedTool: Category;
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
}
