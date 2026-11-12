
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
  previousX: number;
  previousZ: number;
  heading: number;
  targetHeading: number;
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
    { name: 'Straight Road', path: '/models/roads/road.glb' },
    { name: 'Road Lamp', path: '/models/roads/road_lamp.glb' },
    { name: 'Traffic Sign', path: '/models/roads/road_traffic_sign.glb' }
  ],
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

const POPULATION_VALUES: Record<Category, number> = {
  road: 0,
  building: 15,
  shop: 8,
  gov: 5
};

// ======================================================
// FALLBACK MODELS
// ======================================================

function createFallbackModel(path: string): THREE.Group {
  const group = new THREE.Group();

  if (path.includes('/cars/')) {
    const id = Number(path.match(/car(\d+)/)?.[1] || 1);

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.65, 3.2),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL((id * 0.13) % 1, 0.7, 0.48),
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

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x151515 });

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
    const colors = [0x2563eb, 0xdc6040, 0x16a36a, 0xb16ad8];

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

function createRoadTile(): THREE.Group {
  const group = new THREE.Group();

  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE + 0.06, 0.10, TILE_SIZE + 0.06),
    new THREE.MeshStandardMaterial({
      color: 0x30343c,
      roughness: 0.95
    })
  );

  asphalt.position.y = 0.035;
  asphalt.receiveShadow = true;
  group.add(asphalt);

  const centerLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.015, TILE_SIZE * 0.48),
    new THREE.MeshBasicMaterial({ color: 0xf6d365 })
  );

  centerLine.position.y = 0.092;
  group.add(centerLine);

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

/**
 * Cars use local +Z as their forward direction.
 * Their longest horizontal dimension is aligned with local Z.
 */
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

  const scale = Math.min(
    1.75 / Math.max(size.x, 0.01),
    3.0 / Math.max(size.z, 0.01),
    1.5 / Math.max(size.y, 0.01)
  );

  const center = bounds.getCenter(new THREE.Vector3());

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

