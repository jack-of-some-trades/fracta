/**
 * Wrapper is the Topmost layer of the Component Tree. Upon running index.ts this is invoked
 * and construction of the entire SolidJS Component tree is initiated.
 */

import { Accessor, JSX, Setter, createContext, createEffect, createSignal, on, onMount, useContext } from 'solid-js'
import { SetStoreFunction, createStore } from 'solid-js/store'
import { ColorContext } from '../generic_elements/color_picker'
import { ObjTreeContext } from '../widget_panels/object_tree'
import { Container } from './container'
import { ContextMenuOverlayProvider } from './context_menu'
import { KeyboardListener } from './keyboard_listener'
import { OverlayContextProvider } from './overlay_manager'
import { TitleBar } from './titlebar'
import { ToolBar, ToolBoxContext } from './toolbar/toolbar'
import { TopBar } from './topbar/topbar'
import { WidgetBar, WidgetPanel } from './widgetbar'

const MARGIN = 5
const TOP_HEIGHT = 38
const TITLE_HEIGHT = 38
const CENTER_PADDING = 2

export const WIDGET_BAR_WIDTH = 52
export const WIDGET_PANEL_MARGIN = 2

const MIN_WIDGET_PANEL_WIDTH = 156
const MAX_WIDGET_PANEL_WIDTH = 468
const DEFAULT_WIDGET_PANEL_WIDTH = 208

const TOOLBAR_WIDTH = 46
const UTILBAR_WIDTH = 38

/**
 * An Interface defining how to layout the screen. Each object is a component of the screen. 
 * Each object's value is an HTMLDiv's Styling Object that's applied to their respective Div.
 */
interface layout_struct {
    center:{width:string, height:string, top:string, left:string},
    titlebar:{width:string, height:string, top:string, left:string},
    topbar:{display:string, width:string, height:string, top:string, left:string},
    toolbar:{display:string, width:string, height:string, top:string, left:string},
    widgetbar:{display:string, width:string, height:string, top:string, right:string},
    widgetpanel:{display:string, width:string, height:string, top:string, right:string},
    utilbar:{display:string, width:string, height:string, bottom:string, left:string},
}

//Any value of -1px is dynamically set upon resize event
const layout_default:layout_struct = {
    center:{width:'-1px', height:'-1px', top:`${TITLE_HEIGHT + TOP_HEIGHT + MARGIN + CENTER_PADDING}px`, left:`${TOOLBAR_WIDTH + MARGIN + CENTER_PADDING}px`},
    titlebar:{width:'100vw', height:'38px', top:'0px', left:'0px'},
    topbar:{display:'flex', width:'100vw', height:'38px', top:`${TITLE_HEIGHT}px`, left:'0px'},
    toolbar:{display:'flex', width:`${TOOLBAR_WIDTH}px`, height:'-1px', top:`${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`, left:'0px'},
    widgetbar:{display:'flex', width:`${WIDGET_BAR_WIDTH}px`, height:'-1px', top:`${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`, right:'0px'},
    widgetpanel:{display:'none', width:'-1px', height:'-1px', top:`${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`, right:`${WIDGET_BAR_WIDTH + WIDGET_PANEL_MARGIN}px`},
    utilbar:{display:'flex', width:'-1px', height:`${UTILBAR_WIDTH}px`, bottom:'0px', left:`${TOOLBAR_WIDTH + MARGIN}px`},
}

export enum LAYOUT_SECTIONS {
    TITLE_BAR = 0,
    TOP_BAR = 1,
    TOOL_BAR = 2,
    WIDGET_BAR = 3,
    WIDGET_PANEL = 4,
    UTIL_BAR = 5,
    CENTER = 6
}

/**
 * Top Level Component for the Entire Window.
 */
