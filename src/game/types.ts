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
  // NEW: Tracks which building UI is currently open
  selectedBuilding: { x: number, z: number } | null; 
}
