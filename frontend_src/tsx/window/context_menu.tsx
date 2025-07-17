import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Icon, icons } from "../generic_elements/icons";
import { location_reference, OverlayCTX, OverlayDiv, point } from "./overlay_manager";

/**
 * To Add a Context menu to a desired element, Bind this function with the desired menuItems 
 * then add it as a listener to the 'onContextMenu' Event for the element. 
 * ** IMPORTANT NOTE ** For this to work the listener MUST be triggered in the bubbling phase.
 * i.e. {capture : true}
 * @param menuItems 2D Array of context_menu_item(s). The outer array denotes subgroups.
 * @param e Mouse Event from the source Click
 */
export function MenuContextListener(this:contextMenuItem[][], e: MouseEvent){
    if (e.button !== 2) return
    e.preventDefault()
    CONTEXT_MENU_CTX.display[1](true)
    CONTEXT_MENU_CTX.appendMenuItems(this)
}

//#region --------------------- Context Manager --------------------- //


// Not creating a Proper context manager since the 'context' is only referenced locally.
const [menuItems, setMenuItems] = createSignal<contextMenuItem[][]>([])
const [menuLocation, setMenuLocation] = createSignal<point>({x:0, y:0})

function appendMenuItems(items:contextMenuItem[][]){ 
    setMenuItems([...menuItems(), ...items]) 
}

createEffect(() => console.log(menuLocation()))

const CONTEXT_MENU_CTX = {
    display: createSignal<boolean>(false),
    menuItems: menuItems,
    setMenuItems: setMenuItems,
    appendMenuItems: appendMenuItems,
    menuLocation: menuLocation,
    setMenuLocation: setMenuLocation,
}

export interface contextMenuItem{
    execute: () => void
    icon?: icons
    title: string
    disable?: () => boolean
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
        CONTEXT_MENU_CTX.display
    )

    return <></>
}

//#endregion

function ContextMenu(props: {id: string}){
    const CTX_RESET = (e:MouseEvent) => {
        CONTEXT_MENU_CTX.display[1](true)
        CONTEXT_MENU_CTX.setMenuItems([])
        CONTEXT_MENU_CTX.setMenuLocation({'x':e.clientX, 'y':e.clientY})
    }
    const CTX_MENU_HIDE = () => {
        // Menu must be showed to position it properly. This listener re-hides it if There are no items appended
        if (CONTEXT_MENU_CTX.menuItems().length == 0)
            CONTEXT_MENU_CTX.display[1](false)
    }

    onMount(() => {
        document.addEventListener('contextmenu', CTX_RESET, {capture: true})
        document.addEventListener('contextmenu', CTX_MENU_HIDE)
    })
    onCleanup(() => {
        document.removeEventListener('contextmenu', CTX_RESET)
        document.removeEventListener('contextmenu', CTX_MENU_HIDE)
    })

    return <OverlayDiv
        id = {props.id}
        location = {menuLocation}
        location_ref = {location_reference.TOP_LEFT}
    >
        <table>
            <For each={CONTEXT_MENU_CTX.menuItems()}>{(subgroup) => 
            <>
                <For each={subgroup}>{(item) =>
                    <ContextMenuItem {...item}/>
                }</For>
                <tr class = 'section_separator'/>
            </>
            }</For>
        </table>
    </OverlayDiv>
}

function ContextMenuItem(props: contextMenuItem){
    const isDisabled = props.disable && props.disable()

    const handleClick = (e:MouseEvent) => {
        if (e.button !== 0) return

        e.stopPropagation()
        CONTEXT_MENU_CTX.display[1](false)
        props.execute()
    }
    
    let shortcutText
    if (props.hotkey) {
        shortcutText = ''
        if (props.alt) shortcutText += 'Alt + '
        if (props.ctrl) shortcutText += 'Ctrl + '
        if (props.shift) shortcutText += 'Shift + '
        shortcutText += String(props.hotkey)
    }

    return <tr classList={{'context_menu_item':true, 'disabled': isDisabled}} onClick={ isDisabled ? undefined : handleClick}>
        <td> <div>
            <Icon icon = {props.icon ?? icons.blank} hover = {false}/>
        </div> </td>
        <td>
            <div>
                <span class='text menu_item' innerText={props.title}/>
                <Show when={shortcutText}>
                    <span class='text menu_item_shortcut' innerText={String(shortcutText)}/>
                </Show>
            </div>
        </td>
    </tr>
}

