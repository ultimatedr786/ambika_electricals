"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Lightweight Three.js "electrical rewards" visual for the auth screens.
 * Original composition: a slowly rotating circuit torus-knot of glowing nodes,
 * an energy bolt path, and floating reward point tokens.
 * Respects prefers-reduced-motion and pauses when the tab is hidden.
 */

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return reduced;
}

const BRAND = new THREE.Color("#4c9dff");
const VOLT = new THREE.Color("#ffcf3f");

function CircuitRing({ reduced }: { reduced: boolean }) {
  const group = React.useRef<THREE.Group>(null);
  const NODES = 42;

  const { positions, nodeGeo, nodeMat, lineGeo, lineMat } = React.useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < NODES; i++) {
      const t = (i / NODES) * Math.PI * 2;
      const r = 2.35 + Math.sin(t * 3) * 0.28;
      pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r * 0.62, Math.sin(t * 2) * 0.5));
    }
    const lg = new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]);
    return {
      positions: pts,
      nodeGeo: new THREE.SphereGeometry(0.055, 10, 10),
      nodeMat: new THREE.MeshBasicMaterial({ color: BRAND }),
      lineGeo: lg,
      lineMat: new THREE.LineBasicMaterial({ color: BRAND, transparent: true, opacity: 0.35 }),
    };
  }, []);

  React.useEffect(
    () => () => {
      nodeGeo.dispose();
      nodeMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
    },
    [nodeGeo, nodeMat, lineGeo, lineMat]
  );

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.rotation.z = reduced ? 0.1 : t * 0.06;
    group.current.rotation.x = reduced ? 0.18 : 0.18 + Math.sin(t * 0.25) * 0.06;
    group.current.children.forEach((child, i) => {
      if (i === 0) return;
      const phase = (t * 0.9 + i * 0.24) % (Math.PI * 2);
      const s = 1 + Math.max(0, Math.sin(phase)) * (reduced ? 0.2 : 1.4);
      child.scale.setScalar(s);
    });
  });

  return (
    <group ref={group}>
      <primitive object={new THREE.Line(lineGeo, lineMat)} />
      {positions.map((p, i) => (
        <mesh key={i} geometry={nodeGeo} material={nodeMat} position={p} />
      ))}
    </group>
  );
}

function Bolt({ reduced }: { reduced: boolean }) {
  const mesh = React.useRef<THREE.Mesh>(null);
  const geo = React.useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0.18, 1.1);
    shape.lineTo(-0.52, 0.05);
    shape.lineTo(-0.04, 0.05);
    shape.lineTo(-0.2, -1.1);
    shape.lineTo(0.52, 0.02);
    shape.lineTo(0.04, 0.02);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  }, []);
  React.useEffect(() => () => geo.dispose(), [geo]);

  useFrame((state) => {
    if (!mesh.current) return;
    const t = state.clock.elapsedTime;
    mesh.current.rotation.y = reduced ? 0.4 : Math.sin(t * 0.4) * 0.6;
    mesh.current.position.y = reduced ? 0 : Math.sin(t * 0.7) * 0.07;
  });

  return (
    <mesh ref={mesh} geometry={geo} scale={1.05}>
      <meshStandardMaterial color={VOLT} emissive={VOLT} emissiveIntensity={0.42} roughness={0.25} metalness={0.55} />
    </mesh>
  );
}

function Tokens({ reduced }: { reduced: boolean }) {
  const group = React.useRef<THREE.Group>(null);
  const items = React.useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        pos: new THREE.Vector3(
          Math.cos((i / 9) * Math.PI * 2) * (2.9 + (i % 3) * 0.35),
          Math.sin((i / 9) * Math.PI * 2.4) * 1.7,
          -0.6 - (i % 4) * 0.35
        ),
        speed: 0.35 + (i % 5) * 0.09,
        scale: 0.16 + (i % 3) * 0.045,
      })),
    []
  );
  const geo = React.useMemo(() => new THREE.TorusGeometry(1, 0.3, 8, 22), []);
  React.useEffect(() => () => geo.dispose(), [geo]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((c, i) => {
      const it = items[i];
      c.position.y = it.pos.y + (reduced ? 0 : Math.sin(t * it.speed + i) * 0.26);
      c.rotation.z = reduced ? 0.4 : t * it.speed * 0.6;
      c.rotation.x = 0.5;
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} geometry={geo} position={it.pos} scale={it.scale}>
          <meshStandardMaterial
            color={i % 3 === 0 ? VOLT : BRAND}
            emissive={i % 3 === 0 ? VOLT : BRAND}
            emissiveIntensity={0.3}
            roughness={0.3}
            metalness={0.6}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ reduced }: { reduced: boolean }) {
  const { camera } = useThree();
  useFrame((state) => {
    if (reduced) return;
    const { x, y } = state.pointer;
    camera.position.x += (x * 0.55 - camera.position.x) * 0.04;
    camera.position.y += (y * 0.35 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export function AuthVisual({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 6.4], fov: 42 }}
        dpr={[1, 1.6]}
        frameloop={reduced ? "demand" : "always"}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <pointLight position={[-4, -2, 2]} intensity={22} color="#4c9dff" distance={14} />
        <Rig reduced={reduced} />
        <CircuitRing reduced={reduced} />
        <Bolt reduced={reduced} />
        <Tokens reduced={reduced} />
      </Canvas>
    </div>
  );
}

export default AuthVisual;
