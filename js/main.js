// js/main.js

// ==============================
// 全域變數定義
// ==============================
let scene, camera, renderer;
let world;
let coins = [];     
let coinBodies = [];  
let tossInProgress = false;
let restTimer = 0;
const restThreshold = 1.3;
const timeStep = 1 / 60; 
const hexagram = []; 

// 硬幣參數
const coinRadius = 0.5;
const coinThickness = 0.08;

// ==============================
// 1. Three.js 場景初始化
// ==============================
scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("container").appendChild(renderer.domElement);

// 燈光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// 建立地板（Three.js）
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x430f0f });
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

// ==============================
// 2. Cannon.js 物理世界初始化
// ==============================
world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// ==============================
// 3. 貼圖與硬幣材質 (多材質)
// ==============================
const textureLoader = new THREE.TextureLoader();
const headsTexture = textureLoader.load(
  "/assets/textures/heads.png",
  function () {
    console.log("heads.png 載入成功");
  },
  undefined,
  function (error) {
    console.error("heads.png 載入錯誤", error);
  }
);

const tailsTexture = textureLoader.load(
  "/assets/textures/tails.png",
  function () {
    console.log("tails.png 載入成功");
  },
  undefined,
  function (error) {
    console.error("tails.png 載入錯誤", error);
  }
);

// 側面材質 (金屬質感)
const edgeMaterial = new THREE.MeshStandardMaterial({
  color: 0xffd700,
  metalness: 0.8,
  roughness: 0.3,
});

// 正面與反面材質
const headsMaterial = new THREE.MeshStandardMaterial({
  map: headsTexture,
  color: 0xffffff, 
  metalness: 0.5,
  roughness: 0.4,
});
const tailsMaterial = new THREE.MeshStandardMaterial({
  map: tailsTexture,
  color: 0xffffff,
  metalness: 0.5,
  roughness: 0.4,
});

// CylinderGeometry 預設群組順序：0-側面、1-上面、2-下面
const coinMaterials = [edgeMaterial, headsMaterial, tailsMaterial];

// ==============================
// 4. 建立硬幣模型與物理剛體
// ==============================
const coinGeometry = new THREE.CylinderGeometry(coinRadius, coinRadius, coinThickness, 64);
coinGeometry.translate(coinThickness / 2 ,0 , 0); 

function createCoins() {
  coins.forEach(coin => scene.remove(coin));
  coinBodies.forEach(body => world.remove(body));
  coins = [];
  coinBodies = [];
  
  for (let i = 0; i < 3; i++) {
    const coinMesh = new THREE.Mesh(coinGeometry, coinMaterials);
    coinMesh.position.set((i - 1) * 1.2, 2, 0);
    scene.add(coinMesh);
    coins.push(coinMesh);
    
    const coinBody = new CANNON.Body({ mass: 1 });
    const coinShape = new CANNON.Cylinder(coinRadius, coinRadius, coinThickness, 64);
    const shapeOffset = new CANNON.Vec3(0, 0, 0);
    const shapeOrientation = new CANNON.Quaternion();
    shapeOrientation.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    coinBody.addShape(coinShape, shapeOffset, shapeOrientation);
    
    coinBody.position.set(coinMesh.position.x, coinMesh.position.y, coinMesh.position.z);
    coinBody.quaternion.setFromEuler(
      (Math.random() - 0.5) * Math.PI,
      (Math.random() - 0.5) * Math.PI,
      (Math.random() - 0.5) * Math.PI
    );
    
    // 物理屬性
    coinBody.material = new CANNON.Material();
    coinBody.material.restitution = 0.8; // 反彈
    coinBody.material.friction = 0.4;    // 摩擦
    coinBody.linearDamping = 0.1;        // 線性阻力
    coinBody.angularDamping = 0.1;       // 角阻力
    
    world.addBody(coinBody);
    coinBodies.push(coinBody);

    coinMesh.userData.physicsBody = coinBody;
  }
}
createCoins();

// ==============================
// 5. 擲幣操作與結果判斷
// ==============================
let tossStartTime = 0;
function tossCoins() {
  if (tossInProgress) return;
  tossInProgress = true;
  restTimer = 0;
  tossStartTime = performance.now(); 
  coinBodies.forEach(body => {
    body.velocity.set(
      (Math.random() - 0.5) * 10, //X
      10 + Math.random() * 2,     //y
      (Math.random() - 0.5) * 3  //z
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * Math.PI * 3,
      (Math.random() - 0.5) * Math.PI * 3,
      (Math.random() - 0.5) * Math.PI * 3
    );
  });
}

function resetToss() {
  tossInProgress = false;
  restTimer = 0;
  createCoins();
  document.getElementById("coinResults").innerText = "等待擲幣...";
  document.getElementById("hexagramResult").innerText = "等待累積六爻...";
  document.getElementById("transformedHexagram").innerText = "";
  const throwButton = document.getElementById("throwButton");
  throwButton.disabled = false;
  throwButton.style.opacity = 1;
  throwButton.style.cursor = "pointer";
  hexagram.length = 0;
  removeMoveButton();
}

