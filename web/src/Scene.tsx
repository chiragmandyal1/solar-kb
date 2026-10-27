import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { BODIES, byId, type Body } from "./bodies";

type Props = {
  focus: string | null;
  moons: string[];
  moon: string | null;
  narrow: boolean;
  onPick: (id: string) => void;
  onMoon: (name: string) => void;
};

const tex = (file: string) => `${import.meta.env.BASE_URL}textures/${file}`;
const hand = (on: boolean) => (document.body.style.cursor = on ? "pointer" : "");

function useTexture(file: string) {
  const t = useLoader(THREE.TextureLoader, tex(file));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Text label pinned to a 3D position (drawn as DOM by the CSS2DRenderer in <Labels/>).
function Label({ position, className, text }: { position: [number, number, number]; className: string; text: string }) {
  const obj = useMemo(() => new CSS2DObject(document.createElement("span")), []);
  useEffect(() => { obj.element.className = className; obj.element.textContent = text; }, [obj, className, text]);
  return <primitive object={obj} position={position} />;
}

function Labels() {
  const { gl, scene, camera, size } = useThree();
  const r = useMemo(() => {
    const x = new CSS2DRenderer();
    x.domElement.className = "labels";
    return x;
  }, []);
  useEffect(() => {
    gl.domElement.parentElement!.appendChild(r.domElement);
    return () => { r.domElement.remove(); };
  }, [gl, r]);
  useEffect(() => r.setSize(size.width, size.height), [r, size]);
  useFrame(() => r.render(scene, camera));
  return null;
}

function Rings({ r }: { r: number }) {
  const map = useTexture("saturnringcolor.jpg");
  const geo = useMemo(() => {
    const g = new THREE.RingGeometry(r * 1.3, r * 2.3, 128, 1);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) - r * 1.3) / r, 0.5);
    return g;
  }, [r]);
  return (
    <mesh geometry={geo} rotation={[Math.PI / 2, 0, 0]}>
      <meshBasicMaterial map={map} alphaMap={map} side={THREE.DoubleSide} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  );
}

// Orbit path of each planet around the Sun: an ellipse centred on the Sun that passes through the planet.
// Not to scale and flattened so it reads as an orbit from the side-on view (planets stay in their line).
const SUN_X = byId.sun.x;
function Orbits() {
  const geos = useMemo(
    () =>
      BODIES.filter((b) => b.id !== "sun" && b.id !== "moon").map((b) => {
        const d = b.x - SUN_X;
        const pts = Array.from({ length: 257 }, (_, i) => {
          const a = (i / 256) * Math.PI * 2;
          return new THREE.Vector3(SUN_X + Math.cos(a) * d, Math.sin(a) * d * 0.2, 0);
        });
        return { id: b.id, geo: new THREE.BufferGeometry().setFromPoints(pts) };
      }),
    [],
  );
  return (
    <>
      {geos.map(({ id, geo }) => (
        <line key={id}>
          <primitive object={geo} attach="geometry" />
          <lineBasicMaterial color="#c8d7ff" transparent opacity={0.2} depthWrite={false} />
        </line>
      ))}
    </>
  );
}

