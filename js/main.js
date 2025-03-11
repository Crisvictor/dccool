// js/main.js
let hexagramData = null;

function loadHexagramData() {
  return fetch("hexagrams.json")
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
let globalBaseHexagram = "";
let globalHexagramInfo = null;
let globalTransformedInfo = null;
let lastCollisionTime = 0;
const collisionDebounceInterval = 50;  // 50 毫秒內不重複播放
const impactThreshold = 0.3;              // 撞擊音效衝擊速度閾值
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

renderer = new THREE.WebGLRenderer({ antialias: true }); // 消除鋸齒
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById("container").appendChild(renderer.domElement);

// 燈光 - 使用聚光燈
const spotLight = new THREE.SpotLight(0xffffff, 1.65);
spotLight.position.set(0, 20, -9);
spotLight.angle = Math.PI / 8;       // 聚光燈光束角度
spotLight.penumbra = 0.8;            // 邊緣柔和程度
spotLight.decay = 1;                 // 衰減
spotLight.distance = 50;             // 有效距離
spotLight.castShadow = true;
spotLight.shadow.mapSize.width = 1024;
spotLight.shadow.mapSize.height = 1024;
spotLight.shadow.camera.near = 5;
spotLight.shadow.camera.far = 40;
scene.add(spotLight);

// ------------------------------
// 地面 (Three.js)
// ------------------------------
const textureLoader = new THREE.TextureLoader();
const texture = textureLoader.load('img/Tebo1.png');
texture.wrapS = THREE.ClampToEdgeWrapping;
texture.wrapT = THREE.ClampToEdgeWrapping;
texture.repeat.set(1.8, 1.8);
texture.offset.set(-0.4, -0.4);

const groundMeshMaterial = new THREE.MeshStandardMaterial({
  color: 0x5c0b0b,
  map: texture,
  transparent: false,
  premultipliedAlpha: false,
});
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMesh = new THREE.Mesh(groundGeometry, groundMeshMaterial);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);

// ==============================
// 2. Cannon.js 物理世界初始化
// ==============================
world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// 建立 Cannon.js 地面材質（物理用）
let groundPhysMaterial = new CANNON.Material("groundPhysMaterial");

// 建立地面物理形狀與剛體
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0, material: groundPhysMaterial });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// ==============================
// 3. 貼圖與硬幣材質 (多材質)
// ==============================
// 載入銅錢正反面貼圖
const headsTexture = textureLoader.load(
  "assets/textures/heads.png",
  function () {
    console.log("正圖像載入成功");
  },
  undefined,
  function (error) {
    console.error("正圖像載入錯誤", error);
  }
);

const tailsTexture = textureLoader.load(
  "assets/textures/tails.png",
  function () {
    console.log("背圖像載入成功");
  },
  undefined,
  function (error) {
    console.error("背圖像載入成功", error);
  }
);

// 側面材質 (金屬質感)
const edgeMaterial = new THREE.MeshStandardMaterial({
  color: 0xb5b073,
  metalness: 0.4,
  roughness: 0.5,
});

// 正面與反面材質
const headsMaterial = new THREE.MeshStandardMaterial({
  map: headsTexture,
  transparent: true,
  alphaTest: 0.5,
  color: 0xffffff,
  metalness: 0.5,
  roughness: 0.4,
});
const tailsMaterial = new THREE.MeshStandardMaterial({
  map: tailsTexture,
  transparent: true,
  alphaTest: 0.5,
  color: 0xffffff,
  metalness: 0.5,
  roughness: 0.4,
});
const coinMaterials = [edgeMaterial, headsMaterial, tailsMaterial];

// ------------------------------
// 為硬幣建立物理材質 (全域)
// ------------------------------
let coinMaterial = new CANNON.Material("coinMaterial");

// 建立硬幣接觸材質： coin 與 ground
const coinGroundContactMaterial = new CANNON.ContactMaterial(
  coinMaterial,
  groundPhysMaterial,
  {
    friction: 0.05,     // 摩擦
    restitution: 0.17,  // 反彈
  }
);
world.addContactMaterial(coinGroundContactMaterial);

// ==============================
// 4. 建立硬幣模型與物理剛體
// ==============================
const coinClinkSound = new Audio("m/coinClink.mp3");
const coinHitSoft = new Audio("m/coinHitSoft.mp3");
const coinHitSoft1 = new Audio("m/coinHitSoft1.mp3");
const coinHitMedium = new Audio("m/coinHitMedium.mp3");
const coinHitHard = new Audio("m/coinHitHard.mp3");

