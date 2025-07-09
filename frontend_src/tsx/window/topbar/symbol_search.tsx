/**
 * Symbol Search Overlay Menu and Topbar Menu Show/Hide Toggle Button
 */

import { Accessor, createEffect, createSignal, For, onCleanup, onMount, Setter, splitProps } from "solid-js"
import { createStore, SetStoreFunction } from "solid-js/store"
import { ticker } from "../../../src/types"
import { Icon, icons } from "../../generic_elements/icons"
import { location_reference, overlay_div_props, OverlayCTX, OverlayDiv, point } from "../overlay_manager"

interface select_filters {
    exchange:string[],
    source:string[],
    asset_class:string[],
}

const default_sel_filters:select_filters = {
    exchange:["NYSE", "NASDAQ"],
    source:["Local", "Alpaca"],
    asset_class:["Crypto", "Equity"],
}

export function SymbolSearchBox(){
    const id = "symbol_search"
    let box_el = document.createElement('div')
    let replace_el = document.createElement('div')

    const displaySignal = createSignal<boolean>(false)
    const display = displaySignal[0]
    const setDisplay = displaySignal[1]

    const [ticker, setTicker] = createSignal<string>("FRACTA")
    const [replace, setReplace] = createSignal<boolean>(true)
    const [menuLocation, setMenuLocation] = createSignal<point>({x:0, y:0})

    window.topbar.setTicker = setTicker

    // When the Symbol Button on the Topbar is cliked, not the menu itself.
    function onClk(e:MouseEvent, replace_symbol:boolean){
        setReplace(replace_symbol);
        setDisplay(!display());
        e.stopPropagation();
    }
    const position_menu = () => {setMenuLocation({x:window.innerWidth/2, y:window.innerHeight*0.2})}

    //Adding events manually makes it function as expected (it executes before prop events)
    onMount(() => {
        box_el.addEventListener('mousedown', (e) => onClk(e,true))
        replace_el.addEventListener('mousedown', (e) => onClk(e,false))
        window.addEventListener('resize', position_menu)
    })
    onCleanup(() => {window.removeEventListener('resize', position_menu)})

    //These signals and stores are initlilized here so that their state isn't reset when the search menu disappears
    const [tickers, setTickers] = createSignal<ticker[]>([])
    const [filters, setFilters] = createStore<select_filters>(default_sel_filters)
    window.api.set_search_filters = setFilters
    window.api.populate_search_tickers = setTickers

    OverlayCTX().attachOverlay(
        id,
        <SymbolSearchMenu
            id={id}
            tickers={tickers()}
            display={display}
            setDisplay={setDisplay}
            filters={filters}
            setFilters={setFilters}
            replace={replace()}
            setReplace={setReplace}
            location={menuLocation()}
            setLocation={setMenuLocation}
            updateLocation={position_menu}
        />,
        displaySignal,
    )
    
    return <div class='topbar_container'>
        <div id='symbol_box' class='sel_highlight' ref={box_el}>
            <Icon icon={icons.menu_search} style={{margin:'5px'}} width={20} height={20}/>
            <div id="search_text" class='topbar_containers text'>{ticker()}</div>
        </div>
        <div ref={replace_el} style={{display:"flex", "align-items":"center"}}>
            <Icon icon={icons.menu_add}/>
        </div>
    </div>
}



//#region --------------------- Overlay Menu --------------------- //


interface search_menu_props extends Omit<overlay_div_props, "location_ref">{
    tickers:ticker[]
    display:Accessor<boolean>,
    setDisplay:Setter<boolean>,
    replace:boolean,
    setReplace:Setter<boolean>,
    filters:select_filters,
    setFilters:SetStoreFunction<select_filters>
}
type prop_key = keyof select_filters
const label_map = new Map<prop_key, string>([
    ["exchange","Exchange:"],
    ["source","Data Source:"],
    ["asset_class","Asset Class:"],
])

