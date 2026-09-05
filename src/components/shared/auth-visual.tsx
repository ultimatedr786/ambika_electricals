"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Premium Three.js "Electrical Rewards Network" visual for Login & Signup.
 * Concept: Ambika Electricals → Electrical Purchase (LED bulb, modular switch, MCB, cable spool)
 *          → Membership Card → Reward Point Tokens.
 *
 * Fully responsive, lazy-loadable, respects prefers-reduced-motion, and
 * disposes all GPU resources properly on unmount.
 */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

// Brand color palette
const COLOR_BLUE_GLOW = new THREE.Color("#38bdf8");
const COLOR_GOLD_TOKEN = new THREE.Color("#f59e0b");
const COLOR_COPPER = new THREE.Color("#f97316");

// Spline curve for current / point travel
const createCircuitCurve = () => {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.8, 1.2, 0),
    new THREE.Vector3(-1.8, 1.0, 0.2),
    new THREE.Vector3(-1.2, 0.2, 0.3),
    new THREE.Vector3(-0.4, -0.2, 0.4),
    new THREE.Vector3(0.5, 0.1, 0.3),
    new THREE.Vector3(1.4, -0.4, 0.2),
    new THREE.Vector3(2.4, 0.2, 0),
  ]);
};

/**
 * Procedural Abstract LED Bulb
 */
function LedBulb({ position, scale = 1, reduced }: { position: [number, number, number]; scale?: number; reduced: boolean }) {
  const bulbRef = React.useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!bulbRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    bulbRef.current.position.y = position[1] + Math.sin(t * 0.9) * 0.04;
    bulbRef.current.rotation.y = t * 0.15;
  });

  return (
    <group ref={bulbRef} position={position} scale={scale}>
      {/* Frosted Glass Dome */}
      <mesh position={[0, 0.32, 0]}>
        <sphereGeometry args={[0.3, 24, 24]} />
        <meshStandardMaterial
          color="#e0f2fe"
          emissive="#38bdf8"
          emissiveIntensity={0.5}
          roughness={0.2}
          metalness={0.1}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Inner Glowing Filament */}
      <mesh position={[0, 0.32, 0]}>
        <torusGeometry args={[0.1, 0.02, 12, 24]} />
        <meshBasicMaterial color="#7dd3fc" />
      </mesh>
      {/* Neck / Lower Dome */}
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.2, 0.14, 0.18, 20]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Metallic Base Thread */}
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.16, 20]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.25} metalness={0.85} />
      </mesh>
      {/* Base Contact Point */}
      <mesh position={[0, -0.14, 0]}>
        <cylinderGeometry args={[0.08, 0.04, 0.06, 16]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Procedural Abstract Modular Switch Plate
 */
function ModularSwitch({ position, scale = 1, reduced }: { position: [number, number, number]; scale?: number; reduced: boolean }) {
  const groupRef = React.useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = position[1] + Math.sin(t * 0.8 + 1.2) * 0.04;
    groupRef.current.rotation.y = -0.1 + Math.sin(t * 0.2) * 0.05;
  });

  return (
    <group ref={groupRef} position={position} scale={scale} rotation={[0.15, -0.25, 0]}>
      {/* Switch Plate Face */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.65, 0.75, 0.06]} />
        <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Inner Switch Bezel */}
      <mesh position={[0, 0, 0.04]}>
        <boxGeometry args={[0.48, 0.58, 0.04]} />
        <meshStandardMaterial color="#0f172a" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Rocker Button 1 */}
      <mesh position={[-0.11, 0, 0.07]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[0.18, 0.38, 0.04]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.5} />
      </mesh>
      {/* Rocker Button 2 */}
      <mesh position={[0.11, 0, 0.07]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[0.18, 0.38, 0.04]} />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.5} />
      </mesh>
      {/* Subtle LED Status Indicator */}
      <mesh position={[0.11, 0.12, 0.095]}>
        <circleGeometry args={[0.02, 16]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
    </group>
  );
}

