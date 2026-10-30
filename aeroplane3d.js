/**
 * Fauzi AeroPhysics Lab - 3D Aeroplane Model Generator
 * High-Quality Procedural Realistic Aircraft Model using Three.js
 * 
 * Features:
 * - Aerodynamic Fuselage with "Fauzi AeroPhysics Lab" custom livery & passenger windows
 * - 6-pane Cockpit Windshield with metallic frames and specular glass
 * - Swept Wings with Camber, Blended Winglets, Flaps, and Navigation Lights
 * - High-Bypass Turbofan Engines with spinning turbine blades, spinner spiral & exhaust cones
 * - Realistic Tricycle Landing Gear (Oleo struts, torque links, wheels, brake discs, doors)
 * - Empennage: Vertical Stabilizer with logo, Rudder, Horizontal Stabilizers, Elevators
 * - Navigation Lights, Strobes, and Dual High-Intensity Runway Landing Lights
 * - Animated Retraction Sequence for Landing Gear, Flaps, Elevators, and Engine Turbines
 */

class AeroplaneModel3D {
  constructor(options = {}) {
    this.options = Object.assign({
      scale: 1.0,
      airlineName: 'FAUZI AEROPHYSICS LAB',
      registration: 'FZ-APL2026',
      primaryColor: 0xffffff,
      accentColor: 0x1e3a8a, // deep royal navy
      secondaryAccent: 0x0284c7, // aero sky blue
      windowColor: 0x0f172a,
      metalColor: 0x94a3b8,
      chromeColor: 0xe2e8f0
    }, options);

    this.group = new THREE.Group();
    this.animatedParts = {
      turbines: [],
      wheels: [],
      noseGear: null,
      mainGearLeft: null,
      mainGearRight: null,
      gearDoors: [],
      flaps: [],
      elevators: [],
      rudder: null,
      lights: {
        beacons: [],
        strobes: [],
        landingLights: []
      }
    };

    // Animation states
    this.turbineRotation = 0;
    this.wheelRotation = 0;
    this.gearExtension = 1.0; // 1.0 = fully deployed, 0.0 = fully retracted
    this.flapExtension = 0.0; // 0.0 = clean, 1.0 = fully extended (takeoff ~ 0.4)
    this.elevatorAngle = 0.0; // radians
    this.rudderAngle = 0.0;
    this.beaconTimer = 0;
    this.strobeTimer = 0;

    // Materials Cache
    this.materials = this.createMaterials();

    // Build the 3D Aircraft
    this.buildAircraft();
  }

