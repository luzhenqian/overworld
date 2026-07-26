'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SceneId } from './scenes';

type InputKey = 'forward' | 'backward' | 'left' | 'right';

type Blocker = {
  x: number;
  z: number;
  radius?: number;
  halfX?: number;
  halfZ?: number;
  enabled?: () => boolean;
};

type Interactable = {
  object: THREE.Object3D;
  name: string;
  label: string | (() => string);
  radius?: number;
  available?: () => boolean;
  activate: () => void;
};

type GameMessage = {
  status?: string;
  objective?: string;
  progress?: string;
  complete?: boolean;
  failed?: boolean;
  event?: string;
};

type Runtime = {
  spawn: THREE.Vector3;
  blockers: Blocker[];
  interactables: Interactable[];
  isWalkable: (x: number, z: number) => boolean;
  update: (
    elapsed: number,
    delta: number,
    variant: number,
    player: THREE.Group,
  ) => void;
  onAction?: (player: THREE.Group) => void;
};

type BuildContext = {
  scene: THREE.Scene;
  emit: (message: GameMessage) => void;
};

const META: Record<
  SceneId,
  {
    accent: number;
    background: number;
    fog: number;
    camera: [number, number, number];
    objective: string;
    progress: string;
    action: string;
  }
> = {
  meadow: {
    accent: 0x8ff0bd,
    background: 0x91c4d2,
    fog: 0xb9dcd4,
    camera: [12, 9, 13],
    objective: '收集三枚星辉结晶，打开北境传送门',
    progress: '结晶 0 / 3',
    action: 'E',
  },
  dungeon: {
    accent: 0xffc16a,
    background: 0x140d16,
    fog: 0x241725,
    camera: [10, 8, 12],
    objective: '找到钥匙，启动机关并取得遗物',
    progress: '寻找旧钥匙',
    action: 'E',
  },
  town: {
    accent: 0x87d7ff,
    background: 0xafd5dc,
    fog: 0xc7dfd8,
    camera: [12, 8, 13],
    objective: '完成镇长交付的包裹委托',
    progress: '与镇长交谈',
    action: 'E',
  },
  stealth: {
    accent: 0xff668f,
    background: 0x080916,
    fog: 0x10142a,
    camera: [11, 9, 12],
    objective: '取得密令并返回撤离点',
    progress: '警戒 0%',
    action: 'E',
  },
  defense: {
    accent: 0x69c7ff,
    background: 0x020a14,
    fog: 0x071629,
    camera: [13, 10, 13],
    objective: '击退十二只虚空生物',
    progress: '击退 0 / 12 · 核心 5 / 5',
    action: 'FIRE',
  },
  coop: {
    accent: 0xd9ff64,
    background: 0x12160f,
    fog: 0x202719,
    camera: [12, 9, 14],
    objective: '与 BOT 搭档同时压住两块机关',
    progress: '向 BOT 下达等待指令',
    action: 'E',
  },
};

function material(
  color: number,
  options: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.08,
    ...options,
  });
}

function box(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  meshMaterial: THREE.Material,
  rotationY = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), meshMaterial);
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  parent.add(mesh);
  return mesh;
}

function label(
  parent: THREE.Object3D,
  text: string,
  position: [number, number, number],
  accent: string,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 104;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.beginPath();
  context.roundRect(4, 4, 504, 96, 18);
  context.fillStyle = 'rgba(5, 8, 7, 0.78)';
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = accent;
  context.fillRect(30, 87, 452, 2);
  context.font = '600 31px ui-monospace, monospace';
  context.fillStyle = '#f5f8f6';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 256, 49);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      opacity: 0.94,
    }),
  );
  sprite.position.set(...position);
  sprite.scale.set(2.9, 0.59, 1);
  parent.add(sprite);
  return sprite;
}

function marker(object: THREE.Object3D, color: number) {
  const markerRoot = new THREE.Group();
  markerRoot.userData.interactionMarker = true;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.61, 32),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.035;
  markerRoot.add(ring);
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.75, 32),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.03;
  markerRoot.add(outerRing);
  object.add(markerRoot);
}

function createCharacter(color: number, height = 0.8) {
  const character = new THREE.Group();
  const colorValue = new THREE.Color(color);
  const dark = colorValue.clone().multiplyScalar(0.48);
  const pale = colorValue.clone().lerp(new THREE.Color(0xffffff), 0.58);
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, height * 0.72, 6, 12),
    material(color, {
      emissive: color,
      emissiveIntensity: 0.22,
      roughness: 0.5,
    }),
  );
  body.position.y = 0.72 + (height - 0.8) * 0.36;
  character.add(body);
  const mantle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.29, 0.2, 8),
    material(dark.getHex(), { roughness: 0.78 }),
  );
  mantle.position.y = 1.06 + (height - 0.8) * 0.5;
  character.add(mantle);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 14, 10),
    material(pale.getHex(), { roughness: 0.62 }),
  );
  head.position.y = 1.34 + (height - 0.8) * 0.65;
  character.add(head);
  const visor = box(
    character,
    [0.28, 0.065, 0.06],
    [0, 1.37 + (height - 0.8) * 0.65, 0.205],
    new THREE.MeshBasicMaterial({ color: dark.getHex() }),
  );
  visor.rotation.x = -0.04;
  const bootMaterial = material(dark.getHex(), { roughness: 0.9 });
  box(character, [0.2, 0.18, 0.33], [-0.16, 0.12, 0.045], bootMaterial);
  box(character, [0.2, 0.18, 0.33], [0.16, 0.12, 0.045], bootMaterial);
  character.userData.body = body;
  return character;
}

function createPlayer(color: number) {
  const player = new THREE.Group();
  const model = createCharacter(color, 0.76);
  player.add(model);
  player.userData.model = model;
  const direction = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.46, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  );
  direction.rotation.x = Math.PI / 2;
  direction.position.set(0, 0.9, 0.5);
  model.add(direction);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 24),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  player.add(shadow);
  return player;
}

function isBlocked(x: number, z: number, blockers: Blocker[]) {
  return blockers.some((blocker) => {
    if (blocker.enabled && !blocker.enabled()) return false;
    if (blocker.halfX !== undefined && blocker.halfZ !== undefined) {
      return (
        Math.abs(x - blocker.x) < blocker.halfX + 0.38 &&
        Math.abs(z - blocker.z) < blocker.halfZ + 0.38
      );
    }
    const dx = x - blocker.x;
    const dz = z - blocker.z;
    return dx * dx + dz * dz < ((blocker.radius ?? 0) + 0.38) ** 2;
  });
}

function addBasicLights(scene: THREE.Scene, sky: number, ground: number, sun: number) {
  scene.add(new THREE.HemisphereLight(sky, ground, 1.35));
  const light = new THREE.DirectionalLight(sun, 2.2);
  light.position.set(-7, 13, 8);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.left = -14;
  light.shadow.camera.right = 14;
  light.shadow.camera.top = 14;
  light.shadow.camera.bottom = -14;
  light.shadow.bias = -0.0008;
  scene.add(light);
  return light;
}

