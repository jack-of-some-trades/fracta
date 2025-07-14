
/**
 * Small File to register all primitives into a constructor map and the Primitive Tool Map
 * so both python and the UI, respectfully, can generate the various types of primitives.
 */

import { PrimitiveBase } from './primitive-base';
import { registerPrimitiveTool } from './tool_ui_support';
import { TrendLine } from './trend-line/trend-line';
import { TrendLineTool } from './trend-line/trend-line-ui';


export const primitives:Map<string, new(id:string, params:any) => PrimitiveBase> = new Map([
    ['TrendLine', TrendLine]
]) 

registerPrimitiveTool(TrendLineTool)