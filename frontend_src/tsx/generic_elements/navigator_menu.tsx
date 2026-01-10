/**
 * Abstract Component that behaves similarly to a navigation bar typically located at the top
 * of a webpage. Implemented using <Show/> Tags so that it can be nested at any level of the program.
 */

import { Component, createEffect, createSignal, For, JSX, on, onMount, Show, Signal, splitProps } from "solid-js"
import { OverlayCTX } from "../window/overlay_manager"

interface nav_menu_props extends JSX.HTMLAttributes<HTMLDivElement> {
    tabs: { [key: string]: Component }
    overlay_id?: string
}

export function NavigatorMenu(props: nav_menu_props) {
    const [, divProps] = splitProps(props, ['tabs'])
    const activeTab = createSignal(Object.keys(props.tabs)[0])

    // Briefly Tried this with a Router, but it didn't work. TBH Show Tags are just as simple.
    return <>
        <Tabs {...divProps} items={Object.keys(props.tabs)} activeTab={activeTab} />
        <For each={Object.entries(props.tabs)}>{([item, Component]) =>
            <Show when={activeTab[0]() === item}>{Component}</Show>
        }</For>
    </>
}

interface TabsProps extends JSX.HTMLAttributes<HTMLDivElement> {
    activeTab: Signal<string>
    items: string[]
    overlay_id?: string
};

function Tabs(props: TabsProps) {
    // Create navigation element and indicator style signal
    const [, divProps] = splitProps(props, ['activeTab', 'items', 'overlay_id'])
    const [getNavBar, setNavBar] = createSignal<HTMLDivElement>();
    const [getIndicatorStyle, setIndicatorStyle] = createSignal<{ left: string; width: string; }>();

    const updateIndicatorStyle = () => {
        if (getNavBar() === undefined) return
        // Get active navigation element by pathname and href
        const activeElement = [...Array.from(getNavBar()!.children)].find((e) =>
            (e as HTMLDivElement).hasAttribute('active')
        ) as HTMLDivElement | undefined;

        // Update indicator (Bottom Border) style to active element's size or reset it to undefined
        setIndicatorStyle(activeElement ? {
            left: `${activeElement.offsetLeft || 0}px`,
            width: `${activeElement.offsetWidth || 0}px`,
        } : {
            left: '0',
            width: '100%',
        }
        );
    };

    // Set the initial State when the overlay Div becomes visible, if it's in an overlay div
    onMount(() => {
        if (props.overlay_id) {
            const overlayShow = OverlayCTX().getDisplayAccessor(props.overlay_id)
            createEffect(on(overlayShow, updateIndicatorStyle));
        }
    })

    // Update indicator style when active element changes
    createEffect(on(props.activeTab[0], updateIndicatorStyle));

    return <div {...divProps} ref={setNavBar}>
        <For each={props.items}>
            {(item) => (
                <div class="navigator_menu_tab"
                    onClick={() => props.activeTab[1](item)}
                    attr:active={props.activeTab[0]() === item ? "" : undefined}
                >
                    {item}
                </div>
            )}
        </For>
        <div class="navigator_style_bar" style={getIndicatorStyle()} />
    </div>
}
