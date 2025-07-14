import {
    Coordinate,
    DataChangedScope,
    IChartApi,
    ISeriesApi,
    ISeriesPrimitive,
    Logical,
    MouseEventParams,
    Point,
    PrimitiveHoveredItem,
    SeriesAttachedParameter,
    SeriesOptionsMap,
    SingleValueData,
    Time
} from 'lightweight-charts';
import { ORDERABLE, Orderable, treeLeafInterface } from '../../../tsx/widget_panels/object_tree';
import { binarySearch } from '../../types';
import { charting_frame } from '../charting_frame';
import { ensureDefined } from '../helpers/assertions';
import { SeriesBase_T } from '../series-plugins/series-base';
import { isPrimitiveSet, PrimitiveSet } from './primitive-set';

export interface primitiveOptions {
    visible: boolean
    tangible: boolean
    autoscale: boolean
}

const PRIMITIVE = Symbol('SeriesPrimitive')
export function isPrimitive(obj: unknown): obj is PrimitiveBase { 
    return ( obj !== null && typeof obj === 'object' && PRIMITIVE in obj )
}

/**
 * This is a near implementation to the plugin-base class that is in (but not exported from)
 * the lightweight charts library. This was made so some extentions can be added
 * that will be used by the LWPC Module. All primitives should inherit from this class
 * so that plugins can integrate into the base features of the GUI. 
 * (e.g. Object tree, Overlay Style Menus, ...)
 * 
 * This is a sister class to the SeriesBase class defined by this module.
 * 
 * Docs: https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives
 */
export abstract class PrimitiveBase implements ISeriesPrimitive<Time>, Orderable {
    [PRIMITIVE]:true = true;
    [ORDERABLE]:true = true;
    private _frame: charting_frame | undefined
    private _parent: PrimitiveSet | SeriesBase_T | undefined
    protected _chart: IChartApi | undefined
    protected _series: ISeriesApi<keyof SeriesOptionsMap> | undefined
    leafProps: treeLeafInterface

    _id: string = ""
    _name: string | undefined = undefined
    _type: string = "null"
    _options: primitiveOptions

    private _requestUpdate?: () => void;
    protected requestUpdate(): void { if (this._requestUpdate) this._requestUpdate(); }

    //Any of the methods below can be defined by a sub-class. In doing so they will be added as listeners
    hitTest?(x: number, y: number): PrimitiveHoveredItem | null;
    protected onDataUpdate?(scope: DataChangedScope): void;
    protected onClick?(param: MouseEventParams<Time>): void;
    protected onMouseUp?(param: MouseEventParams<Time>): void;
    protected onMouseDown?(param: MouseEventParams<Time>): void;
    protected onDblClick?(param: MouseEventParams<Time>): void;
    protected onCrosshairMove?(param: MouseEventParams<Time>): void;

    constructor(_id:string, _type:string, _opts:primitiveOptions){
        this._id = _id
        this._type = _type
        this._options = _opts
        this.leafProps = {
            id: _id,
            obj: this,
            leafTitle: this.name
        }
    }

    get id(): string {return this._id}
    get name(): string {return this._name ?? this._type}
    get chart(): IChartApi { return ensureDefined(this._chart); }
    get series(): ISeriesApi<keyof SeriesOptionsMap> { return ensureDefined(this._series); }
    setParent(parent: PrimitiveSet | SeriesBase_T | undefined){this._parent = parent}
    options(): primitiveOptions {return structuredClone(this._options)}

    remove() {
        if(isPrimitiveSet(this._parent)){
            this._parent.detachPrimitive(this)
        }
    }

    applyOptions(opts:Partial<primitiveOptions> | undefined){
        if (opts !== undefined)
            this._options = {...this._options, ...opts}
        this.requestUpdate()
    }

    public abstract updateData(params: object): void

    //** Invoked by Lightweight-Charts when the Primitive is attached to the chart. */
    public attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
        this._chart = chart;
        this._series = series;

        //Attach Listeners if they were defined by the subclass and obj is tangible
        if (this._options.tangible){
            if (this.onDataUpdate) { this._series.subscribeDataChanged(this._fireDataUpdated); }
            if (this.onClick) { this._chart.subscribeClick(this._fireClick); }
            if (this.onDblClick) { this._chart.subscribeDblClick(this._fireDblClick); }
            if (this.onCrosshairMove) { this._chart.subscribeCrosshairMove(this._fireCrosshairMove); }
            if (this.onMouseDown) { this._frame?.chart_el.addEventListener('mousedown', this._fireMouseDown); }
            if (this.onMouseUp) { this._frame?.chart_el.addEventListener('mouseup', this._fireMouseUp); }
        }