export function SymbolSearchMenu(props:search_menu_props){
    const [,overlayDivProps] = splitProps(props, ["replace", "setReplace", "tickers", "filters", "setFilters", "setDisplay"])

    // Focus the Text input when the window is displayed
    createEffect(() => {
        if (props.display()) {
            setTimeout( () => {
                let el:HTMLInputElement | null = document.querySelector('input.search_input[type=text]');
                el?.focus(); el?.select();
            }, 100 )
        }
    })

    function fetch(symbol:ticker){
        if (window.activeFrame?.timeframe)
            window.api.data_request(
                window.activeContainer?.id,
                window.activeFrame?.id,
                symbol,
                window.activeFrame?.timeframe.toString()
            )
        props.setDisplay(false)
    }

    function search(confirmed:boolean){
        const search_menu = document.querySelector(`#${props.id}`); if (!search_menu) return
        
        // Fetch all the filter information directly from the DOM. Easier than creating yet another Store
        const symbol = (search_menu.querySelector("input.search_input") as HTMLInputElement).value
        const exchanges = Array.from(
            search_menu.querySelectorAll("#exchange > .bubble_item[active]:not([id=any])"), 
            (node)=>node?.textContent??""
        )
        const sources = Array.from(
            search_menu.querySelectorAll("#source > .bubble_item[active]:not([id=any])"), 
            (node)=>node?.textContent??""
        )
        const asset_classes = Array.from(
            search_menu.querySelectorAll("#asset_class > .bubble_item[active]:not([id=any])"), 
            (node)=>(node?.textContent??"")
        )
        window.api.symbol_search(symbol, sources, exchanges, asset_classes, confirmed)
    }

    function update_filter(e: MouseEvent){
        let target = e.target as HTMLDivElement
        if (target.hasAttribute('active')) {
            target.removeAttribute('active')
            //Check if 'Any' needs to be reset
            if (target.parentElement?.querySelectorAll('.bubble_item[active]').length === 0)
                target.parentElement.querySelector('#any')?.setAttribute('active', '')
        }
        else {
            //Check if 'Any' needs to be cleared
            if (target.parentElement?.querySelectorAll('#any[active]').length === 1)
                target.parentElement.querySelector('#any')?.removeAttribute('active')
            target.setAttribute('active', '')
        }
        search(false)
    }

    function update_filter_any(e: MouseEvent){
        let target = e.target as HTMLDivElement
        //clear all Active bubbles
        let bubbles = target.parentElement?.querySelectorAll('.bubble_item[active]') as NodeList
        for (let i = 0; i < bubbles?.length; i++)
            (bubbles[i] as HTMLDivElement).removeAttribute('active')

        target.setAttribute('active', '')
        search(false)
    }

    return (
        <OverlayDiv 
            {...overlayDivProps} 
            classList={{symbol_menu:true}} 
            location_ref={location_reference.CENTER}
            drag_handle={"#symbol_search_drag"}
            bounding_client_id={`#${props.id}>.symbol_title_bar`}
        >

            {/***** Title Bar *****/}
            <div class="symbol_title_bar">
                <Icon 
                    icon={icons.menu_search} 
                    width={28} height={28} 
                    classList={{icon:false, symbol_search_icon:true}} 
                />
                <h1 class="text" style={{margin: "8px 10px"}}>Symbol Search</h1>
                {/* <h1 class="text" style={{margin: "8px 0px"}} onClick={()=>props.setReplace(!props.replace)}>
                     - {props.replace? "Replace": "Add"}
                </h1> */}
                <div id="symbol_search_drag" />
                <Icon 
                    icon={icons.close} 
                    style={{"margin-right":"15px", padding:"5px"}}
                    onClick={()=>props.setDisplay(false)}//Close Menu on Click
                />
            </div>

            {/***** Symbol Input *****/}
            <div class="symbol_input">
                <input class="search_input text" type="text" onInput={()=>search(false)}
                    onkeypress={(e)=>{if(e.key === "Enter") search(true)}}
                />
                <input class="search_submit text" type="submit" value="Submit" onClick={()=>search(true)}/>
            </div>

            
            {/***** Ticker Table *****/}
            <div class="symbol_list">
                <table id="symbols_table">
                    <thead>
                        <tr class="symbol_list_item text">
                            <th>Symbol</th><th>Name</th><th>Exchange</th><th>Asset Class</th><th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        <For each={props.tickers}>{(symbol)=>
                            <tr class="symbol_list_item text" onClick={()=>fetch(symbol)}>
                                <td>{symbol.symbol}</td>
                                <td>{symbol.name ?? "-"}</td>
                                <td>{symbol.exchange ?? "-"}</td>
                                <td>{symbol.asset_class ?? "-"}</td>
                                <td>{symbol.source ?? "-"}</td>
                            </tr>
                        }</For>
                    </tbody>
                </table>
            </div>

            {/***** Filters *****/}
            <For each={Object.keys(props.filters) as prop_key[]}>{(filter)=>
                <div id={filter} class="symbol_select_filter text">{label_map.get(filter)}
                    <div id="any" class="bubble_item" onmousedown={update_filter_any} attr:active="">Any</div>
                    <For each={props.filters[filter]}>{(opt)=>
                        <div class="bubble_item" onmousedown={update_filter}>{opt}</div>
                    }</For>
                </div>
            }</For>
        </OverlayDiv>
    )
}