// 建立硬幣幾何
const coinGeometry = new THREE.CylinderGeometry(coinRadius, coinRadius, coinThickness, 32);
coinGeometry.translate(coinThickness / 2, 0, 0);

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
    
    const coinBody = new CANNON.Body({ mass: 9, material: coinMaterial }); // 質量 
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
    world.addBody(coinBody);
    coinBodies.push(coinBody);
    coinMesh.userData.physicsBody = coinBody;
    
    // 其他物理屬性
    coinBody.material.restitution = 0.25; // 反彈
    coinBody.material.friction = 0.08;    // 摩擦
    coinBody.linearDamping = 0.02;       // 線性阻尼
    coinBody.angularDamping = 0.05;       // 旋力阻尼

    coinBody.allowSleep = true;
    coinBody.sleepSpeedLimit = 0.1; 
    coinBody.sleepTimeLimit = 0.3; 
    
    // 加入碰撞事件監聽器 (包含防抖與撞擊閾值)
    coinBody.addEventListener("collide", function(event) {
      const currentTime = performance.now();
      if (currentTime - lastCollisionTime < collisionDebounceInterval) {
        return;
      }
      lastCollisionTime = currentTime;
      
      let impactVelocity = 0;
      if (event.contact && typeof event.contact.getImpactVelocityAlongNormal === "function") {
        impactVelocity = event.contact.getImpactVelocityAlongNormal();
      }
      if (impactVelocity < impactThreshold) {
        return;
      }
      if (event.body === groundBody) {
        if (impactVelocity < 1) {
          coinHitSoft.currentTime = 0;
          coinHitSoft.play();
        } else if (impactVelocity < 2) {
          coinHitSoft1.currentTime = 0;
          coinHitSoft1.play();
        } else if (impactVelocity < 4) {
          coinHitMedium.currentTime = 0;
          coinHitMedium.play();
        } else { 
          coinHitHard.currentTime = 0;
          coinHitHard.play();
        }
      } else if (event.body && event.body !== groundBody && event.body.mass > 0) {
        coinClinkSound.currentTime = 0;
        coinClinkSound.play();
      }
    });
  }
}
createCoins();

const cutSound = new Audio('m/cut1.mp3');
const clickSound = new Audio('m/click.mp3');
const souSound = new Audio('m/Sou.mp3');

//音效控制器
const bgmAudio = new Audio('https://crisvictor.github.io/dccool/m/47.mp3');
bgmAudio.loop = true; // 設置 BGM 循環播放
bgmAudio.volume = 0.4; // 預設音量

const volumeSlider = document.getElementById('volume-slider');
const bgmButton = document.getElementById('bgm-button');
const muteIcon = '🔇';
const playIcon = '♫';
const pauseIcon = '❚❚';

const soundList = [coinClinkSound, coinHitHard, coinHitMedium, coinHitSoft, souSound, cutSound, clickSound];
soundList.forEach(sound => sound.volume = 0.5);
coinClinkSound.volume = 0.6;
coinHitHard.volume = 0.6;
coinHitMedium.volume = 0.6;
coinHitSoft.volume = 0.6;
souSound.volume = 0.6;
cutSound.volume = 0.6;
clickSound.volume = 0.6;

volumeSlider.addEventListener('input', (event) => {
    const volume = parseFloat(event.target.value);
    bgmAudio.volume = volume;
    soundList.forEach(sound => sound.volume = volume);
    if (volume === 0) {
        bgmButton.textContent = muteIcon;
    } else {
        bgmButton.textContent = isPlaying ? pauseIcon : playIcon;
    }
});
let isPlaying = false;
bgmButton.addEventListener('click', () => {
    if (volumeSlider.value === '0') {
        alert('音量為零，請先調高音量再播放！');
        return;
    }
    if (isPlaying) {
        bgmAudio.pause();
        bgmButton.textContent = playIcon;
    } else {
        bgmAudio.play();
        bgmButton.textContent = pauseIcon;
    }
    isPlaying = !isPlaying;
});
volumeSlider.addEventListener('input', (event) => {
  const volume = parseFloat(event.target.value);
  const min = parseFloat(event.target.min) || 0;
  const max = parseFloat(event.target.max) || 1;
  const percent = ((volume - min) / (max - min)) * 100;
  event.target.style.setProperty('--range-percent', percent + '%');

  // 調整其他音效音量邏輯…
  bgmAudio.volume = volume;
  soundList.forEach(sound => sound.volume = volume);
  if (volume === 0) {
    bgmButton.textContent = muteIcon;
  } else {
    bgmButton.textContent = isPlaying ? pauseIcon : playIcon;
  }
});

