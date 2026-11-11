
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// =====================================================
// SK SKYLINE - REALISTIC 3D CITY BUILDER
// =====================================================

const GRID_SIZE = 40;
const TILE_SIZE = 4;
const WORLD_SIZE = GRID_SIZE * TILE_SIZE;
const HALF_WORLD = WORLD_SIZE / 2;

type Category = 'road' | 'building' | 'shop' | 'gov';

type ModelOption = {
  name: string;
  path: string;
};

type BuildingSelection = {
  x: number;
  z: number;
  level: number;
  category: Category;
};

type GridItem = {
  level: number;
  category: Category;
  mesh: THREE.Group;
};

const CATEGORIES: Record<Category, ModelOption[]> = {
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

const COSTS: Record<Category, number> = {
  road: 10,
  building: 500,
  shop: 800,
  gov: 1500
};

// =====================================================
// FALLBACK 3D MODELS
// =====================================================

function createFallbackModel(path: string): THREE.Group {
  const group = new THREE.Group();

  const isRoad = path.includes('/roads/');
  const isShop = path.includes('/shops/');
  const isGov = path.includes('/gov/');

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x8995a5,
    roughness: 0.75
  });

  const glass = new THREE.MeshStandardMaterial({
    color: 0x55b9d8,
    metalness: 0.45,
    roughness: 0.2
  });

  const dark = new THREE.MeshStandardMaterial({
    color: 0x263345,
    roughness: 0.8
  });

  if (isRoad) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.12, 4),
      new THREE.MeshStandardMaterial({
        color: 0x303640,
        roughness: 0.95
      })
    );

    road.position.y = 0.06;
    road.receiveShadow = true;
    group.add(road);

    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.02, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xf4d35e })
    );

    line.position.y = 0.13;
    group.add(line);

    if (path.includes('lamp')) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 3.5, 10),
        dark
      );
      pole.position.set(1.4, 1.8, 0);
      group.add(pole);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe6a0 })
      );
      lamp.position.set(1.4, 3.6, 0);
      group.add(lamp);
    }

    if (path.includes('traffic_sign')) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2, 8),
        dark
      );
      pole.position.y = 1;
      group.add(pole);

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.65, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x2563eb })
      );
      sign.position.set(0, 1.8, 0);
      group.add(sign);
    }

    return group;
  }

  // Building / office / shop fallback
  const width = isGov ? 10 : isShop ? 6 : 7;
  const depth = isGov ? 10 : isShop ? 6 : 7;
  const height = isGov ? 10 : isShop ? 3.5 : 12;

  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: isGov ? 0xc2ccd9 : isShop ? 0xd5c5a4 : 0x9aaec1,
    roughness: 0.55,
    metalness: 0.12
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    buildingMaterial
  );

  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Windows
  const floors = Math.max(2, Math.floor(height / 2));
  const windowsAcross = Math.max(2, Math.floor(width / 1.5));

  for (let floor = 0; floor < floors; floor++) {
    for (let col = 0; col < windowsAcross; col++) {
      const windowMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.85, 0.08),
        glass
      );

      windowMesh.position.set(
        -width / 2 + 0.9 + col * ((width - 1.8) / Math.max(1, windowsAcross - 1)),
        1 + floor * (height / floors),
        depth / 2 + 0.045
      );

      group.add(windowMesh);
    }
  }

  // Roof
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 0.35, depth + 0.3),
    dark
  );

  roof.position.y = height + 0.17;
  roof.castShadow = true;
  group.add(roof);

  // Entrance
  const entrance = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x273d54 })
  );

  entrance.position.set(0, 1.1, depth / 2 + 0.1);
  group.add(entrance);

  return group;
}

// =====================================================
// NORMALIZE AND CENTER 3D MODELS
// =====================================================

function prepareModel(
  template: THREE.Object3D,
  width: number,
  depth: number
): THREE.Group {
  const root = new THREE.Group();
  const model = template.clone(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  const scaleX = width / Math.max(size.x, 0.01);
  const scaleZ = depth / Math.max(size.z, 0.01);

  // Preserve model proportions.
  const scale = Math.min(scaleX, scaleZ);

  model.scale.multiplyScalar(scale);

  model.position.x -= center.x * scale;
  model.position.z -= center.z * scale;
  model.position.y -= bounds.min.y * scale;

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;

      if (object.material) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        materials.forEach((material) => {
          material.side = THREE.FrontSide;
        });
      }
    }
  });

  root.add(model);
  return root;
}

