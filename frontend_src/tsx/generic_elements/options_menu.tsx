/**
 */
import { Time } from "lightweight-charts"
import { createSignal, For, JSXElement, Match, onCleanup, onMount, Show, splitProps, Switch } from "solid-js"
import { charting_pane } from "../../src/charting_frame/charting_pane"
import { VertLineController } from "../../src/charting_frame/primitive-plugins/one-point-primitives/vert_line_controller"
import { DateStringToUnix, UnixToString } from "../../src/types"
import { location_reference, OverlayCTX, OverlayDiv, point } from "../window/overlay_manager"
import { ColorInput } from "./color_picker"
import { Icon, icons, TextIcon } from "./icons"
import { NavigatorMenu } from "./navigator_menu"


type ValueOf<T> = T[keyof T]
type OptionTypeMap = {
    // group: {[key:string]: inline | MenuEntry}
    // inline: {[key:string]: MenuEntry}
	boolean:  boolean;
	string:   string;
	number:   number;
    range:    number;
	enum:     string[];
	color:    string;             // rgba() or hex
	source:   string;             // "[indicator_id]:[output_function_name]"
	timestamp: string | number;   // Unix or ISO timestamp
}
 
/**
 * Menu_struct is a nested object whose structure defines how input options should be grouped
 * and what input type each argument is.
 * 
 * Each entry into a menu_struct takes the form {[key:string]: OptionParams }
 * The key of each is the variable name and it must be unique.
 * 
 * the OptionParams is a length 2 list, The first index is the type in the form of a string,
 * e.g. 'boolean' / 'number' / 'color' ...etc. 
 * 
 * The second entry is an object of additional parameters. See inputParams interface for 
 * list of all available options. e.g. 'range' would have keys for max / min / step
 * 
 * An Entry In the menu_struct can be any of the input data types, 'group', or 'inline'
 * 
 * 'group' Entries' params are a nested menu_struct that cannot contain another group.
 * 
 * 'Inline' Entries' params are a nested menu_struct that cannot contain a group or inline.
 * 
 * An Example of a Menu Struct can be seen @ EOF
 */
type menuStruct = object
type optionObject = {[key: string]: any}
type optionMenuTuple = [menuStruct | undefined, optionObject, (options:optionObject) => void]
type optionsTab = ( () => JSXElement ) | optionMenuTuple | undefined

/**
 * @id : Id of the overlayDiv that will be created.
 * @title : Title to appear in the header of the overlay window.
 * @tabs : Key:Value Pairs mapping each Tab menu to a JSXElement Constructor, or to an array of [Options Menu Struct, current options, Submit function].
 *         MenuStruct/Option/submit function pairs are constructed using <OptionsMenu/> Elements. The Submit function is passed all the
 *         options listed in the menuStruct as a single flat object of Key:value pairs.
 *         if either the tab's value or the menuStruct at index 0 is undefined, the tab will be ignored.
 */
interface options_menu_props {
    id: string
    title: string
    tabs: {[key: string]: optionsTab},
    pane: charting_pane
}

/**
 * Helper Function that attaches the desired to OptionsMenu to the screen and handles 
 * oneShot cleanup. Call Anytime you wish to show the desired menu.
 */
export function generateOptionsMenu(props:options_menu_props){
    OverlayCTX().attachOverlay(
        props.id,
        () => <OptionsMenu {...props}/>,
        true, //Show Display
        false //Auto Hide
    )
}

