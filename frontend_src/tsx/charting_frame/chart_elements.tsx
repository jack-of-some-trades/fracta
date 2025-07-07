/**
 * JSX Components that are responsible for displaying, or are displayed on top of, a Charting Window.
 */
import { Accessor, createEffect, createSignal, For, Index, JSX, on, onCleanup, onMount, Setter, Show, splitProps } from "solid-js";
import { charting_frame, charting_pane } from "../../src/charting_frame/charting_frame";
import { indicator } from "../../src/charting_frame/indicator";
import { Icon, icons, TextIcon } from "../generic_elements/icons";
import { MenuContextListener } from "../window/context_menu";

/**
 * @style_sel : querySelect string used by <Layout/> to ensure style sizing is only applied
 *              to the appropriate elements. Should be unique
 * @ref       : SolidJS Setter for a Div Element. The Getter function can later be invoked to retrieve the
 *              element for width/height measurement
 * @innerStyle :Style String to be place into the window
 * @displays  : Layout_Display[] List to be used by <Layout/>
 */
interface chart_frame_props {
    frame: charting_frame,
    setRulerRef: Setter<HTMLDivElement>,
}
export function ChartFrame(props:chart_frame_props){
    const [,passDown] = splitProps(props, ['setRulerRef'])

    return <>
        {props.frame.chart_el}
        <Index each={props.frame.panes()}>{(pane) =>
            <ChartPaneOverlay
                pane = {pane()}
                {...passDown}
            />
        }</Index>
        <div ref={props.setRulerRef} class="frame_ruler"/>
    </>
}

/**
 * @index : The paneIndex to Control
 * @frame : The Charting Frame that these Elements will control
 *      The Index is passed down, not the pane since the 'childList' MutationObserver
 *      in <ChartFrame/> cannot detect when a pane is moved. => they must always be
 *      addressed by index
 */
interface chart_pane_overlay_props {
    pane: charting_pane,
    frame: charting_frame
}
export function ChartPaneOverlay(props:chart_pane_overlay_props){
    const [toolsRef, setToolsRef] = createSignal<HTMLDivElement>()
    const [leftAxis, setLeftAxis] = createSignal<HTMLTableCellElement>()
    const [rightAxis , setRightAxis] = createSignal<HTMLTableCellElement>()

    const [toolsStyle, setToolsStyle] = createSignal<JSX.CSSProperties>({})
    const [legendStyle, setLegendStyle] = createSignal<JSX.CSSProperties>({})
    const [leftScaleStyle, setLeftScaleStyle] = createSignal<JSX.CSSProperties>({})
    const [rightScaleStyle, setRightScaleStyle] = createSignal<JSX.CSSProperties>({})

    let sub_el = (sel: string) => {
        return props.pane.paneEl()?.querySelector(sel) as HTMLTableCellElement
    }

    const _reposition = () => {
        let cell_ref = sub_el("td:nth-child(2)")
        setLegendStyle({
            top:`${cell_ref.offsetTop + 8}px`,
            left:`${cell_ref.offsetLeft + 8}px`
        })
        setToolsStyle({
            top:`${cell_ref.offsetTop + 2}px`,
            left:`${cell_ref.offsetLeft + cell_ref.offsetWidth - 8 - (toolsRef()?.offsetWidth ?? 0)}px`
        })
        cell_ref = sub_el("td:nth-child(1)")
        setLeftScaleStyle({
            top:`${cell_ref.offsetTop + 12}px`,
            left:`${cell_ref.offsetLeft + (cell_ref.offsetWidth/2 - 14)}px`
        })
        cell_ref = sub_el("td:nth-child(3)")
        setRightScaleStyle({
            top:`${cell_ref.offsetTop + 12}px`,
            left:`${cell_ref.offsetLeft + (cell_ref.offsetWidth/2 - 14)}px`
        })
    }

    const watcher = new MutationObserver(_reposition)
    onCleanup(watcher.disconnect)
    createEffect(on(props.pane.paneEl, ()=>{
        watcher.disconnect()
        const el = sub_el("td:nth-child(2)")
        if (el) watcher.observe(el, {attributeFilter:['style']})

        setLeftAxis(sub_el("td:nth-child(1)"))
        setRightAxis(sub_el("td:nth-child(3)"))

        requestAnimationFrame(_reposition)
    }))
    createEffect(on(props.frame.panes, () => requestAnimationFrame(_reposition)))

    // On RightClick for this pane Show the appropriate Context Menu
    let event_cleaner = new AbortController()
    createEffect(on(props.pane.paneEl, () => {
        event_cleaner.abort()
        event_cleaner = new AbortController()
        props.pane.paneEl()?.addEventListener(
            'contextmenu', 
            MenuContextListener.bind(undefined, props.pane.context_menu_struct),
            {signal: event_cleaner.signal}
        )
    }))

    return <div class='pane_controls'>
        <ScaleToggle
            {...props}
            pricescale = {'left'}
            axis_ref = {leftAxis}
            style = {leftScaleStyle}
        />
        <PaneLegend
            {...props}
            style = {legendStyle}
        />
        <PaneTools
            {...props}
            style = {toolsStyle}
            setDivRef = {setToolsRef}
        />
        <ScaleToggle
            {...props}
            pricescale = {'right'}
            axis_ref = {rightAxis}
            style = {rightScaleStyle}
        />
    </div>
}


