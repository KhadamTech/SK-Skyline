
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ======================================================
// SK SKYLINE CITY BUILDER
// ======================================================

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
  driveable: boolean;
};

type CarAgent = {
  mesh: THREE.Group;
  x: number;
  z: number;
  tx: number;
  tz: number;
  progress: number;
  speed: number;
};

type PersonAgent = {
  mesh: THREE.Group;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  progress: number;
  speed: number;
  direction: number;
};

const CATEGORIES: Record<Category, ModelOption[]> = {
  road: [
    { name: 'Straight Road', path: '/models/roads/road.glb' },
    { name: 'Road Lamp', path: '/models/roads/road_lamp.glb' },
    { name: 'Traffic Sign', path: '/models/roads/road_traffic_sign.glb' }
  ],

  // Only Level 1 appears in the building menu.
  // Levels 2-7 are loaded separately for upgrading.
  building: [
    { name: 'Building Level 1', path: '/models/buildings/level1.glb' }
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

const UPGRADE_PATHS = Array.from(
  { length: 7 },
  (_, i) => `/models/buildings/level${i + 1}.glb`
);

const CAR_PATHS = Array.from(
  { length: 8 },
  (_, i) => `/models/cars/car${i + 1}.glb`
);

const PERSON_PATHS = Array.from(
  { length: 4 },
  (_, i) => `/models/population/population${i + 1}.glb`
);

const COSTS: Record<Category, number> = {
  road: 10,
  building: 500,
  shop: 800,
  gov: 1500
};

const CATEGORY_NAMES: Record<Category, string> = {
  road: 'Road',
  building: 'Building',
  shop: 'Shop',
  gov: 'Government'
};

// ======================================================
// FALLBACK MODELS
// ======================================================

function createFallbackModel(path: string): THREE.Group {
  const group = new THREE.Group();

  if (path.includes('/cars/')) {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.65, 3.2),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(
          (Number(path.match(/car(\d+)/)?.[1] || 1) * 0.13) % 1,
          0.7,
          0.48
        ),
        metalness: 0.4,
        roughness: 0.3
      })
    );

    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.65, 1.7),
      new THREE.MeshStandardMaterial({
        color: 0x75b7d5,
        metalness: 0.5,
        roughness: 0.2
      })
    );

    cabin.position.set(0, 1.2, -0.15);
    group.add(cabin);

    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x151515
    });

    for (const x of [-0.9, 0.9]) {
      for (const z of [-1, 1]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12),
          wheelMaterial
        );

        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.35, z);
        group.add(wheel);
      }
    }

    return group;
  }

  if (path.includes('/population/')) {
    const id = Number(path.match(/population(\d+)/)?.[1] || 1);

    const colors = [
      0x2563eb,
      0xdc6040,
      0x16a36a,
      0xb16ad8
    ];

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.85, 9),
      new THREE.MeshStandardMaterial({ color: colors[id - 1] })
    );

    body.position.y = 0.7;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xd9a77d })
    );

    head.position.y = 1.25;
    group.add(head);

    return group;
  }

  const isRoad = path.includes('/roads/');
  const isGov = path.includes('/gov/');
  const isShop = path.includes('/shops/');

  if (isRoad) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.12, 4),
      new THREE.MeshStandardMaterial({
        color: 0x30343c,
        roughness: 0.95
      })
    );

    road.position.y = 0.06;
    road.receiveShadow = true;
    group.add(road);

    if (path.includes('road.glb')) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.025, 1.3),
        new THREE.MeshBasicMaterial({ color: 0xf6d365 })
      );

      line.position.y = 0.13;
      group.add(line);
    }

    if (path.includes('lamp')) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.1, 3.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x343c49 })
      );

      pole.position.set(1.4, 1.8, 0);
      group.add(pole);

      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.23, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffe6a0 })
      );

      lamp.position.set(1.4, 3.6, 0);
      group.add(lamp);
    }

    if (path.includes('traffic_sign')) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2, 8),
        new THREE.MeshStandardMaterial({ color: 0x777777 })
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

  // Building fallback
  const width = isGov ? 10 : isShop ? 6 : 7;
  const depth = isGov ? 10 : isShop ? 6 : 7;
  const height = isGov ? 10 : isShop ? 3.5 : 12;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color: isGov ? 0xc3cbd5 : isShop ? 0xd6c5a3 : 0x849db7,
      roughness: 0.55,
      metalness: 0.12
    })
  );

  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const glass = new THREE.MeshStandardMaterial({
    color: 0x55b9d8,
    metalness: 0.45,
    roughness: 0.2
  });

  const floors = Math.max(2, Math.floor(height / 2));
  const columns = Math.max(2, Math.floor(width / 1.5));

  for (let floor = 0; floor < floors; floor++) {
    for (let col = 0; col < columns; col++) {
      const windowMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.85, 0.08),
        glass
      );

      windowMesh.position.set(
        -width / 2 + 0.9 +
          col * ((width - 1.8) / Math.max(1, columns - 1)),
        1 + floor * (height / floors),
        depth / 2 + 0.045
      );

      group.add(windowMesh);
    }
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 0.35, depth + 0.3),
    new THREE.MeshStandardMaterial({ color: 0x263345 })
  );

  roof.position.y = height + 0.17;
  roof.castShadow = true;
  group.add(roof);

  const entrance = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x273d54 })
  );

  entrance.position.set(0, 1.1, depth / 2 + 0.1);
  group.add(entrance);

  return group;
}

