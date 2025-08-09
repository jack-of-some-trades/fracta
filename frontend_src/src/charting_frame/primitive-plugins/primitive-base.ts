import {
    Coordinate,
    DataChangedScope,
    IChartApi,
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesApi,
    ISeriesPrimitive,
    Logical,
    Point,
    PrimitiveHoveredItem,
    SeriesAttachedParameter,
    SeriesOptionsMap,
    SingleValueData,
    Time
} from 'lightweight-charts';
import { Accessor, createEffect, createSignal, on, Setter } from 'solid-js';
import { ORDERABLE, Orderable, treeLeafInterface } from '../../../tsx/widget_panels/object_tree';
import { contextMenuItem } from '../../../tsx/window/context_menu';
import { KeyboardCTX, keyboardShortcut } from '../../../tsx/window/keyboard_listener';
import { binarySearch } from '../../types';
import { charting_frame, ChartingEvent, ChartingEventsTypes } from '../charting_frame';
import { ensureDefined } from '../helpers/assertions';
import { SeriesBase_T } from '../series-plugins/series-base';
import { isPrimitiveSet, PrimitiveSet } from './primitive-set';

export type PrimitiveRenderer = IPrimitivePaneView & IPrimitivePaneRenderer

//@ts-ignore ---- Hijack the returned object to yield the actual object instead.
export interface HoveredItem extends PrimitiveHoveredItem { externalId: PrimitiveBase }

export interface primitiveOptions {
    visible: boolean
    tangible: boolean
    autoscale: boolean
}

const DEFAULT_OPTS = { 
    visible: true,
    tangible: true,
    autoscale: false,
}

// Enumeration to standardize some various hit test results. To be used internally to a Primitive / Renderer Pair
export enum HIT_RESULT {
    ControlPt4 = -13,
    ControlPt3 = -12,
    ControlPt2 = -11,
    ControlPt1 = -10,
    Body = -9,
    Stroke = -8,
    StartPt = -7,
    MidPt = -6,
    EndPt = -5,
    Label = -4,
    SelectionBox = -2,
	Foreground = -2,
    Background = -1,

    // Values >= 0 Reserved for Primitive specific definition, most likely data-point #
    P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, P10
}

