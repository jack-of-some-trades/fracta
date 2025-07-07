import { Accessor, createSignal, Setter, Signal } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { IndicatorOpts } from "../../tsx/charting_frame/indicator_options";
import { ORDERABLE, ORDERABLE_SET, ReorderableSet, treeBranchInterface, treeLeafInterface } from "../../tsx/widget_panels/object_tree";
import { OverlayCTX } from "../../tsx/window/overlay_manager";
import { charting_frame, charting_pane } from "./charting_frame";
import { PrimitiveBase } from "./primitive-plugins/primitive-base";
import { primitive_set } from "./primitive-plugins/primitive-set";
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

    _id: string
    type: string
    _name: string
    private _pane: charting_pane
    private _frame: charting_frame

    labelHtml: Accessor<string | undefined>
    setLabelHtml: Setter<string | undefined>

    outputs:{[key:string]:string}
    menu_id: string | undefined
    menu_struct: object | undefined
    setOptions: SetStoreFunction<object> | undefined

    visibilitySignal: Signal<boolean>
    menuVisibility: Accessor<boolean> | undefined
    setMenuVisibility: Setter<boolean> | undefined
    
    attached: Accessor<(s.SeriesBase_T | primitive_set)[]>
    private setAttached: Setter<(s.SeriesBase_T | primitive_set)[]>

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
        this.type = type
        this._name = display_name
        this._pane = frame.default_pane
        this._frame = frame
        this.outputs = outputs

        this.visibilitySignal = createSignal<boolean>(true)

        const orderables = createSignal<(s.SeriesBase_T | primitive_set)[]>([])
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
            this.pane._detachPrimitive(prim)
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

    applyOptions(options_in:object){
        if (this.setOptions) this.setOptions(options_in)
    }

    //TODO : Make it so that a Style Settings Menu will still be generated without needing 
    //to call the function below, or even require a menu_struct/Indicator Options Class
    protected set_menu_struct(menu_struct:object, options_in:object){
        if (this.menu_id !== undefined) {
            if (this.setOptions) this.setOptions(options_in)
            return //Menu has already been created.
        }

        const menuVisibility = createSignal<boolean>(false)
        this.menuVisibility = menuVisibility[0]
        this.setMenuVisibility = menuVisibility[1]

        const [options, setOptions] = createStore<object>(options_in)
        this.setOptions = setOptions
        this.menu_struct = menu_struct
        let menu_id = `${this._frame.id}_${this._id}_options`
        this.menu_id = menu_id

        //See EoF for Explanation of this second AttachOverlay Call.
        OverlayCTX().attachOverlay(
            this.menu_id,
            // Must be a Callable so IndicatorOpts gets generated during the AttachOverlay Call
            () => IndicatorOpts({
                id: menu_id,
                parent_ind: this,
                options: options,
                menu_struct: menu_struct,
                close_menu: () => menuVisibility[1](false),

                container_id: this._frame.id.substring(0,6),
                frame_id: this._frame.id.substring(0,13),
                indicator_id: this._id
            }),
            menuVisibility
        )
    }

    //#endregion
}