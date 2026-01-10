/**
 * Container Context and Display Component. The Container is the Center component of the
 * Window. It is instantiated at the top level alongside the other sections of the window.
 * The Context, and thus what is displayed, is controlled by the Container_Manager. 
 * 
 * This Component should be considered as a Singleton.
 */

import { createContext, createSignal, JSX, useContext } from "solid-js";
import { default_layout_ctx_args, Layout, layout_display } from "./layouts";

let ContainerContext = createContext(default_layout_ctx_args);
export function ContainerCTX() { return useContext(ContainerContext) }

export function Container(props: { style: JSX.CSSProperties }) {
    const [divRef, setDivRef] = createSignal(document.createElement('div'))

    const [style, setStyle] = createSignal<string>('')
    const [displays, setDisplays] = createSignal<layout_display[]>([])
    const getSize = () => { return divRef().getBoundingClientRect() }

    const ctx_args = {
        getSize: getSize,
        setStyle: setStyle,
        displays: displays,
        setDisplay: setDisplays,
    }

    //Redefine outer scope context variable (Effectively makes this a singleton.)
    ContainerContext = createContext(ctx_args);
    return <ContainerContext.Provider value={ctx_args}>
        <div ref={setDivRef} id='container' class='layout_main' style={props.style}>
            <Layout
                select_cls="frame"
                innerStyle={style}
                displays={displays}
            />
        </div>
    </ContainerContext.Provider>
}