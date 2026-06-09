/**
 * Three.js 3D Scene Manager
 * 
 * Creates and manages the 3D visualization of:
 * - X-Gantry (rails, supports, carriage)
 * - DUAL EEZYbot robot arms (Main shaped + Ghost unshaped) for comparison
 * - Work area (floor grid, pick/place markers, object)
 * - Motion trails and Vibration indicators
 */

class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // Model groups
    this.gantryGroup = null;
    this.carriageGroup = null;
    this.ghostCarriageGroup = null;
    
    // Main Arm joints
    this.mainArm = null; // { group, base, shoulder, elbow, gripperLeft, gripperRight }
    
    // Ghost Arm joints
    this.ghostArm = null; 

    // Scene elements
    this.objectMesh = null;
    this.pickMarker = null;
    this.placeMarker = null;

    // Vibration Indicators
    this.shapedVibRing = null;
    this.unshapedVibRing = null;

    // Trails
    this.shapedTrail = null;
    this.unshapedTrail = null;
    this.trailPoints = [];
    this.unshapedTrailPoints = [];

    // Scene parameters
    this.railLength = 80;
    this.railSpacing = 24;
    this.railHeight = 14;
    this.carriageX = 15;
    this.ghostX = 15;
    this.armGroupY = this.railHeight + 2.2;
    this.objectZ = 15; // Z reach when picking at gantry height

    // Pickup object state
    this.objectAttached = false;
    this.objectDefaultPos = { x: 15, y: this.railHeight + 0.5, z: this.objectZ }; // Set object on the table

    this._init();
  }

  _init() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1d23);
    this.scene.fog = new THREE.FogExp2(0x1a1d23, 0.004);

    // Camera — front-facing, slightly elevated for clear overview
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 500);
    this.camera.position.set(40, 30, 65);
    this.camera.lookAt(40, 10, 0);

    // Renderer — photorealistic settings
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.physicallyCorrectLights = true;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(40, 10, 0);
    this.controls.minDistance = 20;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI * 0.85;

    // Lighting
    this._setupLights();

    // Build scene
    this._buildFloor();
    this._buildGantry();
    this._buildCarriage();
    this._buildGhostCarriage();
    this._buildObject();
    this._buildMarkers();
    this._buildTrails();
    this._buildVibrationIndicators();

    // Resize handler
    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _setupLights() {
    // Key light — warm overhead directional (sun-like)
    const ambient = new THREE.AmbientLight(0x404050, 0.4);
    this.scene.add(ambient);

    // Hemisphere: sky=cool blue, ground=warm — natural indoor factory feel
    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x3a3228, 0.5);
    this.scene.add(hemi);

    // Main directional (key light)
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    dirLight.position.set(30, 50, 40);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    this.scene.add(dirLight);

    // Fill light — cool side (subtle)
    const fillLight1 = new THREE.PointLight(0xddeeff, 0.15, 100);
    fillLight1.position.set(10, 20, 40);
    this.scene.add(fillLight1);

    // Rim light — backlight for depth separation
    const rimLight = new THREE.PointLight(0xffeedd, 0.15, 100);
    rimLight.position.set(70, 20, -25);
    this.scene.add(rimLight);
  }

  _buildFloor() {
    // Subtle grid — faded engineering grid lines
    const grid = new THREE.GridHelper(120, 60, 0x2a2d35, 0x22252b);
    grid.position.set(40, 0, 0);
    grid.material.transparent = true;
    grid.material.opacity = 0.4;
    this.scene.add(grid);

    // Factory floor — dark concrete look with subtle reflections
    const floorGeo = new THREE.PlaneGeometry(160, 160);
    const floorMat = new THREE.MeshPhysicalMaterial({ 
      color: 0x1e2028, 
      roughness: 0.85, 
      metalness: 0.05,
      clearcoat: 0.08,
      clearcoatRoughness: 0.9
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(40, -0.05, 0);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Build Work Table parallel to the X-gantry
    const tableMat = new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0.6, metalness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.5 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(80, 0.5, 6), tableMat);
    // Positioned along X, height matches railHeight (14), Z matches objectZ (15)
    tableTop.position.set(this.railLength / 2, this.railHeight - 0.25, this.objectZ);
    tableTop.receiveShadow = true;
    this.scene.add(tableTop);
    
    // Table legs
    for(let i=0; i<3; i++) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, this.railHeight, 0.8), tableMat);
      leg.position.set(10 + i * 30, this.railHeight/2, this.objectZ);
      leg.castShadow = true;
      this.scene.add(leg);
    }
  }

  _createMetal(colorHex, roughness = 0.5) {
    return new THREE.MeshPhysicalMaterial({ 
      color: colorHex, 
      roughness: roughness, 
      metalness: 0.8,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1.0
    });
  }

  _createAccent() {
    return new THREE.MeshPhysicalMaterial({ 
      color: 0x2563eb, 
      roughness: 0.3, 
      metalness: 0.2,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2
    });
  }

  _createMatte(colorHex) {
    return new THREE.MeshPhysicalMaterial({ 
      color: colorHex, 
      roughness: 0.8, 
      metalness: 0.1,
      clearcoat: 0.05
    });
  }

  _createGhostMat() {
    return new THREE.MeshPhysicalMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.3, transparent: true, opacity: 0.35, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  }

  _buildGantry() {
    this.gantryGroup = new THREE.Group();
    const railMat = this._createMetal(0x667788, 0.25);
    const supportMat = this._createMetal(0x556677, 0.4);
    const halfSpacing = this.railSpacing / 2;

    for (const zOff of [-halfSpacing, halfSpacing]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(this.railLength, 1.8, 2.5), railMat);
      rail.position.set(this.railLength / 2, this.railHeight, zOff);
      rail.castShadow = true; rail.receiveShadow = true;
      this.gantryGroup.add(rail);

      const strip = new THREE.Mesh(new THREE.BoxGeometry(this.railLength, 0.2, 1.0), this._createAccent());
      strip.position.set(this.railLength / 2, this.railHeight + 1.0, zOff);
      this.gantryGroup.add(strip);

      for (let i = 0; i < 5; i++) {
        const x = 4 + i * (this.railLength - 8) / 4;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.5, this.railHeight, 2.0), supportMat);
        leg.position.set(x, this.railHeight / 2, zOff);
        leg.castShadow = true;
        this.gantryGroup.add(leg);
      }
    }

    for (let i = 0; i < 5; i++) {
      const x = 4 + i * (this.railLength - 8) / 4;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, this.railSpacing + 2), supportMat);
      beam.position.set(x, 1.5, 0);
      beam.castShadow = true;
      this.gantryGroup.add(beam);
    }

    const belt = new THREE.Mesh(new THREE.BoxGeometry(this.railLength - 4, 0.3, 0.8), new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6, metalness: 0.2 }));
    belt.position.set(this.railLength / 2, this.railHeight - 1.2, -halfSpacing + 0.3);
    this.gantryGroup.add(belt);

    this.scene.add(this.gantryGroup);
  }

  _buildCarriage() {
    this.carriageGroup = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, this.railSpacing + 4), this._createMetal(0x8899aa, 0.3));
    plate.position.set(0, this.railHeight + 1.5, 0);
    plate.castShadow = true; plate.receiveShadow = true;
    this.carriageGroup.add(plate);

    const halfSpacing = this.railSpacing / 2;
    for (const dx of [-3, 3]) {
      for (const dz of [-halfSpacing, halfSpacing]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 3.5), this._createMetal(0x7799bb, 0.2));
        block.position.set(dx, this.railHeight + 0.3, dz);
        block.castShadow = true;
        this.carriageGroup.add(block);
      }
    }

    // Build Main Arm
    this.mainArm = this._createArmChain(this.carriageGroup, false);

    this.carriageGroup.position.x = this.carriageX;
    this.scene.add(this.carriageGroup);
  }

  _buildGhostCarriage() {
    this.ghostCarriageGroup = new THREE.Group();
    const ghostMat = this._createGhostMat();

    const plate = new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, this.railSpacing + 4), ghostMat);
    plate.position.set(0, this.railHeight + 1.5, 0);
    this.ghostCarriageGroup.add(plate);

    // Build Ghost Arm
    this.ghostArm = this._createArmChain(this.ghostCarriageGroup, true);

    this.ghostCarriageGroup.position.x = this.ghostX;
    this.ghostCarriageGroup.visible = false;
    this.scene.add(this.ghostCarriageGroup);
  }

  _createArmChain(parentGroup, isGhost) {
    // Realistic Industrial CAD / Engineering Materials (FANUC/KUKA style)
    // No neon, no emissive, pure realistic PBR materials
    const matBase = isGhost ? this._createGhostMat() : new THREE.MeshPhysicalMaterial({ color: 0x2b2d30, roughness: 0.6, metalness: 0.3, clearcoat: 0.2 }); // Matte Dark Grey Base
    const matLink = isGhost ? this._createGhostMat() : new THREE.MeshPhysicalMaterial({ color: 0xe8e9eb, roughness: 0.4, metalness: 0.2, clearcoat: 0.5 }); // Clean Industrial White/Light Grey
    const matJoint = isGhost ? this._createGhostMat() : new THREE.MeshPhysicalMaterial({ color: 0x4a4d52, roughness: 0.5, metalness: 0.7, clearcoat: 0.3 }); // Brushed Steel / Dark Alloy
    const matAccent = isGhost ? this._createGhostMat() : new THREE.MeshPhysicalMaterial({ color: 0xff6600, roughness: 0.3, metalness: 0.2, clearcoat: 0.8 }); // Safety Orange / Industrial Yellow

    const armGroup = new THREE.Group();
    
    // --- 1. Base Joint (rotates around Y) ---
    const baseJoint = new THREE.Group();
    // Solid robust base
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 4.0, 32), matBase);
    baseMesh.position.y = 2.0;
    if(!isGhost) baseMesh.castShadow = true;
    baseJoint.add(baseMesh);
    
    // Base rotating flange
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 32), matJoint);
    ring.position.y = 4.2;
    baseJoint.add(ring);

    // --- 2. Shoulder Joint (rotates around local X axis) ---
    const shoulderJoint = new THREE.Group();
    shoulderJoint.position.y = 4.4;
    
    // Servo Motor Casing
    const shoulderServo = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.8, 32), matJoint);
    shoulderServo.rotation.z = Math.PI / 2;
    if(!isGhost) shoulderServo.castShadow = true;
    shoulderJoint.add(shoulderServo);
    // Orange safety caps
    const shoulderCapL = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.9, 32), matAccent);
    shoulderCapL.rotation.z = Math.PI / 2;
    shoulderJoint.add(shoulderCapL);

    // Upper Arm Linkage
    const upperArmLen = 10;
    const upperArmGroup = new THREE.Group();
    // Clean, robust box structure (like extruded aluminum or cast iron)
    const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, upperArmLen), matLink);
    upperBeam.position.z = upperArmLen / 2;
    if(!isGhost) upperBeam.castShadow = true;
    upperArmGroup.add(upperBeam);
    // Industrial branding/accent plates (not glowing)
    const upperArmor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, upperArmLen - 2), matAccent);
    upperArmor.position.z = upperArmLen / 2;
    upperArmGroup.add(upperArmor);
    
    shoulderJoint.add(upperArmGroup);

    // --- 3. Elbow Joint (rotates around X) ---
    const elbowJoint = new THREE.Group();
    elbowJoint.position.z = upperArmLen;
    
    // Servo Motor Casing
    const elbowServo = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.0, 32), matJoint);
    elbowServo.rotation.z = Math.PI / 2;
    if(!isGhost) elbowServo.castShadow = true;
    elbowJoint.add(elbowServo);
    // Orange safety caps
    const elbowCapL = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.1, 32), matAccent);
    elbowCapL.rotation.z = Math.PI / 2;
    elbowJoint.add(elbowCapL);
    
    // Forearm Linkage
    const forearmLen = 11;
    const forearmGroup = new THREE.Group();
    // Tapered look
    const foreBeam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, forearmLen), matLink);
    foreBeam.position.z = forearmLen / 2;
    if(!isGhost) foreBeam.castShadow = true;
    forearmGroup.add(foreBeam);
    // Industrial accent
    const foreArmor = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, forearmLen - 2), matBase);
    foreArmor.position.z = forearmLen / 2;
    forearmGroup.add(foreArmor);
    
    elbowJoint.add(forearmGroup);

    // --- 4. Gripper Group ---
    const gripperGroup = new THREE.Group();
    gripperGroup.position.z = forearmLen;
    
    // Realistic wrist flange
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 32), matJoint);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.z = 1.0;
    if(!isGhost) wrist.castShadow = true;
    gripperGroup.add(wrist);

    // Fingers (Pneumatic parallel gripper style)
    const fingerGeo = new THREE.BoxGeometry(0.3, 0.8, 3.0);
    const gripperLeft = new THREE.Group();
    const leftFinger = new THREE.Mesh(fingerGeo, matBase);
    leftFinger.position.z = 2.5;
    if(!isGhost) leftFinger.castShadow = true;
    gripperLeft.add(leftFinger);
    gripperLeft.position.set(0.6, 0, 1.0);
    gripperGroup.add(gripperLeft);

    const gripperRight = new THREE.Group();
    const rightFinger = new THREE.Mesh(fingerGeo, matBase);
    rightFinger.position.z = 2.5;
    if(!isGhost) rightFinger.castShadow = true;
    gripperRight.add(rightFinger);
    gripperRight.position.set(-0.6, 0, 1.0);
    gripperGroup.add(gripperRight);

    // Assembly
    elbowJoint.add(gripperGroup);
    shoulderJoint.add(elbowJoint);
    baseJoint.add(shoulderJoint);
    armGroup.add(baseJoint);

    armGroup.position.set(0, this.armGroupY, 0);
    parentGroup.add(armGroup);

    // Init poses
    baseJoint.rotation.y = 0;
    shoulderJoint.rotation.x = -Math.PI / 6;
    elbowJoint.rotation.x = Math.PI / 4;

    return { group: armGroup, baseJoint, shoulderJoint, elbowJoint, gripperLeft, gripperRight };
  }

  _buildObject() {
    this.objectMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3, metalness: 0.4 })
    );
    this.objectMesh.position.set(this.objectDefaultPos.x, this.objectDefaultPos.y, this.objectDefaultPos.z);
    this.objectMesh.castShadow = true;
    this.scene.add(this.objectMesh);
  }

  _buildMarkers() {
    const markerGeo = new THREE.RingGeometry(2.5, 3.2, 32);
    this.pickMarker = new THREE.Mesh(markerGeo, new THREE.MeshStandardMaterial({ color: 0x16a34a, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
    this.pickMarker.rotation.x = -Math.PI / 2;
    // Set marker on the table surface
    this.pickMarker.position.set(this.objectDefaultPos.x, this.railHeight + 0.1, this.objectDefaultPos.z);
    this.scene.add(this.pickMarker);

    this.placeMarker = new THREE.Mesh(markerGeo, new THREE.MeshStandardMaterial({ color: 0xea580c, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
    this.placeMarker.rotation.x = -Math.PI / 2;
    // Set marker on the table surface
    this.placeMarker.position.set(65, this.railHeight + 0.1, this.objectDefaultPos.z);
    this.scene.add(this.placeMarker);
  }

  _buildVibrationIndicators() {
    const ringGeo = new THREE.TorusGeometry(1.5, 0.2, 8, 32);
    
    this.shapedVibRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.7 }));
    this.shapedVibRing.rotation.x = Math.PI/2;
    this.shapedVibRing.visible = false;
    this.scene.add(this.shapedVibRing);

    this.unshapedVibRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.7 }));
    this.unshapedVibRing.rotation.x = Math.PI/2;
    this.unshapedVibRing.visible = false;
    this.scene.add(this.unshapedVibRing);
  }

  _buildTrails() {
    this.shapedTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x2563eb, transparent: true, opacity: 0.5 }));
    this.scene.add(this.shapedTrail);
    this.unshapedTrail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.35 }));
    this.scene.add(this.unshapedTrail);
  }

  // ══════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════

  setCarriagePosition(x) {
    this.carriageX = x;
    this.carriageGroup.position.x = x;
    this.trailPoints.push(new THREE.Vector3(x, this.railHeight + 3, 0));
    this._updateTrailGeometry(this.shapedTrail, this.trailPoints);
  }

  setArmAngles(theta1, theta2, theta3) {
    this.mainArm.baseJoint.rotation.y = theta1;
    this.mainArm.shoulderJoint.rotation.x = -theta2;
    this.mainArm.elbowJoint.rotation.x = -theta3;
  }

  setGripperOpen(value) {
    const spread = value * 1.0;
    this.mainArm.gripperLeft.position.x = 0.3 + spread;
    this.mainArm.gripperRight.position.x = -(0.3 + spread);
  }

  getGripperWorldPosition(arm = this.mainArm) {
    const pos = new THREE.Vector3(0, 0, 3.5); // local tip
    arm.gripperLeft.parent.localToWorld(pos);
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  setGhostPosition(x) {
    this.ghostX = x;
    this.ghostCarriageGroup.position.x = x;
    this.unshapedTrailPoints.push(new THREE.Vector3(x, this.railHeight + 5, 0));
    this._updateTrailGeometry(this.unshapedTrail, this.unshapedTrailPoints);
  }

  setGhostArmAngles(theta1, theta2, theta3) {
    this.ghostArm.baseJoint.rotation.y = theta1;
    this.ghostArm.shoulderJoint.rotation.x = -theta2;
    this.ghostArm.elbowJoint.rotation.x = -theta3;
  }

  setGhostGripperOpen(value) {
    const spread = value * 1.0;
    this.ghostArm.gripperLeft.position.x = 0.3 + spread;
    this.ghostArm.gripperRight.position.x = -(0.3 + spread);
  }

  hideGhost() { this.ghostCarriageGroup.visible = false; }
  showGhost() { this.ghostCarriageGroup.visible = true; }

  updateVibrationIndicators(shapedAmp, unshapedAmp) {
    // Show and scale vibration rings based on vibration amplitude
    if(!this.shapedVibRing || !this.unshapedVibRing) return;

    // Scale mapping
    const scaleShaped = Math.max(0.1, Math.min(5, Math.abs(shapedAmp) * 15));
    const scaleUnshaped = Math.max(0.1, Math.min(5, Math.abs(unshapedAmp) * 15));

    this.shapedVibRing.scale.setScalar(scaleShaped);
    this.shapedVibRing.userData.baseScale = scaleShaped;
    this.shapedVibRing.material.opacity = Math.min(1.0, Math.abs(shapedAmp)*5 + 0.2);
    
    this.unshapedVibRing.scale.setScalar(scaleUnshaped);
    this.unshapedVibRing.userData.baseScale = scaleUnshaped;
    this.unshapedVibRing.material.opacity = Math.min(1.0, Math.abs(unshapedAmp)*5 + 0.2);

    const posS = this.getGripperWorldPosition(this.mainArm);
    this.shapedVibRing.position.set(posS.x, posS.y, posS.z);
    
    const posU = this.getGripperWorldPosition(this.ghostArm);
    this.unshapedVibRing.position.set(posU.x, posU.y, posU.z);

    this.shapedVibRing.visible = true;
    this.unshapedVibRing.visible = this.ghostCarriageGroup.visible; // only show if ghost is visible
  }

  hideVibrationIndicators() {
    if(this.shapedVibRing) this.shapedVibRing.visible = false;
    if(this.unshapedVibRing) this.unshapedVibRing.visible = false;
  }

  setObjectPosition(x, y, z) {
    if (this.objectMesh) this.objectMesh.position.set(x, y, z);
  }

  setObjectAttached(attached) { this.objectAttached = attached; }
  setObjectVisible(visible) { if (this.objectMesh) this.objectMesh.visible = visible; }

  updatePickPlacePositions(pickX, placeX) {
    if (this.pickMarker) this.pickMarker.position.x = pickX;
    if (this.placeMarker) this.placeMarker.position.x = placeX;
    this.objectDefaultPos.x = pickX;
    if (this.objectMesh && !this.objectAttached) {
      this.objectMesh.position.x = pickX;
    }
  }

  clearTrails() {
    this.trailPoints = [];
    this.unshapedTrailPoints = [];
    this._updateTrailGeometry(this.shapedTrail, []);
    this._updateTrailGeometry(this.unshapedTrail, []);
  }

  resetObject() {
    this.objectAttached = false;
    this.setObjectPosition(this.objectDefaultPos.x, this.objectDefaultPos.y, this.objectDefaultPos.z);
    this.setObjectVisible(true);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.controls.update();

    const t = Date.now() * 0.002;
    if (this.pickMarker) this.pickMarker.material.opacity = 0.5 + 0.2 * Math.sin(t);
    if (this.placeMarker) this.placeMarker.material.opacity = 0.5 + 0.2 * Math.sin(t + 1.5);
    if (this.shapedVibRing && this.shapedVibRing.visible) {
      const base = this.shapedVibRing.userData.baseScale || 1;
      const pulse = base + Math.sin(t * 10) * 0.05;
      this.shapedVibRing.scale.set(pulse, pulse, 1);
    }
    if (this.unshapedVibRing && this.unshapedVibRing.visible) {
      const base = this.unshapedVibRing.userData.baseScale || 1;
      const pulse = base + Math.sin(t * 10) * 0.05;
      this.unshapedVibRing.scale.set(pulse, pulse, 1);
    }

    if (this.objectAttached && this.objectMesh) {
      const gripPos = this.getGripperWorldPosition(this.mainArm);
      // add slight offset so object hangs
      this.objectMesh.position.set(gripPos.x, gripPos.y - 1.5, gripPos.z);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _updateTrailGeometry(line, points) {
    if (points.length < 2) {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry();
      return;
    }
    const maxPoints = 500;
    const pts = points.length > maxPoints ? points.slice(points.length - maxPoints) : points;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  dispose() {
    window.removeEventListener('resize', this._resizeHandler);
    this.renderer.dispose();
    this.controls.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}

// Make globally available
window.SceneManager = SceneManager;