// ======================================================
// MODEL NORMALIZATION
// ======================================================

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

  const scale = Math.min(
    width / Math.max(size.x, 0.01),
    depth / Math.max(size.z, 0.01)
  );

  model.scale.multiplyScalar(scale);

  model.position.x -= center.x * scale;
  model.position.z -= center.z * scale;
  model.position.y -= bounds.min.y * scale;

  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  root.add(model);
  return root;
}

function worldPosition(x: number, z: number) {
  return {
    x: (x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
    z: (z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
  };
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [money, setMoney] = useState(100000);
  const [population, setPopulation] = useState(0);

  const [activeCategory, setActiveCategory] =
    useState<Category>('road');

  const [menuOpen, setMenuOpen] = useState(false);

  const [selectedModel, setSelectedModel] =
    useState<ModelOption | null>(null);

  const [selectedBuilding, setSelectedBuilding] =
    useState<BuildingSelection | null>(null);

  const [message, setMessage] = useState('');

  const sceneRef = useRef<THREE.Scene | null>(null);

  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());

  const gridData = useRef<Record<string, GridItem>>({});

  const cars = useRef<CarAgent[]>([]);
  const people = useRef<PersonAgent[]>([]);

  const selectedModelRef = useRef<ModelOption | null>(null);
  const activeCategoryRef = useRef<Category>('road');
  const moneyRef = useRef(100000);

  const placeBuildingRef = useRef<(x: number, z: number) => void>(
    () => {}
  );

  selectedModelRef.current = selectedModel;
  activeCategoryRef.current = activeCategory;
  moneyRef.current = money;

  // ====================================================
  // LOAD MODELS
  // ====================================================

  useEffect(() => {
    const loader = new GLTFLoader();

    const allPaths = [
      ...Object.values(CATEGORIES).flat().map((m) => m.path),
      ...UPGRADE_PATHS,
      ...CAR_PATHS,
      ...PERSON_PATHS
    ];

    const paths = [...new Set(allPaths)];

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

  // ====================================================
  // ENVIRONMENT
  // ====================================================

  const addEnvironment = (scene: THREE.Scene) => {
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

    const grid = new THREE.GridHelper(
      WORLD_SIZE,
      GRID_SIZE,
      0x9eb8a8,
      0x62786c
    );

    grid.position.y = 0.015;

    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.2;

    scene.add(grid);

    // Trees outside the main construction area
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x65452e
    });

    const leafMaterial = new THREE.MeshStandardMaterial({
      color: 0x368454
    });

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
        new THREE.ConeGeometry(1, 2.3, 8),
        leafMaterial
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

  // ====================================================
  // ROAD NETWORK
  // ====================================================

  const isRoad = (x: number, z: number) => {
    const item = gridData.current[`${x}-${z}`];
    return !!item && item.driveable;
  };

  const getRoadNeighbors = (x: number, z: number) => {
    const directions = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 }
    ];

    return directions.filter((direction) =>
      isRoad(x + direction.x, z + direction.z)
    );
  };

  // ====================================================
  // AUTOMATIC CAR SPAWNING
  // ====================================================

  const spawnCar = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;

    if (!scene || cars.current.length >= 35) return;

    const path = CAR_PATHS[
      Math.floor(Math.random() * CAR_PATHS.length)
    ];

    const template = modelCache.current.get(path);

    if (!template) return;

    const car = prepareModel(template, 2.7, 2.0);
    const position = worldPosition(x, z);

    car.position.set(position.x, 0.14, position.z);
    scene.add(car);

    const agent: CarAgent = {
      mesh: car,
      x,
      z,
      tx: x,
      tz: z,
      progress: 0,
      speed: 0.006 + Math.random() * 0.005
    };

    const neighbors = getRoadNeighbors(x, z);

    if (neighbors.length > 0) {
      const next = neighbors[
        Math.floor(Math.random() * neighbors.length)
      ];

      agent.tx = x + next.x;
      agent.tz = z + next.z;
    }

    cars.current.push(agent);
  }, []);

  // ====================================================
  // AUTOMATIC PEDESTRIAN SPAWNING
  // ====================================================

  const spawnPerson = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;

    if (!scene || people.current.length >= 60) return;

    const path = PERSON_PATHS[
      Math.floor(Math.random() * PERSON_PATHS.length)
    ];

    const template = modelCache.current.get(path);

    if (!template) return;

    const person = prepareModel(template, 0.65, 0.65);

    const home = worldPosition(x, z);

    const startX = home.x + (Math.random() - 0.5) * 7;
    const startZ = home.z + (Math.random() - 0.5) * 7;

    person.position.set(startX, 0.04, startZ);

    scene.add(person);

    const agent: PersonAgent = {
      mesh: person,
      homeX: home.x,
      homeZ: home.z,
      x: startX,
      z: startZ,
      tx: startX,
      tz: startZ,
      progress: 0,
      speed: 0.004 + Math.random() * 0.003,
      direction: 0
    };

    choosePersonDestination(agent);

    people.current.push(agent);
  }, []);

  function choosePersonDestination(agent: PersonAgent) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 5;

    agent.tx = agent.homeX + Math.cos(angle) * radius;
    agent.tz = agent.homeZ + Math.sin(angle) * radius;

    agent.direction = Math.atan2(
      agent.tx - agent.x,
      agent.tz - agent.z
    );

    agent.progress = 0;
  }

  // ====================================================
  // BUILDING PLACEMENT
  // ====================================================

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

    if (x + width > GRID_SIZE || z + depth > GRID_SIZE) {
      setMessage('Not enough building space');
      return;
    }

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
      setMessage('Model is loading');
      return;
    }

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

    const driveable =
      category === 'road' &&
      model.path === '/models/roads/road.glb';

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

    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        gridData.current[`${x + dx}-${z + dz}`] = {
          level: 1,
          category,
          mesh: group,
          driveable
        };
      }
    }

    moneyRef.current -= cost;
    setMoney(moneyRef.current);

    if (category === 'building') {
      setPopulation((p) => p + 15);

      // Pedestrians appear around new buildings.
      for (let i = 0; i < 4; i++) {
        spawnPerson(x, z);
      }
    }

    if (category === 'shop') {
      setPopulation((p) => p + 8);

      for (let i = 0; i < 3; i++) {
        spawnPerson(x, z);
      }
    }

    if (category === 'gov') {
      setPopulation((p) => p + 5);

      for (let i = 0; i < 3; i++) {
        spawnPerson(x, z);
      }
    }

    setSelectedBuilding({
      x,
      z,
      level: 1,
      category
    });

    // A newly constructed road automatically creates a car.
    if (driveable) {
      spawnCar(x, z);
    }

    setMessage(`${model.name} constructed!`);
  }, [spawnCar, spawnPerson]);

  placeBuildingRef.current = placeBuilding;

  // ====================================================
  // BUILDING UPGRADES
  // ====================================================

  const handleUpgrade = () => {
    if (!selectedBuilding) return;

    if (selectedBuilding.category !== 'building') return;

    const currentLevel = selectedBuilding.level;

    if (currentLevel >= 7) {
      setMessage('Maximum level reached!');
      return;
    }

    const cost = currentLevel * 1000;

    if (moneyRef.current < cost) {
      setMessage('Not enough money!');
      return;
    }

    const key = `${selectedBuilding.x}-${selectedBuilding.z}`;
    const item = gridData.current[key];

    if (!item) return;

    const nextLevel = currentLevel + 1;

    const nextPath = `/models/buildings/level${nextLevel}.glb`;
    const template = modelCache.current.get(nextPath);

    if (!template) {
      setMessage('Upgrade model unavailable');
      return;
    }

    const group = item.mesh;

    // Replace the model while preserving its position.
    group.clear();

    const upgradedModel = prepareModel(
      template,
      2 * TILE_SIZE * 0.88,
      2 * TILE_SIZE * 0.88
    );

    group.add(upgradedModel);

    group.userData.level = nextLevel;
    group.userData.modelPath = nextPath;

    // Update all four occupied tiles.
    Object.values(gridData.current).forEach((tile) => {
      if (tile.mesh === group) {
        tile.level = nextLevel;
      }
    });

    moneyRef.current -= cost;
    setMoney(moneyRef.current);

    // Upgrade rewards
    setPopulation((p) => p + 20);

    setSelectedBuilding({
      ...selectedBuilding,
      level: nextLevel
    });

    setMessage(`Building upgraded to Level ${nextLevel}!`);
  };

  // ====================================================
  // AUTOMATIC CITY INCOME
  // ====================================================

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
        moneyRef.current += income;
        setMoney(moneyRef.current);
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, []);

  // ====================================================
  // THREE.JS SCENE
  // ====================================================

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) return;

    const scene = new THREE.Scene();

    scene.background = new THREE.Color(0x91b9ce);
    scene.fog = new THREE.Fog(0x91b9ce, 100, 230);

    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      48,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      600
    );

    camera.position.set(-42, 55, 48);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 1.75)
    );

    renderer.setSize(mount.clientWidth, mount.clientHeight);

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    mount.appendChild(renderer.domElement);

    // Lighting
    scene.add(
      new THREE.HemisphereLight(0xddeeff, 0x42533f, 2)
    );

    const sunlight = new THREE.DirectionalLight(0xfff1d6, 3);

    sunlight.position.set(-45, 80, 35);
    sunlight.castShadow = true;

    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.camera.left = -100;
    sunlight.shadow.camera.right = 100;
    sunlight.shadow.camera.top = 100;
    sunlight.shadow.camera.bottom = -100;
    sunlight.shadow.bias = -0.0003;

    scene.add(sunlight);

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

    controls.enablePan = true;

    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };

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

    // Resize
    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      if (!width || !height) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // ==================================================
    // ANIMATION LOOP: CARS AND PEOPLE
    // ==================================================

    let animationId = 0;
    let active = true;

    const animate = () => {
      if (!active) return;

      animationId = requestAnimationFrame(animate);

      // CAR MOVEMENT
      cars.current.forEach((car) => {
        if (car.tx === car.x && car.tz === car.z) {
          const neighbors = getRoadNeighbors(car.x, car.z);

          if (neighbors.length > 0) {
            const next = neighbors[
              Math.floor(Math.random() * neighbors.length)
            ];

            car.tx = car.x + next.x;
            car.tz = car.z + next.z;
          }

          return;
        }

        car.progress += car.speed;

        if (car.progress >= 1) {
          car.progress = 0;
          car.x = car.tx;
          car.z = car.tz;

          const neighbors = getRoadNeighbors(car.x, car.z).filter(
            (next) => {
              const nx = car.x + next.x;
              const nz = car.z + next.z;

              return !(nx === car.x - (car.tx - car.x) &&
                nz === car.z - (car.tz - car.z));
            }
          );

          const available =
            neighbors.length > 0
              ? neighbors
              : getRoadNeighbors(car.x, car.z);

          if (available.length > 0) {
            const next = available[
              Math.floor(Math.random() * available.length)
            ];

            car.tx = car.x + next.x;
            car.tz = car.z + next.z;
          } else {
            car.tx = car.x;
            car.tz = car.z;
          }
        }

        const start = worldPosition(car.x, car.z);
        const end = worldPosition(car.tx, car.tz);

        car.mesh.position.x =
          start.x + (end.x - start.x) * car.progress;

        car.mesh.position.z =
          start.z + (end.z - start.z) * car.progress;

        if (car.tx !== car.x || car.tz !== car.z) {
          car.mesh.rotation.y = Math.atan2(
            end.x - start.x,
            end.z - start.z
          );
        }
      });

      // PEDESTRIAN MOVEMENT
      people.current.forEach((person) => {
        person.progress += person.speed;

        if (person.progress >= 1) {
          person.x = person.tx;
          person.z = person.tz;

          choosePersonDestination(person);
        }

        person.mesh.position.x =
          person.x + (person.tx - person.x) * person.progress;

        person.mesh.position.z =
          person.z + (person.tz - person.z) * person.progress;

        person.mesh.rotation.y = person.direction;
      });

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

      cars.current = [];
      people.current = [];
      gridData.current = {};

      sceneRef.current = null;
    };
  }, []);

  // ====================================================
  // USER INTERFACE
  // ====================================================

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white">

      {/* 3D GAME */}
      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full"
      />

      {/* LOADING */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950">
          <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />

          <h2 className="text-xl font-bold">
            SK SKYLINE
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            Loading city...
          </p>
        </div>
      )}

      {/* COMPACT TOP HUD */}
      <div className="ui-panel absolute left-1/2 top-2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">

        {/* MONEY AND POPULATION */}
        <div className="flex items-center gap-5 rounded-full border border-white/20 bg-slate-950/90 px-5 py-2 shadow-xl backdrop-blur-xl">

          <span className="whitespace-nowrap text-sm font-bold text-green-400">
            💰 ${money.toLocaleString()}
          </span>

          <span className="h-5 w-px bg-white/20" />

          <span className="whitespace-nowrap text-sm font-bold text-blue-400">
            👥 {population.toLocaleString()}
          </span>

        </div>

        {/* ONE-LINE CATEGORY MENU */}
        <div className="flex w-max max-w-[96vw] items-center gap-1 overflow-x-auto rounded-xl border border-white/20 bg-slate-950/90 p-1.5 shadow-xl backdrop-blur-xl">

          {(Object.keys(CATEGORIES) as Category[]).map((category) => (
            <button
              key={category}
              onClick={() => {
                if (activeCategory === category && menuOpen) {
                  setMenuOpen(false);
                  return;
                }

                setActiveCategory(category);
                setSelectedModel(null);
                setSelectedBuilding(null);
                setMenuOpen(true);
              }}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold uppercase transition sm:px-5 sm:text-sm ${
                activeCategory === category && menuOpen
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {CATEGORY_NAMES[category]}
            </button>
          ))}

        </div>

        {/* ONLY SHOW ITEMS AFTER CATEGORY CLICK */}
        {menuOpen && (
          <div className="max-h-32 w-[94vw] max-w-3xl overflow-y-auto rounded-xl border border-white/20 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">

            <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {CATEGORY_NAMES[activeCategory]} Items
            </div>

            <div className="flex flex-wrap justify-center gap-2">

              {CATEGORIES[activeCategory].map((model) => (
                <button
                  key={model.path}
                  onClick={() => {
                    setSelectedModel(model);
                    setSelectedBuilding(null);
                    setMenuOpen(false);
                    setMessage(`${model.name} selected. Tap the land to build.`);
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
        )}

      </div>

      {/* BUILDING UPGRADE PANEL */}
      {selectedBuilding && (
        <div className="ui-panel absolute right-3 top-36 z-30 w-60 max-w-[72vw] rounded-xl border border-white/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">
              {CATEGORY_NAMES[selectedBuilding.category]}
            </h2>

            <button
              onClick={() => setSelectedBuilding(null)}
              className="rounded-lg bg-white/10 px-2 py-1 text-xs"
            >
              ✕
            </button>
          </div>

          {selectedBuilding.category === 'building' ? (
            <>
              <div className="mb-3 flex justify-between text-xs">
                <span className="text-slate-400">
                  Building Level
                </span>

                <span className="font-bold text-yellow-400">
                  {selectedBuilding.level}/7
                </span>
              </div>

              <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-400"
                  style={{
                    width: `${selectedBuilding.level / 7 * 100}%`
                  }}
                />
              </div>

              <button
                onClick={handleUpgrade}
                disabled={
                  selectedBuilding.level >= 7 ||
                  money < selectedBuilding.level * 1000
                }
                className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold hover:bg-blue-500 disabled:opacity-40"
              >
                {selectedBuilding.level >= 7
                  ? 'MAX LEVEL'
                  : `⬆ UPGRADE - $${(
                      selectedBuilding.level * 1000
                    ).toLocaleString()}`}
              </button>

              <p className="mt-2 text-center text-[10px] text-green-400">
                +20 population per upgrade
              </p>
            </>
          ) : (
            <p className="text-center text-xs text-slate-400">
              This item does not support upgrades.
            </p>
          )}

        </div>
      )}

      {/* SELECTED TOOL */}
      <div className="ui-panel absolute bottom-3 left-3 z-20 max-w-[65vw] rounded-xl border border-white/15 bg-slate-950/85 px-3 py-2 backdrop-blur-xl">

        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Selected Tool
        </p>

        <p className="text-xs font-bold text-green-400">
          {selectedModel?.name || 'Select a menu item'}
        </p>

      </div>

      {/* NOTIFICATION */}
      {message && (
        <div className="ui-panel absolute bottom-16 left-1/2 z-40 max-w-[85vw] -translate-x-1/2 rounded-xl border border-white/20 bg-slate-950/95 px-4 py-2.5 text-center text-xs font-semibold shadow-xl">
          {message}

          <button
            onClick={() => setMessage('')}
            className="ml-3 text-slate-400"
          >
            ✕
          </button>
        </div>
      )}

    </main>
  );
}
