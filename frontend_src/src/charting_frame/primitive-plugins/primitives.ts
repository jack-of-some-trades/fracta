
/**
 * Small File to register all primitives into a constructor map and the Primitive Tool Map
 * so both python and the UI, respectfully, can generate the various types of primitives.
 */

import { ArrowCursor, CrosshairCursor, DotCursor } from './cursors';
import { PrimitiveBase } from './primitive-base';
import { registerPrimitiveTool, registerSimpleTool } from './tool_ui_support';
import { TrendLine, TrendLineTool } from './two-point-primitives/trend_line';


export const primitives:Map<string, new(id:string, params:any) => PrimitiveBase> = new Map([
    ['TrendLine', TrendLine]
]) 

registerSimpleTool(DotCursor)
registerSimpleTool(ArrowCursor)
registerSimpleTool(CrosshairCursor)

registerPrimitiveTool(TrendLineTool)