function OptionsMenu(props:options_menu_props){
    const [location, setLocation] = createSignal<point>({x:0, y:0})
    const position_menu = () => {setLocation({x:window.innerWidth*0.7, y:window.innerHeight*0.2})}

    let compiled_tabs:{[key:string]: () => JSXElement } = {}
    for (const [key, value] of Object.entries(props.tabs)) {
        if (Array.isArray(value)){
            let _ms = value[0]
            if (_ms)  
                compiled_tabs[key] = () => <OptionsForm 
                    id = {props.id}
                    pane = {props.pane} 
                    menu_struct = {_ms} 
                    options = {value[1]} 
                    on_submit = {value[2]} 
                />
        }
        else if (value !== undefined)
            compiled_tabs[key] = value
    }

    //The following call requires that the overlayCTX.attachOverlay() must always be given an element generating function
    const displaySetter = OverlayCTX().getDisplaySetter(props.id)
    const close_menu = () => displaySetter(false)
    
    return (
        <OverlayDiv
            id={props.id}
            oneShot={true} // Always clean these up once closed
            location={location}
            setLocation={setLocation}
            classList={{options_menu:true}}
            location_ref={location_reference.CENTER}
            updateLocation={position_menu}
            drag_handle={`#${props.id}>.title_box`}
            bounding_client_id={`#${props.id}>.title_box`}
        >
            <div class="title_box">
                <h2>{props.title}</h2>
                <Icon icon={icons.close} force_reload={true} onClick={close_menu}/>
            </div>

            <NavigatorMenu
                overlay_id={props.id}
                style={{padding:"2px 6px", margin:"12px", "margin-top":'0px', "border-bottom":"2px solid var(--background-fill)"}}
                tabs={compiled_tabs}
            />
        </OverlayDiv>
    )
}

// #region --------------------- Inputs Form ----------------------- */

/**
 * INPUT FORM Section:: Creates and parses a UI Options Menu to set the user input
 * options for a given indicator.
 */

/**
 * @param menu_struct: Defines structure of the menu the Name of each propery ( group / inline / option )
 * The structure is defined by the structure of the object (1:1 mapping); the Name of each is the key.
 * i.e. {'myarg': ['boolean', True] } Where 'True' would be the default value given at compile time
 * and 'boolean' can be replaced by any key in 'MenuEntryTypeMap'. 
 * 
 * @param options: is the flat options object mapping each object key to it's current value. 
 * Groups and Inlines are not included in the options_obj.
 * 
 * @param pane: Charting_pane object associated with the object creating the options menu. Allows the options
 * menu to attach primitives that can be used to control a values' variable in addition to the form controls.
 */
interface options_form_props {
    id: string
    pane: charting_pane
    on_submit: (options: optionObject) => void
    menu_struct: object
    options: optionObject
}

/** Form to wrap around all of the generated options inputs */
function OptionsForm(props:options_form_props){
    const [passDown,] = splitProps(props, ['options', 'pane', 'id'])

    let form = document.createElement('form')
    const requestSubmit = () => form.requestSubmit()
    const wrappedSubmit = (e:Event) => {
        let opts = packageInput(e)
        if (opts)
            props.on_submit(opts)
    }

    return <div class="form_wrapper">
        <form 
            ref={form}
            class='input_form'
            onSubmit={wrappedSubmit}
            onKeyPress={(e) => {if(e.key === "Enter") requestSubmit()}}
        >
            <For each={Object.entries(props.menu_struct)}>{([key, [type, params]]) => 
                <Switch fallback={<>
                        <Input key={key} type={type} params={params} requestSubmit={requestSubmit} {...passDown}/>
                    </>}>
                    <Match when={type === "group"}>
                        <Group title={key} params={params} requestSubmit={requestSubmit} {...passDown}/>
                    </Match>
                    <Match when={type === "inline"}>
                        <Inline title={key} params={params} requestSubmit={requestSubmit} {...passDown}/>
                    </Match>
                </Switch>
            }</For>
        </form>
        <div class="footer">
            <input type="submit" value={"Apply"} onclick={requestSubmit}/>
        </div>
    </div>
}

/**
 * Invoked when the form is submitted, It query's all <input/> tags and uses the [#Id : Value] of each to
 * construct an object of the new options to be sent back to Python.
 */
