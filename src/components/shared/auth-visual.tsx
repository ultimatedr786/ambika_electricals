"use client";

import * as React from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * "Quiet Power" — the Ambika Electricals Rewards Network auth visual.
 *
 * One editorial composition, not a collection of floating objects:
 *
 *   circuit line  →  current pulse  →  brushed-metal membership card
 *                                        →  emits one reward token
 *
 * Supporting cues are limited to three: an LED glow, a modular-switch
 * geometry, and the circuit line itself. Deep navy field, one electric-blue
 * accent, one warm reward accent, restrained glow, fixed clean camera.
 *
 * Motion is a single slow ~7s cycle. It pauses when the tab is hidden and
 * renders a single static frame under prefers-reduced-motion.
 *
 * This module is only ever reached through a dynamic import — three.js and
 * @react-three/fiber must stay out of the auth form's critical bundle.
 */

const BLUE = "#38bdf8";
const BLUE_DEEP = "#1d4ed8";
const AMBER = "#f5b409";

const CYCLE = 7.2; // seconds — one purchase→points story
const TRAVEL_START = 0.6;
const TRAVEL_END = 3.4;
const TOKEN_START = 3.4;
const TOKEN_END = 6.2;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t: number) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ helpers */

/** Soft radial sprite texture used for glows and the contact shadow. */
function makeRadialTexture(stops: [number, string][], size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Rounded-rectangle plate with a small bevel — reads as a real manufactured part. */
function makePlateGeometry(width: number, height: number, radius: number, depth: number, bevel: number) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height / 2;
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.center();
  return geo;
}

function useDisposable<T extends { dispose: () => void }>(factory: () => T, deps: React.DependencyList = []) {
  const value = React.useMemo(factory, deps); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => () => value.dispose(), [value]);
  return value;
}

/* -------------------------------------------------------------- scene parts */

/** The single circuit path: enters from the left, turns once, reaches the card. */
function useCircuitCurve() {
  return React.useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-4.6, -1.02, 1.55),
          new THREE.Vector3(-2.55, -1.02, 1.55),
          new THREE.Vector3(-2.15, -1.02, 1.3),
          new THREE.Vector3(-2.05, -1.02, 0.55),
          new THREE.Vector3(-1.7, -1.02, 0.16),
          new THREE.Vector3(-0.72, -1.02, 0.08),
        ],
        false,
        "catmullrom",
        0.02
      ),
    []
  );
}

function CircuitLine({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const geo = useDisposable(() => new THREE.TubeGeometry(curve, 90, 0.018, 8, false), [curve]);
  const nodeGeo = useDisposable(() => new THREE.SphereGeometry(0.045, 12, 12), []);

  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial
          color={BLUE_DEEP}
          emissive={BLUE}
          emissiveIntensity={0.35}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>
      <mesh geometry={nodeGeo} position={[-2.1, -1.02, 0.92]}>
        <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.8} roughness={0.3} />
      </mesh>
      <mesh geometry={nodeGeo} position={[-3.55, -1.02, 1.55]} scale={0.7}>
        <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={0.4} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** The current pulse that travels the circuit into the card. */
function CurrentPulse({
  curve,
  glowTexture,
  reduced,
}: {
  curve: THREE.CatmullRomCurve3;
  glowTexture: THREE.Texture;
  reduced: boolean;
}) {
  const core = React.useRef<THREE.Mesh>(null);
  const halo = React.useRef<THREE.Sprite>(null);
  const point = React.useRef<THREE.PointLight>(null);
  const position = React.useRef(new THREE.Vector3());

  const apply = React.useCallback(
    (progress: number, intensity: number) => {
      curve.getPointAt(clamp01(progress), position.current);
      if (core.current) {
        core.current.position.copy(position.current);
        core.current.scale.setScalar(0.6 + intensity * 0.5);
        (core.current.material as THREE.MeshBasicMaterial).opacity = intensity;
      }
      if (halo.current) {
        halo.current.position.copy(position.current);
        halo.current.scale.setScalar(0.34 + intensity * 0.24);
        halo.current.material.opacity = intensity * 0.75;
      }
      if (point.current) {
        point.current.position.copy(position.current);
        point.current.intensity = intensity * 3.2;
      }
    },
    [curve]
  );

  React.useEffect(() => {
    if (reduced) apply(0.72, 0.85);
  }, [reduced, apply]);

  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.elapsedTime % CYCLE;
    if (t < TRAVEL_START || t > TRAVEL_END) {
      apply(0, 0);
      return;
    }
    const p = (t - TRAVEL_START) / (TRAVEL_END - TRAVEL_START);
    // ease-in-out travel, fading in at the start and absorbed by the card
    const intensity = Math.sin(Math.PI * clamp01(p)) ** 0.6;
    apply(smooth(p), intensity);
  });

  return (
    <group>
      <mesh ref={core}>
        <sphereGeometry args={[0.062, 14, 14]} />
        <meshBasicMaterial color="#e0f4ff" transparent opacity={0} />
      </mesh>
      <sprite ref={halo}>
        <spriteMaterial
          map={glowTexture}
          color={BLUE}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <pointLight ref={point} color={BLUE} intensity={0} distance={2.6} />
    </group>
  );
}

