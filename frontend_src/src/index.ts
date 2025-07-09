import { render } from 'solid-js/web';
import { Wrapper } from "../tsx/window/wrapper";
import { Series_Type } from './charting_frame/series-plugins/series-base';
import { py_api } from "./py_api";
import { tf } from './types';
import { container } from "./window/container";
import { container_manager } from './window/container_manager';
import { frame } from './window/frame';
import { Container_Layouts } from './window/layouts';

const styles = import.meta.glob('../css/**/*.css', { eager: true });

//Declare Global interface. All Following declarations will be accessable to the python run_script() function
declare global {
    var api: py_api
    var loaded: boolean
    var container_manager: container_manager

    //Allow Global Control over the Topbar Display
    var topbar: {
        setSeries : (_:Series_Type) => void,
        setTimeframe : (_:tf) => void,
        setLayout : (_:Container_Layouts) => void,
        setTicker : (_:string) => void,
    }

    var activeFrame: frame | undefined
    var activeContainer: container
    // Technically Frame & Container can refer to deleted objects if they were the active 
    // elements when they were removed. Beyond delaying some garbage collection,
    // I don't think the dead references are an issue so the behavior will stay for now.
    var Container_Layouts: any
}

//declare global Attributes for JSX objects
declare module "solid-js" {
    namespace JSX {
        interface ExplicitAttributes{
            active: string
            target: string
            type: string
        }
    }
}

// Global Workspace Vars used by Injected JS Commands
var _ind = undefined
var _ser = undefined
// Define The global Python <--> Js api interface.
window.api = new py_api();
//Enums that will be used by Python need to be placed into the Global Scope
window.Container_Layouts = Container_Layouts
//Allow Global Control over the Topbar Display. Functions will be overwritten as window is rendered
window.topbar = {
    setSeries : (_:Series_Type) => {},
    setTimeframe : (_:tf) => {},
    setLayout : (_:Container_Layouts) => {},
    setTicker : (_:string) => {},
}

render(Wrapper, document.body)