function packageInput(e:Event): optionObject | undefined {
    e.preventDefault();
    if (e.target !== null){
        let nodes = Array.from((e.target as HTMLFormElement).querySelectorAll("input, select"))
        //Filter out all the input tags within the Color Picker. (they're id-less)
        nodes = nodes.filter((node) => node.id !== "") 

        return Object.fromEntries(
            Array.from(nodes as HTMLInputElement[], (node) => {
                switch(node.getAttribute('type')){
                    case ("checkbox"): return [node.id, node.checked]
                    case ("number"): case("range"): return [node.id, parseFloat(node.value)]
                    case ("datetime-local"): return [node.id, DateStringToUnix(node.value)]
                    case ("point"): return [node.id, JSON.parse(node.value)]
                    default: return [node.id, node.value]
                }
            })
        )
    }
}

// #region --------------------- Group and Inline Els ----------------------- */

interface section_props {
    id: string
    pane: charting_pane
    title: string
    params: object
    options: optionObject
    requestSubmit: () => void
}

function Group(props:section_props){
    const [passDown,] = splitProps(props, ["options", "requestSubmit", "pane", 'id'])
    return  (
        <div class="group">
            <h3 innerText={props.title}/>
            <For each={Object.entries(props.params)}>{([key, [type, params]]) => 
                <Switch fallback={<>
                        <Input key={key} type={type} params={params} {...passDown}/>
                    </>}>
                    <Match when={type === "inline"}>
                        <Inline title={key} params={params} {...passDown} />
                    </Match>
                </Switch>
            }</For>
        </div>
    )
}

function Inline(props:section_props){
    const [passDown,] = splitProps(props, ["options", "requestSubmit", "pane", 'id'])
    return  (
        <div class="inline">
            <For each={Object.entries(props.params)}>{([key, [type, params]]) => 
                <Input key={key} type={type} params={params} {...passDown}/>
            }</For>
        </div>
    )
}

//#endregion

// #region --------------------- Generic Input El ----------------------- */

interface input_switch_props extends input_props {type:string}
interface input_props {
    id: string
    key: string
    pane: charting_pane
    params: inputParams
    options: optionObject
    requestSubmit: () => void
}

//The following interface is a catch all for anything the Indicator Options 
//Metaclass _parse_arg[_param] functions throw into the menu_struct for each argument
interface inputParams {
    title: string
    default : any
    autosend: boolean
    tooltip?: string
    options?: Array<any>

    src_type?: string

    min?: number
    max?: number
    step?: number
    error?: boolean
    slider?: boolean
    controller?: boolean
}

function Input(props: input_switch_props){
    const [,inputProps] = splitProps(props, ['type'])

    return <div class="input_block">
        <label for={props.key} innerText={props.params.title + (props.params.title !== ""? ": ": "")}/>
        <Show when={props.params.options && props.type !== "enum"}>
            <datalist id={props.key + "_datalist"}>
                <For each={props.params.options}>{(option) =>
                    <option value={option}/>
                }</For>
            </datalist> 
        </Show>
        <Switch>
            <Match when={props.type === "bool"}><BoolInput {...inputProps}/></Match>
            <Match when={props.type === "enum"}><EnumInput {...inputProps}/></Match>
            <Match when={props.type === "point"}><PointInput {...inputProps}/></Match>
            <Match when={props.type === "source"}><SourceInput {...inputProps}/></Match>
            <Match when={props.type === "number"}><NumberInput {...inputProps}/></Match>
            <Match when={props.type === "string"}><StringInput {...inputProps}/></Match>
            <Match when={props.type === "timestamp"}><TimeInput {...inputProps}/></Match>
            <Match when={props.type === "color"}><ColorInputWrap {...inputProps}/></Match>
        </Switch>
        <Show when={props.params.tooltip}>
            <span class="tooltip">
                <TextIcon text="?"/>
                <span class="tooltiptext" innerHTML={props.params.tooltip}/>
            </span>
        </Show>
    </div>
}

//#endregion

// #region --------------------- Specific Input Types ----------------------- */

function BoolInput(props: input_props){
    return <input 
        id={props.key} 
        type="checkbox"
        checked={(props.options[props.key] ?? props.params.default) ?? false}
        onInput={props.params.autosend? props.requestSubmit: undefined}
    />
}

