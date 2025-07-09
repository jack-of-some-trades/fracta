import { Signal } from "solid-js"
import { icons } from "../../tsx/generic_elements/icons"
import { setArrow, setCrosshair, setDot } from "./primitive-plugins/cursors"
import { creatingTrendLine, trendline_user_interface } from "./primitive-plugins/trend-line/trend-line-ui"

/**
 * An 'abstract' function that ensures only one tool is active at a time, and places the neccessary
 * EventListeners into the window to begin tool creation.
 * 
 * @param creationSignal A boolean SolidJS signal. When true it signifies the tool is actively selected
 * @param controller An Abort Controller that removes all the event listeners created when the tool is first selected.
 * @param createToolFunc The function, defined on a per tool basis, that creates the tool when a chart is clicked on.
 * @returns 
 */
export function onToolSelect(
    creationSignal: Signal<boolean>, 
    controller:AbortController, 
    createToolFunc:(e:MouseEvent)=>void
){
    //Return if no active window or the tool has already been selected
    if (window.activeContainer === undefined || creationSignal[0]()) return

    for(const [, value] of TOOL_CREATION_MAP.entries()){
        //abort all other tools if any are active
        if(value !== creationSignal && value[0]()) value[1](false)
    }

    //Tell all Charts in the visible window to listen for a click event
    window.activeContainer.frames.forEach((frame) => {
        if(!frame.hasOwnProperty('panes')) return

        //@ts-ignore - already ensured panes exist on the frame
        frame.panes.forEach((charting_pane) => {
            (charting_pane as pane).chart.chartElement().addEventListener(
                //This has to be a click event because the Line attaches to the active_pane
                //which gets set on a mousedown. If this were a mousedown you'd have a race condition
                'click', createToolFunc, {signal:controller.signal}
            )
            creationSignal[1](true)
        });
    })

    // Return when there are no charting frames visible
    if (!creationSignal[0]()) return 

    //Abort Tool Creation on Escape
    document.addEventListener('keydown', (e:KeyboardEvent) => {
        if (e.key !== "Escape") return
        creationSignal[1](false)
    }, {signal:controller.signal})
}


// Icon:Function map. The Function should be more or less a bound 'onToolSelect()' instance.
export const TOOL_FUNC_MAP = new Map<icons, ()=>void> ([
    [icons.cursor_dot, setDot],
    [icons.cursor_arrow, setArrow],
    [icons.cursor_cross, setCrosshair],
    [icons.trend_line, trendline_user_interface],
])

// Icon:Signal<Boolean> Map. When the Signal is true it means that tool is actively selected.
export const TOOL_CREATION_MAP = new Map<icons, Signal<boolean>> ([
    [icons.trend_line, creatingTrendLine],
])
