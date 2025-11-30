/**
 * <Layout/> is a Component that directly couples with layout.ts.
 * Where is the component that puts display objects on the screen as layout.ts is the
 * computation behind the screen sizing and manipulating each "layout_display"
 * 
 * Together, they create a modular predefined layout of elements that are user resizable and
 * ambivalent to their contents. This Component is used by both the Main window container to
 * size each 'Frame', and by Charting_Frames to size individual Charting_Panes.
 */

import { Accessor, For, JSX, Setter } from "solid-js"
import { Orientation } from "../../src/window/layouts"

export interface layout_display {
    orientation: Orientation
    element: JSX.Element | HTMLDivElement | undefined,
    mouseDown: (e: MouseEvent) => void
    el_active: Accessor<boolean>
    el_target: Accessor<boolean>
}

type LayoutContextProps = {
    getSize: Accessor<DOMRect>,
    setStyle: Setter<string>,
    displays: Accessor<layout_display[]>,
    setDisplay: Setter<layout_display[]>,
}

export const default_layout_ctx_args: LayoutContextProps = {
    getSize: () => { return new DOMRect(0, 0, -1, -1) },
    setStyle: () => { },
    displays: () => [],
    setDisplay: () => { },
}

interface layout_props {
    select_cls: string
    innerStyle: Accessor<string>
    displays: Accessor<layout_display[]>
}

export function Layout(props: layout_props) {
    return <>
        <style innerHTML={props.innerStyle()} />
        <For each={props.displays()}>{(display) =>
            <div
                id={
                    display.orientation === Orientation.Vertical ? "separator_v"
                        : display.orientation === Orientation.Horizontal ? "separator_h"
                            : undefined
                }
                class={props.select_cls}
                attr:active={display.el_active() ? "" : undefined}
                attr:target={display.el_target() ? "" : undefined}
                onMouseDown={display.mouseDown}
            >
                {display.element}
            </div>
        }</For>
    </>
}

