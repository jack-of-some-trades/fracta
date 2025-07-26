/**
 * File that defines types and Interfaces associated with the Series Objects used in lightweight-charts
 * This also defines a class that wraps around the SeriesAPI instances created to extend their behavior.
 */
import * as lwc from "lightweight-charts";
import { ORDERABLE, Orderable, treeLeafInterface } from "../../../tsx/widget_panels/object_tree";
import { contextMenuItem } from "../../../tsx/window/context_menu";
import { KeyboardCTX, keyboardShortcut } from "../../../tsx/window/keyboard_listener";
import { charting_frame, ChartingEvent, ChartingEventsTypes } from "../charting_frame";
import { charting_pane } from "../charting_pane";
import { indicator } from "../indicator";
import { RoundedCandleHitTest, RoundedCandleSeriesData, RoundedCandleSeriesImpl, RoundedCandleSeriesOptions, RoundedCandleSeriesPartialOptions } from "./rounded-candles-series/rounded-candles-series";


// #region --------------------- Type Definitions & Interface Extensions ----------------------- */

/* This must match the orm.enum.SeriesType. The value, [0-9], is what is actually compared*/
export enum Series_Type {
    WhitespaceData,
    SingleValueData,
    LINE,
    AREA,
    BASELINE,
    HISTOGRAM,
    OHLC,
    BAR,
    CANDLESTICK,
    // HLC_AREA,
    ROUNDED_CANDLE
}

const SERIES_NAME_MAP = new Map<Series_Type, string>([
    [Series_Type.WhitespaceData,'Whitespace'],
    [Series_Type.SingleValueData,'Single-Value'],
    [Series_Type.LINE,'Line'],
    [Series_Type.AREA,'Area'],
    [Series_Type.BASELINE,'Baseline'],
    [Series_Type.HISTOGRAM,'Histogram'],
    [Series_Type.OHLC,'OHLC'],
    [Series_Type.BAR,'Bar'],
    [Series_Type.CANDLESTICK,'Candlestick'],
    // [Series_Type.HLC_AREA:'High-Low Area'],
    [Series_Type.ROUNDED_CANDLE,'Rounded-Candle']
])


const SERIES_TYPE_MAP = new Map<Series_Type, SeriesDefinitions>([
    [Series_Type.WhitespaceData, lwc.LineSeries],
    [Series_Type.SingleValueData, lwc.LineSeries],
    [Series_Type.LINE, lwc.LineSeries],
    [Series_Type.AREA, lwc.AreaSeries],
    [Series_Type.BASELINE, lwc.BaselineSeries],
    [Series_Type.HISTOGRAM, lwc.HistogramSeries],
    [Series_Type.BAR, lwc.BarSeries],
    [Series_Type.OHLC, lwc.CandlestickSeries],
    [Series_Type.CANDLESTICK, lwc.CandlestickSeries],
])

const NULL_HIT = () => false
// Unlisted Series Types default to 
type HitTest = (this:SeriesBase_T, params: lwc.MouseEventParams, data:any) => boolean
const SERIES_HIT_TEST_MAP = new Map<Series_Type, HitTest>([
    // Built-In Series Types
    [Series_Type.LINE, LineHitTest],
    [Series_Type.AREA, LineHitTest],
    [Series_Type.HISTOGRAM, HistogramHitTest],
    [Series_Type.BAR, CandleHitTest],
    [Series_Type.OHLC, CandleHitTest],
    [Series_Type.CANDLESTICK, CandleHitTest],
    // Custom Series Types
    [Series_Type.ROUNDED_CANDLE, RoundedCandleHitTest],
])

export type BarSeries = SeriesBase<'Bar'>
export type LineSeries = SeriesBase<"Line">
export type AreaSeries = SeriesBase<"Area">
export type BaselineSeries = SeriesBase<"Baseline">
export type HistogramSeries = SeriesBase<'Histogram'>
export type CandleStickSeries = SeriesBase<'Candlestick'>
export type RoundedCandleSeries = SeriesBase<"Rounded_Candle">
export type SeriesBase_T = SeriesBase<Exclude<keyof SeriesOptionsMap_EXT, 'Custom'>>

// Meant to represent the 'Series' in lwc that isn't exported. (the class owned by 'SeriesApi')
export type Series = lwc.ISeriesApi<keyof lwc.SeriesOptionsMap>
// Meant to represent the 'SeriesApi' in lwc that isn't exported. (the class that implements 'ISeriesApi')
export type SeriesApi = lwc.ISeriesApi<keyof lwc.SeriesOptionsMap>
export type SeriesDefinitions = lwc.SeriesDefinition<keyof lwc.SeriesOptionsMap>