/**
 * Buttons that show when the user hovers over either the left or right price scale.
 * The Buttons allow the user to change between Normal, Log, %, index-to-100, and inverted scales.
 */
interface scale_props{
    pane: charting_pane,
    pricescale: string,
    style: Accessor<JSX.CSSProperties>,
    axis_ref:Accessor<HTMLTableCellElement | undefined>,
}
function ScaleToggle(props:scale_props){
    let rendered_height = 0
    let divRef = document.createElement('div')
    const _getPriceScale = () =>  props.pane._priceScale(props.pricescale)

    const [show, setShow] = createSignal(false)
    const [mode, setMode] = createSignal<number>(_getPriceScale()?.options()?.mode ?? 0)
    const [invert, setInvert] = createSignal<boolean>(_getPriceScale()?.options()?.invertScale ?? false)

    let event_cleaner = new AbortController()
    // When the paneEl changes, Clear old event listeners and add new ones
    createEffect(() => {
        const axis_ref = props.axis_ref()
        if (axis_ref === undefined) return 

        event_cleaner.abort()
        event_cleaner = new AbortController()

        axis_ref.addEventListener('mouseleave', (e:MouseEvent)=>{
            if(!divRef.contains(e.relatedTarget as HTMLElement)) setShow(false)
        },{signal:event_cleaner.signal})

        axis_ref.addEventListener(
            'mouseenter', 
            () => {
                if (axis_ref.offsetHeight >= rendered_height) setShow(true)
                // Update Options every time options are shown to re-sync them if they change
                setMode(_getPriceScale()?.options()?.mode ?? 0)
                setInvert(_getPriceScale()?.options()?.invertScale ?? false)
            },
            {signal:event_cleaner.signal}
        )
    })
    createEffect(on(show,() => { 
        // Get a Measure of the rendered height to compare against later when attempting to <Show/>
        rendered_height = Math.max(divRef.offsetHeight ?? 0, rendered_height) 
    }))
    onCleanup(event_cleaner.abort)

    //Update mode and scale inversion when they change
    createEffect(() => {_getPriceScale()?.applyOptions({mode: mode()})})
    createEffect(() => {_getPriceScale()?.applyOptions({invertScale: invert()})})
    //Set to Mode if not already, otherwise reset to normal
    const setModeEnsured = (new_mode:number) => setMode(mode() !== new_mode? new_mode : 0)

    // percent and indexd to 100 aren't as common. Commented out for now since they clutter the UI.
    return <Show when={show()}>
        <div ref={divRef} class={'scale_buttons'} style={props.style()}>
            <TextIcon 
                text={"L"}
                activated={mode() === 1}
                onClick={()=>setModeEnsured(1)}
                classList={{icon_text:false, scale_icon_text:true}}
            />
            {/* <TextIcon 
                text={"%"} 
                activated={mode() === 2}
                onClick={()=>setModeEnsured(2)}
                classList={{icon_text:false, scale_icon_text:true}}
            />
            <TextIcon 
                text={"‰"} 
                activated={mode() === 3}
                onClick={()=>setModeEnsured(3)}
                classList={{icon_text:false, scale_icon_text:true}}
            /> */}
            <TextIcon 
                text={"I"}
                activated={invert()}
                onClick={()=>setInvert(!invert())}
                classList={{icon_text:false, scale_icon_text:true}}
            />
        </div>
    </Show>
}

