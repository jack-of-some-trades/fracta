import {
    Coordinate,
    DataChangedScope,
    IChartApi,
    IPaneApi,
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesApi,
    ISeriesPrimitive,
    Logical,
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
import { charting_pane } from '../charting_pane';
import { ensureDefined } from '../helpers/assertions';
import { SeriesBase_T } from '../series-plugins/series-base';
import { isPrimitiveSet, PrimitiveSet } from './primitive-set';

export type PrimitiveRenderer = IPrimitivePaneView & IPrimitivePaneRenderer

//@ts-ignore - Change the type of externalID to provide better hit-detection
export interface HoveredItem extends PrimitiveHoveredItem { 
    externalId: PrimitiveBase_T
    hitResult: hitResult
}

export interface primitiveOptions {
    visible: boolean
    tangible: boolean
    autoscale: boolean
}

export const DEFAULT_PRIMITIVE_OPTS:primitiveOptions = { 
    visible: true,
    tangible: true,
    autoscale: false,
}

// Enumeration to standardize some various hit test results.
export type hitResult = HIT_RESULT | number
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

    // Values >= 0 Reserved for data-point # or Primitive specific definition
    P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, P10
}

export type PrimitiveBase_T = PrimitiveBase<primitiveOptions>
export function isPrimitive(obj: unknown): obj is PrimitiveBase_T { return obj instanceof PrimitiveBase }

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
export abstract class PrimitiveBase<T extends primitiveOptions> implements ISeriesPrimitive<Time>, Orderable {
    [ORDERABLE]:true = true;
    private _frame: charting_frame | undefined
    private _parent: PrimitiveSet | SeriesBase_T | undefined
    protected _chart: IChartApi | undefined
    protected _series: ISeriesApi<keyof SeriesOptionsMap> | undefined
    leafProps: treeLeafInterface

    _id: string = ""
    _name: string | undefined = undefined
    _type: string = "null"

    constructor(_id:string, _type:string, _opts:T | undefined){
        this._id = _id
        this._type = _type
        
        this._options = {...DEFAULT_PRIMITIVE_OPTS as T, ..._opts}
		this.applyOptions = this.applyOptions.bind(this)

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
    get chartApi(): IChartApi { return ensureDefined(this._chart); }
    get paneApi(): IPaneApi<Time> { return this.series.getPane() }
    get series(): ISeriesApi<keyof SeriesOptionsMap> { return ensureDefined(this._series); }

    //@ts-ignore - Ignore Non-existent Property Error
    get pane(): charting_pane { return ensureDefined(this.paneApi.chartingPane) }
    //@ts-ignore - Ignore Non-existent Property Error
    get frame(): charting_frame { return ensureDefined(this.chartApi.chartingFrame) }
    
    // IMPORTANT DEVELOPER NOTE: All the primitive specific data should be stored in primitive.options.
    // This links into how options are updated (both from TS & Python) & how the options menus are programmatically generated.
    _options: T
    options(): T { return structuredClone(this._options) }
    get<K extends keyof T>(key: K): T[K] { return this._options[key] }
    applyOptions(opts:Partial<T> | undefined, externalCall = false) {
        if (opts === undefined) return

        this._options = {...this._options, ...opts}
        this.requestUpdate()
        
        if (!externalCall && this._frame && this._parent) {
            //Call originated from a UI request. Sync the python object
            window.api.update_primitive_options(
                this._frame.id.substring(0,6),  // Container ID only
                this._frame.id,
                this._parent.id,
                this.id, 
                opts // NOTE: this only sends back updated params
            )
        }
    }

    // State variable controlled by the charting_frame. 
    // True when the primitive has been clicked on using any mouse button.
    selected: Accessor<boolean>
    private setSelected: Setter<boolean>

    public shortcuts: keyboardShortcut[] | undefined
    public ctxMenuStruct: contextMenuItem[][] | undefined
    public abstract displayOptionsMenu(): void

    private _requestUpdate?: () => void;
    // requestUpdate() can be called to force a repaint of the chart's canvas
    // Internally this calls ChartModel.fullUpdate() which sets an invalidation mask. 
    // Given the naming my assumption is this is good to call multiple times in a row 
    // and will only result in a single render update once the invalidation mask is serviced
    protected requestUpdate(): void { if (this._requestUpdate) this._requestUpdate(); }
    // hitTest Should return itself as the 'externalID' instead of it'd actual id. Ignore the resulting type error
    hitTest(x: number, y: number): PrimitiveHoveredItem | null { return null };

    // The methods below can be defined by a sub-class. Their Respective events will only 
    // be called When they are the 'hoveredPrimitiveBase' target of the Charting Event.
    protected onDataUpdate?(scope: DataChangedScope): void;
    protected onClick?(param: ChartingEvent): void;
    protected onAuxClick?(param: ChartingEvent): void;
    protected onDblClick?(param: ChartingEvent) { this.displayOptionsMenu() }
    protected onMouseUp?(param:ChartingEvent): void;
    protected onMouseDown?(param: ChartingEvent): void;
    // The Following 3, when defined, will execute an additional HitTest() per primitive, per cursor move event.
    protected onMouseEnter?(param: ChartingEvent): void;
    protected onMouseLeave?(param: ChartingEvent): void;
    // Since there is no DOM-Tree separate Over/Out Methods don't make sense, so they've been combined.
    protected onMouseOverOut?(param: ChartingEvent, from?: hitResult, to?: hitResult): void;

    // MouseEvents will be added to their respective frame 'onAttached'. They fire much more frequently as a result. 
    // ** Prioritize CrosshairMove over mousemove since the crosshair follows w/ magnet cursor mode.
    // ** These MouseEvents fire on the chart, not the pane so generally you should check e.paneIndex === this._parent.paneIndex
    protected onCrosshairMove?(param: ChartingEvent): void;
    protected onMouseMove?(param: ChartingEvent): void;

    // onWheel is not entirely implemented yet. Currently the Scroll wheel always adjusts the timescale.
    // That event would need to be intercepted if a primitive's onWheel() is invoked.
    protected onWheel?(param: ChartingEvent): void;

    setParent(parent: PrimitiveSet | SeriesBase_T | undefined){this._parent = parent}

    onActivation() { // When the Series has been first clicked on
        console.debug('Primitive Activated', this)
        this.setSelected(true)
        if (this.shortcuts) KeyboardCTX().attachHandler(this.id, this.shortcuts)
    }

    onDeactivation() {
        console.debug('Primitive Deactivated', this)
        this.setSelected(false)
        if (this.shortcuts) KeyboardCTX().detachHandler(this.id)
    }

    remove() {
        if(isPrimitiveSet(this._parent)){
            this._parent.detachPrimitive(this)
        } else {
            this.paneApi.detachPrimitive(this)
        }
    }
    
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
            if (this.onMouseEnter || this.onMouseLeave || this.onMouseOverOut) { 
                this._frame.subscribeMouseEvent('mousemove', this._maybeFireMouseOverOutEnterLeave); 
            }
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
            if (this.onMouseEnter || this.onMouseLeave || this.onMouseOverOut) { 
                this._frame.unsubscribeMouseEvent('mousemove', this._maybeFireMouseOverOutEnterLeave); 
            }
        }

