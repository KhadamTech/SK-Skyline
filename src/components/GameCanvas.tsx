'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import { createInitialState, placeBuilding, gridToScreen, screenToGrid } from '../game/engine';
import { GameState, BuildingType } from '../game/types';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<GameState>(createInitialState());
  const [offset, setOffset] = useState({ x: 400, y: 100 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offset.x, offset.y);

    state.grid.forEach(row => {
      row.forEach(cell => {
        const { screenX, screenY } = gridToScreen(cell.x, cell.y);
        
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + 32, screenY + 16);
        ctx.lineTo(screenX, screenY + 32);
        ctx.lineTo(screenX - 32, screenY + 16);
        ctx.closePath();
        
        if (cell.type === 'road') ctx.fillStyle = '#555';
        else if (cell.type === 'residential') ctx.fillStyle = '#4ade80';
        else if (cell.type === 'commercial') ctx.fillStyle = '#60a5fa';
        else if (cell.type === 'industrial') ctx.fillStyle = '#f87171';
        else ctx.fillStyle = '#2d3748';

        ctx.fill();
        ctx.strokeStyle = '#1a202c';
        ctx.stroke();
        
        if (cell.type !== 'empty' && cell.type !== 'road') {
          ctx.fillStyle = '#fff';
          ctx.fillText(cell.type.charAt(0).toUpperCase(), screenX - 4, screenY + 20);
        }
      });
    });

    ctx.restore();
  }, [state, offset]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const { x, y } = screenToGrid(clickX, clickY, offset.x, offset.y);
    const newState = placeBuilding(state, x, y, state.selectedTool);
    setState(newState);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex gap-4 mb-4 p-4 bg-gray-800 text-white rounded-lg">
        <div>💰 Money: ${state.money}</div>
        <div>👥 Pop: {state.population}</div>
        <div>📅 Day: {state.day}</div>
      </div>
      
      <div className="flex gap-2 mb-4">
        {(['road', 'residential', 'commercial', 'industrial'] as BuildingType[]).map(t => (
          <button
            key={t}
            onClick={() => setState({ ...state, selectedTool: t })}
            className={`px-4 py-2 rounded ${state.selectedTool === t ? 'bg-blue-600 text-white' : 'bg-gray-200 text-black'}`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onClick={handleClick}
        className="border-2 border-gray-300 bg-gray-100 cursor-pointer"
      />
    </div>
  );
}
