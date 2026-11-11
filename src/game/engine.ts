import { Cell, GameState, BuildingCategory } from './types';

export const GRID_SIZE = 30;
export const TILE_SIZE = 4; // BIG tile size as requested
export const MAX_BUILDING_LEVEL = 3;

// Helper to get how many tiles a building takes based on level
export const getBuildingFootprint = (level: number) => {
  if (level === 1) return { w: 2, h: 2 }; // 4 blocks
  if (level === 2) return { w: 2, h: 3 }; // 6 blocks
  return { w: 2, h: 5 }; // 10 blocks (Skyscraper)
};

export const createInitialState = (): GameState => {
  const grid: Cell[][] = [];
  for (let z = 0; z < GRID_SIZE; z++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      // Lock everything except the middle 10x10 area
      const isLocked = x < 10 || x >= 20 || z < 10 || z >= 20;
      row.push({ category: 'empty', level: 0, x, z, isOrigin: false, isLocked });
    }
    grid.push(row);
  }
  return { 
    grid, money: 50000, population: 0, selectedTool: 'road', selectedBuilding: null 
  };
};

export const buyLand = (state: GameState, x: number, z: number): GameState => {
  if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return state;
  const cell = state.grid[z][x];
  if (!cell.isLocked) return state;

  const cost = 1000;
  if (state.money < cost) return state;

  const newGrid = state.grid.map(row => row.map(c => ({ ...c })));
  // Unlock a 3x3 area around the clicked tile
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx; const nz = z + dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
        newGrid[nz][nx].isLocked = false;
      }
    }
  }
  return { ...state, grid: newGrid, money: state.money - cost };
};

export const placeBuilding = (state: GameState, x: number, z: number, tool: BuildingCategory): GameState => {
  if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return state;
  const cell = state.grid[z][x];
  if (cell.isLocked || cell.category !== 'empty') return state;

  let footprint = { w: 1, h: 1 };
  let cost = 0;

  if (tool === 'road') {
    footprint = { w: 1, h: 1 }; // Roads stay 1x1 for smooth connections
    cost = 10;
  } else if (tool === 'residential') {
    footprint = getBuildingFootprint(1);
    cost = 500;
  } else if (tool === 'commercial') {
    footprint = getBuildingFootprint(1);
    cost = 800;
  } else if (tool === 'industrial') {
    footprint = getBuildingFootprint(1);
    cost = 600;
  }

  // Check if we have enough space
  for (let dz = 0; dz < footprint.h; dz++) {
    for (let dx = 0; dx < footprint.w; dx++) {
      const nx = x + dx; const nz = z + dz;
      if (nx >= GRID_SIZE || nz >= GRID_SIZE) return state;
      if (state.grid[nz][nx].category !== 'empty' || state.grid[nz][nx].isLocked) return state;
    }
  }

  if (state.money < cost) return state;

  const newGrid = state.grid.map(row => row.map(c => ({ ...c })));
  
  // Occupy the tiles
  for (let dz = 0; dz < footprint.h; dz++) {
    for (let dx = 0; dx < footprint.w; dx++) {
      newGrid[z + dz][x + dx].category = tool;
      newGrid[z + dz][x + dx].level = 1;
      newGrid[z + dz][x + dx].isOrigin = (dx === 0 && dz === 0);
    }
  }

  return { ...state, grid: newGrid, money: state.money - cost };
};

export const upgradeBuilding = (state: GameState, x: number, z: number): GameState => {
  const cell = state.grid[z][x];
  if (!cell.isOrigin || cell.category === 'road' || cell.category === 'empty' || cell.level >= MAX_BUILDING_LEVEL) return state;

  const upgradeCost = cell.level * 1000;
  if (state.money < upgradeCost) return state;

  const oldFootprint = getBuildingFootprint(cell.level);
  const newFootprint = getBuildingFootprint(cell.level + 1);

  // Check if we have room to expand (e.g., from 2x2 to 2x3)
  for (let dz = 0; dz < newFootprint.h; dz++) {
    for (let dx = 0; dx < newFootprint.w; dx++) {
      const nx = x + dx; const nz = z + dz;
      if (nx >= GRID_SIZE || nz >= GRID_SIZE) return state;
      // If it's expanding into a tile that isn't part of the old building, it must be empty
      if ((dx >= oldFootprint.w || dz >= oldFootprint.h) && state.grid[nz][nx].category !== 'empty') {
        return state; 
      }
    }
  }

  const newGrid = state.grid.map(row => row.map(c => ({ ...c })));
  
  // Clear old tiles
  for (let dz = 0; dz < oldFootprint.h; dz++) {
    for (let dx = 0; dx < oldFootprint.w; dx++) {
      newGrid[z + dz][x + dx].category = 'empty';
      newGrid[z + dz][x + dx].isOrigin = false;
    }
  }

  // Set new tiles
  for (let dz = 0; dz < newFootprint.h; dz++) {
    for (let dx = 0; dx < newFootprint.w; dx++) {
      newGrid[z + dz][x + dx].category = cell.category;
      newGrid[z + dz][x + dx].level = cell.level + 1;
      newGrid[z + dz][x + dx].isOrigin = (dx === 0 && dz === 0);
    }
  }

  return { ...state, grid: newGrid, money: state.money - upgradeCost };
};