function StringInput(props: input_props){
    return <input 
        id={props.key} 
        type="text" 
        value={props.options[props.key]  ?? props.params.default } 
        onInput={props.params.autosend? props.requestSubmit: undefined}
    />
}

function PointInput(props: input_props){
    let time_ref = document.createElement('input')
    let value_ref = document.createElement('input')
    let object_ref = document.createElement('input')

    let input_pt = props.options[props.key] ?? props.params.default
    let step = props.params.step ?? 0.01 // default to 0.01 accuracy
    let rounded_val = Math.round((input_pt.value) * 1/step) * step 

    const updateHiddenTag = () => {
        const pt = {
            time: DateStringToUnix(time_ref.value),
            value: parseFloat(value_ref.value)
        }
        object_ref.value = JSON.stringify(pt)
        if (props.params.autosend) props.requestSubmit()
    }

    return <div class="input_block">
        {/* Invisible Input Tag that actually gets read when the input is packaged */}
        <input 
            id={props.key}
            ref={object_ref}
            style={{display:"none"}}
            type="point" // Defaults to a string type since 'point' isn't known.
            value={JSON.stringify(input_pt)}
        />

        {/* Visible Time & Value input tags. Tags get filtered out of the form @ submit since id='' */}
        <span innerText={'{ Time:'}/>
        <input 
            ref={time_ref}
            type="datetime-local"
            value={UnixToString(input_pt.time)}
            onInput={updateHiddenTag}
        />
        <span innerText={' Value:'}/>
        <input 
            ref={value_ref}
            type="number"
            value={rounded_val}
            max={props.params.max}
            min={props.params.min}
            step={props.params.error ? step : 'any'}
            onInput={updateHiddenTag}
        />
        <span innerText={' }'}/>
    </div>
}

function TimeInput(props: input_props){
    const [ref, setRef] = createSignal<HTMLInputElement | undefined>()
    let defaultTime = props.options[props.key] ?? props.params.default

    if (props.params.controller) {
        // TODO: This only works at the moment because it's only pulling the time. If it were to pull the price
        // then it would break once the orinating primitve and this primitive are placed on two different price scales.
        let controller = new VertLineController(
            props.id + '_' + props.key +'_cntrlr', 
            {
                p1: {time: defaultTime, value: 0},
                autosend: props.params.autosend,
                submit: props.requestSubmit,
                update: (time:Time) => {
                    const _ref = ref()
                    if (!_ref) return 
                    
                    _ref.value = UnixToString(time as number)
                    if (props.params.autosend) props.requestSubmit() 
                }
            }
        )

        onMount(() => props.pane._attachSeriesPrimitive(controller))
        onCleanup(() => controller.remove())
    }

    return <input 
        id={props.key}
        ref = {setRef} 
        type="datetime-local" 
        value={UnixToString(defaultTime)}
        onInput={props.params.autosend? props.requestSubmit : undefined}
    />
}

function NumberInput(props: input_props){    
    let input_val = props.options[props.key] ?? props.params.default
    let step = props.params.step ?? 0.01 // default to 0.01 accuracy
    let rounded_val = Math.round((input_val) * 1/step) * step 

    return (
        <input id={props.key}  type={props.params.slider ? 'range' : 'number'}
            value={rounded_val}
            max={props.params.max}
            min={props.params.min}
            step={props.params.error ? step : 'any'} // Only Error if desired.
            list={props.params.options ? props.key + "_datalist" : undefined}
            onInput={props.params.autosend? props.requestSubmit : undefined}
        />
    )
}

function EnumInput(props: input_props){
    return <span class="select-span">
        <select
            id={props.key} 
            onInput={props.params.autosend? props.requestSubmit: undefined}
        >
            <For each={props.params.options}>{(option) =>
                <option 
                    value={option}
                    innerText={option}
                    selected={option == (props.options[props.key] ?? props.params.default)? true : undefined}
                />
            }</For>
        </select>
        <Icon icon={icons.menu_arrow_ns}/>
    </span>
}

