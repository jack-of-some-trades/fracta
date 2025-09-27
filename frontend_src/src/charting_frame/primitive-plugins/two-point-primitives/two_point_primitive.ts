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

export interface TwoPointParameters<T extends primitiveOptions> {
	p1: SingleValueData | null,
	p2: SingleValueData | null,
	options: T
}

export type TwoPointRenderer_T<T extends primitiveOptions> = new(source: TwoPointPrimitive<T>) => TwoPointRenderer<T>

/* --------------------- Primitive Main Class ----------------------- */

export abstract class TwoPointPrimitive<T extends primitiveOptions> extends PrimitiveBase {
	_p1: SingleValueData | null
	_p2: SingleValueData | null

	public _options: T
	protected _paneView: TwoPointRenderer<T>;

	constructor(id:string, type:string, renderer: TwoPointRenderer_T<T>, params:TwoPointParameters<T>) {
		super(id, type, undefined)
		this._options = params.options
		this._p1 = params.p1;
		this._p2 = params.p2;
		this._paneView = new renderer(this)
	}

	public updateData(params:Partial<TwoPointParameters<T>>){
        if (params.p1) this._p1 = params.p1
        if (params.p2) this._p2 = params.p2
        this.applyOptions(params.options)
		if (params.p1 || params.p2) this.requestUpdate()
	}

	//#region --------------- Base Class / Interface Functions --------------- //

	paneViews() { return [this._paneView]; }
	updateAllViews() { this._paneView.update(); }

	autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
		if (!this._options.autoscale || !this._options.visible) return null
		if (this._p1 === null || this._p2 === null) return null

		const p1Index = this.timeToIndex(this._p1.time);
		const p2Index = this.timeToIndex(this._p2.time);
		if (p1Index === null || p2Index === null) return null;
		// Off-Screen check
		if (p1Index < startTimePoint && p2Index < startTimePoint) return null;
		if (p1Index > endTimePoint && p2Index > endTimePoint) return null;

		return {
			priceRange: {
				minValue: Math.min(this._p1.value, this._p2.value),
				maxValue: Math.max(this._p1.value, this._p2.value),
			},
		};
	}

	hitTest(x: number, y: number): PrimitiveHoveredItem | null { 
		// @ts-ignore ---- Let's just pretend it wanted the object so we get better hit-detection.
		return this._paneView.hitTest(x, y) as PrimitiveHoveredItem
	}

	/* Move P1, P2, or both */
	onMouseDown(param: ChartingEvent) {
		if (!this._options.visible || !this._options.tangible) return
		if (!param.sourceEvent || !param.logical) return

		//Determine moveMove update Function
		let update_func
		if (this._paneView._hovered == HIT_RESULT.Stroke) {
			//Binding a point object so that x & y can update inside function call 
			update_func = this._mouseMoveWholeLine.bind(
				this, {x:param.logical,y:param.sourceEvent.localY}
			)
		} else if (this._paneView._hovered == HIT_RESULT.P1){
			update_func = this._mouseMoveEndPoint.bind(this, true)
		} else if (this._paneView._hovered == HIT_RESULT.P2){
			update_func = this._mouseMoveEndPoint.bind(this, false)
		} else return

		const chart = this.chartApi
		const pressedMove = chart.options().handleScroll.valueOf() as HandleScrollOptions | boolean
		const pressedMoveReEnable = typeof (pressedMove) == 'boolean' ? pressedMove :  pressedMove.pressedMouseMove

		//Remove Scrolling effect
		chart.applyOptions({ handleScroll: { pressedMouseMove: false } })
		update_func = update_func.bind(this)
		chart.subscribeCrosshairMove(update_func)

		document.addEventListener('mouseup', () => {
			chart.unsubscribeCrosshairMove(update_func)
			//Reenable Scrolling effect if it was set prior to clicking
			chart.applyOptions({ handleScroll: { pressedMouseMove: pressedMoveReEnable } })
		},{once:true})
	}

	private _mouseMoveEndPoint(p1: boolean, param: MouseEventParams<Time>){
		if (!param.sourceEvent) return
		let t = this.chartApi.timeScale().coordinateToTime(param.sourceEvent.localX)
		let p = this.series.coordinateToPrice(param.sourceEvent.localY)

		if (t && p)
			if (p1)
				this.updateData({p1:{ time: t, value: p }, p2:null})
			else
				this.updateData({p1:null, p2:{ time: t, value: p }})
	}

	private _mouseMoveWholeLine(last_point:point , param: MouseEventParams<Time>){
		if (!param.logical || !param.sourceEvent || !this._p1 || !this._p2) return
		let dx = param.logical - last_point.x as Logical
		let dy = param.sourceEvent.localY - last_point.y as Coordinate

		let p1 = this.movePoint(this._p1, dx, dy)
		let p2 = this.movePoint(this._p2, dx, dy)

		if (!p1 || !p2) return
		this.updateData({p1:p1, p2:p2})
		last_point.x = param.logical
		last_point.y = param.sourceEvent.localY
	}

	//#endregion
}


/* --------------------- Primitive Render Classes ----------------------- */

// The PaneView and Pane Renderer have been collapsed into a single class since it both simplifies
// the call structure for TwoPointPrimitive.hitTest() while allowing the method to have access to the 
// canvas & path which are owned by the PaneRenderer. Having these objects greatly simplify
// hit detection and cut down on duplicate line/shape collision logic at the cost of breaking
// encapsulation of the Primitive, PaneView & Pane Renderer 

export abstract class TwoPointRenderer<T extends primitiveOptions> implements PrimitiveRenderer {
	_p1: Point | null = null
	_p2: Point | null = null
	_source: TwoPointPrimitive<T>;
	_hovered: number | undefined

	line: Path2D | null = null
	ctx: CanvasRenderingContext2D | null = null

	constructor(source: TwoPointPrimitive<T>) { this._source = source;	}
    get options():T { return this._source._options }
	renderer() { return this }

	abstract draw(target: CanvasRenderingTarget2D): void
	abstract hitTest(x: number, y: number): HoveredItem | null

	update() {
		if (this._source._p1 === null || this._source._p2 === null) return

		const series = this._source.series;
		const timeScale = this._source.chartApi.timeScale()
		let y1 = series.priceToCoordinate(this._source._p1.value)
		let y2 = series.priceToCoordinate(this._source._p2.value)
		let x1 = timeScale.timeToCoordinate(this._source._p1.time)
		let x2 = timeScale.timeToCoordinate(this._source._p2.time)

		if ( x1 === null ) x1 = this._source.nearestBarCoordinate(this._source._p1.time)
		if ( x2 === null ) x2 = this._source.nearestBarCoordinate(this._source._p2.time)

		if (x1 === null || x2 === null || y1 === null || y2 === null) {
			this._p1 = null
			this._p2 = null
			return
		}

		this._p1 = { x: Math.round(x1) as Coordinate, y: Math.round(y1) as Coordinate }
		this._p2 = { x: Math.round(x2) as Coordinate, y: Math.round(y2) as Coordinate }
	}
	
}