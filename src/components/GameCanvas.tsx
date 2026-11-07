
'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import {
  createInitialState,
  placeBuilding,
  screenToGrid
} from '../game/engine';

import type {
  GameState,
  BuildingType
} from '../game/types';

const SAVE_KEY = 'sk-skyline-city-save-v1';

const WIDTH = 1280;
const HEIGHT = 720;
const OFFSET_X = 640;
const OFFSET_Y = 40;

const tools: {
  id: BuildingType;
  label: string;
  icon: string;
  cost: number;
}[] = [
  { id: 'road', label: 'Road', icon: '🛣️', cost: 10 },
  { id: 'residential', label: 'Homes', icon: '🏠', cost: 100 },
  { id: 'commercial', label: 'Shops', icon: '🏬', cost: 150 },
  { id: 'industrial', label: 'Industry', icon: '🏭', cost: 200 }
];

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [state, setState] = useState<GameState>(
    createInitialState()
  );

  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);

  // Load saved city.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved) as GameState;

        if (
          parsed &&
          Array.isArray(parsed.grid) &&
          parsed.grid.length === 20 &&
          parsed.grid.every(
            row => Array.isArray(row) && row.length === 20
          ) &&
          typeof parsed.money === 'number' &&
          typeof parsed.population === 'number' &&
          typeof parsed.day === 'number'
        ) {
          setState({
            ...createInitialState(),
            ...parsed
          });
        }
      }
    } catch {
      console.warn('Could not load saved SK Skyline city.');
    }

    setReady(true);
  }, []);

  // Save city locally.
  useEffect(() => {
    if (!ready) return;

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      console.warn('Could not save SK Skyline city.');
    }
  }, [state, ready]);

  // Detect internet availability.
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

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

    // Background.
    const background = ctx.createLinearGradient(
      0, 0, 0, HEIGHT
    );

    background.addColorStop(0, '#b9d9e8');
    background.addColorStop(1, '#7da9b8');

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Decorative background landscape.
    ctx.fillStyle = '#9bc5b2';
    ctx.beginPath();
    ctx.ellipse(640, 570, 690, 280, 0, 0, Math.PI * 2);
    ctx.fill();

    // City tiles.
    state.grid.forEach(row => {
      row.forEach(cell => {
        const sx = OFFSET_X + (cell.x - cell.y) * 32;
        const sy = OFFSET_Y + (cell.x + cell.y) * 16;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 32, sy + 16);
        ctx.lineTo(sx, sy + 32);
        ctx.lineTo(sx - 32, sy + 16);
        ctx.closePath();

        const colors: Record<BuildingType, string> = {
          empty: '#648b78',
          road: '#424b58',
          residential: '#a5d6a7',
          commercial: '#8ec5e8',
          industrial: '#d8b58b'
        };

        ctx.fillStyle = colors[cell.type];
        ctx.fill();

        ctx.strokeStyle = '#34495a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Road markings.
        if (cell.type === 'road') {
          ctx.beginPath();
          ctx.moveTo(sx - 13, sy + 16);
          ctx.lineTo(sx + 13, sy + 16);
          ctx.strokeStyle = '#e8dca9';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Simple 3D-style buildings.
        if (
          cell.type === 'residential' ||
          cell.type === 'commercial' ||
          cell.type === 'industrial'
        ) {
          const buildingColor =
            cell.type === 'residential'
              ? '#267c55'
              : cell.type === 'commercial'
                ? '#2563a6'
                : '#9b6335';

          const buildingHeight =
            cell.type === 'industrial' ? 25 : 32;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.2)';
          ctx.fillRect(
            sx - 13,
            sy + 7,
            28,
            9
          );

          ctx.fillStyle = buildingColor;
          ctx.fillRect(
            sx - 10,
            sy + 15 - buildingHeight,
            20,
            buildingHeight
          );

          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fillRect(
            sx - 10,
            sy + 15 - buildingHeight,
            20,
            4
          );

          ctx.fillStyle = '#fef3c7';

          for (let w = 0; w < 2; w++) {
            ctx.fillRect(
              sx - 6 + w * 9,
              sy + 4 - buildingHeight,
              4,
              5
            );
          }
        }
      });
    });

    // Border around the playable area.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
  }, [state]);

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

    setState(current =>
      placeBuilding(current, x, y, current.selectedTool)
    );
  };

  const selectTool = (tool: BuildingType) => {
    setState(current => ({
      ...current,
      selectedTool: tool
    }));
  };

  const newCity = () => {
    if (
      window.confirm(
        'Start a new city? Your current saved city will be replaced.'
      )
    ) {
      setState(createInitialState());
    }
  };

  return (
    <section className="city-game">
      <div className="game-topbar">
        <div className="stat">
          <span className="stat-icon">💰</span>
          <span className="stat-label">MONEY</span>
          <strong>${state.money.toLocaleString()}</strong>
        </div>

        <div className="stat">
          <span className="stat-icon">👥</span>
          <span className="stat-label">POPULATION</span>
          <strong>{state.population.toLocaleString()}</strong>
        </div>

        <div className="stat">
          <span className="stat-icon">📅</span>
          <span className="stat-label">DAY</span>
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
          className="new-city-button"
          onClick={newCity}
        >
          ↻ New City
        </button>
      </div>

      <div className="city-viewport">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onClick={handleCanvasClick}
          onContextMenu={event => event.preventDefault()}
          aria-label="SK Skyline city building area"
        />
      </div>

      <div className="game-hint">
        Select a tool, then tap an empty tile to build.
        <span> Your city saves automatically.</span>
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

        .stat-icon {
          font-size: 21px;
        }

        .stat-label {
          color: #9aaac0;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .stat strong {
          color: #fff;
          font-size: clamp(13px, 1.6vw, 20px);
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
          justify-content: space-between;
          gap: 10px;
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
          min-height: 46px;
          padding: 7px 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid #3b4b61;
          border-radius: 10px;
          color: #e8eef7;
          background: #202d42;
          font-size: 13px;
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

        .new-city-button {
          min-height: 42px;
          padding: 0 13px;
          border: 1px solid #475569;
          border-radius: 10px;
          background: #29384e;
          color: white;
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          cursor: pointer;
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
        }

        .game-hint span {
          color: #67e8f9;
        }

        @media (max-width: 650px) {
          .game-topbar {
            min-height: 52px;
            padding: 7px;
            gap: 6px;
          }

          .stat {
            gap: 4px;
          }

          .stat-icon {
            font-size: 15px;
          }

          .stat-label {
            display: none;
          }

          .stat strong {
            font-size: 12px;
          }

          .connection {
            font-size: 9px;
          }

          .tool-button {
            min-height: 40px;
            padding: 6px 9px;
            font-size: 11px;
          }

          .new-city-button {
            min-height: 38px;
            padding: 0 8px;
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
