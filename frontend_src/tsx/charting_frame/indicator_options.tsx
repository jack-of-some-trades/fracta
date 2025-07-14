/**
 * Indicator Options Menu. This Integrates directly with a Python Indicator Options Dataclass.
 * The Menu_struct that is generated on Python Sub-class initilization is decomposed here to 
 * generate the UI Menu that allows manipulation of Indicator Input Variables.
 */
import { createSignal, For, Match, Show, splitProps, Switch } from "solid-js"
import { indicator } from "../../src/charting_frame/indicator"
import { SeriesBase_T } from "../../src/charting_frame/series-plugins/series-base"
import { ColorInput } from "../generic_elements/color_picker"
import { Icon, icons, TextIcon } from "../generic_elements/icons"
import { NavigatorMenu } from "../generic_elements/navigator_menu"
import { location_reference, overlay_div_props, OverlayDiv, point } from "../window/overlay_manager"
import { SeriesStyleEditor } from "./series_style_editor"

/**
 * @close_menu : Callable to the close Options Menu
 * @parent_ind : Parent indicator Object.
 * @menu_strict : Multi-level dictionary that stores group, inline, and input type information.
 *                Deconstruction of this object directly generates the visible menu
 * @options : Key:Value Pairs of the options that will be displayed. This is a 1:1 mapping of the
 *            Indicator Options Dataclass variables and values
 * @sources : Reactive List of all the data sources within the frame. This is used to generate a
 *            Data source options <select/> List
 * @*_ids : JS Ids that are packaged with the selected options and returned to python. The Ids
 *          are used to address the options to the correct indicator that needs to be updated.
 */
type options_obj = {[key:string]: any}
interface indicator_option_props extends Omit<overlay_div_props, "location_ref" | "location">{
    close_menu: ()=>{}
    parent_ind:indicator

    menu_struct: object
    options: options_obj
    container_id:string
    frame_id:string
    indicator_id:string
}

export function IndicatorOpts(props:indicator_option_props){
    const [location, setLocation] = createSignal<point>({x:0, y:0})
    const position_menu = () => {setLocation({x:window.innerWidth*0.7, y:window.innerHeight*0.2})}

    const StyleFormProps = {
        series:props.parent_ind.series, 
    }
    const [InputFormProps,] = splitProps(props, ['id', 'parent_ind', 'menu_struct', 'options', 'container_id', 'frame_id', 'indicator_id', 'parent_ind'])
    
    return (
        <OverlayDiv
            id={props.id}
            location={location()}
            setLocation={setLocation}
            classList={{indicator_opts:true}}
            location_ref={location_reference.CENTER}
            updateLocation={position_menu}
            drag_handle={`#${props.id}>.title_box`}
            bounding_client_id={`#${props.id}>.title_box`}
        >
            <div class="title_box">
                <h2>{props.parent_ind.type + " • " + props.parent_ind.name + (props.parent_ind.name !== '' ? " • " : '' )  + "Options"}</h2>
                <Icon icon={icons.close} force_reload={true} onClick={props.close_menu}/>
            </div>

            <NavigatorMenu
                overlay_id={props.id}
                style={{padding:"2px 6px", margin:"12px", "margin-top":'0px', "border-bottom":"2px solid var(--background-fill)"}}
                tabs={{
                    "Inputs":()=><InputForm {...InputFormProps}/>,
                    "Style":()=><SeriesEditor {...StyleFormProps}/>,
                }}
            />
        </OverlayDiv>
    )
}

// #region --------------------- Inputs Form ----------------------- */
/**
 * INPUT FORM Section:: Creates and parses a UI Options Menu to set the user input
 * options for a given indicator.
 */

interface input_form_props {
    menu_struct: object
    container_id: string
    frame_id: string
    indicator_id: string
    parent_ind: indicator
    options: options_obj
}

/** Form to wrap around all of the generated options inputs */
function InputForm(props:input_form_props){
    const [passDown,] = splitProps(props, ['options', 'parent_ind', 'indicator_id'])

    let form = document.createElement('form')
    const submit = () => form.requestSubmit()
    const boundSubmit = onSubmit.bind(
        undefined, 
        props.container_id, 
        props.frame_id, 
        props.parent_ind
    )

    return <div class="form_wrapper">
        <form 
            ref={form}
            class='input_form'
            onSubmit={boundSubmit}
            onKeyPress={(e) => {if(e.key === "Enter") submit()}}
        >
            <For each={Object.entries(props.menu_struct)}>{([key, [type, params]]) => 
                <Switch fallback={<>
                        <Input key={key} type={type} params={params} submit={submit} {...passDown}/>
                    </>}>
                    <Match when={type === "group"}>
                        <Group title={key} params={params} submit={submit} {...passDown}/>
                    </Match>
                    <Match when={type === "inline"}>
                        <Inline title={key} params={params} submit={submit} {...passDown}/>
                    </Match>
                </Switch>
            }</For>
        </form>
        <div class="footer">
            <input type="submit" value={"Apply"} onclick={submit}/>
        </div>
    </div>
}

