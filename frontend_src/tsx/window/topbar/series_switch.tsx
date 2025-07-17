/**
 * Series Type Switcher Component and respective Overlay Component
 */

import { createSignal, For, Show, splitProps } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { Series_Type } from "../../../src/charting_frame/series-plugins/series-base";
import { interval } from "../../../src/types";
import { Icon, icons } from "../../generic_elements/icons";
import { MenuItem, ShowMenuButton } from "../../generic_elements/simple_menu";
import { location_reference, overlay_div_props, OverlayCTX, OverlayDiv, point } from "../overlay_manager";

// CSS in topbar.css

interface series_json {
    menu_listings:{
        ohlc?:Series_Type[]
        line?:Series_Type[]
        area?:Series_Type[]
        hist?:Series_Type[]
    }
    favorites: Series_Type[]
}

const default_series_select_opts: series_json = {
    menu_listings:{
        ohlc:[Series_Type.CANDLESTICK, Series_Type.BAR, Series_Type.ROUNDED_CANDLE],
        line:[Series_Type.LINE],
        area:[Series_Type.AREA, Series_Type.BASELINE],
        hist:[Series_Type.HISTOGRAM],
    },
    favorites: [
        Series_Type.ROUNDED_CANDLE
    ]
}


export function SeriesSwitcher(){
    const id = 'series_selector'
    let el = document.createElement('div')
    const [selectedSeries, setSelectedSeries] = createSignal<Series_Type>()
    const [menuLocation, setMenuLocation] = createSignal<point>({x:0, y:0})
    const [SeriesOpts, setSeriesOpts] = createStore(default_series_select_opts)

    const ordered_favorites = () => {
        return Array.from(SeriesOpts.favorites).sort((a,b) => a - b)
    }
    const updateLocation = () => {
        setMenuLocation({
            x: el.getBoundingClientRect().right, 
            y: el.getBoundingClientRect().bottom
        })
    }

    window.topbar.setSeries = setSelectedSeries
    window.api.update_series_topbar_opts = setSeriesOpts

    // Tell Python when the Series Type changes
    function onSel(series:Series_Type){
        if (window.activeContainer === undefined || window.activeFrame === undefined) return
        window.api.series_change(
            window.activeContainer.id,
            window.activeFrame.id,
            series
        )
    }

    OverlayCTX().attachOverlay(
        id,
        <SeriesMenu 
            id={id}
            onSel={onSel}
            opts={SeriesOpts} 
            setOpts={setSeriesOpts}
            location={menuLocation}
            updateLocation={updateLocation}
        />, 

    )

    return (
        <div class='topbar_container' ref={el}>
            {/* Additional Icon to show selected TF when it's not in the favorites list*/}
            <Show when={selectedSeries() && !SeriesOpts.favorites.includes(selectedSeries() as Series_Type)}>
                <Icon 
                    icon={series_icon_map[selectedSeries() as Series_Type]}
                    classList={{topbar_icon_btn:true}}
                    active={true}
                />
            </Show>

            {/* Display all favorites Ordered in increasing timestamp */}
            <For each={ordered_favorites()}>{ (fav) => 
                <Icon 
                    icon={series_icon_map[fav]}
                    classList={{topbar_icon_btn:true}}
                    active={selectedSeries() === fav}
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

const series_icon_map: { [key: number]: icons; } = {
    0: icons.close,         //Whitespace Data -> No Icon
    1: icons.close,         //Single Value Data -> No Icon
    2: icons.series_line,
    3: icons.series_area,
    4: icons.series_baseline,
    5: icons.series_histogram,
    6: icons.close,         //OHLC Data -> No Icon
    7: icons.candle_bar,
    8: icons.candle_regular,
    // 9: icons.series_step_line,
    9: icons.candle_rounded,
}

const series_label_map: { [key: number]: string; } = {
    0: "Whitespace Data",
    1: "Single Value Data",
    2: "Line",
    3: "Area",
    4: "Baseline",
    5: "Histogram",
    6: "OHLC Data",
    7: "Bar",
    8: "Candlestick",
    // 9: "HLC Area",
    9: "Rounded Candlestick",
}

interface SeriesMenu_Props extends Omit<overlay_div_props,"location_ref"> {
    opts:series_json,
    onSel:(series:Series_Type)=>void
    setOpts:SetStoreFunction<series_json>,
}

export function SeriesMenu(props:SeriesMenu_Props){
    const [,overlayDivProps] = splitProps(props, ["opts", "setOpts"])
    const accessor = (str: string) => props.opts.menu_listings[str as keyof typeof props.opts.menu_listings]

    function addFavorite(series:Series_Type){
        if (!props.opts.favorites.includes(series))
            props.setOpts("favorites", [...props.opts.favorites, series])
    }
    function removeFavorite(series:Series_Type){
        if (props.opts.favorites.includes(series))
            props.setOpts("favorites", props.opts.favorites.filter((fav) => fav != series))
    }

    return <OverlayDiv {...overlayDivProps} location_ref={location_reference.TOP_RIGHT}>
        <For each={Object.keys(props.opts.menu_listings) as interval[]}>{(section) =>
                <>
                <div class="menu_section_titlebox" />
                <For each={accessor(section)}>{(type)=>
                    <MenuItem 
                        expand={true}
                        icon={series_icon_map[type]}
                        label={series_label_map[type]}
                        onSel={() => props.onSel(type)}

                        star={() => props.opts.favorites.includes(type)}
                        starAct={() => addFavorite(type)}
                        starDeact={() => removeFavorite(type)}
                    />
                }</For>
                </>
        }</For>
    </OverlayDiv>
}