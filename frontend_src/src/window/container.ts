import { Accessor, Setter } from "solid-js"
import { ContainerCTX } from "../../tsx/window/container"
import { layout_display } from "../../tsx/window/layouts"
import { charting_frame } from "../charting_frame/charting_frame"
import { abortToolCreation } from "../charting_frame/primitive-plugins/tool_ui_support"
import { frame } from "./frame"
import { Container_Layouts, flex_frame as flexFrame, layout_switch, num_frames, Orientation, resize_sections } from "./layouts"

export type updateTabFunc = (
    title?: string,
    price?: string,
    favicon?: string
) => void


// This Must Match FrameTypes Enum in window.py
type frame_subclasses = typeof charting_frame
const FrameTypes:{[key:number]: frame_subclasses} = {
    2: charting_frame
}

/**
 * Class to hold information on a single layout and a set of Frames. Multiple instances
 * can be created, though, all instances share the same Container.tsx Element. TSX Element
 * is controlled through the Context Functions
 */
export class container{
    id: string
    layout: Container_Layouts | undefined

    frames: frame[] = []
    display: layout_display[] = []
    flexFrames: flexFrame[] = []

    divRect: Accessor<DOMRect>
    setStyle: Setter<string>
    setDisplay: Setter<layout_display[]>

    updateTab: updateTabFunc

    constructor(
        id:string, 
        updateFunc:updateTabFunc
    ) {
        this.id = id
        this.updateTab = updateFunc

        this.divRect = ContainerCTX().getSize
        this.setStyle = ContainerCTX().setStyle
        this.setDisplay = ContainerCTX().setDisplay
    }

    onShow(){
        this.setDisplay(this.display)
        if (this.layout !== undefined) window.topbar.setLayout(this.layout)
        for(let i = 0; i < num_frames(this.layout);i++) this.frames[i].onShow() 
    }
    onHide(){ 
        for(let i = 0; i < num_frames(this.layout);i++) this.frames[i].onHide() 
        
        // TODO: This should be a solidJS effect in tools_ui, but until the
        // activeContainer and activeFrame are signals this is far more simple
        abortToolCreation()
    }
    remove(){ }

    /**
     * Resize all the child Elements based on the size of the container's Div. 
     */
    refreshSize(container_rect?:DOMRect) {
        // Calculate the new sizes of all the frames
        resize_sections(container_rect? ()=>container_rect : this.divRect, this.flexFrames)

        // Put all the resizing info into a style tag. Long-story short, putting this info into
        // a reactive 'style' tag for each JSX.Element div is a damn pain.
        let style = ""
        this.flexFrames.forEach((frame, i) => {
            style += `
            div.frame:nth-child(${i+2})${frame.style}`
        })
        this.setStyle(style)
        this.refreshFrameSizes()
    }

    private refreshFrameSizes(){
        // Resize all contents of each *visible* Frames. 
        // This is in an animation frame to ensure whatever Style Change Invoked the resize takes effect first
        requestAnimationFrame(()=>{
            for (let i = 0; i < num_frames(this.layout); i++)
                this.frames[i].refreshSize()
        })
    }

    /**
     * Called by Python when creating a Frame. Returns the new Frame so it can be made a global var.
     * TODO: Make this instantiate an Abstract Frame that can be transmuted into a Chart_Frame
     * Will Require a UI Element for display and Frame type Selection. Alternatively, set up a
     * add_[type]_frame method for each type of frame and don't allow frame type manipulation.
     */
    protected add_frame(new_id: string, type:number): frame {
        //Logging an error instead of throwing one because when thrown nothing is displayed in the console.
        if (type == 1) console.error('Cannot Create an instance of an Abstract Frame')

        let new_frame = new FrameTypes[type](new_id, this.updateTab)
        this.frames.push(new_frame)
        return new_frame
    }

    /**
     * Delete a frame from this container. This function assumes that python has already checked that
     * the current layout needs fewer frames than the current number of frames that exist. It also
     * assumes that python will remove the global reference to this frame so it can be garbage collected.
     */
    protected remove_frame(frame_id:string){
        let frame_index = this.frames.findIndex((f) => f.id === frame_id)
        if (frame_index === -1) return
        this.reorderFrames(frame_index, this.frames.length - 1)

        //@ts-ignore
        this.frames[this.frames.length - 1] = undefined
        this.frames.length = this.frames.length - 1
        //This is done again so that the Frame_Viewer Widget panel updates to reflect the deleted frame.
        this.setDisplay([])
        this.setDisplay(this.display)
    }

    /** 
     * Create and configure all the necessary frames & separators for a given layout.
     * protected => should only be called from python
     */
    protected set_layout(layout: Container_Layouts) {
        // ------------ Create Layout Template ------------
        this.flexFrames = layout_switch(layout, this.divRect, this.refreshSize.bind(this))
        let layout_displays:layout_display[] = []

        // ------------ Reorder the list of frames based on target Els ------------ //
        // Todo: query the list of targeted frames and reorder this.frames[] so that
        // those target frames are the ones that will be displayed first after the
        // layout change. 

        // ------------ Set mouseDown in each flex_frame that holds a display ------------
        let frame_ind = 0
        this.flexFrames.forEach((flex_frame) => {
            if (flex_frame.orientation === Orientation.null) { // Frame Object
                if (frame_ind < this.frames.length) {
                    let frame = this.frames[frame_ind]
                    flex_frame.mouseDown = frame.assignActiveFrame.bind(frame)

                    layout_displays.push({
                        orientation:flex_frame.orientation, 
                        mouseDown:flex_frame.mouseDown,
                        element:frame.element,
                        el_active:frame.active, 
                        el_target:frame.target
                    })
                } else throw new Error("Not Enough Frames to change to the desired layout")

                frame_ind += 1
                //frame_ind tracks the equivelent frames[] index based on
                //how many chart frames have be observed in the flex_frames[] loop
            } else {                                            // Separator Object
                layout_displays.push({
                    orientation:flex_frame.orientation,
                    mouseDown:flex_frame.mouseDown,
                    element:undefined,
                    el_active:()=>false, 
                    el_target:()=>false
                })
            }
        })
        
        // ------------ Apply the new Display to the <Container/> ------------
        this.layout = layout
        this.setDisplay(layout_displays)
        this.display = layout_displays

        //Calculate the flex_frame rect sizes, and set them to the Display Signal
        this.refreshSize()

        //If succsessful, update container variable and UI
        window.topbar.setLayout(layout)
    }

    reorderFrames(from:number, to:number){
        this.frames.splice(to, 0, ...this.frames.splice(from, 1))

        //Construct new layout_displays for the moved frames
        //(i*2) only works because the display[] is ordered and alternates frames/Separators
        for(let i = Math.min(from, to); i*2 < this.display.length; i++){
            let frame = this.frames[i]
            this.display[i*2] = {
                orientation:Orientation.null, 
                mouseDown:frame.assignActiveFrame.bind(frame),
                element:frame.element,
                el_active:frame.active, 
                el_target:frame.target
            }
        }

        //Layout <for/> is keyed to the array, not the elements. The first call ensures the display is re-rendered
        this.setDisplay([])
        this.setDisplay(this.display)
        this.refreshFrameSizes()
    }
}