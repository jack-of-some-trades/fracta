import * as lwc from "lightweight-charts";
import { Accessor, createSignal, JSX, Setter } from "solid-js";
import { ChartFrame } from "../../tsx/charting_frame/chart_elements";
import { NULL_TREE_BRANCH_INTERFACE, ObjectTreeCTX, treeBranchInterface } from "../../tsx/widget_panels/object_tree";
import { contextMenuItem, MenuContextListener } from "../../tsx/window/context_menu";
import { deriveShortcuts, KeyboardCTX, keyboardShortcut } from "../../tsx/window/keyboard_listener";
import { point } from "../../tsx/window/overlay_manager";
import { applyOpacity, Delegate, MouseEventKeys, tf, ticker } from "../types";
import { updateTabFunc } from "../window/container";
import { frame } from "../window/frame";
import { charting_pane } from "./charting_pane";
import { indicator, isIndicator } from "./indicator";
import { isPrimitive, PrimitiveBase } from "./primitive-plugins/primitive-base";
import { PrimitiveSet } from "./primitive-plugins/primitive-set";
import { Series_Type, SeriesBase_T } from "./series-plugins/series-base";


export type ChartingEvent<T = lwc.Time> = lwc.MouseEventParams<T> & {
    hoveredSeriesBase: SeriesBase_T | undefined,
    hoveredPrimitiveBase: PrimitiveBase | undefined,
}
export type ChartEventHandler = (param: ChartingEvent<lwc.Time>) => void
export type ChartingEventsTypes = MouseEventKeys | 'crosshair'

export interface data_src {
    indicator:indicator
    function_name:string
    source_type:string
}

const TYPE_STR = 'charting_frame'
export const isChartingFrame = (frame: frame): frame is charting_frame => frame.type === TYPE_STR

export class charting_frame extends frame {
    type:string = TYPE_STR

    frameRuler: Accessor<HTMLDivElement>
    element: JSX.Element
    
    _chart: lwc.IChartApi
    default_pane: charting_pane
    whitespace_series: lwc.ISeriesApi<'Line'>
    primitiveData: Accessor<lwc.SingleValueData>
    private setPrimitiveData: Setter<lwc.SingleValueData>
    private _timescaleTimes: number[] | undefined

    pane_map = new WeakMap<lwc.IPaneApi<lwc.Time>, charting_pane>()
    attached = new Map<string, (indicator | PrimitiveSet)>()
    private eventDelegates = new Map<ChartingEventsTypes, Delegate<ChartingEvent>>()

    timeframe: tf
    ticker: ticker
    series_type: Series_Type

    shortcuts: keyboardShortcut[]
    ctxMenuStruct: contextMenuItem[][]
    private objTreeBranch:treeBranchInterface

    panes: Accessor<charting_pane[]>
    private setPanes: Setter<charting_pane[]>

    // Used to track activity states to primarily keep the Keyboard listeners relevant
    private _activePane: charting_pane | undefined
    private _activeSeries: SeriesBase_T | undefined
    private _activePrimitive: PrimitiveBase | undefined

