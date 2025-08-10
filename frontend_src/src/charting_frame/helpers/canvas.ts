import { LineStyle, Point } from "lightweight-charts";

var cssBGFillColor = getComputedStyle(document.body).getPropertyValue('--layout-main-fill');
var cssAccentColor = getComputedStyle(document.body).getPropertyValue('--accent-color');
var cssFont = getComputedStyle(document.body).getPropertyValue('--font');

export function reloadComputedCanvasStyle(){
    cssBGFillColor = getComputedStyle(document.body).getPropertyValue('--layout-main-fill');
    cssAccentColor = getComputedStyle(document.body).getPropertyValue('--accent-color');
    cssFont = getComputedStyle(document.body).getPropertyValue('--font');
}
// Global Hook for Python to refresh the values stored in the above variables after css has been loaded.
window.reloadComputedCanvasStyle = reloadComputedCanvasStyle

// ---- ---- ---- ---- Canvas Style Interfaces & Defaults ---- ---- ---- ---- //

export interface CanvasStrokeStyles {
    width: number,
    lineColor: string,
    lineStyle: LineStyleExt,
    lineCap: CanvasLineCap,
    lineJoin: CanvasLineJoin,
}

export const DEFAULT_STROKE_STYLE: CanvasStrokeStyles = {
    'width': 2,
    'lineColor': cssAccentColor,
    'lineStyle': LineStyle.Solid,
    'lineCap': 'butt',
    'lineJoin': 'round',
}

export interface CanvasTextStyles {
    font: string
    fontSize: number,
    textAlign: CanvasTextAlign,
    textBaseline: CanvasTextBaseline
}

export const DEFAULT_TEXT_STYLE: CanvasTextStyles = {
    'font': cssFont,
    'fontSize': 12,
    'textAlign': 'left',
    'textBaseline': 'bottom'
}

type CanvasStyles = CanvasStrokeStyles & CanvasTextStyles

export type LineStyleExt = LineStyle | FractaLineStyle | number[]
export enum FractaLineStyle {
    Solid,
    Dotted,
    Dashed,
    LargeDashed,
    SparseDotted
}


// ---- ---- ---- ---- Canvas Utility Functions ---- ---- ---- ---- //

/**
 * Util Function to Take in standard Canvas Options and apply all that are present.
 * @param ctx CanvasRenderingContext2D
 * @param opts CanvasStyle, Union of Line & Text Styles
 */
export function setCanvasStokeStyle(ctx: CanvasRenderingContext2D, opts: CanvasStrokeStyles) {
    ctx.lineWidth = opts.width
    ctx.strokeStyle = opts.lineColor
    ctx.lineJoin = opts.lineJoin
    ctx.lineCap = opts.lineCap
    setLineStyle(ctx, opts.lineStyle)
}

export function setCanvasTextStyle(ctx: CanvasRenderingContext2D, opts: CanvasTextStyles) {
    ctx.font = opts.fontSize.toString() + 'pt ' + opts.font
    ctx.textAlign = opts.textAlign
    ctx.textBaseline = opts.textBaseline
}

export function setLineStyle(ctx: CanvasRenderingContext2D, style: LineStyleExt) {
    if (typeof style !== 'number') {
        ctx.setLineDash(style)
        return
    }

    let _style: number[] = []

    switch (style) {
        case FractaLineStyle.Solid:
            break
        case FractaLineStyle.Dotted:
            _style = [ctx.lineWidth, ctx.lineWidth]; break;
        case FractaLineStyle.Dashed:
            _style = [2 * ctx.lineWidth, 2 * ctx.lineWidth]; break;
        case FractaLineStyle.LargeDashed:
            _style = [6 * ctx.lineWidth, 6 * ctx.lineWidth]; break;
        case FractaLineStyle.SparseDotted:
            _style = [ctx.lineWidth, 4 * ctx.lineWidth]; break;
    }
    ctx.setLineDash(_style)
}

/**
 * Draws a Dot on the Canvas at the given point. Common enough of a utility that it was made into the exportable function
 */
export function draw_dot(ctx: CanvasRenderingContext2D, p: Point, sel: boolean = false, color: string = cssBGFillColor, borderColor: string = cssAccentColor) {
    ctx.beginPath()
    ctx.ellipse(
        p.x, p.y, 6, 6, 0, 0,
        Math.PI * 2
    );
    ctx.fillStyle = borderColor
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(
        p.x, p.y, sel ? 4 : 5, sel ? 4 : 5, 0, 0,
        Math.PI * 2
    )
    ctx.fillStyle = color
    ctx.fill()
}
