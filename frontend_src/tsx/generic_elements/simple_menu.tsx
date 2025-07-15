/**
 * Generic Components for creating Menu Sections, Selectable Items, and Favorite-able Items
 */
import { Accessor, createSignal, JSX, mergeProps, onMount, Show, splitProps } from "solid-js";
import { OverlayCTX } from "../window/overlay_manager";
import { Icon, icons } from "./icons";

//  ***************  Show Overlay Menu Button  *************** //

/**
 * id: query selectable string id
 * icon_act: Base icon to show when active
 * icon_deact: Icon to show when button is not active. If not present, the icon_act will be rotated 180Deg
 */
interface menu_btn_props extends JSX.HTMLAttributes<HTMLDivElement> {
    id:string
    icon_act:icons
    icon_deact?:icons
}

/**
 * Overlay Menu Show / Hide Button
 */
export function ShowMenuButton(props:menu_btn_props){
    let el = document.createElement('div')
    const [, divProps] = splitProps(props, ['id', "style", "icon_act", "icon_deact"])

    //Fetch the visibility Accessor and Setter
    const display = OverlayCTX().getDisplayAccessor(props.id)
    const setDisplay = OverlayCTX().getDisplaySetter(props.id)

    //Manually adding event makes stopPropagation work correctly, stopPropogation prevents
    //OverlayManager from Immediately turing around and closing the menu
    onMount(() => { el.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            setDisplay(!display()); 
            e.stopPropagation();
        }
    })})

    if (props.icon_deact)
        return (
            <div {...divProps} ref={el}>
                <Icon 
                    icon={display() ? props.icon_act : props.icon_deact}
                />
            </div>
        )
    else
        return (
            <div {...divProps} ref={el}>
                <Icon 
                    icon={props.icon_act}
                    style={{rotate:display()?'180deg':'0deg'}} 
                />
            </div>
        )
}


//  ***************  Overlay Menu Section   *************** //
interface menu_section_props extends JSX.HTMLAttributes<HTMLDivElement>{
    label:string
    showByDefault:boolean
}
export function MenuSection(props:menu_section_props){
    const [display, setDisplay] = createSignal(props.showByDefault)

    return <>
        <div class='menu_section_titlebox' onClick={() => setDisplay(!display())}>
            <span class='menu_section_text text'>{props.label.toUpperCase()}</span>
            <Icon icon={icons.menu_arrow_sn} style={{rotate:display()? '360deg': '180deg'}}/>
        </div>
        <Show when={display()}>
            <div class='menu_section' style={props.style}>{props.children}</div>
        </Show>
    </>
}



//  ***************  Overlay Menu Item  *************** //
type menu_item_keys = keyof menu_item_props
interface menu_item_props extends JSX.HTMLAttributes<HTMLDivElement> {
    label?: string,
    icon?:icons,

    data?: any,
    onSel?: () => void,

    expand?: boolean

    star?: Accessor<boolean> | undefined,
    starAct?: CallableFunction,
    starDeact?: CallableFunction,
    starStyle?: JSX.CSSProperties,
}

const menuItemPropNames:menu_item_keys[] = [
    "label", "icon", "data",  "onSel", 'expand', 
    "star", "starAct", "starDeact", "starStyle"
] 

export function MenuItem(props:menu_item_props){
    props.classList = mergeProps(props.classList, {menu_item:true})
    if (props.expand === undefined) props.expand = false
    const [menuProps, divProps] = splitProps(props, menuItemPropNames)

    return <div {...divProps}>
        {/* Selectable Portion of Menu Item, Allow it to expand if desired */}
        <span 
            class="menu_selectable" 
            style={{width:menuProps.expand?'-webkit-fill-available':undefined}}
            onclick={(e) => {if (e.button === 0 && props.onSel) props.onSel()}}
            >
            <Show when={menuProps.icon}><Icon icon={menuProps.icon??''}/></Show>
            <Show when={menuProps.label}><span class='menu_text'>{menuProps.label}</span></Show>
        </span>
        
        {/* Star/'Favoritable' Portion of Menu Item */}
        <Show when={menuProps.star !== undefined}>
            <MenuItemStar 
                selected={menuProps.star?.()} 
                starAct={menuProps.starAct} 
                starDeact={menuProps.starDeact}
                style={props.starStyle??{}}
            />
        </Show>
    </div>
}

//  ***************  Menu Item Star  *************** //

interface star_props extends JSX.HTMLAttributes<SVGSVGElement>{
    selected: boolean | undefined,
    style: JSX.CSSProperties,
    starAct?: CallableFunction,
    starDeact?: CallableFunction,
}

function MenuItemStar(props:star_props){
    function toggleState() {
        if (!props.selected && props.starAct) props.starAct()
        else if (props.starDeact) props.starDeact()
    }

    return <Icon 
        class='menu_item_star'
        onClick={(e) => {if (e.button === 0) toggleState()}}
        icon={props.selected? icons.star_filled : icons.star}
        style={props.style}
    />

}