    constructor(id: string, tab_update_func: updateTabFunc) {
        super(id, tab_update_func)
        
        const [frameRuler, setFrameRulerRef] = createSignal<HTMLDivElement>(document.createElement('div'))
        this.frameRuler = frameRuler

        // Need a Reactive Panes Signal to Populate the Object Tree with.
        const sig1 = createSignal<charting_pane[]>([])
        this.panes = sig1[0]; this.setPanes = sig1[1]
        // Use Reactive Signal & Effects to Keep Primitive Series' Data Updated
        const sig2 = createSignal<lwc.SingleValueData>({time:'1970-01-01', value:0})
        this.primitiveData = sig2[0]; this.setPrimitiveData = sig2[1]

        // The following 3 variables are actually properties of a frame's primary Series(Indicator) obj.
        // While these really should be owned by that Series indicator and not a frame, this is how the 
        // implementation will stay until when/if indicator sub-types have their own classes in typescript.
        this.ticker = { symbol: 'FRACTA' }
        this.timeframe = new tf(1, 'D')
        this.series_type = Series_Type.CANDLESTICK

        const OPTS = DEFAULT_CHART_OPTS()
        let tmp_div = document.createElement('div')
        this._chart = lwc.createChart(tmp_div, OPTS)
        // Add initial Pane since AddDefaultPane == false
        this.default_pane = this.addPane()
        this.whitespace_series = this._chart.addSeries(lwc.LineSeries)

        this.element = ChartFrame({
            frame:this,
            setRulerRef: setFrameRulerRef
        })

        this.objTreeBranch = {
            id:this.id,
            branchTitle: '',
            dropDownMode: 'auto',
            reorderables: this.panes,
            reorder: this.reorderPanes.bind(this),
            moveTo: ()=>{}
        }

        this.ctxMenuStruct = generateContextMenuStruct(this)
        this.shortcuts = deriveShortcuts(this.ctxMenuStruct)
        this.chart_el?.addEventListener(
            'contextmenu', 
            this._onContextMenu.bind(this),
            {capture:true}
        )

        //Add Base Click Event Types that auto forward the events to hovered Series & Primitives
        this.subscribeMouseEvent('mousedown', this._onMouseDownEvent.bind(this))
        this.subscribeMouseEvent('click', this._onClickTypeEvents.bind(this, 'click'))
        this.subscribeMouseEvent('dblclick', this._onClickTypeEvents.bind(this, 'dblclick'))
        this.subscribeMouseEvent('auxclick', this._onClickTypeEvents.bind(this, 'auxclick'))
        this.subscribeMouseEvent('mouseup', this._onClickTypeEvents.bind(this, 'mouseup'))

        console.log(this)
        
        // The Following listeners allow smooth chart dragging while bars are actively updating.
        this.chart_el.addEventListener('mousedown', () => {
            this.updateTimescaleOpts({
                'shiftVisibleRangeOnNewBar': false,
                'allowShiftVisibleRangeOnWhitespaceReplacement': false,
                'rightBarStaysOnScroll': false
            })
        })
        window.document.addEventListener('mouseup', () => {
            this.updateTimescaleOpts({
                'shiftVisibleRangeOnNewBar': true,
                'allowShiftVisibleRangeOnWhitespaceReplacement': true,
                'rightBarStaysOnScroll': true
            })
        })
    }

    onActivation() {
        //Update Window Elements
        this.updateTab(this.ticker.symbol)
        window.topbar.setSeries(this.series_type)
        window.topbar.setTimeframe(this.timeframe)
        window.topbar.setTicker(this.ticker.symbol)

        // Connect To Widget Panel and Keyboard Listener
        ObjectTreeCTX().setMainBranch(this.objTreeBranch)
        KeyboardCTX().attachHandler(this.id, this.shortcuts)
    }

    onDeactivation() {
        ObjectTreeCTX().setMainBranch(NULL_TREE_BRANCH_INTERFACE)
        KeyboardCTX().detachHandler(this.id)
    }
    
    // #region -------------- Lightweight Charts API Related Functions ------------------ //

    get name() : string  {return ''}
    get chart() : lwc.IChartApi { return this._chart }
    get chart_el() : HTMLDivElement {return this._chart.chartElement()}
    get paneAPIs() : lwc.IPaneApi<lwc.Time>[] {return this._chart.panes()}
    // Cached Array of all the times (in UTC) in the timescale.
    get timescaleTimes() : number[] | undefined { return this._timescaleTimes }

    
    // Updating the Cached timeseries reference alongside the whitespace *should* catch all Timescale datapoint
    // updates. The only way for it not to is if a user indicator sets a timepoint not already on the timescale
    // which in 99.999% of applications will be a bug since it will add a gap to the screen.
    private updateTimescalePoints(){ 
        //@ts-ignore: Fetches raw data from the timescale object : Valid only for Lightweight-Charts v5.0.8 
        const _points = this.chart.timeScale().uh._D
        //@ts-ignore
        this._timescaleTimes = (_points && _points.length > 0) ? Array.from(_points, (p) => p.originalTime) : undefined
    }

    refreshSize(){ this._chart.resize(
        Math.max(this.frameRuler().clientWidth, 0), 
        Math.max(this.frameRuler().clientHeight, 0), 
        false
    )}
    
    fitContent() { this._chart.timeScale().fitContent() }
    autoscaleContent() { this._chart.timeScale().resetTimeScale() }
    applyChartOpts(newOpts: lwc.DeepPartial<lwc.ChartOptions>) { this._chart.applyOptions(newOpts) }
    updateTimescaleOpts(newOpts: lwc.DeepPartial<lwc.HorzScaleOptions>) { this._chart.timeScale().applyOptions(newOpts) }

    
    // #endregion

