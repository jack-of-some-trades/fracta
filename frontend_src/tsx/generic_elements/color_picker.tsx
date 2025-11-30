/**
 * The Color Picker is a globally Accessible and placeable Component that allows for easy
 * Selection of both predefined and user-defined colors. 
 */
import { Accessor, createContext, createEffect, createSignal, For, JSX, on, onCleanup, onMount, Show, splitProps, useContext } from "solid-js"
import { createStore, SetStoreFunction } from "solid-js/store"
import { Icon, icons } from "./icons"

const default_colors = [
    '#FFFFFF', '#CCCCCC', '#999999', '#666666', '#333333', '#000000',
    '#EBB0B0', '#E9CEA1', '#E5DF80', '#ADEB97', '#A3C3EA', '#D8BDED',
    '#E15F5D', '#E1B45F', '#E2D947', '#4BE940', '#639AE1', '#D7A0E8',
    '#E42C2A', '#E49D30', '#E7D827', '#3CFF0A', '#3275E4', '#B06CE3',
    '#F3000D', '#EE9A14', '#F1DA13', '#2DFC0F', '#1562EE', '#BB00EF',
    '#B50911', '#E3860E', '#D2BD11', '#48DE0E', '#1455B4', '#6E009F',
    '#7C1713', '#B76B12', '#8D7A13', '#479C12', '#165579', '#51007E',
]

// #region --------------------- Color Picker Context ----------------------- */

/**
 * The Color Picker Context creates a global store for user defined colors.
 * If a color is added either via the GUI or Python Window Cmds it will be placed
 * in this context and thus accessed anywhere A ColorPicker is placed into the GUI
 */
interface color_context_props { userColors: string[], setUserColors: SetStoreFunction<string[]> }
const default_color_props: color_context_props = { userColors: [], setUserColors: () => { } }

let ColorPickerContext = createContext<color_context_props>(default_color_props)
export function ColorPickerCTX(): color_context_props { return useContext(ColorPickerContext) }

export function ColorContext(props: JSX.HTMLAttributes<HTMLElement>) {
    const [userColors, setUserColors] = createStore<string[]>([])
    window.api.set_user_colors = setUserColors

    const ColorPickerCTX: color_context_props = {
        userColors: userColors,
        setUserColors: setUserColors
    }
    ColorPickerContext = createContext<color_context_props>(ColorPickerCTX)

    return <ColorPickerContext.Provider value={ColorPickerCTX}>
        {props.children}
    </ColorPickerContext.Provider>
}

// #endregion

// #region --------------------- Color Picker Element ----------------------- */

/**
 * ColorInput is the UI Component That is placed into a menu.
 * @input_id : #ID Tag to be placed onto an invisible <input/> Tag. The Value of this input tag
 *      is querySelectable and returns an 8 Character Hex String
 * @init_color : rbga() or #hex string color code. An empty string is treated as '#00000000'
 * @onInput : Callable Function where the sole argument provided is the color hex string.
 *      This function is invoked everytime the color changes and thus can be used in place of
 *      querySelecting the <input/> Tag.
 */
