import { createSignal, For, Show } from "solid-js";
import { Icon, icons } from "../generic_elements/icons";
import { location_reference, OverlayCTX, OverlayDiv, point } from "./overlay_manager";

/**
 * To Add a Context menu to a desired element, Bind this function with the desired menuItems 
 * then add it as a listener to the 'onContextMenu' Event for the element.
 * @param menuItems 2D Array of context_menu_item(s). The outer array denotes subgroups.
 * @param e Mouse Event from the source Click
 */
export function MenuContextListener(this:context_menu_item[][], e: MouseEvent){
    if (e.button === 2){
        e.preventDefault()
        e.stopPropagation()

        ContextMenuCTX.display[1](true)
        // Always force the menu to reconstruct when a click occurs in case 'disable' changes
        ContextMenuCTX.setMenuItems([])
        ContextMenuCTX.setMenuItems(this)
        ContextMenuCTX.setMenuLocation({'x':e.clientX, 'y':e.clientY})
    }
}

//#region --------------------- Context Manager --------------------- //


// Not creating a Proper context manager since the 'context' is only used locally.
const [menuItems, setMenuItems] = createSignal<context_menu_item[][]>([])
const [menuLocation, setMenuLocation] = createSignal<point>({x:0, y:0})

const ContextMenuCTX = {
    display: createSignal<boolean>(false),
    menuItems: menuItems,
    setMenuItems: setMenuItems,
    menuLocation: menuLocation,
    setMenuLocation: setMenuLocation,
}

export interface context_menu_item{
    disable?: () => boolean
    icon?: icons
    title: string
    onClick: () => void
    alt?: boolean
    ctrl?: boolean
    shift?: boolean
    hotkey?: string | RegExp
}
export function ContextMenuOverlayProvider() {
    const id = 'context_menu_overlay'
    OverlayCTX().attachOverlay(
        id,
        ContextMenu({id:id}),
        ContextMenuCTX.display
    )

    return <></>
}

//#endregion

function ContextMenu(props: {id: string}){
    return <OverlayDiv
        id = {props.id}
        location = {menuLocation()}
        location_ref = {location_reference.TOP_LEFT}
    >
        <table>
            <For each={ContextMenuCTX.menuItems()}>{(subgroup) => 
            <>
                <For each={subgroup}>{(item) =>
                    <ContextMenuItem {...item}/>
                }</For>
                <Show when={subgroup.some((menu_item) => menu_item.disable?.() ?? true)}>
                    <tr class = 'section_separator'/>
                </Show>
            </>
            }</For>
        </table>
    </OverlayDiv>
}

function ContextMenuItem(props: context_menu_item){
    const isDisabled = props.disable && props.disable()

    const handleClick = (e:MouseEvent) => {
        if (e.button !== 0) return

        e.stopPropagation()
        ContextMenuCTX.display[1](false)
        props.onClick()
    }
    
    let shortcut_text
    if (props.hotkey) {
        shortcut_text = props.hotkey
        if (props.alt) shortcut_text += ' + Alt'
        if (props.ctrl) shortcut_text += ' + Ctrl'
        if (props.shift) shortcut_text += ' + Shift'
    }

    return <tr classList={{'context_menu_item':true, 'disabled': isDisabled}} onClick={ isDisabled ? undefined : handleClick}>
        <td> <div>
            <Icon icon = {props.icon ?? icons.blank} hover = {false}/>
        </div> </td>
        <td>
            <div>
                <span class='text menu_item' innerText={props.title}/>
                <Show when={shortcut_text && !isDisabled}>
                    <span class='text menu_item_shortcut' innerText={String(shortcut_text)}/>
                </Show>
            </div>
        </td>
    </tr>
}