/* --------------------- Generic Types ----------------------- */

type ValueOf<T> = T[keyof T];

/* Represents any type of Data that could be sent to, or retrieved from, a series */
export type SeriesData = ValueOf<SeriesDataTypeMap_EXT>
/* Represents any type of Series Options */
export type SeriesOptions = ValueOf<SeriesOptionsMap_EXT>


/* ----------------------- Series Interface Expansions ----------------------- */

/*
 * These Interfaces / Types extend the Standard Options & Data Type Maps that come with the Lightweight Charts Package.
 * This is done so that each interface can be expanded to include more standardized Custom Series Types for this module.
 * As a result, the 'Custom' Type has been excluded since custom types should be explicitly defined here.
 */

/* Represents the type of options for each series type. */
export interface SeriesOptionsMap_EXT extends Exclude<lwc.SeriesOptionsMap, 'Custom'> {
    Rounded_Candle: RoundedCandleSeriesOptions;
}

/* Represents the type of data that a series contains. */
export interface SeriesDataTypeMap_EXT<HorzScaleItem = lwc.Time> extends Exclude<lwc.SeriesDataItemTypeMap, 'Custom'> {
    Rounded_Candle: RoundedCandleSeriesData | lwc.WhitespaceData<HorzScaleItem>;
}

/* Represents the type of partial options for each series type. */
export interface SeriesPartialOptionsMap_EXT extends Exclude<lwc.SeriesPartialOptionsMap, 'Custom'>  {
    Rounded_Candle: RoundedCandleSeriesPartialOptions;
}


//#endregion


/**
 * This class is a thin shell wrapper around lightweight-charts' ISeriesApi.
 * The wrapper serves to add a couple parameters and functions that are closely tied
 * with the series objects. Most Notable, this object contains functions that reach
 * into the SeriesAPI minified object to manipulate instance variables that aren't
 * normally exposed by the lightweight-charts library.
 * 
 * This would have been an extension of the lightweight charts' SeriesAPI Class, but that
 * class isn't exported, only it's interface ISeriesAPI is.
 * 
 * This is a sister class to the PrimitiveBase class defined by this module.
 * 
 * This generic class also serves to remove the 'Custom' Series Type. Instead any series types that
 * would have been defined as custom should be explicit extensions of this class's type parameter.
 * Thus should be added to the Options, Partial_Options, and Data Type Maps below.
 * 
 * Docs: https://tradingview.github.io/lightweight-charts/docs/api/interfaces/ISeriesApi
 */
export class SeriesBase<T extends Exclude<keyof SeriesOptionsMap_EXT, 'Custom'>> implements Orderable{
    [ORDERABLE]:true = true;
    private _series: lwc.ISeriesApi<lwc.SeriesType>
    private _indicator: indicator

    private _id: string
    _type: Series_Type
    _name: string | undefined

    hitTest: HitTest
    _markers: Map<string, lwc.SeriesMarker<lwc.Time>> | undefined
    _markersPlugin: lwc.ISeriesMarkersPluginApi<lwc.Time> | undefined
    _pricelines: Map<string, lwc.IPriceLine> | undefined

    public shortcuts: keyboardShortcut[] | undefined
    public ctxMenuStruct: contextMenuItem[][] | undefined

    leafProps: treeLeafInterface

    constructor(
        id: string,
        displayName: string | undefined,
        type: Series_Type,
        _indicator: indicator
    ){
        this._id = id
        this._type = type
        this._indicator = _indicator
        this._name = displayName
        this._series = this._createSeries(type)
        this.hitTest = SERIES_HIT_TEST_MAP.get(type)?.bind(this) ?? NULL_HIT

        console.log(this)
        this.leafProps = {
            id:this.id,
            leafTitle:this.name,
            obj: this
        }
    }
    
    private _createSeries(series_type: Series_Type): SeriesApi {
        let _lwc_type = SERIES_TYPE_MAP.get(series_type)
        let new_series
        if (_lwc_type) new_series = this.pane._addSeries(_lwc_type)

        // ---- Custom Series Types ---- //
        else switch (series_type) {
            // Add Custom Series Switch statement so accommodations don't need to be made on the Python side
            case (Series_Type.ROUNDED_CANDLE):
                new_series = this.pane._addCustomSeries(new RoundedCandleSeriesImpl())
                break;
        }
        if (!new_series)
            throw TypeError(`Unknown Series Type: ${series_type}`)

        // Provide a reference back to the SeriesBase Obj from the internal Series Object,
        // @ts-ignore -- SeriesAPI._series.seriesBase = this : Valid only for Lightweight-Charts v5.0.8
        new_series.Jn.seriesBase = this
        return new_series
    }

