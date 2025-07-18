/**
 * ToolBar Component (and sub-components) that are displayed along the Left hand side of the screen.
 */
import { Accessor, createContext, createEffect, createSignal, For, JSX, on, Setter, useContext } from "solid-js"
import { activePrimitiveTool, selectTool, TOOL_MAP } from "../../../src/charting_frame/primitive-plugins/tool_ui_support"
import { Icon, icons } from "../../generic_elements/icons"
import { location_reference, OverlayCTX, OverlayDiv, point } from "../overlay_manager"
import { toolbar_menu_props, ToolBarMenuButton } from "./toolbar_menu"

export function ToolBar(props:JSX.HTMLAttributes<HTMLDivElement>){
    return <div class='layout_main layout_flex flex_col' {...props}>
        {/**** Top Aligned ****/}
        <div class='toolbar'>
            <ToolBarMenuButton {...crosshair_menu_props}/>
            <ToolBarMenuButton {...trend_menu_props}/>
            <ToolBarMenuButton {...fib_menu_props}/>
            <ToolBarMenuButton {...measure_menu_props}/>
            <div class='toolbar_separator'/>
        </div>

        {/**** Bottom Aligned ****/}
        <div class='toolbar'>
            <div class='toolbar_separator'/>
            <ToolBoxToggle/>
        </div>
    </div>
}

/**
 * Toggle Star at the Bottom of the Tool*Bar* and shows/hides the Tool*Box*. 
 * The ToolBox is the floating menu that shows the user-favorite tools
 */
function ToolBoxToggle(){
    const id = "toolbox"
    const visibilitySignal = createSignal<boolean>(false)
    const visibility = visibilitySignal[0]
    const setVisibility = visibilitySignal[1]

    const location = ToolBoxCTX().location
    const setLocation = ToolBoxCTX().setLocation

    OverlayCTX().attachOverlay(
        id,
        <ToolBoxOverlay id={id} />,
        visibilitySignal,
        null, // Don't Auto Hide & don't hide on esc click
    )

    createEffect(on(visibility, () => {
        //Reposition Element the first time it gets shown
        if (visibility() && location().x === -1 && location().y === -1){
            let refLoc = document.querySelector(".toolbox_btn_wrap")?.getBoundingClientRect()
            if (refLoc === undefined) return
            setLocation({x:refLoc.right + 20,y:refLoc.top + 2})
        }
    }))

    return <div class="toolbox_btn_wrap" onMouseDown={()=>setVisibility(!visibility())} >    
        <Icon 
            icon={visibility()? icons.star_filled: icons.star}
            selected={visibility()}
            width={26}
            height={26}
            classList={{toolbox_btn:true}}
        />
    </div>
}

//#region --------------------- Toolbox Context and OverlayDiv --------------------- //

interface toolbox_context_props {
    tools:Accessor<icons[]>,
    setTools:Setter<icons[]>
    location:Accessor<point>,
    setLocation:Setter<point>
}

const default_toolbox_props:toolbox_context_props = {
    tools: () => [],
    setTools: () => {},
    location: () => {return {x:0, y:0}},
    setLocation: () => {},
}

let ToolboxContext = createContext<toolbox_context_props>(default_toolbox_props)
export function ToolBoxCTX():toolbox_context_props { return useContext(ToolboxContext) }

/**
 * Context that holds information on the ToolBox overlay menu Location and selected tools
 */
export function ToolBoxContext(props:JSX.HTMLAttributes<HTMLElement>){
    const [tools, setTools] = createSignal<icons[]>([])
    const [location, setLocation] = createSignal<point>({x:-1, y:-1})

    const ToolboxCTX:toolbox_context_props = {
        tools:tools,
        setTools:setTools,
        location:location,
        setLocation:setLocation,
    }

    ToolboxContext = createContext<toolbox_context_props>(ToolboxCTX)
    return <ToolboxContext.Provider value={ToolboxCTX}>
        {props.children}
    </ToolboxContext.Provider>
}

interface toolbox_props extends JSX.HTMLAttributes<HTMLDivElement> {id:string}
function ToolBoxOverlay( props:toolbox_props ){
    const tools = ToolBoxCTX().tools
    const location = ToolBoxCTX().location
    const setLocation = ToolBoxCTX().setLocation
    
    return (
        <OverlayDiv 
            id={props.id}
            location={location}
            setLocation={setLocation}
            location_ref={location_reference.TOP_LEFT}
            drag_handle={`#${props.id}>#menu_dragable`}
            bounding_client_id={`#${props.id}>#menu_dragable`}
        >
            <Icon hover={false} icon={icons.menu_dragable}/>
            <For each={tools()}>{(tool)=>
                <Icon 
                    icon={tool} 
                    onClick={() => selectTool(tool)}
                    active={activePrimitiveTool()?.icon === tool}
                    // @ts-ignore - A Stupid Error, Just plain stupid.
                    selected={TOOL_MAP.get(tool)?.selected?.()}
                />
            }</For>
        </OverlayDiv>
    )
}

//#endregion


//#region --------------------- Toolbar Section Props --------------------- //

/**
 * Constant Prop Objects. These are Props for the ToolBox Overlay Menus and define
 * what tools exist in each menu.
 */

const crosshair_menu_props:toolbar_menu_props = {
    id:"crosshair_menu",
    default_icon: icons.cursor_cross,
    tools:[
        [icons.cursor_cross, icons.cursor_dot, icons.cursor_arrow],
    ]
}


const trend_menu_props:toolbar_menu_props = {
    id:"trend_menu",
    default_icon: icons.trend_line,
    tools:[
        [icons.trend_line, icons.horiz_line, icons.vert_line, icons.horiz_ray],
        [icons.polyline],
        [icons.channel_parallel, icons.channel_disjoint],
    ]
}


const fib_menu_props:toolbar_menu_props = {
    id:"fibonacci_menu",
    default_icon: icons.fib_retrace,
    tools:[
        [icons.fib_retrace, icons.fib_extend],
    ]
}


const measure_menu_props:toolbar_menu_props = {
    id:"measure_menu",
    default_icon: icons.range_price,
    tools:[
        [icons.range_price, icons.range_date, icons.range_price_date],
    ]
}

//#endregion