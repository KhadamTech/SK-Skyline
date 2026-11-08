'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createInitialState, placeBuilding, upgradeBuilding, GRID_SIZE, TILE_SIZE } from '../game/engine';
import { GameState, BuildingType } from '../game/types';

export default function City3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<GameState>(createInitialState());
  const [loading, setLoading] = useState(true);
  
  const sceneRef = useRef<THREE.Scene>(new THREE.Scene());
  const cameraRef = useRef<THREE.PerspectiveCamera>(new THREE.PerspectiveCamera(45, 1, 0.1, 1000));
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());

  // 1. Load your GLB Models
  useEffect(() => {
    const loader = new GLTFLoader();
    // These match the files you uploaded to /public/models/
    const models = ['house-1', 'house-2', 'house-3', 'road', 'car']; 
    let loadedCount = 0;

    models.forEach(name => {
      loader.load(`/models/${name}.glb`, (gltf) => {
        modelCache.current.set(name, gltf.scene);
        loadedCount++;
        if (loadedCount === models.length) setLoading(false);
      }, undefined, (err) => {
        console.warn(`Could not load ${name}.glb, using fallback box.`);
        // Fallback boxes if models are missing
        const geo = new THREE.BoxGeometry(TILE_SIZE * 0.8, name === 'house-1' ? 3 : name === 'house-2' ? 6 : 10, TILE_SIZE * 0.8);
        const mat = new THREE.MeshStandardMaterial({ color: name.includes('house') ? 0x4ade80 : name === 'road' ? 0x333333 : 0xff0000 });
        modelCache.current.set(name, new THREE.Mesh(geo, mat));
        loadedCount++;
        if (loadedCount === models.length) setLoading(false);
      });
    });
  }, []);

  // 2. Scene Setup
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

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // Camera Controls (Zoom/Pan)
    camera.position.set(20, 30, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.2;

    // Ground Grid
    scene.add(new THREE.GridHelper(GRID_SIZE * TILE_SIZE, GRID_SIZE, 0x888888, 0x444444));

    // Invisible Raycast Plane
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshBasicMaterial({ visible: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.userData.isGround = true;
    scene.add(ground);

    // Click Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
      if (!mountRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      
      for (const intersect of intersects) {
        // If we clicked a building, UPGRADE it
        if (intersect.object.userData.isBuilding) {
          const gx = intersect.object.userData.gridX;
          const gz = intersect.object.userData.gridZ;
          setState(prev => upgradeBuilding(prev, gx, gz));
          return;
        }
        // If we clicked the ground, PLACE a building
        if (intersect.object.userData.isGround) {
          const p = intersect.point;
          const gx = Math.floor(p.x / TILE_SIZE + GRID_SIZE / 2);
          const gz = Math.floor(p.z / TILE_SIZE + GRID_SIZE / 2);
          setState(prev => placeBuilding(prev, gx, gz, prev.selectedTool));
          return;
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onClick);

    // Animation Loop
    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      controls.update();
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
      renderer.domElement.removeEventListener('pointerdown', onClick);
      cancelAnimationFrame(reqId);
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []); // Run once

  // 3. Render Grid (Updates when state changes)
  useEffect(() => {
    const scene = sceneRef.current;
    
    // Clear old meshes
    meshesRef.current.forEach(mesh => scene.remove(mesh));
    meshesRef.current.clear();

    state.grid.forEach(row => {
      row.forEach(cell => {
        if (cell.type !== 'empty') {
          const key = `${cell.x}-${cell.z}`;
          const group = new THREE.Group();
          
          let modelName = 'road';
          if (cell.type === 'residential') modelName = `house-${cell.level}`; // Selects house-1, house-2, or house-3
          
          const template = modelCache.current.get(modelName) || modelCache.current.get('house-1');
          
          if (template) {
            const mesh = template.clone();
            group.add(mesh);
          }

          // Position on grid
          group.position.set(
            (cell.x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
            0,
            (cell.z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
          );
          
          // Tag for Raycasting
          group.userData = { isBuilding: cell.type !== 'road', gridX: cell.x, gridZ: cell.z };
          group.traverse(child => { if (child instanceof THREE.Mesh) child.castShadow = true; });

          scene.add(group);
          meshesRef.current.set(key, group);
        }
      });
    });
  }, [state.grid]); // Triggers whenever you place or upgrade a building

  return (
    <div className="relative w-full h-screen bg-[#1e293b]">
      {loading && <div className="absolute inset-0 flex items-center justify-center text-white z-50">Loading 3D Models...</div>}
      
      {/* Menu */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 p-2 bg-gray-900/90 rounded-xl border border-gray-700 shadow-2xl">
        <div className="flex gap-4 px-4 items-center border-r border-gray-700 text-white font-mono text-sm">
          <span className="text-green-400">💰 ${state.money}</span>
          <span className="text-blue-400">👥 {state.population}</span>
          <span className="text-yellow-400">📈 +${state.income}/d</span>
        </div>
        <div className="flex gap-1">
          {(['road', 'residential', 'commercial', 'industrial'] as BuildingType[]).map(t => (
            <button
              key={t}
              onClick={() => setState({ ...state, selectedTool: t })}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                state.selectedTool === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
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