    get id() : string {return this._id}
    get indicator(): indicator {return this._indicator}
    get index(): number {return this._series.seriesOrder()}
    get paneIndex(): number { return this._indicator.pane.paneIndex }
    get name() : string { return this._name? this._name : SERIES_NAME_MAP.get(this._type) ?? ''}
    get pane() : charting_pane { return this._indicator.pane }
    get frame() : charting_frame { return this._indicator.frame }
    get chart() : lwc.IChartApi { return this._indicator.frame._chart }

    onActivation() { // When the Series has been first clicked on
        console.log('activate series', this._type)
        if (this.shortcuts) KeyboardCTX().attachHandler(this.id, this.shortcuts)
    }

    onDeactivation() {
        console.log('deactivate series', this._type)
        KeyboardCTX().detachHandler(this.id)
    }
    
    remove(){ this.chart.removeSeries(this._series) }
    protected update(bar: SeriesDataTypeMap_EXT[T]) { this._series.update(bar) }
    protected setData(data: SeriesDataTypeMap_EXT[T][]) { this._series.setData(data) }

    /* Changes the type of series that is displayed. Data must be given since the DataType may change */
    protected change_series_type(series_type:Series_Type, data:SeriesData[]){
        if (series_type === this._type) return

        const current_zindex = this._series.seriesOrder()
        const current_range = this.chart.timeScale().getVisibleRange()
        
        this.remove()
        this._series = this._createSeries(series_type)
        this._series.setData(data) // Type Checking presumed to have been done in python
        this._type = series_type

        //Reset the draw order to what is was before the change.
        this._series.setSeriesOrder(current_zindex)

        //Setting Data Changes Visible Range, set it back.
        if (current_range !== null)
            this.chart.timeScale().setVisibleRange(current_range)
        
        this.hitTest = SERIES_HIT_TEST_MAP.get(this._type)?.bind(this) ?? NULL_HIT
    }

    // #region ---- ---- lightweight-chart ISeriesAPI functions ---- ----

    priceScale(): lwc.IPriceScaleApi {return this._series.priceScale()}
    applyOptions(options: SeriesPartialOptionsMap_EXT[T]) {this._series.applyOptions(options)}
    options(): Readonly<SeriesOptionsMap_EXT[T]> {return this._series.options() as SeriesOptionsMap_EXT[T]}

    // data() may not work as intended. Extra data parameters are deleted on setData()
    // e.g. High/Low/Close/Open values passed to a line series are deleted. Only 'time', 'value', and 'customValues' are kept.
    data(): readonly SeriesDataTypeMap_EXT[T][] { return this._series.data() } 
    dataByIndex(logicalIndex: number, mismatchDirection?: lwc.MismatchDirection): SeriesDataTypeMap_EXT[T] | null {return this._series.dataByIndex(logicalIndex, mismatchDirection)}
    barsInLogicalRange(range: lwc.LogicalRange): lwc.BarsInfo<lwc.Time> | null {return this._series.barsInLogicalRange(range)}
    
    priceFormatter(): lwc.IPriceFormatter {return this._series.priceFormatter()}
    priceToCoordinate(price: number): lwc.Coordinate | null {return this._series.priceToCoordinate(price)}
    coordinateToPrice(coordinate: number): lwc.BarPrice | null {return this._series.coordinateToPrice(coordinate)}

    // #endregion

    // #region ---- ---- MouseEvent Functions ---- ----
    // To be Implemented Mouse Events for Series Types

    private _onClick(param: ChartingEvent){}
    private _onAuxClick(param: ChartingEvent){}
    private _onDblClick(param: ChartingEvent){}
    private _onMouseUp(param:ChartingEvent){}
    private _onMouseDown(param: ChartingEvent){}
    
    public fireClickEvent(event: ChartingEventsTypes, e:ChartingEvent){
        switch(event){
            case 'click': this._onClick?.(e); break;
            case 'auxclick': this._onAuxClick?.(e); break;
            case 'dblclick':  this._onDblClick?.(e); break;
            case 'mouseup': this._onMouseUp?.(e); break;
            case 'mousedown': this._onMouseDown?.(e); break;
        }
    }

    //#endregion
    
    // #region ---- ---- Markers Functions ---- ----

