/**
 * Timeframe Switcher Component and respective Overlay Component
 */

import { createSignal, For, Show, splitProps } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { interval, intervalMap, tf } from "../../../src/types";
import { icons, TextIcon } from "../../generic_elements/icons";
import { MenuItem, MenuSection, ShowMenuButton } from "../../generic_elements/simple_menu";
import { location_reference, overlay_div_props, OverlayCTX, OverlayDiv, point } from "../overlay_manager";

// CSS in topbar.css

interface timeframe_json {
    menu_listings: {
        "s"?: number[]
        "m"?: number[]
        "h"?: number[]
        "D"?: number[]
        "W"?: number[]
        "M"?: number[]
        "Y"?: number[]
    },
    favorites: string[]
}

const default_timeframe_select_opts: timeframe_json = {
    menu_listings: {
        "s": [1, 2, 5, 15, 30],
        "m": [1, 2, 5, 15, 30],
        "h": [1, 2, 4],
        "D": [1],
        "W": [1]
    },
    favorites: [
        "1D"
    ]
}


export function TimeframeSwitcher(){
    const id = 'timeframe_selector'
    let el = document.createElement('div')
    const [selectedTF, setSelectedTF] = createSignal<tf>(new tf(1,'E'))
    const [menuLocation, setMenuLocation] = createSignal<point>({x:0, y:0})
    const [TimeframeOpts, setTimeframeOpts] = createStore(default_timeframe_select_opts)

    const ordered_favorites = () => {
        return Array.from(TimeframeOpts.favorites, (tf_str)=>tf.fromStr(tf_str)).sort((a,b) => a.toValue() - b.toValue())
    }
    const updateLocation = () => {
        setMenuLocation({
            x: el.getBoundingClientRect().right, 
            y: el.getBoundingClientRect().bottom
        })
    }
    
    window.topbar.setTimeframe = setSelectedTF
    window.api.update_timeframe_topbar_opts = setTimeframeOpts

    // Tell Python when the timeframe changes
    function onSel(timeframe:tf){
        if (window.activeFrame?.ticker !== undefined)
            window.api.timeseries_request( 
                window.activeContainer?.id ?? '',
                window.activeFrame?.id ?? '',
                window.activeFrame?.ticker ?? '',
                timeframe.toString()
            ) 
    }

    OverlayCTX().attachOverlay(
        id,
        <TimeframeMenu 
            id={id}
            onSel={onSel}
            opts={TimeframeOpts} 
            setOpts={setTimeframeOpts}
            location={menuLocation()}
            updateLocation={updateLocation}
        />, 

    )

    return (
        <div class='topbar_container' ref={el}>
            {/* Additional Icon to show selected TF when it's not in the favorites list*/}
            <Show when={!tf.isEqual(selectedTF(), new tf(1,'E')) && !TimeframeOpts.favorites.includes(selectedTF().toString()) }>
                <TextIcon 
                    text={selectedTF().toString(selectedTF().toValue() >= 86400)} 
                    classList={{timeframe_btn:true}}
                    activated={true}
                />
            </Show>

            {/* Display all favorites Ordered in increasing timestamp */}
            <For each={ordered_favorites()}>{ (fav) => 
                <TextIcon 
                    text={fav.toString(fav.toValue() >= 86400)}
                    classList={{timeframe_btn:true}}
                    activated={tf.isEqual(selectedTF(), fav)}
                    onClick={() => onSel(fav)}
                />
            }</For>
            {/* Button to Display Full Menu */}
            <ShowMenuButton 
                id={id} 
                class="topbar_menu_button"
                icon_act={icons.menu_arrow_ns}
            />
        </div>
    )
}


//#region --------------------- Overlay Menu --------------------- //

const default_display: Map<interval,boolean> = new Map([
    ["s", false],
    ["m", true],
    ["h", true],
    ["D", true],
    ["W", false],
    ["M", false],
    ["Y", false],
])

interface TimeframeMenu_Props extends Omit<overlay_div_props,"location_ref"> {
    onSel:(tf:tf)=>void
    opts:timeframe_json,
    setOpts:SetStoreFunction<timeframe_json>,
}

export function TimeframeMenu(props:TimeframeMenu_Props){
    const [,overlayDivProps] = splitProps(props, ["opts", "setOpts"])
    const accessor = (str: string) => props.opts.menu_listings[str as keyof typeof props.opts.menu_listings]

    function addFavorite(tf_str:string){
        if (!props.opts.favorites.includes(tf_str))
            props.setOpts("favorites", [...props.opts.favorites, tf_str])
    }
    function removeFavorite(tf_str:string){
        if (props.opts.favorites.includes(tf_str))
            props.setOpts("favorites", props.opts.favorites.filter((fav) => fav != tf_str))
    }

    return <OverlayDiv {...overlayDivProps} location_ref={location_reference.TOP_RIGHT}>
        <For each={Object.keys(props.opts.menu_listings) as interval[]}>{(tf_period) =>

            <MenuSection 
                label={intervalMap[tf_period] + 's'} 
                showByDefault={default_display.get(tf_period)??false} >

                <For each={accessor(tf_period)}>{(tf_mult)=>{
                    const _tf_obj = new tf(tf_mult, tf_period)
                    const _tf_str = _tf_obj.toString()
                    return <MenuItem 
                        expand = {true}
                        label={_tf_obj.toLabel()}
                        onSel={() => props.onSel(_tf_obj)}

                        star={props.opts.favorites.includes(_tf_str)}
                        starAct={() => addFavorite(_tf_str)}
                        starDeact={() => removeFavorite(_tf_str)}
                    />}
                }</For>
            </MenuSection>
            
        }</For>
    </OverlayDiv>
}