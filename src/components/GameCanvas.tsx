
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ======================================================
// SK SKYLINE CITY BUILDER
// ======================================================

const GRID_SIZE = 80;
const TILE_SIZE = 2;
const WORLD_SIZE = GRID_SIZE * TILE_SIZE;
const HALF_WORLD = WORLD_SIZE / 2;

const LANE_OFFSET = 0.72;
const CAR_MAX_COUNT = 36;
const ROAD_TILES_PER_CAR = 10;
const AIRPLANE_PATHS = [
  '/models/airplane/airplane1.glb',
  '/models/airplane/airplane2.glb',
  '/models/airplane/airplane3.glb'
];
const AIRPLANE_HOLD_MS = 30000;
const CAR_SPAWN_GAP = 8;
const CAR_MIN_GAP = 4.2;
const CAR_SAFE_DISTANCE = 2.5;
const CAR_MAX_SPEED = 1.65;
const CAR_MIN_SPEED = 1.1;
const CAR_ACCELERATION = 2.8;
const CAR_STEERING_SPEED = 5;

const STARTING_MONEY = 900000000000;
const HOUR_MS = 60 * 60 * 1000;

const SAVE_KEY = 'sk-skyline-city-v1';
const SAVE_INTERVAL = 3000;

type Category = 'road' | 'building' | 'shop' | 'gov' | 'market';

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
  reservedIntersection: string | null;
  queuedIntersection: string | null;
  queuedTargetX: number | null;
  queuedTargetZ: number | null;
  clearingIntersection: boolean;
  stuckSeconds: number;
};