/**
 * Generic Submit function, Each menu binds the first three arguments. This is invoked when
 * the form is submitted, It query's all <input/> tags and uses the [#Id : Value] of each to
 * construct an object of the new options to be sent back to Python.
 */
function onSubmit(c_id:string, f_id:string, ind:indicator, e:Event){
    e.preventDefault();
    if (e.target !== null){
        let nodes = Array.from((e.target as HTMLFormElement).querySelectorAll("input, select"))
        //Filter out all the input tags within the Color Picker. (they're id-less)
        nodes = nodes.filter((node) => node.id !== "") 

        let packaged_input = Object.fromEntries(
            Array.from(nodes as HTMLInputElement[], (node) => {
                switch(node.getAttribute('type')){
                    case ("checkbox"): return [node.id, node.checked]
                    case ("number"): case("range"): return [node.id, parseFloat(node.value)]
                    default: return [node.id, node.value]
                }
            })
        )
        //One of the few times a change in JS is directly applied to the JS object
        ind.applyOptions(packaged_input)
        window.api.set_indicator_options( c_id, f_id, ind.id, packaged_input)
    }
}

// #region --------------------- Group and Inline Els ----------------------- */

interface section_props {
    title: string
    params: object
    options: options_obj
    indicator_id:string,
    submit: () => void,
}
function Group(props:section_props){
    const [passDown,] = splitProps(props, ["options", "indicator_id", "submit"])
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
    const [passDown,] = splitProps(props, ["options", "indicator_id", "submit"])
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
    key:string, 
    indicator_id:string,
    params:input_params, 
    options:options_obj,
    submit: () => void,
}
//The following interface is a catch all for anything the Indicator Options 
//Metaclass _parse_arg[_param] functions throw into the menu_struct for each argument
interface input_params {
    title: string
    default : any   //This has no current use, but it is available 
    autosend: boolean
    tooltip?: string
    options?: Array<any>

    src_type?: string

    min?: number
    max?: number
    step?: number
    slider?: boolean
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

// #region --------------------- Util Functions ----------------------- */

function padZeros (num:number){ return String(num).padStart(2,'0') }
function UnixToString(timestamp: number){ 
    let d = new Date(timestamp * 1000)
    return [
        d.getUTCFullYear(), "-",
        padZeros(d.getUTCMonth() + 1) , "-",
        padZeros(d.getUTCDate()), "T",
        padZeros(d.getUTCHours()), ":",
        padZeros(d.getUTCMinutes())
    ].join("")
}

//#endregion

// #region --------------------- Specific Inputs ----------------------- */

function BoolInput(props: input_props){
    return <input 
        id={props.key} 
        type="checkbox" 
        checked={props.options[props.key] ?? false}
        onInput={props.params.autosend? props.submit: undefined}
    />
}

function StringInput(props: input_props){
    return <input 
        id={props.key} 
        type="text" 
        value={props.options[props.key]} 
        onInput={props.params.autosend? props.submit: undefined}
    />
}

function TimeInput(props: input_props){
    return <input 
        id={props.key} 
        type="datetime-local" 
        value={UnixToString(props.options[props.key])}
        onInput={props.params.autosend? props.submit: undefined}
    />
}

function NumberInput(props: input_props){
    return (
        <input id={props.key}  type={props.params.slider ? 'range' : 'number'}
            value={props.options[props.key]}
            max={props.params.max}
            min={props.params.min}
            step={props.params.step}
            list={props.params.options ? props.key + "_datalist" : undefined}
            onInput={props.params.autosend? props.submit: undefined}
        />
    )
}

function EnumInput(props: input_props){
    return <span class="select-span">
        <select
            id={props.key} 
            onInput={props.params.autosend? props.submit: undefined}
        >
            <For each={props.params.options}>{(option) =>
                <option 
                    value={option}
                    innerText={option}
                    selected={option == props.options[props.key]? true : undefined}
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
            init_color={props.options[props.key]}
            class="color_input_wrapper"
            onInput={props.params.autosend? props.submit: undefined}
        />
    )
}

function SourceInput(props: input_props){
    return <span class="select-span">
        <select 
            id={props.key} 
            attr:type="source" 
            onInput={props.params.autosend? props.submit: undefined}
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
//#endregion

// #endregion


// #region --------------------- Series Style Selector Forms ----------------------- */

/**
 * Style FORM Section:: Creates a form for each Series applied to the Indicator. Allows for the
 * series options to be directly manipulated via the GUI
 */

interface series_editor_props {
    series: Map<string, SeriesBase_T>
}

function SeriesEditor(props: series_editor_props){
    let style_wrapper = document.createElement('div')

    const submitAll = () => {
        style_wrapper.querySelectorAll('form').forEach(form => form.requestSubmit());
    }

    return <div ref={style_wrapper} class="form_wrapper">
        <For each={Array.from(props.series.entries())}>{([_id, type], i) => {
            let series = props.series.get(_id)
            if (series === undefined) return
            return <SeriesStyleEditor series={series} name={series._name ?? `Series #${i() + 1}`}/>
        }}</For>
        <div class="footer">
            <input type="submit" value={"Apply"} onClick={submitAll}/>
        </div>
    </div>
}

// #endregion