        this._frame = undefined;
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
    private _fireDataUpdated = (scope: DataChangedScope) => this.onDataUpdate?.(scope)

    // Only valid state if one of the  mouseEnter, mouseLeave, mouseOverOut functions are defined
    private _hoveredItem:HoveredItem | null = null 
    private _maybeFireMouseOverOutEnterLeave = (e:ChartingEvent) => { 
        if (!this._parent || e.paneIndex != this._parent.pane.paneIndex) return
        if (!e.point?.x || !e.point?.y) return

        const hit = this.hitTest(e.point?.x, e.point?.y) as HoveredItem | null

        if (this.onMouseEnter || this.onMouseLeave){
            // Detect when hit changes from null to an object or vise-versa
            if ((hit ? true : false) !== (this._hoveredItem ? true: false))
                hit ? this.onMouseEnter?.(e) : this.onMouseLeave?.(e)
        }
        if (this.onMouseOverOut){
            // Detected When the Hit-Result Changes
            if (hit?.hitResult !== this._hoveredItem?.hitResult)
                this.onMouseOverOut(e, this._hoveredItem?.hitResult, hit?.hitResult)
        }
        this._hoveredItem = hit
    }

    //#endregion

    //#region ------------------- Utility Functions -------------------
    //TODO: Abstract these w/ dependency injection and move them to the helpers folder?

    //Moves a SingleValueData Point by a given number of indecies (in X) and pixels (in Y)
    movePoint(pt: SingleValueData, dx: Logical, dy: Coordinate): SingleValueData | null {
        let x = this.chartApi.timeScale().timeToCoordinate(pt.time)
        let y = this.series.priceToCoordinate(pt.value)
        if (!x || !y) return null

        //Timescale Conversion to Logical and back required for consistent operation
        let l = this.chartApi.timeScale().coordinateToLogical(x)
        if (!l) return null
        x = this.chartApi.timeScale().logicalToCoordinate(l + dx as Logical)
        if (!x) return null

        let px = this.chartApi.timeScale().coordinateToTime(x)
        let py = this.series.coordinateToPrice(y + dy)
        if (!px || !py) return null

        return { time: px, value: py }
    }

    timeToIndex(time: Time): number | null {
		const timescale = this.chartApi.timeScale()
		return timescale.coordinateToLogical(timescale.timeToCoordinate(time) ?? -1)
    }

    // TODO: Determine if binary searching this frequently (by calling this in renderer.update functions)
    // is a bad idea or not. only alternative would be to cache the value and setup a method to invalidate 
    // the cache on timeframe change.. when else would it need invalidating?
    nearestBarCoordinate(time:Time, look_left:boolean = true): Coordinate | null {
        const _nearestTime = this.nearestBarTime(time, look_left)
        return _nearestTime ? this.chartApi.timeScale().timeToCoordinate(_nearestTime) : null
    }

    //Returns the nearest visible time to the time given
    nearestBarTime(time:Time, look_left:boolean = true): Time | null {
        const time_points = this._frame?.timescaleTimes
        if (time_points === undefined) return null

        // In this library python ensures all times are numbers => Time as Number is valid.
        let index = binarySearch(this._frame?.timescaleTimes ?? [], time as Number, (a,b) => a-b)

        if (index >= 0) // Found Time value given
            return time

        // Negative Index => Value not found, (-index) is the nearest index to the left.
        if (look_left) 
            return time_points[-index] as Time
        else // When looking right, cap index at last valid index
            return time_points[Math.min(-index + 1 , time_points.length - 1)] as Time
    }

    //#endregion
}