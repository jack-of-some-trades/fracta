/**
 * Overlay Manager Displays & Hides Menus that have been attached to the Context.
 * 
 * This file also provides an OverlayDiv Component that standardizes the Div
 * that gets attached to the overlay manager on top of providing some useful
 * placing & bounding functionality
 */

import { Accessor, createContext, createEffect, createSignal, For, JSX, on, onCleanup, onMount, Setter, Show, Signal, splitProps, useContext } from "solid-js";
import { createStore } from "solid-js/store";


//#region --------------------- Context Manager --------------------- //

type OverlayContextProps = {
    attachOverlay: (id: string, el: () => JSX.Element, showDisplay?: Signal<boolean> | boolean, autohide?: boolean | null) => void,
    detachOverlay: (id: string) => void,
    getDivReference: (id: string) => undefined | HTMLDivElement,
    setDivReference: (id: string, el: HTMLDivElement) => void,
    getDisplaySetter: (id: string) => Setter<boolean>,
    getDisplayAccessor: (id: string) => Accessor<boolean>,
}
const default_ctx_args: OverlayContextProps = {
    attachOverlay: () => { },
    detachOverlay: () => { },
    getDivReference: () => { return undefined },
    setDivReference: () => { },
    getDisplaySetter: () => () => { },
    getDisplayAccessor: () => () => false,
}

let OverlayContext = createContext<OverlayContextProps>(default_ctx_args);
export function OverlayCTX(): OverlayContextProps { return useContext<OverlayContextProps>(OverlayContext) }

interface overlay_struct {
    id: string,              // Id of the menu
    el: () => JSX.Element    // The Menu itself, Should be an <OverlayDiv/> Factory
    hide: boolean | null       // Auto Hide the menu on a non-contained click, On Null, don't hide on ESC.
}
export function OverlayContextProvider(props: JSX.HTMLAttributes<HTMLElement>) {
    const [overlays, setOverlays] = createStore<overlay_struct[]>([])
    const displayMap = new Map<string, Signal<boolean>>()
    const divMap = new Map<string, HTMLDivElement>()

    //#region ------------------- Overlay Context Functions ------------------- //

    /** Place a menu in the overlay manager
     * @param el : () => JSX.Element, This should, at the topmost level, be an <OverlayDiv/> factory, 
     *          This must be a factory to preserve Solidjs Component lifecycle controls. Things break if it's not.
     * @param showDisplay : Optional Signal<bool> | bool. Allows the Source object to make and have control
     *          over the display's Visibility Signal. When passed a boolean, the required signal is created 
     *          internally using the supplied boolean as the default visibility state. undefined === false.
     * @param autohide : bool, if true the menu will be automatically hidden when a click outside
     *          of the overlay's bounds are detected. undefined === true, null === always show overlay (will not hide on ESC.)
     */
    function attachOverlay(
        id: string,
        el: () => JSX.Element,
        showDisplay: Signal<boolean> | boolean | undefined = undefined,
        autohide: boolean | null = true,
    ) {
        if (overlays.find((obj) => obj.id === id))
            setOverlays(Array.from(overlays.filter((obj) => obj.id !== id)))
        //ID Present, Remove First to proc reactivity of object elements

        // Refine the input show varible into a Show signal w/ the correct default state.
        if (showDisplay === undefined || typeof (showDisplay) === 'boolean')
            showDisplay = createSignal(showDisplay ?? false)
        displayMap.set(id, showDisplay)

        setOverlays([...overlays, { id: id, el: el, hide: autohide }])
    }
    function detachOverlay(id: string) {
        divMap.delete(id)
        displayMap.delete(id)
        setOverlays(overlays.filter((overlay) => overlay.id !== id))
    }
    function getDivReference(id: string) { return divMap.get(id) }
    function setDivReference(id: string, el: HTMLDivElement) { divMap.set(id, el) }

    function getDisplayAccessor(id: string): Accessor<boolean> {
        const display = displayMap.get(id)
        return (display !== undefined) ? display[0] : () => false
    }
    function getDisplaySetter(id: string): Setter<boolean> {
        const display = displayMap.get(id)
        return (display !== undefined) ? display[1] : () => undefined
    }

    //#endregion

    //#region ------------------- Global Event Listeners ------------------- //

    //This Listener checks all Overlay Elements and removes visibility if a mouse event occurs outside of a menu
    document.body.addEventListener('mousedown', (e) =>
        overlays.forEach(({ id, hide }) => {
            if (!hide) return // forEach equivalent to continue

            let el = getDivReference(id)
            if (el && !el.contains(e.target as Node))
                getDisplaySetter(id)(false)
        }
        )
    )
    document.body.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
            Array.from(overlays).forEach(({ id, hide }) => { if (hide !== null) getDisplaySetter(id)(false) })
    })

    //#endregion


    const OverlayCTX = {
        attachOverlay: attachOverlay,
        detachOverlay: detachOverlay,
        getDivReference: getDivReference,
        setDivReference: setDivReference,
        getDisplaySetter: getDisplaySetter,
        getDisplayAccessor: getDisplayAccessor
    }

    //Overwrite External, Globally Accessable, Context so anything can use this at any time.
    OverlayContext = createContext<OverlayContextProps>(OverlayCTX);
    return (
        <OverlayContext.Provider value={OverlayCTX}>
            {props.children}

            <div id='overlay_manager'>
                <For each={overlays}>{({ id, el }) =>
                    <Show when={getDisplayAccessor(id)()}>{el()}</Show>}
                </For>
            </div>
        </OverlayContext.Provider>
    )
}

