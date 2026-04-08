/**
 * This provides debugging utilities for WebGL. Some of the functions are
 * from Khronos Group Inc. The copyright for these functions is below and
 * the given functions are noted. 
 */


/*
** Copyright (c) 2012 The Khronos Group Inc.
**
** Permission is hereby granted, free of charge, to any person obtaining a
** copy of this software and/or associated documentation files (the
** "Materials"), to deal in the Materials without restriction, including
** without limitation the rights to use, copy, modify, merge, publish,
** distribute, sublicense, and/or sell copies of the Materials, and to
** permit persons to whom the Materials are furnished to do so, subject to
** the following conditions:
**
** The above copyright notice and this permission notice shall be included
** in all copies or substantial portions of the Materials.
**
** THE MATERIALS ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
** EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
** MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
** IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
** CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
** TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
** MATERIALS OR THE USE OR OTHER DEALINGS IN THE MATERIALS.
*/

export interface GLErrorCallback {
    (err: number, functionName: string, args: IArguments) : void;
}

export interface GLCallback {
    (functionName: string, args: IArguments): void;
}

/**
 * Provides debugging tools for WebGL
 */
export class Debugger {
    
    /**
     * Prints a message to the console
     * @param msg the message
     * @param fontSize the pixel size of the font
     * @param color the color of the text
     */
    public static log(msg : string, fontSize : number = 12, color : string = "black") : void {
         window.console.log("%c" + msg, "color: " + color + "; font-size: " + fontSize + "px;");
    }

    /**
     * Prints an error message to the console
     * @param msg the message
     * @param fontSize the pixel font size
     * @param color the color of the text 
     */
    public static logError(msg : string, fontSize : number = 12, color : string = "red") {
        window.console.error("%c" + msg, "color: " + color + "; font-size: " + fontSize + "px;")
    }

    /**
     * Alerts the user with a message.
     * Alerts pause the running program. 
     */
    public static alertMsg(msg : string) {
      window.alert(msg);
    }

    /**
     * Alerts the user with an error message.
     * Alerts pause the running program. 
     */
    public static alertError(msg : string) {
      Debugger.alertMsg("ERROR: " + msg);
    }

    /**
     * Logs an error message on the given error. Prints the error string, which function
     * caused it, and the arguments to the function. Intended for use with Debugger.makeDebugContext().
     * @param error a gl error code
     * @param functionName the name of the gl function
     * @param args the arguments to the function
     */
    public static defaultErrorCallback(error: number, functionName: string, args: IArguments) {
      // apparently we can't do args.join(",");
      var argStr = "";
      var numArgs = args.length;
      for (var ii = 0; ii < numArgs; ++ii) {
        argStr += ((ii == 0) ? '' : ', ') +
            Debugger.glFunctionArgToString(functionName, numArgs, ii, args[ii]);
      }
      Debugger.logError("WebGL error "+ Debugger.glEnumToString(error) + " in "+ functionName +
            "(" + argStr + ")", 16);
    }

    /**
     * Throws an error for a given error code and function name.
     * Intended for use with Debugger.makeDebugContext()
     * @param error a gl error code
     * @param functionName the name of the gl function
     * @param args the arguments to the function
     */
    public static throwOnError(error: number, functionName: string, args: IArguments) {
      var argStr = "";
      var numArgs = args.length;
      for (var ii = 0; ii < numArgs; ++ii) {
        argStr += ((ii == 0) ? '' : ', ') +
            Debugger.glFunctionArgToString(functionName, numArgs, ii, args[ii]);
      }
      throw new Error("WebGL error "+ Debugger.glEnumToString(error) + " in "+ functionName +
            "(" + argStr + ")");
    }

    /**
     * Logs a function call and its arguments. Intended for use with Debugger.makeDebugContext().
     * @param functionName the name of the function
     * @param args the arguments to the function
     */
    public static logFunctionCall(functionName: string, args: IArguments) {
      var argStr = "";
      var numArgs = args.length;
      for (var ii = 0; ii < numArgs; ++ii) {
        argStr += ((ii == 0) ? '' : ', ') +
            Debugger.glFunctionArgToString(functionName, numArgs, ii, args[ii]);
      }
      Debugger.log(functionName + "(" + argStr + ")", 16);
    }

