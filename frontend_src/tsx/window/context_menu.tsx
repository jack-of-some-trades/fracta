import { createSignal, For, Show } from "solid-js";
import { Icon, icons } from "../generic_elements/icons";
import { location_reference, OverlayCTX, OverlayDiv, point } from "./overlay_manager";


export function MenuContextListener(menuItems:context_menu_item[][], e: MouseEvent){
    if (e.button === 2){
        e.preventDefault()
        e.stopPropagation()

        ContextMenuCTX.display[1](true)
        // Always force the menu to reconstruct when a click occurs
        ContextMenuCTX.setMenuItems([])
        ContextMenuCTX.setMenuItems(menuItems)
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
    hotkey?: string
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
                    <span class='text menu_item_shortcut' innerText={shortcut_text}/>
                </Show>
            </div>
        </td>
    </tr>
}

