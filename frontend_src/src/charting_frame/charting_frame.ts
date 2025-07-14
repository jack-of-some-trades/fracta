import * as lwc from "lightweight-charts";
import { Accessor, createSignal, JSX, Setter } from "solid-js";
import { ChartFrame } from "../../tsx/charting_frame/chart_elements";
import { icons } from "../../tsx/generic_elements/icons";
import { NULL_TREE_BRANCH_INTERFACE, ObjectTreeCTX, ORDERABLE, ORDERABLE_SET, ReorderableSet, treeBranchInterface, treeLeafInterface } from "../../tsx/widget_panels/object_tree";
import { contextMenuItem } from "../../tsx/window/context_menu";
import { deriveShortcuts, KeyboardCTX, keyboardShortcut } from "../../tsx/window/keyboard_listener";
import { point } from "../../tsx/window/overlay_manager";
import { applyOpacity, tf, ticker } from "../types";
import { updateTabFunc } from "../window/container";
import { frame } from "../window/frame";
import { indicator, isIndicator } from "./indicator";
import { PrimitiveBase } from "./primitive-plugins/primitive-base";
import { isPrimitiveSet, PrimitiveSet } from "./primitive-plugins/primitive-set";
import { Series_Type, SeriesApi, SeriesDefinitions } from "./series-plugins/series-base";


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

    pane_map = new WeakMap<lwc.IPaneApi<lwc.Time>, charting_pane>()
    attached = new Map<string, (indicator | PrimitiveSet)>()

    timeframe: tf
    ticker: ticker
    series_type: Series_Type

    private objTreeBranch:treeBranchInterface

    panes: Accessor<charting_pane[]>
    private setPanes: Setter<charting_pane[]>

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
        KeyboardCTX().attachHandler(this.id, this.default_pane.shortcuts)
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

    refreshSize(){ this._chart.resize(
        Math.max(this.frameRuler().clientWidth, 0), 
        Math.max(this.frameRuler().clientHeight, 0), 
        false
    )}
    
    //@ts-ignore Valid only for Lightweight-Charts v5.0.8
    fullUpdate() { this._chart.Wf.ts.Bh() }
    //@ts-ignore Valid only for Lightweight-Charts v5.0.8
    lightUpdate() { this._chart.Wf.ts.ar() }

    getPaneByIndex(index: number) : charting_pane | undefined { 
        return this.panes().find((p) => p.paneIndex === index) 
    }
    updatePaneEls() { 
        this.panes().forEach(pane => pane.updatePaneEl()) 
        this.setPanes(this.panes().sort((a, b) => a.paneIndex - b.paneIndex))
    }

    addPane(): charting_pane {
        const _paneApi = this._chart.addPane()
        const _paneWrap = new charting_pane(this, _paneApi)
        this.pane_map.set(_paneApi, _paneWrap)

        // Must set panes onAnimationFrame since the PaneAPI Element required
        // for rendering the <PaneOverlay/> is created in an animation cycle
        requestAnimationFrame( () => this.setPanes([...this.panes(), _paneWrap]) )
        return _paneWrap
    }

    _getMouseEventParams(
        index : lwc.Logical | null, 
        pt : point | null, 
        sourceEvent : lwc.TouchMouseEventData
    ):lwc.MouseEventParams<lwc.Time>{
        let renamed = {}
        //@ts-ignore := Chart._chartWidget._getMouseEventParamsImpl() : v5.0.8
        Object.entries(this._chart.Df.xw(index, pt, sourceEvent)).forEach(
            //@ts-ignore :: Rename from Minified keys => Actual Keys
            ([k,v]) => {renamed[MouseEventKeyMap[k]] = v}
        )
        return renamed as lwc.MouseEventParams<lwc.Time>
    }
    
    //** Takes a normal MouseEvent and Returns the Lightweight-Charts Mouse Event. */
    makeEventParams(e: MouseEvent): lwc.MouseEventParams<lwc.Time> {
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

        //TODO : Update this to make hoveredSeries hit registration better. See Comment at EoF.
        return this._getMouseEventParams(index, pt, sourceEvent)
    }

    fitContent() { this._chart.timeScale().fitContent() }
    autoscaleContent() { this._chart.timeScale().resetTimeScale() }
    updateTimescaleOpts(newOpts: lwc.DeepPartial<lwc.HorzScaleOptions>) { this._chart.timeScale().applyOptions(newOpts) }

    // #endregion
    
    // #region -------------- Python API Functions ------------------ //

    //Functions marked as protected are done so it indicate the original intent
    //only encompassed being called from python, not from within JS. uses snake_case for this reason.
    
    protected set_whitespace_data(data: lwc.WhitespaceData[], primitive_data:lwc.SingleValueData | undefined) {
        this.whitespace_series.setData(data)
        this.setPrimitiveData(primitive_data ?? {time:'1970-01-01', value:0})
    }
    
    protected update_whitespace_data(data: lwc.WhitespaceData, primitive_data:lwc.SingleValueData | undefined) {
        this.whitespace_series.update(data)
        this.setPrimitiveData(primitive_data ?? {time:'1970-01-01', value:0})
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
        this.updatePaneEls()
    }

    // #endregion
}

