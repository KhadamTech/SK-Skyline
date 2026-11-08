'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createInitialState, placeBuilding, GRID_SIZE, TILE_SIZE } from '../game/engine';
import { GameState, BuildingType, Vehicle } from '../game/types';

export default function City3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GameState>(createInitialState());
  const [loading, setLoading] = useState(true);
  
  // Three.js refs
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(45, 1, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshesRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const vehiclesRef = useRef<Vehicle[]>([]);
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());

  // Load 3D Models
  useEffect(() => {
    const loader = new GLTFLoader();
    const models = ['residential', 'commercial', 'industrial', 'road', 'car'];
    let loadedCount = 0;

    models.forEach(name => {
      loader.load(`/models/${name}.glb`, (gltf) => {
        modelCache.current.set(name, gltf.scene);
        loadedCount++;
        if (loadedCount === models.length) setLoading(false);
      }, undefined, () => {
        // Fallback if no model exists
        const geo = new THREE.BoxGeometry(TILE_SIZE * 0.8, name === 'residential' ? 6 : name === 'commercial' ? 10 : 4, TILE_SIZE * 0.8);
        const mat = new THREE.MeshStandardMaterial({ color: name === 'road' ? 0x333333 : name === 'residential' ? 0x4ade80 : name === 'commercial' ? 0x60a5fa : 0xf87171 });
        modelCache.current.set(name, new THREE.Mesh(geo, mat));
        loadedCount++;
        if (loadedCount === models.length) setLoading(false);
      });
    });
  }, []);

  // Initialize Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Camera & Controls (Zoomable Map)
    camera.position.set(20, 30, 30);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.2; // Prevent going under ground
    controlsRef.current = controls;

    // Ground Grid
    const gridHelper = new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x888888, 0x444444);
    scene.add(gridHelper);

    // Raycaster for clicking
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      if (!mountRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children);
      
      // Find the ground plane intersection
      for (const intersect of intersects) {
        if (intersect.object.userData.isGround) {
          const p = intersect.point;
          const gx = Math.floor(p.x / TILE_SIZE + GRID_SIZE / 2);
          const gz = Math.floor(p.z / TILE_SIZE + GRID_SIZE / 2);
          if (gx >= 0 && gx < GRID_SIZE && gz >= 0 && gz < GRID_SIZE) {
            setState(prev => placeBuilding(prev, gx, gz, prev.selectedTool));
          }
          break;
        }
      }
    };

    // Invisible ground plane for raycasting
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);
    const groundMat = new THREE.MeshBasicMaterial({ visible: false });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    renderer.domElement.addEventListener('click', onClick);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      
      // Update vehicles
      vehiclesRef.current.forEach(v => {
        v.progress += v.speed;
        if (v.progress >= 1) {
          v.progress = 0;
          v.x = v.targetX;
          v.z = v.targetZ;
          
          // Find next road
          const dirs = [{x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}];
          const valid = dirs.filter(d => {
            const nx = v.x + d.x; const nz = v.z + d.z;
            return nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE && state.grid[nz][nx].type === 'road';
          });
          if (valid.length > 0) {
            const next = valid[Math.floor(Math.random() * valid.length)];
            v.targetX = v.x + next.x;
            v.targetZ = v.z + next.z;
          }
        }

        if (v.mesh) {
          const startX = (v.x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          const startZ = (v.z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          const endX = (v.targetX - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          const endZ = (v.targetZ - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2;
          
          v.mesh.position.x = startX + (endX - startX) * v.progress;
          v.mesh.position.z = startZ + (endZ - startZ) * v.progress;
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    // Resize handler
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', onClick);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []); // Run once

  // Render Grid state to 3D
  useEffect(() => {
    const scene = sceneRef.current;
    const cache = modelCache.current;

    // Remove old meshes not in grid
    // Simplified: rebuild all (fine for prototype)
    meshesRef.current.forEach(mesh => scene.remove(mesh));
    meshesRef.current.clear();

    // Add new meshes
    state.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.type !== 'empty') {
          const key = `${cell.x}-${cell.z}`;
          let mesh: THREE.Object3D;
          
          const template = cache.get(cell.type);
          if (template) {
            mesh = template.clone();
            // Randomize height slightly for residential
            if (cell.type === 'residential') {
              const scale = 0.8 + Math.random() * 0.6;
              mesh.scale.y = scale;
            }
          } else {
            // Fallback
            mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.8, 4, TILE_SIZE * 0.8), new THREE.MeshStandardMaterial({ color: 0x888888 }));
          }

          // Position
          mesh.position.set(
            (cell.x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
            cell.type === 'road' ? 0.05 : 0, // Road slightly above ground
            (cell.z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
          );
          
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          scene.add(mesh);
          meshesRef.current.set(key, mesh);

          // Spawn vehicle logic
          if (cell.type === 'road' && Math.random() > 0.8 && vehiclesRef.current.length < 20) {
            const carTemplate = cache.get('car');
            if (carTemplate) {
              const car = carTemplate.clone();
              car.position.copy(mesh.position);
              car.position.y = 0.5;
              scene.add(car);
              vehiclesRef.current.push({
                x: cell.x, z: cell.z, targetX: cell.x, targetZ: cell.z,
                progress: 0, speed: 0.01 + Math.random() * 0.02, mesh: car as THREE.Mesh
              });
            }
          }
        }
      });
    });
  }, [state.grid]);

  return (
    <div className="relative w-full h-screen bg-slate-900">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white z-50 bg-slate-900">Loading 3D Models...</div>}
      
      {/* Small Menu */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 p-2 bg-gray-900/90 backdrop-blur-md rounded-xl border border-gray-700 shadow-2xl">
        <div className="flex gap-4 px-4 items-center border-r border-gray-700 text-white font-mono text-sm">
          <span className="text-green-400">💰 ${state.money}</span>
          <span className="text-blue-400">👥 {state.population}</span>
        </div>
        <div className="flex gap-1">
          {(['road', 'residential', 'commercial', 'industrial'] as BuildingType[]).map(t => (
            <button
              key={t}
              onClick={() => setState({ ...state, selectedTool: t })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                state.selectedTool === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t === 'road' ? '🛣️ Road' : t === 'residential' ? '🏠 Homes' : t === 'commercial' ? '🏪 Shops' : '🏭 Industry'}
            </button>
          ))}
        </div>
      </div>

      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
            }
