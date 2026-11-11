'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- CONSTANTS ---
const GRID_SIZE = 30;
const TILE_SIZE = 4;
const MAX_LEVEL = 3;

type Category = 'road' | 'building' | 'shop' | 'gov';
type BuildingData = { id: string; name: string; path: string };

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [money, setMoney] = useState(50000);
  const [population, setPopulation] = useState(0);
  
  // UI State
  const [activeCategory, setActiveCategory] = useState<Category>('road');
  const [selectedModel, setSelectedModel] = useState<BuildingData | null>(null);
  const [availableModels, setAvailableModels] = useState<Record<string, BuildingData[]>>({});
  const [selectedBuilding, setSelectedBuilding] = useState<{x: number, z: number, level: number, category: string} | null>(null);

  // 3D Refs
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(40, 1, 1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());
  const gridData = useRef<Record<string, { level: number, category: string, mesh: THREE.Object3D }>>({});
  
  // Traffic
  const agents = useRef<{mesh: THREE.Object3D, x: number, z: number, tx: number, tz: number, prog: number, speed: number}[]>([]);

  // --- 1. DEFINE AVAILABLE MODELS (Based on your GitHub folders) ---
  useEffect(() => {
    // This hardcodes the lists so the UI knows what to show
    const models = {
      road: [{ id: 'road', name: 'Straight Road', path: '/models/roads/road.glb' }],
      building: [
        { id: 'level1', name: 'Small House', path: '/models/buildings/level1.glb' },
        { id: 'level2', name: 'Medium Building', path: '/models/buildings/level2.glb' },
        { id: 'level3', name: 'Skyscraper', path: '/models/buildings/level3.glb' }
      ],
      shop: [
        { id: 'shop1', name: 'Grocery Store', path: '/models/shop/shop1.glb' },
        { id: 'shop2', name: 'Clothing Store', path: '/models/shop/shop2.glb' }
      ],
      gov: [
        { id: 'gov1', name: 'City Hall', path: '/models/gov/gov1.glb' },
        { id: 'police', name: 'Police Station', path: '/models/gov/police_station1.glb' }
      ]
    };
    setAvailableModels(models);
    setSelectedModel(models.road[0]); // Default to road

    // Load everything into cache
    const loader = new GLTFLoader();
    const allModels = [...models.road, ...models.building, ...models.shop, ...models.gov];
    let loaded = 0;

    allModels.forEach(m => {
      loader.load(m.path, (gltf) => {
        modelCache.current.set(m.path, gltf.scene);
        loaded++;
        if (loaded >= allModels.length) setLoading(false);
      }, undefined, () => {
        // Fallback if file missing
        const box = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE*0.9, 4, TILE_SIZE*0.9), new THREE.MeshStandardMaterial({ color: 0x888888 }));
        modelCache.current.set(m.path, box);
        loaded++;
        if (loaded >= allModels.length) setLoading(false);
      });
    });
  }, []);

  // --- 2. SETUP SCENE & CAMERA ---
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    // Setup Renderer
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting (Make it look like Skyline)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(-30, 50, 30);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    scene.add(dirLight);

    // Ground Grid
    const gridHelper = new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x555555, 0x222222);
    scene.add(gridHelper);
    
    // Invisible ground for clicking
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ visible: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    // Camera & Controls (Closer, Skyline Style)
    camera.position.set(30, 40, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1; // Don't go under ground
    controls.minDistance = 10; // Allow zooming in close
    controls.maxDistance = 100; // Allow zooming out
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }; // Mobile Touch Support
    controlsRef.current = controls;

    // --- 3. RAYCASTER CLICK LOGIC ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      // Ignore clicks on UI
      if ((event.target as HTMLElement).tagName === 'BUTTON' || (event.target as HTMLElement).closest('div')?.className.includes('bg-gray-900')) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const hit of intersects) {
        // If we clicked a building, open its UI
        if (hit.object.userData.isBuilding) {
          const gx = hit.object.userData.gx;
          const gz = hit.object.userData.gz;
          const key = `${gx}-${gz}`;
          if (gridData.current[key]) {
             setSelectedBuilding({ x: gx, z: gz, level: gridData.current[key].level, category: gridData.current[key].category });
          }
          return;
        }
        
        // If we clicked ground, place building
        if (hit.object.userData.isGround) {
          const gx = Math.floor(hit.point.x / TILE_SIZE + GRID_SIZE / 2);
          const gz = Math.floor(hit.point.z / TILE_SIZE + GRID_SIZE / 2);
          handlePlacement(gx, gz);
          return;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // --- 4. ANIMATION LOOP ---
    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      
      // Move cars
      agents.current.forEach(a => {
        a.prog += a.speed;
        if (a.prog >= 1) {
          a.prog = 0;
          a.x = a.tx; a.z = a.tz;
          const dirs = [{x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}];
          const valid = dirs.filter(d => gridData.current[`${a.x+d.x}-${a.z+d.z}`]?.category === 'road');
          if (valid.length > 0) {
            const next = valid[Math.floor(Math.random() * valid.length)];
            a.tx = a.x + next.x; a.tz = a.z + next.z;
          }
        }
        if (a.mesh) {
          const sx = (a.x - GRID_SIZE/2)*TILE_SIZE + TILE_SIZE/2;
          const sz = (a.z - GRID_SIZE/2)*TILE_SIZE + TILE_SIZE/2;
          const ex = (a.tx - GRID_SIZE/2)*TILE_SIZE + TILE_SIZE/2;
          const ez = (a.tz - GRID_SIZE/2)*TILE_SIZE + TILE_SIZE/2;
          a.mesh.position.x = sx + (ex - sx) * a.prog;
          a.mesh.position.z = sz + (ez - sz) * a.prog;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      cancelAnimationFrame(reqId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []); // Run once

  // --- 5. PLACEMENT LOGIC ---
  const handlePlacement = (x: number, z: number) => {
    if (!selectedModel || x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;

    // Check costs
    const costs: Record<string, number> = { road: 10, building: 500, shop: 800, gov: 1500 };
    const cost = costs[activeCategory];
    if (money < cost) return;

    // Determine Footprint based on Category
    let w = 1, h = 1;
    if (activeCategory === 'building') { w = 2; h = 2; } // 4 blocks
    if (activeCategory === 'shop') { w = 2; h = 2; } // 4 blocks
    if (activeCategory === 'gov') { w = 3; h = 3; } // 9 blocks

    // Check if space is empty
    for(let dz=0; dz<h; dz++) {
      for(let dx=0; dx<w; dx++) {
        if (gridData.current[`${x+dx}-${z+dz}`]) return; // Blocked
      }
    }

    // Place the building
    const scene = sceneRef.current;
    const template = modelCache.current.get(selectedModel.path);
    if (!template) return;

    const group = new THREE.Group();
    const clonedMesh = template.clone();
    
    // Scale the model to fit the multi-tile footprint
    const box = new THREE.Box3().setFromObject(clonedMesh);
    const size = box.getSize(new THREE.Vector3());
    const targetWidth = w * TILE_SIZE;
    const scale = targetWidth / (size.x || 1);
    clonedMesh.scale.set(scale, scale, scale);

    group.add(clonedMesh);
    
    // Position
    group.position.set(
      (x - GRID_SIZE/2)*TILE_SIZE + (w*TILE_SIZE)/2,
      0,
      (z - GRID_SIZE/2)*TILE_SIZE + (h*TILE_SIZE)/2
    );

    // Tag for clicking
    group.userData = { isBuilding: activeCategory !== 'road', gx: x, gz: z };
    scene.add(group);

    // Save to grid data
    for(let dz=0; dz<h; dz++) {
      for(let dx=0; dx<w; dx++) {
        gridData.current[`${x+dx}-${z+dz}`] = { level: 1, category: activeCategory, mesh: group };
      }
    }

    setMoney(m => m - cost);
    if (activeCategory === 'building') setPopulation(p => p + 10);

    // Spawn Traffic if road
    if (activeCategory === 'road') {
       // Spawn simple box cars for now
       const carGeo = new THREE.BoxGeometry(1, 1, 2);
       const carMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
       const car = new THREE.Mesh(carGeo, carMat);
       car.position.copy(group.position);
       car.position.y = 0.5;
       scene.add(car);
       agents.current.push({ mesh: car, x, z, tx: x, tz: z, prog: 0, speed: 0.02 });
    }
  };

  // --- 6. UPGRADE LOGIC ---
  const handleUpgrade = () => {
    if (!selectedBuilding || selectedBuilding.level >= MAX_LEVEL) return;
    const cost = selectedBuilding.level * 1000;
    if (money < cost) return;

    const key = `${selectedBuilding.x}-${selectedBuilding.z}`;
    const oldGroup = gridData.current[key].mesh;
    
    // Change appearance
    const nextLevelPath = `/models/buildings/level${selectedBuilding.level + 1}.glb`;
    const template = modelCache.current.get(nextLevelPath);
    
    if (template) {
      oldGroup.clear(); // Remove old model
      const clonedMesh = template.clone();
      // Scale to be slightly bigger
      const scale = 1.2 + (selectedBuilding.level * 0.2);
      clonedMesh.scale.set(scale, scale, scale);
      oldGroup.add(clonedMesh);
    }

    // Update Data
    gridData.current[key].level += 1;
    setSelectedBuilding({ ...selectedBuilding, level: selectedBuilding.level + 1 });
    setMoney(m => m - cost);
    setPopulation(p => p + 15);
  };

  return (
    <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white bg-slate-900 z-50 font-bold text-xl">Loading Models...</div>}
      
      {/* TOP HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2">
        <div className="flex gap-6 px-6 py-2 bg-gray-900/90 border border-gray-700 rounded-full shadow-lg text-white font-mono text-sm">
          <span className="text-green-400 font-bold">💰 ${money}</span>
          <span className="text-blue-400 font-bold">👥 {population}</span>
        </div>

        {/* CATEGORY BAR */}
        <div className="flex gap-2 p-1 bg-gray-900/80 border border-gray-700 rounded-xl shadow-xl">
          {(['road', 'building', 'shop', 'gov'] as Category[]).map(c => (
            <button
              key={c}
              onClick={() => { setActiveCategory(c); setSelectedModel(null); setSelectedBuilding(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                activeCategory === c ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {c === 'gov' ? 'Government' : c}
            </button>
          ))}
        </div>

        {/* SUB-MENU (Shows specific GLB files) */}
        <div className="flex gap-2 p-2 bg-gray-800/90 border border-gray-600 rounded-lg shadow-lg mt-1">
           {availableModels[activeCategory]?.map(m => (
             <button
               key={m.id}
               onClick={() => setSelectedModel(m)}
               className={`px-3 py-1 text-xs rounded-md font-semibold border ${
                 selectedModel?.id === m.id ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600'
               }`}
             >
               {m.name}
             </button>
           ))}
        </div>
      </div>

      {/* CLICKED BUILDING PANEL */}
      {selectedBuilding && (
        <div className="absolute top-32 right-4 w-64 bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl z-20 text-white p-4">
           <h2 className="text-lg font-bold capitalize mb-2">{selectedBuilding.category}</h2>
           <div className="flex justify-between text-sm mb-4">
             <span className="text-gray-400">Level</span>
             <span className="text-yellow-400 font-bold">{selectedBuilding.level} / 3</span>
           </div>
           
           {/* Only show upgrade button for standard buildings */}
           {selectedBuilding.category === 'building' ? (
             <button 
               onClick={handleUpgrade}
               disabled={selectedBuilding.level >= MAX_LEVEL || money < selectedBuilding.level * 1000}
               className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {selectedBuilding.level >= MAX_LEVEL ? 'Max Level' : `Upgrade ($${selectedBuilding.level * 1000})`}
             </button>
           ) : (
             <div className="text-xs text-center text-gray-500 italic mt-2">
               This building cannot be upgraded.
             </div>
           )}
           
           <button onClick={() => setSelectedBuilding(null)} className="w-full mt-2 py-1 bg-gray-800 rounded text-xs">Close</button>
        </div>
      )}

      {/* 3D MAP */}
      <div ref={mountRef} className="w-full h-full cursor-crosshair" />
    </div>
  );
         }
