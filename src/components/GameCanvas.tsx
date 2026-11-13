
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

// Traffic settings
const LANE_OFFSET = 0.72;
const CAR_MAX_COUNT = 20;
const CAR_SPAWN_GAP = 7;
const CAR_MIN_GAP = 4.0;
const CAR_SAFE_DISTANCE = 2.5;
const CAR_MAX_SPEED = 1.9;
const CAR_MIN_SPEED = 1.25;
const CAR_ACCELERATION = 2.2;
const CAR_STEERING_SPEED = 5;

const STARTING_MONEY = 5000;
const HOUR_MS = 60 * 60 * 1000;

type Category = 'road' | 'building' | 'shop' | 'gov';

type ModelOption = {
  name: string;
  path: string;
  price: number;
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
  currentSpeed: number;
  previousX: number;
  previousZ: number;
  heading: number;
  targetHeading: number;
  waiting: boolean;
  laneStartX: number;
  laneStartZ: number;
  laneEndX: number;
  laneEndZ: number;
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

type MovingItem = {
  mesh: THREE.Group;
  originalX: number;
  originalZ: number;
  width: number;
  depth: number;
  driveable: boolean;
  category: Category;
  level: number;
};

const CATEGORIES: Record<Category, ModelOption[]> = {
  road: [
    { name: 'Straight Road', path: '/models/roads/road.glb', price: 50 },
    { name: 'Road Lamp', path: '/models/roads/road_lamp.glb', price: 50 },
    { name: 'Traffic Sign', path: '/models/roads/road_traffic_sign.glb', price: 50 }
  ],
  building: [
    { name: 'Home Level 1', path: '/models/buildings/level1.glb', price: 500 }
  ],
  shop: [
    { name: 'Shop 1', path: '/models/shops/shop1.glb', price: 1000 }
  ],
  gov: [
    { name: 'Airport Buildings', path: '/models/gov/airport_buildings.glb', price: 10000 },
    { name: 'Control Tower', path: '/models/gov/airport_control_tower.glb', price: 25000 },
    { name: 'Airport Transport', path: '/models/gov/airport_transport.glb', price: 50000 },
    { name: 'Gas Station 1', path: '/models/gov/gas_station1.glb', price: 100000 },
    { name: 'Gas Station 2', path: '/models/gov/gas_station2.glb', price: 250000 },
    { name: 'Giant Office', path: '/models/gov/giant_office_building.glb', price: 10000000 },
    { name: 'Gov Office', path: '/models/gov/gov_office1.glb', price: 500000 },
    { name: 'Mini Office', path: '/models/gov/mini_office.glb', price: 100000 },
    { name: 'Old Office', path: '/models/gov/old_office_building.glb', price: 250000 },
    { name: 'Police Station 1', path: '/models/gov/police_station1.glb', price: 1000000 },
    { name: 'Police Station 2', path: '/models/gov/police_station2.glb', price: 2000000 }
  ]
};

const BUILDING_UPGRADE_PRICES: Record<number, number> = {
  1: 10000,
  2: 25000,
  3: 35000,
  4: 50000,
  5: 75000,
  6: 1000000
};

const HOME_RENT_BY_LEVEL: Record<number, number> = {
  1: 500,
  2: 1000,
  3: 2000,
  4: 3500,
  5: 5000,
  6: 7500,
  7: 10000
};

const SHOP_INCOME_PER_HOUR = 30;
const GOV_INCOME_PER_HOUR = 50;

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

const CATEGORY_NAMES: Record<Category, string> = {
  road: 'Road',
  building: 'Home',
  shop: 'Shop',
  gov: 'Government'
};

const POPULATION_VALUES: Record<Category, number> = {
  road: 0,
  building: 15,
  shop: 8,
  gov: 5
};

function gridKey(x: number, z: number): string {
  return `${x}-${z}`;
}

function formatMoney(value: number): string {
  return `$${Math.floor(value).toLocaleString()}`;
}

function worldPosition(x: number, z: number) {
  return {
    x: (x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
    z: (z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
  };
}

function getFootprint(category: Category) {
  if (category === 'building' || category === 'shop') {
    return { width: 2, depth: 2 };
  }

  if (category === 'gov') {
    return { width: 3, depth: 3 };
  }

  return { width: 1, depth: 1 };
}

function getHourlyIncome(category: Category): number {
  if (category === 'shop') return SHOP_INCOME_PER_HOUR;
  if (category === 'gov') return GOV_INCOME_PER_HOUR;
  return 0;
}

function getItemPrice(category: Category, path: string): number {
  const option = CATEGORIES[category].find((item) => item.path === path);
  return option?.price ?? 0;
}

// ======================================================
// FALLBACK MODELS
// ======================================================

function createRoadTile(): THREE.Group {
  const group = new THREE.Group();

  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE + 0.08, 0.10, TILE_SIZE + 0.08),
    new THREE.MeshStandardMaterial({
      color: 0x30343c,
      roughness: 0.95
    })
  );

  asphalt.position.y = 0.045;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.015, 1.25),
    new THREE.MeshBasicMaterial({ color: 0xf6d365 })
  );

  line.position.y = 0.105;
  group.add(line);

  return group;
}

