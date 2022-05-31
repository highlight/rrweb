/**
 * @jest-environment jsdom
 */

import { polyfillWebGLGlobals } from '../utils';
polyfillWebGLGlobals();

import webglMutation, { variableListFor } from '../../src/replay/canvas/webgl';
import { CanvasContext } from '../../src/types';

let canvas: HTMLCanvasElement;
describe('webglMutation', () => {
  beforeEach(() => {
    canvas = document.createElement('canvas');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create webgl variables', async () => {
    const createShaderMock = jest.fn().mockImplementation(() => {
      return new WebGLShader();
    });
    const context = ({
      createShader: createShaderMock,
    } as unknown) as WebGLRenderingContext;
    jest.spyOn(canvas, 'getContext').mockImplementation(() => {
      return context;
    });

    expect(variableListFor(context, 'WebGLShader')).toHaveLength(0);

    webglMutation({
      mutation: {
        property: 'createShader',
        args: [35633],
      },
      type: CanvasContext.WebGL,
      target: canvas,
      imageMap: new Map(),
      errorHandler: () => {},
    });

    expect(createShaderMock).toHaveBeenCalledWith(35633);
    expect(variableListFor(context, 'WebGLShader')).toHaveLength(1);
  });
});