    /**
     * Validates that none of the arguments are undefined. Logs an error to the console
     * if the function had an undefined argument. Intended for use with Debugger.makeDebugContext().
     * @param functionName the name of the function
     * @param args the arguments to the function
     */
    public static logErrorOnUndefinedArg(functionName: string, args: IArguments) {
      for (var ii = 0; ii < args.length; ++ii) {
        if (args[ii] === undefined) {
          Debugger.logError("undefined passed to gl." + functionName + "(" +
                         Debugger.glFunctionArgsToString(functionName, args) + ")");
        }
      }
    }

    /**
     * Validates that none of the arguments are undefined. Throws an error
     * if the function had an undefined argument. Intended for use with
     * Debugger.makeDebugContext()
     * @param functionName the name of the function
     * @param args the arguments to the function
     */
    public static throwErrorOnUndefinedArg(functionName: string, args: IArguments) {
      for (var ii = 0; ii < args.length; ++ii) {
        if (args[ii] === undefined) {
          throw new Error("undefined passed to gl." + functionName + "(" +
                         Debugger.glFunctionArgsToString(functionName, args) + ")");
        }
      }
    }

    /**
     * Logs the function call then validates and logs any undefined arguments
     * to the funciton. Intended for use with Debugger.makeDebugContext()
     * @param functionName the name of the function.
     * @param args the arguments to the function
     */
    public static logAndValidate(functionName: string, args: IArguments) {
      Debugger.logFunctionCall(functionName, args);
      Debugger.logErrorOnUndefinedArg(functionName, args);
    }

    /**
     * Generates a GLCallback function that will run for a specific gl call.
     * @param glFunctionName 
     * @param glCallback 
     */
    public static generateGLCallback(glFunctionName: string, glCallback: GLCallback) : GLCallback {
      return function(functionName: string, args: IArguments) {
        if (functionName === glFunctionName) {
          glCallback(functionName, args);
        }
      }
    }

    /**
     * Generates a GLErrorCallback function that will run for a specific gl call
     * @param glFunctionName 
     * @param glErrorCallback 
     */
    public static generateGLErrorCallback(glFunctionName: string, glErrorCallback: GLErrorCallback) : GLErrorCallback{
      return function(error: number, functionName: string, args: IArguments) {
        if (functionName === glFunctionName) {
          glErrorCallback(error, functionName, args);
        }
      }
    }

    /**
     * Generates a new GLCallback function that will call the given list of callback functions
     * @param glCallbacks 
     */
    public static generateGLCallbackFromList(glCallbacks: GLCallback[]) : GLCallback {
      return function (functionName: string, args: IArguments) {
        for (let callback of glCallbacks) {
          callback(functionName, args);
        }
      }
    }

    /**
     * Generates a new GLErrorCallback function that will call the given list of callback functions
     * @param glErrorCallbacks 
     */
    public static generateGLErrorCallbackFromList(glErrorCallbacks: GLErrorCallback[]) : GLErrorCallback {
      return function(error: number, functionName: string, args: IArguments) {
        for (let callback of glErrorCallbacks) {
          callback(error, functionName, args);
        }
      }
    }

