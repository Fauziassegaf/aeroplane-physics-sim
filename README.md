# ✈️ Fauzi AeroPhysics Lab – Aircraft Take-Off Simulation & 3D Model

A professional, high-fidelity 3D interactive physics simulation modeling an aeroplane accelerating along a runway from rest ($u = 0\text{ m/s}$) until reaching rotation speed ($v_r$), powered by the **Equations of Uniformly Accelerated Motion (SUVAT Kinematics)**.

---

## 🛩️ High-Quality 3D Aeroplane Model

Designed specifically for the **Fauzi AeroPhysics Lab** with custom registration **FZ-APL2026**:

### 1. Aerodynamic Fuselage
- Contoured aerodynamic radome nose with pitot tubes and angle-of-attack sensors.
- Modern 6-pane angled cockpit windscreen with specular reflections and metallic framing.
- Detailed passenger cabin windows with emergency exit doors and boarding doors (L1/R1).
- Pearl white fuselage finish with dynamic royal navy and cyan aero cheatline swoops.
- High-resolution custom livery: **FAUZI AEROPHYSICS LAB – ADVANCED AERODYNAMICS & FLIGHT KINEMATICS**.
- Upswept tail cone with APU (Auxiliary Power Unit) exhaust nozzle.

### 2. High-Performance Swept Wings
- Supercritical airfoil camber with polished aluminum leading-edge slats.
- $28^\circ$ sweep angle and $+5.5^\circ$ dihedral angle.
- Blended Sharklets / Winglets at both wingtips.
- Deployable double-slotted Fowler Flaps (animated for takeoff roll).
- Colored aviation navigation lights: Red (Port/Left), Green (Starboard/Right), White strobes.

### 3. High-Bypass Turbofan Engines
- Aerodynamic cyan engine nacelles mounted on reinforced underwing pylons.
- Polished chrome / titanium intake lip.
- 18 curved titanium turbine fan blades spinning in real time with engine power.
- Spinner cone with high-contrast safety warning spiral.
- Exhaust core and thrust nozzle.

### 4. Heavy-Duty Tricycle Landing Gear
- **Nose Landing Gear (NLG)**: Oleo-pneumatic shock strut, chrome hydraulic piston, torque scissor links, dual nose wheels, and steerable high-intensity LED taxi/landing lights.
- **Main Landing Gear (MLG)**: Twin heavy-duty 4-wheel bogies, multi-disc ventilated brake assemblies, and hydraulic retraction actuators.
- **Animated Retraction Sequence**: Retracts smoothly into the fuselage wheel wells after liftoff ($t > t_{\text{takeoff}}$)!

### 5. Empennage (Tail Assembly)
- Swept vertical fin with stylized Fauzi AeroPhysics delta crest logo.
- Functional rudder.
- Swept horizontal tailplanes with functional elevators that pitch up upon reaching rotation speed $V_r$.

---

## 🎮 How to Use

### 1. Launch the 3D Take-off Simulation
Open `index.html` in any browser, or run via PowerShell:
```powershell
Start-Process "C:\Users\Windows\.gemini\antigravity\scratch\aeroplane-physics-sim\index.html"
```
- Toggle between **🎮 3D View** and **📐 2D HUD**.
- Choose 3D Camera Angles:
  - **🎥 Chase**: Cinematic third-person tracking camera
  - **👨‍✈️ Cockpit**: Pilot POV looking down the runway centerline
  - **🗼 Tower**: Stationary control tower camera watching the plane roar past
  - **🪽 Wing**: Wing & engine perspective

### 2. Open the 3D Aircraft Model Viewer & Inspector
Open `aircraft_model_viewer.html`, or run via PowerShell:
```powershell
Start-Process "C:\Users\Windows\.gemini\antigravity\scratch\aeroplane-physics-sim\aircraft_model_viewer.html"
```
- **360° Orbit Controls**: Left-click and drag to rotate, right-click to pan, scroll wheel to zoom.
- **Camera Presets**: 3/4 Studio, Cockpit Close-up, Wing & Engine, Landing Gear, Tail, Front, Top View.
- **Interactive Animations**: Turbine Spool slider, Landing Gear Retract/Deploy, Flaps extension, Pitch control, and Turntable auto-rotation.
- **Wireframe Mode**: Inspect underlying 3D polygonal geometry.
- **Export to GLTF**: Download `Fauzi_AeroPhysics_Aircraft_3D.gltf` for use in Blender, Unity, Unreal Engine, or 3D printing!

---

## 📚 Physics Core & SUVAT Equations

$$v = u + at \implies t = \frac{v}{a} \quad (\text{since } u = 0)$$
$$s = ut + \frac{1}{2}at^2 \implies s = \frac{1}{2}at^2$$
$$v^2 = u^2 + 2as \implies s = \frac{v^2}{2a}$$
---