/**
 * Procedural Abstract MCB (Miniature Circuit Breaker)
 */
function McbBreaker({ position, scale = 1, reduced }: { position: [number, number, number]; scale?: number; reduced: boolean }) {
  const groupRef = React.useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = position[1] + Math.sin(t * 0.85 + 2.4) * 0.035;
    groupRef.current.rotation.y = 0.2 + Math.cos(t * 0.18) * 0.06;
  });

  return (
    <group ref={groupRef} position={position} scale={scale} rotation={[0.1, 0.3, 0]}>
      {/* Main MCB Body */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.36, 0.72, 0.5]} />
        <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.3} />
      </mesh>
      {/* Front Face / Label Plate */}
      <mesh position={[0, 0, 0.26]}>
        <boxGeometry args={[0.32, 0.58, 0.04]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.4} metalness={0.1} />
      </mesh>
      {/* Status Window */}
      <mesh position={[0, 0.16, 0.285]}>
        <planeGeometry args={[0.18, 0.07]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      {/* Switch Toggle Handle */}
      <mesh position={[0, -0.06, 0.32]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.16, 0.14, 0.18]} />
        <meshStandardMaterial color="#0284c7" roughness={0.3} metalness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * Procedural Abstract Cable Spool / Coil
 */
function CableSpool({ position, scale = 1, reduced }: { position: [number, number, number]; scale?: number; reduced: boolean }) {
  const groupRef = React.useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    groupRef.current.position.y = position[1] + Math.sin(t * 0.75 + 3.6) * 0.04;
    groupRef.current.rotation.z = t * 0.12;
  });

  return (
    <group ref={groupRef} position={position} scale={scale} rotation={[0.3, -0.2, 0]}>
      {/* Top Flange */}
      <mesh position={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.34, 0.34, 0.04, 24]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Bottom Flange */}
      <mesh position={[0, 0, -0.15]}>
        <cylinderGeometry args={[0.34, 0.34, 0.04, 24]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Copper Wire Coils Wrapped around center */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.07, 16, 32]} />
        <meshStandardMaterial
          color={COLOR_COPPER}
          emissive="#c2410c"
          emissiveIntensity={0.25}
          roughness={0.25}
          metalness={0.8}
        />
      </mesh>
      {/* Center Core */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.32, 20]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Membership Card in 3D (The connector between purchase & rewards)
 */