    //#region -------------- Mouse Events ------------------ //

    private _getMouseEventParams(
        index : lwc.Logical | null, 
        pt : point | null, 
        sourceEvent : lwc.TouchMouseEventData
    ):lwc.MouseEventParams<lwc.Time>{
        let renamed = {}
        //@ts-ignore := Chart._chartWidget._getMouseEventParamsImpl() : v5.0.8
        Object.entries(this._chart.Wf.xw(index, pt, sourceEvent)).forEach(
            //@ts-ignore :: Rename from Minified keys => Actual Keys
            ([k,v]) => {renamed[MouseEventKeyMap[k]] = v}
        )
        return renamed as lwc.MouseEventParams<lwc.Time>
    }

    private _convertMouseEventParams(params: lwc.MouseEventParams<lwc.Time>): ChartingEvent {
        return {...params, ...{
            //Always Test for SeriesBase since hoveredSeries only returns when the cursor hovers over a primitive
            'hoveredSeriesBase': advSeriesHitTest(params),
            'hoveredPrimitiveBase': isPrimitive(params.hoveredObjectId) ? params.hoveredObjectId : undefined
        }} 
    }
    
    //** Takes a normal MouseEvent and Returns the and extended Lightweight-Charts Mouse Event. */
    private _makeEventParams(e: MouseEvent): ChartingEvent {
        let index = this._chart.timeScale().coordinateToLogical(e.offsetX)
        let sourceEvent:lwc.TouchMouseEventData = {
            clientX: e.clientX as lwc.Coordinate,
            clientY: e.clientY as lwc.Coordinate,
            pageX: e.pageX as lwc.Coordinate,
            pageY: e.pageY as lwc.Coordinate,
            screenX: e.screenX as lwc.Coordinate,
            screenY: e.screenY as lwc.Coordinate,
            localX: e.offsetX as lwc.Coordinate,
            localY: e.offsetY as lwc.Coordinate,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            shiftKey: e.shiftKey,
            metaKey: e.metaKey
        }

        const rect = this.chart_el.getBoundingClientRect()
        let pt = (rect && (e.clientX - rect.left < rect.width) && (e.clientY - rect.top < rect.height))
            ? { x: e.clientX - rect.left as lwc.Coordinate, y: e.clientY - rect.top as lwc.Coordinate }
            : null

        return this._convertMouseEventParams(this._getMouseEventParams(index, pt, sourceEvent))
    }

    private _fireMouseEvent(e:MouseEvent){
        const delegate = this.eventDelegates.get(e.type as MouseEventKeys)
        if (delegate && delegate.hasListeners()) delegate.fire(this._makeEventParams(e))
    }

    private _fireCrosshairEvent(e:lwc.MouseEventParams){
        const delegate = this.eventDelegates.get('crosshair')
        if (delegate && delegate.hasListeners()) delegate.fire(this._convertMouseEventParams(e))
    }

    subscribeMouseEvent(event: ChartingEventsTypes, handler: ChartEventHandler){
        const evtDelegate = this.eventDelegates.get(event)
        if (evtDelegate){
            evtDelegate.subscribe(handler)
            return
        } 
        //Make the required Event delegate
        const newEvtDelegate = new Delegate<ChartingEvent>()
        this.eventDelegates.set(event, newEvtDelegate)
        newEvtDelegate.subscribe(handler, this)

        // Currently, these listeners are never removed & the delegates are never deleted.
        if (event === 'crosshair'){
            this._chart.subscribeCrosshairMove(this._fireCrosshairEvent.bind(this))
        } else {
            this.chart_el.addEventListener(event, this._fireMouseEvent.bind(this))
        }
    }
    
    unsubscribeMouseEvent(event: ChartingEventsTypes, handler: ChartEventHandler){
        const evtDelegate = this.eventDelegates.get(event)
        if (evtDelegate) evtDelegate.unsubscribe(handler)
    }

    subscribeLogicalRangeChange(handler:lwc.LogicalRangeChangeEventHandler){
        this._chart.timeScale().subscribeVisibleLogicalRangeChange(handler)
    }