function ColorInputWrap(props: input_props){
    return (
        <ColorInput 
            id={props.key}
            input_id={props.key} 
            init_color={props.options[props.key] ?? props.params.default}
            class="color_input_wrapper"
            onInput={props.params.autosend? props.requestSubmit: undefined}
        />
    )
}

function SourceInput(props: input_props){
    return <span class="select-span">
        <select 
            id={props.key} 
            attr:type="source" 
            onInput={props.params.autosend? props.requestSubmit: undefined}
        >
            {/* <For each={props.sources()}>{({indicator, function_name, source_type}) => {
                if (props.indicator_id === indicator.id)
                    return // Skip Sources from Self
                else if (
                    source_type !== props.params.src_type 
                    && (source_type !== "any" && props.params.src_type !== "any")
                )
                    return // Skip Mismatched Source Data Types if either d_type isn't any
                else {
                    let src_string = [indicator.id, function_name].join(":")
                    return (
                        <option value={src_string}
                            innerText={[indicator.type,indicator.name,function_name].join(":")}
                            selected={src_string == props.options[props.key]? true : undefined}
                        />
                    )
                }
            }
            }</For> */}
        </select>
        <Icon icon={icons.menu_arrow_ns}/>
    </span>
}

// #endregion

// #endregion

// #region --------------------- Example Menu Struct ----------------------- */

// const EXAMPLE_STRUCT = {
//     "Display Series": [
//         "group",
//         {
//             "series_type": [
//                 "enum",
//                 {
//                     "default": "Rounded_Candle",
//                     "tooltip": null,
//                     "options": [
//                         "Line",
//                         "Area",
//                         "Baseline",
//                         "Histogram",
//                         "Bar",
//                         "Candlestick",
//                         "Rounded_Candle"
//                     ],
//                     "autosend": true,
//                     "title": "Series Type"
//                 }
//             ]
//         }
//     ],
//     "Volume Series": [
//         "group",
//         {
//             "vol_price_axis": [
//                 "string",
//                 {
//                     "default": "vol",
//                     "tooltip": "Press Enter to Commit Change",
//                     "options": null,
//                     "autosend": false,
//                     "title": "Price Axis"
//                 }
//             ],
//             "a": [ // The name of an inline isn't displayed, so it simply shouldn't collide with another name.
//                 "inline",
//                 {
//                     "vol_scale_invert": [
//                         "bool",
//                         {
//                             "default": false,
//                             "tooltip": null,
//                             "options": null,
//                             "autosend": true,
//                             "title": "Invert"
//                         }
//                     ],
//                     "vol_scale_margin": [
//                         "number",
//                         {
//                             "default": 75,
//                             "tooltip": null,
//                             "options": null,
//                             "autosend": true,
//                             "title": "Scale Margin",
//                             "min": 0,
//                             "max": 100,
//                             "step": null,
//                             "slider": null
//                         }
//                     ]
//                 }
//             ],
//             "b": [
//                 "inline",
//                 {
//                     "color_vol": [
//                         "bool",
//                         {
//                             "default": true,
//                             "tooltip": null,
//                             "options": null,
//                             "autosend": true,
//                             "title": "Color Vol"
//                         }
//                     ],
//                     "up_color": [
//                         "color",
//                         {
//                             "default": "rgba(38,166,154,1)",
//                             "tooltip": null,
//                             "options": null,
//                             "autosend": true,
//                             "title": "Up "
//                         }
//                     ],
//                     "down_color": [
//                         "color",
//                         {
//                             "default": "rgba(239,83,80,1)",
//                             "tooltip": null,
//                             "options": null,
//                             "autosend": true,
//                             "title": "Down "
//                         }
//                     ]
//                 }
//             ],
//             "vol_opacity": [
//                 "number",
//                 {
//                     "default": 50,
//                     "tooltip": null,
//                     "options": null,
//                     "autosend": true,
//                     "title": "Opacity",
//                     "min": 0,
//                     "max": 100,
//                     "step": 5,
//                     "slider": true
//                 }
//             ]
//         }
//     ]
// }

// #endregion