    /**
     * PROVIDED BY KHRONOS:
     * Which arguments are enums based on the number of arguments to the function.
     * So
     *    'texImage2D': {
     *       9: { 0:true, 2:true, 6:true, 7:true },
     *       6: { 0:true, 2:true, 3:true, 4:true },
     *    },
     *
     * means if there are 9 arguments then 6 and 7 are enums, if there are 6
     * arguments 3 and 4 are enums
     */
    public static readonly glValidEnumContexts = {
        // Generic setters and getters
      
        'enable': {1: { 0:true }},
        'disable': {1: { 0:true }},
        'getParameter': {1: { 0:true }},
      
        // Rendering
      
        'drawArrays': {3:{ 0:true }},
        'drawElements': {4:{ 0:true, 2:true }},
      
        // Shaders
      
        'createShader': {1: { 0:true }},
        'getShaderParameter': {2: { 1:true }},
        'getProgramParameter': {2: { 1:true }},
        'getShaderPrecisionFormat': {2: { 0: true, 1:true }},
      
        // Vertex attributes
      
        'getVertexAttrib': {2: { 1:true }},
        'vertexAttribPointer': {6: { 2:true }},
      
        // Textures
      
        'bindTexture': {2: { 0:true }},
        'activeTexture': {1: { 0:true }},
        'getTexParameter': {2: { 0:true, 1:true }},
        'texParameterf': {3: { 0:true, 1:true }},
        'texParameteri': {3: { 0:true, 1:true, 2:true }},
        // texImage2D and texSubImage2D are defined below with WebGL 2 entrypoints
        'copyTexImage2D': {8: { 0:true, 2:true }},
        'copyTexSubImage2D': {8: { 0:true }},
        'generateMipmap': {1: { 0:true }},
        // compressedTexImage2D and compressedTexSubImage2D are defined below with WebGL 2 entrypoints
      
        // Buffer objects
      
        'bindBuffer': {2: { 0:true }},
        // bufferData and bufferSubData are defined below with WebGL 2 entrypoints
        'getBufferParameter': {2: { 0:true, 1:true }},
      
        // Renderbuffers and framebuffers
      
        'pixelStorei': {2: { 0:true, 1:true }},
        // readPixels is defined below with WebGL 2 entrypoints
        'bindRenderbuffer': {2: { 0:true }},
        'bindFramebuffer': {2: { 0:true }},
        'checkFramebufferStatus': {1: { 0:true }},
        'framebufferRenderbuffer': {4: { 0:true, 1:true, 2:true }},
        'framebufferTexture2D': {5: { 0:true, 1:true, 2:true }},
        'getFramebufferAttachmentParameter': {3: { 0:true, 1:true, 2:true }},
        'getRenderbufferParameter': {2: { 0:true, 1:true }},
        'renderbufferStorage': {4: { 0:true, 1:true }},
      
        // Frame buffer operations (clear, blend, depth test, stencil)
      
        'clear': {1: { 0: { 'enumBitwiseOr': ['COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT', 'STENCIL_BUFFER_BIT'] }}},
        'depthFunc': {1: { 0:true }},
        'blendFunc': {2: { 0:true, 1:true }},
        'blendFuncSeparate': {4: { 0:true, 1:true, 2:true, 3:true }},
        'blendEquation': {1: { 0:true }},
        'blendEquationSeparate': {2: { 0:true, 1:true }},
        'stencilFunc': {3: { 0:true }},
        'stencilFuncSeparate': {4: { 0:true, 1:true }},
        'stencilMaskSeparate': {2: { 0:true }},
        'stencilOp': {3: { 0:true, 1:true, 2:true }},
        'stencilOpSeparate': {4: { 0:true, 1:true, 2:true, 3:true }},
      
        // Culling
      
        'cullFace': {1: { 0:true }},
        'frontFace': {1: { 0:true }},
      
        // ANGLE_instanced_arrays extension
      
        'drawArraysInstancedANGLE': {4: { 0:true }},
        'drawElementsInstancedANGLE': {5: { 0:true, 2:true }},
      
        // EXT_blend_minmax extension
      
        'blendEquationEXT': {1: { 0:true }},
      
        // WebGL 2 Buffer objects
      
        'bufferData': {
          3: { 0:true, 2:true }, // WebGL 1
          4: { 0:true, 2:true }, // WebGL 2
          5: { 0:true, 2:true }  // WebGL 2
        },
        'bufferSubData': {
          3: { 0:true }, // WebGL 1
          4: { 0:true }, // WebGL 2
          5: { 0:true }  // WebGL 2
        },
        'copyBufferSubData': {5: { 0:true, 1:true }},
        'getBufferSubData': {3: { 0:true }, 4: { 0:true }, 5: { 0:true }},
      
        // WebGL 2 Framebuffer objects
      
        'blitFramebuffer': {10: { 8: { 'enumBitwiseOr': ['COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT', 'STENCIL_BUFFER_BIT'] }, 9:true }},
        'framebufferTextureLayer': {5: { 0:true, 1:true }},
        'invalidateFramebuffer': {2: { 0:true }},
        'invalidateSubFramebuffer': {6: { 0:true }},
        'readBuffer': {1: { 0:true }},
      
        // WebGL 2 Renderbuffer objects
      
        'getInternalformatParameter': {3: { 0:true, 1:true, 2:true }},
        'renderbufferStorageMultisample': {5: { 0:true, 2:true }},
      
        // WebGL 2 Texture objects
      
        'texStorage2D': {5: { 0:true, 2:true }},
        'texStorage3D': {6: { 0:true, 2:true }},
        'texImage2D': {
          9: { 0:true, 2:true, 6:true, 7:true }, // WebGL 1 & 2
          6: { 0:true, 2:true, 3:true, 4:true }, // WebGL 1
          10: { 0:true, 2:true, 6:true, 7:true } // WebGL 2
        },
        'texImage3D': {
          10: { 0:true, 2:true, 7:true, 8:true },
          11: { 0:true, 2:true, 7:true, 8:true }
        },
        'texSubImage2D': {
          9: { 0:true, 6:true, 7:true }, // WebGL 1 & 2
          7: { 0:true, 4:true, 5:true }, // WebGL 1
          10: { 0:true, 6:true, 7:true } // WebGL 2
        },
        'texSubImage3D': {
          11: { 0:true, 8:true, 9:true },
          12: { 0:true, 8:true, 9:true }
        },
        'copyTexSubImage3D': {9: { 0:true }},
        'compressedTexImage2D': {
          7: { 0: true, 2:true }, // WebGL 1 & 2
          8: { 0: true, 2:true }, // WebGL 2
          9: { 0: true, 2:true }  // WebGL 2
        },
        'compressedTexImage3D': {
          8: { 0: true, 2:true },
          9: { 0: true, 2:true },
          10: { 0: true, 2:true }
        },
        'compressedTexSubImage2D': {
          8: { 0: true, 6:true }, // WebGL 1 & 2
          9: { 0: true, 6:true }, // WebGL 2
          10: { 0: true, 6:true } // WebGL 2
        },
        'compressedTexSubImage3D': {
          10: { 0: true, 8:true },
          11: { 0: true, 8:true },
          12: { 0: true, 8:true }
        },
      
        // WebGL 2 Vertex attribs
      
        'vertexAttribIPointer': {5: { 2:true }},
      
        // WebGL 2 Writing to the drawing buffer
      
        'drawArraysInstanced': {4: { 0:true }},
        'drawElementsInstanced': {5: { 0:true, 2:true }},
        'drawRangeElements': {6: { 0:true, 4:true }},
      
        // WebGL 2 Reading back pixels
      
        'readPixels': {
          7: { 4:true, 5:true }, // WebGL 1 & 2
          8: { 4:true, 5:true }  // WebGL 2
        },
      
        // WebGL 2 Multiple Render Targets
      
        'clearBufferfv': {3: { 0:true }, 4: { 0:true }},
        'clearBufferiv': {3: { 0:true }, 4: { 0:true }},
        'clearBufferuiv': {3: { 0:true }, 4: { 0:true }},
        'clearBufferfi': {4: { 0:true }},
      
        // WebGL 2 Query objects
      
        'beginQuery': {2: { 0:true }},
        'endQuery': {1: { 0:true }},
        'getQuery': {2: { 0:true, 1:true }},
        'getQueryParameter': {2: { 1:true }},
      
        // WebGL 2 Sampler objects
      
        'samplerParameteri': {3: { 1:true, 2:true }},
        'samplerParameterf': {3: { 1:true }},
        'getSamplerParameter': {2: { 1:true }},
      
        // WebGL 2 Sync objects
      
        'fenceSync': {2: { 0:true, 1: { 'enumBitwiseOr': [] } }},
        'clientWaitSync': {3: { 1: { 'enumBitwiseOr': ['SYNC_FLUSH_COMMANDS_BIT'] } }},
        'waitSync': {3: { 1: { 'enumBitwiseOr': [] } }},
        'getSyncParameter': {2: { 1:true }},
      
        // WebGL 2 Transform Feedback
      
        'bindTransformFeedback': {2: { 0:true }},
        'beginTransformFeedback': {1: { 0:true }},
        'transformFeedbackVaryings': {3: { 2:true }},
      
        // WebGL2 Uniform Buffer Objects and Transform Feedback Buffers
      
        'bindBufferBase': {3: { 0:true }},
        'bindBufferRange': {5: { 0:true }},
        'getIndexedParameter': {2: { 0:true }},
        'getActiveUniforms': {3: { 2:true }},
        'getActiveUniformBlockParameter': {3: { 2:true }}
    };