    unsubscribeLogicalRangeChange(handler:lwc.LogicalRangeChangeEventHandler){
        this._chart.timeScale().unsubscribeVisibleLogicalRangeChange(handler)
    }

    subscribeTimeRangeChange(handler:lwc.TimeRangeChangeEventHandler<lwc.Time>){
        this._chart.timeScale().subscribeVisibleTimeRangeChange(handler)
    }

    unsubscribeTimeRangeChange(handler:lwc.TimeRangeChangeEventHandler<lwc.Time>){
        this._chart.timeScale().unsubscribeVisibleTimeRangeChange(handler)
    }

    private _onContextMenu(e:MouseEvent){
        const params = this._makeEventParams(e)
        const pane = this.panes()[params.paneIndex ?? -1]
        const menuItems = this.ctxMenuStruct
        if (pane) 
            menuItems.concat(pane.ctxMenuStruct)
        if (params.hoveredSeriesBase?.ctxMenuStruct) 
            menuItems.concat(params.hoveredSeriesBase?.ctxMenuStruct)
        if (params.hoveredPrimitiveBase?.ctxMenuStruct) 
            menuItems.concat(params.hoveredPrimitiveBase?.ctxMenuStruct)

        MenuContextListener.bind(menuItems)(e)
    }

    // Forward Click Events to Objects after a hit has been detected so each 
    // object doesn't need to perform a ( this === hoveredObj ) check
    private _onClickTypeEvents(event: ChartingEventsTypes, e: ChartingEvent){
        // TODO: Determine what order these should go in, and if one fires
        // should it block the other?
        e.hoveredPrimitiveBase?.fireClickEvent(event, e)
        e.hoveredSeriesBase?.fireClickEvent(event, e)
    }

    // Extended Frame CLick Event to Manage Activation States of sub-objects
    private _onMouseDownEvent(e: ChartingEvent){
        let clicked_pane = this.panes().find((p) => p.paneIndex == e.paneIndex)
        let change_pane = this._activePane !== clicked_pane
        let change_series = this._activeSeries !== e.hoveredSeriesBase
        let change_primitive = this._activePrimitive !== e.hoveredPrimitiveBase

        if (change_primitive) this._activePrimitive?.onDeactivation()
        if (change_series) this._activeSeries?.onDeactivation()
        if (change_pane) this._activePane?.onDeactivation()
        
        if (change_pane) {
            this._activePane = clicked_pane
            this._activePane?.onActivation()
        }
        if (change_series) {
            this._activeSeries = e.hoveredSeriesBase
            this._activeSeries?.onActivation()
        }
        if (change_primitive) {
            this._activePrimitive = e.hoveredPrimitiveBase
            this._activePrimitive?.onActivation()
        }

        // Forward the click event if needed.
        this._onClickTypeEvents('mousedown', e)
    }

    // #endregion

    // #region -------------- Pane Control Functions ------------------ //

    getPaneByIndex(index: number) : charting_pane | undefined { 
        return this.panes().find((p) => p.paneIndex === index) 
    }

    private _updatePaneEls() {
        this.panes().forEach(pane => pane._updatePaneEl()) 
        this.setPanes(this.panes().sort((a, b) => a.paneIndex - b.paneIndex))
    }

    addPane(): charting_pane {
        const _paneApi = this._chart.addPane(true)
        const _paneWrap = new charting_pane(this, _paneApi)
        this.pane_map.set(_paneApi, _paneWrap)

        // Must set panes onAnimationFrame since the PaneAPI Element required
        // for rendering the <PaneOverlay/> is created in an animation cycle
        requestAnimationFrame( () => {
            this.setPanes(
                // Ensure Panes are ordered before setting them
                [...this.panes(), _paneWrap].sort((p1, p2) => p1.paneIndex - p2.paneIndex)
            ) 
            this.panes().forEach((p) => p._updatePaneEl())
        })
        return _paneWrap
    }

    restorePanes(){ 
        this.panes().forEach(pane => pane._restorePane())
        this.applyChartOpts({layout:{panes:{enableResize:true}}})
    }

    maximizePane(pane:charting_pane){ 
        if (this.panes().some((p) => p.maximized() || p.minimized()))
            this.restorePanes()
        else
            this.panes().forEach( p => p._recordStretchFactor() )
        this.panes().forEach( p => {
            p == pane ? p._maximizePane() : p. _hidePane()
        })
        this.applyChartOpts({layout:{panes:{enableResize:false}}})
    }
    