function isCoinAtRest(body) {
  return body.velocity.length() < 0.1 && body.angularVelocity.length() < 0.1;
}

function isHeads(coin) {
  const localUp = new THREE.Vector3(0, 1, 0);
  localUp.applyQuaternion(coin.quaternion);
  return localUp.y > 0.5;
}

function checkTossResult(delta) {
  if (!tossInProgress) return;
  
  let allAtRest = true;
  coinBodies.forEach(body => {
    if (!isCoinAtRest(body)) {
      allAtRest = false;
    }
  });
  
  if (allAtRest) {
    restTimer += delta;
    if (restTimer >= restThreshold) {
      triggerResult();
      tossInProgress = false;
      restTimer = 0;
    }
  } else {
    const currentTime = performance.now();
    if (currentTime - tossStartTime >= 5000 && !moveButtonCreated) {
      createMoveGroundButton();
    }
  }
  
  if (!allAtRest) {
    removeMoveButton();
  }
}

function triggerResult() {
  let headsCount = 0;
  let resultText = "";
  coins.forEach((coin, i) => {
    const result = isHeads(coin) ? "正面" : "反面";
    if (isHeads(coin)) headsCount++;
    resultText += `硬幣 ${i + 1}: ${result}\n`;
  });
  resultText += `正面數量: ${headsCount}\n`;
  document.getElementById("coinResults").innerText = resultText;
  
  let lineResult;
  if (headsCount === 3) {
    lineResult = { type: "老陽", symbol: "⚊", isChanging: true };
  } else if (headsCount === 2) {
    lineResult = { type: "少陽", symbol: "⚊", isChanging: false };
  } else if (headsCount === 1) {
    lineResult = { type: "少陰", symbol: "⚋", isChanging: false };
  } else if (headsCount === 0) {
    lineResult = { type: "老陰", symbol: "⚋", isChanging: true };
  }
  
  hexagram.push(lineResult);
  updateHexagramDisplay();
}

function updateHexagramDisplay() {
  let hexagramText = "";
  for (let i = 0; i < hexagram.length; i++) {
    const line = hexagram[i];
    hexagramText += `第${i + 1}爻: ${line.type} ${line.symbol}\n`;
  }
  document.getElementById("hexagramResult").innerText = hexagramText;
  
  if (hexagram.length === 6) {
    const throwButton = document.getElementById("throwButton");
    throwButton.disabled = true;
    throwButton.style.opacity = 0.5;  // 使按鍵淡化
    throwButton.style.cursor = "default";

    let transformedText = "";
    const transformed = hexagram.map(line => {
      if (line.isChanging) {
        return line.symbol === "⚊"
          ? { type: "少陰", symbol: "⚋", isChanging: false }
          : { type: "少陽", symbol: "⚊", isChanging: false };
      }
      return line;
    });
    for (let i = 0; i < transformed.length; i++) {
      transformedText += `第${i + 1}爻: ${transformed[i].type} ${transformed[i].symbol}\n`;
    }
    document.getElementById("transformedHexagram").innerText = transformedText;
  }
}

let moveButtonCreated = false;

function createMoveGroundButton() {
  if (moveButtonCreated) return;
  const button = document.createElement("button");
  button.id = "moveGroundButton";
  button.innerText = "乾坤挪移";
  button.style.position = "absolute";
  button.style.bottom = "20px";
  button.style.left = "150px";
  button.style.opacity = 1;
  button.style.cursor = "pointer";
  button.addEventListener("click", shakeGround);
  document.body.appendChild(button);
  moveButtonCreated = true;
}

function removeMoveButton() {
  const button = document.getElementById("moveGroundButton");
  if (button) {
    document.body.removeChild(button);
  }
  moveButtonCreated = false;
}

function shakeGround() {
  const offsetX = (Math.random() - 0.5) * 0.4; // -0.2 ~ 0.2
  const offsetZ = (Math.random() - 0.5) * 0.4;
  
  groundMesh.position.x += offsetX;
  groundMesh.position.z += offsetZ;

  groundBody.position.x += offsetX;
  groundBody.position.z += offsetZ;

  setTimeout(() => {
    groundMesh.position.x -= offsetX;
    groundMesh.position.z -= offsetZ;
    groundBody.position.x -= offsetX;
    groundBody.position.z -= offsetZ;
    restTimer = 0;
    removeMoveButton();
  }, 500);
}

// ==============================
// 6. 動畫循環與物理步進
// ==============================
let lastTime;
function animate(time) {
  requestAnimationFrame(animate);
  
  if (!lastTime) lastTime = time;
  const delta = (time - lastTime) / 1000;
  lastTime = time;
  
  world.step(timeStep, delta);
  
  coins.forEach((coin, i) => {
    const body = coinBodies[i];
    coin.position.copy(body.position);
    coin.quaternion.copy(body.quaternion);
  });
  
  if (tossInProgress) {
    checkTossResult(delta);
  }
  
  renderer.render(scene, camera);
}
animate();

// ==============================
// 7. 事件監聽：按鈕操作與視窗調整
// ==============================
document.getElementById("throwButton").addEventListener("click", tossCoins);
document.getElementById("resetButton").addEventListener("click", resetToss);
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
