
import type { Cell, GameState, BuildingType } from './types';

export const GRID_SIZE = 30;

export const TILE_WIDTH = 40;
export const TILE_HEIGHT = 20;

export const MAX_BUILDING_LEVEL = 5;

export const BUILDING_COSTS: Record<BuildingType, number> = {
  empty: 0,
  road: 10,
  residential: 100,
  commercial: 150,
  industrial: 200,
};

export const UPGRADE_COSTS: Record<BuildingType, number> = {
  empty: 0,
  road: 100,
  residential: 250,
  commercial: 400,
  industrial: 500,
};

export const createInitialState = (): GameState => {
  const grid: Cell[][] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Cell[] = [];

    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({
        type: 'empty',
        level: 0,
        population: 0,
        x,
        y,
      });
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

export const gridToScreen = (x: number, y: number) => ({
  screenX: (x - y) * (TILE_WIDTH / 2),
  screenY: (x + y) * (TILE_HEIGHT / 2),
});

export const screenToGrid = (
  screenX: number,
  screenY: number,
  offsetX: number,
  offsetY: number
) => {
  const adjustedX = screenX - offsetX;
  const adjustedY = screenY - offsetY;

  const x = Math.floor(
    (
      adjustedX / (TILE_WIDTH / 2) +
      adjustedY / (TILE_HEIGHT / 2)
    ) / 2
  );

  const y = Math.floor(
    (
      adjustedY / (TILE_HEIGHT / 2) -
      adjustedX / (TILE_WIDTH / 2)
    ) / 2
  );

  return { x, y };
};

export const getDailyIncome = (state: GameState): number => {
  let income = 0;

  for (const row of state.grid) {
    for (const cell of row) {
      if (cell.type === 'empty') continue;

      const level = Math.max(1, cell.level);

      switch (cell.type) {
        case 'road':
          income += level * 5;
          break;

        case 'residential':
          income += level * 12;
          break;

        case 'commercial':
          income += level * 45;
          break;

        case 'industrial':
          income += level * 65;
          break;
      }
    }
  }

  return income;
};

export const placeBuilding = (
  state: GameState,
  x: number,
  y: number,
  tool: BuildingType
): GameState => {
  if (
    x < 0 ||
    x >= GRID_SIZE ||
    y < 0 ||
    y >= GRID_SIZE ||
    tool === 'empty'
  ) {
    return state;
  }

  const cell = state.grid[y]?.[x];

  if (!cell || cell.type !== 'empty') {
    return state;
  }

  const cost = BUILDING_COSTS[tool];

  if (state.money < cost) {
    return state;
  }

  const newGrid = state.grid.map(row =>
    row.map(existing => ({ ...existing }))
  );

  newGrid[y][x] = {
    ...newGrid[y][x],
    type: tool,
    level: 1,
    population: tool === 'residential' ? 4 : 0,
  };

  return {
    ...state,
    grid: newGrid,
    money: state.money - cost,
    population:
      state.population +
      (tool === 'residential' ? 4 : 0),
  };
};

export const upgradeBuilding = (
  state: GameState,
  x: number,
  y: number
): GameState => {
  if (
    x < 0 ||
    x >= GRID_SIZE ||
    y < 0 ||
    y >= GRID_SIZE
  ) {
    return state;
  }

  const cell = state.grid[y]?.[x];

  if (!cell || cell.type === 'empty') {
    return state;
  }

  if (cell.level >= MAX_BUILDING_LEVEL) {
    return state;
  }

  const cost =
    UPGRADE_COSTS[cell.type] * cell.level;

  if (state.money < cost) {
    return state;
  }

  const newGrid = state.grid.map(row =>
    row.map(existing => ({ ...existing }))
  );

  const upgradedCell = newGrid[y][x];

  upgradedCell.level += 1;

  let populationIncrease = 0;

  if (upgradedCell.type === 'residential') {
    populationIncrease = 4;
    upgradedCell.population += populationIncrease;
  }

  return {
    ...state,
    grid: newGrid,
    money: state.money - cost,
    population: state.population + populationIncrease,
  };
};

export const collectDailyIncome = (
  state: GameState
): GameState => {
  const income = getDailyIncome(state);

  return {
    ...state,
    money: state.money + income,
    day: state.day + 1,
  };
};

export const getUpgradeCost = (
  type: BuildingType,
  level: number
): number => {
  if (
    type === 'empty' ||
    level < 1 ||
    level >= MAX_BUILDING_LEVEL
  ) {
    return 0;
  }

  return UPGRADE_COSTS[type] * level;
};
