import { createEffect, createSignal, JSX, Match, Switch } from "solid-js";
import { Icon, icons } from "../generic_elements/icons";
import { FrameViewer } from "../widget_panels/frame_viewer";
import { ObjectTree } from "../widget_panels/object_tree";
import { WIDGET_BAR_WIDTH, WIDGET_PANEL_MARGIN, WidgetPanelSizeCTX } from "./wrapper";

const [selectedWidget, setSelectedWidget] = createSignal<icons | undefined>()

// #region --------------------- Widget Bar Selector ----------------------- */

interface widget_bar_props extends JSX.HTMLAttributes<HTMLDivElement> {
    panelDisplay: JSX.CSSProperties
    showWidgetPanel: () => void
    hideWidgetPanel: () => void
}
export function WidgetBar(props: widget_bar_props) {

    createEffect(() => {
        props.panelDisplay.display === 'flex' && selectedWidget() ? props.showWidgetPanel() : props.hideWidgetPanel()
    })

    return <div class='layout_main layout_flex flex_col' style={props.style}>
        <WidgetIcon icon={icons.frame_editor} />
        <WidgetIcon icon={icons.object_tree} />
    </div>
}

function WidgetIcon(props: { icon: icons } & JSX.SvgSVGAttributes<SVGSVGElement>) {
    return (
        <Icon
            width={34} height={34}
            classList={{ widget_bar_icon: true }}
            style={{ margin: '4px', padding: '2px' }}
            onClick={() => setSelectedWidget(selectedWidget() !== props.icon ? props.icon : undefined)}
            selected={selectedWidget() === props.icon}
            {...props}
        />
    )
}

// #endregion

// #region --------------------- Widget Panel Display ----------------------- */

export function WidgetPanel(divProps: JSX.HTMLAttributes<HTMLDivElement>) {
    const resizePanel = WidgetPanelSizeCTX().setSize
    const [resizing, setResizing] = createSignal<boolean>(false)
    let ref = document.createElement('div')

    const resizeWidgetPanel = (e: MouseEvent) => {
        resizePanel(window.innerWidth - (e.clientX + WIDGET_BAR_WIDTH + WIDGET_PANEL_MARGIN))
    }

    const onMouseDown = (e: MouseEvent) => {
        if (e.target !== ref) return
        setResizing(true)
        // These do still cleanup when the move event sticks to the window despite lifting the mouse button
        document.addEventListener('mousemove', resizeWidgetPanel)
        document.addEventListener('mouseup', () => {
            setResizing(false)
            document.removeEventListener('mousemove', resizeWidgetPanel)
        }, { once: true })
    }

    return <div class='layout_main widget_panel' {...divProps} onMouseDown={onMouseDown}>
        <Switch>
            <Match when={selectedWidget() === icons.frame_editor}><FrameViewer /></Match>
            <Match when={selectedWidget() === icons.object_tree}><ObjectTree /></Match>
        </Switch>
        <div
            ref={ref}
            class='widget_resize_handle'
            style={{ "background-color": resizing() ? 'var(--hover-color)' : "" }}
        />
    </div>
}

// #endregion