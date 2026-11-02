import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import * as THREE from "three";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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
// Download every texture at once, up front. Left to the components, React loads them one after another
// (each waits for the previous), which is painfully slow on a phone. The cache lets useLoader reuse them.
THREE.Cache.enabled = true;
const TEXTURE_FILES = [...new Set([...BODIES.map((b) => b.tex), "saturnringcolor.jpg", "galaxy_starfield.png"])];
const texturesLoaded = Promise.all(TEXTURE_FILES.map((f) => new THREE.TextureLoader().loadAsync(tex(f)))).catch(() => {});

const hand = (on: boolean) => (document.body.style.cursor = on ? "pointer" : "");

function useTexture(file: string) {
  const t = useLoader(THREE.TextureLoader, tex(file));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Text label pinned to a 3D position (drawn as DOM by the CSS2DRenderer in <Labels/>).
// prio decides who keeps their name when two labels would overlap on screen (bigger bodies win).
type LabelEntry = { obj: CSS2DObject; prio: number; lift: number }; // lift: world distance from the label to the body's centre
const labelRegistry = new Set<LabelEntry>();

function Label({ position, className, text, prio }: { position: [number, number, number]; className: string; text: string; prio: number }) {
  const obj = useMemo(() => new CSS2DObject(document.createElement("span")), []);
  useEffect(() => { obj.element.className = className; obj.element.textContent = text; }, [obj, className, text]);
  useEffect(() => {
    const entry = { obj, prio, lift: Math.abs(position[1]) };
    labelRegistry.add(entry);
    return () => { labelRegistry.delete(entry); };
  }, [obj, prio, position]);
  return <primitive object={obj} position={position} />;
}

function Labels({ narrow }: { narrow: boolean }) {
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
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    r.render(scene, camera);
    // keep every name: try under the body, then above it (the mirror position), then one row further out each way
    const charW = narrow ? 6.2 : 7.6, h = narrow ? 12 : 14, gap = 4, step = h + 3;
    const cam = camera as THREE.PerspectiveCamera;
    const ppu = size.height / (2 * Math.max(cam.position.z, 1) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))); // pixels per world unit at the planets' depth
    const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
    [...labelRegistry].sort((a, b) => b.prio - a.prio).forEach(({ obj, lift }) => {
      obj.getWorldPosition(v);
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width, y = (-v.y * 0.5 + 0.5) * size.height;
      const w = (obj.element.textContent?.length ?? 4) * charW;
      const off = v.z > 1 || x < -w || x > size.width + w || y < -h || y > size.height + h;
      const above = -2 * lift * ppu;
      const options = [0, above, step, above - step, 2 * step, above - 2 * step];
      let pick = -1, box = { x0: 0, x1: 0, y0: 0, y1: 0 };
      if (!off) {
        pick = options.findIndex((dy) => {
          box = { x0: x - w / 2 - gap, x1: x + w / 2 + gap, y0: y + dy - h / 2, y1: y + dy + h / 2 };
          return !placed.some((p) => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0);
        });
      }
      if (pick < 0) {
        obj.element.style.visibility = "hidden";
      } else {
        obj.element.style.visibility = "";
        obj.element.style.marginTop = options[pick] + "px";
        placed.push(box);
      }
    });
  });
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

// The Sun: mottled orange surface that darkens toward the edge, and a soft glow that fades to black.
const SUN_VERT = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const SUN_FRAG = `
  uniform sampler2D map;
  uniform vec3 tint;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    float facing = clamp(dot(normalize(vNormal), -normalize(vPos)), 0.0, 1.0);                  // 1 in the middle, 0 at the edge
    vec3 c = texture2D(map, vUv).rgb * tint;
    c = max(c, tint * 0.55);                                    // no black sunspots: soft darker-orange patches instead
    c *= mix(0.55, 1.12, pow(facing, 0.55));                    // limb darkening
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }
`;

