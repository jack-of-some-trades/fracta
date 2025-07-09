/**
 * Indicator File Search Menu and Topbar Show/Hide Toggle Button
 */

import { createSignal, For, onCleanup, onMount, Setter, Show, Signal, splitProps } from "solid-js";
import { createStore } from "solid-js/store";
import { Icon, icons } from "../../generic_elements/icons";
import { location_reference, overlay_div_props, OverlayCTX, OverlayDiv, point } from "../overlay_manager";

interface indicator_details {
    "ind_key": string,
    "ind_name": string,
    "ind_version": string,
    "entry_point": string,
    "unlisted": boolean | undefined,
    "description": string | undefined,
}

export interface indicator_pkg {
    "pkg_key": string,
    "pkg_name": string,
    "pkg_version": string | undefined,
    "description": string | undefined,
    "indicators": {[key: string]: indicator_details},
}

// Box that gets mounted to the Topbar
export function IndicatorsBox(){
    const id = 'indicator_menu'
    let box_el = document.createElement('div')

    const displaySignal = createSignal<boolean>(false)
    const [menuLocation, setMenuLocation] = createSignal<point>({x:0, y:0})
    const position_menu = () => {setMenuLocation({x:window.innerWidth/2, y:window.innerHeight*0.2})}
    
    function onClk(e:MouseEvent){
        displaySignal[1](!displaySignal[0]()) // Toggle Visibility
        e.stopPropagation();
    }
    // Adding events manually makes it function as expected 
    // (it executes before topbar prop events that would toggle the display state)
    onMount(() => {
        box_el.addEventListener('mousedown', (e) => onClk(e))
        window.addEventListener('resize', position_menu)
    })
    onCleanup(() => {window.removeEventListener('resize', position_menu)})

    //These signals and stores are initlilized here so that their state isn't reset when the menu disappears
    const [packages, setPackages] = createStore<{[key: string]: indicator_pkg}>({})
    window.api.populate_indicator_pkgs = setPackages

    OverlayCTX().attachOverlay(
        id,
        <IndicatorsMenu
            id={id}
            packages={packages}
            setDisplay={displaySignal[1]}
            location={menuLocation()}
            setLocation={setMenuLocation}
            updateLocation={position_menu}
        />,
        displaySignal,
    )

    return <div class="topbar_container">
        <div class="menu_selectable indicator_topbar_btn" ref={box_el}>
            <Icon icon={icons.indicator}/>
            <div class='text' style={{padding:"0px 2px"}}>Indicators</div>
        </div>
        {/* <Icon icon={icons.indicator_template}/> */}
    </div>
}

//#region --------------------- Overlay Menu --------------------- //


interface ind_menu_props extends Omit<overlay_div_props, "location_ref"> {
    packages:{[key: string]: indicator_pkg}
    setDisplay:Setter<boolean>,
}

function IndicatorsMenu(props: ind_menu_props){
    const [,overlayDivProps] = splitProps(props, ["setDisplay", "packages"])

    const activePkgSig = createSignal<indicator_pkg | undefined>(undefined)

    return (
        <OverlayDiv
            {...overlayDivProps} 
            classList={{indicator_menu:true}} 
            location_ref={location_reference.CENTER}
            drag_handle={"#indicator_menu_drag"}
            bounding_client_id={`#${props.id}>.indicator_title_bar`}
        >
            {/***** Title Bar *****/}
            <div class="indicator_title_bar">
                <Icon 
                    icon={icons.indicator_on_stratagy} 
                    width={28} height={28} 
                    classList={{icon:false, symbol_search_icon:true}} 
                />
                <h1 class="text" style={{margin: "8px 10px"}}>Indicators</h1>
                <div id="indicator_menu_drag" />
                <Icon 
                    icon={icons.close} 
                    style={{"margin-right":"15px", padding:"5px"}}
                    onClick={()=>props.setDisplay(false)}//Close Menu on Click
                />
            </div>
            
            <div class="indicator_title_separator"/>

            {/***** Info Container *****/}
            <div id="indicator_info_container">
                
                <div id='indicator_packages_list'>
                    <table><tbody>
                        <For each={Object.values(props.packages)}>{(pkg) => <PackageCard activePkgSig={activePkgSig} {...pkg}/>}</For>
                    </tbody></table>
                </div>

                <div class="indicator_vert_separator"/>

                <div id='indicator_details_list'>
                    <table><tbody>
                        <For each={Object.values(activePkgSig[0]()?.indicators ?? {})}>{ (details) => 
                            <IndicatorCard 
                                {...details} 
                                activePkgKey={activePkgSig[0]()?.pkg_key?? ''}
                                setDisplay={props.setDisplay}
                            />}
                        </For>
                    </tbody></table>
                    <Show when={activePkgSig[0]()?.description}>
                        <div id='indicator_pkg_description' innerHTML={activePkgSig[0]()?.description}/>
                    </Show>
                </div>
            </div>
        </OverlayDiv>
    )
}

function PackageCard(props: indicator_pkg & {'activePkgSig':Signal<indicator_pkg | undefined>}){
    const [,pkg] = splitProps(props, ['activePkgSig'])

    return (
        <div
            class='pkg_card'
            onClick={() => props.activePkgSig[1](pkg)}
            attr:active={props.activePkgSig[0]()?.pkg_key == props.pkg_key? '': undefined}
        >
            <span innerText={props.pkg_name}/>
            <Show when={props.pkg_version}>
                <div class='version' innerText={props.pkg_version ?? ''}/>
            </Show>
        </div>
    )
}

function IndicatorCard(props: indicator_details & {'activePkgKey':string, 'setDisplay':Setter<boolean>}){
    if (props.unlisted) return

    return <div 
        class='ind_card'
        onClick={() => {send_indicator_request(props.activePkgKey, props.ind_key); props.setDisplay(false)}}
    >
        <span innerText={props.ind_name}/>
        <Show when={props.description && props.description != ''}>
            <div class='description' innerHTML={props.description ?? ''}/>
        </Show>
        <Show when={props.ind_version && props.ind_version != ''}>
            <div class='version' innerText={props.ind_version ?? ''}/>
        </Show>
    </div>
}

function send_indicator_request(pkg_key:string, ind_key:string){
    if (window.activeContainer == undefined || window.activeFrame == undefined)
        return
    window.api.indicator_request(
        window.activeContainer.id, window.activeFrame.id, pkg_key, ind_key
    )
}
//#endregion