    get markers(): Map<string, lwc.SeriesMarker<lwc.Time>>{
        if (this._markers === undefined)
            this._markers = new Map<string, lwc.SeriesMarker<lwc.Time>>()
        return this._markers
    } 

    get markersPlugin(): lwc.ISeriesMarkersPluginApi<lwc.Time>{
        if (this._markersPlugin === undefined)
            this._markersPlugin = lwc.createSeriesMarkers(this._series, [])

        return this._markersPlugin
    } 

    private _updateMarkersPlugin(){
        this.markersPlugin.setMarkers(Array.from(this.markers.values()))
    }

    setMarkersOptions(opts: lwc.DeepPartial<lwc.SeriesMarkersOptions>){
        this.markersPlugin.applyOptions?.(opts)
    }
    
    setMarkers(markers:{[key:string]: lwc.SeriesMarker<lwc.Time>}){
        delete this._markers
        this._markers = new Map<string, lwc.SeriesMarker<lwc.Time>>(Object.entries(markers))
        this._updateMarkersPlugin() 
    }

    updateMarker(mark_id :string, mark: lwc.SeriesMarker<lwc.Time>){ 
        this.markers.set(mark_id, mark)
        this._updateMarkersPlugin() 
    }

    removeMarker(mark_id :string){ 
        if (this._markers === undefined) return
        if (this.markers.delete(mark_id)) this._updateMarkersPlugin()
    }

    filterMarkers(_ids: string[]){
        if (this._markers === undefined) return
        _ids.forEach((id) => this.markers.delete(id))
        this._updateMarkersPlugin()
    }

    removeAllMarkers(){
        delete this._markers
        this._markers = new Map<string, lwc.SeriesMarker<lwc.Time>>()
        this._updateMarkersPlugin()
    }

    //#endregion

    // #region ---- ---- Priceline Functions ---- ----

    get pricelines():Map<string, lwc.IPriceLine> {
        if (this._pricelines == undefined)
            this._pricelines = new Map<string, lwc.IPriceLine>()
        return this._pricelines
    }

    createPriceLine(id:string, options: lwc.CreatePriceLineOptions) {
        this.pricelines.set(id, this._series.createPriceLine(options))
    }

    removePriceLine(line_id:string){
        let line = this.pricelines.get(line_id)
        if (line !== undefined){
            this._series.removePriceLine(line)
            this.pricelines.delete(line_id)
        }
    }

    updatePriceLine(line_id:string, options: lwc.CreatePriceLineOptions){
        let line = this.pricelines.get(line_id)
        if (line !== undefined) line.applyOptions(options)
    }

    filterPriceLines(_ids: string[]){
        _ids.forEach(this.removePriceLine.bind(this))
    }
    
    removeAllPriceLines(){
        if (this._pricelines == undefined) return
        //@ts-ignore: _series.Jn.bh === seriesAPI.Series<SeriesType>.CustomPriceLines[] array for Lightweight-Charts v5.0.8
        this._series.Jn.bh = []
        delete this._pricelines
    }
    //#endregion
}

// #region ---- ---- ---- ---- Built-In SeriesAPI HitTests ---- ---- ---- ---- 

function LineHitTest(this:SeriesBase_T, params: lwc.MouseEventParams, data:Array<number>): boolean {
    const localY = params.sourceEvent?.localY
    if (localY === undefined || !data ) return false
    
    // Data = [value, value, value, value]
    const value = this.priceToCoordinate(data[0] as number)

    // Cursor is within 5 px of the line
    return (value && (Math.abs(value - localY) <= 10)) ?? false
}


function HistogramHitTest(this:SeriesBase_T, params: lwc.MouseEventParams, data:Array<number>): boolean {
    const localY = params.sourceEvent?.localY
    if (localY === undefined || !data ) return false
    
    // Data = [value, value, value, value]
    const value = this.priceToCoordinate(data[0] as number)

    if (this.priceScale().options().invertScale)
        return (value && localY < value) ?? false
    else
        return (value && localY > value) ?? false
}


function CandleHitTest(this:SeriesBase_T, params: lwc.MouseEventParams, data:Array<number>): boolean {
    const localY = params.sourceEvent?.localY
    if (localY === undefined || !data ) return false
    
    // Data = [open, high, low, close]
    const high = this.priceToCoordinate(data[1] as number)
    const low = this.priceToCoordinate(data[2] as number)

	// gt & lt signs are backwards because coordinate is measured from top, not from bottom
	return ((high && low) && (high <= localY && low >= localY)) ?? false 
}
// #endregion