// =====================================================
// MAIN GAME
// =====================================================

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [money, setMoney] = useState(100000);
  const [population, setPopulation] = useState(0);

  const [activeCategory, setActiveCategory] =
    useState<Category>('road');

  const [selectedModel, setSelectedModel] =
    useState<ModelOption | null>(null);

  const [selectedBuilding, setSelectedBuilding] =
    useState<BuildingSelection | null>(null);

  const [message, setMessage] = useState('');

  // Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());

  const gridData = useRef<Record<string, GridItem>>({});

  // Keep current UI values available to the Three.js event handler.
  const selectedModelRef = useRef<ModelOption | null>(null);
  const activeCategoryRef = useRef<Category>('road');
  const moneyRef = useRef(100000);

  const placeBuildingRef = useRef<(x: number, z: number) => void>(
    () => {}
  );

  selectedModelRef.current = selectedModel;
  activeCategoryRef.current = activeCategory;
  moneyRef.current = money;

  // ===================================================
  // LOAD ALL GLB ASSETS
  // ===================================================

  useEffect(() => {
    const loader = new GLTFLoader();

    const paths = [
      ...Object.values(CATEGORIES).flat().map((model) => model.path),
      ...Array.from(
        { length: 9 },
        (_, i) => `/models/cars/car${i + 1}.glb`
      ),
      ...Array.from(
        { length: 4 },
        (_, i) => `/models/population/population${i + 1}.glb`
      )
    ];

    let completed = 0;
    let active = true;

    const finish = () => {
      completed++;

      if (completed >= paths.length && active) {
        setLoading(false);
      }
    };

    paths.forEach((path) => {
      loader.load(
        path,
        (gltf) => {
          if (active) {
            modelCache.current.set(path, gltf.scene);
          }
          finish();
        },
        undefined,
        () => {
          if (active) {
            modelCache.current.set(
              path,
              createFallbackModel(path)
            );
          }
          finish();
        }
      );
    });

    return () => {
      active = false;
    };
  }, []);

  // ===================================================
  // CITY DECORATION
  // ===================================================

  const addEnvironment = (scene: THREE.Scene) => {
    // Large terrain
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2),
      new THREE.MeshStandardMaterial({
        color: 0x253e35,
        roughness: 1
      })
    );

    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.12;
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Main buildable ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x66786c,
        roughness: 1
      })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    scene.add(ground);

    // Subtle grid
    const grid = new THREE.GridHelper(
      WORLD_SIZE,
      GRID_SIZE,
      0x8caa9c,
      0x50685c
    );

    grid.position.y = 0.015;

    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.22;

    scene.add(grid);

    // Decorative trees around the map.
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x65452e
    });

    const leafMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x27734a }),
      new THREE.MeshStandardMaterial({ color: 0x368454 }),
      new THREE.MeshStandardMaterial({ color: 0x4a8a52 })
    ];

    for (let i = 0; i < 65; i++) {
      const tree = new THREE.Group();

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.2, 1.5, 7),
        trunkMaterial
      );

      trunk.position.y = 0.75;
      trunk.castShadow = true;
      tree.add(trunk);

      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(1.0, 2.3, 8),
        leafMaterials[i % leafMaterials.length]
      );

      leaves.position.y = 2.3;
      leaves.castShadow = true;
      tree.add(leaves);

      const angle = i * 2.399;
      const radius = 43 + (i % 8) * 1.8;

      tree.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );

      scene.add(tree);
    }
  };

  // ===================================================
  // BUILDING PLACEMENT
  // ===================================================

  const placeBuilding = useCallback((x: number, z: number) => {
    const model = selectedModelRef.current;
    const category = activeCategoryRef.current;
    const scene = sceneRef.current;

    if (!model || !scene) return;

    if (
      x < 0 ||
      z < 0 ||
      x >= GRID_SIZE ||
      z >= GRID_SIZE
    ) {
      setMessage('Outside city limits');
      return;
    }

    const cost = COSTS[category];

    if (moneyRef.current < cost) {
      setMessage('Not enough money!');
      return;
    }

    // Building footprints
    let width = 1;
    let depth = 1;

    if (category === 'building' || category === 'shop') {
      width = 2;
      depth = 2;
    }

    if (category === 'gov') {
      width = 3;
      depth = 3;
    }

    // Check map limits
    if (
      x + width > GRID_SIZE ||
      z + depth > GRID_SIZE
    ) {
      setMessage('Not enough building space');
      return;
    }

    // Check occupied tiles
    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        if (gridData.current[`${x + dx}-${z + dz}`]) {
          setMessage('This land is occupied');
          return;
        }
      }
    }

    const template = modelCache.current.get(model.path);

    if (!template) {
      setMessage('Model is still loading');
      return;
    }

    // Create the building group
    const group = new THREE.Group();

    const modelGroup = prepareModel(
      template,
      width * TILE_SIZE * 0.88,
      depth * TILE_SIZE * 0.88
    );

    group.add(modelGroup);

    group.position.set(
      (x - GRID_SIZE / 2) * TILE_SIZE +
        (width * TILE_SIZE) / 2,
      0.03,
      (z - GRID_SIZE / 2) * TILE_SIZE +
        (depth * TILE_SIZE) / 2
    );

    group.userData = {
      cityItem: true,
      gx: x,
      gz: z,
      width,
      depth,
      level: 1,
      category,
      modelPath: model.path
    };

    scene.add(group);

    // Register all occupied tiles
    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        gridData.current[`${x + dx}-${z + dz}`] = {
          level: 1,
          category,
          mesh: group
        };
      }
    }

    // Charge money
    moneyRef.current -= cost;
    setMoney(moneyRef.current);

    // Population
    if (category === 'building') {
      setPopulation((p) => p + 15);
    } else if (category === 'shop') {
      setPopulation((p) => p + 8);
    } else if (category === 'gov') {
      setPopulation((p) => p + 5);
    }

    setSelectedBuilding({
      x,
      z,
      level: 1,
      category
    });

    setMessage(`${model.name} constructed!`);
  }, []);

  placeBuildingRef.current = placeBuilding;

  // ===================================================
  // BUILDING UPGRADES
  // ===================================================

  const handleUpgrade = () => {
    if (!selectedBuilding) return;

    if (selectedBuilding.category !== 'building') return;

    const currentLevel = selectedBuilding.level;

    if (currentLevel >= 7) {
      setMessage('Maximum building level reached');
      return;
    }

    const cost = currentLevel * 1000;

    if (moneyRef.current < cost) {
      setMessage('Not enough money for upgrade');
      return;
    }

    const key = `${selectedBuilding.x}-${selectedBuilding.z}`;
    const item = gridData.current[key];

    if (!item) return;

    const nextLevel = currentLevel + 1;

    const nextPath = `/models/buildings/level${nextLevel}.glb`;
    const template = modelCache.current.get(nextPath);

    if (!template) {
      setMessage('Upgrade model is unavailable');
      return;
    }

    const group = item.mesh;

    // Remove previous model without disposing shared cached geometry.
    group.clear();

    const width = group.userData.width || 2;
    const depth = group.userData.depth || 2;

    const upgradedModel = prepareModel(
      template,
      width * TILE_SIZE * 0.88,
      depth * TILE_SIZE * 0.88
    );

    group.add(upgradedModel);

    group.userData.level = nextLevel;
    group.userData.modelPath = nextPath;

    // Update all occupied tiles.
    Object.values(gridData.current).forEach((tile) => {
      if (tile.mesh === group) {
        tile.level = nextLevel;
      }
    });

    moneyRef.current -= cost;
    setMoney(moneyRef.current);

    // Upgrade reward
    setPopulation((p) => p + 20);

    setSelectedBuilding({
      ...selectedBuilding,
      level: nextLevel
    });

    setMessage(`Building upgraded to level ${nextLevel}!`);
  };

  // ===================================================
  // PASSIVE CITY INCOME
  // ===================================================

  useEffect(() => {
    const interval = window.setInterval(() => {
      const buildings = new Set(
        Object.values(gridData.current).map((item) => item.mesh)
      );

      let income = 0;

      buildings.forEach((group) => {
        const category = group.userData.category;
        const level = group.userData.level || 1;

        if (category === 'building') {
          income += 15 * level;
        } else if (category === 'shop') {
          income += 30;
        } else if (category === 'gov') {
          income += 50;
        }
      });

      if (income > 0) {
        setMoney((current) => current + income);
        moneyRef.current += income;
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  // ===================================================
  // THREE.JS SCENE SETUP
  // ===================================================

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0x91b9ce);
    scene.fog = new THREE.Fog(0x91b9ce, 100, 230);

    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      48,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      600
    );

    camera.position.set(-42, 55, 48);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2)
    );

    renderer.setSize(
      mount.clientWidth,
      mount.clientHeight
    );

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const hemisphere = new THREE.HemisphereLight(
      0xddeeff,
      0x42533f,
      2
    );

    scene.add(hemisphere);

    const sunlight = new THREE.DirectionalLight(
      0xfff1d6,
      3
    );

    sunlight.position.set(-45, 80, 35);
    sunlight.castShadow = true;

    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -100;
    sunlight.shadow.camera.right = 100;
    sunlight.shadow.camera.top = 100;
    sunlight.shadow.camera.bottom = -100;
    sunlight.shadow.bias = -0.0003;

    scene.add(sunlight);

    // Environment
    addEnvironment(scene);

    // Camera controls
    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    controls.target.set(0, 0, 0);

    controls.minDistance = 18;
    controls.maxDistance = 145;

    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minPolarAngle = 0.25;

    controls.enablePan = true;
    controls.screenSpacePanning = false;

    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };

    controlsRef.current = controls;

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;

      if (target.closest('.ui-panel')) return;

      const rect = renderer.domElement.getBoundingClientRect();

      pointer.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;

      pointer.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(
        scene.children,
        true
      );

      for (const hit of intersects) {
        // Find the city building parent.
        let current: THREE.Object3D | null = hit.object;

        while (current && current !== scene) {
          if (current.userData.cityItem) {
            setSelectedBuilding({
              x: current.userData.gx,
              z: current.userData.gz,
              level: current.userData.level,
              category: current.userData.category
            });

            return;
          }

          current = current.parent;
        }

        // Ground placement
        if (hit.object.userData.isGround) {
          const gx = Math.floor(
            (hit.point.x + HALF_WORLD) / TILE_SIZE
          );

          const gz = Math.floor(
            (hit.point.z + HALF_WORLD) / TILE_SIZE
          );

          if (selectedModelRef.current) {
            placeBuildingRef.current(gx, gz);
          } else {
            setSelectedBuilding(null);
          }

          return;
        }
      }
    };

    renderer.domElement.addEventListener(
      'pointerdown',
      handlePointerDown
    );

    // Responsive resizing
    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      if (!width || !height) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Rendering loop
    let animationId = 0;
    let active = true;

    const animate = () => {
      if (!active) return;

      animationId = requestAnimationFrame(animate);

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      active = false;

      cancelAnimationFrame(animationId);

      window.removeEventListener('resize', handleResize);

      renderer.domElement.removeEventListener(
        'pointerdown',
        handlePointerDown
      );

      controls.dispose();
      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      scene.clear();

      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;

      gridData.current = {};
    };
  }, []);

  // ===================================================
  // UI
  // ===================================================

  const categoryNames: Record<Category, string> = {
    road: 'Road',
    building: 'Building',
    shop: 'Shop',
    gov: 'Government'
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white">

      {/* LOADING */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950">
          <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />

          <h2 className="text-xl font-bold">
            SK SKYLINE
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Loading city assets...
          </p>
        </div>
      )}

      {/* THREE.JS CANVAS */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full"
      />

      {/* TOP HUD */}
      <div className="ui-panel absolute left-1/2 top-3 z-20 flex w-[95%] max-w-5xl -translate-x-1/2 flex-col items-center gap-2">

        <div className="flex items-center justify-center gap-7 rounded-full border border-white/20 bg-slate-950/85 px-7 py-3 shadow-xl backdrop-blur-xl">

          <div className="flex items-center gap-2">
            <span className="text-xl">💰</span>
            <span className="font-bold text-green-400">
              ${money.toLocaleString()}
            </span>
          </div>

          <div className="h-7 w-px bg-white/20" />

          <div className="flex items-center gap-2">
            <span className="text-xl">👥</span>
            <span className="font-bold text-blue-400">
              {population.toLocaleString()}
            </span>
          </div>

        </div>

        {/* CATEGORY MENU */}
        <div className="flex w-full justify-center gap-1 overflow-x-auto rounded-2xl border border-white/15 bg-slate-950/85 p-2 shadow-xl backdrop-blur-xl">

          {(Object.keys(CATEGORIES) as Category[]).map((category) => (
            <button
              key={category}
              onClick={() => {
                setActiveCategory(category);
                setSelectedModel(null);
                setSelectedBuilding(null);
              }}
              className={`min-w-0 flex-1 whitespace-nowrap rounded-xl px-3 py-3 text-xs font-bold uppercase transition sm:px-6 sm:text-sm ${
                activeCategory === category
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:bg-white/10'
              }`}
            >
              {categoryNames[category]}
            </button>
          ))}

        </div>

        {/* MODEL SELECTION */}
        <div className="max-h-36 w-full overflow-y-auto rounded-xl border border-white/15 bg-slate-900/90 p-3 shadow-xl backdrop-blur-xl">

          <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Select {categoryNames[activeCategory]}
          </div>

          <div className="flex flex-wrap justify-center gap-2">

            {CATEGORIES[activeCategory].map((model) => (
              <button
                key={model.path}
                onClick={() => {
                  setSelectedModel(model);
                  setSelectedBuilding(null);
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  selectedModel?.path === model.path
                    ? 'border-green-400 bg-green-600 text-white'
                    : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {model.name}
              </button>
            ))}

          </div>
        </div>

      </div>

      {/* SELECTED BUILDING PANEL */}
      {selectedBuilding && (
        <div className="ui-panel absolute right-3 top-52 z-30 w-64 max-w-[75vw] rounded-2xl border border-white/20 bg-slate-950/95 p-4 shadow-2xl backdrop-blur-xl">

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              {categoryNames[selectedBuilding.category]}
            </h2>

            <button
              onClick={() => setSelectedBuilding(null)}
              className="rounded-lg bg-white/10 px-2 py-1 text-slate-300"
            >
              ✕
            </button>
          </div>

          <div className="mb-4 rounded-xl bg-slate-800 p-3">

            <div className="flex justify-between text-sm">
              <span className="text-slate-400">
                Building level
              </span>

              <span className="font-bold text-yellow-400">
                {selectedBuilding.level}/7
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-400"
                style={{
                  width: `${(selectedBuilding.level / 7) * 100}%`
                }}
              />
            </div>

          </div>

          {selectedBuilding.category === 'building' ? (

            <button
              onClick={handleUpgrade}
              disabled={
                selectedBuilding.level >= 7 ||
                money < selectedBuilding.level * 1000
              }
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {selectedBuilding.level >= 7
                ? 'MAXIMUM LEVEL'
                : `⬆ UPGRADE - $${(
                    selectedBuilding.level * 1000
                  ).toLocaleString()}`}
            </button>

          ) : (

            <p className="text-center text-xs text-slate-400">
              This building does not support upgrades.
            </p>

          )}

          <p className="mt-3 text-center text-[10px] text-slate-500">
            Upgrade buildings to increase city population and income.
          </p>

        </div>
      )}

      {/* MESSAGE */}
      {message && (
        <div className="ui-panel absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-white/20 bg-slate-950/95 px-5 py-3 text-center text-sm font-semibold shadow-xl">
          {message}
          <button
            onClick={() => setMessage('')}
            className="ml-3 text-slate-400"
          >
            ✕
          </button>
        </div>
      )}

      {/* BUILD MODE */}
      <div className="ui-panel absolute bottom-4 right-3 z-20 rounded-xl border border-white/15 bg-slate-950/85 px-4 py-3 text-right backdrop-blur-xl">

        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Build mode
        </p>

        <p className="text-sm font-bold text-green-400">
          {selectedModel ? selectedModel.name : 'Select a model'}
        </p>

        <p className="mt-1 text-[10px] text-slate-400">
          {selectedModel
            ? 'Tap empty land to construct'
            : 'Choose an item above'}
        </p>

      </div>

    </main>
  );
}