interface color_input_props extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'ref' | 'onInput' | 'oninput'> {
    input_id: string,
    init_color: string, //rbga() or #hex string
    onInput?: (color: string) => void,
}
export function ColorInput(props: color_input_props) {
    let divRef = document.createElement('div')
    let hexInEl = document.createElement('input')
    let colorInEl = document.createElement('input')
    let opacityInEl = document.createElement('input')

    const [showMenu, setShowMenu] = createSignal(false)
    const [selectedColor, setSelectedColor] = createSignal(
        props.init_color === '' ? '#00000000' :
            props.init_color.startsWith('#') ? props.init_color :
                RGBAToHex(props.init_color)
    )
    const [, divProps] = splitProps(props, ["input_id", "init_color", 'onInput'])

    //Document wide Hide menu to close out color picker when a click occurs outside of it.
    const hide_menu = (e: MouseEvent) => { if (!divRef.contains(e.target as HTMLElement)) setShowMenu(false) }
    onMount(() => document.addEventListener('mousedown', hide_menu))
    onCleanup(() => document.removeEventListener('mousedown', hide_menu))

    // #region ---- ---- Functions to parse input and click events ----
    const opacity_dec = () => Math.round(Number('0x' + selectedColor().slice(7, 9)) / 2.55)
    const opacity_hex = () => Math.round(parseInt(opacityInEl.value) * 2.55).toString(16).padStart(2, '0').toUpperCase()

    function onOpacityInput() { setSelectedColor(selectedColor().slice(0, 7) + opacity_hex()) }
    function onMouseSelect(e: MouseEvent, color: string) { if (e.button === 0) setSelectedColor(color + opacity_hex()) }

    createEffect(on(selectedColor,
        () => { if (props.onInput) props.onInput(selectedColor()) },
        { defer: true } // Prevent this from firing an update when the Component is simply mounted
    ))
    // #endregion ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----

    return <div ref={divRef} {...divProps} style={{ 'background-color': selectedColor() }}>
        {/* Inner div to conform to parent's size shape, also set position to relative. */}
        <div
            onClick={(e) => { if (e.button === 0) setShowMenu(true) }}
            style={{ width: "100%", height: "100%", position: "relative" }}
        >
            <Show when={showMenu()}>
                <div class="color_menu">
                    <DefaultColorSet onSel={onMouseSelect} />
                    <div class="cpick_separator" />
                    <UserColorSet onSel={onMouseSelect} selectedColor={selectedColor} />
                    <div class="cpick_separator" />
                    <div class="current_color">
                        <input
                            ref={colorInEl} type="color"
                            value={selectedColor().slice(0, 7)}
                            style={{ "background-color": selectedColor().slice(0, 7) }}
                            oninput={() => setSelectedColor(colorInEl.value + opacity_hex())}
                        />
                        <input
                            ref={hexInEl} type='text'
                            value={selectedColor()}
                            pattern="^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$"
                            onBlur={() => {
                                if (hexInEl.value.length === 9) setSelectedColor(hexInEl.value)
                                else if (hexInEl.value.length === 7) setSelectedColor(hexInEl.value + opacity_hex())
                            }}
                        />
                        <div class="opacity_txt" innerText={"Opacity: " + opacity_dec().toString() + "%"} />
                        <input
                            ref={opacityInEl}
                            type="range" step={5}
                            value={selectedColor().length === 9 ? opacity_dec() : 100}
                            oninput={onOpacityInput}
                        />
                    </div>
                </div>
            </Show>
        </div>

        {/* invisible Input tag, w/ user id, to enable querySelecting the chosen color *with* Opacity */}
        <input
            id={props.input_id}
            type="color_picker"
            value={selectedColor()}
        />
    </div>
}

/** Component to Display Some Standard UI Colors */
function DefaultColorSet(props: { onSel: (e: MouseEvent, color: string) => void }) {
    return <div class="color_set">
        <For each={default_colors}>{(color) =>
            <div
                class="color_box"
                style={{ "background-color": color }}
                onMouseDown={(e) => props.onSel(e, color)}
            />
        }</For>
    </div>
}

/** Component to Display * Edit User Saved Colors */
function UserColorSet(props: { onSel: (e: MouseEvent, color: string) => void, selectedColor: Accessor<string> }) {
    const { userColors, setUserColors } = ColorPickerCTX()
    const remove_color = createSignal<boolean>(false)

    return <div class="color_set user_opts">
        <For each={userColors}>{(color, i) => <>
            <div class="color_box" style={{ "background-color": color }}
                onClick={(e) => {
                    if (remove_color[0]())
                        setUserColors([...userColors.slice(0, i()), ...userColors.slice(i() + 1)])
                    else
                        props.onSel(e, color)
                }}
            />
        </>}</For>

        {/* Add The Currently Selected Color to the User Favorites */}
        <div class="color_box">
            <Icon
                icon={icons.options_add}
                style={{ width: "18px", height: "18px" }}
                onClick={() => setUserColors([...userColors, props.selectedColor().slice(0, 7)])}
            />
        </div>
        {/* Allow For the User to Remove Colors from their Favorites */}
        <div class="color_box">
            <Icon
                icon={icons.options_remove}
                style={{ width: "18px", height: "18px" }}
                attr:active={remove_color[0]() ? '' : undefined}
                onClick={() => remove_color[1](!remove_color[0]())}
            />
        </div>
    </div>
}

// #endregion

function RGBAToHex(rgba: string, forceRemoveAlpha = false) {
    return "#" + rgba.replace(/^rgba?\(|\s+|\)$/g, '').split(',')
        .filter((string, index) => !forceRemoveAlpha || index !== 3)
        .map(string => parseFloat(string))
        .map((number, index) => index === 3 ? Math.round(number * 255) : number)
        .map(number => number.toString(16))
        .map(string => string.length === 1 ? "0" + string : string)
        .join("")
}