function MembershipCard3D({ position, scale = 1, reduced }: { position: [number, number, number]; scale?: number; reduced: boolean }) {
  const cardRef = React.useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!cardRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    cardRef.current.position.y = position[1] + Math.sin(t * 0.7 + 0.8) * 0.05;
    cardRef.current.rotation.y = -0.25 + Math.sin(t * 0.3) * 0.12;
    cardRef.current.rotation.x = 0.15 + Math.cos(t * 0.25) * 0.06;
  });

  return (
    <group ref={cardRef} position={position} scale={scale} rotation={[0.15, -0.2, 0.08]}>
      {/* Card Base Slab */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.3, 0.82, 0.03]} />
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.2}
          metalness={0.7}
          emissive="#1e3a8a"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Card Border Accent */}
      <mesh position={[0, 0, 0.018]}>
        <planeGeometry args={[1.24, 0.76]} />
        <meshBasicMaterial color="#0284c7" transparent opacity={0.35} />
      </mesh>
      {/* Gold Smart Chip */}
      <mesh position={[-0.34, 0.12, 0.02]}>
        <boxGeometry args={[0.22, 0.18, 0.01]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#d97706"
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.9}
        />
      </mesh>
      {/* Stylized AE Spark Logo Mark */}
      <mesh position={[0.34, 0.14, 0.02]}>
        <circleGeometry args={[0.12, 20]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      {/* Magnetic / Loyalty Stripe */}
      <mesh position={[0, -0.18, 0.02]}>
        <planeGeometry args={[0.9, 0.06]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Reward Point Token (Golden coin with gentle pulse)
 */
function RewardToken3D({ position, scale = 1, reduced }: { position: [number, number, number]; scale?: number; reduced: boolean }) {
  const tokenRef = React.useRef<THREE.Group>(null);
  const ringRef = React.useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!tokenRef.current || reduced) return;
    const t = state.clock.elapsedTime;
    tokenRef.current.position.y = position[1] + Math.sin(t * 0.9 + 1.8) * 0.05;
    tokenRef.current.rotation.y = t * 0.4;

    if (ringRef.current) {
      const pulse = 1 + Math.sin(t * 1.8) * 0.12;
      ringRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  return (
    <group ref={tokenRef} position={position} scale={scale} rotation={[0.1, 0, 0]}>
      {/* Golden Coin Base */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.08, 32]} />
        <meshStandardMaterial
          color="#f59e0b"
          emissive="#d97706"
          emissiveIntensity={0.45}
          roughness={0.25}
          metalness={0.85}
        />
      </mesh>
      {/* Embossed Inner Star Ring */}
      <mesh position={[0, 0, 0.045]}>
        <torusGeometry args={[0.34, 0.03, 12, 32]} />
        <meshStandardMaterial color="#fef08a" emissive="#fbbf24" emissiveIntensity={0.6} metalness={0.9} />
      </mesh>
      {/* Center Star / Point Hub */}
      <mesh position={[0, 0, 0.048]}>
        <octahedronGeometry args={[0.15, 0]} />
        <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={0.8} />
      </mesh>
      {/* Halo Pulse Ring */}
      <mesh ref={ringRef} position={[0, 0, 0]}>
        <torusGeometry args={[0.62, 0.015, 8, 36]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

/**
 * Circuit Trace Paths & Flowing Point Energy Pulses
 */
function CircuitNetwork({ reduced }: { reduced: boolean }) {
  const curve = React.useMemo(() => createCircuitCurve(), []);
  const pulseGroupRef = React.useRef<THREE.Group>(null);

  // Line geometry for circuit spline
  const lineGeo = React.useMemo(() => {
    const points = curve.getPoints(64);
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [curve]);

  const lineMat = React.useMemo(
    () => new THREE.LineBasicMaterial({ color: COLOR_BLUE_GLOW, transparent: true, opacity: 0.45, linewidth: 2 }),
    []
  );

  // Branch lines to electrical items
  const branchLines = React.useMemo(() => {
    const lines: THREE.Vector3[][] = [
      // Bulb branch
      [new THREE.Vector3(-2.8, 1.2, 0), new THREE.Vector3(-2.2, 1.5, -0.2)],
      // Switch branch
      [new THREE.Vector3(-1.8, 1.0, 0.2), new THREE.Vector3(-1.9, -0.6, -0.1)],
      // MCB branch
      [new THREE.Vector3(-1.2, 0.2, 0.3), new THREE.Vector3(-1.0, -1.2, 0)],
      // Cable branch
      [new THREE.Vector3(-0.4, -0.2, 0.4), new THREE.Vector3(-0.6, 1.3, 0.1)],
      // Membership to Reward token
      [new THREE.Vector3(0.5, 0.1, 0.3), new THREE.Vector3(1.4, -0.4, 0.2)],
      [new THREE.Vector3(1.4, -0.4, 0.2), new THREE.Vector3(2.4, 0.2, 0)],
    ];
    return lines.map((pts) => new THREE.BufferGeometry().setFromPoints(pts));
  }, []);

  // Moving tokens along the spline
  const tokenCount = 4;
  const tokenMeshes = React.useRef<THREE.Mesh[]>([]);

  useFrame((state) => {
    if (reduced) return;
    const t = state.clock.elapsedTime;

    // Move energy tokens along curve
    tokenMeshes.current.forEach((mesh, index) => {
      if (!mesh) return;
      const speed = 0.12;
      const offset = (index / tokenCount) + t * speed;
      const progress = offset % 1;
      const pt = curve.getPointAt(progress);
      mesh.position.copy(pt);

      // Scale token: grows as it approaches reward vault
      const sc = 0.07 + progress * 0.05;
      mesh.scale.set(sc, sc, sc);
    });

    // Pulse line opacity gently
    if (lineMat) {
      lineMat.opacity = 0.35 + Math.sin(t * 2) * 0.15;
    }
  });

  React.useEffect(
    () => () => {
      lineGeo.dispose();
      lineMat.dispose();
      branchLines.forEach((g) => g.dispose());
    },
    [lineGeo, lineMat, branchLines]
  );

  return (
    <group>
      {/* Main Spline Line */}
      <primitive object={new THREE.Line(lineGeo, lineMat)} />

      {/* Branch Lines */}
      {branchLines.map((geo, i) => (
        <primitive
          key={i}
          object={
            new THREE.Line(
              geo,
              new THREE.LineBasicMaterial({ color: i % 2 === 0 ? COLOR_BLUE_GLOW : COLOR_GOLD_TOKEN, transparent: true, opacity: 0.3 })
            )
          }
        />
      ))}

      {/* Flowing Energy Point Tokens */}
      <group ref={pulseGroupRef}>
        {Array.from({ length: tokenCount }).map((_, i) => (
          <mesh
            key={i}
            ref={(el) => {
              if (el) tokenMeshes.current[i] = el;
            }}
          >
            <sphereGeometry args={[1, 14, 14]} />
            <meshBasicMaterial color={i % 2 === 0 ? "#38bdf8" : "#fbbf24"} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Background Subtle Circuit Grid Plane
 */
function CircuitGridPlane() {
  const gridPoints = React.useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const step = 0.6;
    for (let x = -4; x <= 4; x += step) {
      for (let y = -3; y <= 3; y += step) {
        if ((Math.abs(x) + Math.abs(y)) % (step * 2) < 0.01) {
          pts.push(new THREE.Vector3(x, y, -0.8));
        }
      }
    }
    return pts;
  }, []);

  const dotGeo = React.useMemo(() => new THREE.PlaneGeometry(0.03, 0.03), []);
  const dotMat = React.useMemo(() => new THREE.MeshBasicMaterial({ color: "#1e3a8a", transparent: true, opacity: 0.4 }), []);

  React.useEffect(
    () => () => {
      dotGeo.dispose();
      dotMat.dispose();
    },
    [dotGeo, dotMat]
  );

  return (
    <group>
      {gridPoints.map((pt, i) => (
        <mesh key={i} geometry={dotGeo} material={dotMat} position={pt} />
      ))}
    </group>
  );
}

/**
 * Subtle Camera Rig that responds gently to cursor
 */
function CameraRig({ reduced }: { reduced: boolean }) {
  const { camera } = useThree();
  useFrame((state) => {
    if (reduced) return;
    const { x, y } = state.pointer;
    camera.position.x += (x * 0.35 - camera.position.x) * 0.03;
    camera.position.y += (y * 0.2 - camera.position.y) * 0.03;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

/**
 * Scene Assembly
 */
function Scene({ reduced }: { reduced: boolean }) {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 5, 4]} intensity={1.2} color="#ffffff" />
      <pointLight position={[-2.5, 1.5, 2]} intensity={12} color="#38bdf8" distance={8} />
      <pointLight position={[2.4, 0.2, 2]} intensity={14} color="#f59e0b" distance={8} />
      <pointLight position={[0, -1, 1.5]} intensity={6} color="#3b82f6" distance={6} />

      <CameraRig reduced={reduced} />
      <CircuitGridPlane />
      <CircuitNetwork reduced={reduced} />

      {/* 1. Electrical Purchases Cluster (Left) */}
      <LedBulb position={[-2.4, 1.1, 0]} scale={0.9} reduced={reduced} />
      <ModularSwitch position={[-2.1, -0.7, 0]} scale={0.85} reduced={reduced} />
      <McbBreaker position={[-1.1, -1.1, 0.1]} scale={0.85} reduced={reduced} />
      <CableSpool position={[-0.8, 1.2, 0.1]} scale={0.85} reduced={reduced} />

      {/* 2. Customer Membership Card (Center-Right) */}
      <MembershipCard3D position={[0.5, -0.05, 0.3]} scale={1.05} reduced={reduced} />

      {/* 3. Reward Point Token (Right) */}
      <RewardToken3D position={[2.4, 0.1, 0.1]} scale={1.15} reduced={reduced} />
    </>
  );
}

/**
 * Static SVG / CSS Fallback visual.
 * Displays immediately while Three.js loads, or if WebGL is disabled.
 */
export function AuthVisualFallback({ className }: { className?: string }) {
  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-slate-950 p-6 ${className || ""}`} aria-hidden="true">
      {/* Background Circuit Grid Pattern */}
      <div className="absolute inset-0 grid-lines opacity-10" />

      {/* Subtle Radial Glows */}
      <div className="absolute left-1/4 top-1/3 size-72 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="absolute right-1/4 bottom-1/3 size-72 rounded-full bg-amber-500/15 blur-3xl" />

      {/* Diagram Container */}
      <div className="relative z-10 flex w-full max-w-lg items-center justify-between gap-4">
        {/* Left: Electrical Purchases */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-sky-400/30 bg-sky-950/40 text-sky-400 shadow-lg shadow-sky-500/10">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {/* LED Bulb */}
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
            </svg>
            <span className="absolute -top-1 -right-1 flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-sky-500" />
            </span>
          </div>
          <span className="text-center text-[11px] font-medium uppercase tracking-wider text-sky-300/80">
            Electrical Purchase
          </span>
        </div>

        {/* Trace 1 */}
        <div className="relative flex flex-1 items-center justify-center">
          <div className="h-0.5 w-full bg-gradient-to-r from-sky-500/40 via-sky-400 to-sky-500/40" />
          <div className="absolute size-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
        </div>

        {/* Center: Membership */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-blue-400/40 bg-blue-950/50 text-blue-300 shadow-lg shadow-blue-500/15">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
          </div>
          <span className="text-center text-[11px] font-medium uppercase tracking-wider text-blue-200/80">
            Member ID
          </span>
        </div>

        {/* Trace 2 */}
        <div className="relative flex flex-1 items-center justify-center">
          <div className="h-0.5 w-full bg-gradient-to-r from-blue-500/40 via-amber-400 to-amber-500/40" />
          <div className="absolute size-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
        </div>

        {/* Right: Reward Points */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-950/40 text-amber-400 shadow-lg shadow-amber-500/15">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v10" />
              <path d="M15 9.5a2.5 2.5 0 0 0-5 0c0 2 5 2 5 4.5a2.5 2.5 0 0 1-5 0" />
            </svg>
            <span className="absolute -top-1 -right-1 flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-amber-500" />
            </span>
          </div>
          <span className="text-center text-[11px] font-medium uppercase tracking-wider text-amber-300/80">
            Reward Points
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Main AuthVisual Export Component
 */
export function AuthVisual({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  const [hasWebGl, setHasWebGl] = React.useState(true);

  React.useEffect(() => {
    setMounted(true);
    // Quick WebGL support probe
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) setHasWebGl(false);
    } catch {
      setHasWebGl(false);
    }
  }, []);

  if (!mounted || !hasWebGl) {
    return <AuthVisualFallback className={className} />;
  }

  return (
    <div className={`relative overflow-hidden ${className || ""}`} aria-hidden="true">
      {/* Background radial glow */}
      <div className="pointer-events-none absolute left-[-10%] top-1/4 size-[28rem] rounded-full bg-brand-500/15 blur-[100px]" />
      <div className="pointer-events-none absolute right-[-10%] bottom-1/4 size-[28rem] rounded-full bg-amber-500/10 blur-[100px]" />

      <Canvas
        camera={{ position: [0, 0, 5.8], fov: 44 }}
        dpr={[1, 1.5]}
        frameloop={reduced ? "demand" : "always"}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <Scene reduced={reduced} />
      </Canvas>
    </div>
  );
}

export default AuthVisual;
