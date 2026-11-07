
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  createInitialState,
  placeBuilding,
  screenToGrid,
  upgradeBuilding,
  collectDailyIncome,
  getDailyIncome,
  getUpgradeCost,
  MAX_BUILDING_LEVEL,
  GRID_SIZE,
} from '../game/engine';

import type {
  GameState,
  BuildingType,
  Cell,
} from '../game/types';

const SAVE_KEY = 'sk-skyline-city-save-v1';

const WIDTH = 1280;
const HEIGHT = 720;

const OFFSET_X = 640;
const OFFSET_Y = 100;

const tools: {
  id: BuildingType;
  label: string;
  icon: string;
  cost: number;
}[] = [
  { id: 'road', label: 'Road', icon: '🛣️', cost: 10 },
  { id: 'residential', label: 'Homes', icon: '🏠', cost: 100 },
  { id: 'commercial', label: 'Shops', icon: '🏬', cost: 150 },
  { id: 'industrial', label: 'Industry', icon: '🏭', cost: 200 },
];

function migrateSavedCity(parsed: GameState): GameState {
  const fresh = createInitialState();

  if (!Array.isArray(parsed.grid)) {
    return fresh;
  }

  const grid = fresh.grid.map((row, y) =>
    row.map((cell, x) => {
      const oldCell = parsed.grid[y]?.[x];

      if (!oldCell || !oldCell.type) {
        return cell;
      }

      return {
        ...cell,
        type: oldCell.type,
        level: Math.max(0, Number(oldCell.level) || 0),
        population: Math.max(
          0,
          Number(oldCell.population) || 0
        ),
      };
    })
  );

  return {
    ...fresh,
    grid,
    money:
      typeof parsed.money === 'number'
        ? parsed.money
        : fresh.money,
    population:
      typeof parsed.population === 'number'
        ? parsed.population
        : fresh.population,
    day:
      typeof parsed.day === 'number'
        ? parsed.day
        : fresh.day,
    selectedTool: parsed.selectedTool || 'road',
  };
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  sx: number,
  sy: number,
  selected: boolean
) {
  const level = Math.max(1, cell.level);
  const height = 22 + level * 12;

  let leftColor = '#24734f';
  let rightColor = '#18563d';
  let roofColor = '#43a878';
  let windowColor = '#ffe7a3';

  if (cell.type === 'commercial') {
    leftColor = '#286ba5';
    rightColor = '#174a7a';
    roofColor = '#4898d3';
  }

  if (cell.type === 'industrial') {
    leftColor = '#a96b37';
    rightColor = '#794523';
    roofColor = '#d69a55';
  }

  if (cell.type === 'road') {
    leftColor = '#596474';
    rightColor = '#3d4654';
    roofColor = '#8993a0';
  }

  const baseY = sy + 8;
  const topY = baseY - height;

  // Building shadow.
  ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
  ctx.beginPath();
  ctx.ellipse(
    sx + 5,
    baseY + 9,
    22 + level * 2,
    9,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Left wall.
  ctx.beginPath();
  ctx.moveTo(sx - 13, topY + 7);
  ctx.lineTo(sx, topY + 14);
  ctx.lineTo(sx, baseY + 8);
  ctx.lineTo(sx - 13, baseY);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();

  // Right wall.
  ctx.beginPath();
  ctx.moveTo(sx + 13, topY + 7);
  ctx.lineTo(sx, topY + 14);
  ctx.lineTo(sx, baseY + 8);
  ctx.lineTo(sx + 13, baseY);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();

  // Roof.
  ctx.beginPath();
  ctx.moveTo(sx, topY);
  ctx.lineTo(sx + 13, topY + 7);
  ctx.lineTo(sx, topY + 14);
  ctx.lineTo(sx - 13, topY + 7);
  ctx.closePath();
  ctx.fillStyle = roofColor;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Windows on left wall.
  const floors = Math.min(level + 1, 5);

  for (let floor = 0; floor < floors; floor++) {
    const wy = topY + 17 + floor * 10;

    if (wy < baseY - 3) {
      ctx.fillStyle = windowColor;
      ctx.fillRect(sx - 10, wy, 3, 5);
      ctx.fillRect(sx - 4, wy + 3, 3, 5);
    }
  }

  // Windows on right wall.
  for (let floor = 0; floor < floors; floor++) {
    const wy = topY + 17 + floor * 10;

    if (wy < baseY - 3) {
      ctx.fillStyle = windowColor;
      ctx.fillRect(sx + 3, wy + 3, 3, 5);
      ctx.fillRect(sx + 9, wy, 3, 5);
    }
  }

  // Rooftop equipment.
  if (cell.type === 'industrial') {
    ctx.fillStyle = '#687786';
    ctx.fillRect(sx - 5, topY - 8, 5, 8);
    ctx.fillRect(sx + 3, topY - 5, 5, 5);
  } else if (cell.type === 'commercial') {
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(sx - 3, topY - 5, 6, 5);
  } else {
    ctx.fillStyle = '#d1fae5';
    ctx.fillRect(sx - 2, topY - 4, 4, 4);
  }

  // Level badge.
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.arc(sx + 18, topY - 3, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(String(level), sx + 18, topY + 1);

  // Selection highlight.
  if (selected) {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + 20, sy + 10);
    ctx.lineTo(sx, sy + 20);
    ctx.lineTo(sx - 20, sy + 10);
    ctx.closePath();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [state, setState] = useState<GameState>(
    createInitialState()
  );

  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);

  const [selectedCell, setSelectedCell] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [notice, setNotice] = useState('');

  // Load and migrate saved city.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved) as GameState;
        setState(migrateSavedCity(parsed));
      }
    } catch {
      console.warn('Could not load saved SK Skyline city.');
    }

    setReady(true);
  }, []);

  // Save game locally.
  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      console.warn('Could not save SK Skyline city.');
    }
  }, [state, ready]);

  // Internet status.
  useEffect(() => {
    const updateConnection = () => {
      setOnline(navigator.onLine);
    };

    updateConnection();

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);

  const income = getDailyIncome(state);

  const selectedBuilding =
    selectedCell
      ? state.grid[selectedCell.y]?.[selectedCell.x]
      : null;

  const upgradeCost =
    selectedBuilding &&
    selectedBuilding.type !== 'empty'
      ? getUpgradeCost(
          selectedBuilding.type,
          selectedBuilding.level
        )
      : 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2
    );

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(
      canvas.width / WIDTH,
      0,
      0,
      canvas.height / HEIGHT,
      0,
      0
    );

    // Sky.
    const sky = ctx.createLinearGradient(
      0,
      0,
      0,
      HEIGHT
    );

    sky.addColorStop(0, '#9dcce1');
    sky.addColorStop(1, '#d4e8e9');

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Distant hills.
    ctx.fillStyle = '#9ebfa3';

    ctx.beginPath();
    ctx.moveTo(0, 390);
    ctx.quadraticCurveTo(250, 280, 500, 390);
    ctx.quadraticCurveTo(850, 270, 1280, 390);
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.closePath();
    ctx.fill();

    // Ground tiles.
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = state.grid[y][x];

        const sx =
          OFFSET_X + (x - y) * 20;

        const sy =
          OFFSET_Y + (x + y) * 10;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 20, sy + 10);
        ctx.lineTo(sx, sy + 20);
        ctx.lineTo(sx - 20, sy + 10);
        ctx.closePath();

        if (cell.type === 'road') {
          ctx.fillStyle = '#424c5b';
        } else if (cell.type === 'residential') {
          ctx.fillStyle = '#91bd85';
        } else if (cell.type === 'commercial') {
          ctx.fillStyle = '#8bbbd7';
        } else if (cell.type === 'industrial') {
          ctx.fillStyle = '#c7a17b';
        } else {
          ctx.fillStyle = '#719b7a';
        }

        ctx.fill();

        ctx.strokeStyle = 'rgba(30, 50, 45, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Road markings.
        if (cell.type === 'road') {
          ctx.beginPath();
          ctx.moveTo(sx - 9, sy + 10);
          ctx.lineTo(sx + 9, sy + 10);
          ctx.strokeStyle = '#f4dfa0';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Buildings.
        if (
          cell.type === 'residential' ||
          cell.type === 'commercial' ||
          cell.type === 'industrial'
        ) {
          drawBuilding(
            ctx,
            cell,
            sx,
            sy,
            selectedCell?.x === x &&
              selectedCell?.y === y
          );
        }

        // Road selection.
        if (
          selectedCell?.x === x &&
          selectedCell?.y === y &&
          cell.type === 'road'
        ) {
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + 20, sy + 10);
          ctx.lineTo(sx, sy + 20);
          ctx.lineTo(sx - 20, sy + 10);
          ctx.closePath();

          ctx.strokeStyle = '#facc15';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    }

    // Outer map border.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
  }, [state, selectedCell]);

  useEffect(() => {
    draw();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [draw]);

  const handleCanvasClick = (
    event: React.MouseEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    const logicalX =
      ((event.clientX - rect.left) / rect.width) * WIDTH;

    const logicalY =
      ((event.clientY - rect.top) / rect.height) * HEIGHT;

    const { x, y } = screenToGrid(
      logicalX,
      logicalY,
      OFFSET_X,
      OFFSET_Y
    );

    if (
      x < 0 ||
      x >= GRID_SIZE ||
      y < 0 ||
      y >= GRID_SIZE
    ) {
      return;
    }

    const cell = state.grid[y][x];

    if (cell.type === 'empty') {
      const newState = placeBuilding(
        state,
        x,
        y,
        state.selectedTool
      );

      if (newState === state) {
        setNotice('Not enough money or invalid location.');
      } else {
        setState(newState);
        setSelectedCell(null);
        setNotice('Construction completed!');
      }

      return;
    }

    setSelectedCell({ x, y });
    setNotice(
      `${cell.type.toUpperCase()} selected — Level ${cell.level}`
    );
  };

  const handleUpgrade = () => {
    if (!selectedCell || !selectedBuilding) return;

    if (selectedBuilding.level >= MAX_BUILDING_LEVEL) {
      setNotice('This building is already at maximum level.');
      return;
    }

    if (state.money < upgradeCost) {
      setNotice('Not enough money for this upgrade.');
      return;
    }

    const upgraded = upgradeBuilding(
      state,
      selectedCell.x,
      selectedCell.y
    );

    setState(upgraded);

    setNotice(
      `Building upgraded to Level ${selectedBuilding.level + 1}!`
    );
  };

  const handleCollectIncome = () => {
    setState(current =>
      collectDailyIncome(current)
    );

    setNotice(
      `Collected $${income.toLocaleString()} daily income!`
    );
  };

  const handleNewCity = () => {
    if (
      window.confirm(
        'Start a new city? Your current saved city will be replaced.'
      )
    ) {
      setState(createInitialState());
      setSelectedCell(null);
      setNotice('New city started!');
    }
  };

  const selectTool = (tool: BuildingType) => {
    setState(current => ({
      ...current,
      selectedTool: tool,
    }));

    setSelectedCell(null);
  };

  return (
    <section className="city-game">
      <div className="game-topbar">
        <div className="stat">
          <span>💰</span>
          <small>MONEY</small>
          <strong>${state.money.toLocaleString()}</strong>
        </div>

        <div className="stat">
          <span>👥</span>
          <small>POPULATION</small>
          <strong>{state.population.toLocaleString()}</strong>
        </div>

        <div className="stat">
          <span>📈</span>
          <small>DAILY INCOME</small>
          <strong>${income.toLocaleString()}</strong>
        </div>

        <div className="stat">
          <span>📅</span>
          <small>DAY</small>
          <strong>{state.day}</strong>
        </div>

        <div className="connection">
          <span className={online ? 'online-dot' : 'offline-dot'} />
          {online ? 'Online' : 'Offline'}
        </div>
      </div>

      <div className="game-toolbar">
        <div className="tool-list">
          {tools.map(tool => (
            <button
              key={tool.id}
              type="button"
              onClick={() => selectTool(tool.id)}
              className={
                state.selectedTool === tool.id
                  ? 'tool-button active'
                  : 'tool-button'
              }
            >
              <span>{tool.icon}</span>
              <span>{tool.label}</span>
              <small>${tool.cost}</small>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="income-button"
          onClick={handleCollectIncome}
        >
          💵 Collect ${income}
        </button>

        <button
          type="button"
          className="new-city-button"
          onClick={handleNewCity}
        >
          ↻ New City
        </button>
      </div>

      {selectedBuilding &&
        selectedBuilding.type !== 'empty' && (
          <div className="upgrade-panel">
            <div className="building-info">
              <strong>
                {selectedBuilding.type.toUpperCase()}
              </strong>

              <span>
                Level {selectedBuilding.level} / {MAX_BUILDING_LEVEL}
              </span>

              {selectedBuilding.type === 'residential' && (
                <span>
                  Residents: {selectedBuilding.population}
                </span>
              )}
            </div>

            <button
              type="button"
              className="upgrade-button"
              onClick={handleUpgrade}
              disabled={
                selectedBuilding.level >= MAX_BUILDING_LEVEL ||
                state.money < upgradeCost
              }
            >
              {selectedBuilding.level >= MAX_BUILDING_LEVEL
                ? 'MAX LEVEL'
                : `⬆ Upgrade — $${upgradeCost.toLocaleString()}`}
            </button>
          </div>
        )}

      {notice && (
        <div className="game-notice">
          {notice}
          <button
            type="button"
            onClick={() => setNotice('')}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <div className="city-viewport">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onClick={handleCanvasClick}
          onContextMenu={event => event.preventDefault()}
          aria-label="SK Skyline city building area"
        />
      </div>

      <div className="game-hint">
        Choose a tool and tap empty land to build.
        Tap an existing building to select and upgrade it.
        Your city saves automatically.
      </div>

      <style jsx>{`
        .city-game {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }

        .game-topbar {
          min-height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-around;
          flex-wrap: wrap;
          gap: 12px;
          padding: 10px 16px;
          border: 1px solid #293b55;
          border-radius: 14px;
          background: #151f31;
          box-shadow: 0 8px 24px rgba(0,0,0,.2);
        }

        .stat {
          display: flex;
          align-items: center;
          gap: 8px;
          white-space: nowrap;
        }

        .stat > span {
          font-size: 19px;
        }

        .stat small {
          color: #9aaac0;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .stat strong {
          color: white;
          font-size: clamp(12px, 1.5vw, 19px);
        }

        .connection {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #b8c7d9;
          font-size: 11px;
          white-space: nowrap;
        }

        .online-dot,
        .offline-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
        }

        .offline-dot {
          background: #f87171;
        }

        .game-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .tool-list {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          min-width: 0;
          flex: 1;
        }

        .tool-list::-webkit-scrollbar {
          display: none;
        }

        .tool-button {
          min-height: 44px;
          padding: 7px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #3b4b61;
          border-radius: 10px;
          color: #e8eef7;
          background: #202d42;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
        }

        .tool-button.active {
          color: #061321;
          background: #67e8f9;
          border-color: #67e8f9;
        }

        .tool-button small {
          font-size: 10px;
          opacity: .75;
        }

        .income-button,
        .new-city-button {
          min-height: 42px;
          padding: 0 12px;
          border: 1px solid #475569;
          border-radius: 10px;
          color: white;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
        }

        .income-button {
          background: #166534;
          border-color: #22c55e;
        }

        .new-city-button {
          background: #29384e;
        }

        .upgrade-panel {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border: 1px solid #d6a52d;
          border-radius: 12px;
          background: #332b19;
        }

        .building-info {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          color: #fef3c7;
          font-size: 12px;
        }

        .building-info strong {
          color: #facc15;
        }

        .upgrade-button {
          min-height: 40px;
          padding: 0 16px;
          border: 0;
          border-radius: 9px;
          background: #eab308;
          color: #211600;
          font-weight: 800;
          font-size: 12px;
          cursor: pointer;
        }

        .upgrade-button:disabled {
          opacity: .45;
          cursor: not-allowed;
        }

        .game-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          border-radius: 8px;
          background: #1e3a5f;
          color: #dbeafe;
          font-size: 12px;
        }

        .game-notice button {
          border: 0;
          background: transparent;
          color: white;
          font-size: 20px;
        }

        .city-viewport {
          width: 100%;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          border: 2px solid #40546b;
          border-radius: 14px;
          background: #9bc5b2;
          box-shadow: 0 12px 32px rgba(0,0,0,.3);
          touch-action: manipulation;
        }

        canvas {
          display: block;
          width: 100%;
          height: 100%;
          cursor: crosshair;
          touch-action: manipulation;
        }

        .game-hint {
          color: #9aaac0;
          text-align: center;
          font-size: 11px;
          line-height: 1.6;
        }

        @media (max-width: 700px) {
          .game-topbar {
            min-height: 50px;
            padding: 7px;
            gap: 8px;
          }

          .stat {
            gap: 4px;
          }

          .stat > span {
            font-size: 14px;
          }

          .stat small {
            display: none;
          }

          .stat strong {
            font-size: 11px;
          }

          .connection {
            font-size: 9px;
          }

          .tool-button {
            min-height: 38px;
            padding: 6px 8px;
            font-size: 10px;
          }

          .income-button,
          .new-city-button {
            min-height: 38px;
            padding: 0 8px;
            font-size: 9px;
          }

          .upgrade-panel {
            padding: 9px;
          }

          .building-info {
            gap: 6px;
            font-size: 10px;
          }

          .upgrade-button {
            min-height: 36px;
            padding: 0 9px;
            font-size: 10px;
          }

          .city-viewport {
            border-radius: 8px;
          }
        }
      `}</style>
    </section>
  );
}
