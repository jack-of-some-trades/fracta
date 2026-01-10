
import { createEffect, createSignal, For, on, onMount, Show } from "solid-js";
import { ContainerCTX } from "../window/container";

import { charting_frame } from "../../src/charting_frame/charting_frame";
import { frame } from "../../src/window/frame";
import { num_frames } from "../../src/window/layouts";
import { DraggableSelection, OverlayItemTag, SelectableItemTag } from "../generic_elements/draggable_selector";
import { Icon, icons } from "../generic_elements/icons";
import { WidgetPanelSizeCTX } from "../window/wrapper";

const MIN_WIDTH = 156
const MAX_WIDTH = 468
const DEFAULT_WIDTH = 200

export function FrameViewer() {
    //Displays used in a keyed show tag so the <For/> tag updates when the container does.
    const displays = ContainerCTX().displays

    const [ids, setIds] = createSignal(Array.from(activeContainer.frames, (f) => f.id))
    createEffect(on(displays, () => setIds(Array.from(activeContainer.frames, (f) => f.id))))

    const getTagName = (id: string) => FRAME_NAME_MAP.get(activeContainer.frames.find((f) => f.id === id)?.type ?? "") ?? ""

    onMount(() => {
        WidgetPanelSizeCTX().setMinSize(MIN_WIDTH)
        WidgetPanelSizeCTX().setMaxSize(MAX_WIDTH)
        WidgetPanelSizeCTX().setSize(DEFAULT_WIDTH)
    })

    return <>
        <div class='widget_panel_title'>Frame Viewer</div>
        <Show when={displays()} keyed>
            <DraggableSelection
                ids={ids}
                overlay_child={
                    ({ id }) => OverlayItemTag({
                        tag_id: () => id,
                        tag_name: () => getTagName(id)
                    })
                }
                reorder_function={activeContainer.reorderFrames.bind(activeContainer)}
            >
                <For each={ids()}>{(tag_id) => {
                    let frame = activeContainer.frames.find((f) => f.id === tag_id)
                    return <SelectableItemTag
                        tag_id={() => tag_id}
                        tag_name={() => getTagName(tag_id)}
                        onClick={() => frame?.assignActiveFrame()}
                    >
                        <FrameDeleteBtn id={tag_id} />
                    </SelectableItemTag>
                }}</For>
            </DraggableSelection>
        </Show>
    </>
}

//#region ------------------ Specific Frame Tags ------------------

const FRAME_NAME_MAP = new Map<string, string>([
    ['abstract', 'Abstract Frame'],
    ['charting_frame', 'Charting Frame']
])

function FrameDeleteBtn(props: { id: string }) {
    //Don't allow the frame to be deleted if the layout would no longer have enough supporting frames
    if (activeContainer.frames.length <= num_frames(activeContainer.layout)) return
    return <Icon icon={icons.close} onClick={() => window.api.remove_frame(activeContainer.id, props.id)} />
}

function AbstractFrameTag(props: { frame: frame }) {
    return undefined
}

function ChartingFrameTag(props: { frame: charting_frame }) {
    return undefined
}