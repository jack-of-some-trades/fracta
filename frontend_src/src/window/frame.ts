import { Accessor, createSignal, JSX, Setter } from "solid-js"
import { tf, ticker } from "../types"
import { updateTabFunc } from "./container"

export abstract class frame {
    type:string = 'abstract'

    _id: string
    updateTab: updateTabFunc
    element: HTMLDivElement | JSX.Element | undefined

    active: Accessor<boolean>
    setActive: Setter<boolean>
    target: Accessor<boolean>
    setTarget: Setter<boolean>

    timeframe: tf | undefined = undefined
    ticker: ticker | undefined = undefined

    constructor(id: string, updateFunc: updateTabFunc) {
        this._id = id
        this.updateTab = updateFunc

        //Used to Control Active & Target Attributes
        const [target, setTarget] = createSignal<boolean>(false)
        this.target = target; this.setTarget = setTarget
        const [active, setActive] = createSignal<boolean>(false)
        this.active = active; this.setActive = setActive
    }

    get id(): string { return this._id }

    refreshSize(){}
    onShow(){}//{console.log(`Show ${this.id}`)}
    onHide(){}//{console.log(`Hide ${this.id}`)}
    onActivation(){}//{console.log(`Activate ${this.id}`)}
    onDeactivation(){}//{console.log(`Deactivate ${this.id}`)}

    /**
     * Update Global 'active_frame' reference to this instance. 
     */
    assignActiveFrame() {
        if (window.activeFrame === this) return
        //Deactivate old Window
        if (window.activeFrame){
            window.activeFrame.setActive(false)
            window.activeFrame.onDeactivation()
        }

        //Activate new Window
        window.activeFrame = this
        this.setActive(true)
        this.onActivation()
    }
}