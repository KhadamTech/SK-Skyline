import { Cell, GameState, BuildingType } from './types';

const GRID_SIZE = 20;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

export const createInitialState = (): GameState => {
  const grid: Cell[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ type: 'empty', level: 0, population: 0, x, y });
    }
    grid.push(row);
  }
  return {
    grid,
    money: 10000,
    population: 0,
    day: 1,
    selectedTool: 'road',
  };
};

// Helper: Convert grid coordinates to screen (isometric)
export const gridToScreen = (x: number, y: number) => ({
  screenX: (x - y) * (TILE_WIDTH / 2),
  screenY: (x + y) * (TILE_HEIGHT / 2),
});

// Helper: Convert screen to grid (inverse isometric)
export const screenToGrid = (screenX: number, screenY: number, offsetX: number, offsetY: number) => {
  const adjustedX = screenX - offsetX;
  const adjustedY = screenY - offsetY;
  const x = Math.floor((adjustedX / (TILE_WIDTH / 2) + adjustedY / (TILE_HEIGHT / 2)) / 2);
  const y = Math.floor((adjustedY / (TILE_HEIGHT / 2) - adjustedX / (TILE_WIDTH / 2)) / 2);
  return { x, y };
};

export const placeBuilding = (state: GameState, x: number, y: number, tool: BuildingType): GameState => {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return state;
  const newGrid = state.grid.map(row => row.map(cell => ({ ...cell })));
  const cell = newGrid[y][x];

  if (cell.type !== 'empty' && tool !== 'empty') return state;

  const costs: Record<BuildingType, number> = {
    empty: 0,
    road: 10,
    residential: 100,
    commercial: 150,
    industrial: 200,
  };

  const cost = costs[tool];
  if (state.money < cost) return state;

  cell.type = tool;
  cell.level = tool === 'empty' ? 0 : 1;

  let newPop = state.population;
  if (tool === 'residential') newPop += 4;
  if (tool === 'empty') newPop -= cell.population;

  return {
    ...state,
    grid: newGrid,
    money: state.money - cost,
    population: newPop,
  };
};