function Planet({ b, dim, active, onPick }: { b: Body; dim: boolean; active: boolean; onPick: (id: string) => void }) {
  const map = useTexture(b.tex);
  const spin = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => { spin.current.rotation.y += b.spin * dt; });
  const sun = b.id === "sun";
  const tilt = THREE.MathUtils.degToRad(b.tilt);
  return (
    <group position={[b.x, 0, 0]} rotation={[0, 0, tilt]}>
      <mesh
        ref={spin}
        onClick={(e) => { e.stopPropagation(); onPick(b.id); }}
        onPointerOver={(e) => { e.stopPropagation(); hand(true); }}
        onPointerOut={() => hand(false)}
      >
        <sphereGeometry args={[b.r, 64, 64]} />
        {sun ? (
          <meshBasicMaterial map={map} color="#ffb060" />
        ) : (
          <meshStandardMaterial map={map} color={b.tint ?? "#ffffff"} roughness={1} transparent opacity={dim ? 0.18 : 1} />
        )}
      </mesh>
      {sun && (
        <mesh scale={1.12}>
          <sphereGeometry args={[b.r, 48, 48]} />
          <meshBasicMaterial color="#ff8a2a" transparent opacity={0.22} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
      {b.ring && <Rings r={b.r} />}
      {!active && !sun && (
        <Label position={[0, -b.r - 0.5, 0]} className={"body-label" + (dim ? " dim" : "")} text={b.name} />
      )}
    </group>
  );
}

function MoonOrbit({ b, names, selected, onMoon }: { b: Body; names: string[]; selected: string | null; onMoon: (n: string) => void }) {
  const a = b.r * 1.9 + 0.6, bb = a * 0.3;
  const group = useRef<THREE.Group>(null!);
  const moons = useRef<(THREE.Group | null)[]>([]);
  const t = useRef(0);
  const line = useMemo(() => {
    const pts = Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * 6.2832) * a, Math.sin((i / 128) * 6.2832) * bb, 0));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [a, bb]);
  const map = useTexture("moonmap1k.jpg");
  useFrame((_, dt) => {
    t.current += dt;
    moons.current.forEach((m, i) => {
      if (!m) return;
      const ang = (i / names.length) * 6.2832 + t.current * (0.12 + 0.1 / (i + 1));
      m.position.set(Math.cos(ang) * a, Math.sin(ang) * bb, 0);
    });
  });
  return (
    <group ref={group} position={[b.x, 0, 0]} rotation={[0.35, 0, 0.15]}>
      {/* a flat ellipse in this group's XY plane; the tilt above turns it into a slanted orbit */}
      <line>
        <primitive object={line} attach="geometry" />
        <lineBasicMaterial color="#c8d7ff" transparent opacity={0.22} />
      </line>
      {names.map((n, i) => {
        const sel = n === selected;
        const s = sel ? b.r * 0.2 : i < 4 ? b.r * 0.12 : b.r * 0.07;
        return (
          <group key={n} ref={(el) => { moons.current[i] = el; }}>
            <mesh
              onClick={(e) => { e.stopPropagation(); onMoon(n); }}
              onPointerOver={(e) => { e.stopPropagation(); hand(true); }}
              onPointerOut={() => hand(false)}
            >
              <sphereGeometry args={[Math.max(s, 0.06), 24, 24]} />
              <meshStandardMaterial map={map} roughness={1} emissive={sel ? "#F5B54A" : "#000"} emissiveIntensity={0.5} />
            </mesh>
            {(sel || i < 2) && (
              <Label position={[0, -Math.max(s, 0.06) - 0.15, 0]} className={"moon-label" + (sel ? " sel" : "")} text={n} />
            )}
          </group>
        );
      })}
    </group>
  );
}

// Camera: always faces -z; flies along the line toward the focused body.
function Rig({ focus, narrow, hasMoons }: { focus: string | null; narrow: boolean; hasMoons: boolean }) {
  const { camera, size } = useThree();
  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.quaternion.identity(); // R3F aims new cameras at the origin; we always face -z
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const aspect = size.width / size.height;
    let cx: number, cy: number, z: number;
    if (!focus) {
      const span = narrow ? 24 : 54;
      z = span / 2 / (tan * aspect);
      const H = z * tan;
      cx = (narrow ? 9 : 15) ;
      cy = -(narrow ? 0.32 : 0.3) * H + Math.sin(state.clock.elapsedTime * 0.25) * 0.4;
    } else {
      const b = byId[focus];
      const R = b.id === "sun" ? b.r * 0.55 : b.r * (hasMoons ? 2.4 : b.ring ? 2.2 : 1);
      z = Math.max(R / (0.62 * tan), R / (0.55 * tan * aspect));
      const H = z * tan;
      cx = b.x - (narrow ? 0 : 0.1) * H * aspect;
      cy = -(narrow ? 0.38 : 0.3) * H;
    }
    camera.position.x = THREE.MathUtils.damp(camera.position.x, cx, 2.4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, cy, 2.4, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, z, 2.4, dt);
  });
  return null;
}

function Stars() {
  const map = useTexture("galaxy_starfield.png");
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.004; });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[300, 48, 48]} />
      <meshBasicMaterial map={map} side={THREE.BackSide} color="#9aa3c0" depthWrite={false} />
    </mesh>
  );
}

export function Scene({ focus, moons, moon, narrow, onPick, onMoon }: Props) {
  const fb = focus ? byId[focus] : null;
  return (
    <Canvas className="scene" dpr={[1, 2]} camera={{ fov: 40, near: 0.1, far: 800, position: [15, -6, 70] }} onPointerMissed={() => hand(false)}>
      <color attach="background" args={["#02040C"]} />
      <ambientLight intensity={0.45} />
      <pointLight position={[-8, 0, 10]} intensity={5} decay={0} color="#fff1dc" />
      <Suspense fallback={null}>
        <Stars />
        {!focus && <Orbits />}
        {BODIES.map((b) => (
          <Planet key={b.id} b={b} dim={!!focus && focus !== b.id && !(focus === "moon" && b.id === "earth")} active={focus === b.id} onPick={onPick} />
        ))}
        {fb && moons.length > 0 && <MoonOrbit key={fb.id} b={fb} names={moons} selected={moon} onMoon={onMoon} />}
      </Suspense>
      <Labels />
      <Rig focus={focus} narrow={narrow} hasMoons={moons.length > 0} />
    </Canvas>
  );
}
