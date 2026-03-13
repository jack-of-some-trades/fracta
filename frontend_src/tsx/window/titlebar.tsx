/**
 * The Title Bar is the topmost component of the layout and holds the Tabs of the window.
 * The Title Bar instantiates the Conatiner Component & Coupled Container_Manager's 
 * Singleton instances. This is done because the TitleBar, displaying each tab, must have high
 * coupling with all of the Containers and what container is being actively displayed.
 */

import { createSignal, JSX, mergeProps, onMount, splitProps } from "solid-js"
import { container_manager } from "../../src/window/container_manager"
import { Icon, icon_props, icons } from '../generic_elements/icons'
import { LAYOUT_SECTIONS } from "./wrapper"

interface title_bar_props extends JSX.HTMLAttributes<HTMLDivElement> {
    show_section: (section: LAYOUT_SECTIONS) => void,
    hide_section: (section: LAYOUT_SECTIONS) => void,
}

export function TitleBar(props: title_bar_props) {
    let tab_div: HTMLDivElement | undefined
    // Eww Dead Code. Might want to implement when proper app (electron?) interface is implemented though.
    // const [frameless, setFrameless] = createSignal(false)
    // const [fullscreen, setFullscreen] = createSignal(false)

    onMount(() => {
        if (tab_div) window.container_manager = new container_manager(tab_div)
    })

    return <div class='layout_title layout_flex' style={props.style}>
        {/**** Tabs Bar ****/}
        <div ref={tab_div} class="titlebar titlebar_grab tabs frameless-drag-region">
            <div class="tabs-content" />
        </div>

        {/**** Window Controls ****/}
        <div class="titlebar titlebar_btns frameless-drag-region">

            {/**** New Tab and Window Panel Controls ****/}
            <Icon icon={icons.window_add} classList={{ window_btn: true }}
                style={{ padding: '1px 3px' }}
                onClick={() => { window.api.add_container() }} />
            <div class="titlebar_separator" />
            <ToggleBtn icon={icons.panel_left} classList={{ layout_btn: true }} active={true}
                onAct={() => { props.show_section(LAYOUT_SECTIONS.TOOL_BAR) }}
                onDeact={() => { props.hide_section(LAYOUT_SECTIONS.TOOL_BAR) }} />
            <ToggleBtn icon={icons.panel_right} classList={{ layout_btn: true }}
                onAct={() => { props.show_section(LAYOUT_SECTIONS.WIDGET_BAR) }}
                onDeact={() => { props.hide_section(LAYOUT_SECTIONS.WIDGET_BAR) }} />
            <ToggleBtn icon={icons.panel_top} classList={{ layout_btn: true }} active={true}
                onAct={() => { props.show_section(LAYOUT_SECTIONS.TOP_BAR) }}
                onDeact={() => { props.hide_section(LAYOUT_SECTIONS.TOP_BAR) }} />
            <ToggleBtn icon={icons.panel_bottom} classList={{ layout_btn: true }}
                onAct={() => { props.show_section(LAYOUT_SECTIONS.UTIL_BAR) }}
                onDeact={() => { props.hide_section(LAYOUT_SECTIONS.UTIL_BAR) }} />


            {/**** Frameless Window Controls ****/}
            {/* <Show when={frameless()}>
                <div class="titlebar_separator" />
                <Icon icon={icons.minimize} classList={{ window_btn: true }} style={{ padding: '3px' }} width={16} height={16}
                    onClick={() => { window.api.minimize() }} />
                <Show when={fullscreen()}><Icon icon={icons.restore} classList={{ window_btn: true }}
                    onClick={() => { setFullscreen(false); window.api.restore() }} /> </Show>
                <Show when={!fullscreen()}> <Icon icon={icons.maximize} classList={{ window_btn: true }} style={{ padding: '2px' }}
                    onClick={() => { setFullscreen(true); window.api.maximize() }} /> </Show>
                <Icon icon={icons.close} classList={{ window_btn: true }} style={{ padding: '3px' }} width={16} height={16}
                    onClick={() => { window.api.close() }} />
            </Show> */}
        </div>
    </div>
}


//#region -------------------- Toggle Button Component -------------------- //

interface togglebtn_props extends icon_props {
    onAct?: () => void,
    onDeact?: () => void,
    active?: boolean,
}

const default_togglebtn: togglebtn_props = {
    icon: '',
    active: false,
    onAct: () => { console.log('Button Activated!') },
    onDeact: () => { console.log('Button Deactivated!') },
}

function ToggleBtn(props: togglebtn_props) {
    const merged = mergeProps(default_togglebtn, props)
    const [activated, setActivated] = createSignal(merged.active)
    const [, iconProps] = splitProps(merged, ['onAct', 'onDeact'])

    iconProps.onClick = () => {
        setActivated(!activated())
        if (activated() && merged.onAct) merged.onAct()
        else if (!activated() && merged.onDeact) merged.onDeact()
    }

    //Set Initial State
    if (activated() && merged.onAct) merged.onAct()
    else if (!activated() && merged.onDeact) merged.onDeact()

    return <Icon {...iconProps} active={activated()} />
}

//#endregion