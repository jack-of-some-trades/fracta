/**
 */
import { createSignal, For, JSXElement, Match, Show, splitProps, Switch } from "solid-js"
import { UnixToString } from "../../src/types"
import { location_reference, OverlayDiv, point } from "../window/overlay_manager"
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
 */
type menuStruct = object
type optionObject = {[key: string]: any}

/**
 * @id : Id of the overlayDiv that will be created.
 * @title : Title to appear in the header of the overlay window.
 * @close_menu : Callable to the close the OverlayDiv Menu Created.
 * @on_submit : Function called with the compiled user options passed as a flat object. The options provided are only
 *              for the tab that is visible. Only Tabs that are made with a menu_struct utilize this submit function
 * @tabs : Key:Value Pairs mapping each Tab menu to a menu_struct instructing how to Construct the desired menu.
 *          or an already constructed menu Element.
 * @options : The currently selected options to populate the menus with.
 */
interface options_menu_props{
    close_menu: () => void
    on_submit: (options: optionObject) => void

    id: string
    title: string
    tabs: {[key: string]: menuStruct | ( () => JSXElement )}
    options: optionObject
}

export function OptionsMenu(props:options_menu_props){
    const [location, setLocation] = createSignal<point>({x:0, y:0})
    const position_menu = () => {setLocation({x:window.innerWidth*0.7, y:window.innerHeight*0.2})}

    let compiled_tabs:{[key:string]:()=>JSXElement} = {}
    for (const [key, value] of Object.entries(props.tabs)) {
        if (typeof value === 'object')
            compiled_tabs[key] = () => <OptionsForm menu_struct={value} options={props.options} on_submit={props.on_submit}/>
        else
            compiled_tabs[key] = value
    }
    
    return (
        <OverlayDiv
            id={props.id}
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
                <Icon icon={icons.close} force_reload={true} onClick={props.close_menu}/>
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
 */
interface options_form_props {
    on_submit: (options: optionObject) => void
    menu_struct: object
    options: optionObject
}

/** Form to wrap around all of the generated options inputs */
function OptionsForm(props:options_form_props){
    const [passDown,] = splitProps(props, ['options'])

    let form = document.createElement('form')
    const submit = () => form.requestSubmit()
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
                    default: return [node.id, node.value]
                }
            })
        )
    }
}

// #region --------------------- Group and Inline Els ----------------------- */

interface section_props {
    title: string
    params: object
    options: optionObject
    submit: () => void,
}

function Group(props:section_props){
    const [passDown,] = splitProps(props, ["options", "submit"])
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
    const [passDown,] = splitProps(props, ["options", "submit"])
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
    params:inputParams, 
    options:optionObject,
    submit: () => void,
}

//The following interface is a catch all for anything the Indicator Options 
//Metaclass _parse_arg[_param] functions throw into the menu_struct for each argument
interface inputParams {
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

// #region --------------------- Specific Input Types ----------------------- */

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