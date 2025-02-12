import * as THREE from 'https://threejs.org/build/three.module.js';
import { GLTFLoader } from 'https://threejs.org/examples/jsm/loaders/GLTFLoader.js';

(() => {
  "use strict";

  // === 常數與全域變數 ===
  const gravity = -9.8;        // 重力加速度 (單位：單位/秒²)
  const dt = 0.016;            // 每幀更新時間 (假設 60 FPS)
  let simulationActive = false; // 模擬開關
  const coins = [];            // 存放三枚錢幣的物件

  // === Three.js 場景初始化 ===
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('container').appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);

  // === 建立地板 ===
  const floorGeometry = new THREE.PlaneGeometry(20, 20);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  // === 輔助函式：將角度正規化至 [0, 2π) 範圍 ===
  function normalizeAngle(angle) {
    angle = angle % (2 * Math.PI);
    return angle < 0 ? angle + 2 * Math.PI : angle;
  }

  // === 載入硬幣模型並建立三枚硬幣 ===
  const loader = new THREE.GLTFLoader();
  loader.load(
    './assets/coin.gltf',
    (gltf) => {
      const coinModel = gltf.scene;

      for (let i = 0; i < 3; i++) {
        const coin = coinModel.clone();
        coin.position.set((i - 1) * 1.5, 1, 0);
        coin.scale.set(1, 1, 1);

        // 將運動參數與結果存入 coin 的 userData 內
        coin.userData = {
          velocity: new THREE.Vector3(0, 0, 0),
          rotationSpeed: new THREE.Vector3(0, 0, 0),
          contactTime: 0,
          result: null
        };

        scene.add(coin);
        coins.push(coin);
      }
    },
    undefined,
    (error) => {
      console.error('模型載入錯誤:', error);
    }
  );

  // === 擲幣按鈕觸發事件 ===
  document.getElementById('throwButton').addEventListener('click', () => {
    coins.forEach((coin) => {
      coin.userData.velocity.set(
        (Math.random() - 0.5) * 2,
        5 + Math.random() * 2,
        (Math.random() - 0.5) * 2
      );
      coin.userData.rotationSpeed.set(
        2 + Math.random() * 3,
        2 + Math.random() * 3,
        2 + Math.random() * 3
      );
      coin.userData.contactTime = 0;
      coin.userData.result = null;
    });
    simulationActive = true;
  });

  // === 動畫循環 ===
  function animate() {
    requestAnimationFrame(animate);

    if (simulationActive) {
      coins.forEach((coin) => {
        const data = coin.userData;

        // 更新垂直方向速度與位置
        data.velocity.y += gravity * dt;
        coin.position.addScaledVector(data.velocity, dt);

        // 更新錢幣旋轉
        coin.rotation.x += data.rotationSpeed.x * dt;
        coin.rotation.y += data.rotationSpeed.y * dt;
        coin.rotation.z += data.rotationSpeed.z * dt;

        // 碰到地板 (此處假設錢幣底部高度為 0.5)
        if (coin.position.y <= 0.5) {
          coin.position.y = 0.5;

          if (Math.abs(data.velocity.y) < 0.1) {
            // 模擬靜止狀態下的摩擦效果
            data.contactTime += dt;
            data.velocity.x *= 0.98;
            data.velocity.z *= 0.98;

            // 若靜置超過 2 秒則認定結果確定
            if (data.contactTime >= 2) {
              data.velocity.set(0, 0, 0);
              data.rotationSpeed.set(0, 0, 0);
              determineCoinFace(coin);
            }
          } else {
            // 彈跳反彈
            data.velocity.y = -data.velocity.y * 0.6;
            data.contactTime = 0;
          }
        } else {
          data.contactTime = 0;
        }
      });
    }

    renderer.render(scene, camera);
  }
  animate();

  // === 判斷錢幣正反面結果 ===
  function determineCoinFace(coin) {
    const rotationX = normalizeAngle(coin.rotation.x);
    if (rotationX < Math.PI / 2 || rotationX > (3 * Math.PI) / 2) {
      coin.userData.result = '陽';
      console.log('正面（陽）');
    } else {
      coin.userData.result = '陰';
      console.log('反面（陰）');
    }
    checkFinalResult();
  }

  // === 確認三個硬幣的最終結果 ===
  function checkFinalResult() {
    const results = coins.map(coin => coin.userData.result);
    // 當所有錢幣結果都決定後
    if (results.every(result => result !== null)) {
      const yangCount = results.filter(r => r === '陽').length;
      const yinCount = results.filter(r => r === '陰').length;

      if (yangCount === 3) {
        console.log('老陽');
      } else if (yinCount === 3) {
        console.log('老陰');
      } else if (yangCount === 2 && yinCount === 1) {
        console.log('少陽');
      } else if (yinCount === 2 && yangCount === 1) {
        console.log('少陰');
      }
      // 當結果確定後，停止模擬
      simulationActive = false;
    }
  }

  // === 視窗尺寸調整 ===
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
})();