interface paneToolsProps{
    pane: charting_pane
    frame: charting_frame,
    style: Accessor<JSX.CSSProperties>,
    setDivRef: Setter<HTMLDivElement | undefined>
}
function PaneTools(props:paneToolsProps){
    const [moveUp, setMoveUp] = createSignal<boolean>(props.pane.paneIndex !== 0)
    const [moveDown, setMoveDown] = createSignal<boolean>(props.pane.paneIndex !== props.frame.panes().length - 1)

    //Little Dirty, but an update to the paneEl will always catch a change in the index
    createEffect(on([props.pane.paneEl, props.frame.panes], () => {
        setMoveUp(props.pane.paneIndex !== 0) 
        setMoveDown(props.pane.paneIndex !== props.frame.panes().length - 1)
    }))

    // Show Tag Hides the Element when length == 0 & updates the contents every time length changes
    return <div class="pane_tools" ref={props.setDivRef} style={props.style()}>
        <Icon 
            icon={icons.window_add}
            width={12} height={16}
            onClick={ () => props.frame.addPane() }
            classList={{icon_text:false, pane_tools_icon:true}}
        />
        <Show when={props.frame.panes().length - 1} keyed>
            <Icon 
                when={moveUp}
                icon={icons.menu_arrow_sn}
                width={12} height={16} viewBox={'-8 -4 32 16'}
                onClick={() => props.pane.movePane(props.pane.paneIndex - 1)}
                classList={{icon_text:false, pane_tools_icon:true}}
            />
            <Icon
                when={moveDown}
                icon={icons.menu_arrow_ns}
                width={12} height={16} viewBox={'-8 -4 32 16'}
                onClick={() => props.pane.movePane(props.pane.paneIndex + 1)}
                classList={{icon_text:false, pane_tools_icon:true}}
            />
            <Icon
                when={() => props.pane !== props.frame.default_pane}
                icon={icons.close}
                width={12} height={16} viewBox={'-4 -4 26 26'}
                onClick={()=>console.log('delete pane')}
                classList={{icon_text:false, pane_tools_icon:true}}
            />
            <Icon 
                icon={icons.maximize}
                width={12} height={16}
                onClick={()=>console.log('fullframe pane')}
                classList={{icon_text:false, pane_tools_icon:true}}
            />
        </Show>
    </div>
    
}

//# region ---- ---- ---- Pane Legend ---- ---- ---- //

/**
 * @indicators_list : SolidJS Reactive list of indicators.
 */
export interface legend_props {
    pane: charting_pane,
    style: Accessor<JSX.CSSProperties>
}

function PaneLegend(props:legend_props){
    let legend_ref = document.createElement('div')
    const [show, setShow] = createSignal<boolean>(props.pane.indicators()?.length !== 0)

    createEffect(on(props.style, ()=>{
        // Minimize the Indicators list if the pane is too small
        if (show() && props.pane.paneApi.getHeight() < legend_ref.offsetHeight)
            setShow(false)
    }))
    createEffect(on(props.pane.attached, () => {
        // Hide the Menu if there's no longer any indicators on it.
        if (show() && props.pane.indicators()?.length === 0) setShow(false)
    }))

    return <div class="pane_legend" ref={legend_ref} style={props.style()}>
        <Show when={show()}>
            <For each={props.pane.indicators()}>{(indObj) => {
                if (indObj === undefined) return <div class="ind_tag">Undefined Indicator</div>
                return  <IndicatorTag ind={indObj} />
            }}</For>
        </Show>
        <div class="legend_toggle_btn" onClick={(e) => {if(e.button === 0) setShow(!show())}}>
            <Icon 
                classList={{icon:false, icon_no_hover:true}} 
                icon={show()? icons.menu_arrow_sn : icons.menu_ext_small}
                force_reload={true}
            />
        </div>  
    </div>
}


const gearProps = {width: 16, height: 16}
const closeProps = {width: 16, height: 16, viewBox:"-4 -4 26 26"}
const eyeProps = {width: 20, height: 16, viewBox:"2 2 20 20"}
// const menuProps = {width: 18, height: 18, style:{padding:"0px 2px"}}

/**
 * A Label for a single Indicator.
 */
function IndicatorTag(props: { ind: indicator } ){
    const ind = props.ind
    const [hover, setHover] = createSignal<boolean>(false)

    //Following events provide expected show/hide click behavior over the overlay menu
    let div = document.createElement('div')
    const stopPropagation = (e:MouseEvent) => {e.stopPropagation()}
    onMount(()=>div.addEventListener('mousedown', stopPropagation))
    onCleanup(()=>div.removeEventListener('mousedown', stopPropagation))

    return (
        <div 
            ref={div}
            class="ind_tag"
            onmouseenter={()=>setHover(true)} 
            onmouseleave={()=>setHover(false)}
        >
            <div class="text" innerHTML={ind.name + (ind.labelHtml() !== undefined? " • " + ind.labelHtml(): "")}/>
            <Show when={hover()}>
                <Icon {...eyeProps}
                    icon={ind.visibilitySignal[0]()? icons.eye_normal : icons.eye_crossed} 
                    onClick={(e) => {if (e.button === 0) ind.setVisibility(!ind.visibilitySignal[0]())}}
                /> {/* onClk => indicator visibility toggle */}

                <Show when={ind.setMenuVisibility !== undefined}>
                    <Icon icon={icons.settings_small} {...gearProps}
                        onclick={(e) => {if (e.button === 0 && ind.setMenuVisibility && ind.menuVisibility) ind.setMenuVisibility(!ind.menuVisibility())}}
                    /> {/* onClk => Open Menu If Present */}
                </Show>

                <Show when={ind.removable}>
                    <Icon icon={icons.close} {...closeProps}/> {/* onClk => delete *Through window.api* */}
                </Show>

                {/* <Icon icon={icons.menu_ext_small} {...menuProps}/>  onClk => spawn Simple Menu? */}
            </Show>
        </div>
    ) 

}

//#endregion