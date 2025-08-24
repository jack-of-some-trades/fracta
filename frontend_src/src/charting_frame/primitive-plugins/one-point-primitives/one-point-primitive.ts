import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
    AutoscaleInfo,
    Coordinate,
    HandleScrollOptions,
    Logical,
    MouseEventParams,
    Point,
    PrimitiveHoveredItem,
    SingleValueData,
    Time
} from 'lightweight-charts';
import { point } from '../../../../tsx/window/overlay_manager';
import { ChartingEvent } from '../../charting_frame';
import { HIT_RESULT, HoveredItem, PrimitiveBase, primitiveOptions, PrimitiveRenderer } from '../primitive-base';


/* --------------------- Primitive Options ----------------------- */

export interface OnePointParameters<T extends primitiveOptions> {
    p1: SingleValueData | null,
    options: T
}

export type OnePointRenderer_T<T extends primitiveOptions> = new(source: OnePointPrimitive<T>) => OnePointRenderer<T>

/* --------------------- Primitive Main Class ----------------------- */

export abstract class OnePointPrimitive<T extends primitiveOptions> extends PrimitiveBase {
    _p1: SingleValueData | null

    public _options: T
    protected _paneView: OnePointRenderer<T>;

    constructor(id:string, type:string, renderer: OnePointRenderer_T<T>, params:OnePointParameters<T>) {
        super(id, type, undefined)
        this._options = params.options
        this._p1 = params.p1;
        this._paneView = new renderer(this)
    }

    public updateData(params:Partial<OnePointParameters<T>>){
        if (params.p1) {
            this._p1 = params.p1
            this.requestUpdate()
        }
        this.applyOptions(params.options)
    }

    //#region --------------- Base Class / Interface Functions --------------- //

    paneViews() { return [this._paneView]; }
    updateAllViews() { this._paneView.update(); }

    autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
        if (!this._options.autoscale || !this._options.visible || this._p1 === null) return null

        const p1Index = this.timeToIndex(this._p1.time);
        if (p1Index === null) return null;
        // Off-Screen check
        if (endTimePoint < p1Index || startTimePoint > p1Index) return null;

        return {
            priceRange: {
                minValue: this._p1.value,
                maxValue: this._p1.value,
            },
        };
    }

    hitTest(x: number, y: number): PrimitiveHoveredItem | null { 
        // @ts-ignore ---- Let's just pretend it wanted the object so we get better hit-detection.
        return this._paneView.hitTest(x, y) as PrimitiveHoveredItem
    }

    onMouseDown(param: ChartingEvent) {
        if (!this._options.visible || !this._options.tangible) return
        if (!param.sourceEvent || !param.logical) return
        if (this._paneView._hovered != HIT_RESULT.P1 && this._paneView._hovered != HIT_RESULT.Stroke ) return
    
        let update_func = this._shiftPoint.bind(
				this, {x:param.logical,y:param.sourceEvent.localY}
			)
        const chart = this.chart
        const pressedMove = chart.options().handleScroll.valueOf() as HandleScrollOptions | boolean
        const pressedMoveReEnable = typeof (pressedMove) == 'boolean' ? pressedMove : pressedMove.pressedMouseMove

        //Remove Scrolling effect
        chart.applyOptions({ handleScroll: { pressedMouseMove: false } })
        chart.subscribeCrosshairMove(update_func)

        document.addEventListener('mouseup', () => {
            chart.unsubscribeCrosshairMove(update_func)
            //Reenable Scrolling effect if it was set prior to clicking
            chart.applyOptions({ handleScroll: { pressedMouseMove: pressedMoveReEnable } })
        },{once:true})
    }
    
    private _shiftPoint(last_point:point , param: MouseEventParams<Time>){
        if (!param.logical || !param.sourceEvent || !this._p1) return
        let dx = param.logical - last_point.x as Logical
        let dy = param.sourceEvent.localY - last_point.y as Coordinate

        let p1 = this.movePoint(this._p1, dx, dy)

        if (!p1) return
        this.updateData({p1:p1})
        last_point.x = param.logical
        last_point.y = param.sourceEvent.localY
    }

    //#endregion
}


/* --------------------- Primitive Render Classes ----------------------- */

export abstract class OnePointRenderer<T extends primitiveOptions> implements PrimitiveRenderer {
    _p1: Point | null = null
    _source: OnePointPrimitive<T>;
    _hovered: number | undefined

    stroke: Path2D | null = null
    ctx: CanvasRenderingContext2D | null = null

    constructor(source: OnePointPrimitive<T>) { this._source = source;	}
    renderer() { return this }

    get options():T { return this._source._options }
    abstract draw(target: CanvasRenderingTarget2D): void
    abstract hitTest(x: number, y: number): HoveredItem | null

    update() {
        if (this._source._p1 === null) return

        const series = this._source.series;
        const timeScale = this._source.chart.timeScale()
        let y1 = series.priceToCoordinate(this._source._p1.value)
        let x1 = timeScale.timeToCoordinate(this._source._p1.time)

        if ( x1 === null ) x1 = this._source.nearestBarCoordinate(this._source._p1.time)

        if (x1 === null || y1 === null) {
            this._p1 = null
            return
        }

        this._p1 = { x: Math.round(x1) as Coordinate, y: Math.round(y1) as Coordinate }
    }
    
}