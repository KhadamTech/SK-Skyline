import * as THREE from 'three';

export type BuildingType = 'empty' | 'road' | 'residential' | 'commercial' | 'industrial';

export interface Cell {
  type: BuildingType;
  level: number;
  x: number;
  z: number;
}

export interface GameState {
  grid: Cell[][];
  money: number;
  population: number;
  income: number;
  selectedTool: BuildingType;
  selectedBuilding: { x: number, z: number } | null; 
}

export interface Vehicle {
  x: number;
  z: number;
  targetX: number;
  targetZ: number;
  progress: number;
  speed: number;
  mesh?: THREE.Object3D;
}
