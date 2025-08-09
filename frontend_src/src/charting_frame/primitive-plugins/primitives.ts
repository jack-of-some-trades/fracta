
/**
 * Small File to register all primitives into a constructor map and the Primitive Tool Map
 * so both python and the UI, respectfully, can generate the various types of primitives.
 */

import { ArrowCursor, CrosshairCursor, DotCursor } from './cursors';
import { HorizRay, HorizRayTool } from './one-point-primitives/horiz_ray';
import { PrimitiveBase } from './primitive-base';
import { registerPrimitiveTool, registerSimpleTool } from './tool_ui_support';
import { TrendLine, TrendLineTool } from './two-point-primitives/trend_line';

//@ts-ignore : ignore the typing error that occurs when Primitives require different param types.
export const primitives:Map<string, new(id:string, params:any) => PrimitiveBase> = new Map([
    ['TrendLine', TrendLine],
    ['HorizRay', HorizRay],
]) 

registerSimpleTool(DotCursor)
registerSimpleTool(ArrowCursor)
registerSimpleTool(CrosshairCursor)

registerPrimitiveTool(HorizRayTool)
registerPrimitiveTool(TrendLineTool)