        this._requestUpdate = requestUpdate;
        this.requestUpdate();
    }

    //** Invoked by Lightweight-Charts when the Primitive removed from the chart. */
    public detached() {
        //Detach Listeners if they were defined by the subclass
        if (this.onDataUpdate) { this._series?.unsubscribeDataChanged(this._fireDataUpdated); }
        if (this.onClick) { this._chart?.unsubscribeClick(this._fireClick); }
        if (this.onDblClick) { this._chart?.unsubscribeDblClick(this._fireDblClick); }
        if (this.onCrosshairMove) { this._chart?.unsubscribeCrosshairMove(this._fireCrosshairMove); }
        if (this.onMouseDown) { this._frame?.chart_el.removeEventListener('mousedown', this._fireMouseDown); }
        if (this.onMouseUp) { this._frame?.chart_el.removeEventListener('mouseup', this._fireMouseUp); }

        this._chart = undefined;
        this._series = undefined;
        this._requestUpdate = undefined;
    }

    // These methods are a class property to maintain the
    // lexical 'this' scope (due to the use of the arrow function)
    // and to ensure its reference stays the same, so we can unsubscribe later.
    private _fireDataUpdated = (scope: DataChangedScope) => { if (this.onDataUpdate) { this.onDataUpdate(scope); }}
    private _fireMouseDown = (e: MouseEvent) => { if (this.onMouseDown && this._frame) this.onMouseDown(this._frame.makeEventParams(e)); }
    private _fireMouseUp = (e: MouseEvent) => {  if (this.onMouseUp && this._frame) this.onMouseUp(this._frame.makeEventParams(e)); }
    private _fireClick = (e: MouseEventParams<Time>) => { if (this.onClick) { this.onClick(e); }}
    private _fireDblClick = (e: MouseEventParams<Time>) => { if (this.onDblClick) { this.onDblClick(e); }}
    private _fireCrosshairMove = (e: MouseEventParams<Time>) => { if (this.onCrosshairMove) { this.onCrosshairMove(e); }}

    //Utility function to move a SingleValueData Point
    protected movePoint(pt: SingleValueData, dx: Logical, dy: Coordinate): SingleValueData | null {
        let x = this.chart.timeScale().timeToCoordinate(pt.time)
        let y = this.series.priceToCoordinate(pt.value)
        if (!x || !y) return null

        //Timescale Conversion to Logical and back required for consistent operation
        let l = this.chart.timeScale().coordinateToLogical(x)
        if (!l) return null
        x = this.chart.timeScale().logicalToCoordinate(l + dx as Logical)
        if (!x) return null

        let px = this.chart.timeScale().coordinateToTime(x)
        let py = this.series.coordinateToPrice(y + dy)
        if (!px || !py) return null

        return { time: px, value: py }
    }

    //Utility Function to look at the chart's timescale and grab the nearest time to the time given
    nearestBarTime(time:Time, look_left:boolean = true): Time | null {
        //@ts-ignore // Fetches the raw data from the timescale
        let time_points = this._chart?.timeScale().kl._u
        if (time_points === undefined) return null
        //@ts-ignore // When valid, pulls the unix time from the raw data
        const bar_times = Array.from(time_points, (v) => v.originalTime)
        // In this library python ensures all times are numbers => Time as Number is valid.
        let index = binarySearch(bar_times, time as Number, (a,b) => a-b)

        if (index >= 0)
            return bar_times[index]
        else if (look_left)
            return bar_times[-index]
        else
            return bar_times[Math.min(-index + 1 , bar_times.length - 1)]
    }
}

/** #region ------------ Dead Code ------------ //
 * The code below could be placed into the Primitive Base to
 * make mouse events specific to the Pane/Price Axis/Time Axis
 * That's a lot of permutations that may never get used hence this code died.
 *
 * private _paneViewDiv: HTMLDivElement | undefined = undefined
 * private _paneTimeAxisDiv: HTMLDivElement | undefined = undefined
 * private _panePriceAxisDiv: HTMLDivElement | undefined = undefined
 * const cells = this._chart.chartElement().getElementsByTagName('td')
 * this._paneViewDiv = cells[1].firstChild as HTMLDivElement ?? undefined;
 * this._paneTimeAxisDiv = cells[2].firstChild as HTMLDivElement ?? undefined;
 * this._panePriceAxisDiv = cells[4].firstChild as HTMLDivElement ?? undefined;
 * 
 *  //Utility Function to tell where in the chart Div the event was fired from.
    protected getPane(params: MouseEventParams<Time>): '' | 'ViewPane' | "TimePane" | "PricePane" | "Bot_Right_Corner" {
        if (params.point && params.sourceEvent)
            if (params.point.x === params.sourceEvent.localX && params.point.y === params.sourceEvent.localY)
                return 'ViewPane'
            else if (params.point.x === params.sourceEvent.localX && params.point.y !== params.sourceEvent.localY)
                return "TimePane"
            else if (params.point.x !== params.sourceEvent.localX && params.point.y === params.sourceEvent.localY)
                return "PricePane"
            else
                return "Bot_Right_Corner"
        return ''
    }
 */
//#endregion

/* --------------------- Custom Types & functions ----------------------- */

const cssAccentColor = getComputedStyle(document.body).getPropertyValue('--layout-main-fill');
const cssBorderColor = getComputedStyle(document.body).getPropertyValue('--accent-color');

/**
 * Draws a Dot on the Canvas at the given point. Common enough of a utility that it was made into the exportable function
 */
export function draw_dot(ctx: CanvasRenderingContext2D, p: Point, sel: boolean = false, color: string = cssAccentColor, borderColor: string = cssBorderColor) {
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