    // #endregion

    
    // #region -------------- Python API Functions ------------------ //

    //Functions marked as protected are done so it indicate the original intent
    //only encompassed being called from python, not from within JS. uses snake_case for this reason.
    
    protected set_whitespace_data(data: lwc.WhitespaceData[], primitive_data:lwc.SingleValueData | undefined) {
        this.whitespace_series.setData(data)
        this.setPrimitiveData(primitive_data ?? {time:'1970-01-01', value:0})
        
        this.updateTimescalePoints() 
    }
    
    protected update_whitespace_data(data: lwc.WhitespaceData, primitive_data:lwc.SingleValueData | undefined) {
        this.whitespace_series.update(data)
        this.setPrimitiveData(primitive_data ?? {time:'1970-01-01', value:0})
        
        this.updateTimescalePoints()
    }

    protected set_ticker(new_ticker: ticker) {
        this.ticker = new_ticker
        this.updateTab(this.ticker.symbol)
        if (this == window.activeFrame)
            window.topbar.setTicker(this.ticker.symbol)
    }

    protected set_timeframe(new_tf_str: string) {
        this.timeframe = tf.fromStr(new_tf_str)
        if (this == window.activeFrame)
            window.topbar.setTimeframe(this.timeframe)

        //Update the Timeaxis to Show/Hide relevant timestamp
        let newOpts = { timeVisible: false, secondsVisible: false }
        if (this.timeframe.period === 's') {
            newOpts.timeVisible = true
            newOpts.secondsVisible = true
        } else if (this.timeframe.period === 'm' || this.timeframe.period === 'h') {
            newOpts.timeVisible = true
        }

        this.updateTimescaleOpts(newOpts)
    }

    protected set_series_type(new_type: Series_Type) {
        this.series_type = new_type
        if (this == window.activeFrame)
            window.topbar.setSeries(this.series_type)
    }

    protected create_indicator(
        _id: string, 
        type: string,
        name: string,
        outputs:{[key:string]:string}, 
    ) {
        let new_indicator = new indicator(_id, type, name, outputs, this)
        this.attached.set(_id, new_indicator)
    }

    protected delete_indicator(_id: string) {
        let indicator = this.attached.get(_id)
        if (indicator === undefined || !isIndicator(indicator)) return
            
        indicator.delete()
        this.attached.delete(_id)
    }

    // #endregion

    // #region -------------- Orderable Set Functions ------------------ // 

    indicatorsOnPane(paneAPI:lwc.IPaneApi<lwc.Time>): indicator[]{
        let pane = this.pane_map.get(paneAPI)
        if (pane === undefined) return []

        return pane.indicators()
    }

    reorderPanes(from: number, to:number) {
        if (from < 0 || from > this.paneAPIs.length || from === to ) return
        to = Math.max(Math.min(to, this.paneAPIs.length - 1), 0)
        this.panes()[from]._pane.moveTo(to)
        this._updatePaneEls()
    }

    // #endregion
}

function generateContextMenuStruct(frame:charting_frame):contextMenuItem[][] {
    return [[
        {
            icon: undefined,
            title: 'Restore Pane Heights',
            execute: () => frame.restorePanes(),
            disable: () => frame.panes().length < 2,
        },
    ]]
}