    /**
     * PROVIDED BY KHRONOS:
     * Map of numbers to names.
     */
    public static glEnums : Object | null = null;
    
    /**
     * PROVIDED BY KHRONOS:
     * Map of names to numbers.
     */
    public static enumStringToValue : Object | null = null;

    /**
     * PROVIDED BY KHRONOS
     * Initializes this module. Safe to call more than once.
     * @param {!WebGLRenderingContext} ctx A WebGL context. If
     *    you have more than one context it doesn't matter which one
     *    you pass in, it is only used to pull out constants.
     */
    public static init(ctx : WebGLRenderingContext) : void {
        if (Debugger.glEnums == null) {
            Debugger.glEnums = { };
            Debugger.enumStringToValue = { };
            for (var propertyName in ctx) {
                var temp: any = (ctx as any)[propertyName];
                if (typeof temp == 'number') {
                    (Debugger.glEnums as any)[temp] = propertyName;
                    (Debugger.enumStringToValue as any)[propertyName] = temp;
                }
            }
        }
    }

    /**
     * PROVIDED BY KHRONOS:
     * Checks the utils have been initialized.
     */
    public static checkInit() {
        if (Debugger.glEnums == null) {
          throw 'WebGLDebugUtils.init(ctx) not called';
        }
    }

    /**
     * PROVIDED BY KHRONOS
     * Returns true or false if value matches any WebGL enum
     * @param value Value to check if it might be an enum.
     * @return True if value matches one of the WebGL defined enums
     */
    public static mightBeEnum(value : any) : boolean {
        Debugger.checkInit();
        return ((Debugger.glEnums as any)[value] !== undefined);
    }

