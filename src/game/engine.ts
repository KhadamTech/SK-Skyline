import * as THREE from 'three';
import { Cell, GameState, BuildingType, Vehicle } from './types';

export const GRID_SIZE = 20;
export const TILE_SIZE = 4;

export const createInitialState = (): GameState => {
  const grid: Cell[][] = [];
  for (let z = 0; z < GRID_SIZE; z++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ type: 'empty', x, z });
    }
    grid.push(row);
  }
  return { grid, money: 50000, population: 0, selectedTool: 'road' };
};

export const placeBuilding = (state: GameState, x: number, z: number, tool: BuildingType): GameState => {
  if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return state;
  const newGrid = state.grid.map(row => row.map(cell => ({ ...cell })));
  const cell = newGrid[z][x];

  if (cell.type !== 'empty' && tool !== 'empty') return state;

  const costs: Record<BuildingType, number> = { empty: 0, road: 10, residential: 100, commercial: 150, industrial: 200 };
  if (state.money < costs[tool]) return state;

  cell.type = tool;
  let newPop = state.population;
  if (tool === 'residential') newPop += 10;

  return { ...state, grid: newGrid, money: state.money - costs[tool], population: newPop };
};