//#endregion

//#region --------------------- Overlay Mounting Interface --------------------- //

export type point = { x: number, y: number }
export enum location_reference {
    TOP_RIGHT,
    TOP_LEFT,
    BOTTOM_RIGHT,
    BOTTOM_LEFT,
    CENTER
}

/**
 * @param id : String ID of the Overlay Component. Can be used to retrieve the Visibility State
 * @param location : {x,y} Coordinate to draw the point at.
 * @param updateLocation : [Optional] function that can be called to update the location parameter above,
 *        Useful when the location is referencing a Signal that cannot be reactive such as a Div's ClientBoundingBox
 * @param location_ref : Reference Corner to position the Div, e.g. TOP_RIGHT will mean the top right corner of 
 *        the div will be drawn at location:{x,y}
 * @param drag_handle : Optional QuerySelector String. If given, that element will be made into a drag handle
 *        capable of moving the menu around. Must be given a setLocation function
 * @param setLocation : Optional setter<Point> used by the drag handle logic.
 * @param bounding_client_id : QuerySelector String for an Element that will be used as a bounding client reference. 
 *        Movement of the overlay div will be limited such that the DOMRect of this reference client cannot go offscreen.
 *        By Default, The entire OverlayDiv will be used as the bounding client
 * @param oneshot : When true the given overlay div is detached once it is no longer visible leaving it to be garbage collected.
 */
export interface overlay_div_props extends JSX.HTMLAttributes<HTMLDivElement> {
    id: string
    location: Accessor<point>
    location_ref: location_reference
    updateLocation?: () => void
    drag_handle?: string
    setLocation?: Setter<point>
    bounding_client_id?: string
    oneShot?: boolean
}


/**
 * Interface that should be used when mounting a component to the Overlay Manager.
 * This wrapper div sets the necessary Event Listeners for Displaying and Positioning the component
 */
