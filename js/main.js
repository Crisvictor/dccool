// js/main.js
let hexagramData = null;

function loadHexagramData() {
  return fetch("/hexagrams.json")
    .then(response => response.json())
    .then(data => {
      hexagramData = data;
      console.log("卦象資料載入成功");
    })
    .catch(error => {
      console.error("載入卦象資料失敗:", error);
    });
}

document.addEventListener("DOMContentLoaded", () => {
  loadHexagramData();
});
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
const coinThickness = 0.05;

// ==============================
// 1. Three.js 場景初始化
// ==============================
scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 6);
camera.lookAt(0, 0, 0);

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("container").appendChild(renderer.domElement);

// 燈光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);
//聚光燈
const spotLight = new THREE.SpotLight(0xffffff, 1);
spotLight.position.set(0, 20, -9);
spotLight.angle = Math.PI / 8;       // 聚光燈的光束角度
spotLight.penumbra = 0.8;            // 邊緣柔和程度 (0~1，越高越柔和)
spotLight.decay = 1;                 // 光線衰減
spotLight.distance = 50;             // 有效距離
// 陰影 
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
spotLight.shadow.camera.near = 5;
spotLight.shadow.camera.far = 50;

scene.add(spotLight);

// 建立地板（Three.js）
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x5c0b0b });
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
  color: 0xbdb76b,
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
const coinGeometry = new THREE.CylinderGeometry(coinRadius, coinRadius, coinThickness, 32);
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
    
    const coinBody = new CANNON.Body({ mass: 5 });
    const coinShape = new CANNON.Cylinder(coinRadius, coinRadius, coinThickness, 32);
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
  if (hexagram.length === 6) return;
  if (tossInProgress) return;
  tossInProgress = true;
  restTimer = 0;
  tossStartTime = performance.now(); 
  const throwButton = document.getElementById("throwButton");
  throwButton.disabled = true;
  throwButton.style.opacity = 0.5;
  throwButton.style.cursor = "default";

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
  document.getElementById("explanationUI").style.display = "none";
  document.getElementById("coinResultsContainer").style.display = "block";
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
    if (currentTime - tossStartTime >= 1000 && !moveButtonCreated) {
      createMoveGroundButton();
    }
  }
  
  if (!allAtRest) {
    removeMoveButton();
  }
}

let globalBaseHexagram = "";

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
    lineResult = { 
      type: "老陽", 
      symbol: "<img src='img/oYang.png' alt='老陽' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
      isChanging: true 
    };
  } else if (headsCount === 1) {
    lineResult = { 
      type: "少陽", 
      symbol: "<img src='img/sYang.png' alt='少陽' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
      isChanging: false 
    };
  } else if (headsCount === 2) {
    lineResult = { 
      type: "少陰", 
      symbol: "<img src='img/sYin.png' alt='少陰' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
      isChanging: false 
    };
  } else if (headsCount === 0) {
    lineResult = { 
      type: "老陰", 
      symbol: "<img src='img/oYin.png' alt='老陰' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
      isChanging: true 
    };
  }
  hexagram.push(lineResult);
  updateHexagramDisplay();
  
  if (hexagram.length === 6) {
    let baseHexagram = "";
    for (let i = 0; i < 6; i++) {
      baseHexagram = (hexagram[i].type.indexOf("陽") > -1 ? "1" : "0") + baseHexagram;
    }
    globalBaseHexagram = baseHexagram;
    console.log("baseHexagram:", baseHexagram);
    getHexagramInterpretation(baseHexagram);
    document.getElementById("coinResultsContainer").style.display = "none";
    document.getElementById("explanationUI").style.display = "block";
    
    let transformedArray = hexagram.map(line => {
      if (line.isChanging) {
        if (line.type.indexOf("陽") > -1) {
          return { 
            type: "少陰", 
            symbol: "<img src='img/sYin.png' alt='少陰' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
            isChanging: false 
          };
        } else {
          return { 
            type: "少陽", 
            symbol: "<img src='img/sYang.png' alt='少陽' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
            isChanging: false 
          };
        }
      }
      return line;
    });
    let transformedHexagramKey = "";
    for (let i = 0; i < 6; i++) {
      transformedHexagramKey = (transformedArray[i].type.indexOf("陽") > -1 ? "1" : "0") + transformedHexagramKey;
    }
    console.log("transformedHexagramKey:", transformedHexagramKey);
    
    if (transformedHexagramKey === globalBaseHexagram) {
      document.getElementById("transformedInterpretation").innerText = "本卦無變卦";
      document.getElementById("transformedExplanationList").style.display = "none";
      document.getElementById("transformedExplanationDetail").style.display = "none";
    } else {
      if (hexagramData && hexagramData[transformedHexagramKey]) {
        const transformedInfo = hexagramData[transformedHexagramKey];
        document.getElementById("transformedInterpretation").innerHTML =
          "變卦 —— " + transformedInfo.name + " (" + transformedInfo.pinyin + ")<br>" +
          "<span style='color:rgba(255,229,158,0.95); font-weight: normal;'>" + transformedInfo.summary + "</span><br><br>" +
          "<span style='color:rgb(255,202,158); font-weight: normal;'>" + transformedInfo.detailed + "</span><br>";
        initTransformedExplanationUI(transformedInfo);
      } else {
        document.getElementById("transformedInterpretation").innerText = "找不到對應的變卦資料";
        document.getElementById("transformedExplanationList").style.display = "none";
        document.getElementById("transformedExplanationDetail").style.display = "none";
      }
    }
  } else {
    const throwButton = document.getElementById("throwButton");
    throwButton.disabled = false;
    throwButton.style.opacity = 1;
    throwButton.style.cursor = "pointer";
  }
}