export function Wrapper(){
    const [layout, set_layout] = createStore(layout_default)
    const widgetPanelWidth = WidgetPanelSizeCTX().size

    onMount(() => { 
        //Add Resize listener
        window.addEventListener('resize', () => resize(window.innerWidth, window.innerHeight, layout, set_layout))
        resize(window.innerWidth, window.innerHeight, layout, set_layout) //Set initial size
    });

    //Resize when visibility changes & when Widget_Panel changes size
    createEffect(() => {resize(window.innerWidth, window.innerHeight, layout, set_layout)})
    createEffect(on(widgetPanelWidth, () => {resize(window.innerWidth, window.innerHeight, layout, set_layout)}))

    //Functions to be passed to the Titlebar
    const title_bar_props = {
        show_section:show_section_unbound.bind(undefined, set_layout),
        hide_section:hide_section_unbound.bind(undefined, set_layout),
    }

    //Functions to be passed to the WidgetBar
    const widget_bar_props = {
        panelDisplay: layout.widgetbar,
        showWidgetPanel:show_section_unbound.bind(undefined, set_layout, LAYOUT_SECTIONS.WIDGET_PANEL),
        hideWidgetPanel:hide_section_unbound.bind(undefined, set_layout, LAYOUT_SECTIONS.WIDGET_PANEL),
    }


    //Important Note: You cannot use <Show/> to control visibility here. <Show/> completely recreates
    //The element in question which removes the state information held by sub elements. To use <Show/>
    //you'd have to create a context for each of those states and that's just not worth it right now. 
    return <>
        <GlobalContexts>
            <div id='layout_wrapper' class='wrapper'>
                <Container style={layout.center}/>
                <TitleBar style={layout.titlebar} {...title_bar_props}/>
                <TopBar style={layout.topbar}/>
                <ToolBar style={layout.toolbar}/>
                <WidgetBar style={layout.widgetbar} {...widget_bar_props}/>
                <WidgetPanel style={layout.widgetpanel}/>
                <div class='layout_main' style={layout.utilbar}/>
            </div>
        </GlobalContexts>
    </>
}

/**
 * Dump Location for any Contexts that are created else where and need to be placed into the window.
 */
function GlobalContexts(props:JSX.HTMLAttributes<HTMLElement>){
    return <>
        <ColorContext>
        <ToolBoxContext>
        <ObjTreeContext>
        <KeyboardListener>
        <PanelResizeContext widget={true}>
        <OverlayContextProvider>
        <ContextMenuOverlayProvider/>
            {props.children}
        </OverlayContextProvider>
        </PanelResizeContext>
        </KeyboardListener>
        </ObjTreeContext>
        </ToolBoxContext>
        </ColorContext>
    </>
}


//#region -------------- Interactive Layout Functions -------------- //

function resize(width:number, height:number, layout:layout_struct, set_layout:SetStoreFunction<layout_struct>){
    const widgetPanelWidth = WidgetPanelSizeCTX().size()
    let side_bar_height = height - TITLE_HEIGHT
    let center_height = height - TITLE_HEIGHT
    let center_width = width

    if (layout.topbar.display === 'flex'){
        side_bar_height -= (TOP_HEIGHT + MARGIN)
        center_height -= (TOP_HEIGHT + MARGIN)
    }
    if (layout.toolbar.display === 'flex')
        center_width -= (TOOLBAR_WIDTH + MARGIN)
    if (layout.widgetbar.display === 'flex')
        center_width -= (WIDGET_BAR_WIDTH + MARGIN)
    if (layout.widgetpanel.display === 'flex')
        center_width -= (widgetPanelWidth) + WIDGET_PANEL_MARGIN
    if (layout.utilbar.display === 'flex')
        center_height -= (UTILBAR_WIDTH + MARGIN)

    //Top Bar automatically resizes, no adjustment needed
    set_layout('toolbar', 'height', `${side_bar_height}px`)
    set_layout('widgetbar', 'height', `${side_bar_height}px`)
    set_layout('widgetpanel', 'height', `${side_bar_height}px`)
    set_layout('widgetpanel', 'width', `${widgetPanelWidth}px`)
    set_layout('center', 'height', `${center_height - 2 * CENTER_PADDING}px`)
    set_layout('center', 'width', `${center_width - 2 * CENTER_PADDING}px`)
    set_layout('utilbar', 'width', `${center_width}px`)

    // Perform initial resize to desired size. If the Desired rect were not passed,
    // each panel would query it's div for the size and it would be the old panel size.
    if (window.active_container) window.active_container.resize(new DOMRect(0, 0, center_width, center_height))
        
    let func = WidgetPanelSizeCTX().resizeFunc()
    if (func !== undefined) func(new DOMRect(0, 0, widgetPanelWidth, center_height))

    //** TODO: uncomment when util Panel is implemented **/
    // func = UtilPanelSizeCTX().resizeFunc()
    // if (func !== undefined) func(new DOMRect(0, 0, center_width, utilPanelHeight))

    // After window settles, allow the window to resize itself to it's measured DOM size so it's 100% accurate
    if (window.active_container) setTimeout(() => window.active_container.resize(), 0)
}