export function OverlayDiv(props: overlay_div_props) {
    let divRef: HTMLDivElement | undefined = undefined
    let boundingClientRef: HTMLElement | undefined = undefined
    let dragListenerSet = !(props.drag_handle && props.setLocation)
    props.classList = { ...props.classList, overlay: true }
    const [style, setStyle] = createSignal<JSX.CSSProperties>(initPosition(props.location_ref, props.location()))
    const [, divProps] = splitProps(props, ["id", "location", "setLocation", "location_ref", "updateLocation", "drag_handle", "bounding_client_id", "oneShot"])

    //#region ------------------- Drag Handle Listeners ------------------- //

    const move = (e: MouseEvent) => {
        if (e.target !== document.documentElement)
            //Only Move the location if the cursor is on the screen
            if (props.setLocation) props.setLocation({
                x: props.location().x + e.movementX,
                y: props.location().y + e.movementY
            })
    }
    const mouseup = (e: MouseEvent) => {
        if (e.button !== 0) return

        let div_ref = boundingClientRef ?? divRef
        if (div_ref != undefined && props.setLocation != undefined) {
            // Ensure the underlying location reference is where the Div is actually drawn at
            // (Dragging off-screen can separate the two)
            props.setLocation(
                getReferenceLocation(props.location_ref, div_ref.getBoundingClientRect())
            )
        }
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', mouseup)
    }
    //#endregion

    //#region ------------------- Position Update Listeners ------------------- //

    //Set Position Function and preserve the Reactivity of Display_Ref
    let getBoundedPosition = getBoundedPositionFunc(props.location_ref)
    createEffect(() => { getBoundedPosition = getBoundedPositionFunc(props.location_ref) })

    onMount(() => {
        const display = OverlayCTX().getDisplayAccessor(props.id)

        //Next effect gets a reference to the Div once it is attached to the document & Queryable.
        //Sadly, its the easiest way to get this reference given how these are created.
        createEffect(on(display, () => {
            if (!display()) return

            divRef = document.querySelector(`#${props.id}`) as HTMLDivElement
            if (props.bounding_client_id)
                boundingClientRef = document.querySelector(props.bounding_client_id) as HTMLElement
            OverlayCTX().setDivReference(props.id, divRef)

            //If given, add a mouseDown drag listener
            if (!dragListenerSet && props.drag_handle) {
                let drag_handle = document.querySelector(props.drag_handle) as HTMLElement
                if (drag_handle) {
                    drag_handle.addEventListener('mousedown', (e) => {
                        if (e.button === 0) {
                            document.addEventListener('mousemove', move)
                            document.addEventListener('mouseup', mouseup)
                        }
                    })
                    drag_handle.classList.add("drag_handle")
                    dragListenerSet = true //Ensure only one listener is added to the drag handle
                }
            }
        }))

        // If oneshot param is given, give a cleanup command once the display is not longer visible.
        createEffect(on(display, () => {
            if (props.oneShot && !display() && OverlayCTX().getDivReference(props.id))
                OverlayCTX().detachOverlay(props.id)
        }))

        //Update Div Location when Location Changes (Preserve Reactivity of props.location)
        createEffect(() => {
            let ref = boundingClientRef ?? divRef
            let pos = getBoundedPosition(props.location(), ref?.getBoundingClientRect())
            if (pos) setStyle(pos)
        })

        //Manually Update Location on visibilty change and resize if given a means to.
        if (props.updateLocation) {
            createEffect(on(display, props.updateLocation))
            window.addEventListener('resize', props.updateLocation)
        }
    })
    onCleanup(() => {
        if (props.updateLocation) window.removeEventListener('resize', props.updateLocation)
    })

    //#endregion
    return (
        <div {...divProps} id={props.id}
            style={style()}>
            {props.children}
        </div>
    )
}

/**
 * @returns A Function that can be called with the desired drawing location and DOMRect of the given overlayDiv.
 *          This Function itself returns the CSSProperties Style that will place the OverlayDiv into the window
 *          at the location if possible. The draw location is bounded such that the OverlayDiv will not draw
 *          outside the window
 * @param display_ref : The desired reference corner in which to draw the OverlayDiv from
 */