function gridKey(x: number, z: number) {
  return `${x}-${z}`;
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

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [money, setMoney] = useState(100000);
  const [population, setPopulation] = useState(0);

  const [activeCategory, setActiveCategory] = useState<Category>('road');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [selectedBuilding, setSelectedBuilding] =
    useState<BuildingSelection | null>(null);
  const [message, setMessage] = useState('');
  const [moveMode, setMoveMode] = useState(false);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const modelCache = useRef<Map<string, THREE.Object3D>>(new Map());
  const gridData = useRef<Record<string, GridItem>>({});

  const cars = useRef<CarAgent[]>([]);
  const people = useRef<PersonAgent[]>([]);

  const selectedModelRef = useRef<ModelOption | null>(null);
  const activeCategoryRef = useRef<Category>('road');
  const moneyRef = useRef(100000);
  const movingItemRef = useRef<MovingItem | null>(null);

  const placeBuildingRef = useRef<(x: number, z: number) => void>(() => {});
  const moveBuildingRef = useRef<(x: number, z: number) => void>(() => {});

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

    const paths = Array.from(new Set(allPaths));
    let completed = 0;
    let active = true;

    paths.forEach((path) => {
      loader.load(
        path,
        (gltf) => {
          if (active) modelCache.current.set(path, gltf.scene);
          completed++;

          if (completed >= paths.length && active) {
            setLoading(false);
          }
        },
        undefined,
        () => {
          if (active) modelCache.current.set(path, createFallbackModel(path));
          completed++;

          if (completed >= paths.length && active) {
            setLoading(false);
          }
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
      new THREE.MeshStandardMaterial({ color: 0x253e35, roughness: 1 })
    );

    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.12;
    terrain.receiveShadow = true;
    scene.add(terrain);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({ color: 0x66786c, roughness: 1 })
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
    gridMaterial.opacity = 0.16;
    scene.add(grid);

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x65452e });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x368454 });

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

  // ====================================================
  // PEDESTRIAN MOVEMENT
  // ====================================================

  const choosePersonDestination = (agent: PersonAgent) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2.5 + Math.random() * 5;

    agent.tx = agent.homeX + Math.cos(angle) * radius;
    agent.tz = agent.homeZ + Math.sin(angle) * radius;

    agent.direction = Math.atan2(
      agent.tx - agent.x,
      agent.tz - agent.z
    );

    agent.progress = 0;
  };

  // ====================================================
  // CAR ROUTING
  // ====================================================

  const chooseCarNextTile = useCallback((car: CarAgent) => {
    const neighbors = getRoadNeighbors(car.x, car.z);

    if (neighbors.length === 0) {
      car.tx = car.x;
      car.tz = car.z;
      return;
    }

    // Avoid immediately reversing when another road is available.
    let choices = neighbors.filter(
      (n) => !(car.x + n.x === car.previousX && car.z + n.z === car.previousZ)
    );

    if (choices.length === 0) {
      choices = neighbors;
    }

    // Prefer continuing straight, then turn if necessary.
    const currentDX = car.x - car.previousX;
    const currentDZ = car.z - car.previousZ;

    if (car.previousX >= 0) {
      const straight = choices.filter(
        (n) => n.x === currentDX && n.z === currentDZ
      );

      if (straight.length > 0 && Math.random() < 0.72) {
        choices = straight;
      }
    }

    const next = choices[Math.floor(Math.random() * choices.length)];

    car.tx = car.x + next.x;
    car.tz = car.z + next.z;

    car.targetHeading = Math.atan2(next.x, next.z);
  }, [getRoadNeighbors]);

  // ====================================================
  // SPAWN CARS
  // ====================================================

  const spawnCar = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;
    if (!scene || cars.current.length >= 35) return;

    if (!isRoad(x, z)) return;

    const path = CAR_PATHS[Math.floor(Math.random() * CAR_PATHS.length)];
    const template = modelCache.current.get(path);
    if (!template) return;

    const car = prepareCarModel(template);
    const position = worldPosition(x, z);

    car.position.set(position.x, 0.12, position.z);
    scene.add(car);

    const agent: CarAgent = {
      mesh: car,
      x,
      z,
      tx: x,
      tz: z,
      progress: 0,
      speed: 0.018 + Math.random() * 0.008,
      previousX: -1,
      previousZ: -1,
      heading: 0,
      targetHeading: 0
    };

    cars.current.push(agent);
    chooseCarNextTile(agent);
  }, [isRoad, chooseCarNextTile]);

  // ====================================================
  // SPAWN PEOPLE
  // ====================================================

  const spawnPerson = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;
    if (!scene || people.current.length >= 60) return;

    const path = PERSON_PATHS[Math.floor(Math.random() * PERSON_PATHS.length)];
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
      speed: 0.012 + Math.random() * 0.006,
      direction: 0
    };

    choosePersonDestination(agent);
    people.current.push(agent);
  }, []);

  // ====================================================
  // OCCUPANCY HELPERS
  // ====================================================

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

  // ====================================================
  // BUILDING PLACEMENT
  // ====================================================

  const placeBuilding = useCallback((x: number, z: number) => {
    const model = selectedModelRef.current;
    const category = activeCategoryRef.current;
    const scene = sceneRef.current;

    if (!model || !scene) return;

    const { width, depth } = getFootprint(category);

    if (!hasSpace(x, z, width, depth)) {
      setMessage('This location is occupied or outside city limits.');
      return;
    }

    const cost = COSTS[category];

    if (moneyRef.current < cost) {
      setMessage('Not enough money!');
      return;
    }

    const template = modelCache.current.get(model.path);

    if (!template) {
      setMessage('Model is loading. Please wait.');
      return;
    }

    const group = new THREE.Group();

    // A custom road tile guarantees a flat, seamless road surface.
    const isMainRoad =
      category === 'road' && model.path === '/models/roads/road.glb';

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

    addToGrid(group, x, z, width, depth, category, 1, isMainRoad);

    moneyRef.current -= cost;
    setMoney(moneyRef.current);

    if (category === 'building') {
      setPopulation((p) => p + 15);
      for (let i = 0; i < 4; i++) spawnPerson(x, z);
    } else if (category === 'shop') {
      setPopulation((p) => p + 8);
      for (let i = 0; i < 3; i++) spawnPerson(x, z);
    } else if (category === 'gov') {
      setPopulation((p) => p + 5);
      for (let i = 0; i < 3; i++) spawnPerson(x, z);
    }

    setSelectedBuilding({ x, z, level: 1, category });

    if (isMainRoad) {
      spawnCar(x, z);
    }

    // One placement per selection.
    selectedModelRef.current = null;
    setSelectedModel(null);

    setMessage(`${model.name} constructed successfully.`);
  }, [spawnCar, spawnPerson]);

  placeBuildingRef.current = placeBuilding;

  // ====================================================
  // MOVE SELECTED ITEM
  // ====================================================

  const moveBuilding = useCallback((x: number, z: number) => {
    const scene = sceneRef.current;
    const moving = movingItemRef.current;

    if (!scene || !moving) return;

    if (!hasSpace(x, z, moving.width, moving.depth)) {
      setMessage('Cannot move here. This land is occupied or outside city limits.');
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
    setMoveMode(false);
    setSelectedBuilding({
      x,
      z,
      level: moving.level,
      category: moving.category
    });

    // A moved road becomes a new vehicle starting point.
    if (moving.driveable) {
      spawnCar(x, z);
    }

    setMessage('Item moved successfully.');
  }, [spawnCar]);

  moveBuildingRef.current = moveBuilding;

  const startMoving = () => {
    if (!selectedBuilding) return;

    const key = gridKey(selectedBuilding.x, selectedBuilding.z);
    const item = gridData.current[key];

    if (!item) return;

    const group = item.mesh;
    const width = group.userData.width as number;
    const depth = group.userData.depth as number;

    movingItemRef.current = {
      mesh: group,
      originalX: group.userData.gx as number,
      originalZ: group.userData.gz as number,
      width,
      depth,
      driveable: item.driveable,
      category: item.category,
      level: item.level
    };

    removeFromGrid(group);
    sceneRef.current?.remove(group);

    setSelectedBuilding(null);
    setSelectedModel(null);
    selectedModelRef.current = null;
    setMoveMode(true);

    setMessage('Tap an empty location to move this item. Use Cancel to stop.');
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
    setMoveMode(false);

    setSelectedBuilding({
      x: moving.originalX,
      z: moving.originalZ,
      level: moving.level,
      category: moving.category
    });

    setMessage('Move cancelled.');
  };

  // ====================================================
  // REMOVE SELECTED ITEM
  // ====================================================

  const removeSelected = () => {
    if (!selectedBuilding) return;

    const key = gridKey(selectedBuilding.x, selectedBuilding.z);
    const item = gridData.current[key];

    if (!item) return;

    const group = item.mesh;
    const category = item.category;

    const refund = Math.floor(COSTS[category] * 0.5);
    const populationLoss = POPULATION_VALUES[category];

    removeFromGrid(group);
    sceneRef.current?.remove(group);

    // Remove cars that were on a road tile that no longer exists.
    cars.current = cars.current.filter((car) => {
      const currentRoadExists = isRoad(car.x, car.z);

      if (!currentRoadExists) {
        sceneRef.current?.remove(car.mesh);
        return false;
      }

      return true;
    });

    moneyRef.current += refund;
    setMoney(moneyRef.current);

    if (populationLoss > 0) {
      setPopulation((p) => Math.max(0, p - populationLoss));
    }

    setSelectedBuilding(null);

    setMessage(
      `${CATEGORY_NAMES[category]} removed. $${refund.toLocaleString()} refunded.`
    );
  };

  // ====================================================
  // BUILDING UPGRADES
  // ====================================================

  const handleUpgrade = () => {
    if (!selectedBuilding || selectedBuilding.category !== 'building') return;

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

    const key = gridKey(selectedBuilding.x, selectedBuilding.z);
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

    Object.values(gridData.current).forEach((tile) => {
      if (tile.mesh === group) tile.level = nextLevel;
    });

    moneyRef.current -= cost;
    setMoney(moneyRef.current);
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
      const groups: THREE.Group[] = [];
      const seen = new Set<THREE.Group>();

      Object.values(gridData.current).forEach((item) => {
        if (!seen.has(item.mesh)) {
          seen.add(item.mesh);
          groups.push(item.mesh);
        }
      });

      let income = 0;

      groups.forEach((group) => {
        const category = group.userData.category as Category;
        const level = (group.userData.level as number) || 1;

        if (category === 'building') income += 15 * level;
        else if (category === 'shop') income += 30;
        else if (category === 'gov') income += 50;
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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xddeeff, 0x42533f, 2));

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

    // Smoother camera controls.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.rotateSpeed = 0.65;
    controls.panSpeed = 0.7;
    controls.zoomSpeed = 0.75;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 15;
    controls.maxDistance = 145;
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.target.set(0, 0, 0);
    controls.touches = {
      ONE: THREE.TOUCH.PAN,
      TWO: THREE.TOUCH.DOLLY_ROTATE
    };

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

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const hit of intersects) {
        let current: THREE.Object3D | null = hit.object;

        // Check whether the hit belongs to a placed city item.
        while (current && current !== scene) {
          if (current.userData.cityItem) {
            const gx = current.userData.gx as number;
            const gz = current.userData.gz as number;

            if (moveMode && movingItemRef.current) {
              setMessage('Choose an empty location to move the item.');
              return;
            }

            setSelectedModel(null);
            selectedModelRef.current = null;
            setSelectedBuilding({
              x: gx,
              z: gz,
              level: current.userData.level || 1,
              category: current.userData.category
            });

            return;
          }

          current = current.parent;
        }

        // Check ground, including its direct mesh.
        let groundObject: THREE.Object3D | null = hit.object;

        while (groundObject && groundObject !== scene) {
          if (groundObject.userData.isGround) {
            const gx = Math.floor((hit.point.x + HALF_WORLD) / TILE_SIZE);
            const gz = Math.floor((hit.point.z + HALF_WORLD) / TILE_SIZE);

            if (moveMode && movingItemRef.current) {
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

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

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

      const delta = previousTime === 0
        ? 1
        : Math.min((time - previousTime) / 16.67, 2);

      previousTime = time;

      // CAR MOVEMENT
      cars.current.forEach((car) => {
        if (!isRoad(car.x, car.z)) {
          scene.remove(car.mesh);
          return;
        }

        if (car.tx === car.x && car.tz === car.z) {
          chooseCarNextTile(car);
        }

        if (car.tx !== car.x || car.tz !== car.z) {
          car.progress += car.speed * delta;

          const start = worldPosition(car.x, car.z);
          const end = worldPosition(car.tx, car.tz);

          const dx = end.x - start.x;
          const dz = end.z - start.z;

          car.mesh.position.x = start.x + dx * car.progress;
          car.mesh.position.z = start.z + dz * car.progress;

          // +Z is the vehicle's forward direction.
          car.targetHeading = Math.atan2(dx, dz);

          // Smoothly rotate instead of snapping at corners.
          const current = car.heading;
          let difference = car.targetHeading - current;

          while (difference > Math.PI) difference -= Math.PI * 2;
          while (difference < -Math.PI) difference += Math.PI * 2;

          car.heading += difference * Math.min(0.16 * delta, 1);
          car.mesh.rotation.y = car.heading;

          if (car.progress >= 1) {
            car.progress = 0;
            car.previousX = car.x;
            car.previousZ = car.z;
            car.x = car.tx;
            car.z = car.tz;

            chooseCarNextTile(car);
          }
        } else {
          car.mesh.position.x = worldPosition(car.x, car.z).x;
          car.mesh.position.z = worldPosition(car.x, car.z).z;
        }
      });

      // Remove cars whose road was deleted.
      cars.current = cars.current.filter((car) => isRoad(car.x, car.z));

      // PEDESTRIAN MOVEMENT
      people.current.forEach((person) => {
        person.progress += person.speed * delta;

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

    animate(0);

    return () => {
      active = false;
      cancelAnimationFrame(animationId);

      window.removeEventListener('resize', handleResize);

      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);

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
  }, [moveMode, isRoad, chooseCarNextTile]);

  // ====================================================
  // USER INTERFACE
  // ====================================================

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-slate-950 text-white">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-950">
          <div className="mb-5 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <h2 className="text-xl font-bold">SK SKYLINE</h2>
          <p className="mt-2 text-sm text-slate-400">Loading city...</p>
        </div>
      )}

      {/* TOP HUD */}
      <div className="ui-panel absolute left-1/2 top-2 z-20 flex max-w-[99vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-white/20 bg-slate-950/90 p-1 shadow-xl backdrop-blur-xl">
        <span className="whitespace-nowrap px-2 text-[10px] font-bold text-green-400 sm:text-sm">
          💰 ${money.toLocaleString()}
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
              if (activeCategory === category && menuOpen) {
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

      {/* CATEGORY ITEMS */}
      {menuOpen && (
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
                  setMessage(`${model.name} selected. Tap empty land to build.`);
                }}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                {model.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MOVE MODE PANEL */}
      {moveMode && (
        <div className="ui-panel absolute left-1/2 top-16 z-30 w-[90vw] max-w-sm -translate-x-1/2 rounded-xl border border-blue-400/40 bg-slate-950/95 p-3 text-center shadow-2xl">
          <p className="text-sm font-bold text-blue-300">
            MOVE MODE
          </p>

          <p className="mt-1 text-xs text-slate-300">
            Tap an empty location on the map to place the selected item.
          </p>

          <button
            onClick={cancelMoving}
            className="mt-3 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold hover:bg-red-500"
          >
            CANCEL MOVE
          </button>
        </div>
      )}

      {/* SELECTED ITEM PANEL */}
      {selectedBuilding && !moveMode && (
        <div className="ui-panel absolute right-3 top-16 z-30 w-60 max-w-[75vw] rounded-xl border border-white/20 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">
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

          {selectedBuilding.category === 'building' && (
            <>
              <div className="mb-3 flex justify-between text-xs">
                <span className="text-slate-400">Building Level</span>
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
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
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
            Remove refunds 50% of the original construction cost.
          </p>
        </div>
      )}

      {/* SELECTED TOOL */}
      <div className="ui-panel absolute bottom-3 left-3 z-20 max-w-[65vw] rounded-xl border border-white/15 bg-slate-950/85 px-3 py-2 backdrop-blur-xl">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
          Selected Tool
        </p>

        <p className="text-xs font-bold text-green-400">
          {moveMode
            ? 'Moving item'
            : selectedModel?.name || 'Select a menu item'}
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
