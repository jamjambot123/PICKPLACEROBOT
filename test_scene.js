const fs = require('fs');
const code = fs.readFileSync('js/scene.js', 'utf8');
const dummyTHREE = {
  Scene: class { add() { console.log('Scene.add called'); } }, Color: class {}, FogExp2: class {}, PerspectiveCamera: class { position={set:()=>{}}; lookAt() {} }, 
  WebGLRenderer: class { setSize() {} setPixelRatio() {} shadowMap={}; domElement={} },
  AmbientLight: class {}, HemisphereLight: class {}, DirectionalLight: class { position={set:()=>{}}; shadow={mapSize:{},camera:{}} }, PointLight: class { position={set:()=>{}} },
  GridHelper: class { position={set:()=>{}} }, PlaneGeometry: class {}, BoxGeometry: class {}, CylinderGeometry: class {}, SphereGeometry: class {}, TorusGeometry: class {}, RingGeometry: class {}, BufferGeometry: class {},
  MeshStandardMaterial: class { constructor(args) { } }, MeshBasicMaterial: class {}, LineBasicMaterial: class {},
  Mesh: class { position={set:()=>{}}; rotation={} }, Group: class { position={set:()=>{}}; rotation={}; add() {} }, Line: class {}, Vector3: class {},
  OrbitControls: class { target={set:()=>{}} },
  PCFSoftShadowMap: 1, ACESFilmicToneMapping: 1, DoubleSide: 1
};
global.THREE = dummyTHREE;
global.window = { addEventListener: () => {} };
try {
  eval(code + '\nconst scene = new SceneManager({ clientWidth: 800, clientHeight: 600, appendChild: () => {} });\nconsole.log(\'Success!\');');
} catch (e) {
  console.error('ERROR OCCURRED:', e);
}
