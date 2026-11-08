import { Cell, GameState, BuildingType } from './types';

export const GRID_SIZE = 20;
export const TILE_SIZE = 4;
export const MAX_BUILDING_LEVEL = 3;

export const createInitialState = (): GameState => {
  const grid: Cell[][] = [];
  for (let z = 0; z < GRID_SIZE; z++) {
    const row: Cell[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ type: 'empty', level: 0, x, z });
    }
    grid.push(row);
  }
  return { 
    grid, 
    money: 50000, 
    population: 0, 
    income: 0, 
    selectedTool: 'road',
    selectedBuilding: null 
  };
};

export const calculateEconomy = (grid: Cell[][]) => {
  let pop = 0;
  let inc = 0;
  grid.forEach(row => row.forEach(cell => {
    if (cell.type === 'residential') {
      pop += cell.level === 1 ? 10 : cell.level === 2 ? 25 : 50;
      inc += cell.level * 15; 
    }
    if (cell.type === 'commercial') inc += cell.level * 30;
    if (cell.type === 'industrial') inc += cell.level * 20;
  }));
  return { pop, inc };
};

export const getUpgradeCost = (level: number) => {
  return level * 500;
};

export const getDailyIncome = (cell: Cell) => {
  if (cell.type === 'residential') return cell.level * 15;
  if (cell.type === 'commercial') return cell.level * 30;
  if (cell.type === 'industrial') return cell.level * 20;
  return 0;
};

export const placeBuilding = (state: GameState, x: number, z: number, tool: BuildingType): GameState => {
  if (x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return state;
  
  const newGrid = state.grid.map(row => row.map(cell => ({ ...cell })));
  const cell = newGrid[z][x];

  if (tool === 'empty' || (cell.type !== 'empty' && tool !== 'empty')) return state;

  const costs: Record<BuildingType, number> = { empty: 0, road: 10, residential: 100, commercial: 150, industrial: 200 };
  if (state.money < costs[tool]) return state;

  cell.type = tool;
  cell.level = tool === 'road' ? 0 : 1; 

  const { pop, inc } = calculateEconomy(newGrid);

  return { ...state, grid: newGrid, money: state.money - costs[tool], population: pop, income: inc };
};

export const upgradeBuilding = (state: GameState, x: number, z: number): GameState => {
  const cell = state.grid[z][x];
  if (cell.type === 'empty' || cell.type === 'road' || cell.level >= MAX_BUILDING_LEVEL) return state;

  const upgradeCost = getUpgradeCost(cell.level);
  if (state.money < upgradeCost) return state;

  const newGrid = state.grid.map(row => row.map(c => ({ ...c })));
  newGrid[z][x].level += 1;

  const { pop, inc } = calculateEconomy(newGrid);
  return { ...state, grid: newGrid, money: state.money - upgradeCost, population: pop, income: inc };
};

export const collectDailyIncome = (state: GameState): GameState => {
  return { ...state, money: state.money + state.income };
};
