import { ReactiveMap } from "@solid-primitives/map"
import { Accessor, createSignal } from "solid-js"
import { icons } from "../../../tsx/generic_elements/icons"
import { KeyboardCTX } from "../../../tsx/window/keyboard_listener"
import { MouseEventKeys } from "../../types"
import { isChartingFrame } from "../charting_frame"
import { charting_pane } from "../charting_pane"
import { isPrimitive, PrimitiveBase, primitiveOptions } from "./primitive-base"


export function selectTool(tool_key: icons) {
    const p_tool = PRIMITIVE_TOOL_MAP.get(tool_key)
    if (p_tool) {
        selectPrimitiveTool(p_tool)
        return
    }
    const s_tool = SIMPLE_TOOL_MAP.get(tool_key)
    if (s_tool) {
        s_tool.execute()
        return
    }

    console.warn(`No Tool Associated with icon: ${tool_key}`)
}

export const TOOL_MAP = new ReactiveMap<icons, PrimitiveTool | SimpleTool>([])

//# region ---- ---- ---- Simple Tools ---- ---- ---- 

const SIMPLE_TOOL_MAP = new Map<icons, SimpleTool>([])
export function registerSimpleTool(tool: SimpleTool) {
    SIMPLE_TOOL_MAP.set(tool.icon, tool)
    TOOL_MAP.set(tool.icon, tool)
}
type SimpleToolFunc = () => void

/**
 * Interface for a Tool that gets invoked immediately once clicked
 * @param icon: Icon Associated with the tool. Used as a Key to uniquely identify primitive tools.
 * @param title: Name of the tool to display in the ToolBar Menu
 * @param execute: The function to execute when the tool is selected.
 * @param selected: Optional Signal to allow the Tool's icon to carry an on/off state.
 *      Useful for singletion tools such as the Cursors, or Magnet Mode, etc..
 */
export interface SimpleTool {
    icon: icons,
    label: string,
    execute: SimpleToolFunc,
    selected?: Accessor<boolean>
}

// #endregion


// #region ---- ---- Primitive Charting Tools ---- ----

/**
 * @param icon: Icon Associated with the tool. Used as a Key to uniquely identify primitive tools.
 * @param title: Name of the tool to display in the ToolBar Menu
 * @param create: Function that gets invoked on an event in the charting window. Currently does not support Time/Price Axis primitives.
 *      When this function returns Null, Tool creation is considered to be complete, or failed and already cleaned up
 *      When this function returns a Primitive it is stored in the event tool creation is aborted at a later point.
 * @param event_type the type of mouse event to be added to each ChartingFrame Element that is used to invoke the create() function.
 *      If left undefined, a 'mousedown' event is used.
 * @param cleanup: Function Called when the user aborts the Creation of the Primitive tool. Invoked by pressing Escape or Delete.
 *      The primitive object's delete method called after this function, so this function only needs to cleanup
 *      mouse events and keyboard event handlers it has placed into the window
 * 
 */
export interface PrimitiveTool {
    icon: icons,
    label: string,
    create: ToolGeneratorFunc,
    eventType?: MouseEventKeys,
    cleanup: () => void,
}

type ToolGeneratorFunc = (pane: charting_pane, e: MouseEvent) => PrimitiveBase<primitiveOptions> | null

const PRIMITIVE_TOOL_MAP = new Map<icons, PrimitiveTool>([])
export function registerPrimitiveTool(tool: PrimitiveTool) {
    PRIMITIVE_TOOL_MAP.set(tool.icon, tool)
    TOOL_MAP.set(tool.icon, tool)
}

const KEYBOARD_HANDLER_ID = 'tool_creator'
const KB_SHORTCUTS = [{
    execute: abortToolCreation,
    hotkey: new RegExp('Escape|Delete'),
    title: 'Primitive Tool Abort Controller'
}]
let creationController = new AbortController()
const [activePrimitiveObj, setActivePrimitiveObj] = createSignal<PrimitiveBase<primitiveOptions> | undefined>()
const [activePrimitiveTool, setActivePrimitiveTool] = createSignal<PrimitiveTool | undefined>()


function createPrimitiveTool(pane: charting_pane, generateTool: ToolGeneratorFunc, e: MouseEvent) {
    const new_primitive = generateTool(pane, e)
    if (isPrimitive(new_primitive)) {
        setActivePrimitiveObj(new_primitive)
    } else {
        //Tool Generator encountered either could create, or is already done, creating the primitive
        finalizeToolCreation()
    }
    creationController.abort()
    creationController = new AbortController()
}

export function abortToolCreation() {
    //Clean Up listeners used to add the tool
    creationController.abort()
    creationController = new AbortController()

    //Let the Tool clean-up anything it placed into the DOM
    let active_tool = activePrimitiveTool()
    if (active_tool) {
        active_tool.cleanup()
        setActivePrimitiveTool(undefined)
    }

    // Delete the Primitive Tool actively being created
    let active_tool_obj = activePrimitiveObj()
    if (active_tool_obj) active_tool_obj.remove()

    finalizeToolCreation()
}

export function finalizeToolCreation() {
    setActivePrimitiveObj(undefined)
    setActivePrimitiveTool(undefined)
    KeyboardCTX().detachHandler(KEYBOARD_HANDLER_ID)
}

// TODO: Update activeContainer to be a signal so this edge case can be Managed properly.
// Currently it is being invoked in container.ts / container.onHide()
// createEffect(on(window.activeContainer, abortToolCreation))

function selectPrimitiveTool(tool: PrimitiveTool) {
    // Kill any other tools still being created
    abortToolCreation()

    const ToolGenerator = tool.create
    const EventType = tool.eventType ?? 'mousedown'
    if (window.activeContainer === undefined || ToolGenerator === undefined) return

    //Tell all Charts in the visible window to listen for a click event
    window.activeContainer.frames.forEach((frame) => {
        if (!isChartingFrame(frame)) return

        frame.panes().forEach((pane) => {
            // Adding the listener to the _chartEl limits primitives from being generated on the time or price axes
            pane._chartEl?.addEventListener(
                EventType, (e) => createPrimitiveTool(pane, ToolGenerator, e), { signal: creationController.signal }
            )
            // Once at least one Listener has been added, indicate the tool is being created
            setActivePrimitiveTool(tool)
        });
    })

    // No event listeners were added, abort creation process.
    if (!activePrimitiveTool()) return

    KeyboardCTX().attachHandler(KEYBOARD_HANDLER_ID, KB_SHORTCUTS)
}

//#endregion

export { activePrimitiveTool }