function show_section_unbound(set_layout:SetStoreFunction<layout_struct>, section: LAYOUT_SECTIONS) {
    switch (section) {
        case (LAYOUT_SECTIONS.TOOL_BAR):
            set_layout('center', 'left', `${TOOLBAR_WIDTH + MARGIN + CENTER_PADDING}px`)
            set_layout('utilbar', 'left', `${TOOLBAR_WIDTH + MARGIN}px`)
            set_layout('toolbar', 'display', 'flex')
            break;
        case (LAYOUT_SECTIONS.WIDGET_BAR):
            set_layout('widgetbar', 'display', 'flex')
            break;
        case (LAYOUT_SECTIONS.WIDGET_PANEL):
            set_layout('widgetpanel', 'display', 'flex')
            break;
        case (LAYOUT_SECTIONS.TOP_BAR):
            set_layout('toolbar', 'top', `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`)
            set_layout('widgetbar', 'top', `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN}px`)
            set_layout('center', 'top', `${TITLE_HEIGHT + TOP_HEIGHT + MARGIN + CENTER_PADDING}px`)
            set_layout('topbar', 'display', 'flex')
            break;
        case (LAYOUT_SECTIONS.UTIL_BAR):
            set_layout('utilbar', 'display', 'flex')
    }

    if (window.active_container) window.active_container.resize()
}

function hide_section_unbound(set_layout:SetStoreFunction<layout_struct>, section: LAYOUT_SECTIONS) {
    switch (section) {
        case (LAYOUT_SECTIONS.TOOL_BAR):
            set_layout('center', 'left', `${CENTER_PADDING}px`)
            set_layout('utilbar', 'left', `0px`)
            set_layout('toolbar', 'display', 'none')
            break;
        case (LAYOUT_SECTIONS.WIDGET_BAR):
            set_layout('widgetbar', 'display', 'none')
            set_layout('widgetpanel', 'display', 'none')
            break;
        case (LAYOUT_SECTIONS.WIDGET_PANEL):
            set_layout('widgetpanel', 'display', 'none')
            break;
        case (LAYOUT_SECTIONS.TOP_BAR):
            set_layout('toolbar', 'top', `${TITLE_HEIGHT}px`)
            set_layout('widgetbar', 'top', `${TITLE_HEIGHT}px`)
            set_layout('center', 'top', `${TITLE_HEIGHT + CENTER_PADDING}px`)
            set_layout('topbar', 'display', 'none')
            break;
        case (LAYOUT_SECTIONS.UTIL_BAR):
            set_layout('utilbar', 'display', 'none')
    }

    if (window.active_container) window.active_container.resize()
}

//#endregion

//#region -------------- Panel Resize Context -------------- //

//Resize Context for Widget & Util Panels
interface resize_context_props { 
    size: Accessor<number>,
    setSize: (width:number) => void,
    setMinSize: Setter<number>,
    setMaxSize: Setter<number>,
    resizeFunc: Accessor<(rect:DOMRect)=>void>,
    setResizeFunc: Setter<(rect:DOMRect)=>void>,
}

const default_resize_props:resize_context_props = {
    size: ()=>0,
    setSize: ()=>{},
    setMinSize: ()=>{},
    setMaxSize: ()=>{},
    resizeFunc:  ()=>()=>{},
    setResizeFunc: ()=>{},
}

let widgetResizeContext = createContext<resize_context_props>( default_resize_props )
export function WidgetPanelSizeCTX():resize_context_props { return useContext(widgetResizeContext) }

let utilResizeContext = createContext<resize_context_props>( default_resize_props )
export function UtilPanelSizeCTX():resize_context_props { return useContext(utilResizeContext) }

function PanelResizeContext(props:JSX.HTMLAttributes<HTMLElement> & {widget:boolean}){
    const PanelFunc = createSignal((rect:DOMRect)=>{})
    const PanelSize = createSignal<number>(DEFAULT_WIDGET_PANEL_WIDTH)
    const MinPanelSize = createSignal<number>(MIN_WIDGET_PANEL_WIDTH)
    const MaxPanelSize = createSignal<number>(MAX_WIDGET_PANEL_WIDTH)
    
    const ResizeCTX:resize_context_props = {
        size: PanelSize[0],
        //Bound the size of the widget panel
        setSize: (v:number)=>{PanelSize[1](Math.max(Math.min(v, MaxPanelSize[0]()), MinPanelSize[0]()))},
        setMinSize: MinPanelSize[1],
        setMaxSize: MaxPanelSize[1],
        resizeFunc:  PanelFunc[0],
        setResizeFunc: PanelFunc[1],
    }

    if (props.widget) {
        widgetResizeContext = createContext<resize_context_props>(ResizeCTX)
        return <widgetResizeContext.Provider value={ResizeCTX}>
            {props.children}
        </widgetResizeContext.Provider>
    } else {
        utilResizeContext = createContext<resize_context_props>(ResizeCTX)
        return <utilResizeContext.Provider value={ResizeCTX}>
            {props.children}
        </utilResizeContext.Provider>
    }
}

//#endregion