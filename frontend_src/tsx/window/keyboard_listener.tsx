/** 
 * Global Event Listener to handle Keyboard Shortcuts.
 * 
 * This Doesn't need to be a TSX Element. It's implementation would be identical if it were just a .ts file, but
 * this way it's placed in the file structure next to the context_menu which serves a similar function.
 */

import { Accessor, createContext, createSignal, JSX, onCleanup, onMount, Setter, useContext } from "solid-js";
import { makeId } from "../../src/types";
import { contextMenuItem } from "./context_menu";

/**
 * Returns a list of Keyboard Shortcuts Ordered by general execution priority.
 * Shortcuts with more Keyboard Modifiers (Alt, Ctrl, Shift) take higher priority.
 * Regex match Shortcuts take slightly less priority over explicity string character matches
 * @param menuItems 
 * @returns Ordered List of Shortcuts to be passed to the KeyboardCTX().AttachHandlers() method
 */
export function deriveShortcuts(menuItems:contextMenuItem[][]): keyboardShortcut[] {
    const items:keyboardShortcut[] = Array.from(menuItems.flat()).filter(
        (item: contextMenuItem): item is keyboardShortcut => item.hotkey !== undefined
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

/**
 * Keyboard shortcut interface. 
 * @param disable: Optional Boolean Accessor. Can be used to actively enable/disable a shortcut already attached as a handler.
 *        When disable = false, the event listener considers the key-event not handled and will continue to bubble to find another
 *        handler that will handle the key-event.
 * @param title: Residual param from context_menu_item. Only used to silence linter type errors.
 * @param alt, @param ctrl, @param shift, As you would expect, when true, those modifier keys must be pressed to activate the key-binding.
 *        In addition, when generated from deriveShortcuts(), the more modifier params needed => the higher the priority of the key-binding.
 */
export interface keyboardShortcut {
    execute: () => void
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
    attachAnonymousHandler(shortcuts: keyboardShortcut[]): string 
    alt: Accessor<boolean>
    ctrl: Accessor<boolean>
    shift: Accessor<boolean>
}

/**
 * @param attachHandler Attach a set of shortcuts. Only one handler will ever trigger for a given key-press. 
 *        The order of the shortcuts is their priority order. Ind 0 = High Priority, Ind -1 = Low Priority.
 * @param detachHandler Detach a set of shortcuts by owner ID.
 * @param attachAnonymousHandler Attach a set of shortcuts from something that has no unique ID. 
 *        An ID is returned that should be used to remove the shortcuts when they are no longer needed.
 * @param alt, @param ctrl, @param shift Accessors for the current state of the Modifier Keys
 */
const DEFAULT_CTX_ARGS:KeyboardContextProps = {
    attachHandler: (id:string, shortcuts: keyboardShortcut[]) => {},
    detachHandler: (id:string) => {},
    attachAnonymousHandler: (shortcuts: keyboardShortcut[]) => String(),
    alt: () => false,
    ctrl: () => false,
    shift: () => false,
}

let keyboardContext = createContext<KeyboardContextProps>(DEFAULT_CTX_ARGS);
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

    function anonymousHandler(shortcuts: keyboardShortcut[]): string {
        const new_id = makeId([...HANDLERS.keys()], 'anon_')
        HANDLERS.set(new_id, shortcuts)
        return new_id
    }

    const CTX_ARGS = {
        attachHandler: HANDLERS.set.bind(HANDLERS),
        detachHandler: HANDLERS.delete.bind(HANDLERS),
        attachAnonymousHandler: anonymousHandler,
        alt: alt,
        ctrl: ctrl,
        shift: shift,
    }

    // Overwrite so Default CTX args change. 
    // This allows objects outside of the context children to access the above CTX_ARGS.
    keyboardContext = createContext<KeyboardContextProps>(CTX_ARGS);
    return <keyboardContext.Provider value={CTX_ARGS} children={props.children}/>
}


function maybeFireShortcut(e:KeyboardEvent, shortcut: keyboardShortcut): boolean {
    if (shortcut.alt !== undefined && shortcut.alt !== e.altKey) return false
    if (shortcut.ctrl !== undefined && shortcut.ctrl !== e.ctrlKey) return false
    if (shortcut.shift !== undefined && shortcut.shift !== e.shiftKey) return false

    if (shortcut.disable?.()) return false
    if (!e.key.match(shortcut.hotkey)) return false
    shortcut.execute()
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
    preventCertainDefaults(e)

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
    preventCertainDefaults(e)
    switch (e.key) {
        case 'Alt': setAlt(false); return;
        case 'Shift': setShift(false); return;
        case 'Control': setCtrl(false); return;
    }
}


/**
 * Prevent some keyboard shortcuts from triggering. Cannot blanket call e.preventDefault() since
 * that would disable typing input into all <input/>s
 */
function preventCertainDefaults(e: KeyboardEvent){
    const KEY = e.key.toUpperCase()
    const MODIFIERS = getMask(e)

    for (const [MASK, KEY_SET] of BLACKLIST_KEYBINDINGS){
        if (MODIFIERS & MASK && KEY_SET.has(KEY))
            e.preventDefault()
            return
    }
}

enum ModMask {
    None  = 0,
    Ctrl  = 1 << 0,
    Alt   = 1 << 1,
    Shift = 1 << 2,
}

function getMask(e: KeyboardEvent): number {
    return (e.ctrlKey ? ModMask.Ctrl : 0) |
           (e.altKey ? ModMask.Alt : 0) |
           (e.shiftKey ? ModMask.Shift : 0);
}

const BLACKLIST_KEYBINDINGS: Map<number, Set<string>> = new Map([
    [ModMask.Ctrl, new Set(['R', 'F', 'G', 'J', 'P', 'I', 'TAB'])],
    [ModMask.Ctrl | ModMask.Alt, new Set(['DELETE'])],
])