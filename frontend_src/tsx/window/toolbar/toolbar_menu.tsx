/**
 * ToolBox Overlay Menu and Menu-Open Button.
 */

import { Accessor, createSignal, For, onMount, Setter, Show, splitProps } from "solid-js";
import { activePrimitiveTool, selectTool, TOOL_MAP } from "../../../src/charting_frame/primitive-plugins/tool_ui_support";
import { Icon, icons } from "../../generic_elements/icons";
import { MenuItem, ShowMenuButton } from "../../generic_elements/simple_menu";
import { location_reference, overlay_div_props, OverlayCTX, OverlayDiv, point } from "../overlay_manager";
import { ToolBoxCTX } from "./toolbar";

export interface toolbar_menu_props {
    id: string
    tools: icons[][]
    default_icon: icons
}

/**
 * A single container Button to be displayed within the Toolbar. Placing the 
 * Button within the Tool-Bar automatically generates a button to open a menu
 * and display the tools given within the props.
 * 
 * Each Tool is keyed to it's respective svg icon.
 */
export function ToolBarMenuButton(props: toolbar_menu_props) {
    let el = document.createElement('div')

    const [location, setLocation] = createSignal<point>({ x: 0, y: 0 })
    const [displayIcon, setDisplayIcon] = createSignal<icons>(props.default_icon)

    const updateLocation = () => {
        setLocation({
            x: el.getBoundingClientRect().right,
            y: el.getBoundingClientRect().top
        })
    }

    OverlayCTX().attachOverlay(
        props.id,
        () => <ToolBarOverlay
            id={props.id}
            location={location}
            updateLocation={updateLocation}
            tools={props.tools}
            setIcon={setDisplayIcon}
        />
    )

    return (
        <div ref={el} class='toolbar_container'>
            <Icon
                icon={displayIcon()}
                active={activePrimitiveTool()?.icon == displayIcon()}
                // @ts-ignore
                selected={TOOL_MAP.get(displayIcon())?.selected?.()}
                onClick={() => selectTool(displayIcon())}
                classList={{ toolbar_icon_btn: true }}
            />
            <ShowMenuButton
                id={props.id}
                classList={{ toolbar_menu_button: true }}
                icon_act={icons.menu_arrow_ew}
            />
        </div>
    )
}


interface toolbar_overlay_props extends Omit<overlay_div_props, "location_ref"> {
    id: string
    tools: icons[][]
    location: Accessor<point>
    setIcon: Setter<icons>
}
/**
 * Overlay Menu showing the available tool options within this menu. 
 * @param props.tools : 2D-Array. The first array holds all of the menu groups
 *                      Each sub-Array holds the tools within each group
 */
function ToolBarOverlay(props: toolbar_overlay_props) {
    let setDisplay: Setter<boolean>
    const favTools = ToolBoxCTX().tools
    const setFavTools = ToolBoxCTX().setTools
    const [, overlayDivProps] = splitProps(props, ["tools", "setIcon"])


    function addFavorite(tool: icons) {
        if (!favTools().includes(tool)) setFavTools([...favTools(), tool])
    }
    function removeFavorite(tool: icons) {
        if (favTools().includes(tool)) setFavTools(favTools().filter((fav) => fav != tool))
    }
    function onSel(tool: icons) {
        selectTool(tool)
        props.setIcon(tool)
        setDisplay(false)
    }

    onMount(() => { setDisplay = OverlayCTX().getDisplaySetter(props.id) })

    return (
        <OverlayDiv
            {...overlayDivProps}
            location_ref={location_reference.TOP_LEFT}
        >
            <For each={props.tools}>{(tools_sublist) => <>
                <div class='menu_section_titlebox' />
                <For each={tools_sublist}>{(tool) =>
                    <Show when={TOOL_MAP.has(tool)}>
                        <MenuItem
                            expand={true}
                            icon={tool}
                            label={TOOL_MAP.get(tool)?.label ?? ""}
                            onSel={() => onSel(tool)}

                            star={() => favTools().includes(tool)}
                            starAct={() => addFavorite(tool)}
                            starDeact={() => removeFavorite(tool)}
                            starStyle={{ width: '20px', height: '20px' }}
                        />
                    </Show>
                }</For>
            </>
            }</For>
        </OverlayDiv>
    )
}
