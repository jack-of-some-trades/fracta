/** 
 * Global Event Listener to handle Keyboard Shortcuts
 * 
 * No, This Doesn't need to be a TSX Element. It's implementation would be identical if it were just a .ts file, but
 * this way it's placed in the file structure next to the context_menu which serves a similar function.
 */

import { Accessor, createContext, createSignal, JSX, onCleanup, onMount, Setter, useContext } from "solid-js";
import { context_menu_item } from "./context_menu";

/**
 * Returns a list of Keyboard Shortcuts Ordered by general execution priority.
 * Shortcuts with more Keyboard Modifiers (Alt, Ctrl, Shift) take higher priority.
 * Regex match Shortcuts take slightly less priority over explicity string character matches
 * @param menuItems 
 * @returns Ordered List of Shortcuts to be passed to the KeyboardCTX().AttachHandlers() method
 */
export function deriveShortcuts(menuItems:context_menu_item[][]): keyboardShortcut[] {
    const items:keyboardShortcut[] = Array.from(menuItems.flat()).filter(
        (item: context_menu_item): item is keyboardShortcut => item.hotkey !== undefined
    )
    items.sort((a, b) => getPriority(a) - getPriority(b))
    return items
}

// Prioritize firing shortcuts that require modifier keys since they have more restrictive firing conditions
function getPriority(item: keyboardShortcut): number { 
    return (item.alt === undefined ? 0 : 1) 
            + (item.ctrl === undefined ? 0 : 1) 
            + (item.shift === undefined ? 0 : 1)
            // Prioritize explicity coded characters over more-broad Regex matches
            + (typeof(item.hotkey) === 'string'? 0 : -0.5) 
}

// Context_Menu_Item interface, but guaranteed to have a hotkey defined
export interface keyboardShortcut {
    onClick: () => void
    hotkey: string | RegExp
    alt?: boolean
    ctrl?: boolean
    shift?: boolean
    
    title: string // Residual from context_menu_item
    disable?: () => boolean
}

type KeyboardContextProps = {
    attachHandler: (id:string, shortcuts: keyboardShortcut[]) => void
    detachHandler: (id:string) => void
    alt: Accessor<boolean>
    ctrl: Accessor<boolean>
    shift: Accessor<boolean>
}

const default_ctx_args:KeyboardContextProps = {
    attachHandler: (id:string, shortcuts: keyboardShortcut[]) => {},
    detachHandler: (id:string) => {},
    alt: () => false,
    ctrl: () => false,
    shift: () => false,
}

let keyboardContext = createContext<KeyboardContextProps>(default_ctx_args);
export function KeyboardCTX():KeyboardContextProps { return useContext<KeyboardContextProps>(keyboardContext) }


export function KeyboardListener(props: JSX.HTMLAttributes<HTMLElement>){
    const [alt, setAlt] = createSignal<boolean>(false)
    const [ctrl, setCtrl] = createSignal<boolean>(false)
    const [shift, setShift] = createSignal<boolean>(false)
    const HANDLERS = new Map<string, keyboardShortcut[]>()

    const boundKeyUp = onKeyUp.bind(HANDLERS, setAlt, setCtrl, setShift)
    const boundKeyDown = onKeyDown.bind(HANDLERS, setAlt, setCtrl, setShift)

    onMount(() => {
        window.addEventListener('keyup', boundKeyUp)
        window.addEventListener('keydown', boundKeyDown)
    })
    onCleanup(() => {
        window.removeEventListener('keyup', boundKeyUp)
        window.removeEventListener('keydown', boundKeyDown)
    })

    const CTX_ARGS = {
        attachHandler: HANDLERS.set.bind(HANDLERS),
        detachHandler: HANDLERS.delete.bind(HANDLERS),
        alt: alt,
        ctrl: ctrl,
        shift: shift,
    }

    keyboardContext = createContext<KeyboardContextProps>(CTX_ARGS);
    return <keyboardContext.Provider value={CTX_ARGS} children={props.children}/>
}


function maybeFireShortcut(e:KeyboardEvent, shortcut: keyboardShortcut): boolean {
    if (shortcut.alt !== undefined && shortcut.alt !== e.altKey) return false
    if (shortcut.ctrl !== undefined && shortcut.ctrl !== e.ctrlKey) return false
    if (shortcut.shift !== undefined && shortcut.shift !== e.shiftKey) return false

    if (shortcut.disable?.()) return false
    if (!e.key.match(shortcut.hotkey)) return false
    shortcut.onClick()
    return true
}


function onKeyDown(
    this: Map<string, keyboardShortcut[]>, 
    setAlt:Setter<boolean>, 
    setCtrl:Setter<boolean>, 
    setShift:Setter<boolean>, 
    e: KeyboardEvent
){
    if (e.repeat) return // Only Capture Key Changes

    switch (e.key) {
        case 'Alt': setAlt(true); return;
        case 'Shift': setShift(true); return;
        case 'Control': setCtrl(true); return;
    }

    let handled = false
    // Iterate over the Handlers in 'last-added-trigger-first' order
    for (const [id, shortcuts] of Array.from(this).reverse() ){
        handled = shortcuts.some((s) => maybeFireShortcut(e, s))
        if (handled) return
    }
}


function onKeyUp(
    this: Map<string, keyboardShortcut[]>, 
    setAlt:Setter<boolean>, 
    setCtrl:Setter<boolean>, 
    setShift:Setter<boolean>, 
    e: KeyboardEvent
){
    switch (e.key) {
        case 'Alt': setAlt(false); return;
        case 'Shift': setShift(false); return;
        case 'Control': setCtrl(false); return;
    }
}
