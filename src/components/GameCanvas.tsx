'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  createInitialState, placeBuilding, upgradeBuilding, 
  collectDailyIncome, getDailyIncome, getUpgradeCost,
  GRID_SIZE, TILE_SIZE, MAX_BUILDING_LEVEL 
} from '../game/engine';
import { GameState, BuildingType } from '../game/types';

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GameState>(createInitialState());
  const [loading, setLoading] = useState(true);
  
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(45, 1, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());

  useEffect(() => {
    const loader = new GLTFLoader();
    const models = ['house-1', 'house-2', 'house-3', 'road', 'car']; 
    let loadedCount = 0;

    models.forEach(name => {
      loader.load(`/models/${name}.glb`, (gltf) => {
        modelCache.current.set(name, gltf.scene);
        loadedCount++;
        if (loadedCount === models.length) setLoading(false);
      }, undefined, () => {
        // Fallback boxes if models aren't found
        const geo = new THREE.BoxGeometry(TILE_SIZE * 0.8, name.includes('house') ? 3 * (parseInt(name.split('-')[1]) || 1) : 1, TILE_SIZE * 0.8);
        const mat = new THREE.MeshStandardMaterial({ color: name.includes('house') ? 0x4ade80 : name === 'road' ? 0x333333 : 0xff0000 });
        modelCache.current.set(name, new THREE.Mesh(geo, mat));
        loadedCount++;
        if (loadedCount === models.length) setLoading(false);
      });
    });
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    camera.position.set(20, 30, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.2;

    scene.add(new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x888888, 0x444444));

    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ visible: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: PointerEvent) => {
      if (!mountRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const intersect of intersects) {
        if (intersect.object.userData.isBuilding) {
          const gx = intersect.object.userData.gridX;
          const gz = intersect.object.userData.gridZ;
          setState(prev => ({ ...prev, selectedBuilding: { x: gx, z: gz } }));
          return;
        }
        if (intersect.object.userData.isGround) {
          const p = intersect.point;
          const gx = Math.floor(p.x / TILE_SIZE + GRID_SIZE / 2);
          const gz = Math.floor(p.z / TILE_SIZE + GRID_SIZE / 2);
          setState(prev => ({ 
            ...placeBuilding(prev, gx, gz, prev.selectedTool), 
            selectedBuilding: null
          }));
          return;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onClick);

    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.domElement.removeEventListener('pointerdown', onClick);
      cancelAnimationFrame(reqId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    meshesRef.current.forEach(mesh => scene.remove(mesh));
    meshesRef.current.clear();

    state.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.type !== 'empty') {
          const key = `${cell.x}-${cell.z}`;
          const group = new THREE.Group();
          
          let modelName = 'road';
          if (cell.type === 'residential') modelName = `house-${cell.level}`; 
          if (cell.type === 'commercial') modelName = `house-${cell.level}`; // Reusing house models for now
          if (cell.type === 'industrial') modelName = `house-${cell.level}`; 
          
          const template = modelCache.current.get(modelName) || modelCache.current.get('house-1');
          if (template) group.add(template.clone());

          group.position.set(
            (cell.x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
            0,
            (cell.z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
          );
          
          group.userData = { isBuilding: cell.type !== 'road', gridX: cell.x, gridZ: cell.z };
          scene.add(group);
          meshesRef.current.set(key, group);
        }
      });
    });
  }, [state.grid]);

  const selectedCell = state.selectedBuilding 
    ? state.grid[state.selectedBuilding.z][state.selectedBuilding.x] 
    : null;

  return (
    <div className="relative w-full h-screen bg-[#1e293b] overflow-hidden">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white z-50">Loading 3D Models...</div>}
      
      {/* Top Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-2 p-2 bg-gray-900/90 rounded-xl border border-gray-700 shadow-2xl">
        <div className="flex gap-4 px-4 items-center border-r border-gray-700 text-white font-mono text-sm">
          <span className="text-green-400">💰 ${state.money}</span>
          <span className="text-blue-400">👥 {state.population}</span>
        </div>
        <div className="flex gap-1">
          {(['road', 'residential', 'commercial', 'industrial'] as BuildingType[]).map(t => (
            <button
              key={t}
              onClick={() => setState({ ...state, selectedTool: t, selectedBuilding: null })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                state.selectedTool === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="pl-2 border-l border-gray-700">
           <button onClick={() => setState(collectDailyIncome(state))} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white">
             Collect +${state.income}
           </button>
        </div>
      </div>

      {/* DETAILS PANEL */}
      {selectedCell && selectedCell.type !== 'empty' && (
        <div className="absolute top-24 right-4 w-72 bg-gray-900/95 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-20 text-white p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold capitalize">{selectedCell.type} Details</h2>
            <button onClick={() => setState({ ...state, selectedBuilding: null })} className="text-gray-400 hover:text-white">✖</button>
          </div>

          <div className="w-full h-32 bg-gray-800 rounded-lg flex items-center justify-center mb-4 overflow-hidden">
            <img 
              src={`/ui/building-${selectedCell.level === 1 ? 'a' : selectedCell.level === 2 ? 'b' : 'skyscraper-a'}.png`} 
              alt="Building" 
              className="h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
            />
          </div>

          <div className="space-y-2 text-sm mb-6">
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Level:</span>
              <span className="font-bold text-yellow-400">{selectedCell.level} / {MAX_BUILDING_LEVEL}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Population:</span>
              <span className="font-bold">{selectedCell.level === 1 ? 10 : selectedCell.level === 2 ? 25 : 50}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Income:</span>
              <span className="font-bold text-green-400">+${getDailyIncome(selectedCell)}/day</span>
            </div>
          </div>

          <button 
            onClick={() => {
              setState(prev => upgradeBuilding(prev, selectedCell.x, selectedCell.z));
            }}
            disabled={selectedCell.level >= MAX_BUILDING_LEVEL || state.money < getUpgradeCost(selectedCell.level)}
            className={`w-full py-2 rounded-lg font-bold ${
              selectedCell.level >= MAX_BUILDING_LEVEL 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {selectedCell.level >= MAX_BUILDING_LEVEL ? 'Max Level' : `Upgrade ($${getUpgradeCost(selectedCell.level)})`}
          </button>
        </div>
      )}

      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
        }
