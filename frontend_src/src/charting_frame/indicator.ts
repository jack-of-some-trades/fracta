import { Accessor, createSignal, Setter, Signal } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { MultipleSeriesStyleEditor } from "../../tsx/charting_frame/series_style_editor";
import { generateOptionsMenu } from "../../tsx/generic_elements/options_menu";
import { ORDERABLE, ORDERABLE_SET, ReorderableSet, treeBranchInterface, treeLeafInterface } from "../../tsx/widget_panels/object_tree";
import { charting_frame } from "./charting_frame";
import { charting_pane } from "./charting_pane";
import { PrimitiveBase } from "./primitive-plugins/primitive-base";
import { PrimitiveSet } from "./primitive-plugins/primitive-set";
import { primitives } from "./primitive-plugins/primitives";
import * as s from "./series-plugins/series-base";

const MAIN_TIMESERIES_ID = "i_XyzZy"
const INDICATOR = Symbol('Indicator');
export function isIndicator(obj: unknown): obj is indicator {
    return ( obj !== null && typeof obj === 'object' && INDICATOR in obj )
}

export class indicator implements ReorderableSet {
    [INDICATOR]: true = true;
    [ORDERABLE]: true = true;
    [ORDERABLE_SET]: true = true;

    private _id: string
    private _type: string
    private _name: string
    private _pane: charting_pane
    private _frame: charting_frame

    visibilitySignal: Signal<boolean>
    labelHtml: Accessor<string | undefined>
    setLabelHtml: Setter<string | undefined>

    outputs:{[key:string]:string}
    menuId: string | undefined
    menuStruct: object | undefined

    options: object
    setOptions: SetStoreFunction<object>

    attached: Accessor<(s.SeriesBase_T | PrimitiveSet)[]>
    private setAttached: Setter<(s.SeriesBase_T | PrimitiveSet)[]>

    series = new Map<string, s.SeriesBase_T>()
    private primitives = new Map<string, PrimitiveBase>()
    private visibilityMemory = new Map<string, boolean>()

    leafProps: treeLeafInterface
    branchProps: treeBranchInterface

    constructor(
        id: string, 
        type: string, 
        display_name: string,
        outputs: {[key:string]:string}, 
        frame: charting_frame
    ){
        this._id = id
        this._type = type
        this._name = display_name
        this._pane = frame.default_pane
        this._frame = frame
        this.outputs = outputs

        this.visibilitySignal = createSignal<boolean>(true)
        const options_store = createStore<object>({})
        this.options = options_store[0]; this.setOptions = options_store[1]

        const orderables = createSignal<(s.SeriesBase_T | PrimitiveSet)[]>([])
        this.attached = orderables[0]; this.setAttached = orderables[1]
        
        const labelHtml = createSignal<string | undefined>(undefined)
        this.labelHtml = labelHtml[0]; this.setLabelHtml = labelHtml[1]

        this.pane.attach(this)

        this.leafProps = {
            id:this.id,
            leafTitle:this.name,
            obj: this
        }
        this.branchProps = {
            id:this.id,
            branchTitle: this.name,
            dropDownMode: 'toggleable',
            reorderables: this.attached,
            reorder: this.reorder.bind(this),
            moveTo: ()=>{}
        }
    }

    setLabel(label:string){this.setLabelHtml(label !== ""? label : undefined)}

    // TODO: Implement
    move_to_pane(pane_index:number){}

    delete() {
        //Clear All Sub-objects
        this.series.forEach((ser, key) => {
            ser.remove()
        })
        this.primitives.forEach((prim, key) => {
            this.pane.paneApi.detachPrimitive(prim)
        })
        this.pane.detach(this)// ???
    }

    setVisibility(arg:boolean){
        this.visibilitySignal[1](arg)
        const _maps = [this.series, this.primitives]
        // This only works because the structure of primitives and series are similar enough
        for (let i = 0; i < _maps.length; i++)

            if (arg) for (const [k, v] of _maps[i].entries()){
                v.applyOptions({visible: this.visibilityMemory.get(k)??true})
            }

            else for (const [k, v] of _maps[i].entries()){
                this.visibilityMemory.set(k, v.options().visible)
                v.applyOptions({visible: false})
            }
    }

    reorder(from:number, to:number){
        console.log(`Reorder Series from: ${from}, to: ${to}`)
    }

    get id(): string { return this._id }
    get index(): number { return 0 }
    get length(): number { return 0 }
    get type(): string { return this._type }
    get pane(): charting_pane { return this._pane }
    get frame(): charting_frame { return this._frame }
    get name(): string { return this._name ? this._name : this.type }
    get removable(): boolean { return this._id !== MAIN_TIMESERIES_ID }

    //#region ------------------------ Python Interface ------------------------ //

    //Functions marked as protected are done so it indicate the original intent
    //only encompassed being called from python, not from within JS.

    protected add_series(_id: string, _type: s.Series_Type, _name:string|undefined = undefined) {
        const _ser = new s.SeriesBase(_id, _name, _type, this)
        this.series.set(_id, _ser)
        this.setAttached([...this.attached(), _ser])
    }

    protected remove_series(_id: string) {
        let series = this.series.get(_id)
        if (series === undefined) return

        series.remove()
        this.series.delete(_id)
        this.setAttached(this.attached().filter((_ser) => _ser !== series))
    }

    protected add_primitive(_id: string, _type: string, params:object) {
        let primitive_type = primitives.get(_type)
        if (primitive_type === undefined) return
        let new_obj = new primitive_type(this._id + _id, params)

        this.primitives.set(_id, new_obj)
        this._frame.whitespace_series.attachPrimitive(new_obj)
    }

    protected remove_primitive(_id: string) {
        let _obj = this.primitives.get(_id)
        if (_obj === undefined) return

        this._frame.whitespace_series.detachPrimitive(_obj) 
        this.primitives.delete(_id)
    }
    
    protected update_primitive(_id: string, params:object) {
        this.primitives.get(_id)?.updateData(params)
    }

    applyOptions(options:{[key: string]: any}, externalCall = false){
        this.setOptions(options)

        if (!externalCall) // If the apply options generated from a UI action
            window.api.set_indicator_options( 
                this._frame.id.substring(0,6),  // Container ID
                this._frame.id.substring(0,13), // Frame ID
                this.id, 
                options
            )
    }

    protected set_menu_struct(menu_struct:object, options:object){
        this.menuStruct = menu_struct
        this.setOptions(options)
    }

    //#endregion

    displayOptionsMenu(){
        generateOptionsMenu({
            id: `${this._frame.id}_${this._id}_options`,
            title: this.type + " • " + this.name + (this.name !== '' ? " • " : '' )  + "Options",
            tabs: {
                'Inputs': [this.menuStruct, this.options, this.applyOptions.bind(this)],
                'Style': () => MultipleSeriesStyleEditor({series:this.series}),
            },
            pane: this._pane
        })
    }
}