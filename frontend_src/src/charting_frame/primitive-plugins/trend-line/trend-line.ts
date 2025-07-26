import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
	AutoscaleInfo,
	Coordinate,
	HandleScrollOptions,
	IPrimitivePaneRenderer,
	IPrimitivePaneView,
	Logical,
	MouseEventParams,
	Point,
	PrimitiveHoveredItem,
	SingleValueData,
	Time
} from 'lightweight-charts';
import { point } from '../../../../tsx/window/overlay_manager';
import { ChartingEvent } from '../../charting_frame';
import { HoveredItem, PrimitiveBase, draw_dot, primitiveOptions } from '../primitive-base';


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

const LINE = 0
const P1 = 1
const P2 = 2

/* --------------------- Primitive Main Class ----------------------- */

export class TrendLine extends PrimitiveBase {
	_p1: SingleValueData | null;
	_p2: SingleValueData | null;
	_paneView: TrendLinePaneView;
	_options: TrendLineOptions = defaultOptions;

	constructor(id:string, params:TrendLineParameters) {
		super(
			id, 'TrendLine', 
			{...defaultOptions, ...params.options}
		)
		this._p1 = params.p1;
		this._p2 = params.p2;
		this._paneView = new TrendLinePaneView(this);
	}

	public updateData(params:TrendLineParameters) {
		if (params.p1 !== null) this._p1 = params.p1
		if (params.p2 !== null) this._p2 = params.p2
		this.applyOptions(params.options)
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
		if (endTimePoint < p1Index || startTimePoint > p2Index) return null;

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

	/* Move line / Point on line */
	onMouseDown(param: ChartingEvent) {
		if (!this._options.visible || !this._options.tangible) return
		if (!param.sourceEvent || !param.logical) return

		//Determine moveMove update Function
		let update_func
		if (this._paneView._hovered == LINE) {
			//Binding a point object so that x & y can update inside function call 
			update_func = this.mouseMoveWholeLine.bind(
				this, {x:param.logical,y:param.sourceEvent.localY}
			)
		} else if (this._paneView._hovered == P1){
			update_func = this.mouseMoveEndPoint.bind(this, true)
		} else if (this._paneView._hovered == P2){
			update_func = this.mouseMoveEndPoint.bind(this, false)
		} else return

		const chart = this.chart
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

	private mouseMoveEndPoint(p1: boolean, param: MouseEventParams<Time>){
		if (!param.sourceEvent) return
		let t = this.chart.timeScale().coordinateToTime(param.sourceEvent.localX)
		let p = this.series.coordinateToPrice(param.sourceEvent.localY)

		if (t && p)
			if (p1)
				this.updateData({p1:{ time: t, value: p }, p2:null})
			else
				this.updateData({p1:null, p2:{ time: t, value: p }})
	}

	private mouseMoveWholeLine(last_point:point , param: MouseEventParams<Time>){
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

// The PaneView and Pane Renderer have been collapsed into a single class since they are small
// and it simplifies the call structure for TrendLine.hitTest() to use thee canvas and path objects
// to greatly simplify hit testing
class TrendLinePaneView implements IPrimitivePaneView, IPrimitivePaneRenderer {
	_p1: Point | null = null
	_p2: Point | null = null
	_source: TrendLine;
	_hovered: number | undefined

	line: Path2D | null = null
	ctx: CanvasRenderingContext2D | null = null

	constructor(source: TrendLine) { this._source = source;	}

	update() {
		if (this._source._p1 === null || this._source._p2 === null) return

		const series = this._source.series;
		const timeScale = this._source.chart.timeScale()
		let y1 = series.priceToCoordinate(this._source._p1.value)
		let y2 = series.priceToCoordinate(this._source._p2.value)
		let x1 = timeScale.timeToCoordinate(this._source._p1.time)
		let x2 = timeScale.timeToCoordinate(this._source._p2.time)

		// TODO: Determine if this constant binary searching is a bad idea or not.
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

	//This is only called about 1/4 the amount that update() is
	renderer() { return this }

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

				if (this._hovered || this._source.selected()) {
					draw_dot(ctx, this._p1, this._source.selected())
					draw_dot(ctx, this._p2, this._source.selected())
				}
				this.line = line
			}
		});
	}

	/**
	 * Implementation of a Hit test when you have access to the Canvas Target...
	 * This function gets invoked a LOT. Need to make sure it's efficient.
	 * 
	 * The External ID convention is [i_XXXX_]p_XXXX[_[arg]] where i_XXXX is the unique id for
	 * the parent indicator if applicable, p_XXXX the unique ID for this primitive, and [_[arg]]
	 * is any optional extention to specify what part of the primitive (_p1 or _p2 in this case)
	 */
	hitTest(x: number, y: number): HoveredItem | null {
		if (this.line === null || this.ctx === null) return null
		if (this._p1 === null || this._p2 === null) return null
		if (!this._source._options.tangible || !this._source._options.visible) return null

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
			this._hovered = P1
			return { 
				cursorStyle: 'grab',
				externalId: this._source,
				zOrder: 'normal'
			}
		}
		if (Math.abs(this._p2.x - x) < 10 && Math.abs(this._p2.y - y) < 10) {
			this._hovered = P2
			return {
				cursorStyle: 'grab',
				externalId: this._source,
				zOrder: 'normal'
			}
		}
		//Set min width so it's easier to hover on small lines
		this.ctx.lineWidth = Math.max(this._source._options.width, 6)
		if (this.ctx.isPointInStroke(this.line, x, y)) {
			this._hovered = LINE
			return {
				cursorStyle: 'grab',
				externalId: this._source,
				zOrder: 'normal',
			}
		}
		return null
	}
}