import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';

class BasemapManager {
  constructor(scene) {
    this.scene = scene;
    this.mapMesh = null;
    this.currentType = null;
    this.textureLoader = new THREE.TextureLoader();
  }

  async loadBasemap(type = 'osm') {
    let url;
    switch (type) {
      case 'satellite':
        url = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/0/0/0';
        break;
      case 'dark':
        url = 'https://a.basemaps.cartocdn.com/dark_all/0/0/0.png';
        break;
      default:
        url = 'https://a.tile.openstreetmap.org/0/0/0.png';
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (texture) => {
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(20, 20);
          this.createOrUpdateMap(texture);
          resolve();
        },
        undefined,
        reject
      );
    });
  }

  createOrUpdateMap(texture) {
    const size = 10000;

    if (this.mapMesh) {
      this.mapMesh.material.map = texture;
      this.mapMesh.material.needsUpdate = true;
      return;
    }

    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });

    this.mapMesh = new THREE.Mesh(geometry, material);
    this.mapMesh.rotation.x = -Math.PI / 2;
    this.mapMesh.position.y = -0.01;
    this.scene.add(this.mapMesh);
  }

  setVisible(visible) {
    if (this.mapMesh) this.mapMesh.visible = visible;
  }
}

class SimpleModelViewer {
  constructor() {
    this.isNight = false;
    this.showOSM = false;
    this.basemapType = 'osm';
    this.model = null;
    this.initialized = false;

    this.init();
    this.setupEventListeners();
  }

  init() {
    this.scene = new THREE.Scene();
    this.basemapManager = new BasemapManager(this.scene);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 100, 200);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 1000;

    this.setupLighting();
    this.updateBackground();
    this.loadModel();
    this.initInteraction();
    this.animate();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLighting() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    this.directionalLight.position.set(100, 150, 50);
    this.directionalLight.castShadow = true;
    this.scene.add(this.directionalLight);

    this.hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x6b5d47, 0.5);
    this.scene.add(this.hemisphereLight);
  }

  updateLighting() {
    if (this.isNight) {
      this.ambientLight.intensity = 0.1;
      this.directionalLight.intensity = 0.3;
      this.directionalLight.position.set(-100, 80, -50);
      this.directionalLight.color.set(0x6495ED);
      this.hemisphereLight.skyColor.set(0x0a1929);
      this.hemisphereLight.groundColor.set(0x1a1a2e);
      this.hemisphereLight.intensity = 0.2;
    } else {
      this.ambientLight.intensity = 0.3;
      this.directionalLight.intensity = 1.5;
      this.directionalLight.position.set(100, 150, 50);
      this.directionalLight.color.set(0xffffff);
      this.hemisphereLight.skyColor.set(0x87CEEB);
      this.hemisphereLight.groundColor.set(0x6b5d47);
      this.hemisphereLight.intensity = 0.5;
    }
  }

  updateBackground() {
    const dayColor = new THREE.Color(0x87CEEB);
    const nightColor = new THREE.Color(0x0a1929);
    this.scene.background = this.isNight ? nightColor : dayColor;
  }

  async loadModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('model.glb');
      this.model = gltf.scene;
      this.scene.add(this.model);
      this.initializeModel();
      this.hideLoadingScreen();
    } catch (error) {
      console.error('Error loading model:', error);
      this.showError('Failed to load 3D model');
    }
  }

  initializeModel() {
    if (!this.model || this.initialized) return;

    const box = new THREE.Box3().setFromObject(this.model);
    const min = box.min;
    const yOffset = -min.y;
    this.model.position.y = yOffset;

    const newBox = new THREE.Box3().setFromObject(this.model);
    const center = newBox.getCenter(new THREE.Vector3());
    const size = newBox.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.2;

    this.camera.position.set(center.x + distance * 0.5, center.y + distance * 0.8, center.z + distance * 0.5);
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.update();

    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.initialized = true;
  }

  hideLoadingScreen() {
    document.getElementById('loading-overlay').classList.add('hidden');
  }

  showError(message) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.innerHTML = `
      <div style="color: #ff6b6b; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div class="loading-text">${message}</div>
      </div>`;
  }

  setupEventListeners() {
    document.getElementById('night-mode-toggle').addEventListener('change', (e) => {
      this.isNight = e.target.checked;
      this.updateBackground();
      this.updateLighting();
    });

    document.getElementById('basemap-toggle').addEventListener('change', async (e) => {
      this.showOSM = e.target.checked;
      if (this.showOSM) {
        await this.basemapManager.loadBasemap(this.basemapType);
        this.basemapManager.setVisible(true);
      } else {
        this.basemapManager.setVisible(false);
      }
    });

    document.getElementById('basemap-type').addEventListener('change', async (e) => {
      this.basemapType = e.target.value;
      if (this.showOSM) {
        await this.basemapManager.loadBasemap(this.basemapType);
      }
    });
  }

  initInteraction() {
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedObject = null;
    this.renderer.domElement.addEventListener('click', (event) => this.onClick(event));
  }

  onClick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      const object = intersects[0].object;
      this.showObjectInfo(object);
      this.highlightObject(object);
    }
  }

  showObjectInfo(object) {
    const panel = document.getElementById('info-panel');
    const nameEl = document.getElementById('object-name');
    const detailsEl = document.getElementById('object-details');

    nameEl.textContent = object.name || 'Unnamed Object';
    const data = object.userData;
    detailsEl.innerHTML = Object.keys(data).length
      ? Object.entries(data).map(([k, v]) => `<div><b>${k}</b>: ${v}</div>`).join('')
      : '<i>No attributes</i>';

    panel.style.display = 'block';
  }

  highlightObject(object) {
    if (this.selectedObject && this.selectedObject.material && this.selectedObject.material.emissive) {
      this.selectedObject.material.emissive.set(0x000000);
    }

    if (object.material && object.material.emissive) {
      object.material.emissive.set(0xffd700);
    }

    this.selectedObject = object;
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new SimpleModelViewer();
});