/** Hero object: a minimal brushed-metal / electric-blue membership card. */
function MembershipCard({ reduced }: { reduced: boolean }) {
  const group = React.useRef<THREE.Group>(null);
  const rim = React.useRef<THREE.Mesh>(null);

  const body = useDisposable(() => makePlateGeometry(2.42, 1.53, 0.16, 0.055, 0.018), []);
  const chip = useDisposable(() => makePlateGeometry(0.34, 0.26, 0.05, 0.012, 0.006), []);
  const stripe = useDisposable(() => makePlateGeometry(0.92, 0.055, 0.027, 0.006, 0.003), []);
  const stripeShort = useDisposable(() => makePlateGeometry(0.56, 0.055, 0.027, 0.006, 0.003), []);
  const sparkGeo = useDisposable(() => {
    const s = new THREE.Shape();
    s.moveTo(0.09, 0.24);
    s.lineTo(-0.09, 0.02);
    s.lineTo(0.015, 0.02);
    s.lineTo(-0.06, -0.24);
    s.lineTo(0.11, -0.02);
    s.lineTo(-0.005, -0.02);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false });
  }, []);

  useFrame(({ clock }) => {
    if (reduced || !group.current) return;
    const t = clock.elapsedTime;
    group.current.position.y = 0.02 + Math.sin(t * 0.45) * 0.022;
    group.current.rotation.z = -0.055 + Math.sin(t * 0.32) * 0.012;

    if (rim.current) {
      const cycle = t % CYCLE;
      // the card briefly acknowledges the arriving current
      const hit = cycle > TRAVEL_END - 0.5 && cycle < TRAVEL_END + 0.9
        ? 1 - Math.abs(cycle - TRAVEL_END) / 0.9
        : 0;
      const mat = rim.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.16 + clamp01(hit) * 0.4;
    }
  });

  return (
    <group ref={group} position={[0.06, 0.02, 0]} rotation={[0.16, -0.34, -0.055]}>
      {/* brushed metal body */}
      <mesh geometry={body} castShadow={false}>
        <meshStandardMaterial color="#59708f" metalness={0.98} roughness={0.31} envMapIntensity={1} />
      </mesh>

      {/* electric-blue rim, pulses when the current lands */}
      <mesh ref={rim} geometry={body} scale={[1.012, 1.02, 0.9]} position={[0, 0, -0.004]}>
        <meshBasicMaterial color={BLUE} transparent opacity={0.16} />
      </mesh>

      {/* darker inner face keeps the metal from reading as a flat slab */}
      <mesh position={[0, 0, 0.037]}>
        <planeGeometry args={[2.24, 1.35]} />
        <meshStandardMaterial color="#1b2740" metalness={0.6} roughness={0.42} transparent opacity={0.72} />
      </mesh>

      <mesh geometry={chip} position={[-0.72, 0.35, 0.05]}>
        <meshStandardMaterial color="#e8b53c" metalness={0.95} roughness={0.28} emissive={AMBER} emissiveIntensity={0.12} />
      </mesh>

      <mesh geometry={sparkGeo} position={[0.86, 0.36, 0.05]} scale={1.25}>
        <meshStandardMaterial color="#bfe9ff" emissive={BLUE} emissiveIntensity={0.9} roughness={0.25} metalness={0.4} />
      </mesh>

      <mesh geometry={stripe} position={[-0.55, -0.3, 0.05]}>
        <meshStandardMaterial color="#93aecd" metalness={0.7} roughness={0.5} transparent opacity={0.5} />
      </mesh>
      <mesh geometry={stripeShort} position={[-0.73, -0.47, 0.05]}>
        <meshStandardMaterial color="#93aecd" metalness={0.7} roughness={0.55} transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

/** The reward token the card emits once the current has landed. */
function RewardToken({ glowTexture, reduced }: { glowTexture: THREE.Texture; reduced: boolean }) {
  const group = React.useRef<THREE.Group>(null);
  const disc = React.useRef<THREE.Mesh>(null);
  const halo = React.useRef<THREE.Sprite>(null);

  const apply = React.useCallback((progress: number) => {
    if (!group.current) return;
    const p = clamp01(progress);
    const eased = smooth(p);
    group.current.position.set(1.12 + eased * 0.5, -0.12 + eased * 1.02, 0.28 + eased * 0.2);
    group.current.rotation.y = eased * 1.9;
    const opacity = p < 0.18 ? p / 0.18 : p > 0.7 ? Math.max(0, 1 - (p - 0.7) / 0.3) : 1;
    group.current.scale.setScalar(0.72 + eased * 0.3);
    if (disc.current) {
      const mat = disc.current.material as THREE.MeshStandardMaterial;
      mat.opacity = opacity;
      mat.emissiveIntensity = 0.25 + opacity * 0.5;
    }
    if (halo.current) halo.current.material.opacity = opacity * 0.55;
  }, []);

  React.useEffect(() => {
    if (reduced) apply(0.45);
  }, [reduced, apply]);

  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.elapsedTime % CYCLE;
    if (t < TOKEN_START || t > TOKEN_END) {
      apply(0);
      if (group.current) group.current.scale.setScalar(0.001);
      return;
    }
    apply((t - TOKEN_START) / (TOKEN_END - TOKEN_START));
  });

  return (
    <group ref={group} scale={0.001}>
      <mesh ref={disc} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.19, 0.19, 0.045, 30]} />
        <meshStandardMaterial
          color="#f8c53a"
          emissive={AMBER}
          emissiveIntensity={0.4}
          metalness={0.85}
          roughness={0.3}
          transparent
          opacity={0}
        />
      </mesh>
      <sprite ref={halo} scale={1.05}>
        <spriteMaterial
          map={glowTexture}
          color={AMBER}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

