"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

type VisitorLocation = {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  count: number;
  lastSeenAt: string;
};

type VisitorSnapshot = {
  available: true;
  locations: VisitorLocation[];
};

const INITIAL_PHI = -15 * Math.PI / 180;
const INITIAL_THETA = 12 * Math.PI / 180;
const MAX_RENDER_SIZE = 2048;
const RECORD_KEY = "minelog-visitor-atlas-day";
const NOOP = () => {};
const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_position;
  void main() {
    v_position = a_position;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;
const FRAGMENT_SHADER = `
  precision highp float;
  varying vec2 v_position;
  uniform sampler2D u_texture;
  uniform float u_phi;
  uniform float u_theta;
  const float PI = 3.141592653589793;

  void main() {
    vec2 point = v_position;
    float distanceSquared = dot(point, point);
    if (distanceSquared > 1.0) discard;

    vec3 camera = vec3(point, sqrt(max(0.0, 1.0 - distanceSquared)));
    float cosTheta = cos(u_theta);
    float sinTheta = sin(u_theta);
    vec3 tilted = vec3(
      camera.x,
      cosTheta * camera.y + sinTheta * camera.z,
      -sinTheta * camera.y + cosTheta * camera.z
    );
    float cosPhi = cos(u_phi);
    float sinPhi = sin(u_phi);
    vec3 world = vec3(
      cosPhi * tilted.x + sinPhi * tilted.z,
      tilted.y,
      -sinPhi * tilted.x + cosPhi * tilted.z
    );

    float longitude = 0.5 - atan(world.z, world.x) / (2.0 * PI);
    float latitude = asin(clamp(world.y, -1.0, 1.0)) / PI + 0.5;
    vec3 satellite = texture2D(u_texture, vec2(longitude, latitude)).rgb;

    vec3 lightDirection = normalize(vec3(-0.42, 0.62, 1.0));
    float diffuse = max(dot(camera, lightDirection), 0.0);
    float light = 0.58 + 0.54 * diffuse;
    float atmosphere = pow(1.0 - camera.z, 2.15);
    vec3 color = satellite * light;
    color = clamp((color - 0.5) * 1.06 + 0.5, 0.0, 1.0);
    color += vec3(0.08, 0.31, 0.5) * atmosphere * 0.48;
    color = mix(color, color * vec3(0.93, 0.98, 1.04), 0.08);
    float alpha = 1.0 - smoothstep(0.965, 1.0, distanceSquared);
    gl_FragColor = vec4(color, alpha);
  }
`;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function isVisitorLocation(value: unknown): value is VisitorLocation {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<VisitorLocation>;
  return typeof source.latitude === "number"
    && Number.isFinite(source.latitude)
    && source.latitude >= -90
    && source.latitude <= 90
    && typeof source.longitude === "number"
    && Number.isFinite(source.longitude)
    && source.longitude >= -180
    && source.longitude <= 180
    && typeof source.city === "string"
    && source.city.length <= 64
    && typeof source.country === "string"
    && source.country.length <= 16
    && typeof source.count === "number"
    && Number.isFinite(source.count)
    && source.count > 0
    && typeof source.lastSeenAt === "string"
    && Number.isFinite(Date.parse(source.lastSeenAt));
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("无法创建地球着色器");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "地球着色器编译失败";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error("无法创建地球渲染程序");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "地球渲染程序链接失败";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function projectLocation(location: VisitorLocation, phi: number, theta: number) {
  const latitude = location.latitude * Math.PI / 180;
  const longitude = location.longitude * Math.PI / 180;
  const cosLatitude = Math.cos(latitude);
  const worldX = cosLatitude * Math.cos(longitude);
  const worldY = Math.sin(latitude);
  const worldZ = -cosLatitude * Math.sin(longitude);

  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const rotatedX = cosPhi * worldX - sinPhi * worldZ;
  const rotatedZ = sinPhi * worldX + cosPhi * worldZ;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  return {
    x: rotatedX,
    y: cosTheta * worldY - sinTheta * rotatedZ,
    z: sinTheta * worldY + cosTheta * rotatedZ,
  };
}

function prepareEarthTexture(image: HTMLImageElement, width: number): TexImageSource {
  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = width / 2;

  const context = surface.getContext("2d");
  if (!context) return image;

  context.drawImage(image, 0, 0, surface.width, surface.height);
  return surface;
}

export function VisitorGlobe({ offline, active = true }: { offline: boolean; active?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const globeCanvasRef = useRef<HTMLCanvasElement>(null);
  const markerCanvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(INITIAL_PHI);
  const thetaRef = useRef(INITIAL_THETA);
  const requestRenderRef = useRef(NOOP);
  const activeRef = useRef(active);
  const draggingRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const locationsRef = useRef<VisitorLocation[]>([]);
  const [locations, setLocations] = useState<VisitorLocation[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    activeRef.current = active;
    requestRenderRef.current();
  }, [active]);

  useEffect(() => {
    locationsRef.current = locations;
    requestRenderRef.current();
  }, [locations]);

  useEffect(() => {
    if (offline) return undefined;
    const controller = new AbortController();
    let disposed = false;
    const today = new Date().toISOString().slice(0, 10);
    let shouldRecord = true;
    try {
      shouldRecord = window.localStorage.getItem(RECORD_KEY) !== today;
    } catch {
      // The globe works without persistent browser storage.
    }

    void fetch("/api/visitor-locations", {
      method: shouldRecord ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as Partial<VisitorSnapshot>;
      if (disposed || payload.available !== true || !Array.isArray(payload.locations)) return;
      setLocations(payload.locations.filter(isVisitorLocation).slice(0, 64));
      if (shouldRecord) {
        try {
          window.localStorage.setItem(RECORD_KEY, today);
        } catch {
          // Recording remains privacy-preserving even if this optimization is unavailable.
        }
      }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
    });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [offline]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = globeCanvasRef.current;
    const markerCanvas = markerCanvasRef.current;
    if (!stage || !canvas || !markerCanvas) return undefined;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    const markerContext = markerCanvas.getContext("2d");
    if (!gl || !markerContext) return undefined;

    let program: WebGLProgram;
    try {
      program = createProgram(gl);
    } catch {
      return undefined;
    }
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const phiLocation = gl.getUniformLocation(program, "u_phi");
    const thetaLocation = gl.getUniformLocation(program, "u_theta");
    const textureLocation = gl.getUniformLocation(program, "u_texture");
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) {
      if (buffer) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      gl.deleteProgram(program);
      return undefined;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 23, 33, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let cssSize = 1;
    let animationFrame = 0;
    let disposed = false;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionPreference.matches;

    const render = (time: number) => {
      animationFrame = 0;
      if (disposed) return;
      if (activeRef.current && !draggingRef.current && !reducedMotion) phiRef.current += 0.00036;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(textureLocation, 0);
      gl.uniform1f(phiLocation, phiRef.current);
      gl.uniform1f(thetaLocation, thetaRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      markerContext.clearRect(0, 0, cssSize, cssSize);
      for (const [index, location] of locationsRef.current.entries()) {
        const projected = projectLocation(location, phiRef.current, thetaRef.current);
        if (projected.z <= 0) continue;
        const x = (projected.x * 0.5 + 0.5) * cssSize;
        const y = (-projected.y * 0.5 + 0.5) * cssSize;
        const pulse = reducedMotion ? 1 : 0.78 + Math.sin(time / 420 + index * 1.45) * 0.22;
        const radius = (4.5 + Math.min(4, Math.log2(location.count + 1))) * pulse;
        markerContext.beginPath();
        markerContext.arc(x, y, radius * 2.4, 0, Math.PI * 2);
        markerContext.fillStyle = "rgba(183, 241, 111, 0.08)";
        markerContext.fill();
        markerContext.beginPath();
        markerContext.arc(x, y, radius, 0, Math.PI * 2);
        markerContext.fillStyle = "rgba(202, 255, 132, 0.95)";
        markerContext.shadowColor = "rgba(183, 241, 111, 0.9)";
        markerContext.shadowBlur = 13;
        markerContext.fill();
        markerContext.shadowBlur = 0;
      }
      if (activeRef.current && !reducedMotion) animationFrame = window.requestAnimationFrame(render);
    };
    const requestRender = () => {
      if (!disposed && !animationFrame) animationFrame = window.requestAnimationFrame(render);
    };
    requestRenderRef.current = requestRender;

    const resize = () => {
      cssSize = Math.max(320, Math.round(stage.getBoundingClientRect().width));
      const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
      const renderSize = Math.min(MAX_RENDER_SIZE, Math.round(cssSize * pixelRatio));
      if (canvas.width !== renderSize || canvas.height !== renderSize) {
        canvas.width = renderSize;
        canvas.height = renderSize;
        markerCanvas.width = renderSize;
        markerCanvas.height = renderSize;
        const renderScale = renderSize / cssSize;
        markerContext.setTransform(renderScale, 0, 0, renderScale, 0, 0);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    resize();

    const handleMotionPreference = () => {
      reducedMotion = motionPreference.matches;
      requestRender();
    };
    motionPreference.addEventListener("change", handleMotionPreference);

    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";
    image.onload = () => {
      if (disposed) return;
      const maximumTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const uploadWidth = Math.min(4096, maximumTextureSize);
      const source = prepareEarthTexture(image, uploadWidth);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      // Derivatives jump at the longitude wrap. Mipmapping interprets that
      // jump as an extremely minified strip and draws a dark vertical seam.
      // Linear repeat sampling keeps the equirectangular edges continuous.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      requestRender();
    };
    image.src = "/earth/solar-system-scope-earth-8k.jpg";

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      motionPreference.removeEventListener("change", handleMotionPreference);
      requestRenderRef.current = NOOP;
      image.onload = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setIsDragging(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const drag = draggingRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    phiRef.current -= (event.clientX - drag.x) / 210;
    thetaRef.current = clamp(thetaRef.current + (event.clientY - drag.y) / 250, -1.05, 1.05);
    draggingRef.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
    requestRenderRef.current();
  };

  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    if (draggingRef.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    draggingRef.current = null;
    setIsDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === "ArrowLeft") phiRef.current += 0.08;
    else if (event.key === "ArrowRight") phiRef.current -= 0.08;
    else if (event.key === "ArrowUp") thetaRef.current = clamp(thetaRef.current - 0.08, -1.05, 1.05);
    else if (event.key === "ArrowDown") thetaRef.current = clamp(thetaRef.current + 0.08, -1.05, 1.05);
    else return;
    event.preventDefault();
    requestRenderRef.current();
  };

  return <div className={`earth-stage${isDragging ? " is-dragging" : ""}`} ref={stageRef}>
    <canvas
      ref={globeCanvasRef}
      className="earth-canvas"
      role="img"
      aria-label={offline ? "缓慢旋转的地球仪，可按住拖动或使用方向键调整视角" : "缓慢旋转的地球仪，闪光处为近七天访客地点，可按住拖动或使用方向键调整视角"}
      aria-roledescription="交互式地球仪"
      tabIndex={active ? 0 : -1}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onKeyDown={handleKeyDown}
    />
    <canvas ref={markerCanvasRef} className="earth-markers" aria-hidden="true" />
  </div>;
}