export function isPrimitive(obj: unknown): obj is PrimitiveBase { return obj instanceof PrimitiveBase }

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

    // State variable controlled by the charting_frame. 
    // True when the primitive has been clicked on using any mouse button.
    selected: Accessor<boolean>
    private setSelected: Setter<boolean>

    public shortcuts: keyboardShortcut[] | undefined
    public ctxMenuStruct: contextMenuItem[][] | undefined

    private _requestUpdate?: () => void;
    // requestUpdate() can be called to force a repaint of the chart's canvas
    protected requestUpdate(): void { if (this._requestUpdate) this._requestUpdate(); }
    // hitTest Should return itself as the 'externalID' instead of it'd actual id. Ignore the resulting type error
    hitTest?(x: number, y: number): PrimitiveHoveredItem | null;

    // The methods below can be defined by a sub-class. Their Respective events will only 
    // be called When they are the 'hoveredPrimitiveBase' target of the Charting Event.
    protected onDataUpdate?(scope: DataChangedScope): void;
    protected onClick?(param: ChartingEvent): void;
    protected onAuxClick?(param: ChartingEvent): void;
    protected onDblClick?(param: ChartingEvent): void;
    protected onMouseUp?(param:ChartingEvent): void;
    protected onMouseDown?(param: ChartingEvent): void;

    // The following methods will be added to their respective frame 'onAttached'. They fire much more frequently as a result. 
    // If these are used situationally then their subscription should be handled manually; 
    // i.e. add crosshair subscription when user desires to move a point of a trendline, then remove subscriber once point move is complete.
    // ** Prioritize CrosshairMove over mouse move since the crosshair follows magnet cursor mode.
    // ** These MouseEvents fire on the chart, not the pane. In each method
    //  you should generally Check if ( e.paneIndex === this._parent.paneIndex )
    protected onCrosshairMove?(param: ChartingEvent): void;
    protected onMouseMove?(param: ChartingEvent): void;
    protected onMouseEnter?(param: ChartingEvent): void;
    protected onMouseLeave?(param: ChartingEvent): void;
    protected onMouseOver?(param: ChartingEvent): void;
    protected onMouseOut?(param: ChartingEvent): void;
    protected onWheel?(param: ChartingEvent): void;

    constructor(_id:string, _type:string, _opts:primitiveOptions | undefined){
        this._id = _id
        this._type = _type
        this._options = {...DEFAULT_OPTS, ..._opts}

        const sig = createSignal(false)
        this.selected = sig[0]; this.setSelected = sig[1];
		createEffect(on(this.selected, () => this.requestUpdate()))

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

    onActivation() { // When the Series has been first clicked on
        console.log('activate primitive', this._type)
        this.setSelected(true)
        if (this.shortcuts) KeyboardCTX().attachHandler(this.id, this.shortcuts)
    }

    onDeactivation() {
        console.log('deactivate primitive', this._type)
        this.setSelected(false)
        if (this.shortcuts) KeyboardCTX().detachHandler(this.id)
    }

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
    
    //#region ------------------- Mouse Event Implementation Functions -------------------

    //** Invoked by Lightweight-Charts when the Primitive is attached to the chart. */
    public attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
        this._chart = chart;
        this._series = series;
        this._frame = this._parent?.frame
        
        if (this.onDataUpdate) { this._series.subscribeDataChanged(this._fireDataUpdated); }

        if (this._frame){
            if (this.onCrosshairMove) { this._frame.subscribeMouseEvent('crosshair', this._fireCrosshairMove); }
            if (this.onMouseMove) { this._frame.subscribeMouseEvent('mousemove', this._fireMouseMove); }
            if (this.onWheel) { this._frame.subscribeMouseEvent('wheel', this._fireWheel); }
            if (this.onMouseEnter) { this._frame.subscribeMouseEvent('mouseenter', this._fireMouseEnter); }
            if (this.onMouseLeave) { this._frame.subscribeMouseEvent('mouseleave', this._fireMouseLeave); }
            if (this.onMouseOver) { this._frame.subscribeMouseEvent('mouseover', this._fireMouseOver); }
            if (this.onMouseOut) { this._frame.subscribeMouseEvent('mouseout', this._fireMouseOut); }
        }
        this._requestUpdate = requestUpdate;
        this.requestUpdate();
    }

    //** Invoked by Lightweight-Charts when the Primitive removed from the chart. */
    public detached() {
        if (this.onDataUpdate && this._series) { 
            this._series.unsubscribeDataChanged(this._fireDataUpdated); 
        }

        if (this._frame){
            if (this.onCrosshairMove) { this._frame.unsubscribeMouseEvent('crosshair', this._fireCrosshairMove); }
            if (this.onMouseMove) { this._frame.unsubscribeMouseEvent('mousemove', this._fireMouseMove); }
            if (this.onWheel) { this._frame.unsubscribeMouseEvent('wheel', this._fireWheel); }
            if (this.onMouseEnter) { this._frame.unsubscribeMouseEvent('mouseenter', this._fireMouseEnter); }
            if (this.onMouseLeave) { this._frame.unsubscribeMouseEvent('mouseleave', this._fireMouseLeave); }
            if (this.onMouseOver) { this._frame.unsubscribeMouseEvent('mouseover', this._fireMouseOver); }
            if (this.onMouseOut) { this._frame.unsubscribeMouseEvent('mouseout', this._fireMouseOut); }
        }

        this._chart = undefined;
        this._series = undefined;
        this._requestUpdate = undefined;
    }

    public fireClickEvent(event: ChartingEventsTypes, e:ChartingEvent){
        switch(event){
            case 'click': this.onClick?.(e); break;
            case 'auxclick': this.onAuxClick?.(e); break;
            case 'dblclick':  this.onDblClick?.(e); break;
            case 'mouseup': this.onMouseUp?.(e); break;
            case 'mousedown': this.onMouseDown?.(e); break;
        }
    }

    private _fireCrosshairMove = (e:ChartingEvent) => this.onCrosshairMove?.(e)
    private _fireMouseMove = (e:ChartingEvent) => this.onMouseMove?.(e)
    private _fireWheel = (e:ChartingEvent) => this.onWheel?.(e)
    private _fireMouseEnter = (e:ChartingEvent) => this.onMouseEnter?.(e)
    private _fireMouseLeave = (e:ChartingEvent) => this.onMouseLeave?.(e)
    private _fireMouseOver = (e:ChartingEvent) => this.onMouseOver?.(e)
    private _fireMouseOut = (e:ChartingEvent) => this.onMouseOut?.(e)
    private _fireDataUpdated = (scope: DataChangedScope) => this.onDataUpdate?.(scope)

    //#endregion

    //#region ------------------- Utility Functions -------------------
    //TODO: Abstract these w/ dependency injection and move them to the helpers folder

    //Moves a SingleValueData Point by a given number of indecies (in X) and pixels (in Y)
    movePoint(pt: SingleValueData, dx: Logical, dy: Coordinate): SingleValueData | null {
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

    timeToIndex(time: Time): number | null {
		const timescale = this.chart.timeScale()
		return timescale.coordinateToLogical(timescale.timeToCoordinate(time) ?? -1)
    }

    // TODO: Determine if binary searching this frequently (by calling this un renderer.update functions)
    //  is a bad idea or not. only alternative would be to cache the value and setup a method to invalidate 
    // the cache on timeframe change.. when else would it need invalidating?
    nearestBarCoordinate(time:Time, look_left:boolean = true): Coordinate | null {
        const _nearestTime = this.nearestBarTime(time, look_left)
        return _nearestTime ? this.chart.timeScale().timeToCoordinate(_nearestTime) : null
    }

    //Returns the nearest visible time to the time given
    nearestBarTime(time:Time, look_left:boolean = true): Time | null {
        const time_points = this._frame?.timescaleTimes
        if (time_points === undefined) return null

        // In this library python ensures all times are numbers => Time as Number is valid.
        let index = binarySearch(this._frame?.timescaleTimes ?? [], time as Number, (a,b) => a-b)

        if (index >= 0) // Found Time value given
            return time
        else if (look_left) // Negative Index indicates nearest index to the left.
            return time_points[-index] as Time
        else
            return time_points[Math.min(-index + 1 , time_points.length - 1)] as Time
    }

    //#endregion
}

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