/** Cue 1: a single LED glow. */
function LedGlow({ glowTexture, reduced }: { glowTexture: THREE.Texture; reduced: boolean }) {
  const halo = React.useRef<THREE.Sprite>(null);

  useFrame(({ clock }) => {
    if (reduced || !halo.current) return;
    const breathe = 0.92 + Math.sin(clock.elapsedTime * 0.55) * 0.06;
    halo.current.scale.setScalar(1.5 * breathe);
  });

  return (
    <group position={[-2.05, 0.86, -0.35]}>
      <sprite ref={halo} scale={1.5}>
        <spriteMaterial
          map={glowTexture}
          color={BLUE}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <mesh>
        <sphereGeometry args={[0.13, 22, 22]} />
        <meshStandardMaterial color="#dff3ff" emissive={BLUE} emissiveIntensity={1.5} roughness={0.15} />
      </mesh>
      <mesh position={[0, -0.16, 0]}>
        <cylinderGeometry args={[0.09, 0.12, 0.16, 20]} />
        <meshStandardMaterial color="#2a3a52" metalness={0.85} roughness={0.35} />
      </mesh>
      <pointLight color={BLUE} intensity={2.4} distance={4} />
    </group>
  );
}

/** Cue 2: modular-switch geometry, matte and quiet, behind the hero. */
function ModularSwitch() {
  const plate = useDisposable(() => makePlateGeometry(0.86, 1.1, 0.14, 0.07, 0.02), []);
  const rocker = useDisposable(() => makePlateGeometry(0.3, 0.5, 0.06, 0.05, 0.014), []);

  return (
    <group position={[1.92, 0.5, -1.15]} rotation={[0.1, -0.5, 0.05]}>
      <mesh geometry={plate}>
        <meshStandardMaterial color="#1c2739" metalness={0.35} roughness={0.62} />
      </mesh>
      <mesh geometry={rocker} position={[0, 0.06, 0.06]}>
        <meshStandardMaterial color="#2b3a53" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.36, 0.07]}>
        <circleGeometry args={[0.032, 16]} />
        <meshBasicMaterial color={BLUE} />
      </mesh>
    </group>
  );
}