/* Default TimeChart Options. It's a Function so the style is Evaluated at pane construction */
function DEFAULT_CHART_OPTS(){
    const style = getComputedStyle(document.documentElement)
    const OPTS: lwc.DeepPartial<lwc.TimeChartOptions> = {
        layout: {                   // ---- Layout Options ----
            background: {
                type: lwc.ColorType.VerticalGradient,
                topColor: style.getPropertyValue("--chart-bg-color-top"),
                bottomColor: style.getPropertyValue("--chart-bg-color-bottom")
            },
            panes: {
                enableResize: true,
                separatorColor: style.getPropertyValue("--separator-color"),
                separatorHoverColor: applyOpacity(style.getPropertyValue("--accent-color"), 0.2),
            },
            textColor: style.getPropertyValue("--chart-text-color"),
            attributionLogo: style.getPropertyValue("--chart-tv-logo") === 'true'
        },
        grid: {
            vertLines: {
                color: style.getPropertyValue("--chart-grid")
            },
            horzLines: {
                color: style.getPropertyValue("--chart-grid")
            }
        },
        leftPriceScale: {          // ---- VisiblePriceScaleOptions ---- 
            mode: parseInt(style.getPropertyValue("--chart-scale-mode-left")) ?? 1,
        },
        rightPriceScale: {          // ---- VisiblePriceScaleOptions ---- 
            mode: parseInt(style.getPropertyValue("--chart-scale-mode-right")) ?? 1,
        },
        crosshair: {                // ---- Crosshair Options ---- 
            mode: parseInt(style.getPropertyValue("--chart-xhair-mode")) ?? 0,
        },
        kineticScroll: {            // ---- Kinetic Scroll ---- 
            touch: true
        },
        timeScale: {
            shiftVisibleRangeOnNewBar: true,
            allowShiftVisibleRangeOnWhitespaceReplacement: true,
            rightBarStaysOnScroll: true,
            rightOffset: parseInt(style.getPropertyValue("--chart-right-offset")) ?? 20
        },
        addDefaultPane: false, // Always set to False so 'charting_frame.addPane' always controls pane creation.
    }
    return OPTS
}

/** Lightweight Charts v5.0.8 Minified Mappings
 * chartingframe.chart === lwc.ChariApi Object
 * 
 * this.chart.Wf === ChartApi._chartWidget: ChartWidget
 * this.chart.Wf.ts === ChartApi._chartWidget._model: ChartModel
 * this.chart.Wf.ts.qu[] === ChartApi._chartWidget._model._serieses[]: Series[]
 * this.chart.Wf.ts.$u[] === ChartApi._chartWidget._model._panes[]: Pane[]
 * this.chart.Wf.xw() === ChartApi._chartWidget._getMouseEventParamsImpl()
 * 
 * ** Not currently used but have been useful before
 * this.chart.Wf.ts.Bh() === ChartApi._chartWidget._model.fullUpdate() // Recreate the DOM Element?
 * this.chart.Wf.ts.ar() === ChartApi._chartWidget._model.lightUpdate() // Redraw the canvas
 * 
 * _series.Jn.bh === seriesAPI.Series<SeriesType>.CustomPriceLines[]
 * _series.Jn.kh === seriesAPI.Series<SeriesType>.PrimitiveWrapperArray[]
 * _series.Jn.kh[].ah === seriesAPI.Series<SeriesType>.PrimitiveWrapperArray[].PrimitveObj
 * 
 * MouseEvent.Wt === MouseEvent.SeriesData
 * MouseEvent.se === MouseEvent.CustomSeriesValues
 */  

//** Key Map for Lightweight Charts MouseEvent Params: Valid only for Lightweight-Charts v5.0.8  */
/**
 * The Mouse Event Parameters that are returned are largely what you'd expect aside from the hoveredSeries. This isn't the Series
 * Object that is drawn on the screen, but the series object a hovered primitive is attached to. 
 */
const MouseEventKeyMap: {[key:string]: keyof lwc.MouseEventParams} = {
    Pw: 'time',
    Re: 'logical',
    kw: 'point',
    yw: 'paneIndex',
    Tw: 'hoveredSeries',
    Rw: 'seriesData', 
    Dw: 'hoveredObjectId',
    Vw: 'sourceEvent'
}

function advSeriesHitTest(params: lwc.MouseEventParams<lwc.Time>): SeriesBase_T | undefined {
    //The next line pulls out the seriesBase instances from the associated lwc.series obj. It then filters down
    //to only those on the clicked pane & uses the seriesIndex() to reverse order them by index.
    const orderedPairs = Array.from(params.seriesData)                 // @ts-ignore
        .filter((o) => o[0].seriesBase?.paneIndex == params.paneIndex) // @ts-ignore
        .sort((o1, o2) => o2[0].seriesBase?.index - o1[0].seriesBase?.index)

    for (const [Series, SeriesData] of orderedPairs) {
        //@ts-ignore -- Return the First SeriesBase that passes it's hitTest: Valid only for Lightweight-Charts v5.0.8 
        if (Series.seriesBase?.hitTest(params, SeriesData.se ?? SeriesData.Wt)) return Series.seriesBase
    }
}