/**
 * Class to wrap around the IPaneAPI created by the chart. This class helps
 * manage the ability to order indicators/primitives within a pane.
 */
export class charting_pane implements ReorderableSet {
    [ORDERABLE]:true = true;
    [ORDERABLE_SET]:true = true;

    _pane: lwc.IPaneApi<lwc.Time>
    _frame: charting_frame

    paneEl: Accessor<HTMLTableCellElement | undefined>
    private setPaneEl: Setter<HTMLTableCellElement | undefined>

    series_primitives: PrimitiveSet | undefined
    attached: Accessor<(indicator | PrimitiveSet)[]>
    setAttached: Setter<(indicator | PrimitiveSet)[]>

    leafProps: treeLeafInterface
    branchProps: treeBranchInterface
    shortcuts: keyboardShortcut[]
    ctxMenuStruct: contextMenuItem[][]
    
    constructor(frame: charting_frame, pane: lwc.IPaneApi<lwc.Time>){
        this._pane = pane
        this._frame = frame

        this.series_primitives = new PrimitiveSet(this)

        const sig1 = createSignal<HTMLTableCellElement>()
        this.paneEl = sig1[0]; this.setPaneEl = sig1[1]

        // The Pane's DOM Element is created in an animation frame so this delays
        // setting the signal until after the element has been created.
        this.updatePaneEl()

        const sig2 = createSignal<(indicator | PrimitiveSet)[]>([])
        this.attached = sig2[0]; this.setAttached = sig2[1]

        this.leafProps = {
            obj: this,
            id:this.id,
            leafTitle:this.name
        }
        this.branchProps = {
            id: this.id,
            branchTitle: this.name,
            dropDownMode: 'always',
            reorderables: this.attached,
            moveTo: this.moveToPane.bind(this),
            reorder: this.reorderAttached.bind(this),
        }
        this.ctxMenuStruct = generateContextMenuStruct(this)
        this.shortcuts = deriveShortcuts(this.ctxMenuStruct)
    }

    get id():string { return String(this._pane.paneIndex()) }
    get name(): string {return 'Pane #' + String(this.id)}
    get frame(): charting_frame { return this._frame }
    get paneIndex(): number { return this._pane.paneIndex() }
    get paneApi(): lwc.IPaneApi<lwc.Time> { return this._pane }
    get _paneEl(): HTMLTableCellElement | undefined {
        if (this._pane.getHTMLElement()) return this._pane.getHTMLElement() as HTMLTableCellElement
    }
    get _leftAxisEl(): HTMLTableCellElement | undefined {
        const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(1)")
        if (_el) return _el as HTMLTableCellElement
    }
    get _chartEl(): HTMLTableCellElement | undefined {
        const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(2)")
        if (_el) return _el as HTMLTableCellElement
    }
    get _rightAxisEl(): HTMLTableCellElement | undefined {
        const _el = this._pane.getHTMLElement()?.querySelector("td:nth-child(3)")
        if (_el) return _el as HTMLTableCellElement
    }

    updatePaneEl(){ requestAnimationFrame(() => this.setPaneEl(this._paneEl)) }

    movePane(index: number) {
        if (index === this.paneIndex) return
        this._frame.reorderPanes(this.paneIndex, index)
    }