// ==============================
// 5. 擲幣操作與結果判斷
// ==============================
let tossStartTime = 0;
function tossCoins() {
  clickSound.currentTime = 0; 
  clickSound.play().catch(error => console.warn('按鈕音效失敗:', error));
  if (hexagram.length === 6) return;
  if (tossInProgress) return;
  tossInProgress = true;
  restTimer = 0;
  tossStartTime = performance.now(); 
  const throwButton = document.getElementById("throwButton");
  throwButton.disabled = true;
  throwButton.style.opacity = 0.5;
  throwButton.style.cursor = "default";
  document.getElementById("illustrateButtonContainer").style.display = "none";
  document.getElementById("illustrateBox").style.display = "none";
  coinBodies.forEach(body => {
    body.velocity.set(
      (Math.random() - 0.5) * 9,  // X 軸左右對稱
      9 + Math.random() * 2,      // Y 軸向上基準
      (Math.random() - 0.5) * 3   // Z 軸前後對稱
    );
    body.angularVelocity.set(   //角速度
      (Math.random() - 0.5) * Math.PI * 3.5,
      (Math.random() - 0.5) * Math.PI * 3.5,
      (Math.random() - 0.5) * Math.PI * 3.5
    );
  });
}

function resetToss() {
  cutSound.currentTime = 0; 
  cutSound.play().catch(error => console.warn('按鈕音效失敗:', error));
  tossInProgress = false;
  restTimer = 0;
  createCoins();
  document.getElementById("coinResults").innerText = "等待擲幣...";
  document.getElementById("hexagramResult").innerText = "等待累積六爻...";
  document.getElementById("transformedHexagram").innerText = "";
  const throwButton = document.getElementById("throwButton");
  document.getElementById("explanationUI").style.display = "none";
  document.getElementById("coinResultsTransformed").style.display = "none";
  document.getElementById("coinResults1").style.display = "none";
  document.getElementById("coinResults").style.display = "block";
  document.getElementById("illustrateButtonContainer").style.display = "block";
  document.getElementById("illustrateButton").style.display = "block";
  document.getElementById("throwButton").classList.remove("hidden");
  throwButton.disabled = false;
  throwButton.style.opacity = 1;
  throwButton.style.cursor = "pointer";
  hexagram.length = 0;
}

function isCoinAtRest(body) {
  return body.velocity.length() < 0.1 && body.angularVelocity.length() < 0.1;
}

function isHeads(coin) {
  const localUp = new THREE.Vector3(0, 1, 0);
  localUp.applyQuaternion(coin.quaternion);
  return localUp.y > 0.5;
}

//說明系統
function showTopLevelMenu() {
  illustrateBox.innerHTML = "";
  const topMenuDiv = document.createElement("div");
  topMenuDiv.id = "topMenu";

  const btnQuestion = document.createElement("button");
  btnQuestion.classList.add("menu-btn");
  btnQuestion.textContent = "卜卦問法";
  btnQuestion.setAttribute("data-type", "question");
  topMenuDiv.appendChild(btnQuestion);

  const btnKnowledge = document.createElement("button");
  btnKnowledge.classList.add("menu-btn");
  btnKnowledge.textContent = "卦象須知";
  btnKnowledge.setAttribute("data-type", "knowledge");
  topMenuDiv.appendChild(btnKnowledge);

  const btnInterpretation = document.createElement("button");
  btnInterpretation.classList.add("menu-btn");
  btnInterpretation.textContent = "解卦須知";
  btnInterpretation.setAttribute("data-type", "interpretation");
  topMenuDiv.appendChild(btnInterpretation);

  const btnInterpretation2 = document.createElement("button");
  btnInterpretation2.classList.add("menu-btn");
  btnInterpretation2.textContent = "變卦須知";
  btnInterpretation2.setAttribute("data-type", "interpretation2");
  topMenuDiv.appendChild(btnInterpretation2);

  const returnBtn = document.createElement("button");
  returnBtn.id = "closeMenu";
  returnBtn.classList.add("menu-btn");
  returnBtn.textContent = "退出說明";
  topMenuDiv.appendChild(returnBtn);

  illustrateBox.appendChild(topMenuDiv);
  returnBtn.addEventListener("click", () => {
    illustrateBox.style.display = "none";
    illustrateButton.style.display = "block";
  });
  const menuButtons = topMenuDiv.querySelectorAll(".menu-btn[data-type]");
  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      showDetail(type);
    });
  });
}

