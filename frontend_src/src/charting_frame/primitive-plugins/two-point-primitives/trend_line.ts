import { CanvasRenderingTarget2D } from 'fancy-canvas';
import { SingleValueData } from 'lightweight-charts';
import { icons } from '../../../../tsx/generic_elements/icons';
import { charting_pane } from '../../charting_pane';
import { HoveredItem, draw_dot, primitiveOptions } from '../primitive-base';
import { PrimitiveTool } from '../tool_ui_support';
import { TwoPointHoveredEnum, TwoPointPrimitive, TwoPointRenderer } from './two_point_primitive';
import { cleanUpTwoPointTool, configureTwoPointPrimitiveUI } from './two_point_primitive_ui';


/* --------------------- UI Tool ----------------------- */

const TOOL_NAME = 'TrendLine'

export const TrendLineTool: PrimitiveTool = {
    icon: icons.trend_line,
    label: TOOL_NAME,
    create: createTrendLine,
    cleanup: cleanUpTwoPointTool
}

function createTrendLine(pane:charting_pane, e: MouseEvent){
    const new_line = new TrendLine('', {p1:null, p2:null})
    pane._attachSeriesPrimitive(new_line)
    return configureTwoPointPrimitiveUI(e, new_line)
}

/* --------------------- Primitive Options ----------------------- */

export interface TrendLineOptions extends primitiveOptions {
    width: number;
    lineColor: string;
}

const defaultOptions: TrendLineOptions = {
    visible: true,
    tangible: true,
    autoscale: false,

    width: 1,
    lineColor: 'rgb(255, 0, 0)',
};

interface TrendLineParameters {
    p1: SingleValueData | null,
    p2: SingleValueData | null,
    options?: Partial<TrendLineOptions>
}


/* --------------------- Primitive Base Class ----------------------- */

// Sole Purpose of this constructor is to provide default values to params.options
export class TrendLine extends TwoPointPrimitive<TrendLineOptions> {

    constructor(id:string, params:TrendLineParameters) {
        const _filled_params = {
            p1: params.p1, p2:params.p2, options:{...defaultOptions, ...params.options}
        }
        super(id, TOOL_NAME, TrendLineRenderer, _filled_params)    
    }
}


/* --------------------- Primitive Renderer ----------------------- */

// The PaneView and Pane Renderer have been collapsed into a single class since they are small
// and it simplifies the call structure for TrendLine.hitTest() to use thee canvas and path objects
// to greatly simplify hit testing

class TrendLineRenderer extends TwoPointRenderer<TrendLineOptions> {

    draw(target: CanvasRenderingTarget2D) {
        target.useMediaCoordinateSpace(scope => {
            const ctx = scope.context;
            this.ctx = ctx
            if (this._p1 === null || this._p2 === null) {
                this.line = null
            } else {
                let line = new Path2D()
                line.moveTo(this._p1.x, this._p1.y)
                line.lineTo(this._p2.x, this._p2.y)
                ctx.lineWidth = this._source._options.width
                ctx.strokeStyle = this._source._options.lineColor
                ctx.stroke(line)

                if (this._hovered !== undefined || this._source.selected()) {
                    draw_dot(ctx, this._p1, this._source.selected())
                    draw_dot(ctx, this._p2, this._source.selected())
                }
                this.line = line
            }
        });
    }

    hitTest(x: number, y: number): HoveredItem | null {
        if (  
            !this._source._options.tangible || !this._source._options.visible
            || this.line === null || this.ctx === null
            || this._p1 === null || this._p2 === null
        ) return null

        this._hovered = undefined //Assume it isn't hovered. Will correct if not.
        
        if (!( //Course X range Check
            x + 10 > this._p1.x && x - 10 < this._p2.x ||
            x - 10 < this._p1.x && x + 10 > this._p2.x
        )) return null
        if (!( //Course Y range Check
            y + 10 > this._p1.y && y - 10 < this._p2.y ||
            y - 10 < this._p1.y && y + 10 > this._p2.y
        )) return null


        //Only check to a square around the point since it's much faster
        if (Math.abs(this._p1.x - x) < 10 && Math.abs(this._p1.y - y) < 10) {
            this._hovered = TwoPointHoveredEnum.P1
            return { 
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal'
            }
        }
        if (Math.abs(this._p2.x - x) < 10 && Math.abs(this._p2.y - y) < 10) {
            this._hovered = TwoPointHoveredEnum.P2
            return {
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal'
            }
        }
        //Set min width so it's easier to hover on small lines
        this.ctx.lineWidth = Math.max(this._source._options.width, 6)
        if (this.ctx.isPointInStroke(this.line, x, y)) {
            this._hovered = TwoPointHoveredEnum.LINE
            return {
                cursorStyle: 'grab',
                externalId: this._source,
                zOrder: 'normal',
            }
        }
        return null
    }
}