type AirplaneAgent = {
  mesh: THREE.Group;
  modelIndex: number;
  phase: 'parked' | 'taxi' | 'takeoff' | 'outbound' | 'holding' | 'returning' | 'landing';
  phaseStartedAt: number;
  runwayStart: THREE.Vector3;
  runwayEnd: THREE.Vector3;
  laneOffset: number;
  heading: number;
  orientationOffset: number;
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

type SavedCityItem = {
  x: number;
  z: number;
  width: number;
  depth: number;
  category: Category;
  level: number;
  driveable: boolean;
  modelPath: string;
  constructionCost: number;
  rotation: number;
  hourlyIncome: number;
  lastCollectedAt: number;
  lastRentPaidAt: number;
};

type SavedCity = {
  version: 1 | 2;
  savedAt: number;
  money: number;
  population: number;
  items: SavedCityItem[];
};

const CATEGORIES: Record<Category, ModelOption[]> = {
  road: [
    { name: 'Straight Road', path: '/models/roads/road.glb', price: 50 },
    { name: 'Road Lamp', path: '/models/roads/road_lamp.glb', price: 50 },
    { name: 'Stop Sign', path: '/models/roads/stop_sign.glb', price: 50 },
    { name: 'Clock Chock', path: '/models/roads/clock_chock.glb', price: 50 },
    { name: 'Traffic Sign', path: '/models/roads/road_traffic_sign.glb', price: 50 }
  ],
  building: [
    { name: 'Home Level 1', path: '/models/buildings/level1.glb', price: 500 }
  ],
  shop: [
    { name: 'Shop', path: '/models/shops/shop1.glb', price: 1000 },
    { name: 'Cafe shop', path: '/models/shops/cafe.glb', price: 2000 }, 
    { name: 'Gun Shop', path: '/models/shops/gun_shop.glb', price: 200000 }, 
    { name: 'Market', path: '/models/shops/market.glb', price: 100000 }, 
    { name: 'Restaurant', path: '/models/shops/restaurant1.glb', price: 10000 }, 
    { name: 'Shopping Center1', path: '/models/shops/shopping_center1.glb', price: 500000 }, 
    { name: 'Shopping Center2', path: '/models/shops/shopping_center2.glb', price: 1000000 },
  ],
  market: [
    { name: 'Crypto Office', path: '/models/market/crypto_office.glb', price: 250000 },
    { name: 'Factory', path: '/models/market/factory.glb', price: 500000 },
    { name: 'Apartment1', path: '/models/market/apartment.glb', price: 5000000 },
    { name: 'Apartment2', path: '/models/market/apartment1.glb', price: 5000000 },
    { name: 'Park', path: '/models/market/park.glb', price: 550000 },
    { name: 'Residential Building', path: '/models/market/residential_building.glb', price: 8500000 },
    { name: 'Factory 1', path: '/models/market/factory1.glb', price: 750000 },
    { name: 'Power Plant', path: '/models/market/power_plant.glb', price: 1500000 },
    { name: 'Runway', path: '/models/market/runway.glb', price: 1000000 }
  ],
  gov: [
    { name: 'Gas Station 1', path: '/models/gov/gas_station1.glb', price: 100000 },
    { name: 'Gas Station 2', path: '/models/gov/gas_station2.glb', price: 250000 },
    { name: 'Giant Office', path: '/models/gov/giant_office_building.glb', price: 10000000 },
    { name: 'Gov Office', path: '/models/gov/gov_office1.glb', price: 500000 },
    { name: 'Mini Office', path: '/models/gov/mini_office.glb', price: 100000 },
    { name: 'Old Office', path: '/models/gov/old_office_building.glb', price: 250000 },
    { name: 'Police Station 1', path: '/models/gov/police_station1.glb', price: 1000000 },
    { name: 'Police Station 2', path: '/models/gov/police_station2.glb', price: 2000000 }, 
    { name: 'Airport Buildings', path: '/models/gov/airport_buildings.glb', price: 1000000 },
    { name: 'Control Tower', path: '/models/gov/airport_control_tower.glb', price: 25000000 },
    { name: 'Airport Transport', path: '/models/gov/airport_transport.glb', price: 50000000 },
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

// Each home upgrade becomes visibly taller while keeping exactly the same
// occupied grid footprint. Values are world units, not grid-cell counts.
const HOME_LEVEL_HEIGHTS: Record<number, number> = {
  1: 8,
  2: 12,
  3: 16,
  4: 21,
  5: 27,
  6: 34,
  7: 42
};

function getHomeLevelHeight(level: number): number {
  const safeLevel = Math.max(1, Math.min(7, Math.floor(level)));
  return HOME_LEVEL_HEIGHTS[safeLevel];
}

const HOME_RENT_BY_LEVEL: Record<number, number> = {
  1: 500,
  2: 1000,
  3: 2000,
  4: 3500,
  5: 5000,
  6: 7500,
  7: 10000
};

const SHOP_INCOME_PER_HOUR = 2500;
const GOV_INCOME_PER_HOUR = 2500;
const MARKET_INCOME_PER_HOUR = 5000;

const UPGRADE_PATHS = Array.from(
  { length: 7 },
  (_, i) => `/models/buildings/level${i + 1}.glb`
);

const CAR_PATHS = Array.from(
  { length: 9 },
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
  gov: 'Government',
  market: 'Market'
};

// Return the exact catalogue item name for the selected placed model.
// Homes use their current upgrade level because their GLB path changes on upgrade.
function getPlacedItemName(
  category: Category,
  modelPath: string,
  level: number
): string {
  if (category === 'building') {
    return `Home Level ${Math.max(1, Math.min(7, Math.floor(level || 1)))}`;
  }

  const catalogueItem = CATEGORIES[category]?.find(
    (item) => item.path === modelPath
  );

  if (catalogueItem) return catalogueItem.name;

  // Friendly fallback for older saved items whose model path is not in the catalogue.
  const fileName = modelPath.split('/').pop()?.replace(/\.glb$/i, '') || '';
  if (fileName) {
    return fileName
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return CATEGORY_NAMES[category];
}

const POPULATION_VALUES: Record<Category, number> = {
  road: 0,
  building: 15,
  shop: 8,
  gov: 5,
  market: 12
};

function gridKey(x: number, z: number): string {
  return `${x}-${z}`;
}

function formatMoney(value: number): string {
  const amount = Math.floor(Number.isFinite(value) ? value : 0);
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  if (absolute >= 1_000_000_000) return `${sign}$${(absolute / 1_000_000_000).toFixed(absolute % 1_000_000_000 === 0 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(absolute % 1_000_000 === 0 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(absolute % 1_000 === 0 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `${sign}$${absolute.toLocaleString()}`;
}

function worldPosition(x: number, z: number) {
  return {
    x: (x - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2,
    z: (z - GRID_SIZE / 2) * TILE_SIZE + TILE_SIZE / 2
  };
}

function getFootprint(category: Category, modelPath = '') {
  // Every footprint is an integer number of complete grid cells.
  // Rotating swaps width/depth; no fractional-cell placement is permitted.
  if (modelPath === '/models/market/runway.glb') return { width: 6, depth: 2 };
  if (category === 'road') return { width: 1, depth: 1 };
  if (modelPath.includes('shopping_center2')) return { width: 8, depth: 8 };
  if (modelPath.includes('shopping_center1')) return { width: 6, depth: 6 };
  if (modelPath.includes('factory1') || modelPath.includes('power_plant') || modelPath.includes('giant_office')) return { width: 8, depth: 8 };
  if (modelPath.includes('factory') || modelPath.includes('police_station') || modelPath.includes('airport_buildings')) return { width: 6, depth: 6 };
  if (modelPath.includes('airport_transport')) return { width: 6, depth: 4 };
  if (category === 'gov') return { width: 4, depth: 4 };
  if (category === 'building' || category === 'shop' || category === 'market') return { width: 4, depth: 4 };
  return { width: 2, depth: 2 };
}

function getHourlyIncome(category: Category): number {
  if (category === 'shop') return SHOP_INCOME_PER_HOUR;
  if (category === 'gov') return GOV_INCOME_PER_HOUR;
  if (category === 'market') return MARKET_INCOME_PER_HOUR;
  return 0;
}

type BuildingBills = { rent: number; gas: number; electricity: number; water: number; maintenance: number; total: number };

function getBuildingBills(category: Category, level: number): BuildingBills {
  const safeLevel = Math.max(1, Math.min(7, level));
  const rent = category === 'building'
    ? (HOME_RENT_BY_LEVEL[safeLevel] || HOME_RENT_BY_LEVEL[7])
    : category === 'shop' ? 5000
    : category === 'gov' ? 10000
    : category === 'market' ? 15000 : 0;
  const multiplier = 1 + (safeLevel - 1) * 0.12;
  const gas = Math.round((category === 'market' ? 1400 : category === 'gov' ? 900 : 700) * multiplier);
  const electricity = Math.round((category === 'market' ? 2200 : category === 'gov' ? 1500 : 1000) * multiplier);
  const water = Math.round((category === 'building' ? 300 : category === 'shop' ? 600 : 800) * multiplier);
  const maintenance = Math.round((category === 'market' ? 1800 : category === 'gov' ? 1200 : 500) * multiplier);
  return { rent, gas, electricity, water, maintenance, total: rent + gas + electricity + water + maintenance };
}

function getItemPrice(category: Category, path: string): number {
  return CATEGORIES[category].find((item) => item.path === path)?.price ?? 0;
}

// ======================================================
// FALLBACK MODELS
// ======================================================

function createRoadTile(): THREE.Group {
  const group = new THREE.Group();

  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(TILE_SIZE + 0.08, 0.10, TILE_SIZE + 0.08),
    new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.95 })
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
      0xe53935, 0xffffff, 0xf4c542, 0x1976d2,
      0x252525, 0x16a36a, 0xe87932, 0xb56ad8
    ];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.65, 3.1),
      new THREE.MeshStandardMaterial({
        color: colors[(id - 1) % colors.length],
        metalness: 0.35,
        roughness: 0.35
      })
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

    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x151515 });

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

  if (path.includes('/airplane/')) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 5.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8edf4, metalness: 0.25, roughness: 0.45 })
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.65;
    group.add(body);
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.12, 1.05),
      new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.2 })
    );
    wing.position.y = 0.65;
    group.add(wing);
    const tail = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 0.65),
      new THREE.MeshStandardMaterial({ color: 0x2563eb })
    );
    tail.position.set(0, 1.15, -2.1);
    group.add(tail);
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

  if (path === '/models/market/runway.glb') {
    const runway = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.12, 3.8),
      new THREE.MeshStandardMaterial({ color: 0x343a40, roughness: 0.95 })
    );
    runway.position.y = 0.06;
    runway.receiveShadow = true;
    group.add(runway);
    const centerLine = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.02, 10.5),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc })
    );
    centerLine.position.y = 0.13;
    group.add(centerLine);
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
// BUILDING LOT BASE / FOUNDATION
// ======================================================

/**
 * A muted concrete-gray lot base fills the small gaps between placed
 * buildings and nearby roads. It is attached to each non-road city item,
 * so it moves, rotates, saves and restores with that item.
 */
function createBuildingLotBase(width: number, depth: number): THREE.Mesh {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.12, depth),
    new THREE.MeshStandardMaterial({
      color: 0x95a5a6,
      roughness: 0.95,
      metalness: 0
    })
  );

  // The top of the base sits just above the grass and just below the model.
  base.position.y = -0.045;
  base.receiveShadow = true;
  base.castShadow = false;
  base.userData.isBuildingLotBase = true;
  return base;
}

// ======================================================
// MODEL NORMALIZATION
// ======================================================

function prepareModel(
  template: THREE.Object3D,
  width: number,
  depth: number,
  maxHeight = 30,
  fillFootprint = false
): THREE.Group {
  const root = new THREE.Group();
  const model = template.clone(true);

  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  const scaleX = width / Math.max(size.x, 0.01);
  const scaleZ = depth / Math.max(size.z, 0.01);
  const scaleY = fillFootprint
    ? Math.min(scaleX, scaleZ, maxHeight / Math.max(size.y, 0.01))
    : Math.min(scaleX, scaleZ, maxHeight / Math.max(size.y, 0.01));

  if (fillFootprint) {
    // Building/prop meshes fill their complete rectangular grid footprint.
    // The occupancy map and rendered footprint therefore have matching edges.
    model.scale.set(scaleX, scaleY, scaleZ);
    model.position.x -= center.x * scaleX;
    model.position.z -= center.z * scaleZ;
    model.position.y -= bounds.min.y * scaleY;
  } else {
    model.scale.multiplyScalar(scaleY);
    model.position.x -= center.x * scaleY;
    model.position.z -= center.z * scaleY;
    model.position.y -= bounds.min.y * scaleY;
  }

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
 * Normalize a residential level model to the complete footprint already
 * reserved by its grid item, while assigning a level-specific building
 * height. X/Z are fitted to the exact footprint; Y grows at every upgrade.
 */
function prepareLevelBuildingModel(
  template: THREE.Object3D,
  width: number,
  depth: number,
  targetHeight: number
): THREE.Group {
  const root = new THREE.Group();
  const model = template.clone(true);
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());

  // Keep the building footprint slightly inset. Set height to 50% of the
  // level target so buildings are less tall while retaining clear upgrade growth.
  const BUILDING_FOOTPRINT_SIZE_FACTOR = 0.85;
  const BUILDING_HEIGHT_SIZE_FACTOR = 0.50;
  const scaleX = (width * BUILDING_FOOTPRINT_SIZE_FACTOR) / Math.max(size.x, 0.01);
  const scaleY = (targetHeight * BUILDING_HEIGHT_SIZE_FACTOR) / Math.max(size.y, 0.01);
  const scaleZ = (depth * BUILDING_FOOTPRINT_SIZE_FACTOR) / Math.max(size.z, 0.01);

  model.scale.set(scaleX, scaleY, scaleZ);
  model.position.x -= center.x * scaleX;
  model.position.z -= center.z * scaleZ;
  model.position.y -= bounds.min.y * scaleY;

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

function createStatusIcon(symbol: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.beginPath();
    context.arc(64, 64, 54, 0, Math.PI * 2);
    context.fillStyle = 'rgba(8, 15, 25, 0.94)';
    context.fill();
    context.lineWidth = 7;
    context.strokeStyle = color;
    context.stroke();
    context.fillStyle = color;
    context.font = 'bold 78px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbol, 64, 67);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false
  }));
  sprite.scale.set(1.05, 1.05, 1);
  sprite.userData.isStatusIcon = true;
  sprite.renderOrder = 20;
  return sprite;
}

function createIncomeLabel(): THREE.Sprite {
  const sprite = createStatusIcon('$', '#4ade80');
  sprite.position.set(0, 4.2, 0);
  sprite.visible = false;
  return sprite;
}

function updateIncomeLabel(group: THREE.Group, now: number) {
  const hourlyIncome = Number(group.userData.hourlyIncome || 0);
  const sprite = group.userData.incomeSprite as THREE.Sprite | undefined;
  if (!sprite || hourlyIncome <= 0) return;
  const lastCollectedAt = Number(group.userData.lastCollectedAt || now);
  const completedHours = Math.floor(Math.max(0, now - lastCollectedAt) / HOUR_MS);
  const readyAmount = completedHours * hourlyIncome;
  sprite.visible = readyAmount > 0;
  group.userData.incomeReady = readyAmount;
}

function createRentDueIcon(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.beginPath();
    context.moveTo(64, 119);
    context.bezierCurveTo(53, 101, 23, 75, 23, 49);
    context.arc(64, 49, 41, Math.PI, 0);
    context.bezierCurveTo(105, 75, 75, 101, 64, 119);
    context.closePath();
    context.fillStyle = '#ef4444';
    context.fill();
    context.lineWidth = 6;
    context.strokeStyle = '#fee2e2';
    context.stroke();
    context.beginPath();
    context.arc(64, 48, 14, 0, Math.PI * 2);
    context.fillStyle = '#fff7ed';
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(1.05, 1.25, 1);
  sprite.userData.isStatusIcon = true;
  sprite.position.set(0, 5.25, 0);
  sprite.renderOrder = 21;
  sprite.visible = false;
  return sprite;
}

function updateRentDueIcon(group: THREE.Group, now: number) {
  const sprite = group.userData.rentDueSprite as THREE.Sprite | undefined;
  if (!sprite) return;
  const lastPaid = Number(group.userData.lastRentPaidAt || now);
  sprite.visible = now - lastPaid >= HOUR_MS;
  group.userData.rentDue = sprite.visible;
}

/** Position floating status icons just above the current model roof.
 * Re-run after a home upgrade because every level can have a different height.
 */
function positionBuildingStatusIcons(group: THREE.Group) {
  group.updateMatrixWorld(true);

  const modelChildren = group.children.filter(
    (child) => !child.userData.isStatusIcon
  );
  if (modelChildren.length === 0) return;

  const bounds = new THREE.Box3();
  modelChildren.forEach((child) => {
    child.updateMatrixWorld(true);
    bounds.union(new THREE.Box3().setFromObject(child));
  });

  if (bounds.isEmpty()) return;

  const groupWorldPosition = group.getWorldPosition(new THREE.Vector3());
  const roofHeight = Math.max(0, bounds.max.y - groupWorldPosition.y);
  const rentSprite = group.userData.rentDueSprite as THREE.Sprite | undefined;
  const incomeSprite = group.userData.incomeSprite as THREE.Sprite | undefined;
  const iconY = roofHeight + 1.15;

  if (rentSprite) rentSprite.position.set(0, iconY, 0);
  if (incomeSprite) incomeSprite.position.set(0, iconY + 0.15, 0);
}

// ======================================================
// AIRPORT / AIRCRAFT HELPERS
// ======================================================

function getRunwayGroups(grid: Record<string, GridItem>): THREE.Group[] {
  const seen = new Set<THREE.Group>();
  const result: THREE.Group[] = [];
  Object.values(grid).forEach((item) => {
    if (item.mesh.userData.modelPath === '/models/market/runway.glb' && !seen.has(item.mesh)) {
      seen.add(item.mesh);
      result.push(item.mesh);
    }
  });
  return result;
}

function createGrassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.colorSpace = THREE.SRGBColorSpace;
    return fallback;
  }

  context.fillStyle = '#32a82f';
  context.fillRect(0, 0, 512, 512);

  // Fine, low-contrast blades and flecks create a continuous grass surface
  // without drawing a visible tile/grid pattern over the playable map.
  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random();
    context.strokeStyle = shade > 0.55
      ? 'rgba(151,220,91,0.24)'
      : shade > 0.25
        ? 'rgba(16,102,28,0.18)'
        : 'rgba(190,235,112,0.10)';
    context.lineWidth = 0.5 + Math.random() * 0.8;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (Math.random() - 0.5) * 2.5, y - 1 - Math.random() * 3.5);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.anisotropy = 4;
  return texture;
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
  const airplanes = useRef<AirplaneAgent[]>([]);
  const airplaneEpoch = useRef<number | null>(null);
  // A single FIFO junction controller prevents conflicting movements and
  // circular waits. It is deliberately conservative: only one car enters
  // an intersection at a time, and the first queued car gets the next turn.
  const intersectionOwner = useRef<CarAgent | null>(null);
  const intersectionQueue = useRef<CarAgent[]>([]);

  const selectedModelRef = useRef<ModelOption | null>(null);
  const activeCategoryRef = useRef<Category>('road');
  const moneyRef = useRef(STARTING_MONEY);
  const populationRef = useRef(0);
  const rotationRef = useRef(0);
  const moveModeRef = useRef(false);
  const movingItemRef = useRef<MovingItem | null>(null);
  const restoredRef = useRef(false);

  const placeBuildingRef = useRef<(x: number, z: number) => void>(() => {});
  const moveBuildingRef = useRef<(x: number, z: number) => void>(() => {});

  selectedModelRef.current = selectedModel;
  activeCategoryRef.current = activeCategory;
  moneyRef.current = money;
  populationRef.current = population;
  rotationRef.current = rotation;
  moveModeRef.current = moveMode;

  // Game action notifications disappear automatically after 2.5 seconds.
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 2500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const changeMoney = (amount: number) => {
    const safeAmount = Math.max(0, Math.floor(amount));
    moneyRef.current = safeAmount;
    setMoney(safeAmount);
  };

  const changePopulation = (amount: number) => {
    const safeAmount = Math.max(0, Math.floor(amount));
    populationRef.current = safeAmount;
    setPopulation(safeAmount);
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
      ...PERSON_PATHS,
      ...AIRPLANE_PATHS
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
          if (active) modelCache.current.set(path, gltf.scene);
          finishOne();
        },
        undefined,
        () => {
          if (active) modelCache.current.set(path, createFallbackModel(path));
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
    const grassTexture = createGrassTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({
        map: grassTexture,
        color: 0xffffff,
        roughness: 1,
        metalness: 0
      })
    );

    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.025;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    scene.add(ground);

    // Decorative countryside beyond the playable city boundary. The outer
    // terrain is separate from the 80x80 buildable map, so these props never
    // occupy grid cells or interfere with placement and traffic.
    const outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 2.7, WORLD_SIZE * 2.7),
      new THREE.MeshStandardMaterial({ color: 0x397b35, roughness: 1, metalness: 0 })
    );
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.09;
    outerGround.receiveShadow = true;
    scene.add(outerGround);

    const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x684329, roughness: 1 });
    const treeLeafMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x176b2c, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x238b32, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x329d3c, roughness: 1 })
    ];
    const mountainMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x526b50, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x657d5a, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x788c68, roughness: 1 })
    ];

    const addPine = (x: number, z: number, scale: number) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * scale, 0.32 * scale, 2.1 * scale, 6), treeTrunkMaterial);
      trunk.position.y = 1.05 * scale;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let tier = 0; tier < 3; tier++) {
        const height = (2.6 - tier * 0.22) * scale;
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry((1.65 - tier * 0.25) * scale, height, 7),
          treeLeafMaterials[(tier + Math.floor((x + z) * 0.01)) % treeLeafMaterials.length]
        );
        foliage.position.y = (2.1 + tier * 1.25) * scale;
        foliage.castShadow = true;
        tree.add(foliage);
      }
      tree.position.set(x, 0, z);
      scene.add(tree);
    };

    // Four loose tree belts outside the map, leaving a clear visual horizon.
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const offset = -HALF_WORLD - 17 - (i % 3) * 5;
      const along = -HALF_WORLD + t * WORLD_SIZE;
      addPine(along, offset, 0.85 + (i % 4) * 0.12);
      addPine(along, -offset, 0.9 + (i % 3) * 0.15);
      addPine(offset, along, 0.85 + (i % 5) * 0.1);
      addPine(-offset, along, 0.9 + (i % 4) * 0.12);
    }

    // Distant low-poly mountain range beyond the tree line.
    const mountainPositions = [
      [-150, -155, 28, 48], [-95, -172, 36, 58], [-35, -165, 25, 43],
      [35, -172, 34, 55], [100, -158, 29, 48], [158, -125, 34, 57],
      [165, -55, 27, 46], [168, 25, 35, 58], [155, 100, 30, 50],
      [105, 165, 34, 56], [35, 172, 26, 45], [-40, 170, 36, 58],
      [-115, 158, 30, 51], [-168, 100, 34, 55], [-172, 20, 27, 46], [-165, -65, 32, 52]
    ];
    mountainPositions.forEach(([x, z, radius, height], index) => {
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 7),
        mountainMaterials[index % mountainMaterials.length]
      );
      mountain.position.set(x, height / 2 - 0.1, z);
      mountain.rotation.y = index * 0.37;
      mountain.castShadow = true;
      mountain.receiveShadow = true;
      scene.add(mountain);
    });

    // The playable map itself remains a seamless, brighter green grass field.
    // No grid lines or trees are placed inside the buildable boundary.
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

  const isIntersection = useCallback((x: number, z: number) => {
    return getRoadNeighbors(x, z).length >= 3;
  }, [getRoadNeighbors]);

  // ======================================================
  // TRAFFIC POSITION
  // ======================================================

  const getLaneOffset = (dx: number, dz: number) => ({
    x: dz * LANE_OFFSET,
    z: -dx * LANE_OFFSET
  });

  const getCarWorldPosition = (car: CarAgent) => {
    const start = worldPosition(car.x, car.z);
    const end = worldPosition(car.tx, car.tz);
    const progress = THREE.MathUtils.clamp(car.progress, 0, 1);

    return {
      x: THREE.MathUtils.lerp(start.x, end.x, progress) +
        THREE.MathUtils.lerp(car.laneStartX, car.laneEndX, progress),
      z: THREE.MathUtils.lerp(start.z, end.z, progress) +
        THREE.MathUtils.lerp(car.laneStartZ, car.laneEndZ, progress)
    };
  };

  // ======================================================
  // FIFO INTERSECTION CONTROL + SAFE ROUTING
  // ======================================================

  const removeFromIntersectionQueue = (car: CarAgent) => {
    intersectionQueue.current = intersectionQueue.current.filter(
      (queued) => queued !== car
    );
    car.queuedIntersection = null;
    car.queuedTargetX = null;
    car.queuedTargetZ = null;
  };

  const releaseIntersection = useCallback((car: CarAgent) => {
    if (intersectionOwner.current === car) {
      intersectionOwner.current = null;
    }

    removeFromIntersectionQueue(car);
    car.reservedIntersection = null;
  }, []);

  const chooseCarNextTile = useCallback((car: CarAgent) => {
    // A queued vehicle keeps its original route and its place in the FIFO.
    if (car.queuedIntersection) {
      if (intersectionOwner.current && intersectionOwner.current !== car) {
        car.waiting = true;
        car.currentSpeed = 0;
        car.tx = car.x;
        car.tz = car.z;
        return;
      }

      if (intersectionQueue.current[0] !== car) {
        car.waiting = true;
        car.currentSpeed = 0;
        car.tx = car.x;
        car.tz = car.z;
        return;
      }

      intersectionQueue.current.shift();
      intersectionOwner.current = car;
      car.reservedIntersection = car.queuedIntersection;
      const targetX = car.queuedTargetX;
      const targetZ = car.queuedTargetZ;
      car.queuedIntersection = null;
      car.queuedTargetX = null;
      car.queuedTargetZ = null;

      if (targetX === null || targetZ === null || !isRoad(targetX, targetZ)) {
        releaseIntersection(car);
        car.waiting = true;
        car.tx = car.x;
        car.tz = car.z;
        return;
      }

      const dx = targetX - car.x;
      const dz = targetZ - car.z;
      const lane = getLaneOffset(dx, dz);

      car.tx = targetX;
      car.tz = targetZ;
      car.progress = 0;
      car.waiting = false;
      car.laneStartX = car.laneEndX;
      car.laneStartZ = car.laneEndZ;
      car.laneEndX = lane.x;
      car.laneEndZ = lane.z;
      car.targetHeading = Math.atan2(dx, dz);
      return;
    }

    // If the car is standing on the junction tile, keep its lock while it
    // drives out. The animation releases it after the car has cleared the
    // conflict area, not while it is still in the middle of the junction.
    if (car.reservedIntersection) {
      const currentKey = gridKey(car.x, car.z);
      if (car.reservedIntersection === currentKey) {
        car.clearingIntersection = true;
      } else {
        releaseIntersection(car);
      }
    }

    const neighbors = getRoadNeighbors(car.x, car.z);
    if (neighbors.length === 0) {
      car.tx = car.x;
      car.tz = car.z;
      car.waiting = true;
      return;
    }

    const directionX = car.x - car.previousX;
    const directionZ = car.z - car.previousZ;

    // Never reverse directly into the road the vehicle just came from,
    // unless it is the only connected road tile.
    let choices = neighbors.filter((next) =>
      !(car.x + next.x === car.previousX && car.z + next.z === car.previousZ)
    );
    if (choices.length === 0) choices = neighbors;

    const straight = choices.filter(
      (next) => next.x === directionX && next.z === directionZ
    );
    const right = choices.filter(
      (next) => next.x === directionZ && next.z === -directionX
    );
    const left = choices.filter(
      (next) => next.x === -directionZ && next.z === directionX
    );

    // Prefer continuing straight. If unavailable, prefer a right turn,
    // then a left turn. This removes random lane-crossing U-turn decisions.
    let preferred = straight.length ? straight : right.length ? right : left.length ? left : choices;

    // A target tile must not already be occupied or claimed by another car.
    const available = preferred.filter((next) => {
      const nx = car.x + next.x;
      const nz = car.z + next.z;
      const target = worldPosition(nx, nz);

      return !cars.current.some((other) => {
        if (other === car) return false;
        const otherPosition = getCarWorldPosition(other);
        const distance = Math.hypot(
          otherPosition.x - target.x,
          otherPosition.z - target.z
        );
        return (other.tx === nx && other.tz === nz && !other.waiting) || distance < 2.25;
      });
    });

    if (available.length === 0) {
      car.waiting = true;
      car.currentSpeed = 0;
      car.tx = car.x;
      car.tz = car.z;
      return;
    }

    // Keep deterministic priority when multiple legal options exist.
    const next = available[0];
    const targetX = car.x + next.x;
    const targetZ = car.z + next.z;

    if (isIntersection(targetX, targetZ)) {
      const key = gridKey(targetX, targetZ);

      // If another vehicle owns the intersection, join the FIFO once and
      // wait at the stop line. Do not reserve another junction while queued.
      if (intersectionOwner.current && intersectionOwner.current !== car) {
        if (!intersectionQueue.current.includes(car)) {
          car.queuedIntersection = key;
          car.queuedTargetX = targetX;
          car.queuedTargetZ = targetZ;
          intersectionQueue.current.push(car);
        }
        car.waiting = true;
        car.currentSpeed = 0;
        car.tx = car.x;
        car.tz = car.z;
        return;
      }

      // Respect vehicles already waiting: a late arrival cannot jump ahead.
      if (intersectionQueue.current.length > 0 && intersectionQueue.current[0] !== car) {
        // A waiting car must appear in the FIFO only once. Re-enqueuing it
        // every animation frame creates duplicate queue entries and can
        // permanently starve the vehicles behind it.
        if (!intersectionQueue.current.includes(car)) {
          car.queuedIntersection = key;
          car.queuedTargetX = targetX;
          car.queuedTargetZ = targetZ;
          intersectionQueue.current.push(car);
        }
        car.waiting = true;
        car.currentSpeed = 0;
        car.tx = car.x;
        car.tz = car.z;
        return;
      }

      intersectionOwner.current = car;
      car.reservedIntersection = key;
    }

    car.tx = targetX;
    car.tz = targetZ;
    car.progress = 0;
    car.waiting = false;

    // Both ends of a movement use the correct right-hand lane for their
    // direction. The lane transition is confined to the junction crossing.
    car.laneStartX = car.laneEndX;
    car.laneStartZ = car.laneEndZ;
    const lane = getLaneOffset(next.x, next.z);
    car.laneEndX = lane.x;
    car.laneEndZ = lane.z;
    car.targetHeading = Math.atan2(next.x, next.z);
  }, [getRoadNeighbors, isIntersection, isRoad, releaseIntersection]);

  const spawnCar = useCallback((x: number, z: number, modelIndex?: number) => {
    const scene = sceneRef.current;

    if (!scene || cars.current.length >= CAR_MAX_COUNT || !isRoad(x, z)) {
      return;
    }

    const spawnPosition = worldPosition(x, z);

    const tooClose = cars.current.some((car) => {
      const other = getCarWorldPosition(car);

      return Math.hypot(
        spawnPosition.x - other.x,
        spawnPosition.z - other.z
      ) < CAR_SPAWN_GAP;
    });

    if (tooClose) return;

    const roadCount = Object.values(gridData.current).filter((item) => item.driveable).length;
    const selectedIndex = modelIndex ?? Math.max(0, Math.floor(roadCount / ROAD_TILES_PER_CAR) - 1) % CAR_PATHS.length;
    const path = CAR_PATHS[selectedIndex % CAR_PATHS.length];
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
      speed: CAR_MIN_SPEED + Math.random() * (CAR_MAX_SPEED - CAR_MIN_SPEED),
      currentSpeed: 0,
      previousX: -1,
      previousZ: -1,
      heading: 0,
      targetHeading: 0,
      waiting: false,
      laneStartX: 0,
      laneStartZ: 0,
      laneEndX: 0,
      laneEndZ: 0,
      reservedIntersection: null,
      queuedIntersection: null,
      queuedTargetX: null,
      queuedTargetZ: null,
      clearingIntersection: false,
      stuckSeconds: 0
    };

    // Cars spawned directly on a junction must own that junction while
    // exiting, otherwise a newly spawned car could overlap an approaching car.
    if (isIntersection(x, z)) {
      if (intersectionOwner.current) return;
      agent.reservedIntersection = gridKey(x, z);
      intersectionOwner.current = agent;
    }

    cars.current.push(agent);
    chooseCarNextTile(agent);

    if (agent.waiting) {
      cars.current = cars.current.filter((item) => item !== agent);
      releaseIntersection(agent);
      return;
    }

    const dx = agent.tx - x;
    const dz = agent.tz - z;
    const lane = getLaneOffset(dx, dz);

    agent.laneStartX = lane.x;
    agent.laneStartZ = lane.z;
    agent.laneEndX = lane.x;
    agent.laneEndZ = lane.z;

    carMesh.position.set(
      spawnPosition.x + lane.x,
      0.13,
      spawnPosition.z + lane.z
    );

    agent.heading = Math.atan2(dx, dz);
    agent.targetHeading = agent.heading;
    carMesh.rotation.y = agent.heading;

    scene.add(carMesh);
  }, [isRoad, chooseCarNextTile, releaseIntersection]);

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
      !Number.isInteger(x) ||
      !Number.isInteger(z) ||
      !Number.isInteger(width) ||
      !Number.isInteger(depth) ||
      width < 1 ||
      depth < 1 ||
      x < 0 ||
      z < 0 ||
      x + width > GRID_SIZE ||
      z + depth > GRID_SIZE
    ) {
      return false;
    }

    for (let dz = 0; dz < depth; dz++) {
      for (let dx = 0; dx < width; dx++) {
        if (gridData.current[gridKey(x + dx, z + dz)]) return false;
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
  // SAVE CITY
  // ======================================================

  const saveCity = useCallback(() => {
    if (typeof window === 'undefined' || !restoredRef.current) return;

    try {
      const uniqueItems = new Set<THREE.Group>();

      Object.values(gridData.current).forEach((item) => {
        uniqueItems.add(item.mesh);
      });

      const moving = movingItemRef.current;
      if (moving) uniqueItems.add(moving.mesh);

      const items: SavedCityItem[] = [];

      uniqueItems.forEach((group) => {
        const isMoving = moving?.mesh === group;

        const x = isMoving ? moving.originalX : Number(group.userData.gx);
        const z = isMoving ? moving.originalZ : Number(group.userData.gz);
        const width = isMoving ? moving.width : Number(group.userData.width);
        const depth = isMoving ? moving.depth : Number(group.userData.depth);
        const category = isMoving
          ? moving.category
          : group.userData.category as Category;

        const gridItem = gridData.current[gridKey(x, z)];
        const driveable = isMoving
          ? moving.driveable
          : Boolean(gridItem?.driveable);

        const modelPath = String(group.userData.modelPath || '');

        if (
          !modelPath ||
          !CATEGORIES[category] ||
          !Number.isInteger(x) ||
          !Number.isInteger(z) ||
          !Number.isInteger(width) ||
          !Number.isInteger(depth)
        ) {
          return;
        }

        items.push({
          x,
          z,
          width,
          depth,
          category,
          level: Number(group.userData.level || 1),
          driveable,
          modelPath,
          constructionCost: Number(group.userData.constructionCost || 0),
          rotation: Number(group.userData.rotation || 0),
          hourlyIncome: Number(group.userData.hourlyIncome || 0),
          lastCollectedAt: Number(
            group.userData.lastCollectedAt || Date.now()
          ),
          lastRentPaidAt: Number(
            group.userData.lastRentPaidAt || Date.now()
          )
        });
      });

      const data: SavedCity = {
        version: 2,
        savedAt: Date.now(),
        money: moneyRef.current,
        population: populationRef.current,
        items
      };

      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('SK Skyline save failed:', error);
    }
  }, []);

  // ======================================================
  // PLACE BUILDING
  // ======================================================

  const placeBuilding = useCallback((x: number, z: number) => {
    const model = selectedModelRef.current;
    const category = activeCategoryRef.current;
    const scene = sceneRef.current;

    if (!model || !scene) return;

    const footprint = getFootprint(category, model.path);
    const rotated = Math.round(rotationRef.current / (Math.PI / 2)) % 2 !== 0;
    const width = rotated ? footprint.depth : footprint.width;
    const depth = rotated ? footprint.width : footprint.depth;

    if (!hasSpace(x, z, width, depth)) {
      setMessage('This location is occupied or outside city limits.');
      return;
    }

    if (moneyRef.current < model.price) {
      setMessage(`Not enough money. You need ${formatMoney(model.price)}.`);
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
      // Use the same #95a5a6 foundation for every non-road category.
      // Its dimensions exactly match the occupied grid footprint.
      group.add(
        createBuildingLotBase(width * TILE_SIZE, depth * TILE_SIZE)
      );

      const maxHeight =
        category === 'gov' ? 18 :
        category === 'shop' ? 7 :
        category === 'market' ? 18 :
        category === 'road' ? 5 : 30;

      group.add(
        category === 'building'
          ? prepareLevelBuildingModel(
              template,
              width * TILE_SIZE,
              depth * TILE_SIZE,
              getHomeLevelHeight(1)
            )
          : prepareModel(
              template,
              width * TILE_SIZE,
              depth * TILE_SIZE,
              maxHeight,
              true
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
    group.userData.isRunway = model.path === '/models/market/runway.glb';
    group.userData.constructionCost = model.price;
    group.userData.rotation = rotationRef.current;
    group.userData.lastRentPaidAt = Date.now();
    group.userData.populationContribution = POPULATION_VALUES[category];
    group.userData.populationActive = true;
    if (category !== 'road') {
      const rentIcon = createRentDueIcon();
      group.userData.rentDueSprite = rentIcon;
      group.add(rentIcon);
    }

    const hourlyIncome = getHourlyIncome(category);

    if (hourlyIncome > 0) {
      group.userData.hourlyIncome = hourlyIncome;
      group.userData.lastCollectedAt = Date.now();

      const label = createIncomeLabel();
      group.userData.incomeSprite = label;
      group.add(label);
      updateIncomeLabel(group, Date.now());
    }

    positionBuildingStatusIcons(group);
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

    changeMoney(moneyRef.current - model.price);

    if (category !== 'road') {
      changePopulation(
        populationRef.current + POPULATION_VALUES[category]
      );

      const pedestrianCount = category === 'building' ? 4 : 3;

      for (let i = 0; i < pedestrianCount; i++) {
        spawnPerson(x, z);
      }
    }

    setSelectedBuilding({ x, z, level: 1, category });

    if (model.path === '/models/market/runway.glb') {
      const runwayCount = getRunwayGroups(gridData.current).length;
      setMessage(runwayCount >= 2 ? 'Second runway completed. Three aircraft will begin scheduled flights.' : 'Runway built. Build one more runway block to unlock aircraft.');
    }

    if (isMainRoad) {
      const roadCount = Object.values(gridData.current).filter((item) => item.driveable).length;
      if (roadCount >= ROAD_TILES_PER_CAR && roadCount % ROAD_TILES_PER_CAR === 0) {
        const modelIndex = (Math.floor(roadCount / ROAD_TILES_PER_CAR) - 1) % CAR_PATHS.length;
        spawnCar(x, z, modelIndex);
      }
    }

    selectedModelRef.current = null;
    setSelectedModel(null);

    setMessage(`${model.name} constructed for ${formatMoney(model.price)}.`);

    saveCity();
  }, [spawnCar, spawnPerson, saveCity]);

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

    const group = item.mesh;
    const oldWidth = Number(group.userData.width || 1);
    const oldDepth = Number(group.userData.depth || 1);
    const nextWidth = oldDepth;
    const nextDepth = oldWidth;
    const centerX = Number(group.userData.gx) + (oldWidth - 1) / 2;
    const centerZ = Number(group.userData.gz) + (oldDepth - 1) / 2;
    const nextX = Math.round(centerX - (nextWidth - 1) / 2);
    const nextZ = Math.round(centerZ - (nextDepth - 1) / 2);
    removeFromGrid(group);
    if (!hasSpace(nextX, nextZ, nextWidth, nextDepth)) {
      addToGrid(group, Number(group.userData.gx), Number(group.userData.gz), oldWidth, oldDepth,
        item.category, item.level, item.driveable);
      setMessage('Cannot rotate here because the new footprint is occupied.');
      return;
    }

    const nextRotation =
      (Number(group.userData.rotation || 0) + Math.PI / 2) % (Math.PI * 2);
    group.rotation.y = nextRotation;
    group.userData.rotation = nextRotation;
    const position = worldPosition(centerX, centerZ);
    group.position.set(position.x, 0.02, position.z);
    addToGrid(group, nextX, nextZ, nextWidth, nextDepth, item.category, item.level, item.driveable);

    setSelectedBuilding({ ...selectedBuilding, x: nextX, z: nextZ });
    setMessage('Item rotated 90 degrees.');
    saveCity();
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
    moveModeRef.current = false;
    setMoveMode(false);

    setSelectedBuilding({
      x,
      z,
      level: moving.level,
      category: moving.category
    });

    if (moving.driveable) spawnCar(x, z);

    setMessage('Item moved successfully.');
    saveCity();
  }, [spawnCar, saveCity]);

  moveBuildingRef.current = moveBuilding;

  const startMoving = () => {
    if (!selectedBuilding) return;

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const group = item.mesh;

    movingItemRef.current = {
      mesh: group,
      originalX: Number(group.userData.gx),
      originalZ: Number(group.userData.gz),
      width: Number(group.userData.width),
      depth: Number(group.userData.depth),
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

    saveCity();
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
    saveCity();
  };

  // ======================================================
  // REMOVE BUILDING
  // ======================================================

  const removeSelected = () => {
    if (!selectedBuilding) return;

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const group = item.mesh;
    const category = item.category;

    const originalCost = Number(
      group.userData.constructionCost ??
      getItemPrice(category, String(group.userData.modelPath || ''))
    );

    const refund = Math.floor(originalCost * 0.5);
    const populationLoss = Number(group.userData.populationContribution ?? POPULATION_VALUES[category]);
    const populationWasActive = group.userData.populationActive !== false;

    removeFromGrid(group);
    sceneRef.current?.remove(group);

    const incomeSprite = group.userData.incomeSprite as THREE.Sprite | undefined;

    if (incomeSprite) {
      const material = incomeSprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
    const rentDueSprite = group.userData.rentDueSprite as THREE.Sprite | undefined;
    if (rentDueSprite) {
      const material = rentDueSprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }

    cars.current = cars.current.filter((car) => {
      if (!isRoad(car.x, car.z)) {
        releaseIntersection(car);
        sceneRef.current?.remove(car.mesh);
        return false;
      }

      return true;
    });

    changeMoney(moneyRef.current + refund);

    if (populationLoss > 0 && populationWasActive) {
      changePopulation(populationRef.current - populationLoss);
    }

    setSelectedBuilding(null);
    setMessage(
      `${CATEGORY_NAMES[category]} removed. ${formatMoney(refund)} refunded.`
    );

    saveCity();
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

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const nextLevel = currentLevel + 1;
    const nextPath = `/models/buildings/level${nextLevel}.glb`;
    const template = modelCache.current.get(nextPath);

    if (!template) {
      setMessage('Upgrade model unavailable.');
      return;
    }

    const group = item.mesh;

    // Remove only the previous building model. Keep status sprites and any
    // other attached UI helpers so rent/income indicators survive upgrades.
    const oldChildren = [...group.children];
    oldChildren.forEach((child) => {
      if (
        child.userData.keepOnUpgrade ||
        child === group.userData.rentDueSprite ||
        child === group.userData.incomeSprite
      ) {
        return;
      }
      group.remove(child);
    });

    const reservedWidth = Number(group.userData.width || 4) * TILE_SIZE;
    const reservedDepth = Number(group.userData.depth || 4) * TILE_SIZE;

    group.add(
      prepareLevelBuildingModel(
        template,
        reservedWidth,
        reservedDepth,
        getHomeLevelHeight(nextLevel)
      )
    );

    group.userData.level = nextLevel;
    group.userData.modelPath = nextPath;
    positionBuildingStatusIcons(group);
    group.userData.width = reservedWidth / TILE_SIZE;
    group.userData.depth = reservedDepth / TILE_SIZE;
    group.userData.constructionCost =
      Number(group.userData.constructionCost || 500) + cost;

    Object.values(gridData.current).forEach((tile) => {
      if (tile.mesh === group) tile.level = nextLevel;
    });

    changeMoney(moneyRef.current - cost);
    group.userData.populationContribution = Number(group.userData.populationContribution || POPULATION_VALUES.building) + 20;
    if (group.userData.populationActive !== false) changePopulation(populationRef.current + 20);

    setSelectedBuilding({ ...selectedBuilding, level: nextLevel });
    setMessage(`Home upgraded to Level ${nextLevel} for ${formatMoney(cost)}.`);

    saveCity();
  };

  // ======================================================
  // COLLECT INCOME
  // ======================================================

  const collectSelectedIncome = () => {
    if (
      !selectedBuilding ||
      (selectedBuilding.category !== 'shop' &&
        selectedBuilding.category !== 'gov' &&
        selectedBuilding.category !== 'market')
    ) {
      return;
    }

    const item = gridData.current[
      gridKey(selectedBuilding.x, selectedBuilding.z)
    ];

    if (!item) return;

    const group = item.mesh;
    const hourlyIncome = Number(group.userData.hourlyIncome || 0);
    const lastCollectedAt = Number(
      group.userData.lastCollectedAt || Date.now()
    );

    const now = Date.now();
    const completedHours = Math.floor(
      Math.max(0, now - lastCollectedAt) / HOUR_MS
    );

    if (completedHours < 1) {
      setMessage('Income is not ready yet. Wait until one hour has passed.');
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

    saveCity();
  };

  // ======================================================
  // PAY HOME RENT
  // ======================================================

  const paySelectedHomeRent = () => {
    if (!selectedBuilding || selectedBuilding.category === 'road') return;

    const item = gridData.current[gridKey(selectedBuilding.x, selectedBuilding.z)];
    if (!item) return;

    const group = item.mesh;
    const level = Number(group.userData.level || 1);
    const bills = getBuildingBills(selectedBuilding.category, level);
    const lastPaidAt = Number(group.userData.lastRentPaidAt || Date.now());
    const now = Date.now();

    if (now - lastPaidAt < HOUR_MS) {
      setMessage('Building bills are not due yet. Bills are charged once every hour.');
      return;
    }

    if (moneyRef.current < bills.total) {
      setMessage(`Not enough money. Total building bills: ${formatMoney(bills.total)}.`);
      return;
    }

    group.userData.lastRentPaidAt = now;
    updateRentDueIcon(group, now);
    if (group.userData.populationActive === false) {
      const contribution = Number(group.userData.populationContribution ?? POPULATION_VALUES[selectedBuilding.category]);
      group.userData.populationActive = true;
      changePopulation(populationRef.current + contribution);
    }
    changeMoney(moneyRef.current - bills.total);
    setMessage(`Building bills paid: ${formatMoney(bills.total)}.`);
    setIncomeRefresh((value) => value + 1);
    saveCity();
  };

  // ======================================================
  // RESTORE SAVED CITY
  // ======================================================

  useEffect(() => {
    if (loading || !sceneRef.current || restoredRef.current) return;

    const scene = sceneRef.current;

    try {
      const raw = localStorage.getItem(SAVE_KEY);

      if (raw) {
        const data = JSON.parse(raw) as SavedCity;

        if ((data.version === 1 || data.version === 2) && Array.isArray(data.items)) {
          for (const originalSaved of data.items) {
            const saved = data.version === 1 ? {
              ...originalSaved, x: originalSaved.x * 2, z: originalSaved.z * 2,
              width: originalSaved.width * 2, depth: originalSaved.depth * 2
            } : originalSaved;
            if (
              !saved ||
              !CATEGORIES[saved.category] ||
              !Number.isInteger(saved.x) ||
              !Number.isInteger(saved.z) ||
              !Number.isInteger(saved.width) ||
              !Number.isInteger(saved.depth) ||
              saved.x < 0 ||
              saved.z < 0 ||
              saved.width < 1 ||
              saved.depth < 1 ||
              saved.x + saved.width > GRID_SIZE ||
              saved.z + saved.depth > GRID_SIZE
            ) {
              continue;
            }

            if (!hasSpace(saved.x, saved.z, saved.width, saved.depth)) {
              continue;
            }

            const template = modelCache.current.get(saved.modelPath);
            if (!template) continue;

            const group = new THREE.Group();

            if (
              saved.category === 'road' &&
              saved.modelPath === '/models/roads/road.glb'
            ) {
              group.add(createRoadTile());
            } else {
              // Recreate the same gray lot base for previously saved items.
              group.add(
                createBuildingLotBase(
                  saved.width * TILE_SIZE,
                  saved.depth * TILE_SIZE
                )
              );

              const maxHeight =
                saved.category === 'gov' ? 18 :
                saved.category === 'shop' ? 7 :
                saved.category === 'market' ? 18 :
                saved.category === 'road' ? 5 : 30;

              group.add(
                saved.category === 'building'
                  ? prepareLevelBuildingModel(
                      template,
                      saved.width * TILE_SIZE,
                      saved.depth * TILE_SIZE,
                      getHomeLevelHeight(Number(saved.level || 1))
                    )
                  : prepareModel(
                      template,
                      saved.width * TILE_SIZE,
                      saved.depth * TILE_SIZE,
                      maxHeight,
                      true
                    )
              );
            }

            const position = worldPosition(
              saved.x + (saved.width - 1) / 2,
              saved.z + (saved.depth - 1) / 2
            );

            group.position.set(position.x, 0.02, position.z);
            group.rotation.y = Number(saved.rotation || 0);

            group.userData.modelPath = saved.modelPath;
            group.userData.isRunway = saved.modelPath === '/models/market/runway.glb';
            group.userData.constructionCost = Number(saved.constructionCost || 0);
            group.userData.rotation = Number(saved.rotation || 0);
            group.userData.level = Number(saved.level || 1);
            group.userData.lastRentPaidAt = Number(
              saved.lastRentPaidAt || Date.now()
            );
            group.userData.hourlyIncome = Number(saved.hourlyIncome || 0);
            group.userData.lastCollectedAt = Number(
              saved.lastCollectedAt || Date.now()
            );
            group.userData.populationContribution = saved.category === 'building'
              ? POPULATION_VALUES.building + Math.max(0, Number(saved.level || 1) - 1) * 20
              : POPULATION_VALUES[saved.category];
            group.userData.populationActive = true;
            if (saved.category !== 'road') {
              const rentIcon = createRentDueIcon();
              group.userData.rentDueSprite = rentIcon;
              group.add(rentIcon);
              updateRentDueIcon(group, Date.now());
            }

            if (group.userData.hourlyIncome > 0) {
              const label = createIncomeLabel();
              group.userData.incomeSprite = label;
              group.add(label);
              updateIncomeLabel(group, Date.now());
            }

            positionBuildingStatusIcons(group);
            scene.add(group);

            addToGrid(
              group,
              saved.x,
              saved.z,
              saved.width,
              saved.depth,
              saved.category,
              saved.level,
              saved.driveable
            );
          }

          changeMoney(
            Number.isFinite(data.money) ? data.money : STARTING_MONEY
          );

          changePopulation(
            Number.isFinite(data.population) ? data.population : 0
          );
        }
      }
    } catch (error) {
      console.error('SK Skyline restore failed:', error);
      setMessage('Saved city could not be fully restored.');
    }

    restoredRef.current = true;

    // Recreate traffic and pedestrians after the city has been restored.
    const roadTiles: Array<{ x: number; z: number }> = [];
    const pedestrianHomes = new Set<string>();
    const seen = new Set<THREE.Group>();

    Object.values(gridData.current).forEach((item) => {
      const group = item.mesh;

      if (seen.has(group)) return;
      seen.add(group);

      const x = Number(group.userData.gx);
      const z = Number(group.userData.gz);

      if (item.driveable) roadTiles.push({ x, z });

      if (item.category !== 'road') {
        const key = gridKey(x, z);

        if (!pedestrianHomes.has(key)) {
          pedestrianHomes.add(key);
          spawnPerson(x, z);
        }
      }
    });

    // Restore one vehicle for every completed 10-road milestone.
    for (let milestone = ROAD_TILES_PER_CAR; milestone <= roadTiles.length; milestone += ROAD_TILES_PER_CAR) {
      const tile = roadTiles[milestone - 1];
      if (tile) spawnCar(tile.x, tile.z, (Math.floor(milestone / ROAD_TILES_PER_CAR) - 1) % CAR_PATHS.length);
    }

    saveCity();
  }, [loading, spawnCar, spawnPerson, saveCity]);

  // ======================================================
  // AUTOMATIC SAVE
  // ======================================================

  useEffect(() => {
    if (loading || !restoredRef.current) return;

    const save = () => saveCity();

    const interval = window.setInterval(save, SAVE_INTERVAL);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };

    const handlePageHide = () => save();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      save();
    };
  }, [loading, saveCity]);

  // ======================================================
  // INCOME LABEL REFRESH
  // ======================================================

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      const seen = new Set<THREE.Group>();

      Object.values(gridData.current).forEach((item) => {
        if (seen.has(item.mesh)) return;
        seen.add(item.mesh);

        if (item.category === 'shop' || item.category === 'gov' || item.category === 'market') {
          updateIncomeLabel(item.mesh, now);
        }
        if (item.category !== 'road') {
          const group = item.mesh;
          const due = now - Number(group.userData.lastRentPaidAt || now) >= HOUR_MS;
          updateRentDueIcon(group, now);
          const active = group.userData.populationActive !== false;
          if (due && active) {
            const contribution = Number(group.userData.populationContribution ?? POPULATION_VALUES[item.category]);
            group.userData.populationActive = false;
            changePopulation(populationRef.current - contribution);
          } else if (!due && !active) {
            const contribution = Number(group.userData.populationContribution ?? POPULATION_VALUES[item.category]);
            group.userData.populationActive = true;
            changePopulation(populationRef.current + contribution);
          }
        }
      });

      setIncomeRefresh((value) => value + 1);
    }, 1000);

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

    const controls = new OrbitControls(camera, renderer.domElement);
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

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const hit of intersects) {
        let current: THREE.Object3D | null = hit.object;

        while (current && current !== scene) {
          if (current.userData.cityItem) {
            if (moveModeRef.current && movingItemRef.current) return;

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
            const gx = Math.floor((hit.point.x + HALF_WORLD) / TILE_SIZE);
            const gz = Math.floor((hit.point.z + HALF_WORLD) / TILE_SIZE);

            if (moveModeRef.current && movingItemRef.current) {
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

      const deltaSeconds = previousTime === 0
        ? 0.016
        : Math.min((time - previousTime) / 1000, 0.05);

      previousTime = time;

      const trafficCars = cars.current;
      const carPositions = trafficCars.map((car) => getCarWorldPosition(car));

      trafficCars.forEach((car, index) => {
        if (!isRoad(car.x, car.z)) {
          car.mesh.visible = false;
          releaseIntersection(car);
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
          car.stuckSeconds += deltaSeconds;

          // Recover from a blocked/deadlocked route: release stale junction
          // claims and make a safe U-turn onto the previous or clearest road.
          if (car.stuckSeconds >= 7) {
            releaseIntersection(car);
            const neighbors = getRoadNeighbors(car.x, car.z);
            const candidates = neighbors
              .map((next) => ({ x: car.x + next.x, z: car.z + next.z, dx: next.x, dz: next.z }))
              .sort((a, b) => {
                const aBack = a.x === car.previousX && a.z === car.previousZ ? -1 : 0;
                const bBack = b.x === car.previousX && b.z === car.previousZ ? -1 : 0;
                return aBack - bBack;
              });
            const safeTarget = candidates.find((next) => {
              if (isIntersection(next.x, next.z) && intersectionOwner.current && intersectionOwner.current !== car) return false;
              return !cars.current.some((other) => {
                if (other === car) return false;
                const pos = getCarWorldPosition(other);
                const targetPos = worldPosition(next.x, next.z);
                return Math.hypot(pos.x - targetPos.x, pos.z - targetPos.z) < 3.1;
              });
            });

            if (safeTarget) {
              car.queuedIntersection = null;
              car.queuedTargetX = null;
              car.queuedTargetZ = null;
              car.tx = safeTarget.x;
              car.tz = safeTarget.z;
              car.progress = 0;
              car.waiting = false;
              car.currentSpeed = CAR_MIN_SPEED;
              car.stuckSeconds = 0;
              car.laneStartX = car.laneEndX;
              car.laneStartZ = car.laneEndZ;
              const lane = getLaneOffset(safeTarget.dx, safeTarget.dz);
              car.laneEndX = lane.x;
              car.laneEndZ = lane.z;
              car.targetHeading = Math.atan2(safeTarget.dx, safeTarget.dz);
              if (isIntersection(safeTarget.x, safeTarget.z)) {
                intersectionOwner.current = car;
                car.reservedIntersection = gridKey(safeTarget.x, safeTarget.z);
              }
            }
          }
          return;
        }

        car.stuckSeconds = car.currentSpeed < 0.045
          ? car.stuckSeconds + deltaSeconds
          : 0;
        if (car.stuckSeconds >= 7 && !car.waiting) {
          car.waiting = true;
          car.tx = car.x;
          car.tz = car.z;
        }

        const currentPosition = carPositions[index];
        let trafficFactor = 1;

        const forwardX = Math.sin(car.heading);
        const forwardZ = Math.cos(car.heading);

        for (let otherIndex = 0; otherIndex < trafficCars.length; otherIndex++) {
          if (otherIndex === index) continue;

          const other = trafficCars[otherIndex];
          const otherPosition = carPositions[otherIndex];

          const dx = otherPosition.x - currentPosition.x;
          const dz = otherPosition.z - currentPosition.z;
          const distance = Math.hypot(dx, dz);

          if (distance < 0.01) continue;

          const directionDot = forwardX * dx + forwardZ * dz;
          const lateralDistance = Math.abs(forwardX * dz - forwardZ * dx);
          const sameDirection =
            Math.cos(car.heading - other.heading) > 0.65;

          // Following vehicles brake only for a car in front in their lane.
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

            trafficFactor = Math.min(trafficFactor, followingFactor);
          }
        }

        // Junction access is controlled by reservations, not by
        // stopping every car for perpendicular traffic.
        const desiredSpeed = car.speed * trafficFactor;

        car.currentSpeed = THREE.MathUtils.damp(
          car.currentSpeed,
          desiredSpeed,
          CAR_ACCELERATION,
          deltaSeconds
        );

        if (car.currentSpeed < 0.035) car.currentSpeed = 0;

        car.progress += (car.currentSpeed * deltaSeconds) / TILE_SIZE;
        car.progress = Math.min(car.progress, 1);

        const start = worldPosition(car.x, car.z);
        const end = worldPosition(car.tx, car.tz);
        const progress = car.progress;

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

        const px = start.x + (end.x - start.x) * progress + laneX;
        const pz = start.z + (end.z - start.z) * progress + laneZ;

        car.mesh.position.set(px, 0.13, pz);

        let difference = car.targetHeading - car.heading;

        while (difference > Math.PI) difference -= Math.PI * 2;
        while (difference < -Math.PI) difference += Math.PI * 2;

        car.heading += difference * Math.min(CAR_STEERING_SPEED * deltaSeconds, 1);
        car.mesh.rotation.y = car.heading;

        // Release the intersection only after the vehicle has physically
        // cleared its center. This prevents another car entering too early.
        if (car.clearingIntersection && car.progress >= 0.82) {
          car.clearingIntersection = false;
          releaseIntersection(car);
        }

        if (car.progress >= 1) {
          car.previousX = car.x;
          car.previousZ = car.z;
          car.x = car.tx;
          car.z = car.tz;
          car.progress = 0;
          car.stuckSeconds = 0;

          chooseCarNextTile(car);
        }
      });

      // Remove cars if their road has been removed.
      cars.current = cars.current.filter((car) => {
        if (!isRoad(car.x, car.z)) {
          releaseIntersection(car);
          scene.remove(car.mesh);
          return false;
        }

        return true;
      });

      // Pedestrians
      people.current.forEach((person) => {
        person.progress += (person.speed * deltaSeconds) / 4;

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

      // --------------------------------------------------
      // AIRCRAFT: unlock after two one-tile runway models. Aircraft launch one by one.
      // --------------------------------------------------
      const runwayGroups = getRunwayGroups(gridData.current);
      if (runwayGroups.length < 2 && airplanes.current.length > 0) {
        airplanes.current.forEach((plane) => scene.remove(plane.mesh));
        airplanes.current = [];
        airplaneEpoch.current = null;
      }
      if (runwayGroups.length >= 2 && airplanes.current.length === 0) {
        const runway = runwayGroups[0];
        const runwayWidth = Number(runway.userData.width || 3);
        const runwayDepth = Number(runway.userData.depth || 1);
        const runwayRotation = Number(runway.userData.rotation || 0);
        const center = runway.position.clone();
        const forward = new THREE.Vector3(Math.cos(runwayRotation), 0, -Math.sin(runwayRotation)).normalize();
        const side = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
        const runwayLength = Math.max(runwayWidth, runwayDepth) * TILE_SIZE;
        const runwayStart = center.clone().addScaledVector(forward, -runwayLength * 0.42);
        const runwayEnd = center.clone().addScaledVector(forward, runwayLength * 0.42);
        runwayStart.y = 0.35;
        runwayEnd.y = 0.35;
        const epoch = performance.now();
        airplaneEpoch.current = epoch;
        AIRPLANE_PATHS.forEach((path, modelIndex) => {
          const template = modelCache.current.get(path);
          if (!template) return;
          const plane = prepareModel(template, 2.2, 4.6, 2.8);
          const laneOffset = (modelIndex - 1) * 1.15;
          const start = runwayStart.clone().addScaledVector(side, laneOffset);
          plane.position.copy(start);
          // airplane1.glb and airplane2.glb have a 90-degree model-axis
          // difference from airplane3.glb; compensate so every nose follows
          // the same runway heading.
          const orientationOffset = modelIndex < 2 ? Math.PI / 2 : 0;
          const aircraftHeading = Math.atan2(forward.x, forward.z) + orientationOffset;
          plane.rotation.y = aircraftHeading;
          scene.add(plane);
          airplanes.current.push({
            mesh: plane, modelIndex, phase: 'parked', phaseStartedAt: epoch + modelIndex * 9000,
            runwayStart: start, runwayEnd: runwayEnd.clone().addScaledVector(side, laneOffset),
            laneOffset, heading: aircraftHeading, orientationOffset
          });
        });
      }

      if (airplanes.current.length > 0) {
        const now = performance.now();
        airplanes.current.forEach((plane) => {
          const elapsed = Math.max(0, now - plane.phaseStartedAt);
          const center = new THREE.Vector3(0, 0, 0);
          const cityOrbit = center.clone().add(new THREE.Vector3(plane.modelIndex * 3 - 3, 0, 0));
          if (plane.phase === 'parked' && now >= plane.phaseStartedAt) {
            plane.phase = 'taxi'; plane.phaseStartedAt = now;
          } else if (plane.phase === 'taxi') {
            const t = THREE.MathUtils.clamp(elapsed / 5000, 0, 1);
            plane.mesh.position.lerpVectors(plane.runwayStart, plane.runwayEnd, t);
            plane.mesh.rotation.y = plane.heading;
            if (t >= 1) { plane.phase = 'takeoff'; plane.phaseStartedAt = now; }
          } else if (plane.phase === 'takeoff') {
            const t = THREE.MathUtils.clamp(elapsed / 6000, 0, 1);
            const target = plane.runwayEnd.clone().lerp(cityOrbit, t);
            target.y = 0.35 + t * 20;
            plane.mesh.position.copy(target);
            plane.mesh.rotation.y = plane.heading;
            if (t >= 1) { plane.phase = 'outbound'; plane.phaseStartedAt = now; }
          } else if (plane.phase === 'outbound') {
            const t = THREE.MathUtils.clamp(elapsed / 5000, 0, 1);
            const target = cityOrbit.clone().lerp(new THREE.Vector3(0, 24, 0), t);
            target.y = 20 + Math.sin(t * Math.PI) * 5;
            plane.mesh.position.copy(target);
            if (t >= 1) { plane.phase = 'holding'; plane.phaseStartedAt = now; }
          } else if (plane.phase === 'holding') {
            const angle = elapsed / 4500 + plane.modelIndex * 2.1;
            plane.mesh.position.set(Math.cos(angle) * 7, 24 + Math.sin(angle * 2) * 1.2, Math.sin(angle) * 7);
            plane.mesh.rotation.y = angle + Math.PI / 2;
            if (elapsed >= AIRPLANE_HOLD_MS) { plane.phase = 'returning'; plane.phaseStartedAt = now; }
          } else if (plane.phase === 'returning') {
            const t = THREE.MathUtils.clamp(elapsed / 9000, 0, 1);
            const target = new THREE.Vector3(0, 24, 0).lerp(plane.runwayEnd, t);
            target.y = 24 - t * 21;
            plane.mesh.position.copy(target);
            plane.mesh.rotation.y = Math.atan2(plane.runwayEnd.x - plane.mesh.position.x, plane.runwayEnd.z - plane.mesh.position.z);
            if (t >= 1) { plane.phase = 'landing'; plane.phaseStartedAt = now; }
          } else if (plane.phase === 'landing') {
            const t = THREE.MathUtils.clamp(elapsed / 4500, 0, 1);
            plane.mesh.position.lerpVectors(plane.runwayEnd, plane.runwayStart, t);
            plane.mesh.position.y = 0.35;
            plane.mesh.rotation.y = plane.heading + Math.PI;
            if (t >= 1) { plane.phase = 'parked'; plane.phaseStartedAt = now + 12000; plane.mesh.rotation.y = plane.heading; }
          }
        });
      }

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

      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);

      controls.dispose();
      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      scene.clear();

      cars.current.forEach((car) => releaseIntersection(car));
      cars.current = [];
      people.current = [];
      airplanes.current.forEach((plane) => scene.remove(plane.mesh));
      airplanes.current = [];
      airplaneEpoch.current = null;
      gridData.current = {};
      intersectionOwner.current = null;
      intersectionQueue.current = [];

      movingItemRef.current = null;
      sceneRef.current = null;
      restoredRef.current = false;
    };
  }, [isRoad, chooseCarNextTile, releaseIntersection]);

  // ======================================================
  // SELECTED BUILDING INFORMATION
  // ======================================================

  const selectedGridItem = selectedBuilding
    ? gridData.current[gridKey(selectedBuilding.x, selectedBuilding.z)]
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
              Number(selectedGroup.userData.lastCollectedAt || Date.now())
          ) / HOUR_MS
        ) * selectedHourlyIncome
      : 0;

  const selectedBills = selectedBuilding && selectedBuilding.category !== 'road'
    ? getBuildingBills(selectedBuilding.category, selectedBuilding.level)
    : null;

  const rentLastPaidAt = selectedGroup
    ? Number(selectedGroup.userData.lastRentPaidAt || Date.now())
    : Date.now();

  const rentIsDue =
    !!selectedBuilding && selectedBuilding.category !== 'road' &&
    Date.now() - rentLastPaidAt >= HOUR_MS;

  // ======================================================
  // USER INTERFACE
  // ======================================================

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

      {/* TOP BAR */}
      <div className="ui-panel absolute left-1/2 top-1 z-20 flex max-w-[98vw] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-lg border border-white/15 bg-slate-950/95 px-1 py-0.5 shadow-lg backdrop-blur-xl">
        <span className="whitespace-nowrap px-2 text-[10px] font-bold text-green-400 sm:text-sm">
          💰 {formatMoney(money)}
        </span>

        <span className="h-6 w-px shrink-0 bg-white/20" />

        <span className="whitespace-nowrap px-2 text-[10px] font-bold text-blue-400 sm:text-sm">
          👥 {population.toLocaleString()}
        </span>

        <span className="h-6 w-px shrink-0 bg-white/20" />

        {(Object.keys(CATEGORIES) as Category[]).filter((category) => category !== 'market').map((category) => (
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
            className={`whitespace-nowrap rounded-md px-1.5 py-1 text-[8px] font-bold uppercase sm:px-2 sm:text-[10px] ${
              activeCategory === category && menuOpen
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            {CATEGORY_NAMES[category]}
          </button>
        ))}
        <button
          type="button"
          aria-label="Market"
          title="Market"
          onClick={() => {
            if (activeCategory === 'market' && menuOpen) {
              setMenuOpen(false);
              setSelectedModel(null);
              selectedModelRef.current = null;
              return;
            }
            setActiveCategory('market');
            activeCategoryRef.current = 'market';
            setSelectedModel(null);
            selectedModelRef.current = null;
            setSelectedBuilding(null);
            setMenuOpen(true);
          }}
          className={`ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-300/60 text-[10px] font-black shadow-md ${activeCategory === 'market' && menuOpen ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-900 text-emerald-100'}`}
        >
          M
        </button>
      </div>

      {/* CATEGORY ITEMS: one compact horizontal, scrollable strip at the bottom */}
      {menuOpen && !moveMode && (
        <div className="ui-panel absolute bottom-2 left-1/2 z-30 w-[96vw] max-w-5xl -translate-x-1/2 rounded-xl border border-white/20 bg-slate-950/95 px-2 py-1.5 shadow-2xl backdrop-blur-xl">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="truncate text-[9px] font-bold uppercase tracking-wider text-slate-400">
              {CATEGORY_NAMES[activeCategory]} · {CATEGORIES[activeCategory].length} items
            </span>
            <span className="shrink-0 text-[8px] text-slate-500">Swipe to see all</span>
          </div>
          <div className="flex w-full flex-nowrap items-stretch gap-1.5 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:thin]">
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
                  setMessage(`${model.name} selected. Price: ${formatMoney(model.price)}. Tap empty land to build.`);
                }}
                className="flex min-w-[88px] max-w-[118px] shrink-0 flex-col justify-center rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-left text-[9px] font-semibold leading-tight text-slate-200 hover:bg-slate-700"
              >
                <span className="line-clamp-2 min-h-[22px]">{model.name}</span>
                <span className="mt-1 text-[9px] font-bold text-green-400">{formatMoney(model.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MOVE MODE */}
      {moveMode && (
        <div className="ui-panel absolute left-1/2 top-16 z-30 flex w-max max-w-[94vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-blue-400/40 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-300">MOVE MODE</p>
            <p className="text-[10px] text-slate-300">Tap empty land to move</p>
          </div>

          <button
            onClick={cancelMoving}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-2 text-[10px] font-bold hover:bg-red-500"
          >
            CANCEL
          </button>
        </div>
      )}

      {/* SELECTED BUILDING PANEL: scrollable details, always-visible controls */}
      {selectedBuilding && !moveMode && (
        <div className="ui-panel absolute right-2 top-14 z-30 flex max-h-[calc(100dvh-4.5rem)] w-[min(260px,44vw)] flex-col overflow-hidden rounded-lg border border-white/20 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-xl sm:right-3 sm:w-64">
          <div className="mb-1 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 pb-1.5">
            <div className="min-w-0">
              <h2 className="truncate text-[11px] font-bold">
                {getPlacedItemName(
                  selectedBuilding.category,
                  String(selectedGroup?.userData.modelPath || ''),
                  selectedBuilding.level
                )}
              </h2>
              <p className="text-[8px] leading-tight text-slate-400">
                {CATEGORY_NAMES[selectedBuilding.category]} item
              </p>
            </div>
            <button
              onClick={() => setSelectedBuilding(null)}
              aria-label="Close building menu"
              className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs"
            >✕</button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {selectedBuilding.category === 'building' && (
              <section className="rounded-md bg-white/5 p-1.5">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">Home level</span>
                  <span className="font-bold text-yellow-400">{selectedBuilding.level}/7</span>
                </div>
                <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-400" style={{ width: `${selectedBuilding.level / 7 * 100}%` }} />
                </div>
                <button
                  onClick={handleUpgrade}
                  disabled={selectedBuilding.level >= 7 || money < BUILDING_UPGRADE_PRICES[selectedBuilding.level]}
                  className="w-full rounded-md bg-blue-600 px-2 py-1.5 text-[9px] font-bold disabled:opacity-40"
                >
                  {selectedBuilding.level >= 7 ? 'MAX LEVEL' : `UPGRADE · ${formatMoney(BUILDING_UPGRADE_PRICES[selectedBuilding.level])}`}
                </button>
                <p className="mt-1 text-center text-[9px] text-green-400">+20 population per upgrade</p>
              </section>
            )}

            {selectedBills && (
              <section className="rounded-md border border-amber-500/30 bg-amber-950/25 p-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase text-amber-300">Hourly bills</span>
                  {rentIsDue && <span className="text-[9px] font-bold text-red-400">PAYMENT DUE</span>}
                </div>
                <div className="space-y-0.5 text-[9px]">
                  <div className="flex justify-between"><span className="text-slate-300">Rent</span><span>{formatMoney(selectedBills.rent)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-300">Gas</span><span>{formatMoney(selectedBills.gas)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-300">Electricity</span><span>{formatMoney(selectedBills.electricity)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-300">Water</span><span>{formatMoney(selectedBills.water)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-300">Maintenance</span><span>{formatMoney(selectedBills.maintenance)}</span></div>
                  <div className="mt-1 flex justify-between border-t border-white/15 pt-1 font-bold"><span>Total / hour</span><span className="text-amber-300">{formatMoney(selectedBills.total)}</span></div>
                </div>
                <button
                  onClick={paySelectedHomeRent}
                  disabled={!rentIsDue || money < selectedBills.total}
                  className="mt-1.5 w-full rounded-md bg-amber-600 py-1.5 text-[9px] font-bold disabled:opacity-40"
                >
                  {rentIsDue ? `PAY ALL · ${formatMoney(selectedBills.total)}` : 'BILLS NOT DUE'}
                </button>
              </section>
            )}

            {(selectedBuilding.category === 'shop' || selectedBuilding.category === 'gov' || selectedBuilding.category === 'market') && (
              <section className="rounded-md border border-green-500/30 bg-green-950/30 p-1.5">
                <p className="text-[9px] font-bold uppercase text-green-300">Building income</p>
                <p className="text-sm font-bold text-green-400">{formatMoney(selectedHourlyIncome)} / hour</p>
                <p className="text-[9px] text-slate-300">Ready: {formatMoney(selectedIncomeReady)}</p>
                <button
                  onClick={collectSelectedIncome}
                  disabled={selectedIncomeReady <= 0}
                  className="mt-1.5 w-full rounded-md bg-green-600 py-1.5 text-[9px] font-bold disabled:opacity-40"
                >
                  {selectedIncomeReady > 0 ? `COLLECT ${formatMoney(selectedIncomeReady)}` : 'WAIT FOR INCOME'}
                </button>
              </section>
            )}
          </div>

          <div className="mt-2 shrink-0 border-t border-white/15 pt-2">
            <button
              onClick={rotateSelectedBuilding}
              className="mb-1.5 w-full rounded-md bg-purple-700 py-1.5 text-[9px] font-bold hover:bg-purple-600"
            >↻ ROTATE 90°</button>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={startMoving} className="rounded-md bg-amber-600 py-2 text-[10px] font-bold hover:bg-amber-500">↔ MOVE</button>
              <button onClick={removeSelected} className="rounded-md bg-red-700 py-2 text-[10px] font-bold hover:bg-red-600">✕ REMOVE</button>
            </div>
            <p className="mt-1 text-center text-[8px] leading-tight text-slate-400">Remove refunds 50% of construction cost.</p>
          </div>
        </div>
      )}

      {/* SELECTED TOOL */}
      <div className="ui-panel absolute bottom-2 left-2 z-20 max-w-[42vw] rounded-lg border border-white/15 bg-slate-950/90 px-2 py-1.5 backdrop-blur-xl">
        <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
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
