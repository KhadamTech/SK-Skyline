export type BuildingType = 'empty' | 'road' | 'residential' | 'commercial' | 'industrial';

export interface Cell {
  type: BuildingType;
  level: number;
  population: number;
  x: number;
  y: number;
}

export interface GameState {
  grid: Cell[][];
  money: number;
  population: number;
  day: number;
  selectedTool: BuildingType;
}