/** Fake contact shadow — grounds the composition without a shadow map. */
function ContactShadow({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh position={[0.1, -1.06, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[5.4, 3.2]} />
      <meshBasicMaterial map={texture} transparent opacity={0.62} depthWrite={false} color="#03060d" />
    </mesh>
  );
}

/* -------------------------------------------------------------------- scene */

function Scene({ reduced }: { reduced: boolean }) {
  const { gl } = useThree();
  const curve = useCircuitCurve();

  const glowTexture = useDisposable(
    () =>
      makeRadialTexture([
        [0, "rgba(255,255,255,1)"],
        [0.35, "rgba(255,255,255,0.42)"],
        [1, "rgba(255,255,255,0)"],
      ]),
    []
  );
  const shadowTexture = useDisposable(
    () =>
      makeRadialTexture(
        [
          [0, "rgba(255,255,255,0.95)"],
          [0.55, "rgba(255,255,255,0.35)"],
          [1, "rgba(255,255,255,0)"],
        ],
        160
      ),
    []
  );

  React.useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [gl]);

  return (
    <>
      {/* Lighting: one key, one cool fill, one warm reward rim */}
      <ambientLight intensity={0.35} color="#93b4e0" />
      <directionalLight position={[-3.4, 4.2, 3.6]} intensity={2.1} color="#e9f3ff" />
      <directionalLight position={[3.2, 1.4, 2.2]} intensity={0.85} color="#ffd486" />
      <pointLight position={[-1.4, -1.6, 2.4]} intensity={2.4} color={BLUE_DEEP} distance={7} />

      <ContactShadow texture={shadowTexture} />
      <CircuitLine curve={curve} />
      <CurrentPulse curve={curve} glowTexture={glowTexture} reduced={reduced} />
      <LedGlow glowTexture={glowTexture} reduced={reduced} />
      <ModularSwitch />
      <MembershipCard reduced={reduced} />
      <RewardToken glowTexture={glowTexture} reduced={reduced} />
    </>
  );
}

/* ------------------------------------------------------------------- public */

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useTabVisible() {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function AuthVisual({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const visible = useTabVisible();

  return (
    <div className={`pointer-events-none absolute inset-0 ${className || ""}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0.35, 1.05, 6.15], fov: 32 }}
        dpr={[1, 1.75]}
        frameloop={reduced || !visible ? "demand" : "always"}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ camera }) => camera.lookAt(0.05, -0.02, 0)}
      >
        <Scene reduced={reduced} />
      </Canvas>
    </div>
  );
}

export default AuthVisual;