const illustrateButton = document.getElementById("illustrateButton");
const illustrateBox = document.getElementById("illustrateBox");
function showTopLevelMenu() {
  illustrateBox.innerHTML = `
  <div id="topMenu">
    <button class="menu-btn" data-type="question">卜卦問法</button>
    <button class="menu-btn" data-type="knowledge">爻象須知</button>
    <button class="menu-btn" data-type="interpretation">解卦須知</button>
    <button class="menu-btn" data-type="interpretation2">變卦須知</button>
    <br>
    <button id="closeMenu" class="menu-btn">退出說明</button>
  </div>
  `;
  document.getElementById("closeMenu").addEventListener("click", () => {
    cutSound.currentTime = 0; 
    cutSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    illustrateBox.style.display = "none";
    illustrateButton.style.display = "block";
    document.getElementById("throwButton").classList.remove("hidden");
    document.getElementById("resetButton").classList.remove("hidden");
  });
  const menuButtons = document.querySelectorAll("#topMenu .menu-btn");
  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      let type = btn.getAttribute("data-type");
      showDetail(type);
    });
  });
}
function showDetail(type) {
  let content = "";
  if (type === "question") {
    souSound.currentTime = 0; 
    souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    content = "◆ 誠心與靜心冥想你的問題，心唸弟子某某某，何事問卦...。(擲出六爻求出卦象解卦)<br>◆ 若問某事吉凶可如此提問：所問何事，弟子欲做何選擇 / 決定，想問吉凶....<h4>◆ 一事不二問。</h4>〔也不可以同一件事用不同問法重覆問，這是褻瀆〕<br>◆ 重要事情請先齊戒沐浴〔或可於沐浴後〕；平時問卜，如廁之後請先洗手，並稍候再卜<br>◆ 卜卦是與自己以及天地的交流對話，不是要讓人迷信、推卸責任。<br>◆ 卜問者要有理性及自我負責的心態，不要期待它可以告訴你所有未知之事，<h4>卜卦不準是常有的事。</h4>"; 
  } else if (type === "knowledge") {
    souSound.currentTime = 0; 
    souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    content = "◆ 爻，音同遙。在成卦過程中，每一卦都是一爻一爻依「由下而上」（或由內而外）<br>的順序推算出來的，這也是爻的生成順序。陽爻標記「⚊」，陰爻標記「⚋」，<br>所以最下面一爻的位置稱為「初」爻，再往上為「二」，<br>然後是三、四、五，最上面不稱「六」而是「上」。<br>終始為時間的概念，以初爻為時間上的開始，上爻為結束，故第一爻取名為初。<br><br><h4>◆ 爻位稱九與六分別代表陽與陰。</h4>由於六爻的陰陽符是由數字卦演變而來，其中陽爻其實就是數字卦「筮數」的一，<br>一在長期演變過程中後來用來替代九。陰爻其實就是「筮數」六。<br><br>◆ 掛象為三或六爻組成，三畫卦是陰陽未分的三才之道，上爻為天，中爻為人，下爻為地。<br>因天道有陰陽，地道有柔剛，人道有仁義，因此三畫分別重之而成六爻。<h4>六畫卦：初與二爻象徵地道的剛與柔，三與四爻為人道之仁與義，<br>五與上為天道之陰與陽。</h4><h4>初與四為上下卦的下爻，二與五為中爻，三與上為上爻</h4><br>◆ 六爻位本身有一個吉凶架構：初難定，二多譽，三多憂，四多懼，五多功、六極端。<br>最基本的就是六爻所含的不同時空訊息。還可從時空引申出各種更為複雜與多樣的概念。<br>例如就空間上來說，初爻為近，上爻為遠。時間來說，初爻為初期，上爻為晚期"; 
  } else if (type === "interpretation") {
    souSound.currentTime = 0; 
    souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    content = "◆ 《易經》經文有一定架構，每一卦都有七段文字：第一段是「卦辭」，<br>後面六段就是依照爻位順序來寫的「爻辭」。<h4>卦辭統論一卦的吉凶與脈絡。<br>爻辭則分別記載六爻的吉凶，以及在卦義脈絡下的不同時機、階段，<br>或是相對位置等諸多變化。所以想全面的解掛要也需依靠爻辭詮譯。</h4><br>◆ 三爻成一卦，卦分八種「乾、坤、震、巽、坎、離、艮、兌」(也就是桌面所畫之八卦)<br>●人倫類象：乾，天也，故稱乎父。坤，地也，故稱乎母。<br>震，一索而得男，故謂之長男。巽，一索而得女，故謂之長女。<br>坎，再索而得男，故謂之中男。離，再索而得女，故謂之中女。<br>艮，三索而得男，故謂之少男。兌，三索而得女，故謂之少女。<br>●身體類象：乾為首，坤為腹，震為足，巽為股，坎為耳，離為目，艮為手，兌為口。<br>●五行類象：乾天金，坤地土，震雷木，巽風木，坎溝水，離明火，艮山土，兌澤金。<br>●方位類象：乾西北，坤西南，震東，巽東南，坎北，離南，艮東北，兌西。<br>●卦德類象：乾健也，坤順也，震動也，巽入也，坎陷也，離麗也，艮止也，兌說也。<br>●自然力類象：雷以動之，風以散之，雨以潤之，日以烜之，艮以止之，兌以說之，乾以君之，坤以藏之。<br><br>◆八卦卦象的思維方式和我們使用的象形文字很像，同時，易經做為文化載體，<br>很多文字演變的資訊也存留在卦名與卦象裡。因此文字的假借與聯想在卦象是很重要的。<br>以上基礎理解後，再藉由推理或聯想等各種方式將相關類象補充完整。<br>但由於解卦都有聯想、想像的參入，因此主觀性很強，每人想出的都不一，這是必然的。<br>如何處理這些不一樣？一是多用經文的義理來驗證。二是多落實在實際的占解來去驗證，<br>或可再多與易友溝通交流，久而久之就可建立起屬於自己一套的八卦系統。";
  } else if (type === "interpretation2") {
    souSound.currentTime = 0;
    souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    content = "◆ 要知曉變卦之前我們先了解何為變爻，每爻是由三枚錢幣擲出後視正反面得知陰陽。<br>正面為陽、反面為陰，擲出的結果又分「少陽、少陰、老陰、老陽」四種爻型態，<br>少陰、少陽就是三枚錢幣中「少者為大」原則，<br>兩反一正為少陽，亦為陽爻；兩正一反為少陰，亦是陰爻。<br>而老陰、老陽則又可稱變爻，是指當三枚錢幣都為正面或反面，<br>三枚正面為老陽，在本卦為陽爻，但陽極而陰，成了變卦的少陰爻，<br>反之，三枚反面為老陰，在本卦為陰爻，但陰極而陽，成了變卦的少陽爻。<br><br>◆ 「本卦」指為原本的卦象，而「變卦」是指由於爻變，導致本卦中的變爻陰陽轉變後，<br>形成另種卦象，這由變爻轉變後卦象稱為「變卦」。<br>「變」之所在，也被稱變爻或動爻，也就是發生變故的地方，所以就是找尋解答的地方。<h4>「卦為本，變為用」— 本卦常用代表「目前」的狀態，用變卦代表「未來」的狀態。</h4><br>◆ 所以從解讀本卦到變卦所帶來的變化趨勢，能使事情動態更加具體，<br>但有變爻，也不代表都要看著變卦來解卦判斷，<br>例如本卦只有一變爻，用本卦卦辭與本卦變爻爻辭來解讀即可。<br> <h4>● 其解卦法： (此表本系統卦象卜出後也會顯示，給予解卦提示)<br>一、 六爻都未變：以本爻卦辭為斷。 <br>二、 一個爻變，以本卦變爻為斷。 <br>三、 二個爻變，以本卦變爻的上爻為斷。變爻的下爻可做為參考。 <br>四、 三個爻變，以變卦的卦辭為斷；本卦卦辭可當參考。<br>五、 四個爻變，以變卦不變的二爻中的下爻為斷，上爻可做為參考。 <br>六、 五個爻變，以變卦不變的那一爻為斷。 <br>七、 六爻皆變，乾坤二卦時分別採用「用九」及「用六」；其餘六十二卦則以變卦為斷。 </h4>";
  }
  illustrateBox.innerHTML = `
    <div id="detailContent">
      ${content}
      <br>
      <button id="returnToMenu">返回</button>
    </div>
  `;
  if (content && content.trim().length > 0) {
    illustrateBox.classList.add("wide");
  } else {
    illustrateBox.classList.remove("wide");
  }
  document.getElementById("returnToMenu").addEventListener("click", () => {
    cutSound.currentTime = 0; 
    cutSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    illustrateBox.classList.remove("wide");
    showTopLevelMenu();
  });
}
illustrateButton.addEventListener("click", () => {
  clickSound.currentTime = 0;
  clickSound.play().catch(error => console.warn('按鈕音效失敗:', error));
  illustrateButton.style.display = "none";
  illustrateBox.style.display = "block";
  document.getElementById("throwButton").classList.add("hidden");
  document.getElementById("resetButton").classList.add("hidden");
  showTopLevelMenu();
});

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
  }
}