    // TODO: Expand this functionality to match primitive base if pane Primitives become more readily used.
    _attachPanePrimitive(primitive: lwc.IPanePrimitive){ this._pane.attachPrimitive(primitive) }
    _detachPanePrimitive(primitive: lwc.IPanePrimitive){ this._pane.detachPrimitive(primitive) }
    _attachSeriesPrimitive(primitive: PrimitiveBase){ this.series_primitives?.attachPrimitive(primitive) }
    _detachSeriesPrimitive(primitive: PrimitiveBase){ this.series_primitives?.detachPrimitive(primitive) }
    _addSeries(type: SeriesDefinitions): SeriesApi { return this._pane.addSeries(type) }
    _addCustomSeries(impl: lwc.ICustomSeriesPaneView): SeriesApi { return this._pane.addCustomSeries(impl) }
    _priceScale(scale: string): lwc.IPriceScaleApi { return this._pane.priceScale(scale) }

    indicators(): indicator[] { return this.attached().filter((obj) => isIndicator(obj))}
    primitiveSets(): PrimitiveSet[] { return this.attached().filter((obj) => isPrimitiveSet(obj))}

    attach(obj: indicator | PrimitiveSet){
        this.setAttached([...this.attached(), obj])
    }
    
    detach(obj: indicator | PrimitiveSet){
        this.setAttached([...this.attached().filter(_obj => _obj !== obj)])
    }

    reorderAttached(from: indicator | PrimitiveSet | any, to: indicator | PrimitiveSet | any): void {
        console.log(`Reorder Indicators: from: ${from}, to: ${to}`)
    }

    moveToPane(obj: indicator | PrimitiveSet | any){

    }
}

function generateContextMenuStruct(pane:charting_pane):contextMenuItem[][] {
    return [[
        {
            icon: icons.menu_arrow_sn,
            title: 'Move Pane Up',
            execute: () => pane.movePane(pane.paneIndex - 1),
            disable: () => pane.paneIndex === 0,
            ctrl: true,
            hotkey: 'ArrowUp',
        },
        {
            icon: icons.menu_arrow_ns,
            title: 'Move Pane Down',
            execute: () => pane.movePane(pane.paneIndex + 1),
            disable: () => pane.paneIndex === pane.frame.panes().length - 1,
            ctrl: true,
            hotkey: 'ArrowDown',
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
                separatorColor: style.getPropertyValue("--separator-color"),
                separatorHoverColor: applyOpacity(style.getPropertyValue("--accent-color"), 0.2),
                enableResize: true
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


/** Mouse Event Params
 * 
 * The Mouse Event Parameters that are returned are largely what you'd expect aside from the hoveredSeries. This isn't the Series
 * Object that is drawn on the screen, but the series object a primitive is attached to. Rather annoying Tbh. Although, since the
 * seriesData is accurate you could, if you found a way to work out the thickness of line plots, use the series data and the
 * Y Coordinate to work back to which series your cursor is over. Would actually be beneficial to do this then overwrite
 * 'hoveredSeries' into the expected series object. Not even just the seriesAPI Object but the Series-Base object defined by this lib.
 * 
 * Hell maybe instead of baking this feature directly into the make_event_params function you make it a public function that takes
 * a Lightweight-Charts MouseEventParam object so it only gets invoked when needed to save on computation. This has the added benefit
 * that anything that wants to subscribe to a native lwc CrosshairMove, Click, or DblClick can get the hovered series as needed.
 */

/** Lightweight Charts v5.0.8 Minified Mappings
 * chartingframe.chart === lwc.ChariApi Object
 * 
 * this.chart.Wf === ChartApi._chartWidget: ChartWidget
 * this.chart.Wf.ts === ChartApi._chartWidget._model: ChartModel
 * this.chart.Wf.ts.Bh() === ChartApi._chartWidget._model.fullUpdate()
 * this.chart.Wf.ts.ar() === ChartApi._chartWidget._model.lightUpdate()
 * this.chart.Wf.ts.qu[] === ChartApi._chartWidget._model._serieses[]: Series[]
 * this.chart.Wf.ts.$u[] === ChartApi._chartWidget._model._panes[]: Pane[]
 * this.chart.Df.xw() === ChartApi._chartWidget._getMouseEventParamsImpl()
 * 
 * _series.Jn.bh === seriesAPI.Series<SeriesType>.CustomPriceLines[]
 * _series.Jn.kh === seriesAPI.Series<SeriesType>.PrimitiveWrapperArray[]
 * _series.Jn.kh[].ah === seriesAPI.Series<SeriesType>.PrimitiveWrapperArray[].PrimitveObj
 */  

//** Key Map for Lightweight Charts MouseEvent Params: Valid only for Lightweight-Charts v5.0.8  */
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