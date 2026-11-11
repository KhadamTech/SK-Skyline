'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// --- CONSTANTS ---
const GRID_SIZE = 40;
const TILE_SIZE = 4;

type Category = 'road' | 'building' | 'shop' | 'gov';
type ModelOption = { name: string; path: string };

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [money, setMoney] = useState(100000);
  const [population, setPopulation] = useState(0);
  
  // UI State
  const [activeCategory, setActiveCategory] = useState<Category>('road');
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<{x: number, z: number, level: number, category: Category} | null>(null);

  // 3D Refs
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(45, 1, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());
  const gridData = useRef<Record<string, { level: number, category: Category, mesh: THREE.Object3D }>>({});
  const agents = useRef<{mesh: THREE.Object3D, x: number, z: number, tx: number, tz: number, prog: number, speed: number}[]>([]);

  // --- 1. DEFINE ALL YOUR EXACT FILES FROM SCREENSHOTS ---
  const categories: Record<Category, ModelOption[]> = {
    road: [
      { name: 'Straight Road', path: '/models/roads/road.glb' },
      { name: 'Road Lamp', path: '/models/roads/road_lamp.glb' },
      { name: 'Traffic Sign', path: '/models/roads/road_traffic_sign.glb' }
    ],
    building: [
      { name: 'Building Level 1', path: '/models/buildings/level1.glb' },
      { name: 'Building Level 2', path: '/models/buildings/level2.glb' },
      { name: 'Building Level 3', path: '/models/buildings/level3.glb' },
      { name: 'Building Level 4', path: '/models/buildings/level4.glb' },
      { name: 'Building Level 5', path: '/models/buildings/level5.glb' },
      { name: 'Building Level 6', path: '/models/buildings/level6.glb' },
      { name: 'Building Level 7', path: '/models/buildings/level7.glb' }
    ],
    shop: [
      // Assuming you upload these to the shops folder based on your screenshot
      { name: 'Shop 1', path: '/models/shops/shop1.glb' }
    ],
    gov: [
      { name: 'Airport Buildings', path: '/models/gov/airport_buildings.glb' },
      { name: 'Control Tower', path: '/models/gov/airport_control_tower.glb' },
      { name: 'Airport Transport', path: '/models/gov/airport_transport.glb' },
      { name: 'Gas Station 1', path: '/models/gov/gas_station1.glb' },
      { name: 'Gas Station 2', path: '/models/gov/gas_station2.glb' },
      { name: 'Giant Office', path: '/models/gov/giant_office_building.glb' },
      { name: 'Gov Office', path: '/models/gov/gov_office1.glb' },
      { name: 'Mini Office', path: '/models/gov/mini_office.glb' },
      { name: 'Old Office', path: '/models/gov/old_office_building.glb' },
      { name: 'Police Station 1', path: '/models/gov/police_station1.glb' },
      { name: 'Police Station 2', path: '/models/gov/police_station2.glb' }
    ]
  };

  // --- 2. LOAD ASSETS ---
  useEffect(() => {
    const loader = new GLTFLoader();
    let allPaths = Object.values(categories).flat().map(m => m.path);
    
    // Also load cars and pedestrians
    const carPaths = Array.from({length: 9}, (_, i) => `/models/cars/car${i+1}.glb`);
    const popPaths = Array.from({length: 4}, (_, i) => `/models/population/population${i+1}.glb`);
    allPaths = [...allPaths, ...carPaths, ...popPaths];

    let loaded = 0;
    allPaths.forEach(path => {
      loader.load(path, (gltf) => {
        modelCache.current.set(path, gltf.scene);
        loaded++;
        if (loaded >= allPaths.length) setLoading(false);
      }, undefined, () => {
        // Fallback for missing files
        const box = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE*0.9, 4, TILE_SIZE*0.9), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
        modelCache.current.set(path, box);
        loaded++;
        if (loaded >= allPaths.length) setLoading(false);
      });
    });
  }, []);

  // --- 3. SETUP 3D SCENE ---
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(hemiLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(-40, 60, 30);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -60;
    dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -60;
    scene.add(dirLight);

    // Ground Grid
    const gridHelper = new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x555555, 0x222222);
    scene.add(gridHelper);
    
    // Invisible ground for raycasting
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ visible: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    // CAMERA SETTINGS (Closer, Skyline Angle)
    camera.position.set(-30, 40, 40); // Angled view
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 15; // Prevents zooming out too far
    controls.maxDistance = 100;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controlsRef.current = controls;

    // RAYCASTER
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      // Ignore UI clicks
      if ((event.target as HTMLElement).tagName === 'BUTTON' || (event.target as HTMLElement).closest('.ui-panel')) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const hit of intersects) {
        if (hit.object.userData.isBuilding) {
          const { gx, gz, level, category } = hit.object.userData;
          setSelectedBuilding({ x: gx, z: gz, level, category });
          return;
        }
        if (hit.object.userData.isGround && selectedModel) {
          const gx = Math.floor(hit.point.x / TILE_SIZE + GRID_SIZE / 2);
          const gz = Math.floor(hit.point.z / TILE_SIZE + GRID_SIZE / 2);
          placeBuilding(gx, gz);
          return;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    // ANIMATION LOOP
    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
      
      // Traffic Logic
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
  }, [selectedModel]); // Re-bind when tool changes

  // --- 4. PLACEMENT LOGIC ---
  const placeBuilding = (x: number, z: number) => {
    if (!selectedModel || x < 0 || x >= GRID_SIZE || z < 0 || z >= GRID_SIZE) return;

    const costs: Record<Category, number> = { road: 10, building: 500, shop: 800, gov: 1500 };
    const cost = costs[activeCategory];
    if (money < cost) return;

    // Multi-tile footprints
    let w = 1, h = 1;
    if (activeCategory === 'building') { w = 2; h = 2; }
    if (activeCategory === 'shop') { w = 2; h = 2; }
    if (activeCategory === 'gov') { w = 3; h = 3; }

    // Check if space is occupied
    for(let dz=0; dz<h; dz++) {
      for(let dx=0; dx<w; dx++) {
        if (gridData.current[`${x+dx}-${z+dz}`]) return;
      }
    }

    const scene = sceneRef.current;
    const template = modelCache.current.get(selectedModel.path);
    if (!template) return;

    const group = new THREE.Group();
    const clonedMesh = template.clone();
    
    // Auto-scale to fit footprint
    const box = new THREE.Box3().setFromObject(clonedMesh);
    const size = box.getSize(new THREE.Vector3());
    const targetWidth = w * TILE_SIZE;
    const scale = targetWidth / (size.x || 1);
    clonedMesh.scale.set(scale, scale, scale);

    group.add(clonedMesh);
    
    group.position.set(
      (x - GRID_SIZE/2)*TILE_SIZE + (w*TILE_SIZE)/2,
      0,
      (z - GRID_SIZE/2)*TILE_SIZE + (h*TILE_SIZE)/2
    );

    group.userData = { isBuilding: true, gx: x, gz: z, level: 1, category: activeCategory };
    scene.add(group);

    for(let dz=0; dz<h; dz++) {
      for(let dx=0; dx<w; dx++) {
        gridData.current[`${x+dx}-${z+dz}`] = { level: 1, category: activeCategory, mesh: group };
      }
    }

    setMoney(m => m - cost);
    if (activeCategory === 'building') setPopulation(p => p + 15);

    // Spawn Traffic
    if (activeCategory === 'road' && agents.current.length < 30) {
       const carPath = `/models/cars/car${Math.floor(Math.random()*9)+1}.glb`;
       const carTemplate = modelCache.current.get(carPath);
       if (carTemplate) {
         const car = carTemplate.clone();
         car.position.copy(group.position);
         car.position.y = 0.5;
         car.scale.set(0.8, 0.8, 0.8);
         scene.add(car);
         agents.current.push({ mesh: car, x, z, tx: x, tz: z, prog: 0, speed: 0.02 });
       }
    }
  };

  // --- 5. UPGRADE LOGIC ---
  const handleUpgrade = () => {
    if (!selectedBuilding || selectedBuilding.level >= 7) return; // Max level 7 based on files
    const cost = selectedBuilding.level * 1000;
    if (money < cost) return;

    const key = `${selectedBuilding.x}-${selectedBuilding.z}`;
    const oldGroup = gridData.current[key].mesh;
    
    const nextLevelPath = `/models/buildings/level${selectedBuilding.level + 1}.glb`;
    const template = modelCache.current.get(nextLevelPath);
    
    if (template) {
      oldGroup.clear();
      const clonedMesh = template.clone();
      // Scale up slightly as it levels
      const scale = 1.5 + (selectedBuilding.level * 0.2);
      clonedMesh.scale.set(scale, scale, scale);
      oldGroup.add(clonedMesh);
    }

    gridData.current[key].level += 1;
    oldGroup.userData.level = selectedBuilding.level + 1;
    
    setSelectedBuilding({ ...selectedBuilding, level: selectedBuilding.level + 1 });
    setMoney(m => m - cost);
    setPopulation(p => p + 20);
  };

  return (
    <div className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white bg-slate-900 z-50 font-bold">Loading City Assets...</div>}
      
      {/* TOP HUD & CATEGORIES */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 ui-panel">
        <div className="flex gap-6 px-6 py-2 bg-gray-900/90 border border-gray-700 rounded-full shadow-lg text-white font-mono text-sm">
          <span className="text-green-400 font-bold">💰 ${money}</span>
          <span className="text-blue-400 font-bold">👥 {population}</span>
        </div>

        <div className="flex gap-2 p-1 bg-gray-900/80 border border-gray-700 rounded-xl shadow-xl">
          {(['road', 'building', 'shop', 'gov'] as Category[]).map(c => (
            <button
              key={c}
              onClick={() => { setActiveCategory(c); setSelectedModel(null); setSelectedBuilding(null); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${
                activeCategory === c ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {c === 'gov' ? 'Government' : c}
            </button>
          ))}
        </div>

        {/* SUB-MENU LISTING YOUR EXACT FILES */}
        <div className="flex flex-wrap justify-center gap-2 p-2 bg-gray-800/90 border border-gray-600 rounded-lg shadow-lg max-w-3xl">
           {categories[activeCategory].map(m => (
             <button
               key={m.path}
               onClick={() => setSelectedModel(m)}
               className={`px-3 py-1 text-xs rounded-md font-semibold border ${
                 selectedModel?.path === m.path ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600'
               }`}
             >
               {m.name}
             </button>
           ))}
        </div>
      </div>

      {/* CLICKED BUILDING PANEL */}
      {selectedBuilding && (
        <div className="absolute top-40 right-4 w-64 bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl z-20 text-white p-4 ui-panel">
           <h2 className="text-lg font-bold capitalize mb-2">{selectedBuilding.category}</h2>
           <div className="flex justify-between text-sm mb-4">
             <span className="text-gray-400">Level</span>
             <span className="text-yellow-400 font-bold">{selectedBuilding.level}</span>
           </div>
           
           {/* ONLY UPGRADE BUILDINGS */}
           {selectedBuilding.category === 'building' ? (
             <button 
               onClick={handleUpgrade}
               disabled={selectedBuilding.level >= 7 || money < selectedBuilding.level * 1000}
               className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-sm disabled:opacity-50"
             >
               {selectedBuilding.level >= 7 ? 'Max Level' : `Upgrade ($${selectedBuilding.level * 1000})`}
             </button>
           ) : (
             <div className="text-xs text-center text-gray-500 italic mt-2">
               This building cannot be upgraded.
             </div>
           )}
           
           <button onClick={() => setSelectedBuilding(null)} className="w-full mt-2 py-1 bg-gray-800 rounded text-xs hover:bg-gray-700">Close</button>
        </div>
      )}

      {/* 3D MAP */}
      <div ref={mountRef} className="w-full h-full cursor-crosshair" />
    </div>
  );
      }
