import { decode } from 'base64-arraybuffer';
import { Replayer } from '../';
import {
  CanvasContext,
  canvasMutationCommand,
  SerializedWebGlArg,
} from '../../types';

// TODO: add ability to wipe this list
type GLVarMap = Map<string, any[]>;
const webGLVarMap: Map<
  WebGLRenderingContext | WebGL2RenderingContext,
  GLVarMap
> = new Map();
export function variableListFor(
  ctx: WebGLRenderingContext | WebGL2RenderingContext,
  ctor: string,
) {
  let contextMap = webGLVarMap.get(ctx);
  if (!contextMap) {
    contextMap = new Map();
    webGLVarMap.set(ctx, contextMap);
  }
  if (!contextMap.has(ctor)) {
    contextMap.set(ctor, []);
  }
  return contextMap.get(ctor) as any[];
}

function getContext(
  target: HTMLCanvasElement,
  type: CanvasContext,
): WebGLRenderingContext | WebGL2RenderingContext | null {
  // Note to whomever is going to implement support for `contextAttributes`:
  // if `preserveDrawingBuffer` is set to true,
  // you might have to do `ctx.flush()` before every webgl canvas event
  try {
    if (type === CanvasContext.WebGL) {
      return (
        target.getContext('webgl')! || target.getContext('experimental-webgl')
      );
    }
    return target.getContext('webgl2')!;
  } catch (e) {
    return null;
  }
}

const WebGLVariableConstructorsNames = [
  'WebGLActiveInfo',
  'WebGLBuffer',
  'WebGLFramebuffer',
  'WebGLProgram',
  'WebGLRenderbuffer',
  'WebGLShader',
  'WebGLShaderPrecisionFormat',
  'WebGLTexture',
  'WebGLUniformLocation',
  'WebGLVertexArrayObject',
];

function saveToWebGLVarMap(
  ctx: WebGLRenderingContext | WebGL2RenderingContext,
  result: any,
) {
  if (!result?.constructor) return; // probably null or undefined

  const { name } = result.constructor;
  if (!WebGLVariableConstructorsNames.includes(name)) return; // not a WebGL variable

  const variables = variableListFor(ctx, name);
  if (!variables.includes(result)) variables.push(result);
}

export function deserializeArg(
  imageMap: Replayer['imageMap'],
  ctx: WebGLRenderingContext | WebGL2RenderingContext,
): (arg: SerializedWebGlArg) => any {
  return (arg: SerializedWebGlArg): any => {
    if (arg && typeof arg === 'object' && 'rr_type' in arg) {
      if ('index' in arg) {
        const { rr_type: name, index } = arg;
        return variableListFor(ctx, name)[index];
      } else if ('args' in arg) {
        const { rr_type: name, args } = arg;
        const ctor = window[name as keyof Window];

        return new ctor(...args.map(deserializeArg(imageMap, ctx)));
      } else if ('base64' in arg) {
        return decode(arg.base64);
      } else if ('src' in arg) {
        const image = imageMap.get(arg.src);
        if (image) {
          return image;
        } else {
          const image = new Image();
          image.src = arg.src;
          imageMap.set(arg.src, image);
          return image;
        }
      }
    } else if (Array.isArray(arg)) {
      return arg.map(deserializeArg(imageMap, ctx));
    }
    return arg;
  };
}

export default function webglMutation({
  mutation,
  target,
  type,
  imageMap,
  errorHandler,
}: {
  mutation: canvasMutationCommand;
  target: HTMLCanvasElement;
  type: CanvasContext;
  imageMap: Replayer['imageMap'];
  errorHandler: Replayer['warnCanvasMutationFailed'];
}): void {
  try {
    const ctx = getContext(target, type);
    if (!ctx) return;

    // NOTE: if `preserveDrawingBuffer` is set to true,
    // we must flush the buffers on every new canvas event
    // if (mutation.newFrame) ctx.flush();

    if (mutation.setter) {
      // skip some read-only type checks
      // tslint:disable-next-line:no-any
      (ctx as any)[mutation.property] = mutation.args[0];
      return;
    }
    const original = ctx[
      mutation.property as Exclude<keyof typeof ctx, 'canvas'>
    ] as Function;

    const args = mutation.args.map(deserializeArg(imageMap, ctx));
    const result = original.apply(ctx, args);
    saveToWebGLVarMap(ctx, result);

    // Slows down replay considerably, only use for debugging
    const debugMode = false;
    if (debugMode) {
      if (mutation.property === 'compileShader') {
        if (!ctx.getShaderParameter(args[0], ctx.COMPILE_STATUS))
          console.warn(
            'something went wrong in replay',
            ctx.getShaderInfoLog(args[0]),
          );
      } else if (mutation.property === 'linkProgram') {
        ctx.validateProgram(args[0]);
        if (!ctx.getProgramParameter(args[0], ctx.LINK_STATUS))
          console.warn(
            'something went wrong in replay',
            ctx.getProgramInfoLog(args[0]),
          );
      }
      const webglError = ctx.getError();
      if (webglError !== ctx.NO_ERROR) {
        console.warn(
          'WEBGL ERROR',
          webglError,
          'on command:',
          mutation.property,
          ...args,
        );
      }
    }
  } catch (error) {
    errorHandler(mutation, error);
  }
}
