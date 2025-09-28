import { CanvasRenderingTarget2D } from 'fancy-canvas';
import { icons } from '../../../../tsx/generic_elements/icons';
import { generateOptionsMenu } from '../../../../tsx/generic_elements/options_menu';
import { charting_pane } from '../../charting_pane';
import { CanvasStrokeStyles, DEFAULT_STROKE_STYLE, draw_dot, setCanvasStokeStyle } from '../../helpers/canvas';
import { DEFAULT_PRIMITIVE_OPTS, HIT_RESULT, HoveredItem } from '../primitive-base';
import { PrimitiveTool } from '../tool_ui_support';
import { OnePointParameters, OnePointPrimitive, OnePointRenderer } from './one-point-primitive';
import { cleanUpOnePointTool, configureOnePointPrimitiveUI } from './one-point-primitive-ui';


/* --------------------- UI Tool ----------------------- */

const TOOL_NAME = 'Horizontal Ray'

export const HorizRayTool: PrimitiveTool = {
    icon: icons.horiz_ray,
    label: TOOL_NAME,
    create: createRay,
    cleanup: cleanUpOnePointTool
}

function createRay(pane:charting_pane, e: MouseEvent){
    const new_line = new HorizRay('')
    pane._attachSeriesPrimitive(new_line)
    return configureOnePointPrimitiveUI(e, new_line)
}

/* --------------------- Primitive Options ----------------------- */

export interface HorizRayOptions extends OnePointParameters, CanvasStrokeStyles {
    right: boolean;
}

const defaultOptions: HorizRayOptions = {
    p1: null,
    right: true,
    ...DEFAULT_PRIMITIVE_OPTS,
    ...DEFAULT_STROKE_STYLE,
};

/* --------------------- Primitive Base Class ----------------------- */

export class HorizRay extends OnePointPrimitive<HorizRayOptions> {

    constructor(id:string, params?:Partial<HorizRayOptions>) {
        super(id, TOOL_NAME, HorizRayRenderer, {...defaultOptions, ...params})
    }

    public displayOptionsMenu(): void {
        generateOptionsMenu({
            id: this.id + '_options',
            title: TOOL_NAME + ' Options',
            tabs: {
                'Inputs': [MENU_STRUCT, this._options, this.applyOptions],
                'Style': undefined,
            },
            pane: this.pane
        })
    }
}


/* --------------------- Primitive Renderer ----------------------- */

class HorizRayRenderer extends OnePointRenderer<HorizRayOptions> {

    draw(target: CanvasRenderingTarget2D) {
        target.useMediaCoordinateSpace(scope => {
            const ctx = scope.context;
            this.ctx = ctx
            if (this._c1 === null) {
                this.stroke = null
            } else {
                setCanvasStokeStyle(ctx, this.options)

                let line = new Path2D()
                line.moveTo(this._c1.x, this._c1.y)
                line.lineTo( this.options.right ? ctx.canvas.width + 1 : -1 , this._c1.y)
                ctx.stroke(line)

                if (this._hovered !== undefined || this._source.selected()) {
                    draw_dot(ctx, this._c1, this._source.selected())
                }
                this.stroke = line
            }
        });
    }

    hitTest(x: number, y: number): HoveredItem | null {
        if (!this.get('tangible') || !this.get('visible') || this._c1 === null) return null

        this._hovered = undefined //Assume it isn't hovered. Will correct if not.

        //Course X range Check
        if (this.options.right ? this._c1.x - 10 > x : this._c1.x + 10 < x) 
            return null

        //Point Check
        if (Math.abs(this._c1.x - x) < 10 && Math.abs(this._c1.y - y) < 10){
            this._hovered = HIT_RESULT.P1
            return { 
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal'
            }
        }

        //Trace Check
        if ( Math.abs(this._c1.y - y) < Math.max(this.options.width, 8) ){
            this._hovered = HIT_RESULT.Stroke
            return { 
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal'
            }
        }
        
        return null
    }
}


const MENU_STRUCT = {
    "right": [
        "bool",
        {
            "default": true,
            "autosend": true,
            "title": "Project Right"
        }
    ],
    "p1": [
        "point",
        {
            "default": {time: "01-01-1970", value: 100},
            "autosend": true,
            "step": 0.01,
            "title": "Ray Origin"
        }
    ],
}