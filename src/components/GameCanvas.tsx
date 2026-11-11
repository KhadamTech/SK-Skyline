'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  createInitialState, placeBuilding, upgradeBuilding, buyLand, getBuildingFootprint,
  GRID_SIZE, TILE_SIZE, MAX_BUILDING_LEVEL 
} from '../game/engine';
import { GameState, BuildingCategory, Agent } from '../game/types';

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GameState>(createInitialState());
  const [loading, setLoading] = useState(true);
  
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(45, 1, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  // FIXED: Changed THREE.Group to THREE.Object3D so it accepts both Meshes (locks) and Groups (buildings)
  const meshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  
  const agentsRef = useRef<Agent[]>([]);
  
  // Caches
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());
  const carModels = useRef<THREE.Object3D[]>([]);
  const popModels = useRef<THREE.Object3D[]>([]);

  // 1. Load Assets
  useEffect(() => {
    const loader = new GLTFLoader();
    const filesToLoad = [
      '/models/roads/road.glb',
      '/models/buildings/level1.glb',
      '/models/buildings/level2.glb',
      '/models/buildings/level3.glb',
      '/models/cars/car1.glb', '/models/cars/car2.glb', '/models/cars/car3.glb',
      '/models/population/population1.glb', '/models/population/population2.glb'
    ];

    let loaded = 0;
    filesToLoad.forEach(path => {
      loader.load(path, (gltf) => {
        const name = path.split('/').pop()?.replace('.glb', '');
        if (name?.includes('car')) carModels.current.push(gltf.scene);
        else if (name?.includes('population')) popModels.current.push(gltf.scene);
        else if (name) modelCache.current.set(name, gltf.scene);
        
        loaded++;
        if (loaded === filesToLoad.length) setLoading(false);
      }, undefined, () => {
        // Fallback if file doesn't exist
        loaded++;
        if (loaded === filesToLoad.length) setLoading(false);
      });
    });
  }, []);

  // 2. Setup Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    camera.position.set(40, 50, 40);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.2;

    // Grid Helper
    scene.add(new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x555555, 0x333333));

    // Raycaster for clicks
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ visible: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    const onClick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const hit of intersects) {
        if (hit.object.userData.isBuilding) {
          setState(prev => ({ ...prev, selectedBuilding: { x: hit.object.userData.gx, z: hit.object.userData.gz } }));
          return;
        }
        if (hit.object.userData.isGround) {
          const gx = Math.floor(hit.point.x / TILE_SIZE + GRID_SIZE / 2);
          const gz = Math.floor(hit.point.z / TILE_SIZE + GRID_SIZE / 2);
          
          if (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE) {
            const cell = state.grid[gz][gx];
            if (cell.isLocked) {
              setState(prev => buyLand(prev, gx, gz));
            } else {
              setState(prev => ({ 
                ...placeBuilding(prev, gx, gz, prev.selectedTool), 
                selectedBuilding: null
              }));
            }
          }
          return;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onClick);

    // Animation Loop (Traffic & Pedestrians)
    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      
      // Move Cars and Pedestrians
      agentsRef.current.forEach(a => {
        a.progress += a.speed;
        if (a.progress >= 1) {
          a.progress = 0;
          a.x = a.targetX;
          a.z = a.targetZ;
          
          // Find next road
          const dirs = [{x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}];
          const valid = dirs.filter(d => {
            const nx = a.x + d.x; const nz = a.z + d.z;
            return nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && state.grid[nz][nx].category === 'road';
          });
          if (valid.length > 0) {
            const next = valid[Math.floor(Math.random() * valid.length)];
            a.targetX = a.x + next.x;
            a.targetZ = a.z + next.z;
          } else {
            a.targetX = a.x; a.targetZ = a.z; // Stop if no road
          }
        }

        if (a.mesh) {
          const sx = (a.x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          const sz = (a.z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          const ex = (a.targetX - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          const ez = (a.targetZ - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          
          a.mesh.position.x = sx + (ex - sx) * a.progress;
          a.mesh.position.z = sz + (ez - sz) * a.progress;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.domElement.removeEventListener('pointerdown', onClick);
      cancelAnimationFrame(reqId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, [state.grid]); // Rebind on grid change to get latest traffic logic

  // 3. Render Grid (Multi-Tile & Upgrades)
  useEffect(() => {
    const scene = sceneRef.current;
    meshesRef.current.forEach(m => scene.remove(m));
    meshesRef.current.clear();

    // Clear agents that no longer have roads
    agentsRef.current.forEach(a => { if(a.mesh) scene.remove(a.mesh); });
    agentsRef.current = [];

    let totalPop = 0;

    state.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.category !== 'empty') {
          // Render Land Locks
          if (cell.isLocked) {
            const lockGeo = new THREE.BoxGeometry(TILE_SIZE, 0.5, TILE_SIZE);
            const lockMat = new THREE.MeshStandardMaterial({ color: 0x222222, transparent: true, opacity: 0.8 });
            const lockMesh = new THREE.Mesh(lockGeo, lockMat);
            lockMesh.position.set((cell.x - GRID_SIZE/2)*TILE_SIZE + TILE_SIZE/2, -0.2, (cell.z - GRID_SIZE/2)*TILE_SIZE + TILE_SIZE/2);
            scene.add(lockMesh);
            meshesRef.current.set(`lock-${cell.x}-${cell.z}`, lockMesh);
            return;
          }

          const group = new THREE.Group();
          let modelName = 'road';
          
          if (cell.category !== 'road') {
             modelName = `level${cell.level}`;
             totalPop += cell.level * 10; // Increase pop based on level
          }

          const template = modelCache.current.get(modelName);
          if (template) {
            const cloned = template.clone();
            
            // Scale multi-tile buildings to fit their footprint!
            if (cell.category !== 'road' && cell.isOrigin) {
              const fp = getBuildingFootprint(cell.level);
              const targetWidth = fp.w * TILE_SIZE;
              // Assuming your GLB is roughly 4 units wide by default
              const scale = targetWidth / 4; 
              cloned.scale.set(scale, scale, scale);
            }
            group.add(cloned);
          } else {
            // Fallback
            const geo = new THREE.BoxGeometry(TILE_SIZE * 0.9, 2, TILE_SIZE * 0.9);
            const mat = new THREE.MeshStandardMaterial({ color: cell.category === 'road' ? 0x333333 : 0x4ade80 });
            group.add(new THREE.Mesh(geo, mat));
          }

          // Position on grid
          group.position.set(
            (cell.x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
            0,
            (cell.z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
          );
          
          // Center multi-tile buildings perfectly
          if (cell.category !== 'road' && cell.isOrigin) {
            const fp = getBuildingFootprint(cell.level);
            group.position.x += (fp.w - 1) * TILE_SIZE / 2;
            group.position.z += (fp.h - 1) * TILE_SIZE / 2;
          }

          group.userData = { isBuilding: cell.category !== 'road', gx: cell.x, gz: cell.z };
          scene.add(group);
          meshesRef.current.set(`b-${cell.x}-${cell.z}`, group);

          // Spawn Traffic & Pedestrians
          if (cell.category === 'road' && Math.random() > 0.95 && agentsRef.current.length < totalPop / 5) {
            const isCar = Math.random() > 0.4;
            const pool = isCar ? carModels.current : popModels.current;
            
            if (pool.length > 0) {
              const model = pool[Math.floor(Math.random() * pool.length)].clone();
              model.position.copy(group.position);
              model.position.y = isCar ? 0.2 : 0.1; // Cars float slightly higher
              if (!isCar) model.scale.set(0.5, 0.5, 0.5); // Pedestrians are smaller
              
              scene.add(model);
              agentsRef.current.push({
                type: isCar ? 'car' : 'pedestrian',
                x: cell.x, z: cell.z, targetX: cell.x, targetZ: cell.z,
                progress: 0, speed: 0.01 + Math.random() * 0.02, mesh: model, modelIndex: 0
              });
            }
          }
        }
      });
    });

    setState(prev => prev.population === totalPop ? prev : { ...prev, population: totalPop });

  }, [state.grid]);

  const selectedCell = state.selectedBuilding ? state.grid[state.selectedBuilding.z][state.selectedBuilding.x] : null;

  return (
    <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white bg-slate-900 z-50">Loading 3D City...</div>}
      
      {/* Top Bar UI */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-wrap justify-center gap-2 p-2 bg-gray-900/90 border border-gray-700 rounded-xl shadow-2xl">
        <div className="flex gap-4 px-4 items-center border-r border-gray-700 text-white font-mono text-sm">
          <span className="text-green-400">💰 ${state.money}</span>
          <span className="text-blue-400">👥 {state.population}</span>
        </div>
        <div className="flex gap-1">
          {(['road', 'residential', 'commercial', 'industrial'] as BuildingCategory[]).map(t => (
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
      </div>

      {/* Details Panel (Only Upgrades Residential/Commercial/Industrial) */}
      {selectedCell && selectedCell.isOrigin && selectedCell.category !== 'road' && (
        <div className="absolute top-24 right-4 w-72 bg-gray-900/95 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl z-20 text-white p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold capitalize">{selectedCell.category}</h2>
            <button onClick={() => setState({ ...state, selectedBuilding: null })} className="text-gray-400 hover:text-white">✖</button>
          </div>

          <div className="space-y-2 text-sm mb-6">
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Level:</span>
              <span className="font-bold text-yellow-400">{selectedCell.level} / {MAX_BUILDING_LEVEL}</span>
            </div>
            <div className="flex justify-between border-b border-gray-700 pb-1">
              <span className="text-gray-400">Footprint:</span>
              <span className="font-bold">{getBuildingFootprint(selectedCell.level).w * getBuildingFootprint(selectedCell.level).h} Blocks</span>
            </div>
          </div>

          <button 
            onClick={() => setState(prev => upgradeBuilding(prev, selectedCell.x, selectedCell.z))}
            disabled={selectedCell.level >= MAX_BUILDING_LEVEL || state.money < selectedCell.level * 1000}
            className={`w-full py-2 rounded-lg font-bold ${
              selectedCell.level >= MAX_BUILDING_LEVEL 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {selectedCell.level >= MAX_BUILDING_LEVEL ? 'Max Level' : `Upgrade ($${selectedCell.level * 1000})`}
          </button>
        </div>
      )}

      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
      }
