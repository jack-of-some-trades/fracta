import { Accessor, createSignal, JSX, Setter } from "solid-js"
import { tf, ticker } from "../types"
import { update_tab_func } from "./container"

export abstract class frame {
    type:string = 'abstract'

    _id: string
    update_tab: update_tab_func
    element: HTMLDivElement | JSX.Element | undefined

    active: Accessor<boolean>
    setActive: Setter<boolean>
    target: Accessor<boolean>
    setTarget: Setter<boolean>

    timeframe: tf | undefined = undefined
    ticker: ticker | undefined = undefined

    constructor(id: string, tab_update_func: update_tab_func) {
        this._id = id
        this.update_tab = tab_update_func

        //Used to Control Active & Target Attributes
        const [target, setTarget] = createSignal<boolean>(false)
        this.target = target; this.setTarget = setTarget
        const [active, setActive] = createSignal<boolean>(false)
        this.active = active; this.setActive = setActive
    }

    get id(): string { return this._id }

    resize(){}
    onShow(){}//{console.log(`Show ${this.id}`)}
    onHide(){}//{console.log(`Hide ${this.id}`)}
    onActivation(){}//{console.log(`Activate ${this.id}`)}
    onDeactivation(){}//{console.log(`Deactivate ${this.id}`)}

    /**
     * Update Global 'active_frame' reference to this instance. 
     */
    assign_active_frame() {
        if (window.active_frame === this) return
        //Deactivate old Window
        if (window.active_frame){
            window.active_frame.setActive(false)
            window.active_frame.onDeactivation()
        }

        //Activate new Window
        window.active_frame = this
        this.setActive(true)
        this.onActivation()
    }
}