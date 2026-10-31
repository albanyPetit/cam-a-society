// WebGL film pipeline. One shared WebGL context renders every photo:
//
//   source ──grade──▶ graded ─┬─ downscale + blur ──────────▶ soft  ─┐
//                             └─ bright pass + blur ─────────▶ glow ─┼─ composite ─▶ canvas
//                                                                    ┘
// grade:     exposure, warm balance with skin protection, tone curve,
//            split toning, saturation
// composite: edge softness, halation, light leak, vignette, grain
//
// The date stamp is drawn afterwards with the 2D canvas API.

import {
  computeExposureGain,
  formatDateStamp,
  pickLightLeak,
  toLinear,
  type LightLeak,
} from "./params";
import { filmPreset, type FilmPreset } from "./preset";
import { BLUR, BRIGHT_PASS, COMPOSITE, GRADE, VERTEX } from "./shaders";

export type LeakMode = "auto" | "on" | "off";

export type FilmOptions = {
  preset?: FilmPreset;
  // Same seed → same grain and same light-leak decision.
  seed: number;
  lightLeak?: LeakMode;
  dateStamp?: Date | null;
};

// Applies the film look to `canvas` in place. Returns whether this photo got
// a light leak. If WebGL isn't available the photo is left untouched.
export function applyFilm(
  canvas: HTMLCanvasElement,
  { preset = filmPreset, seed, lightLeak = "auto", dateStamp }: FilmOptions,
): { hasLightLeak: boolean; applied: boolean; gain: number } {
  const leak =
    lightLeak === "off"
      ? null
      : pickLightLeak(seed, {
          ...preset.lightLeak,
          probability: lightLeak === "on" ? 1 : preset.lightLeak.probability,
        });

  const renderer = getRenderer();
  const ctx = canvas.getContext("2d");
  if (!renderer || !ctx)
    return { hasLightLeak: false, applied: false, gain: 1 };

  const gain = computeExposureGain(sampleLuminances(canvas), preset.exposure);
  const output = renderer.render(canvas, { preset, seed, gain, leak });
  ctx.drawImage(output, 0, 0, canvas.width, canvas.height);

  if (dateStamp) drawDateStamp(ctx, canvas, dateStamp, preset.dateStamp);
  return { hasLightLeak: leak !== null, applied: true, gain };
}

// --- Auto exposure input ---------------------------------------------------

let sampler: HTMLCanvasElement | null = null;