function updateHexagramDisplay() {
  const positions = ["初", "二", "三", "四", "五", "上"];
  let hexagramText = "";
  
  for (let i = hexagram.length - 1; i >= 0; i--) {
    const line = hexagram[i];
    const isYang = line.type.indexOf("陽") > -1;
    const yinYangText = isYang ? "九" : "六";
    
    let displayText = "";
    if (i === 0 || i === hexagram.length - 1) {
      displayText = positions[i] + yinYangText;
    } else {
      displayText = yinYangText + positions[i];
    }
    
    hexagramText += `${positions[i]}爻： ${displayText} ${line.type} ${line.symbol}<br>`;
  }
  
  document.getElementById("hexagramResult").innerHTML = hexagramText;
  
  if (hexagram.length === 6) {
    const throwButton = document.getElementById("throwButton");
    throwButton.disabled = true;
    throwButton.style.opacity = 0.5;
    throwButton.style.cursor = "default";
    
    let transformedArray = hexagram.map(line => {
      if (line.isChanging) {
        if (line.type.indexOf("陽") > -1) { 
          return { 
            type: "少陰", 
            symbol: "<img src='img/sYin.png' alt='少陰' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
            isChanging: false 
          };
        } else {
          return { 
            type: "少陽", 
            symbol: "<img src='img/sYang.png' alt='少陽' style='width:70px;height:10px; float:right; margin-left:10px;' />", 
            isChanging: false 
          };
        }
      }
      return line;
    });
    
    let transformedText = "";
    for (let i = transformedArray.length - 1; i >= 0; i--) {
      const line = transformedArray[i];
      const isYang = line.type.indexOf("陽") > -1;
      const yinYangText = isYang ? "九" : "六";
      let displayText = "";
      if (i === 0 || i === transformedArray.length - 1) {
        displayText = positions[i] + yinYangText;
      } else {
        displayText = yinYangText + positions[i];
      }
      transformedText += `${positions[i]}爻： ${displayText} ${line.type} ${line.symbol}<br>`;
    }
    let changedCount = hexagram.filter(line => line.isChanging).length;
    let extraText = "";
    if (changedCount < 2) {
      document.getElementById("transformedHexagram").style.display = "none";
    } else if (changedCount === 2) {
      extraText = "以本卦的兩個變爻解卦，上爻為主。";
    } else if (changedCount === 3) {
      extraText = "以兩卦卦義解卦，變卦為主。";
    } else if (changedCount === 4) {
      extraText = "以變卦未變的兩爻解卦，下爻為主。";
    } else if (changedCount === 5) {
      extraText = "以變卦未變的一爻解卦。";
    } else if (changedCount === 6) {
      extraText = "乾卦為『用九』，坤卦為『用六』。餘卦六二卦以變卦卦義解卦。";
    }
    if (changedCount >= 2) {
      document.getElementById("transformedHexagram").style.display = "block";
      document.getElementById("transformedHexagram").innerHTML = transformedText +
        `<br><strong>變卦相應凶吉:</strong><br>${extraText}`;
    }
    
    // 凶吉判定：
    function pairResult(indexA, indexB) {
      const isYangA = hexagram[indexA].type.indexOf("陽") > -1;
      const isYangB = hexagram[indexB].type.indexOf("陽") > -1;
      return (isYangA !== isYangB) ? "吉" : "凶";
    }
    const pair1 = pairResult(5, 2);
    const pair2 = pairResult(4, 1);
    const pair3 = pairResult(3, 0);
    const pairSummary = `<span style='color:rgba(255,229,158,0.95);'><br>上爻：${pair1}<br>中爻：${pair2}<br>下爻：${pair3}</span>`;
    function pairResultTransformed(indexA, indexB) {
      const isYangA = transformedArray[indexA].type.indexOf("陽") > -1;
      const isYangB = transformedArray[indexB].type.indexOf("陽") > -1;
      return (isYangA !== isYangB) ? "吉" : "凶";
    }
    
    document.getElementById("transformedHexagram").innerHTML = transformedText;
    function pairResultTransformed(indexA, indexB) {
      const isYangA = transformedArray[indexA].type.indexOf("陽") > -1;
      const isYangB = transformedArray[indexB].type.indexOf("陽") > -1;
      return (isYangA !== isYangB) ? "吉" : "凶";
    }
    const tPair1 = pairResultTransformed(5, 2);
    const tPair2 = pairResultTransformed(4, 1);
    const tPair3 = pairResultTransformed(3, 0);
  
    function getPairDescription(pairName, result) {
      return pairName + result;
    }
    const tPairSummary = "<br><span style='color:rgba(255,229,158,0.95);'>" + getPairDescription("上爻：", tPair1) + "<br>" +
                          getPairDescription("中爻：", tPair2) + "<br>" +
                          getPairDescription("下爻：", tPair3) + "</span>" ;
    
    document.getElementById("hexagramResult").innerHTML += `<br><strong>本卦相應凶吉——</strong> ${pairSummary}`;
    document.getElementById("transformedHexagram").innerHTML += `<br><strong>變卦相應凶吉——</strong> ${tPairSummary}`;
  }
}

