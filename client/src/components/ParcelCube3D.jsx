import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import dogModelUrl from '../assets/Dog.glb?url';

// Интерактивный 3D-куб габаритов товара с моделью внутри.
// Реагирует на длину/ширину/высоту (см), вращается мышью + медленное авто-вращение.
export default function ParcelCube3D({ lengthCm, widthCm, heightCm, language = 'ru' }) {
  const mountRef = useRef(null);
  const apiRef = useRef(null); // { update(L, W, H) }

  // --- инициализация сцены (один раз) ---
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let width = mount.clientWidth || 320;
    const height = 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 5000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    mount.appendChild(labelRenderer.domElement);

    // освещение
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(3, 5, 4);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xaac4ff, 0.5);
    dir2.position.set(-4, 2, -3);
    scene.add(dir2);

    // управление мышью
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.rotateSpeed = 0.7;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.18; // очень медленно
    controls.minDistance = 5;
    controls.maxDistance = 4000;

    const group = new THREE.Group();
    scene.add(group);

    // материалы куба и выносок
    const boxMat = new THREE.MeshBasicMaterial({
      color: 0x6c8cff, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5b73e8 });
    const COLORS = { len: 0x5b73e8, wid: 0x10b981, hgt: 0xf59e0b };
    // основная размерная линия (насыщенная)
    const dimMat = {
      len: new THREE.LineBasicMaterial({ color: COLORS.len }),
      wid: new THREE.LineBasicMaterial({ color: COLORS.wid }),
      hgt: new THREE.LineBasicMaterial({ color: COLORS.hgt }),
    };
    // наконечники-стрелки
    const arrowMat = {
      len: new THREE.MeshBasicMaterial({ color: COLORS.len }),
      wid: new THREE.MeshBasicMaterial({ color: COLORS.wid }),
      hgt: new THREE.MeshBasicMaterial({ color: COLORS.hgt }),
    };
    // выносные (штрихпунктирные) линии — прозрачные
    const mkExt = (c) => new THREE.LineDashedMaterial({
      color: c, transparent: true, opacity: 0.32, dashSize: 1.1, gapSize: 0.7,
    });
    const extMat = { len: mkExt(COLORS.len), wid: mkExt(COLORS.wid), hgt: mkExt(COLORS.hgt) };

    let boxEdges = null, boxFill = null;
    let dimLines = new THREE.Group();
    group.add(dimLines);

    const unit = language === 'uz' ? 'sm' : 'см';
    const makeLabel = (cls) => {
      const el = document.createElement('div');
      el.className = 'parcel-cube-label ' + cls;
      return new CSS2DObject(el);
    };
    const labels = { len: makeLabel('len'), wid: makeLabel('wid'), hgt: makeLabel('hgt') };
    Object.values(labels).forEach((l) => group.add(l));

    // модель
    let model = null;
    const modelSize = new THREE.Vector3(1, 1, 1);
    const modelCenter = new THREE.Vector3();
    let pending = null; // последние габариты до загрузки модели

    const loader = new GLTFLoader();
    loader.load(
      dogModelUrl,
      (gltf) => {
        const root = gltf.scene;
        const bbox = new THREE.Box3().setFromObject(root);
        bbox.getSize(modelSize);
        bbox.getCenter(modelCenter);
        root.position.sub(modelCenter); // pivot в центр
        const holder = new THREE.Group();
        holder.add(root);
        model = holder;
        group.add(model);
        if (pending) fitModel(pending.L, pending.W, pending.H);
      },
      undefined,
      (err) => console.error('Не удалось загрузить 3D-модель:', err)
    );

    function lineSeg(a, b, mat) {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      return new THREE.LineSegments(g, mat);
    }

    // штрихпунктирная выносная линия
    function dashLine(a, b, mat) {
      const g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const line = new THREE.Line(g, mat);
      line.computeLineDistances();
      return line;
    }

    // маленькая аккуратная стрелка-наконечник: вершина в точке tip, смотрит вдоль dir
    function arrow(tip, dir, mat, size) {
      const d = dir.clone().normalize();
      const geo = new THREE.ConeGeometry(size * 0.4, size, 14);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      mesh.position.copy(tip).addScaledVector(d, -size / 2); // вершина конуса = tip
      return mesh;
    }

    function rebuildBox(L, W, H) {
      if (boxEdges) { group.remove(boxEdges); boxEdges.geometry.dispose(); }
      if (boxFill) { group.remove(boxFill); boxFill.geometry.dispose(); }
      const geo = new THREE.BoxGeometry(L, H, W); // x=длина, y=высота, z=ширина
      boxFill = new THREE.Mesh(geo, boxMat);
      boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
      group.add(boxFill);
      group.add(boxEdges);
    }

    function rebuildDims(L, W, H, Lcm, Wcm, Hcm) {
      group.remove(dimLines);
      dimLines.traverse((o) => o.geometry && o.geometry.dispose());
      dimLines = new THREE.Group();
      group.add(dimLines);

      const gap = Math.max(L, W, H) * 0.16 + 4;
      const aSize = Math.max(L, W, H) * 0.045 + 1.3; // размер стрелок
      const x = L / 2, y = H / 2, z = W / 2;
      const V = THREE.Vector3;

      // одна размерная аннотация: выносные линии до концов + размерная линия со стрелками + подпись
      const addDim = (edgeA, edgeB, off, key, text) => {
        const dimA = edgeA.clone().add(off);
        const dimB = edgeB.clone().add(off);
        // штрихпунктирные выносные линии (прозрачные) — «опускают» от ребра к концам
        dimLines.add(dashLine(edgeA, dimA, extMat[key]));
        dimLines.add(dashLine(edgeB, dimB, extMat[key]));
        // основная размерная линия
        dimLines.add(lineSeg(dimA, dimB, dimMat[key]));
        // стрелки на обоих концах, смотрят наружу
        const dir = dimB.clone().sub(dimA).normalize();
        dimLines.add(arrow(dimA, dir.clone().negate(), arrowMat[key], aSize));
        dimLines.add(arrow(dimB, dir, arrowMat[key], aSize));
        // подпись по центру
        labels[key].position.copy(dimA.clone().add(dimB).multiplyScalar(0.5));
        labels[key].element.textContent = `${text} ${unit}`;
      };

      // Длина (X): переднее нижнее ребро, опускаем вниз
      addDim(new V(-x, -y, z), new V(x, -y, z), new V(0, -gap, 0), 'len', Lcm);
      // Ширина (Z): правое нижнее ребро (вглубь), опускаем вниз
      addDim(new V(x, -y, -z), new V(x, -y, z), new V(0, -gap, 0), 'wid', Wcm);
      // Высота (Y): переднее правое ребро, отводим вправо
      addDim(new V(x, -y, z), new V(x, y, z), new V(gap, 0, 0), 'hgt', Hcm);
    }

    function fitModel(L, W, H) {
      if (!model) { pending = { L, W, H }; return; }
      const s = Math.min(
        (L * 0.85) / modelSize.x,
        (H * 0.85) / modelSize.y,
        (W * 0.85) / modelSize.z
      );
      model.scale.setScalar(s);
      model.position.set(0, -H / 2 + (modelSize.y * s) / 2, 0);
    }

    let camInit = false;
    function placeCamera(L, W, H) {
      const maxDim = Math.max(L, W, H);
      const d = maxDim * 2.4 + 8;
      if (!camInit) {
        camera.position.set(d * 0.55, d * 0.45, d * 0.8);
        camInit = true;
      } else {
        const dirv = camera.position.clone().sub(controls.target).normalize();
        camera.position.copy(controls.target).add(dirv.multiplyScalar(d));
      }
      camera.near = 0.1;
      camera.far = d * 10;
      camera.updateProjectionMatrix();
      controls.update();
    }

    function num(v, def) {
      const n = parseFloat(v);
      return isFinite(n) && n > 0 ? n : def;
    }

    // публичный апдейт по габаритам
    apiRef.current = {
      update(rawL, rawW, rawH) {
        const Lcm = num(rawL, 20), Wcm = num(rawW, 15), Hcm = num(rawH, 10);
        rebuildBox(Lcm, Wcm, Hcm);
        rebuildDims(Lcm, Wcm, Hcm, Lcm, Wcm, Hcm);
        fitModel(Lcm, Wcm, Hcm);
        placeCamera(Lcm, Wcm, Hcm);
      },
    };

    // первичная отрисовка
    apiRef.current.update(20, 15, 10);

    // анимация
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();

    // ресайз
    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth || width;
      if (w === width) return;
      width = w;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
    });
    ro.observe(mount);

    renderer.domElement.addEventListener('pointerdown', () => { renderer.domElement.style.cursor = 'grabbing'; });
    window.addEventListener('pointerup', () => { renderer.domElement.style.cursor = 'grab'; });

    // очистка
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
      if (renderer.domElement.parentNode) mount.removeChild(renderer.domElement);
      if (labelRenderer.domElement.parentNode) mount.removeChild(labelRenderer.domElement);
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // обновление при изменении габаритов
  useEffect(() => {
    apiRef.current?.update(lengthCm, widthCm, heightCm);
  }, [lengthCm, widthCm, heightCm]);

  return <div ref={mountRef} className="parcel-cube-3d" />;
}
