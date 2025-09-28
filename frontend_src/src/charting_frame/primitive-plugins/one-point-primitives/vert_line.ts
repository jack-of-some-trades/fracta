import { CanvasRenderingTarget2D } from 'fancy-canvas';
import { Coordinate } from 'lightweight-charts';
import { icons } from '../../../../tsx/generic_elements/icons';
import { generateOptionsMenu } from '../../../../tsx/generic_elements/options_menu';
import { charting_pane } from '../../charting_pane';
import { CanvasStrokeStyles, DEFAULT_STROKE_STYLE, draw_dot, setCanvasStokeStyle } from '../../helpers/canvas';
import { DEFAULT_PRIMITIVE_OPTS, HIT_RESULT, HoveredItem } from '../primitive-base';
import { PrimitiveTool } from '../tool_ui_support';
import { OnePointParameters, OnePointPrimitive, OnePointRenderer } from './one-point-primitive';
import { cleanUpOnePointTool, configureOnePointPrimitiveUI } from './one-point-primitive-ui';


/* --------------------- UI Tool ----------------------- */

const TOOL_NAME = 'Vertical Line'

export const VertLineTool: PrimitiveTool = {
    icon: icons.vert_line,
    label: TOOL_NAME,
    create: createVLine,
    cleanup: cleanUpOnePointTool
}

function createVLine(pane:charting_pane, e: MouseEvent){
    const new_line = new VertLine('')
    pane._attachSeriesPrimitive(new_line)
    return configureOnePointPrimitiveUI(e, new_line)
}

/* --------------------- Primitive Options ----------------------- */

export interface VertLineOptions extends OnePointParameters, CanvasStrokeStyles {}

const defaultOptions: VertLineOptions = {
    p1: null,
    ...DEFAULT_PRIMITIVE_OPTS,
    ...DEFAULT_STROKE_STYLE,
};

/* --------------------- Primitive Base Class ----------------------- */

export class VertLine extends OnePointPrimitive<VertLineOptions> {

    constructor(id:string, params?:Partial<VertLineOptions>){
        super(id, TOOL_NAME, VertLineRenderer, {...defaultOptions, ...params})    
    }

    public displayOptionsMenu(): void {
        generateOptionsMenu({
            id: this.id + '_options',
            title: TOOL_NAME + ' Options',
            tabs: {
                'Inputs': [DATA_MENU_STRUCT, this._options, this.applyOptions],
                'Style': undefined,
            },
            pane: this.pane
        })
    }
}


/* --------------------- Primitive Renderer ----------------------- */

class VertLineRenderer extends OnePointRenderer<VertLineOptions> {

    draw(target: CanvasRenderingTarget2D) {
        target.useMediaCoordinateSpace(scope => {
            const ctx = scope.context;
            this.ctx = ctx
            if (this._c1 === null) {
                this.stroke = null
            } else {
                setCanvasStokeStyle(ctx, this.options)

                let line = new Path2D()
                line.moveTo(this._c1.x, 0)
                line.lineTo(this._c1.x, ctx.canvas.height + 1)
                ctx.stroke(line)

                if (this._hovered !== undefined || this._source.selected()) {
                    let _midpoint = {x: this._c1.x, y:Math.floor(ctx.canvas.height/2) as Coordinate}
                    draw_dot(ctx, _midpoint, this._source.selected())
                }
                this.stroke = line
            }
        });
    }

    hitTest(x: number, y: number): HoveredItem | null {
        if (!this.get('tangible') || !this.get('visible') || this._c1 === null) return null

        this._hovered = undefined //Assume it isn't hovered. Will correct if not.

        //Course X range Check
        if (Math.abs(this._c1.x - x) > 10) 
            return null

        //Point Check
        if (Math.abs(this._c1.y - y) < 10){
            this._hovered = HIT_RESULT.P1
            return { 
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal'
            }
        } else {
            this._hovered = HIT_RESULT.Stroke
            return { 
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal'
            }
        }
    }
}


const DATA_MENU_STRUCT = {
    "p1_time": [
        "timestamp",
        {
            "default": "01-01-1970",
            "autosend": true,
            "title": "Time"
        }
    ]
}