function getBoundedPositionFunc(display_ref: location_reference): (pt: point, rect: DOMRect | undefined) => JSX.CSSProperties | undefined {
    switch (display_ref) {
        case (location_reference.TOP_LEFT):
            return (pt: point, overlay_rect: DOMRect | undefined) => {
                const window_rect = document.querySelector('#overlay_manager')?.getBoundingClientRect()
                if (!window_rect || !overlay_rect) return

                return {
                    top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height - overlay_rect.height))}px`,
                    left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width - overlay_rect.width))}px`
                }
            }

        case (location_reference.BOTTOM_LEFT):
            return (pt: point, overlay_rect: DOMRect | undefined) => {
                const window_rect = document.querySelector('#overlay_manager')?.getBoundingClientRect()
                if (!window_rect || !overlay_rect) return

                return {
                    bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, overlay_rect.height), window_rect.height))}px`,
                    left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width - overlay_rect.width))}px`
                }
            }

        case (location_reference.TOP_RIGHT):
            return (pt: point, overlay_rect: DOMRect | undefined) => {
                const window_rect = document.querySelector('#overlay_manager')?.getBoundingClientRect()
                if (!window_rect || !overlay_rect) return

                return {
                    top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height - overlay_rect.height))}px`,
                    right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, overlay_rect.width), window_rect.width))}px`
                }
            }

        case (location_reference.BOTTOM_RIGHT):
            return (pt: point, overlay_rect: DOMRect | undefined) => {
                const window_rect = document.querySelector('#overlay_manager')?.getBoundingClientRect()
                if (!window_rect || !overlay_rect) return

                return {
                    bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, overlay_rect.height), window_rect.height))}px`,
                    right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, overlay_rect.width), window_rect.width))}px`
                }
            }

        case (location_reference.CENTER):
            return (pt: point, overlay_rect: DOMRect | undefined) => {
                const window_rect = document.querySelector('#overlay_manager')?.getBoundingClientRect()
                if (!window_rect || !overlay_rect) return
                const left_offset = overlay_rect.width / 2
                const top_offset = overlay_rect.height / 2
                const right_bound = window_rect.width - overlay_rect.width
                const bottom_bound = window_rect.height - overlay_rect.height

                return {
                    top: `${Math.round(Math.min(Math.max(pt.y - top_offset, 0), bottom_bound))}px`,
                    left: `${Math.round(Math.min(Math.max(pt.x - left_offset, 0), right_bound))}px`
                }
            }
    }
}

/** A Function to return the location reference point (TOP-LEFT, CENTER, etc. ) of a div based
 * on where the div is actually being drawn. Can be used to reset the Div location so it's 
 * reference point is guaranteed to align with where it is drawn
 * @returns The Reference Location Point of a given DIV where it is currently placed. 
 * @param display_ref : The reference corner OverlayDiv is positioned from.
 * @param rect : The DOM rect of the OverlayDiv's drag handle.
 */
function getReferenceLocation(display_ref: location_reference, rect: DOMRect): point {
    switch (display_ref) {
        case (location_reference.TOP_LEFT):
            return { x: rect.left, y: rect.top }
        case (location_reference.BOTTOM_LEFT):
            return { x: rect.left, y: rect.bottom }
        case (location_reference.TOP_RIGHT):
            return { x: rect.right, y: rect.top }
        case (location_reference.BOTTOM_RIGHT):
            return { x: rect.right, y: rect.bottom }
        case (location_reference.CENTER):
            return { x: rect.left + Math.floor(rect.width / 2), y: rect.top + Math.floor(rect.height / 2) }
    }
}

function initPosition(display_ref: location_reference, pt: point): JSX.CSSProperties {
    const window_rect = { width: window.innerWidth, height: window.innerHeight }
    // document.querySelector('#overlay_manager')?.getBoundingClientRect()
    if (!window_rect) return { left: '-1px', top: '-1px' }

    switch (display_ref) {
        case (location_reference.CENTER):
        case (location_reference.TOP_LEFT):
            return {
                top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
                left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width))}px`
            }

        case (location_reference.BOTTOM_LEFT):
            return {
                bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
                left: `${Math.round(Math.min(Math.max(pt.x, 0), window_rect.width))}px`
            }

        case (location_reference.TOP_RIGHT):
            return {
                top: `${Math.round(Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
                right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, 0), window_rect.width))}px`
            }

        case (location_reference.BOTTOM_RIGHT):
            return {
                bottom: `${Math.round(window_rect.height - Math.min(Math.max(pt.y, 0), window_rect.height))}px`,
                right: `${Math.round(window_rect.width - Math.min(Math.max(pt.x, 0), window_rect.width))}px`
            }
    }
}

//#endregion