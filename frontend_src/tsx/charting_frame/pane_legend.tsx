/**
 * Component To be displayed over a Charting Pane that show the applied indicators and gives
 * access to visibility and input settings.
 */
import { Accessor, createSignal, For, JSX, onCleanup, onMount, Setter, Show } from "solid-js"
import { indicator } from "../../src/charting_frame/indicator"
import { Icon, icons } from "../generic_elements/icons"

/**
 * @indicators_list : SolidJS Reactive list of indicators.
 */
export interface legend_props {indicators_list:Accessor<indicator[]>}

export function PaneLegend(props:legend_props){
    const [display, setDisplay] = createSignal<boolean>(true)
    const [wrapperStyle, setWrapperStyle] = createSignal<JSX.CSSProperties>({})

    return <div class="pane_legend" style={wrapperStyle()}>
        <Show when={display()}>
            <For each={props.indicators_list()}>{(indObj) => {
                if (indObj === undefined) return <div class="ind_tag">Undefined Indicator</div>
            
                return (
                    <IndicatorTag
                        name={indObj.name !== ""? indObj.name : indObj.type } 
                        deletable={indObj.removable}
                        innerHtml={indObj.labelHtml}
                        objVisibility={indObj.visibilitySignal[0]}
                        setObjVisibility={indObj.setVisibility.bind(indObj)}
                        setMenuVisibility={indObj.setMenuVisibility}
                        menuVisibility={indObj.menuVisibility}
                    />
                )
            }}</For>
        </Show>
        <div class="legend_toggle_btn" onClick={(e) => {if(e.button === 0) setDisplay(!display())}}>
            <Icon 
                classList={{icon:false, icon_no_hover:true}} 
                icon={display()? icons.menu_arrow_sn : icons.menu_arrow_ns} 
                force_reload={true}
            />
        </div>  
    </div>
}


const gearProps = {width: 16, height: 16}
const closeProps = {width: 16, height: 16, viewBox:"-4 -4 26 26"}
const eyeProps = {width: 20, height: 16, viewBox:"2 2 20 20"}
// const menuProps = {width: 18, height: 18, style:{padding:"0px 2px"}}

interface tag_props {
    name:string
    deletable:boolean
    objVisibility: Accessor<boolean>
    setObjVisibility: (arg:boolean) => void
    setMenuVisibility:Setter<boolean> | undefined
    menuVisibility:Accessor<boolean> | undefined
    innerHtml: Accessor<string | undefined> 
}

/**
 * A Label for a single Indicator.
 */
function IndicatorTag(props:tag_props){
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
            <div class="text" innerHTML={props.name + (props.innerHtml() !== undefined? " • " + props.innerHtml(): "")}/>
            <Show when={hover()}>
                <Icon {...eyeProps}
                    icon={props.objVisibility()? icons.eye_normal : icons.eye_crossed} 
                    onClick={(e) => {if (e.button === 0) props.setObjVisibility(!props.objVisibility())}}
                /> {/* onClk => indicator visibility toggle */}

                <Show when={props.setMenuVisibility !== undefined}>
                    <Icon icon={icons.settings_small} {...gearProps}
                        onclick={(e) => {if (e.button === 0 && props.setMenuVisibility && props.menuVisibility)props.setMenuVisibility(!props.menuVisibility())}}
                    />
                </Show>

                <Show when={props.deletable}>
                    <Icon icon={icons.close} {...closeProps}/> {/* onClk => delete *Through window.api* */}
                </Show>

                {/* <Icon icon={icons.menu_ext_small} {...menuProps}/>  onClk => spawn Simple Menu? */}
            </Show>
        </div>
    ) 

}