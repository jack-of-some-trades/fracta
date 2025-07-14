import { ReactiveMap } from "@solid-primitives/map"
import { Accessor, createSignal } from "solid-js"
import { icons } from "../../../tsx/generic_elements/icons"
import { KeyboardCTX } from "../../../tsx/window/keyboard_listener"
import { charting_pane, isChartingFrame } from "../charting_frame"
import { isPrimitive, PrimitiveBase } from "./primitive-base"

/**
 * @param icon: Icon Associated with the tool. Used as a Key to uniquely identify primitive tools.
 * @param title: Name of the tool to display in the ToolBar Menu
 * @param create: Function Called when the user initially presses the icon on the toolbar or in the menu.
 *      Function gets invoked on mousedown event in the charting window. Currently does not support Time/Price Axis primitives.
 *      This function should always return a primitive object unless the primitive object fails to be created.
 * @param cleanup: Function Called when the user aborts the Creation of the Primitive tool. Invoked by pressing Escape or Delete.
 *      The primitive object has it's delete method called after this function, so this function need only cleanup
 *      mouse event, or keyboard event handlers it has placed into the window
 * @param selected: Optional Signal to allow the Tool's icon to carry an on/off state.
 *      Useful for singletion tools such as the Cursors, or Magnet Mode, etc..
 */
export interface PrimitiveTool {
    icon: icons, 
    label: string,
    cleanup: () => void,
    create: ToolGeneratorFunc,
    selected?: Accessor<boolean>
}
type ToolGeneratorFunc = (pane:charting_pane, e:MouseEvent) => PrimitiveBase | Error
export const TOOL_MAP = new ReactiveMap<icons, PrimitiveTool> ([])
export function registerPrimitiveTool(tool: PrimitiveTool){ TOOL_MAP.set(tool.icon, tool) }

const KEYBOARD_HANDLER_ID = 'tool_creator'
const KB_SHORTCUTS = [{
    execute: abortToolCreation,
    hotkey: new RegExp('Escape|Delete'),
    title: 'Primitive Tool Abort Controller'
}]
let creationController = new AbortController()
const [activePrimitiveObj, setActivePrimitiveObj] = createSignal<PrimitiveBase | undefined>()
const [activePrimitiveTool, setActivePrimitiveTool] = createSignal<icons | undefined>()


function createTool(pane: charting_pane, generateTool: ToolGeneratorFunc, e: MouseEvent){
    const new_primitive = generateTool(pane, e)
    if (isPrimitive(new_primitive)){
        setActivePrimitiveObj(new_primitive)
    } else {
        //Tool Generator encountered an error and couldn't create the primitive
        finalizeToolCreation()
        console.warn(new_primitive)
    }
    creationController.abort()
    creationController = new AbortController()
}

export function abortToolCreation(){
    //Clean Up listeners used to add the tool
    creationController.abort()
    creationController = new AbortController()

    //Let the Tool clean-up anything it placed into the DOM
    let active_tool = activePrimitiveTool()
    if(active_tool) {
        TOOL_MAP.get(active_tool)?.cleanup()
        setActivePrimitiveTool(undefined)
    }

    // Delete the Primitive Tool actively being created
    let active_tool_obj = activePrimitiveObj()
    if(active_tool_obj) active_tool_obj.remove()

    finalizeToolCreation()
}

export function finalizeToolCreation(){
    setActivePrimitiveObj(undefined)
    setActivePrimitiveTool(undefined)
    KeyboardCTX().detachHandler(KEYBOARD_HANDLER_ID)
}

// TODO: Update activeContainer to be a signal so this edge case can be Managed.
// createEffect(on(window.activeContainer, abortToolCreation))
// createEffect(on(window.activeFrame()?.panes, abortToolCreation))

export function selectTool(tool:icons){
    if(!TOOL_MAP.has(tool)){
        console.warn(`No Tool Associated with icon: ${tool}`)
        return
    }

    // Kill any other tools still being created
    abortToolCreation()

    const ToolGenerator = TOOL_MAP.get(tool)?.create
    if (window.activeContainer === undefined || ToolGenerator === undefined) return

    //Tell all Charts in the visible window to listen for a click event
    window.activeContainer.frames.forEach((frame) => {
        if(!isChartingFrame(frame)) return

        frame.panes().forEach((pane) => {
            // Adding the listener to the _chartEl limits primitives from being generation on the time or price axes
            pane._chartEl?.addEventListener(
                'mousedown', (e) => createTool(pane, ToolGenerator, e), {signal:creationController.signal}
            )
            // Once at least one Listener has been added, indicate the tool is being created
            setActivePrimitiveTool(tool)
        });
    })

    // No event listeners were added, abort creation process.
    if (!activePrimitiveTool()) return 

    KeyboardCTX().attachHandler(KEYBOARD_HANDLER_ID, KB_SHORTCUTS)
}


export { activePrimitiveTool }