function createFallbackModel(path: string): THREE.Group {
  const group = new THREE.Group();

  if (path.includes('/cars/')) {
    const id = Number(path.match(/car(\d+)/)?.[1] || 1);

    const colors = [
      0xe53935,
      0xffffff,
      0xf4c542,
      0x1976d2,
      0x252525,
      0x16a36a,
      0xe87932,
      0xb56ad8
    ];

    const material = new THREE.MeshStandardMaterial({
      color: colors[(id - 1) % colors.length],
      metalness: 0.35,
      roughness: 0.35
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.65, 3.1),
      material
    );

    body.position.y = 0.65;
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.65, 1.65),
      new THREE.MeshStandardMaterial({ color: 0x8fc5dd })
    );

    cabin.position.set(0, 1.2, -0.15);
    group.add(cabin);

    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x151515
    });

    for (const x of [-0.87, 0.87]) {
      for (const z of [-1, 1]) {
        const wheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.31, 0.31, 0.18, 12),
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

    const colors = [0x2563eb, 0xdc6040, 0x16a36a, 0xb16ad8];

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.85, 9),
      new THREE.MeshStandardMaterial({
        color: colors[(id - 1) % colors.length]
      })
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

  if (path === '/models/roads/road.glb') {
    return createRoadTile();
  }

  if (path.includes('/roads/')) {
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
    } else {
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

  const isGov = path.includes('/gov/');
  const isShop = path.includes('/shops/');

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
        -width / 2 + 0.9 + col * ((width - 1.8) / Math.max(1, columns - 1)),
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
  depth: number,
  maxHeight = 30
): THREE.Group {
  const root = new THREE.Group();
  const model = template.clone(true);

  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  const scale = Math.min(
    width / Math.max(size.x, 0.01),
    depth / Math.max(size.z, 0.01),
    maxHeight / Math.max(size.y, 0.01)
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

function prepareCarModel(template: THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  const model = template.clone(true);

  model.updateMatrixWorld(true);

  let bounds = new THREE.Box3().setFromObject(model);
  let size = bounds.getSize(new THREE.Vector3());

  if (size.x > size.z) {
    model.rotation.y += Math.PI / 2;
    model.updateMatrixWorld(true);
    bounds = new THREE.Box3().setFromObject(model);
    size = bounds.getSize(new THREE.Vector3());
  }

  const center = bounds.getCenter(new THREE.Vector3());

  const scale = Math.min(
    1.65 / Math.max(size.x, 0.01),
    2.65 / Math.max(size.z, 0.01),
    1.45 / Math.max(size.y, 0.01)
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

// ======================================================
// INCOME LABELS
// ======================================================

function createIncomeLabel(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const context = canvas.getContext('2d');

  if (context) {
    context.fillStyle = 'rgba(5, 20, 15, 0.88)';
    context.beginPath();
    context.roundRect(8, 8, 496, 112, 24);
    context.fill();

    context.fillStyle = '#86efac';
    context.font = 'bold 42px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('$30 / hour', 256, 64);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(5.2, 1.3, 1);
  sprite.position.set(0, 6, 0);
  sprite.renderOrder = 10;

  return sprite;
}

function updateIncomeLabel(group: THREE.Group, now: number) {
  const hourlyIncome = Number(group.userData.hourlyIncome || 0);
  if (hourlyIncome <= 0) return;

  const lastCollectedAt = Number(group.userData.lastCollectedAt || now);
  const elapsed = Math.max(0, now - lastCollectedAt);
  const completedHours = Math.floor(elapsed / HOUR_MS);
  const readyAmount = completedHours * hourlyIncome;

  const sprite = group.userData.incomeSprite as THREE.Sprite | undefined;
  if (!sprite) return;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.fillStyle = 'rgba(5, 20, 15, 0.9)';
  context.beginPath();
  context.roundRect(8, 8, 496, 112, 24);
  context.fill();

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (readyAmount > 0) {
    context.fillStyle = '#86efac';
    context.font = 'bold 42px Arial';
    context.fillText(`+$${readyAmount.toLocaleString()} READY`, 256, 64);
  } else {
    const remaining = Math.max(0, HOUR_MS - elapsed);
    const minutes = Math.ceil(remaining / 60000);

    context.fillStyle = '#facc15';
    context.font = 'bold 38px Arial';
    context.fillText(
      `${formatMoney(hourlyIncome)} / hour · ${minutes} min`,
      256,
      64
    );
  }

  const oldMaterial = sprite.material as THREE.SpriteMaterial;
  const oldTexture = oldMaterial.map;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  oldMaterial.map = texture;
  oldMaterial.needsUpdate = true;

  if (oldTexture) oldTexture.dispose();

  group.userData.incomeReady = readyAmount;
  group.userData.incomeUpdatedAt = now;
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [money, setMoney] = useState(STARTING_MONEY);
  const [population, setPopulation] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category>('road');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingSelection | null>(null);
  const [message, setMessage] = useState('');
  const [moveMode, setMoveMode] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [incomeRefresh, setIncomeRefresh] = useState(0);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());
  const gridData = useRef<Record<string, GridItem>>({});
  const cars = useRef<CarAgent[]>([]);
  const people = useRef<PersonAgent[]>([]);

  const selectedModelRef = useRef<ModelOption | null>(null);
  const activeCategoryRef = useRef<Category>('road');
  const moneyRef = useRef(STARTING_MONEY);
  const rotationRef = useRef(0);
  const moveModeRef = useRef(false);
  const movingItemRef = useRef<MovingItem | null>(null);

  const placeBuildingRef = useRef<(x: number, z: number) => void>(() => {});
  const moveBuildingRef = useRef<(x: number, z: number) => void>(() => {});

  selectedModelRef.current = selectedModel;
  activeCategoryRef.current = activeCategory;
  moneyRef.current = money;
  rotationRef.current = rotation;
  moveModeRef.current = moveMode;

  const changeMoney = (amount: number) => {
    moneyRef.current = amount;
    setMoney(amount);
  };

  // ======================================================
  // LOAD MODELS
  // ======================================================

  useEffect(() => {
    const loader = new GLTFLoader();

    const allPaths = [
      ...Object.values(CATEGORIES).flat().map((model) => model.path),
      ...UPGRADE_PATHS,
      ...CAR_PATHS,
      ...PERSON_PATHS
    ];

    const paths = Array.from(new Set(allPaths));
    let completed = 0;
    let active = true;

    const finishOne = () => {
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

          finishOne();
        },
        undefined,
        () => {
          if (active) {
            modelCache.current.set(path, createFallbackModel(path));
          }

          finishOne();
        }
      );
    });

    return () => {
      active = false;
    };
  }, []);

  // ======================================================
  // ENVIRONMENT
  // ======================================================

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
        color: 0x718779,
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
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.13;
    scene.add(grid);

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

  // ======================================================
  // ROAD SYSTEM
  // ======================================================

  const isRoad = useCallback((x: number, z: number) => {
    const item = gridData.current[gridKey(x, z)];
    return !!item && item.driveable;
  }, []);

  const getRoadNeighbors = useCallback((x: number, z: number) => {
    const directions = [
      { x: 1, z: 0 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: -1 }
    ];

    return directions.filter((direction) =>
      isRoad(x + direction.x, z + direction.z)
    );
  }, [isRoad]);

  // ======================================================
  // TRAFFIC SYSTEM
  // ======================================================

  // Offset a vehicle to one side of its direction of travel.
  // Opposite directions therefore use different lanes.
  const getLaneOffset = (dx: number, dz: number) => {
    return {
      x: dz * LANE_OFFSET,
      z: -dx * LANE_OFFSET
    };
  };

  const getCarWorldPosition = (car: CarAgent) => {
    const start = worldPosition(car.x, car.z);
    const end = worldPosition(car.tx, car.tz);
    const progress = THREE.MathUtils.clamp(car.progress, 0, 1);

    const laneX = THREE.MathUtils.lerp(
      car.laneStartX,
      car.laneEndX,
      progress
    );

    const laneZ = THREE.MathUtils.lerp(
      car.laneStartZ,
      car.laneEndZ,
      progress
    );

    return {
      x: THREE.MathUtils.lerp(start.x, end.x, progress) + laneX,
      z: THREE.MathUtils.lerp(start.z, end.z, progress) + laneZ
    };
  };

  const chooseCarNextTile = useCallback((car: CarAgent) => {
    const neighbors = getRoadNeighbors(car.x, car.z);

    if (neighbors.length === 0) {
      car.tx = car.x;
      car.tz = car.z;
      car.waiting = true;
      return;
    }

    // Avoid reversing direction unless this is a dead end.
    let choices = neighbors.filter((next) => {
      const nextX = car.x + next.x;
      const nextZ = car.z + next.z;

      return !(nextX === car.previousX && nextZ === car.previousZ);
    });

    if (choices.length === 0) {
      choices = neighbors;
    }

    const directionX = car.x - car.previousX;
    const directionZ = car.z - car.previousZ;

    // Prefer to continue straight.
    const straight = choices.filter(
      (next) =>
        next.x === directionX &&
        next.z === directionZ
    );

    if (straight.length > 0 && Math.random() < 0.82) {
      choices = straight;
    }

    // Prefer a tile that is not currently occupied by another car.
    const available = choices.filter((next) => {
      const targetX = car.x + next.x;
      const targetZ = car.z + next.z;
      const targetPosition = worldPosition(targetX, targetZ);

      return !cars.current.some((other) => {
        if (other === car) return false;

        const otherPosition = getCarWorldPosition(other);

        const distance = Math.hypot(
          otherPosition.x - targetPosition.x,
          otherPosition.z - targetPosition.z
        );

        const targetingSameTile =
          other.tx === targetX &&
          other.tz === targetZ;

        return distance < 1.8 || targetingSameTile;
      });
    });

    if (available.length > 0) {
      choices = available;
    }

    const next = choices[Math.floor(Math.random() * choices.length)];

    car.tx = car.x + next.x;
    car.tz = car.z + next.z;
    car.progress = 0;
    car.waiting = false;

    // Keep the previous lane position to avoid snapping at tile edges.
    car.laneStartX = car.laneEndX;
    car.laneStartZ = car.laneEndZ;

    const nextLane = getLaneOffset(next.x, next.z);

    car.laneEndX = nextLane.x;
    car.laneEndZ = nextLane.z;

    car.targetHeading = Math.atan2(next.x, next.z);
  }, [getRoadNeighbors]);

  const spawnCar = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;

    if (
      !scene ||
      cars.current.length >= CAR_MAX_COUNT ||
      !isRoad(x, z)
    ) {
      return;
    }

    const spawnPosition = worldPosition(x, z);

    // Do not spawn vehicles close to another vehicle.
    const tooClose = cars.current.some((car) => {
      const otherPosition = getCarWorldPosition(car);

      return Math.hypot(
        spawnPosition.x - otherPosition.x,
        spawnPosition.z - otherPosition.z
      ) < CAR_SPAWN_GAP;
    });

    if (tooClose) return;

    const path = CAR_PATHS[
      Math.floor(Math.random() * CAR_PATHS.length)
    ];

    const template = modelCache.current.get(path);
    if (!template) return;

    const carMesh = prepareCarModel(template);

    const agent: CarAgent = {
      mesh: carMesh,
      x,
      z,
      tx: x,
      tz: z,
      progress: 0,
      speed: CAR_MIN_SPEED +
        Math.random() * (CAR_MAX_SPEED - CAR_MIN_SPEED),
      currentSpeed: 0,
      previousX: -1,
      previousZ: -1,
      heading: 0,
      targetHeading: 0,
      waiting: false,
      laneStartX: 0,
      laneStartZ: 0,
      laneEndX: 0,
      laneEndZ: 0
    };

    cars.current.push(agent);

    chooseCarNextTile(agent);

    if (agent.waiting) {
      cars.current = cars.current.filter((item) => item !== agent);
      return;
    }

    const directionX = agent.tx - x;
    const directionZ = agent.tz - z;
    const lane = getLaneOffset(directionX, directionZ);

    agent.laneStartX = lane.x;
    agent.laneStartZ = lane.z;
    agent.laneEndX = lane.x;
    agent.laneEndZ = lane.z;

    carMesh.position.set(
      spawnPosition.x + lane.x,
      0.13,
      spawnPosition.z + lane.z
    );

    agent.heading = Math.atan2(directionX, directionZ);
    agent.targetHeading = agent.heading;
    carMesh.rotation.y = agent.heading;

    scene.add(carMesh);
  }, [isRoad, chooseCarNextTile]);

  // ======================================================
  // PEDESTRIANS
  // ======================================================

  const choosePersonDestination = (agent: PersonAgent) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 4;

    agent.tx = agent.homeX + Math.cos(angle) * radius;
    agent.tz = agent.homeZ + Math.sin(angle) * radius;

    agent.direction = Math.atan2(
      agent.tx - agent.x,
      agent.tz - agent.z
    );

    agent.progress = 0;
  };

  const spawnPerson = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;

    if (!scene || people.current.length >= 60) return;

    const path = PERSON_PATHS[
      Math.floor(Math.random() * PERSON_PATHS.length)
    ];

    const template = modelCache.current.get(path);
    if (!template) return;

    const person = prepareModel(template, 0.8, 0.8, 1.8);
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
      speed: 0.65 + Math.random() * 0.25,
      direction: 0
    };

    choosePersonDestination(agent);
    people.current.push(agent);
  }, []);

  // ======================================================
  // GRID MANAGEMENT
  // ======================================================

  const hasSpace = (
    x: number,
    z: number,
    width: number,
    depth: number
  ) => {
    if (
      x < 0 ||
      z < 0 ||
      x + width > GRID_SIZE ||
      z + depth > GRID_SIZE
    ) {
      return false;
    }

    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        if (gridData.current[gridKey(x + dx, z + dz)]) {
          return false;
        }
      }
    }

    return true;
  };

  const addToGrid = (
    group: THREE.Group,
    x: number,
    z: number,
    width: number,
    depth: number,
    category: Category,
    level: number,
    driveable: boolean
  ) => {
    group.userData.gx = x;
    group.userData.gz = z;
    group.userData.width = width;
    group.userData.depth = depth;
    group.userData.level = level;
    group.userData.category = category;
    group.userData.cityItem = true;

    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        gridData.current[gridKey(x + dx, z + dz)] = {
          level,
          category,
          mesh: group,
          driveable
        };
      }
    }
  };

  const removeFromGrid = (group: THREE.Group) => {
    Object.keys(gridData.current).forEach((key) => {
      if (gridData.current[key].mesh === group) {
        delete gridData.current[key];
      }
    });
  };

  // ======================================================
  // PLACE BUILDING
  // ======================================================

  const placeBuilding = useCallback((x: number, z: number) => {
    const model = selectedModelRef.current;
    const category = activeCategoryRef.current;
    const scene = sceneRef.current;

    if (!model || !scene) return;

    const footprint = getFootprint(category);
    const width = footprint.width;
    const depth = footprint.depth;

    if (!hasSpace(x, z, width, depth)) {
      setMessage('This location is occupied or outside city limits.');
      return;
    }

    const cost = model.price;

    if (moneyRef.current < cost) {
      setMessage(`Not enough money. You need ${formatMoney(cost)}.`);
      return;
    }

    const template = modelCache.current.get(model.path);

    if (!template) {
      setMessage('Model is loading. Please wait.');
      return;
    }

    const group = new THREE.Group();

    const isMainRoad =
      category === 'road' &&
      model.path === '/models/roads/road.glb';

    if (isMainRoad) {
      group.add(createRoadTile());
    } else {
      const maxHeight =
        category === 'gov' ? 18 :
        category === 'shop' ? 7 :
        category === 'road' ? 5 : 30;

      group.add(
        prepareModel(
          template,
          width * TILE_SIZE * 0.92,
          depth * TILE_SIZE * 0.92,
          maxHeight
        )
      );
    }

    const position = worldPosition(
      x + (width - 1) / 2,
      z + (depth - 1) / 2
    );

    group.position.set(position.x, 0.02, position.z);
    group.rotation.y = rotationRef.current;

    group.userData.modelPath = model.path;
    group.userData.constructionCost = cost;
    group.userData.rotation = rotationRef.current;
    group.userData.lastRentPaidAt = Date.now();

    const hourlyIncome = getHourlyIncome(category);

    if (hourlyIncome > 0) {
      group.userData.hourlyIncome = hourlyIncome;
      group.userData.lastCollectedAt = Date.now();

      const label = createIncomeLabel();

      group.userData.incomeSprite = label;
      group.add(label);

      updateIncomeLabel(group, Date.now());
    }

    scene.add(group);

    addToGrid(
      group,
      x,
      z,
      width,
      depth,
      category,
      1,
      isMainRoad
    );

    changeMoney(moneyRef.current - cost);

    if (category === 'building') {
      setPopulation((p) => p + POPULATION_VALUES.building);

      for (let i = 0; i < 4; i++) {
        spawnPerson(x, z);
      }
    } else if (category === 'shop') {
      setPopulation((p) => p + POPULATION_VALUES.shop);

      for (let i = 0; i < 3; i++) {
        spawnPerson(x, z);
      }
    } else if (category === 'gov') {
      setPopulation((p) => p + POPULATION_VALUES.gov);

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

    if (isMainRoad) {
      spawnCar(x, z);
    }

    selectedModelRef.current = null;
    setSelectedModel(null);

    setMessage(
      `${model.name} constructed for ${formatMoney(cost)}.`
    );
  }, [spawnCar, spawnPerson]);

  placeBuildingRef.current = placeBuilding;

  // ======================================================
  // ROTATION
  // ======================================================

  const rotateSelectedBuilding = () => {
    if (!selectedBuilding) return;

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const nextRotation =
      (Number(item.mesh.userData.rotation || 0) + Math.PI / 2) %
      (Math.PI * 2);

    item.mesh.rotation.y = nextRotation;
    item.mesh.userData.rotation = nextRotation;

    setMessage('Item rotated 90 degrees.');
  };

  const rotatePlacementTool = () => {
    if (!selectedModel) return;

    const nextRotation =
      (rotationRef.current + Math.PI / 2) % (Math.PI * 2);

    rotationRef.current = nextRotation;
    setRotation(nextRotation);

    setMessage('Placement direction rotated 90 degrees.');
  };

  // ======================================================
  // MOVE BUILDING
  // ======================================================

  const moveBuilding = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;
    const moving = movingItemRef.current;

    if (!scene || !moving) return;

    if (!hasSpace(x, z, moving.width, moving.depth)) {
      setMessage(
        'Cannot move here. This land is occupied or outside city limits.'
      );
      return;
    }

    const position = worldPosition(
      x + (moving.width - 1) / 2,
      z + (moving.depth - 1) / 2
    );

    moving.mesh.position.set(position.x, 0.02, position.z);

    scene.add(moving.mesh);

    addToGrid(
      moving.mesh,
      x,
      z,
      moving.width,
      moving.depth,
      moving.category,
      moving.level,
      moving.driveable
    );

    movingItemRef.current = null;
    moveModeRef.current = false;

    setMoveMode(false);

    setSelectedBuilding({
      x,
      z,
      level: moving.level,
      category: moving.category
    });

    if (moving.driveable) {
      spawnCar(x, z);
    }

    setMessage('Item moved successfully.');
  }, [spawnCar]);

  moveBuildingRef.current = moveBuilding;

  const startMoving = () => {
    if (!selectedBuilding) return;

    const key = gridKey(
      selectedBuilding.x,
      selectedBuilding.z
    );

    const item = gridData.current[key];
    if (!item) return;

    const group = item.mesh;

    movingItemRef.current = {
      mesh: group,
      originalX: group.userData.gx as number,
      originalZ: group.userData.gz as number,
      width: group.userData.width as number,
      depth: group.userData.depth as number,
      driveable: item.driveable,
      category: item.category,
      level: item.level
    };

    removeFromGrid(group);
    sceneRef.current?.remove(group);

    setSelectedBuilding(null);
    setSelectedModel(null);

    selectedModelRef.current = null;
    moveModeRef.current = true;

    setMoveMode(true);
    setMessage('Tap empty land to move this item.');
  };

  const cancelMoving = () => {
    const scene = sceneRef.current;
    const moving = movingItemRef.current;

    if (!scene || !moving) return;

    const position = worldPosition(
      moving.originalX + (moving.width - 1) / 2,
      moving.originalZ + (moving.depth - 1) / 2
    );

    moving.mesh.position.set(position.x, 0.02, position.z);
    scene.add(moving.mesh);

    addToGrid(
      moving.mesh,
      moving.originalX,
      moving.originalZ,
      moving.width,
      moving.depth,
      moving.category,
      moving.level,
      moving.driveable
    );

    movingItemRef.current = null;
    moveModeRef.current = false;

    setMoveMode(false);

    setSelectedBuilding({
      x: moving.originalX,
      z: moving.originalZ,
      level: moving.level,
      category: moving.category
    });

    setMessage('Move cancelled.');
  };

  // ======================================================
  // REMOVE BUILDING
  // ======================================================

  const removeSelected = () => {
    if (!selectedBuilding) return;

    const key = gridKey(
      selectedBuilding.x,
      selectedBuilding.z
    );

    const item = gridData.current[key];
    if (!item) return;

    const group = item.mesh;
    const category = item.category;

    const originalCost = Number(
      group.userData.constructionCost ??
      getItemPrice(
        category,
        String(group.userData.modelPath || '')
      )
    );

    const refund = Math.floor(originalCost * 0.5);
    const populationLoss = POPULATION_VALUES[category];

    removeFromGrid(group);
    sceneRef.current?.remove(group);

    const incomeSprite = group.userData.incomeSprite as
      THREE.Sprite | undefined;

    if (incomeSprite) {
      const material = incomeSprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }

    cars.current = cars.current.filter((car) => {
      if (!isRoad(car.x, car.z)) {
        sceneRef.current?.remove(car.mesh);
        return false;
      }

      return true;
    });

    changeMoney(moneyRef.current + refund);

    if (populationLoss > 0) {
      setPopulation((p) => Math.max(0, p - populationLoss));
    }

    setSelectedBuilding(null);

    setMessage(
      `${CATEGORY_NAMES[category]} removed. ${formatMoney(refund)} refunded.`
    );
  };

  // ======================================================
  // HOME UPGRADES
  // ======================================================

  const handleUpgrade = () => {
    if (
      !selectedBuilding ||
      selectedBuilding.category !== 'building'
    ) {
      return;
    }

    const currentLevel = selectedBuilding.level;

    if (currentLevel >= 7) {
      setMessage('Maximum home level reached!');
      return;
    }

    const cost = BUILDING_UPGRADE_PRICES[currentLevel];

    if (moneyRef.current < cost) {
      setMessage(`Not enough money. You need ${formatMoney(cost)}.`);
      return;
    }

    const key = gridKey(
      selectedBuilding.x,
      selectedBuilding.z
    );

    const item = gridData.current[key];
    if (!item) return;

    const nextLevel = currentLevel + 1;
    const nextPath = `/models/buildings/level${nextLevel}.glb`;

    const template = modelCache.current.get(nextPath);

    if (!template) {
      setMessage('Upgrade model unavailable.');
      return;
    }

    const group = item.mesh;

    group.clear();

    group.add(
      prepareModel(
        template,
        2 * TILE_SIZE * 0.92,
        2 * TILE_SIZE * 0.92,
        30
      )
    );

    group.userData.level = nextLevel;
    group.userData.modelPath = nextPath;

    group.userData.constructionCost =
      Number(group.userData.constructionCost || 500) + cost;

    Object.values(gridData.current).forEach((tile) => {
      if (tile.mesh === group) {
        tile.level = nextLevel;
      }
    });

    changeMoney(moneyRef.current - cost);

    setPopulation((p) => p + 20);

    setSelectedBuilding({
      ...selectedBuilding,
      level: nextLevel
    });

    setMessage(
      `Home upgraded to Level ${nextLevel} for ${formatMoney(cost)}.`
    );
  };

  // ======================================================
  // COLLECT INCOME
  // ======================================================

  const collectSelectedIncome = () => {
    if (!selectedBuilding) return;

    if (
      selectedBuilding.category !== 'shop' &&
      selectedBuilding.category !== 'gov'
    ) {
      return;
    }

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const group = item.mesh;

    const hourlyIncome = Number(
      group.userData.hourlyIncome || 0
    );

    const lastCollectedAt = Number(
      group.userData.lastCollectedAt || Date.now()
    );

    const now = Date.now();

    const completedHours = Math.floor(
      Math.max(0, now - lastCollectedAt) / HOUR_MS
    );

    if (completedHours < 1) {
      setMessage(
        'Income is not ready yet. Wait until one hour has passed.'
      );
      return;
    }

    const amount = completedHours * hourlyIncome;

    group.userData.lastCollectedAt =
      lastCollectedAt + completedHours * HOUR_MS;

    updateIncomeLabel(group, now);

    changeMoney(moneyRef.current + amount);

    setIncomeRefresh((value) => value + 1);

    setMessage(
      `${formatMoney(amount)} collected from this ${CATEGORY_NAMES[selectedBuilding.category].toLowerCase()}!`
    );
  };

  // ======================================================
  // PAY HOME RENT
  // ======================================================

  const paySelectedHomeRent = () => {
    if (
      !selectedBuilding ||
      selectedBuilding.category !== 'building'
    ) {
      return;
    }

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const group = item.mesh;
    const level = Number(group.userData.level || 1);

    const rent =
      HOME_RENT_BY_LEVEL[level] ||
      HOME_RENT_BY_LEVEL[7];

    const lastRentPaidAt = Number(
      group.userData.lastRentPaidAt || Date.now()
    );

    const now = Date.now();

    if (now - lastRentPaidAt < HOUR_MS) {
      setMessage('Home rent is not due yet. Rent is due every hour.');
      return;
    }

    if (moneyRef.current < rent) {
      setMessage(
        `Not enough money to pay home rent of ${formatMoney(rent)}.`
      );
      return;
    }

    group.userData.lastRentPaidAt = now;

    changeMoney(moneyRef.current - rent);

    setMessage(`Home rent paid: ${formatMoney(rent)}.`);

    setIncomeRefresh((value) => value + 1);
  };

  // ======================================================
  // INCOME REFRESH
  // ======================================================

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      const seen = new Set<THREE.Group>();

      Object.values(gridData.current).forEach((item) => {
        if (seen.has(item.mesh)) return;

        seen.add(item.mesh);

        if (
          item.category === 'shop' ||
          item.category === 'gov'
        ) {
          updateIncomeLabel(item.mesh, now);
        }
      });

      setIncomeRefresh((value) => value + 1);
    }, 30000);

    return () => window.clearInterval(interval);
  }, []);

  // ======================================================
  // THREE.JS SCENE
  // ======================================================

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
      Math.min(window.devicePixelRatio || 1, 1.6)
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

    const controls = new OrbitControls(
      camera,
      renderer.domElement
    );

    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.65;
    controls.panSpeed = 0.7;
    controls.zoomSpeed = 0.75;
    controls.minDistance = 15;
    controls.maxDistance = 145;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.target.set(0, 0, 0);

    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };

    // ==================================================
    // POINTER INTERACTION
    // ==================================================

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    let pointerDownX = 0;
    let pointerDownY = 0;
    let pointerMoved = false;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;

      if (target.closest('.ui-panel')) {
        pointerMoved = true;
        return;
      }

      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      pointerMoved = false;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const dx = event.clientX - pointerDownX;
      const dy = event.clientY - pointerDownY;

      if (Math.sqrt(dx * dx + dy * dy) > 7) {
        pointerMoved = true;
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerMoved) return;

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
            if (
              moveModeRef.current &&
              movingItemRef.current
            ) {
              return;
            }

            selectedModelRef.current = null;
            setSelectedModel(null);

            setSelectedBuilding({
              x: current.userData.gx as number,
              z: current.userData.gz as number,
              level: current.userData.level || 1,
              category: current.userData.category as Category
            });

            return;
          }

          current = current.parent;
        }

        let groundObject: THREE.Object3D | null = hit.object;

        while (groundObject && groundObject !== scene) {
          if (groundObject.userData.isGround) {
            const gx = Math.floor(
              (hit.point.x + HALF_WORLD) / TILE_SIZE
            );

            const gz = Math.floor(
              (hit.point.z + HALF_WORLD) / TILE_SIZE
            );

            if (
              moveModeRef.current &&
              movingItemRef.current
            ) {
              moveBuildingRef.current(gx, gz);
            } else if (selectedModelRef.current) {
              placeBuildingRef.current(gx, gz);
            } else {
              setSelectedBuilding(null);
            }

            return;
          }

          groundObject = groundObject.parent;
        }
      }
    };

    renderer.domElement.addEventListener(
      'pointerdown',
      handlePointerDown
    );

    renderer.domElement.addEventListener(
      'pointermove',
      handlePointerMove
    );

    renderer.domElement.addEventListener(
      'pointerup',
      handlePointerUp
    );

    // ==================================================
    // RESIZE
    // ==================================================

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
    // ANIMATION
    // ==================================================

    let animationId = 0;
    let active = true;
    let previousTime = 0;

    const animate = (time: number) => {
      if (!active) return;

      animationId = requestAnimationFrame(animate);

      const deltaSeconds =
        previousTime === 0
          ? 0.016
          : Math.min((time - previousTime) / 1000, 0.05);

      previousTime = time;

      // ================================================
      // REALISTIC VEHICLE MOVEMENT
      // ================================================

      const trafficCars = cars.current;

      // Take a snapshot of all vehicle positions before
      // updating movement for this frame.
      const carPositions = trafficCars.map((car) =>
        getCarWorldPosition(car)
      );

      trafficCars.forEach((car, index) => {
        if (!isRoad(car.x, car.z)) {
          car.mesh.visible = false;
          return;
        }

        car.mesh.visible = true;

        if (
          car.waiting ||
          (car.tx === car.x && car.tz === car.z)
        ) {
          chooseCarNextTile(car);
        }

        if (car.waiting) {
          car.currentSpeed = THREE.MathUtils.damp(
            car.currentSpeed,
            0,
            CAR_ACCELERATION,
            deltaSeconds
          );

          return;
        }

        const currentPosition = carPositions[index];

        let trafficFactor = 1;

        const forwardX = Math.sin(car.heading);
        const forwardZ = Math.cos(car.heading);

        // Check the distance and direction of every other car.
        for (
          let otherIndex = 0;
          otherIndex < trafficCars.length;
          otherIndex++
        ) {
          if (otherIndex === index) continue;

          const other = trafficCars[otherIndex];
          const otherPosition = carPositions[otherIndex];

          const dx = otherPosition.x - currentPosition.x;
          const dz = otherPosition.z - currentPosition.z;

          const distance = Math.hypot(dx, dz);

          if (distance < 0.01) {
            trafficFactor = 0;
            continue;
          }

          const directionDot =
            forwardX * dx + forwardZ * dz;

          const lateralDistance = Math.abs(
            forwardX * dz - forwardZ * dx
          );

          const sameDirection =
            Math.cos(car.heading - other.heading) > 0.65;

          // Vehicle ahead in approximately the same lane.
          if (
            sameDirection &&
            directionDot > 0 &&
            lateralDistance < 1.8 &&
            distance < CAR_MIN_GAP
          ) {
            const followingFactor = THREE.MathUtils.clamp(
              (distance - CAR_SAFE_DISTANCE) /
                (CAR_MIN_GAP - CAR_SAFE_DISTANCE),
              0,
              1
            );

            trafficFactor = Math.min(
              trafficFactor,
              followingFactor
            );
          } else if (
            !sameDirection &&
            distance < CAR_SAFE_DISTANCE
          ) {
            // Slow down near vehicles approaching from
            // another direction at a road junction.
            const crossingFactor = THREE.MathUtils.clamp(
              (distance - 1.4) /
                (CAR_SAFE_DISTANCE - 1.4),
              0,
              1
            );

            trafficFactor = Math.min(
              trafficFactor,
              crossingFactor
            );
          }
        }

        const desiredSpeed = car.speed * trafficFactor;

        // Smooth acceleration and braking.
        car.currentSpeed = THREE.MathUtils.damp(
          car.currentSpeed,
          desiredSpeed,
          CAR_ACCELERATION,
          deltaSeconds
        );

        // Prevent tiny movements from accumulating while stopped.
        if (car.currentSpeed < 0.035) {
          car.currentSpeed = 0;
        }

        car.progress +=
          (car.currentSpeed * deltaSeconds) / TILE_SIZE;

        car.progress = Math.min(car.progress, 1);

        const start = worldPosition(car.x, car.z);
        const end = worldPosition(car.tx, car.tz);

        const progress = car.progress;

        // Smoothly interpolate the lane offset when turning.
        const laneX = THREE.MathUtils.lerp(
          car.laneStartX,
          car.laneEndX,
          progress
        );

        const laneZ = THREE.MathUtils.lerp(
          car.laneStartZ,
          car.laneEndZ,
          progress
        );

        const px =
          start.x +
          (end.x - start.x) * progress +
          laneX;

        const pz =
          start.z +
          (end.z - start.z) * progress +
          laneZ;

        car.mesh.position.set(px, 0.13, pz);

        // Smooth steering.
        let difference =
          car.targetHeading - car.heading;

        while (difference > Math.PI) {
          difference -= Math.PI * 2;
        }

        while (difference < -Math.PI) {
          difference += Math.PI * 2;
        }

        car.heading +=
          difference *
          Math.min(CAR_STEERING_SPEED * deltaSeconds, 1);

        car.mesh.rotation.y = car.heading;

        // Move to the next road tile without resetting
        // the vehicle to the centre of the road.
        if (car.progress >= 1) {
          car.previousX = car.x;
          car.previousZ = car.z;

          car.x = car.tx;
          car.z = car.tz;

          car.progress = 0;

          chooseCarNextTile(car);
        }
      });

      // Remove cars whose current road tile no longer exists.
      cars.current = cars.current.filter((car) => {
        if (!isRoad(car.x, car.z)) {
          scene.remove(car.mesh);
          return false;
        }

        return true;
      });

      // ================================================
      // PEDESTRIAN MOVEMENT
      // ================================================

      people.current.forEach((person) => {
        person.progress +=
          (person.speed * deltaSeconds) / 4;

        if (person.progress >= 1) {
          person.x = person.tx;
          person.z = person.tz;

          choosePersonDestination(person);
        }

        person.mesh.position.x =
          person.x +
          (person.tx - person.x) * person.progress;

        person.mesh.position.z =
          person.z +
          (person.tz - person.z) * person.progress;

        person.mesh.rotation.y = person.direction;
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate(0);

    // ==================================================
    // CLEANUP
    // ==================================================

    return () => {
      active = false;

      cancelAnimationFrame(animationId);

      window.removeEventListener('resize', handleResize);

      renderer.domElement.removeEventListener(
        'pointerdown',
        handlePointerDown
      );

      renderer.domElement.removeEventListener(
        'pointermove',
        handlePointerMove
      );

      renderer.domElement.removeEventListener(
        'pointerup',
        handlePointerUp
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

      movingItemRef.current = null;
      sceneRef.current = null;
    };
  }, [isRoad, chooseCarNextTile]);

  // ======================================================
  // SELECTED BUILDING INFORMATION
  // ======================================================

  const selectedGridItem = selectedBuilding
    ? gridData.current[
        gridKey(selectedBuilding.x, selectedBuilding.z)
      ]
    : undefined;

  const selectedGroup = selectedGridItem?.mesh;

  const selectedHourlyIncome = selectedGroup
    ? Number(selectedGroup.userData.hourlyIncome || 0)
    : 0;

  const selectedIncomeReady =
    selectedGroup && selectedHourlyIncome > 0
      ? Math.floor(
          Math.max(
            0,
            Date.now() -
              Number(
                selectedGroup.userData.lastCollectedAt ||
                Date.now()
              )
          ) / HOUR_MS
        ) * selectedHourlyIncome
      : 0;

  const selectedHomeRent =
    selectedBuilding?.category === 'building'
      ? HOME_RENT_BY_LEVEL[selectedBuilding.level] ||
        HOME_RENT_BY_LEVEL[7]
      : 0;

  const rentLastPaidAt = selectedGroup
    ? Number(
        selectedGroup.userData.lastRentPaidAt ||
        Date.now()
      )
    : Date.now();

  const rentIsDue =
    selectedBuilding?.category === 'building' &&
    Date.now() - rentLastPaidAt >= HOUR_MS;

  // ======================================================
  // USER INTERFACE
  // ======================================================

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white">

      <div
        ref={mountRef}
        className="absolute inset-0 h-full w-full"
      />

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

      {/* TOP BAR */}

      <div className="ui-panel absolute left-1/2 top-2 z-20 flex max-w-[99vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-white/20 bg-slate-950/95 p-1 shadow-xl backdrop-blur-xl">

        <span className="whitespace-nowrap px-2 text-[10px] font-bold text-green-400 sm:text-sm">
          💰 {formatMoney(money)}
        </span>

        <span className="h-6 w-px shrink-0 bg-white/20" />

        <span className="whitespace-nowrap px-2 text-[10px] font-bold text-blue-400 sm:text-sm">
          👥 {population.toLocaleString()}
        </span>

        <span className="h-6 w-px shrink-0 bg-white/20" />

        {(Object.keys(CATEGORIES) as Category[]).map((category) => (
          <button
            key={category}
            onClick={() => {
              if (
                activeCategory === category &&
                menuOpen
              ) {
                setMenuOpen(false);
                setSelectedModel(null);
                selectedModelRef.current = null;
                return;
              }

              setActiveCategory(category);
              activeCategoryRef.current = category;

              setSelectedModel(null);
              selectedModelRef.current = null;

              setSelectedBuilding(null);
              setMenuOpen(true);
            }}
            className={`whitespace-nowrap rounded-lg px-2 py-2 text-[9px] font-bold uppercase sm:px-3 sm:text-xs ${
              activeCategory === category && menuOpen
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            {CATEGORY_NAMES[category]}
          </button>
        ))}
      </div>

      {/* CATEGORY MENU */}

      {menuOpen && !moveMode && (
        <div className="ui-panel absolute left-1/2 top-14 z-20 w-[96vw] max-w-3xl -translate-x-1/2 rounded-xl border border-white/20 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl">

          <div className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {CATEGORY_NAMES[activeCategory]} Items
          </div>

          <div className="flex max-h-[25vh] flex-wrap justify-center gap-2 overflow-y-auto">

            {CATEGORIES[activeCategory].map((model) => (
              <button
                key={model.path}
                onClick={() => {
                  setSelectedModel(model);
                  selectedModelRef.current = model;

                  setSelectedBuilding(null);
                  setMenuOpen(false);

                  rotationRef.current = 0;
                  setRotation(0);

                  setMessage(
                    `${model.name} selected. Price: ${formatMoney(model.price)}. Tap empty land to build.`
                  );
                }}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                <span className="block">
                  {model.name}
                </span>

                <span className="mt-1 block text-[10px] font-bold text-green-400">
                  {formatMoney(model.price)}
                </span>
              </button>
            ))}

          </div>
        </div>
      )}

      {/* MOVE MODE */}

      {moveMode && (
        <div className="ui-panel absolute left-1/2 top-16 z-30 flex w-max max-w-[94vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-blue-400/40 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur-xl">

          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-300">
              MOVE MODE
            </p>

            <p className="text-[10px] text-slate-300">
              Tap empty land to move
            </p>
          </div>

          <button
            onClick={cancelMoving}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-[10px] font-bold hover:bg-red-500"
          >
            CANCEL
          </button>
        </div>
      )}

      {/* SELECTED BUILDING PANEL */}

      {selectedBuilding && !moveMode && (
        <div className="ui-panel absolute right-3 top-16 z-30 max-h-[75vh] w-64 max-w-[78vw] overflow-y-auto rounded-xl border border-white/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">

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

          {/* HOME */}

          {selectedBuilding.category === 'building' && (
            <>
              <div className="mb-3 flex justify-between text-xs">
                <span className="text-slate-400">
                  Home Level
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

              <div className="mb-3 rounded-lg bg-white/5 p-2">
                <p className="text-[10px] text-slate-400">
                  Hourly home rent
                </p>

                <p className="mt-1 text-lg font-bold text-amber-300">
                  {formatMoney(selectedHomeRent)}
                </p>

                <p className="mt-1 text-[9px] text-slate-400">
                  Home rent is a city expense, not collectable income.
                </p>
              </div>

              <button
                onClick={paySelectedHomeRent}
                disabled={!rentIsDue || money < selectedHomeRent}
                className="mb-3 w-full rounded-lg bg-amber-600 py-2.5 text-xs font-bold hover:bg-amber-500 disabled:opacity-40"
              >
                {rentIsDue
                  ? `PAY RENT · ${formatMoney(selectedHomeRent)}`
                  : 'RENT NOT DUE YET'}
              </button>

              <button
                onClick={handleUpgrade}
                disabled={
                  selectedBuilding.level >= 7 ||
                  money <
                    BUILDING_UPGRADE_PRICES[selectedBuilding.level]
                }
                className="w-full rounded-lg bg-blue-600 py-2.5 text-xs font-bold hover:bg-blue-500 disabled:opacity-40"
              >
                {selectedBuilding.level >= 7
                  ? 'MAX LEVEL'
                  : `⬆ UPGRADE · ${formatMoney(BUILDING_UPGRADE_PRICES[selectedBuilding.level])}`}
              </button>

              <p className="mt-2 text-center text-[10px] text-green-400">
                +20 population per upgrade
              </p>
            </>
          )}

          {/* SHOP AND GOVERNMENT INCOME */}

          {(selectedBuilding.category === 'shop' ||
            selectedBuilding.category === 'gov') && (
            <div className="mb-3 rounded-lg border border-green-500/30 bg-green-950/30 p-3">

              <p className="text-[10px] font-bold uppercase text-green-300">
                Building income
              </p>

              <p className="mt-1 text-lg font-bold text-green-400">
                {formatMoney(selectedHourlyIncome)} / hour
              </p>

              <p className="mt-1 text-xs text-slate-300">
                Ready to collect: {formatMoney(selectedIncomeReady)}
              </p>

              <button
                onClick={collectSelectedIncome}
                disabled={selectedIncomeReady <= 0}
                className="mt-3 w-full rounded-lg bg-green-600 py-2.5 text-xs font-bold hover:bg-green-500 disabled:opacity-40"
              >
                {selectedIncomeReady > 0
                  ? `COLLECT ${formatMoney(selectedIncomeReady)}`
                  : 'WAIT FOR ONE HOUR'}
              </button>

              <p className="mt-2 text-[9px] text-slate-400">
                Income is not added automatically. Select this building to collect it.
              </p>
            </div>
          )}

          <button
            onClick={rotateSelectedBuilding}
            className="mb-2 w-full rounded-lg bg-purple-700 py-2.5 text-xs font-bold hover:bg-purple-600"
          >
            ↻ ROTATE 90°
          </button>

          <div className="grid grid-cols-2 gap-2">

            <button
              onClick={startMoving}
              className="rounded-lg bg-amber-600 py-2 text-xs font-bold hover:bg-amber-500"
            >
              ↔ MOVE
            </button>

            <button
              onClick={removeSelected}
              className="rounded-lg bg-red-700 py-2 text-xs font-bold hover:bg-red-600"
            >
              ✕ REMOVE
            </button>

          </div>

          <p className="mt-2 text-center text-[9px] text-slate-400">
            Removing an item refunds 50% of its original construction price.
          </p>
        </div>
      )}

      {/* SELECTED TOOL */}

      <div className="ui-panel absolute bottom-3 left-3 z-20 max-w-[70vw] rounded-xl border border-white/15 bg-slate-950/90 px-3 py-2 backdrop-blur-xl">

        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Selected Tool
        </p>

        <p className="text-xs font-bold text-green-400">
          {moveMode
            ? 'Moving item'
            : selectedModel
              ? `${selectedModel.name} · ${formatMoney(selectedModel.price)}`
              : 'Select a menu item'}
        </p>

        {selectedModel && (
          <button
            onClick={rotatePlacementTool}
            className="mt-2 rounded-md bg-purple-700 px-3 py-1.5 text-[10px] font-bold hover:bg-purple-600"
          >
            ↻ ROTATE BEFORE BUILDING
          </button>
        )}
      </div>

      {/* MESSAGE */}

      {message && (
        <div className="ui-panel absolute bottom-20 left-1/2 z-40 max-w-[88vw] -translate-x-1/2 rounded-xl border border-white/20 bg-slate-950/95 px-4 py-2.5 text-center text-xs font-semibold shadow-xl">

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