function triggerResult() {
  let headsCount = 0;
  let resultText = "";
  const coinNumbers = ["壹", "貳", "叁"]; 
  coins.forEach((coin, i) => {
    const result = isHeads(coin) ? "正" : "反";
    if (isHeads(coin)) headsCount++;
    resultText += `銅錢 ${coinNumbers[i]} 為 ${result}\n`;
  });
  document.getElementById("coinResults").innerText = resultText;
  let lineResult;
  if (headsCount === 3) {
    lineResult = { 
      type: "老陽", 
      symbol: "<img class='yao-image' src='img/oYang.png' alt='老陽' />",  
      isChanging: true 
    };
  } else if (headsCount === 1) {
    lineResult = { 
      type: "少陽", 
      symbol: "<img class='yao-image' src='img/sYang.png' alt='少陽' />", 
      isChanging: false 
    };
  } else if (headsCount === 2) {
    lineResult = { 
      type: "少陰", 
      symbol: "<img class='yao-image' src='img/sYin.png' alt='少陰' />", 
      isChanging: false 
    };
  } else if (headsCount === 0) {
    lineResult = { 
      type: "老陰", 
      symbol: "<img class='yao-image' src='img/oYin.png' alt='老陰' />", 
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
    console.log("本卦:", baseHexagram);
    getHexagramInterpretation(baseHexagram);
    document.getElementById("explanationUI").style.display = "block";
    let transformedArray = hexagram.map(line => {
      if (line.isChanging) {
        if (line.type.indexOf("陽") > -1) {
          return { 
            type: "少陰", 
            symbol: "<img class='yao-image' src='img/sYin.png' alt='少陰' />", 
            isChanging: false 
          };
        } else {
          return { 
            type: "少陽", 
            symbol: "<img class='yao-image' src='img/sYang.png' alt='少陽' />", 
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
    console.log("變卦:", transformedHexagramKey);
    if (transformedHexagramKey === globalBaseHexagram) {
      document.getElementById("transformedInterpretation").innerText = "本卦無變卦";
      document.getElementById("transformedExplanationList").style.display = "none";
      document.getElementById("transformedExplanationDetail").style.display = "none";
    } else {
      if (hexagramData && hexagramData[transformedHexagramKey]) {
        const transformedInfo = hexagramData[transformedHexagramKey];
        globalTransformedInfo = transformedInfo;
        document.getElementById("transformedInterpretation").innerHTML =
          "變卦 —— " + transformedInfo.name + " (" + transformedInfo.pinyin + ")<br>" +
          "<span style='color:rgba(255,229,158,0.95); font-weight: normal;'>" + transformedInfo.summary + "</span><br><br>" +
          "<span style='color:rgb(255,202,158); font-weight: normal;'>" + transformedInfo.detailed + "</span><br>";
        initTransformedExplanationUI(transformedInfo);
        getHexagramInterpretation(globalBaseHexagram, globalTransformedInfo);
        initYaoExplanationUI(transformedInfo, "transformedYaoInterpretation");
      } else {
        getHexagramInterpretation(globalBaseHexagram, null);
        document.getElementById("transformedInterpretation").innerText = "找不到對應的變卦資料";
        document.getElementById("transformedExplanationList").style.display = "none";
        document.getElementById("transformedExplanationDetail").style.display = "none";
      }
    }
    updateHexagramDisplay(transformedArray);
  } else {
    const throwButton = document.getElementById("throwButton");
    throwButton.disabled = false;
    throwButton.style.opacity = 1;
    throwButton.style.cursor = "pointer";
  }
}

function updateHexagramDisplay(_transformedArray) { 
  //本卦顯示
  let originalLines = [];
  const positions = ["初", "二", "三", "四", "五", "上"];
  for (let i = 0; i < hexagram.length; i++) {
    const line = hexagram[i];
    const isYang = line.type.indexOf("陽") > -1;
    const yinYangText = isYang ? "九" : "六";
    let displayText = "";
    if (i === 0 || i === hexagram.length - 1) {
      displayText = positions[i] + yinYangText;
    } else {
      displayText = yinYangText + positions[i];
    }
    originalLines.push(`${displayText} ${line.type} ${line.symbol}<br>`);
  }
  let originalText = originalLines.reverse().join("");
  document.getElementById("hexagramResult").innerHTML = originalText;
  
  if (hexagram.length === 6) {
    const throwButton = document.getElementById("throwButton");
    document.getElementById("throwButton").classList.add("hidden");
    throwButton.disabled = true;
    throwButton.style.opacity = 0.5;
    throwButton.style.cursor = "default";
  
    let transformedArray = hexagram.map(line => {
      if (line.isChanging) {
        if (line.type.indexOf("陽") > -1) { 
          return { 
            type: "少陰", 
            symbol: "<img class='yao-image' src='img/sYin.png' alt='少陰' />", 
            isChanging: false 
          };
        } else {
          return { 
            type: "少陽", 
            symbol: "<img class='yao-image' src='img/sYang.png' alt='少陽' />", 
            isChanging: false 
          };
        }
      }
      return line;
    });
    //變卦顯示
    if (_transformedArray && Array.isArray(_transformedArray)) {
      let transformedLines = [];
      for (let i = 0; i < _transformedArray.length; i++) {
        const line = _transformedArray[i];
        const isYang = line.type.indexOf("陽") > -1;
        const yinYangText = isYang ? "九" : "六";
        let displayText = "";
        if (i === 0 || i === _transformedArray.length - 1) {
          displayText = positions[i] + yinYangText;
        } else {
          displayText = yinYangText + positions[i];
        }
        transformedLines.push(`${displayText} ${line.type} ${line.symbol}<br>`);
      }
      let transformedText = transformedLines.reverse().join("");
      // 解卦說明
      let changedCount = hexagram.filter(line => line.isChanging).length;
      let extraText = "";
      if (changedCount < 1) {
        document.getElementById("coinResultsTransformed").style.display = "none";
      } else if (changedCount === 1) {
        extraText = "<h6>以本卦的變爻解卦</h6>";
      } else if (changedCount === 2) {
        extraText = "<h6>以本卦的兩個變爻<br>解卦，上爻為主</h6>";
      } else if (changedCount === 3) {
        extraText = "<h6>以兩卦卦義解卦，<br>變卦為主</h6>";
      } else if (changedCount === 4) {
        extraText = "<h6>以變卦未變的兩爻<br>解卦，下爻為主</h6>";
      } else if (changedCount === 5) {
        extraText = "<h6>以變卦未變的一爻<br>解卦</h6>";
      } else if (changedCount === 6) {
        extraText = "<h6>乾卦為『用九』，<br>坤卦為『用六』，<br>餘卦六二卦以變卦<br>卦義解卦</h6>";
      }
      if (changedCount >= 1) {
        document.getElementById("coinResultsTransformed").style.display = "block";
        let finalTransformedHTML = transformedText +
          `<br><strong>解卦 ——</strong><br>${extraText}`;
        document.getElementById("transformedHexagram").innerHTML = finalTransformedHTML;
      }
      // 爻位凶吉判定原卦
      function pairResult(indexA, indexB) {
        const isYangA = hexagram[indexA].type.indexOf("陽") > -1;
        const isYangB = hexagram[indexB].type.indexOf("陽") > -1;
        return (isYangA !== isYangB) ? "吉" : "凶";
      }
      const pair1 = pairResult(5, 2);
      const pair2 = pairResult(4, 1);
      const pair3 = pairResult(3, 0);
      const pairSummary = `<span style='color:rgba(255,229,158,0.95); font-size: 16px;'><br>上爻：${pair1}<br>中爻：${pair2}<br>下爻：${pair3}</span>`;
      document.getElementById("hexagramResult").innerHTML += `<br><strong>本卦爻位相應 ——</strong> ${pairSummary}`; 
      // 爻位變卦凶吉判定
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
      const tPairSummary = "<br><span style='color:rgba(255,229,158,0.95); font-size: 16px;'>" + 
                            getPairDescription("上爻：", tPair1) + "<br>" +
                            getPairDescription("中爻：", tPair2) + "<br>" +
                            getPairDescription("下爻：", tPair3) + "</span>";
      document.getElementById("transformedHexagram").innerHTML += `<br><strong>變卦爻位相應 ——</strong> ${tPairSummary}`;
    }
  }
}

//爻辭
function initYaoExplanationUI(hexagramInfo, targetId) {
  const container = document.getElementById(targetId);
  container.innerHTML = "";
  const title = document.createElement("div");
  title.innerText = "爻辭:";
  title.style.fontWeight = "bold";
  title.style.marginBottom = "16px";
  container.appendChild(title);
  const btnContainer = document.createElement("div");
  btnContainer.id = targetId + "Buttons";
  btnContainer.style.display = "flex";
  btnContainer.style.flexDirection = "row";
  btnContainer.style.justifyContent = "center";
  btnContainer.style.gap = "5px";
  for (let key in hexagramInfo.yaoInterpretation) {
    if (hexagramInfo.yaoInterpretation.hasOwnProperty(key)) {
      const btn = document.createElement("button");
      btn.classList.add("menu-btn");
      btn.textContent = key;
      btn.style.fontSize = "18px";
      btn.style.margin = "3px";
      btn.addEventListener("click", () => {
        souSound.currentTime = 0;
        souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
        showYaoExplanation(key, hexagramInfo.yaoInterpretation[key], targetId);
      });
      btnContainer.appendChild(btn);
    }
  }
  container.appendChild(btnContainer);
}

function showYaoExplanation(key, text, targetId) {
  const container = document.getElementById(targetId);
  const btnContainer = document.getElementById(targetId + "Buttons");
  if (btnContainer) {
    btnContainer.style.display = "none";
  }
  let detailContainer = document.getElementById(targetId + "Detail");
  if (!detailContainer) {
    detailContainer = document.createElement("div");
    detailContainer.id = targetId + "Detail";
    detailContainer.style.marginTop = "10px";
    container.appendChild(detailContainer);
  }
  detailContainer.innerHTML = `
    <p style="margin: 8px 0;">${text}</p>
    <button id="${targetId}BackBtn" class="menu-btn">返回</button>
  `;
  document.getElementById(targetId + "BackBtn").addEventListener("click", () => {
    cutSound.currentTime = 0;
    cutSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    detailContainer.innerHTML = "";
    btnContainer.style.display = "flex";
  });
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

function getHexagramInterpretation(baseHexagram, globalTransformedInfo) {
  fetch("hexagrams.json")
    .then(response => response.json())
    .then(data => {
      const hexagramInfo = data[baseHexagram];
      if (hexagramInfo) {
        document.getElementById("interpretation").innerHTML =
          "本卦 —— " + hexagramInfo.name + " (" + hexagramInfo.pinyin + ")<br>" +
          "<span style='color:rgba(255, 229, 158, 0.95); font-weight: normal;'>" + hexagramInfo.summary + "</span><br><br>" +
          "<span style='color:rgb(255, 202, 158); font-weight: normal;'>" + hexagramInfo.detailed + "</span><br>";
        initExplanationUI(hexagramInfo);
        let displayText = hexagramInfo.name;
        if (globalTransformedInfo) {
          displayText += " 之 " + globalTransformedInfo.name;
        }
        document.getElementById("coinResults").style.display = "none";
        document.getElementById("coinResults1").style.display = "block";
        document.getElementById("coinResults1").innerHTML = `<span style="color:rgb(255, 214, 100);">${displayText}</span>`;
        initYaoExplanationUI(hexagramInfo, "YaoInterpretation");
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
  title.style.marginBottom = "6px";
  explanationList.appendChild(title);

  const aspects = hexagramInfo.explanations;
  for (let aspect in aspects) {
    const btn = document.createElement("button");
    btn.innerText = aspect;
    btn.style.margin = "5px";
    btn.addEventListener("click", () => {
      souSound.currentTime = 0;
      souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
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
    cutSound.currentTime = 0;
    cutSound.play().catch(error => console.warn('按鈕音效失敗:', error));
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
      souSound.currentTime = 0;
      souSound.play().catch(error => console.warn('按鈕音效失敗:', error));
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
    cutSound.currentTime = 0;
    cutSound.play().catch(error => console.warn('按鈕音效失敗:', error));
    detailDiv.style.display = "none";
    listDiv.style.display = "block";
  });
  detailDiv.appendChild(backBtn);
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
