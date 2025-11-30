import { ISeriesApi, LineSeries } from "lightweight-charts"
import { Accessor, createEffect, createSignal, Setter } from "solid-js"
import { DropDownModes, ORDERABLE, ORDERABLE_SET, ReorderableSet, treeBranchInterface, treeLeafInterface } from "../../../tsx/widget_panels/object_tree"
import { charting_frame } from "../charting_frame"
import { charting_pane } from "../charting_pane"
import { PrimitiveBase, primitiveOptions } from "./primitive-base"


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

    primitives: Accessor<PrimitiveBase<primitiveOptions>[]>;
    setPrimitives: Setter<PrimitiveBase<primitiveOptions>[]>;

    leafProps: treeLeafInterface
    branchProps: treeBranchInterface

    constructor(pane: charting_pane) {
        this._pane = pane
        this._frame = pane.frame
        this._series = this._pane.paneApi.addSeries(
            LineSeries,
            {
                color: 'transparent',
                autoscaleInfoProvider: () => null
            }
        )

        this._id = ''
        this._name = undefined

        const sig = createSignal<PrimitiveBase<primitiveOptions>[]>([])
        this.primitives = sig[0]; this.setPrimitives = sig[1];

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
            reorderables: this.primitives,
            reorder: this.reorderPrimitives.bind(this),
            moveTo: () => { }
        }
    }

    get id(): string { return this._id }
    get name(): string { return this._name ?? '' }
    get length(): number { return this.primitives().length }
    get pane(): charting_pane { return this._pane }
    get frame(): charting_frame { return this._frame }

    //@ts-ignore: _series.Jn.kh === seriesAPI._series._primitives[] for Lightweight-Charts v5.0.8
    get _primitiveWrapperArray(): SeriesPrimitiveWrapper[] { return this._series.Jn.kh }
    //@ts-ignore: _series.Jn.kh[].ah === seriesAPI._series._primitives[].PrimitiveBase for Lightweight-Charts v5.0.8
    get _primitives(): PrimitiveBase[] { return Array.from(this._primitiveWrapperArray, (wrapper) => wrapper.ah) }

    attachPrimitive(primitive: PrimitiveBase<primitiveOptions>) {
        primitive.setParent(this)
        this._series.attachPrimitive(primitive)
        this.setPrimitives([...this.primitives(), primitive])
    }

    detachPrimitive(primitive: PrimitiveBase<primitiveOptions>) {
        primitive.setParent(undefined)
        this._series.detachPrimitive(primitive)
        this.setPrimitives(this.primitives().filter((prim) => prim.id !== primitive._id))
    }

    reorderPrimitives(from: number, to: number) {
        this._primitiveWrapperArray.splice(to, 0, ...this._primitiveWrapperArray.splice(from, 1))
        //Set the Reactive Primitive array to what is stored internally to the lightweight charts series.
        this.setPrimitives(this._primitives)
    }
}