    /**
     * PROVIDED BY KHRONOS:
     * Gets a string version of a WebGL enum.
     *
     * Example:
     *   var str = WebGLDebugUtil.glEnumToString(ctx.getError());
     *
     * @param value Value to return an enum for
     * @return The string version of the enum.
     */
    public static glEnumToString(value : number) : string {
        Debugger.checkInit();
        var name = (Debugger.glEnums as any)[value];
        return (name !== undefined) ? ("gl." + name) :
            ("/*UNKNOWN WebGL ENUM*/ 0x" + value.toString(16) + "");
    }

    /**
     * PROVIDED BY KHRONOS:
     * Returns the string version of a WebGL argument.
     * Attempts to convert enum arguments to strings.
     * @param functionName the name of the WebGL function.
     * @param numArgs the number of arguments passed to the function.
     * @param argumentIndx the index of the argument.
     * @param value The value of the argument.
     * @return The value as a string.
     */
    public static glFunctionArgToString(functionName: string, numArgs: number, argumentIndex: number, value: any) : string {
        var funcInfo = (Debugger.glValidEnumContexts as any)[functionName];
        if (funcInfo !== undefined) {
          var funcInfo = funcInfo[numArgs];
          if (funcInfo !== undefined) {
            if (funcInfo[argumentIndex]) {
              if (typeof funcInfo[argumentIndex] === 'object' &&
                  funcInfo[argumentIndex]['enumBitwiseOr'] !== undefined) {
                var enums = funcInfo[argumentIndex]['enumBitwiseOr'];
                var orResult = 0;
                var orEnums = [];
                for (var i = 0; i < enums.length; ++i) {
                  var enumValue = (Debugger.enumStringToValue as any)[enums[i]];
                  if ((value & enumValue) !== 0) {
                    orResult |= enumValue;
                    orEnums.push(Debugger.glEnumToString(enumValue));
                  }
                }
                if (orResult === value) {
                  return orEnums.join(' | ');
                } else {
                  return Debugger.glEnumToString(value);
                }
              } else {
                return Debugger.glEnumToString(value);
              }
            }
          }
        }
        if (value === null) {
          return "null";
        } else if (value === undefined) {
          return "undefined";
        } else {
          return value.toString();
        }
    }

