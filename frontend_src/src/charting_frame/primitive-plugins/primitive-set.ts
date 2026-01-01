import { DeepPartial, IChartApi, ISeriesApi, LineSeries, LineSeriesOptions } from "lightweight-charts"
import { Accessor, createEffect, createSignal, Setter } from "solid-js"
import { DropDownModes, ORDERABLE, ORDERABLE_SET, ReorderableSet, treeBranchInterface, treeLeafInterface } from "../../../tsx/widget_panels/object_tree"
import { charting_frame } from "../charting_frame"
import { charting_pane } from "../charting_pane"
import { PrimitiveBase, primitiveOptions } from "./primitive-base"
import { primitive_cls } from "./primitives"


/** 
 * This Class is an implementation tool to ensure Primitives have the necessary tools to render properly &
 * doubles as a grouping mechanism for sets of primitives.
 * 
 * For Primitives to display anything they need to be attached to a series that has data. This data needs
 * to be at least 1 data-point with a value and a time that is either on screen or in the future. 
 * If the series only contains whitespace then they are not rendered. Similarly, if their only data is off screen in the 
 * past then they are not rendered. 
 * 
 * The Current bar time of the main series is used since it is the future-most data-point that doesn't interfere with
 * the Main-series auto-scroll on new data functionality. (Like The Future-most data-point of the whitespace projection does)
 */

const PRIMITIVE_SET = Symbol('PrimitiveSet');
export function isPrimitiveSet(obj: unknown): obj is PrimitiveSet {
    return (obj !== null && typeof obj === 'object' && PRIMITIVE_SET in obj)
}

export class PrimitiveSet implements ReorderableSet {
    [ORDERABLE]: true = true;
    [ORDERABLE_SET]: true = true;
    [PRIMITIVE_SET]: true = true;
    dropDownMode: DropDownModes = 'auto'

    private _id: string
    private _name: string | undefined
    private _series: ISeriesApi<'Line'>
    private _pane: charting_pane
    private _frame: charting_frame

    private _primitives = new Map<string, PrimitiveBase<primitiveOptions>>()

    attached: Accessor<PrimitiveBase<primitiveOptions>[]>;
    setAttached: Setter<PrimitiveBase<primitiveOptions>[]>;

    leafProps: treeLeafInterface
    branchProps: treeBranchInterface

    constructor(id: string, name: string | undefined, pane: charting_pane) {
        this._pane = pane
        this._frame = pane.frame
        this._series = this._pane.paneApi.addSeries(
            LineSeries,
            {
                color: 'transparent',
                autoscaleInfoProvider: () => null
            }
        )

        this._id = id
        this._name = name

        const sig = createSignal<PrimitiveBase<primitiveOptions>[]>([])
        this.attached = sig[0]; this.setAttached = sig[1];

        // Auto Update the underlying series data with the frame so all primitives
        // are always visible on screen
        createEffect(() => this._series.setData([this._frame.primitiveData()]))

        this.leafProps = {
            id: this.id,
            leafTitle: this.name,
            obj: this
        }
        this.branchProps = {
            id: this.id,
            branchTitle: 'Primitive Set',
            dropDownMode: 'auto',
            reorderables: this.attached,
            reorder: this.reorderPrimitives.bind(this),
            moveTo: () => { }
        }
    }

    get id(): string { return this._id }
    get name(): string { return this._name ?? '' }
    get length(): number { return this.attached().length }
    get pane(): charting_pane { return this._pane }
    get frame(): charting_frame { return this._frame }
    get chart(): IChartApi { return this.frame._chart }

    options(): LineSeriesOptions { return this._series.options() }
    applyOptions(opts: DeepPartial<LineSeriesOptions>) { this._series.applyOptions(opts) }

    //@ts-ignore: _series.Jn.kh === seriesAPI._series._primitives[] for Lightweight-Charts v5.0.8
    get _primitiveWrapperArray(): SeriesPrimitiveWrapper[] { return this._series.Jn.kh }
    // _primitivesAPIs is the LWC array that the pane/series APIs use to actually render the primitives in order.
    //@ts-ignore: _series.Jn.kh[].ah === seriesAPI._series._primitives[].PrimitiveBase for Lightweight-Charts v5.0.8
    get _primitivesAPIs(): PrimitiveBase<primitiveOptions>[] { return Array.from(this._primitiveWrapperArray, (wrapper) => wrapper.ah) }

    // TODO: Implement
    move_to_pane(pane_index: number) { }

    delete() {
        this._primitivesAPIs.forEach(primitive => {
            this._series.detachPrimitive(primitive)
        });
        this.chart.removeSeries(this._series)
    }

    setPriceScale(scale_id: string | undefined) {
        this._series.applyOptions({ priceScaleId: scale_id })
    }

    protected addPrimitive(_type: string, _id: string, params: primitiveOptions) {
        let primitive_type = primitive_cls.get(_type)
        if (primitive_type === undefined) return
        let new_obj = new primitive_type(this._id + _id, params)

        this.attachPrimitive(new_obj)
    }

    attachPrimitive(primitive: PrimitiveBase<primitiveOptions>) {
        primitive.setParent(this)
        this._primitives.set(primitive.id, primitive)
        this._series.attachPrimitive(primitive)
        this.setAttached([...this.attached(), primitive])
    }

    detachPrimitive(primitive: PrimitiveBase<primitiveOptions>) {
        this._primitives.delete(primitive.id)
        primitive.setParent(undefined)
        this._series.detachPrimitive(primitive)
        this.setAttached(this.attached().filter((prim) => prim.id !== primitive.id))
    }

    reorderPrimitives(from: number, to: number) {
        this._primitiveWrapperArray.splice(to, 0, ...this._primitiveWrapperArray.splice(from, 1))
        //Set the Reactive Primitive array to what is stored internally to the lightweight charts series.
        this.setAttached(this._primitivesAPIs)
    }
}