// Linear luminance of a 48×48 thumbnail: enough to judge the exposure.
function sampleLuminances(source: HTMLCanvasElement): Float32Array {
  const size = 48;
  sampler ??= document.createElement("canvas");
  sampler.width = size;
  sampler.height = size;
  const ctx = sampler.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    const r = toLinear(data[i * 4] / 255);
    const g = toLinear(data[i * 4 + 1] / 255);
    const b = toLinear(data[i * 4 + 2] / 255);
    out[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return out;
}

// --- Date stamp --------------------------------------------------------------

function drawDateStamp(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  date: Date,
  style: FilmPreset["dateStamp"],
) {
  const short = Math.min(canvas.width, canvas.height);
  const size = Math.round(short * style.sizeRatio);
  const margin = Math.round(short * style.margin);

  ctx.save();
  ctx.font = `bold ${size}px "Courier New", ui-monospace, monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = style.color;
  // Glow, like light burned into the film by the camera's LEDs.
  ctx.shadowColor = style.color;
  ctx.shadowBlur = size * 0.5;
  ctx.globalAlpha = 0.9;
  const text = formatDateStamp(date);
  const x = canvas.width - margin;
  const y = canvas.height - margin;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * 0.15;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// --- WebGL renderer -----------------------------------------------------------

type Target = {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
};
type Program = {
  program: WebGLProgram;
  uniform: (name: string) => WebGLUniformLocation | null;
};

let shared: FilmRenderer | null | undefined;

function getRenderer(): FilmRenderer | null {
  if (shared && shared.gl.isContextLost()) shared = undefined;
  if (shared === undefined) {
    try {
      shared = new FilmRenderer();
    } catch {
      shared = null; // no WebGL: photos are saved without the effect
    }
  }
  return shared;
}

class FilmRenderer {
  readonly canvas = document.createElement("canvas");
  readonly gl: WebGLRenderingContext;
  private grade: Program;
  private bright: Program;
  private blur: Program;
  private composite: Program;
  private source: WebGLTexture;
  private targets = new Map<string, Target>();

  constructor() {
    const gl = this.canvas.getContext("webgl", {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) throw new Error("webgl_unavailable");
    this.gl = gl;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    this.grade = this.program(GRADE);
    this.bright = this.program(BRIGHT_PASS);
    this.blur = this.program(BLUR);
    this.composite = this.program(COMPOSITE);
    this.source = this.texture();
  }

  render(
    image: HTMLCanvasElement,
    opts: {
      preset: FilmPreset;
      seed: number;
      gain: number;
      leak: LightLeak | null;
    },
  ): HTMLCanvasElement {
    const { gl } = this;
    const { preset: p } = opts;
    const w = image.width;
    const h = image.height;
    const qw = Math.max(1, Math.round(w / 4));
    const qh = Math.max(1, Math.round(h / 4));
    // Spatial parameters are defined for a 2048px-wide photo.
    const scale = Math.max(w, h) / 2048;

    this.canvas.width = w;
    this.canvas.height = h;

    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);

    // 1. Grade.
    const graded = this.target("graded", w, h);
    this.draw(this.grade, graded, { uImage: this.source }, (u) => {
      gl.uniform1f(u("uGain"), opts.gain);
      gl.uniform1f(u("uWarmth"), p.color.warmth);
      gl.uniform1f(u("uTint"), p.color.tint);
      gl.uniform1f(u("uSkinProtection"), p.color.skinProtection);
      gl.uniform3fv(u("uShadowTint"), p.color.shadowTint);
      gl.uniform1f(u("uShadowTintAmount"), p.color.shadowTintAmount);
      gl.uniform3fv(u("uHighlightTint"), p.color.highlightTint);
      gl.uniform1f(u("uHighlightTintAmount"), p.color.highlightTintAmount);
      gl.uniform1f(u("uContrast"), p.tone.contrast);
      gl.uniform1f(u("uBlackLift"), p.tone.blackLift);
      gl.uniform1f(u("uWhitePoint"), p.tone.whitePoint);
      gl.uniform1f(u("uSatGlobal"), p.saturation.global);
      gl.uniform1f(u("uSatReds"), p.saturation.reds);
      gl.uniform1f(u("uSatGreens"), p.saturation.greens);
      gl.uniform1f(u("uSatSkin"), p.saturation.skin);
    });

    // 2. Soft copy for the edges, at quarter resolution.
    const soft = this.blurInto(
      graded.texture,
      "soft",
      qw,
      qh,
      (p.edgeSoftness.radius * scale) / 4,
    );

    // 3. Halation glow: bright parts, blurred wide.
    const brightQ = this.target("bright", qw, qh);
    this.draw(this.bright, brightQ, { uImage: graded.texture }, (u) => {
      gl.uniform1f(u("uThreshold"), p.halation.threshold);
    });
    const glow = this.blurInto(
      brightQ.texture,
      "glow",
      qw,
      qh,
      (p.halation.radius * scale) / 4,
    );

    // 4. Composite to the canvas.
    const leak = opts.leak;
    this.draw(
      this.composite,
      null,
      { uGraded: graded.texture, uSoft: soft.texture, uGlow: glow.texture },
      (u) => {
        gl.uniform1f(u("uAspect"), w / h);
        gl.uniform1f(u("uEdgeAmount"), p.edgeSoftness.amount);
        gl.uniform1f(u("uEdgeStart"), p.edgeSoftness.start);
        gl.uniform1f(u("uHalStrength"), p.halation.strength);
        gl.uniform3fv(u("uHalColor"), p.halation.color);
        gl.uniform1f(u("uLeakOn"), leak ? 1 : 0);
        if (leak) {
          const geo = leakGeometry(leak);
          gl.uniform2fv(u("uLeakOrigin"), geo.origin);
          gl.uniform2fv(u("uLeakAlong"), geo.along);
          gl.uniform2fv(u("uLeakInward"), geo.inward);
          gl.uniform1f(u("uLeakSpread"), leak.spread);
          gl.uniform1f(u("uLeakSize"), p.lightLeak.size);
          gl.uniform1f(u("uLeakIntensity"), p.lightLeak.intensity);
          gl.uniform3fv(u("uLeakA"), p.lightLeak.colorA);
          gl.uniform3fv(u("uLeakB"), p.lightLeak.colorB);
        }
        gl.uniform1f(u("uVigAmount"), p.vignette.amount);
        gl.uniform1f(u("uVigSoftness"), p.vignette.softness);
        gl.uniform1f(u("uGrainAmount"), p.grain.amount);
        gl.uniform1f(u("uGrainSize"), Math.max(0.5, p.grain.size * scale));
        gl.uniform1f(u("uGrainShadowBoost"), p.grain.shadowBoost);
        gl.uniform1f(u("uSeed"), opts.seed % 997);
      },
    );

    return this.canvas;
  }

  // Two rounds of horizontal + vertical blur; returns the target holding
  // the result.
  private blurInto(
    input: WebGLTexture,
    name: string,
    w: number,
    h: number,
    radius: number,
  ): Target {
    const a = this.target(`${name}-a`, w, h);
    const b = this.target(`${name}-b`, w, h);
    // Our 5-tap kernel reaches ~3.2 texels per unit of step.
    const step = Math.max(radius, 0.01) / 3.23 / Math.SQRT2;
    let src = input;
    for (let i = 0; i < 2; i++) {
      this.draw(this.blur, a, { uImage: src }, (u) =>
        this.gl.uniform2f(u("uStep"), step / w, 0),
      );
      this.draw(this.blur, b, { uImage: a.texture }, (u) =>
        this.gl.uniform2f(u("uStep"), 0, step / h),
      );
      src = b.texture;
    }
    return b;
  }

  private draw(
    prog: Program,
    target: Target | null,
    textures: Record<string, WebGLTexture>,
    setUniforms: (u: Program["uniform"]) => void,
  ) {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fbo ?? null);
    gl.viewport(
      0,
      0,
      target?.w ?? this.canvas.width,
      target?.h ?? this.canvas.height,
    );
    gl.useProgram(prog.program);

    const pos = gl.getAttribLocation(prog.program, "aPos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    Object.entries(textures).forEach(([name, texture], unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(prog.uniform(name), unit);
    });
    setUniforms(prog.uniform);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private target(name: string, w: number, h: number): Target {
    const existing = this.targets.get(name);
    if (existing && existing.w === w && existing.h === h) return existing;

    const { gl } = this;
    const texture = existing?.texture ?? this.texture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    const fbo = existing?.fbo ?? gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );

    const target = { texture, fbo, w, h };
    this.targets.set(name, target);
    return target;
  }

  private texture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // CLAMP + LINEAR works for non-power-of-two sizes in WebGL 1.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private program(fragment: string): Program {
    const { gl } = this;
    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "shader_compile_failed");
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "program_link_failed");
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      program,
      uniform: (name) => {
        if (!cache.has(name))
          cache.set(name, gl.getUniformLocation(program, name));
        return cache.get(name)!;
      },
    };
  }
}

// Texture space has (0,0) at the bottom-left; "top" is y = 1.
function leakGeometry(leak: LightLeak) {
  const t = leak.position;
  switch (leak.side) {
    case 0:
      return { origin: [t, 1], along: [1, 0], inward: [0, -1] };
    case 1:
      return { origin: [1, t], along: [0, 1], inward: [-1, 0] };
    case 2:
      return { origin: [t, 0], along: [1, 0], inward: [0, 1] };
    default:
      return { origin: [0, t], along: [0, 1], inward: [1, 0] };
  }
}