    /**
     * PROVIDED BY KHRONOS
     * Converts the arguments of a WebGL function to a string.
     * Attempts to convert enum arguments to strings.
     *
     * @param functionName the name of the WebGL function.
     * @param args The arguments.
     * @return The arguments as a string.
     */
    public static glFunctionArgsToString(functionName: string, args: IArguments) : string{
        // apparently we can't do args.join(",");
        var argStr = "";
        var numArgs = args.length;
        for (var ii = 0; ii < numArgs; ++ii) {
          argStr += ((ii == 0) ? '' : ', ') +
              Debugger.glFunctionArgToString(functionName, numArgs, ii, args[ii]);
        }
        return argStr;
    }

    /**
     * PROVIDED BY KHRONOS. Modified to keep up to date with standards
     * @param wrapper 
     * @param original 
     * @param propertyName 
     */
    public static makePropertyWrapper(wrapper: object, original: object, propertyName: string) {
        //log("wrap prop: " + propertyName);
        Object.defineProperty(wrapper, propertyName, {
            get: function() {return (original as any)[propertyName];},
            set: function(value) {(original as any)[propertyName] = value;}
        });
    }

    /**
     * PROVIDED BY KHRONOS:
     * Given a WebGL context returns a wrapped context that calls
     * gl.getError after every command and calls a function if the
     * result is not gl.NO_ERROR.
     *
     * @param ctx The webgl context to
     *        wrap.
     * @param {!function(err, funcName, args): void} opt_onErrorFunc
     *        The function to call when gl.getError returns an
     *        error. If not specified the default function calls
     *        console.log with a message.
     * @param {!function(funcName, args): void} opt_onFunc The
     *        function to call when each webgl function is called.
     *        You can use this to log all calls for example.
     * @param {!WebGLRenderingContext} opt_err_ctx The webgl context
     *        to call getError on if different than ctx.
     */
    public static makeDebugContext(ctx: WebGL2RenderingContext, opt_onErrorFunc: GLErrorCallback = Debugger.defaultErrorCallback, opt_onFunc?: GLCallback) : WebGL2RenderingContext {
        Debugger.init(ctx);
      
        // Holds booleans for each GL error so after we get the error ourselves
        // we can still return it to the client app.
        var glErrorShadow = { };
      
        // Makes a function that calls a WebGL function and then calls getError.
        function makeErrorWrapper(ctx : WebGL2RenderingContext, functionName: string) {
          return function() {
            if (opt_onFunc) {
              opt_onFunc(functionName, arguments);
            }
            var result = (ctx as any)[functionName].apply(ctx, arguments);
            var err = ctx.getError();
            if (err != 0) {
              (glErrorShadow as any)[err] = true;
              opt_onErrorFunc(err, functionName, arguments);
            }
            return result;
          };
        }
      
        // Make a an object that has a copy of every property of the WebGL context
        // but wraps all functions.
        var wrapper = {};
        for (var propertyName in ctx) {
          if (typeof (ctx as any)[propertyName] == 'function') {
            if (propertyName != 'getExtension') {
              (wrapper as any)[propertyName] = makeErrorWrapper(ctx, propertyName);
            } else {
              var wrapped : any = makeErrorWrapper(ctx, propertyName);
              (wrapper as any)[propertyName] = function () {
                var result = wrapped.apply(ctx, arguments);
                if (!result) {
                  return null;
                }
                return Debugger.makeDebugContext(result, opt_onErrorFunc, opt_onFunc);
              };
            }
          } else {
            Debugger.makePropertyWrapper(wrapper, ctx, propertyName);
          }
        }
      
        // Override the getError function with one that returns our saved results.
        (wrapper as WebGL2RenderingContext).getError = function() : number {
          for (var err in glErrorShadow) {
            var errNum = parseInt(err);
            if (glErrorShadow.hasOwnProperty(err)) {
              if ((glErrorShadow as any)[err]) {
                (glErrorShadow as any)[err] = false;
                return errNum;
              }
            }
          }
          return ctx.NO_ERROR;
        };
      
        return (wrapper as WebGL2RenderingContext);
    }
}    