function interpretHexagram(baseHexagram) {
  if (!hexagramData) {
    console.error("卦象資料尚未載入");
    return "暫無解說資料";
  }
  const info = hexagramData[baseHexagram];
  if (info) {
    return info.name + " (" + info.pinyin + "): " + info.interpretation;
  } else {
    return "找不到對應的卦象資料";
  }
}

function getHexagramInterpretation(baseHexagram) {
  fetch("/hexagrams.json")
    .then(response => response.json())
    .then(data => {
      const hexagramInfo = data[baseHexagram];
      if (hexagramInfo) {
        document.getElementById("interpretation").innerHTML =
          "本卦 —— " + hexagramInfo.name + " (" + hexagramInfo.pinyin + ")<br>" +
          "<span style='color:rgba(255, 229, 158, 0.95); font-weight: normal;'>" + hexagramInfo.summary + "</span><br><br>" +
          "<span style='color:rgb(255, 202, 158); font-weight: normal;'>" + hexagramInfo.detailed + "</span><br>";
          initExplanationUI(hexagramInfo);
      } else {
        console.error("找不到對應的卦象資料");
      }
    })
    .catch(error => {
      console.error("載入卦象資料失敗:", error);
    });
}

function initExplanationUI(hexagramInfo) {
  const explanationList = document.getElementById("explanationList");
  explanationList.innerHTML = "";
  const title = document.createElement("div");
  title.innerText = "卜問解卦:";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "16px";
  explanationList.appendChild(title);

  const aspects = hexagramInfo.explanations;
  for (let aspect in aspects) {
    const btn = document.createElement("button");
    btn.innerText = aspect;
    btn.style.margin = "5px";
    btn.addEventListener("click", () => {
      showExplanation(aspect, aspects[aspect]);
    });
    explanationList.appendChild(btn);
  }
}

function showExplanation(aspect, text) {
  const explanationList = document.getElementById("explanationList");
  explanationList.style.display = "none";

  const detailDiv = document.getElementById("explanationDetail");
  detailDiv.innerHTML = ""; 
  detailDiv.style.display = "block";

  const title = document.createElement("h3");
  title.innerText = aspect;
  detailDiv.appendChild(title);

  const p = document.createElement("p");
  p.innerText = text;
  detailDiv.appendChild(p);

  const backBtn = document.createElement("button");
  backBtn.innerText = "返回";
  backBtn.addEventListener("click", () => {
    detailDiv.style.display = "none";
    explanationList.style.display = "block";
  });
  detailDiv.appendChild(backBtn);
}

function initTransformedExplanationUI(hexagramInfo) {
  const listDiv = document.getElementById("transformedExplanationList");
  listDiv.innerHTML = "";
  
  const title = document.createElement("div");
  title.innerText = "變卦解卦:";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "10px";
  listDiv.appendChild(title);
  
  const aspects = hexagramInfo.explanations;
  for (let aspect in aspects) {
    const btn = document.createElement("button");
    btn.innerText = aspect;
    btn.style.margin = "5px";
    btn.addEventListener("click", () => {
      showTransformedExplanation(aspect, aspects[aspect]);
    });
    listDiv.appendChild(btn);
  }
  listDiv.style.display = "block";
}

function showTransformedExplanation(aspect, text) {
  const listDiv = document.getElementById("transformedExplanationList");
  listDiv.style.display = "none";

  const detailDiv = document.getElementById("transformedExplanationDetail");
  detailDiv.innerHTML = "";
  detailDiv.style.display = "block";
  
  const title = document.createElement("h3");
  title.innerText = aspect;
  detailDiv.appendChild(title);
  
  const p = document.createElement("p");
  p.innerText = text;
  detailDiv.appendChild(p);
  
  const backBtn = document.createElement("button");
  backBtn.innerText = "返回";
  backBtn.addEventListener("click", () => {
    detailDiv.style.display = "none";
    listDiv.style.display = "block";
  });
  detailDiv.appendChild(backBtn);
}

let moveButtonCreated = false;

function createMoveGroundButton() {
  if (moveButtonCreated) return;
  const button = document.createElement("button");
  button.id = "moveGroundButton";
  button.innerText = "乾坤挪移";
  button.style.marginLeft = "10px";
  button.style.opacity = 1;
  button.style.cursor = "pointer";
  button.addEventListener("click", shakeGround);
  document.getElementById("controls").appendChild(button);
  moveButtonCreated = true;
}

function removeMoveButton() {
  const button = document.getElementById("moveGroundButton");
  if (button) {
    button.parentElement.removeChild(button);
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