function addSkyDome(scene: THREE.Scene, top: number, horizon: number, bottom: number) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(58, 32, 18),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(top) },
        horizonColor: { value: new THREE.Color(horizon) },
        bottomColor: { value: new THREE.Color(bottom) },
      },
      vertexShader: `
        varying vec3 vPosition;
        void main() {
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPosition;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        void main() {
          float h = normalize(vPosition).y;
          vec3 lower = mix(bottomColor, horizonColor, smoothstep(-0.45, 0.05, h));
          vec3 color = mix(lower, topColor, smoothstep(0.0, 0.78, h));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

function addAmbientParticles(
  parent: THREE.Object3D,
  count: number,
  radius: number,
  height: number,
  color: number,
  size = 0.055,
) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random()) * radius;
    positions[index * 3] = Math.cos(angle) * distance;
    positions[index * 3 + 1] = Math.random() * height + 0.12;
    positions[index * 3 + 2] = Math.sin(angle) * distance;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  parent.add(points);
  return points;
}

function buildMeadow({ scene, emit }: BuildContext): Runtime {
  const root = new THREE.Group();
  scene.add(root);
  const sun = addBasicLights(scene, 0xd8f6ff, 0x28432e, 0xffe7ad);
  const sky = addSkyDome(scene, 0x7eacc9, 0xcce8df, 0x6c9f8d);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(42, 64),
    material(0x347b89, {
      roughness: 0.22,
      metalness: 0.16,
      transparent: true,
      opacity: 0.9,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1;
  root.add(water);
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(10.5, 8.6, 1.8, 10),
    material(0x608b4e, { roughness: 0.96 }),
  );
  island.position.y = -0.88;
  root.add(island);
  const shoreline = new THREE.Mesh(
    new THREE.RingGeometry(8.7, 10.35, 64),
    material(0xb9c890, { roughness: 0.98 }),
  );
  shoreline.rotation.x = -Math.PI / 2;
  shoreline.position.y = -0.03;
  root.add(shoreline);

  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2 + 0.3;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(4 + (index % 3), 7 + (index % 2) * 2, 7),
      material(index % 2 ? 0x496c5a : 0x3d6654, { roughness: 1 }),
    );
    hill.position.set(Math.cos(angle) * 24, 1.2, Math.sin(angle) * 24);
    hill.rotation.y = angle;
    root.add(hill);
  }

  const blockers: Blocker[] = [];
  const treeMat = material(0x235a3b, { roughness: 1 });
  const trunkMat = material(0x65442d, { roughness: 1 });
  [
    [-6.8, -1.2],
    [-5.6, 4.8],
    [-2.7, -6.5],
    [3.2, -6.7],
    [6.8, -2.5],
    [6.2, 4.5],
    [-1.5, 7.2],
    [1.4, 2.2],
  ].forEach(([x, z], index) => {
    box(root, [0.34, 1.3, 0.34], [x, 0.65, z], trunkMat);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.95 + (index % 2) * 0.18, 2.25, 7),
      treeMat,
    );
    crown.position.set(x, 2.15, z);
    root.add(crown);
    const upperCrown = new THREE.Mesh(
      new THREE.ConeGeometry(0.68 + (index % 2) * 0.12, 1.65, 7),
      material(index % 2 ? 0x2f7148 : 0x2a6945, { roughness: 1 }),
    );
    upperCrown.position.set(x, 3.05, z);
    root.add(upperCrown);
    blockers.push({ x, z, radius: 0.72 });
  });

  [
    [-4.5, -2.7, 0.28],
    [4.3, 3.1, -0.36],
  ].forEach(([x, z, rotation]) => {
    box(root, [2.4, 2, 2.1], [x, 1, z], material(0xe3d1a6), rotation);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.75, 1.15, 4),
      material(0xb75f3e, { roughness: 0.9 }),
    );
    roof.position.set(x, 2.55, z);
    roof.rotation.y = Math.PI / 4 + rotation;
    root.add(roof);
    box(root, [0.46, 0.68, 0.08], [x, 0.78, z + 1.08], material(0x5f4937), rotation);
    const windowMaterial = material(0xffd67f, {
      emissive: 0xe89638,
      emissiveIntensity: 0.65,
      roughness: 0.35,
    });
    box(root, [0.42, 0.38, 0.07], [x - 0.66, 1.25, z + 1.07], windowMaterial, rotation);
    blockers.push({ x, z, radius: 1.55 });
  });

  const pathMaterial = material(0xc7b992, { roughness: 1 });
  for (let index = 0; index < 11; index += 1) {
    const t = index / 10;
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42 + (index % 3) * 0.07, 0.48, 0.09, 7),
      pathMaterial,
    );
    stone.position.set(
      THREE.MathUtils.lerp(2.1, 0, t) + Math.sin(index * 2.4) * 0.22,
      0.045,
      THREE.MathUtils.lerp(-1.6, -6.7, t),
    );
    stone.rotation.y = index * 0.71;
    root.add(stone);
  }

  const grassMaterial = material(0x95c96a, { roughness: 1 });
  const flowerMaterials = [
    material(0xffd06f, { emissive: 0x8f5a19, emissiveIntensity: 0.22 }),
    material(0xff8faf, { emissive: 0x8d2948, emissiveIntensity: 0.22 }),
    material(0xbfa1ff, { emissive: 0x563e98, emissiveIntensity: 0.22 }),
  ];
  for (let index = 0; index < 28; index += 1) {
    const angle = index * 2.399;
    const radius = 3.2 + (index % 7) * 0.83;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (x * x + z * z > 83) continue;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), grassMaterial);
    tuft.position.set(x, 0.22, z);
    tuft.rotation.y = angle;
    root.add(tuft);
    if (index % 3 === 0) {
      const flower = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 7, 5),
        flowerMaterials[index % flowerMaterials.length],
      );
      flower.position.set(x + 0.16, 0.34, z - 0.1);
      root.add(flower);
    }
  }

  let collected = 0;
  const crystalPositions: [number, number][] = [
    [3, -2.5],
    [-5.5, 3.3],
    [5.6, 5.2],
  ];
  const interactables: Interactable[] = [];
  crystalPositions.forEach(([x, z], index) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    root.add(group);
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      material(0xb9fff1, {
        emissive: 0x3bd8ab,
        emissiveIntensity: 2.2,
        roughness: 0.15,
      }),
    );
    crystal.position.y = 0.72;
    crystal.scale.y = 1.7;
    group.add(crystal);
    marker(group, 0x8ff0bd);
    let taken = false;
    interactables.push({
      object: group,
      name: `meadow.crystal.${index + 1}`,
      label: '拾取星辉结晶',
      available: () => !taken,
      activate: () => {
        if (taken) return;
        taken = true;
        collected += 1;
        group.visible = false;
        emit({
          status: `获得星辉结晶 ${collected}/3`,
          progress: `结晶 ${collected} / 3`,
          objective: collected === 3 ? '前往北境传送门' : undefined,
          event: 'inventory:item-added',
        });
      },
    });
  });

  const gate = new THREE.Group();
  gate.position.set(0, 0, -7.4);
  root.add(gate);
  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.14, 16, 64),
    material(0x8ff0bd, {
      emissive: 0x3bd8ab,
      emissiveIntensity: 2.5,
      metalness: 0.5,
      roughness: 0.2,
    }),
  );
  portal.position.y = 1.65;
  gate.add(portal);
  const portalSurface = new THREE.Mesh(
    new THREE.CircleGeometry(1.08, 48),
    new THREE.MeshBasicMaterial({
      color: 0x9fffd6,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  portalSurface.position.y = 1.65;
  gate.add(portalSurface);
  box(gate, [0.46, 3.1, 0.52], [-1.63, 1.5, 0], material(0x61715f, { roughness: 0.96 }));
  box(gate, [0.46, 3.1, 0.52], [1.63, 1.5, 0], material(0x61715f, { roughness: 0.96 }));
  marker(gate, 0x8ff0bd);
  label(root, 'NORTH GATE', [0, 3.7, -7.4], '#8ff0bd');
  interactables.push({
    object: gate,
    name: 'meadow.north-gate',
    label: () => (collected === 3 ? '开启北境传送门' : `仍需 ${3 - collected} 枚结晶`),
    radius: 2.4,
    activate: () => {
      if (collected < 3) {
        emit({ status: `传送门没有响应，还缺少 ${3 - collected} 枚结晶`, event: 'portal:locked' });
        return;
      }
      emit({
        status: '北境传送门已经开启',
        progress: '探索完成',
        complete: true,
        event: 'scene:portal-entered',
      });
    },
  });

  const rainCount = 600;
  const positions = new Float32Array(rainCount * 3);
  for (let index = 0; index < rainCount; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * 22;
    positions[index * 3 + 1] = Math.random() * 12;
    positions[index * 3 + 2] = (Math.random() - 0.5) * 22;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(
    rainGeometry,
    new THREE.PointsMaterial({ color: 0xc3eaff, size: 0.05, transparent: true, opacity: 0.75 }),
  );
  scene.add(rain);
  const fireflies = addAmbientParticles(root, 95, 9.4, 3.5, 0xd8ff9a, 0.045);
  const clouds: THREE.Group[] = [];
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xf5fff8,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  });
  for (let index = 0; index < 4; index += 1) {
    const cloud = new THREE.Group();
    for (let puff = 0; puff < 4; puff += 1) {
      const mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.75 + (puff % 2) * 0.28, 0),
        cloudMaterial,
      );
      mesh.position.set(puff * 0.82, Math.sin(puff) * 0.22, 0);
      cloud.add(mesh);
    }
    cloud.position.set(-15 + index * 8.5, 8 + (index % 2) * 1.6, -9 - index * 2);
    root.add(cloud);
    clouds.push(cloud);
  }

  return {
    spawn: new THREE.Vector3(2.2, 0, -1.4),
    blockers,
    interactables,
    isWalkable: (x, z) => x * x + z * z < 91,
    update: (elapsed, delta, variant) => {
      portal.rotation.y = elapsed * 0.5;
      portal.position.y = 1.65 + Math.sin(elapsed * 1.8) * 0.08;
      portalSurface.material.opacity = 0.12 + Math.sin(elapsed * 2.3) * 0.05;
      water.material.opacity = 0.86 + Math.sin(elapsed * 0.5) * 0.04;
      water.rotation.z = Math.sin(elapsed * 0.12) * 0.01;
      fireflies.rotation.y = elapsed * 0.025;
      fireflies.position.y = Math.sin(elapsed * 0.55) * 0.12;
      clouds.forEach((cloud, index) => {
        cloud.position.x += delta * (0.18 + index * 0.025);
        if (cloud.position.x > 18) cloud.position.x = -18;
      });
      rain.visible = variant === 1;
      sun.intensity = variant === 2 ? 0.75 : variant === 1 ? 1.3 : 2.2;
      scene.background = new THREE.Color(variant === 2 ? 0x352e53 : variant === 1 ? 0x4f7180 : 0x91c4d2);
      scene.fog = new THREE.FogExp2(variant === 2 ? 0x352e53 : 0xb9dcd4, variant === 1 ? 0.04 : 0.018);
      const skyMaterial = sky.material as THREE.ShaderMaterial;
      const topColor = new THREE.Color(variant === 2 ? 0x342c59 : variant === 1 ? 0x435e72 : 0x7eacc9);
      const horizonColor = new THREE.Color(variant === 2 ? 0xe69b73 : variant === 1 ? 0x7898a2 : 0xcce8df);
      skyMaterial.uniforms.topColor.value.lerp(topColor, 0.025);
      skyMaterial.uniforms.horizonColor.value.lerp(horizonColor, 0.025);
      if (variant === 1) {
        const attribute = rain.geometry.attributes.position;
        for (let index = 0; index < attribute.count; index += 1) {
          let y = attribute.getY(index) - delta * 8;
          if (y < 0) y = 12;
          attribute.setY(index, y);
        }
        attribute.needsUpdate = true;
      }
    },
  };
}

function buildDungeon({ scene, emit }: BuildContext): Runtime {
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight(0xa97baa, 0x0c080c, 1.3));
  scene.add(new THREE.AmbientLight(0x8b607d, 1.05));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 18),
    material(0x322632, { roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const grid = new THREE.GridHelper(20, 20, 0x5e3d58, 0x30212d);
  grid.position.y = 0.015;
  grid.material.transparent = true;
  grid.material.opacity = 0.46;
  root.add(grid);
  const tileMaterials = [
    material(0x382b37, { roughness: 0.98 }),
    material(0x2d232e, { roughness: 0.98 }),
  ];
  for (let x = -7; x <= 7; x += 2) {
    for (let z = -7; z <= 7; z += 2) {
      const tile = box(
        root,
        [1.76, 0.04, 1.76],
        [x, 0.015, z],
        tileMaterials[(Math.abs(x + z) / 2) % 2],
      );
      tile.rotation.y = ((x * 7 + z * 3) % 3) * 0.012;
    }
  }

  const blockers: Blocker[] = [];
  const wallMat = material(0x554556, { roughness: 0.94 });
  [
    [-9.5, 0, 1, 18],
    [9.5, 0, 1, 18],
    [0, -8.5, 20, 1],
    [0, 8.5, 20, 1],
    [-4, 0, 1.5, 7],
    [4, 2.8, 1.5, 5.5],
  ].forEach(([x, z, sx, sz]) => {
    box(root, [sx, 2.8, sz], [x, 1.4, z], wallMat);
    blockers.push({ x, z, halfX: sx / 2, halfZ: sz / 2 });
  });
  const pillarMaterial = material(0x665267, { roughness: 0.96 });
  [
    [-8.35, -7.3],
    [8.35, -7.3],
    [-8.35, 7.3],
    [8.35, 7.3],
    [-4, -3.6],
    [4, 5.7],
  ].forEach(([x, z]) => {
    box(root, [0.66, 3.3, 0.66], [x, 1.65, z], pillarMaterial);
    box(root, [0.9, 0.24, 0.9], [x, 0.12, z], pillarMaterial);
    box(root, [0.86, 0.2, 0.86], [x, 3.18, z], pillarMaterial);
  });

  const torches: THREE.PointLight[] = [];
  [
    [-7.2, -6.7],
    [7.2, -6.7],
    [-7.2, 6.6],
    [7.2, 6.6],
  ].forEach(([x, z]) => {
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 10),
      material(0xffa14c, { emissive: 0xff5c18, emissiveIntensity: 3 }),
    );
    flame.position.set(x, 1.9, z);
    root.add(flame);
    box(root, [0.34, 0.18, 0.22], [x, 1.58, z], material(0x1b141b, { metalness: 0.42 }));
    const light = new THREE.PointLight(0xff7537, 3.4, 9);
    light.position.copy(flame.position);
    root.add(light);
    torches.push(light);
  });

  let hasKey = false;
  let doorOpen = false;
  const keyGroup = new THREE.Group();
  keyGroup.position.set(-6.7, 0, -5.8);
  root.add(keyGroup);
  const keyMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.32, 0.09, 10, 32),
    material(0xffd275, { emissive: 0xb75a11, emissiveIntensity: 1.5, metalness: 0.55 }),
  );
  keyMesh.rotation.x = Math.PI / 2;
  keyMesh.position.y = 0.7;
  keyGroup.add(keyMesh);
  marker(keyGroup, 0xffc16a);
  const keyLabel = label(root, 'OLD KEY', [-6.7, 2.2, -5.8], '#ffc16a');
  const keyLight = new THREE.PointLight(0xffae5e, 1.8, 4.2);
  keyLight.position.set(-6.7, 1.25, -5.8);
  root.add(keyLight);

  const lever = new THREE.Group();
  lever.position.set(6.7, 0, -4.8);
  root.add(lever);
  box(lever, [0.5, 1.2, 0.5], [0, 0.6, 0], material(0x75616f));
  const leverArm = box(lever, [0.18, 1.1, 0.18], [0, 1.4, 0], material(0xffc16a));
  leverArm.rotation.z = -0.55;
  marker(lever, 0xffc16a);
  label(root, 'STONE LEVER', [6.7, 2.8, -4.8], '#ffc16a');
  const leverLight = new THREE.PointLight(0xff8b4e, 1.35, 3.8);
  leverLight.position.set(6.7, 1.4, -4.8);
  root.add(leverLight);

  const door = box(root, [5.5, 3.4, 0.75], [0, 1.7, 1.3], material(0x5a4857, { metalness: 0.25 }));
  box(root, [0.85, 4.1, 1.05], [-3.15, 2.05, 1.3], pillarMaterial);
  box(root, [0.85, 4.1, 1.05], [3.15, 2.05, 1.3], pillarMaterial);
  box(root, [7.15, 0.72, 1.05], [0, 3.74, 1.3], pillarMaterial);
  for (let index = -2; index <= 2; index += 1) {
    box(
      root,
      [0.09, 2.9, 0.82],
      [index * 0.88, 1.72, 0.86],
      material(0x2f242f, { metalness: 0.5, roughness: 0.5 }),
    );
  }
  blockers.push({
    x: 0,
    z: 1.3,
    halfX: 2.75,
    halfZ: 0.38,
    enabled: () => !doorOpen,
  });

  const relic = new THREE.Group();
  relic.position.set(0, 0, 6.2);
  root.add(relic);
  box(relic, [2.2, 0.45, 2.2], [0, 0.22, 0], material(0x4f3c4c));
  const relicCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.68, 1),
    material(0xffc16a, { emissive: 0xff6933, emissiveIntensity: 2.4 }),
  );
  relicCore.position.y = 1.25;
  relic.add(relicCore);
  const relicHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.035, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffc16a,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  relicHalo.position.y = 1.25;
  relicHalo.rotation.x = Math.PI / 2;
  relic.add(relicHalo);
  marker(relic, 0xffc16a);
  const relicLabel = label(root, 'SUN RELIC', [0, 3.1, 6.2], '#ffc16a');
  if (relicLabel) relicLabel.visible = false;
  const relicLight = new THREE.PointLight(0xff7b42, 2.4, 5.5);
  relicLight.position.set(0, 2, 6.2);
  relicLight.intensity = 0.28;
  root.add(relicLight);
  const embers = addAmbientParticles(root, 100, 9, 3.2, 0xff8a43, 0.035);

  return {
    spawn: new THREE.Vector3(-6.1, 0, -4.8),
    blockers,
    interactables: [
      {
        object: keyGroup,
        name: 'dungeon.old-key',
        label: '拾取旧钥匙',
        available: () => !hasKey,
        activate: () => {
          hasKey = true;
          keyGroup.visible = false;
          if (keyLabel) keyLabel.visible = false;
          emit({
            status: '取得旧钥匙，远处的机关可以使用了',
            objective: '前往东侧启动石制机关',
            progress: '钥匙已取得',
            event: 'inventory:item-added',
          });
        },
      },
      {
        object: lever,
        name: 'dungeon.stone-lever',
        label: () => (hasKey ? '插入钥匙并扳动机关' : '机关缺少钥匙'),
        activate: () => {
          if (!hasKey) {
            emit({ status: '机关锁死了，需要一把旧钥匙', event: 'interaction:blocked' });
            return;
          }
          if (!doorOpen) {
            doorOpen = true;
            if (relicLabel) relicLabel.visible = true;
            emit({
              status: '石门正在升起',
              objective: '穿过石门，取得太阳遗物',
              progress: '通道已开启',
              event: 'quest:objective-completed',
            });
          }
        },
      },
      {
        object: relic,
        name: 'dungeon.sun-relic',
        label: '取得太阳遗物',
        available: () => doorOpen,
        radius: 2.1,
        activate: () => {
          emit({
            status: '太阳遗物已经收入背包',
            progress: '地牢完成',
            complete: true,
            event: 'quest:completed',
          });
        },
      },
    ],
    isWalkable: (x, z) => Math.abs(x) < 8.7 && Math.abs(z) < 7.7,
    update: (elapsed, _delta, variant) => {
      torches.forEach((torch, index) => {
        torch.intensity = 2.8 + Math.sin(elapsed * (6 + variant) + index * 1.7) * 0.55;
      });
      keyMesh.rotation.z = elapsed * 0.7;
      leverArm.rotation.z += ((doorOpen ? 0.6 : -0.55) - leverArm.rotation.z) * 0.08;
      door.position.y += ((doorOpen ? 4.7 : 1.7) - door.position.y) * 0.055;
      relicCore.rotation.x = elapsed * 0.35;
      relicCore.rotation.y = elapsed * 0.65;
      relicCore.position.y = 1.25 + Math.sin(elapsed * 2) * 0.1;
      relicLight.intensity += ((doorOpen ? 2.4 : 0.28) - relicLight.intensity) * 0.06;
      relicHalo.rotation.z = elapsed * 0.28;
      relicHalo.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.07);
      embers.rotation.y = elapsed * 0.035;
      embers.position.y = Math.sin(elapsed * 0.7) * 0.18;
    },
  };
}

function buildTown({ scene, emit }: BuildContext): Runtime {
  const root = new THREE.Group();
  scene.add(root);
  const sun = addBasicLights(scene, 0xe3fbff, 0x486041, 0xffe0a6);
  const sky = addSkyDome(scene, 0x87b8cf, 0xe7eee0, 0x8fb296);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(23, 19),
    material(0x7fa56a, { roughness: 0.98 }),
  );
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);
  const square = new THREE.Mesh(
    new THREE.CircleGeometry(6, 8),
    material(0xc1b391, { roughness: 1 }),
  );
  square.rotation.x = -Math.PI / 2;
  square.position.y = 0.015;
  root.add(square);

  const blockers: Blocker[] = [];
  const cobbleMaterial = material(0xd0c3a3, { roughness: 1 });
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.48, 0.06, 7),
      cobbleMaterial,
    );
    stone.position.set(Math.cos(angle) * 4.8, 0.04, Math.sin(angle) * 4.8);
    stone.rotation.y = angle;
    root.add(stone);
  }
  const houses = [
    [-8, -5, 0xc97050],
    [-3, -7, 0x6f90c5],
    [4.5, -6.5, 0xd9a04e],
    [8.2, -2, 0x8c70bb],
    [7.5, 5, 0xb76363],
    [-7.5, 5.4, 0x5e9e78],
  ] as const;
  houses.forEach(([x, z, roofColor], index) => {
    const width = 2.4 + (index % 2) * 0.5;
    box(root, [width, 2.2, 2.3], [x, 1.1, z], material(0xe8d6ad));
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(width * 0.75, 1.25, 4),
      material(roofColor, { roughness: 0.88 }),
    );
    roof.position.set(x, 2.8, z);
    roof.rotation.y = Math.PI / 4;
    root.add(roof);
    const facing = z > 0 ? -1 : 1;
    box(
      root,
      [0.58, 0.94, 0.09],
      [x, 0.52, z + facing * 1.17],
      material(0x67503f, { roughness: 0.96 }),
    );
    const windowMaterial = material(0xffd58a, {
      emissive: 0xe49b42,
      emissiveIntensity: 0.5,
      roughness: 0.4,
    });
    box(root, [0.44, 0.42, 0.08], [x - 0.74, 1.35, z + facing * 1.17], windowMaterial);
    box(root, [0.44, 0.42, 0.08], [x + 0.74, 1.35, z + facing * 1.17], windowMaterial);
    box(root, [0.34, 1.05, 0.34], [x + width * 0.27, 3.1, z], material(0x7b5a49));
    blockers.push({ x, z, radius: width * 0.7 });
  });

  const fountain = new THREE.Group();
  root.add(fountain);
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.18, 1.35, 0.28, 12),
    material(0x9c9e91, { roughness: 0.82 }),
  );
  fountainBase.position.y = 0.14;
  fountain.add(fountainBase);
  const fountainWater = new THREE.Mesh(
    new THREE.CylinderGeometry(0.96, 0.96, 0.07, 24),
    material(0x6cc5d2, {
      emissive: 0x2d7786,
      emissiveIntensity: 0.24,
      metalness: 0.16,
      roughness: 0.2,
      transparent: true,
      opacity: 0.84,
    }),
  );
  fountainWater.position.y = 0.32;
  fountain.add(fountainWater);
  const fountainColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 1.35, 10),
    material(0xadafa2, { roughness: 0.8 }),
  );
  fountainColumn.position.y = 0.82;
  fountain.add(fountainColumn);
  const fountainCrown = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3, 0),
    material(0x87d7ff, { emissive: 0x399ec2, emissiveIntensity: 0.7 }),
  );
  fountainCrown.position.y = 1.58;
  fountain.add(fountainCrown);
  blockers.push({ x: 0, z: 0, radius: 1.3 });

  const stall = new THREE.Group();
  stall.position.set(5.4, 0, 5.35);
  root.add(stall);
  box(stall, [3, 0.18, 1.8], [0, 2.15, 0], material(0x476c83));
  box(stall, [0.14, 2.15, 0.14], [-1.25, 1.08, -0.68], material(0x604936));
  box(stall, [0.14, 2.15, 0.14], [1.25, 1.08, -0.68], material(0x604936));
  box(stall, [2.6, 0.75, 0.9], [0, 0.48, 0], material(0x8b6849));
  for (let index = -2; index <= 2; index += 1) {
    const bundle = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      material(index % 2 ? 0xd78a55 : 0x85ad61),
    );
    bundle.position.set(index * 0.42, 0.96, 0);
    stall.add(bundle);
  }

  let questStep = 0;
  const mayor = createCharacter(0x87d7ff);
  mayor.position.set(-3.4, 0, 1);
  root.add(mayor);
  marker(mayor, 0x87d7ff);
  label(root, 'MAYOR ELLA', [-3.4, 2.6, 1], '#87d7ff');

  const merchant = createCharacter(0xffc76e);
  merchant.position.set(4.8, 0, 3.2);
  root.add(merchant);
  marker(merchant, 0xffc76e);
  label(root, 'MERCHANT ORIN', [4.8, 2.6, 3.2], '#ffc76e');

  const walkers = [
    { group: createCharacter(0xd88ac3), radius: 3.8, speed: 0.18, phase: 0 },
    { group: createCharacter(0x91d57c), radius: 5.2, speed: -0.14, phase: 2 },
    { group: createCharacter(0xe4886f), radius: 4.5, speed: 0.12, phase: 4 },
  ];
  walkers.forEach((walker) => root.add(walker.group));

  const lanterns: THREE.PointLight[] = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const x = Math.cos(angle) * 6.4;
    const z = Math.sin(angle) * 6.4;
    box(root, [0.1, 1.8, 0.1], [x, 0.9, z], material(0x3f4a42, { metalness: 0.38 }));
    const lanternMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      material(0xffc477, { emissive: 0xff9b42, emissiveIntensity: 1.8 }),
    );
    lanternMesh.position.set(x, 1.75, z);
    root.add(lanternMesh);
    const light = new THREE.PointLight(0xffb25e, 0, 5);
    light.position.set(x, 1.65, z);
    root.add(light);
    lanterns.push(light);
  }
  const dust = addAmbientParticles(root, 80, 10, 3.5, 0xffe0a4, 0.032);

  return {
    spawn: new THREE.Vector3(-4.5, 0, 1.4),
    blockers,
    interactables: [
      {
        object: mayor,
        name: 'town.mayor-ella',
        label: () =>
          questStep === 0
            ? '与镇长交谈'
            : questStep === 2
              ? '交付商人的包裹'
              : '询问委托进展',
        activate: () => {
          if (questStep === 0) {
            questStep = 1;
            emit({
              status: '镇长：请去找商人奥林，取回北境药材',
              objective: '前往广场东侧，与商人奥林交谈',
              progress: '委托已接受',
              event: 'dialogue:choice-selected',
            });
          } else if (questStep === 2) {
            questStep = 3;
            emit({
              status: '镇长：太及时了，今晚的商队有救了',
              objective: '委托完成',
              progress: '边境快递 · 完成',
              complete: true,
              event: 'quest:completed',
            });
          } else if (questStep === 1) {
            emit({ status: '镇长：奥林就在广场东侧等你', event: 'dialogue:continued' });
          }
        },
      },
      {
        object: merchant,
        name: 'town.merchant-orin',
        label: () => (questStep === 1 ? '领取药材包裹' : '与商人交谈'),
        activate: () => {
          if (questStep === 1) {
            questStep = 2;
            emit({
              status: '奥林：拿好，别让镇长久等',
              objective: '把药材包裹交还给镇长',
              progress: '药材包裹已取得',
              event: 'inventory:item-added',
            });
          } else {
            emit({ status: '奥林：早市的货已经卖得差不多了', event: 'dialogue:opened' });
          }
        },
      },
    ],
    isWalkable: (x, z) => Math.abs(x) < 10.8 && Math.abs(z) < 8.7,
    update: (elapsed, _delta, variant) => {
      walkers.forEach((walker, index) => {
        const angle = elapsed * walker.speed + walker.phase;
        walker.group.position.set(
          Math.cos(angle) * walker.radius,
          0,
          Math.sin(angle) * walker.radius,
        );
        walker.group.rotation.y = -angle + (walker.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      });
      const evening = variant === 2;
      lanterns.forEach((light, index) => {
        light.intensity = evening ? 1.7 + Math.sin(elapsed * 4 + index) * 0.2 : 0;
      });
      sun.intensity = evening ? 0.65 : variant === 1 ? 1.5 : 2.2;
      scene.background = new THREE.Color(evening ? 0x453b62 : variant === 1 ? 0x9fc5ce : 0xafd5dc);
      const skyMaterial = sky.material as THREE.ShaderMaterial;
      skyMaterial.uniforms.topColor.value.lerp(
        new THREE.Color(evening ? 0x3a315c : variant === 1 ? 0x87aebe : 0x87b8cf),
        0.025,
      );
      skyMaterial.uniforms.horizonColor.value.lerp(
        new THREE.Color(evening ? 0xd98a6b : 0xe7eee0),
        0.025,
      );
      fountainWater.rotation.y = elapsed * 0.08;
      fountainWater.scale.setScalar(1 + Math.sin(elapsed * 1.7) * 0.018);
      fountainCrown.rotation.y = elapsed * 0.35;
      dust.rotation.y = elapsed * 0.018;
    },
  };
}

function segmentHitsBlocker(
  from: THREE.Vector3,
  to: THREE.Vector3,
  blockers: Blocker[],
) {
  const samples = 9;
  for (let index = 1; index < samples; index += 1) {
    const t = index / samples;
    const x = THREE.MathUtils.lerp(from.x, to.x, t);
    const z = THREE.MathUtils.lerp(from.z, to.z, t);
    if (isBlocked(x, z, blockers)) return true;
  }
  return false;
}

function buildStealth({ scene, emit }: BuildContext): Runtime {
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight(0x39477c, 0x05050b, 0.72));
  addSkyDome(scene, 0x030518, 0x11152d, 0x070712);
  const moon = new THREE.DirectionalLight(0x8199ff, 1.5);
  moon.position.set(-8, 12, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -13;
  moon.shadow.camera.right = 13;
  moon.shadow.camera.top = 13;
  moon.shadow.camera.bottom = -13;
  scene.add(moon);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 18),
    material(0x121525, { roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const grid = new THREE.GridHelper(22, 22, 0x293259, 0x171b31);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  root.add(grid);

  const blockers: Blocker[] = [];
  const wallMat = material(0x242a43, { roughness: 0.86 });
  [
    [-4.4, -3.5, 2.2, 5],
    [3.8, -1.5, 2.4, 6],
    [-1.5, 4, 5, 1.8],
    [6.8, 4.7, 1.8, 4.2],
  ].forEach(([x, z, sx, sz]) => {
    box(root, [sx, 2.7, sz], [x, 1.35, z], wallMat);
    const strip = box(
      root,
      [Math.max(0.12, sx - 0.12), 0.055, Math.max(0.12, sz - 0.12)],
      [x, 2.73, z],
      new THREE.MeshBasicMaterial({
        color: x < 0 ? 0x596dff : 0xff416f,
        transparent: true,
        opacity: 0.64,
      }),
    );
    strip.position.y = 2.73;
    blockers.push({ x, z, halfX: sx / 2, halfZ: sz / 2 });
  });
  const boundaryMaterial = material(0x171b2e, { roughness: 0.75, metalness: 0.3 });
  [
    [0, -8.3, 21, 0.35],
    [0, 8.3, 21, 0.35],
    [-10.3, 0, 0.35, 17],
    [10.3, 0, 0.35, 17],
  ].forEach(([x, z, sx, sz]) => {
    box(root, [sx, 1.1, sz], [x, 0.55, z], boundaryMaterial);
  });
  [
    [-7.1, -1.8],
    [0.7, 2.2],
    [7.7, 6.2],
  ].forEach(([x, z], index) => {
    box(root, [1.15, 0.8, 1.15], [x, 0.4, z], material(index % 2 ? 0x343a57 : 0x2a304c));
    box(root, [0.78, 0.6, 0.78], [x + 0.28, 1.08, z - 0.14], material(0x3d4566));
    blockers.push({ x, z, radius: 0.72 });
  });

  const guards = [
    {
      group: createCharacter(0xff668f),
      from: new THREE.Vector3(-7, 0, -5),
      to: new THREE.Vector3(1, 0, -5),
      phase: 0,
    },
    {
      group: createCharacter(0xff668f),
      from: new THREE.Vector3(6, 0, -6),
      to: new THREE.Vector3(6, 0, 3),
      phase: 1.6,
    },
    {
      group: createCharacter(0xff668f),
      from: new THREE.Vector3(-7, 0, 6),
      to: new THREE.Vector3(3, 0, 6),
      phase: 3.2,
    },
  ];
  guards.forEach((guard) => {
    guard.group.position.copy(guard.from);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.8, 6.5, 3, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff4e80,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cone.rotation.x = Math.PI / 2;
    cone.position.set(0, 0.18, 3.2);
    guard.group.add(cone);
    guard.group.userData.visionCone = cone;
    root.add(guard.group);
  });

  const lure = new THREE.Group();
  lure.position.set(-7.2, 0, 4.7);
  root.add(lure);
  const lureMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.6, 12),
    material(0x7fa0ff, { emissive: 0x4564dd, emissiveIntensity: 1.5 }),
  );
  lureMesh.position.y = 0.32;
  lure.add(lureMesh);
  marker(lure, 0xff668f);
  label(root, 'SOUND DECOY', [-7.2, 2, 4.7], '#ff668f');

  const intel = new THREE.Group();
  intel.position.set(7.6, 0, -6.3);
  root.add(intel);
  const intelMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.9),
    material(0xff668f, { emissive: 0xb91f51, emissiveIntensity: 2 }),
  );
  intelMesh.position.y = 0.7;
  intel.add(intelMesh);
  marker(intel, 0xff668f);
  const intelLabel = label(root, 'SECRET ORDER', [7.6, 2.2, -6.3], '#ff668f');

  const extraction = new THREE.Group();
  extraction.position.set(-8, 0, 6.6);
  root.add(extraction);
  const extractionRing = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.25, 36),
    new THREE.MeshBasicMaterial({ color: 0x73ffcf, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }),
  );
  extractionRing.rotation.x = -Math.PI / 2;
  extractionRing.position.y = 0.03;
  extraction.add(extractionRing);
  label(root, 'EXTRACTION', [-8, 2.1, 6.6], '#73ffcf');
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 1.35, 5.5, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x73ffcf,
      transparent: true,
      opacity: 0.055,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beacon.position.y = 2.6;
  extraction.add(beacon);

  const rainCount = 520;
  const rainPositions = new Float32Array(rainCount * 3);
  for (let index = 0; index < rainCount; index += 1) {
    rainPositions[index * 3] = (Math.random() - 0.5) * 22;
    rainPositions[index * 3 + 1] = Math.random() * 11;
    rainPositions[index * 3 + 2] = (Math.random() - 0.5) * 18;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rain = new THREE.Points(
    rainGeometry,
    new THREE.PointsMaterial({
      color: 0x8ea8ff,
      size: 0.032,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
  );
  root.add(rain);

  const scanRing = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.15, 48),
    new THREE.MeshBasicMaterial({
      color: 0x6e80ff,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  scanRing.rotation.x = -Math.PI / 2;
  scanRing.position.y = 0.035;
  root.add(scanRing);

  let alarm = 0;
  let gotIntel = false;
  let lureTime = 0;
  let lastAlarmBucket = -1;
  return {
    spawn: new THREE.Vector3(-8.6, 0, 3.7),
    blockers,
    interactables: [
      {
        object: lure,
        name: 'stealth.sound-decoy',
        label: '触发声响诱饵',
        activate: () => {
          lureTime = 5;
          emit({ status: '声响诱饵启动，附近守卫正在调查', event: 'audio:decoy-triggered' });
        },
      },
      {
        object: intel,
        name: 'stealth.secret-order',
        label: '取得密令',
        available: () => !gotIntel,
        activate: () => {
          gotIntel = true;
          intel.visible = false;
          if (intelLabel) intelLabel.visible = false;
          emit({
            status: '密令已经取得，立即返回撤离点',
            objective: '回到庭院西北侧的撤离点',
            progress: `密令已取得 · 警戒 ${Math.round(alarm)}%`,
            event: 'quest:item-acquired',
          });
        },
      },
      {
        object: extraction,
        name: 'stealth.extraction',
        label: () => (gotIntel ? '离开庭院' : '尚未取得密令'),
        radius: 1.6,
        activate: () => {
          if (!gotIntel) {
            emit({ status: '必须先取得庭院深处的密令', event: 'extraction:blocked' });
            return;
          }
          emit({
            status: '你带着密令安全离开了庭院',
            progress: '潜入完成',
            complete: true,
            event: 'quest:completed',
          });
        },
      },
    ],
    isWalkable: (x, z) => Math.abs(x) < 9.7 && Math.abs(z) < 7.8,
    update: (elapsed, delta, variant, player) => {
      lureTime = Math.max(0, lureTime - delta);
      let seen = false;
      guards.forEach((guard, index) => {
        let desired: THREE.Vector3;
        if (lureTime > 0 && index < 2) {
          desired = lure.position;
        } else {
          const speed = 0.28 + variant * 0.07;
          const t = (Math.sin(elapsed * speed + guard.phase) + 1) / 2;
          desired = guard.from.clone().lerp(guard.to, t);
        }
        const movement = desired.clone().sub(guard.group.position);
        guard.group.position.lerp(desired, Math.min(delta * 2.1, 0.08));
        if (movement.lengthSq() > 0.001) guard.group.rotation.y = Math.atan2(movement.x, movement.z);

        const toPlayer = player.position.clone().sub(guard.group.position);
        const distance = toPlayer.length();
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(guard.group.quaternion);
        const facing = forward.dot(toPlayer.clone().normalize());
        const guardSeesPlayer =
          distance < 5.4 + variant * 0.7 &&
          facing > 0.58 - variant * 0.06 &&
          !segmentHitsBlocker(guard.group.position, player.position, blockers);
        if (guardSeesPlayer) seen = true;
        const visionCone = guard.group.userData.visionCone as THREE.Mesh;
        const visionMaterial = visionCone.material as THREE.MeshBasicMaterial;
        visionMaterial.opacity = guardSeesPlayer
          ? 0.2
          : 0.09 + Math.sin(elapsed * 2 + index) * 0.018;
      });
      alarm = THREE.MathUtils.clamp(
        alarm + (seen ? delta * (34 + variant * 12) : -delta * 18),
        0,
        100,
      );
      const bucket = Math.floor(alarm / 10);
      if (bucket !== lastAlarmBucket) {
        lastAlarmBucket = bucket;
        emit({ progress: `${gotIntel ? '密令已取得 · ' : ''}警戒 ${Math.round(alarm)}%` });
      }
      if (alarm >= 100) {
        alarm = 0;
        player.position.set(-8.6, 0, 3.7);
        emit({
          status: '你被守卫发现，已经返回最近的检查点',
          progress: gotIntel ? '密令已取得 · 警戒 0%' : '警戒 0%',
          event: 'stealth:spotted',
        });
      }
      extractionRing.material.opacity = gotIntel
        ? 0.65 + Math.sin(elapsed * 4) * 0.25
        : 0.22;
      beacon.material.opacity = gotIntel ? 0.08 + Math.sin(elapsed * 2.5) * 0.025 : 0.025;
      lureMesh.rotation.y = elapsed * 0.5;
      lureMesh.scale.setScalar(lureTime > 0 ? 1 + Math.sin(elapsed * 9) * 0.18 : 1);
      scanRing.position.set(Math.sin(elapsed * 0.42) * 7, 0.035, Math.cos(elapsed * 0.37) * 5.5);
      scanRing.scale.setScalar(0.85 + Math.sin(elapsed * 1.8) * 0.16);
      const rainAttribute = rain.geometry.attributes.position;
      for (let index = 0; index < rainAttribute.count; index += 1) {
        let y = rainAttribute.getY(index) - delta * 5.5;
        if (y < 0) y = 11;
        rainAttribute.setY(index, y);
      }
      rainAttribute.needsUpdate = true;
    },
  };
}

function buildDefense({ scene, emit }: BuildContext): Runtime {
  const root = new THREE.Group();
  scene.add(root);
  scene.add(new THREE.HemisphereLight(0x5caeff, 0x01040b, 0.9));
  addSkyDome(scene, 0x01030c, 0x07152a, 0x01040a);
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(10, 10, 0.45, 32),
    material(0x07192c, { roughness: 0.42, metalness: 0.4 }),
  );
  floor.position.y = -0.23;
  root.add(floor);
  const grid = new THREE.GridHelper(20, 20, 0x268bd4, 0x103859);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.58;
  root.add(grid);
  const arenaRing = new THREE.Mesh(
    new THREE.RingGeometry(9.15, 9.5, 72),
    new THREE.MeshBasicMaterial({
      color: 0x2e9fe5,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  arenaRing.rotation.x = -Math.PI / 2;
  arenaRing.position.y = 0.025;
  root.add(arenaRing);
  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(2.05, 2.12, 64),
    new THREE.MeshBasicMaterial({
      color: 0x69c7ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.035;
  root.add(innerRing);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const pylon = new THREE.Group();
    pylon.position.set(Math.cos(angle) * 8.6, 0, Math.sin(angle) * 8.6);
    pylon.rotation.y = -angle;
    root.add(pylon);
    box(pylon, [0.38, 1.5, 0.38], [0, 0.75, 0], material(0x17334f, { metalness: 0.55 }));
    const pylonLight = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      material(index % 2 ? 0x69c7ff : 0xff5e89, {
        emissive: index % 2 ? 0x187fc5 : 0xa81444,
        emissiveIntensity: 2.2,
      }),
    );
    pylonLight.position.y = 1.72;
    pylon.add(pylonLight);
  }
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1, 1),
    material(0x69c7ff, { emissive: 0x187fc5, emissiveIntensity: 2.5 }),
  );
  core.position.y = 1.3;
  root.add(core);
  const coreRings: THREE.Mesh[] = [];
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.28 + index * 0.3, 0.025, 8, 64),
      new THREE.MeshBasicMaterial({
        color: index === 2 ? 0x9fe2ff : 0x69c7ff,
        transparent: true,
        opacity: 0.48 - index * 0.1,
        depthWrite: false,
      }),
    );
    ring.position.y = 1.3;
    ring.rotation.x = Math.PI / 2 + index * 0.52;
    root.add(ring);
    coreRings.push(ring);
  }
  label(root, 'RIFT CORE', [0, 3.4, 0], '#69c7ff');
  const riftDust = addAmbientParticles(root, 170, 10, 5.8, 0x4abfff, 0.04);

  type Enemy = {
    mesh: THREE.Mesh;
    alive: boolean;
    hp: number;
  };
  type Shot = {
    mesh: THREE.Mesh;
    target: THREE.Vector3;
  };
  const enemies: Enemy[] = [];
  const shots: Shot[] = [];
  let spawnTimer = 0.5;
  let defeated = 0;
  let coreHealth = 5;
  let finished = false;

  const spawnEnemy = (variant: number) => {
    const angle = Math.random() * Math.PI * 2;
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.48, 0),
      material(0xff5e89, {
        emissive: 0xa81444,
        emissiveIntensity: 1.4,
        roughness: 0.35,
      }),
    );
    mesh.position.set(Math.cos(angle) * 9.2, 0.55, Math.sin(angle) * 9.2);
    const enemyHalo = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.68, 24),
      new THREE.MeshBasicMaterial({
        color: 0xff5e89,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    enemyHalo.rotation.x = -Math.PI / 2;
    enemyHalo.position.y = -0.48;
    mesh.add(enemyHalo);
    root.add(mesh);
    enemies.push({ mesh, alive: true, hp: variant === 2 ? 2 : 1 });
  };

  const fire = (player: THREE.Group) => {
    if (finished) return;
    const candidates = enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({ enemy, distance: enemy.mesh.position.distanceTo(player.position) }))
      .filter((entry) => entry.distance < 7.5)
      .sort((a, b) => a.distance - b.distance);
    const target = candidates[0]?.enemy;
    if (!target) {
      emit({ status: '射程内没有目标', event: 'weapon:empty-target' });
      return;
    }
    const shotMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xc9efff }),
    );
    shotMesh.position.copy(player.position).add(new THREE.Vector3(0, 0.8, 0));
    root.add(shotMesh);
    shots.push({ mesh: shotMesh, target: target.mesh.position.clone() });
    target.hp -= 1;
    if (target.hp <= 0) {
      target.alive = false;
      defeated += 1;
      window.setTimeout(() => {
        target.mesh.visible = false;
      }, 120);
      emit({
        status: `击退虚空生物 ${defeated}/12`,
        progress: `击退 ${defeated} / 12 · 核心 ${coreHealth} / 5`,
        event: 'combat:enemy-defeated',
      });
      if (defeated >= 12) {
        finished = true;
        emit({
          status: '最后一只虚空生物已经消散',
          progress: '裂隙守卫 · 完成',
          complete: true,
          event: 'achievement:unlocked',
        });
      }
    } else {
      emit({ status: '命中强化目标', event: 'combat:enemy-hit' });
    }
  };

  return {
    spawn: new THREE.Vector3(0, 0, 5.3),
    blockers: [{ x: 0, z: 0, radius: 1.15 }],
    interactables: [],
    isWalkable: (x, z) => x * x + z * z < 86,
    onAction: fire,
    update: (elapsed, delta, variant) => {
      if (!finished) {
        spawnTimer -= delta;
        const aliveCount = enemies.filter((enemy) => enemy.alive).length;
        if (spawnTimer <= 0 && aliveCount < 7 && defeated + aliveCount < 16) {
          spawnEnemy(variant);
          spawnTimer = [2.2, 1.7, 1.25][variant] ?? 1.7;
        }
      }
      enemies.forEach((enemy, index) => {
        if (!enemy.alive) return;
        const direction = new THREE.Vector3(0, 0.55, 0).sub(enemy.mesh.position).normalize();
        enemy.mesh.position.addScaledVector(direction, delta * (0.7 + variant * 0.2));
        enemy.mesh.rotation.x = elapsed * 1.2 + index;
        enemy.mesh.rotation.y = elapsed * 0.8;
        if (enemy.mesh.position.length() < 1.5) {
          enemy.alive = false;
          enemy.mesh.visible = false;
          coreHealth -= 1;
          emit({
            status: '一只虚空生物撞击了核心',
            progress: `击退 ${defeated} / 12 · 核心 ${Math.max(coreHealth, 0)} / 5`,
            event: 'core:damaged',
          });
          if (coreHealth <= 0) {
            finished = true;
            emit({
              status: '裂隙核心失守',
              progress: '防守失败',
              failed: true,
              event: 'game:failed',
            });
          }
        }
      });
      shots.forEach((shot) => {
        shot.mesh.position.lerp(shot.target, Math.min(delta * 14, 0.8));
        if (shot.mesh.position.distanceTo(shot.target) < 0.18) shot.mesh.visible = false;
      });
      core.rotation.x = elapsed * 0.35;
      core.rotation.y = elapsed * 0.6;
      (core.material as THREE.MeshStandardMaterial).emissiveIntensity =
        1.7 + Math.sin(elapsed * 3) * 0.8;
      coreRings.forEach((ring, index) => {
        ring.rotation.z = elapsed * (0.18 + index * 0.11) * (index % 2 ? -1 : 1);
        ring.scale.setScalar(1 + Math.sin(elapsed * 2.2 + index) * 0.045);
      });
      arenaRing.rotation.z = elapsed * 0.012;
      innerRing.rotation.z = -elapsed * 0.08;
      riftDust.rotation.y = elapsed * 0.07;
      riftDust.position.y = Math.sin(elapsed * 0.6) * 0.2;
    },
  };
}

function buildCoop({ scene, emit }: BuildContext): Runtime {
  const root = new THREE.Group();
  scene.add(root);
  addBasicLights(scene, 0xeaffd1, 0x1d2517, 0xe8ff9b);
  addSkyDome(scene, 0x18251f, 0x52694b, 0x172013);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    material(0x35402c, { roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  const grid = new THREE.GridHelper(18, 18, 0x7fa34f, 0x445337);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.44;
  root.add(grid);
  const blockers: Blocker[] = [];
  const wallMat = material(0x59624e, { roughness: 0.92 });
  [
    [-8.5, 0, 1, 18],
    [8.5, 0, 1, 18],
    [0, -8.5, 18, 1],
    [0, 8.5, 18, 1],
    [-5.5, -2, 2, 5],
    [5.5, -2, 2, 5],
  ].forEach(([x, z, sx, sz]) => {
    box(root, [sx, 2.6, sz], [x, 1.3, z], wallMat);
    blockers.push({ x, z, halfX: sx / 2, halfZ: sz / 2 });
  });
  const runeStoneMaterial = material(0x6d765f, { roughness: 0.96 });
  [
    [-7.3, 6.8],
    [7.3, 6.8],
    [-7.3, -6.8],
    [7.3, -6.8],
    [-3.8, -3.4],
    [3.8, -3.4],
  ].forEach(([x, z], index) => {
    const column = new THREE.Group();
    column.position.set(x, 0, z);
    root.add(column);
    box(column, [0.76, 2.9, 0.76], [0, 1.45, 0], runeStoneMaterial);
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.25, 6),
      new THREE.MeshBasicMaterial({
        color: index % 2 ? 0x71c9ff : 0xd9ff64,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
      }),
    );
    rune.position.set(0, 1.55, 0.39);
    column.add(rune);
  });

  const bot = createCharacter(0x71c9ff);
  bot.position.set(-2.8, 0, 5.2);
  root.add(bot);
  marker(bot, 0x71c9ff);
  label(root, 'BOT / LYRA', [-2.8, 2.6, 5.2], '#71c9ff');

  const playerPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.15, 0.15, 32),
    material(0xd9ff64, { emissive: 0x6f8d1c, emissiveIntensity: 0.35 }),
  );
  playerPlate.position.set(-3, 0.08, 0.8);
  root.add(playerPlate);
  const playerPlateRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.055, 8, 40),
    new THREE.MeshBasicMaterial({ color: 0xd9ff64, transparent: true, opacity: 0.5 }),
  );
  playerPlateRing.rotation.x = Math.PI / 2;
  playerPlateRing.position.y = 0.16;
  playerPlate.add(playerPlateRing);
  label(root, 'PLAYER PLATE', [-3, 2, 0.8], '#d9ff64');
  const botPlate = playerPlate.clone();
  botPlate.material = material(0x71c9ff, { emissive: 0x236e9e, emissiveIntensity: 0.35 });
  const clonedBotRing = botPlate.children[0] as THREE.Mesh;
  clonedBotRing.material = new THREE.MeshBasicMaterial({
    color: 0x71c9ff,
    transparent: true,
    opacity: 0.5,
  });
  botPlate.position.set(3, 0.08, 0.8);
  root.add(botPlate);
  label(root, 'BOT PLATE', [3, 2, 0.8], '#71c9ff');
  const playerConduit = box(
    root,
    [0.16, 0.045, 3.7],
    [-3, 0.04, -1.15],
    new THREE.MeshBasicMaterial({ color: 0xd9ff64, transparent: true, opacity: 0.18 }),
  );
  const botConduit = box(
    root,
    [0.16, 0.045, 3.7],
    [3, 0.04, -1.15],
    new THREE.MeshBasicMaterial({ color: 0x71c9ff, transparent: true, opacity: 0.18 }),
  );

  let commanded = false;
  let commandPending = false;
  let commandCountdown = 0;
  let doorOpen = false;
  let lastPlateState = '';
  const door = box(root, [6, 3.4, 0.8], [0, 1.7, -3], material(0x69715d, { metalness: 0.25 }));
  box(root, [0.95, 4.25, 1.2], [-3.55, 2.12, -3], runeStoneMaterial);
  box(root, [0.95, 4.25, 1.2], [3.55, 2.12, -3], runeStoneMaterial);
  box(root, [8.05, 0.82, 1.2], [0, 4.02, -3], runeStoneMaterial);
  const doorRune = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.52, 0.08, 72, 8, 2, 3),
    material(0xd9ff64, { emissive: 0x6f8d1c, emissiveIntensity: 1.2 }),
  );
  doorRune.position.set(0, 1.8, -2.55);
  root.add(doorRune);
  blockers.push({
    x: 0,
    z: -3,
    halfX: 3,
    halfZ: 0.4,
    enabled: () => !doorOpen,
  });

  const relic = new THREE.Group();
  relic.position.set(0, 0, -6.2);
  root.add(relic);
  const relicCore = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.75, 0),
    material(0xd9ff64, { emissive: 0x86ad26, emissiveIntensity: 2.4 }),
  );
  relicCore.position.y = 1.15;
  relic.add(relicCore);
  const twinRingA = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.04, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xd9ff64, transparent: true, opacity: 0.56 }),
  );
  twinRingA.position.y = 1.15;
  twinRingA.rotation.x = Math.PI / 2;
  relic.add(twinRingA);
  const twinRingB = twinRingA.clone();
  twinRingB.material = new THREE.MeshBasicMaterial({ color: 0x71c9ff, transparent: true, opacity: 0.48 });
  twinRingB.rotation.y = Math.PI / 2;
  relic.add(twinRingB);
  marker(relic, 0xd9ff64);
  const twinCoreLabel = label(root, 'TWIN CORE', [0, 3, -6.2], '#d9ff64');
  if (twinCoreLabel) twinCoreLabel.visible = false;
  const motes = addAmbientParticles(root, 120, 8, 4.2, 0xb5e784, 0.04);

  return {
    spawn: new THREE.Vector3(0, 0, 5.5),
    blockers,
    interactables: [
      {
        object: bot,
        name: 'coop.bot-lyra',
        label: () => (commanded ? '让 BOT 跟随' : '命令 BOT 前往蓝色机关'),
        activate: () => {
          commandPending = true;
          commandCountdown = -1;
          emit({ status: '指令已经发送给 BOT 搭档', event: 'net:command-sent' });
        },
      },
      {
        object: relic,
        name: 'coop.twin-core',
        label: '共同取得遗迹核心',
        available: () => doorOpen,
        radius: 2,
        activate: () => {
          emit({
            status: '你和 BOT 搭档取得了双生核心',
            progress: '协作解谜 · 完成',
            complete: true,
            event: 'quest:completed',
          });
        },
      },
    ],
    isWalkable: (x, z) => Math.abs(x) < 7.8 && Math.abs(z) < 7.8,
    update: (elapsed, delta, variant, player) => {
      if (commandPending && commandCountdown < 0) {
        commandCountdown = [0.05, 0.8, 1.6][variant] ?? 0.05;
      }
      if (commandPending) {
        commandCountdown -= delta;
        if (commandCountdown <= 0) {
          commanded = !commanded;
          commandPending = false;
          emit({
            status: commanded ? 'BOT 正在前往蓝色机关' : 'BOT 恢复跟随',
            event: 'net:command-acknowledged',
          });
        }
      }
      const botTarget = commanded
        ? new THREE.Vector3(3, 0, 0.8)
        : player.position.clone().add(new THREE.Vector3(-1.5, 0, 0.8));
      const botMovement = botTarget.clone().sub(bot.position);
      bot.position.lerp(botTarget, Math.min(delta * 1.5, 0.055));
      if (botMovement.lengthSq() > 0.01) bot.rotation.y = Math.atan2(botMovement.x, botMovement.z);

      const playerOn = player.position.distanceTo(playerPlate.position) < 1.1;
      const botOn = bot.position.distanceTo(botPlate.position) < 1.1;
      const plateState = `${playerOn}-${botOn}`;
      if (plateState !== lastPlateState) {
        lastPlateState = plateState;
        emit({
          progress: `玩家机关 ${playerOn ? '✓' : '○'} · BOT 机关 ${botOn ? '✓' : '○'}`,
          event: playerOn || botOn ? 'coop:plate-activated' : undefined,
        });
      }
      if (playerOn && botOn && !doorOpen) {
        doorOpen = true;
        if (twinCoreLabel) twinCoreLabel.visible = true;
        emit({
          status: '两块机关已经同步，遗迹大门开启',
          objective: '穿过大门，取得双生核心',
          progress: '同步机关完成',
          event: 'relay:state-synchronized',
        });
      }
      door.position.y += ((doorOpen ? 4.8 : 1.7) - door.position.y) * 0.06;
      (playerPlate.material as THREE.MeshStandardMaterial).emissiveIntensity = playerOn ? 1.8 : 0.35;
      (botPlate.material as THREE.MeshStandardMaterial).emissiveIntensity = botOn ? 1.8 : 0.35;
      (playerConduit.material as THREE.MeshBasicMaterial).opacity = playerOn ? 0.78 : 0.18;
      (botConduit.material as THREE.MeshBasicMaterial).opacity = botOn ? 0.78 : 0.18;
      playerPlateRing.rotation.z = elapsed * 0.42;
      clonedBotRing.rotation.z = -elapsed * 0.42;
      playerPlateRing.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.04);
      clonedBotRing.scale.setScalar(1 + Math.sin(elapsed * 3 + 1) * 0.04);
      doorRune.rotation.x = elapsed * 0.16;
      doorRune.rotation.y = elapsed * 0.22;
      (doorRune.material as THREE.MeshStandardMaterial).emissiveIntensity =
        doorOpen ? 2 + Math.sin(elapsed * 3) * 0.4 : 0.55;
      relicCore.rotation.x = elapsed * 0.4;
      relicCore.rotation.y = elapsed * 0.65;
      twinRingA.rotation.z = elapsed * 0.36;
      twinRingB.rotation.z = -elapsed * 0.28;
      motes.rotation.y = elapsed * 0.035;
    },
  };
}

function buildRuntime(sceneId: SceneId, context: BuildContext) {
  if (sceneId === 'meadow') return buildMeadow(context);
  if (sceneId === 'dungeon') return buildDungeon(context);
  if (sceneId === 'town') return buildTown(context);
  if (sceneId === 'stealth') return buildStealth(context);
  if (sceneId === 'defense') return buildDefense(context);
  return buildCoop(context);
}

export function GameStage({
  sceneId,
  variant,
}: {
  sceneId: SceneId;
  variant: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const variantRef = useRef(variant);
  const inputRef = useRef<Record<InputKey, boolean>>({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });
  const actionRef = useRef<() => void>(() => undefined);
  const [nearby, setNearby] = useState<string | null>(null);
  const [status, setStatus] = useState('进入场景，开始行动');
  const [objective, setObjective] = useState(META[sceneId].objective);
  const [progress, setProgress] = useState(META[sceneId].progress);
  const [coords, setCoords] = useState('0.0 / 0.0');
  const [result, setResult] = useState<'complete' | 'failed' | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const [feedback, setFeedback] = useState<{
    key: number;
    type: 'success' | 'impact' | 'danger' | 'signal';
  } | null>(null);
  const feedbackKeyRef = useRef(0);

  useEffect(() => {
    variantRef.current = variant;
  }, [variant]);

  useEffect(() => {
    setStatus('进入场景，开始行动');
    setObjective(META[sceneId].objective);
    setProgress(META[sceneId].progress);
    setCoords('0.0 / 0.0');
    setResult(null);
    setNearby(null);
    setFeedback(null);
  }, [sceneId, restartKey]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const meta = META[sceneId];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(meta.background);
    scene.fog = new THREE.FogExp2(meta.fog, sceneId === 'defense' ? 0.035 : 0.021);
    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
    camera.position.set(...meta.camera);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = sceneId === 'dungeon' ? 1.25 : 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minDistance = 6.5;
    controls.maxDistance = 20;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = 1.42;

    let ended = false;
    let cameraShake = 0;
    const emit = (message: GameMessage) => {
      if (message.status) setStatus(message.status);
      if (message.objective) setObjective(message.objective);
      if (message.progress) setProgress(message.progress);
      if (message.complete) {
        ended = true;
        setResult('complete');
      }
      if (message.failed) {
        ended = true;
        setResult('failed');
      }
      if (message.event) {
        const eventName = message.event;
        const type =
          eventName.includes('failed') ||
          eventName.includes('spotted') ||
          eventName.includes('damaged')
            ? 'danger'
            : eventName.includes('enemy') || eventName.includes('weapon')
              ? 'impact'
              : eventName.includes('item') ||
                  eventName.includes('completed') ||
                  eventName.includes('unlocked') ||
                  eventName.includes('synchronized')
                ? 'success'
                : 'signal';
        feedbackKeyRef.current += 1;
        setFeedback({ key: feedbackKeyRef.current, type });
        cameraShake = type === 'danger' ? 0.16 : type === 'impact' ? 0.09 : 0.035;
      }
    };
    const runtime = buildRuntime(sceneId, { scene, emit });
    const player = createPlayer(meta.accent);
    player.position.copy(runtime.spawn);
    scene.add(player);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    controls.target.copy(player.position).add(new THREE.Vector3(0, 0.95, 0));

    let nearest: Interactable | null = null;
    let lastNearby = '';
    let actionCooldown = 0;
    const activate = () => {
      if (ended || actionCooldown > 0) return;
      actionCooldown = 0.22;
      if (nearest) nearest.activate();
      else runtime.onAction?.(player);
    };
    actionRef.current = activate;

    const keyMap: Record<string, InputKey | undefined> = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) return;
      const mapped = keyMap[event.code];
      if (mapped) {
        inputRef.current[mapped] = true;
        if (event.code.startsWith('Arrow')) event.preventDefault();
      }
      if ((event.code === 'KeyE' || event.code === 'Space') && !event.repeat) {
        event.preventDefault();
        activate();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const mapped = keyMap[event.code];
      if (mapped) inputRef.current[mapped] = false;
    };
    const clearInput = () => {
      (Object.keys(inputRef.current) as InputKey[]).forEach((key) => {
        inputRef.current[key] = false;
      });
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInput);
    window.addEventListener('pointerup', clearInput);

    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const movement = new THREE.Vector3();
    const previous = new THREE.Vector3();
    const cameraTarget = new THREE.Vector3();
    let coordinateFrame = 0;
    let lastCoordinates = '';
    let frame = 0;
    const animate = () => {
      const delta = Math.min(clock.getDelta(), 0.04);
      const elapsed = clock.elapsedTime;
      actionCooldown = Math.max(0, actionCooldown - delta);
      previous.copy(player.position);

      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      movement.set(0, 0, 0);
      if (inputRef.current.forward) movement.add(forward);
      if (inputRef.current.backward) movement.sub(forward);
      if (inputRef.current.right) movement.add(right);
      if (inputRef.current.left) movement.sub(right);
      if (!ended && movement.lengthSq() > 0) {
        movement.normalize();
        const speed = sceneId === 'defense' ? 5 : 4.25;
        const nextX = player.position.x + movement.x * speed * delta;
        const nextZ = player.position.z + movement.z * speed * delta;
        if (runtime.isWalkable(nextX, player.position.z) && !isBlocked(nextX, player.position.z, runtime.blockers)) {
          player.position.x = nextX;
        }
        if (runtime.isWalkable(player.position.x, nextZ) && !isBlocked(player.position.x, nextZ, runtime.blockers)) {
          player.position.z = nextZ;
        }
        const desired = Math.atan2(movement.x, movement.z);
        let rotationDelta = desired - player.rotation.y;
        rotationDelta = Math.atan2(Math.sin(rotationDelta), Math.cos(rotationDelta));
        player.rotation.y += rotationDelta * Math.min(1, delta * 12);
      }
      const playerModel = player.userData.model as THREE.Group;
      const isMoving = !ended && movement.lengthSq() > 0;
      const targetModelY = isMoving
        ? Math.abs(Math.sin(elapsed * 10.5)) * 0.075
        : Math.sin(elapsed * 2.1) * 0.012;
      playerModel.position.y += (targetModelY - playerModel.position.y) * Math.min(1, delta * 12);
      const targetTilt = isMoving ? Math.sin(elapsed * 10.5) * 0.035 : 0;
      playerModel.rotation.z += (targetTilt - playerModel.rotation.z) * Math.min(1, delta * 10);

      const playerDelta = player.position.clone().sub(previous);
      camera.position.add(playerDelta);
      cameraTarget.copy(player.position).add(new THREE.Vector3(0, 0.95, 0));
      controls.target.lerp(cameraTarget, 0.18);

      let nextNearest: Interactable | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const candidate of runtime.interactables) {
        if (candidate.available && !candidate.available()) continue;
        const position = candidate.object.getWorldPosition(new THREE.Vector3());
        const distance = position.distanceTo(player.position);
        if (distance < (candidate.radius ?? 1.9) && distance < nearestDistance) {
          nextNearest = candidate;
          nearestDistance = distance;
        }
      }
      nearest = nextNearest;
      const nearbyLabel = nextNearest
        ? typeof nextNearest.label === 'function'
          ? nextNearest.label()
          : nextNearest.label
        : '';
      if (nearbyLabel !== lastNearby) {
        lastNearby = nearbyLabel;
        setNearby(nearbyLabel || null);
      }
      runtime.interactables.forEach((candidate) => {
        const ring = candidate.object.children.find((child) => child.userData.interactionMarker);
        if (ring) {
          ring.visible = !candidate.available || candidate.available();
          ring.scale.setScalar(
            candidate === nearest ? 1.15 + Math.sin(elapsed * 5) * 0.12 : 0.88,
          );
          ring.rotation.y = elapsed * 0.32;
        }
      });

      if (!ended) runtime.update(elapsed, delta, variantRef.current, player);
      coordinateFrame += 1;
      if (coordinateFrame % 12 === 0) {
        const nextCoordinates = `${player.position.x.toFixed(1)} / ${player.position.z.toFixed(1)}`;
        if (nextCoordinates !== lastCoordinates) {
          lastCoordinates = nextCoordinates;
          setCoords(nextCoordinates);
        }
      }
      controls.update();
      if (cameraShake > 0.001) {
        const cameraX = camera.position.x;
        const cameraY = camera.position.y;
        const cameraZ = camera.position.z;
        camera.position.x += (Math.random() - 0.5) * cameraShake;
        camera.position.y += (Math.random() - 0.5) * cameraShake * 0.7;
        camera.position.z += (Math.random() - 0.5) * cameraShake;
        renderer.render(scene, camera);
        camera.position.set(cameraX, cameraY, cameraZ);
        cameraShake *= 0.82;
      } else {
        renderer.render(scene, camera);
      }
      frame = window.requestAnimationFrame(animate);
    };

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInput);
      window.removeEventListener('pointerup', clearInput);
      clearInput();
      controls.dispose();
      scene.traverse((object) => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points ||
          object instanceof THREE.Line ||
          object instanceof THREE.Sprite
        ) {
          if ('geometry' in object) object.geometry?.dispose();
          const value = object.material;
          const materials = Array.isArray(value) ? value : [value];
          materials.forEach((item) => {
            if ('map' in item && item.map instanceof THREE.Texture) item.map.dispose();
            item.dispose();
          });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sceneId, restartKey]);

  const setInput = (key: InputKey, pressed: boolean) => {
    inputRef.current[key] = pressed;
  };

  return (
    <>
      <div
        className={`demo-canvas demo-canvas-${sceneId}`}
        ref={mountRef}
        aria-label={`${META[sceneId].objective}。使用 WASD 或方向键移动，E 或空格行动。`}
      />
      {feedback ? (
        <div
          key={feedback.key}
          className={`game-feedback game-feedback-${feedback.type}`}
          aria-hidden="true"
        />
      ) : null}

      <div className="game-hud" aria-live="polite">
        <div className="game-hud-top">
          <span>OBJECTIVE</span>
          <i>POS {coords}</i>
        </div>
        <strong>{objective}</strong>
        <div className="game-progress"><i /><span>{progress}</span></div>
        <p>{status}</p>
      </div>

      {nearby ? (
        <button className="demo-interact-prompt" type="button" onClick={() => actionRef.current()}>
          <kbd>{META[sceneId].action}</kbd>
          <span>{nearby}</span>
        </button>
      ) : null}

      {sceneId === 'defense' ? <div className="game-crosshair" aria-hidden="true">＋</div> : null}

      {result ? (
        <div className={`game-result game-result-${result}`} role="status">
          <span>{result === 'complete' ? 'SCENE COMPLETE' : 'TRY AGAIN'}</span>
          <strong>{result === 'complete' ? '目标完成' : '本局失败'}</strong>
          <button type="button" onClick={() => setRestartKey((key) => key + 1)}>
            重新开始
          </button>
        </div>
      ) : null}

      <div className="demo-touch-controls" aria-label="游戏控制">
        <div className="demo-dpad">
          <button type="button" aria-label="向前移动" onPointerDown={() => setInput('forward', true)} onPointerUp={() => setInput('forward', false)} onPointerLeave={() => setInput('forward', false)}>↑</button>
          <button type="button" aria-label="向左移动" onPointerDown={() => setInput('left', true)} onPointerUp={() => setInput('left', false)} onPointerLeave={() => setInput('left', false)}>←</button>
          <button type="button" aria-label="向后移动" onPointerDown={() => setInput('backward', true)} onPointerUp={() => setInput('backward', false)} onPointerLeave={() => setInput('backward', false)}>↓</button>
          <button type="button" aria-label="向右移动" onPointerDown={() => setInput('right', true)} onPointerUp={() => setInput('right', false)} onPointerLeave={() => setInput('right', false)}>→</button>
        </div>
        <button className="demo-touch-action" type="button" aria-label="执行动作" onClick={() => actionRef.current()}>
          {META[sceneId].action}
        </button>
      </div>
    </>
  );
}