function SunBody({ r, map }: { r: number; map: THREE.Texture }) {
  const uniforms = useMemo(() => ({ map: { value: map }, tint: { value: new THREE.Color("#ffa23a") } }), [map]);
  return (
    <shaderMaterial uniforms={uniforms} vertexShader={SUN_VERT} fragmentShader={SUN_FRAG} />
  );
}

// A slightly larger sphere seen from the inside: bright next to the Sun, fading to nothing at its own edge.
// (A flat glow disc can't do this: perspective shifts it sideways from the Sun when the Sun is off-centre.)
const GLOW_VERT = `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FRAG = `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    // angle between the shell's normal and the view ray: 0 exactly at the shell's silhouette, wherever it is on screen
    float q = clamp(dot(normalize(vNormal), normalize(vPos)), 0.0, 1.0);
    float a = pow(q, 2.4) * 0.9;
    gl_FragColor = vec4(vec3(1.0, 0.55, 0.13) * a, 1.0);
  }
`;

function SunGlow({ r }: { r: number }) {
  return (
    <mesh>
      <sphereGeometry args={[r * 1.9, 64, 64]} />
      <shaderMaterial vertexShader={GLOW_VERT} fragmentShader={GLOW_FRAG} side={THREE.BackSide} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

function Planet({ b, dim, active, narrow, onPick }: { b: Body; dim: boolean; active: boolean; narrow: boolean; onPick: (id: string) => void }) {
  const map = useTexture(b.tex);
  const spin = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => { spin.current.rotation.y += b.spin * dt; });
  const sun = b.id === "sun";
  const tilt = THREE.MathUtils.degToRad(b.tilt);
  return (
    <group position={[b.x, 0, 0]}>
      <group rotation={[0, 0, tilt]}>
      <mesh
        ref={spin}
        onClick={(e) => { e.stopPropagation(); if (e.delta > 8) return; onPick(b.id); }} // a drag (panning) is not a tap
        onPointerOver={(e) => { e.stopPropagation(); hand(true); }}
        onPointerOut={() => hand(false)}
      >
        <sphereGeometry args={[b.r, 64, 64]} />
        {sun ? (
          <SunBody r={b.r} map={map} />
        ) : (
          <meshStandardMaterial map={map} color={b.tint ?? "#ffffff"} roughness={1} transparent opacity={dim ? 0.18 : 1} />
        )}
      </mesh>
      {narrow && !active && !sun && (
        // invisible, larger tap target: small planets are only a few pixels wide on a phone
        <mesh onClick={(e) => { e.stopPropagation(); if (e.delta > 8) return; onPick(b.id); }}>
          <sphereGeometry args={[Math.max(b.r, 0.65), 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {sun && <SunGlow r={b.r} />}
      {b.ring && <Rings r={b.r} />}
      </group>
      {/* outside the tilted group, or the name swings round with the planet's axial tilt */}
      {!active && !sun && (
        <Label position={[0, -b.r - 0.5, 0]} className={"body-label" + (dim ? " dim" : "")} text={b.name} prio={b.r} />
      )}
    </group>
  );
}

function MoonOrbit({ b, names, selected, narrow, onMoon }: { b: Body; names: string[]; selected: string | null; narrow: boolean; onMoon: (n: string) => void }) {
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
              onClick={(e) => { e.stopPropagation(); if (e.delta > 8) return; onMoon(n); }}
              onPointerOver={(e) => { e.stopPropagation(); hand(true); }}
              onPointerOut={() => hand(false)}
            >
              <sphereGeometry args={[Math.max(s, 0.06), 24, 24]} />
              <meshStandardMaterial map={map} roughness={1} emissive={sel ? "#F5B54A" : "#000"} emissiveIntensity={0.5} />
            </mesh>
            {/* invisible, larger tap target */}
            <mesh onClick={(e) => { e.stopPropagation(); if (e.delta > 8) return; onMoon(n); }}>
              <sphereGeometry args={[Math.max(s * 2.5, 0.14), 12, 12]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {(sel || (!narrow && i < 2)) && ( // on a phone only the selected moon gets a name, so labels don't pile up
              <Label position={[0, -Math.max(s, 0.06) - 0.15, 0]} className={"moon-label" + (sel ? " sel" : "")} text={n} prio={sel ? 100 : 0.5} />
            )}
          </group>
        );
      })}
    </group>
  );
}

const PHONE_START_PAN = -5;

// Camera: always faces -z; flies along the line toward the focused body.
function Rig({ focus, narrow, hasMoons }: { focus: string | null; narrow: boolean; hasMoons: boolean }) {
  const { camera, size, gl } = useThree();
  // phone overview: starts framed on the Sun + inner planets; drag sideways to reach the outer ones (world units)
  const pan = useRef(PHONE_START_PAN);
  useEffect(() => {
    if (!narrow || focus) return;
    const el = gl.domElement;
    let last: number | null = null;
    const down = (e: PointerEvent) => { last = e.clientX; };
    const move = (e: PointerEvent) => {
      if (last === null) return;
      const cam = camera as THREE.PerspectiveCamera;
      const visibleW = 2 * cam.position.z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (size.width / size.height);
      pan.current = THREE.MathUtils.clamp(pan.current - ((e.clientX - last) * visibleW) / size.width, -6.5, 22);
      last = e.clientX;
    };
    const up = () => { last = null; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [narrow, focus, camera, size, gl]);
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
      cx = narrow ? 9 + pan.current : 15;
      cy = -(narrow ? 0.32 : 0.3) * H + Math.sin(state.clock.elapsedTime * 0.25) * 0.4;
    } else {
      const b = byId[focus];
      // The free area is what the page UI leaves uncovered: below the info card, above the chat box, and
      // right of the side panel on desktop. The body is centred in it and sized to fit it.
      const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const info = box(".info"), chat = box(".chat"), side = box(".topics");
      const top = narrow ? (info ? info.bottom + 8 : 90) : 70;
      const bottom = chat ? Math.max(chat.top - 8, top + 120) : size.height;
      const left = !narrow && side ? side.right : 0;
      const right = size.width;
      const fx = ((left + right) / 2 - size.width / 2) / (size.width / 2);
      const fy = (size.height / 2 - (top + bottom) / 2) / (size.height / 2);
      const R = b.id === "sun" ? b.r * 1.7 : b.r * (hasMoons ? 2.4 : b.ring ? 2.2 : 1);
      const freeH = (bottom - top) / size.height, freeW = (right - left) / size.width;
      z = Math.max(R / (0.85 * freeH * tan), R / (0.8 * freeW * tan * aspect));
      const H = z * tan;
      cx = b.x - fx * H * aspect;
      cy = -fy * H;
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
  // the planet textures are ~3 MB: show a message instead of a black screen while they download
  const [ready, setReady] = useState(false);
  useEffect(() => {
    texturesLoaded.then(() => setReady(true));
    const t = setTimeout(() => setReady(true), 20000);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
    <Canvas className="scene" dpr={narrow ? [1, 1.5] : [1, 2]} camera={{ fov: 40, near: 0.1, far: 800, position: [15, -6, 70] }} onPointerMissed={() => hand(false)}>
      <color attach="background" args={["#02040C"]} />
      <ambientLight intensity={0.45} />
      <pointLight position={[-8, 0, 10]} intensity={5} decay={0} color="#fff1dc" />
      <Suspense fallback={null}>
        <Stars />
        {!focus && <Orbits />}
        {BODIES.map((b) => (
          <Planet key={b.id} b={b} dim={!!focus && focus !== b.id && !(focus === "moon" && b.id === "earth")} active={focus === b.id} narrow={narrow} onPick={onPick} />
        ))}
        {fb && moons.length > 0 && <MoonOrbit key={fb.id} b={fb} names={moons} selected={moon} narrow={narrow} onMoon={onMoon} />}
      </Suspense>
      <Labels narrow={narrow} />
      <Rig focus={focus} narrow={narrow} hasMoons={moons.length > 0} />
    </Canvas>
    <div className={"loading" + (ready ? " done" : "")} aria-live="polite">Loading the solar system…</div>
    </>
  );
}