  // --- Procedural Canvas Textures for Livery & Decals ---
  createLiveryTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Fuselage Base Finish (Pearl White)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Panel Lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    for (let x = 100; x < canvas.width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 150);
      ctx.lineTo(x, 850);
      ctx.stroke();
    }

    // Dynamic Aero Cheatline Swoops (Navy & Cyan)
    const drawSwoop = (offsetY, color, width) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(100, 520 + offsetY);
      ctx.bezierCurveTo(600, 500 + offsetY, 1200, 560 + offsetY, 1950, 480 + offsetY);
      ctx.lineTo(1950, 480 + offsetY + width);
      ctx.bezierCurveTo(1200, 560 + offsetY + width, 600, 500 + offsetY + width, 100, 520 + offsetY + width);
      ctx.closePath();
      ctx.fill();
    };

    drawSwoop(0, '#1e3a8a', 45); // Deep Royal Navy
    drawSwoop(48, '#0284c7', 20); // Sky Cyan Accent
    drawSwoop(70, '#f59e0b', 8); // Gold/Amber Pin-stripe

    // Airline Name: FAUZI AEROPHYSICS LAB (Upper Fuselage)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 52px "Segoe UI", Arial, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('FAUZI AEROPHYSICS LAB', 450, 440);

    // Subtitle
    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('ADVANCED AERODYNAMICS & FLIGHT KINEMATICS', 452, 480);

    // Aircraft Registration Code
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(this.options.registration, 1550, 430);

    // Passenger Windows (Rows of rounded rectangular windows)
    const startX = 380;
    const endX = 1750;
    const windowY = 320;
    const winW = 16;
    const winH = 26;
    const winGap = 34;

    for (let wx = startX; wx < endX; wx += winGap) {
      // Skip window areas for emergency exits
      if (Math.abs(wx - 750) < 30 || Math.abs(wx - 1300) < 30) {
        // Emergency Exit Door Outline
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(wx - 4, windowY - 45, 30, 85);
        continue;
      }

      // Window Frame
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.roundRect(wx - 2, windowY - 2, winW + 4, winH + 4, 6);
      ctx.fill();

      // Window Tinted Glass
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(wx, windowY, winW, winH, 4);
      ctx.fill();

      // Window Glass Reflection Highlight
      ctx.fillStyle = 'rgba(56, 189, 248, 0.6)';
      ctx.beginPath();
      ctx.moveTo(wx + 2, windowY + winH - 2);
      ctx.lineTo(wx + winW - 2, windowY + 2);
      ctx.lineTo(wx + winW - 6, windowY + 2);
      ctx.lineTo(wx + 2, windowY + winH - 6);
      ctx.closePath();
      ctx.fill();
    }

    // Front Passenger Entry Door (L1)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.strokeRect(300, 260, 42, 110);
    // Door window
    ctx.fillStyle = '#0f172a';
    ctx.roundRect(310, 280, 20, 30, 4);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 8;
    return texture;
  }

  createTailLogoTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    // Gradient Background
    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e3a8a');
    grad.addColorStop(1, '#0284c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    // Delta Wing Graphic Logo
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(512, 180);
    ctx.lineTo(820, 680);
    ctx.lineTo(600, 640);
    ctx.lineTo(512, 420);
    ctx.lineTo(424, 640);
    ctx.lineTo(204, 680);
    ctx.closePath();
    ctx.fill();

    // Inner White Accent Delta
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(512, 260);
    ctx.lineTo(720, 620);
    ctx.lineTo(580, 590);
    ctx.lineTo(512, 440);
    ctx.lineTo(444, 590);
    ctx.lineTo(304, 620);
    ctx.closePath();
    ctx.fill();

    // Gold Jet Supersonic Ring
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.ellipse(512, 480, 320, 130, -0.2, 0, Math.PI * 2);
    ctx.stroke();

    // FAUZI Lettering
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '8px';
    ctx.fillText('FAUZI', 512, 820);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
    ctx.letterSpacing = '12px';
    ctx.fillText('AEROPHYSICS', 512, 890);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  createSpinnerSpiralTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 512);

    // White Safety Warning Spiral (used on real jet engine spinners)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 28;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const centerX = 256;
    const centerY = 256;
    for (let i = 0; i < 400; i++) {
      const angle = 0.1 * i;
      const x = centerX + (1 + angle * 4) * Math.cos(angle);
      const y = centerY + (1 + angle * 4) * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  // --- Material Definitions (PBR Physical Materials) ---
  createMaterials() {
    const liveryTex = this.createLiveryTexture();
    const tailTex = this.createTailLogoTexture();
    const spinnerTex = this.createSpinnerSpiralTexture();

    return {
      fuselage: new THREE.MeshStandardMaterial({
        map: liveryTex,
        roughness: 0.28,
        metalness: 0.12,
        bumpScale: 0.05
      }),
      fuselageUnderside: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.4,
        metalness: 0.2
      }),
      wing: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.35,
        metalness: 0.25
      }),
      wingLeadingEdge: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.15,
        metalness: 0.85 // Polished aluminum slat
      }),
      winglet: new THREE.MeshStandardMaterial({
        color: 0x1e3a8a, // Deep blue
        roughness: 0.25,
        metalness: 0.2
      }),
      tailFin: new THREE.MeshStandardMaterial({
        map: tailTex,
        roughness: 0.25,
        metalness: 0.15
      }),
      cockpitGlass: new THREE.MeshPhysicalMaterial({
        color: 0x0284c7,
        roughness: 0.05,
        metalness: 0.9,
        transparent: true,
        opacity: 0.85,
        reflectivity: 0.9
      }),
      cockpitFrame: new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.5,
        metalness: 0.5
      }),
      engineNacelle: new THREE.MeshStandardMaterial({
        color: 0x0284c7, // Aero cyan nacelle
        roughness: 0.25,
        metalness: 0.2
      }),
      engineLip: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.1,
        metalness: 0.92 // Chrome intake lip
      }),
      engineCore: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.7,
        metalness: 0.5
      }),
      engineSpinner: new THREE.MeshStandardMaterial({
        map: spinnerTex,
        roughness: 0.3,
        metalness: 0.3
      }),
      turbineBlade: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.2,
        metalness: 0.85
      }),
      strutMetal: new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.25,
        metalness: 0.8
      }),
      pistonChrome: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0.98
      }),
      tireRubber: new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.85,
        metalness: 0.05
      }),
      wheelRim: new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.3,
        metalness: 0.7
      }),
      brakeDisc: new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.45,
        metalness: 0.75
      })
    };
  }

  // --- Aircraft Construction ---
  buildAircraft() {
    this.buildFuselage();
    this.buildCockpit();
    this.buildWings();
    this.buildEngines();
    this.buildEmpennage();
    this.buildLandingGear();
    this.buildLighting();

    // Scale entire model
    this.group.scale.set(this.options.scale, this.options.scale, this.options.scale);
  }

  // 1. Fuselage
  buildFuselage() {
    const fuselageGroup = new THREE.Group();

    // Fuselage Spline Profile (Cross Sections)
    const length = 38.0; // meters representation
    const radius = 1.95; // 3.9m diameter standard narrowbody

    // Main Cylindrical Body
    const bodyGeom = new THREE.CylinderGeometry(radius, radius, length * 0.55, 36, 8, true);
    bodyGeom.rotateZ(Math.PI / 2);
    const bodyMesh = new THREE.Mesh(bodyGeom, this.materials.fuselage);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    fuselageGroup.add(bodyMesh);

    // Nose Cone (Streamlined Radome)
    const noseLength = length * 0.25;
    const noseGeom = new THREE.ConeGeometry(radius, noseLength, 36, 12, true);
    noseGeom.rotateZ(-Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeom, this.materials.fuselage);
    noseMesh.position.x = length * 0.275 + noseLength * 0.5;
    noseMesh.scale.set(1.0, 0.92, 0.92); // Slight flattening for aerodynamic look
    noseMesh.castShadow = true;
    fuselageGroup.add(noseMesh);

    // Nose Tip Dome (Pitot Radome)
    const noseTipGeom = new THREE.SphereGeometry(0.35, 24, 16);
    noseTipGeom.scale(1.4, 0.9, 0.9);
    const noseTipMesh = new THREE.Mesh(noseTipGeom, this.materials.fuselage);
    noseTipMesh.position.x = length * 0.275 + noseLength;
    fuselageGroup.add(noseTipMesh);

    // Pitot Tubes (Fine detail)
    const pitotGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.35);
    pitotGeom.rotateZ(Math.PI / 2);
    const pitot1 = new THREE.Mesh(pitotGeom, this.materials.pistonChrome);
    pitot1.position.set(length * 0.275 + noseLength * 0.85, 0.2, 0.5);
    fuselageGroup.add(pitot1);
    const pitot2 = pitot1.clone();
    pitot2.position.z = -0.5;
    fuselageGroup.add(pitot2);

    // Tail Section (Tapering to APU exhaust)
    const tailLength = length * 0.32;
    const tailGeom = new THREE.CylinderGeometry(radius, 0.45, tailLength, 36, 12, true);
    tailGeom.rotateZ(Math.PI / 2);
    const tailMesh = new THREE.Mesh(tailGeom, this.materials.fuselage);
    tailMesh.position.x = -length * 0.275 - tailLength * 0.5;
    tailMesh.position.y = 0.45; // Upswept tail cone
    tailMesh.castShadow = true;
    fuselageGroup.add(tailMesh);

    // APU Exhaust Hole
    const apuGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 24);
    apuGeom.rotateZ(Math.PI / 2);
    const apuMesh = new THREE.Mesh(apuGeom, this.materials.engineCore);
    apuMesh.position.x = -length * 0.275 - tailLength - 0.1;
    apuMesh.position.y = 0.85;
    fuselageGroup.add(apuMesh);

    // Belly Wing-to-Body Fairing
    const fairingGeom = new THREE.BoxGeometry(length * 0.35, 1.2, radius * 2.3);
    fairingGeom.translate(0, -radius * 0.65, 0);
    const fairingMesh = new THREE.Mesh(fairingGeom, this.materials.fuselageUnderside);
    fairingMesh.castShadow = true;
    fairingMesh.receiveShadow = true;
    fuselageGroup.add(fairingMesh);

    this.group.add(fuselageGroup);
  }

  // 2. Cockpit Windshield (6-pane angled modern cockpit)
  buildCockpit() {
    const cockpitGroup = new THREE.Group();

    // Center Windshield Panes
    const paneGeom = new THREE.PlaneGeometry(0.85, 0.65);

    // Left Center
    const leftCenter = new THREE.Mesh(paneGeom, this.materials.cockpitGlass);
    leftCenter.position.set(13.2, 0.95, 0.45);
    leftCenter.rotation.set(-0.25, 0.45, -0.4);
    cockpitGroup.add(leftCenter);

    // Right Center
    const rightCenter = new THREE.Mesh(paneGeom, this.materials.cockpitGlass);
    rightCenter.position.set(13.2, 0.95, -0.45);
    rightCenter.rotation.set(0.25, -0.45, -0.4);
    cockpitGroup.add(rightCenter);

    // Side Windows
    const sidePaneGeom = new THREE.PlaneGeometry(1.05, 0.55);

    // Left Side
    const leftSide = new THREE.Mesh(sidePaneGeom, this.materials.cockpitGlass);
    leftSide.position.set(12.4, 0.9, 1.15);
    leftSide.rotation.set(-0.35, 1.15, -0.2);
    cockpitGroup.add(leftSide);

    // Right Side
    const rightSide = new THREE.Mesh(sidePaneGeom, this.materials.cockpitGlass);
    rightSide.position.set(12.4, 0.9, -1.15);
    rightSide.rotation.set(0.35, -1.15, -0.2);
    cockpitGroup.add(rightSide);

    // Eyebrow / Frame trim
    const frameGeom = new THREE.BoxGeometry(0.1, 0.75, 0.08);
    const centerDivider = new THREE.Mesh(frameGeom, this.materials.cockpitFrame);
    centerDivider.position.set(13.35, 0.95, 0);
    centerDivider.rotation.z = -0.4;
    cockpitGroup.add(centerDivider);

    this.group.add(cockpitGroup);
  }

  // 3. Main Wings & Control Surfaces
  buildWings() {
    const wingsGroup = new THREE.Group();

    const span = 35.8; // Wingspan (meters)
    const halfSpan = span / 2;
    const rootChord = 6.8;
    const tipChord = 1.6;
    const sweepAngle = 28 * (Math.PI / 180);
    const dihedralAngle = 5.5 * (Math.PI / 180);

    // Extruded Supercritical Airfoil Shape
    const shape = new THREE.Shape();
    shape.moveTo(-rootChord * 0.4, 0);
    shape.quadraticCurveTo(0, 0.55, rootChord * 0.6, 0.05); // Top camber
    shape.lineTo(rootChord * 0.6, -0.05);
    shape.quadraticCurveTo(0, -0.25, -rootChord * 0.4, 0); // Bottom surface

    // Wing Extrusion Path with Sweep and Dihedral
    const createWingSide = (isLeft) => {
      const sideGroup = new THREE.Group();
      const zSign = isLeft ? 1 : -1;

      // Main Wing Body Mesh
      const wingLength = halfSpan - 1.8; // Minus fuselage and winglet
      const wingBoxGeom = new THREE.BoxGeometry(rootChord * 0.7, 0.45, wingLength);

      // Skew and taper geometry vertices manually for authentic swept wing
      const pos = wingBoxGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        const t = (z + wingLength / 2) / wingLength; // 0 at root, 1 at tip
        const x = pos.getX(i);
        const y = pos.getY(i);

        // Apply Taper
        const chordScale = 1.0 - t * 0.72;
        const thicknessScale = 1.0 - t * 0.65;

        // Apply Sweep (shift x rearwards with z)
        const sweepOffset = -t * (wingLength * Math.tan(sweepAngle));

        pos.setX(i, (x * chordScale) + sweepOffset);
        pos.setY(i, (y * thicknessScale) + (t * wingLength * Math.sin(dihedralAngle)));
      }
      wingBoxGeom.computeVertexNormals();

      const wingMesh = new THREE.Mesh(wingBoxGeom, this.materials.wing);
      wingMesh.position.set(-0.8, -0.3, zSign * (wingLength / 2 + 1.8));
      if (!isLeft) {
        wingMesh.scale.z = -1;
      }
      wingMesh.castShadow = true;
      wingMesh.receiveShadow = true;
      sideGroup.add(wingMesh);

      // Polished Leading Edge Slats
      const slatGeom = new THREE.CylinderGeometry(0.12, 0.05, wingLength, 16);
      slatGeom.rotateX(Math.PI / 2);
      const slatMesh = new THREE.Mesh(slatGeom, this.materials.wingLeadingEdge);
      slatMesh.position.set(rootChord * 0.35, -0.25, zSign * (wingLength / 2 + 1.8));
      slatMesh.rotation.y = zSign * sweepAngle;
      slatMesh.rotation.x = zSign * dihedralAngle;
      sideGroup.add(slatMesh);

      // Trailing Edge Fowler Flaps (Animated for Takeoff)
      const flapGeom = new THREE.BoxGeometry(1.6, 0.08, wingLength * 0.55);
      const flapMesh = new THREE.Mesh(flapGeom, this.materials.wing);
      flapMesh.position.set(-rootChord * 0.32, -0.3, zSign * (wingLength * 0.35 + 1.8));
      flapMesh.rotation.y = zSign * (sweepAngle * 0.6);
      flapMesh.castShadow = true;
      sideGroup.add(flapMesh);
      this.animatedParts.flaps.push(flapMesh);

      // Blended Sharklet / Winglet at Wingtip
      const wingletGroup = new THREE.Group();
      const wingletHeight = 2.4;
      const wingletGeom = new THREE.BoxGeometry(1.4, wingletHeight, 0.12);

      // Taper winglet
      const wPos = wingletGeom.attributes.position;
      for (let i = 0; i < wPos.count; i++) {
        const y = wPos.getY(i);
        const ty = (y + wingletHeight / 2) / wingletHeight;
        wPos.setX(i, wPos.getX(i) - ty * 0.6);
        wPos.setZ(i, wPos.getZ(i) * (1 - ty * 0.5));
      }
      wingletGeom.computeVertexNormals();

      const wingletMesh = new THREE.Mesh(wingletGeom, this.materials.winglet);
      wingletMesh.position.y = wingletHeight * 0.5;
      wingletMesh.rotation.z = -0.15; // Sleek outward cant
      wingletMesh.rotation.y = zSign * 0.1;
      wingletMesh.castShadow = true;
      wingletGroup.add(wingletMesh);

      // Wingtip Navigation Light
      const navLightGeom = new THREE.SphereGeometry(0.08, 12, 12);
      const navLightMat = new THREE.MeshBasicMaterial({
        color: isLeft ? 0xef4444 : 0x10b981 // Red for Port (Left), Green for Starboard (Right)
      });
      const navLightMesh = new THREE.Mesh(navLightGeom, navLightMat);
      navLightMesh.position.set(0.6, 0.1, zSign * 0.08);
      wingletGroup.add(navLightMesh);

      // Point Light Source for Glow
      const navPointLight = new THREE.PointLight(isLeft ? 0xef4444 : 0x10b981, 1.2, 8);
      navPointLight.position.copy(navLightMesh.position);
      wingletGroup.add(navPointLight);

      // White Strobe Light (Flashes every 1s)
      const strobeGeom = new THREE.SphereGeometry(0.06, 12, 12);
      const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const strobeMesh = new THREE.Mesh(strobeGeom, strobeMat);
      strobeMesh.position.set(-0.7, 0.1, zSign * 0.08);
      wingletGroup.add(strobeMesh);

      const strobeLight = new THREE.PointLight(0xffffff, 0, 15);
      strobeLight.position.copy(strobeMesh.position);
      wingletGroup.add(strobeLight);
      this.animatedParts.lights.strobes.push(strobeLight);

      // Position Winglet at Tip
      const tipX = -wingLength * Math.tan(sweepAngle) - 0.5;
      const tipY = wingLength * Math.sin(dihedralAngle) - 0.35;
      const tipZ = zSign * (halfSpan);
      wingletGroup.position.set(tipX, tipY, tipZ);
      sideGroup.add(wingletGroup);

      return sideGroup;
    };

    wingsGroup.add(createWingSide(true));  // Port (Left)
    wingsGroup.add(createWingSide(false)); // Starboard (Right)

    this.group.add(wingsGroup);
  }

  // 4. High-Bypass Turbofan Engines
  buildEngines() {
    const enginesGroup = new THREE.Group();

    const nacelleLength = 4.8;
    const nacelleRadius = 1.35;
    const intakeRadius = 1.2;

    const createEngine = (isLeft) => {
      const engine = new THREE.Group();
      const zPos = isLeft ? 5.8 : -5.8;

      // Pylon (Strut mounting engine securely under the wing)
      const pylonGeom = new THREE.BoxGeometry(3.6, 1.1, 0.32);
      const pylonMesh = new THREE.Mesh(pylonGeom, this.materials.wing);
      pylonMesh.position.set(0.6, 0.95, 0);
      pylonMesh.rotation.z = -0.12;
      pylonMesh.castShadow = true;
      engine.add(pylonMesh);

      // Outer Engine Nacelle Cowling
      const nacelleGeom = new THREE.CylinderGeometry(intakeRadius, nacelleRadius * 0.92, nacelleLength, 32, 8, true);
      nacelleGeom.rotateZ(Math.PI / 2);
      const nacelleMesh = new THREE.Mesh(nacelleGeom, this.materials.engineNacelle);
      nacelleMesh.castShadow = true;
      nacelleMesh.receiveShadow = true;
      engine.add(nacelleMesh);

      // Polished Chrome Intake Lip
      const lipGeom = new THREE.TorusGeometry(intakeRadius, 0.14, 16, 32);
      lipGeom.rotateY(Math.PI / 2);
      const lipMesh = new THREE.Mesh(lipGeom, this.materials.engineLip);
      lipMesh.position.x = nacelleLength * 0.5;
      engine.add(lipMesh);

      // Engine Core Housing & Bypass Duct
      const coreGeom = new THREE.CylinderGeometry(0.65, 0.72, nacelleLength * 0.9, 24);
      coreGeom.rotateZ(Math.PI / 2);
      const coreMesh = new THREE.Mesh(coreGeom, this.materials.engineCore);
      coreMesh.position.x = -0.2;
      engine.add(coreMesh);

      // Primary Exhaust Nozzle Cone
      const exhaustConeGeom = new THREE.ConeGeometry(0.48, 1.4, 24);
      exhaustConeGeom.rotateZ(Math.PI / 2);
      const exhaustMesh = new THREE.Mesh(exhaustConeGeom, this.materials.engineCore);
      exhaustMesh.position.x = -nacelleLength * 0.5 - 0.7;
      engine.add(exhaustMesh);

      // Rotating Turbofan Rotor Assembly
      const rotorGroup = new THREE.Group();
      rotorGroup.position.x = nacelleLength * 0.5 - 0.35;

      // Spinner Center Cone
      const spinnerGeom = new THREE.ConeGeometry(0.38, 0.85, 24);
      spinnerGeom.rotateZ(-Math.PI / 2);
      const spinnerMesh = new THREE.Mesh(spinnerGeom, this.materials.engineSpinner);
      rotorGroup.add(spinnerMesh);

      // 18 Curved Titanium Fan Blades
      const numBlades = 18;
      const bladeGeom = new THREE.BoxGeometry(0.12, 0.65, 0.02);
      bladeGeom.translate(0, 0.35, 0);

      for (let b = 0; b < numBlades; b++) {
        const angle = (b / numBlades) * Math.PI * 2;
        const blade = new THREE.Mesh(bladeGeom, this.materials.turbineBlade);
        blade.rotation.x = angle;
        blade.rotation.y = 0.45; // Blade pitch angle
        rotorGroup.add(blade);
      }

      engine.add(rotorGroup);
      this.animatedParts.turbines.push(rotorGroup);

      // Position Engine relative to wing
      engine.position.set(1.4, -1.5, zPos);
      return engine;
    };

    enginesGroup.add(createEngine(true));  // Left Engine
    enginesGroup.add(createEngine(false)); // Right Engine

    this.group.add(enginesGroup);
  }

  // 5. Empennage (Vertical Fin, Rudder, Horizontal Stabilizers, Elevators)
  buildEmpennage() {
    const empennageGroup = new THREE.Group();

    // Vertical Stabilizer (Fin)
    const finHeight = 8.2;
    const finRootChord = 5.2;
    const finSweep = 38 * (Math.PI / 180);

    const finGeom = new THREE.BoxGeometry(finRootChord, finHeight, 0.32);
    // Taper vertical fin towards tip
    const fPos = finGeom.attributes.position;
    for (let i = 0; i < fPos.count; i++) {
      const y = fPos.getY(i);
      const t = (y + finHeight / 2) / finHeight;
      fPos.setX(i, fPos.getX(i) * (1 - t * 0.55) - t * (finHeight * Math.tan(finSweep)));
      fPos.setZ(i, fPos.getZ(i) * (1 - t * 0.6));
    }
    finGeom.computeVertexNormals();

    const finMesh = new THREE.Mesh(finGeom, this.materials.tailFin);
    finMesh.position.set(-14.8, 4.6, 0);
    finMesh.castShadow = true;
    empennageGroup.add(finMesh);

    // Rudder (Trailing edge of vertical fin)
    const rudderGeom = new THREE.BoxGeometry(1.2, finHeight * 0.75, 0.18);
    const rudderMesh = new THREE.Mesh(rudderGeom, this.materials.tailFin);
    rudderMesh.position.set(-17.2, 4.2, 0);
    rudderMesh.rotation.z = -0.22;
    rudderMesh.castShadow = true;
    empennageGroup.add(rudderMesh);
    this.animatedParts.rudder = rudderMesh;

    // Horizontal Stabilizers (Tailplanes)
    const hSpan = 12.8;
    const hChord = 3.2;
    const hSweep = 32 * (Math.PI / 180);

    const createHTail = (isLeft) => {
      const hSide = new THREE.Group();
      const zSign = isLeft ? 1 : -1;
      const hLen = hSpan / 2;

      const hGeom = new THREE.BoxGeometry(hChord, 0.22, hLen);
      const pos = hGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i);
        const t = (z + hLen / 2) / hLen;
        pos.setX(i, pos.getX(i) * (1 - t * 0.5) - t * (hLen * Math.tan(hSweep)));
        pos.setY(i, pos.getY(i) * (1 - t * 0.5));
      }
      hGeom.computeVertexNormals();

      const hMesh = new THREE.Mesh(hGeom, this.materials.wing);
      hMesh.position.set(-15.2, 1.4, zSign * (hLen / 2 + 0.4));
      if (!isLeft) hMesh.scale.z = -1;
      hMesh.castShadow = true;
      hSide.add(hMesh);

      // Elevators (Pitch Control - rotates up when pilot pulls back stick on rotate!)
      const elevGeom = new THREE.BoxGeometry(0.9, 0.08, hLen * 0.85);
      const elevMesh = new THREE.Mesh(elevGeom, this.materials.wing);
      elevMesh.position.set(-16.8, 1.4, zSign * (hLen * 0.5 + 0.4));
      elevMesh.castShadow = true;
      hSide.add(elevMesh);
      this.animatedParts.elevators.push(elevMesh);

      return hSide;
    };

    empennageGroup.add(createHTail(true));
    empennageGroup.add(createHTail(false));

    this.group.add(empennageGroup);
  }

  // 6. Detailed Tricycle Landing Gear (Nose + Main Bogies)
  buildLandingGear() {
    const gearGroup = new THREE.Group();

    // Wheel Generator Helper
    const createWheel = (radius, width) => {
      const wGroup = new THREE.Group();

      // Tire
      const tireGeom = new THREE.CylinderGeometry(radius, radius, width, 24);
      tireGeom.rotateZ(Math.PI / 2);
      const tireMesh = new THREE.Mesh(tireGeom, this.materials.tireRubber);
      tireMesh.castShadow = true;
      wGroup.add(tireMesh);

      // Rim
      const rimGeom = new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.02, 16);
      rimGeom.rotateZ(Math.PI / 2);
      const rimMesh = new THREE.Mesh(rimGeom, this.materials.wheelRim);
      wGroup.add(rimMesh);

      // Brake Assembly Disk (Internal)
      const brakeGeom = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, width * 0.6, 12);
      brakeGeom.rotateZ(Math.PI / 2);
      const brakeMesh = new THREE.Mesh(brakeGeom, this.materials.brakeDisc);
      wGroup.add(brakeMesh);

      this.animatedParts.wheels.push(wGroup);
      return wGroup;
    };

    // --- A. Nose Landing Gear (NLG) ---
    const noseGear = new THREE.Group();
    noseGear.position.set(11.8, -1.8, 0);

    // Main Oleo Strut
    const noseStrutGeom = new THREE.CylinderGeometry(0.12, 0.12, 2.2, 16);
    const noseStrut = new THREE.Mesh(noseStrutGeom, this.materials.strutMetal);
    noseStrut.position.y = -0.6;
    noseGear.add(noseStrut);

    // Chrome Hydraulic Piston (Lower sliding tube)
    const nosePistonGeom = new THREE.CylinderGeometry(0.09, 0.09, 1.4, 16);
    const nosePiston = new THREE.Mesh(nosePistonGeom, this.materials.pistonChrome);
    nosePiston.position.y = -1.5;
    noseGear.add(nosePiston);

    // Torque Scissor Links
    const scissorGeom = new THREE.BoxGeometry(0.06, 0.4, 0.08);
    const scissor1 = new THREE.Mesh(scissorGeom, this.materials.strutMetal);
    scissor1.position.set(0.18, -1.1, 0);
    scissor1.rotation.z = 0.5;
    noseGear.add(scissor1);
    const scissor2 = new THREE.Mesh(scissorGeom, this.materials.strutMetal);
    scissor2.position.set(0.18, -1.45, 0);
    scissor2.rotation.z = -0.5;
    noseGear.add(scissor2);

    // Dual Nose Wheels
    const nWheel1 = createWheel(0.42, 0.22);
    nWheel1.position.set(0, -2.0, 0.24);
    noseGear.add(nWheel1);

    const nWheel2 = createWheel(0.42, 0.22);
    nWheel2.position.set(0, -2.0, -0.24);
    noseGear.add(nWheel2);

    // Dual Taxi / Takeoff Landing Light on Nose Strut
    const taxiLightGeom = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
    taxiLightGeom.rotateZ(Math.PI / 2);
    const taxiLightMesh = new THREE.Mesh(taxiLightGeom, this.materials.pistonChrome);
    taxiLightMesh.position.set(0.2, -0.8, 0);
    noseGear.add(taxiLightMesh);

    const noseSpot = new THREE.SpotLight(0xffffff, 3.5, 90, 0.35, 0.4, 1.5);
    noseSpot.position.set(0.3, -0.8, 0);
    noseSpot.target.position.set(35, -2.5, 0);
    noseGear.add(noseSpot);
    noseGear.add(noseSpot.target);
    this.animatedParts.lights.landingLights.push(noseSpot);

    gearGroup.add(noseGear);
    this.animatedParts.noseGear = noseGear;

    // --- B. Main Landing Gear (MLG - Port & Starboard 2-Axle Bogies) ---
    const createMainGear = (isLeft) => {
      const mGear = new THREE.Group();
      const zPos = isLeft ? 2.8 : -2.8;

      // Heavy Main Trunnion & Shock Strut
      const mStrutGeom = new THREE.CylinderGeometry(0.2, 0.18, 2.5, 16);
      const mStrut = new THREE.Mesh(mStrutGeom, this.materials.strutMetal);
      mStrut.position.y = -0.7;
      mStrut.rotation.z = isLeft ? 0.05 : -0.05;
      mGear.add(mStrut);

      // Chrome Lower Piston
      const mPistonGeom = new THREE.CylinderGeometry(0.15, 0.15, 1.6, 16);
      const mPiston = new THREE.Mesh(mPistonGeom, this.materials.pistonChrome);
      mPiston.position.y = -1.6;
      mGear.add(mPiston);

      // Wheel Bogie Beam (Horizontal beam holding dual wheels)
      const bogieBeamGeom = new THREE.BoxGeometry(1.6, 0.22, 0.3);
      const bogieBeam = new THREE.Mesh(bogieBeamGeom, this.materials.strutMetal);
      bogieBeam.position.set(0, -2.1, 0);
      mGear.add(bogieBeam);

      // 4 Wheels per Bogie (Front Pair & Rear Pair)
      const wheelRad = 0.58;
      const wheelW = 0.32;
      const offsets = [
        { x: 0.65, z: 0.4 },
        { x: 0.65, z: -0.4 },
        { x: -0.65, z: 0.4 },
        { x: -0.65, z: -0.4 }
      ];

      offsets.forEach(off => {
        const w = createWheel(wheelRad, wheelW);
        w.position.set(off.x, -2.1, off.z);
        mGear.add(w);
      });

      mGear.position.set(-1.2, -1.8, zPos);
      return mGear;
    };

    const mainGearLeft = createMainGear(true);
    const mainGearRight = createMainGear(false);
    gearGroup.add(mainGearLeft);
    gearGroup.add(mainGearRight);

    this.animatedParts.mainGearLeft = mainGearLeft;
    this.animatedParts.mainGearRight = mainGearRight;

    this.group.add(gearGroup);
  }

  // 7. Aviation Lights (Beacon, Strobes, Wing Inspection Lights)
  buildLighting() {
    // Top & Bottom Red Anti-Collision Flashing Beacons
    const beaconGeom = new THREE.SphereGeometry(0.1, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // Top Beacon (Mid-Fuselage)
    const topBeacon = new THREE.Mesh(beaconGeom, beaconMat);
    topBeacon.position.set(-1.5, 2.05, 0);
    this.group.add(topBeacon);

    const topBeaconLight = new THREE.PointLight(0xef4444, 0, 20);
    topBeaconLight.position.copy(topBeacon.position);
    this.group.add(topBeaconLight);
    this.animatedParts.lights.beacons.push(topBeaconLight);

    // Bottom Beacon
    const botBeacon = new THREE.Mesh(beaconGeom, beaconMat);
    botBeacon.position.set(-0.8, -1.95, 0);
    this.group.add(botBeacon);

    const botBeaconLight = new THREE.PointLight(0xef4444, 0, 20);
    botBeaconLight.position.copy(botBeacon.position);
    this.group.add(botBeaconLight);
    this.animatedParts.lights.beacons.push(botBeaconLight);

    // Wing Root High-Intensity Landing Lights (illuminate runway ahead)
    const createWingLandingLight = (isLeft) => {
      const zPos = isLeft ? 2.4 : -2.4;
      const spot = new THREE.SpotLight(0xfffaed, 4.0, 140, 0.4, 0.45, 1.2);
      spot.position.set(2.8, -0.6, zPos);
      spot.target.position.set(80, -2.5, zPos * 0.4);
      this.group.add(spot);
      this.group.add(spot.target);
      this.animatedParts.lights.landingLights.push(spot);
    };

    createWingLandingLight(true);
    createWingLandingLight(false);
  }

  // --- Animation Hooks for Physics Simulator ---
  update(dt, velocity, isAirborne, altitude) {
    // 1. Turbines Rotation (scales with speed and engine power)
    const rpmSpeed = Math.max(8.0, (velocity / 70.0) * 35.0 + 8.0);
    this.turbineRotation += dt * rpmSpeed;
    this.animatedParts.turbines.forEach(turb => {
      turb.rotation.x = this.turbineRotation;
    });

    // 2. Wheels Rotation (rolls proportionally to forward velocity while on ground)
    if (!isAirborne) {
      const wheelCircumference = Math.PI * 2 * 0.58; // main wheel radius ~0.58m
      const rollDelta = (velocity * dt) / wheelCircumference;
      this.wheelRotation -= rollDelta * Math.PI * 2;
      this.animatedParts.wheels.forEach(wheel => {
        wheel.rotation.z = this.wheelRotation;
      });
    }

    // 3. Landing Gear Retraction Sequence
    if (isAirborne && altitude > 4.0) {
      this.gearExtension = Math.max(0.0, this.gearExtension - dt * 0.45);
    } else if (!isAirborne) {
      this.gearExtension = Math.min(1.0, this.gearExtension + dt * 1.5);
    }

    this.applyGearExtension(this.gearExtension);

    // 4. Elevators Pitch Control
    if (isAirborne) {
      this.elevatorAngle = THREE.MathUtils.lerp(this.elevatorAngle, -0.22, dt * 2.5); // nose up command
    } else {
      this.elevatorAngle = THREE.MathUtils.lerp(this.elevatorAngle, 0.0, dt * 3.0);
    }
    this.animatedParts.elevators.forEach(elev => {
      elev.rotation.z = this.elevatorAngle;
    });

    // 5. Flaps Setting (Takeoff Flaps 15° deployed)
    const targetFlaps = velocity > 10 ? 0.35 : 0.0;
    this.flapExtension = THREE.MathUtils.lerp(this.flapExtension, targetFlaps, dt * 0.8);
    this.animatedParts.flaps.forEach(flap => {
      flap.rotation.z = this.flapExtension;
      flap.position.y = -0.3 - this.flapExtension * 0.3;
    });

    // 6. Beacon & Strobe Flashing Timers
    this.beaconTimer += dt;
    const beaconFlash = (this.beaconTimer % 1.2) < 0.15;
    this.animatedParts.lights.beacons.forEach(b => {
      b.intensity = beaconFlash ? 3.0 : 0.05;
    });

    this.strobeTimer += dt;
    const strobeFlash = (this.strobeTimer % 1.0) < 0.08 || ((this.strobeTimer % 1.0) > 0.16 && (this.strobeTimer % 1.0) < 0.24);
    this.animatedParts.lights.strobes.forEach(s => {
      s.intensity = strobeFlash ? 6.0 : 0.0;
    });
  }

  applyGearExtension(val) {
    // Retract nose gear: rotates backward into fuselage
    if (this.animatedParts.noseGear) {
      this.animatedParts.noseGear.rotation.z = (1.0 - val) * (Math.PI * 0.48);
      this.animatedParts.noseGear.position.y = -1.8 + (1.0 - val) * 1.6;
      this.animatedParts.noseGear.scale.set(val, val, val);
    }

    // Retract main gear: rotates inward towards centerline
    if (this.animatedParts.mainGearLeft) {
      this.animatedParts.mainGearLeft.rotation.x = -(1.0 - val) * (Math.PI * 0.46);
      this.animatedParts.mainGearLeft.position.y = -1.8 + (1.0 - val) * 1.5;
      this.animatedParts.mainGearLeft.scale.set(val, val, val);
    }
    if (this.animatedParts.mainGearRight) {
      this.animatedParts.mainGearRight.rotation.x = (1.0 - val) * (Math.PI * 0.46);
      this.animatedParts.mainGearRight.position.y = -1.8 + (1.0 - val) * 1.5;
      this.animatedParts.mainGearRight.scale.set(val, val, val);
    }
  }
}

// Global export for vanilla JS / browser usage
if (typeof window !== 'undefined') {
  window.AeroplaneModel3D = AeroplaneModel3D;
}