## 🚀 Advanced Flight Mechanics & 10-Cycle Automated Repetition

### 1. Longer & Higher Flight Path (Realistic Gradual Climb)
- **Extended Climb Envelope**: Following rotation at $V_r$, the aeroplane transitions smoothly from ground roll through a $2.5\text{s}$ rotation flare ($\Delta \theta \to 13^\circ$, flight path $\gamma \to 9^\circ$) into a sustained, gradual climbout for $22.0\text{s}$.
- **Substantial Altitude & Range**:
  - Horizontal distance traveled extends beyond $3.0\text{ km}$ to $4.5\text{ km}$ ($3,000\text{m} - 4,500\text{m}$).
  - Altitude achieved reaches $250\text{m} - 350\text{m}$ ($820\text{ft} - 1,150\text{ft}$ AGL) at an authentic climb rate of $\approx 12.3\text{ m/s}$ ($2,400\text{ fpm}$).
- **Clear & Simple Sky Background**: All clouds have been removed from the sky, leaving a crisp, unobstructed atmospheric vista that makes observing the aircraft's horizontal distance ($s_x$) and altitude ($h$) effortless.
- **Realistic Airport Facilities Along Runway**:
  - **Modern Passenger Terminal 1**: Multi-level concourse ($180\text{m}$ span) with aerodynamic curved roof canopy, glass curtain wall, and 4 telescopic passenger boarding jet bridges.
  - **Air Traffic Control (ATC) Tower**: $45\text{m}$ tall tower with faceted concrete shaft, catwalk observation gallery, $360^\circ$ panoramic glass cab, rooftop ground radar dome, and flashing hazard beacon.
  - **Aircraft Maintenance & Cargo Hangars**: Two wide-span barrel-vaulted hangars ($75\text{m}$ each) with sliding doors, interior gantry bays, and yellow hazard striping.
  - **Airport Fire & Rescue Station (ARFF)**: 3-bay emergency station with stationed red crash tenders and communication mast.
  - **Jet-A1 Fuel Storage Farm**: 3 cylindrical white fuel tanks with containment bund wall.
  - **Doppler Weather Radar Tower**: Lattice pylon topped with a spherical white Doppler radome.
  - **Runway Navaids**: Lighted windsock mast and ILS glide slope antenna array.
  - **Unobstructed Flight Corridor**: All structures are situated safely parallel to the runway ($z = 70\text{m} - 125\text{m}$), ensuring zero visual obstruction to the aeroplane's flight trajectory.

### 2. Automatic 10-Cycle Repetition
- **Automated Repetition Workflow**:
  - The simulation repeats the complete take-off sequence automatically **10 consecutive times**.
  - Each cycle starts from rest ($u = 0\text{ m/s}, s = 0\text{ m}, h = 0\text{ m}$) at the runway threshold, executes constant acceleration $a$, rotates at $V_r$, and ascends to cruising altitude.
  - Upon completing each cycle, each run's data is logged into the lab report history, the aeroplane returns cleanly to the starting point, all measurements reset, and the next cycle commences seamlessly.
- **Cycle Control**: Toggle the **Automatic 10-Cycle Repetition** checkbox or click **Restart 10 Cycles** to reset from Cycle 1 at any moment.

### 3. Cycle Counter & Progress Indicators
- **Interactive Cycle Counter (1 to 10)**:
  - Top HUD pill and Card 1 telemetry display `Cycle X / 10`.
  - 10 interactive progress dots visually track the completed and active cycles in real time.
- **Celebratory Completion Modal**: Upon finishing Cycle 10, an interactive completion modal celebrates the achievement, displaying aggregate ground roll mileage, peak altitude AGL, and a one-click button to restart the experiment.

### 4. Synchronized Telemetry Dashboard (6-Card Grid)
All kinematic metrics are strictly synchronized with the aeroplane's spatial position:
1. **Cycle Counter**: Current cycle ($1 - 10$) and auto-repetition state.
2. **Elapsed Time ($t$)**: Split between runway ground roll ($t \le t_r = v/a$) and extended climbout ($+22.0\text{s}$).
3. **Horizontal Distance ($s_x$)**: Continuous displacement breakdown between runway ground roll and airborne range.
4. **Altitude AGL ($h$)**: Real-time height above ground in meters and feet, with vertical climb rate ($v_y$) in $\text{m/s}$ and $\text{fpm}$.
5. **Airspeed ($v$)**: Velocity vector with $v_x, v_y$, rotation speed $V_r$, and aircraft pitch attitude $\theta$.
6. **Acceleration & G-Force ($a$)**: Constant thrust acceleration ($a$) during the runway phase and forward G-force load factor.
7. **Primary Flight Display (PFD) Altitude Tape**: In 2D HUD mode, a vertical avionics altitude tape continuously tracks height above ground.

